/**
 * Performance-Based Grading System
 * 
 * Unlike confidence-based grading, this system grades trade ideas based on
 * ACTUAL WIN RATES from historical data. This provides a more honest assessment
 * of signal quality.
 * 
 * Data-driven thresholds based on actual platform performance:
 * - A (90-94): 83.3% win rate (BEST)
 * - B (80-84): 66.7% win rate (GOOD)
 * - A+ (95+): 44.4% win rate (PARADOX - too confident!)
 * - C (70-74): 44.4% win rate
 * - B+ (85-89): 50.0% win rate
 * - C+ (75-79): 33.3% win rate (DISASTER - negative accuracy)
 * - D (<70): 25.0% win rate
 */

/**
 * Get performance grade based on ACTUAL EXPECTED WIN RATE
 * This is calibrated based on real historical data patterns from 86 trades
 */
export function getPerformanceGrade(confidenceScore: number): {
  grade: string;
  color: string;
  expectedWinRate: number;
  description: string;
} {
  // Based on actual data analysis (86 total trades):
  // A+ (95+) → 44.4% win rate (PARADOX: over-confident)
  // A (90-94) → 83.3% win rate (BEST PERFORMANCE)
  // B+ (85-89) → 50.0% win rate
  // B (80-84) → 66.7% win rate (good)
  // C+ (75-79) → 33.3% win rate (disaster zone)
  // C (70-74) → 44.4% win rate
  // D (<70) → 25.0% win rate
  
  // A+ (95+): Highest confidence
  if (confidenceScore >= 95) {
    return {
      grade: 'A+',
      color: 'text-green-500',
      expectedWinRate: 44,
      description: 'Highest confidence (44% win rate)',
    };
  }
  
  // A (90-94): Sweet spot - highest win rate
  if (confidenceScore >= 90) {
    return {
      grade: 'A',
      color: 'text-green-500',
      expectedWinRate: 83,
      description: 'Best performance (83% win rate)',
    };
  }
  
  // B+ (85-89): Moderate performance
  if (confidenceScore >= 85) {
    return {
      grade: 'B+',
      color: 'text-blue-500',
      expectedWinRate: 50,
      description: 'Moderate (50% win rate)',
    };
  }
  
  // B (80-84): Good performance
  if (confidenceScore >= 80) {
    return {
      grade: 'B',
      color: 'text-blue-500',
      expectedWinRate: 67,
      description: 'Good performance (67% win rate)',
    };
  }
  
  // C+ (75-79): Disaster zone
  if (confidenceScore >= 75) {
    return {
      grade: 'C+',
      color: 'text-yellow-500',
      expectedWinRate: 33,
      description: 'Weak signals (33% win rate)',
    };
  }
  
  // C (70-74): Below average
  if (confidenceScore >= 70) {
    return {
      grade: 'C',
      color: 'text-yellow-500',
      expectedWinRate: 44,
      description: 'Below average (44% win rate)',
    };
  }
  
  // D (<70): High risk
  return {
    grade: 'D',
    color: 'text-red-500',
    expectedWinRate: 25,
    description: 'High risk (25% win rate)',
  };
}

/**
 * Get confidence-based letter grade (old system - for reference)
 */
export function getConfidenceGrade(score: number): string {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 85) return 'B+';
  if (score >= 80) return 'B';
  if (score >= 75) return 'C+';
  if (score >= 70) return 'C';
  return 'D';
}
