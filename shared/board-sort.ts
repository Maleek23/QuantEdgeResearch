/**
 * BOARD SORT — how the NEXUS board orders setups (env BOARD_SORT).
 *
 *   score          (default, unset) the evidence score, highest first — unchanged.
 *   recency        newest call first. Makes no claim about which setup is better.
 *   engine_record  the originating engine's bar-verified record (mean R under the
 *                  exit-rule replay's rule 7, shrunk toward the book mean), then recency.
 *
 * Why this exists: docs/SCORE_V2_STUDY.md. On the honest record (2026-08-26 → 09-30,
 * 443 bar-verified ideas) the evidence score does not rank outcomes — Spearman vs
 * realised R −0.12 (H1) / −0.01 (H2) — and no rebuilt score beat "no ranking" out of
 * sample in both directions. The engine record did not either (OOS ρ +0.06 / −0.02),
 * so `recency` is the recommended setting; `engine_record` is offered as the other
 * neutral-ish order and is equally unvalidated.
 */

export type BoardSort = 'score' | 'recency' | 'engine_record';

export function readBoardSort(env: Record<string, string | undefined> = {}): BoardSort {
  const v = String(env.BOARD_SORT ?? '').trim().toLowerCase();
  return v === 'recency' || v === 'engine_record' ? v : 'score';
}

/**
 * Per-engine mean R (rule 7, winsorised [−3, +5]) shrunk toward the book mean with
 * K = 40 — research/score-v2-study-results.json `engineRecord.table`, as of the
 * 2026-09-30 close. Engines not listed sort at the book mean.
 */
export const ENGINE_RECORD_AS_OF = '2026-09-30';
export const ENGINE_RECORD_MEAN_R = -0.0539;
export const ENGINE_RECORD: Readonly<Record<string, { n: number; shrunkR: number }>> = Object.freeze({
  quant: { n: 59, shrunkR: 0.0026 },
  gex_magnet: { n: 3, shrunkR: 0.0196 },
  tradingview: { n: 1, shrunkR: -0.0054 },
  flow: { n: 25, shrunkR: -0.0082 },
  manual: { n: 1, shrunkR: -0.0413 },
  hybrid: { n: 1, shrunkR: -0.0484 },
  orb_scanner: { n: 1, shrunkR: -0.0505 },
  gex_scanner: { n: 93, shrunkR: -0.0566 },
  spx_session: { n: 5, shrunkR: -0.0849 },
  market_scanner: { n: 246, shrunkR: -0.0892 },
  crypto_engine: { n: 8, shrunkR: -0.1119 },
});

export function engineRecordR(source: string | null | undefined): number {
  return ENGINE_RECORD[String(source ?? '')]?.shrunkR ?? ENGINE_RECORD_MEAN_R;
}

export interface SortablePick {
  convictionScore: number;
  source?: string | null;
  calledAt?: string | null;
  generatedAt?: string | null;
  ideaId?: string;
}

const ts = (p: SortablePick) => {
  const t = Date.parse(String(p.calledAt ?? p.generatedAt ?? ''));
  return Number.isFinite(t) ? t : 0;
};

/** Comparator for a mode (stable tie-breaks: recency, then idea id). */
export function boardComparator(mode: BoardSort): (a: SortablePick, b: SortablePick) => number {
  const tie = (a: SortablePick, b: SortablePick) => ts(b) - ts(a) || String(a.ideaId ?? '').localeCompare(String(b.ideaId ?? ''));
  if (mode === 'recency') return tie;
  if (mode === 'engine_record') return (a, b) => engineRecordR(b.source) - engineRecordR(a.source) || tie(a, b);
  return (a, b) => b.convictionScore - a.convictionScore;
}

/** A sorted copy with `boardRank` (0 = top) stamped so the client keeps the server's order. */
export function orderBoard<T extends SortablePick>(picks: T[], mode: BoardSort): Array<T & { boardRank: number }> {
  return [...picks].sort(boardComparator(mode)).map((p, i) => ({ ...p, boardRank: i }));
}

/** Client-side order: the server's `boardRank` when both rows carry one, else evidence score. */
export function compareBoardRows(a: { convictionScore: number; boardRank?: number | null }, b: { convictionScore: number; boardRank?: number | null }): number {
  return a.boardRank != null && b.boardRank != null ? a.boardRank - b.boardRank : b.convictionScore - a.convictionScore;
}
