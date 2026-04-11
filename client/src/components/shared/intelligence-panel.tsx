/**
 * IntelligencePanel — reusable narrative + signal stack
 * ======================================================
 * Right-rail intelligence module shown on /command and /stock/:symbol.
 * Aggregates: directional bias, key signals, levels, risks, and a primary thesis.
 *
 * Designed to consume `ConvergenceAnalysis`-like data but flexible enough
 * to take ad-hoc props from any feed.
 */

import {
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface IntelSignal {
  label: string;
  status: 'bullish' | 'bearish' | 'neutral';
  detail?: string;
  weight?: number;
}

export interface IntelLevel {
  type: 'support' | 'resistance' | 'pivot' | string;
  price: number;
  label?: string;
}

export interface IntelligencePanelProps {
  symbol?: string;
  bias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  biasScore?: number; // 0-100
  thesis?: string;
  signals?: IntelSignal[];
  levels?: IntelLevel[];
  risks?: string[];
  loading?: boolean;
  className?: string;
  'data-testid'?: string;
}

function biasColor(bias?: IntelligencePanelProps['bias']): string {
  if (bias === 'BULLISH') return 'text-[var(--gex-positive)] border-[var(--gex-positive)]/40';
  if (bias === 'BEARISH') return 'text-[var(--gex-negative)] border-[var(--gex-negative)]/40';
  return 'text-muted-foreground border-border';
}

function biasIcon(bias?: IntelligencePanelProps['bias']) {
  if (bias === 'BULLISH') return <TrendingUp className="w-4 h-4" />;
  if (bias === 'BEARISH') return <TrendingDown className="w-4 h-4" />;
  return <Minus className="w-4 h-4" />;
}

function signalDot(status: IntelSignal['status']) {
  if (status === 'bullish') return <CheckCircle2 className="w-3 h-3 text-[var(--gex-positive)]" />;
  if (status === 'bearish') return <XCircle className="w-3 h-3 text-[var(--gex-negative)]" />;
  return <Minus className="w-3 h-3 text-muted-foreground" />;
}

function fmtPrice(n: number): string {
  if (n >= 1000) return n.toFixed(0);
  if (n >= 10) return n.toFixed(2);
  return n.toFixed(3);
}

export function IntelligencePanel({
  symbol,
  bias,
  biasScore,
  thesis,
  signals = [],
  levels = [],
  risks = [],
  loading = false,
  className,
  'data-testid': testId,
}: IntelligencePanelProps) {
  if (loading) {
    return (
      <div
        className={cn(
          'rounded-md border border-border bg-[var(--surface-raised)] p-4 animate-pulse',
          className,
        )}
        data-testid={testId}
      >
        <div className="h-4 w-32 bg-border rounded mb-4" />
        <div className="h-20 w-full bg-border/50 rounded mb-3" />
        <div className="h-3 w-full bg-border/30 rounded mb-2" />
        <div className="h-3 w-2/3 bg-border/30 rounded" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-4 rounded-md border border-border bg-[var(--surface-raised)] p-4',
        className,
      )}
      data-testid={testId ?? 'intelligence-panel'}
    >
      {/* === HEADER === */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-cyan-400" />
          <span className="text-[11px] uppercase tracking-wider font-bold text-foreground">
            Intelligence
          </span>
          {symbol && (
            <span className="font-mono text-[11px] text-muted-foreground">{symbol}</span>
          )}
        </div>
        {bias && (
          <span
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-bold uppercase',
              biasColor(bias),
            )}
          >
            {biasIcon(bias)}
            {bias}
            {biasScore != null && (
              <span className="font-mono tabular-nums">{Math.round(biasScore)}</span>
            )}
          </span>
        )}
      </div>

      {/* === THESIS === */}
      {thesis && (
        <div className="rounded bg-[var(--surface-base)] border border-border/50 p-3">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">
            Primary Thesis
          </div>
          <p className="text-[12px] text-foreground leading-relaxed">{thesis}</p>
        </div>
      )}

      {/* === SIGNAL STACK === */}
      {signals.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
            Signals ({signals.length})
          </div>
          <div className="flex flex-col gap-1">
            {signals.map((sig, i) => (
              <div
                key={`${sig.label}-${i}`}
                className="flex items-start gap-2 px-2 py-1.5 rounded bg-[var(--surface-base)] border border-border/50"
                data-testid={`signal-${i}`}
              >
                <div className="mt-0.5 shrink-0">{signalDot(sig.status)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-foreground truncate">
                      {sig.label}
                    </span>
                    {sig.weight != null && (
                      <span className="text-[9px] font-mono text-muted-foreground tabular-nums shrink-0">
                        w{sig.weight.toFixed(1)}
                      </span>
                    )}
                  </div>
                  {sig.detail && (
                    <div className="text-[10px] text-muted-foreground line-clamp-1">
                      {sig.detail}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* === KEY LEVELS === */}
      {levels.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-muted-foreground">
            <Target className="w-3 h-3" />
            Key Levels
          </div>
          <div className="grid grid-cols-2 gap-1">
            {levels.slice(0, 6).map((lvl, i) => {
              const isResist = lvl.type === 'resistance';
              const isSupp = lvl.type === 'support';
              return (
                <div
                  key={`${lvl.type}-${lvl.price}-${i}`}
                  className={cn(
                    'flex items-center justify-between gap-1 px-2 py-1 rounded border',
                    isResist && 'bg-[var(--gex-negative)]/5 border-[var(--gex-negative)]/30',
                    isSupp && 'bg-[var(--gex-positive)]/5 border-[var(--gex-positive)]/30',
                    !isResist && !isSupp && 'bg-[var(--surface-base)] border-border/50',
                  )}
                >
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground truncate">
                    {lvl.label || lvl.type}
                  </span>
                  <span
                    className={cn(
                      'font-mono font-bold text-[11px] tabular-nums',
                      isResist && 'text-[var(--gex-negative)]',
                      isSupp && 'text-[var(--gex-positive)]',
                      !isResist && !isSupp && 'text-foreground',
                    )}
                  >
                    {fmtPrice(lvl.price)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* === RISKS === */}
      {risks.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-yellow-400">
            <AlertTriangle className="w-3 h-3" />
            Risk Factors
          </div>
          <ul className="flex flex-col gap-0.5">
            {risks.slice(0, 4).map((r, i) => (
              <li
                key={i}
                className="text-[10px] text-muted-foreground leading-snug pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-yellow-400"
              >
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* === EMPTY STATE === */}
      {signals.length === 0 && levels.length === 0 && !thesis && (
        <div className="text-[11px] text-muted-foreground text-center py-4">
          No intelligence available
        </div>
      )}
    </div>
  );
}
