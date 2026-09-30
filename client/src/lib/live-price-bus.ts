/**
 * LIVE PRICE BUS — one /ws/prices socket for the whole tab.
 *
 *   subscribeLivePrice('SPY', cb)   → cb({ price, ts, source }) on every tick
 *
 * Sources, in order:
 *   1. /ws/prices — crypto (Coinbase) and futures arrive for everyone; stock
 *      trades arrive after a {type:'subscribe'} for that symbol (server:
 *      live-equity-stream.ts, Alpaca IEX trades).
 *   2. Fallback: GET /api/last-price/:symbol every 1 s while the socket is down,
 *      every 5 s while it is up but that symbol has been silent for >5 s (a
 *      quiet IEX tape, after hours, or a parked stream). Hidden tabs do not poll.
 *
 * Every tick carries its SOURCE timestamp; consumers show age rather than
 * pretend a carried price is live.
 */

export interface LiveTick {
  symbol: string; price: number; ts: number; source: string;
  /** A real print (stream trade / exchange ticker). False for a polled quote,
   *  whose timestamp is when the quote was read, not when anything traded —
   *  those may refresh the forming candle but never open a new one. */
  live: boolean;
}
type Listener = (t: LiveTick) => void;
type StatusListener = (connected: boolean) => void;

const CRYPTO = new Set(['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK', 'MATIC', 'ATOM', 'LTC', 'UNI', 'NEAR', 'APT', 'SUI', 'PEPE', 'SHIB', 'ARB', 'OP', 'RNDR', 'POL', 'BONK']);
const FUTURES = new Set(['ES', 'NQ', 'YM', 'RTY', 'GC', 'CL', 'SI', 'NG']);

/** Bus key for a chart symbol: "BTC-USD" / "BTCUSD" → "BTC"; "ES=F" → "ES". */
export function liveKey(symbol: string): string {
  const s = symbol.toUpperCase().trim();
  const base = s.replace(/-?USDT?$/, '');
  if (base !== s && CRYPTO.has(base)) return base;
  if (s.endsWith('=F')) return s.slice(0, -2);
  return s;
}
const isEquity = (key: string) => !CRYPTO.has(key) && !FUTURES.has(key);

const listeners = new Map<string, Set<Listener>>();
const statusListeners = new Set<StatusListener>();
const last = new Map<string, LiveTick>();
let ws: WebSocket | null = null;
let connected = false;
let attempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;

function setConnected(v: boolean) {
  if (connected === v) return;
  connected = v;
  statusListeners.forEach((fn) => fn(v));
}

function emit(t: LiveTick) {
  const prev = last.get(t.symbol);
  // Out-of-order or duplicate prints never move the candle backwards in time.
  if (prev && t.ts < prev.ts) return;
  last.set(t.symbol, t);
  listeners.get(t.symbol)?.forEach((fn) => { try { fn(t); } catch { /* a bad consumer must not kill the bus */ } });
}

function sendSubscribe(keys: string[], type: 'subscribe' | 'unsubscribe' = 'subscribe') {
  const eq = keys.filter(isEquity);
  if (!eq.length || !ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type, symbols: eq }));
}

function connect() {
  if (typeof window === 'undefined') return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  const url = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/prices`;
  let sock: WebSocket;
  try { sock = new WebSocket(url); } catch { scheduleReconnect(); return; }
  ws = sock;
  sock.onopen = () => {
    attempts = 0;
    setConnected(true);
    sendSubscribe([...listeners.keys()]);
  };
  sock.onmessage = (ev) => {
    let m: any;
    try { m = JSON.parse(String(ev.data)); } catch { return; }
    if (m?.type !== 'price' || typeof m.symbol !== 'string') return;
    const price = Number(m.price);
    if (!(price > 0)) return;
    emit({ symbol: m.symbol.toUpperCase(), price, ts: Date.parse(m.timestamp) || Date.now(), source: String(m.source ?? 'ws'), live: m.source !== 'yahoo' });
  };
  sock.onclose = () => {
    if (ws === sock) ws = null;
    setConnected(false);
    if (listeners.size) scheduleReconnect();
  };
  sock.onerror = () => { try { sock.close(); } catch { /* ignore */ } };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  const delay = Math.min(30_000, 1_000 * 2 ** attempts++);
  reconnectTimer = setTimeout(() => { reconnectTimer = null; if (listeners.size) connect(); }, delay);
}

async function pollOnce() {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  const now = Date.now();
  for (const key of listeners.keys()) {
    const t = last.get(key);
    const silentFor = t ? now - (t.ts) : Infinity;
    // Socket up and the symbol ticked recently → nothing to do.
    if (connected && silentFor < 5_000) continue;
    // Socket up but quiet → poll at most every 5 s per symbol.
    if (connected && lastPolled.get(key) && now - lastPolled.get(key)! < 5_000) continue;
    lastPolled.set(key, now);
    try {
      const r = await fetch(`/api/last-price/${encodeURIComponent(key)}`, { credentials: 'include', cache: 'no-store' });
      if (!r.ok) continue;
      const d = await r.json();
      const price = Number(d?.price);
      if (price > 0) emit({ symbol: key, price, ts: Date.parse(d.asOf) || now, source: String(d.source ?? 'poll'), live: d.live === true });
    } catch { /* offline — next pass */ }
  }
}
const lastPolled = new Map<string, number>();

function ensureRunning() {
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  connect();
  if (!pollTimer) pollTimer = setInterval(() => { void pollOnce(); }, 1_000);
}

function maybeStop() {
  if (listeners.size) return;
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  // Keep the socket briefly: tab switches unmount one chart and mount the next.
  if (!closeTimer) closeTimer = setTimeout(() => {
    closeTimer = null;
    if (!listeners.size && ws) { try { ws.close(); } catch { /* ignore */ } ws = null; }
  }, 15_000);
}

export function subscribeLivePrice(symbol: string, fn: Listener): () => void {
  const key = liveKey(symbol);
  let set = listeners.get(key);
  const fresh = !set;
  if (!set) { set = new Set(); listeners.set(key, set); }
  set.add(fn);
  ensureRunning();
  if (fresh) sendSubscribe([key]);
  const known = last.get(key);
  if (known) queueMicrotask(() => fn(known));
  return () => {
    const s = listeners.get(key);
    if (!s) return;
    s.delete(fn);
    if (!s.size) { listeners.delete(key); sendSubscribe([key], 'unsubscribe'); }
    maybeStop();
  };
}

export function subscribeLiveStatus(fn: StatusListener): () => void {
  statusListeners.add(fn);
  fn(connected);
  return () => { statusListeners.delete(fn); };
}

export function getLastLiveTick(symbol: string): LiveTick | undefined {
  return last.get(liveKey(symbol));
}
