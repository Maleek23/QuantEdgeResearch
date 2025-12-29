/**
 * Performance-Based Grading System (v3.5.0 STANDARD ACADEMIC SCALE)
 * 
 * Standard academic grading scale:
 * - A+ = 95%+   (Exceptional)
 * - A  = 93-94% (Excellent)
 * - A- = 90-92% (Very strong)
 * - B+ = 87-89% (Strong)
 * - B  = 83-86% (Good)
 * - B- = 80-82% (Above average)
 * - C+ = 77-79% (Average+)
 * - C  = 73-76% (Average)
 * - C- = 70-72% (Passing)
 * - D+ = 67-69% (Below average)
 * - D  = 63-66% (Poor)
 * - D- = 60-62% (Minimal pass)
 * - F  = <45%   (Failing)
 */

/**
 * Get performance grade based on confidence score
 * Uses standard academic grading scale
 */
export function getPerformanceGrade(confidenceScore: number): {
  grade: string;
  color: string;
  expectedWinRate: number;
  description: string;
} {
  // A+ (95%+): Exceptional
  if (confidenceScore >= 95) {
    return {
      grade: 'A+',
      color: 'text-green-400',
      expectedWinRate: Math.round(confidenceScore),
      description: 'Exceptional',
    };
  }
  
  // A (93-94%): Excellent
  if (confidenceScore >= 93) {
    return {
      grade: 'A',
      color: 'text-green-500',
      expectedWinRate: Math.round(confidenceScore),
      description: 'Excellent',
    };
  }
  
  // A- (90-92%): Very strong
  if (confidenceScore >= 90) {
    return {
      grade: 'A-',
      color: 'text-green-500',
      expectedWinRate: Math.round(confidenceScore),
      description: 'Very strong',
    };
  }
  
  // B+ (87-89%): Strong
  if (confidenceScore >= 87) {
    return {
      grade: 'B+',
      color: 'text-blue-400',
      expectedWinRate: Math.round(confidenceScore),
      description: 'Strong',
    };
  }
  
  // B (83-86%): Good
  if (confidenceScore >= 83) {
    return {
      grade: 'B',
      color: 'text-blue-500',
      expectedWinRate: Math.round(confidenceScore),
      description: 'Good',
    };
  }
  
  // B- (80-82%): Above average
  if (confidenceScore >= 80) {
    return {
      grade: 'B-',
      color: 'text-blue-500',
      expectedWinRate: Math.round(confidenceScore),
      description: 'Above average',
    };
  }
  
  // C+ (77-79%): Average+
  if (confidenceScore >= 77) {
    return {
      grade: 'C+',
      color: 'text-cyan-500',
      expectedWinRate: Math.round(confidenceScore),
      description: 'Average+',
    };
  }
  
  // C (73-76%): Average
  if (confidenceScore >= 73) {
    return {
      grade: 'C',
      color: 'text-yellow-500',
      expectedWinRate: Math.round(confidenceScore),
      description: 'Average',
    };
  }
  
  // C- (70-72%): Passing
  if (confidenceScore >= 70) {
    return {
      grade: 'C-',
      color: 'text-yellow-500',
      expectedWinRate: Math.round(confidenceScore),
      description: 'Passing',
    };
  }
  
  // D+ (67-69%): Below average
  if (confidenceScore >= 67) {
    return {
      grade: 'D+',
      color: 'text-orange-500',
      expectedWinRate: Math.round(confidenceScore),
      description: 'Below average',
    };
  }
  
  // D (63-66%): Poor
  if (confidenceScore >= 63) {
    return {
      grade: 'D',
      color: 'text-orange-500',
      expectedWinRate: Math.round(confidenceScore),
      description: 'Poor',
    };
  }
  
  // D- (60-62%): Minimal pass
  if (confidenceScore >= 60) {
    return {
      grade: 'D-',
      color: 'text-orange-500',
      expectedWinRate: Math.round(confidenceScore),
      description: 'Minimal pass',
    };
  }
  
  // F (<45%): Failing
  return {
    grade: 'F',
    color: 'text-red-500',
    expectedWinRate: Math.round(confidenceScore),
    description: 'Failing',
  };
}

/**
 * Get confidence-based letter grade (standard academic scale)
 */
export function getConfidenceGrade(score: number): string {
  if (score >= 95) return 'A+';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  if (score >= 70) return 'C-';
  if (score >= 67) return 'D+';
  if (score >= 63) return 'D';
  if (score >= 60) return 'D-';
  return 'F';
}
