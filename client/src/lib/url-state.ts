/**
 * View state in the URL — "the URL is the desk".
 *
 *   /t?tab=gex&sym=NVDA&g.metric=vex&g.exp=0-7
 *   /t?tab=flow&sym=NVDA&f.days=5&f.chips=sweep,otm&f.sort=prem.asc
 *
 * Writes use replaceState (a filter change is not navigation, so Back is not
 * spammed) and only when the query string actually changes. Defaults are
 * never written, so an untouched view keeps a clean URL. Reading is
 * validated: a hand-edited or stale link can never put a value the UI does
 * not know into state.
 *
 * The pure part (withParams / codecs / readParam) is unit-tested in
 * scripts/test-batchb-state.ts.
 */
import { useEffect, useRef } from 'react';

export const SYM_PARAM = 'sym';
const SYM_RE = /^[A-Z0-9.^/-]{1,12}$/;

/** A clean ticker from a query value, or null. */
export function cleanSym(raw: string | null | undefined): string | null {
  const s = raw?.trim().toUpperCase();
  return s && SYM_RE.test(s) ? s : null;
}

export function readSym(search: string): string | null {
  try { return cleanSym(new URLSearchParams(search).get(SYM_PARAM)); } catch { return null; }
}

/**
 * `href` with `patch` applied: a string sets the key, null/undefined deletes
 * it. Other params, the path and the hash are untouched; key order is stable
 * (existing keys keep their place, new keys append).
 */
export function withParams(href: string, patch: Record<string, string | null | undefined>): string {
  const u = new URL(href, 'https://url-state.invalid');
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === '') u.searchParams.delete(k);
    else u.searchParams.set(k, v);
  }
  const qs = u.searchParams.toString();
  return `${u.pathname}${qs ? `?${qs}` : ''}${u.hash}`;
}

/** replaceState the current URL with `patch`, only if it changes anything. */
export function replaceUrlParams(patch: Record<string, string | null | undefined>): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const cur = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const next = withParams(cur, patch);
    if (next === cur) return false;
    window.history.replaceState(window.history.state, '', next);
    return true;
  } catch { return false; }
}

/* ── codecs: value ⇄ query string ── */
export interface Codec<T> {
  enc: (v: T) => string | null;   // null = default / omit
  dec: (s: string) => T | undefined; // undefined = invalid → ignore
}

export const oneOf = <T extends string>(allowed: readonly T[], dflt: T): Codec<T> => ({
  enc: (v) => (v === dflt ? null : v),
  dec: (s) => (allowed as readonly string[]).includes(s) ? (s as T) : undefined,
});

export const intIn = (min: number, max: number, dflt: number): Codec<number> => ({
  enc: (v) => (v === dflt ? null : String(v)),
  dec: (s) => { const n = Number(s); return Number.isInteger(n) && n >= min && n <= max ? n : undefined; },
});

export const text = (maxLen = 40): Codec<string> => ({
  enc: (v) => (v.trim() ? v.trim().slice(0, maxLen) : null),
  dec: (s) => s.slice(0, maxLen),
});

/** A set of known ids, comma-joined in a stable (allowed-list) order. */
export const idSet = <T extends string>(allowed: readonly T[]): Codec<T[]> => ({
  enc: (v) => {
    const on = allowed.filter((a) => v.includes(a));
    return on.length ? on.join(',') : null;
  },
  dec: (s) => {
    const parts = s.split(',').map((x) => x.trim()).filter(Boolean);
    const ok = allowed.filter((a) => parts.includes(a));
    return ok.length || !parts.length ? ok : undefined;
  },
});

/** "key.dir" sort, e.g. prem.desc. */
export const sortCodec = <K extends string>(keys: readonly K[], dflt: { key: K; dir: 1 | -1 }): Codec<{ key: K; dir: 1 | -1 }> => ({
  enc: (v) => (v.key === dflt.key && v.dir === dflt.dir ? null : `${v.key}.${v.dir === 1 ? 'asc' : 'desc'}`),
  dec: (s) => {
    const [k, d] = s.split('.');
    if (!(keys as readonly string[]).includes(k) || (d !== 'asc' && d !== 'desc')) return undefined;
    return { key: k as K, dir: d === 'asc' ? 1 : -1 };
  },
});

export function readParam<T>(search: string, key: string, codec: Codec<T>): T | undefined {
  try {
    const raw = new URLSearchParams(search).get(key);
    return raw == null ? undefined : codec.dec(raw);
  } catch { return undefined; }
}

/**
 * Two-way bind one piece of view state to a query param.
 *   - on mount: a valid value in the URL wins (a shared link restores the view)
 *   - on change: the value is written back with replaceState (default → omitted)
 * `enabled=false` (e.g. the tool is on a page whose URL it doesn't own) makes
 * it inert.
 */
export function useUrlParam<T>(key: string, value: T, set: (v: T) => void, codec: Codec<T>, enabled = true) {
  const mounted = useRef(false);
  /** the encoded value we just pulled from the URL and are waiting for state to reach */
  const expect = useRef<string | null | undefined>(undefined);
  const codecRef = useRef(codec);
  codecRef.current = codec;
  const encoded = codec.enc(value);
  // read once on mount (a shared link restores the view)
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const v = readParam(window.location.search, key, codecRef.current);
    if (v !== undefined) {
      const e = codecRef.current.enc(v);
      if (e !== encoded) { expect.current = e; set(v); }
    }
    mounted.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);
  // write on change (runs after the read above in the same commit)
  useEffect(() => {
    if (!enabled || !mounted.current) return;
    if (expect.current !== undefined) {
      if (encoded !== expect.current) return; // state not caught up with the URL yet
      expect.current = undefined;
    }
    replaceUrlParams({ [key]: encoded });
  }, [enabled, key, encoded]);
}

/* ── clipboard ── */

/** Copy text; navigator.clipboard first, a hidden-textarea execCommand fallback second. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* permission denied / not focused — fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

/** The shareable URL of the current view (absolute). */
export function currentViewUrl(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}${window.location.search}${window.location.hash}`;
}
