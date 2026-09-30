/**
 * Exit time = hit time (shared/exit-hit-time.ts), validator deadline stamps,
 * the backlog repair planner + script (fixture/dry-run only), the journal day
 * mapping, and live marks for open journal trades (server/journal-marks.ts).
 *   npm run test:exit-dates
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  firstLevelTouch, firstBarrierTouch, planExitTiming, formatExitDate, barBefore, type TimedBar, type ExitTimingIdea,
  isHitTimeUnknown, unresolvedExitLabel, HIT_TIME_UNKNOWN,
} from '../shared/exit-hit-time';
import { coversEntry } from '../server/lib/exit-time-bars';
import { PerformanceValidator } from '../server/performance-validator';
import { planRepairs, formatRepairTable, type RepairRow } from '../server/lib/exit-date-repair';
import { mapDeskIdea } from '../server/journal-row-maps';
import { journalDayKey } from '../shared/journal-filters';
import { liveMarksFor, cachedQuote, instrumentKey, _clearMarkCache, MARK_TTL_MS, type MarkQuote } from '../server/journal-marks';

let n = 0;
const tests: Array<[string, () => void | Promise<void>]> = [];
const t = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const S = (iso: string) => Date.parse(iso) / 1000;
const bar = (iso: string, low: number, high: number, close = (low + high) / 2): TimedBar => ({ time: S(iso), open: close, high, low, close });
const ENTRY = '2026-09-15T14:00:00Z';
const idea: ExitTimingIdea = { symbol: 'AAPL', timestamp: ENTRY, entryPrice: 100, targetPrice: 110, stopLoss: 95, direction: 'long', entryMs: Date.parse(ENTRY) };
const NOW = Date.parse('2026-09-30T12:43:00Z');
const bars = [
  bar('2026-09-15T13:55:00Z', 94, 111), // BEFORE entry — both levels, must be ignored
  bar('2026-09-15T14:00:00Z', 99, 101),
  bar('2026-09-16T15:30:00Z', 100, 110.5), // target first
  bar('2026-09-18T15:00:00Z', 94.5, 100), // stop later
];

// ── E1: hit-time detection ───────────────────────────────────────────────
t('first bar after entry crossing the target is the exit time', () => {
  const b = firstLevelTouch(bars, { direction: 'long', kind: 'target', level: 110, fromSec: idea.entryMs / 1000 });
  assert.equal(b?.time, S('2026-09-16T15:30:00Z'));
  const p = planExitTiming(idea, { outcomeStatus: 'hit_target', exitPrice: 110 }, bars, NOW, { barInterval: '5m' });
  assert.equal(p.source, 'bar_hit');
  assert.equal(p.exitDate, formatExitDate(Date.parse('2026-09-16T15:30:00Z')));
  assert.equal(p.exitDate, '2026-09-16T10:30:00-05:00'); // Chicago format kept
  assert.equal(p.exitPrice, undefined); // level price is kept by the caller
  assert.equal(p.holdingMinutes, (Date.parse('2026-09-16T15:30:00Z') - Date.parse(ENTRY)) / 60_000);
});
t('stop decided → first stop-crossing bar, and a target-first path is flagged', () => {
  const p = planExitTiming(idea, { outcomeStatus: 'hit_stop' }, bars, NOW);
  assert.equal(p.exitMs, Date.parse('2026-09-18T15:00:00Z'));
  assert.match(p.note, /path touched the target first/);
});
t('target and stop inside the same bar → stop (existing convention)', () => {
  const same = [bar('2026-09-16T15:30:00Z', 94, 111)];
  const f = firstBarrierTouch(same, { direction: 'long', target: 110, stop: 95, fromSec: idea.entryMs / 1000 });
  assert.equal(f?.outcome, 'hit_stop');
  assert.equal(f?.sameBar, true);
});
t('short direction reads the inverse sides', () => {
  const sh: ExitTimingIdea = { ...idea, direction: 'short', targetPrice: 90, stopLoss: 105 };
  const b = [bar('2026-09-16T15:00:00Z', 95, 106), bar('2026-09-17T15:00:00Z', 89, 99)];
  assert.equal(firstBarrierTouch(b, { direction: 'short', target: 90, stop: 105, fromSec: sh.entryMs / 1000 })?.outcome, 'hit_stop');
  assert.equal(firstLevelTouch(b, { direction: 'short', kind: 'target', level: 90, fromSec: sh.entryMs / 1000 })?.time, S('2026-09-17T15:00:00Z'));
});
t('no bar crossed the level → live (now), with the reason', () => {
  const p = planExitTiming(idea, { outcomeStatus: 'hit_target' }, [bar('2026-09-16T15:30:00Z', 100, 105)], NOW);
  assert.equal(p.source, 'live'); assert.equal(p.exitMs, NOW); assert.ok(p.unresolved);
});
t('deadline outcome → deadline time, repriced at the last bar close before it', () => {
  const deadline = Date.parse('2026-09-22T20:00:00Z');
  const b = [bar('2026-09-22T19:55:00Z', 101, 103, 102.5), bar('2026-09-23T14:00:00Z', 90, 91, 90)];
  assert.equal(barBefore(b, deadline / 1000)?.close, 102.5);
  const p = planExitTiming(idea, { outcomeStatus: 'expired', resolutionReason: 'auto_expired', deadlineMs: deadline }, b, NOW);
  assert.equal(p.source, 'deadline');
  assert.equal(p.exitDate, formatExitDate(deadline));
  assert.equal(p.exitPrice, 102.5);
  assert.equal(Math.round(p.percentGain! * 100) / 100, 2.5);
});
t('deadline is never stamped in the future', () => {
  const p = planExitTiming(idea, { outcomeStatus: 'expired', resolutionReason: 'auto_expired', deadlineMs: NOW + 86_400_000 }, [], NOW);
  assert.equal(p.exitMs, NOW);
});

// ── 2026-09-30: five gex_scanner option exits all stamped 11:40 ET ──────
// One tracker pass graded stops that printed earlier. With bars, each exit
// gets its own touch bar; without, it is labelled, not passed off as the hit.
const CYCLE = Date.parse('2026-09-30T15:40:23Z'); // 11:40:23 ET — the pass
t('one tracker pass, five earlier stop touches → five distinct bar times, none = cycle', () => {
  const touches = ['2026-09-30T13:35:00Z', '2026-09-30T14:05:00Z', '2026-09-30T14:20:00Z', '2026-09-30T14:50:00Z', '2026-09-30T15:10:00Z'];
  const out = touches.map((touch, k) => {
    const put: ExitTimingIdea = { symbol: `S${k}`, timestamp: '2026-09-30T07:40:00Z', entryPrice: 100, targetPrice: 95, stopLoss: 102,
      direction: 'short', entryMs: Date.parse('2026-09-30T07:40:00Z') };
    const bs = [bar('2026-09-30T13:30:00Z', 99.5, 100.5), bar(touch, 100.5, 102.2), bar('2026-09-30T15:35:00Z', 101, 103)];
    return planExitTiming(put, { outcomeStatus: 'hit_stop' }, bs, CYCLE, { barInterval: '5m' });
  });
  assert.deepEqual(out.map((p) => p.source), Array(5).fill('bar_hit'));
  assert.deepEqual(out.map((p) => p.exitMs), touches.map((x) => Date.parse(x)));
  assert.ok(out.every((p) => p.exitMs !== CYCLE));
});
t('barrier hit with no touching bar → labelled "resolved at <cycle> (hit time unknown)"', () => {
  const p = planExitTiming(idea, { outcomeStatus: 'hit_stop' }, [bar('2026-09-30T14:00:00Z', 99, 101)], CYCLE, { barInterval: '5m' });
  assert.equal(p.source, 'live');
  assert.equal(unresolvedExitLabel(CYCLE), 'resolved at 2026-09-30 11:40 ET (hit time unknown)');
  assert.match(p.note, /^\[exit-time:live\] resolved at 2026-09-30 11:40 ET \(hit time unknown\) — no 5m bar since entry crossed the stop 95/);
  // deadline / non-barrier fallbacks keep their own wording
  const q = planExitTiming(idea, { outcomeStatus: 'expired' }, [], CYCLE);
  assert.ok(!q.note.includes(HIT_TIME_UNKNOWN));
  assert.ok(isHitTimeUnknown('hit_stop', 'live') && isHitTimeUnknown('hit_target', 'live'));
  assert.ok(!isHitTimeUnknown('hit_stop', 'bar_hit') && !isHitTimeUnknown('expired', 'live') && !isHitTimeUnknown('hit_stop', null));
});
t('extended-hours print: the touch is found in the extended series', () => {
  const put: ExitTimingIdea = { symbol: 'CRM', timestamp: '2026-09-30T07:40:00Z', entryPrice: 230, targetPrice: 220, stopLoss: 234,
    direction: 'short', entryMs: Date.parse('2026-09-30T07:40:00Z') };
  const rth = [bar('2026-09-30T13:30:00Z', 229, 233)];
  const ext = [bar('2026-09-30T11:15:00Z', 231, 234.5), ...rth];
  assert.equal(planExitTiming(put, { outcomeStatus: 'hit_stop' }, rth, CYCLE).source, 'live');
  const e = planExitTiming(put, { outcomeStatus: 'hit_stop' }, ext, CYCLE, { barInterval: '5m extended-hours' });
  assert.equal(e.source, 'bar_hit'); assert.equal(e.exitMs, Date.parse('2026-09-30T11:15:00Z'));
});
t('5m coverage is judged on the unfiltered series', () => {
  const entry = Date.parse('2026-09-30T08:02:00Z'); // 04:02 ET pre-market
  assert.ok(coversEntry([bar('2026-09-30T08:00:00Z', 1, 2), bar('2026-09-30T13:30:00Z', 1, 2)], entry));
  assert.ok(!coversEntry([bar('2026-09-30T13:30:00Z', 1, 2)], entry), 'RTH-only first-day bars would not cover a pre-market entry');
});
t('journal desk row: unknown hit time is shown as such, known hit time is not', () => {
  const base = {
    id: 'd9', symbol: 'CRM', assetType: 'option', direction: 'short', entryPrice: 230, targetPrice: 220, stopLoss: 234, riskRewardRatio: 2,
    optionType: 'put', strikePrice: 220, expiryDate: '2026-11-20', entryPremium: 10.2, exitPremium: 8.1, optionPercentGain: null,
    exitPrice: 234, percentGain: -1.7, outcomeStatus: 'hit_stop', resolutionReason: 'auto_stop_hit',
    exitDate: formatExitDate(CYCLE), timestamp: '2026-09-30T07:40:00Z', source: 'gex_scanner', catalyst: null, genConvictionBand: null,
  };
  const live = (mapDeskIdea({ ...base, exitTimeSource: 'live' }) as any).row;
  assert.equal(live.exitTimeNote, 'resolved at 2026-09-30 11:40 ET (hit time unknown)');
  assert.match(live.notes, /exit time: resolved at 2026-09-30 11:40 ET \(hit time unknown\)/);
  assert.equal((mapDeskIdea({ ...base, exitTimeSource: 'bar_hit' }) as any).row.exitTimeNote, undefined);
  assert.equal((mapDeskIdea({ ...base }) as any).row.exitTimeNote, undefined, 'untagged legacy rows are not guessed at');
});

t('service wiring: extended-hours retry, and a failed lookup is labelled, not silent', () => {
  const src = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '../server/performance-validation-service.ts'), 'utf8');
  assert.match(src, /extendedBars\?\.length && isHitTimeUnknown/);
  assert.match(src, /bar lookup failed/);
  const js = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '../server/journal-sources.ts'), 'utf8');
  assert.match(js, /exitTimeSource: sql/);
});

// ── E1: the validator's own stamps ───────────────────────────────────────
const eligible = { executionAudit: { version: 1, state: 'triggered', triggerObservedAt: ENTRY } };
const baseIdea: any = {
  id: 'i1', symbol: 'AAPL', assetType: 'stock', direction: 'long', entryPrice: 100, targetPrice: 110, stopLoss: 95,
  timestamp: ENTRY, outcomeStatus: 'open', convergenceSignalsJson: eligible, highestPriceReached: 101, lowestPriceReached: 99,
};
t('validator: exitBy expiry stamps the deadline, not now', () => {
  const exitBy = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const r = PerformanceValidator.validateTradeIdea({ ...baseIdea, timestamp: new Date(Date.now() - 4 * 86_400_000).toISOString(), exitBy }, 100.5);
  assert.equal(r.outcomeStatus, 'expired');
  assert.equal(r.exitTimeSource, 'deadline');
  assert.equal(r.exitDate, formatExitDate(Date.parse(exitBy)));
  assert.equal(r.deadlineMs, Date.parse(exitBy));
});
t('validator: 7-day backstop stamps created+7d', () => {
  const ts = new Date(Date.now() - 9 * 86_400_000).toISOString();
  const r = PerformanceValidator.validateTradeIdea({ ...baseIdea, timestamp: ts }, 100.5);
  assert.equal(r.exitTimeSource, 'deadline');
  assert.equal(r.exitDate, formatExitDate(Date.parse(ts) + 7 * 86_400_000));
});
t('validator: barrier hit from polled extremes is live until the service finds the bar', () => {
  const r = PerformanceValidator.validateTradeIdea({ ...baseIdea, timestamp: new Date().toISOString() }, 111);
  assert.equal(r.outcomeStatus, 'hit_target');
  assert.equal(r.exitTimeSource, 'live');
});

// ── E2: repair planner + script (fixture, dry run) ───────────────────────
const SWEEP = '2026-09-30T07:43:10-05:00';
const SWEEP_V = '2026-09-30T07:43:10-05:00';
const row = (o: Partial<RepairRow>): RepairRow => ({
  id: 'r', symbol: 'AAPL', assetType: 'stock', direction: 'long', source: 'quant', entryPrice: 100, targetPrice: 110, stopLoss: 95,
  timestamp: ENTRY, outcomeStatus: 'hit_target', resolutionReason: 'auto_target_hit', exitDate: SWEEP, exitPrice: 110, percentGain: 10,
  predictionValidatedAt: SWEEP_V, outcomeNotes: null, exitBy: null, expiryDate: null, entryValidUntil: null, convergenceSignalsJson: eligible, ...o,
});
const fixtureRows: RepairRow[] = [
  row({ id: 'tgt' }),
  row({ id: 'stp', outcomeStatus: 'hit_stop', resolutionReason: 'auto_stop_hit', exitPrice: 95 }),
  row({ id: 'nobar', symbol: 'MSFT' }),
  row({ id: 'exp', outcomeStatus: 'expired', resolutionReason: 'auto_expired', exitBy: '2026-09-22T20:00:00Z', exitPrice: 104 }),
  row({ id: 'old', exitDate: '2026-09-20T10:00:00-05:00' }), // before the cutoff: not a candidate at all
  row({ id: 'real', exitDate: '2026-09-30T09:00:00-05:00' }), // differs from validatedAt: not a sweep stamp
  row({ id: 'done', outcomeNotes: '[exit-time:bar_hit] earlier repair' }),
  row({ id: 'ts', outcomeStatus: 'expired', resolutionReason: 'auto_time_stop' }),
];
const fixtureBars: Record<string, TimedBar[]> = { AAPL: [...bars, bar('2026-09-22T19:55:00Z', 101, 103, 102.5)] };
t('repair planner: updates real bar hits, lists the rest, never guesses', async () => {
  const plans = await planRepairs(fixtureRows, async (r) => ({ bars: fixtureBars[r.symbol] ?? [], interval: '5m' }));
  const by = Object.fromEntries(plans.map((p) => [p.id, p]));
  assert.equal(by.tgt.action, 'update'); assert.equal(by.tgt.set!.exitDate, formatExitDate(Date.parse('2026-09-16T15:30:00Z')));
  assert.equal(by.stp.action, 'update'); assert.equal(by.stp.set!.exitDate, formatExitDate(Date.parse('2026-09-18T15:00:00Z')));
  assert.equal(by.nobar.action, 'unchanged');
  assert.equal(by.exp.action, 'update'); assert.equal(by.exp.set!.exitPrice, 102.5); assert.equal(by.exp.set!.exitDate, formatExitDate(Date.parse('2026-09-22T20:00:00Z')));
  assert.equal(by.old, undefined);
  assert.equal(by.real.action, 'skip');
  assert.equal(by.done.action, 'skip');
  assert.equal(by.ts.action, 'unchanged');
  assert.match(by.tgt.set!.outcomeNotes, /\[exit-time:bar_hit\].*repaired from sweep stamp/);
  // Idempotent: applying the plan and re-planning touches nothing.
  const applied = fixtureRows.map((r) => (by[r.id]?.set ? { ...r, ...by[r.id].set } : r));
  const again = await planRepairs(applied, async (r) => ({ bars: fixtureBars[r.symbol] ?? [], interval: '5m' }));
  assert.equal(again.filter((p) => p.action === 'update').length, 0);
  assert.match(formatRepairTable(plans), /update 3 · unchanged 2 · skip 2/);
});
t('repair script: --fixture dry run prints the table and writes nothing', () => {
  const f = path.join(os.tmpdir(), `exit-fixture-${process.pid}.json`);
  fs.writeFileSync(f, JSON.stringify({ rows: fixtureRows, bars: fixtureBars }));
  const out = execFileSync('npx', ['tsx', 'scripts/repair-exit-dates.ts', '--fixture', f], { encoding: 'utf8', env: { ...process.env, DATABASE_URL: '' } });
  fs.unlinkSync(f);
  assert.match(out, /update 3 · unchanged 2 · skip 2/);
  assert.match(out, /fixture \(offline\)/);
});

// ── E3: desk book maps exitDate → the ET calendar day ────────────────────
t('desk row exitTime = exitDate and lands on its ET day', () => {
  const res = mapDeskIdea({
    id: 'd1', symbol: 'AAPL', assetType: 'stock', direction: 'long', entryPrice: 100, targetPrice: 110, stopLoss: 95, riskRewardRatio: 2,
    optionType: null, strikePrice: null, expiryDate: null, entryPremium: null, exitPremium: null, optionPercentGain: null,
    exitPrice: 110, percentGain: 10, outcomeStatus: 'hit_target', resolutionReason: 'auto_target_hit',
    exitDate: '2026-09-16T10:30:00-05:00', timestamp: ENTRY, source: 'quant', catalyst: null, genConvictionBand: null,
  });
  assert.ok('row' in res);
  assert.equal((res as any).row.exitTime, '2026-09-16T10:30:00-05:00');
  assert.equal(journalDayKey((res as any).row.exitTime), '2026-09-16');
  // A late-evening Chicago stamp is still the ET day it happened on.
  assert.equal(journalDayKey('2026-09-16T22:30:00-05:00'), '2026-09-16');
  assert.equal(journalDayKey('2026-09-16T23:30:00-05:00'), '2026-09-17');
});

// ── E4: live marks for open journal rows ─────────────────────────────────
t('marks: open rows only, instrument-deduped, cached ≤1 call per 30 s, never a fabricated option P&L', async () => {
  _clearMarkCache();
  const calls: string[] = [];
  const q = async (key: string): Promise<MarkQuote | null> => {
    calls.push(key);
    if (key.startsWith('O:NVDA')) return { price: 180, asOf: new Date().toISOString(), source: 'yahoo', delayed: false, basis: 'underlying' };
    if (key.startsWith('O:')) return { price: 3.5, asOf: new Date().toISOString(), source: 'tradier', delayed: false, basis: 'contract' };
    return { price: 105, asOf: new Date().toISOString(), source: 'tradier', delayed: false, basis: 'quote' };
  };
  const rows = [
    { id: 'a', symbol: 'AAPL', assetType: 'stock', direction: 'long', status: 'open', quantity: 10, entryPrice: 100 },
    { id: 'b', symbol: 'AAPL', assetType: 'stock', direction: 'short', status: 'open', quantity: 2, entryPrice: 100 },
    { id: 'c', symbol: 'AAPL', assetType: 'stock', direction: 'long', status: 'closed', quantity: 10, entryPrice: 100 },
    { id: 'o', symbol: 'SPY', assetType: 'option', direction: 'long', status: 'open', quantity: 2, entryPrice: 2.5, optionType: 'call', strikePrice: 600, expiryDate: '2026-10-17' },
    { id: 'u', symbol: 'NVDA', assetType: 'option', direction: 'long', status: 'open', quantity: 1, entryPrice: 4, optionType: 'put', strikePrice: 170, expiryDate: '2026-10-17' },
    { id: 'f', symbol: 'ES', assetType: 'future', direction: 'long', status: 'open', quantity: 1, entryPrice: 6000 },
  ];
  const m = await liveMarksFor(rows, q);
  assert.equal(m.a.unrealizedPnL, 50); assert.equal(m.a.unrealizedPct, 5);
  assert.equal(m.b.unrealizedPnL, -10);
  assert.equal(m.c, undefined); assert.equal(m.f, undefined);
  assert.equal(m.o.unrealizedPnL, 200); assert.equal(m.o.basis, 'contract'); // (3.5-2.5)×2×100
  assert.equal(m.u.unrealizedPnL, null); assert.match(m.u.note!, /underlying NVDA/);
  assert.ok(m.a.source && m.a.asOf);
  assert.equal(calls.filter((k) => k === 'S:AAPL').length, 1);
  await liveMarksFor(rows, q); // within 30 s → served from cache
  assert.equal(calls.length, 3);
  let n2 = 0;
  await cachedQuote('S:TEST', async () => { n2++; return null; }, 1_000);
  await cachedQuote('S:TEST', async () => { n2++; return null; }, 1_000 + MARK_TTL_MS - 1);
  assert.equal(n2, 1);
  await cachedQuote('S:TEST', async () => { n2++; return null; }, 1_000 + MARK_TTL_MS);
  assert.equal(n2, 2);
  assert.equal(instrumentKey(rows[3] as any), 'O:SPY|2026-10-17|call|600');
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); n++; } catch (e) { console.error(`✗ ${name}`); throw e; }
  }
  console.log(`exit-dates: ${n}/${tests.length} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
