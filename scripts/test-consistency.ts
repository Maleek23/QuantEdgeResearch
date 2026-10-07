/**
 * Unit tests for the canonical cross-surface functions (consistency audit 2026-09-29):
 *   shared/price-change.ts     one "% change today"
 *   shared/gex-buckets.ts      one set of per-horizon GEX levels
 *   shared/conviction-bands.ts one raw-score → band → letter table
 *   shared/model-record.ts     one model record (baseline, outcome v2, floor)
 *   shared/price-crosscheck.ts provider agreement (price-check port)
 *   npm run test:consistency
 */
import assert from 'node:assert/strict';
import { dayChangeFromIntradayChart, priorCloseFromDaily, priorRegularCloseFromDailyChart, changeFromPercent, sessionAt, pctChange } from '../shared/price-change';
import { bucketForDte, bucketizeLegs, summarizeBucketLegs, GEX_DTE_BUCKETS, type BucketLeg } from '../shared/gex-buckets';
import { gexPer1Pct, bsGamma, gammaProfile, type GammaContract } from '../shared/gex-math';
import { convictionBandForScore, convictionLetterGrade, CONVICTION_BAND_CUTOFFS } from '../shared/conviction-bands';
import { computeModelRecord, etDateKey } from '../shared/model-record';
import { valuesDisagree, validateSeries, comparePair, checkLastPrices, buildCrossCheck } from '../shared/price-crosscheck';

let n = 0;
const t = (name: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`FAIL ${name}`); throw e; } };

// ── price-change ─────────────────────────────────────────────────────────
const period = { pre: { start: 1000, end: 2000 }, regular: { start: 2000, end: 3000 }, post: { start: 3000, end: 4000 } };
t('intraday chart: latest print vs prior regular close, session labelled', () => {
  const res = { meta: { regularMarketPrice: 764.2, chartPreviousClose: 765.61, previousClose: 765.61, currentTradingPeriod: period },
    timestamp: [2500, 3500, 3600], indicators: { quote: [{ close: [764.0, 765.3, null] }] } };
  const d = dayChangeFromIntradayChart(res)!;
  assert.equal(d.price, 765.3); assert.equal(d.previousClose, 765.61); assert.equal(d.session, 'post');
  assert.ok(Math.abs(d.changePercent - ((765.3 - 765.61) / 765.61) * 100) < 1e-9);
  assert.ok(Math.abs(d.regularChangePercent! - ((764.2 - 765.61) / 765.61) * 100) < 1e-9);
});
t('the range=2d trap: daily bars give the prior close, not chartPreviousClose', () => {
  // prod 2026-09-29: chartPreviousClose for range=2d was 771.4 (two sessions back)
  assert.deepEqual(priorCloseFromDaily([765.61, 764.2]), { last: 764.2, prev: 765.61 });
  assert.equal(priorCloseFromDaily([null, 5]), null);
});
t('prior regular close from a daily chart, pre-market and in-session', () => {
  const day = (d: string) => Date.parse(`${d}T13:30:00Z`) / 1000;
  const res = { meta: { regularMarketTime: day('2026-09-29') + 3600 }, timestamp: [day('2026-09-25'), day('2026-09-28'), day('2026-09-29')], indicators: { quote: [{ close: [771.4, 765.61, 764.2] }] } };
  assert.equal(priorRegularCloseFromDailyChart(res), 765.61);
  const pre = { meta: { regularMarketTime: day('2026-09-29') + 3600 }, timestamp: [day('2026-09-25'), day('2026-09-28')], indicators: { quote: [{ close: [771.4, 765.61] }] } };
  assert.equal(priorRegularCloseFromDailyChart(pre), 765.61);
});
t('change from percent uses prev close as the base', () => {
  assert.ok(Math.abs(changeFromPercent(110, 10) - 10) < 1e-9); // v1 said 11
  assert.equal(sessionAt(null, period), 'closed');
  assert.equal(pctChange(0, 1), null);
});

// ── GEX buckets ──────────────────────────────────────────────────────────
t('buckets are half-open: a contract lands in exactly one', () => {
  assert.equal(bucketForDte(0.5), 'today'); assert.equal(bucketForDte(1), 'week'); assert.equal(bucketForDte(7.9), 'week');
  assert.equal(bucketForDte(8), 'month'); assert.equal(bucketForDte(400), 'leaps'); assert.equal(bucketForDte(-1), null);
  for (let i = 1; i < GEX_DTE_BUCKETS.length; i++) assert.equal(GEX_DTE_BUCKETS[i].min, GEX_DTE_BUCKETS[i - 1].max);
});
function book(spot: number): BucketLeg[] {
  const legs: BucketLeg[] = [];
  const T = 5 / 365;
  for (let k = spot * 0.6; k <= spot * 1.4; k += spot * 0.01) {
    const strike = Math.round(k);
    // deep OTM puts carry OI at the lowest strikes (what broke the cumulative flip)
    const callOI = strike > spot ? 5000 : 1000; const putOI = strike < spot ? 6000 : 800;
    for (const [isCall, oi] of [[true, callOI], [false, putOI]] as const) {
      const g = bsGamma(spot, strike, T, 0.25);
      legs.push({ strike, dte: 5, isCall, oi, gexDollars: gexPer1Pct(g, oi, spot), T, iv: 0.25 });
    }
  }
  return legs;
}
t('bucket flip = re-priced zero-gamma near spot, never the lowest strike', () => {
  const spot = 765; const legs = book(spot);
  const s = summarizeBucketLegs(legs, spot);
  const lowest = Math.min(...legs.map((l) => l.strike));
  assert.notEqual(s.gammaFlipPrice, lowest);
  if (s.gammaFlipPrice != null) assert.ok(s.gammaFlipPrice > spot * 0.8 && s.gammaFlipPrice < spot * 1.2);
  const contracts: GammaContract[] = legs.map((l) => ({ strike: l.strike, T: l.T!, iv: l.iv!, oi: l.oi, isCall: l.isCall }));
  const ref = gammaProfile(contracts, spot, { lo: 0.8, hi: 1.2, steps: 80 }).zeroGamma;
  assert.equal(s.gammaFlipPrice, ref == null ? null : Math.round(ref * 100) / 100);
});
t('bucket walls: call above spot, put below; units $B per 1%', () => {
  const spot = 765; const s = summarizeBucketLegs(book(spot), spot);
  assert.ok(s.callWall! > spot); assert.ok(s.putWall! < spot);
  assert.ok(Math.abs(s.dealerFlowPer1Pct - s.totalGEX * 1e9) < 1e-3);
  const b = bucketizeLegs([...book(spot), ...book(spot).map((l) => ({ ...l, dte: 40 }))], spot);
  // 'next7' (≤7d book, kept outside the disjoint buckets) since 1e44042b.
  assert.deepEqual(Object.keys(b).sort(), ['next7', 'quarter', 'week']);
});
t('no IV → flip null, not invented', () => {
  const s = summarizeBucketLegs(book(765).map((l) => ({ ...l, iv: undefined })), 765);
  assert.equal(s.gammaFlipPrice, null);
});

// ── conviction grade ─────────────────────────────────────────────────────
t('letter grade is monotone and aligned with bands', () => {
  let prev = 99;
  const order = ['F', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+'];
  for (let s = 0; s <= 60; s++) {
    const g = convictionLetterGrade(s); const band = convictionBandForScore(s);
    const i = order.indexOf(g); assert.ok(i >= 0);
    if (prev !== 99) assert.ok(i >= prev); prev = i;
    const expected = band === 'S' ? 'A' : band === 'A' ? 'B' : band === 'B' ? 'C' : null;
    if (expected) assert.equal(g[0], expected, `score ${s} band ${band} grade ${g}`);
  }
  assert.equal(convictionLetterGrade(CONVICTION_BAND_CUTOFFS.A), 'B-'); // A-band entry letter — Discord now passes it by band
  assert.equal(convictionLetterGrade(NaN), 'F');
});

// ── model record ─────────────────────────────────────────────────────────
t('model record: baseline, synthetic and excluded rows out; floor', () => {
  const idea = (o: any) => ({ timestamp: '2026-09-10T15:00:00Z', outcomeStatus: 'hit_target', percentGain: 40, ...o });
  const rows = [
    ...Array.from({ length: 20 }, () => idea({})),
    ...Array.from({ length: 15 }, () => idea({ outcomeStatus: 'hit_stop', percentGain: -50 })),
    idea({ outcomeStatus: 'open', percentGain: null }),
    idea({ timestamp: '2026-08-01T15:00:00Z' }),
    idea({ dataSourceUsed: 'backfill_synthetic' }),
    idea({ excludeFromTraining: true }),
  ];
  const r = computeModelRecord(rows as any);
  assert.equal(r.wins, 20); assert.equal(r.losses, 15); assert.equal(r.unresolved, 1);
  assert.deepEqual(r.excluded, { beforeBaseline: 1, excludedFromTraining: 1, synthetic: 1 });
  assert.equal(r.winRate, 57.1);
  assert.equal(computeModelRecord(rows.slice(0, 10) as any).winRate, null); // under the floor: null, never 0
  assert.equal(etDateKey(Date.parse('2026-09-30T02:00:00Z')), '2026-09-29'); // 10pm ET is still the 29th
});

// ── price cross-check ────────────────────────────────────────────────────
t('tolerance is 1c AND 0.01%', () => {
  assert.equal(valuesDisagree(100, 100.009), false);
  assert.equal(valuesDisagree(100, 100.02), true);
  assert.equal(valuesDisagree(1_000_000, 1_000_000.5), false); // 0.00005% relative
});
t('series checks: duplicates, non-positive, impossible OHLC, large return', () => {
  const issues = validateSeries({ provider: 'x', bars: [
    { date: '2026-09-01', open: 10, high: 11, low: 9, close: 10 },
    { date: '2026-09-01', open: 10, high: 11, low: 9, close: 10 },
    { date: '2026-09-02', open: 10, high: 9, low: 8, close: 10 },
    { date: '2026-09-03', open: 0, high: 1, low: 0, close: 1 },
    { date: '2026-09-04', open: 20, high: 21, low: 19, close: 20 },
  ] });
  const kinds = [...new Set(issues.map((i) => i.kind))].sort();
  assert.deepEqual(kinds, ['duplicate_date', 'impossible_ohlc', 'large_return', 'nonpositive_price']);
});
t('pairwise diagnostics + last-price consensus', () => {
  const A = { provider: 'yahoo', bars: [{ date: 'd1', open: 1, high: 2, low: 1, close: 2 }, { date: 'd2', open: 2, high: 3, low: 2, close: 3 }] };
  const B = { provider: 'alpaca', bars: [{ date: 'd1', open: 1, high: 2, low: 1, close: 2.05 }, { date: 'd3', open: 2, high: 3, low: 2, close: 3 }] };
  const p = comparePair(A, B);
  assert.equal(p.commonDates, 1); assert.equal(p.mismatchedDates, 1); assert.deepEqual(p.onlyInA, ['d2']); assert.deepEqual(p.onlyInB, ['d3']);
  const lc = checkLastPrices([{ provider: 'a', price: 100, at: 0 }, { provider: 'b', price: 100.1, at: 0 }, { provider: 'c', price: 101, at: 0 }]);
  assert.equal(lc.consensus, 100.1); assert.deepEqual(lc.outliers, ['c']);
  const rep = buildCrossCheck('X', [A, B], [], { provider: 'yahoo', price: 3 });
  assert.equal(rep.verdict, 'disagree'); assert.equal(rep.platformProvider, 'yahoo');
});

console.log(`consistency: ${n} tests passed`);
