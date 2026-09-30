/**
 * PRICE CROSS-CHECK — compare the same daily bars / last price across providers and
 * REPORT disagreements. Never repairs, never picks a winner silently.
 *
 * Ported (idea and checks, not code) from vivek-v-rao/price-check, xprice_check.py
 * (MIT License, https://github.com/vivek-v-rao/price-check): tolerance = absolute
 * 1¢ AND relative 0.01% (a value disagrees only when it breaks both), duplicate
 * dates, non-positive prices, impossible OHLC ordering, >25% one-day return, dates
 * missing in one provider, pairwise diagnostics, optional median consensus.
 * Adapted to QuantEdge's providers and to a live last-price check.
 *
 * Pure functions, safe on server and client; the fetchers live in
 * server/price-crosscheck.ts.
 */

export interface DailyBar { date: string; open: number; high: number; low: number; close: number; volume?: number | null }

export interface ProviderSeries { provider: string; bars: DailyBar[]; note?: string }

export const CROSSCHECK_TOL = Object.freeze({ abs: 0.01, rel: 0.0001, maxDailyReturn: 0.25 });

export type BarIssueKind = 'duplicate_date' | 'nonpositive_price' | 'impossible_ohlc' | 'large_return';
export interface BarIssue { provider: string; date: string; kind: BarIssueKind; detail: string }

export function valuesDisagree(a: number, b: number, tol = CROSSCHECK_TOL): boolean {
  const d = Math.abs(a - b);
  const scale = Math.max(Math.abs(a), Math.abs(b));
  return d > tol.abs && d > tol.rel * scale;
}

/** Per-provider sanity checks on its own series (xprice_check's single-source checks). */
export function validateSeries(s: ProviderSeries, tol = CROSSCHECK_TOL): BarIssue[] {
  const out: BarIssue[] = [];
  const seen = new Set<string>();
  const bars = [...s.bars].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (seen.has(b.date)) out.push({ provider: s.provider, date: b.date, kind: 'duplicate_date', detail: 'date appears more than once' });
    seen.add(b.date);
    const px = [b.open, b.high, b.low, b.close];
    if (px.some((x) => !(x > 0))) out.push({ provider: s.provider, date: b.date, kind: 'nonpositive_price', detail: `O/H/L/C ${px.join('/')}` });
    else if (b.high < Math.max(b.open, b.close, b.low) || b.low > Math.min(b.open, b.close, b.high)) {
      out.push({ provider: s.provider, date: b.date, kind: 'impossible_ohlc', detail: `O ${b.open} H ${b.high} L ${b.low} C ${b.close}` });
    }
    if (i > 0 && bars[i - 1].close > 0 && b.close > 0) {
      const r = b.close / bars[i - 1].close - 1;
      if (Math.abs(r) > tol.maxDailyReturn) out.push({ provider: s.provider, date: b.date, kind: 'large_return', detail: `${(r * 100).toFixed(1)}% vs prior close` });
    }
  }
  return out;
}

export interface PairDiagnostics {
  a: string; b: string;
  commonDates: number;
  onlyInA: string[]; onlyInB: string[];
  mismatchedDates: number;
  maxAbsDiff: number;
  maxRelDiff: number;
  mismatches: Array<{ date: string; field: 'open' | 'high' | 'low' | 'close'; a: number; b: number }>;
}

const FIELDS = ['open', 'high', 'low', 'close'] as const;

export function comparePair(A: ProviderSeries, B: ProviderSeries, tol = CROSSCHECK_TOL, maxList = 10): PairDiagnostics {
  const ma = new Map(A.bars.map((b) => [b.date, b]));
  const mb = new Map(B.bars.map((b) => [b.date, b]));
  const onlyInA = [...ma.keys()].filter((d) => !mb.has(d)).sort();
  const onlyInB = [...mb.keys()].filter((d) => !ma.has(d)).sort();
  const common = [...ma.keys()].filter((d) => mb.has(d)).sort();
  let maxAbs = 0; let maxRel = 0; const mismatchDates = new Set<string>();
  const mismatches: PairDiagnostics['mismatches'] = [];
  for (const d of common) {
    const x = ma.get(d)!; const y = mb.get(d)!;
    for (const f of FIELDS) {
      const diff = Math.abs(x[f] - y[f]);
      const rel = diff / Math.max(Math.abs(x[f]), Math.abs(y[f]), 1e-12);
      if (diff > maxAbs) maxAbs = diff;
      if (rel > maxRel) maxRel = rel;
      if (valuesDisagree(x[f], y[f], tol)) {
        mismatchDates.add(d);
        if (mismatches.length < maxList) mismatches.push({ date: d, field: f, a: x[f], b: y[f] });
      }
    }
  }
  return { a: A.provider, b: B.provider, commonDates: common.length, onlyInA, onlyInB, mismatchedDates: mismatchDates.size, maxAbsDiff: maxAbs, maxRelDiff: maxRel, mismatches };
}

export function median(xs: number[]): number | null {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export interface LastPriceRead { provider: string; price: number; at: number | null; session?: string | null; delayed?: boolean }

export interface LastPriceCheck {
  reads: LastPriceRead[];
  consensus: number | null;
  /** Largest disagreement vs the median, in percent. */
  maxDevPct: number | null;
  /** Providers whose read disagrees with the median beyond `livePctTol`. */
  outliers: string[];
}

/**
 * Live last-price agreement. Live reads are taken seconds apart and some feeds
 * are delayed, so the tolerance is looser than the bar check (default 0.25%);
 * it is reported, not asserted.
 */
export function checkLastPrices(reads: LastPriceRead[], livePctTol = 0.25): LastPriceCheck {
  const ok = reads.filter((r) => r.price > 0);
  const consensus = median(ok.map((r) => r.price));
  if (consensus == null) return { reads, consensus: null, maxDevPct: null, outliers: [] };
  let maxDev = 0; const outliers: string[] = [];
  for (const r of ok) {
    const dev = Math.abs(r.price / consensus - 1) * 100;
    if (dev > maxDev) maxDev = dev;
    if (dev > livePctTol) outliers.push(r.provider);
  }
  return { reads, consensus, maxDevPct: Math.round(maxDev * 1000) / 1000, outliers };
}

export interface CrossCheckReport {
  symbol: string;
  asOf: string;
  platformProvider: string | null;
  platformPrice: number | null;
  daily: {
    providers: Array<{ provider: string; bars: number; first: string | null; last: string | null; note?: string }>;
    issues: BarIssue[];
    pairs: PairDiagnostics[];
    consensusClose: Array<{ date: string; close: number | null; n: number }>;
  };
  last: LastPriceCheck;
  verdict: 'agree' | 'disagree' | 'insufficient';
  notes: string[];
}

export function buildCrossCheck(
  symbol: string,
  series: ProviderSeries[],
  lastReads: LastPriceRead[],
  platform: { provider: string | null; price: number | null },
  tol = CROSSCHECK_TOL,
): CrossCheckReport {
  const usable = series.filter((s) => s.bars.length > 0);
  const issues = usable.flatMap((s) => validateSeries(s, tol));
  const pairs: PairDiagnostics[] = [];
  for (let i = 0; i < usable.length; i++) for (let j = i + 1; j < usable.length; j++) pairs.push(comparePair(usable[i], usable[j], tol));
  const dates = [...new Set(usable.flatMap((s) => s.bars.map((b) => b.date)))].sort().slice(-10);
  const consensusClose = dates.map((d) => {
    const cs = usable.map((s) => s.bars.find((b) => b.date === d)?.close).filter((x): x is number => x != null);
    return { date: d, close: median(cs), n: cs.length };
  });
  const last = checkLastPrices(lastReads);
  const notes: string[] = [];
  const barDisagree = pairs.some((p) => p.mismatchedDates > 0);
  if (usable.length < 2) notes.push('fewer than two providers returned daily bars — nothing to compare');
  const verdict: CrossCheckReport['verdict'] =
    usable.length < 2 && (last.reads.filter((r) => r.price > 0).length < 2) ? 'insufficient'
      : barDisagree || last.outliers.length ? 'disagree' : 'agree';
  return {
    symbol, asOf: new Date().toISOString(),
    platformProvider: platform.provider, platformPrice: platform.price,
    daily: {
      providers: series.map((s) => ({ provider: s.provider, bars: s.bars.length, first: s.bars[0]?.date ?? null, last: s.bars[s.bars.length - 1]?.date ?? null, note: s.note })),
      issues, pairs, consensusClose,
    },
    last, verdict, notes,
  };
}
