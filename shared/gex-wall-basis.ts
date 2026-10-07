/**
 * ONE definition of "the walls" (audit 2026-10-01 P0 #10/#11).
 *
 * SPY's "call wall" used to differ page to page: Today, the landing and the
 * Quantinum dossier read the all-expiry walls, while the ticker page tiles and
 * the NEXUS wall-touch badge read the ≤7-day book — and the ticker page drew the
 * all-expiry lines on the chart right next to ≤7-day tiles.
 *
 * The rule, everywhere: the next-7-day book (expiries within 8 calendar days)
 * when it has a wall; otherwise the all-expiry walls, labelled as the fallback.
 * Every surface that prints a wall or zero-γ prints `basisLabel` (or `basisShort`) with it.
 */
export type WallBasis = 'next7' | 'all';

interface BucketLike {
  expirationsCount?: number | null;
  callWall?: number | null;
  putWall?: number | null;
  gammaFlipPrice?: number | null;
}

export interface WallSource {
  callWall?: number | null;
  putWall?: number | null;
  /** All-expiry zero-gamma (gammaFlipPrice / flipPoint / zeroGammaLevel — whichever the payload uses). */
  flip?: number | null;
  byDte?: { next7?: BucketLike | null } | null | unknown;
}

export interface PickedWalls {
  callWall: number | null;
  putWall: number | null;
  flip: number | null;
  basis: WallBasis;
  /** e.g. "next-7-day book (expiries ≤7d, 3)" or "all expiries (no near-dated book — fallback)". */
  basisLabel: string;
  /** e.g. "≤7d" or "all exp." — for tight tiles. */
  basisShort: string;
  expirations: number | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function pickWalls(g: WallSource | null | undefined): PickedWalls {
  const n7 = ((g?.byDte ?? null) as { next7?: BucketLike | null } | null)?.next7 ?? null;
  if (n7 && (num(n7.putWall) != null || num(n7.callWall) != null)) {
    const exp = num(n7.expirationsCount);
    return {
      callWall: num(n7.callWall),
      putWall: num(n7.putWall),
      // The near book's own zero-γ — never mixed with the all-expiry flip.
      flip: num(n7.gammaFlipPrice),
      basis: 'next7',
      basisLabel: `next-7-day book (expiries ≤7d${exp != null ? `, ${exp}` : ''})`,
      basisShort: '≤7d',
      expirations: exp,
    };
  }
  return {
    callWall: num(g?.callWall),
    putWall: num(g?.putWall),
    flip: num(g?.flip),
    basis: 'all',
    basisLabel: 'all expiries (no near-dated book — fallback)',
    basisShort: 'all exp.',
    expirations: null,
  };
}
