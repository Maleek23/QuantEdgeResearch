/**
 * VIZ PRIMITIVES — the shared visual language.
 *
 * A trading surface should let you read position at a glance, not parse a sentence.
 * "stop $1.25 (−50%) target $4.98 (+100%)" is three numbers you have to assemble in your
 * head; a bar with the stop zone, the target zone and a live marker is one look.
 *
 * These are deliberately small and unopinionated so every surface uses the SAME encoding:
 * red is always the losing side, green the winning side, cyan is structural, amber is time
 * running out. Consistency is what makes a glance reliable.
 */
import { cn } from '@/lib/utils';
import { TC } from '@/lib/oracle/trading-colors';

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/**
 * RANGE BAR — stop ─── entry ─── now ─── target on one axis.
 * The single most useful object on a trading screen: where the trade sits between the two
 * prices that end it.
 */
export function RangeBar({
  stop, entry, current, target, height = 8, showTicks = true, className,
}: {
  stop: number; entry: number; current: number; target: number;
  height?: number; showTicks?: boolean; className?: string;
}) {
  const lo = Math.min(stop, entry, current, target);
  const hi = Math.max(stop, entry, current, target);
  const span = hi - lo || 1;
  const pos = (v: number) => clamp(((v - lo) / span) * 100);

  const long = target > stop;
  const stopPos = pos(stop), entryPos = pos(entry), curPos = pos(current), tgtPos = pos(target);
  // risk side runs from the stop to entry; reward side entry to target
  const riskFrom = Math.min(stopPos, entryPos), riskTo = Math.max(stopPos, entryPos);
  const rewFrom = Math.min(entryPos, tgtPos), rewTo = Math.max(entryPos, tgtPos);

  return (
    <div className={cn('w-full', className)}>
      <div className="relative w-full rounded-full bg-foreground/[0.07]" style={{ height }}>
        {/* risk zone */}
        <div className="absolute top-0 bottom-0 rounded-full"
             style={{ left: `${riskFrom}%`, width: `${riskTo - riskFrom}%`, background: `color-mix(in srgb, ${TC.bear} 30%, transparent)` }} />
        {/* reward zone */}
        <div className="absolute top-0 bottom-0 rounded-full"
             style={{ left: `${rewFrom}%`, width: `${rewTo - rewFrom}%`, background: `color-mix(in srgb, ${TC.bull} 26%, transparent)` }} />
        {/* filled progress from entry toward target */}
        <div className="absolute top-0 bottom-0 rounded-full"
             style={{
               left: `${Math.min(entryPos, curPos)}%`,
               width: `${Math.abs(curPos - entryPos)}%`,
               background: (long ? current >= entry : current <= entry) ? TC.bull : TC.bear,
               opacity: 0.9,
             }} />
        {/* entry marker */}
        <div className="absolute top-[-2px] bottom-[-2px] w-px bg-foreground/70" style={{ left: `${entryPos}%` }} />
        {/* live marker */}
        <div className="absolute rounded-full ring-2 ring-background"
             style={{ left: `calc(${curPos}% - ${height / 2}px)`, top: -1, width: height + 2, height: height + 2, background: TC.info }} />
      </div>

      {showTicks && (
        <div className="mt-1 flex justify-between text-[10px] font-mono tabular-nums">
          <span style={{ color: TC.bear }}>{stop.toFixed(2)}</span>
          <span className="text-muted-foreground/70">entry {entry.toFixed(2)}</span>
          <span style={{ color: TC.bull }}>{target.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}

/** METER — a labelled 0–100 fill. Use for anything proportional. */
export function Meter({
  value, label, right, color, height = 6, className,
}: {
  value: number; label?: string; right?: string; color?: string; height?: number; className?: string;
}) {
  const v = clamp(value);
  return (
    <div className={cn('w-full', className)}>
      {(label || right) && (
        <div className="mb-1 flex items-baseline justify-between">
          {label && <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">{label}</span>}
          {right && <span className="text-[10px] font-mono tabular-nums text-muted-foreground/70">{right}</span>}
        </div>
      )}
      <div className="w-full overflow-hidden rounded-full bg-foreground/[0.07]" style={{ height }}>
        <div className="h-full rounded-full transition-[width] duration-500"
             style={{ width: `${v}%`, background: color ?? TC.info }} />
      </div>
    </div>
  );
}

/**
 * DECAY BAR — time left on a contract. Drains as expiry approaches and turns amber then
 * red, because theta is the risk that has no equivalent in shares.
 */
export function DecayBar({ daysLeft, totalDays = 30, className }: { daysLeft: number; totalDays?: number; className?: string }) {
  const pct = clamp((daysLeft / totalDays) * 100);
  const color = daysLeft <= 2 ? TC.bear : daysLeft <= 7 ? TC.warn : TC.muted;
  return (
    <div className={cn('w-full', className)}>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">Time left</span>
        <span className="text-[10px] font-mono tabular-nums" style={{ color }}>{daysLeft}d</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.07]">
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

/**
 * COIL BAR — where price sits inside a consolidation box. Pressing the ceiling is the
 * setup; sitting on the floor is the opposite trade.
 */
export function CoilBar({ low, high, current, className }: { low: number; high: number; current: number; className?: string }) {
  const span = high - low || 1;
  const pos = clamp(((current - low) / span) * 100);
  const color = pos >= 70 ? TC.bull : pos <= 30 ? TC.bear : TC.warn;
  return (
    <div className={cn('w-full', className)}>
      <div className="relative h-1.5 w-full rounded-full"
           style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${TC.bear} 22%, transparent), color-mix(in srgb, ${TC.warn} 18%, transparent), color-mix(in srgb, ${TC.bull} 24%, transparent))` }}>
        <div className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full ring-2 ring-background"
             style={{ left: `calc(${pos}% - 5px)`, background: color }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] font-mono tabular-nums text-muted-foreground/70">
        <span>{low.toFixed(2)}</span>
        <span style={{ color }}>{pos.toFixed(0)}% up the range</span>
        <span>{high.toFixed(2)}</span>
      </div>
    </div>
  );
}

/** DIVERGING BAR — a signed value drawn from a centre line (sector strength, net flow). */
export function DivergingBar({ value, max, height = 6, className }: { value: number; max: number; height?: number; className?: string }) {
  const m = Math.max(Math.abs(max), 0.01);
  const pct = clamp((Math.abs(value) / m) * 50, 0, 50);
  const pos = value >= 0;
  return (
    <div className={cn('relative w-full rounded-full bg-foreground/[0.07]', className)} style={{ height }}>
      <div className="absolute top-0 bottom-0 w-px bg-foreground/25" style={{ left: '50%' }} />
      <div className="absolute top-0 bottom-0 rounded-full"
           style={{ left: pos ? '50%' : `${50 - pct}%`, width: `${pct}%`, background: pos ? TC.bull : TC.bear }} />
    </div>
  );
}
