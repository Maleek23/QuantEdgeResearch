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

import { useState } from 'react';
import { Link } from 'wouter';
import { cn } from '@/lib/utils';
import { formatGEX } from '../../../../shared/gex-types';

/** Format VEX values (which are in $M, not $B like GEX) */
function formatVEX(v: number): string {
  const sign = v >= 0 ? '+' : '−';
  const abs = Math.abs(v);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}B`;
  if (abs >= 1) return `${sign}$${abs.toFixed(1)}M`;
  if (abs >= 0.001) return `${sign}$${(abs * 1000).toFixed(0)}K`;
  if (abs === 0) return '$0';
  return `${sign}$${(abs * 1000).toFixed(1)}K`;
}
import type {
  GEXHubData,
  HubLeaderRow,
  SectorAggregate,
  RegimeDistribution,
  TopPlay,
} from '../../../../shared/gex-types';

interface GEXHubPanelsProps {
  hub: GEXHubData;
}

export function GEXHubPanels({ hub }: GEXHubPanelsProps) {
  return (
    <div className="space-y-3 mb-6">
      {/* MARKET SUMMARY STRIP */}
      <MarketSummaryStrip hub={hub} />

      {/* TOP PLAYS — actionable setups by dealer positioning */}
      {hub.topPlays && hub.topPlays.length > 0 && (
        <TopPlaysPanel plays={hub.topPlays} />
      )}

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

const SESSION_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: 'MARKET OPEN', color: 'text-[var(--gex-positive)]', bg: 'bg-[var(--gex-positive)]/15' },
  pre_market: { label: 'PRE-MARKET', color: 'text-amber-400', bg: 'bg-amber-400/15' },
  after_hours: { label: 'AFTER HOURS', color: 'text-purple-400', bg: 'bg-purple-400/15' },
  overnight: { label: 'OVERNIGHT', color: 'text-muted-foreground', bg: 'bg-muted/20' },
};

function MarketSummaryStrip({ hub }: { hub: GEXHubData }) {
  const { regimeDistribution: rd, marketNetGEX, marketNetVEX, totalTickers } = hub;
  const gexTone = marketNetGEX >= 0 ? 'text-[var(--gex-positive)]' : 'text-[var(--gex-negative)]';
  const vexTone = marketNetVEX >= 0 ? 'text-[var(--gex-positive)]' : 'text-[var(--gex-negative)]';
  const session = SESSION_LABELS[hub.session || 'open'] || SESSION_LABELS.open;
  const isOffHours = hub.session && hub.session !== 'open';

  return (
    <div className="rounded-lg bg-[var(--surface-raised)] border border-[var(--gex-positive)]/15 px-4 py-3 space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 items-center">
        <div className="min-w-0 overflow-hidden">
          <div className="flex items-center gap-2">
            <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
              MARKET NET GEX
            </div>
            <span className={cn('px-1.5 py-0.5 text-[8px] font-mono font-bold uppercase rounded', session.color, session.bg)}>
              {session.label}
            </span>
          </div>
          <div className={cn('text-xl font-mono font-bold tabular-nums truncate', gexTone)}>
            {formatGEX(marketNetGEX)}
          </div>
        </div>
        <div className="min-w-0 overflow-hidden">
          <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
            MARKET NET VEX
          </div>
          <div className={cn('text-xl font-mono font-bold tabular-nums truncate', vexTone)}>
            {formatVEX(marketNetVEX)}
          </div>
        </div>
        <div className="lg:col-span-4">
          <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
            REGIME · {totalTickers} TICKERS
          </div>
          <RegimeBar regime={rd} />
        </div>
      </div>

      {/* FUTURES STRIP — shown during AH/PM/overnight */}
      {isOffHours && hub.futures && hub.futures.length > 0 && (
        <div className="border-t border-border/40 pt-2">
          <div className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
            FUTURES — LIVE
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            {hub.futures.map((f) => {
              const tone = f.changePct >= 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]';
              return (
                <div key={f.symbol} className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono font-bold text-foreground">{f.symbol.replace('=F', '')}</span>
                  <span className="text-[10px] font-mono tabular-nums text-muted-foreground">${f.price.toFixed(2)}</span>
                  <span className={cn('text-[10px] font-mono font-bold tabular-nums', tone)}>
                    {f.changePct >= 0 ? '+' : ''}{f.changePct.toFixed(2)}%
                  </span>
                </div>
              );
            })}
          </div>
          {isOffHours && (
            <div className="text-[8px] font-mono text-muted-foreground/50 mt-1">
              GEX/VEX levels are from last RTH session — futures show overnight direction
            </div>
          )}
        </div>
      )}
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
  const biasTone = row.bias === 'long'
    ? 'text-[var(--trade-bullish)]'
    : row.bias === 'short'
      ? 'text-[var(--trade-bearish)]'
      : 'text-muted-foreground/60';
  const regimeLabel = row.regime === 'positive_gamma' ? 'POS γ'
    : row.regime === 'negative_gamma' ? 'NEG γ'
    : row.regime === 'transitioning' ? 'TRANS' : '';

  return (
    <Link href={`/terminal/${row.symbol}`}>
      <div
        className="px-3 py-2 hover:bg-[var(--gex-positive)]/5 cursor-pointer transition-colors"
        data-testid={`hub-leader-${row.symbol}`}
      >
        <div className="flex items-center gap-2">
          <div className="text-[9px] font-mono text-muted-foreground tabular-nums w-4 shrink-0">{rank}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5 min-w-0">
              <div className="text-[12px] font-mono font-bold text-foreground truncate">{row.symbol}</div>
              {row.tier && (
                <div className="text-[8px] font-mono uppercase text-muted-foreground/60 shrink-0">{row.tier}</div>
              )}
              <span className="text-[8px] font-mono text-muted-foreground/40 uppercase">{row.sector}</span>
            </div>
            <div className="text-[9px] font-mono text-muted-foreground tabular-nums truncate">
              ${row.spotPrice.toFixed(2)}{' '}
              <span className={changeTone}>
                {row.changePct >= 0 ? '+' : ''}
                {row.changePct.toFixed(2)}%
              </span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className={cn('text-[11px] font-mono font-bold tabular-nums', valueTone)}>
              {metric === 'vex' ? formatVEX(value) : formatGEX(value)}
            </div>
            <div className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground">
              score {row.score.toFixed(0)}
            </div>
          </div>
        </div>
        {/* Positioning detail row */}
        <div className="flex items-center gap-2 mt-1 pl-6 text-[8px] font-mono uppercase tracking-widest">
          {regimeLabel && (
            <span className={cn(
              'px-1 rounded',
              row.regime === 'negative_gamma' ? 'bg-[var(--trade-bearish)]/10 text-[var(--trade-bearish)]' :
              row.regime === 'positive_gamma' ? 'bg-[var(--gex-positive)]/10 text-[var(--gex-positive)]' :
              'bg-muted/20 text-muted-foreground'
            )}>{regimeLabel}</span>
          )}
          <span className={biasTone}>{row.bias}</span>
          {row.callWall && <span className="text-muted-foreground/50">CW ${row.callWall.toFixed(0)}</span>}
          {row.putWall && <span className="text-muted-foreground/50">PW ${row.putWall.toFixed(0)}</span>}
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
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="text-[10px] font-mono font-semibold text-foreground truncate">{sector.label}</div>
        <div
          className="text-[10px] font-mono font-bold tabular-nums shrink-0"
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
          <Link href={`/terminal/${sector.topPick}`}>
            <span className="text-foreground hover:text-[var(--gex-positive)] cursor-pointer">
              ★ {sector.topPick}
            </span>
          </Link>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TOP PLAYS PANEL — actionable setups ranked by dealer positioning
// ─────────────────────────────────────────────────────────────

const VEX_SIGNAL_STYLE: Record<string, { label: string; bg: string; text: string }> = {
  positive_rare: { label: 'POSITIVE VEX', bg: 'bg-[var(--gex-positive)]/15', text: 'text-[var(--gex-positive)]' },
  negative_explosive: { label: 'EXPLOSIVE', bg: 'bg-[var(--trade-bearish)]/15', text: 'text-[var(--trade-bearish)]' },
  negative_strong: { label: 'STRONG VEX', bg: 'bg-[var(--gex-flip)]/15', text: 'text-[var(--gex-flip)]' },
  mild: { label: 'MILD', bg: 'bg-muted/20', text: 'text-muted-foreground' },
};

const CONVICTION_STYLE: Record<string, { label: string; border: string; text: string }> = {
  high: { label: 'HIGH', border: 'border-[var(--gex-positive)]', text: 'text-[var(--gex-positive)]' },
  medium: { label: 'MED', border: 'border-amber-400', text: 'text-amber-400' },
  low: { label: 'LOW', border: 'border-muted-foreground/40', text: 'text-muted-foreground' },
};

const INITIAL_SHOW = 10;

function TopPlaysPanel({ plays }: { plays: TopPlay[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? plays : plays.slice(0, INITIAL_SHOW);
  const hasMore = plays.length > INITIAL_SHOW;

  return (
    <div className="rounded-lg bg-[var(--surface-raised)] border border-amber-400/25 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-amber-400/15 bg-[var(--surface-base)]/40 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-amber-400">
            TOP PLAYS — DEALER POSITIONING
          </div>
          <div className="text-[9px] font-mono text-muted-foreground mt-0.5">
            Ranked by VEX magnitude + flip proximity + regime + wall setup
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground/50">
            {expanded ? plays.length : `${visible.length}/${plays.length}`} setups
          </div>
          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className={cn(
                'px-2 py-0.5 text-[8px] font-mono font-bold uppercase tracking-widest rounded border transition-colors',
                expanded
                  ? 'border-amber-400/30 text-amber-400 bg-amber-400/10'
                  : 'border-border/30 text-muted-foreground hover:text-amber-400 hover:border-amber-400/30'
              )}
            >
              {expanded ? 'COLLAPSE' : `SHOW ALL ${plays.length}`}
            </button>
          )}
        </div>
      </div>
      <div className="divide-y divide-border/30">
        {visible.map((play, i) => (
          <TopPlayRow key={play.symbol} play={play} rank={i + 1} />
        ))}
      </div>
    </div>
  );
}

function buildDetailLines(play: TopPlay): string[] {
  const lines: string[] = [];
  const isPosGamma = play.regime === 'positive_gamma';
  const isNegGamma = play.isNegativeGamma;

  // Gamma positioning — regime-aware
  if (play.gammaFlip) {
    const flipDir = play.isAboveFlip ? 'above' : 'below';
    const dist = Math.abs(play.flipDistancePct).toFixed(1);
    if (isPosGamma && play.isAboveFlip) {
      lines.push(`Gamma flip at $${play.gammaFlip.toFixed(0)} — spot is ${flipDir} (${dist}%). Positive gamma: dealers SELL rallies and BUY dips, dampening moves and pinning price near max gamma.`);
    } else if (isNegGamma && play.isAboveFlip) {
      lines.push(`Gamma flip at $${play.gammaFlip.toFixed(0)} — spot is ${flipDir} (${dist}%). Negative gamma: dealers must BUY into rallies to stay hedged, amplifying upside momentum.`);
    } else if (isNegGamma && !play.isAboveFlip) {
      lines.push(`Gamma flip at $${play.gammaFlip.toFixed(0)} — spot is ${flipDir} (${dist}%). Negative gamma below flip: dealers SELL into dips, accelerating downside moves.`);
    } else {
      lines.push(`Gamma flip at $${play.gammaFlip.toFixed(0)} — spot is ${flipDir} (${dist}%). Near the flip = high-energy zone where dealer hedging flips direction.`);
    }
  } else {
    lines.push('No gamma flip detected — flat dealer gamma across strikes.');
  }

  // VEX explanation — regime-contextualized
  if (play.vexSignal === 'positive_rare' && isPosGamma) {
    lines.push('Positive VEX in positive gamma — as volatility compresses (which it does in pos-gamma), dealers gain delta and BUY more underlying. Double support: gamma pins + vanna bids.');
  } else if (play.vexSignal === 'positive_rare') {
    lines.push('Positive VEX is rare — dealers accumulate delta as vol drops. Vanna flows align with direction, creating a self-reinforcing bid.');
  } else if (play.vexSignal === 'negative_explosive') {
    lines.push('Explosive negative VEX + negative gamma — dealers must hedge aggressively in both directions. Any move triggers cascading delta-hedging, fueling momentum.');
  } else if (play.vexSignal === 'negative_strong' && isPosGamma) {
    lines.push('Strong negative VEX in positive gamma — vol compression REDUCES dealer delta, creating a headwind. Dealers have less incentive to chase, limiting extension beyond walls.');
  } else if (play.vexSignal === 'negative_strong') {
    lines.push('Strong negative VEX — large vanna exposure. As vol moves, dealers must adjust hedges, creating trend energy in the direction of the move.');
  } else {
    lines.push('Mild VEX signal — vanna exposure is small relative to gamma. Price action driven more by gamma walls than vanna flows.');
  }

  // Wall setup
  const wallParts: string[] = [];
  if (play.callWall) wallParts.push(`Call wall at $${play.callWall.toFixed(0)} (${isPosGamma ? 'pin magnet' : 'upside target'})`);
  if (play.putWall) wallParts.push(`Put wall at $${play.putWall.toFixed(0)} (${isPosGamma ? 'bounce zone' : 'downside target'})`);
  if (wallParts.length > 0) {
    const range = play.callWall && play.putWall
      ? ` Range: $${(play.callWall - play.putWall).toFixed(0)} (${((play.callWall - play.putWall) / play.spotPrice * 100).toFixed(1)}%)`
      : '';
    lines.push(wallParts.join('. ') + '.' + range);
  }

  // Regime summary
  const regimeDesc: Record<string, string> = {
    positive_gamma: 'Positive gamma — dealers dampen moves. Expect mean-reversion toward max gamma strike. Best for selling premium / fading extremes.',
    negative_gamma: 'Negative gamma — dealers amplify moves. Expect volatile breakouts and trend continuation. Best for directional plays / buying premium.',
    neutral: 'Neutral gamma — balanced dealer exposure, no strong directional hedge pressure. Direction driven by flow, not positioning.',
    transitioning: 'Transitioning — gamma regime flipping. Expect choppy action and potential false breakouts as dealer hedging reverses.',
  };
  lines.push(regimeDesc[play.regime] || regimeDesc.neutral);

  return lines;
}

function TopPlayRow({ play, rank }: { play: TopPlay; rank: number }) {
  const [hovered, setHovered] = useState(false);
  const vex = VEX_SIGNAL_STYLE[play.vexSignal] || VEX_SIGNAL_STYLE.mild;
  const conv = CONVICTION_STYLE[play.conviction] || CONVICTION_STYLE.low;
  const biasTone = play.bias === 'long'
    ? 'text-[var(--trade-bullish)]'
    : play.bias === 'short'
      ? 'text-[var(--trade-bearish)]'
      : 'text-muted-foreground';
  const flipLabel = play.isAboveFlip
    ? 'ABOVE FLIP'
    : play.gammaFlip
      ? `${Math.abs(play.flipDistancePct).toFixed(1)}% to flip`
      : 'NO FLIP';
  const flipTone = play.isAboveFlip
    ? 'text-[var(--gex-positive)]'
    : Math.abs(play.flipDistancePct) < 1
      ? 'text-amber-400'
      : 'text-muted-foreground';

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Link href={`/terminal/${play.symbol}`}>
        <div className="px-4 py-2.5 hover:bg-amber-400/5 cursor-pointer transition-colors">
          {/* Row 1: rank, symbol, conviction, VEX signal, score bar */}
          <div className="flex items-center gap-2.5">
            <div className="text-[12px] font-mono font-bold text-amber-400/60 tabular-nums w-5 shrink-0">
              {rank}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-mono font-bold text-foreground">{play.symbol}</span>
                <span className={cn('px-1.5 py-0 text-[8px] font-mono font-bold uppercase rounded border', conv.border, conv.text)}>
                  {conv.label}
                </span>
                <span className={cn('px-1.5 py-0 text-[8px] font-mono font-bold uppercase rounded', vex.bg, vex.text)}>
                  {vex.label}
                </span>
                {play.isNegativeGamma && (
                  <span className="px-1.5 py-0 text-[8px] font-mono font-bold uppercase rounded bg-[var(--trade-bearish)]/10 text-[var(--trade-bearish)]">
                    NEG γ
                  </span>
                )}
              </div>
            </div>
            {/* Score bar */}
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="w-16 h-1.5 rounded-full bg-[var(--surface-base)] overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${play.playScore}%`,
                    backgroundColor: play.playScore >= 70 ? 'var(--gex-positive)' : play.playScore >= 45 ? 'var(--gex-flip)' : 'var(--muted-foreground)',
                  }}
                />
              </div>
              <span className="text-[10px] font-mono font-bold tabular-nums text-muted-foreground">{play.playScore}</span>
            </div>
          </div>

          {/* Row 2: price, levels, bias */}
          <div className="flex items-center gap-3 mt-1.5 pl-7">
            <span className="text-[11px] font-mono font-bold tabular-nums text-foreground">
              ${play.spotPrice.toFixed(2)}
            </span>
            <span className={cn('text-[9px] font-mono font-bold uppercase', flipTone)}>
              {flipLabel}
            </span>
            {play.callWall && (
              <span className="text-[9px] font-mono text-muted-foreground tabular-nums">
                CW ${play.callWall.toFixed(0)}
              </span>
            )}
            {play.putWall && (
              <span className="text-[9px] font-mono text-muted-foreground tabular-nums">
                PW ${play.putWall.toFixed(0)}
              </span>
            )}
            <span className={cn('text-[9px] font-mono font-bold uppercase', biasTone)}>
              {play.bias}
            </span>
            {play.target && (
              <span className="text-[9px] font-mono tabular-nums text-[var(--trade-bullish)]">
                → ${play.target.toFixed(0)}
              </span>
            )}
          </div>

          {/* Row 3: insight */}
          <div className="mt-1 pl-7">
            <span className="text-[9px] font-mono text-muted-foreground leading-tight">
              {play.insight}
            </span>
          </div>
        </div>
      </Link>

      {/* HOVER DETAIL PANEL */}
      {hovered && (
        <div className="absolute right-4 top-full z-50 w-[400px] rounded-lg border border-amber-400/30 bg-[var(--surface-raised)] shadow-xl shadow-black/40 p-3 space-y-2">
          <div className="flex items-center gap-2 border-b border-border/40 pb-2">
            <span className="text-[12px] font-mono font-bold text-amber-400">{play.symbol}</span>
            <span className="text-[9px] font-mono text-muted-foreground uppercase">{play.sector}</span>
            <span className="text-[9px] font-mono text-muted-foreground ml-auto">
              Score {play.playScore}/100
            </span>
          </div>
          {/* Score breakdown bars */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'VEX', pct: Math.min(100, play.totalVEX !== 0 ? (play.playScore > 70 ? 80 : 50) : 10), color: 'var(--gex-flip)' },
              { label: 'FLIP', pct: play.isAboveFlip ? 90 : Math.max(10, 100 - Math.abs(play.flipDistancePct) * 20), color: 'var(--gex-positive)' },
              { label: 'REGIME', pct: play.regime === 'positive_gamma' ? 80 : play.regime === 'negative_gamma' ? 70 : 40, color: 'var(--gex-negative)' },
              { label: 'WALLS', pct: play.callWall && play.putWall ? 75 : 30, color: 'var(--amber-400, #f59e0b)' },
            ].map((b) => (
              <div key={b.label}>
                <div className="text-[7px] font-mono uppercase tracking-widest text-muted-foreground mb-0.5">{b.label}</div>
                <div className="h-1 rounded-full bg-[var(--surface-base)] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${b.pct}%`, backgroundColor: b.color }} />
                </div>
              </div>
            ))}
          </div>
          {/* Detailed explanation lines */}
          <div className="space-y-1.5 pt-1">
            {buildDetailLines(play).map((line, i) => (
              <p key={i} className="text-[9px] font-mono leading-relaxed text-muted-foreground">
                {line}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
