/**
 * Market Pulse Widget — embeddable mini version of /pulse
 * For dashboard/home page integration.
 *
 * Owns the "market context + money flow + GEX" surface on Home. Deliberately
 * does NOT render index quotes (the top tape owns those), watchlist movers
 * (the Movers card owns those), or pre-market gappers (the gappers card owns
 * those) — to keep Home free of duplicate surfaces.
 */

import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { cn } from '@/lib/utils';

interface PulseData {
  marketColor: 'GREEN' | 'RED' | 'MIXED';
  narrative: string;
  indices: { symbol: string; name: string; price: number; change: number }[];
  sectors: { symbol: string; name: string; change: number }[];
  macro: {
    vix: number; vixState: string;
    yield10Y: number;
    btc: { price: number; change: number };
    riskTone: string;
  };
  regime: { label: string; confidence: number };
  topMovers: {
    gainers: { symbol: string; price: number; change: number }[];
    decliners: { symbol: string; price: number; change: number }[];
  };
  fearGreed?: { value: number; label: string };
  breadth?: { advanceDeclineRatio: number; pctAbove50DMA: number; spyTrend: string };
  optionsContext?: { putCallRatio: number; pcrLabel: string };
  gexLevels?: {
    spy: { spot: number; flip: number; callWall: number; putWall: number };
    qqq: { spot: number; flip: number; callWall: number; putWall: number };
  };
  preMarketMovers?: {
    gainers: { symbol: string; change: number; price: number }[];
  };
}

interface GexTopPlay {
  symbol: string;
  spotPrice: number;
  gammaFlip: number | null;
  flipDistancePct: number;
  callWall: number | null;
  putWall: number | null;
  score?: number;
  bias?: string;
}

/**
 * Strip emoji from a server-supplied narrative and tidy the orphaned
 * punctuation it leaves behind. es5-safe (matches surrogate pairs + the
 * misc-symbols/variation-selector ranges without the `u` regex flag).
 */
function cleanNarrative(text: string): string {
  return text
    .replace(/[☀-➿️]|[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
    .replace(/\s+([.,;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function MarketPulseWidget() {
  const { data, isLoading } = useQuery<PulseData>({
    queryKey: ['market-pulse-widget'],
    queryFn: async () => {
      const res = await fetch('/api/market-pulse');
      return res.json();
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });

  // GEX Hub top plays (the missing wire)
  const { data: gexHub } = useQuery<{ hub: { topPlays: GexTopPlay[] } }>({
    queryKey: ['gex-hub-widget'],
    queryFn: async () => {
      const res = await fetch('/api/gex-vex/hub', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
  });

  if (isLoading || !data) {
    return (
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="text-sm text-muted-foreground/60">Loading market pulse…</div>
      </div>
    );
  }

  const colorClass = {
    GREEN: 'bg-[var(--trade-bullish)]/10 border-[var(--trade-bullish)]/30 text-[var(--trade-bullish)]',
    RED: 'bg-[var(--trade-bearish)]/10 border-[var(--trade-bearish)]/30 text-[var(--trade-bearish)]',
    MIXED: 'bg-[var(--trade-neutral)]/10 border-[var(--trade-neutral)]/30 text-[var(--trade-neutral)]',
  }[data.marketColor];

  const dotClass = {
    GREEN: 'bg-[var(--trade-bullish)]',
    RED: 'bg-[var(--trade-bearish)]',
    MIXED: 'bg-[var(--trade-neutral)]',
  }[data.marketColor];

  return (
    <Link href="/pulse">
      <div className="bg-card border border-border rounded-lg p-4 hover:border-[var(--brand-cyan)]/30 transition-colors cursor-pointer">
        {/* Header — market color + Oracle narrative */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">Market Pulse</span>
            <span className={cn('text-[10px] px-2 py-0.5 rounded border font-bold font-mono inline-flex items-center gap-1.5', colorClass)}>
              <span className={cn('w-1.5 h-1.5 rounded-full', dotClass)} />
              {data.marketColor}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground/50 font-mono">view full →</span>
        </div>

        {data.narrative && (
          <p className="text-xs text-foreground/80 leading-snug mb-3 line-clamp-2">
            {cleanNarrative(data.narrative)}
          </p>
        )}

        {/* Macro stripe */}
        <div className="flex items-center justify-between text-xs mb-3 pb-3 border-b border-border">
          <span className="text-muted-foreground">VIX <span className="text-foreground font-mono">{data.macro.vix.toFixed(1)}</span></span>
          <span className="text-muted-foreground">10Y <span className="text-foreground font-mono">{data.macro.yield10Y.toFixed(2)}%</span></span>
          <span className="text-muted-foreground">BTC <span className={cn('font-mono', data.macro.btc.change >= 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]')}>${(data.macro.btc.price/1000).toFixed(1)}k</span></span>
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-mono font-bold',
            data.macro.riskTone === 'RISK-ON' ? 'bg-[var(--trade-bullish)]/10 text-[var(--trade-bullish)]' :
            data.macro.riskTone === 'RISK-OFF' ? 'bg-[var(--trade-bearish)]/10 text-[var(--trade-bearish)]' :
            'bg-muted/40 text-muted-foreground'
          )}>{data.macro.riskTone}</span>
        </div>

        {/* Sector money-flow intentionally lives in the RotationBrief strip
            (relative-to-SPY, shell-level) — not duplicated here. */}

        {/* Fear/Greed + Breadth + P/C row (deep context) */}
        {(data.fearGreed || data.breadth || data.optionsContext) && (
          <div className="grid grid-cols-3 gap-2 mb-3">
            {data.fearGreed && (
              <div className="text-center">
                <div className="text-[9px] uppercase tracking-wider font-mono text-muted-foreground/70">Fear/Greed</div>
                <div className={cn('text-base font-bold font-mono',
                  data.fearGreed.value >= 75 ? 'text-[var(--trade-bullish)]' :
                  data.fearGreed.value >= 55 ? 'text-[var(--brand-cyan)]' :
                  data.fearGreed.value >= 45 ? 'text-[var(--trade-neutral)]' :
                  data.fearGreed.value >= 25 ? 'text-orange-400' :
                  'text-[var(--trade-bearish)]'
                )}>{data.fearGreed.value}</div>
                <div className="text-[9px] text-muted-foreground">{data.fearGreed.label.replace('_', ' ')}</div>
              </div>
            )}
            {data.breadth && (
              <div className="text-center">
                <div className="text-[9px] uppercase tracking-wider font-mono text-muted-foreground/70">Above 50DMA</div>
                <div className={cn('text-base font-bold font-mono', data.breadth.pctAbove50DMA >= 50 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]')}>
                  {data.breadth.pctAbove50DMA}%
                </div>
                <div className="text-[9px] text-muted-foreground">A/D {data.breadth.advanceDeclineRatio.toFixed(1)}</div>
              </div>
            )}
            {data.optionsContext && (
              <div className="text-center">
                <div className="text-[9px] uppercase tracking-wider font-mono text-muted-foreground/70">Put/Call</div>
                <div className={cn('text-base font-bold font-mono',
                  data.optionsContext.pcrLabel === 'BULLISH' ? 'text-[var(--trade-bullish)]' :
                  data.optionsContext.pcrLabel === 'BEARISH' ? 'text-[var(--trade-bearish)]' :
                  'text-[var(--trade-neutral)]'
                )}>{data.optionsContext.putCallRatio}</div>
                <div className="text-[9px] text-muted-foreground">{data.optionsContext.pcrLabel}</div>
              </div>
            )}
          </div>
        )}

        {/* GEX levels for SPY/QQQ (compact) */}
        {data.gexLevels && (
          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-border mb-3 text-[10px]">
            {(['spy', 'qqq'] as const).map(idx => {
              const g = data.gexLevels![idx];
              return (
                <div key={idx} className="space-y-0.5">
                  <div className="font-bold font-mono text-foreground/80">{idx.toUpperCase()} GEX</div>
                  <div className="flex justify-between"><span className="text-muted-foreground/70">Flip</span><span className="text-[var(--trade-neutral)] font-mono">${g.flip.toFixed(0)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground/70">Call Wall</span><span className="text-[var(--trade-bullish)] font-mono">${g.callWall.toFixed(0)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground/70">Put Wall</span><span className="text-[var(--trade-bearish)] font-mono">${g.putWall.toFixed(0)}</span></div>
                </div>
              );
            })}
          </div>
        )}

        {/* GEX Hub Top Plays */}
        {gexHub?.hub?.topPlays && gexHub.hub.topPlays.length > 0 && (
          <div className="pt-3 border-t border-border">
            <div className="text-[10px] uppercase tracking-wider font-mono text-[var(--brand-cyan)] mb-1.5">GEX Top Plays</div>
            <div className="flex flex-wrap gap-1.5">
              {gexHub.hub.topPlays.slice(0, 6).map((p) => (
                <span
                  key={p.symbol}
                  className={cn('text-xs px-2 py-0.5 rounded border font-mono',
                    p.bias === 'long' ? 'bg-[var(--trade-bullish)]/10 border-[var(--trade-bullish)]/30 text-[var(--trade-bullish)]' :
                    p.bias === 'short' ? 'bg-[var(--trade-bearish)]/10 border-[var(--trade-bearish)]/30 text-[var(--trade-bearish)]' :
                    'bg-[var(--brand-cyan)]/10 border-[var(--brand-cyan)]/30 text-[var(--brand-cyan)]'
                  )}
                  title={p.gammaFlip != null ? `Flip $${p.gammaFlip.toFixed(0)} (${p.flipDistancePct >= 0 ? '+' : ''}${p.flipDistancePct.toFixed(1)}%)` : 'No flip'}
                >
                  {p.symbol}{p.score ? ` ${p.score}` : ''}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
