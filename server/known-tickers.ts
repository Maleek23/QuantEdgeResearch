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
import fs from 'fs';
import path from 'path';
import { logger } from './logger';

/**
 * Every active US-listed equity (Alpaca /v2/assets), cached to disk for a day.
 * The liquid top-2,000 dropped real small caps traders post (DJT, UAMY on
 * 2026-09-30). The jargon stop-list runs BEFORE this check, so admitting the
 * full listing can't let HH / OI / HTF back in. Null when unavailable.
 */
async function listedUsEquities(): Promise<string[] | null> {
  const file = path.join(process.cwd(), '.cache', 'alpaca-assets.json');
  try {
    const st = fs.statSync(file);
    if (Date.now() - st.mtimeMs < 24 * 3_600_000) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { /* no cache yet */ }
  const key = process.env.ALPACA_API_KEY, secret = process.env.ALPACA_SECRET_KEY;
  if (!key || !secret) return null;
  try {
    const host = process.env.ALPACA_PAPER !== 'false' ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';
    const r = await fetch(`${host}/v2/assets?status=active&asset_class=us_equity`, { headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret } });
    if (!r.ok) return null;
    const rows: any[] = await r.json();
    const syms = rows.filter((a) => a?.tradable && /^[A-Z]{1,5}$/.test(String(a.symbol))).map((a) => String(a.symbol));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(syms));
    return syms;
  } catch (err) {
    logger.warn(`[KNOWN-TICKERS] Alpaca asset list unavailable: ${(err as Error).message}`);
    return null;
  }
}

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
  const listed = await listedUsEquities();
  if (listed) add(listed);
  return out;
}
