/**
 * TickerTopStrip — fixed identity bar for the canonical ticker page.
 *
 * This is the bar that ALWAYS sits at the top of `/t/:symbol`, regardless
 * of which tab the user has selected. It's the "you are looking at PLTR"
 * anchor: ticker name, price, regime pill, key dealer levels, and the
 * Trade Desk cross-link.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  ← SCAN     [PLTR ▾]   $129.09  +0.34%  ⛔ NEG GAMMA         │
 *   │             NET GEX -2.0B  FLIP —  CALL 140  PUT 125  MAXγ 130│
 *   │                                       [WATCH]  [TRADE DESK →]│
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Inputs are intentionally narrow: a snapshot + symbol + onSymbolChange.
 * Loading and error states render their own skeletons so the page shell
 * doesn't have to gate on snapshot presence to render the strip.
 */

import { Link } from 'wouter';
import { ExternalLink, Eye, TrendingUp, TrendingDown } from 'lucide-react';
import { cn, safeToFixed } from '@/lib/utils';
import { TickerSelector } from '@/components/shared/ticker-selector';
import { formatGEX } from '../../../../shared/gex-types';
import type { GEXSnapshot, GEXTerminalData } from '../../../../shared/gex-types';

interface TickerTopStripProps {
  symbol: string;
  onSymbolChange: (next: string) => void;
  snapshot: GEXSnapshot | null;
  isLoading?: boolean;
  changePct?: number;
  futuresProxy?: GEXTerminalData['futuresProxy'];
}

export function TickerTopStrip({
  symbol,
  onSymbolChange,
  snapshot,
  isLoading = false,
  changePct = 0,
  futuresProxy,
}: TickerTopStripProps) {
  return (
    <div
      className="rounded-lg bg-[var(--surface-raised)] border border-[var(--gex-positive)]/15 overflow-hidden mb-3"
      data-testid="ticker-top-strip"
    >
      {/* ROW 1 — identity + spot + regime + actions */}
      <div className="flex items-center justify-between gap-4 px-4 pt-3 pb-2">
        {/* LEFT: scanner crumb + ticker picker + symbol */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/scanner"
            className="text-[10px] font-mono text-muted-foreground hover:text-[var(--gex-positive)] uppercase tracking-widest shrink-0"
          >
            ← SCAN
          </Link>
          <TickerSelector
            value={symbol}
            onChange={onSymbolChange}
            variant="button"
            placeholder="Search ticker…"
            data-testid="ticker-page-selector"
          />
          <div className="hidden sm:flex flex-col min-w-0">
            <div className="text-2xl font-mono font-black text-[var(--gex-positive)] tracking-tight leading-none">
              {symbol}
            </div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mt-0.5">
              QUANTEDGE TERMINAL
            </div>
          </div>
        </div>

        {/* CENTER: spot + change + regime pill */}
        <div className="flex items-center gap-4">
          {snapshot ? (
            <>
              <div className="text-right">
                <div className="text-2xl font-mono font-bold text-foreground tabular-nums leading-none">
                  ${snapshot.spotPrice.toFixed(2)}
                </div>
                <div
                  className={cn(
                    'text-[11px] font-mono tabular-nums mt-0.5',
                    changePct > 0
                      ? 'text-[var(--trade-bullish)]'
                      : changePct < 0
                        ? 'text-[var(--trade-bearish)]'
                        : 'text-muted-foreground',
                  )}
                >
                  {changePct >= 0 ? '+' : ''}
                  {changePct.toFixed(2)}%
                </div>
              </div>
              <RegimePill regime={snapshot.regime} />
            </>
          ) : (
            <div className="h-10 w-32 rounded bg-muted/30 animate-pulse" />
          )}
        </div>

        {/* RIGHT: watch + trade desk */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            data-testid="ticker-watch-toggle"
          >
            <Eye className="w-3 h-3" />
            WATCH
          </button>
          <Link
            href={`/trade-desk?symbol=${symbol}`}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono font-bold uppercase tracking-widest border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500/60 transition-colors"
            data-testid="ticker-trade-desk-link"
            title="Open this symbol in Trade Desk"
          >
            <ExternalLink className="w-3 h-3" />
            TRADE DESK
          </Link>
        </div>
      </div>

      {/* FUTURES PROXY BANNER — shown when market is closed */}
      {futuresProxy && (
        <div className="flex items-center gap-3 px-4 py-1.5 border-t border-border/40 bg-amber-500/[0.04]">
          <span className="text-[9px] font-mono uppercase tracking-widest text-amber-400/80 shrink-0">
            {futuresProxy.label}
          </span>
          <span className="text-[11px] font-mono font-bold text-foreground tabular-nums">
            {futuresProxy.futuresPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className={cn(
            'text-[11px] font-mono font-bold tabular-nums flex items-center gap-0.5',
            futuresProxy.impliedGapPct >= 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]'
          )}>
            {futuresProxy.impliedGapPct >= 0 ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {futuresProxy.impliedGapPct >= 0 ? '+' : ''}{safeToFixed(futuresProxy.impliedGapPct, 2)}%
          </span>
          <span className="text-[9px] font-mono text-muted-foreground/60 ml-auto">
            vs {symbol} close · MARKET CLOSED
          </span>
        </div>
      )}

      {/* ROW 2 — key dealer levels (always visible across all tabs) */}
      <div className="flex items-center gap-5 px-4 py-2 border-t border-border/40 bg-[var(--surface-base)]/40 text-[10px] font-mono">
        {snapshot ? (
          <>
            <KeyStat
              label="NET GEX"
              value={formatGEX(snapshot.totalGEX)}
              tone={snapshot.totalGEX >= 0 ? 'pos' : 'neg'}
            />
            <KeyStat
              label="FLIP"
              value={snapshot.gammaFlipPrice ? `$${snapshot.gammaFlipPrice.toFixed(0)}` : '—'}
            />
            <KeyStat
              label="CALL WALL"
              value={snapshot.callWall ? `$${snapshot.callWall.toFixed(0)}` : '—'}
              tone="pos"
            />
            <KeyStat
              label="PUT WALL"
              value={snapshot.putWall ? `$${snapshot.putWall.toFixed(0)}` : '—'}
              tone="neg"
            />
            <KeyStat
              label="MAX γ"
              value={`$${snapshot.maxGammaStrike.toFixed(0)}`}
              tone="pos"
              star
            />
            {snapshot.dataQuality && (
              <KeyStat
                label="DATA"
                value={snapshot.dataQuality.grade}
                tone={
                  snapshot.dataQuality.grade === 'A' || snapshot.dataQuality.grade === 'B'
                    ? 'pos'
                    : snapshot.dataQuality.grade === 'F'
                      ? 'neg'
                      : 'neutral'
                }
              />
            )}
          </>
        ) : (
          <div className="h-3 w-full rounded bg-muted/20 animate-pulse" />
        )}
        {isLoading && snapshot && (
          <span className="ml-auto text-[9px] uppercase tracking-widest text-muted-foreground animate-pulse">
            REFRESHING…
          </span>
        )}
      </div>
    </div>
  );
}

function RegimePill({ regime }: { regime: GEXSnapshot['regime'] }) {
  const config = {
    positive_gamma: {
      label: 'POSITIVE GAMMA',
      cls: 'bg-[var(--gex-positive)]/10 border-[var(--gex-positive)]/40 text-[var(--gex-positive)]',
    },
    negative_gamma: {
      label: 'NEGATIVE GAMMA',
      cls: 'bg-[var(--gex-negative)]/10 border-[var(--gex-negative)]/40 text-[var(--gex-negative)]',
    },
    neutral: {
      label: 'NEUTRAL',
      cls: 'bg-muted border-border text-muted-foreground',
    },
    transitioning: {
      label: 'TRANSITIONING',
      cls: 'bg-[var(--gex-flip)]/10 border-[var(--gex-flip)]/40 text-[var(--gex-flip)]',
    },
  }[regime] ?? {
    label: regime,
    cls: 'bg-muted border-border text-muted-foreground',
  };

  return (
    <div
      className={cn(
        'px-3 py-1.5 rounded-md border text-[10px] font-mono font-bold uppercase tracking-wider whitespace-nowrap',
        config.cls,
      )}
    >
      {config.label}
    </div>
  );
}

function KeyStat({
  label,
  value,
  tone = 'neutral',
  star = false,
}: {
  label: string;
  value: string;
  tone?: 'pos' | 'neg' | 'neutral';
  star?: boolean;
}) {
  const color =
    tone === 'pos'
      ? 'text-[var(--gex-positive)]'
      : tone === 'neg'
        ? 'text-[var(--gex-negative)]'
        : 'text-foreground';
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className={cn('font-bold tabular-nums', color)}>
        {star && <span className="text-[var(--gex-star)] mr-0.5">★</span>}
        {value}
      </span>
    </div>
  );
}
