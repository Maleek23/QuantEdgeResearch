/**
 * CASH-GATE BANNER — "be cash before the print."
 *
 * Reads GET /api/macro/cash-gate and surfaces a board-level risk banner when a
 * high-impact macro event (FOMC / CPI / NFP / Powell) is imminent. The trading
 * chat's #1 ask, made visible where they hunt.
 *
 *   cash  → red banner   ("size down / hold cash")
 *   watch → amber strip  ("plan around it")
 *   clear → a calm one-line "all clear" chip (only with current calendar coverage)
 *   unavailable → amber coverage warning, never a fabricated all-clear
 *
 * Data is only as current as server/economic-calendar.ts — see the endpoint note.
 */
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock, ShieldCheck, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Level = 'clear' | 'watch' | 'cash' | 'unavailable';

interface CashGate {
  level: Level;
  active: boolean;
  dampenGrades: boolean;
  message: string;
  nextEvent: { name: string; date: string; time: string; hoursUntil: number | null; tradingImpact?: string } | null;
  upcoming: Array<{ name: string; date: string; time: string; hoursUntil: number | null }>;
  calendar?: { current: boolean; firstDate: string | null; lastDate: string | null; source: string };
}

export function CashGateBanner({ className }: { className?: string }) {
  const { data, isLoading, isError } = useQuery<CashGate>({
    queryKey: ['/api/macro/cash-gate'],
    queryFn: async () => {
      const r = await fetch('/api/macro/cash-gate', { credentials: 'include' });
      if (!r.ok) throw new Error('cash-gate failed');
      return r.json();
    },
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className={cn('flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2', className)}>
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/60" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">Checking event risk…</span>
      </div>
    );
  }
  if (isError || !data) return null;

  // An older server response without coverage metadata is also unverified. A
  // missing field cannot be allowed to turn into a reassuring green all-clear.
  if (data.level === 'unavailable' || !data.calendar || !data.calendar.current) {
    return (
      <div
        className={cn('flex items-center gap-2 rounded-lg border px-3 py-2', className)}
        style={{
          borderColor: 'color-mix(in srgb, var(--trade-neutral) 45%, transparent)',
          background: 'color-mix(in srgb, var(--trade-neutral) 10%, transparent)',
        }}
        role="status"
      >
        <Clock className="h-3.5 w-3.5 shrink-0 text-[var(--trade-neutral)]" />
        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--trade-neutral)]">Event coverage</span>
        <span className="text-[11px] font-mono text-muted-foreground/85">calendar needs refresh — no all-clear implied</span>
      </div>
    );
  }

  // ── CLEAR: calm confirmation the gate is watching ──
  if (data.level === 'clear') {
    return (
      <div className={cn('flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5', className)}>
        <ShieldCheck className="h-3.5 w-3.5 text-[var(--trade-bullish,#22c55e)]" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70">Event risk</span>
        <span className="text-[11px] font-mono text-muted-foreground/80">clear — no high-impact macro print imminent</span>
      </div>
    );
  }

  const isCash = data.level === 'cash';
  const tone = isCash ? 'var(--trade-bearish, #ef4444)' : 'var(--trade-neutral, #f59e0b)';
  const Icon = isCash ? AlertTriangle : Clock;

  return (
    <div
      className={cn('rounded-lg border px-3 py-2', className)}
      style={{
        borderColor: `color-mix(in srgb, ${tone} 45%, transparent)`,
        background: `color-mix(in srgb, ${tone} 12%, transparent)`,
      }}
      role="alert"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <Icon className="h-4 w-4 shrink-0" style={{ color: tone }} />
        <span className="text-[10px] font-mono font-bold uppercase tracking-widest" style={{ color: tone }}>
          {isCash ? 'Cash-gate · size down' : 'Event watch'}
        </span>
        <span className="text-[12px] font-mono text-foreground/90">{data.message}</span>
      </div>
      {data.nextEvent?.tradingImpact && (
        <p className="mt-1 text-[10px] font-mono text-muted-foreground/70 leading-snug pl-6">
          {data.nextEvent.tradingImpact}
        </p>
      )}
    </div>
  );
}
