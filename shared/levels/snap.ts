/**
 * SNAP A PLAN TO STRUCTURE — pure.
 *
 * Producers publish formula plans ("T1 = 2R off the session low", "stop =
 * 1.25× ATR"). Algorithms and desks trade around levels, not around R
 * multiples. Given a level map (shared/levels/level-math.ts) this:
 *
 *   (a) TARGETS — moves each target to the nearest CONFLUENT cluster (≥ 2
 *       independent families) that lies before/at the formula target, never
 *       further, and never closer than half the formula reach (so a snap cannot
 *       turn a 2R plan into a scalp). The target sits on the cluster's near
 *       edge: price has to reach the level, not trade through it. An optional
 *       `maxTarget` (the loss-rule expected-move cap) bounds the formula target
 *       first, so the cap stays a hard ceiling.
 *   (b) STOP — moves the stop just beyond the nearest confluent cluster at or
 *       beyond the formula stop (including one sitting on the stop itself),
 *       bounded to half the formula risk (or 0.5 × daily ATR) of extra room.
 *       For swing/position plans the 1.25× daily-ATR floor
 *       (trade-idea-ingestion Gate 5) is applied FIRST, so the structural stop
 *       is found beyond the floor and the floor never needs to widen it again.
 *   (c) TEXT — says exactly which levels were used ("T1 $X = prior-day high +
 *       5-day VAH (2 kinds)") or, when none qualified, that the number is still
 *       a formula and not structure.
 *
 * UNVALIDATED: whether snapped plans outperform formula plans is being measured
 * (research/level-snap-replay.ts). Every note carries "measuring".
 */
import type { LevelCluster } from './level-math';

export type SnapHorizon = 'day' | 'swing' | 'position';

export interface SnapInput {
  direction: 'long' | 'short';
  entry: number;
  stop: number;
  targets: number[];
  clusters: LevelCluster[];
  horizon: SnapHorizon;
  /** Clustering tolerance from the level map (used for the stop buffer). */
  tolerance: number;
  /** Daily ATR (same definition as the ingestion floor). */
  dailyAtr?: number | null;
  /** 1.25 — ingestion Gate 5. Applies to swing/position only. */
  stopFloorAtr?: number;
  /** Families required to call a cluster confluent. Default 2. */
  minFamilies?: number;
  /** Target may not be further from entry than this price (expected-move cap). */
  maxTarget?: number | null;
  /** Smallest fraction of the formula reach a snapped target may keep. Default 0.5. */
  minReachFraction?: number;
  /** Levels older than this are ignored by the caller; carried for the text. */
  levelsAsOf?: string;
}

export interface SnapLevelRef { price: number; label: string; kinds: number; families: number; edge: number }

export interface SnapResult {
  entry: number;
  stop: number;
  targets: number[];
  changed: boolean;
  stopChanged: boolean;
  targetsChanged: boolean[];
  formula: { stop: number; targets: number[] };
  /** Stop after the ATR floor, before structure (== formula when no floor applied). */
  flooredStop: number;
  stopLevel: SnapLevelRef | null;
  targetLevels: Array<SnapLevelRef | null>;
  /** Short sentences, one per decision. */
  notes: string[];
  /** Single paragraph for the idea text. */
  text: string;
  riskReward: number | null;
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const $ = (x: number) => `$${x.toFixed(2)}`;

function ref(c: LevelCluster, edge: number): SnapLevelRef {
  return { price: c.price, label: c.label, kinds: c.kinds.length, families: c.score, edge: r2(edge) };
}

function describe(c: LevelCluster): string {
  return `${c.label} (${c.score} independent kind${c.score === 1 ? '' : 's'})`;
}

export function snapPlanToStructure(i: SnapInput): SnapResult {
  const long = i.direction === 'long';
  const sgn = long ? 1 : -1;
  const minFam = i.minFamilies ?? 2;
  const minReach = i.minReachFraction ?? 0.5;
  const confluent = i.clusters.filter((c) => c.score >= minFam);
  const notes: string[] = [];
  const buffer = Math.max(0.01, 0.5 * i.tolerance);

  // ── stop ──
  let flooredStop = i.stop;
  const floorK = i.stopFloorAtr ?? 1.25;
  if (i.horizon !== 'day' && i.dailyAtr && i.dailyAtr > 0) {
    const floor = floorK * i.dailyAtr;
    if (Math.abs(i.entry - i.stop) < floor) {
      // Round AWAY from entry so the floored stop is never a hair inside the floor.
      const raw = i.entry - sgn * floor;
      flooredStop = long ? Math.floor(raw * 100) / 100 : Math.ceil(raw * 100) / 100;
      notes.push(`formula stop ${$(i.stop)} was inside ${floorK}× daily ATR (${$(i.dailyAtr)}), so the search starts at ${$(flooredStop)}`);
    }
  }
  const baseRisk = Math.abs(i.entry - flooredStop);
  const maxExtra = Math.max(0.5 * baseRisk, 0.5 * (i.dailyAtr ?? 0));
  // A cluster protects the stop only when it sits at or beyond it (within one tolerance of it counts as "at").
  const stopCands = confluent
    .map((c) => ({ c, near: long ? c.low : c.high, far: long ? c.low : c.high }))
    .filter(({ c }) => {
      const beyond = long ? c.price <= flooredStop + i.tolerance : c.price >= flooredStop - i.tolerance;
      const extra = long ? flooredStop - c.low : c.high - flooredStop;
      return beyond && extra <= maxExtra && (long ? c.high < i.entry : c.low > i.entry);
    })
    .sort((a, b) => (long ? b.c.price - a.c.price : a.c.price - b.c.price));
  let stop = flooredStop;
  let stopLevel: SnapLevelRef | null = null;
  if (stopCands.length) {
    const { c } = stopCands[0];
    const edge = long ? c.low : c.high;
    const rawS = edge - sgn * buffer;
    const s = long ? Math.floor(rawS * 100) / 100 : Math.ceil(rawS * 100) / 100;
    // Never tighter than the floored stop.
    stop = long ? Math.min(s, flooredStop) : Math.max(s, flooredStop);
    stopLevel = ref(c, edge);
    notes.push(`stop ${$(stop)} sits ${$(Math.abs(edge - stop))} beyond ${describe(c)} at ${$(edge)} (formula stop ${$(i.stop)})`);
  } else {
    notes.push(`no confluent level within ${$(maxExtra)} beyond the ${flooredStop === i.stop ? 'formula' : 'ATR-floored'} stop ${$(flooredStop)} — stop stays a formula/volatility stop, not structure`);
  }

  // ── targets ──
  const targets: number[] = [];
  const targetLevels: Array<SnapLevelRef | null> = [];
  let floorPrice = i.entry; // next target must lie beyond the previous one
  i.targets.forEach((t0, k) => {
    const name = `T${k + 1}`;
    if (!(Number.isFinite(t0) && (long ? t0 > i.entry : t0 < i.entry))) {
      targets.push(t0); targetLevels.push(null); return;
    }
    let limit = t0;
    if (i.maxTarget != null && Number.isFinite(i.maxTarget)) limit = long ? Math.min(t0, i.maxTarget) : Math.max(t0, i.maxTarget);
    const reach = Math.abs(limit - i.entry);
    const lo = i.entry + sgn * minReach * reach;
    const cands = confluent
      .map((c) => ({ c, edge: long ? c.low : c.high }))
      .filter(({ edge }) => (long
        ? edge <= limit + 1e-9 && edge >= lo && edge > floorPrice + i.tolerance
        : edge >= limit - 1e-9 && edge <= lo && edge < floorPrice - i.tolerance))
      .sort((a, b) => (long ? b.edge - a.edge : a.edge - b.edge));
    if (cands.length) {
      const { c, edge } = cands[0];
      const t = r2(edge);
      targets.push(t); targetLevels.push(ref(c, edge));
      floorPrice = t;
      notes.push(`${name} ${$(t)} = ${describe(c)}${Math.abs(t - t0) > 0.005 ? ` — formula ${name} was ${$(t0)}` : ''}`);
    } else {
      targets.push(r2(limit)); targetLevels.push(null);
      floorPrice = limit;
      notes.push(`${name} ${$(limit)}: no level where ≥${minFam} independent kinds agree between ${$(lo)} and ${$(limit)} — ${name} remains a formula target, not structure`);
    }
  });

  const risk = Math.abs(i.entry - stop);
  const rr = targets.length && risk > 0 ? Math.abs(targets[0] - i.entry) / risk : null;
  const stopChanged = Math.abs(stop - i.stop) > 0.005;
  const targetsChanged = targets.map((t, k) => Math.abs(t - i.targets[k]) > 0.005);
  const changed = stopChanged || targetsChanged.some(Boolean);
  const rrText = rr != null ? ` T1 is ${rr.toFixed(1)}R on this stop${rr < 1 ? ' — below 1R, size down or pass' : ''}.` : '';
  const text = `Level snap (measuring): ${notes.join('; ')}.${rrText}${i.levelsAsOf ? ` Levels as of ${i.levelsAsOf}.` : ''}`;

  return {
    entry: i.entry, stop: r2(stop), targets, changed, stopChanged, targetsChanged,
    formula: { stop: i.stop, targets: [...i.targets] }, flooredStop, stopLevel, targetLevels, notes, text,
    riskReward: rr != null ? Math.round(rr * 100) / 100 : null,
  };
}
