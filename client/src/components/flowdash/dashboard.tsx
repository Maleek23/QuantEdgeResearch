/**
 * FLOW DASHBOARD — the FLOW tab's main view. A Bullflow-style tool board:
 * named dashboards, an "Add tool" catalogue grouped OPTIONS / MARKET / GEX /
 * DARK POOL, drag (dnd-kit, already a dependency) and corner-resize on a
 * 12-column grid, Auto-arrange and Clear. Layouts persist per user through
 * the existing layouts API (use-dashboards.ts).
 *
 * Phone (< 768px): tools stack in one column in reading order; drag/resize
 * are desktop-only, the layout itself is unchanged.
 */
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode, type CSSProperties, type PointerEvent as RPointerEvent, type KeyboardEvent as RKeyboardEvent } from 'react';
import { DndContext, PointerSensor, useDraggable, useSensor, useSensors, type DragEndEvent, type DragMoveEvent } from '@dnd-kit/core';
import { ChevronDown, GripVertical, LayoutGrid, Plus, Trash2, Pencil, Eraser, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { QEError, QELoading } from '@/components/ui/qe-states';
import '@/styles/nexus.css';
import './flowdash.css';
import { TOOLS, TOOL_BY_TYPE, GROUP_ORDER, type ToolType } from './registry';
import { COLS, ROW_H, GAP, autoArrange, clampTool, compact, slotFor, uid, type PlacedTool } from './layout';
import { DashboardCtx, ToolFrame, useNow } from './frame';
import { useDashboards } from './use-dashboards';

/* ── per-tool error boundary: one broken tool never blanks the board ── */
class ToolBoundary extends Component<{ title: string; children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error, info: ErrorInfo) { console.warn('[flowdash] tool crashed', err, info.componentStack); }
  render() {
    if (this.state.err) {
      return <QEError className="fd-m" title={`${this.props.title} crashed while rendering`} message={this.state.err.message} onRetry={() => this.setState({ err: null })} />;
    }
    return this.props.children;
  }
}

function ToolBody({ type }: { type: ToolType }) {
  const def = TOOL_BY_TYPE.get(type)!;
  const C = def.Component;
  return (
    <ToolBoundary title={def.title}>
      <Suspense fallback={<QELoading rows={3} className="fd-pad" label={`loading ${def.title}…`} />}>
        <C />
      </Suspense>
    </ToolBoundary>
  );
}

/* ── one draggable tile ── */
function Tile({
  tool, rect, onRemove, onNudge, onResizeStart, dragging, resizing,
}: {
  tool: PlacedTool;
  rect: { left: number; top: number; width: number; height: number };
  onRemove: () => void;
  onNudge: (dx: number, dy: number, dw: number, dh: number) => void;
  onResizeStart: (e: RPointerEvent) => void;
  dragging: boolean;
  resizing: boolean;
}) {
  const def = TOOL_BY_TYPE.get(tool.type)!;
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
        onRemove={onRemove}
        dragHandle={
          <button type="button" className="fd-grip" aria-label={`Move ${def.title}. Arrow keys move, Shift+arrows resize.`} title="Drag to move · arrows move · Shift+arrows resize"
            {...attributes} {...listeners} onKeyDown={onKey}>
            <GripVertical size={13} />
          </button>
        }
        resizeHandle={<span className="fd-resize" onPointerDown={onResizeStart} aria-hidden title="Drag to resize" />}
      >
        <ToolBody type={tool.type} />
      </ToolFrame>
    </div>
  );
}

/* ── add-tool menu ── */
function AddToolMenu({ onAdd, present }: { onAdd: (t: ToolType) => void; present: Set<ToolType> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="fd-menu-wrap" ref={ref}>
      <button type="button" className="fd-btn primary" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        <Plus size={13} /> Add tool
      </button>
      {open && (
        <div className="fd-menu" role="menu">
          {GROUP_ORDER.map((g) => (
            <div key={g} className="fd-menu-group">
              <div className="fd-menu-head">{g}</div>
              {TOOLS.filter((t) => t.group === g).map((t) => (
                <button key={t.type} type="button" role="menuitem" className="fd-menu-item" title={`${t.blurb}\nSource: ${t.backing}`}
                  onClick={() => { onAdd(t.type); setOpen(false); }}>
                  <span>{t.title}</span>
                  {present.has(t.type) && <span className="fd-menu-on" aria-label="already on this dashboard"><Check size={11} /></span>}
                </button>
              ))}
            </div>
          ))}
          <div className="fd-menu-note">Not offered (no data source yet): Option Chart · Dark Pool Alerts · Trade Terminal.</div>
        </div>
      )}
    </div>
  );
}

/* ── dashboard switcher ── */
function DashSwitcher({ api }: { api: ReturnType<typeof useDashboards> }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) { setOpen(false); setEditing(null); } };
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, [open]);
  if (!api.dashboards || !api.active) return null;
  return (
    <div className="fd-menu-wrap" ref={ref}>
      <button type="button" className="fd-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
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
                  <button type="button" className="fd-dash-name" onClick={() => { api.setActiveId(d.id); setOpen(false); }}>{d.name} <span className="dim">· {d.tools.length} tools</span></button>
                  <button type="button" className="fd-icon-btn" aria-label={`Rename ${d.name}`} onClick={() => { setEditing(d.id); setDraft(d.name); }}><Pencil size={11} /></button>
                  {api.dashboards!.length > 1 && (
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

function SaveBadge({ api }: { api: ReturnType<typeof useDashboards> }) {
  const now = useNow(10_000);
  const ago = api.savedAt ? Math.max(0, Math.round((now - api.savedAt) / 1000)) : null;
  const txt = api.save === 'loading' ? 'loading layouts…'
    : api.save === 'saving' ? 'saving…'
    : api.save === 'account' ? `saved to your account${ago != null ? ` · ${ago < 60 ? `${ago}s` : `${Math.round(ago / 60)}m`} ago` : ''}`
    : api.save === 'device' ? 'saved on this device only (signed out)'
    : 'account save failed — kept on this device';
  return <span className={cn('fd-save', api.save === 'error' && 'warn')} role="status">{txt}</span>;
}

/* ══════════════════════════════ main ══════════════════════════════ */

export function FlowDashboard() {
  const api = useDashboards();
  const isMobile = useIsMobile();
  const tools = api.active?.tools ?? [];

  const gridRef = useRef<HTMLDivElement>(null);
  const [gridW, setGridW] = useState(1200);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setGridW(el.clientWidth));
    ro.observe(el); setGridW(el.clientWidth);
    return () => ro.disconnect();
  }, [isMobile, api.active?.id]);
  const colW = (gridW - GAP * (COLS - 1)) / COLS;
  const stepX = colW + GAP, stepY = ROW_H + GAP;

  const [dragId, setDragId] = useState<string | null>(null);
  const [ghost, setGhost] = useState<PlacedTool | null>(null);
  const [resize, setResize] = useState<{ i: string; w: number; h: number } | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const moved = (t: PlacedTool, dx: number, dy: number) => {
    const def = TOOL_BY_TYPE.get(t.type)!;
    return clampTool({ ...t, x: t.x + dx, y: t.y + dy }, def.minW, def.minH);
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
      const def = TOOL_BY_TYPE.get(t.type)!;
      return clampTool({ ...t, x: t.x + dx, y: t.y + dy, w: t.w + dw, h: t.h + dh }, def.minW, def.minH);
    }), id));
  }, [api]);

  const startResize = (t: PlacedTool) => (e: RPointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const def = TOOL_BY_TYPE.get(t.type)!;
    const sx = e.clientX, sy = e.clientY;
    let cur = { w: t.w, h: t.h };
    setResize({ i: t.i, ...cur });
    const move = (ev: PointerEvent) => {
      const w = Math.max(def.minW, Math.min(COLS - t.x, t.w + Math.round((ev.clientX - sx) / stepX)));
      const h = Math.max(def.minH, t.h + Math.round((ev.clientY - sy) / stepY));
      if (w !== cur.w || h !== cur.h) { cur = { w, h }; setResize({ i: t.i, w, h }); }
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      setResize(null);
      if (cur.w !== t.w || cur.h !== t.h) api.updateActive((ts) => compact(ts.map((x) => (x.i === t.i ? { ...x, ...cur } : x)), t.i));
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const addTool = useCallback((type: ToolType) => {
    const def = TOOL_BY_TYPE.get(type)!;
    api.updateActive((ts) => {
      const at = slotFor(ts, def.w, def.h);
      return [...ts, { i: uid(), type, x: at.x, y: at.y, w: Math.min(def.w, COLS), h: def.h }];
    });
  }, [api]);
  const present = useMemo(() => new Set(tools.map((t) => t.type)), [tools]);
  const ctx = useMemo(() => ({ hasTool: (t: ToolType) => present.has(t), addTool }), [present, addTool]);

  const rectOf = (t: PlacedTool) => {
    const w = resize?.i === t.i ? resize.w : t.w;
    const h = resize?.i === t.i ? resize.h : t.h;
    return { left: t.x * stepX, top: t.y * stepY, width: w * colW + (w - 1) * GAP, height: h * ROW_H + (h - 1) * GAP };
  };
  const bottom = Math.max(
    tools.reduce((m, t) => Math.max(m, t.y + (resize?.i === t.i ? resize.h : t.h)), 0),
    ghost ? ghost.y + ghost.h : 0,
  );

  return (
    <DashboardCtx.Provider value={ctx}>
      <div className="flowdash">
        <div className="fd-bar">
          <div className="fd-bar-title">
            <span className="fd-eyebrow">FLOW</span>
            <DashSwitcher api={api} />
          </div>
          <div className="fd-bar-actions">
            <AddToolMenu onAdd={addTool} present={present} />
            <button type="button" className="fd-btn" disabled={!tools.length || isMobile} onClick={() => api.updateActive((ts) => autoArrange(ts))} title="Pack tools into the fewest rows, reading order kept">
              <LayoutGrid size={13} /> Auto-arrange
            </button>
            <button type="button" className="fd-btn" disabled={!tools.length} onClick={() => { if (window.confirm(`Remove all ${tools.length} tools from "${api.active?.name}"?`)) api.updateActive(() => []); }}>
              <Eraser size={13} /> Clear
            </button>
            <SaveBadge api={api} />
          </div>
        </div>

        {!api.dashboards ? (
          <QELoading rows={4} className="fd-pad" label="loading your dashboards…" />
        ) : !tools.length ? (
          <div className="fd-empty">
            <p>This dashboard has no tools.</p>
            <p className="dim">Add one from the catalogue — Options Flow is the tape, Stock Chart follows whatever row you click.</p>
            <div className="fd-empty-actions">
              <button type="button" className="fd-btn primary" onClick={() => addTool('options-flow')}><Plus size={13} /> Options Flow</button>
              <button type="button" className="fd-btn" onClick={() => addTool('stock-chart')}><Plus size={13} /> Stock Chart</button>
            </div>
          </div>
        ) : isMobile ? (
          <div className="fd-stack" ref={gridRef}>
            {[...tools].sort((a, b) => a.y - b.y || a.x - b.x).map((t) => {
              const def = TOOL_BY_TYPE.get(t.type)!;
              return (
                <div key={t.i} className="fd-tile stacked" style={{ height: `min(${Math.max(300, t.h * ROW_H)}px, 88dvh)`, minHeight: 300 }}>
                  <ToolFrame def={def} compact={false} onRemove={() => api.updateActive((ts) => ts.filter((x) => x.i !== t.i))}>
                    <ToolBody type={t.type} />
                  </ToolFrame>
                </div>
              );
            })}
          </div>
        ) : (
          <DndContext sensors={sensors} onDragStart={(e) => setDragId(String(e.active.id))} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={() => { setDragId(null); setGhost(null); }}>
            <div className="fd-grid" ref={gridRef} style={{ height: Math.max(1, bottom) * stepY }}>
              {ghost && <div className="fd-ghost" style={rectOf(ghost)} aria-hidden />}
              {tools.map((t) => (
                <Tile key={t.i} tool={t} rect={rectOf(t)}
                  dragging={dragId === t.i} resizing={resize?.i === t.i}
                  onRemove={() => api.updateActive((ts) => compact(ts.filter((x) => x.i !== t.i)))}
                  onNudge={(dx, dy, dw, dh) => nudge(t.i, dx, dy, dw, dh)}
                  onResizeStart={startResize(t)} />
              ))}
            </div>
          </DndContext>
        )}
      </div>
    </DashboardCtx.Provider>
  );
}

export default FlowDashboard;
