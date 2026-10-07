/**
 * CATCH-LEADERS CADENCE — when the main stock scanner and the leadership scans run.
 *
 * 2026-10-06 the quant sweep's only passes that reached AMD/AAOI/ZS/CRWD logged at
 * 14:58 and 15:30 ET, hours after the moves. Slots (ET, weekdays):
 *   pre-market  08:45, 09:20
 *   open        09:35, 09:50, 10:05, 10:20, 10:40, 11:00
 *   then        every 30 min, 11:30 → 15:30
 * quant runs ON the slot; session leaders +2 min (in session from 09:50 only — the
 * 15-min opening range must be complete); leader-swing +4 min. All three go through
 * the heavy gate; the open quiet window (09:30–09:45) still defers the heavy ones.
 */

/** ET minute-of-day of every quant slot. */
export const CATCH_SLOTS_ET: readonly number[] = [
  8 * 60 + 45, 9 * 60 + 20,
  9 * 60 + 35, 9 * 60 + 50, 10 * 60 + 5, 10 * 60 + 20, 10 * 60 + 40, 11 * 60,
  ...Array.from({ length: 9 }, (_, i) => 11 * 60 + 30 + 30 * i), // 11:30 … 15:30
];

/** First ET minute the leaders pass can do anything (09:30 + 15-min OR + one closed bar). */
export const LEADERS_FIRST_ET = 9 * 60 + 50;

/** Group minutes into cron expressions (one per hour; weekdays). */
export function cronFor(minutes: readonly number[]): string[] {
  const byHour = new Map<number, number[]>();
  for (const m of minutes) {
    const h = Math.floor(m / 60); const mm = m % 60;
    byHour.set(h, [...(byHour.get(h) ?? []), mm]);
  }
  return Array.from(byHour.entries()).sort((a, b) => a[0] - b[0])
    .map(([h, mins]) => `${Array.from(new Set(mins)).sort((a, b) => a - b).join(',')} ${h} * * 1-5`);
}

const shift = (xs: readonly number[], k: number) => xs.map((m) => m + k);

export const LEADERS_SLOTS_ET: readonly number[] = shift(CATCH_SLOTS_ET, 2).filter((m) => m >= LEADERS_FIRST_ET);
export const LEADER_SWING_SLOTS_ET: readonly number[] = shift(CATCH_SLOTS_ET, 4);

export const CATCH_SLOTS_CRON = cronFor(CATCH_SLOTS_ET);
export const LEADERS_SLOTS_CRON = cronFor(LEADERS_SLOTS_ET);
export const LEADER_SWING_SLOTS_CRON = cronFor(LEADER_SWING_SLOTS_ET);
