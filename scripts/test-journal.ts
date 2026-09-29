/**
 * Journal logic checks: shared filters, server-side P&L derivation, client
 * metrics (ported from LuxAlgo journal-core) and the ?jtab= legacy map.
 *   npx tsx scripts/test-journal.ts
 */
import assert from 'node:assert/strict';
import { journalDayKey, matchesJournalFilters, parseJournalFilters, journalFiltersToParams, journalRowOutcome } from '../shared/journal-filters';
import { buildJournalTradeUpdate, deriveJournalTradeFields, journalTradeInputSchema } from '../server/journal-trade-input';
import { calendarMonth, computeMetrics, dailyStats, drawdownPeriods, equityCurve, groupBy, toTrade } from '../client/src/lib/journal/metrics';
import { resolveJournalTab } from '../client/src/lib/journal/legacy-jtab';
import type { JournalTradeRow } from '../client/src/lib/journal/types';

// ── filters ──
const f = parseJournalFilters((k) => new URLSearchParams('jfrom=2026-09-01&jto=bad&jsym=spy, nvda&jside=long&jout=win&jsetup=ORB').get(k));
assert.deepEqual(f, { from: '2026-09-01', symbols: ['SPY', 'NVDA'], side: 'long', outcome: 'win', setup: 'ORB' });
assert.equal(journalFiltersToParams(f).get('jsym'), 'SPY,NVDA');
assert.equal(journalDayKey('2026-09-02T02:00:00Z'), '2026-09-01', 'UTC 02:00 is the prior New York day');
assert.equal(journalRowOutcome({ status: 'closed', realizedPnL: 0.001 }), 'breakeven');
assert.equal(journalRowOutcome({ status: 'closed', realizedPnL: null }), 'open');

let n = 0;
const row = (p: Partial<JournalTradeRow>): JournalTradeRow => ({
  id: `r${++n}`, symbol: 'SPY', assetType: 'stock', direction: 'long', quantity: 1, entryPrice: 100, exitPrice: 101,
  entryTime: '2026-09-01T14:00:00Z', exitTime: '2026-09-01T15:00:00Z', status: 'closed', realizedPnL: 1, fees: 0, broker: 'manual', ...p,
});
const rows = [
  row({ realizedPnL: 100, setupType: 'ORB' }),
  row({ realizedPnL: -50, setupType: 'ORB', exitTime: '2026-09-02T15:00:00Z' }),
  row({ realizedPnL: 200, symbol: 'NVDA', direction: 'short', exitTime: '2026-09-03T15:00:00Z' }),
  row({ realizedPnL: -300, exitTime: '2026-09-04T15:00:00Z' }),
  row({ status: 'open', realizedPnL: null, exitPrice: null, exitTime: null }),
];
assert.equal(rows.filter((r) => matchesJournalFilters(r, f)).length, 1, 'long SPY/NVDA ORB wins from Sep 1');
assert.equal(rows.filter((r) => matchesJournalFilters(r, { outcome: 'open' })).length, 1);

// ── derivation ──
assert.deepEqual(
  { ...deriveJournalTradeFields({ direction: 'short', assetType: 'option', quantity: 2, entryPrice: 1.5, exitPrice: 1, fees: 2, entryTime: '2026-09-01T14:00:00Z', exitTime: '2026-09-01T14:30:00Z' }) },
  { realizedPnL: 98, grossPnL: 100, realizedPnLPercent: 32.67, holdingMinutes: 30, status: 'closed', outcome: 'win' },
);
assert.equal(deriveJournalTradeFields({ direction: 'long', assetType: 'stock', quantity: 1, entryPrice: 10, fees: 0, entryTime: '2026-09-01T14:00:00Z' }).status, 'open');
const existing = { ...row({ realizedPnL: 123.45, broker: 'webull' }), userId: 'u' } as never;
assert.equal(buildJournalTradeUpdate(existing, { notes: 'x' }).realizedPnL, undefined, 'notes edit keeps broker P&L');
assert.equal(buildJournalTradeUpdate(existing, { exitPrice: 103 }).realizedPnL, 3, 'price edit re-derives');
assert.equal(journalTradeInputSchema.safeParse({ symbol: 'spy', direction: 'long', quantity: 1, entryPrice: 1, entryTime: 'x' }).success, false);
assert.equal(journalTradeInputSchema.safeParse({ symbol: 'spy', direction: 'long', quantity: 1, entryPrice: 1, entryTime: '2026-09-01', userId: 'evil' }).success, false, 'unknown keys rejected');
assert.equal(journalTradeInputSchema.safeParse({ symbol: 'spy', direction: 'long', quantity: 1, entryPrice: 1, entryTime: '2026-09-01', screenshot: 'javascript:alert(1)' }).success, false);

// ── metrics ──
const trades = rows.map(toTrade);
const m = computeMetrics(trades);
assert.equal(m.closedTrades, 4);
assert.equal(m.openTrades, 1);
assert.equal(m.netPnl, -50);
assert.equal(m.winRate, 0.5);
assert.equal(m.profitFactor, 300 / 350);
assert.equal(m.expectancy, -12.5);
assert.equal(m.maxDrawdown, 300, 'peak +250 → trough −50');
assert.equal(m.maxWinStreak, 1);
assert.equal(m.currentStreak, -1);
assert.equal(m.tradingDays, 4);
const cal = calendarMonth(dailyStats(trades), 2026, 9);
assert.equal(cal.monthNetPnl, -50);
assert.equal(cal.weeks[0].days[0], null, 'Sep 2026 starts on a Tuesday — Monday cell blank');
assert.equal(cal.weeks[0].days[1]?.date, '2026-09-01');
const orb = groupBy(trades, 'setup').find((b) => b.key === 'ORB')!;
assert.deepEqual([orb.closed, orb.netPnl, orb.winRate], [2, 50, 0.5]);
assert.equal(drawdownPeriods(equityCurve(trades))[0].depth, 300);

// ── legacy ?jtab= ──
assert.equal(resolveJournalTab('metrics').view, 'record');
assert.equal(resolveJournalTab('log').view, 'dashboard');
assert.equal(resolveJournalTab('backtest').intent?.kind, 'backtest');
assert.deepEqual(resolveJournalTab('timing'), { view: 'analytics', intent: { kind: 'anchor', id: 'jr-time' } });
assert.equal(resolveJournalTab('simulator').view, 'trades');
assert.equal(resolveJournalTab('import').intent?.kind, 'import');
assert.equal(resolveJournalTab('toString').view, 'dashboard', 'prototype keys are not tabs');
assert.equal(resolveJournalTab(null).view, 'dashboard');

console.log('journal checks passed');
