/**
 * Discord FORUM import checks — forum/thread pagination + rate limits (mocked
 * Discord), thread → trader mapping, trade parsing accuracy, and ranking.
 *
 *   npx tsx scripts/test-discord-forum.ts        (also run by scripts/test-journal.ts)
 *
 * FIXTURES ONLY. Every message, id, price and bar below is synthetic, written
 * for these tests — none of it is a real Discord post or a real trader's
 * result. The thread NAMES are the operator's real forum thread titles (the
 * mapping has to work on them); their contents are not used.
 */
import assert from 'node:assert/strict';
import { discordReader } from '../server/discord-reader';
import {
  buildThreadImport, discordMessageLink, matchThreadToTrader, readExportMeta, reviewReasonOf, threadTraderSuggestion,
} from '../shared/discord-forum';
import { pairDiscordMessages, parseDiscordMessage, type DiscordMsg } from '../shared/discord-journal-parser';
import {
  SMALL_SAMPLE, TRADER_FEED_DEFAULTS, feedEligible, measureOnUnderlying, rankScore, rankTraders, statedR, tradingDaysBetween,
  traderStats, underlyingSide, type BarRow, type RankTrade,
} from '../shared/trader-ranking';

// ─── 1 · Forum listing + thread pagination against a mocked Discord ──────────
{
  const FORUM = '100000000000000001';
  const GUILD = '200000000000000002';
  const OTHER = '100000000000000009';
  const T = (n: number) => String(300000000000000000n + BigInt(n));
  const calls: string[] = [];
  const slept: number[] = [];
  let hit429 = false;
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) => ({
    status, ok: status >= 200 && status < 300,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
  });
  // FIXTURE thread messages: 250 synthetic messages in thread T(1), ids descending newest→oldest.
  const msgs = Array.from({ length: 250 }, (_, i) => ({
    id: String(900000000000000000n + BigInt(250 - i)), timestamp: new Date(Date.UTC(2026, 8, 1) + (250 - i) * 60_000).toISOString(),
    author: { id: '42', username: 'fixture_trader' }, content: `fixture message ${250 - i}`, attachments: [],
  }));
  const fetchImpl = async (url: string) => {
    const u = new URL(url);
    const path = u.pathname.replace('/api/v10', '');
    calls.push(`${path}${u.search}`);
    if (path === `/channels/${FORUM}`) return json(200, { id: FORUM, type: 15, guild_id: GUILD, name: 'trading-journals' });
    if (path === `/guilds/${GUILD}/threads/active`) {
      return json(200, { threads: [
        { id: T(1), name: "femi's trading journals", parent_id: FORUM, owner_id: '42', message_count: 250, thread_metadata: { archived: false } },
        { id: T(9), name: 'general chat thread', parent_id: OTHER, thread_metadata: { archived: false } },
      ] });
    }
    if (path === `/channels/${FORUM}/threads/archived/public`) {
      const before = u.searchParams.get('before');
      if (!before) {
        return json(200, { has_more: true, threads: [
          { id: T(2), name: 'Leeks $300 to 5 figgy challenge', parent_id: FORUM, thread_metadata: { archived: true, archive_timestamp: '2026-09-20T00:00:00.000Z' } },
          { id: T(3), name: "UZO's Road to a Milly", parent_id: FORUM, thread_metadata: { archived: true, archive_timestamp: '2026-09-10T00:00:00.000Z' } },
        ] }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset-after': '0.25' });
      }
      assert.equal(before, '2026-09-10T00:00:00.000Z', 'archived pagination uses the last archive_timestamp');
      return json(200, { has_more: false, threads: [
        { id: T(3), name: "UZO's Road to a Milly", parent_id: FORUM, thread_metadata: { archived: true, archive_timestamp: '2026-09-10T00:00:00.000Z' } },
        { id: T(4), name: "kasyah's futures journal", parent_id: FORUM, thread_metadata: { archived: true, archive_timestamp: '2026-09-01T00:00:00.000Z' } },
      ] });
    }
    if (path === `/channels/${T(1)}/messages`) {
      if (!hit429) { hit429 = true; return json(429, { retry_after: 0.5 }); }
      const before = u.searchParams.get('before');
      const start = before ? msgs.findIndex((m) => m.id === before) + 1 : 0;
      return json(200, msgs.slice(start, start + 100));
    }
    return json(404, {});
  };
  const reader = discordReader({ token: 'fixture-token', fetchImpl: fetchImpl as any, sleep: async (ms) => { slept.push(ms); } });
  const listing = await reader.listForumThreads(FORUM);
  assert.deepEqual(listing.threads.map((t) => t.id).sort(), [T(1), T(2), T(3), T(4)], 'active (filtered by parent) + 2 archived pages, deduped');
  assert.equal(listing.threads.find((t) => t.id === T(1))!.ownerId, '42');
  assert.ok(listing.threads.every((t) => t.guildId === GUILD));
  assert.ok(!listing.threads.some((t) => t.id === T(9)), 'threads of another parent are dropped');
  assert.ok(slept.includes(250), 'X-RateLimit-Remaining 0 → sleeps Reset-After');

  const got = await reader.threadMessages(T(1));
  assert.equal(got.length, 250, '100 + 100 + 50 via before= pagination');
  assert.equal(new Set(got.map((m: any) => m.id)).size, 250, 'no page read twice');
  assert.ok(slept.includes(500), '429 retry_after 0.5s honoured');
  const msgCalls = calls.filter((c) => c.startsWith(`/channels/${T(1)}/messages`));
  assert.equal(msgCalls.length, 4, '1 rate-limited + 3 pages');
  assert.ok(msgCalls[3].includes(`before=${msgs[199].id}`), 'third page asks before the 200th message');

  // Retries are bounded.
  const always429 = discordReader({ token: 'x', fetchImpl: (async () => json(429, { retry_after: 0.01 })) as any, sleep: async () => {}, maxRetries: 2 });
  await assert.rejects(always429.threadMessages(T(1)), /rate-limiting/);
  // Non-forum channel refused.
  const notForum = discordReader({ token: 'x', fetchImpl: (async () => json(200, { id: FORUM, type: 2, guild_id: GUILD })) as any, sleep: async () => {} });
  await assert.rejects(notForum.listForumThreads(FORUM), /not a forum/);
}

// ─── 2 · Thread → trader mapping (the operator's real thread titles) ─────────
{
  const seeded = [{ slug: 'femi', name: 'Femi' }, { slug: 'malik', name: 'Malik' }, { slug: 'uzo', name: 'Uzo' }, { slug: 'bean', name: 'Bean' }];
  const m = (name: string) => matchThreadToTrader({ name }, seeded);
  assert.deepEqual(m("femi's trading journals"), { slug: 'femi', name: 'Femi', existing: true, via: 'slug' });
  assert.deepEqual(m("UZO's Road to a Milly"), { slug: 'uzo', name: 'Uzo', existing: true, via: 'slug' });
  assert.deepEqual(m('Leeks $300 to 5 figgy challenge'), { slug: 'leek', name: 'Leek', existing: false, via: 'suggested' });
  assert.deepEqual(m("kasyah's futures journal"), { slug: 'kasyah', name: 'Kasyah', existing: false, via: 'suggested' });
  assert.deepEqual(m("ayo's trading journal"), { slug: 'ayo', name: 'Ayo', existing: false, via: 'suggested' });
  assert.deepEqual(m("gushiesty's journal"), { slug: 'gushiesty', name: 'Gushiesty', existing: false, via: 'suggested' });
  assert.deepEqual(m("P4E's Journal"), { slug: 'p4e', name: 'P4E', existing: false, via: 'suggested' });
  assert.deepEqual(m("Teejay's journals"), { slug: 'teejay', name: 'Teejay', existing: false, via: 'suggested' });
  // Once a trader exists, the same thread matches it (idempotent re-import).
  assert.deepEqual(matchThreadToTrader({ name: 'Leeks $300 to 5 figgy challenge' }, [...seeded, { slug: 'leek', name: 'Leek' }]).existing, true);
  // A handle match wins when the name says nothing.
  assert.deepEqual(matchThreadToTrader({ name: 'Road to a Milly', authorNames: ['uzo_trades'] }, [...seeded.slice(0, 2), { slug: 'uzo', name: 'Uzo', handle: '@uzo_trades' }]),
    { slug: 'uzo', name: 'Uzo', existing: true, via: 'handle' });
  assert.equal(threadTraderSuggestion('💎💎 ✨'), null);
  assert.equal(discordMessageLink('1', '2', '3'), 'https://discord.com/channels/1/2/3');
  assert.equal(discordMessageLink(null, '2', '3'), null);
  // DiscordChatExporter export metadata (FIXTURE shape).
  const meta = readExportMeta({ guild: { id: '5', name: 'Fixture Guild' }, channel: { id: '7', type: 'GuildPublicThread', categoryId: '6', category: 'trading-journals', name: "ayo's trading journal" }, messages: [] });
  assert.deepEqual(meta, { threadId: '7', threadName: "ayo's trading journal", parentId: '6', parentName: 'trading-journals', guildId: '5', guildName: 'Fixture Guild', isThread: true });
}

// ─── 3 · Trade parsing accuracy on labelled FIXTURE messages ─────────────────
{
  let seq = 0;
  const at = (iso: string, content: string, replyTo: string | null = null, author = 'a1'): DiscordMsg =>
    ({ id: `f${String(++seq).padStart(3, '0')}`, timestamp: iso, authorId: author, authorName: 'fixture', content, attachments: [], replyTo });
  type Expect = Partial<{ kind: string; symbol: string | null; optionType: string | null; strike: number | null; expiry: string | null; price: number | null; stop: number | null; target: number | null; qty: number | null; side: string }>;
  const cases: [DiscordMsg, Expect][] = [
    [at('2026-09-22T14:00:00Z', 'BE 300c 10/2 @1.00 stop .5 pt 2'), { kind: 'entry', symbol: 'BE', optionType: 'call', strike: 300, expiry: '2026-10-02', price: 1, stop: 0.5, target: 2 }],
    [at('2026-09-22T14:05:00Z', 'in NVDA 190c 10/17 @ 2.15 x2'), { kind: 'entry', symbol: 'NVDA', optionType: 'call', strike: 190, expiry: '2026-10-17', price: 2.15, qty: 2 }],
    [at('2026-09-22T15:00:00Z', 'trimmed half NVDA 190c @ 3.10'), { kind: 'trim', symbol: 'NVDA', price: 3.1 }],
    [at('2026-09-22T16:00:00Z', 'out NVDA 190c @ 3.60'), { kind: 'exit', symbol: 'NVDA', price: 3.6 }],
    [at('2026-09-22T14:10:00Z', 'long $AMD 145.20 stop 141 target 152'), { kind: 'entry', symbol: 'AMD', price: 145.2, stop: 141, target: 152, side: 'long' }],
    [at('2026-09-22T14:20:00Z', 'SPY 0dte 450p @.45'), { kind: 'entry', symbol: 'SPY', optionType: 'put', strike: 450, expiry: '2026-09-22', price: 0.45 }],
    [at('2026-09-23T15:00:00Z', 'sold AMD 150.80'), { kind: 'exit', symbol: 'AMD', price: 150.8 }],
    [at('2026-09-22T14:30:00Z', 'short $TSLA @ 250 sl 258'), { kind: 'entry', symbol: 'TSLA', price: 250, stop: 258, side: 'short' }],
    [at('2026-09-24T14:30:00Z', 'stopped out TSLA'), { kind: 'exit', symbol: 'TSLA', price: null }],
    [at('2026-09-22T13:00:00Z', 'QQQ looking heavy under 480, watching the 200d'), { kind: 'note' }],
    [at('2026-09-22T14:40:00Z', 'grabbed some META 600c 11/21 at 5.2'), { kind: 'entry', symbol: 'META', optionType: 'call', strike: 600, expiry: '2026-11-21', price: 5.2 }],
    [at('2026-09-23T14:40:00Z', 'tp META 600c @ 9.4'), { kind: 'exit', symbol: 'META', price: 9.4 }],
    [at('2026-09-22T12:00:00Z', 'gm fam'), { kind: 'note' }],
    [at('2026-09-22T14:50:00Z', 'adding IWM 220c 10/10 @ 1.1'), { kind: 'entry', symbol: 'IWM', optionType: 'call', strike: 220, expiry: '2026-10-10', price: 1.1 }],
    [at('2026-09-22T14:55:00Z', 'AAPL 250p 10/3 looking juicy, might grab under 2'), { kind: 'note' }],
    [at('2026-09-23T14:55:00Z', 'PLTR 180c +80% 🔥'), { kind: 'note' }],
  ];
  let fields = 0, right = 0, exact = 0;
  const misses: string[] = [];
  for (const [msg, want] of cases) {
    const p = parseDiscordMessage(msg) as any;
    let ok = true;
    for (const [k, v] of Object.entries(want)) {
      fields++;
      if (p[k] === v) right++;
      else { ok = false; misses.push(`"${msg.content}" ${k}: got ${JSON.stringify(p[k])}, want ${JSON.stringify(v)}`); }
    }
    if (ok) exact++;
  }
  const fieldAcc = right / fields;
  console.log(`parse accuracy on ${cases.length} labelled fixture messages: ${exact}/${cases.length} exact, ${right}/${fields} fields (${(fieldAcc * 100).toFixed(1)}%)`);
  if (misses.length) console.log(`  misses:\n  ${misses.join('\n  ')}`);
  assert.ok(exact >= 15 && fieldAcc >= 0.95, 'parser accuracy regressed on the labelled fixtures');

  // A second labelled set written in OTHER styles, NOT used to tune the grammar —
  // its accuracy is the honest number (futures, "for 2.5", "TP 5.00", share counts).
  const unseen: [DiscordMsg, Expect][] = [
    [at('2026-09-22T14:00:00Z', 'SPX 5800p 0dte filled 4.20'), { kind: 'entry', symbol: 'SPX', optionType: 'put', strike: 5800, price: 4.2 }],
    [at('2026-09-22T15:00:00Z', 'Closed my HOOD calls for +120%'), { kind: 'exit', symbol: 'HOOD' }],
    [at('2026-09-22T15:05:00Z', 'cut the AMZN puts, -35%'), { kind: 'exit', symbol: 'AMZN' }],
    [at('2026-09-22T14:10:00Z', 'Entry: TSLA 260C 10/03 @ 3.40 | SL 2.00 | TP 5.00'), { kind: 'entry', symbol: 'TSLA', optionType: 'call', strike: 260, expiry: '2026-10-03', price: 3.4, stop: 2, target: 5 }],
    [at('2026-09-22T14:15:00Z', 'bought 100 shares of F at 11.20'), { kind: 'entry', symbol: 'F', price: 11.2, qty: 100 }],
    [at('2026-09-22T14:20:00Z', 'NVDA calls printing today'), { kind: 'note' }],
    [at('2026-09-22T14:25:00Z', 'scaling out of COIN 250c here @ 6'), { kind: 'trim', symbol: 'COIN', price: 6 }],
    [at('2026-09-22T14:30:00Z', 'Stop hit on RIVN'), { kind: 'exit', symbol: 'RIVN' }],
    [at('2026-09-22T14:35:00Z', 'watching MSFT 420 for a break, calls if it holds'), { kind: 'note' }],
    [at('2026-09-22T14:40:00Z', 'long ES 5850, stop 5830, target 5890'), { kind: 'entry', symbol: 'ES', price: 5850, stop: 5830, target: 5890 }],
    [at('2026-09-22T14:45:00Z', 'sold half my GOOGL 180c for 2.5'), { kind: 'trim', symbol: 'GOOGL', price: 2.5 }],
    [at('2026-09-22T14:50:00Z', 'in $PLTR 185 calls 10/17 at 3.05'), { kind: 'entry', symbol: 'PLTR', optionType: 'call', strike: 185, expiry: '2026-10-17', price: 3.05 }],
  ];
  let uf = 0, ur = 0, ue = 0;
  const umiss: string[] = [];
  for (const [msg, want] of unseen) {
    const p = parseDiscordMessage(msg) as any;
    let ok = true;
    for (const [k, v] of Object.entries(want)) {
      uf++;
      if (p[k] === v) ur++;
      else { ok = false; umiss.push(`"${msg.content}" ${k}: got ${JSON.stringify(p[k])}, want ${JSON.stringify(v)}`); }
    }
    if (ok) ue++;
  }
  console.log(`parse accuracy on ${unseen.length} held-out fixture messages: ${ue}/${unseen.length} exact, ${ur}/${uf} fields (${((ur / uf) * 100).toFixed(1)}%)`);
  if (umiss.length) console.log(`  misses:\n  ${umiss.join('\n  ')}`);
  // 7/12 before fix/fvision; its misses (TP mid-sentence, "shares of F", "Stop hit on RIVN", "long ES 5850", "for 2.5")
  // were then fixed, so this set is now tuned — the fresh held-out set lives in scripts/test-forum-vision.ts.
  assert.ok(ue >= 11 && ur / uf >= 0.95, 'held-out accuracy regressed (12/12 exact, 42/42 fields after fix/fvision)');
  (globalThis as any).__forumParseAccuracy = { tuned: { exact, n: cases.length, fields: right, of: fields }, heldOut: { exact: ue, n: unseen.length, fields: ur, of: uf } };

  // Confidence: a full contract with price and verb scores above a bare stock mention.
  assert.ok(parseDiscordMessage(cases[1][0]).confidence > parseDiscordMessage(cases[6][0]).confidence);
  // Trade-looking notes go to review; chatter does not.
  assert.equal(reviewReasonOf(parseDiscordMessage(cases[15][0]), 'analysis'), 'trade_looking', 'contract with a % but no verb → review');
  assert.equal(reviewReasonOf(parseDiscordMessage(cases[9][0]), 'analysis'), null, 'analysis is not review');
  assert.equal(reviewReasonOf(parseDiscordMessage(cases[14][0]), 'analysis'), 'trade_looking', 'a contract mentioned without a fill → review');

  // Pairing on the fixtures: stops/targets carried, confidence per trade, P&L only with both legs.
  const pair = pairDiscordMessages(cases.map(([m]) => m));
  const by = (s: string) => pair.trades.find((t) => t.symbol === s)!;
  assert.equal(by('BE').status, 'open');
  assert.equal(by('BE').exitPrice, null, 'no exit invented for an open call');
  assert.deepEqual([by('BE').stop, by('BE').target], [0.5, 2]);
  assert.deepEqual([by('AMD').status, by('AMD').exitPrice, by('AMD').stop, by('AMD').target], ['closed', 150.8, 141, 152]);
  assert.equal(by('NVDA').status, 'closed');
  assert.equal(by('NVDA').exitVia, 'contract');
  assert.ok(by('NVDA').confidence > 0.7 && by('NVDA').confidence < 1);
  assert.equal(pair.trades.find((t) => t.symbol === 'TSLA'), undefined, 'stopped out with no price → a note, not a scored trade');
  assert.ok(pair.notes.some((n) => n.reason === 'unpriced_exit' && n.symbols.includes('TSLA')));
  assert.equal(statedR({ direction: 'long', entryPrice: 145.2, exitPrice: 150.8, stop: 141 }), 1.33);

  // Whole-thread import: posts keep every message (others' comments too), trades only from the main author.
  const thread = { id: '777', name: "femi's trading journals", guildId: '5', ownerId: 'a1' };
  const comment = at('2026-09-22T14:06:00Z', 'nice entry! in NVDA 190c @ 2.00 too', 'f002', 'b2');
  const imp = buildThreadImport(thread, [...cases.map(([m]) => m), comment]);
  assert.equal(imp.primary?.authorId, 'a1');
  assert.equal(imp.posts.length, cases.length + 1, 'every message with text becomes a notebook entry');
  assert.equal(imp.trades.filter((t) => t.authorId === 'b2').length, 0, "a commenter's fill is not the trader's trade");
  const bePost = imp.posts.find((p) => p.messageId === 'f001')!;
  assert.equal(bePost.meta.link, null, 'fixture ids are not Discord snowflakes → no link is made up');
  assert.equal(bePost.body, 'BE 300c 10/2 @1.00 stop .5 pt 2', 'text preserved as posted');
  assert.equal(bePost.meta.tradeKey, 'f001');
  assert.ok(imp.review.some((r) => r.messageId === 'f016'), 'PLTR +80% with no entry → review list');
  assert.ok(imp.review.some((r) => r.reason === 'unpriced_exit'));
  // Idempotent: same input → same keys.
  assert.deepEqual(buildThreadImport(thread, cases.map(([m]) => m)).trades.map((t) => t.key), buildThreadImport(thread, [...cases.map(([m]) => m)].reverse()).trades.map((t) => t.key));
}

// ─── 4 · Measured on underlying + ranking ────────────────────────────────────
{
  const D = 86_400_000;
  const day0 = Date.UTC(2026, 8, 21, 13, 30); // FIXTURE daily bars stamped 09:30 ET
  // [t, o, h, l, c] — synthetic.
  const bars: BarRow[] = [
    [day0, 100, 101, 99, 100.5],
    [day0 + D, 101, 103, 100.5, 102.5],
    [day0 + 2 * D, 102.5, 104, 101, 103],
    [day0 + 3 * D, 103, 103.5, 98, 99],
    [day0 + 4 * D, 99, 100, 97, 98],
    [day0 + 7 * D, 98, 99, 96, 97],
    [day0 + 8 * D, 97, 98, 95, 96],
  ];
  // Posted 10:00 ET day0 → reference is the NEXT bar's open (no look-ahead).
  const post = day0 + 30 * 60_000;
  const long = measureOnUnderlying(bars, post, 'long')!;
  assert.equal(long.refPrice, 101);
  assert.equal(long.bars, 5);
  assert.equal(long.complete, true);
  assert.equal(long.closePct, -3.96, "(97 − 101) / 101");
  assert.equal(long.correct, false);
  assert.equal(long.mfePct, 2.97);
  assert.equal(long.basis, 'measured on underlying');
  const short = measureOnUnderlying(bars, post, 'short')!;
  assert.equal(short.closePct, 3.96);
  assert.equal(short.correct, true);
  // Stop/target on the underlying: stop 99.5 and target 103.8 — target prints first (day0+2D high 104).
  assert.equal(measureOnUnderlying(bars, post, 'long', { stop: 99.5, target: 103.8 })!.hit, 'target');
  // Same bar prints both → stop (conservative).
  assert.equal(measureOnUnderlying([[day0 + D, 100, 106, 94, 100]], post, 'long', { stop: 95, target: 105 })!.hit, 'stop');
  // Option expiring on day0+2D: window ends there.
  const opt = measureOnUnderlying(bars, post, 'long', { expiryMs: day0 + 2 * D + 7 * 3_600_000 })!;
  assert.deepEqual([opt.bars, opt.complete], [2, true]);
  assert.equal(measureOnUnderlying(bars, day0 + 9 * D, 'long'), null, 'too recent: no bar after the post');
  assert.equal(underlyingSide({ assetType: 'option', direction: 'long', optionType: 'put' }), 'short');
  assert.equal(underlyingSide({ assetType: 'option', direction: 'short', optionType: 'put' }), 'long');

  // Trading days (weekends skipped): Fri → Mon = 1; Mon → next Mon = 5.
  assert.equal(tradingDaysBetween(Date.parse('2026-09-25T15:00:00Z'), Date.parse('2026-09-28T15:00:00Z')), 1);
  assert.equal(tradingDaysBetween(Date.parse('2026-09-21T15:00:00Z'), Date.parse('2026-09-28T15:00:00Z')), 5);

  // Stats on FIXTURE trades.
  const mk = (i: number, p: Partial<RankTrade>): RankTrade => ({
    id: `t${i}`, symbol: 'SPY', assetType: 'option', direction: 'long', optionType: 'call', status: 'closed', entryPrice: 1,
    entryTime: new Date(Date.UTC(2026, 6, 1) + i * D).toISOString(), ...p,
  });
  const rows: RankTrade[] = [
    mk(1, { pnlPct: 100, setupType: 'lotto', exitPrice: 2, stop: 0.5, holdingMinutes: 60 }),
    mk(2, { pnlPct: -50, setupType: 'lotto', exitPrice: 0.5, holdingMinutes: 30 }),
    mk(3, { pnlPct: 40, symbol: 'NVDA', setupType: 'swing', holdingMinutes: 600 }),
    mk(4, { pnlPct: 20, symbol: 'NVDA', setupType: 'swing', holdingMinutes: 1200 }),
    mk(5, { status: 'open', measured: { ...long } }),
    mk(6, { status: 'open', measured: { ...short } }),
    mk(7, { status: 'open', measured: { ...short, complete: false } }),
  ];
  const s = traderStats(rows);
  assert.deepEqual([s.stated.n, s.stated.wins, s.stated.losses, s.stated.winRate, s.stated.avgPct], [4, 3, 1, 75, 27.5]);
  assert.equal(s.stated.profitFactor, 3.2, '(100+40+20)/50');
  assert.deepEqual([s.stated.avgR, s.stated.rN], [2, 1]);
  assert.equal(s.stated.avgHoldMinutes, 473);
  assert.equal(s.stated.smallSample, true, `under ${SMALL_SAMPLE} is flagged`);
  assert.deepEqual([s.measured.n, s.measured.correct, s.measured.pending], [2, 1, 1], 'incomplete windows are pending, not scored');
  assert.deepEqual(s.bestSetups.map((g) => g.key), ['swing', 'lotto']);
  assert.deepEqual(s.bestTickers.map((g) => g.key), ['NVDA', 'SPY']);
  assert.equal(s.open, 3);
  // Shrunk score: stated (3+2.5)/(4+5)=0.611, measured (1+2.5)/(2+5)=0.5 → 55.6
  assert.equal(rankScore(s.stated, s.measured), 55.6);
  assert.equal(rankScore({ n: 3, wins: 3 }, { n: 0, correct: 0 }), 68.8, '3/3 is not 100');
  assert.equal(rankScore({ n: 0, wins: 0 }, { n: 0, correct: 0 }), null);

  const board = rankTraders([
    { slug: 'a', name: 'A', stats: { ...s, score: 70, sample: 25 } },
    { slug: 'b', name: 'B', stats: { ...s, score: 80, sample: 4 } },
    { slug: 'c', name: 'C', stats: { ...s, score: null, sample: 0 } },
  ]);
  assert.deepEqual(board.map((r) => [r.slug, r.rank, r.passes]), [['b', 1, false], ['a', 2, true], ['c', null, false]], 'B ranks first but its 4-call sample does not pass');

  // Feed eligibility: open, recent (≤5 trading days), confident, from a passing trader.
  const now = Date.parse('2026-09-29T16:00:00Z');
  const call = { status: 'open', entryTime: '2026-09-28T14:00:00Z', confidence: 0.8 };
  assert.equal(feedEligible(call, true, now), true);
  assert.equal(feedEligible(call, false, now), false, 'trader below threshold');
  assert.equal(feedEligible({ ...call, status: 'closed' }, true, now), false);
  assert.equal(feedEligible({ ...call, confidence: 0.4 }, true, now), false);
  assert.equal(feedEligible({ ...call, entryTime: '2026-09-18T14:00:00Z' }, true, now), false, '7 trading days old');
  assert.equal(TRADER_FEED_DEFAULTS.maxAgeTradingDays, 5);
}

// ─── 5 · NEXUS default still tiles 12×18 with the Trader calls tool ──────────
{
  const { NEXUS_DEFAULTS } = await import('../client/src/components/dashboard/defs/nexus');
  const { tilingIssues } = await import('../client/src/components/dashboard/layout');
  for (const d of NEXUS_DEFAULTS) assert.deepEqual(tilingIssues(d.tools.map(([type, x, y, w, h]) => ({ type, x, y, w, h }))), [], `nexus default ${d.id} tiles`);
  assert.ok(NEXUS_DEFAULTS[0].tools.some(([t]) => t === 'nexus-trader-calls'), 'Trader calls is on the NEXUS default');
}

console.log('discord forum checks passed');

// Screenshots (vision, mocked model), Mine mapping + broker dedupe, FIFO pairing, parser fixes.
await import('./test-forum-vision');

// Author attribution (thread creator ≠ journal author), ticker stop-list, re-import repair plan.
await import('./test-discord-attribution');
