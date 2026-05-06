/**
 * RunnersTable — Qullamaggie / ADR momentum scanner.
 *
 * Hunts small-mid cap RUNNERS using:
 *   ADR%       — average daily range as % of price (volatility you can ride)
 *   RVOL       — today's volume vs 20d average (fresh participation)
 *   range%     — distance to 20d high (breakout proximity)
 *   tightness  — last 5d ADR / 20d ADR (coiled spring)
 *   gain20d    — uptrend qualifier
 *
 * Default: stocks ≤ $100, ADR ≥ 4%, RVOL ≥ 1.2x.
 * Click any row → opens Research for the symbol.
 */
import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw, Filter, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  QECard,
  QEStatStrip,
  QEPill,
  QEBar,
} from '@/components/ui/qe';

interface Runner {
  symbol: string;
  spot: number;
  adrPct: number;
  adrPct5d: number;
  rvol: number;
  rangePct: number;
  tightness: number;
  gain20d: number;
  score: number;
  scoreTier: 'elite' | 'strong' | 'watch' | 'weak';
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  rrTarget1: number;
  high20d: number;
  low20d: number;
}

interface RunnersResponse {
  runners: Runner[];
  scannedAt: number;
  count: number;
}

export function RunnersTable() {
  const [, setLocation] = useLocation();
  const [maxPrice, setMaxPrice] = useState(100);
  const [minAdrPct, setMinAdrPct] = useState(4);
  const [minRvol, setMinRvol] = useState(1.2);
  const [limit] = useState(50);

  const params = new URLSearchParams({
    maxPrice: String(maxPrice),
    minAdrPct: String(minAdrPct),
    minRvol: String(minRvol),
    limit: String(limit),
  });

  const { data, isLoading, isFetching, error, refetch } = useQuery<RunnersResponse>({
    queryKey: ['/api/momentum/runners', maxPrice, minAdrPct, minRvol, limit],
    queryFn: async () => {
      const res = await fetch(`/api/momentum/runners?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`runners scan failed (${res.status})`);
      return res.json();
    },
    staleTime: 5 * 60_000,
    refetchInterval: false, // expensive scan — manual refresh only
  });

  const runners = data?.runners ?? [];
  const eliteCount = runners.filter(r => r.scoreTier === 'elite').length;
  const strongCount = runners.filter(r => r.scoreTier === 'strong').length;
  const avgAdr = runners.length ? runners.reduce((s, r) => s + r.adrPct, 0) / runners.length : 0;

  return (
    <div className="space-y-3">
      {/* Stats strip */}
      <QECard variant="default" padding="md">
        <QEStatStrip stats={[
          { label: 'RUNNERS', value: runners.length, tone: 'cyan' },
          { label: 'ELITE 75+', value: eliteCount, tone: 'gold' },
          { label: 'STRONG 60+', value: strongCount, tone: 'bull' },
          { label: 'AVG ADR%', value: avgAdr.toFixed(1), tone: 'cyan' },
          { label: 'PRICE ≤', value: `$${maxPrice}` },
          { label: 'MIN ADR', value: `${minAdrPct}%` },
          { label: 'MIN RVOL', value: `${minRvol}x` },
        ]} />
      </QECard>

      {/* Filters */}
      <QECard variant="default" padding="sm">
        <div className="flex items-center gap-3 flex-wrap text-[10px] font-mono">
          <span className="uppercase tracking-widest text-muted-foreground/60">
            <Filter className="w-3 h-3 inline mr-1" /> FILTERS
          </span>
          <FilterSlider label="Max Price" value={maxPrice} onChange={setMaxPrice} min={5} max={500} step={5} suffix="$" />
          <FilterSlider label="Min ADR%" value={minAdrPct} onChange={setMinAdrPct} min={2} max={15} step={0.5} suffix="%" />
          <FilterSlider label="Min RVOL" value={minRvol} onChange={setMinRvol} min={0.5} max={5} step={0.1} suffix="x" />
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="ml-auto inline-flex items-center gap-1.5 px-2 py-1 rounded border border-border hover:border-[var(--brand-cyan)]/50 text-foreground transition-colors"
            title="Re-scan (slow — fetches history for ~250 tickers)"
          >
            <RefreshCw className={cn('w-3 h-3', isFetching && 'animate-spin text-[var(--brand-cyan)]')} />
            <span className="text-[10px] font-mono uppercase tracking-widest">
              {isFetching ? 'Scanning…' : 'Re-scan'}
            </span>
          </button>
        </div>
      </QECard>

      {/* Help text */}
      <div className="text-[10px] font-mono text-muted-foreground/60 leading-relaxed">
        <Flame className="w-3 h-3 inline text-[var(--brand-gold)] mr-1" />
        High-ADR small caps where momentum is tradeable.
        Score: ADR (30) · RVOL (25) · range-to-high (20) · tightness (15) · trend (10).
        Entry = today's close · Stop = 1.5 ADR below · T1 = 2 ADR above · T2 = 4 ADR.
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-4 h-4 animate-spin text-[var(--brand-cyan)]" />
        </div>
      )}

      {error && (
        <QECard variant="accent-bear" padding="md" className="text-center text-[10px] font-mono text-[var(--trade-bearish)]">
          SCAN FAILED — {(error as Error).message}
        </QECard>
      )}

      {!isLoading && !error && runners.length === 0 && (
        <QECard variant="default" padding="lg" className="text-center text-[10px] font-mono text-muted-foreground">
          No runners found with current filters. Try lowering ADR or RVOL minimum.
        </QECard>
      )}

      {!isLoading && runners.length > 0 && (
        <QECard variant="default" padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] font-mono border-collapse min-w-max">
              <thead className="sticky top-0 z-10 bg-muted/30 border-b border-border">
                <tr className="text-[9px] uppercase tracking-widest text-muted-foreground/70">
                  <Th>#</Th>
                  <Th>Symbol</Th>
                  <Th align="right">Price</Th>
                  <Th align="right">ADR%</Th>
                  <Th align="right">5d ADR</Th>
                  <Th align="right">RVOL</Th>
                  <Th align="right">Range%</Th>
                  <Th align="right">Tight</Th>
                  <Th align="right">Gain 20d</Th>
                  <Th align="right">Entry</Th>
                  <Th align="right">Stop</Th>
                  <Th align="right">T1</Th>
                  <Th align="right">T2</Th>
                  <Th align="right">R:R</Th>
                  <Th align="right">Score</Th>
                </tr>
              </thead>
              <tbody>
                {runners.map((r, i) => (
                  <RunnerRow key={r.symbol} r={r} rank={i + 1} onClick={() => setLocation(`/r/${r.symbol}`)} />
                ))}
              </tbody>
            </table>
          </div>
        </QECard>
      )}
    </div>
  );
}

function RunnerRow({ r, rank, onClick }: { r: Runner; rank: number; onClick: () => void }) {
  const tierVariant: 'gold' | 'bull' | 'cyan' | 'default' =
    r.scoreTier === 'elite' ? 'gold' :
    r.scoreTier === 'strong' ? 'bull' :
    r.scoreTier === 'watch' ? 'cyan' : 'default';

  const adrTone =
    r.adrPct >= 8 ? 'text-[var(--brand-gold)] font-bold' :
    r.adrPct >= 5 ? 'text-[var(--brand-cyan)] font-bold' :
    'text-foreground';

  const rvolTone =
    r.rvol >= 2 ? 'text-[var(--brand-cyan)] font-bold' :
    r.rvol >= 1.5 ? 'text-[var(--trade-bullish)]' :
    'text-muted-foreground';

  const rangeTone =
    r.rangePct >= 0.85 ? 'text-[var(--trade-bullish)] font-bold' :
    r.rangePct >= 0.6 ? 'text-foreground' :
    'text-muted-foreground';

  const tightTone =
    r.tightness < 0.6 ? 'text-[var(--brand-gold)] font-bold' :  // very compressed
    r.tightness < 0.85 ? 'text-[var(--brand-cyan)]' :
    'text-muted-foreground';

  const gainTone = r.gain20d > 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]';

  return (
    <tr
      onClick={onClick}
      className="border-b border-border/30 hover:bg-muted/20 cursor-pointer transition-colors"
    >
      <Td className="text-muted-foreground/60 tabular-nums">{rank.toString().padStart(2, '0')}</Td>
      <Td className="font-bold text-foreground">{r.symbol}</Td>
      <Td align="right" className="tabular-nums text-foreground">${r.spot.toFixed(2)}</Td>
      <Td align="right" className={cn('tabular-nums', adrTone)}>{r.adrPct.toFixed(1)}%</Td>
      <Td align="right" className="tabular-nums text-muted-foreground">{r.adrPct5d.toFixed(1)}%</Td>
      <Td align="right" className={cn('tabular-nums', rvolTone)}>{r.rvol.toFixed(1)}x</Td>
      <Td align="right" className={cn('tabular-nums', rangeTone)}>{(r.rangePct * 100).toFixed(0)}%</Td>
      <Td align="right" className={cn('tabular-nums', tightTone)}>{r.tightness.toFixed(2)}</Td>
      <Td align="right" className={cn('tabular-nums', gainTone)}>{r.gain20d >= 0 ? '+' : ''}{r.gain20d.toFixed(1)}%</Td>
      <Td align="right" className="tabular-nums text-foreground">${r.entry.toFixed(2)}</Td>
      <Td align="right" className="tabular-nums text-[var(--trade-bearish)]">${r.stop.toFixed(2)}</Td>
      <Td align="right" className="tabular-nums text-[var(--trade-bullish)]">${r.target1.toFixed(2)}</Td>
      <Td align="right" className="tabular-nums text-[var(--trade-bullish)]/70">${r.target2.toFixed(2)}</Td>
      <Td align="right" className="tabular-nums text-muted-foreground">{r.rrTarget1.toFixed(1)}</Td>
      <Td align="right">
        <div className="flex items-center justify-end gap-1.5">
          <QEBar value={r.score} max={100} tone={r.scoreTier === 'elite' ? 'gold' : r.scoreTier === 'strong' ? 'bull' : 'cyan'} size="xs" className="w-12" />
          <QEPill variant={tierVariant}>{r.score}</QEPill>
        </div>
      </Td>
    </tr>
  );
}

// ─── Tiny shared bits ────────────────────────────────────────────────

function FilterSlider({
  label, value, onChange, min, max, step, suffix,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; suffix: string;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={e => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
        className="w-16 px-2 py-0.5 bg-card border border-border rounded text-foreground tabular-nums focus:border-[var(--brand-cyan)]/50 outline-none"
      />
      <span className="text-muted-foreground/60">{suffix}</span>
    </label>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={cn('px-2 py-1.5 font-medium', align === 'right' ? 'text-right' : 'text-left')}>
      {children}
    </th>
  );
}

function Td({
  children, align = 'left', className,
}: {
  children: React.ReactNode; align?: 'left' | 'right'; className?: string;
}) {
  return (
    <td className={cn('px-2 py-1.5 whitespace-nowrap', align === 'right' && 'text-right', className)}>
      {children}
    </td>
  );
}
