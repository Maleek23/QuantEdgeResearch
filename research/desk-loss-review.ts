/**
 * DESK LOSS REVIEW — read-only. For NEXUS ideas CLOSED as losses on a day:
 * what the same position is worth now (marked with the journal's own quote
 * path, as if never closed), so "would holding have turned green?" gets a
 * measured answer. Also lists same-symbol/side/engine duplicates that day.
 *
 * Run (server): npx tsx research/desk-loss-review.ts [YYYY-MM-DD ET]
 */
import { loadJournal, resolveJournal } from '../server/journal-sources';
import { liveMarksFor } from '../server/journal-marks';

const etDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(iso));
const etTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });

async function main() {
  const day = process.argv[2] ?? etDay(new Date().toISOString());
  const j = await resolveJournal({ userId: null, isAdmin: true }, 'desk' as any);
  const rows = (await loadJournal(j)).rows as any[];
  const closedToday = rows.filter((r) => r.exitTime && etDay(r.exitTime) === day && String(r.status).toLowerCase() !== 'open');
  const losses = closedToday.filter((r) => Number(r.realizedPnL) < 0);
  const asOpen = losses.map((r) => ({ ...r, status: 'open' }));
  const marks = await liveMarksFor(asOpen as any, undefined, { concurrency: 4 });

  let lostTotal = 0, nowTotal = 0, greenNow = 0, marked = 0;
  console.log(`${day}: ${closedToday.length} closed, ${losses.length} losses\n`);
  for (const r of losses.sort((a, b) => Number(a.realizedPnL) - Number(b.realizedPnL))) {
    const m = marks[r.id];
    const lost = Number(r.realizedPnL);
    lostTotal += lost;
    const now = m?.unrealizedPnL ?? null;
    if (now != null) { marked++; nowTotal += now; if (now > 0) greenNow++; }
    const k = r.assetType === 'option' ? `${r.strikePrice}${String(r.optionType ?? '')[0]?.toUpperCase() ?? ''} ${String(r.expiryDate ?? '').slice(0, 10)}` : r.assetType;
    console.log(`${r.symbol.padEnd(6)} ${String(r.direction).padEnd(5)} ${k.padEnd(18)} ${String(r.setupType ?? '').padEnd(15)} in ${etTime(r.entryTime)} @ ${r.entryPrice} → out ${etTime(r.exitTime)} @ ${r.exitPrice}  closed ${lost.toFixed(2)}  | if held, now ${now == null ? 'no quote' : (now >= 0 ? '+' : '') + now.toFixed(2)}${m ? ` (${m.price}${m.delayed ? ' delayed' : ''} ${m.source})` : ''}`);
  }
  console.log(`\nclosed losses ${lostTotal.toFixed(2)} · same positions now ${nowTotal.toFixed(2)} (${marked}/${losses.length} priced) · ${greenNow} would be green now`);

  const groups = new Map<string, any[]>();
  for (const r of rows.filter((x) => etDay(x.entryTime) === day)) {
    const k = `${r.symbol}|${r.direction}|${r.setupType}|${r.assetType === 'option' ? `${r.strikePrice}${r.optionType}${String(r.expiryDate).slice(0, 10)}` : 'stock'}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }
  console.log('\nDUPLICATES (same symbol, side, engine, instrument, opened same day):');
  for (const [k, rs] of groups) if (rs.length > 1) console.log(`  ${k} ×${rs.length}: ` + rs.map((r) => `${etTime(r.entryTime)} @${r.entryPrice} ${String(r.status)} ${r.realizedPnL ?? ''}`).join(' · '));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
