import { db } from './server/db';
import { sql } from 'drizzle-orm';
(async () => {
  const rx = await db.execute(sql`
    SELECT id, symbol, direction, asset_type, status, confidence_score, gen_conviction_score, gen_conviction_band,
           entry_price, timestamp, outcome_status, percent_gain, source, catalyst
    FROM trade_ideas WHERE symbol='RXRX' ORDER BY timestamp DESC LIMIT 20`);
  console.log('=== RXRX ideas all-time ===', JSON.stringify(rx.rows, null, 1));

  const perday = await db.execute(sql`
    SELECT DATE(timestamp) d, COUNT(*) n, COUNT(DISTINCT symbol) syms FROM trade_ideas
    WHERE timestamp > NOW() - INTERVAL '10 days' GROUP BY 1 ORDER BY 1 DESC`);
  console.log('=== per day ===', JSON.stringify(perday.rows));

  const recent = await db.execute(sql`
    SELECT symbol, direction, asset_type, source, status, gen_conviction_score, timestamp
    FROM trade_ideas WHERE timestamp >= '2026-08-24' ORDER BY timestamp DESC LIMIT 100`);
  console.log('=== since Aug 24 (n=' + recent.rows.length + ') ===', JSON.stringify(recent.rows, null, 1));

  const bio = await db.execute(sql`
    SELECT symbol, direction, timestamp FROM trade_ideas
    WHERE symbol IN ('XBI','IBB','LABU','MRNA','CRSP','BEAM','NTLA','EDIT','VKTX','HIMS','TEM','ABCL','NVAX','IMVT','GILD','VRTX','AMGN','REGN','LLY','PFE','XLV')
      AND timestamp > NOW() - INTERVAL '14 days' ORDER BY timestamp DESC LIMIT 40`);
  console.log('=== biotech complex 14d ===', JSON.stringify(bio.rows));

  for (const t of ['catalysts','catalyst_events','market_data','symbol_heat_scores','trade_diagnostics']) {
    try { const r = await db.execute(sql.raw(`SELECT COUNT(*) c FROM ${t}`)); console.log(t, JSON.stringify(r.rows)); } catch(e:any){ console.log(t,'ERR',e.message); }
  }
  const md = await db.execute(sql`SELECT COUNT(*) c, MAX(timestamp) m FROM market_data WHERE symbol='RXRX'`).catch((e:any)=>({rows:[{err:e.message}]}));
  console.log('market_data RXRX', JSON.stringify(md.rows));
  process.exit(0);
})().catch(e=>{console.error(e.message);process.exit(1)});
