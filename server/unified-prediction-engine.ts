/**
 * Unified Market Prediction Engine
 * ==================================
 * Correlates ALL available signals into a single swing/day-to-day projection:
 *   - GEX + VEX targets (dealer hedging walls, vanna magnets)
 *   - Geopolitical scenario overlay (active scenarios affecting assets)
 *   - Psych Levels (key support/resistance from expected moves + GEX walls)
 *   - Technical signals (RSI, EMA, momentum regime)
 *   - VIX regime & term structure
 *   - Sector correlation
 *
 * Output: A unified prediction with direction, confidence, key levels,
 *         and a correlated narrative explaining how signals align.
 */

import { logger } from './logger';
import { getCachedProjection, type ProjectorResult, type ProjectionRange } from './gex-vex-projector';
import { getScenarioMatrix, type ScenarioMatrix, type Scenario } from './geopolitical-matrix';
import { recordProjection } from './projection-validator';

// ─── Types ───────────────────────────────────────────────────

export interface PsychLevel {
  price: number;
  type: 'RESISTANCE' | 'SUPPORT' | 'PIVOT' | 'PSYCH_ROUND';
  source: string;           // 'GEX_WALL' | 'VEX_MAGNET' | 'EXPECTED_MOVE' | 'ROUND_NUMBER' | 'FLIP_ZONE'
  strength: number;         // 0-100
  label: string;
}

export interface SignalCorrelation {
  signal: string;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  weight: number;           // contribution to final score
  detail: string;
}

export interface TradeSetup {
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  timeframe: 'SCALP' | 'DAY' | 'SWING';
  entry: number;
  target: number;
  stop: number;
  riskReward: string;
  grade: 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D';
  rules: string[];
}

export interface UnifiedPrediction {
  symbol: string;
  spotPrice: number;
  timestamp: string;

  // Data freshness — so the user knows what they can rely on
  dataFreshness?: {
    priceSource: 'CHART_CANDLE' | 'QUOTE' | 'TRADIER' | 'STALE';
    priceAge: string;           // "< 1 min" or "2 hours stale"
    gexSource: 'TRADIER' | 'YAHOO' | 'NONE';
    vixLive: boolean;
    lastUpdate: string;         // ISO timestamp
    nextUpdate: string;         // "~2 min" auto-refresh
  };

  // Overall prediction
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;        // 0-100
  predictionText: string;    // "SPY likely to test $665 resistance before pulling back to $655"

  // Psych Levels — the key levels that matter
  psychLevels: PsychLevel[];
  t1Resist: PsychLevel | null;
  t1Support: PsychLevel | null;

  // Signal breakdown — what's agreeing/disagreeing
  signals: SignalCorrelation[];
  signalAlignment: number;   // -100 (all bearish) to +100 (all bullish)

  // Trade setups derived from correlated signals
  setups: TradeSetup[];

  // GEX/VEX data (forwarded from projector)
  gexVex: {
    regime: string;
    gexAnchor: number | null;
    gexFlip: number | null;
    vexAnchor: number | null;
    vexFlip: number | null;
    callWalls: number[];
    putWalls: number[];
    upsideTarget: number | null;
    downsideTarget: number | null;
    projectionRange: ProjectionRange | null;
    regimeStrength: number;
    gammaConcentration: { strike: number; percent: number; netGEX: number }[];
  } | null;

  // Active geopolitical scenarios
  activeScenarios: {
    id: string;
    name: string;
    icon: string;
    likelihood: string;
    impact: string;          // "SPY +1.5% if triggered"
  }[];

  // VIX-derived expected move context
  expectedMove: {
    daily: number;           // ±$ daily expected move (1σ)
    weekly: number;          // ±$ weekly expected move (1σ)
    vixLevel: number;
    vixChange: number;       // daily VIX change in points
    vixRegime: 'EXTREME_FEAR' | 'FEAR' | 'ELEVATED' | 'NORMAL' | 'COMPLACENT';
    impliedDailyRange: { low: number; high: number };
    impliedWeeklyRange: { low: number; high: number };
  } | null;

  // Correlation narrative — how all signals connect
  narrative: string;

  // Multi-horizon outlook — separate projections for different time horizons
  horizonOutlook?: HorizonOutlook;

  // Options flow data
  flowData?: {
    putCallRatio: number;
    volumePCR: number;
    flowBias: 'CALL_HEAVY' | 'PUT_HEAVY' | 'BALANCED';
    totalCallOI: number;
    totalPutOI: number;
  };
}

export interface HorizonProjection {
  horizon: 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH';
  label: string;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  target: number;
  emRange: { low: number; high: number };
  keyDriver: string;         // "Positive gamma dampens" or "Put-heavy flow" etc
  signals: string[];         // compact list of what's driving this horizon
}

export interface HorizonOutlook {
  today: HorizonProjection;
  thisWeek: HorizonProjection;
  thisMonth: HorizonProjection;
}

// ─── Signal Weights ──────────────────────────────────────────

const SIGNAL_WEIGHTS = {
  gexRegime: 25,       // Gamma regime is the strongest mechanical force
  vexBias: 15,         // Vanna adds directional overlay
  momentum: 20,        // RSI + EMA alignment
  vixRegime: 15,       // Fear/greed context
  flowBias: 10,        // Options flow direction
  geopolitical: 10,    // Active scenario bias
  sectorCorr: 5,       // Sector rotation signal
};

// ─── Main Engine ─────────────────────────────────────────────

export async function computeUnifiedPrediction(
  symbol: string,
  intelData?: any,
  projectorData?: any,
  timeframe?: string,
): Promise<UnifiedPrediction | null> {
  try {
    logger.info(`[UNIFIED] Computing prediction for ${symbol}...`);

    // ── 1. Gather all data sources in parallel ──
    // Fetch VIX for context-aware projection
    let vixLevel = 0;
    let vixChange = 0;
    try {
      const { safeQuote, getBestPrice } = await import('./yahoo-finance-service');
      const vixQuote = await safeQuote('^VIX');
      vixLevel = getBestPrice(vixQuote) || vixQuote?.regularMarketPrice || 0;
      vixChange = vixQuote?.regularMarketChange || 0;
    } catch {}

    // Compute days to nearest Friday (weekly OpEx)
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun, 5=Fri
    const daysToExpiry = dayOfWeek <= 5 ? (5 - dayOfWeek) : (5 + 7 - dayOfWeek);

    const projCtx = { vixLevel, vixChange, daysToExpiry };

    const [gexVexResult, geoMatrix] = await Promise.all([
      getCachedProjection(symbol, projCtx, timeframe).catch(() => null),
      getScenarioMatrix().catch(() => null),
    ]);

    // Get the freshest price — cross-validate sources to avoid stale/bad data
    const gexSpot = gexVexResult?.spotPrice || 0;
    const intelSpot = intelData?.spotPrice || 0;
    const projSpot = projectorData?.expectedMoves?.find((em: any) => em.symbol === symbol)?.currentPrice || 0;
    let spot = gexSpot || intelSpot || projSpot;

    let priceSource: 'CHART_CANDLE' | 'QUOTE' | 'TRADIER' | 'STALE' = 'STALE';
    let priceAge = 'unknown';
    try {
      const { safeQuote, getBestPrice, getChartLastPrice } = await import('./yahoo-finance-service');

      // Fetch quote AND chart last price in parallel for cross-validation
      const [freshQuote, chartPrice] = await Promise.all([
        safeQuote(symbol),
        getChartLastPrice(symbol),
      ]);
      const quotePrice = getBestPrice(freshQuote);

      // Chart candle data is ground truth — regularMarketPrice can be stale by hours
      if (chartPrice > 0 && quotePrice > 0) {
        const divergence = Math.abs(chartPrice - quotePrice) / quotePrice;
        if (divergence > 0.01) {
          logger.warn(`[UNIFIED] Quote stale: quote $${quotePrice.toFixed(2)} vs chart $${chartPrice.toFixed(2)} (${(divergence * 100).toFixed(1)}%). Using chart price.`);
          spot = chartPrice;
          priceSource = 'CHART_CANDLE';
          priceAge = '< 1 min';
        } else {
          spot = quotePrice;
          priceSource = 'QUOTE';
          priceAge = '< 1 min';
        }
      } else if (chartPrice > 0) {
        spot = chartPrice;
        priceSource = 'CHART_CANDLE';
        priceAge = '< 1 min';
      } else if (quotePrice > 0) {
        spot = quotePrice;
        priceSource = 'QUOTE';
        priceAge = '< 5 min';
      }

      // If still no price, try GEX chain spot or regular close
      if (spot === 0 && gexSpot > 0) { spot = gexSpot; priceSource = 'TRADIER'; priceAge = '< 15 min'; }
      if (spot === 0 && freshQuote?.regularMarketPrice > 0) { spot = freshQuote.regularMarketPrice; priceSource = 'STALE'; priceAge = 'possibly stale'; }
    } catch {}

    if (spot === 0) {
      logger.warn(`[UNIFIED] No spot price for ${symbol}`);
      return null;
    }

    // ── 1b. VIX-derived expected move (sizes EVERYTHING) ──
    const dailyEM = vixLevel > 0 ? spot * (vixLevel / 100) / Math.sqrt(252) : spot * 0.01;
    const weeklyEM = vixLevel > 0 ? spot * (vixLevel / 100) * Math.sqrt(5) / Math.sqrt(252) : spot * 0.03;

    // Scale EM by timeframe using √time rule for the projection horizon
    const emScaleMap: Record<string, number> = {
      '5m': Math.sqrt(1 / 78),    // ~0.11×
      '15m': Math.sqrt(3 / 78),   // ~0.20×
      '1h': Math.sqrt(1 / 6.5),   // ~0.39×
      '4h': Math.sqrt(4 / 6.5),   // ~0.78×
      '1d': 1,
      '1w': Math.sqrt(5),          // ~2.24×
    };
    const tfScale = emScaleMap[timeframe || '1d'] || 1;
    const tfEM = dailyEM * tfScale;
    const tfLabel: Record<string, string> = {
      '5m': '5min', '15m': '15min', '1h': 'hourly', '4h': '4hr', '1d': 'daily', '1w': 'weekly',
    };

    const vixRegime: 'EXTREME_FEAR' | 'FEAR' | 'ELEVATED' | 'NORMAL' | 'COMPLACENT' =
      vixLevel >= 35 ? 'EXTREME_FEAR' :
      vixLevel >= 25 ? 'FEAR' :
      vixLevel >= 18 ? 'ELEVATED' :
      vixLevel >= 13 ? 'NORMAL' : 'COMPLACENT';

    const expectedMoveData = vixLevel > 0 ? {
      daily: Math.round(dailyEM * 100) / 100,
      weekly: Math.round(weeklyEM * 100) / 100,
      timeframeEM: Math.round(tfEM * 100) / 100,
      timeframeLabel: tfLabel[timeframe || '1d'] || 'daily',
      vixLevel,
      vixChange,
      vixRegime,
      impliedDailyRange: { low: Math.round((spot - dailyEM) * 100) / 100, high: Math.round((spot + dailyEM) * 100) / 100 },
      impliedWeeklyRange: { low: Math.round((spot - weeklyEM) * 100) / 100, high: Math.round((spot + weeklyEM) * 100) / 100 },
      impliedTfRange: { low: Math.round((spot - tfEM) * 100) / 100, high: Math.round((spot + tfEM) * 100) / 100 },
    } : null;

    // ── 2. Build Psych Levels from all sources ──
    const psychLevels = buildPsychLevels(symbol, spot, gexVexResult, intelData);

    // Sort by distance from spot
    psychLevels.sort((a, b) => Math.abs(a.price - spot) - Math.abs(b.price - spot));

    // Find T1 Support & T1 Resistance (closest strong levels)
    const t1Resist = psychLevels
      .filter(l => l.type === 'RESISTANCE' && l.price > spot && l.strength >= 40)
      .sort((a, b) => a.price - b.price)[0] || null;
    const t1Support = psychLevels
      .filter(l => l.type === 'SUPPORT' && l.price < spot && l.strength >= 40)
      .sort((a, b) => b.price - a.price)[0] || null;

    // ── 3. Correlate all signals ──
    const signals = correlateSignals(symbol, spot, gexVexResult, geoMatrix, intelData);

    // Calculate signal alignment (-100 to +100)
    let bullishWeight = 0;
    let bearishWeight = 0;
    let totalWeight = 0;
    for (const sig of signals) {
      totalWeight += sig.weight;
      if (sig.direction === 'BULLISH') bullishWeight += sig.weight;
      else if (sig.direction === 'BEARISH') bearishWeight += sig.weight;
    }
    const signalAlignment = totalWeight > 0
      ? Math.round(((bullishWeight - bearishWeight) / totalWeight) * 100)
      : 0;

    // ── 4. Determine direction ──
    const direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
      signalAlignment > 20 ? 'BULLISH' :
      signalAlignment < -20 ? 'BEARISH' :
      'NEUTRAL';

    // ── 5. Confidence (how aligned are signals) ──
    const alignmentStrength = Math.abs(signalAlignment);
    const signalCount = signals.filter(s => s.direction !== 'NEUTRAL').length;
    const agreementRatio = signals.length > 0
      ? signals.filter(s => s.direction === direction).length / signals.length
      : 0;
    let confidence = Math.round(
      alignmentStrength * 0.5 +
      agreementRatio * 40 +
      Math.min(signalCount * 5, 20)
    );
    confidence = Math.max(15, Math.min(90, confidence));

    // ── 6. Build trade setups ──
    const setups = buildTradeSetups(spot, direction, t1Support, t1Resist, gexVexResult, confidence, dailyEM);

    // ── 7. Active geopolitical scenarios ──
    const activeScenarios = getActiveScenarios(symbol, geoMatrix);

    // ── 8. Build narrative ──
    const narrative = buildCorrelationNarrative(symbol, spot, direction, confidence, signals, t1Support, t1Resist, gexVexResult, activeScenarios);

    // ── 9. Prediction text (the headline) ──
    const predictionText = buildPredictionText(symbol, spot, direction, t1Support, t1Resist, gexVexResult, expectedMoveData);

    const gexSource = gexVexResult ? (gexVexResult.narrative?.includes('Yahoo') ? 'YAHOO' : 'TRADIER') : 'NONE';
    const result: UnifiedPrediction = {
      symbol,
      spotPrice: spot,
      timestamp: new Date().toISOString(),
      dataFreshness: {
        priceSource,
        priceAge,
        gexSource: gexSource as any,
        vixLive: vixLevel > 0,
        lastUpdate: new Date().toISOString(),
        nextUpdate: '~2 min (auto)',
      },
      direction,
      confidence,
      predictionText,
      psychLevels: psychLevels.slice(0, 12), // Top 12 levels
      t1Resist,
      t1Support,
      signals,
      signalAlignment,
      setups,
      gexVex: gexVexResult ? {
        regime: gexVexResult.regime.type,
        gexAnchor: gexVexResult.levels.gexAnchor,
        gexFlip: gexVexResult.levels.gexFlip,
        vexAnchor: gexVexResult.levels.vexAnchor,
        vexFlip: gexVexResult.levels.vexFlip,
        callWalls: gexVexResult.levels.callWalls,
        putWalls: gexVexResult.levels.putWalls,
        gammaConcentration: gexVexResult.levels.gammaConcentration || [],
        // Upside/downside targets: pick the REAL level traders watch
        // Priority: call wall > round psych level > T1 resist > projection bound
        upsideTarget: (() => {
          const minDist = spot * 0.005; // at least 0.5% from spot to be a real target
          const maxDist = tfEM * 2.5;   // within 2.5× EM to be reachable
          const roundStep = spot > 200 ? 5 : spot > 50 ? 2.5 : 1;
          const walls = gexVexResult.levels.callWalls.filter((w: number) => w > spot + minDist && w <= spot + maxDist);
          // Next major round number above spot (e.g. $680 when at $675)
          const nextRound = Math.ceil((spot + minDist) / roundStep) * roundStep;
          // If a call wall is within $2 of the round number → snap to round (confluence)
          const hasNearbyWall = walls.some((w: number) => Math.abs(w - nextRound) <= 2);
          if (nextRound <= spot + maxDist) {
            if (hasNearbyWall) return nextRound;  // Round + wall confluence = best target
            if (walls.length === 0 || nextRound < walls[0]) return nextRound;
          }
          if (walls.length > 0) return walls[0];
          if (t1Resist && t1Resist.price > spot + minDist && t1Resist.price <= spot + maxDist) return t1Resist.price;
          if (gexVexResult.projectionRange?.upperBound > spot + minDist) {
            return Math.round(gexVexResult.projectionRange.upperBound * 100) / 100;
          }
          return gexVexResult.targets.primaryUpside?.price || null;
        })(),
        downsideTarget: (() => {
          const minDist = spot * 0.005;
          const maxDist = tfEM * 2.5;
          const roundStep = spot > 200 ? 5 : spot > 50 ? 2.5 : 1;
          const walls = gexVexResult.levels.putWalls.filter((w: number) => w < spot - minDist && w >= spot - maxDist);
          const prevRound = Math.floor((spot - minDist) / roundStep) * roundStep;
          const hasNearbyWall = walls.some((w: number) => Math.abs(w - prevRound) <= 2);
          if (prevRound >= spot - maxDist) {
            if (hasNearbyWall) return prevRound;
            if (walls.length === 0 || prevRound > walls[0]) return prevRound;
          }
          if (walls.length > 0) return walls[0];
          if (t1Support && t1Support.price < spot - minDist && t1Support.price >= spot - maxDist) return t1Support.price;
          if (gexVexResult.projectionRange?.lowerBound < spot - minDist) {
            return Math.round(gexVexResult.projectionRange.lowerBound * 100) / 100;
          }
          return gexVexResult.targets.primaryDownside?.price || null;
        })(),
        projectionRange: gexVexResult.projectionRange || null,
        regimeStrength: gexVexResult.regime.strength || 0,
      } : null,
      activeScenarios,
      expectedMove: expectedMoveData,
      narrative,
      horizonOutlook: computeHorizonOutlook(spot, dailyEM, vixLevel, vixRegime, gexVexResult, geoMatrix, signals, symbol),
      flowData: gexVexResult?.flowData ? {
        putCallRatio: gexVexResult.flowData.putCallRatio,
        volumePCR: gexVexResult.flowData.volumePCR,
        flowBias: gexVexResult.flowData.flowBias,
        totalCallOI: gexVexResult.flowData.totalCallOI,
        totalPutOI: gexVexResult.flowData.totalPutOI,
      } : undefined,
    };

    const ho = result.horizonOutlook;
    logger.info(`[UNIFIED] ${symbol}: ${direction} (${confidence}% conf, alignment ${signalAlignment}, VIX ${vixLevel}, EM ±$${dailyEM.toFixed(1)}/day) UP=$${result.gexVex?.upsideTarget} DN=$${result.gexVex?.downsideTarget} price=${priceSource}`);
    if (ho) {
      logger.info(`[UNIFIED] ${symbol} horizons: TODAY=${ho.today.direction}(${ho.today.confidence}%) WEEK=${ho.thisWeek.direction}(${ho.thisWeek.confidence}%) MONTH=${ho.thisMonth.direction}(${ho.thisMonth.confidence}%)`);
    }

    // Record projection for accuracy tracking
    if (gexVexResult) {
      try { recordProjection(symbol, gexVexResult, spot, vixLevel); } catch {};
    }

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : '';
    logger.error(`[UNIFIED] Prediction error for ${symbol}: ${msg}`, { stack });
    return null;
  }
}

// ─── Psych Level Builder ─────────────────────────────────────

function buildPsychLevels(
  symbol: string,
  spot: number,
  gexVex: ProjectorResult | null,
  intel: any,
): PsychLevel[] {
  const levels: PsychLevel[] = [];

  // Round numbers (psych levels every $5 within 3% of spot)
  const range = spot * 0.03;
  const roundStep = spot > 200 ? 5 : spot > 50 ? 2.5 : 1;
  const low = Math.floor((spot - range) / roundStep) * roundStep;
  const high = Math.ceil((spot + range) / roundStep) * roundStep;
  for (let p = low; p <= high; p += roundStep) {
    if (Math.abs(p - spot) < roundStep * 0.1) continue; // Skip if too close to spot
    levels.push({
      price: p,
      type: p > spot ? 'RESISTANCE' : 'SUPPORT',
      source: 'ROUND_NUMBER',
      strength: p % (roundStep * 2) === 0 ? 50 : 30, // Bigger rounds are stronger
      label: `$${p} psych level`,
    });
  }

  // GEX walls → strongest support/resistance
  if (gexVex) {
    for (const wall of gexVex.levels.callWalls) {
      levels.push({
        price: wall,
        type: 'RESISTANCE',
        source: 'GEX_WALL',
        strength: 80,
        label: `$${wall} call wall (gamma resistance)`,
      });
    }
    for (const wall of gexVex.levels.putWalls) {
      levels.push({
        price: wall,
        type: 'SUPPORT',
        source: 'GEX_WALL',
        strength: 80,
        label: `$${wall} put wall (gamma support)`,
      });
    }

    // GEX flip → pivot zone
    if (gexVex.levels.gexFlip) {
      levels.push({
        price: gexVex.levels.gexFlip,
        type: 'PIVOT',
        source: 'FLIP_ZONE',
        strength: 90,
        label: `$${gexVex.levels.gexFlip} gamma flip — regime change`,
      });
    }

    // VEX magnets
    for (const mag of gexVex.levels.vannaAttractors) {
      levels.push({
        price: mag,
        type: mag > spot ? 'RESISTANCE' : 'SUPPORT',
        source: 'VEX_MAGNET',
        strength: 65,
        label: `$${mag} vanna magnet (IV compression pull)`,
      });
    }

    // VEX flip
    if (gexVex.levels.vexFlip) {
      levels.push({
        price: gexVex.levels.vexFlip,
        type: 'PIVOT',
        source: 'FLIP_ZONE',
        strength: 75,
        label: `$${gexVex.levels.vexFlip} vanna flip — IV sensitivity shift`,
      });
    }
  }

  // Expected move bounds → natural support/resistance
  if (intel?.expectedMove) {
    const em = intel.expectedMove;
    if (em.upperBound) {
      levels.push({
        price: em.upperBound,
        type: 'RESISTANCE',
        source: 'EXPECTED_MOVE',
        strength: 70,
        label: `$${em.upperBound.toFixed(0)} expected move upper bound`,
      });
    }
    if (em.lowerBound) {
      levels.push({
        price: em.lowerBound,
        type: 'SUPPORT',
        source: 'EXPECTED_MOVE',
        strength: 70,
        label: `$${em.lowerBound.toFixed(0)} expected move lower bound`,
      });
    }
  }

  // Deduplicate: merge levels within 0.3% of each other
  return deduplicateLevels(levels, spot);
}

function deduplicateLevels(levels: PsychLevel[], spot: number): PsychLevel[] {
  const threshold = spot * 0.003; // 0.3%
  const merged: PsychLevel[] = [];

  const sorted = [...levels].sort((a, b) => a.price - b.price);
  for (const lvl of sorted) {
    const existing = merged.find(m => Math.abs(m.price - lvl.price) < threshold);
    if (existing) {
      // Keep the stronger one, boost strength
      if (lvl.strength > existing.strength) {
        existing.price = lvl.price;
        existing.label = lvl.label;
        existing.source = lvl.source;
      }
      existing.strength = Math.min(100, existing.strength + 15); // Confluence bonus
    } else {
      merged.push({ ...lvl });
    }
  }

  return merged;
}

// ─── Signal Correlator ───────────────────────────────────────

function correlateSignals(
  symbol: string,
  spot: number,
  gexVex: ProjectorResult | null,
  geoMatrix: ScenarioMatrix | null,
  intel: any,
): SignalCorrelation[] {
  const signals: SignalCorrelation[] = [];

  // 1. GEX Regime
  if (gexVex) {
    const regime = gexVex.regime.type;
    const gexDir = regime === 'POSITIVE' ? 'BULLISH' : regime === 'NEGATIVE' ? 'BEARISH' : 'NEUTRAL';
    signals.push({
      signal: 'GEX Regime',
      direction: gexDir,
      weight: SIGNAL_WEIGHTS.gexRegime,
      detail: regime === 'POSITIVE'
        ? `Positive gamma — dealers dampen moves, mean-revert to $${gexVex.levels.gexAnchor || '?'}`
        : regime === 'NEGATIVE'
        ? `Negative gamma — dealers amplify moves, momentum environment`
        : 'Neutral gamma — no clear dealer bias',
    });
  }

  // 2. VEX Bias
  if (gexVex?.levels.vexAnchor) {
    const vexDir = gexVex.levels.vexAnchor > spot ? 'BULLISH' : 'BEARISH';
    signals.push({
      signal: 'Vanna Exposure',
      direction: vexDir,
      weight: SIGNAL_WEIGHTS.vexBias,
      detail: `VEX magnet at $${gexVex.levels.vexAnchor} — if IV compresses, price pulls toward this level`,
    });
  }

  // 3. Momentum (RSI + EMA from intel)
  if (intel?.momentum) {
    const m = intel.momentum;
    const momDir = m.regime === 'bullish' || m.emaAlignment === 'bullish'
      ? 'BULLISH'
      : m.regime === 'bearish' || m.emaAlignment === 'bearish'
      ? 'BEARISH'
      : 'NEUTRAL';
    signals.push({
      signal: 'Momentum',
      direction: momDir,
      weight: SIGNAL_WEIGHTS.momentum,
      detail: `RSI ${m.rsi?.toFixed(0) || '?'} | EMA ${m.emaAlignment || '?'} | ${m.tradingAdvice || m.regime}`,
    });
  }

  // 4. VIX Regime
  if (intel?.vixRegime) {
    const v = intel.vixRegime;
    const vixDir = v.regime?.regime === 'complacency' ? 'BULLISH'
      : v.regime?.regime === 'fear' || v.regime?.regime === 'panic' ? 'BEARISH'
      : 'NEUTRAL';
    signals.push({
      signal: 'VIX Regime',
      direction: vixDir,
      weight: SIGNAL_WEIGHTS.vixRegime,
      detail: `VIX ${v.vix?.toFixed(1)} (${v.regime?.regime || 'unknown'}) | ${v.termStructure || ''}`,
    });
  }

  // 5. Unified Score (if available)
  if (intel?.unifiedScore) {
    const u = intel.unifiedScore;
    const scoreDir = u.direction?.toUpperCase() === 'BULLISH' ? 'BULLISH'
      : u.direction?.toUpperCase() === 'BEARISH' ? 'BEARISH'
      : 'NEUTRAL';
    signals.push({
      signal: 'Intelligence Score',
      direction: scoreDir,
      weight: SIGNAL_WEIGHTS.flowBias,
      detail: `Score ${u.score}/100 — ${u.thesis || ''}`,
    });
  }

  // 6. PCR
  if (intel?.pcr) {
    const pcr = intel.pcr;
    const pcrDir = pcr.volumeRatio < 0.8 ? 'BULLISH'
      : pcr.volumeRatio > 1.2 ? 'BEARISH'
      : 'NEUTRAL';
    signals.push({
      signal: 'Put/Call Ratio',
      direction: pcrDir,
      weight: 5,
      detail: `PCR ${pcr.volumeRatio?.toFixed(2)} — ${pcr.interpretation || ''}`,
    });
  }

  // 7. Geopolitical overlay
  if (geoMatrix?.currentConditions) {
    const active = geoMatrix.currentConditions.activeScenarios;
    const risk = geoMatrix.currentConditions.geopoliticalRisk;
    if (active.length > 0) {
      const activeScenarios = geoMatrix.scenarios.filter(s => active.includes(s.id));
      // Check net impact on this symbol's asset class
      let netGeoImpact = 0;
      for (const scenario of activeScenarios) {
        const assetReaction = scenario.reactions.find(r => r.asset === symbol);
        if (assetReaction) {
          netGeoImpact += assetReaction.move24h;
        }
      }
      const geoDir = netGeoImpact > 0.3 ? 'BULLISH' : netGeoImpact < -0.3 ? 'BEARISH' : 'NEUTRAL';
      signals.push({
        signal: 'Geopolitical',
        direction: geoDir,
        weight: SIGNAL_WEIGHTS.geopolitical,
        detail: `${active.length} active scenario(s), risk: ${risk}. Net ${symbol} impact: ${netGeoImpact > 0 ? '+' : ''}${netGeoImpact.toFixed(1)}%`,
      });
    }
  }

  return signals;
}

// ─── Trade Setup Builder ─────────────────────────────────────

function buildTradeSetups(
  spot: number,
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL',
  support: PsychLevel | null,
  resist: PsychLevel | null,
  gexVex: ProjectorResult | null,
  confidence: number,
  dailyEM: number = spot * 0.01,
): TradeSetup[] {
  const setups: TradeSetup[] = [];

  // Grade based on confidence + signal alignment
  function gradeFromConf(c: number): TradeSetup['grade'] {
    if (c >= 80) return 'A+';
    if (c >= 65) return 'A';
    if (c >= 50) return 'B+';
    if (c >= 35) return 'B';
    if (c >= 20) return 'C';
    return 'D';
  }

  // Minimum thresholds to avoid noise setups
  const minTargetDist = dailyEM * 0.4;    // Target must be at least 0.4× daily EM from entry
  const MIN_RR = 1.5;                      // Don't show any setup worse than 1.5:1 R:R

  // Day trade setup — skip if T1 is too close to spot (noise)
  if (direction === 'BULLISH' && resist) {
    // If T1 resist is too close to spot, extend target to next meaningful level
    let target = resist.price;
    if (Math.abs(target - spot) < minTargetDist) {
      // Use spot + 0.5× daily EM as minimum meaningful target
      target = spot + dailyEM * 0.5;
    }
    const stop = support ? support.price : spot - dailyEM * 0.5;
    const reward = target - spot;
    const risk = spot - stop;
    const rrNum = risk > 0 ? reward / risk : 0;
    if (rrNum >= MIN_RR) {
      setups.push({
        direction: 'LONG',
        timeframe: 'DAY',
        entry: spot,
        target: Math.round(target * 100) / 100,
        stop: Math.round(stop * 100) / 100,
        riskReward: `${rrNum.toFixed(1)}:1`,
        grade: gradeFromConf(confidence),
        rules: [
          `Entry near $${spot.toFixed(0)}, target $${target.toFixed(0)}`,
          `Stop below $${stop.toFixed(0)} | R:R ${rrNum.toFixed(1)}:1`,
          `Target +${((target - spot) / spot * 100).toFixed(1)}%, Stop -${(risk / spot * 100).toFixed(1)}%`,
          'EOD exit if no momentum toward target',
        ],
      });
    }
  } else if (direction === 'BEARISH' && support) {
    let target = support.price;
    if (Math.abs(spot - target) < minTargetDist) {
      target = spot - dailyEM * 0.5;
    }
    const stop = resist ? resist.price : spot + dailyEM * 0.5;
    const reward = spot - target;
    const risk = stop - spot;
    const rrNum = risk > 0 ? reward / risk : 0;
    if (rrNum >= MIN_RR) {
      setups.push({
        direction: 'SHORT',
        timeframe: 'DAY',
        entry: spot,
        target: Math.round(target * 100) / 100,
        stop: Math.round(stop * 100) / 100,
        riskReward: `${rrNum.toFixed(1)}:1`,
        grade: gradeFromConf(confidence),
        rules: [
          `Entry near $${spot.toFixed(0)}, target $${target.toFixed(0)}`,
          `Stop above $${stop.toFixed(0)} | R:R ${rrNum.toFixed(1)}:1`,
          `Target +${((spot - target) / spot * 100).toFixed(1)}%, Stop -${(risk / spot * 100).toFixed(1)}%`,
          'EOD exit if no momentum toward target',
        ],
      });
    }
  }

  // Swing setup using GEX+VEX targets, scaled by expected move
  // If GEX target is within 0.3% of spot (noise), extend to at least 1× daily EM
  if (gexVex) {
    const upTarget = gexVex.targets.primaryUpside;
    const downTarget = gexVex.targets.primaryDownside;
    const minMoveUp = spot + dailyEM * 0.75;   // At least 0.75× daily EM for a meaningful target
    const minMoveDn = spot - dailyEM * 0.75;

    if (direction !== 'BEARISH' && upTarget) {
      // If GEX target is too close, use expected-move-scaled target
      const rawTarget = upTarget.price;
      const target = Math.abs(rawTarget - spot) < minTargetDist ? Math.max(minMoveUp, spot + dailyEM) : rawTarget;
      // Stop: tighten to 0.4× EM below entry for better R:R (vs old 0.5×)
      const swingStop = support ? Math.max(support.price, spot - dailyEM * 0.4) : spot - dailyEM * 0.4;
      const reward = target - spot;
      const risk = spot - swingStop;
      const rrNum = risk > 0 ? reward / risk : 0;
      if (rrNum >= MIN_RR) {
        setups.push({
          direction: 'LONG',
          timeframe: 'SWING',
          entry: spot,
          target: Math.round(target * 100) / 100,
          stop: Math.round(swingStop * 100) / 100,
          riskReward: `${rrNum.toFixed(1)}:1`,
          grade: gradeFromConf(Math.min(confidence, upTarget.strength)),
          rules: [
            `GEX+VEX target $${target.toFixed(0)} (${((target - spot) / spot * 100).toFixed(1)}% upside)`,
            `Gamma: ${gexVex.regime.type} — ${gexVex.regime.tradingBias}`,
            `EM ±$${dailyEM.toFixed(0)}/day | Stop $${swingStop.toFixed(0)}`,
          ],
        });
      }
    }

    if (direction !== 'BULLISH' && downTarget) {
      const rawTarget = downTarget.price;
      const target = Math.abs(rawTarget - spot) < minTargetDist ? Math.min(minMoveDn, spot - dailyEM) : rawTarget;
      const swingStop = resist ? Math.min(resist.price, spot + dailyEM * 0.4) : spot + dailyEM * 0.4;
      const reward = spot - target;
      const risk = swingStop - spot;
      const rrNum = risk > 0 ? reward / risk : 0;
      if (rrNum >= MIN_RR) {
        setups.push({
          direction: 'SHORT',
          timeframe: 'SWING',
          entry: spot,
          target: Math.round(target * 100) / 100,
          stop: Math.round(swingStop * 100) / 100,
          riskReward: `${rrNum.toFixed(1)}:1`,
          grade: gradeFromConf(Math.min(confidence, downTarget.strength)),
          rules: [
            `GEX+VEX target $${target.toFixed(0)} (${((spot - target) / spot * 100).toFixed(1)}% downside)`,
            `Gamma: ${gexVex.regime.type} — ${gexVex.regime.tradingBias}`,
            `EM ±$${dailyEM.toFixed(0)}/day | Stop $${swingStop.toFixed(0)}`,
          ],
        });
      }
    }
  }

  return setups;
}

// ─── Geopolitical Active Scenarios ───────────────────────────

function getActiveScenarios(
  symbol: string,
  geoMatrix: ScenarioMatrix | null,
): UnifiedPrediction['activeScenarios'] {
  if (!geoMatrix) return [];

  const activeIds = geoMatrix.currentConditions?.activeScenarios || [];
  return geoMatrix.scenarios
    .filter(s => activeIds.includes(s.id))
    .map(s => {
      const reaction = s.reactions.find(r => r.asset === symbol);
      const move = reaction ? reaction.move24h : 0;
      return {
        id: s.id,
        name: s.name,
        icon: s.icon,
        likelihood: s.likelihood,
        impact: reaction
          ? `${symbol} ${move > 0 ? '+' : ''}${move.toFixed(1)}% if triggered`
          : 'No direct impact modeled',
      };
    });
}

// ─── Narrative Builder ───────────────────────────────────────

function buildCorrelationNarrative(
  symbol: string,
  spot: number,
  direction: string,
  confidence: number,
  signals: SignalCorrelation[],
  support: PsychLevel | null,
  resist: PsychLevel | null,
  gexVex: ProjectorResult | null,
  activeScenarios: UnifiedPrediction['activeScenarios'],
): string {
  const parts: string[] = [];

  // Lead with direction
  const dirWord = direction === 'BULLISH' ? 'bullish' : direction === 'BEARISH' ? 'bearish' : 'neutral';
  const bullCount = signals.filter(s => s.direction === 'BULLISH').length;
  const bearCount = signals.filter(s => s.direction === 'BEARISH').length;
  parts.push(
    `${symbol} at $${spot.toFixed(2)} shows a ${dirWord} bias with ${confidence}% confidence. ` +
    `${bullCount} signal${bullCount !== 1 ? 's' : ''} bullish, ${bearCount} bearish out of ${signals.length} total.`
  );

  // Key levels
  if (resist && support) {
    parts.push(
      `Key range: $${support.price.toFixed(0)} support (${support.source}) to $${resist.price.toFixed(0)} resistance (${resist.source}).`
    );
  }

  // GEX context
  if (gexVex) {
    const regime = gexVex.regime;
    if (regime.type === 'POSITIVE') {
      parts.push(`Positive gamma environment — moves should be contained. Fade breakouts, buy dips near $${gexVex.levels.gexAnchor || '?'}.`);
    } else if (regime.type === 'NEGATIVE') {
      parts.push(`Negative gamma — momentum amplified. Trend-follow, don't fade. Watch flip at $${gexVex.levels.gexFlip || '?'}.`);
    }
  }

  // Geopolitical
  if (activeScenarios.length > 0) {
    parts.push(
      `Active geopolitical risks: ${activeScenarios.map(s => `${s.icon} ${s.name} (${s.impact})`).join(', ')}.`
    );
  }

  // Signal conflicts
  const conflicting = signals.filter(s => s.direction !== direction && s.direction !== 'NEUTRAL');
  if (conflicting.length > 0) {
    parts.push(
      `Conflicting signals: ${conflicting.map(s => `${s.signal} (${s.direction.toLowerCase()})`).join(', ')}. Reduce size or wait for resolution.`
    );
  }

  return parts.join(' ');
}

// ─── Prediction Text ─────────────────────────────────────────

function buildPredictionText(
  symbol: string,
  spot: number,
  direction: string,
  support: PsychLevel | null,
  resist: PsychLevel | null,
  gexVex: ProjectorResult | null,
  expectedMove?: { daily: number; timeframeEM?: number; timeframeLabel?: string; vixLevel: number; vixRegime: string } | null,
): string {
  const em = expectedMove?.timeframeEM || expectedMove?.daily || spot * 0.015;
  const tfLabel = expectedMove?.timeframeLabel || 'daily';
  const vixTag = expectedMove ? ` VIX ${expectedMove.vixLevel.toFixed(1)} → ±$${em.toFixed(1)}/${tfLabel}.` : '';
  const regime = gexVex?.regime.type;
  const proj = gexVex?.projectionRange;

  // Use projection range + psych levels for targets
  // Psych levels (round numbers, prior S/R) override pure EM bounds when they're within range
  if (direction === 'BULLISH') {
    // Upside target: prefer T1 resistance if within 2× EM, else use projection upper bound
    const projUp = proj ? proj.upperBound : spot + em;
    const resistTarget = resist && resist.price > spot && resist.price <= spot + em * 2 ? resist.price : null;
    const target = resistTarget || Math.min(projUp, spot + em * 2);
    // Pullback: T1 support or projection lower bound
    const pullback = support?.price || (proj ? proj.lowerBound : spot - em * 0.5);
    return `${symbol} bullish toward $${target.toFixed(0)}, buy dips near $${pullback.toFixed(0)}.` + vixTag +
      (regime === 'POSITIVE' ? ' Positive gamma dampens — fade failed breakouts.' : '');
  }
  if (direction === 'BEARISH') {
    // Downside target: prefer T1 support if within 2× EM, else use projection lower bound
    const projDn = proj ? proj.lowerBound : spot - em;
    const supportTarget = support && support.price < spot && support.price >= spot - em * 2 ? support.price : null;
    const target = supportTarget || Math.max(projDn, spot - em * 2);
    // Sell rips near: T1 resistance (where bulls try to push) or projection upper bound
    const bounce = resist?.price || (proj ? proj.upperBound : spot + em * 0.5);
    return `${symbol} bearish toward $${target.toFixed(0)}, sell rips near $${bounce.toFixed(0)}.` + vixTag +
      (regime === 'NEGATIVE' ? ' Negative gamma amplifies — momentum accelerates.' : '');
  }

  // NEUTRAL — use projection range to show the thesis
  if (proj) {
    const rangeStr = `$${proj.lowerBound.toFixed(0)}-$${proj.upperBound.toFixed(0)}`;
    if (regime === 'POSITIVE') {
      return `${symbol} pinned near $${proj.magnetPrice.toFixed(0)}, range ${rangeStr}.` + vixTag +
        ` Dealers dampen moves — fade extremes, mean-revert to anchor.`;
    }
    if (regime === 'NEGATIVE') {
      return `${symbol} momentum range ${rangeStr}, magnet $${proj.magnetPrice.toFixed(0)}.` + vixTag +
        ` Negative gamma — dealers amplify the trend.`;
    }
    return `${symbol} range-bound ${rangeStr}.` + vixTag + ` No strong directional bias — fade extremes or wait for breakout.`;
  }

  const lo = support?.price || spot - em;
  const hi = resist?.price || spot + em;
  return `${symbol} in a range between $${lo.toFixed(0)} and $${hi.toFixed(0)}.` + vixTag;
}

// ─── Multi-Horizon Outlook Engine ────────────────────────────
// Each horizon (today/week/month) weighs signals differently:
//   TODAY:  GEX regime (60%) + VIX (20%) + flow (15%) + geo (5%)
//   WEEK:   GEX regime (30%) + flow/PCR (25%) + VIX term (25%) + geo (20%)
//   MONTH:  Flow/PCR (30%) + geo (30%) + VIX macro (25%) + GEX (15%)

function computeHorizonOutlook(
  spot: number,
  dailyEM: number,
  vixLevel: number,
  vixRegime: string,
  gexVexResult: any,
  geoMatrix: any,
  signals: SignalCorrelation[],
  symbol: string,
): HorizonOutlook {
  // Extract signal directions by name for horizon-specific weighting
  const gexSignal = signals.find(s => s.signal === 'GEX Regime');
  const vexSignal = signals.find(s => s.signal === 'Vanna Exposure');
  const momSignal = signals.find(s => s.signal === 'Momentum');
  const vixSignal = signals.find(s => s.signal === 'VIX Regime');
  const flowSignal = signals.find(s => s.signal === 'Put/Call Ratio') || signals.find(s => s.signal === 'Intelligence Score');
  const geoSignal = signals.find(s => s.signal === 'Geopolitical');

  // Flow data from projector
  const flowData = gexVexResult?.flowData;
  const pcr = flowData?.putCallRatio || 1;
  const flowBias = flowData?.flowBias || 'BALANCED';

  // Helper: score a signal direction as -1/0/+1
  function dirScore(dir?: string): number {
    if (dir === 'BULLISH') return 1;
    if (dir === 'BEARISH') return -1;
    return 0;
  }

  // ── TODAY: Gamma regime is king ──
  const todayScore = (
    dirScore(gexSignal?.direction) * 60 +
    dirScore(vixSignal?.direction) * 20 +
    (flowBias === 'CALL_HEAVY' ? 15 : flowBias === 'PUT_HEAVY' ? -15 : 0) +
    dirScore(geoSignal?.direction) * 5
  );
  const todayDir: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
    todayScore > 15 ? 'BULLISH' : todayScore < -15 ? 'BEARISH' : 'NEUTRAL';
  const todayConf = Math.min(90, Math.max(20, Math.abs(todayScore)));
  const todayEM = dailyEM;
  const todayTarget = todayDir === 'BULLISH' ? spot + todayEM * 0.8 :
                      todayDir === 'BEARISH' ? spot - todayEM * 0.8 : spot;

  const todayDrivers: string[] = [];
  if (gexSignal) todayDrivers.push(`${gexVexResult?.regime?.type || 'Unknown'} gamma`);
  if (vixLevel > 0) todayDrivers.push(`VIX ${vixLevel.toFixed(0)} (${vixRegime.toLowerCase()})`);
  if (flowBias !== 'BALANCED') todayDrivers.push(`${flowBias === 'CALL_HEAVY' ? 'Call' : 'Put'}-heavy flow (PCR ${pcr.toFixed(2)})`);

  // ── THIS WEEK: Flow + GEX + VIX term structure ──
  const weeklyEM = dailyEM * Math.sqrt(5);
  // PCR bias: <0.7 = bullish, >1.3 = bearish, with gradient
  const pcrWeekScore = pcr < 0.7 ? 25 : pcr > 1.3 ? -25 : pcr < 0.9 ? 10 : pcr > 1.1 ? -10 : 0;
  const weekScore = (
    dirScore(gexSignal?.direction) * 30 +
    pcrWeekScore +
    dirScore(vixSignal?.direction) * 25 +
    dirScore(geoSignal?.direction) * 20
  );
  const weekDir: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
    weekScore > 15 ? 'BULLISH' : weekScore < -15 ? 'BEARISH' : 'NEUTRAL';
  const weekConf = Math.min(85, Math.max(15, Math.abs(weekScore)));
  const weekTarget = weekDir === 'BULLISH' ? spot + weeklyEM * 0.6 :
                     weekDir === 'BEARISH' ? spot - weeklyEM * 0.6 : spot;

  const weekDrivers: string[] = [];
  if (flowBias !== 'BALANCED') weekDrivers.push(`PCR ${pcr.toFixed(2)} (${flowBias === 'PUT_HEAVY' ? 'bearish' : 'bullish'} positioning)`);
  else weekDrivers.push(`PCR ${pcr.toFixed(2)} (balanced)`);
  if (gexSignal) weekDrivers.push(`${gexVexResult?.regime?.type} gamma regime`);
  if (geoSignal && geoSignal.direction !== 'NEUTRAL') weekDrivers.push(`Geo risk: ${geoSignal.direction.toLowerCase()}`);
  weekDrivers.push(`VIX ${vixLevel.toFixed(0)} → ±$${weeklyEM.toFixed(0)}/week`);

  // ── THIS MONTH: Macro dominates — geo + VIX + flow ──
  const monthlyEM = dailyEM * Math.sqrt(21);
  // For monthly, PCR matters more — institutional positioning
  const pcrMonthScore = pcr < 0.7 ? 30 : pcr > 1.3 ? -30 : pcr < 0.85 ? 15 : pcr > 1.15 ? -15 : 0;
  const monthScore = (
    pcrMonthScore +
    dirScore(geoSignal?.direction) * 30 +
    dirScore(vixSignal?.direction) * 25 +
    dirScore(gexSignal?.direction) * 15
  );
  const monthDir: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
    monthScore > 12 ? 'BULLISH' : monthScore < -12 ? 'BEARISH' : 'NEUTRAL';
  const monthConf = Math.min(75, Math.max(10, Math.abs(monthScore)));
  const monthTarget = monthDir === 'BULLISH' ? spot + monthlyEM * 0.5 :
                      monthDir === 'BEARISH' ? spot - monthlyEM * 0.5 : spot;

  const monthDrivers: string[] = [];
  if (geoSignal && geoSignal.direction !== 'NEUTRAL') monthDrivers.push(`Geopolitical: ${geoSignal.detail?.split(',')[0] || geoSignal.direction}`);
  monthDrivers.push(`Options flow PCR ${pcr.toFixed(2)}`);
  monthDrivers.push(`VIX regime: ${vixRegime.toLowerCase()}`);
  if (momSignal) monthDrivers.push(`Momentum: ${momSignal.direction.toLowerCase()}`);

  return {
    today: {
      horizon: 'TODAY',
      label: 'Today',
      direction: todayDir,
      confidence: todayConf,
      target: Math.round(todayTarget * 100) / 100,
      emRange: { low: Math.round((spot - todayEM) * 100) / 100, high: Math.round((spot + todayEM) * 100) / 100 },
      keyDriver: todayDrivers[0] || 'No strong signal',
      signals: todayDrivers,
    },
    thisWeek: {
      horizon: 'THIS_WEEK',
      label: 'This Week',
      direction: weekDir,
      confidence: weekConf,
      target: Math.round(weekTarget * 100) / 100,
      emRange: { low: Math.round((spot - weeklyEM) * 100) / 100, high: Math.round((spot + weeklyEM) * 100) / 100 },
      keyDriver: weekDrivers[0] || 'No strong signal',
      signals: weekDrivers,
    },
    thisMonth: {
      horizon: 'THIS_MONTH',
      label: 'This Month',
      direction: monthDir,
      confidence: monthConf,
      target: Math.round(monthTarget * 100) / 100,
      emRange: { low: Math.round((spot - monthlyEM) * 100) / 100, high: Math.round((spot + monthlyEM) * 100) / 100 },
      keyDriver: monthDrivers[0] || 'No strong signal',
      signals: monthDrivers,
    },
  };
}

// ─── Cache ───────────────────────────────────────────────────

const predictionCache = new Map<string, { data: UnifiedPrediction; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 min — options chain data doesn't change that fast

export async function getCachedUnifiedPrediction(
  symbol: string,
  intelData?: any,
  projectorData?: any,
  timeframe?: string,
): Promise<UnifiedPrediction | null> {
  const key = `${symbol}:${timeframe || '1d'}`;
  const cached = predictionCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const result = await computeUnifiedPrediction(symbol, intelData, projectorData, timeframe);
  if (result) predictionCache.set(key, { data: result, ts: Date.now() });
  return result;
}

logger.info('[UNIFIED] Prediction Engine loaded');
