/**
 * Discord → a trader's journal: read, preview, then commit.
 *
 * Two ways in (docs/DISCORD_IMPORT.md):
 *   1. file   — a DiscordChatExporter JSON/CSV export, uploaded by an admin. Works
 *               with no Discord configuration at all.
 *   2. bot    — the server reads the channel with DISCORD_BOT_TOKEN through
 *               GET /channels/{id}/messages (before-pagination, rate-limit aware).
 *
 * READ-ONLY toward Discord: this module only issues GET requests. It never posts,
 * edits, reacts or deletes — nothing here can send a message.
 *
 * Nothing is written on preview. The preview is held server-side for 30 minutes
 * under a random token bound to the admin who made it and the trader it targets;
 * commit writes exactly what was previewed (the client never supplies trade
 * data). Keys are Discord message ids, so importing the same history twice
 * updates the same rows instead of duplicating them.
 */
import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from './db';
import { storage } from './storage';
import { logger } from './logger';
import { journalNotes } from '@shared/schema';
import {
  discordAuthors, normalizeDiscordExport, pairDiscordMessages,
  type DiscordMsg, type DiscordNote, type DiscordTrade, type NormalizeResult,
} from '@shared/discord-journal-parser';
import { deriveJournalTradeFields } from './journal-trade-input';

// ─── Path 1: Discord REST (bot token) ────────────────────────

const API = 'https://discord.com/api/v10';
export const DISCORD_MAX_MESSAGES = 5000;

export function discordBotConfigured(): boolean {
  return !!process.env.DISCORD_BOT_TOKEN?.trim();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Newest → oldest with `before=` pagination (100 per page), honouring
 * X-RateLimit-Remaining / X-RateLimit-Reset-After and 429 retry_after.
 */
export async function fetchChannelHistory(channelId: string, maxMessages = DISCORD_MAX_MESSAGES): Promise<unknown[]> {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!token) throw new Error('DISCORD_BOT_TOKEN is not configured — use a DiscordChatExporter file instead (docs/DISCORD_IMPORT.md)');
  if (!/^\d{15,22}$/.test(channelId)) throw new Error('Channel id must be the numeric Discord channel id');
  const out: unknown[] = [];
  let before: string | null = null;
  let retries = 0;
  while (out.length < maxMessages) {
    const qs = new URLSearchParams({ limit: '100' });
    if (before) qs.set('before', before);
    const res = await fetch(`${API}/channels/${channelId}/messages?${qs}`, {
      method: 'GET',
      headers: { Authorization: `Bot ${token}`, 'User-Agent': 'QuantEdgeJournalImport (https://quantedgelabs.net, 1.0)' },
    });
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      const wait = Math.ceil((Number(body?.retry_after) || Number(res.headers.get('retry-after')) || 1) * 1000);
      if (++retries > 5) throw new Error('Discord kept rate-limiting the history read — try again in a minute');
      await sleep(Math.min(wait, 30_000));
      continue;
    }
    if (res.status === 401) throw new Error('Discord rejected DISCORD_BOT_TOKEN (401)');
    if (res.status === 403) throw new Error('The bot cannot read that channel (403) — invite it to the server and give it View Channel + Read Message History');
    if (res.status === 404) throw new Error('Channel not found (404) — check the channel id and that the bot is in that server');
    if (!res.ok) throw new Error(`Discord answered ${res.status} reading channel history`);
    retries = 0;
    const page = await res.json();
    if (!Array.isArray(page) || page.length === 0) break;
    out.push(...page);
    before = String((page[page.length - 1] as any).id);
    if (page.length < 100) break;
    const remaining = Number(res.headers.get('x-ratelimit-remaining'));
    const resetAfter = Number(res.headers.get('x-ratelimit-reset-after'));
    if (Number.isFinite(remaining) && remaining <= 0 && Number.isFinite(resetAfter)) await sleep(Math.ceil(resetAfter * 1000));
  }
  // Message Content intent missing → every non-mention message arrives with empty content.
  return out.slice(0, maxMessages);
}

// ─── Preview cache ───────────────────────────────────────────

const TTL_MS = 30 * 60_000;

interface PreviewEntry {
  token: string;
  actorId: string;
  ownerId: string;
  traderSlug: string;
  expires: number;
  trades: DiscordTrade[];
  notes: DiscordNote[];
}

const previews = new Map<string, PreviewEntry>();

function sweep() {
  const now = Date.now();
  for (const [k, v] of previews) if (v.expires < now) previews.delete(k);
}

export type RowState = 'new' | 'update' | 'unchanged';

function tradeEconomics(t: DiscordTrade) {
  const d = deriveJournalTradeFields({
    direction: t.direction, assetType: t.assetType, quantity: t.quantity, entryPrice: t.entryPrice,
    exitPrice: t.exitPrice, fees: 0, entryTime: new Date(t.entryTime).toISOString(), exitTime: t.exitTime ? new Date(t.exitTime).toISOString() : null,
  });
  return {
    symbol: t.symbol, assetType: t.assetType, direction: t.direction, optionType: t.optionType, strikePrice: t.strikePrice,
    expiryDate: t.expiryDate, quantity: t.quantity, entryPrice: t.entryPrice, exitPrice: t.exitPrice, fees: 0,
    entryTime: new Date(t.entryTime).toISOString(), exitTime: t.exitTime ? new Date(t.exitTime).toISOString() : null, ...d,
  };
}

export interface PreviewInput {
  ownerId: string;
  traderSlug: string;
  actorId: string;
  source: { kind: 'file'; content: string } | { kind: 'bot'; channelId: string };
  /** Import only this author's messages (null = everyone in the export). */
  authorId?: string | null;
}

export async function buildDiscordPreview(input: PreviewInput) {
  sweep();
  // Bad files and Discord refusals are the caller's to fix (422), not server faults.
  const unprocessable = (err: unknown) => Object.assign(err instanceof Error ? err : new Error(String(err)), { status: 422 });
  let norm: NormalizeResult;
  if (input.source.kind === 'file') {
    try { norm = normalizeDiscordExport(input.source.content); } catch (err) { throw unprocessable(err); }
  } else {
    let raw: unknown[];
    try { raw = await fetchChannelHistory(input.source.channelId); } catch (err) { throw unprocessable(err); }
    norm = normalizeDiscordExport(JSON.stringify(raw));
    const empty = norm.messages.filter((m) => !m.content.trim() && !m.attachments.length).length;
    if (norm.messages.length && empty / norm.messages.length > 0.9) {
      norm.skipped.push({ reason: 'empty content — enable the Message Content intent for the bot', count: empty });
    }
  }
  const authors = discordAuthors(norm.messages);
  const selected = input.authorId && authors.some((a) => a.authorId === input.authorId) ? input.authorId : null;
  const msgs: DiscordMsg[] = selected ? norm.messages.filter((m) => m.authorId === selected) : norm.messages;
  const { trades, notes, stats } = pairDiscordMessages(msgs);

  // Diff against what this journal already holds (idempotency is by message id).
  const existing = (await storage.getJournalTrades(input.ownerId)).filter((r) => r.broker === 'discord' && r.brokerOrderId);
  const byKey = new Map(existing.map((r) => [r.brokerOrderId!, r]));
  const knownNotes = new Set((await db.select({ id: journalNotes.sourceMessageId }).from(journalNotes)
    .where(sql`${journalNotes.ownerId} = ${input.ownerId} AND ${journalNotes.source} = 'discord'`)).map((r) => r.id));

  const tradeRows = trades.map((t) => {
    const econ = tradeEconomics(t);
    const prev = byKey.get(`discord:${t.key}`);
    const state: RowState = !prev ? 'new'
      : (['quantity', 'entryPrice', 'exitPrice', 'status', 'realizedPnL'] as const).some((k) => (prev as any)[k] !== (econ as any)[k]) ? 'update' : 'unchanged';
    return { ...t, realizedPnL: econ.realizedPnL, realizedPnLPercent: econ.realizedPnLPercent, state };
  });
  const noteRows = notes.map((n) => ({ ...n, state: (knownNotes.has(n.messageId) ? 'unchanged' : 'new') as RowState }));

  const token = randomBytes(18).toString('base64url');
  previews.set(token, {
    token, actorId: input.actorId, ownerId: input.ownerId, traderSlug: input.traderSlug,
    expires: Date.now() + TTL_MS, trades, notes,
  });

  return {
    token,
    expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
    format: norm.format,
    channel: norm.channel,
    authors,
    selectedAuthorId: selected,
    stats,
    skipped: norm.skipped,
    counts: {
      tradesNew: tradeRows.filter((t) => t.state === 'new').length,
      tradesUpdated: tradeRows.filter((t) => t.state === 'update').length,
      tradesUnchanged: tradeRows.filter((t) => t.state === 'unchanged').length,
      notesNew: noteRows.filter((n) => n.state === 'new').length,
      notesUnchanged: noteRows.filter((n) => n.state === 'unchanged').length,
    },
    trades: tradeRows,
    // The preview lists the newest 300 notes in full; every note is still committed.
    notes: noteRows.slice(-300).map((n) => ({ ...n, body: n.body.length > 600 ? `${n.body.slice(0, 600)}…` : n.body })),
  };
}

export async function commitDiscordPreview(token: string, actorId: string, traderSlug: string) {
  sweep();
  const p = previews.get(token);
  if (!p || p.actorId !== actorId || p.traderSlug !== traderSlug) {
    throw Object.assign(new Error('Preview expired or not yours — run the preview again'), { status: 410 });
  }
  previews.delete(token);

  const existing = (await storage.getJournalTrades(p.ownerId)).filter((r) => r.broker === 'discord' && r.brokerOrderId);
  const byKey = new Map(existing.map((r) => [r.brokerOrderId!, r]));
  const batchId = `discord_${Date.now()}`;
  let created = 0, updated = 0, unchanged = 0, notesCreated = 0;

  for (const t of p.trades) {
    const econ = tradeEconomics(t);
    const key = `discord:${t.key}`;
    const prev = byKey.get(key);
    const screenshot = t.screenshot && /^https:\/\/\S+$/i.test(t.screenshot) && t.screenshot.length < 2000 ? t.screenshot : null;
    if (!prev) {
      await storage.createJournalTrade({
        ...econ, userId: p.ownerId, broker: 'discord', brokerOrderId: key, importBatchId: batchId,
        notes: t.notes.slice(0, 20_000), setupType: t.setupType, screenshot,
        rawCsvRow: { messageIds: t.messageIds, flags: t.flags, authorId: t.authorId } as any,
      } as any);
      created++;
      continue;
    }
    const changed = (['quantity', 'entryPrice', 'exitPrice', 'status', 'realizedPnL'] as const).some((k) => (prev as any)[k] !== (econ as any)[k]);
    if (!changed) { unchanged++; continue; }
    // Economics + the Discord timeline; tags / rating / emotion an admin added stay.
    await storage.updateJournalTrade(prev.id, {
      ...econ, notes: t.notes.slice(0, 20_000), rawCsvRow: { messageIds: t.messageIds, flags: t.flags, authorId: t.authorId } as any, updatedAt: new Date(),
    } as any);
    updated++;
  }

  for (let i = 0; i < p.notes.length; i += 200) {
    const chunk = p.notes.slice(i, i + 200).map((n) => ({
      ownerId: p.ownerId, symbols: n.symbols, day: n.day, postedAt: n.postedAt, body: n.body.slice(0, 20_000),
      attachments: n.attachments, source: 'discord', sourceMessageId: n.messageId, reason: n.reason,
    }));
    if (!chunk.length) continue;
    const res = await db.insert(journalNotes).values(chunk).onConflictDoNothing().returning({ id: journalNotes.id });
    notesCreated += res.length;
  }

  logger.info(`[JOURNAL-DISCORD] ${traderSlug}: ${created} trades created, ${updated} updated, ${notesCreated} notes`);
  return { created, updated, unchanged, notesCreated, notesSkipped: p.notes.length - notesCreated };
}
