/**
 * Return-to — deep links survive the sign-in gate.
 *
 * A signed-out visitor who opens /r/NVDA?tab=analyze#setups hits the gate; the
 * gate's Log in / Sign up carry `?returnTo=<that path>` and a successful login
 * lands back on it instead of the generic /t. Google OAuth round-trips through
 * the server (which always redirects to a fixed page), so the target is also
 * stashed in sessionStorage for ~15 minutes and consumed once the session
 * exists (useConsumeReturnTo, mounted in the App router).
 *
 * SECURITY: only same-origin RELATIVE paths are ever followed. Anything that
 * could leave the site — `//evil.com`, `/\evil.com`, `https://…`,
 * `javascript:`, control characters, encoded slashes that a browser would
 * normalise into a scheme-relative URL — is rejected, and so are the auth
 * pages themselves (a loop) and /api/* (not a page). sanitizeReturnTo is pure
 * and unit-tested in scripts/test-return-to.ts.
 */

export const RETURN_TO_PARAM = 'returnTo';
const STASH_KEY = 'qe-return-to';
const STASH_TTL_MS = 15 * 60_000;
const MAX_LEN = 2048;
/** Paths that must never be a return target (auth loops, non-pages). */
const BLOCKED = ['/login', '/signup', '/forgot-password', '/reset-password', '/logout', '/api'];
const BASE = 'https://return-to.invalid';

/**
 * A safe same-origin relative target (path + query + hash), or null.
 * Accepts only strings that start with a single "/" and resolve, against a
 * sentinel origin, to that same origin.
 */
export function sanitizeReturnTo(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > MAX_LEN) return null;
  // Must be root-relative: "/x" — never "//host", "/\host", a scheme, or a bare word.
  if (s[0] !== '/' || s[1] === '/' || s[1] === '\\') return null;
  // No backslashes or control/whitespace characters anywhere (browsers treat "\" as "/"
  // and strip tabs/newlines, which turns "/\t/evil.com" into "//evil.com").
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f\s]/.test(s)) return null;
  // An encoded slash/backslash right after the leading "/" is how "/%2F%2Fevil.com" sneaks through decoders.
  if (/^\/(%2f|%5c)/i.test(s)) return null;
  let u: URL;
  try { u = new URL(s, BASE); } catch { return null; }
  if (u.origin !== BASE) return null;
  const path = u.pathname;
  if (path === '/' && !u.search && !u.hash) return null; // "/" is not a deep link — let the caller pick its default
  const lower = path.toLowerCase();
  if (BLOCKED.some((p) => lower === p || lower.startsWith(`${p}/`))) return null;
  return `${u.pathname}${u.search}${u.hash}`;
}

/** The return target carried in a query string (e.g. window.location.search), sanitised. */
export function readReturnTo(search: string): string | null {
  try { return sanitizeReturnTo(new URLSearchParams(search).get(RETURN_TO_PARAM)); } catch { return null; }
}

/** `/login?returnTo=…` (or `/signup…`) for a target; the bare page when the target is unsafe. */
export function authHref(page: '/login' | '/signup', returnTo: string | null | undefined): string {
  const safe = sanitizeReturnTo(returnTo);
  return safe ? `${page}?${RETURN_TO_PARAM}=${encodeURIComponent(safe)}` : page;
}

/** Where the browser is right now (path + query + hash), for the gate to hand to login. */
export function currentLocationTarget(): string | null {
  if (typeof window === 'undefined') return null;
  return sanitizeReturnTo(`${window.location.pathname}${window.location.search}${window.location.hash}`);
}

/** Remember a target across an OAuth round trip (the server redirect drops the query). */
export function stashReturnTo(target: string | null | undefined): void {
  const safe = sanitizeReturnTo(target);
  try {
    if (safe) sessionStorage.setItem(STASH_KEY, JSON.stringify({ to: safe, at: Date.now() }));
    else sessionStorage.removeItem(STASH_KEY);
  } catch { /* storage unavailable — the login still works, it just lands on the default page */ }
}

/** Take (and clear) a stashed target if it is still fresh and still safe. */
export function takeStashedReturnTo(now = Date.now()): string | null {
  try {
    const raw = sessionStorage.getItem(STASH_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STASH_KEY);
    const v = JSON.parse(raw) as { to?: unknown; at?: unknown };
    if (typeof v.at !== 'number' || now - v.at > STASH_TTL_MS || now < v.at) return null;
    return sanitizeReturnTo(v.to);
  } catch { return null; }
}

/** Drop any stashed target (a completed email login already navigated). */
export function clearStashedReturnTo(): void {
  try { sessionStorage.removeItem(STASH_KEY); } catch { /* non-critical */ }
}

/** A short human name for a target, for "Sign in to open NVDA". */
export function describeTarget(target: string | null | undefined): string {
  const safe = sanitizeReturnTo(target);
  if (!safe) return 'this page';
  const path = safe.split(/[?#]/)[0];
  const sym = /^\/r\/([^/]+)/.exec(path)?.[1];
  if (sym) { try { return decodeURIComponent(sym).toUpperCase(); } catch { return sym.toUpperCase(); } }
  const names: Record<string, string> = { '/t': 'the terminal', '/today': 'Today', '/settings': 'Settings', '/alerts': 'Alerts' };
  return names[path] ?? 'this page';
}
