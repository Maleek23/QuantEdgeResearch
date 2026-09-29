/**
 * STRUCTURAL LEVELS — a stop and a first target taken from MEASURED levels, for
 * producers that discover a name without stating where the trade is wrong.
 *
 * WHY THIS EXISTS
 * The universal generator refuses to publish an idea whose source supplied no
 * target or invalidation ("coverage only"), because the old fallback — a fixed
 * percentage ladder — made every discovery look like a plan. That refusal was
 * right, but it made whole producers silent. Measured in production over the
 * five sessions to 2026-09-29: the options-flow scan found ~150 qualifying
 * prints per scan, tried to convert the top five 106 times, and published
 * nothing — 524 of 530 attempts ended "coverage only".
 *
 * The honest middle ground is not to invent levels but to READ them:
 *
 *   • STOP   — beyond the nearest recent swing against the trade, padded by ATR
 *              (level-engine.deriveLevels). If no swing is near, a 2×ATR stop.
 *              Both are measurements of this instrument's own structure/noise.
 *   • TARGET — the nearest real obstacle in the trade's direction:
 *                – a prior swing high/low within reach (3.5×ATR), or
 *                – the GEX wall on that side (call wall above a long, put wall
 *                  below a short) within the same reach.
 *              If neither exists, there is no plan: the name stays coverage-only.
 *              A volatility "take-profit" (N×ATR) is NOT accepted as a target
 *              here — it is a unit, not a place other traders can see.
 *
 * The bar interval follows the horizon: 15-minute bars for day ideas (a daily
 * swing is the wrong yardstick intraday), daily bars for swing/position. Every
 * plan carries a plain-English rationale naming each level's origin, so the
 * card can say WHY the stop and target sit where they do.
 */

import { logger } from './logger';
import { deriveLevels, findSwings, type Candle as LevelCandle } from './level-engine';

export type PlanHorizon = 'day' | 'swing' | 'position';

export interface StructuralPlan {
  entry: number;
  stop: number;
  target: number;
  riskReward: number;
  /** Where T1 came from. */
  targetSource: 'swing' | 'gex_wall';
  /** Where the stop came from. */
  stopSource: 'structure' | 'atr';
  interval: '15m' | '1d';
  atr: number;
  rationale: string;
}

export interface StructuralPlanResult {
  plan: StructuralPlan | null;
  /** Why no plan — always set when plan is null. */
  reason: string;
}

/** Nearest obstacle must be at least this far away (in ATR) to be a target. */
const MIN_TARGET_ATR = 0.35;
/** ...and no farther than this — same reach as level-engine's T1 rule. */
const MAX_TARGET_ATR = 3.5;
/** Bars of recent structure considered — matches level-engine's SWING_WINDOW. */
const SWING_WINDOW = 45;
const round2 = (n: number) => Number(n.toFixed(2));

async function candlesFor(symbol: string, horizon: PlanHorizon): Promise<{ candles: LevelCandle[]; interval: '15m' | '1d' }> {
  const { fetchCandles } = await import('./historical-candles');
  if (horizon === 'day') {
    const c = await fetchCandles(symbol, '5d', '15m');
    return { candles: c, interval: '15m' };
  }
  const c = await fetchCandles(symbol, '6mo', '1d');
  return { candles: c, interval: '1d' };
}

/**
 * Derive a structural stop + T1 for `symbol` at `spot`. Never throws; returns
 * `{ plan: null, reason }` whenever the chart does not offer a measured plan.
 */
export async function deriveStructuralPlan(opts: {
  symbol: string;
  direction: 'long' | 'short';
  spot: number;
  horizon: PlanHorizon;
  assetType?: string;
  /** Reject plans below this reward:risk. Default 1.0. */
  minRR?: number;
  /** Consult the (cached) GEX walls. Default true. */
  useGexWalls?: boolean;
}): Promise<StructuralPlanResult> {
  const { symbol, direction, spot, horizon } = opts;
  const minRR = opts.minRR ?? 1.0;
  if (!(spot > 0)) return { plan: null, reason: 'no valid spot' };

  let candles: LevelCandle[] = [];
  let interval: '15m' | '1d' = horizon === 'day' ? '15m' : '1d';
  try {
    const got = await candlesFor(symbol, horizon);
    candles = got.candles;
    interval = got.interval;
  } catch {
    candles = [];
  }
  if (candles.length < 30) return { plan: null, reason: `only ${candles.length} ${interval} bars — not enough structure` };

  const lv = deriveLevels(candles, spot, direction, { assetType: opts.assetType });
  if (!(lv.atr > 0)) return { plan: null, reason: 'ATR unavailable' };

  const long = direction === 'long';
  const inReach = (lvl: number) => {
    const d = long ? lvl - spot : spot - lvl;
    return d >= lv.atr * MIN_TARGET_ATR && d <= lv.atr * MAX_TARGET_ATR;
  };

  const targets: Array<{ price: number; source: 'swing' | 'gex_wall'; note: string }> = [];
  // Every visible swing on the trade's side, not only level-engine's T1: a
  // swing a few cents away is noise (below MIN_TARGET_ATR), and the next one
  // up is the real first obstacle. Same recent window level-engine uses.
  const { highs, lows } = findSwings(candles.slice(-SWING_WINDOW));
  const swingLevels = (long ? highs.filter((h) => h > spot) : lows.filter((l) => l < spot)).filter(inReach);
  for (const lvl of swingLevels) {
    targets.push({
      price: lvl,
      source: 'swing',
      note: `prior ${interval === '15m' ? 'intraday ' : ''}swing ${long ? 'high' : 'low'} $${round2(lvl)}`,
    });
  }

  if (opts.useGexWalls !== false) {
    try {
      const { getGexSnapshot } = await import('./gex-snapshot-service');
      const snap = await getGexSnapshot(symbol);
      const wall = snap ? (long ? snap.callWall : snap.putWall) : null;
      if (wall != null && Number.isFinite(wall) && (long ? wall > spot : wall < spot) && inReach(wall)) {
        targets.push({
          price: wall,
          source: 'gex_wall',
          note: `GEX ${long ? 'call' : 'put'} wall $${round2(wall)}`,
        });
      }
    } catch {
      /* walls are optional evidence — swing structure alone can carry the plan */
    }
  }

  if (targets.length === 0) {
    return { plan: null, reason: `no swing level or GEX wall within ${MAX_TARGET_ATR}×ATR ${long ? 'above' : 'below'} $${round2(spot)}` };
  }

  // The NEAREST obstacle is the first place price has to get through — T1.
  targets.sort((a, b) => Math.abs(a.price - spot) - Math.abs(b.price - spot));
  const t1 = targets[0];

  const stop = lv.stopLoss;
  const stopOk = long ? stop < spot : stop > spot;
  if (!stopOk) return { plan: null, reason: 'derived stop on the wrong side of spot' };

  const risk = Math.abs(spot - stop);
  const reward = Math.abs(t1.price - spot);
  const rr = risk > 0 ? reward / risk : 0;
  if (rr < minRR) {
    return {
      plan: null,
      reason: `nearest measured target (${t1.note}) is only ${rr.toFixed(2)}R against a ${lv.method} stop — below ${minRR}R`,
    };
  }

  const plan: StructuralPlan = {
    entry: round2(spot),
    stop: round2(stop),
    target: round2(t1.price),
    riskReward: Number(rr.toFixed(2)),
    targetSource: t1.source,
    stopSource: lv.method,
    interval,
    atr: lv.atr,
    rationale:
      `Levels read from ${interval === '15m' ? '15-minute' : 'daily'} structure: ` +
      `${lv.rationale.split(' · ')[0]}; T1 at the nearest measured obstacle — ${t1.note} ` +
      `(${rr.toFixed(2)}R, ATR $${round2(lv.atr)}).`,
  };
  logger.debug(`[STRUCTURAL-LEVELS] ${symbol} ${direction}: stop $${plan.stop} (${plan.stopSource}), T1 $${plan.target} (${plan.targetSource}), ${plan.riskReward}R`);
  return { plan, reason: 'ok' };
}
