/**
 * MOMENTUM HUB — one home for all momentum-breakout hunting.
 *
 * Consolidates the old "Runners" tab and the old "Surges" (market-scanner)
 * tab, which both answered the same trader question ("what's breaking out?")
 * from different engines. Sub-views:
 *   Runners  — Qullamaggie / ADR coiled-spring small caps (clean QE table)
 *   Scanners — the multi-strategy breakout/squeeze/swing/bull-flag/WSB hub
 *
 * Composes the existing components unchanged, so nothing is lost and the
 * split is fully reversible.
 */
import { lazy, Suspense } from 'react';
import { QETabs, type QETabItem } from '@/components/ui/qe';
import { useTabState } from '@/hooks/use-tab-state';
import { Loader2 } from 'lucide-react';

const RunnersTable  = lazy(() => import('@/components/hunt/runners-table').then(m => ({ default: m.RunnersTable })));
const MarketScanner = lazy(() => import('@/pages/market-scanner'));

type Sub = 'runners' | 'scanners';

const TABS: readonly QETabItem<Sub>[] = [
  { id: 'runners',  label: 'Runners',  hint: 'High-ADR small caps coiled for a Qullamaggie-style breakout' },
  { id: 'scanners', label: 'Scanners', hint: 'Multi-strategy momentum: breakouts · squeeze · swing · bull-flag · WSB trending' },
];

const VALID = TABS.map(t => t.id);

export function MomentumHub() {
  const [sub, setSub] = useTabState<Sub>('runners', VALID, 'momentum-sub');

  return (
    <div className="space-y-3">
      <QETabs items={TABS} active={sub} onChange={setSub} prefixLabel="MODE" />
      <Suspense fallback={<Loading />}>
        {sub === 'runners'  && <RunnersTable />}
        {sub === 'scanners' && <MarketScanner />}
      </Suspense>
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
