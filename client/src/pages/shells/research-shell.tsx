/**
 * RESEARCH — the canonical per-ticker home.
 *
 *   URL: /r/:symbol[?tab=workup|gex|analyze]
 *   (legacy ?tab=chart|options|flow land inside the Dossier — see effect below)
 *
 * Header:
 *   • TickerSwitcher (hierarchical: recent / watchlist / sector groups / search)
 *   • Live price + change pill (from /api/quotes/batch)
 *
 * Tabs:
 *   Dossier       — TickerWorkup: overview, chart, options, events, execution gates
 *   GEX surface   — walls · flip · expiry matrix · dealer flow (research/terminal-heatmap)
 *   Contract lab  — ContractAnalyzer: paste any contract for a contract-level read
 *
 * Symbol propagation:
 *   useParams() reads URL → setCurrentStock() updates global StockContext
 *   → children that read currentStock see the right ticker without prop-drilling.
 *
 * GEX → Per-Symbol shortcut redirects here with ?tab=gex (no duplication).
 *
 * 2026-09-29: header in the page template (LuxPageHeader — the Journal's
 * eyebrow / display title / purpose / actions), tabs in the controls row.
 */
import { useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';

import { QETabs, type QETabItem } from '@/components/ui/qe-tabs';
import { TickerSwitcher } from '@/components/ticker-switcher';
import { useTabState } from '@/hooks/use-tab-state';
import { useStockContext } from '@/contexts/stock-context';
import { PageErrorBoundary } from '@/components/page-error-boundary';
import { LuxButton, LuxPage, LuxPageHeader } from '@/components/lux';

// Lazy children — each is the existing implementation, now reading symbol via context
const TerminalHeatmap  = lazy(() => import('@/components/research/terminal-heatmap'));
const ContractAnalyzer = lazy(() => import('@/components/contract-analyzer').then(m => ({ default: m.ContractAnalyzer })));

const TickerWorkup     = lazy(() => import('@/components/workup/ticker-workup').then(m => ({ default: m.TickerWorkup })));

type Tab = 'workup' | 'gex' | 'analyze';

const TABS: readonly QETabItem<Tab>[] = [
  { id: 'workup',   label: 'Dossier',       hint: 'One live workspace · overview, chart, options, events and execution gates' },
  { id: 'gex',      label: 'GEX surface',   hint: 'Specialist surface · walls, flip, expiry matrix and dealer positioning' },
  { id: 'analyze',  label: 'Contract lab',  hint: 'Paste any contract for a separate contract-level analysis' },
];

const VALID_TABS = TABS.map(t => t.id);

export default function ResearchShell() {
  const { symbol: rawSym } = useParams<{ symbol: string }>();
  const [, setLocation] = useLocation();
  const { currentStock, setCurrentStock } = useStockContext();
  const [tab, setTab] = useTabState<Tab>('workup', VALID_TABS);

  const symbol = (rawSym ?? 'SPY').toUpperCase();
  const source = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('from') : null;
  const requestedLegacyTab = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tab') : null;
  const initialWorkupTab = requestedLegacyTab === 'chart' || requestedLegacyTab === 'options'
    ? requestedLegacyTab
    : 'overview';
  const returnTab = source?.startsWith('terminal-') ? source.replace('terminal-', '') : null;

  // 1) Sync URL :symbol → StockContext so children see the right ticker
  useEffect(() => {
    if (!symbol) return;
    if (!currentStock || currentStock.symbol !== symbol) {
      setCurrentStock({ symbol });
    }
  }, [symbol, currentStock, setCurrentStock]);

  // Old links opened separate Chart / Options / Flow applications with their
  // own headers and interaction grammar. Keep those URLs working, but land
  // them inside the canonical dossier instead of rendering a duplicate UI.
  useEffect(() => {
    if (!requestedLegacyTab || !['chart', 'options', 'flow'].includes(requestedLegacyTab)) return;
    const params = new URLSearchParams(window.location.search);
    params.delete('tab');
    setLocation(`/r/${symbol}${params.size ? `?${params.toString()}` : ''}`, { replace: true });
  }, [requestedLegacyTab, setLocation, symbol]);

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
    setLocation(`/r/${sym.toUpperCase()}${tab !== 'workup' ? `?tab=${tab}` : ''}`);
  };

  const up = (quote?.changePct ?? 0) >= 0;
  const gex = tab === 'gex';
  return (
    // The GEX surface is a full-height workspace: the shell becomes exactly
    // main's height and hands the rest to the grid, which scrolls inside itself.
    <LuxPage
      width="full"
      className={gex ? 'h-[var(--qe-main-h,100dvh)] min-h-[520px]' : undefined}
      style={gex ? { paddingBottom: 12, gap: 12 } : undefined}
    >
      <LuxPageHeader
        section="Research"
        context="one symbol · every engine"
        title={symbol}
        purpose={
          <>
            {quote && Number.isFinite(quote.price) ? (
              <span style={{ fontFamily: 'var(--lx-font-data)' }}>
                <b className="text-foreground">${quote.price.toFixed(2)}</b>{' '}
                {Number.isFinite(quote.changePct) && <span className={up ? 'lx-tone-gain' : 'lx-tone-loss'}>{up ? '▲ +' : '▼ −'}{Math.abs(quote.changePct).toFixed(2)}%</span>}
                <span> · live, refreshes 30s</span>
              </span>
            ) : (
              <span style={{ fontFamily: 'var(--lx-font-data)' }}>quote loading…</span>
            )}
            <span> — {TABS.find(t => t.id === tab)?.hint}</span>
          </>
        }
        actions={
          <>
            <LuxButton
              variant="ghost"
              onClick={() => setLocation(returnTab && returnTab !== 'oracle' ? `/t?tab=${returnTab}` : '/t')}
              title={returnTab ? `Back to ${returnTab}` : 'Back to terminal'}
            >
              <ArrowLeft aria-hidden /> {returnTab && returnTab !== 'oracle' ? `Back to ${returnTab}` : 'Terminal'}
            </LuxButton>
            <TickerSwitcher value={symbol} onChange={handleSymbolChange} />
          </>
        }
      >
        {/* SUB-NAV TABS */}
        <QETabs items={TABS} active={tab} onChange={setTab} prefixLabel="VIEW" />
      </LuxPageHeader>

      {/* CONTENT */}
      <PageErrorBoundary label={`Research · ${symbol} · ${tab}`}>
        <Suspense fallback={<Loading />}>
          {/* Re-key on (symbol, tab) so children get fresh state on switch */}
          <div key={`${symbol}-${tab}`} className={gex ? 'flex min-h-0 flex-1 flex-col' : undefined}>
            {tab === 'workup'  && <TickerWorkup symbol={symbol} mode="embedded" initialTab={initialWorkupTab} onNavigate={(next) => { if (next === 'gex') setTab('gex'); }} />}
            {tab === 'gex'     && <TerminalHeatmap />}
            {tab === 'analyze' && <ContractAnalyzer />}
          </div>
        </Suspense>
      </PageErrorBoundary>
    </LuxPage>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center h-48">
      <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--lx-accent-text)' }} aria-label="Loading" />
    </div>
  );
}
