import { db } from './server/db';
import { sql } from 'drizzle-orm';
(async () => {
  const perday = await db.execute(sql`
    SELECT LEFT(timestamp,10) d, COUNT(*) n, COUNT(DISTINCT symbol) syms FROM trade_ideas
    GROUP BY 1 ORDER BY 1 DESC LIMIT 12`);
  console.log('=== per day ===', JSON.stringify(perday.rows));

  const recent = await db.execute(sql`
    SELECT symbol, direction, asset_type, source, status, gen_conviction_score, gen_conviction_band, timestamp
    FROM trade_ideas WHERE timestamp >= '2026-08-24' ORDER BY timestamp DESC LIMIT 120`);
  console.log('=== since Aug 24 (n=' + recent.rows.length + ') ===');
  for (const r of recent.rows as any[]) console.log(`${r.timestamp} ${r.symbol} ${r.direction} ${r.asset_type} src=${r.source} st=${r.status} conv=${r.gen_conviction_score}/${r.gen_conviction_band}`);

  const bio = await db.execute(sql`
    SELECT symbol, direction, timestamp FROM trade_ideas
    WHERE symbol IN ('XBI','IBB','LABU','MRNA','CRSP','BEAM','NTLA','EDIT','VKTX','HIMS','TEM','ABCL','NVAX','IMVT','GILD','VRTX','AMGN','REGN','LLY','PFE','XLV')
      AND timestamp >= '2026-08-11' ORDER BY timestamp DESC LIMIT 40`);
  console.log('=== biotech complex since Aug 11 ===', JSON.stringify(bio.rows));

  for (const t of ['catalysts','catalyst_events','symbol_heat_scores','trade_diagnostics','market_data','symbol_behavior_profiles']) {
    try { const r = await db.execute(sql.raw(`SELECT COUNT(*) c FROM ${t}`)); console.log(t, JSON.stringify(r.rows)); } catch(e:any){ console.log(t,'ERR',e.message); }
  }
  for (const t of ['market_data','trade_diagnostics','symbol_heat_scores','catalysts']) {
    try { const r = await db.execute(sql.raw(`SELECT COUNT(*) c FROM ${t} WHERE symbol='RXRX'`)); console.log(t+' RXRX', JSON.stringify(r.rows)); } catch(e:any){ console.log(t+' RXRX','ERR',e.message); }
  }
  process.exit(0);
})().catch(e=>{console.error(e.message);process.exit(1)});
