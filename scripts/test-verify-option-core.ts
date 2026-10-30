/**
 * npm run test:verify-option-core — fixes 1 + 2 of the ledger audit 2026-10-15
 * (research/verify-option-core.ts, used by research/verify-nexus-book.ts verifyOption):
 * entry verified only inside the traded range (else re-priced from the first real
 * print), stop-vs-target order from the trigger on the underlying AND the premium plan.
 * The audit's concrete cases run on REAL prod rows + Alpaca 1-min bars frozen in
 * scripts/fixtures/ledger-audit-2026-10-15.json.
 */
import assert from 'node:assert/strict';
import {
  entryCheck, exitCheck, fillVerdict, firstBarrier, insideRange, nextRthOpenMs, orderCheck, orderWindow, premiumGoverned, tradedRange, type OBar,
} from '../research/verify-option-core';
import { loadLedgerAuditFixture, runCase } from './lib/ledger-audit-cases';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const T0 = Date.parse('2026-10-05T19:15:00Z');
const m = (k: number) => T0 + k * 60_000;
const bar = (k: number, o: number, h: number, l: number, c: number, vw?: number): OBar => ({ t: m(k), o, h, l, c, v: 10, ...(vw != null ? { vw } : {}) });

console.log('fix 1 — entry inside the traded range, else re-priced from the first real print');
t('no $15 / 20% tolerance: an entry 2¢ outside the slack is not verified', () => {
  const bars = [bar(0, 1.0, 1.05, 0.98, 1.02), bar(1, 1.02, 1.04, 1.0, 1.03)];
  assert.equal(insideRange(1.08, { lo: 0.98, hi: 1.05 }), true, '3% slack');
  assert.equal(insideRange(1.10, { lo: 0.98, hi: 1.05 }), false);
  const e = entryCheck(bars, { pubMs: m(0), trigMs: m(0), exitMs: m(30), recorded: 1.10 });
  assert.equal(e.status, 'entry-repriced');
  assert.equal(e.entry, 1.02, 'first print at the trigger (close when no VWAP)');
});
t('VWAP of the first print is the fill; a later trigger re-prices from the trigger, not publish', () => {
  const bars = [bar(0, 0.5, 0.55, 0.5, 0.52), bar(15, 0.8, 0.9, 0.78, 0.85, 0.84)];
  const e = entryCheck(bars, { pubMs: m(0), trigMs: m(15), exitMs: m(40), recorded: 0.3 });
  assert.deepEqual([e.status, e.entry, e.fill?.delayMin], ['entry-repriced', 0.84, 0]);
});
t('a recorded entry that traded around the TRIGGER (not publish) is verified', () => {
  const bars = [bar(0, 0.5, 0.55, 0.5, 0.52), bar(15, 0.8, 0.9, 0.78, 0.85)];
  assert.equal(entryCheck(bars, { pubMs: m(0), trigMs: m(15), exitMs: m(40), recorded: 0.86 }).status, 'verified');
});
t('no print anywhere → no-print (unverifiable), never a pass', () => {
  const e = entryCheck([], { pubMs: m(0), trigMs: m(0), exitMs: m(30), recorded: 1 });
  assert.equal(e.status, 'no-print');
  const o = orderCheck({ recordedStatus: 'hit_stop', governing: 'underlying', underlying: null, premium: null });
  assert.equal(fillVerdict(e, o, exitCheck([], { recorded: 1, eventMs: null, recordedExitMs: m(30), computed: null }), false).verdict, 'UNVERIFIABLE');
});
t('off-hours publish: the first 5 prints after publication are the range', () => {
  const r = tradedRange([bar(0, 1, 1, 1, 1)], [m(-100)], 5 * 60_000, 'x');
  assert.equal(r, null);
  const e = entryCheck([bar(30, 0.94, 1.35, 0.94, 1.2)], { pubMs: m(0), trigMs: m(0), exitMs: m(60), recorded: 1.3 });
  assert.equal(e.range?.basis, 'first 5 prints after publish');
  assert.equal(e.status, 'verified');
});

console.log('fix 2 — barrier order from the trigger (underlying AND premium plan)');
t('stop first on a bar touching both; gap fills at the open', () => {
  const ub = [bar(1, 100, 101, 99, 100), bar(2, 100, 106, 94, 100), bar(3, 90, 91, 89, 90)];
  const h = firstBarrier(ub, { long: true, stop: 95, target: 105, fromMs: m(0), toMs: m(10), basis: 'underlying' });
  assert.deepEqual([h.kind, h.sameBar, h.px], ['stop', true, 95]);
  const g = firstBarrier([bar(1, 90, 91, 89, 90)], { long: true, stop: 95, target: 105, fromMs: m(0), toMs: m(10), basis: 'underlying' });
  assert.equal(g.px, 90, 'gapped through → open');
  const s = firstBarrier([bar(1, 100, 101, 94, 95)], { long: false, stop: 105, target: 95, fromMs: m(0), toMs: m(10), basis: 'underlying' });
  assert.equal(s.kind, 'target', 'short: target below');
});
t('premium-stop engines are governed by the premium plan', () => {
  assert.equal(premiumGoverned({ hasStoredPremiumPlan: false, resolutionReason: 'premium_hit_stop' }), true);
  assert.equal(premiumGoverned({ hasStoredPremiumPlan: true, resolutionReason: 'auto_stop' }), true);
  assert.equal(premiumGoverned({ hasStoredPremiumPlan: false, resolutionReason: 'auto_stop' }), false);
});
t('recorded outcome ≠ first barrier → wrong_outcome_order; paths disagree → barrier_order_disagrees; never VERIFIED', () => {
  const stop = { kind: 'stop' as const, at: m(5), px: 1, sameBar: false, basis: 'premium' as const };
  const tgt = { kind: 'target' as const, at: m(3), px: 2, sameBar: false, basis: 'underlying' as const };
  const none = { kind: 'none' as const, at: null, px: null, sameBar: false, basis: 'underlying' as const };
  assert.equal(orderCheck({ recordedStatus: 'hit_stop', governing: 'underlying', underlying: tgt, premium: null }).bug, 'wrong_outcome_order');
  assert.equal(orderCheck({ recordedStatus: 'expired', governing: 'underlying', underlying: tgt, premium: null }).bug, 'wrong_outcome_order');
  assert.equal(orderCheck({ recordedStatus: 'hit_stop', governing: 'underlying', underlying: none, premium: null }).bug, 'wrong_outcome_order', 'nothing touched but labelled a stop');
  assert.equal(orderCheck({ recordedStatus: 'hit_stop', governing: 'premium', underlying: tgt, premium: stop }).bug, 'barrier_order_disagrees');
  assert.equal(orderCheck({ recordedStatus: 'hit_stop', governing: 'premium', underlying: none, premium: stop }).bug, null);
  const ok = entryCheck([bar(0, 1, 1, 1, 1)], { pubMs: m(0), trigMs: m(0), exitMs: m(5), recorded: 1 });
  const x = exitCheck([bar(5, 1, 1, 1, 1)], { recorded: 1, eventMs: m(5), recordedExitMs: m(5), computed: 1 });
  const o = orderCheck({ recordedStatus: 'hit_stop', governing: 'premium', underlying: tgt, premium: stop });
  assert.deepEqual(fillVerdict(ok, o, x, false), { verdict: 'MISMATCH', bugClass: 'barrier_order_disagrees' });
});
t('expiry exit must equal settlement intrinsic (±$0.05) — else settlement_repriced', () => {
  const ok = entryCheck([bar(0, 1, 1, 1, 1)], { pubMs: m(0), trigMs: m(0), exitMs: m(5), recorded: 1 });
  const o = orderCheck({ recordedStatus: 'expired', governing: 'underlying', underlying: { kind: 'none', at: null, px: null, sameBar: false, basis: 'underlying' }, premium: null });
  const x = exitCheck([], { recorded: 0.4, eventMs: null, recordedExitMs: m(5), computed: 0, settlement: 0 });
  assert.deepEqual([x.status, x.exit], ['repriced', 0]);
  assert.deepEqual(fillVerdict(ok, o, x, true), { verdict: 'MISMATCH', bugClass: 'settlement_repriced' });
});

console.log('the audit cases (real prod rows + Alpaca 1-min bars)');
const fx = loadLedgerAuditFixture();
t('SPX 7775P 0DTE 10-05: entry $1.13 never traded ([0.22, 0.85]) → entry-repriced at the first print $0.35; the stop is NOT rewritten into a +$435 win', () => {
  const r = runCase(fx.cases.spx_7775p_1005);
  assert.equal(r.entry.status, 'entry-repriced');
  assert.equal(r.entry.entry, 0.35);
  assert.equal(r.order.first?.kind, 'stop', 'recorded stop stays a stop');
  assert.deepEqual(r.verdict, { verdict: 'MISMATCH', bugClass: 'entry_repriced' });
  assert.ok(r.recomputedPnL != null && r.recomputedPnL <= 0, `stop re-priced from bars is a loss, not +$435 (got ${r.recomputedPnL})`);
});
t('SPY 780P: recorded "expired +$18" but the target was hit first next open → wrong_outcome_order (not counted)', () => {
  const r = runCase(fx.cases.spy_780p);
  assert.equal(r.entry.status, 'verified');
  assert.equal(r.order.first?.kind, 'target');
  assert.deepEqual(r.verdict, { verdict: 'MISMATCH', bugClass: 'wrong_outcome_order' });
});
t('QQQ 746P: premium-stop engine — the premium stop really printed first (14:14 ET), recorded stop verified at 1 contract (audit "label" case: exit time is the 16:00 deadline, not the touch)', () => {
  const r = runCase(fx.cases.qqq_746p);
  assert.equal(r.order.governing, 'premium');
  assert.equal(r.order.first?.kind, 'stop');
  assert.ok(r.order.first!.at! < Date.parse(fx.cases.qqq_746p.idea.exit_date!), 'touch precedes the recorded (deadline) exit time');
  assert.equal(r.verdict.verdict, 'VERIFIED');
});
t('SPY 779C: pre-market trigger; at the open the premium stop and the underlying target hit in the same minute → barrier_order_disagrees (never silently verified)', () => {
  const r = runCase(fx.cases.spy_779c);
  assert.deepEqual(r.verdict, { verdict: 'MISMATCH', bugClass: 'barrier_order_disagrees' });
});
t('CRDO 180P: premium plan stop ($2.04) printed first on 10-13; the underlying target came only after the exit → recorded stop verified', () => {
  const r = runCase(fx.cases.crdo_180p);
  assert.equal(r.order.governing, 'premium');
  assert.equal(r.order.first?.kind, 'stop');
  assert.equal(r.verdict.verdict, 'VERIFIED');
});

console.log('spot-check 2026-10-30 — order-window artifacts');
t('a barrier stamp is a 5-min bucket start: the window runs to stamp + 5 min (QQQ 746P 10-08: stamped 19:20Z, stop printed 19:22Z)', () => {
  const ex = Date.parse('2026-10-08T19:20:00Z');
  const w = orderWindow({ recordedStatus: 'hit_stop', trigMs: ex, fallbackTrigMs: ex, exitMs: ex, exitTimeSource: 'bar_hit', capMs: ex + 86400_000 });
  assert.equal(w.toMs, ex + 5 * 60_000);
  const bars = [bar(0, 0.7, 0.81, 0.65, 0.7), bar(2, 0.61, 0.61, 0.35, 0.35)].map((b) => ({ ...b, t: b.t - T0 + ex }));
  assert.equal(firstBarrier(bars, { long: true, stop: 0.44, target: 3.73, fromMs: ex, toMs: w.toMs, basis: 'premium' }).kind, 'stop');
});
t('a time exit never orders a touch inside its own exit minute (INTC 115C: stop and exit both in the 09:30 bar)', () => {
  const ex = Date.parse('2026-10-07T13:30:00Z');
  const w = orderWindow({ recordedStatus: 'expired', trigMs: ex - 86400_000, fallbackTrigMs: ex - 86400_000, exitMs: ex, capMs: ex + 86400_000 });
  assert.equal(firstBarrier([{ t: ex, o: 9.2, h: 9.25, l: 8.75, c: 9.2 }], { long: true, stop: 8.87, target: 17.77, fromMs: w.fromMs, toMs: w.toMs, basis: 'premium' }).kind, 'none');
});
t('a trigger observed after the exit falls back (MU 1050C: observed 14:46Z, exit 14:15Z)', () => {
  const w = orderWindow({ recordedStatus: 'hit_stop', trigMs: Date.parse('2026-10-01T14:46:00Z'), fallbackTrigMs: Date.parse('2026-10-01T13:59:00Z'), exitMs: Date.parse('2026-10-01T14:15:00Z'), capMs: Infinity });
  assert.equal(w.trigClamped, true);
  assert.equal(w.fromMs, Date.parse('2026-10-01T13:59:00Z'));
});
t('an extended-hours barrier stamp runs to the next RTH open + 5 min (WDC 420C stamped 04:15 ET)', () => {
  assert.equal(nextRthOpenMs(Date.parse('2026-10-06T08:15:00Z')), Date.parse('2026-10-06T13:30:00Z'));
  assert.equal(nextRthOpenMs(Date.parse('2026-10-09T21:00:00Z')), Date.parse('2026-10-12T13:30:00Z'), 'Friday after the close → Monday');
  const w = orderWindow({ recordedStatus: 'hit_stop', trigMs: 0, fallbackTrigMs: 0, exitMs: Date.parse('2026-10-06T08:15:00Z'), exitTimeSource: 'bar_hit', capMs: Infinity });
  assert.equal(w.toMs, Date.parse('2026-10-06T13:35:00Z'));
});
t('premium-governed with no contract bars is unverifiable, never judged on the underlying (ALAB 260C)', () => {
  const tgt = { kind: 'target' as const, at: m(1), px: 1, sameBar: false, basis: 'underlying' as const };
  const o = orderCheck({ recordedStatus: 'hit_stop', governing: 'premium', underlying: tgt, premium: null });
  assert.equal(o.bug, null);
  const e = entryCheck([], { pubMs: m(0), trigMs: m(0), exitMs: m(1), recorded: 1 });
  assert.equal(fillVerdict(e, o, exitCheck([], { recorded: 1, eventMs: null, recordedExitMs: m(1), computed: null }), false).verdict, 'UNVERIFIABLE');
});
t('the recorded barrier touched only after the stamp → exit_time_misstamped (correctable), the opposite one → wrong_outcome_order', () => {
  const none = { kind: 'none' as const, at: null, px: null, sameBar: false, basis: 'premium' as const };
  const lateT = { kind: 'target' as const, at: m(36), px: 5.8, sameBar: false, basis: 'premium' as const };
  const lateS = { ...lateT, kind: 'stop' as const };
  assert.equal(orderCheck({ recordedStatus: 'hit_target', governing: 'premium', underlying: null, premium: none, late: lateT }).bug, 'exit_time_misstamped');
  assert.equal(orderCheck({ recordedStatus: 'hit_target', governing: 'premium', underlying: null, premium: none, late: lateS }).bug, 'wrong_outcome_order');
  const bars = [bar(0, 3.79, 3.8, 3.7, 3.79), bar(36, 5.7, 6, 5.6, 5.8)];
  const e = entryCheck(bars, { pubMs: m(0), trigMs: m(0), exitMs: m(10), recorded: 3.79 });
  const o = orderCheck({ recordedStatus: 'hit_target', governing: 'premium', underlying: null, premium: none, late: lateT });
  const x = exitCheck(bars, { recorded: 5.8, eventMs: m(36), recordedExitMs: m(10), computed: 5.8 });
  assert.deepEqual(fillVerdict(e, o, x, false), { verdict: 'MISMATCH', bugClass: 'exit_time_misstamped' });
});
t('off-hours range spans 30 min from the first print; a re-print > 60 min after the session open is no fill (CNC 70C, DASH 145C)', () => {
  const pub = Date.parse('2026-10-07T22:52:00Z');
  const open = Date.parse('2026-10-08T13:30:00Z');
  const bars: OBar[] = [{ t: open + 10 * 60_000, o: 2.79, h: 2.79, l: 2.79, c: 2.79 }, { t: open + 3 * 3600_000, o: 2.4, h: 2.4, l: 2.4, c: 2.4 }, { t: open + 86400_000, o: 3.4, h: 3.4, l: 3.4, c: 3.4 }];
  const e = entryCheck(bars, { pubMs: pub, trigMs: pub, exitMs: open + 3 * 86400_000, recorded: 3.03 });
  assert.equal(e.range?.hi, 2.79, 'only the first print is inside 30 min of itself');
  assert.equal(e.status, 'entry-repriced', 'the open print 10 min in is a fill');
  const late = entryCheck([{ t: open + 8 * 86400_000, o: 48.17, h: 48.17, l: 48.17, c: 48.17 }], { pubMs: open, trigMs: open, exitMs: open + 9 * 86400_000, recorded: 52.3 });
  assert.equal(late.status, 'no-print');
});
t('option_target_hit / option_stop_hit are premium-governed (QQQ 747C)', () => {
  assert.equal(premiumGoverned({ hasStoredPremiumPlan: false, resolutionReason: 'option_target_hit' }), true);
  assert.equal(premiumGoverned({ hasStoredPremiumPlan: false, resolutionReason: 'option_expiry_intrinsic' }), false);
});

console.log(`\n${n} verify-option-core checks passed`);
