/**
 * SECTOR IGNITION — swing + weekly replay on daily bars (walk-forward halves).
 * ============================================================================
 *   npx tsx research/sector-ignition-backtest.ts [--years 2] [--refresh]
 *
 * Replays shared/sector-ignition.ts scoreSwing / scoreWeekly day by day over the
 * peer groups (shared/sector-peers.ts, ETF-backed) using ONLY bars up to each
 * day. An EVENT is a group entering 'igniting' (the previous session was not
 * igniting on that horizon/side). For every event it measures forward 1/5/10-
 * session returns, signed by the event's side:
 *   • the group ETF, and the ETF's excess over SPY
 *   • the laggards chosen at the event (equal-weight), and their excess over SPY
 * against the BASE RATE: the same forward return over every group-day, signed
 * the same way. Reported for each walk-forward half separately (first half of
 * the dates / second half) plus the whole, with n. A signal that is only good
 * in one half is a regime artefact until proven (walk-forward law).
 *
 * What the replay CANNOT include (so the live model is stricter than this):
 *   • multi-day flow persistence — no flow history per member; flowDays = null,
 *     so swing ignites only on RS-turn + breadth thrust here.
 *   • theme-leverage laggard ranking — laggards are chosen on move + signals.
 *   • intraday / daily horizons — no intraday history on disk; those are
 *     forward-logged (.cache/sector-ignition/events-*.jsonl) instead.
 * Data: Yahoo daily chart (public), fetched politely (3 at a time) and cached
 * under .cache/sector-ignition-bt/ so a rerun makes no requests.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { ignitionGroups, scoreSwing, scoreWeekly, type GroupRead, type Side } from '../shared/sector-ignition';

const args = process.argv.slice(2);
const YEARS = Number(args[args.indexOf('--years') + 1]) || 2;
const REFRESH = args.includes('--refresh');
const CACHE = path.join(process.cwd(), '.cache', 'sector-ignition-bt');

type Bars = Map<string, number>; // dateKey → adjusted close
async function yahooDaily(sym: string): Promise<Bars> {
  const file = path.join(CACHE, `${sym}-${YEARS}y.json`);
  if (!REFRESH) { try { return new Map(JSON.parse(await fs.readFile(file, 'utf8'))); } catch { /* fetch */ } }
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${YEARS}y&interval=1d`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`${sym}: HTTP ${r.status}`);
  const j: any = await r.json();
  const res = j?.chart?.result?.[0];
  const ts: number[] = res?.timestamp ?? [];
  const adj: Array<number | null> = res?.indicators?.adjclose?.[0]?.adjclose ?? res?.indicators?.quote?.[0]?.close ?? [];
  const out: Array<[string, number]> = [];
  ts.forEach((t, k) => { const c = adj[k]; if (typeof c === 'number' && c > 0) out.push([new Date(t * 1000).toISOString().slice(0, 10), c]); });
  await fs.mkdir(CACHE, { recursive: true });
  await fs.writeFile(file, JSON.stringify(out));
  await new Promise((res2) => setTimeout(res2, 250)); // polite
  return new Map(out);
}

async function loadAll(syms: string[]): Promise<Map<string, Bars>> {
  const out = new Map<string, Bars>(); let i = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (i < syms.length) {
      const s = syms[i++];
      try { out.set(s, await yahooDaily(s)); } catch (e) { console.warn(`  skip ${s}: ${(e as Error).message}`); }
    }
  }));
  return out;
}

interface Ev { horizon: 'swing' | 'weekly'; groupId: string; date: string; idx: number; side: Side; laggards: string[] }
const H = [1, 5, 10] as const;

function stats(xs: number[]) {
  const v = xs.filter((x) => Number.isFinite(x));
  if (!v.length) return { n: 0, mean: null as number | null, hit: null as number | null };
  return { n: v.length, mean: v.reduce((a, b) => a + b, 0) / v.length, hit: v.filter((x) => x > 0).length / v.length };
}
const f = (x: number | null, d = 2) => (x == null ? '   —  ' : `${x >= 0 ? '+' : ''}${x.toFixed(d)}`);
const fp = (x: number | null) => (x == null ? '  — ' : `${(x * 100).toFixed(0)}%`);

async function main() {
  const groups = ignitionGroups();
  const syms = Array.from(new Set(['SPY', ...groups.flatMap((g) => [g.etf, ...g.members])]));
  console.log(`Loading ${syms.length} symbols (${YEARS}y daily, cached in ${path.relative(process.cwd(), CACHE)})…`);
  const bars = await loadAll(syms);
  const spyB = bars.get('SPY');
  if (!spyB) throw new Error('no SPY bars');
  const dates = Array.from(spyB.keys()).sort();
  const col = (s: string) => { const b = bars.get(s); return b ? dates.map((d) => b.get(d) ?? NaN) : null; };
  const spy = col('SPY')!;
  const cols = new Map<string, number[]>();
  for (const s of syms) { const c = col(s); if (c) cols.set(s, c); }

  const events: Ev[] = [];
  const prevIgn = new Map<string, boolean>();
  const seenWeekly = new Set<string>();
  const START = 90; const LAST = dates.length - 1;
  for (let d = START; d <= LAST; d++) {
    for (const g of groups) {
      const etfC = cols.get(g.etf); if (!etfC) continue;
      for (const horizon of ['swing', 'weekly'] as const) {
        const win = horizon === 'swing' ? 40 : 110;
        const lo = Math.max(0, d - win + 1);
        const e = etfC.slice(lo, d + 1); const s = spy.slice(lo, d + 1);
        if (e.some((x) => !Number.isFinite(x))) continue;
        const members = g.members.map((m) => ({ symbol: m, closes: (cols.get(m) ?? []).slice(lo, d + 1).filter((x) => Number.isFinite(x)) })).filter((m) => m.closes.length > 20);
        const r: GroupRead = horizon === 'swing'
          ? scoreSwing({ groupId: g.groupId, label: g.label, etf: g.etf, etfCloses: e, spyCloses: s, members, flowDays: null })
          : scoreWeekly({ groupId: g.groupId, label: g.label, etf: g.etf, etfCloses: e, spyCloses: s, members });
        // Weekly reads only the ETF/SPY line, so groups sharing an ETF (5 × SMH, 4 × XLY…)
        // are ONE event, not five — keyed by ETF so n is not inflated.
        const key = horizon === 'weekly' ? `${horizon}|${g.etf}` : `${horizon}|${g.groupId}`;
        const isIgn = r.stage === 'igniting' && !!r.side;
        if (horizon === 'weekly' && seenWeekly.has(`${g.etf}|${d}`)) continue;
        if (horizon === 'weekly') seenWeekly.add(`${g.etf}|${d}`);
        if (isIgn && !prevIgn.get(key)) events.push({ horizon, groupId: g.groupId, date: dates[d], idx: d, side: r.side as Side, laggards: r.laggards.map((l) => l.symbol) });
        prevIgn.set(key, isIgn);
      }
    }
  }

  const fwd = (c: number[] | undefined, i: number, h: number) => (c && i + h < c.length && c[i] > 0 && c[i + h] > 0 ? (c[i + h] / c[i] - 1) * 100 : NaN);
  const mid = dates[Math.floor((START + LAST) / 2)];
  console.log(`\nWindow ${dates[START]} → ${dates[LAST]} (${LAST - START + 1} sessions); walk-forward split at ${mid}. Groups: ${groups.length}.`);
  console.log('Returns are % over N sessions, signed by the event side (a short that falls is +). "xs" = minus SPY. Base = every group-day, signed the same way.\n');

  for (const horizon of ['swing', 'weekly'] as const) {
    for (const half of ['H1', 'H2', 'ALL'] as const) {
      const inHalf = (date: string) => half === 'ALL' || (half === 'H1' ? date < mid : date >= mid);
      const evs = events.filter((e) => e.horizon === horizon && inHalf(e.date));
      const nL = evs.filter((e) => e.side === 'long').length;
      console.log(`${horizon.toUpperCase()} ${half}: ${evs.length} ignition events (${nL} long / ${evs.length - nL} short)`);
      console.log('   h   | ETF signed  hit  | ETF xs SPY  hit  | laggards xs  hit  n | BASE ETF  hit | BASE xs  hit');
      for (const h of H) {
        const etfR: number[] = []; const etfX: number[] = []; const lagX: number[] = []; const baseR: number[] = []; const baseX: number[] = [];
        for (const e of evs) {
          const g = groups.find((x) => x.groupId === e.groupId)!;
          const sg = e.side === 'long' ? 1 : -1;
          const er = fwd(cols.get(g.etf), e.idx, h); const sr = fwd(spy, e.idx, h);
          etfR.push(er * sg); etfX.push((er - sr) * sg);
          const lr = e.laggards.map((m) => fwd(cols.get(m), e.idx, h)).filter((x) => Number.isFinite(x));
          if (lr.length) lagX.push((lr.reduce((a, b) => a + b, 0) / lr.length - sr) * sg);
          // base: same group, every day in the same half, same side
          for (let d = START; d <= LAST - h; d++) {
            if (!inHalf(dates[d])) continue;
            const b = fwd(cols.get(g.etf), d, h); const bs = fwd(spy, d, h);
            baseR.push(b * sg); baseX.push((b - bs) * sg);
          }
        }
        const a = stats(etfR), b = stats(etfX), c = stats(lagX), br = stats(baseR), bx = stats(baseX);
        console.log(`  ${String(h).padStart(2)}d  | ${f(a.mean)}  ${fp(a.hit)} | ${f(b.mean)}  ${fp(b.hit)} | ${f(c.mean)}  ${fp(c.hit)} ${String(c.n).padStart(3)} | ${f(br.mean)}  ${fp(br.hit)} | ${f(bx.mean)}  ${fp(bx.hit)}   (n=${a.n})`);
      }
      console.log('');
    }
  }
  const byGroup = new Map<string, number>();
  for (const e of events) byGroup.set(`${e.horizon}:${e.groupId}`, (byGroup.get(`${e.horizon}:${e.groupId}`) ?? 0) + 1);
  console.log('Events by group:', Array.from(byGroup.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}=${v}`).join(' '));
  console.log('\nHonesty: base rates are the same group\'s every-day forward return with the same sign (a long base is the group\'s drift; a short base is minus it). Overlapping 5/10-day windows are not independent — n overstates the evidence. Status: measuring.');
}

main().catch((e) => { console.error(e); process.exit(1); });
