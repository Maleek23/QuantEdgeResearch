/**
 * GEX INTRADAY SNAPSHOTS — every 5 min in the regular session, one
 * gex_snapshots row per symbol for the chart's nodes ("orbs") and replay.
 *
 * Universe (cap GEX_INTRADAY_MAX, default 30), in priority order:
 *   1. the index set SPX · SPY · QQQ · IWM
 *   2. symbols charted in the last 2 h (chart-overlays watchedSymbols)
 *   3. the watchlist (every user's, deduped)
 *   4. the GEX ranking job's top setups
 * Sequential, each chain parse through the heavy-job gate (`gex-intraday:SYM`;
 * non-index names wait out the 09:30–09:45 open quiet window). The engine's
 * 60 s aggregate cache means a symbol the chart recorder just read costs no
 * second chain. A tick stops at a 4 min budget so ticks never overlap — the
 * symbols it did not reach are skipped, not back-filled.
 *
 * Row shape (no migration): the usual level columns (all-expiry, same as the
 * hourly archive), top_levels = top 15 by |GEX|, strike_expiry_matrix = []
 * (the full matrix stays in the hourly rows — it is ~0.5 MB), and
 * heatmap_data = { kind: 'intraday-5m', v: 1, horizons: { today, week, opex,
 * all } } with each horizon's strongest nodes [strike, GEX $B/1%, VEX $M/IVpt]
 * and its levels. ~3–4 KB per row.
 *
 * Retention (pruneGexSnapshots, nightly 02:40 ET): 5-min rows kept 400 days
 * for the index set, 30 days for everything else. Hourly archive rows are not
 * touched (they are not 5-min rows).
 *
 * Flag: GEX_INTRADAY_SNAPSHOTS (default on; off|0|false disables).
 */
import { logger } from './logger';
import {
  INTRADAY_KIND, horizonLastExpiry, nodesForHorizon, topNodes,
  type GexHorizon, type HorizonBlock, type IntradayHeatmap,
} from '@shared/gex-horizon';
import type { GammaExposureResult } from './gamma-exposure';

export const INDEX_SET = ['SPX', 'SPY', 'QQQ', 'IWM'] as const;
export const INDEX_RETENTION_DAYS = 400;
export const OTHER_RETENTION_DAYS = 30;
const TICK_BUDGET_MS = 4 * 60_000;
const MIN_GAP_MS = 4 * 60_000;

export function intradaySnapshotsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = String(env.GEX_INTRADAY_SNAPSHOTS ?? 'on').toLowerCase();
  return !['off', '0', 'false'].includes(v);
}
export function intradayCap(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.GEX_INTRADAY_MAX ?? 30);
  return Number.isFinite(n) && n >= INDEX_SET.length ? Math.min(60, Math.floor(n)) : 30;
}

/** Weekday 09:30–16:00 ET (the 16:00 sample is the close). */
export function inIntradayWindow(ms: number): boolean {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ms));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  if (['Sat', 'Sun'].includes(v('weekday'))) return false;
  const min = (Number(v('hour')) % 24) * 60 + Number(v('minute'));
  return min >= 9 * 60 + 30 && min <= 16 * 60;
}

const OK_SYM = /^[A-Z][A-Z.]{0,5}$/;
/** Ordered, deduped, capped universe. Pure (inputs injected) so it is testable. */
export function buildUniverse(parts: { charted: string[]; watchlist: string[]; ranked: string[] }, cap: number): string[] {
  const out: string[] = [];
  const add = (s: string) => {
    const u = String(s ?? '').trim().toUpperCase();
    if (!OK_SYM.test(u) || out.includes(u) || out.length >= cap) return;
    out.push(u);
  };
  INDEX_SET.forEach(add);
  parts.charted.forEach(add);
  parts.watchlist.forEach(add);
  parts.ranked.forEach(add);
  return out;
}

async function currentUniverse(): Promise<string[]> {
  let charted: string[] = []; let watchlist: string[] = []; let ranked: string[] = [];
  try { charted = (await import('./chart-overlays')).watchedSymbols(); } catch { /* optional */ }
  try {
    const { storage } = await import('./storage');
    const rows = await storage.getAllWatchlist();
    watchlist = rows.filter((r: any) => !r.assetType || r.assetType === 'stock' || r.assetType === 'option').map((r: any) => r.symbol);
  } catch { /* optional */ }
  try { ranked = (await import('./gex-rankings')).getGexRankings(30).setups.map((s: any) => s.symbol); } catch { /* optional */ }
  return buildUniverse({ charted, watchlist, ranked }, intradayCap());
}

const sig = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : Number(v.toPrecision(6)));

/** heatmap_data for one aggregate read (pure). */
export function buildIntradayHeatmap(gex: Pick<GammaExposureResult, 'strikeExpiryMatrix' | 'strikes' | 'byHorizon' | 'callWall' | 'putWall' | 'zeroGammaLevel' | 'flipPoint' | 'maxGammaStrike' | 'totalNetGEX'>, nowMs: number): IntradayHeatmap {
  const matrix = (gex.strikeExpiryMatrix ?? []) as Array<{ strike: number; dte: number; netGEX: number; netVEX: number }>;
  const horizons: Partial<Record<GexHorizon, HorizonBlock>> = {};
  for (const h of ['today', 'week', 'opex'] as const) {
    const n = topNodes(nodesForHorizon(matrix, h, nowMs));
    const lv = gex.byHorizon?.[h];
    horizons[h] = {
      exp: horizonLastExpiry(h, nowMs),
      n,
      lv: lv ? { cw: sig(lv.callWall), pw: sig(lv.putWall), flip: sig(lv.gammaFlipPrice), maxG: sig(lv.maxGammaStrike), net: sig(lv.totalGEX) } : null,
    };
  }
  // 'all' from the per-strike rows (same contracts as the headline).
  const all = (gex.strikes ?? []).map((s) => ({ strike: s.strike, gex: s.netGEX, vex: s.netVEX ?? 0 }));
  horizons.all = {
    exp: null,
    n: topNodes(all),
    lv: { cw: sig(gex.callWall ?? null), pw: sig(gex.putWall ?? null), flip: sig(gex.zeroGammaLevel ?? gex.flipPoint ?? null), maxG: sig(gex.maxGammaStrike), net: sig(gex.totalNetGEX) },
  };
  return { kind: INTRADAY_KIND, v: 1, horizons };
}

const lastWritten = new Map<string, number>();
let started = false;
let lastTick: { at: string; written: number; skipped: number; failed: number; universe: number } | null = null;
export const intradayStatus = () => ({ enabled: intradaySnapshotsEnabled(), started, lastTick });

async function writeOne(sym: string): Promise<boolean> {
  const { calculateAggregateGammaExposure } = await import('./gamma-exposure');
  const { toSnapshot } = await import('./gex-vex-scanner');
  const { storage } = await import('./storage');
  const gex = await calculateAggregateGammaExposure(sym);
  if (!gex || !gex.strikes?.length) return false;
  const now = Date.now();
  const snap = toSnapshot(gex);
  const flip = snap.zeroGammaLevel ?? snap.gammaFlipPrice ?? null;
  await storage.createGexSnapshot({
    symbol: sym,
    spotPrice: gex.spotPrice,
    flipPoint: flip,
    callWall: snap.callWall ?? null,
    putWall: snap.putWall ?? null,
    flipDistancePct: flip && gex.spotPrice > 0 ? ((flip - gex.spotPrice) / gex.spotPrice) * 100 : null,
    regime: snap.regime ?? null,
    vexRegime: gex.vexRegime ?? null,
    netGexSign: snap.totalGEX > 0 ? 'positive' : snap.totalGEX < 0 ? 'negative' : 'neutral',
    totalGex: snap.totalGEX,
    maxGammaStrike: snap.maxGammaStrike ?? null,
    topLevels: [...snap.levels].sort((a, b) => Math.abs(b.gex) - Math.abs(a.gex)).slice(0, 15)
      .map((l) => ({ strike: l.strike, gex: l.gex, vex: l.vex, gammaPct: l.gammaPct, role: l.role })),
    heatmapData: buildIntradayHeatmap(gex, now),
    strikeExpiryMatrix: [],
    snapshotAt: new Date(now),
    marketSession: 'regular',
    dataGrade: gex.dataQuality?.grade ?? null,
  });
  lastWritten.set(sym, now);
  return true;
}

export async function runIntradayTick(): Promise<NonNullable<typeof lastTick>> {
  const t0 = Date.now();
  const universe = await currentUniverse();
  const { runHeavy } = await import('./lib/heavy-job-gate');
  let written = 0; let skipped = 0; let failed = 0;
  for (const sym of universe) {
    if (Date.now() - t0 > TICK_BUDGET_MS) { skipped++; continue; }
    const last = lastWritten.get(sym);
    if (last && Date.now() - last < MIN_GAP_MS) { skipped++; continue; }
    try {
      const ok = await runHeavy(`gex-intraday:${sym}`, () => writeOne(sym), { priority: 'low', maxWaitMs: 2 * 60_000 });
      if (ok) written++; else if (ok === undefined) skipped++; else failed++;
    } catch (err) {
      failed++;
      logger.debug?.(`[GEX-INTRADAY] ${sym} failed: ${(err as Error).message}`);
    }
  }
  lastTick = { at: new Date().toISOString(), written, skipped, failed, universe: universe.length };
  logger.info(`[GEX-INTRADAY] tick: ${written} written, ${skipped} skipped, ${failed} failed of ${universe.length} in ${Math.round((Date.now() - t0) / 1000)}s`);
  return lastTick;
}

/** Scheduler (worker job 'gex-intraday-snapshots'). Idempotent. */
export async function startGexIntradaySnapshots(): Promise<void> {
  if (started || !intradaySnapshotsEnabled()) return;
  started = true;
  const cron = (await import('./guarded-cron')).default;
  let running = false;
  cron.schedule('*/5 9-16 * * 1-5', async () => {
    if (running || !inIntradayWindow(Date.now())) return;
    running = true;
    try { await runIntradayTick(); }
    catch (err) { logger.error('[GEX-INTRADAY] tick failed:', err); }
    finally { running = false; }
  }, { timezone: 'America/New_York' });
  logger.info('[GEX-INTRADAY] 5-min snapshots scheduled (09:30–16:00 ET → gex_snapshots)');
}

/* ───────────────────────────── retention ───────────────────────────── */

/** The prune statement (pure, for the test): intraday rows past their retention, in batches. */
export function pruneSql(batch: number): { text: string; values: unknown[] } {
  return {
    text: `DELETE FROM gex_snapshots WHERE id IN (
      SELECT id FROM gex_snapshots
      WHERE heatmap_data->>'kind' = $1
        AND ((symbol = ANY($2::text[]) AND snapshot_at < now() - ($3::int * interval '1 day'))
          OR (NOT (symbol = ANY($2::text[])) AND snapshot_at < now() - ($4::int * interval '1 day')))
      LIMIT $5)`,
    values: [INTRADAY_KIND, [...INDEX_SET], INDEX_RETENTION_DAYS, OTHER_RETENTION_DAYS, batch],
  };
}

export async function pruneGexSnapshots(): Promise<{ deleted: number }> {
  const { pool } = await import('./db');
  let deleted = 0;
  for (let i = 0; i < 200; i++) {
    const q = pruneSql(5_000);
    const r = await pool.query(q.text, q.values);
    deleted += r.rowCount ?? 0;
    if (!r.rowCount) break;
    await new Promise((res) => setTimeout(res, 250));
  }
  logger.info(`[GEX-INTRADAY] prune: ${deleted} 5-min rows past retention removed (index ${INDEX_RETENTION_DAYS}d, others ${OTHER_RETENTION_DAYS}d)`);
  return { deleted };
}

/** Scheduler (worker job 'gex-snapshot-prune'). */
export async function scheduleGexSnapshotPrune(): Promise<void> {
  const cron = (await import('./guarded-cron')).default;
  const { runHeavy } = await import('./lib/heavy-job-gate');
  cron.schedule('40 2 * * *', async () => {
    try { await runHeavy('gex-snapshot-prune', () => pruneGexSnapshots(), { priority: 'low' }); }
    catch (err) { logger.error('[GEX-INTRADAY] prune failed:', err); }
  }, { timezone: 'America/New_York' });
}
