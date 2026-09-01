/**
 * EARLY ROTATION — setups forming inside groups money is moving into.
 *
 * Deliberately not another mover list. A name qualifies only when its sector is being
 * bought with real breadth, the name itself is still coiled, and it has NOT already run.
 * Ranked by room left rather than by what already happened — because by the time something
 * tops the leaderboard, the trade is gone.
 */
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { Heartbeat } from '@/components/viz';
import { ArrowUpRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TC } from '@/lib/oracle/trading-colors';
import { CoilBar } from '@/components/viz';

interface Candidate {
  symbol: string; sector: string; sectorStrength: number; sectorMedianPct: number;
  changePct: number; score: number; coiled: 'strong' | 'developing';
  boxHigh: number | null; boxLow: number | null;
  positionInBox?: number;
  squeezeBars?: number;
  distanceToBreakoutPct: number | null; why: string;
}
interface EarlyRotation {
  /** Server-side generation time. Heartbeat reads this, never the fetch time. */
  generatedAt?: string;
  session: string;
  sectorsRotatingIn: { key: string; label: string; medianChangePct: number; breadthPct: number }[];
  candidates: Candidate[];
  interpretation: string;
}

export function EarlyRotationPanel({
  onSelectSymbol,
  className,
  compact,
}: {
  onSelectSymbol?: (s: string) => void;
  className?: string;
  /**
   * The panel lives in a ~300px rail in the Oracle v2 layout, where Tailwind's
   * viewport breakpoints still see a wide screen and lay the interpretation and
   * legend side by side — squeezing the prose to one word per line. Compact
   * keeps the stacked (narrow) arrangement regardless of viewport width.
   */
  compact?: boolean;
}) {
  const reduce = useReducedMotion();
  const { data, isLoading, isError } = useQuery<EarlyRotation>({
    queryKey: ['/api/early-rotation'],
    queryFn: async () => {
      const r = await fetch('/api/early-rotation', { credentials: 'include' });
      if (!r.ok) throw new Error('early rotation failed');
      return r.json();
    },
    // This screen is a developing-setup scan, not a price ticker. Two minutes
    // gives sector leadership time to settle without leaving a fresh market
    // session looking frozen for ten minutes.
    staleTime: 60_000, refetchInterval: 120_000, retry: 1,
  });

  return (
    <div className={cn('qe-rotation-candidates overflow-hidden bg-card', !compact && 'rounded-xl border border-card-border', className)}>
      <div className={cn('flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3', !compact && 'md:px-5')}>
        <div>
          <span className="font-sans text-[12px] font-semibold text-foreground/90">Candidate field</span>
          <span className="ml-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/65">before a signal</span>
        </div>
        <div className="flex items-center gap-3">
          <Heartbeat since={data?.generatedAt} staleAfterSec={900} />
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground sm:inline">not tradeable yet</span>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-28 items-center justify-center gap-2 text-label font-mono uppercase tracking-widest text-muted-foreground/70">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> screening…
        </div>
      ) : isError || !data ? (
        <div className="px-5 py-8 text-center text-meta leading-relaxed text-muted-foreground/70">
          Screen unavailable. It will retry automatically.
        </div>
      ) : (
        <>
          <div className={cn('flex flex-col gap-3 border-b border-border/30 px-4 py-3', !compact && 'md:flex-row md:items-center md:justify-between md:px-5')}>
            <p className="ui-prose max-w-3xl text-[13px] leading-relaxed text-foreground/82">
              {data.interpretation}
            </p>
            <div className="flex shrink-0 items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/75">
              <span className="text-[var(--brand-cyan)]">sector inflow</span>
              <span>→</span>
              <span className="text-[var(--brand-gold)]">compression</span>
              <span>→</span>
              <span className="text-[var(--trade-bullish)]">breakout</span>
            </div>
          </div>

          {data.candidates.length > 0 && (
            <>
            <div
              className="qe-candidate-field grid gap-px bg-border/35"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(230px, 100%), 1fr))' }}
            >
              {data.candidates.slice(0, 6).map((c, index) => (
                <motion.button
                  key={c.symbol}
                  layout
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={reduce ? { duration: 0 } : { duration: .32, delay: index * .045 }}
                  onClick={() => onSelectSymbol?.(c.symbol)}
                  className="qe-candidate-node group relative min-h-[154px] cursor-pointer overflow-hidden bg-card px-3.5 py-3.5 text-left transition-colors hover:bg-foreground/[0.035] md:px-4"
                >
                  <span className="absolute right-3 top-3 font-mono text-[10px] tabular-nums text-muted-foreground/55">{String(index + 1).padStart(2, '0')}</span>
                  <span className="flex items-start justify-between gap-3 pr-7">
                    <span>
                      <span className="block font-mono text-[15px] font-bold tracking-[0.06em] text-foreground">{c.symbol}</span>
                      <span className="mt-0.5 block truncate font-sans text-[12px] text-muted-foreground">{c.sector}</span>
                    </span>
                  </span>

                  <span className="mt-4 flex items-end justify-between gap-3">
                    <span>
                      <span className="block font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/65">to trigger</span>
                      <span className="mt-0.5 block font-mono text-[17px] font-bold tabular-nums text-foreground">{c.distanceToBreakoutPct?.toFixed(1) ?? '—'}%</span>
                    </span>
                    <span className="text-right font-mono text-[11px] tabular-nums">
                      <span className="block" style={{ color: TC.bull }}>{c.sectorMedianPct >= 0 ? '+' : ''}{c.sectorMedianPct.toFixed(1)}% group</span>
                      <span className="mt-1 block" style={{ color: c.changePct >= 0 ? TC.bull : TC.bear }}>{c.changePct >= 0 ? '+' : ''}{c.changePct.toFixed(1)}% today</span>
                    </span>
                  </span>

                    {/* This is a range, not a progress bar: left is support, right is
                        the trigger. The marker is the actual position in the box. */}
                    {c.boxLow != null && c.boxHigh != null && (
                      <span className="mt-3 block transition-transform duration-200 group-hover:scale-y-110">
                        <CoilBar
                          low={c.boxLow}
                          high={c.boxHigh}
                          current={c.boxLow + (c.boxHigh - c.boxLow) * (c.positionInBox ?? 0.5)}
                        />
                      </span>
                    )}
                  <span className="mt-2 flex items-center justify-between font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/70">
                    <span style={{ color: c.coiled === 'strong' ? TC.warn : TC.info }}>{c.coiled === 'strong' ? 'tight coil' : 'forming'}</span>
                    <span className="inline-flex items-center gap-1 transition-colors group-hover:text-[var(--brand-cyan)]">inspect <ArrowUpRight className="h-3 w-3" /></span>
                  </span>
                </motion.button>
              ))}
            </div>
            </>
          )}

          <p className="ui-prose border-t border-border/30 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground md:px-5">
            Watch candidates are ranked by inflow, compression and room left. They enter the active book only after a real trigger and corroborating evidence.
          </p>
        </>
      )}
    </div>
  );
}
