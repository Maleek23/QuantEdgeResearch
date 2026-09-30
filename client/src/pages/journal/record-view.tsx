/**
 * Journal · Track record — how the platform's PUBLISHED ideas did (not your
 * trades), plus the strategy backtester that used to be its own tab. Both
 * answer "does the engine work?", so they share one destination: the track
 * record on top, the backtest as a section underneath (open when deep-linked
 * via ?jtab=backtest).
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { ToolSkeleton } from '@/components/ui/qe-loading';
import type { Perf } from '@/components/dashboard/tools/today/today-model';

const Performance = lazy(() => import('@/pages/performance'));
const StrategySim = lazy(() => import('@/pages/strategy-simulator'));

const Spinner = () => (
  <ToolSkeleton rows={3} />
);

/**
 * Strict win rate beside run-up after trigger (shared/run-up.ts), each with its
 * n. The run-up rate is a measurement of how often a triggered idea got to +5%
 * before its stop — it is NOT a win, and it never changes the strict record.
 */
function StrictVsRunUp() {
  const q = useQuery<Perf>({
    queryKey: ['/api/performance/model-record', 'today'],
    queryFn: async () => { const r = await fetch('/api/performance/model-record', { credentials: 'include' }); if (!r.ok) throw new Error(String(r.status)); return r.json(); },
    staleTime: 600_000,
  });
  const o = q.data;
  if (!o) return null;
  const ru = o.runUp;
  return (
    <section className="jr-card" aria-label="Strict win rate and run-up after trigger">
      <div className="jr-card-h"><h3 className="jr-card-t">Strict record vs run-up</h3><span className="jr-card-meta jr-n">since {o.since}</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{o.winRate != null ? `${o.winRate.toFixed(0)}%` : '—'}</div>
          <div style={{ fontSize: 12 }}>Strict win rate (target, stop, or measured close)</div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>{o.wins ?? 0} of {o.decided ?? 0} decided{o.winRate == null ? ` · needs ${o.sampleFloor ?? 30}` : ''}</div>
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{ru?.rate != null ? `${ru.rate.toFixed(0)}%` : '—'}</div>
          <div style={{ fontSize: 12 }}>{ru?.label ?? 'Reached +5% after trigger, before stop — not the win rate'}</div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>
            {ru ? `${ru.reached5BeforeStop} of ${ru.triggered} triggered · +3%: ${ru.reached3} · +10%: ${ru.reached10}${ru.pending ? ` · ${ru.pending} still measuring` : ''}` : 'measuring'}
          </div>
        </div>
      </div>
      <p className="jr-note" style={{ margin: '10px 0 0' }}>
        Run-up is the best underlying move after the trigger, from real bars, counted only when it came before the stop (same bar = stop first). A trade that touched +5% and was not exited there can still lose, so run-up never counts as a win.
      </p>
    </section>
  );
}

export default function RecordView({ backtestOpen }: { backtestOpen: boolean }) {
  const [open, setOpen] = useState(backtestOpen);
  useEffect(() => {
    if (!backtestOpen) return;
    setOpen(true);
    const t = window.setTimeout(() => document.getElementById('jr-backtest')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 400);
    return () => window.clearTimeout(t);
  }, [backtestOpen]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="jr-note" style={{ margin: 0 }}>
        This is the platform's published-idea record — every idea the engines issued, scored when it closed. Your own trades live in Dashboard, Trades and Analytics.
      </p>
      <StrictVsRunUp />
      <Suspense fallback={<Spinner />}>
        <Performance />
      </Suspense>
      <section className="jr-card jr-anchor" id="jr-backtest">
        <details className="jr-details" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
          <summary className="jr-card-h" style={{ marginBottom: open ? 12 : 0 }}>
            <ChevronRight className="chev h-4 w-4" aria-hidden />
            <span className="jr-sec-num">LAB</span>
            <h3 className="jr-card-t">Backtest a strategy</h3>
            <span className="jr-card-meta jr-n">run rules on historicals</span>
          </summary>
          {open && (
            <Suspense fallback={<Spinner />}>
              <StrategySim />
            </Suspense>
          )}
        </details>
      </section>
    </div>
  );
}
