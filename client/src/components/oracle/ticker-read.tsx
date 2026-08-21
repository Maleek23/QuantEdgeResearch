/**
 * TICKER READ — what we can say when there is no signal.
 *
 * Replaces a dead end. The panel deliberately shows no grade: each dimension
 * carries its own state and its own sentence, and the reader assembles the view.
 * That is more honest than a letter — we are describing conditions, not making a
 * call — and in practice more useful, because "trend down, lagging SPY, gap 3%
 * below that fills 93% of the time" tells you what to watch and a "C" does not.
 */
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { EASE, DUR } from '@/lib/motion';
import { TC } from '@/lib/oracle/trading-colors';

interface Dimension { key: string; label: string; state: string; value: string; read: string }
interface Read {
  symbol: string; spot: number; dimensions: Dimension[];
  band: null; cautions: string[]; note: string;
}

const STATE_COLOR: Record<string, string> = {
  bullish: TC.bull,
  bearish: TC.bear,
  caution: TC.warn,
  neutral: TC.muted,
  unknown: TC.muted,
};

export function TickerRead({ symbol }: { symbol: string }) {
  const { data, isLoading, isError } = useQuery<Read>({
    queryKey: ['/api/ticker/read', symbol],
    queryFn: async () => {
      const r = await fetch(`/api/ticker/${symbol}/read`, { credentials: 'include' });
      if (!r.ok) throw new Error('read failed');
      return r.json();
    },
    staleTime: 300_000, retry: 0, enabled: !!symbol,
  });

  if (isLoading) {
    return (
      <div className="grid place-items-center py-8 text-label ui-eyebrow text-muted-foreground">
        reading {symbol}…
      </div>
    );
  }
  if (isError || !data || !data.dimensions.length) {
    return (
      <div className="px-4 py-6 text-center">
        <div className="text-meta ui-eyebrow text-muted-foreground">Not enough history</div>
        <p className="ui-prose mt-1.5 text-label leading-relaxed text-muted-foreground">
          {symbol} needs about 60 daily bars before these reads mean anything.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* Say what this is before the first row, so it is never mistaken for a call. */}
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <span className="text-meta ui-eyebrow text-foreground/80">Conditions</span>
        <span className="ui-prose text-label text-muted-foreground">no signal published — this is a read, not a call</span>
      </div>

      <div className="divide-y divide-border/25 rounded-lg border border-border/50">
        {data.dimensions.map((d, i) => {
          const c = STATE_COLOR[d.state] ?? TC.muted;
          return (
            <motion.div
              key={d.key}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DUR.base, ease: EASE, delay: Math.min(i * 0.04, 0.25) }}
              className="px-3 py-2"
            >
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c }} />
                <span className="text-meta ui-eyebrow text-muted-foreground">{d.label}</span>
                <span className="ui-data ml-auto text-meta" style={{ color: c }}>{d.value}</span>
              </div>
              <p className="ui-prose mt-1 text-label leading-snug text-muted-foreground">{d.read}</p>
            </motion.div>
          );
        })}
      </div>

      {data.cautions.length > 0 && (
        <div
          className="rounded-lg px-3 py-2"
          style={{ background: `color-mix(in srgb, ${TC.warn} 9%, transparent)`, border: `1px solid color-mix(in srgb, ${TC.warn} 26%, transparent)` }}
        >
          <div className="text-label ui-eyebrow" style={{ color: TC.warn }}>Size for these</div>
          <ul className="mt-1 space-y-0.5">
            {data.cautions.map((c, i) => (
              <li key={i} className="ui-prose text-label leading-snug text-muted-foreground">· {c}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="ui-prose px-1 text-label leading-relaxed text-muted-foreground">{data.note}</p>
    </div>
  );
}
