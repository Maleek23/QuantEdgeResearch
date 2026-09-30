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
import { evaluateZeroDte, policyOpen, timeStopIso } from '../server/zero-dte-policies';
import {
  zeroDteEligibility, watchSetups, pickIdeaContract, ideaStage, sortIdeas, capsFor, kindForSetup, formingProximityPct,
} from '../server/zero-dte-ideas-core';
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
  assert.deepEqual(parseWatch(undefined), ['SPX', 'MSTR', 'META', 'BE', 'TSLA']);
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

// ─── 8 · 0DTE ideas: eligibility, WATCH → TRIGGERED → DONE, contract within caps ──
ok('no-0DTE-today: Friday-only names on Mon/Tue are skipped; Wed/Thu use the nearest (≤2d); SPXW daily is 0DTE', () => {
  const fri = ['2026-10-02', '2026-10-09'];
  const mon = zeroDteEligibility(pickDeskExpiry(fri, '2026-09-28'));
  assert.equal(mon.ok, false); assert.match(mon.label, /^no 0DTE today — nearest Fri \(4d\)/);
  assert.equal(zeroDteEligibility(pickDeskExpiry(fri, '2026-09-29')).ok, false); // Tue → 3d
  const wed = zeroDteEligibility(pickDeskExpiry(fri, '2026-09-30'));
  assert.equal(wed.ok, true); assert.equal(wed.dte, 2); assert.match(wed.label, /2DTE — nearest Fri/);
  assert.equal(zeroDteEligibility(pickDeskExpiry(fri, '2026-10-01')).dte, 1);
  const spx = zeroDteEligibility(pickDeskExpiry(['2026-09-29', '2026-09-30'], '2026-09-29'));
  assert.deepEqual([spx.ok, spx.dte, spx.label], [true, 0, '0DTE']);
  assert.equal(zeroDteEligibility(pickDeskExpiry([], '2026-09-29')).ok, false);
});

/** A −γ tape: OR30 99.5–100.5, drifting up under the OR high, then (optionally) two closes above it. */
function orbBars(breakout: boolean): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < 12; i++) out.push({ t: Date.UTC(2026, 8, 28, 13, 30) + i * 3e5, o: 98, h: 98.3, l: 97.8, c: 98, v: 1000 });
  const orC = [100.0, 99.8, 99.7, 100.1, 100.2, 100.0];
  orC.forEach((c, i) => out.push({ t: et(9, 30) + i * 3e5, o: c, h: i === 3 ? 100.5 : c + 0.1, l: i === 2 ? 99.5 : c - 0.1, c, v: 20_000 }));
  const drift = [100.0, 100.1, 100.2, 100.3, 100.35, 100.4, 100.42, 100.45];
  drift.forEach((c, i) => out.push({ t: et(10, 0) + i * 3e5, o: c - 0.02, h: Math.min(c + 0.03, 100.49), l: c - 0.05, c, v: 8000 }));
  if (breakout) [100.6, 100.7].forEach((c, i) => out.push({ t: et(10, 40) + i * 3e5, o: c - 0.1, h: c + 0.05, l: c - 0.12, c, v: 15_000 }));
  return out;
}
const negGex = (now: number, spot: number) => ({ spot, zeroGamma: 99, callWall: 101.5, putWall: 98, sign: 'negative' as const, fetchedAt: new Date(now - 60_000).toISOString() });
const watchIn = (now: number, st: ReturnType<typeof structureFromBars>) => ({
  symbol: 'TEST', phase: sessionPhase(now), price: st.lastClose!, sign: 'negative' as const, vwap: st.vwap,
  levels: { zeroGamma: 99, callWall: 101.5, putWall: 98, or30High: st.or30High, or30Low: st.or30Low, pdh: st.pdh, pdl: st.pdl },
  maxRiskPct: 0.6, emTodayPct: null, flowLean: 'long' as const,
});

ok('WATCH: −γ, price 0.05% under the OR30 high → "ORB break" calls forming, policy stop/target, ≥1.5R', () => {
  const now = et(10, 41);
  const st = structureFromBars('TEST', orbBars(false), now);
  assert.equal(st.or30High, 100.5); assert.equal(st.lastClose, 100.45);
  assert.equal(evaluateZeroDte('TEST', negGex(now, 100.45), st, now, 641, null).setup, null, 'not triggered yet');
  const w = watchSetups(watchIn(now, st));
  assert.equal(w.setups.length, 1, w.notes.join(' / '));
  const s = w.setups[0];
  assert.equal(s.kind, 'orb_break'); assert.equal(s.direction, 'long'); assert.equal(s.policy, 'A');
  assert.equal(s.trigger.name, 'OR30 high'); close(s.stop, 100.5 * 0.999); close(s.entry, 100.5 * 1.001);
  assert.equal(s.target.name, 'call wall'); assert.ok(s.rr >= 1.5);
  assert.match(s.triggerText, /two 5-min closes above \$100\.50/);
  assert.equal(s.entryBy, '15:45'); assert.equal(s.exitBy, '15:55');
  close(s.distPct, 0.05 / 100.45 * 100, 1e-9);
  assert.ok(['A', 'B', 'C'].includes(s.grade));
});
ok('WATCH → TRIGGERED: two closes above the OR30 high fire policy A on the SAME level (kind orb_break)', () => {
  const now = et(10, 51);
  const st = structureFromBars('TEST', orbBars(true), now);
  const v = evaluateZeroDte('TEST', negGex(now, 100.7), st, now, 651, null);
  assert.ok(v.setup, v.wait.join(' / '));
  assert.equal(v.setup!.trigger.name, 'OR30 high'); assert.equal(v.setup!.direction, 'long');
  assert.equal(kindForSetup(v.setup!), 'orb_break');
  assert.equal(watchSetups(watchIn(now, st)).setups.filter((x) => x.direction === 'long').length, 0, 'a broken level is no longer "forming"');
});
ok('TRIGGERED → IN PLAY → DONE (target / stop live, 15:55 time stop, tracker status)', () => {
  const at = et(10, 51);
  const x = { direction: 'long' as const, stop: 100.3995, target: 101.5, timestamp: new Date(at).toISOString(), entryValidUntil: new Date(at + 10 * 60_000).toISOString(), exitBy: timeStopIso(at), outcomeStatus: 'open' };
  assert.equal(ideaStage(x, et(10, 55), 100.8).stage, 'triggered');
  assert.equal(ideaStage(x, et(11, 5), 100.9).stage, 'in_play');
  const t = ideaStage(x, et(11, 30), 101.6); assert.equal(t.stage, 'done'); assert.match(t.doneReason!, /target touched/);
  assert.match(ideaStage(x, et(11, 30), 100.3).doneReason!, /stop touched/);
  assert.match(ideaStage(x, et(15, 56), 100.9).doneReason!, /time stop 15:55/);
  assert.equal(ideaStage({ ...x, outcomeStatus: 'hit_target' }, et(11, 0), null).doneReason, 'target hit');
});
ok('sort: triggered, in play, then WATCH by distance to trigger, done last', () => {
  const xs = [
    { stage: 'done' as const, distPct: null, at: '2026-09-29T15:00:00Z', id: 'd' },
    { stage: 'watch' as const, distPct: 0.4, at: '2026-09-29T15:01:00Z', id: 'w2' },
    { stage: 'in_play' as const, distPct: null, at: '2026-09-29T14:00:00Z', id: 'p' },
    { stage: 'watch' as const, distPct: 0.1, at: '2026-09-29T15:02:00Z', id: 'w1' },
    { stage: 'triggered' as const, distPct: null, at: '2026-09-29T14:30:00Z', id: 't' },
  ];
  assert.deepEqual(sortIdeas(xs).map((x) => x.id), ['t', 'p', 'w1', 'w2', 'd']);
});
ok('WATCH: +γ at 15:10 under the 0DTE call wall, stretched above VWAP → power-hour pin toward max-γ', () => {
  const now = et(15, 10);
  const w = watchSetups({ symbol: 'TEST', phase: sessionPhase(now), price: 661.3, sign: 'positive', vwap: 657,
    levels: { zeroGamma: 640, callWall: 680, putWall: 640, zCallWall: 662, zPutWall: 655, zMaxGamma: 659 }, maxRiskPct: 0.6, emTodayPct: 0.9, flowLean: null });
  assert.equal(w.setups.length, 1, w.notes.join(' / '));
  const s = w.setups[0];
  assert.equal(s.kind, 'power_hour_pin'); assert.equal(s.direction, 'short'); assert.equal(s.trigger.name, '0DTE call wall');
  assert.equal(s.target.name, '0DTE max-γ'); assert.equal(s.target2?.name, 'VWAP');
  assert.equal(s.entryBy, '15:40'); assert.ok(s.rr >= 1.5);
});
ok('WATCH is silent when it must be: neutral γ, entries closed, B gap 14:30–15:00', () => {
  const base = { symbol: 'T', price: 100, vwap: 99.8, levels: { callWall: 100.1, putWall: 99 }, maxRiskPct: 0.6, emTodayPct: null, flowLean: null } as const;
  assert.equal(watchSetups({ ...base, phase: sessionPhase(et(11, 0)), sign: 'neutral' }).setups.length, 0);
  assert.equal(watchSetups({ ...base, phase: sessionPhase(et(15, 50)), sign: 'negative' }).setups.length, 0);
  assert.match(watchSetups({ ...base, phase: sessionPhase(et(14, 45)), sign: 'positive' }).notes[0], /14:30–15:00/);
  assert.equal(formingProximityPct(null), 0.3); assert.equal(formingProximityPct(3.5), 1);
});

const E0 = '2026-09-29';
const c = (strike: number, delta: number, bid: number, ask: number, oi = 500, type: 'call' | 'put' = 'call'): DeskChainRow =>
  ({ option_type: type, strike, expiration_date: E0, bid, ask, open_interest: oi, volume: 100, greeks: { delta: type === 'call' ? delta : -delta, mid_iv: 0.4 } });
const chain = [
  c(100, 0.62, 0.98, 1.02), c(101, 0.45, 0.48, 0.52), c(102, 0.30, 0.29, 0.31), c(103, 0.15, 0.10, 0.11),
  c(101.5, 0.40, 0.20, 0.50),          // spread 86% → out
  c(100.5, 0.40, 0.70, 0.72, 10),       // OI 10 → out
  c(104, 0, 0.40, 0.42),                // unknown delta (CBOE 0) → out, never guessed
  { ...c(101, 0.45, 0.48, 0.52), expiration_date: '2026-10-02' }, // another expiry → ignored
];
ok('contract: Δ nearest 0.40 inside spread/OI/Δ gates, sized inside the $ risk + debit caps, premium stop/target estimated', () => {
  const r = pickIdeaContract({ rows: chain, root: 'TEST', expiry: E0, direction: 'long', entry: 100.6, stop: 100.4, target: 101.5, riskCapDollars: 200, maxDebitDollars: 400 });
  assert.ok(r.contract, r.reason ?? '');
  const k = r.contract!;
  assert.equal(k.strike, 101); assert.equal(k.optionType, 'call'); assert.equal(k.expiry, E0);
  close(k.mid, 0.5); close(k.premiumStop, 0.5 - 0.45 * 0.2); close(k.premiumT1, 0.5 + 0.45 * 0.9);
  assert.equal(k.qty, 8, 'debit cap binds: floor(400 / 50)');
  assert.ok(k.riskDollars <= 200 && k.debitDollars <= 400);
  assert.equal(k.occ, 'TEST260929C00101000');
});
ok('contract: the −50% premium stop caps the loss; nothing fits a tiny cap → reason names the cap', () => {
  const wide = pickIdeaContract({ rows: chain, root: 'TEST', expiry: E0, direction: 'long', entry: 100.6, stop: 99.0, target: 104, riskCapDollars: 200, maxDebitDollars: 400 });
  close(wide.contract!.premiumStop, wide.contract!.mid * 0.5);
  const none = pickIdeaContract({ rows: chain, root: 'TEST', expiry: E0, direction: 'long', entry: 100.6, stop: 100.4, target: 101.5, riskCapDollars: 5, maxDebitDollars: 400 });
  assert.equal(none.contract, null); assert.match(none.reason!, /risk \/ \$400 debit cap/); assert.match(none.reason!, /spread > 15%/);
  const puts = pickIdeaContract({ rows: chain, root: 'TEST', expiry: E0, direction: 'short', entry: 100, stop: 100.2, target: 99, riskCapDollars: 200, maxDebitDollars: 400 });
  assert.equal(puts.contract, null); assert.match(puts.reason!, /no puts listed/);
});
ok('caps: one $ budget per trade, per-name override, debit defaults to 2× risk', () => {
  assert.deepEqual([capsFor('MSTR', {}).riskCapDollars, capsFor('MSTR', {}).maxDebitDollars], [200, 400]);
  assert.equal(capsFor('SPX', { ZERO_DTE_RISK_SPX: '350' }).riskCapDollars, 350);
  assert.equal(capsFor('META', { INDEX_0DTE_RISK_BUDGET: '150', ZERO_DTE_MAX_DEBIT: '250' }).maxDebitDollars, 250);
});

console.log(`\n${passed} passed`);
