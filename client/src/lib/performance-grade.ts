/**
 * Performance-Based Grading System (v3.5.0 COLLEGE STYLE)
 * 
 * Uses standard college grading scale: A+, A, A-, B+, B, B-, C+, C, C-, D+, D, D-, F
 * 
 * Grading scale based on confidence/win rate expectations:
 * - A+ (97%+): Exceptional - extremely rare
 * - A  (93-96%): Excellent signals
 * - A- (90-92%): Very strong signals
 * - B+ (87-89%): Strong signals
 * - B  (83-86%): Good signals
 * - B- (80-82%): Above average
 * - C+ (77-79%): Average+
 * - C  (73-76%): Average
 * - C- (70-72%): Below average
 * - D+ (67-69%): Weak
 * - D  (63-66%): Poor
 * - D- (60-62%): Very poor
 * - F  (<60%): Failing/speculative
 * 
 * For trading, we map our 45-100 confidence range to this scale.
 */

/**
 * Get performance grade based on confidence score
 * Maps trading confidence (typically 45-75%) to college letter grades
 */
export function getPerformanceGrade(confidenceScore: number): {
  grade: string;
  color: string;
  expectedWinRate: number;
  description: string;
} {
  // A+ (75%+): Top tier - rare
  if (confidenceScore >= 75) {
    return {
      grade: 'A+',
      color: 'text-green-400',
      expectedWinRate: Math.round(confidenceScore),
      description: 'Exceptional',
    };
  }
  
  // A (70-74%): Excellent
  if (confidenceScore >= 70) {
    return {
      grade: 'A',
      color: 'text-green-500',
      expectedWinRate: Math.round(confidenceScore),
      description: 'Excellent',
    };
  }
  
  // A- (67-69%): Very strong
  if (confidenceScore >= 67) {
    return {
      grade: 'A-',
      color: 'text-green-500',
      expectedWinRate: Math.round(confidenceScore),
      description: 'Very strong',
    };
  }
  
  // B+ (64-66%): Strong
  if (confidenceScore >= 64) {
    return {
      grade: 'B+',
      color: 'text-blue-400',
      expectedWinRate: Math.round(confidenceScore),
      description: 'Strong',
    };
  }
  
  // B (60-63%): Good
  if (confidenceScore >= 60) {
    return {
      grade: 'B',
      color: 'text-blue-500',
      expectedWinRate: Math.round(confidenceScore),
      description: 'Good',
    };
  }
  
  // B- (57-59%): Above average
  if (confidenceScore >= 57) {
    return {
      grade: 'B-',
      color: 'text-blue-500',
      expectedWinRate: Math.round(confidenceScore),
      description: 'Above average',
    };
  }
  
  // C+ (54-56%): Average+
  if (confidenceScore >= 54) {
    return {
      grade: 'C+',
      color: 'text-cyan-500',
      expectedWinRate: Math.round(confidenceScore),
      description: 'Average+',
    };
  }
  
  // C (50-53%): Average
  if (confidenceScore >= 50) {
    return {
      grade: 'C',
      color: 'text-yellow-500',
      expectedWinRate: Math.round(confidenceScore),
      description: 'Average',
    };
  }
  
  // C- (47-49%): Below average
  if (confidenceScore >= 47) {
    return {
      grade: 'C-',
      color: 'text-yellow-500',
      expectedWinRate: Math.round(confidenceScore),
      description: 'Below average',
    };
  }
  
  // D+ (44-46%): Weak
  if (confidenceScore >= 44) {
    return {
      grade: 'D+',
      color: 'text-orange-500',
      expectedWinRate: Math.round(confidenceScore),
      description: 'Weak',
    };
  }
  
  // D (40-43%): Poor
  if (confidenceScore >= 40) {
    return {
      grade: 'D',
      color: 'text-orange-500',
      expectedWinRate: Math.round(confidenceScore),
      description: 'Poor',
    };
  }
  
  // F (<40%): Failing/speculative
  return {
    grade: 'F',
    color: 'text-red-500',
    expectedWinRate: Math.round(confidenceScore),
    description: 'Speculative',
  };
}

/**
 * Get confidence-based letter grade (college style)
 */
export function getConfidenceGrade(score: number): string {
  if (score >= 75) return 'A+';
  if (score >= 70) return 'A';
  if (score >= 67) return 'A-';
  if (score >= 64) return 'B+';
  if (score >= 60) return 'B';
  if (score >= 57) return 'B-';
  if (score >= 54) return 'C+';
  if (score >= 50) return 'C';
  if (score >= 47) return 'C-';
  if (score >= 44) return 'D+';
  if (score >= 40) return 'D';
  return 'F';
}
