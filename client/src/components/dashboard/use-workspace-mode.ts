/**
 * WORKSPACE SCROLL MODE — how a workspace (GEX, FLOW, NEXUS) scrolls.
 *
 *   page  (default) the WHOLE PAGE scrolls. Tools grow to their content up to
 *         a cap (an "Expand" control lifts it); a tool only takes the wheel /
 *         touch scroll after the viewer clicks or tabs into it, and hands it
 *         back to the page at its top / bottom (no scroll traps).
 *   fit   "Fit to screen": the layout fills the viewport and each tool
 *         scrolls inside its own box (the pre-2026-10 behaviour), still with
 *         scroll chaining to the page at a tool's edges.
 *
 * Operator 2026-10-01: "scrolling over a tool card scrolls INSIDE the card
 * instead of the page". Saved per user — one `user_page_layouts` row per page,
 * pageId `wsprefs:<page>`, layoutName = the mode (a prefix no dashboard
 * namespace uses, so use-dashboards never reads it as a dashboard) — with a
 * device copy in localStorage for signed-out viewers and first paint.
 */
import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';

export type WorkspaceMode = 'page' | 'fit';
export const DEFAULT_WORKSPACE_MODE: WorkspaceMode = 'page';
/** GEX fits the screen by default (operator 2026-10-01: "gex needs to fit to screen"); other workspaces scroll as a page. */
export const defaultModeFor = (page: string): WorkspaceMode => (page === 'gex' ? 'fit' : DEFAULT_WORKSPACE_MODE);
const isMode = (v: unknown): v is WorkspaceMode => v === 'page' || v === 'fit';
const lsKey = (page: string) => `qe-ws-mode:${page}`;

export function useWorkspaceMode(page: string): [WorkspaceMode, (m: WorkspaceMode) => void] {
  const { user } = useAuth() as { user?: { id?: string } | null };
  const userId = user?.id ? String(user.id) : null;
  const [mode, setModeState] = useState<WorkspaceMode>(() => {
    try { const v = localStorage.getItem(lsKey(page)); return isMode(v) ? v : defaultModeFor(page); } catch { return defaultModeFor(page); }
  });
  const url = userId ? `/api/user/${encodeURIComponent(userId)}/layouts/${encodeURIComponent(`wsprefs:${page}`)}` : null;

  // the account copy wins once it loads (404 = never chosen → keep the device / default)
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    fetch(url, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((row) => {
        if (cancelled || !row || !isMode(row.layoutName)) return;
        setModeState(row.layoutName);
        try { localStorage.setItem(lsKey(page), row.layoutName); } catch { /* ignore */ }
      })
      .catch(() => { /* device copy stands */ });
    return () => { cancelled = true; };
  }, [url, page]);

  const setMode = useCallback((m: WorkspaceMode) => {
    setModeState(m);
    try { localStorage.setItem(lsKey(page), m); } catch { /* ignore */ }
    if (url) void apiRequest('PUT', url, { layoutName: m, widgets: [] }).catch(() => { /* kept on this device */ });
  }, [url, page]);

  return [mode, setMode];
}
