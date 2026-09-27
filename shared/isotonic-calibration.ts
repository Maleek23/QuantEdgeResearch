export interface CalibrationObservation {
  score: number;
  winRate: number;
  sampleSize: number;
}

export interface CalibrationPoint {
  score: number;
  calibratedWinRate: number;
}

/** Weighted pool-adjacent-violators regression for a monotone confidence map. */
export function buildMonotoneCalibration(
  observations: readonly CalibrationObservation[],
): CalibrationPoint[] {
  const sorted = [...observations]
    .filter((p) => Number.isFinite(p.score) && Number.isFinite(p.winRate) && p.sampleSize > 0)
    .sort((a, b) => a.score - b.score);
  const blocks: Array<{ start: number; end: number; weight: number; mean: number }> = [];

  sorted.forEach((point, index) => {
    blocks.push({ start: index, end: index, weight: point.sampleSize, mean: point.winRate });
    while (blocks.length > 1 && blocks[blocks.length - 2].mean > blocks[blocks.length - 1].mean) {
      const right = blocks.pop()!;
      const left = blocks.pop()!;
      const weight = left.weight + right.weight;
      blocks.push({
        start: left.start,
        end: right.end,
        weight,
        mean: ((left.mean * left.weight) + (right.mean * right.weight)) / weight,
      });
    }
  });

  const fitted = new Array<number>(sorted.length);
  blocks.forEach((block) => {
    for (let i = block.start; i <= block.end; i += 1) fitted[i] = block.mean;
  });
  return sorted.map((point, index) => ({ score: point.score, calibratedWinRate: fitted[index] }));
}

export function interpolateCalibration(curve: readonly CalibrationPoint[], rawScore: number): number {
  if (!curve.length) return 0;
  const score = Math.max(curve[0].score, Math.min(curve[curve.length - 1].score, rawScore));
  const upperIndex = curve.findIndex((point) => point.score >= score);
  if (upperIndex <= 0) return Math.round(curve[0].calibratedWinRate);
  const lower = curve[upperIndex - 1];
  const upper = curve[upperIndex];
  const span = upper.score - lower.score || 1;
  const value = lower.calibratedWinRate + ((score - lower.score) / span) * (upper.calibratedWinRate - lower.calibratedWinRate);
  return Math.round(value);
}
