/**
 * TimeframeToggle — reusable interval picker
 * ===========================================
 * Used across GEX command, scanner, charts, and stock detail pages.
 * Single visual language for picking 1m / 5m / 15m / 1h / 1d intervals.
 */

import { cn } from '@/lib/utils';

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';

const PRESETS: Record<string, Timeframe[]> = {
  intraday: ['1m', '5m', '15m', '1h'],
  swing: ['15m', '1h', '4h', '1d'],
  full: ['1m', '5m', '15m', '1h', '1d', '1w'],
  daily: ['1d', '1w'],
};

const LABELS: Record<Timeframe, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1D',
  '1w': '1W',
};

export interface TimeframeToggleProps {
  value: Timeframe;
  onChange: (value: Timeframe) => void;
  /** Pre-defined timeframe set, or pass custom array */
  preset?: keyof typeof PRESETS;
  options?: Timeframe[];
  className?: string;
  size?: 'sm' | 'md';
  'data-testid'?: string;
}

export function TimeframeToggle({
  value,
  onChange,
  preset = 'intraday',
  options,
  className,
  size = 'sm',
  'data-testid': testId,
}: TimeframeToggleProps) {
  const choices = options || PRESETS[preset];

  const sizeStyles = size === 'sm'
    ? 'px-2 py-0.5 text-[10px]'
    : 'px-3 py-1 text-xs';

  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 p-1 rounded-md',
        'bg-[var(--surface-raised)] border border-border',
        className,
      )}
      data-testid={testId}
    >
      {choices.map((tf) => (
        <button
          key={tf}
          type="button"
          onClick={() => onChange(tf)}
          className={cn(
            sizeStyles,
            'rounded-sm font-mono font-bold tracking-wider uppercase transition-all',
            value === tf
              ? 'bg-[var(--gex-positive)]/15 text-[var(--gex-positive)] shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-[var(--surface-base)]',
          )}
          data-testid={`timeframe-${tf}`}
        >
          {LABELS[tf]}
        </button>
      ))}
    </div>
  );
}
