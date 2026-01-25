/**
 * Cleanup Stale Trade Ideas
 *
 * Closes old trade ideas to prevent database bloat and allow new ideas to generate.
 * Run this manually when the system gets clogged with old ideas.
 */

import { db } from 'db';
import { tradeIdeas } from '@shared/schema';
import { sql } from 'drizzle-orm';
import { logger } from './logger';

async function cleanupStaleIdeas() {
  logger.info('[CLEANUP] Starting cleanup of stale trade ideas...');

  // Close ideas older than 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const result = await db
    .update(tradeIdeas)
    .set({ outcomeStatus: 'expired' })
    .where(sql`${tradeIdeas.outcomeStatus} = 'open' AND ${tradeIdeas.timestamp} < ${sevenDaysAgo.toISOString()}`)
    .returning({ id: tradeIdeas.id });

  logger.info(`[CLEANUP] Closed ${result.length} stale trade ideas (older than 7 days)`);

  // Get stats
  const stats = await db
    .select({
      outcomeStatus: tradeIdeas.outcomeStatus,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(tradeIdeas)
    .groupBy(tradeIdeas.outcomeStatus);

  logger.info('[CLEANUP] Current stats:');
  stats.forEach(stat => {
    logger.info(`  ${stat.outcomeStatus}: ${stat.count} ideas`);
  });

  process.exit(0);
}

cleanupStaleIdeas().catch(err => {
  logger.error('[CLEANUP] Failed:', err);
  process.exit(1);
});
