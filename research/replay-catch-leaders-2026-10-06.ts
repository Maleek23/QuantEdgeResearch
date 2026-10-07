/**
 * REPLAY 2026-10-06 with the fix/catch-leaders rules (Yahoo 5-min + daily bars).
 *
 *   npx tsx research/replay-catch-leaders-2026-10-06.ts [--dir <bar cache dir>]
 *
 * For AMD AAOI AVGO ZS CRWD MRVL ALAB NBIS:
 *  A. LEADERS engine (shared/leaders-detector.ts) at every leaders slot 09:52 … 15:32:
 *     sector regime from the board's own computeCore on daily closes through 10-05
 *     (completed sessions only, as the in-session board reads them); level map from
 *     buildLevelMap on the bars available at the slot; expected-move cap (loss rule
 *     3a, 1.0× the 5-day move from 20-day realized vol); cap 6/day, 1 per symbol/side.
 *     First publish → entry / stop / T1, then the path to the close: T1 first, stop
 *     first (same-bar touch of both counts as stop), or open at the close (R marked).
 *  B. QUANT plan gate (server/lib/publish-plan.ts) — the levels the generator builds
 *     (deriveLevelsFromCloses on 60 daily closes, spot at the slot) with the 1.25×
 *     ATR floor and ≥ 1.0R, at 10:05 and at the logged 14:58/15:30 passes. Whether
 *     the quant SIGNAL fires at a slot is not replayed (it needs the live screener
 *     pool) — this shows only whether the new gates would refuse the plan.
 * Sensitivity flags: --or-hold-low (LEADERS_OR_HOLD=low), --any-sector (sector rule off).
 * Bars are cached under --dir (default .cache/replay-2026-10-06); missing files are
 * fetched from Yahoo once.
 */
import { promises as fsp } from 'fs';
import path from 'path';
import { boardGroups, computeCore } from '../shared/sector-board';
import {
  LEADERS_CFG, dailyAtr14, findTrigger, planLeader, qualify, readSession, type Bar5,
} from '../shared/leaders-detector';
import { buildLevelMap } from '../shared/levels/level-math';
import { capTargetToExpectedMove, etWallToMs, realizedVolDaily } from '../shared/loss-rules';
import { LEADERS_SLOTS_ET } from '../shared/catch-leaders-schedule';
import { floorAndGatePlan } from '../server/lib/publish-plan';
import { deriveLevelsFromCloses } from '../server/level-engine';

const SYMS = ['AMD', 'AAOI', 'AVGO', 'ZS', 'CRWD', 'MRVL', 'ALAB', 'NBIS'];
const DAY = '2026-10-06';
const argDir = process.argv.indexOf('--dir');
const DIR = argDir > 0 ? process.argv[argDir + 1] : path.join(process.cwd(), '.cache', 'replay-2026-10-06');
const ORHOLD: 'high' | 'low' = process.argv.includes('--or-hold-low') ? 'low' : 'high';
const ANY_SECTOR = process.argv.includes('--any-sector');
const QCFG = { ...LEADERS_CFG, orHold: ORHOLD, ...(ANY_SECTOR ? { longRegimes: ['leading', 'improving', 'weakening', 'lagging'] as any, shortRegimes: ['leading', 'improving', 'weakening', 'lagging'] as any } : {}) };
const at = (min: number) => etWallToMs(2026, 10, 6, min);
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const r2 = (x: number) => Math.round(x * 100) / 100;

interface Daily { time: number; open: number; high: number; low: number; close: number; volume: number }

async function yahoo(sym: string, interval: '5m' | '1d', range: string): Promise<any> {
  const f = path.join(DIR, `${sym}_${interval}.json`);
  try { return JSON.parse(await fsp.readFile(f, 'utf8')); } catch { /* fetch */ }
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=${interval}&range=${range}&includePrePost=false`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const j = await r.json();
  await fsp.mkdir(DIR, { recursive: true });
  await fsp.writeFile(f, JSON.stringify(j));
  return j;
}
function rows(j: any): Daily[] {
  const res = j?.chart?.result?.[0]; const ts: number[] = res?.timestamp ?? []; const q = res?.indicators?.quote?.[0] ?? {};
  const out: Daily[] = [];
  ts.forEach((t, i) => { const c = q.close?.[i]; if (typeof c === 'number' && c > 0) out.push({ time: t, open: q.open[i], high: q.high[i], low: q.low[i], close: c, volume: q.volume?.[i] ?? 0 }); });
  return out;
}
const dk = (tSec: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(tSec * 1000));

async function sectorRegimes(): Promise<Map<string, { id: string; label: string; regime: string | null; rank: number | null }[]>> {
  const groups = boardGroups().filter((g) => g.members.some((m) => SYMS.includes(m)));
  const all = Array.from(new Set(['SPY', ...groups.flatMap((g) => g.members)]));
  const closes = new Map<string, Map<string, number>>();
  for (const s of all) {
    try { const d = rows(await yahoo(s, '1d', '6mo')); closes.set(s, new Map(d.map((b) => [dk(b.time), b.close]))); } catch { /* missing member */ }
  }
  const dates = Array.from(closes.get('SPY')!.keys()).filter((d) => d < DAY).sort();
  const series = new Map<string, number[]>();
  for (const [s, m] of closes) series.set(s, dates.map((d) => m.get(d) ?? NaN));
  const core = computeCore({ dates, spy: series.get('SPY')!, closes: series, groups });
  const out = new Map<string, { id: string; label: string; regime: string | null; rank: number | null }[]>();
  for (const sec of core.sectors) for (const m of sec.members) {
    if (!SYMS.includes(m)) continue;
    out.set(m, [...(out.get(m) ?? []), { id: sec.id, label: sec.label, regime: sec.regime, rank: sec.rank }]);
  }
  return out;
}

async function main() {
  const regimes = await sectorRegimes();
  console.log(`Sector regimes through ${'2026-10-05'} close (board computeCore, ${DAY} in-session read):`);
  for (const s of SYMS) console.log(`  ${s.padEnd(5)} ${(regimes.get(s) ?? []).map((r) => `${r.id}=${r.regime ?? '—'}`).join(', ')}`);

  const published: string[] = [];
  console.log(`\nA. LEADERS engine (OR hold=${ORHOLD}${ANY_SECTOR ? ', sector rule OFF (sensitivity)' : ''})`);
  for (const sym of SYMS) {
    const m5 = rows(await yahoo(sym, '5m', '10d')).map((b): Bar5 => ({ t: b.time * 1000, o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume }));
    const daily = rows(await yahoo(sym, '1d', '6mo'));
    const done = daily.filter((b) => dk(b.time) < DAY);
    const prevClose = done[done.length - 1].close;
    const atr = dailyAtr14(done)!;
    const closeBar = m5.filter((b) => dk(b.t / 1000) === DAY).pop()!;
    const dayClose = closeBar.c;
    let first: string | null = null; const misses: string[] = [];
    for (const slot of LEADERS_SLOTS_ET) {
      const nowMs = at(slot) + 1000;
      const avail = m5.filter((b) => b.t + 5 * 60_000 <= nowMs);
      const read = readSession(avail, nowMs);
      if (!read) { misses.push(`${hhmm(slot)} no read`); continue; }
      const side = read.last >= prevClose ? 'long' : 'short';
      const okRegimes: readonly string[] = side === 'long' ? QCFG.longRegimes : QCFG.shortRegimes;
      const reads = regimes.get(sym) ?? [];
      const sec = reads.find((r) => r.regime != null && okRegimes.includes(r.regime)) ?? reads[0] ?? null;
      const q = qualify({ symbol: sym, prevClose, atr, read, regime: sec?.regime ?? null, sectorLabel: sec?.label ?? null }, QCFG as typeof LEADERS_CFG);
      if (!q.ok) { misses.push(`${hhmm(slot)} ${q.movePct >= 0 ? '+' : ''}${q.movePct}% rvol ${read.rvol ?? '—'} — ${q.checks.filter((c) => !c.pass).map((c) => c.key).join('+')}`); continue; }
      const { trigger, watching } = findTrigger(q.side, read, atr);
      if (!trigger) { misses.push(`${hhmm(slot)} qualified, ${watching.split(' — ')[0]}`); continue; }
      const map = buildLevelMap({ symbol: sym, intraday: avail.map((b) => ({ time: b.t / 1000, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v })), daily: done as any, nowMs, barSource: 'yahoo' });
      const sigma = realizedVolDaily(done.map((b) => b.close), 20);
      const probe = capTargetToExpectedMove({ direction: q.side, entry: trigger.entry, target: trigger.entry * (q.side === 'long' ? 1.5 : 0.5), stop: trigger.entry - 1.25 * atr, sigmaDaily: sigma, horizonDays: 5, multiple: 1 });
      const { plan, reason } = planLeader({ side: q.side, trigger, atr, clusters: map.clusters, tolerance: map.tolerance, maxTarget: probe.capped ? probe.target : null, minRR: 1 });
      if (!plan) { misses.push(`${hhmm(slot)} ${trigger.rule} — ${reason}`); continue; }
      if (published.length >= LEADERS_CFG.maxPerDay) { misses.push(`${hhmm(slot)} daily cap`); break; }
      published.push(sym);
      // Path after the publish slot.
      const s = q.side === 'long' ? 1 : -1;
      let outcome = 'open at close';
      for (const b of m5.filter((b) => b.t >= nowMs && dk(b.t / 1000) === DAY)) {
        const stopHit = s > 0 ? b.l <= plan.stop : b.h >= plan.stop;
        const tHit = s > 0 ? b.h >= plan.t1 : b.l <= plan.t1;
        if (stopHit) { outcome = `STOP ${hhmm(Math.round((b.t - at(0)) / 60000))}${tHit ? ' (same bar as T1)' : ''}`; break; }
        if (tHit) { outcome = `T1 ${hhmm(Math.round((b.t - at(0)) / 60000))}`; break; }
      }
      const markR = r2((s * (dayClose - plan.entry)) / Math.abs(plan.entry - plan.stop));
      first = `PUBLISH ${hhmm(slot)} ${q.side} ${trigger.rule} | move ${q.movePct >= 0 ? '+' : ''}${q.movePct}% rvol ${read.rvol} ${sec?.id}=${sec?.regime} | entry ${plan.entry} stop ${plan.stop} T1 ${plan.t1} (${plan.rr}R, ${plan.t1Basis}) | ${outcome}; close ${r2(dayClose)} = ${markR >= 0 ? '+' : ''}${markR}R`;
      break;
    }
    console.log(`\n${sym}: prev close ${r2(prevClose)}, ATR ${r2(atr)} (${r2((atr / prevClose) * 100)}%), close ${r2(dayClose)} (${r2((dayClose / prevClose - 1) * 100)}%)`);
    console.log(`  ${first ?? 'NOT PUBLISHED'}`);
    const show = first ? misses.slice(0, 3) : misses.slice(0, 4).concat(misses.length > 4 ? [`… ${misses.length - 4} more; last: ${misses[misses.length - 1]}`] : []);
    for (const x of show) console.log(`    ${x}`);
  }

  console.log('\nB. QUANT plan gate (deriveLevelsFromCloses + 1.25×ATR floor + ≥1.0R) — if the signal fired');
  const logged: Record<string, Array<{ min: number; dir: 'long' | 'short' }>> = {
    AMD: [{ min: 15 * 60 + 30, dir: 'long' }], ZS: [{ min: 14 * 60 + 58, dir: 'short' }, { min: 15 * 60 + 30, dir: 'long' }],
    AAOI: [{ min: 15 * 60 + 30, dir: 'long' }], CRWD: [{ min: 15 * 60 + 30, dir: 'long' }],
  };
  for (const sym of SYMS) {
    const m5 = rows(await yahoo(sym, '5m', '10d'));
    const daily = rows(await yahoo(sym, '1d', '6mo'));
    const done = daily.filter((b) => dk(b.time) < DAY);
    const closes = done.slice(-60).map((b) => b.close);
    const cases = [{ min: 10 * 60 + 5, dir: 'long' as const }, ...(logged[sym] ?? [])];
    const out: string[] = [];
    for (const c of cases) {
      const spot = m5.filter((b) => dk(b.time) === DAY && b.time * 1000 + 5 * 60_000 <= at(c.min)).pop()?.close;
      if (!spot) continue;
      const L = deriveLevelsFromCloses(closes, spot, c.dir, { assetType: 'stock' });
      const v = floorAndGatePlan({ symbol: sym, direction: c.dir, entry: L.entryPrice, stop: L.stopLoss, target: L.targetPrice as number }, done, 1);
      out.push(`${hhmm(c.min)} ${c.dir} @${r2(spot)}: raw stop ${L.stopLoss} T1 ${L.targetPrice} → stop ${v.stop}${v.widened ? ' (floored)' : ''}, ${v.rr}R → ${v.ok ? 'PASS' : 'REFUSED'}`);
    }
    console.log(`  ${sym.padEnd(5)} ${out.join(' | ')}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
