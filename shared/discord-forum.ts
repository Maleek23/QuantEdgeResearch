/**
 * Discord FORUM → trader books (pure helpers; no I/O).
 *
 * A forum channel holds one thread per trader ("femi's trading journals",
 * "Leeks $300 to 5 figgy challenge", "UZO's Road to a Milly"…). The importer
 * (server/discord-forum-import.ts) lists the threads, reads each thread's
 * messages, and maps every thread to one trader book. This file holds the parts
 * that must be testable without Discord or a database:
 *
 *   threadTraderSuggestion   thread name → a trader slug/name to propose
 *   matchThreadToTrader      thread → an existing trader (slug, name, handle,
 *                            author) or a NEW slug the operator must confirm
 *   readExportMeta           DiscordChatExporter JSON → thread id/name/parent/guild
 *   discordMessageLink       the https link back to a message
 *   reviewReasonOf           which messages go to the review list and why
 */
import {
  discordAuthors, discordDayKey, pairDiscordMessages, parseDiscordMessage,
  type DiscordAttachment, type DiscordMsg, type DiscordNote, type DiscordTrade, type ParsedMessage, type PairResult,
} from './discord-journal-parser';
import { TRADER_SLUG_RE } from './journal-sources';

/** Discord channel types a thread list can hang off (text, announcement, forum, media). */
export const THREAD_PARENT_TYPES = new Set([0, 5, 15, 16]);
/** Thread channel types (announcement / public / private thread). */
export const THREAD_TYPES = new Set([10, 11, 12]);

export interface ForumThreadInfo {
  id: string;
  name: string;
  parentId: string | null;
  guildId: string | null;
  /** Thread creator (bot mode only — exports do not carry it). */
  ownerId: string | null;
  archived: boolean;
  /** Discord's own count (bot mode), when given. */
  messageCount: number | null;
}

export interface TraderLike { slug: string; name: string; handle?: string | null }

export type MatchVia = 'slug' | 'name' | 'handle' | 'author' | 'suggested';

export interface ThreadMatch {
  slug: string;
  name: string;
  /** true = an existing trader; false = a new trader the operator must confirm. */
  existing: boolean;
  via: MatchVia;
}

const POSSESSIVE_RE = /['’`]s$/i;

function tokens(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9'’`]+/).filter(Boolean).map((t) => t.replace(POSSESSIVE_RE, '').replace(/['’`]/g, ''));
}

/**
 * The trader a thread name suggests: the first word, possessive dropped
 * ("femi's trading journals" → femi, "UZO's Road to a Milly" → uzo,
 * "P4E's Journal" → p4e). A first word with no apostrophe that ends in a
 * single 's' is read as a possessive written without one ("Leeks $300 to 5
 * figgy challenge" → leek). Only a suggestion — the preview shows it and the
 * operator confirms or edits it before anything is created.
 */
export function threadTraderSuggestion(threadName: string): { slug: string; name: string } | null {
  const first = threadName.trim().split(/\s+/)[0] ?? '';
  let word = first.replace(/[^A-Za-z0-9'’`-]/g, '');
  if (POSSESSIVE_RE.test(word)) word = word.replace(POSSESSIVE_RE, '');
  else if (/[^s]s$/i.test(word) && word.length >= 5) word = word.slice(0, -1);
  word = word.replace(/['’`]/g, '');
  const slug = word.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);
  if (!slug || !TRADER_SLUG_RE.test(slug)) return null;
  // Name: keep the author's casing unless it is all caps ("UZO" → "Uzo", "P4E" stays).
  const name = /^[A-Z]{2,}$/.test(word) ? word.charAt(0) + word.slice(1).toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1);
  return { slug, name };
}

/**
 * Thread → trader. In order: a trader whose slug or name is a word of the
 * thread name; a trader whose handle is the thread's main author; else the
 * suggestion (a NEW trader, `existing: false`). Returns null only when the
 * name suggests nothing usable (the operator then picks by hand).
 */
export function matchThreadToTrader(
  thread: { name: string; authorNames?: string[] },
  traders: TraderLike[],
): ThreadMatch | null {
  const words = tokens(thread.name);
  const wordSet = new Set(words);
  for (const t of traders) {
    if (wordSet.has(t.slug.toLowerCase())) return { slug: t.slug, name: t.name, existing: true, via: 'slug' };
  }
  for (const t of traders) {
    const nameWords = tokens(t.name);
    if (nameWords.length && nameWords.every((w) => wordSet.has(w))) return { slug: t.slug, name: t.name, existing: true, via: 'name' };
  }
  const authors = (thread.authorNames ?? []).map((a) => a.trim().toLowerCase()).filter(Boolean);
  for (const t of traders) {
    const h = t.handle?.trim().toLowerCase().replace(/^@/, '');
    if (h && authors.includes(h)) return { slug: t.slug, name: t.name, existing: true, via: 'handle' };
  }
  const sug = threadTraderSuggestion(thread.name);
  if (!sug) return null;
  const same = traders.find((t) => t.slug === sug.slug);
  if (same) return { slug: same.slug, name: same.name, existing: true, via: 'slug' };
  // "Leek" also matches an existing "leeks" (and vice versa).
  const plural = traders.find((t) => t.slug === `${sug.slug}s` || `${t.slug}s` === sug.slug);
  if (plural) return { slug: plural.slug, name: plural.name, existing: true, via: 'slug' };
  return { slug: sug.slug, name: sug.name, existing: false, via: 'suggested' };
}

export function discordMessageLink(guildId: string | null, channelId: string, messageId: string): string | null {
  if (!guildId || !/^\d+$/.test(guildId) || !/^\d+$/.test(channelId) || !/^\d+$/.test(messageId)) return null;
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

export interface ExportMeta {
  threadId: string | null;
  threadName: string | null;
  parentId: string | null;
  parentName: string | null;
  guildId: string | null;
  guildName: string | null;
  isThread: boolean;
}

/** Thread identity from a DiscordChatExporter JSON export (null fields when absent). */
export function readExportMeta(data: unknown): ExportMeta {
  const d = (data && typeof data === 'object' ? data : {}) as any;
  const ch = d.channel ?? {};
  const g = d.guild ?? {};
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null);
  const type = String(ch.type ?? '');
  return {
    threadId: str(ch.id),
    threadName: str(ch.name),
    parentId: str(ch.parentId) ?? str(ch.categoryId),
    parentName: str(ch.parent) ?? str(ch.category),
    guildId: str(g.id),
    guildName: str(g.name),
    isThread: /thread/i.test(type),
  };
}

/** The thread's main author — its creator when known, else whoever posted most. */
export function primaryAuthor(msgs: DiscordMsg[], ownerId: string | null): { authorId: string; authorName: string } | null {
  if (ownerId) {
    const m = msgs.find((x) => x.authorId === ownerId);
    if (m) return { authorId: ownerId, authorName: m.authorName };
  }
  const n = new Map<string, { authorId: string; authorName: string; c: number }>();
  for (const m of msgs) {
    const e = n.get(m.authorId) ?? { authorId: m.authorId, authorName: m.authorName, c: 0 };
    e.c++;
    n.set(m.authorId, e);
  }
  const best = [...n.values()].sort((a, b) => b.c - a.c)[0];
  return best ? { authorId: best.authorId, authorName: best.authorName } : null;
}

export type ReviewReason = 'entry_without_price' | 'unmatched_exit' | 'unpriced_exit' | 'trade_looking';

export const REVIEW_LABEL: Record<ReviewReason, string> = {
  entry_without_price: 'entry without a price',
  unmatched_exit: 'exit with no open entry',
  unpriced_exit: 'closed without a price or %',
  trade_looking: 'reads like a trade, not parsed',
};

/**
 * Why a message belongs on the review list, or null. `pairReason` is the
 * pairing's note reason for it (when the pairing kept it as a note).
 */
export function reviewReasonOf(p: Pick<ParsedMessage, 'kind' | 'tradeLooking'>, pairReason: string | null | undefined): ReviewReason | null {
  if (pairReason === 'entry_without_price' || pairReason === 'unmatched_exit' || pairReason === 'unpriced_exit') return pairReason;
  if (p.kind === 'note' && p.tradeLooking && (pairReason === 'analysis' || pairReason == null)) return 'trade_looking';
  return null;
}

/** Metadata stored on each imported post (journal_notes.meta). */
export interface DiscordPostMeta {
  kind: 'discord_post';
  authorId: string;
  authorName: string;
  /** The thread's main author wrote it (their own journal entry, not a comment). */
  byTrader: boolean;
  link: string | null;
  threadId: string;
  threadName: string;
  guildId: string | null;
  replyTo: string | null;
  /** What the parser read in it (entry / exit / trim / note) and how sure it is. */
  parsed: { kind: string; symbol: string | null; confidence: number } | null;
  /** Set when the message is on the review list. */
  review: ReviewReason | null;
  /** Trade key (entry message id) this post belongs to, when it is a trade leg. */
  tradeKey: string | null;
}

// ─── One thread → posts, trades, review list ─────────────────

export interface ThreadPost {
  messageId: string;
  postedAt: string;
  /** New York trading day. */
  day: string;
  /** The message text as posted (markdown kept); "(attachment)" when only files were posted. */
  body: string;
  symbols: string[];
  attachments: DiscordAttachment[];
  meta: DiscordPostMeta;
}

export interface ReviewItem { messageId: string; at: string; reason: ReviewReason; excerpt: string; link: string | null }

export interface ThreadImport {
  primary: { authorId: string; authorName: string } | null;
  authors: { authorId: string; authorName: string; messages: number }[];
  posts: ThreadPost[];
  /** Parsed from the main author's messages only (comments by others are posts, never trades). */
  trades: DiscordTrade[];
  /** Analysis notes from the pairing (for the watchlist fold). */
  notes: DiscordNote[];
  review: ReviewItem[];
  stats: PairResult['stats'] & { posts: number; review: number; avgConfidence: number | null; firstAt: string | null; lastAt: string | null };
}

const SYMBOL_OK = /^[A-Z][A-Z0-9.]{0,9}$/;

export function buildThreadImport(
  thread: { id: string; name: string; guildId: string | null; ownerId: string | null },
  msgs: DiscordMsg[],
): ThreadImport {
  const sorted = [...msgs].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.id.localeCompare(b.id));
  const primary = primaryAuthor(sorted, thread.ownerId);
  const own = primary ? sorted.filter((m) => m.authorId === primary.authorId) : [];
  const pair = pairDiscordMessages(own);

  const tradeOf = new Map<string, string>();
  for (const t of pair.trades) for (const id of t.messageIds) tradeOf.set(id, t.key);
  const noteReason = new Map<string, string>();
  for (const n of pair.notes) noteReason.set(n.messageId, n.reason);

  const posts: ThreadPost[] = [];
  const review: ReviewItem[] = [];
  for (const m of sorted) {
    const text = m.content.trim();
    if (!text && !m.attachments.length) continue; // system rows (thread created, pins)
    const byTrader = !!primary && m.authorId === primary.authorId;
    const p = parseDiscordMessage(m);
    const link = discordMessageLink(thread.guildId, thread.id, m.id);
    const rr = byTrader ? reviewReasonOf(p, noteReason.get(m.id) ?? (tradeOf.has(m.id) ? 'trade' : null)) : null;
    if (rr) review.push({ messageId: m.id, at: m.timestamp, reason: rr, excerpt: p.text.slice(0, 200), link });
    posts.push({
      messageId: m.id,
      postedAt: m.timestamp,
      day: discordDayKey(m.timestamp),
      body: text || '(attachment)',
      symbols: p.tickers.filter((t) => SYMBOL_OK.test(t)).slice(0, 12),
      attachments: m.attachments,
      meta: {
        kind: 'discord_post',
        authorId: m.authorId,
        authorName: m.authorName,
        byTrader,
        link,
        threadId: thread.id,
        threadName: thread.name,
        guildId: thread.guildId,
        replyTo: m.replyTo,
        parsed: byTrader && p.kind !== 'note' ? { kind: p.kind, symbol: p.symbol, confidence: p.confidence } : null,
        review: rr,
        tradeKey: tradeOf.get(m.id) ?? null,
      },
    });
  }
  const confs = pair.trades.map((t) => t.confidence);
  return {
    primary,
    authors: discordAuthors(sorted),
    posts,
    trades: pair.trades,
    notes: pair.notes,
    review,
    stats: {
      ...pair.stats,
      posts: posts.length,
      review: review.length,
      avgConfidence: confs.length ? Math.round((confs.reduce((s, x) => s + x, 0) / confs.length) * 100) / 100 : null,
      firstAt: sorted[0]?.timestamp ?? null,
      lastAt: sorted[sorted.length - 1]?.timestamp ?? null,
    },
  };
}
