/**
 * TODAY — the signed-in home, hand-composed in the landing page's graphic
 * language (restored 2026-09-30 from the pre-dashboard page, ecf8f177;
 * operator: "Today still has the Bullflow look — just go back to the last
 * design"). No dashboard frame, no tool tiles, no section header bars: one
 * reading column of landing bands, in order —
 *
 *   1. The week, in one sentence and one chart — the Skylit-style dealer map
 *      (measured GEX levels + the model's projected path). It leads.
 *   2. The tape, the pre-market gap strip (04:00–09:30 ET), the index desk
 *      and the 0DTE ideas (compact; the desk itself is NEXUS → 0DTE).
 *   3. The book in numbers, the single best idea, the ranked setups.
 *   4. Sector rotation, sector ignition (four horizons), then the honest model record.
 *
 * Data is today's canonical wiring (tools/today/today-model.tsx — the same
 * query keys NEXUS and GEX use, so nothing is fetched twice): the live
 * /api/quotes/batch quote with its own source + age (never the model's
 * publish-time start price as "now"), the shared gex-regime rule ("Put pivot"
 * when the max-|γ| strike is put-dominated, never a "magnet"), and the model
 * record from /api/performance/model-record. A failed refresh keeps the last
 * read on screen with an amber stamp; a failed first read says so in place.
 *
 * Integrity: only MEASURED dealer levels are drawn; the path is a model
 * projection labelled "not a forecast".
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { regimeFromLegacy } from '@shared/gex-regime';
import { convictionDisplayPercent } from '@shared/conviction-display';
import { Spark, RotQuad, SigCard, CHECK, fetchJson } from '@/components/landing/live-widgets';
import { QEStale } from '@/components/ui/qe-states';
import { Clamp, InfoSheet, QuoteFreshChip } from '@/components/ui/qe-phone';
import { useQuotes, type Quote as TickerQuote } from '@/components/ticker/ticker-data';
import { setPrefs, usePrefs } from '@/lib/board-prefs';
import { nexusIdeaHref } from '@/lib/nexus-link';
import { useTickFlash } from '@/lib/use-tick-flash';
import { useTheme } from '@/components/theme-provider';
import { GAP_BASIS, GAP_FLAT_PCT, gapAlignment, isPreMarketWindow, rankGappers, pmRecordLine, pmSetupHref, pmSetupLabel, pmSetupTitle, type GapPhase, type PmRecord, type PmSetupMark } from '@/lib/premarket';
import { ageLabel } from '@/components/dashboard/tools/flow/tape';
import { recordLine, type DeskIdea } from '@/components/zerodte/zero-dte-ideas';
import { useZeroDteDesk } from '@/components/zerodte/zero-dte-desk';
import { SectorIgnitionBand } from '@/components/sector-ignition/sector-ignition';
import { RotationIdeasRow } from '@/components/sectors/rotation-ideas';
import {
  BOARD_ORDER_LABEL, Ladder, WeekMap, explain, fmt, newest,
  useBook, useElementWidth, useIndexDesk, usePerf, usePulse, useRotation, useSpyGex, useSpyIntraday, useWeeklyPath,
} from '@/components/dashboard/tools/today/today-model';
import '@/styles/nexus.css';
import '@/styles/today.css';

/**
 * PROVE before you ACT: an idea's own audit trail (entry evidence, snapshots,
 * outcome). The page that owns the "check an idea's evidence" workflow (W4)
 * carries the link; the TODAY dashboard tools import it too.
 */
/** The weekly dealer map's method note (behind the map's ⓘ; was a caption under the hero). */
const MAP_NOTE = (magnetIsPut: boolean) =>
  `Shaded band: SPY’s 1σ weekly move from its last 20 sessions (about 2 weeks in 3 close inside it). The line is a model projection: it leans toward the biggest strike only in long gamma, capped at a quarter of that move. Not a forecast. Walls, ${magnetIsPut ? 'pivot' : 'magnet'} and floor are measured.`;

export function AuditTrailLink({ ideaId, className }: { ideaId: string; className?: string }) {
  return <Link href={`/trade-ideas/${encodeURIComponent(ideaId)}/audit`} className={className}>Audit trail</Link>;
}

function useNow(everyMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), everyMs); return () => clearInterval(id); }, [everyMs]);
  return now;
}

/** One quiet line under a band: what it is and how old — or, when the last refresh failed, an amber stale stamp. */
function Stamp({ asOf, now, label, failed, onRetry, retrying, updatedAt }: {
  asOf?: string | null; now: number; label?: string; failed?: boolean; onRetry?: () => void; retrying?: boolean; updatedAt?: number;
}) {
  if (failed) return <QEStale className="tl-stale" what={label ? `refresh ${label}` : 'refresh'} updatedAt={updatedAt} onRetry={onRetry} retrying={retrying} />;
  if (!asOf) return null;
  return <span className="tl-stamp">{label ? `${label} · ` : ''}{ageLabel(asOf, now)}</span>;
}

/** Mini charts on the idea cards are opt-in (operator 2026-09-29), remembered on this device. */
const CARD_CHARTS_KEY = 'today:card-charts';
function useCardCharts() { return !!usePrefs().sections[CARD_CHARTS_KEY]; }

// ── pre-market gap strip ───────────────────────────────────────────────────
interface GapRow { symbol: string; price: number; previousClose: number; gapPct: number; direction: 'up' | 'down' | 'flat'; phase: GapPhase; isWeekly: boolean; fetchedAt?: string; setup?: PmSetupMark | null }
interface GapPayload { phase: GapPhase; scanned: number; gappers: GapRow[]; generatedAt?: string; oldestFetchedAt?: string | null; source?: string }
const PM_SHOW = 10;

function PremarketStrip({ dirOf, now }: { dirOf: Map<string, string>; now: number }) {
  const inWindow = isPreMarketWindow(new Date(now));
  const [asked, setAsked] = useState(false);
  const [all, setAll] = useState(false);
  const show = inWindow || asked;
  const q = useQuery<GapPayload>({
    queryKey: ['/api/premarket/gappers', 'all'], queryFn: fetchJson('/api/premarket/gappers?minGapPct=0'),
    enabled: show, refetchInterval: show ? 60_000 : false, staleTime: 30_000, retry: 1,
  });
  const rows = useMemo(() => {
    const g = q.data?.gappers ?? [];
    const planned = new Set(g.filter((r) => r.setup).map((r) => r.symbol));
    return rankGappers(g, (s) => dirOf.has(s) || planned.has(s));
  }, [q.data, dirOf]);
  const phase: GapPhase = q.data?.phase ?? (inWindow ? 'pre_market' : 'closed');
  const asOf = q.data ? (q.data.oldestFetchedAt ?? q.data.generatedAt ?? null) : null;
  const shown = all ? rows : rows.slice(0, PM_SHOW);
  const hasSetups = rows.some((r) => r.setup);
  const rec = useQuery<{ record: PmRecord }>({
    queryKey: ['/api/premarket/ideas'], queryFn: fetchJson('/api/premarket/ideas'),
    enabled: show && hasSetups, staleTime: 5 * 60_000, retry: 0,
  });

  return (
    <section className="tl-pm" aria-label="Pre-market gaps">
      <div className="container">
        <div className="tl-pm-head">
          <span className="tl-kicker">Pre-market</span>
          {!show ? (
            <>
              <span className="tl-pm-line">Gaps vs the prior close show 04:00–09:30 ET — the leading direction read before the open.</span>
              <button type="button" className="tl-link-btn" onClick={() => setAsked(true)}>Show current gaps</button>
            </>
          ) : (
            <>
              <span className="tl-pm-line">{GAP_BASIS[phase]}{q.data ? ` · ${q.data.scanned} names` : ''}</span>
              <Stamp asOf={asOf} now={now} label="quotes" failed={q.isError && !!q.data} onRetry={() => q.refetch()} retrying={q.isFetching} updatedAt={q.dataUpdatedAt} />
              {!inWindow && <button type="button" className="tl-link-btn" onClick={() => setAsked(false)}>Hide</button>}
            </>
          )}
        </div>
        {show && (
          q.isLoading ? <div className="tl-band-msg">Reading pre-market quotes…</div>
          : q.isError && !q.data ? <div className="tl-band-msg">Pre-market quotes didn&rsquo;t load. <button type="button" className="tl-link-btn" onClick={() => q.refetch()}>Retry</button></div>
          : !rows.length ? <div className="tl-band-msg">No quotes returned for the {q.data?.scanned ?? 0} names scanned.</div>
          : (
            <div className="tl-pm-chips">
              {shown.map((gp) => {
                const dir = dirOf.get(gp.symbol);
                const al = dir ? gapAlignment(gp.gapPct, dir) : 'flat';
                const cls = Math.abs(gp.gapPct) < GAP_FLAT_PCT ? 'flat' : gp.gapPct > 0 ? 'up' : 'down';
                return (
                  <span key={gp.symbol} className="tl-pm-cell">
                  <Link href={`/r/${encodeURIComponent(gp.symbol)}`} className={`tl-pm-chip ${cls}`}
                    title={`${gp.symbol} $${gp.price.toFixed(2)} vs prior close $${gp.previousClose.toFixed(2)} · ${GAP_BASIS[gp.phase]}${gp.fetchedAt ? ` · ${ageLabel(gp.fetchedAt, now)}` : ''}${dir ? ` · book: ${dir}` : ''}${gp.isWeekly ? ' · weekly watchlist' : ''}`}>
                    {gp.isWeekly && <span aria-label="weekly watchlist">★</span>}
                    <b>{gp.symbol}</b>
                    <span className="v">{gp.gapPct >= 0 ? '+' : ''}{gp.gapPct.toFixed(2)}%</span>
                    {dir && al !== 'flat' && <em className={al}>{al === 'confirms' ? `confirms ${dir}` : `against ${dir}`}</em>}
                  </Link>
                  {gp.setup && (
                    <Link href={pmSetupHref(gp.symbol, gp.setup)} className={`tl-pm-setup ${gp.setup.status}`}
                      title={pmSetupTitle(gp.setup)}>
                      {pmSetupLabel(gp.setup)}
                    </Link>
                  )}
                  </span>
                );
              })}
              {rows.length > PM_SHOW && <button type="button" className="tl-pm-more" onClick={() => setAll((v) => !v)}>{all ? 'Fewer' : `+${rows.length - PM_SHOW} more`}</button>}
              {hasSetups && <span className="tl-pm-rec" title="Resolved pre-market ideas only. Unproven setups — gap/breakout scores failed a 753-session walk-forward test.">{pmRecordLine(rec.data?.record)}</span>}
            </div>
          )
        )}
      </div>
    </section>
  );
}

// ── 0DTE ideas (compact; the full desk is NEXUS → 0DTE) ────────────────────
const STAGE: Record<DeskIdea['stage'], string> = { watch: 'watch', triggered: 'triggered', in_play: 'in play', done: 'done' };
const contractLabel = (c: NonNullable<DeskIdea['contract']>) => `${c.root} ${c.expiry.slice(5).replace('-', '/')} ${c.strike}${c.optionType === 'call' ? 'C' : 'P'}`;
const usd = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : `$${fmt(v)}`);

function ZeroDteBand({ now }: { now: number }) {
  const q = useZeroDteDesk();
  const d = q.data;
  const ideas = (d?.ideas ?? []) as DeskIdea[];
  const live = ideas.filter((x) => x.stage !== 'done').slice(0, 4);
  const empty = !d ? '' : d.phase.entriesOpen
    ? 'No setup forming on the watched names right now.'
    : d.phase.id === 'pre' ? 'Pre-market — no 0DTE ideas before 09:45 ET.'
    : ideas.length ? 'Nothing live — today’s 0DTE ideas are done.' : 'No new 0DTE entries now (window 09:45–15:45 ET).';
  return (
    <section className="td-index-desk tl-0dte" aria-label="0DTE ideas">
      <div className="container">
        <div className="td-index-head">
          <div><b>0DTE ideas</b><span className="tl-desk-only">{d ? recordLine(d) : 'model ideas · measuring'}</span></div>
          <Link href="/t?nx=0dte">Open the 0DTE desk</Link>
        </div>
        {q.isError && !d ? (
          <div className="tl-band-msg">The 0DTE desk didn&rsquo;t load. <button type="button" className="tl-link-btn" onClick={() => q.refetch()}>Retry</button></div>
        ) : !d ? (
          <div className="tl-band-msg">Reading the 0DTE desk…</div>
        ) : !live.length ? (
          <div className="tl-band-msg">{empty}</div>
        ) : (
          <div className="td-index-grid">
            {live.map((x) => (
              <Link href="/t?nx=0dte" className={`td-index-row live tl-0dte-row st-${x.stage}`} key={x.key} title={x.why}>
                <div><strong>{x.symbol}</strong><small>{x.contract ? contractLabel(x.contract) : x.expiryLabel}</small></div>
                <span className={x.direction === 'short' ? 'down' : 'up'}>{x.direction === 'short' ? '▼' : '▲'} {x.side.toLowerCase()} · {STAGE[x.stage]}</span>
                <b>{x.quote?.mid != null ? `~${usd(x.quote.mid)}` : '—'}</b>
                <em>trig {x.trigger ? usd(x.trigger.price) : '—'} · stop {usd(x.stop)}</em>
              </Link>
            ))}
          </div>
        )}
        {d && (
          <div className="tl-band-foot">
            <Stamp asOf={d.asOf} now={now} label="0DTE desk" failed={q.isError} onRetry={() => q.refetch()} retrying={q.isFetching} updatedAt={q.dataUpdatedAt} />
            <span className="tl-stamp tl-desk-only">model ideas from an unvalidated policy — not a hit-rate claim</span>
          </div>
        )}
      </div>
    </section>
  );
}

const TAPE_INDEX = ['SPX', 'SPY', 'QQQ'];
type TapeRow = { sym: string; price: string; px: number | null; chg: number; fresh?: TickerQuote };

function TapeItem({ t }: { t: TapeRow }) {
  const chgFlash = useTickFlash(t.chg, { resetKey: t.sym });
  const pxFlash = useTickFlash(t.px, { resetKey: t.sym });
  return (
    <div className="ltape-item">
      <span className="ltape-sym">{t.sym}</span>
      {t.price && <span className={`ltape-price ${pxFlash}`}>{t.price}</span>}
      <span className={`ltape-chg ${t.chg >= 0 ? 'up' : 'down'} ${chgFlash}`}>{t.chg >= 0 ? '+' : ''}{t.chg.toFixed(2)}%</span>
      {t.fresh && <QuoteFreshChip q={t.fresh} className="ltape-fresh" />}
      <span className="ltape-sep">·</span>
    </div>
  );
}

export default function TodayPage() {
  // The landing-style bands re-root .nexus-vars, so they must carry .light
  // themselves (the frame's .light does not reach a nested .nexus-vars).
  const isLight = useTheme().theme === 'nexus-light';
  const now = useNow();
  const wp = useWeeklyPath();
  const g = useSpyGex();
  const book = useBook();
  const perf = usePerf();
  const rotation = useRotation();
  const pulse = usePulse();
  const indexDesk = useIndexDesk();
  const spyIntra = useSpyIntraday();
  const cardCharts = useCardCharts();
  const [mapRef, mapWidth] = useElementWidth<HTMLDivElement>();
  const [tapePaused, setTapePaused] = useState(false);

  const { ideas, longs } = book;
  const snap = g.snap;
  const magnet = snap?.maxGammaStrike;
  // Regime from the SAME snapshot as the walls (GEX terminal = GEX page), by the
  // shared rule (shared/gex-regime.ts): net-GEX sign with a neutral band + near-flip.
  const gRead = snap?.regimeRead;
  const gRegime = gRead?.regime ?? regimeFromLegacy(snap?.regime ?? wp.data?.regime);
  const nearFlip = gRead?.nearFlip ?? (snap?.regime ?? wp.data?.regime) === 'transitioning';
  const shortGamma = gRegime === 'negative';
  const balanced = gRegime === 'neutral';
  // The max-|γ| strike is a magnet only when its net gamma is positive; put-dominated it is a pivot.
  const magnetIsPut = (snap?.levels?.find((l) => l.strike === magnet)?.gex ?? 0) < 0;
  const sigma = wp.data?.expectedMove;
  const spy = book.quote('SPY');
  // Live SPY only — the model's start price is publish-time and never shown as "now".
  const spyPx = spy?.price ?? spy?.lastPrice;
  const refPx = spyPx ?? wp.data?.spotPrice;
  const spyFlash = useTickFlash(spyPx);
  const spyBars = spyIntra.data?.data ?? [];
  const pinClose = !magnetIsPut && magnet != null && sigma != null && spyPx != null && Math.abs(magnet - spyPx) <= 0.75 * sigma;
  const best = ideas[0];
  const bestX = useMemo(() => (best ? explain(best) : undefined), [best]);
  const bestQuote = best ? book.quote(best.symbol) : undefined;
  const bookRows = ideas.slice(2, 8); // 0 and 1 are the feature cards
  const o = perf.data;
  const dirOf = useMemo(() => new Map(ideas.map((p) => [p.symbol, p.direction ?? 'long'] as const)), [ideas]);

  const sectors = rotation.data?.sectors ?? [];
  const flows = useMemo(() => {
    const sorted = [...sectors].filter((x) => Number.isFinite(x.relChange)).sort((a, b) => (b.relChange ?? 0) - (a.relChange ?? 0));
    const maxAbs = Math.max(0.1, ...sorted.map((x) => Math.abs(x.relChange ?? 0)));
    return { top: sorted.slice(0, 2), bottom: sorted.slice(-2).reverse(), maxAbs };
  }, [sectors]);
  // Index levels lead the tape, each with its own freshness chip — SPX outside RTH
  // or behind CBOE's 15-minute delay is a labelled proxy, never passed off as live.
  const idxQ = useQuotes(TAPE_INDEX);
  const tape = useMemo(() => {
    const rows: TapeRow[] = [];
    TAPE_INDEX.forEach((s) => {
      const q = idxQ.data?.[s];
      if (q?.price) rows.push({ sym: s, price: q.price >= 1000 ? Math.round(q.price).toLocaleString() : q.price.toFixed(2), px: q.price, chg: Number.isFinite(q.changePercent) ? q.changePercent : 0, fresh: q });
    });
    sectors.forEach((x) => rows.push({ sym: x.etf, price: '', px: null, chg: x.change }));
    (pulse.data?.assets ?? []).forEach((x) => rows.push({ sym: x.symbol, price: `$${Math.round(x.price).toLocaleString()}`, px: x.price, chg: x.change24h ?? 0 }));
    return rows;
  }, [sectors, pulse.data, idxQ.data]);

  // Sections rest visible; the reveal only adds motion as they scroll in.
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } }), { threshold: 0.08 });
    document.querySelectorAll('.today-l .reveal').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [book.conv.data, rotation.data]);

  const toBest = () => document.getElementById('sec-best')?.scrollIntoView({ behavior: 'smooth' });
  const weekOf = wp.data ? new Date(wp.data.weekStart + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
  const feedDown = wp.isError && !wp.data;
  const pathAsOf = wp.data ? (wp.data.cachedAt ?? (wp.dataUpdatedAt ? new Date(wp.dataUpdatedAt).toISOString() : null)) : null;
  const scalps = indexDesk.data?.scalps ?? [];
  const narrowMap = mapWidth > 0 && mapWidth < 560;
  const volLabel = wp.data?.volSource === 'realized-20d' ? `realized ${((wp.data.annualVol ?? 0) * 100).toFixed(1)}%` : wp.data?.volSource === 'vix' ? `VIX ${((wp.data?.annualVol ?? 0) * 100).toFixed(1)}` : 'est.';

  return (
    <div className={`landing nexus-vars today-l today-page${isLight ? ' light' : ''}`}>
      {/* HERO — the week in one sentence and one chart */}
      <section className="hero">
        <div className="container">
          <div className="hero-grid">
            <div>
              <div className="hero-eyebrow"><span className="pill">TODAY</span>Index desk{weekOf ? ` · week of ${weekOf}` : ''}</div>
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
              <Clamp className="hero-sub" lines={2}>
                {feedDown
                  ? 'We only draw the map from measured positioning. It comes back the moment the feed does — this page retries every 30 seconds.'
                  : !wp.data ? ''
                  : `${shortGamma
                    ? 'Short-gamma dealers sell into drops and buy into rips, so ranges widen.'
                    : balanced ? 'Dealer gamma is close to flat, so hedging neither caps nor extends moves much.'
                    : 'Long-gamma dealers buy dips and sell rips, so ranges tighten.'}${sigma != null && refPx ? ` ${wp.data.volSource === 'realized-20d' ? 'Lately SPY has moved' : 'Expect'} about ±${fmt(sigma, 0)} points (${fmt(sigma / refPx * 100, 1)}%) in a typical week${wp.data.volSource === 'realized-20d' ? `${wp.data.impliedVol && spyPx ? ` — options price more, ±${fmt(spyPx * wp.data.impliedVol * Math.sqrt(5 / 252), 0)}` : ''}` : wp.data.volSource === 'vix' ? ' (from VIX)' : ' (estimated)'}.` : ''}${magnet && sigma != null && spyPx != null && Math.abs(magnet - spyPx) > 0.75 * sigma ? ` The biggest strike, ${fmt(magnet, 0)}, is ${fmt(Math.abs(magnet - spyPx), 0)} points away — further than dealers usually drag price in a week.` : ''}`}
              </Clamp>
              <div className="hero-actions">
                <button type="button" className="btn btn-primary btn-lg" onClick={toBest}>
                  Today&rsquo;s best idea
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><path d="M12 5v14M5 12l7 7 7-7" /></svg>
                </button>
                <Link href="/t?tab=gex" className="btn btn-ghost btn-lg">Full GEX surface</Link>
              </div>
              <div className="tl-keys" title={g.asOf ? `Measured SPY dealer levels · ${ageLabel(g.asOf, now)}` : 'Measured SPY dealer levels'}>
                {([[magnetIsPut ? 'Put pivot' : 'Magnet', magnet, 'king node', 'mag'], ['Ceiling', snap?.callWall, 'call wall', 'up'], ['Floor', snap?.putWall, 'put wall', 'dn']] as const).map(([k, v, sub, cls]) => (
                  <div key={k}><span>{k}</span><b className={cls}>{fmt(v as number | undefined, 0)}</b><small>{sub}</small></div>
                ))}
              </div>
              <div className="tl-band-foot">
                <Stamp asOf={g.asOf} now={now} label="dealer levels" failed={g.q.isError && !!g.q.data} onRetry={() => g.q.refetch()} retrying={g.q.isFetching} updatedAt={g.q.dataUpdatedAt} />
                {g.q.isError && !g.q.data && <span className="tl-stamp warn">dealer levels didn&rsquo;t load — retrying</span>}
              </div>
            </div>

            <div className="lterminal" ref={mapRef}>
              <div className="lterminal-head">
                <div className="lterminal-dots"><span /><span /><span /></div>
                <div className="lterminal-title">dealer map · spy · this week</div>
                <div className="lterminal-status"><span className="dot" />{pathAsOf ? `model ${ageLabel(pathAsOf, now)}` : 'measured'}
                  {/* the chart's method note lives behind the ⓘ (was a 2–3 line caption under the hero) */}
                  <InfoSheet className="tl-map-info" title="Dealer map · how to read it" label="How to read the dealer map"
                    what={MAP_NOTE(magnetIsPut)}
                    units="SPY price $; band = 1σ weekly move"
                    source={wp.data?.volSource === 'realized-20d' ? 'SPY realized volatility, last 20 sessions · GEX walls from the SPY options chain' : 'SPY volatility estimate · GEX walls from the SPY options chain'}
                    age={pathAsOf ? `model ${ageLabel(pathAsOf, now)} · dealer levels ${g.asOf ? ageLabel(g.asOf, now) : '—'}` : undefined} />
                </div>
              </div>
              <div className="lterminal-body">
                <div className="t-panel" style={{ gridColumn: '1/-1' }}>
                  <div className="t-panel-head"><span>This week · {wp.data?.volSource === 'realized-20d' ? 'realized range' : wp.data?.volSource === 'vix' ? 'implied range (VIX)' : 'range'} · walls</span><span>{sigma != null ? `1σ ±${fmt(sigma, 0)} pts · ${volLabel}` : ''}</span></div>
                  {wp.data && !g.q.isLoading
                    ? <WeekMap wp={wp.data} snap={snap} narrow={narrowMap} />
                    : <div className="tl-map-empty">{feedDown ? 'Options feed down — retrying' : 'Reading dealer positioning…'}</div>}
                </div>
                <div className="t-panel">
                  <div className="t-panel-head"><span>Market pulse · SPY</span>{spy?.asOf ? <QuoteFreshChip q={spy} now={now} /> : <span>no quote</span>}</div>
                  <div className="t-price"><span className={spyFlash}>SPY {fmt(spyPx)}</span></div>
                  <div className={`t-change${(spy?.changePercent ?? 0) >= 0 ? ' up' : ''}`}>{spy?.changePercent != null ? `${spy.changePercent >= 0 ? '+' : ''}${spy.changePercent.toFixed(2)}% · ${spy.session === 'post' ? 'incl. after-hours' : spy.session === 'pre' ? 'pre-market vs prior close' : spy.session === 'overnight' ? 'overnight vs prior close' : rotation.data?.sessionLabel ?? 'session'}` : '—'}</div>
                  <div className="t-chart"><Spark bars={spyBars} color={(spy?.changePercent ?? 0) >= 0 ? 'var(--green)' : 'var(--red)'} height={54} /></div>
                  {spy?.source && <div className="t-src">{spy.source}</div>}
                </div>
                <div className="t-panel">
                  <div className="t-panel-head"><span>The book · {ideas.length} live</span>{book.asOf ? <span className="live">{ageLabel(book.asOf, now)}</span> : <span>—</span>}</div>
                  {ideas.slice(0, 3).map((p) => (
                    <Link href={nexusIdeaHref(p)} className="t-signal t-signal-link" key={p.ideaId} title={`Open ${p.symbol} selected on NEXUS`}>
                      <span className="ticker">{p.symbol}</span>
                      <span className={`t-sig-dir ${p.direction === 'short' ? 'bear' : 'bull'}`}>{p.direction === 'short' ? '▼ short' : '▲ long'}</span>
                      <span className="dir">{convictionDisplayPercent(p.convictionScore ?? 0)}</span>
                    </Link>
                  ))}
                  <div className="t-row"><span className="k">Long / Short</span><span className="v"><span style={{ color: 'var(--green)' }}>{longs}</span> / <span style={{ color: 'var(--red)' }}>{ideas.length - longs}</span></span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TAPE */}
      {tape.length > 0 && (
        <div className="ltape" onMouseEnter={() => setTapePaused(true)} onMouseLeave={() => setTapePaused(false)}>
          <div className={`ltape-track${tapePaused ? ' paused' : ''}`}>
            {[...tape, ...tape].map((t, i) => <TapeItem key={i} t={t} />)}
          </div>
        </div>
      )}

      {/* PRE-MARKET — the leading direction read before the open */}
      <PremarketStrip dirOf={dirOf} now={now} />

      {/* (The one-line RotationStrip that sat here read the same daily/swing
          sector-ignition feed as the Sector ignition band below — same groups,
          same moves, twice on one page. The band keeps them; UI redundancy pass 2026-10-01.) */}

      {/* INDEX DESK — the same four instruments the intraday engine monitors. */}
      <section className="td-index-desk" aria-label="Index desk">
        <div className="container">
          <div className="td-index-head">
            <div><b>Index desk</b><span>SPX · SPY · QQQ · IWM</span></div>
            <Link href="/t">Open in Nexus</Link>
          </div>
          {indexDesk.isError && !indexDesk.data ? (
            <div className="tl-band-msg">The index desk didn&rsquo;t load. <button type="button" className="tl-link-btn" onClick={() => indexDesk.refetch()}>Retry</button></div>
          ) : (
            <div className="td-index-grid">
              {(['SPX', 'SPY', 'QQQ', 'IWM'] as const).map((symbol) => {
                const play = scalps.find((row) => row.symbol === symbol);
                return (
                  <Link href={play ? `/r/${symbol}` : `/r/${symbol}?tab=chart`} className={`td-index-row${play ? ' live' : ''}`} key={symbol}>
                    <div><strong>{symbol}</strong><small>{play ? `${play.setup?.replaceAll('_', ' ') ?? 'index setup'}${play.isPowerHour ? ' · power hour' : ''}` : indexDesk.isLoading ? 'reading…' : 'monitoring levels'}</small></div>
                    <span className={play?.direction === 'short' ? 'down' : play ? 'up' : ''}>{play ? `${play.direction === 'short' ? '▼' : '▲'} ${play.bias}` : 'watch'}</span>
                    <b title="The scanner's own raw confidence at publish — not the NEXUS evidence grade">{play?.confidence != null ? `scanner ${Math.round(play.confidence)}` : '—'}</b>
                    <em>{play?.riskRewardRatio != null ? `${play.riskRewardRatio.toFixed(1)}R` : 'No active call'}</em>
                  </Link>
                );
              })}
            </div>
          )}
          {indexDesk.data && (
            <div className="tl-band-foot">
              <Stamp asOf={newest(...scalps.map((s) => s.timestamp))} now={now} label={indexDesk.data.session?.name ?? 'index calls'}
                failed={indexDesk.isError} onRetry={() => indexDesk.refetch()} retrying={indexDesk.isFetching} updatedAt={indexDesk.dataUpdatedAt} />
            </div>
          )}
        </div>
      </section>

      {/* 0DTE IDEAS — compact; the desk is NEXUS → 0DTE */}
      <ZeroDteBand now={now} />

      {/* STATS — measured */}
      {/* SECTOR IGNITION — four horizons, measuring (server/sector-ignition.ts) */}
      <SectorIgnitionBand />
      {/* ROTATION IDEAS — the sector board's stated plans, one row (full panel on /t?tab=sectors) */}
      <RotationIdeasRow />

      <section className="stats-bar-l">
        <div className="container">
          <div className="stats-grid">
            {/* The two book stats repeat the hero's "The book · N live" panel (count,
                long/short, top score) — on phones, where that panel sits one scroll
                above, they're hidden; the record stats below are the band's news. */}
            <div className="stat-item reveal tl-dup-phone">
              <div className="lstat-val">{book.conv.isLoading ? '—' : ideas.length}</div>
              <div className="lstat-label">Live ideas in the book</div>
              <div className="lstat-sub">{longs} long · {ideas.length - longs} short</div>
            </div>
            <div className="stat-item reveal tl-dup-phone">
              <div className="lstat-val">{best ? convictionDisplayPercent(best.convictionScore ?? 0) : '—'}<span className="tl-of">/100</span></div>
              <div className="lstat-label">Top evidence score</div>
              <div className="lstat-sub">{best ? `${best.symbol} · ${best.direction}` : 'waiting for the board'}</div>
            </div>
            <div className="stat-item reveal">
              <div className="lstat-val">{o?.winRate != null ? `${o.winRate.toFixed(0)}%` : '—'}</div>
              <div className="lstat-label">Win rate, decided ideas</div>
              <div className="lstat-sub">{o?.decided != null ? `${o.wins ?? 0} of ${o.decided} decided${o.winRate == null ? ` · needs ${o.sampleFloor ?? 30}` : ''}` : perf.isError ? 'record didn’t load' : 'measuring'}</div>
              {o?.runUp && o.runUp.triggered > 0 && (
                <div className="lstat-sub" title={o.runUp.label}>{`Run-up: ${o.runUp.rate != null ? `${o.runUp.rate.toFixed(0)}%` : '—'} reached +5% before stop (${o.runUp.reached5BeforeStop}/${o.runUp.triggered} triggered) — not the win rate`}</div>
              )}
            </div>
            <div className="stat-item reveal">
              <div className="lstat-val">{o?.expectancyR != null ? `${o.expectancyR >= 0 ? '+' : ''}${o.expectancyR.toFixed(2)}R` : '—'}</div>
              <div className="lstat-label">Average per idea</div>
              <div className="lstat-sub">{o?.coveragePct != null ? `${o.coveragePct.toFixed(0)}% of ${o.total ?? 0} published ideas resolved` : 'measuring'}</div>
            </div>
          </div>
          {(book.conv.isError && book.conv.data) || (perf.isError && perf.data) ? (
            <div className="tl-band-foot">
              {book.conv.isError && book.conv.data && <QEStale className="tl-stale" what="refresh the idea book" updatedAt={book.conv.dataUpdatedAt} onRetry={() => book.conv.refetch()} retrying={book.conv.isFetching} />}
              {perf.isError && perf.data && <QEStale className="tl-stale" what="refresh the record" updatedAt={perf.dataUpdatedAt} onRetry={() => perf.refetch()} retrying={perf.isFetching} />}
            </div>
          ) : null}
        </div>
      </section>

      {/* FEATURE · BEST IDEA */}
      <section id="sec-best">
        <div className="container">
          {best && bestX ? (
            <div className="feature">
              <div className="reveal">
                <div className="feature-num">TOP OF THE NEXUS BOARD · {best.symbol} · {best.direction === 'short' ? 'SHORT' : 'LONG'}{best.optionType ? ` · ${best.optionType.toUpperCase()} ${best.strikePrice ?? ''}` : ''}{book.life.get(best.ideaId) ? ` · ${book.life.get(best.ideaId)!.life.label}` : ''}</div>
                <h3 className="feature-title">{bestX.headline}</h3>
                {bestX.against && <p className="feature-desc"><b style={{ color: 'var(--red)' }}>Against it:</b> {bestX.against}</p>}
                <div className="feature-list">
                  {bestX.reasons.map((r) => <div className="feature-list-item" key={r}>{CHECK}<div><b>{r}</b></div></div>)}
                </div>
                <div className="tl-ladder"><Ladder p={best} live={book.px(best.symbol)} /></div>
                {bestQuote?.asOf && <div className="tl-band-foot"><span className="tl-stamp">{best.symbol} price · {ageLabel(bestQuote.asOf, now)}</span></div>}
                <div className="hero-actions tl-best-actions">
                  <Link href={`/r/${best.symbol}`} className="btn btn-primary btn-lg">Full analysis
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><path d="M5 12h14M13 5l7 7-7 7" /></svg>
                  </Link>
                  <Link href={nexusIdeaHref(best)} className="btn btn-ghost btn-lg">Open on NEXUS</Link>
                  {/* PROVE before you ACT: the idea's own audit trail (entry evidence, snapshots, outcome). */}
                  {best.ideaId && <Link href={`/trade-ideas/${encodeURIComponent(best.ideaId)}/audit`} className="btn btn-ghost btn-lg">Audit trail</Link>}
                </div>
              </div>
              <div className="feature-visual reveal">
                {/* phones: the best idea's card repeats the ladder right above it (entry/stop/target) */}
                <div className="tl-dup-phone"><SigCard p={best as never} chart={cardCharts} /></div>
                {ideas[1] && <SigCard p={ideas[1] as never} chart={cardCharts} />}
              </div>
            </div>
          ) : (
            <div className="tl-empty">
              {book.conv.isLoading ? 'Loading the book…'
                : book.conv.isError && !book.conv.data ? <>The idea book didn&rsquo;t load. <button type="button" className="tl-link-btn" onClick={() => book.conv.refetch()}>Retry</button></>
                : <>The board is between publishes — ideas appear here the moment they exist. <Link href="/t?nx=0dte" className="tl-link-btn">Open the 0DTE desk</Link></>}
            </div>
          )}
        </div>
      </section>

      {/* THE BOOK */}
      {bookRows.length > 0 && (
        <section>
          <div className="container">
            <div className="reveal tl-book-head">
              <div>
                <div className="sec-eyebrow">Active book · {BOARD_ORDER_LABEL[book.boardSort]}</div>
                <h2 className="lsec-title">Ranked setups</h2>
              </div>
              <button type="button" className="tl-link-btn" aria-pressed={cardCharts}
                onClick={() => setPrefs((p) => ({ sections: { ...p.sections, [CARD_CHARTS_KEY]: !cardCharts } }))}
                title={cardCharts ? 'Hide the 1-month mini charts on the idea cards' : 'Show a 1-month mini chart on each idea card'}>
                {cardCharts ? 'Hide mini charts' : 'Show mini charts'}
              </button>
            </div>
            <div className="tl-book">
              {bookRows.map((p) => {
                // explain() falls back to the thesis' first sentence — which the card
                // already prints; only a flow / pattern read earns its own line.
                const why = explain(p).headline;
                const thesisLead = `${(p.thesis ?? '').split('.')[0]}.`;
                return (
                  <div className="tl-book-item reveal" key={p.ideaId}>
                    <SigCard p={p as never} chart={cardCharts} />
                    {why !== thesisLead && <p className="tl-book-why">{why}</p>}
                  </div>
                );
              })}
            </div>
            {ideas.length > 8 && <Link href="/t" className="tl-more">{ideas.length - 8} more on the NEXUS board →</Link>}
          </div>
        </section>
      )}

      {/* FEATURE · ROTATION */}
      <section>
        <div className="container">
          <div className="feature reverse">
            <div className="reveal">
              <div className="feature-num">SECTOR CONTEXT</div>
              <h3 className="feature-title">Rotation</h3>
              <p className="feature-desc">Relative strength and momentum across the tracked sectors. Bars show the strongest measured moves versus SPY.</p>
              {rotation.isError && !rotation.data ? (
                <div className="tl-band-msg">Sector rotation didn&rsquo;t load. <button type="button" className="tl-link-btn" onClick={() => rotation.refetch()}>Retry</button></div>
              ) : (
                <div className="feature-list">
                  <div className="feature-list-item">{CHECK}<div><b>{sectors.length || '—'} sectors mapped</b> <span>— {rotation.data?.isStale ? 'stale read' : rotation.data?.sessionLabel ?? 'live session'}</span></div></div>
                  {flows.top[0] && <div className="feature-list-item">{CHECK}<div><b>Leading: {flows.top[0].name}</b> <span>— {(flows.top[0].relChange ?? 0) >= 0 ? '+' : ''}{(flows.top[0].relChange ?? 0).toFixed(1)}% vs SPY</span></div></div>}
                  {flows.bottom[0] && <div className="feature-list-item">{CHECK}<div><b>Lagging: {flows.bottom[0].name}</b> <span>— {(flows.bottom[0].relChange ?? 0).toFixed(1)}% vs SPY</span></div></div>}
                </div>
              )}
              <div className="tl-band-foot">
                <Stamp asOf={rotation.data?.asOf} now={now} label="sectors" failed={rotation.isError && !!rotation.data} onRetry={() => rotation.refetch()} retrying={rotation.isFetching} updatedAt={rotation.dataUpdatedAt} />
              </div>
            </div>
            <div className="feature-visual reveal">
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
      </section>


      {/* CTA — the honest record */}
      <section>
        <div className="container">
          <div className="cta-box reveal">
            <h2 className="cta-title">Model record</h2>
            <p className="cta-sub">
              {/* the win rate / R numbers are in the stats band above — this says how they're kept */}
              {o?.decided != null
                ? `Every idea published since ${o.since} is scored on target, stop, or a measured close.${o.winRate == null ? ` A win rate shows at ${o.sampleFloor ?? 30} decided ideas.` : ''} Losers stay on the record; unresolved ideas are counted, never scored.`
                : perf.isError ? 'The model record didn’t load — the full record is in the journal.'
                : 'The record is replayed on 5-minute bars, not marked to the close.'}
            </p>
            <div className="cta-actions">
              <Link href="/t?tab=journal&jtab=record" className="btn btn-primary btn-lg">See the track record</Link>
              <Link href="/t" className="btn btn-ghost btn-lg">Open the terminal</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
