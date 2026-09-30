/**
 * Discord FORUM → every trader's book: read, preview, then commit.
 *
 * One forum channel holds one thread per trader. Two ways in:
 *   bot    DISCORD_BOT_TOKEN reads the forum: its threads (active + archived,
 *          paginated) and each thread's messages (server/discord-reader.ts)
 *   files  DiscordChatExporter JSON exports of the threads — several files, or
 *          the files inside a .zip (unzipped in the browser) — no token needed
 *
 * Preview (no writes): per thread — its trader mapping (an existing trader
 * matched by name/slug/handle, or a NEW slug to confirm), message count,
 * parsed trades with confidence, the review list. Held server-side 30 min,
 * bound to the admin who made it.
 *
 * Commit (admin only; the client sends only the mapping, never rows) runs as a
 * BACKGROUND JOB (startForumImport → poll forumImportJob): screenshots are read
 * by a vision model first (server/forum-vision.ts — cached per attachment,
 * budget-capped, never stored), then per thread:
 *   · each thread's messages → journal_notes in that trader's book
 *     (source 'discord', reason 'discord_post', meta = author/link/thread/parse),
 *     keyed by message id → re-imports update edits, never duplicate
 *   · the main author's parsed trades → journal_trades (broker 'discord',
 *     broker_order_id 'discord:<entry message id>'); P&L only when entry AND
 *     exit are stated; open calls stay open (no exit is invented). Admin tags /
 *     emotion / rating on an existing row are kept.
 *   · the trader's watchlist gets the same one-row-per-ticker fold as the
 *     channel importer (server/discord-journal-import.ts)
 *   · new traders are created only for threads the operator confirmed
 *   · the operator's own thread (malik = leek) goes to the importing admin's
 *     own "Mine" book: its trades are matched against the broker-CSV rows
 *     already there (annotated, not inserted again); unmatched ones go in
 *     flagged as source=discord
 *
 * READ-ONLY toward Discord. Evidence only: nothing here feeds the bot
 * (shared/loss-rules.ts) — trader calls reach NEXUS as labelled evidence
 * (server/trader-analysis.ts).
 */
import { randomBytes } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from './db';
import { logger } from './logger';
import { journalNotes, journalTrades, traders, type Trader } from '@shared/schema';
import { normalizeDiscordExport, type DiscordMsg } from '@shared/discord-journal-parser';
import {
  KNOWN_TRADERS, MINE_SLUG, REVIEW_LABEL, buildThreadImport, imageAttachments, isMineSlug, mapThreadToBook, readExportMeta,
  type BookMatch, type ForumThreadInfo, type ThreadImport,
} from '@shared/discord-forum';
import { TRADER_SLUG_RE, traderOwnerId } from '@shared/journal-sources';
import { attachmentIdOf, estimateVisionCost, visionMaxImages, type VisionImageRecord } from '@shared/forum-vision';
import { matchBrokerRows, type ForumTrade } from '@shared/forum-pairing';
import { deriveJournalTradeFields } from './journal-trade-input';
import { discordReader, DiscordReadError } from './discord-reader';
import { createVisionRunner, visionCacheFrom, visionCallerFromEnv, type VisionItem, type VisionProgress } from './forum-vision';

const TTL_MS = 30 * 60_000;
/** Total messages one preview may hold (all threads). */
const MAX_TOTAL_MESSAGES = 20_000;

interface HeldThread { info: ForumThreadInfo; msgs: DiscordMsg[]; imp: ThreadImport; match: BookMatch | null; source: 'bot' | 'file' }
interface HeldPreview { token: string; actorId: string; expires: number; threads: HeldThread[] }

const previews = new Map<string, HeldPreview>();
const sweep = () => { const now = Date.now(); for (const [k, v] of previews) if (v.expires < now) previews.delete(k); };

const unprocessable = (msg: string) => Object.assign(new Error(msg), { status: 422 });

export type ForumSource =
  | { kind: 'bot'; forumId: string }
  | { kind: 'files'; files: { name: string; content: string }[] };

/** Threads + their messages from either source. */
async function readSource(src: ForumSource): Promise<{ forum: { id: string | null; name: string | null }; threads: { info: ForumThreadInfo; msgs: DiscordMsg[]; source: 'bot' | 'file' }[]; skipped: { reason: string; count: number }[] }> {
  const skipped = new Map<string, number>();
  const skip = (r: string, n = 1) => skipped.set(r, (skipped.get(r) ?? 0) + n);
  const done = (forum: { id: string | null; name: string | null }, threads: { info: ForumThreadInfo; msgs: DiscordMsg[]; source: 'bot' | 'file' }[]) =>
    ({ forum, threads, skipped: [...skipped.entries()].map(([reason, count]) => ({ reason, count })) });

  if (src.kind === 'bot') {
    const token = process.env.DISCORD_BOT_TOKEN?.trim();
    if (!token) throw unprocessable('DISCORD_BOT_TOKEN is not configured — upload DiscordChatExporter exports instead (docs/DISCORD_IMPORT.md)');
    const reader = discordReader({ token });
    try {
      const listing = await reader.listForumThreads(src.forumId);
      const out: { info: ForumThreadInfo; msgs: DiscordMsg[]; source: 'bot' }[] = [];
      let total = 0;
      for (const info of listing.threads) {
        const raw = await reader.threadMessages(info.id);
        const norm = normalizeDiscordExport(JSON.stringify(raw));
        for (const s of norm.skipped) skip(s.reason, s.count);
        const empty = norm.messages.filter((m) => !m.content.trim() && !m.attachments.length).length;
        if (norm.messages.length >= 5 && empty / norm.messages.length > 0.9) skip('empty content — enable the Message Content intent for the bot', empty);
        total += norm.messages.length;
        if (total > MAX_TOTAL_MESSAGES) throw unprocessable(`Over ${MAX_TOTAL_MESSAGES.toLocaleString()} messages across threads — import in parts (exports by date range)`);
        out.push({ info: { ...info, guildId: info.guildId ?? listing.forum.guildId }, msgs: norm.messages, source: 'bot' });
      }
      const st = reader.stats();
      logger.info(`[DISCORD-FORUM] read ${listing.threads.length} threads / ${total} messages in ${st.requests} requests (waited ${st.waitedMs}ms on rate limits)`);
      return done({ id: listing.forum.id, name: listing.forum.name }, out);
    } catch (err) {
      if (err instanceof DiscordReadError) throw Object.assign(err, { status: err.status >= 500 ? 502 : 422 });
      throw err;
    }
  }

  // Files: one DiscordChatExporter JSON per thread (several parts of one thread merge).
  const byThread = new Map<string, { info: ForumThreadInfo; msgs: Map<string, DiscordMsg> }>();
  let forum: { id: string | null; name: string | null } = { id: null, name: null };
  let total = 0;
  for (const f of src.files) {
    let data: unknown;
    try { data = JSON.parse(f.content.replace(/^﻿/, '')); } catch { skip(`not JSON (${f.name})`); continue; }
    const meta = readExportMeta(data);
    let norm;
    try { norm = normalizeDiscordExport(f.content); } catch (e) { skip(`${(e as Error).message} (${f.name})`); continue; }
    for (const s of norm.skipped) skip(s.reason, s.count);
    const id = meta.threadId ?? `file:${f.name}`;
    if (meta.parentId && !forum.id) forum = { id: meta.parentId, name: meta.parentName };
    const name = meta.threadName ?? f.name.replace(/\.json$/i, '');
    const cur = byThread.get(id) ?? {
      info: { id, name, parentId: meta.parentId, guildId: meta.guildId, ownerId: null, archived: false, messageCount: null },
      msgs: new Map<string, DiscordMsg>(),
    };
    for (const m of norm.messages) {
      if (cur.msgs.has(m.id)) { skip('duplicate message id (overlapping exports)'); continue; }
      cur.msgs.set(m.id, m);
      total++;
    }
    if (total > MAX_TOTAL_MESSAGES) throw unprocessable(`Over ${MAX_TOTAL_MESSAGES.toLocaleString()} messages — import the threads in parts`);
    byThread.set(id, cur);
  }
  if (!byThread.size) throw unprocessable('No DiscordChatExporter JSON thread exports found in the upload');
  const parents = new Set([...byThread.values()].map((t) => t.info.parentId).filter(Boolean));
  if (parents.size > 1) skip(`threads from ${parents.size} different parent channels`);
  return done(forum, [...byThread.values()].map((t) => ({ info: t.info, msgs: [...t.msgs.values()], source: 'file' as const })));
}

/** Attachment ids already read (any book) — the preview's "cached" count, so the cost line is honest. */
async function cachedAttachmentIds(): Promise<Set<string>> {
  const rows = await db.select({ meta: journalNotes.meta }).from(journalNotes)
    .where(and(eq(journalNotes.source, 'discord'), eq(journalNotes.reason, 'discord_post'), sql`${journalNotes.meta} ? 'vision'`));
  const ids = new Set<string>();
  for (const r of rows) for (const v of ((r.meta as any)?.vision ?? []) as VisionImageRecord[]) if (v?.attachmentId && v.result) ids.add(v.attachmentId);
  return ids;
}

export async function buildForumPreview(input: { actorId: string; source: ForumSource }) {
  sweep();
  const { forum, threads, skipped } = await readSource(input.source);
  const traderRows = await db.select().from(traders);
  const held: HeldThread[] = threads.map(({ info, msgs, source }) => {
    const imp = buildThreadImport(info, msgs);
    const match = mapThreadToBook({ name: info.name, authorNames: imp.primary ? [imp.primary.authorName] : [] }, traderRows);
    return { info, msgs, imp, match, source };
  }).sort((a, b) => b.imp.stats.posts - a.imp.stats.posts);

  // What already exists in each matched book (to label new / already imported).
  const ownerOf = new Map(traderRows.map((t) => [t.slug, traderOwnerId(t.id)]));
  const existingIds = new Map<string, Set<string>>();
  for (const h of held) {
    const owner = h.match?.book === 'mine' ? input.actorId : h.match?.existing ? ownerOf.get(h.match.slug) : null;
    if (!owner || !h.imp.posts.length) continue;
    const ids = h.imp.posts.map((p) => p.messageId);
    const have = new Set<string>();
    for (let i = 0; i < ids.length; i += 1000) {
      const rows = await db.select({ id: journalNotes.sourceMessageId }).from(journalNotes)
        .where(and(eq(journalNotes.ownerId, owner), eq(journalNotes.source, 'discord'), inArray(journalNotes.sourceMessageId, ids.slice(i, i + 1000))));
      for (const r of rows) if (r.id) have.add(r.id);
    }
    existingIds.set(h.info.id, have);
  }

  // Screenshots: counted here, read only on Import (the preview never calls a model).
  const cached = await cachedAttachmentIds();
  const provider = visionCallerFromEnv();
  const cap = visionMaxImages(process.env);
  const imagesOf = (h: HeldThread) => {
    const own = h.imp.primary ? h.msgs.filter((m) => m.authorId === h.imp.primary!.authorId) : [];
    const all = own.flatMap((m) => imageAttachments(m));
    return { images: all.length, cached: all.filter((a) => { const id = attachmentIdOf(a.url); return !!id && cached.has(id); }).length };
  };

  const token = randomBytes(18).toString('base64url');
  previews.set(token, { token, actorId: input.actorId, expires: Date.now() + TTL_MS, threads: held });

  // Known traders not created yet are offered in the dropdown (created on import when confirmed).
  const known = KNOWN_TRADERS.filter((k) => !traderRows.some((t) => t.slug === k.slug)).map((k) => ({ slug: k.slug, name: k.name, pending: true }));
  const threadRows = held.map((h) => {
    const { info, imp, match, source } = h;
    const already = existingIds.get(info.id)?.size ?? 0;
    const img = imagesOf(h);
    return {
      threadId: info.id,
      name: info.name,
      archived: info.archived,
      source,
      messages: imp.stats.messages,
      posts: imp.stats.posts,
      alreadyImported: already,
      newPosts: imp.stats.posts - already,
      firstAt: imp.stats.firstAt,
      lastAt: imp.stats.lastAt,
      primary: imp.primary,
      authors: imp.authors.slice(0, 6),
      match,
      images: img.images,
      imagesCached: img.cached,
      parse: {
        entries: imp.stats.entries, exits: imp.stats.exits, trims: imp.stats.trims,
        closed: imp.stats.closedTrades, open: imp.stats.openTrades,
        review: imp.stats.review, avgConfidence: imp.stats.avgConfidence,
      },
      trades: imp.trades.slice(-12).reverse().map((t) => ({
        key: t.key, symbol: t.symbol, assetType: t.assetType, direction: t.direction, optionType: t.optionType,
        strike: t.strikePrice, expiry: t.expiryDate, entryPrice: t.entryPrice, exitPrice: t.exitPrice,
        stop: t.stop, target: t.target, status: t.status, entryTime: t.entryTime, exitTime: t.exitTime,
        confidence: t.confidence, qtyStated: t.qtyStated, exitDerivedFromPct: t.exitDerivedFromPct,
      })),
      review: imp.review.slice(0, 15).map((r) => ({ ...r, label: REVIEW_LABEL[r.reason] })),
    };
  });
  const totalImages = threadRows.reduce((s, t) => s + t.images, 0);
  const totalCached = threadRows.reduce((s, t) => s + t.imagesCached, 0);
  return {
    token,
    expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
    forum,
    skipped,
    traders: [...traderRows.filter((t) => !isMineSlug(t.slug)).map((t) => ({ slug: t.slug, name: t.name, pending: false })), ...known],
    mine: { slug: MINE_SLUG, label: 'Mine — your own journal', aliases: ['malik', 'leek'] },
    vision: {
      provider: provider.provider,
      model: provider.model,
      cap,
      /** Estimated for every image on the main authors' posts; per thread in threads[].images. */
      estimate: estimateVisionCost(totalImages, { cached: totalCached, cap }),
      note: provider.provider
        ? 'Screenshots are read on Import (not now): broker fills, positions, P&L and charts → trades and chart notes. Already-read images are reused, never billed twice.'
        : 'No vision provider configured (ANTHROPIC_API_KEY or GEMINI_API_KEY) — Import will bring text only; screenshots go to the review list.',
    },
    threads: threadRows,
  };
}

export interface ForumMapping { threadId: string; slug: string | null; createName?: string | null }

async function ensureTrader(m: ForumMapping, h: HeldThread, actorId: string, existing: Map<string, Trader>): Promise<Trader> {
  const slug = m.slug!;
  if (isMineSlug(slug)) throw Object.assign(new Error(`"${slug}" is your own journal (Mine) — it is never created as a trader`), { status: 400 });
  const have = existing.get(slug);
  const handle = h.imp.primary?.authorName ?? null;
  if (have) {
    // Fill in what is unknown; never overwrite what an admin set.
    const patch: Partial<Trader> = {};
    if (!have.source) patch.source = 'discord';
    if (!have.handle && handle) patch.handle = handle;
    if (!have.discordChannelId && /^\d{15,22}$/.test(h.info.id)) patch.discordChannelId = h.info.id;
    if (Object.keys(patch).length) {
      const [u] = await db.update(traders).set(patch).where(eq(traders.id, have.id)).returning();
      existing.set(slug, u);
      return u;
    }
    return have;
  }
  const name = (m.createName ?? '').trim() || KNOWN_TRADERS.find((k) => k.slug === slug)?.name || '';
  if (!name) throw Object.assign(new Error(`"${slug}" is a new trader — confirm it (give it a name) in the preview`), { status: 400 });
  const [t] = await db.insert(traders).values({
    slug, name: name.slice(0, 60), handle, source: 'discord',
    discordChannelId: /^\d{15,22}$/.test(h.info.id) ? h.info.id : null, createdBy: actorId,
  }).onConflictDoNothing().returning();
  const row = t ?? (await db.select().from(traders).where(eq(traders.slug, slug)).limit(1))[0];
  existing.set(slug, row);
  return row;
}

// ─── Import job (background; the HTTP request returns a job id at once) ─────

export interface ThreadResult {
  threadId: string; name: string; book: 'mine' | 'trader'; trader: string; created: boolean;
  posts: number; tradesNew: number; tradesUpdated: number; tradesUnchanged: number; tradesRemoved: number;
  /** Mine only: Discord trades matched to an existing broker row (annotated, not inserted). */
  tradesLinked: number;
  /** Mine only: Discord trades with no broker row — inserted, flagged source=discord. */
  tradesFlagged: number;
  fromScreenshots: number; review: number;
  watchlist: { added: number; updated: number } | null;
}

export interface ForumImportJob {
  id: string;
  actorId: string;
  status: 'running' | 'done' | 'failed';
  phase: string;
  startedAt: string;
  finishedAt: string | null;
  threads: { done: number; total: number };
  vision: VisionProgress & { provider: string | null; model: string | null; cap: number };
  results: ThreadResult[];
  error: string | null;
}

const JOB_TTL_MS = 3 * 60 * 60_000;
const jobs = new Map<string, ForumImportJob>();
const sweepJobs = () => { const now = Date.now(); for (const [k, j] of jobs) if (j.finishedAt && now - Date.parse(j.finishedAt) > JOB_TTL_MS) jobs.delete(k); };

export function forumImportJob(id: string, actorId: string): ForumImportJob {
  sweepJobs();
  const j = jobs.get(id);
  if (!j || j.actorId !== actorId) throw Object.assign(new Error('No such import job (finished jobs are kept 3 hours)'), { status: 404 });
  return j;
}

/**
 * Validate the mapping against the held preview (synchronously, so a bad
 * request fails the HTTP call), then run the import in the background.
 */
export function startForumImport(token: string, actorId: string, mapping: ForumMapping[]): { jobId: string; job: ForumImportJob } {
  sweep();
  sweepJobs();
  if ([...jobs.values()].some((j) => j.status === 'running')) {
    throw Object.assign(new Error('A forum import is already running — wait for it to finish (its progress is on the Import page)'), { status: 409 });
  }
  const p = previews.get(token);
  if (!p || p.actorId !== actorId) throw Object.assign(new Error('Preview expired or not yours — run the preview again'), { status: 410 });
  const byId = new Map(p.threads.map((t) => [t.info.id, t]));
  for (const m of mapping) {
    if (!byId.has(m.threadId)) throw Object.assign(new Error(`Thread ${m.threadId} is not in this preview`), { status: 400 });
    if (m.slug != null && !TRADER_SLUG_RE.test(m.slug)) throw Object.assign(new Error(`"${m.slug}" is not a valid trader slug`), { status: 400 });
  }
  if (mapping.filter((m) => m.slug && isMineSlug(m.slug)).length > 3) throw Object.assign(new Error('More than 3 threads mapped to Mine — check the mapping'), { status: 400 });
  previews.delete(token);

  const provider = visionCallerFromEnv();
  const job: ForumImportJob = {
    id: randomBytes(12).toString('base64url'), actorId, status: 'running', phase: 'starting',
    startedAt: new Date().toISOString(), finishedAt: null,
    threads: { done: 0, total: mapping.filter((m) => m.slug).length },
    vision: {
      total: 0, done: 0, cached: 0, called: 0, failed: 0, skippedBudget: 0, lowConfidence: 0, tradesFound: 0, retries: 0, usage: { input: 0, output: 0 }, usd: 0,
      provider: provider.provider, model: provider.model, cap: visionMaxImages(process.env),
    },
    results: [], error: null,
  };
  jobs.set(job.id, job);
  runForumImport(job, p.threads, byId, mapping, provider.caller).catch((err) => {
    job.status = 'failed';
    job.error = (err as Error)?.message ?? String(err);
    job.finishedAt = new Date().toISOString();
    logger.error('[DISCORD-FORUM] import job failed', { job: job.id, error: job.error });
  });
  return { jobId: job.id, job };
}

/** Fresh attachment urls for bot-read threads (Discord CDN links are signed and expire ~24h). */
async function freshAttachments(h: HeldThread): Promise<Map<string, DiscordMsg['attachments']> | null> {
  if (h.source !== 'bot') return null;
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!token) return null;
  const raw = await discordReader({ token }).threadMessages(h.info.id);
  const norm = normalizeDiscordExport(JSON.stringify(raw));
  return new Map(norm.messages.map((m) => [m.id, m.attachments]));
}

async function runForumImport(
  job: ForumImportJob,
  _all: HeldThread[],
  byId: Map<string, HeldThread>,
  mapping: ForumMapping[],
  caller: ReturnType<typeof visionCallerFromEnv>['caller'],
) {
  const { upsertTraderWatchlist } = await import('./discord-journal-import');
  const existing = new Map((await db.select().from(traders)).map((t) => [t.slug, t]));
  const batchId = `discord_forum_${Date.now()}`;
  const chosen = mapping.filter((m) => m.slug).map((m) => ({ m, h: byId.get(m.threadId)! }));

  // 1 · Screenshots (all threads, one budget). Cache = every stored reading.
  job.phase = 'reading screenshots';
  const metas = await db.select({ meta: journalNotes.meta }).from(journalNotes)
    .where(and(eq(journalNotes.source, 'discord'), eq(journalNotes.reason, 'discord_post'), sql`${journalNotes.meta} ? 'vision'`));
  const runner = createVisionRunner({
    caller,
    cache: visionCacheFrom(metas.map((r) => r.meta)),
    maxImages: job.vision.cap,
    onProgress: (p) => { Object.assign(job.vision, p); },
  });
  const items: VisionItem[] = [];
  const fresh = new Map<string, Map<string, DiscordMsg['attachments']> | null>();
  for (const { h } of chosen) {
    let f: Map<string, DiscordMsg['attachments']> | null = null;
    try { f = await freshAttachments(h); } catch (e) {
      logger.warn('[DISCORD-FORUM] fresh attachment read failed — using the preview links', { thread: h.info.id, error: (e as Error).message });
    }
    fresh.set(h.info.id, f);
    const primary = h.imp.primary;
    if (!primary) continue;
    for (const msg of h.msgs) {
      if (msg.authorId !== primary.authorId) continue;
      const atts = (f?.get(msg.id) ?? msg.attachments).filter((a) => a.isImage);
      atts.forEach((a, index) => items.push({ messageId: msg.id, index, url: a.url, name: a.name, postedAt: msg.timestamp }));
    }
  }
  runner.setTotal(items.length);
  const vision = await runner.run(items);
  logger.info(`[DISCORD-FORUM] vision: ${items.length} images · ${job.vision.cached} cached · ${job.vision.called} read · ${job.vision.failed} failed · ${job.vision.skippedBudget} over cap · ${job.vision.tradesFound} trades · ~$${job.vision.usd}`);

  // 2 · Per thread: posts, trades, watchlist.
  for (const { m, h } of chosen) {
    job.phase = `writing ${h.info.name}`;
    const mine = isMineSlug(m.slug);
    const wasNew = !mine && !existing.has(m.slug!);
    const trader = mine ? null : await ensureTrader(m, h, job.actorId, existing);
    const owner = mine ? job.actorId : traderOwnerId(trader!.id);
    const f = fresh.get(h.info.id);
    const msgs = f ? h.msgs.map((x) => ({ ...x, attachments: f.get(x.id) ?? x.attachments })) : h.msgs;
    const imp = buildThreadImport(h.info, msgs, { vision });

    // Mine: match against the operator's broker rows BEFORE writing (matched trades are not inserted).
    let linked = new Map<string, string>();
    if (mine && imp.trades.length) {
      const brokerRows = await db.select().from(journalTrades).where(and(eq(journalTrades.userId, owner), sql`${journalTrades.broker} <> 'discord'`));
      const matches = matchBrokerRows(imp.trades, brokerRows.map((r) => ({
        id: r.id, symbol: r.symbol, assetType: r.assetType, direction: r.direction, optionType: r.optionType ?? null,
        strikePrice: r.strikePrice ?? null, expiryDate: r.expiryDate ?? null, quantity: r.quantity, entryTime: r.entryTime, broker: r.broker,
      })));
      linked = new Map(matches.map((x) => [x.tradeKey, x.brokerRowId]));
      for (const post of imp.posts) if (post.meta.tradeKey && linked.has(post.meta.tradeKey)) post.meta.linkedTradeId = linked.get(post.meta.tradeKey)!;
      // Annotate each matched broker row once with the post link (idempotent).
      const rowsById = new Map(brokerRows.map((r) => [r.id, r]));
      for (const t of imp.trades) {
        const rid = linked.get(t.key);
        if (!rid) continue;
        const row = rowsById.get(rid)!;
        const link = imp.posts.find((x) => x.messageId === t.messageIds[0])?.meta.link ?? null;
        const tag = link ?? `Discord message ${t.key}`;
        if ((row.notes ?? '').includes(tag)) continue;
        const add = `Discord post: ${tag} (${h.info.name}) — matched to this broker trade, not imported again.`;
        await db.update(journalTrades).set({ notes: row.notes?.trim() ? `${row.notes.trim()}\n\n${add}` : add, updatedAt: new Date() }).where(eq(journalTrades.id, rid));
      }
    }

    // 2a · Posts → notebook (upsert by message id). meta carries the screenshot readings (the cache).
    const rows = imp.posts.map((post) => ({
      ownerId: owner, day: post.day, postedAt: post.postedAt, body: post.body,
      symbols: post.symbols.length ? post.symbols : null,
      attachments: post.attachments.length ? post.attachments : null,
      source: 'discord', sourceMessageId: post.messageId, reason: 'discord_post',
      meta: post.meta as unknown as Record<string, unknown>,
    }));
    for (let i = 0; i < rows.length; i += 200) {
      await db.insert(journalNotes).values(rows.slice(i, i + 200))
        .onConflictDoUpdate({
          target: [journalNotes.ownerId, journalNotes.source, journalNotes.sourceMessageId],
          set: {
            body: sql`excluded.body`, symbols: sql`excluded.symbols`, attachments: sql`excluded.attachments`,
            meta: sql`excluded.meta`, reason: sql`excluded.reason`, day: sql`excluded.day`, postedAt: sql`excluded.posted_at`,
          },
        });
    }

    // 2b · Trades → the book (economics only on re-import). Mine: matched trades are skipped.
    const w = await writeTrades(owner, h, imp, batchId, mine ? linked : null);

    // 2c · Watchlist fold (trader books only — Mine has no trader watchlist).
    const wl = trader ? await upsertTraderWatchlist(trader.id, imp.trades as any, imp.notes, job.actorId) : null;
    job.results.push({
      threadId: h.info.id, name: h.info.name, book: mine ? 'mine' : 'trader', trader: mine ? MINE_SLUG : trader!.slug, created: wasNew,
      posts: rows.length, ...w, fromScreenshots: imp.stats.fromScreenshots, review: imp.stats.review,
      watchlist: wl ? { added: wl.added, updated: wl.updated } : null,
    });
    job.threads.done++;
  }
  const { invalidateTraderAnalysis } = await import('./trader-analysis');
  invalidateTraderAnalysis();
  job.phase = 'done';
  job.status = 'done';
  job.finishedAt = new Date().toISOString();
  logger.info(`[DISCORD-FORUM] committed ${job.results.length} threads: ${job.results.map((r) => `${r.trader}=${r.posts}p/${r.tradesNew + r.tradesUpdated}t${r.book === 'mine' ? `/${r.tradesLinked} linked` : ''}`).join(', ')}`);
}

async function writeTrades(owner: string, h: HeldThread, imp: ThreadImport, batchId: string, linked: Map<string, string> | null) {
  const prevRows = await db.select().from(journalTrades).where(and(eq(journalTrades.userId, owner), eq(journalTrades.broker, 'discord')));
  const prevBy = new Map(prevRows.filter((r) => r.brokerOrderId).map((r) => [r.brokerOrderId!, r]));
  let tradesNew = 0, tradesUpdated = 0, tradesUnchanged = 0, tradesRemoved = 0, tradesLinked = 0, tradesFlagged = 0;
  const keep = new Set<string>();
  for (const t of imp.trades as ForumTrade[]) {
    const key = `discord:${t.key}`;
    if (linked?.has(t.key)) { tradesLinked++; continue; } // already in Mine from the broker — never counted twice
    keep.add(key);
    const link = imp.posts.find((x) => x.messageId === t.messageIds[0])?.meta.link ?? null;
    const derived = deriveJournalTradeFields({
      direction: t.direction, assetType: t.assetType, quantity: t.quantity, entryPrice: t.entryPrice,
      exitPrice: t.exitPrice, entryTime: t.entryTime, exitTime: t.exitTime, fees: 0,
    } as any);
    const mineFlag = linked ? 'Not found in your broker imports — journaled from your Discord post (source: discord). Check it against your statement.' : null;
    const fields = {
      symbol: t.symbol, assetType: t.assetType, direction: t.direction,
      optionType: t.optionType, strikePrice: t.strikePrice, expiryDate: t.expiryDate,
      quantity: t.quantity, entryPrice: t.entryPrice, exitPrice: t.exitPrice, fees: 0,
      entryTime: t.entryTime, exitTime: t.exitTime,
      ...derived,
      notes: [mineFlag, t.notes, '', `Source: ${link ?? `Discord message ${t.key}`} (${h.info.name}) · ${t.evidence === 'text' ? 'post text' : t.evidence === 'vision' ? 'screenshot' : 'post text + screenshot'} · parse confidence ${Math.round(t.confidence * 100)}%`,
        t.stop != null || t.target != null ? `Stated plan: stop ${t.stop ?? '—'} · target ${t.target ?? '—'}` : null].filter((x) => x != null).join('\n'),
      rawCsvRow: {
        source: 'discord-forum', link, threadId: h.info.id, threadName: h.info.name, authorName: h.imp.primary?.authorName ?? null,
        confidence: t.confidence, stop: t.stop, target: t.target, exitVia: t.exitVia, qtyStated: t.qtyStated,
        exitDerivedFromPct: t.exitDerivedFromPct, messageIds: t.messageIds, evidence: t.evidence, statedPnl: t.statedPnl,
        legIds: t.legIds, flags: t.flags, ...(linked ? { mineUnmatched: true } : {}),
      },
    };
    if (linked) tradesFlagged++;
    const prev = prevBy.get(key);
    if (!prev) {
      await db.insert(journalTrades).values({
        ...fields, userId: owner, broker: 'discord', brokerOrderId: key, importBatchId: batchId,
        setupType: t.setupType, screenshot: null,
      } as any).onConflictDoNothing();
      tradesNew++;
      continue;
    }
    const changed = (['quantity', 'entryPrice', 'exitPrice', 'exitTime', 'status', 'notes'] as const).some((k) => (prev as any)[k] !== (fields as any)[k]);
    if (!changed) { tradesUnchanged++; continue; }
    // Economics + source notes only — tags, emotion, rating, setup an admin set are kept.
    await db.update(journalTrades).set({ ...fields, updatedAt: new Date() } as any).where(eq(journalTrades.id, prev.id));
    tradesUpdated++;
  }
  // Rows this importer wrote earlier for THIS thread that no longer exist (re-paired after
  // screenshots were read, split, or — in Mine — now matched to a broker row) are removed.
  const stale = prevRows.filter((r) => r.brokerOrderId && !keep.has(r.brokerOrderId) && (r.rawCsvRow as any)?.threadId === h.info.id && (r.rawCsvRow as any)?.source === 'discord-forum');
  if (stale.length) {
    await db.delete(journalTrades).where(inArray(journalTrades.id, stale.map((r) => r.id)));
    tradesRemoved = stale.length;
  }
  return { tradesNew, tradesUpdated, tradesUnchanged, tradesRemoved, tradesLinked, tradesFlagged };
}
