/**
 * EXIT-RULE REPLAY — every NEXUS idea since 2026-08-26, same entries, seven exits.
 *
 *   npm run research:exit-rules            (needs .cache/exit-replay/ideas.json — see docs/EXIT_RULE_REPLAY.md)
 *
 * Question: which exit rule captures the most of each move? The rules live in
 * shared/exit-policy.ts (pure); this script only loads bars, finds the entry,
 * runs every rule on the same entry and aggregates.
 *
 * DATA (read-only; never touches a database)
 *   ideas  : .cache/exit-replay/ideas.json — a SELECT dump of trade_ideas since 2026-08-26
 *   stocks : Alpaca v2/stocks/bars 1Min (SIP, split-adjusted) per symbol, RTH only; 1Day for daily EMA/ATR
 *   crypto : Alpaca v1beta3 crypto/us bars (24/7; a "session" is a UTC day)
 *   options: Alpaca v1beta1/options/bars 1Min by OCC symbol (SPX → SPXW root)
 *   SPX    : SPY bars × that day's ^GSPC/SPY close ratio
 *
 * ENTRY (identical for every rule)
 *   market-entry engines (flow, orb_scanner, zero_dte_desk, gex_scanner) fill at the open of
 *   the first regular-session bar after publish; every other engine waits for price to TRADE
 *   AT entry (a bar range containing it, or a gap across it → the open) before the horizon
 *   ends, and is void if the stop traded first. Options fill at that minute's contract bar
 *   HIGH (conservative) — a second pass fills at the bar's mid ((h+l)/2).
 *
 * HORIZON: shared/loss-rules.ts horizonTradingDays (day 1 · swing 5 · position 10 sessions,
 * never past the contract's 16:00 ET expiry). Ideas whose horizon runs past the data are
 * marked at the last bar (identically for every rule) and flagged `open`.
 *
 * EXCLUSIONS: rows whose recorded exit precedes publish (the UTC-midnight expiry bug —
 * docs/LOSS_ATTRIBUTION_2026-09-30.md §3), and duplicates (same symbol + side + engine +
 * instrument within one ET session — the first is kept).
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { horizonTradingDays } from '../shared/loss-rules';
import { optionExpiryCloseMs, nyDayMinute } from '../shared/option-expiry';
import { EXIT_RULES, EXIT_RULE_LABEL, simulateExit, fillsPnl, emaSeries, atrSeries, type ExitRuleId, type SimBar, type SimInput } from '../shared/exit-policy';

dotenv.config({ path: process.env.ENV_FILE || '/Users/abdulmalik/UnTitld/QuantEdgeee/.env', quiet: true } as any);
const KEY = process.env.ALPACA_API_KEY, SECRET = process.env.ALPACA_SECRET_KEY;
const ROOT = path.resolve(process.cwd(), '.cache/exit-replay');
for (const d of ['stk', 'opt', 'day']) fs.mkdirSync(path.join(ROOT, d), { recursive: true });
const OUT = path.resolve(process.cwd(), 'research/exit-rule-replay-results.json');
const NOW = Date.now() - 16 * 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── HTTP ──────────────────────────────────────────────────────────────────
let last = 0, requests = 0;
const RATE = Number(process.env.EXIT_REPLAY_RATE ?? 400);
async function getJson(url: string): Promise<any> {
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
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let k = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (k < items.length) { const x = items[k++]; await fn(x); } }));
}
function cached<T>(file: string): T | null { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null; }

type B = { t: number; o: number; h: number; l: number; c: number };
const isCrypto = (x: Idea) => x.asset_type === 'crypto';
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

async function minuteBars(sym: string, crypto: boolean, startMs: number, endMs: number): Promise<B[]> {
  const s = new Date(startMs).toISOString().slice(0, 16), e = new Date(Math.min(endMs, NOW)).toISOString().slice(0, 16);
  const file = path.join(ROOT, 'stk', `${sym.replace('/', '_')}_${s}_${e}.json`.replace(/:/g, ''));
  const c = cached<B[]>(file); if (c) return c;
  const bars = crypto
    ? await pagedBars('https://data.alpaca.markets/v1beta3/crypto/us/bars', { symbols: sym, timeframe: '1Min', start: s + ':00Z', end: e + ':00Z' }, sym)
    : await pagedBars('https://data.alpaca.markets/v2/stocks/bars', { symbols: sym, timeframe: '1Min', start: s + ':00Z', end: e + ':00Z', adjustment: 'split', feed: 'sip' }, sym);
  fs.writeFileSync(file, JSON.stringify(bars));
  return bars;
}
async function dailyBars(sym: string, crypto: boolean, endDay: string): Promise<B[]> {
  const file = path.join(ROOT, 'day', `${sym.replace('/', '_')}_${endDay}.json`);
  const c = cached<B[]>(file); if (c) return c;
  const bars = crypto
    ? await pagedBars('https://data.alpaca.markets/v1beta3/crypto/us/bars', { symbols: sym, timeframe: '1Day', start: '2026-05-01T00:00:00Z' }, sym)
    : await pagedBars('https://data.alpaca.markets/v2/stocks/bars', { symbols: sym, timeframe: '1Day', start: '2026-05-01T00:00:00Z', adjustment: 'split', feed: 'sip' }, sym);
  fs.writeFileSync(file, JSON.stringify(bars));
  return bars;
}
async function optionMinuteBars(occ: string, startMs: number, endMs: number): Promise<B[]> {
  const s = new Date(startMs).toISOString().slice(0, 16), e = new Date(Math.min(endMs, NOW)).toISOString().slice(0, 16);
  const file = path.join(ROOT, 'opt', `${occ}_${s}_${e}.json`.replace(/:/g, ''));
  const c = cached<B[]>(file); if (c) return c;
  const bars = await pagedBars('https://data.alpaca.markets/v1beta1/options/bars', { symbols: occ, timeframe: '1Min', start: s + ':00Z', end: e + ':00Z' }, occ);
  fs.writeFileSync(file, JSON.stringify(bars));
  return bars;
}
async function gspcDailyClose(): Promise<Map<string, number>> {
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
interface Idea {
  id: string; symbol: string; direction: 'long' | 'short'; source: string; asset_type: string;
  option_type: 'call' | 'put' | null; strike_price: number | null; expiry_date: string | null;
  entry_price: number; entry_premium: number | null; stop_loss: number; target_price: number;
  ts: string; conv: number | null; holding_period: string; outcome_status: string; exit_price: number | null; exit_date: string | null;
}
const FILL_WINDOW_MIN = Number(process.env.EXIT_REPLAY_FILL_WINDOW_MIN ?? 390);
const MARKET_ENTRY = new Set(['flow', 'orb_scanner', 'zero_dte_desk', 'gex_scanner']);
const optRoot = (s: string) => (s === 'SPX' ? 'SPXW' : s.replace(/[.\-/]/g, ''));
function occOf(x: Idea): string {
  const d = String(x.expiry_date).slice(2, 10).replace(/-/g, '');
  return `${optRoot(x.symbol)}${d}${x.option_type === 'call' ? 'C' : 'P'}${String(Math.round(Number(x.strike_price) * 1000)).padStart(8, '0')}`;
}
const instrument = (x: Idea) => (x.asset_type === 'option' ? `${x.option_type}|${x.strike_price}|${String(x.expiry_date).slice(0, 10)}` : x.asset_type);

// ── per-symbol bar store with indicators ──────────────────────────────────
interface Store {
  bars: (B & { day: string; min: number })[];
  sessions: string[];                       // ordered session keys present in bars
  end5: boolean[]; ema5: (number | null)[]; atr5: (number | null)[];
  dDays: string[]; dEma: number[]; dAtr: number[];
}
function buildStore(raw: B[], daily: B[], crypto: boolean, scale?: (day: string) => number): Store {
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
function priorDaily(st: Store, day: string): { ema: number | null; atr: number | null } {
  let lo = 0, hi = st.dDays.length - 1, k = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (st.dDays[m] < day) { k = m; lo = m + 1; } else hi = m - 1; }
  if (k < 19) return { ema: null, atr: k >= 14 && Number.isFinite(st.dAtr[k]) ? st.dAtr[k] : null };
  return { ema: st.dEma[k], atr: Number.isFinite(st.dAtr[k]) ? st.dAtr[k] : null };
}

// ── main ──────────────────────────────────────────────────────────────────
interface Row {
  id: string; symbol: string; source: string; dir: 'long' | 'short'; kind: 'stock' | 'call' | 'put' | 'crypto';
  hp: string; conv: number | null; pubMs: number; pubDay: string; entryMs: number; entry: number; stop: number; target: number;
  horizonDays: number; tf: 'm5' | 'd1'; open: boolean; occ?: string;
  /** per fill variant: 'cons' (bar high) and 'mid' ((h+l)/2); stocks have only 'cons'. */
  v: Record<'cons' | 'mid', { eP: number | null; peak: number; peakEq: number; pnl: Partial<Record<ExitRuleId, number>>; pnlEq: Partial<Record<ExitRuleId, number>>; why: Partial<Record<ExitRuleId, string>> } | undefined>;
}

async function main() {
  const ideasFile = path.join(ROOT, 'ideas.json');
  if (!fs.existsSync(ideasFile)) throw new Error(`missing ${ideasFile} — dump trade_ideas first (docs/EXIT_RULE_REPLAY.md)`);
  const all: Idea[] = JSON.parse(fs.readFileSync(ideasFile, 'utf8'));
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
      horizonDays: p.days, tf, open: p.open, occ: isOpt ? occOf(x) : undefined, v: { cons: undefined, mid: undefined },
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
      }
      row.v[variant] = v;
    }
    rows.push(row);
  }
  console.log(`simulated ${rows.length} (requests ${requests})`, excl);

  // ── aggregate ─────────────────────────────────────────────────────────
  const days = rows.map((r) => r.pubDay).sort();
  const median = days[Math.floor(days.length / 2)];
  const halfOf = (r: Row) => (r.pubDay < median ? 'H1' : 'H2');
  const tercile = (() => { const c = rows.map((r) => r.conv).filter((v): v is number => v != null).sort((a, b) => a - b); return [c[Math.floor(c.length / 3)], c[Math.floor((2 * c.length) / 3)]]; })();
  const convBand = (r: Row) => (r.conv == null ? 'none' : r.conv < tercile[0] ? `low (<${tercile[0]})` : r.conv < tercile[1] ? `mid (${tercile[0]}–${tercile[1] - 1})` : `high (≥${tercile[1]})`);
  type Mode = { variant: 'cons' | 'mid'; eq: boolean };
  const val = (r: Row, rule: ExitRuleId, m: Mode): number | null => {
    const v = r.v[m.variant] ?? (r.kind === 'stock' || r.kind === 'crypto' ? r.v.cons : undefined);
    if (!v) return null; const x = (m.eq ? v.pnlEq : v.pnl)[rule]; return x == null ? null : x;
  };
  const peakOf = (r: Row, m: Mode) => { const v = r.v[m.variant] ?? (r.kind === 'stock' || r.kind === 'crypto' ? r.v.cons : undefined); return v ? (m.eq ? v.peakEq : v.peak) : 0; };
  function stats(rs: Row[], rule: ExitRuleId, m: Mode) {
    const xs = rs.map((r) => ({ r, p: val(r, rule, m) })).filter((z) => z.p != null) as Array<{ r: Row; p: number }>;
    xs.sort((a, b) => a.r.entryMs - b.r.entryMs);
    let cum = 0, hi = 0, dd = 0, win = 0, peak = 0;
    for (const z of xs) { cum += z.p; hi = Math.max(hi, cum); dd = Math.min(dd, cum - hi); if (z.p > 0) win++; peak += peakOf(z.r, m); }
    const n = xs.length;
    return { n, total: round(cum), winPct: n ? round((100 * win) / n, 1) : 0, expectancy: n ? round(cum / n) : 0, capture: peak > 0 ? round(cum / peak, 3) : null, peak: round(peak), maxDD: round(dd) };
  }
  const round = (v: number, d = 0) => Math.round(v * 10 ** d) / 10 ** d;
  const modes: Record<string, Mode> = { 'cons-1c': { variant: 'cons', eq: false }, 'cons-eq500': { variant: 'cons', eq: true }, 'mid-1c': { variant: 'mid', eq: false }, 'mid-eq500': { variant: 'mid', eq: true } };
  const dims: Record<string, (r: Row) => string> = {
    all: () => 'all', half: halfOf, engine: (r) => r.source, asset: (r) => (r.kind === 'stock' || r.kind === 'crypto' ? `${r.kind} ${r.dir}` : `${r.kind}`),
    holding: (r) => r.hp, conviction: convBand, horizonComplete: (r) => (r.open ? 'open (marked at last bar)' : 'complete'),
  };
  const tables: any = {};
  for (const [mk, m] of Object.entries(modes)) {
    tables[mk] = {};
    for (const [dk, f] of Object.entries(dims)) {
      const groups = new Map<string, Row[]>();
      for (const r of rows) (groups.get(f(r)) ?? groups.set(f(r), []).get(f(r))!).push(r);
      tables[mk][dk] = {};
      for (const [g, rs] of [...groups].sort()) {
        tables[mk][dk][g] = {};
        for (const rule of EXIT_RULES) tables[mk][dk][g][rule] = stats(rs, rule, m);
        tables[mk][dk][g].planOptionsOnly = stats(rs.filter((r) => r.kind === 'call' || r.kind === 'put'), 'plan', m);
      }
    }
  }
  // Verdict: beats plan in BOTH halves and survives removing its top-3 trades.
  const verdict: any = {};
  for (const [mk, m] of Object.entries(modes)) {
    verdict[mk] = {};
    for (const rule of EXIT_RULES) {
      if (rule === 'plan') continue;
      const pool0 = rule === 'opt_premium' ? rows.filter((r) => r.kind === 'call' || r.kind === 'put') : rows;
      const ds = pool0.map((r) => ({ r, d: (val(r, rule, m) ?? NaN) - (val(r, 'plan', m) ?? NaN) })).filter((z) => Number.isFinite(z.d));
      const sum = (zs: typeof ds) => round(zs.reduce((a, z) => a + z.d, 0));
      const top = [...ds].sort((a, b) => b.d - a.d).slice(0, 3);
      const exTop = sum(ds) - sum(top);
      const h1 = sum(ds.filter((z) => halfOf(z.r) === 'H1')), h2 = sum(ds.filter((z) => halfOf(z.r) === 'H2'));
      verdict[mk][rule] = {
        n: ds.length, deltaVsPlan: sum(ds), deltaH1: h1, deltaH2: h2, deltaExTop3: round(exTop),
        top3: top.map((z) => `${z.r.symbol} ${z.r.kind} ${z.r.pubDay} ${round(z.d)}`),
        better: ds.filter((z) => z.d > 0.005).length, worse: ds.filter((z) => z.d < -0.005).length,
        wins: h1 > 0 && h2 > 0 && exTop > 0,
      };
    }
  }
  const out = { generatedAt: new Date().toISOString(), medianSplit: median, convTerciles: tercile, ideasLoaded: all.length, exclusions: excl, simulated: rows.length, labels: EXIT_RULE_LABEL, verdict, tables, rows };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));

  // Console summary.
  for (const mk of Object.keys(modes)) {
    console.log(`\n=== ${mk} ===`);
    for (const g of ['all', 'H1', 'H2']) {
      const t = g === 'all' ? tables[mk].all.all : tables[mk].half[g];
      if (!t) continue;
      console.log(`-- ${g}`);
      for (const rule of EXIT_RULES) { const s = t[rule]; console.log(`${rule.padEnd(14)} n=${String(s.n).padStart(3)} $${String(s.total).padStart(7)} win ${s.winPct}% exp ${s.expectancy} cap ${s.capture} dd ${s.maxDD}`); }
      console.log(`plan(opt only) n=${t.planOptionsOnly.n} $${t.planOptionsOnly.total}`);
    }
    for (const [r, v] of Object.entries<any>(verdict[mk])) console.log(`${r.padEnd(14)} Δ ${v.deltaVsPlan} H1 ${v.deltaH1} H2 ${v.deltaH2} exTop3 ${v.deltaExTop3} ${v.better}/${v.worse} ${v.wins ? 'WINS' : ''}`);
  }
  console.log(`\nwrote ${OUT} (requests ${requests})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
