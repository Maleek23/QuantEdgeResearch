/**
 * BUILD-THEN-GATE — the quant sweep's plan, honest stop first, R:R second.
 *
 * Pure (daily bars injected). The producer's formula/structure stop is widened
 * to the shared ATR floor (server/lib/atr-stop-floor.ts — 1.25× ATR(14), or
 * NEXUS_STOP_ATR_MULT) BEFORE R:R is read, and the plan is then refused only if
 * T1 sits under MIN_RR_PUBLISH (default 1.0R) on that floored stop. The target
 * is never stretched to rescue R:R (shared/publish-rr.ts has the why).
 *
 * Unlike the ingestion Gate 5 this applies to every non-crypto plan with an
 * entry and stop, day holds included: the quant sweep decides its holding
 * period after the plan is built, and a daily-ATR stop on a plan whose target is
 * a daily-bar level is the consistent yardstick.
 */
import { computeAtrStopFloor, type DailyBar } from './atr-stop-floor';
import { readMinRrPublish, rrPublishVerdict, rrToT1 } from '@shared/publish-rr';

export interface PlanInput {
  symbol: string;
  direction: 'long' | 'short';
  entry: number;
  stop: number;
  target: number;
  assetType?: string | null;
}

export interface PlanVerdict {
  ok: boolean;
  entry: number;
  stop: number;
  target: number;
  rr: number | null;
  /** The producer's stop before the floor. */
  rawStop: number;
  widened: boolean;
  atr: number | null;
  minRr: number;
  /** Restatement when widened, else ''. */
  note: string;
  /** Refusal reason when !ok. */
  reason: string | null;
}

export function floorAndGatePlan(p: PlanInput, daily: DailyBar[], minRr: number = readMinRrPublish()): PlanVerdict {
  const base = { entry: p.entry, target: p.target, rawStop: p.stop, minRr };
  // holdingPeriod 'swing' so atrFloorApplies() is decided only by asset type and numbers.
  const f = computeAtrStopFloor({
    symbol: p.symbol, entry: p.entry, stop: p.stop, target: p.target, direction: p.direction,
    holdingPeriod: 'swing', assetType: p.assetType ?? 'stock',
  }, daily);
  const stop = f.widened && typeof f.stopLoss === 'number' ? f.stopLoss : p.stop;
  const rr = rrToT1(p.entry, stop, p.target);
  const v = rrPublishVerdict(rr, minRr);
  return { ...base, ok: v.ok, stop, rr, widened: f.widened, atr: f.atr, note: f.note, reason: v.reason };
}
