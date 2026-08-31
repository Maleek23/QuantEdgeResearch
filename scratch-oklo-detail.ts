import { db } from './server/db';
import { sql } from 'drizzle-orm';
async function main() {
  const r = await db.execute(sql`SELECT * FROM trade_ideas WHERE symbol='OKLO' ORDER BY timestamp`);
  for (const row of r.rows) {
    const clean: any = {};
    for (const [k,v] of Object.entries(row)) if (v !== null && v !== undefined && v !== false && v !== 0) clean[k]=v;
    console.log('\n================ IDEA ================');
    console.dir(clean, {depth:4, maxStringLength: 900});
  }
  // catalysts table columns
  const t = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name ILIKE '%catalyst%'`);
  console.log('\ncatalyst tables:', t.rows);
  const c2 = await db.execute(sql`SELECT COUNT(*) n FROM catalysts`);
  console.log('catalysts count', c2.rows);
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
