/**
 * SECTOR IGNITION — which peer groups are igniting, on four horizons.
 * GET /api/sector-ignition?horizon=intraday|daily|swing|weekly (server/sector-ignition.ts).
 *
 * Used three ways, one component:
 *   • Today — a plain band with horizon tabs (SectorIgnitionBand)
 *   • NEXUS — the compact tool 'nexus-sector-ignition' (SectorIgnitionTool)
 *   • the 0DTE desk — intraday only (SectorIgnitionPanel horizons={['intraday']})
 * Rows: stage chip, group + ETF, ETF move, vs SPY, breadth %, flow count,
 * leaders / laggards chips (→ /r/SYM), the read's own age. Open a row for the
 * why-lines and key levels. Every read is "measuring" — unvalidated thresholds.
 */
import { useMemo, useState } from 'react';
import { PEER_GROUPS } from '@shared/sector-peers';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useToolReport } from '@/components/dashboard/frame';
import './sector-ignition.css';

export type Horizon = 'intraday' | 'daily' | 'swing' | 'weekly';
type Stage = 'quiet' | 'stirring' | 'igniting' | 'extended';
interface Chip { symbol: string; movePct: number | null; note: string }
interface Group {
  groupId: string; label: string; etf: string; horizon: Horizon; phase?: string | null; stage: Stage; side: 'long' | 'short' | null; points: number;
  etfMovePct: number | null; relPct: number | null; breadthPct: number | null; flowCount: number | null; membersRead: number;
  metrics: Record<string, unknown>; leaders: Chip[]; laggards: Chip[]; levels: Array<{ name: string; price: number }>; why: string[];
}
export interface IgnitionPayload {
  horizon: Horizon; asOf: string; ageSec: number; phase: string | null; groups: Group[]; dataAsOf: Record<string, string | null>;
  notes: string[]; cadence: string; honesty: string;
  watchlist: Array<{ groupId: string; label: string; etf: string; side: 'long' | 'short'; symbols: string[]; why: string }>;
  emitted: Array<{ symbol: string; groupId: string; side: string; ideaId: string | null; at: string }>;
}

const LABEL: Record<Horizon, string> = { intraday: '0DTE / intraday', daily: 'Daily', swing: 'Swing 2–5d', weekly: 'Weeks' };
const WINDOW: Record<Horizon, string> = { intraday: 'since the open', daily: 'today', swing: '5 sessions', weekly: '20 sessions' };

export function useSectorIgnition(h: Horizon) {
  return useQuery<IgnitionPayload>({
    queryKey: ['/api/sector-ignition', h],
    queryFn: async () => {
      const r = await fetch(`/api/sector-ignition?horizon=${h}`, { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    staleTime: h === 'intraday' ? 60_000 : 5 * 60_000,
    refetchInterval: h === 'intraday' ? 2 * 60_000 : h === 'daily' ? 5 * 60_000 : false,
    retry: 1,
  });
}

const sp = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`);
const cls = (v: number | null | undefined) => (v == null ? '' : v > 0 ? 'up' : v < 0 ? 'dn' : '');
function ageOf(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'age —';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return `close ${iso}`;
  return s < 90 ? `${s}s old` : s < 5400 ? `${Math.round(s / 60)}m old` : s < 172800 ? `${(s / 3600).toFixed(1)}h old` : `${Math.round(s / 86400)}d old`;
}
const STALE_SEC: Record<Horizon, number> = { intraday: 12 * 60, daily: 30 * 60, swing: 30 * 3600, weekly: 8 * 86400 };

function Syms({ label, xs, lag }: { label: string; xs: Chip[]; lag?: boolean }) {
  if (!xs.length) return null;
  return (
    <span className="si-syms">
      {label}
      {xs.map((c) => (
        <Link key={c.symbol} href={`/r/${encodeURIComponent(c.symbol)}`} className={`si-sym${lag ? ' lag' : ''}`} title={c.note}>
          {c.symbol} <span className={cls(c.movePct)}>{sp(c.movePct, 1)}</span>
        </Link>
      ))}
    </span>
  );
}

function Row({ g, dense }: { g: Group; dense: boolean }) {
  const readAt = typeof g.metrics.readAt === 'string' ? (g.metrics.readAt as string) : null;
  const carried = g.metrics.carried === true;
  return (
    <details className="si-row">
      <summary>
        <span className={`si-chip ${g.stage} ${g.side ?? ''}`} title={g.side ? `${g.stage} · ${g.side}` : g.stage}>{g.stage}{g.side && g.stage !== 'quiet' ? (g.side === 'long' ? ' ▲' : ' ▼') : ''}</span>
        <span className="si-name"><b>{g.label}</b><small>{g.etf}{g.phase ? ` · ${g.phase.replace('_', ' ')}` : ''}</small></span>
        <span className="si-num" title={`${g.etf} move, ${WINDOW[g.horizon]}`}>{g.etf} <b className={cls(g.etfMovePct)}>{sp(g.etfMovePct)}</b></span>
        <span className="si-num" title="ETF minus SPY over the same window">vs SPY <b className={cls(g.relPct)}>{sp(g.relPct)}</b></span>
        <span className="si-num" title="members on the group's side (horizon's breadth read)">breadth <b>{g.breadthPct != null ? `${g.breadthPct}%` : '—'}</b></span>
        <span className={`si-num${dense ? ' si-hide-dense' : ''}`} title={g.horizon === 'swing' ? 'sessions with ≥2 members on the side\'s premium' : 'members with net premium on the side, last 30 min'}>flow <b>{g.flowCount ?? '—'}</b></span>
      </summary>
      <Syms label="leaders" xs={g.leaders} />
      <Syms label="laggards" xs={g.laggards} lag />
      <ul className="si-why">
        {g.why.map((w, i) => <li key={i}>{w}</li>)}
        {readAt && <li>{carried ? 'carried from the last full sweep · ' : ''}read {ageOf(readAt)} · {g.membersRead} members read</li>}
      </ul>
      {g.levels.length > 0 && <div className="si-lv">{g.levels.map((l) => `${l.name} $${l.price.toFixed(2)}`).join(' · ')}</div>}
    </details>
  );
}

export function SectorIgnitionPanel({ horizons = ['intraday', 'daily', 'swing', 'weekly'], dense = false, showQuiet = false, max }: { horizons?: Horizon[]; dense?: boolean; showQuiet?: boolean; max?: number }) {
  const [h, setH] = useState<Horizon>(horizons[0]);
  const [all, setAll] = useState(showQuiet);
  const q = useSectorIgnition(h);
  const d = q.data;
  const groups = d?.groups ?? [];
  const live = groups.filter((g) => all || g.stage !== 'quiet');
  const shown = max ? live.slice(0, max) : live;
  const newest = d ? Object.values(d.dataAsOf ?? {}).filter(Boolean).sort().pop() ?? null : null;
  const stale = d ? d.ageSec > STALE_SEC[h] : false;
  const counts = { igniting: groups.filter((g) => g.stage === 'igniting').length, stirring: groups.filter((g) => g.stage === 'stirring').length };
  return (
    <div className={`si${dense ? ' si-dense' : ''}`}>
      {horizons.length > 1 && (
        <div className="si-tabs" role="tablist" aria-label="Horizon">
          {horizons.map((x) => <button key={x} type="button" role="tab" aria-selected={x === h} className="si-tab" onClick={() => setH(x)}>{LABEL[x]}</button>)}
        </div>
      )}
      {d && (
        <div className="si-meta">
          <span>{counts.igniting} igniting · {counts.stirring} stirring of {groups.length} groups</span>
          <span className={stale ? 'stale' : ''}>read {ageOf(d.asOf)}{stale ? ' — stale' : ''}</span>
          {newest && <span>data {ageOf(newest)}</span>}
          <span>measuring</span>
        </div>
      )}
      {q.isError && !d ? <div className="si-msg">Sector ignition didn&rsquo;t load. <button type="button" className="tl-link-btn" onClick={() => q.refetch()}>Retry</button></div>
        : !d ? <div className="si-msg">Reading the groups…</div>
        : !groups.length ? <div className="si-msg">No groups read — {d.notes[0] ?? 'no data returned'}.</div>
        : !shown.length ? <div className="si-msg">Every group is quiet on this horizon. <button type="button" className="tl-link-btn" onClick={() => setAll(true)}>Show all {groups.length}</button></div>
        : <div className="si-list">{shown.map((g) => <Row key={`${g.horizon}|${g.groupId}`} g={g} dense={dense} />)}</div>}
      {d && live.length < groups.length && all === false && shown.length > 0 && <button type="button" className="tl-link-btn si-meta" onClick={() => setAll(true)}>+{groups.length - live.length} quiet groups</button>}
      {d && h === 'weekly' && d.watchlist.length > 0 && <div className="si-foot">Watchlist (no auto trades): {d.watchlist.map((w) => `${w.label} ${w.side} — ${w.symbols.join(', ')}`).join(' · ')}</div>}
      {d && d.emitted.length > 0 && <div className="si-foot">Ideas today: {d.emitted.map((e) => `${e.symbol} ${e.side}`).join(' · ')} (source sector_ignition, measuring)</div>}
      {d && !dense && <div className="si-foot">{d.cadence}. {d.notes.slice(0, 2).join(' ')} {d.honesty}</div>}
    </div>
  );
}

/** Today band — plain section in the landing language. */
export function SectorIgnitionBand() {
  return (
    <section className="td-index-desk" aria-label="Sector ignition">
      <div className="container">
        <div className="td-index-head">
          <div><b>Sector ignition</b><span>which groups are igniting — 0DTE, daily, swing, weeks · measuring</span></div>
          <Link href="/t?nx=0dte">Intraday on the 0DTE desk</Link>
        </div>
        <SectorIgnitionPanel max={8} />
      </div>
    </section>
  );
}

/** NEXUS tool 'nexus-sector-ignition'. */
export function SectorIgnitionTool() {
  const q = useSectorIgnition('intraday');
  useToolReport({
    asOf: q.data ? q.data.asOf : q.isError ? null : undefined,
    source: 'sector ignition · /api/sector-ignition',
    note: q.isError ? (q.data ? 'refresh failed' : 'unavailable') : q.data ? `${q.data.groups.filter((g) => g.stage === 'igniting').length} igniting (intraday)` : undefined,
    tone: q.isError ? 'warn' : 'ok',
  });
  return <div className="fd-pad"><SectorIgnitionPanel dense /></div>;
}

/**
 * One-line rotation read for the top of Today and the NEXUS header: where money
 * is moving IN (groups igniting/extended long), OUT (igniting/extended short),
 * and the laggards in the leading groups that haven't moved yet. Uses the daily
 * horizon in session, the swing read otherwise; always stamped with its age.
 */
export function RotationStrip({ compact = false }: { compact?: boolean }) {
  const daily = useSectorIgnition('daily');
  const swing = useSectorIgnition('swing');
  const pick = daily.data && daily.data.groups.some((g) => g.stage === 'igniting' || g.stage === 'extended') ? daily.data : swing.data ?? daily.data;
  if (!pick) {
    return <div className="ig-strip" role="status">{daily.isLoading || swing.isLoading ? 'Reading sector rotation…' : 'Sector rotation unavailable right now'}<Link href="/t?tab=sectors" className="ig-strip-open">Open Sectors →</Link></div>;
  }
  const hot = pick.groups.filter((g) => g.stage === 'igniting' || g.stage === 'extended');
  const into = hot.filter((g) => g.side === 'long').sort((a, b) => b.points - a.points).slice(0, 3);
  const out = hot.filter((g) => g.side === 'short').sort((a, b) => b.points - a.points).slice(0, 3);
  const lag = into.flatMap((g) => g.laggards.slice(0, 2).map((c) => c.symbol)).slice(0, 4);
  const fmt = (g: Group) => `${g.label} (${g.etf} ${sp(g.etfMovePct, 1)}${g.stage === 'igniting' ? ' · igniting' : ''})`;
  return (
    <div className={`ig-strip${compact ? ' compact' : ''}`} aria-label="Sector rotation">
      <span className="ig-strip-k">Rotation · {LABEL[pick.horizon]}</span>
      <span><b className="up">Into</b> {into.length ? into.map(fmt).join(', ') : 'nothing igniting long'}</span>
      <span><b className="dn">Out of</b> {out.length ? out.map(fmt).join(', ') : 'nothing igniting short'}</span>
      {lag.length > 0 && <span><b>Laggards to watch</b> {lag.join(' · ')}</span>}
      <span className="ig-strip-age">{ageOf(pick.asOf)} · measuring</span>
      <Link href="/t?tab=sectors" className="ig-strip-open">Open Sectors →</Link>
    </div>
  );
}

/**
 * symbol → is this idea WITH or AGAINST the current sector rotation?
 * Groups igniting/extended long or short (daily in session, else swing),
 * membership from shared/sector-peers. Measuring — a map, not a signal.
 */
export type RotationTag = { tag: 'with' | 'against'; label: string; stage: string; side: 'long' | 'short' };
export function useRotationMap(): Map<string, { label: string; stage: string; side: 'long' | 'short' }> {
  const daily = useSectorIgnition('daily');
  const swing = useSectorIgnition('swing');
  const pick = daily.data && daily.data.groups.some((g) => g.stage === 'igniting' || g.stage === 'extended') ? daily.data : swing.data ?? daily.data;
  return useMemo(() => {
    const m = new Map<string, { label: string; stage: string; side: 'long' | 'short' }>();
    if (!pick) return m;
    const hot = pick.groups.filter((g) => (g.stage === 'igniting' || g.stage === 'extended') && g.side);
    for (const g of hot) {
      const peer = PEER_GROUPS.find((p) => p.id === g.groupId);
      for (const s of [...(peer?.members ?? []), ...g.leaders.map((c) => c.symbol), ...g.laggards.map((c) => c.symbol)]) {
        const k = s.toUpperCase();
        if (!m.has(k)) m.set(k, { label: g.label, stage: g.stage, side: g.side as 'long' | 'short' });
      }
    }
    return m;
  }, [pick]);
}
export function rotationTagFor(map: Map<string, { label: string; stage: string; side: 'long' | 'short' }>, symbol: string, direction: string): RotationTag | null {
  const r = map.get(symbol.toUpperCase());
  if (!r) return null;
  const dir = /short|bear/i.test(direction) ? 'short' : 'long';
  return { tag: dir === r.side ? 'with' : 'against', label: r.label, stage: r.stage, side: r.side };
}
