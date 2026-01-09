/**
 * Server Grading Module
 * 
 * Re-exports the unified grading contract from @shared/grading
 * This ensures all server-side grading uses the same logic as the client.
 */

export {
  type GradeLetter,
  type GradeInfo,
  type SignalQuality,
  GRADE_THRESHOLDS,
  scoreToGrade,
  getLetterGrade,
  isTradeableGrade,
  isEliteGrade,
  getGradeStyle,
  getSignalQuality,
  getCombinedGrade,
} from '../shared/grading';

// Legacy aliases for backward compatibility
export function getAcademicGrade(score: number) {
  const { scoreToGrade } = require('../shared/grading');
  const result = scoreToGrade(score);
  return { grade: result.grade, description: result.description };
}

export function getWinRateGrade(winRate: number): string {
  const { getLetterGrade } = require('../shared/grading');
  return getLetterGrade(winRate);
}

export function getConfidenceGrade(confidence: number): string {
  const { getLetterGrade } = require('../shared/grading');
  return getLetterGrade(confidence);
}

export function getReliabilityGrade(reliability: number): string {
  const { getLetterGrade } = require('../shared/grading');
  return getLetterGrade(reliability);
}

// Type re-export for legacy code
export interface GradeResult {
  grade: string;
  description: string;
}
