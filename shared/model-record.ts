/**
 * MODEL RECORD — the one "how has the model done" number.
 * =======================================================
 * Consistency audit 2026-09-29 found five public win rates for the same book at
 * the same moment (prod, 23:15 UTC):
 *   /api/dashboard/stats             23.0%  (65/282,  v1 hit_target, all time)
 *   /api/performance/stats           22.8%  (winRateDecided 281, mixed populations)
 *   /api/performance/unified-win-rate 43.4% (102/235, ±3% threshold, all time)
 *   /api/performance/auto-lotto-bot  31.6%  (12/38, every user's paper book)
 *   operator's honest baseline       42%    (n=88, since 2026-08-26)
 * Different win definitions, different populations, and — the invalidating one —
 * most of them span OUTCOME_BASELINE_DATE, before which the stats layer erased
 * sub-3% stop-outs (memory: pre-2026-08-26 outcomes are invalid).
 *
 * This module fixes the definition for every "model record" surface:
 *   population  published ideas with timestamp >= OUTCOME_BASELINE_DATE,
 *               excluding excludeFromTraining and synthetic backfill rows
 *   win / loss  classifyOutcomeV2 (target, stop, or MEASURED close/expiry by P&L sign;
 *               unmeasured expiries, missed entries, unit-corrupted options = unresolved)
 *   winRate     reportableRate(wins, decided) — null under MIN_REPORTABLE_SAMPLE
 *   expectancy  mean realisedR over resolved ideas (R = P&L ÷ 50% premium risk)
 *   coverage    decided / total — shown beside the rate, never hidden
 */
import {
  OUTCOME_BASELINE_DATE, MIN_REPORTABLE_SAMPLE, classifyOutcomeV2, realisedR, reportableRate,
  type OutcomeV2Input,
} from './constants';

export interface RecordIdea extends OutcomeV2Input {
  timestamp?: string | Date | null;
  excludeFromTraining?: boolean | null;
  dataSourceUsed?: string | null;
  source?: string | null;
  riskRewardRatio?: number | null;
}

export interface ModelRecord {
  since: string;
  definition: 'outcome-v2';
  total: number;
  wins: number;
  losses: number;
  unresolved: number;
  decided: number;
  /** Percent, or null when decided < sampleFloor. */
  winRate: number | null;
  /** Mean realised R, null when no resolved idea carries P&L. */
  expectancyR: number | null;
  rSampleSize: number;
  /** decided / total, percent. */
  coveragePct: number;
  sampleFloor: number;
  excluded: { beforeBaseline: number; excludedFromTraining: number; synthetic: number };
}

/** Rows the option backfill wrote with modelled (not observed) outcomes. */
export function isSyntheticOutcome(i: { dataSourceUsed?: string | null }): boolean {
  return String(i.dataSourceUsed ?? '').toLowerCase().includes('synthetic');
}

function tsMs(t: RecordIdea['timestamp']): number {
  if (t == null) return NaN;
  return t instanceof Date ? t.getTime() : Date.parse(String(t));
}

export function computeModelRecord(
  ideas: RecordIdea[],
  opts: { since?: string; sampleFloor?: number } = {},
): ModelRecord {
  const since = opts.since ?? OUTCOME_BASELINE_DATE;
  const floor = opts.sampleFloor ?? MIN_REPORTABLE_SAMPLE;
  const sinceMs = Date.parse(`${since}T00:00:00-04:00`);
  const excluded = { beforeBaseline: 0, excludedFromTraining: 0, synthetic: 0 };
  let wins = 0; let losses = 0; let unresolved = 0;
  const rs: number[] = [];
  for (const i of ideas) {
    const t = tsMs(i.timestamp);
    if (!(t >= sinceMs)) { excluded.beforeBaseline++; continue; }
    if (i.excludeFromTraining) { excluded.excludedFromTraining++; continue; }
    if (isSyntheticOutcome(i)) { excluded.synthetic++; continue; }
    const o = classifyOutcomeV2(i);
    if (o === 'win') wins++; else if (o === 'loss') losses++; else unresolved++;
    const r = realisedR(i);
    if (r != null && Number.isFinite(r)) rs.push(r);
  }
  const decided = wins + losses;
  const total = decided + unresolved;
  return {
    since,
    definition: 'outcome-v2',
    total, wins, losses, unresolved, decided,
    winRate: reportableRate(wins, decided, floor),
    expectancyR: rs.length ? Math.round((rs.reduce((a, b) => a + b, 0) / rs.length) * 1000) / 1000 : null,
    rSampleSize: rs.length,
    coveragePct: total ? Math.round((decided / total) * 1000) / 10 : 0,
    sampleFloor: floor,
    excluded,
  };
}

/** ET calendar date (YYYY-MM-DD) of an instant — the platform's "day" for P&L buckets. */
export function etDateKey(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}
