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
  /**
   * False when the scorer produced no reading at all.
   *
   * This stub returned score 50 and carried its full 10% weight in
   * CATEGORY_WEIGHTS, which is not neutral — it pulled every grade toward 50 by
   * a tenth. A genuinely strong name scoring 85 across six real categories came
   * out at 81.5 purely because a seventh had nothing to say. The engine now
   * renormalises over available categories instead of counting a non-reading as
   * a vote for the middle.
   */
  available?: boolean;
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
      available: false,
    };
  }
};
