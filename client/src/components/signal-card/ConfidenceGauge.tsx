/**
 * ConfidenceGauge — semicircle visual gauge for signal confidence
 * Inspired by MomoEdge Oracle's "92.0 ▲ +22" gauge.
 */

interface Props {
  value: number;          // 0-100
  delta?: number;         // change since issued
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function ConfidenceGauge({ value, delta, label = 'Confidence', size = 'md' }: Props) {
  const clamped = Math.max(0, Math.min(100, value));
  // Semi-circle from -90deg to +90deg (180deg arc)
  const angle = (clamped / 100) * 180 - 90;

  const sizeMap = {
    sm: { width: 100, fontSize: 'text-lg' },
    md: { width: 140, fontSize: 'text-2xl' },
    lg: { width: 180, fontSize: 'text-3xl' }
  };
  const dim = sizeMap[size];

  // Determine color based on value
  const color =
    clamped >= 80 ? '#10b981' :   // emerald
    clamped >= 60 ? '#06b6d4' :   // cyan
    clamped >= 40 ? '#f59e0b' :   // amber
    '#ef4444';                     // red

  const radius = dim.width / 2 - 10;
  const cx = dim.width / 2;
  const cy = dim.width / 2;

  // Path for the arc background
  const startX = cx - radius;
  const endX = cx + radius;
  const arcPath = `M ${startX} ${cy} A ${radius} ${radius} 0 0 1 ${endX} ${cy}`;

  // Calculate progress arc end point
  const progressRad = ((angle + 90) * Math.PI) / 180;
  const progressX = cx + radius * Math.cos(Math.PI - progressRad);
  const progressY = cy - radius * Math.sin(progressRad);
  const largeArcFlag = clamped > 50 ? 1 : 0;
  const progressPath = `M ${startX} ${cy} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${progressX} ${progressY}`;

  return (
    <div className="flex flex-col items-center" style={{ width: dim.width }}>
      {label && <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">{label}</div>}
      <div className="relative" style={{ width: dim.width, height: dim.width / 2 + 10 }}>
        <svg width={dim.width} height={dim.width / 2 + 10} viewBox={`0 0 ${dim.width} ${dim.width / 2 + 10}`}>
          {/* Background arc */}
          <path d={arcPath} fill="none" stroke="rgb(39 39 42)" strokeWidth="6" strokeLinecap="round" />
          {/* Progress arc */}
          <path d={progressPath} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
          <div className={`font-bold ${dim.fontSize}`} style={{ color }}>
            {clamped.toFixed(1)}
            {delta !== undefined && delta !== 0 && (
              <span className={`text-xs ml-1 ${delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {delta > 0 ? '▲' : '▼'}
              </span>
            )}
          </div>
          {delta !== undefined && delta !== 0 && (
            <div className={`text-[10px] font-mono ${delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {delta > 0 ? '+' : ''}{delta.toFixed(1)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
