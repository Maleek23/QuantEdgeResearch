/**
 * DATA-HEALTH STRIP — Journal + NEXUS. Gaps in the published record, by ET day,
 * so nothing is silent (operator 2026-10-13: "a lot of gaps in journal and
 * NEXUS… misinfo and confusion"). Reads GET /api/integrity/data-health
 * (shared/journal-integrity.ts dataHealth over trade_ideas rows), stamped with
 * its source and age.
 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import './integrity.css';

type GapKind = 'missing_contract' | 'stale_outcome' | 'mismatch' | 'unpriced_outcome';
interface DayHealth { day: string; total: number; counts: Record<GapKind, number>; items: Array<{ id: string; symbol: string; source: string; kind: GapKind; detail: string }> }
interface HealthPayload { days: DayHealth[]; totals: Record<GapKind, number>; rows: number; asOf: string; source: string }

const LABEL: Record<GapKind, string> = {
  missing_contract: 'missing contract',
  stale_outcome: 'stale outcome',
  mismatch: 'outcome/premium mismatch',
  unpriced_outcome: 'no exit premium',
};
const KINDS: GapKind[] = ['missing_contract', 'stale_outcome', 'mismatch', 'unpriced_outcome'];

function ageText(iso: string | undefined, now: number): string {
  if (!iso) return 'age —';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return s < 90 ? `${s}s ago` : s < 5400 ? `${Math.round(s / 60)}m ago` : `${(s / 3600).toFixed(1)}h ago`;
}

export function DataHealthStrip({ days = 14, compact = false }: { days?: number; compact?: boolean }) {
  const q = useQuery<HealthPayload>({
    queryKey: ['/api/integrity/data-health', days],
    queryFn: async () => {
      const r = await fetch(`/api/integrity/data-health?days=${days}`, { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });
  const [open, setOpen] = useState<string | null>(null);
  const now = Date.now();
  if (q.isError) return <div className="dh-strip dh-warn" role="status">Data health unavailable — {(q.error as Error)?.message ?? 'request failed'}. Gaps are not being shown, not absent.</div>;
  if (!q.data) return <div className="dh-strip" role="status">Data health: checking the last {days} days…</div>;
  const d = q.data;
  const total = KINDS.reduce((s, k) => s + (d.totals[k] ?? 0), 0);
  const withGaps = d.days.filter((x) => KINDS.some((k) => x.counts[k] > 0));
  return (
    <section className={`dh-strip ${total ? 'dh-warn' : 'dh-ok'}`} aria-label="Data health">
      <div className="dh-head">
        <b>Data health</b>{' '}
        {total === 0
          ? <span>no gaps in {d.rows} published ideas, last {days} days</span>
          : <span>{KINDS.filter((k) => d.totals[k] > 0).map((k) => `${d.totals[k]} ${LABEL[k]}`).join(' · ')} — across {withGaps.length} day{withGaps.length === 1 ? '' : 's'} ({d.rows} ideas)</span>}
        <small className="dh-src" title={d.source}> · computed {ageText(d.asOf, now)} from trade_ideas</small>
      </div>
      {!compact && withGaps.length > 0 && (
        <ul className="dh-days">
          {withGaps.map((x) => (
            <li key={x.day}>
              <button type="button" className="dh-day" aria-expanded={open === x.day} onClick={() => setOpen(open === x.day ? null : x.day)}>
                {x.day}: {KINDS.filter((k) => x.counts[k] > 0).map((k) => `${x.counts[k]} ${LABEL[k]}`).join(' · ')} <small>of {x.total}</small>
              </button>
              {open === x.day && (
                <ul className="dh-items">
                  {x.items.map((it, i) => <li key={`${it.id}-${i}`}><b>{it.symbol}</b> <small>{it.source}</small> — {LABEL[it.kind]}: {it.detail}</li>)}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default DataHealthStrip;
