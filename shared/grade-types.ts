/**
 * Grading System Types
 *
 * Types for the QuantEdge stock grading system
 */

export type GradeLetter = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface GradeConfig {
  S: { min: 90; max: 100; label: 'Exceptional'; color: 'purple' };
  A: { min: 80; max: 89; label: 'Excellent'; color: 'green' };
  B: { min: 70; max: 79; label: 'Good'; color: 'blue' };
  C: { min: 60; max: 69; label: 'Fair'; color: 'yellow' };
  D: { min: 50; max: 59; label: 'Poor'; color: 'orange' };
  F: { min: 0; max: 49; label: 'Failing'; color: 'red' };
}

export interface GradeWeights {
  technical: number; // Default: 0.40
  fundamental: number; // Default: 0.35
  sentiment: number; // Default: 0.15
  ai: number; // Default: 0.10
}
export const FUNDAMENTAL_CATEGORY_WEIGHTS = {
  'Financial Health': 0.35,
  'Valuation': 0.25,
  'Growth': 0.20,
  'Dividend': 0.10,
  'Quality': 0.10,
};

export function scoreToGrade(score: number): GradeLetter {
  if (score >= 90) return 'S';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}
