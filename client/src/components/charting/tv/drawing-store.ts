/**
 * DRAWING STORE — where a user's chart drawings live, per symbol.
 *
 * Two layers behind one `DrawingStore` interface:
 *   - the DEVICE copy (localStorage, one key per user × symbol) — read
 *     synchronously, so the chart paints its drawings on the first frame and
 *     keeps working offline / signed out;
 *   - the SERVER copy (GET/PUT /api/chart/drawings/:symbol, a JSON file per
 *     user on the server — server/chart-drawings-store.ts). It is what makes
 *     drawings follow the user to another device.
 *
 * Sync rule (shared/chart-drawings.ts pickNewer): a symbol's drawings are one
 * set stamped with `updatedAt`; the newer set wins whole. On load the device
 * copy shows at once, the server copy is fetched, and whichever is newer is
 * kept (a newer device copy — edited offline — is pushed up). Saves write the
 * device copy now and PUT the server copy after a short debounce. Another tab
 * follows via the 'storage' event; another device via a refetch when this
 * window regains focus.
 *
 * Drawings are stored in data space (time ms + price, colour ROLES), so they
 * are interval-independent and follow the visual mode.
 */
import type { Drawing } from './drawing-geometry';
import { parseDrawingsDoc, pickNewer, sanitizeDrawings, serializeDrawings } from '@shared/chart-drawings';

export { sanitizeDrawings } from '@shared/chart-drawings';

export interface DrawingScope { userId: string; symbol: string }

export interface DrawingStore {
  load(scope: DrawingScope): Drawing[];
  save(scope: DrawingScope, drawings: Drawing[]): void;
  /** Notified when the stored list for `scope` changes elsewhere (another tab, the server). */
  subscribe(scope: DrawingScope, fn: () => void): () => void;
  /** Where the copy on screen came from, for the drawings panel. */
  status?(scope: DrawingScope): SyncStatus;
}

export type SyncStatus = { state: 'device' | 'syncing' | 'synced' | 'offline'; at: number | null };

const VERSION = 1;
export const drawingKey = (s: DrawingScope) => `qe-drawings-v${VERSION}:${s.userId || 'anon'}:${s.symbol.toUpperCase()}`;

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
const ls = (): KV | null => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };

interface LocalDoc { drawings: Drawing[]; updatedAt: number }
function readLocal(kv: KV | null, scope: DrawingScope): LocalDoc | null {
  try {
    const raw = kv?.getItem(drawingKey(scope));
    if (raw == null) return null;
    const doc = parseDrawingsDoc(raw);
    return { drawings: doc.drawings, updatedAt: doc.updatedAt };
  } catch { return null; }
}
function writeLocal(kv: KV | null, scope: DrawingScope, drawings: Drawing[], updatedAt: number) {
  try {
    if (!kv) return;
    // An empty set is still written (with its time): "I deleted everything" must win a sync.
    kv.setItem(drawingKey(scope), serializeDrawings(scope.symbol, drawings, updatedAt));
  } catch { /* private mode / quota: this session only */ }
}

export const deviceDrawingStore: DrawingStore = {
  load(scope) { return readLocal(ls(), scope)?.drawings ?? []; },
  save(scope, drawings) { writeLocal(ls(), scope, drawings, Date.now()); },
  subscribe(scope, fn) {
    if (typeof window === 'undefined') return () => {};
    const key = drawingKey(scope);
    const onStorage = (e: StorageEvent) => { if (e.key === key) fn(); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  },
};

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; credentials?: 'include' }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface SyncedStoreDeps {
  fetch: FetchLike;
  kv: () => KV | null;
  now?: () => number;
  debounceMs?: number;
  /** Re-read the server at most this often per symbol (focus refetches respect it). */
  minRefetchMs?: number;
}

const url = (symbol: string) => `/api/chart/drawings/${encodeURIComponent(symbol.toUpperCase())}`;

/**
 * Device copy + server copy. Signed-out users (userId 'anon') stay device-only.
 * Exported as a factory so the sync rules are tested without a browser.
 */
export function createSyncedDrawingStore(deps: SyncedStoreDeps): DrawingStore & { pull(scope: DrawingScope, force?: boolean): Promise<void>; flush(): Promise<void> } {
  const now = deps.now ?? Date.now;
  const listeners = new Map<string, Set<() => void>>();
  const lastPull = new Map<string, number>();
  const status = new Map<string, SyncStatus>();
  const pending = new Map<string, { scope: DrawingScope; timer: ReturnType<typeof setTimeout> | null }>();
  const k = (s: DrawingScope) => drawingKey(s);
  const notify = (s: DrawingScope) => listeners.get(k(s))?.forEach((f) => f());
  const remote = (s: DrawingScope) => !!s.userId && s.userId !== 'anon';
  const setStatus = (s: DrawingScope, st: SyncStatus) => { status.set(k(s), st); };

  async function push(scope: DrawingScope): Promise<void> {
    const doc = readLocal(deps.kv(), scope);
    if (!doc) return;
    setStatus(scope, { state: 'syncing', at: status.get(k(scope))?.at ?? null });
    try {
      const r = await deps.fetch(url(scope.symbol), {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drawings: doc.drawings, updatedAt: doc.updatedAt }),
      });
      setStatus(scope, r.ok ? { state: 'synced', at: now() } : { state: 'offline', at: status.get(k(scope))?.at ?? null });
    } catch { setStatus(scope, { state: 'offline', at: status.get(k(scope))?.at ?? null }); }
  }

  async function pull(scope: DrawingScope, force = false): Promise<void> {
    if (!remote(scope)) return;
    const key = k(scope);
    const t = now();
    if (!force && t - (lastPull.get(key) ?? -Infinity) < (deps.minRefetchMs ?? 20_000)) return;
    lastPull.set(key, t);
    if (pending.get(key)?.timer) return; // an edit is about to go up: it is newer
    let server: { drawings: Drawing[]; updatedAt: number } | null = null;
    try {
      const r = await deps.fetch(url(scope.symbol), { credentials: 'include' });
      if (!r.ok) { setStatus(scope, { state: r.status === 401 || r.status === 403 ? 'device' : 'offline', at: null }); return; }
      const body = await r.json() as { drawings?: unknown; updatedAt?: unknown };
      const updatedAt = Number(body?.updatedAt);
      server = Number.isFinite(updatedAt) && updatedAt > 0 ? { drawings: sanitizeDrawings(body?.drawings), updatedAt } : null;
    } catch { setStatus(scope, { state: 'offline', at: null }); return; }
    const local = readLocal(deps.kv(), scope);
    const pick = pickNewer(local, server);
    if (pick.winner === 'server' && server) {
      const same = local && JSON.stringify(local.drawings) === JSON.stringify(server.drawings);
      writeLocal(deps.kv(), scope, server.drawings, server.updatedAt);
      setStatus(scope, { state: 'synced', at: now() });
      if (!same) notify(scope);
    } else if (pick.winner === 'local' && local && local.drawings.length + (server?.drawings.length ?? 0) > 0) {
      await push(scope);
    } else setStatus(scope, { state: 'synced', at: now() });
  }

  return {
    load(scope) {
      if (remote(scope)) void pull(scope);
      return readLocal(deps.kv(), scope)?.drawings ?? [];
    },
    save(scope, drawings) {
      writeLocal(deps.kv(), scope, drawings, now());
      if (!remote(scope)) return;
      const key = k(scope);
      const p = pending.get(key) ?? { scope, timer: null };
      if (p.timer) clearTimeout(p.timer);
      setStatus(scope, { state: 'syncing', at: status.get(key)?.at ?? null });
      p.timer = setTimeout(() => { p.timer = null; pending.delete(key); void push(scope); }, deps.debounceMs ?? 600);
      pending.set(key, p);
    },
    subscribe(scope, fn) {
      const key = k(scope);
      const set = listeners.get(key) ?? new Set();
      set.add(fn); listeners.set(key, set);
      const off: (() => void)[] = [() => { set.delete(fn); }];
      if (typeof window !== 'undefined') {
        const onStorage = (e: StorageEvent) => { if (e.key === key) fn(); };
        const onFocus = () => { void pull(scope); };
        const onVis = () => { if (document.visibilityState === 'visible') void pull(scope); };
        window.addEventListener('storage', onStorage);
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVis);
        off.push(() => { window.removeEventListener('storage', onStorage); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVis); });
      }
      return () => off.forEach((f) => f());
    },
    status(scope) { return remote(scope) ? status.get(k(scope)) ?? { state: 'syncing', at: null } : { state: 'device', at: null }; },
    pull,
    async flush() {
      const all = [...pending.values()];
      for (const p of all) { if (p.timer) clearTimeout(p.timer); p.timer = null; }
      pending.clear();
      await Promise.all(all.map((p) => push(p.scope)));
    },
  };
}

let active: DrawingStore | null = null;
/** Swap the backing store (tests, or a device-only embed). */
export function setDrawingStore(store: DrawingStore) { active = store; }
export function getDrawingStore(): DrawingStore {
  if (!active) {
    active = typeof window !== 'undefined' && typeof fetch === 'function'
      ? createSyncedDrawingStore({
        // Writes carry the CSRF double-submit token (lib/queryClient.ts does the same).
        fetch: (u, i) => {
          const csrf = /csrf_token=([^;]+)/.exec(typeof document !== 'undefined' ? document.cookie : '')?.[1];
          const headers = { ...(i?.headers ?? {}), ...(csrf && i?.method && i.method !== 'GET' ? { 'x-csrf-token': csrf } : {}) };
          return fetch(u, { ...i, headers });
        },
        kv: ls,
      })
      : deviceDrawingStore;
  }
  return active;
}
