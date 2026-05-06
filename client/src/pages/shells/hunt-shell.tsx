/**
 * HUNT — "What should I trade today"
 *
 * Tabs: AI Picks | GEX Setups | Sector Hunt | Surges | Earnings Plays | Watchlist
 *
 * Lazy-loads existing pages where functionality already exists.
 * Sector Hunt + Earnings Plays are placeholders for next sprint.
 */
import { lazy, Suspense } from 'react';
import { QETabs, type QETabItem } from '@/components/ui/qe';
import { useTabState } from '@/hooks/use-tab-state';
import { PageErrorBoundary } from '@/components/page-error-boundary';
import { Loader2 } from 'lucide-react';

const TradeDesk      = lazy(() => import('@/pages/trade-desk'));
const GexScanner     = lazy(() => import('@/pages/gex-scanner'));
const MarketScanner  = lazy(() => import('@/pages/market-scanner'));
const Watchlist      = lazy(() => import('@/pages/unified-watchlist'));
const RunnersTable   = lazy(() => import('@/components/hunt/runners-table').then(m => ({ default: m.RunnersTable })));
const RotationMatrix = lazy(() => import('@/components/rotation/rotation-matrix').then(m => ({ default: m.RotationMatrix })));

type Tab = 'ai-picks' | 'gex' | 'runners' | 'sector' | 'surges' | 'earnings' | 'watchlist';

const TABS: readonly QETabItem<Tab>[] = [
  { id: 'ai-picks',  label: 'AI Picks',     hint: 'Discovery + best setups + convergence' },
  { id: 'gex',       label: 'GEX Setups',   hint: '0DTE, swing, LEAPS, flip-watch workflows' },
  { id: 'runners',   label: 'Runners',      hint: 'High-ADR small caps for momentum riding (Qullamaggie style)' },
  { id: 'sector',    label: 'Sector Hunt',  hint: '18-layer rotation map — drill into hot layers' },
  { id: 'surges',    label: 'Surges',       hint: 'Momentum + volume breakouts' },
  { id: 'earnings',  label: 'Earnings',     hint: 'Pre-print plays with IV + beat history', disabled: true },
  { id: 'watchlist', label: 'Watchlist',    hint: 'Your saved tickers' },
];

const VALID_TABS = TABS.map(t => t.id);

export default function HuntShell() {
  const [tab, setTab] = useTabState<Tab>('ai-picks', VALID_TABS);

  return (
    <div className="space-y-3 px-4 py-3">
      <header>
        <h1 className="text-lg font-mono font-bold uppercase tracking-widest text-foreground">Hunt</h1>
        <p className="text-[11px] font-mono text-muted-foreground/70">
          What to trade today — ranked candidates across every signal source.
        </p>
      </header>

      <QETabs items={TABS} active={tab} onChange={setTab} prefixLabel="VIEW" />

      <div className="text-[9px] font-mono text-muted-foreground/60">
        {TABS.find(t => t.id === tab)?.hint}
      </div>

      <PageErrorBoundary label={`Hunt · ${tab}`}>
        <Suspense fallback={<Loading />}>
          {tab === 'ai-picks'  && <TradeDesk />}
          {tab === 'gex'       && <GexScanner />}
          {tab === 'runners'   && <RunnersTable />}
          {tab === 'sector'    && <RotationMatrix />}
          {tab === 'surges'    && <MarketScanner />}
          {tab === 'earnings'  && <ComingSoon tab="Earnings Plays" />}
          {tab === 'watchlist' && <Watchlist />}
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
    <div className="rounded-lg bg-card border border-card-border p-8 text-center">
      <div className="text-sm font-mono uppercase tracking-widest text-muted-foreground mb-2">
        {tab} — coming next sprint
      </div>
    </div>
  );
}
