/**
 * SignalComponents — 5-bar breakdown of WHY this signal scores high
 * Inspired by MomoEdge's "VALIDITY 100 / PROGRESS 100 / PACE 100 / RETENTION 100 / OVERLAY 67"
 *
 * Maps QuantEdge's multi-signal-discovery output:
 *   validity   = squeeze + range tightness
 *   progress   = position in range + breakout confirmation
 *   pace       = momentum (4w return capped)
 *   retention  = ADX trend strength
 *   overlay    = GEX alignment + IV anomaly
 */

interface ComponentsData {
  validity: number;     // 0-100
  progress: number;
  pace: number;
  retention: number;
  overlay: number;
}

interface Props {
  components: ComponentsData;
  size?: 'sm' | 'md';
}

const COMPONENT_LABELS: { key: keyof ComponentsData; label: string; description: string }[] = [
  { key: 'validity', label: 'VALIDITY', description: 'Squeeze + range tightness' },
  { key: 'progress', label: 'PROGRESS', description: 'Breakout position' },
  { key: 'pace', label: 'PACE', description: 'Momentum strength' },
  { key: 'retention', label: 'RETENTION', description: 'ADX trend persistence' },
  { key: 'overlay', label: 'OVERLAY', description: 'GEX + IV alignment' }
];

export function SignalComponents({ components, size = 'md' }: Props) {
  const colorFor = (v: number) =>
    v >= 80 ? 'bg-emerald-500' :
    v >= 60 ? 'bg-cyan-500' :
    v >= 40 ? 'bg-amber-500' :
    'bg-red-500';

  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">Signal Components</div>
      <div className={size === 'sm' ? 'space-y-1' : 'space-y-1.5'}>
        {COMPONENT_LABELS.map(({ key, label, description }) => {
          const value = Math.round(components[key]);
          return (
            <div
              key={key}
              className="flex items-center gap-2 group"
              title={description}
            >
              <span className="text-[10px] text-zinc-400 w-20 font-mono">{label}</span>
              <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full ${colorFor(value)} transition-all duration-500`}
                  style={{ width: `${value}%` }}
                />
              </div>
              <span className={`text-xs font-mono w-8 text-right ${
                value >= 80 ? 'text-emerald-400' :
                value >= 60 ? 'text-cyan-400' :
                value >= 40 ? 'text-amber-400' :
                'text-red-400'
              }`}>
                {value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
