import { storage } from "./storage";
import { 
  TradeDiagnostics, 
  InsertTradeDiagnostics, 
  LossCategory, 
  BotLearningState,
  PaperPosition
} from "@shared/schema";
import { getMarketContext } from "./market-context-service";
import { logger } from "./logger";

const BOT_LEARNING_ID = "bot-learning-state-v1";

interface TradeAnalysis {
  categories: LossCategory[];
  primaryCause: LossCategory;
  analysisNotes: string;
  remediationActions: {
    adjustStopMultiplier?: number;
    adjustConfidenceThreshold?: number;
    avoidSymbol?: boolean;
    avoidPattern?: string;
    reducePositionSize?: number;
  };
}

export async function analyzeTrade(position: PaperPosition): Promise<TradeDiagnostics | null> {
  try {
    if (!position.exitReason || position.status !== 'closed') {
      logger.debug(`[LOSS-ANALYZER] Skipping analysis for non-closed position ${position.id}`);
      return null;
    }

    const pnlPercent = position.realizedPnLPercent || 0;
    const pnlDollars = position.realizedPnL || 0;
    const outcome = pnlPercent >= 3 ? 'win' : (pnlPercent <= -3 ? 'loss' : 'breakeven');
    
    const marketContext = await getMarketContext();
    
    const entryDate = new Date(position.entryTime);
    const exitDate = position.exitTime ? new Date(position.exitTime) : new Date();
    const daysHeld = Math.ceil((exitDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
    
    let daysToExpiry = 0;
    if (position.expiryDate) {
      const expiry = new Date(position.expiryDate);
      daysToExpiry = Math.max(0, Math.ceil((expiry.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)));
    }
    
    const spyChange = marketContext.spyData?.change || 0;
    
    const entrySnapshot = {
      marketRegime: marketContext.regime || 'unknown',
      spyChange: spyChange,
      volumeRatio: 1.0,
      ivRank: undefined,
      daysToExpiry: daysToExpiry > 0 ? daysToExpiry : undefined,
      confidenceScore: (position as any).confidenceScore || 70,
      signalCount: 3,
      entryReason: (position as any).entryReason || 'bot_signal',
    };
    
    const peakPnL = (position as any).peakPnLPercent || Math.max(pnlPercent, 0);
    const drawdownFromPeak = peakPnL > 0 ? peakPnL - pnlPercent : 0;
    
    const exitTrigger = extractExitTrigger(position.exitReason || 'unknown');
    
    const exitSnapshot = {
      marketRegime: marketContext.regime || 'unknown',
      spyChange: spyChange,
      exitReason: position.exitReason || 'unknown',
      exitTrigger,
      daysHeld,
      maxProfitReached: peakPnL,
      drawdownFromPeak,
    };
    
    let analysis: TradeAnalysis;
    if (outcome === 'loss') {
      analysis = classifyLoss(position, entrySnapshot, exitSnapshot);
    } else if (outcome === 'win') {
      analysis = {
        categories: [],
        primaryCause: 'unknown',
        analysisNotes: `Win trade: +${pnlPercent.toFixed(1)}%. ${exitTrigger === 'hit_target' ? 'Target reached.' : 'Exited on ' + exitTrigger}`,
        remediationActions: {},
      };
    } else {
      analysis = {
        categories: [],
        primaryCause: 'unknown',
        analysisNotes: `Breakeven trade: ${pnlPercent.toFixed(1)}%. Minimal P&L.`,
        remediationActions: {},
      };
    }
    
    const patternHash = generatePatternHash(position, entrySnapshot);
    const similarLossCount = await countSimilarLosses(patternHash);
    
    const diagnostics: InsertTradeDiagnostics = {
      tradeId: position.id,
      tradeSource: 'bot',
      symbol: position.symbol,
      outcome,
      pnlPercent,
      pnlDollars,
      entrySnapshot,
      exitSnapshot,
      lossCategories: analysis.categories,
      primaryCause: analysis.primaryCause,
      analysisNotes: analysis.analysisNotes,
      remediationActions: analysis.remediationActions,
      patternHash,
      similarLossCount,
      reviewStatus: 'pending',
    };
    
    const saved = await storage.createTradeDiagnostics(diagnostics);
    
    if (outcome === 'loss') {
      await applyRemediationToLearningState(analysis, position.symbol);
      
      if (similarLossCount >= 2) {
        await sendLossPatternAlert(position, analysis, similarLossCount);
      }
    }
    
    logger.info(`[LOSS-ANALYZER] Analyzed ${position.symbol}: ${outcome.toUpperCase()} (${pnlPercent.toFixed(1)}%) - Primary cause: ${analysis.primaryCause}`);
    
    return saved;
  } catch (error) {
    logger.error(`[LOSS-ANALYZER] Error analyzing trade:`, error);
    return null;
  }
}

function extractExitTrigger(exitReason: string): string {
  if (exitReason.includes('hit_stop') || exitReason.includes('stop')) return 'stop_loss';
  if (exitReason.includes('hit_target') || exitReason.includes('target')) return 'target';
  if (exitReason.includes('trailing')) return 'trailing_stop';
  if (exitReason.includes('expir')) return 'expiry';
  if (exitReason.includes('manual')) return 'manual';
  if (exitReason.includes('regime')) return 'regime_stop';
  if (exitReason.includes('time')) return 'time_stop';
  return 'unknown';
}

function classifyLoss(
  position: PaperPosition,
  entrySnapshot: any,
  exitSnapshot: any
): TradeAnalysis {
  const categories: LossCategory[] = [];
  let primaryCause: LossCategory = 'unknown';
  const notes: string[] = [];
  const remediation: TradeAnalysis['remediationActions'] = {};
  
  const exitTrigger = exitSnapshot.exitTrigger;
  const pnlPercent = position.realizedPnLPercent || 0;
  const daysHeld = exitSnapshot.daysHeld;
  const daysToExpiry = entrySnapshot.daysToExpiry || 99;
  const peakPnL = exitSnapshot.maxProfitReached || 0;
  const drawdown = exitSnapshot.drawdownFromPeak || 0;
  
  if (exitTrigger === 'stop_loss' && pnlPercent < -30) {
    categories.push('stop_too_loose');
    notes.push(`Large loss (${pnlPercent.toFixed(1)}%) suggests stop was too loose`);
    remediation.adjustStopMultiplier = 0.85;
  }
  
  if (exitTrigger === 'stop_loss' && peakPnL > 20 && pnlPercent < 0) {
    categories.push('stop_too_loose');
    notes.push(`Was up ${peakPnL.toFixed(1)}% but gave it all back - needed tighter trailing stop`);
    remediation.adjustStopMultiplier = 0.9;
  }
  
  if (exitTrigger === 'stop_loss' && Math.abs(pnlPercent) < 15 && daysHeld < 1) {
    categories.push('stop_too_tight');
    notes.push(`Quick stop-out suggests stop was too tight or noisy entry`);
    remediation.adjustStopMultiplier = 1.1;
  }
  
  if (position.optionType && daysToExpiry <= 3 && pnlPercent < -15) {
    categories.push('theta_decay');
    notes.push(`Option lost significant value with ${daysToExpiry} DTE - theta decay likely factor`);
    remediation.avoidPattern = 'short_dte_hold';
  }
  
  const direction = position.direction || 'long';
  const spyChange = exitSnapshot.spyChange || 0;
  if ((direction === 'long' && spyChange < -1.5) || (direction === 'short' && spyChange > 1.5)) {
    categories.push('direction_wrong');
    notes.push(`Market moved ${spyChange > 0 ? '+' : ''}${spyChange.toFixed(1)}% against ${direction} position`);
    remediation.adjustConfidenceThreshold = 5;
  }
  
  const regime = exitSnapshot.marketRegime;
  const entryRegime = entrySnapshot.marketRegime;
  if (entryRegime !== regime) {
    categories.push('regime_shift');
    notes.push(`Market regime shifted from ${entryRegime} to ${regime} during trade`);
  }
  
  if (daysHeld === 0 && Math.abs(pnlPercent) > 20) {
    categories.push('timing_late');
    notes.push(`Large same-day loss suggests entered after move already happened`);
    remediation.adjustConfidenceThreshold = 10;
  }
  
  if (daysHeld > 5 && peakPnL < 10) {
    categories.push('timing_early');
    notes.push(`Held ${daysHeld} days but never saw significant profit - may have entered too early`);
  }
  
  if (entrySnapshot.confidenceScore < 65) {
    categories.push('chasing_entry');
    notes.push(`Low confidence entry (${entrySnapshot.confidenceScore}) - may have been chasing`);
    remediation.adjustConfidenceThreshold = 10;
  }
  
  if (categories.length === 0) {
    categories.push('unknown');
    notes.push(`Loss cause unclear - needs manual review`);
  }
  
  const causeWeights: Record<LossCategory, number> = {
    'direction_wrong': 100,
    'regime_shift': 90,
    'theta_decay': 85,
    'iv_crush': 85,
    'stop_too_loose': 80,
    'timing_late': 75,
    'chasing_entry': 75,
    'timing_early': 70,
    'stop_too_tight': 65,
    'catalyst_failed': 60,
    'liquidity_issue': 50,
    'oversized_position': 40,
    'unknown': 0,
  };
  
  primaryCause = categories.reduce((prev, curr) => 
    (causeWeights[curr] > causeWeights[prev]) ? curr : prev
  , categories[0]);
  
  return {
    categories,
    primaryCause,
    analysisNotes: notes.join(' | '),
    remediationActions: remediation,
  };
}

function generatePatternHash(position: PaperPosition, entrySnapshot: any): string {
  const components = [
    entrySnapshot.marketRegime,
    position.optionType || 'stock',
    position.direction || 'long',
    Math.round((entrySnapshot.daysToExpiry || 0) / 3) * 3,
    entrySnapshot.confidenceScore > 80 ? 'high_conf' : 'normal_conf',
  ];
  return components.join('_');
}

async function countSimilarLosses(patternHash: string): Promise<number> {
  try {
    const diagnostics = await storage.getTradeDiagnosticsByPatternHash(patternHash);
    return diagnostics.filter(d => d.outcome === 'loss').length;
  } catch (error) {
    return 0;
  }
}

async function applyRemediationToLearningState(
  analysis: TradeAnalysis,
  symbol: string
): Promise<void> {
  try {
    let learningState = await storage.getBotLearningState(BOT_LEARNING_ID);
    
    if (!learningState) {
      learningState = await storage.createBotLearningState({
        confidenceThreshold: 65,
        stopLossMultiplier: 1.0,
        positionSizeMultiplier: 1.0,
        symbolAdjustments: {},
        patternAdjustments: {},
        totalAnalyzed: 0,
        totalWins: 0,
        totalLosses: 0,
        adaptationsApplied: 0,
      });
    }
    
    const updates: Partial<BotLearningState> = {
      totalAnalyzed: (learningState.totalAnalyzed || 0) + 1,
      totalLosses: (learningState.totalLosses || 0) + 1,
    };
    
    if (analysis.remediationActions.adjustConfidenceThreshold) {
      const currentThreshold = learningState.confidenceThreshold || 65;
      updates.confidenceThreshold = Math.min(85, currentThreshold + 
        (analysis.remediationActions.adjustConfidenceThreshold * 0.3));
      updates.adaptationsApplied = (learningState.adaptationsApplied || 0) + 1;
    }
    
    if (analysis.remediationActions.adjustStopMultiplier) {
      const currentMultiplier = learningState.stopLossMultiplier || 1.0;
      const change = (analysis.remediationActions.adjustStopMultiplier - 1.0) * 0.2;
      updates.stopLossMultiplier = Math.max(0.7, Math.min(1.3, currentMultiplier + change));
      updates.adaptationsApplied = (learningState.adaptationsApplied || 0) + 1;
    }
    
    const symbolAdj = { ...(learningState.symbolAdjustments || {}) };
    if (!symbolAdj[symbol]) {
      symbolAdj[symbol] = {
        confidenceBoost: 0,
        lossStreak: 0,
        winRate: 50,
      };
    }
    symbolAdj[symbol].lossStreak = (symbolAdj[symbol].lossStreak || 0) + 1;
    symbolAdj[symbol].confidenceBoost = Math.max(-20, (symbolAdj[symbol].confidenceBoost || 0) - 3);
    
    if (symbolAdj[symbol].lossStreak >= 3) {
      const avoidUntil = new Date();
      avoidUntil.setDate(avoidUntil.getDate() + 3);
      symbolAdj[symbol].avoidUntil = avoidUntil.toISOString();
      logger.info(`[LOSS-ANALYZER] 🚫 Avoiding ${symbol} until ${avoidUntil.toISOString().split('T')[0]} after 3 consecutive losses`);
    }
    
    updates.symbolAdjustments = symbolAdj;
    
    await storage.updateBotLearningState(BOT_LEARNING_ID, updates);
    
    logger.info(`[LOSS-ANALYZER] Applied remediation - Confidence threshold: ${updates.confidenceThreshold?.toFixed(1) || 'unchanged'}, Stop multiplier: ${updates.stopLossMultiplier?.toFixed(2) || 'unchanged'}`);
  } catch (error) {
    logger.error(`[LOSS-ANALYZER] Error applying remediation:`, error);
  }
}

export async function recordWin(position: PaperPosition): Promise<void> {
  try {
    let learningState = await storage.getBotLearningState(BOT_LEARNING_ID);
    
    if (!learningState) return;
    
    const symbol = position.symbol;
    const symbolAdj = { ...(learningState.symbolAdjustments || {}) };
    
    if (symbolAdj[symbol]) {
      symbolAdj[symbol].lossStreak = 0;
      symbolAdj[symbol].confidenceBoost = Math.min(10, (symbolAdj[symbol].confidenceBoost || 0) + 1);
      delete symbolAdj[symbol].avoidUntil;
    }
    
    await storage.updateBotLearningState(BOT_LEARNING_ID, {
      totalAnalyzed: (learningState.totalAnalyzed || 0) + 1,
      totalWins: (learningState.totalWins || 0) + 1,
      symbolAdjustments: symbolAdj,
    });
  } catch (error) {
    logger.error(`[LOSS-ANALYZER] Error recording win:`, error);
  }
}

async function sendLossPatternAlert(
  position: PaperPosition,
  analysis: TradeAnalysis,
  similarCount: number
): Promise<void> {
  try {
    const message = [
      `⚠️ [LOSS-ANALYZER] Recurring Loss Pattern Detected`,
      `Symbol: ${position.symbol}`,
      `Loss: ${(position.realizedPnLPercent || 0).toFixed(1)}%`,
      `Primary Cause: ${analysis.primaryCause.replace(/_/g, ' ')}`,
      `Similar Losses: ${similarCount} previous trades with same pattern`,
      `Analysis: ${analysis.analysisNotes}`,
      `Remediation Applied: ${Object.entries(analysis.remediationActions).map(([key, val]) => `${key}: ${val}`).join(', ')}`,
    ].join(' | ');
    
    logger.warn(message);
  } catch (error) {
    logger.error(`[LOSS-ANALYZER] Error sending loss pattern alert:`, error);
  }
}

export async function getLearningState(): Promise<BotLearningState | null> {
  return storage.getBotLearningState(BOT_LEARNING_ID);
}

export async function getSymbolAdjustment(symbol: string): Promise<{
  confidenceBoost: number;
  shouldAvoid: boolean;
  lossStreak: number;
}> {
  try {
    const state = await storage.getBotLearningState(BOT_LEARNING_ID);
    if (!state || !state.symbolAdjustments) {
      return { confidenceBoost: 0, shouldAvoid: false, lossStreak: 0 };
    }
    
    const adj = state.symbolAdjustments[symbol];
    if (!adj) {
      return { confidenceBoost: 0, shouldAvoid: false, lossStreak: 0 };
    }
    
    const shouldAvoid = adj.avoidUntil ? new Date(adj.avoidUntil) > new Date() : false;
    
    return {
      confidenceBoost: adj.confidenceBoost || 0,
      shouldAvoid,
      lossStreak: adj.lossStreak || 0,
    };
  } catch (error) {
    return { confidenceBoost: 0, shouldAvoid: false, lossStreak: 0 };
  }
}

export async function getAdaptiveParameters(): Promise<{
  confidenceThreshold: number;
  stopLossMultiplier: number;
  positionSizeMultiplier: number;
}> {
  try {
    const state = await storage.getBotLearningState(BOT_LEARNING_ID);
    return {
      confidenceThreshold: state?.confidenceThreshold || 65,
      stopLossMultiplier: state?.stopLossMultiplier || 1.0,
      positionSizeMultiplier: state?.positionSizeMultiplier || 1.0,
    };
  } catch (error) {
    return {
      confidenceThreshold: 65,
      stopLossMultiplier: 1.0,
      positionSizeMultiplier: 1.0,
    };
  }
}

export async function analyzeClosedTrades(limit: number = 50): Promise<{
  analyzed: number;
  wins: number;
  losses: number;
  breakeven: number;
  topLossCategories: { category: string; count: number }[];
}> {
  try {
    const recentTrades = await storage.getRecentClosedPositions(limit);
    
    let analyzed = 0;
    let wins = 0;
    let losses = 0;
    let breakeven = 0;
    const categoryCount: Record<string, number> = {};
    
    for (const trade of recentTrades) {
      const existing = await storage.getTradeDiagnosticsByTradeId(trade.id);
      if (existing) continue;
      
      const diagnostics = await analyzeTrade(trade);
      if (diagnostics) {
        analyzed++;
        if (diagnostics.outcome === 'win') wins++;
        else if (diagnostics.outcome === 'loss') losses++;
        else breakeven++;
        
        if (diagnostics.primaryCause) {
          categoryCount[diagnostics.primaryCause] = (categoryCount[diagnostics.primaryCause] || 0) + 1;
        }
      }
    }
    
    const topLossCategories = Object.entries(categoryCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, count]) => ({ category, count }));
    
    return { analyzed, wins, losses, breakeven, topLossCategories };
  } catch (error) {
    logger.error(`[LOSS-ANALYZER] Error in batch analysis:`, error);
    return { analyzed: 0, wins: 0, losses: 0, breakeven: 0, topLossCategories: [] };
  }
}

export async function getLossPatternSummary(): Promise<{
  totalLosses: number;
  topPatterns: { pattern: string; count: number; avgLoss: number }[];
  symbolPerformance: { symbol: string; wins: number; losses: number; winRate: number }[];
  recentAdaptations: string[];
}> {
  try {
    const diagnostics = await storage.getAllTradeDiagnostics();
    const losses = diagnostics.filter(d => d.outcome === 'loss');
    
    const patternCounts: Record<string, { count: number; totalLoss: number }> = {};
    for (const loss of losses) {
      const pattern = loss.primaryCause || 'unknown';
      if (!patternCounts[pattern]) {
        patternCounts[pattern] = { count: 0, totalLoss: 0 };
      }
      patternCounts[pattern].count++;
      patternCounts[pattern].totalLoss += loss.pnlPercent;
    }
    
    const topPatterns = Object.entries(patternCounts)
      .map(([pattern, data]) => ({
        pattern,
        count: data.count,
        avgLoss: data.count > 0 ? data.totalLoss / data.count : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    
    const symbolStats: Record<string, { wins: number; losses: number }> = {};
    for (const d of diagnostics) {
      if (!symbolStats[d.symbol]) {
        symbolStats[d.symbol] = { wins: 0, losses: 0 };
      }
      if (d.outcome === 'win') symbolStats[d.symbol].wins++;
      else if (d.outcome === 'loss') symbolStats[d.symbol].losses++;
    }
    
    const symbolPerformance = Object.entries(symbolStats)
      .map(([symbol, stats]) => ({
        symbol,
        wins: stats.wins,
        losses: stats.losses,
        winRate: stats.wins + stats.losses > 0 
          ? (stats.wins / (stats.wins + stats.losses)) * 100 
          : 0,
      }))
      .filter(s => s.wins + s.losses >= 3)
      .sort((a, b) => b.winRate - a.winRate);
    
    const state = await storage.getBotLearningState(BOT_LEARNING_ID);
    const recentAdaptations: string[] = [];
    
    if (state) {
      if (state.confidenceThreshold && state.confidenceThreshold !== 65) {
        recentAdaptations.push(`Confidence threshold adjusted to ${state.confidenceThreshold.toFixed(1)}%`);
      }
      if (state.stopLossMultiplier && state.stopLossMultiplier !== 1.0) {
        recentAdaptations.push(`Stop loss multiplier adjusted to ${state.stopLossMultiplier.toFixed(2)}x`);
      }
      
      if (state.symbolAdjustments) {
        for (const [symbol, adj] of Object.entries(state.symbolAdjustments)) {
          if (adj.avoidUntil && new Date(adj.avoidUntil) > new Date()) {
            recentAdaptations.push(`Avoiding ${symbol} until ${adj.avoidUntil.split('T')[0]}`);
          }
        }
      }
    }
    
    return {
      totalLosses: losses.length,
      topPatterns,
      symbolPerformance,
      recentAdaptations,
    };
  } catch (error) {
    logger.error(`[LOSS-ANALYZER] Error getting loss summary:`, error);
    return {
      totalLosses: 0,
      topPatterns: [],
      symbolPerformance: [],
      recentAdaptations: [],
    };
  }
}
