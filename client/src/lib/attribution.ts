/**
 * First-touch attribution for waitlist / sign-up captures (2026-10-07).
 *
 * captureFirstTouch() runs once per tab session at app start (main.tsx): it
 * keeps the external referrer, the landing path and any utm_* params of the
 * FIRST page the visitor opened — the landing usually, before they click
 * through to /signup and those are gone. attributionPayload() is what the
 * waitlist and sign-up requests send; the server whitelists and trims it
 * (server/waitlist-capture.ts parseAttribution).
 *
 * Storage can throw (private mode, blocked site data): every access is guarded
 * and the payload falls back to the current page.
 */
const KEY = 'qe_first_touch_v1';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

export interface AttributionPayload {
  referrer?: string;
  landingPath?: string;
  utm?: Partial<Record<typeof UTM_KEYS[number], string>>;
}

function readCurrent(): AttributionPayload {
  if (typeof window === 'undefined') return {};
  const out: AttributionPayload = { landingPath: window.location.pathname };
  try {
    const ref = document.referrer;
    if (ref && new URL(ref).origin !== window.location.origin) out.referrer = ref;
  } catch { /* no referrer */ }
  const params = new URLSearchParams(window.location.search);
  for (const k of UTM_KEYS) {
    const v = params.get(k);
    if (v) (out.utm ??= {})[k] = v.slice(0, 100);
  }
  return out;
}

export function captureFirstTouch(): void {
  try {
    if (window.sessionStorage.getItem(KEY)) return;
    window.sessionStorage.setItem(KEY, JSON.stringify(readCurrent()));
  } catch { /* storage unavailable */ }
}

export function attributionPayload(): AttributionPayload {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as AttributionPayload;
  } catch { /* fall through */ }
  return readCurrent();
}
