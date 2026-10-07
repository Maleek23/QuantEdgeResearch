/**
 * NEXUS board filter state — one compact row (search · Day · Side · Grade A/B ·
 * Filters ▾) plus a Filters popover / phone sheet holding the rest (operator
 * 2026-10-07: "the filter bar is overwhelming"). Pure.
 *
 *   Row      search box · Day (Today · Week · All) · Side (All · Long · Short)
 *            · Grade A/B toggle · Filters (N) · count
 *   Popover  asset (Crypto · SPX) · Rotation · Recency (New · Top 10) ·
 *            published day (Yesterday / a date) · called-time range · show stale
 *            · view (list · grid · table) · Clear
 *
 * Defaults: Today, all sides, all grades, list view.
 */

export type BoardSide = 'all' | 'long' | 'short';
export type BoardRank = 'all' | 'new' | 'best' | 'conviction';
export type BoardView = 'list' | 'grid' | 'table';

export interface BoardFilterState {
  day: string;                 // 'today' | 'yesterday' | 'week' | 'all' | YYYY-MM-DD
  side: BoardSide;
  rank: BoardRank;
  query: string;
  cryptoOnly: boolean;
  spxOnly: boolean;
  withRotation: boolean;
  showStale: boolean;
  calledRange: { from: string | null; to: string | null } | null;
  view: BoardView;
}

export const BOARD_FILTER_DEFAULTS: BoardFilterState = Object.freeze({
  day: 'today', side: 'all', rank: 'all', query: '', cryptoOnly: false, spxOnly: false,
  withRotation: false, showStale: false, calledRange: { from: null, to: null }, view: 'list',
}) as BoardFilterState;

/** The three Day segments on the row; anything else (yesterday, a date) lives in the popover. */
export const DAY_SEGMENTS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'all', label: 'All' },
] as const;
export const isDaySegment = (d: string) => DAY_SEGMENTS.some((s) => s.key === d);

/** Which popover filters are active (the badge counts these; view is a layout, not a filter). */
export function popoverFilters(s: BoardFilterState): string[] {
  const out: string[] = [];
  if (s.cryptoOnly) out.push('crypto');
  if (s.spxOnly) out.push('spx');
  if (s.withRotation) out.push('rotation');
  if (s.rank === 'new' || s.rank === 'best') out.push(s.rank);
  if (!isDaySegment(s.day)) out.push(s.day === 'yesterday' ? 'yesterday' : 'date');
  if (s.calledRange && (s.calledRange.from || s.calledRange.to)) out.push('called');
  if (s.showStale) out.push('stale');
  return out;
}
export const activeFilterCount = (s: BoardFilterState) => popoverFilters(s).length;

/** "Clear" in the popover: the popover filters back to defaults; row choices (search, side, grade, day segment) kept. */
export function clearPopoverFilters(s: BoardFilterState): BoardFilterState {
  return {
    ...s,
    cryptoOnly: false, spxOnly: false, withRotation: false, showStale: false,
    calledRange: { from: null, to: null },
    rank: s.rank === 'conviction' ? 'conviction' : 'all',
    day: isDaySegment(s.day) ? s.day : 'today',
  };
}

/** Does today's resolved group show under this day filter? Today · Week · All — yes; Yesterday / a past date — no. */
export const showsResolvedToday = (day: string) => day === 'today' || day === 'week' || day === 'all';
