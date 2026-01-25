/**
 * Query QuantEdge Platform for ONDS analysis and LEAPS opportunities
 */

import 'dotenv/config';
import { db } from './server/db';
import { tradeIdeas } from './shared/schema';
import { desc, eq, and, gte, sql } from 'drizzle-orm';

async function queryPlatform() {
  console.log('\n🔍 Querying QuantEdge Platform...\n');

  // 1. Check ONDS trade ideas and performance
  console.log('📊 ONDS Analysis:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    const ondsIdeas = await db
      .select()
      .from(tradeIdeas)
      .where(eq(tradeIdeas.symbol, 'ONDS'))
      .orderBy(desc(tradeIdeas.timestamp))
      .limit(10);

    if (ondsIdeas.length > 0) {
      console.log(`\n✅ Found ${ondsIdeas.length} ONDS trade ideas:\n`);

      for (const idea of ondsIdeas) {
        const outcome = idea.outcomeStatus === 'won' ? '✅ WIN' :
                       idea.outcomeStatus === 'lost' ? '❌ LOSS' :
                       idea.outcomeStatus === 'open' ? '⏳ OPEN' : '⚪ ' + idea.outcomeStatus;

        console.log(`${outcome} | ${idea.direction?.toUpperCase()} | Conf: ${idea.confidenceScore}% | Entry: $${idea.entryPrice}`);
        console.log(`   Target: $${idea.targetPrice} | Stop: $${idea.stopLoss}`);
        console.log(`   Source: ${idea.source} | Date: ${new Date(idea.timestamp).toLocaleDateString()}`);

        if (idea.outcomeStatus === 'won' || idea.outcomeStatus === 'lost') {
          console.log(`   P&L: ${idea.percentGain?.toFixed(2)}% | Exit: $${idea.exitPrice}`);
        }

        console.log('');
      }

      // Calculate ONDS performance stats
      const wonIdeas = ondsIdeas.filter(i => i.outcomeStatus === 'won');
      const lostIdeas = ondsIdeas.filter(i => i.outcomeStatus === 'lost');
      const closedIdeas = wonIdeas.length + lostIdeas.length;

      if (closedIdeas > 0) {
        const winRate = (wonIdeas.length / closedIdeas * 100).toFixed(1);
        const avgGain = wonIdeas.reduce((sum, i) => sum + (i.percentGain || 0), 0) / (wonIdeas.length || 1);
        const avgLoss = lostIdeas.reduce((sum, i) => sum + (i.percentGain || 0), 0) / (lostIdeas.length || 1);

        console.log('📈 ONDS Performance Summary:');
        console.log(`   Win Rate: ${winRate}% (${wonIdeas.length}W / ${lostIdeas.length}L)`);
        console.log(`   Avg Win: +${avgGain.toFixed(2)}%`);
        console.log(`   Avg Loss: ${avgLoss.toFixed(2)}%`);
        console.log('');
      }
    } else {
      console.log('\n⚠️  No ONDS trade ideas found in database\n');
    }
  } catch (error) {
    console.error('❌ Error querying ONDS:', error);
  }

  // 2. Find LEAPS opportunities (options > 90 days to expiry, high R:R)
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 LEAPS Opportunities (90+ days, High R:R):');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const ninetyDaysFromNow = new Date();
    ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

    const leapsIdeas = await db
      .select()
      .from(tradeIdeas)
      .where(
        and(
          eq(tradeIdeas.assetType, 'option'),
          eq(tradeIdeas.outcomeStatus, 'open'),
          gte(tradeIdeas.confidenceScore, 70),
          sql`${tradeIdeas.expiryDate} > ${ninetyDaysFromNow.toISOString()}`
        )
      )
      .orderBy(desc(tradeIdeas.confidenceScore))
      .limit(15);

    if (leapsIdeas.length > 0) {
      console.log(`✅ Found ${leapsIdeas.length} high-confidence LEAPS opportunities:\n`);

      for (const leap of leapsIdeas) {
        const daysToExpiry = leap.expiryDate
          ? Math.floor((new Date(leap.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          : 0;

        const riskReward = leap.targetPrice && leap.stopLoss && leap.entryPrice
          ? ((leap.targetPrice - leap.entryPrice) / (leap.entryPrice - leap.stopLoss)).toFixed(2)
          : 'N/A';

        const potentialGain = leap.targetPrice && leap.entryPrice
          ? ((leap.targetPrice - leap.entryPrice) / leap.entryPrice * 100).toFixed(1)
          : 'N/A';

        console.log(`📌 ${leap.symbol} ${leap.optionType?.toUpperCase()} $${leap.strikePrice} (${daysToExpiry}d DTE)`);
        console.log(`   Confidence: ${leap.confidenceScore}% | R:R: ${riskReward}:1`);
        console.log(`   Entry: $${leap.entryPrice} → Target: $${leap.targetPrice} (+${potentialGain}%)`);
        console.log(`   Stop: $${leap.stopLoss}`);
        console.log(`   Source: ${leap.source} | Expiry: ${leap.expiryDate ? new Date(leap.expiryDate).toLocaleDateString() : 'N/A'}`);
        console.log('');
      }
    } else {
      console.log('⚠️  No LEAPS opportunities found matching criteria (90+ DTE, 70%+ confidence, open)\n');

      // Try broader search
      console.log('🔍 Searching for ANY options with 90+ DTE...\n');

      const anyLeaps = await db
        .select()
        .from(tradeIdeas)
        .where(
          and(
            eq(tradeIdeas.assetType, 'option'),
            sql`${tradeIdeas.expiryDate} > ${ninetyDaysFromNow.toISOString()}`
          )
        )
        .orderBy(desc(tradeIdeas.timestamp))
        .limit(10);

      if (anyLeaps.length > 0) {
        console.log(`Found ${anyLeaps.length} LEAPS in database:\n`);

        for (const leap of anyLeaps) {
          const daysToExpiry = leap.expiryDate
            ? Math.floor((new Date(leap.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            : 0;

          console.log(`${leap.symbol} ${leap.optionType?.toUpperCase()} $${leap.strikePrice} - ${daysToExpiry}d DTE - ${leap.outcomeStatus} - ${leap.confidenceScore}%`);
        }
      } else {
        console.log('❌ No LEAPS found in database at all\n');
      }
    }
  } catch (error) {
    console.error('❌ Error querying LEAPS:', error);
  }

  // 3. Summary of recent high-confidence opportunities (all types)
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⭐ Top Recent High-Confidence Ideas (80%+):');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const topIdeas = await db
      .select()
      .from(tradeIdeas)
      .where(
        and(
          eq(tradeIdeas.outcomeStatus, 'open'),
          gte(tradeIdeas.confidenceScore, 80)
        )
      )
      .orderBy(desc(tradeIdeas.confidenceScore))
      .limit(10);

    if (topIdeas.length > 0) {
      for (const idea of topIdeas) {
        const type = idea.assetType === 'option'
          ? `${idea.optionType?.toUpperCase()} $${idea.strikePrice}`
          : idea.assetType?.toUpperCase();

        const rr = idea.targetPrice && idea.stopLoss && idea.entryPrice
          ? ((idea.targetPrice - idea.entryPrice) / (idea.entryPrice - idea.stopLoss)).toFixed(2)
          : 'N/A';

        console.log(`${idea.symbol} ${type} | ${idea.confidenceScore}% | R:R ${rr}:1 | ${idea.source}`);
      }
    } else {
      console.log('⚠️  No high-confidence (80%+) open ideas found\n');
    }
  } catch (error) {
    console.error('❌ Error querying top ideas:', error);
  }

  console.log('\n✅ Query complete!\n');
}

// Run the query
queryPlatform().catch(console.error).finally(() => process.exit(0));
