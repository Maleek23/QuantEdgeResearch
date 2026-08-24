/**
 * MorningBrief — the daily "what's moving and where's the leadership" surface.
 *
 * Assembles a MOMO-style morning read entirely from real endpoints — nothing
 * fabricated, honest empty states when a feed is down:
 *   · /api/macro/context     → VIX regime, breadth, risk appetite, SECTOR ROTATION
 *   · /api/movers/current    → live pre-market / session movers
 *   · /api/morning-briefing  → SPY/QQQ/VIX key levels, catalysts, trading plan
 *
 * The "Sector Leadership" board is the part the user checks every day: sectors
 * ranked by 1-day performance, with 5-day trend + capital flow (inflow/outflow).
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Loader2, AlertTriangle, ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TickerLogo } from '@/components/hunt/cockpit/ticker-logo';

// ─── real response shapes (subset we read) ─────────────────────────────────
interface MacroContext {
  vixRegime: { level: number; regime: string; tradingImplication: string };
  marketBreadth: { percentAbove200MA: number; interpretation: string };
  sectorRotation: Array<{
    sector: string;
    symbol: string;
    performance1d: number;
    performance5d: number;
    relativeStrength: number;
    flow: 'inflow' | 'outflow' | 'neutral';
    recommendation: string;
  }>;
  riskAppetite: 'risk_on' | 'risk_off' | 'mixed';
  tradingRecommendation: string;
}
interface Mover {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  relativeVolume: number;
}
interface MoversResponse { movers: Mover[]; count: number }
// Session-window scan (pre-market / after-hours / overnight)
type MoverWindow = 'current' | 'premarket' | 'afterhours' | 'overnight';
interface WindowGapper { symbol: string; price: number; changePct: number; volume: number; direction: 'up' | 'down'; sector?: string }
interface WindowMoversResponse { ok: boolean; window: string; asOf: string; gappers: WindowGapper[] }
const MOVER_WINDOWS: Array<{ id: MoverWindow; label: string }> = [
  { id: 'current',    label: 'Live' },
  { id: 'premarket',  label: 'PM' },
  { id: 'afterhours', label: 'AH' },
  { id: 'overnight',  label: 'O/N' },
];
interface Briefing {
  marketOutlook?: string;
  keyLevels?: { spy?: number; qqq?: number; vix?: number };
  catalysts?: string[];
  tradingPlan?: string;
  timestamp?: string;
}
interface ConvictionsLite {
  geopolitical?: { risk?: string; activeScenarios?: string[] };
}
interface BatchQuote { symbol: string; price: number; change: number; changePercent: number; volume: number }
interface BatchQuotesResponse { quotes: Record<string, BatchQuote> }

// Named thematic baskets — real quotes, equal-weight average 1-day move.
const BASKETS: Array<{ id: string; label: string; symbols: string[] }> = [
  { id: 'mag7',  label: 'Mag 7',     symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA'] },
  { id: 'chips', label: 'Chips',     symbols: ['NVDA', 'AMD', 'AVGO', 'TSM', 'MU', 'ARM', 'QCOM', 'INTC'] },
  { id: 'ai',    label: 'AI Optics', symbols: ['NVDA', 'AVGO', 'SMCI', 'VRT', 'ANET', 'MRVL', 'CRDO', 'ALAB'] },
];
const BASKET_SYMBOLS = Array.from(new Set(BASKETS.flatMap((b) => b.symbols)));

const BULL = 'var(--trade-bullish)';
const BEAR = 'var(--trade-bearish)';
const CYAN = 'var(--brand-cyan)';

function pctColor(v: number) {
  return v > 0 ? BULL : v < 0 ? BEAR : 'var(--muted-foreground)';
}
function signed(v: number, dp = 2) {
  return `${v >= 0 ? '+' : ''}${v.toFixed(dp)}%`;
}

export function MorningBrief() {
  const [, setLocation] = useLocation();
  const [moverWindow, setMoverWindow] = useState<MoverWindow>('current');

  const macro = useQuery<MacroContext>({
    queryKey: ['/api/macro/context'],
    queryFn: async () => {
      const r = await fetch('/api/macro/context', { credentials: 'include' });
      if (!r.ok) throw new Error('macro failed');
      return r.json();
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });

  const movers = useQuery<MoversResponse>({
    queryKey: ['/api/movers/current'],
    queryFn: async () => {
      const r = await fetch('/api/movers/current', { credentials: 'include' });
      if (!r.ok) throw new Error('movers failed');
      return r.json();
    },
    staleTime: 2 * 60_000,
    refetchInterval: 2 * 60_000,
    retry: 1,
  });

  const brief = useQuery<Briefing>({
    queryKey: ['/api/morning-briefing'],
    queryFn: async () => {
      const r = await fetch('/api/morning-briefing', { credentials: 'include' });
      if (!r.ok) throw new Error('briefing failed');
      return r.json();
    },
    staleTime: 10 * 60_000,
    retry: 1,
  });

  // Off-hours session movers (PM / AH / overnight) — only when that window is picked.
  const windowMovers = useQuery<WindowMoversResponse>({
    queryKey: ['/api/movers', moverWindow],
    queryFn: async () => {
      const r = await fetch(`/api/movers/${moverWindow}?limit=12`, { credentials: 'include' });
      if (!r.ok) throw new Error('window movers failed');
      return r.json();
    },
    enabled: moverWindow !== 'current',
    staleTime: 2 * 60_000,
    refetchInterval: 2 * 60_000,
    retry: 1,
  });

  // Geopolitical read — the convictions feed is the single source for it.
  const geo = useQuery<ConvictionsLite>({
    queryKey: ['/api/convictions', 'geo-lite'],
    queryFn: async () => {
      const r = await fetch('/api/convictions?limit=1&minScore=99', { credentials: 'include' });
      if (!r.ok) throw new Error('convictions failed');
      return r.json();
    },
    staleTime: 10 * 60_000,
    retry: 1,
  });

  // Thematic baskets — real batch quotes, equal-weight 1-day move.
  const baskets = useQuery<BatchQuotesResponse>({
    queryKey: ['/api/quotes/batch', 'baskets', BASKET_SYMBOLS.join(',')],
    queryFn: async () => {
      const r = await fetch(`/api/quotes/batch/${BASKET_SYMBOLS.join(',')}`, { credentials: 'include' });
      if (!r.ok) throw new Error('quotes failed');
      return r.json();
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  const basketRows = useMemo(() => {
    const q = baskets.data?.quotes ?? {};
    return BASKETS.map((b) => {
      const members = b.symbols
        .map((s) => ({ symbol: s, q: q[s] }))
        .filter((m): m is { symbol: string; q: BatchQuote } => !!m.q);
      const avg = members.length
        ? members.reduce((s, m) => s + m.q.changePercent, 0) / members.length
        : null;
      const sorted = [...members].sort((a, b) => b.q.changePercent - a.q.changePercent);
      return { ...b, avg, leader: sorted[0], laggard: sorted[sorted.length - 1], count: members.length };
    });
  }, [baskets.data]);

  const sectors = useMemo(
    () => [...(macro.data?.sectorRotation ?? [])].sort((a, b) => b.performance1d - a.performance1d),
    [macro.data],
  );
  const leaders = sectors.slice(0, 4);
  const laggards = sectors.slice(-4).reverse();
  const maxAbs = useMemo(
    () => Math.max(1, ...sectors.map((s) => Math.abs(s.performance1d))),
    [sectors],
  );

  // Unified mover row shape across "live" and off-hours window scans.
  const topMovers = useMemo<Array<{ symbol: string; name: string; changePercent: number; price: number }>>(() => {
    if (moverWindow === 'current') {
      return [...(movers.data?.movers ?? [])]
        .sort((a, b) => b.changePercent - a.changePercent)
        .slice(0, 8)
        .map((m) => ({ symbol: m.symbol, name: m.name || `${m.relativeVolume?.toFixed(1) ?? '—'}× vol`, changePercent: m.changePercent, price: m.price }));
    }
    return [...(windowMovers.data?.gappers ?? [])]
      .sort((a, b) => b.changePct - a.changePct)
      .slice(0, 8)
      .map((g) => ({ symbol: g.symbol, name: g.sector ?? '', changePercent: g.changePct, price: g.price }));
  }, [moverWindow, movers.data, windowMovers.data]);

  const moversLoading = moverWindow === 'current' ? movers.isLoading : windowMovers.isLoading;
  const moversError = moverWindow === 'current' ? movers.isError : windowMovers.isError;

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const risk = macro.data?.riskAppetite;
  const riskTone = risk === 'risk_on' ? 'bull' : risk === 'risk_off' ? 'bear' : 'neutral';

  if (macro.isLoading && movers.isLoading) {
    return (
      <div className="flex items-center justify-center h-[40vh]">
        <Loader2 className="w-5 h-5 animate-spin text-[var(--brand-cyan)]" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* header */}
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-base font-mono font-bold uppercase tracking-widest text-foreground">Morning Brief</h2>
          <p className="text-[11px] font-mono text-muted-foreground/70">{today} · leadership, movers & the day's plan</p>
        </div>
        {risk && (
          <span
            className="text-[10px] font-mono font-bold uppercase tracking-widest px-2 py-1 rounded border"
            style={{
              color: riskTone === 'bull' ? BULL : riskTone === 'bear' ? BEAR : CYAN,
              borderColor: `color-mix(in srgb, ${riskTone === 'bull' ? BULL : riskTone === 'bear' ? BEAR : CYAN} 40%, transparent)`,
              background: `color-mix(in srgb, ${riskTone === 'bull' ? BULL : riskTone === 'bear' ? BEAR : CYAN} 12%, transparent)`,
            }}
          >
            {risk.replace('_', ' ')}
          </span>
        )}
      </div>

      {/* market pulse stat row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <PulseTile label="SPY" value={brief.data?.keyLevels?.spy ? `$${brief.data.keyLevels.spy.toFixed(2)}` : '—'} />
        <PulseTile label="QQQ" value={brief.data?.keyLevels?.qqq ? `$${brief.data.keyLevels.qqq.toFixed(2)}` : '—'} />
        <PulseTile
          label="VIX"
          value={macro.data?.vixRegime?.level ? macro.data.vixRegime.level.toFixed(2) : brief.data?.keyLevels?.vix?.toFixed(2) ?? '—'}
          sub={macro.data?.vixRegime?.regime?.replace('_', ' ')}
        />
        <PulseTile
          label="Breadth >200MA"
          value={typeof macro.data?.marketBreadth?.percentAbove200MA === 'number' ? `${macro.data.marketBreadth.percentAbove200MA.toFixed(0)}%` : '—'}
          tone={typeof macro.data?.marketBreadth?.percentAbove200MA === 'number' ? (macro.data.marketBreadth.percentAbove200MA >= 50 ? 'bull' : 'bear') : undefined}
        />
        <PulseTile label="Outlook" value={(brief.data?.marketOutlook ?? '—').toUpperCase()} tone={brief.data?.marketOutlook === 'bullish' ? 'bull' : brief.data?.marketOutlook === 'bearish' ? 'bear' : undefined} />
      </div>

      {/* geopolitical read — single source is the convictions feed */}
      {geo.data?.geopolitical?.risk && (
        <GeoLine
          risk={geo.data.geopolitical.risk}
          scenarios={geo.data.geopolitical.activeScenarios ?? []}
        />
      )}

      {/* thematic baskets — real equal-weight 1-day moves */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {basketRows.map((b) => (
          <BasketTile key={b.id} basket={b} onPick={(s) => setLocation(`/r/${s}?tab=chart`)} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-3 items-start">
        {/* ── Sector Leadership ─────────────────────────── */}
        <div className="rounded-lg border border-card-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70">Sector Leadership · 1-Day</span>
            <span className="text-[9px] font-mono uppercase tracking-widest text-[var(--brand-cyan)]">rotation</span>
          </div>
          {macro.isError || sectors.length === 0 ? (
            <Empty msg={macro.isError ? 'Sector rotation feed unavailable.' : 'No sector data right now.'} />
          ) : (
            <div className="grid md:grid-cols-2 gap-x-6 gap-y-1">
              <SectorColumn title="Leading" icon="up" rows={leaders} maxAbs={maxAbs} onPick={(s) => setLocation(`/r/${s}?tab=chart`)} />
              <SectorColumn title="Lagging" icon="down" rows={laggards} maxAbs={maxAbs} onPick={(s) => setLocation(`/r/${s}?tab=chart`)} />
            </div>
          )}
        </div>

        {/* ── Pre-market / Session Movers ───────────────── */}
        <div className="rounded-lg border border-card-border bg-card p-4">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70">Top Movers</span>
            <div className="flex items-center gap-0.5 rounded-md border border-border/40 bg-foreground/[0.03] p-0.5">
              {MOVER_WINDOWS.map((w) => (
                <button
                  key={w.id}
                  onClick={() => setMoverWindow(w.id)}
                  className={cn(
                    'px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase rounded transition-colors cursor-pointer',
                    moverWindow === w.id
                      ? 'bg-[var(--brand-cyan)]/15 text-[var(--brand-cyan)]'
                      : 'text-muted-foreground/70 hover:text-foreground',
                  )}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
          {moversLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-[var(--brand-cyan)]" />
            </div>
          ) : moversError || topMovers.length === 0 ? (
            <Empty msg={moversError ? 'Movers feed unavailable.' : moverWindow === 'current' ? 'No notable movers yet.' : `No ${moverWindow} gappers right now.`} />
          ) : (
            <div className="space-y-1">
              {topMovers.map((m) => (
                <button
                  key={m.symbol}
                  onClick={() => setLocation(`/r/${m.symbol}?tab=chart`)}
                  className="w-full flex items-center gap-2.5 py-1.5 px-1 rounded-md hover:bg-foreground/[0.04] transition-colors cursor-pointer text-left"
                >
                  <TickerLogo symbol={m.symbol} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-mono font-bold text-foreground leading-tight">{m.symbol}</div>
                    {m.name && <div className="text-[9px] font-mono text-muted-foreground/60 truncate">{m.name}</div>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[12px] font-mono font-bold tabular-nums" style={{ color: pctColor(m.changePercent) }}>
                      {signed(m.changePercent, 1)}
                    </div>
                    <div className="text-[9px] font-mono text-muted-foreground/60 tabular-nums">${m.price?.toFixed(2) ?? '—'}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Trading plan + catalysts ──────────────────── */}
      {(macro.data?.tradingRecommendation || brief.data?.tradingPlan || (brief.data?.catalysts?.length ?? 0) > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-lg border border-card-border bg-card p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 mb-2">Day Plan</div>
            <p className="text-[12px] font-mono text-foreground/85 leading-relaxed whitespace-pre-line">
              {macro.data?.tradingRecommendation || stripMd(brief.data?.tradingPlan) || '—'}
            </p>
            {macro.data?.vixRegime?.tradingImplication && (
              <p className="text-[11px] font-mono text-muted-foreground/60 mt-2 border-t border-border/30 pt-2">
                VIX: {macro.data.vixRegime.tradingImplication}
              </p>
            )}
          </div>
          <div className="rounded-lg border border-card-border bg-card p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 mb-2">Catalysts Today</div>
            {(brief.data?.catalysts?.length ?? 0) > 0 ? (
              <ul className="space-y-1.5">
                {brief.data!.catalysts!.slice(0, 6).map((c, i) => (
                  <li key={i} className="text-[11px] font-mono text-foreground/75 flex items-start gap-1.5">
                    <span className="text-[var(--brand-cyan)] mt-px">·</span> {c}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] font-mono text-muted-foreground/60">No major scheduled catalysts.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── pieces ─────────────────────────────────────────────────────────────────

function SectorColumn({
  title,
  icon,
  rows,
  maxAbs,
  onPick,
}: {
  title: string;
  icon: 'up' | 'down';
  rows: MacroContext['sectorRotation'];
  maxAbs: number;
  onPick: (symbol: string) => void;
}) {
  const Icon = icon === 'up' ? TrendingUp : TrendingDown;
  const headColor = icon === 'up' ? BULL : BEAR;
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="w-3 h-3" style={{ color: headColor }} />
        <span className="text-[9px] font-mono uppercase tracking-widest" style={{ color: headColor }}>{title}</span>
      </div>
      <div className="space-y-1.5">
        {rows.map((s) => {
          const w = Math.min(100, (Math.abs(s.performance1d) / maxAbs) * 100);
          const c = pctColor(s.performance1d);
          return (
            <button
              key={s.symbol}
              onClick={() => onPick(s.symbol)}
              className="w-full text-left group cursor-pointer"
              title={s.recommendation}
            >
              <div className="flex items-center gap-2">
                <TickerLogo symbol={s.symbol} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono font-bold text-foreground/90 truncate group-hover:text-foreground">{s.sector}</span>
                    <span className="text-[11px] font-mono font-bold tabular-nums shrink-0" style={{ color: c }}>{signed(s.performance1d, 2)}</span>
                  </div>
                  <div className="h-1 rounded-full bg-foreground/[0.06] overflow-hidden mt-1">
                    <div className="h-full rounded-full" style={{ width: `${w}%`, background: c }} />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between pl-7 mt-0.5">
                <span className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground/60">5d {signed(s.performance5d, 1)}</span>
                <FlowTag flow={s.flow} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FlowTag({ flow }: { flow: 'inflow' | 'outflow' | 'neutral' }) {
  const map = {
    inflow: { color: BULL, Icon: ArrowUpRight, label: 'inflow' },
    outflow: { color: BEAR, Icon: ArrowDownRight, label: 'outflow' },
    neutral: { color: 'var(--muted-foreground)', Icon: ArrowUpRight, label: 'flat' },
  } as const;
  const { color, Icon, label } = map[flow] ?? map.neutral;
  return (
    <span className="inline-flex items-center gap-0.5 text-[8px] font-mono uppercase tracking-wider" style={{ color }}>
      <Icon className="w-2.5 h-2.5" /> {label}
    </span>
  );
}

function GeoLine({ risk, scenarios }: { risk: string; scenarios: string[] }) {
  const elevated = /high|elevated|severe/i.test(risk);
  const color = elevated ? BEAR : /normal|low/i.test(risk) ? 'var(--muted-foreground)' : 'var(--trade-neutral)';
  return (
    <div
      className="flex items-center gap-2 rounded-lg border px-3 py-2"
      style={{ borderColor: `color-mix(in srgb, ${color} 35%, transparent)`, background: `color-mix(in srgb, ${color} 8%, transparent)` }}
    >
      <span className="text-[9px] font-mono uppercase tracking-widest shrink-0" style={{ color }}>Geo Risk</span>
      <span className="text-[11px] font-mono font-bold uppercase tracking-wider shrink-0" style={{ color }}>{risk}</span>
      {scenarios.length > 0 && (
        <span className="text-[10px] font-mono text-muted-foreground/70 truncate">· {scenarios.slice(0, 3).join(' · ')}</span>
      )}
    </div>
  );
}

function BasketTile({
  basket,
  onPick,
}: {
  basket: { id: string; label: string; avg: number | null; leader?: { symbol: string; q: BatchQuote }; laggard?: { symbol: string; q: BatchQuote }; count: number };
  onPick: (symbol: string) => void;
}) {
  const { label, avg, leader, laggard, count } = basket;
  const color = avg == null ? 'var(--muted-foreground)' : pctColor(avg);
  return (
    <div className="rounded-lg border border-card-border bg-card px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70">{label}</span>
        <span className="text-base font-mono font-bold tabular-nums" style={{ color }}>
          {avg == null ? '—' : signed(avg, 2)}
        </span>
      </div>
      <div className="flex items-center justify-between mt-1.5 gap-2">
        {leader ? (
          <button onClick={() => onPick(leader.symbol)} className="flex items-center gap-1.5 min-w-0 cursor-pointer group">
            <TickerLogo symbol={leader.symbol} size="sm" />
            <span className="text-[10px] font-mono text-foreground/80 group-hover:text-foreground truncate">{leader.symbol}</span>
            <span className="text-[10px] font-mono font-bold tabular-nums" style={{ color: pctColor(leader.q.changePercent) }}>
              {signed(leader.q.changePercent, 1)}
            </span>
          </button>
        ) : <span className="text-[10px] font-mono text-muted-foreground/60">no data</span>}
        {laggard && laggard.symbol !== leader?.symbol && (
          <button onClick={() => onPick(laggard.symbol)} className="flex items-center gap-1.5 min-w-0 cursor-pointer group shrink-0">
            <span className="text-[10px] font-mono font-bold tabular-nums" style={{ color: pctColor(laggard.q.changePercent) }}>
              {signed(laggard.q.changePercent, 1)}
            </span>
            <span className="text-[10px] font-mono text-foreground/80 group-hover:text-foreground truncate">{laggard.symbol}</span>
            <TickerLogo symbol={laggard.symbol} size="sm" />
          </button>
        )}
      </div>
      <div className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground/60 mt-1">{count} names · equal-weight</div>
    </div>
  );
}

function PulseTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'bull' | 'bear' }) {
  const color = tone === 'bull' ? BULL : tone === 'bear' ? BEAR : 'var(--foreground)';
  return (
    <div className="rounded-lg border border-card-border bg-card/60 px-3 py-2">
      <div className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground/60">{label}</div>
      <div className="text-base font-mono font-bold tabular-nums leading-tight" style={{ color }}>{value}</div>
      {sub && <div className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground/60 capitalize">{sub}</div>}
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 py-4 text-muted-foreground/60">
      <AlertTriangle className="w-3.5 h-3.5" />
      <span className="text-[11px] font-mono">{msg}</span>
    </div>
  );
}

/** Strip the markdown bold/emoji noise the legacy trading-plan string carries. */
function stripMd(s?: string): string {
  return (s ?? '').replace(/\*\*/g, '').replace(/[📈📉⚖️⚠️🟢🔴🟡]/g, '').trim();
}
