/**
 * Charting-pro checks (2026-10-13) — the pure logic behind the pro chart:
 *   geometry of the new tools (extended line, Fib extension, long / short
 *   position sized in option contracts at $500 / $1,000, price label), snapping (O/H/L/C and
 *   dealer levels), selection ops (duplicate, patch, remove, toggle),
 *   undo / redo over drawing sets, serialisation + sanitising, the
 *   device-vs-server sync rule and synced store, the trading clock that
 *   prices trend-line alerts, the server drawing store and alert parsing,
 *   snapshot layout / naming, custom intervals, and label collision layout.
 *   npm run test:charting-pro
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  describeDrawing, duplicateDrawings, extendedEnds, fibExtLevels, hitTest, moveAnchor, nearestLevel, newPositionAnchors,
  patchDrawings, positionPnl, positionStats, removeDrawings, snapToLevels, snapToOhlc, toggleSelection, dashPattern, fillOf,
  type Drawing, type Projected,
} from '../client/src/components/charting/tv/drawing-geometry';
import { chainChoices, suggestPositionContract } from '../shared/position-contract';
import { History } from '../client/src/components/charting/tv/drawing-history';
import { createSyncedDrawingStore, drawingKey, type KV } from '../client/src/components/charting/tv/drawing-store';
import {
  alertLineFor, crossDirection, crossed, linePriceAt, MAX_DRAWINGS_PER_SYMBOL, parseDrawingsDoc, pickNewer, sanitizeDrawings,
  serializeDrawings, tradingUnits, type AlertLine,
} from '../shared/chart-drawings';
import { fitCaption, snapshotCaption, snapshotFileName, snapshotLayout, SNAP_FOOTER_CSS } from '../client/src/components/charting/tv/chart-snapshot';
import { candleRects, fitText, labelCandidates, overlaps, placeLabel } from '../client/src/components/charting/tv/label-layout';
import { parseInterval } from '../client/src/components/charting/tv/custom-intervals';
import { cleanSymbol, fileChartDrawingStore } from '../server/chart-drawings-store';
import { alertLevelAt, parseAlertLine } from '../server/price-alerts';

let n = 0;
const sections: string[] = [];
async function t(name: string, fn: () => void | Promise<void>) {
  try { await fn(); n++; sections.push(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
const near = (a: number, b: number, eps = 1e-9, msg?: string) => assert.ok(Math.abs(a - b) <= eps, msg ?? `${a} ≈ ${b}`);
const D = (tool: Drawing['tool'], pts: Drawing['pts'], extra: Partial<Drawing> = {}): Drawing => ({ id: `${tool}${pts.length}`, tool, pts, color: 'accent', width: 2, ...extra });
const P = (d: Drawing, pts: { x: number; y: number }[], extra?: Projected['extra']): Projected => ({ d, pts, extra });
// ET wall clock → epoch ms (October: EDT, UTC−4)
const et = (iso: string) => Date.parse(`${iso}-04:00`);

async function main() {
  /* ───────── geometry: new tools ───────── */
  await t('extended line runs to both viewport edges', () => {
    const [e1, e2] = extendedEnds({ x: 40, y: 60 }, { x: 60, y: 40 }, 100, 100);
    near(e1.x, 0); near(e1.y, 100); near(e2.x, 100); near(e2.y, 0);
    const d = D('extended', [{ t: 0, p: 1 }, { t: 1, p: 2 }]);
    assert.deepEqual(hitTest(P(d, [{ x: 40, y: 60 }, { x: 60, y: 40 }]), 5, 95, 100, 100), { kind: 'body' }, 'hit far beyond the anchors');
    assert.equal(hitTest(P(d, [{ x: 40, y: 60 }, { x: 60, y: 40 }]), 5, 40, 100, 100), null);
  });

  await t('Fib extension: c + (b − a)·r', () => {
    const lv = fibExtLevels(100, 110, 105);
    assert.deepEqual(lv.map((l) => l.ratio), [0, 0.382, 0.618, 1, 1.272, 1.618, 2, 2.618]);
    near(lv[0].price, 105); near(lv[3].price, 115); near(lv[5].price, 105 + 16.18, 1e-9);
    const down = fibExtLevels(110, 100, 104);
    near(down[3].price, 94, 1e-9, 'a down-leg projects down');
  });

  // Position tool sizes in OPTION CONTRACTS only (operator 2026-10-14: no shares at all).
  const CALL = { optionType: 'call' as const, strike: 100, expiry: '2026-10-23', dte: 9, mid: 2, spot: 100, delta: 0.5, gamma: 0.05, iv: null };
  const PUT = { ...CALL, optionType: 'put' as const, strike: 50, spot: 50, delta: -0.5, mid: 1 };
  await t('long position: no contract → not sized, never shares', () => {
    const d = D('long', [{ t: 0, p: 100 }, { t: 9, p: 106 }, { t: 9, p: 97 }]);
    const s = positionStats(d, 500)!;
    assert.equal(s.side, 'long'); near(s.rr!, 2); near(s.riskPer, 3); near(s.rewardPer, 6);
    assert.equal(s.qty, null, 'no shares fallback'); assert.equal(s.opt, null); assert.equal(s.riskDollars, null);
    near(s.stopPct, -3); near(s.targetPct, 6); assert.equal(s.invalid, null);
    assert.ok(!('notional' in s), 'no share notional');
  });

  await t('long position on a call: whole contracts at the $ risk, premiums mapped by delta+½gamma', () => {
    const d = { ...D('long', [{ t: 0, p: 100 }, { t: 9, p: 106 }, { t: 9, p: 97 }]), contract: CALL };
    const s = positionStats(d, 500, 'AAPL')!;
    assert.equal(s.qty, 2, 'floor(500 / 200) contracts'); near(s.debit!, 400);
    near(s.opt!.premEntry, 2); near(s.opt!.premT1, Math.max(6, 2 + 0.5 * 6 + 0.5 * 0.05 * 36), 1e-6, "never below intrinsic"); near(s.opt!.premStop, 0.73, 1e-6, "rounded to the cent");
    near(s.riskDollars!, 2 * (2 - s.opt!.premStop) * 100); near(s.rewardDollars!, 2 * (s.opt!.premT1 - 2) * 100);
    assert.match(s.opt!.label, /^AAPL 10\/23 100C$/);
    assert.equal(positionStats({ ...d, risk: 1000 }, undefined, 'AAPL')!.qty, 5, 'the drawing remembers its risk');
    const p = positionPnl(s, 101.5, CALL); near(p.per, 1.5); near(p.r!, 0.5); assert.ok(p.dollars! > 0);
  });

  await t('short position mirrors on a put; a stop on the wrong side is flagged, not sized', () => {
    const s = positionStats({ ...D('short', [{ t: 0, p: 50 }, { t: 9, p: 46 }, { t: 9, p: 52 }]), contract: PUT }, 1000)!;
    assert.equal(s.qty, 10); near(s.rr!, 2); near(positionPnl(s, 49, PUT).per, 1);
    const wrong = positionStats({ ...D('short', [{ t: 0, p: 50 }, { t: 9, p: 46 }, { t: 9, p: 52 }]), contract: { ...PUT, optionType: 'call' as const } }, 1000)!;
    assert.match(wrong.invalid!, /needs a put/); assert.equal(wrong.qty, null);
    const pricey = positionStats({ ...D('long', [{ t: 0, p: 100 }, { t: 9, p: 106 }, { t: 9, p: 97 }]), contract: { ...CALL, mid: 8 } }, 500)!;
    assert.match(pricey.invalid!, /more than the \$500 risk/); assert.equal(pricey.qty, null);
    const bad = positionStats(D('long', [{ t: 0, p: 100 }, { t: 9, p: 106 }, { t: 9, p: 101 }]))!;
    assert.match(bad.invalid!, /stop is above/); assert.equal(bad.qty, null); assert.equal(bad.rr, null);
    assert.equal(positionStats(D('trend', [{ t: 0, p: 1 }, { t: 1, p: 2 }])), null);
  });

  await t('position contract: budget-contract default from the chain; no liquid row → reason, no shares', () => {
    const rows = [95, 100, 105, 110].map((k) => ({ type: 'call' as const, strike: k, expiry: '2026-10-23', bid: Math.max(0.2, 100 - k + 2) - 0.05, ask: Math.max(0.2, 100 - k + 2) + 0.05, delta: Math.max(0.1, 0.5 - (k - 100) * 0.05), gamma: 0.04, iv: null, openInterest: 5000, volume: 2000, dte: 9 }));
    const ok = suggestPositionContract({ symbol: 'AAPL', side: 'long', spot: 100, entry: 100, stop: 97, target: 106, risk: 500, rows, nowMs: Date.parse('2026-10-14T15:00:00Z') });
    if (ok.ok) { assert.equal(ok.contract.optionType, 'call'); assert.ok(ok.contract.mid * 100 <= 500); } else assert.match(ok.reason, /No liquid contract/);
    const none = suggestPositionContract({ symbol: 'AAPL', side: 'long', spot: 100, entry: 100, stop: 97, target: 106, risk: 500, rows: [], nowMs: 0 });
    assert.equal(none.ok, false); if (!none.ok) { assert.match(none.reason, /No liquid contract/); assert.match(none.reason, /never sizes in shares/); }
    assert.deepEqual(chainChoices(rows, 'call').map((x) => x.expiry), ['2026-10-23']);
    assert.equal(chainChoices(rows, 'put').length, 0);
  });

  await t('position contract survives the sanitiser; junk is dropped', () => {
    const [d] = sanitizeDrawings([{ id: 'p1', tool: 'long', pts: [{ t: 0, p: 100 }, { t: 9, p: 106 }, { t: 9, p: 97 }], color: 'accent', width: 2, contract: CALL }]);
    assert.equal(d.contract?.strike, 100);
    const [j] = sanitizeDrawings([{ id: 'p2', tool: 'long', pts: [{ t: 0, p: 100 }], color: 'accent', width: 2, contract: { optionType: 'stock', strike: 1 } }]);
    assert.equal(j.contract, undefined);
  });

  await t('new position: stop one risk away, target 2R, shared right edge', () => {
    const a = newPositionAnchors('long', { t: 1000, p: 100 }, 2, 60_000);
    assert.deepEqual(a, [{ t: 1000, p: 100 }, { t: 61_000, p: 104 }, { t: 61_000, p: 98 }]);
    const s = newPositionAnchors('short', { t: 0, p: 50 }, 0, 10);
    near(s[2].p, 50.5, 1e-9, 'zero risk distance falls back to 1% of price'); near(s[1].p, 49);
  });

  await t('position handles: target / stop share the right edge; entry moves alone', () => {
    const d = D('long', [{ t: 0, p: 100 }, { t: 9, p: 106 }, { t: 9, p: 97 }]);
    const m = moveAnchor(d, 1, { t: 20, p: 108 });
    assert.deepEqual(m.pts, [{ t: 0, p: 100 }, { t: 20, p: 108 }, { t: 20, p: 97 }]);
    assert.deepEqual(moveAnchor(d, 0, { t: 3, p: 101 }).pts[1], { t: 9, p: 106 });
    assert.deepEqual(moveAnchor(D('trend', [{ t: 0, p: 1 }, { t: 1, p: 2 }]), 1, { t: 5, p: 5 }).pts, [{ t: 0, p: 1 }, { t: 5, p: 5 }]);
  });

  await t('hit-testing: position box, price label, Fib extension', () => {
    const pos = D('long', [{ t: 0, p: 100 }, { t: 9, p: 106 }, { t: 9, p: 97 }]);
    const pr = P(pos, [{ x: 10, y: 50 }, { x: 90, y: 20 }, { x: 90, y: 70 }]);
    assert.deepEqual(hitTest(pr, 50, 60, 200, 200), { kind: 'body' });
    assert.deepEqual(hitTest(pr, 90, 70, 200, 200), { kind: 'handle', index: 2 });
    assert.equal(hitTest(pr, 150, 60, 200, 200), null);
    const lab = P(D('pricelabel', [{ t: 0, p: 1 }]), [{ x: 20, y: 50 }], { textW: 60 });
    assert.deepEqual(hitTest(lab, 50, 38, 200, 200), { kind: 'body' }, 'the callout flag is grabbable');
    const fx = P(D('fibext', [{ t: 0, p: 1 }, { t: 1, p: 2 }, { t: 2, p: 1.5 }]), [{ x: 10, y: 90 }, { x: 40, y: 30 }, { x: 60, y: 60 }], { levelYs: [60, 20] });
    assert.deepEqual(hitTest(fx, 70, 21, 200, 200), { kind: 'body' });
  });

  await t('style helpers: dash patterns and default fills', () => {
    assert.deepEqual(dashPattern(undefined, 2), []); assert.deepEqual(dashPattern('solid', 2), []);
    assert.deepEqual(dashPattern('dashed', 1), [8, 5]); assert.deepEqual(dashPattern('dotted', 2), [2, 5]);
    near(fillOf(D('rect', [])), 0.12); near(fillOf(D('rect', [], { fill: 0.28 })), 0.28); near(fillOf(D('trend', [])), 0);
  });

  /* ───────── snapping ───────── */
  await t('magnet to O/H/L/C, then dealer levels within the pixel radius', () => {
    const y = (p: number) => 1000 - p * 2; // 2px per $1
    near(snapToOhlc(100.4, { open: 99, high: 101, low: 98, close: 100 }, y, y(100.4), 28), 100);
    const levels = [{ price: 585, label: 'Call wall' }, { price: 570.8, label: 'Zero-γ' }, { price: 580, label: 'Apex node 580' }];
    const hit = snapToLevels(579, y(579), levels, y, 10);
    assert.equal(hit.price, 580); assert.equal(hit.level?.label, 'Apex node 580');
    const miss = snapToLevels(575, y(575), levels, y, 6);
    assert.equal(miss.price, 575); assert.equal(miss.level, null, 'outside the radius: untouched');
    assert.equal(nearestLevel(574, levels)?.label, 'Zero-γ');
    assert.equal(nearestLevel(574, []), null);
  });

  /* ───────── selection ops + undo / redo ───────── */
  await t('duplicate (nudged, un-armed, unlocked), patch, remove skips locked, toggle', () => {
    const a = D('hline', [{ t: 0, p: 10 }], { id: 'a', alert: { id: 'x', armedAt: 1 }, locked: true });
    const b = D('trend', [{ t: 0, p: 1 }, { t: 5, p: 2 }], { id: 'b' });
    let k = 0;
    const { next, added } = duplicateDrawings([a, b], ['a', 'b'], 300, 0.5, () => `c${k++}`);
    assert.deepEqual(added, ['c0', 'c1']); assert.equal(next.length, 4);
    assert.deepEqual(next[2].pts, [{ t: 300, p: 10.5 }]); assert.equal(next[2].alert, undefined); assert.equal(next[2].locked, undefined);
    const patched = patchDrawings(next, ['b', 'c1'], { color: 'loss', dash: 'dashed' });
    assert.equal(patched[1].color, 'loss'); assert.equal(patched[3].dash, 'dashed'); assert.equal(patched[0].color, 'accent');
    assert.equal(patchDrawings(patched, ['b'], { dash: undefined })[1].dash, undefined, 'undefined clears a field');
    assert.equal(patchDrawings(patched, ['zzz'], { color: 'gain' }), patched, 'no-op keeps the same array (no undo step)');
    const removed = removeDrawings(patched, ['a', 'b']);
    assert.deepEqual(removed.map((d) => d.id), ['a', 'c0', 'c1'], 'locked drawing survives delete');
    assert.deepEqual(toggleSelection(['a', 'b'], 'a'), ['b']); assert.deepEqual(toggleSelection(['b'], 'c'), ['b', 'c']);
  });

  await t('undo / redo over drawing sets (one drag or group edit = one step)', () => {
    const h = new History<Drawing[]>();
    let cur: Drawing[] = [];
    const commit = (next: Drawing[]) => { h.commit(cur); cur = next; };
    const x = D('hline', [{ t: 0, p: 1 }], { id: 'x' });
    commit([x]);
    commit(patchDrawings(cur, ['x'], { color: 'gain', width: 3 }));
    commit(duplicateDrawings(cur, ['x'], 1, 1, () => 'y').next);
    assert.equal(cur.length, 2);
    cur = h.undo(cur)!; assert.equal(cur.length, 1); assert.equal(cur[0].color, 'gain');
    cur = h.undo(cur)!; assert.equal(cur[0].color, 'accent');
    cur = h.redo(cur)!; assert.equal(cur[0].width, 3);
  });

  /* ───────── serialisation ───────── */
  await t('serialise → parse round trip; v1 bare arrays still load', () => {
    const d: Drawing[] = [
      D('long', [{ t: 1, p: 100 }, { t: 2, p: 106 }, { t: 2, p: 97 }], { id: 'p1', risk: 1000, fill: 0.16 }),
      D('trend', [{ t: 1, p: 1 }, { t: 2, p: 2 }], { id: 't1', dash: 'dotted', alert: { id: 'SPY-abc', armedAt: 5 } }),
    ];
    const doc = parseDrawingsDoc(serializeDrawings('spy', d, 1234));
    assert.equal(doc.symbol, 'SPY'); assert.equal(doc.updatedAt, 1234); assert.deepEqual(doc.drawings, d);
    const v1 = parseDrawingsDoc(JSON.stringify([{ id: 'old', tool: 'fib', pts: [{ t: 1, p: 2 }, { t: 3, p: 4 }], color: 'marker', width: 3 }]));
    assert.equal(v1.drawings.length, 1); assert.equal(v1.updatedAt, 0, 'a v1 copy is older than any server copy');
    assert.deepEqual(parseDrawingsDoc('{nope').drawings, []);
  });

  await t('sanitiser: new fields validated, duplicates and overflow dropped', () => {
    const out = sanitizeDrawings([
      { id: 'a', tool: 'trend', pts: [{ t: 1, p: 1 }], dash: 'wavy', fill: 7, risk: -5, alert: { armedAt: 'x' } },
      { id: 'a', tool: 'hline', pts: [{ t: 1, p: 1 }] },
      { id: 'b', tool: 'short', pts: [{ t: 1, p: 1 }], dash: 'dashed', fill: 0.2, risk: 1000, alert: { id: 'q', armedAt: 9 } },
    ]);
    assert.deepEqual(out.map((d) => d.id), ['a', 'b'], 'duplicate ids dropped');
    assert.equal(out[0].dash, undefined); assert.equal(out[0].fill, 1, 'fill clamped to 0..1'); assert.equal(out[0].risk, undefined); assert.equal(out[0].alert, undefined);
    assert.equal(out[1].dash, 'dashed'); assert.equal(out[1].risk, 1000); assert.deepEqual(out[1].alert, { id: 'q', armedAt: 9 });
    const many = Array.from({ length: MAX_DRAWINGS_PER_SYMBOL + 20 }, (_, i) => ({ id: `d${i}`, tool: 'hline', pts: [{ t: 1, p: i + 1 }] }));
    assert.equal(sanitizeDrawings(many).length, MAX_DRAWINGS_PER_SYMBOL);
  });

  /* ───────── sync ───────── */
  await t('pickNewer: newer set wins whole; ties keep the server copy', () => {
    assert.equal(pickNewer({ updatedAt: 5 }, { updatedAt: 3 }).winner, 'local');
    assert.equal(pickNewer({ updatedAt: 3 }, { updatedAt: 3 }).winner, 'server');
    assert.equal(pickNewer(null, { updatedAt: 1 }).winner, 'server');
    assert.equal(pickNewer(null, null).winner, 'none');
  });

  await t('synced store: server copy lands and notifies; a newer device copy is pushed; anon stays local', async () => {
    const mem = new Map<string, string>();
    const kv: KV = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => { mem.set(k, v); }, removeItem: (k) => { mem.delete(k); } };
    let server: { drawings: Drawing[]; updatedAt: number } = { drawings: [D('hline', [{ t: 1, p: 580 }], { id: 'srv' })], updatedAt: 2000 };
    const puts: { drawings: Drawing[]; updatedAt: number }[] = [];
    let clock = 1000;
    const store = createSyncedDrawingStore({
      kv: () => kv, now: () => clock, debounceMs: 5, minRefetchMs: 0,
      fetch: async (_u, init) => {
        if (init?.method === 'PUT') { const b = JSON.parse(init.body!); puts.push(b); server = b; return { ok: true, status: 200, json: async () => ({ ok: true }) }; }
        return { ok: true, status: 200, json: async () => ({ ...server }) };
      },
    });
    const scope = { userId: 'u1', symbol: 'SPY' };
    let notified = 0;
    const off = store.subscribe(scope, () => { notified++; });
    assert.deepEqual(store.load(scope), [], 'first paint: the (empty) device copy');
    await store.pull(scope, true);
    assert.equal(notified, 1, 'server copy landed → listeners told');
    assert.deepEqual(store.load(scope).map((d) => d.id), ['srv']);
    assert.equal(store.status!(scope).state, 'synced');
    // an edit made now (clock later than the server stamp) goes up after the debounce
    clock = 5000;
    store.save(scope, [D('trend', [{ t: 1, p: 1 }, { t: 2, p: 2 }], { id: 'mine' })]);
    await store.flush();
    assert.equal(puts.length, 1); assert.equal(puts[0].updatedAt, 5000); assert.deepEqual(puts[0].drawings.map((d) => d.id), ['mine']);
    // offline edit newer than the server: pull pushes it rather than overwriting it
    mem.set(drawingKey(scope), serializeDrawings('SPY', [D('hline', [{ t: 1, p: 1 }], { id: 'offline' })], 9000));
    await store.pull(scope, true);
    assert.equal(puts.length, 2); assert.deepEqual(puts[1].drawings.map((d) => d.id), ['offline']);
    // signed out: device only, never fetched
    const anon = { userId: 'anon', symbol: 'QQQ' };
    store.save(anon, [D('hline', [{ t: 1, p: 1 }], { id: 'z' })]);
    await store.flush();
    assert.equal(puts.length, 2, 'anon never PUTs'); assert.equal(store.status!(anon).state, 'device');
    off();
  });

  /* ───────── trading clock + line alerts ───────── */
  await t('trading clock: RTH minutes skip nights and weekends; daily bars land on their session', () => {
    const fri1530 = et('2026-10-09T15:30:00'); const mon1000 = et('2026-10-12T10:00:00');
    near(tradingUnits(mon1000, 'rth') - tradingUnits(fri1530, 'rth'), 30 + 30, 1e-6, 'Fri 15:30 → Mon 10:00 = 60 RTH minutes');
    near(tradingUnits(et('2026-10-12T08:00:00'), 'rth'), tradingUnits(et('2026-10-12T09:30:00'), 'rth'), 1e-6, 'pre-market sits at the open');
    near(tradingUnits(et('2026-10-12T08:00:00'), 'eth') - tradingUnits(et('2026-10-12T04:00:00'), 'eth'), 240, 1e-6);
    // daily bars stamped 00:00 UTC (the prior evening in New York)
    const friBar = Date.UTC(2026, 9, 9); const monBar = Date.UTC(2026, 9, 12);
    near(tradingUnits(monBar, 'days') - tradingUnits(friBar, 'days'), 1, 1e-9, 'Fri → Mon daily bars are one session apart');
    near(tradingUnits(et('2026-10-12T12:45:00'), 'days') - tradingUnits(monBar, 'days'), 0.5, 1e-9, 'mid-session is half a bar in');
  });

  await t('linePriceAt: slope on the trading clock; segments end, rays start, extended lines run both ways', () => {
    const line: AlertLine = { t1: et('2026-10-09T15:00:00'), p1: 100, t2: et('2026-10-09T16:00:00'), p2: 103, extend: 'right', basis: 'rth' };
    near(linePriceAt(line, et('2026-10-12T10:00:00'))!, 103 + 0.05 * 30, 1e-9, 'continues over the weekend at 3$/60 RTH min');
    assert.equal(linePriceAt(line, et('2026-10-09T14:00:00')), null, 'a ray does not exist before its start');
    assert.equal(linePriceAt({ ...line, extend: 'none' }, et('2026-10-12T10:00:00')), null, 'a segment has ended');
    near(linePriceAt({ ...line, extend: 'both' }, et('2026-10-09T14:30:00'))!, 98.5, 1e-9);
    near(linePriceAt({ ...line, basis: 'clock' }, et('2026-10-09T15:30:00'))!, 101.5, 1e-9);
  });

  await t('cross direction / crossed / alertLineFor', () => {
    assert.equal(crossDirection(580, 575), 'above'); assert.equal(crossDirection(580, 585), 'below'); assert.equal(crossDirection(580, null), 'above');
    assert.equal(crossed(579, 580, 580), 'up'); assert.equal(crossed(581, 579.5, 580), 'down'); assert.equal(crossed(579, 579.9, 580), null);
    assert.deepEqual(alertLineFor(D('hline', [{ t: 1, p: 580 }]), 'rth'), { price: 580, line: null });
    const tr = alertLineFor(D('ray', [{ t: 1, p: 1 }, { t: 2, p: 2 }]), 'eth')!;
    assert.equal(tr.line!.extend, 'right'); assert.equal(tr.line!.basis, 'eth');
    assert.equal(alertLineFor(D('extended', [{ t: 1, p: 1 }, { t: 2, p: 2 }]), 'rth')!.line!.extend, 'both');
    assert.equal(alertLineFor(D('trend', [{ t: 1, p: 5 }, { t: 2, p: 5 }]), 'rth')!.line, null, 'a flat trend line is a level');
    assert.equal(alertLineFor(D('rect', [{ t: 1, p: 1 }, { t: 2, p: 2 }]), 'rth'), null);
  });

  await t('server alerts: line payload validated; level priced at sweep time', () => {
    assert.equal(parseAlertLine(null), null);
    assert.equal(parseAlertLine({ t1: 1, p1: 1, t2: 1, p2: 2 }), null, 'zero-length in time');
    assert.equal(parseAlertLine({ t1: 1, p1: -1, t2: 2, p2: 2 }), null);
    const l = parseAlertLine({ t1: 0, p1: 100, t2: 60_000, p2: 101, extend: 'sideways', basis: 'nope' })!;
    assert.equal(l.extend, 'none'); assert.equal(l.basis, 'clock');
    near(alertLevelAt({ price: 5, line: { ...l, extend: 'right' } }, 120_000)!, 102);
    assert.equal(alertLevelAt({ price: 5 }, 0), 5);
  });

  /* ───────── server drawing store ───────── */
  await t('server store: per user × symbol, sanitised, clock-clamped, users isolated', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qe-drawings-'));
    try {
      let clock = 10_000;
      const st = fileChartDrawingStore(dir, () => clock);
      assert.deepEqual(st.get('u1', 'SPY'), { drawings: [], updatedAt: 0 });
      const rec = st.put('u1', 'SPY', [{ id: 'a', tool: 'hline', pts: [{ t: 1, p: 580 }], color: '#f00', width: 2 }, { junk: true }], 9_000);
      assert.equal(rec.drawings.length, 1); assert.equal(rec.drawings[0].color, 'accent'); assert.equal(rec.updatedAt, 9_000);
      assert.equal(st.put('u1', 'QQQ', [], 10_000_000).updatedAt, clock + 60_000, 'a far-future client stamp is clamped');
      assert.deepEqual(st.get('u2', 'SPY').drawings, [], 'another user sees nothing');
      assert.deepEqual(st.list('u1').map((r) => r.symbol), ['QQQ', 'SPY']);
      clock = 20_000;
      assert.equal(st.put('u1', 'SPY', 'not an array' as unknown).drawings.length, 0);
      assert.equal(cleanSymbol('spy'), 'SPY'); assert.equal(cleanSymbol('../etc'), null); assert.equal(cleanSymbol('BRK.B'), 'BRK.B');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  /* ───────── snapshot ───────── */
  await t('snapshot: footer layout at the device pixel ratio, caption, file name, fitting', () => {
    const L = snapshotLayout(2880, 1600, 2);
    assert.equal(L.h, 1600 + SNAP_FOOTER_CSS * 2); assert.equal(L.footer.y, 1600); assert.equal(L.w, 2880);
    const meta = { symbol: 'SPY', tfLabel: '5M', at: et('2026-10-13T10:42:00') };
    const cap = snapshotCaption(meta);
    assert.match(cap, /^SPY · 5M · Tue, Oct 13, 2026,? 10:42 ET$/);
    assert.equal(snapshotFileName(meta), 'SPY-5M-20261013-1042ET.png');
    const m = (s: string) => s.length * 7;
    assert.equal(fitCaption('SPY · 5M · Tue Oct 13 · replay', 1000, m), 'SPY · 5M · Tue Oct 13 · replay');
    assert.equal(fitCaption('SPY · 5M · Tue Oct 13 · replay', 7 * 21, m), 'SPY · 5M · Tue Oct 13');
    assert.ok(fitCaption('SPY · 5M · Tue Oct 13 · replay', 50, m).endsWith('…'));
  });

  /* ───────── custom intervals ───────── */
  await t('custom intervals: built from the largest feed interval that divides them', () => {
    assert.deepEqual(parseInterval('3m'), { key: '3m', minutes: 3, label: '3M', name: '3 minutes', base: '1m', range: '5d', interval: '1m' });
    assert.equal(parseInterval('10')!.base, '5m');
    assert.equal(parseInterval('45 min')!.base, '15m');
    const h2 = parseInterval('2H')!; assert.equal(h2.key, '2h'); assert.equal(h2.base, '1h'); assert.equal(h2.range, '6mo');
    assert.equal(parseInterval('90m')!.key, '90m'); assert.equal(parseInterval('90m')!.base, '30m');
    assert.equal(parseInterval('4h')!.range, '2y');
    assert.equal(parseInterval('9h'), null, 'over 8h'); assert.equal(parseInterval('2d'), null); assert.equal(parseInterval('0m'), null); assert.equal(parseInterval('x'), null);
  });

  /* ───────── label layout (chart-orbs rough edges) ───────── */
  await t('labels never sit on candles or wall tags; captions are never clipped', () => {
    const candles = candleRects([{ x: 100, yHigh: 40, yLow: 80 }, { x: 108, yHigh: 50, yLow: 90 }], 3);
    const cand = labelCandidates(100, 60, 80, 15);
    const spot = placeLabel(cand, candles, { x: 0, y: 0, w: 400, h: 300 })!;
    assert.ok(spot, 'a spot exists');
    assert.ok(!candles.some((c) => overlaps(spot, c, 2)), 'not on a candle');
    const boxed = placeLabel(cand, [{ x: 0, y: 0, w: 400, h: 300 }], { x: 0, y: 0, w: 400, h: 300 });
    assert.equal(boxed, null, 'nowhere clean → no label (the ring alone marks the node)');
    const m = (s: string) => s.length * 6;
    assert.equal(fitText('current nodes carried forward · not a forecast', 'carried fwd · not a forecast', 400, m), 'current nodes carried forward · not a forecast');
    assert.equal(fitText('current nodes carried forward · not a forecast', 'carried fwd · not a forecast', 200, m), 'carried fwd · not a forecast');
    assert.equal(fitText('current nodes carried forward · not a forecast', 'carried fwd · not a forecast', 60, m), null);
  });

  await t('describeDrawing names what the list shows', () => {
    assert.equal(describeDrawing(D('hline', [{ t: 1, p: 580.5 }])), 'Horizontal line 580.50');
    assert.match(describeDrawing(D('long', [{ t: 0, p: 100 }, { t: 9, p: 106 }, { t: 9, p: 97 }])), /Long position 100\.00 · 2\.00R/);
    assert.equal(describeDrawing(D('text', [{ t: 1, p: 1 }], { text: 'watch the open' })), 'Note “watch the open”');
  });

  console.log(sections.join('\n'));
  console.log(`\ncharting-pro: ${n} checks passed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
