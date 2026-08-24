/**
 * EARLY ROTATION — setups forming inside groups money is moving into.
 *
 * Deliberately not another mover list. A name qualifies only when its sector is being
 * bought with real breadth, the name itself is still coiled, and it has NOT already run.
 * Ranked by room left rather than by what already happened — because by the time something
 * tops the leaderboard, the trade is gone.
 */
import { useQuery } from '@tanstack/react-query';
import { Heartbeat } from '@/components/viz';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TC } from '@/lib/oracle/trading-colors';
import { CoilBar } from '@/components/viz';

interface Candidate {
  symbol: string; sector: string; sectorStrength: number; sectorMedianPct: number;
  changePct: number; score: number; coiled: 'strong' | 'developing';
  boxHigh: number | null; boxLow: number | null;
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

export function EarlyRotationPanel({ onSelectSymbol, className }: { onSelectSymbol?: (s: string) => void; className?: string }) {
  const { data, isLoading, isError } = useQuery<EarlyRotation>({
    queryKey: ['/api/early-rotation'],
    queryFn: async () => {
      const r = await fetch('/api/early-rotation', { credentials: 'include' });
      if (!r.ok) throw new Error('early rotation failed');
      return r.json();
    },
    staleTime: 300_000, refetchInterval: 600_000, retry: 1,
  });

  return (
    <div className={cn('rounded-xl border border-card-border bg-card overflow-hidden', className)}>
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-2.5">
        <span className="text-meta font-mono font-bold uppercase tracking-widest text-foreground/80">
          Early Rotation
        </span>
        <div className="flex items-center gap-3">
          <Heartbeat since={data?.generatedAt} staleAfterSec={900} />
          <span className="text-label font-mono text-muted-foreground">watchlist · not signals</span>
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
          <p className="ui-prose border-b border-border/30 px-4 py-2.5 text-body leading-relaxed text-foreground/85">
            {data.interpretation}
          </p>

          {data.candidates.length > 0 && (
            <>
              {/* The score column was an unlabelled integer next to a ticker, which
                  reads as a grade — the one thing it is not. Name it, and say what
                  moves it, before the first row. */}
              <div className="flex items-center gap-3 border-b border-border/30 px-4 py-1.5">
                <span className="w-7 shrink-0 text-label font-mono uppercase tracking-wider text-muted-foreground">Ready</span>
                <span className="text-label font-mono text-muted-foreground">
                  sector inflow + how tightly it's coiled + how close to the breakout — minus whatever already moved today
                </span>
              </div>
            <div className="divide-y divide-border/25">
              {data.candidates.slice(0, 6).map((c) => (
                <button
                  key={c.symbol}
                  onClick={() => onSelectSymbol?.(c.symbol)}
                  className="flex w-full cursor-pointer items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-foreground/[0.04]"
                >
                  <span className="w-7 shrink-0 pt-0.5 text-meta font-mono font-bold tabular-nums"
                        style={{ color: c.coiled === 'strong' ? TC.warn : TC.info }}>
                    {c.score}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="text-body font-mono font-bold tracking-wider text-foreground">{c.symbol}</span>
                      <span className="text-label font-mono uppercase tracking-wider text-muted-foreground/70">{c.sector}</span>
                      <span className="ml-auto text-label font-mono tabular-nums"
                            style={{ color: c.changePct >= 0 ? TC.bull : TC.bear }}>
                        {c.changePct >= 0 ? '+' : ''}{c.changePct.toFixed(1)}% today
                      </span>
                    </span>
                    <span className="mt-0.5 block text-label font-mono text-muted-foreground/70">
                      {c.coiled === 'strong' ? 'tightly coiled' : 'coiling'}
                      {c.distanceToBreakoutPct != null && ` · ${c.distanceToBreakoutPct.toFixed(1)}% to the ceiling`}
                    </span>

                    {/* where price sits inside its range — pressing the ceiling is the setup */}
                    {c.boxLow != null && c.boxHigh != null && (
                      <span className="mt-1.5 block">
                        <CoilBar
                          low={c.boxLow}
                          high={c.boxHigh}
                          current={c.boxHigh - ((c.distanceToBreakoutPct ?? 0) / 100) * c.boxHigh}
                        />
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
            </>
          )}

          <p className="ui-prose border-t border-border/30 px-4 py-2 text-label leading-relaxed text-muted-foreground">
            These are setups, not entries — the range still has to break, and most of these
            will never produce a graded signal. Ranked by room left, not by what has already moved.
          </p>
        </>
      )}
    </div>
  );
}
