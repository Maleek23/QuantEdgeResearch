/**
 * Rank movers (Sectors hero, audit 2026-10-07 #5): a "climb" or "slide" needs an
 * actual rank change in that direction — "#1 → #1" is not a slide.
 * Ranks are 1 = best, so a climb is rank < rankThen and a slide is rank > rankThen.
 */
export interface RankRow { id: string; rank: number | null; rankThen: number | null }

export function rankMover<T extends RankRow>(rows: T[], candidateIds: string[], dir: 'climb' | 'slide'): T | null {
  for (const id of candidateIds) {
    const r = rows.find((s) => s.id === id);
    if (!r || r.rank == null || r.rankThen == null) continue;
    if (dir === 'climb' ? r.rank < r.rankThen : r.rank > r.rankThen) return r;
  }
  return null;
}
