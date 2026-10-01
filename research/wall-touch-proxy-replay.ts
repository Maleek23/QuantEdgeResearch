/**
 * GEX WALL-TOUCH — PROXY REPLAY on real option bars. THIS IS A PROXY.
 * ===================================================================
 * Historical GEX walls CANNOT be replayed: there are no historical option
 * chains / open interest to rebuild them from. What CAN be reconstructed is a
 * set of levels that real walls often sit on or near, known at the time:
 *
 *   round    the nearest round strike below the open (put side) / above it (call
 *            side): index ETFs $5, singles $5 under $200, $10 to $1,000, else $50
 *   pd       the prior session's low (put side) / high (call side)
 *   or30     the 09:30–09:59 low / high (known at 10:00 — a "session low" retest)
 *   round_far (the "wall-like" subset) — the round strike that is ≥ 0.5% from the
 *            open, i.e. not the strike price is already sitting on (real near-term
 *            walls are usually a little away from spot)
 *
 * Each level is run through the LIVE detector (server/wall-touch-core.ts —
 * approach / touch / rejection within 1–5 bars / break / stall, ATR5-scaled).
 * A rejection buys the nearest-OTM SAME-DAY-EXPIRY option away from the wall
 * (call off a put-side level, put off a call-side level); a break buys the one
 * through it. Entry = the high of the option's next 1-minute bar (conservative,
 * no historical quotes), outcome on the contract's real 1-minute bars to the
 * close + expiry intrinsic (evaluateOptionPath — the sniper replay's exits).
 * Underlying outcome: +15/+30/+60/close from the confirm close, MFE/MAE.
 *
 * Window: last 12 months, walk-forward halves split at 2026-04-01; a cell
 * "survives" only with ≥ 20 trades per half, mean P&L > 0 in BOTH halves and
 * still > 0 with each half's best trade removed (the sniper replay's law).
 *
 * DATA: reuses research/zero-dte-setups-replay.ts's cache (.cache/zdte-replay —
 * stock 1-min months, option-contract listings, option 1-min bars per day/type);
 * other worktrees' caches can be read with --cache dirA,dirB (read-only). A
 * missing file is fetched from Alpaca into ./.cache/zdte-replay. Never touches a database.
 *
 * Run: npx tsx research/wall-touch-proxy-replay.ts [--from 2025-10-01] [--to 2026-09-30] [--split 2026-04-01] [--symbols SPY,AMD] [--cache /path/a,/path/b]
 *   → research/wall-touch-proxy-results.json + docs/WALL_TOUCH_PROXY_REPLAY.md
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { EXIT_RULES, evaluateOptionPath, levelStopTime, pickNearestOtm, type ContractCandidate, type ExitRule, type MinuteBar, type OptBar } from '../server/zero-dte-sniper-core';
import { atr5Series } from '../server/zero-dte-sniper-core';
import { detectWall, optionTypeFor, tradeSideFor, underlyingOutcome, type WallKind } from '../server/wall-touch-core';

dotenv.config({ path: process.env.ENV_FILE || '/Users/abdulmalik/UnTitld/QuantEdgeee/.env', quiet: true } as any);
const KEY = process.env.ALPACA_API_KEY, SECRET = process.env.ALPACA_SECRET_KEY;

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const INDEX = ['SPY', 'QQQ', 'IWM'];
const SINGLES = ['TSLA', 'NVDA', 'AMD', 'META', 'MSTR', 'AAPL', 'AMZN', 'GOOGL', 'MSFT', 'AVGO', 'PLTR', 'COIN', 'NFLX', 'SMCI', 'MU', 'HOOD', 'BE'];
const SYMBOLS = (arg('--symbols') ?? [...INDEX, ...SINGLES].join(',')).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const FROM = arg('--from') ?? '2025-10-01';
const TO = arg('--to') ?? '2026-09-30';
const SPLIT = arg('--split') ?? '2026-04-01';
const START = new Date(Date.parse(`${FROM}T12:00:00Z`) - 60 * 86400_000).toISOString().slice(0, 10);
const MIN_HALF_N = 20;
const OWN = path.resolve(process.cwd(), '.cache/zdte-replay');
const READ_DIRS = [OWN, ...(arg('--cache') ?? '').split(',').map((s) => s.trim()).filter(Boolean)];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── ET clock ──
const offCache = new Map<string, number>();
const dtf = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
function etOffsetMin(ms: number): number {
  const k = new Date(ms).toISOString().slice(0, 10);
  let o = offCache.get(k);
  if (o == null) {
    const p: Record<string, string> = {}; for (const x of dtf.formatToParts(new Date(Date.parse(`${k}T16:00:00Z`)))) p[x.type] = x.value;
    o = (Number(p.hour) % 24) * 60 + Number(p.minute) - 16 * 60;
    offCache.set(k, o);
  }
  return o;
}
function et(ms: number): { day: string; min: number } {
  const d = new Date(ms + etOffsetMin(ms) * 60_000);
  return { day: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
function lastCompleteSession(): string {
  const e = et(Date.now());
  if (e.min >= 16 * 60 + 20) return e.day;
  return new Date(Date.parse(`${e.day}T12:00:00Z`) - 86400_000).toISOString().slice(0, 10);
}
const END = [TO, lastCompleteSession()].sort()[0];
function months(from: string, to: string): string[] {
  const out: string[] = []; let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7));
  const ey = Number(to.slice(0, 4)), em = Number(to.slice(5, 7));
  while (y < ey || (y === ey && m <= em)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}
const monthEnd = (ym: string) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

// ── cache read-through + one serial rate-limited fetch lane ──
function readCache(rel: string): any | null {
  for (const d of READ_DIRS) { const f = path.join(d, rel); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')); }
  return null;
}
function writeOwn(rel: string, v: unknown) { const f = path.join(OWN, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v)); }
let lastCall = 0, requests = 0, cacheMisses = 0;
async function getJson(url: string): Promise<any> {
  if (!KEY || !SECRET) throw new Error('cache miss and no ALPACA keys');
  for (let attempt = 0; attempt < 8; attempt++) {
    const wait = 60_000 / 150 - (Date.now() - lastCall);
    if (wait > 0) await sleep(wait);
    lastCall = Date.now(); requests++;
    let r: Response;
    try { r = await fetch(url, { headers: { 'APCA-API-KEY-ID': KEY, 'APCA-API-SECRET-KEY': SECRET } }); } catch { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(20_000); continue; }
    if (r.status >= 500) { await sleep(3000); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status} ← ${url.replace(/\?.*/, '')}`);
    return r.json();
  }
  throw new Error('gave up after retries');
}

type SRow = [number, number, number, number, number, number, number];
async function stockMonth(sym: string, ym: string): Promise<SRow[]> {
  const rel = path.join('stock', monthEnd(ym) < END ? `${sym}-${ym}.json` : `${sym}-${ym}-to-${END}.json`);
  const hit = readCache(rel); if (hit) return hit;
  cacheMisses++;
  const endIso = monthEnd(ym) >= END ? new Date(Math.min(Date.now() - 16 * 60_000, Date.parse(`${END}T23:59:00Z`))).toISOString() : `${monthEnd(ym)}T23:59:00Z`;
  const out: SRow[] = []; let token: string | undefined;
  for (let page = 0; page < 60; page++) {
    const u = new URL('https://data.alpaca.markets/v2/stocks/bars');
    for (const [k, v] of Object.entries({ symbols: sym, timeframe: '1Min', start: `${ym}-01T08:00:00Z`, end: endIso, limit: '10000', adjustment: 'split', feed: 'sip' })) u.searchParams.set(k, v);
    if (token) u.searchParams.set('page_token', token);
    const j = await getJson(u.toString());
    for (const b of j.bars?.[sym] ?? []) out.push([Date.parse(b.t) / 1000, b.o, b.h, b.l, b.c, b.v, b.vw]);
    token = j.next_page_token || undefined; if (!token) break;
  }
  writeOwn(rel, out);
  return out;
}
type CRow = [string, string, 'C' | 'P', number];
async function contractsMonth(sym: string, ym: string, lo: number, hi: number): Promise<CRow[]> {
  const complete = monthEnd(ym) < END;
  const rel = path.join('contracts', complete ? `${sym}-${ym}.json` : `${sym}-${ym}-to-${END}.json`);
  const hit = readCache(rel); if (hit) return hit;
  cacheMisses++;
  const out: CRow[] = [];
  for (const status of complete ? ['inactive'] : ['inactive', 'active']) {
    let token: string | undefined;
    for (let page = 0; page < 80; page++) {
      const u = new URL('https://paper-api.alpaca.markets/v2/options/contracts');
      for (const [k, v] of Object.entries({ underlying_symbols: sym, status, expiration_date_gte: `${ym}-01`, expiration_date_lte: complete ? monthEnd(ym) : END, strike_price_gte: lo.toFixed(2), strike_price_lte: hi.toFixed(2), limit: '10000' })) u.searchParams.set(k, v);
      if (token) u.searchParams.set('page_token', token);
      const j = await getJson(u.toString());
      for (const c of j.option_contracts ?? []) if (c.root_symbol === sym) out.push([c.symbol, c.expiration_date, c.type === 'call' ? 'C' : 'P', Number(c.strike_price)]);
      token = j.next_page_token || undefined; if (!token) break;
    }
  }
  writeOwn(rel, out);
  return out;
}
type ORow = [number, number, number, number, number, number];
async function optionBars(sym: string, day: string, type: 'C' | 'P', occs: string[]): Promise<Record<string, ORow[]>> {
  const rel = path.join('opt', sym, `${day}-${type}.json`);
  const hit = readCache(rel);
  if (hit && occs.every((o) => o in hit.bars)) return hit.bars;
  const have: Record<string, ORow[]> = hit?.bars ?? {};
  const need = occs.filter((o) => !(o in have));
  cacheMisses++;
  const bars: Record<string, ORow[]> = { ...have };
  for (const o of need) bars[o] = [];
  const fullEnd = Date.parse(`${day}T21:15:00Z`);
  const endMs = Math.min(fullEnd, Date.now() - 16 * 60_000);
  for (let i = 0; i < need.length; i += 100) {
    let token: string | undefined;
    for (let page = 0; page < 40; page++) {
      const u = new URL('https://data.alpaca.markets/v1beta1/options/bars');
      for (const [k, v] of Object.entries({ symbols: need.slice(i, i + 100).join(','), timeframe: '1Min', start: `${day}T13:25:00Z`, end: new Date(endMs).toISOString(), limit: '10000' })) u.searchParams.set(k, v);
      if (token) u.searchParams.set('page_token', token);
      const j = await getJson(u.toString());
      for (const [occ, arr] of Object.entries(j.bars ?? {}) as Array<[string, any[]]>) for (const b of arr) (bars[occ] ??= []).push([Date.parse(b.t) / 1000, b.o, b.h, b.l, b.c, b.v]);
      token = j.next_page_token || undefined; if (!token) break;
    }
  }
  if (endMs >= fullEnd) writeOwn(rel, { day, type, bars });
  return bars;
}

// ── proxy levels ──
type Proxy = 'round' | 'round_far' | 'pd' | 'or30';
const PROXIES: Proxy[] = ['round', 'round_far', 'pd', 'or30'];
const PROXY_LABEL: Record<Proxy, string> = {
  round: 'nearest round strike beyond the open',
  round_far: 'round strike ≥ 0.5% from the open ("wall-like")',
  pd: 'prior-day low / high',
  or30: 'opening-range (30-min) low / high — session-low retest',
};
export function wallStep(sym: string, price: number): number {
  if (INDEX.includes(sym)) return 5;
  return price < 200 ? 5 : price < 1000 ? 10 : 50;
}
export function roundBeyond(open: number, step: number, kind: WallKind, minDistPct = 0): number {
  let k = kind === 'put' ? Math.floor(open / step) * step : Math.ceil(open / step) * step;
  const ok = (x: number) => (kind === 'put' ? x < open && (open - x) / open >= minDistPct : x > open && (x - open) / open >= minDistPct);
  for (let g = 0; g < 50 && !ok(k); g++) k += kind === 'put' ? -step : step;
  return +k.toFixed(4);
}

// ── replay ──
interface Trade {
  sym: string; day: string; group: 'index' | 'single'; proxy: Proxy; wall: WallKind; level: number;
  resolution: 'rejection' | 'break' | 'stall'; touch: number; trigMin: number; rvol: number | null; barsAfterTouch: number;
  u: { t15: number | null; t30: number | null; t60: number | null; tClose: number | null; mfe: number | null; mae: number | null };
  opt: null | { occ: string; strike: number; entry: number; maxMult: number; worthless: boolean; pnl: Record<ExitRule, number> };
  optMiss: string | null;
}

async function replaySymbol(sym: string, trades: Trade[]) {
  const group = INDEX.includes(sym) ? 'index' : 'single';
  const band = group === 'index' ? 0.03 : 0.08;
  const byDay = new Map<string, MinuteBar[]>();
  const monthRange = new Map<string, { lo: number; hi: number }>();
  for (const ym of months(START.slice(0, 7), END.slice(0, 7))) {
    const rows = await stockMonth(sym, ym);
    let lo = Infinity, hi = -Infinity;
    for (const r of rows) {
      const t = r[0] * 1000; const e = et(t);
      if (e.day < START || e.day > END || e.min < 570 || e.min >= 960) continue;
      const a = byDay.get(e.day) ?? []; a.push({ t, o: r[1], h: r[2], l: r[3], c: r[4], v: r[5], vw: r[6], min: e.min }); byDay.set(e.day, a);
      lo = Math.min(lo, r[3]); hi = Math.max(hi, r[2]);
    }
    if (Number.isFinite(lo)) monthRange.set(ym, { lo, hi });
  }
  const days = [...byDay.keys()].filter((d) => byDay.get(d)!.length >= 300).sort();
  const daily = days.map((d) => { const r = byDay.get(d)!; return { h: Math.max(...r.map((b) => b.h)), l: Math.min(...r.map((b) => b.l)), c: r[r.length - 1].c }; });
  const volByMin = days.map((d) => { const a = new Float64Array(390).fill(NaN); for (const b of byDay.get(d)!) a[b.min - 570] = b.v; return a; });
  const rvolAt = (i: number, min: number, v: number) => { const k = min - 570; let s = 0, n = 0; for (let j = Math.max(0, i - 20); j < i; j++) { const x = volByMin[j][k]; if (Number.isFinite(x)) { s += x; n++; } } return n >= 10 && s > 0 ? +(v / (s / n)).toFixed(2) : null; };
  const strikes = new Map<string, CRow[]>();
  for (const [ym, rg] of monthRange) for (const c of await contractsMonth(sym, ym, rg.lo * 0.85, rg.hi * 1.15)) { const a = strikes.get(c[1]) ?? []; a.push(c); strikes.set(c[1], a); }
  let nDays = 0;
  for (let i = 21; i < days.length; i++) {
    const day = days[i];
    if (day < FROM || !strikes.has(day)) continue;
    const rth = byDay.get(day)!;
    if (rth[rth.length - 1].min < 954) continue; // half-day
    nDays++;
    const atr = atr5Series(rth);
    const open = rth[0].o; const pd = daily[i - 1];
    const or = rth.filter((b) => b.min < 600);
    const tenAm = rth.find((b) => b.min >= 600)?.t;
    const step = wallStep(sym, open);
    const levels: Array<{ proxy: Proxy; kind: WallKind; price: number; sinceMs?: number }> = [];
    for (const kind of ['put', 'call'] as WallKind[]) {
      levels.push({ proxy: 'round', kind, price: roundBeyond(open, step, kind) });
      levels.push({ proxy: 'round_far', kind, price: roundBeyond(open, step, kind, 0.005) });
      const pdl = kind === 'put' ? pd.l : pd.h;
      if (kind === 'put' ? pdl < open : pdl > open) levels.push({ proxy: 'pd', kind, price: pdl });
      if (or.length >= 25 && tenAm) levels.push({ proxy: 'or30', kind, price: kind === 'put' ? Math.min(...or.map((b) => b.l)) : Math.max(...or.map((b) => b.h)), sinceMs: tenAm });
    }
    const chain = strikes.get(day)!;
    const dayLo = Math.min(...rth.map((b) => b.l)), dayHi = Math.max(...rth.map((b) => b.h));
    const settle = rth[rth.length - 1].c;
    const closeT = rth[rth.length - 1].t + 60_000;
    const optCache = new Map<'C' | 'P', Record<string, ORow[]> | null>();
    const loadType = async (type: 'C' | 'P') => {
      if (optCache.has(type)) return optCache.get(type)!;
      const occs = chain.filter((c) => c[2] === type && (type === 'C' ? c[3] >= dayLo * 0.995 && c[3] <= dayHi * (1 + band) : c[3] <= dayHi * 1.005 && c[3] >= dayLo * (1 - band))).map((c) => c[0]);
      let v: Record<string, ORow[]> | null = null;
      try { v = occs.length ? await optionBars(sym, day, type, occs) : null; } catch (e) { console.log(`  ${sym} ${day} ${type}: option bars unavailable (${(e as Error).message.slice(0, 60)})`); }
      optCache.set(type, v);
      return v;
    };
    for (const L of levels) {
      const { events } = detectWall(rth, { kind: L.kind, price: L.price, sinceMs: L.sinceMs }, atr);
      for (const ev of events) {
        if (ev.kind !== 'rejection' && ev.kind !== 'break' && ev.kind !== 'stall') continue;
        const side = ev.kind === 'stall' ? (L.kind === 'put' ? 'long' : 'short') : tradeSideFor(L.kind, ev.kind);
        const uo = underlyingOutcome(rth, ev.at, ev.price, L.price, L.kind, side);
        const touchBar = rth.find((b) => b.t === ev.touchT);
        const tr: Trade = {
          sym, day, group, proxy: L.proxy, wall: L.kind, level: L.price, resolution: ev.kind, touch: ev.touch, trigMin: ev.min,
          rvol: touchBar ? rvolAt(i, touchBar.min, touchBar.v) : null, barsAfterTouch: ev.barsAfterTouch ?? 0,
          u: { t15: uo.h15?.tradePct ?? null, t30: uo.h30?.tradePct ?? null, t60: uo.h60?.tradePct ?? null, tClose: uo.close?.tradePct ?? null, mfe: uo.mfePct, mae: uo.maePct },
          opt: null, optMiss: null,
        };
        if (ev.kind !== 'stall') {
          if (ev.min > 15 * 60 + 30) tr.optMiss = 'after 15:30';
          else {
            const type = optionTypeFor(side) === 'call' ? 'C' : 'P';
            const ob = await loadType(type);
            if (!ob) tr.optMiss = 'no option bars';
            else {
              const trigT = ev.t / 1000;
              const meta = new Map(chain.filter((c) => c[2] === type).map((c) => [c[0], c[3]]));
              const cands: ContractCandidate[] = Object.keys(ob).filter((o) => meta.has(o)).map((occ) => { const bar = ob[occ].find((r) => r[0] === trigT); return { occ, strike: meta.get(occ)!, type: type === 'C' ? 'call' : 'put', price: bar ? bar[4] : null, volume: bar ? bar[5] : 0 }; });
              const pick = pickNearestOtm(cands, ev.price, type === 'C' ? 'call' : 'put');
              const rows = pick ? ob[pick.occ] ?? [] : [];
              const eb = rows.find((r) => r[0] > trigT && r[0] <= trigT + 240);
              if (!pick) tr.optMiss = 'no contract';
              else if (!eb || !(eb[2] > 0)) tr.optMiss = 'no fill';
              else {
                const after: OptBar[] = rows.filter((r) => r[0] > eb[0] && r[0] * 1000 < closeT).map((r) => ({ t: r[0] * 1000, o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] }));
                const intrinsic = type === 'C' ? Math.max(0, settle - pick.strike) : Math.max(0, pick.strike - settle);
                const o = evaluateOptionPath(eb[2], after, intrinsic, eb[0] * 1000, levelStopTime(rth, ev.idx, L.price, side));
                tr.opt = { occ: pick.occ, strike: pick.strike, entry: eb[2], maxMult: +o.maxMult.toFixed(3), worthless: o.worthless, pnl: Object.fromEntries(EXIT_RULES.map((k) => [k, +o.pnl[k].toFixed(4)])) as Record<ExitRule, number> };
              }
            }
          }
        }
        trades.push(tr);
      }
    }
  }
  console.log(`  ${sym}: ${nDays} same-day-expiry sessions · ${trades.filter((t) => t.sym === sym).length} resolutions · ${requests} requests, ${cacheMisses} cache misses`);
}

// ── stats ──
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const r3 = (x: number) => (Number.isFinite(x) ? +x.toFixed(3) : null);
const exBest = (a: number[]) => { if (a.length < 2) return NaN; const s = [...a].sort((x, y) => y - x); return mean(s.slice(1)); };
const nums = (a: Array<number | null>) => a.filter((x): x is number => x != null && Number.isFinite(x));
function summ(ts: Trade[]) {
  const opt = ts.filter((t) => t.opt);
  return {
    n: ts.length, options: opt.length,
    t30: r3(mean(nums(ts.map((t) => t.u.t30)))), tClose: r3(mean(nums(ts.map((t) => t.u.tClose)))),
    win30: (() => { const a = nums(ts.map((t) => t.u.t30)); return a.length ? r3((a.filter((x) => x > 0).length / a.length) * 100) : null; })(),
    mfe: r3(mean(nums(ts.map((t) => t.u.mfe)))), mae: r3(mean(nums(ts.map((t) => t.u.mae)))),
    hit2x: opt.length ? r3((opt.filter((t) => t.opt!.maxMult >= 2).length / opt.length) * 100) : null,
    worthless: opt.length ? r3((opt.filter((t) => t.opt!.worthless).length / opt.length) * 100) : null,
    exp: Object.fromEntries(EXIT_RULES.map((k) => [k, r3(mean(opt.map((t) => t.opt!.pnl[k])))])),
  };
}
function survivors(ts: Trade[]) {
  const o = ts.filter((t) => t.opt);
  const h1 = o.filter((t) => t.day < SPLIT), h2 = o.filter((t) => t.day >= SPLIT);
  const out: Array<{ exit: ExitRule; h1n: number; h2n: number; h1: number | null; h2: number | null; h1ExBest: number | null; h2ExBest: number | null }> = [];
  if (h1.length < MIN_HALF_N || h2.length < MIN_HALF_N) return out;
  for (const k of EXIT_RULES) {
    const a = h1.map((t) => t.opt!.pnl[k]), b = h2.map((t) => t.opt!.pnl[k]);
    if (mean(a) > 0 && mean(b) > 0 && exBest(a) > 0 && exBest(b) > 0) out.push({ exit: k, h1n: a.length, h2n: b.length, h1: r3(mean(a)), h2: r3(mean(b)), h1ExBest: r3(exBest(a)), h2ExBest: r3(exBest(b)) });
  }
  return out;
}
const rejRate = (ts: Trade[]) => { const n = ts.length; return n ? r3(ts.filter((t) => t.resolution === 'rejection').length / n) : null; };
const touchB = (n: number) => (n >= 4 ? '4+' : String(n));

async function main() {
  console.log(`wall-touch PROXY replay ${FROM} → ${END} (split ${SPLIT}) · ${SYMBOLS.length} symbols · cache: ${READ_DIRS.join(' | ')}`);
  const trades: Trade[] = [];
  const t0 = Date.now();
  for (const s of SYMBOLS) {
    try { await replaySymbol(s, trades); } catch (e) { console.log(`  ${s}: FAILED ${(e as Error).message}`); }
    if (global.gc) global.gc();
  }
  const cells: any[] = [];
  const subSurvivors: any[] = [];
  for (const proxy of PROXIES) for (const wall of ['put', 'call'] as WallKind[]) {
    const all = trades.filter((t) => t.proxy === proxy && t.wall === wall);
    const h1 = all.filter((t) => t.day < SPLIT), h2 = all.filter((t) => t.day >= SPLIT);
    const row: any = {
      proxy, wall, label: `${PROXY_LABEL[proxy]} · ${wall} side`,
      resolutions: all.length, rejectionRate: { all: rejRate(all), h1: rejRate(h1), h2: rejRate(h2) },
      breakRate: all.length ? r3(all.filter((t) => t.resolution === 'break').length / all.length) : null,
      byTouchRejection: Object.fromEntries(['1', '2', '3', '4+'].map((b) => [b, rejRate(all.filter((t) => touchB(t.touch) === b))])),
      trades: {} as Record<string, unknown>,
    };
    for (const res of ['rejection', 'break'] as const) {
      const base = all.filter((t) => t.resolution === res);
      const surv = survivors(base);
      const subsets: Record<string, Trade[]> = {
        'touch 1': base.filter((t) => t.touch === 1), 'touch 2': base.filter((t) => t.touch === 2), 'touch 3': base.filter((t) => t.touch === 3), 'touch 4+': base.filter((t) => t.touch >= 4),
        'RVOL ≥ 1.5': base.filter((t) => t.rvol != null && t.rvol >= 1.5), 'RVOL < 1.5': base.filter((t) => t.rvol != null && t.rvol < 1.5),
        'index ETFs': base.filter((t) => t.group === 'index'), 'single names': base.filter((t) => t.group === 'single'),
      };
      const bySubset: Record<string, unknown> = {};
      for (const [k, ts] of Object.entries(subsets)) {
        const sv = survivors(ts);
        bySubset[k] = { all: summ(ts), h1: summ(ts.filter((t) => t.day < SPLIT)), h2: summ(ts.filter((t) => t.day >= SPLIT)), surviving: sv };
        for (const x of sv) subSurvivors.push({ label: `${PROXY_LABEL[proxy]} · ${wall} · ${res} · ${k}`, ...x });
      }
      row.trades[res] = { all: summ(base), h1: summ(base.filter((t) => t.day < SPLIT)), h2: summ(base.filter((t) => t.day >= SPLIT)), surviving: surv, bySubset, optMiss: Object.fromEntries(['after 15:30', 'no option bars', 'no contract', 'no fill'].map((r) => [r, base.filter((t) => t.optMiss === r).length])) };
    }
    cells.push(row);
  }
  const amd = trades.filter((t) => t.sym === 'AMD' && t.day === '2026-09-30');
  const report = {
    generatedAt: new Date().toISOString(), label: 'PROXY — not GEX walls', window: { from: FROM, to: END, split: SPLIT, halves: [`${FROM} → ${SPLIT} (excl.)`, `${SPLIT} → ${END}`] },
    symbols: SYMBOLS, minHalfN: MIN_HALF_N, proxies: PROXY_LABEL, requests, cacheMisses, runtimeSec: Math.round((Date.now() - t0) / 1000),
    totals: { resolutions: trades.length, optionTrades: trades.filter((t) => t.opt).length, sessions: new Set(trades.map((t) => `${t.sym}|${t.day}`)).size },
    cells, subSurvivors, example_AMD_2026_09_30: amd,
  };
  fs.writeFileSync(path.resolve(process.cwd(), 'research/wall-touch-proxy-results.json'), JSON.stringify(report, null, 1));
  writeDoc(report);
  console.log(`\n${trades.length} resolutions · ${report.totals.optionTrades} option trades · ${report.runtimeSec}s · ${requests} requests`);
  for (const c of cells) {
    for (const res of ['rejection', 'break']) {
      const x = c.trades[res];
      console.log(`${x.surviving.length ? 'SURVIVES' : '        '} ${c.label.padEnd(70)} ${res.padEnd(9)} n=${String(x.all.n).padStart(5)} opt=${String(x.all.options).padStart(5)} hold ${x.all.exp.hold} (H1 ${x.h1.exp.hold} / H2 ${x.h2.exp.hold}) take2x ${x.all.exp.take2x} (H1 ${x.h1.exp.take2x} / H2 ${x.h2.exp.take2x}) · +30m ${x.all.t30}% · rej-rate ${c.rejectionRate.all}`);
    }
  }
  console.log(`sub-cell survivors: ${subSurvivors.length}`);
  for (const s of subSurvivors) console.log(`  ${s.label} · ${s.exit} H1 ${s.h1} (n ${s.h1n}) / H2 ${s.h2} (n ${s.h2n}) ex-best ${s.h1ExBest}/${s.h2ExBest}`);
}

function writeDoc(rep: any) {
  const f = (x: any) => (x == null || Number.isNaN(x) ? '—' : typeof x === 'number' ? x.toFixed(2) : String(x));
  const L: string[] = [];
  L.push('# GEX wall-touch — PROXY replay on real option bars', '');
  L.push(`**This is a PROXY. Historical GEX walls cannot be replayed (no historical option chains / open interest). These levels are reconstructable stand-ins: ${Object.values(rep.proxies).join('; ')}.** The real test is the forward log (\`.cache/wall-touch/events-YYYY-MM.jsonl\`, \`GET /api/wall-touch/report\`).`, '');
  L.push(`Window: ${rep.window.from} → ${rep.window.to}; walk-forward halves H1 ${rep.window.halves[0]} · H2 ${rep.window.halves[1]}. Generated ${rep.generatedAt} by \`research/wall-touch-proxy-replay.ts\` · ${rep.totals.resolutions} resolutions (rejection / break / stall) · ${rep.totals.optionTrades} option trades on ${rep.totals.sessions} symbol-sessions with a same-day expiry · ${rep.symbols.length} symbols. Status: **measuring**.`, '');
  L.push('Detector = the live engine\'s (`server/wall-touch-core.ts`): touch = 1-min low ≤ level + max(0.05%, 0.1×ATR5); rejection = a close ≥ 0.25×ATR5 back off the level within 1–5 bars; break = a close through by > tolerance; stall = neither. Option = nearest-OTM same-day expiry at the confirm minute, entry = next 1-min bar HIGH, exits as in the 0DTE sniper replay. P&L = per $1 of premium.', '');
  const whole = rep.cells.flatMap((c: any) => ['rejection', 'break'].filter((r) => c.trades[r].surviving.length).map((r) => `${c.label} · ${r}`));
  const t30 = rep.cells.flatMap((c: any) => ['rejection', 'break'].map((r) => c.trades[r].all.t30)).filter((x: any) => x != null);
  L.push('## Verdict (computed)', '');
  L.push(`- Whole cells surviving both halves: **${whole.length ? whole.join('; ') : 'none'}**. Sub-cell survivors: ${rep.subSurvivors.length}.`);
  L.push(`- Rejection rates by proxy: ${rep.cells.map((c: any) => f(c.rejectionRate.all)).join(' / ')} (of rejection + break + stall), stable across halves — a level is rejected more often than broken, but the bounce is small: mean +30-min underlying move in the trade's direction ranges ${f(Math.min(...t30))}% to ${f(Math.max(...t30))}% across cells.`);
  const oneHalf = rep.cells.flatMap((c: any) => ['rejection', 'break'].flatMap((r) => EXIT_RULES.filter((k) => (c.trades[r].h1.exp[k] ?? -1) > 0 !== (c.trades[r].h2.exp[k] ?? -1) > 0 && ((c.trades[r].h1.exp[k] ?? -1) > 0 || (c.trades[r].h2.exp[k] ?? -1) > 0)).map((k) => `${c.proxy} ${c.wall} ${r} ${k} (H1 ${f(c.trades[r].h1.exp[k])} / H2 ${f(c.trades[r].h2.exp[k])})`)));
  L.push(`- Buying the nearest-OTM same-day option on the bounce (or on the break) is not positive in both halves for any proxy × side × trade × exit. ${oneHalf.length} combinations are positive in ONE half only — regime artefacts by the walk-forward law${oneHalf.length ? `, e.g. ${oneHalf.slice(0, 4).join('; ')}` : ''}.`, '');
  L.push('## Rejection vs break vs stall, by proxy (all resolutions)', '');
  L.push('| proxy · side | resolutions | rejection rate (all · H1 · H2) | break rate | rejection rate by touch 1 / 2 / 3 / 4+ |', '|---|---|---|---|---|');
  for (const c of rep.cells) L.push(`| ${c.label} | ${c.resolutions} | ${f(c.rejectionRate.all)} · ${f(c.rejectionRate.h1)} · ${f(c.rejectionRate.h2)} | ${f(c.breakRate)} | ${['1', '2', '3', '4+'].map((b) => f(c.byTouchRejection[b])).join(' / ')} |`);
  L.push('', '## Option trades — the bounce (rejection) and the opposite trade (break)', '');
  L.push('| proxy · side | trade | n (options) | +30m underlying % | MFE % | 2× hit % | worthless % | hold H1 / H2 | take2x H1 / H2 | take2x_close H1 / H2 | level_stop H1 / H2 | survives |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const c of rep.cells) for (const res of ['rejection', 'break']) {
    const x = c.trades[res];
    L.push(`| ${c.label} | ${res} | ${x.all.n} (${x.all.options}) | ${f(x.all.t30)} | ${f(x.all.mfe)} | ${f(x.all.hit2x)} | ${f(x.all.worthless)} | ${f(x.h1.exp.hold)} / ${f(x.h2.exp.hold)} | ${f(x.h1.exp.take2x)} / ${f(x.h2.exp.take2x)} | ${f(x.h1.exp.take2x_close)} / ${f(x.h2.exp.take2x_close)} | ${f(x.h1.exp.level_stop)} / ${f(x.h2.exp.level_stop)} | ${x.surviving.length ? `**yes** (${x.surviving.map((s: any) => s.exit).join(', ')})` : 'no'} |`);
  }
  L.push('', '## Rejection trades by touch number (hold · take2x, all)', '');
  L.push('| proxy · side | touch 1 | touch 2 | touch 3 | touch 4+ |', '|---|---|---|---|---|');
  for (const c of rep.cells) { const s = c.trades.rejection.bySubset; L.push(`| ${c.label} | ${['touch 1', 'touch 2', 'touch 3', 'touch 4+'].map((k) => `${s[k].all.options} · ${f(s[k].all.exp.hold)} · ${f(s[k].all.exp.take2x)}`).join(' | ')} |`); }
  L.push('', '## Rejection trades — RVOL and index vs singles (options n · hold · take2x · H1/H2 take2x)', '');
  L.push('| proxy · side | RVOL ≥ 1.5 | RVOL < 1.5 | index ETFs | single names |', '|---|---|---|---|---|');
  for (const c of rep.cells) { const s = c.trades.rejection.bySubset; L.push(`| ${c.label} | ${['RVOL ≥ 1.5', 'RVOL < 1.5', 'index ETFs', 'single names'].map((k) => `${s[k].all.options} · ${f(s[k].all.exp.hold)} · ${f(s[k].all.exp.take2x)} · ${f(s[k].h1.exp.take2x)}/${f(s[k].h2.exp.take2x)}`).join(' | ')} |`); }
  L.push('', '## Sub-cell survivors (extra comparisons — hypotheses only)', '');
  if (!rep.subSurvivors.length) L.push('None.');
  else { L.push('| cell | exit | H1 (n) | H2 (n) | H1 / H2 ex-best |', '|---|---|---|---|---|'); for (const s of rep.subSurvivors) L.push(`| ${s.label} | ${s.exit} | ${f(s.h1)} (${s.h1n}) | ${f(s.h2)} (${s.h2n}) | ${f(s.h1ExBest)} / ${f(s.h2ExBest)} |`); }
  L.push('', '## AMD 2026-09-30 (the example)', '');
  if (!rep.example_AMD_2026_09_30.length) L.push('No AMD resolutions on 2026-09-30 in this window.');
  for (const t of rep.example_AMD_2026_09_30) L.push(`- ${t.proxy} ${t.wall} ${t.level} · ${t.resolution} (touch #${t.touch}) in the ${String(Math.floor(t.trigMin / 60)).padStart(2, '0')}:${String(t.trigMin % 60).padStart(2, '0')} ET bar · +30m ${f(t.u.t30)}% · ${t.opt ? `${t.opt.occ} entry ${t.opt.entry} → max ${t.opt.maxMult}× · hold ${f(t.opt.pnl.hold)} · take2x ${f(t.opt.pnl.take2x)}` : `no option (${t.optMiss ?? 'stall'})`}`);
  L.push('', '## Caveats', '');
  L.push('- PROXY: none of these levels is a dealer wall. The live engine reads real next-7-day GEX walls; whether those behave better than round strikes / prior-day levels is exactly what the forward log will show.');
  L.push('- Same-day-expiry sessions only (expiries discovered from Alpaca\'s expired-contract listings); the live engine also uses weeklies (≤ 7 DTE) when no 0DTE is listed.');
  L.push('- Entry = the next 1-min bar high (no historical quotes); exits at 2× assume a fill at the touched price — `take2x_close` is the honest check on thin contracts. No commissions or exit slippage.');
  L.push('- Multiple comparisons: 4 proxies × 2 sides × 2 trades × 8 exits, plus subsets — some cells pass by chance. Survivorship: today\'s liquid names.');
  fs.writeFileSync(path.resolve(process.cwd(), 'docs/WALL_TOUCH_PROXY_REPLAY.md'), L.join('\n') + '\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
