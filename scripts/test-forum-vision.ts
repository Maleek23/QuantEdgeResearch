/**
 * Forum import, screenshots edition — thread → book mapping (Mine alias,
 * known traders), vision JSON validation, the vision runner (mocked model:
 * cache, budget cap, retries, concurrency), text + screenshot merging, FIFO
 * pairing, the broker-row dedupe in Mine, and the text parser's fixed misses.
 *
 *   npx tsx scripts/test-forum-vision.ts        (also run by scripts/test-discord-forum.ts → test-journal.ts)
 *
 * FIXTURES ONLY. Every message, id, image byte, model reply, price and broker
 * row below is synthetic, written for these tests. No model is called, no
 * network is touched: the "model" is a function returning canned JSON.
 */
import assert from 'node:assert/strict';
import {
  MINE_SLUG, buildThreadImport, isMineSlug, mapThreadToBook, matchThreadToTrader, summarizeVision,
} from '../shared/discord-forum';
import { pairDiscordMessages, parseDiscordMessage, type DiscordMsg } from '../shared/discord-journal-parser';
import {
  FORUM_VISION_MAX_IMAGES_DEFAULT, VISION_MODEL, attachmentIdOf, estimateVisionCost, mergeMessageLegs, nyWallToIso, parseVisionText,
  resolveVisionExpiry, resolveVisionTime, sniffImageType, textLeg, visionLegs, visionMaxImages,
  type ForumLeg, type VisionImageRecord, type VisionResult,
} from '../shared/forum-vision';
import { dedupeLegs, matchBrokerRows, pairForumLegs, type BrokerRowLike } from '../shared/forum-pairing';
import { VisionHttpError, createVisionRunner, emptyVisionCache, visionCacheFrom, type VisionCaller } from '../server/forum-vision';

// ─── 1 · Thread → book: Mine alias, known traders, confirmation ──────────────
{
  // FIXTURE trader table (femi/uzo exist; a stray "leek" trader row must not win over Mine).
  const traders = [{ slug: 'femi', name: 'Femi' }, { slug: 'uzo', name: 'Uzo' }, { slug: 'bean', name: 'Bean' }];
  const m = (name: string, authorNames: string[] = [], t = traders) => mapThreadToBook({ name, authorNames }, t);

  const leek = m('Leeks $300 to 5 figgy challenge');
  assert.deepEqual([leek?.book, leek?.slug, leek?.confirm], ['mine', MINE_SLUG, false], 'the operator\'s thread → Mine, pre-confirmed');
  assert.equal(m("Malik's journal")?.book, 'mine', 'malik = the operator');
  assert.equal(m('Leeks $300 to 5 figgy challenge', [], [...traders, { slug: 'leek', name: 'Leek' }, { slug: 'malik', name: 'Malik' }])?.book, 'mine',
    'even with a leek/malik trader row, the thread goes to Mine (no separate Leek book)');
  assert.equal(m('Road to 10k', ['leek_trades'])?.book, 'mine', 'author name alias');
  assert.ok(isMineSlug('leek') && isMineSlug('malik') && isMineSlug('mine') && !isMineSlug('femi'), 'check 1');
  // The plain trader matcher (used before) would have made a "Leek" trader — the book mapper never does.
  assert.equal(matchThreadToTrader({ name: 'Leeks $300 to 5 figgy challenge' }, traders)?.slug, 'leek');

  assert.deepEqual(m("femi's trading journals"), { slug: 'femi', name: 'Femi', existing: true, via: 'alias', book: 'trader', confirm: false });
  assert.deepEqual(m("UZO's Road to a Milly"), { slug: 'uzo', name: 'Uzo', existing: true, via: 'alias', book: 'trader', confirm: false });
  assert.deepEqual(m("ayo's trading journal"), { slug: 'ayo', name: 'Ayo', existing: false, via: 'alias', book: 'trader', confirm: false },
    'ayo: known, created on import without a second click');
  const tj = m("Teejay's journals");
  assert.deepEqual([tj?.slug, tj?.name, tj?.existing, tj?.confirm], ['tommi', 'Tommi', false, true], 'teejay → tommi, pre-selected, NOT auto-confirmed');
  assert.deepEqual([m("tommi's plays")?.slug, m("tommi's plays")?.confirm], ['tommi', true]);
  assert.equal(m('Road to 10k', ['teejay'])?.slug, 'tommi', 'author alias');
  assert.equal(m("tommi's plays", [], [...traders, { slug: 'tommi', name: 'Tommi' }])?.confirm, true, 'still asks even once Tommi exists');
  const k = m("kasyah's futures journal");
  assert.deepEqual([k?.slug, k?.existing, k?.confirm], ['kasyah', false, true], 'unknown new trader: confirm + name');
  assert.equal(m("bean's lotto log")?.slug, 'bean', 'existing trader by slug');
}

// ─── 2 · Vision JSON validation (zod) ────────────────────────────────────────
{
  const fill = parseVisionText('```json\n{"kind":"broker_fill","confidence":0.92,"trades":[{"ticker":"$nvda","assetType":"Option","side":"Buy","optionType":"CALL","strike":"190","expiry":"10/17","qty":2,"price":"$2.15","date":null,"time":"10:42 AM","action":"open","realizedPnl":null}],"statedPnl":{"amount":null,"percent":null},"chart":null,"notes":null}\n```');
  assert.ok(fill.ok, 'check 2');
  if (fill.ok) {
    assert.equal(fill.result.kind, 'broker_fill');
    assert.deepEqual(fill.result.trades[0], { ticker: 'NVDA', assetType: 'option', side: 'buy', optionType: 'call', strike: 190, expiry: '10/17', qty: 2, price: 2.15, date: null, time: '10:42 AM', action: 'open', realizedPnl: null });
    assert.equal(fill.result.statedPnl, null, 'all-null stated P&L collapses to null');
  }
  const pnl = parseVisionText('{"kind":"pnl_summary","confidence":0.8,"trades":[{"ticker":"SPY","assetType":"option","optionType":"put","strike":450,"qty":3,"realizedPnl":"(45.00)"}],"statedPnl":{"amount":"-45","percent":null}}');
  assert.ok(pnl.ok && pnl.result.trades[0].realizedPnl === -45 && pnl.result.statedPnl?.amount === -45, 'broker (45.00) = −45');
  const chart = parseVisionText('{"kind":"chart","confidence":0.7,"trades":[{"ticker":"QQQ","qty":1,"price":480}],"chart":{"ticker":"QQQ","timeframe":"15m","levels":["480.5",482,"x"],"bias":"Short","thesis":"Rejected at the 480 shelf; lower highs into the close."}}');
  assert.ok(chart.ok, 'check 3');
  if (chart.ok) {
    assert.deepEqual(chart.result.trades, [], 'a chart books no trades');
    assert.equal(chart.result.dropped, 1);
    assert.deepEqual(chart.result.chart?.levels, [480.5, 482], 'non-numeric level dropped');
    assert.equal(chart.result.chart?.bias, 'short');
  }
  const partial = parseVisionText('{"kind":"broker_fill","confidence":0.9,"trades":[{"ticker":"","qty":1,"price":1},{"ticker":"AMD","qty":-3,"price":1},{"ticker":"AMD"},{"ticker":"AMD","qty":3,"price":150.2,"side":"sell"}]}');
  assert.ok(partial.ok && partial.result.trades.length === 1 && partial.result.dropped === 3, 'bad ticker, negative qty, nothing-to-book → dropped');
  assert.equal(parseVisionText('{"kind":"selfie","confidence":0.9,"trades":[]}').ok, false, 'unknown kind');
  assert.equal(parseVisionText('{"kind":"chart","confidence":1.4}').ok, false, 'confidence out of range');
  assert.equal(parseVisionText('I cannot read this image.').ok, false, 'prose only');
  assert.equal(parseVisionText('{"kind":"other",').ok, false, 'truncated JSON');
}

// ─── 3 · Expiry / time / identity helpers ────────────────────────────────────
{
  const posted = '2026-09-22T15:00:00.000Z'; // 11:00 ET
  assert.equal(resolveVisionExpiry('10/17', posted), '2026-10-17');
  assert.equal(resolveVisionExpiry('Oct 17', posted), '2026-10-17');
  assert.equal(resolveVisionExpiry("Jan 16 '27", posted), '2027-01-16');
  assert.equal(resolveVisionExpiry('17 Oct 2026', posted), '2026-10-17');
  assert.equal(resolveVisionExpiry('2026-10-17', posted), '2026-10-17');
  assert.equal(resolveVisionExpiry('next friday', posted), null, 'not guessed');
  assert.equal(nyWallToIso('2026-09-22', 10, 42), '2026-09-22T14:42:00.000Z', 'EDT');
  assert.equal(nyWallToIso('2026-12-01', 10, 42), '2026-12-01T15:42:00.000Z', 'EST');
  assert.deepEqual(resolveVisionTime(null, '10:42 AM', posted), { iso: '2026-09-22T14:42:00.000Z', fromImage: true });
  assert.deepEqual(resolveVisionTime(null, '2:30 PM', posted), { iso: posted, fromImage: false }, 'after the post → not trusted');
  assert.deepEqual(resolveVisionTime('09/21', '15:59', posted), { iso: '2026-09-21T19:59:00.000Z', fromImage: true });
  assert.equal(attachmentIdOf('https://cdn.discordapp.com/attachments/300000000000000001/400000000000000002/fill.png?ex=1&is=2&hm=3'), '400000000000000002');
  assert.equal(attachmentIdOf('https://example.com/x.png'), null);
  assert.equal(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
  assert.equal(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(sniffImageType(new Uint8Array([0x25, 0x50, 0x44, 0x46])), null, 'PDF is not an image');
}

// ─── 4 · Cost estimate + budget env ──────────────────────────────────────────
{
  const e = estimateVisionCost(1170);
  assert.equal(e.model, VISION_MODEL);
  assert.equal(e.perImageUsd, 0.0093, '(2,400 × $2 + 450 × $10) / 1M');
  assert.equal(e.usd, 10.88, '1,170 images ≈ $10.88');
  assert.equal(estimateVisionCost(1170, { cached: 170 }).usd, 9.3, 'already-read images are not billed');
  assert.equal(estimateVisionCost(2000, { cap: 1500 }).billable, 1500);
  assert.equal(visionMaxImages({}), FORUM_VISION_MAX_IMAGES_DEFAULT);
  assert.equal(visionMaxImages({ FORUM_VISION_MAX_IMAGES: '25' }), 25);
  assert.equal(visionMaxImages({ FORUM_VISION_MAX_IMAGES: 'lots' }), 1500);
}

// ─── 5 · Vision runner against a MOCKED model ────────────────────────────────
const PNG = (n: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, n, n + 1, n + 2]); // synthetic bytes
const url = (att: number, name = 'shot.png') => `https://cdn.discordapp.com/attachments/300000000000000001/40000000000000${String(att).padStart(4, '0')}/${name}?ex=fixture`;
const FILL_JSON = (ticker: string, price: number, side = 'buy') => JSON.stringify({ kind: 'broker_fill', confidence: 0.9, trades: [{ ticker, assetType: 'stock', side, qty: 10, price }] });
{
  let calls = 0, inFlight = 0, maxInFlight = 0;
  const slept: number[] = [];
  const bytesByUrl = new Map<string, Uint8Array>();
  for (let i = 1; i <= 8; i++) bytesByUrl.set(url(i), PNG(i));
  bytesByUrl.set(url(9), PNG(1)); // same bytes as #1 under a new attachment id (reposted)
  bytesByUrl.set(url(10), new Uint8Array(4_000_000)); // too large
  bytesByUrl.set(url(11), new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2])); // not an image
  const fetchImage = async (u: string) => {
    const b = bytesByUrl.get(u);
    if (!b) return { ok: false, status: 404, bytes: null };
    if (b.length > 3_750_000) return { ok: true, status: 200, bytes: b };
    return { ok: true, status: 200, bytes: b };
  };
  let fail429 = 1, fail529 = 1;
  const caller: VisionCaller = async (img) => {
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    const tag = Buffer.from(img.base64, 'base64')[8];
    if (tag === 2 && fail429-- > 0) throw new VisionHttpError(429, 'rate limited', 1500);
    if (tag === 3 && fail529-- > 0) throw new VisionHttpError(529, 'overloaded');
    calls++;
    if (tag === 4) return { text: 'not json at all', provider: 'anthropic', model: VISION_MODEL, usage: { input: 1800, output: 20 } };
    if (tag === 5) return { text: JSON.stringify({ kind: 'broker_fill', confidence: 0.3, trades: [{ ticker: 'BLUR', qty: 1, price: 1 }] }), provider: 'anthropic', model: VISION_MODEL, usage: { input: 1800, output: 60 } };
    if (tag === 6) throw new VisionHttpError(400, 'image could not be processed');
    return { text: FILL_JSON('AMD', 150 + tag), provider: 'anthropic', model: VISION_MODEL, usage: { input: 2000, output: 300 } };
  };
  const posted = '2026-09-22T15:00:00.000Z';
  const items = [1, 2, 3, 4, 5, 6, 9, 10, 11, 12].map((a, i) => ({ messageId: `m${i}`, index: 0, url: url(a), name: `a${a}.png`, postedAt: posted }));
  const progress: number[] = [];
  const cache = emptyVisionCache();
  const runner = createVisionRunner({ caller, cache, maxImages: 100, fetchImage, sleep: async (ms) => { slept.push(ms); }, onProgress: (p) => progress.push(p.done), now: () => '2026-09-29T00:00:00.000Z' });
  runner.setTotal(items.length);
  const got = await runner.run(items);
  const st = (i: number) => got.get(`m${i}`)![0].status;
  assert.deepEqual(items.map((_, i) => st(i)), ['ok', 'ok', 'ok', 'invalid', 'low_confidence', 'error', 'ok', 'too_large', 'unsupported', 'fetch_failed']);
  assert.ok(maxInFlight <= 3, `concurrency ≤ 3 (saw ${maxInFlight})`);
  assert.ok(slept.includes(1500), '429 Retry-After honoured');
  assert.ok(slept.includes(1000), '529 backs off 1s first');
  const p = runner.progress();
  assert.equal(p.done, 10);
  assert.equal(p.cached, 1, 'reposted image (same bytes, new attachment id) reused by hash');
  assert.equal(calls, 6, 'm0–m5 answered once each (m5 = a non-retried 400); m6 is a hash hit, not billed');
  assert.equal(p.retries, 2);
  assert.equal(p.lowConfidence, 1);
  assert.equal(p.tradesFound, 3, 'low-confidence trades are not counted');
  assert.equal(got.get('m6')![0].attachmentId, '400000000000000009', 'the reused record keeps its own attachment id');
  assert.equal(got.get('m0')![0].sha256?.length, 64);
  assert.equal(got.get('m0')![0].result?.trades[0].price, 151);
  assert.ok(progress.length === 11 && progress[10] === 10, 'progress: setTotal + one tick per image');
  assert.ok(p.usd > 0, 'spend tracked from reported usage');

  // Re-import: the stored readings (journal_notes.meta.vision) are the cache — nothing is billed again.
  const stored = [...got.values()].map((v) => ({ vision: v }));
  const again = createVisionRunner({ caller, cache: visionCacheFrom(stored), maxImages: 100, fetchImage: async () => { throw new Error('should not fetch'); }, sleep: async () => {} });
  const before = calls;
  const r2 = await again.run(items.slice(0, 5).map((x) => ({ ...x })));
  assert.equal(calls, before, 'cached by attachment id → no model call, no download');
  assert.equal(again.progress().cached, 5, 'ok, invalid and low-confidence readings are all reused (each was billed once)');
  assert.equal(r2.get('m0')![0].result?.trades[0].price, 151);

  // Budget cap: 4 new images, cap 2 → 2 read, 2 skipped (not billed).
  const capped = createVisionRunner({ caller, cache: emptyVisionCache(), maxImages: 2, fetchImage, sleep: async () => {} });
  const r3 = await capped.run([7, 8, 1, 2].map((a, i) => ({ messageId: `c${i}`, index: 0, url: url(a), name: 'x.png', postedAt: posted })));
  assert.deepEqual([...r3.values()].map((v) => v[0].status).sort(), ['ok', 'ok', 'skipped_budget', 'skipped_budget']);
  assert.equal(capped.progress().skippedBudget, 2);

  // Retries are bounded.
  const always = createVisionRunner({ caller: async () => { throw new VisionHttpError(529, 'overloaded'); }, cache: emptyVisionCache(), maxImages: 5, maxRetries: 2, fetchImage, sleep: async () => {} });
  const r4 = await always.run([{ messageId: 'z', index: 0, url: url(1), name: 'z.png', postedAt: posted }]);
  assert.equal(r4.get('z')![0].status, 'error');
  assert.equal(always.progress().retries, 2);

  // No provider: nothing is called, the post goes to review, import still runs.
  const none = createVisionRunner({ caller: null, cache: emptyVisionCache(), maxImages: 5, fetchImage, sleep: async () => {} });
  assert.equal((await none.run([{ messageId: 'n', index: 0, url: url(7), name: 'n.png', postedAt: posted }])).get('n')![0].status, 'error');
}

// ─── 6 · Text + screenshot merge (text wins, conflicts flagged) ──────────────
let seq = 0;
const msg = (iso: string, content: string, opts: { replyTo?: string | null; author?: string; images?: number } = {}): DiscordMsg => ({
  id: `x${String(++seq).padStart(3, '0')}`, timestamp: iso, authorId: opts.author ?? 'a1', authorName: 'fixture_trader', content,
  attachments: Array.from({ length: opts.images ?? 0 }, (_, i) => ({ url: url(1000 + seq * 10 + i, `img${i}.png`), name: `img${i}.png`, isImage: true })),
  replyTo: opts.replyTo ?? null,
});
const vr = (partial: Partial<VisionResult>): VisionResult => ({ kind: 'broker_fill', confidence: 0.9, trades: [], statedPnl: null, chart: null, notes: null, dropped: 0, ...partial });
const vt = (t: Partial<VisionResult['trades'][number]>) => ({ ticker: 'NVDA', assetType: 'option' as const, side: 'buy' as const, optionType: 'call' as const, strike: 190, expiry: '10/17', qty: 2, price: 2.15, date: null, time: null, action: null, realizedPnl: null, ...t });
{
  const m1 = msg('2026-09-22T14:05:00Z', 'in NVDA 190c 10/17 @ 2.10', { images: 1 });
  const text = textLeg(parseDiscordMessage(m1))!;
  const vis = visionLegs(vr({ trades: [vt({ price: 2.15 })] }), m1, 0);
  const { legs, conflicts } = mergeMessageLegs(text, vis);
  assert.equal(legs.length, 1);
  assert.deepEqual([legs[0].qty, legs[0].price, legs[0].source], [2, 2.1, 'text+vision'], 'size from the screenshot, price from the text');
  assert.equal(conflicts.length, 1);
  assert.match(conflicts[0], /price: text 2\.1 vs screenshot 2\.15 — text kept/);

  const m2 = msg('2026-09-22T16:00:00Z', 'all out 🔥', { images: 1 });
  const out = mergeMessageLegs(textLeg(parseDiscordMessage(m2)), visionLegs(vr({ trades: [vt({ side: 'sell', price: 3.4, action: 'close' })] }), m2, 0));
  assert.deepEqual([out.legs.length, out.legs[0].symbol, out.legs[0].price, out.legs[0].action], [1, 'NVDA', 3.4, 'close'], 'an exit with no ticker takes the screenshot\'s');

  // Side/action reading: sell without "to close" = closing a long, flagged.
  const sell = visionLegs(vr({ trades: [vt({ side: 'sell', action: null })] }), m2, 0)[0];
  assert.deepEqual([sell.action, sell.direction], ['close', 'long']);
  assert.ok(sell.flags.some((f) => /closing sell/.test(f)), 'check 4');
  const sto = visionLegs(vr({ trades: [vt({ side: 'sell', action: 'open' })] }), m2, 0)[0];
  assert.deepEqual([sto.action, sto.direction], ['open', 'short'], 'sell to open = short');
  const pos = visionLegs(vr({ kind: 'position', confidence: 0.8, trades: [vt({ side: null })] }), m2, 0)[0];
  assert.deepEqual([pos.action, pos.origin, pos.confidence], ['open', 'position', 0.72]);
}

// ─── 7 · Pairing: text-only equivalence, FIFO, stated P&L, duplicates ────────
{
  // (a) On text-only posts the forum pairer books what the channel pairer booked.
  const t0 = [
    msg('2026-09-22T14:00:00Z', 'BE 300c 10/2 @1.00 stop .5 pt 2'),
    msg('2026-09-22T14:05:00Z', 'in NVDA 190c 10/17 @ 2.15 x2'),
    msg('2026-09-22T15:00:00Z', 'trimmed 1 NVDA 190c @ 3.10'),
    msg('2026-09-22T16:00:00Z', 'out NVDA 190c @ 3.60'),
    msg('2026-09-22T14:10:00Z', 'long $AMD 145.20 stop 141 target 152'),
    msg('2026-09-23T15:00:00Z', 'sold AMD 150.80'),
    msg('2026-09-22T14:30:00Z', 'short $TSLA @ 250 sl 258'),
    msg('2026-09-24T14:30:00Z', 'stopped out TSLA'),
    msg('2026-09-22T14:40:00Z', 'grabbed some META 600c 11/21 at 5.2'),
    msg('2026-09-23T14:40:00Z', 'tp META 600c +80%'),
    msg('2026-09-22T14:50:00Z', 'adding IWM 220c 10/10 @ 1.1'),
    msg('2026-09-22T14:52:00Z', 'adding IWM 220c 10/10 @ 0.9'),
  ];
  const old = pairDiscordMessages(t0);
  const neu = pairForumLegs(t0.map((m) => textLeg(parseDiscordMessage(m))).filter((x): x is ForumLeg => !!x));
  const shape = (t: { key: string; symbol: string; status: string; quantity: number; entryPrice: number; exitPrice: number | null; stop: number | null; target: number | null; exitDerivedFromPct: number | null }) =>
    [t.key, t.symbol, t.status, t.quantity, t.entryPrice, t.exitPrice, t.stop, t.target, t.exitDerivedFromPct];
  assert.deepEqual(neu.trades.map(shape), old.trades.map(shape), 'same trades as the channel pairer on text');
  assert.deepEqual(neu.leftovers.map((l) => l.reason), ['unpriced_exit'], 'TSLA stopped with no price → review, not a trade');
  assert.equal(neu.trades.find((t) => t.symbol === 'META')!.exitPrice, 9.36, 'derived from +80% (flagged)');

  // (b) Screenshot-only thread, FIFO: 2 @ 1.00, 2 @ 1.50, sell 3 @ 2.00 (partial), later sell 1 @ 2.50.
  const s1 = msg('2026-09-22T14:00:00Z', '', { images: 1 });
  const s2 = msg('2026-09-22T14:30:00Z', '', { images: 1 });
  const s3 = msg('2026-09-22T15:30:00Z', '', { images: 1 });
  const s4 = msg('2026-09-23T15:30:00Z', '', { images: 1 });
  const L = (m: DiscordMsg, t: Partial<VisionResult['trades'][number]>) => visionLegs(vr({ trades: [vt({ ticker: 'SPY', strike: 450, optionType: 'put', expiry: '9/26', ...t })] }), m, 0);
  const legs3 = [...L(s1, { qty: 2, price: 1, action: 'open' }), ...L(s2, { qty: 2, price: 1.5, action: 'open' }), ...L(s3, { side: 'sell', qty: 3, price: 2, action: 'close' })];
  const partial = pairForumLegs(legs3);
  assert.equal(partial.trades.length, 2, 'partial close splits: closed part + open remainder');
  const [closed, rest] = partial.trades;
  assert.deepEqual([closed.status, closed.quantity, closed.entryPrice, closed.exitPrice], ['closed', 3, 1.1667, 2], 'FIFO cost (2×1.00 + 1×1.50) / 3');
  assert.deepEqual([rest.status, rest.quantity, rest.entryPrice, rest.key], ['open', 1, 1.5, `${closed.key}:open`]);
  assert.equal(closed.evidence, 'vision');
  const full = pairForumLegs([...legs3, ...L(s4, { side: 'sell', qty: 1, price: 2.5, action: 'close' })]);
  assert.equal(full.trades.length, 1, 'once flat: one round trip');
  assert.deepEqual([full.trades[0].quantity, full.trades[0].entryPrice, full.trades[0].exitPrice], [4, 1.25, 2.125], '(3×2.00 + 1×2.50) / 4');

  // (c) Stated realized P&L with no exit price → exit derived from it (flagged); no P&L → review.
  const p1 = msg('2026-09-22T14:00:00Z', '', { images: 1 });
  const p2 = msg('2026-09-23T14:00:00Z', '', { images: 1 });
  const pnl = pairForumLegs([
    ...L(p1, { qty: 2, price: 1, action: 'open' }),
    ...visionLegs(vr({ kind: 'pnl_summary', trades: [vt({ ticker: 'SPY', strike: 450, optionType: 'put', expiry: '9/26', qty: 2, price: null, side: 'sell', realizedPnl: 150 })] }), p2, 0),
  ]);
  assert.deepEqual([pnl.trades[0].status, pnl.trades[0].exitPrice, pnl.trades[0].statedPnl], ['closed', 1.75, 150], '1.00 + 150 / (2 × 100)');
  assert.ok(pnl.trades[0].flags.some((f) => /stated realized P&L/.test(f)), 'check 5');
  const noPx = pairForumLegs([...L(p1, { qty: 2, price: 1, action: 'open' }), ...L(p2, { side: 'sell', qty: 2, price: null, action: 'close', realizedPnl: null })]);
  assert.equal(noPx.trades.length, 0);
  assert.equal(noPx.leftovers[0].reason, 'unpriced_exit', 'closed with nothing to price it → review, no invented exit');
  const onlyOpen = pairForumLegs(L(p1, { qty: 2, price: 1, action: 'open' }));
  assert.deepEqual([onlyOpen.trades[0].status, onlyOpen.trades[0].exitPrice], ['open', null], 'no exit posted → open call');

  // (d) Text post then its fill screenshot a minute later = ONE lot, not two.
  const d1 = msg('2026-09-22T14:05:00Z', 'in NVDA 190c 10/17 @ 2.15');
  const d2 = msg('2026-09-22T14:06:00Z', '', { images: 1 });
  const dLegs = [textLeg(parseDiscordMessage(d1))!, ...visionLegs(vr({ trades: [vt({ price: 2.15, qty: 3, action: 'open' })] }), d2, 0)];
  const dd = dedupeLegs(dLegs);
  assert.equal(dd.legs.length, 1);
  assert.deepEqual([dd.legs[0].qty, dd.legs[0].source], [3, 'text+vision'], 'size filled in from the screenshot');
  // A holdings screenshot restating the open position is not a second buy.
  const d3 = msg('2026-09-23T14:00:00Z', '', { images: 1 });
  const withPos = pairForumLegs([...dLegs, ...visionLegs(vr({ kind: 'position', trades: [vt({ price: 2.15, qty: 3, side: null })] }), d3, 0)]);
  assert.deepEqual([withPos.trades.length, withPos.trades[0].quantity], [1, 3]);
  assert.equal(withPos.duplicates.length, 1);
}

// ─── 8 · Whole thread: image-only posts now produce trades ───────────────────
{
  // The operator's real problem: short text + a screenshot → 0 trades. FIXTURE thread.
  const a = msg('2026-09-22T14:00:00Z', 'we in 🙏', { images: 1 });
  const b = msg('2026-09-22T19:00:00Z', 'paid', { images: 1 });
  const c = msg('2026-09-23T13:00:00Z', 'SPY plan for tomorrow', { images: 1 });
  const d = msg('2026-09-23T14:00:00Z', '', { images: 1 });
  const e = msg('2026-09-23T15:00:00Z', 'nice', { author: 'b2', images: 1 }); // a commenter's screenshot: never read
  const rec = (m: DiscordMsg, status: VisionImageRecord['status'], result: VisionResult | null): VisionImageRecord => ({
    attachmentId: attachmentIdOf(m.attachments[0].url), sha256: 'f'.repeat(64), name: m.attachments[0].name, status,
    provider: 'anthropic', model: VISION_MODEL, v: 1, at: '2026-09-29T00:00:00.000Z', result, error: null, usage: { input: 2000, output: 300 },
  });
  const vision = new Map<string, VisionImageRecord[]>([
    [a.id, [rec(a, 'ok', vr({ trades: [vt({ ticker: 'TSLA', strike: 260, expiry: '10/3', qty: 4, price: 3.4, action: 'open' })] }))]],
    [b.id, [rec(b, 'ok', vr({ trades: [vt({ ticker: 'TSLA', strike: 260, expiry: '10/3', qty: 4, price: 5.1, side: 'sell', action: 'close' })] }))]],
    [c.id, [rec(c, 'ok', vr({ kind: 'chart', chart: { ticker: 'SPY', timeframe: '1h', levels: [575, 580.5], bias: 'long', thesis: 'Higher low on the 1h; 580.5 is the break level.' } }))]],
    [d.id, [rec(d, 'low_confidence', vr({ confidence: 0.4, trades: [vt({ ticker: 'BLUR', qty: 1, price: 1 })] }))]],
  ]);
  const thread = { id: '777000000000000001', name: 'Leeks $300 to 5 figgy challenge', guildId: '500000000000000001', ownerId: 'a1' };
  const textOnly = buildThreadImport(thread, [a, b, c, d, e]);
  assert.equal(textOnly.trades.length, 0, 'text alone: nothing to book (the bug the operator saw)');
  assert.equal(textOnly.stats.images, 4, 'the preview counts the main author\'s images (the commenter\'s is not billed)');
  const imp = buildThreadImport(thread, [a, b, c, d, e], { vision });
  assert.equal(imp.trades.length, 1);
  const t = imp.trades[0];
  assert.deepEqual([t.symbol, t.status, t.quantity, t.entryPrice, t.exitPrice, t.evidence, t.authorId], ['TSLA', 'closed', 4, 3.4, 5.1, 'vision', 'a1']);
  assert.equal(imp.stats.fromScreenshots, 1);
  const cPost = imp.posts.find((p) => p.messageId === c.id)!;
  assert.equal(cPost.meta.visionSummary?.charts[0].thesis, 'Higher low on the 1h; 580.5 is the break level.', 'chart analysis stored on the post');
  assert.ok(cPost.symbols.includes('SPY'), 'check 6');
  assert.equal(imp.posts.find((p) => p.messageId === d.id)!.meta.review, 'vision_low_confidence', 'low-confidence screenshot → review, not booked');
  assert.equal(imp.posts.find((p) => p.messageId === a.id)!.meta.tradeKey, t.key);
  assert.equal(imp.posts.find((p) => p.messageId === a.id)!.meta.vision?.[0].result?.trades[0].ticker, 'TSLA', 'the reading (cache) rides on the post meta');
  assert.equal(imp.posts.find((p) => p.messageId === e.id)!.meta.vision, undefined, 'commenters\' images are not read');
  assert.equal(summarizeVision(undefined), null);
}

// ─── 9 · Mine: broker-row dedupe ─────────────────────────────────────────────
{
  // FIXTURE broker rows (Webull-CSV shaped) in the operator's own book.
  const rows: BrokerRowLike[] = [
    { id: 'b1', symbol: 'NVDA', assetType: 'option', direction: 'long', optionType: 'call', strikePrice: 190, expiryDate: '2026-10-17', quantity: 3, entryTime: '2026-09-22T14:04:10Z', broker: 'webull' },
    { id: 'b2', symbol: 'SPY', assetType: 'option', direction: 'long', optionType: 'put', strikePrice: 450, expiryDate: '2026-09-26', quantity: 2, entryTime: '2026-09-25T19:30:00Z', broker: 'webull' },
    { id: 'b3', symbol: 'AMD', assetType: 'stock', direction: 'long', optionType: null, strikePrice: null, expiryDate: null, quantity: 100, entryTime: '2026-09-28T14:00:00Z', broker: 'webull' },
    { id: 'b4', symbol: 'NVDA', assetType: 'option', direction: 'long', optionType: 'call', strikePrice: 190, expiryDate: '2026-10-17', quantity: 1, entryTime: '2026-09-22T14:30:00Z', broker: 'webull' },
    { id: 'd1', symbol: 'AMD', assetType: 'stock', direction: 'long', optionType: null, strikePrice: null, expiryDate: null, quantity: 1, entryTime: '2026-09-26T14:00:00Z', broker: 'discord' },
  ];
  const T = (key: string, p: Partial<Parameters<typeof matchBrokerRows>[0][number]>) => ({
    key, symbol: 'NVDA', assetType: 'option' as const, direction: 'long' as const, optionType: 'call' as const, strikePrice: 190, expiryDate: '2026-10-17',
    quantity: 1, qtyStated: false, entryTime: '2026-09-22T14:05:00Z', ...p,
  });
  const got = matchBrokerRows([
    T('n1', {}),                                                           // → b1 (closest in time)
    T('n2', { entryTime: '2026-09-22T14:31:00Z' }),                        // → b4 (b1 taken)
    T('s1', { symbol: 'SPY', optionType: 'put', strikePrice: 450, expiryDate: '2026-09-26', entryTime: '2026-09-26T13:40:00Z', quantity: 2, qtyStated: true }), // next day → b2
    T('s2', { symbol: 'SPY', optionType: 'put', strikePrice: 450, expiryDate: '2026-09-26', entryTime: '2026-09-25T15:00:00Z', quantity: 5, qtyStated: true }), // 5 > 2 → no
    T('a1', { symbol: 'AMD', assetType: 'stock', optionType: null, strikePrice: null, expiryDate: null, entryTime: '2026-09-25T14:00:00Z' }),  // Fri → Mon = 1 trading day → b3
    T('a2', { symbol: 'AMD', assetType: 'stock', optionType: null, strikePrice: null, expiryDate: null, entryTime: '2026-09-23T14:00:00Z', direction: 'short' }), // side differs → no
    T('p1', { strikePrice: 195 }),                                         // other strike → no
    T('x1', { entryTime: '2026-09-18T14:00:00Z' }),                        // 2+ trading days away → no
  ], rows);
  const by = new Map(got.map((g) => [g.tradeKey, g.brokerRowId]));
  assert.equal(by.get('n1'), 'b1');
  assert.equal(by.get('n2'), 'b4', 'each broker row matches at most one Discord trade');
  assert.equal(by.get('s1'), 'b2', 'next session is within ±1 day');
  assert.equal(by.get('s2'), undefined, 'a stated size larger than the fill is not the same trade');
  assert.equal(by.get('a1'), 'b3', 'Friday → Monday is one trading day');
  assert.equal(by.get('a2'), undefined);
  assert.equal(by.get('p1'), undefined);
  assert.equal(by.get('x1'), undefined);
  assert.ok(!got.some((g) => g.brokerRowId === 'd1'), 'Discord rows are never "broker" matches');
}

// ─── 10 · Text parser: the operator's known misses + a fresh held-out set ────
{
  const P = (content: string) => parseDiscordMessage({ id: 'p', timestamp: '2026-09-22T14:00:00Z', authorId: 'a', authorName: 'a', content, attachments: [], replyTo: null });
  // The five named misses.
  assert.equal(P('Entry: TSLA 260C 10/03 @ 3.40 | SL 2.00 | TP 5.00').target, 5, 'mid-sentence TP');
  assert.equal(P('Entry: TSLA 260C 10/03 @ 3.40 | SL 2.00 | TP 5.00').price, 3.4, 'TP is not the entry price');
  assert.equal(P('tp META 600c @ 9.4').kind, 'exit', 'a message that STARTS with tp is still an exit');
  assert.equal(P('tp META 600c @ 9.4').target, null);
  const f = P('bought 100 shares of F at 11.20');
  assert.deepEqual([f.kind, f.symbol, f.price, f.qty], ['entry', 'F', 11.2, 100], 'single-letter ticker from "shares of F"');
  assert.equal(P('grabbed 5 T calls 10/17 at .45').symbol, 'T', '"T calls"');
  assert.equal(P('I think calls are cheap here').symbol, null, '"I" is never a ticker');
  const rivn = P('Stop hit on RIVN');
  assert.deepEqual([rivn.kind, rivn.symbol], ['exit', 'RIVN']);
  const es = P('long ES 5850, stop 5830, target 5890');
  assert.deepEqual([es.kind, es.symbol, es.assetType, es.price, es.stop, es.target], ['entry', 'ES', 'future', 5850, 5830, 5890], 'futures price without decimals');
  const g = P('sold half my GOOGL 180c for 2.5');
  assert.deepEqual([g.kind, g.symbol, g.price], ['trim', 'GOOGL', 2.5], '"for 2.5"');
  assert.equal(P('held AAPL for 2 weeks, sold @ 231.5').price, 231.5, '"for 2 weeks" is not a price');
  assert.equal(P('Closed my HOOD calls for +120%').price, null, '"for +120%" is a result, not a price');

  // Fresh held-out messages (written after the fixes, not used to tune them) — the honest number.
  type E = Partial<Record<'kind' | 'symbol' | 'assetType' | 'price' | 'qty' | 'stop' | 'target' | 'pct', unknown>>;
  const heldOut: [string, E][] = [
    ['bought 50 shares of T @ 22.10', { kind: 'entry', symbol: 'T', price: 22.1, qty: 50 }],
    ['long NQ 20150 stop 20100', { kind: 'entry', symbol: 'NQ', assetType: 'future', price: 20150, stop: 20100 }],
    ['Stopped out of SOFI for -20%', { kind: 'exit', symbol: 'SOFI', price: null, pct: -20 }],
    ['trimmed 2 AMD 160c for 3.40', { kind: 'trim', symbol: 'AMD', price: 3.4 }],
    ['Entry TSLA 250c @ 2.00, TP 3.50, SL 1.20', { kind: 'entry', symbol: 'TSLA', price: 2, target: 3.5, stop: 1.2 }],
    ['out of /ES 5872', { kind: 'exit', symbol: 'ES' }],
    ['cut PLTR, loss', { kind: 'exit', symbol: 'PLTR' }],
    ['added 3 more X calls at 0.80', { kind: 'entry', symbol: 'X', price: 0.8 }],
  ];
  let fields = 0, right = 0, exact = 0;
  const misses: string[] = [];
  for (const [text, want] of heldOut) {
    const p = P(text) as any;
    let ok = true;
    for (const [k, v] of Object.entries(want)) {
      fields++;
      if (p[k] === v) right++; else { ok = false; misses.push(`"${text}" ${k}: got ${JSON.stringify(p[k])}, want ${JSON.stringify(v)}`); }
    }
    if (ok) exact++;
  }
  console.log(`parse accuracy on ${heldOut.length} fresh held-out fixture messages: ${exact}/${heldOut.length} exact, ${right}/${fields} fields (${((right / fields) * 100).toFixed(1)}%)`);
  if (misses.length) console.log(`  misses:\n  ${misses.join('\n  ')}`);
  (globalThis as any).__forumParseAccuracyFresh = { exact, n: heldOut.length, fields: right, of: fields };
  assert.ok(right / fields >= 0.8, 'fresh held-out accuracy');
}

console.log('forum vision checks passed');
