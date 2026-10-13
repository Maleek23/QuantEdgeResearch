/**
 * Offline learning-loop run (no DB connection): scorecard + re-fit from a JSON
 * export of trade_ideas (camelCase LedgerIdea rows, e.g. a read-only psql
 * json_agg) and the two research ledgers.
 *
 *   NEXUS_BOOK_VERIFY_LEDGER=… MANAGED_REPLAY_LEDGER=… \
 *     npx tsx research/learning-loop-offline.ts ideas.json [out-dir]
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildLedgerRow, type LedgerIdea } from '../shared/learning-ledger';
import { buildScorecard, refit } from '../shared/learning-loop';
import { OUTCOME_BASELINE_DATE } from '../shared/constants';
import { loadDeskVerifyLedger } from '../server/desk-verify-ledger';
import { loadManagedLedger } from '../server/managed-replay-ledger';

const [file, outDir] = process.argv.slice(2);
if (!file) { console.error('usage: learning-loop-offline.ts ideas.json [out-dir]'); process.exit(2); }
const ideas = JSON.parse(fs.readFileSync(file, 'utf8')) as LedgerIdea[];
const verify = loadDeskVerifyLedger();
const replay = loadManagedLedger();
const rows = ideas.map((i) => buildLedgerRow(i, {
  verdictOf: (id) => verify?.byId.get(id)?.verdict ?? null,
  replayOf: (id) => { const e = replay?.byId.get(id); return e ? { call: e.call.result, managedR: e.managed.status === 'closed' ? e.managed.rMultiple : null } : null; },
}));
const sc = buildScorecard(rows, OUTCOME_BASELINE_DATE);
const rf = refit(rows);
if (outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'learning-ledger.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(path.join(outDir, 'learning-scorecard.json'), JSON.stringify(sc, null, 1));
  fs.writeFileSync(path.join(outDir, 'learning-refit.json'), JSON.stringify(rf, null, 1));
}
const f = (x: number | null | undefined, d = 2) => (x == null ? '—' : x.toFixed(d));
const line = (label: string, s: { n: number; winRate: number | null; ci: { lo: number; hi: number } | null; expectancyR: number | null; pnl500: number; pnl1000: number }) =>
  `${label.padEnd(28)} n=${String(s.n).padStart(4)}  win ${s.winRate == null ? '—' : (s.winRate * 100).toFixed(0).padStart(3) + '%'} [${s.ci ? `${(s.ci.lo * 100).toFixed(0)}–${(s.ci.hi * 100).toFixed(0)}%` : '—'}]  E ${f(s.expectancyR).padStart(6)}R  $500 ${String(Math.round(s.pnl500)).padStart(7)}  $1k ${String(Math.round(s.pnl1000)).padStart(7)}`;
console.log(`verification ledger: ${verify ? verify.asOf : 'MISSING'} · managed replay: ${replay ? replay.asOf : 'MISSING'}`);
console.log(`population: ${JSON.stringify(sc.population)}`);
console.log(line('OVERALL', sc.overall));
console.log(line('  premium basis (options)', sc.byBasis.premium));
console.log(line('  underlying basis', sc.byBasis.underlying));
for (const [dim, slices] of Object.entries(sc.slices)) {
  console.log(`\n— ${dim}`);
  for (const s of slices) console.log(line(`  ${s.value}`, s) + (s.reportable ? '' : '  (n<30)'));
}
console.log(`\ndrift flags (${sc.drift.length}):`);
for (const d of sc.drift) console.log(`  ${d.dim}=${d.value}: ${d.note}`);
console.log(`\nre-fit: ${rf.tested} candidates · decided ${rf.universe.decided} · median day ${rf.universe.medianDay}`);
for (const [fam, x] of Object.entries(rf.byFamily)) {
  const b = x.best;
  console.log(`  ${fam.padEnd(9)} tested ${x.tested} · universe ${x.universe} · accepted ${x.accepted}` + (b ? ` · best ${b.label}: A ${f(b.candidate.A.expR)} vs ${f(b.incumbent.A.expR)} (n ${b.candidate.A.n}), B ${f(b.candidate.B.expR)} vs ${f(b.incumbent.B.expR)} (n ${b.candidate.B.n}), folds ${b.folds.beat}/${b.folds.evaluable} — ${b.why}` : ''));
}
console.log(`challenger: ${rf.challenger ? rf.challenger.id : 'none'}`);
