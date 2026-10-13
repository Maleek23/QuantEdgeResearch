/**
 * Quantinum horizon — the trader's timeframe, mapped to the option expiries a
 * GEX / flow read should use. Shared by Ask Quantinum (timeframe picker) and any
 * surface that wants the same vocabulary.
 *
 *   scalp     0DTE                       → GEX bucket 'today' (0–1d)
 *   day       ≤ 2DTE                     → GEX bucket 'today' + expiries ≤ 2d for flow
 *   swing     to Friday / ≤ 10DTE        → GEX bucket 'week'  (1–7d)
 *   position  to monthly OPEX and beyond → GEX bucket 'month' (8–30d)
 *
 * The GEX bucket endpoints have fixed buckets (shared/gex-buckets.ts); none is
 * "≤2DTE" or "≤10DTE", so `gexBucket` is the nearest bucket and `bucketNote`
 * says so — the card shows that note, never a silent approximation.
 */
export type Horizon = 'scalp' | 'day' | 'swing' | 'position';
export const HORIZONS: readonly Horizon[] = ['scalp', 'day', 'swing', 'position'] as const;
export const DEFAULT_HORIZON: Horizon = 'day';

export interface HorizonWindow {
  horizon: Horizon;
  label: string;
  /** Plain-English expiry window. */
  expiries: string;
  /** Inclusive max days-to-expiry for flow filtering (Infinity = no cap). */
  maxDte: number;
  minDte: number;
  /** Nearest fixed GEX bucket key (shared/gex-buckets.ts GEX_DTE_BUCKETS). */
  gexBucket: 'today' | 'week' | 'month';
  /** DTE range of that bucket, for labels ("0–1 DTE"). */
  gexBucketRange: string;
  bucketNote: string | null;
}

export const HORIZON_WINDOWS: Readonly<Record<Horizon, HorizonWindow>> = Object.freeze({
  scalp: { horizon: 'scalp', label: 'Scalp', expiries: '0DTE', minDte: 0, maxDte: 0, gexBucket: 'today', gexBucketRange: '0–1 DTE', bucketNote: null },
  day: { horizon: 'day', label: 'Day', expiries: '≤ 2DTE', minDte: 0, maxDte: 2, gexBucket: 'today', gexBucketRange: '0–1 DTE', bucketNote: 'GEX has no ≤2DTE bucket — dealer walls are the 0–1 DTE bucket; flow uses ≤2DTE.' },
  swing: { horizon: 'swing', label: 'Swing', expiries: 'to Friday / ≤ 10DTE', minDte: 0, maxDte: 10, gexBucket: 'week', gexBucketRange: '1–7 DTE', bucketNote: 'GEX walls are the 1–7 DTE bucket; flow uses ≤10DTE.' },
  position: { horizon: 'position', label: 'Position', expiries: 'to monthly OPEX and beyond', minDte: 8, maxDte: Infinity, gexBucket: 'month', gexBucketRange: '8–30 DTE', bucketNote: 'GEX walls are the 8–30 DTE bucket; flow uses ≥8DTE.' },
});

export function parseHorizon(raw: unknown): Horizon {
  const s = String(raw ?? '').toLowerCase();
  return (HORIZONS as readonly string[]).includes(s) ? (s as Horizon) : DEFAULT_HORIZON;
}

/** Calendar days from `nowMs` (ET date) to an expiry YYYY-MM-DD. NaN when unparseable. */
export function daysToExpiry(expiry: string, nowMs: number): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return NaN;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(nowMs));
  return Math.round((Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export function expiryInHorizon(expiry: string, h: Horizon, nowMs: number): boolean {
  const d = daysToExpiry(expiry, nowMs);
  const w = HORIZON_WINDOWS[h];
  return Number.isFinite(d) && d >= w.minDte && d <= w.maxDte;
}
