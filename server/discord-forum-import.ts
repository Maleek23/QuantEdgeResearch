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
 * Commit (admin only; the client sends only the mapping, never rows):
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
  REVIEW_LABEL, buildThreadImport, matchThreadToTrader, readExportMeta,
  type ForumThreadInfo, type ThreadImport, type ThreadMatch,
} from '@shared/discord-forum';
import { TRADER_SLUG_RE, traderOwnerId } from '@shared/journal-sources';
import { deriveJournalTradeFields } from './journal-trade-input';
import { discordReader, DiscordReadError } from './discord-reader';

const TTL_MS = 30 * 60_000;
/** Total messages one preview may hold (all threads). */
const MAX_TOTAL_MESSAGES = 20_000;

interface HeldThread { info: ForumThreadInfo; imp: ThreadImport; match: ThreadMatch | null; source: 'bot' | 'file' }
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

export async function buildForumPreview(input: { actorId: string; source: ForumSource }) {
  sweep();
  const { forum, threads, skipped } = await readSource(input.source);
  const traderRows = await db.select().from(traders);
  const held: HeldThread[] = threads.map(({ info, msgs, source }) => {
    const imp = buildThreadImport(info, msgs);
    const match = matchThreadToTrader({ name: info.name, authorNames: imp.primary ? [imp.primary.authorName] : [] }, traderRows);
    return { info, imp, match, source };
  }).sort((a, b) => b.imp.stats.posts - a.imp.stats.posts);

  // What already exists in each matched book (to label new / already imported).
  const ownerOf = new Map(traderRows.map((t) => [t.slug, traderOwnerId(t.id)]));
  const existingIds = new Map<string, Set<string>>();
  for (const h of held) {
    const owner = h.match?.existing ? ownerOf.get(h.match.slug) : null;
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

  const token = randomBytes(18).toString('base64url');
  previews.set(token, { token, actorId: input.actorId, expires: Date.now() + TTL_MS, threads: held });

  return {
    token,
    expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
    forum,
    skipped,
    traders: traderRows.map((t) => ({ slug: t.slug, name: t.name })),
    threads: held.map(({ info, imp, match, source }) => {
      const already = existingIds.get(info.id)?.size ?? 0;
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
    }),
  };
}

export interface ForumMapping { threadId: string; slug: string | null; createName?: string | null }

async function ensureTrader(m: ForumMapping, h: HeldThread, actorId: string, existing: Map<string, Trader>): Promise<Trader> {
  const slug = m.slug!;
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
  const name = (m.createName ?? '').trim();
  if (!name) throw Object.assign(new Error(`"${slug}" is a new trader — confirm it (give it a name) in the preview`), { status: 400 });
  const [t] = await db.insert(traders).values({
    slug, name: name.slice(0, 60), handle, source: 'discord',
    discordChannelId: /^\d{15,22}$/.test(h.info.id) ? h.info.id : null, createdBy: actorId,
  }).onConflictDoNothing().returning();
  const row = t ?? (await db.select().from(traders).where(eq(traders.slug, slug)).limit(1))[0];
  existing.set(slug, row);
  return row;
}

export async function commitForumPreview(token: string, actorId: string, mapping: ForumMapping[]) {
  sweep();
  const p = previews.get(token);
  if (!p || p.actorId !== actorId) throw Object.assign(new Error('Preview expired or not yours — run the preview again'), { status: 410 });
  const byId = new Map(p.threads.map((t) => [t.info.id, t]));
  for (const m of mapping) {
    if (!byId.has(m.threadId)) throw Object.assign(new Error(`Thread ${m.threadId} is not in this preview`), { status: 400 });
    if (m.slug != null && !TRADER_SLUG_RE.test(m.slug)) throw Object.assign(new Error(`"${m.slug}" is not a valid trader slug`), { status: 400 });
  }
  previews.delete(token);

  const { upsertTraderWatchlist } = await import('./discord-journal-import');
  const existing = new Map((await db.select().from(traders)).map((t) => [t.slug, t]));
  const batchId = `discord_forum_${Date.now()}`;
  const results: { threadId: string; name: string; trader: string; created: boolean; posts: number; tradesNew: number; tradesUpdated: number; tradesUnchanged: number; watchlist: { added: number; updated: number } }[] = [];

  for (const m of mapping) {
    if (!m.slug) continue; // skipped by the operator
    const h = byId.get(m.threadId)!;
    const wasNew = !existing.has(m.slug);
    const trader = await ensureTrader(m, h, actorId, existing);
    const owner = traderOwnerId(trader.id);

    // 1 · Posts → notebook (upsert by message id).
    const rows = h.imp.posts.map((post) => ({
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

    // 2 · Parsed trades → the trader's journal (economics only on re-import).
    const prevRows = await db.select().from(journalTrades).where(and(eq(journalTrades.userId, owner), eq(journalTrades.broker, 'discord')));
    const prevBy = new Map(prevRows.filter((r) => r.brokerOrderId).map((r) => [r.brokerOrderId!, r]));
    let tradesNew = 0, tradesUpdated = 0, tradesUnchanged = 0;
    for (const t of h.imp.trades) {
      const key = `discord:${t.key}`;
      const link = h.imp.posts.find((x) => x.messageId === t.key)?.meta.link ?? null;
      const derived = deriveJournalTradeFields({
        direction: t.direction, assetType: t.assetType, quantity: t.quantity, entryPrice: t.entryPrice,
        exitPrice: t.exitPrice, entryTime: t.entryTime, exitTime: t.exitTime, fees: 0,
      } as any);
      const fields = {
        symbol: t.symbol, assetType: t.assetType, direction: t.direction,
        optionType: t.optionType, strikePrice: t.strikePrice, expiryDate: t.expiryDate,
        quantity: t.quantity, entryPrice: t.entryPrice, exitPrice: t.exitPrice, fees: 0,
        entryTime: t.entryTime, exitTime: t.exitTime,
        ...derived,
        notes: [t.notes, '', `Source: ${link ?? `Discord message ${t.key}`} (${h.info.name}) · parse confidence ${Math.round(t.confidence * 100)}%`,
          t.stop != null || t.target != null ? `Stated plan: stop ${t.stop ?? '—'} · target ${t.target ?? '—'}` : null].filter((x) => x != null).join('\n'),
        rawCsvRow: {
          source: 'discord-forum', link, threadId: h.info.id, threadName: h.info.name, authorName: h.imp.primary?.authorName ?? null,
          confidence: t.confidence, stop: t.stop, target: t.target, exitVia: t.exitVia, qtyStated: t.qtyStated,
          exitDerivedFromPct: t.exitDerivedFromPct, messageIds: t.messageIds,
        },
      };
      const prev = prevBy.get(key);
      if (!prev) {
        await db.insert(journalTrades).values({
          ...fields, userId: owner, broker: 'discord', brokerOrderId: key, importBatchId: batchId,
          setupType: t.setupType, screenshot: t.screenshot,
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

    // 3 · Watchlist fold (the channel importer's behaviour, kept).
    const wl = await upsertTraderWatchlist(trader.id, h.imp.trades, h.imp.notes, actorId);
    results.push({
      threadId: h.info.id, name: h.info.name, trader: trader.slug, created: wasNew, posts: rows.length,
      tradesNew, tradesUpdated, tradesUnchanged, watchlist: { added: wl.added, updated: wl.updated },
    });
  }
  const { invalidateTraderAnalysis } = await import('./trader-analysis');
  invalidateTraderAnalysis();
  logger.info(`[DISCORD-FORUM] committed ${results.length} threads: ${results.map((r) => `${r.trader}=${r.posts}p/${r.tradesNew + r.tradesUpdated}t`).join(', ')}`);
  return { threads: results };
}
