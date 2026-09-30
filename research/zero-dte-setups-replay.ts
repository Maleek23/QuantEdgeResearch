/**
 * 0DTE CLASSIC SETUPS + LOTTO SNIPER — REPLAY ON REAL OPTION BARS
 * ================================================================
 * Question: which classic intraday setups, bought as SAME-DAY-EXPIRY options,
 * made money on real option prices — and did that hold in BOTH walk-forward
 * halves? (Walk-forward law: a short-window win is a regime artifact until it
 * holds in both halves.) Stock-R replays (research/flush-reclaim-replay.ts)
 * cannot answer this: 0DTE options are convex, so the question must be asked
 * of option prices.
 *
 * Setups (server/zero-dte-sniper-core.ts — the SAME detectors the live engine
 * runs), each long (calls) and mirrored short (puts), on 1-minute stock bars:
 *   orb15 / orb30 · vwap_cross · level_reclaim · pd_break_hold ·
 *   failed_breakout · power_hour · flush_reclaim ·
 *   liquidity_sweep (+ double_sweep, the second side of a both-sides day) ·
 *   reactive_zone (every holding touch of a zone that already reacted; touch
 *   number and zone source are split variables; price-derived zones only —
 *   there are no historical GEX chains, so GEX zones are live-only)
 * Every trigger also carries time-of-day RVOL (trigger-bar volume ÷ the same
 * minute's average over the prior 20 sessions) and is reported at ≥1.5 vs <1.5.
 * SPX: Alpaca's SPXW history is recent and sparse, so SPY is the SPX proxy.
 *
 * 0DTE DAYS are DISCOVERED, not assumed: Alpaca's option-contracts API
 * (status=inactive for expired) lists every expiry per underlying per month; a
 * session is a 0DTE session for a symbol when a contract expired that day.
 *
 * CONTRACT at the trigger (the trigger is known at the close of trigger bar m):
 *   otm1  — the first strike out of the money at the trigger close.
 *   lotto — the cheapest OTM contract whose bar AT minute m closed $0.05–$0.50
 *           with volume > 0 (ties → nearer the money).
 *   lotto_near — (added) the NEAREST-the-money OTM contract inside that band:
 *           the literal cheapest lands on nickel strikes whose "2×" is a
 *           one-tick bounce, so the near-money lotto is measured alongside.
 *   Lotto fills below $0.05 are not counted (reason 'below_band').
 * ENTRY = the HIGH of that contract's minute m+1 bar (conservative fill; if it
 * did not trade in m+1, the first bar within the next 3 minutes; else no fill).
 * Historical option QUOTES are not available on this data plan, so no bid/ask.
 *
 * OUTCOME from the contract's real 1-minute bars after the entry bar to 16:00,
 * and its expiry value = intrinsic at the underlying's 15:59 bar close:
 *   max multiple, minutes to 2×/3×/5×, worthless %, and P&L per $1 of premium
 *   under: hold · take2x (bar high) · take2x_close (1-min close) · half3x ·
 *   stop50 · stop50_take2x (see EXIT_LABEL in the core).
 *
 * SURVIVAL (per setup × side × contract variant × exit): ≥ 20 trades in each
 * half, mean P&L > 0 in BOTH halves, and still > 0 in both halves with the
 * single best trade of that half removed (lotto P&L is one-outlier-driven).
 *
 * Caveats written into the doc: option bar highs overstate fills on thin
 * contracts; the universe is today's liquid names (survivorship); multiple
 * comparisons (8 setups × 2 sides × 2 variants × 6 exits) mean some cells pass
 * by chance.
 *
 * Data: Alpaca stock 1m bars (SIP, split-adjusted), option contracts, and
 * option 1m bars (v1beta1, history from ~Feb 2024). Everything is cached under
 * .cache/zdte-replay/. Never touches a database.
 *
 * Run: npx tsx research/zero-dte-setups-replay.ts [--from 2025-10-01] [--to 2026-09-30] [--split 2026-04-01] [--symbols SPY,AMD]
 *   → research/zero-dte-setups-results.json + docs/ZERO_DTE_SETUPS_REPLAY.md
 *     (+ .cache/zdte-replay/trades.json with every trade)
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import {
  detectSetups, evaluateOptionPath, pickContract, hhmm, levelStopTime, zoneRoundStep, LOTTO_BAND,
  SETUP_IDS, SETUP_LABEL, EXIT_RULES, EXIT_LABEL, CONTRACT_VARIANTS, VARIANT_LABEL,
  type ContractCandidate, type ContractVariant, type DayContext, type ExitRule, type MinuteBar, type OptBar, type SetupId, type Side,
} from '../server/zero-dte-sniper-core';

dotenv.config({ path: process.env.ENV_FILE || '/Users/abdulmalik/UnTitld/QuantEdgeee/.env', quiet: true } as any);
const KEY = process.env.ALPACA_API_KEY, SECRET = process.env.ALPACA_SECRET_KEY;
if (!KEY || !SECRET) { console.error('ALPACA_API_KEY / ALPACA_SECRET_KEY missing'); process.exit(1); }

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const INDEX = ['SPY', 'QQQ', 'IWM'];
const SINGLES = ['TSLA', 'NVDA', 'AMD', 'META', 'MSTR', 'AAPL', 'AMZN', 'GOOGL', 'MSFT', 'AVGO', 'PLTR', 'COIN', 'NFLX', 'SMCI', 'MU', 'HOOD', 'BE'];
const SYMBOLS = (arg('--symbols') ?? [...INDEX, ...SINGLES].join(',')).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
/**
 * WINDOW (operator, 2026-09-30): results cover the LAST 12 MONTHS only — trades
 * from --from (default 2025-10-01) through --to (default 2026-09-30). Bars
 * before --from are fetched only as warm-up (prior-day levels, ATR20, the
 * 20-session RVOL baseline); no trade before --from counts. Walk-forward halves
 * are fixed calendar halves split at --split (default 2026-04-01).
 */
const FROM = arg('--from') ?? '2025-10-01';
const TO = arg('--to') ?? '2026-09-30';
const SPLIT = arg('--split') ?? '2026-04-01';
const START = arg('--start') ?? new Date(Date.parse(`${FROM}T12:00:00Z`) - 60 * 86400_000).toISOString().slice(0, 10); // warm-up only
const SESSION_RATE = Number(arg('--rate-session') ?? 90);   // requests/min while the market is open (shared account budget)
const OFF_RATE = Number(arg('--rate') ?? 170);
const MIN_HALF_N = 20;

const ROOT = path.resolve(process.cwd(), '.cache/zdte-replay');
for (const d of ['stock', 'contracts', 'opt']) fs.mkdirSync(path.join(ROOT, d), { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── ET clock (offset memoised per UTC day; bars are 04:00–20:00 ET, far from the 02:00 DST switch) ──
const offCache = new Map<string, number>();
const dtf = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
function etOffsetMin(ms: number): number {
  const k = new Date(ms).toISOString().slice(0, 10);
  let o = offCache.get(k);
  if (o == null) {
    const noon = Date.parse(`${k}T16:00:00Z`);
    const p: Record<string, string> = {}; for (const x of dtf.formatToParts(new Date(noon))) p[x.type] = x.value;
    o = (Number(p.hour) % 24) * 60 + Number(p.minute) - 16 * 60; // -240 or -300
    offCache.set(k, o);
  }
  return o;
}
function et(ms: number): { day: string; min: number } {
  const local = ms + etOffsetMin(ms) * 60_000;
  const d = new Date(local);
  return { day: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
function inCashHours(): boolean {
  const n = Date.now(); const e = et(n); const wd = new Date(n + etOffsetMin(n) * 60_000).getUTCDay();
  return wd >= 1 && wd <= 5 && e.min >= 9 * 60 + 25 && e.min <= 16 * 60 + 15;
}

// ── one serial, rate-limited HTTP lane ──────────────────────────────────────
let lastCall = 0, requests = 0;
async function getJson(url: string): Promise<any> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const spacing = 60_000 / (inCashHours() ? SESSION_RATE : OFF_RATE);
    const wait = spacing - (Date.now() - lastCall);
    if (wait > 0) await sleep(wait);
    lastCall = Date.now(); requests++;
    let r: Response;
    try { r = await fetch(url, { headers: { 'APCA-API-KEY-ID': KEY!, 'APCA-API-SECRET-KEY': SECRET! } }); } catch { await sleep(3000); continue; }
    if (r.status === 429) { console.warn('  429 — backing off 20 s'); await sleep(20_000); continue; }
    if (r.status >= 500) { await sleep(3000); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)} ← ${url.replace(/\?.*/, '')}`);
    return r.json();
  }
  throw new Error(`gave up after retries: ${url.replace(/\?.*/, '')}`);
}

// ── date helpers ────────────────────────────────────────────────────────────
function lastCompleteSession(): string {
  // Data must be ≥ 15 min old; today's session counts once it is past 16:20 ET.
  const n = Date.now(); const e = et(n);
  if (e.min >= 16 * 60 + 20) return e.day;
  const y = new Date(Date.parse(`${e.day}T12:00:00Z`) - 86400_000);
  return y.toISOString().slice(0, 10);
}
const END = [TO, lastCompleteSession()].sort()[0];
function dayBefore(d: string): string { return new Date(Date.parse(`${d}T12:00:00Z`) - 86400_000).toISOString().slice(0, 10); }
function months(from: string, to: string): string[] {
  const out: string[] = []; let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7));
  const ey = Number(to.slice(0, 4)), em = Number(to.slice(5, 7));
  while (y < ey || (y === ey && m <= em)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}
const monthEnd = (ym: string) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

// ── stock bars (compact, per month) ─────────────────────────────────────────
type SRow = [number, number, number, number, number, number, number]; // tSec o h l c v vw
async function stockMonth(sym: string, ym: string): Promise<SRow[]> {
  const complete = monthEnd(ym) < END;
  // A month still in progress is cached under its END date, so a later run re-reads it.
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

// ── option contracts (per month; discovers which days had a same-day expiry) ──
type CRow = [string, string, 'C' | 'P', number]; // occ, expiry, type, strike
async function contractsMonth(sym: string, ym: string, lo: number, hi: number): Promise<CRow[]> {
  const complete = monthEnd(ym) < END;
  const file = path.join(ROOT, 'contracts', complete ? `${sym}-${ym}.json` : `${sym}-${ym}-to-${END}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const out: CRow[] = [];
  const statuses = complete ? ['inactive'] : ['inactive', 'active'];
  for (const status of statuses) {
    let token: string | undefined;
    for (let page = 0; page < 80; page++) {
      const u = new URL('https://paper-api.alpaca.markets/v2/options/contracts');
      u.searchParams.set('underlying_symbols', sym); u.searchParams.set('status', status);
      u.searchParams.set('expiration_date_gte', `${ym}-01`); u.searchParams.set('expiration_date_lte', monthEnd(ym) < END ? monthEnd(ym) : END);
      u.searchParams.set('strike_price_gte', lo.toFixed(2)); u.searchParams.set('strike_price_lte', hi.toFixed(2)); u.searchParams.set('limit', '10000');
      if (token) u.searchParams.set('page_token', token);
      const j = await getJson(u.toString());
      for (const c of j.option_contracts ?? []) {
        if (c.root_symbol !== sym) continue; // adjusted deliverables (AMD1 …) are a different instrument
        out.push([c.symbol, c.expiration_date, c.type === 'call' ? 'C' : 'P', Number(c.strike_price)]);
      }
      token = j.next_page_token || undefined;
      if (!token) break;
    }
  }
  fs.writeFileSync(file, JSON.stringify(out));
  return out;
}

// ── option 1m bars for one symbol-day-type band ─────────────────────────────
type ORow = [number, number, number, number, number, number]; // tSec o h l c v
async function optionBars(sym: string, day: string, type: 'C' | 'P', occs: string[]): Promise<Record<string, ORow[]>> {
  const dir = path.join(ROOT, 'opt', sym); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${day}-${type}.json`);
  if (fs.existsSync(file)) {
    const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (occs.every((o) => o in cached.bars)) return cached.bars;
  }
  const bars: Record<string, ORow[]> = {};
  for (const o of occs) bars[o] = [];
  // Option bars inside the last 15 minutes need an OPRA agreement (HTTP 403) — clamp, and don't cache a partial day.
  const fullEnd = Date.parse(`${day}T21:15:00Z`);
  const endMs = Math.min(fullEnd, Date.now() - 16 * 60_000);
  for (let i = 0; i < occs.length; i += 100) {
    const chunk = occs.slice(i, i + 100);
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

// ── replay ──────────────────────────────────────────────────────────────────
interface Trade {
  sym: string; day: string; group: 'index' | 'single'; setup: SetupId; side: Side; variant: ContractVariant;
  trigMin: number; trigPx: number; level: number; levelName: string; occ: string; strike: number; selPrice: number | null; entry: number; entryMin: number;
  /** Trigger-bar volume ÷ the same minute's average over the prior 20 sessions (null when no baseline). */
  rvol: number | null;
  touch: number | null; zoneKind: string | null;
  maxMult: number; minsTo: { x2: number | null; x3: number | null; x5: number | null }; worthless: boolean; pnl: Record<ExitRule, number>;
}
interface Miss { sym: string; day: string; setup: SetupId; side: Side; variant: ContractVariant; reason: 'no_contract' | 'no_fill' | 'below_band' }
type TrigRec = { sym: string; day: string; setup: SetupId; side: Side; min: number; rvol: number | null; touch: number | null; levelName: string };

async function replaySymbol(sym: string, trades: Trade[], misses: Miss[], zeroDays: Map<string, number>, allTriggers: TrigRec[]) {
  const group = INDEX.includes(sym) ? 'index' : 'single';
  const band = group === 'index' ? 0.03 : 0.08;
  // 1. stock bars → per-day arrays
  const byDay = new Map<string, { rth: MinuteBar[]; pre: MinuteBar[] }>();
  const monthRange = new Map<string, { lo: number; hi: number }>();
  for (const ym of months(START.slice(0, 7), END.slice(0, 7))) {
    const rows = await stockMonth(sym, ym);
    let lo = Infinity, hi = -Infinity;
    for (const r of rows) {
      const t = r[0] * 1000; const e = et(t);
      if (e.day < START || e.day > END) continue;
      const b: MinuteBar = { t, o: r[1], h: r[2], l: r[3], c: r[4], v: r[5], vw: r[6], min: e.min };
      let d = byDay.get(e.day); if (!d) { d = { rth: [], pre: [] }; byDay.set(e.day, d); }
      if (e.min >= 570 && e.min < 960) { d.rth.push(b); lo = Math.min(lo, b.l); hi = Math.max(hi, b.h); }
      else if (e.min >= 240 && e.min < 570) d.pre.push(b);
    }
    if (Number.isFinite(lo)) monthRange.set(ym, { lo, hi });
  }
  const days = [...byDay.keys()].filter((d) => byDay.get(d)!.rth.length >= 300).sort();
  const daily = days.map((d) => { const r = byDay.get(d)!.rth; return { d, h: Math.max(...r.map((b) => b.h)), l: Math.min(...r.map((b) => b.l)), c: r[r.length - 1].c }; });
  // Volume by minute-of-day per session, for time-of-day RVOL (NaN = no bar that minute).
  const volByMin = days.map((d) => { const a = new Float64Array(390).fill(NaN); for (const b of byDay.get(d)!.rth) a[b.min - 570] = b.v; return a; });
  const rvolAt = (i: number, min: number, v: number): number | null => {
    const k = min - 570; let s = 0, n = 0;
    for (let j = Math.max(0, i - 20); j < i; j++) { const x = volByMin[j][k]; if (Number.isFinite(x)) { s += x; n++; } }
    return n >= 10 && s > 0 ? v / (s / n) : null;
  };

  // 2. contracts → 0DTE days and strikes per expiry
  const strikes = new Map<string, CRow[]>(); // expiry → rows
  for (const [ym, rg] of monthRange) {
    const rows = await contractsMonth(sym, ym, rg.lo * 0.85, rg.hi * 1.15);
    for (const c of rows) { const a = strikes.get(c[1]) ?? []; a.push(c); strikes.set(c[1], a); }
  }
  let nZero = 0, nTrig = 0;
  for (let i = 21; i < days.length; i++) {
    const day = days[i];
    if (day < FROM || !strikes.has(day)) continue; // warm-up sessions never trade
    const { rth, pre } = byDay.get(day)!;
    if (rth[rth.length - 1].min < 959 - 5) continue; // early close — skip
    nZero++; zeroDays.set(day, (zeroDays.get(day) ?? 0) + 1);
    const pd = daily[i - 1];
    const prev20 = daily.slice(i - 20, i);
    const ctx: DayContext = {
      pdh: pd.h, pdl: pd.l, pdc: pd.c,
      preLow: pre.length ? Math.min(...pre.map((b) => b.l)) : null, preHigh: pre.length ? Math.max(...pre.map((b) => b.h)) : null,
      atr20: prev20.reduce((a, x) => a + (x.h - x.l), 0) / prev20.length,
    };
    // No GEX zones here: historical option chains do not exist, so reactive zones are price-derived only.
    const trig = detectSetups(rth, ctx, undefined, { zoneRoundStep: zoneRoundStep(sym, rth[0].o) });
    if (!trig.length) continue;
    nTrig += trig.length;
    const rv = new Map(trig.map((t) => [t, rvolAt(i, t.min, rth[t.idx].v)]));
    for (const t of trig) allTriggers.push({ sym, day, setup: t.setup, side: t.side, min: t.min, rvol: rv.get(t) ?? null, touch: t.touch ?? null, levelName: t.levelName });
    const settle = rth[rth.length - 1].c;
    const dayLo = Math.min(...rth.map((b) => b.l)), dayHi = Math.max(...rth.map((b) => b.h));
    const chain = strikes.get(day)!;
    for (const type of ['C', 'P'] as const) {
      const need = trig.filter((t) => (t.side === 'long') === (type === 'C'));
      if (!need.length) continue;
      // Fetch band = the day's range extended OTM (a data-fetch band only; selection below uses trigger-time data).
      const occs = chain.filter((c) => c[2] === type && (type === 'C' ? c[3] >= dayLo * 0.995 && c[3] <= dayHi * (1 + band) : c[3] <= dayHi * 1.005 && c[3] >= dayLo * (1 - band)))
        .sort((a, b) => a[3] - b[3]).map((c) => c[0]);
      if (!occs.length) { for (const t of need) for (const v of CONTRACT_VARIANTS) misses.push({ sym, day, setup: t.setup, side: t.side, variant: v, reason: 'no_contract' }); continue; }
      let ob: Record<string, ORow[]>;
      try { ob = await optionBars(sym, day, type, occs); }
      catch (e) {
        console.log(`  ${sym} ${day} ${type}: option bars unavailable (${(e as Error).message.slice(0, 80)}) — skipped`);
        for (const t of need) for (const v of CONTRACT_VARIANTS) misses.push({ sym, day, setup: t.setup, side: t.side, variant: v, reason: 'no_fill' });
        continue;
      }
      const meta = new Map(chain.filter((c) => c[2] === type).map((c) => [c[0], c[3]]));
      const closeT = Date.parse(`${day}T00:00:00Z`) / 1000 + (16 * 60 - etOffsetMin(rth[0].t)) * 60; // 16:00 ET in UTC seconds
      for (const t of need) {
        const trigT = t.t / 1000; // bar start (s)
        const cands: ContractCandidate[] = occs.map((occ) => {
          const bar = ob[occ]?.find((r) => r[0] === trigT);
          return { occ, strike: meta.get(occ)!, type: type === 'C' ? 'call' : 'put', price: bar ? bar[4] : null, volume: bar ? bar[5] : 0 };
        });
        const lvlExit = levelStopTime(rth, t.idx, t.level, t.side);
        for (const variant of CONTRACT_VARIANTS) {
          const pick = pickContract(variant, cands, t.price, cands[0].type);
          if (!pick) { misses.push({ sym, day, setup: t.setup, side: t.side, variant, reason: 'no_contract' }); continue; }
          const rows = ob[pick.occ] ?? [];
          const eb = rows.find((r) => r[0] > trigT && r[0] <= trigT + 240);
          if (!eb || !(eb[2] > 0)) { misses.push({ sym, day, setup: t.setup, side: t.side, variant, reason: 'no_fill' }); continue; }
          // A lotto filled under $0.05 is a nickel strike whose "multiples" are one-tick bounces — not counted.
          if (variant !== 'otm1' && eb[2] < LOTTO_BAND.min) { misses.push({ sym, day, setup: t.setup, side: t.side, variant, reason: 'below_band' }); continue; }
          const after: OptBar[] = rows.filter((r) => r[0] > eb[0] && r[0] < closeT).map((r) => ({ t: r[0] * 1000, o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] }));
          const intrinsic = type === 'C' ? Math.max(0, settle - pick.strike) : Math.max(0, pick.strike - settle);
          const o = evaluateOptionPath(eb[2], after, intrinsic, eb[0] * 1000, lvlExit);
          const rvol = rv.get(t) ?? null;
          trades.push({
            sym, day, group, setup: t.setup, side: t.side, variant, trigMin: t.min, trigPx: t.price, level: +t.level.toFixed(4), levelName: t.levelName,
            occ: pick.occ, strike: pick.strike, selPrice: pick.price, entry: eb[2], entryMin: et(eb[0] * 1000).min,
            rvol: rvol != null ? +rvol.toFixed(2) : null, touch: t.touch ?? null, zoneKind: t.zoneKind ?? null,
            maxMult: +o.maxMult.toFixed(3), minsTo: o.minsTo, worthless: o.worthless,
            pnl: Object.fromEntries(EXIT_RULES.map((k) => [k, +o.pnl[k].toFixed(4)])) as Record<ExitRule, number>,
          });
        }
      }
    }
  }
  console.log(`  ${sym}: ${days.length} sessions, ${nZero} 0DTE sessions, ${nTrig} triggers, ${requests} requests so far (${Math.round((Date.now() - T_START) / 60000)} min)`);
}
const T_START = Date.now();

// ── stats ───────────────────────────────────────────────────────────────────
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const median = (a: number[]) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const r3 = (x: number) => (Number.isFinite(x) ? +x.toFixed(3) : null);
function exBest(a: number[]): number { if (a.length < 2) return NaN; const s = [...a].sort((x, y) => y - x); return mean(s.slice(1)); }
function summarise(ts: Trade[]) {
  const n = ts.length;
  if (!n) return { n: 0 };
  const pct = (f: (t: Trade) => boolean) => +((ts.filter(f).length / n) * 100).toFixed(1);
  const mins = (k: 'x2' | 'x3' | 'x5') => { const a = ts.map((t) => t.minsTo[k]).filter((x): x is number => x != null); return a.length ? median(a) : null; };
  return {
    n,
    hit2x: pct((t) => t.maxMult >= 2), hit3x: pct((t) => t.maxMult >= 3), hit5x: pct((t) => t.maxMult >= 5),
    worthless: pct((t) => t.worthless),
    medMinsTo2x: mins('x2'), medMinsTo3x: mins('x3'),
    medEntry: r3(median(ts.map((t) => t.entry))),
    exp: Object.fromEntries(EXIT_RULES.map((k) => [k, r3(mean(ts.map((t) => t.pnl[k])))])),
    expExBest: Object.fromEntries(EXIT_RULES.map((k) => [k, r3(exBest(ts.map((t) => t.pnl[k])))])),
    medianHold: r3(median(ts.map((t) => t.pnl.hold))),
  };
}
type Survivor = { exit: ExitRule; n: number; h1n: number; h2n: number; h1: number; h2: number; h1ExBest: number; h2ExBest: number; all: number };
/** Exits whose mean P&L is > 0 in BOTH halves, with and without each half's best trade (≥ MIN_HALF_N per half). */
function survivors(ts: Trade[], split: string): Survivor[] {
  const h1 = ts.filter((t) => t.day < split), h2 = ts.filter((t) => t.day >= split);
  const out: Survivor[] = [];
  if (h1.length < MIN_HALF_N || h2.length < MIN_HALF_N) return out;
  for (const k of EXIT_RULES) {
    const a = h1.map((t) => t.pnl[k]), b = h2.map((t) => t.pnl[k]);
    const m1 = mean(a), m2 = mean(b), e1 = exBest(a), e2 = exBest(b);
    if (m1 > 0 && m2 > 0 && e1 > 0 && e2 > 0) out.push({ exit: k, n: ts.length, h1n: h1.length, h2n: h2.length, h1: r3(m1)!, h2: r3(m2)!, h1ExBest: r3(e1)!, h2ExBest: r3(e2)!, all: r3(mean(ts.map((t) => t.pnl[k])))! });
  }
  return out.sort((x, y) => Math.min(y.h1, y.h2) - Math.min(x.h1, x.h2));
}
const TOD = [
  { k: '09:35-10:59', lo: 575, hi: 659 }, { k: '11:00-12:59', lo: 660, hi: 779 },
  { k: '13:00-14:29', lo: 780, hi: 869 }, { k: '14:30-15:30', lo: 870, hi: 930 },
];
const RVOL_CUT = 1.5;
const TOUCH_BUCKETS: Array<{ k: string; f: (t: Trade) => boolean }> = [
  { k: 'touch 2', f: (t) => t.touch === 2 }, { k: 'touch 3', f: (t) => t.touch === 3 },
  { k: 'touch 4', f: (t) => t.touch === 4 }, { k: 'touch 5+', f: (t) => (t.touch ?? 0) >= 5 },
];
const sweepLevelClass = (n: string) => (/prior-day/.test(n) ? 'prior-day' : /pre-market/.test(n) ? 'pre-market' : /^OR15/.test(n) ? 'opening range' : /equal/.test(n) ? 'equal highs/lows' : 'other');

async function main() {
  console.log(`0DTE setups replay ${START} → ${END} · ${SYMBOLS.length} symbols · rate ${SESSION_RATE}/min in session, ${OFF_RATE}/min otherwise`);
  const trades: Trade[] = []; const misses: Miss[] = []; const zeroDays = new Map<string, number>();
  const allTriggers: TrigRec[] = [];
  const t0 = Date.now();
  for (const sym of SYMBOLS) {
    try { await replaySymbol(sym, trades, misses, zeroDays, allTriggers); }
    catch (e) { console.log(`  ${sym}: FAILED ${(e as Error).message}`); }
    if (global.gc) global.gc();
  }
  const days = [...new Set(trades.map((t) => t.day))].sort();
  const split = SPLIT;
  void days;
  const cells: any[] = [];
  const subSurvivors: Array<{ label: string; setup: SetupId; side: Side; variant: ContractVariant; subset: string } & Survivor> = [];
  for (const setup of SETUP_IDS) for (const side of ['long', 'short'] as Side[]) for (const variant of CONTRACT_VARIANTS) {
    const base = trades.filter((t) => t.setup === setup && t.side === side && t.variant === variant);
    const h1 = base.filter((t) => t.day < split), h2 = base.filter((t) => t.day >= split);
    const surv = survivors(base, split);
    const subsets: Array<{ k: string; ts: Trade[] }> = [
      { k: `RVOL ≥ ${RVOL_CUT}`, ts: base.filter((t) => t.rvol != null && t.rvol >= RVOL_CUT) },
      { k: `RVOL < ${RVOL_CUT}`, ts: base.filter((t) => t.rvol != null && t.rvol < RVOL_CUT) },
      { k: 'index ETFs', ts: base.filter((t) => t.group === 'index') },
      { k: 'single names', ts: base.filter((t) => t.group === 'single') },
    ];
    if (setup === 'reactive_zone') {
      for (const b of TOUCH_BUCKETS) subsets.push({ k: b.k, ts: base.filter(b.f) });
      for (const zk of ['prior_day', 'premarket', 'round', 'session_pivot']) subsets.push({ k: `zone ${zk}`, ts: base.filter((t) => t.zoneKind === zk) });
    }
    if (setup === 'liquidity_sweep' || setup === 'double_sweep') for (const lc of ['prior-day', 'pre-market', 'opening range', 'equal highs/lows']) subsets.push({ k: `swept ${lc}`, ts: base.filter((t) => sweepLevelClass(t.levelName) === lc) });
    const bySubset: Record<string, unknown> = {};
    for (const s of subsets) {
      const sv = survivors(s.ts, split);
      bySubset[s.k] = { all: summarise(s.ts), firstHalf: summarise(s.ts.filter((t) => t.day < split)), secondHalf: summarise(s.ts.filter((t) => t.day >= split)), survivingExits: sv };
      for (const x of sv) subSurvivors.push({ label: `${SETUP_LABEL[setup]} · ${side} · ${VARIANT_LABEL[variant]} · ${s.k}`, setup, side, variant, subset: s.k, ...x });
    }
    cells.push({
      setup, side, variant, label: `${SETUP_LABEL[setup]} · ${side} · ${VARIANT_LABEL[variant]}`,
      all: summarise(base), firstHalf: summarise(h1), secondHalf: summarise(h2),
      bySubset,
      byTod: Object.fromEntries(TOD.map((b) => [b.k, summarise(base.filter((t) => t.trigMin >= b.lo && t.trigMin <= b.hi))])),
      misses: Object.fromEntries((['no_contract', 'no_fill', 'below_band'] as const).map((r) => [r, misses.filter((m) => m.setup === setup && m.side === side && m.variant === variant && m.reason === r).length])),
      survives: surv.length > 0, survivingExits: surv, bestExit: surv[0]?.exit ?? null,
    });
  }
  const bySymbol = Object.fromEntries(SYMBOLS.map((s) => {
    const ds = [...new Set(allTriggers.filter((t) => t.sym === s).map((t) => t.day))];
    const wk: Record<string, number> = {};
    for (const d of ds) { const w = new Date(`${d}T12:00:00Z`).toUTCString().slice(0, 3); wk[w] = (wk[w] ?? 0) + 1; }
    return [s, { zeroDteSessionsWithTriggers: ds.length, first: ds.sort()[0] ?? null, byWeekday: wk, trades: trades.filter((t) => t.sym === s).length }];
  }));
  const report = {
    generatedAt: new Date().toISOString(), window: { from: FROM, to: END, warmupFrom: START, halves: [`${FROM} → ${dayBefore(SPLIT)}`, `${SPLIT} → ${END}`] }, split, symbols: SYMBOLS,
    minHalfN: MIN_HALF_N, rvolCut: RVOL_CUT, exits: EXIT_LABEL, requests, runtimeSec: Math.round((Date.now() - t0) / 1000),
    totals: { trades: trades.length, misses: misses.length, triggers: allTriggers.length, zeroDteSymbolSessions: [...zeroDays.values()].reduce((a, b) => a + b, 0) },
    bySymbol, cells, subSurvivors,
    example_AMD_2026_09_30: { triggers: allTriggers.filter((t) => t.sym === 'AMD' && t.day === '2026-09-30').map((t) => ({ ...t, at: hhmm(t.min) })), trades: trades.filter((t) => t.sym === 'AMD' && t.day === '2026-09-30') },
  };
  fs.writeFileSync(path.resolve(process.cwd(), 'research/zero-dte-setups-results.json'), JSON.stringify(report, null, 1));
  writeDoc(report);
  // Every trade, one JSON object per line (a single JSON.stringify of ~10^5–10^6 trades can exceed V8's string limit).
  try {
    const fd = fs.openSync(path.join(ROOT, 'trades.jsonl'), 'w');
    for (let i = 0; i < trades.length; i += 5000) fs.writeSync(fd, trades.slice(i, i + 5000).map((t) => JSON.stringify(t)).join('\n') + '\n');
    fs.closeSync(fd);
  } catch (e) { console.warn(`trades.jsonl not written: ${(e as Error).message}`); }
  console.log(`\n${trades.length} trades · split ${split} · ${requests} requests · ${report.runtimeSec}s`);
  for (const c of cells) {
    const a = c.all; if (!a.n) continue;
    console.log(`${c.survives ? 'SURVIVES' : '        '} ${c.label.padEnd(72)} n=${String(a.n).padStart(5)} 2×${String(a.hit2x).padStart(5)}% 0=${String(a.worthless).padStart(5)}% hold ${a.exp.hold} · H1 ${c.firstHalf.exp?.hold} H2 ${c.secondHalf.exp?.hold}${c.bestExit ? ` · best ${c.bestExit}` : ''}`);
  }
  console.log(`\nsub-cell survivors: ${subSurvivors.length}`);
  for (const s of subSurvivors) console.log(`  ${s.label} · ${s.exit} n=${s.n} H1 ${s.h1} H2 ${s.h2}`);
}

// ── markdown ────────────────────────────────────────────────────────────────
function writeDoc(rep: any) {
  const f = (x: any) => (x == null || Number.isNaN(x) ? '—' : typeof x === 'number' ? (Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(2)) : String(x));
  const name = (c: any) => `${SETUP_LABEL[c.setup as SetupId]} | ${c.side} | ${VARIANT_LABEL[c.variant as ContractVariant]}`;
  const L: string[] = [];
  L.push('# 0DTE classic setups + lotto sniper — replay on real option bars', '');
  L.push(`**Window: trades ${rep.window.from} → ${rep.window.to} (last 12 months only; bars from ${rep.window.warmupFrom} used as warm-up, never traded). Walk-forward halves: H1 ${rep.window.halves[0]} · H2 ${rep.window.halves[1]}.**`, '');
  L.push(`Generated ${rep.generatedAt} by \`research/zero-dte-setups-replay.ts\` (\`--from ${rep.window.from} --to ${rep.window.to} --split ${rep.split}\`) · ${rep.totals.trades} option trades from ${rep.totals.triggers} stock triggers on ${rep.totals.zeroDteSymbolSessions} symbol-sessions with a same-day expiry.`, '');
  L.push('Status: **measuring**. Nothing here is validated until it also holds live.', '');
  L.push('## Verdict — what survived both halves (whole cells)', '');
  const surv = rep.cells.filter((c: any) => c.survives);
  if (!surv.length) L.push('**Nothing survived.** No setup × side × contract × exit combination had ≥ 20 trades per half and positive expectancy in both halves with each half\'s best trade removed.', '');
  else {
    L.push('| setup | side | contract | exit | n | H1 exp | H2 exp | H1 ex-best | H2 ex-best | 2× hit % | worthless % |', '|---|---|---|---|---|---|---|---|---|---|---|');
    for (const c of surv) for (const s of c.survivingExits) L.push(`| ${name(c)} | ${s.exit} | ${c.all.n} | ${f(s.h1)} | ${f(s.h2)} | ${f(s.h1ExBest)} | ${f(s.h2ExBest)} | ${f(c.all.hit2x)} | ${f(c.all.worthless)} |`);
    L.push('');
  }
  L.push('Expectancy = mean P&L per $1 of premium paid (−1.00 = total loss). "ex-best" = the half\'s mean with its single best trade removed.', '');
  L.push('## Sub-cell survivors (RVOL split, index vs singles, zone touch / source, sweep level)', '');
  L.push('These are MORE comparisons on top of the cells above — treat them as hypotheses for live measuring, not as findings.', '');
  if (!rep.subSurvivors.length) L.push('None.', '');
  else {
    L.push('| setup · side · contract · subset | exit | n (H1/H2) | H1 exp | H2 exp | H1 ex-best | H2 ex-best |', '|---|---|---|---|---|---|---|');
    for (const s of rep.subSurvivors) L.push(`| ${s.label} | ${s.exit} | ${s.n} (${s.h1n}/${s.h2n}) | ${f(s.h1)} | ${f(s.h2)} | ${f(s.h1ExBest)} | ${f(s.h2ExBest)} |`);
    L.push('');
  }
  L.push('## Every cell (hold-to-close and the main exits)', '');
  L.push('| setup | side | contract | n | 2×% | 3×% | 5×% | worthless % | med entry | hold | take2x | take2x_close | stop50 | level_stop | H1 hold | H2 hold | H1 take2x | H2 take2x | survives |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const c of rep.cells) {
    const a = c.all; if (!a.n) { L.push(`| ${name(c)} | 0 | | | | | | | | | | | | | | | no |`); continue; }
    L.push(`| ${name(c)} | ${a.n} | ${f(a.hit2x)} | ${f(a.hit3x)} | ${f(a.hit5x)} | ${f(a.worthless)} | ${f(a.medEntry)} | ${f(a.exp.hold)} | ${f(a.exp.take2x)} | ${f(a.exp.take2x_close)} | ${f(a.exp.stop50)} | ${f(a.exp.level_stop)} | ${f(c.firstHalf.exp?.hold)} | ${f(c.secondHalf.exp?.hold)} | ${f(c.firstHalf.exp?.take2x)} | ${f(c.secondHalf.exp?.take2x)} | ${c.survives ? `**yes** (${c.survivingExits.map((s: any) => s.exit).join(', ')})` : 'no'} |`);
  }
  const subTable = (title: string, keys: string[], note?: string) => {
    L.push('', `## ${title}`, '');
    if (note) L.push(note, '');
    L.push(`| setup | side | contract | ${keys.map((k) => `${k}: n · hold · take2x · H1/H2 take2x`).join(' | ')} |`, `|---|---|---|${keys.map(() => '---').join('|')}|`);
    for (const c of rep.cells) {
      if (!c.all.n) continue;
      const cols = keys.map((k) => { const s = c.bySubset[k]; if (!s || !s.all.n) return '—'; return `${s.all.n} · ${f(s.all.exp.hold)} · ${f(s.all.exp.take2x)} · ${f(s.firstHalf.exp?.take2x)}/${f(s.secondHalf.exp?.take2x)}`; });
      if (cols.every((x) => x === '—')) continue;
      L.push(`| ${name(c)} | ${cols.join(' | ')} |`);
    }
  };
  subTable('Volume confirmation — time-of-day RVOL of the trigger bar', [`RVOL ≥ ${rep.rvolCut}`, `RVOL < ${rep.rvolCut}`], `RVOL = trigger-bar volume ÷ the average volume of the same minute over the prior 20 sessions (Alpaca 1-min SIP bars; needs ≥ 10 baseline sessions).`);
  subTable('Index ETFs vs single names', ['index ETFs', 'single names']);
  subTable('Reactive zone — does the zone wear out? (by touch number)', TOUCH_BUCKETS.map((b) => b.k), 'Touch 2 is the first tradeable touch (touch 1 made the zone; a ≥ 1×ATR(5-min) reaction made it reactive). Price-derived zones only — no historical GEX chains exist, so GEX zones run live only.');
  subTable('Reactive zone — by zone source', ['zone prior_day', 'zone premarket', 'zone round', 'zone session_pivot']);
  subTable('Liquidity sweeps — by the level swept', ['swept prior-day', 'swept pre-market', 'swept opening range', 'swept equal highs/lows'], 'Long = a LOW was swept (calls); short = a HIGH was swept (puts). double_sweep = the second side of a session in which both sides were swept.');
  L.push('', '## Time of day (hold-to-close expectancy, n)', '');
  L.push(`| setup | side | contract | ${TOD.map((b) => b.k).join(' | ')} |`, `|---|---|---|${TOD.map(() => '---').join('|')}|`);
  for (const c of rep.cells) if (c.all.n) L.push(`| ${name(c)} | ${TOD.map((b) => { const s = c.byTod[b.k]; return s.n ? `${f(s.exp.hold)} (${s.n})` : '—'; }).join(' | ')} |`);
  L.push('', '## 0DTE sessions discovered per symbol', '');
  L.push('| symbol | sessions with a same-day expiry and ≥ 1 trigger | first | by weekday |', '|---|---|---|---|');
  for (const [s, v] of Object.entries(rep.bySymbol) as Array<[string, any]>) L.push(`| ${s} | ${v.zeroDteSessionsWithTriggers} | ${v.first ?? '—'} | ${Object.entries(v.byWeekday).map(([k, n]) => `${k} ${n}`).join(', ')} |`);
  L.push('', '## Exits', '');
  for (const [k, v] of Object.entries(rep.exits)) L.push(`- \`${k}\` — ${v}`);
  L.push('', '## Method and caveats', '');
  L.push('- Detectors are the live engine\'s own (`server/zero-dte-sniper-core.ts`), causal bar by bar (tested: every trigger reappears at the same bar on the day truncated there, and not a bar earlier); each setup fires once per side per session, except reactive_zone (every holding touch).');
  L.push('- 0DTE sessions discovered from Alpaca\'s expired-contract listings per symbol; half-days skipped. SPX: Alpaca lists SPXW only for recent months and its 1-min bars are sparse (2–5 prints per near-OTM contract per session in a spot check), so SPY stands in for SPX here.');
  L.push('- Contract chosen with trigger-minute data only. Entry = the high of the next minute\'s option bar (no historical quotes on this plan). Exits at 2×/3× assume a fill at the touched price — on thin lottos a 1-min high is often a single print, so `take2x_close` (needs a 1-min close ≥ 2×) is the honest check. Level stops sell at the next option bar\'s open.');
  L.push('- Expiry value = intrinsic at the 15:59 bar close; no commissions, no slippage on the way out.');
  L.push(`- Survivorship: the universe is today\'s liquid 0DTE names. Multiple comparisons: ${SETUP_IDS.length} setups × 2 sides × 3 contracts × ${EXIT_RULES.length} exits = ${SETUP_IDS.length * 2 * 3 * EXIT_RULES.length} cells, plus the sub-cell splits; a few pass both halves by chance, so live measuring is still required.`);
  L.push('- Walk-forward halves are the two calendar halves of the 12-month window (split date above); a cell survives only if the same exit is positive in both halves, with and without each half\'s best trade, with ≥ 20 trades per half.');
  L.push('- Reactive zones here are price-derived only (prior-day H/L/C, pre-market H/L, round numbers — SPY $1, singles $5 under $200 else $10 — and today\'s swing lows/highs). GEX levels have no history; the live sniper adds them from the chart GEX recorder and they are UNMEASURED.');
  const ex = rep.example_AMD_2026_09_30;
  L.push('', '## The AMD 2026-09-30 example', '');
  if (!ex.triggers.length) L.push('No AMD triggers recorded for 2026-09-30 in this window (the session may be outside the replay end date).');
  else for (const t of ex.triggers) L.push(`- ${t.at} ET · ${SETUP_LABEL[t.setup as SetupId]} · ${t.side}${t.touch ? ` · touch ${t.touch}` : ''} · ${t.levelName}${t.rvol != null ? ` · RVOL ${t.rvol.toFixed(2)}` : ''}`);
  for (const t of ex.trades) L.push(`  - ${t.setup} ${t.side} ${t.variant}: ${t.occ} entry ${t.entry} → max ${t.maxMult}× · hold ${f(t.pnl.hold)} · take2x ${f(t.pnl.take2x)} · level_stop ${f(t.pnl.level_stop)}`);
  // State the window at the top of EVERY table.
  const winLine = `_Window: trades ${rep.window.from} → ${rep.window.to} · H1 ${rep.window.halves[0]} · H2 ${rep.window.halves[1]}_`;
  const out: string[] = [];
  for (let i = 0; i < L.length; i++) {
    if (L[i].startsWith('|') && !(i > 0 && L[i - 1].startsWith('|'))) out.push(winLine, '');
    out.push(L[i]);
  }
  fs.writeFileSync(path.resolve(process.cwd(), 'docs/ZERO_DTE_SETUPS_REPLAY.md'), out.join('\n') + '\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
