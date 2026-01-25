/**
 * Search for ONDS LEAPS opportunities
 */

import 'dotenv/config';
import { db } from './server/db';
import { tradeIdeas } from './shared/schema';
import { desc, eq, and, gte, sql } from 'drizzle-orm';

async function searchONDSLeaps() {
  console.log('\n🔍 Searching for ONDS LEAPS...\n');

  // Search for any ONDS options
  const ondsOptions = await db
    .select()
    .from(tradeIdeas)
    .where(
      and(
        eq(tradeIdeas.symbol, 'ONDS'),
        eq(tradeIdeas.assetType, 'option')
      )
    )
    .orderBy(desc(tradeIdeas.timestamp))
    .limit(20);

  if (ondsOptions.length > 0) {
    console.log(`✅ Found ${ondsOptions.length} ONDS options:\n`);

    for (const opt of ondsOptions) {
      const daysToExpiry = opt.expiryDate
        ? Math.floor((new Date(opt.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : 0;

      const isLeap = daysToExpiry >= 90;
      const label = isLeap ? '📌 LEAP' : '📍 Option';

      const optType = opt.optionType ? opt.optionType.toUpperCase() : 'N/A';

      console.log(`${label} | ${optType} $${opt.strikePrice} | ${daysToExpiry}d DTE`);
      console.log(`   Status: ${opt.outcomeStatus} | Conf: ${opt.confidenceScore}%`);
      console.log(`   Entry: $${opt.entryPrice} → Target: $${opt.targetPrice}`);
      console.log(`   Expiry: ${opt.expiryDate ? new Date(opt.expiryDate).toLocaleDateString() : 'N/A'}`);
      console.log(`   Source: ${opt.source} | Added: ${new Date(opt.timestamp).toLocaleDateString()}\n`);
    }
  } else {
    console.log('❌ No ONDS options found in database\n');
  }

  // Also search for any open ONDS positions (stock or options)
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 All Open ONDS Positions:\n');

  const openONDS = await db
    .select()
    .from(tradeIdeas)
    .where(
      and(
        eq(tradeIdeas.symbol, 'ONDS'),
        eq(tradeIdeas.outcomeStatus, 'open')
      )
    )
    .orderBy(desc(tradeIdeas.timestamp));

  if (openONDS.length > 0) {
    for (const pos of openONDS) {
      const assetType = pos.assetType ? pos.assetType.toUpperCase() : 'N/A';
      const direction = pos.direction ? pos.direction.toUpperCase() : 'N/A';

      console.log(`${assetType} | ${direction} | Conf: ${pos.confidenceScore}%`);
      console.log(`   Entry: $${pos.entryPrice} → Target: $${pos.targetPrice} | Stop: $${pos.stopLoss}`);
      console.log(`   Source: ${pos.source} | Date: ${new Date(pos.timestamp).toLocaleDateString()}\n`);
    }
  } else {
    console.log('No open ONDS positions\n');
  }

  console.log('✅ Search complete!\n');
}

searchONDSLeaps().catch(console.error).finally(() => process.exit(0));
