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
      const unquoted = keys.filter((k) => !marks[k] && !pending.includes(k));
      if (timing.totalMs > 1000) logger.info(`[NEXUS-MARKS] ${keys.length} keys in ${timing.totalMs}ms (cached ${timing.cached}, batched ${timing.batched}, per-key ${timing.perKey}, pending ${timing.pending})`);
      res.set('Cache-Control', 'no-store');
      res.json({ marks, pending, unquoted, asOf: new Date().toISOString(), timing });
    } catch (e: any) {
      logger.warn('[NEXUS-MARKS] failed', { error: e?.message });
      res.status(500).json({ error: 'marks failed' });
    }
  });
}
