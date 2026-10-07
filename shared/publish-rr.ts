/**
 * PUBLISH R:R FLOOR — one number for "is there enough room to T1 to bother".
 *
 * 2026-10-07 (fix/catch-leaders). The quant sweep refused anything under 2.0R
 * to T1 ("insufficient R:R (1.00 < 2)" for AAOI, CRWD, ZS on 2026-10-06 while
 * they ran). The measured record says the opposite of what a 2R floor assumes:
 * stated R:R is NEGATIVELY associated with outcomes in both study halves — a big
 * stated R:R is usually a tight stop, and stop width vs ATR is the strongest
 * measured loss driver. So the plan is built honestly first (stop ≥ the shared
 * 1.25× ATR floor, server/lib/atr-stop-floor.ts) and only then asked for ≥ 1.0R
 * to T1. A plan with ≥ MIN_RR_PUBLISH is never refused on R:R.
 *
 * MIN_RR_PUBLISH (env) overrides the default 1.0; clamped to [0.5, 5]. Storage's
 * own 0.5 trap floor (server/storage.ts validateTradeIdeaForCreate) still applies
 * to every write.
 */

export const MIN_RR_PUBLISH_DEFAULT = 1.0;
const MIN = 0.5;
const MAX = 5;

/** MIN_RR_PUBLISH from env, default 1.0, clamped to [0.5, 5]. Bad values → default. */
export function readMinRrPublish(env: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {}): number {
  const raw = env.MIN_RR_PUBLISH;
  if (raw == null || String(raw).trim() === '') return MIN_RR_PUBLISH_DEFAULT;
  const v = Number(raw);
  if (!Number.isFinite(v)) return MIN_RR_PUBLISH_DEFAULT;
  return Math.min(MAX, Math.max(MIN, v));
}

/** Reward ÷ risk to T1 on the underlying, rounded to 2 dp; null when the plan is not a plan. */
export function rrToT1(entry: number, stop: number, target: number): number | null {
  if (![entry, stop, target].every((x) => Number.isFinite(x) && x > 0)) return null;
  const risk = Math.abs(entry - stop);
  if (!(risk > 0)) return null;
  return Math.round((Math.abs(target - entry) / risk) * 100) / 100;
}

/**
 * The gate itself. `rr` is compared at 2 dp so a plan stated as "1.00R" is never
 * refused for being 0.998 under the hood (AAOI / CRWD 2026-10-06 logged 1.00).
 */
export function rrPublishVerdict(rr: number | null, minRr: number = MIN_RR_PUBLISH_DEFAULT): { ok: boolean; reason: string | null } {
  if (rr == null || !Number.isFinite(rr)) return { ok: false, reason: 'no valid plan (entry/stop/target missing or zero risk)' };
  const r = Math.round(rr * 100) / 100;
  if (r + 1e-9 >= minRr) return { ok: true, reason: null };
  return { ok: false, reason: `R:R to T1 ${r.toFixed(2)} < ${minRr.toFixed(2)} on an ATR-floored stop` };
}
