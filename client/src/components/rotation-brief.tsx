/**
 * ROTATION BRIEF — the staple "follow the money" headline.
 *
 * One calm strip that answers the only question that matters at the open:
 * *where is the money going?* Money rotating OUT of the bleeding sectors →
 * INTO the ones catching bids. Measured RELATIVE to SPY, so a broad selloff
 * doesn't paint everything red — only true underperformers show as OUTFLOW.
 *
 * Mounted at the top of Hunt, GEX, and Home. Honest empty states: on
 * loading/error/no-data it renders a minimal placeholder, never fabricates.
 *
 * Data: GET /api/sector-rotation  (server: sector-rotation.ts, 3-min cache)
 */
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, TrendingDown, TrendingUp, Waves, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type FlowState = 'INFLOW' | 'OUTFLOW' | 'NEUTRAL';

interface SectorFlow {
  etf: string;
  name: string;
  change: number;
  relChange: number;
  fiveDayChange: number;
  state: FlowState;
  rank: number;
}

interface RotationBriefData {
  asOf: string;
  marketState: 'PRE' | 'OPEN' | 'AFTER' | 'CLOSED';
  sessionAtMs: number;
  sessionLabel: string;
  isStale: boolean;
  spyChange: number;
  headline: string;
  leaders: SectorFlow[];
  laggards: SectorFlow[];
  sectors: SectorFlow[];
  hasRotation: boolean;
}

export function useRotation() {
  return useQuery<RotationBriefData>({
    queryKey: ['/api/sector-rotation'],
    queryFn: async () => {
      const res = await fetch('/api/sector-rotation', { credentials: 'include' });
      if (!res.ok) throw new Error('rotation failed');
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
  });
}

const STATE_LABEL: Record<RotationBriefData['marketState'], string> = {
  PRE: 'PRE-MARKET',
  OPEN: 'LIVE',
  AFTER: 'AFTER HOURS',
  CLOSED: 'CLOSED',
};

function Chip({ s, tone }: { s: SectorFlow; tone: 'in' | 'out' }) {
  const up = s.change >= 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-mono font-semibold tabular-nums',
        tone === 'in'
          ? 'bg-[var(--trade-bullish)]/10 text-[var(--trade-bullish)] border border-[var(--trade-bullish)]/20'
          : 'bg-[var(--trade-bearish)]/10 text-[var(--trade-bearish)] border border-[var(--trade-bearish)]/20',
      )}
      title={`${s.name} (${s.etf}) ${up ? '+' : ''}${s.change.toFixed(2)}% · ${s.relChange >= 0 ? '+' : ''}${s.relChange.toFixed(2)}% vs SPY · 5d ${s.fiveDayChange >= 0 ? '+' : ''}${s.fiveDayChange.toFixed(1)}%`}
    >
      {s.name}
      <span className="opacity-80">{up ? '+' : ''}{s.change.toFixed(1)}%</span>
    </span>
  );
}

export function RotationBrief({ className }: { className?: string }) {
  const { data, isLoading, isError } = useRotation();

  if (isLoading) {
    return (
      <div className={cn('flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2', className)}>
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/60" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">Reading money flow…</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className={cn('flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2', className)}>
        <Waves className="h-3 w-3 text-muted-foreground/60" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">Money flow unavailable</span>
      </div>
    );
  }

  const spyUp = data.spyChange >= 0;

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card px-3 py-2',
        className,
      )}
    >
      {/* Top line: label + honest session stamp + SPY */}
      <div className="mb-1.5 flex items-center gap-2">
        <Waves className="h-3.5 w-3.5 text-[var(--brand-cyan,#22d3ee)]" />
        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-foreground/80">
          Money Flow
        </span>
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider',
            data.isStale
              ? 'bg-[var(--trade-neutral)]/15 text-[var(--trade-neutral)] border border-[var(--trade-neutral)]/25'
              : data.marketState === 'OPEN'
                ? 'bg-[var(--trade-bullish)]/15 text-[var(--trade-bullish)]'
                : 'bg-muted/60 text-muted-foreground',
          )}
          title={data.isStale ? 'Latest available data is from a prior session — not live flow' : 'Live session data'}
        >
          {data.isStale ? `${data.sessionLabel} · stale` : data.sessionLabel || STATE_LABEL[data.marketState]}
        </span>
        <span className={cn('ml-auto text-[10px] font-mono tabular-nums', spyUp ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]')}>
          SPY {spyUp ? '+' : ''}{data.spyChange.toFixed(2)}%
        </span>
      </div>

      {/* Flow line: OUT → INTO */}
      {data.hasRotation ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-[var(--trade-bearish)]/70">
            <TrendingDown className="h-3 w-3" /> Out of
          </span>
          {data.laggards.map((s) => <Chip key={s.etf} s={s} tone="out" />)}

          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />

          <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-[var(--trade-bullish)]/70">
            <TrendingUp className="h-3 w-3" /> Into
          </span>
          {data.leaders.map((s) => <Chip key={s.etf} s={s} tone="in" />)}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {data.laggards.map((s) => <Chip key={s.etf} s={s} tone="out" />)}
          {data.leaders.map((s) => <Chip key={s.etf} s={s} tone="in" />)}
          {data.leaders.length === 0 && data.laggards.length === 0 && (
            <span className="text-[10px] font-mono text-muted-foreground/60">{data.headline}</span>
          )}
        </div>
      )}
    </div>
  );
}
