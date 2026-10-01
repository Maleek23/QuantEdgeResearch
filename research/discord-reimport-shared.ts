/**
 * Shared loader for research/discord-reimport-preview.ts and
 * research/discord-reimport-apply.ts — READS ONLY. Builds the repair plan
 * (shared/discord-reimport-plan.ts) for the trader books given on the command
 * line (default: femi ayo). See docs/DISCORD_IMPORT_FIX.md.
 */
import 'dotenv/config';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../server/db';
import { journalNotes, journalTrades, traders, traderWatchlistItems } from '../shared/schema';
import { traderOwnerId } from '../shared/journal-sources';
import { planBookRepair, type BookPlan } from '../shared/discord-reimport-plan';
import { visionMaxImages, type VisionImageRecord } from '../shared/forum-vision';
import { loadKnownTickers } from '../server/known-tickers';

export function slugsFromArgv(argv: string[]): string[] {
  const s = argv.filter((a) => !a.startsWith('--')).map((a) => a.toLowerCase());
  return s.length ? s : ['femi', 'ayo'];
}

export async function loadPlans(slugs: string[]): Promise<{ plans: BookPlan[]; universeSize: number | null; missing: string[] }> {
  const universe = await loadKnownTickers();
  const rows = await db.select().from(traders).where(inArray(traders.slug, slugs));
  const missing = slugs.filter((s) => !rows.some((r) => r.slug === s));

  // Every screenshot already read, in any book (the importer never re-bills these).
  const visionRows = await db.select({ meta: journalNotes.meta }).from(journalNotes)
    .where(and(eq(journalNotes.source, 'discord'), eq(journalNotes.reason, 'discord_post'), sql`${journalNotes.meta} ? 'vision'`));
  const cached = new Set<string>();
  for (const r of visionRows) for (const v of ((r.meta as any)?.vision ?? []) as VisionImageRecord[]) if (v?.attachmentId && v.result) cached.add(v.attachmentId);

  const plans: BookPlan[] = [];
  for (const slug of slugs) {
    const t = rows.find((r) => r.slug === slug);
    if (!t) continue;
    const owner = traderOwnerId(t.id);
    const notes = await db.select().from(journalNotes)
      .where(and(eq(journalNotes.ownerId, owner), eq(journalNotes.source, 'discord'), eq(journalNotes.reason, 'discord_post')));
    const watchlist = await db.select().from(traderWatchlistItems).where(eq(traderWatchlistItems.traderId, t.id));
    const trades = await db.select().from(journalTrades).where(and(eq(journalTrades.userId, owner), eq(journalTrades.broker, 'discord')));
    plans.push(planBookRepair({
      trader: { id: t.id, slug: t.slug, name: t.name, handle: t.handle, source: t.source, discordChannelId: t.discordChannelId, discordAuthorId: t.discordAuthorId },
      notes: notes.map((n) => ({ id: n.id, sourceMessageId: n.sourceMessageId, postedAt: n.postedAt, body: n.body, symbols: n.symbols, attachments: n.attachments, meta: n.meta as any })),
      watchlist: watchlist.map((w) => ({ id: w.id, symbol: w.symbol, note: w.note })),
      trades: trades.map((x) => ({ id: x.id, symbol: x.symbol, brokerOrderId: x.brokerOrderId, rawCsvRow: x.rawCsvRow as any })),
      universe,
      visionCap: visionMaxImages(process.env),
      cachedAttachmentIds: cached,
    }));
  }
  return { plans, universeSize: universe?.size ?? null, missing };
}
