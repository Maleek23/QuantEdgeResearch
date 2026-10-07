/**
 * Tool frame — the chrome every dashboard tool wears, so no tool can ship
 * without its title, a one-line "what this shows", units, data source and age.
 *
 * Tools report their own freshness through useToolReport(); wrapped legacy
 * components that already stamp ages per row declare `ageInside` in the
 * registry and the frame says so instead of inventing a single age.
 *
 * Also the shared context every tool reads but never owns:
 *   useFocusSymbol()   the focused ticker (= the terminal's StockContext)
 *   useDashState()     per-page shared state (e.g. NEXUS's selected setup)
 *   useToolInstance()  this placement's id — namespace per-instance settings
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, GripVertical, X } from 'lucide-react';
import { useStockContext } from '@/contexts/stock-context';
import { ageLabel } from './tools/flow/tape';
import type { ToolDef } from './tool-def';
import { FreshStamp, InfoSheet, shortTitle, usePhone } from '@/components/ui/qe-phone';
import { GxPop } from '@/components/gex/gex-pop';

export interface ToolReport {
  /** ISO of the newest datum shown (not the fetch time). */
  asOf?: string | null;
  /** Overrides the registry source line when the tool knows better. */
  source?: string;
  /** Short state note, e.g. "stream off", "throttled". */
  note?: string;
  tone?: 'ok' | 'warn';
}

export const ReportCtx = createContext<(r: ToolReport) => void>(() => {});

/** Tools call this with their freshness; re-reports on every change. */
export function useToolReport(r: ToolReport) {
  const set = useContext(ReportCtx);
  const key = `${r.asOf ?? ''}|${r.source ?? ''}|${r.note ?? ''}|${r.tone ?? ''}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { set(r); }, [key, set]);
}

/* ── dashboard context: page, tool presence, add ── */
interface DashCtx {
  page: string;
  hasTool: (id: string) => boolean;
  /** no-op unless `editable` (only the GEX / FLOW workspaces are) */
  addTool: (id: string) => void;
  /** the viewer may change this page's layout (workspace pages only) */
  editable: boolean;
}
export const DashboardCtx = createContext<DashCtx>({ page: 'none', hasTool: () => false, addTool: () => {}, editable: false });
export const useDashboard = () => useContext(DashboardCtx);

/* ── this placement's instance id ── */
export const ToolInstanceCtx = createContext<string>('');
export const useToolInstance = () => useContext(ToolInstanceCtx);

/** The dashboard's focus ticker IS the terminal's shared symbol, so a row
 *  clicked here also re-points every other page's symbol tools. */
export function useFocusSymbol(fallback = 'SPY'): [string, (s: string) => void] {
  const { currentStock, setCurrentStock } = useStockContext();
  // Stable setter so tools can memoise large row lists on it (perf 2026-09-30).
  const setFocus = useCallback((s: string) => setCurrentStock({ symbol: s.toUpperCase() }), [setCurrentStock]);
  return [(currentStock?.symbol || fallback).toUpperCase(), setFocus];
}

export function useNow(everyMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), everyMs); return () => clearInterval(id); }, [everyMs]);
  return now;
}

/* ── per-page shared state ──────────────────────────────────────────────
   A tiny key/value store per dashboard PAGE (module-level, so it survives a
   tab switch and a tool being paused off-screen). Tools that must agree —
   NEXUS's board and its detail pane, GEX's metric toggle — read the same key.

   SETTINGS survive a reload too: every per-placement setting (`tool:<inst>:*`,
   useToolSetting) and the page-level settings in PERSISTED_PAGE_KEYS are
   mirrored to localStorage (`qe-dash-state:<page>`). Selections and other
   working state (NEXUS's selected setup, the shared strike) stay in memory
   only — a reload should not resurrect a stale selection. Values must be
   JSON (store Sets as arrays). */
type Store = { vals: Map<string, unknown>; subs: Set<() => void> };
const STORES = new Map<string, Store>();
const LS_PREFIX = 'qe-dash-state:';
/** page-level (not per-placement) keys that are settings, not selections */
const PERSISTED_PAGE_KEYS = new Set(['flow:days', 'flow:src', 'flow:dte']);
const MAX_PERSISTED = 400;
export const isPersistedKey = (key: string) => key.startsWith('tool:') || PERSISTED_PAGE_KEYS.has(key);

function hydrate(page: string, vals: Map<string, unknown>) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + page);
    if (!raw) return;
    const obj = JSON.parse(raw) as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) if (isPersistedKey(k) && v !== undefined) vals.set(k, v);
  } catch { /* corrupt or blocked storage: start clean */ }
}
const writeTimers = new Map<string, ReturnType<typeof setTimeout>>();
function persist(page: string, store: Store) {
  clearTimeout(writeTimers.get(page));
  writeTimers.set(page, setTimeout(() => {
    writeTimers.delete(page);
    try {
      const out: Record<string, unknown> = {};
      let n = 0;
      // newest keys win the cap (Map keeps insertion order; re-set keys move to the end below)
      const entries = [...store.vals.entries()].filter(([k]) => isPersistedKey(k));
      for (const [k, v] of entries.slice(-MAX_PERSISTED)) { out[k] = v; n++; }
      if (n) localStorage.setItem(LS_PREFIX + page, JSON.stringify(out));
      else localStorage.removeItem(LS_PREFIX + page);
    } catch { /* private mode / quota: in-memory still works for this session */ }
  }, 250));
}

const storeFor = (page: string): Store => {
  let s = STORES.get(page);
  if (!s) {
    s = { vals: new Map(), subs: new Set() };
    if (typeof window !== 'undefined') hydrate(page, s.vals);
    STORES.set(page, s);
  }
  return s;
};

export function useDashState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const { page } = useDashboard();
  const store = storeFor(page);
  const subscribe = useCallback((cb: () => void) => { store.subs.add(cb); return () => { store.subs.delete(cb); }; }, [store]);
  const snap = useSyncExternalStore(subscribe, () => store.vals.get(key));
  const value = (snap === undefined ? initial : snap) as T;
  const initRef = useRef(initial);
  initRef.current = initial;
  const set = useCallback((v: T | ((prev: T) => T)) => {
    const prev = (store.vals.has(key) ? store.vals.get(key) : initRef.current) as T;
    const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v;
    if (Object.is(next, prev)) return;
    store.vals.delete(key); // re-insert so the persisted cap keeps the most recently used settings
    store.vals.set(key, next);
    store.subs.forEach((f) => f());
    if (isPersistedKey(key)) persist(page, store);
  }, [store, key, page]);
  return [value, set];
}

/** Per-placement setting (e.g. this matrix's DTE bucket) that survives the
 *  tool being paused off-screen and remounted, and a reload (localStorage). */
export function useToolSetting<T>(name: string, initial: T) {
  const inst = useToolInstance();
  return useDashState<T>(`tool:${inst}:${name}`, initial);
}

/** The provenance line every tool carries: source and age of the newest datum. */
export function provenanceOf(def: ToolDef, report: ToolReport, now: number) {
  const age = def.staticContent
    ? 'static · defined in code'
    : def.ageInside
    ? 'age shown per row'
    : report.asOf !== undefined
      ? (report.asOf ? ageLabel(report.asOf, now) : 'no data yet')
      : 'loading…';
  return { src: report.source ?? def.source, age };
}

/** The title a phone shows: ONE line, whole words (def.phoneTitle or the title before " · "). */
export const phoneTitleOf = (def: ToolDef) => def.phoneTitle ?? shortTitle(def.title);

/**
 * SECTION meta, every size (UI redundancy pass 2026-10-01 — was phone-only;
 * desktop printed a full "source · /api/path · age" line plus a "what · Units"
 * blurb under every title: two to four lines per section). ONE compact
 * freshness stamp (● 2m, grey/amber/red by age), the tool's short status note
 * on desktop, and an ⓘ with the description, units, full source, age and feed
 * (a bottom sheet on phones, a popover on desktop). Age always visible; source
 * one tap away.
 */
export function PhoneMeta({ def, report, now }: { def: ToolDef; report: ToolReport; now: number }) {
  const { src, age } = provenanceOf(def, report, now);
  const label = def.staticContent ? 'static' : def.ageInside ? 'per row' : report.asOf === undefined ? '…' : '—';
  return (
    <span className="qp-meta qp-meta-all">
      {report.note && <span className={`qp-meta-note qp-desk-only${report.tone === 'warn' ? ' warn' : ''}`} title={report.note}>{report.note}</span>}
      <FreshStamp asOf={def.staticContent || def.ageInside ? null : report.asOf} now={now} label={label} warn={report.tone === 'warn'} />
      <InfoSheet title={def.title} what={def.what} units={def.units} source={src} age={age} note={report.note} feed={def.backing} />
    </span>
  );
}

export function ToolFrame({
  def, onRemove, onCollapse, collapsed = false, dragHandle, resizeHandle, children, compact, symbol, grip = true,
}: {
  def: ToolDef;
  onRemove?: () => void;
  /** workspace tiles that may fold to their header (NEXUS) */
  onCollapse?: () => void;
  collapsed?: boolean;
  dragHandle?: ReactNode;
  /** false on a fixed page: no grip glyph, since the tile cannot move */
  grip?: boolean;
  resizeHandle?: ReactNode;
  children: ReactNode;
  /** @deprecated the description lives behind the ⓘ at every size now; kept so call sites stay valid */
  compact?: boolean;
  /** shown as a chip for tools that follow the focused ticker */
  symbol?: string;
}) {
  const [report, setReport] = useState<ToolReport>({});
  const now = useNow();
  const phone = usePhone();
  // GEX workspace (operator 2026-10-01: "it needs to fit to screen"): ONE header
  // row — title · symbol · source + age chip · (i) holding what / units / backing.
  // NEXUS workspace (2026-10-01) wears the same one-row head: the strips on top stay thin.
  const page = useDashboard().page;
  const oneRow = page === 'gex' || page === 'nexus';
  return (
    <section className={`fd-tool${oneRow ? ' fd-one-row' : ''}${collapsed ? ' fd-collapsed' : ''}`} aria-label={def.title} data-tool={def.id}>
      <header className="fd-tool-head">
        {dragHandle ?? (grip ? <span className="fd-grip-ph" aria-hidden><GripVertical size={12} /></span> : null)}
        <div className="fd-tool-titles">
          <div className="fd-tool-title">
            <span title={oneRow ? def.title : undefined}>{phone || oneRow ? phoneTitleOf(def) : def.title}</span>
            {symbol && <span className="fd-sym" title="Follows the focus ticker in the bar above">{symbol}</span>}
            <PhoneMeta def={def} report={report} now={now} />
          </div>
        </div>
        {onCollapse && (
          <button type="button" className="fd-icon-btn fd-collapse" onClick={onCollapse} aria-expanded={!collapsed}
            aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${def.title}`} title={collapsed ? 'Expand tool' : 'Collapse to its header'}>
            {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </button>
        )}
        {onRemove && (
          <button type="button" className="fd-icon-btn" onClick={onRemove} aria-label={`Remove ${def.title}`} title="Remove tool">
            <X size={13} />
          </button>
        )}
      </header>
      {!collapsed && (
        <div className="fd-tool-body">
          <ReportCtx.Provider value={setReport}>{children}</ReportCtx.Provider>
        </div>
      )}
      {resizeHandle}
    </section>
  );
}
