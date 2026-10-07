/**
 * Managed exits, call accuracy and the Recorded | Managed journal view
 * (shared/managed-exit.ts, shared/call-accuracy.ts, shared/desk-view.ts,
 * server/managed-replay-ledger.ts).
 *   npm run test:managed-replay
 */
import assert from 'node:assert/strict';
import { bookStats, managedLiveSignal, readManagedExits, simulateManaged, withoutTopWinners, type ManagedBar } from '../shared/managed-exit';
import { callWinLevel, classifyCall, splitHalves, summarizeCalls } from '../shared/call-accuracy';
import { applyDeskView, type DeskViewRow } from '../shared/desk-view';
import { DEFAULT_SIZING } from '../shared/position-sizing';
import { attachManagedReplay, callAccuracyHeadline, parseManagedLedger } from '../server/managed-replay-ledger';

let n = 0;
const t = (name: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const W = 5 * 60_000;
const mk = (rows: [number, number, number, number][], atr: number | null = 1, opt?: ([number, number, number, number] | null)[]): ManagedBar[] =>
  rows.map(([o, h, l, c], k) => ({ t: k * W, o, h, l, c, atr, opt: opt?.[k] ? { o: opt[k]![0], h: opt[k]![1], l: opt[k]![2], c: opt[k]![3] } : null }));
const stock = (bars: ManagedBar[], over = {}) => simulateManaged({ kind: 'stock', direction: 'long', entry: 100, stop: 98, target: 104, bars, windowComplete: true, ...over });

// ── managed policy ──
t('stop first: full loss at the stop (−1R)', () => {
  const r = stock(mk([[100, 100.4, 99.6, 100], [99.5, 99.6, 97.5, 97.8]]));
  assert.equal(r.exitReason, 'stop'); assert.equal(r.rMultiple, -1); assert.equal(r.closed, true);
});
t('+1R arms breakeven: a later pullback exits flat, not at the stop', () => {
  const r = stock(mk([[100, 100.2, 99.8, 100], [100, 102.3, 99.9, 102.1], [102, 102.1, 99.5, 99.7]]));
  assert.equal(r.exitReason, 'BE'); assert.equal(r.rMultiple, 0);
});
t('½ at T1 then 1×ATR trail from the peak (previous bar ATR / peak)', () => {
  const r = stock(mk([[100, 100.5, 99.5, 100], [100, 102.2, 99.9, 102], [102, 104.5, 101.8, 104.2], [104, 106, 103.9, 105.8], [105.8, 105.9, 104.2, 104.5]]));
  assert.deepEqual(r.fills.map((f) => [f.why, f.px]), [['T1½', 104], ['trail', 105]]);
  assert.equal(r.rMultiple, 2.25);
});
t('stop and T1 in one bar → stop', () => {
  const r = stock(mk([[100, 100.5, 99.5, 100], [100, 104.5, 97.5, 101]]));
  assert.equal(r.exitReason, 'stop');
});
t('gap through the stop fills at the open (loss can exceed 1R — the sizing caps the $)', () => {
  const r = stock(mk([[100, 100.5, 99.5, 100], [96, 96.5, 95, 95.5]]));
  assert.equal(r.fills[0].px, 96); assert.equal(r.rMultiple, -2);
});
t('trigger bar: only the stop is checked (no T1 inside the entry bar)', () => {
  const r = stock(mk([[100, 104.5, 99.5, 101], [101, 101.5, 100.5, 101]]));
  assert.equal(r.exitReason, 'time'); assert.equal(r.fills.length, 1);
});
t('time exit at window end; incomplete window stays open', () => {
  const bars = mk([[100, 100.5, 99.5, 100], [100, 101, 99.5, 100.6]]);
  const done = stock(bars);
  assert.equal(done.exitReason, 'time'); assert.equal(done.closed, true);
  const open = stock(bars, { windowComplete: false });
  assert.equal(open.closed, false); assert.equal(open.pnlPerUnit, null); assert.equal(open.exitReason, 'open');
});
t('short: mirror image', () => {
  const r = simulateManaged({ kind: 'stock', direction: 'short', entry: 100, stop: 102, target: 96, windowComplete: true,
    bars: mk([[100, 100.5, 99.5, 100], [100, 100.1, 97.8, 98], [98, 98.1, 95.5, 96], [96, 97.5, 95.9, 97.2]]) });
  assert.equal(r.fills[0].why, 'T1½'); assert.ok((r.rMultiple ?? 0) > 0);
  assert.equal(r.peakUnderlying!.px, 95.5);
});
t('peak (MFE) is reported over the whole window, with time, even after the exit', () => {
  const r = stock(mk([[100, 100.2, 99.8, 100], [100, 101.5, 99.9, 101], [101, 101.1, 97.5, 98], [98, 107, 98, 106]]));
  assert.equal(r.exitReason, 'stop'); assert.equal(r.peakUnderlying!.px, 107); assert.equal(r.peakUnderlying!.at, 3 * W);
});
t('options: premium stop trips first', () => {
  const r = simulateManaged({ kind: 'option', direction: 'long', entry: 100, stop: 98, target: 104, windowComplete: true, entryPremium: 2, premiumStop: 1,
    bars: mk([[100, 100.2, 99.8, 100], [100, 100.1, 99, 99.2]], 1, [[2, 2.1, 1.9, 2], [1.5, 1.5, 0.9, 1]]) });
  assert.equal(r.exitReason, 'premium stop'); assert.equal(r.fills[0].px, 1); assert.equal(r.rMultiple, -1);
});
t('options: +50% premium arms BE; T1 half; ≤25% give-back trail', () => {
  const r = simulateManaged({ kind: 'option', direction: 'long', entry: 100, stop: 98, target: 104, windowComplete: true, entryPremium: 2, premiumStop: 1,
    bars: mk([[100, 100.2, 99.8, 100], [100, 102, 99.9, 101.8], [101.8, 104.5, 101.5, 104.2], [104, 104.1, 102, 102.2]], 1,
      [[2, 2, 2, 2], [2.4, 3.2, 2.3, 3], [3, 5, 2.9, 4.8], [4.6, 4.6, 3.4, 3.5]]) });
  assert.equal(r.fills[0].why, 'T1½'); assert.equal(r.fills[0].px, 4.8);
  assert.equal(r.fills[1].why, 'premium trail'); assert.equal(r.fills[1].px, 3.75); // 75% of the 5.00 peak
  assert.ok(r.closed && (r.pnlPerUnit ?? 0) > 0);
});
t('book stats and top-3 removal', () => {
  const s = bookStats([{ pnl: 100, r: 1 }, { pnl: -50, r: -0.5 }, { pnl: -50, r: -0.5 }, { pnl: 200, r: 2 }]);
  assert.equal(s.winRate, 0.5); assert.equal(s.profitFactor, 3); assert.equal(s.maxDrawdown, 100); assert.equal(s.expectancyR, 0.5);
  assert.equal(withoutTopWinners([{ pnl: 5 }, { pnl: 9 }, { pnl: -1 }, { pnl: 7 }, { pnl: 1 }]).map((x) => x.pnl).join(','), '-1,1');
});
t('MANAGED_EXITS default off; live signal walks initial → BE → trailing → stopped', () => {
  assert.equal(readManagedExits({}), false); assert.equal(readManagedExits({ MANAGED_EXITS: '1' }), true);
  const plan = { policy: 'managed-v1' as const, label: 'x', atr: 1, zeroDte: false };
  const base = { direction: 'long' as const, entry: 100, stop: 98, target: 104 };
  assert.equal(managedLiveSignal(plan, { ...base, live: 101, peak: 101 })!.state, 'initial');
  assert.equal(managedLiveSignal(plan, { ...base, live: 102.5, peak: 102.5 })!.state, 'breakeven');
  const tr = managedLiveSignal(plan, { ...base, live: 104.8, peak: 105 })!;
  assert.equal(tr.state, 'trailing'); assert.equal(tr.stopNow, 104);
  assert.equal(managedLiveSignal(plan, { ...base, live: 99.9, peak: 102.5 })!.state, 'stopped');
});

// ── call accuracy ──
const cb = (rows: [number, number, number, number][]) => rows.map(([o, h, l, c], k) => ({ t: 1_000_000 + k * W, o, h, l, c }));
const call = (bars: ReturnType<typeof cb>, over = {}) => classifyCall({ direction: 'long', entry: 100, stop: 98, target: 104, bars, triggerMs: bars[0]?.t ?? 0, windowEndMs: 1_000_000 + 100 * W, nowMs: 9e12, ...over });
t('win level = nearer of T1 and +1R', () => {
  assert.deepEqual(callWinLevel('long', 100, 98, 104), { level: 102, kind: '1R' });
  assert.deepEqual(callWinLevel('long', 100, 98, 101.5), { level: 101.5, kind: 'T1' });
  assert.deepEqual(callWinLevel('short', 100, 102, null), { level: 98, kind: '1R' });
  assert.deepEqual(callWinLevel('long', 100, 98, 99), { level: 102, kind: '1R' }); // T1 on the wrong side ignored
});
t('WIN: +1R before the stop, even if the stop trades later (no exit needed)', () => {
  const r = call(cb([[100, 100.5, 99.5, 100], [100, 102.2, 99.9, 102], [101, 101, 97, 97.5]]));
  assert.equal(r.result, 'win'); assert.equal(r.winKind, '1R');
});
t('LOSS: stop first; same bar touching both → stop first', () => {
  assert.equal(call(cb([[100, 100.5, 99.5, 100], [100, 100.4, 97.9, 98], [98, 103, 98, 103]])).result, 'loss');
  assert.equal(call(cb([[100, 100.5, 99.5, 100], [100, 102.5, 97.5, 100]])).result, 'loss');
});
t('trigger bar: only the stop counts', () => {
  assert.equal(call(cb([[100, 102.5, 99.5, 101], [101, 101.5, 100.5, 101]])).result, 'no_result');
  assert.equal(call(cb([[100, 100.5, 97.5, 99]])).result, 'loss');
});
t('NO RESULT inside a finished window; PENDING while open; NOT TRIGGERED', () => {
  const flat = cb([[100, 100.5, 99.5, 100], [100, 101, 99, 100.5]]);
  assert.equal(call(flat).result, 'no_result');
  assert.equal(call(flat, { nowMs: 1_000_000 + 10 * W }).result, 'pending');
  assert.equal(call(flat, { triggerMs: null }).result, 'not_triggered');
  // bars after the window end are ignored
  assert.equal(call(cb([[100, 100.5, 99.5, 100], [100, 100.5, 99.5, 100], [100, 103, 100, 103]]), { windowEndMs: 1_000_000 + W }).result, 'no_result');
});
t('summary: rate over wins+losses only; halves by publish time', () => {
  const s = summarizeCalls([
    { result: 'win', publishedAt: '2026-09-01' }, { result: 'loss', publishedAt: '2026-09-02' }, { result: 'win', publishedAt: '2026-09-03' },
    { result: 'no_result', publishedAt: '2026-09-04' }, { result: 'pending', publishedAt: '2026-09-05' }, { result: 'not_triggered', publishedAt: '2026-09-06' },
  ]);
  assert.equal(s.n, 3); assert.equal(s.rate, 2 / 3); assert.equal(s.noResult, 1); assert.equal(s.pending, 1); assert.equal(s.notTriggered, 1);
  assert.equal(s.from, '2026-09-01'); assert.equal(s.to, '2026-09-03');
  const [a, b] = splitHalves([{ publishedAt: '3' }, { publishedAt: '1' }, { publishedAt: '2' }, { publishedAt: '4' }]);
  assert.deepEqual([a.map((x) => x.publishedAt), b.map((x) => x.publishedAt)], [['1', '2'], ['3', '4']]);
});

// ── ledger → rows → Recorded | Managed view ──
const ledgerRaw = {
  generatedAt: '2026-10-07T21:00:00Z', summary: { policyLabel: 'Managed' },
  ideas: [
    { id: 'a', publishedAt: '2026-10-01T14:00:00Z', managed: { status: 'closed', pnlUnit: 12, r: 0.6, exitAt: '2026-10-01T15:00:00Z', exitPx: 101.2, exitReason: 'T1½ → trail' },
      peak: { underlying: { px: 103, at: '2026-10-01T14:40:00Z', r: 1.5, pct: 3 }, premium: null, unitPnl: 30 }, call: { result: 'win', at: '2026-10-01T14:20:00Z', winKind: '1R', winLevel: 102 } },
    { id: 'b', publishedAt: '2026-10-02T14:00:00Z', managed: { status: 'skipped', exitReason: 'entry never traded after publication (not triggered)' }, peak: {}, call: { result: 'not_triggered' } },
    { id: 'c', publishedAt: '2026-10-03T14:00:00Z', managed: { status: 'closed', pnlUnit: -20, r: -1, exitAt: '2026-10-03T15:00:00Z', exitPx: 98, exitReason: 'stop' }, peak: {}, call: { result: 'loss', at: '2026-10-03T14:30:00Z' } },
  ],
};
const ledger = parseManagedLedger(ledgerRaw, '/tmp/x.json', 0);
const row = (id: string, pnl: number | null): DeskViewRow => ({
  id: `desk:${id}`, status: pnl == null ? 'open' : 'closed', quantity: 10, entryPrice: 100, exitPrice: pnl == null ? null : 100 + pnl / 10,
  exitTime: pnl == null ? null : '2026-10-04T15:00:00Z', entryTime: '2026-10-01T14:00:00Z', realizedPnL: pnl, grossPnL: pnl, outcome: pnl == null ? 'open' : pnl > 0 ? 'win' : 'loss',
  riskBasis: { assetType: 'stock', direction: 'long', entry: 100, stop: 98, unitQty: 10 },
});
t('ledger attaches managed / peak / call by desk id; headline counts calls', () => {
  const rows = attachManagedReplay([row('a', -20), row('b', 5), row('c', -20), row('z', 3)], ledger);
  assert.equal(rows[0].managed!.pnlUnit, 12); assert.equal(rows[0].call!.result, 'win'); assert.equal(rows[3].managed, undefined);
  const h = callAccuracyHeadline(ledger)!;
  assert.equal(h.overall.n, 2); assert.equal(h.overall.rate, 0.5); assert.equal(h.overall.notTriggered, 1);
});
t('Recorded view = recorded P&L untouched; Managed view = replayed exits, skipped rows counted', () => {
  const rows = attachManagedReplay([row('a', -20), row('b', 5), row('c', -20), row('z', 3)], ledger);
  const rec = applyDeskView(rows, { view: 'recorded', sizing: { mode: 'unit', riskDollars: 0 } });
  assert.deepEqual(rec.rows.map((r) => r.realizedPnL), [-20, 5, -20, 3]);
  const man = applyDeskView(rows, { view: 'managed', sizing: { mode: 'unit', riskDollars: 0 } });
  assert.deepEqual(man.rows.map((r) => [r.id, r.realizedPnL, r.outcome]), [['desk:a', 12, 'win'], ['desk:c', -20, 'loss']]);
  assert.equal(man.rows[0].viewedAs, 'managed');
  assert.equal(man.skipped.reduce((s, x) => s + x.count, 0), 2);
  // the source rows were not mutated (recorded history never overwritten)
  assert.equal(rows[0].realizedPnL, -20);
});
t('Managed view + Risk $500: sized from the same plan, loss ≤ budget', () => {
  const rows = attachManagedReplay([row('a', -20), row('c', -20)], ledger);
  const v = applyDeskView(rows, { view: 'managed', sizing: DEFAULT_SIZING });
  assert.deepEqual(v.rows.map((r) => r.realizedPnL), [300, -500]); // 250 sh: +$1.20 × 250; −$2 × 250
});
t('a missing ledger file → no attach, no headline', () => {
  const prev = process.env.MANAGED_REPLAY_LEDGER;
  process.env.MANAGED_REPLAY_LEDGER = '/nonexistent/ledger.json';
  assert.equal(callAccuracyHeadline(), null);
  const r = [row('a', 1)];
  assert.equal(attachManagedReplay(r)[0], r[0]);
  if (prev == null) delete process.env.MANAGED_REPLAY_LEDGER; else process.env.MANAGED_REPLAY_LEDGER = prev;
});

console.log(`test-managed-replay: ${n} passed`);
