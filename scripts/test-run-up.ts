/**
 * Unit tests for run-up after trigger + the TP5 exit variants (shared/run-up.ts)
 * and the replay pipeline in fixtures mode (research/replay-tp5.ts).
 * All bars are SYNTHETIC.
 *   npm run -s test:run-up
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  computeRunUp, findBarTrigger, simulateExit, exitStats, summarizeRunUps, thresholdHit, inRunUpPopulation, resolveTrigger,
  type RunUpBar,
} from '../shared/run-up';
import { runReplay, loadFixtures, renderReport } from '../research/replay-tp5';

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => {
  try { await fn(); n++; } catch (e) { console.error(`✗ ${name}`); throw e; }
};
const T0 = Date.parse('2026-09-01T13:30:00Z');
const H = 3600_000;
/** bars from [open, high, low, close] tuples, one hour apart starting at T0 */
const mk = (rows: [number, number, number, number][], start = T0): RunUpBar[] =>
  rows.map(([o, h, l, c], k) => ({ t: start + k * H, open: o, high: h, low: l, close: c }));

(async () => {
  // ── run-up ordering ──────────────────────────────────────────────────────
  await t('+5% before stop (long)', () => {
    const bars = mk([[100, 101, 99.5, 100.8], [100.8, 105.2, 100.5, 104], [104, 104, 96, 96.5]]);
    const r = computeRunUp({ direction: 'long', entry: 100, stop: 97, triggerMs: T0, endMs: T0 + 10 * H, bars });
    assert.equal(thresholdHit(r, 5), true);
    assert.equal(thresholdHit(r, 3), true);
    assert.equal(thresholdHit(r, 10), false);
    assert.equal(r.stopHit, true);
    assert.equal(r.mfePct, 5.2);
    assert.equal(r.thresholds.find((h) => h.pct === 5)?.minutesToReach, 60);
  });
  await t('stop and +5% in the same bar = stop first', () => {
    const bars = mk([[100, 101, 99.5, 100.8], [100.8, 106, 96.9, 101]]);
    const r = computeRunUp({ direction: 'long', entry: 100, stop: 97, triggerMs: T0, endMs: T0 + 10 * H, bars });
    assert.equal(r.stopHit, true);
    assert.equal(thresholdHit(r, 5), false);
    assert.equal(thresholdHit(r, 3), false);
    assert.equal(r.mfePct, 1); // stop bar's favourable side excluded
  });
  await t('stop first, +5% later is NOT credited', () => {
    const bars = mk([[100, 100.5, 96.5, 97], [97, 106, 97, 105.5]]);
    const r = computeRunUp({ direction: 'long', entry: 100, stop: 97, triggerMs: T0, endMs: T0 + 10 * H, bars });
    assert.equal(thresholdHit(r, 5), false);
    assert.equal(r.mfePct, null);
  });
  await t('short direction measures the fall', () => {
    const bars = mk([[200, 201, 199, 199.5], [199.5, 200, 189.5, 190]]);
    const r = computeRunUp({ direction: 'short', entry: 200, stop: 206, triggerMs: T0, endMs: T0 + 10 * H, bars });
    assert.equal(thresholdHit(r, 5), true);
    assert.equal(r.mfePct, 5.25);
    assert.equal(r.stopHit, false);
  });
  await t('bars before the trigger and after the window are ignored', () => {
    const bars = mk([[100, 110, 99, 100], [100, 101, 99.5, 100.5], [100.5, 111, 100, 110]]);
    const r = computeRunUp({ direction: 'long', entry: 100, stop: 97, triggerMs: T0 + H, endMs: T0 + 2 * H, bars });
    assert.equal(r.barsUsed, 1);
    assert.equal(thresholdHit(r, 5), false);
  });
  await t('bar-fallback trigger: first bar through entry, incl. gaps', () => {
    const bars = mk([[98, 99, 97.5, 98.8], [98.8, 99.6, 98.5, 99.4], [100.4, 101, 100.2, 100.8]]);
    assert.equal(findBarTrigger(bars, 100, T0, T0 + 10 * H), T0 + 2 * H); // gapped over 100
    assert.equal(findBarTrigger(bars, 99.5, T0, T0 + 10 * H), T0 + H);
    assert.equal(findBarTrigger(bars, 120, T0, T0 + 10 * H), null);
  });
  await t('population + audit trigger', () => {
    const base = { id: 'x', symbol: 'X', entryPrice: 100, stopLoss: 97, timestamp: '2026-09-01T13:00:00Z' };
    assert.equal(inRunUpPopulation(base), true);
    assert.equal(inRunUpPopulation({ ...base, timestamp: '2026-08-20T13:00:00Z' }), false);
    assert.equal(inRunUpPopulation({ ...base, convergenceSignalsJson: { executionAudit: { version: 1, state: 'pending_trigger' } } }), false);
    assert.equal(inRunUpPopulation({ ...base, resolutionReason: 'missed_entry_would_have_won' }), false);
    assert.equal(inRunUpPopulation({ ...base, assetType: 'option', strikePrice: 100, entryPrice: 3.1 }), false); // premium-scale
    const trig = resolveTrigger({ ...base, convergenceSignalsJson: { executionAudit: { version: 1, state: 'triggered', triggerObservedAt: '2026-09-01T14:05:00Z' } } }, [], Date.now());
    assert.deepEqual(trig, { ms: Date.parse('2026-09-01T14:05:00Z'), source: 'audit' });
  });
  await t('summary counts and label', () => {
    const up = computeRunUp({ direction: 'long', entry: 100, stop: 97, triggerMs: T0, endMs: T0 + 9 * H, bars: mk([[100, 106, 99.5, 105]]) });
    const dn = computeRunUp({ direction: 'long', entry: 100, stop: 97, triggerMs: T0, endMs: T0 + 9 * H, bars: mk([[100, 100.5, 96, 96.5]]) });
    const s = summarizeRunUps([up, dn], '2026-08-26', 3);
    assert.equal(s.triggered, 2); assert.equal(s.reached5BeforeStop, 1); assert.equal(s.rate, 50); assert.equal(s.pending, 3);
    assert.match(s.label, /not the win rate/);
  });

  // ── exit variants ────────────────────────────────────────────────────────
  const X = (bars: RunUpBar[], over: Partial<Parameters<typeof simulateExit>[1]> = {}) =>
    ({ direction: 'long' as const, entry: 100, stop: 97, target: 108, triggerMs: T0, horizonEndMs: T0 + 50 * H, horizonComplete: true, bars, ...over });
  const runThenDump = mk([[100, 102, 99.5, 101.5], [101.5, 105.6, 101, 105], [105, 105.2, 96, 96.5]]);
  await t('actual plan: stop -1R', () => { const r = simulateExit('actual', X(runThenDump)); assert.equal(r.reason, 'stop'); assert.equal(r.r, -1); });
  await t('A: +5% full exit', () => { const r = simulateExit('A', X(runThenDump)); assert.equal(r.reason, 'tp5'); assert.equal(r.r, 1.667); assert.equal(r.pct, 5); });
  await t('B: 1R is nearer than +5% here', () => { const r = simulateExit('B', X(runThenDump)); assert.equal(r.reason, 'tp1R'); assert.equal(r.r, 1); });
  await t('B: +5% nearer when stop is wide', () => { const r = simulateExit('B', X(runThenDump, { stop: 90 })); assert.equal(r.reason, 'tp5'); assert.equal(r.r, 0.5); });
  await t('C: half at +5%, rest stopped at breakeven', () => {
    const r = simulateExit('C', X(runThenDump));
    assert.equal(r.reason, 'breakeven'); assert.equal(r.partial, true); assert.equal(r.r, 0.833); assert.equal(r.pct, 2.5);
  });
  await t('C: half at +5%, rest at T1', () => {
    const r = simulateExit('C', X(mk([[100.3, 105.5, 100.2, 105], [105, 108.5, 104, 108]])));
    assert.equal(r.reason, 'target'); assert.equal(r.r, 2.167); assert.equal(r.pct, 6.5);
  });
  await t('C: same bar books +5% and touches entry → rest at breakeven', () => {
    const r = simulateExit('C', X(mk([[100.5, 105.5, 99.9, 101]])));
    assert.equal(r.reason, 'breakeven'); assert.equal(r.r, 0.833);
  });
  await t('C: trail after partial does not fire on the partial bar low above entry', () => {
    const r = simulateExit('C', X(mk([[101, 105.5, 100.5, 104], [104, 104.5, 99.5, 100]])));
    assert.equal(r.reason, 'breakeven'); assert.equal(r.exitMs, T0 + H);
  });
  await t('C: T1 inside +5% behaves like the plan', () => {
    const r = simulateExit('C', X(mk([[100, 103.2, 99.5, 103]]), { target: 103 }));
    assert.equal(r.reason, 'target'); assert.equal(r.r, 1); assert.equal(r.partial, false);
  });
  await t('stop + tp in one bar = stop (all variants)', () => {
    const bars = mk([[100, 106, 96.9, 100]]);
    for (const v of ['actual', 'A', 'B', 'C'] as const) assert.equal(simulateExit(v, X(bars)).reason, 'stop');
  });
  await t('gap through stop fills at the open', () => {
    const r = simulateExit('A', X(mk([[100, 101, 99.5, 100], [95, 96, 94, 95.5]])));
    assert.equal(r.reason, 'stop'); assert.equal(r.r, -1.667);
  });
  await t('horizon: open vs timed-out', () => {
    const bars = mk([[100, 101, 99.5, 100.9], [100.9, 102, 100.5, 101.5]]);
    assert.equal(simulateExit('A', X(bars, { horizonComplete: false })).reason, 'open');
    const h = simulateExit('A', X(bars)); assert.equal(h.reason, 'horizon'); assert.equal(h.r, 0.5);
  });
  await t('exit stats', () => {
    const s = exitStats([
      simulateExit('A', X(runThenDump)), simulateExit('actual', X(runThenDump)),
      simulateExit('A', X(mk([[100, 101, 99.5, 100.9]]), { horizonComplete: false })),
    ]);
    assert.equal(s.n, 2); assert.equal(s.open, 1); assert.equal(s.wins, 1); assert.equal(s.winRate, 50);
    assert.equal(s.profitFactor, 1.67); assert.equal(s.expectancyR, 0.334);
  });

  // ── replay pipeline on fixtures ────────────────────────────────────────
  await t('replay-tp5 fixtures', async () => {
    const fx = loadFixtures(path.resolve('research/fixtures/replay-tp5.fixture.json'));
    const rep = await runReplay(fx.ideas, fx.getBars, { mode: 'fixtures', nowMs: fx.nowMs });
    assert.equal(rep.population, 2); // pending + pre-baseline excluded
    assert.equal(rep.triggered, 2);
    const aapl = rep.rows.find((r) => r.id === 'fx-aapl-long')!;
    assert.equal(aapl.triggerSource, 'audit');
    assert.equal(aapl.reached5, true);
    assert.equal(aapl.exits.actual.reason, 'stop');
    assert.equal(aapl.exits.A.reason, 'tp5');
    const tsla = rep.rows.find((r) => r.id === 'fx-tsla-short')!;
    assert.equal(tsla.triggerSource, 'bars');
    assert.equal(tsla.reached5, false); // +5.5% and the stop in one bar → stop first
    assert.equal(tsla.exits.A.reason, 'stop');
    const md = renderReport(rep);
    assert.match(md, /HYPOTHETICAL/); assert.match(md, /FIXTURE RUN/); assert.match(md, /Walk-forward halves/);
  });

  console.log(`run-up: ${n} tests passed`);
})().catch((e) => { console.error(e); process.exit(1); });
