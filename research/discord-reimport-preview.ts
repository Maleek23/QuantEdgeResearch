/**
 * DRY RUN — READ-ONLY. Prints what the Discord forum author-attribution repair
 * would change for the given trader books (default: femi ayo). Writes nothing,
 * calls no model, sends nothing to Discord.
 *
 *   npx tsx research/discord-reimport-preview.ts            # femi + ayo
 *   npx tsx research/discord-reimport-preview.ts femi --json
 *
 * Per book: each forum thread's messages per author, the resolved main author
 * (vs the author the old import used), screenshots the re-import will read with
 * the cost estimate, handle / discord_author_id changes, junk watchlist rows,
 * note re-links, and discord trades written from someone else's message.
 * docs/DISCORD_IMPORT_FIX.md.
 */
import { formatBookPlan } from '../shared/discord-reimport-plan';
import { loadPlans, slugsFromArgv } from './discord-reimport-shared';

(async () => {
  const args = process.argv.slice(2);
  if (args.includes('--apply')) {
    console.error('This is the read-only preview. Use research/discord-reimport-apply.ts --apply to write.');
    process.exit(2);
  }
  const { plans, universeSize, missing } = await loadPlans(slugsFromArgv(args));
  if (args.includes('--json')) {
    console.log(JSON.stringify({ universeSize, missing, plans: plans.map((p) => ({ ...p, noteFixes: p.noteFixes.map(({ meta: _m, ...f }) => f) })) }, null, 2));
    process.exit(0);
  }
  console.log(`DRY RUN — nothing is written. ${new Date().toISOString()}`);
  console.log(`ticker universe: ${universeSize == null ? 'COLD (stop-lists only — junk rows may be under-counted)' : `${universeSize} symbols`}`);
  if (missing.length) console.log(`no trader row for: ${missing.join(', ')}`);
  for (const p of plans) console.log(`\n${formatBookPlan(p)}`);
  const imgs = plans.reduce((s, p) => s + p.cost.billable, 0);
  const usd = plans.reduce((s, p) => s + p.cost.usd, 0);
  console.log(`\nALL BOOKS: ${imgs} billable screenshots on re-import, est $${usd.toFixed(2)} (billed only when the operator clicks Import).`);
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
