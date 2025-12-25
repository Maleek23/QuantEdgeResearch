import { storage } from './storage';
import { logger } from './logger';
import type { TradeIdea, Catalyst } from '@shared/schema';

export interface WatchReason {
  type: 'earnings' | 'news' | 'flow' | 'technical' | 'ai_pick' | 'quant_signal' | 'momentum' | 'volatility';
  label: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  timestamp?: string;
}

export interface WatchSuggestion {
  symbol: string;
  assetType: 'stock' | 'crypto' | 'option';
  currentPrice?: number;
  priceChange?: number;
  reasons: WatchReason[];
  reasonCount: number;
  priority: 'hot' | 'warm' | 'watch';
  direction?: 'bullish' | 'bearish' | 'neutral';
  generatedAt: string;
}

export async function generateWatchSuggestions(): Promise<WatchSuggestion[]> {
  const now = new Date();
  const suggestions = new Map<string, WatchSuggestion>();
  
  try {
    const [tradeIdeas, catalysts] = await Promise.all([
      storage.getAllTradeIdeas(),
      storage.getAllCatalysts(),
    ]);
    
    const recentIdeas = tradeIdeas.filter((idea: TradeIdea) => {
      const ideaTime = new Date(idea.timestamp || '');
      const hoursSinceCreated = (now.getTime() - ideaTime.getTime()) / (1000 * 60 * 60);
      return hoursSinceCreated < 72 && idea.outcomeStatus === 'open';
    });
    
    for (const idea of recentIdeas) {
      if (!idea.symbol) continue;
      
      const existing = suggestions.get(idea.symbol) || createEmptySuggestion(idea.symbol, idea.assetType);
      const confidence = idea.confidenceScore || 0;
      
      if (idea.source === 'ai' && confidence >= 70) {
        existing.reasons.push({
          type: 'ai_pick',
          label: 'AI Pick',
          description: `AI engine selected with ${Math.round(confidence)}% confidence`,
          impact: confidence >= 85 ? 'high' : 'medium',
          timestamp: idea.timestamp,
        });
      }
      
      if (idea.source === 'quant' && confidence >= 65) {
        existing.reasons.push({
          type: 'quant_signal',
          label: 'Quant Signal',
          description: `Quantitative engine signal (${Math.round(confidence)}% confidence)`,
          impact: confidence >= 80 ? 'high' : 'medium',
          timestamp: idea.timestamp,
        });
      }
      
      if (idea.source === 'flow' || idea.source === 'lotto') {
        existing.reasons.push({
          type: 'flow',
          label: 'Unusual Flow',
          description: idea.source === 'lotto' ? 'Lotto-style options activity detected' : 'Unusual options flow detected',
          impact: 'medium',
          timestamp: idea.timestamp,
        });
      }
      
      if (idea.source === 'news') {
        existing.reasons.push({
          type: 'news',
          label: 'Breaking News',
          description: 'News catalyst detected',
          impact: 'high',
          timestamp: idea.timestamp,
        });
      }
      
      if (idea.direction) {
        existing.direction = idea.direction === 'long' ? 'bullish' : 'bearish';
      }
      
      existing.currentPrice = idea.entryPrice || undefined;
      suggestions.set(idea.symbol, existing);
    }
    
    const recentCatalysts = catalysts.filter((cat: Catalyst) => {
      const catTime = new Date(cat.timestamp);
      const hoursSinceCatalyst = (now.getTime() - catTime.getTime()) / (1000 * 60 * 60);
      return hoursSinceCatalyst < 168;
    });
    
    for (const catalyst of recentCatalysts) {
      if (!catalyst.symbol) continue;
      
      const existing = suggestions.get(catalyst.symbol) || createEmptySuggestion(catalyst.symbol, 'stock');
      
      if (catalyst.eventType === 'earnings') {
        existing.reasons.push({
          type: 'earnings',
          label: 'Earnings',
          description: catalyst.title,
          impact: catalyst.impact as 'high' | 'medium' | 'low',
          timestamp: catalyst.timestamp,
        });
      } else {
        existing.reasons.push({
          type: 'news',
          label: catalyst.eventType.charAt(0).toUpperCase() + catalyst.eventType.slice(1),
          description: catalyst.title,
          impact: catalyst.impact as 'high' | 'medium' | 'low',
          timestamp: catalyst.timestamp,
        });
      }
      
      suggestions.set(catalyst.symbol, existing);
    }
    
    const result = Array.from(suggestions.values())
      .map(s => ({
        ...s,
        reasonCount: s.reasons.length,
        priority: calculatePriority(s.reasons),
        generatedAt: now.toISOString(),
      }))
      .filter(s => s.reasonCount >= 2)
      .sort((a, b) => {
        const priorityOrder = { hot: 0, warm: 1, watch: 2 };
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        return b.reasonCount - a.reasonCount;
      })
      .slice(0, 15);
    
    logger.info(`📡 [WATCH] Generated ${result.length} watch suggestions from ${suggestions.size} symbols`);
    return result;
    
  } catch (error) {
    logger.error('📡 [WATCH] Error generating watch suggestions:', error);
    return [];
  }
}

function createEmptySuggestion(symbol: string, assetType: string): WatchSuggestion {
  return {
    symbol,
    assetType: assetType as 'stock' | 'crypto' | 'option',
    reasons: [],
    reasonCount: 0,
    priority: 'watch',
    generatedAt: new Date().toISOString(),
  };
}

function calculatePriority(reasons: WatchReason[]): 'hot' | 'warm' | 'watch' {
  const highImpactCount = reasons.filter(r => r.impact === 'high').length;
  const uniqueTypes = new Set(reasons.map(r => r.type)).size;
  
  if (highImpactCount >= 2 || (reasons.length >= 3 && uniqueTypes >= 3)) {
    return 'hot';
  }
  if (highImpactCount >= 1 || reasons.length >= 2) {
    return 'warm';
  }
  return 'watch';
}
