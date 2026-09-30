/**
 * Repair exitDate on ideas the 2026-09-30 backlog sweep stamped with the sweep
 * time instead of when price actually hit (see server/lib/exit-date-repair.ts).
 *
 *   npx tsx scripts/repair-exit-dates.ts                      # DRY RUN (default) — prints the plan, writes nothing
 *   npx tsx scripts/repair-exit-dates.ts --apply              # writes the 'update' rows
 *   npx tsx scripts/repair-exit-dates.ts --since 2026-09-30T12:40:00Z
 *   npx tsx scripts/repair-exit-dates.ts --fixture path.json  # offline: { rows, bars: { SYM: Candle[] } } — never touches a DB
 *   add --json to print the plan as JSON
 *
 * Uses DATABASE_URL (server/db). Idempotent: repaired rows are tagged
 * [exit-time:…] and their exitDate moves before --since, so a re-run skips them.
 * Each UPDATE is guarded on the old exitDate, so a row the live tracker touched
 * in between is left alone. Rows without bar evidence are listed, never guessed.
 */
import fs from 'node:fs';
import { planRepairs, formatRepairTable, DEFAULT_REPAIR_SINCE, type RepairRow, type BarSupplier } from '../server/lib/exit-date-repair';

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const val = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const apply = flag('--apply');
const since = val('--since') ?? DEFAULT_REPAIR_SINCE;
const fixture = val('--fixture');

async function main() {
  let rows: RepairRow[];
  let getBars: BarSupplier;
  let db: any = null, tradeIdeas: any = null, drizzle: any = null;

  if (fixture) {
    if (apply) throw new Error('--fixture is offline; --apply is not allowed with it');
    const fx = JSON.parse(fs.readFileSync(fixture, 'utf8'));
    rows = fx.rows;
    getBars = async (r) => ({ bars: fx.bars?.[r.symbol.toUpperCase()] ?? [], interval: fx.interval ?? '5m' });
  } else {
    ({ db } = await import('../server/db'));
    ({ tradeIdeas } = await import('@shared/schema'));
    drizzle = await import('drizzle-orm');
    const { barsSinceEntry } = await import('../server/lib/exit-time-bars');
    const { and, gte, inArray } = drizzle;
    rows = await db.select({
      id: tradeIdeas.id, symbol: tradeIdeas.symbol, assetType: tradeIdeas.assetType, direction: tradeIdeas.direction,
      source: tradeIdeas.source, entryPrice: tradeIdeas.entryPrice, targetPrice: tradeIdeas.targetPrice,
      stopLoss: tradeIdeas.stopLoss, timestamp: tradeIdeas.timestamp, outcomeStatus: tradeIdeas.outcomeStatus,
      resolutionReason: tradeIdeas.resolutionReason, exitDate: tradeIdeas.exitDate, exitPrice: tradeIdeas.exitPrice,
      percentGain: tradeIdeas.percentGain, predictionValidatedAt: tradeIdeas.predictionValidatedAt,
      outcomeNotes: tradeIdeas.outcomeNotes, exitBy: tradeIdeas.exitBy, expiryDate: tradeIdeas.expiryDate,
      entryValidUntil: tradeIdeas.entryValidUntil, convergenceSignalsJson: tradeIdeas.convergenceSignalsJson,
    }).from(tradeIdeas).where(and(
      inArray(tradeIdeas.outcomeStatus, ['hit_target', 'hit_stop', 'expired']),
      // exitDate is text with an offset; a coarse string bound, exact filter in the planner.
      gte(tradeIdeas.exitDate, since.slice(0, 10)),
    ));
    getBars = (r, entryMs) => barsSinceEntry(r.symbol, r.assetType, entryMs);
  }

  const plans = await planRepairs(rows, getBars, { since });
  if (flag('--json')) console.log(JSON.stringify(plans, null, 2));
  else console.log(formatRepairTable(plans));
  console.log(`\nmode: ${fixture ? 'fixture (offline)' : apply ? 'APPLY' : 'dry run — pass --apply to write'} · since ${since}`);

  if (!apply || fixture) return;
  const { and, eq } = drizzle;
  let written = 0, raced = 0;
  for (const p of plans) {
    if (p.action !== 'update' || !p.set) continue;
    const res = await db.update(tradeIdeas).set(p.set)
      .where(and(eq(tradeIdeas.id, p.id), eq(tradeIdeas.exitDate, p.oldExitDate)))
      .returning({ id: tradeIdeas.id });
    if (res.length) written++; else raced++;
  }
  console.log(`applied: ${written} row(s) updated${raced ? ` · ${raced} skipped (exitDate changed since planning)` : ''}`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
