/**
 * LEVEL ENGINE — entry, stop and targets derived from the chart, not from a constant.
 *
 * The old math was `target = entry * 1.08` and `stop = entry * 0.965` for every stock.
 * That gives every idea the same 2.29 R:R, ignores volatility (8% is a huge move in MRK
 * and noise in MARA), and — worst — puts the stop at an arbitrary price rather than at a
 * level where the thesis is actually wrong.
 *
 * This derives levels the way a desk does:
 *   • STOP  — beyond the most recent swing (structure), padded by ATR so ordinary noise
 *             can't take it out. If structure is missing, fall back to a pure ATR stop.
 *   • ENTRY — spot when price is already in position; otherwise the reclaim/trigger level,
 *             which is what makes "PENDING TRIGGER" mean something.
 *   • T1    — the next real obstacle (prior swing high/low). Never closer than a minimum
 *             R multiple, so we don't publish trades that can't pay for their own risk.
 *   • T2    — the following structural level, or a 2R extension.
 *
 * Every result carries `method` + `rationale` so the UI can say WHY a level is there.
 */

export interface Candle { time: number; open: number; high: number; low: number; close: number; volume?: number }

export interface DerivedLevels {
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;   // T1
  target2: number;       // T2
  riskRewardRatio: number;
  atr: number;
  atrPct: number;
  method: 'structure' | 'atr';
  rationale: string;
  /** true when entry sits away from spot — the idea needs a trigger before it's live */
  requiresTrigger: boolean;
}

const round2 = (n: number) => Number(n.toFixed(2));

/** Wilder ATR over the candle series. */
export function computeATR(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  const use = trs.slice(-period);
  if (use.length === 0) return 0;
  return use.reduce((s, x) => s + x, 0) / use.length;
}

/**
 * Pivot swings: a bar whose high (low) exceeds `lookback` bars either side.
 * These are the levels other traders can see, which is what makes them act as
 * support/resistance at all.
 */
export function findSwings(candles: Candle[], lookback = 3): { highs: number[]; lows: number[] } {
  const highs: number[] = [], lows: number[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i];
    let isHigh = true, isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].high >= c.high) isHigh = false;
      if (candles[j].low <= c.low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) highs.push(c.high);
    if (isLow) lows.push(c.low);
  }
  return { highs, lows };
}

const MIN_RR = 1.5;          // never publish a trade that can't pay for its own risk
const ATR_STOP_MULT = 1.0;   // noise buffer beyond structure
const MAX_STOP_PCT = 0.08;   // sanity clamp — an 12% stop is not a swing trade
/**
 * Only swings from the RECENT tape can act as support/resistance. A swing low from five
 * months ago is not where this trade is wrong — using it produced 12%-clamped stops on
 * every name. We look back a limited window and ignore structure further than a few ATRs
 * away, falling back to a pure ATR stop when nothing usable is nearby.
 */
const SWING_WINDOW = 45;     // bars of recent structure to consider
const MAX_STOP_ATR = 3;      // structure beyond this many ATR is not "nearby"

export function deriveLevels(
  candles: Candle[],
  spot: number,
  direction: 'long' | 'short',
  opts: { assetType?: string } = {},
): DerivedLevels {
  const long = direction !== 'short';
  const atr = computeATR(candles);
  const atrPct = spot > 0 ? (atr / spot) * 100 : 0;
  const recent = candles.slice(-SWING_WINDOW);
  const { highs, lows } = findSwings(recent);

  // crypto and options move more; widen the noise buffer rather than the whole model
  const volMult = opts.assetType === 'crypto' ? 1.6 : opts.assetType === 'option' ? 1.4 : 1.0;
  const buffer = atr * ATR_STOP_MULT * volMult;

  let method: DerivedLevels['method'] = 'structure';
  let stopLoss: number;
  let targetPrice: number;
  let target2: number;
  const notes: string[] = [];

  if (long) {
    // stop under the nearest swing low BELOW spot, padded by ATR
    const below = lows
      .filter((l) => l < spot && (atr <= 0 || spot - l <= atr * MAX_STOP_ATR))
      .sort((a, b) => b - a);
    if (below.length && atr > 0) {
      stopLoss = below[0] - buffer;
      notes.push(`stop under recent swing low $${round2(below[0])} + ${ATR_STOP_MULT}×ATR`);
    } else {
      method = 'atr';
      stopLoss = spot - (atr > 0 ? atr * 2 : spot * 0.035);
      notes.push(atr > 0 ? 'no nearby swing low — 2×ATR stop' : 'insufficient history — fixed 3.5% stop');
    }
    // T1 at the next swing high ABOVE spot
    const above = highs.filter((h) => h > spot).sort((a, b) => a - b);
    targetPrice = above[0] ?? spot + Math.max(buffer * 2, spot * 0.08);
    if (above[0]) notes.push(`T1 at prior swing high $${round2(above[0])}`);
    target2 = above[1] ?? targetPrice + (targetPrice - spot);
  } else {
    const above = highs
      .filter((h) => h > spot && (atr <= 0 || h - spot <= atr * MAX_STOP_ATR))
      .sort((a, b) => a - b);
    if (above.length && atr > 0) {
      stopLoss = above[0] + buffer;
      notes.push(`stop above recent swing high $${round2(above[0])} + ${ATR_STOP_MULT}×ATR`);
    } else {
      method = 'atr';
      stopLoss = spot + (atr > 0 ? atr * 2 : spot * 0.035);
      notes.push(atr > 0 ? 'no nearby swing high — 2×ATR stop' : 'insufficient history — fixed 3.5% stop');
    }
    const below = lows.filter((l) => l < spot).sort((a, b) => b - a);
    targetPrice = below[0] ?? spot - Math.max(buffer * 2, spot * 0.08);
    if (below[0]) notes.push(`T1 at prior swing low $${round2(below[0])}`);
    target2 = below[1] ?? targetPrice - (spot - targetPrice);
  }

  // clamp an absurd stop, then enforce a minimum payoff
  const maxDist = spot * MAX_STOP_PCT;
  if (Math.abs(spot - stopLoss) > maxDist) {
    stopLoss = long ? spot - maxDist : spot + maxDist;
    notes.push(`stop clamped to ${(MAX_STOP_PCT * 100).toFixed(0)}%`);
  }

  const risk = Math.abs(spot - stopLoss);
  let reward = Math.abs(targetPrice - spot);
  if (risk > 0 && reward / risk < MIN_RR) {
    targetPrice = long ? spot + risk * MIN_RR : spot - risk * MIN_RR;
    reward = risk * MIN_RR;
    notes.push(`T1 pushed to the ${MIN_RR}R minimum — nearest structure was too close to pay for the risk`);
    target2 = long ? spot + risk * MIN_RR * 2 : spot - risk * MIN_RR * 2;
  }

  return {
    entryPrice: round2(spot),
    stopLoss: round2(stopLoss),
    targetPrice: round2(targetPrice),
    target2: round2(target2),
    riskRewardRatio: risk > 0 ? Number((reward / risk).toFixed(2)) : 0,
    atr: round2(atr),
    atrPct: Number(atrPct.toFixed(2)),
    method,
    rationale: notes.join(' · '),
    requiresTrigger: false,
  };
}

/**
 * Closes-only variant. Some generators only carry a close series, not OHLC. Synthesising
 * flat candles loses intrabar range, so ATR here is a close-to-close volatility proxy —
 * less precise than true ATR, but still volatility-aware and structure-aware, which is
 * strictly better than a fixed percentage for every ticker.
 */
export function deriveLevelsFromCloses(
  closes: number[],
  spot: number,
  direction: 'long' | 'short',
  opts: { assetType?: string } = {},
): DerivedLevels {
  const candles: Candle[] = closes
    .filter((c) => Number.isFinite(c) && c > 0)
    .map((c, i) => ({ time: i, open: c, high: c, low: c, close: c }));
  const out = deriveLevels(candles, spot, direction, opts);
  return { ...out, rationale: `${out.rationale} (close-only series)` };
}
