/**
 * TREND INDICATORS — pure, shared (server, research, tests). No I/O.
 * ==================================================================
 * One implementation of the EMA and Welles Wilder's DMI/ADX so every engine
 * that reads "trend strength" reads the same number.
 *
 * WILDER DMI / ADX (New Concepts in Technical Trading Systems, 1978), period n:
 *   bar i ≥ 1:  up = H[i] − H[i−1], down = L[i−1] − L[i]
 *               +DM = up   if up > down and up > 0, else 0
 *               −DM = down if down > up and down > 0, else 0
 *               TR  = max(H − L, |H − C[i−1]|, |L − C[i−1]|)
 *   Wilder smoothing of TR/+DM/−DM: the first value (at bar n) is the SUM of
 *   bars 1..n; after that  S[i] = S[i−1] − S[i−1]/n + x[i].
 *   +DI = 100·S(+DM)/S(TR), −DI = 100·S(−DM)/S(TR)            (defined from bar n)
 *   DX  = 100·|+DI − −DI| / (+DI + −DI)                        (defined from bar n)
 *   ADX: first value (bar 2n−1) = mean of the first n DX values;
 *        after that ADX[i] = (ADX[i−1]·(n−1) + DX[i]) / n.
 * Undefined positions are NaN, so every series is index-aligned with its bars.
 * Verified against the `technicalindicators` package's ADX (same Wilder
 * definition) in scripts/test-holy-grail.ts.
 */

/** EMA aligned to `values`: NaN for the first period−1 bars, seeded with the SMA of the first `period` values. */
export function emaSeries(values: readonly number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period < 1 || values.length < period) return out;
  const k = 2 / (period + 1);
  let s = 0;
  for (let i = 0; i < period; i++) s += values[i];
  let e = s / period;
  out[period - 1] = e;
  for (let i = period; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
    out[i] = e;
  }
  return out;
}

export interface DmiSeries {
  plusDI: number[];
  minusDI: number[];
  dx: number[];
  adx: number[];
}

/** Wilder DMI + ADX, index-aligned with the input bars (NaN where undefined). */
export function wilderDmi(high: readonly number[], low: readonly number[], close: readonly number[], period = 14): DmiSeries {
  const n = Math.min(high.length, low.length, close.length);
  const plusDI = new Array<number>(n).fill(NaN);
  const minusDI = new Array<number>(n).fill(NaN);
  const dx = new Array<number>(n).fill(NaN);
  const adx = new Array<number>(n).fill(NaN);
  if (period < 1 || n <= period) return { plusDI, minusDI, dx, adx };
  let sTR = 0, sP = 0, sM = 0;
  let dxSum = 0, dxCount = 0, prevAdx = NaN;
  for (let i = 1; i < n; i++) {
    const up = high[i] - high[i - 1];
    const down = low[i - 1] - low[i];
    const pdm = up > down && up > 0 ? up : 0;
    const mdm = down > up && down > 0 ? down : 0;
    const tr = Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1]));
    if (i <= period) {
      sTR += tr; sP += pdm; sM += mdm;
      if (i < period) continue;
    } else {
      sTR = sTR - sTR / period + tr;
      sP = sP - sP / period + pdm;
      sM = sM - sM / period + mdm;
    }
    const p = sTR > 0 ? (100 * sP) / sTR : 0;
    const m = sTR > 0 ? (100 * sM) / sTR : 0;
    plusDI[i] = p; minusDI[i] = m;
    const d = p + m > 0 ? (100 * Math.abs(p - m)) / (p + m) : 0;
    dx[i] = d;
    if (dxCount < period) {
      dxSum += d; dxCount++;
      if (dxCount === period) { prevAdx = dxSum / period; adx[i] = prevAdx; }
    } else {
      prevAdx = (prevAdx * (period - 1) + d) / period;
      adx[i] = prevAdx;
    }
  }
  return { plusDI, minusDI, dx, adx };
}

/** Last defined value of a series, or null. */
export function lastDefined(series: readonly number[]): number | null {
  for (let i = series.length - 1; i >= 0; i--) if (Number.isFinite(series[i])) return series[i];
  return null;
}
