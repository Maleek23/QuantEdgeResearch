/**
 * DEV-ONLY DEVICE HARNESS — render every signed-in page under plain `vite`
 * (no server, no database, no credentials) with synthetic fixtures.
 *
 * Reached only from main.tsx behind `import.meta.env.DEV`, so Rollup drops the
 * import (and this file, and harness-fixtures.ts) from production builds.
 *
 *   npx vite --config vite.config.ts        # client only
 *   open http://localhost:5173/__harness    # index of every page; turns the harness on
 *
 * Activation is per tab (sessionStorage 'qe-harness'): visiting /__harness or any
 * URL with ?harness=1 switches it on; ?harness=0 switches it off. Options:
 *   ?harness-admin=1   the fixture user is an admin (admin hub)
 *   ?harness-out=1     /api/auth/me answers 401 (sign-in gates)
 *
 * While on, window.fetch answers every same-origin /api/* request from
 * harness-fixtures.ts (unknown GETs → 404 naming the missing fixture; writes →
 * 200 {ok:true}, nothing is sent anywhere). A red strip says TEST HARNESS.
 */
import { harnessApi, type HarnessOptions } from './harness-fixtures';
import { getMostRecentId } from '../../../shared/changelog';

const KEY = 'qe-harness';

function read(k: string): string | null { try { return sessionStorage.getItem(k); } catch { return null; } }
function write(k: string, v: string | null) { try { if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch { /* private mode */ } }

/** Decide from the URL (and the tab's saved flag) whether the harness runs. */
export function harnessWanted(): boolean {
  const q = new URLSearchParams(location.search);
  if (q.get('harness') === '0') { write(KEY, null); return false; }
  if (q.get('harness') === '1' || location.pathname === '/__harness') write(KEY, '1');
  if (location.pathname === '/__harness') { write(KEY + '-admin', null); write(KEY + '-out', null); }
  if (q.has('harness-admin')) write(KEY + '-admin', q.get('harness-admin') === '1' ? '1' : null);
  if (q.has('harness-out')) write(KEY + '-out', q.get('harness-out') === '1' ? '1' : null);
  return read(KEY) === '1';
}

export function installHarness() {
  const opts = (): HarnessOptions => ({ admin: read(KEY + '-admin') === '1', signedOut: read(KEY + '-out') === '1' });
  // The "N new updates" toast is a once-per-device notice; under the harness it only hides the page.
  try { if (!localStorage.getItem('qe_changelog_seen')) localStorage.setItem('qe_changelog_seen', getMostRecentId()); } catch { /* storage off */ }
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, location.origin);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return real(input, init);
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const a = method === 'GET' || method === 'HEAD'
      ? harnessApi(url.pathname, url.searchParams, opts())
      : { status: 200, body: { ok: true, harness: 'write swallowed — nothing sent' } };
    if (a.status === 404) console.info('[harness] no fixture:', url.pathname);
    await new Promise((r) => setTimeout(r, 30)); // let loading states paint once, like a network
    return new Response(JSON.stringify(a.body), { status: a.status, headers: { 'content-type': 'application/json' } });
  };
  // No live sockets under the harness: a WebSocket to the dev server would only retry forever.
  const RealWS = window.WebSocket;
  window.WebSocket = class extends RealWS {
    constructor(u: string | URL, p?: string | string[]) {
      const s = String(u);
      super(s.includes('/vite') || s.includes('token=') || s.includes('?token') ? s : 'ws://127.0.0.1:9/harness-no-socket', p);
    }
  } as typeof WebSocket;

  const strip = () => {
    if (document.querySelector('[data-harness]')) return;
    const d = document.createElement('div');
    d.setAttribute('data-harness', '');
    d.setAttribute('aria-hidden', 'true');
    d.textContent = 'TEST HARNESS · SYNTHETIC FIXTURES';
    d.style.cssText = 'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom) + 64px);transform:translateX(-50%);z-index:2147483647;pointer-events:none;padding:1px 8px;border-radius:6px;background:rgba(185,28,28,.85);color:#fff;font:700 9px/1.6 system-ui,sans-serif;letter-spacing:.06em;white-space:nowrap';
    document.body.appendChild(d);
  };
  if (document.body) strip(); else addEventListener('DOMContentLoaded', strip);
}
