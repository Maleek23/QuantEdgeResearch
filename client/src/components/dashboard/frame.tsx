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
import { GripVertical, X } from 'lucide-react';
import { useStockContext } from '@/contexts/stock-context';
import { ageLabel } from './tools/flow/tape';
import type { ToolDef } from './tool-def';

export interface ToolReport {
  /** ISO of the newest datum shown (not the fetch time). */
  asOf?: string | null;
  /** Overrides the registry source line when the tool knows better. */
  source?: string;
  /** Short state note, e.g. "stream off", "throttled". */
  note?: string;
  tone?: 'ok' | 'warn';
}

const ReportCtx = createContext<(r: ToolReport) => void>(() => {});

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
  addTool: (id: string) => void;
}
export const DashboardCtx = createContext<DashCtx>({ page: 'none', hasTool: () => false, addTool: () => {} });
export const useDashboard = () => useContext(DashboardCtx);

/* ── this placement's instance id ── */
export const ToolInstanceCtx = createContext<string>('');
export const useToolInstance = () => useContext(ToolInstanceCtx);

/** The dashboard's focus ticker IS the terminal's shared symbol, so a row
 *  clicked here also re-points every other page's symbol tools. */
export function useFocusSymbol(fallback = 'SPY'): [string, (s: string) => void] {
  const { currentStock, setCurrentStock } = useStockContext();
  return [(currentStock?.symbol || fallback).toUpperCase(), (s: string) => setCurrentStock({ symbol: s.toUpperCase() })];
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
   Not persisted to the account: it is working state, not layout. */
type Store = { vals: Map<string, unknown>; subs: Set<() => void> };
const STORES = new Map<string, Store>();
const storeFor = (page: string): Store => {
  let s = STORES.get(page);
  if (!s) { s = { vals: new Map(), subs: new Set() }; STORES.set(page, s); }
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
    store.vals.set(key, next);
    store.subs.forEach((f) => f());
  }, [store, key]);
  return [value, set];
}

/** Per-placement setting (e.g. this matrix's DTE bucket) that survives the
 *  tool being paused off-screen and remounted. */
export function useToolSetting<T>(name: string, initial: T) {
  const inst = useToolInstance();
  return useDashState<T>(`tool:${inst}:${name}`, initial);
}

export function ToolFrame({
  def, onRemove, dragHandle, resizeHandle, children, compact, symbol,
}: {
  def: ToolDef;
  onRemove?: () => void;
  dragHandle?: ReactNode;
  resizeHandle?: ReactNode;
  children: ReactNode;
  compact?: boolean;
  /** shown as a chip for tools that follow the focused ticker */
  symbol?: string;
}) {
  const [report, setReport] = useState<ToolReport>({});
  const now = useNow();
  const age = def.ageInside
    ? 'age shown per row'
    : report.asOf !== undefined
      ? (report.asOf ? ageLabel(report.asOf, now) : 'no data yet')
      : 'loading…';
  const src = report.source ?? def.source;
  return (
    <section className="fd-tool" aria-label={def.title} data-tool={def.id}>
      <header className="fd-tool-head">
        {dragHandle ?? <span className="fd-grip-ph" aria-hidden><GripVertical size={12} /></span>}
        <div className="fd-tool-titles">
          <div className="fd-tool-title">
            <span>{def.title}</span>
            {symbol && <span className="fd-sym" title="Follows the focused ticker — change it in the bar above, or click a row in any tool">{symbol}</span>}
            <span className={`fd-age${report.tone === 'warn' ? ' warn' : ''}`} title={`Data source: ${src}\nAge = time since the newest datum shown, not since the last fetch.`}>
              {src} · {age}{report.note ? ` · ${report.note}` : ''}
            </span>
          </div>
          {!compact && (
            <div className="fd-tool-blurb" title={`${def.what}\nUnits: ${def.units}\nBacking: ${def.backing}`}>
              {def.what} <span className="fd-units">Units: {def.units}</span>
            </div>
          )}
        </div>
        {onRemove && (
          <button type="button" className="fd-icon-btn" onClick={onRemove} aria-label={`Remove ${def.title}`} title="Remove tool">
            <X size={13} />
          </button>
        )}
      </header>
      <div className="fd-tool-body">
        <ReportCtx.Provider value={setReport}>{children}</ReportCtx.Provider>
      </div>
      {resizeHandle}
    </section>
  );
}
