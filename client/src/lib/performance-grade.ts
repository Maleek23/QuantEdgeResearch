/**
 * Performance-Based Grading System (v3.4.0 RECALIBRATED)
 * 
 * Unlike confidence-based grading, this system grades trade ideas based on
 * ACTUAL WIN RATES from historical data. This provides a more honest assessment
 * of signal quality.
 * 
 * v3.4.0 RECALIBRATION: Confidence scoring system was inverted (90-100% confidence
 * had 15.6% actual WR, <60% confidence had 63% WR). System now uses 45-65 score range
 * where confidence scores MATCH actual expected win rates.
 * 
 * Data-driven thresholds based on v3.4.0 recalibration:
 * - A (65%): Top signals (RSI(2) strong) - ~65% expected WR
 * - B+ (60-64%): Strong signals (RSI(2) moderate, VWAP strong) - ~60% expected WR
 * - B (55-59%): Good signals (VWAP moderate) - ~55% expected WR
 * - C+ (50-54%): Fair signals (Volume Spike strong) - ~50% expected WR
 * - C (45-49%): Weak signals (Volume Spike moderate) - ~45% expected WR
 * - D (<45%): Very weak signals - <45% expected WR
 */

/**
 * Get performance grade based on ACTUAL EXPECTED WIN RATE
 * v3.4.0: Calibrated to new 45-65 confidence range where score = expected WR
 */
export function getPerformanceGrade(confidenceScore: number): {
  grade: string;
  color: string;
  expectedWinRate: number;
  description: string;
} {
  // v3.4.0: Recalibrated for 45-65 score range
  // Confidence scores now directly represent expected win rates
  
  // A (65%): Top tier signals
  if (confidenceScore >= 65) {
    return {
      grade: 'A',
      color: 'text-green-500',
      expectedWinRate: Math.round(confidenceScore),
      description: 'Top signals',
    };
  }
  
  // B+ (60-64%): Strong signals
  if (confidenceScore >= 60) {
    return {
      grade: 'B+',
      color: 'text-blue-500',
      expectedWinRate: Math.round(confidenceScore),
      description: 'Strong signals',
    };
  }
  
  // B (55-59%): Good signals
  if (confidenceScore >= 55) {
    return {
      grade: 'B',
      color: 'text-blue-500',
      expectedWinRate: Math.round(confidenceScore),
      description: 'Good signals',
    };
  }
  
  // C+ (50-54%): Fair signals
  if (confidenceScore >= 50) {
    return {
      grade: 'C+',
      color: 'text-yellow-500',
      expectedWinRate: Math.round(confidenceScore),
      description: 'Fair signals',
    };
  }
  
  // C (45-49%): Weak signals
  if (confidenceScore >= 45) {
    return {
      grade: 'C',
      color: 'text-yellow-500',
      expectedWinRate: Math.round(confidenceScore),
      description: 'Weak signals',
    };
  }
  
  // D (<45%): Very weak signals
  // v3.4.0: Score = expected WR (no artificial floor)
  return {
    grade: 'D',
    color: 'text-red-500',
    expectedWinRate: Math.round(confidenceScore),
    description: 'Very weak',
  };
}

/**
 * Get confidence-based letter grade (v3.4.0 system)
 */
export function getConfidenceGrade(score: number): string {
  if (score >= 65) return 'A';
  if (score >= 60) return 'B+';
  if (score >= 55) return 'B';
  if (score >= 50) return 'C+';
  if (score >= 45) return 'C';
  return 'D';
}
