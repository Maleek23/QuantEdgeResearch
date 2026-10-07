/**
 * Client side of the carry-over policy (shared/setup-lifecycle.ts,
 * docs/SETUP_LIFECYCLE.md): one lifecycle read per open idea, from the LIVE
 * quote when the batch answered (stamped with its own age) and the board's
 * build-time price otherwise (stamped with the board's age) — never a
 * publish-time value presented as current.
 *
 * NEXUS and Today call this with the same live-book picks, so they share one
 * /api/quotes/batch request and order the book identically.
 */
import { useMemo } from 'react';
import { useQuotes } from '@/components/ticker/ticker-data';
import { compareBoardRows } from '@shared/board-sort';
import { gradeFromLife, gradeSortValue, type NexusGrade } from '@shared/nexus-grade';
import { setupLifecycle, sinkByLifecycle, type LifecycleRead } from '@shared/setup-lifecycle';
import { isLiveBookPick, type ConvictionPick } from '@/lib/convictions';

export interface LiveMark { price: number; asOf: string | null; basis: 'live quote' | 'board read' }
export interface SetupLife { life: LifecycleRead; mark: LiveMark | null }

/** Live-book symbols — /api/quotes/batch serves at most 50 per request; the rest use the board read (stamped). */
const QUOTE_CAP = 50;

export function liveMarkFor(pick: Pick<ConvictionPick, 'symbol' | 'currentPrice'>, quotes: Record<string, { price: number; asOf: string | null }> | undefined, boardAsOf: string | null | undefined): LiveMark | null {
  const q = quotes?.[pick.symbol.toUpperCase()];
  if (q && Number.isFinite(q.price) && q.price > 0) return { price: q.price, asOf: q.asOf ?? null, basis: 'live quote' };
  const px = Number(pick.currentPrice);
  return Number.isFinite(px) && px > 0 ? { price: px, asOf: boardAsOf ?? null, basis: 'board read' } : null;
}

export function lifeMapOf(picks: ConvictionPick[], quotes: Record<string, { price: number; asOf: string | null }> | undefined, boardAsOf: string | null | undefined, nowMs: number): Map<string, SetupLife> {
  const out = new Map<string, SetupLife>();
  for (const p of picks) {
    if (p.isBotHeld) continue;
    const mark = liveMarkFor(p, quotes, boardAsOf);
    out.set(p.ideaId, { life: setupLifecycle({ ...p, currentPrice: mark?.price ?? null }, nowMs), mark });
  }
  return out;
}

/** Lifecycle for every live-book idea in a convictions payload. */
export function useSetupLifecycles(picks: ConvictionPick[] | undefined, boardAsOf: string | null | undefined, nowMs: number) {
  const symbols = useMemo(() => {
    const s = new Set<string>();
    for (const p of picks ?? []) if (isLiveBookPick(p)) s.add(p.symbol.toUpperCase());
    return Array.from(s).sort().slice(0, QUOTE_CAP);
  }, [picks]);
  const quotes = useQuotes(symbols);
  const map = useMemo(() => lifeMapOf(picks ?? [], quotes.data, boardAsOf, nowMs), [picks, quotes.data, boardAsOf, nowMs]);
  return { map, quotes };
}

/**
 * The NEXUS grade for a row on its LIVE lifecycle read (BOARD_SORT=grade); falls back
 * to the server's build-time grade when no lifecycle read exists; null in other modes.
 */
export function liveGradeOf(row: ConvictionPick, map: Map<string, SetupLife> | undefined, nowMs: number = Date.now()): NexusGrade | null {
  if (!row.nexusGrade) return null;
  const life = map?.get(row.ideaId)?.life;
  return life ? gradeFromLife(life, row, nowMs) : row.nexusGrade;
}

/**
 * Board order on every surface (NEXUS rows and Today's book both call this):
 *   BOARD_SORT=grade → the NEXUS grade re-read on the live lifecycle, highest first
 *                      (v3: actionable first, then quality, then actionability rank),
 *                      ties by the server's rank;
 *   otherwise        → server order (BOARD_SORT) / evidence;
 * then stale + resolved sink.
 */
export function boardOrder<T extends ConvictionPick>(rows: T[], map: Map<string, SetupLife> | undefined, nowMs: number = Date.now()): T[] {
  let sorted: T[];
  if (rows.some((r) => r.nexusGrade)) {
    const g = new Map(rows.map((r) => [r.ideaId, gradeSortValue(liveGradeOf(r, map, nowMs))] as const));
    sorted = [...rows].sort((a, b) => ((g.get(b.ideaId) ?? -1) - (g.get(a.ideaId) ?? -1)) || compareBoardRows(a, b));
  } else {
    sorted = [...rows].sort(compareBoardRows);
  }
  return map ? sinkByLifecycle(sorted, (r) => map.get(r.ideaId)?.life.state ?? 'carried') : sorted;
}
