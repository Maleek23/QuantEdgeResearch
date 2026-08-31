import { db, pool } from './server/db';
import { sql } from 'drizzle-orm';
(async () => {
  console.log((await db.execute(sql.raw(`SELECT symbol, status FROM paper_positions`))).rows);
  console.log('open ideas:', (await db.execute(sql.raw(`SELECT symbol, outcome_status FROM trade_ideas WHERE outcome_status='open'`))).rows.map((r:any)=>r.symbol).join(','));
  console.log('bullish_trends syms:', (await db.execute(sql.raw(`SELECT symbol FROM bullish_trends`))).rows.map((r:any)=>r.symbol).join(','));
  console.log('catalyst_events tickers:', (await db.execute(sql.raw(`SELECT DISTINCT ticker FROM catalyst_events`))).rows.map((r:any)=>r.ticker).join(','));
  console.log('8/25 attention symbols:', (await db.execute(sql.raw(`SELECT symbol, source, count(*) FROM attention_events WHERE occurred_at >= '2026-08-25' GROUP BY 1,2 ORDER BY 1`))).rows.length);
  console.log('8/25 nuclear attention:', (await db.execute(sql.raw(`SELECT symbol, source, event_type, occurred_at FROM attention_events WHERE occurred_at>='2026-08-25' AND symbol IN ('LEU','UEC','SMR','OKLO','CCJ','UUUU','NNE','DNN','URG','URA','BWXT')`))).rows);
  await pool.end();
})();
