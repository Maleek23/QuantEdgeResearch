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
  peakConcurrent, periodStart, reportBuckets, rollingStats, ruleOfReason, toTrade,
} from '../client/src/lib/journal/metrics';
import { FILTERED_PAGES, JOURNAL_PAGES, LEGACY_JTAB, TRADE_PAGES, resolveJournalPage, resolveJournalTab } from '../client/src/lib/journal/legacy-jtab';
import type { JournalTradeRow } from '../client/src/lib/journal/types';
import { parseJournalKey, traderOwnerId, journalKindOf, journalNoteKey } from '../shared/journal-sources';
import { decodeOccSymbol, pairFills, type BrokerFill } from '../shared/fill-pairing';
import { mapDeskIdea, type DeskIdea } from '../server/journal-row-maps';
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

console.log('journal checks passed');
