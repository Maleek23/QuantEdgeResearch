import { db } from './server/db';
import { tradeIdeas } from './shared/schema';
import { sql } from 'drizzle-orm';

async function main() {
  // 1. RXRX ideas in last 7 days
  const rx = await db.execute(sql`
    SELECT id, symbol, direction, asset_type, status, confidence, conviction_grade,
           entry_price, current_price, created_at, thesis, outcome
    FROM trade_ideas
    WHERE symbol = 'RXRX' AND created_at > NOW() - INTERVAL '30 days'
    ORDER BY created_at DESC LIMIT 30
  `);
  console.log('=== RXRX ideas (30d) ===', JSON.stringify(rx.rows, null, 2));

  const rxAll = await db.execute(sql`SELECT COUNT(*) c, MAX(created_at) last FROM trade_ideas WHERE symbol='RXRX'`);
  console.log('=== RXRX all-time ===', JSON.stringify(rxAll.rows));

  // 2. What DID it generate last 7 days
  const recent = await db.execute(sql`
    SELECT DATE(created_at) d, COUNT(*) n, COUNT(DISTINCT symbol) syms
    FROM trade_ideas WHERE created_at > NOW() - INTERVAL '7 days'
    GROUP BY 1 ORDER BY 1 DESC
  `);
  console.log('=== ideas per day (7d) ===', JSON.stringify(recent.rows));

  const aug25 = await db.execute(sql`
    SELECT symbol, direction, asset_type, status, confidence, created_at
    FROM trade_ideas WHERE created_at >= '2026-08-24' ORDER BY created_at DESC LIMIT 80
  `);
  console.log('=== ideas since Aug 24 ===', JSON.stringify(aug25.rows, null, 1));

  // healthcare/biotech ideas at all
  const bio = await db.execute(sql`
    SELECT symbol, direction, created_at FROM trade_ideas
    WHERE symbol IN ('XBI','IBB','LABU','MRNA','CRSP','BEAM','NTLA','EDIT','VKTX','HIMS','TEM','ABCL','NVAX','IMVT','GILD','VRTX','AMGN','REGN','LLY','PFE')
      AND created_at > NOW() - INTERVAL '14 days' ORDER BY created_at DESC LIMIT 40
  `);
  console.log('=== biotech-complex ideas (14d) ===', JSON.stringify(bio.rows));

  // catalysts table
  try {
    const cat = await db.execute(sql`SELECT COUNT(*) c FROM catalysts`);
    console.log('=== catalysts rows ===', JSON.stringify(cat.rows));
  } catch (e: any) { console.log('catalysts err', e.message); }

  process.exit(0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
