/**
 * TradeTimeline — horizontal progress bar with ISSUED → DAYS IN → TARGET
 * Inspired by MomoEdge "TRADE TIMELINE 58 DAYS LEFT" component.
 */

interface Props {
  issuedAt: string;          // ISO date
  targetDate?: string;       // ISO date (or null for open-ended)
  daysActive: number;
  size?: 'sm' | 'md';
}

export function TradeTimeline({ issuedAt, targetDate, daysActive, size = 'md' }: Props) {
  const issued = new Date(issuedAt);
  const target = targetDate ? new Date(targetDate) : null;
  const now = new Date();

  const totalDays = target
    ? Math.max(1, Math.floor((target.getTime() - issued.getTime()) / 86400000))
    : Math.max(daysActive * 2, 30);

  const daysLeft = target
    ? Math.max(0, Math.floor((target.getTime() - now.getTime()) / 86400000))
    : null;

  const progressPct = Math.min(100, (daysActive / totalDays) * 100);

  const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className={size === 'sm' ? 'space-y-1' : 'space-y-2'}>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500">
        <span>Trade Timeline</span>
        {daysLeft !== null && <span className="text-cyan-400">{daysLeft} DAYS LEFT</span>}
      </div>
      <div className="relative h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="absolute left-0 top-0 h-full bg-gradient-to-r from-cyan-500/60 to-emerald-500/60 rounded-full"
          style={{ width: `${progressPct}%` }}
        />
        <div
          className="absolute top-0 h-full w-0.5 bg-emerald-400"
          style={{ left: `${progressPct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] text-zinc-500">
        <span>ISSUED <span className="text-zinc-300">{fmtDate(issued)}</span></span>
        <span>{daysActive} DAYS IN</span>
        {target && <span>TARGET <span className="text-zinc-300">{fmtDate(target)}</span></span>}
      </div>
    </div>
  );
}
