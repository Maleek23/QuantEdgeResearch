/**
 * DRY RUN ONLY — proposes (never applies) trade_ideas repairs from the ledger
 * research/verify-nexus-book.ts wrote. No database connection is opened.
 *
 *   npx tsx research/repair-nexus-book-dryrun.ts --ledger /tmp/nexus-book-verify.json --out /tmp/nexus-book-repair.sql
 *
 * The journal already stops counting these rows (display/computation only), so
 * a repair is optional. The proposal is deliberately non-destructive: it does
 * not rewrite a recorded premium or outcome; it tags the row
 * ([book-audit:<class>] in outcome_notes) and sets exclude_from_training so
 * every model surface drops it too. Each UPDATE is guarded on the recorded
 * values it was computed from, so it is a no-op if the row changed since.
 * Review, then run inside a transaction by hand — this script stops here.
 */
import fs from 'node:fs';

const argv = process.argv.slice(2);
const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const LEDGER = arg('--ledger') ?? '/tmp/nexus-book-verify.json';
const OUT = arg('--out') ?? '/tmp/nexus-book-repair.sql';

/** Classes where the recorded outcome itself is invalid (not just imprecise). */
export const REPAIRABLE = new Set([
  'premium_scale_ladder', 'impossible_exit_premium', 'impossible_entry_premium', 'fill_off_strike_scale',
  'synthetic_or_retroactive', 'never_triggered', 'exit_premium_not_traded', 'exit_price_not_traded', 'barrier_never_touched',
]);

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
const trades: any[] = Array.isArray(ledger?.trades) ? ledger.trades : [];
const pick = trades.filter((t) => t.verdict === 'MISMATCH' && REPAIRABLE.has(t.bugClass));
const lines = [
  `-- NEXUS book repair PROPOSAL (dry run) from ${LEDGER} generated ${ledger.generatedAt}`,
  `-- ${pick.length} of ${trades.length} verified trades; recorded total of these: ${pick.reduce((s, t) => s + (t.recordedPnL ?? 0), 0).toFixed(2)}`,
  '-- NOT APPLIED. Review each row, then run by hand inside BEGIN; ... COMMIT;',
  '',
];
for (const t of pick) {
  const tag = `[book-audit:${t.bugClass}] recorded ${t.recordedPnL} vs recomputed ${t.recomputedPnL ?? 'n/a'} (${ledger.generatedAt?.slice(0, 10)})`;
  lines.push(`-- ${t.symbol} ${t.optionType ?? t.assetType} ${t.strike ?? ''} exit ${t.exitDayET} · ${t.reason?.slice(0, 160)}`);
  lines.push(`UPDATE trade_ideas SET exclude_from_training = true, outcome_notes = COALESCE(outcome_notes, '') || ${q('\n' + tag)}`
    + ` WHERE id = ${q(t.id)} AND outcome_status = ${q(String(t.outcomeStatus))}`
    + (t.assetType === 'option' && t.recordedExit != null ? ` AND abs(coalesce(exit_premium, -1) - ${Number(t.recordedExit)}) < 0.006` : '')
    + ` AND position('[book-audit:' in coalesce(outcome_notes, '')) = 0;`);
}
fs.writeFileSync(OUT, lines.join('\n') + '\n');
console.log(`DRY RUN: proposed ${pick.length} UPDATE(s) → ${OUT} (nothing applied; no DB connection opened)`);
const by = new Map<string, number>();
for (const t of pick) by.set(t.bugClass, (by.get(t.bugClass) ?? 0) + 1);
for (const [k, n] of by) console.log(`  ${String(n).padStart(4)}  ${k}`);
