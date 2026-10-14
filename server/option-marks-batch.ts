/**
 * BATCHED, CACHED OPTION MARKS — one endpoint for NEXUS and the journal.
 *
 * Operator, 2026-10-14: "I don't see any P&L — NEXUS"; the journal's
 * /api/journal/marks took 36 s in prod because every contract walked the
 * per-key fallback chain (Tradier → Alpaca → CBOE → Yahoo) six at a time and
 * the response waited for the slowest.
 *
 *   POST /api/nexus/marks  { contracts: ["O:NVDA|2026-10-17|call|185", …] }  (≤ 120 keys)
 *     → { marks: { key: { price, asOf, source, delayed, basis } }, pending: [key…], asOf, timing }
 *
 * Path (server/journal-marks.ts quotesWithin): fresh cache (30 s per contract,
 * shared with the journal) → ONE Alpaca request per 100 uncached contracts
 * (OPRA latest quotes when entitled, else indicative snapshots = delayed) →
 * per-key fallback in the background. The response returns inside ~1.5 s with
 * whatever settled; the rest come back as `pending` and the client re-asks
 * (progressive fill — rows show "loading mark", never a blank or a stale price
 * presented as live). Every mark carries the venue's quote time (`asOf`) and
 * `delayed`, so the UI stamps age.
 *
 * After hours / no quote (operator 2026-10-14: "28 unquoted"): a key no venue
 * quoted falls back to the contract's LAST 1-minute trade bar (close + bar time,
 * server/option-bars-chain.ts) with `kind: 'last-trade'` — labelled as a last
 * trade in the UI, never as a live mark. Cached 5 min per key; a lookup that has
 * not settled inside the budget returns as `pending` once, then the client's
 * retry picks up the cached answer (null = genuinely unquoted).
 */
import type { Express, RequestHandler } from 'express';
import { logger } from './logger';
import type { MarkQuote } from './journal-marks';

const KEY_RE = /^O:[A-Z0-9.]{1,8}\|\d{4}-\d{2}-\d{2}\|(call|put)\|\d+(\.\d+)?$/;
export const MARKS_BUDGET_MS = 1500;
export const MAX_KEYS = 120;

/** "O:SYM|YYYY-MM-DD|call|185" → OCC "SYM251017C00185000". Pure. */
export function occOfKey(key: string): string | null {
  if (!KEY_RE.test(key)) return null;
  const [sym, exp, type, strike] = key.slice(2).split('|');
  const [y, m, d] = exp.split('-');
  const k = Math.round(Number(strike) * 1000);
  if (!(k > 0)) return null;
  return `${sym}${y.slice(2)}${m}${d}${type === 'put' ? 'P' : 'C'}${String(k).padStart(8, '0')}`;
}

/** Sanitize a client key list. Pure. */
export function cleanKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<string>();
  for (const k of raw) {
    const s = String(k ?? '').trim().toUpperCase().replace(/\|(CALL|PUT)\|/, (m) => m.toLowerCase());
    if (KEY_RE.test(s)) out.add(s);
    if (out.size >= MAX_KEYS) break;
  }
  return Array.from(out);
}

/** Alpaca quotes for many keys in ≤ 2 requests per 100 contracts. */
export async function alpacaBatch(keys: string[]): Promise<Map<string, MarkQuote>> {
  const { getAlpacaContractQuotesBatch } = await import('./alpaca-options');
  const byOcc = new Map<string, string>();
  for (const k of keys) { const o = occOfKey(k); if (o) byOcc.set(o, k); }
  const out = new Map<string, MarkQuote>();
  if (!byOcc.size) return out;
  const got = await getAlpacaContractQuotesBatch(Array.from(byOcc.keys()));
  got.forEach((q, occ) => {
    const k = byOcc.get(occ);
    const bid = q.bid ?? 0, ask = q.ask ?? 0;
    const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : ask || bid || (q.last ?? 0);
    if (!k || !(mid > 0)) return;
    const t = q.quoteTime ? Date.parse(q.quoteTime) : NaN;
    out.set(k, {
      price: Math.round(mid * 100) / 100,
      asOf: Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString(),
      source: `alpaca-${q.feed}`, delayed: q.feed !== 'opra', basis: 'contract',
    });
  });
  return out;
}

export const LAST_TRADE_TTL_MS = 5 * 60_000;
const LAST_TRADE_BUDGET_MS = 1200;
const LAST_TRADE_LOOKBACK_MS = 5 * 86_400_000;
type LastTrade = (MarkQuote & { kind: 'last-trade' }) | null;
const lastTradeCache = new Map<string, { at: number; v: LastTrade }>();
const lastTradeInflight = new Map<string, Promise<LastTrade>>();

/** The contract's last 1-minute trade bar as a labelled mark (null when no feed has a print). */
async function lastTradeOf(key: string, nowMs: number): Promise<LastTrade> {
  const [symbol, expiry, optionType, strike] = key.slice(2).split('|');
  const { contractMinuteBars } = await import('./option-bars-chain');
  const expiryEnd = Date.parse(`${expiry}T20:15:00Z`);
  const toMs = Math.min(nowMs, Number.isFinite(expiryEnd) ? expiryEnd : nowMs);
  const cb = await contractMinuteBars({ symbol, expiry, optionType: optionType as 'call' | 'put', strike: Number(strike), fromMs: toMs - LAST_TRADE_LOOKBACK_MS, toMs, nowMs });
  const last = cb.bars[cb.bars.length - 1];
  if (!last || !(last.c > 0)) return null;
  return { price: Math.round(last.c * 100) / 100, asOf: new Date(last.t).toISOString(), source: `last 1m bar · ${cb.source}`, delayed: true, basis: 'contract', kind: 'last-trade' };
}

/** Last-trade marks for unquoted keys: cached → settled inside the budget → else pending. */
export async function lastTradesWithin(keys: string[], nowMs = Date.now(), lookup: (k: string, now: number) => Promise<LastTrade> = lastTradeOf): Promise<{ marks: Map<string, MarkQuote>; pending: string[] }> {
  const marks = new Map<string, MarkQuote>();
  const pending: string[] = [];
  const waits: Array<Promise<void>> = [];
  for (const k of keys.slice(0, 60)) {
    const hit = lastTradeCache.get(k);
    if (hit && nowMs - hit.at < LAST_TRADE_TTL_MS) { if (hit.v) marks.set(k, hit.v); continue; }
    let p = lastTradeInflight.get(k);
    if (!p) {
      p = lookup(k, nowMs).catch(() => null).then((v) => { lastTradeCache.set(k, { at: Date.now(), v }); lastTradeInflight.delete(k); if (lastTradeCache.size > 2000) lastTradeCache.delete(lastTradeCache.keys().next().value as string); return v; });
      lastTradeInflight.set(k, p);
    }
    waits.push(p.then((v) => { if (v) marks.set(k, v); }));
  }
  await Promise.race([Promise.all(waits), new Promise((r) => setTimeout(r, LAST_TRADE_BUDGET_MS))]);
  for (const k of keys.slice(0, 60)) if (!marks.has(k) && lastTradeInflight.has(k)) pending.push(k);
  return { marks, pending };
}

export function registerNexusMarksRoutes(app: Express, gate: RequestHandler): void {
  app.post('/api/nexus/marks', gate, async (req, res) => {
    try {
      const keys = cleanKeys(req.body?.contracts);
      if (!keys.length) return res.json({ marks: {}, pending: [], asOf: new Date().toISOString(), timing: null });
      const { quotesWithin, defaultQuote, defaultBatch } = await import('./journal-marks');
      const row = (k: string) => {
        const [symbol, expiryDate, optionType, strike] = k.slice(2).split('|');
        return { id: k, symbol, assetType: 'option', direction: 'long', status: 'open', quantity: 1, entryPrice: 0, optionType, strikePrice: Number(strike), expiryDate };
      };
      const { quotes, pending, timing } = await quotesWithin(keys, (k) => defaultQuote(k, row(k)), { budgetMs: MARKS_BUDGET_MS, batch: defaultBatch });
      const marks: Record<string, MarkQuote> = {};
      // Only contract marks: an underlying fallback is not a contract price.
      quotes.forEach((q, k) => { if (q && q.basis === 'contract') marks[k] = q; });
      const noQuote = keys.filter((k) => !marks[k] && !pending.includes(k));
      const last = noQuote.length ? await lastTradesWithin(noQuote) : { marks: new Map<string, MarkQuote>(), pending: [] as string[] };
      last.marks.forEach((q, k) => { marks[k] = q; });
      pending.push(...last.pending);
      const unquoted = noQuote.filter((k) => !marks[k] && !last.pending.includes(k));
      if (timing.totalMs > 1000) logger.info(`[NEXUS-MARKS] ${keys.length} keys in ${timing.totalMs}ms (cached ${timing.cached}, batched ${timing.batched}, per-key ${timing.perKey}, pending ${timing.pending})`);
      res.set('Cache-Control', 'no-store');
      res.json({ marks, pending, unquoted, asOf: new Date().toISOString(), timing });
    } catch (e: any) {
      logger.warn('[NEXUS-MARKS] failed', { error: e?.message });
      res.status(500).json({ error: 'marks failed' });
    }
  });
}
