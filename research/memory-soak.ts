/**
 * MEMORY SOAK — retained heap of the hot caches, before vs after the caps.
 *
 *   NODE_OPTIONS=--expose-gc npx tsx research/memory-soak.ts [symbols=200]
 *
 * No DB, no network. It fills each cache the way a market-open burst does
 * (every symbol the scanners, charts and GEX recorder touch) with synthetic
 * payloads shaped like the real ones, and measures retained heap after a full
 * GC:
 *
 *   BEFORE  the old structure and cap (plain Map; Alpaca 400 chains, CBOE 300
 *           chains with a duplicated near-money slice and a per-contract ISO
 *           string, 800 Yahoo chart payloads).
 *   AFTER   server/lib/bounded-cache.ts with the exact options used in prod code.
 *
 * Plus the Bullflow persisted-prints read: whole-file readFile+split vs the
 * streaming date-filtered reader, on a synthetic JSONL of the same line shape.
 *
 * Sizes are synthetic (chain sizes follow a realistic mix: a few 8k-contract
 * index/mega-cap chains, most names 300–2,000 contracts), so read the numbers
 * as order-of-magnitude, which is what a budget needs.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';
import { BoundedCache, approxBytes } from '../server/lib/bounded-cache';

const N = Number(process.argv[2]) || 200;
const gc = (globalThis as any).gc as (() => void) | undefined;
if (!gc) { console.error('run with NODE_OPTIONS=--expose-gc'); process.exit(1); }
const MB = (n: number) => (n / 1024 / 1024).toFixed(1);
function heap(): number { gc!(); gc!(); return process.memoryUsage().heapUsed; }

function chainSize(i: number): number {
  if (i < 6) return 8000;          // SPY/QQQ/SPX/IWM/TSLA/NVDA-class
  if (i < 40) return 2000;
  return 300 + ((i * 37) % 900);
}
const sym = (i: number) => `S${String(i).padStart(3, '0')}`;

// ── Alpaca-shaped contract (server/alpaca-options.ts AlpacaOptionContract) ──
function alpacaChain(s: string, n: number) {
  const contracts = [];
  for (let k = 0; k < n; k++) {
    const exp = `2026-${String(10 + (k % 3)).padStart(2, '0')}-${String(1 + (k % 28)).padStart(2, '0')}`;
    contracts.push({
      occ: `${s}${exp.replace(/-/g, '').slice(2)}${k % 2 ? 'C' : 'P'}${String(100000 + k * 500).padStart(8, '0')}`,
      underlying: s, expiration: `${exp}`, strike: 100 + k * 0.5, type: k % 2 ? 'call' : 'put',
      gamma: Math.random() / 100, delta: Math.random(), vega: Math.random(), theta: -Math.random(),
      iv: 0.2 + Math.random() / 5, volume: k * 3, bid: 1 + Math.random(), ask: 1.1 + Math.random(), last: 1.05,
      lastTime: new Date().toISOString(), quoteTime: new Date().toISOString(), greekSource: 'provider',
      openInterest: k * 7, openInterestDate: '2026-09-29', closePrice: 1.02,
    });
  }
  return { underlying: s, contracts, expirations: ['a', 'b', 'c'], spot: 100, fetchedAt: Date.now() };
}

// ── CBOE-shaped Tradier-compatible row (server/cboe-options-fallback.ts) ──
function cboeRow(s: string, k: number, iso: string) {
  return {
    symbol: `${s}261016C${String(100000 + k * 500).padStart(8, '0')}`, description: `${s} 2026-10-16 ${100 + k} call`,
    exch: 'CBOE', type: 'call', last: 1, change: 0, volume: k, open: 1, high: 1, low: 1, close: 1, bid: 1, ask: 1.1,
    underlying: s, strike: 100 + k,
    greeks: { delta: 0.5, gamma: 0.01, theta: -0.1, vega: 0.2, rho: 0, phi: 0, bid_iv: 0.3, mid_iv: 0.3, ask_iv: 0.3, smv_vol: 0.3, updated_at: iso },
    change_percentage: 0, average_volume: k, last_volume: k, trade_date: Date.now(), prevclose: 1, week_52_high: 0, week_52_low: 0,
    bidsize: 1, bidexch: 'CBOE', bid_date: Date.now(), asksize: 1, askexch: 'CBOE', ask_date: Date.now(), open_interest: k,
    contract_size: 100, expiration_date: '2026-10-16', expiration_type: 'standard', option_type: 'call', root_symbol: s,
  };
}
function cboeChainOld(s: string, n: number) {
  const allOptions = []; const options = [];
  for (let k = 0; k < n; k++) allOptions.push(cboeRow(s, k, new Date().toISOString()));
  for (let k = 0; k < n; k++) if (k % 3 === 0) options.push(cboeRow(s, k, new Date().toISOString())); // second copy of the slice
  return { options, allOptions, spotPrice: 100, expirations: ['2026-10-16'], source: 'cboe' };
}
function cboeChainNew(s: string, n: number) {
  const iso = new Date().toISOString();
  const allOptions = []; for (let k = 0; k < n; k++) allOptions.push(cboeRow(s, k, iso));
  const options = allOptions.filter((_, k) => k % 3 === 0);
  return { options, allOptions, spotPrice: 100, expirations: ['2026-10-16'], source: 'cboe' };
}

// ── Yahoo chart payload (server/historical-candles.ts) ──
function yahooPayload(bars: number) {
  const quotes = [];
  for (let i = 0; i < bars; i++) quotes.push({ date: new Date(Date.now() - i * 60_000), open: 1, high: 1, low: 1, close: 1, volume: 1000, adjclose: 1 });
  return { quotes, meta: { regularMarketPrice: 1, regularMarketTime: 1 } };
}

function run(label: string, fill: () => unknown): number {
  const h0 = heap();
  const t0 = Date.now();
  const keep = fill();
  const h1 = heap();
  (globalThis as any).__keep = keep;
  const delta = h1 - h0;
  console.log(`  ${label.padEnd(58)} ${MB(delta).padStart(8)} MB retained  (${Date.now() - t0} ms)`);
  (globalThis as any).__keep = null;
  heap();
  return delta;
}

async function main() {
  console.log(`memory-soak — ${N} symbols, node ${process.version}, ${os.cpus().length} cpu\n`);
  const rows: Array<[string, number, number, number]> = [];

  console.log('Alpaca option chains');
  const aB = run(`before: Map, cap 400 (all ${N} kept)`, () => {
    const m = new Map<string, any>();
    for (let i = 0; i < N; i++) { m.set(`${sym(i)}|180|0.4`, { expiresAt: 0, chain: alpacaChain(sym(i), chainSize(i)) }); if (m.size > 400) m.delete(m.keys().next().value!); }
    return m;
  });
  const aA = run('after: BoundedCache 40 / 96 MB', () => {
    const m = new BoundedCache<string, any>({ name: 'soak.alpaca', maxEntries: 40, ttlMs: 20 * 60_000, maxBytes: 96 * 1024 * 1024, sizeOf: (v) => 2048 + v.chain.contracts.length * 520 });
    for (let i = 0; i < N; i++) m.set(`${sym(i)}|180|0.4`, { expiresAt: 0, chain: alpacaChain(sym(i), chainSize(i)) });
    return m;
  });
  const aW = run('after, worst case (biggest chains are the hot ones)', () => {
    const m = new BoundedCache<string, any>({ name: 'soak.alpaca.worst', maxEntries: 40, ttlMs: 20 * 60_000, maxBytes: 96 * 1024 * 1024, sizeOf: (v) => 2048 + v.chain.contracts.length * 520 });
    for (let i = N - 1; i >= 0; i--) m.set(`${sym(i)}|180|0.4`, { expiresAt: 0, chain: alpacaChain(sym(i), chainSize(i)) });
    return m;
  });
  rows.push(['alpaca chains', aB, aA, aW]);

  console.log('CBOE option chains');
  const cB = run(`before: Map, cap 300, duplicated slice (all ${N} kept)`, () => {
    const m = new Map<string, any>();
    for (let i = 0; i < N; i++) m.set(sym(i), { data: cboeChainOld(sym(i), chainSize(i)), expiresAt: 0 });
    return m;
  });
  const cA = run('after: BoundedCache 40 / 96 MB, shared rows', () => {
    const m = new BoundedCache<string, any>({ name: 'soak.cboe', maxEntries: 40, ttlMs: 5 * 60_000, maxBytes: 96 * 1024 * 1024, sizeOf: (v) => (v.data ? 4096 + v.data.allOptions.length * 900 + v.data.options.length * 16 : 64) });
    for (let i = 0; i < N; i++) m.set(sym(i), { data: cboeChainNew(sym(i), chainSize(i)), expiresAt: 0 });
    return m;
  });
  const cW = run('after, worst case (biggest chains are the hot ones)', () => {
    const m = new BoundedCache<string, any>({ name: 'soak.cboe.worst', maxEntries: 40, ttlMs: 5 * 60_000, maxBytes: 96 * 1024 * 1024, sizeOf: (v) => (v.data ? 4096 + v.data.allOptions.length * 900 + v.data.options.length * 16 : 64) });
    for (let i = N - 1; i >= 0; i--) m.set(sym(i), { data: cboeChainNew(sym(i), chainSize(i)), expiresAt: 0 });
    return m;
  });
  rows.push(['cboe chains', cB, cA, cW]);

  console.log('Yahoo candle payloads (1d/6mo 125 bars, 5m/5d 960 bars, 1m/1d 960 bars per symbol)');
  const fillCandles = (m: Map<string, any>) => {
    for (let i = 0; i < N; i++) {
      m.set(`yahoo:chart:${sym(i)}:6mo:1d`, { data: yahooPayload(125), expiresAt: Date.now() });
      m.set(`yahoo:chart:${sym(i)}:5d:5m`, { data: yahooPayload(960), expiresAt: Date.now() });
      m.set(`yahoo:chart:${sym(i)}:1d:1m`, { data: yahooPayload(960), expiresAt: Date.now() });
    }
    return m;
  };
  const yB = run(`before: Map, cap 800 (${Math.min(800, N * 3)} kept)`, () => {
    const m = new Map<string, any>(); fillCandles(m);
    while (m.size > 800) m.delete(m.keys().next().value!);
    return m;
  });
  const yA = run('after: BoundedCache 400 / 64 MB', () => fillCandles(new BoundedCache<string, any>({ name: 'soak.yahoo', maxEntries: 400, maxBytes: 64 * 1024 * 1024, sizeOf: (e) => approxBytes(e.data) })));
  rows.push(['yahoo candles', yB, yA, yA]);

  // ── Bullflow persisted prints: whole-file vs streaming ──
  console.log('Bullflow persisted-prints read (synthetic 60 sessions × 3,000 prints)');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'soak-'));
  const file = path.join(dir, 'bullflow-prints.jsonl');
  const w = fs.createWriteStream(file);
  const day0 = Date.parse('2026-07-01T14:00:00Z');
  for (let d = 0; d < 60; d++) for (let k = 0; k < 3000; k++) {
    w.write(JSON.stringify({ id: `${d}-${k}`, ticker: 'SPY', side: 'call', strike: 500, expiry: '2026-10-16', alertType: 'algo', premium: 250000, fillPrice: 2.5, contracts: 1000, at: new Date(day0 + d * 86_400_000 + k * 7_000).toISOString() }) + '\n');
  }
  await new Promise((r) => w.end(r));
  const want = new Date(day0 + 59 * 86_400_000).toISOString().slice(0, 10);
  console.log(`  file ${MB(fs.statSync(file).size)} MB`);
  const sample = (fn: () => Promise<number>) => async () => {
    heap();
    let peak = process.memoryUsage().heapUsed; const base = peak;
    const iv = setInterval(() => { peak = Math.max(peak, process.memoryUsage().heapUsed); }, 1);
    const t0 = Date.now();
    const n = await fn();
    peak = Math.max(peak, process.memoryUsage().heapUsed);
    clearInterval(iv);
    return { n, peak: peak - base, ms: Date.now() - t0 };
  };
  const old = await sample(async () => {
    const raw = await fs.promises.readFile(file, 'utf8');
    let n = 0;
    for (const line of raw.split('\n')) { if (!line.trim()) continue; const p = JSON.parse(line); if (p.at.slice(0, 10) === want) n++; }
    return n;
  })();
  const neu = await sample(async () => {
    const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
    let n = 0; const key = `"at":"${want}`;
    for await (const line of rl) { if (!line || !line.includes(key)) continue; JSON.parse(line); n++; }
    return n;
  })();
  console.log(`  before: readFile+split+parse all   peak +${MB(old.peak)} MB heap, ${old.ms} ms, ${old.n} prints`);
  console.log(`  after:  stream + date prefilter     peak +${MB(neu.peak)} MB heap, ${neu.ms} ms, ${neu.n} prints`);
  fs.rmSync(dir, { recursive: true, force: true });

  console.log('\nSummary (retained heap, MB)');
  let tb = 0; let ta = 0; let tw = 0;
  for (const [n, b, a, wc] of rows) { tb += b; ta += a; tw += wc; console.log(`  ${n.padEnd(16)} before ${MB(b).padStart(7)}   after ${MB(a).padStart(7)}   after-worst ${MB(wc).padStart(7)}`); }
  console.log(`  ${'total'.padEnd(16)} before ${MB(tb).padStart(7)}   after ${MB(ta).padStart(7)}   after-worst ${MB(tw).padStart(7)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
