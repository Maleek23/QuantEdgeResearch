/**
 * Chart drawing checks: time ↔ logical mapping, hit-testing, Fibonacci levels,
 * the price-range measure, magnet snap, the undo/redo stack and the device
 * drawing store (sanitising + per-user-per-symbol keys).
 *   npx tsx scripts/test-chart-drawings.ts
 */
import assert from 'node:assert/strict';
import {
  channelPriceOffset, distToSegment, fibLevels, FIB_RATIOS, fmtDuration, hitTest, hitTestAll, logicalToTime,
  measure, medianBarMs, moveAnchor, rayEnd, snapToOhlc, timeToLogical, translate,
  type Drawing, type Projected,
} from '../client/src/components/charting/tv/drawing-geometry';
import { History } from '../client/src/components/charting/tv/drawing-history';
import { deviceDrawingStore, drawingKey, sanitizeDrawings } from '../client/src/components/charting/tv/drawing-store';

const near = (a: number, b: number, eps = 1e-9, msg?: string) => assert.ok(Math.abs(a - b) <= eps, msg ?? `${a} ≈ ${b}`);
const D = (tool: Drawing['tool'], extra: Partial<Drawing> = {}): Drawing => ({ id: tool, tool, pts: [], color: 'accent', width: 2, ...extra });
const P = (d: Drawing, pts: { x: number; y: number }[], extra?: Projected['extra']): Projected => ({ d, pts, extra });

/* ── time ↔ logical ── */
{
  const M = 60_000;
  // five 5-minute bars, then an overnight gap, then two more
  const times = [0, 5, 10, 15, 20, 1000, 1005].map((m) => m * M);
  const bar = medianBarMs(times);
  assert.equal(bar, 5 * M, 'median bar length ignores the overnight gap');
  assert.equal(timeToLogical(times, 10 * M, bar), 2, 'exact bar time → its index');
  near(timeToLogical(times, 12.5 * M, bar), 2.5, 1e-9, 'half-way between bars');
  near(timeToLogical(times, -5 * M, bar), -1, 1e-9, 'before the first bar extrapolates');
  near(timeToLogical(times, 1015 * M, bar), 8, 1e-9, 'past the last bar extrapolates at the bar length');
  // inside the overnight gap: at most one bar past the last session bar
  const inGap = timeToLogical(times, 500 * M, bar);
  assert.ok(inGap > 4 && inGap < 5, `gap point stays between bars 4 and 5 (got ${inGap})`);
  for (const l of [-2, 0, 1.5, 3, 4.4, 5, 6, 9.25]) near(timeToLogical(times, logicalToTime(times, l, bar), bar), l, 1e-6, `round trip ${l}`);
  assert.equal(timeToLogical([], 5, bar), 0, 'empty series is safe');
}

/* ── pixel geometry ── */
{
  near(distToSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 5);
  near(distToSegment({ x: -3, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 5, 1e-9, 'beyond the end measures to the endpoint');
  near(distToSegment({ x: 1, y: 1 }, { x: 0, y: 0 }, { x: 0, y: 0 }), Math.SQRT2, 1e-9, 'degenerate segment');
  const e = rayEnd({ x: 10, y: 10 }, { x: 20, y: 20 }, 100, 50);
  near(e.x, 50); near(e.y, 50);
  const e2 = rayEnd({ x: 50, y: 25 }, { x: 40, y: 25 }, 100, 50);
  near(e2.x, 0); near(e2.y, 25);
}

/* ── hit testing ── */
{
  const W = 800; const H = 400;
  const trend = P(D('trend'), [{ x: 100, y: 300 }, { x: 300, y: 100 }]);
  assert.deepEqual(hitTest(trend, 200, 200, W, H), { kind: 'body' }, 'on the line');
  assert.deepEqual(hitTest(trend, 204, 203, W, H), { kind: 'body' }, 'within tolerance');
  assert.equal(hitTest(trend, 220, 240, W, H), null, 'off the line');
  assert.equal(hitTest(trend, 400, 0, W, H), null, 'a segment does not extend');
  assert.deepEqual(hitTest(trend, 101, 299, W, H), { kind: 'handle', index: 0 }, 'grab the start handle');
  assert.deepEqual(hitTest(trend, 302, 101, W, H), { kind: 'handle', index: 1 }, 'grab the end handle');

  const ray = P(D('ray'), [{ x: 100, y: 300 }, { x: 300, y: 100 }]);
  assert.deepEqual(hitTest(ray, 350, 50, W, H), { kind: 'body' }, 'a ray extends past its second point');
  assert.equal(hitTest(ray, 50, 350, W, H), null, 'but not behind its origin');

  const hl = P(D('hline'), [{ x: 400, y: 150 }]);
  assert.deepEqual(hitTest(hl, 10, 153, W, H), { kind: 'body' }, 'horizontal line spans the pane');
  const hr = P(D('hray'), [{ x: 400, y: 150 }]);
  assert.equal(hitTest(hr, 10, 150, W, H), null, 'horizontal ray starts at its anchor');
  assert.deepEqual(hitTest(hr, 700, 150, W, H), { kind: 'body' });
  const vl = P(D('vline'), [{ x: 400, y: 150 }]);
  assert.deepEqual(hitTest(vl, 402, 390, W, H), { kind: 'body' }, 'vertical line spans the pane');

  const rect = P(D('rect'), [{ x: 100, y: 100 }, { x: 200, y: 180 }]);
  assert.deepEqual(hitTest(rect, 150, 140, W, H), { kind: 'body' }, 'inside a rectangle');
  assert.equal(hitTest(rect, 250, 140, W, H), null);

  const ch = P(D('channel'), [{ x: 100, y: 200 }, { x: 300, y: 100 }, { x: 200, y: 250 }], { line2: [{ x: 100, y: 300 }, { x: 300, y: 200 }] });
  assert.deepEqual(hitTest(ch, 200, 250, W, H), { kind: 'handle', index: 2 }, 'channel third handle');
  assert.deepEqual(hitTest(ch, 150, 275, W, H), { kind: 'body' }, 'on the parallel line');
  assert.deepEqual(hitTest(ch, 150, 220, W, H), { kind: 'body' }, 'inside the channel');
  assert.equal(hitTest(ch, 150, 320, W, H), null, 'outside the channel');

  const fib = P(D('fib'), [{ x: 100, y: 300 }, { x: 300, y: 100 }], { levelYs: [100, 147.2, 176.4, 200, 223.6, 257.2, 300] });
  assert.deepEqual(hitTest(fib, 150, 201, W, H), { kind: 'body' }, 'on the 0.5 level');
  assert.equal(hitTest(fib, 400, 200, W, H), null, 'levels stop at the drawn span');
  assert.equal(hitTest(fib, 150, 190, W, H), null, 'between levels, off the diagonal');

  const txt = P(D('text', { text: 'Hello' }), [{ x: 100, y: 100 }], { textW: 40 });
  assert.deepEqual(hitTest(txt, 120, 92, W, H), { kind: 'body' }, 'on the text');
  assert.equal(hitTest(txt, 160, 92, W, H), null, 'past the text width');

  const brush = P(D('brush'), [{ x: 10, y: 10 }, { x: 20, y: 30 }, { x: 60, y: 30 }]);
  assert.deepEqual(hitTest(brush, 40, 31, W, H), { kind: 'body' }, 'brush polyline');
  assert.deepEqual(hitTest(brush, 10, 10, W, H), { kind: 'body' }, 'brush has no handles');

  const meas = P(D('measure'), [{ x: 100, y: 100 }, { x: 200, y: 200 }]);
  assert.deepEqual(hitTest(meas, 150, 120, W, H), { kind: 'body' }, 'inside the measure box');

  // topmost wins, hidden skipped
  const a = P(D('hline', { id: 'a' }), [{ x: 0, y: 100 }]);
  const b = P(D('hline', { id: 'b' }), [{ x: 0, y: 102 }]);
  assert.equal(hitTestAll([a, b], 50, 101, W, H)?.id, 'b', 'last drawn is on top');
  const bh = P(D('hline', { id: 'b', hidden: true }), [{ x: 0, y: 102 }]);
  assert.equal(hitTestAll([a, bh], 50, 101, W, H)?.id, 'a', 'hidden drawings are not hit');
}

/* ── Fibonacci ── */
{
  const lv = fibLevels(100, 200);
  assert.deepEqual(lv.map((l) => l.ratio), [...FIB_RATIOS]);
  near(lv[0].price, 200, 1e-9, 'level 0 at the end point');
  near(lv[lv.length - 1].price, 100, 1e-9, 'level 1 at the start point');
  near(lv.find((l) => l.ratio === 0.5)!.price, 150);
  near(lv.find((l) => l.ratio === 0.618)!.price, 138.2, 1e-9);
  near(lv.find((l) => l.ratio === 0.382)!.price, 161.8, 1e-9);
  // drawn top-down (a sell-off): retracement levels climb from the low
  const dn = fibLevels(200, 100);
  near(dn.find((l) => l.ratio === 0.618)!.price, 161.8, 1e-9);
  near(dn[0].price, 100);
}

/* ── measure ── */
{
  const m = measure({ t: 0, p: 200 }, { t: 3_600_000 * 2.5, p: 210 }, 10, 40);
  near(m.dPrice, 10); near(m.pct, 5); assert.equal(m.bars, 30); assert.equal(m.ms, 9_000_000);
  assert.equal(fmtDuration(m.ms), '2h 30m');
  const d = measure({ t: 0, p: 50 }, { t: -86_400_000 * 3, p: 45 }, 20, 17);
  near(d.dPrice, -5); near(d.pct, -10); assert.equal(d.bars, -3);
  assert.equal(fmtDuration(d.ms), '3d', 'two days and up print in days');
  assert.equal(fmtDuration(86_400_000 * 5), '5d');
  assert.equal(fmtDuration(45 * 60_000), '45m');
  assert.equal(measure({ t: 0, p: 0 }, { t: 1, p: 5 }, 0, 1).pct, 0, 'zero start price does not divide by zero');
}

/* ── magnet ── */
{
  const bar = { open: 100, high: 110, low: 95, close: 105 };
  const toY = (p: number) => 1000 - p * 5; // 5 px per dollar
  assert.equal(snapToOhlc(108.9, bar, toY, toY(108.9), 20), 110, 'snaps to the high');
  assert.equal(snapToOhlc(101.5, bar, toY, toY(101.5), 20), 100, 'snaps to the open');
  assert.equal(snapToOhlc(102.5, bar, toY, toY(102.5), 5), 102.5, 'too far from every OHLC value: unchanged');
  assert.equal(snapToOhlc(102.5, null, toY, 0, 50), 102.5, 'no bar: unchanged');
}

/* ── edits ── */
{
  const d: Drawing = { id: 'x', tool: 'trend', pts: [{ t: 1, p: 10 }, { t: 5, p: 20 }], color: 'accent', width: 2 };
  assert.deepEqual(translate(d, 2, -1).pts, [{ t: 3, p: 9 }, { t: 7, p: 19 }]);
  assert.deepEqual(moveAnchor(d, 1, { t: 9, p: 30 }).pts, [{ t: 1, p: 10 }, { t: 9, p: 30 }]);
  assert.deepEqual(d.pts[1], { t: 5, p: 20 }, 'edits never mutate');
  near(channelPriceOffset({ t: 0, p: 100 }, { t: 10, p: 110 }, { t: 5, p: 101 }), -4, 1e-9, 'channel offset measured at the third point');
}

/* ── undo / redo ── */
{
  const h = new History<number[]>(3);
  let s: number[] = [];
  const commit = (n: number[]) => { h.commit(s); s = n; };
  commit([1]); commit([1, 2]); commit([1, 2, 3]);
  assert.equal(h.canUndo, true); assert.equal(h.canRedo, false);
  s = h.undo(s)!; assert.deepEqual(s, [1, 2]);
  s = h.undo(s)!; assert.deepEqual(s, [1]);
  assert.equal(h.canRedo, true);
  s = h.redo(s)!; assert.deepEqual(s, [1, 2]);
  commit([1, 2, 9]);
  assert.equal(h.canRedo, false, 'a new edit drops the redo branch');
  assert.equal(h.redo(s), null);
  const h2 = new History<string>(2);
  let v = 'a'; for (const n of ['b', 'c', 'd']) { h2.commit(v); v = n; }
  assert.equal(h2.depth.undo, 2, 'capped at 2');
  v = h2.undo(v)!; v = h2.undo(v)!;
  assert.equal(v, 'b', 'oldest step beyond the cap is gone');
  assert.equal(h2.undo(v), null);
  h2.clear(); assert.equal(h2.canUndo || h2.canRedo, false);
}

/* ── device store ── */
{
  const mem = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => { mem.set(k, v); },
    removeItem: (k: string) => { mem.delete(k); },
  };
  const scope = { userId: 'u1', symbol: 'spy' };
  assert.equal(drawingKey(scope), 'qe-drawings-v1:u1:SPY', 'per user, per upper-cased symbol');
  assert.notEqual(drawingKey({ userId: 'u2', symbol: 'SPY' }), drawingKey(scope), 'users do not share drawings');
  const d: Drawing = { id: 'k1', tool: 'fib', pts: [{ t: 1, p: 2 }, { t: 3, p: 4 }], color: 'marker', width: 3, locked: true };
  deviceDrawingStore.save(scope, [d]);
  assert.deepEqual(deviceDrawingStore.load({ userId: 'u1', symbol: 'SPY' }), [d]);
  deviceDrawingStore.save(scope, []);
  assert.equal(mem.size, 0, 'an empty list removes the key');
  const bad = sanitizeDrawings([
    null, 7, { id: 'a', tool: 'nope', pts: [{ t: 1, p: 1 }] }, { id: 'b', tool: 'trend', pts: [] },
    { id: 'c', tool: 'trend', pts: [{ t: 1, p: 1 }, { t: 'x', p: 2 }], color: '#ff0000', width: 9, text: 5 },
  ]);
  assert.equal(bad.length, 1, 'malformed rows are dropped');
  assert.deepEqual(bad[0], { id: 'c', tool: 'trend', pts: [{ t: 1, p: 1 }], color: 'accent', width: 2 }, 'literal colours and bad widths fall back to tokens');
  mem.set('qe-drawings-v1:u1:QQQ', '{not json');
  assert.deepEqual(deviceDrawingStore.load({ userId: 'u1', symbol: 'QQQ' }), [], 'corrupt storage loads empty');
}

console.log('chart drawing checks passed');
