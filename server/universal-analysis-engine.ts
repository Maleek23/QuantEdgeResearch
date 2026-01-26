/**
 * Universal Analysis Engine
 *
 * Single source of truth for all stock analysis across the platform.
 * Aggregates 7 dimensions of analysis with weighted scoring.
 *
 * Dimensions:
 * - Technical (25%): Chart patterns, indicators, trends
 * - Fundamental (30%): Financials, valuation, growth
 * - Quantitative (15%): Statistical metrics, risk analysis
 * - ML Predictions (10%): AI-powered price forecasting
 * - Order Flow (15%): Smart money, institutional activity
 * - Sentiment (10%): News, social media, analyst ratings
 * - Catalysts (5%): Upcoming events, earnings, announcements
 */

import { logger } from './logger';

export interface AnalysisParams {
  timeHorizon?: 'DAY' | 'SWING' | 'LONG' | 'ANY';
  focus?: string[] | 'ALL'; // Which dimensions to emphasize
  minScore?: number;
  includeBreakdown?: boolean;
  includeHistorical?: boolean;
}

export interface ComponentScore {
  score: number; // 0-100
  grade: string; // S, A+, A, A-, B+, B, B-, C+, C, C-, D, F
  weight: number; // 0.25, 0.30, etc.
  breakdown: {
    category: string;
    value: number | string;
    interpretation: string;
  }[];
}

export interface TimeHorizonSignal {
  signal: 'BUY' | 'SELL' | 'WAIT';
  confidence: number; // 0-100
  entry?: number;
  exit?: number;
  targetPrice?: number;
  timeframe?: string;
}

export interface UnifiedAnalysisResponse {
  // Meta
  symbol: string;
  name: string;
  assetType: 'stock' | 'crypto' | 'etf' | 'forex';
  timestamp: string;
  auditId: string;

  // Overall Score
  overall: {
    grade: string; // S, A+, A, A-, B+, B, B-, C+, C, C-, D, F
    score: number; // 0-100
    tier: string; // S, A, B, C, D, F
    recommendation: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  };

  // Component Scores (All 7 Dimensions)
  components: {
    technical: ComponentScore;
    fundamental: ComponentScore;
    quantitative: ComponentScore;
    ml: ComponentScore;
    orderFlow: ComponentScore;
    sentiment: ComponentScore;
    catalysts: ComponentScore;
  };

  // Time Horizon Specific
  timeHorizons: {
    day: TimeHorizonSignal;
    swing: TimeHorizonSignal;
    long: TimeHorizonSignal;
  };

  // Insights
  insights: {
    strengths: string[];
    weaknesses: string[];
    catalysts: string[];
    risks: string[];
  };
}

// Scoring weights (must sum to 1.0)
export const CATEGORY_WEIGHTS = {
  technical: 0.25,      // 25%
  fundamental: 0.30,    // 30%
  quantitative: 0.15,   // 15%
  ml: 0.10,             // 10%
  orderFlow: 0.15,      // 15%
  sentiment: 0.10,      // 10%
  catalysts: 0.05       // 5%
};

/**
 * Universal Analysis Engine - Main Class
 */
export class UniversalAnalysisEngine {
  /**
   * Analyze a single symbol with comprehensive multi-dimensional scoring
   */
  async analyze(symbol: string, params: AnalysisParams = {}): Promise<UnifiedAnalysisResponse> {
    const startTime = Date.now();
    const auditId = this.generateAuditId(symbol);

    try {
      logger.info(`[UniversalEngine] Analyzing ${symbol}`, { params, auditId });

      // Import scorers dynamically
      const [
        { technicalScorer },
        { fundamentalAnalysisService },
        { quantitativeScorer },
        { mlScorer },
        { orderFlowScorer },
        { sentimentScorer },
        { catalystsScorer }
      ] = await Promise.all([
        import('./technical-scorer'),
        import('./fundamental-analysis-service'),
        import('./quantitative-scorer'),
        import('./ml-scorer'),
        import('./order-flow-scorer'),
        import('./sentiment-scorer'),
        import('./catalysts-scorer')
      ]);

      // Fetch basic stock info
      const { default: YahooFinance } = await import('yahoo-finance2');
      const yahooFinance = new YahooFinance();
      const quote = await yahooFinance.quote(symbol);

      // Run all scorers in parallel
      const [
        technicalResult,
        fundamentalResult,
        quantitativeResult,
        mlResult,
        orderFlowResult,
        sentimentResult,
        catalystsResult
      ] = await Promise.all([
        technicalScorer.score(symbol).catch(err => this.handleScorerError('technical', err)),
        fundamentalAnalysisService.getStockGrade(symbol).catch(err => this.handleScorerError('fundamental', err)),
        quantitativeScorer.score(symbol).catch(err => this.handleScorerError('quantitative', err)),
        mlScorer.score(symbol).catch(err => this.handleScorerError('ml', err)),
        orderFlowScorer.score(symbol).catch(err => this.handleScorerError('orderFlow', err)),
        sentimentScorer.score(symbol).catch(err => this.handleScorerError('sentiment', err)),
        catalystsScorer.score(symbol).catch(err => this.handleScorerError('catalysts', err))
      ]);

      // Calculate overall score
      const overallScore = this.calculateOverallScore({
        technical: technicalResult.score,
        fundamental: fundamentalResult.fundamentalScore || fundamentalResult.score || 50,
        quantitative: quantitativeResult.score,
        ml: mlResult.score,
        orderFlow: orderFlowResult.score,
        sentiment: sentimentResult.score,
        catalysts: catalystsResult.score
      });

      const overallGrade = this.scoreToGrade(overallScore);
      const recommendation = this.scoreToRecommendation(overallScore);
      const confidence = this.calculateConfidence([
        technicalResult,
        fundamentalResult,
        quantitativeResult,
        mlResult,
        orderFlowResult,
        sentimentResult,
        catalystsResult
      ]);

      // Generate time horizon signals
      const timeHorizons = this.generateTimeHorizonSignals(
        overallScore,
        technicalResult,
        fundamentalResult,
        quote.regularMarketPrice || 0
      );

      // Generate insights
      const insights = this.generateInsights({
        technical: technicalResult,
        fundamental: fundamentalResult,
        quantitative: quantitativeResult,
        ml: mlResult,
        orderFlow: orderFlowResult,
        sentiment: sentimentResult,
        catalysts: catalystsResult
      });

      const analysis: UnifiedAnalysisResponse = {
        symbol,
        name: quote.longName || quote.shortName || symbol,
        assetType: this.determineAssetType(quote),
        timestamp: new Date().toISOString(),
        auditId,

        overall: {
          grade: overallGrade,
          score: overallScore,
          tier: overallGrade.charAt(0),
          recommendation,
          confidence
        },

        components: {
          technical: {
            score: technicalResult.score,
            grade: this.scoreToGrade(technicalResult.score),
            weight: CATEGORY_WEIGHTS.technical,
            breakdown: technicalResult.breakdown || []
          },
          fundamental: {
            score: fundamentalResult.fundamentalScore || fundamentalResult.score || 50,
            grade: this.scoreToGrade(fundamentalResult.fundamentalScore || fundamentalResult.score || 50),
            weight: CATEGORY_WEIGHTS.fundamental,
            breakdown: fundamentalResult.breakdown || []
          },
          quantitative: {
            score: quantitativeResult.score,
            grade: this.scoreToGrade(quantitativeResult.score),
            weight: CATEGORY_WEIGHTS.quantitative,
            breakdown: quantitativeResult.breakdown || []
          },
          ml: {
            score: mlResult.score,
            grade: this.scoreToGrade(mlResult.score),
            weight: CATEGORY_WEIGHTS.ml,
            breakdown: mlResult.breakdown || []
          },
          orderFlow: {
            score: orderFlowResult.score,
            grade: this.scoreToGrade(orderFlowResult.score),
            weight: CATEGORY_WEIGHTS.orderFlow,
            breakdown: orderFlowResult.breakdown || []
          },
          sentiment: {
            score: sentimentResult.score,
            grade: this.scoreToGrade(sentimentResult.score),
            weight: CATEGORY_WEIGHTS.sentiment,
            breakdown: sentimentResult.breakdown || []
          },
          catalysts: {
            score: catalystsResult.score,
            grade: this.scoreToGrade(catalystsResult.score),
            weight: CATEGORY_WEIGHTS.catalysts,
            breakdown: catalystsResult.breakdown || []
          }
        },

        timeHorizons,
        insights
      };

      // Log audit trail
      await this.logAnalysis(analysis, params, Date.now() - startTime);

      logger.info(`[UniversalEngine] Completed ${symbol} in ${Date.now() - startTime}ms`, {
        score: overallScore,
        grade: overallGrade,
        auditId
      });

      return analysis;

    } catch (error: any) {
      logger.error(`[UniversalEngine] Failed to analyze ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Batch analyze multiple symbols
   */
  async batchAnalyze(symbols: string[], params: AnalysisParams = {}): Promise<UnifiedAnalysisResponse[]> {
    logger.info(`[UniversalEngine] Batch analyzing ${symbols.length} symbols`);

    const results = await Promise.allSettled(
      symbols.map(symbol => this.analyze(symbol, params))
    );

    return results
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<UnifiedAnalysisResponse>).value);
  }

  /**
   * Calculate weighted overall score
   */
  private calculateOverallScore(scores: Record<string, number>): number {
    // Ensure all scores have valid values (default to 50 if missing)
    const safeScores = {
      technical: scores.technical ?? 50,
      fundamental: scores.fundamental ?? 50,
      quantitative: scores.quantitative ?? 50,
      ml: scores.ml ?? 50,
      orderFlow: scores.orderFlow ?? 50,
      sentiment: scores.sentiment ?? 50,
      catalysts: scores.catalysts ?? 50
    };

    const weightedScore =
      safeScores.technical * CATEGORY_WEIGHTS.technical +
      safeScores.fundamental * CATEGORY_WEIGHTS.fundamental +
      safeScores.quantitative * CATEGORY_WEIGHTS.quantitative +
      safeScores.ml * CATEGORY_WEIGHTS.ml +
      safeScores.orderFlow * CATEGORY_WEIGHTS.orderFlow +
      safeScores.sentiment * CATEGORY_WEIGHTS.sentiment +
      safeScores.catalysts * CATEGORY_WEIGHTS.catalysts;

    const finalScore = Math.min(100, Math.max(0, Math.round(weightedScore)));

    // Double-check for NaN (shouldn't happen with defaults above, but be safe)
    return isNaN(finalScore) ? 50 : finalScore;
  }

  /**
   * Convert score (0-100) to letter grade
   */
  private scoreToGrade(score: number): string {
    if (score >= 95) return 'S';
    if (score >= 90) return 'A+';
    if (score >= 85) return 'A';
    if (score >= 80) return 'A-';
    if (score >= 75) return 'B+';
    if (score >= 70) return 'B';
    if (score >= 65) return 'B-';
    if (score >= 60) return 'C+';
    if (score >= 55) return 'C';
    if (score >= 50) return 'C-';
    if (score >= 40) return 'D';
    return 'F';
  }

  /**
   * Convert score to buy/sell recommendation
   */
  private scoreToRecommendation(score: number): 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL' {
    if (score >= 85) return 'STRONG_BUY';
    if (score >= 70) return 'BUY';
    if (score >= 50) return 'HOLD';
    if (score >= 35) return 'SELL';
    return 'STRONG_SELL';
  }

  /**
   * Calculate confidence level based on data completeness
   */
  private calculateConfidence(results: any[]): 'HIGH' | 'MEDIUM' | 'LOW' {
    const completeness = results.filter(r => r && r.score > 0).length / results.length;
    const variance = this.calculateVariance(results.map(r => r?.score || 50));

    if (completeness > 0.9 && variance < 10) return 'HIGH';
    if (completeness > 0.7) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Calculate statistical variance
   */
  private calculateVariance(scores: number[]): number {
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const squaredDiffs = scores.map(score => Math.pow(score - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / scores.length);
  }

  /**
   * Generate time horizon specific signals
   */
  private generateTimeHorizonSignals(
    overallScore: number,
    technical: any,
    fundamental: any,
    currentPrice: number
  ): { day: TimeHorizonSignal; swing: TimeHorizonSignal; long: TimeHorizonSignal } {
    return {
      day: {
        signal: technical.score >= 70 ? 'BUY' : technical.score <= 40 ? 'SELL' : 'WAIT',
        confidence: technical.score,
        entry: currentPrice * 0.98,
        exit: currentPrice * 1.02,
        timeframe: '1-5 days'
      },
      swing: {
        signal: overallScore >= 70 ? 'BUY' : overallScore <= 40 ? 'SELL' : 'WAIT',
        confidence: overallScore,
        entry: currentPrice * 0.95,
        exit: currentPrice * 1.10,
        timeframe: '3-15 days'
      },
      long: {
        signal: fundamental.score >= 70 ? 'BUY' : fundamental.score <= 40 ? 'SELL' : 'WAIT',
        confidence: fundamental.score,
        targetPrice: currentPrice * 1.25,
        timeframe: '3-12 months'
      }
    };
  }

  /**
   * Generate insights based on component scores
   */
  private generateInsights(components: any): {
    strengths: string[];
    weaknesses: string[];
    catalysts: string[];
    risks: string[];
  } {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const catalysts: string[] = [];
    const risks: string[] = [];

    // Analyze each component
    Object.entries(components).forEach(([key, value]: [string, any]) => {
      if (value.score >= 80) {
        strengths.push(`Strong ${key} indicators`);
      } else if (value.score <= 40) {
        weaknesses.push(`Weak ${key} metrics`);
      }
    });

    // Add specific insights from components
    if (components.orderFlow?.breakdown) {
      const bullishFlow = components.orderFlow.breakdown.find((b: any) =>
        b.interpretation.toLowerCase().includes('bullish')
      );
      if (bullishFlow) catalysts.push('Institutional buying detected');
    }

    if (components.fundamental?.breakdown) {
      const highDebt = components.fundamental.breakdown.find((b: any) =>
        b.category.toLowerCase().includes('debt') && b.value > 2
      );
      if (highDebt) risks.push('High debt-to-equity ratio');
    }

    return {
      strengths: strengths.length > 0 ? strengths : ['Moderate performance across metrics'],
      weaknesses: weaknesses.length > 0 ? weaknesses : ['Minor concerns in some areas'],
      catalysts: catalysts.length > 0 ? catalysts : ['Monitor for upcoming events'],
      risks: risks.length > 0 ? risks : ['Standard market risks apply']
    };
  }

  /**
   * Determine asset type from quote data
   */
  private determineAssetType(quote: any): 'stock' | 'crypto' | 'etf' | 'forex' {
    const quoteType = quote.quoteType?.toLowerCase() || '';
    if (quoteType.includes('etf')) return 'etf';
    if (quoteType.includes('cryptocurrency')) return 'crypto';
    if (quoteType.includes('currency')) return 'forex';
    return 'stock';
  }

  /**
   * Handle scorer errors gracefully
   */
  private handleScorerError(scorerName: string, error: any): any {
    logger.warn(`[UniversalEngine] ${scorerName} scorer failed:`, error.message);
    return {
      score: 50, // Neutral score on error
      grade: 'C',
      breakdown: [{ category: 'Error', value: 'N/A', interpretation: 'Data unavailable' }]
    };
  }

  /**
   * Generate unique audit ID
   */
  private generateAuditId(symbol: string): string {
    return `${symbol}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Log analysis to audit trail
   */
  private async logAnalysis(
    analysis: UnifiedAnalysisResponse,
    params: AnalysisParams,
    duration: number
  ): Promise<void> {
    try {
      const { analysisLogger } = await import('./analysis-logger');
      await analysisLogger.log({
        auditId: analysis.auditId,
        symbol: analysis.symbol,
        timestamp: analysis.timestamp,
        params,
        result: analysis,
        duration
      });
    } catch (error: any) {
      logger.error('[UniversalEngine] Failed to log audit trail:', error);
      // Don't throw - logging failure shouldn't break analysis
    }
  }
}

// Export singleton instance
export const universalEngine = new UniversalAnalysisEngine();
