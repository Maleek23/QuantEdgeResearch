/**
 * Optimistic updates + Undo — the pure core (no React, no DOM), unit-tested in
 * scripts/test-batchb-state.ts.
 *
 * Two shapes cover every mutation that should feel instant:
 *
 *   runOptimistic   apply the change locally NOW, send it, roll the local change
 *                   back if the server says no. Used for adds, edits, tags.
 *
 *   deferCommit     for deletes that can be undone: hide the thing NOW, wait out
 *                   the undo window, and only then send the DELETE. Undo inside
 *                   the window just puts it back — nothing ever reached the
 *                   server, so nothing has to be re-created (ids, history and
 *                   attachments survive). Pending commits are flushed when the
 *                   page is hidden/closed so a delete is never silently dropped.
 *
 * List helpers (toggleIn / removeWhere / moveItem / patchWhere) return NEW
 * arrays and are what the react-query cache patches are built from.
 */

import { CHECKOUT_LIVE } from '../../../shared/pricing';
export const UNDO_WINDOW_MS = 6_000;

export interface OptimisticSpec<R> {
  /** Change local state; return a function that restores what was there. */
  apply: () => (() => void) | void;
  /** The server call. */
  commit: () => Promise<R>;
  /** After a failed commit has been rolled back (show the reason here). */
  onError?: (err: unknown) => void;
  /** After a successful commit (invalidate / reconcile here). */
  onSuccess?: (r: R) => void;
}

/** Apply → commit → (rollback on error). Resolves to {ok, value|error}; never throws. */
export async function runOptimistic<R>(spec: OptimisticSpec<R>): Promise<{ ok: true; value: R } | { ok: false; error: unknown }> {
  let rollback: (() => void) | void = undefined;
  try { rollback = spec.apply(); } catch (error) { spec.onError?.(error); return { ok: false, error }; }
  try {
    const value = await spec.commit();
    spec.onSuccess?.(value);
    return { ok: true, value };
  } catch (error) {
    try { rollback?.(); } catch { /* a failed rollback must not mask the real error */ }
    spec.onError?.(error);
    return { ok: false, error };
  }
}

export interface DeferredCommit {
  /** Cancel the pending commit and restore. false when it already ran. */
  undo: () => boolean;
  /** Run the commit now (idempotent). */
  flush: () => Promise<void>;
  readonly state: 'pending' | 'committing' | 'done' | 'undone' | 'failed';
}

export interface DeferSpec {
  /** Hide / remove locally now; return the restore function. */
  apply: () => (() => void) | void;
  /** The irreversible server call, sent when the window closes. */
  commit: () => Promise<unknown>;
  onError?: (err: unknown) => void;
  onCommitted?: () => void;
  delayMs?: number;
  /** injectable clock for tests */
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (h: unknown) => void;
}

const pending = new Set<DeferredCommit>();

/** Hide now, commit after the undo window unless undone. */
export function deferCommit(spec: DeferSpec): DeferredCommit {
  const schedule = spec.schedule ?? ((fn, ms) => setTimeout(fn, ms));
  const cancel = spec.cancel ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let state: DeferredCommit['state'] = 'pending';
  let restore: (() => void) | void = undefined;
  let running: Promise<void> | null = null;

  const run = (): Promise<void> => {
    if (running) return running;
    if (state !== 'pending') return Promise.resolve();
    state = 'committing';
    cancel(handle);
    pending.delete(handle_);
    running = spec.commit().then(
      () => { state = 'done'; spec.onCommitted?.(); },
      (err) => {
        state = 'failed';
        try { restore?.(); } catch { /* ignore */ }
        spec.onError?.(err);
      },
    );
    return running;
  };

  const handle_: DeferredCommit = {
    undo: () => {
      if (state !== 'pending') return false;
      state = 'undone';
      cancel(handle);
      pending.delete(handle_);
      try { restore?.(); } catch { /* ignore */ }
      return true;
    },
    flush: run,
    get state() { return state; },
  };

  try { restore = spec.apply(); } catch (err) { state = 'failed'; spec.onError?.(err); return handle_; }
  const handle = schedule(() => { void run(); }, spec.delayMs ?? UNDO_WINDOW_MS);
  pending.add(handle_);
  return handle_;
}

/** Commit everything still waiting out its undo window (page hide / unload). */
export function flushPendingCommits(): Promise<void[]> {
  return Promise.all([...pending].map((p) => p.flush()));
}
export const pendingCommitCount = () => pending.size;

if (typeof window !== 'undefined') {
  // pagehide covers tab close, reload and bfcache; fetches started here run
  // with keepalive where the caller asked for it (see apiRequestKeepalive).
  window.addEventListener('pagehide', () => { void flushPendingCommits(); });
}

/* ── list helpers (pure) ── */

/** Add `item` when no element matches, else remove every match. */
export function toggleIn<T>(list: readonly T[], match: (x: T) => boolean, item: T): T[] {
  return list.some(match) ? list.filter((x) => !match(x)) : [...list, item];
}

export function removeWhere<T>(list: readonly T[], match: (x: T) => boolean): T[] {
  return list.filter((x) => !match(x));
}

/** Shallow-merge `patch` into every element that matches. */
export function patchWhere<T extends object>(list: readonly T[], match: (x: T) => boolean, patch: Partial<T>): T[] {
  return list.map((x) => (match(x) ? { ...x, ...patch } : x));
}

/** Move the element at `from` to index `to` (clamped). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  if (from < 0 || from >= out.length) return out;
  const [x] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, x);
  return out;
}

/** Order `items` by `ids` (ids not listed keep their relative order, after the listed ones). */
export function orderBy<T>(items: readonly T[], ids: readonly string[], idOf: (x: T) => string): T[] {
  const rank = new Map(ids.map((id, i) => [id, i]));
  return items
    .map((x, n) => [x, n] as const)
    .sort((a, b) => (rank.get(idOf(a[0])) ?? ids.length + a[1]) - (rank.get(idOf(b[0])) ?? ids.length + b[1]))
    .map(([x]) => x);
}

/** The subset of `prev` that `patch` would overwrite — what an Undo has to write back. */
export function inverseOf<T extends Record<string, unknown>>(prev: T, patch: Partial<T>): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(patch) as (keyof T)[]) out[k] = (prev[k] ?? null) as T[keyof T];
  return out;
}

/**
 * The plan-gate sentence for a Free account (403 with upgradeUrl from server/tier-gate.ts).
 * Honest while checkout is off: paid plans aren't on sale during the beta.
 */
export function planGateMessage(serverMessage?: string | null): string {
  const plan = /\b(Advanced|Pro)\b/.exec(serverMessage ?? '')?.[1] ?? 'a paid';
  return CHECKOUT_LIVE
    ? `This is part of the ${plan} plan. You’re on Free — see Pricing to upgrade.`
    : `This is part of the ${plan} plan. Your beta account is on Free, and paid plans aren’t on sale yet — see Pricing to join the waitlist.`;
}

/** True when an error is a tier refusal (403 carrying upgradeUrl). */
export function isPlanGate(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /^403: /.test(msg) && /"upgradeUrl"/.test(msg);
}

/**
 * "401: {"error":"…"}" → "…" — the reason a server gave, for a toast.
 * Never a raw status code or an HTML error page (docs/UX_COPY_GUIDE.md §U4):
 * a reason the server wrote wins; otherwise a plain sentence for the status.
 */
export function reasonOf(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (!msg.trim()) return 'Something went wrong. Try again.';
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return 'Couldn’t reach QuantEdge — check your connection and try again.';
  const m = msg.match(/^(\d{3}): ([\s\S]*)$/);
  if (!m) return msg;
  const [, status, body] = m;
  try {
    const j = JSON.parse(body);
    // A tier refusal (server/tier-gate.ts) — say what plan it is and what to do, not "requires X tier".
    if (status === '403' && j?.upgradeUrl) return planGateMessage(j?.message);
    const r = j?.error || j?.message;
    if (r) return String(r);
  } catch { /* not JSON */ }
  if (status === '401') return 'Sign in first.';
  if (status === '403') return 'Not allowed for this account.';
  if (status === '404') return 'Not found — it may have been removed.';
  if (status === '429') return 'Too many requests — wait a moment and try again.';
  const text = body.trim();
  if (text && !/^\s*</.test(text)) return text.slice(0, 160);
  return status.startsWith('5')
    ? 'The server had a problem. Try again in a minute.'
    : 'The request didn’t go through. Try again.';
}
