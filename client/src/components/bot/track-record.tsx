/**
 * TRACK RECORD — what the board's published signals have actually done.
 *
 * This exists because the number is easy to flatter and the flattering version is
 * worthless. Counting only trades that tagged a target or a stop gives ~76%; the
 * canonical accounting, which applies P&L thresholds and buckets everything that
 * resolved neither way as NEUTRAL, gives 38.5%. The second number is the real one,
 * so the neutral bucket is displayed rather than quietly dropped — a win rate
 * computed on a filtered subset is a claim about the filter, not the strategy.
 *
 * Expectancy leads, because win rate alone decides nothing: a 38% hit rate with a
 * 1.55:1 payoff is a different business from a 38% hit rate at 1:1, and only
 * expectancy tells them apart.
 */
import { useQuery } from '@tanstack/react-query';
import { TC } from '@/lib/oracle/trading-colors';
import { StackedBar } from '@/components/viz';

interface HorizonRow {
  horizon: string; total: number; hitTarget: number; hitStop: number;
  expired: number; expiredPct: number; decided: number;
  winRateDecided: number | null; avgTargetPct: number | null;
}

interface Overall {
  wins: number; losses: number; neutral: number;
  total: number; decided: number;
  winRate: number; avgWinPct: number; avgLossPct: number; expectancy: number;
}

export function TrackRecord({ className }: { className?: string }) {
  const { data, isLoading, isError } = useQuery<{ overall: Overall; methodology?: any }>({
    queryKey: ['/api/performance/stats'],
    queryFn: async () => {
      const r = await fetch('/api/performance/stats', { credentials: 'include' });
      if (!r.ok) throw new Error('performance failed');
      return r.json();
    },
    staleTime: 600_000, retry: 1,
  });

  const o = data?.overall;

  // The headline number averages two very different populations together. Day
  // signals resolve; swing signals mostly expire. Splitting them is the difference
  // between "the edge is negative" and "the swing window is too short".
  const { data: byHorizon } = useQuery<{ horizons: HorizonRow[] }>({
    queryKey: ['/api/performance/by-horizon'],
    queryFn: async () => {
      const r = await fetch('/api/performance/by-horizon', { credentials: 'include' });
      if (!r.ok) throw new Error('horizon breakdown failed');
      return r.json();
    },
    staleTime: 600_000, retry: 1,
  });

  if (isLoading) {
    return (
      <div className={`rounded-xl border border-card-border bg-card px-4 py-8 text-center text-label font-mono uppercase tracking-widest text-muted-foreground ${className ?? ''}`}>
        reading track record…
      </div>
    );
  }
  if (isError || !o || !o.total) {
    return (
      <div className={`rounded-xl border border-card-border bg-card px-4 py-8 text-center ${className ?? ''}`}>
        <div className="text-meta font-mono uppercase tracking-widest text-muted-foreground">No closed trades yet</div>
        <div className="mt-1 text-label font-mono text-muted-foreground">
          A win rate before trades close would be invented.
        </div>
      </div>
    );
  }

  const expPositive = o.expectancy >= 0;
  const expColor = expPositive ? TC.bull : TC.bear;
  const payoff = o.avgLossPct > 0 ? o.avgWinPct / o.avgLossPct : null;

  return (
    <div className={`rounded-xl border border-card-border bg-card overflow-hidden ${className ?? ''}`}>
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-2.5">
        <span className="text-meta font-mono font-bold uppercase tracking-widest text-foreground/80">Track Record</span>
        <span className="text-label font-mono text-muted-foreground">{o.total} published signals</span>
      </div>

      {/* Expectancy first. It is the only figure that combines hit rate with payoff,
          and it is the one that decides whether the edge is positive. */}
      <div className="border-b border-border/30 px-4 py-3">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <span className="text-label font-mono uppercase tracking-wider text-muted-foreground">Expectancy per trade</span>
          <span className="text-lead font-mono font-bold tabular-nums" style={{ color: expColor }}>
            {expPositive ? '+' : ''}{o.expectancy.toFixed(2)}%
          </span>
        </div>
        <p className="mt-1 text-label font-mono leading-snug text-muted-foreground">
          {expPositive
            ? `A ${o.winRate.toFixed(1)}% hit rate paying ${payoff ? payoff.toFixed(2) : '—'}:1 nets out positive before costs. Commissions and slippage come out of this.`
            : `A ${o.winRate.toFixed(1)}% hit rate paying ${payoff ? payoff.toFixed(2) : '—'}:1 does not cover its losers. This is before commissions and slippage, which make it worse.`}
        </p>
      </div>

      {/* Every trade accounted for, including the ones a win rate would hide. */}
      <div className="px-4 py-3">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-label font-mono uppercase tracking-wider text-muted-foreground">Outcome of all {o.total}</span>
          <span className="text-label font-mono tabular-nums text-muted-foreground">
            {o.winRate.toFixed(1)}% of {o.decided} decided
          </span>
        </div>
        <StackedBar
          segments={[
            { value: o.wins, color: TC.bull, label: 'wins' },
            { value: o.losses, color: TC.bear, label: 'losses' },
            { value: o.neutral, color: TC.muted, label: 'neutral' },
          ]}
        />
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
          <Legend color={TC.bull} label="wins" value={o.wins} />
          <Legend color={TC.bear} label="losses" value={o.losses} />
          <Legend color={TC.muted} label="neutral" value={o.neutral} />
        </div>
        <p className="mt-2 text-label font-mono leading-snug text-muted-foreground">
          Neutral = expired, manually exited, or moved less than 3% either way. They are
          excluded from the win rate but shown here, because a rate quoted on the decided
          subset alone reads far better than the record actually is.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-px border-y border-border/30 bg-border/30">
        <Stat label="Avg win" value={`+${o.avgWinPct.toFixed(1)}%`} color={TC.bull} />
        <Stat label="Avg loss" value={`-${o.avgLossPct.toFixed(1)}%`} color={TC.bear} />
      </div>

      {/* Where the expectancy actually goes. */}
      {(byHorizon?.horizons?.length ?? 0) > 0 && (
        <div className="px-4 py-3">
          <div className="mb-2 text-label font-mono uppercase tracking-wider text-muted-foreground">By horizon</div>
          <div className="space-y-2">
            {byHorizon!.horizons.map((h) => {
              const bad = h.expiredPct >= 60;
              return (
                <div key={h.horizon}>
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <span className="text-meta font-mono uppercase tracking-wider text-foreground/85">{h.horizon}</span>
                    <span className="text-label font-mono tabular-nums text-muted-foreground">
                      {h.total} signals
                      {h.avgTargetPct != null ? ` · asks ${h.avgTargetPct}%` : ''}
                      {' · '}
                      <span style={{ color: bad ? TC.bear : TC.muted }}>{h.expiredPct}% never resolved</span>
                    </span>
                  </div>
                  <div className="mt-1">
                    <StackedBar
                      segments={[
                        { value: h.hitTarget, color: TC.bull },
                        { value: h.hitStop, color: TC.bear },
                        { value: h.expired, color: TC.muted },
                      ]}
                      height={6}
                    />
                  </div>
                  {bad && (
                    <div className="mt-1 text-label font-mono leading-snug" style={{ color: TC.warn }}>
                      Most of these expire before hitting a target or a stop — the window is
                      short relative to the {h.avgTargetPct != null ? `${h.avgTargetPct}% ` : ''}move being asked for,
                      so the win rate above is computed on a small fraction of them.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-label font-mono text-muted-foreground">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label} <span className="tabular-nums text-foreground/80">{value}</span>
    </span>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-card px-4 py-2.5">
      <div className="text-label font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-body font-mono font-bold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}
