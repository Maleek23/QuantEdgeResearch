/**
 * 0DTE winners: peak (MFE) recording + the runner exit policy.
 * shared/option-peak.ts · shared/runner-policy.ts · timeline / journal display.
 */
import assert from 'node:assert/strict';
import {
  premiumPeakFromBars, underlyingPeakFromBars, intrinsicAt, mergePeak, peakTag, parsePeak, withPeakTag, peakLine, peakCapture,
  withPeakSignal, readPeakSignal, type OptionPeak,
} from '../shared/option-peak';
import {
  readRunnerPolicy, RUNNER_POLICY_DEFAULT_ON, runnerPath, runnerStep, runnerInit, runnerResume, summarizeRunner, quoteTick, buildRunnerTicks,
  botRunnerManage, sessionVwap, withRunnerTag, parseRunner, runnerLine, runnerAppliesTo, type RunnerTick, type RunnerPlan,
} from '../shared/runner-policy';
import { buildIdeaTimeline } from '../shared/idea-timeline';
import { mapDeskIdea } from '../server/journal-row-maps';
import { liveMarksFor, _clearMarkCache } from '../server/journal-marks';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const T0 = Date.parse('2026-10-07T13:58:00Z'); // 09:58 ET
const min = (k: number) => T0 + k * 60_000;
const etMin = (ms: number) => 9 * 60 + 58 + Math.round((ms - T0) / 60_000);
const cfg = { ...readRunnerPolicy({}), on: true };

// ── peak ────────────────────────────────────────────────────────────────────
t('peak from bars: max high after entry, entry bar excluded, ties → earliest', () => {
  const bars = [
    { t: min(0), o: 3, h: 9, l: 3, c: 3 },          // entry bar (pre-entry part) — excluded when entry is mid-bar
    { t: min(1), o: 3, h: 4.22, l: 3, c: 4.1 },
    { t: min(14), o: 5, h: 5.45, l: 4.9, c: 5.2 },
    { t: min(20), o: 5, h: 5.45, l: 4.9, c: 5.0 },
  ];
  const p = premiumPeakFromBars(bars, T0 + 5_000, min(400), 60_000)!;
  assert.equal(p.premium, 5.45); assert.equal(p.atMs, min(14));
  assert.equal(premiumPeakFromBars(bars, T0, min(400))!.premium, 9, 'entry exactly on a bar boundary includes that bar');
  assert.equal(premiumPeakFromBars([], T0, min(5)), null);
});
t('underlying peak: put → lowest low; intrinsic floor', () => {
  const ub = [{ t: min(1), o: 378, h: 378.5, l: 376, c: 377 }, { t: min(2), o: 377, h: 377, l: 374.1, c: 375 }];
  assert.deepEqual(underlyingPeakFromBars(ub, 'short', T0, min(10)), { price: 374.1, atMs: min(2) });
  assert.equal(underlyingPeakFromBars(ub, 'long', T0, min(10))!.price, 378.5);
  assert.equal(intrinsicAt('put', 380, 374.1), 5.9);
  assert.equal(intrinsicAt('call', 380, 374.1), 0);
});
const PK: OptionPeak = { premium: 5.45, atMs: Date.parse('2026-10-07T14:12:00Z'), basis: 'bar', source: 'alpaca:1Min', window: 'to_eod', underlying: 374.1, underlyingAtMs: Date.parse('2026-10-07T14:14:00Z') };
t('peak tag: format / parse round-trip, other notes untouched', () => {
  const tag = peakTag(PK);
  assert.equal(tag, '[peak:5.45@2026-10-07T14:12Z|bar|alpaca:1Min|to_eod|u=374.1@2026-10-07T14:14Z]');
  assert.deepEqual(parsePeak(`[exit-premium:pass] x\n${tag}`), PK);
  const notes = withPeakTag('[exit-time:bar_hit] a', PK);
  assert.ok(notes.startsWith('[exit-time:bar_hit] a\n[peak:'));
});
t('peak merge: only a higher premium or a better basis replaces; quote never overrides a higher bar', () => {
  const quote: OptionPeak = { ...PK, premium: 4.8, basis: 'quote', source: 'quote:tracker-mid', window: 'to_exit' };
  const n1 = withPeakTag(null, quote);
  const n2 = withPeakTag(n1, PK);
  assert.equal(parsePeak(n2)!.premium, 5.45);
  assert.equal(withPeakTag(n2, quote), n2, 'lower quote leaves the tag alone');
  assert.equal((n2.match(/\[peak:/g) ?? []).length, 1);
  assert.equal(mergePeak({ ...PK, basis: 'quote' }, PK)!.basis, 'bar', 'same premium, better basis');
  assert.equal(mergePeak({ ...PK, basis: 'bar' }, { ...PK, basis: 'intrinsic' })!.basis, 'bar');
});
t('peak line + capture: "peak $5.45 at 10:12 · exit $4.22"', () => {
  assert.equal(peakLine(PK, 4.22), 'peak $5.45 at 10:12 · exit $4.22');
  assert.equal(peakLine({ ...PK, basis: 'quote' }, null), 'peak $5.45 (quote) at 10:12');
  assert.equal(peakLine(null, 4), null);
  assert.equal(Math.round(peakCapture(3.05, 4.22, 5.45)! * 100), 49);
  assert.equal(peakCapture(3.05, 2, 3.0), null, 'never above entry → null');
});
t('bot entry_signals peak: JSON array kept, one peak entry, sleeve tag intact', () => {
  const sig = withPeakSignal('["sleeve:0dte","policy:A"]', { ...PK, basis: 'quote' })!;
  const arr = JSON.parse(sig);
  assert.ok(arr.includes('sleeve:0dte'));
  assert.equal(readPeakSignal(sig)!.premium, 5.45);
  const up = withPeakSignal(sig, { ...PK, premium: 6 })!;
  assert.equal(JSON.parse(up).filter((s: string) => s.startsWith('peak:')).length, 1);
  assert.equal(readPeakSignal(up)!.premium, 6);
  assert.equal(withPeakSignal('free text', PK), null, 'legacy free-text column untouched');
});

// ── runner policy ───────────────────────────────────────────────────────────
t('RUNNER_POLICY: default OFF (replay did not beat all-out in both halves); env on/off; trail pct', () => {
  assert.equal(RUNNER_POLICY_DEFAULT_ON, false);
  assert.equal(readRunnerPolicy({}).on, false);
  assert.equal(readRunnerPolicy({ RUNNER_POLICY: 'on' }).on, true);
  assert.equal(readRunnerPolicy({ RUNNER_POLICY: 'off' }, true).on, false);
  assert.equal(readRunnerPolicy({ RUNNER_TRAIL_PCT: '30' }).trailPct, 0.3);
  assert.equal(readRunnerPolicy({}).trailPct, 0.25);
  assert.equal(runnerAppliesTo('zero_dte_flow', { on: true }), true);
  assert.equal(runnerAppliesTo(null, { on: true }), false, 'swings never');
  assert.equal(runnerAppliesTo('zero_dte_flow', { on: false }), false);
});

// TSLA 380P 2026-10-07: E 3.05, T1 375.78 ~10:00, contract ran to ~5.45 then faded.
const plan: RunnerPlan = { dir: 'short', entryPremium: 3.05, uStop: 379.52, uT1: 375.78 };
const tick = (k: number, p: [number, number, number], u: [number, number, number], vwap = 378.5): RunnerTick =>
  ({ t: min(k), etMin: etMin(min(k)), pO: (p[0] + p[1]) / 2, pH: p[0], pL: p[1], pC: p[2], uH: u[0], uL: u[1], uC: u[2], vwap });
const path: RunnerTick[] = [
  tick(1, [3.3, 3.0, 3.2], [378.4, 377.9, 378.0]),
  tick(2, [4.3, 3.2, 4.22], [378.0, 375.7, 375.9]),     // T1 touch
  tick(5, [4.9, 4.2, 4.8], [376.0, 375.0, 375.2]),
  tick(14, [5.45, 4.8, 5.3], [375.2, 374.1, 374.4]),     // peak
  tick(20, [5.3, 4.5, 4.6], [375.4, 374.5, 375.3]),
  tick(30, [4.4, 3.9, 4.0], [376.6, 375.4, 376.4]),     // gives back > 25% of 5.45 → trail 4.09
];
t('all_out: whole position at the T1 touch (tick close)', () => {
  const s = runnerPath(path, plan, cfg, 'all_out');
  assert.deepEqual(s.legs.map((l) => [l.why, l.premium, l.frac]), [['T1', 4.22, 1]]);
});
t('runner: ½ at T1, BE stop, trail 25% from the 5.45 peak → 4.0875; blended; T1 kept as its own field', () => {
  const s = runnerPath(path, plan, cfg, 'runner');
  assert.equal(s.stage, 'closed');
  assert.equal(s.legs[0].why, 'T1 half'); assert.equal(s.legs[0].premium, 4.22);
  assert.equal(s.legs[1].why, 'trail 25% from peak'); assert.equal(s.legs[1].premium, 4.0875);
  const sum = summarizeRunner(s);
  assert.equal(sum.t1ExitPremium, 4.22);
  assert.equal(sum.runnerExitPremium, 4.0875);
  assert.equal(sum.blendedPremium, Math.round(((4.22 + 4.0875) / 2) * 10_000) / 10_000);
});
t('runner: stop before target in one tick; full stop before T1', () => {
  const both = [tick(1, [3.5, 2.0, 2.2], [379.6, 375.5, 379.0])];
  assert.equal(runnerPath(both, plan, cfg, 'runner').legs[0].why, 'stop');
  assert.equal(runnerPath(both, plan, cfg, 'runner').legs[0].frac, 1);
});
t('runner: +50% premium partial (bot / B variant) fills at the level; T1-only variant waits for the underlying', () => {
  const p = [tick(1, [4.7, 3.0, 4.4], [378.2, 377.0, 377.2])]; // 1.5×3.05 = 4.575, underlying T1 not reached
  const b = runnerPath(p, plan, cfg, 'runner');
  assert.equal(b.legs[0].why, '+50% half'); assert.equal(b.legs[0].premium, 4.575);
  assert.equal(runnerPath(p, { ...plan, premT1: false }, cfg, 'runner').legs.length, 0);
});
t('runner: breakeven, +100%, VWAP, 15:45 exits', () => {
  const from = runnerResume(plan, { premium: 4.22, atMs: min(2) }, cfg, null);
  assert.equal(from.stop, 3.05); assert.equal(from.rem, 0.5);
  const be = runnerStep(from, tick(3, [4.0, 3.0, 3.1], [377, 376, 376.5], 380), plan, { ...cfg, trailPct: 0.9 }, 'runner');
  assert.equal(be.legs[1].why, 'breakeven'); assert.equal(be.legs[1].premium, 3.05);
  const tp = runnerStep(from, tick(3, [6.5, 4.5, 6.2], [376, 373, 373.5], 380), plan, cfg, 'runner');
  assert.equal(tp.legs[1].why, '+100%'); assert.equal(tp.legs[1].premium, 6.1);
  const vw = runnerStep(from, tick(3, [4.3, 4.1, 4.2], [379, 378, 378.9], 378.5), plan, cfg, 'runner');
  assert.equal(vw.legs[1].why, 'back through VWAP');
  const late: RunnerTick = { ...tick(3, [4.3, 4.1, 4.2], [376, 375, 375.5], 380), etMin: 15 * 60 + 45 };
  assert.equal(runnerStep(from, late, plan, cfg, 'runner').legs[1].why, '15:45 flatten');
});
t('runner: a tick with no contract print (carried close) cannot fire premium levels', () => {
  const from = runnerResume(plan, { premium: 4.22, atMs: min(2) }, cfg, { premium: 5.45, atMs: min(14) });
  const carried: RunnerTick = { t: min(15), etMin: 600, pO: null, pH: null, pL: null, pC: 3.0, uH: 375, uL: 374, uC: 374.5, vwap: 378 };
  assert.equal(runnerStep(from, carried, plan, cfg, 'runner').stage, 'runner');
});
t('quote ticks: hi = lo = close = mark', () => {
  const q = quoteTick(min(1), 600, 4.0);
  assert.equal(q.pH, 4); assert.equal(q.pL, 4);
  assert.equal(runnerStep(runnerInit(plan), q, plan, cfg, 'runner').stage, 'full');
});
t('buildRunnerTicks: buckets contract bars into the underlying grid, carries the close, VWAP from 09:30', () => {
  const open = T0 - 28 * 60_000;
  const und = [0, 1, 2, 3].map((k) => ({ t: open + k * 300_000, o: 100, h: 101, l: 99, c: 100 + k, v: 10 }));
  const opt = [{ t: open + 300_000 + 60_000, o: 1, h: 1.4, l: 0.9, c: 1.2 }, { t: open + 300_000 + 120_000, o: 1.2, h: 1.6, l: 1.1, c: 1.5 }];
  const ticks = buildRunnerTicks(opt, und, open + 300_000, open + 3_600_000, open, () => 600);
  assert.equal(ticks.length, 3);
  assert.deepEqual([ticks[0].pO, ticks[0].pH, ticks[0].pL, ticks[0].pC], [1, 1.6, 0.9, 1.5]);
  assert.deepEqual([ticks[1].pH, ticks[1].pC], [null, 1.5]);
  assert.ok(Math.abs(ticks[0].vwap! - sessionVwap(und)[1]) < 1e-9);
});
t('bot: −40% stop, +50% → sell half (two clips) / single contract arms, trail & breakeven, +100%, 15:45', () => {
  const sl = { premStopPct: 0.4 };
  assert.equal(botRunnerManage({ entry: 2, mark: 1.1, qty: 2, armed: false, peak: 2, etMin: 600 }, sl, cfg).action, 'stop');
  const p = botRunnerManage({ entry: 2, mark: 3.0, qty: 3, armed: false, peak: 3, etMin: 600 }, sl, cfg);
  assert.equal(p.action, 'partial'); assert.equal(p.qtyClose, 1);
  assert.equal(botRunnerManage({ entry: 2, mark: 3.0, qty: 2, armed: false, peak: 3, etMin: 600 }, sl, cfg).qtyClose, 1);
  assert.equal(botRunnerManage({ entry: 2, mark: 3.0, qty: 1, armed: false, peak: 3, etMin: 600 }, sl, cfg).action, 'arm_runner');
  assert.equal(botRunnerManage({ entry: 2, mark: 2.9, qty: 1, armed: true, peak: 3.9, etMin: 600 }, sl, cfg).action, 'trail');
  assert.equal(botRunnerManage({ entry: 2, mark: 3.0, qty: 1, armed: true, peak: 3.9, etMin: 600 }, sl, cfg).action, 'hold');
  assert.equal(botRunnerManage({ entry: 2, mark: 2.0, qty: 1, armed: true, peak: 2.4, etMin: 600 }, sl, cfg).action, 'breakeven_stop');
  assert.equal(botRunnerManage({ entry: 2, mark: 4.1, qty: 1, armed: true, peak: 4.1, etMin: 600 }, sl, cfg).action, 'target');
  assert.equal(botRunnerManage({ entry: 2, mark: 3, qty: 1, armed: true, peak: 3, etMin: 945 }, sl, cfg).action, 'flatten');
  assert.equal(botRunnerManage({ entry: 2, mark: 3.5, qty: 1, armed: true, peak: 3.6, etMin: 600, dir: 'short', underlying: 380, vwap: 379 }, sl, cfg).action, 'vwap_exit');
});
t('runner tag: open → closed round-trip; line text', () => {
  const open = withRunnerTag('[exit-premium:touch_bar] x', { state: 'open', t1ExitPremium: 4.22, t1AtMs: Date.parse('2026-10-07T14:00:00Z'), stop: 3.05, runnerExitPremium: null, runnerAtMs: null, runnerWhy: null, blendedPremium: null });
  const r = parseRunner(open)!;
  assert.equal(r.state, 'open'); assert.equal(r.stop, 3.05);
  assert.equal(runnerLine(r), '½ at T1 $4.22 · runner open, stop $3.05');
  const closed = withRunnerTag(open, { ...r, state: 'closed', runnerExitPremium: 4.09, runnerAtMs: Date.parse('2026-10-07T14:28:00Z'), runnerWhy: 'trail 25% from peak', blendedPremium: 4.16 });
  assert.equal((closed.match(/\[runner:/g) ?? []).length, 1);
  const c = parseRunner(closed)!;
  assert.equal(c.state, 'closed'); assert.equal(c.blendedPremium, 4.16); assert.equal(c.runnerWhy, 'trail 25% from peak');
  assert.equal(runnerLine(c), '½ at T1 $4.22 · runner $4.09 (trail 25% from peak) · blended $4.16');
});

// ── display ─────────────────────────────────────────────────────────────────
const idea = {
  id: 'b3cca13b', symbol: 'TSLA', assetType: 'option', direction: 'short', entryPrice: 378.17, targetPrice: 375.78, stopLoss: 379.52,
  timestamp: '2026-10-07T13:58:00.098Z', source: 'zero_dte_flow', outcomeStatus: 'hit_target', resolutionReason: 'auto_target_hit',
  exitPrice: 375.78, exitDate: '2026-10-07T14:00:00Z', entryPremium: 3.05, exitPremium: 4.22, optionPercentGain: 38.36,
  optionType: 'put', strikePrice: 380, expiryDate: '2026-10-07',
  outcomeNotes: `[exit-time:bar_hit] x\n[exit-premium:touch_bar] y\n${peakTag(PK)}`,
};
t('NEXUS timeline: peak event (recorded, contract bar, after the exit) with exit + capture note', () => {
  const tl = buildIdeaTimeline(idea as any, Date.parse('2026-10-07T21:00:00Z'));
  const e = tl.events.find((x) => x.kind === 'peak')!;
  assert.equal(e.status, 'recorded'); assert.equal(e.premium, 5.45); assert.equal(e.timeBasis, 'contract_bar'); assert.equal(e.price, 374.1);
  assert.match(e.note!, /exit \$4\.22 · exit kept 49% of the move to the peak/);
  const order = tl.events.filter((x) => x.status === 'recorded').map((x) => x.kind);
  assert.ok(order.indexOf('peak') > order.indexOf('t1'));
});
t('NEXUS timeline: runner open → pending event; closed → recorded at the runner exit', () => {
  const open = { ...idea, outcomeNotes: `${idea.outcomeNotes}\n[runner:open|t1=4.22@2026-10-07T14:00Z|stop=3.05]` };
  assert.equal(buildIdeaTimeline(open as any).events.find((x) => x.kind === 'runner')!.status, 'pending');
  const closed = { ...idea, exitPremium: 4.16, outcomeNotes: `${idea.outcomeNotes}\n[runner:closed|t1=4.22@2026-10-07T14:00Z|run=4.09@2026-10-07T14:28Z|why=trail 25% from peak|blend=4.16]` };
  const e = buildIdeaTimeline(closed as any).events.find((x) => x.kind === 'runner')!;
  assert.equal(e.status, 'recorded'); assert.equal(e.premium, 4.09); assert.match(e.note!, /blended \$4\.16 = exit_premium/);
});
t('journal row: "peak $5.45 at 10:12 · exit $4.22" + runner line; P&L stays the exit', () => {
  const base = { ...idea, riskRewardRatio: 1.77, catalyst: null, genConvictionBand: null, exitPremiumBasis: 'touch_bar', percentGain: 0.63 };
  const r = mapDeskIdea(base as any);
  assert.ok('row' in r);
  const row = (r as any).row;
  assert.equal(row.peakLine, 'peak $5.45 at 10:12 · exit $4.22');
  assert.equal(row.peakPremium, 5.45);
  assert.equal(row.exitPrice, 4.22);
  const rr = (mapDeskIdea({ ...base, exitPremium: 4.16, outcomeNotes: `${base.outcomeNotes}\n[runner:closed|t1=4.22@2026-10-07T14:00Z|run=4.09@2026-10-07T14:28Z|why=trail|blend=4.16]` } as any) as any).row;
  assert.equal(rr.runner, '½ at T1 $4.22 · runner $4.09 (trail) · blended $4.16');
  assert.equal(rr.exitPrice, 4.16, 'the blended premium is the recorded exit');
  const stock = (mapDeskIdea({ ...base, assetType: 'stock', optionType: null, outcomeNotes: peakTag(PK) } as any) as any).row;
  assert.equal(stock?.peakLine, undefined, 'stocks carry no option peak');
});

await (async () => {
  _clearMarkCache();
  const row = { id: 'desk:x', symbol: 'TSLA', assetType: 'option', direction: 'long', status: 'open', quantity: 1, entryPrice: 3.05, optionType: 'put', strikePrice: 380, expiryDate: '2026-10-07', peakPremium: 5.45 };
  const q = (mid: number) => async () => ({ price: mid, asOf: new Date().toISOString(), source: 'test', delayed: false, basis: 'contract' as const });
  let m = await liveMarksFor([row], q(4.1));
  assert.equal(m['desk:x'].peak, 5.45, 'recorded peak above the mark');
  _clearMarkCache();
  m = await liveMarksFor([{ ...row, peakPremium: null }], q(4.1));
  assert.equal(m['desk:x'].peak, 4.1, 'no record → the mark itself once above entry');
  _clearMarkCache();
  m = await liveMarksFor([{ ...row, peakPremium: null }], q(2.9));
  assert.equal(m['desk:x'].peak, undefined, 'never above entry → no peak');
  n++; console.log('  ✓ LiveMark.peak: max(recorded peak, live contract mark), only above entry');
})();

console.log(`\n0dte-runners: ${n} checks passed`);
