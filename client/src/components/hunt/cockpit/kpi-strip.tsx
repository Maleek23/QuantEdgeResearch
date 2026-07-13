/**
 * KpiStrip — the persistent global-state one-liner under the page header.
 * MOMO's "MARKET OPEN · ACTIVE 6 SIGNALS · AVG CONF 84.2% · ...". All values
 * are derived from the real convictions payload + market context.
 */
import { cn } from '@/lib/utils';

interface Kpi {
  label: string;
  value: string;
  tone?: 'bull' | 'bear' | 'neutral' | 'muted';
}

const TONE: Record<NonNullable<Kpi['tone']>, string> = {
  bull: 'var(--trade-bullish)',
  bear: 'var(--trade-bearish)',
  neutral: 'var(--brand-cyan)',
  muted: 'var(--muted-foreground)',
};

export function KpiStrip({ items, live = true, className }: { items: Kpi[]; live?: boolean; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center gap-x-6 gap-y-1 flex-wrap px-3 py-2 rounded-lg border border-card-border bg-card/60',
        className,
      )}
    >
      {items.map((k, i) => (
        <div key={`${k.label}-${i}`} className="flex items-center gap-2">
          <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60">{k.label}</span>
          <span
            className="text-[11px] font-mono font-bold tabular-nums"
            style={{ color: k.tone ? TONE[k.tone] : 'var(--foreground)' }}
          >
            {k.value}
          </span>
        </div>
      ))}
      {live && (
        <div className="ml-auto flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--trade-bullish)] animate-pulse" />
          <span className="text-[9px] font-mono uppercase tracking-widest text-[var(--trade-bullish)]">Live</span>
        </div>
      )}
    </div>
  );
}
