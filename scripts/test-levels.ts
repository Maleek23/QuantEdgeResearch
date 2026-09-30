/**
 * Unit tests for the structural level map + plan snap
 * (shared/levels/level-math.ts, shared/levels/snap.ts).
 *   npm run test:levels
 */
import assert from 'node:assert/strict';
import {
  vwapWithBands, floorPivots, camarilla, volumeProfile, roundNumbers, roundSteps, clusterLevels, clusterTolerance,
  buildLevelMap, splitSessions, weekKey, dailyAtrForFloor, KIND_META, type Bar, type Level,
} from '../shared/levels/level-math';
import { snapPlanToStructure } from '../shared/levels/snap';
import { etWallToMs } from '../shared/loss-rules';

let n = 0;
const t = (name: string, fn: () => void) => {
  try { fn(); n++; } catch (e) { console.error(`FAIL ${name}`); throw e; }
};
const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

const bar = (ms: number, o: number, h: number, l: number, c: number, v = 1000): Bar =>
  ({ time: Math.floor(ms / 1000), open: o, high: h, low: l, close: c, volume: v });
const et = (dateKey: string, minutes: number) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return etWallToMs(y, m, d, minutes);
};

// ── primitives ────────────────────────────────────────────────────────────
t('vwap and bands', () => {
  const b = [bar(0, 10, 11, 9, 10, 100), bar(1, 20, 21, 19, 20, 100)];
  const v = vwapWithBands(b)!;
  close(v.vwap, 15); close(v.sigma, 5);
  assert.equal(vwapWithBands([bar(0, 1, 1, 1, 1, 0)]), null);
});
t('floor pivots', () => {
  const p = floorPivots(110, 90, 100);
  close(p.p, 100); close(p.r1, 110); close(p.s1, 90); close(p.r2, 120); close(p.s2, 80); close(p.r3, 130); close(p.s3, 70);
});
t('camarilla', () => {
  const c = camarilla(110, 90, 100);
  close(c.h3, 105.5); close(c.h4, 111); close(c.l3, 94.5); close(c.l4, 89);
});
t('volume profile POC / value area', () => {
  const bars: Bar[] = [];
  for (let i = 0; i < 20; i++) bars.push(bar(i * 300_000, 100, 100.5, 99.5, 100, 10_000)); // heavy 99.5–100.5
  for (let i = 0; i < 10; i++) bars.push(bar(7e6 + i * 300_000, 100, 100.05, 99.95, 100, 10_000)); // peak at 100
  bars.push(bar(99e6, 104, 105, 103, 104, 100));
  bars.push(bar(99e6 + 1, 95, 96, 95, 95.5, 100));
  const vp = volumeProfile(bars)!;
  assert.ok(Math.abs(vp.poc - 100) < 0.2, `poc ${vp.poc}`);
  assert.ok(vp.val >= 99 && vp.val <= 100, `val ${vp.val}`);
  assert.ok(vp.vah >= 100 && vp.vah <= 101, `vah ${vp.vah}`);
  assert.equal(volumeProfile(bars.slice(0, 3)), null);
});
t('round numbers by tier', () => {
  assert.deepEqual(roundSteps(350), [10, 50]);
  assert.deepEqual(roundSteps(3), [0.5, 1]);
  const r = roundNumbers(352, 20);
  assert.deepEqual(r.map((x) => x.price), [340, 350, 360, 370]);
  assert.equal(r.find((x) => x.price === 350)!.major, true);
  assert.equal(r.find((x) => x.price === 360)!.major, false);
});
t('weekKey is Monday', () => {
  assert.equal(weekKey('2026-09-30'), '2026-09-28'); // Wed
  assert.equal(weekKey('2026-09-28'), '2026-09-28'); // Mon
  assert.equal(weekKey('2026-10-04'), '2026-09-28'); // Sun
});
t('daily ATR for floor = ingestion definition', () => {
  const d: Bar[] = [];
  for (let i = 0; i < 16; i++) d.push(bar(i * 86_400_000, 100, 102, 98, 100));
  close(dailyAtrForFloor(d)!, 4);
  assert.equal(dailyAtrForFloor(d.slice(0, 10)), null);
});

// ── clustering ────────────────────────────────────────────────────────────
const L = (price: number, kind: keyof typeof KIND_META): Level =>
  ({ price, kind, family: KIND_META[kind].family, label: KIND_META[kind].label, source: 'test', strength: 1, asOf: 'x' });
t('cluster by tolerance, score = independent families', () => {
  const cs = clusterLevels([L(100, 'pdh'), L(100.05, 'vah_5d'), L(100.08, 'pwh'), L(103, 'pivot_r1'), L(103.01, 'cam_h3')], 0.1);
  assert.equal(cs.length, 2);
  assert.equal(cs[0].score, 2);              // prior_period + volume_profile (pwh same family as pdh)
  assert.equal(cs[0].kinds.length, 3);
  assert.equal(cs[1].score, 1);              // pivot + camarilla are one family
  assert.match(cs[0].label, /prior-day high \+ 5-day VAH/);
});
t('tolerance = max(0.1%, 0.15×ATR5m)', () => {
  close(clusterTolerance(350, 1), 0.35);
  close(clusterTolerance(350, 4), 0.6);
  close(clusterTolerance(350, null), 0.35);
});

// ── full level map on a synthetic two-session tape ────────────────────────
function syntheticTape() {
  const intraday: Bar[] = [];
  const d1 = '2026-09-29'; const d2 = '2026-09-30';
  // Prior session 09:30–16:00: range 98–104, closes 102.
  for (let m = 570; m < 960; m += 5) {
    const px = 100 + 2 * Math.sin((m - 570) / 60);
    intraday.push(bar(et(d1, m), px, px + 0.3, px - 0.3, px, 5000));
  }
  intraday.push(bar(et(d1, 955), 102, 104, 98, 102, 5000));
  // Pre-market today 101–103.
  for (let m = 240; m < 570; m += 30) intraday.push(bar(et(d2, m), 102, 103, 101, 102, 200));
  // Today's RTH first 90 minutes 102–106.
  for (let m = 570; m < 660; m += 5) {
    const px = 102 + (m - 570) / 30;
    intraday.push(bar(et(d2, m), px, px + 0.2, px - 0.2, px + 0.1, 4000));
  }
  const daily: Bar[] = [];
  const start = Date.UTC(2026, 7, 3, 13, 30); // Aug 3 2026
  for (let i = 0; i < 45; i++) {
    const ms = start + i * 86_400_000;
    const wd = new Date(ms).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    daily.push(bar(ms, 100, 103, 97, 100, 1e6));
  }
  daily.push(bar(et(d1, 570), 100, 104, 98, 102, 1e6));
  daily.push(bar(et(d2, 570), 102, 106, 101, 105, 5e5));
  return { intraday, daily, nowMs: et(d2, 665) };
}
t('level map computes every requested kind that the bars support', () => {
  const tape = syntheticTape();
  const m = buildLevelMap({ symbol: 'test', ...tape, external: [{ price: 104.02, kind: 'call_wall', source: 'gex cache', asOf: 'y', strength: 12000 }] });
  const kinds = new Set(m.levels.map((l) => l.kind));
  for (const k of ['vwap', 'vwap_u1', 'vwap_l2', 'session_high', 'or5_high', 'or15_low', 'or30_high', 'premkt_high', 'premkt_low',
    'avwap_prior_close', 'avwap_week', 'avwap_month', 'pdh', 'pdl', 'pdc', 'pivot_p', 'pivot_r1', 'cam_h4', 'pwh', 'pmoh',
    'poc_session', 'vah_session', 'round', 'call_wall'] as const) {
    assert.ok(kinds.has(k), `missing ${k}`);
  }
  const pdh = m.levels.find((l) => l.kind === 'pdh')!;
  assert.equal(pdh.price, 104);
  assert.equal(m.levels.find((l) => l.kind === 'premkt_high')!.price, 103);
  assert.equal(m.session, '2026-09-30'); assert.equal(m.priorSession, '2026-09-29');
  // PDH 104 and call wall 104.02 are two independent families → confluent.
  const c = m.clusters.find((x) => x.kinds.includes('pdh'))!;
  assert.ok(c.kinds.includes('call_wall') && c.score >= 2, c.label);
  // Every level carries source + asOf.
  assert.ok(m.levels.every((l) => l.source && l.asOf));
  // The 5-day profile needs ≥3 sessions; only two here → not fabricated.
  assert.ok(!kinds.has('poc_5d'));
});
t('pre-open: no VWAP / OR fabricated from a session that has not printed', () => {
  const tape = syntheticTape();
  const pre = tape.intraday.filter((b) => b.time * 1000 < et('2026-09-30', 570));
  const m = buildLevelMap({ symbol: 'x', intraday: pre, daily: tape.daily.slice(0, -1), nowMs: et('2026-09-30', 560) });
  const kinds = new Set(m.levels.map((l) => l.kind));
  assert.ok(!kinds.has('vwap') && !kinds.has('or5_high'));
  assert.ok(kinds.has('premkt_high') && kinds.has('pdh'));
  assert.ok(m.notes.some((s) => /no regular-session bars/.test(s)));
});
t('splitSessions ignores weekends', () => {
  const s = splitSessions([bar(et('2026-10-03', 600), 1, 1, 1, 1)]); // Saturday
  assert.equal(s.current, null);
});

// ── snap ──────────────────────────────────────────────────────────────────
const cl = (price: number, fams: Array<keyof typeof KIND_META>) => clusterLevels(fams.map((k) => L(price, k)), 0.01)[0];
t('TSLA-style long: T1 snaps to confluence before the 2R target; stop beyond structure', () => {
  const clusters = [
    cl(356.2, ['pdh', 'vah_5d']),        // confluent, before formula T1 359.47
    cl(361.0, ['pwh', 'call_wall']),     // beyond formula — never used
    cl(358.0, ['round']),                // single family — ignored
    cl(345.5, ['session_low', 'pivot_s1']), // confluent, just beyond formula stop 345.88? (below it)
  ];
  const r = snapPlanToStructure({ direction: 'long', entry: 350.41, stop: 345.88, targets: [359.47], clusters, horizon: 'day', tolerance: 0.35 });
  assert.equal(r.targets[0], 356.2);
  assert.match(r.notes.join(' '), /T1 \$356\.20 = prior-day high \+ 5-day VAH \(2 independent kinds\)/);
  assert.ok(r.stop < 345.5 && r.stop >= 345.5 - 0.2, `stop ${r.stop}`);
  assert.ok(r.stopLevel && /session low/.test(r.stopLevel.label));
  assert.match(r.text, /measuring/);
  assert.ok(r.changed);
});
t('never further than the formula target, never past the cap', () => {
  const clusters = [cl(105, ['pdh', 'poc_5d']), cl(108, ['pwh', 'vwap_u2'])];
  const r = snapPlanToStructure({ direction: 'long', entry: 100, stop: 97, targets: [106], clusters, horizon: 'day', tolerance: 0.1 });
  assert.equal(r.targets[0], 105);
  const capped = snapPlanToStructure({ direction: 'long', entry: 100, stop: 97, targets: [106], clusters, horizon: 'day', tolerance: 0.1, maxTarget: 104 });
  assert.equal(capped.targets[0], 104); // 105 is past the cap; no structure left in [102,104]
  assert.match(capped.notes.join(' '), /remains a formula target/);
});
t('min reach: a level at 20% of the reach is not a target', () => {
  const r = snapPlanToStructure({ direction: 'long', entry: 100, stop: 97, targets: [106], clusters: [cl(101, ['pdh', 'vwap'])], horizon: 'day', tolerance: 0.1 });
  assert.equal(r.targets[0], 106);
  assert.equal(r.targetLevels[0], null);
});
t('no structure: plan unchanged and said so', () => {
  const r = snapPlanToStructure({ direction: 'short', entry: 50, stop: 51, targets: [48], clusters: [], horizon: 'day', tolerance: 0.05 });
  assert.equal(r.changed, false);
  assert.equal(r.stop, 51); assert.equal(r.targets[0], 48);
  assert.match(r.text, /not structure/);
});
t('short mirror: target on the near (upper) edge, stop above the cluster', () => {
  const clusters = [cl(47.5, ['pdl', 'val_5d']), cl(51.2, ['pdh', 'premkt_high'])];
  const r = snapPlanToStructure({ direction: 'short', entry: 50, stop: 51, targets: [47], clusters, horizon: 'day', tolerance: 0.05 });
  assert.equal(r.targets[0], 47.5);
  assert.ok(r.stop > 51.2 && r.stop <= 51.25, `stop ${r.stop}`);
});
t('swing: ATR floor first, then structure beyond it — floor never needs to widen again', () => {
  // entry 100, formula stop 99 (1.0), ATR 2 → floor 2.5 → floored 97.5; structure at 97.3.
  const r = snapPlanToStructure({ direction: 'long', entry: 100, stop: 99, targets: [104], clusters: [cl(97.3, ['pdl', 'poc_5d'])], horizon: 'swing', tolerance: 0.1, dailyAtr: 2 });
  assert.equal(r.flooredStop, 97.5);
  assert.ok(r.stop < 97.3, `stop ${r.stop}`);
  assert.ok(100 - r.stop >= 1.25 * 2);
  // With no structure, the floored stop stands and is ≥ the floor even after rounding.
  const r2 = snapPlanToStructure({ direction: 'long', entry: 100.003, stop: 99, targets: [104], clusters: [], horizon: 'swing', tolerance: 0.1, dailyAtr: 2.0037 });
  assert.ok(100.003 - r2.stop >= 1.25 * 2.0037, `floored ${r2.stop}`);
  // Day horizon: no floor.
  const d = snapPlanToStructure({ direction: 'long', entry: 100, stop: 99, targets: [104], clusters: [], horizon: 'day', tolerance: 0.1, dailyAtr: 2 });
  assert.equal(d.stop, 99);
});
t('stop extension is bounded', () => {
  // formula risk 1 → at most 0.5 extra (no ATR): structure 2 below is too far.
  const r = snapPlanToStructure({ direction: 'long', entry: 100, stop: 99, targets: [102], clusters: [cl(97, ['pdl', 'val_5d'])], horizon: 'day', tolerance: 0.1 });
  assert.equal(r.stop, 99);
  assert.equal(r.stopLevel, null);
});
t('T2 must lie beyond T1', () => {
  const clusters = [cl(104, ['pdh', 'vah_5d']), cl(107, ['pwh', 'call_wall'])];
  const r = snapPlanToStructure({ direction: 'long', entry: 100, stop: 98, targets: [104.5, 108], clusters, horizon: 'day', tolerance: 0.1 });
  assert.deepEqual(r.targets, [104, 107]);
});

console.log(`levels: ${n} tests passed`);
