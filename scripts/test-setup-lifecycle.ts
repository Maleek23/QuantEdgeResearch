/**
 * Carry-over policy — shared/setup-lifecycle.ts (docs/SETUP_LIFECYCLE.md) and the
 * NEXUS day filter. Pure; run with `npm run test:setup-lifecycle`.
 * Dates: 2026-10-01 is a Thursday; New York is UTC−4 (EDT). 2026-09-07 is Labor Day.
 */
import assert from 'node:assert/strict';
import {
  setupLifecycle, matchesDay, dayHeading, filterBoardByDay, sinkByLifecycle, windowFor,
  sessionDayOf, prevTradingDay, nthSession, etDay, closeMs, type LifecycleInput, type SetupLifecycle,
} from '../shared/setup-lifecycle';
import { compareBoardRows } from '../shared/board-sort';
import { pmSetupHref, pmSetupLabel, pmSetupIsIdea } from '../client/src/lib/premarket';

let n = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++; };
const eq = <T>(a: T, b: T, m: string) => { assert.equal(a, b, m); n++; };
const at = (iso: string) => Date.parse(iso);
const NOW = at('2026-10-01T11:35:00Z'); // Thu 07:35 ET — the operator's read

// QCOM as read in prod: market_scanner long option, published Tue 2026-09-29 15:09 ET.
const qcom: LifecycleInput = {
  direction: 'long', entryPrice: 150, stopLoss: 145, targetPrice: 160,
  assetType: 'option', holdingPeriod: 'swing', source: 'market_scanner', expiryDate: '2026-10-16',
  calledAt: '2026-09-29T19:09:00Z', lifecycleState: 'pending_trigger', currentPrice: 151,
};

// ── calendar helpers ──
eq(sessionDayOf(at('2026-09-29T19:09:00Z')), '2026-09-29', 'in-session publish → same session');
eq(sessionDayOf(at('2026-09-29T21:30:00Z')), '2026-09-30', 'after-close publish → next session');
eq(sessionDayOf(at('2026-10-03T15:00:00Z')), '2026-10-05', 'Saturday publish → Monday');
eq(prevTradingDay('2026-10-05'), '2026-10-02', 'Monday’s previous session is Friday');
eq(prevTradingDay('2026-09-08'), '2026-09-04', 'skips Labor Day');
eq(nthSession('2026-09-04', 5), '2026-09-11', 'swing from Fri Sep 4 spans Labor Day');
eq(etDay(closeMs('2026-10-01')), '2026-10-01', 'close is on its own ET day');
eq(new Date(closeMs('2026-10-01')).toISOString(), '2026-10-01T20:00:00.000Z', '16:00 EDT = 20:00Z');

// ── QCOM: carried, session 3 of 5, window to Mon Oct 5 close ──
{
  const r = setupLifecycle(qcom, NOW);
  eq(r.state, 'carried', 'QCOM is carried on Thu');
  eq(r.session, 3, 'Tue=1 Wed=2 Thu=3');
  eq(r.sessions, 5, 'swing = 5 sessions');
  eq(r.windowEndsMs, closeMs('2026-10-05'), 'window ends Mon Oct 5 close');
  eq(r.publishedDay, '2026-09-29', 'publish day ET');
  eq(r.moveUnit, 'risk', 'no ATR on the row → the idea’s own risk is the unit');
  eq(setupLifecycle(qcom, at('2026-09-29T19:30:00Z')).state, 'fresh', 'FRESH on its publish day');
  eq(setupLifecycle(qcom, at('2026-10-05T20:00:00Z')).state, 'stale', 'STALE at the 5th close');
}

// ── entry far away without a fill ──
eq(setupLifecycle({ ...qcom, currentPrice: 155.5 }, NOW).state, 'stale', 'ran 1.1R past entry, no fill → stale');
eq(setupLifecycle({ ...qcom, currentPrice: 155.5, triggeredAt: '2026-09-30T14:00:00Z' }, NOW).state, 'carried', 'triggered ideas are not "far from entry"');
eq(setupLifecycle({ ...qcom, currentPrice: 155.5, atr: 8 }, NOW).state, 'carried', 'ATR unit when the row carries one (5.5 < 8)');
{
  const r = setupLifecycle({ ...qcom, currentPrice: 155.5, atr: 4 }, NOW);
  eq(r.state, 'stale', '5.5 > 1×ATR(4) → stale');
  ok(/1\.4×ATR/.test(r.reason) && r.moveUnit === 'atr', `ATR reason: ${r.reason}`);
}
eq(setupLifecycle({ ...qcom, currentPrice: 140 + 9 }, NOW).state, 'carried', 'below entry, above stop → still carried');

// ── RESOLVED ──
eq(setupLifecycle({ ...qcom, currentPrice: 144.9 }, NOW).state, 'resolved', 'through the stop');
eq(setupLifecycle({ ...qcom, currentPrice: 160.2, triggeredAt: '2026-09-30T14:00:00Z' }, NOW).state, 'resolved', 'at the target');
eq(setupLifecycle({ ...qcom, lifecycleState: 'closed' }, NOW).state, 'resolved', 'closed plan');
{
  const short: LifecycleInput = { direction: 'short', entryPrice: 100, stopLoss: 105, targetPrice: 90, holdingPeriod: 'swing', calledAt: '2026-09-30T15:00:00Z' };
  eq(setupLifecycle({ ...short, currentPrice: 106 }, NOW).state, 'resolved', 'short: above the stop');
  eq(setupLifecycle({ ...short, currentPrice: 94 }, NOW).state, 'stale', 'short: ran 1.2R down without a fill');
  eq(setupLifecycle({ ...short, currentPrice: 99 }, NOW).state, 'carried', 'short: near entry');
}

// ── day trades / 0DTE expire at that day's close ──
{
  const day: LifecycleInput = { direction: 'long', entryPrice: 50, stopLoss: 49, targetPrice: 52, holdingPeriod: 'day', assetType: 'stock', calledAt: '2026-10-01T14:00:00Z' };
  eq(setupLifecycle(day, at('2026-10-01T15:00:00Z')).state, 'fresh', 'day trade, same day');
  eq(setupLifecycle(day, at('2026-10-01T20:01:00Z')).state, 'stale', 'day trade after the close');
  eq(setupLifecycle({ ...day, calledAt: '2026-09-30T14:00:00Z' }, NOW).state, 'stale', 'yesterday’s day trade is stale today');
  const after = setupLifecycle({ ...day, calledAt: '2026-09-30T21:00:00Z' }, at('2026-10-01T15:00:00Z'));
  eq(after.state, 'carried', 'after-close day trade lives through the next session');
  eq(after.windowEndsMs, closeMs('2026-10-01'), '…to that session’s close');
  const zero: LifecycleInput = { ...day, holdingPeriod: 'swing', assetType: 'option', expiryDate: '2026-10-01' };
  const z = windowFor(zero, at('2026-10-01T14:00:00Z'));
  eq(z.basis, '0dte', '0DTE whatever the holding period says');
  eq(z.endMs, closeMs('2026-10-01'), '0DTE ends today');
  eq(setupLifecycle(zero, at('2026-10-01T20:30:00Z')).state, 'stale', '0DTE past the close');
}

// ── option DTE < remaining hold (carried only) ──
{
  const shortDated: LifecycleInput = { ...qcom, expiryDate: '2026-10-02' };
  const r = setupLifecycle(shortDated, NOW);
  eq(r.state, 'stale', 'carried swing on a Fri-expiry contract needs Mon too');
  ok(/contract has 2 sessions left, the swing hold needs 3/.test(r.reason), `reason names both: ${r.reason}`);
  eq(setupLifecycle({ ...shortDated, calledAt: '2026-10-01T14:00:00Z', currentPrice: 150 }, at('2026-10-01T15:00:00Z')).state, 'fresh', 'a fresh idea is not re-judged on DTE');
  eq(setupLifecycle({ ...qcom, expiryDate: '2026-09-30' }, NOW).state, 'stale', 'expired contract → stale');
  ok(/contract expired/.test(setupLifecycle({ ...qcom, expiryDate: '2026-09-30' }, NOW).reason), 'expired reason');
}

// ── position / week-ending / exit_by / entry window / crypto ──
{
  const pos: LifecycleInput = { direction: 'long', entryPrice: 10, stopLoss: 9, targetPrice: 14, holdingPeriod: 'position', calledAt: '2026-09-15T14:00:00Z' };
  eq(windowFor(pos, at('2026-09-15T14:00:00Z')).endMs, closeMs(nthSession('2026-09-15', 20)), 'position = 20 sessions');
  eq(setupLifecycle(pos, NOW).state, 'carried', 'position idea from Sep 15 still carried');
  const wk: LifecycleInput = { ...pos, holdingPeriod: 'week-ending', calledAt: '2026-09-29T14:00:00Z' };
  eq(windowFor(wk, at('2026-09-29T14:00:00Z')).endMs, closeMs('2026-10-02'), 'week-ending → Friday close');
  eq(setupLifecycle({ ...pos, exitBy: '2026-09-30T20:00:00Z' }, NOW).state, 'stale', 'exit_by overrides the window');
  eq(setupLifecycle({ ...qcom, entryValidUntil: '2026-09-30T15:00:00Z' }, NOW).state, 'stale', 'entry window closed, no trigger');
  eq(setupLifecycle({ ...qcom, entryValidUntil: '2026-09-30T15:00:00Z', triggeredAt: '2026-09-30T14:00:00Z' }, NOW).state, 'carried', 'triggered before the entry window closed');
  const btc: LifecycleInput = { direction: 'long', entryPrice: 60000, stopLoss: 59000, targetPrice: 63000, assetType: 'crypto', source: 'crypto_engine', holdingPeriod: 'day', calledAt: '2026-09-30T13:00:00Z' };
  eq(setupLifecycle(btc, at('2026-10-01T12:00:00Z')).state, 'carried', 'crypto day = 24h calendar (23h in)');
  eq(setupLifecycle(btc, at('2026-10-01T13:30:00Z')).state, 'stale', 'crypto day past 24h');
}

// ── day filter ──
{
  eq(matchesDay('2026-10-01', 'today', NOW), true, 'today');
  eq(matchesDay('2026-09-30', 'yesterday', NOW), true, 'yesterday = previous session');
  eq(matchesDay('2026-10-02', 'yesterday', at('2026-10-05T14:00:00Z')), true, 'Monday’s yesterday is Friday');
  eq(matchesDay('2026-09-28', 'week', NOW), true, 'Monday is this week');
  eq(matchesDay('2026-09-25', 'week', NOW), false, 'last Friday is not');
  eq(matchesDay('2026-09-29', '2026-09-29', NOW), true, 'date picker');
  eq(matchesDay(null, 'all', NOW), true, 'ALL keeps undated');
  eq(dayHeading('2026-10-01', NOW), 'Today', 'heading today');
  eq(dayHeading('2026-09-30', NOW), 'Yesterday · Wed, Sep 30', 'heading yesterday');
  eq(dayHeading('2026-09-29', NOW), 'Tue, Sep 29', 'heading older day');

  type R = { id: string; day: string | null; st: SetupLifecycle };
  const rows: R[] = [
    { id: 'a', day: '2026-10-01', st: 'fresh' }, { id: 'b', day: '2026-10-01', st: 'stale' },
    { id: 'c', day: '2026-09-30', st: 'carried' }, { id: 'd', day: '2026-09-29', st: 'carried' },
    { id: 'e', day: '2026-09-25', st: 'stale' },
  ];
  const run = (day: string, showStale = false) => filterBoardByDay(rows, { dayOf: (r) => r.day, stateOf: (r) => r.st, day, showStale, nowMs: NOW });
  const t = run('today');
  assert.deepEqual(t.rows.map((r) => r.id), ['a'], 'TODAY hides stale'); n++;
  eq(t.staleHidden, 1, 'one stale hidden');
  assert.deepEqual(run('today', true).rows.map((r) => r.id), ['a', 'b'], 'show stale'); n++;
  assert.deepEqual(t.counts, { today: 1, yesterday: 1, week: 4, all: 5 }, 'chip counts'); n++;
  const all = run('all');
  assert.deepEqual(all.groups.map(([d, l]) => [d, l.length]), [['2026-10-01', 2], ['2026-09-30', 1], ['2026-09-29', 1], ['2026-09-25', 1]], 'grouped newest day first'); n++;
  eq(run('2026-09-29').rows[0]?.id, 'd', 'picked day');
}

// ── order: server rank, then stale/resolved sink (stable) ──
{
  const rows = [
    { ideaId: 'new-stale', convictionScore: 50, boardRank: 0, st: 'stale' as SetupLifecycle },
    { ideaId: 'new', convictionScore: 40, boardRank: 1, st: 'fresh' as SetupLifecycle },
    { ideaId: 'qcom', convictionScore: 80, boardRank: 2, st: 'carried' as SetupLifecycle },
    { ideaId: 'done', convictionScore: 90, boardRank: 3, st: 'resolved' as SetupLifecycle },
  ];
  const sorted = sinkByLifecycle([...rows].sort(compareBoardRows), (r) => r.st).map((r) => r.ideaId);
  assert.deepEqual(sorted, ['new', 'qcom', 'new-stale', 'done'], 'fresh/carried keep server order, stale then resolved sink'); n++;
}

// ── pre-market WATCH plans are not NEXUS ideas ──
{
  const watch = { kinds: ['gap_and_go'], status: 'watch' as const, ideaId: null, summary: 'QCOM +2.4%' };
  const trig = { ...watch, status: 'triggered' as const, ideaId: 'abc' };
  eq(pmSetupIsIdea(watch), false, 'watch is not an idea');
  eq(pmSetupHref('QCOM', watch), '/r/QCOM', 'watch links to the ticker');
  ok(/not a NEXUS idea/.test(pmSetupLabel(watch)), 'watch says so');
  eq(pmSetupHref('QCOM', trig), '/t?idea=abc&sym=QCOM', 'triggered links to NEXUS');
  eq(pmSetupHref('QCOM', { ...trig, ideaId: null }), '/r/QCOM', 'triggered without an id is still not linkable');
}

console.log(`setup lifecycle: ${n} checks passed`);
