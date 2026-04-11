/**
 * GEXHubPanels — market-wide aggregation panels rendered above the
 * confluence list on /gex.
 *
 * Three sections, each a top-N leaderboard:
 *   1. TOP POSITIVE GEX  — pin-candidate names (call-wall heavy)
 *   2. TOP NEGATIVE GEX  — vol-break candidates (put-wall heavy)
 *   3. TOP VEX           — vanna movers by absolute magnitude
 *
 * Plus a sector strip and a regime-distribution bar.
 *
 * Each leader row links to /t/:symbol/gex so users can drill in.
 */

import { Link } from 'wouter';
import { cn } from '@/lib/utils';
import { formatGEX } from '../../../../shared/gex-types';
import type {
  GEXHubData,
  HubLeaderRow,
  SectorAggregate,
  RegimeDistribution,
} from '../../../../shared/gex-types';

interface GEXHubPanelsProps {
  hub: GEXHubData;
}

export function GEXHubPanels({ hub }: GEXHubPanelsProps) {
  return (
    <div className="space-y-3 mb-6">
      {/* MARKET SUMMARY STRIP */}
      <MarketSummaryStrip hub={hub} />

      {/* TRIPLE LEADERBOARD ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <LeaderboardCard
          title="TOP POSITIVE GEX"
          subtitle="Pin candidates · call-wall heavy"
          tone="positive"
          rows={hub.topPositiveGEX}
          metric="gex"
        />
        <LeaderboardCard
          title="TOP NEGATIVE GEX"
          subtitle="Vol-break candidates · put-wall heavy"
          tone="negative"
          rows={hub.topNegativeGEX}
          metric="gex"
        />
        <LeaderboardCard
          title="TOP VEX MOVERS"
          subtitle="Largest vanna magnitude · trend energy"
          tone="vex"
          rows={hub.topVEX}
          metric="vex"
        />
      </div>

      {/* SECTOR STRIP */}
      <SectorStrip sectors={hub.sectors} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MARKET SUMMARY — net GEX/VEX + regime distribution
// ─────────────────────────────────────────────────────────────

function MarketSummaryStrip({ hub }: { hub: GEXHubData }) {
  const { regimeDistribution: rd, marketNetGEX, marketNetVEX, totalTickers } = hub;
  const gexTone = marketNetGEX >= 0 ? 'text-[var(--gex-positive)]' : 'text-[var(--gex-negative)]';
  const vexTone = marketNetVEX >= 0 ? 'text-[var(--gex-positive)]' : 'text-[var(--gex-negative)]';

  return (
    <div className="rounded-lg bg-[var(--surface-raised)] border border-[var(--gex-positive)]/15 px-4 py-3">
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 items-center">
        <div>
          <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
            MARKET NET GEX
          </div>
          <div className={cn('text-xl font-mono font-bold tabular-nums', gexTone)}>
            {formatGEX(marketNetGEX)}
          </div>
        </div>
        <div>
          <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
            MARKET NET VEX
          </div>
          <div className={cn('text-xl font-mono font-bold tabular-nums', vexTone)}>
            {formatGEX(marketNetVEX)}
          </div>
        </div>
        <div className="lg:col-span-4">
          <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
            REGIME · {totalTickers} TICKERS
          </div>
          <RegimeBar regime={rd} />
        </div>
      </div>
    </div>
  );
}

function RegimeBar({ regime }: { regime: RegimeDistribution }) {
  const total = Math.max(1, regime.total);
  const segments = [
    { key: 'positive_gamma', label: 'POS γ', count: regime.positive_gamma, color: 'var(--gex-positive)' },
    { key: 'negative_gamma', label: 'NEG γ', count: regime.negative_gamma, color: 'var(--gex-negative)' },
    { key: 'transitioning', label: 'TRANS', count: regime.transitioning, color: 'var(--gex-flip)' },
    { key: 'neutral', label: 'NEU', count: regime.neutral, color: 'var(--muted-foreground)' },
  ];
  return (
    <div className="space-y-1">
      <div className="flex h-2 rounded-full overflow-hidden bg-[var(--surface-base)]/40 border border-border">
        {segments.map((s) => {
          const pct = (s.count / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={s.key}
              style={{ width: `${pct}%`, backgroundColor: s.color, opacity: 0.8 }}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-3 text-[9px] font-mono uppercase tracking-widest">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: s.color, opacity: 0.8 }} />
            <span className="text-muted-foreground">
              {s.label} <span className="text-foreground tabular-nums">{s.count}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// LEADERBOARD CARD
// ─────────────────────────────────────────────────────────────

interface LeaderboardCardProps {
  title: string;
  subtitle: string;
  tone: 'positive' | 'negative' | 'vex';
  rows: HubLeaderRow[];
  metric: 'gex' | 'vex';
}

function LeaderboardCard({ title, subtitle, tone, rows, metric }: LeaderboardCardProps) {
  const toneColor =
    tone === 'positive'
      ? 'text-[var(--gex-positive)] border-[var(--gex-positive)]/25'
      : tone === 'negative'
        ? 'text-[var(--gex-negative)] border-[var(--gex-negative)]/25'
        : 'text-[var(--gex-flip)] border-[var(--gex-flip)]/25';

  return (
    <div className={cn('rounded-lg bg-[var(--surface-raised)] border overflow-hidden', toneColor)}>
      <div className="px-3 py-2 border-b border-inherit bg-[var(--surface-base)]/40">
        <div className={cn('text-[10px] font-mono font-bold uppercase tracking-widest', toneColor.split(' ')[0])}>
          {title}
        </div>
        <div className="text-[9px] font-mono text-muted-foreground mt-0.5">{subtitle}</div>
      </div>
      <div className="divide-y divide-border/40">
        {rows.length === 0 && (
          <div className="px-3 py-6 text-center text-[10px] font-mono text-muted-foreground">
            No tickers in this bucket
          </div>
        )}
        {rows.map((row, i) => (
          <LeaderRow key={row.symbol} row={row} rank={i + 1} metric={metric} tone={tone} />
        ))}
      </div>
    </div>
  );
}

function LeaderRow({
  row,
  rank,
  metric,
  tone,
}: {
  row: HubLeaderRow;
  rank: number;
  metric: 'gex' | 'vex';
  tone: 'positive' | 'negative' | 'vex';
}) {
  const value = metric === 'gex' ? row.totalGEX : row.totalVEX;
  const valueTone =
    tone === 'positive'
      ? 'text-[var(--gex-positive)]'
      : tone === 'negative'
        ? 'text-[var(--gex-negative)]'
        : value >= 0
          ? 'text-[var(--gex-positive)]'
          : 'text-[var(--gex-negative)]';

  const changeTone = row.changePct >= 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]';

  return (
    <Link href={`/t/${row.symbol}/gex`}>
      <div
        className="px-3 py-1.5 hover:bg-[var(--gex-positive)]/5 cursor-pointer transition-colors flex items-center gap-2"
        data-testid={`hub-leader-${row.symbol}`}
      >
        <div className="text-[9px] font-mono text-muted-foreground tabular-nums w-4">{rank}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <div className="text-[12px] font-mono font-bold text-foreground">{row.symbol}</div>
            {row.tier && (
              <div className="text-[8px] font-mono uppercase text-muted-foreground/60">{row.tier}</div>
            )}
          </div>
          <div className="text-[9px] font-mono text-muted-foreground tabular-nums">
            ${row.spotPrice.toFixed(2)}{' '}
            <span className={changeTone}>
              {row.changePct >= 0 ? '+' : ''}
              {row.changePct.toFixed(2)}%
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className={cn('text-[11px] font-mono font-bold tabular-nums', valueTone)}>
            {formatGEX(value)}
          </div>
          <div className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground">
            score {row.score.toFixed(0)}
          </div>
        </div>
      </div>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────
// SECTOR STRIP
// ─────────────────────────────────────────────────────────────

function SectorStrip({ sectors }: { sectors: SectorAggregate[] }) {
  if (sectors.length === 0) return null;

  // Find max abs to scale bar widths
  const maxAbs = Math.max(...sectors.map((s) => Math.abs(s.netGEX)), 0.01);

  return (
    <div className="rounded-lg bg-[var(--surface-raised)] border border-[var(--gex-positive)]/15 overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--gex-positive)]/15 bg-[var(--surface-base)]/40">
        <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--gex-positive)]">
          SECTOR PULSE
        </div>
        <div className="text-[9px] font-mono text-muted-foreground mt-0.5">
          Net GEX by sector · long/short bias counts · top pick
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-3">
        {sectors.map((s) => (
          <SectorRow key={s.sector} sector={s} maxAbs={maxAbs} />
        ))}
      </div>
    </div>
  );
}

function SectorRow({ sector, maxAbs }: { sector: SectorAggregate; maxAbs: number }) {
  const isPositive = sector.netGEX >= 0;
  const tone = isPositive ? 'var(--gex-positive)' : 'var(--gex-negative)';
  const widthPct = Math.min(100, (Math.abs(sector.netGEX) / maxAbs) * 100);

  return (
    <div className="flex flex-col gap-1 px-2 py-1.5 rounded-md bg-[var(--surface-base)]/30 border border-border/40">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-mono font-semibold text-foreground truncate">{sector.label}</div>
        <div
          className="text-[10px] font-mono font-bold tabular-nums"
          style={{ color: tone }}
        >
          {formatGEX(sector.netGEX)}
        </div>
      </div>
      <div className="h-1 rounded-full overflow-hidden bg-[var(--surface-base)]/60">
        <div className="h-full rounded-full" style={{ width: `${widthPct}%`, backgroundColor: tone, opacity: 0.7 }} />
      </div>
      <div className="flex items-center justify-between text-[8px] font-mono uppercase tracking-widest text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="text-[var(--trade-bullish)]">L {sector.bullishCount}</span>
          <span className="text-[var(--trade-bearish)]">S {sector.bearishCount}</span>
          <span>N {sector.neutralCount}</span>
        </div>
        {sector.topPick && (
          <Link href={`/t/${sector.topPick}/gex`}>
            <span className="text-foreground hover:text-[var(--gex-positive)] cursor-pointer">
              ★ {sector.topPick}
            </span>
          </Link>
        )}
      </div>
    </div>
  );
}
