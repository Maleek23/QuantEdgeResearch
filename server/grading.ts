/**
 * Performance-Based Grading System (v3.5.0 STANDARD ACADEMIC SCALE)
 * 
 * Standard academic grading scale used across ALL platform components:
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
 * - F  = <60%   (Failing)
 */

export interface GradeResult {
  grade: string;
  description: string;
}

/**
 * Get academic grade from a score (0-100 scale)
 */
export function getAcademicGrade(score: number): GradeResult {
  if (score >= 95) return { grade: 'A+', description: 'Exceptional' };
  if (score >= 93) return { grade: 'A', description: 'Excellent' };
  if (score >= 90) return { grade: 'A-', description: 'Very strong' };
  if (score >= 87) return { grade: 'B+', description: 'Strong' };
  if (score >= 83) return { grade: 'B', description: 'Good' };
  if (score >= 80) return { grade: 'B-', description: 'Above average' };
  if (score >= 77) return { grade: 'C+', description: 'Average+' };
  if (score >= 73) return { grade: 'C', description: 'Average' };
  if (score >= 70) return { grade: 'C-', description: 'Passing' };
  if (score >= 67) return { grade: 'D+', description: 'Below average' };
  if (score >= 63) return { grade: 'D', description: 'Poor' };
  if (score >= 60) return { grade: 'D-', description: 'Minimal pass' };
  return { grade: 'F', description: 'Failing' };
}

/**
 * Get letter grade only (shorthand)
 */
export function getLetterGrade(score: number): string {
  return getAcademicGrade(score).grade;
}

/**
 * Convert win rate to academic grade
 * Win rate is already on 0-100 scale
 */
export function getWinRateGrade(winRate: number): string {
  return getLetterGrade(winRate);
}

/**
 * Convert confidence score to academic grade
 * Confidence is already on 0-100 scale
 */
export function getConfidenceGrade(confidence: number): string {
  return getLetterGrade(confidence);
}

/**
 * Convert reliability score to academic grade
 * Reliability is already on 0-100 scale
 */
export function getReliabilityGrade(reliability: number): string {
  return getLetterGrade(reliability);
}
