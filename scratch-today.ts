import { db } from './server/db';
import { sql } from 'drizzle-orm';
async function main() {
  const r = await db.execute(sql`
    SELECT symbol, direction, timestamp, source, data_source_used, confidence_score, catalyst, LEFT(analysis, 220) as analysis
    FROM trade_ideas WHERE timestamp >= '2026-08-25T16:30' AND timestamp < '2026-08-25T16:40' ORDER BY timestamp`);
  console.table(r.rows);
  const b = await db.execute(sql`
    SELECT source, data_source_used, COUNT(*) n, MIN(timestamp) first, MAX(timestamp) last
    FROM trade_ideas WHERE timestamp >= '2026-08-25' GROUP BY 1,2 ORDER BY n DESC`);
  console.log('\n=== today by source ==='); console.table(b.rows);
  const c = await db.execute(sql`
    SELECT source, data_source_used, COUNT(*) n FROM trade_ideas WHERE timestamp < '2026-08-25' GROUP BY 1,2 ORDER BY n DESC`);
  console.log('\n=== Aug 24 by source ==='); console.table(c.rows);
  const d = await db.execute(sql`SELECT DISTINCT symbol FROM trade_ideas WHERE timestamp >= '2026-08-25' ORDER BY symbol`);
  console.log('\n=== distinct symbols today ===', d.rows.map((x:any)=>x.symbol).join(', '));
  const e = await db.execute(sql`SELECT DISTINCT symbol FROM trade_ideas WHERE timestamp < '2026-08-25' ORDER BY symbol`);
  console.log('\n=== distinct symbols Aug 24 ===', e.rows.map((x:any)=>x.symbol).join(', '));
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
