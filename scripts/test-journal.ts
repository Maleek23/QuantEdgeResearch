/**
 * Journal logic checks: shared filters, server-side P&L derivation, client
 * metrics (ported from LuxAlgo journal-core), the ?jtab= legacy map, journal
 * keys, broker fill pairing, trade-desk idea mapping, and the Discord parser +
 * entry/exit pairing (sample messages below are the grammar's contract).
 *   npx tsx scripts/test-journal.ts
 */
import assert from 'node:assert/strict';
import { journalDayKey, matchesJournalFilters, parseJournalFilters, journalFiltersToParams, journalRowOutcome } from '../shared/journal-filters';
import { buildJournalTradeUpdate, deriveJournalTradeFields, journalTradeInputSchema } from '../server/journal-trade-input';
import {
  calendarMonth, computeMetrics, crossBuckets, dailyStats, dayStreaks, drawdownPeriods, equityCurve, groupBy, missingDim, noteLine,
  peakConcurrent, periodStart, reportBuckets, rollingStats, ruleOfReason, runRecords, toTrade,
} from '../client/src/lib/journal/metrics';
import { FILTERED_PAGES, JOURNAL_PAGES, LEGACY_JTAB, TRADE_PAGES, resolveJournalPage, resolveJournalTab } from '../client/src/lib/journal/legacy-jtab';
import type { JournalTradeRow } from '../client/src/lib/journal/types';
import { parseJournalKey, traderOwnerId, journalKindOf, journalNoteKey } from '../shared/journal-sources';
import { decodeOccSymbol, pairFills, type BrokerFill } from '../shared/fill-pairing';
import { mapDeskIdea, type DeskIdea } from '../server/journal-row-maps';
import { labelBotRuns, pickActiveBotPortfolio, runsCovered } from '../shared/bot-runs';
import { dueForSettlement, expirySessionOver, nyCloseIso, settleAtExpiry, type OpenBotOptionRow } from '../server/bot-expiry-plan';
import {
  calendarInsights, dayEquity, dayRecap, decodeTradeReview, edgeScore, encodeTradeReview, groupImportErrors, marketWindow, maxDrawdownPct,
  performanceTrends, planLevels, playbookAdherence, playbookRules, relativeDrawdown, timeGrid, toCsv, tradeTimeframe, type TradeReview,
} from '../client/src/lib/journal/metrics-extra';
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
const orb = groupBy(trades, 'setup').find((b) => b.key === 'ORB')!;
assert.deepEqual([orb.closed, orb.netPnl, orb.winRate], [2, 50, 0.5]);
assert.equal(drawdownPeriods(equityCurve(trades))[0].depth, 300);

// ── ?jtab= / ?jpage= → sidebar pages ──
assert.equal(resolveJournalTab('metrics').view, 'record');
assert.equal(resolveJournalTab('log').view, 'dashboard');
assert.equal(resolveJournalTab('backtest').intent?.kind, 'backtest');
assert.deepEqual(resolveJournalTab('timing'), { view: 'reports', intent: { kind: 'anchor', id: 'jr-time' } }, 'Trade Log → Timing now lives in Reports');
assert.deepEqual(resolveJournalTab('insights'), { view: 'reports', intent: { kind: 'anchor', id: 'jr-insights' } });
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
assert.deepEqual(JOURNAL_PAGES.map((p) => p.id), ['dashboard', 'calendar', 'daily', 'trades', 'reports', 'notebook', 'playbooks', 'progress', 'missed', 'import', 'accounts', 'settings', 'record']);
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
assert.ok('excluded' in mapDeskIdea(idea({ assetType: 'option', entryPremium: null })), 'option without premium is excluded');
assert.ok('excluded' in mapDeskIdea(idea({ outcomeStatus: 'expired', resolutionReason: 'missed_entry_would_have_won', percentGain: 12 })), 'never-entered idea is not a trade');

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

console.log('journal checks passed');
