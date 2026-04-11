/**
 * Command Workspace — unified Skylit per-symbol terminal.
 *
 * Single chart workspace destination. Served at:
 *   • /command/:symbol  (primary)
 *   • /command          (defaults to SPY)
 *   • /gex/:symbol      (redirected → /command/:symbol — legacy)
 *
 * Absorbs the former per-page chart destinations (GEX chart, projector,
 * chart-analysis, spx, stock detail). Every overlay layer is eventually
 * driven by URL query params (?layer=gex, ?panel=projection, ?replay=…)
 * so the chart workspace composes instead of forking.
 *
 * This file is kept intentionally thin — it's a DATA+LAYOUT orchestrator.
 * Every visual piece lives in a discrete component under
 * `components/command/*`:
 *
 *   ┌──────────────────────────────────┐ ┌──────────┐
 *   │  CommandTopNav                   │ │          │
 *   ├──────────────────────────────────┤ │          │
 *   │  GEXSnapshotHeader               │ │          │
 *   │  SkylitChart (orbs / proj / walls│ │  Command │
 *   │  CommandBottomPanels             │ │  Right   │
 *   │  CommandProjectionCard           │ │  Rail    │
 *   └──────────────────────────────────┘ └──────────┘
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useLocation } from 'wouter';
import { QEPageShell } from '@/components/ui/qe-page-shell';
import { SkylitChart } from '@/components/gex/skylit-chart';
import { GEXSnapshotHeader } from '@/components/gex/gex-snapshot-header';
import {
  CommandTopNav,
  type CommandInterval,
} from '@/components/command/command-top-nav';
import { CommandBottomPanels } from '@/components/command/command-bottom-panels';
import { CommandProjectionCard } from '@/components/command/command-projection-card';
import { CommandRightRail } from '@/components/command/command-right-rail';
import type { GEXTerminalData, GEXViewMode } from '../../../shared/gex-types';

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

export default function GEXCommandPage() {
  const params = useParams<{ symbol?: string }>();
  const [, setLocation] = useLocation();
  const symbol = (params.symbol || 'SPY').toUpperCase();
  const [mode, setMode] = useState<GEXViewMode>('orbs');
  const [interval, setInterval] = useState<CommandInterval>('15m');

  const { data, isLoading, error, refetch, isFetching } = useGEXTerminal(symbol, interval);

  const handleSymbolChange = (next: string) => {
    if (next && next !== symbol) {
      setLocation(`/command/${next.toUpperCase()}`);
    }
  };

  return (
    <QEPageShell width="full" padding="md" grid="subtle">
      <CommandTopNav
        symbol={symbol}
        onSymbolChange={handleSymbolChange}
        interval={interval}
        onIntervalChange={setInterval}
        mode={mode}
        onModeChange={setMode}
        onRefresh={refetch}
        isFetching={isFetching}
      />

      {/* LOADING / ERROR */}
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

      {/* MAIN LAYOUT */}
      {data && (
        <div className="grid grid-cols-[1fr_280px] gap-4">
          {/* LEFT: snapshot header + chart + panels + projection */}
          <div className="space-y-4 min-w-0">
            <GEXSnapshotHeader snapshot={data.snapshot} changePct={0} />

            <SkylitChart
              candles={data.candles}
              orbs={data.orbs}
              projection={data.projection}
              snapshot={data.snapshot}
              mode={mode}
              height={520}
            />

            <CommandBottomPanels snapshot={data.snapshot} heatmap={data.heatmap} />

            {data.projection && <CommandProjectionCard projection={data.projection} />}
          </div>

          {/* RIGHT: peer rail + regime insight */}
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
