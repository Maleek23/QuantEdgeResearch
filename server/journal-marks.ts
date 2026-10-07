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
    if (m && px != null) return { price: px, asOf: new Date().toISOString(), source: m.source, delayed: m.delayed, basis: 'contract' };
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
  return { ...q, unrealizedPnL: pnl, unrealizedPct: pct };
}

/** Marks for the OPEN rows, keyed by row id. Bounded concurrency, instrument-deduped. */
export async function liveMarksFor(
  rows: MarkableRow[], quote: QuoteFn = defaultQuote, opts: { concurrency?: number; now?: number } = {},
): Promise<Record<string, LiveMark>> {
  const open = rows.filter((r) => String(r.status).toLowerCase() === 'open');
  const byKey = new Map<string, MarkableRow[]>();
  for (const r of open) {
    const k = instrumentKey(r);
    if (k) byKey.set(k, [...(byKey.get(k) ?? []), r]);
  }
  const keys = [...byKey.keys()];
  const quotes = new Map<string, MarkQuote | null>();
  const conc = opts.concurrency ?? 6;
  for (let i = 0; i < keys.length; i += conc) {
    const slice = keys.slice(i, i + conc);
    const got = await Promise.all(slice.map((k) => cachedQuote(k, () => quote(k, byKey.get(k)![0]), opts.now)));
    slice.forEach((k, n) => quotes.set(k, got[n]));
  }
  const out: Record<string, LiveMark> = {};
  for (const [k, rs] of byKey) {
    const q = quotes.get(k);
    if (!q) continue;
    for (const r of rs) out[r.id] = markFor(r, q);
  }
  return out;
}
