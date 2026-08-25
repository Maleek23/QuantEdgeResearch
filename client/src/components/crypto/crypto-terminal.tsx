import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Bitcoin, CircleDollarSign, ExternalLink, Link2, Loader2, Radio, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE } from '@/lib/motion';

export type CryptoPulseAsset = {
  symbol: 'BTC' | 'ETH'; name: string; price: number; change24h: number;
  high24h: number | null; low24h: number | null; rsi14d: number | null;
  realizedVol30d: number | null; change7d: number | null; change30d: number | null;
  closes: Array<{ timestamp: number; close: number }>;
};
type Pulse = { asOf: string; assets: CryptoPulseAsset[] };
type BetaPosition = { symbol: string; beta30d: number; r2: number; divergenceZ: number; actualMovePct: number; predictedMovePct: number };

const BTC_PROXIES = [
  { symbol: 'IBIT', label: 'spot ETF', note: 'direct BTC wrapper' },
  { symbol: 'MSTR', label: 'treasury', note: 'BTC balance-sheet exposure' },
  { symbol: 'COIN', label: 'exchange', note: 'crypto activity + equities' },
  { symbol: 'MARA', label: 'miner', note: 'operating leverage to BTC' },
  { symbol: 'RIOT', label: 'miner', note: 'operating leverage to BTC' },
];
const ETH_PROXIES = [
  { symbol: 'ETHA', label: 'spot ETF', note: 'direct ETH wrapper' },
  { symbol: 'ETHE', label: 'trust', note: 'ETH wrapper; check liquidity' },
  { symbol: 'COIN', label: 'exchange', note: 'ETH activity + equities' },
  { symbol: 'HOOD', label: 'broker', note: 'crypto participation proxy' },
];

function fmtPrice(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: value >= 1000 ? 0 : 2 }).format(value);
}
function pct(value: number | null | undefined) {
  return value == null ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

export function CryptoTerminal({ onSelectSymbol }: { onSelectSymbol: (symbol: string) => void }) {
  const reduce = useReducedMotion();
  const { data: pulse, isLoading, isError, dataUpdatedAt } = useQuery<Pulse>({
    queryKey: ['/api/crypto/pulse'],
    queryFn: async () => {
      const response = await fetch('/api/crypto/pulse', { credentials: 'include' });
      if (!response.ok) throw new Error('crypto pulse unavailable');
      return response.json();
    },
    staleTime: 45_000,
    refetchInterval: 60_000,
    retry: 1,
  });
  const { data: beta } = useQuery<{ positions: BetaPosition[] }>({
    queryKey: ['/api/btc/positions', 'crypto-terminal'],
    queryFn: async () => {
      const response = await fetch('/api/btc/positions', { credentials: 'include' });
      if (!response.ok) throw new Error('proxy history unavailable');
      return response.json();
    },
    staleTime: 5 * 60_000,
    retry: 0,
  });
  const measured = useMemo(() => new Map((beta?.positions ?? []).map((row) => [row.symbol, row])), [beta]);

  if (isLoading) return <div className="flex min-h-[55vh] items-center justify-center font-mono text-xs text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin text-[var(--brand-cyan)]" /> Loading crypto market read…</div>;
  if (isError || !pulse?.assets.length) return <div className="mx-auto max-w-xl px-4 py-16 text-center font-mono"><ShieldAlert className="mx-auto mb-3 h-6 w-6 text-[var(--brand-gold)]" /><p className="text-sm font-bold text-foreground">Crypto market read unavailable</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">No values are being substituted. The terminal will show BTC and ETH once a live quote source responds.</p></div>;

  const btc = pulse.assets.find((asset) => asset.symbol === 'BTC');
  const eth = pulse.assets.find((asset) => asset.symbol === 'ETH');
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 px-3 py-3 md:px-4">
      <section className="relative overflow-hidden rounded-xl border border-border/70 bg-card px-4 py-4 md:px-5">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(ellipse_at_right,rgba(120,198,232,0.13),transparent_68%)]" />
        <div className="relative flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--brand-cyan)]">Crypto intelligence</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">Trade the tape, then choose the proxy.</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">BTC and ETH establish the market context. Equity proxies are a separate trade with their own chart, option chain, liquidity, and risk.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70"><Radio className="h-3.5 w-3.5 text-[var(--brand-cyan)]" /> spot read · {dataUpdatedAt ? 'updated now' : 'loading'}</span>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {btc && <CryptoAssetRead asset={btc} accent="var(--brand-gold)" reduce={reduce} />}
        {eth && <CryptoAssetRead asset={eth} accent="var(--brand-cyan)" reduce={reduce} />}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.28fr_0.72fr]">
        <div className="rounded-xl border border-border/70 bg-card">
          <div className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3.5">
            <div><p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--brand-cyan)]">Proxy board</p><h2 className="mt-1 text-sm font-semibold text-foreground">Equities to investigate after the crypto read</h2></div>
            <span className="font-mono text-[10px] text-muted-foreground/65">open = full ticker workup</span>
          </div>
          <ProxyGroup label="BTC routes" items={BTC_PROXIES} base={btc} measured={measured} onSelect={onSelectSymbol} />
          <ProxyGroup label="ETH routes" items={ETH_PROXIES} base={eth} measured={measured} onSelect={onSelectSymbol} />
        </div>

        <aside className="rounded-xl border border-border/70 bg-card p-4">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--brand-cyan)]">How to use this</p>
          <div className="mt-4 space-y-4">
            <NarrativeStep index="01" title="Read the underlying" detail="BTC/ETH trend, 24h range, RSI, and realized volatility describe crypto—not a stock option trade." />
            <NarrativeStep index="02" title="Select the transmission" detail="A proxy may be direct (ETF), balance-sheet driven, or operating leverage. It can diverge materially." />
            <NarrativeStep index="03" title="Validate the option" detail="Open the ticker workup. Entry, structural targets, premiums, OI, spread, and expiry must be measured there." />
          </div>
          <div className="mt-5 border-t border-border/50 pt-3 font-mono text-[10px] leading-relaxed text-muted-foreground/75"><span className="text-[var(--brand-gold)]">No shortcut:</span> no proxy is graded as a trade solely because BTC or ETH moved.</div>
        </aside>
      </section>
    </div>
  );
}

export function CryptoAssetRead({ asset, accent, reduce }: { asset: CryptoPulseAsset; accent: string; reduce: boolean | null }) {
  const up = asset.change24h >= 0;
  const rsiLabel = asset.rsi14d == null ? 'data pending' : asset.rsi14d >= 70 ? 'extended' : asset.rsi14d <= 30 ? 'washed out' : 'balanced';
  return <article className="overflow-hidden rounded-xl border border-border/70 bg-card">
    <div className="flex items-start justify-between gap-4 px-4 pt-4 md:px-5">
      <div className="flex items-center gap-2.5"><div className="grid h-8 w-8 place-items-center rounded-lg border border-border/60" style={{ color: accent, background: `color-mix(in srgb, ${accent} 10%, transparent)` }}>{asset.symbol === 'BTC' ? <Bitcoin className="h-4 w-4" /> : <CircleDollarSign className="h-4 w-4" />}</div><div><p className="font-mono text-[10px] font-bold tracking-[0.14em] text-muted-foreground">{asset.symbol} · {asset.name}</p><p className="mt-0.5 font-mono text-2xl font-bold tabular-nums text-foreground">${fmtPrice(asset.price)}</p></div></div>
      <div className="text-right"><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">24h</p><p className="mt-0.5 font-mono text-base font-bold tabular-nums" style={{ color: up ? 'var(--trade-bullish)' : 'var(--trade-bearish)' }}>{pct(asset.change24h)}</p></div>
    </div>
    <div className="mt-3 px-4 md:px-5"><CryptoSparkline points={asset.closes} accent={accent} reduce={reduce} /></div>
    <div className="grid grid-cols-2 border-t border-border/55 sm:grid-cols-4">
      <DataCell label="7d" value={pct(asset.change7d)} tone={asset.change7d} />
      <DataCell label="30d" value={pct(asset.change30d)} tone={asset.change30d} />
      <DataCell label="RSI · 14d" value={asset.rsi14d == null ? '—' : `${asset.rsi14d.toFixed(0)} · ${rsiLabel}`} tone={asset.rsi14d != null && asset.rsi14d >= 70 ? -1 : asset.rsi14d != null && asset.rsi14d <= 30 ? 1 : null} />
      <DataCell label="Realized vol · 30d" value={asset.realizedVol30d == null ? '—' : `${asset.realizedVol30d.toFixed(0)}%`} />
    </div>
    <div className="grid grid-cols-2 border-t border-border/55 font-mono text-[10px]">
      <div className="px-4 py-2.5 text-muted-foreground/70">24h low <span className="ml-1 tabular-nums text-foreground">{asset.low24h == null ? '—' : `$${fmtPrice(asset.low24h)}`}</span></div>
      <div className="border-l border-border/55 px-4 py-2.5 text-muted-foreground/70">24h high <span className="ml-1 tabular-nums text-foreground">{asset.high24h == null ? '—' : `$${fmtPrice(asset.high24h)}`}</span></div>
    </div>
  </article>;
}

function ProxyGroup({ label, items, base, measured, onSelect }: { label: string; items: typeof BTC_PROXIES; base?: CryptoPulseAsset; measured: Map<string, BetaPosition>; onSelect: (symbol: string) => void }) {
  return <div className="border-b border-border/55 last:border-b-0"><div className="flex items-center justify-between bg-foreground/[0.025] px-4 py-2.5"><span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>{base && <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70">underlying {pct(base.change24h)}</span>}</div>{items.map((item) => { const relation = measured.get(item.symbol); return <button key={item.symbol} onClick={() => onSelect(item.symbol)} className="group grid w-full grid-cols-[1fr_auto] items-center gap-3 border-t border-border/40 px-4 py-3 text-left transition-colors first:border-t-0 hover:bg-[var(--brand-cyan)]/[0.045]"><span><span className="font-mono text-sm font-bold tracking-wide text-foreground">{item.symbol}</span><span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-[var(--brand-cyan)]/90">{item.label}</span><span className="mt-0.5 block text-xs text-muted-foreground/75">{item.note}</span></span><span className="flex items-center gap-2 text-right"><span className="hidden font-mono text-[10px] text-muted-foreground/65 sm:block">{relation ? `β ${relation.beta30d.toFixed(2)} · r² ${relation.r2.toFixed(2)}` : 'relationship read pending'}</span><ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-[var(--brand-cyan)]" /></span></button>; })}</div>;
}
function NarrativeStep({ index, title, detail }: { index: string; title: string; detail: string }) { return <div className="grid grid-cols-[26px_1fr] gap-3"><span className="pt-0.5 font-mono text-[10px] font-bold text-[var(--brand-cyan)]">{index}</span><div><p className="text-sm font-semibold text-foreground">{title}</p><p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{detail}</p></div></div>; }
function DataCell({ label, value, tone }: { label: string; value: string; tone?: number | null }) { return <div className="border-r border-border/55 px-4 py-3 last:border-r-0"><p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/60">{label}</p><p className="mt-1 font-mono text-xs font-bold tabular-nums" style={{ color: tone == null ? 'var(--foreground)' : tone >= 0 ? 'var(--trade-bullish)' : 'var(--trade-bearish)' }}>{value}</p></div>; }

/** The exact Crypto-terminal trace, enhanced only with pointer inspection. */
export function CryptoSparkline({ points, accent, reduce }: { points: CryptoPulseAsset['closes']; accent: string; reduce: boolean | null }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const values = points.map((point) => point.close);
  const bounds = values.length > 1 ? { min: Math.min(...values), max: Math.max(...values) } : null;
  const coords = bounds && bounds.max !== bounds.min ? values.map((point, index) => ({ x: (index / (values.length - 1)) * 100, y: 44 - ((point - bounds.min) / (bounds.max - bounds.min)) * 36 })) : [];
  const path = coords.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const focusIndex = hovered ?? Math.max(0, points.length - 1);
  const focus = coords[focusIndex];
  const point = points[focusIndex];
  return <div className="relative" onPointerLeave={() => setHovered(null)}>
    <svg viewBox="0 0 100 48" preserveAspectRatio="none" className="h-20 w-full overflow-visible touch-none" aria-label="60 day price trace" onPointerMove={(event) => { const box = event.currentTarget.getBoundingClientRect(); setHovered(Math.max(0, Math.min(points.length - 1, Math.round(((event.clientX - box.left) / box.width) * (points.length - 1))))); }}>
      <defs><linearGradient id={`crypto-fill-${accent.includes('gold') ? 'btc' : 'eth'}`} x1="0" y1="0" x2="0" y2="1"><stop stopColor={accent} stopOpacity=".22"/><stop offset="1" stopColor={accent} stopOpacity="0"/></linearGradient></defs>
      <path d="M0 44H100" stroke="var(--border)" strokeOpacity=".55" strokeWidth=".5"/>
      <motion.path d={path ? `${path} L 100 48 L 0 48 Z` : ''} fill={`url(#crypto-fill-${accent.includes('gold') ? 'btc' : 'eth'})`} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: .8 }} transition={{ duration: .55, ease: EASE }} />
      <motion.path d={path} fill="none" stroke={accent} strokeWidth="1.25" vectorEffect="non-scaling-stroke" initial={reduce ? false : { pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: .9, ease: EASE }} />
      {focus && <><line x1={focus.x} x2={focus.x} y1="5" y2="45" stroke={accent} strokeOpacity={hovered == null ? 0 : .6} strokeWidth=".45" vectorEffect="non-scaling-stroke"/><circle cx={focus.x} cy={focus.y} r="1.5" fill="var(--card)" stroke={accent} strokeWidth=".8" vectorEffect="non-scaling-stroke"/></>}
    </svg>
    {point && hovered != null && <div className="pointer-events-none absolute right-0 top-0 rounded border border-border/60 bg-background/90 px-2 py-1 font-mono text-[9px] tabular-nums text-foreground backdrop-blur">${fmtPrice(point.close)} · {new Date(point.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>}
  </div>;
}
