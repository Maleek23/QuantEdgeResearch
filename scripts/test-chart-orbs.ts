/**
 * test-chart-orbs — the CHART tab's dealer nodes ("orbs"), expiry horizon,
 * 5-min snapshots + retention, replay rule and expected move.
 *   npx tsx scripts/test-chart-orbs.ts       (npm run test:chart-orbs)
 * Pure: no DB, no network, no server boot.
 */
import assert from 'node:assert/strict';
import {
  capNodes, horizonLastExpiry, horizonMatrixDte, horizonMaxDte, nextSessionDate, nodesForHorizon, parseHorizon, thirdFriday, topNodes,
  isIntradayHeatmap,
} from '../shared/gex-horizon';
import { expiryInstantMs } from '../shared/gex-math';
import { horizonSummaries } from '../server/options-exposures';
import { applyHorizonToTerminal, buildHorizonView } from '../server/gex-horizon-view';
import {
  INDEX_SET, buildIntradayHeatmap, buildUniverse, inIntradayWindow, intradayCap, intradaySnapshotsEnabled, pruneSql,
} from '../server/gex-intraday-snapshots';
import { mergeTimeline, rowToTimeline } from '../server/chart-overlays';
import { coneHalfWidth, perSessionMove } from '../server/chart-expected-move';
import { LayersPrimitive, NODES_PER_BAR, firstBarAtOrAfter } from '../client/src/components/charting/tv/layers-primitive';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
// 2026-10-13 is a Tuesday. 14:00Z = 10:00 ET (EDT).
const ET = (iso: string) => Date.parse(iso); // pass explicit offsets

console.log('expiry horizon (shared/gex-horizon.ts)');
t('parseHorizon defaults to all', () => {
  assert.equal(parseHorizon(undefined), 'all');
  assert.equal(parseHorizon('WEEK'), 'week');
  assert.equal(parseHorizon('bogus'), 'all');
});
t('today = this session before the close, next weekday after it', () => {
  assert.equal(nextSessionDate(ET('2026-10-13T10:00:00-04:00')), '2026-10-13');
  assert.equal(nextSessionDate(ET('2026-10-13T16:30:00-04:00')), '2026-10-14');
  assert.equal(nextSessionDate(ET('2026-10-16T17:00:00-04:00')), '2026-10-19', 'Friday after the close → Monday');
  assert.equal(nextSessionDate(ET('2026-10-17T12:00:00-04:00')), '2026-10-19', 'Saturday → Monday');
});
t('week = that session week\'s Friday; opex = 3rd Friday, next month once passed', () => {
  const tue = ET('2026-10-13T10:00:00-04:00');
  assert.equal(horizonLastExpiry('today', tue), '2026-10-13');
  assert.equal(horizonLastExpiry('week', tue), '2026-10-16');
  assert.equal(thirdFriday('2026-10-01'), '2026-10-16');
  assert.equal(horizonLastExpiry('opex', tue), '2026-10-16');
  assert.equal(horizonLastExpiry('opex', ET('2026-10-19T10:00:00-04:00')), '2026-11-20', 'after Oct OPEX → Nov 20');
  assert.equal(horizonLastExpiry('all', tue), null);
  assert.equal(horizonMaxDte('all', tue), Infinity);
});
t('matrix cut-off matches Math.round(dte) of the engine matrix', () => {
  const tue = ET('2026-10-13T10:00:00-04:00');
  // 0DTE at 10:00 → 0.25 d → matrix dte 0; Friday 16:00 → 3.25 d → 3
  assert.equal(horizonMatrixDte('today', tue), 0);
  assert.equal(horizonMatrixDte('week', tue), 3);
  const fri = (expiryInstantMs('2026-10-16') - tue) / 864e5;
  assert.ok(fri <= horizonMaxDte('week', tue) && fri > horizonMaxDte('today', tue));
});
t('nodesForHorizon sums only cells inside the horizon', () => {
  const tue = ET('2026-10-13T10:00:00-04:00');
  const cells = [
    { strike: 600, dte: 0, netGEX: 1, netVEX: 2 },
    { strike: 600, dte: 3, netGEX: 0.5, netVEX: -1 },
    { strike: 600, dte: 10, netGEX: 9, netVEX: 9 },
    { strike: 590, dte: 0, netGEX: -2, netVEX: 0 },
  ];
  const today = nodesForHorizon(cells, 'today', tue).sort((a, b) => a.strike - b.strike);
  assert.deepEqual(today, [{ strike: 590, gex: -2, vex: 0 }, { strike: 600, gex: 1, vex: 2 }]);
  const week = nodesForHorizon(cells, 'week', tue).find((x) => x.strike === 600)!;
  assert.equal(week.gex, 1.5); assert.equal(week.vex, 1);
  assert.equal(nodesForHorizon(cells, 'all', tue).find((x) => x.strike === 600)!.gex, 10.5);
});
t('topNodes keeps top |GEX| ∪ top |VEX|, 4 significant figures', () => {
  const nodes = Array.from({ length: 30 }, (_, i) => ({ strike: 500 + i, gex: i === 29 ? 0.000001 : i * 0.123456, vex: i === 0 ? 99 : 0 }));
  const top = topNodes(nodes, 5, 1);
  assert.ok(top.some(([k]) => k === 500), 'VEX leader kept even with ~0 GEX');
  assert.equal(top.length, 6);
  assert.equal(top.find(([k]) => k === 528)![1], 3.457);
});
t('capNodes keeps the N largest and names the Apex node', () => {
  const vals = [1, -9, NaN, 3, 0, -4, 2];
  const { keep, apex } = capNodes(vals, 3);
  assert.deepEqual(keep, [1, 5, 3]);
  assert.equal(apex, 1);
  assert.equal(capNodes([NaN, NaN], 8).apex, -1);
});

console.log('engine byHorizon (server/options-exposures.ts)');
t('horizon summaries use only contracts inside the cut-off', () => {
  const tue = ET('2026-10-13T10:00:00-04:00');
  const legs = [
    { strike: 610, dte: 0.25, isCall: true, oi: 100, gexDollars: 5e8 },
    { strike: 590, dte: 0.25, isCall: false, oi: 100, gexDollars: 3e8 },
    { strike: 650, dte: 3.25, isCall: true, oi: 100, gexDollars: 9e8 },
    { strike: 550, dte: 40, isCall: false, oi: 100, gexDollars: 50e8 },
  ];
  const h = horizonSummaries(legs, 600, tue)!;
  assert.equal(h.today!.callWall, 610);
  assert.equal(h.today!.putWall, 590);
  assert.equal(h.week!.callWall, 650, 'week adds the Friday call');
  assert.equal(h.week!.putWall, 590, 'the 40-day put is outside the week');
  assert.ok(Math.abs(h.today!.totalGEX - 0.2) < 1e-9);
  assert.equal(h.opex!.lastExpiry, '2026-10-16');
});

console.log('terminal ?horizon (server/gex-horizon-view.ts)');
t('horizon levels replace the snapshot walls; all-expiry walls are never relabelled', () => {
  const tue = ET('2026-10-13T10:00:00-04:00');
  const payload = { snapshot: { callWall: 700, putWall: 500, gammaFlipPrice: 580, zeroGammaLevel: 580, maxGammaStrike: 600 }, strikeExpiryMatrix: [{ strike: 610, dte: 0, netGEX: 0.5, netVEX: 1 }] };
  const byH = { today: { expirationsCount: 1, totalGEX: 0.2, callWall: 610, putWall: 590, maxGammaStrike: 610, gammaFlipPrice: 598, dealerFlowPer1Pct: 2e8, lastExpiry: '2026-10-13' } };
  const out = applyHorizonToTerminal(payload, { byHorizon: byH } as any, 'today', tue);
  assert.equal(out.snapshot.callWall, 610);
  assert.equal(out.snapshot.zeroGammaLevel, 598);
  assert.equal(out.horizonView.source, 'engine-byHorizon');
  assert.equal(payload.snapshot.callWall, 700, 'input payload untouched (the all-expiry cache stays clean)');
  const noLv = applyHorizonToTerminal(payload, null, 'week', tue);
  assert.equal(noLv.snapshot.callWall, null, 'fallback path: no walls rather than all-expiry walls under a horizon label');
  assert.equal(noLv.horizonView.source, 'matrix-only');
  assert.equal(buildHorizonView(null, [], 'today', tue).source, 'none');
});

console.log('5-min snapshots + retention (server/gex-intraday-snapshots.ts)');
t('universe: index set first, deduped, capped at 30', () => {
  const many = Array.from({ length: 60 }, (_, i) => `T${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`);
  const u = buildUniverse({ charted: ['nvda', 'SPY', 'BTC-USD'], watchlist: ['AAPL', 'NVDA', ...many], ranked: ['TSLA'] }, 30);
  assert.deepEqual(u.slice(0, 6), ['SPX', 'SPY', 'QQQ', 'IWM', 'NVDA', 'AAPL']);
  assert.equal(u.length, 30);
  assert.ok(!u.includes('BTC-USD'), 'crypto pairs are not option underlyings');
  assert.equal(intradayCap({ GEX_INTRADAY_MAX: '12' } as any), 12);
  assert.equal(intradayCap({} as any), 30);
});
t('flag GEX_INTRADAY_SNAPSHOTS defaults on', () => {
  assert.equal(intradaySnapshotsEnabled({} as any), true);
  assert.equal(intradaySnapshotsEnabled({ GEX_INTRADAY_SNAPSHOTS: 'off' } as any), false);
  assert.equal(intradaySnapshotsEnabled({ GEX_INTRADAY_SNAPSHOTS: '0' } as any), false);
});
t('RTH window 09:30–16:00 ET weekdays only', () => {
  assert.equal(inIntradayWindow(ET('2026-10-13T09:29:00-04:00')), false);
  assert.equal(inIntradayWindow(ET('2026-10-13T09:30:00-04:00')), true);
  assert.equal(inIntradayWindow(ET('2026-10-13T16:00:00-04:00')), true);
  assert.equal(inIntradayWindow(ET('2026-10-13T16:05:00-04:00')), false);
  assert.equal(inIntradayWindow(ET('2026-10-17T11:00:00-04:00')), false);
});
t('heatmap_data carries every horizon, compact (< 6 KB)', () => {
  const tue = ET('2026-10-13T10:00:00-04:00');
  const matrix: any[] = [];
  for (let k = 550; k <= 650; k++) for (const dte of [0, 1, 3, 10, 24, 60]) matrix.push({ strike: k, dte, netGEX: Math.sin(k + dte) * 0.3, netVEX: Math.cos(k * dte) * 2 });
  const strikes = Array.from({ length: 101 }, (_, i) => ({ strike: 550 + i, netGEX: Math.sin(i) * 0.5, netVEX: Math.cos(i) }));
  const hm = buildIntradayHeatmap({ strikeExpiryMatrix: matrix, strikes, byHorizon: {}, callWall: 620, putWall: 580, zeroGammaLevel: 601, flipPoint: 601, maxGammaStrike: 600, totalNetGEX: 1.2 } as any, tue);
  assert.ok(isIntradayHeatmap(hm));
  for (const h of ['today', 'week', 'opex', 'all'] as const) assert.ok(hm.horizons[h]!.n.length > 0 && hm.horizons[h]!.n.length <= 22, `${h} nodes`);
  assert.equal(hm.horizons.week!.exp, '2026-10-16');
  assert.equal(hm.horizons.all!.lv!.cw, 620);
  const bytes = Buffer.byteLength(JSON.stringify(hm));
  assert.ok(bytes < 6_000, `heatmap ${bytes} bytes`);
  console.log(`      (row heatmap_data ≈ ${(bytes / 1024).toFixed(1)} KB)`);
});
t('prune targets only 5-min rows: index 400 d, others 30 d', () => {
  const q = pruneSql(5000);
  assert.match(q.text, /heatmap_data->>'kind' = \$1/);
  assert.deepEqual(q.values, ['intraday-5m', [...INDEX_SET], 400, 30, 5000]);
  assert.match(q.text, /LIMIT \$5/);
});

console.log('timeline (server/chart-overlays.ts)');
t('a 5-min row yields its horizon\'s nodes in $; hourly top_levels never stand in for a horizon', () => {
  const hm = { kind: 'intraday-5m', v: 1, horizons: { today: { exp: '2026-10-13', n: [[600, 0.5, 2]], lv: { cw: 610, pw: 590, flip: 598, maxG: 600, net: 0.4 } } } };
  const r = rowToTimeline({ snapshotAt: '2026-10-13T14:05:00Z', spotPrice: 601, totalGex: 1, topLevels: [], heatmapData: hm }, 'today')!;
  assert.deepEqual(r.nodes, [[600, 5e8, 2e6]]);
  assert.equal(r.net, 4e8);
  assert.equal(r.source, 'snapshot-5m');
  assert.equal(rowToTimeline({ snapshotAt: '2026-10-13T14:05:00Z', spotPrice: 601, totalGex: 1, topLevels: [], heatmapData: hm }, 'week'), null);
  const hourly = { snapshotAt: '2026-10-13T14:08:00Z', spotPrice: 601, totalGex: 1, topLevels: [{ strike: 600, gex: 1 }], heatmapData: [] };
  assert.equal(rowToTimeline(hourly, 'today'), null, 'all-expiry top_levels are not a 0DTE read');
  assert.equal(rowToTimeline(hourly, 'all')!.source, 'archive-hourly');
  const withMatrix = { ...hourly, strikeExpiryMatrix: [{ strike: 600, dte: 0, netGEX: 0.3, netVEX: 1 }, { strike: 600, dte: 9, netGEX: 5, netVEX: 1 }] };
  assert.deepEqual(rowToTimeline(withMatrix, 'today')!.nodes, [[600, 3e8, 1e6]], 'hourly matrix cut relative to the row\'s own time');
});
t('merge: 5-min rows win, hourly only fills real gaps', () => {
  const row = (t: number, source: string) => ({ t, spot: 1, net: 1, source, nodes: [[1, 1, null]] as Array<[number, number, number | null]> });
  const m = mergeTimeline([row(0, 'snapshot-5m'), row(300_000, 'snapshot-5m')], [row(60_000, 'chain')], [row(600_000, 'archive-hourly'), row(3_600_000, 'archive-hourly')]);
  assert.deepEqual(m.map((x) => x.source), ['snapshot-5m', 'snapshot-5m', 'archive-hourly']);
});

console.log('nodes on candles (layers-primitive.ts)');
const mkPrim = () => {
  const prim = new LayersPrimitive(() => ({ pos: '#00f', neg: '#f00', dp: '#ff0', call: '#0ff', put: '#f0f', panel: '#000', caution: '#fa0', zone: () => '#fa0' }));
  prim.attached({ chart: { timeScale: () => ({ getVisibleLogicalRange: () => null, logicalToCoordinate: (i: number) => i * 10, coordinateToLogical: (x: number) => x / 10 }) }, series: { priceToCoordinate: (p: number) => 1000 - p, priceFormatter: () => ({ format: String }) }, requestUpdate: () => {} } as any);
  return prim;
};
const bars = Array.from({ length: 12 }, (_, i) => ({ time: 1_000_000_000_000 + i * 300_000, open: 1, high: 1, low: 1, close: 1, volume: 0 }));
const ovWith = (series: { strike: number; points: [number, number][] }[], vexSeries: typeof series = [], source = 'snapshot-5m') => ({
  symbol: 'X', range: '1D', dates: [], generatedAt: '',
  gexNow: null, darkPool: { source: '', asOf: null, ageSec: null, stale: false, windowFrom: null, windowTo: null, printsScanned: 0, levels: [], note: '' },
  flow: { source: '', streamState: '', asOf: null, ageSec: null, prints: [], note: '' },
  gexTimeline: { sampleEveryMin: 5, recordingSince: null, asOf: null, ageSec: null, sources: [], note: '', watched: true,
    samples: [...new Set(series.flatMap((s) => s.points.map((p) => p[0])))].map((t0) => ({ t: t0, spot: 1, net: 0, source })), series, vexSeries },
}) as any;
t('firstBarAtOrAfter', () => {
  assert.equal(firstBarAtOrAfter(bars as any, bars[3].time), 3);
  assert.equal(firstBarAtOrAfter(bars as any, bars[3].time + 1), 4);
  assert.equal(firstBarAtOrAfter(bars as any, 0), 0);
});
t('a bar shows the nearest snapshot ≤ its open time; the forming bar shows the newest', () => {
  const prim = mkPrim();
  const s0 = bars[2].time + 60_000; // taken during bar 2 → first shown on bar 3
  const s1 = bars[11].time + 30_000; // during the forming last bar → on it
  prim.setInput({ bars: bars as any, ov: ovWith([{ strike: 600, points: [[s0, 5], [s1, 7]] }]), gex: 'bubbles', dp: false, flow: false, cutoff: null, gexTop: null, gexTopAsOf: null, zones: [] });
  assert.deepEqual(prim.lastBarNodes().map((x) => x.g), [7]);
  const vals = (prim as any).bubbles[0].vals as Float64Array;
  assert.ok(Number.isNaN(vals[2]), 'not on the bar it was taken during (strictly ≤ bar time)');
  assert.equal(vals[3], 5);
  assert.ok(Number.isNaN(vals[10]), 'older than 2.5× cadence → a gap stays a gap');
});
t('replay cut: nothing after the cursor', () => {
  const prim = mkPrim();
  prim.setInput({ bars: bars.slice(0, 6) as any, ov: ovWith([{ strike: 600, points: [[bars[4].time, 5], [bars[5].time + 1, 9]] }]), gex: 'bubbles', dp: false, flow: false, cutoff: bars[5].time, gexTop: null, gexTopAsOf: null, zones: [] });
  assert.deepEqual(prim.lastBarNodes().map((x) => x.g), [5], 'the 9 taken after the cursor is not revealed');
});
t(`at most ${NODES_PER_BAR} nodes per bar; the Apex node is the largest`, () => {
  const prim = mkPrim();
  const series = Array.from({ length: 15 }, (_, i) => ({ strike: 590 + i, points: [[bars[0].time, (i - 7) * 10]] as [number, number][] }));
  prim.setInput({ bars: bars.slice(0, 2) as any, ov: ovWith(series), gex: 'bubbles', dp: false, flow: false, cutoff: null, gexTop: null, gexTopAsOf: null, zones: [] });
  const nodes = prim.lastBarNodes();
  assert.equal(nodes.length, NODES_PER_BAR);
  const apex = nodes.filter((x) => x.apex);
  assert.equal(apex.length, 1);
  assert.equal(Math.abs(apex[0].g), 70);
});
t('VEX / both metrics', () => {
  const prim = mkPrim();
  const g = [{ strike: 600, points: [[bars[0].time, 5]] as [number, number][] }];
  const v = [{ strike: 605, points: [[bars[0].time, -3]] as [number, number][] }];
  const base = { bars: bars.slice(0, 2) as any, ov: ovWith(g, v), gex: 'bubbles' as const, dp: false, flow: false, cutoff: null, gexTop: null, gexTopAsOf: null, zones: [] };
  prim.setInput({ ...base, metric: 'vex' });
  assert.deepEqual(prim.lastBarNodes().map((x) => [x.metric, x.strike, x.apex]), [['vex', 605, true]]);
  prim.setInput({ ...base, metric: 'both' });
  const both = prim.lastBarNodes();
  assert.equal(both.length, 2);
  assert.ok(both.find((x) => x.metric === 'gex')!.apex, 'with both on, the Apex node is the gamma node');
});

console.log('expected move (server/chart-expected-move.ts)');
t('per-session move and √t cone (modelled)', () => {
  assert.equal(perSessionMove(10, 4), 5);
  assert.equal(perSessionMove(10, 0), null);
  assert.equal(coneHalfWidth(5, 4), 10);
  assert.equal(coneHalfWidth(5, 0), 0);
});

console.log(`\n${n} checks passed`);
