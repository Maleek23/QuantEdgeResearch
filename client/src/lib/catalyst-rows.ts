/**
 * CATALYST impact board rows (audit 2026-10-01 P0 #20/#21, #9).
 *
 * /api/catalysts/board sends three shapes:
 *   eventRisk  → { ...pick, event }
 *   confluence / conflict → { ...pick, events[] }
 *   unclaimed  → flat { symbol, type, title, date, daysAway, polarity, importance }
 * The client read only `event`, so CONFLICT / CONFLUENCE / NO SIGNAL rows showed
 * "—" for the verified event and distance, and NO SIGNAL rows (names NEXUS is
 * not trading) were labelled "▲ LONG" by a `direction ?? 'long'` default.
 * This normaliser gives every row one `event` and a side only when the row is a
 * real pick. Scores are on the 0–100 display scale every board uses.
 */
import { convictionDisplayPercent } from '../../../shared/conviction-display';

export type CatalystBucket = 'risk' | 'conflict' | 'confluence' | 'nosignal';

export interface CatalystEvent {
  type?: string; title?: string; date?: string; daysAway?: number;
  polarity?: string; importance?: number; isBinary?: boolean;
}

export interface CatalystRow {
  symbol: string;
  type: CatalystBucket;
  /** 'LONG' | 'SHORT' for a published pick; null for a name NEXUS is not trading. */
  side: 'LONG' | 'SHORT' | null;
  /** 0–100 evidence display score (diagnostic only — not shown; the NEXUS grade is). */
  score: number | null;
  /** The ONE grade (shared/nexus-grade.ts), attached by the server; null when not a pick. */
  nexusGrade: { letter: string; score: number; breakdown?: string } | null;
  holdingPeriod?: string | null;
  event: CatalystEvent | null;
  note?: string;
}

export function normalizeCatalystRow(raw: any, bucket: CatalystBucket): CatalystRow {
  const event: CatalystEvent | null =
    raw?.event ??
    (Array.isArray(raw?.events) && raw.events.length ? raw.events[0] : null) ??
    (bucket === 'nosignal' && (raw?.title || raw?.date)
      ? { type: raw.type, title: raw.title, date: raw.date, daysAway: raw.daysAway, polarity: raw.polarity, importance: raw.importance }
      : null);
  const dir = String(raw?.direction ?? '').toLowerCase();
  const side: CatalystRow['side'] = bucket === 'nosignal' || !dir
    ? null
    : dir.includes('short') || dir.includes('bear') ? 'SHORT' : 'LONG';
  const rawScore = bucket === 'nosignal' ? null : raw?.convictionScore;
  return {
    symbol: String(raw?.symbol ?? '').toUpperCase(),
    type: bucket,
    side,
    score: typeof rawScore === 'number' && Number.isFinite(rawScore) ? convictionDisplayPercent(rawScore) : null,
    nexusGrade: bucket === 'nosignal' ? null : raw?.nexusGrade ?? null,
    holdingPeriod: bucket === 'nosignal' ? null : raw?.holdingPeriod ?? null,
    event,
    note: raw?.note,
  };
}
