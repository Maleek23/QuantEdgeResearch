import { db } from './server/db';
import { sql } from 'drizzle-orm';
async function main(){
  const r = await db.execute(sql`SELECT symbol, direction, timestamp, LEFT(catalyst,90) catalyst, COUNT(*) OVER () total
    FROM trade_ideas WHERE data_source_used='tradier' ORDER BY timestamp LIMIT 12`);
  console.log('--- data_source_used=tradier sample ---'); console.table(r.rows);
  const g = await db.execute(sql`SELECT LEFT(catalyst, 55) c, COUNT(*) n FROM trade_ideas WHERE data_source_used='tradier' GROUP BY 1 ORDER BY n DESC LIMIT 12`);
  console.table(g.rows);
  const f = await db.execute(sql`SELECT symbol, direction, timestamp, LEFT(catalyst,80) catalyst FROM trade_ideas WHERE data_source_used='options_flow' ORDER BY timestamp LIMIT 8`);
  console.log('--- options_flow ---'); console.table(f.rows);
  const bt = await db.execute(sql`SELECT symbol, direction, timestamp, LEFT(catalyst,80) catalyst FROM trade_ideas WHERE data_source_used IN ('bullish_trend','surge_detection') ORDER BY timestamp LIMIT 20`);
  console.log('--- bullish_trend / surge ---'); console.table(bt.rows);
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
