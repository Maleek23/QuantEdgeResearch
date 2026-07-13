/**
 * DiscountScanner — EOD relative-value option "discounts".
 *
 * For each expiry we fit a smooth smile to EACH side (calls vs the call smile,
 * puts vs the put smile) and flag contracts whose IV sits a real distance below
 * it — a genuine statistical outlier (≥σ and ≥vol-points under the curve), not
 * just a point on the natural skew. A way to enter a directional bet for less
 * premium and carry it overnight / into next week.
 *
 * Backed by /api/scanner/eod-discount (CBOE delayed chain + Black-Scholes
 * re-priced at the fitted smile). ~15min delayed — a near-close read, not a
 * live print. Click any row → opens Research for the symbol.
 */
import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw, Filter, Tag, Moon, CalendarDays, TrendingUp, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QECard, QEStatStrip, QEPill, QEBar } from '@/components/ui/qe';

type Bucket = 'overnight' | 'weekly' | 'swing';

interface DiscountContract {
  symbol: string;
  optionType: 'call' | 'put';
  strike: number;
  expiry: string;
  dte: number;
  bucket: Bucket;
  mid: number;
  bid: number;
  ask: number;
  spreadPct: number;
  iv: number;
  baselineIv: number;
  volEdge: number; // vol points below the fitted smile
  zEdge: number; // residual-σ below the fitted smile
  fairValue: number;
  discountDollars: number;
  discountPct: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  openInterest: number;
  volume: number;
  spot: number;
  score: number;
  rationale: string;
}

interface DiscountResponse {
  asOf: string;
  scannedCount: number;
  symbolsWithData: number;
  thresholdPct: number;
  contracts: DiscountContract[];
  notes: string[];
}

type SideFilter = 'both' | 'call' | 'put';

export function DiscountScanner() {
  const [, setLocation] = useLocation();
  const [discountPct, setDiscountPct] = useState(5); // %
  const [maxDte, setMaxDte] = useState(45);
  const [side, setSide] = useState<SideFilter>('both');
  const [symbols, setSymbols] = useState('');

  const params = new URLSearchParams({
    discountPct: String(discountPct),
    maxDte: String(maxDte),
    side,
  });
  if (symbols.trim()) params.set('symbols', symbols.trim().toUpperCase());

  const { data, isLoading, isFetching, error, refetch } = useQuery<DiscountResponse>({
    queryKey: ['/api/scanner/eod-discount', discountPct, maxDte, side, symbols.trim().toUpperCase()],
    queryFn: async () => {
      const res = await fetch(`/api/scanner/eod-discount?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`discount scan failed (${res.status})`);
      return res.json();
    },
    staleTime: 5 * 60_000,
    refetchInterval: false, // expensive multi-chain scan — manual refresh only
  });

  const contracts = data?.contracts ?? [];
  const overnight = contracts.filter((c) => c.bucket === 'overnight').length;
  const weekly = contracts.filter((c) => c.bucket === 'weekly').length;
  const callCount = contracts.filter((c) => c.optionType === 'call').length;
  const putCount = contracts.filter((c) => c.optionType === 'put').length;
  const bestEdge = contracts.length ? Math.max(...contracts.map((c) => c.volEdge)) * 100 : 0;

  return (
    <div className="space-y-3">
      {/* Stats strip */}
      <QECard variant="default" padding="md">
        <QEStatStrip
          stats={[
            { label: 'DISCOUNTS', value: contracts.length, tone: 'cyan' },
            { label: 'CALLS', value: callCount, tone: 'bull' },
            { label: 'PUTS', value: putCount, tone: 'bear' },
            { label: 'OVERNIGHT', value: overnight, tone: 'gold' },
            { label: 'WEEKLY', value: weekly, tone: 'bull' },
            { label: 'BEST EDGE', value: `${bestEdge.toFixed(1)}pt`, tone: 'gold' },
            { label: 'SYMBOLS', value: data?.symbolsWithData ?? 0 },
          ]}
        />
      </QECard>

      {/* Filters */}
      <QECard variant="default" padding="sm">
        <div className="flex items-center gap-3 flex-wrap text-[10px] font-mono">
          <span className="uppercase tracking-widest text-muted-foreground/60">
            <Filter className="w-3 h-3 inline mr-1" /> FILTERS
          </span>
          <FilterNum label="Min Discount" value={discountPct} onChange={setDiscountPct} min={1} max={40} step={1} suffix="%" />
          <FilterNum label="Max DTE" value={maxDte} onChange={setMaxDte} min={1} max={120} step={1} suffix="d" />
          <SideToggle side={side} onChange={setSide} />
          <label className="flex items-center gap-2">
            <span className="text-muted-foreground">Symbols</span>
            <input
              type="text"
              value={symbols}
              placeholder="universe (or AAPL,MU…)"
              onChange={(e) => setSymbols(e.target.value)}
              className="w-40 px-2 py-0.5 bg-card border border-border rounded text-foreground focus:border-[var(--brand-cyan)]/50 outline-none uppercase placeholder:normal-case placeholder:text-muted-foreground/40"
            />
          </label>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="ml-auto inline-flex items-center gap-1.5 px-2 py-1 rounded border border-border hover:border-[var(--brand-cyan)]/50 text-foreground transition-colors"
            title="Re-scan (fetches CBOE chains for the universe)"
          >
            <RefreshCw className={cn('w-3 h-3', isFetching && 'animate-spin text-[var(--brand-cyan)]')} />
            <span className="text-[10px] font-mono uppercase tracking-widest">{isFetching ? 'Scanning…' : 'Re-scan'}</span>
          </button>
        </div>
      </QECard>

      {/* Help text */}
      <div className="text-[10px] font-mono text-muted-foreground/60 leading-relaxed">
        <Tag className="w-3 h-3 inline text-[var(--brand-gold)] mr-1" />
        We fit a smooth smile to <span className="text-muted-foreground/80">each side</span> of every expiry (calls vs the call
        smile, puts vs the put smile) and flag contracts trading a real distance under it — <span className="text-muted-foreground/80">Edge</span> shows
        how far (vol-points · σ). Fair value = Black-Scholes re-priced at the smile. <span className="text-muted-foreground/80">Pick the side that matches your thesis.</span>
        <br />
        <Clock className="w-3 h-3 inline text-muted-foreground/50 mr-1" />
        Both sides are scored the same way, so a put showing up just means that put is cheap vs other puts — not a bearish call.
        CBOE quotes are ~15min delayed: a near-close read, not a live print. Not financial advice.
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

      {!isLoading && !error && contracts.length === 0 && (
        <QECard variant="default" padding="lg" className="text-center text-[10px] font-mono text-muted-foreground space-y-1">
          <div>No discounts found with current filters.</div>
          {data?.notes?.map((n, i) => (
            <div key={i} className="text-muted-foreground/60">{n}</div>
          ))}
        </QECard>
      )}

      {!isLoading && contracts.length > 0 && (
        <QECard variant="default" padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] font-mono border-collapse min-w-max">
              <thead className="sticky top-0 z-10 bg-muted/30 border-b border-border">
                <tr className="text-[9px] uppercase tracking-widest text-muted-foreground/70">
                  <Th>#</Th>
                  <Th>Symbol</Th>
                  <Th>Contract</Th>
                  <Th>Hold</Th>
                  <Th align="right">DTE</Th>
                  <Th align="right">Spot</Th>
                  <Th align="right">Mid</Th>
                  <Th align="right">Fair</Th>
                  <Th align="right">Edge</Th>
                  <Th align="right">IV</Th>
                  <Th align="right">Smile</Th>
                  <Th align="right">Disc %</Th>
                  <Th align="right">Δ</Th>
                  <Th align="right">OI</Th>
                  <Th align="right">Score</Th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c, i) => (
                  <DiscountRow
                    key={`${c.symbol}-${c.optionType}-${c.strike}-${c.expiry}`}
                    c={c}
                    rank={i + 1}
                    onClick={() => setLocation(`/r/${c.symbol}`)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </QECard>
      )}
    </div>
  );
}

function DiscountRow({ c, rank, onClick }: { c: DiscountContract; rank: number; onClick: () => void }) {
  const discPct = c.discountPct * 100;
  const edgePts = c.volEdge * 100; // vol points
  const tier: 'gold' | 'bull' | 'cyan' | 'default' =
    c.score >= 75 ? 'gold' : c.score >= 55 ? 'bull' : c.score >= 35 ? 'cyan' : 'default';

  const edgeTone =
    c.zEdge >= 3 ? 'text-[var(--brand-gold)] font-bold' :
    c.zEdge >= 2 ? 'text-[var(--brand-cyan)] font-bold' :
    'text-foreground';

  const sideTone = c.optionType === 'call' ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]';
  const bucketIcon =
    c.bucket === 'overnight' ? <Moon className="w-3 h-3" /> :
    c.bucket === 'weekly' ? <CalendarDays className="w-3 h-3" /> :
    <TrendingUp className="w-3 h-3" />;

  return (
    <tr onClick={onClick} className="border-b border-border/30 hover:bg-muted/20 cursor-pointer transition-colors" title={c.rationale}>
      <Td className="text-muted-foreground/60 tabular-nums">{rank.toString().padStart(2, '0')}</Td>
      <Td className="font-bold text-foreground">{c.symbol}</Td>
      <Td className={cn('font-bold', sideTone)}>
        ${c.strike} {c.optionType.toUpperCase()} · {c.expiry.slice(5)}
      </Td>
      <Td>
        <span className="inline-flex items-center gap-1 text-muted-foreground/80 capitalize">
          {bucketIcon} {c.bucket}
        </span>
      </Td>
      <Td align="right" className="tabular-nums text-muted-foreground">{c.dte}</Td>
      <Td align="right" className="tabular-nums text-foreground">${c.spot.toFixed(2)}</Td>
      <Td align="right" className="tabular-nums text-foreground">${c.mid.toFixed(2)}</Td>
      <Td align="right" className="tabular-nums text-[var(--trade-bullish)]">${c.fairValue.toFixed(2)}</Td>
      <Td align="right" className={cn('tabular-nums', edgeTone)} title={`${edgePts.toFixed(1)} vol-points / ${c.zEdge.toFixed(1)}σ below the fitted smile`}>
        {edgePts.toFixed(1)}pt<span className="text-muted-foreground/50"> · {c.zEdge.toFixed(1)}σ</span>
      </Td>
      <Td align="right" className="tabular-nums text-muted-foreground">{(c.iv * 100).toFixed(0)}%</Td>
      <Td align="right" className="tabular-nums text-muted-foreground/60">{(c.baselineIv * 100).toFixed(0)}%</Td>
      <Td align="right" className="tabular-nums text-muted-foreground/70">{discPct.toFixed(0)}%</Td>
      <Td align="right" className="tabular-nums text-muted-foreground">{c.delta.toFixed(2)}</Td>
      <Td align="right" className="tabular-nums text-muted-foreground">{c.openInterest.toLocaleString()}</Td>
      <Td align="right">
        <div className="flex items-center justify-end gap-1.5">
          <QEBar value={c.score} max={100} tone={tier === 'default' ? 'cyan' : tier} size="xs" className="w-12" />
          <QEPill variant={tier}>{c.score}</QEPill>
        </div>
      </Td>
    </tr>
  );
}

// ─── Tiny shared bits ────────────────────────────────────────────────

function FilterNum({
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
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
        className="w-16 px-2 py-0.5 bg-card border border-border rounded text-foreground tabular-nums focus:border-[var(--brand-cyan)]/50 outline-none"
      />
      <span className="text-muted-foreground/60">{suffix}</span>
    </label>
  );
}

function SideToggle({ side, onChange }: { side: SideFilter; onChange: (s: SideFilter) => void }) {
  const opts: SideFilter[] = ['both', 'call', 'put'];
  return (
    <div className="flex items-center gap-1">
      <span className="text-muted-foreground">Side</span>
      <div className="flex rounded border border-border overflow-hidden">
        {opts.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={cn(
              'px-2 py-0.5 uppercase tracking-wider transition-colors',
              side === o
                ? 'bg-[var(--brand-cyan)]/20 text-[var(--brand-cyan)]'
                : 'text-muted-foreground/60 hover:text-foreground',
            )}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <th className={cn('px-2 py-1.5 font-medium', align === 'right' ? 'text-right' : 'text-left')}>{children}</th>;
}

function Td({
  children, align = 'left', className, title,
}: {
  children: React.ReactNode; align?: 'left' | 'right'; className?: string; title?: string;
}) {
  return <td title={title} className={cn('px-2 py-1.5 whitespace-nowrap', align === 'right' && 'text-right', className)}>{children}</td>;
}

export default DiscountScanner;
