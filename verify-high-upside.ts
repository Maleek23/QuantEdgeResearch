/**
 * Verify high upside plays and check what ML/algo tools exist
 */

import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';
import { readdir } from 'fs/promises';
import { join } from 'path';

async function verifyHighUpside() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 VERIFYING HIGH UPSIDE PLAYS & ML TOOLS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 1. Check 400% plays - are they real or errors?
  console.log('📊 Checking 400% upside plays:\n');

  const highUpsidePlays = await db.execute(sql`
    SELECT
      symbol, option_type, strike_price, entry_price, target_price,
      confidence_score, source, timestamp,
      ((target_price - entry_price) / entry_price * 100) as percent_upside
    FROM trade_ideas
    WHERE asset_type = 'option'
      AND outcome_status = 'open'
      AND ((target_price - entry_price) / entry_price * 100) > 100
    ORDER BY percent_upside DESC
    LIMIT 10
  `);

  if (highUpsidePlays.rows.length > 0) {
    highUpsidePlays.rows.forEach((p: any) => {
      console.log(`${p.symbol} ${p.option_type} $${p.strike_price}`);
      console.log(`  Entry: $${p.entry_price.toFixed(2)} → Target: $${p.target_price.toFixed(2)} = +${p.percent_upside.toFixed(0)}%`);
      console.log(`  Source: ${p.source} | Confidence: ${p.confidence_score}%`);
      console.log(`  Date: ${new Date(p.timestamp).toLocaleDateString()}\n`);
    });
  } else {
    console.log('No plays with >100% upside found\n');
  }

  // 2. Check what scanner files exist in server/
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🤖 CHECKING ACTIVE SCANNER FILES IN server/');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const serverFiles = await readdir('./server');
    const scanners = serverFiles.filter(f =>
      f.includes('scanner') ||
      f.includes('bot') ||
      f.includes('engine') ||
      f.includes('flow') ||
      f.includes('quant') ||
      f.includes('ml') ||
      f.includes('ai') ||
      f.includes('lotto')
    );

    console.log('Scanner/Engine files found:');
    scanners.forEach(s => console.log(`  - ${s}`));

    if (scanners.length === 0) {
      console.log('  ⚠️  No scanner files found in server/');
    }
  } catch (err) {
    console.log('Could not read server directory');
  }

  // 3. Check confidence distribution
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 CONFIDENCE SCORE DISTRIBUTION (Open Options)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const confDistribution = await db.execute(sql`
    SELECT
      CASE
        WHEN confidence_score >= 90 THEN '90-100%'
        WHEN confidence_score >= 80 THEN '80-89%'
        WHEN confidence_score >= 70 THEN '70-79%'
        WHEN confidence_score >= 60 THEN '60-69%'
        WHEN confidence_score >= 50 THEN '50-59%'
        ELSE 'Below 50%'
      END as bucket,
      COUNT(*) as count,
      source
    FROM trade_ideas
    WHERE asset_type = 'option'
      AND outcome_status = 'open'
    GROUP BY bucket, source
    ORDER BY source, bucket DESC
  `);

  const bySource = new Map<string, any[]>();
  confDistribution.rows.forEach((row: any) => {
    if (!bySource.has(row.source)) {
      bySource.set(row.source, []);
    }
    bySource.get(row.source)!.push(row);
  });

  for (const [source, buckets] of bySource.entries()) {
    console.log(`${source.toUpperCase()}:`);
    buckets.forEach((b: any) => {
      console.log(`  ${b.bucket.padEnd(12)}: ${b.count.toString().padStart(4)} options`);
    });
    console.log('');
  }

  // 4. Check what's actually generating predictions
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⏰ RECENT ACTIVITY - Last 24 hours');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const recentActivity = await db.execute(sql`
    SELECT
      source,
      asset_type,
      COUNT(*) as count
    FROM trade_ideas
    WHERE timestamp > ${yesterday.toISOString()}
    GROUP BY source, asset_type
    ORDER BY count DESC
  `);

  if (recentActivity.rows.length > 0) {
    console.log('Source           | Type     | Count');
    console.log('─'.repeat(40));
    recentActivity.rows.forEach((r: any) => {
      console.log(`${r.source.padEnd(16)} | ${r.asset_type.padEnd(8)} | ${r.count}`);
    });
  } else {
    console.log('⚠️  No new trade ideas in last 24 hours');
  }

  console.log('\n✅ Verification complete!\n');
}

verifyHighUpside().catch(console.error).finally(() => process.exit(0));
