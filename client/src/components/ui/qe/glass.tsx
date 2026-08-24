/**
 * QE GLASS — the canonical Premium-Glass surface + building blocks. THE chosen
 * platform design language: frosted glass cards, cyan accent, IBM Plex mono
 * numbers, a hairline accent top-border, subtle glow on key numbers. Dense by
 * default. Every glass surface across the platform composes these — build once,
 * apply everywhere.
 *
 *   import { GlassCard, GlassKpi, GlassSignal, FlowChip, GlassMicroLabel } from '@/components/ui/qe';
 */
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const bull = 'var(--trade-bullish)';
const bear = 'var(--trade-bearish)';

/** The canonical frosted-glass surface style. */
export const glassSurface: CSSProperties = {
  background: 'rgba(255,255,255,0.035)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  border: '1px solid rgba(255,255,255,0.08)',
};

/** Page-level gradient-mesh background (cyan/violet/red), over the theme bg. */
export const glassMesh: CSSProperties = {
  background:
    'radial-gradient(55% 70% at 10% 0%, rgba(34,211,238,0.09), transparent 60%),' +
    'radial-gradient(45% 60% at 96% 6%, rgba(168,85,247,0.08), transparent 60%),' +
    'radial-gradient(70% 80% at 50% 112%, rgba(239,68,68,0.05), transparent 60%),' +
    'hsl(var(--background))',
};

export function GlassCard({
  children,
  className,
  accent,
  hover = false,
  style,
}: {
  children: ReactNode;
  className?: string;
  /** CSS color for the hairline top accent (e.g. var(--trade-bullish)). */
  accent?: string;
  hover?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn('relative overflow-hidden rounded-xl', hover && 'transition-transform hover:-translate-y-0.5', className)}
      style={{ ...glassSurface, ...style }}
    >
      {accent && <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accent}55, transparent)` }} />}
      {children}
    </div>
  );
}

export function GlassMicroLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('text-[9px] font-mono uppercase tracking-[0.16em] text-muted-foreground/60', className)}>{children}</div>;
}

export function GlassKpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <GlassCard className="px-3 py-2">
      <GlassMicroLabel>{label}</GlassMicroLabel>
      <div className="mt-0.5 text-lg font-mono font-bold tabular-nums leading-none" style={{ color: color || 'hsl(var(--foreground))' }}>{value}</div>
      {sub && <div className="mt-0.5 text-[9px] text-muted-foreground/60">{sub}</div>}
    </GlassCard>
  );
}

export function FlowChip({ name, pct }: { name: string; pct: number }) {
  const up = pct >= 0;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-mono"
      style={{ background: up ? 'var(--trade-bullish-bg)' : 'var(--trade-bearish-bg)', color: up ? bull : bear, border: `1px solid ${up ? bull : bear}30` }}
    >
      {name}
      <span className="tabular-nums opacity-80">{up ? '+' : ''}{pct.toFixed(1)}%</span>
    </span>
  );
}

/** Domain-agnostic glass signal card. Callers adapt their data to these props. */
export interface GlassSignalProps {
  symbol: string;
  isBull: boolean;
  conf: number;     // 0-100 display value
  tag: string;      // e.g. "STRONG BULLISH · 3.4R"
  change?: number;  // optional % change shown bottom-right
  onClick?: () => void;
  className?: string;
}

export function GlassSignal({ symbol, isBull, conf, tag, change, onClick, className }: GlassSignalProps) {
  const c = isBull ? bull : bear;
  return (
    <GlassCard accent={c} hover className={cn(onClick && 'cursor-pointer', className)}>
      <div className={cn('p-3', onClick && 'w-full')} onClick={onClick} role={onClick ? 'button' : undefined}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-mono text-sm font-bold tracking-wide text-foreground truncate">{symbol}</div>
            <div className="text-[10px] font-mono" style={{ color: c }}>{isBull ? '▲' : '▼'} {tag}</div>
          </div>
          <div className="text-2xl font-mono font-bold tabular-nums leading-none shrink-0" style={{ color: c, textShadow: `0 0 18px ${c}44` }}>{conf}</div>
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <div className="h-1 flex-1 rounded-full bg-foreground/10 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${conf}%`, background: c }} />
          </div>
          {typeof change === 'number' && (
            <span className="text-[11px] font-mono tabular-nums shrink-0" style={{ color: change >= 0 ? bull : bear }}>{change >= 0 ? '+' : ''}{change.toFixed(1)}%</span>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
