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
import { useToolSetting } from '@/components/dashboard/frame';
import { useColResize } from '@/lib/use-col-resize';
import type { StrikeExpiryCell } from '@shared/gex-types';
import { exposureText, regimeColor, fmtGexB, fmtVexM, fmtAge, LEVEL_COLORS } from './gex-colors';
import { GexStrikeLadder, GexStrikeMatrix, type GridLevels } from './gex-strike-grid';
import { describeLegacyRegime } from '@shared/gex-regime';
import {
  DTE_BUCKETS, type BucketId, type EHQuote,
  useGexHub, useGexTerminal, useSectorRotation, useExtendedHoursNexus,
  nearTermByStrike, shapeMatrix, regimeView, zeroGammaOf, gridLevelsOf, regimeNarrative,
  nearTermDisagrees as nearTermDisagreesOf, sessionClock as readSessionClock, sessionLabelOf,
} from './gex-model';
import { DealerStructureRail, GammaProfileChart, GexCellDrill } from './gex-parts';
import '@/styles/nexus.css';
import { ToolSkeleton } from '@/components/ui/qe-loading';

const GexRankingsPanel = lazy(() => import('./gex-rankings-panel').then((m) => ({ default: m.GexRankingsPanel })));

interface SearchResult { symbol: string; name?: string; type?: string }

// Payload types, DTE buckets, units and every derivation below live in
// gex-model.ts — shared with the GEX dashboard tools so both compute them
// one way and share one query per symbol.

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
  // Anchor, view and filters are per-placement settings (useToolSetting): they
  // survive the tile pausing off-screen and a reload instead of silently resetting.
  const [anchor, setAnchor] = useToolSetting<string | null>('anchor', null);
  const symbol = (anchor ?? currentStock?.symbol ?? 'SPY').toUpperCase();
  const [rankMode, setRankMode] = useToolSetting<'gex' | 'vex'>('rankMode', 'gex');
  const [rankAll, setRankAll] = useState(false);
  const [drill, setDrill] = useState<StrikeExpiryCell | null>(null);

  const [workspace, setWorkspace] = useToolSetting<'map' | 'surface' | 'rank'>('workspace', 'map');
  const [metric, setMetric] = useToolSetting<'gex' | 'vex'>('metric', 'gex');
  const [bucket, setBucket] = useToolSetting<BucketId>('bucket', '0-7');
  const leftRail = useColResize('nx-gex-left', 320, { sign: 1, min: 240, max: 520 });
  const rightRail = useColResize('nx-gex-right', 320, { sign: -1, min: 240, max: 520 });

  const { data: hub, isLoading: hubLoading, isError: hubError, refetch: refetchHub } = useGexHub();
  const { data: term, isLoading: termLoading, isError: termError, refetch: refetchTerm } = useGexTerminal(symbol);
  const { data: rotation } = useSectorRotation();
  const { data: eh } = useExtendedHoursNexus();

  const plays = hub?.hub?.topPlays ?? [];
  const snap = term?.snapshot;
  const matrix = term?.strikeExpiryMatrix ?? [];
  const spot = snap?.spotPrice ?? 0;
  const sessionClock = useMemo(() => readSessionClock(), [term?.generatedAt]);

  /* Default decision view: aggregate only currently listed 0–7 DTE cells by
     strike. The previous "map" mixed every expiry into snapshot levels, so a
     January node could dominate a September trading screen. Long-dated chain
     data remains available in Chain Matrix; it no longer controls the default. */
  const flat7 = useMemo(() => nearTermByStrike(matrix, spot), [matrix, spot]);

  const quoteBySym = useMemo(() => {
    const m = new Map<string, EHQuote>();
    for (const list of [eh?.mostActive, eh?.gainers, eh?.losers]) {
      for (const t of list ?? []) if (!m.has(t.symbol) && Number.isFinite(t.changePct)) m.set(t.symbol, t);
    }
    return m;
  }, [eh]);
  const spotQ = quoteBySym.get(symbol);

  /* ── matrix shaping — all real cells (gex-model.shapeMatrix) ── */
  const shaped = useMemo(() => shapeMatrix(matrix, bucket, spot, metric), [matrix, bucket, spot, metric]);

  /**
   * ONE regime read for every panel on this page (shared/gex-regime.ts):
   * the server's regimeRead when present, else the same words from the legacy
   * enum. The hero, the map's dealer read, the gravity card and the ranked
   * badges all print THIS — v1 derived the map's read from the 0–7 DTE sum and
   * the hero from the snapshot, so the same page could say both.
   */
  const reg = useMemo(() => regimeView(snap), [snap]);
  const negGamma = reg ? reg.regime === 'negative' : false;
  const zeroGamma = zeroGammaOf(snap);
  /** Structural levels every strike grid marks (all listed expiries). */
  const gridLevels: GridLevels = useMemo(() => gridLevelsOf(snap, spot),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spot, snap?.callWall, snap?.putWall, snap?.maxGammaStrike, zeroGamma]);
  const regimeRead = regimeNarrative(reg, zeroGamma);
  // Does the 0–7 DTE book lean the other way from the whole book? Say so rather than pick one.
  const nearTermDisagrees = nearTermDisagreesOf(reg, flat7);

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

  const sessionLabel = sessionLabelOf(eh);
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
                <div style={{ fontSize: 'var(--fs-9, 10px)', color: 'var(--text-mute)', marginTop: 2, fontFamily: "'JetBrains Mono',monospace" }}>
                  {reg.basis} · all listed expiries
                </div>
              </div>
              <span style={{ marginLeft: 'auto', fontFamily: "'JetBrains Mono',monospace", fontSize: 'var(--fs-10, 10px)', color: 'var(--text-mute)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                {spot ? `$${spot.toFixed(2)}` : '—'}
                <span style={{ display: 'block', fontSize: 'var(--fs-9, 10px)', marginTop: 2 }}>
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
              <button className="focus-action" onClick={() => setLocation('/t?tab=flow')}>Open Flow →</button>
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
            {snap && <DealerStructureRail snap={snap} spot={spot} zeroGamma={zeroGamma} negGamma={negGamma} />}
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
                    style={{ padding: '2px 8px', borderRadius: 3, fontFamily: "'JetBrains Mono',monospace", fontSize: 'var(--fs-9, 10px)', fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer', letterSpacing: 0.5, background: rankMode === m ? 'color-mix(in srgb, var(--amber) 15%, transparent)' : 'transparent', color: rankMode === m ? 'var(--amber)' : 'var(--text-mute)', border: rankMode === m ? '1px solid color-mix(in srgb, var(--amber) 30%, transparent)' : '1px solid var(--nx-border)' }}>
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
                  <button onClick={() => refetchHub()} style={{ color: 'var(--cyan)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--fs-10, 10px)', textDecoration: 'underline', padding: 0 }}>Retry</button>
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
                  <span style={{ fontSize: 'var(--fs-9, 10px)', fontWeight: 500, textTransform: 'none', letterSpacing: 0, opacity: 0.7 }}>{w.hint}</span>
                </button>
              ))}
            </div>
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
            <Suspense fallback={<ToolSkeleton rows={6} label="loading rankings…" />}>
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

          {workspace === 'surface' && (
            <div className="matrix-wrap" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '0 2px 4px' }}>
              {termLoading ? (
                <div style={{ display: 'grid', placeItems: 'center', height: 240, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
                  reading the surface…
                </div>
              ) : termError && !matrix.length ? (
                <div style={{ display: 'grid', placeItems: 'center', height: 240, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--text-mute)', gap: 8, alignContent: 'center' }}>
                  <span>couldn't read the surface</span>
                  <button onClick={() => refetchTerm()} style={{ color: 'var(--cyan)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, textDecoration: 'underline', padding: 0 }}>Retry</button>
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
              <div style={{ fontSize: 'var(--fs-9, 10px)', color: 'var(--text-mute)', fontFamily: "'JetBrains Mono',monospace" }}>{symbol} · {sessionLabel.toLowerCase()}</div>
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
                <div className="context-k" title="Zero-gamma level: spot where net dealer gamma crosses zero when every contract's gamma is re-priced across hypothetical spots (±20%). Not a target — the regime boundary.">Zero-γ</div>
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

          {snap?.gammaProfile && snap.gammaProfile.length > 2 && (
            <div className="context-card" title="Net GEX re-priced at hypothetical spots (every contract's gamma recomputed at each price, IV held). Where the curve crosses zero is the zero-gamma level.">
              <div className="context-head">
                <div className="context-label">Gamma profile · if spot moved</div>
                <div style={{ fontSize: 'var(--fs-9, 10px)', color: 'var(--text-mute)', fontFamily: "'JetBrains Mono',monospace" }}>net GEX $/1% vs price, ±20%</div>
              </div>
              <GammaProfileChart snap={snap} spot={spot} zeroGamma={zeroGamma} />
            </div>
          )}

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
      {drill && <GexCellDrill drill={drill} matrix={matrix} metric={metric} spot={spot} symbol={symbol} onClose={() => setDrill(null)} />}
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
