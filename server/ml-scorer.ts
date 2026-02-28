/**
 * ML Scorer stub — placeholder for future ML-based scoring
 * Returns neutral scores until ML models are trained
 */

import { logger } from './logger';

interface MLResult {
  score: number;
  breakdown: {
    category: string;
    value: number | string;
    interpretation: string;
  }[];
  confidence: number;
}

export const mlScorer = {
  async score(symbol: string): Promise<MLResult> {
    logger.debug(`[ML-SCORER] Returning neutral score for ${symbol} (ML models not yet trained)`);
    return {
      score: 50,
      breakdown: [
        { category: 'ML Prediction', value: 'neutral', interpretation: 'ML scoring not yet available' },
      ],
      confidence: 0,
    };
  }
};
