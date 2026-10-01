/**
 * Repair plan for trader books imported before the author-attribution fix
 * (fix/discord-import-attribution, 2026-09-30). Pure: rows in, plan out.
 *
 * Used by research/discord-reimport-preview.ts (prints it, read-only) and
 * research/discord-reimport-apply.ts (executes it behind --apply). See
 * docs/DISCORD_IMPORT_FIX.md.
 *
 * Per trader book (femi, ayo):
 *   · each forum thread stored in the book → messages per author, the RESOLVED
 *     main author (resolvePrimaryAuthor with the trader as target), and the
 *     author the old import used (whoever is flagged byTrader today)
 *   · screenshots the re-import will read for the resolved author: exact count,
 *     already-read count, cost estimate (shared/forum-vision.ts)
 *   · handle / discord_author_id corrections (traderPatchFor)
 *   · junk watchlist rows (shared/ticker-stoplist.ts)
 *   · note re-links: byTrader flipped to the resolved author; parse/review/trade
 *     links cleared on rows that turn out to be comments; jargon symbols dropped
 *   · discord trades whose source message was written by someone else (the
 *     re-import removes them as stale; listed here so nobody is surprised)
 */
import type { DiscordMsg } from './discord-journal-parser';
import { parseDiscordMessage } from './discord-journal-parser';
import { authorTargetFor, resolvePrimaryAuthor, traderPatchFor, type ResolvedAuthor, type TraderRowLike } from './discord-forum';
import { attachmentIdOf, estimateVisionCost, type VisionCostEstimate } from './forum-vision';
import { filterTickers, isJunkWatchSymbol, type TickerUniverse } from './ticker-stoplist';

export interface PlanTrader extends TraderRowLike { id: string; slug: string; name: string }
export interface PlanNote {
  id: string;
  sourceMessageId: string | null;
  postedAt: string | Date | null;
  body: string;
  symbols: string[] | null;
  attachments: { url: string; name?: string; isImage?: boolean }[] | null;
  meta: Record<string, any> | null;
}
export interface PlanWatchRow { id: string; symbol: string; note: string | null }
export interface PlanTrade { id: string; symbol: string; brokerOrderId: string | null; rawCsvRow: Record<string, any> | null }

export interface ThreadPlan {
  threadId: string;
  threadName: string;
  authors: { authorId: string; authorName: string; messages: number; images: number }[];
  /** Who the old import treated as the journal author (byTrader=true today). */
  oldAuthor: { authorId: string; authorName: string; messages: number } | null;
  resolved: ResolvedAuthor | null;
  changed: boolean;
  images: number;
  imagesCached: number;
  cost: VisionCostEstimate;
}

export interface NoteFix {
  id: string;
  byTrader: { from: boolean; to: boolean } | null;
  symbols: { from: string[]; to: string[] } | null;
  /** parse/review/tradeKey cleared because the row is a comment now. */
  clearedParse: boolean;
  meta: Record<string, any>;
}

export interface BookPlan {
  slug: string;
  traderId: string;
  threads: ThreadPlan[];
  /** The book's main author (resolved author of its biggest thread). */
  primary: ResolvedAuthor | null;
  traderPatch: Partial<TraderRowLike>;
  handle: { from: string | null; to: string } | null;
  junkWatchlist: { id: string; symbol: string }[];
  noteFixes: NoteFix[];
  wrongAuthorTrades: { id: string; symbol: string; authorName: string | null }[];
  images: number;
  imagesCached: number;
  cost: VisionCostEstimate;
}

const isImage = (a: { url: string; name?: string; isImage?: boolean }) =>
  a.isImage ?? /\.(png|jpe?g|gif|webp)(\?|$)/i.test(a.name || a.url);

export function planBookRepair(input: {
  trader: PlanTrader;
  notes: PlanNote[];
  watchlist: PlanWatchRow[];
  trades: PlanTrade[];
  universe: TickerUniverse;
  visionCap?: number;
  /** Attachment ids already read in ANY book (re-imports never re-bill). */
  cachedAttachmentIds?: ReadonlySet<string>;
}): BookPlan {
  const { trader, universe } = input;
  const discord = input.notes.filter((n) => n.meta?.kind === 'discord_post' && n.meta?.threadId);
  const byThread = new Map<string, PlanNote[]>();
  for (const n of discord) {
    const k = String(n.meta!.threadId);
    byThread.set(k, [...(byThread.get(k) ?? []), n]);
  }
  const target = authorTargetFor(trader.slug, trader);
  const cachedIds = new Set<string>(input.cachedAttachmentIds ?? []);
  for (const n of discord) for (const v of (n.meta?.vision ?? []) as any[]) if (v?.attachmentId && v.result) cachedIds.add(v.attachmentId);

  const threads: ThreadPlan[] = [];
  const resolvedOf = new Map<string, ResolvedAuthor | null>();
  for (const [threadId, rows] of byThread) {
    const msgs: DiscordMsg[] = rows.map((n) => ({
      id: n.sourceMessageId ?? n.id,
      timestamp: new Date(n.postedAt ?? 0).toISOString(),
      authorId: String(n.meta!.authorId ?? ''),
      authorName: String(n.meta!.authorName ?? ''),
      content: n.body,
      attachments: (n.attachments ?? []).map((a) => ({ url: a.url, name: a.name ?? '', isImage: isImage(a) })),
      replyTo: n.meta!.replyTo ?? null,
    }));
    msgs.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.id.localeCompare(b.id));
    const resolved = resolvePrimaryAuthor(msgs, { ownerId: null, target });
    resolvedOf.set(threadId, resolved);
    const authors = new Map<string, { authorId: string; authorName: string; messages: number; images: number }>();
    for (const m of msgs) {
      const e = authors.get(m.authorId) ?? { authorId: m.authorId, authorName: m.authorName, messages: 0, images: 0 };
      e.messages++;
      e.images += m.attachments.filter((a) => a.isImage).length;
      authors.set(m.authorId, e);
    }
    const flagged = rows.filter((n) => n.meta!.byTrader === true);
    const oldId = flagged[0]?.meta!.authorId ?? null;
    const oldAuthor = oldId ? { authorId: String(oldId), authorName: String(flagged[0].meta!.authorName ?? ''), messages: authors.get(String(oldId))?.messages ?? 0 } : null;
    const own = resolved ? msgs.filter((m) => m.authorId === resolved.authorId).flatMap((m) => m.attachments.filter((a) => a.isImage)) : [];
    const imagesCached = own.filter((a) => { const id = attachmentIdOf(a.url); return !!id && cachedIds.has(id); }).length;
    threads.push({
      threadId, threadName: String(rows[0].meta!.threadName ?? ''),
      authors: [...authors.values()].sort((a, b) => b.messages - a.messages),
      oldAuthor, resolved, changed: !!resolved && oldAuthor?.authorId !== resolved.authorId,
      images: own.length, imagesCached,
      cost: estimateVisionCost(own.length, { cached: imagesCached, cap: input.visionCap }),
    });
  }
  threads.sort((a, b) => b.authors.reduce((s, x) => s + x.messages, 0) - a.authors.reduce((s, x) => s + x.messages, 0));

  const primary = threads[0]?.resolved ?? null;
  const allNames = threads.flatMap((t) => t.authors.map((a) => a.authorName));
  const traderPatch = traderPatchFor(trader, primary, threads[0]?.threadId ?? '', allNames);
  // The channel id is the importer's to fill; this repair only corrects identity.
  delete traderPatch.discordChannelId;
  delete traderPatch.source;

  const noteFixes: NoteFix[] = [];
  for (const n of discord) {
    const resolved = resolvedOf.get(String(n.meta!.threadId));
    const meta = { ...n.meta! };
    const to = !!resolved && meta.authorId === resolved.authorId;
    const from = meta.byTrader === true;
    let clearedParse = false;
    if (from !== to) {
      meta.byTrader = to;
      if (!to && (meta.parsed || meta.review || meta.tradeKey)) {
        meta.parsed = null; meta.review = null; meta.tradeKey = null;
        clearedParse = true;
      }
    }
    const before = n.symbols ?? [];
    const p = parseDiscordMessage({ id: n.id, timestamp: new Date(n.postedAt ?? 0).toISOString(), authorId: '', authorName: '', content: n.body, attachments: [], replyTo: null });
    const explicit = new Set([...p.explicitTickers, ...((meta.vision ?? []) as any[]).flatMap((v) => [
      ...(v?.result?.trades ?? []).map((t: any) => String(t.ticker ?? '').toUpperCase()),
      ...(v?.result?.chart?.ticker ? [String(v.result.chart.ticker).toUpperCase()] : []),
    ])]);
    const after = filterTickers(before, universe, explicit);
    const symChanged = after.length !== before.length || after.some((s, i) => s !== before[i]);
    if (from !== to || symChanged) {
      noteFixes.push({ id: n.id, byTrader: from !== to ? { from, to } : null, symbols: symChanged ? { from: before, to: after } : null, clearedParse, meta });
    }
  }

  const authorOfMsg = new Map(discord.map((n) => [n.sourceMessageId ?? n.id, { id: String(n.meta!.authorId ?? ''), name: String(n.meta!.authorName ?? '') }]));
  const wrongAuthorTrades = input.trades.flatMap((t) => {
    const raw = t.rawCsvRow ?? {};
    if (raw.source !== 'discord-forum') return [];
    const resolved = resolvedOf.get(String(raw.threadId ?? ''));
    const first = (raw.messageIds ?? [])[0] ?? (t.brokerOrderId ?? '').replace(/^discord:/, '');
    const a = authorOfMsg.get(first);
    if (!resolved || !a || a.id === resolved.authorId) return [];
    return [{ id: t.id, symbol: t.symbol, authorName: a.name || null }];
  });

  const images = threads.reduce((s, t) => s + t.images, 0);
  const imagesCached = threads.reduce((s, t) => s + t.imagesCached, 0);
  return {
    slug: trader.slug, traderId: trader.id, threads, primary, traderPatch,
    handle: traderPatch.handle ? { from: trader.handle, to: traderPatch.handle } : null,
    junkWatchlist: input.watchlist.filter((w) => isJunkWatchSymbol(w.symbol, universe)).map((w) => ({ id: w.id, symbol: w.symbol })),
    noteFixes, wrongAuthorTrades, images, imagesCached,
    cost: estimateVisionCost(images, { cached: imagesCached, cap: input.visionCap }),
  };
}

/** Human-readable plan (the dry-run's output). */
export function formatBookPlan(p: BookPlan): string {
  const L: string[] = [];
  L.push(`== ${p.slug} (trader ${p.traderId})`);
  for (const t of p.threads) {
    L.push(`  thread "${t.threadName}" (${t.threadId})`);
    for (const a of t.authors) L.push(`    ${a.authorId === t.resolved?.authorId ? '*' : ' '} ${a.authorName.padEnd(24)} ${String(a.messages).padStart(5)} msgs  ${String(a.images).padStart(5)} images  (${a.authorId})`);
    L.push(`    resolved author: ${t.resolved ? `${t.resolved.authorName} (${t.resolved.authorId}) via ${t.resolved.via}, ${Math.round(t.resolved.share * 100)}% of messages` : 'none'}`);
    L.push(`    old import used: ${t.oldAuthor ? `${t.oldAuthor.authorName} (${t.oldAuthor.authorId})` : 'nobody flagged'}${t.changed ? '  <- CHANGES' : ''}`);
    L.push(`    screenshots to read: ${t.images} (${t.imagesCached} already read) -> ${t.cost.billable} billable, est $${t.cost.usd.toFixed(2)}`);
  }
  L.push(`  handle: ${p.handle ? `"${p.handle.from ?? ''}" -> "${p.handle.to}"` : 'unchanged'}`);
  L.push(`  discord_author_id: ${p.traderPatch.discordAuthorId ? `-> ${p.traderPatch.discordAuthorId}` : 'unchanged'}`);
  L.push(`  junk watchlist rows to remove (${p.junkWatchlist.length}): ${p.junkWatchlist.map((w) => w.symbol).join(' ') || '-'}`);
  const flips = p.noteFixes.filter((f) => f.byTrader);
  const sym = p.noteFixes.filter((f) => f.symbols);
  L.push(`  notes re-linked: ${flips.filter((f) => f.byTrader!.to).length} become the trader's posts, ${flips.filter((f) => !f.byTrader!.to).length} become comments (${p.noteFixes.filter((f) => f.clearedParse).length} parse/review links cleared)`);
  const dropped = new Map<string, number>();
  for (const f of sym) for (const s of f.symbols!.from) if (!f.symbols!.to.includes(s)) dropped.set(s, (dropped.get(s) ?? 0) + 1);
  L.push(`  note symbols cleaned on ${sym.length} rows; dropped: ${[...dropped.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([s, n]) => `${s} ${n}`).join(', ') || '-'}`);
  L.push(`  discord trades from another author's message (re-import removes them): ${p.wrongAuthorTrades.map((t) => `${t.symbol} by ${t.authorName ?? '?'}`).join(', ') || 'none'}`);
  L.push(`  TOTAL screenshots for re-import: ${p.images} (${p.imagesCached} already read) -> ${p.cost.billable} billable, est $${p.cost.usd.toFixed(2)} (${p.cost.basis})`);
  return L.join('\n');
}
