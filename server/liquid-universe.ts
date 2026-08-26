/**
 * LIQUID UNIVERSE — the operator's "top 2000, universally, everywhere".
 *
 * One Massive grouped-daily call returns the ENTIRE US stock session (~12k
 * tickers, real OHLCV). This module ranks it by dollar volume and exposes:
 *
 *   getLiquidSymbols()        top-N by dollar volume (sync, from the warmed set)
 *   getLiquidMovers()         whole-market day movers above a liquidity floor —
 *                             the SNDK-class runners no curated list contained
 *   getUniverseBars(days)     per-symbol daily OHLC series for the whole
 *                             market, assembled from ~1 grouped call PER DAY
 *                             instead of one per-symbol call — the pattern
 *                             engine's 2000-name sweep costs ~70 requests, not
 *                             ~2800 Yahoo hits.
 *
 * Ranking snapshots persist to disk so a restart doesn't blind the platform
 * before the next warm. Nothing here fabricates: a cold, failed warm returns
 * an empty list and consumers fall back to their curated sets.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from './logger';
import { fetchGroupedDaily } from './massive-market-data';

const DISK = path.join(process.cwd(), 'server', 'data', 'liquid-universe.json');
const TOP_N = 2000;

interface RankedRow { symbol: string; dollarVolume: number; close: number; changePct: number | null }
let ranked: RankedRow[] = [];
let rankedAt = 0;

/** Junk filter: no dotted classes, no 5-char warrant/unit suffixes, sane price. */
function tradeable(sym: string, close: number): boolean {
  if (!sym || sym.includes('.') || sym.length > 5) return false;
  if (sym.length === 5 && /[WU]$/.test(sym)) return false;
  return close >= 1; // sub-$1 names are untradeable for the platform's option-centric flow
}

export async function warmLiquidUniverse(): Promise<number> {
  try {
    const today = await fetchGroupedDaily();
    if (today.size === 0) throw new Error('grouped daily empty');
    // Previous session for a real day-over-day change (grouped is cached per day).
    const prev = await fetchGroupedDaily(new Date(Date.now() - 86_400_000 * 1)).catch(() => new Map());
    const rows: RankedRow[] = [];
    for (const [sym, b] of today.entries()) {
      const c = (b as any).c ?? 0; const v = (b as any).v ?? 0;
      if (!tradeable(sym, c) || c * v <= 0) continue;
      const pb: any = prev.get(sym);
      const changePct = pb?.c > 0 && pb.c !== c ? ((c - pb.c) / pb.c) * 100 : null;
      rows.push({ symbol: sym, dollarVolume: c * v, close: c, changePct });
    }
    rows.sort((a, b) => b.dollarVolume - a.dollarVolume);
    ranked = rows.slice(0, TOP_N);
    rankedAt = Date.now();
    await fs.mkdir(path.dirname(DISK), { recursive: true }).catch(() => {});
    await fs.writeFile(DISK, JSON.stringify({ at: rankedAt, rows: ranked }), 'utf8').catch(() => {});
    logger.info(`[LIQUID-UNIVERSE] ranked ${rows.length} tradeable names, kept top ${ranked.length} (floor $${(ranked[ranked.length - 1]?.dollarVolume / 1e6).toFixed(0)}M/day)`);
    return ranked.length;
  } catch (err: any) {
    logger.warn(`[LIQUID-UNIVERSE] warm failed: ${err?.message} — consumers fall back to curated sets`);
    return ranked.length;
  }
}

/** Load the last persisted ranking so a restart isn't blind before the first warm. */
export async function loadLiquidUniverseFromDisk(): Promise<void> {
  if (ranked.length) return;
  try {
    const raw = JSON.parse(await fs.readFile(DISK, 'utf8'));
    if (Array.isArray(raw?.rows) && raw.rows.length) {
      ranked = raw.rows;
      rankedAt = raw.at ?? 0;
      logger.info(`[LIQUID-UNIVERSE] loaded ${ranked.length} names from disk (as of ${new Date(rankedAt).toISOString()})`);
    }
  } catch { /* first boot — warm will populate */ }
}

/** Top-N liquid symbols. Sync read of the warmed set; [] when cold (never fabricated). */
export function getLiquidSymbols(n = TOP_N): string[] {
  return ranked.slice(0, n).map((r) => r.symbol);
}

export function liquidUniverseStatus(): { size: number; asOf: string | null } {
  return { size: ranked.length, asOf: rankedAt ? new Date(rankedAt).toISOString() : null };
}

/**
 * Whole-market movers: |day change| >= minChangePct with dollar volume >=
 * minDollarVol. This is where the missed runners live — computed from data
 * already in hand, zero extra quota.
 */
export function getLiquidMovers(minChangePct = 3, minDollarVol = 50e6, cap = 60): RankedRow[] {
  return ranked
    .filter((r) => r.dollarVolume >= minDollarVol && r.changePct != null && Math.abs(r.changePct) >= minChangePct)
    .sort((a, b) => Math.abs(b.changePct!) - Math.abs(a.changePct!))
    .slice(0, cap);
}

/**
 * Daily OHLC series for every ranked symbol, assembled from one grouped call
 * per trading day. ~70 requests cover 2000+ names for a pattern sweep.
 * Weekends/holidays return empty maps and are skipped; the series carries
 * exactly the sessions that existed.
 */
export interface UBar { time: number; open: number; high: number; low: number; close: number; volume: number }

export async function getUniverseBars(days = 70): Promise<Map<string, UBar[]>> {
  const out = new Map<string, UBar[]>();
  const want = new Set(getLiquidSymbols());
  if (want.size === 0) return out;
  const seen: string[] = [];
  // Walk back calendar days until we have `days` sessions (or hit a sane cap).
  for (let back = 0, sessions = 0; sessions < days && back < days * 1.7 + 10; back++) {
    const date = new Date(Date.now() - back * 86_400_000);
    const dow = date.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    try {
      const bars = await fetchGroupedDaily(date);
      if (bars.size === 0) continue;
      sessions++;
      const t = Math.floor(date.getTime() / 1000);
      for (const [sym, b] of bars.entries()) {
        if (!want.has(sym)) continue;
        const a: any = b;
        if (!(a.c > 0 && a.h > 0 && a.l > 0 && a.o > 0)) continue;
        let arr = out.get(sym);
        if (!arr) { arr = []; out.set(sym, arr); }
        arr.push({ time: t, open: a.o, high: a.h, low: a.l, close: a.c, volume: a.v ?? 0 });
      }
      seen.push(date.toISOString().slice(0, 10));
    } catch { /* a missing day is a skipped session, not a fabricated one */ }
  }
  // Grouped walks newest→oldest; series must be oldest→newest.
  for (const arr of out.values()) arr.reverse();
  logger.info(`[LIQUID-UNIVERSE] assembled bars for ${out.size} names across ${seen.length} sessions`);
  return out;
}
