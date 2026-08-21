/**
 * THEME LEVERAGE — find the highest-torque expression of a macro driver, and the
 * one that has not caught up yet.
 *
 * This is an attempt to reverse-engineer the PROCESS behind calls like "HYMC:
 * $10B post-tax NPV against a $1B market cap, and every $100 on gold adds ~$300M
 * to NPV." Read as a stock tip that is unusable. Read as a method it decomposes
 * into four steps, and every one of them is computable:
 *
 *   1. NAME THE DRIVER.        Gold. Bitcoin. Semis. Rates. One series.
 *   2. MEASURE THE LEVERAGE.   Regress each candidate on the driver. Beta IS the
 *                              "every $100 adds $300M" claim, in price terms,
 *                              and it comes out of returns without needing a
 *                              reserve statement or an NPV model.
 *   3. CHECK IT ACTUALLY TRACKS. High beta with low R-squared is not leverage,
 *                              it is an unrelated volatile stock. This is the
 *                              step that separates a levered play from a lottery
 *                              ticket, and it is the one usually skipped.
 *   4. FIND WHAT HAS LAGGED.   Among names that genuinely track, which has NOT
 *                              yet delivered its beta? That residual is the
 *                              setup — the same shape as "MRNA outperformed QQQ
 *                              5x," just pointed the other way.
 *
 * What comes out is not a ticker list copied from someone else. It is the screen
 * that produced theirs, which means it keeps working after their book changes,
 * and it runs on any driver you can name — including ones they are not watching.
 *
 * Deliberately price-only. Fundamentals would sharpen step 2, but requiring them
 * would mean building nothing today, and the price relationship is the part that
 * actually has to hold for the trade to work.
 */

export interface LeverageInput {
  symbol: string;
  /** Aligned, same-length daily closes as the driver. */
  closes: number[];
}

export interface LeverageResult {
  symbol: string;
  /** Move per 1% of driver move. 3.0 = three-times torque. */
  beta: number;
  /** 0-1. How much of this name is explained by the driver. */
  rSquared: number;
  /** Driver's own move over the window, percent. */
  driverMovePct: number;
  /** This name's actual move, percent. */
  actualMovePct: number;
  /** What beta says it should have done, percent. */
  impliedMovePct: number;
  /** actual − implied. Negative = has not delivered its leverage yet. */
  residualPct: number;
  /** Composite 0-100. High = real tracking, real torque, and lagging. */
  catchUpScore: number;
  read: string;
}

function pctReturns(v: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < v.length; i++) {
    if (v[i - 1] > 0) out.push((v[i] - v[i - 1]) / v[i - 1]);
  }
  return out;
}

/** OLS slope and R² of y on x. */
function regress(x: number[], y: number[]): { beta: number; r2: number } {
  const n = Math.min(x.length, y.length);
  if (n < 20) return { beta: NaN, r2: NaN };
  const xs = x.slice(-n), ys = y.slice(-n);
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;

  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return { beta: NaN, r2: NaN };
  const beta = sxy / sxx;
  const r = sxy / Math.sqrt(sxx * syy);
  return { beta, r2: r * r };
}

/** Minimum R² below which "leverage" is really just unrelated volatility. */
export const MIN_TRACKING_R2 = 0.25;

export function measureLeverage(
  driverCloses: number[],
  candidates: LeverageInput[],
): LeverageResult[] {
  const dRet = pctReturns(driverCloses);
  if (dRet.length < 20) return [];

  const driverMovePct =
    driverCloses[0] > 0
      ? ((driverCloses[driverCloses.length - 1] - driverCloses[0]) / driverCloses[0]) * 100
      : 0;

  const out: LeverageResult[] = [];

  for (const c of candidates) {
    const cRet = pctReturns(c.closes);
    const n = Math.min(dRet.length, cRet.length);
    if (n < 20) continue;

    const { beta, r2 } = regress(dRet.slice(-n), cRet.slice(-n));
    if (!Number.isFinite(beta) || !Number.isFinite(r2)) continue;

    const first = c.closes[c.closes.length - n - 1] ?? c.closes[0];
    const last = c.closes[c.closes.length - 1];
    const actualMovePct = first > 0 ? ((last - first) / first) * 100 : 0;
    const impliedMovePct = driverMovePct * beta;
    const residualPct = actualMovePct - impliedMovePct;

    // Torque only counts when the relationship is real, so beta is gated on R².
    // Then reward the lag: a name that tracks and has NOT moved is the setup.
    const tracks = r2 >= MIN_TRACKING_R2;
    const torque = tracks ? Math.min(1, Math.abs(beta) / 3) : 0;
    const lag = residualPct < 0 ? Math.min(1, Math.abs(residualPct) / 30) : 0;
    const catchUpScore = Math.round((r2 * 0.35 + torque * 0.3 + lag * 0.35) * 100);

    const read = !tracks
      ? `Does not track the driver (R² ${r2.toFixed(2)}). A ${beta.toFixed(1)}x beta here is unrelated volatility, not leverage.`
      : residualPct < -8
        ? `${beta.toFixed(1)}x the driver and tracks it (R² ${r2.toFixed(2)}), but has delivered `
          + `${actualMovePct.toFixed(0)}% against ${impliedMovePct.toFixed(0)}% implied — ${Math.abs(residualPct).toFixed(0)} points behind.`
        : residualPct > 8
          ? `${beta.toFixed(1)}x and tracking, already ${residualPct.toFixed(0)} points AHEAD of what the driver justifies. `
            + `The move has been made.`
          : `${beta.toFixed(1)}x the driver, tracking closely, priced about where the driver puts it.`;

    out.push({
      symbol: c.symbol,
      beta: Math.round(beta * 100) / 100,
      rSquared: Math.round(r2 * 100) / 100,
      driverMovePct: Math.round(driverMovePct * 10) / 10,
      actualMovePct: Math.round(actualMovePct * 10) / 10,
      impliedMovePct: Math.round(impliedMovePct * 10) / 10,
      residualPct: Math.round(residualPct * 10) / 10,
      catchUpScore, read,
    });
  }

  return out.sort((a, b) => b.catchUpScore - a.catchUpScore);
}

/**
 * Drivers worth pointing this at. The value is that it works on ANY series —
 * these are a starting set, not a limit.
 */
export const DRIVERS: Record<string, { proxy: string; label: string }> = {
  gold:     { proxy: 'GLD',  label: 'Gold' },
  silver:   { proxy: 'SLV',  label: 'Silver' },
  bitcoin:  { proxy: 'IBIT', label: 'Bitcoin' },
  semis:    { proxy: 'SMH',  label: 'Semiconductors' },
  software: { proxy: 'IGV',  label: 'Software' },
  biotech:  { proxy: 'XBI',  label: 'Biotech' },
  energy:   { proxy: 'XLE',  label: 'Energy' },
  uranium:  { proxy: 'URA',  label: 'Uranium' },
};
