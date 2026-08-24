/**
 * GEX — the dedicated home for ALL gamma / dealer-positioning content.
 *
 * Tabs: Hub · Per-Symbol · Matrix · Heatmap · Buckets · Analysis
 *
 *   Hub        — market-wide GEX scanner (workflow tabs inside: 0DTE/SWING/LEAPS/FLIP)
 *   Per-Symbol — terminal chart with GEX overlays (default SPY, jumps via search)
 *   Matrix     — strike × expiry heatmap (the Skylit grid)
 *   Heatmap    — sector + ticker GEX heatmap
 *   Buckets    — per-DTE bucket explorer (calls /api/gex/buckets/:symbol)
 *   Analysis   — historical gamma growth, regime tracker, narrative
 */
import { lazy, Suspense } from 'react';
import { useLocation } from 'wouter';
import { QETabs, type QETabItem, QECard } from '@/components/ui/qe';
import { useTabState } from '@/hooks/use-tab-state';
import { useStockContext } from '@/contexts/stock-context';
import { PageErrorBoundary } from '@/components/page-error-boundary';
import { RotationBrief } from '@/components/rotation-brief';
import { Loader2, ExternalLink } from 'lucide-react';
import { GexBigGainers } from '@/components/gex-big-gainers';

const Prism       = lazy(() => import('@/components/prism/prism-board').then(m => ({ default: m.PrismBoard })));
const FlowHeatmap = lazy(() => import('@/pages/flow-heatmap'));
const GexAnalysis = lazy(() => import('@/pages/gex-dashboard'));

type Tab = 'prism' | 'gainers' | 'heatmap' | 'analysis';

/**
 * Hub and Matrix are gone, folded into Prism rather than deleted.
 *
 * Traced by endpoint: Hub (gex-scanner) read /api/gex-vex/hub, Matrix
 * (terminal-heatmap) read /api/gex-vex/terminal/:sym, and PrismBoard reads BOTH —
 * showing the ranked rail that was Hub beside the surface that was Matrix, plus
 * the interpretation neither had. Prism was never a peer of those two; it was
 * already their union, reached by a different door.
 *
 * Buckets is also gone: it rendered a "coming next sprint" placeholder. The
 * endpoint it names is still live, so building it is a real task — but an empty
 * tab in the nav is a promise the product does not keep.
 */
const TABS: readonly QETabItem<Tab>[] = [
  { id: 'prism',    label: 'Prism',      hint: 'Ranked board + the strike × expiry surface, in 2D or 3D' },
  { id: 'gainers',  label: 'Big Gainers', hint: 'Premium GEX plays running hot now + the hall-of-fame winners' },
  { id: 'heatmap',  label: 'Heatmap',    hint: 'Flow heatmap with per-ticker drill' },
  // "Analysis" undersold this badly. gex-dashboard derives a per-ticker trade
  // plan — anchor, gamma flip, defense lines, a 1-5 rating, entry zone, target
  // and sniper signals. It is the actionable surface in this shell, not a
  // reference tab, and the label should say so.
  { id: 'analysis', label: 'Trade Plan', hint: 'Per-ticker: anchor, flip, defense lines, entry, target' },
];

// NOTE: "Per-Symbol GEX" intentionally lives in RESEARCH (/r/:sym?tab=gex)
// to avoid duplicating per-ticker functionality. Cmd+K → ticker → lands there.

const VALID_TABS = TABS.map(t => t.id);

export default function GexShell() {
  const [tab, setTab] = useTabState<Tab>('prism', VALID_TABS);
  const [, setLocation] = useLocation();
  const { currentStock } = useStockContext();
  // Last symbol the user looked at (from Research). Falls back to SPY.
  const lastSymbol = (currentStock?.symbol || 'SPY').toUpperCase();

  return (
    <div className="space-y-3 px-4 py-3">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-mono font-bold uppercase tracking-widest text-foreground">
            GEX <span className="text-[var(--brand-cyan)]">Hub</span>
          </h1>
          <p className="text-[11px] font-mono text-muted-foreground/70">
            Market-wide gamma — scanner, expiry matrix, sector heatmap, regime analysis.
          </p>
          <p className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">
            For per-ticker deep dive (chart + options + GEX) →{' '}
            <button
              type="button"
              className="text-[var(--brand-cyan)] hover:underline inline-flex items-center gap-0.5"
              onClick={() => setLocation(`/r/${lastSymbol}?tab=gex`)}
            >
              Research → {lastSymbol} <ExternalLink className="w-2.5 h-2.5" />
            </button>
          </p>
        </div>
      </header>

      <RotationBrief />

      <QETabs items={TABS} active={tab} onChange={setTab} prefixLabel="VIEW" />

      <div className="text-[9px] font-mono text-muted-foreground/60">
        {TABS.find(t => t.id === tab)?.hint}
      </div>

      <PageErrorBoundary label={`GEX · ${tab}`}>
        <Suspense fallback={<Loading />}>
          {tab === 'prism'    && <Prism />}
          {tab === 'gainers'  && <GexBigGainers />}
          {tab === 'heatmap'  && <FlowHeatmap />}
          {tab === 'analysis' && <GexAnalysis />}
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
