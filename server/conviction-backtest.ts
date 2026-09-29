/**
 * CONVICTION BACKTEST
 * ===================
 * Joins historical trade ideas to the conviction grade they carried and
 * aggregates realized outcomes by band: "did higher grades resolve better?"
 *
 * Method (rebuilt for SR 11-7 F3.1 / P0-1):
 *   1. GRADE — point-in-time first. The convictions engine persists the score
 *      and band it assigned the first time it scored an idea
 *      (trade_ideas.gen_conviction_score / gen_conviction_band, never
 *      overwritten by later re-grades). Those rows are graded by THAT score,
 *      banded with the canonical cutoffs in shared/conviction-bands.ts.
 *      Ideas the engine never persisted a grade for are re-graded by the live
 *      engine — which sees information that did not exist at origination — so
 *      they are aggregated SEPARATELY in `regradedBands` and labelled
 *      "re-graded with today's engine (look-ahead)". They never enter the
 *      headline `bands`.
 *   2. OUTCOME — closed ideas only, each with its own stored percent_gain.
 *      A closed idea with no stored P&L is EXCLUDED and counted
 *      (`unknownOutcome`); an expiry carrying the never-written 0.00 default is
 *      EXCLUDED and counted (`unmeasured`, see isUnmeasuredExpiry). Nothing is
 *      invented — the old +5%/−3% fallback is gone.
 *   3. OPEN ideas are marked to a live quote and reported on their own
 *      (`open`, `avgUnrealizedGain`). They are not in any win rate,
 *      expectancy, recall, blindspot or overpromise figure.
 *   4. EXPECTANCY — each closed trade is paired with its OWN risk distance
 *      (|entry − stop| / entry): R_i = gain_i / risk_i, then averaged. Trades
 *      without a usable stop are excluded from R and the R sample is reported.
 *
 * Cached at 1h since a re-grade is a full conviction build.
 */

import { gte } from "drizzle-orm";
import { db } from "./db";
import { tradeIdeas } from "@shared/schema";
import { isUnmeasuredExpiry } from "@shared/constants";
import { convictionBandFor, CONVICTION_BAND_CUTOFFS, type ConvictionBand } from "@shared/conviction-bands";
import { logger } from "./logger";
import { buildConvictions } from "./convictions-engine";
import { getRealtimeBatchQuotes } from "./realtime-pricing-service";

export const LOOK_AHEAD_LABEL = "re-graded with today's engine (look-ahead)";
export const POINT_IN_TIME_LABEL = "graded by the score stored when the engine first scored the idea";

export interface BandStats {
  band: ConvictionBand;
  /** Closed ideas with a measured outcome — the sample behind winRate. */
  closed: number;
  wins: number;
  losses: number;
  /** wins / closed, 0..1. Null when closed === 0. Closed trades only. */
  winRate: number | null;
  /** Mean realized % gain over closed measured trades. Null when none. */
  avgRealizedGain: number | null;
  /** Mean of per-trade R (gain_i / risk_i). Null when no trade has a usable stop. */
  expectancyR: number | null;
  /** Trades behind expectancyR. */
  expectancySampleSize: number;
  /** Closed ideas excluded because no P&L was stored. */
  unknownOutcome: number;
  /** Expired ideas excluded because no exit was measured (0.00 default). */
  unmeasured: number;
  /** Open ideas marked to a live quote — reported apart, never in the rates above. */
  open: number;
  /** Mean live unrealized % gain of `open`. Null when none were marked. */
  avgUnrealizedGain: number | null;
}

export interface SourceStats {
  source: string;
  /** Closed measured trades. */
  closed: number;
  winRate: number | null;
  avgRealizedGain: number | null;
  expectancyR: number | null;
  expectancySampleSize: number;
}

export interface BacktestRow {
  symbol: string;
  score: number;
  band: string;
  actualPercentGain: number;
  direction: string;
  source: string;
  gradeSource: "stored" | "regraded";
}

export interface BacktestReport {
  generatedAt: string;
  lookbackDays: number;
  totalIdeas: number;
  /** Ideas that carried or received a grade. */
  scoredIdeas: number;
  /** Closed ideas with a measured outcome (both grading bases). */
  closedCount: number;
  /** Open ideas marked to a live quote (both grading bases). */
  openCount: number;
  /** Closed ideas excluded for missing P&L. */
  unknownOutcomeCount: number;
  /** Expired ideas excluded for no measured exit. */
  unmeasuredCount: number;
  bandCutoffs: typeof CONVICTION_BAND_CUTOFFS;
  grading: {
    /** Ideas graded by their stored point-in-time score. */
    pointInTime: number;
    /** Ideas with no stored score, re-graded by today's engine. */
    regraded: number;
    pointInTimeLabel: string;
    lookAheadLabel: string;
  };
  /** HEADLINE — point-in-time grades only. */
  bands: BandStats[];
  /** Look-ahead — ideas re-graded by today's engine. Never blend with `bands`. */
  regradedBands: BandStats[];
  /** Closed measured trades by source (grade-independent). */
  sources: SourceStats[];
  /** Of closed point-in-time winners, % graded A or S. Null when there are none. */
  topGradeRecallPct: number | null;
  /** Closed winners graded C or low B (either basis — see gradeSource). */
  blindspots: BacktestRow[];
  /** Closed losers graded A or S (either basis — see gradeSource). */
  overpromises: BacktestRow[];
}

interface CacheEntry {
  report: BacktestReport;
  computedAt: number;
  lookbackDays: number;
}

let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h

function isFresh(entry: CacheEntry | null, lookbackDays: number): boolean {
  if (!entry) return false;
  if (entry.lookbackDays !== lookbackDays) return false;
  return Date.now() - entry.computedAt < CACHE_TTL_MS;
}

const CLOSED_STATUSES = new Set(["hit_target", "hit_stop", "manual_exit", "expired"]);

/**
 * Per-idea unrealized %gain from a live quote against the entry price.
 * Long = (live - entry) / entry, Short = (entry - live) / entry.
 * Null when there is no usable entry.
 */
function computeUnrealizedPct(idea: any, livePrice: number, direction: "long" | "short"): number | null {
  const entry = Number(idea.entryPrice);
  if (!Number.isFinite(entry) || entry <= 0) return null;
  const raw = ((livePrice - entry) / entry) * 100;
  const signed = direction === "long" ? raw : -raw;
  // Clamp to sane equity range — protects against options/leverage entries
  // where the entry price is wildly different from the live underlying price.
  return Math.max(-100, Math.min(500, signed));
}

/** This trade's own risk distance, |entry − stop| / entry in percent. Null when unusable. */
function riskPctOf(idea: any): number | null {
  const entry = Number(idea.entryPrice);
  const stop = Number(idea.stopLoss);
  if (!Number.isFinite(entry) || !Number.isFinite(stop) || entry <= 0) return null;
  const riskPct = Math.abs((entry - stop) / entry) * 100;
  return riskPct > 0 ? riskPct : null;
}

const mean = (xs: number[]): number | null =>
  xs.length > 0 ? xs.reduce((s, x) => s + x, 0) / xs.length : null;

interface Accum {
  gains: number[];
  rs: number[];
  unrealized: number[];
  unknownOutcome: number;
  unmeasured: number;
}
const emptyAccum = (): Accum => ({ gains: [], rs: [], unrealized: [], unknownOutcome: 0, unmeasured: 0 });

function finalizeBand(band: ConvictionBand, a: Accum): BandStats {
  const wins = a.gains.filter((g) => g > 0).length;
  const closed = a.gains.length;
  return {
    band,
    closed,
    wins,
    losses: closed - wins,
    winRate: closed > 0 ? wins / closed : null,
    avgRealizedGain: mean(a.gains),
    expectancyR: mean(a.rs),
    expectancySampleSize: a.rs.length,
    unknownOutcome: a.unknownOutcome,
    unmeasured: a.unmeasured,
    open: a.unrealized.length,
    avgUnrealizedGain: mean(a.unrealized),
  };
}

export async function backtestConvictions(opts: { lookbackDays?: number } = {}): Promise<BacktestReport> {
  const lookbackDays = opts.lookbackDays ?? 90;

  if (isFresh(cache, lookbackDays)) {
    return cache!.report;
  }

  const startedAt = Date.now();
  logger.info(`[BACKTEST] starting over ${lookbackDays} days`);

  const cutoffIso = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  // 1. Every idea in the window, with its stored point-in-time grade if any.
  const allIdeas = (await db
    .select()
    .from(tradeIdeas)
    .where(gte(tradeIdeas.timestamp, cutoffIso))) as any[];

  const hasStoredGrade = (idea: any) =>
    idea.genConvictionScore != null && Number.isFinite(Number(idea.genConvictionScore));

  // 2. Only ideas WITHOUT a stored grade need the live engine. That path is
  // look-ahead by construction and is kept in its own aggregate.
  const regradeById = new Map<string, { score: number; direction: "long" | "short" }>();
  if (allIdeas.some((i) => !hasStoredGrade(i))) {
    const conv = await buildConvictions({
      lookbackHours: lookbackDays * 24,
      limit: 5000,
      minScore: 0,
      watchlistOnly: false,
      skipLiveRevalidation: true,
    });
    for (const p of conv.picks) {
      regradeById.set(p.ideaId, { score: p.convictionScore, direction: p.direction });
    }
  }

  type Graded = {
    idea: any;
    score: number;
    band: ConvictionBand;
    direction: "long" | "short";
    gradeSource: "stored" | "regraded";
  };
  const graded: Graded[] = [];
  for (const idea of allIdeas) {
    const ideaDir: "long" | "short" = idea.direction === "short" ? "short" : "long";
    if (hasStoredGrade(idea)) {
      const score = Number(idea.genConvictionScore);
      graded.push({ idea, score, band: convictionBandFor(score), direction: ideaDir, gradeSource: "stored" });
      continue;
    }
    const re = regradeById.get(idea.id);
    if (!re) continue; // engine dropped it (dedup/deconflict) — ungraded, not guessed
    graded.push({ idea, score: re.score, band: convictionBandFor(re.score), direction: re.direction, gradeSource: "regraded" });
  }

  // 3. Live quotes for open graded ideas (unrealized marks, reported apart).
  const openSymbols = new Set<string>();
  for (const g of graded) if (g.idea.outcomeStatus === "open") openSymbols.add(g.idea.symbol);
  const liveQuoteMap = new Map<string, number>();
  if (openSymbols.size > 0) {
    try {
      const quotes = await getRealtimeBatchQuotes(
        Array.from(openSymbols).map((sym) => ({ symbol: sym, assetType: "stock" as const })),
      );
      quotes.forEach((q, sym) => {
        if (Number.isFinite(q.price)) liveQuoteMap.set(sym, q.price);
      });
    } catch (err) {
      logger.warn("[BACKTEST] live quote fetch failed:", err);
    }
  }

  // 4. Aggregate.
  const bandKeys: ConvictionBand[] = ["S", "A", "B", "C"];
  const pit: Record<ConvictionBand, Accum> = { S: emptyAccum(), A: emptyAccum(), B: emptyAccum(), C: emptyAccum() };
  const reg: Record<ConvictionBand, Accum> = { S: emptyAccum(), A: emptyAccum(), B: emptyAccum(), C: emptyAccum() };
  const sourceMap = new Map<string, { gains: number[]; rs: number[] }>();

  let closedCount = 0;
  let openCount = 0;
  let unknownOutcomeCount = 0;
  let unmeasuredCount = 0;
  let pitWinners = 0;
  let pitTopGradedWinners = 0;

  type ClosedRow = Graded & { pctGain: number };
  const closedRows: ClosedRow[] = [];

  for (const g of graded) {
    const acc = g.gradeSource === "stored" ? pit[g.band] : reg[g.band];
    const status = g.idea.outcomeStatus;

    if (status === "open") {
      const live = liveQuoteMap.get(g.idea.symbol);
      if (live == null) continue; // no live price → no mark, nothing invented
      const u = computeUnrealizedPct(g.idea, live, g.direction);
      if (u == null) continue;
      acc.unrealized.push(u);
      openCount++;
      continue;
    }
    if (!CLOSED_STATUSES.has(status)) continue;

    if (isUnmeasuredExpiry(g.idea)) {
      acc.unmeasured++;
      unmeasuredCount++;
      continue;
    }
    const stored = g.idea.percentGain;
    if (stored === null || stored === undefined || !Number.isFinite(Number(stored))) {
      // No stored P&L: excluded and counted. (Previously invented as +5% / −3%.)
      acc.unknownOutcome++;
      unknownOutcomeCount++;
      continue;
    }
    // Some legacy rows store a multiplier or raw dollars; clamp so one bad row
    // cannot poison a band average.
    const pctGain = Math.max(-100, Math.min(500, Number(stored)));
    closedCount++;
    acc.gains.push(pctGain);

    const risk = riskPctOf(g.idea);
    const r = risk != null ? pctGain / risk : null;
    if (r != null) acc.rs.push(r);

    const source = g.idea.source || "unknown";
    const src = sourceMap.get(source) ?? { gains: [], rs: [] };
    src.gains.push(pctGain);
    if (r != null) src.rs.push(r);
    sourceMap.set(source, src);

    if (g.gradeSource === "stored" && pctGain > 0) {
      pitWinners++;
      if (g.band === "S" || g.band === "A") pitTopGradedWinners++;
    }
    closedRows.push({ ...g, pctGain });
  }

  const bands = bandKeys.map((k) => finalizeBand(k, pit[k]));
  const regradedBands = bandKeys.map((k) => finalizeBand(k, reg[k]));

  const sources: SourceStats[] = [];
  sourceMap.forEach((s, source) => {
    const wins = s.gains.filter((g) => g > 0).length;
    sources.push({
      source,
      closed: s.gains.length,
      winRate: s.gains.length > 0 ? wins / s.gains.length : null,
      avgRealizedGain: mean(s.gains),
      expectancyR: mean(s.rs),
      expectancySampleSize: s.rs.length,
    });
  });
  sources.sort((a, b) => (b.expectancyR ?? -Infinity) - (a.expectancyR ?? -Infinity));

  const toRow = (r: ClosedRow): BacktestRow => ({
    symbol: r.idea.symbol,
    score: r.score,
    band: r.band,
    actualPercentGain: r.pctGain,
    direction: r.direction,
    source: r.idea.source || "unknown",
    gradeSource: r.gradeSource,
  });

  // Blind spots: closed winners graded C or the lower half of B.
  const lowBCeiling = CONVICTION_BAND_CUTOFFS.B + Math.round((CONVICTION_BAND_CUTOFFS.A - CONVICTION_BAND_CUTOFFS.B) / 2);
  const blindspots = closedRows
    .filter((r) => r.pctGain > 0 && (r.band === "C" || r.score < lowBCeiling))
    .sort((a, b) => b.pctGain - a.pctGain)
    .slice(0, 10)
    .map(toRow);

  const overpromises = closedRows
    .filter((r) => r.pctGain <= 0 && (r.band === "S" || r.band === "A"))
    .sort((a, b) => a.pctGain - b.pctGain)
    .slice(0, 10)
    .map(toRow);

  const pointInTime = graded.filter((g) => g.gradeSource === "stored").length;

  const report: BacktestReport = {
    generatedAt: new Date().toISOString(),
    lookbackDays,
    totalIdeas: allIdeas.length,
    scoredIdeas: graded.length,
    closedCount,
    openCount,
    unknownOutcomeCount,
    unmeasuredCount,
    bandCutoffs: CONVICTION_BAND_CUTOFFS,
    grading: {
      pointInTime,
      regraded: graded.length - pointInTime,
      pointInTimeLabel: POINT_IN_TIME_LABEL,
      lookAheadLabel: LOOK_AHEAD_LABEL,
    },
    bands,
    regradedBands,
    sources,
    topGradeRecallPct: pitWinners > 0 ? (pitTopGradedWinners / pitWinners) * 100 : null,
    blindspots,
    overpromises,
  };

  logger.info(
    `[BACKTEST] complete in ${Date.now() - startedAt}ms — total=${allIdeas.length} graded=${graded.length} (pit=${pointInTime}) closed=${closedCount} open=${openCount} unknown=${unknownOutcomeCount} unmeasured=${unmeasuredCount}`,
  );

  cache = { report, computedAt: Date.now(), lookbackDays };
  return report;
}

export function clearBacktestCache(): void {
  cache = null;
}
