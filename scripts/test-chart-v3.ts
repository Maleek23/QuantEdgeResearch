/**
 * test-chart-v3 — Path projection engine (shared/path-projection.ts) and the
 * chart settings / templates model (shared/chart-templates.ts).
 *   npx tsx scripts/test-chart-v3.ts       (npm run test:chart-v3)
 * Pure: no DB, no network, no server boot.
 */
import assert from 'node:assert/strict';
import {
  buildSteps, defaultVarianceCurve, etInstant, horizonSessions, parsePathHorizon, pathAt, scoreRealized, simulatePath,
  structureBadges, tradingMsBetween, reanchorPath, varianceCurveFromBars, type PathInput,
} from '../shared/path-projection';
import {
  BUILTIN_TEMPLATES, DEFAULT_CHART_STYLE, PATH_STYLES, QUICK_LAYERS, SETTINGS_GROUPS, applyTemplate, cleanPathLevels, sanitizeChartStyle, sanitizeTemplates, templateFromPrefs, trailDotIndices,
} from '../shared/chart-templates';
import { buildEventSteps, eventInstant, parseEtTime } from '../shared/event-steps';
import { isNyseHoliday } from '../shared/market-holidays';
import { layoutAxisLabels, levelTier, maxApexLabels, maxLevelLabels } from '../client/src/components/charting/tv/label-layout';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const TUE_10ET = Date.parse('2026-10-13T14:00:00Z');
const base: PathInput = { spot: 580, nowMs: TUE_10ET, horizon: 'session', sessionMove: 6, regime: 'neutral', nodes: [], paths: 2000, seed: 7 };

console.log('calendar');
t('horizon parse + sessions', () => {
  assert.equal(parsePathHorizon('WEEK'), 'week');
  assert.equal(parsePathHorizon('x'), 'session');
  assert.deepEqual(horizonSessions('session', TUE_10ET), ['2026-10-13']);
  assert.deepEqual(horizonSessions('tomorrow', TUE_10ET), ['2026-10-13', '2026-10-14']);
  assert.deepEqual(horizonSessions('week', TUE_10ET), ['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16']);
  assert.equal(horizonSessions('opex', TUE_10ET).at(-1), '2026-10-16'); // third Friday of Oct 2026
  // after the close → next session
  assert.deepEqual(horizonSessions('session', Date.parse('2026-10-13T21:00:00Z')), ['2026-10-14']);
  // Saturday → Monday
  assert.deepEqual(horizonSessions('session', Date.parse('2026-10-17T15:00:00Z')), ['2026-10-19']);
});
t('etInstant handles EDT and EST', () => {
  assert.equal(etInstant('2026-10-13', 570), Date.parse('2026-10-13T13:30:00Z'));
  assert.equal(etInstant('2026-12-01', 570), Date.parse('2026-12-01T14:30:00Z'));
});
t('variance curve: fallback sums to 1 and is U-shaped', () => {
  const c = defaultVarianceCurve();
  assert.equal(c.length, 78);
  assert.ok(Math.abs(c.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(c[0] > c[39] && c[77] > c[39]);
  assert.equal(varianceCurveFromBars([]).source, 'fallback');
});
t('variance curve from bars: loud first slot detected', () => {
  const bars: { time: number; close: number }[] = [];
  for (const d of ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']) {
    let px = 100;
    for (let k = 0; k <= 78; k++) {
      const ms = etInstant(d, 570 + k * 5);
      px *= k === 1 ? 1.01 : (k % 2 ? 1.0005 : 0.9995);
      bars.push({ time: ms / 1000, close: px });
    }
  }
  const v = varianceCurveFromBars(bars);
  assert.equal(v.source, 'bars');
  assert.equal(v.sessions, 4);
  assert.ok(v.weights[0] > v.weights[40] * 5);
});
t('steps: session variance shares sum to the remaining fraction', () => {
  const st = buildSteps(TUE_10ET, ['2026-10-13'], defaultVarianceCurve(), 0.2);
  assert.equal(st.length, 72); // 10:00 → 16:00
  const before = buildSteps(Date.parse('2026-10-13T12:00:00Z'), ['2026-10-13'], defaultVarianceCurve(), 0.2);
  assert.ok(Math.abs(before.reduce((a, s) => a + s.varShare, 0) - (0.8 + 0.2 * (1.5 / 17.5))) < 1e-9);
});

t('trading time skips nights and weekends', () => {
  assert.equal(tradingMsBetween(TUE_10ET, Date.parse('2026-10-13T20:00:00Z')), 6 * 3_600_000);
  // Fri 15:00 ET → Mon 10:30 ET = 1h + 1h
  assert.equal(tradingMsBetween(Date.parse('2026-10-16T19:00:00Z'), Date.parse('2026-10-19T14:30:00Z')), 2 * 3_600_000);
});

console.log('simulation');
t('deterministic for a seed', () => {
  const a = simulatePath(base); const b = simulatePath(base);
  assert.deepEqual(a.points.at(-1), b.points.at(-1));
});
t('no nodes, no skew: median ≈ spot, terminal σ ≈ priced move × √(remaining var)', () => {
  const pre = { ...base, nowMs: Date.parse('2026-10-13T13:29:00Z'), overnightShare: 0 };
  const r = simulatePath(pre);
  assert.ok(Math.abs(r.points.at(-1)!.p50 - 580) < 0.6, `median ${r.points.at(-1)!.p50}`);
  assert.ok(Math.abs(r.terminalSd - 6) / 6 < 0.06, `sd ${r.terminalSd}`);
  // 80% fan ≈ ±1.2816σ
  const last = r.points.at(-1)!;
  assert.ok(Math.abs((last.p90 - last.p10) / 2 - 1.2816 * 6) < 0.8);
  assert.equal(r.paths, 2000);
});
t('fans are nested and widen with time', () => {
  const r = simulatePath(base);
  for (const p of r.points) assert.ok(p.p10 <= p.p25 && p.p25 <= p.p50 && p.p50 <= p.p75 && p.p75 <= p.p90);
  const mid = r.points[Math.floor(r.points.length / 2)]; const end = r.points.at(-1)!;
  assert.ok(end.p90 - end.p10 > mid.p90 - mid.p10);
});
t('long gamma: positive node attracts; short gamma (λ=0) does not', () => {
  const nodes = [{ strike: 584, gex: 5 }];
  const long = simulatePath({ ...base, regime: 'long', nodes });
  const short = simulatePath({ ...base, regime: 'short', nodes });
  assert.equal(short.lambda, 0);
  assert.ok(long.points.at(-1)!.p50 > short.points.at(-1)!.p50 + 0.3, `${long.points.at(-1)!.p50} vs ${short.points.at(-1)!.p50}`);
  assert.equal(long.apex, 584);
});
t('delivered node pulls at half weight', () => {
  const full = simulatePath({ ...base, regime: 'long', nodes: [{ strike: 584, gex: 5 }] });
  const half = simulatePath({ ...base, regime: 'long', nodes: [{ strike: 584, gex: 5, delivered: true }] });
  assert.ok(full.points.at(-1)!.p50 > half.points.at(-1)!.p50);
});
t('negative node raises local vol', () => {
  const calm = simulatePath(base);
  const hot = simulatePath({ ...base, nodes: [{ strike: 580, gex: -5 }] });
  assert.ok(hot.terminalSd > calm.terminalSd * 1.1);
});
t('put skew fattens the downside', () => {
  const r = simulatePath({ ...base, skew: 0.2 });
  const e = r.points.at(-1)!;
  assert.ok(580 - e.p10 > e.p90 - 580);
});
t('event step widens the distribution', () => {
  const ev = simulatePath({ ...base, events: [{ atMs: Date.parse('2026-10-13T18:00:00Z'), move: 8, label: 'FOMC' }] });
  assert.ok(ev.terminalSd > 9);
});
t('touch / stop / gatekeeper', () => {
  const r = simulatePath({
    ...base, regime: 'long', nodes: [{ strike: 590, gex: 9 }, { strike: 583, gex: 2 }],
    levels: [{ name: 'Wall', price: 583 }, { name: 'Apex', price: 590 }, { name: 'Far', price: 640 }],
  });
  const near = r.levels.find((l) => l.name === 'Wall')!; const far = r.levels.find((l) => l.name === 'Far')!;
  assert.ok(near.touch > far.touch);
  assert.ok(far.touch < 0.01);
  for (const l of r.levels) assert.ok(l.touch + l.stop <= 1);
  assert.equal(r.gatekeeper?.price, 583);
  assert.ok(r.badges.some((b) => b.kind === 'gatekeeper'));
});
t('terminal density bins sum ≈ paths', () => {
  const r = simulatePath(base);
  const s = r.terminal.bins.reduce((a, b) => a + b, 0);
  assert.ok(s > 1900 && s <= 2000);
});
t('week horizon includes overnight steps and is wider than a session', () => {
  const w = simulatePath({ ...base, horizon: 'week', paths: 800 });
  const s = simulatePath({ ...base, paths: 800 });
  assert.ok(w.terminalSd > s.terminalSd * 1.5);
  assert.ok(w.points.length <= 161);
});
t('rug / trampoline structure', () => {
  assert.deepEqual(structureBadges(100, [{ strike: 98, gex: 1 }, { strike: 96, gex: -3 }]).map((b) => b.kind), ['rug']);
  assert.deepEqual(structureBadges(100, [{ strike: 98, gex: -1 }, { strike: 96, gex: 3 }]).map((b) => b.kind), ['trampoline']);
  assert.equal(structureBadges(100, [{ strike: 102, gex: 1 }, { strike: 104, gex: -3 }]).length, 0);
});
t('pathAt interpolates; scoreRealized counts coverage', () => {
  const r = { points: [{ t: 0, p10: 90, p25: 95, p50: 100, p75: 105, p90: 110 }, { t: 10, p10: 80, p25: 90, p50: 100, p75: 110, p90: 120 }] };
  assert.equal(pathAt(r, 5)!.p10, 85);
  assert.equal(pathAt(r, -1), null);
  const s = scoreRealized(r, [{ t: 5, price: 100 }, { t: 10, price: 115 }, { t: 10, price: 130 }]);
  assert.equal(s.n, 3); assert.equal(s.in50, 1 / 3); assert.equal(s.in80, 2 / 3);
});

t('re-anchor to live price: small gaps shift, large gaps do not', () => {
  const r = simulatePath({ ...base, paths: 300 });
  const a = reanchorPath(r, 581);
  assert.equal(a.shifted, 1); assert.equal(a.result.spot, 581);
  assert.ok(Math.abs(a.result.points.at(-1)!.p50 - r.points.at(-1)!.p50 - 1) < 1e-9);
  assert.equal(reanchorPath(r, 640).shifted, 0);
  assert.equal(reanchorPath(r, null).result, r);
});

console.log('settings + templates');
t('groups cover the seven sections', () => {
  assert.deepEqual(SETTINGS_GROUPS.map((g) => g.id), ['price', 'dealer', 'projections', 'flow', 'indicators', 'drawings', 'appearance']);
  assert.equal(QUICK_LAYERS.length, 6);
});
t('built-in templates + apply', () => {
  assert.deepEqual(BUILTIN_TEMPLATES.map((x) => x.id), ['scalp0dte', 'swing', 'clean']);
  const clean = BUILTIN_TEMPLATES.find((x) => x.id === 'clean')!;
  const next = applyTemplate({ walls: true, gex: 'bubbles', path: true } as never, clean);
  assert.equal((next as { walls: boolean }).walls, false);
  assert.equal((next as { gex: string }).gex, 'off');
});
t('template sanitiser drops junk and unknown keys', () => {
  const out = sanitizeTemplates([{ id: 'u1', name: 'Mine', prefs: { walls: false, evil: 1 } }, { nope: 1 }, null]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].prefs, { walls: false });
  const tp = templateFromPrefs('Foo', { walls: true, tf: '5m', path: true } as never);
  assert.equal(tp.name, 'Foo');
  assert.ok(!('tf' in tp.prefs));
});
t('style sanitiser clamps opacity and colours', () => {
  const s = sanitizeChartStyle({ opacity: { path: 9, em: -1, gex: 0.5 }, color: { path: '#12ab34', em: 'red;}' }, lineWidth: 7, labelDensity: 'x' });
  assert.equal(s.opacity.path, 1); assert.equal(s.opacity.em, 0.1); assert.equal(s.opacity.gex, 0.5);
  assert.equal(s.color.path, '#12ab34'); assert.equal(s.color.em, undefined);
  assert.equal(s.lineWidth, 3); assert.equal(s.labelDensity, 'normal');
});

console.log('path style (Clean / Detailed)');
t('Clean is the default; Detailed survives sanitise; junk falls back to Clean', () => {
  assert.equal(DEFAULT_CHART_STYLE.pathStyle, 'clean');
  assert.equal(DEFAULT_CHART_STYLE.lowChroma, false);
  assert.equal(sanitizeChartStyle({}).pathStyle, 'clean');
  assert.equal(sanitizeChartStyle(null).pathStyle, 'clean');
  assert.equal(sanitizeChartStyle({ pathStyle: 'detailed' }).pathStyle, 'detailed');
  assert.equal(sanitizeChartStyle({ pathStyle: 'neon' }).pathStyle, 'clean');
  assert.equal(sanitizeChartStyle({ lowChroma: true }).lowChroma, true);
  assert.equal(sanitizeChartStyle({ lowChroma: 'yes' }).lowChroma, false);
  // a stored pre-switch style (no pathStyle key) keeps every other field and gets Clean
  const old = sanitizeChartStyle({ opacity: { path: 0.5 }, lineWidth: 2 });
  assert.equal(old.pathStyle, 'clean'); assert.equal(old.opacity.path, 0.5); assert.equal(old.lineWidth, 2);
  assert.deepEqual(PATH_STYLES.map((p) => p.id), ['clean', 'detailed']);
  // switching round-trips through the store's sanitiser
  const det = sanitizeChartStyle({ ...DEFAULT_CHART_STYLE, pathStyle: 'detailed' });
  assert.equal(sanitizeChartStyle({ ...det, pathStyle: 'clean' }).pathStyle, 'clean');
});
t('Clean: ONE highlighted level = highest touch; others weighted by |GEX|', () => {
  const lv = cleanPathLevels(
    [{ name: 'Apex', price: 586, touch: 0.31 }, { name: 'Flip', price: 576, touch: 0.62 }, { name: 'Call wall', price: 590, touch: 0.1 }, { name: 'Put wall', price: 573, touch: 0.2 }],
    [{ strike: 586, gex: 3 }, { strike: 576, gex: -1.5 }, { strike: 573, gex: 0.3 }],
    0.5,
  );
  assert.equal(lv.filter((l) => l.highlight).length, 1);
  assert.equal(lv.find((l) => l.highlight)!.name, 'Flip');
  assert.equal(lv[0].weight, 1);
  assert.equal(lv[1].weight, 0.5);
  assert.equal(lv[2].weight, 0.15); // no node at the strike → floor
  assert.equal(lv[3].weight, 0.15); // 0.1 → floored
  assert.ok(cleanPathLevels([{ name: 'x', price: 1, touch: 0.2 }]).every((l) => l.weight === 0.15));
  assert.equal(cleanPathLevels([{ name: 'x', price: 1, touch: 0 }])[0].highlight, false);
  assert.deepEqual(cleanPathLevels([]), []);
});
t('Clean: real engine levels → exactly one target', () => {
  const nodes = [{ strike: 586, gex: 3.1 }, { strike: 577, gex: -1.4 }];
  const r = simulatePath({ ...base, regime: 'long', nodes, levels: [{ name: 'Apex', price: 586 }, { name: 'Flip', price: 577 }, { name: 'Wall', price: 590 }], paths: 400 });
  const lv = cleanPathLevels(r.levels, nodes, 0.7);
  assert.equal(lv.filter((l) => l.highlight).length, 1);
  const best = Math.max(...r.levels.map((l) => l.touch));
  assert.equal(lv.find((l) => l.highlight)!.touch, best);
});
t('Clean: sparse dot trail always ends on the last point', () => {
  assert.deepEqual(trailDotIndices(10, 4), [0, 4, 8, 9]);
  assert.deepEqual(trailDotIndices(9, 4), [0, 4, 8]);
  assert.deepEqual(trailDotIndices(3, 0), [0, 1, 2]);
  assert.deepEqual(trailDotIndices(0, 4), []);
  assert.ok(trailDotIndices(160, 6).length < 30);
});

console.log('holidays + events');
t('NYSE holidays skipped by sessions and trading time', () => {
  // Wed 2026-11-25 after the close → Thanksgiving Thu skipped → Fri 11-27
  assert.deepEqual(horizonSessions('session', Date.parse('2026-11-25T22:00:00Z')), ['2026-11-27']);
  assert.ok(!horizonSessions('week', Date.parse('2026-11-23T15:00:00Z')).includes('2026-11-26'));
  assert.equal(tradingMsBetween(Date.parse('2026-11-25T21:00:00Z'), Date.parse('2026-11-27T14:30:00Z')), 0);
  assert.ok(isNyseHoliday('2027-03-26') && isNyseHoliday('2027-12-24') && !isNyseHoliday('2027-12-27'));
});
t('event steps: macro weights, pre-market → open, earnings timing, out-of-range dropped', () => {
  const nowMs = TUE_10ET; const endMs = etInstant('2026-10-16', 960);
  const ev = buildEventSteps({ sessionMove: 10, nowMs, endMs, macro: [
    { name: 'CPI', date: '2026-10-14', time: '8:30 AM ET', importance: 'high' },
    { name: 'Claims', date: '2026-10-15', time: '8:30 AM ET', importance: 'low' },
    { name: 'FOMC', date: '2026-10-15', time: '2:00 PM ET', importance: 'high' },
    { name: 'Retail', date: '2026-10-15', time: '8:30 AM ET', importance: 'medium' },
    { name: 'Past', date: '2026-10-12', time: '8:30 AM ET', importance: 'high' },
    { name: 'Late', date: '2026-10-20', time: '8:30 AM ET', importance: 'high' },
  ], earnings: [{ date: '2026-10-14', timing: 'amc' }] });
  assert.deepEqual(ev.map((e) => e.label), ['CPI', 'Retail', 'Earnings (after close)', 'FOMC']);
  assert.equal(ev[0].atMs, etInstant('2026-10-14', 570));
  assert.equal(ev[0].move, 3.5);
  assert.equal(ev[1].move, 1.5);
  assert.equal(ev[2].atMs, etInstant('2026-10-15', 570));
  assert.equal(ev[2].move, 10);
  assert.equal(ev[3].atMs, etInstant('2026-10-15', 840));
  assert.equal(parseEtTime('2:00 PM ET'), 840); assert.equal(parseEtTime('12:00 PM'), 720); assert.equal(parseEtTime('14:30'), 870); assert.equal(parseEtTime(''), null);
  // an event on a holiday rolls to the next open
  assert.equal(eventInstant('2026-11-26', 510), etInstant('2026-11-27', 570));
  assert.deepEqual(buildEventSteps({ sessionMove: 0, nowMs, endMs, macro: [{ name: 'CPI', date: '2026-10-14', importance: 'high' }] }), []);
});
t('an event widens the Path terminal spread', () => {
  const plain = simulatePath({ ...base, horizon: 'tomorrow' });
  const withEv = simulatePath({ ...base, horizon: 'tomorrow', events: [{ atMs: etInstant('2026-10-14', 570), move: 6, label: 'CPI' }] });
  assert.ok(withEv.terminalSd > plain.terminalSd * 1.1, `${withEv.terminalSd} vs ${plain.terminalSd}`);
});

console.log('label collision');
t('priority order, nudge, cap, fold into +N', () => {
  const items = [
    { id: 'pdh', y: 100, tier: levelTier('PDH') },
    { id: 'gate', y: 102, tier: levelTier('GATEKEEPER') },
    { id: 'cw', y: 104, tier: levelTier('CALL WALL 0DTE') },
    { id: 'path', y: 106, tier: levelTier('PATH Apex') },
    { id: 'far', y: 300, tier: 4 },
  ];
  assert.deepEqual([levelTier('PATH x'), levelTier('PUT WALL'), levelTier('ZERO-γ 0DTE'), levelTier('RUG → 590'), levelTier('PDC')], [1, 2, 2, 3, 4]);
  const L = layoutAxisLabels(items, { top: 0, bottom: 400, h: 16, maxNudge: 24, max: 3, reserved: [] });
  assert.deepEqual(L.shown.map((x) => x.id), ['path', 'cw', 'gate']);
  for (let i = 0; i < L.shown.length; i++) for (let j = i + 1; j < L.shown.length; j++) assert.ok(Math.abs(L.shown[i].y - L.shown[j].y) >= 16 - 1e-6, 'no overlap');
  assert.ok(L.shown.every((x) => Math.abs(x.dy) <= 24));
  assert.deepEqual(L.groups.map((g) => g.ids), [['pdh'], ['far']]);
  // reserved last-price row is never covered
  const R = layoutAxisLabels([{ id: 'a', y: 200, tier: 2 }], { top: 0, bottom: 400, h: 16, maxNudge: 24, max: 9, reserved: [200] });
  assert.ok(Math.abs(R.shown[0].y - 200) >= 16);
  // off-screen tags are neither shown nor folded
  assert.deepEqual(layoutAxisLabels([{ id: 'x', y: -50, tier: 2 }], { top: 0, bottom: 400, h: 16, maxNudge: 24, max: 9 }), { shown: [], groups: [] });
  // density: phone low < normal < high; desktop allows more
  assert.ok(maxLevelLabels('low', true) < maxLevelLabels('normal', true) && maxLevelLabels('normal', true) < maxLevelLabels('high', true));
  assert.ok(maxLevelLabels('normal', false) > maxLevelLabels('normal', true));
  assert.ok(maxApexLabels('low', false) === 1 && maxApexLabels('high', false) > maxApexLabels('normal', false));
});

console.log(`\n${n} checks passed`);
