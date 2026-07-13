/**
 * ConvictionGauge — the hero radial (semicircle) gauge. MOMO's "CONFIDENCE INDEX".
 * Pure SVG arc, score 0-100. Bold + colorful: gradient value arc, layered glow,
 * a glowing end-cap dot, and a big tabular score — the loud hero of the rail.
 */
import { useId } from 'react';
import { cn } from '@/lib/utils';
import type { Tone } from '@/lib/convictions';

const COLOR: Record<Tone, string> = {
  bull: 'var(--trade-bullish)',
  bear: 'var(--trade-bearish)',
  neutral: 'var(--brand-cyan)',
};

/** Describe a semicircle arc path from 180° (left) to 0° (right). */
function arcPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number) {
  const pol = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
  };
  const start = pol(fromDeg);
  const end = pol(toDeg);
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  // sweep 0 = counter-clockwise; we draw from 180 → 0 going clockwise over the top
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
}

export function ConvictionGauge({
  score,
  tone = 'bull',
  tierLabel,
  caption,
  size = 168,
  className,
}: {
  score: number;
  tone?: Tone;
  tierLabel?: string;
  caption?: string;
  size?: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, score));
  const w = size;
  const h = size * 0.62;
  const cx = w / 2;
  const cy = h - 6;
  const r = w / 2 - 14;
  const stroke = 12;
  const color = COLOR[tone];
  const gid = useId().replace(/:/g, '');

  // 180° (left) → 0° (right). Value sweeps from 180 down toward 0.
  const valueDeg = 180 - (clamped / 100) * 180;
  const capRad = (valueDeg * Math.PI) / 180;
  const capX = cx + r * Math.cos(capRad);
  const capY = cy - r * Math.sin(capRad);

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
        <defs>
          <linearGradient id={`grad-${gid}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color} stopOpacity={0.45} />
            <stop offset="100%" stopColor={color} stopOpacity={1} />
          </linearGradient>
        </defs>
        {/* track */}
        <path
          d={arcPath(cx, cy, r, 180, 0)}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
          strokeLinecap="round"
          opacity={0.45}
        />
        {/* value — layered glow under a crisp gradient stroke */}
        <path
          d={arcPath(cx, cy, r, 180, valueDeg)}
          fill="none"
          stroke={color}
          strokeWidth={stroke + 4}
          strokeLinecap="round"
          opacity={0.35}
          style={{ filter: `blur(6px)` }}
        />
        <path
          d={arcPath(cx, cy, r, 180, valueDeg)}
          fill="none"
          stroke={`url(#grad-${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 8px ${color}aa)` }}
        />
        {/* glowing end-cap dot */}
        <circle cx={capX} cy={capY} r={stroke / 2 + 1} fill={color} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
        <circle cx={capX} cy={capY} r={stroke / 4} fill="var(--background)" />
        {/* score */}
        <text
          x={cx}
          y={cy - r * 0.30}
          textAnchor="middle"
          className="font-mono font-bold tabular-nums"
          style={{ fontSize: w * 0.30, fill: color, filter: `drop-shadow(0 0 10px ${color}66)` }}
        >
          {Math.round(clamped)}
        </text>
      </svg>
      {tierLabel && (
        <div
          className="mt-1 text-[12px] font-mono font-bold uppercase tracking-widest"
          style={{ color, textShadow: `0 0 12px ${color}66` }}
        >
          {tierLabel}
        </div>
      )}
      {caption && (
        <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/70 mt-0.5">
          {caption}
        </div>
      )}
    </div>
  );
}
