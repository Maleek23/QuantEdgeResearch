/**
 * RESEARCH — the canonical per-ticker home.
 *
 *   URL: /r/:symbol[?tab=chart|options|gex|flow|news|setups|analysis]
 *
 * Header:
 *   • TickerSwitcher (hierarchical: recent / watchlist / sector groups / search)
 *   • Live price + change pill (from /api/quote)
 *   • Sector/tier tags
 *
 * Tabs:
 *   Chart    — price + key levels + GEX overlays  (terminal-chart.tsx)
 *   Options  — chain · greeks · IV · ROI         (options-analyzer.tsx)
 *   GEX      — walls · flip · matrix · dealer flow (terminal-heatmap.tsx)
 *   Flow     — unusual options activity for this ticker (next sprint stub)
 *   News     — catalysts + sentiment (next sprint stub)
 *   Setups   — active trade ideas tied to this symbol (next sprint stub)
 *   Analysis — TA + FA combined (next sprint stub)
 *
 * Symbol propagation:
 *   useParams() reads URL → setCurrentStock() updates global StockContext
 *   → terminal-chart, options-analyzer, etc. (which already read currentStock)
 *     all see the right ticker without prop-drilling.
 *
 * GEX → Per-Symbol shortcut redirects here with ?tab=gex (no duplication).
 */
import { useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';

import { QETabs, type QETabItem, QECard } from '@/components/ui/qe';
import { TickerSwitcher } from '@/components/ticker-switcher';
import { useTabState } from '@/hooks/use-tab-state';
import { useStockContext } from '@/contexts/stock-context';
import { PageErrorBoundary } from '@/components/page-error-boundary';

// Lazy children — each is the existing implementation, now reading symbol via context
const TerminalChart    = lazy(() => import('@/pages/terminal-chart'));
const TerminalHeatmap  = lazy(() => import('@/pages/terminal-heatmap'));
const OptionsAnalyzer  = lazy(() => import('@/pages/options-analyzer'));
const FlowTable        = lazy(() => import('@/components/research/flow-table').then(m => ({ default: m.FlowTable })));

type Tab = 'chart' | 'options' | 'gex' | 'flow' | 'news' | 'setups' | 'analysis';

const TABS: readonly QETabItem<Tab>[] = [
  { id: 'chart',    label: 'Chart',    hint: 'Price + key levels + GEX overlays' },
  { id: 'options',  label: 'Options',  hint: 'Chain · greeks · IV · ROI scenarios' },
  { id: 'gex',      label: 'GEX',      hint: 'Walls · flip · expiry matrix · dealer flow' },
  { id: 'flow',     label: 'Flow',     hint: 'Live unusual options activity — sweeps, blocks, dark pool' },
  { id: 'news',     label: 'News',     hint: 'Headlines + sentiment + catalysts', disabled: true },
  { id: 'setups',   label: 'Setups',   hint: 'Active trade ideas tied to this symbol', disabled: true },
  { id: 'analysis', label: 'Analysis', hint: 'TA + FA combined deep dive', disabled: true },
];

const VALID_TABS = TABS.map(t => t.id);

export default function ResearchShell() {
  const { symbol: rawSym } = useParams<{ symbol: string }>();
  const [, setLocation] = useLocation();
  const { currentStock, setCurrentStock } = useStockContext();
  const [tab, setTab] = useTabState<Tab>('chart', VALID_TABS);

  const symbol = (rawSym ?? 'SPY').toUpperCase();

  // 1) Sync URL :symbol → StockContext so children see the right ticker
  useEffect(() => {
    if (!symbol) return;
    if (!currentStock || currentStock.symbol !== symbol) {
      setCurrentStock({ symbol });
    }
  }, [symbol, currentStock, setCurrentStock]);

  // 3) Live quote for header — uses /api/quotes/batch (the endpoint that actually exists)
  const { data: quote } = useQuery<{ price: number; change: number; changePct: number }>({
    queryKey: ['/api/quotes/batch', symbol],
    queryFn: async () => {
      const res = await fetch(`/api/quotes/batch/${symbol}`, { credentials: 'include' });
      if (!res.ok) throw new Error('quote failed');
      const body = await res.json();
      const q = body?.quotes?.[symbol];
      if (!q) throw new Error('no quote');
      return { price: q.price, change: q.change, changePct: q.changePercent };
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 1,
    enabled: !!symbol,
  });

  const handleSymbolChange = (sym: string) => {
    setLocation(`/r/${sym.toUpperCase()}${tab !== 'chart' ? `?tab=${tab}` : ''}`);
  };

  return (
    <div className="space-y-3 px-4 py-3">
      {/* HEADER — ticker switcher + price + sector tags */}
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <TickerSwitcher
            value={symbol}
            onChange={handleSymbolChange}
            price={quote?.price}
            changePct={quote?.changePct}
          />
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Research
          </span>
        </div>
      </header>

      {/* SUB-NAV TABS */}
      <QETabs items={TABS} active={tab} onChange={setTab} prefixLabel="VIEW" />

      <div className="text-[9px] font-mono text-muted-foreground/60">
        {TABS.find(t => t.id === tab)?.hint}
      </div>

      {/* CONTENT */}
      <PageErrorBoundary label={`Research · ${symbol} · ${tab}`}>
        <Suspense fallback={<Loading />}>
          {/* Re-key on (symbol, tab) so children get fresh state on switch */}
          <div key={`${symbol}-${tab}`}>
            {tab === 'chart'   && <TerminalChart />}
            {tab === 'options' && <OptionsAnalyzer />}
            {tab === 'gex'     && <TerminalHeatmap />}
            {tab === 'flow'    && <FlowTable symbol={symbol} />}
            {(tab === 'news' || tab === 'setups' || tab === 'analysis') && (
              <ComingSoon tab={tab} symbol={symbol} />
            )}
          </div>
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

function ComingSoon({ tab, symbol }: { tab: string; symbol: string }) {
  return (
    <QECard variant="default" padding="lg" className="text-center">
      <div className="text-sm font-mono uppercase tracking-widest text-muted-foreground mb-2">
        {symbol} · {tab} — coming next sprint
      </div>
      <p className="text-xs text-muted-foreground/70 max-w-md mx-auto">
        Foundation is shipped. Chart / Options / GEX work today; Flow / News / Setups / Analysis ship next.
      </p>
    </QECard>
  );
}
