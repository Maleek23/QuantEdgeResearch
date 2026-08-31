import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function main() {
  const cols = await db.execute(sql.raw(`select column_name from information_schema.columns where table_name='options_flow_history' order by ordinal_position`));
  console.log('cols:', (cols.rows as any[]).map(r => r.column_name).join(','));
  const r = await db.execute(sql.raw(`select * from options_flow_history where symbol='MRNA' order by 1 limit 6`));
  for (const row of r.rows as any[]) console.log(JSON.stringify(row));
  const agg = await db.execute(sql.raw(`select min(detected_at) mn, max(detected_at) mx, count(*)::int c from options_flow_history where symbol='MRNA'`));
  console.log('MRNA flow range:', JSON.stringify(agg.rows[0]));

  // catalyst_events content
  const ce = await db.execute(sql.raw(`select * from catalyst_events limit 3`));
  console.log('catalyst_events sample:', JSON.stringify(ce.rows));
  const ceM = await db.execute(sql.raw(`select count(*)::int c from catalyst_events where symbol='MRNA'`));
  console.log('catalyst_events MRNA:', JSON.stringify(ceM.rows[0]));

  // watchlist
  const w = await db.execute(sql.raw(`select * from watchlist`));
  console.log('watchlist:', JSON.stringify(w.rows));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
