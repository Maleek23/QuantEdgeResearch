/**
 * LANDING RECORD STRIP — the public, VERIFIED summary of the NEXUS ideas book
 * (docs/TERRA_TRADE_STUDY_2026-10-07.md item #4).
 *
 * Only closed rows whose P&L was re-computed against market bars and matched
 * (verification.status === 'verified', research/verify-nexus-book.ts via
 * server/journal-row-maps.ts verifyDeskRows) are counted. Integrity-checked
 * rows that are not bar-verified, and unverified rows, are NEVER folded into a
 * number — they are only counted as "not in these numbers". The recorded
 * (raw) total is never used.
 *
 * The win rate is withheld below `minSample` closed verified trades.
 */

export const RECORD_MIN_SAMPLE = 30;

export interface PublicRecord {
  /** Closed NEXUS ideas whose P&L is bar-verified. */
  verifiedClosed: number;
  /** Of those, how many closed green (recomputed P&L > 0). */
  wins: number;
  /** wins / verifiedClosed — null below minSample. */
  winRate: number | null;
  minSample: number;
  /** Closed rows left OUT of these numbers: integrity-checked only (not bar-verified). */
  checkedOnly: number;
  /** Closed rows left OUT: failed verification (mismatch / unverifiable / duplicate / integrity). */
  unverified: number;
  /** Exit-date range of the verified rows (ISO). */
  from: string | null;
  to: string | null;
  /** When the bar-verification ledger was produced (ISO) — the record's age. */
  ledgerAsOf: string | null;
}

export interface RecordInputRow {
  status: string | null;
  realizedPnL: number | null;
  exitTime: string | null;
  verification?: { status: string; recomputedPnL: number | null } | null;
}

export function summarizeVerifiedBook(
  rows: RecordInputRow[],
  opts: { unverified: number; ledgerAsOf: string | null; minSample?: number },
): PublicRecord {
  const minSample = opts.minSample ?? RECORD_MIN_SAMPLE;
  const closed = rows.filter((r) => r.status === 'closed');
  const verified = opts.ledgerAsOf ? closed.filter((r) => r.verification?.status === 'verified') : [];
  const pnl = (r: RecordInputRow) => r.verification?.recomputedPnL ?? r.realizedPnL ?? 0;
  const wins = verified.filter((r) => pnl(r) > 0).length;
  const exits = verified.map((r) => r.exitTime).filter((t): t is string => !!t && !Number.isNaN(Date.parse(t))).sort();
  return {
    verifiedClosed: verified.length,
    wins,
    winRate: verified.length >= minSample ? wins / verified.length : null,
    minSample,
    checkedOnly: closed.length - verified.length,
    unverified: opts.unverified,
    from: exits[0] ?? null,
    to: exits[exits.length - 1] ?? null,
    ledgerAsOf: opts.ledgerAsOf,
  };
}
