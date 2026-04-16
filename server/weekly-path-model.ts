/**
 * Weekly Path Projection Model
 * ============================
 * Computes a probability-weighted weekly price path from GEX/VEX data.
 * Inspired by Greek structure + dealer positioning models.
 *
 * Outputs:
 *   - Structural levels (pivots, walls, thresholds)
 *   - Projected path curve (20+ points, Mon→Fri)
 *   - Phase segments (flush/squeeze/drift)
 *   - Entry zones (long call / long put)
 */

import type { GEXSnapshot, WeeklyPathLevel, WeeklyPathPoint, WeeklyPhase, WeeklyEntryZone, WeeklyPathProjection } from '../shared/gex-types';

// ─── Model Logic ─────────────────────────────────────────────

/**
 * Build structural levels from GEX snapshot.
 * Maps dealer positioning levels to Skylit-style named pivots.
 */
function buildLevels(snap: GEXSnapshot): WeeklyPathLevel[] {
  const levels: WeeklyPathLevel[] = [];
  const spot = snap.spotPrice;

  // Call Wall → upside resistance ceiling
  if (snap.callWall && snap.callWall > spot) {
    levels.push({
      price: snap.callWall,
      label: 'CALL WALL',
      type: 'wall',
      side: 'bull',
    });

    // Vomma ceil — extrapolated 0.5% above call wall
    levels.push({
      price: snap.callWall * 1.005,
      label: 'VOMMA CEIL',
      type: 'threshold',
      side: 'bull',
    });
  }

  // Max gamma strike → strongest pin / magnet
  if (snap.maxGammaStrike && snap.maxGammaStrike !== snap.callWall && snap.maxGammaStrike !== snap.putWall) {
    levels.push({
      price: snap.maxGammaStrike,
      label: 'MAX GAMMA',
      type: 'target',
      side: 'neutral',
    });
  }

  // Gamma flip → main pivot
  if (snap.gammaFlipPrice) {
    levels.push({
      price: snap.gammaFlipPrice,
      label: 'MAIN PIVOT',
      type: 'pivot',
      side: 'neutral',
    });
  }

  // Zero gamma projection → magnet target
  if (snap.zeroGammaProjection && snap.zeroGammaProjection !== snap.gammaFlipPrice) {
    levels.push({
      price: snap.zeroGammaProjection,
      label: 'MAGNET TARGET',
      type: 'target',
      side: snap.zeroGammaProjection > spot ? 'bull' : 'bear',
    });
  }

  // Put Wall → downside support
  if (snap.putWall && snap.putWall < spot) {
    levels.push({
      price: snap.putWall,
      label: 'PUT WALL',
      type: 'wall',
      side: 'bear',
    });

    // Structural liquidity — midpoint between put wall and spot
    const structLiq = (snap.putWall + spot) / 2;
    levels.push({
      price: structLiq,
      label: 'STRUCT LIQ',
      type: 'threshold',
      side: 'bear',
    });

    // Vacuum trigger — 0.5% below put wall
    levels.push({
      price: snap.putWall * 0.995,
      label: 'VACUUM TRIGGER',
      type: 'trigger',
      side: 'bear',
    });
  }

  // Sort descending by price
  levels.sort((a, b) => b.price - a.price);
  return levels;
}

/**
 * Detect weekly phases based on regime + vanna.
 * Models how dealer positioning evolves through the week.
 */
function buildPhases(snap: GEXSnapshot): WeeklyPhase[] {
  const isNegGamma = snap.regime === 'negative_gamma';
  const isTransitioning = snap.regime === 'transitioning';
  const volHigh = snap.volatilityRegime === 'high' || snap.volatilityRegime === 'extreme';

  if (isNegGamma) {
    // Negative gamma: expect flush first, then squeeze recovery
    return [
      {
        label: 'PHASE 1 · FLUSH',
        description: 'NEG VANNA — VOL UP',
        startDay: 0,
        endDay: 2.5,
        type: 'flush',
        vannaRegime: 'negative',
        volBias: 'expanding',
      },
      {
        label: 'PHASE 2 · SQUEEZE',
        description: 'POS VANNA — VOL SELL',
        startDay: 2.5,
        endDay: 5,
        type: 'squeeze',
        vannaRegime: 'positive',
        volBias: 'compressing',
      },
    ];
  }

  if (isTransitioning || volHigh) {
    // Transitional: drift early, then breakout
    return [
      {
        label: 'PHASE 1 · DRIFT',
        description: 'MIXED SIGNALS — RANGE',
        startDay: 0,
        endDay: 2,
        type: 'drift',
        vannaRegime: 'neutral',
        volBias: 'stable',
      },
      {
        label: 'PHASE 2 · BREAKOUT',
        description: 'DEALER POSITIONING RESOLVES',
        startDay: 2,
        endDay: 5,
        type: 'breakout',
        vannaRegime: snap.totalVEX >= 0 ? 'positive' : 'negative',
        volBias: snap.totalVEX >= 0 ? 'compressing' : 'expanding',
      },
    ];
  }

  // Positive gamma: stable pin with drift toward magnet
  return [
    {
      label: 'PHASE 1 · PIN',
      description: 'POS GAMMA — MEAN REVERT',
      startDay: 0,
      endDay: 3,
      type: 'drift',
      vannaRegime: 'positive',
      volBias: 'compressing',
    },
    {
      label: 'PHASE 2 · DRIFT',
      description: 'GAMMA DECAY — MAGNET PULL',
      startDay: 3,
      endDay: 5,
      type: 'drift',
      vannaRegime: 'positive',
      volBias: 'stable',
    },
  ];
}

/**
 * Generate the projected price path.
 * Uses regime to determine shape:
 *   - Positive gamma → smooth convergence to magnet
 *   - Negative gamma → V-shape (flush then recovery)
 *   - Transitioning → range then breakout
 */
function buildPath(snap: GEXSnapshot, phases: WeeklyPhase[]): WeeklyPathPoint[] {
  const spot = snap.spotPrice;
  const magnet = snap.zeroGammaProjection || snap.maxGammaStrike;
  const callWall = snap.callWall || spot * 1.02;
  const putWall = snap.putWall || spot * 0.98;
  const flip = snap.gammaFlipPrice || spot;

  const isNegGamma = snap.regime === 'negative_gamma';
  const isTransitioning = snap.regime === 'transitioning';

  const points: WeeklyPathPoint[] = [];
  const numPoints = 25; // 5 days × 5 points per day

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints; // 0..1 through the week
    const dayOffset = t * 5;
    const intraday = (dayOffset % 1);

    let price: number;
    let confidence: number;

    if (isNegGamma) {
      // V-shape: flush to ~put wall midweek, then squeeze back above spot
      const flushDepth = (spot - putWall) * 0.7; // 70% of distance to put wall
      const recoveryTarget = magnet > spot ? magnet : spot * 1.005;

      if (t < 0.5) {
        // Phase 1: flush down with easeInOut
        const phaseT = t / 0.5;
        const ease = phaseT < 0.5
          ? 4 * phaseT * phaseT * phaseT
          : 1 - Math.pow(-2 * phaseT + 2, 3) / 2;
        price = spot - flushDepth * ease;
      } else {
        // Phase 2: squeeze back up
        const phaseT = (t - 0.5) / 0.5;
        const ease = phaseT < 0.5
          ? 4 * phaseT * phaseT * phaseT
          : 1 - Math.pow(-2 * phaseT + 2, 3) / 2;
        const bottom = spot - flushDepth;
        price = bottom + (recoveryTarget - bottom) * ease;
      }
      // Confidence decays faster in neg gamma (more uncertain)
      confidence = Math.max(0.2, 1 - t * 0.7);

    } else if (isTransitioning) {
      // Range early, then break toward magnet
      const rangeWidth = (callWall - putWall) * 0.15;
      if (t < 0.4) {
        // Drift phase — oscillate near spot
        const noise = Math.sin(t * Math.PI * 6) * rangeWidth * 0.5;
        price = spot + noise;
      } else {
        // Breakout toward magnet
        const phaseT = (t - 0.4) / 0.6;
        const ease = phaseT * phaseT;
        price = spot + (magnet - spot) * ease;
      }
      confidence = Math.max(0.15, 1 - t * 0.8);

    } else {
      // Positive gamma: smooth mean-reversion to magnet
      const ease = 1 - Math.pow(1 - t, 2); // easeOutQuad
      price = spot + (magnet - spot) * ease * 0.8; // 80% convergence by EOW
      // Higher confidence in positive gamma (more predictable)
      confidence = Math.max(0.3, 1 - t * 0.5);
    }

    // Add slight realistic noise (±0.1% of spot)
    const noise = Math.sin(i * 2.7 + i * i * 0.3) * spot * 0.001;
    price += noise;

    points.push({
      dayOffset,
      intraday,
      price: Math.round(price * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
    });
  }

  return points;
}

/**
 * Derive entry zones from structural levels and path.
 */
function buildEntryZones(
  snap: GEXSnapshot,
  path: WeeklyPathPoint[],
  phases: WeeklyPhase[],
): WeeklyEntryZone[] {
  const zones: WeeklyEntryZone[] = [];
  const spot = snap.spotPrice;
  const callWall = snap.callWall || spot * 1.02;
  const putWall = snap.putWall || spot * 0.98;
  const flip = snap.gammaFlipPrice || spot;

  // Find the lowest point in the path (for long call entry)
  const pathMin = path.reduce((min, p) => p.price < min.price ? p : min, path[0]);
  // Find the highest point (for long put entry)
  const pathMax = path.reduce((max, p) => p.price > max.price ? p : max, path[0]);

  // Long Call Entry: near the path bottom, between put wall and flip
  if (pathMin.price < spot * 0.995) {
    const entryLow = Math.max(putWall, pathMin.price * 0.998);
    const entryHigh = Math.min(flip, pathMin.price * 1.005);
    zones.push({
      label: 'LONG CALL ENTRY',
      type: 'long_call',
      priceMin: Math.round(entryLow * 100) / 100,
      priceMax: Math.round(entryHigh * 100) / 100,
      dayStart: Math.max(0, pathMin.dayOffset - 0.5),
      dayEnd: Math.min(5, pathMin.dayOffset + 0.5),
      reasoning: `Price approaches dealer support near $${Math.round(entryLow)}–$${Math.round(entryHigh)}. Positive gamma flip expected — mean reversion setup.`,
    });
  }

  // Long Put Entry: near the path top, between call wall and above
  if (pathMax.price > spot * 1.005) {
    const entryLow = Math.max(pathMax.price * 0.997, callWall * 0.995);
    const entryHigh = callWall * 1.005;
    zones.push({
      label: 'LONG PUT ENTRY',
      type: 'long_put',
      priceMin: Math.round(entryLow * 100) / 100,
      priceMax: Math.round(entryHigh * 100) / 100,
      dayStart: Math.max(0, pathMax.dayOffset - 0.5),
      dayEnd: Math.min(5, pathMax.dayOffset + 0.5),
      reasoning: `Price tests call wall resistance near $${Math.round(entryLow)}–$${Math.round(entryHigh)}. Dealer selling pressure expected — reversal setup.`,
    });
  }

  return zones;
}

/**
 * Get Monday and Friday ISO dates for the current/next trading week.
 */
function getWeekBounds(): { monday: string; friday: string } {
  const now = new Date();
  const day = now.getDay();
  // If it's Saturday or Sunday, use next week
  const daysToMonday = day === 0 ? 1 : day === 6 ? 2 : (day === 1 ? 0 : -(day - 1));
  const nextMonday = day <= 1 || day >= 6
    ? new Date(now.getTime() + (day === 0 ? 1 : day === 6 ? 2 : 0) * 86400000)
    : new Date(now.getTime() - (day - 1) * 86400000);

  // If we're past Wednesday, project for next week
  if (day > 3 && day < 6) {
    nextMonday.setDate(nextMonday.getDate() + 7);
  }

  const monday = nextMonday.toISOString().slice(0, 10);
  const fri = new Date(nextMonday.getTime() + 4 * 86400000);
  const friday = fri.toISOString().slice(0, 10);
  return { monday, friday };
}

// ─── Public API ──────────────────────────────────────────────

export function computeWeeklyPath(snap: GEXSnapshot): WeeklyPathProjection {
  const levels = buildLevels(snap);
  const phases = buildPhases(snap);
  const path = buildPath(snap, phases);
  const entryZones = buildEntryZones(snap, path, phases);
  const { monday, friday } = getWeekBounds();

  // Overall confidence: based on data quality + regime clarity
  const regimeClarity = snap.regime === 'positive_gamma' || snap.regime === 'negative_gamma' ? 0.8 : 0.5;
  const gexStrength = Math.min(1, Math.abs(snap.totalGEX) / 5e9);
  const confidence = Math.round((regimeClarity * 0.6 + gexStrength * 0.4) * 100) / 100;

  return {
    symbol: snap.symbol,
    spotPrice: snap.spotPrice,
    weekStart: monday,
    weekEnd: friday,
    generatedAt: Date.now(),
    levels,
    path,
    phases,
    entryZones,
    regime: snap.regime,
    vexRegime: snap.volatilityRegime,
    netGEX: snap.totalGEX,
    netVEX: snap.totalVEX,
    confidence,
  };
}
