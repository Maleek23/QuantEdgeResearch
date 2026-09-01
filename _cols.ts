import { db } from './server/db';
import { sql } from 'drizzle-orm';
(async () => {
  const c = await db.execute(sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='trade_ideas' ORDER BY ordinal_position`);
  console.log(c.rows.map((r:any)=>r.column_name).join(', '));
  const t = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1`);
  console.log('TABLES:', t.rows.map((r:any)=>r.table_name).join(', '));
  process.exit(0);
})().catch(e=>{console.error(e.message);process.exit(1)});
