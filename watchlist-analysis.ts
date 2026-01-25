/**
 * Watchlist Analysis - LEAPS and Shares for specific symbols
 */

import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

const WATCHLIST = [
  'NIO', 'ONDS', 'ZETA', 'QBTS', 'LUNR', 'RDW', 'ACHR',
  'CLSK', 'CIFR', 'DNA', 'HIMS', 'SOFI', 'RIVN', 'IONQ'
];

async function analyzeWatchlist() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 WATCHLIST ANALYSIS - LEAPS & SHARES');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`Analyzing: ${WATCHLIST.join(', ')}\n`);

  for (const symbol of WATCHLIST) {
    console.log('\n' + '═'.repeat(80));
    console.log(`📊 ${symbol}`);
    console.log('═'.repeat(80));

    // 1. Search for LEAPS (90+ days, options)
    const ninetyDaysFromNow = new Date();
    ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

    const leaps = await db.execute(sql`
      SELECT
        id,
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
        EXTRACT(DAY FROM (expiry_date::timestamp - NOW())) as days_to_expiry
      FROM trade_ideas
      WHERE symbol = ${symbol}
        AND asset_type = 'option'
        AND expiry_date IS NOT NULL
        AND expiry_date::timestamp > ${ninetyDaysFromNow.toISOString()}::timestamp
      ORDER BY confidence_score DESC, days_to_expiry DESC
      LIMIT 10
    `);

    // 2. Search for shares (stock positions)
    const shares = await db.execute(sql`
      SELECT
        id,
        entry_price,
        target_price,
        stop_loss,
        confidence_score,
        direction,
        source,
        outcome_status,
        percent_gain,
        timestamp
      FROM trade_ideas
      WHERE symbol = ${symbol}
        AND asset_type = 'stock'
      ORDER BY
        CASE
          WHEN outcome_status = 'open' THEN 0
          ELSE 1
        END,
        confidence_score DESC,
        timestamp DESC
      LIMIT 10
    `);

    // 3. Search for swing trades (short-term options, < 90 days)
    const swings = await db.execute(sql`
      SELECT
        id,
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
        EXTRACT(DAY FROM (expiry_date::timestamp - NOW())) as days_to_expiry
      FROM trade_ideas
      WHERE symbol = ${symbol}
        AND asset_type = 'option'
        AND expiry_date IS NOT NULL
        AND expiry_date::timestamp <= ${ninetyDaysFromNow.toISOString()}::timestamp
        AND expiry_date::timestamp > NOW()
      ORDER BY confidence_score DESC
      LIMIT 5
    `);

    // Display results
    if (leaps.rows.length === 0 && shares.rows.length === 0 && swings.rows.length === 0) {
      console.log('\n⚠️  No positions found in database\n');
      continue;
    }

    // LEAPS Section
    if (leaps.rows.length > 0) {
      console.log('\n🎯 LEAPS OPPORTUNITIES (90+ days):');
      console.log('─'.repeat(80));

      leaps.rows.forEach((leap: any, idx) => {
        const cost = (leap.entry_price || 0) * 100;
        const profit = ((leap.target_price || 0) - (leap.entry_price || 0)) * 100;
        const upside = leap.target_price && leap.entry_price
          ? ((leap.target_price - leap.entry_price) / leap.entry_price * 100)
          : 0;

        const status = leap.outcome_status === 'open' ? '⏳ OPEN' :
                       leap.outcome_status === 'won' ? '✅ WON' :
                       leap.outcome_status === 'lost' ? '❌ LOST' : `⚪ ${leap.outcome_status}`;

        console.log(`\n${idx + 1}. ${status} | ${leap.option_type?.toUpperCase()} $${leap.strike_price || 'N/A'}`);
        console.log(`   Expiry: ${leap.expiry_date ? new Date(leap.expiry_date).toLocaleDateString() : 'N/A'} (${leap.days_to_expiry}d)`);
        console.log(`   Cost: $${cost.toFixed(0)}/contract | Target: +${upside.toFixed(1)}% (+$${profit.toFixed(0)})`);
        console.log(`   Confidence: ${leap.confidence_score}% | Source: ${leap.source}`);

        if (leap.outcome_status === 'open') {
          console.log(`   💡 1 contract = +$${profit.toFixed(0)} | 3 contracts = +$${(profit * 3).toFixed(0)} | 5 contracts = +$${(profit * 5).toFixed(0)}`);
        }
      });
    }

    // Shares Section
    if (shares.rows.length > 0) {
      console.log('\n\n📈 STOCK POSITIONS:');
      console.log('─'.repeat(80));

      const openShares = shares.rows.filter((s: any) => s.outcome_status === 'open');
      const closedShares = shares.rows.filter((s: any) => s.outcome_status !== 'open');

      if (openShares.length > 0) {
        console.log('\n⏳ OPEN POSITIONS:');
        openShares.forEach((share: any, idx) => {
          const upside = share.target_price && share.entry_price
            ? ((share.target_price - share.entry_price) / share.entry_price * 100)
            : 0;

          console.log(`\n${idx + 1}. ${share.direction?.toUpperCase()} | Entry: $${share.entry_price?.toFixed(2)}`);
          console.log(`   Target: $${share.target_price?.toFixed(2)} (+${upside.toFixed(1)}%) | Stop: $${share.stop_loss?.toFixed(2)}`);
          console.log(`   Confidence: ${share.confidence_score}% | Source: ${share.source}`);
          console.log(`   Date: ${new Date(share.timestamp).toLocaleDateString()}`);
        });
      }

      if (closedShares.length > 0) {
        console.log('\n\n📊 RECENT PERFORMANCE:');
        closedShares.slice(0, 3).forEach((share: any, idx) => {
          const status = share.outcome_status === 'won' ? '✅ WIN' : '❌ LOSS';
          const pnl = share.percent_gain || 0;

          console.log(`${idx + 1}. ${status} | ${pnl > 0 ? '+' : ''}${pnl.toFixed(2)}% | Conf: ${share.confidence_score}% | ${share.source}`);
        });
      }
    }

    // Swing Trades Section
    if (swings.rows.length > 0) {
      console.log('\n\n⚡ SWING TRADES (< 90 days):');
      console.log('─'.repeat(80));

      swings.rows.forEach((swing: any, idx) => {
        const cost = (swing.entry_price || 0) * 100;
        const upside = swing.target_price && swing.entry_price
          ? ((swing.target_price - swing.entry_price) / swing.entry_price * 100)
          : 0;

        const status = swing.outcome_status === 'open' ? '⏳ OPEN' :
                       swing.outcome_status === 'won' ? '✅ WON' :
                       swing.outcome_status === 'lost' ? '❌ LOST' : `⚪ ${swing.outcome_status}`;

        console.log(`\n${idx + 1}. ${status} | ${swing.option_type?.toUpperCase()} $${swing.strike_price || 'N/A'}`);
        console.log(`   Expiry: ${swing.expiry_date ? new Date(swing.expiry_date).toLocaleDateString() : 'N/A'} (${swing.days_to_expiry}d)`);
        console.log(`   Cost: $${cost.toFixed(0)}/contract | Target: +${upside.toFixed(1)}%`);
        console.log(`   Confidence: ${swing.confidence_score}% | Source: ${swing.source}`);
      });
    }
  }

  // Summary Statistics
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 WATCHLIST SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  for (const symbol of WATCHLIST) {
    const leapsCount = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM trade_ideas
      WHERE symbol = ${symbol}
        AND asset_type = 'option'
        AND outcome_status = 'open'
        AND EXTRACT(DAY FROM (expiry_date::timestamp - NOW())) >= 90
    `);

    const sharesCount = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM trade_ideas
      WHERE symbol = ${symbol}
        AND asset_type = 'stock'
        AND outcome_status = 'open'
    `);

    const swingsCount = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM trade_ideas
      WHERE symbol = ${symbol}
        AND asset_type = 'option'
        AND outcome_status = 'open'
        AND expiry_date IS NOT NULL
        AND EXTRACT(DAY FROM (expiry_date::timestamp - NOW())) < 90
        AND expiry_date::timestamp > NOW()
    `);

    const leaps = leapsCount.rows[0]?.count || 0;
    const shares = sharesCount.rows[0]?.count || 0;
    const swings = swingsCount.rows[0]?.count || 0;

    if (leaps > 0 || shares > 0 || swings > 0) {
      console.log(
        `${symbol.padEnd(6)} | ` +
        `LEAPS: ${leaps.toString().padStart(2)} | ` +
        `Shares: ${shares.toString().padStart(2)} | ` +
        `Swings: ${swings.toString().padStart(2)}`
      );
    }
  }

  console.log('\n✅ Watchlist analysis complete!\n');
}

analyzeWatchlist().catch(console.error).finally(() => process.exit(0));
