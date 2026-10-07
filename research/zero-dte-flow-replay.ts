/**
 * 0DTE FLOW IGNITION — tiny replay of named sessions on real 1-minute bars. A PROXY, TINY SAMPLE.
 * ==============================================================================================
 * Runs the live rules (server/zero-dte-flow-core.ts) on 2-minute cycles 09:36–11:30 ET
 * over historical Alpaca data. What CAN'T be reconstructed is stated, not faked:
 *
 *   • aggressor side — no historical option quotes. Proxy: a minute's volume counts as
 *     at-ask when the option bar CLOSED in the upper half of its range (≥ (h+l)/2).
 *     The live engine uses the last print vs the quote instead.
 *   • vol > OI — no point-in-time open interest. The leg is NOT applied here.
 *   • GEX walls — no historical chains. The leg is unchecked (as live with no map).
 *   • entry — the next 1-minute bar's HIGH after the trigger cycle (conservative; no quotes).
 *
 * Flow per minute = volume × VWAP × 100 (Alpaca option bar vw, else close).
 * Outcome = evaluateFlowOutcome (+50% / +100% before the stop or 15:30) on the contract's bars.
 * Universe: SPY QQQ IWM + the ten mega caps. Never touches a database.
 *
 * Run: npx tsx research/zero-dte-flow-replay.ts [--days 2026-09-29,2026-09-30]
 *   → research/zero-dte-flow-replay-results.json
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import type { MinuteBar } from '../server/zero-dte-sniper-core';
import {
  FLOW_CFG, INDEX_ETFS, MEGA_CAPS, atmContract, bestFlow, detectUnwind, dominantStrikes, evaluateFlowOutcome, flowLegReason, newFlowMemory,
  planFor, scoreTrigger, structureFor, type ChainRow, type FlowMemory, type OptMin, type Side,
} from '../server/zero-dte-flow-core';

dotenv.config({ path: process.env.ENV_FILE || '/Users/abdulmalik/UnTitld/QuantEdgeee/.env', quiet: true } as any);
const KEY = process.env.ALPACA_API_KEY, SECRET = process.env.ALPACA_SECRET_KEY;
if (!KEY || !SECRET) { console.error('ALPACA_API_KEY / ALPACA_SECRET_KEY missing'); process.exit(1); }
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const DAYS = (arg('--days') ?? '2026-09-29,2026-09-30').split(',');
const SYMS = [...INDEX_ETFS, ...MEGA_CAPS] as string[];
const ROOT = path.join(process.cwd(), '.cache', 'zero-dte-flow-replay');
fs.mkdirSync(ROOT, { recursive: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let last = 0, requests = 0;
async function getJson(url: string): Promise<any> {
  for (let a = 0; a < 6; a++) {
    const w = 350 - (Date.now() - last); if (w > 0) await sleep(w);
    last = Date.now(); requests++;
    const r = await fetch(url, { headers: { 'APCA-API-KEY-ID': KEY!, 'APCA-API-SECRET-KEY': SECRET! } }).catch(() => null);
    if (!r) { await sleep(2000); continue; }
    if (r.status === 429) { await sleep(15_000); continue; }
    if (r.status >= 500) { await sleep(2000); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
    return r.json();
  }
  throw new Error('gave up');
}
const cached = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
  const f = path.join(ROOT, name);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  const v = await fn(); fs.writeFileSync(f, JSON.stringify(v)); return v;
};
const etMin = (ms: number) => { const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ms)); return (Number(p.find((x) => x.type === 'hour')!.value) % 24) * 60 + Number(p.find((x) => x.type === 'minute')!.value); };
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const openMs = (d: string) => Date.parse(`${d}T13:30:00Z`); // EDT sessions only (Sep/Oct)

async function stockDay(d: string): Promise<Record<string, MinuteBar[]>> {
  return cached(`stock-${d}.json`, async () => {
    const out: Record<string, MinuteBar[]> = {};
    let token: string | undefined;
    for (let p = 0; p < 30; p++) {
      const u = new URL('https://data.alpaca.markets/v2/stocks/bars');
      u.searchParams.set('symbols', SYMS.join(',')); u.searchParams.set('timeframe', '1Min'); u.searchParams.set('start', `${d}T13:30:00Z`); u.searchParams.set('end', `${d}T20:00:00Z`);
      u.searchParams.set('limit', '10000'); u.searchParams.set('adjustment', 'split'); u.searchParams.set('feed', 'sip');
      if (token) u.searchParams.set('page_token', token);
      const j = await getJson(u.toString());
      for (const [s, arr] of Object.entries(j.bars ?? {}) as Array<[string, any[]]>) for (const b of arr) { const t = Date.parse(b.t); (out[s] ??= []).push({ t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, vw: b.vw, min: etMin(t) }); }
      token = j.next_page_token || undefined; if (!token) break;
    }
    return out;
  });
}

type C = { occ: string; expiry: string; type: 'call' | 'put'; strike: number };
async function contracts(sym: string, d: string, spot: number): Promise<C[]> {
  return cached(`contracts-${sym}-${d}.json`, async () => {
    const out: C[] = [];
    for (const status of ['inactive', 'active']) {
      let token: string | undefined;
      for (let p = 0; p < 10; p++) {
        const u = new URL('https://paper-api.alpaca.markets/v2/options/contracts');
        u.searchParams.set('underlying_symbols', sym); u.searchParams.set('status', status);
        u.searchParams.set('expiration_date_gte', d); u.searchParams.set('expiration_date_lte', addDays(d, FLOW_CFG.MAX_DTE));
        u.searchParams.set('strike_price_gte', (spot * 0.98).toFixed(2)); u.searchParams.set('strike_price_lte', (spot * 1.02).toFixed(2)); u.searchParams.set('limit', '10000');
        if (token) u.searchParams.set('page_token', token);
        const j = await getJson(u.toString());
        for (const c of j.option_contracts ?? []) if (c.root_symbol === sym) out.push({ occ: c.symbol, expiry: c.expiration_date, type: c.type, strike: Number(c.strike_price) });
        token = j.next_page_token || undefined; if (!token) break;
      }
    }
    return out;
  });
}

type OB = OptMin & { vw: number };
async function optionBars(sym: string, d: string, occs: string[]): Promise<Record<string, OB[]>> {
  return cached(`opt-${sym}-${d}.json`, async () => {
    const out: Record<string, OB[]> = {};
    for (let i = 0; i < occs.length; i += 100) {
      let token: string | undefined;
      for (let p = 0; p < 40; p++) {
        const u = new URL('https://data.alpaca.markets/v1beta1/options/bars');
        u.searchParams.set('symbols', occs.slice(i, i + 100).join(',')); u.searchParams.set('timeframe', '1Min');
        u.searchParams.set('start', `${d}T13:30:00Z`); u.searchParams.set('end', `${d}T19:31:00Z`); u.searchParams.set('limit', '10000');
        if (token) u.searchParams.set('page_token', token);
        const j = await getJson(u.toString());
        for (const [o, arr] of Object.entries(j.bars ?? {}) as Array<[string, any[]]>) for (const b of arr) (out[o] ??= []).push({ t: Date.parse(b.t), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, vw: b.vw ?? b.c });
        token = j.next_page_token || undefined; if (!token) break;
      }
    }
    return out;
  });
}

/** Rebuild the engine's flow memory from 1-min option bars up to `nowMs` (upper-half close = at-ask proxy). */
function memoryAt(ob: Record<string, OB[]>, nowMs: number): FlowMemory {
  const mem = newFlowMemory();
  for (const [occ, arr] of Object.entries(ob)) {
    let net = 0; const slices = []; const hist = [];
    for (const b of arr) {
      if (b.t + 60_000 > nowMs) break;
      const side = b.c >= (b.h + b.l) / 2 ? 'ask' as const : 'bid' as const;
      slices.push({ t: b.t + 60_000, contracts: b.v, premium: b.v * b.vw * 100, side });
      net += side === 'ask' ? b.v : -b.v; hist.push({ t: b.t + 60_000, net });
    }
    mem.slices.set(occ, slices); mem.net.set(occ, hist);
  }
  return mem;
}

interface Trig { day: string; sym: string; kind: 'ignition' | 'unwind'; side: Side; atEt: string; occ: string; flowAggr: number | null; relSize: number | null; score: number | null; entry: number; stop: number; result: string; maxMult: number | null; minutesTo50: number | null; note: string }

async function main() {
  const trigs: Trig[] = []; const near: Array<{ day: string; sym: string; side: Side; reason: string }> = [];
  for (const d of DAYS) {
    const stock = await stockDay(d);
    for (const sym of SYMS) {
      const sb = stock[sym] ?? [];
      if (sb.length < 30) { console.log(`${d} ${sym}: no bars`); continue; }
      const cs = await contracts(sym, d, sb[0].o);
      if (!cs.length) { console.log(`${d} ${sym}: no 0–2 DTE contracts`); continue; }
      const ob = await optionBars(sym, d, cs.map((c) => c.occ));
      const fired = new Set<string>();
      for (let m = FLOW_CFG.START_MIN + 1; m <= FLOW_CFG.END_MIN; m += 2) {
        const now = openMs(d) + (m - 570) * 60_000;
        const bars = sb.filter((b) => b.t + 60_000 <= now && b.min >= 570);
        if (!bars.length) continue;
        const spot = bars[bars.length - 1].c;
        const mem = memoryAt(ob, now);
        const rows: ChainRow[] = cs.map((c) => {
          const upTo = (ob[c.occ] ?? []).filter((b) => b.t + 60_000 <= now);
          return { occ: c.occ, strike: c.strike, type: c.type, expiration: c.expiry, volume: upTo.reduce((a, b) => a + b.v, 0), bid: null, ask: null, last: upTo[upTo.length - 1]?.c ?? null, quoteTime: null, openInterest: null, delta: null };
        });
        for (const side of ['long', 'short'] as Side[]) {
          if (fired.has(side)) continue;
          const f = bestFlow(mem, rows, sym, spot, side, d, now);
          const why = flowLegReason(f && { ...f, volOverOi: true }); // vol > OI not testable historically
          if (why) continue;
          const st = structureFor(bars, side);
          if (!st.ok) { near.push({ day: d, sym, side, reason: st.reason ?? '' }); continue; }
          fired.add(side);
          const after = (ob[f!.occ] ?? []).filter((b) => b.t >= now);
          const nb = after[0];
          if (!nb) { trigs.push({ day: d, sym, kind: 'ignition', side, atEt: `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`, occ: f!.occ, flowAggr: f!.aggressive, relSize: f!.relSize, score: null, entry: NaN, stop: NaN, result: 'no_fill', maxMult: null, minutesTo50: null, note: 'no option bar after the trigger' }); continue; }
          const entry = nb.h; // conservative: next bar high
          const plan = planFor(side, spot, entry, null, st, null);
          const o = evaluateFlowOutcome({ entry, side, stopUnderlying: plan.stopUnderlying, entryAt: nb.t + 60_000, timeStopAt: openMs(d) + (FLOW_CFG.TIME_STOP_MIN - 570) * 60_000 }, after.slice(1), sb);
          trigs.push({ day: d, sym, kind: 'ignition', side, atEt: `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`, occ: f!.occ, flowAggr: f!.aggressive, relSize: f!.relSize, score: scoreTrigger(f!, st, side), entry, stop: plan.stopUnderlying, result: o.result, maxMult: o.maxMult, minutesTo50: o.minutesTo50, note: `stop ${plan.stopBasis}` });
        }
        if (sym === 'SPY') {
          const dom = dominantStrikes(rows, spot, d);
          for (const c of [dom.call, dom.put]) {
            if (!c || fired.has(`unwind${c.occ}`)) continue;
            const sig = detectUnwind(mem.net.get(c.occ) ?? [], c, bars, now);
            if (!sig) continue;
            fired.add(`unwind${c.occ}`);
            const atm = atmContract(rows, spot, sig.side === 'long' ? 'call' : 'put', d);
            const after = atm ? (ob[atm.occ] ?? []).filter((b) => b.t >= now) : [];
            if (!atm || !after.length) continue;
            const entry = after[0].h;
            const o = evaluateFlowOutcome({ entry, side: sig.side, stopUnderlying: sig.strike, entryAt: after[0].t + 60_000, timeStopAt: openMs(d) + (FLOW_CFG.TIME_STOP_MIN - 570) * 60_000 }, after.slice(1), sb);
            trigs.push({ day: d, sym, kind: 'unwind', side: sig.side, atEt: `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`, occ: atm.occ, flowAggr: null, relSize: null, score: null, entry, stop: sig.strike, result: o.result, maxMult: o.maxMult, minutesTo50: o.minutesTo50, note: sig.text });
          }
        }
      }
    }
  }
  const n = trigs.filter((t) => t.result !== 'no_fill' && t.result !== 'no_data');
  const sum = {
    days: DAYS, requests, triggers: trigs.length, evaluated: n.length,
    reached50: n.filter((t) => t.result === 'reached_50' || t.result === 'reached_100').length,
    reached100: n.filter((t) => t.result === 'reached_100').length,
    stopped: n.filter((t) => t.result === 'stopped').length, timeStop: n.filter((t) => t.result === 'time_stop').length,
    nearMissesStructure: near.length,
    caveats: 'TINY SAMPLE (2 sessions). Aggressor side = upper-half-close proxy; vol>OI and GEX-wall legs not applied; entry = next 1-min bar high. Not evidence of an edge.',
  };
  fs.writeFileSync(path.join(process.cwd(), 'research', 'zero-dte-flow-replay-results.json'), JSON.stringify({ summary: sum, triggers: trigs }, null, 2));
  console.log(JSON.stringify(sum, null, 2));
  for (const t of trigs) console.log(`${t.day} ${t.atEt} ${t.sym.padEnd(5)} ${t.kind.padEnd(8)} ${t.side.padEnd(5)} ${t.occ.padEnd(22)} aggr ${t.flowAggr != null ? `$${Math.round(t.flowAggr / 1000)}K` : '—'} rel ${t.relSize ?? '—'} entry ${Number.isFinite(t.entry) ? t.entry.toFixed(2) : '—'} → ${t.result} max ${t.maxMult ?? '—'}× ${t.minutesTo50 != null ? `(+50% in ${t.minutesTo50}m)` : ''}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
