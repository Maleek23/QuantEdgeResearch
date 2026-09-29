/**
 * TODAY tools — the /today page split into dashboard tools (2026-09-29).
 *
 * The page's landing graphic language is kept: each tool body wraps in
 * `.landing .today-l .td-tool` so nexus.css (landing blocks) and today.css
 * (dealer map, ladder, index desk) style it exactly as before, with the
 * tile-fit overrides in today.css under `.td-tool`. Data + drawing pieces
 * live in today-model.tsx; every tool shares its queries.
 */
import { useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { convictionDisplayPercent } from '@shared/conviction-display';
import { Spark, RotQuad, SigCard, CHECK } from '@/components/landing/live-widgets';
import { QEEmpty, QEError, QELoading } from '@/components/ui/qe-states';
import { AuditTrailLink } from '@/pages/today';
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
  const shortGamma = wp.data?.regime?.includes('negative');
  const sigma = wp.data?.expectedMove;
  const spy = book.quote('SPY');
  // Live SPY only — the model's start price is publish-time and never shown as "now".
  const spyPx = spy?.price ?? spy?.lastPrice;
  const refPx = spyPx ?? wp.data?.spotPrice;
  const spyBars = spyIntra.data?.data ?? [];
  const pinClose = magnet != null && sigma != null && spyPx != null && Math.abs(magnet - spyPx) <= 0.75 * sigma;
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
          <div className="hero-eyebrow"><span className="pill">TODAY</span>Index desk{weekOf ? ` · week of ${weekOf}` : ''}</div>
          {feedDown ? (
            <h1 className="hero-title">Options positioning is unavailable.</h1>
          ) : !wp.data ? (
            <h1 className="hero-title">Reading the dealer map…</h1>
          ) : (
            <h1 className="hero-title">
              SPY is in <span className="grad">{shortGamma ? 'short' : 'long'} gamma</span>. Moves get {shortGamma ? 'amplified' : 'dampened'}.
              {sigma != null
                ? <span className="accent"> {pinClose && !shortGamma ? `Price is near the ${fmt(magnet, 0)} magnet.` : `Weekly range: ±${fmt(sigma, 0)} points.`}</span>
                : null}
            </h1>
          )}
          <p className="hero-sub">
            {feedDown
              ? 'We only draw the map from measured positioning. It comes back the moment the feed does — this tool retries every 30 seconds.'
              : !wp.data ? ''
              : `${shortGamma
                ? 'Short-gamma dealers sell into drops and buy into rips, so ranges widen.'
                : 'Long-gamma dealers buy dips and sell rips, so ranges tighten.'}${sigma != null && refPx ? ` ${wp.data.volSource === 'realized-20d' ? 'Lately SPY has moved' : 'Expect'} about ±${fmt(sigma, 0)} points (${fmt(sigma / refPx * 100, 1)}%) in a typical week${wp.data.volSource === 'realized-20d' ? `${wp.data.impliedVol && spyPx ? ` — options price more, ±${fmt(spyPx * wp.data.impliedVol * Math.sqrt(5 / 252), 0)}` : ''}` : wp.data.volSource === 'vix' ? ' (from VIX)' : ' (estimated)'}.` : ''}${magnet && sigma != null && spyPx != null && !pinClose ? ` The biggest strike, ${fmt(magnet, 0)}, is ${fmt(Math.abs(magnet - spyPx), 0)} points away — further than dealers usually drag price in a week.` : ''}`}
          </p>
          <div className="hero-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={toBest} title={hasTool('today-best-idea') ? 'Scroll to the Best idea tool' : editable ? 'Add the Best idea tool to this dashboard' : 'Open the ranked setups on NEXUS'}>
              Today&rsquo;s best idea
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
            </button>
            <Link href="/t?tab=gex" className="btn btn-ghost btn-lg">Full GEX surface</Link>
          </div>
          <div className="tl-keys" title={g.asOf ? `Measured SPY dealer levels · ${ageLabel(g.asOf, now)}` : 'Measured SPY dealer levels'}>
            {([['Magnet', magnet, 'max gamma', 'mag'], ['Ceiling', snap?.callWall, 'call wall', 'up'], ['Floor', snap?.putWall, 'put wall', 'dn']] as const).map(([k, v, sub, cls]) => (
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
              <div className="t-panel-head"><span>This week · implied range · walls</span><span>{sigma != null ? `1σ ±${fmt(sigma, 0)} pts · ${wp.data?.volSource === 'realized-20d' ? `realized ${((wp.data.annualVol ?? 0) * 100).toFixed(1)}%` : wp.data?.volSource === 'vix' ? `VIX ${((wp.data?.annualVol ?? 0) * 100).toFixed(1)}` : 'est.'}` : ''}</span></div>
              {wp.data && !g.q.isLoading
                ? <WeekMap wp={wp.data} snap={snap} narrow={narrow} />
                : <div className="tl-map-empty">{feedDown ? 'Options feed down — retrying' : 'Reading dealer positioning…'}</div>}
            </div>
            <div className="t-panel">
              <div className="t-panel-head"><span>Market pulse · SPY</span>{spy?.asOf ? <span className="live">{ageLabel(spy.asOf, now)}</span> : <span>no quote</span>}</div>
              <div className="t-price">SPY {fmt(spyPx)}</div>
              <div className={`t-change${(spy?.changePercent ?? 0) >= 0 ? ' up' : ''}`}>{spy?.changePercent != null ? `${spy.changePercent >= 0 ? '+' : ''}${spy.changePercent.toFixed(2)}% · ${rotation.data?.sessionLabel ?? 'session'}` : '—'}</div>
              <div className="t-chart"><Spark bars={spyBars} color={(spy?.changePercent ?? 0) >= 0 ? '#6ee7b7' : '#ff6b3d'} height={54} /></div>
            </div>
            <div className="t-panel">
              <div className="t-panel-head"><span>The book · {book.ideas.length} live</span>{book.asOf ? <span className="live">{ageLabel(book.asOf, now)}</span> : <span>—</span>}</div>
              {book.ideas.slice(0, 3).map((p) => (
                <div className="t-signal" key={p.ideaId}>
                  <span className="ticker">{p.symbol}</span>
                  <span style={{ fontSize: 'var(--fs-10, 10px)', color: p.direction === 'short' ? 'var(--red)' : 'var(--green)' }}>{p.direction === 'short' ? '▼ short' : '▲ long'}</span>
                  <span className="dir">{convictionDisplayPercent(p.convictionScore ?? 0)}</span>
                </div>
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
  if (!best || !bestX) return <QEEmpty className="fd-m" message="The board is between publishes — ideas appear here the moment they exist." />;
  return (
    <div className={`${WRAP} td-best`}>
      <div className="feature">
        <div>
          <div className="feature-num">TOP RANKED SETUP · {best.symbol} · {best.direction === 'short' ? 'SHORT' : 'LONG'}{best.optionType ? ` · ${best.optionType.toUpperCase()} ${best.strikePrice ?? ''}` : ''}</div>
          <h3 className="feature-title">{bestX.headline}</h3>
          {bestX.against && <p className="feature-desc"><b style={{ color: 'var(--red)' }}>Against it:</b> {bestX.against}</p>}
          <div className="feature-list">
            {bestX.reasons.map((r) => <div className="feature-list-item" key={r}>{CHECK}<div><b>{r}</b></div></div>)}
          </div>
          <div className="tl-ladder"><Ladder p={best} live={book.px(best.symbol)} /></div>
          <div className="hero-actions">
            <Link href={`/r/${best.symbol}`} className="btn btn-primary btn-lg">Full analysis
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
            </Link>
            {/* PROVE before you ACT: the idea's own audit trail (entry evidence, snapshots, outcome). */}
            {best.ideaId && <AuditTrailLink ideaId={best.ideaId} className="btn btn-ghost btn-lg" />}
          </div>
        </div>
        <div className="feature-visual">
          <SigCard p={best as never} />
          {book.ideas[1] && <SigCard p={book.ideas[1] as never} />}
        </div>
      </div>
    </div>
  );
}

/* ════════════ Ranked book ════════════ */
const BOOK_ROWS = 9;
export function TodayRankedBookTool() {
  const book = useBook();
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
    return <QEEmpty className="fd-m" message={book.ideas.length ? 'Every live idea is already shown in the Best idea tool.' : 'The board is between publishes — ideas appear here the moment they exist.'} />;
  }
  const more = book.ideas.length - start - rows.length;
  return (
    <div className={`${WRAP} td-book`}>
      <div className="td-tool-sub">Active book · ranked by evidence · #{start + 1}–{start + rows.length}{start ? ' (#1–2 in Best idea)' : ''}</div>
      <div className="tl-book">
        {rows.map((p) => (
          <div className="tl-book-item" key={p.ideaId}>
            <SigCard p={p as never} />
            <p className="tl-book-why">{explain(p).headline}</p>
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
        <div><b>Index desk</b><span>SPX · SPY · QQQ · IWM</span></div>
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
  const o = perf.data?.overall;
  useToolReport({
    // The stats payload carries no timestamp: this is when the server computed
    // it for us (its cache holds a result for up to 5 minutes).
    asOf: perf.isError && !perf.data ? null : perf.dataUpdatedAt ? new Date(perf.dataUpdatedAt).toISOString() : undefined,
    note: perf.isError ? 'refresh failed' : perf.data ? 'fetched · server cache ≤5m' : undefined,
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
          <div className="lstat-sub">{o?.winRateDecided != null ? `n = ${o.winRateDecided} hit target or stop` : 'measuring'}</div>
        </div>
        <div className="stat-item">
          <div className="lstat-val">{o?.expectancy != null ? `${o.expectancy >= 0 ? '+' : ''}${o.expectancy.toFixed(2)}%` : '—'}</div>
          <div className="lstat-label">Average per idea</div>
          <div className="lstat-sub">{o?.profitFactor != null ? `profit factor ${o.profitFactor.toFixed(2)}` : 'measuring'}</div>
        </div>
      </div>
      <p className="cta-sub">
        {o?.winRate != null && o.winRateDecided != null
          ? `${o.winRate.toFixed(0)}% of ${o.winRateDecided} decided ideas hit target before stop. Losers stay on the record, and every rate carries its sample size.`
          : 'The record is replayed on 5-minute bars, not marked to the close.'}
      </p>
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
  if (!sectors.length) return <QEEmpty className="fd-m" message="No sectors returned for this session." />;
  return (
    <div className={`${WRAP} td-rot`}>
      <div className="td-rot-grid">
      <div className="feature-list">
        <div className="feature-list-item">{CHECK}<div><b>{sectors.length} sectors mapped</b> <span>— {rotation.data?.sessionLabel ?? 'live session'}</span></div></div>
        {flows.top[0] && <div className="feature-list-item">{CHECK}<div><b>Leading: {flows.top[0].name}</b> <span>— {(flows.top[0].relChange ?? 0) >= 0 ? '+' : ''}{(flows.top[0].relChange ?? 0).toFixed(1)}% vs SPY</span></div></div>}
        {flows.bottom[0] && <div className="feature-list-item">{CHECK}<div><b>Lagging: {flows.bottom[0].name}</b> <span>— {(flows.bottom[0].relChange ?? 0).toFixed(1)}% vs SPY</span></div></div>}
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
      </div>
    </div>
  );
}

/* ════════════ Sector & crypto tape ════════════ */
export function TodayTapeTool() {
  const rotation = useRotation();
  const pulse = usePulse();
  const [paused, setPaused] = useState(false);
  const tape = useMemo(() => {
    const rows: { sym: string; price: string; chg: number }[] = [];
    (rotation.data?.sectors ?? []).forEach((x) => rows.push({ sym: x.etf, price: '', chg: x.change }));
    (pulse.data?.assets ?? []).forEach((x) => rows.push({ sym: x.symbol, price: `$${Math.round(x.price).toLocaleString()}`, chg: x.change24h ?? 0 }));
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
  if (!tape.length) return <QEEmpty className="fd-m" message="No sector or crypto quotes returned." />;
  return (
    <div className={`${WRAP} td-tape`}>
      <div className="ltape" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        <div className={`ltape-track${paused ? ' paused' : ''}`}>
          {[...tape, ...tape].map((t, i) => (
            <div className="ltape-item" key={i}>
              <span className="ltape-sym">{t.sym}</span>
              {t.price && <span className="ltape-price">{t.price}</span>}
              <span className={`ltape-chg ${t.chg >= 0 ? 'up' : 'down'}`}>{t.chg >= 0 ? '+' : ''}{t.chg.toFixed(2)}%</span>
              <span className="ltape-sep">·</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
