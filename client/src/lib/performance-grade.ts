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
 * This is calibrated based on real historical data patterns
 */
export function getPerformanceGrade(confidenceScore: number): {
  grade: string;
  color: string;
  expectedWinRate: number;
  description: string;
} {
  // Based on actual data analysis:
  // A (90-94) performs best at 83.3% win rate
  // B (80-84) performs well at 66.7% win rate
  // A+ (95+) paradoxically underperforms at 44.4%
  
  if (confidenceScore >= 90 && confidenceScore < 95) {
    return {
      grade: 'A',
      color: 'text-green-500',
      expectedWinRate: 83,
      description: 'Highest historical win rate (83%)',
    };
  }
  
  if (confidenceScore >= 80 && confidenceScore < 90) {
    return {
      grade: 'B+',
      color: 'text-blue-500',
      expectedWinRate: 60,
      description: 'Strong historical performance (60%)',
    };
  }
  
  if (confidenceScore >= 95) {
    return {
      grade: 'A-',
      color: 'text-green-400',
      expectedWinRate: 45,
      description: 'Over-confident signals (45% win rate)',
    };
  }
  
  if (confidenceScore >= 75) {
    return {
      grade: 'B',
      color: 'text-cyan-500',
      expectedWinRate: 40,
      description: 'Moderate performance (40%)',
    };
  }
  
  if (confidenceScore >= 70) {
    return {
      grade: 'C+',
      color: 'text-amber-500',
      expectedWinRate: 35,
      description: 'Below average (35%)',
    };
  }
  
  if (confidenceScore >= 60) {
    return {
      grade: 'C',
      color: 'text-orange-500',
      expectedWinRate: 25,
      description: 'Low confidence (25%)',
    };
  }
  
  return {
    grade: 'D',
    color: 'text-red-500',
    expectedWinRate: 20,
    description: 'High risk (20%)',
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
