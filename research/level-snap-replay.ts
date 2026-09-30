/**
 * LEVEL-SNAP REPLAY — do confluent structural levels make price react more than
 * arbitrary prices at the same distance?
 *
 *   npx tsx research/level-snap-replay.ts            (FROM/TO env to override)
 *
 * Method (no database, price data only):
 *   • 20 liquid names, Alpaca SIP 5-minute bars incl. extended hours + daily bars,
 *     split-adjusted, cached under .cache/level-snap-replay/.
 *   • Each session D at 10:00 ET: build the level map EXACTLY as production does
 *     (shared/levels/level-math.ts buildLevelMap) from bars known at 10:00 —
 *     prior sessions' 5-min bars, D's pre-market and first 30 min, daily bars
 *     BEFORE D (no look-ahead). No GEX / dark-pool (no history of those caches),
 *     so this measures the bar-derived levels only.
 *   • Candidate levels: clusters whose distance from the 10:00 price is between
 *     0.2 and 1.5 × daily ATR (so the session has to travel to them).
 *       CONFLUENT = ≥2 independent families; SINGLE = one family;
 *       RANDOM    = 3 controls per confluent level, same side, distance
 *                   d·exp(N(0, 0.25)) clipped to [0.2, 1.5]·ATR, rejected if
 *                   within 2 tolerances of any cluster (so they are genuinely
 *                   "no level" prices).
 *   • Outcome in D's session after 10:00 (5-min RTH bars):
 *       TOUCH  = price trades within one tolerance of the level;
 *       HOLD   = after the first touch, price travels R = 0.25 × ATR back
 *                away from the level before it travels R through it (same-bar
 *                ambiguity counted as THROUGH, conservative). Symmetric, so a
 *                memoryless path gives ≈ 50% of resolved.
 *   • Reported separately for Oct–Mar and Apr–Sep. Observations cluster by
 *     symbol-day, so the Wilson intervals are optimistic.
 *
 * Alpaca keys: dotenv from /Users/abdulmalik/UnTitld/QuantEdgeee/.env (never printed).
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { buildLevelMap, dailyAtrForFloor, etStamp, type Bar, type LevelCluster } from '../shared/levels/level-math';

dotenv.config({ path: process.env.ENV_FILE || '/Users/abdulmalik/UnTitld/QuantEdgeee/.env', quiet: true } as any);
const KEY = process.env.ALPACA_API_KEY, SECRET = process.env.ALPACA_SECRET_KEY;
if (!KEY || !SECRET) { console.error('ALPACA_API_KEY / ALPACA_SECRET_KEY missing'); process.exit(1); }

const SYMBOLS = (process.env.SYMBOLS || 'SPY,QQQ,IWM,AAPL,MSFT,NVDA,TSLA,AMZN,META,GOOGL,AMD,AVGO,NFLX,JPM,XOM,COIN,PLTR,MU,UBER,BA').split(',');
const FROM = process.env.FROM || '2025-10-01';
const TO = process.env.TO || '2026-09-29';
const LOOKBACK_FROM = '2025-06-01';
const ROOT = path.resolve(process.cwd(), '.cache/level-snap-replay');
fs.mkdirSync(ROOT, { recursive: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastCall = 0;
async function getJson(url: string): Promise<any> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const wait = 350 - (Date.now() - lastCall);
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    let r: Response;
    try { r = await fetch(url, { headers: { 'APCA-API-KEY-ID': KEY!, 'APCA-API-SECRET-KEY': SECRET! } }); } catch { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(20_000); continue; }
    if (r.status >= 500) { await sleep(3000); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)} ← ${url.replace(/\?.*/, '')}`);
    return r.json();
  }
  throw new Error(`gave up: ${url.replace(/\?.*/, '')}`);
}

async function bars(sym: string, timeframe: '5Min' | '1Day', start: string, end: string): Promise<Bar[]> {
  const file = path.join(ROOT, `${sym}-${timeframe}-${start}-${end}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const out: Bar[] = []; let token: string | undefined;
  for (let page = 0; page < 200; page++) {
    const u = new URL('https://data.alpaca.markets/v2/stocks/bars');
    u.searchParams.set('symbols', sym); u.searchParams.set('timeframe', timeframe);
    u.searchParams.set('start', `${start}T00:00:00Z`); u.searchParams.set('end', `${end}T23:59:00Z`);
    u.searchParams.set('limit', '10000'); u.searchParams.set('adjustment', 'split'); u.searchParams.set('feed', 'sip');
    if (token) u.searchParams.set('page_token', token);
    const j = await getJson(u.toString());
    for (const b of j.bars?.[sym] ?? []) out.push({ time: Date.parse(b.t) / 1000, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v });
    token = j.next_page_token || undefined;
    if (!token) break;
  }
  fs.writeFileSync(file, JSON.stringify(out));
  return out;
}

// deterministic RNG
let seed = 20260930;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const gauss = () => { const u = Math.max(rnd(), 1e-12), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

type Group = 'confluent' | 'confluent3' | 'single' | 'random';
interface Obs { half: 'Oct–Mar' | 'Apr–Sep'; group: Group; touched: boolean; outcome: 'hold' | 'through' | 'open' | null }

function outcome(level: number, above: boolean, path: Bar[], tol: number, R: number): { touched: boolean; outcome: Obs['outcome'] } {
  let k = -1;
  for (let i = 0; i < path.length; i++) {
    const b = path[i];
    if (above ? b.high >= level - tol : b.low <= level + tol) { k = i; break; }
  }
  if (k < 0) return { touched: false, outcome: null };
  // Resistance above: hold = back down to level − R first; through = up to level + R first.
  for (let i = k; i < path.length; i++) {
    const b = path[i];
    const through = above ? b.high >= level + R : b.low <= level - R;
    const hold = above ? b.low <= level - R : b.high >= level + R;
    // On the touch bar itself only the part after the touch counts; a bar that
    // does both is ambiguous — counted as through (conservative).
    if (through) return { touched: true, outcome: 'through' };
    if (hold && i > k) return { touched: true, outcome: 'hold' };
  }
  return { touched: true, outcome: 'open' };
}

function wilson(k: number, n: number): [number, number] {
  if (!n) return [NaN, NaN];
  const z = 1.96, p = k / n;
  const d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [(c - m) / d, (c + m) / d];
}

async function main() {
  const obs: Obs[] = [];
  for (const sym of SYMBOLS) {
    const intra = await bars(sym, '5Min', LOOKBACK_FROM, TO);
    const daily = await bars(sym, '1Day', LOOKBACK_FROM, TO);
    // index 5-min bars by ET date
    const byDate = new Map<string, Bar[]>();
    for (const b of intra) {
      const k = etStamp(b.time * 1000).dateKey;
      (byDate.get(k) ?? byDate.set(k, []).get(k)!).push(b);
    }
    const dates = [...byDate.keys()].sort();
    const dailyKeyed = daily.map((b) => ({ b, key: etStamp(b.time * 1000 + 12 * 3_600_000).dateKey }));
    let nDays = 0;
    for (let di = 5; di < dates.length; di++) {
      const D = dates[di];
      if (D < FROM || D > TO) continue;
      const today = byDate.get(D)!;
      const cutMin = 600; // 10:00 ET
      const known = today.filter((b) => etStamp(b.time * 1000).minutes < cutMin);
      const rthKnown = known.filter((b) => etStamp(b.time * 1000).minutes >= 570);
      if (rthKnown.length < 5) continue; // half-days / missing data
      const after = today.filter((b) => { const m = etStamp(b.time * 1000).minutes; return m >= cutMin && m < 960; });
      if (after.length < 20) continue;
      const hist = dates.slice(Math.max(0, di - 5), di).flatMap((d) => byDate.get(d)!);
      const dailyBefore = dailyKeyed.filter((x) => x.key < D).map((x) => x.b);
      const atr = dailyAtrForFloor(dailyBefore);
      if (!atr) continue;
      const nowMs = (rthKnown[rthKnown.length - 1].time + 300) * 1000;
      const map = buildLevelMap({ symbol: sym, intraday: [...hist, ...known], daily: dailyBefore, nowMs, barSource: 'alpaca sip' });
      const px = rthKnown[rthKnown.length - 1].close;
      const tol = map.tolerance;
      const R = 0.25 * atr;
      const half: Obs['half'] = D < '2026-04-01' ? 'Oct–Mar' : 'Apr–Sep';
      const inBand = (c: LevelCluster) => { const d = Math.abs(c.price - px); return d >= 0.2 * atr && d <= 1.5 * atr; };
      const nearAny = (p: number) => map.clusters.some((c) => Math.abs(c.price - p) <= 2 * tol);
      for (const c of map.clusters) {
        if (!inBand(c)) continue;
        const above = c.price > px;
        const o = outcome(c.price, above, after, tol, R);
        if (c.score >= 2) {
          obs.push({ half, group: 'confluent', ...o });
          if (c.score >= 3) obs.push({ half, group: 'confluent3', ...o });
          const d = Math.abs(c.price - px);
          let made = 0;
          for (let tries = 0; tries < 30 && made < 3; tries++) {
            const dd = Math.min(1.5 * atr, Math.max(0.2 * atr, d * Math.exp(0.25 * gauss())));
            const p = above ? px + dd : px - dd;
            if (nearAny(p)) continue;
            obs.push({ half, group: 'random', ...outcome(p, above, after, tol, R) });
            made++;
          }
        } else if (!(c.families.length === 1 && c.families[0] === 'round')) {
          obs.push({ half, group: 'single', ...o });
        }
      }
      nDays++;
    }
    console.error(`${sym}: ${nDays} sessions`);
  }

  const rows: any[] = [];
  for (const half of ['Oct–Mar', 'Apr–Sep'] as const) {
    for (const group of ['confluent', 'confluent3', 'single', 'random'] as const) {
      const o = obs.filter((x) => x.half === half && x.group === group);
      const t = o.filter((x) => x.touched);
      const hold = t.filter((x) => x.outcome === 'hold').length;
      const thr = t.filter((x) => x.outcome === 'through').length;
      const res = hold + thr;
      const [lo, hi] = wilson(hold, res);
      rows.push({
        half, group, levels: o.length,
        touchRate: +(t.length / Math.max(1, o.length) * 100).toFixed(1),
        touched: t.length, resolved: res,
        holdOfResolved: +(hold / Math.max(1, res) * 100).toFixed(1),
        ci95: `${(lo * 100).toFixed(1)}–${(hi * 100).toFixed(1)}`,
        holdOfTouched: +(hold / Math.max(1, t.length) * 100).toFixed(1),
      });
    }
  }
  console.table(rows);
  // two-proportion z: confluent vs random hold-of-resolved
  for (const half of ['Oct–Mar', 'Apr–Sep'] as const) {
    const g = (grp: Group) => {
      const t = obs.filter((x) => x.half === half && x.group === grp && x.touched);
      const h = t.filter((x) => x.outcome === 'hold').length; const n = h + t.filter((x) => x.outcome === 'through').length;
      return { h, n };
    };
    const a = g('confluent'), b = g('random');
    const p1 = a.h / a.n, p2 = b.h / b.n, p = (a.h + b.h) / (a.n + b.n);
    const z = (p1 - p2) / Math.sqrt(p * (1 - p) * (1 / a.n + 1 / b.n));
    console.log(`${half}: confluent hold ${(p1 * 100).toFixed(1)}% (n=${a.n}) vs random ${(p2 * 100).toFixed(1)}% (n=${b.n}) → Δ ${((p1 - p2) * 100).toFixed(1)} pts, z=${z.toFixed(2)}`);
  }
  fs.writeFileSync(path.join(ROOT, 'summary.json'), JSON.stringify({ generatedAt: new Date().toISOString(), FROM, TO, SYMBOLS, rows }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
