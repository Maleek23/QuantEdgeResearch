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
  BUILTIN_TEMPLATES, QUICK_LAYERS, SETTINGS_GROUPS, applyTemplate, sanitizeChartStyle, sanitizeTemplates, templateFromPrefs,
} from '../shared/chart-templates';

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

console.log(`\n${n} checks passed`);
