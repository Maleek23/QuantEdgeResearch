/**
 * Named dashboards, persisted per user through the EXISTING layouts API
 * (/api/user/:userId/layouts — user_page_layouts). One row per dashboard:
 *
 *   pageId      `flowdash:<id>`
 *   layoutName  the dashboard's name
 *   widgets     [{ id, type, x, y, width, height, visible, config }]
 *   columns 12 · rowHeight 40
 *
 * A device copy lives in localStorage too, so a signed-out viewer (or an
 * unreachable API) still gets their layout back — and the header says which
 * of the two the dashboard is actually saved to.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { TOOL_BY_TYPE, type ToolType } from './registry';
import { COLS, ROW_H, clampTool, uid, type Dashboard, type PlacedTool } from './layout';

const PREFIX = 'flowdash:';
const LS_KEY = 'qe-flowdash-v1';
const LS_ACTIVE = 'qe-flowdash-active';

export type SaveState = 'loading' | 'account' | 'saving' | 'device' | 'error';

const t = (type: ToolType, x: number, y: number, w: number, h: number): PlacedTool => ({ i: uid(), type, x, y, w, h });

export function defaultDashboards(): Dashboard[] {
  return [{
    id: uid(), name: 'Dashboard 1',
    tools: [
      t('options-flow', 0, 0, 8, 16),
      t('stock-chart', 8, 0, 4, 16),
      t('top-tickers', 0, 16, 4, 8),
      t('market-tide', 4, 16, 4, 8),
      t('net-flow-strike', 8, 16, 4, 8),
    ],
  }];
}

function sanitize(tools: any[]): PlacedTool[] {
  return (Array.isArray(tools) ? tools : [])
    .filter((w) => w && TOOL_BY_TYPE.has(w.type) && w.visible !== false)
    .map((w) => {
      const def = TOOL_BY_TYPE.get(w.type)!;
      return clampTool({ i: String(w.id ?? w.i ?? uid()), type: w.type, x: Number(w.x) || 0, y: Number(w.y) || 0, w: Number(w.width ?? w.w) || def.w, h: Number(w.height ?? w.h) || def.h }, def.minW, def.minH);
    });
}

function readLocal(): Dashboard[] | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || !arr.length) return null;
    return arr.map((d: any) => ({ id: String(d.id), name: String(d.name || 'Dashboard'), tools: sanitize(d.tools) }));
  } catch { return null; }
}
function writeLocal(ds: Dashboard[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(ds)); } catch { /* private mode: account copy still saves */ }
}

const toWidgets = (d: Dashboard) => d.tools.map((x) => ({ id: x.i, type: x.type, x: x.x, y: x.y, width: x.w, height: x.h, visible: true }));

export function useDashboards() {
  const { user, isLoading: authLoading } = useAuth() as { user?: { id?: string } | null; isLoading: boolean };
  const userId = user?.id ? String(user.id) : null;
  const [dashboards, setDashboards] = useState<Dashboard[] | null>(null);
  const [activeId, setActiveIdState] = useState<string | null>(() => { try { return localStorage.getItem(LS_ACTIVE); } catch { return null; } });
  const [save, setSave] = useState<SaveState>('loading');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const putRemote = useCallback(async (d: Dashboard) => {
    if (!userId) return;
    setSave('saving');
    try {
      await apiRequest('PUT', `/api/user/${encodeURIComponent(userId)}/layouts/${encodeURIComponent(PREFIX + d.id)}`, {
        layoutName: d.name, widgets: toWidgets(d), columns: COLS, rowHeight: ROW_H,
      });
      setSave('account'); setSavedAt(Date.now());
    } catch {
      setSave('error');
    }
  }, [userId]);

  // ── load ──
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      const local = readLocal();
      if (!userId) {
        if (!cancelled) { setDashboards(local ?? defaultDashboards()); setSave('device'); }
        return;
      }
      try {
        const r = await fetch(`/api/user/${encodeURIComponent(userId)}/layouts`, { credentials: 'include' });
        if (!r.ok) throw new Error(String(r.status));
        const rows: any[] = await r.json();
        const mine = rows
          .filter((l) => typeof l.pageId === 'string' && l.pageId.startsWith(PREFIX))
          .sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')))
          .map((l): Dashboard => ({ id: l.pageId.slice(PREFIX.length), name: l.layoutName || 'Dashboard', tools: sanitize(l.widgets) }));
        if (cancelled) return;
        if (mine.length) {
          setDashboards(mine); writeLocal(mine); setSave('account'); setSavedAt(Date.now());
        } else {
          // First visit on this account: adopt the device copy (or defaults) and save it.
          const seed = local ?? defaultDashboards();
          setDashboards(seed);
          for (const d of seed) await putRemote(d);
        }
      } catch {
        if (!cancelled) { setDashboards(local ?? defaultDashboards()); setSave('error'); }
      }
    })();
    return () => { cancelled = true; };
  }, [authLoading, userId, putRemote]);

  const active = dashboards?.find((d) => d.id === activeId) ?? dashboards?.[0] ?? null;

  const setActiveId = useCallback((id: string) => {
    setActiveIdState(id);
    try { localStorage.setItem(LS_ACTIVE, id); } catch { /* ignore */ }
  }, []);

  const schedule = useCallback((d: Dashboard) => {
    const m = timers.current;
    clearTimeout(m.get(d.id));
    m.set(d.id, setTimeout(() => { m.delete(d.id); void putRemote(d); }, 800));
  }, [putRemote]);

  const commit = useCallback((next: Dashboard[], changed?: Dashboard) => {
    setDashboards(next);
    writeLocal(next);
    if (changed && userId) schedule(changed);
    else if (!userId) { setSave('device'); setSavedAt(Date.now()); }
  }, [userId, schedule]);

  const updateActive = useCallback((fn: (tools: PlacedTool[]) => PlacedTool[]) => {
    if (!dashboards || !active) return;
    const changed = { ...active, tools: fn(active.tools) };
    commit(dashboards.map((d) => (d.id === active.id ? changed : d)), changed);
  }, [dashboards, active, commit]);

  const rename = useCallback((id: string, name: string) => {
    if (!dashboards) return;
    const clean = name.trim().slice(0, 40) || 'Dashboard';
    const next = dashboards.map((d) => (d.id === id ? { ...d, name: clean } : d));
    commit(next, next.find((d) => d.id === id));
  }, [dashboards, commit]);

  const create = useCallback(() => {
    if (!dashboards) return;
    const d: Dashboard = { id: uid(), name: `Dashboard ${dashboards.length + 1}`, tools: [] };
    commit([...dashboards, d], d);
    setActiveId(d.id);
  }, [dashboards, commit, setActiveId]);

  const remove = useCallback(async (id: string) => {
    if (!dashboards || dashboards.length <= 1) return;
    const next = dashboards.filter((d) => d.id !== id);
    clearTimeout(timers.current.get(id));
    commit(next);
    if (activeId === id) setActiveId(next[0].id);
    if (userId) {
      try { await apiRequest('DELETE', `/api/user/${encodeURIComponent(userId)}/layouts/${encodeURIComponent(PREFIX + id)}`); }
      catch { setSave('error'); }
    }
  }, [dashboards, activeId, userId, commit, setActiveId]);

  return { dashboards, active, setActiveId, updateActive, rename, create, remove, save, savedAt, signedIn: !!userId };
}
