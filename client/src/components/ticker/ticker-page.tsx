/**
 * THE TICKER PAGE — what you get when you search a ticker. One page, one
 * price, one verdict; information architecture in docs/TICKER_PAGE.md.
 *
 *   header      symbol · ONE live quote (source + age) · day change · verdict
 *               (Quantinum lean + the two heaviest reasons) · Watch / Alert /
 *               Run engine
 *   key stats   volume vs 20d · ATR · RSI · 52w position · short % float · 30d
 *   dealer map  call wall · put wall · zero-γ · regime · week expected move ·
 *               next earnings — computed on demand for ANY name
 *   chart       price with the dealer levels, the week's 1σ band and any
 *               published entry/stop/target drawn on it
 *   §options    today's flow, top contracts, IV vs realized, contract engine
 *   §setups     live idea (or one line), this name's ledger, binding rules
 *   §evidence   Quantinum layers — collapsed by default
 *   §peers      sector proxy ETF + closest peers, today, from one quote call
 *   §news       earnings, read-through prints, catalysts, macro (index ETFs)
 *
 * Deep views on the same URL: ?tab=gex (GEX surface), ?tab=analyze
 * (Contract lab). Empty states are one line — never a "No signal" card.
 */
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Bell, Cpu, Star } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { openWorkup } from '@/lib/workup-bus';
import { getPeerSet } from '@shared/sector-peers';
import { QEChart } from '@/components/charting/qe-chart';
import type { Level, Zone } from '@/components/charting/chart-engine';
import { TickerSwitcher } from '@/components/ticker-switcher';
import { LuxButton, LuxPage, LuxTag } from '@/components/lux';
import {
  INDEX_ETFS, age, atr14, fmtBig, fmtPct, fmtPx, getJson, num, rsi14, shortDate, useQuotes, useTickerData,
  type CatalystRow, type EconEvent, type FlowTrade, type LedgerRow, type Pick, type Quote, type VolRead,
} from './ticker-data';
import './ticker-page.css';

const ContractPickerPanel = lazy(() => import('@/components/workup/contract-picker-panel').then((m) => ({ default: m.ContractPickerPanel })));

export type TickerView = 'page' | 'gex' | 'lab';
export const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'options', label: 'Options' },
  { id: 'setups', label: 'Setups' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'peers', label: 'Peers' },
  { id: 'news', label: 'News' },
] as const;

/* ─────────────────────────── small pieces ─────────────────────────── */

function Stat({ k, v, sub, tone, title }: { k: string; v: ReactNode; sub?: ReactNode; tone?: 'gain' | 'loss' | 'caution' | 'accent' | 'mute'; title?: string }) {
  return (
    <div className="tk-stat" title={title}>
      <div className="tk-stat-k">{k}</div>
      <div className="tk-stat-v" data-tone={tone}>{v}</div>
      {sub != null && <div className="tk-stat-s">{sub}</div>}
    </div>
  );
}

function Section({ id, title, meta, children }: { id: string; title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="tk-section" aria-labelledby={`${id}-h`}>
      <div className="tk-section-h">
        <h2 id={`${id}-h`}>{title}</h2>
        {meta && <div className="tk-section-meta">{meta}</div>}
      </div>
      {children}
    </section>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="tk-empty">{children}</p>;

/* ─────────────────────────────── page ─────────────────────────────── */

export function TickerPage({ symbol, view, onView, onSymbol, backTo, initialSection }: {
  symbol: string;
  view: TickerView;
  onView: (v: TickerView) => void;
  onSymbol: (sym: string) => void;
  /** "Back to <tab>" when the terminal sent us here. */
  backTo?: { label: string; onClick: () => void } | null;
  /** Legacy ?tab=chart|options|events land on their section. */
  initialSection?: string | null;
}) {
  const d = useTickerData(symbol);
  const { sym } = d;
  const q: Quote | undefined = d.quote.data?.[sym];
  const bars = d.bars.data?.data ?? [];
  const qtm = d.qtm.data;
  const snap = d.dealer.data?.snapshot;
  const week = d.week.data;
  const earn = d.earnings.data?.ownEarnings ?? null;
  const pick = d.conv.data?.picks?.find((p) => p.symbol?.toUpperCase() === sym) ?? null;

  // Scroll a legacy section request into view once the page has laid out.
  useEffect(() => {
    if (view !== 'page') return;
    const target = initialSection ?? (typeof window !== 'undefined' ? window.location.hash.slice(1) : '');
    if (!target) return;
    const t = window.setTimeout(() => document.getElementById(target)?.scrollIntoView({ block: 'start' }), 350);
    return () => window.clearTimeout(t);
  }, [initialSection, view, sym]);

  /* header actions */
  const [watch, setWatch] = useState<'idle' | 'saving' | 'done' | 'fail'>('idle');
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertPx, setAlertPx] = useState('');
  const [alertState, setAlertState] = useState<'idle' | 'armed' | 'fail'>('idle');
  const [engine, setEngine] = useState<'idle' | 'running' | 'done' | 'fail'>('idle');
  const [engineResult, setEngineResult] = useState<any>(null);
  useEffect(() => { setWatch('idle'); setAlertState('idle'); setAlertOpen(false); setEngine('idle'); setEngineResult(null); }, [sym]);

  const addWatch = async () => {
    if (watch !== 'idle') return;
    setWatch('saving');
    try { const r = await apiRequest('POST', '/api/watchlist', { symbol: sym }); setWatch(r.ok ? 'done' : 'fail'); } catch { setWatch('fail'); }
  };
  const armAlert = async () => {
    const px = Number(alertPx);
    if (!Number.isFinite(px) || px <= 0) { setAlertState('fail'); return; }
    try { const r = await apiRequest('POST', '/api/alerts/level', { symbol: sym, price: px }); setAlertState(r.ok ? 'armed' : 'fail'); } catch { setAlertState('fail'); }
    setAlertOpen(false);
  };
  const runEngine = async () => {
    setEngine('running');
    try {
      const r = await apiRequest('POST', `/api/engine/analyze/${sym}`, {});
      const body = await r.json();
      setEngineResult(body); setEngine('done');
      if (body?.published) {
        queryClient.invalidateQueries({ queryKey: ['/api/convictions'] });
        queryClient.invalidateQueries({ queryKey: ['/api/ideas/ledger'] });
      }
    } catch { setEngine('fail'); }
  };
  const engineLine = engine === 'running' ? 'Engine running — every detector and gate on this name…'
    : engine === 'fail' ? 'Engine run failed — retry.'
    : engine === 'done' ? (engineResult?.published
        ? `Engine published ${engineResult.idea?.signal ?? 'a setup'} ${String(engineResult.idea?.direction ?? '').toUpperCase()} — score ${engineResult.idea?.score ?? '—'}, R:R ${engineResult.idea?.riskRewardRatio ?? '—'}:1. See Setups.`
        : engineResult?.blocked ?? engineResult?.reason ?? 'Engine ran — no qualifying setup on this name right now.')
    : null;

  /* indicators — daily series, never a price */
  const stats = useMemo(() => {
    const closes = bars.map((b) => b.close);
    const vols = bars.map((b) => b.volume ?? 0).filter((v) => v > 0);
    const avgVol20 = vols.length >= 21 ? vols.slice(-21, -1).reduce((a, b) => a + b, 0) / 20 : null;
    const y = bars.slice(-252);
    return {
      rsi: rsi14(closes),
      atr: atr14(bars),
      avgVol20,
      h52: y.length ? Math.max(...y.map((b) => b.high)) : null,
      l52: y.length ? Math.min(...y.map((b) => b.low)) : null,
      ret30: bars.length > 21 ? ((closes[closes.length - 1] - closes[closes.length - 22]) / closes[closes.length - 22]) * 100 : null,
    };
  }, [bars]);
  const shortInt = useQuery<{ shortPercentOfFloat: number | null; shortRatio: number | null }>({ queryKey: ['/api/short-interest', sym], queryFn: getJson(`/api/short-interest/${sym}`), staleTime: 3_600_000, retry: 1 });

  const price = q?.price ?? null;
  const up = (q?.changePercent ?? 0) >= 0;
  // Yahoo's quote leg reports volume 0 outside its session feed — that is
  // "not reported", not "nothing traded", so it prints as a dash.
  const liveVol = q?.volume && q.volume > 0 ? q.volume : null;
  const volRatio = liveVol && stats.avgVol20 ? liveVol / stats.avgVol20 : null;
  const pos52 = price != null && stats.h52 != null && stats.l52 != null && stats.h52 > stats.l52 ? ((price - stats.l52) / (stats.h52 - stats.l52)) * 100 : null;

  /* verdict — Quantinum lean + its two heaviest reasons */
  const topLayers = (qtm?.layers ?? []).filter((l) => l.points !== 0).sort((a, b) => Math.abs(b.points) - Math.abs(a.points)).slice(0, 2);
  const leanTone = qtm?.lean === 'bullish' ? 'gain' : qtm?.lean === 'bearish' ? 'loss' : qtm?.lean === 'mixed' ? 'caution' : 'mute';
  const leanGlyph = qtm?.lean === 'bullish' ? '▲' : qtm?.lean === 'bearish' ? '▼' : '◆';

  /* dealer map */
  const regimeLabel = snap?.regime ? snap.regime.replace(/_/g, ' ') : null;
  // The weekly-path model sizes the week on 20-day realized vol (VIX for the
  // S&P complex). When its history leg fails it falls back to a stamped
  // 'regime-estimate' (a fixed guess) — never printed as this name's move.
  // The page then applies the SAME formula (σ20d·√252 annualised, ×√(5/252))
  // to the daily series it already holds, and says so.
  const rv20 = useMemo(() => {
    const c = bars.slice(-21).map((b) => b.close);
    if (c.length < 21) return null;
    const r = c.slice(1).map((x, i) => Math.log(x / c[i]));
    const m = r.reduce((a, b) => a + b, 0) / r.length;
    const sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1));
    const ann = sd * Math.sqrt(252);
    return ann > 0.02 && ann < 3 ? ann : null;
  }, [bars]);
  const weekTrusted = week?.expectedMove != null && week.volSource !== 'regime-estimate';
  const emSpot = week?.spotPrice ?? price ?? null;
  const em = weekTrusted ? week!.expectedMove! : rv20 != null && emSpot ? emSpot * rv20 * Math.sqrt(5 / 252) : null;
  const emBasis = weekTrusted ? (week!.volSource === 'vix' ? 'VIX' : '20d realized vol') : rv20 != null ? '20d realized vol (daily series)' : null;
  const emPct = em != null && emSpot ? (em / emSpot) * 100 : null;
  const dealerAge = d.dealer.data?.cachedAt ?? d.dealer.data?.generatedAt ?? null;

  /* chart levels: dealer anchors + published execution levels + 1σ week band */
  const levels: Level[] = useMemo(() => {
    const rows: Level[] = [];
    if (snap?.putWall != null) rows.push({ price: snap.putWall, color: 'put', label: 'PUT WALL', kind: 'gex-anchor', strength: 0.8, meta: 'Γ wall' });
    if (snap?.gammaFlipPrice != null) rows.push({ price: snap.gammaFlipPrice, color: 'caution', label: 'ZERO Γ', kind: 'gex-anchor', strength: 0.7, meta: 'Γ flip' });
    if (snap?.callWall != null) rows.push({ price: snap.callWall, color: 'call', label: 'CALL WALL', kind: 'gex-anchor', strength: 0.8, meta: 'Γ wall' });
    if (pick && pick.levelBasis !== 'contract') {
      if (pick.targetPrice != null) rows.push({ price: pick.targetPrice, color: '#6ee7b7', label: 'T1', kind: 'execution' });
      if (pick.entryPrice != null) rows.push({ price: pick.entryPrice, color: '#3b8cff', label: 'ENTRY', kind: 'execution' });
      if (pick.stopLoss != null) rows.push({ price: pick.stopLoss, color: '#ff6b3d', label: 'STOP', kind: 'execution' });
    }
    return rows.filter((l) => Number.isFinite(l.price));
  }, [snap?.putWall, snap?.gammaFlipPrice, snap?.callWall, pick]);
  const zones: Zone[] = useMemo(() => (
    em != null && emSpot ? [{ from: emSpot - em, to: emSpot + em, color: 'rgba(59,140,255,0.07)', label: '1σ week' }] : []
  ), [em, emSpot]);

  const header = (
    <header className="tk-head">
      <div className="tk-head-top">
        <div className="tk-id">
          <span className="tk-eyebrow">Ticker</span>
          <h1 className="tk-sym">{sym}</h1>
        </div>
        <div className="tk-actions">
          {backTo && <LuxButton variant="ghost" onClick={backTo.onClick}><ArrowLeft aria-hidden /> {backTo.label}</LuxButton>}
          <LuxButton onClick={addWatch} aria-pressed={watch === 'done'}><Star aria-hidden /> {watch === 'done' ? 'Watching' : watch === 'saving' ? 'Saving…' : watch === 'fail' ? 'Watch failed' : 'Watch'}</LuxButton>
          {alertOpen ? (
            <span className="tk-alert-edit">
              <input autoFocus inputMode="decimal" aria-label="Alert price" value={alertPx} onChange={(e) => setAlertPx(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setAlertOpen(false); if (e.key === 'Enter') void armAlert(); }} placeholder="level $" />
              <LuxButton onClick={() => void armAlert()}>Arm</LuxButton>
            </span>
          ) : (
            <LuxButton onClick={() => { setAlertPx(price != null ? price.toFixed(2) : ''); setAlertOpen(true); }} title="Alert once when price crosses a level (relayed to Discord)">
              <Bell aria-hidden /> {alertState === 'armed' ? 'Alert armed' : alertState === 'fail' ? 'Alert failed' : 'Alert'}
            </LuxButton>
          )}
          <LuxButton variant="primary" onClick={runEngine} disabled={engine === 'running'} title="Run the publisher's own engine — every detector, every gate — on this name now. A qualifying setup publishes into the book.">
            <Cpu aria-hidden /> {engine === 'running' ? 'Running…' : 'Run engine'}
          </LuxButton>
          <TickerSwitcher value={sym} onChange={onSymbol} />
        </div>
      </div>

      <div className="tk-quote" aria-live="polite">
        {q ? (
          <>
            <span className="tk-price">{fmtPx(q.price)}</span>
            <span className={`tk-chg ${up ? 'lx-tone-gain' : 'lx-tone-loss'}`}>{up ? '▲' : '▼'} {q.change >= 0 ? '+' : '−'}${Math.abs(q.change).toFixed(2)} · {fmtPct(q.changePercent)}</span>
            <span className="tk-src" title={q.asOf ?? undefined}>{q.source ?? 'realtime quote'}{q.delayed ? ' · delayed' : ''} · {age(q.asOf)}</span>
          </>
        ) : d.quote.isError ? (
          <span className="tk-src">Quote unavailable — every provider in the realtime chain failed for {sym}.</span>
        ) : (
          <span className="tk-src">Loading quote…</span>
        )}
      </div>

      <p className="tk-verdict">
        {qtm ? (
          <>
            <b className={`lx-tone-${leanTone}`}>{leanGlyph} {qtm.lean === 'quiet' ? 'Quiet' : `${qtm.lean[0].toUpperCase()}${qtm.lean.slice(1)} lean`}</b>
            <span className="tk-verdict-pts"> · +{qtm.bullPoints} / −{qtm.bearPoints}</span>
            {topLayers.length > 0
              ? <span> — {topLayers.map((l) => `${l.label} ${l.points > 0 ? '+' : ''}${l.points}`).join(', ')}. {topLayers[0].why}</span>
              : <span> — no engine carries a directional read on {sym} right now.</span>}
          </>
        ) : d.qtm.isError ? (
          <span>Quantinum read unavailable. <button className="tk-link" onClick={() => void d.qtm.refetch()}>Retry</button></span>
        ) : (
          <span>Reading every engine on {sym}…</span>
        )}
      </p>
      {engineLine && <p className="tk-engine-line" data-state={engineResult?.published ? 'published' : engine}>{engineLine}</p>}
    </header>
  );

  const miniNav = (
    <nav className="tk-nav" aria-label={`${sym} sections`}>
      <div className="tk-nav-scroll">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="tk-nav-a" data-active={view === 'page' ? undefined : 'false'}
            onClick={(e) => {
              if (view !== 'page') { e.preventDefault(); onView('page'); window.setTimeout(() => document.getElementById(s.id)?.scrollIntoView({ block: 'start' }), 300); }
            }}>{s.label}</a>
        ))}
        <span className="tk-nav-sep" aria-hidden />
        <button className="tk-nav-a" data-active={view === 'gex'} onClick={() => onView(view === 'gex' ? 'page' : 'gex')}>Open in GEX</button>
        <button className="tk-nav-a" data-active={view === 'lab'} onClick={() => onView(view === 'lab' ? 'page' : 'lab')}>Contract lab</button>
      </div>
    </nav>
  );

  if (view !== 'page') {
    return (
      <LuxPage width="full" className="tk-page">
        {header}
        {miniNav}
        <DeepView view={view} />
      </LuxPage>
    );
  }

  return (
    <LuxPage width="wide" className="tk-page">
      {header}
      {miniNav}

      <div className="tk-stats" id="overview" aria-label="Key stats">
        <Stat k="Volume" v={fmtBig(liveVol)} sub={volRatio != null ? `${volRatio.toFixed(1)}× 20d avg` : '20d avg —'} tone={volRatio != null && volRatio >= 1.5 ? 'accent' : undefined} />
        <Stat k="ATR 14" v={fmtPx(stats.atr)} sub={stats.atr != null && price ? `${((stats.atr / price) * 100).toFixed(1)}% of price` : 'daily'} />
        <Stat k="RSI 14" v={stats.rsi != null ? Math.round(stats.rsi) : '—'} sub={stats.rsi == null ? 'daily' : stats.rsi >= 70 ? 'overbought' : stats.rsi <= 30 ? 'oversold' : 'daily'} tone={stats.rsi != null && (stats.rsi >= 70 || stats.rsi <= 30) ? 'caution' : undefined} />
        <Stat k="52w range" v={pos52 != null ? `${Math.round(pos52)}%` : '—'} sub={`${fmtPx(stats.l52)} – ${fmtPx(stats.h52)}`} title="Where the live price sits between the 52-week low (0%) and high (100%)" />
        <Stat k="Short % float" v={shortInt.data?.shortPercentOfFloat != null ? `${(shortInt.data.shortPercentOfFloat * 100).toFixed(1)}%` : '—'} sub={shortInt.data?.shortRatio != null ? `${shortInt.data.shortRatio.toFixed(1)}d to cover` : 'exchange-reported'} tone={(shortInt.data?.shortPercentOfFloat ?? 0) >= 0.15 ? 'caution' : undefined} />
        <Stat k="30 day" v={fmtPct(stats.ret30, 1)} tone={stats.ret30 == null ? undefined : stats.ret30 >= 0 ? 'gain' : 'loss'} sub="daily closes" />
      </div>

      <div className="tk-dealer" aria-label="Dealer map">
        <div className="tk-dealer-h">
          <span>Dealer map · this week</span>
          <span className="tk-src">
            {d.dealer.isLoading ? 'computing from the option chain…'
              : snap ? `${d.dealer.data?.cached ? 'last good · ' : ''}chain ${age(dealerAge)}` : 'chain unavailable'}
          </span>
        </div>
        {d.dealer.isError || (!d.dealer.isLoading && !snap) ? (
          <Empty>No option chain answered for {sym} (Alpaca, CBOE, Yahoo) — walls and zero-γ need listed options.</Empty>
        ) : null}
        <div className="tk-stats tk-stats-dealer">
          <Stat k="Call wall" v={fmtPx(snap?.callWall)} tone="gain" sub={snap?.callWall && price ? fmtPct(((snap.callWall - price) / price) * 100, 1) + ' away' : undefined} />
          <Stat k="Put wall" v={fmtPx(snap?.putWall)} tone="loss" sub={snap?.putWall && price ? fmtPct(((snap.putWall - price) / price) * 100, 1) + ' away' : undefined} />
          <Stat k="Zero γ" v={snap?.gammaFlipPrice != null ? fmtPx(snap.gammaFlipPrice) : snap ? 'none near' : '—'} tone="caution"
            sub={snap?.gammaFlipPrice != null && price ? (price >= snap.gammaFlipPrice ? 'price above flip' : 'price below flip') : snap ? 'net γ keeps one sign ±20%' : undefined} />
          <Stat k="Regime" v={regimeLabel ?? '—'} sub={snap?.regime === 'positive_gamma' ? 'dealers damp moves' : snap?.regime === 'negative_gamma' ? 'dealers amplify moves' : undefined} tone={snap?.regime === 'negative_gamma' ? 'caution' : undefined} />
          <Stat k="Week move 1σ" v={em != null ? `±${fmtPx(em)}` : d.week.isLoading ? '…' : '—'}
            sub={em != null && emSpot ? `${emPct != null ? `±${emPct.toFixed(1)}% · ` : ''}${fmtPx(emSpot - em)}–${fmtPx(emSpot + em)}` : 'no vol series'}
            title={emBasis ? `1σ for five sessions, sized on ${emBasis} — the Today weekly-path model` : undefined} />
          <Stat k="Next earnings" v={earn ? shortDate(earn.date) : INDEX_ETFS.has(sym) ? 'n/a · ETF' : d.earnings.isLoading ? '…' : 'none ≤30d'}
            sub={earn ? `${earn.session === 'pre' ? 'before open' : earn.session === 'post' ? 'after close' : 'time n/a'} · ${earn.daysAway}d` : 'Nasdaq calendar'}
            tone={earn && earn.daysAway <= 7 ? 'caution' : undefined} />
        </div>
      </div>

      <div className="tk-chart" id="chart">
        <QEChart key={`tk-${sym}`} symbol={sym} initialTf="1D" height={380} levels={levels} zones={zones} />
        <p className="tk-footnote">Drawn: call/put walls and zero-γ from the live chain{zones.length ? ', the week’s 1σ band' : ''}{levels.some((l) => l.kind === 'execution') ? ', the published entry/stop/target' : ''}. Walls are modelled dealer positioning, not guaranteed support or resistance.</p>
      </div>

      <OptionsSection sym={sym} pick={pick} />
      <SetupsSection sym={sym} pick={pick} qtmGate={qtm?.shortGate ?? null} earnDays={earn?.daysAway ?? null} />
      <EvidenceSection qtm={qtm} loading={d.qtm.isLoading} pickLayers={pick?.layers ?? []} />
      <PeersSection sym={sym} quote={q} />
      <NewsSection sym={sym} earn={earn} readThroughs={d.earnings.data?.readThroughs ?? []} />
    </LuxPage>
  );
}

/* ───────────────────────────── deep views ───────────────────────────── */

const TerminalHeatmap = lazy(() => import('@/components/research/terminal-heatmap'));
const ContractAnalyzer = lazy(() => import('@/components/contract-analyzer').then((m) => ({ default: m.ContractAnalyzer })));

function DeepView({ view }: { view: TickerView }) {
  return (
    <Suspense fallback={<Empty>Loading {view === 'gex' ? 'GEX surface' : 'Contract lab'}…</Empty>}>
      <div className={view === 'gex' ? 'tk-deep tk-deep-gex' : 'tk-deep'}>
        {view === 'gex' ? <TerminalHeatmap /> : <ContractAnalyzer />}
      </div>
    </Suspense>
  );
}

/* ─────────────────────────────── options ─────────────────────────────── */

function OptionsSection({ sym, pick }: { sym: string; pick: Pick | null }) {
  const flow = useQuery<{ trades?: FlowTrade[] }>({ queryKey: ['/api/options-flow', sym, 'ticker'], queryFn: getJson(`/api/options-flow?symbol=${sym}&limit=60`), staleTime: 180_000, retry: 1 });
  const aggressor = useQuery<{ read: { lean: 'long' | 'short' | 'flat'; callsNetPremium: number; putsNetPremium: number } | null }>({ queryKey: ['/api/bullflow/net-premium', sym], queryFn: getJson(`/api/bullflow/net-premium/${sym}`), staleTime: 180_000, retry: 0 });
  const dark = useQuery<{ darkPoolLevels?: Array<{ price: number; notional: number }> }>({ queryKey: ['/api/bullflow/context', sym], queryFn: getJson(`/api/bullflow/context/${sym}`), staleTime: 180_000, retry: 0 });
  const vol = useQuery<VolRead>({ queryKey: ['/api/volatility-analysis', sym], queryFn: getJson(`/api/volatility-analysis/${sym}`), staleTime: 900_000, retry: 0 });
  const [engineOpen, setEngineOpen] = useState(false);

  const all = flow.data?.trades ?? [];
  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const today = all.filter((t) => t.detectedAt && new Date(t.detectedAt).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) === todayET);
  const trades = today.length ? today : all;
  const scope = today.length ? 'today' : all.length ? 'latest window' : 'today';
  const prem = (t: FlowTrade) => num(t.totalPremium ?? t.premium) ?? 0;
  const calls = trades.filter((t) => (t.optionType ?? '').toLowerCase() === 'call');
  const puts = trades.filter((t) => (t.optionType ?? '').toLowerCase() === 'put');
  const cPrem = calls.reduce((a, t) => a + prem(t), 0);
  const pPrem = puts.reduce((a, t) => a + prem(t), 0);
  const top = [...trades].sort((a, b) => prem(b) - prem(a)).slice(0, 8);
  const dir = (pick?.direction ?? '').toLowerCase();

  return (
    <Section id="options" title="Options" meta={<>
      {aggressor.data?.read && <LuxTag tone={aggressor.data.read.lean === 'long' ? 'gain' : aggressor.data.read.lean === 'short' ? 'loss' : 'mute'} title="Aggressor-inferred net premium today (ask vs bid side)">aggressor {aggressor.data.read.lean}</LuxTag>}
      {!!dark.data?.darkPoolLevels?.length && <LuxTag tone="mute" title="Largest dark-pool print level today">dark {fmtPx(dark.data.darkPoolLevels[0].price)} · {fmtBig(dark.data.darkPoolLevels[0].notional, '$')}</LuxTag>}
      <LuxTag tone="mute">{trades.length} prints · {scope}</LuxTag>
    </>}>
      <div className="tk-stats">
        {trades.length > 0 && <>
        <Stat k="Call premium" v={fmtBig(cPrem, '$')} tone="gain" sub={`${calls.length} prints`} />
        <Stat k="Put premium" v={fmtBig(pPrem, '$')} tone="loss" sub={`${puts.length} prints`} />
        <Stat k="Call / put" v={pPrem > 0 ? (cPrem / pPrem).toFixed(2) : '—'} sub="by premium" />
        <Stat k="Sweeps" v={trades.filter((t) => (t.flowType ?? '').toLowerCase().includes('sweep')).length} sub="urgency prints" />
        </>}
        <Stat k="IV (ATM)" v={vol.data ? `${vol.data.currentIV.toFixed(0)}%` : vol.isLoading ? '…' : '—'} sub={vol.data ? `realized 20d ${vol.data.realizedVol20.toFixed(0)}%` : 'chain IV'} />
        <Stat k="IV vs realized" v={vol.data ? `${vol.data.ivRvRatio.toFixed(2)}×` : '—'} sub={vol.data ? (vol.data.ivVsRv === 'expensive' ? 'premium rich' : vol.data.ivVsRv === 'cheap' ? 'premium cheap' : 'fair') : 'term structure not fed'} tone={vol.data?.ivVsRv === 'expensive' ? 'caution' : undefined} />
      </div>

      {top.length > 0 ? (
        <div className="tk-table-wrap">
          <table className="tk-table">
            <caption className="sr-only">Top {sym} contracts by premium</caption>
            <thead><tr><th>Contract</th><th>Type</th><th className="r">Vol / OI</th><th className="r">Premium</th><th className="r">Seen</th></tr></thead>
            <tbody>
              {top.map((t, i) => {
                const isCall = (t.optionType ?? '').toLowerCase() === 'call';
                const ft = (t.flowType ?? 'unusual').toLowerCase();
                return (
                  <tr key={t.id ?? i}>
                    <td className="mono"><b className={isCall ? 'lx-tone-gain' : 'lx-tone-loss'}>{num(t.strikePrice) ?? '—'}{isCall ? 'C' : 'P'}</b> {shortDate(t.expirationDate)}</td>
                    <td>{ft.includes('sweep') ? 'sweep' : ft.includes('block') ? 'block' : ft.includes('whale') ? 'whale' : 'unusual'}</td>
                    <td className="r mono">{fmtBig(t.volume ?? null)} / {fmtBig(t.openInterest ?? null)}</td>
                    <td className="r mono">{fmtBig(prem(t), '$')}</td>
                    <td className="r mono">{t.detectedAt ? age(t.detectedAt) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>{flow.isLoading ? 'Loading flow…' : `No ${sym} prints cleared the flow scanner’s thresholds ${scope === 'today' ? 'today' : 'in the window'}.`}</Empty>
      )}

      <details className="tk-details" onToggle={(e) => setEngineOpen((e.target as HTMLDetailsElement).open)}>
        <summary>Pick a contract — contract engine{pick ? ' (fitted to the live idea’s levels)' : ''}</summary>
        {engineOpen && (
          <Suspense fallback={<Empty>Loading contract engine…</Empty>}>
            <ContractPickerPanel symbol={sym}
              direction={dir.includes('bear') || dir.includes('short') ? 'short' : dir.includes('bull') || dir.includes('long') ? 'long' : undefined}
              target={pick?.targetPrice ?? null} stop={pick?.stopLoss ?? null} entry={pick?.entryPrice ?? null} holdPeriodLabel={pick?.holdingPeriod ?? null} />
          </Suspense>
        )}
      </details>
    </Section>
  );
}

/* ─────────────────────────────── setups ─────────────────────────────── */

const BTC_PROXIES = new Set(['MARA', 'RIOT', 'MSTR', 'COIN', 'IBIT', 'CLSK', 'ETHA', 'ETHE', 'HOOD']);

function SetupsSection({ sym, pick, qtmGate, earnDays }: {
  sym: string;
  pick: Pick | null;
  qtmGate: { open: boolean; why: string } | null;
  earnDays: number | null;
}) {
  const ledger = useQuery<{ ledger?: LedgerRow[]; window?: string }>({ queryKey: ['/api/ideas/ledger', 'symbol', sym], queryFn: getJson(`/api/ideas/ledger?symbol=${sym}&sessions=20&limit=200`), staleTime: 300_000, retry: 1 });
  // Older servers ignore ?symbol=; filter again so the record is always this name's.
  const rows = (ledger.data?.ledger ?? []).filter((r) => r.symbol?.toUpperCase() === sym);
  const count = (o: string[]) => rows.filter((r) => o.some((k) => r.outcome.toLowerCase().includes(k))).length;
  const won = count(['hit_target', 'win', 'target']);
  const lost = count(['hit_stop', 'loss', 'stop']);
  const open = rows.filter((r) => r.outcome === 'open').length;
  const decided = won + lost;

  const band = pick?.publishedConvictionBand ?? pick?.convictionBand ?? null;
  const score = pick?.publishedConvictionScore ?? pick?.convictionScore ?? null;
  const short = (pick?.direction ?? '').toLowerCase().includes('short') || (pick?.direction ?? '').toLowerCase().includes('bear');

  const rules: { name: string; state: string; tone: 'gain' | 'loss' | 'caution' | 'mute' }[] = [];
  if (qtmGate) rules.push({ name: 'Short discipline', state: qtmGate.open ? `open — ${qtmGate.why}` : `blocked — ${qtmGate.why}`, tone: qtmGate.open ? 'caution' : 'mute' });
  if (earnDays != null && earnDays <= 10) rules.push({ name: 'Event risk', state: `earnings in ${earnDays}d — size down, not an exit`, tone: 'caution' });
  if (BTC_PROXIES.has(sym)) rules.push({ name: 'BTC proxy', state: 'mirrored bitcoin rule applies', tone: 'caution' });
  rules.push({ name: 'Sample floor', state: 'no win rate below 30 decided outcomes', tone: 'mute' });

  return (
    <Section id="setups" title="Setups" meta={<LuxTag tone="mute">{ledger.data?.window ?? '20 sessions'}</LuxTag>}>
      {pick ? (
        <div className="tk-idea">
          <div className="tk-idea-h">
            <LuxTag tone={short ? 'loss' : 'gain'}>{short ? '▼ SHORT' : '▲ LONG'}</LuxTag>
            <span className="tk-idea-type">{pick.tradeType ?? pick.holdingPeriod ?? 'idea'}</span>
            {band && <LuxTag tone="accent">{band}{score != null ? ` · ${Math.round(score)}` : ''}</LuxTag>}
          </div>
          <div className="tk-stats tk-stats-4">
            <Stat k={pick.levelBasis === 'contract' ? 'Entry (premium)' : 'Entry'} v={fmtPx(pick.entryPrice)} tone="accent" />
            <Stat k="Stop" v={fmtPx(pick.stopLoss)} tone="loss" />
            <Stat k="Target" v={fmtPx(pick.targetPrice)} tone="gain" />
            <Stat k="Reward : risk" v={pick.riskRewardRatio != null ? `${Number(pick.riskRewardRatio).toFixed(1)} : 1` : '—'} />
          </div>
          {pick.thesis && <p className="tk-body">{pick.thesis}</p>}
        </div>
      ) : (
        <Empty>No live idea for {sym} in the book{/* Run engine lives in the header */} — use Run engine above to put it through the publisher now.</Empty>
      )}

      <h3 className="tk-h3">Record on {sym}</h3>
      {rows.length === 0 ? (
        <Empty>{ledger.isLoading ? 'Loading the ledger…' : `No published ${sym} ideas in the last ${ledger.data?.window ?? '20 sessions'}.`}</Empty>
      ) : (
        <>
          <p className="tk-body">
            {rows.length} published · <b className="lx-tone-gain">{won} reached target</b> · <b className="lx-tone-loss">{lost} stopped</b> · {open} open · {rows.length - won - lost - open} expired/other.
            {decided < 30 ? ` Win rate withheld — ${decided} decided (< 30).` : ` Win rate ${((won / decided) * 100).toFixed(0)}% of ${decided} decided.`}
          </p>
          <div className="tk-table-wrap">
            <table className="tk-table">
              <thead><tr><th>Published</th><th>Side</th><th>Signal</th><th>Outcome</th><th className="r">Option %</th></tr></thead>
              <tbody>
                {rows.slice(0, 6).map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{shortDate(r.at)}</td>
                    <td>{r.direction}</td>
                    <td>{r.signal}</td>
                    <td>{r.outcome.replace(/_/g, ' ')}</td>
                    <td className="r mono">{r.optionPercentGain != null ? fmtPct(r.optionPercentGain, 0) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3 className="tk-h3">Rules that bind {sym}</h3>
      <ul className="tk-rules">
        {rules.map((r) => <li key={r.name}><b>{r.name}</b> <span className={`lx-tone-${r.tone}`}>{r.state}</span></li>)}
      </ul>
    </Section>
  );
}

/* ─────────────────────────────── evidence ─────────────────────────────── */

function EvidenceSection({ qtm, loading, pickLayers }: {
  qtm: import('./ticker-data').QuantinumDossier | undefined;
  loading: boolean;
  pickLayers: { label?: string; kind?: string; points?: number; why?: string }[];
}) {
  const layers = qtm?.layers ?? [];
  return (
    <Section id="evidence" title="Evidence">
      {!qtm ? (
        <Empty>{loading ? 'Quantinum is reading every engine…' : 'Quantinum read unavailable.'}</Empty>
      ) : (
        <details className="tk-details">
          <summary>
            {layers.length} Quantinum layers · <span className="lx-tone-gain">+{qtm.bullPoints}</span> / <span className="lx-tone-loss">−{qtm.bearPoints}</span>
            {qtm.unavailable.length ? ` · ${qtm.unavailable.length} not measured` : ''}
          </summary>
          <ul className="tk-layers">
            {layers.map((l, i) => (
              <li key={i}>
                <span className={`tk-pts ${l.points > 0 ? 'lx-tone-gain' : l.points < 0 ? 'lx-tone-loss' : 'lx-tone-mute'}`}>{l.points > 0 ? `+${l.points}` : l.points}</span>
                <span><b>{l.label}</b> — {l.why} <span className="tk-src">({l.source})</span></span>
              </li>
            ))}
          </ul>
          {qtm.unavailable.length > 0 && <p className="tk-footnote">Not measured: {qtm.unavailable.join(' · ')}</p>}
          {pickLayers.length > 0 && (
            <>
              <h3 className="tk-h3">Scored layers on the published idea</h3>
              <ul className="tk-layers">
                {pickLayers.filter((l) => Number.isFinite(l.points)).map((l, i) => (
                  <li key={i}>
                    <span className={`tk-pts ${(l.points ?? 0) >= 0 ? 'lx-tone-gain' : 'lx-tone-loss'}`}>{(l.points ?? 0) > 0 ? `+${l.points}` : l.points}</span>
                    <span><b>{l.label ?? l.kind}</b>{l.why ? ` — ${l.why}` : ''}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="tk-footnote">Evidence layers, not a recommendation. The +/− totals are evidence weight, not a probability.</p>
        </details>
      )}
    </Section>
  );
}

/* ─────────────────────────────── peers ─────────────────────────────── */

function PeersSection({ sym, quote }: { sym: string; quote: Quote | undefined }) {
  const set = getPeerSet(sym, 6);
  // Unmapped names fall back to the scan universe's own bucket (no ETF).
  const bucket = useQuery<{ sector: string | null; peers: string[] }>({ queryKey: ['/api/peers', sym], queryFn: getJson(`/api/peers/${sym}`), staleTime: 3_600_000, retry: 1, enabled: !set });
  const etf = set?.group.etf ?? null;
  const peers = set?.peers ?? bucket.data?.peers ?? [];
  const label = set?.group.label ?? bucket.data?.sector?.replace(/_/g, ' ') ?? null;
  const quotes = useQuotes([...(etf ? [etf] : []), ...peers]);
  const qs = quotes.data ?? {};
  const peerChanges = peers.map((p) => qs[p]?.changePercent).filter((v): v is number => Number.isFinite(v));
  const median = peerChanges.length ? [...peerChanges].sort((a, b) => a - b)[Math.floor(peerChanges.length / 2)] : null;
  const mine = quote?.changePercent ?? null;
  const etfChg = etf ? qs[etf]?.changePercent ?? null : null;
  const read = mine == null || median == null ? null
    : Math.sign(mine) === Math.sign(median) ? `moving with its group (peer median ${fmtPct(median)})`
    : `diverging from its group (peer median ${fmtPct(median)})`;

  return (
    <Section id="peers" title="Peers & sector" meta={label ? <LuxTag tone="mute">{label}</LuxTag> : undefined}>
      {peers.length === 0 ? (
        <Empty>{bucket.isLoading ? 'Resolving peers…' : `${sym} is not in a mapped peer group or scan-universe bucket.`}</Empty>
      ) : (
        <>
          <p className="tk-body">
            {sym} {fmtPct(mine)} today{etf ? <> vs sector proxy <b>{etf}</b> {fmtPct(etfChg)}{mine != null && etfChg != null ? ` (${fmtPct(mine - etfChg)} relative)` : ''}</> : ''}{read ? ` — ${read}.` : '.'}
          </p>
          <div className="tk-peers">
            {etf && (
              <button className="tk-peer" data-etf onClick={() => openWorkup(etf)}>
                <span className="tk-peer-s">{etf}</span><span className="tk-peer-n">sector proxy</span>
                <span className={`tk-peer-c ${(etfChg ?? 0) >= 0 ? 'lx-tone-gain' : 'lx-tone-loss'}`}>{fmtPct(etfChg)}</span>
              </button>
            )}
            {peers.map((p) => {
              const c = qs[p]?.changePercent ?? null;
              return (
                <button key={p} className="tk-peer" onClick={() => openWorkup(p)}>
                  <span className="tk-peer-s">{p}</span><span className="tk-peer-n">{fmtPx(qs[p]?.price ?? null)}</span>
                  <span className={`tk-peer-c ${(c ?? 0) >= 0 ? 'lx-tone-gain' : 'lx-tone-loss'}`}>{fmtPct(c)}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </Section>
  );
}

/* ─────────────────────────────── news ─────────────────────────────── */

function NewsSection({ sym, earn, readThroughs }: { sym: string; earn: import('./ticker-data').EarningsEvent | null; readThroughs: import('./ticker-data').ReadThrough[] }) {
  const cats = useQuery<CatalystRow[]>({ queryKey: ['/api/catalysts/symbol', sym], queryFn: getJson(`/api/catalysts/symbol/${sym}`), staleTime: 300_000, retry: 1 });
  const econ = useQuery<{ upcoming?: EconEvent[] }>({ queryKey: ['/api/economic-calendar', 'ticker'], queryFn: getJson('/api/economic-calendar'), staleTime: 600_000, retry: 1, enabled: INDEX_ETFS.has(sym) });
  const rows = (Array.isArray(cats.data) ? cats.data : []).slice().sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? '')).slice(0, 8);
  const macro = INDEX_ETFS.has(sym) ? (econ.data?.upcoming ?? []).slice(0, 4) : [];

  return (
    <Section id="news" title="News & events">
      <ul className="tk-events">
        <li>
          <b>Earnings</b>{' '}
          {earn ? <>{shortDate(earn.date)} · {earn.session === 'pre' ? 'before the open' : earn.session === 'post' ? 'after the close' : 'time not given'} · in {earn.daysAway}d{earn.epsForecast != null ? ` · EPS est ${earn.epsForecast.toFixed(2)}` : ''} <span className="tk-src">(Nasdaq calendar)</span></>
            : <span className="lx-tone-mute">{INDEX_ETFS.has(sym) ? 'index product — no earnings; macro releases below' : 'none scheduled in the next 30 days (Nasdaq calendar)'}</span>}
        </li>
        {readThroughs.slice(0, 5).map((r) => (
          <li key={`${r.sourceSymbol}-${r.date}`}>
            <b>{r.linkType === 'bellwether' ? 'Bellwether' : 'Peer print'}</b>{' '}
            <button className="tk-link" onClick={() => openWorkup(r.sourceSymbol)}>{r.sourceSymbol}</button> reports {shortDate(r.date)} ({r.daysAway}d) — {r.why}
          </li>
        ))}
        {macro.map((e) => (
          <li key={`${e.name}-${e.date}`}><b>Macro</b> {e.name} · {shortDate(e.date)}{e.time ? ` ${e.time}` : ''}{e.importance === 'high' ? <LuxTag tone="caution">high impact</LuxTag> : null}</li>
        ))}
      </ul>
      {rows.length > 0 ? (
        <ul className="tk-news">
          {rows.map((n, i) => (
            <li key={n.id ?? i}>
              <span className="tk-news-meta">{(n.source ?? 'news').split(':').pop()} · {age(n.timestamp)}{n.impact === 'high' ? ' · ' : ''}{n.impact === 'high' && <LuxTag tone="caution">event risk</LuxTag>}</span>
              {n.sourceUrl ? <a href={n.sourceUrl} target="_blank" rel="noreferrer noopener">{n.title ?? n.description?.slice(0, 140)}</a> : <span>{n.title ?? n.description?.slice(0, 140)}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{cats.isLoading ? 'Loading news…' : `No ${sym} headlines on file — the news sentry covers a rotating slice, so absence is absence of coverage.`}</Empty>
      )}
      <p className="tk-footnote">Binary events (earnings, FDA, conferences) are counted as risk, never as direction.</p>
    </Section>
  );
}
