import { db, pool } from './server/db';
import { sql } from 'drizzle-orm';
(async () => {
  const leu = await db.execute(sql`
    SELECT id, symbol, asset_type, direction, holding_period, entry_price, target_price,
           left(catalyst,60) catalyst, source, status, confidence_score, probability_band,
           outcome_status, percent_gain, timestamp
    FROM trade_ideas WHERE symbol='LEU' ORDER BY timestamp DESC LIMIT 40`);
  console.log('=== LEU ideas ALL TIME:', leu.rows.length);
  console.table(leu.rows);

  const stats = await db.execute(sql`SELECT count(*) total, min(timestamp) first, max(timestamp) last FROM trade_ideas`);
  console.log('=== trade_ideas stats', stats.rows);

  const recent = await db.execute(sql`
    SELECT symbol, count(*) n, max(timestamp) last, string_agg(DISTINCT direction, ',') dirs, string_agg(DISTINCT source,',') srcs
    FROM trade_ideas WHERE timestamp >= '2026-08-18' GROUP BY symbol ORDER BY n DESC`);
  console.log('=== ideas since 2026-08-18 by symbol:', recent.rows.length, 'symbols');
  console.table(recent.rows);

  const nuke = await db.execute(sql`
    SELECT symbol, direction, source, confidence_score, outcome_status, percent_gain, timestamp
    FROM trade_ideas WHERE symbol IN ('LEU','UEC','SMR','OKLO','CCJ','UUUU','NNE','DNN','URG','BWXT','URA')
      AND timestamp >= '2026-07-25' ORDER BY timestamp DESC LIMIT 80`);
  console.log('=== nuclear cohort 30d:', nuke.rows.length);
  console.table(nuke.rows);

  for (const t of ['catalysts','catalyst_events','market_data','watchlist','active_trades','paper_positions','sec_filings','pattern_signals','symbol_heat_scores','bullish_trends']) {
    try {
      const r = await db.execute(sql.raw(`SELECT count(*)::int n FROM ${t}`));
      console.log(`${t}: ${(r.rows[0] as any).n} rows`);
    } catch (e:any) { console.log(t, 'ERR', e.message); }
  }
  try {
    const md = await db.execute(sql.raw(`SELECT * FROM market_data WHERE symbol='LEU' ORDER BY 1 DESC LIMIT 5`));
    console.log('market_data LEU:', md.rows.length); console.table(md.rows);
  } catch(e:any){ console.log('md err', e.message); }
  await pool.end();
})();
