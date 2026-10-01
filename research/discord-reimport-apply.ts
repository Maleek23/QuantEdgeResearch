/**
 * APPLY the Discord forum author-attribution repair — WRITES to the database,
 * but only with --apply (without it, it prints the plan and exits like the
 * preview). Calls no model and sends nothing to Discord. Idempotent: a second
 * run finds nothing to change.
 *
 *   npx tsx research/discord-reimport-apply.ts              # plan only (femi + ayo)
 *   npx tsx research/discord-reimport-apply.ts --apply      # write
 *   npx tsx research/discord-reimport-apply.ts femi --apply
 *
 * What it writes, per book, in one transaction:
 *   traders               handle → the resolved author's Discord name (only when
 *                         the current handle is empty or another Discord name
 *                         from the thread — an admin-typed handle is kept);
 *                         discord_author_id → the resolved author id
 *   trader_watchlist_items  junk rows deleted (chart jargon / English caps /
 *                         not in the ticker universe: CES HOLY LTF SHIT)
 *   journal_notes         meta.byTrader re-linked to the resolved author; rows
 *                         that become comments lose parse/review/trade links;
 *                         jargon symbols dropped from `symbols`
 * It does NOT delete journal_trades (the re-import's stale-row pass removes
 * trades written from another author's message) and does NOT read screenshots.
 * docs/DISCORD_IMPORT_FIX.md.
 */
import { eq, inArray } from 'drizzle-orm';
import { db } from '../server/db';
import { journalNotes, traders, traderWatchlistItems } from '../shared/schema';
import { formatBookPlan } from '../shared/discord-reimport-plan';
import { loadPlans, slugsFromArgv } from './discord-reimport-shared';

(async () => {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const { plans, universeSize, missing } = await loadPlans(slugsFromArgv(args));
  console.log(`${apply ? 'APPLY' : 'PLAN ONLY (add --apply to write)'} — ${new Date().toISOString()}`);
  console.log(`ticker universe: ${universeSize == null ? 'COLD' : `${universeSize} symbols`}`);
  if (missing.length) console.log(`no trader row for: ${missing.join(', ')}`);
  for (const p of plans) console.log(`\n${formatBookPlan(p)}`);
  if (!apply) { console.log('\nNothing written.'); process.exit(0); }
  if (universeSize == null) {
    console.error('\nRefusing to apply with a cold ticker universe (server/data/liquid-universe.json missing): junk detection would rest on the stop-lists alone. Run from the app directory on the droplet.');
    process.exit(3);
  }

  for (const p of plans) {
    await db.transaction(async (tx) => {
      const patch: Record<string, unknown> = {};
      if (p.traderPatch.handle) patch.handle = p.traderPatch.handle;
      if (p.traderPatch.discordAuthorId) patch.discordAuthorId = p.traderPatch.discordAuthorId;
      if (Object.keys(patch).length) await tx.update(traders).set(patch).where(eq(traders.id, p.traderId));
      if (p.junkWatchlist.length) await tx.delete(traderWatchlistItems).where(inArray(traderWatchlistItems.id, p.junkWatchlist.map((w) => w.id)));
      for (const f of p.noteFixes) {
        const set: Record<string, unknown> = { meta: f.meta };
        if (f.symbols) set.symbols = f.symbols.to.length ? f.symbols.to : null;
        await tx.update(journalNotes).set(set).where(eq(journalNotes.id, f.id));
      }
    });
    console.log(`\n${p.slug}: wrote handle/author ${p.traderPatch.handle || p.traderPatch.discordAuthorId ? 'yes' : 'no change'}, removed ${p.junkWatchlist.length} watchlist rows, re-linked ${p.noteFixes.length} notes.`);
  }
  // The running server's trader-analysis cache is in another process; it refreshes on its own TTL
  // (and the re-import invalidates it).
  console.log('\nDone. Next: Journal → Import → Discord forum (bot) → check the preview → Import. See docs/DISCORD_IMPORT_FIX.md.');
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
