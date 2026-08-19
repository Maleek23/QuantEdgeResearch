/**
 * HOME — your front door.
 *
 * Tabs: Dashboard | Pulse | Rotation | Earnings | Changed | Macro
 *
 *   Dashboard — adapted from /home — overview, hero stats, quick links
 *   Pulse     — live market tape (the deep market-pulse view)
 *   Rotation  — 18-layer cycle map (next sprint)
 *   Earnings  — this week's catalysts (next sprint)
 *   Changed   — what just shifted (next sprint)
 *   Macro     — fed / geopolitical / DXY (next sprint)
 *
 * The original `/home` and `/pulse` URLs both still work — they redirect here.
 */
import { lazy, Suspense } from 'react';
import { QETabs, type QETabItem, QECard } from '@/components/ui/qe';
import { useTabState } from '@/hooks/use-tab-state';
import { PageErrorBoundary } from '@/components/page-error-boundary';
import { RotationBrief } from '@/components/rotation-brief';
import { RotationMap } from '@/components/rotation-map';
import { Loader2 } from 'lucide-react';
import { TodayPicks } from '@/components/today-picks';

const HomePage    = lazy(() => import('@/pages/home-glass'));
const MarketPulse = lazy(() => import('@/pages/market-pulse'));
const RotationMatrix = lazy(() => import('@/components/rotation/rotation-matrix').then(m => ({ default: m.RotationMatrix })));
const EarningsTabs = lazy(() => import('@/components/earnings/earnings-tabs').then(m => ({ default: m.EarningsTabs })));

type Tab = 'dashboard' | 'pulse' | 'rotation' | 'earnings' | 'changed' | 'macro';

const TABS: readonly QETabItem<Tab>[] = [
  { id: 'dashboard', label: 'Dashboard', hint: 'Your overview — top setups, hero stats, quick links' },
  { id: 'pulse',     label: 'Pulse',     hint: 'Live market tape — indices, breadth, fear/greed, sectors' },
  { id: 'rotation',  label: 'Rotation',  hint: '18-layer cycle map — early/mid/late stages across the AI buildout' },
  { id: 'earnings',  label: 'Earnings',  hint: 'Auto-scanned earnings lottos with IV / beat history / ROI scenarios' },
];

const VALID_TABS = TABS.map(t => t.id);

export default function HomeShell() {
  const [tab, setTab] = useTabState<Tab>('dashboard', VALID_TABS);

  return (
    <div className="space-y-3 px-4 py-3">
      <header>
        <h1 className="text-lg font-mono font-bold uppercase tracking-widest text-foreground">
          Home <span className="text-[var(--brand-cyan)]">·</span>{' '}
          <span className="text-muted-foreground/70 text-sm normal-case tracking-normal font-normal">
            your front door
          </span>
        </h1>
        <p className="text-[11px] font-mono text-muted-foreground/70">
          Dashboard, market tape, rotation, earnings, what changed.
        </p>
      </header>

      <RotationBrief />

      <RotationMap className="max-w-sm" />

      <QETabs items={TABS} active={tab} onChange={setTab} prefixLabel="VIEW" />

      <PageErrorBoundary label={`Home · ${tab}`}>
        <Suspense fallback={<Loading />}>
          {tab === 'dashboard' && (
            <div className="space-y-3">
              <TodayPicks />
              <HomePage />
            </div>
          )}
          {tab === 'pulse'     && <MarketPulse />}
          {tab === 'rotation'  && <RotationMatrix />}
          {tab === 'earnings'  && <EarningsTabs />}
          {(tab === 'changed' || tab === 'macro') && (
            <ComingSoon tab={tab} />
          )}
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
        {tab} · coming next sprint
      </div>
      <p className="text-xs text-muted-foreground/70 max-w-md mx-auto">
        Foundation is shipped. The Dashboard + Pulse tabs are live now.
      </p>
    </QECard>
  );
}
