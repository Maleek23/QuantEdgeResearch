/**
 * Named dashboards per PAGE, persisted per user through the EXISTING layouts
 * API (/api/user/:userId/layouts — user_page_layouts, ownership-checked).
 * One row per dashboard:
 *
 *   pageId      `<page prefix><dashboard id>`   e.g. gex:default, flowdash:ab12cd34
 *   layoutName  the dashboard's name
 *   widgets     [{ id, type, x, y, width, height, visible }]
 *   columns 12 · rowHeight 40
 *
 * Shipped defaults are NOT written to the account until the user changes
 * them ("pristine"), so a better default reaches everyone who never
 * customised; "Restore default" deletes the customised row and returns the
 * dashboard to pristine. A device copy lives in localStorage too, so a
 * signed-out viewer (or an unreachable API) still gets their layout back —
 * and the bar says which of the two the dashboard is actually saved to.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { TOOL_BY_ID } from './registry';
import { COLLAPSED_H, COLS, ROW_H, clampTool, uid, type Dashboard, type PlacedTool } from './layout';
import type { DefaultLayout } from './tool-def';
import type { PageSpec } from './pages';

export type SaveState = 'loading' | 'default' | 'account' | 'saving' | 'device' | 'error';

export interface PageDashboard extends Dashboard {
  /** a shipped default the user has not changed — never written to the account */
  pristine?: boolean;
}

export function materialize(d: DefaultLayout): PageDashboard {
  return {
    id: d.id, name: d.name, pristine: true,
    tools: d.tools
      .filter(([type]) => TOOL_BY_ID.has(type))
      // deterministic instance ids: per-tool settings (useToolSetting) survive a reload of a pristine default
      .map(([type, x, y, w, h], n) => ({ i: `${d.id}-${n}-${type}`, type, x, y, w, h })),
  };
}

function sanitize(tools: any[]): PlacedTool[] {
  return (Array.isArray(tools) ? tools : [])
    .filter((w) => w && TOOL_BY_ID.has(w.type) && w.visible !== false)
    .map((w) => {
      const def = TOOL_BY_ID.get(w.type)!;
      // collapsed tile: header only; config.collapsedH (or `c`) is the height it expands back to
      const c = Number(w.config?.collapsedH ?? w.c) || 0;
      const t = clampTool({
        i: String(w.id ?? w.i ?? uid()), type: w.type,
        x: Number(w.x) || 0, y: Number(w.y) || 0,
        w: Number(w.width ?? w.w) || def.defaultSize.w, h: c > 0 ? COLLAPSED_H : Number(w.height ?? w.h) || def.defaultSize.h,
      }, def.minSize.w, c > 0 ? COLLAPSED_H : def.minSize.h);
      return c > 0 ? { ...t, c: Math.max(def.minSize.h, Math.round(c)) } : t;
    });
}

const toWidgets = (d: Dashboard) => d.tools.map((x) => ({ id: x.i, type: x.type, x: x.x, y: x.y, width: x.w, height: x.h, visible: true, ...(x.c ? { config: { collapsedH: x.c } } : {}) }));

/** Defaults first (customised or pristine), then the user's own dashboards. */
function withDefaults(spec: PageSpec, saved: PageDashboard[]): PageDashboard[] {
  if (spec.seedOnlyWhenEmpty) return saved.length ? saved : spec.defaults.map(materialize);
  const byId = new Map(saved.map((d) => [d.id, d]));
  const shipped = spec.defaults.map((d) => byId.get(d.id) ?? materialize(d));
  const own = saved.filter((d) => !spec.defaults.some((x) => x.id === d.id));
  return [...shipped, ...own];
}

export function useDashboards(spec: PageSpec) {
  const { user, isLoading: authLoading } = useAuth() as { user?: { id?: string } | null; isLoading: boolean };
  const userId = user?.id ? String(user.id) : null;
  const [dashboards, setDashboards] = useState<PageDashboard[] | null>(null);
  const [activeId, setActiveIdState] = useState<string | null>(() => { try { return localStorage.getItem(spec.lsActive); } catch { return null; } });
  const [save, setSave] = useState<SaveState>('loading');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const url = (id?: string) => `/api/user/${encodeURIComponent(userId ?? '')}/layouts${id ? `/${encodeURIComponent(spec.storagePrefix + id)}` : ''}`;

  const readLocal = useCallback((): PageDashboard[] | null => {
    try {
      const raw = localStorage.getItem(spec.lsKey);
      if (!raw) return null;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr) || !arr.length) return null;
      return arr.map((d: any): PageDashboard => {
        const shipped = spec.defaults.find((x) => x.id === String(d.id));
        // pristine copies re-materialise from the CURRENT default
        if (d.pristine && shipped) return materialize(shipped);
        return { id: String(d.id), name: String(d.name || 'Dashboard'), tools: sanitize(d.tools) };
      });
    } catch { return null; }
  }, [spec]);
  const writeLocal = useCallback((ds: PageDashboard[]) => {
    try { localStorage.setItem(spec.lsKey, JSON.stringify(ds)); } catch { /* private mode: account copy still saves */ }
  }, [spec.lsKey]);

  const putRemote = useCallback(async (d: Dashboard) => {
    if (!userId) return;
    setSave('saving');
    try {
      await apiRequest('PUT', url(d.id), { layoutName: d.name, widgets: toWidgets(d), columns: COLS, rowHeight: ROW_H });
      setSave('account'); setSavedAt(Date.now());
    } catch {
      setSave('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, spec.storagePrefix]);

  // ── load ──
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    setDashboards(null); setSave('loading');
    (async () => {
      const local = readLocal();
      if (!userId) {
        const ds = withDefaults(spec, local ?? []);
        if (!cancelled) { setDashboards(ds); setSave(ds.every((d) => d.pristine) ? 'default' : 'device'); }
        return;
      }
      try {
        const r = await fetch(url(), { credentials: 'include' });
        if (!r.ok) throw new Error(String(r.status));
        const rows: any[] = await r.json();
        const mine = rows
          .filter((l) => typeof l.pageId === 'string' && l.pageId.startsWith(spec.storagePrefix))
          .sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')))
          .map((l): PageDashboard => ({ id: l.pageId.slice(spec.storagePrefix.length), name: l.layoutName || 'Dashboard', tools: sanitize(l.widgets) }));
        if (cancelled) return;
        if (!mine.length && local?.some((d) => !d.pristine)) {
          // Customised on this device before signing in: adopt it and save it.
          const seed = withDefaults(spec, local);
          setDashboards(seed); writeLocal(seed);
          for (const d of seed) if (!d.pristine) await putRemote(d);
          return;
        }
        const ds = withDefaults(spec, mine);
        setDashboards(ds); writeLocal(ds);
        setSave(mine.length ? 'account' : 'default'); if (mine.length) setSavedAt(Date.now());
      } catch {
        if (!cancelled) { setDashboards(withDefaults(spec, local ?? [])); setSave('error'); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, userId, spec.id]);

  const active = dashboards?.find((d) => d.id === activeId) ?? dashboards?.[0] ?? null;

  const setActiveId = useCallback((id: string) => {
    setActiveIdState(id);
    try { localStorage.setItem(spec.lsActive, id); } catch { /* ignore */ }
  }, [spec.lsActive]);

  const schedule = useCallback((d: Dashboard) => {
    const m = timers.current;
    clearTimeout(m.get(d.id));
    m.set(d.id, setTimeout(() => { m.delete(d.id); void putRemote(d); }, 800));
  }, [putRemote]);

  const commit = useCallback((next: PageDashboard[], changed?: PageDashboard) => {
    setDashboards(next);
    writeLocal(next);
    if (changed && userId) schedule(changed);
    else if (!userId) { setSave('device'); setSavedAt(Date.now()); }
  }, [userId, schedule, writeLocal]);

  const updateActive = useCallback((fn: (tools: PlacedTool[]) => PlacedTool[]) => {
    if (!dashboards || !active) return;
    const changed: PageDashboard = { ...active, pristine: false, tools: fn(active.tools) };
    commit(dashboards.map((d) => (d.id === active.id ? changed : d)), changed);
  }, [dashboards, active, commit]);

  /** Replace one dashboard's tools (Undo of remove-tile / Clear / Restore default). */
  const setTools = useCallback((id: string, tools: PlacedTool[]) => {
    if (!dashboards) return;
    const cur = dashboards.find((d) => d.id === id);
    if (!cur) return;
    const changed: PageDashboard = { ...cur, pristine: false, tools };
    commit(dashboards.map((d) => (d.id === id ? changed : d)), changed);
  }, [dashboards, commit]);

  /** Put a deleted dashboard back (Undo of delete) and re-save it. */
  const reinstate = useCallback((d: PageDashboard, index?: number) => {
    if (!dashboards || dashboards.some((x) => x.id === d.id)) return;
    const back: PageDashboard = { ...d, pristine: false };
    const next = [...dashboards];
    next.splice(Math.max(0, Math.min(next.length, index ?? next.length)), 0, back);
    commit(next, back);
    setActiveId(back.id);
  }, [dashboards, commit, setActiveId]);

  const rename = useCallback((id: string, name: string) => {
    if (!dashboards) return;
    const clean = name.trim().slice(0, 40) || 'Dashboard';
    const next = dashboards.map((d) => (d.id === id ? { ...d, name: clean, pristine: false } : d));
    commit(next, next.find((d) => d.id === id));
  }, [dashboards, commit]);

  const create = useCallback(() => {
    if (!dashboards) return;
    const d: PageDashboard = { id: uid(), name: `Dashboard ${dashboards.length + 1}`, tools: [] };
    commit([...dashboards, d], d);
    setActiveId(d.id);
  }, [dashboards, commit, setActiveId]);

  const isShipped = useCallback((id: string) => !spec.seedOnlyWhenEmpty && spec.defaults.some((d) => d.id === id), [spec]);

  const remove = useCallback(async (id: string) => {
    if (!dashboards || dashboards.length <= 1 || isShipped(id)) return;
    const next = dashboards.filter((d) => d.id !== id);
    clearTimeout(timers.current.get(id));
    commit(next);
    if (activeId === id) setActiveId(next[0].id);
    if (userId) {
      try { await apiRequest('DELETE', url(id)); }
      catch { setSave('error'); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboards, activeId, userId, commit, setActiveId, isShipped]);

  /**
   * Restore default. A shipped dashboard returns to pristine (its saved row is
   * deleted, so future default improvements reach it); a user-created one is
   * refilled with the page's first default layout and saved.
   */
  const restoreDefault = useCallback(async () => {
    if (!dashboards || !active || !spec.defaults.length) return;
    const shipped = spec.defaults.find((d) => d.id === active.id);
    if (shipped && !spec.seedOnlyWhenEmpty) {
      const fresh = materialize(shipped);
      const next = dashboards.map((d) => (d.id === active.id ? fresh : d));
      clearTimeout(timers.current.get(active.id));
      setDashboards(next); writeLocal(next);
      if (userId) {
        try { await apiRequest('DELETE', url(active.id)); setSave('default'); }
        catch { setSave('error'); }
      } else setSave('default');
      return;
    }
    const src = materialize(shipped ?? spec.defaults[0]);
    const changed: PageDashboard = { ...active, pristine: false, tools: src.tools };
    commit(dashboards.map((d) => (d.id === active.id ? changed : d)), changed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboards, active, spec, userId, commit, writeLocal]);

  return { dashboards, active, setActiveId, updateActive, setTools, reinstate, rename, create, remove, restoreDefault, isShipped, save, savedAt, signedIn: !!userId };
}
