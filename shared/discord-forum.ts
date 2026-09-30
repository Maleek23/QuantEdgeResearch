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
  discordAuthors, discordDayKey, parseDiscordMessage,
  type DiscordAttachment, type DiscordMsg, type DiscordNote, type DiscordNoteReason, type ParsedMessage, type PairResult,
} from './discord-journal-parser';
import { mergeMessageLegs, textLeg, visionLegs, type ForumLeg, type VisionImageRecord } from './forum-vision';
import { pairForumLegs, type ForumTrade, type LegUpdate, type Leftover } from './forum-pairing';
import { TRADER_SLUG_RE } from './journal-sources';

/** Discord channel types a thread list can hang off (text, announcement, forum, media). */
export const THREAD_PARENT_TYPES = new Set([0, 5, 15, 16]);
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

export type MatchVia = 'slug' | 'name' | 'handle' | 'author' | 'suggested' | 'alias';

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

// ─── Thread → BOOK (the operator's own journal, known traders) ───

/**
 * The operator's own journal. "Leeks $300 to 5 figgy challenge" is the
 * operator's thread (malik = leek): it goes into the importing admin's own
 * "Mine" book, never into a trader book, and nothing may create a "Leek" or
 * "Malik" trader. The preview's mapping value for it is MINE_SLUG.
 */
export const MINE_SLUG = 'mine';
export const MINE_ALIASES: ReadonlySet<string> = new Set(['mine', 'malik', 'leek', 'leeks']);
/** Title/author words that mean the operator ('mine' itself is too common a word in titles). */
const MINE_WORDS = ['malik', 'leek', 'leeks'];

export interface KnownTrader {
  slug: string;
  name: string;
  /** Words in a thread title (or its author's name) that mean this trader. */
  aliases: string[];
  /**
   * true: the preview pre-selects AND pre-confirms the mapping (created on import
   * if missing). false: pre-selected, but the operator must tick "confirm".
   */
  autoConfirm: boolean;
}

/** Traders the operator named (2026-09-29): femi, uzo (existing), ayo, tommi (confirm first). */
export const KNOWN_TRADERS: readonly KnownTrader[] = [
  { slug: 'femi', name: 'Femi', aliases: ['femi'], autoConfirm: true },
  { slug: 'uzo', name: 'Uzo', aliases: ['uzo'], autoConfirm: true },
  { slug: 'ayo', name: 'Ayo', aliases: ['ayo'], autoConfirm: true },
  { slug: 'tommi', name: 'Tommi', aliases: ['tommi', 'teejay'], autoConfirm: false },
];

export interface BookMatch extends ThreadMatch {
  /** 'mine' = the importing admin's own journal (slug MINE_SLUG). */
  book: 'mine' | 'trader';
  /** The operator must confirm this mapping in the preview before it is imported. */
  confirm: boolean;
}

/** A trader slug that means the operator's own book (never a trader book). */
export const isMineSlug = (slug: string | null | undefined) => !!slug && MINE_ALIASES.has(slug.toLowerCase());

/**
 * Thread → book. In order: the operator's own journal (title word, possessive,
 * suggestion or author name in MINE_ALIASES → Mine); a known trader by alias
 * (femi, uzo, ayo, tommi/teejay — tommi needs a confirmation); an existing
 * trader (matchThreadToTrader); else a NEW trader to confirm. A match to a
 * trader whose slug is a Mine alias is redirected to Mine.
 */
export function mapThreadToBook(thread: { name: string; authorNames?: string[] }, traders: TraderLike[]): BookMatch | null {
  const words = new Set(tokens(thread.name));
  const sug = threadTraderSuggestion(thread.name);
  if (sug) words.add(sug.slug);
  const authorWords = new Set((thread.authorNames ?? []).flatMap((a) => tokens(a.replace(/[_.]+/g, ' '))));
  const hit = (aliases: Iterable<string>) => [...aliases].some((a) => words.has(a) || authorWords.has(a));
  const mine: BookMatch = { slug: MINE_SLUG, name: 'Mine', existing: true, via: 'alias', book: 'mine', confirm: false };
  if (hit(MINE_WORDS)) return mine;
  for (const k of KNOWN_TRADERS) {
    if (!hit(k.aliases)) continue;
    const have = traders.find((t) => t.slug === k.slug);
    return { slug: k.slug, name: have?.name ?? k.name, existing: !!have, via: 'alias', book: 'trader', confirm: !k.autoConfirm };
  }
  const m = matchThreadToTrader(thread, traders);
  if (!m) return null;
  if (isMineSlug(m.slug)) return mine;
  return { ...m, book: 'trader', confirm: !m.existing };
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

export type ReviewReason =
  | 'entry_without_price' | 'unmatched_exit' | 'unpriced_exit' | 'trade_looking'
  | 'vision_low_confidence' | 'vision_unreadable' | 'vision_conflict';

export const REVIEW_LABEL: Record<ReviewReason, string> = {
  entry_without_price: 'entry without a price',
  unmatched_exit: 'exit with no open entry',
  unpriced_exit: 'closed without a price or %',
  trade_looking: 'reads like a trade, not parsed',
  vision_low_confidence: 'screenshot hard to read — not booked',
  vision_unreadable: 'screenshot could not be read',
  vision_conflict: 'text and screenshot disagree (text kept)',
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

/** What the screenshot reading adds to a post's metadata (shown under the post in the Notebook). */
export interface PostVisionSummary {
  images: number;
  read: number;
  kinds: string[];
  trades: number;
  /** Annotated-chart readings: ticker, timeframe, levels, bias, thesis. */
  charts: { ticker: string | null; timeframe: string | null; levels: number[]; bias: string | null; thesis: string | null }[];
  statedPnl: { amount: number | null; percent: number | null } | null;
  notes: string[];
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
  /** Trade key (entry leg id) this post belongs to, when it is a trade leg. */
  tradeKey: string | null;
  /**
   * Screenshot readings, one per image (fix/fvision). The CACHE: re-imports
   * reuse a record by attachment id (or image hash) instead of calling the
   * model again. The image itself is never stored — only this JSON.
   */
  vision?: VisionImageRecord[];
  /** Summary of `vision` for display. */
  visionSummary?: PostVisionSummary | null;
  /** Text vs screenshot disagreements on this post (text kept). */
  conflicts?: string[];
  /** Mine: the broker-CSV trade this post's trade was matched to (not inserted again). */
  linkedTradeId?: string | null;
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
  trades: ForumTrade[];
  /** Analysis notes (for the watchlist fold). */
  notes: DiscordNote[];
  review: ReviewItem[];
  stats: PairResult['stats'] & {
    posts: number; review: number; avgConfidence: number | null; firstAt: string | null; lastAt: string | null;
    /** Image attachments on the main author's posts (what vision would read). */
    images: number;
    /** Trades whose numbers came (partly) from screenshots. */
    fromScreenshots: number;
    duplicates: number;
  };
}

const SYMBOL_OK = /^[A-Z][A-Z0-9.]{0,9}$/;
const MIN_NOTE_CHARS = 12;

export function summarizeVision(records: VisionImageRecord[] | undefined): PostVisionSummary | null {
  if (!records?.length) return null;
  const ok = records.filter((r) => r.result);
  const charts = ok.map((r) => r.result!).filter((r) => r.kind === 'chart' && r.chart)
    .map((r) => ({ ticker: r.chart!.ticker, timeframe: r.chart!.timeframe, levels: r.chart!.levels, bias: r.chart!.bias, thesis: r.chart!.thesis }));
  const pnl = ok.map((r) => r.result!.statedPnl).find((x) => x) ?? null;
  return {
    images: records.length,
    read: ok.length,
    kinds: [...new Set(ok.map((r) => r.result!.kind))],
    trades: ok.reduce((s, r) => s + r.result!.trades.length, 0),
    charts,
    statedPnl: pnl,
    notes: ok.map((r) => r.result!.notes).filter((x): x is string => !!x).slice(0, 4),
  };
}

/** Image attachments of a message (what the vision pass reads). */
export const imageAttachments = (m: Pick<DiscordMsg, 'attachments'>) => m.attachments.filter((a) => a.isImage);

/**
 * One thread → notebook posts, trades (text + screenshot legs, FIFO round
 * trips — shared/forum-pairing.ts) and the review list. `vision` holds the
 * screenshot readings by message id (commit time); the preview passes none.
 */
export function buildThreadImport(
  thread: { id: string; name: string; guildId: string | null; ownerId: string | null },
  msgs: DiscordMsg[],
  opts: { vision?: Map<string, VisionImageRecord[]> } = {},
): ThreadImport {
  const sorted = [...msgs].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.id.localeCompare(b.id));
  const primary = primaryAuthor(sorted, thread.ownerId);
  const own = primary ? sorted.filter((m) => m.authorId === primary.authorId) : [];
  const parsed = new Map(sorted.map((m) => [m.id, parseDiscordMessage(m)]));

  // Legs: the text's reading merged with each screenshot's (text wins; conflicts flagged).
  const legs: ForumLeg[] = [];
  const updates: LegUpdate[] = [];
  const conflictsOf = new Map<string, string[]>();
  const visionReview = new Map<string, ReviewReason>();
  let images = 0;
  for (const m of own) {
    const p = parsed.get(m.id)!;
    images += imageAttachments(m).length;
    const recs = opts.vision?.get(m.id) ?? [];
    const vis: ForumLeg[] = [];
    recs.forEach((r, i) => {
      if (r.status === 'ok' && r.result) vis.push(...visionLegs(r.result, m, i));
      else if (r.status === 'low_confidence') visionReview.set(m.id, 'vision_low_confidence');
      else if (r.status === 'invalid' || r.status === 'error' || r.status === 'fetch_failed' || r.status === 'too_large' || r.status === 'unsupported') {
        if (!visionReview.has(m.id)) visionReview.set(m.id, 'vision_unreadable');
      }
    });
    const tl = textLeg(p);
    const merged = mergeMessageLegs(tl, vis);
    if (merged.conflicts.length) conflictsOf.set(m.id, merged.conflicts);
    legs.push(...merged.legs);
    if (!merged.legs.length && m.replyTo) updates.push({ messageId: m.id, time: m.timestamp, replyTo: m.replyTo, text: p.text || '(attachment)' });
  }
  const pair = pairForumLegs(legs, updates);
  const trades = pair.trades.map((t) => ({ ...t, authorId: primary?.authorId ?? '' }));

  const tradeOf = new Map<string, string>();
  for (const t of trades) for (const id of t.messageIds) if (!tradeOf.has(id)) tradeOf.set(id, t.key);
  const leftoverOf = new Map<string, Leftover>();
  for (const l of pair.leftovers) if (!leftoverOf.has(l.messageId)) leftoverOf.set(l.messageId, l);

  // Notes (watchlist fold): the main author's posts that are not trade legs.
  const notes: DiscordNote[] = [];
  let ignored = 0;
  for (const m of own) {
    if (tradeOf.has(m.id)) continue;
    const p = parsed.get(m.id)!;
    const lo = leftoverOf.get(m.id);
    const body = lo?.reason === 'unpriced_exit' ? lo.detail : p.text || m.content.trim();
    if (!lo && body.length < MIN_NOTE_CHARS && !m.attachments.length && !p.tickers.length) { ignored++; continue; }
    notes.push({
      messageId: m.id, authorId: m.authorId, postedAt: m.timestamp, day: discordDayKey(m.timestamp),
      symbols: lo?.symbol && !p.tickers.includes(lo.symbol) ? [lo.symbol, ...p.tickers] : p.tickers,
      body, attachments: m.attachments, reason: (lo?.reason ?? 'analysis') as DiscordNoteReason,
    });
  }

  const posts: ThreadPost[] = [];
  const review: ReviewItem[] = [];
  for (const m of sorted) {
    const text = m.content.trim();
    if (!text && !m.attachments.length) continue; // system rows (thread created, pins)
    const byTrader = !!primary && m.authorId === primary.authorId;
    const p = parsed.get(m.id)!;
    const link = discordMessageLink(thread.guildId, thread.id, m.id);
    let rr: ReviewReason | null = null;
    if (byTrader) {
      rr = reviewReasonOf(p, leftoverOf.get(m.id)?.reason ?? (tradeOf.has(m.id) ? 'trade' : null));
      if (!rr && conflictsOf.has(m.id)) rr = 'vision_conflict';
      if (!rr && visionReview.has(m.id) && !tradeOf.has(m.id)) rr = visionReview.get(m.id)!;
    }
    if (rr) review.push({ messageId: m.id, at: m.timestamp, reason: rr, excerpt: (p.text || leftoverOf.get(m.id)?.detail || '(screenshot)').slice(0, 200), link });
    const recs = byTrader ? opts.vision?.get(m.id) : undefined;
    const visionSymbols = (recs ?? []).flatMap((r) => [...(r.result?.trades.map((t) => t.ticker) ?? []), ...(r.result?.chart?.ticker ? [r.result.chart.ticker.toUpperCase()] : [])]);
    posts.push({
      messageId: m.id,
      postedAt: m.timestamp,
      day: discordDayKey(m.timestamp),
      body: text || '(attachment)',
      symbols: [...new Set([...p.tickers, ...visionSymbols])].filter((t) => SYMBOL_OK.test(t)).slice(0, 12),
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
        ...(recs?.length ? { vision: recs, visionSummary: summarizeVision(recs) } : {}),
        ...(conflictsOf.has(m.id) ? { conflicts: conflictsOf.get(m.id) } : {}),
      },
    });
  }
  const confs = trades.map((t) => t.confidence);
  return {
    primary,
    authors: discordAuthors(sorted),
    posts,
    trades,
    notes,
    review,
    stats: {
      messages: own.length,
      entries: pair.stats.entries, exits: pair.stats.exits, trims: pair.stats.trims,
      notes: notes.length, ignored, closedTrades: pair.stats.closedTrades, openTrades: pair.stats.openTrades,
      posts: posts.length,
      review: review.length,
      avgConfidence: confs.length ? Math.round((confs.reduce((s, x) => s + x, 0) / confs.length) * 100) / 100 : null,
      firstAt: sorted[0]?.timestamp ?? null,
      lastAt: sorted[sorted.length - 1]?.timestamp ?? null,
      images,
      fromScreenshots: trades.filter((t) => t.evidence !== 'text').length,
      duplicates: pair.duplicates.length,
    },
  };
}
