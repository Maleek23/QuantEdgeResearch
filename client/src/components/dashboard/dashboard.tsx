/**
 * DASHBOARD — the platform's one page framework (generalised from the FLOW
 * tab's tool board, which the operator signed off as THE design).
 *
 *   <Dashboard page="gex" />
 *
 * Three page modes (pages.ts `mode`):
 *   workspace  GEX, FLOW — named dashboards, an "Add tool" menu of the page's
 *              CURATED catalogue grouped by category, drag (dnd-kit) and
 *              corner-resize on a 12-column grid, keyboard move/resize,
 *              Auto-arrange, Restore default, Clear. Layouts persist per user
 *              (use-dashboards.ts).
 *   fixed      every other dashboard page — the same tiles in the page's
 *              curated default layout; nothing to add, move, resize or save,
 *              and any layout saved for the page earlier is ignored.
 *   simple     CHART, LEAPS, POSITIONS — one primary tool full bleed.
 *
 * Server load (small droplet): tool code is React.lazy, a tool mounts only
 * once it scrolls into view, and a tool that stays off-screen for
 * PAUSE_AFTER_MS unmounts — its polling stops — until it is visible again
 * (react-query's cache repaints it instantly on return). Identical endpoints
 * across tools share one query key, so two tools never mean two requests.
 *
 * Desktop: the page fits the viewport; the bar is fixed and only the grid
 * (and each tool's own body) scrolls. Phone (< 768px): tools stack in one
 * column in reading order — stack, never hide; drag/resize are desktop-only.
 */
import {
  Component, Suspense, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type CSSProperties, type ErrorInfo, type RefObject, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { DndContext, PointerSensor, useDraggable, useSensor, useSensors, type DragEndEvent, type DragMoveEvent } from '@dnd-kit/core';
import { Check, ChevronDown, Crosshair, Eraser, GripVertical, LayoutGrid, PanelRightClose, PanelRightOpen, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { QEError } from '@/components/ui/qe-states';
import { PageSkeleton, ToolSkeleton } from '@/components/ui/qe-loading';
import '@/styles/nexus.css';
import './dashboard.css';
import { TOOLS, TOOL_BY_ID, categoriesFor, type ToolDef } from './registry';
import { COLS, ROW_H, GAP, autoArrange, clampTool, compact, fitRowHeight, readingOrder, slotFor, uid, type PlacedTool } from './layout';
import { DashboardCtx, ReportCtx, ToolFrame, ToolInstanceCtx, provenanceOf, useFocusSymbol, useNow, type ToolReport } from './frame';
import { materialize, useDashboards } from './use-dashboards';
import { PAGES, inCatalog, skeletonTiles, type PageId, type PageSpec } from './pages';

/** A tool off-screen this long unmounts (its polling stops). */
const PAUSE_AFTER_MS = 20_000;

/* ── per-tool error boundary: one broken tool never blanks the board ── */
class ToolBoundary extends Component<{ title: string; children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error, info: ErrorInfo) { console.warn('[dashboard] tool crashed', err, info.componentStack); }
  render() {
    if (this.state.err) {
      return <QEError className="fd-m" title={`${this.props.title} crashed while rendering`} message={this.state.err.message} onRetry={() => this.setState({ err: null })} />;
    }
    return this.props.children;
  }
}

/* ── lazy mount + off-screen pause ── */
const ScrollRootCtx = createContext<Element | null>(null);

function useLiveMount(ref: RefObject<HTMLElement>) {
  const root = useContext(ScrollRootCtx);
  const [state, setState] = useState<'idle' | 'live' | 'paused'>('idle');
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setState('live'); return; }
    let t: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(([e]) => {
      clearTimeout(t);
      if (e.isIntersecting) setState('live');
      else t = setTimeout(() => setState((s) => (s === 'live' ? 'paused' : s)), PAUSE_AFTER_MS);
    }, { root, rootMargin: '240px 0px' });
    io.observe(el);
    return () => { io.disconnect(); clearTimeout(t); };
  }, [ref, root]);
  return state;
}

function ToolBody({ tool }: { tool: PlacedTool }) {
  const def = TOOL_BY_ID.get(tool.type)!;
  const ref = useRef<HTMLDivElement>(null);
  const live = useLiveMount(ref);
  const C = def.Component;
  return (
    <div ref={ref} className="fd-live">
      {live === 'live' ? (
        <ToolInstanceCtx.Provider value={tool.i}>
          <ToolBoundary title={def.title}>
            <Suspense fallback={<ToolSkeleton />}>
              <C />
            </Suspense>
          </ToolBoundary>
        </ToolInstanceCtx.Provider>
      ) : live === 'idle' ? (
        <ToolSkeleton label="loads when scrolled into view" />
      ) : (
        <div className="fd-idle" role="status">Paused while off-screen — no polling. Resumes when visible.</div>
      )}
    </div>
  );
}

/* ── one draggable tile ── */
function Tile({
  tool, rect, onRemove, onNudge, onResizeStart, dragging, resizing, symbol,
}: {
  tool: PlacedTool;
  rect: { left: number; top: number; width: number; height: number };
  onRemove: () => void;
  onNudge: (dx: number, dy: number, dw: number, dh: number) => void;
  onResizeStart: (e: RPointerEvent) => void;
  dragging: boolean;
  resizing: boolean;
  symbol?: string;
}) {
  const def = TOOL_BY_ID.get(tool.type)!;
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: tool.i });
  const style: CSSProperties = {
    left: rect.left, top: rect.top, width: rect.width, height: rect.height,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    zIndex: dragging || resizing ? 20 : undefined,
  };
  const onKey = (e: RKeyboardEvent) => {
    const k = e.key;
    const d = k === 'ArrowLeft' ? [-1, 0] : k === 'ArrowRight' ? [1, 0] : k === 'ArrowUp' ? [0, -1] : k === 'ArrowDown' ? [0, 1] : null;
    if (!d) return;
    e.preventDefault();
    if (e.shiftKey) onNudge(0, 0, d[0], d[1]); else onNudge(d[0], d[1], 0, 0);
  };
  return (
    <div ref={setNodeRef} className={cn('fd-tile', (dragging || resizing) && 'lifted')} style={style}>
      <ToolFrame
        def={def}
        symbol={symbol}
        onRemove={onRemove}
        dragHandle={
          <button type="button" className="fd-grip" aria-label={`Move ${def.title}. Arrow keys move, Shift+arrows resize.`} title="Drag to move · arrows move · Shift+arrows resize"
            {...attributes} {...listeners} onKeyDown={onKey}>
            <GripVertical size={13} />
          </button>
        }
        resizeHandle={<span className="fd-resize" onPointerDown={onResizeStart} aria-hidden title="Drag to resize" />}
      >
        <ToolBody tool={tool} />
      </ToolFrame>
    </div>
  );
}

/* ── small dismissable menu hook ── */
function useMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
  }, [open]);
  return { open, setOpen, ref };
}

/* ── add-tool menu: the workspace's curated catalogue, its own categories first ── */
function AddToolMenu({ spec, onAdd, present }: { spec: PageSpec; onAdd: (id: string) => void; present: Set<string> }) {
  const { open, setOpen, ref } = useMenu();
  const [q, setQ] = useState('');
  const offered = useMemo(() => TOOLS.filter((t) => inCatalog(spec, t)), [spec]);
  const cats = useMemo(() => categoriesFor(spec.primary).filter((c) => offered.some((t) => t.category === c)), [spec.primary, offered]);
  const needle = q.trim().toLowerCase();
  const match = (t: (typeof TOOLS)[number]) => !needle || `${t.title} ${t.what} ${t.category}`.toLowerCase().includes(needle);
  return (
    <div className="fd-menu-wrap" ref={ref}>
      <button type="button" className="fd-btn primary" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        <Plus size={13} /> Add tool
      </button>
      {open && (
        <div className="fd-menu fd-menu-wide" role="menu">
          <input className="fd-menu-search" autoFocus placeholder={`Search ${offered.length} ${spec.label} tools…`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tools" />
          {cats.map((c) => {
            const list = offered.filter((t) => t.category === c && match(t));
            if (!list.length) return null;
            return (
              <div key={c} className="fd-menu-group">
                <div className="fd-menu-head">{c.toUpperCase()}</div>
                {list.map((t) => (
                  <button key={t.id} type="button" role="menuitem" className="fd-menu-item" title={`${t.what}\nUnits: ${t.units}\nSource: ${t.backing}`}
                    onClick={() => { onAdd(t.id); setOpen(false); setQ(''); }}>
                    <span>{t.title}{t.needs?.includes('symbol') && <em className="fd-menu-tag">ticker</em>}</span>
                    {present.has(t.id) && <span className="fd-menu-on" aria-label="already on this dashboard"><Check size={11} /></span>}
                  </button>
                ))}
              </div>
            );
          })}
          <div className="fd-menu-note">Only tools that belong on {spec.label} are listed. Not offered (no data source yet): Option Chart · Dark Pool Alerts · Trade Terminal.</div>
        </div>
      )}
    </div>
  );
}

/* ── dashboard switcher ── */
function DashSwitcher({ api }: { api: ReturnType<typeof useDashboards> }) {
  const { open, setOpen, ref } = useMenu();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  if (!api.dashboards || !api.active) return null;
  return (
    <div className="fd-menu-wrap" ref={ref}>
      <button type="button" className="fd-btn" onClick={() => { setOpen((o) => !o); setEditing(null); }} aria-expanded={open} aria-haspopup="menu">
        <LayoutGrid size={13} /> {api.active.name} <ChevronDown size={12} />
      </button>
      {open && (
        <div className="fd-menu" role="menu">
          <div className="fd-menu-head">DASHBOARDS</div>
          {api.dashboards.map((d) => (
            <div key={d.id} className={cn('fd-dash-row', d.id === api.active!.id && 'on')}>
              {editing === d.id ? (
                <form className="fd-dash-edit" onSubmit={(e) => { e.preventDefault(); api.rename(d.id, draft); setEditing(null); }}>
                  <input autoFocus value={draft} maxLength={40} onChange={(e) => setDraft(e.target.value)} aria-label="Dashboard name" />
                  <button type="submit" className="fd-icon-btn" aria-label="Save name"><Check size={12} /></button>
                </form>
              ) : (
                <>
                  <button type="button" className="fd-dash-name" onClick={() => { api.setActiveId(d.id); setOpen(false); }}>
                    {d.name} <span className="dim">· {d.tools.length} tools{api.isShipped(d.id) ? (d.pristine ? ' · default' : ' · customised') : ''}</span>
                  </button>
                  <button type="button" className="fd-icon-btn" aria-label={`Rename ${d.name}`} onClick={() => { setEditing(d.id); setDraft(d.name); }}><Pencil size={11} /></button>
                  {api.dashboards!.length > 1 && !api.isShipped(d.id) && (
                    <button type="button" className="fd-icon-btn" aria-label={`Delete ${d.name}`} onClick={() => { if (window.confirm(`Delete "${d.name}"? This removes the saved layout.`)) void api.remove(d.id); }}><Trash2 size={11} /></button>
                  )}
                </>
              )}
            </div>
          ))}
          <button type="button" className="fd-menu-item" onClick={() => { api.create(); setOpen(false); }}><span><Plus size={11} /> New dashboard</span></button>
        </div>
      )}
    </div>
  );
}

/* ── focus ticker: the one symbol every ticker tool follows ── */
interface SearchHit { symbol: string; name?: string }
function FocusBox() {
  const [focus, setFocus] = useFocusSymbol();
  const { open, setOpen, ref } = useMenu();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim().toUpperCase()), 250); return () => clearTimeout(t); }, [q]);
  const hits = useQuery<SearchHit[]>({
    queryKey: ['/api/search/symbols', debounced],
    queryFn: async () => {
      const r = await fetch(`/api/search/symbols?q=${encodeURIComponent(debounced)}`, { credentials: 'include' });
      if (!r.ok) return [];
      const body = await r.json();
      return (Array.isArray(body) ? body : body.results ?? []).slice(0, 8);
    },
    enabled: open && debounced.length > 0, staleTime: 60_000, retry: 0,
  });
  const pick = (s: string) => { if (s.trim()) setFocus(s.trim()); setQ(''); setOpen(false); };
  return (
    <div className="fd-menu-wrap" ref={ref}>
      <button type="button" className="fd-btn fd-focus" onClick={() => setOpen((o) => !o)} aria-expanded={open} title="The ticker every ticker-scoped tool on this page follows. Clicking a row in any tool changes it too.">
        <Crosshair size={13} /> <b>{focus}</b> <ChevronDown size={12} />
      </button>
      {open && (
        <div className="fd-menu" role="dialog" aria-label="Change focus ticker">
          <form onSubmit={(e) => { e.preventDefault(); pick(q); }}>
            <input className="fd-menu-search" autoFocus placeholder="Ticker…" value={q} onChange={(e) => setQ(e.target.value.toUpperCase())} aria-label="Ticker" />
          </form>
          {(hits.data ?? []).map((h) => (
            <button key={h.symbol} type="button" className="fd-menu-item" onClick={() => pick(h.symbol)}>
              <span><b>{h.symbol}</b> <span className="dim">{h.name ?? ''}</span></span>
            </button>
          ))}
          {!!debounced && hits.isFetched && !(hits.data ?? []).length && <div className="fd-menu-note">No match — Enter uses “{debounced}” as typed.</div>}
          <div className="fd-menu-note">Ticker tools on every page follow this symbol.</div>
        </div>
      )}
    </div>
  );
}

function SaveBadge({ api }: { api: ReturnType<typeof useDashboards> }) {
  const now = useNow(10_000);
  const ago = api.savedAt ? Math.max(0, Math.round((now - api.savedAt) / 1000)) : null;
  const pristine = api.active?.pristine;
  const txt = api.save === 'loading' ? 'loading layouts…'
    : api.save === 'saving' ? 'saving…'
    : pristine ? 'default layout · your changes save automatically'
    : api.save === 'account' ? `saved to your account${ago != null ? ` · ${ago < 60 ? `${ago}s` : `${Math.round(ago / 60)}m`} ago` : ''}`
    : api.save === 'device' || (api.save === 'default' && !api.signedIn) ? 'saved on this device only (signed out)'
    : api.save === 'default' ? 'saved to your account'
    : 'account save failed — kept on this device';
  return <span className={cn('fd-save', api.save === 'error' && 'warn')} role="status">{txt}</span>;
}

/* ── simple page: one primary tool, full bleed, optional right rail ── */

/** A tool body with no frame: provenance is reported up to the page bar. */
function BareTool({ def, instance, onReport }: { def: ToolDef; instance: string; onReport: (r: ToolReport) => void }) {
  const C = def.Component;
  return (
    <ReportCtx.Provider value={onReport}>
      <ToolInstanceCtx.Provider value={instance}>
        <ToolBoundary title={def.title}>
          <Suspense fallback={<ToolSkeleton />}>
            <C />
          </Suspense>
        </ToolBoundary>
      </ToolInstanceCtx.Provider>
    </ReportCtx.Provider>
  );
}

function Provenance({ def, report, now }: { def: ToolDef; report: ToolReport; now: number }) {
  const { src, age } = provenanceOf(def, report, now);
  return (
    <span className={cn('fd-prov', report.tone === 'warn' && 'warn')} title={`${def.title} — ${def.what}\nUnits: ${def.units}\nData source: ${src}\nAge = time since the newest datum shown, not since the last fetch.`}>
      {def.title} · {src} · {age}{report.note ? ` · ${report.note}` : ''}
    </span>
  );
}

function SimpleView({ spec }: { spec: PageSpec }) {
  const simple = spec.simple!;
  const main = TOOL_BY_ID.get(simple.tool);
  const rail = simple.rail ? TOOL_BY_ID.get(simple.rail.tool) : undefined;
  const railKey = `qe-dash-${spec.id}-rail`;
  const [railOpen, setRailOpenState] = useState(() => { try { return localStorage.getItem(railKey) !== 'closed'; } catch { return true; } });
  const setRailOpen = (open: boolean) => { setRailOpenState(open); try { localStorage.setItem(railKey, open ? 'open' : 'closed'); } catch { /* ignore */ } };
  const [mainReport, setMainReport] = useState<ToolReport>({});
  const [railReport, setRailReport] = useState<ToolReport>({});
  const now = useNow();
  const ctx = useMemo(() => ({ page: spec.id, hasTool: (t: string) => t === simple.tool || t === simple.rail?.tool, addTool: () => {}, editable: false }), [spec.id, simple]);
  if (!main) return <QEError className="fd-m" title={`${spec.label}'s primary tool is not in the registry`} message={simple.tool} />;
  return (
    <DashboardCtx.Provider value={ctx}>
      <div className={cn('flowdash dash-fit dash-simple', `dash-${spec.id}`)} data-page={spec.id} data-view="simple">
        <div className="fd-bar">
          <div className="fd-bar-title">
            <span className="fd-eyebrow">{spec.label}</span>
            {/* no focus box: the primary tool owns its own ticker control (the chart's toolbar) */}
            <Provenance def={main} report={mainReport} now={now} />
          </div>
          <div className="fd-bar-actions">
            {rail && (
              <button type="button" className="fd-btn" onClick={() => setRailOpen(!railOpen)} aria-expanded={railOpen} aria-controls={`${spec.id}-rail`}
                title={railOpen ? `Hide the ${simple.rail!.label.toLowerCase()} rail` : `Show the ${simple.rail!.label.toLowerCase()} rail`}>
                {railOpen ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />} {simple.rail!.label}
              </button>
            )}
          </div>
        </div>
        <div className={cn('fd-simple', rail && railOpen && 'with-rail')}>
          <section className="fd-simple-main" aria-label={main.title} data-tool={main.id}>
            <div className="fd-live">
              <BareTool def={main} instance={`simple-${spec.id}-main`} onReport={setMainReport} />
            </div>
          </section>
          {rail && railOpen && (
            <aside id={`${spec.id}-rail`} className="fd-simple-rail" aria-label={rail.title} data-tool={rail.id}>
              <header className="fd-simple-rail-head">
                <span className="fd-simple-rail-title">{simple.rail!.label}</span>
                <Provenance def={rail} report={railReport} now={now} />
                <button type="button" className="fd-icon-btn" onClick={() => setRailOpen(false)} aria-label={`Hide ${simple.rail!.label}`} title="Hide rail"><PanelRightClose size={13} /></button>
              </header>
              <div className="fd-live">
                <BareTool def={rail} instance={`simple-${spec.id}-rail`} onReport={setRailReport} />
              </div>
            </aside>
          )}
        </div>
      </div>
    </DashboardCtx.Provider>
  );
}

/* ══════════════════════════════ main ══════════════════════════════ */

/**
 * <Dashboard page="gex" /> — a page, rendered by its mode (pages.ts):
 * SIMPLE (CHART, LEAPS, POSITIONS) is its one primary tool full bleed;
 * WORKSPACE (GEX, FLOW) is the editable tool grid; everything else is the
 * FIXED grid — the curated default, not editable.
 */
export function Dashboard({ page, chrome }: { page: PageId; /** px of app chrome above+below — fallback only; the shell's measured --qe-main-h wins */ chrome?: number }) {
  const spec = PAGES[page];
  if (spec.mode === 'simple' && spec.simple) return <SimpleView key={page} spec={spec} />;
  if (spec.mode === 'workspace') return <GridDashboard key={page} page={page} chrome={chrome} />;
  return <FixedDashboard key={page} page={page} chrome={chrome} />;
}

/** Grid geometry: measured width, rows that fit VIEW_ROWS to the viewport. */
function useGridGeometry(isMobile: boolean, remeasure: unknown) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [gridW, setGridW] = useState(1200);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setGridW(el.clientWidth));
    ro.observe(el); setGridW(el.clientWidth);
    return () => ro.disconnect();
  }, [isMobile, remeasure]);
  // Rows scale with the viewport: VIEW_ROWS rows always fill the grid area,
  // so a VIEW_ROWS-tall default tiles exactly at 1440×900, 1920×1080, 2513×1260…
  const [viewH, setViewH] = useState(0);
  useEffect(() => {
    if (!scroller) return;
    const ro = new ResizeObserver(() => setViewH(scroller.clientHeight));
    ro.observe(scroller); setViewH(scroller.clientHeight);
    return () => ro.disconnect();
  }, [scroller]);
  const rowH = isMobile ? ROW_H : fitRowHeight(viewH);
  const colW = (gridW - GAP * (COLS - 1)) / COLS;
  return { gridRef, scroller, setScroller, rowH, colW, stepX: colW + GAP, stepY: rowH + GAP };
}

/* ── FIXED page: the curated default, same tiles, nothing editable ── */
function FixedDashboard({ page, chrome }: { page: PageId; chrome?: number }) {
  const spec = PAGES[page];
  const isMobile = useIsMobile();
  const [focus] = useFocusSymbol();
  // Always the shipped default — a layout saved for this page before it became
  // fixed is deliberately not read (and not deleted).
  const tools = useMemo(() => (spec.defaults[0] ? materialize(spec.defaults[0]).tools : []), [spec]);
  const { gridRef, scroller, setScroller, rowH, colW, stepX, stepY } = useGridGeometry(isMobile, tools.length);
  const present = useMemo(() => new Set(tools.map((t) => t.type)), [tools]);
  const ctx = useMemo(() => ({ page, hasTool: (t: string) => present.has(t), addTool: () => {}, editable: false }), [page, present]);
  const needsFocus = tools.some((t) => TOOL_BY_ID.get(t.type)?.needs?.includes('symbol'));
  const symbolOf = (t: PlacedTool) => (TOOL_BY_ID.get(t.type)?.needs?.includes('symbol') ? focus : undefined);
  const bottom = tools.reduce((m, t) => Math.max(m, t.y + t.h), 0);
  return (
    <DashboardCtx.Provider value={ctx}>
      <div className={cn('flowdash dash-fit dash-fixed', `dash-${page}`)} data-page={page} data-view="fixed" style={chrome != null ? ({ ['--dash-chrome' as string]: `${chrome}px` }) : undefined}>
        <div className="fd-bar">
          <div className="fd-bar-title">
            <span className="fd-eyebrow">{spec.label}</span>
            {needsFocus && <FocusBox />}
          </div>
          <div className="fd-bar-actions">
            <span className="fd-save" title={`${spec.label} is a fixed, curated layout. GEX and FLOW are the customizable workspaces.`}>curated layout</span>
          </div>
        </div>
        <ScrollRootCtx.Provider value={isMobile ? null : scroller}>
          <div className="fd-scroller" ref={setScroller}>
            {!tools.length ? (
              <QEError className="fd-m" title={`${spec.label} has no default layout`} message="No tools are defined for this page." />
            ) : isMobile ? (
              <div className="fd-stack" ref={gridRef}>
                {readingOrder(tools).map((t) => (
                  <div key={t.i} className="fd-tile stacked" style={{ height: `min(${Math.max(300, t.h * ROW_H)}px, 88dvh)`, minHeight: 300 }}>
                    <ToolFrame def={TOOL_BY_ID.get(t.type)!} symbol={symbolOf(t)} compact={false} grip={false}>
                      <ToolBody tool={t} />
                    </ToolFrame>
                  </div>
                ))}
              </div>
            ) : (
              <div className="fd-grid" ref={gridRef} style={{ height: Math.max(1, bottom) * stepY - GAP }}>
                {tools.map((t) => (
                  <div key={t.i} className="fd-tile" style={{ left: t.x * stepX, top: t.y * stepY, width: t.w * colW + (t.w - 1) * GAP, height: t.h * rowH + (t.h - 1) * GAP }}>
                    <ToolFrame def={TOOL_BY_ID.get(t.type)!} symbol={symbolOf(t)} grip={false}>
                      <ToolBody tool={t} />
                    </ToolFrame>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollRootCtx.Provider>
      </div>
    </DashboardCtx.Provider>
  );
}

/* ── WORKSPACE page (GEX, FLOW): the editable tool grid ── */
function GridDashboard({ page, chrome }: { page: PageId; chrome?: number }) {
  const spec = PAGES[page];
  const api = useDashboards(spec);
  const isMobile = useIsMobile();
  const tools = api.active?.tools ?? [];
  const [focus] = useFocusSymbol();
  const { gridRef, scroller, setScroller, rowH, colW, stepX, stepY } = useGridGeometry(isMobile, `${api.active?.id}|${tools.length > 0}`);

  const [dragId, setDragId] = useState<string | null>(null);
  const [ghost, setGhost] = useState<PlacedTool | null>(null);
  const [resize, setResize] = useState<{ i: string; w: number; h: number } | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const moved = (t: PlacedTool, dx: number, dy: number) => {
    const def = TOOL_BY_ID.get(t.type)!;
    return clampTool({ ...t, x: t.x + dx, y: t.y + dy }, def.minSize.w, def.minSize.h);
  };
  const onDragMove = (e: DragMoveEvent) => {
    const t = tools.find((x) => x.i === e.active.id);
    if (!t) return;
    setGhost(moved(t, Math.round(e.delta.x / stepX), Math.round(e.delta.y / stepY)));
  };
  const onDragEnd = (e: DragEndEvent) => {
    const id = String(e.active.id);
    setDragId(null); setGhost(null);
    const dx = Math.round(e.delta.x / stepX), dy = Math.round(e.delta.y / stepY);
    if (!dx && !dy) return;
    api.updateActive((ts) => compact(ts.map((t) => (t.i === id ? moved(t, dx, dy) : t)), id));
  };

  const nudge = useCallback((id: string, dx: number, dy: number, dw: number, dh: number) => {
    api.updateActive((ts) => compact(ts.map((t) => {
      if (t.i !== id) return t;
      const def = TOOL_BY_ID.get(t.type)!;
      return clampTool({ ...t, x: t.x + dx, y: t.y + dy, w: t.w + dw, h: t.h + dh }, def.minSize.w, def.minSize.h);
    }), id));
  }, [api]);

  const startResize = (t: PlacedTool) => (e: RPointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const def = TOOL_BY_ID.get(t.type)!;
    const sx = e.clientX, sy = e.clientY;
    let cur = { w: t.w, h: t.h };
    setResize({ i: t.i, ...cur });
    const move = (ev: PointerEvent) => {
      const w = Math.max(def.minSize.w, Math.min(COLS - t.x, t.w + Math.round((ev.clientX - sx) / stepX)));
      const h = Math.max(def.minSize.h, t.h + Math.round((ev.clientY - sy) / stepY));
      if (w !== cur.w || h !== cur.h) { cur = { w, h }; setResize({ i: t.i, w, h }); }
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      setResize(null);
      if (cur.w !== t.w || cur.h !== t.h) api.updateActive((ts) => compact(ts.map((x) => (x.i === t.i ? { ...x, ...cur } : x)), t.i));
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const addTool = useCallback((id: string) => {
    const def = TOOL_BY_ID.get(id);
    if (!def) return;
    api.updateActive((ts) => {
      const at = slotFor(ts, def.defaultSize.w, def.defaultSize.h);
      return [...ts, { i: uid(), type: id, x: at.x, y: at.y, w: Math.min(def.defaultSize.w, COLS), h: def.defaultSize.h }];
    });
  }, [api]);
  const present = useMemo(() => new Set(tools.map((t) => t.type)), [tools]);
  const ctx = useMemo(() => ({ page, hasTool: (t: string) => present.has(t), addTool, editable: true }), [page, present, addTool]);
  const needsFocus = tools.some((t) => TOOL_BY_ID.get(t.type)?.needs?.includes('symbol'));
  const symbolOf = (t: PlacedTool) => (TOOL_BY_ID.get(t.type)?.needs?.includes('symbol') ? focus : undefined);

  const rectOf = (t: PlacedTool) => {
    const w = resize?.i === t.i ? resize.w : t.w;
    const h = resize?.i === t.i ? resize.h : t.h;
    return { left: t.x * stepX, top: t.y * stepY, width: w * colW + (w - 1) * GAP, height: h * rowH + (h - 1) * GAP };
  };
  const bottom = Math.max(
    tools.reduce((m, t) => Math.max(m, t.y + (resize?.i === t.i ? resize.h : t.h)), 0),
    ghost ? ghost.y + ghost.h : 0,
  );
  const remove = (i: string) => api.updateActive((ts) => compact(ts.filter((x) => x.i !== i)));

  return (
    <DashboardCtx.Provider value={ctx}>
      <div className={cn('flowdash dash-fit', `dash-${page}`)} data-page={page} data-view="dashboard" style={chrome != null ? ({ ['--dash-chrome' as string]: `${chrome}px` }) : undefined}>
        <div className="fd-bar">
          <div className="fd-bar-title">
            <span className="fd-eyebrow">{spec.label}</span>
            <DashSwitcher api={api} />
            {needsFocus && <FocusBox />}
          </div>
          <div className="fd-bar-actions">
            <AddToolMenu spec={spec} onAdd={addTool} present={present} />
            <button type="button" className="fd-btn" disabled={!tools.length || isMobile}
              onClick={() => api.updateActive((ts) => autoArrange(ts, (t) => TOOL_BY_ID.get(t)?.minSize.h ?? 3, (t) => TOOL_BY_ID.get(t)?.minSize.w ?? 2))}
              title="Pack tools row by row in reading order: no gaps, equal heights per row, sized to fill the screen when the tools' minimum heights allow">
              <LayoutGrid size={13} /> Auto-arrange
            </button>
            <button type="button" className="fd-btn" disabled={!spec.defaults.length || !!api.active?.pristine}
              onClick={() => { if (window.confirm(`Restore "${api.active?.name}" to the ${spec.label} default layout? Your changes to this dashboard are replaced.`)) void api.restoreDefault(); }}
              title="Put this dashboard back to the page's shipped default layout">
              <RotateCcw size={13} /> Restore default
            </button>
            <button type="button" className="fd-btn" disabled={!tools.length} onClick={() => { if (window.confirm(`Remove all ${tools.length} tools from "${api.active?.name}"?`)) api.updateActive(() => []); }}>
              <Eraser size={13} /> Clear
            </button>
            <SaveBadge api={api} />
          </div>
        </div>

        <ScrollRootCtx.Provider value={isMobile ? null : scroller}>
          <div className="fd-scroller" ref={setScroller}>
            {!api.dashboards ? (
              <PageSkeleton fill bar={false} tiles={skeletonTiles(page)} label="loading your dashboards…" />
            ) : !tools.length ? (
              <div className="fd-empty">
                <p>This dashboard has no tools.</p>
                <p className="dim">Add a tool from the {spec.label} catalogue{spec.defaults.length ? ', or restore the default layout' : ''}.</p>
                <div className="fd-empty-actions">
                  {spec.starters.filter((s) => { const d = TOOL_BY_ID.get(s); return !!d && inCatalog(spec, d); }).map((s, n) => (
                    <button key={s} type="button" className={cn('fd-btn', n === 0 && 'primary')} onClick={() => addTool(s)}><Plus size={13} /> {TOOL_BY_ID.get(s)!.title}</button>
                  ))}
                  {!!spec.defaults.length && <button type="button" className="fd-btn" onClick={() => void api.restoreDefault()}><RotateCcw size={13} /> Restore default</button>}
                </div>
              </div>
            ) : isMobile ? (
              <div className="fd-stack" ref={gridRef}>
                {readingOrder(tools).map((t) => {
                  const def = TOOL_BY_ID.get(t.type)!;
                  return (
                    <div key={t.i} className="fd-tile stacked" style={{ height: `min(${Math.max(300, t.h * ROW_H)}px, 88dvh)`, minHeight: 300 }}>
                      <ToolFrame def={def} symbol={symbolOf(t)} compact={false} onRemove={() => remove(t.i)}>
                        <ToolBody tool={t} />
                      </ToolFrame>
                    </div>
                  );
                })}
              </div>
            ) : (
              <DndContext sensors={sensors} onDragStart={(e) => setDragId(String(e.active.id))} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={() => { setDragId(null); setGhost(null); }}>
                <div className="fd-grid" ref={gridRef} style={{ height: Math.max(1, bottom) * stepY - GAP }}>
                  {ghost && <div className="fd-ghost" style={rectOf(ghost)} aria-hidden />}
                  {tools.map((t) => (
                    <Tile key={t.i} tool={t} rect={rectOf(t)} symbol={symbolOf(t)}
                      dragging={dragId === t.i} resizing={resize?.i === t.i}
                      onRemove={() => remove(t.i)}
                      onNudge={(dx, dy, dw, dh) => nudge(t.i, dx, dy, dw, dh)}
                      onResizeStart={startResize(t)} />
                  ))}
                </div>
              </DndContext>
            )}
          </div>
        </ScrollRootCtx.Provider>
      </div>
    </DashboardCtx.Provider>
  );
}

/** FLOW tab — kept as a named export for existing importers. */
export function FlowDashboard() { return <Dashboard page="flow" />; }

export default Dashboard;
