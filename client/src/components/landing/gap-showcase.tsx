/**
 * GAP SHOWCASE — the reference site's chart section, with the one thing it lacks.
 *
 * Their version is a beautiful decorative curve with invented axis values
 * (133 / 104 / 76 / 48 / 19). It is a shape, not a measurement. Copying the shape
 * onto a trading platform and labelling it "Price (USD)" would be the same species
 * of overclaim this page already refuses everywhere else.
 *
 * So the geometry and the motion are theirs, read from their stylesheet, and the
 * DATA is real: a live price series from /api/historical-prices, with that symbol's
 * own unfilled gaps drawn as levels and its own measured fill rate stated
 * underneath. Where their chart says "here is a rising line", this one says "here
 * is where price has an unclosed gap, and here is how often this symbol closes
 * one" — which is the actual product.
 *
 * If either call fails the section renders nothing. A chart is not worth
 * fabricating to fill a slot.
 */
import { useQuery } from '@tanstack/react-query';
import { PriceChart } from './price-chart';

const SYMBOL = 'SPY';

interface Candle { time: number; close: number }
interface Gap {
  from: number; to: number; nearEdge: number; sizePct: number;
  ageBars: number; distancePct: number;
}
interface GapReport {
  spot: number;
  unfilled?: Gap[];
  stats?: { fillRate?: number; filled?: number; total?: number; medianBarsToFill?: number | null };
}

export function GapShowcase() {
  const { data: hist } = useQuery<{ data?: Candle[] }>({
    queryKey: ['/api/historical-prices', SYMBOL, 'landing'],
    queryFn: async () => {
      const r = await fetch(`/api/historical-prices/${SYMBOL}`, { credentials: 'include' });
      if (!r.ok) throw new Error('history failed');
      return r.json();
    },
    staleTime: 600_000,
    retry: 1,
  });

  const { data: gaps } = useQuery<GapReport>({
    queryKey: ['/api/gaps', SYMBOL, 'landing'],
    queryFn: async () => {
      const r = await fetch(`/api/gaps/${SYMBOL}`, { credentials: 'include' });
      if (!r.ok) throw new Error('gaps failed');
      return r.json();
    },
    staleTime: 600_000,
    retry: 1,
  });

  const series = (hist?.data ?? []).map((c) => c.close).filter((n) => Number.isFinite(n));
  if (series.length < 2) return null;

  const stats = gaps?.stats;
  // Only levels price could plausibly reach — the raw feed carries every gap on the
  // chart, including artifacts 100%+ away.
  const near = (gaps?.unfilled ?? [])
    .filter((g) => Math.abs(g.distancePct) <= 12)
    .sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct))
    .slice(0, 2);

  return (
    <div className="px-6 py-20 md:py-28 max-w-7xl mx-auto">
      <div className="grid gap-6 md:grid-cols-[1.2fr_1fr] md:items-end mb-10">
        <div>
          <span className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-[var(--brand-cyan)]">
            Levels
          </span>
          <h2 className="mt-3 text-3xl sm:text-4xl lg:text-[3.25rem] font-light leading-[1.06] tracking-[-0.03em] text-foreground">
            A target is a level,
            <br />
            not a percentage.
          </h2>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground max-w-md md:pb-2">
          An unfilled gap is a price the tape skipped and tends to come back for. The board
          draws them from {SYMBOL}&rsquo;s own history and states how often this symbol has
          actually closed one — a base rate attached to a level, rather than a target set by
          multiplying the risk.
        </p>
      </div>

      <div className="rounded-xl border border-card-border bg-card p-4 sm:p-6">
        <PriceChart
          series={series}
          axisTitle={`${SYMBOL} · daily close`}
          levels={near.map((g) => ({
            price: g.nearEdge,
            label: `gap ${g.from.toFixed(2)}–${g.to.toFixed(2)}`,
            tone: 'structural' as const,
          }))}
        />

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/60 pt-4">
          {stats && stats.total ? (
            <>
              <Stat
                value={`${Math.round((stats.fillRate ?? 0) * 100)}%`}
                label={`of ${SYMBOL} gaps have filled`}
              />
              <Stat value={`${stats.filled}/${stats.total}`} label="sample" />
              {stats.medianBarsToFill != null && (
                <Stat value={`${stats.medianBarsToFill}`} label="median bars to fill" />
              )}
              <Stat value={`${near.length}`} label="unfilled within 12%" />
            </>
          ) : (
            <span className="text-[12px] font-mono text-muted-foreground/60">
              No gap history for {SYMBOL} yet — the rate fills in as sessions archive.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-lg font-mono font-bold tabular-nums text-[var(--brand-cyan)]">{value}</span>
      <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground/60">
        {label}
      </span>
    </div>
  );
}
