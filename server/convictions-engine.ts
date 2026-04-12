/**
 * CONVICTIONS ENGINE
 * ==================
 * One ranked list, every layer of confluence stacked on every name.
 *
 * This is the "Today's Convictions" backend. It pulls the most recent
 * trade ideas from the database, then layers in:
 *   1. Technical confluence (RSI, MACD, trend, volume) — already on each idea
 *   2. Convergence signals (options flow + news + sentiment + insider) — from convergenceSignalsJson
 *   3. Catalyst flags (earnings, news catalyst, news bias) — from idea fields
 *   4. Market regime (VIX / SPY / sentiment) — from getMarketContext()
 *   5. Geopolitical context (active scenarios, risk level) — from getScenarioMatrix()
 *   6. Fundamentals (P/E, growth, short interest) — from FundamentalDataProvider
 *   7. Sector tailwind — from approved-tickers SECTOR_MAP + sector ETF performance
 *
 * Every layer contributes points to a single conviction score (0-100).
 * Output is sorted descending so the user sees the highest-conviction
 * setups first, with each contributing layer broken out.
 *
 * Performance design:
 *   - Pulls last 24h of ideas (already pre-filtered by quality scanners)
 *   - Caches market context (5min) and geopolitical matrix (10min)
 *   - Skips fundamentals enrichment when symbol count > 30 (rate-limit safety)
 */

import { db } from "./db";
import { tradeIdeas, type ConvergenceAnalysis } from "@shared/schema";
import { gte, desc } from "drizzle-orm";
import { logger } from "./logger";
import { getMarketContext, type MarketContext } from "./market-context-service";
import { getScenarioMatrix } from "./geopolitical-matrix";
import { getSector, isApprovedTicker, getTier, type Sector } from "@shared/approved-tickers";
import { getTradierQuote } from "./tradier-api";
import { getMarketBreadth, type MarketBreadthSnapshot } from "./market-breadth-service";
import { getAnalystSnapshot, type AnalystSnapshot } from "./analyst-data-service";
import { getRealtimeBatchQuotes, type RealtimeQuote } from "./realtime-pricing-service";
import { getPreMarketBatch, type PreMarketSnapshot } from "./pre-market-service";
import { getGexSnapshotBatch, type GexSnapshot } from "./gex-snapshot-service";

// ─────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────

export type ConvictionLayerKind =
  | "technical"
  | "convergence"
  | "catalyst"
  | "regime"
  | "breadth"
  | "geopolitical"
  | "fundamental"
  | "analyst"
  | "sector"
  | "freshness"
  | "weekly"
  | "premarket"
  | "gex";

export interface ConvictionLayer {
  kind: ConvictionLayerKind;
  label: string;
  /** Points contributed to the overall score (positive = bullish for the trade direction). */
  points: number;
  /** One-line human explanation. Shown to the user as the WHY. */
  why: string;
  /** Optional structured data the UI can format. */
  data?: Record<string, unknown>;
}

export interface ConvictionPick {
  ideaId: string;
  symbol: string;
  sector: Sector;
  direction: "long" | "short";
  assetType: string;
  holdingPeriod: string;
  tradeType: string | null;

  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  riskRewardRatio: number;

  // Options fields (optional)
  optionType: "call" | "put" | null;
  strikePrice: number | null;
  expiryDate: string | null;

  /** Total conviction score 0-100 (sum of layer points, capped). */
  convictionScore: number;
  /** Categorical band for UI tinting. */
  convictionBand: "S" | "A" | "B" | "C";
  /** Independent layers that fired. Drives "confluence after confluence" UX. */
  layerCount: number;
  layers: ConvictionLayer[];

  /** Top-line thesis the user reads first. */
  thesis: string;

  catalyst: string;
  catalystSourceUrl: string | null;
  generatedAt: string;
}

export interface ConvictionsResponse {
  generatedAt: string;
  marketContext: {
    regime: string;
    riskSentiment: string;
    preferredDirection: string;
    score: number;
    vixLevel: number | null;
    reasons: string[];
  };
  breadth: {
    regime: string;
    bias: number;
    advanceDeclineRatio: number;
    percentAbove200MA: number;
    percentAbove50MA: number;
    newHighsLows: number;
    sampleSize: number;
    interpretation: string;
  } | null;
  geopolitical: {
    risk: string;
    activeScenarios: string[];
  };
  totalCandidatesScanned: number;
  picks: ConvictionPick[];
}

// ─────────────────────────────────────────────────────────────
// Layer scorers
// ─────────────────────────────────────────────────────────────

function scoreTechnicalLayer(idea: any, direction: "long" | "short"): ConvictionLayer | null {
  const rsi = typeof idea.rsiValue === "number" ? idea.rsiValue : null;
  const macdHist = typeof idea.macdHistogram === "number" ? idea.macdHistogram : null;
  const volRatio = typeof idea.volumeRatio === "number" ? idea.volumeRatio : null;
  const trend = typeof idea.trendStrength === "number" ? idea.trendStrength : null;

  const reasons: string[] = [];
  let points = 0;

  if (rsi !== null) {
    if (direction === "long" && rsi >= 45 && rsi <= 65) {
      points += 4;
      reasons.push(`RSI ${rsi.toFixed(0)} (sweet spot)`);
    } else if (direction === "short" && rsi >= 60 && rsi <= 75) {
      points += 4;
      reasons.push(`RSI ${rsi.toFixed(0)} (overbought)`);
    } else if (direction === "long" && rsi < 35) {
      points += 3;
      reasons.push(`RSI ${rsi.toFixed(0)} (oversold bounce)`);
    }
  }

  if (macdHist !== null) {
    if (direction === "long" && macdHist > 0) {
      points += 3;
      reasons.push("MACD bullish cross");
    } else if (direction === "short" && macdHist < 0) {
      points += 3;
      reasons.push("MACD bearish cross");
    }
  }

  if (volRatio !== null && volRatio >= 1.5) {
    points += 4;
    reasons.push(`Vol ${volRatio.toFixed(1)}× avg`);
  }

  if (trend !== null && trend >= 60) {
    points += 3;
    reasons.push(`Trend ${trend.toFixed(0)}/100`);
  }

  // Catalyst-text fallback — many historical ideas only have a free-text
  // catalyst field (e.g. "Heavy volume (3.2x average)"). Mine it for the
  // structured signals we couldn't read directly.
  const catText: string = typeof idea.catalyst === "string" ? idea.catalyst.toLowerCase() : "";
  if (catText) {
    // Volume mention
    const volMatch = catText.match(/(\d+(?:\.\d+)?)\s*x\s*(?:average|avg)/);
    if (volRatio === null && volMatch) {
      const v = parseFloat(volMatch[1]);
      if (v >= 1.5) {
        points += 4;
        reasons.push(`Vol ${v.toFixed(1)}× avg`);
      }
    } else if (volRatio === null && /heavy volume|unusual volume/.test(catText)) {
      points += 3;
      reasons.push("Heavy volume");
    }
    // Trend / breakout / squeeze keywords
    if (/breakout|breaking out|broke out/.test(catText)) {
      points += 3;
      reasons.push("Breakout");
    }
    if (/squeeze|coil|tight range/.test(catText)) {
      points += 3;
      reasons.push("Squeeze");
    }
    if (/trend|uptrend|momentum/.test(catText) && direction === "long") {
      points += 2;
      reasons.push("Trend up");
    }
    if (/downtrend|bearish trend/.test(catText) && direction === "short") {
      points += 2;
      reasons.push("Trend down");
    }
    // RSI / MACD textual mentions
    if (rsi === null && /rsi/.test(catText)) {
      points += 2;
      reasons.push("RSI flagged");
    }
    if (macdHist === null && /macd/.test(catText)) {
      points += 2;
      reasons.push("MACD flagged");
    }
  }

  if (points === 0) return null;
  return {
    kind: "technical",
    label: "Technical",
    points,
    why: reasons.join(" · "),
    data: { rsi, macdHist, volRatio, trend },
  };
}

/**
 * Quality signals layer — reads the `qualitySignals[]` array that every
 * scanner-generated idea writes (e.g. "Heavy volume (3.2x avg)", "Breakout
 * detected", "Bullish momentum 100/100"). Each aligned signal earns 2pts,
 * capped at 12. This is the workhorse layer for historical ideas where
 * the structured technical fields aren't populated.
 */
function scoreQualitySignalsLayer(idea: any, direction: "long" | "short"): ConvictionLayer | null {
  const qs: string[] = Array.isArray(idea.qualitySignals) ? idea.qualitySignals : [];
  if (qs.length === 0) return null;

  // Count signals that align with the direction.
  const longKeywords = /breakout|bullish|momentum|volume|surge|uptrend|near high|gap up|squeeze|coil|oversold|bounce|accumulation|relative volume|strong move|positive/i;
  const shortKeywords = /bearish|breakdown|downtrend|gap down|near low|overbought|distribution|selloff|negative/i;

  const aligned = qs.filter((s) => {
    if (typeof s !== "string") return false;
    if (direction === "long") return longKeywords.test(s);
    return shortKeywords.test(s);
  });

  if (aligned.length === 0) {
    // Even neutral signals (e.g. "1.5x relative volume") still indicate
    // *something* fired — give partial credit for the count.
    const points = Math.min(6, qs.length);
    if (points === 0) return null;
    return {
      kind: "technical",
      label: `Signals ${qs.length}×`,
      points,
      why: qs.slice(0, 3).join(" · "),
      data: { signalCount: qs.length, aligned: 0 },
    };
  }

  const points = Math.min(12, aligned.length * 2 + Math.min(2, qs.length - aligned.length));
  return {
    kind: "technical",
    label: `Signals ${aligned.length}/${qs.length}`,
    points,
    why: aligned.slice(0, 3).join(" · "),
    data: { signalCount: qs.length, aligned: aligned.length },
  };
}

/**
 * Watchlist tier layer — being on the proven backtested watchlist is
 * itself a form of conviction. S-tier names earn more than secondary.
 */
function scoreTierLayer(symbol: string, riskRewardRatio: number): ConvictionLayer | null {
  const tier = getTier(symbol);
  if (!tier) return null;

  let points = 0;
  let label = "";
  switch (tier) {
    case "MEGA":
      // Mega-cap names get a small boost: they're always relevant, but
      // not user-validated edge plays — so they sit between A-tier and INDEX.
      points = 4;
      label = "Mega-cap (FAANG)";
      break;
    case "S":
      points = 8;
      label = "S-tier watchlist";
      break;
    case "A":
      points = 5;
      label = "A-tier watchlist";
      break;
    case "INDEX":
      points = 3;
      label = "Index ETF";
      break;
    case "SECONDARY":
      points = 2;
      label = "Secondary watchlist";
      break;
  }

  const reasons = [label];
  if (typeof riskRewardRatio === "number" && riskRewardRatio >= 2.5) {
    points += 2;
    reasons.push(`R:R ${riskRewardRatio.toFixed(1)}×`);
  } else if (typeof riskRewardRatio === "number" && riskRewardRatio >= 2.0) {
    points += 1;
    reasons.push(`R:R ${riskRewardRatio.toFixed(1)}×`);
  }

  return {
    kind: "fundamental", // re-using the fundamental kind for tier (no separate UI bucket needed)
    label: "Watchlist Tier",
    points,
    why: reasons.join(" · "),
    data: { tier },
  };
}

function scoreConvergenceLayer(conv: ConvergenceAnalysis | null | undefined, direction: "long" | "short"): ConvictionLayer | null {
  if (!conv || !Array.isArray(conv.signals) || conv.signals.length === 0) return null;

  // Only count signals aligned with the trade direction
  const aligned = conv.signals.filter((s) => {
    if (direction === "long") return s.direction === "bullish" || s.direction === "neutral";
    return s.direction === "bearish" || s.direction === "neutral";
  });

  if (aligned.length === 0) return null;

  // Each aligned signal worth ~3 points, capped at 18 (6 signals)
  const points = Math.min(18, aligned.length * 3);
  const sources = Array.from(new Set(aligned.map((s) => s.source)));

  return {
    kind: "convergence",
    label: `Convergence ${aligned.length}×`,
    points,
    why: `${aligned.length} aligned signals: ${sources.slice(0, 4).join(", ")}${sources.length > 4 ? "…" : ""}`,
    data: { signalCount: aligned.length, sources, primaryThesis: conv.primaryThesis },
  };
}

function scoreCatalystLayer(idea: any, direction: "long" | "short"): ConvictionLayer | null {
  const isNews = idea.isNewsCatalyst === true;
  const newsBias = idea.newsBias as "bullish" | "bearish" | "neutral" | null;
  const earningsBeat = idea.earningsBeat;
  // Earnings surprise % can come from three places, in priority order:
  //   1. dedicated column on the idea (future schema)
  //   2. sourceMetadata JSON
  //   3. inline tag inside the catalyst text "[surprise=+12.4%]" — this is
  //      what universal-idea-generator currently writes (no schema migration).
  const inlineMatch =
    typeof idea.catalyst === "string"
      ? idea.catalyst.match(/\[surprise=([+-]?\d+(?:\.\d+)?)%\]/)
      : null;
  const surprisePctRaw =
    typeof idea.earningsSurprisePct === "number"
      ? idea.earningsSurprisePct
      : typeof idea.sourceMetadata?.earningsSurprisePct === "number"
        ? idea.sourceMetadata.earningsSurprisePct
        : inlineMatch
          ? parseFloat(inlineMatch[1])
          : null;
  const surprisePct = Number.isFinite(surprisePctRaw) ? (surprisePctRaw as number) : null;

  const reasons: string[] = [];
  let points = 0;

  if (isNews && newsBias) {
    const aligned =
      (direction === "long" && newsBias === "bullish") ||
      (direction === "short" && newsBias === "bearish");
    if (aligned) {
      points += 8;
      reasons.push(`News catalyst (${newsBias})`);
    } else if (newsBias === "neutral") {
      points += 3;
      reasons.push("News catalyst (neutral)");
    }
  }

  // Earnings beat/miss — magnitude-aware.
  // We previously gave a flat +4 for any beat. Now we scale:
  //   |surprise| <  3%  : +2  (in-line, low signal)
  //   |surprise| 3–10%  : +4  (solid beat/miss)
  //   |surprise| 10–25% : +6  (strong)
  //   |surprise| > 25%  : +8  (blowout)
  // The flat +4 stays as fallback when magnitude isn't available so we
  // don't regress historical ideas that lack the new field.
  if (earningsBeat === true && direction === "long") {
    if (surprisePct !== null && surprisePct > 0) {
      const mag = Math.abs(surprisePct);
      const earned = mag > 25 ? 8 : mag >= 10 ? 6 : mag >= 3 ? 4 : 2;
      points += earned;
      reasons.push(`Earnings beat +${surprisePct.toFixed(1)}%`);
    } else {
      points += 4;
      reasons.push("Earnings beat");
    }
  } else if (earningsBeat === false && direction === "short") {
    if (surprisePct !== null && surprisePct < 0) {
      const mag = Math.abs(surprisePct);
      const earned = mag > 25 ? 8 : mag >= 10 ? 6 : mag >= 3 ? 4 : 2;
      points += earned;
      reasons.push(`Earnings miss ${surprisePct.toFixed(1)}%`);
    } else {
      points += 4;
      reasons.push("Earnings miss");
    }
  }

  if (idea.catalyst && typeof idea.catalyst === "string" && idea.catalyst.length > 0 && points === 0) {
    // Generic catalyst present but not flagged — small boost
    points += 1;
    reasons.push("Catalyst tagged");
  }

  if (points === 0) return null;
  return {
    kind: "catalyst",
    label: "Catalyst",
    points,
    why: reasons.join(" · "),
    data: { isNews, newsBias, earningsBeat, surprisePct },
  };
}

function scoreRegimeLayer(direction: "long" | "short", ctx: MarketContext): ConvictionLayer | null {
  const reasons: string[] = [];
  let points = 0;

  const aligned =
    (direction === "long" && (ctx.preferredDirection === "LONG" || ctx.preferredDirection === "BOTH")) ||
    (direction === "short" && (ctx.preferredDirection === "SHORT" || ctx.preferredDirection === "BOTH"));

  if (aligned) {
    points += 5;
    reasons.push(`Regime ${ctx.regime} prefers ${ctx.preferredDirection}`);
  } else {
    // Counter-regime trades take a small penalty
    points -= 3;
    reasons.push(`Counter-regime (${ctx.regime} prefers ${ctx.preferredDirection})`);
  }

  if (direction === "long" && ctx.riskSentiment === "risk_on") {
    points += 3;
    reasons.push("Risk-on tape");
  } else if (direction === "short" && ctx.riskSentiment === "risk_off") {
    points += 3;
    reasons.push("Risk-off tape");
  }

  if (ctx.vixLevel !== null) {
    if (direction === "long" && ctx.vixLevel < 18) {
      points += 2;
      reasons.push(`VIX ${ctx.vixLevel.toFixed(1)} (calm)`);
    } else if (direction === "short" && ctx.vixLevel > 22) {
      points += 2;
      reasons.push(`VIX ${ctx.vixLevel.toFixed(1)} (fear)`);
    }
  }

  return {
    kind: "regime",
    label: "Market Regime",
    points,
    why: reasons.join(" · "),
    data: { regime: ctx.regime, riskSentiment: ctx.riskSentiment, vix: ctx.vixLevel },
  };
}

/**
 * Market breadth confluence — confirms or contradicts the price-based regime.
 * A name flagged "S band" during a deteriorating breadth tape is a very
 * different trade than the same name during a thrust day. Score:
 *   thrust         long +6,   short -4
 *   expanding      long +4,   short -2
 *   neutral        0
 *   deteriorating  long -3,   short +2
 *   washout        long -4,   short +5  (oversold extreme also rewards bounces)
 *
 * The breadth.bias field is already a -10..+10 directional score; we
 * convert it directly so future regime tweaks flow through automatically.
 */
function scoreBreadthLayer(
  direction: "long" | "short",
  breadth: MarketBreadthSnapshot | null,
): ConvictionLayer | null {
  if (!breadth || breadth.sampleSize === 0) return null;

  const directional = direction === "long" ? breadth.bias : -breadth.bias;
  // Clamp to a sensible per-layer point budget so breadth can't dominate.
  const points = Math.max(-5, Math.min(6, Math.round(directional * 0.7)));
  if (points === 0) return null;

  return {
    kind: "breadth",
    label: "Breadth",
    points,
    why: breadth.interpretation,
    data: {
      regime: breadth.regime,
      advanceDeclineRatio: breadth.advanceDeclineRatio,
      percentAbove200MA: breadth.percentAbove200MA,
      percentAbove50MA: breadth.percentAbove50MA,
      newHighsLows: breadth.newHighsLows,
      sampleSize: breadth.sampleSize,
    },
  };
}

/**
 * Analyst confluence — rewards trades that align with sell-side consensus.
 * Yahoo's recommendationMean is 1.0 (strong buy) → 5.0 (sell). We pair
 * that with 12-month price target upside and require ≥3 analysts before
 * the layer fires (single-analyst targets are noise).
 *
 * Long trades:
 *   meanRec ≤ 1.8 + upside ≥ 15%   → +6   (strong buy + room)
 *   meanRec ≤ 2.3 + upside ≥ 8%    → +4   (buy)
 *   meanRec ≤ 2.7                  → +2   (mild buy)
 *   meanRec ≥ 3.5                  → -3   (sell-rated, headwind)
 *
 * Short trades flip the sign on meanRec / upside.
 */
function scoreAnalystLayer(
  snap: AnalystSnapshot | null,
  direction: "long" | "short",
  entryPrice: number,
): ConvictionLayer | null {
  if (!snap) return null;
  if ((snap.numberOfAnalysts ?? 0) < 3) return null;
  if (snap.recommendationMean === null && snap.targetMeanPrice === null) return null;

  const meanRec = snap.recommendationMean ?? 3;
  const upsidePct =
    snap.targetMeanPrice && entryPrice > 0
      ? ((snap.targetMeanPrice - entryPrice) / entryPrice) * 100
      : null;

  const reasons: string[] = [];
  let points = 0;

  if (direction === "long") {
    if (meanRec <= 1.8 && (upsidePct ?? 0) >= 15) {
      points = 6;
      reasons.push(`Strong buy ${meanRec.toFixed(1)}/5`);
      if (upsidePct !== null) reasons.push(`+${upsidePct.toFixed(0)}% to target`);
    } else if (meanRec <= 2.3 && (upsidePct ?? 0) >= 8) {
      points = 4;
      reasons.push(`Buy ${meanRec.toFixed(1)}/5`);
      if (upsidePct !== null) reasons.push(`+${upsidePct.toFixed(0)}% to target`);
    } else if (meanRec <= 2.7) {
      points = 2;
      reasons.push(`Outperform ${meanRec.toFixed(1)}/5`);
    } else if (meanRec >= 3.5) {
      points = -3;
      reasons.push(`Sell-rated ${meanRec.toFixed(1)}/5`);
    }
  } else {
    // Short trades — invert
    if (meanRec >= 3.5 && (upsidePct ?? 0) <= -10) {
      points = 6;
      reasons.push(`Sell-rated ${meanRec.toFixed(1)}/5`);
      if (upsidePct !== null) reasons.push(`${upsidePct.toFixed(0)}% to target`);
    } else if (meanRec >= 3.0 && (upsidePct ?? 0) <= -5) {
      points = 4;
      reasons.push(`Underperform ${meanRec.toFixed(1)}/5`);
    } else if (meanRec >= 2.7) {
      points = 2;
      reasons.push(`Hold ${meanRec.toFixed(1)}/5`);
    } else if (meanRec <= 2.0) {
      points = -3;
      reasons.push(`Buy-rated ${meanRec.toFixed(1)}/5 (against trade)`);
    }
  }

  if (points === 0) return null;
  return {
    kind: "analyst",
    label: "Analyst",
    points,
    why: reasons.join(" · "),
    data: {
      recommendationKey: snap.recommendationKey,
      meanRec,
      targetMeanPrice: snap.targetMeanPrice,
      numberOfAnalysts: snap.numberOfAnalysts,
      upsidePct,
    },
  };
}

function scoreGeopoliticalLayer(
  symbol: string,
  sector: Sector,
  direction: "long" | "short",
  geo: { risk: string; activeScenarios: string[] },
): ConvictionLayer | null {
  const reasons: string[] = [];
  let points = 0;

  // Defense / energy / crypto names benefit from elevated risk regimes
  const benefitsFromRisk = sector === "energy" || sector === "crypto";
  const hurtByRisk = sector === "software" || sector === "fintech" || sector === "mega_tech";

  if (geo.risk === "ELEVATED") {
    if (direction === "long" && benefitsFromRisk) {
      points += 4;
      reasons.push(`${sector} benefits from elevated geopolitical risk`);
    } else if (direction === "long" && hurtByRisk) {
      points -= 3;
      reasons.push(`${sector} hurt by elevated risk`);
    } else if (direction === "short" && hurtByRisk) {
      points += 3;
      reasons.push(`${sector} weakness in risk-off tape`);
    }
  } else if (geo.risk === "LOW") {
    if (direction === "long" && hurtByRisk) {
      points += 2;
      reasons.push(`${sector} bid in low-risk regime`);
    }
  }

  // Active scenarios mention
  if (geo.activeScenarios.length > 0) {
    const scenarioList = geo.activeScenarios.slice(0, 2).join(", ");
    if (points !== 0) reasons.push(`Active: ${scenarioList}`);
  }

  if (points === 0 && reasons.length === 0) return null;
  return {
    kind: "geopolitical",
    label: "Geopolitical",
    points,
    why: reasons.length > 0 ? reasons.join(" · ") : `Risk ${geo.risk}`,
    data: { risk: geo.risk, sector, activeScenarios: geo.activeScenarios },
  };
}

async function scoreSectorLayer(symbol: string, sector: Sector, direction: "long" | "short"): Promise<ConvictionLayer | null> {
  // Map sector → sector ETF for tape check
  const sectorEtf: Partial<Record<Sector, string>> = {
    semi_equipment: "SOXX",
    chips: "SMH",
    optics: "SOXX",
    software: "IGV",
    mega_tech: "QQQ",
    fintech: "XLF",
    energy: "XLE",
    crypto: "BITO",
    space: "ITA",
    index: "SPY",
  };

  const etf = sectorEtf[sector];
  if (!etf) return null;

  try {
    const q = (await getTradierQuote(etf)) as { change_percentage?: number } | null;
    if (!q || typeof q.change_percentage !== "number") return null;

    const chg = q.change_percentage;
    let points = 0;
    let why = "";

    if (direction === "long" && chg > 0.5) {
      points = 4;
      why = `${sector} sector ETF ${etf} +${chg.toFixed(1)}%`;
    } else if (direction === "long" && chg < -0.5) {
      points = -2;
      why = `${sector} sector ETF ${etf} ${chg.toFixed(1)}% (headwind)`;
    } else if (direction === "short" && chg < -0.5) {
      points = 4;
      why = `${sector} sector ETF ${etf} ${chg.toFixed(1)}% (weakness)`;
    } else if (direction === "short" && chg > 0.5) {
      points = -2;
      why = `${sector} sector ETF ${etf} +${chg.toFixed(1)}% (against)`;
    } else {
      return null;
    }

    return {
      kind: "sector",
      label: "Sector Tape",
      points,
      why,
      data: { etf, chg },
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Freshness + live re-validation
// ─────────────────────────────────────────────────────────────

/**
 * Convert an idea's `holdingPeriod` field into a hard maximum age (hours).
 * Day/intraday ideas decay fast — a "+5% intraday momentum" idea has no
 * business surviving 6 hours, let alone 56. Swing ideas get more rope.
 */
function maxAgeHoursForIdea(idea: any): number {
  const hp: string = (idea.holdingPeriod || idea.tradeType || "").toLowerCase();
  if (hp.includes("day") || hp.includes("intraday") || hp.includes("scalp")) return 6;
  if (hp.includes("swing")) return 36;
  if (hp.includes("position") || hp.includes("long")) return 96;
  // Unknown — use the swing default rather than the loose old 72h
  return 24;
}

/**
 * Compute idea age in hours from its timestamp.
 */
function ideaAgeHours(idea: any): number {
  const ts = idea.generationTimestamp || idea.timestamp;
  if (!ts) return 0;
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return 0;
  return (Date.now() - t) / 3_600_000;
}

/**
 * Sentiment-vs-direction sanity check. Catches the SHOP-style bug where
 * an idea is marked `direction: long` but the catalyst text says
 * "Bearish momentum (-2.8%)". One of the upstream scanners is mislabeling.
 */
function catalystContradictsDirection(idea: any, direction: "long" | "short"): boolean {
  const text = typeof idea.catalyst === "string" ? idea.catalyst.toLowerCase() : "";
  if (!text) return false;
  const bearishWords = /bearish|breakdown|downtrend|selloff|gap down|distribution|sell-off/;
  const bullishWords = /bullish|breakout|uptrend|surge|gap up|accumulation|rally/;
  if (direction === "long" && bearishWords.test(text) && !bullishWords.test(text)) return true;
  if (direction === "short" && bullishWords.test(text) && !bearishWords.test(text)) return true;
  return false;
}

/**
 * Pre-market layer — scores how the morning gap aligns with the trade direction.
 *
 * Logic: pre-market action is a leading signal for opening direction. A long
 * idea getting confirmed by an up-gap means the overnight tape agrees with
 * the thesis; a down-gap means overnight tape disagrees and the entry is
 * suspect.
 *
 *   Long  + gap up   ≥1%  → +4  ("pre-market confirming")
 *   Long  + gap up   ≥3%  → +5  ("pre-market strong confirming")
 *   Long  + gap down ≥1%  → −4  ("pre-market fading")
 *   Long  + gap down ≥3%  → −6  ("pre-market reversing")
 *   Short, inverse.
 *   Flat (|gap| <1%)      → no layer
 */
function scorePreMarketLayer(
  direction: "long" | "short",
  snap: PreMarketSnapshot | undefined,
): ConvictionLayer | null {
  if (!snap) return null;
  const gap = snap.gapPct;
  if (!Number.isFinite(gap) || Math.abs(gap) < 1) return null;

  // Sign aligned with the trade direction
  const aligned = direction === "long" ? gap : -gap;
  let points = 0;
  let label: string;
  if (aligned >= 3) {
    points = 5;
    label = "Pre-market strong confirming";
  } else if (aligned >= 1) {
    points = 4;
    label = "Pre-market confirming";
  } else if (aligned <= -3) {
    points = -6;
    label = "Pre-market reversing";
  } else if (aligned <= -1) {
    points = -4;
    label = "Pre-market fading";
  } else {
    return null;
  }

  const sign = gap >= 0 ? "+" : "";
  return {
    kind: "premarket",
    label: "Pre-Market",
    points,
    why: `${label} (${sign}${gap.toFixed(2)}% gap, ${snap.phase.replace("_", "-")})`,
    data: {
      gapPct: Number(gap.toFixed(2)),
      direction: snap.gapDirection,
      phase: snap.phase,
      preMarketGapPct: snap.preMarketGapPct,
      openingGapPct: snap.openingGapPct,
    },
  };
}

/**
 * GEX confluence layer — gamma exposure as a directional confidence signal.
 *
 * The dealer-positioning lens:
 *   - **Positive gamma** (dealers long gamma): they hedge by selling rallies,
 *     buying dips → price tends to mean-revert toward max-gamma strike.
 *     A long entry below the flip = pinned, low conviction. Above the flip,
 *     rallying through a positive-gamma zone is *supported*.
 *   - **Negative gamma** (dealers short gamma): they hedge by chasing — sells
 *     beget more sells, rallies beget more buys → vol expands. A short under
 *     the flip is the high-conviction setup; a long above the flip rides the
 *     squeeze.
 *
 * Wall proximity adds a pin-risk modifier (within 1.5% of call wall caps long
 * upside; within 1.5% of put wall caps short downside).
 *
 *   Long  + above flip + positive gamma  →  +3  ("dealers support trend")
 *   Long  + above flip + negative gamma  →  +5  ("vol expansion in your direction")
 *   Long  + below flip + positive gamma  →  −2  ("pinned, dealer resistance")
 *   Long  + below flip + negative gamma  →  −5  ("vol expansion against you")
 *   Short, inverse.
 *   Within 1.5% of call wall (long)      →  −2 modifier
 *   Within 1.5% of put wall  (short)     →  −2 modifier
 *
 * Returns null when GEX data is unavailable or distance to flip is unknown.
 */
function scoreGexLayer(
  direction: "long" | "short",
  snap: GexSnapshot | undefined,
): ConvictionLayer | null {
  if (!snap || snap.flipDistancePct === null || !snap.regime) return null;

  // Are we above or below the flip? If flipDistancePct > 0, the flip is
  // ABOVE spot, meaning spot is BELOW the flip → "below flip".
  const aboveFlip = snap.flipDistancePct < 0;
  const isPositive = snap.regime === "positive_gamma";
  const isNegative = snap.regime === "negative_gamma";
  if (!isPositive && !isNegative) return null; // neutral / transitioning — skip

  // Wall-fade detection — when spot is pinned at the OPPOSING wall under
  // positive gamma, the trade is a mean-revert *fade* of dealer hedging at
  // that wall, NOT a fight against a generic dealer floor/ceiling. The base
  // sign needs to flip in that case, otherwise the grader contradicts the
  // wall-fade scanner that originated the idea.
  const callWallDistPct =
    snap.callWall && snap.spot > 0
      ? ((snap.callWall - snap.spot) / snap.spot) * 100
      : null;
  const putWallDistPct =
    snap.putWall && snap.spot > 0
      ? ((snap.spot - snap.putWall) / snap.spot) * 100
      : null;
  const isShortAtCallWall =
    direction === "short" &&
    isPositive &&
    callWallDistPct !== null &&
    callWallDistPct >= 0 &&
    callWallDistPct <= 1.5;
  const isLongAtPutWall =
    direction === "long" &&
    isPositive &&
    putWallDistPct !== null &&
    putWallDistPct >= 0 &&
    putWallDistPct <= 1.5;

  let points = 0;
  let label: string;

  if (direction === "long") {
    if (isLongAtPutWall) {
      points = 3;
      label = "Wall fade — dealers buy dips at put wall";
    } else if (aboveFlip && isPositive) {
      points = 3;
      label = "Dealers support uptrend";
    } else if (aboveFlip && isNegative) {
      points = 5;
      label = "Vol expansion in your direction";
    } else if (!aboveFlip && isPositive) {
      points = -2;
      label = "Pinned below flip (dealer resistance)";
    } else {
      points = -5;
      label = "Vol expansion against you";
    }
  } else {
    if (isShortAtCallWall) {
      points = 3;
      label = "Wall fade — dealers sell rallies at call wall";
    } else if (!aboveFlip && isPositive) {
      points = 3;
      label = "Dealers support downtrend";
    } else if (!aboveFlip && isNegative) {
      points = 5;
      label = "Vol expansion in your direction";
    } else if (aboveFlip && isPositive) {
      points = -2;
      label = "Pinned above flip (dealer floor)";
    } else {
      points = -5;
      label = "Vol expansion against you";
    }
  }

  // Wall proximity modifier — only applies when the wall is *against* you.
  // Skipped entirely when this is already a wall-fade (handled above).
  let wallMod = 0;
  let wallNote = "";
  if (
    !isLongAtPutWall &&
    direction === "long" &&
    callWallDistPct !== null &&
    callWallDistPct > 0 &&
    callWallDistPct <= 1.5
  ) {
    wallMod = -2;
    wallNote = `, near call wall ${snap.callWall!.toFixed(2)} (+${callWallDistPct.toFixed(1)}%)`;
  } else if (
    !isShortAtCallWall &&
    direction === "short" &&
    putWallDistPct !== null &&
    putWallDistPct > 0 &&
    putWallDistPct <= 1.5
  ) {
    wallMod = -2;
    wallNote = `, near put wall ${snap.putWall!.toFixed(2)} (-${putWallDistPct.toFixed(1)}%)`;
  } else if (isShortAtCallWall) {
    wallNote = `, fading call wall ${snap.callWall!.toFixed(2)} (+${callWallDistPct!.toFixed(1)}%)`;
  } else if (isLongAtPutWall) {
    wallNote = `, fading put wall ${snap.putWall!.toFixed(2)} (-${putWallDistPct!.toFixed(1)}%)`;
  }

  // VEX modifier — vol regime cross-check (small ±1 nudge)
  let vexMod = 0;
  if (snap.vexRegime === "vol_tailwind" && points > 0) vexMod = 1;
  else if (snap.vexRegime === "vol_headwind" && points > 0) vexMod = -1;

  const finalPoints = points + wallMod + vexMod;
  const flipDir = aboveFlip ? "above flip" : "below flip";
  const why =
    `${label} (${snap.regime.replace("_", " ")}, ${flipDir} by ${Math.abs(snap.flipDistancePct).toFixed(1)}%${wallNote})`;

  return {
    kind: "gex",
    label: "GEX",
    points: finalPoints,
    why,
    data: {
      regime: snap.regime,
      vexRegime: snap.vexRegime,
      flipPoint: snap.flipPoint,
      flipDistancePct: snap.flipDistancePct,
      callWall: snap.callWall,
      putWall: snap.putWall,
      aboveFlip,
    },
  };
}

/**
 * Freshness layer — penalizes stale ideas so users see WHY a 12h old
 * "intraday momentum" pick got dropped. Layer points scale with age and
 * with how far the live price has drifted from the original entry.
 *
 * **Pre-market rescue:** if an idea is stale but the pre-market gap aligns
 * with its direction by ≥1%, the staleness penalty is softened (a 24h-old
 * idea that's gapping in its favor this morning is suddenly relevant again).
 */
function scoreFreshnessLayer(
  idea: any,
  direction: "long" | "short",
  liveQuote: RealtimeQuote | undefined,
  preMarket?: PreMarketSnapshot,
): ConvictionLayer | null {
  const ageH = ideaAgeHours(idea);
  const reasons: string[] = [];
  let points = 0;

  // Age decay — pure time penalty
  if (ageH < 2) {
    points += 0;
  } else if (ageH < 6) {
    points -= 2;
    reasons.push(`${ageH.toFixed(1)}h old`);
  } else if (ageH < 12) {
    points -= 4;
    reasons.push(`${ageH.toFixed(1)}h old (stale)`);
  } else {
    points -= 6;
    reasons.push(`${ageH.toFixed(0)}h old (very stale)`);
  }

  // Pre-market rescue — overnight tape agrees with the thesis, so the
  // staleness penalty is dialed back. We don't fully cancel because the
  // entry/target/stop levels may still be wrong, but a gapping confirmation
  // earns back most of the age penalty.
  if (preMarket && Number.isFinite(preMarket.gapPct)) {
    const aligned = direction === "long" ? preMarket.gapPct : -preMarket.gapPct;
    if (aligned >= 1 && points < 0) {
      const rescue = aligned >= 3 ? Math.abs(points) : Math.min(3, Math.abs(points));
      points += rescue;
      reasons.push(`pre-market rescue +${rescue} (gap ${preMarket.gapPct >= 0 ? "+" : ""}${preMarket.gapPct.toFixed(1)}%)`);
    }
  }

  // Drift penalty — how far has price moved away from the entry?
  const entry = typeof idea.entryPrice === "number" ? idea.entryPrice : null;
  if (liveQuote && entry && entry > 0 && Number.isFinite(liveQuote.price)) {
    const driftPct = ((liveQuote.price - entry) / entry) * 100;
    const adverseDrift =
      direction === "long" ? driftPct < 0 : driftPct > 0;
    if (Math.abs(driftPct) >= 3 && adverseDrift) {
      // Adverse move against the trade — additional penalty
      points -= 2;
      reasons.push(
        `price ${driftPct >= 0 ? "+" : ""}${driftPct.toFixed(1)}% from entry (against)`,
      );
    } else if (Math.abs(driftPct) >= 3 && !adverseDrift) {
      // Already ran in the trade direction — entry is now a chase
      reasons.push(
        `price ${driftPct >= 0 ? "+" : ""}${driftPct.toFixed(1)}% from entry (chase)`,
      );
    }
  }

  if (points === 0 && reasons.length === 0) return null;
  return {
    kind: "freshness",
    label: "Freshness",
    points,
    why: reasons.length > 0 ? reasons.join(" · ") : "Fresh",
    data: {
      ageHours: Number(ageH.toFixed(1)),
      livePrice: liveQuote?.price ?? null,
      entryPrice: entry,
    },
  };
}

interface RevalidationResult {
  /** Live quote if available. */
  quote: RealtimeQuote | undefined;
  /** True if the idea should be HARD REJECTED (already stopped, chased, or contradiction). */
  reject: boolean;
  /** Diagnostic reason if rejected. */
  rejectReason: string | null;
}

/**
 * Live price re-validation. Runs after the candidate filter, before scoring.
 *
 * Hard reject conditions:
 *   1. Direction contradicts catalyst sentiment (mislabeled idea)
 *   2. Live price has already broken the stop loss (idea is dead)
 *   3. Live price has run >50% of the way to target (entry is now a chase)
 *
 * Anything that survives gets the freshness layer applied during scoring.
 */
function revalidateOne(
  idea: any,
  direction: "long" | "short",
  quote: RealtimeQuote | undefined,
): RevalidationResult {
  // 1. Catalyst/direction contradiction — always reject
  if (catalystContradictsDirection(idea, direction)) {
    return {
      quote,
      reject: true,
      rejectReason: `direction=${direction} contradicts catalyst "${idea.catalyst}"`,
    };
  }

  // No live quote — keep the idea, freshness layer will still apply age penalty
  if (!quote || !Number.isFinite(quote.price)) {
    return { quote, reject: false, rejectReason: null };
  }

  const live = quote.price;
  const entry = typeof idea.entryPrice === "number" ? idea.entryPrice : null;
  const target = typeof idea.targetPrice === "number" ? idea.targetPrice : null;
  const stop = typeof idea.stopLoss === "number" ? idea.stopLoss : null;

  if (entry === null) return { quote, reject: false, rejectReason: null };

  // 2. Already stopped out
  if (stop !== null) {
    if (direction === "long" && live <= stop) {
      return { quote, reject: true, rejectReason: `live ${live} ≤ stop ${stop}` };
    }
    if (direction === "short" && live >= stop) {
      return { quote, reject: true, rejectReason: `live ${live} ≥ stop ${stop}` };
    }
  }

  // 3. Already chased (price ran >50% of the way to target)
  if (target !== null) {
    const totalMove = Math.abs(target - entry);
    const realized = direction === "long" ? live - entry : entry - live;
    if (totalMove > 0 && realized / totalMove >= 0.5) {
      return {
        quote,
        reject: true,
        rejectReason: `price ran ${((realized / totalMove) * 100).toFixed(0)}% to target — chase`,
      };
    }
  }

  return { quote, reject: false, rejectReason: null };
}

/**
 * Public batch revalidation — used by /api/trade-ideas/best-setups so that
 * the 12+ downstream consumers (Top Conviction widget, high-conviction-alert,
 * home, landing, stock-detail, etc.) all benefit from the same Phase 1
 * freshness checks the convictions engine applies.
 *
 * Steps:
 *   1. Hard age cap based on holding period
 *   2. Catalyst/direction contradiction reject
 *   3. Live price reject (already stopped, already chased)
 *   4. Annotate survivors with currentPrice + driftPct + ageHours +
 *      freshnessFlags so the UI can show "5h old, +2.1% drift" context.
 */
export interface RevalidatedBestSetup {
  // Mutated copy of the original idea with extra fields:
  // currentPrice, driftPct, ageHours, freshnessFlags
  [key: string]: unknown;
}

export interface RevalidationDiagnostics {
  rejected: Array<{ symbol: string; reason: string }>;
  ageRejected: number;
  liveRejected: number;
}

export async function revalidateBestSetups(
  ideas: any[],
): Promise<{ kept: any[]; diagnostics: RevalidationDiagnostics }> {
  const diagnostics: RevalidationDiagnostics = {
    rejected: [],
    ageRejected: 0,
    liveRejected: 0,
  };
  if (!Array.isArray(ideas) || ideas.length === 0) {
    return { kept: [], diagnostics };
  }

  // Age cap pass
  const ageGated: any[] = [];
  for (const idea of ideas) {
    const ageH = ideaAgeHours(idea);
    const cap = maxAgeHoursForIdea(idea);
    if (ageH > cap) {
      diagnostics.ageRejected++;
      diagnostics.rejected.push({
        symbol: idea.symbol,
        reason: `age ${ageH.toFixed(1)}h > cap ${cap}h`,
      });
      continue;
    }
    ageGated.push(idea);
  }

  if (ageGated.length === 0) return { kept: [], diagnostics };

  // Batch live quote fetch
  const validAssetTypes = new Set(["stock", "crypto", "option", "futures"]);
  const quoteRequests = ageGated.map((idea: any) => {
    const at = typeof idea.assetType === "string" ? idea.assetType.toLowerCase() : "stock";
    return {
      symbol: idea.symbol,
      assetType: (validAssetTypes.has(at) ? at : "stock") as "stock" | "crypto" | "option" | "futures",
    };
  });
  let quoteMap = new Map<string, RealtimeQuote>();
  try {
    quoteMap = await getRealtimeBatchQuotes(quoteRequests);
  } catch (err) {
    logger.warn("[BEST-SETUPS] live quote batch failed, keeping ideas without revalidation:", err);
  }

  // Per-idea revalidation + annotation
  const kept: any[] = [];
  for (const idea of ageGated) {
    const dir: "long" | "short" =
      typeof idea.targetPrice === "number" && typeof idea.entryPrice === "number"
        ? idea.targetPrice > idea.entryPrice
          ? "long"
          : "short"
        : ((idea.direction || "long") as string).toLowerCase() === "short"
          ? "short"
          : "long";
    const quote = quoteMap.get(idea.symbol);
    const result = revalidateOne(idea, dir, quote);
    if (result.reject) {
      diagnostics.liveRejected++;
      diagnostics.rejected.push({
        symbol: idea.symbol,
        reason: result.rejectReason || "rejected",
      });
      continue;
    }

    const ageH = ideaAgeHours(idea);
    const livePrice = quote && Number.isFinite(quote.price) ? quote.price : null;
    const entry = typeof idea.entryPrice === "number" ? idea.entryPrice : null;
    let driftPct: number | null = null;
    if (livePrice !== null && entry !== null && entry !== 0) {
      driftPct = ((livePrice - entry) / entry) * 100;
    }

    const flags: string[] = [];
    if (ageH > 2) flags.push("aged");
    if (ageH > 6) flags.push("stale");
    if (driftPct !== null) {
      // Drift "against" the trade
      const against = dir === "long" ? -driftPct : driftPct;
      if (against >= 1) flags.push("drift_against");
      if (against >= 2.5) flags.push("drift_significant");
    }

    kept.push({
      ...idea,
      currentPrice: livePrice,
      driftPct: driftPct !== null ? Math.round(driftPct * 100) / 100 : null,
      ageHours: Math.round(ageH * 10) / 10,
      freshnessFlags: flags,
    });
  }

  if (diagnostics.ageRejected + diagnostics.liveRejected > 0) {
    logger.info(
      `[BEST-SETUPS] revalidation: kept ${kept.length}, rejected ${diagnostics.ageRejected} (age) + ${diagnostics.liveRejected} (live)`,
    );
  }

  return { kept, diagnostics };
}

// ─────────────────────────────────────────────────────────────
// Module-level cache so /api/trade-ideas/best-setups can reuse the
// expensive convictions pass without paying for it on every request.
// 60s TTL — short enough that the desk's 30s polling sees fresh data
// every other tick, long enough to absorb a refresh storm.
// ─────────────────────────────────────────────────────────────

const _convictionsCache = new Map<string, { data: ConvictionsResponse; expiresAt: number }>();
const CONVICTIONS_CACHE_TTL_MS = 60_000;

/**
 * Returns a cached convictions snapshot (60s TTL) or builds a fresh one.
 * Used by best-setups + /api/convictions to share one expensive scoring
 * pass — eliminating the score mismatch between the two parallel pipelines.
 *
 * Cache is keyed by the option fingerprint (lookback / limit / watchlist /
 * minScore / weeklyUserId / weeklyOnly) so per-user weekly boosts are
 * preserved without cross-contamination.
 */
export async function getCachedConvictions(
  opts: BuildConvictionsOptions = {},
): Promise<ConvictionsResponse> {
  const merged: BuildConvictionsOptions = {
    lookbackHours: opts.lookbackHours ?? 96,
    limit: opts.limit ?? 500,
    watchlistOnly: opts.watchlistOnly ?? false,
    minScore: opts.minScore ?? 0,
    weeklyUserId: opts.weeklyUserId,
    weeklyOnly: opts.weeklyOnly ?? false,
  };
  const key = JSON.stringify(merged);
  const now = Date.now();
  const hit = _convictionsCache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.data;
  }
  const data = await buildConvictions(merged);
  _convictionsCache.set(key, { data, expiresAt: now + CONVICTIONS_CACHE_TTL_MS });
  // Bound the cache so distinct option combos don't grow unbounded.
  if (_convictionsCache.size > 16) {
    const oldest = Array.from(_convictionsCache.entries()).sort(
      (a, b) => a[1].expiresAt - b[1].expiresAt,
    )[0];
    if (oldest) _convictionsCache.delete(oldest[0]);
  }
  return data;
}

// ─────────────────────────────────────────────────────────────
// Main entry
// ─────────────────────────────────────────────────────────────

export interface BuildConvictionsOptions {
  /** Lookback window in hours (default 96). */
  lookbackHours?: number;
  /** Maximum picks to return (default 25). */
  limit?: number;
  /** Filter to approved watchlist only (default true). */
  watchlistOnly?: boolean;
  /** Minimum conviction score floor (default 15). */
  minScore?: number;
  /** Disable live re-validation (for backtest replay). */
  skipLiveRevalidation?: boolean;
  /**
   * If set, prefer the user's weekly watchlist for the current week — these
   * symbols receive a +3 priority boost in scoring. When `weeklyOnly` is true,
   * we filter ideas down to weekly symbols only.
   */
  weeklyUserId?: string;
  /** Restrict candidates to weekly watchlist symbols only. */
  weeklyOnly?: boolean;
}

export async function buildConvictions(opts: BuildConvictionsOptions = {}): Promise<ConvictionsResponse> {
  // Wide lookback window — the per-idea age cap (holding-period aware:
  // intraday=6h, swing=36h, position=96h) does the real freshness filtering.
  const lookbackHours = opts.lookbackHours ?? 96;
  const limit = opts.limit ?? 25;
  const watchlistOnly = opts.watchlistOnly ?? true;
  const minScore = opts.minScore ?? 15;
  const skipLiveRevalidation = opts.skipLiveRevalidation ?? false;
  const weeklyUserId = opts.weeklyUserId;
  const weeklyOnly = opts.weeklyOnly ?? false;

  // Pull this user's weekly watchlist set if requested. We use a Set for O(1)
  // membership checks during scoring + filtering.
  let weeklySymbols: Set<string> | null = null;
  if (weeklyUserId) {
    try {
      const { getWeeklyWatchlist } = await import("./weekly-watchlist-seeder");
      const items = await getWeeklyWatchlist(weeklyUserId);
      if (items.length > 0) {
        weeklySymbols = new Set(items.map((i: any) => i.symbol.toUpperCase()));
      }
    } catch (err) {
      logger.warn("[CONVICTIONS] weekly watchlist fetch failed:", err);
    }
  }

  const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

  // Fetch market context, geopolitical matrix, breadth, and recent ideas in parallel
  const [marketCtx, geoMatrix, breadth, rawIdeas] = await Promise.all([
    getMarketContext().catch((err) => {
      logger.warn("[CONVICTIONS] market context failed:", err);
      return null;
    }),
    getScenarioMatrix().catch((err) => {
      logger.warn("[CONVICTIONS] geo matrix failed:", err);
      return null;
    }),
    getMarketBreadth().catch((err) => {
      logger.warn("[CONVICTIONS] breadth failed:", err);
      return null;
    }),
    db
      .select()
      .from(tradeIdeas)
      .where(gte(tradeIdeas.timestamp, cutoff))
      .orderBy(desc(tradeIdeas.timestamp))
      // Backtest replay needs the full historical pool; live convictions
      // only ever look at the recent slice so 500 is plenty.
      .limit(skipLiveRevalidation ? 20000 : 500),
  ]);

  let watchlistFiltered = watchlistOnly
    ? rawIdeas.filter((idea: any) => isApprovedTicker(idea.symbol))
    : rawIdeas;

  // Hard restrict to weekly watchlist tickers if requested
  if (weeklyOnly && weeklySymbols) {
    watchlistFiltered = watchlistFiltered.filter((idea: any) =>
      weeklySymbols!.has(idea.symbol.toUpperCase()),
    );
  }

  // Hard age cap based on the idea's holding period — kills "+5% intraday
  // momentum" ideas that have been sitting in the DB for 2 days.
  // Skipped in backtest replay so historical ideas aren't filtered out
  // by the simple fact that they're old.
  const ageGated = skipLiveRevalidation
    ? watchlistFiltered
    : watchlistFiltered.filter(
        (idea: any) => ideaAgeHours(idea) <= maxAgeHoursForIdea(idea),
      );
  if (!skipLiveRevalidation && watchlistFiltered.length !== ageGated.length) {
    logger.info(
      `[CONVICTIONS] age cap removed ${watchlistFiltered.length - ageGated.length} stale ideas (kept ${ageGated.length})`,
    );
  }

  // Live re-validation — fetch one batch quote pass for every surviving
  // candidate, then hard-reject contradictions / stopped-out / chase entries.
  const liveQuotes = new Map<string, RealtimeQuote>();
  let revalidated = ageGated as any[];
  if (!skipLiveRevalidation && ageGated.length > 0) {
    try {
      const validAssetTypes = new Set(["stock", "crypto", "option", "futures"]);
      const quoteRequests = ageGated.map((idea: any) => {
        const at = typeof idea.assetType === "string" ? idea.assetType.toLowerCase() : "stock";
        return {
          symbol: idea.symbol,
          assetType: (validAssetTypes.has(at) ? at : "stock") as "stock" | "crypto" | "option" | "futures",
        };
      });
      const quoteMap = await getRealtimeBatchQuotes(quoteRequests);
      quoteMap.forEach((q, sym) => liveQuotes.set(sym, q));

      const survivors: any[] = [];
      let rejectCount = 0;
      for (const idea of ageGated as any[]) {
        const dir: "long" | "short" =
          typeof idea.targetPrice === "number" && typeof idea.entryPrice === "number"
            ? idea.targetPrice > idea.entryPrice
              ? "long"
              : "short"
            : (idea.direction as "long" | "short") || "long";
        const result = revalidateOne(idea, dir, liveQuotes.get(idea.symbol));
        if (result.reject) {
          rejectCount++;
          logger.debug(
            `[CONVICTIONS] reject ${idea.symbol} (${dir}): ${result.rejectReason}`,
          );
          continue;
        }
        survivors.push(idea);
      }
      revalidated = survivors;
      if (rejectCount > 0) {
        logger.info(
          `[CONVICTIONS] live revalidation rejected ${rejectCount} ideas (kept ${survivors.length})`,
        );
      }
    } catch (err) {
      logger.warn("[CONVICTIONS] live revalidation failed, keeping all candidates:", err);
    }
  }

  const candidates = revalidated;

  // Pre-market snapshots — batch fetch for every surviving candidate so the
  // scoring loop has overnight gap data when applying the pre-market layer
  // and the freshness rescue. Skipped during backtest replay (historical
  // ideas can't be re-validated against today's pre-market tape).
  const preMarketBySymbol = new Map<string, PreMarketSnapshot>();
  const gexBySymbol = new Map<string, GexSnapshot>();
  if (!skipLiveRevalidation && candidates.length > 0) {
    const symbols = Array.from(
      new Set((candidates as any[]).map((c) => c.symbol).filter(Boolean)),
    );
    // Run pre-market and GEX batches in parallel — both are independent.
    // GEX is the more expensive of the two (options-chain fetch per symbol),
    // so it gets a generous concurrency budget but is heavily cached (5min).
    const [pmRes, gexRes] = await Promise.allSettled([
      getPreMarketBatch(symbols),
      getGexSnapshotBatch(symbols),
    ]);
    if (pmRes.status === "fulfilled") {
      pmRes.value.forEach((s, sym) => preMarketBySymbol.set(sym, s));
      if (pmRes.value.size > 0) {
        const gappers = Array.from(pmRes.value.values()).filter((s) => Math.abs(s.gapPct) >= 1).length;
        logger.info(
          `[CONVICTIONS] pre-market snapshots: ${pmRes.value.size} fetched, ${gappers} gappers ≥1%`,
        );
      }
    } else {
      logger.warn("[CONVICTIONS] pre-market batch fetch failed:", pmRes.reason);
    }
    if (gexRes.status === "fulfilled") {
      gexRes.value.forEach((s, sym) => gexBySymbol.set(sym, s));
      if (gexRes.value.size > 0) {
        const positives = Array.from(gexRes.value.values()).filter((s) => s.regime === "positive_gamma").length;
        const negatives = Array.from(gexRes.value.values()).filter((s) => s.regime === "negative_gamma").length;
        logger.info(
          `[CONVICTIONS] GEX snapshots: ${gexRes.value.size} fetched (${positives} positive, ${negatives} negative gamma)`,
        );
      }
    } else {
      logger.warn("[CONVICTIONS] GEX batch fetch failed:", gexRes.reason);
    }
  }

  const breadthResponse = breadth
    ? {
        regime: breadth.regime,
        bias: breadth.bias,
        advanceDeclineRatio: breadth.advanceDeclineRatio,
        percentAbove200MA: breadth.percentAbove200MA,
        percentAbove50MA: breadth.percentAbove50MA,
        newHighsLows: breadth.newHighsLows,
        sampleSize: breadth.sampleSize,
        interpretation: breadth.interpretation,
      }
    : null;

  if (!marketCtx) {
    return {
      generatedAt: new Date().toISOString(),
      marketContext: {
        regime: "unknown",
        riskSentiment: "neutral",
        preferredDirection: "BOTH",
        score: 50,
        vixLevel: null,
        reasons: ["market context unavailable"],
      },
      breadth: breadthResponse,
      geopolitical: { risk: "NORMAL", activeScenarios: [] },
      totalCandidatesScanned: candidates.length,
      picks: [],
    };
  }

  const geo = {
    risk: geoMatrix?.currentConditions.geopoliticalRisk ?? "NORMAL",
    activeScenarios: geoMatrix?.currentConditions.activeScenarios ?? [],
  };

  // Build picks (sector layer needs async fetches — Promise.all per pick)
  const picks: ConvictionPick[] = [];

  for (const idea of candidates as any[]) {
    const direction: "long" | "short" =
      typeof idea.targetPrice === "number" && typeof idea.entryPrice === "number"
        ? idea.targetPrice > idea.entryPrice
          ? "long"
          : "short"
        : (idea.direction as "long" | "short") || "long";

    const sector = getSector(idea.symbol);
    const layers: ConvictionLayer[] = [];

    const technical = scoreTechnicalLayer(idea, direction);
    if (technical) layers.push(technical);

    const qualitySignals = scoreQualitySignalsLayer(idea, direction);
    if (qualitySignals) layers.push(qualitySignals);

    const tier = scoreTierLayer(idea.symbol, idea.riskRewardRatio);
    if (tier) layers.push(tier);

    const convergence = scoreConvergenceLayer(idea.convergenceSignalsJson, direction);
    if (convergence) layers.push(convergence);

    const catalyst = scoreCatalystLayer(idea, direction);
    if (catalyst) layers.push(catalyst);

    const regime = scoreRegimeLayer(direction, marketCtx);
    if (regime) layers.push(regime);

    const breadthLayer = scoreBreadthLayer(direction, breadth);
    if (breadthLayer) layers.push(breadthLayer);

    const geopolitical = scoreGeopoliticalLayer(idea.symbol, sector, direction, geo);
    if (geopolitical) layers.push(geopolitical);

    // Pre-market layer — overnight gap as a leading direction signal.
    // Skipped during backtest replay (historical pre-market data is not
    // re-fetchable through this code path).
    const preMarketSnap = preMarketBySymbol.get(idea.symbol.toUpperCase());
    if (!skipLiveRevalidation) {
      const preMarket = scorePreMarketLayer(direction, preMarketSnap);
      if (preMarket) layers.push(preMarket);
    }

    // GEX layer — dealer positioning as directional confluence.
    // Positive gamma above flip supports longs; negative gamma below flip
    // supports shorts via vol expansion. Skipped during backtest replay.
    const gexSnap = gexBySymbol.get(idea.symbol.toUpperCase());
    if (!skipLiveRevalidation) {
      const gex = scoreGexLayer(direction, gexSnap);
      if (gex) layers.push(gex);
    }

    // Freshness — penalizes stale ideas + adverse drift since entry.
    // Pre-market snapshot is passed in for the rescue path (a stale idea
    // gapping in its direction earns back most of the staleness penalty).
    // Skipped during backtest replay so historical scores aren't biased.
    if (!skipLiveRevalidation) {
      const freshness = scoreFreshnessLayer(
        idea,
        direction,
        liveQuotes.get(idea.symbol),
        preMarketSnap,
      );
      if (freshness) layers.push(freshness);
    }

    // Weekly priority — flat +3 boost for any symbol on the user's
    // weekly focus list. Encodes "this is what I'm watching this week."
    if (weeklySymbols && weeklySymbols.has(idea.symbol.toUpperCase())) {
      layers.push({
        kind: "weekly",
        label: "Weekly Focus",
        points: 3,
        why: "On your weekly watchlist",
      });
    }

    // Sector + analyst layers are async; only fetched for top candidates
    // after pre-rank (to avoid blasting Tradier/Yahoo with hundreds of
    // quote requests). We'll add them in a second pass below.

    const totalPoints = layers.reduce((s, l) => s + l.points, 0);
    // Sector layer adds up to ±4, analyst layer up to ±6
    if (totalPoints < minScore - 10) continue;

    picks.push({
      ideaId: idea.id,
      symbol: idea.symbol,
      sector,
      direction,
      assetType: idea.assetType,
      holdingPeriod: idea.holdingPeriod,
      tradeType: idea.tradeType ?? null,
      entryPrice: idea.entryPrice,
      targetPrice: idea.targetPrice,
      stopLoss: idea.stopLoss,
      riskRewardRatio: idea.riskRewardRatio,
      optionType: (idea.optionType as "call" | "put" | null) ?? null,
      strikePrice: idea.strikePrice ?? null,
      expiryDate: idea.expiryDate ?? null,
      convictionScore: 0, // filled below
      convictionBand: "C",
      layerCount: layers.length,
      layers,
      thesis: idea.convergenceSignalsJson?.primaryThesis ?? idea.catalyst ?? "",
      catalyst: idea.catalyst ?? "",
      catalystSourceUrl: idea.catalystSourceUrl ?? null,
      generatedAt: idea.generationTimestamp ?? idea.timestamp,
    });
  }

  // Dedupe by symbol+direction so the same name with multiple recent ideas
  // doesn't dominate the leaderboard. Keep the highest-scoring pick per key.
  const dedupMap = new Map<string, ConvictionPick>();
  for (const p of picks) {
    const key = `${p.symbol}::${p.direction}`;
    const existing = dedupMap.get(key);
    const sum = p.layers.reduce((s, l) => s + l.points, 0);
    if (!existing) {
      dedupMap.set(key, p);
    } else {
      const exSum = existing.layers.reduce((s, l) => s + l.points, 0);
      if (sum > exSum) dedupMap.set(key, p);
    }
  }
  const deduped: ConvictionPick[] = Array.from(dedupMap.values());

  // Pre-rank by point sum so we only fetch sector quotes for the top N
  deduped.sort((a, b) => {
    const aSum = a.layers.reduce((s, l) => s + l.points, 0);
    const bSum = b.layers.reduce((s, l) => s + l.points, 0);
    return bSum - aSum;
  });
  const topForSector = deduped.slice(0, Math.min(limit * 2, deduped.length));

  // Sector + analyst enrichment (parallel, capped to top picks)
  await Promise.all(
    topForSector.map(async (p) => {
      const [sectorLayer, analystSnap] = await Promise.all([
        scoreSectorLayer(p.symbol, p.sector, p.direction),
        getAnalystSnapshot(p.symbol).catch(() => null),
      ]);
      if (sectorLayer) {
        p.layers.push(sectorLayer);
      }
      const analystLayer = scoreAnalystLayer(analystSnap, p.direction, p.entryPrice);
      if (analystLayer) {
        p.layers.push(analystLayer);
      }
      p.layerCount = p.layers.length;
    }),
  );

  // Final scoring + band assignment.
  // Bands tuned to realistic point yield:
  //   S = 30+ (technical + tier + convergence + regime + sector all firing)
  //   A = 22+ (4-5 layers strongly aligned)
  //   B = 15+ (3 layers aligned)
  //   C = below
  for (const p of deduped) {
    const total = p.layers.reduce((s, l) => s + l.points, 0);
    p.convictionScore = Math.max(0, Math.min(100, total));
    p.convictionBand =
      p.convictionScore >= 30 ? "S" : p.convictionScore >= 22 ? "A" : p.convictionScore >= 15 ? "B" : "C";
  }

  // Final sort + minScore floor + limit
  deduped.sort((a, b) => b.convictionScore - a.convictionScore);
  const filtered = deduped.filter((p) => p.convictionScore >= minScore).slice(0, limit);

  return {
    generatedAt: new Date().toISOString(),
    marketContext: {
      regime: marketCtx.regime,
      riskSentiment: marketCtx.riskSentiment,
      preferredDirection: marketCtx.preferredDirection,
      score: marketCtx.score,
      vixLevel: marketCtx.vixLevel,
      reasons: marketCtx.reasons,
    },
    breadth: breadthResponse,
    geopolitical: geo,
    totalCandidatesScanned: candidates.length,
    picks: filtered,
  };
}
