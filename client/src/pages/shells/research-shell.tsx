/**
 * /r/:symbol — THE TICKER PAGE route (docs/TICKER_PAGE.md).
 *
 * What you get when you search a ticker: one page with one price, a verdict,
 * the dealer map and the chart above the fold, then Options · Setups ·
 * Evidence · Peers · News as anchored sections.
 *
 * URL grammar (every legacy form keeps working — client/src/lib/legacy-redirects.ts
 * still points old routes here with their ?tab=):
 *   /r/:symbol                       the page
 *   /r/:symbol#options|setups|…      a section
 *   /r/:symbol?tab=gex               → the ONE GEX workspace (/t?tab=gex) focused on :symbol
 *   /r/:symbol?tab=analyze           Contract lab
 *   ?tab=chart|options|flow|events|workup   → the page, scrolled to that section
 *
 * Retired here (2026-09-29): the Dossier / GEX surface / Contract lab tab row
 * and the Dossier's inner Overview / Chart / Options / Events / Bot tabs.
 */
import { useEffect } from 'react';
import { useParams, useLocation, useSearch } from 'wouter';
import { useStockContext } from '@/contexts/stock-context';
import { PageErrorBoundary } from '@/components/page-error-boundary';
import { TickerPage, type TickerView } from '@/components/ticker/ticker-page';

/** Legacy ?tab= values → the section they now live in. */
const TAB_TO_SECTION: Record<string, string> = {
  chart: 'chart', options: 'options', flow: 'options', events: 'news', bot: 'setups', workup: 'overview', overview: 'overview',
};

export default function ResearchShell() {
  const { symbol: rawSym } = useParams<{ symbol: string }>();
  const [, setLocation] = useLocation();
  const { currentStock, setCurrentStock } = useStockContext();

  const symbol = (rawSym ?? 'SPY').toUpperCase();
  const search = useSearch(); // subscribes: ?tab= changes re-render without a path change
  const params = new URLSearchParams(search);
  const tab = params.get('tab');
  const view: TickerView = tab === 'gex' ? 'gex' : tab === 'analyze' ? 'lab' : 'page';
  const section = tab ? TAB_TO_SECTION[tab] ?? null : null;
  const source = params.get('from');
  const returnTab = source?.startsWith('terminal-') ? source.replace('terminal-', '') : null;

  // URL :symbol → StockContext, so the GEX surface / Contract lab see the ticker.
  useEffect(() => {
    if (currentStock?.symbol !== symbol) setCurrentStock({ symbol });
  }, [symbol, currentStock, setCurrentStock]);

  // One GEX page: ?tab=gex hands off to the GEX workspace with this ticker
  // focused (the ticker page keeps only its levels strip).
  useEffect(() => {
    if (tab !== 'gex') return;
    setCurrentStock({ symbol });
    setLocation('/t?tab=gex', { replace: true });
  }, [tab, symbol, setCurrentStock, setLocation]);

  // A legacy section tab is consumed once: drop it from the URL (keeping any
  // other params) and let the page scroll to the section.
  useEffect(() => {
    if (!section) return;
    const next = new URLSearchParams(window.location.search);
    next.delete('tab');
    const t = window.setTimeout(() => {
      setLocation(`/r/${symbol}${next.size ? `?${next.toString()}` : ''}#${section}`, { replace: true });
    }, 600);
    return () => window.clearTimeout(t);
  }, [section, setLocation, symbol]);

  const withParams = (sym: string, v: TickerView) => {
    const next = new URLSearchParams();
    if (source) next.set('from', source);
    if (v === 'gex') next.set('tab', 'gex');
    if (v === 'lab') next.set('tab', 'analyze');
    return `/r/${encodeURIComponent(sym.toUpperCase())}${next.size ? `?${next.toString()}` : ''}`;
  };

  return (
    <PageErrorBoundary label={`Ticker · ${symbol}`}>
      <TickerPage
        key={symbol}
        symbol={symbol}
        view={view}
        initialSection={section}
        onView={(v) => setLocation(withParams(symbol, v))}
        onSymbol={(sym) => setLocation(withParams(sym, view))}
        backTo={returnTab ? {
          label: returnTab === 'oracle' ? 'Terminal' : `Back to ${returnTab}`,
          onClick: () => setLocation(returnTab === 'oracle' ? '/t' : `/t?tab=${returnTab}`),
        } : null}
      />
    </PageErrorBoundary>
  );
}
