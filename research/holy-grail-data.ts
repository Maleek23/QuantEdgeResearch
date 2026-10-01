/**
 * Data layer for the Holy Grail research (research/holy-grail-today.ts,
 * research/holy-grail-replay.ts). Alpaca only (SIP, split-adjusted); every
 * response cached under .cache/holy-grail/ (daily per symbol, 5-min per
 * symbol-month RTH-only). 1-min stock bars, option contracts and option 1-min
 * bars come from research/fast-moves-data.ts (shared .cache/zdte-replay/).
 * Never touches a database.
 */
import fs from 'fs';
import path from 'path';
import { getJson, et, months } from './fast-moves-data';
import { getFullUniverse, LEVERAGED_ETFS } from '../server/ticker-universe';
import type { HgBar } from '../shared/holy-grail';

export const HG_ROOT = path.resolve(process.cwd(), '.cache/holy-grail');
for (const d of ['daily', 'm5']) fs.mkdirSync(path.join(HG_ROOT, d), { recursive: true });

const monthEnd = (ym: string) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const NOT_STOCK = /[-/=^]|USD$/;

/** Batched multi-symbol bars (pages merged per symbol). */
async function batched(symbols: string[], timeframe: string, startIso: string, endIso: string): Promise<Map<string, any[]>> {
  const out = new Map<string, any[]>();
  let token: string | undefined;
  for (let page = 0; page < 400; page++) {
    const u = new URL('https://data.alpaca.markets/v2/stocks/bars');
    u.searchParams.set('symbols', symbols.join(',')); u.searchParams.set('timeframe', timeframe);
    u.searchParams.set('start', startIso); u.searchParams.set('end', endIso);
    u.searchParams.set('limit', '10000'); u.searchParams.set('adjustment', 'split'); u.searchParams.set('feed', 'sip');
    if (token) u.searchParams.set('page_token', token);
    const j = await getJson(u.toString());
    for (const [s, arr] of Object.entries(j.bars ?? {}) as Array<[string, any[]]>) { const a = out.get(s) ?? []; for (const b of arr) a.push(b); out.set(s, a); }
    token = j.next_page_token || undefined;
    if (!token) break;
  }
  return out;
}

type DRow = [string, number, number, number, number, number]; // day o h l c v
/** Daily bars [start, end] per symbol, cached (one file per symbol per end date). */
export async function dailyBars(symbols: string[], start: string, end: string): Promise<Map<string, HgBar[]>> {
  const out = new Map<string, HgBar[]>();
  const need: string[] = [];
  const file = (s: string) => path.join(HG_ROOT, 'daily', `${s}-${start}-${end}.json`);
  for (const s of symbols) {
    if (fs.existsSync(file(s))) out.set(s, toDaily(JSON.parse(fs.readFileSync(file(s), 'utf8'))));
    else need.push(s);
  }
  for (let i = 0; i < need.length; i += 50) {
    const chunk = need.slice(i, i + 50);
    const endIso = new Date(Math.min(Date.now() - 16 * 60_000, Date.parse(`${end}T23:59:00Z`))).toISOString();
    const rows = await batched(chunk, '1Day', `${start}T00:00:00Z`, endIso);
    for (const s of chunk) {
      const d: DRow[] = (rows.get(s) ?? []).map((b) => [et(Date.parse(b.t)).day, b.o, b.h, b.l, b.c, b.v]);
      fs.writeFileSync(file(s), JSON.stringify(d));
      out.set(s, toDaily(d));
    }
    process.stdout.write(`  daily ${Math.min(i + 50, need.length)}/${need.length}\r`);
  }
  return out;
}
function toDaily(rows: DRow[]): HgBar[] {
  return rows.map(([day, o, h, l, c, v]) => ({ t: Date.parse(`${day}T20:00:00Z`), o, h, l, c, v, session: day }));
}

type M5Row = [number, number, number, number, number, number]; // tSec o h l c v
/**
 * 5-min RTH bars for `symbols` over the months covering [start, end]; one cache
 * file per symbol-month (an in-progress month is keyed by its end date).
 * Fetched in batches of 25 symbols per month.
 */
export async function m5Bars(symbols: string[], start: string, end: string): Promise<Map<string, HgBar[]>> {
  const out = new Map<string, HgBar[]>(symbols.map((s) => [s, []]));
  for (const ym of months(start.slice(0, 7), end.slice(0, 7))) {
    const complete = monthEnd(ym) < end;
    const file = (s: string) => path.join(HG_ROOT, 'm5', complete ? `${s}-${ym}.json` : `${s}-${ym}-to-${end}.json`);
    const need = symbols.filter((s) => !fs.existsSync(file(s)));
    for (let i = 0; i < need.length; i += 25) {
      const chunk = need.slice(i, i + 25);
      const s0 = `${ym}-01`; // always the whole month — the cache file is per symbol-month
      const endIso = complete ? `${monthEnd(ym)}T23:59:00Z` : new Date(Math.min(Date.now() - 16 * 60_000, Date.parse(`${end}T23:59:00Z`))).toISOString();
      const rows = await batched(chunk, '5Min', `${s0}T08:00:00Z`, endIso);
      for (const s of chunk) {
        const r: M5Row[] = [];
        for (const b of rows.get(s) ?? []) { const t = Date.parse(b.t); const e = et(t); if (e.min >= 570 && e.min < 960) r.push([t / 1000, b.o, b.h, b.l, b.c, b.v]); }
        fs.writeFileSync(file(s), JSON.stringify(r));
      }
      process.stdout.write(`  5m ${ym}: ${Math.min(i + 25, need.length)}/${need.length}      \r`);
    }
    for (const s of symbols) {
      const rows: M5Row[] = JSON.parse(fs.readFileSync(file(s), 'utf8'));
      const a = out.get(s)!;
      for (const [ts, o, h, l, c, v] of rows) { const t = ts * 1000; const day = et(t).day; if (day >= start && day <= end) a.push({ t, o, h, l, c, v, session: day }); }
    }
  }
  return out;
}

/**
 * The liquid universe: SPY/QQQ/IWM + server/ticker-universe.ts names (no
 * leveraged/inverse ETFs) with last close ≥ $5 and 20-day average volume
 * ≥ 1M shares, ranked by 20-day average dollar volume, capped.
 */
export async function liquidUniverse(asOf: string, cap = 300): Promise<{ symbols: string[]; dollarVol: Map<string, number>; considered: number }> {
  const lev = new Set(LEVERAGED_ETFS);
  const all = [...new Set(['SPY', 'QQQ', 'IWM', ...getFullUniverse()])].map((s) => s.toUpperCase()).filter((s) => !lev.has(s) && !NOT_STOCK.test(s) && /^[A-Z.]{1,6}$/.test(s));
  const start = new Date(Date.parse(`${asOf}T12:00:00Z`) - 45 * 86400_000).toISOString().slice(0, 10);
  const d = await dailyBars(all, start, asOf);
  const dv = new Map<string, number>();
  for (const s of all) {
    const bars = (d.get(s) ?? []).filter((b) => b.session < asOf).slice(-20);
    if (bars.length < 15) continue;
    const last = bars[bars.length - 1];
    const avgV = bars.reduce((a, b) => a + b.v, 0) / bars.length;
    if (last.c < 5 || avgV < 1_000_000) continue;
    dv.set(s, bars.reduce((a, b) => a + b.v * b.c, 0) / bars.length);
  }
  const ranked = [...dv.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  const head = ['SPY', 'QQQ', 'IWM'];
  const symbols = [...head, ...ranked.filter((s) => !head.includes(s))].slice(0, cap);
  return { symbols, dollarVol: dv, considered: all.length };
}
