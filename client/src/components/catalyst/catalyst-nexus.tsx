/**
 * CATALYST — the one screen composed from docs/DESIGN_SYSTEM.md without a
 * reference mock. Event-orange, calendar + impact table, no 3D.
 *
 * Everything is a live feed:
 *   cross-read   /api/catalysts/board — conviction picks joined to tracked
 *                events. Confluence / conflict / event-risk buckets with the
 *                producer's own methodology note. Binary events are risk,
 *                never tilt.
 *   impact table /api/catalysts/recent — the same 72h+14d window the short
 *                gate reads, filterable by impact. Symbol click opens the
 *                universal workup.
 *   macro queue  /api/economic-calendar — FRED's forward releases (the cash
 *                gate reads the same feed).
 *   distribution real counts over the recent window — never a chart of
 *                invented percentages.
 *
 * Coverage honesty: the news sentry rotates a watchlist slice on the free
 * tier, so an empty symbol is absence of coverage, not proof of quiet. The
 * sidebar says so.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useColResize } from '@/lib/use-col-resize';
import { openWorkup } from '@/lib/workup-bus';
import { Heartbeat } from '@/components/viz';
import '@/styles/nexus.css';

interface BoardSignal {
  symbol: string; direction?: string | null; convictionScore?: number | null;
  holdingPeriod?: string | null; horizonDays?: number | null;
  event?: { type?: string; title?: string; date?: string; daysAway?: number; polarity?: string; importance?: number; isBinary?: boolean };
  note?: string;
}
interface BoardPayload {
  generatedAt?: string; signalsScanned?: number; symbolsWithCatalysts?: number;
  confluence?: BoardSignal[]; conflict?: BoardSignal[]; eventRisk?: BoardSignal[]; unclaimed?: BoardSignal[];
  _meta?: { note?: string };
}
interface CatalystRow { id?: string; symbol?: string; title?: string; description?: string; source?: string; timestamp?: string; eventType?: string; impact?: string }
interface RecentPayload { asOf?: string; count?: number; catalysts?: CatalystRow[] }
interface EconPayload {
  upcoming?: { name: string; date: string; time?: string; importance?: string; description?: string }[];
  coverage?: { source?: string; current?: boolean; lastDate?: string };
}

const fetchJson = (url: string) => async () => {
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error(`${url} failed`);
  return r.json();
};

function relTime(iso?: string): string {
  if (!iso) return '—';
  const m = (Date.now() - Date.parse(iso)) / 60_000;
  if (!Number.isFinite(m)) return '—';
  if (m < 60) return `${Math.max(1, Math.round(m))}m`;
  if (m < 36 * 60) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

function BoardCard({ s, accent }: { s: BoardSignal; accent: string }) {
  const dir = (s.direction ?? 'long').toLowerCase();
  return (
    <div className="board-card" style={{ ['--bc-accent' as string]: accent }} onClick={() => openWorkup(s.symbol)}>
      <div className="bc-top">
        <div className="bc-sym">{s.symbol}</div>
        <div className={`bc-dir ${dir === 'short' ? 'short' : 'long'}`}>{dir}</div>
        {s.event?.daysAway != null && <div className="bc-dist">{s.event.daysAway === 0 ? 'today' : `${s.event.daysAway}d`}</div>}
      </div>
      {s.event?.title && <div className="bc-event">{s.event.title}{s.event.date ? ` · ${s.event.date}` : ''}</div>}
      {s.note && <div className="bc-note">{s.note}</div>}
      {s.event?.isBinary && <span className="bc-binary">⚠ binary · risk not tilt</span>}
    </div>
  );
}

type ImpactTab = 'all' | 'high' | 'medium' | 'low';

export function CatalystNexus() {
  const rail = useColResize('nx-cat-side', 320, { sign: -1, min: 240, max: 520 });
  const [impactTab, setImpactTab] = useState<ImpactTab>('all');

  const { data: board } = useQuery<BoardPayload>({ queryKey: ['/api/catalysts/board', 'cat'], queryFn: fetchJson('/api/catalysts/board'), refetchInterval: 300_000, staleTime: 120_000, retry: 1 });
  const { data: recent } = useQuery<RecentPayload>({ queryKey: ['/api/catalysts/recent', 'cat'], queryFn: fetchJson('/api/catalysts/recent'), refetchInterval: 300_000, staleTime: 120_000, retry: 1 });
  const { data: econ } = useQuery<EconPayload>({ queryKey: ['/api/economic-calendar', 'cat'], queryFn: fetchJson('/api/economic-calendar'), refetchInterval: 600_000, staleTime: 300_000, retry: 1 });

  const rows = useMemo(() => (recent?.catalysts ?? []).slice().sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? '')), [recent]);
  const filtered = impactTab === 'all' ? rows : rows.filter((r) => (r.impact ?? 'low') === impactTab);
  const counts = useMemo(() => ({
    high: rows.filter((r) => r.impact === 'high').length,
    medium: rows.filter((r) => r.impact === 'medium').length,
    low: rows.filter((r) => (r.impact ?? 'low') === 'low').length,
  }), [rows]);
  const typeCounts = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => { const t = r.eventType ?? 'news'; m.set(t, (m.get(t) ?? 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [rows]);
  const maxType = Math.max(1, ...typeCounts.map(([, n]) => n));

  const confluence = board?.confluence ?? [];
  const conflict = board?.conflict ?? [];
  const eventRisk = board?.eventRisk ?? [];
  const upcoming = econ?.upcoming ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const distinctSyms = new Set(rows.map((r) => r.symbol).filter(Boolean)).size;

  return (
    <div className="catalystlab">
      <div className={`nx-resize${rail.dragging ? ' active' : ''}`} style={{ right: rail.width - 4 }} title="Drag to resize · double-click to expand" {...rail.handleProps} />

      {/* ══════════ MAIN ══════════ */}
      <div className="col" style={{ display: 'flex', flexDirection: 'column', ['--nx-side' as string]: `${rail.width}px` }}>
        <div className="cat-header">
          <div className="cat-eyebrow">Event intelligence</div>
          <div className="cat-title">CATALYST</div>
          <div className="cat-desc">
            Tracked events joined to live signals. <b>Binary events are risk, never directional tilt</b> — a catalyst inside a
            signal's horizon flags SIZE DOWN, a conflicting one flags re-read, and the short gate refuses names with no dated event at all.
          </div>
          <div className="cat-meta">
            <span className="tag event" style={{ display: 'inline-flex', gap: 6 }}>
              board <Heartbeat since={board?.generatedAt ?? null} staleAfterSec={900} />
            </span>
            <span className="tag live"><span className="dot" />{recent?.count ?? 0} rows · 72h+14d</span>
            <span className="tag mute">{counts.high} high impact</span>
          </div>
        </div>

        {/* STATS */}
        <div className="stats-bar">
          <div className="stat-card">
            <div className="stat-label">Signals scanned</div>
            <div className="stat-val event">{board?.signalsScanned ?? '—'}</div>
            <div className="stat-sub">{board?.symbolsWithCatalysts ?? '—'} carry tracked events</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Confluence</div>
            <div className="stat-val green">{confluence.length}</div>
            <div className="stat-sub">event agrees with direction</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Conflict</div>
            <div className="stat-val red">{conflict.length}</div>
            <div className="stat-sub">event opposes — re-read flag</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Event risk</div>
            <div className="stat-val amber">{eventRisk.length}</div>
            <div className="stat-sub">binary inside horizon</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Next release</div>
            <div className="stat-val event">{upcoming[0]?.name ?? '—'}</div>
            <div className="stat-sub">{upcoming[0] ? `${upcoming[0].date === today ? 'today' : upcoming[0].date}${upcoming[0].time ? ` · ${upcoming[0].time}` : ''}` : 'calendar empty'}</div>
          </div>
        </div>

        {/* SIGNAL × EVENT CROSS-READ */}
        <div className="board-section">
          <div className="board-head">
            <div className="board-label">Signal × event cross-read</div>
            <div className="it-source">{board?.generatedAt ? `generated ${relTime(board.generatedAt)} ago` : ''}</div>
          </div>
          <div className="board-groups">
            <div className="board-group confluence">
              <div className="board-group-head">Confluence <span className="count">{confluence.length}</span></div>
              <div className="board-cards">
                {confluence.map((s) => <BoardCard key={`cf-${s.symbol}`} s={s} accent="var(--green)" />)}
                {confluence.length === 0 && <div className="board-empty">No tracked event currently agrees with a published direction. Empty means no join — not that nothing is coming.</div>}
              </div>
            </div>
            <div className="board-group conflict">
              <div className="board-group-head">Conflict <span className="count">{conflict.length}</span></div>
              <div className="board-cards">
                {conflict.map((s) => <BoardCard key={`cn-${s.symbol}`} s={s} accent="var(--red)" />)}
                {conflict.length === 0 && <div className="board-empty">No tracked event opposes a published direction right now. A conflict is a re-read flag, not an automatic exit.</div>}
              </div>
            </div>
            <div className="board-group risk">
              <div className="board-group-head">Event risk <span className="count">{eventRisk.length}</span></div>
              <div className="board-cards">
                {eventRisk.slice(0, 6).map((s) => <BoardCard key={`er-${s.symbol}-${s.event?.date}`} s={s} accent="var(--event)" />)}
                {eventRisk.length > 6 && <div className="it-source" style={{ padding: '2px 0' }}>+{eventRisk.length - 6} more inside horizon</div>}
                {eventRisk.length === 0 && <div className="board-empty">No binary event inside any live signal's horizon.</div>}
              </div>
            </div>
          </div>
        </div>

        {/* IMPACT TABLE */}
        <div className="table-section">
          <div className="table-head">
            <div className="table-label">Impact table · ingested catalysts, graded</div>
            <div className="table-tabs">
              {([['all', `All · ${rows.length}`], ['high', `High · ${counts.high}`], ['medium', `Med · ${counts.medium}`], ['low', `Low · ${counts.low}`]] as const).map(([k, label]) => (
                <div key={k} className={`table-tab${impactTab === k ? ' active' : ''}`} onClick={() => setImpactTab(k as ImpactTab)}>{label}</div>
              ))}
            </div>
          </div>
          <table className="impact-table">
            <thead>
              <tr><th>Age</th><th>Symbol</th><th>Type</th><th>Impact</th><th>Headline</th><th>Source</th></tr>
            </thead>
            <tbody>
              {filtered.slice(0, 60).map((r) => (
                <tr key={r.id ?? `${r.symbol}-${r.timestamp}`} onClick={() => r.symbol && openWorkup(r.symbol)} title={r.description ?? ''}>
                  <td><div className="it-time">{relTime(r.timestamp)}</div></td>
                  <td><div className="it-sym">{r.symbol ?? '—'}</div></td>
                  <td><span className={`it-type ${r.eventType ?? 'news'}`}>{r.eventType ?? 'news'}</span></td>
                  <td><span className={`it-impact ${r.impact ?? 'low'}`}>{r.impact ?? 'low'}</span></td>
                  <td><div className="it-title">{r.title ?? r.description ?? '—'}</div></td>
                  <td><div className="it-source">{(r.source ?? '—').split(':').pop()}</div></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6}><div className="board-empty" style={{ margin: '10px 0' }}>No rows at this impact grade in the current window.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══════════ RIGHT SIDEBAR ══════════ */}
      <div className="col col-right" style={{ width: rail.width, minWidth: rail.width }}>
        <div className="sec-head">
          <div className="sec-num" style={{ color: 'var(--event-bright)', textShadow: '0 0 8px rgba(251,146,60,0.4)' }}>Event intelligence</div>
          <div className="sec-title" style={{ background: 'linear-gradient(135deg,#fff,var(--event-bright))', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Events are risk first.</div>
          <div className="sec-sub">The calendar and the tape, joined to the signals they touch. Sizing decisions live here — direction never does.</div>
          <div className="sec-meta">
            <span className="tag event">CATALYST</span>
            <span className="tag live"><span className="dot" />engaged</span>
          </div>
        </div>

        {/* MACRO CALENDAR */}
        <div className="cal">
          <div className="cal-head">
            <div className="cal-label">Macro calendar · FRED</div>
            <div className="cal-count">{upcoming.length} scheduled</div>
          </div>
          <div className="cal-list">
            {upcoming.slice(0, 7).map((e) => (
              <div className="cal-item" key={`${e.name}-${e.date}`} title={e.description ?? ''}>
                <div>
                  <div className="cal-name">{e.name}</div>
                  <div className="cal-meta">{e.date}{e.time ? ` · ${e.time}` : ''}{e.importance ? ` · ${e.importance}` : ''}</div>
                </div>
                <div className={`cal-eta${e.date === today ? ' today' : ''}`}>{e.date === today ? 'today' : `${Math.max(0, Math.round((Date.parse(e.date) - Date.now()) / 86_400_000))}d`}</div>
              </div>
            ))}
            {upcoming.length === 0 && <div className="board-empty">No releases in the calendar window{econ?.coverage?.current === false ? ' — calendar coverage is STALE' : ''}.</div>}
          </div>
        </div>

        {/* DISTRIBUTION — real counts */}
        <div className="dist">
          <div className="cal-head">
            <div className="cal-label">Window distribution</div>
            <div className="it-source">{distinctSyms} symbols</div>
          </div>
          {typeCounts.map(([t, n]) => (
            <div className="dist-row" key={t}>
              <span className="k">{t}</span>
              <div className="track"><div className="fill" style={{ width: `${(n / maxType) * 100}%` }} /></div>
              <span className="v">{n}</span>
            </div>
          ))}
          {typeCounts.length === 0 && <div className="board-empty">No rows in the window.</div>}
        </div>

        {/* COVERAGE HONESTY */}
        <div className="coverage-note">
          <b>Coverage disclosure:</b> the news sentry rotates a 12-name watchlist slice every 30 minutes on the free tier.
          A symbol with no rows here has not been read recently — that is absence of coverage, not proof of quiet.
          Shorts on uncovered names stay blocked (the gate fails closed).
        </div>

        <div className="coverage-note" style={{ marginTop: 0 }}>
          <b>Methodology:</b> {board?._meta?.note ?? 'Catalysts joined to live conviction picks. Binary events are counted as risk, never as directional tilt.'}
        </div>

        <div className="disclaimer">
          Educational only · not investment advice.<br />
          Events change sizing — theses change direction.
        </div>
      </div>
    </div>
  );
}

export default CatalystNexus;
