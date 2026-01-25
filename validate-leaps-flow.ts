/**
 * Validate LEAPS with flow data and directional signals
 */

import 'dotenv/config';
import { db } from './server/db';
import { tradeIdeas } from './shared/schema';
import { desc, eq, and, gte, sql, lte } from 'drizzle-orm';

async function validateLeapsFlow() {
  console.log('\n🔍 Validating LEAPS with Flow Data & Directional Signals...\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const ninetyDaysFromNow = new Date();
  ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

  // Get cheap LEAPS with full details
  const cheapLeaps = await db
    .select()
    .from(tradeIdeas)
    .where(
      and(
        eq(tradeIdeas.assetType, 'option'),
        eq(tradeIdeas.outcomeStatus, 'open'),
        gte(tradeIdeas.confidenceScore, 70),
        sql`${tradeIdeas.expiryDate} > ${ninetyDaysFromNow.toISOString()}`,
        gte(tradeIdeas.entryPrice, 0.50),
        lte(tradeIdeas.entryPrice, 2.00)
      )
    )
    .orderBy(desc(tradeIdeas.confidenceScore))
    .limit(10);

  console.log(`📊 Analyzing ${cheapLeaps.length} LEAPS with detailed flow data:\n`);

  for (const leap of cheapLeaps) {
    const daysToExpiry = leap.expiryDate
      ? Math.floor((new Date(leap.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : 0;

    const contractCost = (leap.entryPrice || 0) * 100;
    const percentGain = leap.targetPrice && leap.entryPrice
      ? ((leap.targetPrice - leap.entryPrice) / leap.entryPrice * 100).toFixed(1)
      : 'N/A';

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎯 ${leap.symbol} ${leap.optionType?.toUpperCase()} $${leap.strikePrice} - ${leap.expiryDate ? new Date(leap.expiryDate).toLocaleDateString() : 'N/A'}`);
    console.log(`${'='.repeat(60)}`);

    // Basic info
    console.log(`\n📈 POSITION DETAILS:`);
    console.log(`   Direction: ${leap.direction?.toUpperCase()} (${leap.optionType?.toUpperCase()})`);
    console.log(`   Entry: $${leap.entryPrice?.toFixed(2)}/share ($${contractCost.toFixed(0)}/contract)`);
    console.log(`   Target: $${leap.targetPrice?.toFixed(2)}/share (+${percentGain}%)`);
    console.log(`   Stop: $${leap.stopLoss?.toFixed(2)}/share`);
    console.log(`   Days to Expiry: ${daysToExpiry}`);

    // Confidence & validation
    console.log(`\n🎲 CONFIDENCE & VALIDATION:`);
    console.log(`   Confidence Score: ${leap.confidenceScore}%`);
    console.log(`   Validation Status: ${leap.validationStatus || 'N/A'}`);
    console.log(`   Source: ${leap.source}`);
    console.log(`   Timestamp: ${new Date(leap.timestamp).toLocaleString()}`);

    // Analysis details
    if (leap.analysisDetails) {
      console.log(`\n🔬 ANALYSIS DETAILS:`);
      try {
        const details = typeof leap.analysisDetails === 'string'
          ? JSON.parse(leap.analysisDetails)
          : leap.analysisDetails;

        // Show flow metrics if available
        if (details.flowMetrics) {
          console.log(`   Flow Metrics:`);
          console.log(`     - Volume: ${details.flowMetrics.volume || 'N/A'}`);
          console.log(`     - Premium: $${details.flowMetrics.premium || 'N/A'}`);
          console.log(`     - Type: ${details.flowMetrics.type || 'N/A'}`);
          console.log(`     - Sentiment: ${details.flowMetrics.sentiment || 'N/A'}`);
        }

        // Show technical signals
        if (details.technicals) {
          console.log(`   Technical Signals:`);
          console.log(`     - Trend: ${details.technicals.trend || 'N/A'}`);
          console.log(`     - Momentum: ${details.technicals.momentum || 'N/A'}`);
          console.log(`     - Support/Resistance: ${details.technicals.levels || 'N/A'}`);
        }

        // Show any other relevant data
        if (details.reasoning) {
          console.log(`   Reasoning: ${details.reasoning}`);
        }
      } catch (e) {
        console.log(`   Raw: ${leap.analysisDetails.toString().substring(0, 200)}...`);
      }
    }

    // Metadata
    if (leap.metadata) {
      console.log(`\n📝 METADATA:`);
      try {
        const meta = typeof leap.metadata === 'string'
          ? JSON.parse(leap.metadata)
          : leap.metadata;
        console.log(`   ${JSON.stringify(meta, null, 2).split('\n').join('\n   ')}`);
      } catch (e) {
        console.log(`   Raw: ${leap.metadata.toString().substring(0, 200)}...`);
      }
    }

    // Notes
    if (leap.notes) {
      console.log(`\n💡 NOTES:`);
      console.log(`   ${leap.notes}`);
    }
  }

  // Now check historical performance of flow-based LEAPS
  console.log(`\n\n${'━'.repeat(60)}`);
  console.log('📊 HISTORICAL PERFORMANCE: Flow-Based LEAPS');
  console.log(`${'━'.repeat(60)}\n`);

  const closedFlowLeaps = await db
    .select()
    .from(tradeIdeas)
    .where(
      and(
        eq(tradeIdeas.assetType, 'option'),
        eq(tradeIdeas.source, 'flow'),
        sql`${tradeIdeas.outcomeStatus} IN ('won', 'lost')`,
        sql`${tradeIdeas.expiryDate} IS NOT NULL`
      )
    )
    .orderBy(desc(tradeIdeas.timestamp))
    .limit(50);

  if (closedFlowLeaps.length > 0) {
    const wonLeaps = closedFlowLeaps.filter(l => l.outcomeStatus === 'won');
    const lostLeaps = closedFlowLeaps.filter(l => l.outcomeStatus === 'lost');
    const totalClosed = wonLeaps.length + lostLeaps.length;

    const winRate = (wonLeaps.length / totalClosed * 100).toFixed(1);
    const avgWin = wonLeaps.reduce((sum, l) => sum + (l.percentGain || 0), 0) / (wonLeaps.length || 1);
    const avgLoss = lostLeaps.reduce((sum, l) => sum + (l.percentGain || 0), 0) / (lostLeaps.length || 1);

    console.log(`📈 OVERALL STATS (${closedFlowLeaps.length} closed positions):`);
    console.log(`   Win Rate: ${winRate}% (${wonLeaps.length}W / ${lostLeaps.length}L)`);
    console.log(`   Avg Win: +${avgWin.toFixed(2)}%`);
    console.log(`   Avg Loss: ${avgLoss.toFixed(2)}%`);
    console.log(`   Expectancy: ${(avgWin * (wonLeaps.length / totalClosed) + avgLoss * (lostLeaps.length / totalClosed)).toFixed(2)}%`);

    // Show recent winners
    console.log(`\n✅ RECENT WINNERS (Last 10):\n`);
    const recentWinners = wonLeaps.slice(0, 10);
    recentWinners.forEach(w => {
      console.log(`   ${w.symbol} ${w.optionType?.toUpperCase()} $${w.strikePrice} → +${w.percentGain?.toFixed(2)}% (Conf: ${w.confidenceScore}%)`);
    });

    // Show recent losers
    console.log(`\n❌ RECENT LOSSES (Last 10):\n`);
    const recentLosers = lostLeaps.slice(0, 10);
    recentLosers.forEach(l => {
      console.log(`   ${l.symbol} ${l.optionType?.toUpperCase()} $${l.strikePrice} → ${l.percentGain?.toFixed(2)}% (Conf: ${l.confidenceScore}%)`);
    });

  } else {
    console.log('⚠️  No historical flow LEAPS performance data available');
  }

  console.log('\n✅ Validation complete!\n');
}

validateLeapsFlow().catch(console.error).finally(() => process.exit(0));
