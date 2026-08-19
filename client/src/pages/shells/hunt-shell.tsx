/**
 * HUNT — "What should I trade today"
 *
 * Tabs: Today | AI Picks | GEX Setups | Momentum | Discounts | Sector Hunt
 *       | Earnings | BTC | Watchlist
 *
 * Lazy-loads existing pages where functionality already exists. Consolidated
 * from 11 → 9 tabs: the standalone "Movers" tab folded into Today (which
 * already aggregates the gappers), and "Runners" + "Surges" merged into a
 * single "Momentum" hub since both hunt breakouts.
 */
import { lazy, Suspense } from 'react';
import { QETabs, type QETabItem } from '@/components/ui/qe';
import { useTabState } from '@/hooks/use-tab-state';
import { PageErrorBoundary } from '@/components/page-error-boundary';
import { RotationBrief } from '@/components/rotation-brief';
import { CashGateBanner } from '@/components/cash-gate-banner';
import { Loader2 } from 'lucide-react';

const HuntCockpit    = lazy(() => import('@/pages/shells/hunt-cockpit'));
const GexScanner     = lazy(() => import('@/pages/gex-scanner'));
const MomentumHub    = lazy(() => import('@/components/hunt/momentum-hub').then(m => ({ default: m.MomentumHub })));
const Watchlist      = lazy(() => import('@/pages/unified-watchlist'));
const DiscountScanner = lazy(() => import('@/components/hunt/discount-scanner').then(m => ({ default: m.DiscountScanner })));
const SpectrumScanner = lazy(() => import('@/components/hunt/spectrum-scanner').then(m => ({ default: m.SpectrumScanner })));
const LeapTracker    = lazy(() => import('@/components/hunt/leap-tracker').then(m => ({ default: m.LeapTracker })));
const RotationMatrix = lazy(() => import('@/components/rotation/rotation-matrix').then(m => ({ default: m.RotationMatrix })));
const SectorFlowMatrix = lazy(() => import('@/components/rotation/sector-flow-matrix').then(m => ({ default: m.SectorFlowMatrix })));
const EarningsTabs   = lazy(() => import('@/components/earnings/earnings-tabs').then(m => ({ default: m.EarningsTabs })));
const BTCRadarPage   = lazy(() => import('@/pages/btc-radar'));

type Tab = 'ai-picks' | 'gex' | 'momentum' | 'leaps' | 'discounts' | 'spectrum' | 'rotation' | 'sector' | 'btc' | 'earnings' | 'watchlist';

const TABS: readonly QETabItem<Tab>[] = [
  { id: 'ai-picks',  label: 'AI Picks',     group: 'Ideas',  hint: 'Discovery + best setups + convergence' },
  { id: 'gex',       label: 'GEX Setups',   group: 'Ideas',  hint: '0DTE, swing, LEAPS, flip-watch workflows' },
  { id: 'momentum',  label: 'Momentum',     group: 'Scan',   hint: 'Runners + breakout/squeeze/swing/bull-flag scanners — all breakout hunting in one place' },
  { id: 'leaps',     label: 'LEAPS',        group: 'Scan',   hint: 'A+ long-dated stock-replacement calls — secular leaders in inflowing sectors, deep-ITM & liquid' },
  { id: 'discounts', label: 'Discounts',    group: 'Scan',   hint: 'Options trading cheap vs their smile — enter for less, hold overnight/next week' },
  { id: 'spectrum',  label: 'Spectrum',     group: 'Scan',   hint: 'Pick a ticker, see its full premium ladder — lotto cents to deep-ITM LEAPS, each graded on real risk-adjusted EV' },
  { id: 'rotation',  label: 'Rotation',     group: 'Flow',   hint: 'Money flow across timeframes — 1H/1D/1W/1M/3M relative strength, leadership & rotation patterns' },
  { id: 'sector',    label: 'Sector Hunt',  group: 'Flow',   hint: '18-layer rotation map — drill into hot layers' },
  { id: 'earnings',  label: 'Earnings',     group: 'Events', hint: 'Pre-print plays with IV + beat history' },
  { id: 'btc',       label: 'BTC',          group: 'Events', hint: 'Live BTC beta tracker — MSTR, COIN, MARA, RIOT, CRCL & more' },
  { id: 'watchlist', label: 'Watchlist',    group: 'Saved',  hint: 'Your saved tickers' },
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

      <CashGateBanner />

      <button
        type="button"
        onClick={() => setTab('rotation')}
        className="block w-full text-left cursor-pointer"
        title="Open the full rotation matrix — flow across 1H/1D/1W/1M/3M"
      >
        <RotationBrief />
      </button>

      <QETabs items={TABS} active={tab} onChange={setTab} prefixLabel="VIEW" />

      <div className="text-[9px] font-mono text-muted-foreground/60">
        {TABS.find(t => t.id === tab)?.hint}
      </div>

      <PageErrorBoundary label={`Hunt · ${tab}`}>
        <Suspense fallback={<Loading />}>
          {tab === 'ai-picks'  && <HuntCockpit />}
          {tab === 'gex'       && <GexScanner />}
          {tab === 'momentum'  && <MomentumHub />}
          {tab === 'leaps'     && <LeapTracker />}
          {tab === 'discounts' && <DiscountScanner />}
          {tab === 'spectrum'  && <SpectrumScanner />}
          {tab === 'rotation'  && <SectorFlowMatrix />}
          {tab === 'sector'    && <RotationMatrix />}
          {tab === 'earnings'  && <EarningsTabs />}
          {tab === 'btc'       && <BTCRadarPage />}
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
