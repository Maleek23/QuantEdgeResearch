/**
 * Journal logic checks: shared filters, server-side P&L derivation, client
 * metrics (ported from LuxAlgo journal-core), the ?jtab= legacy map, journal
 * keys, broker fill pairing, trade-desk idea mapping, and the Discord parser +
 * entry/exit pairing (sample messages below are the grammar's contract).
 *   npx tsx scripts/test-journal.ts
 */
import assert from 'node:assert/strict';
import { parseBrokerCSV } from '../server/broker-csv-parser';
import { planJournalImport } from '../server/journal-import-plan';
import {
  EXPIRED_ASSUMED_NOTE, EXPIRED_NOTE_HEAD, expiryCloseIso, expiryCounts, expiryCountsText, intrinsicSettlement, isExpiredUnclosed, parseExpiryMarker,
  settleExpiredRows, settlementUnderlying,
} from '../shared/journal-expiry';
import { planExpiryResettle, settleParsedExpiries, type ExpiryBarFetcher } from '../server/journal-expiry-settle';
import { behaviorInsights, buildInsights, concentration, costBucket, dteAtEntry, keepDoing, sessionOf, stopDoing } from '../client/src/lib/journal/insights';
import { fitTabs } from '../client/src/components/journal/journal-nav';
import { buildJournalDrill, countJournalFilters, JOURNAL_DRILL_MAX_IDS, journalDayKey, matchesJournalFilters, parseJournalFilters, journalFiltersToParams, journalRowOutcome } from '../shared/journal-filters';
import { buildJournalTradeUpdate, deriveJournalTradeFields, journalTradeInputSchema } from '../server/journal-trade-input';
import {
  calendarMonth, fridayWithWeekend, computeMetrics, crossBuckets, dailyStats, dayStreaks, drawdownPeriods, equityCurve, groupBy, missingDim, noteLine,
  peakConcurrent, periodStart, reportBuckets, rollingStats, ruleOfReason, runRecords, toTrade,
} from '../client/src/lib/journal/metrics';
import { FILTERED_PAGES, JOURNAL_GROUPS, JOURNAL_PAGES, LEGACY_JTAB, TRADE_PAGES, resolveJournalPage, resolveJournalTab } from '../client/src/lib/journal/legacy-jtab';
import type { JournalTradeRow } from '../client/src/lib/journal/types';
import { parseJournalKey, traderOwnerId, journalKindOf, journalNoteKey } from '../shared/journal-sources';
import { decodeOccSymbol, pairFills, type BrokerFill } from '../shared/fill-pairing';
import { deskVerificationMeta, mapDeskIdea, verifyDeskRows, type DeskIdea } from '../server/journal-row-maps';
import { deskIntegrityFlags, findDuplicates, isSyntheticOrRetroactive } from '../shared/desk-integrity';
import { positionBias, positionBiasText } from '../shared/position-bias';
import { labelBotRuns, pickActiveBotPortfolio, runsCovered } from '../shared/bot-runs';
import { dueForSettlement, expirySessionOver, nyCloseIso, settleAtExpiry, type OpenBotOptionRow } from '../server/bot-expiry-plan';
import {
  calendarInsights, dayEquity, dayRecap, decodeTradeReview, edgeScore, encodeTradeReview, groupImportErrors, marketWindow, maxDrawdownPct,
  performanceTrends, planLevels, playbookAdherence, playbookRules, relativeDrawdown, timeGrid, toCsv, tradeTimeframe, type TradeReview,
} from '../client/src/lib/journal/metrics-extra';
import {
  analyseTrade, counterfactuals, dteBucket, etParts, exitCategory, holdBucket, isOutsideRTH, lossDrivers, LOSS_CLASSES, replayR,
  summariseLosses, tradeContext, type Bar, type LossRow,
} from '../client/src/lib/journal/loss-analysis';
import { JOURNAL_DEFAULTS } from '../client/src/components/dashboard/defs/journal';
import { tilingIssues } from '../client/src/components/dashboard/layout';
import {
  normalizeDiscordExport, pairDiscordMessages, parseDiscordMessage, resolveExpiry, type DiscordMsg,
} from '../shared/discord-journal-parser';

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
// Mon–Fri calendar (2026-09-29): five columns; a weekend close rolls into Friday; totals unchanged.
{
  const D = (date: string, netPnl: number) => ({ date, netPnl, fees: 0, trades: 1, wins: netPnl > 0 ? 1 : 0, losses: netPnl < 0 ? 1 : 0, breakevens: 0 });
  const wk = calendarMonth([D('2026-09-04', 100), D('2026-09-05', 40), D('2026-09-06', -10)], 2026, 9);
  assert.ok(wk.weeks.every((w) => w.days.length === 5), 'Mon–Fri columns only');
  assert.deepEqual(wk.weeks[0].weekend.map((d) => d.date), ['2026-09-05', '2026-09-06']);
  assert.equal(fridayWithWeekend(wk.weeks[0]).cell?.netPnl, 130, 'Fri 100 + Sat 40 + Sun −10');
  assert.equal(fridayWithWeekend(wk.weeks[0]).cell?.trades, 3);
  assert.equal(wk.weeks[0].weekNetPnl, 130, 'week total still counts the weekend');
  assert.equal(wk.monthNetPnl, 130);
  // Nov 2026 starts on a Sunday: the first row is weekend-only when Nov 1 traded, dropped when it did not.
  assert.equal(calendarMonth([], 2026, 11).weeks[0].days[0]?.date, '2026-11-02', 'untraded weekend-only row dropped');
  const nov = calendarMonth([D('2026-11-01', 25)], 2026, 11);
  assert.equal(nov.weeks[0].days.every((d) => d === null), true);
  assert.equal(fridayWithWeekend(nov.weeks[0]).cell?.date, '2026-11-01', 'weekend-only cell dated on its day');
}
const orb = groupBy(trades, 'setup').find((b) => b.key === 'ORB')!;
assert.deepEqual([orb.closed, orb.netPnl, orb.winRate], [2, 50, 0.5]);
assert.equal(drawdownPeriods(equityCurve(trades))[0].depth, 300);

// ── ?jtab= / ?jpage= → sidebar pages ──
assert.equal(resolveJournalTab('metrics').view, 'record');
assert.equal(resolveJournalTab('log').view, 'dashboard');
assert.equal(resolveJournalTab('backtest').intent?.kind, 'backtest');
assert.deepEqual(resolveJournalTab('timing'), { view: 'insights', intent: { kind: 'anchor', id: 'jr-ins-time' } }, 'Trade Log → Timing lives on Insights');
assert.deepEqual(resolveJournalTab('insights'), { view: 'insights' }, 'Insights is a first-class page (feat/jnav)');
assert.equal(resolveJournalTab('tilt').view, 'insights');
assert.equal(resolveJournalTab('analytics').view, 'reports', 'the 4-tab Analytics id resolves to Reports');
assert.equal(resolveJournalTab('simulator').view, 'trades');
assert.equal(resolveJournalTab('import').view, 'import', 'import is a page now, not a drawer intent');
assert.deepEqual(resolveJournalTab('flow'), { view: 'import', intent: { kind: 'import', section: 'flow' } });
assert.equal(resolveJournalTab('add').intent?.kind, 'add');
assert.equal(resolveJournalTab('toString').view, 'dashboard', 'prototype keys are not tabs');
assert.equal(resolveJournalTab(null).view, 'dashboard');
assert.equal(resolveJournalTab(' Calendar ').view, 'calendar', 'trimmed, case-insensitive');
for (const [alias, view] of [['journal', 'daily'], ['notes', 'notebook'], ['setups', 'playbooks'], ['goals', 'progress'], ['blocked', 'missed'], ['alpaca', 'accounts'], ['preferences', 'settings']] as const) {
  assert.equal(resolveJournalTab(alias).view, view, `alias ${alias}`);
}
// Every sidebar page is reachable by its own id, and the 4 old destination ids still resolve.
for (const p of JOURNAL_PAGES) assert.equal(resolveJournalTab(p.id).view, p.id, `page ${p.id} resolves to itself`);
for (const old of ['dashboard', 'trades', 'analytics', 'record']) assert.ok(Object.prototype.hasOwnProperty.call(LEGACY_JTAB, old), `old view id ${old}`);
assert.deepEqual(JOURNAL_PAGES.map((p) => p.id), ['dashboard', 'calendar', 'daily', 'trades', 'missed', 'insights', 'reports', 'loss', 'playbooks', 'progress', 'notebook', 'import', 'accounts', 'settings', 'record', 'traders']);
assert.deepEqual(JOURNAL_GROUPS.map((g) => g.id), ['overview', 'trades', 'insights', 'improve', 'setup', 'platform']);
assert.ok(TRADE_PAGES.has('insights') && FILTERED_PAGES.has('insights'), 'Insights reads the filtered book');
for (const g of JOURNAL_GROUPS) assert.ok(JOURNAL_PAGES.some((p) => p.group === g.id), `group ${g.id} has pages`);
assert.equal(resolveJournalTab('losses').view, 'loss');
assert.ok(TRADE_PAGES.has('loss') && FILTERED_PAGES.has('loss'), 'Loss analysis reads the filtered book');
assert.ok(!JOURNAL_PAGES.some((p) => (p.id as string) === 'prop-firms'), 'Prop firms is not carried over');
assert.equal(resolveJournalPage('?jpage=progress&jtab=trades').view, 'progress', '?jpage= wins over ?jtab=');
assert.equal(resolveJournalPage('?jtab=missed').view, 'missed');
assert.equal(resolveJournalPage('').view, 'dashboard');
assert.ok([...TRADE_PAGES].every((v) => FILTERED_PAGES.has(v)), 'every trade page shows the filter bar');

// ── note keys ──
assert.equal(journalNoteKey('day_note', '2026-09-29'), 'day:2026-09-29');
assert.equal(journalNoteKey('playbook', ' ORB '), 'playbook:orb', 'one definition per setup, case-insensitive');
assert.equal(journalNoteKey('missed', '2026-09-29'), null, 'many missed trades per day');

// ── reports / progress / playbooks helpers ──
assert.deepEqual(reportBuckets(trades, 'weekday').map((b) => b.key), ['Tue'], 'all fixtures entered Tue Sep 1 ET');
assert.equal(reportBuckets(trades, 'duration')[0].key, '30m–2h');
assert.equal(reportBuckets(trades, 'symbol').find((b) => b.key === 'SPY')!.avgDurationMs != null, true);
assert.equal(missingDim(trades, 'setup'), 3, 'three fixtures have no setup');
const cross = crossBuckets(trades, 'setup', 'side');
assert.deepEqual(cross.map((c) => c.key), ['ORB × long']);
assert.equal(cross[0].closed, 2);
const roll = rollingStats(trades, 2);
assert.equal(roll.length, 3, '4 closes, window 2 → 3 windows');
assert.deepEqual([roll[0].winRate, roll[0].expectancy], [0.5, 25]);
assert.deepEqual([roll[2].winRate, roll[2].expectancy], [0.5, -50]);
assert.deepEqual(dayStreaks(dailyStats(trades)), { maxGreen: 1, maxRed: 1, current: -1 });
assert.equal(peakConcurrent(trades, Date.parse('2026-09-10T00:00:00Z')), 5, 'every fixture opened at the same instant');
assert.equal(peakConcurrent([toTrade(row({ entryTime: '2026-09-01T14:00:00Z', exitTime: '2026-09-01T15:00:00Z' })), toTrade(row({ entryTime: '2026-09-01T15:00:00Z', exitTime: '2026-09-01T16:00:00Z' }))]), 1, 'exit and entry at the same instant do not overlap');
assert.equal(noteLine(toTrade(row({ notes: 'Entry: ORB\nExit: gap magnet at $412.10 — banked +38%' })), 'Exit:'), 'gap magnet at $412.10 — banked +38%');
assert.equal(ruleOfReason('gap magnet at $412.10 — banked +38%'), 'gap magnet');
assert.equal(ruleOfReason('stop hit (−12%)'), 'stop hit');
assert.equal(ruleOfReason('target 1 hit — +40%'), 'target 1 hit', 'rule numbers stay, trade numbers go');
assert.equal(ruleOfReason('trailed out +12.5% below 190.25'), 'trailed out below', 'money/percent/decimals stripped');
assert.equal(periodStart('2026-09-30', 'week'), '2026-09-28');
assert.equal(periodStart('2026-09-30', 'month'), '2026-09-01');

// ── journal keys ──
assert.equal(parseJournalKey(null), 'mine');
assert.equal(parseJournalKey('BOT'), 'bot');
assert.equal(parseJournalKey('trader:femi'), 'trader:femi');
assert.equal(parseJournalKey('trader:../etc'), 'mine', 'bad slugs fall back to mine');
assert.equal(journalKindOf('trader:uzo'), 'trader');
assert.equal(traderOwnerId('abc'), 'trader:abc');

// ── broker fill pairing (Alpaca) ──
assert.deepEqual(decodeOccSymbol('AAPL240119C00190000'), { root: 'AAPL', expiry: '2024-01-19', optionType: 'call', strike: 190 });
const fill = (id: string, symbol: string, side: BrokerFill['side'], qty: number, price: number, time: string): BrokerFill => ({ id, symbol, side, qty, price, time });
const trips = pairFills([
  fill('f1', 'SPY', 'buy', 10, 100, '2026-09-01T14:00:00Z'),
  fill('f2', 'SPY', 'buy', 10, 102, '2026-09-01T14:05:00Z'),
  fill('f3', 'SPY', 'sell', 20, 105, '2026-09-01T15:00:00Z'),
  fill('f4', 'SPY', 'sell', 5, 106, '2026-09-02T14:00:00Z'),   // opens a short
  fill('f5', 'SPY', 'buy', 8, 104, '2026-09-02T15:00:00Z'),    // covers 5, flips long 3
  fill('o1', 'NVDA261016C00190000', 'buy', 2, 2.5, '2026-09-03T14:00:00Z'),
  fill('o2', 'NVDA261016C00190000', 'sell', 2, 4, '2026-09-04T14:00:00Z'),
]);
const spy1 = trips.find((t) => t.key === 'f1')!;
assert.deepEqual([spy1.direction, spy1.quantity, spy1.entryPrice, spy1.exitPrice, spy1.realizedPnL, spy1.status], ['long', 20, 101, 105, 80, 'closed']);
const short1 = trips.find((t) => t.key === 'f4')!;
assert.deepEqual([short1.direction, short1.quantity, short1.realizedPnL], ['short', 5, 10], 'short 5 @106 covered @104 = +$10');
const flip = trips.find((t) => t.key === 'f5:flip')!;
assert.deepEqual([flip.direction, flip.quantity, flip.status, flip.realizedPnL], ['long', 3, 'open', null], 'crossing fill opens the remainder');
const opt = trips.find((t) => t.key === 'o1')!;
assert.deepEqual([opt.symbol, opt.assetType, opt.optionType, opt.strikePrice, opt.expiryDate, opt.realizedPnL], ['NVDA', 'option', 'call', 190, '2026-10-16', 300], 'options carry the ×100 multiplier');
assert.deepEqual(pairFills([...[fill('f1', 'SPY', 'buy', 1, 1, '2026-09-01T14:00:00Z')]]).map((t) => t.key), ['f1'], 'deterministic keys');

// ── trade-desk idea → journal row ──
const idea = (p: Partial<DeskIdea>): DeskIdea => ({
  id: 'i1', symbol: 'AMD', assetType: 'stock', direction: 'long', entryPrice: 100, targetPrice: 110, stopLoss: 95, riskRewardRatio: 2,
  optionType: null, strikePrice: null, expiryDate: null, entryPremium: null, exitPremium: null, optionPercentGain: null,
  exitPrice: null, percentGain: null, outcomeStatus: 'open', resolutionReason: null, exitDate: null, timestamp: '2026-09-01T14:00:00Z',
  source: 'quant', catalyst: null, genConvictionBand: 'A', ...p,
});
const deskRow = (p: Partial<DeskIdea>) => { const r = mapDeskIdea(idea(p)); assert.ok('row' in r, JSON.stringify(r)); return (r as { row: any }).row; };
assert.deepEqual([deskRow({}).status, deskRow({}).realizedPnL], ['open', null]);
assert.equal(deskRow({ outcomeStatus: 'hit_target', exitPrice: 110, exitDate: '2026-09-03T14:00:00Z' }).realizedPnL, 100, '+10% on $1,000 notional');
assert.equal(deskRow({ direction: 'short', outcomeStatus: 'hit_stop', exitPrice: 105, exitDate: '2026-09-03T14:00:00Z' }).realizedPnL, -50, 'short stopped 5% higher');
assert.equal(deskRow({ assetType: 'option', optionType: 'call', strikePrice: 100, entryPremium: 2, exitPremium: 3.5, outcomeStatus: 'hit_target', exitDate: '2026-09-02T14:00:00Z' }).realizedPnL, 150, '1 contract');
assert.equal(deskRow({ assetType: 'option', optionType: 'put', direction: 'short', entryPremium: 2, optionPercentGain: -40, outcomeStatus: 'hit_stop', exitDate: '2026-09-02T14:00:00Z' }).direction, 'long', 'bought put = long contract');
assert.ok('excluded' in mapDeskIdea(idea({ outcomeStatus: 'expired', percentGain: 0 })), 'unmeasured expiry is excluded, not scored 0');
// ── position bias: a bought put is BEARISH, not "▲ LONG" (shared/position-bias.ts) ──
{
  const putRow = deskRow({ assetType: 'option', optionType: 'put', direction: 'short', entryPremium: 2, strikePrice: 279, expiryDate: '2026-09-30' });
  const pb = positionBias(putRow);
  assert.deepEqual([pb.bias, pb.arrow, pb.label, pb.leg], ['bear', '▼', 'BEAR', 'long put'], 'desk put row (direction long) renders bearish');
  assert.equal(positionBiasText(putRow), '▼ BEAR · long put');
  assert.equal(positionBiasText(putRow, true), '▼ BEAR');
  assert.equal(positionBiasText(deskRow({ assetType: 'option', optionType: 'call', entryPremium: 2 })), '▲ BULL · long call');
  assert.equal(positionBiasText({ direction: 'long', assetType: 'stock' }), '▲ BULL · long stock');
  assert.equal(positionBiasText({ direction: 'short', assetType: 'stock' }), '▼ BEAR · short stock');
  assert.equal(positionBiasText({ direction: 'short', assetType: 'option', optionType: 'call' }), '▼ BEAR · short call');
  assert.equal(positionBiasText({ direction: 'short', assetType: 'option', optionType: 'put' }), '▲ BULL · short put');
  assert.equal(positionBias({ direction: 'long', assetType: 'option', optionType: 'PUT' }).bias, 'bear', 'case-insensitive option type');
  assert.equal(positionBias({ direction: 'long', assetType: 'option', optionType: null }).leg, 'long option', 'option without a type falls back to side');
  // every journal SideChip site passes the instrument, so the chip can see the put
  const fsx = await import('node:fs');
  for (const f of ['client/src/pages/journal/trades-view.tsx', 'client/src/components/journal/trade-mini-list.tsx', 'client/src/pages/journal/trade-view.tsx', 'client/src/components/journal/trade-drawer.tsx']) {
    const txt = fsx.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    const chips = txt.match(/<SideChip [^>]*\/>/g) ?? [];
    assert.ok(chips.length > 0 && chips.every((c) => c.includes('optionType=')), `${f}: every SideChip passes optionType`);
  }
}

assert.ok('excluded' in mapDeskIdea(idea({ assetType: 'option', entryPremium: null })), 'option without premium is excluded');
assert.ok('excluded' in mapDeskIdea(idea({ outcomeStatus: 'expired', resolutionReason: 'missed_entry_would_have_won', percentGain: 12 })), 'never-entered idea is not a trade');

// ── NEXUS book verification (audit 2026-10-06): inflated rows are not counted ──
{
  const closedAt = '2026-09-02T15:00:00Z';
  const opt = (p: Partial<DeskIdea>) => idea({ assetType: 'option', optionType: 'call', strikePrice: 100, entryPrice: 101, entryPremium: 2, outcomeStatus: 'hit_target', exitPrice: 104, exitDate: closedAt, ...p });
  const flagsOf = (i: DeskIdea) => deskIntegrityFlags(i).map((f) => f.code);
  // Clean option + stock rows: nothing fails.
  assert.deepEqual(flagsOf(opt({ exitPremium: 4.5 })), []);
  assert.deepEqual(flagsOf(idea({ outcomeStatus: 'hit_target', exitPrice: 110, highestPriceReached: 111, lowestPriceReached: 99 })), []);
  // Premium-space ladder (SMCI: entry 3.09 vs strike 40) — the validator's
  // unit guard existed but the journal never applied it.
  assert.ok(flagsOf(opt({ optionType: 'put', strikePrice: 40, entryPrice: 3.09, exitPrice: 1.55, entryPremium: 3.09, exitPremium: 38.45 })).includes('premium_scale_ladder'));
  // Intrinsic floor off a premium-scale fill: put exit premium 38.45 on a 40 strike — passes the ≤K cap, caught by the fill scale.
  assert.ok(flagsOf(opt({ optionType: 'put', strikePrice: 40, entryPrice: 39, exitPrice: 1.55, entryPremium: 1, exitPremium: 38.45 })).includes('fill_off_strike_scale'));
  // Exit premium above what the contract can be worth: $866 on a $100 call with the underlying at $104.
  assert.ok(flagsOf(opt({ exitPremium: 866 })).includes('impossible_exit_premium'));
  // Entry premium in per-contract units (200 = $2.00 × 100).
  assert.ok(flagsOf(opt({ entryPremium: 200, exitPremium: 450 })).includes('impossible_entry_premium'));
  assert.ok(flagsOf(opt({ entryPremium: 0.01, exitPremium: 0.5 })).includes('sub_tick_entry_premium'));
  assert.ok(flagsOf(opt({ entryPremium: 0.1, exitPremium: 3 })).includes('implausible_contract_multiple'));
  // Inferred exit from % is a caveat, not a failure.
  assert.deepEqual(deskIntegrityFlags(opt({ optionPercentGain: 50 })).map((f) => [f.code, f.severity]), [['exit_premium_inferred', 'caveat']]);
  // Stocks: wrong-instrument exit and exit outside the recorded path.
  assert.ok(flagsOf(idea({ outcomeStatus: 'hit_target', exitPrice: 8760 })).includes('implausible_underlying_move'));
  assert.ok(flagsOf(idea({ outcomeStatus: 'hit_target', exitPrice: 120, highestPriceReached: 108, lowestPriceReached: 97 })).includes('exit_outside_recorded_range'));
  // Synthetic backfill rows are not publications.
  assert.ok(flagsOf(idea({ outcomeStatus: 'hit_target', exitPrice: 105, dataSourceUsed: 'backfill_synthetic' })).includes('synthetic_or_retroactive'));
  assert.equal(isSyntheticOrRetroactive({ sessionContext: 'backfill' }), true);

  // Duplicates: same contract published twice while the first was open → the second is labelled.
  const d = findDuplicates([
    { id: 'a', symbol: 'NVDA', assetType: 'option', direction: 'long', optionType: 'call', strikePrice: 190, expiryDate: '2026-10-16', entryMs: 1, exitMs: 10 },
    { id: 'b', symbol: 'nvda', assetType: 'option', direction: 'long', optionType: 'CALL', strikePrice: 190, expiryDate: '2026-10-16T00:00:00Z', entryMs: 5, exitMs: 12 },
    { id: 'c', symbol: 'NVDA', assetType: 'option', direction: 'long', optionType: 'call', strikePrice: 190, expiryDate: '2026-10-16', entryMs: 11, exitMs: 20 },
    { id: 'd', symbol: 'NVDA', assetType: 'option', direction: 'long', optionType: 'call', strikePrice: 195, expiryDate: '2026-10-16', entryMs: 5, exitMs: 12 },
  ]);
  assert.deepEqual([...d.entries()], [['b', 'a']], 'b overlaps a; c opens after a closed; d is another strike');

  // verifyDeskRows: the default book counts clean rows only, labels the rest.
  const pair = (i: DeskIdea) => { const m = mapDeskIdea(i); assert.ok('row' in m); return { idea: i, row: (m as any).row }; };
  const clean = opt({ id: 'clean', exitPremium: 4.5 });
  const inflated = opt({ id: 'inflated', symbol: 'TSLA', exitPremium: 866 });
  const dupe = opt({ id: 'dupe', exitPremium: 4.5, timestamp: '2026-09-01T15:00:00Z' });
  const open = idea({ id: 'open' });
  const res = verifyDeskRows([pair(clean), pair(inflated), pair(dupe), pair(open)], null);
  assert.deepEqual(res.counted.map((r) => r.id).sort(), ['desk:clean', 'desk:open']);
  assert.deepEqual(res.unverified.map((r) => [r.id, r.verification!.reasons[0].code]).sort(), [['desk:dupe', 'duplicate'], ['desk:inflated', 'impossible_exit_premium']]);
  assert.equal(res.counted.find((r) => r.id === 'desk:clean')!.verification!.status, 'checked');
  assert.match(res.unverified.find((r) => r.id === 'desk:inflated')!.notes!, /UNVERIFIED — recorded \+\$86,400/);
  const meta = deskVerificationMeta(res, null, false);
  assert.deepEqual([meta.counted.checked, meta.counted.verified, meta.unverified.count, meta.ledger], [1, 0, 2, null]);
  assert.equal(meta.unverified.recordedPnL, 86400 + 250);
  assert.equal(meta.unverified.rows[0].id, 'desk:inflated', 'largest recorded P&L first');

  // A bar ledger overrides: VERIFIED counts (even past a caveat), MISMATCH is not counted and shows the recomputed P&L.
  const ledger = { asOf: '2026-10-06T22:00:00Z', path: '/tmp/x.json', byId: new Map([
    ['clean', { verdict: 'MISMATCH' as const, recordedPnL: 250, recomputedPnL: 40, bugClass: 'entry_premium_at_publish_not_trigger', reason: 'entry 2 vs bar 3.6' }],
    ['inflated', { verdict: 'VERIFIED' as const, recordedPnL: 86400, recomputedPnL: 86400, bugClass: null, reason: null }],
  ]) };
  const res2 = verifyDeskRows([pair(clean), pair(inflated), pair(open)], ledger);
  assert.deepEqual(res2.counted.map((r) => [r.id, r.verification!.status]).sort(), [['desk:inflated', 'verified'], ['desk:open', 'checked']]);
  assert.deepEqual([res2.unverified[0].id, res2.unverified[0].verification!.recomputedPnL, res2.unverified[0].verification!.reasons[0].code], ['desk:clean', 40, 'bar_mismatch']);
  // Wiring: loader applies it; the route takes ?unverified=1; the basis panel lists them.
  const fsx = await import('node:fs');
  const read = (f: string) => fsx.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  assert.match(read('server/journal-sources.ts'), /verifyDeskRows\(pairs, ledger\)/);
  assert.match(read('server/routes.ts'), /loadJournal\(j, \{ includeUnverified \}\)/);
  assert.match(read('client/src/components/journal/journal-switcher.tsx'), /UNVERIFIED — recorded/);
  // The verifier is read-only: one READ ONLY transaction, rolled back, and no write statement anywhere.
  const verifier = read('research/verify-nexus-book.ts');
  assert.match(verifier, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(verifier, /query\('ROLLBACK'\)/);
  assert.equal(/\b(UPDATE|INSERT INTO|DELETE FROM|TRUNCATE|ALTER TABLE)\b/.test(verifier.replace(/\/\*[\s\S]*?\*\//g, '')), false, 'no write SQL in the verifier');
  const dry = read('research/repair-nexus-book-dryrun.ts');
  assert.equal(/from 'pg'|server\/db/.test(dry), false, 'the repair proposal never opens a DB connection');
}

// ── Discord parser: sample messages ──
let mid = 0;
const dm = (content: string, t: string, extra: Partial<DiscordMsg> = {}): DiscordMsg => ({
  id: String(++mid), timestamp: t, authorId: 'femi', authorName: 'Femi', content, attachments: [], replyTo: null, ...extra,
});
const P = (c: string) => parseDiscordMessage(dm(c, '2026-09-29T14:00:00Z'));
const be = P('BE 300c 10/2 @1.00');
assert.deepEqual([be.kind, be.symbol, be.assetType, be.optionType, be.strike, be.expiry, be.price], ['entry', 'BE', 'option', 'call', 300, '2026-10-02', 1], 'BE is a ticker right before a strike');
const nv = P('in NVDA 190c 10/17 @ 2.15 x3');
assert.deepEqual([nv.kind, nv.symbol, nv.strike, nv.expiry, nv.price, nv.qty], ['entry', 'NVDA', 190, '2026-10-17', 2.15, 3]);
assert.deepEqual([P('in NVDA 190c').kind, P('in NVDA 190c').price], ['entry', null], 'entry without a price parses (kept as a note at pairing)');
assert.deepEqual([P('out +300%').kind, P('out +300%').pct], ['exit', 300]);
assert.equal(P('trimmed').kind, 'trim');
assert.deepEqual([P('stopped out of TSLA -8%').kind, P('stopped out of TSLA -8%').symbol, P('stopped out of TSLA -8%').pct], ['exit', 'TSLA', -8]);
assert.deepEqual([P('short $SPY @ 452.1').kind, P('short $SPY @ 452.1').side, P('short $SPY @ 452.1').assetType], ['entry', 'short', 'stock']);
assert.deepEqual([P('**IN $TSLA @ 251.40** 🚀').symbol, P('**IN $TSLA @ 251.40** 🚀').price], ['TSLA', 251.4], 'markdown + emoji stripped');
assert.deepEqual([P('SPY 0dte 450p @.45').expiry, P('SPY 0dte 450p @.45').price], ['2026-09-29', 0.45], '0dte = the post day');
assert.equal(P('in the money on these, holding').kind, 'note', '"in" inside prose is not an entry');
assert.equal(P('NVDA looking strong above 190, watching the HOD. CPI tomorrow.').kind, 'note');
assert.deepEqual(P('NVDA looking strong above 190, watching the HOD. CPI tomorrow.').tickers, ['NVDA'], 'HOD/CPI are not tickers');
assert.equal(resolveExpiry('1/16', '2026-12-20T15:00:00Z'), '2027-01-16', 'Dec post, Jan expiry → next year');

// ── Discord pairing ──
mid = 0;
const shot = { url: 'https://cdn.discordapp.com/attachments/1/2/be.png', name: 'be.png', isImage: true };
const paired = pairDiscordMessages([
  dm('BE 300c 10/2 @1.00', '2026-09-29T14:00:00Z', { attachments: [shot] }),        // 1
  dm('in NVDA 190c 10/17 @ 2.15 x2', '2026-09-29T15:00:00Z'),                        // 2
  dm('trimmed', '2026-09-30T14:00:00Z', { replyTo: '1' }),                            // 3 → BE
  dm('out +300%', '2026-10-01T14:00:00Z', { replyTo: '1' }),                          // 4 → BE, derived exit 4.00
  dm('NVDA holding the 50d, adding if it reclaims 192. chart below', '2026-10-01T15:00:00Z'), // 5 note
  dm('out NVDA 190c @ 1.05', '2026-10-02T15:00:00Z'),                                 // 6 → NVDA by contract
  dm('out TSLA +50%', '2026-10-02T16:00:00Z'),                                        // 7 no entry → note
  dm('in AMD 150c 11/20 @ 3', '2026-10-03T14:00:00Z'),                                // 8 open, then…
  dm('closed it', '2026-10-03T15:00:00Z'),                                            // 9 only open → closes AMD, no price → note
  dm('gm', '2026-10-03T16:00:00Z'),                                                   // 10 chatter, ignored
  dm('long AMD 145.20', '2026-10-04T14:00:00Z'),                                      // 11 stays open
]);
const beT = paired.trades.find((t) => t.symbol === 'BE')!;
assert.deepEqual([beT.key, beT.status, beT.entryPrice, beT.exitPrice, beT.exitDerivedFromPct, beT.quantity, beT.qtyStated, beT.screenshot],
  ['1', 'closed', 1, 4, 300, 1, false, shot.url]);
assert.deepEqual(beT.messageIds, ['1', '3', '4'], 'reply-linked trim + exit join the trade');
assert.ok(beT.flags.some((f) => /trim/.test(f)) && beT.flags.some((f) => /Size not stated/.test(f)), 'disclosures ride with the trade');
const nvT = paired.trades.find((t) => t.symbol === 'NVDA')!;
assert.deepEqual([nvT.quantity, nvT.qtyStated, nvT.exitPrice, nvT.status], [2, true, 1.05, 'closed']);
const amdOpen = paired.trades.find((t) => t.symbol === 'AMD')!;
assert.deepEqual([amdOpen.assetType, amdOpen.status, amdOpen.entryPrice], ['stock', 'open', 145.2]);
assert.equal(paired.trades.length, 3, 'BE, NVDA, AMD stock — the unpriced AMD option close is not scored');
const reasons = paired.notes.map((n) => `${n.messageId}:${n.reason}`);
assert.ok(reasons.includes('5:analysis'), 'analysis post kept as a note');
assert.ok(reasons.includes('7:unmatched_exit'), 'exit with no entry kept as a note');
assert.ok(paired.notes.some((n) => n.reason === 'unpriced_exit' && n.symbols.includes('AMD')), 'close without a price is a note, not a P&L');
assert.equal(paired.stats.ignored, 1, '"gm" is ignored chatter');
assert.equal(paired.notes.find((n) => n.messageId === '5')!.day, '2026-10-01');
// Idempotent: the same messages always pair to the same keys.
assert.deepEqual(pairDiscordMessages([dm('BE 300c 10/2 @1.00', '2026-09-29T14:00:00Z', { id: 'm-1' })]).trades.map((t) => t.key), ['m-1']);

// ── DiscordChatExporter inputs ──
const dceJson = JSON.stringify({ guild: { name: 'Desk' }, channel: { name: 'femi-journal' }, messages: [
  { id: '900', timestamp: '2026-09-29T14:00:00+00:00', author: { id: 'a1', name: 'femi', nickname: 'Femi' }, content: 'BE 300c 10/2 @1.00', attachments: [{ url: 'https://cdn.discordapp.com/x.png', fileName: 'x.png' }], reference: null },
  { id: '901', timestamp: '2026-09-30T14:00:00+00:00', author: { id: 'a1', name: 'femi' }, content: 'out +100%', attachments: [], reference: { messageId: '900' } },
] });
const nj = normalizeDiscordExport(dceJson);
assert.deepEqual([nj.format, nj.channel, nj.messages.length, nj.messages[1].replyTo, nj.messages[0].attachments[0].isImage], ['dce-json', 'Desk / #femi-journal', 2, '900', true]);
assert.equal(pairDiscordMessages(nj.messages).trades[0].exitPrice, 2);
const dceCsv = 'AuthorID,Author,Date,Content,Attachments,Reactions\n"a1","femi","2026-09-29T10:00:00.000-04:00","in NVDA 190c 10/17 @ 2.15","",""\n"a1","femi","2026-09-30T10:00:00.000-04:00","out NVDA 190c @ 3.15, great ""squeeze""","",""\n';
const nc = normalizeDiscordExport(dceCsv);
assert.equal(nc.format, 'dce-csv');
assert.equal(nc.messages[1].content, 'out NVDA 190c @ 3.15, great "squeeze"', 'quoted CSV cells');
assert.equal(normalizeDiscordExport(dceCsv).messages[0].id, nc.messages[0].id, 'CSV ids are stable hashes');
assert.equal(pairDiscordMessages(nc.messages).trades[0].exitPrice, 3.15);
assert.throws(() => normalizeDiscordExport('hello,world\n1,2'), /Unrecognised file/);

// ── bot runs: every portfolio, labelled; multi-run record through metrics.ts ──
{
  const pfs = [
    { id: 'aaaaaaaa-1', name: 'Quant Bot', startingCapital: 10_000, createdAt: '2026-08-24T13:00:00Z' },
    { id: 'bbbbbbbb-2', name: 'Quant Bot · 100K', startingCapital: 100_000, createdAt: '2026-08-26T19:45:00Z' },
    { id: 'cccccccc-3', name: 'Quant Bot · 100K', startingCapital: 100_000, createdAt: '2026-09-23T20:16:00Z' },
  ];
  const spans = [
    { portfolioId: 'aaaaaaaa-1', status: 'open', entryTime: '2026-08-24T13:30:00Z', exitTime: null },
    { portfolioId: 'bbbbbbbb-2', status: 'closed', entryTime: '2026-08-26T19:49:00Z', exitTime: '2026-08-27T14:30:00Z' },
    { portfolioId: 'bbbbbbbb-2', status: 'closed', entryTime: '2026-09-09T14:52:00Z', exitTime: '2026-09-10T14:00:00Z' },
    { portfolioId: 'bbbbbbbb-2', status: 'open', entryTime: '2026-09-09T13:57:00Z', exitTime: null },
    { portfolioId: 'cccccccc-3', status: 'closed', entryTime: '2026-09-24T18:39:00Z', exitTime: '2026-09-25T16:10:00Z' },
  ];
  const runs = labelBotRuns(pfs, spans, 'Quant Bot · 100K');
  assert.deepEqual(runs.map((r) => r.label), ['Run 1 · 10K · Aug 24', 'Run 2 · 100K · Aug 26–Sep 10', 'Run 3 · 100K · Sep 24–']);
  assert.deepEqual(runs.map((r) => r.active), [false, false, true], 'the MOST RECENT same-named portfolio is the one traded');
  assert.equal(runs[1].displayName, 'Quant Bot · 100K #bbbbbb', 'duplicate names disambiguated for display');
  assert.equal(runs[0].displayName, 'Quant Bot', 'unique names untouched');
  assert.deepEqual([runs[1].closed, runs[1].open], [2, 1]);
  assert.equal(pickActiveBotPortfolio([...pfs].reverse(), 'Quant Bot · 100K')!.id, 'cccccccc-3', 'order-independent');
  assert.equal(runsCovered(['bbbbbbbb-2', 'cccccccc-3'], runs), 'Run 2 + Run 3');
  assert.equal(runsCovered(['aaaaaaaa-1', 'bbbbbbbb-2', 'cccccccc-3'], runs), 'all 3 runs');

  const br = (runId: string, label: string, p: Partial<JournalTradeRow>) => row({ runId, runLabel: label, broker: 'quant-bot', assetType: 'option', ...p });
  const botRows = [
    br('bbbbbbbb-2', runs[1].label, { realizedPnL: 861 }),
    br('bbbbbbbb-2', runs[1].label, { realizedPnL: -432 }),
    br('bbbbbbbb-2', runs[1].label, { status: 'open', realizedPnL: null, exitPrice: null, exitTime: null, mark: { price: 3.25, asOf: '2026-09-10T14:10:00Z', unrealizedPnL: 93 } }),
    br('cccccccc-3', runs[2].label, { realizedPnL: -630 }),
    br('cccccccc-3', runs[2].label, { realizedPnL: -2870 }),
    br('cccccccc-3', runs[2].label, { status: 'open', realizedPnL: null, exitPrice: null, exitTime: null, mark: null }),
  ];
  const rr = runRecords(botRows.map(toTrade));
  assert.deepEqual(rr.runs.map((r) => [r.key, r.closed, r.wins, r.netPnl, r.open, r.openMarked, r.unrealized]), [
    ['Run 2 · 100K · Aug 26–Sep 10', 2, 1, 429, 1, 1, 93],
    ['Run 3 · 100K · Sep 24–', 2, 0, -3500, 1, 0, null],
  ], 'per-run record; an unmarked open is unknown, never $0');
  assert.deepEqual([rr.combined.closed, rr.combined.wins, rr.combined.netPnl, rr.combined.winRate], [4, 1, -3071, 0.25], 'combined = every run, nothing hidden');
  assert.equal(computeMetrics(botRows.map(toTrade)).netPnl, rr.combined.netPnl, 'journal headline and run table agree');
  const onlyRun3 = parseJournalFilters((k) => new URLSearchParams('jrun=cccccccc-3').get(k));
  assert.deepEqual(onlyRun3, { run: 'cccccccc-3' });
  assert.equal(botRows.filter((r) => matchesJournalFilters(r, onlyRun3)).length, 3, 'run filter');
  assert.deepEqual(groupBy(botRows.map(toTrade), 'run').map((b) => b.key), [runs[1].label, runs[2].label]);
}

// ── expiry settlement: intrinsic at the underlying's expiry-day close ──
{
  const opt = (p: Partial<OpenBotOptionRow>): OpenBotOptionRow => ({
    id: 'x', portfolioId: 'p', symbol: 'AAPL', assetType: 'option', status: 'open', optionType: 'call', strikePrice: 325,
    expiryDate: '2026-09-18', entryPrice: 2.94, quantity: 3, currentPrice: 3.25, lastPriceUpdate: '2026-09-10T14:10:00Z', ...p,
  });
  const now = new Date('2026-09-29T20:00:00Z');
  const { due, skipped } = dueForSettlement([
    opt({ id: 'a' }),
    opt({ id: 'stock', assetType: 'stock' }),                       // shares never auto-close
    opt({ id: 'live', expiryDate: '2026-10-16' }),                    // not expired
    opt({ id: 'nostrike', strikePrice: null }),
  ], now);
  assert.deepEqual(due.map((r) => r.id), ['a']);
  assert.deepEqual(skipped.map((r) => r.id), ['nostrike']);
  const s = settleAtExpiry(opt({}), 336.13);
  assert.deepEqual([s.exitPrice, s.realizedPnL, s.proceeds, s.exitTime], [11.13, 2457, 3339, '2026-09-18T20:00:00.000Z']);
  assert.equal(settleAtExpiry(opt({ symbol: 'COPX', strikePrice: 105, entryPrice: 1.73, quantity: 1 }), 87.28).realizedPnL, -173, 'OTM call expires worthless');
  assert.equal(settleAtExpiry(opt({ optionType: 'put', strikePrice: 340 }), 336.13).exitPrice, 3.87, 'put intrinsic');
  assert.equal(nyCloseIso('2026-12-18'), '2026-12-18T21:00:00.000Z', 'EST close');
  assert.equal(expirySessionOver('2026-09-29', new Date('2026-09-29T20:10:00Z')), false, 'same day before 16:15 ET');
  assert.equal(expirySessionOver('2026-09-29', new Date('2026-09-29T20:20:00Z')), true);
}
// ── metrics-extra (LuxAlgo-parity pages) ──
{
  let k = 0;
  const xr = (p: Partial<JournalTradeRow>): JournalTradeRow => ({
    id: `x${++k}`, symbol: 'SPY', assetType: 'stock', direction: 'long', quantity: 1, entryPrice: 100, exitPrice: 101,
    entryTime: '2026-09-01T14:00:00Z', exitTime: '2026-09-01T15:00:00Z', status: 'closed', realizedPnL: 1, fees: 0, broker: 'manual', ...p,
  });
  const xs = [
    xr({ realizedPnL: 100, setupType: 'ORB', entryTime: '2026-09-01T13:45:00Z', exitTime: '2026-09-01T15:00:00Z' }), // Tue 09:45 ET
    xr({ realizedPnL: -50, setupType: 'ORB', entryTime: '2026-09-02T14:10:00Z', exitTime: '2026-09-02T15:00:00Z' }), // Wed 10:10
    xr({ realizedPnL: 200, symbol: 'NVDA', entryTime: '2026-09-03T14:00:00Z', exitTime: '2026-09-03T15:00:00Z' }),
    xr({ realizedPnL: -300, entryTime: '2026-09-04T14:00:00Z', exitTime: '2026-09-04T15:00:00Z' }),
    xr({ realizedPnL: 150, entryTime: '2026-09-08T14:00:00Z', exitTime: '2026-09-08T16:00:00Z' }),
  ].map(toTrade);
  const d = dailyStats(xs), c = equityCurve(xs), m = computeMetrics(xs, d, c);
  // Edge score: without a balance the drawdown axis is null and the composite is WITHHELD (never a neutral 50).
  const noBal = edgeScore(m, c, null);
  assert.equal(noBal.score, null);
  assert.equal(noBal.components.drawdown, null);
  assert.match(noBal.withheld!, /balance/);
  assert.equal(edgeScore({ ...m, closedTrades: 4 }, c, 10_000).withheld, 'Needs 5+ closed trades (n=4).');
  // curve: 100, 50, 250, -50, 100 → peak 250, max DD 300 at base 10000+250.
  assert.equal(maxDrawdownPct(c, 10_000)!.toFixed(6), (300 / 10_250).toFixed(6));
  const withBal = edgeScore(m, c, 10_000);
  assert.ok(withBal.score != null && withBal.score > 0 && withBal.score <= 100);
  assert.equal(Math.round(withBal.components.winRate), 100, '60% win rate = full marks (3/5 = 60%)');
  assert.deepEqual(relativeDrawdown(c, null), [], 'no balance → no relative drawdown series');
  assert.equal(relativeDrawdown(c, 10_000).length, c.length);
  // Weekday × hour grid (New York entry time).
  const g = timeGrid(xs);
  assert.equal(g.n, 5);
  assert.equal(g.cells.get('Tue|9')!.netPnl, 100, 'Tue 09:45 ET bucket');
  assert.equal(g.cells.get('Wed|10')!.netPnl, -50);
  // Calendar insights.
  const ci = calendarInsights(d);
  assert.deepEqual([ci.tradingDays, ci.greenDays, ci.redDays], [5, 3, 2]);
  assert.equal(ci.maxGreenStreak, 1);
  assert.ok(ci.bestWeekday && ci.worstWeekday);
  // Rolling trends: window 3 over 5 closes → 3 points; PF null when a window has no losses.
  const tr = performanceTrends(xs, 3);
  assert.equal(tr.length, 3);
  assert.equal(tr[0].winRate.toFixed(4), (2 / 3).toFixed(4));
  assert.equal(performanceTrends([xs[0], xs[2]], 2)[0].profitFactor, null);
  // Playbook rules from a definition.
  assert.deepEqual(playbookRules('Opening range breakout\n- Wait 15 minutes\n- Stop under OR low\n\nnote'), ['Wait 15 minutes', 'Stop under OR low']);
  assert.deepEqual(playbookRules('Desc line\nRule one\nRule two'), ['Rule one', 'Rule two'], 'no bullets: every line after the description');
  assert.deepEqual(playbookRules(''), []);
  // Trade review codec: round-trip, tolerant decode, empty → ''.
  const rv: TradeReview = { v: 1, notes: '## ok', checklist: { 'Wait 15 minutes': 'followed', 'Stop under OR low': 'broken' }, annotations: [{ id: 'a', text: 'entry', at: '2026-09-01T13:45:00Z', price: 101 }], stop: 99, target: 110 };
  assert.deepEqual(decodeTradeReview(encodeTradeReview(rv)), rv);
  assert.equal(decodeTradeReview('plain old text').notes, 'plain old text');
  assert.equal(decodeTradeReview('{"v":1,"checklist":{"x":"maybe"},"stop":-4}').stop, null);
  assert.deepEqual(decodeTradeReview('{"v":1,"checklist":{"x":"maybe"}}').checklist, {});
  assert.equal(encodeTradeReview({ v: 1, notes: '  ', checklist: {}, annotations: [], stop: null, target: null }), '');
  // Adherence: ORB trades xs[0] (+100, all followed) and xs[1] (−50, one broken).
  const reviews = new Map<string, TradeReview>([
    [xs[0].id, { ...rv, checklist: { 'Wait 15 minutes': 'followed', 'Stop under OR low': 'followed' } }],
    [xs[1].id, { ...rv, checklist: { 'Wait 15 minutes': 'followed', 'Stop under OR low': 'broken' } }],
  ]);
  const [ad] = playbookAdherence(xs, [{ setup: 'orb', rules: ['Wait 15 minutes', 'Stop under OR low'] }], reviews);
  assert.deepEqual([ad.trades, ad.reviewed, ad.followedAll.closed, ad.brokeAny.closed, ad.unassessed], [2, 2, 1, 1, 0]);
  assert.equal(ad.rate, 0.75);
  assert.deepEqual([ad.perRule[1].rate, ad.perRule[1].followed.netPnl, ad.perRule[1].broken.netPnl], [0.5, 100, -50]);
  // Planned levels from ledger notes (trade desk format).
  assert.deepEqual(planLevels('Published LONG SPY\nplan: entry 412 · target 430.5 · stop 405'), { stop: 405, target: 430.5 });
  assert.deepEqual(planLevels('plan: entry 412 · target — · stop —'), { stop: null, target: null });
  // Day curve + measured recap (no generated prose: every number is the day's).
  assert.deepEqual(dayEquity(xs, '2026-09-01').map((p) => p.cum), [100]);
  const recap = dayRecap('2026-09-01', xs, d);
  assert.match(recap[0].text, /Closed 1 trade for \+\$100\.00 net/);
  assert.match(recap[0].text, /n=4 days/);
  assert.deepEqual(dayRecap('2026-01-01', xs, d), [], 'no closes → no recap');
  // Market window from bars: entry at bar 1, exit at bar 3.
  const bars = [0, 1, 2, 3, 4, 5].map((i) => ({ time: Date.parse('2026-09-01T13:30:00Z') + i * 3_600_000, open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i }));
  const mw = marketWindow(bars, '1h', bars[1].time + 60_000, bars[3].time + 60_000, 'long', 101);
  assert.deepEqual([mw.barsInTrade, mw.underlyingAtEntry, mw.underlyingAtExit, mw.highInTrade, mw.lowInTrade], [3, 102, 104, 105, 100]);
  assert.equal(mw.mfePct!.toFixed(4), (4 / 101).toFixed(4));
  assert.equal(mw.maePct!.toFixed(4), (-1 / 101).toFixed(4));
  assert.equal(mw.afterExitBars, 2, 'after-exit window is capped by the bars that exist');
  assert.equal(marketWindow(bars, '1h', Date.parse('2020-01-01'), null, 'long', 1).barsInTrade, 0, 'entry outside the bars → no window');
  // Timeframe: a 30-minute trade yesterday → 1m; a trade 3 months ago → 1h; 3 years ago → 1W.
  const now = Date.parse('2026-09-29T16:00:00Z');
  assert.equal(tradeTimeframe(now - 86_400_000, now - 86_400_000 + 1_800_000, now), '1m');
  assert.equal(tradeTimeframe(now - 90 * 86_400_000, now - 89 * 86_400_000, now), '1h');
  assert.equal(tradeTimeframe(now - 3 * 365 * 86_400_000, null, now), '1W');
  // CSV: quoting and formula-injection guard.
  assert.equal(toCsv([['a,b', '=SUM(A1)', -5, null, 'x"y']]), '"a,b",\'=SUM(A1),-5,,"x""y"\r\n');
  // Import reconciliation: row errors grouped by reason.
  const ge = groupImportErrors(['Row 3: bad price 1.2', 'Row 9: bad price 4', 'Save failed for SPY: boom', 'odd']);
  assert.deepEqual(ge.rejected, [{ reason: 'bad price #', rows: [3, 9] }]);
  assert.deepEqual([ge.saves.length, ge.other.length], [1, 1]);
  // Review notes key.
  assert.equal(journalNoteKey('trade_review', 'abc-123'), 'trade:abc-123');
}

// ── loss analysis: taxonomy rules (client/src/lib/journal/loss-analysis.ts) ──
{
  const H = 3_600_000;
  // Hourly bars from 2026-09-01 13:30Z (09:30 ET, a Tuesday), one per hour, OHLC from a close path.
  const t0 = Date.parse('2026-09-01T13:30:00Z');
  const mk = (path: [number, number, number][]): Bar[] => path.map(([o, h, l], i) => ({ time: t0 + i * H, open: o, high: h, low: l, close: (h + l) / 2 }));
  const flat = (n: number, px: number): [number, number, number][] => Array.from({ length: n }, () => [px, px + 0.1, px - 0.1]);
  const iso = (i: number) => new Date(t0 + i * H + 60_000).toISOString();
  const lrow = (p: Partial<LossRow>): LossRow => ({
    id: `l${Math.random()}`, symbol: 'TST', assetType: 'stock', direction: 'long', entryPrice: 100, entryTime: iso(0), exitTime: iso(5),
    realizedPnL: -20, status: 'closed', notes: 'plan: entry 100 · target 104 · stop 98\noutcome: hit_stop', setupType: 'market_scanner', ...p,
  });
  const cls = (row: LossRow, bars: Bar[]) => analyseTrade(row, { h1: bars, d1: null }, t0 + 400 * H);

  // Context parsing: desk notes → plan, exit category, conviction; option thesis from the contract.
  const c = tradeContext(lrow({ notes: 'plan: entry 412.5 · target 430 · stop 405\nconviction band at publish: A\noutcome: expired (time)' }));
  assert.deepEqual([c.planEntry, c.target, c.stop, c.exitCat, c.conviction], [412.5, 430, 405, 'expired', 'A']);
  assert.equal(tradeContext(lrow({ assetType: 'option', optionType: 'put', direction: 'long' })).thesis, 'short', 'a bought put is short the underlying');
  assert.equal(tradeContext(lrow({ notes: 'Exit: stop loss hit' })).exitCat, 'stop', 'bot exit reason');
  assert.equal(tradeContext(lrow({ notes: 'outcome: expired (stop never printed)' })).exitCat, 'expired', 'desk status wins over its prose');
  assert.equal(exitCategory(''), 'not recorded');
  assert.equal(exitCategory('hit_target'), 'target');
  // New York time and regular hours.
  assert.deepEqual(etParts(Date.parse('2026-09-01T13:30:00Z')), { weekday: 'Tue', hour: 9, minute: 30 });
  assert.equal(isOutsideRTH(Date.parse('2026-09-01T13:30:00Z')), false, '09:30 ET is regular hours');
  assert.equal(isOutsideRTH(Date.parse('2026-09-02T00:30:00Z')), true, '20:30 ET is not');
  assert.equal(isOutsideRTH(Date.parse('2026-09-05T15:00:00Z')), true, 'Saturday is not');
  assert.equal(dteBucket(14), '8–30 DTE');
  assert.equal(dteBucket(null), 'not an option');
  assert.equal(holdBucket(30 * 60_000), '< 1h');

  // 1 · wrong direction: never above +0.2R (stop 98 → R = 2), stopped, kept falling.
  const down = mk([[100, 100.2, 99.5], [99.5, 99.6, 99], [99, 99.1, 98.5], [98.5, 98.6, 97.9], [97.9, 98, 97.5], [97.5, 97.6, 97], ...flat(30, 96)]);
  const a1 = cls(lrow({}), down);
  assert.equal(a1.cls, 'wrong_direction');
  assert.ok(a1.flags.includes('never_in_profit') && a1.flags.includes('stop_printed'));
  assert.equal(a1.risk, 2);
  assert.ok(Math.abs(a1.mfeR! - 0.1) < 1e-9 && a1.maeR! <= -1.5);
  assert.equal(a1.tMaeMs, 5 * H - 60_000, 'time to MAE = the bar the worst low printed');

  // 2 · gave back a winner: +1.25R, then stopped.
  const a2 = cls(lrow({}), mk([[100, 101.5, 99.9], [101.5, 102.5, 101], [102, 102.1, 100], [100, 100.1, 98.5], [98.5, 98.6, 97.9], [97.9, 98, 97.8], ...flat(30, 97)]));
  assert.equal(a2.cls, 'gave_back');
  assert.ok(a2.mfeR! >= 1);

  // 3 · stop too tight: stopped at 97.9 (never in profit either), then the target printed — precedence stop_tight > wrong_direction.
  const a3 = cls(lrow({}), mk([[100, 100.1, 99], [99, 99.2, 97.9], [98, 98.5, 97.9], [98, 98.2, 97.95], [98, 98.1, 97.95], [98, 98.1, 97.95], [99, 101, 98.9], [101, 104.5, 100.8], ...flat(20, 103)]));
  assert.equal(a3.cls, 'stop_tight');
  assert.ok(a3.flags.includes('never_in_profit') && a3.flags.includes('target_after_exit'), 'outranked rules stay as flags');

  // 4 · theta: a call, underlying +1% at the exit (no usable stop → % rules), premium lost.
  const up = mk([[100, 100.3, 99.9], [100.2, 100.8, 100.1], [100.6, 101.1, 100.5], [100.9, 101.2, 100.8], [101, 101.1, 100.9], [101, 101.1, 100.9], ...flat(30, 101)]);
  const a4 = cls(lrow({ assetType: 'option', optionType: 'call', expiryDate: '2026-09-11', notes: 'plan: entry 100 · target — · stop —\noutcome: expired', realizedPnL: -85 }), up);
  assert.equal(a4.risk, null);
  assert.equal(a4.cls, 'theta');
  assert.ok(a4.moveAtExitPct! > 0.009);
  // A bot option's premium stop (1.2 vs a $100 underlying) is not an underlying price → no R.
  assert.equal(cls(lrow({ assetType: 'option', optionType: 'call', notes: 'Plan: target 5 · stop 1.2\nExit: time', realizedPnL: -30 }), up).risk, null);

  // 5 · target too far: stop 95 / target 110, wandered ±1.5 and timed out.
  const a5 = cls(lrow({ notes: 'plan: entry 100 · target 110 · stop 95\noutcome: expired', realizedPnL: -10 }), mk([[100, 101.5, 99.5], [101, 101.2, 99], [99.5, 100, 99.2], [99.4, 99.8, 99.1], [99.5, 99.7, 99.3], [99.5, 99.6, 99.4], ...flat(30, 99.5)]));
  assert.equal(a5.cls, 'target_far');

  // 6 · late entry: stamped 20:30 ET (outside RTH); the next 09:30 bar opened 0.4R against.
  const a6 = analyseTrade(lrow({ entryTime: '2026-09-01T00:30:00Z', exitTime: iso(4) }), { h1: mk([[99.2, 99.4, 98.9], [99, 99.1, 98.5], [98.5, 98.6, 97.9], ...flat(30, 97.5)]), d1: null }, t0 + 400 * H);
  assert.ok(a6.ctx.outsideRTH && a6.gapR! <= -0.25);
  assert.equal(a6.cls, 'late_entry');

  // 7 · no bars → unknown, never guessed. A win is not classified.
  assert.equal(analyseTrade(lrow({}), undefined).cls, 'unknown');
  assert.equal(analyseTrade(lrow({}), { h1: null, d1: null }).cls, 'unknown');
  assert.equal(cls(lrow({ realizedPnL: 40 }), up).cls, null);

  // 8 · ordinary loss: in profit < 1R, no other rule.
  const a8 = cls(lrow({ notes: 'plan: entry 100 · target 104 · stop 98\noutcome: hit_stop' }), mk([[100, 101, 99.9], [100.8, 101.2, 100], [100, 100.1, 99], [99, 99.1, 97.9], [97.8, 97.9, 97.5], [97.5, 97.6, 97.4], ...flat(30, 97.4)]));
  assert.equal(a8.cls, 'normal');

  // Summary: every loss in exactly one class; $ adds up.
  const all = [a1, a2, a3, a4, a5, a6, a8, analyseTrade(lrow({ realizedPnL: -5 }), undefined)];
  const sum = summariseLosses(all);
  assert.equal(sum.classes.reduce((s, x) => s + x.n, 0), all.length);
  assert.equal(Math.round(sum.classes.reduce((s, x) => s + x.lost, 0)), Math.round(sum.lost));
  assert.deepEqual(LOSS_CLASSES.map((x) => x.id), ['unknown', 'unresolved', 'gave_back', 'stop_tight', 'late_entry', 'theta', 'target_far', 'wrong_direction', 'normal']);
  assert.ok(sum.classes.find((x) => x.id === 'wrong_direction')!.fired >= 2, 'fired counts outranked losses too');

  // Drivers: sorted by $ lost; PF = won / lost.
  const ctxs = [tradeContext(lrow({ setupType: 'a', realizedPnL: -50 })), tradeContext(lrow({ setupType: 'a', realizedPnL: 25 })), tradeContext(lrow({ setupType: 'b', realizedPnL: -10 }))];
  const dr = lossDrivers(ctxs, 'source');
  assert.deepEqual(dr.map((r) => [r.key, r.n, r.lost, r.pf]), [['a', 2, -50, 0.5], ['b', 1, -10, 0]]);

  // Replay: a bar that prints both stop and target is scored as the stop (conservative); gaps fill at the open.
  const both = mk([[100, 105, 97]]);
  assert.equal(replayR(both, 'h1', t0, t0 + 10 * H, 'long', 100, 98, 104, 2), -1);
  assert.equal(replayR(mk([[96, 97, 95]]), 'h1', t0, t0 + 10 * H, 'long', 100, 98, 104, 2), -2, 'gap through the stop fills at the open');
  assert.equal(replayR(mk([[100, 101, 99.5], [101, 101, 100.5]]), 'h1', t0, t0 + 10 * H, 'long', 100, 98, 104, 2), 0.375, 'no level → the last close');
  // Counterfactuals: the plan replay is its own baseline (Δ 0); filters report n kept.
  const cf = counterfactuals([a1, a2, a5], new Map([['TST', { h1: down, d1: null }]]));
  const plan = cf.find((x) => x.id === 'plan')!;
  assert.equal(plan.net, plan.baseNet);
  assert.equal(plan.firstHalfDelta + plan.secondHalfDelta, 0);
  assert.equal(cf.find((x) => x.id === 'rth')!.n, 3, 'all three stamped in regular hours');
}

// ── accuracy audit regressions (feat/jnav) — SYNTHETIC fixture, never the operator's exports ──
{
  const HEAD = 'Name,Symbol,Side,Status,Filled,Total Qty,Price,Avg Price,Time-in-Force,Placed Time,Filled Time';
  const L = (name: string, sym: string, side: string, status: string, filled: number | string, total: number | string, px: number | string, t: string) =>
    `${name},${sym},${side},${status},${filled},${total},@${px},${px},DAY,${t},${t}`;
  // Webull order exports list the NEWEST order first.
  const csv = [
    HEAD,
    L('NVDA260918C00190000', 'NVDA260918C00190000', 'Sell', 'Filled', 1, 1, 1.2, '09/16/2026 09:45:00 EDT'),
    L('NVDA260918C00190000', 'NVDA260918C00190000', 'Buy', 'Filled', 1, 1, 1.0, '09/16/2026 09:45:00 EDT'),
    L('SPXW260915C06600000', 'SPXW260915C06600000', 'Sell', 'Filled', 2, 2, 1.5, '09/15/2026 10:30:00 EDT'),
    L('SPXW260915C06600000', 'SPXW260915C06600000', 'Buy', 'Filled', 2, 2, 1.0, '09/15/2026 10:00:00 EDT'),
    L('AMD261016C00200000', 'AMD261016C00200000', 'Buy', 'Filled', 1, 1, 2.0, '09/14/2026 11:00:00 EDT'),
    L('SPY260930C00650000', 'SPY260930C00650000', 'Buy', 'Partial Filled', 1, 3, 0.8, '09/14/2026 10:00:00 EDT'),
    L('XYZ260918C00010000', 'XYZ260918C00010000', 'Buy', 'Cancelled', 0, 1, '', '09/12/2026 10:00:00 EDT'),
    L('QQQ260911P00500000', 'QQQ260911P00500000', 'Buy', 'Filled', 3, 3, 0.4, '09/10/2026 15:30:00 EDT'),
    L('Blackberry', 'BB', 'Sell', 'Filled', 6.60799, 6.60799, 9.25, '09/08/2026 14:56:08 EDT'),
    L('Blackberry', 'BB', 'Buy', 'Filled', 6.60799, 6.60799, 9.84, '09/02/2026 13:01:25 EST'.replace('EST', 'EDT')),
  ].join('\n');
  const now = Date.parse('2026-09-16T20:30:00Z'); // 16:30 ET Sep 16
  const res = parseBrokerCSV(csv, undefined, now);
  assert.equal(res.broker, 'webull');
  assert.equal(res.fillRows, 9, 'cancelled row skipped; the partial fill counts');
  const by = (sym: string) => res.trades.filter((t) => t.symbol === sym);
  const spxw = by('SPXW')[0];
  assert.deepEqual([spxw.status, spxw.direction, spxw.quantity, spxw.realizedPnL], ['closed', 'long', 2, 100], 'option P&L carries the ×100 multiplier');
  assert.equal(spxw.entryTime, '2026-09-15T14:00:00.000Z', 'EDT stamp → UTC');
  const nv = by('NVDA')[0];
  assert.deepEqual([nv.direction, nv.status, nv.realizedPnL], ['long', 'closed', 20], 'same-second buy/sell in a newest-first export pairs as long, not sell-to-open');
  const qqq = by('QQQ')[0];
  assert.deepEqual([qqq.status, qqq.exitPrice, qqq.realizedPnL, qqq.exitTime], ['closed', 0, -120, '2026-09-11T20:00:00.000Z'], 'an option held past expiry with no sell settles at $0 at 16:00 ET');
  assert.ok(qqq.notes?.startsWith(EXPIRED_NOTE_HEAD));
  assert.equal(by('AMD')[0].status, 'open', 'not yet expired → still open');
  assert.deepEqual([by('SPY')[0].quantity, by('SPY')[0].status], [1, 'open'], 'partial fill = filled quantity');
  const bb = by('BB')[0];
  assert.deepEqual([bb.quantity, bb.realizedPnL], [6.60799, -3.9], 'fractional shares: (9.25 − 9.84) × 6.60799');
  // Same parse on the expiry day before 16:15 ET: the put is still open.
  assert.equal(parseBrokerCSV(csv, undefined, Date.parse('2026-09-11T20:05:00Z')).trades.find((t) => t.symbol === 'QQQ')!.status, 'open', 'expiry session not over yet');
  assert.equal(expiryCloseIso('2026-12-18'), '2026-12-18T21:00:00.000Z', 'EST expiry closes 21:00Z');

  // Rows imported before the fix: settled on read, flagged, only for CSV imports.
  const legacy = (p: Partial<JournalTradeRow>): JournalTradeRow => row({ assetType: 'option', optionType: 'put', expiryDate: '2026-09-11', status: 'open', realizedPnL: null, exitPrice: null, exitTime: null, quantity: 3, entryPrice: 0.4, broker: 'webull', entryTime: '2026-09-10T19:30:00Z', ...p });
  const [lg, bot, man, shortOpt] = settleExpiredRows([legacy({}), legacy({ broker: 'quant-bot' }), legacy({ broker: 'manual' }), legacy({ direction: 'short' })], now);
  assert.deepEqual([lg.status, lg.realizedPnL, lg.exitPrice, lg.expiredAssumed], ['closed', -120, 0, true]);
  assert.equal(bot.status, 'open', 'the bot settles its own expiries');
  assert.equal(man.status, 'open', 'manual rows are left alone');
  assert.equal(shortOpt.realizedPnL, 120, 'a sold option that expired keeps the premium');
  assert.equal(settleExpiredRows([{ ...legacy({}), status: 'closed', realizedPnL: -120, notes: EXPIRED_NOTE_HEAD + ' …' }], now)[0].expiredAssumed, true, 'importer-settled rows are flagged too');
  assert.equal(isExpiredUnclosed(legacy({ expiryDate: '2026-09-16' }), Date.parse('2026-09-16T20:10:00Z')), false, '16:10 ET on expiry day: not yet');
  const mSettled = computeMetrics(settleExpiredRows([legacy({}), row({ realizedPnL: 100 })], now).map(toTrade));
  assert.deepEqual([mSettled.closedTrades, mSettled.netPnl, mSettled.openTrades], [2, -20, 0], 'expired premium is in net P&L');

  // Import plan: re-importing closes the stale open lot instead of adding a second copy.
  const openLot = { id: 'e1', broker: 'webull', symbol: 'QQQ', assetType: 'option', optionType: 'put', strikePrice: 500, expiryDate: '2026-09-11', direction: 'long', quantity: 3, entryPrice: 0.4, entryTime: '2026-09-10T19:30:00.000Z', exitTime: null, exitPrice: null, status: 'open' };
  const plan = planJournalImport([openLot, { ...spxw, id: 'e2' } as never], [qqq, spxw, nv]);
  assert.deepEqual(plan.map((a) => a.kind), ['close', 'duplicate', 'insert']);
  assert.equal((plan[0] as { existing: { id: string } }).existing.id, 'e1');

  // Holding time: exact stamps, not the whole-minute rounding (4m40s is "< 5m").
  const quick = toTrade(row({ entryTime: '2026-09-01T14:00:00Z', exitTime: '2026-09-01T14:04:40Z', holdingMinutes: 5 }));
  assert.equal(quick.durationMs, 280_000);
  assert.equal(reportBuckets([quick], 'duration')[0].key, '< 5m');
  // Hours and weekdays are New York: 01:00Z Wed is Tue 21:00 ET.
  assert.deepEqual(reportBuckets([toTrade(row({ entryTime: '2026-09-16T01:00:00Z', exitTime: '2026-09-16T02:00:00Z' }))], 'weekday').map((b) => b.key), ['Tue']);
  assert.deepEqual(reportBuckets([toTrade(row({ entryTime: '2026-09-15T14:00:00Z' }))], 'hour').map((b) => b.key), ['10:00']);
}

// ── Insights engine (lib/journal/insights.ts) ──
{
  let k = 0;
  const T = (day: number, hourEt: number, pnl: number, p: Partial<JournalTradeRow> = {}) => {
    const entry = new Date(Date.UTC(2026, 8, day, hourEt + 4, 5 + (k % 40))).toISOString(); // EDT = UTC−4
    const exit = new Date(Date.parse(entry) + 20 * 60_000).toISOString();
    k++;
    return toTrade(row({ id: `i${k}`, entryTime: entry, exitTime: exit, realizedPnL: pnl, ...p }));
  };
  // Power-hour entries lose in both halves; mornings win.
  const tr = [
    ...[1, 2, 3, 8, 9, 10].map((d) => T(d, 15, -50)),
    ...[1, 2, 3, 8, 9, 10, 14, 15, 16, 17].map((d) => T(d, 10, 40)),
  ];
  const model = buildInsights(tr);
  assert.equal(model.closed, 16);
  const stops = stopDoing(model);
  const ph = stops.find((f) => f.dim === 'session' && f.key === 'Power hour 15:00–16:00')!;
  assert.ok(ph, 'power hour is a leak');
  assert.deepEqual([ph.n, ph.net, ph.impact, ph.bothHalves, ph.lowSample], [6, -300, 300, true, true]);
  assert.equal(ph.netWithout, model.net + 300);
  assert.ok(stops.every((f) => f.n >= 5 && f.net < 0), 'findings need n ≥ 5 and a loss');
  assert.ok(keepDoing(model).some((f) => f.key === 'Morning 10:00–12:00'));
  const cards = behaviorInsights(model, { n: 2, pnl: -80 });
  assert.equal(cards[0].id, 'expired-unclosed');
  assert.ok(cards.some((c) => c.title === 'Stop: Power hour 15:00–16:00'));
  assert.equal(concentration(model).top5Share, 1);
  // Tilt: the trade after a loss.
  assert.ok(model.buckets.tilt.some((b) => b.key === 'Next trade after a loss' && b.n > 0));
  // DTE from the New York entry day: a 15:00 ET entry on the day before expiry is 1 DTE, not 0.
  assert.equal(dteAtEntry(T(15, 15, 1, { assetType: 'option', optionType: 'call', expiryDate: '2026-09-16' })), 1);
  assert.equal(dteAtEntry(T(16, 9, 1, { assetType: 'option', optionType: 'call', expiryDate: '2026-09-16' })), 0);
  assert.equal(costBucket(299.99), '$100–300');
  assert.equal(sessionOf({ weekday: 'Mon', hour: 9, minute: 45 }), 'Open 09:30–10:00');
  assert.equal(sessionOf({ weekday: 'Mon', hour: 16, minute: 0 }), 'Outside regular hours');
}

// ── journal tab row fit (components/journal/journal-nav.tsx) ──
{
  const groups = [{ id: 'a', pages: [{ id: 'p1' }, { id: 'p2' }] }, { id: 'b', pages: [{ id: 'p3' }] }];
  const w = { tab: { p1: 100, p2: 100, p3: 100 }, label: { a: 50, b: 50 }, sep: 10, more: 80 };
  assert.deepEqual(fitTabs(500, w, groups), { labels: true, visible: new Set(['p1', 'p2', 'p3']) });
  assert.equal(fitTabs(320, w, groups).labels, false, 'captions go first');
  assert.equal(fitTabs(320, w, groups).visible.size, 3);
  assert.deepEqual([...fitTabs(290, w, groups).visible], ['p1', 'p2'], 'then trailing tabs move to More (prefix kept)');
}

// ── loss analysis: a hold shorter than one bar is not classified ──
{
  const t0 = Date.parse('2026-09-01T13:30:00Z');
  const bars: Bar[] = Array.from({ length: 12 }, (_, i) => ({ time: t0 + i * 3_600_000, open: 100, high: 103, low: 97, close: 100 }));
  const scalp = analyseTrade({ id: 's', symbol: 'TST', assetType: 'option', optionType: 'call', direction: 'long', entryPrice: 1, entryTime: new Date(t0 + 10 * 60_000).toISOString(), exitTime: new Date(t0 + 25 * 60_000).toISOString(), realizedPnL: -40, status: 'closed' }, { h1: bars, d1: null }, t0 + 100 * 3_600_000);
  assert.equal(scalp.cls, 'unresolved', 'a 15-minute trade on hourly bars cannot be measured');
}

// ── journal dashboard defaults tile 12×18 (fit the journal's visible area) ──
for (const d of JOURNAL_DEFAULTS) {
  assert.deepEqual(tilingIssues(d.tools.map(([type, x, y, w, h]) => ({ type, x, y, w, h }))), [], `journal default ${d.id} tiles 12×18`);
}

// ── expired option lots settled at INTRINSIC (feat/settle) — synthetic fixtures, mocked prints ──
{
  // Mock daily bars: underlying → day → { open, close }. No network.
  const BARS: Record<string, Record<string, { open: number; close: number }>> = {
    '^GSPC': { '2026-09-15': { open: 6590, close: 6612.34 }, '2026-09-18': { open: 6580.5, close: 6640 } },
    QQQ: { '2026-09-11': { open: 505, close: 495.5 } },
    NVDA: { '2026-09-11': { open: 180, close: 170 } },
  };
  const calls: string[] = [];
  const fetcher: ExpiryBarFetcher = async (sym, _kind, days) => {
    calls.push(`${sym}:${days.length}`);
    const m = new Map();
    for (const d of days) if (BARS[sym]?.[d]) m.set(d, BARS[sym][d]);
    return m;
  };
  const lot = (p: Record<string, unknown>) => ({
    symbol: 'SPXW', assetType: 'option', optionType: 'call', strikePrice: 6600, expiryDate: '2026-09-15', direction: 'long', status: 'closed',
    broker: 'webull', quantity: 2, entryPrice: 1, fees: 0, entryTime: '2026-09-15T14:00:00.000Z', ...p,
  }) as never as Parameters<typeof intrinsicSettlement>[0];
  const P = (sym: string, day: string) => BARS[sym]?.[day] ?? null;

  // Call ITM (SPXW PM-settled → close): (12.34 − 1) × 2 × 100.
  const c1 = intrinsicSettlement(lot({}), P('^GSPC', '2026-09-15'));
  assert.deepEqual([c1.source, c1.exitPrice, c1.realizedPnL, c1.outcome, c1.approximate, c1.exitTime], ['intrinsic', 12.34, 2268, 'win', false, '2026-09-15T20:00:00.000Z']);
  assert.match(c1.noteLine, /\[expiry-settlement:intrinsic px=12\.34 S=6612\.34\]/);
  // Call OTM → worthless, verified.
  const c2 = intrinsicSettlement(lot({ strikePrice: 6700 }), P('^GSPC', '2026-09-15'));
  assert.deepEqual([c2.source, c2.exitPrice, c2.realizedPnL], ['intrinsic', 0, -200]);
  // Put ITM on an equity: physically settled → auto-exercise note, no share position.
  const p1 = intrinsicSettlement(lot({ symbol: 'QQQ', optionType: 'put', strikePrice: 500, expiryDate: '2026-09-11', quantity: 3, entryPrice: 0.4 }), P('QQQ', '2026-09-11'));
  assert.deepEqual([p1.exitPrice, p1.realizedPnL], [4.5, 1230], '(4.50 − 0.40) × 3 × 100');
  assert.match(p1.noteLine, /auto-exercise assumed/);
  // Put OTM.
  const p2 = intrinsicSettlement(lot({ symbol: 'QQQ', optionType: 'put', strikePrice: 490, expiryDate: '2026-09-11', quantity: 3, entryPrice: 0.4 }), P('QQQ', '2026-09-11'));
  assert.deepEqual([p2.exitPrice, p2.realizedPnL], [0, -120]);
  assert.doesNotMatch(p2.noteLine, /auto-exercise/);
  // Short call ITM mirrors: sold at 1, settles at 12.34 → −(11.34 × 200).
  assert.equal(intrinsicSettlement(lot({ direction: 'short' }), P('^GSPC', '2026-09-15')).realizedPnL, -2268);
  // SPXW (PM, close) vs SPX monthly on the 3rd Friday (AM → open, flagged approximate).
  assert.deepEqual(settlementUnderlying('SPXW', '2026-09-18'), { symbol: '^GSPC', kind: 'index', field: 'close', scale: 1, style: 'pm-cash' });
  const am = intrinsicSettlement(lot({ symbol: 'SPX', expiryDate: '2026-09-18' }), P('^GSPC', '2026-09-18'));
  const pm = intrinsicSettlement(lot({ symbol: 'SPXW', expiryDate: '2026-09-18' }), P('^GSPC', '2026-09-18'));
  assert.deepEqual([am.exitPrice, am.approximate, pm.exitPrice, pm.approximate], [0, true, 40, false], 'SPX AM uses the 6580.50 open; SPXW the 6640 close');
  assert.match(am.noteLine, /approximate: AM-settled/);
  assert.equal(parseExpiryMarker(am.noteLine)!.approximate, true);
  assert.equal(settlementUnderlying('SPX', '2026-09-15')!.field, 'close', 'SPX root off the 3rd Friday = PM weekly');
  assert.deepEqual([settlementUnderlying('XSP', '2026-09-15')!.scale, settlementUnderlying('NDXP', '2026-09-15')!.symbol, settlementUnderlying('RUTW', '2026-09-15')!.symbol], [0.1, '^NDX', '^RUT']);
  assert.equal(intrinsicSettlement(lot({ symbol: 'XSP', strikePrice: 660 }), P('^GSPC', '2026-09-15')).exitPrice, 1.23, 'XSP = ^GSPC / 10 → 661.23 − 660');
  // Missing close → stays $0, flagged unverified — never a neighbouring day.
  const miss = intrinsicSettlement(lot({ expiryDate: '2026-09-16' }), null);
  assert.deepEqual([miss.source, miss.exitPrice, miss.realizedPnL], ['zero', 0, -200]);
  assert.match(miss.noteLine, /unverified — no close available/);
  assert.equal(intrinsicSettlement(lot({ symbol: 'VIX' }), { open: 20, close: 20 }).source, 'zero', 'no honest VIX settlement source');

  // Import time: the parser's $0 lot (QQQ 500P from a synthetic CSV) becomes intrinsic; batched per underlying.
  const HEAD = 'Name,Symbol,Side,Status,Filled,Total Qty,Price,Avg Price,Time-in-Force,Placed Time,Filled Time';
  const L = (sym: string, side: string, q: number, px: number, t: string) => `${sym},${sym},${side},Filled,${q},${q},@${px},${px},DAY,${t},${t}`;
  const csv = [HEAD,
    L('SPXW260915C06600000', 'Buy', 2, 1.0, '09/15/2026 10:00:00 EDT'),
    L('SPXW260915C06650000', 'Buy', 1, 0.5, '09/15/2026 10:05:00 EDT'),
    L('QQQ260911P00500000', 'Buy', 3, 0.4, '09/10/2026 15:30:00 EDT'),
    L('ABCD260911C00010000', 'Buy', 1, 0.2, '09/10/2026 15:30:00 EDT'),
  ].join('\n');
  const parsed = parseBrokerCSV(csv, undefined, Date.parse('2026-09-16T20:30:00Z'));
  assert.ok(parsed.trades.every((t) => t.status === 'closed' && t.exitPrice === 0), 'parser still closes at $0 synchronously');
  calls.length = 0;
  const counts = await settleParsedExpiries(parsed.trades, fetcher);
  assert.deepEqual(counts, { settled: 4, itm: 2, worthless: 1, unverified: 1 });
  assert.deepEqual(calls.sort(), ['ABCD:1', 'QQQ:1', '^GSPC:1'], 'one fetch per underlying, both SPXW lots share it');
  const spx = parsed.trades.find((t) => t.symbol === 'SPXW' && t.strikePrice === 6600)!;
  assert.deepEqual([spx.exitPrice, spx.realizedPnL], [12.34, 2268]);
  assert.ok(spx.notes!.startsWith(EXPIRED_NOTE_HEAD) && !spx.notes!.includes('assumed worthless'), 'the $0 note is replaced, not stacked');
  assert.equal(parsed.trades.find((t) => t.symbol === 'ABCD')!.notes!.includes('[expiry-settlement:zero]'), true);
  const ec = expiryCounts(settleExpiredRows(parsed.trades.map((t, i) => ({ ...t, id: `p${i}` })) as never));
  assert.equal(expiryCountsText(ec), '4 expired options settled at intrinsic (1 worthless, 2 in the money, 1 unverified)');

  // Re-settle of rows already in a journal.
  const exp = (id: string, p: Record<string, unknown>) => ({
    id, symbol: 'SPXW', assetType: 'option', optionType: 'call', strikePrice: 6600, expiryDate: '2026-09-15', direction: 'long', status: 'closed',
    broker: 'webull', quantity: 2, entryPrice: 1, fees: 0, entryTime: '2026-09-15T14:00:00.000Z',
    exitPrice: 0, exitTime: '2026-09-15T20:00:00.000Z', realizedPnL: -200, notes: `my note\n${EXPIRED_ASSUMED_NOTE}`, ...p,
  });
  const book = [
    exp('legacy', {}),                                                               // $0 by the old rule → 12.34
    exp('manual', { broker: 'manual' }),                                             // manual row: untouched
    exp('bot', { broker: 'quant-bot' }),                                             // bot row: untouched
    exp('discord', { broker: 'discord' }),                                           // discord row: untouched
    exp('realfill', { exitPrice: 3, exitTime: '2026-09-15T18:00:00.000Z', realizedPnL: 400, notes: null }), // real exit fill
    exp('edited', { exitPrice: 9, realizedPnL: 1600 }),                              // operator edited the exit
    exp('open', { status: 'open', exitPrice: null, exitTime: null, realizedPnL: null, notes: null }), // never settled
    exp('nodata', { expiryDate: '2026-09-16', exitTime: '2026-09-16T20:00:00.000Z' }), // no print → zero, unverified
  ];
  const now = Date.parse('2026-09-29T15:00:00Z');
  const r1 = await planExpiryResettle(book as never, fetcher, now);
  assert.deepEqual(r1.changes.map((c) => c.id).sort(), ['legacy', 'nodata', 'open']);
  assert.deepEqual([r1.summary.eligible, r1.summary.changed, r1.summary.pnlDelta], [3, 3, 4936], 'legacy +2468, open +2468 (vs $0 read), nodata relabel $0');
  assert.deepEqual(r1.summary.counts, { itm: 2, worthless: 0, unverified: 1, approximate: 0 });
  assert.deepEqual(r1.summary.bySymbol, [{ symbol: 'SPXW', rows: 3, delta: 4936 }]);
  const leg = r1.changes.find((c) => c.id === 'legacy')!;
  assert.equal((leg.patch.notes as string).split('\n')[0], 'my note', "operator's own note kept");
  // Apply, then run again: idempotent.
  const after = book.map((b) => { const c = r1.changes.find((x) => x.id === b.id); return c ? { ...b, ...c.patch } : b; });
  const r2 = await planExpiryResettle(after as never, fetcher, now);
  assert.deepEqual([r2.summary.changed, r2.summary.pnlDelta, r2.summary.unchanged], [0, 0, 3]);
  // A verified row is never downgraded when the print is unavailable later.
  const r3 = await planExpiryResettle(after as never, async () => new Map(), now);
  assert.deepEqual([r3.summary.changed, r3.summary.keptVerified], [0, 2]);

  // Re-import after the old $0 import: the row is re-settled in place, not duplicated.
  const oldRow = { ...exp('e9', {}), strikePrice: 6600 };
  const plan = planJournalImport([oldRow as never], [spx]);
  assert.deepEqual([plan[0].kind, (plan[0] as { existing: { id: string } }).existing.id], ['resettle', 'e9']);
  const again = planJournalImport([{ ...oldRow, ...leg.patch } as never], [spx]);
  assert.equal(again[0].kind, 'duplicate', 'already at intrinsic → duplicate');
  const zeroParse = { ...spx, exitPrice: 0, realizedPnL: -200, notes: miss.noteLine };
  assert.equal(planJournalImport([{ ...oldRow, ...leg.patch } as never], [zeroParse])[0].kind, 'duplicate', 'never downgraded to $0 by a re-import');
}


// ── drill-down URL builders (Insights / Loss drivers / weekday × hour → Trades) ──
{
  const base = { symbols: ['SPY'], side: 'long' as const, from: '2026-09-01' };
  const drill = buildJournalDrill(base, ['bot:a1', 'desk:7', 'bot:a1', 'u-3'], 'Loss driver · Exit: stop hit')!;
  assert.deepEqual(drill.ids, ['bot:a1', 'desk:7', 'u-3'], 'ids de-duplicated, order kept');
  assert.equal(drill.drill, 'Loss driver · Exit: stop hit');
  assert.deepEqual({ ...drill, ids: undefined, drill: undefined }, { ...base, ids: undefined, drill: undefined }, 'filters in view are kept');
  const qs = journalFiltersToParams(drill);
  assert.equal(qs.get('jids'), 'bot:a1,desk:7,u-3');
  assert.equal(qs.get('jdrill'), 'Loss driver · Exit: stop hit');
  assert.equal(qs.get('jsym'), 'SPY');
  // URL round trip is exact (what the Trades page reads back = what the row built)
  const back = parseJournalFilters((k) => new URLSearchParams(qs.toString()).get(k));
  assert.deepEqual(back, drill);
  assert.equal(countJournalFilters(back), 4, 'the drill label is not a filter; ids is one');
  // predicate: exactly those rows (and still AND-ed with the other filters)
  const r = (id: string, p: Partial<JournalTradeRow> = {}) => row({ id, symbol: 'SPY', direction: 'long', entryTime: '2026-09-02T14:00:00Z', exitTime: '2026-09-02T15:00:00Z', ...p });
  assert.ok(matchesJournalFilters(r('desk:7'), back));
  assert.ok(!matchesJournalFilters(r('desk:8'), back), 'an id outside the drill is excluded');
  assert.ok(!matchesJournalFilters(r('bot:a1', { symbol: 'QQQ' }), back), 'other filters still apply');
  assert.ok(!matchesJournalFilters({ ...r('x'), id: undefined } as never, { ids: ['x'] }), 'a row without an id never matches an id drill');
  // refusals: nothing to open, too many ids for a URL, ids that would not survive the URL
  assert.equal(buildJournalDrill({}, [], 'x'), null);
  assert.equal(buildJournalDrill({}, Array.from({ length: JOURNAL_DRILL_MAX_IDS + 1 }, (_, i) => `t${i}`), 'x'), null);
  assert.ok(buildJournalDrill({}, Array.from({ length: JOURNAL_DRILL_MAX_IDS }, (_, i) => `t${i}`), 'x'));
  assert.equal(buildJournalDrill({}, ['ok-1', 'has space'], 'x'), null, 'an id the URL parser would drop → not exact → refused');
  assert.equal(buildJournalDrill({}, ['a'], '   ')!.drill, undefined, 'blank label omitted');
  assert.equal(buildJournalDrill({}, ['a'], 'x'.repeat(200))!.drill!.length, 80, 'label capped');
  // a hostile / oversized jids param is cleaned on the way in
  const dirty = parseJournalFilters((k) => new URLSearchParams(`jids=${encodeURIComponent('a,<b>,a,c d,' + Array.from({ length: 400 }, (_, i) => `z${i}`).join(','))}&jdrill=hi`).get(k));
  assert.equal(dirty.ids![0], 'a');
  assert.ok(!dirty.ids!.includes('<b>') && !dirty.ids!.includes('c d'));
  assert.equal(dirty.ids!.length, JOURNAL_DRILL_MAX_IDS);
  assert.equal(parseJournalFilters((k) => new URLSearchParams('jdrill=orphan').get(k)).drill, undefined, 'a label without ids is dropped');
  // bucket ids feed the drill: heatmap cells and insight buckets carry their closed trades
  const drillRows = [r('h1', { entryTime: '2026-09-01T13:45:00Z', realizedPnL: 10 }), r('h2', { entryTime: '2026-09-01T13:50:00Z', realizedPnL: -5 }), r('h3', { entryTime: '2026-09-02T15:10:00Z' })];
  const grid = timeGrid(drillRows.map(toTrade));
  assert.deepEqual(grid.cells.get('Tue|9')!.ids, ['h1', 'h2']);
  const model = buildInsights(drillRows.map(toTrade));
  const wd = model.buckets.weekday.find((b) => b.key.startsWith('Tue'))!;
  assert.deepEqual([...wd.ids].sort(), ['h1', 'h2']);
}

console.log('journal checks passed');

// Discord forum import: pagination, thread → trader mapping, parse accuracy, ranking.
await import('./test-discord-forum');
