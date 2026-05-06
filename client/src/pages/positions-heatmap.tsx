/**
 * POSITION HEAT MAP PAGE
 * ======================
 * Live view of all your open trade ideas with P&L-colored tiles.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────┐
 *   │  KPI BAR: TOTAL | WINNERS | LOSERS | NET P&L         │
 *   ├──────────────────────────────────────────────────────┤
 *   │  HEAT TREEMAP (size by P&L magnitude, color by gain) │
 *   │  ┌──────┬──────┬─────┬─────┐                          │
 *   │  │ NOK  │ QCOM │ MP  │BB   │                          │
 *   │  │+47%🔥│+24%🔥│+18%│+8%  │                          │
 *   │  ├──────┼──────┴─────┼─────┤                          │
 *   │  │SOUN  │AAPL  -3%   │SNAP │                          │
 *   │  │+12%  │            │-15% │                          │
 *   │  └──────┴────────────┴─────┘                          │
 *   ├──────────────────────────────────────────────────────┤
 *   │  POSITIONS TABLE (sortable, clickable)               │
 *   └──────────────────────────────────────────────────────┘
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { CacheFreshnessIndicator } from '@/components/gex/CacheFreshnessIndicator';
import { EngineStatusFooter } from '@/components/gex/EngineStatusFooter';
import { SkeletonLoader } from '@/components/gex/SkeletonLoader';
import { ExpandableCard } from '@/components/expandable-card';
import { componentStyles } from '@/lib/design-tokens';

interface LivePosition {
  id: string;
  symbol: string;
  direction: 'long' | 'short';
  assetType: string;
  entry: number;
  spot: number | null;
  target: number;
  stop: number;
  pnlPct: number;
  pnlAbs: number;
  daysActive: number;
  source: string;
  status: string;
  daysToExpiry?: number | null;
  isOption: boolean;
  strikePrice?: number | null;
  optionType?: string | null;
  heatScore: number;
  heatRank: 'fire' | 'hot' | 'warm' | 'cool' | 'frozen' | 'red';
}

interface Summary {
  total: number;
  winners: number;
  losers: number;
  totalPnLPct: number;
  totalPnLAbs: number;
  hotCount: number;
  coldCount: number;
  bestPosition: LivePosition | null;
  worstPosition: LivePosition | null;
  bySource: Record<string, number>;
  byAssetType: Record<string, number>;
}

interface PositionsResponse {
  asOf: string;
  summary: Summary;
  positions: LivePosition[];
}

const HEAT_BG: Record<LivePosition['heatRank'], string> = {
  fire: 'bg-[var(--trade-bullish)]/30 border-[var(--trade-bullish)]/60',
  hot: 'bg-[var(--trade-bullish)]/15 border-[var(--trade-bullish)]/40',
  warm: 'bg-[var(--brand-cyan)]/10 border-[var(--brand-cyan)]/30',
  cool: 'bg-muted/30 border-border/50',
  frozen: 'bg-[var(--trade-neutral)]/15 border-[var(--trade-neutral)]/40',
  red: 'bg-[var(--trade-bearish)]/30 border-[var(--trade-bearish)]/60'
};

const HEAT_LABEL: Record<LivePosition['heatRank'], string> = {
  fire: '🔥 FIRE',
  hot: '🔥 HOT',
  warm: '↑ WARM',
  cool: '— COOL',
  frozen: '↓ COLD',
  red: '🛑 RED'
};

export default function PositionsHeatmapPage() {
  const [sortBy, setSortBy] = useState<'pnl' | 'days' | 'expiry'>('pnl');

  const { data, isLoading, refetch, isFetching } = useQuery<PositionsResponse>({
    queryKey: ['positions-live'],
    queryFn: async () => {
      const res = await fetch('/api/positions/live');
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          <SkeletonLoader variant="header" />
          <SkeletonLoader variant="grid" count={1} />
          <SkeletonLoader variant="card" count={3} />
        </div>
      </div>
    );
  }

  if (!data || data.summary.total === 0) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold mb-4">Position Heat Map</h1>
          <div className={`${componentStyles.card.default} p-12 text-center`}>
            <div className="text-5xl mb-3">🎯</div>
            <div className="text-xl font-bold mb-2">No open positions</div>
            <div className="text-sm text-muted-foreground mb-4">
              Go to Trade Desk or Discovery to start tracking positions.
            </div>
            <Link href="/discovery">
              <button className="px-4 py-2 bg-[var(--brand-cyan)]/10 border border-[var(--brand-cyan)]/30 rounded text-[var(--brand-cyan)] hover:bg-[var(--brand-cyan)]/20">
                Open Discovery →
              </button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const positions = sortPositions(data.positions, sortBy);

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">🔥 Position Heat Map</h1>
            <CacheFreshnessIndicator asOf={data.asOf} />
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className={componentStyles.button.compact}
          >
            {isFetching ? '...' : '↻ Refresh'}
          </button>
        </div>

        {/* KPI Bar */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
          <KPI label="POSITIONS" value={data.summary.total.toString()} accent="cyan" />
          <KPI label="WINNERS" value={data.summary.winners.toString()} accent="emerald" sub={`${Math.round((data.summary.winners / data.summary.total) * 100)}% WR`} />
          <KPI label="LOSERS" value={data.summary.losers.toString()} accent="red" />
          <KPI label="NET P&L %" value={`${data.summary.totalPnLPct >= 0 ? '+' : ''}${data.summary.totalPnLPct}%`} accent={data.summary.totalPnLPct >= 0 ? 'emerald' : 'red'} />
          <KPI label="🔥 HOT" value={data.summary.hotCount.toString()} accent="emerald" />
          <KPI label="🛑 COLD" value={data.summary.coldCount.toString()} accent="red" />
        </div>

        {/* Best vs Worst — collapsible (default open if extreme) */}
        {data.summary.bestPosition && data.summary.worstPosition && (
          <ExpandableCard
            title="Best vs Worst"
            subtitle={`🏆 ${data.summary.bestPosition.symbol} ${data.summary.bestPosition.pnlPct >= 0 ? '+' : ''}${data.summary.bestPosition.pnlPct}% · ⚠️ ${data.summary.worstPosition.symbol} ${data.summary.worstPosition.pnlPct}%`}
            defaultOpen={Math.abs(data.summary.bestPosition.pnlPct) > 30 || Math.abs(data.summary.worstPosition.pnlPct) > 20}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <BestWorstCard position={data.summary.bestPosition} type="best" />
              <BestWorstCard position={data.summary.worstPosition} type="worst" />
            </div>
          </ExpandableCard>
        )}

        {/* HEAT TREEMAP — default open */}
        <ExpandableCard
          title="🔥 Heat Map"
          subtitle={`${positions.length} positions · size = weight · color = P&L`}
          defaultOpen
        >
          <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {positions.map(p => (
              <HeatTile key={p.id} position={p} />
            ))}
          </div>
        </ExpandableCard>

        {/* Positions Table — COLLAPSED by default */}
        <ExpandableCard
          title="Detail Table"
          subtitle={`Sorted by ${sortBy} · click row → ticker chart`}
          defaultOpen={false}
        >
          <DetailTable positions={positions} sortBy={sortBy} setSortBy={setSortBy} />
        </ExpandableCard>
      </div>
      <EngineStatusFooter signalsActive={data.summary.total} engineLabel="POSITIONS HEAT MAP v2.0" />
      <div style={{display:'none'}}>{/* keep old table reference removed */}</div>
    </div>
  );
}

function DetailTable({ positions, sortBy, setSortBy }: { positions: LivePosition[]; sortBy: 'pnl' | 'days' | 'expiry'; setSortBy: (s: 'pnl' | 'days' | 'expiry') => void; }) {
  return (
    <div>
      <div className="flex items-center justify-end mb-3 gap-1">
        {(['pnl', 'days', 'expiry'] as const).map(s => (
          <button
            key={s}
            onClick={() => setSortBy(s)}
            className={`text-[10px] px-2 py-1 rounded ${
              sortBy === s ? 'bg-[var(--brand-cyan)]/20 text-[var(--brand-cyan)]' : 'bg-muted text-muted-foreground hover:bg-muted/70'
            }`}
          >
            Sort: {s}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="py-2 pr-3">Symbol</th>
              <th className="py-2 pr-3">Type</th>
              <th className="py-2 pr-3">Dir</th>
              <th className="py-2 pr-3 text-right">Entry</th>
              <th className="py-2 pr-3 text-right">Spot</th>
              <th className="py-2 pr-3 text-right">Target</th>
              <th className="py-2 pr-3 text-right">Stop</th>
              <th className="py-2 pr-3 text-right">P&L %</th>
              <th className="py-2 pr-3 text-right">P&L $</th>
              <th className="py-2 pr-3 text-center">Days</th>
              <th className="py-2 pr-3 text-center">DTE</th>
              <th className="py-2 pr-3">Heat</th>
              <th className="py-2 pr-3">Source</th>
            </tr>
          </thead>
          <tbody>
            {positions.map(p => (
              <PositionRow key={p.id} position={p} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────

function KPI({ label, value, accent, sub }: { label: string; value: string; accent: string; sub?: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'text-[var(--trade-bullish)]',
    red: 'text-[var(--trade-bearish)]',
    cyan: 'text-[var(--brand-cyan)]',
    amber: 'text-[var(--trade-neutral)]'
  };
  return (
    <div className={`${componentStyles.card.default} p-3`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${colorMap[accent] || 'text-foreground'}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function HeatTile({ position }: { position: LivePosition }) {
  const bg = HEAT_BG[position.heatRank];
  const sizeClass =
    Math.abs(position.heatScore) > 30 ? 'col-span-2 row-span-2' :
    Math.abs(position.heatScore) > 15 ? 'col-span-2' :
    '';

  return (
    <Link href={`/t/${position.symbol}`}>
      <div className={`border rounded p-3 hover:border-[var(--brand-cyan)]/50 transition-colors cursor-pointer ${bg} ${sizeClass}`}>
        <div className="flex items-center justify-between mb-1">
          <span className="font-bold">{position.symbol}</span>
          <span className="text-[9px] opacity-70">{HEAT_LABEL[position.heatRank]}</span>
        </div>
        <div className={`text-xl font-bold font-mono ${position.pnlPct >= 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]'}`}>
          {position.pnlPct >= 0 ? '+' : ''}{position.pnlPct}%
        </div>
        <div className="text-[10px] opacity-60 mt-1">
          {position.isOption ? `${position.strikePrice}${position.optionType?.[0]?.toUpperCase()}` : 'Stock'} · {position.daysActive}d
        </div>
      </div>
    </Link>
  );
}

function BestWorstCard({ position, type }: { position: LivePosition; type: 'best' | 'worst' }) {
  return (
    <div className={`p-4 ${type === 'best' ? componentStyles.card.accentBullish : componentStyles.card.accentBearish}`}>
      <div className="text-[10px] uppercase tracking-wider mb-2 text-muted-foreground">
        {type === 'best' ? '🏆 Best Position' : '⚠️ Worst Position'}
      </div>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold">{position.symbol}</div>
          <div className="text-xs text-muted-foreground">
            {position.isOption ? `$${position.strikePrice} ${position.optionType?.toUpperCase()}` : 'Shares'} · {position.daysActive}d in
          </div>
        </div>
        <div className="text-right">
          <div className={`text-3xl font-bold ${position.pnlPct >= 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]'}`}>
            {position.pnlPct >= 0 ? '+' : ''}{position.pnlPct}%
          </div>
          <div className="text-xs text-muted-foreground">
            ${position.pnlAbs >= 0 ? '+' : ''}{position.pnlAbs}
          </div>
        </div>
      </div>
    </div>
  );
}

function PositionRow({ position }: { position: LivePosition }) {
  const heatColor =
    position.heatRank === 'fire' ? 'text-[var(--trade-bullish)]' :
    position.heatRank === 'hot' ? 'text-[var(--trade-bullish)]' :
    position.heatRank === 'warm' ? 'text-[var(--brand-cyan)]' :
    position.heatRank === 'cool' ? 'text-muted-foreground' :
    position.heatRank === 'frozen' ? 'text-[var(--trade-neutral)]' :
    'text-[var(--trade-bearish)]';

  return (
    <tr className="border-b border-border/50 hover:bg-muted/20">
      <td className="py-2 pr-3 font-bold">
        <Link href={`/t/${position.symbol}`}>
          <span className="hover:text-[var(--brand-cyan)] cursor-pointer">{position.symbol}</span>
        </Link>
      </td>
      <td className="py-2 pr-3 text-muted-foreground">
        {position.isOption ? `${position.optionType?.[0]?.toUpperCase()} $${position.strikePrice}` : 'Stk'}
      </td>
      <td className={`py-2 pr-3 ${position.direction === 'long' ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]'}`}>
        {position.direction === 'long' ? '▲' : '▼'}
      </td>
      <td className="py-2 pr-3 text-right font-mono">${position.entry.toFixed(2)}</td>
      <td className="py-2 pr-3 text-right font-mono">{position.spot ? `$${position.spot.toFixed(2)}` : '—'}</td>
      <td className="py-2 pr-3 text-right font-mono text-[var(--trade-bullish)]">${position.target.toFixed(2)}</td>
      <td className="py-2 pr-3 text-right font-mono text-[var(--trade-bearish)]">${position.stop.toFixed(2)}</td>
      <td className={`py-2 pr-3 text-right font-mono font-bold ${position.pnlPct >= 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]'}`}>
        {position.pnlPct >= 0 ? '+' : ''}{position.pnlPct}%
      </td>
      <td className={`py-2 pr-3 text-right font-mono ${position.pnlAbs >= 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]'}`}>
        ${position.pnlAbs >= 0 ? '+' : ''}{position.pnlAbs}
      </td>
      <td className="py-2 pr-3 text-center text-muted-foreground">{position.daysActive}d</td>
      <td className="py-2 pr-3 text-center text-muted-foreground">{position.daysToExpiry !== null && position.daysToExpiry !== undefined ? `${position.daysToExpiry}d` : '—'}</td>
      <td className={`py-2 pr-3 ${heatColor}`}>{HEAT_LABEL[position.heatRank]}</td>
      <td className="py-2 pr-3 text-muted-foreground text-[10px]">{position.source}</td>
    </tr>
  );
}

function sortPositions(positions: LivePosition[], by: 'pnl' | 'days' | 'expiry'): LivePosition[] {
  const sorted = [...positions];
  if (by === 'pnl') sorted.sort((a, b) => b.pnlPct - a.pnlPct);
  else if (by === 'days') sorted.sort((a, b) => b.daysActive - a.daysActive);
  else if (by === 'expiry') sorted.sort((a, b) => (a.daysToExpiry ?? 9999) - (b.daysToExpiry ?? 9999));
  return sorted;
}
