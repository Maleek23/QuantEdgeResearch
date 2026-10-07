/**
 * SPX chart checks (2026-10-01): symbol aliases, cash-index session folding,
 * ETF volume proxy, ES-scaled extended-hours bars, overnight range, the
 * index/ETF ratio for dark-pool levels, option roots for flow, wall basis and
 * key-level picking. Fixtures mirror Yahoo ^GSPC / SPY / ES=F 5m bars measured
 * 2026-09-30 (SPX close 7651.54, flat 16:05–16:35 settlement bars).
 *   npx tsx scripts/test-spx-chart.ts
 */
import assert from 'node:assert/strict';
import {
  canonicalChartSymbol, indexInfo, isCashIndex, optionRootsFor, foldIndexSession, joinProxyVolume,
  buildFutureProxyBars, overnightRange, indexEtfRatio, isRthBar, type IdxBar,
} from '../shared/index-symbols';
import { assembleChartSeries } from '../server/historical-candles';
import { toYahooSymbol } from '../server/yahoo-client';
import { cboeKey } from '../server/lib/cboe-loader';
import { sessionVolumeFromMeta } from '../server/yahoo-client';
import { cleanCompareSymbol, mergeProxyBars } from '../client/src/components/charting/tv/indicators';
import { pickKeyLevels, dealerWallLines } from '../client/src/components/charting/chart-levels';

let passed = 0;
const ok = (name: string, fn: () => void) => { fn(); passed++; console.log(`  ✓ ${name}`); };

/** Epoch seconds for an ET wall time on 2026-09-29/30/10-01 (EDT, UTC−4). */
const et = (date: string, hhmm: string) => Math.floor(Date.parse(`${date}T${hhmm}:00-04:00`) / 1000);
const bar = (t: number, c: number, v = 1000, o = c, h = Math.max(o, c) + 1, l = Math.min(o, c) - 1): IdxBar => ({ time: t, open: o, high: h, low: l, close: c, volume: v });

/* ── 8. symbol aliases ── */
ok('aliases → SPX / NDX / VIX', () => {
  for (const s of ['SPX', 'spx', '$SPX', '^GSPC', 'GSPC', 'SPXW', 'SPX.X', '.SPX', '^SPX', ' $spx ', '%5EGSPC']) assert.equal(canonicalChartSymbol(s), 'SPX', s);
  assert.equal(canonicalChartSymbol('NDXP'), 'NDX');
  assert.equal(canonicalChartSymbol('$VIX'), 'VIX');
  assert.equal(canonicalChartSymbol('^VIX'), 'VIX');
  for (const s of ['NVDA', 'BTC-USD', 'ES=F', '^TNX', 'BRK.B']) assert.equal(canonicalChartSymbol(s), s);
  assert.equal(canonicalChartSymbol('$aapl'), 'AAPL');
  assert.ok(isCashIndex('SPXW') && !isCashIndex('SPY'));
});
ok('provider boundary: Yahoo + CBOE keys', () => {
  for (const s of ['SPX', '$SPX', 'SPXW', '^GSPC']) assert.equal(toYahooSymbol(s), '^GSPC', s);
  assert.equal(toYahooSymbol('NDXP'), '^NDX');
  assert.equal(toYahooSymbol('VIX'), '^VIX');
  assert.equal(toYahooSymbol('^VIX9D'), '^VIX9D');
  assert.equal(toYahooSymbol('nvda'), 'NVDA');
  assert.equal(cboeKey('SPX'), '_SPX');
  assert.equal(cboeKey('SPXW'), '_SPX', 'SPXW contracts live in the _SPX chain');
  assert.equal(cboeKey('^GSPC'), '_SPX');
  assert.equal(cboeKey('_NDX'), '_NDX');
  assert.equal(cboeKey('SPY'), 'SPY');
});
ok('compare box accepts index aliases', () => {
  assert.equal(cleanCompareSymbol('$spx'), 'SPX');
  assert.equal(cleanCompareSymbol('qqq'), 'QQQ');
});

/* ── 5. flow roots ── */
ok('option roots per chart', () => {
  assert.deepEqual(optionRootsFor('SPX'), ['SPX', 'SPXW']);
  assert.deepEqual(optionRootsFor('SPXW'), ['SPX', 'SPXW']);
  assert.deepEqual(optionRootsFor('NDX'), ['NDX', 'NDXP']);
  assert.deepEqual(optionRootsFor('NVDA'), ['NVDA']);
});

/* ── 1. session: fold Yahoo's post-close settlement bars ── */
const D = '2026-09-30';
const idxRaw: IdxBar[] = [
  bar(et(D, '09:30'), 7690), bar(et(D, '09:35'), 7700), bar(et(D, '15:50'), 7666.19), bar(et(D, '15:55'), 7653.56, 261615000, 7666.4, 7668.35, 7652.9),
  // Yahoo's ^GSPC 16:00–16:35 rows: the closing level re-printed (measured 2026-09-30)
  { time: et(D, '16:00'), open: 7652.38, high: 7652.74, low: 7651.54, close: 7651.57, volume: 767216000 },
  { time: et(D, '16:05'), open: 7651.58, high: 7651.58, low: 7651.54, close: 7651.54, volume: 61328000 },
  { time: et(D, '16:35'), open: 7651.54, high: 7651.54, low: 7651.54, close: 7651.54, volume: 14145000 },
];
const folded = foldIndexSession(idxRaw);
ok('post-16:00 index bars fold into the last regular bar', () => {
  assert.equal(folded.length, 4);
  const last = folded[3];
  assert.equal(last.time, et(D, '15:55'));
  assert.equal(last.close, 7651.54, 'the official close ends the last regular bar');
  assert.equal(last.low, 7651.54);
  assert.equal(last.high, 7668.35);
  assert.ok(folded.every((b) => isRthBar(b.time)));
});
ok('pre-09:30 index bars are dropped', () => {
  assert.equal(foldIndexSession([bar(et(D, '09:00'), 7680), bar(et(D, '09:30'), 7690)]).length, 1);
});

/* ── 2. volume proxy ── */
const spy: IdxBar[] = folded.map((b, i) => ({ ...b, open: b.open / 10.03, high: b.high / 10.03, low: b.low / 10.03, close: b.close / 10.03, volume: 500_000 + i }));
ok('index volume replaced by SPY volume (never the constituent sum)', () => {
  const j = joinProxyVolume(folded, spy, false);
  assert.deepEqual(j.map((b) => b.volume), [500_000, 500_001, 500_002, 500_003]);
  const missing = joinProxyVolume(folded, spy.slice(0, 2), false);
  assert.equal(missing[3].volume, 0, 'no SPY row → 0 (not the index figure)');
});
ok('daily volume joins by ET date', () => {
  const idxD = [bar(et(D, '09:30'), 7651.54, 4_276_550_000)];
  const spyD = [bar(et(D, '09:30') + 0, 762.63, 80_000_000)];
  assert.equal(joinProxyVolume(idxD, spyD, true)[0].volume, 80_000_000);
});

/* ── 1. extended hours from ES=F, scaled ── */
const ES = (t: string, d: string, c: number) => bar(et(d, t), c, 100);
const es: IdxBar[] = [
  ES('15:55', D, 7742.0), ES('16:00', D, 7743.0), ES('16:30', D, 7750.0), ES('18:00', D, 7745.0),
  ES('03:00', '2026-10-01', 7760.0), ES('08:00', '2026-10-01', 7743.75),
  ES('09:30', '2026-10-01', 7748.0), // RTH — never emitted
];
const ext = buildFutureProxyBars(folded, es);
ok('ES bars after the close are scaled so the first starts at the SPX close', () => {
  assert.equal(ext.anchors.length, 1);
  const r = 7651.54 / 7742.0;
  near(ext.anchors[0].ratio, r, 1e-9);
  assert.deepEqual(ext.bars.map((b) => b.time), [et(D, '16:00'), et(D, '16:30'), et(D, '18:00'), et('2026-10-01', '03:00'), et('2026-10-01', '08:00')]);
  assert.ok(ext.bars.every((b) => b.proxy === true && b.volume === 0));
  near(ext.bars[ext.bars.length - 1].close, Math.round(7743.75 * r * 100) / 100, 1e-9);
  assert.ok(!ext.bars.some((b) => isRthBar(b.time)), 'no proxy bar inside RTH');
});
ok('no anchor (future missing at the close) → no proxy bars', () => {
  assert.equal(buildFutureProxyBars(folded, [ES('03:00', '2026-10-01', 7760)]).bars.length, 0);
  assert.equal(buildFutureProxyBars([], es).bars.length, 0);
});
ok('chart merges proxy bars in time order, real bars win', () => {
  const m = mergeProxyBars(folded, [...ext.bars, { ...folded[0], proxy: true, close: 1 }]);
  assert.equal(m.length, folded.length + ext.bars.length);
  assert.ok(m.every((b, i) => i === 0 || b.time > m[i - 1].time));
  assert.notEqual(m[0].close, 1);
});

/* ── 6. overnight H/L ── */
ok('overnight range before the open is the forming window since the close', () => {
  const on = overnightRange(folded, ext.bars, Date.parse('2026-10-01T08:10:00-04:00'))!;
  assert.ok(on.forming);
  assert.equal(on.bars, 5);
  assert.equal(on.high, Math.max(...ext.bars.map((b) => b.high)));
});
ok('overnight range during RTH is the window that led into today', () => {
  const today = [...folded, bar(et('2026-10-01', '09:30'), 7660), bar(et('2026-10-01', '09:35'), 7665)];
  const on = overnightRange(today, ext.bars, Date.parse('2026-10-01T10:00:00-04:00'))!;
  assert.ok(!on.forming);
  assert.equal(on.toSec, et('2026-10-01', '08:00'));
});

/* ── server series assembly ── */
ok('assembleChartSeries: SPX intraday = RTH + SPY volume + labelled ES proxy', () => {
  const s = assembleChartSeries('$SPX', '5m', folded as any, spy as any, es as any);
  assert.equal(s.symbol, 'SPX');
  assert.equal(s.volume.proxy, true);
  assert.match(s.volume.source, /SPY/);
  assert.equal(s.data[0].volume, 500_000);
  assert.equal(s.session.kind, 'index-rth');
  assert.ok(s.extended && s.extended.bars.length === 5);
  assert.match(s.extended!.source, /ES=F/);
  assert.match(s.extended!.basis, /7651\.54/);
});
ok('assembleChartSeries: VIX keeps its own session, no volume, no proxy', () => {
  const s = assembleChartSeries('^VIX', '5m', [bar(et(D, '03:15'), 16, 0)] as any, null, null);
  assert.equal(s.symbol, 'VIX');
  assert.equal(s.session.kind, 'index-own-extended');
  assert.equal(s.volume.proxy, false);
  assert.equal(s.extended, null);
});
ok('assembleChartSeries: equities untouched', () => {
  const s = assembleChartSeries('NVDA', '5m', [bar(et(D, '04:00'), 180, 9)] as any, null, null);
  assert.equal(s.data[0].volume, 9);
  assert.equal(s.extended, null);
  assert.equal(s.session.kind, 'equity');
});

/* ── 4. dark-pool ratio ── */
ok('SPX/SPY ratio: live when prints are simultaneous, else regular closes', () => {
  const now = Date.now();
  const live = indexEtfRatio('SPX', { price: 7651.54, at: now }, { price: 762.63, at: now - 30_000 })!;
  assert.equal(live.basis, 'live');
  near(live.ratio, 7651.54 / 762.63, 1e-12);
  // 16:00 index close vs an 18:00 after-hours SPY print → use the closes
  const closes = indexEtfRatio('SPX', { price: 7651.54, at: now - 7_200_000, regularClose: 7651.54 }, { price: 765, at: now, regularClose: 762.63 })!;
  assert.equal(closes.basis, 'regular-close');
  near(closes.ratio, 7651.54 / 762.63, 1e-12);
  assert.equal(indexEtfRatio('SPX', { price: 76515, at: now }, { price: 762.63, at: now }), null, '10× off → rejected');
  assert.equal(indexEtfRatio('VIX', { price: 16, at: now }, { price: 16, at: now }), null);
});

/* ── 3. walls basis ── */
ok('walls: shared ≤7d basis (gex-wall-basis) first, all-expiry dashed and labelled', () => {
  const w = dealerWallLines({ callWall: 8000, putWall: 7000, gammaFlipPrice: 7600, byDte: { next7: { callWall: 7700, putWall: 7600, gammaFlipPrice: 7640, expirationsCount: 5 } } });
  assert.deepEqual(w.rows.map((r) => r.label), ['CALL WALL ≤7d', 'PUT WALL ≤7d', 'ZERO-γ ≤7d', 'CALL WALL all', 'PUT WALL all']);
  assert.ok(w.rows.filter((r) => r.label.endsWith('all')).every((r) => r.dashed));
  assert.match(w.basis, /next-7-day book \(expiries ≤7d, 5\)/);
  const noNear = dealerWallLines({ callWall: 8000, putWall: 7000 });
  assert.deepEqual(noNear.rows.map((r) => r.label), ['CALL WALL all exp.', 'PUT WALL all exp.']);
  assert.match(noNear.basis, /fallback/);
});

/* ── 6. key levels ── */
ok('key levels: PDH/PDL/PDC, ORB 15m, overnight labelled ONH/ONL', () => {
  const m = (price: number, kind: string, label: string) => ({ price, kind, label, source: 's', asOf: '' });
  const lv = pickKeyLevels({
    symbol: 'SPX', asOf: '', last: 7650, session: null, priorSession: null, notes: [],
    clusters: [
      { price: 7722.88, members: [m(7722.88, 'pdh', 'prior day high')] },
      { price: 7651.54, members: [m(7651.54, 'pdl', 'prior day low'), m(7651.54, 'pdc', 'prior day close')] },
      { price: 7700, members: [m(7700, 'or15_high', '15m opening-range high'), m(7700, 'round', 'round')] },
      { price: 7720, members: [m(7720, 'premkt_high', 'overnight high (ES=F→SPX)')] },
    ],
  });
  assert.deepEqual(lv.map((l) => l.label), ['PDH', 'PDL', 'PDC', 'ORH 15m', 'ONH']);
  assert.ok(lv.every((l) => l.dashed));
  assert.deepEqual(pickKeyLevels(null), []);
});

/* ── 7. session volume (header stat) ── */
ok('quote volume = session volume, 0 before the open (never one 1m bar)', () => {
  const regStart = 1790861400; // 2026-10-01 09:30 ET
  assert.equal(sessionVolumeFromMeta({ regularMarketVolume: 3_151_899_000, regularMarketTime: regStart - 60_000, currentTradingPeriod: { regular: { start: regStart } } }), 0);
  assert.equal(sessionVolumeFromMeta({ regularMarketVolume: 61_000_000, regularMarketTime: regStart + 3600, currentTradingPeriod: { regular: { start: regStart } } }), 61_000_000);
  assert.equal(sessionVolumeFromMeta({}), 0);
});

ok('index info: SPX proxies', () => {
  const i = indexInfo('SPXW')!;
  assert.equal(i.yahoo, '^GSPC');
  assert.equal(i.volumeProxy, 'SPY');
  assert.equal(i.extendedProxy, 'ES=F');
});

function near(a: number, b: number, eps: number) { assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`); }

console.log(`\nspx-chart: ${passed} passed`);
