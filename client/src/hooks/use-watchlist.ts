/**
 * THE watchlist — one source of truth for every ★ in the app.
 *
 *   const wl = useWatchlist();
 *   wl.isWatched('NVDA')   // from the ['/api/watchlist'] cache (shared with every reader)
 *   toggleWatch('NVDA')    // optimistic: the star flips now; Undo toast; rollback + reason on error
 *
 * Add      runOptimistic — a temp row goes into the cache at once, the POST
 *          replaces it with the real row, a failure removes it again and says why.
 * Remove   deferCommit — the row is hidden at once and the DELETE is sent when
 *          the 6 s Undo window closes (or the page is hidden), so Undo restores
 *          the SAME row (id, thesis, premium history intact).
 * Reorder  optimistic cache order + PUT /api/watchlist/order, rolled back on error.
 *
 * "Watched" means a non-weekly row owned by the signed-in user (the weekly
 * focus list is a separate, curated category; the operator's GET returns every
 * user's rows, so rows are filtered to the viewer's own).
 */
import { useMemo, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { deferCommit, moveItem, orderBy, runOptimistic, type DeferredCommit } from '@/lib/optimistic';
import { failToast, undoToast } from '@/lib/undo-toast';
import { useAuth } from '@/hooks/useAuth';

export interface WatchRow {
  id: string;
  symbol: string;
  userId?: string | null;
  category?: string | null;
  addedAt?: string;
  assetType?: string;
  [k: string]: unknown;
}

export const WATCHLIST_KEY = ['/api/watchlist'] as const;

/* ── tiny external store: rows hidden by a pending delete, symbols mid-flight ── */
const hidden = new Set<string>();
const busy = new Set<string>();
let version = 0;
const subs = new Set<() => void>();
const bump = () => { version++; subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const snap = () => version;

const up = (s: string) => s.trim().toUpperCase();
const isListRow = (r: WatchRow) => (r.category ?? 'active') !== 'weekly';
function myId(): string | null {
  const u = queryClient.getQueryData<{ id?: string | number } | null>(['/api/auth/me']);
  return u?.id != null ? String(u.id) : null;
}
const ownedBy = (me: string | null) => (r: WatchRow) => !me || !r.userId || String(r.userId) === me;
const cache = () => queryClient.getQueryData<WatchRow[]>(WATCHLIST_KEY) ?? [];
const setCache = (fn: (rows: WatchRow[]) => WatchRow[]) =>
  queryClient.setQueryData<WatchRow[]>(WATCHLIST_KEY, (cur) => fn(Array.isArray(cur) ? cur : []));

/** The viewer's own list rows for `sym` currently in the cache. */
function rowsFor(sym: string): WatchRow[] {
  const me = myId();
  return cache().filter((r) => up(r.symbol) === sym && isListRow(r) && ownedBy(me)(r) && !hidden.has(r.id));
}

export function useWatchlist() {
  useSyncExternalStore(subscribe, snap);
  const { user } = useAuth() as { user?: { id?: string | number } | null };
  const q = useQuery<WatchRow[]>({ queryKey: WATCHLIST_KEY, staleTime: 60_000, retry: 1 });
  const uid = user?.id != null ? String(user.id) : null;
  const mine = useMemo(
    () => (Array.isArray(q.data) ? q.data : []).filter((r) => isListRow(r) && ownedBy(uid)(r) && !hidden.has(r.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q.data, uid, version],
  );
  const symbols = useMemo(() => new Set(mine.map((r) => up(r.symbol))), [mine]);
  return {
    query: q,
    rows: mine,
    signedIn: !!uid,
    isWatched: (sym: string) => symbols.has(up(sym)),
    isBusy: (sym: string) => busy.has(up(sym)),
  };
}

/** Star / unstar. Resolves when the add committed or the remove was scheduled. */
export function toggleWatch(rawSym: string) {
  const sym = up(rawSym);
  if (!sym || busy.has(sym)) return;
  return rowsFor(sym).length ? removeWatch(sym) : addWatch(sym);
}

export async function addWatch(rawSym: string, opts: { quiet?: boolean } = {}) {
  const sym = up(rawSym);
  if (!myId()) { failToast(`Sign in to add ${sym} to your watchlist`); return; }
  const tmpId = `tmp-${sym}-${Date.now().toString(36)}`;
  busy.add(sym); bump();
  const r = await runOptimistic<WatchRow>({
    apply: () => {
      void queryClient.cancelQueries({ queryKey: WATCHLIST_KEY });
      setCache((rows) => [{ id: tmpId, symbol: sym, userId: myId(), category: 'active', assetType: 'stock', addedAt: new Date().toISOString() }, ...rows]);
      return () => setCache((rows) => rows.filter((x) => x.id !== tmpId));
    },
    commit: async () => (await apiRequest('POST', '/api/watchlist', { symbol: sym, assetType: 'stock' })).json(),
    onSuccess: (row) => setCache((rows) => {
      const rest = rows.filter((x) => x.id !== tmpId && x.id !== row.id);
      return [row, ...rest];
    }),
    onError: (err) => failToast(`Couldn't add ${sym} to your watchlist`, err, () => void addWatch(sym)),
  });
  busy.delete(sym); bump();
  if (r.ok && !opts.quiet) undoToast({ title: `Added ${sym} to watchlist`, onUndo: () => void removeWatch(sym, { quiet: true }) });
}

export function removeWatch(rawSym: string, opts: { quiet?: boolean } = {}): DeferredCommit | undefined {
  const sym = up(rawSym);
  const rows = rowsFor(sym).filter((r) => !r.id.startsWith('tmp-'));
  if (!rows.length) return undefined;
  const ids = rows.map((r) => r.id);
  const handle = deferCommit({
    apply: () => {
      ids.forEach((id) => hidden.add(id)); bump();
      return () => {
        ids.forEach((id) => hidden.delete(id)); bump();
        setCache((cur) => {
          const have = new Set(cur.map((r) => r.id));
          return [...rows.filter((r) => !have.has(r.id)), ...cur];
        });
      };
    },
    commit: async () => {
      for (const id of ids) {
        try { await apiRequest('DELETE', `/api/watchlist/${encodeURIComponent(id)}`, undefined, { keepalive: true }); }
        catch (e) { if (!String((e as Error)?.message).startsWith('404')) throw e; } // already gone = done
      }
    },
    onCommitted: () => {
      ids.forEach((id) => hidden.delete(id));
      setCache((cur) => cur.filter((r) => !ids.includes(r.id)));
      bump();
      void queryClient.invalidateQueries({ queryKey: WATCHLIST_KEY });
    },
    onError: (err) => failToast(`Couldn't remove ${sym} — it's back on your watchlist`, err),
  });
  if (!opts.quiet) {
    undoToast({
      title: `Removed ${sym} from watchlist`,
      onUndo: () => { if (!handle.undo()) void addWatch(sym, { quiet: true }); },
    });
  }
  return handle;
}

/** Move a row (by index in the viewer's list) and save the new order. */
export async function reorderWatch(from: number, to: number) {
  const me = myId();
  const all = cache();
  const mine = all.filter((r) => isListRow(r) && ownedBy(me)(r) && !hidden.has(r.id));
  const nextMine = moveItem(mine, from, to);
  if (nextMine.every((r, i) => r.id === mine[i]?.id)) return;
  const ids = nextMine.map((r) => r.id).filter((id) => !id.startsWith('tmp-'));
  await runOptimistic({
    apply: () => {
      const prev = all;
      // the viewer's rows in their new order, everything else (weekly, others') after
      setCache((cur) => orderBy(cur, ids, (r) => r.id));
      return () => setCache(() => prev);
    },
    commit: () => apiRequest('PUT', '/api/watchlist/order', { ids }),
    onError: (err) => failToast("Couldn't save the new order", err),
  });
}

/** Header action for a symbol page: "★ Watch" text for screen readers + toasts. */
export const watchLabel = (sym: string, on: boolean) => (on ? `Remove ${up(sym)} from watchlist` : `Add ${up(sym)} to watchlist`);

