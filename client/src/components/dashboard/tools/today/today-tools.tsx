/**
 * TODAY tools — the /today page split into dashboard tools (2026-09-29).
 *
 * The page's landing graphic language is kept: each tool body wraps in
 * `.landing .today-l .td-tool` so nexus.css (landing blocks) and today.css
 * (dealer map, ladder, index desk) style it exactly as before, with the
 * tile-fit overrides in today.css under `.td-tool`. Data + drawing pieces
 * live in today-model.tsx; every tool shares its queries.
 */
import { regimeFromLegacy } from '@shared/gex-regime';
import { useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { convictionDisplayPercent } from '@shared/conviction-display';
import { setPrefs, usePrefs } from '@/lib/board-prefs';
import { Spark, RotQuad, SigCard, CHECK } from '@/components/landing/live-widgets';
import { QEEmpty, QEError, QELoading } from '@/components/ui/qe-states';
import { AuditTrailLink } from '@/pages/today';
import { nexusIdeaHref } from '@/lib/nexus-link';
import { useTickFlash } from '@/lib/use-tick-flash';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/components/landing/live-widgets';
import { QEStale } from '@/components/ui/qe-states';
import { Clamp, PhoneNote } from '@/components/ui/qe-phone';
import { GAP_BASIS, GAP_FLAT_PCT, gapAlignment, isPreMarketWindow, rankGappers, pmRecordLine, pmSetupMarker, type GapPhase, type PmRecord, type PmSetupMark } from '@/lib/premarket';
import { useDashboard, useNow, useToolReport } from '../../frame';
import { ageLabel } from '../flow/tape';
import {
  Ladder, WeekMap, explain, fmt, newest,
  useBook, useElementWidth, useIndexDesk, usePerf, usePulse, useRotation, useSpyGex, useSpyIntraday, useWeeklyPath,
} from './today-model';
import '@/styles/nexus.css';
import '@/styles/today.css';

const WRAP = 'landing today-l td-tool';

/* ════════════ Week dealer map (hero) ════════════ */
export function TodayWeekMapTool() {
  const wp = useWeeklyPath();
  const g = useSpyGex();
  const book = useBook();
  const rotation = useRotation();
  const spyIntra = useSpyIntraday();
  const { hasTool, addTool, editable } = useDashboard();
  const [, setLocation] = useLocation();
  const now = useNow();
  const [ref, width] = useElementWidth<HTMLDivElement>();

  const snap = g.snap;
  const magnet = snap?.maxGammaStrike;
  // Regime from the SAME snapshot as the walls on this card (GEX terminal = GEX page),
  // by the shared rule (shared/gex-regime.ts): net-GEX sign with a 5% neutral band,
  // plus near-flip. v1 read the weekly-path request's regime (a separate compute)
  // and printed "long gamma" for anything not negative — including a −$5B book near its flip.
  const gRead = snap?.regimeRead;
  const gRegime = gRead?.regime ?? regimeFromLegacy(snap?.regime ?? wp.data?.regime);
  const nearFlip = gRead?.nearFlip ?? (snap?.regime ?? wp.data?.regime) === 'transitioning';
  const shortGamma = gRegime === 'negative';
  const balanced = gRegime === 'neutral';
  // Max |γ| strike is a "magnet" only when its net gamma is positive; a put-dominated
  // max-gamma strike (often the same strike as the put wall) is a pivot, not a pin.
  const magnetIsPut = (snap?.levels?.find((l) => l.strike === magnet)?.gex ?? 0) < 0;
  const sigma = wp.data?.expectedMove;
  const spy = book.quote('SPY');
  // Live SPY only — the model's start price is publish-time and never shown as "now".
  const spyPx = spy?.price ?? spy?.lastPrice;
  const refPx = spyPx ?? wp.data?.spotPrice;
  const spyFlash = useTickFlash(spyPx);
  const spyBars = spyIntra.data?.data ?? [];
  const pinClose = !magnetIsPut && magnet != null && sigma != null && spyPx != null && Math.abs(magnet - spyPx) <= 0.75 * sigma;
  const feedDown = wp.isError && !wp.data;
  const weekOf = wp.data ? new Date(wp.data.weekStart + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
  const pathAsOf = wp.data ? (wp.data.cachedAt ?? (wp.dataUpdatedAt ? new Date(wp.dataUpdatedAt).toISOString() : null)) : null;

  useToolReport({
    asOf: g.q.isError && !g.q.data ? (pathAsOf ?? null) : (g.asOf ?? pathAsOf ?? undefined),
    note: feedDown ? 'path model down · retrying' : g.q.isError ? 'dealer levels failed' : pathAsOf ? `path model ${ageLabel(pathAsOf, now)}` : undefined,
    tone: feedDown || g.q.isError || g.q.data?.cached ? 'warn' : 'ok',
  });

  const toBest = () => {
    if (hasTool('today-best-idea')) document.querySelector('[data-tool="today-best-idea"]')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    else if (editable) addTool('today-best-idea');
    else setLocation('/t'); // fixed page without the tool: the ranked board is NEXUS (/t)
  };
  const narrow = width > 0 && width < 560;

  return (
    <div className={`${WRAP} td-week`} ref={ref}>
      <div className="hero-grid">
        <div>
          <div className="hero-eyebrow qp-desk-only"><span className="pill">TODAY</span>Index desk{weekOf ? ` · week of ${weekOf}` : ''}</div>
          {feedDown ? (
            <h1 className="hero-title">Options positioning is unavailable.</h1>
          ) : !wp.data ? (
            <h1 className="hero-title">Reading the dealer map…</h1>
          ) : (
            <h1 className="hero-title">
              SPY is <span className="grad">{shortGamma ? 'in short gamma' : balanced ? 'balanced on gamma' : 'in long gamma'}</span>{nearFlip ? ', near zero-γ' : ''}. {shortGamma ? 'Moves get amplified.' : balanced ? 'Neither side dominates.' : 'Moves get dampened.'}
              {sigma != null
                ? <span className="accent"> {pinClose && gRegime === 'positive' ? `Price is near the ${fmt(magnet, 0)} magnet.` : `Weekly range: ±${fmt(sigma, 0)} points.`}</span>
                : null}
            </h1>
          )}
          <Clamp className="hero-sub">
            {feedDown
              ? 'We only draw the map from measured positioning. It comes back the moment the feed does — this tool retries every 30 seconds.'
              : !wp.data ? ''
              : `${shortGamma
                ? 'Short-gamma dealers sell into drops and buy into rips, so ranges widen.'
                : balanced ? 'Dealer gamma is close to flat, so hedging neither caps nor extends moves much.'
                : 'Long-gamma dealers buy dips and sell rips, so ranges tighten.'}${sigma != null && refPx ? ` ${wp.data.volSource === 'realized-20d' ? 'Lately SPY has moved' : 'Expect'} about ±${fmt(sigma, 0)} points (${fmt(sigma / refPx * 100, 1)}%) in a typical week${wp.data.volSource === 'realized-20d' ? `${wp.data.impliedVol && spyPx ? ` — options price more, ±${fmt(spyPx * wp.data.impliedVol * Math.sqrt(5 / 252), 0)}` : ''}` : wp.data.volSource === 'vix' ? ' (from VIX)' : ' (estimated)'}.` : ''}${magnet && sigma != null && spyPx != null && Math.abs(magnet - spyPx) > 0.75 * sigma ? ` The biggest strike, ${fmt(magnet, 0)}, is ${fmt(Math.abs(magnet - spyPx), 0)} points away — further than dealers usually drag price in a week.` : ''}`}
          </Clamp>
          <div className="hero-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={toBest} title={hasTool('today-best-idea') ? 'Scroll to the Best idea tool' : editable ? 'Add the Best idea tool to this dashboard' : 'Open the ranked setups on NEXUS'}>
              Today&rsquo;s best idea
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
            </button>
            <Link href="/t?tab=gex" className="btn btn-ghost btn-lg">Full GEX surface</Link>
          </div>
          <div className="tl-keys" title={g.asOf ? `Measured SPY dealer levels · ${ageLabel(g.asOf, now)}` : 'Measured SPY dealer levels'}>
            {([[magnetIsPut ? 'Put pivot' : 'Magnet', magnet, 'king node', 'mag'], ['Ceiling', snap?.callWall, 'call wall', 'up'], ['Floor', snap?.putWall, 'put wall', 'dn']] as const).map(([k, v, sub, cls]) => (
              <div key={k}><span>{k}</span><b className={cls}>{fmt(v as number | undefined, 0)}</b><small>{sub}</small></div>
            ))}
          </div>
        </div>

        <div className="lterminal">
          <div className="lterminal-head">
            <div className="lterminal-dots"><span /><span /><span /></div>
            <div className="lterminal-title">dealer map · spy · this week</div>
            <div className="lterminal-status"><span className="dot" />{pathAsOf ? `model ${ageLabel(pathAsOf, now)}` : 'measured'}</div>
          </div>
          <div className="lterminal-body">
            <div className="t-panel" style={{ gridColumn: '1/-1' }}>
              <div className="t-panel-head"><span>This week · {wp.data?.volSource === 'realized-20d' ? 'realized range' : wp.data?.volSource === 'vix' ? 'implied range (VIX)' : 'range'} · walls</span><span>{sigma != null ? `1σ ±${fmt(sigma, 0)} pts · ${wp.data?.volSource === 'realized-20d' ? `realized ${((wp.data.annualVol ?? 0) * 100).toFixed(1)}%` : wp.data?.volSource === 'vix' ? `VIX ${((wp.data?.annualVol ?? 0) * 100).toFixed(1)}` : 'est.'}` : ''}</span></div>
              {wp.data && !g.q.isLoading
                ? <WeekMap wp={wp.data} snap={snap} narrow={narrow} />
                : <div className="tl-map-empty">{feedDown ? 'Options feed down — retrying' : 'Reading dealer positioning…'}</div>}
            </div>
            <div className="t-panel">
              <div className="t-panel-head"><span>Market pulse · SPY</span>{spy?.asOf ? <span className="live">{ageLabel(spy.asOf, now)}</span> : <span>no quote</span>}</div>
              <div className="t-price"><span className={spyFlash}>SPY {fmt(spyPx)}</span></div>
              <div className={`t-change${(spy?.changePercent ?? 0) >= 0 ? ' up' : ''}`}>{spy?.changePercent != null ? `${spy.changePercent >= 0 ? '+' : ''}${spy.changePercent.toFixed(2)}% · ${spy.session === 'post' ? 'incl. after-hours' : spy.session === 'pre' ? 'pre-market vs prior close' : rotation.data?.sessionLabel ?? 'session'}` : '—'}</div>
              <div className="t-chart"><Spark bars={spyBars} color={(spy?.changePercent ?? 0) >= 0 ? 'var(--green)' : 'var(--red)'} height={54} /></div>
            </div>
            <div className="t-panel">
              <div className="t-panel-head"><span>The book · {book.ideas.length} live</span>{book.asOf ? <span className="live">{ageLabel(book.asOf, now)}</span> : <span>—</span>}</div>
              {book.ideas.slice(0, 3).map((p) => (
                <Link href={nexusIdeaHref(p)} className="t-signal t-signal-link" key={p.ideaId} title={`Open ${p.symbol} selected on NEXUS`}>
                  <span className="ticker">{p.symbol}</span>
                  <span style={{ fontSize: 'var(--fs-10, 10px)', color: p.direction === 'short' ? 'var(--red)' : 'var(--green)' }}>{p.direction === 'short' ? '▼ short' : '▲ long'}</span>
                  <span className="dir">{convictionDisplayPercent(p.convictionScore ?? 0)}</span>
                </Link>
              ))}
              <div className="t-row"><span className="k">Long / Short</span><span className="v"><span style={{ color: 'var(--green)' }}>{book.longs}</span> / <span style={{ color: 'var(--red)' }}>{book.ideas.length - book.longs}</span></span></div>
            </div>
          </div>
        </div>
      </div>
      <div className="tl-map-foot">Shaded band: SPY’s 1σ weekly move from its last 20 sessions (about 2 weeks in 3 close inside it). The line is a model projection: it leans toward the biggest strike only in long gamma, capped at a quarter of that move. Not a forecast. Walls, magnet and floor are measured.</div>
    </div>
  );
}

/* ════════════ Best idea ════════════ */
export function TodayBestIdeaTool() {
  const cardCharts = useCardCharts();
  const book = useBook();
  const now = useNow();
  const best = book.ideas[0];
  const bestX = useMemo(() => (best ? explain(best) : undefined), [best]);
  const live = best ? book.quote(best.symbol) : undefined;
  useToolReport({
    asOf: book.conv.isError && !book.conv.data ? null : book.asOf,
    note: book.conv.isError ? 'refresh failed' : live?.asOf ? `price ${ageLabel(live.asOf, now)}` : undefined,
    tone: book.conv.isError ? 'warn' : 'ok',
  });
  if (book.conv.isLoading) return <QELoading rows={4} className="fd-pad" label="loading the book…" />;
  if (book.conv.isError && !book.conv.data) return <QEError className="fd-m" title="The idea book didn't load" onRetry={() => book.conv.refetch()} retrying={book.conv.isFetching} />;
  if (!best || !bestX) return <QEEmpty className="fd-m" message="The board is between publishes — ideas appear here the moment they exist." action={<Link href="/t?nx=0dte" className="fd-btn">Open the 0DTE desk</Link>} />;
  return (
    <div className={`${WRAP} td-best`}>
      <div className="feature">
        <div>
          <div className="feature-num">TOP RANKED SETUP · {best.symbol} · {best.direction === 'short' ? 'SHORT' : 'LONG'}{best.optionType ? ` · ${best.optionType.toUpperCase()} ${best.strikePrice ?? ''}` : ''}</div>
          <h3 className="feature-title">{bestX.headline}</h3>
          {bestX.against && <Clamp className="feature-desc" text={`Against it: ${bestX.against}`}><b style={{ color: 'var(--red)' }}>Against it:</b> {bestX.against}</Clamp>}
          <div className="feature-list">
            {bestX.reasons.map((r) => <div className="feature-list-item" key={r}>{CHECK}<div><b>{r}</b></div></div>)}
          </div>
          <div className="tl-ladder"><Ladder p={best} live={book.px(best.symbol)} /></div>
          <div className="hero-actions">
            <Link href={`/r/${best.symbol}`} className="btn btn-primary btn-lg">Full analysis
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
            </Link>
            <Link href={nexusIdeaHref(best)} className="btn btn-ghost btn-lg">Open on NEXUS</Link>
            {/* PROVE before you ACT: the idea's own audit trail (entry evidence, snapshots, outcome). */}
            {best.ideaId && <AuditTrailLink ideaId={best.ideaId} className="btn btn-ghost btn-lg" />}
          </div>
        </div>
        <div className="feature-visual">
          <SigCard p={best as never} chart={cardCharts} />
          {book.ideas[1] && <SigCard p={book.ideas[1] as never} chart={cardCharts} />}
        </div>
      </div>
    </div>
  );
}

/* Mini price charts on the idea cards are OPT-IN (operator 2026-09-29: "no need to
   put charts in all pages … users should have discretion"). One switch for Today,
   remembered on this device (board prefs `sections`). */
const CARD_CHARTS_KEY = 'today:card-charts';
function useCardCharts() { return !!usePrefs().sections[CARD_CHARTS_KEY]; }
function ChartsToggle() {
  const on = useCardCharts();
  return (
    <button type="button" className="td-charts-toggle" aria-pressed={on}
      onClick={() => setPrefs((p) => ({ sections: { ...p.sections, [CARD_CHARTS_KEY]: !on } }))}
      title={on ? 'Hide the 1-month mini charts on the idea cards' : 'Show a 1-month mini chart on each idea card'}>
      {on ? 'Hide mini charts' : '+ Show mini charts'}
    </button>
  );
}

/* ════════════ Ranked book ════════════ */
/** Two rows of three on desktop; the rest of the book lives on NEXUS. */
const BOOK_ROWS = 6;
export function TodayRankedBookTool() {
  const book = useBook();
  const cardCharts = useCardCharts();
  const { hasTool } = useDashboard();
  // The Best idea tool already shows ranks 1–2; without it, the book starts at 1.
  const start = hasTool('today-best-idea') ? 2 : 0;
  const rows = book.ideas.slice(start, start + BOOK_ROWS);
  useToolReport({
    asOf: book.conv.isError && !book.conv.data ? null : book.asOf,
    note: book.conv.isError ? 'refresh failed' : book.ideas.length ? `${book.ideas.length} live · ${book.longs} long / ${book.ideas.length - book.longs} short` : undefined,
    tone: book.conv.isError ? 'warn' : 'ok',
  });
  if (book.conv.isLoading) return <QELoading rows={4} className="fd-pad" label="loading the book…" />;
  if (book.conv.isError && !book.conv.data) return <QEError className="fd-m" title="The idea book didn't load" onRetry={() => book.conv.refetch()} retrying={book.conv.isFetching} />;
  if (!rows.length) {
    return <QEEmpty className="fd-m" message={book.ideas.length ? 'Every live idea is already shown in the Best idea tool.' : 'The board is between publishes — ideas appear here the moment they exist.'}
      action={<Link href={book.ideas.length ? '/t' : '/t?nx=0dte'} className="fd-btn">{book.ideas.length ? 'Open the NEXUS board' : 'Open the 0DTE desk'}</Link>} />;
  }
  const more = book.ideas.length - start - rows.length;
  return (
    <div className={`${WRAP} td-book`}>
      <div className="td-tool-sub" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className="qp-desk-only">Active book · ranked by evidence · #{start + 1}–{start + rows.length}{start ? ' (#1–2 in Best idea)' : ''}</span>
        <ChartsToggle />
      </div>
      <div className="tl-book">
        {rows.map((p) => (
          <div className="tl-book-item" key={p.ideaId}>
            <SigCard p={p as never} chart={cardCharts} />
            <Clamp className="tl-book-why">{explain(p).headline}</Clamp>
          </div>
        ))}
      </div>
      {more > 0 && <Link href="/t" className="td-tool-more">{more} more on the NEXUS board →</Link>}
    </div>
  );
}

/* ════════════ Index desk ════════════ */
export function TodayIndexDeskTool() {
  const q = useIndexDesk();
  const scalps = q.data?.scalps ?? [];
  useToolReport({
    asOf: q.isError && !q.data ? null : q.data ? newest(...scalps.map((s) => s.timestamp)) : undefined,
    note: q.isError ? 'refresh failed' : q.data ? `${q.data.session?.name ?? 'session'}${scalps.length ? '' : ' · no index calls today'}` : undefined,
    tone: q.isError ? 'warn' : 'ok',
  });
  if (q.isLoading) return <QELoading rows={2} className="fd-pad" label="reading the index desk…" />;
  if (q.isError && !q.data) return <QEError className="fd-m" title="Index desk didn't load" onRetry={() => q.refetch()} retrying={q.isFetching} />;
  return (
    <div className={`${WRAP} td-idx`}>
      <div className="td-index-head">
        <div className="qp-desk-only"><b>Index desk</b><span>SPX · SPY · QQQ · IWM</span></div>
        <Link href="/t">Open in Nexus</Link>
      </div>
      <div className="td-index-grid">
        {(['SPX', 'SPY', 'QQQ', 'IWM'] as const).map((symbol) => {
          const play = scalps.find((row) => row.symbol === symbol);
          return (
            <Link href={play ? `/r/${symbol}` : `/r/${symbol}?tab=chart`} className={`td-index-row${play ? ' live' : ''}`} key={symbol}>
              <div><strong>{symbol}</strong><small>{play ? `${play.setup?.replaceAll('_', ' ') ?? 'index setup'}${play.isPowerHour ? ' · power hour' : ''}` : 'monitoring levels'}</small></div>
              <span className={play?.direction === 'short' ? 'down' : play ? 'up' : ''}>{play ? `${play.direction === 'short' ? '▼' : '▲'} ${play.bias}` : 'watch'}</span>
              <b>{play?.confidence != null ? `${Math.round(play.confidence)}/100` : '—'}</b>
              <em>{play?.riskRewardRatio != null ? `${play.riskRewardRatio.toFixed(1)}R` : 'No active call'}</em>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ════════════ Book stats ════════════ */
export function TodayBookStatsTool() {
  const book = useBook();
  const best = book.ideas[0];
  useToolReport({
    asOf: book.conv.isError && !book.conv.data ? null : book.asOf,
    note: book.conv.isError ? 'refresh failed' : undefined,
    tone: book.conv.isError ? 'warn' : 'ok',
  });
  if (book.conv.isError && !book.conv.data) return <QEError className="fd-m" title="The idea book didn't load" onRetry={() => book.conv.refetch()} retrying={book.conv.isFetching} />;
  return (
    <div className={`${WRAP} td-stats`}>
      <div className="stats-grid">
        <div className="stat-item">
          <div className="lstat-val">{book.conv.isLoading ? '—' : book.ideas.length}</div>
          <div className="lstat-label">Live ideas in the book</div>
          <div className="lstat-sub">{book.longs} long · {book.ideas.length - book.longs} short</div>
        </div>
        <div className="stat-item">
          <div className="lstat-val">{best ? convictionDisplayPercent(best.convictionScore ?? 0) : '—'}<span className="td-of">/100</span></div>
          <div className="lstat-label">Top evidence score</div>
          <div className="lstat-sub">{best ? `${best.symbol} · ${best.direction}` : 'waiting for the board'}</div>
        </div>
      </div>
    </div>
  );
}

/* ════════════ Model record ════════════ */
export function TodayModelRecordTool() {
  const perf = usePerf();
  const o = perf.data;
  useToolReport({
    asOf: perf.isError && !perf.data ? null : o?.asOf ?? (perf.dataUpdatedAt ? new Date(perf.dataUpdatedAt).toISOString() : undefined),
    note: perf.isError ? 'refresh failed' : o ? `outcome v2 · since ${o.since}` : undefined,
    tone: perf.isError ? 'warn' : 'ok',
  });
  if (perf.isLoading) return <QELoading rows={2} className="fd-pad" label="loading the record…" />;
  if (perf.isError && !perf.data) return <QEError className="fd-m" title="The model record didn't load" onRetry={() => perf.refetch()} retrying={perf.isFetching} />;
  return (
    <div className={`${WRAP} td-record`}>
      <div className="stats-grid">
        <div className="stat-item">
          <div className="lstat-val">{o?.winRate != null ? `${o.winRate.toFixed(0)}%` : '—'}</div>
          <div className="lstat-label">Win rate, decided ideas</div>
          <div className="lstat-sub">{o?.decided != null ? `${o.wins ?? 0} of ${o.decided} decided${o.winRate == null ? ` · needs ${o.sampleFloor ?? 30}` : ''}` : 'measuring'}</div>
        </div>
        <div className="stat-item">
          <div className="lstat-val">{o?.expectancyR != null ? `${o.expectancyR >= 0 ? '+' : ''}${o.expectancyR.toFixed(2)}R` : '—'}</div>
          <div className="lstat-label">Average per idea</div>
          <div className="lstat-sub">{o?.coveragePct != null ? `${o.coveragePct.toFixed(0)}% of ${o.total ?? 0} published ideas resolved` : 'measuring'}</div>
        </div>
        {o?.runUp && (
          <div className="stat-item" title={o.runUp.label}>
            <div className="lstat-val">{o.runUp.rate != null ? `${o.runUp.rate.toFixed(0)}%` : '—'}</div>
            <div className="lstat-label">Reached +5% before stop</div>
            <div className="lstat-sub">{`${o.runUp.reached5BeforeStop} of ${o.runUp.triggered} triggered · run-up, not the win rate${o.runUp.pending ? ` · ${o.runUp.pending} still measuring` : ''}`}</div>
          </div>
        )}
      </div>
      <Clamp className="cta-sub">
        {o?.decided != null
          ? `Every idea published since ${o.since}: target, stop, or a measured close. Unresolved ideas are counted, never scored.`
          : 'The record is replayed on 5-minute bars, not marked to the close.'}
      </Clamp>
      <div className="cta-actions">
        <Link href="/t?tab=journal&jtab=record" className="btn btn-primary btn-lg">See the track record</Link>
        <Link href="/t" className="btn btn-ghost btn-lg">Open the terminal</Link>
      </div>
    </div>
  );
}

/* ════════════ Rotation ════════════ */
export function TodayRotationTool() {
  const rotation = useRotation();
  const sectors = rotation.data?.sectors ?? [];
  const flows = useMemo(() => {
    const sorted = [...sectors].filter((x) => Number.isFinite(x.relChange)).sort((a, b) => (b.relChange ?? 0) - (a.relChange ?? 0));
    const maxAbs = Math.max(0.1, ...sorted.map((x) => Math.abs(x.relChange ?? 0)));
    return { top: sorted.slice(0, 2), bottom: sorted.slice(-2).reverse(), maxAbs };
  }, [sectors]);
  useToolReport({
    asOf: rotation.isError && !rotation.data ? null : rotation.data ? (rotation.data.asOf ?? null) : undefined,
    note: rotation.isError ? 'refresh failed' : rotation.data?.isStale ? 'stale' : rotation.data?.sessionLabel,
    tone: rotation.isError || rotation.data?.isStale ? 'warn' : 'ok',
  });
  if (rotation.isLoading) return <QELoading rows={3} className="fd-pad" label="mapping sectors…" />;
  if (rotation.isError && !rotation.data) return <QEError className="fd-m" title="Sector rotation didn't load" onRetry={() => rotation.refetch()} retrying={rotation.isFetching} />;
  if (!sectors.length) return <QEEmpty className="fd-m" message="No sector quotes yet this session — check back after the open." action={<button type="button" className="fd-btn" onClick={() => rotation.refetch()} disabled={rotation.isFetching}>{rotation.isFetching ? 'Refreshing…' : 'Refresh'}</button>} />;
  return (
    <div className={`${WRAP} td-rot`}>
      <div className="td-rot-grid">
        <div className="td-rot-read">
          <div className="feature-list">
            <div className="feature-list-item">{CHECK}<div><b>{sectors.length} sectors mapped</b> <span>— {rotation.data?.sessionLabel ?? 'live session'}</span></div></div>
            {flows.top[0] && <div className="feature-list-item">{CHECK}<div><b>Leading: {flows.top[0].name}</b> <span>— {(flows.top[0].relChange ?? 0) >= 0 ? '+' : ''}{(flows.top[0].relChange ?? 0).toFixed(1)}% vs SPY</span></div></div>}
            {flows.bottom[0] && <div className="feature-list-item">{CHECK}<div><b>Lagging: {flows.bottom[0].name}</b> <span>— {(flows.bottom[0].relChange ?? 0).toFixed(1)}% vs SPY</span></div></div>}
          </div>
          {/* the two sectors money is moving into and the two it is leaving, under the read */}
          <div className="flow-viz">
            {[...flows.top.map((x) => ({ x, cls: 'in' as const })), ...flows.bottom.map((x) => ({ x, cls: 'out' as const }))].map(({ x, cls }) => (
              <div className="lflow-row" key={x.etf}>
                <div className="lflow-sym" style={{ color: cls === 'in' ? 'var(--green)' : 'var(--red)' }}>{x.etf}</div>
                <div className="lflow-bar"><div className={`lflow-fill ${cls}`} style={{ width: `${Math.min(95, Math.abs(x.relChange ?? 0) / flows.maxAbs * 95)}%` }} /></div>
                <div className={`lflow-val ${cls}`}>{(x.relChange ?? 0) >= 0 ? '+' : ''}{(x.relChange ?? 0).toFixed(1)}%</div>
              </div>
            ))}
          </div>
        </div>
        <div className="feature-visual">
          <div className="rot-map">
            <RotQuad sectors={sectors} />
            <div className="rot-label tl">Leading</div>
            <div className="rot-label tr">Improving</div>
            <div className="rot-label bl">Weakening</div>
            <div className="rot-label br">Lagging</div>
            <div className="rot-axis x">x · rel strength →</div>
            <div className="rot-axis y">y · momentum →</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════ Crypto pulse ════════════
   The majors at a glance — the same /api/crypto/pulse read as the tape (one
   request), numbers large, each with its 24h and 7-day change. */
export function TodayCryptoTool() {
  const pulse = usePulse();
  const now = useNow();
  const assets = (pulse.data?.assets ?? []).slice(0, 4);
  useToolReport({
    asOf: pulse.isError && !pulse.data ? null : pulse.data ? (pulse.data.asOf ?? (pulse.dataUpdatedAt ? new Date(pulse.dataUpdatedAt).toISOString() : null)) : undefined,
    note: pulse.isError ? (pulse.data ? 'refresh failed · showing last read' : 'feed failed') : '24h change',
    tone: pulse.isError ? 'warn' : 'ok',
  });
  if (pulse.isLoading) return <QELoading rows={2} className="fd-pad" label="reading crypto…" />;
  if (pulse.isError && !pulse.data) return <QEError className="fd-m" title="Crypto pulse didn't load" onRetry={() => pulse.refetch()} retrying={pulse.isFetching} />;
  if (!assets.length) return <QEEmpty className="fd-m" message="No crypto quotes came back. Retry in a minute." action={<button type="button" className="fd-btn" onClick={() => pulse.refetch()} disabled={pulse.isFetching}>Refresh</button>} />;
  return (
    <div className={`${WRAP} td-crypto`}>
      {pulse.isError && <QEStale what="refresh crypto" updatedAt={pulse.dataUpdatedAt} onRetry={() => pulse.refetch()} retrying={pulse.isFetching} />}
      <div className="td-crypto-grid">
        {assets.map((a) => <CryptoCell key={a.symbol} a={a} />)}
      </div>
      <Link href="/t?tab=crypto" className="td-tool-more" title={pulse.data?.asOf ? `Crypto pulse ${ageLabel(pulse.data.asOf, now)}` : undefined}>Open the crypto desk →</Link>
    </div>
  );
}
type PulseAsset = { symbol: string; name?: string; price: number; change24h?: number | null; change7d?: number | null; high24h?: number | null; low24h?: number | null };
function CryptoCell({ a }: { a: PulseAsset }) {
  const pxFlash = useTickFlash(a.price, { resetKey: a.symbol });
  const ch = a.change24h ?? null;
  const d = a.price >= 1000 ? 0 : a.price >= 10 ? 2 : 4;
  return (
    <div className="td-crypto-cell">
      <div className="td-crypto-sym"><b>{a.symbol}</b>{a.name && <span>{a.name}</span>}</div>
      <div className={`td-crypto-px ${pxFlash}`}>${fmt(a.price, d)}</div>
      <div className="td-crypto-chg">
        <span className={ch == null ? '' : ch >= 0 ? 'up' : 'down'}>{ch == null ? '—' : `${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%`}<small> 24h</small></span>
        {a.change7d != null && <span className={a.change7d >= 0 ? 'up' : 'down'}>{a.change7d >= 0 ? '+' : ''}{a.change7d.toFixed(1)}%<small> 7d</small></span>}
      </div>
    </div>
  );
}

/* ════════════ Sector & crypto tape ════════════ */
/** One tape item; its % (and crypto price) flash on a live change (lib/use-tick-flash.ts). */
function TapeItem({ t }: { t: { sym: string; price: string; px: number | null; chg: number } }) {
  const chgFlash = useTickFlash(t.chg, { resetKey: t.sym });
  const pxFlash = useTickFlash(t.px, { resetKey: t.sym });
  return (
    <div className="ltape-item">
      <span className="ltape-sym">{t.sym}</span>
      {t.price && <span className={`ltape-price ${pxFlash}`}>{t.price}</span>}
      <span className={`ltape-chg ${t.chg >= 0 ? 'up' : 'down'} ${chgFlash}`}>{t.chg >= 0 ? '+' : ''}{t.chg.toFixed(2)}%</span>
      <span className="ltape-sep">·</span>
    </div>
  );
}

export function TodayTapeTool() {
  const rotation = useRotation();
  const pulse = usePulse();
  const [paused, setPaused] = useState(false);
  const tape = useMemo(() => {
    const rows: { sym: string; price: string; px: number | null; chg: number }[] = [];
    (rotation.data?.sectors ?? []).forEach((x) => rows.push({ sym: x.etf, price: '', px: null, chg: x.change }));
    (pulse.data?.assets ?? []).forEach((x) => rows.push({ sym: x.symbol, price: `$${Math.round(x.price).toLocaleString()}`, px: x.price, chg: x.change24h ?? 0 }));
    return rows;
  }, [rotation.data, pulse.data]);
  const bothDown = rotation.isError && pulse.isError;
  useToolReport({
    asOf: bothDown ? null : rotation.data || pulse.data ? newest(rotation.data?.asOf, pulse.data?.asOf) : undefined,
    note: rotation.isError ? 'sectors failed' : pulse.isError ? 'crypto failed' : rotation.data?.isStale ? 'sectors stale' : 'sectors: session % · crypto: 24h %',
    tone: rotation.isError || pulse.isError || rotation.data?.isStale ? 'warn' : 'ok',
  });
  if (rotation.isLoading && pulse.isLoading) return <QELoading rows={1} className="fd-pad" label="loading the tape…" />;
  if (bothDown) return <QEError className="fd-m" title="The tape didn't load" onRetry={() => { void rotation.refetch(); void pulse.refetch(); }} retrying={rotation.isFetching || pulse.isFetching} />;
  if (!tape.length) return <QEEmpty className="fd-m" message="No sector or crypto quotes yet — check back after the open." action={<button type="button" className="fd-btn" onClick={() => { void rotation.refetch(); void pulse.refetch(); }}>Refresh</button>} />;
  return (
    <div className={`${WRAP} td-tape`}>
      <div className="ltape" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        <div className={`ltape-track${paused ? ' paused' : ''}`}>
          {[...tape, ...tape].map((t, i) => <TapeItem key={i} t={t} />)}
        </div>
      </div>
    </div>
  );
}

/* ════════════ Pre-market gap strip ════════════
   Re-homed from the retired Slate page (PreMarketGappersCard). The gap is the
   LEADING direction read before the open (operator rule): a gap with an idea
   confirms it, a gap against it means the setup may already have moved. Open
   04:00–09:30 ET; outside it the strip collapses to one stamped line and only
   reads the feed when asked. Source + per-name age come from the server. */
interface GapRow { symbol: string; price: number; previousClose: number; gapPct: number; preMarketGapPct?: number | null; direction: 'up' | 'down' | 'flat'; phase: GapPhase; isWeekly: boolean; fetchedAt?: string; setup?: PmSetupMark | null }
interface GapPayload { phase: GapPhase; scanned: number; gappers: GapRow[]; generatedAt?: string; oldestFetchedAt?: string | null; source?: string }
const PM_SHOW = 12;

export function TodayPremarketTool() {
  const now = useNow(30_000);
  const inWindow = isPreMarketWindow(new Date(now));
  const [asked, setAsked] = useState(false);
  const [all, setAll] = useState(false);
  const show = inWindow || asked;
  const q = useQuery<GapPayload>({
    queryKey: ['/api/premarket/gappers', 'all'], queryFn: fetchJson('/api/premarket/gappers?minGapPct=0'),
    enabled: show, refetchInterval: show ? 60_000 : false, staleTime: 30_000, retry: 1,
  });
  const book = useBook();
  const dirOf = useMemo(() => new Map(book.ideas.map((p) => [p.symbol, p.direction ?? 'long'] as const)), [book.ideas]);
  const rows = useMemo(() => {
    const g = q.data?.gappers ?? [];
    const planned = new Set(g.filter((r) => r.setup).map((r) => r.symbol));
    return rankGappers(g, (s) => dirOf.has(s) || planned.has(s));
  }, [q.data, dirOf]);
  const phase: GapPhase = q.data?.phase ?? (inWindow ? 'pre_market' : 'closed');
  const asOf = q.data ? (q.data.oldestFetchedAt ?? q.data.generatedAt ?? null) : null;
  const hasSetups = rows.some((r) => r.setup);
  const rec = useQuery<{ record: PmRecord }>({
    queryKey: ['/api/premarket/ideas'], queryFn: fetchJson('/api/premarket/ideas'),
    enabled: show && hasSetups, staleTime: 5 * 60_000, retry: 0,
  });
  useToolReport({
    asOf: !show ? null : q.isError && !q.data ? null : q.data ? asOf : undefined,
    source: q.data?.source ?? 'Yahoo pre/post quotes · /api/premarket/gappers',
    note: !show ? 'opens 04:00 ET' : q.isError ? (q.data ? 'refresh failed · showing last read' : 'feed failed') : q.data ? `${GAP_BASIS[phase]} · ${q.data.scanned} names` : undefined,
    tone: q.isError ? 'warn' : 'ok',
  });

  if (!show) {
    return (
      <div className={`${WRAP} td-pm td-pm-closed`}>
        <Clamp className="td-pm-line" text="Pre-market gaps show 04:00–09:30 ET — the leading direction read before the open. Not read this session.">
          <b>Pre-market</b> gaps show 04:00–09:30 ET — the leading direction read before the open.
          {q.data ? <> Last read {ageLabel(asOf, now)} ({GAP_BASIS[q.data.phase]}).</> : ' Not read this session.'}
        </Clamp>
        <button type="button" className="fd-btn" onClick={() => setAsked(true)}>Show current gaps</button>
      </div>
    );
  }
  if (q.isLoading) return <QELoading rows={1} className="fd-pad" label="reading pre-market quotes…" />;
  if (q.isError && !q.data) return <QEError className="fd-m" title="Pre-market quotes didn't load" onRetry={() => q.refetch()} retrying={q.isFetching} />;
  if (!rows.length) return <QEEmpty className="fd-m" message={`No quotes returned for the ${q.data?.scanned ?? 0} names scanned.`} action={<button type="button" className="fd-btn" onClick={() => q.refetch()} disabled={q.isFetching}>Refresh</button>} />;
  const shown = all ? rows : rows.slice(0, PM_SHOW);
  return (
    <div className={`${WRAP} td-pm`}>
      <div className="td-pm-head">
        <span className="td-tool-sub qp-desk-only" style={{ margin: 0 }}>{phase === 'pre_market' ? 'Pre-market' : 'Gaps'} · {GAP_BASIS[phase]}</span>
        {q.isError && <QEStale what="refresh pre-market" updatedAt={q.dataUpdatedAt} onRetry={() => q.refetch()} retrying={q.isFetching} />}
        {!inWindow && <button type="button" className="td-pm-hide" onClick={() => setAsked(false)}>Hide</button>}
      </div>
      <div className="td-pm-chips qp-row">
        {shown.map((g) => {
          const dir = dirOf.get(g.symbol);
          const al = dir ? gapAlignment(g.gapPct, dir) : 'flat';
          const cls = Math.abs(g.gapPct) < GAP_FLAT_PCT ? 'flat' : g.gapPct > 0 ? 'up' : 'down';
          return (
            <span key={g.symbol} className="td-pm-cell">
            <Link href={`/r/${encodeURIComponent(g.symbol)}`} className={`td-pm-chip ${cls}`}
              title={`${g.symbol} $${g.price.toFixed(2)} vs prior close $${g.previousClose.toFixed(2)} · ${GAP_BASIS[g.phase]}${g.fetchedAt ? ` · ${ageLabel(g.fetchedAt, now)}` : ''}${dir ? ` · book: ${dir}` : ''}${g.isWeekly ? ' · weekly watchlist' : ''}`}>
              {g.isWeekly && <span aria-label="weekly watchlist">★</span>}
              <b>{g.symbol}</b>
              <span className="v">{g.gapPct >= 0 ? '+' : ''}{g.gapPct.toFixed(2)}%</span>
              {dir && al !== 'flat' && <em className={al}>{al === 'confirms' ? `confirms ${dir}` : `against ${dir}`}</em>}
            </Link>
            {g.setup && (
              <Link href={nexusIdeaHref({ ideaId: g.setup.ideaId, symbol: g.symbol })} className={`td-pm-setup ${g.setup.status}`}
                title={`Pre-market setup${g.setup.status === 'triggered' ? ' — triggered, open in NEXUS' : ' — WATCH for the open'}: ${g.setup.summary} · measuring (unproven)`}>
                setup {pmSetupMarker(g.setup)}
              </Link>
            )}
            </span>
          );
        })}
        {rows.length > PM_SHOW && <button type="button" className="td-pm-more" onClick={() => setAll((v) => !v)}>{all ? 'Fewer' : `+${rows.length - PM_SHOW} more`}</button>}
      </div>
      {hasSetups && <div className="td-pm-rec" title="Resolved pre-market ideas only. Unproven setups — gap/breakout scores failed a 753-session walk-forward test.">{pmRecordLine(rec.data?.record)}</div>}
      <PhoneNote label="How to read gaps"><p className="td-pm-foot">A gap with a book idea confirms it; against it, the setup may already have moved without you. Book names first, then your weekly watchlist (★).</p></PhoneNote>
    </div>
  );
}
