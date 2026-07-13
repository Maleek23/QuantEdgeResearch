/**
 * INDEX SCALPS CARD — live 0DTE SPX/SPY/QQQ/IWM scalp signals.
 *
 * Surfaces what the index-scalp engine generates intraday so the setups are
 * SEEN in real time instead of landing silently in trade_ideas. GEX-structural
 * (gamma flip / call+put walls / negative-gamma momentum), session-aware
 * (regular vs power hour). Honest empty states — never fabricates a setup.
 *
 * Data: GET /api/index-scalps  (server: index-scalp-engine.ts, scheduler-fed)
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Zap, Target, Crosshair, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Bias = 'calls' | 'puts';

interface Scalp {
  id: string;
  symbol: string;
  bias: Bias;
  direction: 'long' | 'short';
  setup: string;
  strike: number;
  expiry: string;
  spot: number;
  target: number;
  stop: number;
  riskRewardRatio: number;
  confidence: number;
  thesis: string;
  catalyst: string;
  regime: string | null;
  isPowerHour: boolean;
  timestamp: string;
}

interface SessionInfo {
  isMarketOpen: boolean;
  isPowerHour: boolean;
  minutesToClose: number;
  sessionLabel: string;
}

interface ScalpsResponse {
  session: SessionInfo;
  scalps: Scalp[];
  count: number;
}

const SETUP_LABEL: Record<string, string> = {
  flip_bounce: 'Flip Bounce',
  wall_fade: 'Wall Fade',
  wall_break: 'Wall Break',
  power_hour: 'Power Hour',
};

function sessionBadge(session: SessionInfo) {
  if (!session.isMarketOpen) {
    return { text: 'CLOSED', cls: 'bg-muted/60 text-muted-foreground' };
  }
  if (session.isPowerHour) {
    return {
      text: `POWER HOUR · ${session.minutesToClose}M`,
      cls: 'bg-[var(--trade-neutral)]/15 text-[var(--trade-neutral)] border border-[var(--trade-neutral)]/25',
    };
  }
  return {
    text: `LIVE · ${session.sessionLabel.toUpperCase()}`,
    cls: 'bg-[var(--trade-bullish)]/15 text-[var(--trade-bullish)]',
  };
}

function ScalpRow({ s }: { s: Scalp }) {
  const isCall = s.bias === 'calls';
  const biasCls = isCall
    ? 'bg-[var(--trade-bullish)]/10 text-[var(--trade-bullish)] border-[var(--trade-bullish)]/25'
    : 'bg-[var(--trade-bearish)]/10 text-[var(--trade-bearish)] border-[var(--trade-bearish)]/25';

  return (
    <div
      className={cn(
        'rounded-md border border-border bg-background/40 px-2.5 py-2',
        s.isPowerHour && 'ring-1 ring-[var(--trade-neutral)]/30',
      )}
      title={s.thesis}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs font-bold text-foreground">{s.symbol}</span>
        <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase', biasCls)}>
          {s.bias}
        </span>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
          {SETUP_LABEL[s.setup] || s.setup}
        </span>
        {s.isPowerHour && (
          <Zap className="h-3 w-3 text-[var(--trade-neutral)]" />
        )}
        <span className="ml-auto font-mono text-[10px] tabular-nums text-[var(--brand-cyan)]">
          {s.riskRewardRatio.toFixed(1)}R
        </span>
      </div>

      <div className="mt-1.5 flex items-center gap-3 text-[10px] font-mono tabular-nums text-muted-foreground">
        <span>
          ${s.strike}
          <span className="text-muted-foreground/50"> {s.bias === 'calls' ? 'C' : 'P'}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Target className="h-3 w-3 text-[var(--trade-bullish)]/70" />
          {s.target.toFixed(s.symbol === 'SPX' ? 0 : 2)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Crosshair className="h-3 w-3 text-[var(--trade-bearish)]/70" />
          {s.stop.toFixed(s.symbol === 'SPX' ? 0 : 2)}
        </span>
        <span className="ml-auto text-foreground/70">{s.confidence}%</span>
      </div>
    </div>
  );
}

export function IndexScalpsCard({ className }: { className?: string }) {
  const { data, isLoading, isError } = useQuery<ScalpsResponse>({
    queryKey: ['/api/index-scalps'],
    queryFn: async () => {
      const res = await fetch('/api/index-scalps', { credentials: 'include' });
      if (!res.ok) throw new Error('scalps failed');
      return res.json();
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  const badge = data?.session ? sessionBadge(data.session) : null;

  return (
    <div className={cn('rounded-lg border border-border bg-card p-3', className)}>
      <div className="mb-2 flex items-center gap-2">
        <Crosshair className="h-3.5 w-3.5 text-[var(--brand-cyan)]" />
        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-foreground/80">
          0DTE Index Scalps
        </span>
        {badge && (
          <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider', badge.cls)}>
            {badge.text}
          </span>
        )}
        <Link
          href="/gex"
          className="ml-auto text-[10px] font-mono text-muted-foreground/50 hover:text-[var(--brand-cyan)]"
        >
          GEX hub →
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-3">
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/60" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">
            Reading GEX structure…
          </span>
        </div>
      ) : isError ? (
        <div className="py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground/50">
          Scalp feed unavailable
        </div>
      ) : !data?.session.isMarketOpen ? (
        <div className="py-3 text-[10px] font-mono text-muted-foreground/60">
          Market closed — scalps run live 9:30am–4pm ET.
        </div>
      ) : !data.scalps.length ? (
        <div className="py-3 text-[10px] font-mono text-muted-foreground/60">
          No A+ structural setup right now. Engine is watching SPX · SPY · QQQ · IWM.
        </div>
      ) : (
        <div className="space-y-1.5">
          {data.scalps.map((s) => (
            <ScalpRow key={s.id} s={s} />
          ))}
        </div>
      )}
    </div>
  );
}
