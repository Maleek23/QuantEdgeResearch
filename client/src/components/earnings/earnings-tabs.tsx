/**
 * EarningsTabs — sub-nav for the Pulse > Earnings tab.
 *
 *   Lottos    → curated, scored, ranked plays (the "what to trade" view)
 *   Calendar  → full universe (every reporter, the "what to watch" view)
 *
 * Tab persists in URL via ?subtab= so deep-links from Cmd+K / changelog work.
 */
import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { QETabs, type QETabItem } from '@/components/ui/qe';
import { useTabState } from '@/hooks/use-tab-state';

const EarningsHub      = lazy(() => import('./earnings-hub').then(m => ({ default: m.EarningsHub })));
const EarningsCalendar = lazy(() => import('./earnings-calendar').then(m => ({ default: m.EarningsCalendar })));
const EarningsMovers   = lazy(() => import('./earnings-movers').then(m => ({ default: m.EarningsMovers })));

type SubTab = 'lottos' | 'calendar' | 'movers';

const TABS: readonly QETabItem<SubTab>[] = [
  { id: 'lottos',   label: 'Lottos',   hint: 'Curated lottery picks — scored by ROI / IV / beat history' },
  { id: 'calendar', label: 'Calendar', hint: 'Full universe — every reporter, all sectors, all sizes' },
  { id: 'movers',   label: 'Movers',   hint: 'Post-earnings gappers — implied vs realized, follow-up plays' },
];

const VALID = TABS.map(t => t.id);

export function EarningsTabs() {
  const [tab, setTab] = useTabState<SubTab>('lottos', VALID, 'subtab');

  return (
    <div className="space-y-3">
      <QETabs
        items={TABS}
        active={tab}
        onChange={setTab}
        prefixLabel="VIEW"
        variant="gold"
      />

      <Suspense fallback={
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-4 h-4 animate-spin text-[var(--brand-cyan)]" />
        </div>
      }>
        {tab === 'lottos' && <EarningsHub />}
        {tab === 'calendar' && <EarningsCalendar />}
        {tab === 'movers' && <EarningsMovers />}
      </Suspense>
    </div>
  );
}
