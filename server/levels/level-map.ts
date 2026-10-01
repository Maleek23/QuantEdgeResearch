/**
 * LEVEL MAP — one shared, cached, bounded structural-level service.
 *
 *   getLevelMap(symbol)          → sorted levels + confluence clusters
 *   snapPlanForPublish(plan)     → a producer's formula plan snapped to those
 *                                  levels (shared/levels/snap.ts), with the
 *                                  loss-rule expected-move cap applied first
 *
 * Inputs are bars the platform already fetches (historical-candles fetchCandles:
 * Yahoo 5-minute bars with extended hours over 5 sessions, Yahoo daily bars over
 * 3 months — the same call the ingestion ATR floor makes, so it is usually a
 * provider-cache hit). GEX walls / zero gamma / max gamma and dark-pool levels
 * are merged ONLY from caches that already hold them — this module never starts
 * an option-chain or Bullflow fetch (memory is tight on the 2 GB droplet).
 *
 * Every level carries its source and computation time. Nothing here is
 * validated as edge yet: the snap is labelled "measuring" until
 * research/level-snap-replay.ts says otherwise.
 *
 * Flag: LEVEL_SNAP (default ON). "off"/"false"/"0" disables the publish-time
 * snap; the level map endpoint stays available for display.
 */
import { BoundedCache } from '../lib/bounded-cache';
import { logger } from '../logger';
import {
  buildLevelMap, type Bar, type ExternalLevel, type LevelMap,
} from '@shared/levels/level-math';
import { snapPlanToStructure, type SnapHorizon, type SnapResult } from '@shared/levels/snap';

const MAP_TTL_MS = 60_000;
const mapCache = new BoundedCache<string, { at: number; map: LevelMap | null }>({
  name: 'levels.map', maxEntries: 120, ttlMs: 10 * 60_000, maxBytes: 8 * 1024 * 1024,
});
const inflight = new Map<string, Promise<LevelMap | null>>();

/** External GEX levels older than this are not merged. */
const GEX_MAX_AGE_MS = 30 * 60_000;
/** Dark-pool reads cover a 28-day print window; older than 3 days is not merged. */
const DP_MAX_AGE_MS = 3 * 86_400_000;

export function levelSnapEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = String(env.LEVEL_SNAP ?? '').trim().toLowerCase();
  return !(v === 'off' || v === 'false' || v === '0' || v === 'no');
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let t: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([p, new Promise<null>((res) => { t = setTimeout(() => res(null), ms); })]);
  } finally { if (t) clearTimeout(t); }
}

/** GEX + dark-pool levels from existing caches only. */
async function cachedExternalLevels(symbol: string): Promise<ExternalLevel[]> {
  const out: ExternalLevel[] = [];
  const now = Date.now();
  try {
    const { peekAggregateGammaExposure } = await import('../gamma-exposure');
    const hit = peekAggregateGammaExposure(symbol);
    if (hit && now - hit.at < GEX_MAX_AGE_MS) {
      const g = hit.v;
      const asOf = new Date(hit.at).toISOString();
      const src = `aggregate GEX cache (${g.dataSource ?? 'chain'}, computed ${asOf})`;
      if (g.callWall) out.push({ price: g.callWall, kind: 'call_wall', source: src, asOf, strength: g.callWallOI ?? 1 });
      if (g.putWall) out.push({ price: g.putWall, kind: 'put_wall', source: src, asOf, strength: g.putWallOI ?? 1 });
      const zg = g.zeroGammaLevel ?? g.flipPoint;
      if (zg) out.push({ price: zg, kind: 'zero_gamma', source: src, asOf });
      if (g.maxGammaStrike) out.push({ price: g.maxGammaStrike, kind: 'max_gamma', source: src, asOf });
    } else {
      const { peekGexSnapshot } = await import('../gex-snapshot-service');
      const s = peekGexSnapshot(symbol);
      if (s && now - s.at < GEX_MAX_AGE_MS) {
        const asOf = new Date(s.at).toISOString();
        const src = `GEX snapshot cache (fetched ${asOf})`;
        if (s.snap.callWall) out.push({ price: s.snap.callWall, kind: 'call_wall', source: src, asOf });
        if (s.snap.putWall) out.push({ price: s.snap.putWall, kind: 'put_wall', source: src, asOf });
        if (s.snap.flipPoint) out.push({ price: s.snap.flipPoint, kind: 'zero_gamma', source: src, asOf });
      }
    }
  } catch { /* no GEX cache */ }
  try {
    const { peekDarkPoolLevels } = await import('../chart-overlays');
    const dp = peekDarkPoolLevels(symbol);
    if (dp && now - dp.at < DP_MAX_AGE_MS && dp.levels.length) {
      const asOf = new Date(dp.at).toISOString();
      // Top 5 by notional — the prints that define a level, not the long tail.
      for (const l of dp.levels.slice(0, 5)) {
        out.push({
          price: l.price, kind: 'dark_pool', source: `${dp.source} (read ${asOf})`, asOf,
          strength: Math.round(l.notional / 1e5) / 10, label: `dark-pool $${(l.notional / 1e6).toFixed(0)}M`,
        });
      }
    }
  } catch { /* no dark-pool cache */ }
  return out;
}

async function computeLevelMap(symbol: string): Promise<LevelMap | null> {
  const { fetchCandles } = await import('../historical-candles');
  const [intraday, daily] = await Promise.all([
    withTimeout(fetchCandles(symbol, '5d', '5m'), 6000),
    withTimeout(fetchCandles(symbol, '3mo', '1d'), 6000),
  ]);
  if (!intraday?.length && !daily?.length) return null;
  const external = await cachedExternalLevels(symbol);
  return buildLevelMap({
    symbol, intraday: (intraday ?? []) as Bar[], daily: (daily ?? []) as Bar[], external, nowMs: Date.now(),
    barSource: 'yahoo',
  });
}

/**
 * Read-only: the level map already computed for `symbol` in this process (any
 * age up to the cache's 10-min TTL), with its computation time — NEVER fetches
 * bars. The sector board reads levels only where a producer already paid.
 */
export function peekLevelMap(symbolRaw: string): { at: number; map: LevelMap } | null {
  const hit = mapCache.get(symbolRaw.toUpperCase());
  return hit && hit.map ? { at: hit.at, map: hit.map } : null;
}

/** Level map for one symbol (60 s cache, shared in-flight). Null when no bars. */
export async function getLevelMap(symbolRaw: string): Promise<LevelMap | null> {
  const symbol = symbolRaw.toUpperCase();
  const hit = mapCache.get(symbol);
  if (hit && Date.now() - hit.at < MAP_TTL_MS) return hit.map;
  const running = inflight.get(symbol);
  if (running) return running;
  const p = computeLevelMap(symbol)
    .catch((e) => { logger.warn(`[LEVELS] ${symbol}: ${e?.message ?? e}`); return null; })
    .then((map) => { mapCache.set(symbol, { at: Date.now(), map }); return map; })
    .finally(() => inflight.delete(symbol));
  inflight.set(symbol, p);
  return p;
}

export interface PublishPlan {
  symbol: string;
  direction: 'long' | 'short';
  entry: number;
  stop: number;
  targets: number[];
  horizon: SnapHorizon;
  /** For the expected-move cap (loss rules). */
  expiryDate?: string | null;
}

export interface PublishSnap {
  result: SnapResult;
  /** Persisted under convergenceSignalsJson.levelSnap. */
  stamp: Record<string, unknown>;
}

/**
 * The loss-rule expected-move cap on T1 (rule 3a) for a plan, or null when the
 * rule is off, the target is already inside it, or the candles are unavailable.
 * Shared by the publish snap below and the sector-rotation suggestion builder.
 */
export async function expectedMoveCapFor(plan: PublishPlan): Promise<number | null> {
  try {
    const { lossRulesConfig } = await import('../loss-rules');
    const cfg = lossRulesConfig();
    if (!cfg.targetCap) return null;
    const { fetchCandles } = await import('../historical-candles');
    const { capTargetToExpectedMove, realizedVolDaily, horizonTradingDays, etParts } = await import('@shared/loss-rules');
    const bars = (await withTimeout(fetchCandles(plan.symbol, '3mo', '1d'), 4000)) ?? [];
    const today = etParts(Date.now()).dateKey;
    const closes = bars.filter((b) => etParts(b.time * 1000).dateKey < today).map((b) => b.close);
    const sigma = realizedVolDaily(closes, 20);
    const horizonDays = horizonTradingDays({ holdingPeriod: plan.horizon, expiryDate: plan.expiryDate ?? null, publishedMs: Date.now() });
    const cap = capTargetToExpectedMove({ direction: plan.direction, entry: plan.entry, target: plan.targets[0], stop: plan.stop, sigmaDaily: sigma, horizonDays, multiple: cfg.targetCapMultiple });
    return cap.capped ? cap.target : null;
  } catch { return null; /* cap unavailable — storage still applies it */ }
}

/**
 * Snap a NEW plan to structure. Returns null (plan untouched) when the flag is
 * off, the plan is not on the underlying's price scale, or no level map could be
 * built. Never throws.
 */
export async function snapPlanForPublish(plan: PublishPlan): Promise<PublishSnap | null> {
  if (!levelSnapEnabled()) return null;
  try {
    const { entry, stop } = plan;
    if (!(entry > 0 && stop > 0 && plan.targets.length && plan.targets[0] > 0)) return null;
    const map = await getLevelMap(plan.symbol);
    if (!map || !map.last || !map.clusters.length) return null;
    // Premium-priced plans cannot be compared with share levels.
    if (Math.abs(entry / map.last - 1) > 0.25) return null;

    // Loss-rule target cap FIRST, so the snapped target is always inside it and
    // storage's cap (applied later at createTradeIdea) becomes a no-op.
    const maxTarget = await expectedMoveCapFor(plan);

    const asOfEt = new Date(map.asOf).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
    const result = snapPlanToStructure({
      direction: plan.direction, entry, stop, targets: plan.targets, clusters: map.clusters, horizon: plan.horizon,
      tolerance: map.tolerance, dailyAtr: map.atrDaily, stopFloorAtr: 1.25, maxTarget,
      levelsAsOf: `${asOfEt} ET (yahoo 5m/daily bars${map.levels.some((l) => l.family === 'gex' || l.family === 'dark_pool') ? ' + cached GEX/dark-pool' : ''})`,
    });
    const stamp = {
      version: 'level-snap-v1',
      status: 'measuring',
      appliedAt: new Date().toISOString(),
      levelsAsOf: map.asOf,
      tolerance: map.tolerance,
      formula: result.formula,
      flooredStop: result.flooredStop,
      maxTarget,
      snapped: { stop: result.stop, targets: result.targets },
      stopLevel: result.stopLevel,
      targetLevels: result.targetLevels,
      changed: result.changed,
      notes: result.notes,
    };
    return { result, stamp };
  } catch (e: any) {
    logger.warn(`[LEVELS] snap failed for ${plan.symbol}: ${e?.message ?? e}`);
    return null;
  }
}

/**
 * Remove producer sentences that the snap makes false ("T1 … is stated plainly
 * as 2R …, not a structural level.") before appending the snap's own text.
 */
export function stripFormulaTargetClaims(text: string | undefined): string {
  return String(text ?? '').replace(/\s*T1 \$[\d.,]+ is stated plainly as 2R[^.]*\./g, '').trim();
}
