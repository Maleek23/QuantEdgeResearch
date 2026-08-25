import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { db } from "./db";
import { paperPositions, tradeIdeas } from "@shared/schema";
import { recordPaperExecution } from "@shared/oracle-lifecycle";
import { logger } from "./logger";

/**
 * Paper positions are the execution source of truth. Older versions could
 * close the linked research row while the paper position was still open,
 * because publishing an idea was treated as entering it. Repair only this
 * unambiguous mismatch; it is safe and idempotent on every boot.
 */
export async function reconcileOpenPaperExecutions(): Promise<number> {
  const rows = await db
    .select({ position: paperPositions, idea: tradeIdeas })
    .from(paperPositions)
    .innerJoin(tradeIdeas, eq(paperPositions.tradeIdeaId, tradeIdeas.id))
    .where(and(eq(paperPositions.status, "open"), eq(tradeIdeas.archived, false)));

  let reconciled = 0;
  for (const { position, idea } of rows) {
    const audit = recordPaperExecution(idea.convergenceSignalsJson, {
      price: position.entryPrice,
      at: position.entryTime,
      paperPositionId: position.id,
    });

    const needsRepair = idea.outcomeStatus !== "open" || JSON.stringify(idea.convergenceSignalsJson) !== JSON.stringify(audit);
    if (!needsRepair) continue;

    await db.update(tradeIdeas)
      .set({
        outcomeStatus: "open",
        exitPrice: null,
        exitDate: null,
        exitPremium: null,
        realizedPnL: null,
        percentGain: null,
        optionPercentGain: null,
        outcomeNotes: null,
        resolutionReason: null,
        actualHoldingTimeMinutes: null,
        convergenceSignalsJson: audit as any,
      })
      .where(eq(tradeIdeas.id, idea.id));
    reconciled++;
  }

  if (reconciled) {
    logger.info(`[ORACLE LIFECYCLE] Reconciled ${reconciled} live paper execution${reconciled === 1 ? "" : "s"}`);
  }
  return reconciled;
}

/**
 * Repair the exact historical signature produced by the old option-direction
 * inversion. A short idea cannot have hit its stop when its recorded high stayed
 * below that stop (with symmetric rules for the other direction/barrier).
 *
 * This is deliberately narrow: recent automatic outcomes, no linked execution,
 * and persisted extrema that prove the outcome impossible. No row is deleted.
 */
export async function repairImpossibleRecentOutcomes(hoursBack = 72): Promise<number> {
  const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
  const [rows, linked] = await Promise.all([
    db.select().from(tradeIdeas)
      .where(and(
        gte(tradeIdeas.timestamp, cutoff),
        inArray(tradeIdeas.outcomeStatus, ["hit_target", "hit_stop"]),
        inArray(tradeIdeas.resolutionReason, ["auto_target_hit", "auto_stop_hit"]),
      ))
      .orderBy(desc(tradeIdeas.timestamp)),
    db.select({ tradeIdeaId: paperPositions.tradeIdeaId })
      .from(paperPositions)
      .where(isNotNull(paperPositions.tradeIdeaId)),
  ]);

  const executedIds = new Set(linked.map((row) => row.tradeIdeaId).filter(Boolean));
  let repaired = 0;
  for (const idea of rows) {
    if (executedIds.has(idea.id)) continue;
    const high = idea.highestPriceReached;
    const low = idea.lowestPriceReached;
    const impossible = idea.direction === "short"
      ? idea.outcomeStatus === "hit_stop"
        ? typeof high === "number" && high < idea.stopLoss
        : typeof low === "number" && low > idea.targetPrice
      : idea.outcomeStatus === "hit_stop"
        ? typeof low === "number" && low > idea.stopLoss
        : typeof high === "number" && high < idea.targetPrice;

    if (!impossible) continue;
    await db.update(tradeIdeas).set({
      outcomeStatus: "open",
      exitPrice: null,
      exitDate: null,
      exitPremium: null,
      realizedPnL: null,
      percentGain: null,
      optionPercentGain: null,
      outcomeNotes: null,
      resolutionReason: null,
      actualHoldingTimeMinutes: null,
      predictionAccurate: null,
      predictionAccuracyPercent: null,
      predictionValidatedAt: null,
      validatedAt: null,
    }).where(eq(tradeIdeas.id, idea.id));
    repaired++;
  }

  if (repaired) {
    logger.warn(`[ORACLE LIFECYCLE] Reopened ${repaired} mathematically impossible automatic outcome${repaired === 1 ? "" : "s"}`);
  }
  return repaired;
}
