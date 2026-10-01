/**
 * HOLY GRAIL — WHAT FIRED TODAY (and what we missed).
 * ====================================================
 * Operator, 2026-09-30: "holy grail indicator cooked so much today, you missed it".
 *
 * A. SPX headline. Alpaca has no index bars, so the signal runs on SPY 1/5/15-min
 *    bars (shared/holy-grail.ts, Raschke defaults: ADX 14 > 30 and rising, EMA20
 *    pullback, stop entry 1 tick beyond the signal bar, N = 1 and N = 3). Every
 *    trigger is scaled to SPX by ^GSPC/SPY at the trigger minute (Yahoo 1-min)
 *    and priced on REAL SPXW 0DTE 1-min option bars (Alpaca, by OCC symbol):
 *    nearest OTM 5-pt strike, entry = HIGH of the next 1-min bar after the cross,
 *    then the high (and when) and the 15:59 close. SPY 0DTE is the cross-check.
 * B. The liquid universe (SPY QQQ IWM + server/ticker-universe.ts names, price
 *    ≥ $5, avg vol ≥ 1M, top 300 by dollar volume) on 5-min, 15-min (built from
 *    5-min) and daily bars: every trigger whose FILL happened today, with the
 *    fill bar's ET time, ADX, EMA, entry/stop/swing target, MFE to the close, the
 *    close, and each exit rule.
 * C. The top single-name triggers: the exact cross minute (1-min bars) and the
 *    0DTE / nearest-weekly (≤ 7 DTE) nearest-OTM option move on real bars.
 *
 * Everything is MEASURING — today's list is not evidence; the replay
 * (research/holy-grail-replay.ts) decides what may publish.
 * Run: npx tsx research/holy-grail-today.ts [--day 2026-09-30]
 *   → research/holy-grail-today.json + the "today" section of docs/HOLY_GRAIL_REPLAY_2026-09-30.md
 */
import fs from 'fs';
import path from 'path';
import { aggregateBars, armedBars, detectHolyGrail, hgIndicators, simulateHolyGrail, HG_EXIT_RULES, type HgBar, type HgExitRule, type HgSignal } from '../shared/holy-grail';
import { loadDays, optionBars, et, etWall, getJson, requests, type CRow } from './fast-moves-data';
import { dailyBars, liquidUniverse, m5Bars } from './holy-grail-data';
import { gridOtm, gspcMinutes, nearExpiry, nearestOtm, occ, optionPath, type OptPath } from './holy-grail-options';

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const DAY = arg('--day') ?? '2026-09-30';
const DOC = path.resolve(process.cwd(), `docs/HOLY_GRAIL_REPLAY_${DAY}.md`);
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const etHm = (ms: number) => hhmm(et(ms).min);
const f2 = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(2));
const daysBack = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) - n * 86400_000).toISOString().slice(0, 10);

type Tf = '1m' | '5m' | '15m' | '1d';
const TF_MIN: Record<Exclude<Tf, '1d'>, number> = { '1m': 1, '5m': 5, '15m': 15 };

export interface TodayTrigger {
  sym: string; tf: Tf; n: number; side: 'long' | 'short';
  /** 'adx' = Raschke's rule; 'baseline' = the same entry without ADX > 30 / rising (DI still sets the side). */
  variant: 'adx' | 'baseline';
  /** Fill bar start (ET) and — when 1-min bars were read — the exact minute the entry stop was crossed. */
  barEt: string; crossEt: string | null; crossMs: number | null;
  signalEt: string; adx: number; plusDI: number; minusDI: number; ema: number;
  entry: number; stop: number; swingTarget: number; riskPct: number;
  mfeR: number; maeR: number; mfePct: number; closeR: number; dayClose: number;
  exits: Record<HgExitRule, { r: number; reason: string; at: string }>;
  spx?: { ratio: number; spxEntry: number; spxStop: number; spxTarget: number } | null;
  options?: Array<{ venue: string; expiry: string; strike: number; path: OptPath | null; note?: string }>;
}

function minuteBars(days: Map<string, { rth: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }> }>): HgBar[] {
  const out: HgBar[] = [];
  for (const d of [...days.keys()].sort()) for (const b of days.get(d)!.rth) out.push({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, session: d });
  return out;
}

/** Outcome bookkeeping for one signal on its own bars. */
function describe(sym: string, tf: Tf, n: number, bars: HgBar[], s: HgSignal, intraday: boolean, variant: 'adx' | 'baseline' = 'adx'): TodayTrigger {
  const fillIdx = s.fillIdx as number; const fill = s.fill as number; const L = s.side === 'long'; const sg = L ? 1 : -1;
  const risk = Math.abs(fill - s.stop);
  let last = fillIdx; if (intraday) while (last + 1 < bars.length && bars[last + 1].session === bars[fillIdx].session) last++;
  let mfe = 0, mae = 0;
  for (let k = fillIdx; k <= last; k++) { mfe = Math.max(mfe, sg * ((L ? bars[k].h : bars[k].l) - fill)); mae = Math.min(mae, sg * ((L ? bars[k].l : bars[k].h) - fill)); }
  const exits = {} as TodayTrigger['exits'];
  for (const rule of HG_EXIT_RULES) {
    const o = simulateHolyGrail(bars, s, rule, { intraday, maxHoldBars: 10 });
    exits[rule] = { r: o.r, reason: o.reason, at: intraday ? etHm(bars[o.exitIdx].t) : bars[o.exitIdx].session };
  }
  return {
    sym, tf, n, side: s.side, variant, barEt: intraday ? etHm(bars[fillIdx].t) : bars[fillIdx].session, crossEt: tf === '1m' ? etHm(bars[fillIdx].t) : null,
    crossMs: tf === '1m' ? bars[fillIdx].t : null, signalEt: intraday ? etHm(bars[s.signalIdx].t) : bars[s.signalIdx].session,
    adx: +s.adx.toFixed(1), plusDI: +s.plusDI.toFixed(1), minusDI: +s.minusDI.toFixed(1), ema: +s.ema.toFixed(2),
    entry: fill, stop: s.stop, swingTarget: s.swingTarget, riskPct: +((100 * risk) / fill).toFixed(3),
    mfeR: +(mfe / risk).toFixed(2), maeR: +(mae / risk).toFixed(2), mfePct: +((100 * mfe) / fill).toFixed(2),
    closeR: +((sg * (bars[last].c - fill)) / risk).toFixed(2), dayClose: bars[last].c, exits,
  };
}

function scan(sym: string, tf: Tf, bars: HgBar[], day: string, ns = [1, 3], variants: Array<'adx' | 'baseline'> = ['adx']): TodayTrigger[] {
  const intraday = tf !== '1d';
  const ind = hgIndicators(bars);
  const out: TodayTrigger[] = [];
  for (const variant of variants) {
    const seen = new Set<string>();
    for (const n of ns) {
      for (const s of detectHolyGrail(bars, { entryBars: n, intraday, maxHoldBars: 10, requireAdx: variant === 'adx' }, { ind })) {
        if (s.fillIdx == null || bars[s.fillIdx].session !== day) continue;
        const key = `${s.side}|${s.fillIdx}|${s.entryStop}`;
        if (seen.has(key)) continue; // N=3 duplicates of an N=1 trade are listed once (as N=1)
        seen.add(key);
        out.push(describe(sym, tf, n, bars, s, intraday, variant));
      }
    }
  }
  return out;
}

/** Armed signal bars today (ADX rule held, bar touched EMA20) whose entry stop never traded — the near misses. */
function nearMisses(tf: Tf, bars: HgBar[], day: string, fills: TodayTrigger[]): Array<{ tf: Tf; at: string; side: string; adx: number; ema: number; entryStop: number; why: string }> {
  const out: Array<{ tf: Tf; at: string; side: string; adx: number; ema: number; entryStop: number; why: string }> = [];
  const filledSignals = new Set(fills.filter((f) => f.tf === tf && f.variant === 'adx').map((f) => `${f.side}|${f.signalEt}`));
  const armedList = armedBars(bars, { intraday: true });
  const armedSet = new Set(armedList.map((a) => `${a.side}|${a.idx}`));
  for (const a of armedList) {
    if (bars[a.idx].session !== day) continue;
    const at = etHm(bars[a.idx].t);
    if (filledSignals.has(`${a.side}|${at}`)) continue;
    const nxt = bars.slice(a.idx + 1, a.idx + 4).filter((b) => b.session === day);
    const reach = (b: HgBar) => (a.side === 'long' ? b.h >= a.entryStop : b.l <= a.entryStop);
    const replaced = armedSet.has(`${a.side}|${a.idx + 1}`);
    let why: string;
    if (!nxt.length) why = 'session ended';
    else if (replaced) why = 'next bar touched the EMA again → became the new signal bar (stop order trails to it)';
    else if (!reach(nxt[0])) why = `next bar ${a.side === 'long' ? 'high' : 'low'} ${(a.side === 'long' ? nxt[0].h : nxt[0].l).toFixed(2)} did not reach ${a.entryStop.toFixed(2)}${nxt.slice(1).some(reach) ? ' (N = 3 would have filled)' : '; nor within 3 bars'}`;
    else why = 'pullback had already filled on an earlier signal bar';
    out.push({ tf, at, side: a.side, adx: +a.adx.toFixed(1), ema: +a.ema.toFixed(2), entryStop: a.entryStop, why });
  }
  return out;
}

/** First 1-min bar inside [barStart, barStart + tfMin) that crossed the entry stop. */
function crossMinute(min1: HgBar[], barStart: number, tfMin: number, side: 'long' | 'short', entry: number): number | null {
  for (const b of min1) {
    if (b.t < barStart || b.t >= barStart + tfMin * 60_000) continue;
    if (side === 'long' ? b.h >= entry : b.l <= entry) return b.t;
  }
  return null;
}
function exitMinute(min1: HgBar[], tr: TodayTrigger, rule: HgExitRule, tfMin: number): number | null {
  const e = tr.exits[rule];
  const barStart = etWall(DAY, Number(e.at.slice(0, 2)) * 60 + Number(e.at.slice(3, 5)));
  const inBar = min1.filter((b) => b.t >= barStart && b.t < barStart + tfMin * 60_000);
  if (!inBar.length) return null;
  if (e.reason === 'time') return inBar[inBar.length - 1].t;
  const L = tr.side === 'long'; const risk = Math.abs(tr.entry - tr.stop);
  const lvl = e.reason === 'target' ? (rule === 'swing' ? tr.swingTarget : L ? tr.entry + 2 * risk : tr.entry - 2 * risk) : e.reason === 'breakeven' ? tr.entry : tr.stop;
  const fav = e.reason === 'target';
  for (const b of inBar) { if (fav ? (L ? b.h >= lvl : b.l <= lvl) : (L ? b.l <= lvl : b.h >= lvl)) return b.t; }
  return inBar[inBar.length - 1].t;
}

async function contractsNear(sym: string, day: string, lo: number, hi: number): Promise<CRow[]> {
  const file = path.resolve(process.cwd(), `.cache/holy-grail/contracts-${sym}-${day}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const out: CRow[] = [];
  const lim = new Date(Date.parse(`${day}T12:00:00Z`) + 7 * 86400_000).toISOString().slice(0, 10);
  for (const status of ['active', 'inactive']) {
    let token: string | undefined;
    for (let page = 0; page < 20; page++) {
      const u = new URL('https://paper-api.alpaca.markets/v2/options/contracts');
      u.searchParams.set('underlying_symbols', sym); u.searchParams.set('status', status);
      u.searchParams.set('expiration_date_gte', day); u.searchParams.set('expiration_date_lte', lim);
      u.searchParams.set('strike_price_gte', lo.toFixed(2)); u.searchParams.set('strike_price_lte', hi.toFixed(2)); u.searchParams.set('limit', '10000');
      if (token) u.searchParams.set('page_token', token);
      const j = await getJson(u.toString());
      for (const c of j.option_contracts ?? []) if (c.root_symbol === sym) out.push([c.symbol, c.expiration_date, c.type === 'call' ? 'C' : 'P', Number(c.strike_price)]);
      token = j.next_page_token || undefined;
      if (!token) break;
    }
  }
  fs.writeFileSync(file, JSON.stringify(out));
  return out;
}

async function main() {
  const t0 = Date.now();
  console.log(`Holy Grail — today ${DAY}`);
  // ── A. SPY → SPX ──────────────────────────────────────────────────────────
  const spyDays = await loadDays('SPY', daysBack(DAY, 21), DAY);
  if (!spyDays.has(DAY)) throw new Error(`no SPY 1-min bars for ${DAY}`);
  const spy1 = minuteBars(spyDays);
  const spyToday1 = spy1.filter((b) => b.session === DAY);
  const gspc = await gspcMinutes(DAY);
  const ratioAt = (ms: number) => {
    const m = et(ms).min; const spyBar = spyToday1.find((b) => et(b.t).min === m);
    for (let k = m; k >= 570; k--) { const g = gspc.get(k); if (g != null && spyBar) return g / spyBar.c; }
    return 10.0;
  };
  const spx: TodayTrigger[] = [];
  const misses: ReturnType<typeof nearMisses> = [];
  for (const tf of ['1m', '5m', '15m'] as const) {
    const bars = tf === '1m' ? spy1 : aggregateBars(spy1, TF_MIN[tf]);
    const trs = scan('SPY', tf, bars, DAY, [1, 3], ['adx', 'baseline']);
    misses.push(...nearMisses(tf, bars, DAY, trs));
    for (const tr of trs) {
      const barStart = etWall(DAY, Number(tr.barEt.slice(0, 2)) * 60 + Number(tr.barEt.slice(3, 5)));
      const cm = tf === '1m' ? barStart : crossMinute(spyToday1, barStart, TF_MIN[tf], tr.side, tr.entry);
      tr.crossMs = cm; tr.crossEt = cm != null ? etHm(cm) : null;
      const ratio = ratioAt(cm ?? barStart);
      tr.spx = { ratio: +ratio.toFixed(4), spxEntry: +(tr.entry * ratio).toFixed(2), spxStop: +(tr.stop * ratio).toFixed(2), spxTarget: +(tr.swingTarget * ratio).toFixed(2) };
      spx.push(tr);
    }
  }
  // SPXW + SPY 0DTE on real bars
  for (const type of ['C', 'P'] as const) {
    const need = spx.filter((t) => (t.side === 'long') === (type === 'C') && t.crossMs != null);
    if (!need.length) continue;
    const spxwOccs = new Set<string>(); const spyOccs = new Set<string>();
    for (const t of need) {
      const spyPx = spyToday1.find((b) => b.t === t.crossMs)!.c;
      for (const k of gridOtm(spyPx * t.spx!.ratio, type, 5, 3)) spxwOccs.add(occ('SPXW', DAY, type, k));
      for (const k of gridOtm(spyPx, type, 1, 3)) spyOccs.add(occ('SPY', DAY, type, k));
    }
    const spxwBars = await optionBars('SPXW', DAY, type, [...spxwOccs]);
    const spyBars = await optionBars('SPY', DAY, type, [...spyOccs]);
    for (const t of need) {
      const spyPx = spyToday1.find((b) => b.t === t.crossMs)!.c;
      const tfMin = TF_MIN[t.tf as Exclude<Tf, '1d'>];
      const exitMs = exitMinute(spyToday1, t, 'swing', tfMin);
      t.options = [];
      for (const [venue, root, step, px, src] of [['SPXW 0DTE', 'SPXW', 5, spyPx * t.spx!.ratio, spxwBars], ['SPY 0DTE', 'SPY', 1, spyPx, spyBars]] as const) {
        let got = false;
        for (const k of gridOtm(px, type, step, 3)) {
          const code = occ(root, DAY, type, k);
          const p = optionPath(src[code], code, DAY, t.crossMs as number, exitMs);
          if (p) { t.options.push({ venue, expiry: DAY, strike: k, path: p, note: k === gridOtm(px, type, step, 1)[0] ? undefined : 'nearest OTM did not trade in the next 3 min — next strike out' }); got = true; break; }
        }
        if (!got) t.options.push({ venue, expiry: DAY, strike: gridOtm(px, type, step, 1)[0], path: null, note: 'no option print within 3 min of the cross' });
      }
    }
  }
  console.log(`SPY/SPX: ${spx.length} triggers today`);

  // ── B. universe scan ──────────────────────────────────────────────────────
  const u = await liquidUniverse(DAY, 300);
  const m5 = await m5Bars(u.symbols, '2026-09-01', DAY);
  const daily = await dailyBars(u.symbols, '2025-01-02', DAY);
  const all: TodayTrigger[] = [];
  for (const sym of u.symbols) {
    const b5 = m5.get(sym) ?? [];
    if (b5.some((b) => b.session === DAY)) {
      all.push(...scan(sym, '5m', b5, DAY));
      all.push(...scan(sym, '15m', aggregateBars(b5, 15, 5), DAY));
    }
    const d = daily.get(sym) ?? [];
    if (d.length && d[d.length - 1].session === DAY) all.push(...scan(sym, '1d', d, DAY));
  }
  console.log(`universe ${u.symbols.length}: ${all.length} triggers today (5m ${all.filter((t) => t.tf === '5m').length}, 15m ${all.filter((t) => t.tf === '15m').length}, daily ${all.filter((t) => t.tf === '1d').length})`);

  // ── C. top single names: exact cross minute + option move ─────────────────
  const intr = all.filter((t) => t.tf !== '1d' && t.n === 1 && !['SPY'].includes(t.sym));
  const bestBySym = new Map<string, TodayTrigger>();
  for (const t of [...intr].filter((x) => x.mfeR >= 2).sort((a, b) => b.mfePct - a.mfePct)) if (!bestBySym.has(t.sym)) bestBySym.set(t.sym, t);
  const top = [...bestBySym.values()].slice(0, 12);
  for (const t of top) {
    try {
      const days1 = await loadDays(t.sym, DAY, DAY);
      const m1 = minuteBars(days1).filter((b) => b.session === DAY);
      const tfMin = TF_MIN[t.tf as Exclude<Tf, '1d'>];
      const barStart = etWall(DAY, Number(t.barEt.slice(0, 2)) * 60 + Number(t.barEt.slice(3, 5)));
      const cm = crossMinute(m1, barStart, tfMin, t.side, t.entry);
      t.crossMs = cm; t.crossEt = cm != null ? etHm(cm) : null;
      if (cm == null) continue;
      const px = m1.find((b) => b.t === cm)!.c;
      const type = t.side === 'long' ? 'C' : 'P';
      const cons = await contractsNear(t.sym, DAY, px * 0.85, px * 1.15);
      const ex = nearExpiry(cons, DAY, 7);
      t.options = [];
      if (!ex) { t.options.push({ venue: 'none', expiry: '', strike: 0, path: null, note: 'no listed expiry within 7 days' }); continue; }
      const strikes = cons.filter((c) => c[1] === ex && c[2] === type).map((c) => c[3]);
      const k = nearestOtm(strikes, px, type);
      if (k == null) continue;
      const code = cons.find((c) => c[1] === ex && c[2] === type && c[3] === k)![0];
      const ob = await optionBars(t.sym, DAY, type, [code]);
      const exitMs = exitMinute(m1, t, 'swing', tfMin);
      t.options.push({ venue: ex === DAY ? '0DTE' : `${ex} weekly`, expiry: ex, strike: k, path: optionPath(ob[code], code, DAY, cm, exitMs, 15) });
    } catch (e) {
      console.log(`  ${t.sym}: option leg failed (${(e as Error).message.slice(0, 80)})`);
    }
  }

  const out = { day: DAY, generatedAt: new Date().toISOString(), label: 'measuring', universe: { size: u.symbols.length, considered: u.considered }, spx, spyNearMisses: misses, triggers: all, top: top.map((t) => `${t.sym}|${t.tf}|${t.barEt}`) };
  fs.writeFileSync(path.resolve(process.cwd(), 'research/holy-grail-today.json'), JSON.stringify(out, null, 1));
  writeDoc(out as any, spx, all, top, misses);
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s, ${requests} requests`);
}

// ── doc section ─────────────────────────────────────────────────────────────
const MARK_A = '<!-- holy-grail-today:start -->', MARK_B = '<!-- holy-grail-today:end -->';
export function upsert(file: string, a: string, b: string, body: string) {
  let doc = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const block = `${a}\n${body}\n${b}`;
  if (doc.includes(a) && doc.includes(b)) doc = doc.slice(0, doc.indexOf(a)) + block + doc.slice(doc.indexOf(b) + b.length);
  else doc = `${doc}${doc ? '\n' : ''}${block}\n`;
  fs.writeFileSync(file, doc);
}
const optCell = (o?: TodayTrigger['options']) => (o ?? []).map((x) => x.path
  ? `${x.venue} ${x.path.occ.replace(/^(SPXW|[A-Z]+)\d{6}/, '$1 ')} ${f2(x.path.entry)} (${x.path.entryEt}) → high ${f2(x.path.high)} (${x.path.highEt}, ${x.path.maxMult.toFixed(1)}×) → close ${f2(x.path.close)} (${x.path.closeMult.toFixed(2)}×)`
  : `${x.venue}: ${x.note ?? 'no option print in the entry window'}`).join('<br>') || '—';

function writeDoc(_o: unknown, spx: TodayTrigger[], all: TodayTrigger[], top: TodayTrigger[], misses: ReturnType<typeof nearMisses>) {
  const L: string[] = [];
  L.push(`## 1. Today (${DAY}) — every Holy Grail trigger`, '');
  L.push('Status: **measuring**. A trigger list is not evidence; section 2 (replay) decides what may publish. Times are ET. "Bar" = the bar in which the entry stop filled; "cross" = the exact 1-minute bar that took out the entry stop (read from 1-min bars where fetched). R = (price − entry) / (entry − stop), sign-adjusted for shorts. MFE = best excursion from the fill to the 16:00 close.', '');
  L.push('### 1a. SPX (signals on SPY, priced on real SPXW 0DTE bars)', '');
  L.push('Alpaca serves no index bars, so the detector runs on SPY 1/5/15-min bars; SPX levels = SPY × (^GSPC / SPY) at the cross minute (Yahoo 1-min). The SPXW contract is the nearest OTM 5-point strike; entry = the HIGH of its 1-min bar in the minute after the cross; then the high (time) and the 15:59 close. SPY 0DTE is the cross-check. "swing exit" = the option at the minute the stock hit the swing-target / stop / close rule.', '');
  L.push('| TF | rule | N | side | cross (bar) | ADX (+DI/−DI) | EMA20 | SPY entry / stop / swing tgt | SPX entry / stop / tgt | MFE R | close R | 2R | swing | contracts (entry → high → close) | at swing exit |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const t of [...spx].sort((a, b) => (a.crossMs ?? 0) - (b.crossMs ?? 0))) {
    const sx = t.spx!;
    const atExit = (t.options ?? []).map((x) => x.path?.exitMult != null ? `${x.venue.split(' ')[0]} ${x.path.exitMult.toFixed(2)}×` : '').filter(Boolean).join(', ') || '—';
    L.push(`| ${t.tf} | ${t.variant === 'adx' ? 'Holy Grail (ADX>30)' : 'baseline (no ADX)'} | ${t.n} | ${t.side} | ${t.crossEt ?? '—'} (${t.barEt}) | ${t.adx} (${t.plusDI}/${t.minusDI}) | ${f2(t.ema)} | ${f2(t.entry)} / ${f2(t.stop)} / ${f2(t.swingTarget)} | ${f2(sx.spxEntry)} / ${f2(sx.spxStop)} / ${f2(sx.spxTarget)} | ${t.mfeR} | ${t.closeR} | ${t.exits.r2.r} (${t.exits.r2.reason} ${t.exits.r2.at}) | ${t.exits.swing.r} (${t.exits.swing.reason} ${t.exits.swing.at}) | ${optCell(t.options)} | ${atExit} |`);
  }
  if (!spx.length) L.push('| — | | | | no SPY trigger today | | | | | | | | | | |');
  L.push('');
  L.push('**Armed but never triggered (Holy Grail rule held at an EMA20 touch; the entry stop did not trade):**', '');
  L.push('| TF | signal bar | side | ADX | EMA20 | entry stop | why no fill |');
  L.push('|---|---|---|---|---|---|---|');
  for (const m of misses) L.push(`| ${m.tf} | ${m.at} | ${m.side} | ${m.adx} | ${f2(m.ema)} | ${f2(m.entryStop)} | ${m.why} |`);
  if (!misses.length) L.push('| — | none | | | | | |');
  L.push('');
  L.push('### 1b. Top single-name triggers (largest move after the fill, MFE ≥ 2R; one per name; 5m/15m, N = 1) with the option move', '');
  L.push('Option = nearest OTM, nearest listed expiry ≤ 7 DTE; entry = HIGH of the first 1-min print within 15 min after the cross (single-name weeklies print thinly); then the session high and the 15:59 close.', '');
  L.push('| # | ticker | TF | cross (bar) | side | ADX | entry / stop | MFE R (%) | close R | 2R exit | option (nearest OTM, ≤ 7 DTE): entry → high → close |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|');
  top.forEach((t, i) => L.push(`| ${i + 1} | ${t.sym} | ${t.tf} | ${t.crossEt ?? '—'} (${t.barEt}) | ${t.side} | ${t.adx} | ${f2(t.entry)} / ${f2(t.stop)} | ${t.mfeR} (${t.mfePct}%) | ${t.closeR} | ${t.exits.r2.r} (${t.exits.r2.reason}) | ${optCell(t.options)} |`));
  L.push('');
  const tfs: Tf[] = ['5m', '15m', '1d'];
  const cnt = (tf: Tf, side: string) => all.filter((t) => t.tf === tf && t.side === side).length;
  L.push(`### 1c. Every trigger today across the ${all.length ? '' : '(empty) '}universe`, '');
  L.push(`Counts — 5m: ${cnt('5m', 'long')} long / ${cnt('5m', 'short')} short · 15m: ${cnt('15m', 'long')} / ${cnt('15m', 'short')} · daily: ${cnt('1d', 'long')} / ${cnt('1d', 'short')}. N = 3 rows are only the extra fills that N = 1 would have missed.`, '');
  for (const tf of tfs) {
    const rows = all.filter((t) => t.tf === tf).sort((a, b) => (tf === '1d' ? b.mfeR - a.mfeR : a.barEt.localeCompare(b.barEt) || a.sym.localeCompare(b.sym)));
    L.push(`<details><summary>${tf} — ${rows.length} triggers</summary>`, '');
    L.push('| bar (ET) | ticker | N | side | ADX | EMA20 | entry | stop | swing tgt | MFE R | close R | 2R | swing | BE→2R | time |');
    L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const t of rows) L.push(`| ${t.barEt} | ${t.sym} | ${t.n} | ${t.side} | ${t.adx} | ${f2(t.ema)} | ${f2(t.entry)} | ${f2(t.stop)} | ${f2(t.swingTarget)} | ${t.mfeR} | ${t.closeR} | ${t.exits.r2.r} | ${t.exits.swing.r} | ${t.exits.be1r.r} | ${t.exits.time.r} |`);
    L.push('', '</details>', '');
  }
  upsert(DOC, MARK_A, MARK_B, L.join('\n'));
}

if (process.argv[1]?.endsWith('holy-grail-today.ts')) main().catch((e) => { console.error(e); process.exit(1); });
