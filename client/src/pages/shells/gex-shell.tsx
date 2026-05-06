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
import { Loader2, ExternalLink } from 'lucide-react';

const GexHub      = lazy(() => import('@/pages/gex-scanner'));
const TerminalMx  = lazy(() => import('@/pages/terminal-heatmap'));
const FlowHeatmap = lazy(() => import('@/pages/flow-heatmap'));
const GexAnalysis = lazy(() => import('@/pages/gex-dashboard'));

type Tab = 'hub' | 'matrix' | 'heatmap' | 'buckets' | 'analysis';

const TABS: readonly QETabItem<Tab>[] = [
  { id: 'hub',      label: 'Hub',        hint: 'Market-wide scanner — top GEX, sectors, top plays' },
  { id: 'matrix',   label: 'Matrix',     hint: 'Strike × expiry browser — fast-switch tickers, compare matrices' },
  { id: 'heatmap',  label: 'Heatmap',    hint: 'Sector GEX heatmap with per-ticker drill' },
  { id: 'buckets',  label: 'Buckets',    hint: 'Per-DTE explorer: 0DTE / Week / Month / Quarter / LEAPS', disabled: true },
  { id: 'analysis', label: 'Analysis',   hint: 'Gamma growth history + regime tracker' },
];

// NOTE: "Per-Symbol GEX" intentionally lives in RESEARCH (/r/:sym?tab=gex)
// to avoid duplicating per-ticker functionality. Cmd+K → ticker → lands there.

const VALID_TABS = TABS.map(t => t.id);

export default function GexShell() {
  const [tab, setTab] = useTabState<Tab>('hub', VALID_TABS);
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
          <p className="text-[10px] font-mono text-muted-foreground/50 mt-0.5">
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

      <QETabs items={TABS} active={tab} onChange={setTab} prefixLabel="VIEW" />

      <div className="text-[9px] font-mono text-muted-foreground/60">
        {TABS.find(t => t.id === tab)?.hint}
      </div>

      <PageErrorBoundary label={`GEX · ${tab}`}>
        <Suspense fallback={<Loading />}>
          {tab === 'hub'      && <GexHub />}
          {tab === 'matrix'   && <TerminalMx />}
          {tab === 'heatmap'  && <FlowHeatmap />}
          {tab === 'analysis' && <GexAnalysis />}
          {tab === 'buckets'  && (
            <QECard variant="default" padding="lg" className="text-center">
              <div className="text-sm font-mono uppercase tracking-widest text-muted-foreground mb-2">
                Per-DTE Buckets — coming next sprint
              </div>
              <p className="text-xs text-muted-foreground/70 max-w-md mx-auto">
                Endpoint is live (<code className="text-[var(--brand-cyan)]">/api/gex/buckets/:symbol</code>) —
                visual cards for 0DTE / Week / Month / Quarter / LEAPS ship next.
              </p>
            </QECard>
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
