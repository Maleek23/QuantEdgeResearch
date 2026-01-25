/**
 * Check if Quant and ML engines have any LEAPS
 */

import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function checkQuantMLOptions() {
  const ninetyDays = new Date();
  ninetyDays.setDate(ninetyDays.getDate() + 90);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔬 CHECKING QUANT & ML ENGINES FOR OPTIONS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Check quant options (any price, any confidence)
  const quantOptions = await db.execute(sql`
    SELECT
      symbol, option_type, strike_price, expiry_date, entry_price,
      target_price, confidence_score, outcome_status,
      EXTRACT(DAY FROM (expiry_date::timestamp - NOW())) as days_to_expiry,
      ((target_price - entry_price) / entry_price * 100) as percent_upside
    FROM trade_ideas
    WHERE source = 'quant'
      AND asset_type = 'option'
      AND outcome_status = 'open'
      AND expiry_date IS NOT NULL
      AND expiry_date::timestamp > ${ninetyDays.toISOString()}::timestamp
    ORDER BY confidence_score DESC, days_to_expiry DESC
    LIMIT 20
  `);

  console.log('🔬 QUANT ENGINE OPTIONS (90+ days):');
  console.log(`Found: ${quantOptions.rows.length} open LEAPS\n`);

  if (quantOptions.rows.length > 0) {
    console.log('─'.repeat(80));
    quantOptions.rows.forEach((o: any, idx) => {
      const cost = (o.entry_price || 0) * 100;
      const upside = o.percent_upside?.toFixed(1) || '0';
      console.log(`\n${idx + 1}. ${o.symbol} ${o.option_type?.toUpperCase()} $${o.strike_price}`);
      console.log(`   Cost: $${cost.toFixed(0)}/contract | Target: +${upside}%`);
      console.log(`   Confidence: ${o.confidence_score}% | Days: ${o.days_to_expiry}`);
    });
  } else {
    console.log('⚠️  No LEAPS found from quant engine\n');
  }

  // Check AI options
  const aiOptions = await db.execute(sql`
    SELECT
      symbol, option_type, strike_price, expiry_date, entry_price,
      target_price, confidence_score, outcome_status,
      EXTRACT(DAY FROM (expiry_date::timestamp - NOW())) as days_to_expiry,
      ((target_price - entry_price) / entry_price * 100) as percent_upside
    FROM trade_ideas
    WHERE source = 'ai'
      AND asset_type = 'option'
      AND outcome_status = 'open'
      AND expiry_date IS NOT NULL
      AND expiry_date::timestamp > ${ninetyDays.toISOString()}::timestamp
    ORDER BY confidence_score DESC, days_to_expiry DESC
    LIMIT 20
  `);

  console.log('\n\n🤖 AI/ML ENGINE OPTIONS (90+ days):');
  console.log(`Found: ${aiOptions.rows.length} open LEAPS\n`);

  if (aiOptions.rows.length > 0) {
    console.log('─'.repeat(80));
    aiOptions.rows.forEach((o: any, idx) => {
      const cost = (o.entry_price || 0) * 100;
      const upside = o.percent_upside?.toFixed(1) || '0';
      console.log(`\n${idx + 1}. ${o.symbol} ${o.option_type?.toUpperCase()} $${o.strike_price}`);
      console.log(`   Cost: $${cost.toFixed(0)}/contract | Target: +${upside}%`);
      console.log(`   Confidence: ${o.confidence_score}% | Days: ${o.days_to_expiry}`);
    });
  } else {
    console.log('⚠️  No LEAPS found from AI engine\n');
  }

  // Check what quant IS generating
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 QUANT ENGINE FOCUS - What is it generating?');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const quantStocks = await db.execute(sql`
    SELECT
      symbol, entry_price, target_price, confidence_score,
      direction, outcome_status
    FROM trade_ideas
    WHERE source = 'quant'
      AND asset_type = 'stock'
      AND outcome_status = 'open'
    ORDER BY confidence_score DESC
    LIMIT 10
  `);

  console.log(`Quant has ${quantStocks.rows.length} open STOCK positions:\n`);
  quantStocks.rows.forEach((s: any, idx) => {
    const upside = s.target_price && s.entry_price
      ? ((s.target_price - s.entry_price) / s.entry_price * 100).toFixed(1)
      : '0';
    console.log(`${idx + 1}. ${s.symbol} - Entry: $${s.entry_price?.toFixed(2)} | Target: +${upside}% | Conf: ${s.confidence_score}%`);
  });

  console.log('\n✅ Check complete!\n');
}

checkQuantMLOptions().catch(console.error).finally(() => process.exit(0));
