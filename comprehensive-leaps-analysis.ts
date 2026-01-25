/**
 * Comprehensive LEAPS Analysis with Scoring, Greeks, and Profit Scenarios
 */

import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

interface LEAPSAnalysis {
  symbol: string;
  optionType: string;
  strike: number;
  expiry: string;
  dte: number;
  costPerContract: number;
  costPerShare: number;
  targetPerShare: number;
  stopPerShare: number;
  percentUpside: number;
  profitPerContract: number;
  breakeven: number;
  confidenceScore: number;
  riskReward: number;
  // Greeks (if available)
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  impliedVol?: number;
  // Metadata
  underlyingPrice?: number;
  volume?: number;
  openInterest?: number;
  source: string;
  grade?: string;
  isWhale?: boolean;
}

async function comprehensiveLeapsAnalysis() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 COMPREHENSIVE LEAPS ANALYSIS - ALL DETAILS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 1. Get cheap LEAPS (under $300/contract)
  const ninetyDaysFromNow = new Date();
  ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

  const cheapLeaps = await db.execute(sql`
    SELECT
      symbol,
      option_type,
      strike_price,
      expiry_date,
      entry_price,
      target_price,
      stop_loss,
      confidence_score,
      direction,
      source,
      EXTRACT(DAY FROM (expiry_date::timestamp - NOW())) as days_to_expiry
    FROM trade_ideas
    WHERE asset_type = 'option'
      AND outcome_status = 'open'
      AND expiry_date > ${ninetyDaysFromNow.toISOString()}
      AND entry_price >= 0.50
      AND entry_price <= 3.00
      AND confidence_score >= 70
    ORDER BY confidence_score DESC, entry_price ASC
    LIMIT 30
  `);

  // 2. Get whale flows for comparison
  const whaleLeaps = await db.execute(sql`
    SELECT
      symbol,
      option_type,
      strike_price,
      expiry_date,
      entry_price,
      target_price,
      stop_loss,
      confidence_score,
      grade,
      is_mega_whale,
      premium_per_contract,
      EXTRACT(DAY FROM (expiry_date::timestamp - NOW())) as days_to_expiry
    FROM whale_flows
    WHERE outcome_status = 'open'
      AND EXTRACT(DAY FROM (expiry_date::timestamp - NOW())) >= 90
      AND premium_per_contract <= 30000
    ORDER BY confidence_score DESC
    LIMIT 20
  `);

  const allLeaps: LEAPSAnalysis[] = [];

  // Process cheap LEAPS
  console.log('📊 CHEAP LEAPS ANALYSIS ($50-$300/contract):\n');
  console.log('━'.repeat(120));
  console.log(
    'Symbol'.padEnd(8) +
    'Type'.padEnd(10) +
    'Strike'.padEnd(8) +
    'DTE'.padEnd(6) +
    'Cost'.padEnd(10) +
    'Target'.padEnd(10) +
    'Upside'.padEnd(10) +
    'Profit'.padEnd(12) +
    'R:R'.padEnd(8) +
    'Conf'.padEnd(6) +
    'Source'
  );
  console.log('━'.repeat(120));

  for (const leap of cheapLeaps.rows) {
    const costPerContract = (leap.entry_price || 0) * 100;
    const targetPerContract = (leap.target_price || 0) * 100;
    const profitPerContract = targetPerContract - costPerContract;
    const percentUpside = leap.target_price && leap.entry_price
      ? ((leap.target_price - leap.entry_price) / leap.entry_price * 100)
      : 0;
    const riskReward = leap.target_price && leap.stop_loss && leap.entry_price
      ? ((leap.target_price - leap.entry_price) / (leap.entry_price - leap.stop_loss))
      : 0;

    const analysis: LEAPSAnalysis = {
      symbol: leap.symbol,
      optionType: leap.option_type || 'N/A',
      strike: leap.strike_price || 0,
      expiry: leap.expiry_date || 'N/A',
      dte: leap.days_to_expiry || 0,
      costPerContract,
      costPerShare: leap.entry_price || 0,
      targetPerShare: leap.target_price || 0,
      stopPerShare: leap.stop_loss || 0,
      percentUpside,
      profitPerContract,
      breakeven: (leap.entry_price || 0) + (leap.strike_price || 0),
      confidenceScore: leap.confidence_score || 0,
      riskReward,
      source: leap.source || 'N/A'
    };

    allLeaps.push(analysis);

    console.log(
      leap.symbol.padEnd(8) +
      `${leap.option_type?.toUpperCase() || 'N/A'} $${leap.strike_price || 0}`.padEnd(10) +
      `$${leap.strike_price || 0}`.padEnd(8) +
      `${leap.days_to_expiry || 0}d`.padEnd(6) +
      `$${costPerContract.toFixed(0)}`.padEnd(10) +
      `$${targetPerContract.toFixed(0)}`.padEnd(10) +
      `+${percentUpside.toFixed(1)}%`.padEnd(10) +
      `+$${profitPerContract.toFixed(0)}`.padEnd(12) +
      `${riskReward.toFixed(2)}:1`.padEnd(8) +
      `${leap.confidence_score || 0}%`.padEnd(6) +
      (leap.source || 'N/A')
    );
  }

  // Process whale LEAPS
  console.log('\n\n🐋 WHALE-BACKED LEAPS ($300-$30,000/contract):\n');
  console.log('━'.repeat(120));
  console.log(
    'Symbol'.padEnd(8) +
    'Type'.padEnd(10) +
    'Strike'.padEnd(8) +
    'DTE'.padEnd(6) +
    'Cost'.padEnd(12) +
    'Target'.padEnd(12) +
    'Upside'.padEnd(10) +
    'Profit'.padEnd(14) +
    'Grade'.padEnd(8) +
    'Conf'.padEnd(6) +
    'Whale'
  );
  console.log('━'.repeat(120));

  for (const whale of whaleLeaps.rows) {
    const costPerContract = whale.premium_per_contract || (whale.entry_price || 0) * 100;
    const targetPerContract = (whale.target_price || 0) * 100;
    const profitPerContract = targetPerContract - costPerContract;
    const percentUpside = whale.target_price && whale.entry_price
      ? ((whale.target_price - whale.entry_price) / whale.entry_price * 100)
      : 0;

    const analysis: LEAPSAnalysis = {
      symbol: whale.symbol,
      optionType: whale.option_type || 'N/A',
      strike: whale.strike_price || 0,
      expiry: whale.expiry_date || 'N/A',
      dte: whale.days_to_expiry || 0,
      costPerContract,
      costPerShare: whale.entry_price || 0,
      targetPerShare: whale.target_price || 0,
      stopPerShare: whale.stop_loss || 0,
      percentUpside,
      profitPerContract,
      breakeven: (whale.entry_price || 0) + (whale.strike_price || 0),
      confidenceScore: whale.confidence_score || 0,
      riskReward: whale.target_price && whale.stop_loss && whale.entry_price
        ? ((whale.target_price - whale.entry_price) / (whale.entry_price - whale.stop_loss))
        : 0,
      source: 'whale_flow',
      grade: whale.grade,
      isWhale: whale.is_mega_whale
    };

    allLeaps.push(analysis);

    console.log(
      whale.symbol.padEnd(8) +
      `${whale.option_type?.toUpperCase() || 'N/A'} $${whale.strike_price || 0}`.padEnd(10) +
      `$${whale.strike_price || 0}`.padEnd(8) +
      `${whale.days_to_expiry || 0}d`.padEnd(6) +
      `$${costPerContract.toLocaleString()}`.padEnd(12) +
      `$${targetPerContract.toLocaleString()}`.padEnd(12) +
      `+${percentUpside.toFixed(1)}%`.padEnd(10) +
      `+$${profitPerContract.toLocaleString()}`.padEnd(14) +
      `${whale.grade || 'N/A'}`.padEnd(8) +
      `${whale.confidence_score || 0}%`.padEnd(6) +
      (whale.is_mega_whale ? '🐋' : '🐳')
    );
  }

  // DETAILED ANALYSIS: Top 10 by Upside Potential
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 TOP 10 LEAPS BY UPSIDE POTENTIAL - DETAILED BREAKDOWN');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const topLeaps = allLeaps
    .sort((a, b) => b.percentUpside - a.percentUpside)
    .slice(0, 10);

  topLeaps.forEach((leap, idx) => {
    console.log(`\n${idx + 1}. ${leap.symbol} ${leap.optionType.toUpperCase()} $${leap.strike}`);
    console.log('─'.repeat(80));
    console.log(`📅 Expiry: ${new Date(leap.expiry).toLocaleDateString()} (${leap.dte} days)`);
    console.log(`💰 Cost: $${leap.costPerContract.toFixed(0)}/contract ($${leap.costPerShare.toFixed(2)}/share)`);
    console.log(`🎯 Target: $${leap.targetPerShare.toFixed(2)}/share (+${leap.percentUpside.toFixed(1)}%)`);
    console.log(`🛑 Stop: $${leap.stopPerShare.toFixed(2)}/share`);
    console.log(`💵 Breakeven: $${leap.breakeven.toFixed(2)} (underlying needs to reach this)`);
    console.log(`📊 Confidence: ${leap.confidenceScore}% | R:R: ${leap.riskReward.toFixed(2)}:1`);
    console.log(`📌 Source: ${leap.source}${leap.grade ? ` | Grade: ${leap.grade}` : ''}`);

    console.log(`\n💰 PROFIT SCENARIOS (per contract):`);
    console.log(`   Target Hit: +$${leap.profitPerContract.toFixed(0)} (+${leap.percentUpside.toFixed(1)}%)`);
    console.log(`   10 contracts: +$${(leap.profitPerContract * 10).toFixed(0)}`);
    console.log(`   20 contracts: +$${(leap.profitPerContract * 20).toFixed(0)}`);

    const lossPerContract = (leap.costPerShare - leap.stopPerShare) * 100;
    console.log(`   Stop Hit: -$${lossPerContract.toFixed(0)} (-${((lossPerContract / leap.costPerContract) * 100).toFixed(1)}%)`);

    if (leap.delta !== undefined && leap.gamma !== undefined) {
      console.log(`\n🎲 GREEKS:`);
      console.log(`   Delta: ${leap.delta.toFixed(3)} | Gamma: ${leap.gamma.toFixed(4)}`);
      console.log(`   Theta: ${leap.theta?.toFixed(3) || 'N/A'} | Vega: ${leap.vega?.toFixed(3) || 'N/A'}`);
      console.log(`   IV: ${leap.impliedVol ? (leap.impliedVol * 100).toFixed(1) + '%' : 'N/A'}`);
    } else {
      console.log(`\n🎲 GREEKS: Not available (will need live options data)`);
    }
  });

  // Export CSV data
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 CSV EXPORT DATA (copy to Excel):');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('Symbol,Type,Strike,Expiry,DTE,Cost/Contract,Target/Share,Upside%,Profit/Contract,Profit(10x),Profit(20x),R:R,Confidence,Breakeven,Source,Grade');

  allLeaps
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .forEach(leap => {
      console.log(
        `${leap.symbol},` +
        `${leap.optionType.toUpperCase()},` +
        `${leap.strike},` +
        `${new Date(leap.expiry).toLocaleDateString()},` +
        `${leap.dte},` +
        `$${leap.costPerContract.toFixed(0)},` +
        `$${leap.targetPerShare.toFixed(2)},` +
        `${leap.percentUpside.toFixed(1)}%,` +
        `$${leap.profitPerContract.toFixed(0)},` +
        `$${(leap.profitPerContract * 10).toFixed(0)},` +
        `$${(leap.profitPerContract * 20).toFixed(0)},` +
        `${leap.riskReward.toFixed(2)},` +
        `${leap.confidenceScore}%,` +
        `$${leap.breakeven.toFixed(2)},` +
        `${leap.source},` +
        `${leap.grade || 'N/A'}`
      );
    });

  console.log('\n✅ Analysis complete! Total LEAPS analyzed: ' + allLeaps.length + '\n');
}

comprehensiveLeapsAnalysis().catch(console.error).finally(() => process.exit(0));
