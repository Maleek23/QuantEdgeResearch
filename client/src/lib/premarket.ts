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
import { nexusIdeaHref } from './nexus-link';

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

// ── Pre-market setups (server/premarket-ideas.ts) ─────────────────────────

/** Planned setup on a gapper, as /api/premarket/gappers attaches it. */
export interface PmSetupMark { kinds: string[]; status: 'watch' | 'triggered'; ideaId: string | null; summary: string }

/** Source record for pre-market ideas — resolved ideas only; LOW N under 20. */
export interface PmRecord { n: number; wins: number; losses: number; other: number; open: number; winRate: number | null; lowN: boolean; label: 'measuring' }

export const PM_SETUP_SHORT: Record<string, string> = { gap_and_go: 'go', gap_fill_fade: 'fade', pm_break: 'break' };

/** "setup" marker text: "go·fade" for a WATCH, "go ✓" once triggered. */
export function pmSetupMarker(m: PmSetupMark): string {
  const k = m.kinds.map((x) => PM_SETUP_SHORT[x] ?? x).join('·');
  return m.status === 'triggered' ? `${k} ✓` : k;
}

/**
 * A WATCH plan is not a NEXUS idea: server/premarket-ideas.ts publishes through
 * createTradeIdea only when a plan TRIGGERS (09:30–10:30 ET, ≤ 5/day, one per symbol,
 * never on top of another engine's open idea). Before that the marker links to the
 * ticker and says so — sending it to NEXUS opened a board that had no such setup.
 */
export function pmSetupIsIdea(m: PmSetupMark): boolean {
  return m.status === 'triggered' && !!m.ideaId;
}
export function pmSetupHref(symbol: string, m: PmSetupMark): string {
  return pmSetupIsIdea(m) ? nexusIdeaHref({ ideaId: m.ideaId, symbol }) : `/r/${encodeURIComponent(symbol.toUpperCase())}`;
}
export function pmSetupLabel(m: PmSetupMark): string {
  return pmSetupIsIdea(m) ? `setup ${pmSetupMarker(m)}` : `watch ${pmSetupMarker(m)} — not a NEXUS idea`;
}
export function pmSetupTitle(m: PmSetupMark): string {
  return pmSetupIsIdea(m)
    ? `Pre-market setup — triggered and published, open in NEXUS: ${m.summary} · measuring (unproven)`
    : `Pre-market WATCH plan for the open — not a NEXUS idea yet. It is published to NEXUS only if it triggers 09:30–10:30 ET (max 5 a day). ${m.summary} · measuring (unproven)`;
}

/** One line for the record: never a bare win rate without its n. */
export function pmRecordLine(r: PmRecord | null | undefined): string {
  if (!r) return 'pre-market setups · measuring';
  if (r.n === 0) return `pre-market setups · no resolved ideas yet${r.open ? ` (${r.open} open)` : ''} · measuring`;
  return `pre-market setups · ${r.wins}W/${r.losses}L${r.other ? `/${r.other} flat` : ''} n=${r.n}${r.winRate != null ? ` · ${r.winRate}%` : ''}${r.lowN ? ' · LOW N' : ''} · measuring`;
}
