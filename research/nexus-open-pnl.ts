/**
 * NEXUS OPEN P&L — read-only: every open NEXUS idea (desk book, clean era),
 * marked live with the same code the journal uses (server/journal-marks.ts).
 * Answers "how many in play are green vs red right now", overall, opened
 * today, by engine, and for one symbol.
 *
 * Sizing is the journal's: 1 contract per option idea, $1,000 notional per
 * stock/crypto idea. Unmarked rows (no quote) are counted, never assumed 0.
 *
 * Run (server): npx tsx research/nexus-open-pnl.ts [SYMBOL]
 */
import { loadJournal, resolveJournal } from '../server/journal-sources';
import { liveMarksFor } from '../server/journal-marks';

const focus = (process.argv[2] ?? 'GOOG').toUpperCase();

async function main() {
  const j = await resolveJournal({ userId: null, isAdmin: true }, 'desk' as any);
  const rows = (await loadJournal(j)).rows as any[];
  const open = rows.filter((r) => String(r.status).toLowerCase() === 'open');
  const marks = await liveMarksFor(open as any, undefined, { concurrency: 4 });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  const dayOf = (r: any) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(r.entryTime));

  type Agg = { n: number; green: number; red: number; flat: number; unmarked: number; pnl: number; gain: number; loss: number };
  const agg = (): Agg => ({ n: 0, green: 0, red: 0, flat: 0, unmarked: 0, pnl: 0, gain: 0, loss: 0 });
  const add = (a: Agg, r: any) => {
    a.n++;
    const u = marks[r.id]?.unrealizedPnL;
    if (u == null || !Number.isFinite(u)) { a.unmarked++; return; }
    a.pnl += u;
    if (u > 0) { a.green++; a.gain += u; } else if (u < 0) { a.red++; a.loss += u; } else a.flat++;
  };
  const all = agg(), todayA = agg(), older = agg();
  const bySrc = new Map<string, Agg>();
  for (const r of open) {
    add(all, r);
    add(dayOf(r) === today ? todayA : older, r);
    const k = String(r.setupType ?? r.source ?? 'unknown');
    if (!bySrc.has(k)) bySrc.set(k, agg());
    add(bySrc.get(k)!, r);
  }
  const f = (a: Agg) => `${a.n} open · ${a.green} green / ${a.red} red / ${a.flat} flat / ${a.unmarked} unmarked · live ${a.pnl >= 0 ? '+' : ''}$${a.pnl.toFixed(2)} (green +$${a.gain.toFixed(2)}, red $${a.loss.toFixed(2)})`;
  console.log(`as of ${new Date().toISOString()} · ET day ${today}`);
  console.log(`ALL      ${f(all)}`);
  console.log(`TODAY    ${f(todayA)}`);
  console.log(`EARLIER  ${f(older)}`);
  console.log('BY ENGINE');
  for (const [k, a] of [...bySrc].sort((x, y) => y[1].n - x[1].n)) console.log(`  ${k.padEnd(18)} ${f(a)}`);
  console.log(`\n${focus} rows (open + closed today):`);
  for (const r of rows.filter((x) => String(x.symbol).toUpperCase().startsWith(focus.slice(0, 4)) && (String(x.status).toLowerCase() === 'open' || dayOf(x) === today))) {
    const m = marks[r.id];
    console.log(`  ${r.symbol} ${r.direction} ${r.assetType}${r.optionType ? ` ${r.strikePrice}${String(r.optionType)[0]} ${String(r.expiryDate).slice(0, 10)}` : ''} · ${r.setupType ?? ''} · opened ${new Date(r.entryTime).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} @ ${r.entryPrice} · ${String(r.status)}` +
      (m ? ` · now ${m.price} (${m.source}${m.delayed ? ', delayed' : ''}) · ${m.unrealizedPnL! >= 0 ? '+' : ''}$${m.unrealizedPnL} (${m.unrealizedPct}%)` : r.netPnl != null && String(r.status).toLowerCase() !== 'open' ? ` · closed ${r.netPnl}` : ' · no mark'));
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
