/**
 * Find best upside whale contracts and analyze auto-generated confidence
 */

import 'dotenv/config';
import { db } from './server/db';
import { tradeIdeas } from './shared/schema';
import { desc, eq, and, sql } from 'drizzle-orm';

async function analyzeWhaleUpside() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🐋 BEST UPSIDE WHALE CONTRACTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Get all whale flows with upside calculation
  const whales = await db.execute(sql`
    SELECT
      symbol,
      option_type,
      strike_price,
      expiry_date,
      entry_price,
      target_price,
      stop_loss,
      premium_per_contract,
      is_mega_whale,
      flow_size,
      grade,
      confidence_score,
      direction,
      detected_at,
      outcome_status,
      (target_price - entry_price) / entry_price * 100 as percent_upside,
      (target_price - entry_price) / NULLIF(entry_price - stop_loss, 0) as risk_reward
    FROM whale_flows
    WHERE outcome_status = 'open'
    ORDER BY percent_upside DESC
    LIMIT 15
  `);

  console.log(`📊 Top ${whales.rows.length} Whale Flows by Upside:\n`);

  whales.rows.forEach((whale: any, idx) => {
    const daysToExpiry = whale.expiry_date
      ? Math.floor((new Date(whale.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : 0;

    const upside = whale.percent_upside?.toFixed(1) || 'N/A';
    const rr = whale.risk_reward?.toFixed(2) || 'N/A';
    const mega = whale.is_mega_whale ? '🐋 MEGA' : '🐳';
    const contractProfit = ((whale.target_price || 0) - (whale.entry_price || 0)) * 100;

    console.log(`${idx + 1}. ${whale.symbol} ${whale.option_type?.toUpperCase()} $${whale.strike_price} (${whale.expiry_date})`);
    console.log(`   ${mega} | Grade ${whale.grade} | Confidence: ${whale.confidence_score}%`);
    console.log(`   Cost: $${whale.entry_price?.toFixed(2)} ($${whale.premium_per_contract?.toLocaleString()}/contract)`);
    console.log(`   Target: $${whale.target_price?.toFixed(2)} (+${upside}% upside = +$${contractProfit.toFixed(0)}/contract)`);
    console.log(`   R:R: ${rr}:1 | DTE: ${daysToExpiry}d | Detected: ${new Date(whale.detected_at).toLocaleDateString()}\n`);
  });

  // Now check the auto-generated "flow" trades and their actual performance
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⚠️  AUTO-GENERATED "FLOW" TRADES - VALIDATION CHECK');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Get stats on "flow" source trades
  const flowStats = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN outcome_status = 'won' THEN 1 END) as wins,
      COUNT(CASE WHEN outcome_status = 'lost' THEN 1 END) as losses,
      COUNT(CASE WHEN outcome_status = 'open' THEN 1 END) as open_positions,
      AVG(confidence_score) as avg_confidence,
      AVG(CASE WHEN outcome_status = 'won' THEN percent_gain END) as avg_win,
      AVG(CASE WHEN outcome_status = 'lost' THEN percent_gain END) as avg_loss
    FROM trade_ideas
    WHERE source = 'flow'
  `);

  const stats = flowStats.rows[0];
  const totalClosed = (stats.wins || 0) + (stats.losses || 0);
  const winRate = totalClosed > 0 ? ((stats.wins || 0) / totalClosed * 100).toFixed(1) : 'N/A';

  console.log('📊 "FLOW" SOURCE PERFORMANCE:\n');
  console.log(`Total Trades: ${stats.total}`);
  console.log(`Open: ${stats.open_positions} | Closed: ${totalClosed}`);
  console.log(`Win Rate: ${winRate}% (${stats.wins}W / ${stats.losses}L)`);
  console.log(`Avg Confidence: ${stats.avg_confidence?.toFixed(1)}%`);

  if (totalClosed > 0) {
    console.log(`Avg Win: +${stats.avg_win?.toFixed(2)}%`);
    console.log(`Avg Loss: ${stats.avg_loss?.toFixed(2)}%`);

    const expectancy = ((stats.avg_win || 0) * ((stats.wins || 0) / totalClosed)) +
                      ((stats.avg_loss || 0) * ((stats.losses || 0) / totalClosed));
    console.log(`Expectancy: ${expectancy.toFixed(2)}%`);
  } else {
    console.log('⚠️  NO CLOSED POSITIONS YET - Cannot validate confidence scores!');
  }

  // Check recent flow trade outcomes
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📈 RECENT "FLOW" TRADE OUTCOMES:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const recentFlow = await db
    .select()
    .from(tradeIdeas)
    .where(eq(tradeIdeas.source, 'flow'))
    .orderBy(desc(tradeIdeas.timestamp))
    .limit(20);

  const won = recentFlow.filter(t => t.outcomeStatus === 'won');
  const lost = recentFlow.filter(t => t.outcomeStatus === 'lost');
  const open = recentFlow.filter(t => t.outcomeStatus === 'open');

  console.log(`Recent 20 Flow Trades: ${won.length} wins, ${lost.length} losses, ${open.length} open\n`);

  if (won.length > 0) {
    console.log('✅ WINNERS:');
    won.forEach(t => {
      console.log(`   ${t.symbol} ${t.assetType} → +${t.percentGain?.toFixed(2)}% (Conf: ${t.confidenceScore}%)`);
    });
  }

  if (lost.length > 0) {
    console.log('\n❌ LOSERS:');
    lost.forEach(t => {
      console.log(`   ${t.symbol} ${t.assetType} → ${t.percentGain?.toFixed(2)}% (Conf: ${t.confidenceScore}%)`);
    });
  }

  if (open.length > 0) {
    console.log('\n⏳ STILL OPEN (top 5):');
    open.slice(0, 5).forEach(t => {
      console.log(`   ${t.symbol} ${t.assetType} - Conf: ${t.confidenceScore}% (${new Date(t.timestamp).toLocaleDateString()})`);
    });
  }

  // Compare confidence scores vs actual outcomes
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 CONFIDENCE SCORE ACCURACY:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const confidenceBuckets = await db.execute(sql`
    SELECT
      CASE
        WHEN confidence_score >= 90 THEN '90-100%'
        WHEN confidence_score >= 80 THEN '80-89%'
        WHEN confidence_score >= 70 THEN '70-79%'
        ELSE 'Below 70%'
      END as confidence_bucket,
      COUNT(*) as total,
      COUNT(CASE WHEN outcome_status = 'won' THEN 1 END) as wins,
      COUNT(CASE WHEN outcome_status = 'lost' THEN 1 END) as losses
    FROM trade_ideas
    WHERE source = 'flow' AND outcome_status IN ('won', 'lost')
    GROUP BY confidence_bucket
    ORDER BY confidence_bucket DESC
  `);

  if (confidenceBuckets.rows.length > 0) {
    confidenceBuckets.rows.forEach((bucket: any) => {
      const total = bucket.wins + bucket.losses;
      const actualWinRate = total > 0 ? (bucket.wins / total * 100).toFixed(1) : 'N/A';
      console.log(`${bucket.confidence_bucket} Confidence:`);
      console.log(`   Expected: ~${bucket.confidence_bucket.split('-')[0]}`);
      console.log(`   Actual: ${actualWinRate}% (${bucket.wins}W / ${bucket.losses}L out of ${total} closed)`);
      console.log('');
    });
  } else {
    console.log('⚠️  No closed trades to validate confidence accuracy!');
    console.log('\nThe 70-89% confidence scores are THEORETICAL - not backed by performance data yet.');
  }

  console.log('\n✅ Analysis complete!\n');
}

analyzeWhaleUpside().catch(console.error).finally(() => process.exit(0));
