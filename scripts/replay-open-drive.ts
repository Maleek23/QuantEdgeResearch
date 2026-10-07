/**
 * Open-drive replay — the last N sessions (default 20) of SPY / QQQ / IWM 1-minute bars.
 *   npx tsx scripts/replay-open-drive.ts [--sessions=20] [--orBars=3] [--out=research/results/open-drive-replay.json]
 *
 * Same decision function as live (server/open-drive-core.ts), evaluated every minute
 * 09:31–09:44 ET with the live caps (1/symbol, 2/day). LIMITS — read before quoting:
 *   • The GAMMA GATE IS NOT EVALUATED: no opening GEX snapshot is stored per session, so
 *     targets are the 1.5R measured move and no pin filter applies. Live will fire less.
 *   • Entry = the NEXT minute's open after the trigger bar closes (no same-bar fill).
 *   • Underlying: stop = other side of the OR, target 1.5R, time exit 15:55 close; stop wins a tie.
 *   • Option: nearest ATM 0DTE strike ($1), Yahoo OPR reported-trade minute bars (a MARK replay,
 *     not NBBO fills) — first minute at/after entry; −40% premium OR the underlying OR stop,
 *     vs +50% (T1) and +100% (T2); flat 15:45. Stop wins a same-minute tie.
 * Tiny sample. Label: measuring / unvalidated.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { evaluateOpenDrive, OPEN_DRIVE_CAPS } from '../server/open-drive-core';
import { parseYahooBars, splitOneMinuteSession } from '../server/open-drive';
import { etClock } from '../server/zero-dte-sniper-core';
import { getHistoricalOptionMinutes, buildOccOptionSymbol } from '../server/option-minute-history';
import type { Bar } from '../server/zero-dte-structure';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v = 'true'] = a.replace(/^--/, '').split('='); return [k, v]; }));
const SESSIONS = Number(args.sessions ?? 20);
const OR_BARS = Number(args.orBars ?? 3);
const OUT = path.resolve(args.out ?? 'research/results/open-drive-replay.json');
const SYMBOLS = ['SPY', 'QQQ', 'IWM'];

async function fetchBars(sym: string): Promise<Bar[]> {
  const all: Bar[] = [];
  const now = Math.floor(Date.now() / 1000);
  // Yahoo serves 1m bars for ~30 days, at most 8 days per request.
  for (let end = now; end > now - 29 * 86400; end -= 7 * 86400) {
    const start = Math.max(end - 7 * 86400, now - 29 * 86400);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1m&period1=${start}&period2=${end}&includePrePost=true`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 QuantEdge/1.0' } });
    if (!r.ok) { console.warn(`${sym} ${r.status}`); continue; }
    all.push(...parseYahooBars(await r.json()));
  }
  const byT = new Map(all.map((b) => [b.t, b]));
  return [...byT.values()].sort((a, b) => a.t - b.t);
}

type Row = {
  date: string; symbol: string; direction: 'long' | 'short'; triggerEt: string; entry: number; stop: number; target: number;
  underlying: { outcome: 'target' | 'stop' | 'time'; r: number; exitEt: string };
  option?: { occ: string; entryPremium: number; t1: 'T1' | 'stop' | 'flat'; t1Ret: number; t2: 'T2' | 'stop' | 'flat'; t2Ret: number; mfePct: number } | { occ: string; error: string };
};

const hm = (ms: number) => { const m = etClock(ms).min; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

function walkUnderlying(rth: Bar[], fromT: number, dir: 'long' | 'short', entry: number, stop: number, target: number): Row['underlying'] {
  const risk = Math.abs(entry - stop);
  for (const b of rth) {
    if (b.t < fromT) continue;
    if (etClock(b.t).min >= 955) return { outcome: 'time', r: ((b.o - entry) * (dir === 'long' ? 1 : -1)) / risk, exitEt: hm(b.t) };
    const hitStop = dir === 'long' ? b.l <= stop : b.h >= stop;
    const hitTgt = dir === 'long' ? b.h >= target : b.l <= target;
    if (hitStop) return { outcome: 'stop', r: -1, exitEt: hm(b.t) };
    if (hitTgt) return { outcome: 'target', r: Math.abs(target - entry) / risk, exitEt: hm(b.t) };
  }
  const last = rth[rth.length - 1];
  return { outcome: 'time', r: ((last.c - entry) * (dir === 'long' ? 1 : -1)) / risk, exitEt: hm(last.t) };
}

async function walkOption(date: string, sym: string, dir: 'long' | 'short', entryT: number, entry: number, stop: number, rth: Bar[]): Promise<Row['option']> {
  const strike = dir === 'long' ? Math.ceil(entry) : Math.floor(entry);
  const occ = buildOccOptionSymbol(sym, date, dir === 'long' ? 'call' : 'put', strike);
  const s = await getHistoricalOptionMinutes(occ, date);
  if (!s?.bars.length) return { occ, error: 'no reported option trades (Yahoo)' };
  const bars = s.bars.map((b) => ({ ...b, t: Date.parse(b.timestamp) })).filter((b) => b.t >= entryT);
  if (!bars.length) return { occ, error: 'no option trade at/after entry' };
  const p0 = bars[0].open;
  const uByT = new Map(rth.map((b) => [b.t, b]));
  const run = (tp: number) => {
    let mfe = 0;
    for (const b of bars) {
      if (etClock(b.t).min >= 945) return { res: 'flat' as const, ret: (b.open / p0 - 1) * 100, mfe };
      const u = uByT.get(b.t);
      const uStop = u ? (dir === 'long' ? u.l <= stop : u.h >= stop) : false;
      mfe = Math.max(mfe, (b.high / p0 - 1) * 100);
      if (b.low <= p0 * 0.6 || uStop) return { res: 'stop' as const, ret: Math.max(-100, (Math.max(b.low, p0 * 0.6) / p0 - 1) * 100), mfe };
      if (b.high >= p0 * (1 + tp)) return { res: 'tgt' as const, ret: tp * 100, mfe };
    }
    const l = bars[bars.length - 1];
    return { res: 'flat' as const, ret: (l.close / p0 - 1) * 100, mfe };
  };
  const a = run(0.5); const b = run(1.0);
  return { occ, entryPremium: p0, t1: a.res === 'tgt' ? 'T1' : a.res, t1Ret: +a.ret.toFixed(1), t2: b.res === 'tgt' ? 'T2' : b.res, t2Ret: +b.ret.toFixed(1), mfePct: +Math.max(a.mfe, b.mfe).toFixed(1) };
}

const data = Object.fromEntries(await Promise.all(SYMBOLS.map(async (s) => [s, await fetchBars(s)] as const)));
const days = [...new Set(data.SPY.filter((b) => { const m = etClock(b.t).min; return m >= 570 && m < 960; }).map((b) => etClock(b.t).dateKey))].sort();
const sessions = days.slice(-SESSIONS);
const rows: Row[] = [];
for (const date of sessions) {
  const prevDate = days[days.indexOf(date) - 1];
  const fired: { bySymbol: Record<string, number>; total: number } = { bySymbol: {}, total: 0 };
  const split = Object.fromEntries(SYMBOLS.map((s) => [s, splitOneMinuteSession(data[s], date)]));
  const pdc = Object.fromEntries(SYMBOLS.map((s) => {
    const prev = prevDate ? splitOneMinuteSession(data[s], prevDate).rth : [];
    return [s, prev.length ? prev[prev.length - 1].c : null];
  }));
  const openT = split.SPY.rth[0]?.t;
  if (!openT) continue;
  for (let min = 571; min <= 584; min++) {
    const nowMs = openT + (min - 570) * 60_000;
    for (const sym of SYMBOLS) {
      if (fired.total >= OPEN_DRIVE_CAPS.total) break;
      const v = evaluateOpenDrive({ symbol: sym, rth: split[sym].rth, pre: split[sym].pre, pdc: pdc[sym], gex: null, skipGammaGate: true, nowMs, etMin: min, firedToday: fired, orBars: OR_BARS });
      if (!v.setup) continue;
      fired.bySymbol[sym] = 1; fired.total++;
      const x = v.setup;
      const entryBar = split[sym].rth.find((b) => b.t >= nowMs);
      if (!entryBar) continue;
      const entry = entryBar.o;
      const risk = Math.abs(entry - x.stop);
      const target = entry + (x.direction === 'long' ? 1 : -1) * 1.5 * risk;
      const und = walkUnderlying(split[sym].rth, entryBar.t, x.direction, entry, x.stop, target);
      const opt = await walkOption(date, sym, x.direction, entryBar.t, entry, x.stop, split[sym].rth).catch((e) => ({ occ: '?', error: String(e) }));
      rows.push({ date, symbol: sym, direction: x.direction, triggerEt: hm(nowMs), entry: +entry.toFixed(2), stop: +x.stop.toFixed(2), target: +target.toFixed(2), underlying: und, option: opt });
    }
  }
}

const n = rows.length;
const u = { target: rows.filter((r) => r.underlying.outcome === 'target').length, stop: rows.filter((r) => r.underlying.outcome === 'stop').length, time: rows.filter((r) => r.underlying.outcome === 'time').length };
const avgR = n ? rows.reduce((a, r) => a + r.underlying.r, 0) / n : 0;
const opts = rows.map((r) => r.option).filter((o): o is Extract<Row['option'], { t1: string }> => !!o && 't1' in o);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const summary = {
  label: 'open_drive replay — measuring / unvalidated; gamma gate NOT evaluated; tiny sample',
  sessions: sessions.length, from: sessions[0], to: sessions[sessions.length - 1], orBars: OR_BARS,
  sessionsWithSignal: new Set(rows.map((r) => r.date)).size, signals: n,
  bySymbol: Object.fromEntries(SYMBOLS.map((s) => [s, rows.filter((r) => r.symbol === s).length])),
  byDirection: { long: rows.filter((r) => r.direction === 'long').length, short: rows.filter((r) => r.direction === 'short').length },
  underlying: { ...u, avgR: +avgR.toFixed(2) },
  option: {
    measured: opts.length, unmeasured: n - opts.length,
    t1Bracket: { T1: opts.filter((o) => o.t1 === 'T1').length, stop: opts.filter((o) => o.t1 === 'stop').length, flat: opts.filter((o) => o.t1 === 'flat').length, avgRetPct: +avg(opts.map((o) => o.t1Ret)).toFixed(1) },
    t2Bracket: { T2: opts.filter((o) => o.t2 === 'T2').length, stop: opts.filter((o) => o.t2 === 'stop').length, flat: opts.filter((o) => o.t2 === 'flat').length, avgRetPct: +avg(opts.map((o) => o.t2Ret)).toFixed(1) },
  },
};
await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify({ summary, rows }, null, 2));
console.log(JSON.stringify(summary, null, 2));
for (const r of rows) console.log(`${r.date} ${r.triggerEt} ${r.symbol} ${r.direction} @${r.entry} stop ${r.stop} tgt ${r.target} → ${r.underlying.outcome} ${r.underlying.r.toFixed(2)}R @${r.underlying.exitEt}` + (r.option && 't1' in r.option ? ` | ${r.option.occ} $${r.option.entryPremium} T1:${r.option.t1} ${r.option.t1Ret}% T2:${r.option.t2} ${r.option.t2Ret}% MFE ${r.option.mfePct}%` : ` | option: ${(r.option as any)?.error ?? '—'}`));
