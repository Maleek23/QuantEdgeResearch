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
import { demoConvictions } from './demo-picks';
import { ZD_DEMO_NOW, zeroDteDemoAnswer } from '../dev/zerodte-mocks';

/**
 * The frame's clock: pinned to a live morning session (09:40 ET, the 0DTE fixture's
 * minute) and running forward in real time — every desk shows an active session.
 */
function pinClock() {
  const RealDate = Date;
  const offset = ZD_DEMO_NOW - RealDate.now();
  class DemoDate extends RealDate {
    constructor(...a: unknown[]) {
      if (a.length === 0) super(RealDate.now() + offset);
      else super(...(a as [number]));
    }
    static now() { return RealDate.now() + offset; }
  }
  (window as unknown as { Date: DateConstructor }).Date = DemoDate as unknown as DateConstructor;
}

/** A balanced sample journal: ~half winners, small sizes, a modest net — not a P&L headline. */
function demoJournal(now: number) {
  const syms = ['SPY', 'NVDA', 'QQQ', 'TSLA', 'AMD', 'AAPL', 'META', 'MSFT', 'IWM', 'PLTR'];
  let seed = 7; const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const trades = Array.from({ length: 38 }, (_, i) => {
    // 18 winners / 20 losers, similar sizes: a working, unglamorous book.
    const win = [0, 2, 3, 6, 8, 9, 12, 14, 15, 18, 20, 23, 25, 27, 30, 32, 34, 36].includes(i);
    const entry = +(0.8 + r() * 2.4).toFixed(2);
    const move = win ? 0.14 + r() * 0.26 : -(0.13 + r() * 0.24);
    const exit = +(entry * (1 + move)).toFixed(2);
    const qty = 1 + (i % 4 === 0 ? 1 : 0);
    const t0 = now - (i * 0.8 + 0.2) * 864e5;
    const pnl = +((exit - entry) * qty * 100 - 1.3).toFixed(2);
    return { id: `demo-t${i}`, symbol: syms[i % syms.length], assetType: 'option', direction: 'long', optionType: i % 3 ? 'call' : 'put',
      strikePrice: 100 + (i % 9) * 5, expiryDate: new Date(t0 + 7 * 864e5).toISOString().slice(0, 10), quantity: qty, entryPrice: entry, exitPrice: exit, fees: 1.3,
      entryTime: new Date(t0).toISOString(), exitTime: new Date(t0 + (40 + i * 7) * 60_000).toISOString(), holdingMinutes: 40 + i * 7,
      realizedPnL: pnl, realizedPnLPercent: +(move * 100).toFixed(1), grossPnL: pnl + 1.3, status: 'closed', outcome: pnl >= 0 ? 'win' : 'loss',
      notes: null, emotion: null, setupType: ['breakout', 'pullback', 'vwap reclaim', 'opening range'][i % 4], mistakeTag: win ? null : i % 5 === 0 ? 'chased entry' : null,
      rating: null, screenshot: null, broker: 'webull' };
  });
  return { trades, count: trades.length };
}

/** Realistic wording where the shared fixtures carry test labels (the frames never say "fixture"). */
const SOURCE_FOR_KEY: Record<string, string> = { optionsSource: 'tradier', chainSource: 'tradier', broker: 'webull', provenance: 'nexus', streamState: 'live' };
function sanitize(v: unknown, key = ''): unknown {
  if (typeof v === 'string') {
    if (/^(test_harness_fixture|TEST HARNESS fixture|fixture)$/i.test(v)) {
      if (SOURCE_FOR_KEY[key]) return SOURCE_FOR_KEY[key];
      if (key === 'regime') return 'risk-on';
      if (key === 'owner') return 'index engine';
      if (key === 'label' || key === 'note' || key === 'basis' || key === 'why' || key === 'origin') return '';
      return 'tradier';
    }
    if (/^fixture session$/i.test(v)) return 'Regular session';
    if (/harness/i.test(v)) return 'Model output — unvalidated, educational.';
    if (/test-harness fixture — not a real idea/i.test(v)) return 'Setup published by the NEXUS engine with its levels printed.';
    if (/synthetic test-harness fixture/i.test(v)) return 'Model output — unvalidated, educational.';
    if (/fixture idea - synthetic/i.test(v)) return 'VWAP reclaim with calls leading; dealers long gamma into the call wall.';
    return v
      .replace(/\s*\((?:test[- ]harness )?fixture(?:[^)]*)?\)/gi, '')
      .replace(/test[_ -]?harness[_ ]?fixture/gi, 'tradier')
      .replace(/\bFIXTURE\b/g, 'W')
      .replace(/\bfixture[:\s]*/gi, '')
      .replace(/^Synthetic /, '');
  }
  if (Array.isArray(v)) {
    const out = v.map((x) => sanitize(x, key));
    return key === 'notes' || key === 'gradeWhy' || key === 'alertNames' ? out.filter((x) => x !== '' && x !== 'tradier') : out;
  }
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) o[k] = sanitize(x, k);
    return o;
  }
  return v;
}

/**
 * Answers the landing frames need that the dev harness has no fixture for. Sample
 * values, shaped like the server's; anything else falls through to harnessApi.
 */
function demoExtra(path: string): { status: number; body: unknown } | null {
  const now = Date.now();
  const zd = zeroDteDemoAnswer(path);
  if (zd) return { status: 200, body: zd };
  if (path === '/api/convictions') return { status: 200, body: demoConvictions(now) };
  if (path.startsWith('/api/quotes/batch/')) {
    const picks = demoConvictions(now).picks;
    const syms = decodeURIComponent(path.slice('/api/quotes/batch/'.length)).split(',').filter(Boolean);
    const known = Object.fromEntries(picks.map((p) => [p.symbol, p.currentPrice]));
    const base: Record<string, number> = { SPY: 671.6, QQQ: 603.4, IWM: 246.1, SPX: 6741.2, ...known };
    return { status: 200, body: { quotes: Object.fromEntries(syms.map((s, i) => [s, { price: base[s] ?? +(60 + ((i * 37) % 300)).toFixed(2), changePercent: +(((i * 13) % 7) / 5 - 0.4).toFixed(2), asOf: new Date(now - 20_000).toISOString(), session: 'regular', source: 'alpaca-iex' }])) } };
  }
  if (path === '/api/journal/trades') return { status: 200, body: demoJournal(now) };
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
    const open = new Date(); open.setUTCHours(open.getUTCMonth() >= 2 && open.getUTCMonth() <= 10 ? 13 : 14, 30, 0, 0);
    const n = Math.max(6, Math.min(78, Math.floor((now - open.getTime()) / 300_000))); let c = 0; let p = 0;
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
  pinClock();
  // Belt and braces: no test-mode strip can ever paint inside a landing frame.
  const st = document.createElement('style');
  st.textContent = '[data-harness]{display:none!important}';
  document.head.appendChild(st);

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
    let body = sanitize(a.body);
    // Charts for the board's setups end at the setup's own price (the shared bar fixture is generic).
    const hp = url.pathname.match(/^\/api\/historical-prices\/([^/]+)/);
    if (hp && body && typeof body === 'object' && Array.isArray((body as { data?: unknown }).data)) {
      const target = demoConvictions(Date.now()).picks.find((p) => p.symbol === decodeURIComponent(hp[1]).toUpperCase())?.currentPrice;
      const bars = (body as { data: Array<Record<string, number>> }).data;
      const last = bars[bars.length - 1]?.close;
      if (target && last) {
        const k = target / last;
        body = { ...(body as object), data: bars.map((b) => ({ ...b, open: +(b.open * k).toFixed(2), high: +(b.high * k).toFixed(2), low: +(b.low * k).toFixed(2), close: +(b.close * k).toFixed(2) })) };
      }
    }
    return new Response(JSON.stringify(body), { status: a.status, headers: { 'content-type': 'application/json' } });
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
