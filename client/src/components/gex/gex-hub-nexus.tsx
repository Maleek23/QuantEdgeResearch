/**
 * GEX HUB — the fourth reference mock, wired.
 *
 * Layout and classes are the mock's. Every slot reads the real feed:
 *
 *   ranked list       /api/gex-vex/hub topPlays — playScore, ±γ from
 *                     isNegativeGamma, SPY tagged benchmark
 *   spot card         /api/gex-vex/terminal/:sym snapshot + the tape's quote
 *                     for the day change; flip price only when it exists
 *   money flow        /api/sector-rotation laggards → leaders
 *   matrix            strikeExpiryMatrix — real strikes × real expiries; cell
 *                     intensity from a robust max (hot/mega are relative to
 *                     THIS book, not invented bands); GEX/VEX toggle switches
 *                     the measured field; DTE chips carry real counts
 *   3D                the existing GammaSurface — already the honest surface
 *                     (LISTED mode, overflow ticks); VEX view maps the same
 *                     real matrix through netVEX
 *   context rail      snapshot walls + matrix-derived gravity and strongest
 *                     nodes; the model note is verbatim (the mock copied ours)
 *   ⌘K search         /api/search/symbols — the real universal index, selects
 *                     into the shared stock context so every tab follows
 *
 * The mock's genGEX() random matrix, spot jitter and looping countdown do not
 * ship — same rule as every board before it.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useStockContext } from '@/contexts/stock-context';
import { useColResize } from '@/lib/use-col-resize';
import type { StrikeExpiryCell, GEXSnapshot } from '@shared/gex-types';
import { exposureCellBg, exposureText, regimeColor, fmtGexB, fmtVexM, fmtAge, LEVEL_COLORS } from './gex-colors';
import { GexStrikeLadder, GexStrikeMatrix, type GridLevels } from './gex-strike-grid';
import { describeLegacyRegime, type GammaRegime } from '@shared/gex-regime';
import '@/styles/nexus.css';

// Three.js is substantial and only needed after the trader explicitly selects
// 3D. Keeping it out of the default 7D map removes that cost from first paint.
const GammaSurface = lazy(() => import('@/components/prism/gamma-surface').then((m) => ({ default: m.GammaSurface })));
const GexRankingsPanel = lazy(() => import('./gex-rankings-panel').then((m) => ({ default: m.GexRankingsPanel })));

const q = (path: string) => async () => {
  const r = await fetch(path, { credentials: 'include' });
  if (!r.ok) throw new Error(`${path} failed`);
  return r.json();
};

interface TopPlay {
  symbol: string; sector?: string; spotPrice?: number; playScore?: number;
  conviction?: string; regime?: string; bias?: string; callWall?: number; putWall?: number;
  isNegativeGamma?: boolean; insight?: string;
  totalVEX?: number; vexSignal?: string; gammaFlip?: number | null; flipDistancePct?: number | null;
}
interface HubPayload { hub?: { topPlays?: TopPlay[]; totalScanned?: number; totalTickers?: number; attempted?: number; failedSymbols?: string[]; miniScan?: boolean }; generatedAt?: string }
interface TerminalData {
  symbol: string;
  snapshot: GEXSnapshot;
  strikeExpiryMatrix: StrikeExpiryCell[];
  generatedAt?: string;
  cached?: boolean;
  cachedAt?: string;
  optionsSource?: string;
  dataQuality?: { bestSource?: string; isStale?: boolean; marketStatus?: string };
}
interface Sector { etf: string; name: string; change: number }
interface RotationPayload { leaders?: Sector[]; laggards?: Sector[]; sectors?: Sector[]; sessionLabel?: string }
interface EHQuote { symbol: string; lastPrice: number; changePct: number }
interface EHPayload { session?: string; gainers?: EHQuote[]; losers?: EHQuote[]; mostActive?: EHQuote[] }
interface SearchResult { symbol: string; name?: string; type?: string }

const DTE_BUCKETS = [
  { id: 'all', label: 'ALL', test: (d: number) => d >= 0 },
  { id: '0-7', label: '0–7d', test: (d: number) => d >= 0 && d <= 7 },
  { id: '7-30', label: '7–30d', test: (d: number) => d > 7 && d <= 30 },
  { id: '30-90', label: '30–90d', test: (d: number) => d > 30 && d <= 90 },
  { id: '90+', label: '90d+', test: (d: number) => d > 90 },
] as const;
type BucketId = typeof DTE_BUCKETS[number]['id'];

/**
 * UNITS (server units v2 — docs/GEX_VEX_METHODOLOGY.md):
 *   matrix / snapshot GEX  = $B of underlying per 1% move
 *   matrix / snapshot VEX  = $M of underlying per 1 IV point
 * v1 of this file formatted the GEX matrix as $M, so every cell read 1000×
 * too small (SPY's −$1.40B node at 761 printed "−$1.4M"). fmtCell converts
 * each metric from its own unit. Under $1K is dust: an empty cell that still
 * answers on hover, so "visually nothing" never turns into "claimed zero".
 */
const fmtCell = (v: number, metric: 'gex' | 'vex') => (metric === 'vex' ? fmtVexM(v) : fmtGexB(v));

/** The three hub views, named for what they show. */
const WORKSPACES = [
  { id: 'map', label: 'Near-term map', hint: 'this ticker · 0–7 day gamma by strike' },
  { id: 'surface', label: 'Strike × expiry', hint: 'this ticker · every listed expiry' },
  { id: 'rank', label: 'Screener', hint: 'all tickers · setups, −VEX, pins' },
] as const;
const RANKED_DEFAULT = 12; // ranked board is compact-by-default; expand on demand

export function GexHubNexus() {
  const [, setLocation] = useLocation();
  const { currentStock, setCurrentStock } = useStockContext();
  // The hub's OWN anchor. Its search and ranked list re-anchor THIS, never the
  // global stock context — since the workup took over that contract, setting it
  // from here popped the dossier over the hub on every click. The universal
  // search (top right) owns the popup; the hub's controls own the hub.
  const [anchor, setAnchor] = useState<string | null>(null);
  const symbol = (anchor ?? currentStock?.symbol ?? 'SPY').toUpperCase();
  const [rankMode, setRankMode] = useState<'gex' | 'vex'>('gex');
  const [rankAll, setRankAll] = useState(false);
  const [drill, setDrill] = useState<StrikeExpiryCell | null>(null);

  const [workspace, setWorkspace] = useState<'map' | 'surface' | 'rank'>('map');
  const [view3d, setView3d] = useState(false);
  const [metric, setMetric] = useState<'gex' | 'vex'>('gex');
  const [bucket, setBucket] = useState<BucketId>('0-7');
  const leftRail = useColResize('nx-gex-left', 320, { sign: 1, min: 240, max: 520 });
  const rightRail = useColResize('nx-gex-right', 320, { sign: -1, min: 240, max: 520 });

  const { data: hub, isLoading: hubLoading, isError: hubError, refetch: refetchHub } = useQuery<HubPayload>({
    queryKey: ['/api/gex-vex/hub', 'nexus'], queryFn: q('/api/gex-vex/hub'),
    staleTime: 120_000, refetchInterval: 180_000, retry: 1,
  });
  const { data: term, isLoading: termLoading, isError: termError, refetch: refetchTerm } = useQuery<TerminalData>({
    queryKey: ['/api/gex-vex/terminal', symbol, 'nexus'],
    queryFn: q(`/api/gex-vex/terminal/${symbol}?interval=15m&lookback=5`),
    staleTime: 60_000, refetchInterval: 120_000, retry: 1,
  });
  const { data: rotation } = useQuery<RotationPayload>({
    queryKey: ['/api/sector-rotation', 'nexus'], queryFn: q('/api/sector-rotation'),
    staleTime: 120_000, refetchInterval: 180_000, retry: 1,
  });
  const { data: eh } = useQuery<EHPayload>({
    queryKey: ['/api/extended-hours', 'nexus'], queryFn: q('/api/extended-hours'),
    staleTime: 60_000, refetchInterval: 120_000, retry: 1,
  });

  const plays = hub?.hub?.topPlays ?? [];
  const snap = term?.snapshot;
  const matrix = term?.strikeExpiryMatrix ?? [];
  const spot = snap?.spotPrice ?? 0;
  const sessionClock = useMemo(() => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date());
    const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    const at = hour * 60 + minute;
    const open = 9 * 60 + 30; const close = 16 * 60;
    const marketDay = weekday !== 'Sat' && weekday !== 'Sun';
    const minutesLeft = marketDay && at >= open && at < close ? close - at : 0;
    return {
      minutesLeft,
      label: minutesLeft > 0 ? `${Math.floor(minutesLeft / 60)}h ${minutesLeft % 60}m to close` : 'cash session closed',
      // Square-root-of-time is a clock proxy only. It is deliberately not
      // labelled theta because contract IV/strike are not part of this panel.
      timeValuePct: minutesLeft > 0 ? Math.round(Math.sqrt(minutesLeft / 390) * 100) : 0,
    };
  }, [term?.generatedAt]);

  /* Default decision view: aggregate only currently listed 0–7 DTE cells by
     strike. The previous "map" mixed every expiry into snapshot levels, so a
     January node could dominate a September trading screen. Long-dated chain
     data remains available in Chain Matrix; it no longer controls the default. */
  const flat7 = useMemo(() => {
    const byStrike = new Map<number, number>();
    const expiries = new Set<string>();
    for (const cell of matrix) {
      if (!Number.isFinite(cell.strike) || !Number.isFinite(cell.dte) || cell.dte < 0 || cell.dte > 7) continue;
      byStrike.set(cell.strike, (byStrike.get(cell.strike) ?? 0) + (Number.isFinite(cell.netGEX) ? cell.netGEX : 0));
      expiries.add(cell.expiryLabel);
    }
    const all = [...byStrike.entries()].map(([strike, gex]) => ({
      strike,
      gex,
      distancePct: spot > 0 ? ((strike - spot) / spot) * 100 : 0,
    }));
    const nearest = [...all].sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot)).slice(0, 17).sort((a, b) => b.strike - a.strike);
    const positive = all.filter((x) => x.gex > 0).sort((a, b) => b.gex - a.gex)[0] ?? null;
    const negative = all.filter((x) => x.gex < 0).sort((a, b) => a.gex - b.gex)[0] ?? null;
    const dominant = [...all].sort((a, b) => Math.abs(b.gex) - Math.abs(a.gex))[0] ?? null;
    return {
      levels: nearest,
      /** every listed strike in the 0–7 DTE scope — the scrollable ladder */
      all,
      positive,
      negative,
      dominant,
      total: all.reduce((sum, x) => sum + x.gex, 0),
      max: Math.max(1e-9, ...nearest.map((x) => Math.abs(x.gex))),
      expiries: [...expiries],
    };
  }, [matrix, spot]);

  const quoteBySym = useMemo(() => {
    const m = new Map<string, EHQuote>();
    for (const list of [eh?.mostActive, eh?.gainers, eh?.losers]) {
      for (const t of list ?? []) if (!m.has(t.symbol) && Number.isFinite(t.changePct)) m.set(t.symbol, t);
    }
    return m;
  }, [eh]);
  const spotQ = quoteBySym.get(symbol);

  /* ── matrix shaping — all real cells, windowed around spot ── */
  const valOf = (c: StrikeExpiryCell) => (metric === 'vex' ? (c.netVEX ?? 0) : c.netGEX);

  const shaped = useMemo(() => {
    const cells = matrix.filter((c) => Number.isFinite(c.strike) && Number.isFinite(c.dte) && c.dte >= 0);
    const expiryAll = [...new Map(cells.map((c) => [c.dte, c.expiryLabel] as const)).entries()]
      .sort((a, b) => a[0] - b[0]);
    const bucketDef = DTE_BUCKETS.find((b) => b.id === bucket)!;
    const expiries = expiryAll.filter(([d]) => bucketDef.test(d));
    const bucketCounts = Object.fromEntries(
      DTE_BUCKETS.map((b) => [b.id, expiryAll.filter(([d]) => b.test(d)).length]),
    ) as Record<BucketId, number>;

    // Every listed strike is shown — the grid scrolls (gex-strike-grid.tsx);
    // there is no spot window and nothing to "expand".
    const strikeCount = new Set(cells.map((c) => c.strike)).size;

    /* strongest listed nodes above / below spot — the context rail's read */
    let above: StrikeExpiryCell | null = null; let below: StrikeExpiryCell | null = null;
    for (const c of cells) {
      if (c.strike > spot && (!above || Math.abs(valOf(c)) > Math.abs(valOf(above)))) above = c;
      if (c.strike < spot && (!below || Math.abs(valOf(c)) > Math.abs(valOf(below)))) below = c;
    }
    /* gravity: call-side vs put-side share of total |exposure| */
    let pos = 0; let neg = 0;
    for (const c of cells) { const v = valOf(c); if (v >= 0) pos += v; else neg += -v; }
    // One decimal, clamped off the poles: with a single node holding ~99% of
    // exposure, integer rounding printed "0% puts / 100% calls" — but puts
    // EXIST, they are just dwarfed. 0% is a claim of absence; 0.2% is a
    // measurement. (Same lesson as the robust max on the gamma surface.)
    const callPct = pos + neg > 0
      ? Math.min(99.9, Math.max(0.1, (pos / (pos + neg)) * 100))
      : null;

    return { expiries, expiryAll, bucketCounts, strikeCount, above, below, callPct, total: cells.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrix, bucket, spot, metric]);


  /**
   * ONE regime read for every panel on this page (shared/gex-regime.ts):
   * the server's regimeRead when present, else the same words from the legacy
   * enum. The hero, the map's dealer read, the gravity card and the ranked
   * badges all print THIS — v1 derived the map's read from the 0–7 DTE sum and
   * the hero from the snapshot, so the same page could say both.
   */
  const reg = useMemo(() => {
    if (!snap) return null;
    const rr = snap.regimeRead;
    if (rr) {
      return {
        regime: rr.regime as GammaRegime, nearFlip: rr.nearFlip, glyph: rr.glyph,
        title: rr.nearFlip ? `${rr.title} · near the flip` : rr.title,
        posture: rr.posture, basis: rr.basis,
      };
    }
    const d = describeLegacyRegime(snap.regime);
    return { regime: d.regime, nearFlip: d.nearFlip, glyph: d.glyph, title: d.title, posture: d.posture, basis: `net GEX ${fmtGexB(snap.totalGEX)}/1%` };
  }, [snap]);
  const negGamma = reg ? reg.regime === 'negative' : false;
  const zeroGamma = snap ? (snap.zeroGammaLevel ?? snap.gammaFlipPrice ?? null) : null;
  /** Structural levels every strike grid marks (all listed expiries). */
  const gridLevels: GridLevels = useMemo(() => ({
    spot,
    callWall: snap?.callWall ?? null,
    putWall: snap?.putWall ?? null,
    maxGamma: snap?.maxGammaStrike ?? null,
    zeroGamma,
  }), [spot, snap?.callWall, snap?.putWall, snap?.maxGammaStrike, zeroGamma]);

  const EXPECT: Record<GammaRegime, string> = {
    negative: 'Breaks can accelerate. Wait for price to clear a wall, then trade with the confirmed direction instead of fading it.',
    positive: 'Expect two-way trade and pinning toward the dominant node. Fade weak extensions until a wall breaks with confirmation.',
    neutral: 'Treat the walls as decision levels, reduce size, and let price confirm direction before using gamma as confluence.',
  };
  const regimeRead = reg
    ? {
        label: reg.title,
        tone: reg.nearFlip || reg.regime === 'neutral' ? 'amber' : reg.regime === 'negative' ? 'red' : 'blue',
        headline: reg.posture,
        expectation: reg.nearFlip
          ? `Spot is within 1% of the zero-gamma level ($${zeroGamma?.toFixed(2)}): a small move flips dealers between dampening and amplifying. ${EXPECT.neutral}`
          : EXPECT[reg.regime],
      }
    : { label: 'Reading the chain', tone: 'amber', headline: 'No dealer map yet.', expectation: 'Levels appear once the chain is read.' };
  // Does the 0–7 DTE book lean the other way from the whole book? Say so rather than pick one.
  const nearTermDisagrees = !!reg && flat7.levels.length > 0 && reg.regime !== 'neutral' && Math.sign(flat7.total) !== (reg.regime === 'positive' ? 1 : -1);

  /* ── ⌘K search — the real universal index ── */
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: results = [], isFetching: searching } = useQuery<SearchResult[]>({
    queryKey: ['/api/search/symbols', query.trim().toUpperCase()],
    queryFn: async () => {
      const r = await fetch(`/api/search/symbols?q=${encodeURIComponent(query.trim().toUpperCase())}`, { credentials: 'include' });
      if (!r.ok) return [];
      const body = await r.json();
      return Array.isArray(body) ? body : body.results ?? [];
    },
    enabled: searchOpen && query.trim().length > 0,
    staleTime: 60_000, retry: 0,
  });
  const shownResults: SearchResult[] = query.trim()
    ? results
    : plays.slice(0, 10).map((p) => ({ symbol: p.symbol, name: p.sector, type: 'ranked' }));

  useEffect(() => {
    // Capture phase + stopPropagation: while the hub is mounted, ⌘K belongs to
    // ITS search — the legacy global command palette must not also open.
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopPropagation();
        setSearchOpen((o) => !o); setQuery(''); setCursor(0);
      }
      if (e.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, []);
  useEffect(() => { if (searchOpen) setTimeout(() => inputRef.current?.focus(), 40); }, [searchOpen]);

  const pick = (sym: string) => {
    setAnchor(sym.toUpperCase());
    setSearchOpen(false);
  };

  const sessionLabel = eh?.session === 'pre' ? 'Pre-market' : eh?.session === 'post' ? 'After hours' : eh?.session === 'regular' ? 'Live' : 'Last close';
  // The focused terminal snapshot is newer and more complete than the ranked
  // rail. Never let a stale hub row label the same symbol +γ while its live
  // dealer map says −γ.
  const laggards = (rotation?.laggards ?? []).slice(0, 3);
  const leaders = (rotation?.leaders ?? []).slice(0, 3);

  return (
    <div className="gexlab">
      <div
        className={`main${leftRail.dragging || rightRail.dragging ? ' nx-dragging' : ''}`}
        style={{ ['--nx-gexl' as string]: `${leftRail.width}px`, ['--nx-gexr' as string]: `${rightRail.width}px` }}
      >
        <div className={`nx-resize${leftRail.dragging ? ' active' : ''}`} style={{ left: leftRail.width }} title="Drag to resize · double-click to expand" {...leftRail.handleProps} />
        <div className={`nx-resize${rightRail.dragging ? ' active' : ''}`} style={{ right: rightRail.width - 4, marginLeft: 0 }} title="Drag to resize · double-click to expand" {...rightRail.handleProps} />

        {/* ══════════ LEFT — FOCUS + RANKED ══════════ */}
        <div className="col col-left">
          <div className="sec-head">
            <div className="sec-num">Dealer positioning</div>
            <div className="sec-title">GEX Hub</div>
            <div className="sec-sub">Start with the ranked market, then inspect the true strike × expiry exposure surface.</div>
            <div className="sec-meta">
              <span className="tag cyan">{symbol} focus</span>
              <span className="tag amber">{sessionLabel}</span>
              <button className="focus-action" style={{ marginLeft: 'auto' }} onClick={() => { setSearchOpen(true); setQuery(''); setCursor(0); }}>
                ⌘K SEARCH →
              </button>
            </div>
          </div>

          {/* HERO — the single decision-relevant read: the focus symbol's
              gamma regime. Walls, gravity and nodes are supporting detail
              for this posture. */}
          {snap && reg && (
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', marginBottom: 10,
                border: `1px solid color-mix(in srgb, ${regimeColor(reg.regime, reg.nearFlip)} 35%, transparent)`, borderRadius: 8,
                background: `color-mix(in srgb, ${regimeColor(reg.regime, reg.nearFlip)} 7%, transparent)`,
              }}
              title={`Gamma regime — ${reg.basis}. Positive: dealers long gamma, their hedging buys dips / sells rips (stabilising). Negative: dealers short gamma, their hedging chases the move (amplifying). Neutral: net within ±5% of gross. Sign assumes dealers long calls / short puts.`}
            >
              <span style={{
                fontFamily: "'JetBrains Mono',monospace", fontWeight: 800, fontSize: 24, lineHeight: 1,
                color: regimeColor(reg.regime, reg.nearFlip),
              }}>
                {reg.glyph}
              </span>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  {reg.title}
                </div>
                <div style={{ fontSize: 'var(--fs-10, 10px)', color: 'var(--text-dim)', marginTop: 2 }}>
                  {reg.posture}
                </div>
                <div style={{ fontSize: 'var(--fs-9, 9px)', color: 'var(--text-mute)', marginTop: 2, fontFamily: "'JetBrains Mono',monospace" }}>
                  {reg.basis} · all listed expiries
                </div>
              </div>
              <span style={{ marginLeft: 'auto', fontFamily: "'JetBrains Mono',monospace", fontSize: 'var(--fs-10, 10px)', color: 'var(--text-mute)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                {spot ? `$${spot.toFixed(2)}` : '—'}
                <span style={{ display: 'block', fontSize: 'var(--fs-9, 9px)', marginTop: 2 }}>
                  {snap.putWall != null && snap.callWall != null
                    ? (spot > snap.putWall && spot < snap.callWall
                      ? `inside $${Math.round(snap.putWall)}–$${Math.round(snap.callWall)}`
                      : spot >= snap.callWall
                        ? `above $${Math.round(snap.callWall)} call wall`
                        : `below $${Math.round(snap.putWall)} put wall`)
                    : 'walls —'}
                </span>
              </span>
            </div>
          )}

          <div className="focus-card">
            <div className="focus-head">
              <div className="focus-label" title="Sector rotation — where money is moving out of → into this session">Money flow · {rotation?.sessionLabel ?? 'session'}</div>
              <button className="focus-action" onClick={() => setLocation('/t?tab=flow')}>VIEW →</button>
            </div>
            <div className="spot-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div className="spot-ticker">{symbol}</div>
                  <div className="spot-price">{spot ? `$${spot.toFixed(2)}` : '—'}</div>
                  {spotQ ? (
                    <div className="spot-chg" style={{ color: spotQ.changePct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {spotQ.changePct >= 0 ? '+' : ''}{spotQ.changePct.toFixed(2)}%
                    </div>
                  ) : (
                    <div className="spot-chg" style={{ color: 'var(--text-mute)' }}>chg —</div>
                  )}
                </div>
                <div style={{ textAlign: 'right', fontSize: 'var(--fs-10, 10px)', color: 'var(--text-mute)', fontFamily: "'JetBrains Mono',monospace" }}>
                  <div>{symbol === 'SPY' ? 'benchmark' : 'focus'}</div>
                  <div style={{ color: zeroGamma ? 'var(--amber)' : 'var(--text-mute)', marginTop: 2 }} title="Zero-gamma level — the spot where net dealer gamma crosses zero, found by re-pricing every contract's gamma across hypothetical spots (±20%). Crossing it flips dealers between stabilising and amplifying.">
                    {zeroGamma ? `zero-γ $${zeroGamma.toFixed(2)}` : 'no zero-γ within ±20%'}
                  </div>
                </div>
              </div>
            </div>
            {/* Dealer structure rail — the flip/wall geometry, drawn not implied.
                putWall … gammaFlip … callWall on a price axis with the live spot
                marker; below-flip territory is negative-gamma red. */}
            {snap && (snap.putWall || snap.callWall || zeroGamma) && (() => {
              const pts = [snap.putWall, zeroGamma, snap.callWall, spot].filter((v): v is number => Number.isFinite(v as number));
              const lo = Math.min(...pts) * 0.995; const hi = Math.max(...pts) * 1.005;
              const X = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
              const flip = zeroGamma;
              // Which side of zero-γ is negative depends on the book's profile, not a rule:
              // colour the side spot is on by the regime, the other side by its opposite.
              const leftNeg = flip != null && spot < flip ? negGamma : !negGamma;
              return (
                <div style={{ margin: '10px 0 4px', padding: '14px 10px 4px', position: 'relative' }}>
                  <div style={{ position: 'relative', height: 6, borderRadius: 3, background: flip != null ? `linear-gradient(90deg, color-mix(in srgb, ${leftNeg ? 'var(--red)' : 'var(--cyan)'} 32%, transparent) ${X(flip)}, color-mix(in srgb, ${leftNeg ? 'var(--cyan)' : 'var(--red)'} 32%, transparent) ${X(flip)})` : `color-mix(in srgb, ${negGamma ? 'var(--red)' : 'var(--cyan)'} 15%, transparent)` }} title="Bar colour: blue = positive-gamma side (dealers stabilise), vermilion = negative-gamma side (dealers amplify)">
                    {snap.putWall != null && <div title={`Put wall $${snap.putWall}`} style={{ position: 'absolute', left: X(snap.putWall), top: -4, width: 2, height: 14, background: 'var(--red)', boxShadow: '0 0 6px var(--red)' }} />}
                    {flip != null && <div title={`Zero-gamma level $${flip.toFixed(2)}`} style={{ position: 'absolute', left: X(flip), top: -6, width: 2, height: 18, background: 'var(--amber)', boxShadow: '0 0 8px var(--amber)' }} />}
                    {snap.callWall != null && <div title={`Call wall $${snap.callWall}`} style={{ position: 'absolute', left: X(snap.callWall), top: -4, width: 2, height: 14, background: 'var(--cyan)', boxShadow: '0 0 6px var(--cyan)' }} />}
                    {spot != null && <div title={`Spot $${spot.toFixed(2)}`} style={{ position: 'absolute', left: X(spot), top: -3, width: 8, height: 12, borderRadius: 2, background: '#fff', boxShadow: '0 0 8px rgba(255,255,255,0.7)', transform: 'translateX(-4px)' }} />}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontFamily: "'JetBrains Mono',monospace", fontSize: 'var(--fs-9, 9px)', color: 'var(--text-mute)' }}>
                    <span style={{ color: 'var(--red)' }}>P {snap.putWall != null ? `$${Math.round(snap.putWall)}` : '—'}</span>
                    <span style={{ color: 'var(--amber)' }}>zero-γ {flip != null ? `$${flip.toFixed(1)}` : '—'}</span>
                    <span style={{ color: 'var(--cyan-bright)' }}>C {snap.callWall != null ? `$${Math.round(snap.callWall)}` : '—'}</span>
                  </div>
                </div>
              );
            })()}
            <div className="flow-wrap">
              <div className="flow-side">
                <div className="flow-side-label">Out of</div>
                {laggards.map((s) => (
                  <div className="flow-item" key={s.etf}><span className="sym">{s.name}</span><span className="val out">{s.change.toFixed(1)}%</span></div>
                ))}
                {!laggards.length && <div className="flow-item"><span className="sym" style={{ color: 'var(--text-mute)' }}>no read yet</span></div>}
              </div>
              <div className="flow-arrow">→</div>
              <div className="flow-side">
                <div className="flow-side-label">Into</div>
                {leaders.map((s) => (
                  <div className="flow-item" key={s.etf}><span className="sym">{s.name}</span><span className="val in">+{s.change.toFixed(1)}%</span></div>
                ))}
                {!leaders.length && <div className="flow-item"><span className="sym" style={{ color: 'var(--text-mute)' }}>no read yet</span></div>}
              </div>
            </div>
          </div>

          <div className="ranked">
            <div className="ranked-head">
              <div className="ranked-label" title={rankMode === 'gex' ? 'Scanner play score (0–100): VEX magnitude + regime + wall bracket. Badge = gamma regime.' : 'Sorted by |net VEX| — $ dealers trade per 1 IV point'}>Watchlist · {rankMode === 'gex' ? 'by play score' : 'by |VEX|'}</div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {(['gex', 'vex'] as const).map((m) => (
                  <button key={m} onClick={() => setRankMode(m)}
                    title={m === 'gex' ? 'Order by the scanner play score; badge shows the gamma regime' : 'Order by |net VEX| ($ per 1 IV point); badge shows its sign'}
                    style={{ padding: '2px 8px', borderRadius: 3, fontFamily: "'JetBrains Mono',monospace", fontSize: 'var(--fs-9, 9px)', fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer', letterSpacing: 0.5, background: rankMode === m ? 'color-mix(in srgb, var(--amber) 15%, transparent)' : 'transparent', color: rankMode === m ? 'var(--amber)' : 'var(--text-mute)', border: rankMode === m ? '1px solid color-mix(in srgb, var(--amber) 30%, transparent)' : '1px solid var(--nx-border)' }}>
                    {m}
                  </button>
                ))}
                <div
                  className="ranked-count"
                  style={{ marginLeft: 6, color: (hub?.hub?.failedSymbols?.length ?? 0) > 0 ? 'var(--amber)' : undefined }}
                  title={(hub?.hub?.failedSymbols?.length ?? 0) > 0
                    ? `chains failed for: ${hub!.hub!.failedSymbols!.slice(0, 20).join(', ')}${hub!.hub!.failedSymbols!.length > 20 ? '…' : ''}`
                    : 'every attempted name scanned'}
                >
                  {hub?.hub?.miniScan ? 'mini-scan ' : ''}
                  {hub?.hub?.totalTickers ?? hub?.hub?.totalScanned ?? plays.length}
                  {hub?.hub?.attempted != null && hub.hub.attempted !== (hub.hub.totalTickers ?? 0) ? `/${hub.hub.attempted}` : ''} scanned
                  {hub?.hub?.miniScan ? ' · full sweep warming' : ''}
                </div>
              </div>
            </div>
            <div className="ranked-list">
              {(rankMode === 'gex' ? plays : [...plays].sort((a, b) => Math.abs(b.totalVEX ?? 0) - Math.abs(a.totalVEX ?? 0))).slice(0, rankAll ? plays.length : RANKED_DEFAULT).map((p, i) => (
                <div
                  key={p.symbol}
                  className={`ranked-item${p.symbol === 'SPY' ? ' benchmark' : ''}${p.symbol === symbol ? ' active' : ''}`}
                  onClick={() => setAnchor(p.symbol)}
                  title={p.insight ? `${p.symbol} — ${p.insight}` : p.symbol}
                >
                  <div className="ranked-num">{i + 1}</div>
                  <div>
                    <span className="ranked-sym">{p.symbol}</span>
                    {p.symbol === 'SPY' && <span className="ranked-bench">benchmark</span>}
                  </div>
                  {rankMode === 'gex'
                    ? (() => { const d = describeLegacyRegime(p.regime); return <div className="ranked-gamma" style={{ color: regimeColor(d.regime, d.nearFlip) }} title={`${d.title} — ${d.posture}`}>{d.glyph}</div>; })()
                    : <div className={`ranked-gamma ${(p.totalVEX ?? 0) < 0 ? 'neg' : 'vpos'}`} title={(p.totalVEX ?? 0) < 0 ? '−VEX · dealers sell as IV rises (takes liquidity)' : '+VEX · dealers buy as IV rises (provides liquidity)'}>{(p.totalVEX ?? 0) < 0 ? '−' : '+'}{(p.vexSignal ?? 'V').slice(0, 4)}</div>}
                  {rankMode === 'gex'
                    ? <div className="ranked-score" title="play score — composite rank of gamma exposure, wall distance and regime">{p.playScore ?? '—'}</div>
                    : <div className="ranked-score" title="net VEX — $ dealers trade per 1 IV point (+ buy / − sell as IV rises)" style={{ color: p.totalVEX != null ? exposureText('vex', p.totalVEX) : undefined }}>{p.totalVEX != null ? fmtVexM(p.totalVEX) : '—'}</div>}
                </div>
              ))}
              {hubLoading && !plays.length && (
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 'var(--fs-10, 10px)', color: 'var(--text-mute)', padding: '8px 0' }}>
                  hub scan loading…
                </div>
              )}
              {hubError && !plays.length && (
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 'var(--fs-10, 10px)', color: 'var(--text-mute)', padding: '8px 0', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span>ranked scan unavailable</span>
                  <button onClick={() => refetchHub()} style={{ color: 'var(--cyan)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--fs-10, 10px)', textDecoration: 'underline', padding: 0 }}>retry</button>
                </div>
              )}
            </div>
            {plays.length > RANKED_DEFAULT && (
              <div className="expand-row" onClick={() => setRankAll((a) => !a)}>
                <span>{rankAll ? 'show less' : `+ ${plays.length - RANKED_DEFAULT} more ranked`}</span>
              </div>
            )}
          </div>
        </div>

        {/* ══════════ CENTER — PRISM ══════════ */}
        <div className="col prism-area">
          <div className="prism-header">
            <div className="prism-eyebrow">Dealer positioning · {symbol}</div>
            <div className="prism-title-row">
              <div className="prism-title">{workspace === 'map' ? `${symbol} · near-term gamma map` : workspace === 'rank' ? 'Screener · every ticker ranked' : `${symbol} · strike × expiry ${metric.toUpperCase()}`}</div>
              <div className="prism-badge"><span className="dot" />{termLoading ? 'reading chain…' : workspace === 'map' ? `${flat7.expiries.length} near-term expiries` : `${shaped.expiryAll.length} expiries`}</div>
            </div>
            <div className="prism-desc">
              {workspace === 'map'
                ? 'What this shows: net dealer gamma by strike, summed over expiries in the next 7 days · $ per 1% move · + blue stabilises, − vermilion amplifies. The regime headline uses every listed expiry.'
                : workspace === 'rank'
                  ? 'What this shows: one row per ticker (scan universe, movers, options-volume leaders), ranked on dealer liquidity; Setups lists magnet-detector hits with why-lines. Click a row to open its map.'
                  : `What this shows: every listed strike × expiry cell for ${symbol} · ${metric === 'vex' ? 'VEX in $ per 1 IV point (+ dealers buy as IV rises)' : 'GEX in $ per 1% move (+ dealers long gamma)'}.`}
              {term?.cached && <span style={{ color: 'var(--amber)', marginLeft: 8 }}>cached · {term.cachedAt ? new Date(term.cachedAt).toLocaleString() : 'time unavailable'}</span>}
              {!term?.cached && term?.generatedAt && <span style={{ color: 'var(--text-mute)', marginLeft: 8 }}>as of {new Date(term.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
              {term?.optionsSource && <span style={{ color: 'var(--text-mute)', marginLeft: 8 }}>chain · {term.optionsSource.replaceAll('_', ' ')}</span>}
              {snap?.dataQuality?.openInterestDate && <span style={{ color: 'var(--text-mute)', marginLeft: 8 }} title="Alpaca open interest lags 1–2 sessions">OI as of {snap.dataQuality.openInterestDate}</span>}
              {snap?.dataQuality?.chainAgeMs != null && <span style={{ color: 'var(--text-mute)', marginLeft: 8 }}>chain age {fmtAge(snap.dataQuality.chainAgeMs / 1000)}</span>}
            </div>
          </div>

          <div className="prism-controls">
            <div className="view-toggle">
              {WORKSPACES.map((w) => (
                <button key={w.id} className={`view-btn${workspace === w.id ? ' active' : ''}`} style={{ background: workspace === w.id ? undefined : 'transparent', border: 'none', display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15, gap: 1 }} onClick={() => setWorkspace(w.id)} title={`${w.label} — ${w.hint}`}>
                  <span>{w.label.toUpperCase()}</span>
                  <span style={{ fontSize: 'var(--fs-9, 9px)', fontWeight: 500, textTransform: 'none', letterSpacing: 0, opacity: 0.7 }}>{w.hint}</span>
                </button>
              ))}
            </div>
            {workspace === 'surface' && <div className="view-toggle">
              {(['2d', '3d'] as const).map((v) => (
                <button key={v} className={`view-btn${(v === '3d') === view3d ? ' active' : ''}`} style={{ background: (v === '3d') === view3d ? undefined : 'transparent', border: 'none' }} onClick={() => setView3d(v === '3d')} title={v === '3d' ? '3D gamma surface — the honest surface, listed cells only' : '2D strike × expiry grid'}>{v.toUpperCase()}</button>
              ))}
            </div>}
            {workspace === 'surface' && <div className="view-toggle">
              {(['gex', 'vex'] as const).map((m) => (
                  <button key={m} className={`view-btn${metric === m ? ' active' : ''}`} style={{ background: metric === m ? undefined : 'transparent', border: 'none' }} onClick={() => setMetric(m)} title={m === 'gex' ? 'GEX — $ dealers trade per 1% spot move (gamma)' : 'VEX — $ dealers trade per 1 IV point (vanna: ∂delta/∂vol)'}>{m.toUpperCase()}</button>
              ))}
            </div>}
            {workspace === 'surface' && <div className="filter-sep" />}
            {workspace === 'surface' && <div className="filter-group">
              <span className="filter-label" title="Days to expiry — filter the surface by time bucket">DTE</span>
              <div className="filter-chips">
                {DTE_BUCKETS.map((b) => (
                  <button key={b.id} className={`filter-chip${bucket === b.id ? ' active' : ''}`} onClick={() => setBucket(b.id)}>
                    {b.label} <span className="n">·{shaped.bucketCounts[b.id]}</span>
                  </button>
                ))}
              </div>
            </div>}
            {workspace === 'surface' && <div className="expiry-selector">
              <div className="expiry-btn" title="Expiries inside the current DTE bucket, and the furthest listed expiry">
                {shaped.expiries.length} of {shaped.expiryAll.length} expiries
                {shaped.expiryAll.length > 0 && ` · max ${shaped.expiryAll[shaped.expiryAll.length - 1][1]} (${shaped.expiryAll[shaped.expiryAll.length - 1][0]}d)`}
              </div>
            </div>}
          </div>

          {workspace === 'rank' && (
            <Suspense fallback={<div style={{ padding: 32, textAlign: 'center', color: 'var(--text-mute)', fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>loading rankings…</div>}>
              <GexRankingsPanel onPick={(sym) => { setAnchor(sym.toUpperCase()); setWorkspace('map'); }} />
            </Suspense>
          )}

          {workspace === 'map' && (
            <div className="dealer-map-workspace">
              <section className={`dealer-read ${regimeRead.tone}`}>
                <div>
                  <div className="dealer-kicker">{regimeRead.label}</div>
                  <h2>{regimeRead.headline}</h2>
                  <p>{regimeRead.expectation}</p>
                </div>
                <div className="dealer-flow-stat" title="Whole-book net GEX drives the regime; the 0–7 DTE figure is the near-term slice drawn below">
                  <span>Net GEX · all expiries</span>
                  <strong style={{ color: exposureText('gex', snap?.totalGEX ?? 0) }}>{snap ? `${fmtGexB(snap.totalGEX)}/1%` : '—'}</strong>
                  <small style={{ color: nearTermDisagrees ? 'var(--amber)' : undefined }} title="Same unit, different expiry scope. Vendors that chart only today's expiry (e.g. Bullflow's GEX chart) are comparable to the front-expiry figure, not the whole-book headline.">
                    {snap?.gexByScope
                      ? `front expiry${snap.gexByScope.frontExpiryDays != null && snap.gexByScope.frontExpiryDays < 1 ? ' (0DTE)' : ''} ${fmtGexB(snap.gexByScope.frontExpiry)} · ≤7d ${fmtGexB(snap.gexByScope.le7d)}`
                      : `0–7 DTE ${flat7.levels.length ? `${fmtGexB(flat7.total)}/1%` : '—'}`}
                    {nearTermDisagrees ? ' · near-term leans the other way' : ''}
                  </small>
                </div>
              </section>

              {/* The ladder leads the map: every strike, scrollable, walls banded. */}
              <section className="dealer-profile-card">
                <div className="dealer-card-head" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                  <div><span>Gamma by strike · 0–7 DTE</span><strong>Net GEX at every listed strike · $ per 1% move · scroll ↕ · S = spot</strong></div>
                  <small>
                    bar length = |GEX| relative to the largest strike · <i style={{ fontStyle: 'normal', color: 'var(--cyan-bright)' }}>+ blue: dealers long gamma, provide liquidity</i> / <i style={{ fontStyle: 'normal', color: 'var(--red)' }}>− vermilion: dealers short gamma, take liquidity</i> · <i style={{ fontStyle: 'normal', color: LEVEL_COLORS.callWall }}>call wall</i>, <i style={{ fontStyle: 'normal', color: LEVEL_COLORS.putWall }}>put wall</i>, <i style={{ fontStyle: 'normal', color: LEVEL_COLORS.magnet }}>max γ</i> and <i style={{ fontStyle: 'normal', color: LEVEL_COLORS.zeroGamma }}>zero-γ</i> come from all listed expiries · sign assumes dealers long calls / short puts
                  </small>
                </div>
                <GexStrikeLadder
                  levelsByStrike={flat7.all}
                  levels={gridLevels}
                  centerKey={`${symbol}|map`}
                  scopeLabel="0–7 DTE"
                  emptyText={termLoading ? 'Building the dealer map…' : 'No material gamma levels returned.'}
                />
              </section>

              <section className="gex-three-axis" aria-label="Spot, expiry clock, and gamma context">
                <div className="gex-axis-card">
                  <span>01 · spot vs zero-γ</span>
                  <strong>{spot > 0 ? `$${spot.toFixed(2)}` : '—'}</strong>
                  <small>{zeroGamma != null
                    ? `${spot >= zeroGamma ? 'above' : 'below'} zero-γ $${zeroGamma.toFixed(2)} · ${Math.abs((spot / zeroGamma - 1) * 100).toFixed(2)}% away`
                    : 'no zero-γ crossing within ±20%'}</small>
                  <i><b style={{ width: `${snap?.putWall != null && snap?.callWall != null && snap.callWall > snap.putWall ? Math.max(0, Math.min(100, ((spot - snap.putWall) / (snap.callWall - snap.putWall)) * 100)) : 50}%` }} /></i>
                </div>
                <div className="gex-axis-card clock">
                  <span>02 · expiry clock</span>
                  <strong>{sessionClock.label}</strong>
                  <small>{sessionClock.timeValuePct}% square-root time proxy remains · contract theta varies</small>
                  <i><b style={{ width: `${sessionClock.timeValuePct}%` }} /></i>
                </div>
                <div className={`gex-axis-card ${flat7.total < 0 ? 'negative' : 'positive'}`}>
                  <span>03 · 0–7 DTE gamma ($/1%)</span>
                  <strong style={{ color: exposureText('gex', flat7.total) }}>{flat7.levels.length ? fmtGexB(flat7.total) : '—'}</strong>
                  <small>{flat7.dominant ? `dominant node $${flat7.dominant.strike} · ${reg?.title ?? 'regime unknown'}` : 'no near-term node'}</small>
                  <i><b style={{ width: `${flat7.dominant && flat7.max > 0 ? Math.max(4, Math.min(100, Math.abs(flat7.dominant.gex) / flat7.max * 100)) : 0}%` }} /></i>
                </div>
              </section>

              <section className="dealer-levels">
                {[
                  ['NEGATIVE NODE', flat7.negative?.strike, 'largest negative near-term strike'],
                  ['SPOT', spot || null, sessionLabel],
                  ['DOMINANT NODE', flat7.dominant?.strike, 'largest absolute 7-day exposure'],
                  ['POSITIVE NODE', flat7.positive?.strike, 'largest positive near-term strike'],
                ].map(([label, value, note]) => (
                  <div className={`dealer-level ${label === 'SPOT' ? 'spot' : label === 'KING NODE' ? 'king' : ''}`} key={String(label)}>
                    <span>{label}</span>
                    <strong>{typeof value === 'number' && value > 0 ? `$${value.toFixed(2).replace('.00', '')}` : '—'}</strong>
                    <small>{note}</small>
                  </div>
                ))}
              </section>

              <section className="dealer-actions">
                <div>
                  <span>IF PRICE HOLDS INSIDE</span>
                  <strong>{flat7.negative && flat7.positive ? `$${flat7.negative.strike}–$${flat7.positive.strike}` : 'the measured near-term range'}</strong>
                  <p>{negGamma ? 'Negative gamma (dealers short) can amplify breaks. Wait for direction and acceptance beyond a node.' : reg?.regime === 'positive' ? `Positive gamma (dealers long) can dampen extensions and pull price toward $${flat7.dominant?.strike ?? 'the dominant node'}.` : 'Dealer gamma is roughly balanced — nodes are weaker decision levels.'}</p>
                </div>
                <div>
                  <span>IF A WALL BREAKS</span>
                  <strong>{flat7.positive ? `>${flat7.positive.strike} upper break` : 'upper node unavailable'} · {flat7.negative ? `<${flat7.negative.strike} lower break` : 'lower node unavailable'}</strong>
                  <p>Require price acceptance plus volume/flow confirmation. GEX supplies structure; it does not create the entry by itself.</p>
                </div>
              </section>
            </div>
          )}

          {workspace === 'surface' && <>
          {/* 3D legend. The 2D grid carries its own key (scale, levels, dust) in its toolbar. */}
          {view3d && <div
            style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', alignItems: 'center', padding: '8px 2px 2px', fontFamily: "'JetBrains Mono',monospace", fontSize: 'var(--fs-9, 9px)', color: 'var(--text-mute)' }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} title={metric === 'vex' ? '+VEX — dealers buy as IV rises (provides liquidity)' : '+GEX — dealer long gamma, hedging provides liquidity (calls, under the naive sign)'}>
              <span style={{ width: 20, height: 12, borderRadius: 2, background: exposureCellBg(metric, 1, 1) }} />
              {metric === 'vex' ? '+VEX provides liquidity' : '+GEX provides liquidity'}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} title={metric === 'vex' ? '−VEX — dealers sell as IV rises (takes liquidity; crash fuel)' : '−GEX — dealer short gamma, hedging takes liquidity (puts, under the naive sign)'}>
              <span style={{ width: 20, height: 12, borderRadius: 2, background: exposureCellBg(metric, -1, 1) }} />
              {metric === 'vex' ? '⚠ −VEX takes liquidity' : '−GEX takes liquidity'}
            </span>
            <span title="Empty cell — the chain never listed that strike × expiry. Not a zero.">blank = not listed · · = listed dust</span>
            <span title="GEX cells: $ of underlying dealers trade per 1% move. VEX cells: $ per 1 IV point. Dust (below the chosen % of the largest cell) is hidden behind the toggle and still answers on hover.">{metric === 'vex' ? 'cells: $ per 1 IV point' : 'cells: $ per 1% move'}</span>
          </div>}

          {view3d ? (
            <div className="three-wrap">
              {/* GammaSurface is already the honest 3D: LISTED mode for absent
                  cells, overflow ticks past the robust max. VEX maps the same
                  real matrix through netVEX. */}
              <Suspense fallback={<div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--text-mute)', fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>loading 3D surface…</div>}>
                <GammaSurface
                  className="h-full w-full"
                  points={(metric === 'vex' ? matrix.map((c) => ({ ...c, netGEX: c.netVEX ?? 0 })) : matrix) as any}
                  spot={spot}
                  symbol={symbol}
                  callWall={snap?.callWall}
                  putWall={snap?.putWall}
                  flipPrice={snap?.gammaFlipPrice ?? null}
                />
              </Suspense>
            </div>
          ) : (
            <div className="matrix-wrap" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '0 2px 4px' }}>
              {termLoading ? (
                <div style={{ display: 'grid', placeItems: 'center', height: 240, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
                  reading the surface…
                </div>
              ) : termError && !matrix.length ? (
                <div style={{ display: 'grid', placeItems: 'center', height: 240, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--text-mute)', gap: 8, alignContent: 'center' }}>
                  <span>couldn't read the surface</span>
                  <button onClick={() => refetchTerm()} style={{ color: 'var(--cyan)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, textDecoration: 'underline', padding: 0 }}>retry</button>
                </div>
              ) : (
                <GexStrikeMatrix
                  cells={matrix}
                  expiries={shaped.expiries}
                  levels={gridLevels}
                  metric={metric}
                  centerKey={`${symbol}|surface`}
                  onCellClick={setDrill}
                  emptyText={`no listed cells for ${symbol}`}
                />
              )}
            </div>
          )}
          </>}
        </div>

        {/* ══════════ RIGHT — CONTEXT ══════════ */}
        <div className="col col-right">
          <div className="sec-head">
            <div className="sec-num">Context</div>
            <div className="sec-title">What it means.</div>
            <div className="sec-sub">Key levels, gravity and model assumptions for {symbol}.</div>
          </div>

          <div className="context-card">
            <div className="context-head">
              <div className="context-label">Key levels</div>
              <div style={{ fontSize: 'var(--fs-9, 9px)', color: 'var(--text-mute)', fontFamily: "'JetBrains Mono',monospace" }}>{symbol} · {sessionLabel.toLowerCase()}</div>
            </div>
            <div className="context-grid">
              <div className="context-item">
                <div className="context-k" title="Strike ABOVE spot with the largest call gamma $ summed over all expiries (SpotGamma's definition). Typical resistance.">Call wall</div>
                <div className="context-v cyan">{snap?.callWall ? `$${snap.callWall}` : '—'}</div>
                <div className="context-sub">{snap?.callWall && spot ? `+${(((snap.callWall - spot) / spot) * 100).toFixed(1)}% · largest call γ above` : 'largest call γ above spot'}{snap?.callWallOI != null && snap.callWallOI !== snap.callWall ? ` · by OI $${snap.callWallOI}` : ''}</div>
              </div>
              <div className="context-item">
                <div className="context-k" title="Strike BELOW spot with the largest put gamma $ summed over all expiries. Typical support.">Put wall</div>
                <div className="context-v red">{snap?.putWall ? `$${snap.putWall}` : '—'}</div>
                <div className="context-sub">{snap?.putWall && spot ? `${(((snap.putWall - spot) / spot) * 100).toFixed(1)}% · largest put γ below` : 'largest put γ below spot'}{snap?.putWallOI != null && snap.putWallOI !== snap.putWall ? ` · by OI $${snap.putWallOI}` : ''}</div>
              </div>
              <div className="context-item">
                <div className="context-k" title="Zero-gamma level: spot where net dealer gamma crosses zero when every contract's gamma is re-priced across hypothetical spots (±20%). Not a target — the regime boundary.">Zero-gamma</div>
                <div className="context-v amber">{zeroGamma != null ? `$${zeroGamma.toFixed(2)}` : '—'}</div>
                <div className="context-sub">{zeroGamma != null && spot ? `spot ${Math.abs((spot / zeroGamma - 1) * 100).toFixed(1)}% ${spot >= zeroGamma ? 'above' : 'below'}` : 'no crossing within ±20%'}</div>
              </div>
              <div className="context-item">
                <div className="context-k" title="Net VEX: $ of underlying dealers trade per 1 IV point. + = dealers buy as IV rises (provides liquidity); − = dealers sell as IV rises (vol-up selloffs feed on themselves).">Net VEX</div>
                <div className="context-v" style={{ color: exposureText('vex', snap?.totalVEX ?? 0) }}>{snap ? `${(snap.totalVEX ?? 0) < 0 ? '⚠ ' : ''}${fmtVexM(snap.totalVEX)}` : '—'}</div>
                <div className="context-sub">per 1 IV point · {(snap?.totalVEX ?? 0) < 0 ? 'dealers sell as IV rises' : 'dealers buy as IV rises'}</div>
              </div>
              {snap?.callWall != null && snap?.putWall != null && (
                <div className="context-item full">
                  <div className="context-k" title="Put wall → call wall — the range dealers are positioned around. Inside: expect pin and drift. Outside: moves can accelerate.">Structural range</div>
                  <div className="context-v amber">${snap.putWall} put → ${snap.callWall} call</div>
                  <div className="context-sub">
                    {spot > snap.putWall && spot < snap.callWall ? 'inside the range' : spot >= snap.callWall ? 'above the call wall' : 'below put support'}
                  </div>
                </div>
              )}
            </div>
          </div>

          {snap?.gammaProfile && snap.gammaProfile.length > 2 && (() => {
            const pts = snap.gammaProfile;
            const W = 280; const H = 86; const pad = 4;
            const xs = pts.map((p) => p.spot); const ys = pts.map((p) => p.netGEX);
            const x0 = Math.min(...xs); const x1 = Math.max(...xs);
            const yMax = Math.max(1e-12, ...ys.map((v) => Math.abs(v)));
            const X = (v: number) => pad + ((v - x0) / (x1 - x0)) * (W - 2 * pad);
            const Y = (v: number) => H / 2 - (v / yMax) * (H / 2 - pad);
            const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.spot).toFixed(1)},${Y(p.netGEX).toFixed(1)}`).join(' ');
            const area = `${line} L${X(x1).toFixed(1)},${H / 2} L${X(x0).toFixed(1)},${H / 2} Z`;
            return (
              <div className="context-card" title="Net GEX re-priced at hypothetical spots (every contract's gamma recomputed at each price, IV held). Where the curve crosses zero is the zero-gamma level.">
                <div className="context-head">
                  <div className="context-label">Gamma profile · if spot moved</div>
                  <div style={{ fontSize: 'var(--fs-9, 9px)', color: 'var(--text-mute)', fontFamily: "'JetBrains Mono',monospace" }}>net GEX $/1% vs price, ±20%</div>
                </div>
                <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Net GEX across hypothetical spot prices">
                  <defs>
                    <clipPath id="gp-above"><rect x="0" y="0" width={W} height={H / 2} /></clipPath>
                    <clipPath id="gp-below"><rect x="0" y={H / 2} width={W} height={H / 2} /></clipPath>
                  </defs>
                  <path d={area} fill="color-mix(in srgb, var(--cyan) 22%, transparent)" clipPath="url(#gp-above)" />
                  <path d={area} fill="color-mix(in srgb, var(--red) 22%, transparent)" clipPath="url(#gp-below)" />
                  <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="var(--nx-border-hi)" strokeWidth={1} />
                  <path d={line} fill="none" stroke="var(--text-dim)" strokeWidth={1.2} />
                  {zeroGamma != null && zeroGamma >= x0 && zeroGamma <= x1 && <line x1={X(zeroGamma)} x2={X(zeroGamma)} y1={pad} y2={H - pad} stroke="var(--amber)" strokeDasharray="3 2" strokeWidth={1.2} />}
                  {spot > 0 && spot >= x0 && spot <= x1 && <line x1={X(spot)} x2={X(spot)} y1={pad} y2={H - pad} stroke="#fff" strokeWidth={1.4} />}
                </svg>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono',monospace", fontSize: 'var(--fs-9, 9px)', color: 'var(--text-mute)' }}>
                  <span>${x0.toFixed(0)}</span>
                  <span><span style={{ color: '#fff' }}>│</span> spot · <span style={{ color: 'var(--amber)' }}>┆</span> zero-γ{zeroGamma != null ? ` $${zeroGamma.toFixed(2)}` : ' none'}</span>
                  <span>${x1.toFixed(0)}</span>
                </div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 'var(--fs-9, 9px)', color: 'var(--text-mute)', marginTop: 2 }}>
                  <span style={{ color: 'var(--cyan-bright)' }}>blue</span> = dealers long gamma at that price · <span style={{ color: 'var(--red)' }}>vermilion</span> = short gamma
                </div>
              </div>
            );
          })()}

          <div className="gravity-card">
            <div className="context-head">
              <div className="context-label" title="Share of |exposure| in the listed cells that is positive (blue) vs negative (vermilion), for the selected metric.">Gravity · + vs − {metric.toUpperCase()} share</div>
            </div>
            {shaped.callPct == null ? (
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 'var(--fs-10, 10px)', color: 'var(--text-mute)' }}>no listed exposure yet</div>
            ) : (
              <>
                <div
                  className="gravity-bar"
                  style={{ background: `linear-gradient(90deg, var(--red) 0%, var(--red) ${100 - shaped.callPct}%, var(--panel-hi) ${100 - shaped.callPct}%, var(--panel-hi) ${100 - shaped.callPct + 2}%, ${metric === 'vex' ? 'var(--green)' : 'var(--cyan)'} ${100 - shaped.callPct + 2}%, ${metric === 'vex' ? 'var(--green)' : 'var(--cyan)'} 100%)` }}
                >
                  {spot > 0 && snap?.putWall != null && snap?.callWall != null && snap.callWall > snap.putWall && (
                    <div
                      className="gravity-marker"
                      title={`spot $${spot.toFixed(2)} within the wall range`}
                      style={{ left: `${Math.max(2, Math.min(98, ((spot - snap.putWall) / (snap.callWall - snap.putWall)) * 100))}%` }}
                    />
                  )}
                </div>
                <div className="gravity-labels">
                  <div className="puts">↓ {(100 - shaped.callPct).toFixed(1)}% negative</div>
                  <div className="calls">{shaped.callPct.toFixed(1)}% positive ↑</div>
                </div>
                <div className="gravity-pct">
                  <span style={{ color: regimeColor(reg?.regime, reg?.nearFlip) }}>{reg?.title ?? 'Regime —'}</span>
                  {' '}— {reg?.posture ?? 'reading the chain'}
                </div>
                <div className="gravity-note">
                  {negGamma
                    ? <>Dealer hedging can <b>amplify whichever side confirms first</b>. Use the walls as structure, not as a ceiling and floor.</>
                    : reg?.regime === 'positive'
                      ? <>Expect price to <b>drift and pin</b> between levels rather than trend hard. Dealers sell into rallies and buy into dips to stay delta-neutral.</>
                      : <>Dealer gamma is <b>roughly balanced</b>: hedging neither dampens nor amplifies much, so other flows dominate.</>}
                </div>
              </>
            )}
          </div>

          <div className="insight-card">
            <div className="context-head">
              <div className="context-label" title="Largest listed gamma nodes above and below spot. Levels, not entries.">Strongest nodes · {metric.toUpperCase()}</div>
            </div>
            {shaped.above ? (
              <div className="insight-item bull">
                <div className="insight-k">Above spot</div>
                <div className="insight-v">${shaped.above.strike} · {shaped.above.expiryLabel} · {shaped.above.dte}d</div>
                <div className="insight-desc">Largest listed {metric.toUpperCase()} node above. <b>A level, not an entry.</b></div>
              </div>
            ) : (
              <div className="insight-item note"><div className="insight-desc">No listed node above spot.</div></div>
            )}
            {shaped.below ? (
              <div className="insight-item bear">
                <div className="insight-k">Below spot</div>
                <div className="insight-v">${shaped.below.strike} · {shaped.below.expiryLabel} · {shaped.below.dte}d</div>
                <div className="insight-desc">
                  Largest listed node below.{shaped.below.dte <= 1 ? <> <b>0–1DTE — pin risk elevated into the close.</b></> : null}
                </div>
              </div>
            ) : (
              <div className="insight-item note"><div className="insight-desc">No listed node below spot.</div></div>
            )}
            {(shaped.above?.dte ?? 99) <= 5 && (
              <div className="insight-item note">
                <div className="insight-k">Time is your friend</div>
                <div className="insight-v">Same strike, later expiry</div>
                <div className="insight-desc">The strongest node sits only {shaped.above!.dte}d out. Consider the same strike on a later expiry — you pay more premium, but the thesis gets room to play out.</div>
              </div>
            )}
          </div>

          <div className="model-note">
            <b>Model ·</b> GEX = Γ·OI·100·S²·1% ($ per 1% move, all listed expiries); VEX = vanna·OI·100·S per 1 vol point. Dealer sign is an assumption (dealers long calls, short puts) — inventory is never reported, and where customers are opening calls the true sign flips. Zero-gamma is found by re-pricing the whole chain across hypothetical spots. Nodes are levels, not entries. Methodology: docs/GEX_VEX_METHODOLOGY.md.
          </div>

          <div className="disclaimer">
            Educational only · not investment advice.<br />
            Nodes are levels, not entries.
          </div>
        </div>
      </div>

      {/* ══════════ ⌘K SEARCH — real universal index ══════════ */}
      {drill && (() => {
        const strikeCells = matrix.filter((m) => m.strike === drill.strike);
        const expiryCells = matrix.filter((m) => m.dte === drill.dte);
        const val = (c: StrikeExpiryCell) => metric === 'vex' ? (c.netVEX ?? 0) : c.netGEX;
        const strikeTotal = strikeCells.reduce((a, c) => a + val(c), 0);
        const expiryTotal = expiryCells.reduce((a, c) => a + val(c), 0);
        const v = val(drill);
        const dist = spot ? ((drill.strike - spot) / spot) * 100 : null;
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 85, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center' }} onClick={() => setDrill(null)}>
            <div style={{ width: 320, background: 'linear-gradient(135deg, var(--panel-solid), var(--panel-2))', border: '1px solid var(--nx-border-hi)', borderRadius: 10, padding: 16, boxShadow: '0 24px 60px rgba(0,0,0,0.7)' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 16 }}>{symbol} ${drill.strike}</div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 'var(--fs-10, 10px)', color: 'var(--text-dim)' }}>{drill.expiryLabel} · {drill.dte}d</div>
              </div>
              {[
                ['net GEX', `${fmtGexB(drill.netGEX)}/1%`],
                ['net VEX', `${fmtVexM(drill.netVEX ?? 0)}/IV pt`],
                ['vs spot', dist != null ? `${dist >= 0 ? '+' : ''}${dist.toFixed(1)}%` : '—'],
                [`share of $${drill.strike} strike`, strikeTotal !== 0 ? `${((v / strikeTotal) * 100).toFixed(0)}% of ${fmtCell(strikeTotal, metric)}` : '—'],
                [`share of ${drill.expiryLabel} expiry`, expiryTotal !== 0 ? `${((v / expiryTotal) * 100).toFixed(0)}% of ${fmtCell(expiryTotal, metric)}` : '—'],
              ].map(([k, val2]) => (
                <div key={String(k)} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px dashed color-mix(in srgb, var(--cyan) 8%, transparent)', fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>
                  <span style={{ color: 'var(--text-mute)', textTransform: 'uppercase', fontSize: 'var(--fs-9, 9px)', letterSpacing: 0.5 }}>{k}</span>
                  <span style={{ fontWeight: 700, color: k === 'net GEX' ? exposureText('gex', drill.netGEX) : k === 'net VEX' ? exposureText('vex', drill.netVEX ?? 0) : undefined }}>{val2}</span>
                </div>
              ))}
              <div style={{ marginTop: 10, fontSize: 'var(--fs-9, 9px)', color: 'var(--text-mute)', fontFamily: "'JetBrains Mono',monospace", fontStyle: 'italic' }}>listed-chain node · esc or click away to close</div>
            </div>
          </div>
        );
      })()}
      {searchOpen && (
        <div className="search-modal" onClick={(e) => { if (e.target === e.currentTarget) setSearchOpen(false); }}>
          <div className="search-box">
            <div className="search-input-wrap">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
              <input
                ref={inputRef}
                className="search-input"
                placeholder="Search any ticker…"
                value={query}
                onChange={(e) => { setQuery(e.target.value.toUpperCase()); setCursor(0); }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(shownResults.length - 1, c + 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
                  if (e.key === 'Enter') {
                    const sel = shownResults[cursor] ?? (query.trim() ? { symbol: query.trim() } : null);
                    if (sel) pick(sel.symbol);
                  }
                }}
              />
              <span className="search-kbd">ESC</span>
            </div>
            <div className="search-results">
              <div className="search-group">{query.trim() ? (searching ? 'searching…' : `${shownResults.length} matches`) : 'Ranked board'}</div>
              {shownResults.map((r, i) => {
                const qte = quoteBySym.get(r.symbol);
                return (
                  <div key={`${r.symbol}-${i}`} className={`search-item${i === cursor ? ' active' : ''}`} onMouseEnter={() => setCursor(i)} onClick={() => pick(r.symbol)}>
                    <div className="search-sym">{r.symbol}</div>
                    <div className="search-name">{r.name ?? `${r.symbol} · ${r.type ?? 'equity'}`}</div>
                    <div className="search-price">{qte ? `$${qte.lastPrice.toFixed(2)}` : ''}</div>
                    {qte
                      ? <div className={`search-chg ${qte.changePct >= 0 ? 'up' : 'down'}`}>{qte.changePct >= 0 ? '+' : ''}{qte.changePct.toFixed(1)}%</div>
                      : <div />}
                  </div>
                );
              })}
              {query.trim() && !searching && !shownResults.length && (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-mute)', fontSize: 12 }}>
                  No results for “{query}” — Enter opens it directly.
                </div>
              )}
            </div>
            <div className="search-footer">
              <span><kbd>↑↓</kbd> navigate</span>
              <span><kbd>↵</kbd> select</span>
              <span><kbd>esc</kbd> close</span>
              <span style={{ marginLeft: 'auto', color: 'var(--cyan)' }}>universal ticker index</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GexHubNexus;
