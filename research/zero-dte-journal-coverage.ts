/**
 * 0DTE / INDEX JOURNAL COVERAGE — read-only. Every 0DTE / index play published
 * since the clean-era baseline (shared/zero-dte-journal.ts) vs what the NEXUS
 * ideas journal (desk book, unverified rows included — the route default) shows.
 *
 * Run: npx tsx research/zero-dte-journal-coverage.ts
 */
import { sql } from 'drizzle-orm';
import { db } from '../server/db';
import { loadJournal, resolveJournal } from '../server/journal-sources';
import { OUTCOME_BASELINE_DATE } from '../shared/constants';
import { isZeroDteJournalRow, zeroDteFamilyOf } from '../shared/zero-dte-journal';

type Agg = { total: number; shown: number; awaiting: number; missing: number; reasons: Map<string, number> };

async function main() {
  const r: any = await db.execute(sql`
    SELECT id, symbol, source, data_source_used, asset_type, expiry_date, timestamp, quality_signals
    FROM trade_ideas WHERE timestamp >= ${OUTCOME_BASELINE_DATE} AND status <> 'draft'`);
  const all = (r.rows ?? r) as any[];
  const zero = all.filter((i) => isZeroDteJournalRow({
    source: i.source, dataSourceUsed: i.data_source_used, assetType: i.asset_type,
    expiryDate: i.expiry_date, entryTime: i.timestamp, qualitySignals: i.quality_signals,
  }));
  const j = await resolveJournal({ userId: null, isAdmin: true }, 'desk' as any);
  const { rows, meta } = await loadJournal(j, { includeUnverified: true });
  const shown = new Set(rows.map((x: any) => String(x.id).replace(/^desk:/, '')));
  const excludedWhy = new Map((meta.excludedRows ?? []).map((x: any) => [String(x.id).replace(/^desk:/, ''), String(x.reason)]));
  const flagged = rows.filter((x: any) => x.zeroDte === true).length;
  const by = new Map<string, Agg>();
  for (const i of zero) {
    const fam = zeroDteFamilyOf({ source: i.source, dataSourceUsed: i.data_source_used, qualitySignals: i.quality_signals }) ?? `short_dated:${i.source}`;
    const a = by.get(fam) ?? { total: 0, shown: 0, awaiting: 0, missing: 0, reasons: new Map() };
    a.total++;
    if (shown.has(i.id)) a.shown++;
    else {
      const why = excludedWhy.get(i.id) ?? 'not in journal (filtered before mapping: exclude_from_training)';
      if (/awaiting entry/i.test(why)) a.awaiting++; else a.missing++;
      a.reasons.set(why, (a.reasons.get(why) ?? 0) + 1);
    }
    by.set(fam, a);
  }
  const tot = { total: 0, shown: 0, awaiting: 0, missing: 0 };
  for (const [fam, a] of [...by.entries()].sort((x, y) => y[1].total - x[1].total)) {
    tot.total += a.total; tot.shown += a.shown; tot.awaiting += a.awaiting; tot.missing += a.missing;
    console.log(`${fam.padEnd(28)} total ${a.total}  in journal ${a.shown}  awaiting-entry ${a.awaiting}  not shown ${a.missing}`);
    for (const [why, n] of a.reasons) console.log(`    ${n} × ${why}`);
  }
  console.log(`ALL 0DTE/index               total ${tot.total}  in journal ${tot.shown}  awaiting-entry ${tot.awaiting}  not shown ${tot.missing}`);
  console.log(`journal rows flagged zeroDte (0DTE chip): ${flagged}`);
  const target = all.find((i) => String(i.id).startsWith('8b2a688c'));
  if (target) console.log(`8b2a688c (SPY 770P): ${shown.has(target.id) ? 'IN journal' : `NOT in journal — ${excludedWhy.get(target.id) ?? 'filtered'}`}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
