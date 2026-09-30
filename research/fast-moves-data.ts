/**
 * Shared data layer for the SPX fast-move research scripts
 * (research/spx-fast-moves-replay.ts, research/spx-fast-moves-today.ts).
 *
 * Same Alpaca endpoints, cache layout (.cache/zdte-replay/) and conservative
 * conventions as research/zero-dte-setups-replay.ts, so the two replays share
 * one bar cache: stock 1-min bars per month (SIP, split-adjusted), option
 * contracts per month, option 1-min bars per symbol-day-type. Never touches a
 * database.
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import type { MinuteBar } from '../server/zero-dte-sniper-core';

dotenv.config({ path: process.env.ENV_FILE || '/Users/abdulmalik/UnTitld/QuantEdgeee/.env', quiet: true } as any);
const KEY = process.env.ALPACA_API_KEY, SECRET = process.env.ALPACA_SECRET_KEY;

export const ROOT = path.resolve(process.cwd(), '.cache/zdte-replay');
for (const d of ['stock', 'contracts', 'opt']) fs.mkdirSync(path.join(ROOT, d), { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── ET clock ──
const offCache = new Map<string, number>();
const dtf = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' });
export function etOffsetMin(ms: number): number {
  const k = new Date(ms).toISOString().slice(0, 10);
  let o = offCache.get(k);
  if (o == null) {
    const noon = Date.parse(`${k}T16:00:00Z`);
    const p: Record<string, string> = {}; for (const x of dtf.formatToParts(new Date(noon))) p[x.type] = x.value;
    o = (Number(p.hour) % 24) * 60 + Number(p.minute) - 16 * 60;
    offCache.set(k, o);
  }
  return o;
}
export function et(ms: number): { day: string; min: number } {
  const d = new Date(ms + etOffsetMin(ms) * 60_000);
  return { day: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
/** UTC ms of an ET wall-clock minute on `day`. */
export function etWall(day: string, min: number): number {
  const noon = Date.parse(`${day}T16:00:00Z`);
  return Date.parse(`${day}T00:00:00Z`) + (min - etOffsetMin(noon)) * 60_000;
}

// ── HTTP lane ──
let lastCall = 0; export let requests = 0;
const RATE = Number(process.env.FM_RATE ?? 150);
export async function getJson(url: string): Promise<any> {
  if (!KEY || !SECRET) throw new Error('ALPACA_API_KEY / ALPACA_SECRET_KEY missing');
  for (let attempt = 0; attempt < 8; attempt++) {
    const wait = 60_000 / RATE - (Date.now() - lastCall);
    if (wait > 0) await sleep(wait);
    lastCall = Date.now(); requests++;
    let r: Response;
    try { r = await fetch(url, { headers: { 'APCA-API-KEY-ID': KEY, 'APCA-API-SECRET-KEY': SECRET } }); } catch { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(20_000); continue; }
    if (r.status >= 500) { await sleep(3000); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)} ← ${url.replace(/\?.*/, '')}`);
    return r.json();
  }
  throw new Error(`gave up: ${url.replace(/\?.*/, '')}`);
}

export function months(from: string, to: string): string[] {
  const out: string[] = []; let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7));
  const ey = Number(to.slice(0, 4)), em = Number(to.slice(5, 7));
  while (y < ey || (y === ey && m <= em)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}
const monthEnd = (ym: string) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

type SRow = [number, number, number, number, number, number, number];
/** Stock 1-min bars for a month (cache shared with the setups replay; an in-progress month is cached under its END date). */
export async function stockMonth(sym: string, ym: string, END: string): Promise<SRow[]> {
  const complete = monthEnd(ym) < END;
  const file = path.join(ROOT, 'stock', complete ? `${sym}-${ym}.json` : `${sym}-${ym}-to-${END}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const start = `${ym}-01T08:00:00Z`;
  const endIso = monthEnd(ym) >= END ? new Date(Math.min(Date.now() - 16 * 60_000, Date.parse(`${END}T23:59:00Z`))).toISOString() : `${monthEnd(ym)}T23:59:00Z`;
  const out: SRow[] = []; let token: string | undefined;
  for (let page = 0; page < 60; page++) {
    const u = new URL('https://data.alpaca.markets/v2/stocks/bars');
    u.searchParams.set('symbols', sym); u.searchParams.set('timeframe', '1Min'); u.searchParams.set('start', start); u.searchParams.set('end', endIso);
    u.searchParams.set('limit', '10000'); u.searchParams.set('adjustment', 'split'); u.searchParams.set('feed', 'sip');
    if (token) u.searchParams.set('page_token', token);
    const j = await getJson(u.toString());
    for (const b of j.bars?.[sym] ?? []) out.push([Date.parse(b.t) / 1000, b.o, b.h, b.l, b.c, b.v, b.vw]);
    token = j.next_page_token || undefined;
    if (!token) break;
  }
  fs.writeFileSync(file, JSON.stringify(out));
  return out;
}

export interface DayBars { rth: MinuteBar[]; pre: MinuteBar[] }
/** Per-ET-day RTH and pre-market (04:00–09:29) bars for [start, end]. */
export async function loadDays(sym: string, start: string, END: string): Promise<Map<string, DayBars>> {
  const byDay = new Map<string, DayBars>();
  for (const ym of months(start.slice(0, 7), END.slice(0, 7))) {
    const rows = await stockMonth(sym, ym, END);
    for (const r of rows) {
      const t = r[0] * 1000; const e = et(t);
      if (e.day < start || e.day > END) continue;
      const b: MinuteBar = { t, o: r[1], h: r[2], l: r[3], c: r[4], v: r[5], vw: r[6], min: e.min };
      let d = byDay.get(e.day); if (!d) { d = { rth: [], pre: [] }; byDay.set(e.day, d); }
      if (e.min >= 570 && e.min < 960) d.rth.push(b);
      else if (e.min >= 240 && e.min < 570) d.pre.push(b);
    }
  }
  return byDay;
}

export type CRow = [string, string, 'C' | 'P', number];
export async function contractsMonth(sym: string, ym: string, lo: number, hi: number, END: string): Promise<CRow[]> {
  const complete = monthEnd(ym) < END;
  const file = path.join(ROOT, 'contracts', complete ? `${sym}-${ym}.json` : `${sym}-${ym}-to-${END}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const out: CRow[] = [];
  for (const status of complete ? ['inactive'] : ['inactive', 'active']) {
    let token: string | undefined;
    for (let page = 0; page < 80; page++) {
      const u = new URL('https://paper-api.alpaca.markets/v2/options/contracts');
      u.searchParams.set('underlying_symbols', sym); u.searchParams.set('status', status);
      u.searchParams.set('expiration_date_gte', `${ym}-01`); u.searchParams.set('expiration_date_lte', monthEnd(ym) < END ? monthEnd(ym) : END);
      u.searchParams.set('strike_price_gte', lo.toFixed(2)); u.searchParams.set('strike_price_lte', hi.toFixed(2)); u.searchParams.set('limit', '10000');
      if (token) u.searchParams.set('page_token', token);
      const j = await getJson(u.toString());
      for (const c of j.option_contracts ?? []) {
        if (c.root_symbol !== sym) continue;
        out.push([c.symbol, c.expiration_date, c.type === 'call' ? 'C' : 'P', Number(c.strike_price)]);
      }
      token = j.next_page_token || undefined;
      if (!token) break;
    }
  }
  fs.writeFileSync(file, JSON.stringify(out));
  return out;
}

export type ORow = [number, number, number, number, number, number];
/** Option 1-min bars for one day/type; reads the shared cache, fetches only the contracts it lacks. */
export async function optionBars(sym: string, day: string, type: 'C' | 'P', occs: string[]): Promise<Record<string, ORow[]>> {
  const dir = path.join(ROOT, 'opt', sym); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${day}-${type}.json`);
  let bars: Record<string, ORow[]> = {};
  if (fs.existsSync(file)) bars = JSON.parse(fs.readFileSync(file, 'utf8')).bars ?? {};
  const missing = occs.filter((o) => !(o in bars));
  if (!missing.length) return bars;
  const fullEnd = Date.parse(`${day}T21:15:00Z`);
  const endMs = Math.min(fullEnd, Date.now() - 16 * 60_000);
  for (const o of missing) bars[o] = [];
  for (let i = 0; i < missing.length; i += 100) {
    const chunk = missing.slice(i, i + 100);
    let token: string | undefined;
    for (let page = 0; page < 40; page++) {
      const u = new URL('https://data.alpaca.markets/v1beta1/options/bars');
      u.searchParams.set('symbols', chunk.join(',')); u.searchParams.set('timeframe', '1Min');
      u.searchParams.set('start', `${day}T13:25:00Z`); u.searchParams.set('end', new Date(endMs).toISOString()); u.searchParams.set('limit', '10000');
      if (token) u.searchParams.set('page_token', token);
      const j = await getJson(u.toString());
      for (const [occ, arr] of Object.entries(j.bars ?? {}) as Array<[string, any[]]>) for (const b of arr) (bars[occ] ??= []).push([Date.parse(b.t) / 1000, b.o, b.h, b.l, b.c, b.v]);
      token = j.next_page_token || undefined;
      if (!token) break;
    }
  }
  if (endMs >= fullEnd) fs.writeFileSync(file, JSON.stringify({ day, type, bars }));
  return bars;
}

/** Average volume by RTH minute index over the given sessions (NaN where fewer than 10 sessions printed). */
export function volBaseline(days: DayBars[]): Float64Array {
  const s = new Float64Array(390), n = new Float64Array(390);
  for (const d of days) for (const b of d.rth) { const k = b.min - 570; if (k >= 0 && k < 390) { s[k] += b.v; n[k]++; } }
  const out = new Float64Array(390);
  for (let k = 0; k < 390; k++) out[k] = n[k] >= 10 ? s[k] / n[k] : NaN;
  return out;
}

/**
 * 08:30 release detector (known by 08:35, before the open): SPY pre-market
 * volume 08:30–08:34 as a multiple of its median over the prior sessions.
 */
export function premarket0830Rvol(today: DayBars, prior: DayBars[]): number | null {
  const win = (d: DayBars) => d.pre.filter((b) => b.min >= 510 && b.min < 515).reduce((a, b) => a + b.v, 0);
  // MEDIAN of the prior sessions — earlier release days must not inflate the baseline.
  const base = prior.map(win).filter((x) => x > 0).sort((a, b) => a - b);
  if (base.length < 10) return null;
  const med = base[Math.floor(base.length / 2)];
  return med > 0 ? win(today) / med : null;
}
