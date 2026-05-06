/**
 * GEX HUB DASHBOARD
 * =================
 * Consumes the FULL /api/gex-vex/hub payload.
 * Replaces flow-edge's partial UI with comprehensive view.
 *
 * Renders:
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  HEADER: Market Net GEX | Net VEX | Regime | Cache age  │
 *   ├─────────────────────────────────────────────────────────┤
 *   │  REGIME DISTRIBUTION DONUT                              │
 *   │  Positive Γ: X% | Negative Γ: Y% | Neutral: Z%          │
 *   ├──────────────────────────┬──────────────────────────────┤
 *   │  TOP +GEX (pin candidates) │  TOP -GEX (squeeze cands)   │
 *   ├──────────────────────────┴──────────────────────────────┤
 *   │  TOP VEX (vanna movers)                                 │
 *   ├─────────────────────────────────────────────────────────┤
 *   │  SECTOR AGGREGATES (sortable)                           │
 *   ├─────────────────────────────────────────────────────────┤
 *   │  TOP ACTIONABLE PLAYS (full SignalCard grid)            │
 *   └─────────────────────────────────────────────────────────┘
 */

import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { CacheFreshnessIndicator } from './CacheFreshnessIndicator';
import { EmptyGexState } from './EmptyGexState';
import { SkeletonLoader } from './SkeletonLoader';

interface HubLeaderRow {
  symbol: string;
  tier: string | null;
  spotPrice: number;
  changePct: number;
  totalGEX: number;
  totalVEX: number;
  score: number;
  regime: string;
  bias: string;
  sector: string;
  callWall: number | null;
  putWall: number | null;
}

interface SectorAggregate {
  sector: string;
  label: string;
  symbols: string[];
  netGEX: number;
  netVEX: number;
  avgScore: number;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  topPick: string | null;
}

interface TopPlay {
  symbol: string;
  sector: string;
  spotPrice: number;
  gammaFlip: number | null;
  flipDistancePct: number;
  isAboveFlip: boolean;
  callWall: number | null;
  putWall: number | null;
  totalGEX?: number;
  totalVEX?: number;
  score?: number;
  bias?: string;
  thesis?: string;
}

interface RegimeDistribution {
  positive_gamma: number;
  negative_gamma: number;
  neutral: number;
  transitioning: number;
  total: number;
}

interface GEXHubData {
  scannedAt: number;
  marketRegime: string;
  totalTickers: number;
  topPositiveGEX: HubLeaderRow[];
  topNegativeGEX: HubLeaderRow[];
  topVEX: HubLeaderRow[];
  sectors: SectorAggregate[];
  regimeDistribution: RegimeDistribution;
  marketNetGEX: number;
  marketNetVEX: number;
  topPlays: TopPlay[];
}

export function GexHubDashboard() {
  const { data, isLoading, refetch, isFetching } = useQuery<{ hub: GEXHubData; scan: any }>({
    queryKey: ['gex-hub'],
    queryFn: async () => {
      const res = await fetch('/api/gex-vex/hub', { credentials: 'include' });
      if (!res.ok) throw new Error('GEX Hub fetch failed');
      return res.json();
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonLoader variant="header" />
        <SkeletonLoader variant="grid" count={1} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonLoader variant="card" count={1} />
          <SkeletonLoader variant="card" count={1} />
        </div>
        <SkeletonLoader variant="card" count={1} />
      </div>
    );
  }

  if (!data?.hub) {
    return <EmptyGexState reason="data_unavailable" onRetry={() => refetch()} />;
  }

  const hub = data.hub;
  const totalRegime = hub.regimeDistribution.total || 1;
  const posPct = (hub.regimeDistribution.positive_gamma / totalRegime) * 100;
  const negPct = (hub.regimeDistribution.negative_gamma / totalRegime) * 100;
  const neutPct = (hub.regimeDistribution.neutral / totalRegime) * 100;

  return (
    <div className="space-y-6">
      {/* HEADER: Market-wide stats */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              ◆ GEX Hub
              <span className="text-xs px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                {hub.totalTickers} TICKERS
              </span>
            </h2>
            <CacheFreshnessIndicator asOf={hub.scannedAt} />
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-xs px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded hover:bg-zinc-700"
          >
            {isFetching ? '...' : '↻ Refresh'}
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat
            label="Market Net GEX"
            value={fmtBillions(hub.marketNetGEX)}
            sub={hub.marketNetGEX > 0 ? 'Positive (pinned)' : 'Negative (volatile)'}
            accent={hub.marketNetGEX > 0 ? 'cyan' : 'orange'}
          />
          <Stat
            label="Market Net VEX"
            value={fmtBillions(hub.marketNetVEX)}
            sub="Vanna positioning"
            accent="purple"
          />
          <Stat
            label="Regime"
            value={hub.marketRegime.replace('_', ' ').toUpperCase()}
            accent={hub.marketRegime === 'risk_on' ? 'green' :
                    hub.marketRegime === 'risk_off' ? 'red' : 'amber'}
          />
          <Stat
            label="Top Plays"
            value={`${hub.topPlays.length}`}
            sub="Actionable now"
            accent="green"
          />
        </div>

        {/* REGIME DISTRIBUTION BAR */}
        <div className="mt-4 pt-4 border-t border-zinc-800">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Regime Distribution</div>
          <div className="h-3 rounded-full overflow-hidden flex">
            <div className="bg-blue-500/60" style={{ width: `${posPct}%` }} title={`Positive Γ: ${hub.regimeDistribution.positive_gamma}`} />
            <div className="bg-orange-500/60" style={{ width: `${negPct}%` }} title={`Negative Γ: ${hub.regimeDistribution.negative_gamma}`} />
            <div className="bg-zinc-600/60" style={{ width: `${neutPct}%` }} title={`Neutral: ${hub.regimeDistribution.neutral}`} />
          </div>
          <div className="flex justify-between text-xs mt-2">
            <span className="text-blue-400">Pos Γ {hub.regimeDistribution.positive_gamma} ({posPct.toFixed(0)}%)</span>
            <span className="text-orange-400">Neg Γ {hub.regimeDistribution.negative_gamma} ({negPct.toFixed(0)}%)</span>
            <span className="text-zinc-400">Neutral {hub.regimeDistribution.neutral} ({neutPct.toFixed(0)}%)</span>
          </div>
        </div>
      </div>

      {/* TOP +GEX vs -GEX side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LeaderboardCard
          title="🛡️ Top +GEX (Pin Candidates)"
          subtitle="Dealer call walls / mean reversion targets"
          leaders={hub.topPositiveGEX}
          accent="blue"
          metricKey="totalGEX"
          metricLabel="Net GEX"
        />
        <LeaderboardCard
          title="🌋 Top -GEX (Squeeze Candidates)"
          subtitle="Negative gamma / volatility expansion"
          leaders={hub.topNegativeGEX}
          accent="orange"
          metricKey="totalGEX"
          metricLabel="Net GEX"
        />
      </div>

      {/* TOP VEX */}
      <LeaderboardCard
        title="🌪️ Top VEX (Vanna Movers)"
        subtitle="Implied vol regime change candidates"
        leaders={hub.topVEX}
        accent="purple"
        metricKey="totalVEX"
        metricLabel="Net VEX"
      />

      {/* SECTOR AGGREGATES */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-4">
        <h3 className="text-sm uppercase tracking-wider text-zinc-500 mb-3">
          Sector Aggregates
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {hub.sectors.slice(0, 12).map((s) => (
            <SectorRow key={s.sector} sector={s} />
          ))}
        </div>
      </div>

      {/* TOP ACTIONABLE PLAYS */}
      {hub.topPlays.length > 0 && (
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-4">
          <h3 className="text-sm uppercase tracking-wider text-zinc-500 mb-3 flex items-center gap-2">
            🎯 Top Actionable Plays
            <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 rounded text-emerald-400">
              {hub.topPlays.length} setups
            </span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {hub.topPlays.slice(0, 9).map((p) => (
              <TopPlayCard key={p.symbol} play={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  const colorMap: Record<string, string> = {
    green: 'text-emerald-400',
    red: 'text-red-400',
    cyan: 'text-cyan-400',
    amber: 'text-amber-400',
    purple: 'text-purple-400',
    orange: 'text-orange-400',
    blue: 'text-blue-400'
  };
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`text-xl font-bold ${accent ? colorMap[accent] || 'text-zinc-200' : 'text-zinc-200'}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function LeaderboardCard({
  title, subtitle, leaders, accent, metricKey, metricLabel
}: {
  title: string;
  subtitle: string;
  leaders: HubLeaderRow[];
  accent: 'blue' | 'orange' | 'purple';
  metricKey: 'totalGEX' | 'totalVEX';
  metricLabel: string;
}) {
  const accentClasses: Record<string, string> = {
    blue: 'border-blue-500/20 bg-blue-500/5',
    orange: 'border-orange-500/20 bg-orange-500/5',
    purple: 'border-purple-500/20 bg-purple-500/5'
  };

  if (!leaders.length) {
    return (
      <div className={`border rounded-lg p-4 ${accentClasses[accent]}`}>
        <div className="text-sm font-bold mb-1">{title}</div>
        <div className="text-xs text-zinc-500 mb-3">{subtitle}</div>
        <EmptyGexState reason="low_oi" size="sm" />
      </div>
    );
  }

  return (
    <div className={`border rounded-lg p-4 ${accentClasses[accent]}`}>
      <div className="text-sm font-bold mb-1">{title}</div>
      <div className="text-xs text-zinc-500 mb-3">{subtitle}</div>
      <div className="space-y-1">
        {leaders.map((l) => (
          <Link key={l.symbol} href={`/terminal/${l.symbol}`}>
            <div className="flex items-center gap-2 p-2 rounded hover:bg-zinc-800/40 transition-colors cursor-pointer">
              <span className="font-bold w-16">{l.symbol}</span>
              <span className="text-xs text-zinc-500 flex-1">${l.spotPrice.toFixed(2)}</span>
              <span className={`text-xs font-mono ${l.changePct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {l.changePct >= 0 ? '+' : ''}{l.changePct.toFixed(1)}%
              </span>
              <span className="text-xs font-mono text-zinc-300 w-20 text-right">
                {fmtBillions(l[metricKey])}
              </span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                {l.score}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function SectorRow({ sector }: { sector: SectorAggregate }) {
  const total = sector.symbols.length;
  const bullPct = (sector.bullishCount / total) * 100;
  const bearPct = (sector.bearishCount / total) * 100;
  const sentimentColor = bullPct > bearPct ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="bg-zinc-950/40 border border-zinc-800 rounded p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-sm">{sector.label}</span>
        <span className={`text-xs font-mono ${sentimentColor}`}>
          {fmtBillions(sector.netGEX)}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-emerald-400">{sector.bullishCount}↑</span>
        <span className="text-red-400">{sector.bearishCount}↓</span>
        <span className="text-zinc-500">{sector.neutralCount}—</span>
        <span className="text-zinc-600 ml-auto">avg {sector.avgScore.toFixed(0)}</span>
      </div>
      {sector.topPick && (
        <div className="mt-1.5 text-xs">
          <span className="text-zinc-500">Top: </span>
          <Link href={`/terminal/${sector.topPick}`}>
            <span className="text-cyan-400 font-bold cursor-pointer hover:underline">{sector.topPick}</span>
          </Link>
        </div>
      )}
    </div>
  );
}

function TopPlayCard({ play }: { play: TopPlay }) {
  const biasColor =
    play.bias === 'long' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' :
    play.bias === 'short' ? 'text-red-400 bg-red-500/10 border-red-500/30' :
    'text-zinc-400 bg-zinc-700/40 border-zinc-700';

  return (
    <Link href={`/terminal/${play.symbol}`}>
      <div className="bg-zinc-950/40 border border-zinc-800 rounded p-3 hover:border-cyan-500/30 transition-colors cursor-pointer">
        <div className="flex items-center justify-between mb-2">
          <span className="text-lg font-bold">{play.symbol}</span>
          {play.bias && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${biasColor}`}>
              {play.bias.toUpperCase()}
            </span>
          )}
        </div>
        <div className="text-xs text-zinc-500 mb-2">${play.spotPrice.toFixed(2)} · {play.sector}</div>
        <div className="space-y-1 text-xs">
          {play.gammaFlip != null ? (
            <div className="flex justify-between">
              <span className="text-zinc-500">Flip</span>
              <span className={play.isAboveFlip ? 'text-emerald-400 font-mono' : 'text-red-400 font-mono'}>
                ${play.gammaFlip.toFixed(0)} ({play.flipDistancePct >= 0 ? '+' : ''}{play.flipDistancePct.toFixed(1)}%)
              </span>
            </div>
          ) : (
            <div className="flex justify-between">
              <span className="text-zinc-500">Flip</span>
              <span className="text-zinc-600">no flip</span>
            </div>
          )}
          {play.callWall != null && (
            <div className="flex justify-between">
              <span className="text-zinc-500">Call Wall</span>
              <span className="text-emerald-400 font-mono">${play.callWall.toFixed(0)}</span>
            </div>
          )}
          {play.putWall != null && (
            <div className="flex justify-between">
              <span className="text-zinc-500">Put Wall</span>
              <span className="text-red-400 font-mono">${play.putWall.toFixed(0)}</span>
            </div>
          )}
          {play.score && (
            <div className="flex justify-between pt-1 border-t border-zinc-800">
              <span className="text-zinc-500">Score</span>
              <span className="text-cyan-400 font-bold">{play.score}</span>
            </div>
          )}
        </div>
        {play.thesis && (
          <div className="mt-2 pt-2 border-t border-zinc-800 text-[10px] text-zinc-400 line-clamp-2">
            {play.thesis}
          </div>
        )}
      </div>
    </Link>
  );
}

// ─── helpers ─────────────────────────────────────────────────

function fmtBillions(num: number): string {
  if (num === 0) return '$0';
  const abs = Math.abs(num);
  if (abs >= 1) return `${num >= 0 ? '+' : ''}$${num.toFixed(2)}B`;
  if (abs >= 0.001) return `${num >= 0 ? '+' : ''}$${(num * 1000).toFixed(0)}M`;
  return `${num >= 0 ? '+' : ''}$${(num * 1e6).toFixed(0)}K`;
}
