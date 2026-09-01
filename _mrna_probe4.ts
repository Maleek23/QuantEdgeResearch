import { db } from './server/db';
import { sql } from 'drizzle-orm';
async function main() {
  const ceM = await db.execute(sql.raw(`select count(*)::int c from catalyst_events where ticker='MRNA'`));
  console.log('catalyst_events MRNA:', JSON.stringify(ceM.rows[0]));
  const types = await db.execute(sql.raw(`select event_type, count(*)::int c from catalyst_events group by 1 order by 2 desc`));
  console.log('catalyst_events types:', JSON.stringify(types.rows));
  const tick = await db.execute(sql.raw(`select ticker, count(*)::int c from catalyst_events group by 1 order by 2 desc limit 20`));
  console.log('catalyst_events tickers:', JSON.stringify(tick.rows));
  const w = await db.execute(sql.raw(`select * from watchlist`));
  console.log('watchlist:', JSON.stringify(w.rows));
  // MRNA flow on Aug24 morning
  const f = await db.execute(sql.raw(`select detected_at, option_type, strike_price, unusual_score, total_premium, sentiment, flow_type, underlying_price, volume_oi_ratio from options_flow_history where symbol='MRNA' and detected_date='2026-08-24' order by detected_at limit 25`));
  console.log('MRNA Aug24 flows:'); for (const r of f.rows as any[]) console.log(JSON.stringify(r));
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
