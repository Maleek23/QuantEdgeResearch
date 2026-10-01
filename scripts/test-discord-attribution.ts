/**
 * Discord forum AUTHOR ATTRIBUTION + ticker stop-list + repair plan checks
 * (fix/discord-import-attribution, 2026-09-30).
 *
 *   npx tsx scripts/test-discord-attribution.ts    (also run by test-discord-forum → test-journal)
 *
 * FIXTURES ONLY. Every message, id, name and price below is synthetic. The
 * SHAPE mirrors the bug found in production (docs/FEMI_JOURNAL_ANALYSIS_2026-09-30.md):
 * a thread created by one member (the "creator") in which another member (the
 * trader) wrote most of the messages.
 */
import assert from 'node:assert/strict';
import {
  authorNameMatches, authorTargetFor, buildThreadImport, primaryAuthor, resolvePrimaryAuthor, resolveThreadAuthor, traderPatchFor,
} from '../shared/discord-forum';
import { parseDiscordMessage, type DiscordMsg } from '../shared/discord-journal-parser';
import { CHART_JARGON, acceptTicker, filterTickers, isJunkWatchSymbol, isTickerJargon } from '../shared/ticker-stoplist';
import { estimateVisionCost } from '../shared/forum-vision';
import { formatBookPlan, planBookRepair, type PlanNote } from '../shared/discord-reimport-plan';

let seq = 0;
const img = (n: number) => Array.from({ length: n }, (_, i) => ({
  url: `https://cdn.discordapp.com/attachments/111111111111111111/${String(222222222222220000n + BigInt(++seq * 10 + i))}/chart.png`,
  name: 'chart.png', isImage: true,
}));
const msg = (author: string, name: string, content: string, images = 0, minute = ++seq): DiscordMsg => ({
  id: `m${String(minute).padStart(5, '0')}`, timestamp: new Date(Date.UTC(2026, 0, 5, 14) + minute * 60_000).toISOString(),
  authorId: author, authorName: name, content, attachments: img(images), replyTo: null,
});

// Fixture cast: CREATOR made the thread; TRADER writes the journal; LEEK comments.
const CREATOR = 'c-100', TRADER = 't-200', LEEK = 'l-300';

// ─── 1 · resolvePrimaryAuthor ────────────────────────────────────────────────
{
  const msgs = [
    msg(CREATOR, 'creator🃏', 'made you a thread bro'),
    ...Array.from({ length: 12 }, (_, i) => msg(TRADER, 'Femi_fixture', `CRWD: demand zone hold, day ${i}`, 1)),
    ...Array.from({ length: 3 }, () => msg(CREATOR, 'creator🃏', 'nice HOLY SHIT', 1)),
    msg(LEEK, 'leek', 'agreed'),
  ];
  // The old rule picked the creator. The new default is the dominant author.
  assert.equal(primaryAuthor(msgs, CREATOR)?.authorId, TRADER, 'creator no longer wins over the dominant author');
  const dom = resolvePrimaryAuthor(msgs, { ownerId: CREATOR });
  assert.equal(dom?.via, 'dominant');
  assert.equal(dom?.creatorId, CREATOR, 'the preview can say who created the thread');
  assert.equal(dom?.share, Math.round((12 / 17) * 1000) / 1000);

  // Mapped to femi: the name matches → via 'name'.
  const femi = authorTargetFor('femi', { slug: 'femi', name: 'Femi', discordAuthorId: null });
  assert.equal(resolvePrimaryAuthor(msgs, { ownerId: CREATOR, target: femi })?.via, 'name');
  // A stored discord_author_id wins over names and counts.
  const stored = authorTargetFor('femi', { slug: 'femi', name: 'Femi', discordAuthorId: LEEK });
  assert.deepEqual([resolvePrimaryAuthor(msgs, { target: stored })?.authorId, resolvePrimaryAuthor(msgs, { target: stored })?.via], [LEEK, 'stored_id']);
  // A stored id that never posted here is ignored.
  assert.equal(resolvePrimaryAuthor(msgs, { target: authorTargetFor('femi', { slug: 'femi', name: 'Femi', discordAuthorId: 'nobody' }) })?.authorId, TRADER);
  // The operator's override wins over everything.
  const ov = resolvePrimaryAuthor(msgs, { ownerId: CREATOR, target: stored, overrideAuthorId: CREATOR });
  assert.deepEqual([ov?.authorId, ov?.via], [CREATOR, 'override']);
  // An override for someone who never posted is ignored.
  assert.equal(resolvePrimaryAuthor(msgs, { ownerId: CREATOR, overrideAuthorId: 'ghost' })?.authorId, TRADER);

  // The creator only breaks TIES.
  const tie = [msg(CREATOR, 'creator', 'a'), msg(TRADER, 'someone', 'b'), msg(TRADER, 'someone', 'c'), msg(CREATOR, 'creator', 'd')];
  assert.deepEqual([resolvePrimaryAuthor(tie, { ownerId: CREATOR })?.authorId, resolvePrimaryAuthor(tie, { ownerId: CREATOR })?.via], [CREATOR, 'creator_tiebreak']);
  assert.equal(resolvePrimaryAuthor(tie, { ownerId: null })?.authorId, CREATOR, 'no creator known: earliest of the tied authors');
  assert.equal(resolvePrimaryAuthor([msg(CREATOR, 'x', 'solo')], { ownerId: TRADER })?.via, 'only');
  assert.equal(resolvePrimaryAuthor([], { ownerId: CREATOR }), null);

  // Name match with a minority share: Ayo-shaped thread (alias prefix "ayo" ↔ "Ayotheone").
  assert.ok(authorNameMatches('Ayotheone', authorTargetFor('ayo')!));
  assert.ok(authorNameMatches('Femi_fixture', authorTargetFor('femi')!));
  assert.ok(!authorNameMatches('creator🃏', authorTargetFor('femi')!));
  assert.ok(!authorNameMatches('mayo', authorTargetFor('ayo')!), 'prefix only, not substring');
  assert.ok(authorNameMatches('teejay_99', authorTargetFor('tommi')!), 'KNOWN_TRADERS aliases count');
  const ayoThread = [
    ...Array.from({ length: 6 }, () => msg(CREATOR, 'creator🃏', 'chatter')),
    ...Array.from({ length: 4 }, () => msg('a-400', 'Ayotheone', 'AMD: bull flag on the daily')),
  ];
  assert.equal(resolvePrimaryAuthor(ayoThread, { ownerId: CREATOR, target: authorTargetFor('ayo') })?.authorId, 'a-400', 'name match at 40% beats a chattier creator');
  const tinyName = [...ayoThread.slice(0, 6), ...Array.from({ length: 6 }, () => msg('x-1', 'other', 'hi')), msg('a-400', 'Ayotheone', 'one')];
  assert.notEqual(resolvePrimaryAuthor(tinyName, { target: authorTargetFor('ayo') })?.authorId, 'a-400', 'a name match under 20% does not win');
  // Mine: the operator's words.
  assert.equal(resolvePrimaryAuthor([msg(CREATOR, 'creator', 'a'), msg(CREATOR, 'creator', 'b'), msg(LEEK, 'leek', 'c')], { target: authorTargetFor('mine') })?.authorId, LEEK);
}

// ─── 2 · buildThreadImport follows the resolved author ───────────────────────
{
  const thread = { id: '777000000000000123', name: "femi's trading journals", guildId: '500000000000000001', ownerId: CREATOR };
  const msgs = [
    msg(CREATOR, 'creator🃏', 'thread for femi'),
    msg(TRADER, 'Femi_fixture', 'in NVDA 190c 10/17 @ 2.15', 2),
    msg(TRADER, 'Femi_fixture', 'out NVDA 190c @ 3.00', 1),
    msg(TRADER, 'Femi_fixture', 'CRWD: golden pocket into weekly demand, HH HL on the HTF, RR 3:1', 1),
    msg(CREATOR, 'creator🃏', 'in AMD 150c 10/17 @ 1.00', 1),
  ];
  const imp = buildThreadImport(thread, msgs, { target: authorTargetFor('femi') });
  assert.equal(imp.primary?.authorId, TRADER);
  assert.equal(imp.stats.images, 4, "only the resolved author's screenshots are counted for vision");
  assert.deepEqual(imp.trades.map((t) => t.symbol), ['NVDA'], "the creator's comment is not parsed as the trader's trade");
  for (const p of imp.posts) assert.equal(p.meta.byTrader, p.meta.authorId === TRADER, 'byTrader flags follow the resolved author');
  // Override: the operator picks the creator → their messages are the journal.
  const ov = buildThreadImport(thread, msgs, { target: authorTargetFor('femi'), authorId: CREATOR });
  assert.deepEqual([ov.primary?.via, ov.stats.images, ov.trades.map((t) => t.symbol).join()], ['override', 1, 'AMD']);
  // resolveThreadAuthor = what the server import uses per mapping.
  assert.equal(resolveThreadAuthor(thread, msgs, 'femi', { slug: 'femi', name: 'Femi', discordAuthorId: null })?.authorId, TRADER);
  assert.equal(resolveThreadAuthor(thread, msgs, 'femi', null, CREATOR)?.via, 'override');

  // Post symbols: chart jargon gone, and with a universe only real tickers survive.
  const crwd = imp.posts.find((p) => p.body.startsWith('CRWD'))!;
  assert.deepEqual(crwd.symbols, ['CRWD'], 'HH / HL / HTF / RR are not tickers');
  const junk = buildThreadImport(thread, [msg(TRADER, 'Femi_fixture', 'CES HOLY LTF SHIT, AAPL CVX INTC PG on watch')], { universe: new Set(['AAPL', 'CVX', 'INTC', 'PG']) });
  assert.deepEqual(junk.posts[0].symbols, ['AAPL', 'CVX', 'INTC', 'PG']);
  assert.deepEqual(junk.notes[0].symbols, ['AAPL', 'CVX', 'INTC', 'PG'], 'the watchlist fold reads note symbols — junk never reaches it');
}

// ─── 3 · Ticker stop-list ────────────────────────────────────────────────────
{
  const required = ['EMA', 'SMA', 'VWAP', 'ATH', 'ATL', 'PM', 'AH', 'EOD', 'HOD', 'LOD', 'ORB', 'OTM', 'ITM', 'ATM', 'IV', 'DTE', 'TP', 'SL', 'BE', 'RSI', 'MACD',
    'FIB', 'HTF', 'LTF', 'MTF', 'HH', 'HL', 'LH', 'LL', 'OI', 'RR', 'R2', 'S2', 'CPI', 'FOMC', 'PPI', 'CES', 'DTF', 'PT', 'EWT', 'PWH'];
  for (const j of required) assert.ok(CHART_JARGON.has(j), `${j} is on the jargon list`);
  for (const w of ['HOLY', 'SHIT', 'LETS', 'GOOD', 'NOTE']) assert.ok(isTickerJargon(w), `${w} is an English word, never a bare ticker`);
  for (const t of ['CRWD', 'HOOD', 'COIN', 'SNOW', 'AAPL', 'PG']) assert.ok(!isTickerJargon(t), `${t} stays a ticker`);

  const p = (content: string) => parseDiscordMessage({ id: 'x', timestamp: '2026-09-22T14:00:00Z', authorId: 'a', authorName: 'a', content, attachments: [], replyTo: null });
  assert.deepEqual(p('HH HL on the HTF, OI building, RR 3:1 into LTF demand').tickers, []);
  assert.deepEqual(p('CES HOLY LTF SHIT').tickers, []);
  assert.deepEqual(p('NBIS: we meet again, HTF demand').tickers, ['NBIS']);
  // Explicit forms keep real names that collide with jargon.
  assert.ok(p('BB: weekly demand zone, inside week').explicitTickers.includes('BB'), 'a leading "BB:" is BlackBerry, not Bollinger');
  assert.ok(p('$BE looks ready').explicitTickers.includes('BE'));
  assert.ok(p('BE 30c 10/2 @ 1.10').explicitTickers.includes('BE'));
  assert.deepEqual(p('BE at 30 is my level').tickers, [], 'bare BE (breakeven) is not a ticker');
  assert.ok(!p('NOTE: sizing down this week').tickers.includes('NOTE'), 'a leading English word is not a ticker');
  assert.ok(p('BTC breaking out').tickers.includes('BTC'), 'crypto majors still parse');

  const U = new Set(['AAPL', 'BB', 'BE', 'HOOD']);
  assert.ok(acceptTicker('AAPL', { universe: U }));
  assert.ok(!acceptTicker('CES', { universe: U }), 'not in the universe → dropped');
  assert.ok(!acceptTicker('HTF', { universe: U, explicit: true }), '$HTF is still not a ticker');
  assert.ok(acceptTicker('BB', { universe: U, explicit: true }));
  assert.ok(!acceptTicker('BB', { universe: U }), 'bare BB is jargon even though BlackBerry exists');
  assert.ok(acceptTicker('ZZZQ'), 'cold universe: a non-jargon ticker shape is kept (nothing invented, nothing guessed away)');
  assert.ok(acceptTicker('ZZZQ', { universe: new Set() }), 'an empty set is a cold universe');
  assert.ok(!acceptTicker('ZZZQ', { universe: (s) => s === 'AAPL' }), 'predicate universe');
  assert.deepEqual(filterTickers(['hood', 'HOOD', 'HH', 'BB', 'CES'], U, new Set(['BB'])), ['HOOD', 'BB']);
  assert.deepEqual(['CES', 'HOLY', 'LTF', 'SHIT', 'AAPL', 'CVX', 'INTC', 'PG'].filter((s) => isJunkWatchSymbol(s, new Set(['AAPL', 'CVX', 'INTC', 'PG']))), ['CES', 'HOLY', 'LTF', 'SHIT']);
}

// ─── 4 · Trader patch: handle + discord_author_id ────────────────────────────
{
  const primary = { authorId: TRADER, authorName: 'Femi_fixture' };
  const names = ['Femi_fixture', 'creator🃏', 'leek'];
  // The bug's state: handle = the creator's name, no author id.
  assert.deepEqual(traderPatchFor({ source: 'discord', handle: 'creator🃏', discordChannelId: '777000000000000123', discordAuthorId: null }, primary, '777000000000000123', names),
    { handle: 'Femi_fixture', discordAuthorId: TRADER }, 'a handle written from another thread author is corrected on re-import');
  assert.deepEqual(traderPatchFor({ source: 'discord', handle: 'Femi (desk)', discordChannelId: '1', discordAuthorId: TRADER }, primary, '777000000000000123', names), {}, 'an admin-typed handle is kept');
  assert.deepEqual(traderPatchFor({ source: null, handle: null, discordChannelId: null, discordAuthorId: 'old' }, primary, '777000000000000123', names),
    { source: 'discord', handle: 'Femi_fixture', discordAuthorId: TRADER, discordChannelId: '777000000000000123' });
  assert.deepEqual(traderPatchFor({ source: 'discord', handle: 'Femi_fixture', discordChannelId: '1', discordAuthorId: TRADER }, primary, '1', names), {}, 'idempotent');
}

// ─── 5 · Vision cost: the preview's per-image estimate ───────────────────────
{
  const e = estimateVisionCost(796, { cached: 0, cap: 1500 });
  assert.equal(e.perImageUsd, 0.0093);
  assert.equal(e.usd, 7.4, "796 images ≈ $7.40 (the analysis's figure)");
  assert.equal(estimateVisionCost(796, { cached: 96, cap: 1500 }).billable, 700, 'already-read images are not billed');
  assert.equal(estimateVisionCost(2000, { cap: 1500 }).billable, 1500, 'capped');
}

// ─── 6 · Repair plan (what the dry-run prints / the apply script writes) ─────
{
  let n = 0;
  const note = (author: string, name: string, body: string, opts: { byTrader?: boolean; images?: number; symbols?: string[]; parsed?: boolean } = {}): PlanNote => ({
    id: `note-${++n}`, sourceMessageId: `9${String(n).padStart(17, '0')}`, postedAt: new Date(Date.UTC(2026, 0, 5) + n * 60_000).toISOString(), body,
    symbols: opts.symbols ?? null, attachments: img(opts.images ?? 0),
    meta: {
      kind: 'discord_post', authorId: author, authorName: name, byTrader: !!opts.byTrader, threadId: '777000000000000123', threadName: "femi's trading journals",
      parsed: opts.parsed ? { kind: 'exit', symbol: 'AMD', confidence: 0.8 } : null, review: opts.parsed ? 'unmatched_exit' : null, tradeKey: null,
    },
  });
  const notes = [
    // Old import: the creator flagged as the trader.
    note(CREATOR, 'creator🃏', 'out AMD 150c @ 2', { byTrader: true, parsed: true }),
    note(CREATOR, 'creator🃏', 'CES HOLY LTF SHIT', { byTrader: true, symbols: ['CES', 'HOLY', 'LTF', 'SHIT'], images: 1 }),
    ...Array.from({ length: 5 }, (_, i) => note(TRADER, 'Femi_fixture', `CRWD: HH HL on the HTF ${i}`, { images: 2, symbols: ['CRWD', 'HH', 'HL', 'HTF'] })),
    note(LEEK, 'leek', 'nice'),
  ];
  const plan = planBookRepair({
    trader: { id: 'trader-femi', slug: 'femi', name: 'Femi', handle: 'creator🃏', source: 'discord', discordChannelId: '777000000000000123', discordAuthorId: null },
    notes,
    watchlist: ['AAPL', 'CVX', 'INTC', 'PG', 'CES', 'HOLY', 'LTF', 'SHIT'].map((s, i) => ({ id: `w${i}`, symbol: s, note: null })),
    trades: [{ id: 'jt1', symbol: 'AMD', brokerOrderId: `discord:${notes[0].sourceMessageId}`, rawCsvRow: { source: 'discord-forum', threadId: '777000000000000123', messageIds: [notes[0].sourceMessageId] } }],
    universe: new Set(['AAPL', 'CVX', 'INTC', 'PG', 'CRWD', 'AMD']),
    visionCap: 1500,
  });
  const t = plan.threads[0];
  assert.equal(t.resolved?.authorId, TRADER);
  assert.equal(t.oldAuthor?.authorId, CREATOR);
  assert.ok(t.changed);
  assert.deepEqual(t.authors.map((a) => [a.authorName, a.messages, a.images]), [['Femi_fixture', 5, 10], ['creator🃏', 2, 1], ['leek', 1, 0]]);
  assert.deepEqual([plan.images, plan.cost.billable, plan.cost.usd], [10, 10, 0.09], "the resolved author's screenshots, not the creator's");
  assert.deepEqual(plan.handle, { from: 'creator🃏', to: 'Femi_fixture' });
  assert.equal(plan.traderPatch.discordAuthorId, TRADER);
  assert.equal(plan.traderPatch.discordChannelId, undefined, 'the repair only touches identity');
  assert.deepEqual(plan.junkWatchlist.map((w) => w.symbol), ['CES', 'HOLY', 'LTF', 'SHIT']);
  const flips = plan.noteFixes.filter((f) => f.byTrader);
  assert.equal(flips.filter((f) => f.byTrader!.to).length, 5, "the trader's 5 posts become theirs");
  assert.equal(flips.filter((f) => !f.byTrader!.to).length, 2, "the creator's 2 become comments");
  assert.equal(plan.noteFixes.filter((f) => f.clearedParse).length, 1);
  const cleared = plan.noteFixes.find((f) => f.clearedParse)!;
  assert.deepEqual([cleared.meta.parsed, cleared.meta.review, cleared.meta.byTrader], [null, null, false]);
  const sym = plan.noteFixes.find((f) => f.symbols && f.symbols.from.includes('HTF'))!;
  assert.deepEqual(sym.symbols!.to, ['CRWD']);
  assert.deepEqual(plan.wrongAuthorTrades.map((x) => x.symbol), ['AMD']);
  assert.match(formatBookPlan(plan), /resolved author: Femi_fixture/);
  assert.match(formatBookPlan(plan), /junk watchlist rows to remove \(4\): CES HOLY LTF SHIT/);

  // Idempotent: after applying the plan, a new plan has nothing to do.
  const applied: PlanNote[] = notes.map((x) => {
    const f = plan.noteFixes.find((y) => y.id === x.id);
    return f ? { ...x, meta: f.meta, symbols: f.symbols ? f.symbols.to : x.symbols } : x;
  });
  const again = planBookRepair({
    trader: { id: 'trader-femi', slug: 'femi', name: 'Femi', handle: 'Femi_fixture', source: 'discord', discordChannelId: '777000000000000123', discordAuthorId: TRADER },
    notes: applied, watchlist: ['AAPL', 'CVX', 'INTC', 'PG'].map((s, i) => ({ id: `w${i}`, symbol: s, note: null })), trades: [],
    universe: new Set(['AAPL', 'CVX', 'INTC', 'PG', 'CRWD', 'AMD']),
  });
  assert.deepEqual([again.noteFixes.length, again.junkWatchlist.length, again.handle, Object.keys(again.traderPatch).length, again.threads[0].changed], [0, 0, null, 0, false]);
  assert.equal(again.threads[0].resolved?.via, 'stored_id', 'after apply the stored author id decides');
}

console.log('discord attribution checks passed');
