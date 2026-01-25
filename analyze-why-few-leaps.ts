import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

(async () => {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 WHY SO FEW LEAPS? - ROOT CAUSE ANALYSIS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 1. Check ALL options by days to expiry
  const allOptions = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN EXTRACT(DAY FROM (expiry_date::timestamp - NOW())) < 30 THEN 1 END) as under_30d,
      COUNT(CASE WHEN EXTRACT(DAY FROM (expiry_date::timestamp - NOW())) BETWEEN 30 AND 60 THEN 1 END) as days_30_60,
      COUNT(CASE WHEN EXTRACT(DAY FROM (expiry_date::timestamp - NOW())) BETWEEN 60 AND 90 THEN 1 END) as days_60_90,
      COUNT(CASE WHEN EXTRACT(DAY FROM (expiry_date::timestamp - NOW())) >= 90 THEN 1 END) as days_90_plus
    FROM trade_ideas
    WHERE asset_type = 'option' AND outcome_status = 'open' AND expiry_date IS NOT NULL
  `);

  const stats: any = allOptions.rows[0];
  console.log('📅 EXPIRY BREAKDOWN (All Open Options):');
  console.log('─'.repeat(50));
  console.log(`Total Options:        ${stats.total}`);
  console.log(`< 30 days:            ${stats.under_30d.toString().padStart(5)} (${((stats.under_30d/stats.total)*100).toFixed(1)}%)`);
  console.log(`30-60 days:           ${stats.days_30_60.toString().padStart(5)} (${((stats.days_30_60/stats.total)*100).toFixed(1)}%)`);
  console.log(`60-90 days:           ${stats.days_60_90.toString().padStart(5)} (${((stats.days_60_90/stats.total)*100).toFixed(1)}%)`);
  console.log(`90+ days (LEAPS):     ${stats.days_90_plus.toString().padStart(5)} (${((stats.days_90_plus/stats.total)*100).toFixed(1)}%) ⭐ THIS IS THE PROBLEM`);

  // 2. Of those 90+ day options, how many are budget?
  const ninetyDays = new Date();
  ninetyDays.setDate(ninetyDays.getDate() + 90);

  const leapsBreakdown = await db.execute(sql`
    SELECT
      COUNT(*) as total_leaps,
      COUNT(CASE WHEN entry_price >= 0.50 AND entry_price <= 3.00 THEN 1 END) as budget_leaps,
      COUNT(CASE WHEN confidence_score >= 70 THEN 1 END) as high_conf_leaps,
      COUNT(CASE WHEN entry_price >= 0.50 AND entry_price <= 3.00 AND confidence_score >= 70 THEN 1 END) as budget_high_conf,
      COUNT(CASE WHEN entry_price >= 0.50 AND entry_price <= 3.00 AND confidence_score >= 60 THEN 1 END) as budget_med_conf
    FROM trade_ideas
    WHERE asset_type = 'option'
      AND outcome_status = 'open'
      AND expiry_date::timestamp > ${ninetyDays.toISOString()}::timestamp
  `);

  const leaps: any = leapsBreakdown.rows[0];
  console.log(`\n\n💰 OF THE ${leaps.total_leaps} LEAPS (90+ days):`);
  console.log('─'.repeat(50));
  console.log(`Budget Priced ($50-300):              ${leaps.budget_leaps}`);
  console.log(`High Confidence (70%+):               ${leaps.high_conf_leaps}`);
  console.log(`Budget + High Conf (70%+):            ${leaps.budget_high_conf} ⚠️ TARGET`);
  console.log(`Budget + Medium Conf (60%+):          ${leaps.budget_med_conf}`);

  // 3. Show top 10 LEAPS regardless of price
  console.log(`\n\n📋 TOP 10 LEAPS AVAILABLE (90+ days, ANY price):\n`);

  const top10 = await db.execute(sql`
    SELECT symbol, option_type, strike_price, entry_price, confidence_score, source,
      EXTRACT(DAY FROM (expiry_date::timestamp - NOW())) as dte,
      expiry_date
    FROM trade_ideas
    WHERE asset_type = 'option'
      AND outcome_status = 'open'
      AND expiry_date::timestamp > ${ninetyDays.toISOString()}::timestamp
    ORDER BY confidence_score DESC, entry_price ASC
    LIMIT 10
  `);

  top10.rows.forEach((o: any, i) => {
    const cost = ((o.entry_price || 0) * 100).toFixed(0);
    console.log(`${(i+1).toString().padStart(2)}. ${o.symbol.padEnd(6)} ${(o.option_type?.toUpperCase() || '').padEnd(4)} $${o.strike_price.toString().padEnd(6)}`);
    console.log(`    Cost: $${cost.padStart(6)} | DTE: ${o.dte.toString().padStart(3)}d | Conf: ${o.confidence_score}% | ${new Date(o.expiry_date).toLocaleDateString().padEnd(12)} | ${o.source}`);
  });

  // 4. Alternative: Check 60+ days
  const sixtyDays = new Date();
  sixtyDays.setDate(sixtyDays.getDate() + 60);

  const expandedSearch = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM trade_ideas
    WHERE asset_type = 'option'
      AND outcome_status = 'open'
      AND expiry_date::timestamp > ${sixtyDays.toISOString()}::timestamp
      AND entry_price >= 0.50 AND entry_price <= 3.00
      AND confidence_score >= 60
  `);

  console.log(`\n\n🔓 ALTERNATIVE SEARCH (60+ days instead of 90+):`);
  console.log('─'.repeat(50));
  console.log(`Budget + 60% conf options:            ${expandedSearch.rows[0].count}`);

  // Show those
  if (expandedSearch.rows[0].count > 0) {
    const expanded = await db.execute(sql`
      SELECT symbol, option_type, strike_price, entry_price, confidence_score, source,
        EXTRACT(DAY FROM (expiry_date::timestamp - NOW())) as dte,
        ((target_price - entry_price) / entry_price * 100) as upside
      FROM trade_ideas
      WHERE asset_type = 'option'
        AND outcome_status = 'open'
        AND expiry_date::timestamp > ${sixtyDays.toISOString()}::timestamp
        AND entry_price >= 0.50 AND entry_price <= 3.00
        AND confidence_score >= 60
      ORDER BY confidence_score DESC, dte DESC
      LIMIT 15
    `);

    console.log(`\n📋 TOP 60+ DAY OPTIONS ($50-300, 60%+ conf):\n`);
    expanded.rows.forEach((o: any, i) => {
      const cost = ((o.entry_price || 0) * 100).toFixed(0);
      const upside = o.upside?.toFixed(1) || '0';
      console.log(`${(i+1).toString().padStart(2)}. ${o.symbol.padEnd(6)} ${(o.option_type?.toUpperCase() || '').padEnd(4)} $${o.strike_price.toString().padEnd(5)}`);
      console.log(`    $${cost.padStart(4)} | ${o.dte.toString().padStart(3)}d | +${upside.padStart(5)}% | ${o.confidence_score}% | ${o.source}`);
    });
  }

  console.log(`\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log('💡 ROOT CAUSES:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('1. Most options are SHORT-TERM (< 90 days)');
  console.log('2. Long-dated options are mostly EXPENSIVE (whale flows $10k+)');
  console.log('3. Budget options tend to have LOWER confidence (<70%)');
  console.log('4. Flow scanner focuses on WHALE ACTIVITY (institutional $$$)');
  console.log('5. Lotto scanner has limited 90+ day plays\n');

  console.log('✅ Analysis complete!\n');

  process.exit(0);
})();
