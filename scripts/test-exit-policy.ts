/**
 * Unit tests for the exit rules (shared/exit-policy.ts).
 *   npm run test:exit-policy
 */
import assert from 'node:assert/strict';
import { simulateExit, fillsPnl, emaSeries, atrSeries, readExitPolicy, exitPolicyPlan, manageSignal, captureRatio, type SimBar, type SimInput } from '../shared/exit-policy';
import { mapDeskIdea, type DeskIdea } from '../server/journal-row-maps';

let n = 0;
const t = (name: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error('FAIL', name); throw e; } };

/** Bars from a list of [o,h,l,c]; one session unless `sessAt` splits it. */
function mk(ohlc: Array<[number, number, number, number]>, extra: Partial<SimBar> = {}, perBar?: (i: number) => Partial<SimBar>): SimBar[] {
  return ohlc.map(([o, h, l, c], i) => ({ t: i * 60_000, o, h, l, c, sess: 0, end5: false, endSess: i === ohlc.length - 1, ema5: null, atr5: null, emaD: null, atrD: null, ...extra, ...(perBar ? perBar(i) : {}) }));
}
const base = (bars: SimBar[], over: Partial<SimInput> = {}): SimInput => ({ dir: 1, bars, entry: 100, stop: 99, target: 102, tf: 'm5', ...over });

t('plan: target fills at T1', () => {
  const f = simulateExit('plan', base(mk([[100, 100.5, 99.5, 100], [100, 102.5, 99.8, 102.2], [102, 103, 101, 102]])));
  assert.deepEqual(f.map((x) => [x.why, x.u, x.frac]), [['T1', 102, 1]]);
});
t('plan: stop and target in one bar → stop', () => {
  const f = simulateExit('plan', base(mk([[100, 100.5, 99.5, 100], [100, 102.5, 98.5, 101]])));
  assert.equal(f[0].why, 'stop'); assert.equal(f[0].u, 99);
});
t('gap through the stop fills at the open', () => {
  const f = simulateExit('plan', base(mk([[100, 100.5, 99.5, 100], [98, 98.5, 97, 98]])));
  assert.equal(f[0].u, 98);
});
t('entry bar checks only the stop', () => {
  const f = simulateExit('plan', base(mk([[100, 103, 99.5, 101], [101, 101.5, 100.5, 101]])));
  assert.equal(f[0].why, 'horizon');
});
t('hold ignores T1 and exits at horizon', () => {
  const f = simulateExit('hold', base(mk([[100, 100.5, 99.5, 100], [100, 103, 100, 103], [103, 105, 103, 104]])));
  assert.deepEqual(f.map((x) => x.why), ['horizon']); assert.equal(f[0].u, 104);
});
t('t1_ema: half at T1, stop to entry, runner stops at BE', () => {
  const f = simulateExit('t1_ema', base(mk([[100, 100.5, 99.5, 100], [101, 102.2, 101, 102], [102, 102, 99.9, 100]])));
  assert.deepEqual(f.map((x) => [x.why, x.u, x.frac]), [['T1½', 102, 0.5], ['BE', 100, 0.5]]);
  assert.equal(fillsPnl(f, { dir: 1, entry: 100, notional: 1000 }), 10);
});
t('t1_ema: runner exits on a 5-min close below the 20-EMA', () => {
  const bars = mk([[100, 100.5, 99.5, 100], [101, 102.2, 101, 102], [102, 104, 102, 104], [104, 104, 103, 103]], {}, (i) => ({ end5: i === 3, ema5: 103.5 }));
  const f = simulateExit('t1_ema', base(bars));
  assert.deepEqual(f.map((x) => [x.why, x.u]), [['T1½', 102], ['ema', 103]]);
});
t('t1_ema daily: exits at the session close below today\'s EMA', () => {
  const bars = mk([[100, 100.5, 99.5, 100], [101, 102.2, 101, 102], [102, 102.5, 101.5, 101.6]], {}, (i) => ({ emaD: 101.9, sess: i < 2 ? 0 : 1, endSess: i === 1 || i === 2 }));
  const f = simulateExit('t1_ema', base(bars, { tf: 'd1' }));
  // session-0 close 102 ≥ EMA(101.9→101.9+(2/21)(0.1)); session-1 close 101.6 < EMA → exit
  assert.deepEqual(f.map((x) => x.why), ['T1½', 'ema']);
});
t('t1_chandelier: trails best − 2×ATR, never below entry', () => {
  const bars = mk([[100, 100.5, 99.5, 100], [101, 102.2, 101, 102], [102, 106, 102, 105.5], [105.5, 105.6, 103.9, 104]], {}, () => ({ atr5: 1 }));
  const f = simulateExit('t1_chandelier', base(bars));
  assert.deepEqual(f.map((x) => [x.why, x.u]), [['T1½', 102], ['chandelier', 104]]);
});
t('ladder_thirds: 1R/2R/3R', () => {
  const f = simulateExit('ladder_thirds', base(mk([[100, 100.5, 99.5, 100], [100, 101.2, 100, 101], [101, 103.5, 101, 103.4]]), { target: 102 }));
  assert.deepEqual(f.map((x) => x.why), ['1R', '2R', '3R']);
  assert.ok(Math.abs(fillsPnl(f, { dir: 1, entry: 100, notional: 1000 }) - 20) < 1e-9);
});
t('ladder_thirds: BE after 1R', () => {
  const f = simulateExit('ladder_thirds', base(mk([[100, 100.5, 99.5, 100], [100, 101.2, 100, 101], [101, 101, 99.5, 99.6]])));
  assert.deepEqual(f.map((x) => [x.why, x.u]), [['1R', 101], ['BE', 100]]);
});
t('short direction mirrors', () => {
  const f = simulateExit('plan', base(mk([[100, 100.5, 99.5, 100], [99, 99.2, 97.8, 98]]), { dir: -1, stop: 101, target: 98 }));
  assert.deepEqual(f.map((x) => [x.why, x.u]), [['T1', 98]]);
  assert.equal(fillsPnl(f, { dir: -1, entry: 100, notional: 1000 }), 20);
});
t('time_half: exits at half horizon unless ≥ 0.5R', () => {
  const flat = mk([[100, 100.2, 99.8, 100], [100, 100.2, 99.8, 100.1], [100, 100.2, 99.8, 100.1], [100, 100.2, 99.8, 100.1]]);
  assert.equal(simulateExit('time_half', base(flat))[0].why, 'time½');
  const up = mk([[100, 100.2, 99.8, 100], [100, 100.7, 99.8, 100.6], [100.6, 100.7, 100.5, 100.6], [100.6, 100.7, 100.5, 100.6]]);
  assert.equal(simulateExit('time_half', base(up))[0].why, 'horizon');
});
t('opt_premium: half at +100%, rest at +200%', () => {
  const bars = mk([[100, 100.5, 99.5, 100], [100, 101, 100, 101], [101, 102, 101, 102]]);
  const his = [1, 2.1, 3.2]; const pxs = [1, 2, 3];
  const opt = { eP: 1, px: (i: number) => pxs[i], hi: (i: number) => his[i] };
  const f = simulateExit('opt_premium', base(bars, { target: 110, opt }));
  assert.deepEqual(f.map((x) => [x.why, x.opt]), [['+100%½', 2], ['+200%', 3]]);
  assert.equal(fillsPnl(f, { dir: 1, entry: 100, eP: 1 }), 150);
});
t('opt_premium: day time stop at 15:30 when < +50%', () => {
  const bars = mk([[100, 100.5, 99.5, 100], [100, 100.4, 99.6, 100.2], [100, 100.4, 99.6, 100.2]]);
  const opt = { eP: 1, px: () => 1.2, hi: () => 1.3 };
  const f = simulateExit('opt_premium', base(bars, { opt, dayTimeStopIdx: 1 }));
  assert.equal(f[0].why, '15:30'); assert.ok(Math.abs(fillsPnl(f, { dir: 1, entry: 100, eP: 1 }) - 20) < 1e-9);
});
t('opt_premium requires an option', () => {
  assert.deepEqual(simulateExit('opt_premium', base(mk([[100, 100, 100, 100]]))), []);
});
t('option legs on underlying triggers use the contract print', () => {
  const opt = { eP: 2, px: (i: number) => [2, 3.5][i], hi: () => null };
  const f = simulateExit('plan', base(mk([[100, 100.5, 99.5, 100], [101, 102.3, 101, 102]]), { opt }));
  assert.equal(f[0].opt, 3.5); assert.equal(fillsPnl(f, { dir: 1, entry: 100, eP: 2 }), 150);
});
t('ema / atr helpers', () => {
  const e = emaSeries([1, 2, 3], 20); assert.equal(e[0], 1); assert.ok(e[2] > 1 && e[2] < 3);
  const a = atrSeries(Array.from({ length: 15 }, () => ({ o: 1, h: 2, l: 1, c: 1.5 })), 14);
  assert.ok(Number.isNaN(a[12])); assert.equal(a[13], 1); assert.equal(a[14], 1);
});

// ── live policy ──
t('EXIT_POLICY: default plan; only the replay winner is selectable', () => {
  assert.equal(readExitPolicy({}), 'plan');
  assert.equal(readExitPolicy({ EXIT_POLICY: 'time_half' }), 'time_half');
  assert.equal(readExitPolicy({ EXIT_POLICY: 't1_ema' }), 'plan');
});
t('plan policy → no manage signal (card unchanged)', () => {
  const p = exitPolicyPlan({ policy: 'plan', publishedMs: Date.parse('2026-09-30T14:00:00Z'), holdingPeriod: 'swing' });
  assert.equal(p.timeStopAt, null);
  assert.equal(manageSignal(p, { direction: 'long', entry: 100, stop: 98, target: 104, live: 101, nowMs: Date.now() }), null);
});
t('time_half: schedule at 50% of the horizon (day idea published 09:30 ET → 12:45 ET)', () => {
  const pub = Date.parse('2026-09-30T13:30:00Z');
  const p = exitPolicyPlan({ policy: 'time_half', publishedMs: pub, holdingPeriod: 'day' });
  assert.equal(p.horizonDays, 1); assert.equal(p.timeStopAt, '2026-09-30T16:45:00.000Z');
  const before = manageSignal(p, { direction: 'long', entry: 100, stop: 98, target: 104, live: 100.4, nowMs: pub + 3600_000 })!;
  assert.equal(before.state, 'running'); assert.match(before.headline, /exit unless ≥ \+0.5R/); assert.equal(before.keepAbove, 101);
  const exit = manageSignal(p, { direction: 'long', entry: 100, stop: 98, target: 104, live: 100.4, nowMs: pub + 4 * 3600_000 })!;
  assert.equal(exit.state, 'time_exit');
  const kept = manageSignal(p, { direction: 'long', entry: 100, stop: 98, target: 104, live: 101.5, nowMs: pub + 4 * 3600_000 })!;
  assert.equal(kept.state, 'kept');
  assert.equal(manageSignal(p, { direction: 'short', entry: 100, stop: 102, target: 96, live: 95.9, nowMs: pub })!.state, 'target');
  assert.equal(manageSignal(p, { direction: 'short', entry: 100, stop: 102, target: 96, live: 102.1, nowMs: pub })!.state, 'stopped');
});
t('captureRatio', () => {
  assert.equal(captureRatio({ direction: 'long', entry: 100, exit: 105, high: 110, low: 99 }), 0.5);
  assert.equal(captureRatio({ direction: 'short', entry: 100, exit: 98, high: 101, low: 96 }), 0.5);
  assert.equal(captureRatio({ direction: 'long', entry: 100, exit: 95, high: 110, low: 94 }), -0.5);
  assert.equal(captureRatio({ direction: 'long', entry: 100, exit: 95, high: 99, low: 94 }), null);
  assert.equal(captureRatio({ direction: 'long', entry: 100, exit: 105, high: null, low: null }), null);
});
t('desk row carries capture on closed rows only', () => {
  const base: DeskIdea = { id: 'x', symbol: 'AAA', assetType: 'stock', direction: 'long', entryPrice: 100, targetPrice: 110, stopLoss: 95, riskRewardRatio: 2,
    optionType: null, strikePrice: null, expiryDate: null, entryPremium: null, exitPremium: null, optionPercentGain: null, exitPrice: 104, percentGain: 4,
    outcomeStatus: 'expired', resolutionReason: 'auto_time_stop', exitDate: '2026-09-30T18:00:00Z', timestamp: '2026-09-29T14:00:00Z', source: 'quant', catalyst: null,
    genConvictionBand: null, highestPriceReached: 108, lowestPriceReached: 99 };
  const r = mapDeskIdea(base); assert.ok('row' in r); assert.equal((r as any).row.captureRatio, 0.5);
  const o = mapDeskIdea({ ...base, outcomeStatus: 'open', exitPrice: null, percentGain: null }); assert.ok('row' in o); assert.equal((o as any).row.captureRatio, undefined);
});

console.log(`exit-policy: ${n} tests passed`);
