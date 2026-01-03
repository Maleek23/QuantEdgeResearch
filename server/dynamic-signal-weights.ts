import { db } from "./db";
import { signalPerformance } from "@shared/schema";
import { logger } from "./logger";
import { gte, desc } from "drizzle-orm";

export interface SignalWeight {
  signalName: string;
  baseWeight: number;
  dynamicWeight: number;
  winRate: number;
  totalTrades: number;
  confidence: 'high' | 'medium' | 'low' | 'untested';
  isOverridden: boolean;
  overrideWeight?: number;
}

export interface WeightingConfig {
  minWeight: number;
  maxWeight: number;
  baselineWinRate: number;
  enableDynamicWeights: boolean;
  manualOverrides: Record<string, number>;
}

const DEFAULT_CONFIG: WeightingConfig = {
  minWeight: 0.25,
  maxWeight: 2.5,
  baselineWinRate: 50,
  enableDynamicWeights: true,
  manualOverrides: {},
};

let cachedWeights: Map<string, SignalWeight> = new Map();
let lastCacheTime: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export function calculateDynamicWeight(
  winRate: number,
  totalTrades: number,
  config: WeightingConfig = DEFAULT_CONFIG
): { weight: number; confidence: 'high' | 'medium' | 'low' | 'untested' } {
  let confidence: 'high' | 'medium' | 'low' | 'untested';
  if (totalTrades >= 50) confidence = 'high';
  else if (totalTrades >= 20) confidence = 'medium';
  else if (totalTrades >= 5) confidence = 'low';
  else confidence = 'untested';

  if (!config.enableDynamicWeights) {
    return { weight: 1.0, confidence };
  }

  let rawWeight = winRate / config.baselineWinRate;
  
  if (confidence === 'untested') {
    rawWeight = Math.max(rawWeight, 0.8);
  } else if (confidence === 'low') {
    rawWeight = 0.5 + (rawWeight * 0.5);
  }

  const clampedWeight = Math.max(
    config.minWeight,
    Math.min(config.maxWeight, rawWeight)
  );

  return { weight: clampedWeight, confidence };
}

export async function refreshSignalWeights(
  config: WeightingConfig = DEFAULT_CONFIG
): Promise<Map<string, SignalWeight>> {
  logger.info("🔄 [DYNAMIC-WEIGHTS] Refreshing signal weights from attribution data...");

  try {
    const signals = await db.select()
      .from(signalPerformance)
      .where(gte(signalPerformance.totalTrades, 1))
      .orderBy(desc(signalPerformance.totalTrades));

    const newWeights = new Map<string, SignalWeight>();

    for (const signal of signals) {
      const { weight, confidence } = calculateDynamicWeight(
        signal.winRate,
        signal.totalTrades,
        config
      );

      const isOverridden = config.manualOverrides.hasOwnProperty(signal.signalName);
      const finalWeight = isOverridden 
        ? config.manualOverrides[signal.signalName] 
        : weight;

      newWeights.set(signal.signalName, {
        signalName: signal.signalName,
        baseWeight: 1.0,
        dynamicWeight: finalWeight,
        winRate: signal.winRate,
        totalTrades: signal.totalTrades,
        confidence,
        isOverridden,
        overrideWeight: isOverridden ? config.manualOverrides[signal.signalName] : undefined,
      });
    }

    cachedWeights = newWeights;
    lastCacheTime = Date.now();

    logger.info(`✅ [DYNAMIC-WEIGHTS] Loaded ${newWeights.size} signal weights`);
    
    const topBoosted = Array.from(newWeights.values())
      .filter(w => w.dynamicWeight > 1.5)
      .sort((a, b) => b.dynamicWeight - a.dynamicWeight)
      .slice(0, 5);
    
    if (topBoosted.length > 0) {
      logger.info(`📈 [DYNAMIC-WEIGHTS] Top boosted signals: ${topBoosted.map(w => `${w.signalName}(${w.dynamicWeight.toFixed(2)}x)`).join(', ')}`);
    }

    const reduced = Array.from(newWeights.values())
      .filter(w => w.dynamicWeight < 0.5)
      .sort((a, b) => a.dynamicWeight - b.dynamicWeight)
      .slice(0, 5);
    
    if (reduced.length > 0) {
      logger.info(`📉 [DYNAMIC-WEIGHTS] Reduced influence signals: ${reduced.map(w => `${w.signalName}(${w.dynamicWeight.toFixed(2)}x)`).join(', ')}`);
    }

    return newWeights;

  } catch (error) {
    logger.error(`❌ [DYNAMIC-WEIGHTS] Failed to refresh weights: ${error}`);
    return cachedWeights;
  }
}

export async function getSignalWeights(
  config: WeightingConfig = DEFAULT_CONFIG
): Promise<Map<string, SignalWeight>> {
  const now = Date.now();
  
  if (cachedWeights.size === 0 || (now - lastCacheTime) > CACHE_TTL_MS) {
    return refreshSignalWeights(config);
  }

  return cachedWeights;
}

export async function getWeightForSignal(
  signalName: string,
  config: WeightingConfig = DEFAULT_CONFIG
): Promise<number> {
  const weights = await getSignalWeights(config);
  const signalWeight = weights.get(signalName);
  
  if (!signalWeight) {
    return 1.0;
  }

  return signalWeight.dynamicWeight;
}

export async function calculateWeightedConfidence(
  signals: string[],
  baseConfidence: number,
  config: WeightingConfig = DEFAULT_CONFIG
): Promise<{
  adjustedConfidence: number;
  signalContributions: Array<{ signal: string; weight: number; contribution: number }>;
  totalWeightMultiplier: number;
}> {
  const weights = await getSignalWeights(config);
  
  if (signals.length === 0) {
    return {
      adjustedConfidence: baseConfidence,
      signalContributions: [],
      totalWeightMultiplier: 1.0,
    };
  }

  let totalWeight = 0;
  const contributions: Array<{ signal: string; weight: number; contribution: number }> = [];

  for (const signal of signals) {
    const weight = weights.get(signal)?.dynamicWeight ?? 1.0;
    totalWeight += weight;
    contributions.push({
      signal,
      weight,
      contribution: weight / signals.length,
    });
  }

  const avgWeight = totalWeight / signals.length;
  
  const dampedMultiplier = 1 + ((avgWeight - 1) * 0.5);
  
  let adjustedConfidence = baseConfidence * dampedMultiplier;
  adjustedConfidence = Math.max(10, Math.min(99, adjustedConfidence));

  return {
    adjustedConfidence: Math.round(adjustedConfidence * 10) / 10,
    signalContributions: contributions,
    totalWeightMultiplier: Math.round(avgWeight * 100) / 100,
  };
}

export function setManualOverride(
  signalName: string,
  weight: number,
  config: WeightingConfig = DEFAULT_CONFIG
): void {
  config.manualOverrides[signalName] = Math.max(0.1, Math.min(3.0, weight));
  logger.info(`🔧 [DYNAMIC-WEIGHTS] Manual override set: ${signalName} = ${weight}x`);
  
  lastCacheTime = 0;
}

export function removeManualOverride(
  signalName: string,
  config: WeightingConfig = DEFAULT_CONFIG
): void {
  delete config.manualOverrides[signalName];
  logger.info(`🔧 [DYNAMIC-WEIGHTS] Manual override removed: ${signalName}`);
  
  lastCacheTime = 0;
}

export async function getWeightsSummary(): Promise<{
  enabled: boolean;
  totalSignals: number;
  boostedCount: number;
  reducedCount: number;
  neutralCount: number;
  overriddenCount: number;
  topBoosted: SignalWeight[];
  topReduced: SignalWeight[];
}> {
  const weights = await getSignalWeights();
  const weightArray = Array.from(weights.values());

  const boosted = weightArray.filter(w => w.dynamicWeight > 1.2);
  const reduced = weightArray.filter(w => w.dynamicWeight < 0.8);
  const neutral = weightArray.filter(w => w.dynamicWeight >= 0.8 && w.dynamicWeight <= 1.2);
  const overridden = weightArray.filter(w => w.isOverridden);

  return {
    enabled: DEFAULT_CONFIG.enableDynamicWeights,
    totalSignals: weightArray.length,
    boostedCount: boosted.length,
    reducedCount: reduced.length,
    neutralCount: neutral.length,
    overriddenCount: overridden.length,
    topBoosted: boosted
      .sort((a, b) => b.dynamicWeight - a.dynamicWeight)
      .slice(0, 10),
    topReduced: reduced
      .sort((a, b) => a.dynamicWeight - b.dynamicWeight)
      .slice(0, 10),
  };
}
