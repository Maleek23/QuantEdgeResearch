import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { db } from "./db";
import { paperPositions, tradeIdeas } from "@shared/schema";
import {
  readOracleExecutionAudit,
  recordPaperExecution,
  withOracleExecutionAudit,
} from "@shared/oracle-lifecycle";
import { logger } from "./logger";

/**
 * TRIGGER OBSERVER
 *
 * The UI refuses to call a setup triggered on price alone — it waits for
 * `executionAudit.state === "triggered"`, on the principle that a plan is not an
 * entry. That principle is right, but NOTHING in the codebase ever wrote that
 * state: the only writer was recordPaperExecution(), which jumps straight to
 * "executed" and only fires on a paper fill. So every published idea sat at
 * "pending trigger" forever while price ran clean through the entry — LLY
 * showing "waiting" with the trigger 1.6% BELOW spot.
 *
 * This closes the gap: it observes the trigger and records when and at what
 * price it was observed. It never invents a fill — "triggered" means the level
 * traded, not that a position exists.
 */
export async function observeTriggeredIdeas(hoursBack = 96): Promise<number> {
  const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
  const rows = await db
    .select()
    .from(tradeIdeas)
    .where(and(
      gte(tradeIdeas.timestamp, cutoff),
      eq(tradeIdeas.outcomeStatus, "open"),
      eq(tradeIdeas.archived, false),
    ))
    .orderBy(desc(tradeIdeas.timestamp))
    .limit(1000);

  // Only rows still waiting. An executed or closed idea is further along the
  // lifecycle and must never be walked backwards.
  const pending = rows.filter((idea) => {
    const state = readOracleExecutionAudit(idea.convergenceSignalsJson)?.state;
    return state == null || state === "coverage" || state === "thesis" || state === "pending_trigger";
  });
  if (pending.length === 0) return 0;

  const symbols = Array.from(new Set(pending.map((i) => i.symbol).filter(Boolean)));
  const { getRealtimeBatchQuotes } = await import("./realtime-pricing-service");
  const quotes = await getRealtimeBatchQuotes(
    // Entry/stop/target are underlying levels even for contract ideas, so an
    // option row is priced off its underlying, never an OCC symbol.
    symbols.map((symbol) => ({ symbol, assetType: "stock" as const })),
  );

  const nowIso = new Date().toISOString();
  let observed = 0;

  for (const idea of pending) {
    const entry = idea.entryPrice;
    if (typeof entry !== "number" || !Number.isFinite(entry)) continue;

    const quote = quotes.get(idea.symbol);
    const live = quote && Number.isFinite(quote.price) ? quote.price : null;

    // Persisted extrema beat a spot check: a trigger that traded between two
    // polls is still a trigger, and sampling live price alone would miss it.
    const isLong = idea.direction !== "short";
    const extreme = isLong ? idea.highestPriceReached : idea.lowestPriceReached;
    const best = [live, typeof extreme === "number" ? extreme : null].filter(
      (v): v is number => typeof v === "number" && Number.isFinite(v),
    );
    if (best.length === 0) continue;

    const reached = isLong ? Math.max(...best) : Math.min(...best);
    const triggered = isLong ? reached >= entry : reached <= entry;
    if (!triggered) continue;

    const audit = withOracleExecutionAudit(idea.convergenceSignalsJson, {
      version: 1,
      state: "triggered",
      triggerType: isLong ? "breakout" : "breakdown",
      triggerPrice: entry,
      triggerObservedAt: nowIso,
      triggerObservedPrice: reached,
    });

    await db.update(tradeIdeas)
      .set({ convergenceSignalsJson: audit as any })
      .where(eq(tradeIdeas.id, idea.id));
    observed++;
  }

  if (observed) {
    logger.info(`[ORACLE LIFECYCLE] Observed ${observed} trigger${observed === 1 ? "" : "s"} (pending → triggered)`);
  }
  return observed;
}

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
