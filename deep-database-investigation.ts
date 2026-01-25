import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

(async () => {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 DEEP DATABASE INVESTIGATION - WHAT\'S REALLY IN THERE?');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 1. Check TOTAL options in database (not just open)
  const totalOptions = await db.execute(sql`
    SELECT
      outcome_status,
      COUNT(*) as count,
      COUNT(CASE WHEN expiry_date IS NOT NULL AND expiry_date != ''
        AND EXTRACT(DAY FROM (expiry_date::timestamp - NOW())) >= 90 THEN 1 END) as leaps_count
    FROM trade_ideas
    WHERE asset_type = 'option'
    GROUP BY outcome_status
    ORDER BY count DESC
  `);

  console.log('📊 TOTAL OPTIONS IN DATABASE (ALL statuses):\n');
  console.log('Status           | Total Options | 90+ Day LEAPS');
  console.log('─'.repeat(60));
  totalOptions.rows.forEach((row: any) => {
    console.log(`${row.outcome_status.padEnd(16)} | ${row.count.toString().padStart(13)} | ${row.leaps_count.toString().padStart(13)}`);
  });

  // 2. Check recent flow activity
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🌊 RECENT FLOW SCANNER ACTIVITY (Last 7 days):');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentFlow = await db.execute(sql`
    SELECT
      outcome_status,
      COUNT(*) as count,
      COUNT(CASE WHEN expiry_date IS NOT NULL AND expiry_date != ''
        AND EXTRACT(DAY FROM (expiry_date::timestamp - NOW())) >= 90 THEN 1 END) as leaps_count,
      AVG(entry_price) as avg_price,
      MIN(entry_price) as min_price,
      MAX(entry_price) as max_price
    FROM trade_ideas
    WHERE source = 'flow'
      AND asset_type = 'option'
      AND timestamp > ${sevenDaysAgo.toISOString()}
    GROUP BY outcome_status
  `);

  console.log('Status           | Count  | LEAPS | Avg Price | Min   | Max');
  console.log('─'.repeat(70));
  recentFlow.rows.forEach((row: any) => {
    console.log(
      `${row.outcome_status.padEnd(16)} | ${row.count.toString().padStart(6)} | ` +
      `${row.leaps_count.toString().padStart(5)} | $${(row.avg_price * 100).toFixed(0).padStart(8)} | ` +
      `$${(row.min_price * 100).toFixed(0).padStart(4)} | $${(row.max_price * 100).toFixed(0).padStart(6)}`
    );
  });

  // 3. Show sample of what was generated
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 SAMPLE OF RECENT FLOW OPTIONS (Last 24 hours):');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const recentSample = await db.execute(sql`
    SELECT
      symbol, option_type, strike_price, entry_price, confidence_score,
      outcome_status, expiry_date,
      CASE WHEN expiry_date IS NOT NULL AND expiry_date != ''
        THEN EXTRACT(DAY FROM (expiry_date::timestamp - NOW()))
        ELSE NULL END as dte
    FROM trade_ideas
    WHERE source = 'flow'
      AND asset_type = 'option'
      AND timestamp > ${yesterday.toISOString()}
    ORDER BY entry_price ASC
    LIMIT 30
  `);

  console.log('Symbol  Type Strike  Cost    Conf  Status          DTE    Expiry');
  console.log('─'.repeat(80));
  recentSample.rows.forEach((opt: any) => {
    const cost = ((opt.entry_price || 0) * 100).toFixed(0);
    const expiry = opt.expiry_date ? new Date(opt.expiry_date).toLocaleDateString() : 'N/A';
    console.log(
      `${opt.symbol.padEnd(7)} ${(opt.option_type?.toUpperCase() || '').padEnd(4)} ` +
      `$${opt.strike_price.toString().padEnd(6)} $${cost.padStart(5)} ${opt.confidence_score.toString().padStart(3)}% ` +
      `${opt.outcome_status.padEnd(15)} ${opt.dte ? opt.dte.toString().padStart(4) : 'N/A'.padStart(4)} ${expiry}`
    );
  });

  // 4. Check if scanners are configured to look for LEAPS
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔧 CHECKING IF LEAPS ARE BEING SCANNED AT ALL:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const leapsBySource = await db.execute(sql`
    SELECT
      source,
      COUNT(*) as total,
      COUNT(CASE WHEN expiry_date IS NOT NULL AND expiry_date != ''
        AND EXTRACT(DAY FROM (expiry_date::timestamp - NOW())) >= 90 THEN 1 END) as leaps_90d,
      COUNT(CASE WHEN expiry_date IS NOT NULL AND expiry_date != ''
        AND EXTRACT(DAY FROM (expiry_date::timestamp - NOW())) >= 180 THEN 1 END) as leaps_180d,
      COUNT(CASE WHEN expiry_date IS NOT NULL AND expiry_date != ''
        AND EXTRACT(DAY FROM (expiry_date::timestamp - NOW())) >= 365 THEN 1 END) as leaps_365d
    FROM trade_ideas
    WHERE asset_type = 'option'
      AND timestamp > ${sevenDaysAgo.toISOString()}
    GROUP BY source
    ORDER BY total DESC
  `);

  console.log('Source           | Total   | 90+ day | 180+ day | 365+ day');
  console.log('─'.repeat(70));
  leapsBySource.rows.forEach((row: any) => {
    console.log(
      `${row.source.padEnd(16)} | ${row.total.toString().padStart(7)} | ` +
      `${row.leaps_90d.toString().padStart(7)} | ${row.leaps_180d.toString().padStart(8)} | ${row.leaps_365d.toString().padStart(8)}`
    );
  });

  // 5. Show why things are marked as closed
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('❌ WHY ARE OPTIONS MARKED AS CLOSED?');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const closedReasons = await db.execute(sql`
    SELECT
      outcome_status,
      COUNT(*) as count
    FROM trade_ideas
    WHERE asset_type = 'option'
      AND outcome_status != 'open'
      AND timestamp > ${sevenDaysAgo.toISOString()}
    GROUP BY outcome_status
    ORDER BY count DESC
  `);

  console.log('Status              | Count');
  console.log('─'.repeat(40));
  closedReasons.rows.forEach((row: any) => {
    console.log(`${row.outcome_status.padEnd(19)} | ${row.count.toString().padStart(5)}`);
  });

  // 6. Check ALL options regardless of status for budget LEAPS
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💎 BUDGET LEAPS IN DATABASE (INCLUDING CLOSED):');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const ninetyDays = new Date();
  ninetyDays.setDate(ninetyDays.getDate() + 90);

  const allBudgetLeaps = await db.execute(sql`
    SELECT
      symbol, option_type, strike_price, entry_price, confidence_score,
      outcome_status, source,
      CASE WHEN expiry_date IS NOT NULL AND expiry_date != ''
        THEN EXTRACT(DAY FROM (expiry_date::timestamp - NOW()))
        ELSE NULL END as dte,
      timestamp
    FROM trade_ideas
    WHERE asset_type = 'option'
      AND expiry_date IS NOT NULL AND expiry_date != ''
      AND expiry_date::timestamp > ${ninetyDays.toISOString()}::timestamp
      AND entry_price >= 0.50 AND entry_price <= 3.00
      AND timestamp > ${sevenDaysAgo.toISOString()}
    ORDER BY confidence_score DESC, outcome_status
    LIMIT 50
  `);

  console.log(`Found ${allBudgetLeaps.rows.length} budget LEAPS (last 7 days, including closed)\n`);

  console.log('Symbol  Type Strike  Cost  Conf  Status          DTE   Source    Created');
  console.log('─'.repeat(90));
  allBudgetLeaps.rows.forEach((opt: any) => {
    const cost = ((opt.entry_price || 0) * 100).toFixed(0);
    const created = new Date(opt.timestamp).toLocaleDateString();
    console.log(
      `${opt.symbol.padEnd(7)} ${(opt.option_type?.toUpperCase() || '').padEnd(4)} ` +
      `$${opt.strike_price.toString().padEnd(6)} $${cost.padStart(4)} ${opt.confidence_score.toString().padStart(3)}% ` +
      `${opt.outcome_status.padEnd(15)} ${opt.dte.toString().padStart(4)} ${opt.source.padEnd(9)} ${created}`
    );
  });

  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💡 FINDINGS:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('1. Check if scanners are even GENERATING LEAPS');
  console.log('2. Check if options are being auto-closed too aggressively');
  console.log('3. Check if flow scanner is configured for long-dated options');
  console.log('4. Verify if the platform is scanning ALL stocks or just a subset\n');

  process.exit(0);
})();
