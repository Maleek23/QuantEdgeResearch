/**
 * Live marks for the open rows of a Mine / trader book — GET /api/journal/marks
 * (server/journal-marks.ts). Polled every 30 s while the page is visible
 * (react-query pauses interval refetches in a hidden tab). Separate from the
 * rows query so a book of thousands of rows is not re-downloaded to move a price.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { JournalKey } from '@shared/journal-sources';

export interface LiveMark {
  price: number;
  /** Provider observation time — the UI always stamps its age. */
  asOf: string;
  source: string;
  delayed: boolean;
  basis: 'quote' | 'contract' | 'underlying';
  unrealizedPnL: number | null;
  unrealizedPct: number | null;
  note?: string;
}

export const MARKS_POLL_MS = 30_000;

/**
 * NEXUS ideas rows are re-sized on the client (shared/desk-view.ts); the server
 * marks them at the unit size, so a risk-sized row's unrealized $ is scaled by
 * qty ÷ unit qty here (pass the book's rows).
 */
export function useJournalMarks(key: JournalKey, openCount: number, rows?: readonly { id: string; quantity: number; riskBasis?: { unitQty: number } | null; sizedAs?: unknown }[]) {
  const eligible = key === 'mine' || key === 'desk' || key.startsWith('trader:');
  const q = useQuery<{ marks: Record<string, LiveMark>; asOf: string }>({
    queryKey: ['/api/journal/marks', key],
    queryFn: async () => {
      const res = await fetch(`/api/journal/marks?journal=${encodeURIComponent(key)}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Journal marks request failed (${res.status})`);
      return res.json();
    },
    enabled: eligible && openCount > 0,
    refetchInterval: key === 'desk' ? 60_000 : MARKS_POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: MARKS_POLL_MS - 1_000,
  });
  const marks = q.data?.marks;
  return useMemo(() => {
    if (!marks || key !== 'desk' || !rows) return marks ?? {};
    const factor = new Map<string, number>();
    for (const r of rows) if (r.sizedAs && r.riskBasis && r.riskBasis.unitQty > 0) factor.set(r.id, r.quantity / r.riskBasis.unitQty);
    if (!factor.size) return marks;
    const out: Record<string, LiveMark> = {};
    for (const [id, m] of Object.entries(marks)) {
      const f = factor.get(id);
      out[id] = f == null || m.unrealizedPnL == null ? m : { ...m, unrealizedPnL: Math.round(m.unrealizedPnL * f * 100) / 100 };
    }
    return out;
  }, [marks, key, rows]);
}

/** "12s", "4m", "3h", "2d" — the age of an observation. */
export function markAgeLabel(asOf: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(asOf)) / 1000));
  if (!Number.isFinite(s)) return 'age ?';
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : s < 86_400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86_400)}d`;
}
