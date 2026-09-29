/**
 * Discord → a trader's WATCHLIST: read, preview, then commit.
 *
 * 2026-09-29 (operator): Discord importing is for the watchlist, not the
 * journal — traders keep their own journal once they have accounts. So the
 * parsed calls/analysis are folded into one watchlist row per ticker they
 * posted (mention count, last mention, a one-line note of their latest call);
 * nothing is written to journal_trades or journal_notes.
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
 * commit writes exactly what was previewed (the client never supplies the
 * rows). One row per (trader, ticker), so importing the same history twice
 * refreshes notes instead of duplicating names.
 */
import { randomBytes } from 'node:crypto';
import { db } from './db';
import { logger } from './logger';
import { traders, traderWatchlistItems } from '@shared/schema';
import { and, eq } from 'drizzle-orm';
import {
  discordAuthors, normalizeDiscordExport, pairDiscordMessages,
  type DiscordMsg, type DiscordNote, type DiscordTrade, type NormalizeResult,
} from '@shared/discord-journal-parser';

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

export interface WatchCandidate {
  symbol: string;
  mentions: number;
  lastAt: string;
  /** One line describing their most recent call on this ticker. */
  note: string;
  state: RowState;
}

const SYMBOL_OK = /^[A-Z][A-Z.]{0,5}$/;
const shortDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
const px = (n: number | null) => (n == null ? '' : n >= 100 ? n.toFixed(0) : n.toFixed(2).replace(/\.00$/, ''));

function tradeLine(t: DiscordTrade): string {
  const contract = t.assetType === 'option'
    ? `${t.strikePrice ?? ''}${(t.optionType ?? '').charAt(0).toUpperCase()}${t.expiryDate ? ` ${t.expiryDate.slice(5).replace('-', '/')}` : ''} `
    : '';
  const exit = t.exitPrice != null
    ? ` → out ${px(t.exitPrice)}${t.entryPrice ? ` (${(((t.exitPrice - t.entryPrice) / t.entryPrice) * (t.direction === 'short' ? -100 : 100)).toFixed(0)}%)` : ''}`
    : ' (open)';
  return `${t.direction === 'short' ? 'short ' : ''}${contract}@${px(t.entryPrice)}${exit}`.trim();
}

/** Fold parsed trades + analysis notes into one watchlist candidate per ticker. */
export function watchCandidates(trades: DiscordTrade[], notes: DiscordNote[]) {
  const by = new Map<string, { symbol: string; mentions: number; lastAt: string; note: string }>();
  const touch = (sym: string, at: string, line: string) => {
    const symbol = sym.toUpperCase().replace(/^\$/, '');
    if (!SYMBOL_OK.test(symbol)) return;
    const cur = by.get(symbol);
    if (!cur) { by.set(symbol, { symbol, mentions: 1, lastAt: at, note: line }); return; }
    cur.mentions++;
    if (Date.parse(at) >= Date.parse(cur.lastAt)) { cur.lastAt = at; cur.note = line; }
  };
  for (const t of trades) touch(t.symbol, t.exitTime ?? t.entryTime, tradeLine(t));
  for (const n of notes) {
    const excerpt = n.body.replace(/\s+/g, ' ').trim().slice(0, 140);
    for (const sym of n.symbols) touch(sym, n.postedAt, excerpt);
  }
  return [...by.values()]
    .map((c) => ({ ...c, note: `${c.note} · ${shortDay(c.lastAt)}`.slice(0, 280) }))
    .sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt));
}

async function traderBySlug(slug: string) {
  const [t] = await db.select().from(traders).where(eq(traders.slug, slug)).limit(1);
  if (!t) throw Object.assign(new Error(`No trader "${slug}"`), { status: 404 });
  return t;
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

  const trader = await traderBySlug(input.traderSlug);
  const existing = await db.select().from(traderWatchlistItems).where(eq(traderWatchlistItems.traderId, trader.id));
  const have = new Map(existing.map((r) => [r.symbol, r]));
  const candidates: WatchCandidate[] = watchCandidates(trades, notes).map((c) => {
    const prev = have.get(c.symbol);
    return { ...c, state: !prev ? 'new' : prev.note === c.note ? 'unchanged' : 'update' };
  });

  const token = randomBytes(18).toString('base64url');
  previews.set(token, {
    token, actorId: input.actorId, ownerId: input.ownerId, traderSlug: input.traderSlug,
    expires: Date.now() + TTL_MS, trades, notes, candidates,
  } as any);

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
      symbolsNew: candidates.filter((c) => c.state === 'new').length,
      symbolsUpdated: candidates.filter((c) => c.state === 'update').length,
      symbolsUnchanged: candidates.filter((c) => c.state === 'unchanged').length,
      alreadyOnList: existing.length,
    },
    candidates,
  };
}

export async function commitDiscordPreview(token: string, actorId: string, traderSlug: string) {
  sweep();
  const p = previews.get(token) as any;
  if (!p || p.actorId !== actorId || p.traderSlug !== traderSlug) {
    throw Object.assign(new Error('Preview expired or not yours — run the preview again'), { status: 410 });
  }
  previews.delete(token);
  const trader = await traderBySlug(traderSlug);
  let added = 0, updated = 0, unchanged = 0;
  for (const c of (p.candidates ?? []) as WatchCandidate[]) {
    const [prev] = await db.select().from(traderWatchlistItems)
      .where(and(eq(traderWatchlistItems.traderId, trader.id), eq(traderWatchlistItems.symbol, c.symbol))).limit(1);
    if (!prev) {
      await db.insert(traderWatchlistItems).values({ traderId: trader.id, symbol: c.symbol, note: c.note, addedBy: actorId }).onConflictDoNothing();
      added++;
    } else if (prev.note !== c.note) {
      await db.update(traderWatchlistItems).set({ note: c.note }).where(eq(traderWatchlistItems.id, prev.id));
      updated++;
    } else unchanged++;
  }
  logger.info(`[WATCHLIST-DISCORD] ${traderSlug}: ${added} added, ${updated} notes updated, ${unchanged} unchanged`);
  return { added, updated, unchanged };
}

/**
 * The same watchlist fold for callers that already hold parsed trades/notes
 * (the forum import): one row per ticker, note = their latest call.
 */
export async function upsertTraderWatchlist(traderId: string, trades: DiscordTrade[], notes: DiscordNote[], actorId: string) {
  const existing = await db.select().from(traderWatchlistItems).where(eq(traderWatchlistItems.traderId, traderId));
  const have = new Map(existing.map((r) => [r.symbol, r]));
  let added = 0, updated = 0, unchanged = 0;
  for (const c of watchCandidates(trades, notes)) {
    const prev = have.get(c.symbol);
    if (!prev) {
      await db.insert(traderWatchlistItems).values({ traderId, symbol: c.symbol, note: c.note, addedBy: actorId }).onConflictDoNothing();
      added++;
    } else if (prev.note !== c.note) {
      await db.update(traderWatchlistItems).set({ note: c.note }).where(eq(traderWatchlistItems.id, prev.id));
      updated++;
    } else unchanged++;
  }
  return { added, updated, unchanged };
}
