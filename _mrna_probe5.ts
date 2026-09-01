import { db } from './server/db';
import { sql } from 'drizzle-orm';
async function main() {
  const q = await db.execute(sql.raw(`select symbol, direction, asset_type, timestamp, data_source_used, confidence_score, option_type, strike_price from trade_ideas where data_source_used='options_flow' order by timestamp`));
  for (const r of q.rows as any[]) console.log(JSON.stringify(r));
  const t = await db.execute(sql.raw(`select data_source_used, count(*)::int c from trade_ideas group by 1 order by 2 desc`));
  console.log('sources:', JSON.stringify(t.rows));
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
