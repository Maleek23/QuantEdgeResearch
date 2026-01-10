/**
 * UNIFIED WIN RATE SERVICE
 * 
 * Single source of truth for ALL win rate calculations across the platform.
 * Every endpoint, widget, and report MUST use this service for consistency.
 * 
 * Key Principles:
 * 1. OPTIONS EXCLUDED by default (broken validation - compares stock prices to premiums)
 * 2. NEUTRAL trades excluded from win rate (expired, breakeven)
 * 3. Consistent thresholds: ±3% for win/loss classification
 * 4. Tiered output: summary for users, detailed for admin
 */

import { TradeIdea } from '@shared/schema';
import { 
  isRealWin, 
  isRealLoss, 
  classifyTrade,
  isCurrentGenEngine,
  CANONICAL_WIN_THRESHOLD,
  CANONICAL_LOSS_THRESHOLD
} from '@shared/constants';

export interface WinRateFilters {
  startDate?: string;
  endDate?: string;
  source?: string;
  assetType?: string;
  includeOptions?: boolean;
  includeAllVersions?: boolean;
  excludeSources?: string[];
}

export interface WinRateResult {
  wins: number;
  losses: number;
  neutral: number;
  total: number;
  decided: number;
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
  expectancy: number;
}

export interface CategoryBreakdown {
  category: string;
  stats: WinRateResult;
}

export interface UnifiedWinRateStats {
  overall: WinRateResult;
  bySource: CategoryBreakdown[];
  byAssetType: CategoryBreakdown[];
  methodology: {
    winDefinition: string;
    lossDefinition: string;
    neutralDefinition: string;
    optionsIncluded: boolean;
    legacyIncluded: boolean;
  };
  dataQuality: {
    totalTrades: number;
    tradesWithPnL: number;
    optionsExcluded: number;
    legacyExcluded: number;
  };
}

export class WinRateService {
  
  /**
   * Calculate unified win rate stats from trade ideas
   * This is the CANONICAL function - use this everywhere
   */
  static calculate(ideas: TradeIdea[], filters: WinRateFilters = {}): UnifiedWinRateStats {
    let filtered = [...ideas];
    const originalCount = filtered.length;
    
    // 1. Exclude buggy/test trades
    filtered = filtered.filter(idea => !idea.excludeFromTraining);
    
    // 2. Date filtering
    if (filters.startDate || filters.endDate) {
      filtered = filtered.filter(idea => {
        const ideaDateStr = idea.timestamp.split('T')[0];
        if (filters.startDate && ideaDateStr < filters.startDate) return false;
        if (filters.endDate && ideaDateStr > filters.endDate) return false;
        return true;
      });
    }
    
    // 3. Source filter
    if (filters.source) {
      filtered = filtered.filter(idea => idea.source === filters.source);
    }
    
    // 4. Exclude specific sources
    if (filters.excludeSources && filters.excludeSources.length > 0) {
      filtered = filtered.filter(idea => !filters.excludeSources!.includes(idea.source || ''));
    }
    
    // 5. Engine version filter (exclude legacy by default)
    let legacyExcluded = 0;
    if (!filters.includeAllVersions) {
      const beforeFilter = filtered.length;
      filtered = filtered.filter(idea => isCurrentGenEngine(idea));
      legacyExcluded = beforeFilter - filtered.length;
    }
    
    // 6. OPTIONS FILTER - CRITICAL
    // Options are excluded by default because validation is broken
    // (comparing stock prices to option premiums = meaningless)
    let optionsExcluded = 0;
    if (!filters.includeOptions) {
      const beforeFilter = filtered.length;
      filtered = filtered.filter(idea => idea.assetType !== 'option');
      optionsExcluded = beforeFilter - filtered.length;
      
      // Also exclude flow/lotto sources (almost entirely options)
      filtered = filtered.filter(idea => 
        idea.source !== 'flow' && idea.source !== 'lotto'
      );
    }
    
    // 7. Asset type filter
    if (filters.assetType) {
      filtered = filtered.filter(idea => idea.assetType === filters.assetType);
    }
    
    // Calculate stats
    const overall = this.calculateStats(filtered);
    
    // Group by source
    const sources = Array.from(new Set(filtered.map(i => i.source || 'unknown')));
    const bySource = sources.map(source => ({
      category: source,
      stats: this.calculateStats(filtered.filter(i => i.source === source))
    })).filter(s => s.stats.decided > 0)
      .sort((a, b) => b.stats.decided - a.stats.decided);
    
    // Group by asset type
    const assetTypes = Array.from(new Set(filtered.map(i => i.assetType || 'unknown')));
    const byAssetType = assetTypes.map(assetType => ({
      category: assetType,
      stats: this.calculateStats(filtered.filter(i => i.assetType === assetType))
    })).filter(s => s.stats.decided > 0)
      .sort((a, b) => b.stats.decided - a.stats.decided);
    
    return {
      overall,
      bySource,
      byAssetType,
      methodology: {
        winDefinition: `hit_target OR P&L >= +${CANONICAL_WIN_THRESHOLD}%`,
        lossDefinition: `hit_stop AND P&L <= -${CANONICAL_LOSS_THRESHOLD}%`,
        neutralDefinition: 'expired, manual_exit, or |P&L| < 3%',
        optionsIncluded: filters.includeOptions ?? false,
        legacyIncluded: filters.includeAllVersions ?? false,
      },
      dataQuality: {
        totalTrades: originalCount,
        tradesWithPnL: filtered.filter(i => i.percentGain !== null).length,
        optionsExcluded,
        legacyExcluded,
      }
    };
  }
  
  /**
   * Calculate basic stats for a set of trades
   */
  private static calculateStats(ideas: TradeIdea[]): WinRateResult {
    const wins = ideas.filter(i => isRealWin(i));
    const losses = ideas.filter(i => isRealLoss(i));
    const neutral = ideas.filter(i => !isRealWin(i) && !isRealLoss(i));
    
    const decided = wins.length + losses.length;
    const winRate = decided > 0 ? (wins.length / decided) * 100 : 0;
    
    // Calculate average win/loss sizes
    const winGains = wins
      .filter(i => i.percentGain !== null)
      .map(i => i.percentGain!);
    const lossGains = losses
      .filter(i => i.percentGain !== null)
      .map(i => Math.abs(i.percentGain!));
    
    const avgWinPct = winGains.length > 0 
      ? winGains.reduce((a, b) => a + b, 0) / winGains.length 
      : 0;
    const avgLossPct = lossGains.length > 0 
      ? lossGains.reduce((a, b) => a + b, 0) / lossGains.length 
      : 0;
    
    // Expectancy: (Win% × Avg Win) - (Loss% × Avg Loss)
    const winPct = decided > 0 ? wins.length / decided : 0;
    const lossPct = decided > 0 ? losses.length / decided : 0;
    const expectancy = (winPct * avgWinPct) - (lossPct * avgLossPct);
    
    return {
      wins: wins.length,
      losses: losses.length,
      neutral: neutral.length,
      total: ideas.length,
      decided,
      winRate: Math.round(winRate * 10) / 10,
      avgWinPct: Math.round(avgWinPct * 10) / 10,
      avgLossPct: Math.round(avgLossPct * 10) / 10,
      expectancy: Math.round(expectancy * 100) / 100,
    };
  }
  
  /**
   * Get summary stats for regular users (clean, simple)
   */
  static getSummary(ideas: TradeIdea[], filters: WinRateFilters = {}): {
    winRate: number;
    decided: number;
    wins: number;
    losses: number;
  } {
    const stats = this.calculate(ideas, filters);
    return {
      winRate: stats.overall.winRate,
      decided: stats.overall.decided,
      wins: stats.overall.wins,
      losses: stats.overall.losses,
    };
  }
  
  /**
   * Calculate win rate for paper trading positions (Auto-Lotto bot)
   * Uses consistent logic with trade ideas
   */
  static calculateBotStats(positions: Array<{
    status: string;
    realizedPnL?: number | null;
    realizedPnLPercent?: number | null;
    exitReason?: string | null;
  }>): WinRateResult {
    const closedPositions = positions.filter(p => 
      p.status === 'closed' || p.status === 'expired'
    );
    
    const wins = closedPositions.filter(p => {
      if (p.realizedPnLPercent !== null && p.realizedPnLPercent !== undefined) {
        return p.realizedPnLPercent >= CANONICAL_WIN_THRESHOLD;
      }
      if (p.realizedPnL !== null && p.realizedPnL !== undefined) {
        return p.realizedPnL > 0;
      }
      return false;
    });
    
    const losses = closedPositions.filter(p => {
      if (p.realizedPnLPercent !== null && p.realizedPnLPercent !== undefined) {
        return p.realizedPnLPercent <= -CANONICAL_LOSS_THRESHOLD;
      }
      if (p.realizedPnL !== null && p.realizedPnL !== undefined) {
        return p.realizedPnL < 0;
      }
      return false;
    });
    
    const neutral = closedPositions.filter(p => {
      const pnlPct = p.realizedPnLPercent;
      if (pnlPct !== null && pnlPct !== undefined) {
        return Math.abs(pnlPct) < CANONICAL_WIN_THRESHOLD;
      }
      return true;
    });
    
    const decided = wins.length + losses.length;
    const winRate = decided > 0 ? (wins.length / decided) * 100 : 0;
    
    const winPnls = wins
      .filter(p => p.realizedPnLPercent !== null)
      .map(p => p.realizedPnLPercent!);
    const lossPnls = losses
      .filter(p => p.realizedPnLPercent !== null)
      .map(p => Math.abs(p.realizedPnLPercent!));
    
    const avgWinPct = winPnls.length > 0 
      ? winPnls.reduce((a, b) => a + b, 0) / winPnls.length 
      : 0;
    const avgLossPct = lossPnls.length > 0 
      ? lossPnls.reduce((a, b) => a + b, 0) / lossPnls.length 
      : 0;
    
    const winPct = decided > 0 ? wins.length / decided : 0;
    const lossPct = decided > 0 ? losses.length / decided : 0;
    const expectancy = (winPct * avgWinPct) - (lossPct * avgLossPct);
    
    return {
      wins: wins.length,
      losses: losses.length,
      neutral: neutral.length,
      total: closedPositions.length,
      decided,
      winRate: Math.round(winRate * 10) / 10,
      avgWinPct: Math.round(avgWinPct * 10) / 10,
      avgLossPct: Math.round(avgLossPct * 10) / 10,
      expectancy: Math.round(expectancy * 100) / 100,
    };
  }
}

export default WinRateService;
