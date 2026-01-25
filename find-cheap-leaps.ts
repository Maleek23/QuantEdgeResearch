/**
 * Find cheap LEAPS opportunities ($50-200 per contract)
 */

import 'dotenv/config';
import { db } from './server/db';
import { tradeIdeas } from './shared/schema';
import { desc, eq, and, gte, sql, lte, between } from 'drizzle-orm';

async function findCheapLeaps() {
  console.log('\n🎯 Finding CHEAP LEAPS ($50-200 per contract)...\n');
  console.log('Note: 1 contract = 100 shares, so $0.50-$2.00 per share = $50-200 per contract\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const ninetyDaysFromNow = new Date();
  ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

  const cheapLeaps = await db
    .select()
    .from(tradeIdeas)
    .where(
      and(
        eq(tradeIdeas.assetType, 'option'),
        eq(tradeIdeas.outcomeStatus, 'open'),
        gte(tradeIdeas.confidenceScore, 70),
        sql`${tradeIdeas.expiryDate} > ${ninetyDaysFromNow.toISOString()}`,
        // Entry price between $0.50 and $2.00 per share
        gte(tradeIdeas.entryPrice, 0.50),
        lte(tradeIdeas.entryPrice, 2.00)
      )
    )
    .orderBy(desc(tradeIdeas.confidenceScore))
    .limit(20);

  if (cheapLeaps.length > 0) {
    console.log(`✅ Found ${cheapLeaps.length} cheap LEAPS:\n`);

    for (const leap of cheapLeaps) {
      const daysToExpiry = leap.expiryDate
        ? Math.floor((new Date(leap.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : 0;

      const contractCost = (leap.entryPrice || 0) * 100;
      const targetContractValue = (leap.targetPrice || 0) * 100;
      const profitPerContract = targetContractValue - contractCost;
      const percentGain = leap.targetPrice && leap.entryPrice
        ? ((leap.targetPrice - leap.entryPrice) / leap.entryPrice * 100).toFixed(1)
        : 'N/A';

      const riskReward = leap.targetPrice && leap.stopLoss && leap.entryPrice
        ? ((leap.targetPrice - leap.entryPrice) / (leap.entryPrice - leap.stopLoss)).toFixed(2)
        : 'N/A';

      console.log(`🎯 ${leap.symbol} ${leap.optionType?.toUpperCase()} $${leap.strikePrice}`);
      console.log(`   📅 ${daysToExpiry} days to expiry (${leap.expiryDate ? new Date(leap.expiryDate).toLocaleDateString() : 'N/A'})`);
      console.log(`   💰 Cost: $${contractCost.toFixed(0)} per contract ($${leap.entryPrice?.toFixed(2)}/share)`);
      console.log(`   🎯 Target: $${targetContractValue.toFixed(0)} per contract (+$${profitPerContract.toFixed(0)} profit = +${percentGain}%)`);
      console.log(`   📊 Confidence: ${leap.confidenceScore}% | R:R: ${riskReward}:1`);
      console.log(`   📌 Source: ${leap.source}`);
      console.log('');
    }

    // Show summary of best opportunities
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📈 TOP 3 BEST VALUE LEAPS:\n');

    const sorted = cheapLeaps
      .map(leap => {
        const percentGain = leap.targetPrice && leap.entryPrice
          ? ((leap.targetPrice - leap.entryPrice) / leap.entryPrice * 100)
          : 0;
        return { ...leap, calculatedGain: percentGain };
      })
      .sort((a, b) => b.calculatedGain - a.calculatedGain)
      .slice(0, 3);

    sorted.forEach((leap, idx) => {
      const contractCost = (leap.entryPrice || 0) * 100;
      const daysToExpiry = leap.expiryDate
        ? Math.floor((new Date(leap.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : 0;
      console.log(`${idx + 1}. ${leap.symbol} ${leap.optionType?.toUpperCase()} - $${contractCost.toFixed(0)} for +${leap.calculatedGain.toFixed(1)}% (${leap.confidenceScore}% conf, ${daysToExpiry}d)`);
    });

  } else {
    console.log('❌ No cheap LEAPS found in $50-200 range\n');

    // Try finding any LEAPS under $300 per contract
    console.log('🔍 Searching for any LEAPS under $300 per contract...\n');

    const anyLeaps = await db
      .select()
      .from(tradeIdeas)
      .where(
        and(
          eq(tradeIdeas.assetType, 'option'),
          eq(tradeIdeas.outcomeStatus, 'open'),
          gte(tradeIdeas.confidenceScore, 70),
          sql`${tradeIdeas.expiryDate} > ${ninetyDaysFromNow.toISOString()}`,
          lte(tradeIdeas.entryPrice, 3.00)
        )
      )
      .orderBy(desc(tradeIdeas.confidenceScore))
      .limit(10);

    if (anyLeaps.length > 0) {
      console.log(`Found ${anyLeaps.length} LEAPS under $300:\n`);

      for (const leap of anyLeaps) {
        const contractCost = (leap.entryPrice || 0) * 100;
        const percentGain = leap.targetPrice && leap.entryPrice
          ? ((leap.targetPrice - leap.entryPrice) / leap.entryPrice * 100).toFixed(1)
          : 'N/A';
        const daysToExpiry = leap.expiryDate
          ? Math.floor((new Date(leap.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          : 0;

        console.log(`${leap.symbol} ${leap.optionType?.toUpperCase()} $${leap.strikePrice} - $${contractCost.toFixed(0)}/contract (+${percentGain}%) - ${leap.confidenceScore}% conf - ${daysToExpiry}d`);
      }
    }
  }

  console.log('\n✅ Search complete!\n');
}

findCheapLeaps().catch(console.error).finally(() => process.exit(0));
