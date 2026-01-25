/**
 * Check if suggested LEAPS have real whale flow backing
 */

import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function checkWhaleFlows() {
  console.log('\n🐋 WHALE FLOW DATA - Institutional Backing\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Get all whale flows
  const allWhales = await db.execute(sql`
    SELECT
      symbol,
      option_type,
      strike_price,
      expiry_date,
      entry_price,
      target_price,
      premium_per_contract,
      is_mega_whale,
      flow_size,
      grade,
      confidence_score,
      direction,
      detected_at,
      outcome_status
    FROM whale_flows
    ORDER BY detected_at DESC
    LIMIT 20
  `);

  console.log(`📊 Recent ${allWhales.rows.length} Whale Flows:\n`);

  allWhales.rows.forEach((whale: any, idx) => {
    const daysAgo = Math.floor((Date.now() - new Date(whale.detected_at).getTime()) / (1000 * 60 * 60 * 24));
    const mega = whale.is_mega_whale ? '🐋 MEGA WHALE' : '🐳 Whale';
    const status = whale.outcome_status === 'won' ? '✅' : whale.outcome_status === 'lost' ? '❌' : '⏳';

    console.log(`${idx + 1}. ${status} ${whale.symbol} ${whale.option_type?.toUpperCase()} $${whale.strike_price} - ${whale.expiry_date}`);
    console.log(`   ${mega} | Size: ${whale.flow_size} | Grade: ${whale.grade}`);
    console.log(`   Entry: $${whale.entry_price?.toFixed(2)} → Target: $${whale.target_price?.toFixed(2)}`);
    console.log(`   Premium: $${whale.premium_per_contract?.toLocaleString()}/contract`);
    console.log(`   Confidence: ${whale.confidence_score}% | Detected: ${daysAgo}d ago\n`);
  });

  // Check if suggested LEAPS match whale flows
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 VALIDATING SUGGESTED LEAPS:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const suggestedLeaps = ['XLE', 'KMI', 'LAC', 'NIO', 'F', 'WULF', 'DVN', 'BBAI', 'S', 'AMC'];

  for (const symbol of suggestedLeaps) {
    const whaleData = await db.execute(sql`
      SELECT * FROM whale_flows
      WHERE symbol = ${symbol}
      ORDER BY detected_at DESC
    `);

    if (whaleData.rows.length > 0) {
      console.log(`✅ ${symbol}: ${whaleData.rows.length} whale flow(s) detected`);
      whaleData.rows.forEach((w: any) => {
        const mega = w.is_mega_whale ? '🐋 MEGA' : '🐳';
        console.log(`   ${mega} ${w.option_type?.toUpperCase()} $${w.strike_price} - ${w.grade} grade - $${w.premium_per_contract?.toLocaleString()}/contract`);
      });
      console.log('');
    } else {
      console.log(`❌ ${symbol}: NO whale flow data\n`);
    }
  }

  // Stats on whale flow performance
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📈 WHALE FLOW HISTORICAL PERFORMANCE:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const closed = await db.execute(sql`
    SELECT * FROM whale_flows
    WHERE outcome_status IN ('won', 'lost')
  `);

  if (closed.rows.length > 0) {
    const won = closed.rows.filter((w: any) => w.outcome_status === 'won');
    const lost = closed.rows.filter((w: any) => w.outcome_status === 'lost');
    const winRate = (won.length / closed.rows.length * 100).toFixed(1);
    const avgPnL = closed.rows.reduce((sum: number, w: any) => sum + (w.final_pnl || 0), 0) / closed.rows.length;

    console.log(`Total Closed: ${closed.rows.length}`);
    console.log(`Win Rate: ${winRate}% (${won.length}W / ${lost.length}L)`);
    console.log(`Avg P&L: ${avgPnL.toFixed(2)}%`);
    console.log(`\nRecent Winners:`);
    won.slice(0, 5).forEach((w: any) => {
      console.log(`  ✅ ${w.symbol} ${w.option_type?.toUpperCase()} $${w.strike_price} → +${w.final_pnl?.toFixed(2)}%`);
    });
  } else {
    console.log('No closed whale flows yet');
  }
}

checkWhaleFlows().catch(console.error).finally(() => process.exit(0));
