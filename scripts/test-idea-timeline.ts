/**
 * Unit tests for the NEXUS idea timeline (shared/idea-timeline.ts) and the
 * board called-time range filter (shared/board-time-range.ts). All rows and
 * bars are SYNTHETIC fixtures.
 *   npm run -s test:idea-timeline
 */
import assert from 'node:assert/strict';
import { buildIdeaTimeline, detectReplayCrossings, fmtEt, replayBarPlan, type TimelineIdea } from '../shared/idea-timeline';
import { filterByCalledRange, etLocalToIso, isoToEtLocal, calledMsOf } from '../shared/board-time-range';

let n = 0;
const t = (name: string, fn: () => void) => {
  try { fn(); n++; console.log(`PASS ${name}`); } catch (e) { console.error(`FAIL ${name}`); throw e; }
};

const base: TimelineIdea = {
  id: 'i1', symbol: 'NVDA', assetType: 'stock', direction: 'long',
  entryPrice: 100, targetPrice: 110, stopLoss: 95,
  timestamp: '2026-10-01T14:05:00.000Z', source: 'quant', outcomeStatus: 'open',
};
const audit = (extra: Record<string, unknown> = {}) => ({ executionAudit: { version: 1, state: 'triggered', triggerPrice: 100, triggerObservedAt: '2026-10-01T15:00:00.000Z', triggerObservedPrice: 100.4, ...extra } });
const byKind = (tl: ReturnType<typeof buildIdeaTimeline>, k: string) => tl.events.find((e) => e.kind === k)!;

// ── timeline ───────────────────────────────────────────────────────────────
t('open idea, no trigger: only publish is recorded; levels are levels, not prices', () => {
  const tl = buildIdeaTimeline(base, Date.parse('2026-10-01T16:00:00Z'));
  assert.equal(byKind(tl, 'published').status, 'recorded');
  assert.equal(byKind(tl, 'published').atEt, fmtEt(Date.parse(base.timestamp!)));
  assert.match(byKind(tl, 'published').atEt!, /ET$/);
  assert.equal(byKind(tl, 'trigger').status, 'pending');
  assert.equal(byKind(tl, 'trigger').at, null);
  assert.equal(byKind(tl, 't1').status, 'pending');
  assert.equal(byKind(tl, 't1').price, null);
  assert.equal(byKind(tl, 't1').level, 110);
  assert.equal(byKind(tl, 'stop').level, 95);
  assert.equal(byKind(tl, 'exit').status, 'pending');
  assert.equal(byKind(tl, 't2').status, 'not_applicable');
});

t('triggered: observer pass time + observed price, labelled as not a fill', () => {
  const tl = buildIdeaTimeline({ ...base, convergenceSignalsJson: audit() });
  const e = byKind(tl, 'trigger');
  assert.equal(e.status, 'recorded');
  assert.equal(e.at, '2026-10-01T15:00:00.000Z');
  assert.equal(e.price, 100.4);
  assert.equal(e.timeBasis, 'observer_pass');
  assert.match(e.source, /triggerObservedAt/);
  assert.match(e.note!, /not a fill/);
});

t('hit_target with bar_hit tag: T1 + exit recorded at exit_date, stop not reached', () => {
  const tl = buildIdeaTimeline({
    ...base, convergenceSignalsJson: audit(), outcomeStatus: 'hit_target', resolutionReason: 'auto_target_hit',
    exitDate: '2026-10-02T10:15:00-05:00', exitPrice: 110, percentGain: 10, outcomeNotes: '[exit-time:bar_hit] 5m bar',
  });
  const t1 = byKind(tl, 't1');
  assert.equal(t1.status, 'recorded');
  assert.equal(t1.at, '2026-10-02T15:15:00.000Z'); // Chicago offset parsed
  assert.equal(t1.price, 110);
  assert.equal(t1.timeBasis, 'bar_hit');
  assert.equal(byKind(tl, 'stop').status, 'not_reached');
  const ex = byKind(tl, 'exit');
  assert.equal(ex.status, 'recorded');
  assert.match(ex.note!, /\+10\.0%/);
  // chronological: published, trigger, then T1/exit
  assert.deepEqual(tl.events.filter((e) => e.status === 'recorded').map((e) => e.kind), ['published', 'trigger', 't1', 'exit']);
});

t('hit_stop tagged live = tracker cycle, hit time unknown', () => {
  const tl = buildIdeaTimeline({ ...base, outcomeStatus: 'hit_stop', exitDate: '2026-10-02T11:40:00-05:00', exitPrice: 94.8, outcomeNotes: '[exit-time:live] polled' });
  const s = byKind(tl, 'stop');
  assert.equal(s.status, 'recorded');
  assert.equal(s.timeBasis, 'tracker_cycle');
  assert.match(s.note!, /hit time unknown/);
  assert.equal(byKind(tl, 't1').status, 'not_reached');
  // closed with no audit → trigger not recorded (never guessed)
  assert.equal(byKind(tl, 'trigger').status, 'not_recorded');
  assert.equal(byKind(tl, 'trigger').at, null);
  assert.ok(tl.notes.some((x) => /cycle time/.test(x)));
});

t('missed entry: trigger not reached', () => {
  const tl = buildIdeaTimeline({ ...base, outcomeStatus: 'expired', resolutionReason: 'missed_entry_window', exitDate: '2026-10-01T15:00:00-05:00' });
  assert.equal(byKind(tl, 'trigger').status, 'not_reached');
});

t('closed but exit_date missing → not recorded, no time invented', () => {
  const tl = buildIdeaTimeline({ ...base, outcomeStatus: 'hit_target', exitDate: null, exitPrice: 110 });
  assert.equal(byKind(tl, 't1').status, 'not_recorded');
  assert.equal(byKind(tl, 't1').at, null);
  assert.equal(byKind(tl, 'exit').status, 'not_recorded');
});

t('option idea: premiums carried, underlying note present', () => {
  const tl = buildIdeaTimeline({
    ...base, assetType: 'option', optionType: 'call', strikePrice: 105, expiryDate: '2026-10-17',
    entryPremium: 2.4, exitPremium: 4.1, optionPercentGain: 70.8,
    outcomeStatus: 'hit_target', exitDate: '2026-10-02T10:15:00-05:00', exitPrice: 110, outcomeNotes: '[exit-time:bar_hit]',
  });
  assert.equal(tl.isOption, true);
  assert.deepEqual(tl.contract, { optionType: 'call', strike: 105, expiry: '2026-10-17' });
  assert.equal(byKind(tl, 'published').premium, 2.4);
  assert.equal(byKind(tl, 't1').premium, 4.1);
  assert.match(byKind(tl, 'exit').note!, /option_percent_gain/);
  assert.ok(tl.notes.some((x) => /UNDERLYING/.test(x)));
});

t('paper execution appears only when recorded', () => {
  const none = buildIdeaTimeline(base);
  assert.equal(none.events.some((e) => e.kind === 'execution'), false);
  const paper = buildIdeaTimeline({ ...base, convergenceSignalsJson: audit({ state: 'executed', executionRecordedAt: '2026-10-01T15:01:00Z', executionPrice: 100.5, executionVenue: 'paper' }) });
  const e = paper.events.find((x) => x.kind === 'execution')!;
  assert.equal(e.status, 'recorded');
  assert.equal(e.price, 100.5);
});

// ── replay-detected crossings ──────────────────────────────────────────────
const T0 = Date.parse('2026-10-01T14:00:00Z');
const M = 60_000;
const bars = (rows: [number, number, number, number][]) => rows.map(([o, h, l, c], k) => ({ t: T0 + k * M, open: o, high: h, low: l, close: c }));
t('crossings: trigger then T1', () => {
  const b = bars([[98, 99, 97, 98.5], [98.5, 100.2, 98.4, 100], [100, 111, 99.9, 110.5]]);
  const c = detectReplayCrossings(b, { direction: 'long', entry: 100, target: 110, stop: 95 }, T0);
  assert.deepEqual(c.map((x) => x.kind), ['trigger', 't1']);
  assert.equal(c[0].t, T0 + M);
});
t('crossings: same bar T1 + stop = stop', () => {
  const b = bars([[100, 100.5, 99.5, 100], [100, 111, 94, 100]]);
  const c = detectReplayCrossings(b, { direction: 'long', entry: 100, target: 110, stop: 95 }, T0);
  assert.deepEqual(c.map((x) => x.kind), ['trigger', 'stop']);
});
t('crossings: short mirrored; recorded trigger time starts the barrier search', () => {
  const b = bars([[101, 101.5, 100.5, 101], [101, 106, 99, 100], [100, 100.2, 89, 90]]);
  const c = detectReplayCrossings(b, { direction: 'short', entry: 100, target: 90, stop: 105 }, T0, Infinity, T0 + 2 * M);
  assert.deepEqual(c.map((x) => x.kind), ['trigger', 't1']); // stop bar at T0+M precedes the recorded trigger
});
t('crossings: never triggered → empty', () => {
  assert.deepEqual(detectReplayCrossings(bars([[98, 99, 97, 98]]), { direction: 'long', entry: 100, target: 110, stop: 95 }, T0), []);
});

t('replayBarPlan picks the finest interval the feed holds', () => {
  const now = Date.parse('2026-10-06T16:00:00Z');
  assert.equal(replayBarPlan(now - 2 * 86_400_000, now).interval, '1m');
  assert.equal(replayBarPlan(now - 20 * 86_400_000, now).interval, '5m');
  assert.equal(replayBarPlan(now - 50 * 86_400_000, now).interval, '1h');
  assert.equal(replayBarPlan(now - 200 * 86_400_000, now).interval, '1d');
});

// ── called-time range ──────────────────────────────────────────────────────
const picks = [
  { id: 'a', calledAt: '2026-10-06T13:35:00Z', generatedAt: '2026-10-06T20:00:00Z' }, // 09:35 ET
  { id: 'b', calledAt: null, generatedAt: '2026-10-06T15:00:00Z' },                   // 11:00 ET (fallback)
  { id: 'c', calledAt: '2026-10-05T19:00:00Z', generatedAt: null },                   // prev day 15:00 ET
  { id: 'd', calledAt: 'garbage', generatedAt: null },                                // unknown time
];
t('filterByCalledRange: no bounds returns every pick (same array)', () => {
  assert.equal(filterByCalledRange(picks, null, null), picks);
});
t('filterByCalledRange: calledAt wins over generatedAt; generatedAt is the fallback', () => {
  assert.equal(calledMsOf(picks[0]), Date.parse('2026-10-06T13:35:00Z'));
  assert.equal(calledMsOf(picks[1]), Date.parse('2026-10-06T15:00:00Z'));
  assert.equal(calledMsOf(picks[3]), null);
});
t('filterByCalledRange: inclusive bounds, unknown times excluded', () => {
  const ids = (r: typeof picks) => r.map((p) => p.id);
  assert.deepEqual(ids(filterByCalledRange(picks, '2026-10-06T13:35:00Z', '2026-10-06T15:00:00Z')), ['a', 'b']);
  assert.deepEqual(ids(filterByCalledRange(picks, '2026-10-06T13:36:00Z', null)), ['b']);
  assert.deepEqual(ids(filterByCalledRange(picks, null, '2026-10-06T00:00:00Z')), ['c']);
  assert.deepEqual(ids(filterByCalledRange(picks, 'not a date', null)), ids(picks));
});
t('ET local ⇄ ISO (EDT and EST, end-of-minute)', () => {
  assert.equal(etLocalToIso('2026-10-06T09:30'), '2026-10-06T13:30:00.000Z');
  assert.equal(etLocalToIso('2026-12-01T09:30'), '2026-12-01T14:30:00.000Z');
  assert.equal(etLocalToIso('2026-10-06T09:30', true), '2026-10-06T13:30:59.999Z');
  assert.equal(etLocalToIso(''), null);
  assert.equal(isoToEtLocal('2026-10-06T13:30:00.000Z'), '2026-10-06T09:30');
  assert.equal(isoToEtLocal(null), '');
  // the control round-trip feeds the filter
  const from = etLocalToIso('2026-10-06T09:00'); const to = etLocalToIso('2026-10-06T10:00', true);
  assert.deepEqual(filterByCalledRange(picks, from, to).map((p) => p.id), ['a']);
});

console.log(`\n${n} idea-timeline tests passed`);
