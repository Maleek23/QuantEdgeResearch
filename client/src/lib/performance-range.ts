/**
 * Journal › Performance date windows (audit 2026-10-01 P0 #75 / item 7).
 *
 * Outcomes before OUTCOME_BASELINE_DATE are invalid (outcome v2). "3 Months"
 * used to start 2026-07-01 and mix them in, while "All Time" silently meant
 * "since the baseline". Every window is clamped to the baseline, and the labels
 * say so.
 */
import { OUTCOME_BASELINE_DATE } from '../../../shared/constants';

export type PerfRange = 'today' | '7d' | '30d' | '3m' | 'all';

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const DAY = 86_400_000;

/** Start date (yyyy-mm-dd) for a window — never before the outcome baseline. */
export function performanceStartDate(range: PerfRange | string, now: Date = new Date()): string {
  let start: string;
  switch (range) {
    case 'today': start = ymd(now); break;
    case '7d': start = ymd(new Date(now.getTime() - 7 * DAY)); break;
    case '30d': start = ymd(new Date(now.getTime() - 30 * DAY)); break;
    case '3m': { const d = new Date(now); d.setUTCMonth(d.getUTCMonth() - 3); start = ymd(d); break; }
    default: start = OUTCOME_BASELINE_DATE;
  }
  return start < OUTCOME_BASELINE_DATE ? OUTCOME_BASELINE_DATE : start;
}

/** Clamp any yyyy-mm-dd start to the outcome baseline. */
export function clampToBaseline(start: string | null): string | null {
  if (!start) return start;
  return start < OUTCOME_BASELINE_DATE ? OUTCOME_BASELINE_DATE : start;
}

/** True when the window had to be cut at the baseline. */
export function isClampedToBaseline(range: PerfRange | string, now: Date = new Date()): boolean {
  if (range === 'all') return true;
  return performanceStartDate(range, now) === OUTCOME_BASELINE_DATE;
}

export const BASELINE_LABEL = (() => {
  const d = new Date(`${OUTCOME_BASELINE_DATE}T12:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
})();
