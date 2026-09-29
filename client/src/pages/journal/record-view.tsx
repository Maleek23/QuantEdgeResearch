/**
 * Journal · Track record — how the platform's PUBLISHED ideas did (not your
 * trades), plus the strategy backtester that used to be its own tab. Both
 * answer "does the engine work?", so they share one destination: the track
 * record on top, the backtest as a section underneath (open when deep-linked
 * via ?jtab=backtest).
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { ToolSkeleton } from '@/components/ui/qe-loading';

const Performance = lazy(() => import('@/pages/performance'));
const StrategySim = lazy(() => import('@/pages/strategy-simulator'));

const Spinner = () => (
  <ToolSkeleton rows={3} />
);

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
