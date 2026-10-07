/**
 * GEX MAGNET PLAN — rebuild, don't reject (2026-10-07, fix/catch-leaders).
 *
 * The magnet producer (server/gex-magnet-actions.ts) set the stop at half the
 * distance to the magnet strike, then the shared 1.25× ATR floor widened it. When
 * the strike sits close to spot the floored stop is much further away than the
 * target and storage refused the row: "rejected gex_magnet idea AVGO long: R:R
 * 0.31 < 0.5 (trap)" (2026-10-06 16:13 ET, AVGO +3.7% on the day).
 *
 * Rebuilt plan, pure:
 *   stop   the FURTHER of (a) beyond the nearest confluent level (≥ 2 families)
 *          behind entry and (b) the ATR-floored stop the caller passes in. Never
 *          tighter than the floor — stop width is the #1 measured loss driver.
 *   T1     the magnet strike when it is ≥ minRR on that stop. Otherwise the first
 *          mapped level BEYOND the strike (cluster ≥ 2 families, or a GEX wall /
 *          zero-gamma level) that is ≥ minRR and inside the expected-move cap;
 *          the strike stays in the text as the first magnet.
 *   none   no such level → null with the reason. That is the only rejection.
 */

export interface MagnetLevel { price: number; low?: number; high?: number; score: number; label: string }

export interface MagnetPlanInput {
  side: 'long' | 'short';
  entry: number;
  strike: number;
  /** The caller's stop after the shared ATR floor. */
  flooredStop: number;
  /** Level-map clusters (shared/levels/level-math LevelCluster is compatible). */
  levels: MagnetLevel[];
  /** Loss-rule expected-move cap on T1, or null. */
  maxTarget: number | null;
  minRR: number;
  /** Half-width pad beyond a structural stop level (the map's tolerance). */
  tolerance?: number;
}

export interface MagnetPlan {
  stop: number;
  target: number;
  rr: number;
  stopBasis: string;
  targetBasis: string;
  /** True when T1 is not the magnet strike. */
  extended: boolean;
  /** R:R the strike itself offered on the rebuilt stop. */
  strikeRR: number;
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export function rebuildMagnetPlan(i: MagnetPlanInput): { plan: MagnetPlan | null; reason: string | null } {
  const L = i.side === 'long'; const s = L ? 1 : -1;
  if (!(fin(i.entry) && i.entry > 0 && fin(i.strike) && i.strike > 0 && fin(i.flooredStop) && i.flooredStop > 0)) {
    return { plan: null, reason: 'no valid plan: entry, strike or stop missing' };
  }
  if (!(s * (i.strike - i.entry) > 0)) return { plan: null, reason: `no valid plan: magnet $${i.strike} is not ${L ? 'above' : 'below'} spot $${r2(i.entry)}` };
  if (!(s * (i.entry - i.flooredStop) > 0)) return { plan: null, reason: 'no valid plan: stop on the wrong side of entry' };

  // Stop: the further of the floored stop and the nearest confluent level behind entry.
  const pad = Math.max(0.01, 0.5 * (i.tolerance ?? 0));
  const behind = i.levels
    .filter((c) => c.score >= 2 && (L ? (c.high ?? c.price) < i.entry : (c.low ?? c.price) > i.entry))
    .sort((a, b) => (L ? b.price - a.price : a.price - b.price))[0] ?? null;
  let stop = i.flooredStop; let stopBasis = 'shared 1.25× ATR floor';
  if (behind) {
    const structural = r2((L ? (behind.low ?? behind.price) : (behind.high ?? behind.price)) - s * pad);
    if (structural > 0 && s * (i.flooredStop - structural) > 0) { stop = structural; stopBasis = `beyond ${behind.label} (${behind.score} families), wider than the ATR floor`; }
    else stopBasis = `ATR floor (wider than ${behind.label})`;
  }
  const risk = Math.abs(i.entry - stop);
  const strikeRR = r2(Math.abs(i.strike - i.entry) / risk);
  const inCap = (p: number) => i.maxTarget == null || s * (i.maxTarget - p) >= -1e-9;

  if (strikeRR + 1e-9 >= i.minRR && inCap(i.strike)) {
    return { plan: { stop, target: r2(i.strike), rr: strikeRR, stopBasis, targetBasis: 'magnet strike', extended: false, strikeRR }, reason: null };
  }
  const beyond = i.levels
    .filter((c) => s * (c.price - i.strike) > 0 && (c.score >= 2 || /wall|gamma/i.test(c.label)))
    .sort((a, b) => (L ? a.price - b.price : b.price - a.price));
  const next = beyond.find((c) => Math.abs(c.price - i.entry) / risk + 1e-9 >= i.minRR && inCap(c.price)) ?? null;
  if (next) {
    const rr = r2(Math.abs(next.price - i.entry) / risk);
    return {
      plan: { stop, target: r2(next.price), rr, stopBasis, targetBasis: `${next.label} beyond the $${r2(i.strike)} magnet (magnet alone was ${strikeRR.toFixed(2)}R)`, extended: true, strikeRR },
      reason: null,
    };
  }
  return {
    plan: null,
    reason: `no valid plan: magnet $${r2(i.strike)} is ${strikeRR.toFixed(2)}R on a $${stop.toFixed(2)} stop (${stopBasis}) and no mapped level beyond it reaches ${i.minRR.toFixed(2)}R${i.maxTarget != null ? ` inside the expected-move cap $${r2(i.maxTarget)}` : ''}`,
  };
}
