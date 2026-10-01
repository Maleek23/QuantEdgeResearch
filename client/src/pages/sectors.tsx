/**
 * SECTORS — the rotation board (/t?tab=sectors).
 *
 *   1. Rank flow     each sector's composite rank over the last 10 sessions;
 *                    top climbers blue, sliders vermilion, the rest grey; tap a
 *                    line or a legend chip to isolate it
 *   2. Rankings      sortable table (stacked cards on phones): rank, members,
 *                    consensus x/N (which signals agree, on hover/tap), 1D/3D/
 *                    10D/20D, breadth, RS, regime, stretch, overnight drift
 *   3. Overnight     pre-market gappers / after-hours movers mapped to sectors
 *   4. Sector panel  leaders with confluence chips, laggards (catch-up), the
 *                    sector's overnight movers, NEXUS ideas with/against
 *
 * Reads GET /api/sectors/board and /api/sectors/:id — the worker's published
 * snapshot (server/sector-board.ts). Every number is stamped with its age and
 * everything is "measuring": the composite, regime rules, consensus and the
 * confluence weights are unvalidated until the forward log says otherwise.
 * Plain scrolling page in the landing style (nexus.css .landing); no tiles.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/components/theme-provider';
import { FreshStamp, usePhone } from '@/components/ui/qe-phone';
import { HoverHint, LuxSortHead, nextSort, type LuxSortDir } from '@/components/lux';
import type { Consensus, MemberRead, OvernightMover, RankPoint, Regime, SectorRow } from '@shared/sector-board';
import '@/styles/nexus.css';
import '@/styles/sectors.css';

// ─── payloads ────────────────────────────────────────────────────────────

type BoardSector = Omit<SectorRow, 'leaders' | 'laggards' | 'ideas'> & {
  leaders: Array<{ symbol: string; score: number | null; passed: number; available: number; r1: number | null; relSector: number | null }>;
  laggards: Array<{ symbol: string; relSector: number }>;
  ideas: { with: number; against: number; total: number };
};
interface Stamp { source: string; asOf: string | null; ageSec: number | null; stale: boolean }
interface BoardPayload {
  asOf: string | null; dateKey?: string; phase: string | null; sessionThrough?: string | null;
  provisional?: { date: string; quotesAt: string | null; quotes: number } | null;
  sessions: string[]; sectors: BoardSector[]; climbers: string[]; sliders: string[];
  overnight: { kind: 'premarket' | 'after_hours' | null; at: string | null; movers: OvernightMover[] };
  forward?: { rows: number; summary: Array<{ h: number; n: number; meanExcess: number | null; beatPct: number | null }>; since: string | null };
  dataAsOf?: Record<string, string | null>; notes: string[]; cadence: string; honesty: string; stamp: Stamp;
  compute?: { ms: number; rssBeforeMb: number; rssAfterMb: number; heapDeltaMb: number; symbols: number };
}
interface PanelPayload {
  sector: SectorRow; asOf: string; phase: string; sessions: string[]; sessionThrough: string | null;
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
  const board = useQuery<BoardPayload>({ queryKey: ['/api/sectors/board'], queryFn: getJson('/api/sectors/board'), refetchInterval: 60_000, staleTime: 30_000, retry: 1 });
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
          <div className="hero-eyebrow"><span className="pill">SECTORS</span>Rotation board{data?.sessionThrough ? ` · sessions through ${data.sessionThrough}` : ''}{data?.phase ? ` · ${PHASE[data.phase] ?? data.phase}` : ''}</div>
          <h1 id="sx-title" className="sx-title">Where money is <span className="grad">rotating</span></h1>
          <p className="sx-purpose">Equal-weight sector reads ranked by momentum and breadth, the overnight tape mapped onto them, and the members leading each group — with every confluence component shown.</p>
          <div className="sx-hero-meta">
            <FreshStamp asOf={data?.asOf ?? null} label="published" warn={data?.stamp?.stale} />
            <span className="sx-measuring" title={data?.honesty}>MEASURING</span>
            {data?.provisional && <span className="sx-chip">today provisional · quotes {etTime(data.provisional.quotesAt)}</span>}
            {data?.cadence && <span className="sx-cadence">{data.cadence}</span>}
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
              <Rankings sectors={sectors} activeId={active} onOpen={open} />
            </div>
          </section>

          <section aria-labelledby="sx-ov-h">
            <div className="container">
              <div className="sec-eyebrow">03 · Overnight movers</div>
              <h2 id="sx-ov-h" className="sx-h2">{data.overnight.kind === 'after_hours' ? 'After-hours movers' : 'Pre-market gappers'} by sector</h2>
              <Overnight data={data} onOpen={open} />
            </div>
          </section>

          <section aria-labelledby="sx-panel-h" ref={panelRef as never}>
            <div className="container">
              <div className="sec-eyebrow">04 · Inside the sector</div>
              {active ? <SectorPanel id={active} sectors={sectors} onOpen={open} /> : <div className="sx-empty">Pick a sector above.</div>}
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
      <div className="sx-stat">
        <div className="sx-stat-k">Overnight vs rotation</div>
        <div className="sx-stat-v">{data.overnight.kind ? `${confirms} confirm · ${fights} fight` : 'not read'}</div>
        <div className="sx-stat-s">{data.overnight.kind ? `${data.overnight.kind === 'premarket' ? 'pre-market' : 'after-hours'} · last print ${etTime(data.overnight.at)}` : 'read at 08:45 / 09:20 ET'}</div>
      </div>
    </div>
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
                {(!phone || i % 2 === (cols - 1) % 2) && <text x={x(i)} y={H - 8} textAnchor="middle" className="sx-axis">{data.provisional && i === cols - 1 ? 'today*' : shortDate(d)}</text>}
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
                  <circle cx={x(cols - 1)} cy={y(lastPt.rank)} r={3} fill={iso === s.id ? 'var(--sx-iso)' : colorOf(s.id)} />
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
          <span>Rank 1 at the top. Blue ▲ = top {data.climbers.length} climbers, vermilion ▼ = top {data.sliders.length} sliders over the window; tap a line or chip to isolate it.{data.provisional ? ' * today is priced from live quotes and moves until the close.' : ''}</span>
        )}
      </div>
    </div>
  );
}

// ─── 2. rankings ─────────────────────────────────────────────────────────

type SortKey = 'rank' | 'consensus' | 'r1' | 'r3' | 'r10' | 'r20' | 'breadth' | 'rs' | 'stretch' | 'overnight';
const SORT_VAL: Record<SortKey, (s: BoardSector) => number | null> = {
  rank: (s) => (s.rank == null ? null : -s.rank),
  consensus: (s) => s.consensus.bull - s.consensus.bear,
  r1: (s) => s.r1, r3: (s) => s.r3, r10: (s) => s.r10, r20: (s) => s.r20,
  breadth: (s) => s.breadth, rs: (s) => s.rs, stretch: (s) => s.stretch, overnight: (s) => s.overnight.driftPct,
};

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

function Rankings({ sectors, activeId, onOpen }: { sectors: BoardSector[]; activeId: string | null; onOpen: (id: string) => void }) {
  const phone = usePhone();
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

  if (phone) {
    return (
      <div className="sx-cards">
        {shown.map((s) => (
          <article key={s.id} className={`sx-card${s.id === activeId ? ' on' : ''}`}>
            <button type="button" className="sx-card-hit" onClick={() => onOpen(s.id)} aria-label={`Open ${s.label}`}>
              <div className="sx-card-top">
                <span className="sx-rank">#{s.rank ?? '—'}</span>
                <span className="sx-card-name">{s.label}{s.thematic && <span className="sx-theme">theme</span>}</span>
                <RegimeTag r={s.regime} />
              </div>
              <div className="sx-card-grid">
                <span><i>1D</i><b className={tone(s.r1)}>{pct(s.r1)}</b></span>
                <span><i>3D</i><b className={tone(s.r3)}>{pct(s.r3)}</b></span>
                <span><i>10D</i><b className={tone(s.r10)}>{pct(s.r10)}</b></span>
                <span><i>20D</i><b className={tone(s.r20)}>{pct(s.r20)}</b></span>
                <span><i>Breadth</i><b>{s.breadth == null ? '—' : `${s.breadth}%`}</b></span>
                <span><i>RS</i><b className={tone(s.rs)}>{pp(s.rs)}</b></span>
                <span><i>Stretch</i><b>{pct(s.stretch)}</b></span>
                <span><i>Overnight</i><b><GapFlag s={s} /></b></span>
              </div>
            </button>
            <div className="sx-card-foot">
              <ConsensusChip c={s.consensus} />
              <span className="sx-mute">{s.membersRead}/{s.memberCount} read{s.rankDelta ? ` · ${s.rankDelta > 0 ? '▲' : '▼'}${Math.abs(s.rankDelta)} in 10` : ''}</span>
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
            <LuxSortHead dir={dirOf('consensus')} onSort={() => toggle('consensus')}>Consensus</LuxSortHead>
            <LuxSortHead align="right" dir={dirOf('r1')} onSort={() => toggle('r1')}>1D</LuxSortHead>
            <LuxSortHead align="right" dir={dirOf('r3')} onSort={() => toggle('r3')}>3D</LuxSortHead>
            <LuxSortHead align="right" dir={dirOf('r10')} onSort={() => toggle('r10')}>10D</LuxSortHead>
            <LuxSortHead align="right" dir={dirOf('r20')} onSort={() => toggle('r20')}>20D</LuxSortHead>
            <LuxSortHead align="right" dir={dirOf('breadth')} onSort={() => toggle('breadth')}>Breadth</LuxSortHead>
            <LuxSortHead align="right" dir={dirOf('rs')} onSort={() => toggle('rs')}>RS pp</LuxSortHead>
            <th>Regime</th>
            <LuxSortHead align="right" dir={dirOf('stretch')} onSort={() => toggle('stretch')}>Stretch</LuxSortHead>
            <LuxSortHead align="right" dir={dirOf('overnight')} onSort={() => toggle('overnight')}>Overnight</LuxSortHead>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className={s.id === activeId ? 'on' : undefined}>
              <td data-num><span className="sx-rank">{s.rank ?? '—'}</span>{s.rankDelta ? <span className={`sx-delta ${s.rankDelta > 0 ? 'sx-c-up' : 'sx-c-dn'}`}>{s.rankDelta > 0 ? '▲' : '▼'}{Math.abs(s.rankDelta)}</span> : null}</td>
              <td>
                <button type="button" className="sx-name" onClick={() => onOpen(s.id)}>{s.label}</button>
                <span className="sx-mute sx-members">{s.membersRead}/{s.memberCount}{s.etf ? ` · ${s.etf}` : ''}{s.thematic ? ' · theme' : ''}</span>
              </td>
              <td><ConsensusChip c={s.consensus} /></td>
              <td data-num className={tone(s.r1)}>{pct(s.r1)}</td>
              <td data-num className={tone(s.r3)}>{pct(s.r3)}</td>
              <td data-num className={tone(s.r10)}>{pct(s.r10)}</td>
              <td data-num className={tone(s.r20)}>{pct(s.r20)}</td>
              <td data-num><Bar v={s.breadth} /></td>
              <td data-num className={tone(s.rs)}>{pp(s.rs)}</td>
              <td><RegimeTag r={s.regime} /></td>
              <td data-num title={s.drawdown != null ? `drawdown from the 55-session high ${pct(s.drawdown)}` : undefined}>{pct(s.stretch)}</td>
              <td data-num><GapFlag s={s} /></td>
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

function SectorPanel({ id, sectors, onOpen }: { id: string; sectors: BoardSector[]; onOpen: (id: string, scroll?: boolean) => void }) {
  const q = useQuery<PanelPayload>({ queryKey: ['/api/sectors', id], queryFn: getJson(`/api/sectors/${encodeURIComponent(id)}`), refetchInterval: 60_000, staleTime: 30_000, retry: 1 });
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
        {data.compute ? ` · computed in ${(data.compute.ms / 1000).toFixed(1)} s over ${data.compute.symbols} symbols (worker RSS ${data.compute.rssBeforeMb}→${data.compute.rssAfterMb} MB)` : ''}
        {data.dataAsOf?.dailyClose ? ` · daily bars through ${data.dataAsOf.dailyClose}` : ''}
        {data.dataAsOf?.flow ? ` · flow ${etTime(data.dataAsOf.flow)}` : ''}. Research, not a recommendation.
      </p>
    </div>
  );
}
