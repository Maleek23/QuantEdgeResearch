/**
 * Unit + integration tests — GEX wall-touch (server/wall-touch-core.ts, server/wall-touch.ts).
 *   npm run -s test:wall-touch
 * No network, no database: bars are synthetic, chains / GEX are injected.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wall-touch-test-'));
process.env.SHARED_STATE_DIR = path.join(TMP, 'shared');
process.env.WALL_TOUCH_LOG_DIR = path.join(TMP, 'log');
process.env.WALL_TOUCH_RVOL = 'false';
delete process.env.ALPACA_API_KEY; delete process.env.ALPACA_SECRET_KEY;
delete process.env.ROLE; delete process.env.WORKER_ENABLED;

const core = await import('../server/wall-touch-core');
const eng = await import('../server/wall-touch');
const { atr5Series } = await import('../server/zero-dte-sniper-core');
type MinuteBar = import('../server/zero-dte-sniper-core').MinuteBar;

let n = 0;
const tests: Array<[string, () => void | Promise<void>]> = [];
const t = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

// 2026-09-30 is EDT: 09:30 ET = 13:30Z.
const DAY = '2026-09-30';
const OPEN = Date.parse(`${DAY}T13:30:00Z`);
const tAt = (i: number) => OPEN + i * 60_000;

/** Bars from a close path: o = previous close, wick ±w; overrides per index. */
function barsFrom(closes: number[], w = 0.15, over: Record<number, Partial<MinuteBar>> = {}, start = closes[0]): MinuteBar[] {
  let prev = start;
  return closes.map((c, i) => {
    const o = prev; prev = c;
    const b: MinuteBar = { t: tAt(i), min: 570 + i, o, h: Math.max(o, c) + w, l: Math.min(o, c) - w, c, v: 1000 + (i % 7) * 100 };
    return { ...b, ...(over[i] ?? {}) };
  });
}
const lin = (a: number, b: number, k: number) => Array.from({ length: k }, (_, j) => a + ((b - a) * (j + 1)) / k);

/** The AMD 2026-09-30 shape: drift to the 600 put wall, low 600.10 in the 11:15 bar, bounce toward 610.58. */
function amdDay(): MinuteBar[] {
  const closes = [
    ...lin(606, 602, 90),            // 09:30–10:59
    ...lin(602, 600.6, 15),          // 11:00–11:14
    600.5,                           // 11:15 (low 600.10 via override)
    601.0, 601.6,                    // 11:16, 11:17
    ...lin(601.6, 610.58, 100),      // → ~12:58
    ...lin(610.58, 608, 390 - 208),  // rest of the day
  ];
  return barsFrom(closes, 0.15, { 105: { o: 600.6, h: 600.8, l: 600.10, c: 600.5 } });
}

// ── thresholds ──
t('thresholds: approach = max(0.15%, 0.5×ATR5), tol = max(0.05%, 0.1×ATR5), reject = 0.25×ATR5', () => {
  const a = core.thresholds(600, 1.0);
  assert.ok(near(a.approach, 0.9)); assert.ok(near(a.tol, 0.3)); assert.ok(near(a.reject, 0.25));
  const b = core.thresholds(600, 4.0);
  assert.ok(near(b.approach, 2.0)); assert.ok(near(b.tol, 0.4)); assert.ok(near(b.reject, 1.0));
  const c = core.thresholds(600, null); // fallback ATR = 0.1% of price
  assert.ok(near(c.atr, 0.6)); assert.ok(near(c.approach, 0.9));
});

// ── AMD put-wall bounce ──
t('AMD: approach → touch #1 (600.10 in the 11:15 bar) → rejection confirmed 11:17:00 ET; no break', () => {
  const bars = amdDay();
  const { events, statuses } = core.detectWalls(bars, [{ kind: 'put', price: 600 }, { kind: 'call', price: 620 }]);
  const put = events.filter((e) => e.wall === 'put');
  const kinds = put.map((e) => e.kind);
  assert.deepEqual(kinds.slice(0, 3), ['approach', 'touch', 'rejection'], kinds.join(','));
  const touch = put.find((e) => e.kind === 'touch')!;
  assert.equal(touch.touch, 1);
  assert.equal(touch.extreme, 600.10);
  assert.equal(eng.etSec(touch.t), '11:15:00');
  const rej = put.find((e) => e.kind === 'rejection')!;
  assert.equal(eng.etSec(rej.at), '11:17:00');
  assert.equal(rej.barsAfterTouch, 1);
  assert.ok(!put.some((e) => e.kind === 'break'));
  assert.ok(!events.some((e) => e.wall === 'call' && e.kind === 'touch'), 'call wall 620 never reached');
  const st = statuses.find((s) => s.wall === 'put')!;
  assert.equal(st.touches, 1);
  assert.match(core.statusLine('AMD', st), /above put wall 600 · touched 1×/);
  const approach = put[0];
  assert.ok(approach.distPct > 0 && approach.distPct <= 0.0015 + 1e-9, `approach dist ${approach.distPct}`);
  assert.match(core.statusLine('AMD', { ...st, state: 'approaching', distPct: 0.003 }), /^AMD approaching put wall 600 \(0\.3% away\)/);
});

t('event text: exact ET seconds, contract label', () => {
  const c = { occ: 'AMD261002C00605000', strike: 605, type: 'call' as const, expiry: '2026-10-02', dte: 2, label: 'weekly Fri 10-02 (2d)', bid: 1.1, ask: 1.2, mid: 1.15, vehicle: 'AMD', quoteAt: '', source: 'x' };
  const base = { wall: 'put' as const, wallPrice: 600, touch: 1, extreme: 600.1, price: 601, barEt: '11:15:00', atEt: '11:17:00', distPct: 0.003 };
  assert.equal(eng.eventText('AMD', { ...base, kind: 'touch' }, null), 'AMD touched put wall 600 at 600.10 in the 11:15:00 ET bar (touch #1)');
  assert.match(eng.eventText('AMD', { ...base, kind: 'rejection' }, c), /rejection confirmed 11:17:00 ET.*weekly Fri 10-02 \(2d\) 605C @ \$1\.20/);
  assert.match(eng.eventText('AMD', { ...base, kind: 'approach' }, null), /AMD approaching put wall 600 \(0\.3% away\)/);
});

// ── break, reclaim, re-arm ──
t('break on the touch bar; reclaim + re-arm before touch #2', () => {
  const closes = [...lin(103, 101, 20), 99.7, 99.5, 99.6, ...lin(99.6, 101.5, 15), ...lin(101.5, 100.08, 10), 100.6, 101.2, ...lin(101.5, 102, 10)];
  const bars = barsFrom(closes, 0.05);
  const { events, statuses } = core.detectWalls(bars, [{ kind: 'put', price: 100 }]);
  const seq = events.map((e) => `${e.kind}#${e.touch}`);
  const firstBreak = events.find((e) => e.kind === 'break')!;
  assert.equal(firstBreak.touch, 1);
  assert.equal(firstBreak.barsAfterTouch, 0, 'the touch bar itself closed through');
  const t2 = events.find((e) => e.kind === 'touch' && e.touch === 2);
  assert.ok(t2, `second touch after reclaim + re-arm: ${seq.join(' ')}`);
  assert.ok(t2!.idx > firstBreak.idx);
  assert.equal(statuses[0].touches, 2);
});

t('hugging the wall is ONE touch; leaving the approach zone re-arms (SPY rejected ~4×)', () => {
  // 4 dips to 500.02 with rallies to 502 between; plus a stretch hugging 500.1–500.3 after touch 4 (no extra touches).
  const leg = [...lin(502, 500.5, 8), 500.4, 500.9, 501.4, ...lin(501.4, 502, 6)];
  const closes = [...lin(503, 502, 10), ...leg, ...leg, ...leg, ...leg];
  const over: Record<number, Partial<MinuteBar>> = {};
  const dips: number[] = [];
  for (let k = 0; k < 4; k++) { const i = 10 + k * leg.length + 8; dips.push(i); over[i] = { l: 500.02 }; }
  const bars = barsFrom(closes, 0.05, over);
  const { events, statuses } = core.detectWalls(bars, [{ kind: 'put', price: 500 }]);
  const touches = events.filter((e) => e.kind === 'touch');
  const rejs = events.filter((e) => e.kind === 'rejection');
  assert.equal(touches.length, 4, events.map((e) => `${e.kind}@${e.idx}`).join(' '));
  assert.deepEqual(touches.map((e) => e.touch), [1, 2, 3, 4]);
  assert.equal(rejs.length, 4);
  assert.equal(statuses[0].touches, 4);
  // hugging: closes 500.2 for 12 bars with lows 500.1 after a single touch → still one touch
  const hug = barsFrom([...lin(502, 500.6, 8), ...Array(12).fill(500.05)], 0.03);
  const h = core.detectWalls(hug, [{ kind: 'put', price: 500 }]);
  assert.equal(h.events.filter((e) => e.kind === 'touch').length, 1);
  assert.ok(h.events.some((e) => e.kind === 'stall'), 'no rejection, no break within 5 bars → stall');
});

t('call wall is the exact mirror of the put wall', () => {
  const bars = amdDay();
  const mirrorBars = bars.map((b) => ({ ...b, o: 1200 - b.o, h: 1200 - b.l, l: 1200 - b.h, c: 1200 - b.c }));
  const p = core.detectWalls(bars, [{ kind: 'put', price: 600 }]).events;
  const c = core.detectWalls(mirrorBars, [{ kind: 'call', price: 600 }]).events;
  assert.deepEqual(c.map((e) => `${e.kind}|${e.idx}|${e.touch}`), p.map((e) => `${e.kind}|${e.idx}|${e.touch}`));
  const ct = c.find((e) => e.kind === 'touch')!;
  assert.ok(near(ct.extreme, 1200 - 600.10, 1e-9), 'call touch extreme is the bar HIGH');
  assert.equal(core.tradeSideFor('call', 'rejection'), 'short');
  assert.equal(core.tradeSideFor('put', 'break'), 'short');
  assert.equal(core.optionTypeFor(core.tradeSideFor('put', 'rejection')), 'call');
});

t('causal: every event of a truncated day appears identically in the full day', () => {
  const bars = amdDay();
  const walls = [{ kind: 'put' as const, price: 600 }, { kind: 'call' as const, price: 608 }];
  const full = core.detectWalls(bars, walls).events.map((e) => JSON.stringify(e));
  for (const cut of [60, 104, 105, 106, 107, 150, 220, 300]) {
    const part = core.detectWalls(bars.slice(0, cut), walls).events.map((e) => JSON.stringify(e));
    for (const e of part) assert.ok(full.includes(e), `cut ${cut}: ${e}`);
  }
});

t('sinceMs suppresses events before the wall was known but still counts the session touches', () => {
  const closes = [...lin(503, 502, 10), ...lin(502, 500.5, 8), 500.4, 500.9, 501.4, ...lin(501.4, 502, 6), ...lin(502, 500.5, 8), 500.4, 500.9, 501.4, ...lin(501.4, 502, 6)];
  const over = { 18: { l: 500.02 }, 35: { l: 500.02 } };
  const bars = barsFrom(closes, 0.05, over);
  const all = core.detectWalls(bars, [{ kind: 'put', price: 500 }]).events.filter((e) => e.kind === 'touch');
  assert.equal(all.length, 2);
  const late = core.detectWalls(bars, [{ kind: 'put', price: 500, sinceMs: tAt(25) }]).events;
  const touches = late.filter((e) => e.kind === 'touch');
  assert.equal(touches.length, 1);
  assert.equal(touches[0].touch, 2, 'touch number is the session count');
  assert.ok(!late.some((e) => e.t < tAt(25)));
  // untilMs: a superseded wall emits no new touch, but its pending touch still resolves
  const sup = core.detectWalls(bars, [{ kind: 'put', price: 500, untilMs: tAt(19) }]).events;
  assert.deepEqual(sup.map((e) => e.kind), ['approach', 'touch', 'rejection']);
});

// ── outcomes ──
t('underlying outcome: +15/+30/+60 marks, trade side, from-wall, MFE/MAE, completeness', () => {
  const bars = amdDay();
  const rej = core.detectWalls(bars, [{ kind: 'put', price: 600 }]).events.find((e) => e.kind === 'rejection')!;
  const o = core.underlyingOutcome(bars, rej.at, rej.price, 600, 'put', 'long');
  assert.equal(o.entry, 601.0);
  assert.equal(eng.etSec(o.h15!.at), '11:32:00');
  assert.equal(eng.etSec(o.h60!.at), '12:17:00');
  assert.ok(o.h30!.tradePct > 0 && o.h30!.fromWallPct > 0);
  assert.ok(o.mfePct! > 1.5, `mfe ${o.mfePct}`); // 601 → 610.73 high ≈ +1.6%
  assert.ok(o.maePct! <= 0);
  assert.equal(o.complete, true);
  assert.ok(o.close);
  const short = core.underlyingOutcome(bars, rej.at, rej.price, 600, 'put', 'short');
  assert.ok(near(short.h30!.tradePct, -o.h30!.tradePct, 1e-9));
  const partial = core.underlyingOutcome(bars.slice(0, 130), rej.at, rej.price, 600, 'put', 'long');
  assert.equal(partial.complete, false); assert.equal(partial.close, null); assert.equal(partial.h60, null);
});

t('option path: multiples at horizons, max multiple, minutes to 2×', () => {
  const entryAt = tAt(107);
  const ob = Array.from({ length: 60 }, (_, k) => ({ t: entryAt + k * 60_000, o: 0.25, h: 0.25 + k * 0.02, l: 0.24, c: 0.25 + k * 0.015, v: 10 }));
  const o = core.optionPathOutcome(0.25, 'ask at confirm', ob, entryAt, entryAt + 60 * 60_000);
  assert.equal(o.mult15, +((0.25 + 14 * 0.015) / 0.25).toFixed(3));
  assert.equal(o.maxMult, +((0.25 + 59 * 0.02) / 0.25).toFixed(3));
  assert.equal(o.minsTo2x, 14); // h ≥ 0.50 first at k = 13 (0.51) → bar closes 14 min after entry
  assert.ok(o.multClose! > 3);
});

t('forward-log summary: rejection rate, by touch number, by wall, option multiple', () => {
  const mk = (i: number, wall: 'put' | 'call', touch: number, resolution: 'rejection' | 'break' | 'stall', trade30: number, maxMult: number | null): import('../server/wall-touch-core').WallRecord => ({
    id: `x${i}`, dateKey: `2026-10-0${1 + (i % 5)}`, symbol: 'AMD', wall, wallPrice: 600, wallBasis: 'next-7-day book (expiries ≤7d, 3)', touch, touchAt: '', resolution, rvol: i % 2 ? 2 : 1,
    underlying: { entry: 100, entryAt: 0, side: 'long', h15: null, h30: { at: 0, price: 0, tradePct: trade30, fromWallPct: 0 }, h60: null, close: null, mfePct: Math.abs(trade30) + 0.2, maePct: -0.1, complete: true },
    option: maxMult == null ? null : { entry: 1, entryBasis: '', h15: null, h30: null, h60: null, close: null, mult15: null, mult30: null, mult60: null, multClose: maxMult / 2, maxMult, minsTo2x: null, bars: 10, occ: 'X', label: '0DTE' },
  });
  const rs = [mk(1, 'put', 1, 'rejection', 0.5, 3), mk(2, 'put', 2, 'rejection', 0.3, 1.5), mk(3, 'put', 3, 'break', -0.2, 0.5), mk(4, 'call', 1, 'stall', 0, null), mk(5, 'call', 5, 'rejection', 0.1, 2)];
  const s = core.summarizeWallLog(rs);
  assert.equal(s.all.n, 5); assert.equal(s.all.rejections, 3); assert.equal(s.all.rejectionRate, 0.6);
  assert.equal(s.byTouch['1'].n, 2); assert.equal(s.byTouch['4+'].n, 1);
  assert.equal(s.byWall.put.breaks, 1);
  assert.equal(s.all.options, 4); assert.equal(s.all.optHit2xPct, 50);
  assert.ok(near(s.all.avgTrade30Pct!, (0.5 + 0.3 - 0.2 + 0.1) / 4, 1e-3));
  assert.equal(s.label, 'measuring');
});

// ── engine helpers ──
t('walls: next-7-day book preferred; all-expiry fallback labelled', () => {
  const w = eng.wallsFromGex({ spotPrice: 605, putWall: 580, callWall: 650, flipPoint: 590, byDte: { next7: { putWall: 600, callWall: 620, gammaFlipPrice: 603, expirationsCount: 3 } } } as any);
  assert.equal(w.putWall, 600); assert.equal(w.callWall, 620); assert.equal(w.basis, 'next7'); assert.match(w.basisLabel, /next-7-day/);
  const f = eng.wallsFromGex({ spotPrice: 605, putWall: 580, callWall: 650, flipPoint: 590 } as any);
  assert.equal(f.basis, 'all'); assert.equal(f.putWall, 580); assert.match(f.basisLabel, /fallback/);
});

t('mergeLevels: unchanged keeps its start; replaced pre-open goes, mid-session gets untilMs', () => {
  const a = eng.mergeLevels(undefined, { putWall: 600, callWall: 620 }, undefined);
  assert.equal(a.length, 2);
  const same = eng.mergeLevels(a, { putWall: 600, callWall: 620 }, tAt(180));
  assert.deepEqual(same, a);
  const pre = eng.mergeLevels(a, { putWall: 595, callWall: 620 }, undefined);
  assert.deepEqual(pre.map((l) => `${l.kind}${l.price}`).sort(), ['call620', 'put595']);
  const mid = eng.mergeLevels(a, { putWall: 595, callWall: 620 }, tAt(180));
  assert.equal(mid.find((l) => l.price === 600)!.untilMs, tAt(180));
  assert.equal(mid.find((l) => l.price === 595)!.sinceMs, tAt(180));
});

t('contract: nearest OTM on the nearest expiry ≤ 7 days (0DTE when listed)', () => {
  const rows = [
    { occ: 'A1', strike: 605, type: 'call' as const, expiration: '2026-10-02', bid: 1, ask: 1.1, volume: 5 },
    { occ: 'A2', strike: 610, type: 'call' as const, expiration: '2026-10-02', bid: 0.5, ask: 0.6, volume: 5 },
    { occ: 'A3', strike: 600, type: 'call' as const, expiration: '2026-10-02', bid: 3, ask: 3.2, volume: 5 },
    { occ: 'A4', strike: 595, type: 'put' as const, expiration: '2026-10-02', bid: 1, ask: 1.2, volume: 5 },
    { occ: 'B1', strike: 605, type: 'call' as const, expiration: '2026-09-30', bid: 0.3, ask: 0.35, volume: 5 },
  ];
  const wk = eng.pickWallContract(rows.filter((r) => r.occ !== 'B1'), 601, 'call', '2026-09-30')!;
  assert.equal(wk.c.occ, 'A1'); assert.equal(wk.dte, 2);
  const zd = eng.pickWallContract(rows, 601, 'call', '2026-09-30')!;
  assert.equal(zd.c.occ, 'B1'); assert.equal(zd.dte, 0);
  assert.equal(eng.pickWallContract(rows, 601, 'put', '2026-09-30')!.c.occ, 'A4');
});

t('universe: indexes first, board top-N, watch, de-duplicated, capped', () => {
  const u = eng.buildWallUniverse({ board: ['AMD', 'SPY', 'NVDA', 'TSLA', 'BAD-SYM'], watch: ['MSTR', 'AMD'], cap: 7, boardTop: 3 });
  assert.deepEqual(u, ['SPX', 'SPY', 'QQQ', 'IWM', 'AMD', 'NVDA', 'MSTR']);
});

t('RVOL ≈ time-of-day: 1-min volume ÷ (5-min slot mean ÷ 5)', () => {
  const slots = new Float64Array(78).fill(NaN); slots[21] = 50_000; // 11:15–11:19 slot
  assert.equal(eng.rvolFor(slots, { min: 11 * 60 + 15, v: 30_000 }), 3);
  assert.equal(eng.rvolFor(slots, { min: 9 * 60 + 30, v: 30_000 }), null);
});

// ── engine integration (injected bars / GEX / gate; nothing written to the real cache) ──
t('wall map: sequential through the gate, per-symbol RSS recorded, SPX/SPY ratio, failures kept', async () => {
  eng.__resetWallTouchForTests();
  const gated: string[] = [];
  const m = await eng.computeWallMap('premarket', Date.parse(`${DAY}T13:00:00Z`), {
    universe: ['SPX', 'SPY', 'AMD', 'ZZZ'], persist: false, pauseMs: 0,
    gate: async (name, fn) => { gated.push(name); return fn(); },
    computeFn: async (s) => (s === 'ZZZ' ? null : { spotPrice: s === 'SPX' ? 6600 : s === 'SPY' ? 660 : 603, flipPoint: null, putWall: null, callWall: null, byDte: { next7: { putWall: s === 'AMD' ? 600 : s === 'SPX' ? 6500 : 650, callWall: s === 'AMD' ? 620 : s === 'SPX' ? 6700 : 670, gammaFlipPrice: null, expirationsCount: 3 } } } as any),
  });
  assert.deepEqual(gated, ['wall-map:SPX', 'wall-map:SPY', 'wall-map:AMD', 'wall-map:ZZZ']);
  assert.equal(m.spxPerSpy, 10);
  assert.equal(m.entries.AMD.putWall, 600);
  assert.equal(m.entries.ZZZ.ok, false);
  assert.ok(m.entries.AMD.rssAfterMb > 0);
  assert.equal(m.passes[0].computed, 3);
  assert.equal(m.levels.AMD.length, 2);
  assert.equal(m.levels.AMD[0].sinceMs, undefined, 'pre-open walls apply to the whole session');
});

t('cycle: AMD rows + events, alert debounce (one per wall per state), SPX on SPY × ratio, nothing written', async () => {
  const amd = amdDay();
  const spy = amdDay().map((b) => ({ ...b, o: b.o + 50, h: b.h + 50, l: b.l + 50, c: b.c + 50 })); // SPY 650 wall ↔ SPX 6500
  const peek = (s: string) => (s === 'AMD' ? { dateKey: DAY, bars: amd } : s === 'SPY' ? { dateKey: DAY, bars: spy } : null);
  const now = tAt(108) + 30_000; // 11:18:30 ET — the 11:17 bar has closed
  const c1 = await eng.runWallTouch(now, { force: true, peek, log: false, gate: async () => null });
  assert.equal(c1.skipped, null);
  const st = eng.getWallTouchState(now);
  const amdPut = st.rows.find((r) => r.symbol === 'AMD' && r.wall === 'put')!;
  assert.equal(amdPut.touches, 1);
  assert.equal(amdPut.state, 'rejected');
  const ev = st.events.filter((e) => e.symbol === 'AMD' && e.wall === 'put');
  assert.deepEqual(ev.map((e) => e.kind), ['approach', 'touch', 'rejection']);
  const rej = ev.find((e) => e.kind === 'rejection')!;
  assert.equal(rej.atEt, '11:17:00');
  assert.equal(rej.late, false);
  assert.equal(rej.contract, null);
  assert.ok(rej.contractNote, 'no chain in tests → a stated reason');
  // touch (known 11:16:00) and rejection (11:17:00) are inside the 3-min freshness window; the earlier approach was not alerted
  assert.deepEqual(st.alerts.filter((a) => a.symbol === 'AMD').map((a) => a.kind), ['touch', 'rejection']);
  const spx = st.rows.find((r) => r.symbol === 'SPX' && r.wall === 'put');
  assert.ok(spx && spx.wallPrice === 6500 && spx.touches === 1, 'SPX wall 6500 read on SPY bars × 10');
  // second cycle a minute later: no duplicate events or alerts
  const before = st.alerts.length;
  await eng.runWallTouch(now + 60_000, { force: true, peek, log: false, gate: async () => null });
  const st2 = eng.getWallTouchState(now + 60_000);
  assert.equal(st2.alerts.length, before);
  assert.equal(st2.events.filter((e) => e.symbol === 'AMD' && e.kind === 'rejection').length, 1);
  const badge = eng.getWallTouchForSymbol('AMD', now + 60_000);
  assert.equal(badge.walls?.putWall, 600);
  assert.match(badge.rows.find((r) => r.wall === 'put')!.line, /put wall 600 · touched 1×/);
  assert.ok(!fs.existsSync(path.join(TMP, 'log')), 'log:false wrote nothing');
});

t('outcomes: pending touches joined to resolutions; one outcome record with underlying + option path', async () => {
  const bars = amdDay();
  const touchRow = { barAt: new Date(tAt(105)).toISOString(), at: new Date(tAt(106)).toISOString(), price: 600.5, rvol: 3.4 };
  const rejRow = { at: new Date(tAt(107)).toISOString(), price: 601.0, contract: { occ: 'AMD260930C00605000', ask: 0.5, label: '0DTE', strike: 605, type: 'call' } };
  const base = { dateKey: DAY, symbol: 'AMD', wall: 'put', wallPrice: 600, wallBasis: 'next-7-day book', touch: 1, touchId: `${DAY}|AMD|put|600|1` };
  const lines = [
    { type: 'touch', ...base, id: `${base.touchId}|touch`, row: touchRow },
    { type: 'rejection', ...base, id: `${base.touchId}|rejection`, row: rejRow },
    { type: 'touch', ...base, touch: 2, touchId: `${DAY}|AMD|put|600|2`, id: 'done', row: touchRow },
    { type: 'outcome', id: `${DAY}|AMD|put|600|2` },
  ];
  assert.equal(eng.pendingTouches(lines, DAY, false).size, 0, 'today before the close: wait');
  const p = eng.pendingTouches(lines, DAY, true);
  assert.equal(p.size, 1);
  const entryAt = tAt(107);
  const opt = Array.from({ length: 200 }, (_, k) => ({ t: entryAt + k * 60_000, o: 0.5, h: 0.5 + k * 0.01, l: 0.5, c: 0.5 + k * 0.008, v: 5 }));
  const r = await eng.runWallTouchOutcomes(Date.parse(`${DAY}T20:30:00Z`), {
    lines, write: false,
    loadBars: async (_d, syms) => new Map(syms.map((s) => [s, bars])),
    loadOpt: async (_d, occs) => new Map(occs.map((o) => [o, opt])),
  });
  assert.equal(r.written, 1);
  const rec = eng.outcomeRecord([...p.values()][0], bars, opt);
  assert.equal(rec.resolution, 'rejection');
  assert.equal(rec.underlying!.side, 'long');
  assert.equal(rec.underlying!.entry, 601.0);
  assert.equal(rec.option!.entry, 0.5);
  assert.equal(rec.option!.entryBasis, 'ask at confirm');
  assert.ok(rec.option!.maxMult! > 2);
  assert.equal(rec.rvol, 3.4);
});

for (const [name, fn] of tests) {
  try { await fn(); n++; } catch (e) { console.error(`✗ ${name}`); throw e; }
}
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`✓ wall-touch: ${n} tests passed`);
void atr5Series;
