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
  Component, Suspense, createContext, lazy, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type CSSProperties, type ErrorInfo, type RefObject, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { DndContext, PointerSensor, useDraggable, useSensor, useSensors, type DragEndEvent, type DragMoveEvent } from '@dnd-kit/core';
import { Check, ChevronDown, Crosshair, Eraser, GripVertical, LayoutGrid, MoreHorizontal, PanelRightClose, PanelRightOpen, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { QEError } from '@/components/ui/qe-states';
import { PageSkeleton, ToolSkeleton } from '@/components/ui/qe-loading';
import '@/styles/nexus.css';
import './dashboard.css';
import { TOOLS, TOOL_BY_ID, categoriesFor, type ToolDef } from './registry';
import { COLLAPSED_H, COLS, ROW_H, GAP, autoArrange, clampTool, compact, fitRowHeight, readingOrder, slotFor, uid, type PlacedTool } from './layout';
import { DashboardCtx, PhoneMeta, ReportCtx, ToolFrame, ToolInstanceCtx, phoneTitleOf, useFocusSymbol, useNow, type ToolReport } from './frame';
import { usePhone } from '@/components/ui/qe-phone';
import { materialize, useDashboards } from './use-dashboards';
import { useWorkspaceMode, type WorkspaceMode } from './use-workspace-mode';
import { undoToast } from '@/lib/undo-toast';
import { PAGES, inCatalog, skeletonTiles, type PageId, type PageSpec } from './pages';

/** Phone page headers (PageSpec.phone.lead) — rendered above the one-column stack. */
const PHONE_LEAD: Partial<Record<PageId, ReturnType<typeof lazy>>> = {
  // the matrix IS the GEX phone page (ITMatrix reference, 2026-09-30); levels/regime sit in its Levels sheet
  gex: lazy(() => import('./tools/gex/gex-tools').then((m) => ({ default: m.GexPhoneMatrixView }))),
};

/** Phone stack order: the page's `phone.first` tools on top, the rest in reading order. */
function phoneOrder(spec: PageSpec, tools: PlacedTool[]): PlacedTool[] {
  const ordered = readingOrder(tools);
  const first = spec.phone?.first ?? [];
  if (!first.length) return ordered;
  const rank = (t: PlacedTool) => { const i = first.indexOf(t.type); return i < 0 ? first.length : i; };
  return ordered.map((t, n) => [t, n] as const).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([t]) => t);
}

function PhoneLead({ page }: { page: PageId }) {
  const L = PHONE_LEAD[page];
  if (!L || !PAGES[page].phone?.lead) return null;
  return (
    <ToolBoundary title={`${PAGES[page].label} summary`}>
      <Suspense fallback={<ToolSkeleton />}>
        <L />
      </Suspense>
    </ToolBoundary>
  );
}

/** A tool off-screen this long unmounts (its polling stops). */
const PAUSE_AFTER_MS = 20_000;

/* ── per-tool error boundary: one broken tool never blanks the board ── */
class ToolBoundary extends Component<{ title: string; children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error, info: ErrorInfo) { console.warn('[dashboard] tool crashed', err, info.componentStack); }
  render() {
    if (this.state.err) {
      return <QEError className="fd-m" title={`${this.props.title} hit an error`} message={`${this.state.err.message || 'It failed while drawing.'} Retry, or remove the tool and add it back.`} onRetry={() => this.setState({ err: null })} />;
    }
    return this.props.children;
  }
}

/* ── lazy mount + off-screen pause ── */
const ScrollRootCtx = createContext<Element | null>(null);

function useLiveMount(ref: RefObject<HTMLElement>, pause = true) {
  const root = useContext(ScrollRootCtx);
  const [state, setState] = useState<'idle' | 'live' | 'paused'>('idle');
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setState('live'); return; }
    let t: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(([e]) => {
      clearTimeout(t);
      if (e.isIntersecting) setState('live');
      else if (pause) t = setTimeout(() => setState((s) => (s === 'live' ? 'paused' : s)), PAUSE_AFTER_MS);
    }, { root, rootMargin: '240px 0px' });
    io.observe(el);
    return () => { io.disconnect(); clearTimeout(t); };
  }, [ref, root, pause]);
  return state;
}

/**
 * Scroll affordance for a tile (operator: "I literally have to find where to
 * scroll"). Finds the tile's ONE scroller (the largest element that actually
 * overflows), makes it keyboard-focusable (arrows / PageUp / PageDown scroll
 * it), and reports whether there is more above / below so the tile can draw a
 * fade and a "more" cue. Scrollbars themselves are always visible (CSS).
 */
function useScrollCue(ref: RefObject<HTMLElement>, enabled: boolean, onNatural?: (px: number) => void) {
  const [cue, setCue] = useState({ up: false, down: false });
  const natRef = useRef(onNatural);
  natRef.current = onNatural;
  const scRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || !enabled || typeof ResizeObserver === 'undefined') return;
    let sc: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      if (!sc) { setCue((c) => (c.up || c.down ? { up: false, down: false } : c)); return; }
      const up = sc.scrollTop > 2;
      const down = sc.scrollTop + sc.clientHeight < sc.scrollHeight - 2;
      setCue((c) => (c.up === up && c.down === down ? c : { up, down }));
      // PAGE scroll mode: the body's natural height = everything but the scroller + the scroller's content
      natRef.current?.(root.clientHeight - sc.clientHeight + sc.scrollHeight);
    };
    const pick = () => {
      let best = null as HTMLElement | null; let area = 0;
      for (const e of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
        if (e.scrollHeight <= e.clientHeight + 4) continue;
        const oy = getComputedStyle(e).overflowY;
        if (oy !== 'auto' && oy !== 'scroll') continue;
        const a = e.clientWidth * e.clientHeight;
        if (a > area) { area = a; best = e; }
      }
      // a tile grown to its content no longer overflows: keep measuring the scroller it had
      if (!best && sc && sc.isConnected && root.contains(sc)) best = sc;
      if (best !== sc) {
        sc?.removeEventListener('scroll', update);
        sc = best;
        scRef.current = sc;
        if (sc) {
          sc.addEventListener('scroll', update, { passive: true });
          sc.classList.add('fd-tile-scroller');
          if (!sc.hasAttribute('tabindex')) { sc.tabIndex = 0; if (!sc.getAttribute('aria-label') && !sc.getAttribute('role')) sc.setAttribute('aria-label', 'Scrollable tool content — arrow keys scroll'); }
        }
      }
      update();
    };
    // throttled, not debounced: a live feed mutates constantly and must still get picked
    const soon = () => { if (timer) return; timer = setTimeout(() => { timer = undefined; pick(); }, 600); };
    const ro = new ResizeObserver(soon);
    ro.observe(root);
    const mo = new MutationObserver(soon);
    mo.observe(root, { childList: true, subtree: true });
    soon();
    return () => { ro.disconnect(); mo.disconnect(); clearTimeout(timer); sc?.removeEventListener('scroll', update); };
  }, [ref, enabled]);
  const scroll = (dir: 1 | -1) => { const el = scRef.current; if (el) el.scrollBy({ top: dir * el.clientHeight * 0.8, behavior: 'smooth' }); };
  return { ...cue, scroll };
}

/**
 * Display-only re-flow for an expanded tile: every tile keeps its saved spot
 * unless something above now overlaps it, then it moves straight down —
 * nothing floats up into a gap (unlike `compact`), so the layout reads the same.
 */
function pushDown(tools: PlacedTool[]): PlacedTool[] {
  const hit = (a: PlacedTool, b: PlacedTool) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const placed: PlacedTool[] = [];
  for (const t of [...tools].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const it = { ...t };
    for (let guard = 0; guard < 500; guard++) {
      const over = placed.filter((p) => hit(it, p));
      if (!over.length) break;
      it.y = Math.max(...over.map((p) => p.y + p.h));
    }
    placed.push(it);
  }
  return placed;
}

/** PAGE scroll mode (use-workspace-mode.ts): what a tile body needs to grow to its content. */
interface PageFlow {
  /** natural body height in px, reported as content changes */
  onNatural: (px: number) => void;
  expanded: boolean;
  onExpand: () => void;
}

function ToolBody({ tool, flow }: { tool: PlacedTool; flow?: PageFlow }) {
  const def = TOOL_BY_ID.get(tool.type)!;
  const ref = useRef<HTMLDivElement>(null);
  const live = useLiveMount(ref);
  const cue = useScrollCue(ref, live === 'live', flow?.onNatural);
  const C = def.Component;
  return (
    <div ref={ref} className={cn('fd-live', cue.up && 'more-up', cue.down && 'more-down')}>
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
        <div className="fd-idle" role="status">Paused while off-screen. Resumes when you scroll back.</div>
      )}
      {/* Expand / more live in the tile's footer strip, never floating over the content (audit 2026-10-07 #14). */}
      {((flow && (cue.down || cue.up || flow.expanded)) || cue.down) && (
        <div className="fd-cue-foot">
          {flow && (cue.down || cue.up || flow.expanded) ? (
        <button type="button" className="fd-cue fd-expand" onClick={flow.onExpand} aria-expanded={flow.expanded}
          aria-label={`${flow.expanded ? 'Shrink' : 'Expand'} ${def.title}`}
          title={flow.expanded ? 'Back to the capped height' : 'Grow this tool to show everything — the page scrolls'}>
          {flow.expanded ? '↑ show less' : '↓ expand'}
        </button>
      ) : cue.down && (
        <button type="button" className="fd-cue" onClick={() => cue.scroll(1)} aria-label={`Scroll ${def.title} down`} title="More below — scroll down">
          ↓ more
        </button>
      )}
        </div>
      )}
    </div>
  );
}

/* ── one draggable tile ── */
function Tile({
  tool, rect, onRemove, onCollapse, onNudge, onResizeStart, dragging, resizing, symbol, flow, passive, onEngage,
}: {
  tool: PlacedTool;
  /** PAGE scroll mode: grow-to-content wiring (absent in Fit to screen) */
  flow?: PageFlow;
  /** PAGE scroll mode, not clicked into: wheel / touch scroll goes to the page */
  passive?: boolean;
  onEngage?: () => void;
  rect: { left: number; top: number; width: number; height: number };
  onRemove: () => void;
  /** NEXUS (toggles pages): fold the tile to its header / unfold it */
  onCollapse?: () => void;
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
    <div ref={setNodeRef} className={cn('fd-tile', (dragging || resizing) && 'lifted', passive && 'ws-passive', flow && !passive && 'ws-engaged')} style={style}
      onPointerDownCapture={onEngage} onFocusCapture={onEngage}>
      <ToolFrame
        def={def}
        symbol={symbol}
        onRemove={onRemove}
        onCollapse={onCollapse}
        collapsed={!!tool.c}
        dragHandle={
          <button type="button" className="fd-grip" aria-label={`Move ${def.title}. Arrow keys move, Shift+arrows resize.`} title="Drag to move · arrows move · Shift+arrows resize"
            {...attributes} {...listeners} onKeyDown={onKey}>
            <GripVertical size={13} />
          </button>
        }
        resizeHandle={tool.c ? undefined : <span className="fd-resize" onPointerDown={onResizeStart} aria-hidden title="Drag to resize" />}
      >
        {!tool.c && <ToolBody tool={tool} flow={flow} />}
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

/* ── scroll mode: Page (whole page scrolls) / Fit to screen (tools scroll) — use-workspace-mode.ts ── */
function ScrollModeToggle({ mode, onMode }: { mode: WorkspaceMode; onMode: (m: WorkspaceMode) => void }) {
  return (
    <div className="fd-seg" role="radiogroup" aria-label="How this workspace scrolls">
      <button type="button" role="radio" aria-checked={mode === 'page'} className={cn('fd-btn', mode === 'page' && 'on')} onClick={() => onMode('page')}
        title="Page: the whole page scrolls. Click into a tool to scroll inside it; expand grows a tool to its content.">
        Page
      </button>
      <button type="button" role="radio" aria-checked={mode === 'fit'} className={cn('fd-btn', mode === 'fit' && 'on')} onClick={() => onMode('fit')}
        title="Fit to screen: the layout fills the window and each tool scrolls inside its own box.">
        Fit to screen
      </button>
    </div>
  );
}

/* ── show / hide picker (NEXUS — PageSpec.toggles): one instance per tool, a check = on the board ── */
function ToolPicker({ spec, present, onToggle }: { spec: PageSpec; present: Set<string>; onToggle: (id: string) => void }) {
  const { open, setOpen, ref } = useMenu();
  const offered = useMemo(() => TOOLS.filter((t) => inCatalog(spec, t)), [spec]);
  const on = offered.filter((t) => present.has(t.id)).length;
  return (
    <div className="fd-menu-wrap" ref={ref}>
      <button type="button" className="fd-btn primary" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu"
        title="Show or hide NEXUS tools">
        <LayoutGrid size={13} /> Tools <span className="fd-pick-n">{on}/{offered.length}</span>
      </button>
      {open && <ToolPickerList spec={spec} offered={offered} present={present} onToggle={onToggle} />}
    </div>
  );
}

function ToolPickerList({ spec, offered, present, onToggle }: { spec: PageSpec; offered: ToolDef[]; present: Set<string>; onToggle: (id: string) => void }) {
  return (
    <div className="fd-menu fd-menu-wide fd-pick" role="menu" aria-label={`${spec.label} tools`}>
      <div className="fd-menu-head">{spec.label} TOOLS · CHECKED = ON THE BOARD</div>
      {offered.map((t) => {
        const isOn = present.has(t.id);
        return (
          <button key={t.id} type="button" role="menuitemcheckbox" aria-checked={isOn} className={cn('fd-menu-item fd-pick-item', isOn && 'on')}
            title={`${t.what}\nUnits: ${t.units}\nSource: ${t.backing}`} onClick={() => onToggle(t.id)}>
            <span className="fd-pick-box" aria-hidden>{isOn && <Check size={11} />}</span>
            <span className="fd-pick-title">{t.title}</span>
          </button>
        );
      })}
      <div className="fd-menu-note">Hide with a click (Undo offered); showing a tool again puts it in the first gap that fits. Reset layout restores the default.</div>
    </div>
  );
}

/* ── phone: every workspace control in ONE small menu (operator: no 3 rows of buttons) ── */
function WorkspaceMenu({ spec, present, onAdd, onToggle, onRestore, canRestore, onClear, canClear }: {
  spec: PageSpec; present: Set<string>; onAdd: (id: string) => void; onToggle?: (id: string) => void;
  onRestore: () => void; canRestore: boolean; onClear: () => void; canClear: boolean;
}) {
  const { open, setOpen, ref } = useMenu();
  const offered = useMemo(() => TOOLS.filter((t) => inCatalog(spec, t)), [spec]);
  const cats = useMemo(() => categoriesFor(spec.primary).filter((c) => offered.some((t) => t.category === c)), [spec.primary, offered]);
  return (
    <div className="fd-menu-wrap" ref={ref}>
      <button type="button" className="fd-btn fd-ws-menu" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu"
        aria-label={`${spec.label} workspace options — add a tool, restore default, clear`} title="Workspace options">
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="fd-menu fd-menu-wide fd-ws-sheet" role="menu">
          <div className="fd-menu-group">
            <button type="button" role="menuitem" className="fd-menu-item" disabled={!canRestore} onClick={() => { setOpen(false); onRestore(); }}><span><RotateCcw size={13} /> {spec.toggles ? 'Reset layout' : 'Restore default layout'}</span></button>
            {!spec.toggles && <button type="button" role="menuitem" className="fd-menu-item" disabled={!canClear} onClick={() => { setOpen(false); onClear(); }}><span><Eraser size={13} /> Clear all tools</span></button>}
          </div>
          {spec.toggles && onToggle && <ToolPickerList spec={spec} offered={offered} present={present} onToggle={onToggle} />}
          {!spec.toggles && cats.map((c) => (
            <div key={c} className="fd-menu-group">
              <div className="fd-menu-head">ADD · {c.toUpperCase()}</div>
              {offered.filter((t) => t.category === c).map((t) => (
                <button key={t.id} type="button" role="menuitem" className="fd-menu-item" onClick={() => { onAdd(t.id); setOpen(false); }}>
                  <span><Plus size={12} /> {t.title}</span>
                  {present.has(t.id) && <span className="fd-menu-on" aria-label="already on this dashboard"><Check size={11} /></span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── dashboard switcher ── */
function DashSwitcher({ api }: { api: ReturnType<typeof useDashboards> }) {
  const apiRef = useRef(api);
  apiRef.current = api;
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
                    <button type="button" className="fd-icon-btn" aria-label={`Delete ${d.name}`} onClick={() => {
                      const idx = api.dashboards!.findIndex((x) => x.id === d.id);
                      const copy = { ...d, tools: [...d.tools] };
                      void api.remove(d.id);
                      undoToast({ title: `Deleted dashboard "${d.name}"`, onUndo: () => apiRef.current.reinstate(copy, idx) });
                    }}><Trash2 size={11} /></button>
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
      <button type="button" className="fd-btn fd-focus" onClick={() => setOpen((o) => !o)} aria-expanded={open} title="Ticker that every ticker tool here follows">
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
    : pristine ? 'default layout'
    : api.save === 'account' ? `saved to your account${ago != null ? ` · ${ago < 60 ? `${ago}s` : `${Math.round(ago / 60)}m`} ago` : ''}`
    : api.save === 'device' || (api.save === 'default' && !api.signedIn) ? 'saved on this device only (signed out)'
    : api.save === 'default' ? 'saved to your account'
    : 'account save failed — kept on this device';
  // the "changes save automatically" hint lives in the tooltip, not on the toolbar (audit 2026-10-01 #18)
  return <span className={cn('fd-save', api.save === 'error' && 'warn')} role="status" title={pristine ? 'Default layout — your changes save automatically' : undefined}>{txt}</span>;
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

/** Simple pages: the page bar carries ONE stamp + ⓘ (source, units, feed) — the title is already in the top bar. */
function Provenance({ def, report, now }: { def: ToolDef; report: ToolReport; now: number }) {
  return <PhoneMeta def={def} report={report} now={now} />;
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
  if (spec.mode === 'page') return <PageView key={page} page={page} />;
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

/* ── PAGE mode: a normal page — sections at natural height, the PAGE scrolls ── */

/** A section taller than this clips behind "Show all" — never a nested scrollbar. */
const SECTION_CAP = 720;

/**
 * Desktop placement from the default layout: the tool keeps its columns; rows
 * are the default's distinct y-bands at NATURAL height (a tool that spanned
 * two bands, e.g. NEXUS's board, spans two rows).
 */
function pagePlacement(tools: PlacedTool[]) {
  const bands = [...new Set(tools.map((t) => t.y))].sort((a, b) => a - b);
  return new Map(tools.map((t) => {
    const r0 = bands.indexOf(t.y);
    let r1 = bands.findIndex((y) => y >= t.y + t.h);
    if (r1 < 0) r1 = bands.length;
    return [t.i, {
      ['--pg-x' as string]: t.x + 1, ['--pg-w' as string]: t.w,
      ['--pg-r' as string]: r0 + 1, ['--pg-rs' as string]: Math.max(1, r1 - r0),
      ['--pg-w2' as string]: t.w >= 6 ? 12 : 6,
    } as CSSProperties];
  }));
}

function PageSection({ tool, symbol, style, fill, onRemove, column = false }: {
  tool: PlacedTool; symbol?: string; style?: CSSProperties;
  /** desktop full-height column: the body is this section's one framed scroller */
  column?: boolean;
  /** CSS height of a box the tool fills (charts, ladders, matrix, virtualised feed); omit for natural height */
  fill?: string;
  /** workspace pages on phones: remove the tool from this dashboard */
  onRemove?: () => void;
}) {
  const def = TOOL_BY_ID.get(tool.type)!;
  const bodyRef = useRef<HTMLDivElement>(null);
  const live = useLiveMount(bodyRef, false);
  const [report, setReport] = useState<ToolReport>({});
  const now = useNow();
  const [tall, setTall] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    // Natural content height = the body's scrollHeight (it only clips, never
    // scrolls). Observe the body and whatever the tool currently renders.
    const measure = () => setTall(el.scrollHeight > SECTION_CAP + 48);
    const ro = new ResizeObserver(measure);
    const watch = () => { ro.disconnect(); ro.observe(el); for (const c of Array.from(el.children)) ro.observe(c); measure(); };
    const mo = new MutationObserver(watch);
    mo.observe(el, { childList: true });
    watch();
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [live]);
  const phone = usePhone();
  // fill 'auto' = natural height that must never clip (the phone GEX matrix sizes its own scroller)
  const natural = fill === 'auto';
  const boxed = !!fill && !natural;
  const capped = !column && !fill && tall && !open;
  const secRef = useRef<HTMLElement>(null);
  const cue = useScrollCue(secRef, column && live === 'live');
  const headId = `pg-${tool.i}`;
  return (
    <section ref={secRef} className={cn('pg-sec', column && 'pg-col', column && cue.up && 'more-up', column && cue.down && 'more-down')} data-tool={def.id} style={style} aria-labelledby={headId}>
      <header className="pg-sec-head">
        <h2 id={headId}>{phone ? phoneTitleOf(def) : def.title}</h2>
        {symbol && <span className="fd-sym">{symbol}</span>}
        {/* one stamp + ⓘ (source, units, feed) — no visible provenance line (UI redundancy pass 2026-10-01) */}
        <PhoneMeta def={def} report={report} now={now} />
        {onRemove && (
          <button type="button" className="pg-remove fd-icon-btn" onClick={onRemove} aria-label={`Remove ${def.title}`} title={`Remove ${def.title} from this dashboard`}>
            <X size={14} />
          </button>
        )}
      </header>
      <div ref={bodyRef} className={cn('pg-sec-body', capped && 'capped', boxed && 'fill')} style={capped ? { maxHeight: SECTION_CAP } : boxed ? { height: fill } : undefined}>
        {live === 'live' ? (
          <BareTool def={def} instance={tool.i} onReport={setReport} />
        ) : (
          <ToolSkeleton label="loads when scrolled into view" />
        )}
      </div>
      {column && cue.down && (
        <button type="button" className="fd-cue pg-col-cue" onClick={() => cue.scroll(1)} aria-label={`Scroll ${def.title} down`} title="More below — scroll this column">↓ more</button>
      )}
      {tall && !column && !fill && !natural && (
        <button type="button" className="pg-more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Show less' : 'Show all'}
        </button>
      )}
    </section>
  );
}

function PageView({ page }: { page: PageId }) {
  const spec = PAGES[page];
  const isMobile = useIsMobile();
  const [focus] = useFocusSymbol();
  const tools = useMemo(() => (spec.defaults[0] ? materialize(spec.defaults[0]).tools : []), [spec]);
  const present = useMemo(() => new Set(tools.map((t) => t.type)), [tools]);
  const ctx = useMemo(() => ({ page, hasTool: (t: string) => present.has(t), addTool: () => {}, editable: false }), [page, present]);
  const needsFocus = tools.some((t) => TOOL_BY_ID.get(t.type)?.needs?.includes('symbol'));
  const symbolOf = (t: PlacedTool) => (TOOL_BY_ID.get(t.type)?.needs?.includes('symbol') ? focus : undefined);
  const place = useMemo(() => pagePlacement(tools), [tools]);
  const ordered = isMobile ? phoneOrder(spec, tools) : readingOrder(tools);
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1200);
  useEffect(() => { const on = () => setWide(window.innerWidth >= 1200); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, []);
  return (
    <DashboardCtx.Provider value={ctx}>
      <div className={cn('flowdash dash-page', `dash-${page}`, spec.framed && 'framed')} data-page={page} data-view="page">
        {/* The page name is already the top bar's title; the bar only earns a row when it carries the focus ticker. */}
        {needsFocus && (
          <div className="fd-bar">
            <div className="fd-bar-title">
              <span className="fd-eyebrow">{spec.label}</span>
              <FocusBox />
            </div>
          </div>
        )}
        {!tools.length ? (
          <QEError className="fd-m" title={`${spec.label} has no default layout`} message="No tools are defined for this page." />
        ) : (
          <div className="pg-grid">
            {isMobile && <PhoneLead page={page} />}
            {ordered.map((t) => (
              <PageSection key={t.i} tool={t} symbol={symbolOf(t)} style={isMobile ? undefined : place.get(t.i)}
                column={!isMobile && wide && !!spec.columns?.includes(t.type)}
                fill={(isMobile ? spec.phone?.fill?.[t.type] : undefined) ?? (spec.fill?.includes(t.type) ? 'clamp(340px, 56vh, 640px)' : spec.natural?.includes(t.type) ? 'auto' : undefined)} />
            ))}
          </div>
        )}
      </div>
    </DashboardCtx.Provider>
  );
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
                <PhoneLead page={page} />
                {phoneOrder(spec, tools).map((t) => (
                  <div key={t.i} className="fd-tile stacked" data-tool={t.type} style={{ height: `min(${Math.max(300, t.h * ROW_H)}px, 88dvh)`, minHeight: 300 }}>
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
  const saved = api.active?.tools ?? [];
  const [focus] = useFocusSymbol();
  const { gridRef, scroller, setScroller, rowH, colW, stepX, stepY } = useGridGeometry(isMobile, `${api.active?.id}|${saved.length > 0}`);

  /* ── scroll mode (use-workspace-mode.ts): PAGE (default) or Fit to screen ──
     PAGE: the workspace page scrolls; a tile keeps its saved size as a cap and
     "↓ expand" grows it to its content (the page scrolls further); a tile only
     takes the wheel after a click / tab into it. FIT: tiles scroll inside. */
  const [wsMode, setWsMode] = useWorkspaceMode(page);
  const flowMode = wsMode === 'page' && !isMobile;
  const [natural, setNatural] = useState<Record<string, number>>({});
  const onNatural = useCallback((i: string, px: number) => setNatural((n) => (Math.abs((n[i] ?? 0) - px) < 4 ? n : { ...n, [i]: px })), []);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggleExpand = useCallback((i: string) => setExpanded((cur) => { const n = new Set(cur); if (n.has(i)) n.delete(i); else n.add(i); return n; }), []);
  const [engaged, setEngaged] = useState<string | null>(null);
  useEffect(() => {
    if (!flowMode) return;
    // a click outside every tile (or Escape) hands the wheel back to the page
    const off = (e: PointerEvent) => { if (!(e.target as Element | null)?.closest?.('.fd-tile')) setEngaged(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setEngaged(null); };
    document.addEventListener('pointerdown', off, true); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', off, true); document.removeEventListener('keydown', esc); };
  }, [flowMode]);
  useEffect(() => {
    if (!flowMode || !scroller) return;
    // PAGE mode: the wheel over a tile the viewer has not clicked into scrolls the PAGE
    // (vertical only — horizontal scrolling and pinch-zoom still reach the tool)
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const tile = (e.target as Element | null)?.closest?.('.fd-tile');
      if (!tile || !tile.classList.contains('ws-passive')) return;
      e.preventDefault();
      scroller.scrollBy({ top: e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * scroller.clientHeight : e.deltaY });
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => scroller.removeEventListener('wheel', onWheel);
  }, [flowMode, scroller]);
  /** what is drawn: in PAGE mode an expanded tile is as tall as its content (display only, never saved) */
  const tools = useMemo(() => {
    if (!flowMode || !expanded.size) return saved;
    // body natural px → whole rows, plus the tile's header + frame (~1 row)
    const grown = saved.map((t) => {
      const n = natural[t.i];
      if (t.c || !expanded.has(t.i) || !n) return t;
      return { ...t, h: Math.max(t.h, Math.ceil((n + GAP) / stepY) + 1) };
    });
    return pushDown(grown);
  }, [flowMode, saved, natural, expanded, stepY]);
  const shownOf = (id: string) => tools.find((x) => x.i === id);

  const [dragId, setDragId] = useState<string | null>(null);
  const [ghost, setGhost] = useState<PlacedTool | null>(null);
  const [resize, setResize] = useState<{ i: string; w: number; h: number } | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  /** a collapsed tile keeps its one header row */
  const minH = (t: PlacedTool) => (t.c ? COLLAPSED_H : TOOL_BY_ID.get(t.type)!.minSize.h);
  const moved = (t: PlacedTool, dx: number, dy: number) => {
    const def = TOOL_BY_ID.get(t.type)!;
    return clampTool({ ...t, x: t.x + dx, y: t.y + dy }, def.minSize.w, minH(t));
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
    // from where the tile is DRAWN (an expanded tile may sit lower than its saved y)
    const base = shownOf(id);
    api.updateActive((ts) => compact(ts.map((t) => { if (t.i !== id) return t; const m = moved({ ...t, x: base?.x ?? t.x, y: base?.y ?? t.y }, dx, dy); return { ...t, x: m.x, y: m.y }; }), id));
  };

  const nudge = useCallback((id: string, dx: number, dy: number, dw: number, dh: number) => {
    api.updateActive((ts) => compact(ts.map((t) => {
      if (t.i !== id) return t;
      const def = TOOL_BY_ID.get(t.type)!;
      if (t.c) return clampTool({ ...t, x: t.x + dx, y: t.y + dy, w: t.w + dw }, def.minSize.w, COLLAPSED_H); // collapsed: height stays one row
      return clampTool({ ...t, x: t.x + dx, y: t.y + dy, w: t.w + dw, h: t.h + dh }, def.minSize.w, def.minSize.h);
    }), id));
  }, [api]);

  /** fold a tile to its header (remembering its height) or unfold it; neighbours re-pack */
  const toggleCollapse = useCallback((id: string) => {
    api.updateActive((ts) => compact(ts.map((t) => {
      if (t.i !== id) return t;
      if (t.c) { const { c, ...rest } = t; return { ...rest, h: c }; }
      return { ...t, c: t.h, h: COLLAPSED_H };
    }), id));
  }, [api]);

  const startResize = (t: PlacedTool) => (e: RPointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    // resizing sets the saved size; an expanded tile drops back to it
    if (expanded.has(t.i)) toggleExpand(t.i);
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
  /** show / hide picker: hide = remove every instance (Undo offered), show = add one */
  const toggleTool = (id: string) => {
    if (!present.has(id)) { addTool(id); return; }
    undoable(`Hid ${TOOL_BY_ID.get(id)?.title ?? 'tool'}`, () => api.updateActive((ts) => compact(ts.filter((x) => x.type !== id))));
  };
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
  // Layout changes are instant; each destructive one offers Undo instead of a
  // confirm() (the snapshot is put back through the LATEST api, not the closure).
  const apiRef = useRef(api);
  apiRef.current = api;
  const undoable = (title: string, change: () => void) => {
    const a = apiRef.current.active;
    if (!a) return;
    const dashId = a.id;
    const snapshot = a.tools;
    const wasPristine = !!a.pristine;
    change();
    undoToast({
      title,
      onUndo: () => {
        const cur = apiRef.current;
        // an untouched shipped default goes back to pristine (not a saved "customised" copy)
        if (wasPristine && cur.active?.id === dashId && cur.isShipped(dashId)) void cur.restoreDefault();
        else cur.setTools(dashId, snapshot);
      },
    });
  };
  const remove = (i: string) => {
    const t = tools.find((x) => x.i === i);
    undoable(`Removed ${t ? TOOL_BY_ID.get(t.type)?.title ?? 'tool' : 'tool'}`, () => api.updateActive((ts) => compact(ts.filter((x) => x.i !== i))));
  };
  const restore = () => undoable(`Restored "${api.active?.name}" to the ${spec.label} default`, () => { void api.restoreDefault(); });
  const clear = () => undoable(`Cleared ${tools.length} tool${tools.length === 1 ? '' : 's'} from "${api.active?.name}"`, () => api.updateActive(() => []));

  return (
    <DashboardCtx.Provider value={ctx}>
      <div className={cn('flowdash dash-fit', `dash-${page}`, flowMode && 'ws-page')} data-page={page} data-view="dashboard" style={chrome != null ? ({ ['--dash-chrome' as string]: `${chrome}px` }) : undefined}>
        <div className="fd-bar">
          <div className="fd-bar-title">
            <span className="fd-eyebrow">{spec.label}</span>
            <DashSwitcher api={api} />
            {needsFocus && <FocusBox />}
          </div>
          {isMobile ? (
          <div className="fd-bar-actions">
            <WorkspaceMenu spec={spec} present={present} onAdd={addTool} onToggle={spec.toggles ? toggleTool : undefined}
              canRestore={!!spec.defaults.length && !api.active?.pristine}
              onRestore={restore}
              canClear={!!tools.length}
              onClear={clear} />
          </div>
          ) : (
          <div className="fd-bar-actions">
            {spec.toggles ? <ToolPicker spec={spec} present={present} onToggle={toggleTool} /> : <AddToolMenu spec={spec} onAdd={addTool} present={present} />}
            <ScrollModeToggle mode={wsMode} onMode={(m) => { setWsMode(m); setEngaged(null); setExpanded(new Set()); }} />
            {!isMobile && <button type="button" className="fd-btn" disabled={!tools.length}
              onClick={() => api.updateActive((ts) => autoArrange(ts.map(({ c, ...t }) => (c ? { ...t, h: c } : t)), (t) => TOOL_BY_ID.get(t)?.minSize.h ?? 3, (t) => TOOL_BY_ID.get(t)?.minSize.w ?? 2))}
              title="Pack tools into rows with no gaps">
              <LayoutGrid size={13} /> Auto-arrange
            </button>}
            <button type="button" className="fd-btn" disabled={!spec.defaults.length || !!api.active?.pristine}
              onClick={restore}
              title="Reset this dashboard to the default layout">
              <RotateCcw size={13} /> {spec.toggles ? 'Reset layout' : 'Restore default layout'}
            </button>
            {!spec.toggles && <button type="button" className="fd-btn" disabled={!tools.length} onClick={clear}>
              <Eraser size={13} /> Clear all tools
            </button>}
            <SaveBadge api={api} />
          </div>
          )}
        </div>

        <ScrollRootCtx.Provider value={isMobile ? null : scroller}>
          <div className="fd-scroller" ref={setScroller}>
            {!api.dashboards ? (
              <PageSkeleton fill bar={false} tiles={skeletonTiles(page)} label="loading your dashboards…" />
            ) : !tools.length ? (
              <div className="fd-empty">
                <p>This dashboard has no tools yet.</p>
                <p className="dim">Add a tool from the {spec.label} catalogue{spec.defaults.length ? ', or restore the default layout' : ''}.</p>
                <div className="fd-empty-actions">
                  {spec.starters.filter((s) => { const d = TOOL_BY_ID.get(s); return !!d && inCatalog(spec, d); }).map((s, n) => (
                    <button key={s} type="button" className={cn('fd-btn', n === 0 && 'primary')} onClick={() => addTool(s)}><Plus size={13} /> {TOOL_BY_ID.get(s)!.title}</button>
                  ))}
                  {!!spec.defaults.length && <button type="button" className="fd-btn" onClick={() => void api.restoreDefault()}><RotateCcw size={13} /> Restore default layout</button>}
                </div>
              </div>
            ) : isMobile ? (
              <div className="fd-stack" ref={gridRef}>
                <PhoneLead page={page} />
                {phoneOrder(spec, tools).filter((t) => !spec.phone?.leadReplaces?.includes(t.type)).map((t) => (
                  <PageSection key={t.i} tool={t} symbol={symbolOf(t)} fill={spec.phone?.fill?.[t.type]} onRemove={() => remove(t.i)} />
                ))}
              </div>
            ) : (
              <DndContext sensors={sensors} onDragStart={(e) => setDragId(String(e.active.id))} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={() => { setDragId(null); setGhost(null); }}>
                <div className="fd-grid" ref={gridRef} style={{ height: Math.max(1, bottom) * stepY - GAP }}>
                  {ghost && <div className="fd-ghost" style={rectOf(ghost)} aria-hidden />}
                  {tools.map((t) => (
                    <Tile key={t.i} tool={t} rect={rectOf(t)} symbol={symbolOf(t)}
                      dragging={dragId === t.i} resizing={resize?.i === t.i}
                      onRemove={() => remove(t.i)}
                      onCollapse={spec.toggles ? () => toggleCollapse(t.i) : undefined}
                      onNudge={(dx, dy, dw, dh) => nudge(t.i, dx, dy, dw, dh)}
                      onResizeStart={startResize(t)}
                      flow={flowMode ? { onNatural: (px) => onNatural(t.i, px), expanded: expanded.has(t.i), onExpand: () => toggleExpand(t.i) } : undefined}
                      passive={flowMode && engaged !== t.i}
                      onEngage={flowMode ? () => { if (engaged !== t.i) setEngaged(t.i); } : undefined} />
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
export default Dashboard;
