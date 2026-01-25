/**
 * Find BEST LEAPS - Smart, high upside, actually available
 */

import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

const WATCHLIST = [
  'NIO', 'ONDS', 'ZETA', 'QBTS', 'LUNR', 'RDW', 'ACHR',
  'CLSK', 'CIFR', 'DNA', 'HIMS', 'SOFI', 'RIVN', 'IONQ'
];

async function findBestLeaps() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 SMART LEAPS FINDER - High Upside, Actually Available');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const ninetyDaysFromNow = new Date();
  ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

  // 1. WATCHLIST LEAPS (actually open, high upside)
  console.log('🎯 YOUR WATCHLIST - OPEN LEAPS:\n');
  console.log('─'.repeat(100));

  const watchlistSymbols = WATCHLIST.join("','");

  const watchlistLeaps = await db.execute(sql`
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
      outcome_status,
      timestamp,
      EXTRACT(DAY FROM (expiry_date::timestamp - NOW())) as days_to_expiry,
      ((target_price - entry_price) / entry_price * 100) as percent_upside
    FROM trade_ideas
    WHERE symbol IN ('${sql.raw(watchlistSymbols)}')
      AND asset_type = 'option'
      AND outcome_status = 'open'
      AND expiry_date IS NOT NULL
      AND expiry_date::timestamp > ${ninetyDaysFromNow.toISOString()}::timestamp
      AND entry_price >= 0.50
      AND entry_price <= 5.00
    ORDER BY confidence_score DESC, percent_upside DESC
    LIMIT 20
  `);

  if (watchlistLeaps.rows.length > 0) {
    watchlistLeaps.rows.forEach((leap: any, idx) => {
      const cost = (leap.entry_price || 0) * 100;
      const profit = ((leap.target_price || 0) - (leap.entry_price || 0)) * 100;
      const upside = leap.percent_upside?.toFixed(1) || '0.0';

      console.log(`\n${idx + 1}. ${leap.symbol} ${leap.option_type?.toUpperCase()} $${leap.strike_price}`);
      console.log(`   💰 Cost: $${cost.toFixed(0)}/contract | Target: +${upside}% (+$${profit.toFixed(0)})`);
      console.log(`   📅 Expiry: ${new Date(leap.expiry_date).toLocaleDateString()} (${leap.days_to_expiry}d)`);
      console.log(`   🎯 Confidence: ${leap.confidence_score}% | Source: ${leap.source}`);
      console.log(`   💡 Profit: 1 contract = +$${profit.toFixed(0)} | 3 contracts = +$${(profit * 3).toFixed(0)} | 5 contracts = +$${(profit * 5).toFixed(0)}`);
    });
  } else {
    console.log('⚠️  No open LEAPS found in your watchlist\n');
  }

  // 2. BEST CHEAP LEAPS OVERALL (any symbol, high confidence, great upside)
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💎 BEST CHEAP LEAPS - All Market (High Confidence + Great Upside):');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

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
      outcome_status,
      timestamp,
      EXTRACT(DAY FROM (expiry_date::timestamp - NOW())) as days_to_expiry,
      ((target_price - entry_price) / entry_price * 100) as percent_upside
    FROM trade_ideas
    WHERE asset_type = 'option'
      AND outcome_status = 'open'
      AND expiry_date IS NOT NULL
      AND expiry_date::timestamp > ${ninetyDaysFromNow.toISOString()}::timestamp
      AND entry_price >= 0.50
      AND entry_price <= 3.00
      AND confidence_score >= 75
      AND ((target_price - entry_price) / entry_price * 100) >= 20
    ORDER BY
      (confidence_score * ((target_price - entry_price) / entry_price * 100)) DESC,
      confidence_score DESC
    LIMIT 15
  `);

  if (cheapLeaps.rows.length > 0) {
    cheapLeaps.rows.forEach((leap: any, idx) => {
      const cost = (leap.entry_price || 0) * 100;
      const profit = ((leap.target_price || 0) - (leap.entry_price || 0)) * 100;
      const upside = leap.percent_upside?.toFixed(1) || '0.0';
      const score = (leap.confidence_score * leap.percent_upside / 100).toFixed(0);

      const isWatchlist = WATCHLIST.includes(leap.symbol);
      const badge = isWatchlist ? '⭐ WATCHLIST' : '';

      console.log(`\n${idx + 1}. ${leap.symbol} ${leap.option_type?.toUpperCase()} $${leap.strike_price} ${badge}`);
      console.log(`   💰 Cost: $${cost.toFixed(0)}/contract | Target: +${upside}% (+$${profit.toFixed(0)})`);
      console.log(`   📅 Expiry: ${new Date(leap.expiry_date).toLocaleDateString()} (${leap.days_to_expiry}d)`);
      console.log(`   🎯 Confidence: ${leap.confidence_score}% | Quality Score: ${score} | Source: ${leap.source}`);
      console.log(`   💡 Profit: 1 = +$${profit.toFixed(0)} | 3 = +$${(profit * 3).toFixed(0)} | 5 = +$${(profit * 5).toFixed(0)} | 10 = +$${(profit * 10).toFixed(0)}`);
    });
  } else {
    console.log('⚠️  No cheap LEAPS found meeting criteria\n');
  }

  // 3. BEST MEDIUM-PRICED LEAPS ($300-$500)
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎰 MEDIUM-PRICED LEAPS - Higher Conviction ($300-$500/contract):');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const mediumLeaps = await db.execute(sql`
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
      outcome_status,
      timestamp,
      EXTRACT(DAY FROM (expiry_date::timestamp - NOW())) as days_to_expiry,
      ((target_price - entry_price) / entry_price * 100) as percent_upside
    FROM trade_ideas
    WHERE asset_type = 'option'
      AND outcome_status = 'open'
      AND expiry_date IS NOT NULL
      AND expiry_date::timestamp > ${ninetyDaysFromNow.toISOString()}::timestamp
      AND entry_price >= 3.00
      AND entry_price <= 5.00
      AND confidence_score >= 70
    ORDER BY confidence_score DESC, percent_upside DESC
    LIMIT 10
  `);

  if (mediumLeaps.rows.length > 0) {
    mediumLeaps.rows.forEach((leap: any, idx) => {
      const cost = (leap.entry_price || 0) * 100;
      const profit = ((leap.target_price || 0) - (leap.entry_price || 0)) * 100;
      const upside = leap.percent_upside?.toFixed(1) || '0.0';

      const isWatchlist = WATCHLIST.includes(leap.symbol);
      const badge = isWatchlist ? '⭐ WATCHLIST' : '';

      console.log(`\n${idx + 1}. ${leap.symbol} ${leap.option_type?.toUpperCase()} $${leap.strike_price} ${badge}`);
      console.log(`   💰 Cost: $${cost.toFixed(0)}/contract | Target: +${upside}% (+$${profit.toFixed(0)})`);
      console.log(`   📅 Expiry: ${new Date(leap.expiry_date).toLocaleDateString()} (${leap.days_to_expiry}d)`);
      console.log(`   🎯 Confidence: ${leap.confidence_score}% | Source: ${leap.source}`);
      console.log(`   💡 Profit: 1 = +$${profit.toFixed(0)} | 2 = +$${(profit * 2).toFixed(0)} | 3 = +$${(profit * 3).toFixed(0)}`);
    });
  } else {
    console.log('⚠️  No medium-priced LEAPS found\n');
  }

  // 4. LONGEST-DATED LEAPS (maximum time)
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⏰ LONGEST-DATED LEAPS - Maximum Time Value (300+ days):');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const longLeaps = await db.execute(sql`
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
      outcome_status,
      timestamp,
      EXTRACT(DAY FROM (expiry_date::timestamp - NOW())) as days_to_expiry,
      ((target_price - entry_price) / entry_price * 100) as percent_upside
    FROM trade_ideas
    WHERE asset_type = 'option'
      AND outcome_status = 'open'
      AND expiry_date IS NOT NULL
      AND EXTRACT(DAY FROM (expiry_date::timestamp - NOW())) >= 300
      AND entry_price >= 0.50
      AND entry_price <= 5.00
    ORDER BY days_to_expiry DESC, confidence_score DESC
    LIMIT 10
  `);

  if (longLeaps.rows.length > 0) {
    longLeaps.rows.forEach((leap: any, idx) => {
      const cost = (leap.entry_price || 0) * 100;
      const profit = ((leap.target_price || 0) - (leap.entry_price || 0)) * 100;
      const upside = leap.percent_upside?.toFixed(1) || '0.0';

      const isWatchlist = WATCHLIST.includes(leap.symbol);
      const badge = isWatchlist ? '⭐ WATCHLIST' : '';

      console.log(`\n${idx + 1}. ${leap.symbol} ${leap.option_type?.toUpperCase()} $${leap.strike_price} ${badge}`);
      console.log(`   ⏰ ${leap.days_to_expiry} DAYS (${new Date(leap.expiry_date).toLocaleDateString()}) - TRUE LEAP!`);
      console.log(`   💰 Cost: $${cost.toFixed(0)}/contract | Target: +${upside}% (+$${profit.toFixed(0)})`);
      console.log(`   🎯 Confidence: ${leap.confidence_score}% | Source: ${leap.source}`);
      console.log(`   💡 Profit: 1 = +$${profit.toFixed(0)} | 3 = +$${(profit * 3).toFixed(0)} | 5 = +$${(profit * 5).toFixed(0)}`);
    });
  } else {
    console.log('⚠️  No longest-dated LEAPS found\n');
  }

  // Summary recommendations
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 SMART PICKS - TOP 3 RECOMMENDATIONS:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Get top 3 by quality score
  const topPicks = await db.execute(sql`
    SELECT
      symbol,
      option_type,
      strike_price,
      expiry_date,
      entry_price,
      target_price,
      confidence_score,
      source,
      EXTRACT(DAY FROM (expiry_date::timestamp - NOW())) as days_to_expiry,
      ((target_price - entry_price) / entry_price * 100) as percent_upside,
      (confidence_score * ((target_price - entry_price) / entry_price * 100)) as quality_score
    FROM trade_ideas
    WHERE asset_type = 'option'
      AND outcome_status = 'open'
      AND expiry_date IS NOT NULL
      AND expiry_date::timestamp > ${ninetyDaysFromNow.toISOString()}::timestamp
      AND entry_price >= 0.50
      AND entry_price <= 3.00
      AND confidence_score >= 75
    ORDER BY quality_score DESC
    LIMIT 3
  `);

  topPicks.rows.forEach((pick: any, idx) => {
    const cost = (pick.entry_price || 0) * 100;
    const profit = ((pick.target_price || 0) - (pick.entry_price || 0)) * 100;
    const upside = pick.percent_upside?.toFixed(1) || '0.0';

    console.log(`\n🏆 #${idx + 1}: ${pick.symbol} ${pick.option_type?.toUpperCase()} $${pick.strike_price}`);
    console.log(`   Why: ${pick.confidence_score}% confidence × ${upside}% upside = ${pick.quality_score.toFixed(0)} quality score`);
    console.log(`   Cost: $${cost.toFixed(0)} | Target profit: +$${profit.toFixed(0)} | Expiry: ${pick.days_to_expiry}d`);
    console.log(`   Best for: ${cost < 150 ? 'Budget traders' : 'Moderate investors'}`);
  });

  console.log('\n\n✅ Smart LEAPS search complete!\n');
}

findBestLeaps().catch(console.error).finally(() => process.exit(0));
