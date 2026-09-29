/**
 * LIVE EQUITY TRADES — one upstream socket, fanned out on /ws/prices.
 *
 * /ws/prices has always carried crypto (Coinbase) and futures (Yahoo, 10 s
 * poll) to every client, but no stock ticks at all: a SPY chart had nothing to
 * form its last candle from and waited for the 2-minute history refetch.
 *
 * This module holds ONE Alpaca market-data stream (IEX feed on the free plan —
 * trades printed on IEX only, a subset of consolidated volume, so it is
 * labelled `alpaca-iex` and only the PRICE is used, never the size as volume).
 * Clients send {type:'subscribe', symbols:[...]} on /ws/prices; the union of
 * wanted symbols (capped — the free plan allows 30) is subscribed upstream, and
 * trades are coalesced to ≤4 messages/s per symbol before fan-out, so a busy
 * tape cannot flood a 1 vCPU box or a phone.
 *
 * Cost when nobody is looking: zero. The upstream socket opens on the first
 * subscriber and closes 60 s after the last one leaves.
 *
 * Failure is honest, not silent: a rejected login or the one-connection limit
 * (another process using the same keys) parks the stream for 10 minutes and
 * clients fall back to polling /api/last-price/:symbol.
 *
 * Env: ALPACA_API_KEY / ALPACA_SECRET_KEY (already used for option chains),
 * ALPACA_DATA_FEED (default 'iex'), LIVE_EQUITY_STREAM=0 disables. In
 * development the stream is OFF unless LIVE_EQUITY_STREAM=1, so a laptop dev
 * server never steals production's single allowed connection.
 */
import WebSocket from 'ws';
import { logger } from './logger';

export interface EquityTick { symbol: string; price: number; ts: number; source: 'alpaca-iex' | 'alpaca-sip' }

const MAX_SYMBOLS = 30;
const FLUSH_MS = 250;
const IDLE_CLOSE_MS = 60_000;
const PARK_MS = 10 * 60_000;
const SYMBOL_RE = /^[A-Z][A-Z0-9.]{0,9}$/;

const feed = (process.env.ALPACA_DATA_FEED || 'iex').toLowerCase() === 'sip' ? 'sip' : 'iex';
const source: EquityTick['source'] = feed === 'sip' ? 'alpaca-sip' : 'alpaca-iex';

let upstream: WebSocket | null = null;
let authed = false;
let parkedUntil = 0;
let parkReason = '';
let reconnectTimer: NodeJS.Timeout | null = null;
let idleTimer: NodeJS.Timeout | null = null;
let reconnectAttempts = 0;
const subscribedUpstream = new Set<string>();

/** client → symbols it asked for */
const clientSymbols = new Map<WebSocket, Set<string>>();
/** latest trade per symbol (also serves /api/last-price) */
const lastTrade = new Map<string, EquityTick>();
/** coalescing buffer: symbol → newest tick not yet broadcast */
const pending = new Map<string, EquityTick>();
let flushTimer: NodeJS.Timeout | null = null;

function enabled(): boolean {
  if (!process.env.ALPACA_API_KEY || !process.env.ALPACA_SECRET_KEY) return false;
  const flag = process.env.LIVE_EQUITY_STREAM;
  if (flag === '0') return false;
  if (flag === '1') return true;
  return process.env.NODE_ENV === 'production';
}

function wanted(): string[] {
  const counts = new Map<string, number>();
  clientSymbols.forEach((set) => set.forEach((s) => counts.set(s, (counts.get(s) ?? 0) + 1)));
  // Most-requested first so the cap drops the least-watched names.
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_SYMBOLS).map(([s]) => s);
}

function park(reason: string) {
  parkedUntil = Date.now() + PARK_MS;
  parkReason = reason;
  logger.warn(`[LIVE-EQ] stream parked for ${PARK_MS / 60_000}m — ${reason}`);
  try { upstream?.close(); } catch { /* ignore */ }
}

function syncSubscriptions() {
  if (!upstream || upstream.readyState !== WebSocket.OPEN || !authed) return;
  const want = new Set(wanted());
  const add = [...want].filter((s) => !subscribedUpstream.has(s));
  const drop = [...subscribedUpstream].filter((s) => !want.has(s));
  if (add.length) upstream.send(JSON.stringify({ action: 'subscribe', trades: add }));
  if (drop.length) upstream.send(JSON.stringify({ action: 'unsubscribe', trades: drop }));
  add.forEach((s) => subscribedUpstream.add(s));
  drop.forEach((s) => subscribedUpstream.delete(s));
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    if (!pending.size) return;
    const batch = [...pending.values()];
    pending.clear();
    clientSymbols.forEach((syms, client) => {
      if (client.readyState !== WebSocket.OPEN) return;
      for (const t of batch) {
        if (!syms.has(t.symbol)) continue;
        client.send(JSON.stringify({ type: 'price', symbol: t.symbol, price: t.price, source: t.source, timestamp: new Date(t.ts).toISOString() }));
      }
    });
  }, FLUSH_MS);
}

function connect() {
  if (upstream || !enabled() || Date.now() < parkedUntil) return;
  if (!wanted().length) return;
  const url = `wss://stream.data.alpaca.markets/v2/${feed}`;
  authed = false;
  subscribedUpstream.clear();
  const ws = new WebSocket(url);
  upstream = ws;

  ws.on('message', (raw) => {
    let msgs: any[];
    try { msgs = JSON.parse(raw.toString()); } catch { return; }
    if (!Array.isArray(msgs)) msgs = [msgs];
    for (const m of msgs) {
      switch (m?.T) {
        case 'success':
          if (m.msg === 'connected') {
            ws.send(JSON.stringify({ action: 'auth', key: process.env.ALPACA_API_KEY, secret: process.env.ALPACA_SECRET_KEY }));
          } else if (m.msg === 'authenticated') {
            authed = true;
            reconnectAttempts = 0;
            logger.info(`[LIVE-EQ] Alpaca ${feed.toUpperCase()} trade stream authenticated`);
            syncSubscriptions();
          }
          break;
        case 't': {
          const symbol = String(m.S || '').toUpperCase();
          const price = Number(m.p);
          const ts = Date.parse(m.t) || Date.now();
          if (!symbol || !(price > 0)) break;
          const tick: EquityTick = { symbol, price, ts, source };
          lastTrade.set(symbol, tick);
          pending.set(symbol, tick);
          scheduleFlush();
          break;
        }
        case 'error': {
          const code = Number(m.code);
          // 402 auth failed · 406 connection limit (another process holds the
          // one allowed stream) · 409 feed not in the plan. None heal by retrying.
          if (code === 402 || code === 406 || code === 409 || code === 401) park(`Alpaca error ${code}: ${m.msg}`);
          else logger.warn(`[LIVE-EQ] Alpaca error ${code}: ${m.msg}`);
          break;
        }
        default:
          break;
      }
    }
  });

  ws.on('close', () => {
    if (upstream === ws) upstream = null;
    authed = false;
    subscribedUpstream.clear();
    if (!wanted().length || Date.now() < parkedUntil || !enabled()) return;
    const delay = Math.min(60_000, 2_000 * 2 ** reconnectAttempts++);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, delay);
  });
  ws.on('error', (err) => {
    logger.warn(`[LIVE-EQ] upstream socket error: ${err instanceof Error ? err.message : String(err)}`);
  });
}

function afterChange() {
  if (wanted().length) {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    if (!upstream) connect(); else syncSubscriptions();
  } else if (upstream && !idleTimer) {
    idleTimer = setTimeout(() => {
      idleTimer = null;
      if (!wanted().length) { try { upstream?.close(); } catch { /* ignore */ } }
    }, IDLE_CLOSE_MS);
  }
}

/** Called by /ws/prices for each client message. Unknown messages are ignored. */
export function handleClientMessage(client: WebSocket, raw: unknown) {
  let msg: any;
  try { msg = JSON.parse(String(raw)); } catch { return; }
  if (!msg || (msg.type !== 'subscribe' && msg.type !== 'unsubscribe')) return;
  const syms: string[] = (Array.isArray(msg.symbols) ? msg.symbols : [])
    .map((s: unknown) => String(s).toUpperCase().trim())
    .filter((s: string) => SYMBOL_RE.test(s))
    .slice(0, 20);
  const set = clientSymbols.get(client) ?? new Set<string>();
  if (msg.type === 'subscribe') syms.forEach((s) => set.add(s));
  else syms.forEach((s) => set.delete(s));
  clientSymbols.set(client, set);
  // Hand the newest known trade straight back so a chart does not wait for the next print.
  if (msg.type === 'subscribe' && client.readyState === WebSocket.OPEN) {
    for (const s of syms) {
      const t = lastTrade.get(s);
      if (t) client.send(JSON.stringify({ type: 'price', symbol: s, price: t.price, source: t.source, timestamp: new Date(t.ts).toISOString() }));
    }
    client.send(JSON.stringify({ type: 'equity-stream', live: liveEquityStatus().streaming, symbols: syms }));
  }
  afterChange();
}

export function handleClientClose(client: WebSocket) {
  if (clientSymbols.delete(client)) afterChange();
}

/** Newest trade for a symbol if it is at most maxAgeMs old. */
export function getLastEquityTrade(symbol: string, maxAgeMs = 15_000): EquityTick | null {
  const t = lastTrade.get(symbol.toUpperCase());
  return t && Date.now() - t.ts <= maxAgeMs ? t : null;
}

export function liveEquityStatus() {
  return {
    enabled: enabled(),
    feed,
    streaming: !!upstream && authed,
    subscribed: [...subscribedUpstream],
    clients: clientSymbols.size,
    parked: Date.now() < parkedUntil ? { until: new Date(parkedUntil).toISOString(), reason: parkReason } : null,
  };
}
