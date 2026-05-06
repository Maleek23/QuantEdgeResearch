/**
 * FLOW HEATMAP PAGE
 * =================
 * Inspired by MomoEdge's Live Flow Heatmap.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  KPI BAR: BREADTH | NET FLOW | SWEEPS | WHALES          │
 *   ├─────────────────────────────────────────────────────────┤
 *   │  SECTOR TREEMAP (size = flow $, color = bull/bear)      │
 *   │  ┌─TECH─────┐ ┌─COMM─┐ ┌─FIN──┐                         │
 *   │  │NVDA│AAPL│ │META│  │JPM│ V │                         │
 *   │  ├────┴────┤ │NFLX│  ├──┴───┤                          │
 *   │  │MSFT│AMD │ │GOOG│  │COIN│..│                         │
 *   │  └────┴────┘ └────┘  └──┴───┘                          │
 *   ├─────────────────────────────────────────────────────────┤
 *   │  TICKER DETAIL RAIL (click any tile to expand)          │
 *   │   Price · Mkt Cap · Flow Premium · Bull/Bear            │
 *   │   Sweeps · Whales · Unusual · Flow Intensity · Badges   │
 *   └─────────────────────────────────────────────────────────┘
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { componentStyles } from '@/lib/design-tokens';

interface Ticker {
  symbol: string;
  flowPremium: number;
  flowPremiumDisplay: string;
  bullPremium: number;
  bearPremium: number;
  bullPct: number;
  sentiment: number;
  sweeps: number;
  whales: number;
  unusualCount: number;
  flowIntensity: number;
  bearBullRatio: number;
  badges: string[];
  divergence: 'Aligned' | 'Divergent' | 'Neutral';
  avgDTE: number;
  callVol: number;
  putVol: number;
  callOI: number;
  putOI: number;
  iv: number;
  price: number;
  changePct: number;
  rank: number;
  sector: string;
}

interface Sector {
  symbol: string;
  name: string;
  greenCount: number;
  totalCount: number;
  netFlowPct: number;
  tickers: Ticker[];
}

interface FlowHeatmap {
  asOf: string;
  kpi: {
    breadth: number;
    netFlow: number;
    netFlowDisplay: string;
    sweeps: number;
    whales: number;
  };
  sectors: Sector[];
}

export default function FlowHeatmapPage() {
  const [selected, setSelected] = useState<Ticker | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery<FlowHeatmap>({
    queryKey: ['flow-heatmap'],
    queryFn: async () => {
      const res = await fetch('/api/flow/heatmap');
      return res.json();
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });

  if (isLoading || !data) {
    return <div className="min-h-screen bg-background text-foreground p-6">Loading flow heatmap...</div>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-7xl mx-auto">

        {/* HEADER */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">⚡ Live Flow Heatmap</h1>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(data.asOf).toLocaleTimeString()} ET · Auto-refresh 60s
            </p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className={componentStyles.button.compact}
          >
            {isFetching ? '...' : '↻ Refresh'}
          </button>
        </div>

        {/* KPI BAR */}
        <FlowKPIBar kpi={data.kpi} />

        {/* SECTOR GRID (treemap-style) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
          {data.sectors.map((sector) => (
            <SectorTile key={sector.symbol} sector={sector} onClickTicker={setSelected} />
          ))}
        </div>

        {/* TICKER DETAIL RAIL */}
        {selected && (
          <TickerFlowDetail ticker={selected} onClose={() => setSelected(null)} />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FlowKPIBar — top stats
// ═══════════════════════════════════════════════════════════════
function FlowKPIBar({ kpi }: { kpi: FlowHeatmap['kpi'] }) {
  return (
    <div className={`${componentStyles.card.default} p-4`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs uppercase tracking-wider text-[var(--trade-bullish)] font-bold">● LIVE FLOW</span>
        <span className="text-xs text-muted-foreground">{new Date().toLocaleTimeString()} ET</span>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <KPI label="BREADTH" value={`${kpi.breadth}%`} accent={kpi.breadth >= 50 ? 'green' : 'red'} />
        <KPI label="NET FLOW" value={kpi.netFlowDisplay} accent="cyan" />
        <KPI label="SWEEPS" value={kpi.sweeps.toLocaleString()} accent="amber" />
        <KPI label="WHALES" value={kpi.whales.toString()} accent="purple" />
      </div>
    </div>
  );
}

function KPI({ label, value, accent }: { label: string; value: string; accent: 'green' | 'red' | 'cyan' | 'amber' | 'purple' }) {
  const colorMap = {
    green: 'text-[var(--trade-bullish)]',
    red: 'text-[var(--trade-bearish)]',
    cyan: 'text-[var(--brand-cyan)]',
    amber: 'text-[var(--trade-neutral)]',
    purple: 'text-violet-400'
  };
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${colorMap[accent]}`}>{value}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SectorTile — treemap-style sector with ticker tiles
// ═══════════════════════════════════════════════════════════════
function SectorTile({ sector, onClickTicker }: { sector: Sector; onClickTicker: (t: Ticker) => void }) {
  const sectorColor =
    sector.netFlowPct >= 15 ? 'border-[var(--trade-bullish)]/40 bg-[var(--trade-bullish)]/5' :
    sector.netFlowPct >= 0 ? 'border-border bg-card' :
    sector.netFlowPct <= -15 ? 'border-[var(--trade-bearish)]/40 bg-[var(--trade-bearish)]/5' :
    'border-border bg-card';

  // Sort tickers by flow premium descending
  const sortedTickers = [...sector.tickers].sort((a, b) => b.flowPremium - a.flowPremium);
  const maxFlow = sortedTickers[0]?.flowPremium || 1;

  return (
    <div className={`border rounded-lg p-3 ${sectorColor}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold tracking-wider">{sector.name}</span>
          <span className="text-[10px] text-muted-foreground">{sector.greenCount}/{sector.totalCount} · {sector.symbol}</span>
        </div>
        <span className={`text-xs font-mono font-bold ${sector.netFlowPct >= 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]'}`}>
          {sector.netFlowPct >= 0 ? '+' : ''}{sector.netFlowPct}%
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {sortedTickers.slice(0, 6).map((t) => (
          <TickerTile key={t.symbol} ticker={t} onClick={() => onClickTicker(t)} maxFlow={maxFlow} />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TickerTile — single ticker in heatmap
// ═══════════════════════════════════════════════════════════════
function TickerTile({ ticker, onClick, maxFlow }: { ticker: Ticker; onClick: () => void; maxFlow: number }) {
  const intensity = Math.max(0.15, ticker.flowPremium / maxFlow);
  const tileColor =
    ticker.changePct > 0 ? `rgba(16, 185, 129, ${intensity * 0.5})` :
    ticker.changePct < 0 ? `rgba(239, 68, 68, ${intensity * 0.5})` :
    'rgba(100, 100, 100, 0.1)';
  const borderColor =
    ticker.changePct > 0 ? 'border-[var(--trade-bullish)]/30' :
    ticker.changePct < 0 ? 'border-[var(--trade-bearish)]/30' :
    'border-border';

  return (
    <button
      onClick={onClick}
      className={`text-left p-2 rounded border ${borderColor} hover:border-[var(--brand-cyan)]/50 transition-colors`}
      style={{ backgroundColor: tileColor }}
    >
      <div className="flex items-center justify-between">
        <span className="font-bold text-sm">{ticker.symbol}</span>
        {ticker.badges.length > 0 && (
          <span className="text-xs">{ticker.badges.join('')}</span>
        )}
      </div>
      <div className="text-xs text-foreground/80 font-mono mt-0.5">
        ${ticker.flowPremiumDisplay}
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════
// TickerFlowDetail — expanded panel when ticker clicked
// ═══════════════════════════════════════════════════════════════
function TickerFlowDetail({ ticker, onClose }: { ticker: Ticker; onClose: () => void }) {
  return (
    <div className="fixed bottom-4 right-4 left-4 md:left-auto md:w-[420px] bg-card border border-[var(--brand-cyan)]/40 rounded-lg shadow-2xl z-50 max-h-[80vh] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold">{ticker.symbol}</span>
            {ticker.badges.length > 0 && (
              <span className="text-lg">{ticker.badges.join(' ')}</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{ticker.sector} · Rank #{ticker.rank}</div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        {/* Price + change */}
        <div className="grid grid-cols-2 gap-3">
          <Stat label="PRICE" value={`$${ticker.price.toFixed(2)}`} />
          <Stat label="CHANGE" value={`${ticker.changePct >= 0 ? '+' : ''}${ticker.changePct}%`}
            color={ticker.changePct >= 0 ? 'emerald' : 'red'} />
          <Stat label="FLOW PREMIUM" value={`$${ticker.flowPremiumDisplay}`} color="cyan" />
          <Stat label="IV" value={`${ticker.iv.toFixed(1)}%`} />
        </div>

        {/* Bull/Bear split */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-[var(--trade-bullish)] font-bold">BULL ${(ticker.bullPremium / 1e6).toFixed(1)}M</span>
            <span className="text-[var(--trade-bearish)] font-bold">${(ticker.bearPremium / 1e6).toFixed(1)}M BEAR</span>
          </div>
          <div className="h-2.5 rounded-full overflow-hidden flex">
            <div className="bg-[var(--trade-bullish)]" style={{ width: `${ticker.bullPct}%` }} />
            <div className="bg-[var(--trade-bearish)]" style={{ width: `${100 - ticker.bullPct}%` }} />
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2">
          <Stat label="BEAR/BULL" value={ticker.bearBullRatio.toFixed(2)} small />
          <Stat label="SENTIMENT" value={`${ticker.sentiment >= 0 ? '+' : ''}${ticker.sentiment}%`}
            color={ticker.sentiment >= 0 ? 'emerald' : 'red'} small />
          <Stat label="SWEEPS" value={ticker.sweeps.toString()} small />
          <Stat label="WHALES" value={ticker.whales.toString()} small />
          <Stat label="UNUSUAL" value={ticker.unusualCount.toString()} small />
          <Stat label="FLOW INTENSITY" value={`${ticker.flowIntensity}/10`} color="amber" small />
          <Stat label="AVG DTE" value={`${ticker.avgDTE}d`} small />
          <Stat label="DIVERGENCE" value={ticker.divergence}
            color={ticker.divergence === 'Aligned' ? 'emerald' : ticker.divergence === 'Divergent' ? 'red' : 'zinc'} small />
        </div>

        {/* Volume & OI */}
        <div className="pt-2 border-t border-border">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Options</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">Call Vol</span><span className="text-[var(--brand-cyan)] font-mono">{ticker.callVol.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Put Vol</span><span className="text-[var(--trade-bearish)] font-mono">{ticker.putVol.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Call OI</span><span className="font-mono">{ticker.callOI.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Put OI</span><span className="font-mono">{ticker.putOI.toLocaleString()}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color = 'zinc', small = false }: { label: string; value: string; color?: 'emerald' | 'red' | 'cyan' | 'amber' | 'zinc'; small?: boolean }) {
  const colorMap = {
    emerald: 'text-[var(--trade-bullish)]',
    red: 'text-[var(--trade-bearish)]',
    cyan: 'text-[var(--brand-cyan)]',
    amber: 'text-[var(--trade-neutral)]',
    zinc: 'text-foreground'
  };
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`${small ? 'text-sm' : 'text-base'} font-bold ${colorMap[color]}`}>{value}</div>
    </div>
  );
}
