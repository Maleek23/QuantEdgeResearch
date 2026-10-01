/**
 * IDEA REPLAY CORE — the bar-verified entry + exit simulation shared by
 * research/exit-rule-replay.ts (which exit rule?) and research/score-v2-study.ts
 * (which idea will work?). Extracted unchanged from exit-rule-replay.ts; see that
 * file's header for the entry / horizon / exclusion / fill conventions.
 *
 * Read-only: Alpaca bars cached under .cache/exit-replay/, never a database.
 * EXIT_REPLAY_NOW (ISO) freezes "now" so a cached run reproduces exactly.
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { horizonTradingDays } from '../../shared/loss-rules';
import { optionExpiryCloseMs, nyDayMinute } from '../../shared/option-expiry';
import { EXIT_RULES, simulateExit, fillsPnl, emaSeries, atrSeries, type ExitRuleId, type SimBar, type SimInput, type Fill } from '../../shared/exit-policy';

dotenv.config({ path: process.env.ENV_FILE || '/Users/abdulmalik/UnTitld/QuantEdgeee/.env', quiet: true } as any);
const KEY = process.env.ALPACA_API_KEY, SECRET = process.env.ALPACA_SECRET_KEY;
const ROOT = path.resolve(process.cwd(), '.cache/exit-replay');
for (const d of ['stk', 'opt', 'day']) fs.mkdirSync(path.join(ROOT, d), { recursive: true });
export const NOW = process.env.EXIT_REPLAY_NOW ? Date.parse(process.env.EXIT_REPLAY_NOW) : Date.now() - 16 * 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── HTTP ──────────────────────────────────────────────────────────────────
let last = 0;
export let requests = 0;
const RATE = Number(process.env.EXIT_REPLAY_RATE ?? 400);
export async function getJson(url: string): Promise<any> {
  if (!KEY || !SECRET) throw new Error('ALPACA keys missing');
  for (let a = 0; a < 8; a++) {
    const now = Date.now(); const slot = Math.max(now, last + 60_000 / RATE); last = slot;
    if (slot > now) await sleep(slot - now);
    requests++;
    let r: Response;
    try { r = await fetch(url, { headers: { 'APCA-API-KEY-ID': KEY, 'APCA-API-SECRET-KEY': SECRET } }); } catch { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(15_000); continue; }
    if (r.status >= 500) { await sleep(3000); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
    return r.json();
  }
  throw new Error('gave up ' + url.replace(/\?.*/, ''));
}
export async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let k = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (k < items.length) { const x = items[k++]; await fn(x); } }));
}
export function cached<T>(file: string): T | null { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null; }

export type B = { t: number; o: number; h: number; l: number; c: number };
export const isCrypto = (x: Idea) => x.asset_type === 'crypto';
const cryptoPair = (s: string) => `${s}/USD`;

async function pagedBars(base: string, params: Record<string, string>, key: string): Promise<B[]> {
  const out: B[] = []; let token: string | undefined;
  for (let p = 0; p < 100; p++) {
    const u = new URL(base);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    u.searchParams.set('limit', '10000');
    if (token) u.searchParams.set('page_token', token);
    const j = await getJson(u.toString());
    const arr = Array.isArray(j.bars) ? j.bars : (j.bars?.[key] ?? []);
    for (const b of arr) out.push({ t: Date.parse(b.t), o: b.o, h: b.h, l: b.l, c: b.c });
    token = j.next_page_token || undefined;
    if (!token) break;
  }
  return out;
}

export async function minuteBars(sym: string, crypto: boolean, startMs: number, endMs: number): Promise<B[]> {
  const s = new Date(startMs).toISOString().slice(0, 16), e = new Date(Math.min(endMs, NOW)).toISOString().slice(0, 16);
  const file = path.join(ROOT, 'stk', `${sym.replace('/', '_')}_${s}_${e}.json`.replace(/:/g, ''));
  const c = cached<B[]>(file); if (c) return c;
  const bars = crypto
    ? await pagedBars('https://data.alpaca.markets/v1beta3/crypto/us/bars', { symbols: sym, timeframe: '1Min', start: s + ':00Z', end: e + ':00Z' }, sym)
    : await pagedBars('https://data.alpaca.markets/v2/stocks/bars', { symbols: sym, timeframe: '1Min', start: s + ':00Z', end: e + ':00Z', adjustment: 'split', feed: 'sip' }, sym);
  fs.writeFileSync(file, JSON.stringify(bars));
  return bars;
}
export async function dailyBars(sym: string, crypto: boolean, endDay: string): Promise<B[]> {
  const file = path.join(ROOT, 'day', `${sym.replace('/', '_')}_${endDay}.json`);
  const c = cached<B[]>(file); if (c) return c;
  const bars = crypto
    ? await pagedBars('https://data.alpaca.markets/v1beta3/crypto/us/bars', { symbols: sym, timeframe: '1Day', start: '2026-05-01T00:00:00Z' }, sym)
    : await pagedBars('https://data.alpaca.markets/v2/stocks/bars', { symbols: sym, timeframe: '1Day', start: '2026-05-01T00:00:00Z', adjustment: 'split', feed: 'sip' }, sym);
  fs.writeFileSync(file, JSON.stringify(bars));
  return bars;
}
export async function optionMinuteBars(occ: string, startMs: number, endMs: number): Promise<B[]> {
  const s = new Date(startMs).toISOString().slice(0, 16), e = new Date(Math.min(endMs, NOW)).toISOString().slice(0, 16);
  const file = path.join(ROOT, 'opt', `${occ}_${s}_${e}.json`.replace(/:/g, ''));
  const c = cached<B[]>(file); if (c) return c;
  const bars = await pagedBars('https://data.alpaca.markets/v1beta1/options/bars', { symbols: occ, timeframe: '1Min', start: s + ':00Z', end: e + ':00Z' }, occ);
  fs.writeFileSync(file, JSON.stringify(bars));
  return bars;
}
export async function gspcDailyClose(): Promise<Map<string, number>> {
  const file = path.join(ROOT, 'gspc-daily.json');
  const c = cached<Array<[string, number]>>(file); if (c) return new Map(c);
  const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=6mo', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const j: any = await r.json(); const res = j?.chart?.result?.[0];
  const out: Array<[string, number]> = [];
  (res?.timestamp ?? []).forEach((ts: number, i: number) => { const v = res.indicators.quote[0].close[i]; if (typeof v === 'number') out.push([nyDayMinute(ts * 1000).day, v]); });
  fs.writeFileSync(file, JSON.stringify(out));
  return new Map(out);
}

// ── ideas ─────────────────────────────────────────────────────────────────
export interface Idea {
  id: string; symbol: string; direction: 'long' | 'short'; source: string; asset_type: string;
  option_type: 'call' | 'put' | null; strike_price: number | null; expiry_date: string | null;
  entry_price: number; entry_premium: number | null; stop_loss: number; target_price: number;
  ts: string; conv: number | null; holding_period: string; outcome_status: string; exit_price: number | null; exit_date: string | null;
}
const FILL_WINDOW_MIN = Number(process.env.EXIT_REPLAY_FILL_WINDOW_MIN ?? 390);
export const MARKET_ENTRY = new Set(['flow', 'orb_scanner', 'zero_dte_desk', 'gex_scanner']);
const optRoot = (s: string) => (s === 'SPX' ? 'SPXW' : s.replace(/[.\-/]/g, ''));
export function occOf(x: Idea): string {
  const d = String(x.expiry_date).slice(2, 10).replace(/-/g, '');
  return `${optRoot(x.symbol)}${d}${x.option_type === 'call' ? 'C' : 'P'}${String(Math.round(Number(x.strike_price) * 1000)).padStart(8, '0')}`;
}
export const instrument = (x: Idea) => (x.asset_type === 'option' ? `${x.option_type}|${x.strike_price}|${String(x.expiry_date).slice(0, 10)}` : x.asset_type);

// ── per-symbol bar store with indicators ──────────────────────────────────
export interface Store {
  bars: (B & { day: string; min: number })[];
  sessions: string[];                       // ordered session keys present in bars
  end5: boolean[]; ema5: (number | null)[]; atr5: (number | null)[];
  dDays: string[]; dEma: number[]; dAtr: number[];
}
export function buildStore(raw: B[], daily: B[], crypto: boolean, scale?: (day: string) => number): Store {
  const bars: Store['bars'] = [];
  for (const b of raw) {
    let day: string, min: number;
    if (crypto) { day = new Date(b.t).toISOString().slice(0, 10); const d = new Date(b.t); min = d.getUTCHours() * 60 + d.getUTCMinutes(); }
    else { const p = nyDayMinute(b.t); day = p.day; min = p.minute; if (min < 570 || min >= 960) continue; }
    const k = scale ? scale(day) : 1;
    bars.push({ t: b.t, o: b.o * k, h: b.h * k, l: b.l * k, c: b.c * k, day, min });
  }
  bars.sort((a, b) => a.t - b.t);
  const sessions = [...new Set(bars.map((b) => b.day))];
  const end5: boolean[] = [], ema5: (number | null)[] = [], atr5: (number | null)[] = [];
  const b5: B[] = []; let cur: B | null = null; let curKey = -1;
  let e: number | null = null, a: number | null = null;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]; const key = Math.floor(b.t / 300_000);
    if (key !== curKey) { cur = { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c }; curKey = key; }
    else { cur!.h = Math.max(cur!.h, b.h); cur!.l = Math.min(cur!.l, b.l); cur!.c = b.c; }
    const isEnd = i === bars.length - 1 || Math.floor(bars[i + 1].t / 300_000) !== key;
    if (isEnd) {
      b5.push({ ...cur! });
      const n = b5.length;
      e = e == null ? cur!.c : e + (2 / 21) * (cur!.c - e);
      const pc = n > 1 ? b5[n - 2].c : cur!.c;
      const tr = Math.max(cur!.h - cur!.l, Math.abs(cur!.h - pc), Math.abs(cur!.l - pc));
      if (n <= 14) { a = ((a ?? 0) * (n - 1) + tr) / n; } else a = (a! * 13 + tr) / 14;
    }
    end5.push(isEnd); ema5.push(b5.length >= 20 ? e : null); atr5.push(b5.length >= 14 ? a : null);
  }
  const dd = daily.map((b) => {
    const day = crypto ? new Date(b.t).toISOString().slice(0, 10) : nyDayMinute(b.t + 12 * 3600_000).day;
    const k = scale ? scale(day) : 1;
    return { day, o: b.o * k, h: b.h * k, l: b.l * k, c: b.c * k };
  }).sort((x, y) => (x.day < y.day ? -1 : 1));
  const dEma = emaSeries(dd.map((b) => b.c), 20);
  const dAtr = atrSeries(dd, 14);
  return { bars, sessions, end5, ema5, atr5, dDays: dd.map((b) => b.day), dEma, dAtr };
}
export function priorDaily(st: Store, day: string): { ema: number | null; atr: number | null } {
  let lo = 0, hi = st.dDays.length - 1, k = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (st.dDays[m] < day) { k = m; lo = m + 1; } else hi = m - 1; }
  if (k < 19) return { ema: null, atr: k >= 14 && Number.isFinite(st.dAtr[k]) ? st.dAtr[k] : null };
  return { ema: st.dEma[k], atr: Number.isFinite(st.dAtr[k]) ? st.dAtr[k] : null };
}

// ── main ──────────────────────────────────────────────────────────────────
export interface Row {
  id: string; symbol: string; source: string; dir: 'long' | 'short'; kind: 'stock' | 'call' | 'put' | 'crypto';
  hp: string; conv: number | null; pubMs: number; pubDay: string; entryMs: number; entry: number; stop: number; target: number;
  horizonDays: number; tf: 'm5' | 'd1'; open: boolean; occ?: string;
  /** Underlying R-multiple per rule (Σ frac × dir × (exit − entry) / |entry − stop|); same for every fill variant. */
  rU: Partial<Record<ExitRuleId, number>>;
  /** per fill variant: 'cons' (bar high) and 'mid' ((h+l)/2); stocks have only 'cons'. */
  v: Record<'cons' | 'mid', { eP: number | null; peak: number; peakEq: number; pnl: Partial<Record<ExitRuleId, number>>; pnlEq: Partial<Record<ExitRuleId, number>>; why: Partial<Record<ExitRuleId, string>> } | undefined>;
}


/** Underlying R of a fill list: Σ frac × dir × (u − entry) / |entry − stop|. */
export function fillsR(fills: Fill[], dir: 1 | -1, entry: number, stop: number): number {
  const risk = Math.abs(entry - stop);
  if (!(risk > 0)) return 0;
  let r = 0;
  for (const f of fills) r += f.frac * dir * (f.u - entry) / risk;
  return r;
}

export interface ReplayResult { rows: Row[]; excl: Record<string, number>; stores: Map<string, Store>; ideasLoaded: number }

/** Same entries, every exit rule, for every idea that triggers inside its horizon. */
export async function replayIdeas(all: Idea[]): Promise<ReplayResult> {
  const excl: Record<string, number> = {};
  const bump = (k: string) => { excl[k] = (excl[k] ?? 0) + 1; };
  const seen = new Set<string>();
  const ideas: Idea[] = [];
  for (const x of [...all].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))) {
    const pub = Date.parse(x.ts);
    if (x.exit_date && Date.parse(x.exit_date) < pub) { bump('exit stamped before publish (expiry-parse bug)'); continue; }
    if (x.asset_type === 'option' && (!x.expiry_date || !x.strike_price || !x.option_type)) { bump('option without contract'); continue; }
    const key = `${x.symbol}|${x.direction}|${x.source}|${instrument(x)}|${nyDayMinute(pub).day}`;
    if (seen.has(key)) { bump('duplicate (same symbol+side+engine+instrument, same session)'); continue; }
    seen.add(key);
    ideas.push(x);
  }
  console.log(`ideas ${all.length} → ${ideas.length} after exclusions`, excl);

  // Trading calendar from SPY.
  const firstPub = Math.min(...ideas.map((x) => Date.parse(x.ts)));
  const spyRaw = await minuteBars('SPY', false, firstPub - 8 * 86_400_000, NOW);
  const spyDaily = await dailyBars('SPY', false, nyDayMinute(NOW).day);
  const calendar = [...new Set(spyRaw.map((b) => nyDayMinute(b.t)).filter((p) => p.minute >= 570 && p.minute < 960).map((p) => p.day))].sort();
  const closeMs = (day: string) => optionExpiryCloseMs(day);
  const lastDataMs = spyRaw[spyRaw.length - 1].t;

  // Horizon per idea.
  interface Plan { x: Idea; pub: number; endMs: number; days: number; open: boolean; crypto: boolean; firstDay: string }
  const plans: Plan[] = [];
  for (const x of ideas) {
    const pub = Date.parse(x.ts); const crypto = isCrypto(x);
    const days = horizonTradingDays({ holdingPeriod: x.holding_period, expiryDate: x.asset_type === 'option' ? x.expiry_date : null, publishedMs: pub });
    let endMs: number, open = false, firstDay: string;
    if (crypto) {
      firstDay = new Date(pub).toISOString().slice(0, 10);
      endMs = Date.parse(firstDay + 'T00:00:00Z') + days * 86_400_000;
    } else {
      const fi = calendar.findIndex((d) => closeMs(d) > pub);
      firstDay = fi >= 0 ? calendar[fi] : 'future';
      const hi = fi >= 0 ? fi + days - 1 : Infinity;
      endMs = hi < calendar.length ? closeMs(calendar[hi]) : Infinity;
      if (x.asset_type === 'option') endMs = Math.min(endMs, optionExpiryCloseMs(x.expiry_date));
    }
    if (endMs > lastDataMs + 60_000) { open = true; }
    plans.push({ x, pub, endMs, days, open, crypto, firstDay });
  }

  // Underlying bars per symbol.
  const bySym = new Map<string, Plan[]>();
  for (const p of plans) { const k = (p.crypto ? 'C:' : '') + (p.x.symbol === 'SPX' ? 'SPY' : p.x.symbol); (bySym.get(k) ?? bySym.set(k, []).get(k)!).push(p); }
  const gspc = plans.some((p) => p.x.symbol === 'SPX') ? await gspcDailyClose() : new Map<string, number>();
  const spyClose = new Map(spyDaily.map((b) => [nyDayMinute(b.t + 12 * 3600_000).day, b.c] as [string, number]));
  const spxScale = (day: string) => { const g = gspc.get(day), s = spyClose.get(day); return g && s ? g / s : 10.04; };
  const stores = new Map<string, Store>();
  const endDay = nyDayMinute(NOW).day;
  let done = 0;
  await pool([...bySym.keys()], 6, async (k) => {
    const crypto = k.startsWith('C:'); const sym = crypto ? cryptoPair(k.slice(2)) : k;
    const ps = bySym.get(k)!;
    const start = Math.min(...ps.map((p) => p.pub)) - 6 * 86_400_000;
    const end = Math.min(NOW, Math.max(...ps.map((p) => (Number.isFinite(p.endMs) ? p.endMs : NOW))) + 60_000);
    try {
      const raw = sym === 'SPY' ? spyRaw.filter((b) => b.t >= start) : await minuteBars(sym, crypto, start, end);
      const daily = sym === 'SPY' ? spyDaily : await dailyBars(sym, crypto, endDay);
      stores.set(k, buildStore(raw, daily, crypto));
      if (k === 'SPY' && plans.some((p) => p.x.symbol === 'SPX')) stores.set('SPX', buildStore(raw, daily, false, spxScale));
    } catch (e) { console.warn('bars fail', k, (e as Error).message); }
    if (++done % 50 === 0) console.log(`  underlyings ${done}/${bySym.size} (requests ${requests})`);
  });

  // Entries.
  interface Entry { p: Plan; st: Store; i0: number; iEnd: number; entry: number }
  const entries: Entry[] = [];
  for (const p of plans) {
    const x = p.x; const st = stores.get(x.symbol === 'SPX' ? 'SPX' : (p.crypto ? 'C:' : '') + x.symbol);
    if (!st || !st.bars.length) { bump('no underlying bars'); continue; }
    const dir = x.direction === 'long' ? 1 : -1;
    let i = st.bars.findIndex((b) => b.t >= p.pub);
    if (i < 0 || st.bars[i].t >= p.endMs) { bump(p.open ? 'not yet triggerable (horizon in the future)' : 'no bar inside horizon'); continue; }
    let iEnd = i; while (iEnd + 1 < st.bars.length && st.bars[iEnd + 1].t < p.endMs) iEnd++;
    let i0 = -1, entry = NaN;
    if (MARKET_ENTRY.has(x.source)) { i0 = i; entry = st.bars[i].o; }
    else {
      const E = x.entry_price;
      let prevC = i > 0 ? st.bars[i - 1].c : st.bars[i].o;
      for (let j = i; j <= iEnd; j++) {
        const b = st.bars[j];
        if (b.l <= E && E <= b.h) { i0 = j; entry = E; break; }
        if ((prevC - E) * (b.o - E) < 0) { i0 = j; entry = b.o; break; }
        if (dir > 0 ? b.l <= x.stop_loss : b.h >= x.stop_loss) { i0 = -2; break; }
        prevC = b.c;
      }
      if (i0 === -2) { bump('stop traded before entry (void)'); continue; }
    }
    if (i0 < 0) { bump('never traded at entry (untriggered)'); continue; }
    entries.push({ p, st, i0, iEnd, entry });
  }
  console.log(`triggered ${entries.length}`);

  // Option bars for triggered option ideas.
  const optBars = new Map<string, B[]>();
  let od = 0;
  await pool(entries.filter((e) => e.p.x.asset_type === 'option'), 6, async (e) => {
    const occ = occOf(e.p.x);
    const t0 = e.st.bars[e.i0].t - 60_000, t1 = e.st.bars[e.iEnd].t + 120_000;
    try { optBars.set(e.p.x.id, await optionMinuteBars(occ, t0, t1)); } catch (err) { console.warn('opt fail', occ, (err as Error).message); }
    if (++od % 50 === 0) console.log(`  options ${od} (requests ${requests})`);
  });

  // Simulate.
  const rows: Row[] = [];
  for (const e of entries) {
    const { p, st, i0, iEnd, entry } = e; const x = p.x;
    const dir: 1 | -1 = x.direction === 'long' ? 1 : -1;
    const sessIdx = new Map<string, number>(); let si = 0;
    const bars: SimBar[] = [];
    for (let i = i0; i <= iEnd; i++) {
      const b = st.bars[i];
      if (!sessIdx.has(b.day)) sessIdx.set(b.day, si++);
      const pd = priorDaily(st, b.day);
      bars.push({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, sess: sessIdx.get(b.day)!, end5: st.end5[i], endSess: i === st.bars.length - 1 || st.bars[i + 1].day !== b.day, ema5: st.ema5[i], atr5: st.atr5[i], emaD: pd.ema, atrD: pd.atr });
    }
    const isOpt = x.asset_type === 'option';
    const entryDay = st.bars[i0].day;
    const zeroDte = isOpt && String(x.expiry_date).slice(0, 10) === entryDay;
    const tf: 'm5' | 'd1' = x.holding_period === 'day' || zeroDte || p.days <= 1 ? 'm5' : 'd1';
    const kind: Row['kind'] = isOpt ? (x.option_type as 'call' | 'put') : p.crypto ? 'crypto' : 'stock';
    const row: Row = {
      id: x.id, symbol: x.symbol, source: x.source, dir: x.direction, kind, hp: x.holding_period, conv: x.conv,
      pubMs: p.pub, pubDay: nyDayMinute(p.pub).day, entryMs: st.bars[i0].t, entry, stop: x.stop_loss, target: x.target_price,
      horizonDays: p.days, tf, open: p.open, occ: isOpt ? occOf(x) : undefined, rU: {}, v: { cons: undefined, mid: undefined },
    };
    const base: Omit<SimInput, 'opt'> = { dir, bars, entry, stop: x.stop_loss, target: x.target_price, tf };
    if (!isOpt) {
      let best = 0; for (let i = 1; i < bars.length; i++) best = Math.max(best, dir > 0 ? bars[i].h - entry : entry - bars[i].l);
      const peak = 1000 * best / entry;
      const v = { eP: null, peak, peakEq: peak, pnl: {} as any, pnlEq: {} as any, why: {} as any };
      for (const r of EXIT_RULES) {
        if (r === 'opt_premium') continue;
        const f = simulateExit(r, base);
        v.pnl[r] = fillsPnl(f, { dir, entry, notional: 1000 }); v.pnlEq[r] = v.pnl[r]; v.why[r] = f.map((z) => z.why).join('+');
        row.rU[r] = fillsR(f, dir, entry, x.stop_loss);
      }
      row.v.cons = v;
      rows.push(row);
      continue;
    }
    const ob = (optBars.get(x.id) ?? []).slice().sort((a, b) => a.t - b.t);
    const t0 = bars[0].t;
    const sessEnd = bars.findIndex((b) => b.endSess);
    // Illiquid contracts often do not print in the entry minute: fill at the first
    // print at/after the entry inside the entry session (FILL_WINDOW_MIN narrows it).
    const eBar = ob.find((b) => b.t >= t0 && b.t <= Math.min(t0 + FILL_WINDOW_MIN * 60_000, bars[Math.max(0, sessEnd)].t + 60_000));
    if (!eBar) { bump(ob.length ? 'option: no contract print in the entry session' : 'option: no contract bars at all'); continue; }
    if (eBar.t - t0 > 30 * 60_000) bump('option: (kept) first print >30 min after entry');
    const byMin = new Map(ob.map((b) => [b.t, b] as [number, B]));
    const carry: (number | null)[] = []; const nextOpen: (number | null)[] = [];
    { let k = 0, c: number | null = null;
      for (let i = 0; i < bars.length; i++) { while (k < ob.length && ob[k].t <= bars[i].t) { if (ob[k].t >= eBar.t) c = ob[k].c; k++; } carry.push(c); nextOpen.push(k < ob.length ? ob[k].o : null); } }
    let peakHi = 0; for (const b of ob) if (b.t > eBar.t && b.t < bars[bars.length - 1].t + 60_000) peakHi = Math.max(peakHi, b.h);
    const dayTimeStopIdx = p.days <= 1 || zeroDte ? bars.findIndex((b) => b.sess === 0 && nyDayMinute(b.t).minute >= 930) : null;
    for (const variant of ['cons', 'mid'] as const) {
      const eP = variant === 'cons' ? eBar.h : (eBar.h + eBar.l) / 2;
      if (!(eP > 0)) continue;
      const opt = { eP, px: (i: number) => carry[i] ?? nextOpen[i], hi: (i: number) => byMin.get(bars[i].t)?.h ?? null };
      const scale = 500 / (eP * 100);
      const peak = Math.max(0, peakHi - eP) * 100;
      const v = { eP, peak, peakEq: peak * scale, pnl: {} as any, pnlEq: {} as any, why: {} as any };
      for (const r of EXIT_RULES) {
        const f = simulateExit(r, { ...base, opt, dayTimeStopIdx: dayTimeStopIdx != null && dayTimeStopIdx >= 0 ? dayTimeStopIdx : null });
        v.pnl[r] = fillsPnl(f, { dir, entry, eP, contracts: 1 }); v.pnlEq[r] = v.pnl[r] * scale; v.why[r] = f.map((z) => z.why).join('+');
        if (variant === 'cons') row.rU[r] = fillsR(f, dir, entry, x.stop_loss);
      }
      row.v[variant] = v;
    }
    rows.push(row);
  }
  console.log(`simulated ${rows.length} (requests ${requests})`, excl);
  return { rows, excl, stores, ideasLoaded: all.length };
}
