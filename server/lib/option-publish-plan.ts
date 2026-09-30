/**
 * What an option idea from a producer that writes through
 * storage.createTradeIdea directly (gex_scanner, gex_magnet) is published with
 * once its contract is known:
 *
 *   • holdingPeriod from the contract's DTE (0 → day, 1–10 → swing, >10 →
 *     position — shared/option-expiry.ts), never the setup's own label.
 *     2026-09-30: gex_scanner stamped 16-DTE IWM puts 'day'; the Loss Rules
 *     time stop then closed them at 12:45 ET (SR 11-7 v6 F-7).
 *   • the same 1.25× ATR swing/position stop floor every ingested idea gets
 *     (server/lib/atr-stop-floor.ts). These producers bypassed the ingestion
 *     gate: 33 of 50 gex_scanner swing stops were under 1.2 ATR (F-8).
 *
 * `daily` injects bars for tests; production fetches them.
 */
import { calendarDaysToExpiry, holdingPeriodForDte, type IdeaHoldingPeriod } from '@shared/option-expiry';
import { applyAtrStopFloor, computeAtrStopFloor, type DailyBar } from './atr-stop-floor';
import { logger } from '../logger';

export interface OptionPublishPlan {
  holdingPeriod: IdeaHoldingPeriod;
  dte: number | null;
  stopLoss: number;
  riskRewardRatio: number;
  /** Restatement when the stop was widened, else ''. */
  note: string;
}

export async function optionPublishPlan(
  p: {
    symbol: string; direction: 'long' | 'short'; entry: number; stop: number; target: number;
    expiryDate: string | null | undefined; fallbackHolding: IdeaHoldingPeriod; nowMs?: number;
  },
  deps: { daily?: DailyBar[] } = {},
): Promise<OptionPublishPlan> {
  const dte = calendarDaysToExpiry(p.expiryDate, p.nowMs ?? Date.now());
  const holdingPeriod = holdingPeriodForDte(dte, { fallback: p.fallbackHolding });
  const input = { symbol: p.symbol, entry: p.entry, stop: p.stop, target: p.target, direction: p.direction, holdingPeriod, assetType: 'option' };
  const floored = deps.daily ? computeAtrStopFloor(input, deps.daily) : await applyAtrStopFloor(input);
  const stopLoss = floored.widened && typeof floored.stopLoss === 'number' ? floored.stopLoss : p.stop;
  const risk = Math.abs(p.entry - stopLoss);
  const riskRewardRatio = risk > 0 ? +(Math.abs(p.target - p.entry) / risk).toFixed(2) : 0;
  if (floored.widened) logger.info(`[OPTION-PUBLISH] ${p.symbol}: ${floored.note}`);
  return { holdingPeriod, dte, stopLoss, riskRewardRatio, note: floored.widened ? floored.note : '' };
}
