/**
 * Chart tool checks added with the 2026-09-30 chart audit: fractional-index →
 * pixel mapping (drawings between bars), touch hit tolerances and the
 * selected-handle priority, EMA / session VWAP, compare alignment, and the
 * saved-layout list operations.
 *   npx tsx scripts/test-chart-tools.ts      (npm run test:chart runs this and test-chart-drawings)
 */
import assert from 'node:assert/strict';
import {
  hitTest, hitTestAll, logicalToX, MOUSE_TOL, TOUCH_TOL, tolFor,
  type Drawing, type Projected,
} from '../client/src/components/charting/tv/drawing-geometry';
import { alignToTimes, calcEMA, calcSessionVWAP, cleanCompareSymbol, type Bar } from '../client/src/components/charting/tv/indicators';
import {
  LAYOUT_KEYS, MAX_LAYOUTS, cleanLayoutName, pickLayoutPrefs, removeLayout, sanitizeLayouts, upsertLayout,
} from '../client/src/components/charting/tv/chart-layouts';

const near = (a: number | null, b: number, eps = 1e-9, msg?: string) => assert.ok(a != null && Math.abs(a - b) <= eps, msg ?? `${a} ≈ ${b}`);
const D = (tool: Drawing['tool'], extra: Partial<Drawing> = {}): Drawing => ({ id: tool, tool, pts: [], color: 'accent', width: 2, ...extra });
const P = (d: Drawing, pts: { x: number; y: number }[], extra?: Projected['extra']): Projected => ({ d, pts, extra });

/* ── fractional logical → x (lightweight-charts maps whole indices only) ── */
{
  // Mimic LWC v5: whole indices map, a fractional one returns 0 (the bug).
  const lwc = (i: number) => (Number.isInteger(i) ? 100 + i * 8 : 0);
  near(logicalToX(lwc, 4), 132, 1e-9, 'whole index passes through');
  near(logicalToX(lwc, 4.5), 136, 1e-9, 'half-way between bars interpolates (was the left edge)');
  near(logicalToX(lwc, 42.0015), 100 + 42.0015 * 8, 1e-9, 'a 5m anchor on a 15m series lands between bars');
  near(logicalToX(lwc, -1.25), 90, 1e-9, 'before the first bar');
  assert.equal(logicalToX(() => null, 3.5), null, 'no time scale: null');
  assert.equal(logicalToX(lwc, Number.NaN), null, 'NaN: null');
}

/* ── touch tolerances ── */
{
  const W = 400; const H = 300;
  assert.equal(tolFor('mouse'), MOUSE_TOL);
  assert.equal(tolFor('touch'), TOUCH_TOL);
  assert.equal(tolFor('pen'), TOUCH_TOL);
  assert.ok(TOUCH_TOL.handle >= 18 && TOUCH_TOL.line >= 12, 'fingertip-sized targets');
  const trend = P(D('trend'), [{ x: 100, y: 200 }, { x: 300, y: 100 }]);
  // 12px off the line: a miss for the mouse, a hit for a finger
  assert.equal(hitTest(trend, 200, 162, W, H, MOUSE_TOL), null, 'mouse misses 12px away');
  assert.deepEqual(hitTest(trend, 200, 162, W, H, TOUCH_TOL), { kind: 'body' }, 'finger hits 12px away');
  // 16px off a handle: finger grabs the handle
  assert.deepEqual(hitTest(trend, 312, 110, W, H, TOUCH_TOL), { kind: 'handle', index: 1 }, 'finger grabs the end handle');
  assert.equal(hitTest(trend, 312, 110, W, H, MOUSE_TOL), null);
  // nearest handle wins when two are in reach
  const short = P(D('trend'), [{ x: 100, y: 100 }, { x: 120, y: 100 }]);
  assert.deepEqual(hitTest(short, 116, 100, W, H, TOUCH_TOL), { kind: 'handle', index: 1 }, 'nearest of two handles');
  // legacy numeric tolerance still works
  assert.deepEqual(hitTest(trend, 200, 152, W, H), { kind: 'body' });
  // the selected drawing's handle beats a line drawn later on top of it
  const sel = P(D('trend', { id: 'sel' }), [{ x: 100, y: 100 }, { x: 200, y: 100 }]);
  const later = P(D('hline', { id: 'later' }), [{ x: 0, y: 108 }]);
  assert.equal(hitTestAll([sel, later], 200, 106, W, H, TOUCH_TOL)?.id, 'later', 'unselected: topmost wins');
  const h = hitTestAll([sel, later], 200, 106, W, H, TOUCH_TOL, 'sel');
  assert.equal(h?.id, 'sel'); assert.deepEqual(h?.part, { kind: 'handle', index: 1 }, 'selected: its handle wins');
  const hidden = P(D('trend', { id: 'sel', hidden: true }), [{ x: 100, y: 100 }, { x: 200, y: 100 }]);
  assert.equal(hitTestAll([hidden, later], 200, 106, W, H, TOUCH_TOL, 'sel')?.id, 'later', 'a hidden selection is not grabbable');
}

/* ── EMA ── */
{
  const bars: Bar[] = [10, 11, 12, 13, 14, 15].map((c, i) => ({ time: i, open: c, high: c, low: c, close: c }));
  const e = calcEMA(bars, 3);
  assert.deepEqual(e.slice(0, 2), [null, null], 'no value before the seed');
  near(e[2], 11, 1e-12, 'seeded with the SMA of the first 3');
  near(e[3], 13 * 0.5 + 11 * 0.5, 1e-12, 'k = 2/(n+1)');
  near(e[5], 14, 1e-12, 'a linear series lags by (n−1)/2 bars');
  assert.ok(calcEMA(bars, 10).every((v) => v == null), 'too few bars: all null');
  assert.ok(calcEMA(bars, 0).every((v) => v == null), 'bad period: all null');
}

/* ── session VWAP ── */
{
  const b = (time: number, h: number, l: number, c: number, volume?: number): Bar => ({ time, open: c, high: h, low: l, close: c, volume });
  const day = (t: number) => (t < 100 ? 'd1' : 'd2');
  const bars = [b(1, 12, 8, 10, 100), b(2, 22, 18, 20, 300), b(3, 31, 29, 30, 0), b(101, 6, 4, 5, 50), b(102, 9, 9, 9)];
  const v = calcSessionVWAP(bars, day);
  near(v[0], 10, 1e-12, 'first bar = its typical price');
  near(v[1], (10 * 100 + 20 * 300) / 400, 1e-12, 'volume weighted');
  near(v[2], 17.5, 1e-12, 'a zero-volume bar carries the running value');
  near(v[3], 5, 1e-12, 'resets at the new session');
  near(v[4], 5, 1e-12, 'missing volume carries the value');
  const none = calcSessionVWAP([b(1, 2, 1, 1.5), b(2, 2, 1, 1.5, 0)], day);
  assert.deepEqual(none, [null, null], 'no volume in the session: no VWAP (never invented)');
}

/* ── compare ── */
{
  const main = [100, 200, 300, 400];
  const cmp = [{ time: 50 }, { time: 100 }, { time: 250 }, { time: 300 }, { time: 400 }, { time: 500 }];
  assert.deepEqual(alignToTimes(cmp, main).map((x) => x.time), [100, 300, 400], 'only the main series\' bar times (no new time points)');
  assert.deepEqual(alignToTimes(cmp, []), []);
  assert.equal(cleanCompareSymbol(' qqq '), 'QQQ');
  assert.equal(cleanCompareSymbol('BRK.B'), 'BRK.B');
  assert.equal(cleanCompareSymbol('^VIX'), '^VIX');
  assert.equal(cleanCompareSymbol('BTC-USD'), 'BTC-USD');
  assert.equal(cleanCompareSymbol(''), null);
  assert.equal(cleanCompareSymbol('DROP TABLE'), null, 'spaces rejected');
  assert.equal(cleanCompareSymbol('A'.repeat(16)), null, 'too long');
}

/* ── layouts ── */
{
  const prefs = { tf: '15m', type: 'bars', scale: 'log', vwap: true, ema: false, watchlist: true, setKeys: ['tf'] } as never;
  const picked = pickLayoutPrefs(prefs);
  assert.deepEqual(picked, { tf: '15m', type: 'bars', scale: 'log', vwap: true, ema: false }, 'only layout keys (no watchlist panel, no bookkeeping)');
  assert.ok((LAYOUT_KEYS as readonly string[]).includes('fullVolume'));
  let list = upsertLayout([], '  Scalp   setup ', prefs, 1);
  assert.equal(list[0].name, 'Scalp setup', 'name trimmed and collapsed');
  list = upsertLayout(list, 'Swing', { tf: '1D' } as never, 2);
  assert.deepEqual(list.map((l) => l.name), ['Swing', 'Scalp setup'], 'newest first');
  list = upsertLayout(list, 'scalp SETUP', { tf: '1m' } as never, 3);
  assert.deepEqual(list.map((l) => [l.name, l.prefs.tf]), [['scalp SETUP', '1m'], ['Swing', '1D']], 'same name (any case) overwrites');
  assert.deepEqual(upsertLayout(list, '   ', prefs, 4), list, 'blank name: unchanged');
  assert.deepEqual(removeLayout(list, 'swing').map((l) => l.name), ['scalp SETUP']);
  let many: ReturnType<typeof upsertLayout> = [];
  for (let i = 0; i < MAX_LAYOUTS + 5; i++) many = upsertLayout(many, `L${i}`, prefs, i);
  assert.equal(many.length, MAX_LAYOUTS, 'capped');
  assert.equal(many[0].name, `L${MAX_LAYOUTS + 4}`);
  assert.equal(cleanLayoutName('x'.repeat(60))!.length, 40);
  const clean = sanitizeLayouts([null, 3, { name: '' , prefs: {} }, { name: 'ok', prefs: { tf: '5m', evil: 1 }, savedAt: 'x' }, { name: 'np' }]);
  assert.deepEqual(clean, [{ name: 'ok', savedAt: 0, prefs: { tf: '5m' } }], 'malformed rows dropped, unknown keys dropped');
  assert.deepEqual(sanitizeLayouts('nope'), []);
}

console.log('chart tool checks passed');
