/**
 * The admin "withheld" list — every automated idea the write point refused
 * (options-only rule, short-dated guard, liquidity gate). Stored in the
 * existing analysis_audit_log table (consumed_by 'withheld_idea'; no
 * migration). Recording never throws and never blocks the caller.
 */
import { logger } from '../logger';
import { withheldRecord, type WithheldRecord } from '@shared/options-only';

export const WITHHELD_CONSUMER = 'withheld_idea';

export async function recordWithheldIdea(idea: Record<string, any>, code: string, reason: string, nowMs = Date.now()): Promise<void> {
  const rec = withheldRecord(idea, code, reason, nowMs);
  logger.warn(`[WITHHELD] ${rec.source} ${rec.symbol} ${rec.direction ?? ''} ${rec.contract ?? ''}: ${code} — ${reason}`);
  try {
    const { db } = await import('../db');
    const { analysisAuditLog } = await import('@shared/schema');
    await db.insert(analysisAuditLog).values({
      auditId: `withheld:${rec.symbol}:${nowMs}:${Math.random().toString(36).slice(2, 8)}`,
      symbol: rec.symbol.slice(0, 20) || 'UNKNOWN',
      engineVersion: rec.v,
      params: { source: rec.source, direction: rec.direction, contract: rec.contract, entryPrice: rec.entryPrice, targetPrice: rec.targetPrice, stopLoss: rec.stopLoss },
      result: rec,
      consumedBy: WITHHELD_CONSUMER,
    } as any);
  } catch (e) {
    logger.debug(`[WITHHELD] could not persist ${rec.symbol}: ${(e as Error).message}`);
  }
}

export async function listWithheldIdeas(opts: { days?: number; limit?: number } = {}): Promise<WithheldRecord[]> {
  const { db } = await import('../db');
  const { analysisAuditLog } = await import('@shared/schema');
  const { and, eq, gte, desc } = await import('drizzle-orm');
  const days = Math.max(1, Math.min(90, opts.days ?? 14));
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db.select().from(analysisAuditLog)
    .where(and(eq(analysisAuditLog.consumedBy, WITHHELD_CONSUMER), gte(analysisAuditLog.timestamp, since)))
    .orderBy(desc(analysisAuditLog.timestamp)).limit(Math.max(1, Math.min(2000, opts.limit ?? 500)));
  return rows.map((r: any) => r.result as WithheldRecord).filter(Boolean);
}
