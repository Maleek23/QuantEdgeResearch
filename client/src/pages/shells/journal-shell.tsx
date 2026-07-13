/**
 * JOURNAL — "How do I get better"
 *
 * Tabs: Trade Log | Metrics | Backtest | Mistakes | Academy
 */
import { lazy, Suspense } from 'react';
import { QETabs, type QETabItem, QECard } from '@/components/ui/qe';
import { useTabState } from '@/hooks/use-tab-state';
import { PageErrorBoundary } from '@/components/page-error-boundary';
import { Loader2 } from 'lucide-react';

const Performance       = lazy(() => import('@/pages/performance'));
const History           = lazy(() => import('@/pages/history'));
const StrategySim       = lazy(() => import('@/pages/strategy-simulator'));
const Academy           = lazy(() => import('@/pages/academy'));

type Tab = 'log' | 'metrics' | 'backtest' | 'mistakes' | 'academy';

const TABS: readonly QETabItem<Tab>[] = [
  { id: 'log',      label: 'Trade Log', hint: 'Every trade you took' },
  { id: 'metrics',  label: 'Metrics',   hint: 'Win rate, avg R, by setup type' },
  { id: 'backtest', label: 'Backtest',  hint: 'Run strategies on historicals' },
  { id: 'academy',  label: 'Academy',   hint: 'Learning content' },
];

const VALID_TABS = TABS.map(t => t.id);

export default function JournalShell() {
  const [tab, setTab] = useTabState<Tab>('log', VALID_TABS);

  return (
    <div className="space-y-3 px-4 py-3">
      <header>
        <h1 className="text-lg font-mono font-bold uppercase tracking-widest text-foreground">Journal</h1>
        <p className="text-[11px] font-mono text-muted-foreground/70">
          Learn from your tape — history, metrics, backtests, patterns.
        </p>
      </header>

      <QETabs items={TABS} active={tab} onChange={setTab} prefixLabel="VIEW" />

      <PageErrorBoundary label={`Journal · ${tab}`}>
        <Suspense fallback={<Loading />}>
          {tab === 'log'      && <History />}
          {tab === 'metrics'  && <Performance />}
          {tab === 'backtest' && <StrategySim />}
          {tab === 'mistakes' && <ComingSoon tab="Mistakes" />}
          {tab === 'academy'  && <Academy />}
        </Suspense>
      </PageErrorBoundary>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center h-48">
      <Loader2 className="w-4 h-4 animate-spin text-[var(--brand-cyan)]" />
    </div>
  );
}

function ComingSoon({ tab }: { tab: string }) {
  return (
    <QECard variant="default" padding="lg" className="text-center">
      <div className="text-sm font-mono uppercase tracking-widest text-muted-foreground mb-2">
        {tab} — coming next sprint
      </div>
    </QECard>
  );
}
