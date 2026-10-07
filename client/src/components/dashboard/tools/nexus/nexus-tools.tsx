/**
 * NEXUS tools — the NEXUS board (pages/nexus-prototype.tsx) split into
 * dashboard tools.
 *
 * All tools read the page's own queries through nexus-parts.tsx (identical
 * react-query keys), so N tools on screen = one request per endpoint.
 *
 * Selection is shared per page through useDashState('nexus:selection'):
 *   { kind: 'setup', id }        — a ranked setup or a bot-held position
 *   { kind: 'developing', symbol } — a pattern-scan candidate
 * The board, positions and developing lanes write it (and re-point the focus
 * ticker so chart / GEX tools follow); the detail tool shows whatever was
 * selected last.
 */
import { usePhone } from '@/components/ui/qe-phone';
import { RotationStrip, rotationTagFor, useRotationMap } from '@/components/sector-ignition/sector-ignition';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Link, useSearch } from 'wouter';
import { NEXUS_IDEA_PARAM, NEXUS_SYM_PARAM, readNexusTarget } from '@/lib/nexus-link';
import { Activity, Search } from 'lucide-react';
import { SignalGrid } from '@/components/hunt/cockpit/signal-grid';
import { SignalTable } from '@/components/hunt/cockpit/signal-table';
import { QEEmpty, QEError, QELoading } from '@/components/ui/qe-states';
import { openWorkup } from '@/lib/workup-bus';
import type { ConvictionPick } from '@/lib/convictions';
import NexusPrototype from '@/pages/nexus-prototype';
import { useDashState, useDashboard, useFocusSymbol, useNow, useToolReport, useToolSetting } from '../../frame';
import { HorizonBook } from '@/components/ideas/horizon-book';
import { ageLabel } from '../flow/tape';
import {
  ContextBody, DevelopingDetail, DevelopingRow, SetupDetail, SetupRow,
  macroRisk, rankDeveloping, rankRows, spySourceOf, withSpxRow,
  useDevelopingQuote, useNexusConvictions, useNexusExtended, useNexusPatterns, useNexusPulse, useSpxExpression,
  RANKS, SIDES, type DetailTab, type PatternHit, type Rank, type Side,
} from './nexus-parts';
import { TraderCallLine } from './trader-calls';
import { TrackedRow } from './tracked-row';
import { EMPTY_CALLED_RANGE, filterByCalledRange, type CalledRange } from './board-time-filter';
import { BoardFilterBar } from './board-filters';
import { BOARD_FILTER_DEFAULTS, showsResolvedToday, type BoardFilterState } from '@shared/board-filters';
import { outcomeChip, resolvedInstrument, type ResolvedIdea } from '@shared/nexus-resolved';
import { getIdeaSourceMeta } from '@shared/idea-sources';
import { useQuery } from '@tanstack/react-query';
import { useSetupLifecycles } from '@/lib/setup-lifecycle';
import { dayHeading, etDay, filterBoardByDay, type DayChip, type DayFilter } from '@shared/setup-lifecycle';
import { useTraderCalls } from '@/lib/trader-calls';
import './nexus-tools.css';

/* ── shared selection ── */
export type NexusSelection = { kind: 'setup'; id: string } | { kind: 'developing'; symbol: string } | null;
export const NEXUS_SELECTION_KEY = 'nexus:selection';
const DETAIL_ID = 'nexus-detail';

function useNexusSelection() {
  return useDashState<NexusSelection>(NEXUS_SELECTION_KEY, null);
}

/* ── URL ⇄ selection (lib/nexus-link.ts) ──
   /t?idea=<id>&sym=<SYM> opens that idea selected; selecting a row writes the
   same params back with replaceState, so the address bar is always the link to
   what is on screen. `applied` remembers the last URL target handled so our own
   write-back (which wouter re-broadcasts) never re-applies. */
let applied: string | null = null;
/** Set when ?idea= was not in the live book and the symbol's current setup was shown instead. */
let substituted: { requested: string; shown: string } | null = null;
const targetKey = (t: { ideaId: string | null; symbol: string | null } | null) => (t ? `${t.ideaId ?? ''}|${t.symbol ?? ''}` : '');

function writeSelectionToUrl(ideaId: string | null, symbol: string | null) {
  try {
    if (window.location.pathname !== '/t') return;
    const u = new URL(window.location.href);
    const tab = u.searchParams.get('tab');
    if (tab && tab !== 'oracle' && tab !== 'nexus') return;
    if (ideaId) u.searchParams.set(NEXUS_IDEA_PARAM, ideaId); else u.searchParams.delete(NEXUS_IDEA_PARAM);
    if (symbol) u.searchParams.set(NEXUS_SYM_PARAM, symbol.toUpperCase()); else u.searchParams.delete(NEXUS_SYM_PARAM);
    applied = targetKey(readNexusTarget(u.search));
    window.history.replaceState(window.history.state, '', `${u.pathname}${u.search}${u.hash}`);
  } catch { /* URL sync is a convenience */ }
}

/** Select a setup/position/candidate AND re-point the focus ticker. */
function useSelect() {
  const [, setSel] = useNexusSelection();
  const [, setFocus] = useFocusSymbol();
  return {
    setup: (pick: ConvictionPick) => { setSel({ kind: 'setup', id: pick.ideaId }); setFocus(pick.symbol); writeSelectionToUrl(pick.ideaId, pick.symbol); },
    developing: (hit: PatternHit) => { setSel({ kind: 'developing', symbol: hit.symbol }); setFocus(hit.symbol); writeSelectionToUrl(null, hit.symbol); },
  };
}

/**
 * Apply ?idea= / ?sym= once the book has loaded: the exact idea if it is still
 * in the book, else that symbol's top setup, else just the focus ticker (the
 * detail then says the selection left the book). Mounted by the board and the
 * detail tool; the module-level `applied` key makes it run once per target.
 */
function useApplyUrlSelection(all: ConvictionPick[], loaded: boolean) {
  const search = useSearch();
  const [, setSel] = useNexusSelection();
  const [, setFocus] = useFocusSymbol();
  useEffect(() => {
    const t = readNexusTarget(search);
    const key = targetKey(t);
    if (!t || key === applied || !loaded) return;
    applied = key;
    const bySym = t.symbol ? rankRows(all, { scope: 'setups', side: 'all', query: '', rank: 'all' }).find((p) => p.symbol === t.symbol) ?? all.find((p) => p.symbol === t.symbol) : undefined;
    const exact = t.ideaId ? all.find((p) => p.ideaId === t.ideaId) : undefined;
    const pick = exact ?? bySym;
    substituted = t.ideaId && !exact && pick ? { requested: t.ideaId, shown: pick.ideaId } : null;
    if (pick) {
      setSel({ kind: 'setup', id: pick.ideaId });
      setFocus(pick.symbol);
      window.requestAnimationFrame(() => document.querySelector('.nxd-board .selected')?.scrollIntoView({ block: 'nearest' }));
    } else {
      if (t.ideaId) setSel({ kind: 'setup', id: t.ideaId }); // detail: "selection left the book · showing top setup"
      if (t.symbol) setFocus(t.symbol);
    }
  }, [search, all, loaded, setSel, setFocus]);
}

/** The book (+ SPX-linked expression row), from the shared convictions query. */
function useSetupBook() {
  const convictions = useNexusConvictions();
  const spySource = spySourceOf(convictions.data?.picks);
  const spx = useSpxExpression(spySource);
  const all = useMemo(() => withSpxRow(convictions.data?.picks, spySource, spx.data), [convictions.data, spySource, spx.data]);
  return { convictions, spx, all };
}

function useBookReport(c: ReturnType<typeof useNexusConvictions>, note?: string) {
  useToolReport({
    asOf: c.data ? c.data.generatedAt : c.isError ? null : undefined,
    source: 'convictions engine · /api/convictions',
    note: c.isError ? (c.data ? 'refresh failed' : 'unavailable') : note,
    tone: c.isError ? 'warn' : 'ok',
  });
}

function bookGate(c: ReturnType<typeof useNexusConvictions>, what: string): ReactNode | null {
  if (c.isLoading) return <QELoading rows={5} className="fd-pad" label={`loading the ${what}…`} />;
  if (c.isError && !c.data) return <QEError className="fd-m" title={`The ${what} didn't load`} onRetry={() => c.refetch()} retrying={c.isFetching} />;
  return null;
}

/** SPX chip: SPY/SPX ideas on a 0–2 DTE contract (or carrying an SPX mirror). */
function isIndexZeroDte(p: ConvictionPick): boolean {
  const sym = p.symbol.toUpperCase();
  if (sym !== 'SPY' && sym !== 'SPX') return false;
  if (p.spxMirror) return true;
  const dte = p.horizon?.dte ?? p.optionDte;
  return p.horizon?.horizon === '0dte' || (dte != null && dte >= 0 && dte <= 2);
}

/* ── filter bar (Bullflow-style segmented controls) ── */
function FilterBar({ side, onSide, query, onQuery, placeholder, rank, onRank, count, children }: {
  side: Side; onSide: (s: Side) => void;
  query: string; onQuery: (q: string) => void; placeholder: string;
  rank?: Rank; onRank?: (r: Rank) => void;
  count: number;
  children?: ReactNode;
}) {
  return (
    <div className="of-controls nxd-controls qp-row">
      <div className="of-seg" role="group" aria-label="Side">
        {SIDES.map((s) => <button key={s} type="button" className={side === s ? 'on' : ''} onClick={() => onSide(s)}>{s.toUpperCase()}</button>)}
      </div>
      {rank && onRank && <div className="of-seg" role="group" aria-label="Rank">
        {RANKS.map((r) => <button key={r} type="button" className={rank === r ? 'on' : ''} onClick={() => onRank(r)} title={RANK_HELP[r]}>{r === 'conviction' ? 'GRADE A/B' : r.toUpperCase()}</button>)}
      </div>}
      <label className="nxd-search"><Search size={12} aria-hidden /><input value={query} onChange={(e) => onQuery(e.target.value)} placeholder={placeholder} aria-label={placeholder} /></label>
      {children}
      <span className="nxd-count">{count}</span>
    </div>
  );
}
const RANK_HELP: Record<Rank, string> = {
  all: 'Every published setup, in the board order (BOARD_SORT)',
  new: 'Published in the last 24 hours',
  best: 'Top 10 in the board order',
  conviction: 'NEXUS grade A and B only (actionability, unvalidated)',
};

function DetailHint() {
  const { hasTool, addTool, editable } = useDashboard();
  // Only a workspace can add a tool; NEXUS is a fixed page that ships with the detail tool.
  if (hasTool(DETAIL_ID) || !editable) return null;
  return <div className="of-hint nxd-hint">Rows open in the detail tool. <button type="button" onClick={() => addTool(DETAIL_ID)}>Add setup detail</button></div>;
}

/* ════════════ Ranked setups board ════════════ */
/** Day chips (ET publish day). "Yesterday" is the previous trading session. docs/SETUP_LIFECYCLE.md */
const DAY_CHIPS: ReadonlyArray<{ key: DayChip; label: string; help: string }> = [
  { key: 'today', label: 'TODAY', help: 'Published today (ET). Stale setups are hidden here unless you show them.' },
  { key: 'yesterday', label: 'YESTERDAY', help: 'Published in the previous trading session (ET) — still open, carried or stale.' },
  { key: 'week', label: 'THIS WEEK', help: 'Published since Monday (ET).' },
  { key: 'all', label: 'ALL', help: "Every open setup in the board's lookback." },
];
const isDateKey = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export function NexusBoardTool() {
  const dash = useDashboard();
  const { convictions, all } = useSetupBook();
  const [sel] = useNexusSelection();
  const select = useSelect();
  const now = useNow(30_000);
  const [side, setSide] = useToolSetting<Side>('side', 'all');
  const [rank, setRank] = useToolSetting<Rank>('rank', 'all');
  const [query, setQuery] = useToolSetting('query', '');
  const [view, setView] = useToolSetting<'list' | 'grid' | 'table'>('view', 'list');
  // CRYPTO: only native/any crypto ideas (assetType 'crypto') — 24/7 book.
  const [cryptoOnly, setCryptoOnly] = useToolSetting<boolean>('cryptoOnly', false);
  const [withRotation, setWithRotation] = useToolSetting<boolean>('withRotation', false);
  // Day filter (ET publish day): today | yesterday | week | all | YYYY-MM-DD — persisted per tool.
  // 'dayV2' (2026-10-07): the default is TODAY; the old 'day' key defaulted to ALL.
  const [day, setDay] = useToolSetting<DayFilter>('dayV2', 'today');
  const [showStale, setShowStale] = useToolSetting<boolean>('showStale', false);
  // SPX: SPY/SPX index 0DTE ideas (the index engines publish SPX plays on SPY; SPY rows carry an SPXW mirror).
  const [spxOnly, setSpxOnly] = useToolSetting<boolean>('spxOnly', false);
  // Called-time range (ET) — board-time-filter.tsx; applied to rankRows' output.
  const [calledRange, setCalledRange] = useToolSetting<CalledRange>('calledRange', EMPTY_CALLED_RANGE);
  const rotMap = useRotationMap();
  const { map: life } = useSetupLifecycles(all, convictions.data?.generatedAt, now);
  // Every filter except the day, in board order (stale + resolved sink below fresh/carried).
  const pre = useMemo(() => {
    const ranked = filterByCalledRange(rankRows(all, { scope: 'setups', side, query, rank }, life), calledRange?.from ?? null, calledRange?.to ?? null);
    const c = cryptoOnly ? ranked.filter((p) => String(p.assetType).toLowerCase() === 'crypto') : ranked;
    const x = spxOnly ? c.filter(isIndexZeroDte) : c;
    return withRotation ? x.filter((p) => rotationTagFor(rotMap, p.symbol, p.direction, p.source)?.tag === 'with') : x;
  }, [all, side, query, rank, cryptoOnly, spxOnly, withRotation, rotMap, life, calledRange]);
  const byDay = useMemo(() => filterBoardByDay(pre, {
    dayOf: (p) => life.get(p.ideaId)?.life.publishedDay ?? null,
    stateOf: (p) => life.get(p.ideaId)?.life.state,
    day, showStale, nowMs: now,
  }), [pre, life, day, showStale, now]);
  const rows = byDay.rows;
  const today = etDay(now);
  const earliest = useMemo(() => {
    let m: string | null = null;
    for (const v of Array.from(life.values())) { const d = v.life.publishedDay; if (d && (!m || d < m)) m = d; }
    return m;
  }, [life]);
  // Resolved today (shared/nexus-resolved.ts): closed this session — greyed, never vanished.
  const resolvedQ = useResolvedToday();
  const resolved = useMemo(() => {
    if (!showsResolvedToday(day)) return [];
    const q = query.trim().toUpperCase();
    return (resolvedQ.data?.ideas ?? []).filter((r) => {
      if (side !== 'all' && r.direction !== side) return false;
      if (q && !r.symbol.toUpperCase().includes(q)) return false;
      if (cryptoOnly && String(r.assetType).toLowerCase() !== 'crypto') return false;
      if (spxOnly && !['SPY', 'SPX'].includes(r.symbol.toUpperCase())) return false;
      return true;
    });
  }, [resolvedQ.data, day, side, query, cryptoOnly, spxOnly]);
  useApplyUrlSelection(all, !!convictions.data);
  useBookReport(convictions, `${rows.length} open${resolved.length ? ` · ${resolved.length} resolved today` : ''}`);
  const blocked = bookGate(convictions, 'live book');
  // Nothing chosen yet → the detail tool shows the top setup, so mark it.
  const topId = useMemo(() => rankRows(all, { scope: 'setups', side: 'all', query: '', rank: 'all' }, life)[0]?.ideaId, [all, life]);
  const activeId = sel?.kind === 'setup' ? sel.id : sel == null ? topId : undefined;
  const phone = usePhone();
  // Phone: the detail is a section further down the one-column page — a row tap brings it into view.
  const toDetail = () => { if (phone) window.requestAnimationFrame(() => document.querySelector('[data-tool="nexus-detail"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); };
  const pickById = (id: string) => { const p = rows.find((r) => r.ideaId === id); if (p) { select.setup(p); toDetail(); } };
  const row = (pick: ConvictionPick) => <SetupRow key={pick.ideaId} pick={pick} life={life.get(pick.ideaId)} now={now} rotation={rotationTagFor(rotMap, pick.symbol, pick.direction, pick.source)} selected={activeId === pick.ideaId} onSelect={() => { select.setup(pick); toDetail(); }} />;
  const dayLabel = isDateKey(day) ? `on ${dayHeading(day, now)}` : day === 'week' ? 'this week' : day;
  const fstate: BoardFilterState = { day, side, rank, query, cryptoOnly, spxOnly, withRotation, showStale, calledRange: calledRange ?? EMPTY_CALLED_RANGE, view };
  const onFilter = (p: Partial<BoardFilterState>) => {
    if (p.day !== undefined) setDay(p.day);
    if (p.side !== undefined) setSide(p.side);
    if (p.rank !== undefined) setRank(p.rank);
    if (p.query !== undefined) setQuery(p.query);
    if (p.cryptoOnly !== undefined) setCryptoOnly(p.cryptoOnly);
    if (p.spxOnly !== undefined) setSpxOnly(p.spxOnly);
    if (p.withRotation !== undefined) setWithRotation(p.withRotation);
    if (p.showStale !== undefined) setShowStale(p.showStale);
    if (p.calledRange !== undefined) setCalledRange(p.calledRange ?? EMPTY_CALLED_RANGE);
    if (p.view !== undefined) setView(p.view);
  };
  const resetAll = () => onFilter({ ...BOARD_FILTER_DEFAULTS, day: 'all' });
  const resolvedBlock = resolved.length > 0 ? <ResolvedToday ideas={resolved} /> : null;
  return (
    <div className="fd-fill nxd nxd-board">
      {/* NEXUS workspace: the tracked row and rotation strip are tiles of their own; the board carries them only when they are not placed */}
      {!dash.hasTool('nexus-tracked') && <TrackedRow picks={all} onFilter={(sym) => onFilter({ query: query === sym ? '' : sym, side: 'all', rank: 'all', cryptoOnly: false, withRotation: false, day: 'all' })} />}
      {!dash.hasTool('nexus-rotation') && <div style={{ padding: '6px 8px 0' }}><RotationStrip compact /></div>}
      <BoardFilterBar state={fstate} onChange={onFilter} count={rows.length} counts={byDay.counts} staleHidden={byDay.staleHidden} earliest={earliest} today={today} />
      <DetailHint />
      {blocked ?? (rows.length === 0
        ? (resolvedBlock
            ? <div className="fd-scroll nxp-rows"><p className="nxd-open-none">No open setups {dayLabel}{byDay.staleHidden ? ` (${byDay.staleHidden} stale hidden)` : ''}.</p>{resolvedBlock}</div>
            : <QEEmpty className="fd-m" message={cryptoOnly ? 'No open crypto idea on the board right now — the crypto engine scans every 30 minutes, 24/7.' : spxOnly ? 'No open SPY/SPX 0DTE idea on the board right now.' : pre.length > 0 && day !== 'all' ? `No live setups published ${dayLabel}${byDay.staleHidden ? ` (${byDay.staleHidden} stale hidden)` : ''} — ${pre.length} open on other days.` : all.some((p) => !p.isBotHeld) ? 'No setups match this view.' : 'The engine published no setups in this read.'}
                action={all.some((p) => !p.isBotHeld)
                  ? <button type="button" className="fd-btn" onClick={resetAll}>Show every setup</button>
                  : <Link href="/t?nx=0dte" className="fd-btn">Open the 0DTE desk</Link>} />)
        : view === 'grid'
          ? <div className="fd-scroll fd-pad"><SignalGrid picks={rows} selectedId={activeId ?? null} onSelect={pickById} />{resolvedBlock}</div>
          : view === 'table'
            ? <div className="fd-scroll fd-pad"><SignalTable picks={rows} selectedId={activeId ?? null} onSelect={pickById} />{resolvedBlock}</div>
            : <div className="fd-scroll nxp-rows">{byDay.groups.map(([d, list]) => (
                <section key={d ?? 'undated'} aria-label={dayHeading(d, now)}>
                  <div className="nxd-day-head"><span>{dayHeading(d, now)}</span><span>{list.length}</span></div>
                  {list.map(row)}
                </section>
              ))}{resolvedBlock}</div>)}
    </div>
  );
}

/* ── Resolved today (greyed, outcome chip + time) — shared/nexus-resolved.ts ── */
interface ResolvedPayload { ideas: ResolvedIdea[]; asOf: string }
function useResolvedToday() {
  return useQuery<ResolvedPayload>({
    queryKey: ['/api/nexus/resolved-today'],
    queryFn: async () => { const r = await fetch('/api/nexus/resolved-today', { credentials: 'include' }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); },
    staleTime: 30_000, refetchInterval: 60_000,
  });
}
const pctText = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`);
const etHm = (iso: string) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }) : '—'; };
function ResolvedToday({ ideas }: { ideas: ResolvedIdea[] }) {
  return (
    <section className="nxr" aria-label="Resolved today">
      <div className="nxr-head"><span>Resolved today</span><span>{ideas.length}</span></div>
      {ideas.map((r) => {
        const c = outcomeChip(r);
        const pnl = pctText(r.optionPercentGain ?? r.percentGain);
        const onPremium = r.optionPercentGain != null;
        return (
          <Link key={r.ideaId} href={`/r/${encodeURIComponent(r.symbol)}`} className="nxr-row" title={`${c.title}${c.at ? ` at ${c.at} ET` : ''} — open ${r.symbol}`}>
            <span className="nxr-main">
              <strong>{resolvedInstrument(r)} <span className={r.direction === 'short' ? 'nxp-dir bear' : 'nxp-dir bull'}>{r.direction === 'short' ? '▼' : '▲'}</span></strong>
              <small>{getIdeaSourceMeta(r.source).label} · called {etHm(r.timestamp)}{r.exitPrice != null ? ` · exit ${r.exitPrice.toFixed(2)}` : ''}</small>
            </span>
            <span className="nxr-side">
              <span className={`nxr-chip ${c.tone}`} aria-label={`${c.title}${c.at ? ` at ${c.at} Eastern` : ''}`}>{c.label}{c.at ? ` ${c.at}` : ''}</span>
              {pnl && <span className="nxr-pnl" title={`P&L on the ${onPremium ? 'contract premium' : 'underlying'}`}>{pnl} {onPremium ? 'prem' : 'und'}</span>}
            </span>
          </Link>
        );
      })}
    </section>
  );
}

/* ════════════ Positions lane (bot-held) ════════════ */
export function NexusPositionsTool() {
  const { convictions, all } = useSetupBook();
  const [sel] = useNexusSelection();
  const select = useSelect();
  const [side, setSide] = useToolSetting<Side>('side', 'all');
  const [query, setQuery] = useToolSetting('query', '');
  const held = useMemo(() => all.filter((p) => p.isBotHeld), [all]);
  const rows = useMemo(() => rankRows(all, { scope: 'positions', side, query, rank: 'all' }), [all, side, query]);
  useBookReport(convictions, `${held.length} held`);
  const blocked = bookGate(convictions, 'bot book');
  return (
    <div className="fd-fill nxd nxd-positions">
      <FilterBar side={side} onSide={setSide} query={query} onQuery={setQuery} placeholder="Ticker" count={rows.length} />
      {blocked ?? (rows.length === 0
        ? <QEEmpty className="fd-m" message={held.length === 0 ? 'Quantinum Bot holds no positions in this read.' : 'No held positions match this filter.'}
            action={held.length === 0
              ? <Link href="/t?tab=bot" className="fd-btn">Open Quantinum Bot</Link>
              : <button type="button" className="fd-btn" onClick={() => { setSide('all'); setQuery(''); }}>Clear filters</button>} />
        : <div className="fd-scroll nxp-rows">{rows.map((pick) => <SetupRow key={pick.ideaId} pick={pick} selected={sel?.kind === 'setup' && sel.id === pick.ideaId} onSelect={() => select.setup(pick)} />)}</div>)}
      <div className="fd-foot">Sorted by unrealized P&amp;L %. Held rows carry live P&amp;L, not a conviction score.</div>
    </div>
  );
}

/* ════════════ Trader calls (evidence from ranked traders) ════════════ */
export function NexusTraderCallsTool() {
  const q = useTraderCalls();
  const { all } = useSetupBook();
  const [sel] = useNexusSelection();
  const select = useSelect();
  const [, setFocus] = useFocusSymbol();
  const calls = q.data?.calls ?? [];
  useToolReport({
    asOf: q.data ? q.data.asOf : q.isError ? null : undefined,
    source: 'imported Discord journals · /api/trader-calls',
    note: q.isError ? 'unavailable' : `${calls.length} open call${calls.length === 1 ? '' : 's'} · ${q.data?.traders.length ?? 0} ranked trader${q.data?.traders.length === 1 ? '' : 's'} pass`,
    tone: q.isError ? 'warn' : 'ok',
  });
  if (q.isLoading) return <QELoading rows={3} className="fd-pad" label="loading trader calls…" />;
  if (q.isError && !q.data) return <QEError className="fd-m" title="Trader calls didn't load" onRetry={() => q.refetch()} retrying={q.isFetching} />;
  const cfg = q.data!.config;
  return (
    <div className="fd-fill nxd">
      {calls.length === 0 ? (
        <QEEmpty className="fd-m" message={q.data!.traders.length === 0
          ? `No trader passes the ranking threshold yet (score ≥ ${cfg.minScore} on ≥ ${cfg.minSample} scored calls). Import their Discord journals in Journal › Import.`
          : `No open calls from ${q.data!.traders.map((t) => t.name).join(', ')} in the last ${cfg.maxAgeTradingDays} trading days.`}
          action={q.data!.traders.length === 0 ? <Link href="/t?tab=journal&jtab=import" className="fd-btn">Import a trader journal</Link> : undefined} />
      ) : (
        <div className="fd-scroll nxtc-list">
          {calls.map((c) => {
            const pick = all.find((p) => p.symbol === c.symbol);
            return (
              <div key={c.id} role="button" tabIndex={0} style={{ cursor: 'pointer', outline: sel?.kind === 'setup' && pick && sel.id === pick.ideaId ? '1px solid var(--border-subtle)' : undefined }}
                onClick={(e) => { if ((e.target as HTMLElement).closest('a')) return; if (pick) select.setup(pick); else setFocus(c.symbol); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { if (pick) select.setup(pick); else setFocus(c.symbol); } }}
                aria-label={`${c.trader.name}'s ${c.symbol} call${pick ? ' — open the setup' : ''}`}>
                <TraderCallLine c={c} />
              </div>
            );
          })}
        </div>
      )}
      <div className="fd-foot">Evidence, not a signal: open calls ≤ {cfg.maxAgeTradingDays} trading days old from traders ranked ≥ {cfg.minScore}. Stated prices are as posted; the underlying is repriced live. Not used by Quantinum Bot.</div>
    </div>
  );
}

/* ════════════ Developing lane (pattern-scan candidates) ════════════ */
function DevelopingPane({ hit }: { hit: PatternHit }) {
  const quote = useDevelopingQuote(hit.symbol, true);
  return <DevelopingDetail hit={hit} quote={quote.data} onOpen={() => openWorkup(hit.symbol)} />;
}

export function NexusDevelopingTool() {
  const patterns = useNexusPatterns();
  const convictions = useNexusConvictions();
  const [sel] = useNexusSelection();
  const select = useSelect();
  const { hasTool } = useDashboard();
  const [side, setSide] = useToolSetting<Side>('side', 'all');
  const [query, setQuery] = useToolSetting('query', '');
  const hits = useMemo(() => rankDeveloping(patterns.data?.hits, convictions.data?.picks, { query, side }), [patterns.data, convictions.data, query, side]);
  const selSymbol = sel?.kind === 'developing' ? sel.symbol : undefined;
  // With no detail tool on the page, the lane carries its own DevelopingDetail.
  const inline = !hasTool(DETAIL_ID);
  const inlineHit = inline ? (hits.find((h) => h.symbol === selSymbol) ?? hits[0]) : undefined;
  const d = patterns.data;
  useToolReport({
    asOf: d ? d.asOf : patterns.isError ? null : undefined,
    source: 'pattern scanner · /api/patterns/scan',
    note: patterns.isError ? 'refresh failed' : d ? `${d.scanned} scanned${d.failed ? ` · ${d.failed} failed` : ''}${d.scanning ? ' · scanning' : ''}` : undefined,
    tone: patterns.isError || (d?.failed ?? 0) > 0 ? 'warn' : 'ok',
  });
  let list: ReactNode;
  if (patterns.isLoading) list = <QELoading rows={5} className="fd-pad" label="scanning the opportunity funnel…" />;
  else if (patterns.isError && !d) list = <QEError className="fd-m" title="The pattern scan didn't load" onRetry={() => patterns.refetch()} retrying={patterns.isFetching} />;
  else if (hits.length === 0) list = <QEEmpty className="fd-m" message="No developing structures match this view. Widen the filters to see more."
    action={side !== 'all' || query
      ? <button type="button" className="fd-btn" onClick={() => { setSide('all'); setQuery(''); }}>Clear filters</button>
      : <button type="button" className="fd-btn" onClick={() => patterns.refetch()} disabled={patterns.isFetching}>{patterns.isFetching ? 'Scanning…' : 'Scan again'}</button>} />;
  else list = <div className="fd-scroll nxp-rows">{hits.map((hit) => <DevelopingRow key={`${hit.symbol}-${hit.pattern}`} hit={hit} selected={(inlineHit?.symbol ?? selSymbol) === hit.symbol} onSelect={() => select.developing(hit)} />)}</div>;
  return (
    <div className="fd-fill nxd nxd-developing">
      <FilterBar side={side} onSide={setSide} query={query} onQuery={setQuery} placeholder="Ticker or pattern" count={hits.length} />
      {inline && inlineHit
        ? <div className="nxd-split"><div className="nxd-split-list">{list}</div><div className="fd-scroll nxd-detail"><DevelopingPane key={inlineHit.symbol} hit={inlineHit} /></div></div>
        : list}
      <div className="fd-foot">Research observations within 20% of their trigger, not yet published as setups — not entries or bot orders.</div>
    </div>
  );
}

/* ════════════ Selected detail ════════════ */
export function NexusDetailTool() {
  const [sel] = useNexusSelection();
  const [tab, setTab] = useToolSetting<DetailTab>('tab', 'overview');
  const scrollRef = useRef<HTMLDivElement>(null);
  const selKey = sel == null ? '' : sel.kind === 'setup' ? `s:${sel.id}` : `d:${sel.symbol}`;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    setTab('overview');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKey]);
  return (
    <div ref={scrollRef} className="fd-scroll nxd nxd-detail">
      {sel?.kind === 'developing'
        ? <DetailDeveloping symbol={sel.symbol} />
        : <DetailSetup id={sel?.kind === 'setup' ? sel.id : undefined} tab={tab} onTab={setTab} />}
    </div>
  );
}

function DetailSetup({ id, tab, onTab }: { id?: string; tab: DetailTab; onTab: (t: DetailTab) => void }) {
  const { convictions, spx, all } = useSetupBook();
  useApplyUrlSelection(all, !!convictions.data);
  // Same lifecycle-aware order as the board, so "top setup" is the board's first row.
  const now = useNow(30_000);
  const { map: life } = useSetupLifecycles(all, convictions.data?.generatedAt, now);
  const top = useMemo(() => rankRows(all, { scope: 'setups', side: 'all', query: '', rank: 'all' }, life)[0], [all, life]);
  const found = id ? all.find((p) => p.ideaId === id) : undefined;
  const selected = found ?? top;
  const note = id && !found && convictions.data ? 'selection left the book · showing top setup'
    : selected && substituted?.shown === selected.ideaId ? `linked idea is not in the live book · showing ${selected.symbol}'s current setup`
    : selected ? selected.symbol : undefined;
  useBookReport(convictions, note);
  const blocked = bookGate(convictions, 'live book');
  if (blocked) return blocked;
  if (!selected) return <div className="nxp-empty"><Activity /><h2>Select a setup</h2><p>The engine published no setups in this read; pick a developing candidate or position instead.</p></div>;
  return <SetupDetail selected={selected} life={life.get(selected.ideaId)} now={now} spxExpression={spx.data} spxLoading={spx.isLoading} tab={tab} onTab={onTab} />;
}

function DetailDeveloping({ symbol }: { symbol: string }) {
  const patterns = useNexusPatterns();
  const convictions = useNexusConvictions();
  const hit = useMemo(
    () => rankDeveloping(patterns.data?.hits, convictions.data?.picks, { query: '', side: 'all' }).find((h) => h.symbol === symbol)
      ?? patterns.data?.hits.find((h) => h.symbol === symbol),
    [patterns.data, convictions.data, symbol],
  );
  const quote = useDevelopingQuote(symbol, true);
  useToolReport({
    asOf: quote.data?.asOf ?? (patterns.data ? patterns.data.asOf : patterns.isError ? null : undefined),
    source: quote.data ? 'extended-hours quote + pattern scan' : 'pattern scanner · /api/patterns/scan',
    note: quote.data ? `${symbol} · ${quote.data.session}${quote.data.isCurrent ? '' : ' · not current'}` : `${symbol} · snapshot only`,
    tone: quote.data && !quote.data.isCurrent ? 'warn' : 'ok',
  });
  if (patterns.isLoading) return <QELoading rows={5} className="fd-pad" label={`reading ${symbol} structure…`} />;
  if (patterns.isError && !patterns.data) return <QEError className="fd-m" title="The pattern scan didn't load" onRetry={() => patterns.refetch()} retrying={patterns.isFetching} />;
  if (!hit) return <QEEmpty className="fd-m" message={`${symbol} is no longer in the pattern scan.`} />;
  return <DevelopingDetail hit={hit} quote={quote.data} onOpen={() => openWorkup(hit.symbol)} />;
}

/* ════════════ Market context (Market) ════════════ */
export function NexusContextTool() {
  const convictions = useNexusConvictions();
  const pulse = useNexusPulse();
  const extended = useNexusExtended();
  const now = useNow();
  const market = convictions.data?.marketContext;
  const bonds = extended.data?.assetClasses?.find((a) => a.key === 'bonds');
  const macro = useMemo(() => macroRisk(pulse.data, bonds?.changePct), [pulse.data, bonds?.changePct]);
  const stamps = [convictions.data?.generatedAt, pulse.data?.asOf, extended.data?.asOf].filter((s): s is string => Boolean(s));
  const newest = stamps.length ? stamps.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a)) : null;
  const anyLoading = convictions.isLoading || pulse.isLoading || extended.isLoading;
  const failed = [convictions.isError && 'regime', pulse.isError && '10Y/VIX', extended.isError && 'TLT'].filter(Boolean) as string[];
  useToolReport({
    asOf: newest ?? (anyLoading ? undefined : null),
    source: 'convictions regime + market pulse + extended hours',
    note: failed.length ? `${failed.join(', ')} failed` : extended.data?.isStale ? 'TLT stale' : undefined,
    tone: failed.length || extended.data?.isStale ? 'warn' : 'ok',
  });
  if (convictions.isLoading && pulse.isLoading && extended.isLoading) return <QELoading rows={5} className="fd-pad" label="reading regime and rates…" />;
  if (convictions.isError && pulse.isError && extended.isError) return <QEError className="fd-m" title="Market context didn't load" onRetry={() => { convictions.refetch(); pulse.refetch(); extended.refetch(); }} retrying={convictions.isFetching || pulse.isFetching || extended.isFetching} />;
  const age = (iso?: string | null) => (iso ? ageLabel(iso, now) : 'n/a');
  return (
    <div className="fd-scroll nxd nxd-context">
      {/* No MarketSummary strip here: regime, preferred side, 10Y, TLT and the
          risk level are all in the body right below (they printed twice). The
          per-feed ages sit behind one tap; the section stamp shows the newest. */}
      <div className="nxp-context nxd-context-inline">
        <div className="nxp-context-head"><div><span>Market context</span><h2>{market?.regimeUnavailable ? 'Unavailable' : market?.regime ?? 'Unavailable'}</h2></div></div>
        <ContextBody market={market} macro={macro} pulse={pulse.data} bonds={bonds} extended={extended.data} hideFreshness />
      </div>
      <details className="fd-foot nxd-ages">
        <summary>Feed ages</summary>
        regime {age(convictions.data?.generatedAt)} · 10Y/VIX {age(pulse.data?.asOf)} · TLT {age(extended.data?.asOf)}{extended.data ? ` · macro ${extended.data.isStale ? 'stale' : extended.data.session ?? '—'}` : ''}
      </details>
    </div>
  );
}

/* ════════════ NEXUS (classic, all-in-one) ════════════ */
export function NexusClassicTool() {
  const convictions = useNexusConvictions();
  useBookReport(convictions);
  return <div className="fd-fill fd-legacy nxd-classic"><NexusPrototype /></div>;
}


/**
 * Book by horizon — every published (not bot-held) idea, cut by 0DTE ·
 * weekly · swing · monthly · position · LEAPS (shared/idea-horizon.ts), as a
 * sortable table. Selecting a row opens it in the detail tool.
 */
export function NexusHorizonTool() {
  const convictions = useNexusConvictions();
  const select = useSelect();
  const picks = (convictions.data?.picks ?? []).filter((p) => !p.isBotHeld);
  if (convictions.isError && !convictions.data) return <QEError title="The idea book didn't load" message="Book by Horizon needs the idea book, which didn't load. Retry in a minute." onRetry={() => { void convictions.refetch(); }} />;
  if (convictions.isLoading) return <QELoading rows={6} />;
  return (
    <HorizonBook
      picks={picks}
      storageKey="qe.dash.horizon"
      onSelect={(id) => { const pick = picks.find((p) => p.ideaId === id); if (pick) select.setup(pick); }}
    />
  );
}

/* shared with the NEXUS strip tiles (nexus-strips.tsx) */
export { useSetupBook, useSelect };
