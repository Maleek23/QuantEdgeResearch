import { db } from './server/db';
import { tradeIdeas, catalysts } from './shared/schema';
import { sql, desc } from 'drizzle-orm';

async function main() {
  // 1. SMTC ideas last 7 days (and ever)
  const smtcAll = await db.execute(sql`
    SELECT id, symbol, asset_type, direction, holding_period, entry_price, target_price,
           source, status, confidence_score, probability_band, outcome_status, percent_gain,
           catalyst, timestamp
    FROM trade_ideas WHERE symbol = 'SMTC' ORDER BY timestamp DESC LIMIT 20
  `);
  console.log('=== SMTC ideas ALL TIME (top 20) ===', smtcAll.rows.length);
  console.table(smtcAll.rows);

  const smtc7 = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM trade_ideas
    WHERE symbol='SMTC' AND timestamp >= (NOW() - INTERVAL '7 days')::text
  `);
  console.log('SMTC ideas in last 7 days:', JSON.stringify(smtc7.rows));

  // 2. Overall idea volume last 7 days
  const recent = await db.execute(sql`
    SELECT DATE(timestamp::timestamptz) AS d, COUNT(*)::int AS n
    FROM trade_ideas
    WHERE timestamp::timestamptz >= NOW() - INTERVAL '10 days'
    GROUP BY 1 ORDER BY 1 DESC
  `);
  console.log('=== ideas per day, last 10 days ===');
  console.table(recent.rows);

  const bySymbol = await db.execute(sql`
    SELECT symbol, direction, source, COUNT(*)::int AS n, MAX(timestamp) AS last_ts
    FROM trade_ideas
    WHERE timestamp::timestamptz >= NOW() - INTERVAL '7 days'
    GROUP BY 1,2,3 ORDER BY n DESC LIMIT 60
  `);
  console.log('=== symbols with ideas last 7d ===', bySymbol.rows.length);
  console.table(bySymbol.rows);

  // 3. catalysts table
  const cat = await db.execute(sql`SELECT COUNT(*)::int AS n FROM catalysts`);
  console.log('catalysts row count:', JSON.stringify(cat.rows));
  const catSmtc = await db.execute(sql`SELECT * FROM catalysts WHERE symbol='SMTC' LIMIT 10`);
  console.log('catalysts for SMTC:', catSmtc.rows.length);

  // 4. Total ideas ever + latest timestamp
  const tot = await db.execute(sql`SELECT COUNT(*)::int AS n, MAX(timestamp) AS latest FROM trade_ideas`);
  console.log('trade_ideas total:', JSON.stringify(tot.rows));

  process.exit(0);
}
main().catch(e => { console.error('ERR', e); process.exit(1); });
