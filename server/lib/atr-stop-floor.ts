/**
 * VOLATILITY STOP FLOOR — one implementation for every producer.
 *
 * Validated 2026-09-24 (research/stop-floor-test.ts): stop width was the
 * strongest measured loss driver (IC +0.30, holds within every producer); the
 * median published stop sat at 0.59× the stock's own daily range, so ordinary
 * noise took ideas out. Widening swing/position stops to 1.25× ATR(14) cut the
 * out-of-sample loss from −0.225R to −0.115R per idea (n=332). Day trades are
 * excluded (a daily ATR is the wrong yardstick intraday). The target is kept;
 * R:R is restated honestly. SR 11-7 v6 keeps the floor at "measuring".
 *
 * This lived inline in server/trade-idea-ingestion.ts (Gate 5), so producers
 * that write through storage.createTradeIdea directly — gex_scanner,
 * gex_magnet — and the GEX→desk path never got it: 33 of 50 gex_scanner swing
 * stops since 09-24 were tighter than 1.2 ATR (SR 11-7 v6 F-8). Every one of
 * them now calls applyAtrStopFloor().
 */
import { readStopAtrMult } from '../../shared/wide-stops';

export const ATR_STOP_FLOOR_K = 1.25;

/**
 * PHASE 2 SWITCH (2026-10-07, shared/wide-stops.ts): NEXUS_STOP_ATR_MULT replaces
 * the 1.25× floor with the bot's wider rule — stop = further of the structural
 * level and k×ATR — for every producer that calls this module. Unset (default) =
 * today's 1.25× floor, unchanged. One switch to flip after the bot proves it.
 */
export function nexusStopAtrK(env: Record<string, string | undefined> = process.env): number {
  return readStopAtrMult(env.NEXUS_STOP_ATR_MULT, null) ?? ATR_STOP_FLOOR_K;
}

export interface DailyBar { high: number; low: number; close: number }

export interface AtrFloorInput {
  symbol: string;
  /** Underlying entry (the plan's price, not an option premium). */
  entry: number | null | undefined;
  stop: number | null | undefined;
  target?: number | null;
  /** 'long'/'short'/'bullish'/'bearish' — anything matching /short|bear/ is short. */
  direction: string;
  holdingPeriod?: string | null;
  assetType?: string | null;
}

export interface AtrFloorResult {
  stopLoss: number | null | undefined;
  widened: boolean;
  atr: number | null;
  /** Human-readable restatement, '' when unchanged. */
  note: string;
  /** Target ÷ risk on the (possibly widened) stop, when a target is known. */
  riskRewardRatio: number | null;
}

/** 14-period simple average true range from the last 15 daily bars (null with fewer). */
export function atr14(daily: DailyBar[]): number | null {
  const d = daily.slice(-16);
  if (d.length < 15) return null;
  const tr = d.slice(1).map((b, i) => Math.max(b.high - b.low, Math.abs(b.high - d[i].close), Math.abs(b.low - d[i].close)));
  const atr = tr.reduce((a, b) => a + b, 0) / tr.length;
  return Number.isFinite(atr) && atr > 0 ? atr : null;
}

/** Does the floor apply to this plan at all? Swing/position, non-crypto, with numeric entry and stop. */
export function atrFloorApplies(i: AtrFloorInput): boolean {
  return typeof i.stop === 'number' && Number.isFinite(i.stop)
    && typeof i.entry === 'number' && Number.isFinite(i.entry) && i.entry > 0
    && i.holdingPeriod !== 'day' && i.assetType !== 'crypto';
}

const rr = (entry: number, stop: number, target: number | null | undefined): number | null =>
  typeof target === 'number' && Number.isFinite(target) && entry !== stop ? Math.abs(target - entry) / Math.abs(entry - stop) : null;

/** Pure: widen the stop to k× ATR (1.25 unless NEXUS_STOP_ATR_MULT is set) when it sits inside it. */
export function computeAtrStopFloor(i: AtrFloorInput, daily: DailyBar[], k: number = nexusStopAtrK()): AtrFloorResult {
  const unchanged = (atr: number | null): AtrFloorResult => ({
    stopLoss: i.stop, widened: false, atr, note: '',
    riskRewardRatio: typeof i.entry === 'number' && typeof i.stop === 'number' ? rr(i.entry, i.stop, i.target) : null,
  });
  if (!atrFloorApplies(i)) return unchanged(null);
  const entry = i.entry as number, stop = i.stop as number;
  const atr = atr14(daily);
  if (atr == null) return unchanged(null);
  const floor = k * atr;
  if (Math.abs(entry - stop) >= floor) return unchanged(atr);
  const isLong = !/short|bear/i.test(String(i.direction));
  // Same rule as shared/wide-stops.ts widenStop (further of structural and k×ATR), kept
  // in this cent-exact form so the default 1.25× output is byte-identical to before.
  const widened = Number((isLong ? entry - floor : entry + floor).toFixed(2));
  if (!(widened > 0)) return unchanged(atr);
  const newR = rr(entry, widened, i.target);
  const tgt = i.target;
  const note = `Stop widened from $${stop.toFixed(2)} to $${widened.toFixed(2)} (${k}× ATR $${atr.toFixed(2)}): stops inside a normal day's range were the #1 measured loss driver. ` +
    `$${stop.toFixed(2)} stays the thesis line (a close through it means the read was wrong); the hard stop is $${widened.toFixed(2)}` +
    (newR != null && typeof tgt === 'number' ? `, so T1 $${tgt.toFixed(2)} is ${newR.toFixed(1)}R on this stop${newR < 1 ? ' — below 1R, size down or pass' : ''}.` : '.');
  return { stopLoss: widened, widened: true, atr, note, riskRewardRatio: newR };
}

/** Fetch 3 months of daily bars and apply the floor. Candles unavailable → the producer's stop unchanged. */
export async function applyAtrStopFloor(i: AtrFloorInput): Promise<AtrFloorResult> {
  if (!atrFloorApplies(i)) return computeAtrStopFloor(i, []);
  try {
    const { fetchCandles } = await import('../historical-candles');
    const daily = await fetchCandles(i.symbol, '3mo', '1d');
    return computeAtrStopFloor(i, daily);
  } catch {
    return computeAtrStopFloor(i, []);
  }
}
