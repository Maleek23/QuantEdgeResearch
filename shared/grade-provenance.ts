export type GradeCohort = 'certified' | 'legacy-stored' | 'replay';

export interface GradeProvenanceInput {
  timestamp?: string | null;
  genConvictionScore?: number | null;
  genConvictionBand?: string | null;
  generationTimestamp?: string | null;
  engineVersion?: string | null;
}

/** A stored grade is headline-eligible only when its point-in-time provenance is complete. */
export function classifyGradeCohort(idea: GradeProvenanceInput): GradeCohort {
  const hasStoredGrade = Number.isFinite(idea.genConvictionScore) && Boolean(idea.genConvictionBand);
  if (!hasStoredGrade) return 'replay';
  if (!idea.generationTimestamp || !idea.engineVersion || idea.engineVersion === 'local-unversioned') {
    return 'legacy-stored';
  }
  const ideaTime = Date.parse(idea.timestamp ?? '');
  const scoredTime = Date.parse(idea.generationTimestamp);
  if (!Number.isFinite(ideaTime) || !Number.isFinite(scoredTime)) return 'legacy-stored';
  return Math.abs(scoredTime - ideaTime) <= 24 * 60 * 60 * 1000 ? 'certified' : 'legacy-stored';
}
