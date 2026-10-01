/**
 * The ticker universe the Discord importers check symbols against
 * (shared/ticker-stoplist.ts, layer 3).
 *
 * Union of: the liquid universe (top 2,000 US names by dollar volume — the same
 * set /api/search/symbols answers from first; loaded from its disk snapshot if
 * the process has not warmed it), the curated sector universe
 * (server/ticker-universe.ts), the approved + skip lists (both are real
 * tickers), crypto majors and futures roots.
 *
 * Returns null when the liquid universe is cold AND cannot be read from disk:
 * the curated ~800 names alone would drop real small caps a trader posts, so
 * the importer then falls back to the stop-lists only (logged, never guessed).
 */
import { logger } from './logger';

export async function loadKnownTickers(opts: { requireLiquid?: boolean } = {}): Promise<Set<string> | null> {
  const lu = await import('./liquid-universe');
  if (!lu.liquidUniverseStatus().size) await lu.loadLiquidUniverseFromDisk().catch(() => {});
  const liquid = lu.getLiquidSymbols(Number.MAX_SAFE_INTEGER);
  if (!liquid.length && opts.requireLiquid !== false) {
    logger.warn('[KNOWN-TICKERS] liquid universe is cold (no server/data/liquid-universe.json) — Discord symbols are filtered by the stop-lists only');
    return null;
  }
  const { getFullUniverse } = await import('./ticker-universe');
  const { APPROVED_TICKERS, SKIP_TICKERS, CRYPTO_TICKERS, INDEX_TICKERS } = await import('@shared/approved-tickers');
  const { FUTURES } = await import('@shared/discord-journal-parser');
  const out = new Set<string>();
  const add = (xs: Iterable<string>) => { for (const x of xs) if (x) out.add(String(x).toUpperCase()); };
  add(liquid);
  add(getFullUniverse());
  add(APPROVED_TICKERS);
  add(SKIP_TICKERS);
  add(CRYPTO_TICKERS);
  add(INDEX_TICKERS);
  add(['BTC', 'ETH', 'SOL', 'XRP', 'DOGE']);
  add(FUTURES);
  return out;
}
