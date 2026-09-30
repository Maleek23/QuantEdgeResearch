/**
 * Pre-market gap read — pure helpers for the Today "Pre-market" strip.
 *
 * Operator rule (memory: feedback_premarket_signal): the pre-market gap is a
 * LEADING direction read before the open. A gap in an idea's direction is
 * confirmation ("still on the wave"); a gap against it means the setup may
 * already have moved without you. Shorts and longs are read symmetrically.
 *
 * Window: 04:00–09:30 ET, Monday–Friday (exchange holidays are not modelled —
 * on a holiday the strip shows but the server phase says "closed").
 */

const etParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Minutes since midnight ET and the ET weekday ('Mon'…'Sun'). */
export function etClock(now: Date): { weekday: string; minutes: number } {
  const p = etParts.formatToParts(now);
  const weekday = p.find((x) => x.type === 'weekday')?.value ?? '';
  const h = Number(p.find((x) => x.type === 'hour')?.value ?? NaN);
  const m = Number(p.find((x) => x.type === 'minute')?.value ?? NaN);
  return { weekday, minutes: h * 60 + m };
}

export const PREMARKET_OPEN_MIN = 4 * 60;
export const REGULAR_OPEN_MIN = 9 * 60 + 30;

/** True 04:00 ≤ ET < 09:30 on a weekday. */
export function isPreMarketWindow(now: Date): boolean {
  const { weekday, minutes } = etClock(now);
  if (weekday === 'Sat' || weekday === 'Sun' || !Number.isFinite(minutes)) return false;
  return minutes >= PREMARKET_OPEN_MIN && minutes < REGULAR_OPEN_MIN;
}

export type GapPhase = 'pre_market' | 'regular' | 'post_market' | 'closed';

/** What `gapPct` measures in each server phase (server/pre-market-service.ts). */
export const GAP_BASIS: Record<GapPhase, string> = {
  pre_market: 'pre-market price vs prior close',
  regular: "today's open vs prior close",
  post_market: 'after-hours price vs the regular close',
  closed: 'last session vs prior close',
};

/** |gap| under this is noise, not a read (same threshold as the server's gapDirection). */
export const GAP_FLAT_PCT = 0.5;

export type GapAlignment = 'confirms' | 'against' | 'flat';

/** How a gap reads against an idea's direction. */
export function gapAlignment(gapPct: number, direction: 'long' | 'short' | string | null | undefined): GapAlignment {
  if (!Number.isFinite(gapPct) || Math.abs(gapPct) < GAP_FLAT_PCT || (direction !== 'long' && direction !== 'short')) return 'flat';
  const up = gapPct > 0;
  return (direction === 'long') === up ? 'confirms' : 'against';
}

/** Order for the strip: names in the book first, then the weekly watchlist, then by |gap|. */
export function rankGappers<T extends { symbol: string; gapPct: number; isWeekly?: boolean }>(rows: T[], inBook: (sym: string) => boolean): T[] {
  const tier = (r: T) => (inBook(r.symbol) ? 0 : r.isWeekly ? 1 : 2);
  return [...rows].sort((a, b) => tier(a) - tier(b) || Math.abs(b.gapPct) - Math.abs(a.gapPct) || a.symbol.localeCompare(b.symbol));
}
