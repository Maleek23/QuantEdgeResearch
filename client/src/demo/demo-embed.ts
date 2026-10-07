/**
 * DEMO EMBED — the landing's product frames show the REAL app, not a recreation.
 *
 * The landing (pages/landing-v2.tsx, components/landing/real-frame.tsx) puts the
 * actual terminal route in a same-origin <iframe> with `?qe-demo=1` (e.g.
 * `/t?tab=gex&qe-demo=1`). Inside that iframe only, main.tsx calls installDemo()
 * before React mounts:
 *
 *   - window.fetch answers every same-origin /api/* request from the SAME sample
 *     fixtures the dev harness uses (client/src/dev/harness-fixtures.ts); writes are
 *     swallowed. Nothing reaches the server, no account is involved.
 *   - WebSockets are pointed nowhere (no live sockets in a picture frame).
 *   - localStorage / sessionStorage are replaced by in-memory stores, so the embedded
 *     app can never write into the visitor's real storage (auth hint, layouts, mode…).
 *     The parent passes its colour mode as `&mode=` so the frame matches the page.
 *
 * It only runs when the page is framed by its own origin AND carries qe-demo=1; a
 * top-level visit to `?qe-demo=1` does nothing. The fixtures are clearly invented
 * (sources labelled as fixtures); the landing badges every frame "Sample data".
 */
import { harnessApi } from '../dev/harness-fixtures';

/**
 * Answers the landing frames need that the dev harness has no fixture for. Sample
 * values, shaped like the server's; anything else falls through to harnessApi.
 */
function demoExtra(path: string): { status: number; body: unknown } | null {
  const now = Date.now();
  const iso = (ms: number) => new Date(now - ms).toISOString();
  if (path.startsWith('/api/volume-read/')) {
    return { status: 200, body: { asOf: iso(4 * 60_000), sessionRvol: 1.4, recentRvol: 1.8, sessionVolume: 31_200_000,
      trigger: { at: iso(70 * 60_000), barVolume: 1_450_000, rvol: 2.1 }, label: 'above normal', baselineSessions: 20,
      note: 'sample data', source: 'sample', sessionDate: null, sessionClosed: false } };
  }
  if (path.startsWith('/api/holy-grail/')) return { status: 200, body: { active: [] } };
  if (path === '/api/bullflow/leaders') {
    const rows: Array<[string, number, number]> = [['NVDA', 4.1e6, 1.2e6], ['SPY', 3.3e6, 2.6e6], ['TSLA', 1.1e6, 2.9e6], ['AMD', 1.9e6, 0.6e6], ['META', 1.4e6, 0.9e6], ['QQQ', 1.2e6, 1.7e6], ['PLTR', 0.9e6, 0.3e6]];
    return { status: 200, body: { enabled: true, generatedAt: iso(90_000), rows: rows.map(([ticker, c, p]) => ({ ticker, callPremium: c, putPremium: p, totalPremium: c + p, totalNetPremium: c - p })) } };
  }
  if (path.startsWith('/api/bullflow/net-premium-series/')) {
    const sym = decodeURIComponent(path.split('/').pop() ?? 'SPY');
    const open = new Date(); open.setUTCHours(13, 30, 0, 0);
    const n = 48; let c = 0; let p = 0;
    const points = Array.from({ length: n }, (_, i) => { c += 40_000 + Math.sin(i / 4) * 60_000; p += 25_000 + Math.cos(i / 5) * 50_000; return { t: new Date(open.getTime() + i * 5 * 60_000).toISOString(), calls: Math.round(c), puts: Math.round(p) }; });
    return { status: 200, body: { enabled: true, symbol: sym, series: { points }, generatedAt: iso(60_000) } };
  }
  if (path === '/api/nexus/tracked') return { status: 200, body: { tracked: [] } };
  if (path === '/api/journal/took-ideas') return { status: 200, body: { journal: 'mine', ideaIds: [] } };
  return null;
}

export function demoWanted(): boolean {
  try {
    if (window.top === window.self) return false;
    if (window.parent.location.origin !== window.location.origin) return false;
  } catch { return false; }
  return new URLSearchParams(window.location.search).get('qe-demo') === '1';
}

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const m = new Map<string, string>(Object.entries(seed));
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    removeItem: (k: string) => { m.delete(k); },
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
  } as Storage;
}

export function installDemo() {
  const q = new URLSearchParams(window.location.search);
  const mode = /^(light|dark)$/.test(q.get('mode') ?? '') ? q.get('mode')! : 'dark';
  const seed: Record<string, string> = {
    'qe-mode': mode,
    // The "N new updates" toast and first-run guides would cover the picture.
    qe_changelog_seen: '9999',
    'qe-terminal-guide-seen': '1',
  };
  try { Object.defineProperty(window, 'localStorage', { value: memoryStorage(seed), configurable: true }); } catch { /* keep native */ }
  try { Object.defineProperty(window, 'sessionStorage', { value: memoryStorage({ 'qe-boot-seen': '1' }), configurable: true }); } catch { /* keep native */ }
  document.documentElement.setAttribute('data-qe-demo', '');

  const misses = new Set<string>();
  (window as unknown as { __qeDemoMisses: Set<string> }).__qeDemoMisses = misses;
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, location.origin);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return real(input, init);
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const a = method === 'GET' || method === 'HEAD'
      ? demoExtra(url.pathname) ?? harnessApi(url.pathname, url.searchParams, { tier: 'pro' })
      : { status: 200, body: { ok: true, demo: true } };
    if (a.status === 404) misses.add(url.pathname);
    return new Response(JSON.stringify(a.body), { status: a.status, headers: { 'content-type': 'application/json' } });
  };
  // A socket that never connects (and never logs a connection error): readyState CLOSED.
  class NoSocket extends EventTarget {
    static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
    readonly CONNECTING = 0; readonly OPEN = 1; readonly CLOSING = 2; readonly CLOSED = 3;
    readyState = 3; url: string; protocol = ''; extensions = ''; bufferedAmount = 0; binaryType: BinaryType = 'blob';
    onopen = null; onclose = null; onerror = null; onmessage = null;
    constructor(u: string | URL) { super(); this.url = String(u); }
    send() { /* nowhere */ }
    close() { /* already closed */ }
  }
  const RealWS = window.WebSocket;
  window.WebSocket = function (u: string | URL, p?: string | string[]) {
    return String(u).includes('/vite') ? new RealWS(u, p) : new NoSocket(u);
  } as unknown as typeof WebSocket;
}
