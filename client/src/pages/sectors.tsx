/**
 * SECTORS — the rotation board (/t?tab=sectors).
 *
 *   1. Rank flow     each sector's composite rank over the last 10 sessions;
 *                    top climbers blue, sliders vermilion, the rest grey; tap a
 *                    line or a legend chip to isolate it
 *   2. Rankings      sortable table (stacked cards on phones): rank, members,
 *                    consensus x/N (which signals agree, on hover/tap), 1D/3D/
 *                    10D/20D, breadth, RS, regime, stretch, overnight drift
 *   3. Rotation ideas  stated plans for the top Leading/Improving (long) and
 *                    Weakening/Lagging (short) sectors' leaders and laggards,
 *                    Send to NEXUS (operator), fired → outcome, the engine's
 *                    own record (components/sectors/rotation-ideas.tsx)
 *   4. Overnight     pre-market gappers / after-hours movers mapped to sectors
 *   5. Sector panel  leaders with confluence chips, laggards (catch-up), the
 *                    sector's overnight movers, NEXUS ideas with/against
 *
 * Reads GET /api/sectors/board and /api/sectors/:id — the worker's published
 * snapshot (server/sector-board.ts) with the quotes-only live pass laid over it
 * (shared/sector-board-live.ts, every 5 min in session): phase-aware columns
 * (pre-mkt / today · since open · last 30m / after-hrs), live rank with arrows vs
 * 15 and 30 min ago, today's equal-weight path per sector, a live pulse stamped
 * from the quotes' own time. Rows re-sort with a short slide and changed cells
 * flash — both off under prefers-reduced-motion. Every number is stamped with its age and
 * everything is "measuring": the composite, regime rules, consensus and the
 * confluence weights are unvalidated until the forward log says otherwise.
 * Plain scrolling page in the landing style (nexus.css .landing); no tiles.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/components/theme-provider';
import { FreshStamp, usePhone } from '@/components/ui/qe-phone';
import { HoverHint, LuxSortHead, nextSort, type LuxSortDir } from '@/components/lux';
import type { Consensus, MemberRead, OvernightMover, RankPoint, Regime, SectorRow } from '@shared/sector-board';
import type { LivePoint, SectorLive } from '@shared/sector-board-live';
import { RotationIdeasPanel } from '@/components/sectors/rotation-ideas';
import '@/styles/nexus.css';
import '@/styles/sectors.css';

// ─── payloads ────────────────────────────────────────────────────────────

type RowLive = Omit<SectorLive, 'ranks' | 'iranks'>;
type BoardSector = Omit<SectorRow, 'leaders' | 'laggards' | 'ideas'> & {
  leaders: Array<{ symbol: string; score: number | null; passed: number; available: number; r1: number | null; relSector: number | null }>;
  laggards: Array<{ symbol: string; relSector: number }>;
  ideas: { with: number; against: number; total: number };
  live?: RowLive | null;
};
interface Stamp { source: string; asOf: string | null; ageSec: number | null; stale: boolean }
interface LiveMeta {
  asOf: string; quotesAt: string | null; phase: string; quoted: number; total: number; base: string | null; applied: boolean;
  points: LivePoint[]; notes: string[]; compute: { ms: number; heapDeltaMb: number; rssMb: number }; cadence: string;
}
interface BoardPayload {
  asOf: string | null; dateKey?: string; phase: string | null; sessionThrough?: string | null;
  provisional?: { date: string; quotesAt: string | null; quotes: number } | null;
  sessions: string[]; sectors: BoardSector[]; climbers: string[]; sliders: string[];
  overnight: { kind: 'premarket' | 'after_hours' | null; at: string | null; movers: OvernightMover[] };
  forward?: { rows: number; summary: Array<{ h: number; n: number; meanExcess: number | null; beatPct: number | null }>; since: string | null };
  dataAsOf?: Record<string, string | null>; notes: string[]; cadence: string; honesty: string; stamp: Stamp;
  compute?: { ms: number; rssBeforeMb: number; rssAfterMb: number; heapDeltaMb: number; symbols: number };
  coverage?: { members: number; withBars: number; readNow: number; reasons: Record<string, number> };
  live?: LiveMeta | null;
}
interface PanelPayload {
  sector: SectorRow & { live?: SectorLive | null }; live?: LiveMeta | null; asOf: string; phase: string; sessions: string[]; sessionThrough: string | null;
  overnight: { kind: 'premarket' | 'after_hours' | null; at: string | null; movers: OvernightMover[] };
  stamp: Stamp; honesty: string;
}

const getJson = (url: string) => async () => {
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

// ─── format helpers (sign always printed — colour is never the only carrier) ─

const pct = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}%`);
const pp = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`);
const tone = (v: number | null | undefined) => (v == null || v === 0 ? '' : v > 0 ? 'sx-up' : 'sx-dn');
const REGIME: Record<Regime, { label: string; mark: string }> = {
  leading: { label: 'Leading', mark: '▲▲' }, improving: { label: 'Improving', mark: '▲' },
  weakening: { label: 'Weakening', mark: '▼' }, lagging: { label: 'Lagging', mark: '▼▼' },
};
const PHASE: Record<string, string> = { premarket: 'pre-market read', session: 'in session', close: 'close read', after_hours: 'after hours', closed: 'market closed' };
/** Which phase the columns follow: the live pass's when it is laid over, else the board's. */
const phaseOf = (d: BoardPayload | undefined) => d?.live?.phase ?? d?.phase ?? 'closed';
const LIVE_PHASES = new Set(['premarket', 'session', 'close']);
const reducedMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return true; } };
const etTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }) + ' ET' : '—');
const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const shortDate = (d: string) => { const [, m, day] = d.split('-'); return `${Number(m)}/${Number(day)}`; };

function readSectorParam(): string | null {
  try { return new URLSearchParams(window.location.search).get('sector'); } catch { return null; }
}
function writeSectorParam(id: string | null) {
  try {
    const u = new URL(window.location.href);
    if (id) u.searchParams.set('sector', id); else u.searchParams.delete('sector');
    window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
  } catch { /* URL sync is a convenience */ }
}

// ─── page ────────────────────────────────────────────────────────────────

export default function SectorsPage() {
  const isLight = useTheme().theme === 'nexus-light';
  // 30 s while the live pass runs (every 5 min in session, 10 pre-market) so a new pass lands within half a minute; 60 s otherwise.
  const board = useQuery<BoardPayload>({
    queryKey: ['/api/sectors/board'], queryFn: getJson('/api/sectors/board'),
    refetchInterval: (q) => (LIVE_PHASES.has(phaseOf(q.state.data as BoardPayload | undefined)) ? 30_000 : 60_000), staleTime: 20_000, retry: 1,
  });
  const [selected, setSelected] = useState<string | null>(() => readSectorParam());
  const panelRef = useRef<HTMLDivElement | null>(null);
  const data = board.data;
  const sectors = data?.sectors ?? [];
  const active = selected && sectors.some((s) => s.id === selected) ? selected : sectors.find((s) => s.rank === 1)?.id ?? null;

  const open = (id: string, scroll = true) => {
    setSelected(id);
    writeSectorParam(id);
    if (scroll) requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <div className={`landing nexus-vars sx-page${isLight ? ' light' : ''}`}>
      <section className="sx-hero" aria-labelledby="sx-title">
        <div className="container">
          <div className="hero-eyebrow"><span className="pill">SECTORS</span>Rotation board{data?.sessionThrough ? ` · sessions through ${data.sessionThrough}` : ''}{data ? ` · ${PHASE[phaseOf(data)] ?? phaseOf(data)}` : ''}</div>
          <h1 id="sx-title" className="sx-title">Where money is <span className="grad">rotating</span></h1>
          <p className="sx-purpose">Equal-weight sector reads ranked by momentum and breadth, the overnight tape mapped onto them, and the members leading each group — with every confluence component shown.</p>
          <div className="sx-hero-meta">
            <LivePulse data={data} />
            <FreshStamp asOf={data?.asOf ?? null} label="board" warn={data?.stamp?.stale} />
            <span className="sx-measuring" title={data?.honesty}>MEASURING</span>
            {data?.provisional && !data.live && <span className="sx-chip">today provisional · quotes {etTime(data.provisional.quotesAt)}</span>}
            {data?.cadence && <span className="sx-cadence" title={data.live?.cadence}>{data.cadence}{data.live ? ' · live pass every 5 min in session' : ''}</span>}
          </div>
          {data && sectors.length > 0 && <HeroStats data={data} onOpen={open} />}
        </div>
      </section>

      {board.isError && !data ? (
        <section><div className="container"><div className="sx-empty">The sector board didn&rsquo;t load. <button type="button" className="sx-link-btn" onClick={() => board.refetch()}>Retry</button></div></div></section>
      ) : !data ? (
        <section><div className="container"><div className="sx-empty" role="status">Reading the sector board…</div></div></section>
      ) : sectors.length === 0 ? (
        <section><div className="container"><div className="sx-empty">{data.notes?.[0] ?? 'Not published yet.'}</div></div></section>
      ) : (
        <>
          <section aria-labelledby="sx-flow-h">
            <div className="container">
              <div className="sec-eyebrow">01 · Rank flow · last {data.sessions.length} sessions</div>
              <h2 id="sx-flow-h" className="sx-h2">Who is climbing, who is sliding</h2>
              <RankFlow data={data} onOpen={open} />
            </div>
          </section>

          <section aria-labelledby="sx-rank-h">
            <div className="container">
              <div className="sec-eyebrow">02 · Sector rankings</div>
              <h2 id="sx-rank-h" className="sx-h2">Rankings</h2>
              <Rankings sectors={sectors} phase={phaseOf(data)} points={data.live?.points ?? []} activeId={active} onOpen={open} />
            </div>
          </section>

          <section aria-labelledby="sx-ideas-h" id="rotation-ideas">
            <div className="container">
              <div className="sec-eyebrow">03 · Rotation → trade ideas</div>
              <h2 id="sx-ideas-h" className="sx-h2">What the rotation suggests — and what was fired</h2>
              <RotationIdeasPanel forward={data.forward} />
            </div>
          </section>

          <section aria-labelledby="sx-ov-h">
            <div className="container">
              <div className="sec-eyebrow">04 · Overnight movers</div>
              <h2 id="sx-ov-h" className="sx-h2">{data.overnight.kind === 'after_hours' ? 'After-hours movers' : 'Pre-market gappers'} by sector</h2>
              <Overnight data={data} onOpen={open} />
            </div>
          </section>

          <section aria-labelledby="sx-panel-h" ref={panelRef as never}>
            <div className="container">
              <div className="sec-eyebrow">05 · Inside the sector</div>
              {active ? <SectorPanel id={active} sectors={sectors} live={LIVE_PHASES.has(phaseOf(data))} onOpen={open} /> : <div className="sx-empty">Pick a sector above.</div>}
            </div>
          </section>

          <section className="sx-foot-sec">
            <div className="container">
              <Footer data={data} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

// ─── hero stats ──────────────────────────────────────────────────────────

function HeroStats({ data, onOpen }: { data: BoardPayload; onOpen: (id: string) => void }) {
  const top = data.sectors.filter((s) => s.rank != null).slice(0, 3);
  const climber = data.sectors.find((s) => s.id === data.climbers[0]);
  const slider = data.sectors.find((s) => s.id === data.sliders[0]);
  const confirms = data.sectors.filter((s) => s.overnight.flag === 'confirms').length;
  const fights = data.sectors.filter((s) => s.overnight.flag === 'fights').length;
  return (
    <div className="sx-stats">
      <div className="sx-stat">
        <div className="sx-stat-k">Leading now</div>
        <div className="sx-stat-v sx-stat-list">{top.map((s) => <button key={s.id} type="button" className="sx-link-btn" onClick={() => onOpen(s.id)}>{s.label}</button>)}</div>
        <div className="sx-stat-s">composite ranks 1–{top.length}</div>
      </div>
      <div className="sx-stat">
        <div className="sx-stat-k">Biggest climb</div>
        <div className="sx-stat-v">{climber ? <button type="button" className="sx-link-btn sx-c-up" onClick={() => onOpen(climber.id)}>▲ {climber.label}</button> : '—'}</div>
        <div className="sx-stat-s">{climber ? `#${climber.rankThen} → #${climber.rank} in ${data.sessions.length} sessions` : 'no rank change read'}</div>
      </div>
      <div className="sx-stat">
        <div className="sx-stat-k">Biggest slide</div>
        <div className="sx-stat-v">{slider ? <button type="button" className="sx-link-btn sx-c-dn" onClick={() => onOpen(slider.id)}>▼ {slider.label}</button> : '—'}</div>
        <div className="sx-stat-s">{slider ? `#${slider.rankThen} → #${slider.rank}` : 'no rank change read'}</div>
      </div>
      {phaseOf(data) === 'session' || phaseOf(data) === 'close' ? <MovingNow data={data} onOpen={onOpen} /> : (
        <div className="sx-stat">
          <div className="sx-stat-k">{phaseOf(data) === 'after_hours' ? 'After hours vs rotation' : 'Overnight vs rotation'}</div>
          <div className="sx-stat-v">{data.overnight.kind ? `${confirms} confirm · ${fights} fight` : 'not read'}</div>
          <div className="sx-stat-s">{data.overnight.kind ? `${data.overnight.kind === 'premarket' ? 'pre-market' : 'after-hours'} · last print ${etTime(data.overnight.at)}` : 'read at 08:45 / 09:20 ET'}</div>
        </div>
      )}
    </div>
  );
}

/** In session the overnight read is history — show what is moving in the last 30 minutes instead. */
function MovingNow({ data, onOpen }: { data: BoardPayload; onOpen: (id: string) => void }) {
  const withL = data.sectors.filter((s) => s.live?.last30m != null);
  const top = [...withL].sort((a, b) => Math.abs(b.live!.last30m!) - Math.abs(a.live!.last30m!))[0];
  const up = data.sectors.filter((s) => (s.live?.today ?? 0) > 0).length;
  const dn = data.sectors.filter((s) => (s.live?.today ?? 0) < 0).length;
  return (
    <div className="sx-stat">
      <div className="sx-stat-k">Moving now · last 30 min</div>
      <div className="sx-stat-v">{top ? <button type="button" className={`sx-link-btn ${top.live!.last30m! >= 0 ? 'sx-c-up' : 'sx-c-dn'}`} onClick={() => onOpen(top.id)}>{top.live!.last30m! >= 0 ? '▲' : '▼'} {top.label} {pct(top.live!.last30m, 2)}</button> : '—'}</div>
      <div className="sx-stat-s">{withL.length ? `${up} sectors up · ${dn} down today` : 'no 30-min read yet — needs 30 min of the session'}</div>
    </div>
  );
}

// ─── live pulse ──────────────────────────────────────────────────────────

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}
const agoText = (sec: number) => (sec < 60 ? `${sec}s` : sec < 3600 ? `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, '0')}s` : `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`);

/** "● LIVE · quotes 10:42 ET · updated 1m 12s ago" — the age is the quotes' own time, not the fetch. */
function LivePulse({ data }: { data: BoardPayload | undefined }) {
  const now = useNow(1000);
  const live = data?.live;
  if (!live) return null;
  const at = live.quotesAt ?? live.asOf;
  const sec = Math.max(0, Math.round((now - Date.parse(at)) / 1000));
  const inPhase = LIVE_PHASES.has(live.phase) || live.phase === 'after_hours';
  const stale = sec > (live.phase === 'session' ? 12 * 60 : 40 * 60);
  return (
    <span className={`sx-pulse${inPhase && !stale ? ' on' : ''}${stale ? ' stale' : ''}`} role="status" aria-label={`Live quotes from ${etTime(at)}, ${agoText(sec)} ago${stale ? ', stale' : ''}`}
      title={`Live pass ${etTime(live.asOf)}: ${live.quoted}/${live.total} quoted${live.base ? '' : ' · quotes-only (rank from the last board run)'}${live.notes.length ? ` · ${live.notes.join(' · ')}` : ''}`}>
      <i aria-hidden className="sx-pulse-dot" />{inPhase && !stale ? 'LIVE' : 'LAST'} · quotes {etTime(at)} · updated {agoText(sec)} ago
    </span>
  );
}

// ─── live cells ──────────────────────────────────────────────────────────

/** A number cell that flashes when its value changes between refetches (not on first paint). */
function FlashNum({ v, fmt, className }: { v: number | null | undefined; fmt: (v: number | null | undefined) => string; className?: string }) {
  const prev = useRef<number | null | undefined>(v);
  const [flash, setFlash] = useState<'' | 'up' | 'dn'>('');
  useEffect(() => {
    const p = prev.current; prev.current = v;
    if (p == null || v == null || p === v || reducedMotion()) return;
    setFlash(v > p ? 'up' : 'dn');
    const id = setTimeout(() => setFlash(''), 1400);
    return () => clearTimeout(id);
  }, [v]);
  return <span className={`${className ?? ''}${flash ? ` sx-flash-${flash}` : ''}`}>{fmt(v)}</span>;
}

/** Rank-change arrow vs N minutes ago (positive = climbed). */
function RankMove({ now, then, label }: { now: number | null | undefined; then: number | null | undefined; label: string }) {
  if (now == null || then == null) return null;
  const d = then - now;
  if (!d) return <span className="sx-rmove sx-mute" title={`same rank as ${label} ago`}>=</span>;
  return <span className={`sx-rmove ${d > 0 ? 'sx-c-up' : 'sx-c-dn'}`} title={`#${then} ${label} ago → #${now} now`}>{d > 0 ? '▲' : '▼'}{Math.abs(d)}<small>{label}</small></span>;
}

/** Today's equal-weight path (one point per live pass); the tick marks the 09:30 open. */
function Spark({ v, points, w = 84, h = 22 }: { v: Array<number | null> | undefined; points: LivePoint[]; w?: number; h?: number }) {
  const xs = (v ?? []).map((x, i) => [i, x] as const).filter((p): p is readonly [number, number] => p[1] != null);
  if (xs.length < 2) return <span className="sx-mute sx-spark-empty" title="the path draws after two live passes">·</span>;
  const n = Math.max(2, (v ?? []).length);
  const lo = Math.min(0, ...xs.map((p) => p[1])); const hi = Math.max(0, ...xs.map((p) => p[1]));
  const span = hi - lo || 1;
  const X = (i: number) => 1 + (i * (w - 2)) / (n - 1);
  const Y = (y: number) => 1 + (h - 2) * (1 - (y - lo) / span);
  const last = xs[xs.length - 1][1];
  const open = points.findIndex((p) => p.phase === 'session');
  const d = xs.map(([i, y], k) => `${k ? 'L' : 'M'}${X(i).toFixed(1)},${Y(y).toFixed(1)}`).join('');
  return (
    <svg className={`sx-spark ${last >= 0 ? 'up' : 'dn'}`} width={w} height={h} role="img" aria-label={`today's equal-weight path, now ${pct(last, 2)}`}>
      <line x1={0} x2={w} y1={Y(0)} y2={Y(0)} className="sx-spark-zero" />
      {open > 0 && <line x1={X(open)} x2={X(open)} y1={0} y2={h} className="sx-spark-open" />}
      <path d={d} fill="none" />
      <circle cx={X(xs[xs.length - 1][0])} cy={Y(last)} r={1.8} />
    </svg>
  );
}

/** "7/9" with the reason for every unread member — never a bare "—" for a whole sector. */
function MembersRead({ s }: { s: BoardSector | SectorRow }) {
  const u = s.unread ?? [];
  const why = u.length ? Array.from(new Set(u.map((x) => x.reason))).slice(0, 2).join('; ') : '';
  const title = u.length ? `Not read: ${u.map((x) => `${x.symbol} (${x.reason})`).join(', ')}` : 'every member read';
  return (
    <span className={`sx-mute sx-members${s.membersRead === 0 ? ' sx-unread-all' : ''}`} title={title}>
      {s.membersRead}/{s.memberCount} read{s.etf ? ` · ${s.etf}` : ''}{s.thematic ? ' · theme' : ''}
      {s.membersRead < s.memberCount && s.membersRead < 2 && why ? <em> — {clip(why, 60)}</em> : null}
    </span>
  );
}

// ─── 1. rank flow (SVG) ──────────────────────────────────────────────────

function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver((es) => setW(Math.round(es[0].contentRect.width)));
    ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function RankFlow({ data, onOpen }: { data: BoardPayload; onOpen: (id: string) => void }) {
  const [wrap, width] = useWidth<HTMLDivElement>();
  const [iso, setIso] = useState<string | null>(null);
  const phone = usePhone();
  const ranked = data.sectors.filter((s) => s.history.some((h) => h.rank != null));
  const n = Math.max(1, ...ranked.flatMap((s) => s.history.map((h) => h.rank ?? 0)));
  const up = new Set(data.climbers); const dn = new Set(data.sliders);
  const W = Math.max(280, width);
  const labelW = phone ? 112 : 168;
  const padL = 28; const padT = 16; const padB = 26;
  const rowH = phone ? 9 : 12;
  const H = padT + padB + n * rowH;
  const cols = data.sessions.length;
  const x = (i: number) => padL + (cols <= 1 ? 0 : (i * (W - padL - labelW - 8)) / (cols - 1));
  const y = (r: number) => padT + ((r - 1) / Math.max(1, n - 1)) * (H - padT - padB);
  const colorOf = (id: string) => (up.has(id) ? 'var(--sx-climb)' : dn.has(id) ? 'var(--sx-slide)' : 'var(--sx-grey)');
  const path = (h: RankPoint[]) => h.map((p, i) => (p.rank == null ? null : `${x(i)},${y(p.rank)}`)).filter(Boolean).join(' L');
  const order = [...ranked].sort((a, b) => Number(up.has(a.id) || dn.has(a.id)) - Number(up.has(b.id) || dn.has(b.id)));
  const isoS = iso ? ranked.find((s) => s.id === iso) : null;
  return (
    <div className="sx-flow">
      <div className="sx-legend" role="group" aria-label="Isolate a sector">
        {data.climbers.map((id) => { const s = data.sectors.find((x) => x.id === id); return s && (
          <button key={id} type="button" className={`sx-leg sx-leg-up${iso === id ? ' on' : ''}`} aria-pressed={iso === id} onClick={() => setIso(iso === id ? null : id)}>▲ {s.label} <b>{s.rankDelta != null ? `+${s.rankDelta}` : ''}</b></button>
        ); })}
        {data.sliders.map((id) => { const s = data.sectors.find((x) => x.id === id); return s && (
          <button key={id} type="button" className={`sx-leg sx-leg-dn${iso === id ? ' on' : ''}`} aria-pressed={iso === id} onClick={() => setIso(iso === id ? null : id)}>▼ {s.label} <b>{s.rankDelta != null ? `−${Math.abs(s.rankDelta)}` : ''}</b></button>
        ); })}
      </div>
      <div ref={wrap} className="sx-flow-svg">
        {width > 0 && (
          <svg width={W} height={H} role="img" aria-label={`Composite rank of ${ranked.length} sectors over ${cols} sessions; rank 1 at the top`}>
            {data.sessions.map((d, i) => (
              <g key={d}>
                <line x1={x(i)} x2={x(i)} y1={padT - 6} y2={H - padB + 4} className="sx-grid" />
                {(!phone || i % 2 === (cols - 1) % 2) && <text x={x(i)} y={H - 8} textAnchor="middle" className={`sx-axis${data.provisional && i === cols - 1 && data.live ? ' sx-axis-live' : ''}`}>{data.provisional && i === cols - 1 ? (data.live ? `today* ${etTime(data.live.quotesAt ?? data.live.asOf).replace(' ET', '')}` : 'today*') : shortDate(d)}</text>}
              </g>
            ))}
            {[1, Math.ceil(n / 2), n].map((r) => <text key={r} x={4} y={y(r) + 3} className="sx-axis">#{r}</text>)}
            {order.map((s) => {
              const lit = iso ? iso === s.id : up.has(s.id) || dn.has(s.id);
              const p = path(s.history);
              if (!p) return null;
              return (
                <g key={s.id} className={`sx-line${lit ? ' lit' : ''}${iso && iso !== s.id ? ' faded' : ''}`} onClick={() => setIso(iso === s.id ? null : s.id)}>
                  <title>{`${s.label}: ${s.history.map((h) => (h.rank == null ? '—' : `#${h.rank}`)).join(' → ')}`}</title>
                  <path d={`M${p}`} fill="none" stroke="transparent" strokeWidth={10} />
                  <path d={`M${p}`} fill="none" stroke={iso === s.id ? 'var(--sx-iso)' : colorOf(s.id)} strokeWidth={lit ? 2.4 : 1.1} strokeLinejoin="round" strokeLinecap="round" />
                </g>
              );
            })}
            {ranked.filter((s) => (iso ? iso === s.id : up.has(s.id) || dn.has(s.id))).map((s) => {
              const lastPt = s.history[s.history.length - 1];
              if (lastPt?.rank == null) return null;
              return (
                <g key={`l-${s.id}`}>
                  <circle cx={x(cols - 1)} cy={y(lastPt.rank)} r={3} fill={iso === s.id ? 'var(--sx-iso)' : colorOf(s.id)} className={data.provisional && data.live ? 'sx-today-dot' : undefined} style={{ transition: reducedMotion() ? undefined : 'cy 480ms ease' }} />
                  <text x={x(cols - 1) + 7} y={y(lastPt.rank) + 3.5} className="sx-end">{clip(`#${lastPt.rank} ${s.label}`, phone ? 15 : 26)}</text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
      <div className="sx-flow-foot">
        {isoS ? (
          <>
            <span><b>{isoS.label}</b> {isoS.history.map((h) => (h.rank == null ? '—' : `#${h.rank}`)).join(' → ')}</span>
            <button type="button" className="sx-link-btn" onClick={() => onOpen(isoS.id)}>Open {isoS.label} →</button>
            <button type="button" className="sx-link-btn" onClick={() => setIso(null)}>Show all</button>
          </>
        ) : (
          <span>Rank 1 at the top. Blue ▲ = top {data.climbers.length} climbers, vermilion ▼ = top {data.sliders.length} sliders over the window; tap a line or chip to isolate it.{data.provisional ? ` * today is priced from live quotes and moves until the close${data.live ? ' — re-priced every live pass (5 min in session)' : ''}.` : ''}</span>
        )}
      </div>
    </div>
  );
}

// ─── 2. rankings ─────────────────────────────────────────────────────────

type SortKey = 'rank' | 'consensus' | 'r1' | 'r3' | 'r10' | 'r20' | 'breadth' | 'rs' | 'stretch' | 'overnight' | 'sinceOpen' | 'last30m' | 'upDn' | 'preMkt' | 'afterHrs';
const todayOf = (s: BoardSector) => s.live?.today ?? s.r1;
const preOf = (s: BoardSector) => s.live?.preMkt ?? s.overnight.driftPct;
const ahOf = (s: BoardSector) => s.live?.afterHrs ?? (s.overnight.kind === 'after_hours' ? s.overnight.driftPct : null);
const SORT_VAL: Record<SortKey, (s: BoardSector) => number | null> = {
  rank: (s) => (s.rank == null ? null : -s.rank),
  consensus: (s) => s.consensus.bull - s.consensus.bear,
  r1: todayOf, r3: (s) => s.r3, r10: (s) => s.r10, r20: (s) => s.r20,
  breadth: (s) => s.breadth, rs: (s) => s.rs, stretch: (s) => s.stretch, overnight: (s) => s.overnight.driftPct,
  sinceOpen: (s) => s.live?.sinceOpen ?? null, last30m: (s) => s.live?.last30m ?? null,
  upDn: (s) => (s.live && s.live.quoted ? (s.live.up - s.live.down) / s.live.quoted : null),
  preMkt: preOf, afterHrs: ahOf,
};

/** The phase decides which "now" columns the table carries. */
type Col = { key: SortKey; label: string; title: string; cell: (s: BoardSector) => React.ReactNode };
function phaseCols(phase: string): Col[] {
  const today: Col = { key: 'r1', label: phase === 'closed' ? '1D' : 'Today', title: 'equal-weight change vs the prior close', cell: (s) => <FlashNum v={todayOf(s)} fmt={(v) => pct(v, 2)} className={tone(todayOf(s))} /> };
  if (phase === 'premarket') return [
    { key: 'preMkt', label: 'Pre-mkt', title: 'median member pre-market move vs the prior close', cell: (s) => (s.live?.preMkt != null ? <FlashNum v={s.live.preMkt} fmt={pct} className={tone(s.live.preMkt)} /> : <GapFlag s={s} />) },
    { key: 'r1', label: '1D', title: 'last completed session', cell: (s) => <span className={tone(s.r1)}>{pct(s.r1)}</span> },
  ];
  if (phase === 'session' || phase === 'close') return [
    today,
    { key: 'sinceOpen', label: 'Since open', title: 'equal-weight change vs today\'s 09:30 open', cell: (s) => <FlashNum v={s.live?.sinceOpen} fmt={(v) => pct(v, 2)} className={tone(s.live?.sinceOpen)} /> },
    { key: 'last30m', label: 'Last 30m', title: 'equal-weight change over the last ~30 minutes of regular prints', cell: (s) => <FlashNum v={s.live?.last30m} fmt={(v) => pct(v, 2)} className={tone(s.live?.last30m)} /> },
    { key: 'upDn', label: 'Up/Dn', title: 'members up / down vs the prior close; above VWAP', cell: (s) => <UpDn l={s.live} /> },
  ];
  if (phase === 'after_hours') return [
    today,
    { key: 'afterHrs', label: 'After-hrs', title: 'median member after-hours move vs the regular close', cell: (s) => <FlashNum v={ahOf(s)} fmt={pct} className={tone(ahOf(s))} /> },
  ];
  return [today, { key: 'overnight', label: 'Overnight', title: 'median member overnight move', cell: (s) => <GapFlag s={s} /> }];
}
function UpDn({ l }: { l: RowLive | null | undefined }) {
  if (!l || !l.quoted) return <span className="sx-mute">—</span>;
  return (
    <span className="sx-updn" title={`${l.up} up · ${l.down} down of ${l.quoted} quoted${l.aboveVwap != null ? ` · ${l.aboveVwap}/${l.vwapRead} above VWAP` : ''}`}>
      <b className="sx-up">{l.up}</b>/<b className="sx-dn">{l.down}</b>{l.aboveVwap != null && <small> · {l.aboveVwap}/{l.vwapRead} &gt;VWAP</small>}
    </span>
  );
}

/** FLIP: rows that change position slide from where they were (skipped under reduced motion). */
function useRowSlide(body: React.RefObject<HTMLElement>, order: string) {
  const prevTop = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const el = body.current; if (!el) return;
    const rows = Array.from(el.querySelectorAll<HTMLElement>('[data-row]'));
    const next = new Map<string, number>();
    for (const r of rows) next.set(r.dataset.row!, r.getBoundingClientRect().top);
    if (!reducedMotion() && prevTop.current.size) {
      for (const r of rows) {
        const before = prevTop.current.get(r.dataset.row!); const after = next.get(r.dataset.row!)!;
        if (before == null || Math.abs(before - after) < 1) continue;
        r.style.transition = 'none';
        r.style.transform = `translateY(${before - after}px)`;
        requestAnimationFrame(() => { r.style.transition = 'transform 480ms cubic-bezier(.2,.7,.2,1)'; r.style.transform = ''; });
      }
    }
    prevTop.current = next;
  }, [order, body]);
}

function ConsensusChip({ c }: { c: Consensus }) {
  const lean = c.lean === 'bull' ? 'sx-up' : c.lean === 'bear' ? 'sx-dn' : '';
  const body = (
    <ul className="sx-cons-list">
      {c.signals.map((s) => <li key={s.key} data-lean={s.lean}><b>{s.lean === 'bull' ? '▲' : s.lean === 'bear' ? '▼' : s.lean === 'neutral' ? '•' : '–'} {s.label}</b> {s.detail}</li>)}
    </ul>
  );
  return (
    <HoverHint heading={`Consensus · ${c.bull} bullish / ${c.bear} bearish of ${c.n} read`} content={body}>
      <button type="button" className={`sx-cons ${lean}`} aria-label={`${c.bull} of ${c.n} signals bullish, ${c.bear} bearish`}>
        {c.lean === 'bear' ? <>▼ {c.bear}/{c.n}</> : <>▲ {c.bull}/{c.n}</>}{c.lean === 'mixed' && <span className="sx-mute"> mixed</span>}
      </button>
    </HoverHint>
  );
}

function RegimeTag({ r }: { r: Regime | null }) {
  if (!r) return <span className="sx-regime">—</span>;
  return <span className={`sx-regime sx-rg-${r}`}>{REGIME[r].mark} {REGIME[r].label}</span>;
}
function GapFlag({ s }: { s: BoardSector | SectorRow }) {
  const o = s.overnight;
  if (o.driftPct == null) return <span className="sx-mute">—</span>;
  return <span><span className={tone(o.driftPct)}>{pct(o.driftPct)}</span>{o.flag && o.flag !== 'flat' && <span className={`sx-flag sx-flag-${o.flag}`}>{o.flag === 'confirms' ? 'confirms' : 'fights'}</span>}</span>;
}

function Rankings({ sectors, phase, points, activeId, onOpen }: { sectors: BoardSector[]; phase: string; points: LivePoint[]; activeId: string | null; onOpen: (id: string) => void }) {
  const phone = usePhone();
  const cols = phaseCols(phase);
  const showLive = sectors.some((s) => s.live);
  const tbody = useRef<HTMLTableSectionElement>(null);
  const cards = useRef<HTMLDivElement>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: LuxSortDir }>({ key: 'rank', dir: null });
  const [all, setAll] = useState(false);
  const rows = useMemo(() => {
    if (!sort.dir) return sectors;
    const f = SORT_VAL[sort.key]; const s = sort.dir === 'desc' ? -1 : 1;
    return [...sectors].sort((a, b) => { const x = f(a); const y = f(b); if (x == null) return 1; if (y == null) return -1; return s * (x - y); });
  }, [sectors, sort]);
  const toggle = (key: SortKey) => setSort((p) => ({ key, dir: p.key === key ? nextSort(p.dir) : 'desc' }));
  const dirOf = (k: SortKey) => (sort.key === k ? sort.dir : null);
  const shown = phone && !all ? rows.slice(0, 12) : rows;
  useRowSlide(phone ? cards : tbody, shown.map((s) => s.id).join(','));

  if (phone) {
    return (
      <div className="sx-cards" ref={cards}>
        {shown.map((s) => (
          <article key={s.id} data-row={s.id} className={`sx-card${s.id === activeId ? ' on' : ''}`}>
            <button type="button" className="sx-card-hit" onClick={() => onOpen(s.id)} aria-label={`Open ${s.label}`}>
              <div className="sx-card-top">
                <FlashNum v={s.rank} fmt={(v) => `#${v ?? '—'}`} className="sx-rank" />
                {s.live && <span className="sx-rmoves"><RankMove now={s.rank} then={s.live.rank15} label="15m" /></span>}
                <span className="sx-card-name">{s.label}{s.thematic && <span className="sx-theme">theme</span>}</span>
                <RegimeTag r={s.regime} />
              </div>
              {s.live && <div className="sx-card-spark"><Spark v={s.live.spark} points={points} w={150} h={24} /></div>}
              <div className="sx-card-grid">
                {cols.map((c) => <span key={c.key}><i>{c.label}</i><b>{c.cell(s)}</b></span>)}
                <span><i>3D</i><b className={tone(s.r3)}>{pct(s.r3)}</b></span>
                <span><i>10D</i><b className={tone(s.r10)}>{pct(s.r10)}</b></span>
                <span><i>20D</i><b className={tone(s.r20)}>{pct(s.r20)}</b></span>
                <span><i>Breadth</i><b>{s.breadth == null ? '—' : `${s.breadth}%`}</b></span>
                <span><i>RS</i><b className={tone(s.rs)}>{pp(s.rs)}</b></span>
                <span><i>Stretch</i><b>{pct(s.stretch)}</b></span>
              </div>
            </button>
            <div className="sx-card-foot">
              <ConsensusChip c={s.consensus} />
              <MembersRead s={s} />
            </div>
          </article>
        ))}
        {rows.length > 12 && <button type="button" className="sx-more" onClick={() => setAll(!all)}>{all ? 'Show top 12' : `Show all ${rows.length}`}</button>}
      </div>
    );
  }
  return (
    <div className="sx-table-wrap">
      <table className="sx-table">
        <thead>
          <tr>
            <LuxSortHead dir={dirOf('rank')} onSort={() => toggle('rank')}>#</LuxSortHead>
            <th>Sector</th>
            {showLive && <th title="today's equal-weight path, one point per live pass">Today path</th>}
            <LuxSortHead dir={dirOf('consensus')} onSort={() => toggle('consensus')}>Consensus</LuxSortHead>
            {cols.map((c) => <LuxSortHead key={c.key} align="right" dir={dirOf(c.key)} onSort={() => toggle(c.key)}><span title={c.title}>{c.label}</span></LuxSortHead>)}
            <LuxSortHead align="right" dir={dirOf('r3')} onSort={() => toggle('r3')}>3D</LuxSortHead>
            <LuxSortHead align="right" dir={dirOf('r10')} onSort={() => toggle('r10')}>10D</LuxSortHead>
            <LuxSortHead align="right" dir={dirOf('r20')} onSort={() => toggle('r20')}>20D</LuxSortHead>
            <LuxSortHead align="right" dir={dirOf('breadth')} onSort={() => toggle('breadth')}>Breadth</LuxSortHead>
            <LuxSortHead align="right" dir={dirOf('rs')} onSort={() => toggle('rs')}>RS pp</LuxSortHead>
            <th>Regime</th>
            <LuxSortHead align="right" dir={dirOf('stretch')} onSort={() => toggle('stretch')}>Stretch</LuxSortHead>
          </tr>
        </thead>
        <tbody ref={tbody}>
          {rows.map((s) => (
            <tr key={s.id} data-row={s.id} className={s.id === activeId ? 'on' : undefined}>
              <td data-num>
                <FlashNum v={s.rank} fmt={(v) => (v == null ? '—' : String(v))} className="sx-rank" />
                {s.live && (s.live.rank15 != null || s.live.rank30 != null) ? (
                  <span className="sx-rmoves"><RankMove now={s.rank} then={s.live.rank15} label="15m" /><RankMove now={s.rank} then={s.live.rank30} label="30m" /></span>
                ) : s.rankDelta ? <span className={`sx-delta ${s.rankDelta > 0 ? 'sx-c-up' : 'sx-c-dn'}`} title={`rank change over ${s.history.length} sessions`}>{s.rankDelta > 0 ? '▲' : '▼'}{Math.abs(s.rankDelta)}</span> : null}
              </td>
              <td>
                <button type="button" className="sx-name" onClick={() => onOpen(s.id)}>{s.label}</button>
                <MembersRead s={s} />
              </td>
              {showLive && <td title={s.live?.irank != null ? `intraday rank #${s.live.irank}${s.live.irankOpen != null ? ` (#${s.live.irankOpen} at the open)` : ''}` : undefined}><Spark v={s.live?.spark} points={points} /></td>}
              <td><ConsensusChip c={s.consensus} /></td>
              {cols.map((c) => <td key={c.key} data-num>{c.cell(s)}</td>)}
              <td data-num className={tone(s.r3)}>{pct(s.r3)}</td>
              <td data-num className={tone(s.r10)}>{pct(s.r10)}</td>
              <td data-num className={tone(s.r20)}>{pct(s.r20)}</td>
              <td data-num><Bar v={s.breadth} /></td>
              <td data-num className={tone(s.rs)}>{pp(s.rs)}</td>
              <td><RegimeTag r={s.regime} /></td>
              <td data-num title={s.drawdown != null ? `drawdown from the 55-session high ${pct(s.drawdown)}` : undefined}>{pct(s.stretch)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Bar({ v }: { v: number | null }) {
  if (v == null) return <span className="sx-mute">—</span>;
  return <span className="sx-bar" title={`${v}% of members above their 20-day MA`}><span style={{ width: `${Math.max(2, Math.min(100, v))}%` }} />{v}%</span>;
}

// ─── 3. overnight ────────────────────────────────────────────────────────

function Overnight({ data, onOpen }: { data: BoardPayload; onOpen: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const ov = data.overnight;
  if (!ov.kind) return <div className="sx-empty">No overnight read yet — pre-market gaps are read at 08:45 and 09:20 ET, after-hours at 16:15 and 17:45 ET.</div>;
  const drift = data.sectors.filter((s) => s.overnight.driftPct != null).sort((a, b) => Math.abs(b.overnight.driftPct!) - Math.abs(a.overnight.driftPct!)).slice(0, all ? 40 : 8);
  const label = (id: string) => data.sectors.find((s) => s.id === id)?.label ?? id;
  return (
    <div className="sx-ov">
      <div className="sx-ov-meta"><FreshStamp asOf={ov.at} label={ov.kind === 'premarket' ? 'pre-market' : 'after-hours'} /> <span className="sx-mute">last print read {etTime(ov.at)} · movers ≥ 2% · drift = median member move</span></div>
      <div className="sx-ov-grid">
        <div>
          <h3 className="sx-h3">Sector drift</h3>
          <ul className="sx-ov-list">
            {drift.map((s) => (
              <li key={s.id}>
                <button type="button" className="sx-name" onClick={() => onOpen(s.id)}>{s.label}</button>
                <span className="sx-mute">{s.overnight.n} read</span>
                <GapFlag s={s} />
              </li>
            ))}
          </ul>
          {data.sectors.filter((s) => s.overnight.driftPct != null).length > 8 && <button type="button" className="sx-more" onClick={() => setAll(!all)}>{all ? 'Show fewer' : 'Show all sectors'}</button>}
        </div>
        <div>
          <h3 className="sx-h3">Movers</h3>
          {ov.movers.length === 0 ? <div className="sx-mute">No member moved ≥ 2%.</div> : (
            <ul className="sx-movers">
              {ov.movers.slice(0, all ? 40 : 14).map((m) => (
                <li key={m.symbol}>
                  <Link href={`/r/${m.symbol}`} className="sx-sym">{m.symbol}</Link>
                  <b className={tone(m.movePct)}>{pct(m.movePct)}</b>
                  <span className="sx-mute">{m.sectors.map(label).join(' · ')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 4. sector panel ─────────────────────────────────────────────────────

function SectorPanel({ id, sectors, live, onOpen }: { id: string; sectors: BoardSector[]; live: boolean; onOpen: (id: string, scroll?: boolean) => void }) {
  const q = useQuery<PanelPayload>({ queryKey: ['/api/sectors', id], queryFn: getJson(`/api/sectors/${encodeURIComponent(id)}`), refetchInterval: live ? 30_000 : 60_000, staleTime: 20_000, retry: 1 });
  const [allLeaders, setAllLeaders] = useState(false);
  const idx = sectors.findIndex((s) => s.id === id);
  const prev = idx > 0 ? sectors[idx - 1] : null; const next = idx >= 0 && idx < sectors.length - 1 ? sectors[idx + 1] : null;
  if (q.isError && !q.data) return <div className="sx-empty">This sector didn&rsquo;t load. <button type="button" className="sx-link-btn" onClick={() => q.refetch()}>Retry</button></div>;
  if (!q.data) return <div className="sx-empty" role="status">Reading the sector…</div>;
  const s = q.data.sector;
  const side = s.side ?? 'long';
  const leaders = allLeaders ? s.leaders : s.leaders.slice(0, 3);
  return (
    <div className="sx-panel" aria-live="polite">
      <div className="sx-panel-head">
        <div>
          <h2 id="sx-panel-h" className="sx-h2">{s.label} <span className="sx-mute sx-h2-sub">#{s.rank ?? '—'} · {s.membersRead}/{s.memberCount} members read{s.etf ? ` · ${s.etf}` : ''}{s.thematic ? ' · thematic overlay' : ''}</span></h2>
          {(s.unread?.length ?? 0) > 0 && <div className="sx-unread">Not read: {s.unread!.map((u) => `${u.symbol} (${u.reason})`).join(' · ')}</div>}
          <div className="sx-panel-tags">
            <RegimeTag r={s.regime} />
            <span className="sx-chip">{side === 'long' ? 'read long-side' : 'read short-side'}</span>
            <ConsensusChip c={s.consensus} />
            <FreshStamp asOf={q.data.asOf} label="published" warn={q.data.stamp?.stale} />
          </div>
        </div>
        <div className="sx-panel-nav">
          {prev && <button type="button" className="sx-link-btn" onClick={() => onOpen(prev.id, false)}>← {prev.label}</button>}
          {next && <button type="button" className="sx-link-btn" onClick={() => onOpen(next.id, false)}>{next.label} →</button>}
        </div>
      </div>

      {s.live && <LiveKpis l={s.live} phase={q.data.live?.phase ?? q.data.phase} points={q.data.live?.points ?? []} />}

      <div className="sx-kpis">
        {([['1D', pct(s.r1), s.r1], ['3D', pct(s.r3), s.r3], ['10D', pct(s.r10), s.r10], ['20D', pct(s.r20), s.r20], ['RS vs SPY', `${pp(s.rs)}pp`, s.rs], ['RS momentum', `${pp(s.rsMomentum)}pp`, s.rsMomentum]] as const).map(([k, v, raw]) => (
          <div className="sx-kpi" key={k}><i>{k}</i><b className={tone(raw)}>{v}</b></div>
        ))}
        <div className="sx-kpi"><i>Breadth</i><b>{s.breadth == null ? '—' : `${s.breadth}%`}</b><small>{s.highsPct ?? '—'}% at 20D highs · {s.lowsPct ?? '—'}% at lows</small></div>
        <div className="sx-kpi"><i>Stretch / drawdown</i><b>{pct(s.stretch)} / {pct(s.drawdown)}</b><small>vs 20D mean · vs 55D peak</small></div>
      </div>

      <details className="sx-why">
        <summary>Which signals agree ({s.consensus.bull} bullish · {s.consensus.bear} bearish of {s.consensus.n} read)</summary>
        <ul className="sx-cons-list">
          {s.consensus.signals.map((g) => <li key={g.key} data-lean={g.lean}><b>{g.lean === 'bull' ? '▲' : g.lean === 'bear' ? '▼' : g.lean === 'neutral' ? '•' : '–'} {g.label}</b> {g.detail}</li>)}
        </ul>
      </details>

      <h3 className="sx-h3">Leaders · confluence {side === 'short' ? '(short side — weakest first)' : ''}</h3>
      <div className="sx-leaders">
        {leaders.map((m, i) => <LeaderCard key={m.symbol} m={m} rank={i + 1} />)}
      </div>
      {s.leaders.length > 3 && <button type="button" className="sx-more" onClick={() => setAllLeaders(!allLeaders)}>{allLeaders ? 'Show top 3' : `Show all ${s.leaders.length} members`}</button>}

      <div className="sx-panel-grid">
        <div>
          <h3 className="sx-h3">Laggards · catch-up candidates</h3>
          {s.laggards.length === 0 ? <div className="sx-mute">No member is behind the sector on its side.</div> : (
            <ul className="sx-lag">
              {s.laggards.map((l) => <li key={l.symbol}><Link href={`/r/${l.symbol}`} className="sx-sym">{l.symbol}</Link><span>{l.why}</span></li>)}
            </ul>
          )}
        </div>
        <div>
          <h3 className="sx-h3">Overnight movers here</h3>
          {q.data.overnight.movers.length === 0 ? <div className="sx-mute">{q.data.overnight.kind ? 'No member moved ≥ 2% overnight.' : 'No overnight read yet.'}</div> : (
            <ul className="sx-movers">
              {q.data.overnight.movers.map((m) => <li key={m.symbol}><Link href={`/r/${m.symbol}`} className="sx-sym">{m.symbol}</Link><b className={tone(m.movePct)}>{pct(m.movePct)}</b><span className="sx-mute">{m.kind === 'premarket' ? 'pre-market' : 'after-hours'} {etTime(m.at)}</span></li>)}
            </ul>
          )}
          <h3 className="sx-h3">NEXUS ideas in this sector</h3>
          {s.ideas.length === 0 ? <div className="sx-mute">No open NEXUS idea on a member.</div> : (
            <ul className="sx-ideas">
              {s.ideas.map((i) => (
                <li key={i.id}>
                  <Link href={`/r/${i.symbol}`} className="sx-sym">{i.symbol}</Link>
                  <span className={i.direction === 'long' ? 'sx-up' : 'sx-dn'}>{i.direction === 'long' ? '▲ long' : '▼ short'}</span>
                  <span className={`sx-flag sx-flag-${i.tag === 'with' ? 'confirms' : i.tag === 'against' ? 'fights' : 'flat'}`}>{i.tag === 'with' ? 'with rotation' : i.tag === 'against' ? 'against rotation' : 'no rotation side'}</span>
                  <span className="sx-mute">{i.source ?? ''}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function LiveKpis({ l, phase, points }: { l: SectorLive; phase: string; points: LivePoint[] }) {
  const sess = phase === 'session' || phase === 'close';
  return (
    <div className="sx-live-kpis" aria-label="Live read">
      <div className="sx-kpi sx-kpi-spark"><i>Today&rsquo;s path</i><Spark v={l.spark} points={points} w={180} h={34} /><small>{l.quoted}/{l.total} quoted this pass</small></div>
      <div className="sx-kpi"><i>Today</i><b className={tone(l.today)}><FlashNum v={l.today} fmt={(v) => pct(v, 2)} /></b><small>vs the prior close</small></div>
      {sess && <div className="sx-kpi"><i>Since open</i><b className={tone(l.sinceOpen)}><FlashNum v={l.sinceOpen} fmt={(v) => pct(v, 2)} /></b></div>}
      {sess && <div className="sx-kpi"><i>Last 30m</i><b className={tone(l.last30m)}><FlashNum v={l.last30m} fmt={(v) => pct(v, 2)} /></b></div>}
      {phase === 'premarket' && <div className="sx-kpi"><i>Pre-mkt</i><b className={tone(l.preMkt)}>{pct(l.preMkt)}</b><small>median member</small></div>}
      {phase === 'after_hours' && <div className="sx-kpi"><i>After-hrs</i><b className={tone(l.afterHrs)}>{pct(l.afterHrs)}</b><small>median member</small></div>}
      <div className="sx-kpi"><i>Up / down</i><b><UpDn l={l} /></b></div>
      <div className="sx-kpi"><i>Intraday rank</i><b>#{l.irank ?? '—'}</b><small>{l.irankOpen != null ? `#${l.irankOpen} at the open` : 'by today\'s move'}{l.irank30 != null ? ` · #${l.irank30} 30m ago` : ''}</small></div>
    </div>
  );
}

function LeaderCard({ m, rank }: { m: MemberRead; rank: number }) {
  return (
    <article className="sx-leader">
      <div className="sx-leader-top">
        <span className="sx-rank">{rank}</span>
        <Link href={`/r/${m.symbol}`} className="sx-sym sx-sym-lg">{m.symbol}</Link>
        <span className="sx-mute">{m.last != null ? `$${m.last.toFixed(2)}` : ''}</span>
        <span className={tone(m.r1)}>{pct(m.r1)}</span>
        <span className="sx-score" title="weighted share of the components that could be read — weights unvalidated">{m.score == null ? '—' : m.score}<small>/100 · {m.passed}/{m.available} ✓</small></span>
      </div>
      <ul className="sx-chips">
        {m.chips.map((c) => (
          <li key={c.key} data-state={c.state} title={`${c.label}: ${c.detail} (weight ${c.weight})`}>
            <span aria-hidden>{c.state === 'pass' ? '✓' : c.state === 'fail' ? '✗' : '–'}</span> {c.label}
            <span className="sr-only"> {c.state === 'pass' ? 'passes' : c.state === 'fail' ? 'fails' : 'not read'}: {c.detail}</span>
          </li>
        ))}
      </ul>
      <details className="sx-chip-why">
        <summary>What each component read</summary>
        <ul>
          {m.chips.map((c) => <li key={c.key} data-state={c.state}><b>{c.state === 'pass' ? '✓' : c.state === 'fail' ? '✗' : '–'} {c.label}</b> <span>{c.detail}</span> <i>w{c.weight}</i></li>)}
        </ul>
      </details>
      {m.earnings && <div className="sx-mute sx-earn">earnings {m.earnings}</div>}
    </article>
  );
}

// ─── footer ──────────────────────────────────────────────────────────────

function Footer({ data }: { data: BoardPayload }) {
  const f = data.forward;
  return (
    <div className="sx-foot">
      <p>{data.honesty}</p>
      {f && (
        <p>
          <b>Forward log</b> {f.rows ? `${f.rows} rows since ${f.since ?? '—'}` : 'starts at the next 16:15 ET close'}
          {f.summary.filter((x) => x.n > 0).map((x) => ` · ${x.h}-session: n=${x.n}, mean excess vs sector ${pp(x.meanExcess)}pp, beat ${x.beatPct}%`).join('')}
          {f.summary.every((x) => x.n === 0) ? ' · no outcomes measured yet' : ''}
        </p>
      )}
      <p className="sx-mute">Regime: Leading (RS ≥ 0, RS momentum ≥ 0) · Weakening (RS ≥ 0, falling) · Lagging (RS &lt; 0, falling) · Improving (RS &lt; 0, rising). RS = sector 20-session equal-weight return − SPY; momentum = RS now − RS five sessions ago. Composite = 0.6 × mean cross-sector percentile of 3D/10D/20D/RS + 0.4 × breadth.</p>
      {data.notes.length > 0 && <ul className="sx-notes">{data.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
      <p className="sx-mute">
        Published {data.asOf ? new Date(data.asOf).toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET' : '—'} by the {data.stamp?.source ?? 'worker'}
        {data.coverage ? ` · members read ${data.coverage.readNow}/${data.coverage.members} (${data.coverage.withBars} with bars)` : ''}
        {data.live ? ` · live pass ${etTime(data.live.asOf)}: ${data.live.quoted}/${data.live.total} quoted in ${(data.live.compute.ms / 1000).toFixed(1)} s (RSS ${data.live.compute.rssMb} MB)` : ''}
        {data.compute ? ` · computed in ${(data.compute.ms / 1000).toFixed(1)} s over ${data.compute.symbols} symbols (worker RSS ${data.compute.rssBeforeMb}→${data.compute.rssAfterMb} MB)` : ''}
        {data.dataAsOf?.dailyClose ? ` · daily bars through ${data.dataAsOf.dailyClose}` : ''}
        {data.dataAsOf?.flow ? ` · flow ${etTime(data.dataAsOf.flow)}` : ''}. Research, not a recommendation.
      </p>
    </div>
  );
}
