/**
 * 0DTE desk checks — expected move, single-expiry GEX bucket, session-phase
 * gating (incl. the power-hour pin on same-day walls), expiry labelling,
 * short-swing caps, and the record summary.
 *
 *   npx tsx scripts/test-zero-dte-desk.ts
 *
 * FIXTURES ONLY. Every chain, bar and idea below is synthetic, written for
 * these tests. Nothing here is market data.
 */
import assert from 'node:assert/strict';
import {
  expectedMoveFor, expiryBucketLevels, sessionPhase, pickDeskExpiry, planShortSwing, summarizeDeskRecord, etDateKey,
  deskEngineState, armedReads, parseWatch, todayFraction, type DeskChainRow,
} from '../server/zero-dte-desk-core';
import { evaluateZeroDte, policyOpen } from '../server/zero-dte-policies';
import { structureFromBars, type Bar } from '../server/zero-dte-structure';

let passed = 0;
const ok = (name: string, fn: () => void) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
/** 2026-09-29 (a Tuesday) at HH:MM ET (EDT = UTC−4). */
const et = (h: number, m: number, day = 29) => Date.UTC(2026, 8, day, h + 4, m);

// ─── 1 · session phases + policy windows ────────────────────────────────
ok('open drive 09:35: no policy open, entries closed', () => {
  const p = sessionPhase(et(9, 35));
  assert.equal(p.id, 'open_drive'); assert.equal(p.entriesOpen, false);
  assert.deepEqual(p.policies, { A: false, B: false });
});
ok('09:50: A open, B still waits for 10:00', () => {
  const p = sessionPhase(et(9, 50));
  assert.equal(p.id, 'open_drive'); assert.equal(p.entriesOpen, true); assert.deepEqual(p.policies, { A: true, B: false });
});
ok('midday 10:30: A and B open; 14:45: B off (pre-registered gap)', () => {
  assert.deepEqual(sessionPhase(et(10, 30)).policies, { A: true, B: true });
  const p = sessionPhase(et(14, 45));
  assert.equal(p.id, 'midday'); assert.deepEqual(p.policies, { A: true, B: false });
});
ok('power hour 15:10: A + B pin open; 15:42 B closed; 15:50 no new entries', () => {
  const p = sessionPhase(et(15, 10));
  assert.equal(p.id, 'power_hour'); assert.deepEqual(p.policies, { A: true, B: true }); assert.equal(p.minutesToClose, 50);
  assert.equal(policyOpen('B', 942), false);
  assert.equal(sessionPhase(et(15, 50)).entriesOpen, false);
});
ok('after the close and on a Saturday: closed', () => {
  assert.equal(sessionPhase(et(16, 5)).id, 'closed');
  const sat = sessionPhase(Date.UTC(2026, 9, 3, 16, 0)); // Sat 2026-10-03 12:00 ET
  assert.equal(sat.id, 'closed'); assert.equal(sat.entriesOpen, false);
});
ok('todayFraction: 1 pre-open, 0.5 at 12:45, 0 after the close', () => {
  assert.equal(todayFraction(500), 1); close(todayFraction(765), 0.5); assert.equal(todayFraction(961), 0);
});

// ─── 2 · expiry labelling ───────────────────────────────────────────────
ok('SPXW same-day expiry → 0DTE', () => {
  const e = pickDeskExpiry(['2026-09-30', '2026-09-29', '2026-10-02'], '2026-09-29');
  assert.equal(e.expiry, '2026-09-29'); assert.equal(e.sameDay, true); assert.equal(e.label, '0DTE'); assert.equal(e.sessionsAfterToday, 0);
});
ok('Friday-only weeklies on a Tuesday → "nearest: Fri (3d)", 3 sessions', () => {
  const e = pickDeskExpiry(['2026-10-09', '2026-10-02', '2026-10-16'], '2026-09-29');
  assert.equal(e.expiry, '2026-10-02'); assert.equal(e.sameDay, false); assert.equal(e.label, 'nearest: Fri (3d)'); assert.equal(e.sessionsAfterToday, 3);
});
ok('after the close today\'s expiry no longer counts; Friday → Monday spans 1 session', () => {
  assert.equal(pickDeskExpiry(['2026-09-29', '2026-09-30'], '2026-09-29', true).expiry, '2026-09-30');
  assert.equal(pickDeskExpiry(['2026-10-05'], '2026-10-02').sessionsAfterToday, 1);
});
ok('watch list: default and env override', () => {
  assert.deepEqual(parseWatch(undefined), ['SPX', 'TSLA', 'MSTR', 'KWEB']);
  assert.deepEqual(parseWatch('spx, spcx tsla,tsla'), ['SPX', 'SPCX', 'TSLA']);
});

// ─── 3 · expected move ──────────────────────────────────────────────────
const E = '2026-10-02';
const q = (type: 'call' | 'put', strike: number, bid: number, ask: number, iv = 0.3, oi = 100): DeskChainRow =>
  ({ option_type: type, strike, expiration_date: E, bid, ask, open_interest: oi, volume: 0, greeks: { mid_iv: iv } });
ok('ATM straddle mid is the move to expiry; 0DTE → all of it is today', () => {
  const rows = [q('call', 100, 2.0, 2.2), q('put', 100, 1.9, 2.1), q('call', 105, 0.4, 0.5), q('put', 95, 0.3, 0.4)];
  const em = expectedMoveFor(rows, 100.4, E, 0.5, 0)!;
  assert.equal(em.source, 'atm_straddle'); assert.equal(em.strike, 100);
  close(em.straddle!, 4.1); close(em.toExpiry, 4.1); close(em.today, 4.1); close(em.toExpiryPct, 4.1 / 100.4 * 100);
});
ok('nearest expiry 3 sessions out: today\'s share = √(1/4) of the straddle', () => {
  const rows = [q('call', 100, 2.0, 2.2), q('put', 100, 1.9, 2.1)];
  const em = expectedMoveFor(rows, 100, E, 1, 3)!;
  close(em.today, 4.1 * 0.5); assert.match(em.basis, /today's share/);
});
ok('no two-sided quote → ATM IV × √(T/252)', () => {
  const rows = [q('call', 100, 0, 0, 0.32), q('put', 100, 0, 0, 0.32)];
  const em = expectedMoveFor(rows, 100, E, 1, 3)!;
  assert.equal(em.source, 'atm_iv'); close(em.toExpiry, 100 * 0.32 * Math.sqrt(4 / 252));
});
ok('no rows for the expiry → null (never a guessed move)', () => {
  assert.equal(expectedMoveFor([q('call', 100, 1, 1.1)], 100, '2026-12-18', 1, 3), null);
});

// ─── 4 · single-expiry (0DTE) GEX bucket ────────────────────────────────
ok('bucket reads ONLY the chosen expiry: its own walls, not the neighbour\'s', () => {
  const near = etDateKey(Date.now() + 2 * 864e5);
  const far = etDateKey(Date.now() + 9 * 864e5);
  const r = (exp: string, type: 'call' | 'put', strike: number, oi: number): DeskChainRow =>
    ({ option_type: type, strike, expiration_date: exp, bid: 1, ask: 1.1, open_interest: oi, volume: 0, greeks: { mid_iv: 0.3 } });
  const rows: DeskChainRow[] = [
    r(near, 'call', 102, 900), r(near, 'call', 104, 300), r(near, 'put', 97, 800), r(near, 'put', 95, 200), r(near, 'call', 100, 100), r(near, 'put', 100, 100),
    r(far, 'call', 103, 50_000), r(far, 'put', 98, 50_000), // a much bigger book on the other expiry
  ];
  const b = expiryBucketLevels('TEST', rows, 100, near)!;
  assert.equal(b.expiry, near);
  assert.equal(b.callWall, 102); assert.equal(b.putWall, 97);
  assert.equal(b.contracts, 6);
  assert.ok(['positive', 'negative', 'neutral'].includes(b.regime));
  const f = expiryBucketLevels('TEST', rows, 100, far);
  assert.equal(f, null, 'fewer than 4 contracts → null, not a level');
});

// ─── 5 · power-hour pin on the same-day wall (the gap that produced nothing) ──
function pinBars(): Bar[] {
  // Prior day (for PDH/PDL) + today 13:30–15:00 ET 5-min bars drifting up into 662, tag, reject.
  const out: Bar[] = [];
  for (let i = 0; i < 12; i++) out.push({ t: Date.UTC(2026, 8, 28, 13, 30) + i * 3e5, o: 655, h: 656, l: 654, c: 655, v: 1000 });
  const path = [657, 657.5, 658, 658.4, 658.9, 659.3, 659.8, 660.2, 660.6, 661.0, 661.4, 661.6, 661.3];
  path.forEach((c, i) => {
    const hi = i === 11 ? 662.1 : c + 0.3;
    out.push({ t: et(14, 0) + i * 3e5, o: c - 0.2, h: hi, l: c - 0.4, c, v: i < 3 ? 50_000 : 5000 });
  });
  return out;
}
ok('B power-hour pin fires on the 0DTE call wall and NOT on the far all-expiry wall alone', () => {
  const now = et(15, 10);
  const st = structureFromBars('SPY', pinBars(), now);
  assert.ok(st.vwap != null && st.vwap < 661.3, `vwap ${st.vwap}`);
  const gex = { spot: 661.3, zeroGamma: 640, callWall: 680, putWall: 640, sign: 'positive' as const, fetchedAt: new Date(now - 60_000).toISOString() };
  const without = evaluateZeroDte('SPY', gex, st, now, 910, null);
  assert.equal(without.setup, null);
  assert.ok(without.wait.some((w) => w.startsWith('B: no wall tag')), without.wait.join(' / '));
  const withZ = evaluateZeroDte('SPY', gex, st, now, 910, null, { zeroDte: { expiry: '2026-09-29', callWall: 662, putWall: 655, maxGamma: null, zeroGamma: null } });
  assert.ok(withZ.setup, withZ.wait.join(' / '));
  assert.equal(withZ.setup!.policy, 'B_pos_gamma_wall_fade');
  assert.equal(withZ.setup!.powerHour, true);
  assert.equal(withZ.setup!.direction, 'short');
  assert.equal(withZ.setup!.trigger.name, '0DTE call wall');
  assert.equal(withZ.setup!.targetLevel.name, 'VWAP');
  assert.ok(withZ.setup!.rr >= 1.5);
  assert.ok(withZ.setup!.evidence.some((e) => e.includes('not in the pre-registered spec')));
});
ok('the same tape at 15:42 (after the B pin window) does not fire; at 15:50 nothing opens', () => {
  const st = structureFromBars('SPY', pinBars(), et(15, 10));
  const gex = { spot: 661.3, zeroGamma: 640, callWall: 680, putWall: 640, sign: 'positive' as const, fetchedAt: new Date(et(15, 9)).toISOString() };
  const z = { zeroDte: { expiry: '2026-09-29', callWall: 662, putWall: 655, maxGamma: null, zeroGamma: null } };
  assert.equal(evaluateZeroDte('SPY', gex, st, et(15, 10), 942, null, z).setup, null);
  assert.deepEqual(evaluateZeroDte('SPY', gex, st, et(15, 10), 950, null, z).wait, ['outside 09:45–15:45 ET entry window']);
});
ok('armed reads: +γ within 0.2% of a wall arms B; neutral arms nothing', () => {
  const p = sessionPhase(et(11, 0));
  assert.equal(armedReads('positive', 661.3, [{ name: '0DTE call wall', price: 662 }], p).length, 1);
  assert.equal(armedReads('neutral', 661.3, [{ name: '0DTE call wall', price: 662 }], p).length, 0);
  assert.equal(armedReads('negative', 661.3, [{ name: 'OR30 high', price: 662 }], p)[0].startsWith('A long arms'), true);
});
ok('engine state: open idea → in trade; setup withheld → triggered with the reason', () => {
  const p = sessionPhase(et(11, 0));
  const s = deskEngineState({ phase: p, setup: null, wait: [], todays0dte: [{ id: '1', direction: 'long', outcomeStatus: 'open', timestamp: new Date(et(10, 40)).toISOString(), entry: 1, stop: 0.9, target: 1.2, kind: '0dte' }], armed: [] });
  assert.equal(s.state, 'in_trade');
  const t = deskEngineState({ phase: p, setup: { policy: 'A_neg_gamma_continuation', powerHour: false, direction: 'short', entry: 10, stop: 10.1, target: 9.8, rr: 2, trigger: { name: 'x', price: 10 }, targetLevel: { name: 'y', price: 9.8 }, evidence: ['e'] }, wait: [], withheld: 'no account-fit contract', todays0dte: [], armed: [] });
  assert.equal(t.state, 'triggered'); assert.match(t.why[0], /Not published: no account-fit/);
  assert.equal(deskEngineState({ phase: p, setup: null, wait: ['neutral gamma — no dealer footprint (policy C)'], todays0dte: [], armed: [] }).state, 'no_setup');
});

// ─── 6 · short swings: 1σ cap, stops, DTE window, time stop ─────────────
const NOW = et(11, 0);
ok('+γ drift to the max-γ pin: T1 capped at 1σ(3d), structural stop kept, 30–60 DTE, time stop at half horizon', () => {
  const p = planShortSwing({ symbol: 'T', spot: 100, sigmaDaily: 0.02, regime: 'positive', zeroGamma: 97, callWall: 108, putWall: 98.5, maxGamma: 106, flowLean: 'long', nowMs: NOW });
  const sig = 100 * 0.02 * Math.sqrt(3);
  assert.equal(p.verdict, 'plan'); assert.equal(p.direction, 'long');
  close(p.sigmaH!, sig); assert.equal(p.capped, true); close(p.target!, 100 + sig); assert.equal(p.structuralTarget, 106);
  close(p.stop!, 100 - 1.7);
  assert.ok(p.target! - 100 <= sig + 1e-9, 'target never beyond 1σ');
  assert.deepEqual([p.dteWindow.min, p.dteWindow.max], [30, 60]);
  assert.ok(p.timeStopIso && p.exitByIso && Date.parse(p.timeStopIso) < Date.parse(p.exitByIso));
  assert.equal(p.holdDays, 3); assert.equal(p.maxHoldDays, 4);
});
ok('stop bounded: a structural level beyond 0.75σ falls back to 0.5σ', () => {
  const p = planShortSwing({ symbol: 'T', spot: 100, sigmaDaily: 0.02, regime: 'positive', zeroGamma: null, callWall: null, putWall: 90, maxGamma: 106, flowLean: null, nowMs: NOW });
  close(100 - p.stop!, 0.5 * p.sigmaH!);
});
ok('pinned (+γ, magnet < 0.25σ) → no plan', () => {
  const p = planShortSwing({ symbol: 'T', spot: 100, sigmaDaily: 0.02, regime: 'positive', zeroGamma: 97, callWall: 108, putWall: 98.5, maxGamma: 100.5, flowLean: null, nowMs: NOW });
  assert.equal(p.verdict, 'no_plan'); assert.match(p.wait[0], /pinned/);
});
ok('R:R after the cap below 1.3 → no plan', () => {
  const p = planShortSwing({ symbol: 'T', spot: 100, sigmaDaily: 0.02, regime: 'positive', zeroGamma: null, callWall: null, putWall: null, maxGamma: 101.2, flowLean: null, nowMs: NOW });
  assert.equal(p.verdict, 'no_plan'); assert.match(p.wait[0], /R:R/);
});
ok('−γ needs flow AND spot\'s side of zero-γ to agree; neutral gamma never plans', () => {
  const agree = planShortSwing({ symbol: 'T', spot: 100, sigmaDaily: 0.03, regime: 'negative', zeroGamma: 98.8, callWall: 110, putWall: 95, maxGamma: 100, flowLean: 'long', nowMs: NOW });
  assert.equal(agree.verdict, 'plan'); assert.equal(agree.direction, 'long'); assert.equal(agree.capped, true);
  const disagree = planShortSwing({ symbol: 'T', spot: 100, sigmaDaily: 0.03, regime: 'negative', zeroGamma: 98.8, callWall: 110, putWall: 95, maxGamma: 100, flowLean: 'short', nowMs: NOW });
  assert.equal(disagree.verdict, 'no_plan');
  assert.equal(planShortSwing({ symbol: 'T', spot: 100, sigmaDaily: 0.03, regime: 'neutral', zeroGamma: 98.8, callWall: 110, putWall: 95, maxGamma: 100, flowLean: 'long', nowMs: NOW }).verdict, 'no_plan');
  assert.equal(planShortSwing({ symbol: 'T', spot: 100, sigmaDaily: null, regime: 'positive', zeroGamma: 98.8, callWall: 110, putWall: 95, maxGamma: 106, flowLean: 'long', nowMs: NOW }).verdict, 'no_plan');
});

// ─── 7 · record ─────────────────────────────────────────────────────────
ok('record: only post-baseline rows, decided = target + stop, R from exit, LOW N under 20', () => {
  const rec = summarizeDeskRecord([
    { timestamp: '2026-08-20T15:00:00Z', direction: 'long', entryPrice: 100, stopLoss: 99, exitPrice: 102, outcomeStatus: 'hit_target', kind: '0dte' }, // pre-baseline
    { timestamp: '2026-09-29T15:00:00Z', direction: 'long', entryPrice: 100, stopLoss: 99, exitPrice: 102, outcomeStatus: 'hit_target', kind: '0dte' },
    { timestamp: '2026-09-29T16:00:00Z', direction: 'short', entryPrice: 100, stopLoss: 101, exitPrice: 101, outcomeStatus: 'hit_stop', kind: '0dte' },
    { timestamp: '2026-09-29T17:00:00Z', direction: 'long', entryPrice: 50, stopLoss: 49, exitPrice: 50.5, outcomeStatus: 'expired', kind: 'swing' },
    { timestamp: '2026-09-29T18:00:00Z', direction: 'long', entryPrice: 50, stopLoss: 49, exitPrice: null, outcomeStatus: 'open', kind: 'swing' },
  ]);
  assert.equal(rec.total, 4); assert.equal(rec.n, 2); assert.equal(rec.wins, 1); assert.equal(rec.losses, 1);
  assert.equal(rec.open, 1); assert.equal(rec.unresolvedClosed, 1); close(rec.winRate!, 0.5);
  close(rec.avgR!, (2 - 1 + 0.5) / 3); assert.equal(rec.lowN, true);
  assert.equal(rec.firstAt, '2026-09-29T15:00:00Z'); assert.equal(rec.byKind.swing.total, 2);
});

console.log(`\n${passed} passed`);
