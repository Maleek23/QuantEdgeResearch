/**
 * TickerChartTab — mounts the Skylit chart workspace under the new
 * canonical ticker page.
 *
 * This is the same chart + bottom panels + projection card layout that
 * used to live inline in `pages/gex-command.tsx`. Extracting it here
 * means the new `/t/:symbol/chart` route uses the SAME code path as the
 * legacy `/command/:symbol` redirect, so visual parity is guaranteed.
 *
 * The tab takes the already-fetched terminal data as a prop — the page
 * shell owns the fetch so multiple tabs can share one payload without
 * triggering duplicate network calls when the user flips tabs.
 */

import { useState } from 'react';
import { SkylitChart } from '@/components/gex/skylit-chart';
import {
  CommandTopNav,
  type CommandInterval,
} from '@/components/command/command-top-nav';
import { CommandBottomPanels } from '@/components/command/command-bottom-panels';
import { CommandProjectionCard } from '@/components/command/command-projection-card';
import type { GEXTerminalData, GEXViewMode } from '../../../../../shared/gex-types';

interface TickerChartTabProps {
  symbol: string;
  data: GEXTerminalData;
  interval: CommandInterval;
  onIntervalChange: (next: CommandInterval) => void;
  onSymbolChange: (next: string) => void;
  onRefresh: () => void;
  isFetching: boolean;
}

export function TickerChartTab({
  symbol,
  data,
  interval,
  onIntervalChange,
  onSymbolChange,
  onRefresh,
  isFetching,
}: TickerChartTabProps) {
  // View mode lives at the tab level — flipping tabs and coming back
  // shouldn't reset which canvas layer is active.
  const [mode, setMode] = useState<GEXViewMode>('orbs');

  return (
    <div className="space-y-4 min-w-0">
      <CommandTopNav
        symbol={symbol}
        onSymbolChange={onSymbolChange}
        interval={interval}
        onIntervalChange={onIntervalChange}
        mode={mode}
        onModeChange={setMode}
        onRefresh={onRefresh}
        isFetching={isFetching}
      />

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
  );
}
