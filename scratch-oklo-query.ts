import { db } from './server/db';
import { tradeIdeas } from './shared/schema';
import { sql, and, gte, eq } from 'drizzle-orm';

async function main() {
  // 1. OKLO ideas ever
  const oklo = await db.execute(sql`
    SELECT id, symbol, asset_type, direction, entry_price, target_price, timestamp,
           outcome_status, percent_gain, source, confidence_score, probability_band, catalyst
    FROM trade_ideas WHERE symbol = 'OKLO' ORDER BY timestamp DESC LIMIT 50
  `);
  console.log('=== OKLO ideas (all time) ===', oklo.rows.length);
  console.table(oklo.rows);

  // 2. Last 7 days all ideas
  const recent = await db.execute(sql`
    SELECT symbol, asset_type, direction, timestamp, source, outcome_status, confidence_score
    FROM trade_ideas
    WHERE timestamp >= '2026-08-18'
    ORDER BY timestamp DESC
  `);
  console.log('\n=== Ideas since 2026-08-18 ===', recent.rows.length);
  console.table(recent.rows.slice(0, 80));

  // 3. Most recent idea overall
  const last = await db.execute(sql`SELECT symbol, timestamp, source FROM trade_ideas ORDER BY timestamp DESC LIMIT 10`);
  console.log('\n=== Most recent 10 ideas overall ===');
  console.table(last.rows);

  // 4. total count + date range
  const stats = await db.execute(sql`SELECT COUNT(*) as n, MIN(timestamp) as first, MAX(timestamp) as last FROM trade_ideas`);
  console.log('\n=== trade_ideas stats ===', stats.rows);

  // 5. nuclear peers
  const peers = await db.execute(sql`
    SELECT symbol, direction, timestamp, source, outcome_status FROM trade_ideas
    WHERE symbol IN ('UEC','SMR','LEU','CCJ','NNE','UUUU','DNN','URG','URA','BWXT','NXE','LTBR')
    AND timestamp >= '2026-08-01' ORDER BY timestamp DESC LIMIT 60
  `);
  console.log('\n=== Nuclear peer ideas since Aug 1 ===', peers.rows.length);
  console.table(peers.rows);

  // 6. catalysts table
  try {
    const cat = await db.execute(sql`SELECT COUNT(*) as n FROM catalysts`);
    console.log('\n=== catalysts row count ===', cat.rows);
  } catch (e: any) { console.log('catalysts table error:', e.message); }

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
