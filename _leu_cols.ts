import { db, pool } from './server/db';
import { sql } from 'drizzle-orm';
(async () => {
  const c = await db.execute(sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='trade_ideas' ORDER BY ordinal_position`);
  console.log(c.rows.map((r:any)=>r.column_name+':'+r.data_type).join('\n'));
  const t = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1`);
  console.log('\nTABLES:', t.rows.map((r:any)=>r.table_name).join(', '));
  await pool.end();
})();
