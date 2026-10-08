/**
 * GEX tools — the GEX hub (gex-hub-nexus.tsx) split into dashboard tools.
 *
 * Every tool reads the SAME shared queries as the hub (gex-model.ts:
 * useGexTerminal / useGexHub / useSectorRotation, one key per symbol), so a
 * GEX dashboard with eight tools on screen costs one terminal request per
 * refresh, not eight. Derivations are the hub's (gex-model.ts), the strike
 * ladder/matrix are the c78ddb79 components (full-range scroll, labelled
 * walls/max-γ/zero-γ rows), colours from gex-colors.ts (CVD-safe).
 * Ticker tools follow the dashboard focus symbol; a row click re-points it.
 */
import { Term } from '@/components/onboarding/term';
import { checkPriceAgreement } from '@shared/price-agreement';
import { PriceConflictNote } from '@/components/ui/price-conflict';
import { reasonOf } from '@/lib/optimistic';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SlidersHorizontal } from 'lucide-react';
import { FreshStamp } from '@/components/ui/qe-phone';
import { QEDrawer } from '@/components/ui/qe-drawer';
import { TickerSwitcher } from '@/components/ticker-switcher';
import { GexPhoneMatrix, PHONE_STRIKE_ROWS, type PhoneStrikeRows } from '@/components/gex/gex-phone-matrix';
import type { StrikeExpiryCell } from '@shared/gex-types';
import { describeLegacyRegime } from '@shared/gex-regime';
import { QEEmpty, QEError, QELoading } from '@/components/ui/qe-states';
import { GexStrikeLadder, GexStrikeMatrix, type MatrixScale } from '@/components/gex/gex-strike-grid';
import { GexHubNexus } from '@/components/gex/gex-hub-nexus';
import { GexRankingsPanel } from '@/components/gex/gex-rankings-panel';
import { exposureText, fmtGexB, fmtVexM, LEVEL_COLORS, regimeColor } from '@/components/gex/gex-colors';
import {
  DTE_BUCKETS, type BucketId, readHorizon, writeHorizon, strikeBandOf,
  useGexHub, useGexTerminal, useSectorRotation,
  nearTermByStrike, shapeMatrix, regimeView, zeroGammaOf, gridLevelsOf, regimeNarrative,
  nearTermDisagrees, sessionClock, terminalAsOf, TERMINAL_TIMEOUT_MS,
  hasAdjusted, gexMetricOf, type GammaView,
} from '@/components/gex/gex-model';
import { AnalyzeWithQuantinum } from '@/components/quantinum/analyze-with-quantinum';
import { DealerStructureRail, GammaLevelsCompare, GammaProfileChart, GammaViewSeg, GexCellDrill } from '@/components/gex/gex-parts';
import { useIsMobile } from '@/hooks/use-mobile';
import { useDashboard, useFocusSymbol, useNow, useToolReport, useToolSetting } from '../../frame';
import { oneOf, useUrlParam } from '@/lib/url-state';

/** GEX view state in the URL (g.*) — read by the matrix; a copied link reproduces the view. */
const G_METRIC = oneOf<'gex' | 'vex'>(['gex', 'vex'], 'gex');
const G_BUCKET = oneOf<BucketId>(DTE_BUCKETS.map((b) => b.id), '0-14');
const G_SCALE = oneOf<MatrixScale>(['column', 'absolute'], 'column');
/** Gamma definition: raw | Δ-adjusted | both (docs/GAMMA_RAW_VS_ADJUSTED.md). */
const G_GAMMA = oneOf<GammaView>(['raw', 'adj', 'both'], 'raw');

/**
 * The gamma-definition view a tool actually renders: side by side is desktop
 * only (a phone falls back to raw, keeping its own toggle); Δ-adjusted needs
 * the payload to carry it.
 */
function effectiveView(view: GammaView, narrow: boolean, available: boolean): GammaView {
  if (!available) return 'raw';
  return narrow && view === 'both' ? 'raw' : view;
}

const mono = "'JetBrains Mono',monospace";
const px = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? '—' : `$${v.toFixed(d).replace(/\.00$/, '')}`);

/* ── the focused symbol's dealer map, one shared query ── */
function useGexFocus() {
  const [symbol, setFocus] = useFocusSymbol();
  const q = useGexTerminal(symbol);
  const snap = q.data?.snapshot;
  const matrix = q.data?.strikeExpiryMatrix ?? [];
  const spot = snap?.spotPrice ?? 0;
  const waited = useLoadingFor(q.isLoading);
  useToolReport({
    asOf: q.isError && !q.data ? null : terminalAsOf(q.data),
    source: q.data?.optionsSource ? `GEX engine · ${q.data.optionsSource.replaceAll('_', ' ')}` : undefined,
    note: q.isError ? 'refresh failed' : q.data?.cached ? 'cached' : snap?.dataQuality?.openInterestDate ? `OI ${snap.dataQuality.openInterestDate}` : undefined,
    tone: q.isError || q.data?.cached ? 'warn' : 'ok',
  });
  const matrixNote = q.data?.strikeExpiryMatrixNote ?? null;
  return { symbol, setFocus, q, snap, matrix, matrixNote, spot, waited };
}

/** Elapsed seconds while a query is in its first load — so a slow chain says so. */
function useLoadingFor(loading: boolean) {
  const [since] = useState(() => Date.now());
  const now = useNow(5_000);
  return loading ? Math.round((now - since) / 1000) : 0;
}

/** loading / error / empty gate shared by every ticker tool */
function gate(g: ReturnType<typeof useGexFocus>, what = 'dealer map'): ReactNode | null {
  if (g.q.isLoading) {
    return <QELoading rows={4} className="fd-pad" label={g.waited >= 15 ? `reading ${g.symbol} chain… ${g.waited}s — the options-data queue is busy; this gives up at ${TERMINAL_TIMEOUT_MS / 1000}s and offers a retry` : `reading ${g.symbol} chain…`} />;
  }
  if (g.q.isError && !g.q.data) return <QEError className="fd-m" title={`${g.symbol} ${what} didn't load`} message={reasonOf(g.q.error)} onRetry={() => g.q.refetch()} retrying={g.q.isFetching} />;
  if (!g.snap) return <QEEmpty className="fd-m" message={`No dealer positioning returned for ${g.symbol}.`} />;
  return null;
}

/* ════════════ Dealer map — near-term ladder ════════════ */
export function GexDealerMapTool() {
  const g = useGexFocus();
  const narrow = useIsMobile();
  const [gview, setGview] = useToolSetting<GammaView>('gammaView', 'raw');
  const adjOk = hasAdjusted(g.matrix);
  const view = effectiveView(gview, narrow, adjOk);
  const near = useMemo(() => nearTermByStrike(g.matrix, g.spot), [g.matrix, g.spot]);
  const nearAdj = useMemo(() => (adjOk ? nearTermByStrike(g.matrix, g.spot, 7, 'gexAdj') : null), [g.matrix, g.spot, adjOk]);
  const blocked = gate(g);
  if (blocked) return blocked;
  const primary = view === 'adj' && nearAdj ? nearAdj : near;
  return (
    <div className="gx-tool gx-col">
      <div className="gx-controls">
        <GammaViewSeg view={view} onChange={setGview} allowBoth={!narrow} available={adjOk} />
        <span className="gx-legend" title="Walls, max-γ and zero-γ rows come from ALL listed expiries; bars are the ≤7-day slice.">
          ≤7d · {near.expiries.length} expiries · Σ {view === 'both' ? 'raw ' : view === 'adj' ? 'Δ-adj ' : ''}<b style={{ color: exposureText('gex', primary.total) }}>{fmtGexB(primary.total)}/1%</b>
          {view === 'both' && nearAdj ? <> · Δ-adj <b className="gx-adj-tag" style={{ color: exposureText('gex', nearAdj.total) }}>{fmtGexB(nearAdj.total)}/1%</b></> : null} · levels from all expiries
        </span>
      </div>
      {view !== 'raw' && <GammaLevelsCompare snap={g.snap} view={view} />}
      <div className="gx-grow">
        <GexStrikeLadder
          levelsByStrike={primary.all}
          compareByStrike={view === 'both' && nearAdj ? nearAdj.all : undefined}
          valueLabel={view === 'adj' ? 'Δ-adj GEX' : 'GEX'}
          levels={gridLevelsOf(g.snap, g.spot, view)}
          centerKey={`${g.symbol}|tool-map|${view}`}
          scopeLabel="0–7 DTE"
          height="100%"
          emptyText="No listed strikes in the next 7 days."
        />
      </div>
    </div>
  );
}

/* ════════════ Phone lead — levels + regime in one glance ════════════ */
/**
 * GEX on a phone (< 768px) leads with this strip, above the stacked tools:
 * spot, the regime in words and the four structural levels with their
 * distance from spot. Same shared terminal query as every GEX tool; age is
 * stamped (live, not carried). Not a registry tool — it is the phone
 * layout's header, so it cannot be removed or moved off the top.
 */
export function GexPhoneSummary() {
  const g = useGexFocus();
  const now = useNow(15_000);
  const blocked = gate(g);
  if (blocked) return <section className="gx-phone-sum" aria-label="GEX summary">{blocked}</section>;
  const snap = g.snap!; const spot = g.spot;
  const reg = regimeView(snap);
  const zg = zeroGammaOf(snap);
  const read = regimeNarrative(reg, zg);
  const color = regimeColor(reg?.regime, reg?.nearFlip);
  const asOf = terminalAsOf(g.q.data);
  const dist = (v: number | null | undefined) => (v != null && spot ? `${v >= spot ? '+' : ''}${(((v - spot) / spot) * 100).toFixed(1)}%` : '');
  const lv: Array<[string, number | null | undefined, string, number]> = [
    ['Call', snap.callWall, LEVEL_COLORS.callWall, 0],
    ['Put', snap.putWall, LEVEL_COLORS.putWall, 0],
    ['King node', snap.maxGammaStrike, LEVEL_COLORS.magnet, 0],
    ['Zero-γ', zg, LEVEL_COLORS.zeroGamma, 2],
  ];
  return (
    <section className="gx-phone-sum" aria-label={`${g.symbol} GEX summary`}>
      <div className="gx-ps-top">
        <span className="gx-spot-sym">{g.symbol}</span>
        <b className="gx-ps-spot">{px(spot)}</b><small className="gx-ps-spotlbl">chain snapshot</small>
        <FreshStamp className="gx-ps-age" asOf={asOf} now={now} warn={!!g.q.data?.cached} label="age —" />
      </div>
      <div className="gx-ps-regime" style={{ borderColor: `color-mix(in srgb, ${color} 40%, transparent)`, background: `color-mix(in srgb, ${color} 8%, transparent)` }}>
        <span className="gx-glyph" style={{ color }}>{reg?.glyph}</span>
        <div>
          <div className="gx-ps-title">{reg?.title ?? 'Regime —'}</div>
          <div className="gx-ps-read">{read.headline}</div>
        </div>
      </div>
      <div className="gx-ps-levels">
        {lv.map(([k, v, c, d]) => (
          <div key={k} className="gx-ps-lv" title={k === 'Call' || k === 'Put' ? `${k} wall — all listed expiries` : `${k} — all listed expiries`}>
            <span><i style={{ background: c }} />{k}</span>
            <b style={{ color: c }}>{px(v ?? null, d)}</b>
            <small>{dist(v) || '—'}</small>
          </div>
        ))}
      </div>
      <div className="gx-ps-net">
        <span>Net GEX <b style={{ color: exposureText('gex', snap.totalGEX) }}>{fmtGexB(snap.totalGEX)}/1%</b></span>
        <span>Net VEX <b style={{ color: exposureText('vex', snap.totalVEX ?? 0) }}>{fmtVexM(snap.totalVEX)}</b></span>
      </div>
    </section>
  );
}

/* ════════════ PHONE: the matrix IS the GEX page ════════════
   Operator 2026-09-30 (ITMatrix phone reference): ONE compact header —
   ticker ▾ · big price · change $ and % · one snapshot stamp — then the grid,
   full-bleed to the dock. Levels / regime / net live one tap away (the
   "Levels" sheet); the rest of the workspace stacks below the grid. */
interface PhoneQuote { price: number; change: number; changePercent: number; asOf: string | null }
/** The live quote for the focused symbol (phone header + Key Levels). Same key as the ticker page. */
function usePhoneQuote(symbol: string) {
  // same key + shape as the ticker page (ticker-data.ts useQuotes) → one shared cache entry
  return useQuery<Record<string, PhoneQuote>>({
    queryKey: ['/api/quotes/batch', symbol],
    queryFn: async () => {
      const r = await fetch(`/api/quotes/batch/${symbol}`, { credentials: 'include' });
      if (!r.ok) throw new Error('quote failed');
      const body = await r.json();
      const out: Record<string, PhoneQuote> = {};
      for (const [k, q] of Object.entries<any>(body?.quotes ?? {})) if (Number.isFinite(q?.price) && q.price > 0) out[k] = { price: q.price, change: q.change, changePercent: q.changePercent, asOf: q.asOf ?? null };
      return out;
    },
    staleTime: 15_000, refetchInterval: 30_000, retry: 1,
  });
}
const FALLBACK_CHIPS = ['SPY', 'QQQ', 'NVDA', 'TSLA'];
function useQuickChips(symbol: string) {
  const wl = useQuery<any>({
    queryKey: ['/api/watchlist'],
    queryFn: async () => { try { const r = await fetch('/api/watchlist', { credentials: 'include' }); return r.ok ? r.json() : []; } catch { return []; } },
    staleTime: 60_000,
  });
  return useMemo(() => {
    const list = Array.isArray(wl.data) ? wl.data : (wl.data?.items || wl.data?.symbols || []);
    const syms: string[] = list.map((w: any) => String(typeof w === 'string' ? w : (w?.symbol || w?.ticker || '')).toUpperCase()).filter(Boolean);
    const out = [symbol, ...(syms.length ? syms : FALLBACK_CHIPS)];
    return [...new Set(out)].slice(0, 6);
  }, [wl.data, symbol]);
}

export function GexPhoneMatrixView() {
  const g = useGexFocus();
  const now = useNow(15_000);
  const quote = usePhoneQuote(g.symbol).data?.[g.symbol];
  const chips = useQuickChips(g.symbol);
  const [metric, setMetric] = useState<'gex' | 'vex'>('gex');
  // Phone: Raw | Δ-adj only — no side by side on a narrow screen.
  const [gview, setGview] = useState<GammaView>('raw');
  const adjOk = hasAdjusted(g.matrix);
  const view = effectiveView(gview, true, adjOk);
  const cellMetric = gexMetricOf(metric, view, adjOk);
  const [drill, setDrill] = useState<StrikeExpiryCell | null>(null);
  const [levels, setLevels] = useState(false);
  const [rows, setRows] = useState<PhoneStrikeRows>(13);
  const [bucket, setBucket] = useHorizon(true);
  const shaped = useMemo(() => shapeMatrix(g.matrix, bucket, g.spot, cellMetric), [g.matrix, bucket, g.spot, cellMetric]);
  const blocked = gate(g);
  const asOf = g.q.data ? terminalAsOf(g.q.data) : null;
  const snapAt = asOf ? new Date(asOf).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;
  const snapTime = asOf ? new Date(asOf).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }) : null;
  const price = quote?.price ?? (g.spot || null);
  const up = (quote?.change ?? 0) >= 0;
  return (
    <section className="gxp-page" aria-label={`${g.symbol} GEX matrix`}>
      {/* ONE row (operator 2026-10-01, "fit the phone"): ticker · price + chain age · GEX|VEX ·
          horizon · settings. Raw/Δ-adj, the strike count and the levels live in the settings sheet.
          Two prices, two meanings (audit 2026-10-01, GEX #2): the live quote big, the chain-snapshot
          spot the grid was computed at labelled underneath with its age. */}
      <header className="gxp-head">
        <div className="gxp-head-row">
          <TickerSwitcher value={g.symbol} onChange={g.setFocus} className="gxp-ticker" />
          <div className="gxp-quote" title={`${quote ? 'Live quote' : 'No live quote — chain spot'} ${price != null ? price.toFixed(2) : '—'}. Grid: the GEX engine's chain snapshot${snapAt ? ` (${snapAt} ET)` : ''}, computed at spot ${g.spot ? g.spot.toFixed(2) : '—'}; the stamp is its age.`}
            aria-label={`${quote ? 'live' : 'chain spot'} ${price != null ? price.toFixed(2) : 'unknown'}${quote && Number.isFinite(quote.changePercent) ? `, ${quote.changePercent.toFixed(2)} percent` : ''}; grid from the chain snapshot at ${g.spot ? g.spot.toFixed(2) : 'unknown'}`}>
            <b className="gxp-px">{price != null ? price.toFixed(2) : '—'}</b>
            <div className="gxp-snap">
              {quote && Number.isFinite(quote.changePercent)
                ? <span className="gxp-chg" style={{ color: up ? 'var(--green)' : 'var(--red)' }}>{up ? '+' : '−'}{Math.abs(quote.changePercent).toFixed(2)}%</span>
                : <span>chain</span>}
              <FreshStamp asOf={asOf} now={now} warn={!!g.q.data?.cached} label="—" />
            </div>
          </div>
          <div className="of-seg gxp-metric" role="group" aria-label="Metric">
            {(['gex', 'vex'] as const).map((m) => <button key={m} type="button" className={metric === m ? 'on' : ''} aria-pressed={metric === m} onClick={() => setMetric(m)}>{m.toUpperCase()}</button>)}
          </div>
          {/* horizon: 0–7d by default on a phone, remembered on this device */}
          <select className="gxp-horizon" value={bucket} onChange={(e) => setBucket(e.target.value as BucketId)} aria-label="Days to expiry" title="Expiry horizon (remembered on this device)">
            {DTE_BUCKETS.map((b) => <option key={b.id} value={b.id} aria-label={`${b.label}, ${shaped.bucketCounts[b.id]} expiries`}>{b.label}</option>)}
          </select>
          <button type="button" className="gxp-levels-btn" onClick={() => setLevels(true)} aria-haspopup="dialog" aria-label="Levels, regime, gamma definition and strike count" title={`Levels · regime · Raw/Δ-adj · strikes${snapTime ? ` · chain @ ${snapTime} ET` : ''}`}>
            <SlidersHorizontal size={18} aria-hidden />
            {view !== 'raw' || rows !== 13 ? <i className="gxp-dot-on" aria-hidden /> : null}
          </button>
        </div>
      </header>
      {blocked ?? (
        <GexPhoneMatrix cells={g.matrix} expiries={shaped.expiries} spot={g.spot} metric={cellMetric} symbol={g.symbol}
          onCellClick={setDrill} chips={chips} onSymbol={g.setFocus} strikeRows={rows} />
      )}
      {drill && <GexCellDrill drill={drill} matrix={g.matrix} metric={cellMetric} spot={g.spot} symbol={g.symbol} onClose={() => setDrill(null)} />}
      <QEDrawer open={levels} onClose={() => setLevels(false)} title={`${g.symbol} levels · regime · settings`} side="bottom" className="qp-sheet gxp-levels-sheet">
        <div className="flowdash nexus-vars gxp-levels-body">
          <div className="gxp-sheet-ctl">
            {metric === 'gex' && <div className="gxp-sheet-row"><span>Gamma</span><GammaViewSeg view={view} onChange={setGview} allowBoth={false} available={adjOk} className="of-seg gxp-gview" /></div>}
            <div className="gxp-sheet-row"><span>Strikes</span>
              <div className="of-seg gxp-gview" role="group" aria-label="Strikes shown around spot">
                {PHONE_STRIKE_ROWS.map((n) => <button key={n} type="button" className={rows === n ? 'on' : ''} aria-pressed={rows === n} onClick={() => setRows(n)}>{n === 'all' ? 'All' : n}</button>)}
              </div>
            </div>
          </div>
          <GexPhoneSummary />
        </div>
      </QEDrawer>
    </section>
  );
}

/* ════════════ Strike × expiry matrix ════════════ */
/**
 * Expiry horizon, remembered PER DEVICE CLASS (gex-model readHorizon): 0–7d on
 * a phone, 0–14d on a tablet/desktop until the viewer picks another. A shared
 * link's g.exp still wins on load.
 */
function useHorizon(phone: boolean): [BucketId, (b: BucketId) => void] {
  const [bucket, setBucketState] = useState<BucketId>(() => readHorizon(phone));
  useEffect(() => { setBucketState(readHorizon(phone)); }, [phone]);
  const setBucket = useCallback((b: BucketId) => { setBucketState(b); writeHorizon(phone, b); }, [phone]);
  return [bucket, setBucket];
}

/** The horizon chips (count of listed expiries in each). */
function HorizonSeg({ bucket, onChange, counts }: { bucket: BucketId; onChange: (b: BucketId) => void; counts: Record<BucketId, number> }) {
  // chips on a wide tile; a container query swaps in the compact select on a narrow one (nexus.css)
  return (
    <>
      <select className="gx-horizon-sel" value={bucket} onChange={(e) => onChange(e.target.value as BucketId)} aria-label="Days to expiry" title="Expiry horizon (remembered on this device)">
        {DTE_BUCKETS.map((b) => <option key={b.id} value={b.id}>{b.label} · {counts[b.id]}</option>)}
      </select>
      <div className="of-seg gx-horizon" role="group" aria-label="Days to expiry">
        {DTE_BUCKETS.map((b) => (
          <button key={b.id} type="button" className={bucket === b.id ? 'on' : ''} aria-pressed={bucket === b.id} onClick={() => onChange(b.id)}
            title={`${b.label === 'ALL' ? 'Every listed expiry' : `Expiries ${b.label} out`} — ${counts[b.id]} listed`}>
            {b.label}<span className="dim"> {counts[b.id]}</span>
          </button>
        ))}
      </div>
    </>
  );
}

export function GexMatrixTool() {
  const g = useGexFocus();
  const narrow = useIsMobile();
  const [metric, setMetric] = useToolSetting<'gex' | 'vex'>('metric', 'gex');
  const [bucket, setBucket] = useHorizon(narrow);
  const [scale, setScale] = useToolSetting<MatrixScale>('scale', 'column');
  const [gview, setGview] = useToolSetting<GammaView>('gammaView', 'raw');
  const dash = useDashboard();
  const urlOn = dash.page === 'gex';
  useUrlParam('g.metric', metric, setMetric, G_METRIC, urlOn);
  useUrlParam('g.exp', bucket, setBucket, G_BUCKET, urlOn);
  useUrlParam('g.scale', scale, setScale, G_SCALE, urlOn);
  useUrlParam('g.gamma', gview, setGview, G_GAMMA, urlOn);
  const adjOk = hasAdjusted(g.matrix);
  const view = effectiveView(gview, narrow, adjOk);
  const cellMetric = gexMetricOf(metric, view, adjOk);
  const [drill, setDrill] = useState<StrikeExpiryCell | null>(null);
  const shaped = useMemo(() => shapeMatrix(g.matrix, bucket, g.spot, cellMetric), [g.matrix, bucket, g.spot, cellMetric]);
  const snap = g.snap;
  const band = useMemo(
    () => strikeBandOf(g.spot, g.q.data?.candles, [snap?.callWall, snap?.putWall, snap?.maxGammaStrike, snap ? zeroGammaOf(snap) : null]),
    [g.spot, g.q.data?.candles, snap],
  );
  const blocked = gate(g, 'strike × expiry surface');
  if (blocked) return blocked;
  // the tool's own controls ride in the matrix's ONE toolbar row
  const leading = (
    <>
      <div className="of-seg" role="group" aria-label="Metric">
        {(['gex', 'vex'] as const).map((m) => (
          <button key={m} type="button" className={metric === m ? 'on' : ''} aria-pressed={metric === m} onClick={() => setMetric(m)} title={m === 'gex' ? 'GEX — $ dealers trade per 1% spot move' : 'VEX — $ dealers trade per 1 IV point'}>{m.toUpperCase()}</button>
        ))}
      </div>
      {metric === 'gex' && <GammaViewSeg view={view} onChange={setGview} allowBoth={!narrow} available={adjOk} />}
      <HorizonSeg bucket={bucket} onChange={setBucket} counts={shaped.bucketCounts} />
    </>
  );
  return (
    <div className="gx-tool gx-col">
      {metric === 'gex' && view !== 'raw' && <GammaLevelsCompare snap={g.snap} view={view} />}
      <div className="gx-grow matrix-wrap">
        <GexStrikeMatrix
          cells={g.matrix}
          expiries={shaped.expiries}
          levels={gridLevelsOf(g.snap, g.spot, metric === 'gex' ? view : 'raw')}
          metric={cellMetric}
          compare={metric === 'gex' && view === 'both'}
          centerKey={`${g.symbol}|tool-surface|${metric}|${bucket}`}
          onCellClick={setDrill}
          scale={scale}
          onScaleChange={setScale}
          strikeBand={band}
          leading={leading}
          spotInToolbar={!dash.hasTool('gex-levels')}
          snapshotAt={terminalAsOf(g.q.data)}
          emptyText={g.matrix.length === 0
            // No rows at all: a wider horizon cannot help — say why (server note).
            ? `no strike × expiry rows for ${g.symbol}${g.matrixNote ? ` — ${g.matrixNote}` : ''}`
            : `no listed cells for ${g.symbol} in ${DTE_BUCKETS.find((b) => b.id === bucket)?.label ?? 'this'} — pick a wider horizon`}
        />
      </div>
      {drill && <GexCellDrill drill={drill} matrix={g.matrix} metric={cellMetric} spot={g.spot} symbol={g.symbol} onClose={() => setDrill(null)} />}
    </div>
  );
}

/* ════════════ Gamma profile / zero-γ ════════════ */
export function GexProfileTool() {
  const g = useGexFocus();
  const blocked = gate(g);
  if (blocked) return blocked;
  const zg = zeroGammaOf(g.snap);
  if (!g.snap!.gammaProfile || g.snap!.gammaProfile.length <= 2) {
    return <QEEmpty className="fd-m" message={`The engine returned no re-priced gamma profile for ${g.symbol}, so zero-γ can't be drawn.`} />;
  }
  return (
    <div className="gx-tool gx-col fd-pad">
      <div className="gx-kv-line">
        <span>zero-γ <b style={{ color: 'var(--amber)' }}>{zg != null ? px(zg) : 'none within ±20%'}</b></span>
        <span>spot <b>{px(g.spot)}</b></span>
        {zg != null && g.spot > 0 && <span>{g.spot >= zg ? 'above' : 'below'} by <b>{Math.abs((g.spot / zg - 1) * 100).toFixed(2)}%</b></span>}
      </div>
      <div className="gx-grow gx-profile">
        <GammaProfileChart snap={g.snap!} spot={g.spot} zeroGamma={zg} height={140} idSuffix={`tool-${g.symbol}`} />
      </div>
      <div className="fd-foot" style={{ padding: '4px 0 0' }}>Net GEX re-priced at hypothetical spots (every contract's gamma recomputed at each price, IV held). Where the curve crosses zero is the zero-gamma level.</div>
    </div>
  );
}

/* ════════════ Key levels — walls / magnet / flip ════════════ */
const ageText = (iso: string, now: number) => {
  const sec = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  return !Number.isFinite(sec) ? 'age —' : sec < 90 ? `${sec}s old` : sec < 5400 ? `${Math.round(sec / 60)}m old` : `${Math.round(sec / 3600)}h old`;
};

export function GexKeyLevelsTool() {
  const g = useGexFocus();
  const quoteQ = usePhoneQuote(g.symbol);
  const live = quoteQ.data?.[g.symbol];
  const { hasTool } = useDashboard();
  const now = useNow(15_000);
  const near = useMemo(() => nearTermByStrike(g.matrix, g.spot), [g.matrix, g.spot]);
  const blocked = gate(g);
  if (blocked) return blocked;
  const snap = g.snap!; const spot = g.spot;
  const reg = regimeView(snap);
  const zg = zeroGammaOf(snap);
  const chainAt = terminalAsOf(g.q.data);
  // One reference price (shared/price-agreement.ts): live quote vs the chain's spot.
  // >5% apart → one feed is stale; distances are withheld and both prices shown.
  const agreement = checkPriceAgreement([
    { label: 'Live quote', price: live?.price ?? null, asOf: live?.asOf ?? null },
    { label: 'Chain snapshot', price: spot, asOf: chainAt ?? null },
  ]);
  const dist = (v: number | null | undefined) => (agreement.ok && v != null && spot ? `${v >= spot ? '+' : ''}${(((v - spot) / spot) * 100).toFixed(1)}%` : '');
  const chainTime = chainAt ? new Date(chainAt).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }) : null;
  // Net GEX / VEX are exposures: they print once, in Regime & Narrative, when that tile is on the page.
  const exposuresElsewhere = hasTool('gex-regime');
  // Ask Quantinum on one level — the server rebuilds walls/quote/flow from its own data; the row is "as displayed".
  const askLevel = (levelType: string, level: number | null | undefined) => (level != null && Number.isFinite(level)
    ? <AnalyzeWithQuantinum compact target={{ kind: 'gex', symbol: g.symbol, label: `${g.symbol} ${levelType} ${level}`, row: { level, levelType, spot: +spot.toFixed(2) } }} />
    : null);
  return (
    <div className="gx-tool fd-scroll">
      {/* THE spot of the GEX workspace (audit 2026-10-01, GEX #2): the live quote, big; the
          chain-snapshot spot the walls were computed at, labelled, once. */}
      <div className="gx-spot">
        <div><span className="gx-spot-sym">{g.symbol}</span> {live ? <span className="gx-spot-tag">live</span> : null}<b>{px(live?.price ?? spot)}</b>{' '}
          {live && Number.isFinite(live.changePercent) ? <span style={{ color: live.changePercent >= 0 ? 'var(--green)' : 'var(--red)' }}>{live.changePercent >= 0 ? '+' : ''}{live.changePercent.toFixed(2)}%</span> : null}
        </div>
        <span className="dim gx-spot-note" title={`Live: realtime quote${live?.asOf ? ` · ${ageText(live.asOf, now)}` : ''}. Walls, nodes and zero-γ are from the GEX engine's chain snapshot${chainTime ? ` at ${chainTime} ET` : ''}, computed at spot $${spot.toFixed(2)}.`}>
          {live ? <>{live.asOf ? `${ageText(live.asOf, now)} · ` : ''}chain snapshot {px(spot)}{chainTime ? ` @ ${chainTime}` : ''}</>
            : quoteQ.isLoading ? `chain snapshot${chainTime ? ` @ ${chainTime}` : ''} · loading live…`
            : `chain snapshot${chainTime ? ` @ ${chainTime}` : ''} · no live quote`}
        </span>
      </div>
      {!agreement.ok && <div className="gx-pad"><PriceConflictNote agreement={agreement} /></div>}
      <DealerStructureRail snap={snap} spot={spot} zeroGamma={zg} negGamma={reg?.regime === 'negative'} names />
      <div className="context-grid gx-pad">
        <div className="context-item">
          <div className="context-k" title="Strike ABOVE spot with the largest call gamma $ summed over all expiries. Typical resistance.">Call wall {askLevel('call wall', snap.callWall)}</div>
          <div className="context-v cyan">{px(snap.callWall, 0)}</div>
          <div className="context-sub">{dist(snap.callWall)} · largest call γ above{snap.callWallOI != null && snap.callWallOI !== snap.callWall ? ` · by OI $${snap.callWallOI}` : ''}</div>
        </div>
        <div className="context-item">
          <div className="context-k" title="Strike BELOW spot with the largest put gamma $ summed over all expiries. Typical support.">Put wall {askLevel('put wall', snap.putWall)}</div>
          <div className="context-v red">{px(snap.putWall, 0)}</div>
          <div className="context-sub">{dist(snap.putWall)} · largest put γ below{snap.putWallOI != null && snap.putWallOI !== snap.putWall ? ` · by OI $${snap.putWallOI}` : ''}</div>
        </div>
        <div className="context-item">
          <div className="context-k" title="Max gamma — strike with the largest |net GEX|, all listed expiries. Price is often pulled toward it (pin)."><Term k="king-node">King node · max γ</Term> {askLevel('king node', snap.maxGammaStrike)}</div>
          <div className="context-v" style={{ color: LEVEL_COLORS.magnet }}>{px(snap.maxGammaStrike, 0)}</div>
          <div className="context-sub">{dist(snap.maxGammaStrike)} · largest |GEX| strike</div>
        </div>
        <div className="context-item">
          <div className="context-k" title="Zero-gamma: spot where net dealer gamma crosses zero when the chain is re-priced across hypothetical spots (±20%). The regime boundary, not a target."><Term k="gamma-flip">Zero-γ</Term> {askLevel('zero gamma', zg)}</div>
          <div className="context-v amber">{zg != null ? px(zg) : '—'}</div>
          <div className="context-sub">{zg != null ? `spot ${Math.abs((spot / zg - 1) * 100).toFixed(1)}% ${spot >= zg ? 'above' : 'below'}` : 'no crossing within ±20%'}</div>
        </div>
        {!exposuresElsewhere && <>
          <div className="context-item">
            <div className="context-k" title="Net VEX: $ dealers trade per 1 IV point. − = dealers sell as IV rises.">Net VEX</div>
            <div className="context-v" style={{ color: exposureText('vex', snap.totalVEX ?? 0) }}>{(snap.totalVEX ?? 0) < 0 ? '⚠ ' : ''}{fmtVexM(snap.totalVEX)}</div>
            <div className="context-sub">per 1 IV point</div>
          </div>
          <div className="context-item">
            <div className="context-k">Net GEX · all</div>
            <div className="context-v" style={{ color: exposureText('gex', snap.totalGEX) }}>{fmtGexB(snap.totalGEX)}</div>
            <div className="context-sub">per 1% move</div>
          </div>
        </>}
      </div>
      {exposuresElsewhere && <div className="gx-ref">Net GEX and net VEX → <b>Regime &amp; Narrative</b></div>}
      <div className="gx-sub-head">Near-term nodes · 0–7 DTE</div>
      <div className="gx-nodes gx-pad">
        {([
          ['Negative node', near.negative?.strike, 'var(--red)'],
          ['Dominant node', near.dominant?.strike, 'var(--amber)'],
          ['Positive node', near.positive?.strike, 'var(--cyan-bright)'],
        ] as const).map(([k, v, c]) => (
          <div key={k}><span>{k}</span><b style={{ color: c }}>{px(v ?? null, 0)}</b></div>
        ))}
      </div>
    </div>
  );
}

/* ════════════ Regime & narrative ════════════ */
export function GexRegimeTool() {
  const g = useGexFocus();
  const { hasTool } = useDashboard();
  const near = useMemo(() => nearTermByStrike(g.matrix, g.spot), [g.matrix, g.spot]);
  const blocked = gate(g);
  if (blocked) return blocked;
  const snap = g.snap!; const spot = g.spot;
  const reg = regimeView(snap);
  const zg = zeroGammaOf(snap);
  const read = regimeNarrative(reg, zg);
  const disagrees = nearTermDisagrees(reg, near);
  const clock = sessionClock();
  const negGamma = reg?.regime === 'negative';
  const color = regimeColor(reg?.regime, reg?.nearFlip);
  // Each fact once (audit 2026-10-01, GEX #3): net GEX prints in the stats below, not
  // again in the posture card; spot lives in Key Levels; the 0–7 DTE node strikes print
  // in Key Levels when that tile is on the page — the playbook names them instead.
  const basis = (reg?.basis ?? '').split(' · ').filter((s) => !/^net GEX /.test(s)).join(' · ');
  const nodesElsewhere = hasTool('gex-levels');
  const holdRange = near.negative && near.positive
    ? (nodesElsewhere ? 'the 0–7 DTE negative ↔ positive nodes' : `$${near.negative.strike}–$${near.positive.strike}`)
    : 'the measured near-term range';
  const dominantTxt = nodesElsewhere ? 'the dominant node' : `$${near.dominant?.strike ?? 'the dominant node'}`;
  return (
    <div className="gx-tool fd-scroll">
      <div className="gx-hero" style={{ borderColor: `color-mix(in srgb, ${color} 35%, transparent)`, background: `color-mix(in srgb, ${color} 7%, transparent)` }}
        title={`Gamma regime — ${reg?.basis}. Sign assumes dealers long calls / short puts.`}>
        <span className="gx-glyph" style={{ color }}>{reg?.glyph}</span>
        <div>
          <div className="gx-hero-title">{reg?.title}</div>
          <div className="gx-hero-posture">{read.headline}</div>
          <div className="gx-hero-basis">{basis ? `${basis} · ` : ''}all listed expiries</div>
        </div>
      </div>
      <p className="gx-expect">{read.expectation}</p>
      <div className="gx-stats">
        <div><span>Net GEX · all</span><b style={{ color: exposureText('gex', snap.totalGEX) }}>{fmtGexB(snap.totalGEX)}/1%</b></div>
        <div title="Vendors that chart only today's expiry are comparable to the front-expiry figure, not the whole-book headline.">
          <span>{snap.gexByScope ? `Front${snap.gexByScope.frontExpiryDays != null && snap.gexByScope.frontExpiryDays < 1 ? ' (0DTE)' : ''} · ≤7d` : '0–7 DTE'}</span>
          <b style={{ color: disagrees ? 'var(--amber)' : undefined }}>{snap.gexByScope ? `${fmtGexB(snap.gexByScope.frontExpiry)} · ${fmtGexB(snap.gexByScope.le7d)}` : near.levels.length ? fmtGexB(near.total) : '—'}</b>
        </div>
        <div><span>Expiry clock</span><b>{clock.label}</b></div>
        <div title="Net VEX: $ dealers trade per 1 IV point. − = dealers sell as IV rises."><span>Net VEX</span><b style={{ color: exposureText('vex', snap.totalVEX ?? 0) }}>{(snap.totalVEX ?? 0) < 0 ? '⚠ ' : ''}{fmtVexM(snap.totalVEX)}</b></div>
      </div>
      {disagrees && <div className="of-warn" style={{ margin: '0 10px 8px' }}>The 0–7 DTE book leans the other way from the whole book — the near-term read and the headline disagree.</div>}
      <div className="gx-actions">
        <div>
          <span>If price holds inside</span>
          <strong>{holdRange}</strong>
          <p>{negGamma ? 'Negative gamma (dealers short) can amplify breaks. Wait for direction and acceptance beyond a node.' : reg?.regime === 'positive' ? `Positive gamma (dealers long) can dampen extensions and pull price toward ${dominantTxt}.` : 'Dealer gamma is roughly balanced — nodes are weaker decision levels.'}</p>
        </div>
        <div>
          <span>If a wall breaks</span>
          <strong>{nodesElsewhere ? 'above the positive node · below the negative node' : <>{near.positive ? `>${near.positive.strike} upper` : 'upper node —'} · {near.negative ? `<${near.negative.strike} lower` : 'lower node —'}</>}</strong>
          <p>Require price acceptance plus volume/flow confirmation. GEX supplies structure; it does not create the entry by itself.</p>
        </div>
      </div>
      <div className="fd-foot"><b>Model ·</b> GEX = Γ·OI·100·S²·1% ($ per 1% move, all listed expiries); VEX = vanna·OI·100·S per 1 vol point. Dealer sign is an assumption (dealers long calls, short puts). Nodes are levels, not entries. Educational only.</div>
    </div>
  );
}

/* ════════════ Gravity & strongest nodes ════════════ */
export function GexGravityTool() {
  const g = useGexFocus();
  const [metric, setMetric] = useToolSetting<'gex' | 'vex'>('metric', 'gex');
  const shaped = useMemo(() => shapeMatrix(g.matrix, 'all', g.spot, metric), [g.matrix, g.spot, metric]);
  const blocked = gate(g);
  if (blocked) return blocked;
  const snap = g.snap!; const spot = g.spot;
  const reg = regimeView(snap);
  const negGamma = reg?.regime === 'negative';
  return (
    <div className="gx-tool fd-scroll">
      <div className="gx-controls">
        <div className="of-seg" role="group" aria-label="Metric">
          {(['gex', 'vex'] as const).map((m) => <button key={m} type="button" className={metric === m ? 'on' : ''} onClick={() => setMetric(m)}>{m.toUpperCase()}</button>)}
        </div>
        <span className="gx-note">share of |{metric.toUpperCase()}| over every listed cell</span>
      </div>
      <div className="gravity-card">
        {shaped.callPct == null ? (
          <div className="dim" style={{ fontFamily: mono, fontSize: 10 }}>no listed exposure yet</div>
        ) : (
          <>
            <div className="gravity-bar" style={{ background: `linear-gradient(90deg, var(--red) 0%, var(--red) ${100 - shaped.callPct}%, var(--panel-hi) ${100 - shaped.callPct}%, var(--panel-hi) ${100 - shaped.callPct + 2}%, ${metric === 'vex' ? 'var(--green)' : 'var(--cyan)'} ${100 - shaped.callPct + 2}%, ${metric === 'vex' ? 'var(--green)' : 'var(--cyan)'} 100%)` }}>
              {spot > 0 && snap.putWall != null && snap.callWall != null && snap.callWall > snap.putWall && (
                <div className="gravity-marker" title={`spot $${spot.toFixed(2)} within the wall range`} style={{ left: `${Math.max(2, Math.min(98, ((spot - snap.putWall) / (snap.callWall - snap.putWall)) * 100))}%` }} />
              )}
            </div>
            <div className="gravity-labels">
              <div className="puts">↓ {(100 - shaped.callPct).toFixed(1)}% negative</div>
              <div className="calls">{shaped.callPct.toFixed(1)}% positive ↑</div>
            </div>
            <div className="gravity-note">
              {negGamma
                ? <>Dealer hedging can <b>amplify whichever side confirms first</b>. Use the walls as structure, not as a ceiling and floor.</>
                : reg?.regime === 'positive'
                  ? <>Expect price to <b>drift and pin</b> between levels rather than trend hard.</>
                  : <>Dealer gamma is <b>roughly balanced</b>: other flows dominate.</>}
            </div>
          </>
        )}
      </div>
      <div className="insight-card">
        {shaped.above ? (
          <div className="insight-item bull">
            <div className="insight-k">Strongest node above spot</div>
            <div className="insight-v">${shaped.above.strike} · {shaped.above.expiryLabel} · {shaped.above.dte}d</div>
            <div className="insight-desc">Largest listed {metric.toUpperCase()} node above. <b>A level, not an entry.</b></div>
          </div>
        ) : <div className="insight-item note"><div className="insight-desc">No listed node above spot.</div></div>}
        {shaped.below ? (
          <div className="insight-item bear">
            <div className="insight-k">Strongest node below spot</div>
            <div className="insight-v">${shaped.below.strike} · {shaped.below.expiryLabel} · {shaped.below.dte}d</div>
            <div className="insight-desc">Largest listed node below.{shaped.below.dte <= 1 ? <> <b>0–1DTE — pin risk elevated into the close.</b></> : null}</div>
          </div>
        ) : <div className="insight-item note"><div className="insight-desc">No listed node below spot.</div></div>}
        {(shaped.above?.dte ?? 99) <= 5 && (
          <div className="insight-item note">
            <div className="insight-k">Time is your friend</div>
            <div className="insight-desc">The strongest node sits only {shaped.above!.dte}d out. The same strike on a later expiry costs more premium but gives the thesis room.</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════ Cross-ticker rankings (hub scan) ════════════ */
export function GexRankingsTool() {
  const [focus, setFocus] = useFocusSymbol();
  const q = useGexHub();
  const [mode, setMode] = useToolSetting<'gex' | 'vex'>('mode', 'gex');
  const plays = q.data?.hub?.topPlays ?? [];
  const failed = q.data?.hub?.failedSymbols ?? [];
  useToolReport({
    asOf: q.isError && !q.data ? null : q.data ? (q.data.generatedAt ?? null) : undefined,
    note: q.isError ? 'refresh failed' : q.data?.hub?.miniScan ? 'mini-scan · full sweep warming' : failed.length ? `${failed.length} chains failed` : undefined,
    tone: q.isError || failed.length ? 'warn' : 'ok',
  });
  if (q.isLoading) return <QELoading rows={6} className="fd-pad" label="hub scan loading…" />;
  if (q.isError && !q.data) return <QEError className="fd-m" title="GEX hub scan didn't load" onRetry={() => q.refetch()} retrying={q.isFetching} />;
  if (!plays.length) return <QEEmpty className="fd-m" message="No ranked tickers yet — they appear after the next hub scan." />;
  const rows = mode === 'gex' ? plays : [...plays].sort((a, b) => Math.abs(b.totalVEX ?? 0) - Math.abs(a.totalVEX ?? 0));
  return (
    <div className="gx-tool gx-col">
      <div className="gx-controls">
        <div className="of-seg" role="group" aria-label="Rank by">
          {(['gex', 'vex'] as const).map((m) => <button key={m} type="button" className={mode === m ? 'on' : ''} onClick={() => setMode(m)} title={m === 'gex' ? 'Scanner play score; badge = gamma regime' : 'By |net VEX| ($ per 1 IV point)'}>{m === 'gex' ? 'PLAY SCORE' : '|VEX|'}</button>)}
        </div>
        <span className="gx-note" title={failed.length ? `chains failed for: ${failed.slice(0, 20).join(', ')}` : 'every attempted name scanned'}>
          {q.data?.hub?.totalTickers ?? q.data?.hub?.totalScanned ?? plays.length}{q.data?.hub?.attempted != null && q.data.hub.attempted !== (q.data.hub.totalTickers ?? 0) ? `/${q.data.hub.attempted}` : ''} scanned
        </span>
      </div>
      <div className="fd-scroll">
        <table className="fd-mini">
          <thead><tr><th>#</th><th>Ticker</th><th>γ</th><th className="r">{mode === 'gex' ? 'Score' : 'Net VEX'}</th></tr></thead>
          <tbody>
            {rows.map((p, i) => {
              const d = describeLegacyRegime(p.regime);
              return (
                <tr key={p.symbol} className={p.symbol === focus ? 'sel' : ''} onClick={() => setFocus(p.symbol)} title={p.insight ? `${p.symbol} — ${p.insight}` : `Focus ${p.symbol}`}>
                  <td className="dim">{i + 1}</td>
                  <td className="tk">{p.symbol}{p.symbol === 'SPY' && <span className="dim"> · bench</span>}</td>
                  {mode === 'gex'
                    ? <td style={{ color: regimeColor(d.regime, d.nearFlip) }} title={`${d.title} — ${d.posture}`}>{d.glyph}</td>
                    : <td style={{ color: exposureText('vex', p.totalVEX ?? 0) }}>{(p.totalVEX ?? 0) < 0 ? '−' : '+'}</td>}
                  <td className="r" style={mode === 'vex' && p.totalVEX != null ? { color: exposureText('vex', p.totalVEX) } : undefined}>
                    {mode === 'gex' ? (p.playScore ?? '—') : p.totalVEX != null ? fmtVexM(p.totalVEX) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="fd-foot">Play score (0–100) = VEX magnitude + regime + wall bracket — an ordering, not a probability. Click a row to focus every GEX tool on it.</div>
      </div>
    </div>
  );
}

/* ════════════ Magnet setups / screener (rankings job) ════════════ */
export function GexSetupsTool() {
  const [, setFocus] = useFocusSymbol();
  return <div className="fd-scroll"><GexRankingsPanel onPick={setFocus} compact /></div>;
}

/* ════════════ GEX hub (classic, all-in-one) ════════════ */
export function GexHubTool() { return <div className="fd-fill fd-legacy"><GexHubNexus /></div>; }

/* ════════════ Money flow — sector rotation out of → into ════════════ */
export function MoneyFlowTool() {
  const q = useSectorRotation();
  const r = q.data as (typeof q.data & { asOf?: string; isStale?: boolean }) | undefined;
  useToolReport({
    asOf: q.isError && !q.data ? null : q.data ? (r?.asOf ?? null) : undefined,
    note: q.isError ? 'refresh failed' : r?.isStale ? 'stale session' : r?.sessionLabel,
    tone: q.isError || r?.isStale ? 'warn' : 'ok',
  });
  if (q.isLoading) return <QELoading rows={3} className="fd-pad" />;
  if (q.isError && !q.data) return <QEError className="fd-m" title="Sector rotation didn't load" onRetry={() => q.refetch()} retrying={q.isFetching} />;
  const out = (q.data?.laggards ?? []).slice(0, 4); const into = (q.data?.leaders ?? []).slice(0, 4);
  if (!out.length && !into.length) return <QEEmpty className="fd-m" message="No sector rotation read yet this session — check back after the open." />;
  return (
    <div className="fd-scroll fd-pad">
      <div className="flow-wrap" style={{ marginTop: 0 }}>
        <div className="flow-side">
          <div className="flow-side-label">Out of</div>
          {out.map((s) => <div className="flow-item" key={s.etf} title={s.etf}><span className="sym">{s.name}</span><span className="val out">{s.change.toFixed(1)}%</span></div>)}
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-side">
          <div className="flow-side-label">Into</div>
          {into.map((s) => <div className="flow-item" key={s.etf} title={s.etf}><span className="sym">{s.name}</span><span className="val in">+{s.change.toFixed(1)}%</span></div>)}
        </div>
      </div>
      <div className="fd-foot" style={{ padding: '6px 0 0' }}>Sector ETF % change this session — laggards → leaders. Relative moves, not fund flows.</div>
    </div>
  );
}

