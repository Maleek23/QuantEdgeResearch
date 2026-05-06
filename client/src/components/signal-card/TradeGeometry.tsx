/**
 * TradeGeometry — visual stop distance + horizon used
 * Inspired by MomoEdge's "STOP LOSS 1.0R away / HORIZON 35% used"
 */

interface Props {
  stopRMultiple: number;       // 1.0 = 1R away from entry
  horizonUsedPct: number;      // 0-100, % of trade time used
  size?: 'sm' | 'md';
}

export function TradeGeometry({ stopRMultiple, horizonUsedPct, size = 'md' }: Props) {
  const stopDanger = stopRMultiple < 0.5;
  const stopWarning = stopRMultiple < 1.0;

  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">Trade Geometry</div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-400">STOP LOSS</span>
          <span className={`font-mono ${stopDanger ? 'text-red-400' : stopWarning ? 'text-amber-400' : 'text-emerald-400'}`}>
            {stopRMultiple.toFixed(1)}R away
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-400">HORIZON</span>
          <span className={`font-mono ${horizonUsedPct > 80 ? 'text-amber-400' : 'text-zinc-300'}`}>
            {horizonUsedPct}% used
          </span>
        </div>
        {/* Visual horizon bar */}
        <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              horizonUsedPct > 80 ? 'bg-amber-500' :
              horizonUsedPct > 60 ? 'bg-cyan-500' :
              'bg-emerald-500'
            }`}
            style={{ width: `${Math.min(100, horizonUsedPct)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
