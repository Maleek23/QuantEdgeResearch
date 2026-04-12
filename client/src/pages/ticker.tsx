/**
 * Ticker page — the canonical per-symbol destination.
 *
 * URL: /t/:symbol/:tab?  (e.g. /t/PLTR, /t/PLTR/chart, /t/PLTR/gex)
 *
 * This is the page a user lands on after searching a ticker, clicking
 * a row in the scanner, or sharing a link with a friend. EVERY analytic
 * about a single symbol lives here as a tab. Discovery (scanners,
 * watchlist) and action (Trade Desk, journal) live elsewhere — this
 * page exists to be the canonical "you are looking at PLTR" home.
 *
 * Architectural choices:
 *
 *   • Data fetch lives at the page level. The terminal endpoint already
 *     returns enough payload (snapshot, candles, orbs, heatmap,
 *     projection, peers) to render most tabs. Tabs that need extra
 *     data (vol surface, options chain, news) will fetch their own.
 *
 *   • Active tab is encoded in the URL so links are deep and
 *     refreshing the page keeps the user in place.
 *
 *   • Tabs render inside a STABLE shell — the top strip (price, regime,
 *     key levels) and the right rail are visible no matter which tab
 *     you're on, so you never lose context when switching views.
 *
 *   • Stub tabs render an explicit "coming next" placeholder rather than
 *     a 404. This is deliberate: the IA must read as a complete map
 *     even before every tab has real content.
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useLocation } from 'wouter';
import { QEPageShell } from '@/components/ui/qe-page-shell';
import { TickerTopStrip } from '@/components/ticker/ticker-top-strip';
import { TickerTabNav } from '@/components/ticker/ticker-tab-nav';
import {
  DEFAULT_TICKER_TAB,
  isValidTickerTab,
  type TickerTabSlug,
} from '@/components/ticker/ticker-tabs';
import { TickerChartTab } from '@/components/ticker/tabs/ticker-chart-tab';
import { TickerGexTab } from '@/components/ticker/tabs/ticker-gex-tab';
import { TickerOverviewTab } from '@/components/ticker/tabs/ticker-overview-tab';
import { TickerOptionsTab } from '@/components/ticker/tabs/ticker-options-tab';
import { TickerVolTab } from '@/components/ticker/tabs/ticker-vol-tab';
import { TickerProjectionTab } from '@/components/ticker/tabs/ticker-projection-tab';
import { TickerCatalystsTab } from '@/components/ticker/tabs/ticker-catalysts-tab';
import { CommandRightRail } from '@/components/command/command-right-rail';
import type { CommandInterval } from '@/components/command/command-top-nav';
import type { GEXTerminalData } from '../../../shared/gex-types';

function useGEXTerminal(symbol: string, interval: string) {
  return useQuery<GEXTerminalData>({
    queryKey: ['/api/gex-vex/terminal', symbol, interval],
    queryFn: async () => {
      const res = await fetch(`/api/gex-vex/terminal/${symbol}?interval=${interval}&lookback=5`, {
        credentials: 'include',
      });
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        throw new Error(
          res.status === 401
            ? 'Not authenticated — sign in to view terminal'
            : `Terminal endpoint not available (HTTP ${res.status}). Restart dev server to register new routes.`,
        );
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || body.message || `Terminal fetch failed (${res.status})`);
      }
      return res.json();
    },
    enabled: !!symbol,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  });
}

export default function TickerPage() {
  const params = useParams<{ symbol?: string; tab?: string }>();
  const [, setLocation] = useLocation();

  const symbol = (params.symbol || 'SPY').toUpperCase();
  const tab: TickerTabSlug = isValidTickerTab(params.tab) ? params.tab : DEFAULT_TICKER_TAB;

  // If the URL didn't include a tab segment, normalise to the default
  // so links and refreshes always have a fully-qualified path. Done as
  // a side effect so the first paint doesn't flicker.
  useEffect(() => {
    if (!params.tab) {
      setLocation(`/t/${symbol}/${DEFAULT_TICKER_TAB}`, { replace: true });
    }
  }, [params.tab, symbol, setLocation]);

  const [interval, setInterval] = useState<CommandInterval>('15m');
  const { data, isLoading, error, refetch, isFetching } = useGEXTerminal(symbol, interval);

  const handleSymbolChange = (next: string) => {
    if (next && next !== symbol) {
      setLocation(`/t/${next.toUpperCase()}/${tab}`);
    }
  };

  const handleTabChange = (next: TickerTabSlug) => {
    setLocation(`/t/${symbol}/${next}`);
  };

  return (
    <QEPageShell width="full" padding="md" grid="subtle">
      {/* TOP IDENTITY STRIP — always visible across every tab */}
      <TickerTopStrip
        symbol={symbol}
        onSymbolChange={handleSymbolChange}
        snapshot={data?.snapshot ?? null}
        isLoading={isFetching}
      />

      {/* TAB NAV */}
      <TickerTabNav activeTab={tab} onTabChange={handleTabChange} />

      {/* LOADING / ERROR BANNERS */}
      {isLoading && (
        <div className="p-12 text-center text-xs font-mono text-muted-foreground">
          LOADING {symbol} TERMINAL…
        </div>
      )}
      {error && (
        <div className="p-6 text-center text-xs font-mono text-[var(--trade-bearish)] border border-[var(--trade-bearish)]/30 rounded-lg">
          FAILED TO LOAD TERMINAL — {(error as Error).message}
        </div>
      )}

      {/* MAIN GRID — tab content + persistent right rail */}
      {data && (
        <div className="grid grid-cols-[1fr_280px] gap-4">
          <div className="min-w-0">
            <TabContent
              tab={tab}
              symbol={symbol}
              data={data}
              interval={interval}
              onIntervalChange={setInterval}
              onSymbolChange={handleSymbolChange}
              onRefresh={() => {
                refetch();
              }}
              isFetching={isFetching}
            />
          </div>

          <CommandRightRail
            peers={data.peers}
            currentSymbol={symbol}
            regime={data.snapshot.regime}
          />
        </div>
      )}
    </QEPageShell>
  );
}

// ────────────────────────────────────────────────────────────────────

interface TabContentProps {
  tab: TickerTabSlug;
  symbol: string;
  data: GEXTerminalData;
  interval: CommandInterval;
  onIntervalChange: (next: CommandInterval) => void;
  onSymbolChange: (next: string) => void;
  onRefresh: () => void;
  isFetching: boolean;
}

function TabContent({
  tab,
  symbol,
  data,
  interval,
  onIntervalChange,
  onSymbolChange,
  onRefresh,
  isFetching,
}: TabContentProps) {
  switch (tab) {
    case 'chart':
      return (
        <TickerChartTab
          symbol={symbol}
          data={data}
          interval={interval}
          onIntervalChange={onIntervalChange}
          onSymbolChange={onSymbolChange}
          onRefresh={onRefresh}
          isFetching={isFetching}
        />
      );
    case 'gex':
      return <TickerGexTab data={data} />;
    case 'overview':
      return <TickerOverviewTab data={data} symbol={symbol} />;
    case 'options':
      return <TickerOptionsTab symbol={symbol} />;
    case 'vol':
      return <TickerVolTab symbol={symbol} />;
    case 'projection':
      return <TickerProjectionTab data={data} symbol={symbol} />;
    case 'catalysts':
      return <TickerCatalystsTab symbol={symbol} />;
    default:
      return <TickerOverviewTab data={data} symbol={symbol} />;
  }
}
