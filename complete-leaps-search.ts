/**
 * COMPLETE LEAPS SEARCH - Check EVERY source including lotto
 */

import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function completeLeapsSearch() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎰 COMPLETE LEAPS SEARCH - ALL SOURCES + LOTTO');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const ninetyDays = new Date();
  ninetyDays.setDate(ninetyDays.getDate() + 90);

  // 1. Check lotto scanner
  console.log('🎰 LOTTO SCANNER - Lottery-style LEAPS:\n');

  const lottoLeaps = await db.execute(sql`
    SELECT
      symbol, option_type, strike_price, expiry_date,
      entry_price, target_price, confidence_score, outcome_status,
      EXTRACT(DAY FROM (expiry_date::timestamp - NOW())) as days_to_expiry,
      ((target_price - entry_price) / entry_price * 100) as percent_upside
    FROM trade_ideas
    WHERE source = 'lotto'
      AND asset_type = 'option'
      AND outcome_status = 'open'
      AND expiry_date IS NOT NULL
      AND expiry_date::timestamp > ${ninetyDays.toISOString()}::timestamp
    ORDER BY percent_upside DESC
    LIMIT 20
  `);

  console.log(`Found: ${lottoLeaps.rows.length} lotto LEAPS\n`);

  if (lottoLeaps.rows.length > 0) {
    console.log('─'.repeat(80));
    lottoLeaps.rows.forEach((leap: any, idx) => {
      const cost = (leap.entry_price || 0) * 100;
      const profit = ((leap.target_price || 0) - (leap.entry_price || 0)) * 100;
      const upside = leap.percent_upside?.toFixed(1) || '0';

      console.log(`\n${idx + 1}. ${leap.symbol} ${leap.option_type?.toUpperCase()} $${leap.strike_price}`);
      console.log(`   💰 Cost: $${cost.toFixed(0)}/contract | Target: +${upside}% (+$${profit.toFixed(0)})`);
      console.log(`   📅 Expiry: ${new Date(leap.expiry_date).toLocaleDateString()} (${leap.days_to_expiry}d)`);
      console.log(`   🎯 Confidence: ${leap.confidence_score}%`);
      console.log(`   💡 HIGH RISK/HIGH REWARD - Lotto play!`);
    });
  } else {
    console.log('⚠️  No lotto LEAPS available\n');
  }

  // 2. Check chart_analysis
  console.log('\n\n📈 CHART ANALYSIS - Technical LEAPS:\n');

  const chartLeaps = await db.execute(sql`
    SELECT
      symbol, option_type, strike_price, expiry_date,
      entry_price, target_price, confidence_score, outcome_status,
      EXTRACT(DAY FROM (expiry_date::timestamp - NOW())) as days_to_expiry,
      ((target_price - entry_price) / entry_price * 100) as percent_upside
    FROM trade_ideas
    WHERE source = 'chart_analysis'
      AND asset_type = 'option'
      AND outcome_status = 'open'
      AND expiry_date IS NOT NULL
      AND expiry_date::timestamp > ${ninetyDays.toISOString()}::timestamp
    ORDER BY confidence_score DESC
    LIMIT 20
  `);

  console.log(`Found: ${chartLeaps.rows.length} chart analysis LEAPS\n`);

  if (chartLeaps.rows.length > 0) {
    console.log('─'.repeat(80));
    chartLeaps.rows.forEach((leap: any, idx) => {
      const cost = (leap.entry_price || 0) * 100;
      const upside = leap.percent_upside?.toFixed(1) || '0';

      console.log(`${idx + 1}. ${leap.symbol} ${leap.option_type?.toUpperCase()} $${leap.strike_price} - $${cost.toFixed(0)} - +${upside}% - ${leap.confidence_score}%`);
    });
  }

  // 3. Check ALL options regardless of source
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 EXPANDED SEARCH - Lower criteria (60%+ confidence, up to $500)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const expandedLeaps = await db.execute(sql`
    SELECT
      symbol, option_type, strike_price, expiry_date,
      entry_price, target_price, confidence_score, source, outcome_status,
      EXTRACT(DAY FROM (expiry_date::timestamp - NOW())) as days_to_expiry,
      ((target_price - entry_price) / entry_price * 100) as percent_upside,
      (confidence_score * ((target_price - entry_price) / entry_price * 100)) as quality_score
    FROM trade_ideas
    WHERE asset_type = 'option'
      AND outcome_status = 'open'
      AND expiry_date IS NOT NULL
      AND expiry_date::timestamp > ${ninetyDays.toISOString()}::timestamp
      AND entry_price >= 0.50
      AND entry_price <= 5.00
      AND confidence_score >= 60
    ORDER BY quality_score DESC
    LIMIT 30
  `);

  console.log(`Found: ${expandedLeaps.rows.length} LEAPS with expanded criteria\n`);

  // Group by source
  const bySource = new Map<string, any[]>();
  expandedLeaps.rows.forEach((leap: any) => {
    const source = leap.source || 'unknown';
    if (!bySource.has(source)) {
      bySource.set(source, []);
    }
    bySource.get(source)!.push(leap);
  });

  console.log('Breakdown by source:');
  for (const [source, leaps] of bySource.entries()) {
    console.log(`  ${source}: ${leaps.length} LEAPS`);
  }

  console.log('\n\nTop 15 by Quality Score:');
  console.log('─'.repeat(100));

  expandedLeaps.rows.slice(0, 15).forEach((leap: any, idx) => {
    const cost = (leap.entry_price || 0) * 100;
    const profit = ((leap.target_price || 0) - (leap.entry_price || 0)) * 100;
    const upside = leap.percent_upside?.toFixed(1) || '0';
    const qualityScore = leap.quality_score?.toFixed(0) || '0';

    console.log(`\n${idx + 1}. ${leap.symbol} ${leap.option_type?.toUpperCase()} $${leap.strike_price} | ${leap.source}`);
    console.log(`   💰 Cost: $${cost.toFixed(0)} | Target: +${upside}% (+$${profit.toFixed(0)}) | Quality: ${qualityScore}`);
    console.log(`   📅 ${leap.days_to_expiry}d | 🎯 ${leap.confidence_score}%`);
    console.log(`   💡 Profit: 1 = +$${profit.toFixed(0)} | 3 = +$${(profit * 3).toFixed(0)} | 5 = +$${(profit * 5).toFixed(0)}`);
  });

  // 4. Check what active scanners we have
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🤖 ACTIVE SCANNERS IN DATABASE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const scanners = await db.execute(sql`
    SELECT
      source,
      COUNT(*) as total,
      COUNT(CASE WHEN outcome_status = 'open' THEN 1 END) as open,
      COUNT(CASE WHEN asset_type = 'option' THEN 1 END) as options,
      COUNT(CASE WHEN asset_type = 'option' AND outcome_status = 'open' THEN 1 END) as open_options
    FROM trade_ideas
    GROUP BY source
    ORDER BY total DESC
  `);

  console.log('Scanner              | Total   | Open   | Options | Open Options');
  console.log('─'.repeat(80));
  scanners.rows.forEach((s: any) => {
    console.log(
      `${s.source.padEnd(20)} | ${s.total.toString().padStart(7)} | ` +
      `${s.open.toString().padStart(6)} | ${s.options.toString().padStart(7)} | ${s.open_options.toString().padStart(12)}`
    );
  });

  console.log('\n✅ Complete search finished!\n');
}

completeLeapsSearch().catch(console.error).finally(() => process.exit(0));
