/**
 * Live LEAPS Tracker - Real-time LEAPS with Greeks and Position Tracking
 */

import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';
import { greeksIntegration } from './server/greeks-integration';
import { positionTracker } from './server/position-tracker';

async function liveLEAPSTracker() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔴 LIVE LEAPS TRACKER - With Greeks & Position Validation');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Get cheap LEAPS
  const ninetyDaysFromNow = new Date();
  ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

  const cheapLeaps = await db.execute(sql`
    SELECT
      id,
      symbol,
      option_type,
      strike_price,
      expiry_date,
      entry_price,
      target_price,
      stop_loss,
      confidence_score,
      source
    FROM trade_ideas
    WHERE asset_type = 'option'
      AND outcome_status = 'open'
      AND expiry_date > ${ninetyDaysFromNow.toISOString()}
      AND entry_price >= 0.50
      AND entry_price <= 3.00
      AND confidence_score >= 70
    ORDER BY confidence_score DESC
    LIMIT 10
  `);

  console.log(`📊 Found ${cheapLeaps.rows.length} LEAPS to analyze\n`);

  if (cheapLeaps.rows.length === 0) {
    console.log('⚠️  No LEAPS found matching criteria\n');
    return;
  }

  // Prepare for batch Greeks fetch
  const leapsForGreeks = cheapLeaps.rows.map((leap: any) => ({
    symbol: leap.symbol,
    strike: leap.strike_price,
    expiry: leap.expiry_date.split('T')[0], // Convert to YYYY-MM-DD
    optionType: leap.option_type as 'call' | 'put'
  }));

  console.log('🔄 Fetching live Greeks from Tradier...\n');

  // Batch fetch Greeks
  const greeksMap = await greeksIntegration.batchFetchGreeks(leapsForGreeks);

  // Display each LEAP with Greeks
  for (const leap of cheapLeaps.rows) {
    const key = `${leap.symbol}_${leap.option_type}_${leap.strike_price}_${leap.expiry_date.split('T')[0]}`;
    const greeks = greeksMap.get(key);

    console.log('━'.repeat(80));
    console.log(`\n🎯 ${leap.symbol} ${leap.option_type.toUpperCase()} $${leap.strike_price}`);
    console.log(`   Expiry: ${new Date(leap.expiry_date).toLocaleDateString()}`);
    console.log(`   Cost: $${(leap.entry_price * 100).toFixed(0)}/contract ($${leap.entry_price.toFixed(2)}/share)`);
    console.log(`   Target: $${leap.target_price.toFixed(2)} (+${(((leap.target_price - leap.entry_price) / leap.entry_price) * 100).toFixed(1)}%)`);
    console.log(`   Confidence: ${leap.confidence_score}% | Source: ${leap.source}\n`);

    if (greeks) {
      console.log('   📊 LIVE GREEKS:');
      console.log(`      Delta: ${greeks.delta.toFixed(3)} | Gamma: ${greeks.gamma.toFixed(4)}`);
      console.log(`      Theta: -$${(Math.abs(greeks.theta) * 100).toFixed(2)}/day | Vega: ${greeks.vega.toFixed(3)}`);
      console.log(`      IV: ${(greeks.impliedVolatility * 100).toFixed(1)}% | Prob ITM: ${greeks.probabilityITM?.toFixed(1)}%`);
      console.log(`      Underlying: $${greeks.underlyingPrice.toFixed(2)} | Bid/Ask: $${greeks.bid.toFixed(2)}/$${greeks.ask.toFixed(2)}`);
      console.log(`      Volume: ${greeks.volume} | Open Interest: ${greeks.openInterest}\n`);

      // Interpret Greeks
      const interpretation = greeksIntegration.interpretGreeks(greeks);
      console.log('   🎲 INTERPRETATION:');
      console.log(`      ${interpretation.deltaInterpretation}`);
      console.log(`      ${interpretation.thetaInterpretation}`);
      console.log(`      ${interpretation.vegaInterpretation}`);
      console.log(`      Overall Risk: ${interpretation.overallRisk.toUpperCase()}\n`);

      // Realistic profit scenarios
      const profitPerContract = (leap.target_price - leap.entry_price) * 100;
      console.log('   💰 PROFIT SCENARIOS:');
      console.log(`      1 contract ($${(leap.entry_price * 100).toFixed(0)}): +$${profitPerContract.toFixed(0)} if target hit`);
      console.log(`      3 contracts ($${(leap.entry_price * 300).toFixed(0)}): +$${(profitPerContract * 3).toFixed(0)} if target hit`);
      console.log(`      5 contracts ($${(leap.entry_price * 500).toFixed(0)}): +$${(profitPerContract * 5).toFixed(0)} if target hit`);

      // Show current value vs entry
      const currentValue = greeks.mid;
      const currentPnL = ((currentValue - leap.entry_price) / leap.entry_price * 100);
      if (Math.abs(currentPnL) > 0.5) {
        console.log(`      Current P&L: ${currentPnL > 0 ? '+' : ''}${currentPnL.toFixed(1)}% (now $${(currentValue * 100).toFixed(0)}/contract)`);
      }
    } else {
      console.log('   ⚠️  Greeks not available (Tradier API required)\n');
      console.log('   💰 PROFIT SCENARIOS:');
      const profitPerContract = (leap.target_price - leap.entry_price) * 100;
      console.log(`      1 contract ($${(leap.entry_price * 100).toFixed(0)}): +$${profitPerContract.toFixed(0)} if target hit`);
      console.log(`      3 contracts ($${(leap.entry_price * 300).toFixed(0)}): +$${(profitPerContract * 3).toFixed(0)} if target hit`);
      console.log(`      5 contracts ($${(leap.entry_price * 500).toFixed(0)}): +$${(profitPerContract * 5).toFixed(0)} if target hit`);
    }

    console.log('');
  }

  // Show position tracking summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📈 POSITION TRACKING SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const summary = await positionTracker.getPerformanceSummary({
    assetType: 'option',
    minConfidence: 70
  });

  console.log(`Total LEAPS Tracked: ${summary.totalTracked}`);
  console.log(`Open: ${summary.open} | Closed: ${summary.closed}`);

  if (summary.closed > 0) {
    console.log(`\nPerformance:`);
    console.log(`  Win Rate: ${summary.winRate.toFixed(1)}%`);
    console.log(`  Avg Win: +${summary.avgGain.toFixed(2)}%`);
    console.log(`  Avg Loss: ${summary.avgLoss.toFixed(2)}%`);
    console.log(`  Expectancy: ${summary.expectancy.toFixed(2)}%`);

    console.log(`\nBy Source:`);
    summary.bySource.forEach((stats, source) => {
      console.log(`  ${source}: ${stats.winRate.toFixed(1)}% (${stats.wins}W/${stats.losses}L)`);
    });
  } else {
    console.log(`\n⚠️  No closed positions yet - need to track results to validate confidence scores!`);
  }

  // Show confidence validation if available
  const validations = await positionTracker.validateConfidenceScores();

  if (validations.length > 0) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎯 CONFIDENCE SCORE VALIDATION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('Bucket      | Closed | Expected | Actual  | Accuracy | Expectancy');
    console.log('------------|--------|----------|---------|----------|------------');

    validations.forEach(v => {
      console.log(
        `${v.bucket.padEnd(11)} | ${v.totalClosed.toString().padEnd(6)} | ` +
        `${v.expectedWinRate.toFixed(0)}%      | ${v.actualWinRate.toFixed(1)}%   | ` +
        `${v.accuracy.toFixed(1)}%    | ${v.expectancy.toFixed(2)}%`
      );
    });
  }

  console.log('\n✅ Live tracking complete!\n');
  console.log('💡 TIP: Run this regularly to track position performance and validate confidence scores.\n');
}

liveLEAPSTracker().catch(console.error).finally(() => process.exit(0));
