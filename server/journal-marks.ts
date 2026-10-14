/**
 * LIVE MARKS for open journal trades (Mine / trader books).
 *
 * An open trade — a Discord-imported call, a broker row with no closing fill —
 * showed "—" for P&L until the trader closed it. This attaches a mark:
 *
 *   stock    canonical quote (market-api fetchStockPrice → Tradier/Yahoo/…)
 *   option   the contract's mid (tradier-api getOptionMark: Tradier → Alpaca → CBOE → Yahoo);
 *            when no venue quotes the contract, the UNDERLYING is returned as a
 *            note and the P&L stays null — an underlying move is not a contract P&L
 *   crypto   market-api fetchCryptoPrice
 *   future   not marked (no reliable continuous-contract quote)
 *
 * Every mark carries its provider and observation time (asOf) so the UI can
 * stamp age — a mark is never presented as live beyond what its age says.
 * Quotes are cached per INSTRUMENT for 30 s (in-flight requests coalesce), so
 * any number of viewers/rows cost ≤1 upstream request per symbol per 30 s.
 * The cache is a registered BoundedCache (memory-guard visible).
 */
import { BoundedCache } from './lib/bounded-cache';

export const MARK_TTL_MS = 30_000;

export interface MarkQuote {
  price: number;
  asOf: string;
  source: string;
  delayed: boolean;
  /** 'quote' (stock/crypto), 'contract' (option mid), 'underlying' (option not quoted). */
  basis: 'quote' | 'contract' | 'underlying';
}

export interface LiveMark extends MarkQuote {
  /** null when the mark cannot price the position (option marked only by its underlying). */
  unrealizedPnL: number | null;
  unrealizedPct: number | null;
  note?: string;
  /** Peak mark since entry — hook for the runners tracker (null until it supplies one). */
  peak?: number | null;
}

export interface MarkableRow {
  id: string; symbol: string; assetType: string; direction: string; status: string;
  quantity: number; entryPrice: number; fees?: number | null;
  optionType?: string | null; strikePrice?: number | null; expiryDate?: string | null;
  /** Recorded peak premium since entry (desk rows: the idea's [peak:…] tag, shared/option-peak.ts). */
  peakPremium?: number | null;
}

export type QuoteFn = (key: string, row: MarkableRow) => Promise<MarkQuote | null>;

const r2 = (v: number) => Math.round(v * 100) / 100;

/** One key per instrument, so ten rows of the same contract cost one quote. */
export function instrumentKey(row: MarkableRow): string | null {
  const sym = String(row.symbol ?? '').trim().toUpperCase();
  if (!sym) return null;
  if (row.assetType === 'future') return null;
  if (row.assetType === 'crypto') return `C:${sym}`;
  if (row.assetType === 'option') {
    const exp = String(row.expiryDate ?? '').slice(0, 10);
    const type = String(row.optionType ?? '').toLowerCase().startsWith('p') ? 'put' : String(row.optionType ?? '').toLowerCase().startsWith('c') ? 'call' : '';
    if (!exp || !type || !(Number(row.strikePrice) > 0)) return `S:${sym}`; // unidentifiable contract → underlying only
    return `O:${sym}|${exp}|${type}|${Number(row.strikePrice)}`;
  }
  return `S:${sym}`;
}

const cache = new BoundedCache<string, { at: number; p: Promise<MarkQuote | null> }>({
  name: 'journal.liveMarks', maxEntries: 2000, ttlMs: 5 * 60_000, noSizing: true,
});

/** ≤1 upstream call per key per MARK_TTL_MS; concurrent callers share the in-flight promise. */
export function cachedQuote(key: string, fetcher: () => Promise<MarkQuote | null>, now = Date.now()): Promise<MarkQuote | null> {
  const hit = cache.get(key);
  if (hit && now - hit.at < MARK_TTL_MS) return hit.p;
  const p = fetcher().catch(() => null);
  cache.set(key, { at: now, p });
  return p;
}
/** Fresh cache entry for a key (in flight or settled), else null. */
export function freshQuote(key: string, now = Date.now()): Promise<MarkQuote | null> | null {
  const hit = cache.get(key);
  return hit && now - hit.at < MARK_TTL_MS ? hit.p : null;
}
/** Seed a key from a batched fetch (server/option-marks-batch.ts) so the per-key path is skipped. */
export function seedQuote(key: string, q: MarkQuote, now = Date.now()): void {
  cache.set(key, { at: now, p: Promise.resolve(q) });
}
export function _clearMarkCache() { cache.clear(); }

async function stockQuote(sym: string): Promise<MarkQuote | null> {
  const { fetchStockPrice } = await import('./market-api');
  const q = await fetchStockPrice(sym);
  if (!q || !(q.currentPrice > 0)) return null;
  return { price: q.currentPrice, asOf: q.fetchedAt ?? new Date().toISOString(), source: q.source ?? 'unknown', delayed: !!q.servedFromCache, basis: 'quote' };
}

/** Default quote path (network). Tests inject their own QuoteFn. */
export const defaultQuote: QuoteFn = async (key) => {
  if (key.startsWith('C:')) {
    const { fetchCryptoPrice } = await import('./market-api');
    const q = await fetchCryptoPrice(key.slice(2));
    if (!q || !(q.currentPrice > 0)) return null;
    return { price: q.currentPrice, asOf: q.fetchedAt ?? new Date().toISOString(), source: q.source ?? 'unknown', delayed: !!q.servedFromCache, basis: 'quote' };
  }
  if (key.startsWith('O:')) {
    const [underlying, expiryDate, optionType, strike] = key.slice(2).split('|');
    const { getOptionMark } = await import('./tradier-api');
    const m = await getOptionMark({ underlying, expiryDate, optionType: optionType as 'call' | 'put', strike: Number(strike) });
    const px = m ? (m.mid > 0 ? m.mid : m.last > 0 ? m.last : null) : null;
    // asOf = the venue's quote time when it sent one (never "now" for an old quote).
    const qt = m?.quoteTime ? Date.parse(m.quoteTime) : NaN;
    if (m && px != null) return { price: px, asOf: Number.isFinite(qt) ? new Date(qt).toISOString() : new Date().toISOString(), source: m.source, delayed: m.delayed, basis: 'contract' };
    const u = await cachedQuote(`S:${underlying}`, () => stockQuote(underlying));
    return u ? { ...u, basis: 'underlying' } : null;
  }
  const u = await stockQuote(key.slice(2));
  return u;
};

function markFor(row: MarkableRow, q: MarkQuote): LiveMark {
  if (q.basis === 'underlying' && row.assetType === 'option') {
    return { ...q, unrealizedPnL: null, unrealizedPct: null, note: `contract not quoted — underlying ${row.symbol.toUpperCase()} $${q.price}` };
  }
  const mult = row.assetType === 'option' ? 100 : 1;
  const sign = row.direction === 'short' ? -1 : 1;
  const qty = Number(row.quantity) || 0;
  const entry = Number(row.entryPrice);
  const pnl = qty > 0 && entry > 0 ? r2((q.price - entry) * qty * mult * sign - (Number(row.fees) || 0)) : null;
  const pct = entry > 0 ? r2(((q.price - entry) / entry) * 100 * sign) : null;
  // LiveMark.peak: best contract mark since entry = max(recorded peak, this mark), once above entry.
  const recorded = Number(row.peakPremium);
  const best = Math.max(Number.isFinite(recorded) ? recorded : -Infinity, q.price);
  const peak = row.assetType === 'option' && q.basis === 'contract' && entry > 0 && best > entry ? r2(best) : null;
  return { ...q, unrealizedPnL: pnl, unrealizedPct: pct, ...(peak != null ? { peak } : {}) };
}

/** Marks for the OPEN rows, keyed by row id. Bounded concurrency, instrument-deduped. */
export async function liveMarksFor(
  rows: MarkableRow[], quote: QuoteFn = defaultQuote, opts: { concurrency?: number; now?: number } = {},
): Promise<Record<string, LiveMark>> {
  return (await liveMarksWithin(rows, quote, { ...opts, budgetMs: Infinity, batch: null })).marks;
}

/** Many option keys → quotes in one go (server/option-marks-batch.ts alpacaBatch); missing keys are simply absent. */
export type BatchFn = (keys: string[]) => Promise<Map<string, MarkQuote>>;

export interface MarksTiming { totalMs: number; batchMs: number | null; keys: number; cached: number; batched: number; perKey: number; pending: number }

/**
 * Quotes for instrument keys within a time budget (NEXUS + journal marks).
 *   1. fresh cache entries (≤ MARK_TTL_MS) are reused — zero upstream calls;
 *   2. option keys not cached go out in ONE batched request (Alpaca snapshots,
 *      ≤100 contracts per call) and seed the cache;
 *   3. whatever the batch did not answer runs the per-key fallback chain
 *      (Tradier → Alpaca → CBOE → Yahoo) with bounded concurrency IN THE
 *      BACKGROUND; keys not settled when the budget runs out come back as
 *      `pending` (the client shows "loading mark" and re-asks — the next call
 *      is served from the cache those background fetches fill).
 */
export async function quotesWithin(
  keys: string[], perKey: (key: string) => Promise<MarkQuote | null>,
  opts: { budgetMs?: number; batch?: BatchFn | null; concurrency?: number; now?: number } = {},
): Promise<{ quotes: Map<string, MarkQuote | null>; pending: string[]; timing: MarksTiming }> {
  const t0 = Date.now();
  const budget = opts.budgetMs ?? 1500;
  const quotes = new Map<string, MarkQuote | null>();
  const proms = new Map<string, Promise<MarkQuote | null>>();
  let cached = 0, batched = 0, batchMs: number | null = null;
  const missing: string[] = [];
  for (const k of Array.from(new Set(keys))) {
    const f = freshQuote(k, opts.now);
    if (f) { proms.set(k, f); cached++; } else missing.push(k);
  }
  const optKeys = missing.filter((k) => k.startsWith('O:'));
  if (opts.batch && optKeys.length) {
    const b0 = Date.now();
    const got = await Promise.race([
      opts.batch(optKeys).catch(() => new Map<string, MarkQuote>()),
      new Promise<Map<string, MarkQuote>>((r) => setTimeout(() => r(new Map()), Math.max(200, Number.isFinite(budget) ? budget * 0.7 : 8000))),
    ]);
    batchMs = Date.now() - b0;
    got.forEach((q, k) => { seedQuote(k, q, opts.now); proms.set(k, Promise.resolve(q)); batched++; });
  }
  const rest = missing.filter((k) => !proms.has(k));
  // Bounded concurrency: a tiny semaphore; the work continues after we return.
  const conc = opts.concurrency ?? 6;
  let active = 0;
  const queue: Array<() => void> = [];
  const gate = <T,>(fn: () => Promise<T>) => new Promise<T>((resolve) => {
    const run = () => { active++; fn().then(resolve, () => resolve(null as T)).finally(() => { active--; queue.shift()?.(); }); };
    if (active < conc) run(); else queue.push(run);
  });
  for (const k of rest) proms.set(k, cachedQuote(k, () => gate(() => perKey(k)), opts.now));
  const settled = new Set<string>();
  const all = Promise.all(Array.from(proms.entries()).map(([k, p]) => p.then((q) => { quotes.set(k, q); settled.add(k); })));
  const left = budget - (Date.now() - t0);
  if (Number.isFinite(left)) await Promise.race([all, new Promise((r) => setTimeout(r, Math.max(0, left)))]);
  else await all;
  const pending = Array.from(proms.keys()).filter((k) => !settled.has(k));
  return { quotes, pending, timing: { totalMs: Date.now() - t0, batchMs, keys: proms.size, cached, batched, perKey: rest.length, pending: pending.length } };
}

/** liveMarksFor with a time budget: marks settled in time + the row ids still loading. */
export async function liveMarksWithin(
  rows: MarkableRow[], quote: QuoteFn = defaultQuote,
  opts: { concurrency?: number; now?: number; budgetMs?: number; batch?: BatchFn | null } = {},
): Promise<{ marks: Record<string, LiveMark>; pending: string[]; timing: MarksTiming }> {
  const open = rows.filter((r) => String(r.status).toLowerCase() === 'open');
  const byKey = new Map<string, MarkableRow[]>();
  for (const r of open) {
    const k = instrumentKey(r);
    if (k) byKey.set(k, [...(byKey.get(k) ?? []), r]);
  }
  const batch = opts.batch === undefined ? (quote === defaultQuote ? defaultBatch : null) : opts.batch;
  const { quotes, pending, timing } = await quotesWithin(Array.from(byKey.keys()), (k) => quote(k, byKey.get(k)![0]), { ...opts, batch });
  const out: Record<string, LiveMark> = {};
  byKey.forEach((rs, k) => {
    const q = quotes.get(k);
    if (!q) return;
    for (const r of rs) out[r.id] = markFor(r, q);
  });
  const pendingIds = pending.flatMap((k) => (byKey.get(k) ?? []).map((r) => r.id));
  return { marks: out, pending: pendingIds, timing };
}

/** Default batch path (network): Alpaca snapshots for many contracts at once. */
export const defaultBatch: BatchFn = async (keys) => {
  const { alpacaBatch } = await import('./option-marks-batch');
  return alpacaBatch(keys);
};
