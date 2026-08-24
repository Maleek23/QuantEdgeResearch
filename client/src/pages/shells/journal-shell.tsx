/**
 * JOURNAL — "How do I get better"
 *
 * Tabs: Trade Log | History | Metrics | Backtest | Academy
 */
import { lazy, Suspense } from 'react';
import { QETabs, type QETabItem } from '@/components/ui/qe';
import { useTabState } from '@/hooks/use-tab-state';
import { PageErrorBoundary } from '@/components/page-error-boundary';
import { Loader2 } from 'lucide-react';

const Performance       = lazy(() => import('@/pages/performance'));
const TradeJournal      = lazy(() => import('@/pages/trade-journal'));
const History           = lazy(() => import('@/pages/history'));
const StrategySim       = lazy(() => import('@/pages/strategy-simulator'));
const Academy           = lazy(() => import('@/pages/academy'));

type Tab = 'log' | 'history' | 'metrics' | 'backtest' | 'academy';

/**
 * Trade Log pointed at pages/history.tsx, which renders /api/ai/chat/history and
 * /api/research-history — your AI chats and research runs, under a tab whose own
 * hint read "Every trade you took". The actual trade log, pages/trade-journal.tsx,
 * was orphaned with six live /api/journal/* endpoints and no way in.
 *
 * Trade Log now shows trades. The chat/research history keeps its own tab rather
 * than being deleted, since it was the only door to those two endpoints.
 *
 * The 'mistakes' tab is gone — it rendered ComingSoon and was not in this array
 * anyway, so it was an unreachable branch advertising a feature that does not exist.
 */
const TABS: readonly QETabItem<Tab>[] = [
  { id: 'log',      label: 'Trade Log', hint: 'Every trade you took' },
  { id: 'history',  label: 'History',   hint: 'Past AI chats and research runs' },
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
          {tab === 'log'      && <TradeJournal />}
          {tab === 'history'  && <History />}
          {tab === 'metrics'  && <Performance />}
          {tab === 'backtest' && <StrategySim />}
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
