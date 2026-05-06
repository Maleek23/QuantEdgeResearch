/**
 * POSITIONS — "How am I doing"
 *
 * Tabs: Open | Heat Map | Alerts | Trim/Exit | Closed
 */
import { lazy, Suspense } from 'react';
import { QETabs, type QETabItem, QECard } from '@/components/ui/qe';
import { useTabState } from '@/hooks/use-tab-state';
import { PageErrorBoundary } from '@/components/page-error-boundary';
import { Loader2 } from 'lucide-react';

const PositionsHeatmap = lazy(() => import('@/pages/positions-heatmap'));

type Tab = 'open' | 'heatmap' | 'alerts' | 'exits' | 'closed';

const TABS: readonly QETabItem<Tab>[] = [
  { id: 'open',    label: 'Open',     hint: 'Active positions table with live P&L (next sprint)', disabled: true },
  { id: 'heatmap', label: 'Heat Map', hint: 'Visual P&L treemap of open book' },
  { id: 'alerts',  label: 'Alerts',   hint: 'T1 hit, theta critical, stop hit (next sprint)', disabled: true },
  { id: 'exits',   label: 'Trim/Exit', hint: 'Recommended actions (next sprint)', disabled: true },
  { id: 'closed',  label: 'Closed',   hint: 'Last 90d closed trades (next sprint)', disabled: true },
];

const VALID_TABS = TABS.map(t => t.id);

export default function PositionsShell() {
  const [tab, setTab] = useTabState<Tab>('heatmap', VALID_TABS);

  return (
    <div className="space-y-3 px-4 py-3">
      <header>
        <h1 className="text-lg font-mono font-bold uppercase tracking-widest text-foreground">Positions</h1>
        <p className="text-[11px] font-mono text-muted-foreground/70">
          Your book — open positions, P&L, exit prompts.
        </p>
      </header>

      <QETabs items={TABS} active={tab} onChange={setTab} prefixLabel="VIEW" />

      <PageErrorBoundary label={`Positions · ${tab}`}>
        <Suspense fallback={<Loading />}>
          {tab === 'heatmap' && <PositionsHeatmap />}
          {tab !== 'heatmap' && <ComingSoon tab={tab} />}
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
