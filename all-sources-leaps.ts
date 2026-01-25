/**
 * Query ALL sources (flow, quant, ml, ai) for LEAPS
 */

import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function findAllSourcesLeaps() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🤖 ALL SOURCES LEAPS FINDER - Flow + Quant + ML + AI');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // First, check what sources exist
  console.log('📊 Checking available sources...\\n');

  const sources = await db.execute(sql`
    SELECT
      source,
      COUNT(*) as total,
      COUNT(CASE WHEN outcome_status = 'open' THEN 1 END) as open_count,
      COUNT(CASE WHEN asset_type = 'option' THEN 1 END) as options_count
    FROM trade_ideas
    GROUP BY source
    ORDER BY total DESC
  `);

  console.log('Available Sources:');
  console.log('─'.repeat(60));
  sources.rows.forEach((s: any) => {
    console.log(`${s.source.padEnd(20)} | Total: ${s.total.toString().padStart(6)} | Open: ${s.open_count.toString().padStart(5)} | Options: ${s.options_count.toString().padStart(5)}`);
  });

  const ninetyDaysFromNow = new Date();
  ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

  // Query LEAPS from ALL sources
  console.log('\\n\\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 SEARCHING ALL SOURCES FOR HIGH-CONFIDENCE LEAPS...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\n');

  const allSourcesLeaps = await db.execute(sql`
    SELECT
      symbol,
      option_type,
      strike_price,
      expiry_date,
      entry_price,
      target_price,
      stop_loss,
      confidence_score,
      source,
      direction,
      timestamp,
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
      AND confidence_score >= 70
    ORDER BY quality_score DESC
    LIMIT 30
  `);

  console.log(`Found ${allSourcesLeaps.rows.length} LEAPS across all sources\\n`);

  // Group by source
  const bySource = new Map<string, any[]>();
  allSourcesLeaps.rows.forEach((leap: any) => {
    const source = leap.source || 'unknown';
    if (!bySource.has(source)) {
      bySource.set(source, []);
    }
    bySource.get(source)!.push(leap);
  });

  // Display by source
  for (const [source, leaps] of bySource.entries()) {
    console.log('\\n' + '═'.repeat(80));
    console.log(`🎯 ${source.toUpperCase()} ENGINE - ${leaps.length} LEAPS`);
    console.log('═'.repeat(80));

    leaps.slice(0, 10).forEach((leap: any, idx) => {
      const cost = (leap.entry_price || 0) * 100;
      const profit = ((leap.target_price || 0) - (leap.entry_price || 0)) * 100;
      const upside = leap.percent_upside?.toFixed(1) || '0.0';
      const qualityScore = leap.quality_score?.toFixed(0) || '0';

      console.log(`\\n${idx + 1}. ${leap.symbol} ${leap.option_type?.toUpperCase()} $${leap.strike_price}`);
      console.log(`   💰 Cost: $${cost.toFixed(0)}/contract | Target: +${upside}% (+$${profit.toFixed(0)})`);
      console.log(`   📅 Expiry: ${new Date(leap.expiry_date).toLocaleDateString()} (${leap.days_to_expiry}d)`);
      console.log(`   🎯 Confidence: ${leap.confidence_score}% | Quality Score: ${qualityScore}`);
      console.log(`   💡 Profit: 1 = +$${profit.toFixed(0)} | 3 = +$${(profit * 3).toFixed(0)} | 5 = +$${(profit * 5).toFixed(0)}`);
    });
  }

  // Top 10 across ALL sources
  console.log('\\n\\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏆 TOP 10 LEAPS - ALL SOURCES COMBINED (by Quality Score)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\n');

  allSourcesLeaps.rows.slice(0, 10).forEach((leap: any, idx) => {
    const cost = (leap.entry_price || 0) * 100;
    const profit = ((leap.target_price || 0) - (leap.entry_price || 0)) * 100;
    const upside = leap.percent_upside?.toFixed(1) || '0.0';
    const qualityScore = leap.quality_score?.toFixed(0) || '0';

    console.log(`\\n🏆 #${idx + 1}: ${leap.symbol} ${leap.option_type?.toUpperCase()} $${leap.strike_price}`);
    console.log(`   Source: ${leap.source} | Quality Score: ${qualityScore}`);
    console.log(`   💰 Cost: $${cost.toFixed(0)} | Target: +${upside}% (+$${profit.toFixed(0)})`);
    console.log(`   📅 Expiry: ${new Date(leap.expiry_date).toLocaleDateString()} (${leap.days_to_expiry}d)`);
    console.log(`   🎯 Confidence: ${leap.confidence_score}%`);
    console.log(`   💡 Profit: 1 = +$${profit.toFixed(0)} | 3 = +$${(profit * 3).toFixed(0)} | 5 = +$${(profit * 5).toFixed(0)} | 10 = +$${(profit * 10).toFixed(0)}`);
  });

  // Watchlist check across all sources
  const WATCHLIST = [
    'NIO', 'ONDS', 'ZETA', 'QBTS', 'LUNR', 'RDW', 'ACHR',
    'CLSK', 'CIFR', 'DNA', 'HIMS', 'SOFI', 'RIVN', 'IONQ'
  ];

  console.log('\\n\\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⭐ WATCHLIST LEAPS - ALL SOURCES');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\n');

  const watchlistSymbols = WATCHLIST.join("','");

  const watchlistLeaps = await db.execute(sql`
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
    WHERE symbol IN ('${sql.raw(watchlistSymbols)}')
      AND asset_type = 'option'
      AND outcome_status = 'open'
      AND expiry_date IS NOT NULL
      AND expiry_date::timestamp > ${ninetyDaysFromNow.toISOString()}::timestamp
      AND entry_price >= 0.50
      AND entry_price <= 5.00
    ORDER BY quality_score DESC
  `);

  if (watchlistLeaps.rows.length > 0) {
    watchlistLeaps.rows.forEach((leap: any, idx) => {
      const cost = (leap.entry_price || 0) * 100;
      const profit = ((leap.target_price || 0) - (leap.entry_price || 0)) * 100;
      const upside = leap.percent_upside?.toFixed(1) || '0.0';

      console.log(`\\n${idx + 1}. ${leap.symbol} ${leap.option_type?.toUpperCase()} $${leap.strike_price}`);
      console.log(`   Source: ${leap.source} | Confidence: ${leap.confidence_score}%`);
      console.log(`   💰 Cost: $${cost.toFixed(0)} | Target: +${upside}% (+$${profit.toFixed(0)})`);
      console.log(`   📅 Expiry: ${new Date(leap.expiry_date).toLocaleDateString()} (${leap.days_to_expiry}d)`);
      console.log(`   💡 Profit: 1 = +$${profit.toFixed(0)} | 3 = +$${(profit * 3).toFixed(0)} | 5 = +$${(profit * 5).toFixed(0)}`);
    });
  } else {
    console.log('⚠️  No LEAPS found for watchlist symbols\\n');
  }

  console.log('\\n✅ Multi-source LEAPS search complete!\\n');
}

findAllSourcesLeaps().catch(console.error).finally(() => process.exit(0));
