/**
 * HOLY GRAIL — 12-MONTH REPLAY (walk-forward law), stocks R + real option bars.
 * ============================================================================
 * Question: does Raschke's Holy Grail (shared/holy-grail.ts — the SAME detector
 * the live engine runs) make money, on which timeframe and side, and is ADX > 30
 * the thing that matters?
 *
 * WINDOW: fills 2025-10-01 → 2026-09-30 (bars before are warm-up only).
 * HALVES: H1 = Oct 2025–Mar 2026, H2 = Apr–Sep 2026. A cell COUNTS only if its
 * mean is positive in BOTH halves, n ≥ 30 per half, and it stays positive in
 * both halves with that half's single best trade removed (shared hgVerdict).
 *
 * STOCKS (R multiples, conservative fills — see shared/holy-grail.ts):
 *   daily  — the 300-name liquid universe (research/holy-grail-data.ts), exits
 *            swing / 2R / BE→2R / time (10 bars) + forward 5/10-day returns.
 *   5m/15m — the top-150 names by dollar volume + the 20 option names (15m is
 *            built from 5m), exits same, time stop = the session's last bar.
 *   1m     — SPY only (the SPX proxy), from cached 1-min bars.
 *   Variants: N = 1 and N = 3 (entry stop valid bars), ADX rule vs BASELINE
 *   (same entry, no ADX > 30 / rising). Splits: ADX bucket at the signal bar,
 *   time of day of the fill (intraday), and SPY as its own row.
 *
 * OPTIONS (real Alpaca 1-min option bars; research/holy-grail-options.ts):
 *   SPX — SPY 1m/5m/15m signals → SPXW 0DTE nearest OTM 5-pt strike
 *         (strike from SPY × ^GSPC/SPY at that day's open), SPY 0DTE alongside.
 *   Names — SPY/QQQ/IWM + 17 single names: nearest OTM call/put at the nearest
 *         listed expiry 0–7 DTE.
 *   Entry = HIGH of the option's 1-min bar in the minute after the stock crossed
 *   the entry stop (else first print within 3 min; else no fill). Exit = the
 *   option's 1-min close at the minute the stock exit happened, per rule;
 *   'time' = the 15:59 close. P&L per $1 of premium.
 *
 * Caveats in the doc: today's liquid universe (survivorship), option bar highs
 * overstate thin fills, many comparisons (some cells pass by chance), 5m/15m
 * same-bar stop/target resolved as the stop.
 *
 * Run: npx tsx research/holy-grail-replay.ts [--from 2025-10-01] [--to 2026-09-30] [--split 2026-04-01] [--no-options]
 *   → research/holy-grail-results.json + the replay section of docs/HOLY_GRAIL_REPLAY_2026-09-30.md
 */
import fs from 'fs';
import path from 'path';
import {
  adxBucket, aggregateBars, detectHolyGrail, hgIndicators, hgTarget, hgStats, hgVerdict, meanWithoutBest, simulateHolyGrail, todBucket,
  HG_EXIT_RULES, type HgBar, type HgExitRule, type HgSignal, type HgVerdict,
} from '../shared/holy-grail';
import { contractsMonth, et, etWall, loadDays, optionBars, requests, type CRow, type ORow } from './fast-moves-data';
import { dailyBars, liquidUniverse, m5Bars } from './holy-grail-data';
import { gridOtm, gspcDailyOC, nearExpiry, nearestOtm, occ, optionPath } from './holy-grail-options';
import { intradayUniverse, OPTION_NAMES } from './holy-grail-prefetch';
import { upsert } from './holy-grail-today';

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const FROM = arg('--from') ?? '2025-10-01';
const TO = arg('--to') ?? '2026-09-30';
const SPLIT = arg('--split') ?? '2026-04-01';
const OPTIONS = !process.argv.includes('--no-options');
const DOC = path.resolve(process.cwd(), 'docs/HOLY_GRAIL_REPLAY_2026-09-30.md');
const TRADES_FILE = path.resolve(process.cwd(), '.cache/holy-grail/trades.jsonl');

type Tf = '1m' | '5m' | '15m' | '1d';
type Variant = 'adx' | 'base';
type Side = 'long' | 'short';
const INDEX = new Set(['SPY', 'QQQ', 'IWM']);

interface Trade {
  sym: string; tf: Tf; side: Side; n: number; variant: Variant; day: string; half: 1 | 2;
  fillMin: number | null; adx: number; riskPct: number;
  r: Record<HgExitRule, number>;
  /** N = 1 only: R under OPTIMISTIC intrabar ordering (sensitivity), and whether the conservative 2R run stopped on the fill bar. */
  rOpt?: { swing: number; r2: number }; fillBarStop?: boolean;
  /** daily: forward close-to-close from the fill, % and R (null when not enough bars yet). */
  fwd5Pct?: number | null; fwd10Pct?: number | null; fwd5R?: number | null; fwd10R?: number | null;
  /** Intraday: the stock-exit minute (ms) per rule, kept for the option leg. */
  exitMs?: Partial<Record<HgExitRule, number>>;
  crossMs?: number | null; crossPx?: number | null;
}
interface OptTrade {
  venue: string; sym: string; tf: Tf; side: Side; n: number; variant: Variant; day: string; half: 1 | 2;
  occ: string; dte: number; entry: number; maxMult: number;
  pnl: Record<HgExitRule, number>;
}

const half = (day: string): 1 | 2 => (day < SPLIT ? 1 : 2);
const inWindow = (day: string) => day >= FROM && day <= TO;

// ── stock trades ────────────────────────────────────────────────────────────
function runBars(sym: string, tf: Tf, bars: HgBar[], out: Trade[], opts: { ns?: number[]; variants?: Variant[] } = {}) {
  const intraday = tf !== '1d';
  const ind = hgIndicators(bars);
  for (const variant of opts.variants ?? ['adx', 'base']) {
    for (const n of opts.ns ?? [1, 3]) {
      const sigs = detectHolyGrail(bars, { entryBars: n, intraday, maxHoldBars: 10, requireAdx: variant === 'adx' }, { ind });
      for (const s of sigs) {
        const fi = s.fillIdx as number;
        const day = bars[fi].session;
        if (!inWindow(day)) continue;
        const r = {} as Record<HgExitRule, number>;
        const exitIdx = {} as Record<HgExitRule, number>;
        const reason = {} as Record<HgExitRule, string>;
        for (const rule of HG_EXIT_RULES) {
          const o = simulateHolyGrail(bars, s, rule, { intraday, maxHoldBars: 10 });
          r[rule] = o.r; exitIdx[rule] = o.exitIdx; reason[rule] = o.reason;
        }
        const fill = s.fill as number; const risk = Math.abs(fill - s.stop); const sg = s.side === 'long' ? 1 : -1;
        const t: Trade = {
          sym, tf, side: s.side, n, variant, day, half: half(day), fillMin: intraday ? et(bars[fi].t).min : null,
          adx: +s.adx.toFixed(2), riskPct: +((100 * risk) / fill).toFixed(3), r,
        };
        if (n === 1) {
          const opt = { intraday, maxHoldBars: 10, ambiguity: 'optimistic' as const };
          t.rOpt = { swing: simulateHolyGrail(bars, s, 'swing', opt).r, r2: simulateHolyGrail(bars, s, 'r2', opt).r };
          t.fillBarStop = reason.r2 === 'stop' && exitIdx.r2 === fi;
        }
        if (!intraday) {
          const fw = (k: number) => (fi + k < bars.length ? bars[fi + k].c : null);
          const f5 = fw(5), f10 = fw(10);
          t.fwd5Pct = f5 != null ? +((100 * sg * (f5 - fill)) / fill).toFixed(3) : null;
          t.fwd10Pct = f10 != null ? +((100 * sg * (f10 - fill)) / fill).toFixed(3) : null;
          t.fwd5R = f5 != null ? +((sg * (f5 - fill)) / risk).toFixed(3) : null;
          t.fwd10R = f10 != null ? +((sg * (f10 - fill)) / risk).toFixed(3) : null;
        } else {
          (t as any)._sig = s; (t as any)._exitIdx = exitIdx; (t as any)._reason = reason; (t as any)._bars = bars;
        }
        out.push(t);
      }
    }
  }
}

/** Exact cross minute + per-rule exit minute from 1-min bars of the fill day. */
function minuteDetail(t: Trade, m1: HgBar[], tfMin: number) {
  const s: HgSignal = (t as any)._sig; const bars: HgBar[] = (t as any)._bars;
  const fillBar = bars[s.fillIdx as number];
  const L = t.side === 'long';
  const inBar = (start: number) => m1.filter((b) => b.t >= start && b.t < start + tfMin * 60_000);
  const cross = inBar(fillBar.t).find((b) => (L ? b.h >= s.entryStop : b.l <= s.entryStop));
  t.crossMs = cross ? cross.t : null; t.crossPx = cross ? cross.c : null;
  t.exitMs = {};
  const fill = s.fill as number;
  for (const rule of HG_EXIT_RULES) {
    const eb = bars[(t as any)._exitIdx[rule]]; const reason = (t as any)._reason[rule];
    const mins = inBar(eb.t);
    if (!mins.length) continue;
    if (reason === 'time') { t.exitMs[rule] = mins[mins.length - 1].t; continue; }
    const lvl = reason === 'target' ? (hgTarget(s, rule) as number)
      : reason === 'breakeven' ? fill : s.stop;
    const fav = reason === 'target';
    const hit = mins.find((b) => (fav ? (L ? b.h >= lvl : b.l <= lvl) : (L ? b.l <= lvl : b.h >= lvl)));
    t.exitMs[rule] = (hit ?? mins[mins.length - 1]).t;
  }
}

function strip(t: Trade): Trade { const c: any = { ...t }; delete c._sig; delete c._exitIdx; delete c._reason; delete c._bars; return c; }

function minuteBarsOf(days: Map<string, { rth: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }> }>): HgBar[] {
  const out: HgBar[] = [];
  for (const d of [...days.keys()].sort()) for (const b of days.get(d)!.rth) out.push({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, session: d });
  return out;
}

// ── options ─────────────────────────────────────────────────────────────────
interface OptNeed { t: Trade; venue: string; root: string; codes: string[]; type: 'C' | 'P'; expiry: string }

async function optionLeg(trades: Trade[], m1BySym: Map<string, HgBar[]>, oTrades: OptTrade[]) {
  const gspc = await gspcDailyOC(TO);
  const contractCache = new Map<string, CRow[]>();
  const contractsFor = async (sym: string, ym: string, px: number) => {
    const k = `${sym}|${ym}`;
    if (!contractCache.has(k)) {
      try { contractCache.set(k, await contractsMonth(sym, ym, px * 0.8, px * 1.2, TO)); } catch { contractCache.set(k, []); }
    }
    return contractCache.get(k)!;
  };
  const nextYm = (ym: string) => { let [y, m] = ym.split('-').map(Number); m++; if (m > 12) { m = 1; y++; } return `${y}-${String(m).padStart(2, '0')}`; };
  const needs: OptNeed[] = [];
  for (const t of trades) {
    if (t.crossMs == null || t.crossPx == null) continue;
    const type = t.side === 'long' ? 'C' : 'P';
    if (t.sym === 'SPY') {
      const m1 = m1BySym.get('SPY')!;
      const open = m1.find((b) => b.session === t.day)?.o;
      const g = gspc.get(t.day);
      if (open && g) {
        const ratio = g[0] / open;
        needs.push({ t, venue: 'SPXW 0DTE', root: 'SPXW', type, expiry: t.day, codes: gridOtm(t.crossPx * ratio, type, 5, 3).map((k) => occ('SPXW', t.day, type, k)) });
      }
    }
    const ym = t.day.slice(0, 7);
    const cons = [...await contractsFor(t.sym, ym, t.crossPx), ...(t.day.slice(8) >= '20' && nextYm(ym) <= TO.slice(0, 7) ? await contractsFor(t.sym, nextYm(ym), t.crossPx) : [])];
    const ex = nearExpiry(cons, t.day, 7);
    if (!ex) continue;
    const strikes = cons.filter((c) => c[1] === ex && c[2] === type).map((c) => c[3]);
    const ordered: number[] = [];
    let px = t.crossPx;
    for (let i = 0; i < 2; i++) { const k = nearestOtm(strikes, px, type); if (k == null) break; ordered.push(k); px = type === 'C' ? k + 1e-6 : k - 1e-6; }
    const codes = ordered.map((k) => cons.find((c) => c[1] === ex && c[2] === type && c[3] === k)![0]);
    if (codes.length) needs.push({ t, venue: INDEX.has(t.sym) ? `${t.sym} ${ex === t.day ? '0DTE' : '≤7DTE'}` : 'single ≤7DTE', root: t.sym, type, expiry: ex, codes });
  }
  // one fetch per root/day/type
  const groups = new Map<string, Set<string>>();
  for (const nd of needs) { const k = `${nd.root}|${nd.t.day}|${nd.type}`; const g = groups.get(k) ?? new Set(); nd.codes.forEach((c) => g.add(c)); groups.set(k, g); }
  console.log(`options: ${needs.length} contract legs across ${groups.size} root-day-type fetch groups`);
  const barsByGroup = new Map<string, Record<string, ORow[]>>();
  let gi = 0;
  for (const [k, codes] of groups) {
    const [root, day, type] = k.split('|');
    try { barsByGroup.set(k, await optionBars(root, day, type as 'C' | 'P', [...codes])); } catch (e) { console.log(`  ${k}: ${(e as Error).message.slice(0, 80)}`); }
    if (++gi % 100 === 0) process.stdout.write(`  option groups ${gi}/${groups.size} (${requests} requests)\r`);
  }
  for (const nd of needs) {
    const ob = barsByGroup.get(`${nd.root}|${nd.t.day}|${nd.type}`);
    if (!ob) continue;
    for (const code of nd.codes) {
      const p0 = optionPath(ob[code], code, nd.t.day, nd.t.crossMs as number, null);
      if (!p0) continue;
      const pnl = {} as Record<HgExitRule, number>;
      for (const rule of HG_EXIT_RULES) {
        const x = rule === 'time' ? etWall(nd.t.day, 16 * 60) - 60_000 : nd.t.exitMs?.[rule] ?? null;
        const p = optionPath(ob[code], code, nd.t.day, nd.t.crossMs as number, x);
        pnl[rule] = p?.atExit != null ? +(p.atExit / p.entry - 1).toFixed(4) : +(p0.close / p0.entry - 1).toFixed(4);
      }
      const dte = Math.round((Date.parse(`${nd.expiry}T12:00:00Z`) - Date.parse(`${nd.t.day}T12:00:00Z`)) / 86400_000);
      oTrades.push({ venue: nd.venue, sym: nd.t.sym, tf: nd.t.tf, side: nd.t.side, n: nd.t.n, variant: nd.t.variant, day: nd.t.day, half: nd.t.half, occ: code, dte, entry: p0.entry, maxMult: p0.maxMult, pnl });
      break;
    }
  }
}

// ── reporting ───────────────────────────────────────────────────────────────
const f = (x: number | null | undefined, d = 3) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d));
const pct = (x: number) => `${x.toFixed(1)}%`;
interface CellRow { key: string; tf: Tf; side: Side; n: number; variant: Variant; rule: HgExitRule; v: HgVerdict; all: ReturnType<typeof hgStats> }

function cell(rs: Trade[], rule: HgExitRule): { v: HgVerdict; all: ReturnType<typeof hgStats> } {
  const h1 = rs.filter((t) => t.half === 1).map((t) => t.r[rule]); const h2 = rs.filter((t) => t.half === 2).map((t) => t.r[rule]);
  return { v: hgVerdict(h1, h2), all: hgStats(rs.map((t) => t.r[rule])) };
}
function ocell(rs: OptTrade[], rule: HgExitRule) {
  const h1 = rs.filter((t) => t.half === 1).map((t) => t.pnl[rule]); const h2 = rs.filter((t) => t.half === 2).map((t) => t.pnl[rule]);
  return { v: hgVerdict(h1, h2), all: hgStats(rs.map((t) => t.pnl[rule])) };
}
const vRow = (v: HgVerdict) => `${f(v.h1.avgR)} (${v.h1.n}) | ${f(v.h2.avgR)} (${v.h2.n}) | ${f(v.h1NoBest)} / ${f(v.h2NoBest)} | ${v.pass ? '**PASS**' : 'fail'}`;

function report(trades: Trade[], oTrades: OptTrade[], meta: Record<string, unknown>): { md: string; survivors: CellRow[]; optSurvivors: Array<{ key: string; rule: HgExitRule; v: HgVerdict }> } {
  const L: string[] = [];
  const survivors: CellRow[] = [];
  let tested = 0;
  const tfs: Tf[] = ['1d', '15m', '5m'];
  L.push(`## 2. Replay — ${FROM} → ${TO} (H1 < ${SPLIT} ≤ H2)`, '');
  L.push(`Universe: ${meta.universe}. Stock trades: ${trades.length.toLocaleString()} (all variants). Option legs: ${oTrades.length.toLocaleString()}. Status: **measuring** — a PASS below is permission to publish as measuring, not proof.`, '');
  L.push('Columns: n · win% · avg win / avg loss (R) · E[R] = expectancy per trade · H1 mean (n) · H2 mean (n) · each half\'s mean with its best trade removed · walk-forward law (n ≥ 30 per half, positive in both halves, robust to dropping the best trade).', '');

  // 2a. main table — ADX rule, every tf × side × N × exit
  L.push('### 2a. Stocks (R) — Holy Grail (ADX > 30 and rising), every timeframe × side × N × exit', '');
  L.push('| TF | side | N | exit | n | win% | avgW / avgL | E[R] | H1 | H2 | −best H1 / H2 | law |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const tf of tfs) for (const side of ['long', 'short'] as const) for (const n of [1, 3]) {
    const rs = trades.filter((t) => t.tf === tf && t.side === side && t.n === n && t.variant === 'adx' && (tf === '1d' || t.sym !== 'SPY' || true));
    for (const rule of HG_EXIT_RULES) {
      const { v, all } = cell(rs, rule); tested++;
      if (v.pass) survivors.push({ key: `${tf}|${side}|${n}|adx`, tf, side, n, variant: 'adx', rule, v, all });
      L.push(`| ${tf} | ${side} | ${n} | ${rule} | ${all.n} | ${pct(all.winPct)} | ${f(all.avgWinR, 2)} / ${f(all.avgLossR, 2)} | ${f(all.expectancyR)} | ${vRow(v)} |`);
    }
  }
  L.push('');

  // 2a′. intrabar-ordering sensitivity
  L.push('### 2a′. Sensitivity — does the conservative intrabar ordering cause the loss? (N = 1)', '');
  L.push('Conservative (the law\'s basis): a bar touching stop and target is a stop; a fill bar that touches the stop is a stop. Optimistic (upper bound): the fill bar stops out only if it CLOSES through the stop; a bar touching both counts as the target.', '');
  L.push('| TF | side | variant | n | fill-bar stops (2R run) | E[R] swing: cons → opt | E[R] 2R: cons → opt | 2R optimistic law |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const tf of tfs) for (const side of ['long', 'short'] as const) for (const variant of ['adx', 'base'] as const) {
    const rs = trades.filter((t) => t.tf === tf && t.side === side && t.n === 1 && t.variant === variant && t.rOpt);
    if (!rs.length) continue;
    const m = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
    const vo = hgVerdict(rs.filter((t) => t.half === 1).map((t) => t.rOpt!.r2), rs.filter((t) => t.half === 2).map((t) => t.rOpt!.r2));
    L.push(`| ${tf} | ${side} | ${variant === 'adx' ? 'ADX' : 'baseline'} | ${rs.length} | ${pct((100 * rs.filter((t) => t.fillBarStop).length) / rs.length)} | ${f(m(rs.map((t) => t.r.swing)))} → ${f(m(rs.map((t) => t.rOpt!.swing)))} | ${f(m(rs.map((t) => t.r.r2)))} → ${f(m(rs.map((t) => t.rOpt!.r2)))} | ${f(vo.h1.avgR)} / ${f(vo.h2.avgR)} ${vo.pass ? '**PASS**' : 'fail'} |`);
  }
  L.push('');

  // 2b. daily forward returns
  const dr = meta.drift as { n: number; fwd5Pct: number; fwd10Pct: number };
  L.push('### 2b. Daily — forward returns from the fill (close-to-close, sign-adjusted)', '');
  L.push(`Drift check — every symbol-day in the window (n ${dr.n.toLocaleString()}), long: fwd 5d ${dr.fwd5Pct.toFixed(2)}%, fwd 10d ${dr.fwd10Pct.toFixed(2)}%. A long "edge" no bigger than this is the market's drift, not the setup. Forward returns hold through the stop (no exit rule) — they describe direction, not a tradeable plan.`, '');
  L.push('| side | N | variant | n | fwd 5d mean % | fwd 5d win% | fwd 10d mean % | fwd 10d win% | fwd 5d R | fwd 10d R | 10d R law (H1 / H2 / −best) |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const side of ['long', 'short'] as const) for (const n of [1, 3]) for (const variant of ['adx', 'base'] as const) {
    const rs = trades.filter((t) => t.tf === '1d' && t.side === side && t.n === n && t.variant === variant);
    const p5 = rs.map((t) => t.fwd5Pct).filter((x): x is number => x != null); const p10 = rs.map((t) => t.fwd10Pct).filter((x): x is number => x != null);
    const r5 = rs.map((t) => t.fwd5R).filter((x): x is number => x != null); const r10 = rs.map((t) => t.fwd10R).filter((x): x is number => x != null);
    const m = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
    const w = (a: number[]) => (a.length ? (100 * a.filter((x) => x > 0).length) / a.length : NaN);
    const v = hgVerdict(rs.filter((t) => t.half === 1 && t.fwd10R != null).map((t) => t.fwd10R as number), rs.filter((t) => t.half === 2 && t.fwd10R != null).map((t) => t.fwd10R as number));
    L.push(`| ${side} | ${n} | ${variant === 'adx' ? 'ADX' : 'baseline'} | ${rs.length} | ${f(m(p5), 2)} | ${f(w(p5), 1)} | ${f(m(p10), 2)} | ${f(w(p10), 1)} | ${f(m(r5), 2)} | ${f(m(r10), 2)} | ${f(v.h1.avgR, 2)} / ${f(v.h2.avgR, 2)} / ${f(v.h1NoBest, 2)}·${f(v.h2NoBest, 2)} ${v.pass ? '**PASS**' : 'fail'} |`);
  }
  L.push('');

  // 2c. baseline comparison
  L.push('### 2c. Is ADX the thing? — same entry with and without the ADX > 30 / rising filter (N = 1)', '');
  L.push('| TF | side | exit | ADX: n · E[R] · law | baseline: n · E[R] · law | baseline trades the ADX rule rejected: n · E[R] |');
  L.push('|---|---|---|---|---|---|');
  for (const tf of tfs) for (const side of ['long', 'short'] as const) for (const rule of ['swing', 'r2'] as HgExitRule[]) {
    const a = trades.filter((t) => t.tf === tf && t.side === side && t.n === 1 && t.variant === 'adx');
    const b = trades.filter((t) => t.tf === tf && t.side === side && t.n === 1 && t.variant === 'base');
    const ca = cell(a, rule), cb = cell(b, rule);
    const rej = b.filter((t) => t.adx <= 30);
    const cr = hgStats(rej.map((t) => t.r[rule]));
    L.push(`| ${tf} | ${side} | ${rule} | ${ca.all.n} · ${f(ca.all.expectancyR)} · ${ca.v.pass ? 'PASS' : 'fail'} | ${cb.all.n} · ${f(cb.all.expectancyR)} · ${cb.v.pass ? 'PASS' : 'fail'} | ${cr.n} · ${f(cr.expectancyR)} |`);
  }
  L.push('');

  // 2d. ADX buckets (baseline variant spans every bucket)
  L.push('### 2d. By ADX at the signal bar (baseline variant so every bucket is populated; N = 1) — E[R] (n)', '');
  const buckets = ['<20', '20–30', '30–40', '40–50', '>50'] as const;
  L.push(`| TF | side | exit | ${buckets.join(' | ')} |`);
  L.push(`|---|---|---|${buckets.map(() => '---').join('|')}|`);
  for (const tf of tfs) for (const side of ['long', 'short'] as const) for (const rule of ['swing', 'r2'] as HgExitRule[]) {
    const rs = trades.filter((t) => t.tf === tf && t.side === side && t.n === 1 && t.variant === 'base');
    L.push(`| ${tf} | ${side} | ${rule} | ${buckets.map((b) => { const s = hgStats(rs.filter((t) => adxBucket(t.adx) === b).map((t) => t.r[rule])); return `${f(s.avgR)} (${s.n})`; }).join(' | ')} |`);
  }
  L.push('');

  // 2e. time of day
  L.push('### 2e. By time of day of the fill (intraday, ADX rule, N = 1) — E[R] (n)', '');
  const tods = ['09:30–10:30', '10:30–12:00', '12:00–14:00', '14:00–16:00'] as const;
  L.push(`| TF | side | exit | ${tods.join(' | ')} |`);
  L.push(`|---|---|---|${tods.map(() => '---').join('|')}|`);
  for (const tf of ['15m', '5m'] as const) for (const side of ['long', 'short'] as const) for (const rule of ['swing', 'r2'] as HgExitRule[]) {
    const rs = trades.filter((t) => t.tf === tf && t.side === side && t.n === 1 && t.variant === 'adx');
    L.push(`| ${tf} | ${side} | ${rule} | ${tods.map((b) => { const s = hgStats(rs.filter((t) => todBucket(t.fillMin as number) === b).map((t) => t.r[rule])); return `${f(s.avgR)} (${s.n})`; }).join(' | ')} |`);
  }
  L.push('');

  // 2f. SPY / SPX row
  L.push('### 2f. SPX / SPY row (stock R on SPY; 1m is SPY-only)', '');
  L.push('| TF | variant | side | N | exit | n | win% | E[R] | H1 | H2 | −best H1 / H2 | law |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const tf of ['1m', '5m', '15m', '1d'] as const) for (const variant of ['adx', 'base'] as const) for (const side of ['long', 'short'] as const) for (const n of [1]) for (const rule of ['swing', 'r2', 'time'] as HgExitRule[]) {
    const rs = trades.filter((t) => t.sym === 'SPY' && t.tf === tf && t.variant === variant && t.side === side && t.n === n);
    if (!rs.length) continue;
    const { v, all } = cell(rs, rule); tested++;
    if (v.pass) survivors.push({ key: `SPY-only ${tf}|${side}|${n}|${variant}`, tf, side, n, variant, rule, v, all });
    L.push(`| ${tf} | ${variant === 'adx' ? 'ADX' : 'baseline'} | ${side} | ${n} | ${rule} | ${all.n} | ${pct(all.winPct)} | ${f(all.expectancyR)} | ${vRow(v)} |`);
  }
  L.push('');

  // 2g. options
  const optSurvivors: Array<{ key: string; rule: HgExitRule; v: HgVerdict }> = [];
  if (oTrades.length) {
    L.push('### 2g. Options — real 1-min option bars, P&L per $1 of premium (entry = next-minute HIGH)', '');
    L.push('| venue | TF | variant | side | N | exit | n | win% | mean P&L/$1 | H1 | H2 | −best H1 / H2 | law |');
    L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    const venues = [...new Set(oTrades.map((o) => (o.venue.startsWith('single') ? 'single ≤7DTE' : o.venue.replace(/ (0DTE|≤7DTE)$/, (m) => m))))];
    const groupOf = (o: OptTrade) => (o.venue.startsWith('SPXW') ? 'SPXW 0DTE' : o.venue.startsWith('SPY') ? 'SPY options' : INDEX.has(o.sym) ? 'QQQ/IWM options' : 'single ≤7DTE');
    void venues;
    for (const g of ['SPXW 0DTE', 'SPY options', 'QQQ/IWM options', 'single ≤7DTE']) for (const tf of ['1m', '5m', '15m'] as const) for (const variant of ['adx', 'base'] as const) for (const side of ['long', 'short'] as const) for (const n of [1, 3]) {
      const rs = oTrades.filter((o) => groupOf(o) === g && o.tf === tf && o.variant === variant && o.side === side && o.n === n);
      if (rs.length < 10) continue;
      for (const rule of HG_EXIT_RULES) {
        const { v, all } = ocell(rs, rule); tested++;
        if (v.pass) optSurvivors.push({ key: `${g}|${tf}|${variant}|${side}|${n}`, rule, v });
        L.push(`| ${g} | ${tf} | ${variant === 'adx' ? 'ADX' : 'baseline'} | ${side} | ${n} | ${rule} | ${all.n} | ${pct(all.winPct)} | ${f(all.avgR)} | ${vRow(v)} |`);
      }
    }
    L.push('');
  }

  // 2h. survivors
  L.push('### 2h. Cells that satisfy the walk-forward law', '');
  if (!survivors.length && !optSurvivors.length) L.push('**None.** No timeframe × side × N × exit cell is positive in both halves with n ≥ 30 per half and robust to dropping the best trade.');
  else L.push(`${survivors.length + optSurvivors.length} of ${tested} cells tested (2a, 2f, 2g) pass (conservative fills). With this many comparisons a handful of passes is expected by chance; a pass only matters if its option expression also passes.`, '');
  for (const s of survivors) L.push(`- stocks ${s.key} · exit ${s.rule}: n ${s.all.n}, E[R] ${f(s.all.expectancyR)}, H1 ${f(s.v.h1.avgR)} (${s.v.h1.n}) / H2 ${f(s.v.h2.avgR)} (${s.v.h2.n}), −best ${f(s.v.h1NoBest)} / ${f(s.v.h2NoBest)}`);
  for (const s of optSurvivors) L.push(`- options ${s.key} · exit ${s.rule}: H1 ${f(s.v.h1.avgR)} (${s.v.h1.n}) / H2 ${f(s.v.h2.avgR)} (${s.v.h2.n}), −best ${f(s.v.h1NoBest)} / ${f(s.v.h2NoBest)}`);
  L.push('');
  return { md: L.join('\n'), survivors, optSurvivors };
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now();
  console.log(`Holy Grail replay ${FROM} → ${TO}, split ${SPLIT}${OPTIONS ? ', with options' : ''}`);
  const u = await liquidUniverse(TO, 300);
  const trades: Trade[] = [];
  // daily
  const daily = await dailyBars(u.symbols, '2025-01-02', TO);
  const drift = { n: 0, f5: 0, f10: 0 };
  for (const s of u.symbols) {
    const d = daily.get(s) ?? [];
    runBars(s, '1d', d, trades);
    for (let i = 0; i + 10 < d.length; i++) if (inWindow(d[i].session)) { drift.n++; drift.f5 += (100 * (d[i + 5].c - d[i].c)) / d[i].c; drift.f10 += (100 * (d[i + 10].c - d[i].c)) / d[i].c; }
  }
  console.log(`daily: ${trades.length} trades`);
  // intraday
  const iu = intradayUniverse(u.symbols);
  const m1BySym = new Map<string, HgBar[]>();
  const intradayTrades: Trade[] = [];
  let k = 0;
  for (const s of iu) {
    const b5 = (await m5Bars([s], '2025-08-01', TO)).get(s) ?? [];
    const before = intradayTrades.length;
    runBars(s, '5m', b5, intradayTrades);
    runBars(s, '15m', aggregateBars(b5, 15, 5), intradayTrades);
    if (s === 'SPY' && !OPTIONS) runBars('SPY', '1m', minuteBarsOf(await loadDays('SPY', '2025-08-01', TO)), intradayTrades);
    if (OPTIONS && OPTION_NAMES.includes(s)) {
      const m1 = minuteBarsOf(await loadDays(s, '2025-08-01', TO));
      if (s === 'SPY') { runBars('SPY', '1m', m1, intradayTrades); m1BySym.set('SPY', m1); }
      const byDay = new Map<string, HgBar[]>();
      for (const b of m1) { const a = byDay.get(b.session) ?? []; a.push(b); byDay.set(b.session, a); }
      for (const t of intradayTrades.slice(before)) {
        const n1 = byDay.get(t.day) ?? [];
        minuteDetail(t, n1, t.tf === '1m' ? 1 : t.tf === '5m' ? 5 : 15);
      }
    }
    // drop the per-trade bar references once the minute detail is read (memory)
    for (let i = before; i < intradayTrades.length; i++) intradayTrades[i] = strip(intradayTrades[i]);
    if (++k % 10 === 0) process.stdout.write(`  intraday ${k}/${iu.length} (${intradayTrades.length} trades)\r`);
  }
  console.log(`\nintraday: ${intradayTrades.length} trades`);
  const oTrades: OptTrade[] = [];
  if (OPTIONS) {
    // SPY: ADX N=1/N=3 + baseline N=1 (→ SPXW + SPY options); other option names: ADX N=1 (request budget)
    const legs = intradayTrades.filter((t) => OPTION_NAMES.includes(t.sym) && (t.sym === 'SPY' ? (t.variant === 'adx' || t.n === 1) : (t.variant === 'adx' && t.n === 1)));
    await optionLeg(legs, m1BySym, oTrades);
  }
  const all = [...trades, ...intradayTrades];
  fs.mkdirSync(path.dirname(TRADES_FILE), { recursive: true });
  fs.writeFileSync(TRADES_FILE, all.map((t) => JSON.stringify(t)).join('\n'));
  fs.writeFileSync(TRADES_FILE.replace('trades', 'option-trades'), oTrades.map((t) => JSON.stringify(t)).join('\n'));
  const meta = { drift: { n: drift.n, fwd5Pct: +(drift.f5 / Math.max(1, drift.n)).toFixed(3), fwd10Pct: +(drift.f10 / Math.max(1, drift.n)).toFixed(3) }, universe: `daily = ${u.symbols.length} liquid names (today's list — survivorship); intraday = ${iu.length} names (top 150 by $-volume + option names); SPY 1m from cached 1-min bars` };
  const rep = report(all, oTrades, meta);
  upsert(DOC, '<!-- holy-grail-replay:start -->', '<!-- holy-grail-replay:end -->', rep.md);
  fs.writeFileSync(path.resolve(process.cwd(), 'research/holy-grail-results.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), from: FROM, to: TO, split: SPLIT, label: 'measuring', meta,
    counts: { stock: all.length, options: oTrades.length },
    survivors: rep.survivors.map((s) => ({ key: s.key, rule: s.rule, n: s.all.n, expectancyR: s.all.expectancyR, winPct: s.all.winPct, h1: s.v.h1.avgR, h1n: s.v.h1.n, h2: s.v.h2.avgR, h2n: s.v.h2.n, h1NoBest: s.v.h1NoBest, h2NoBest: s.v.h2NoBest })),
    optionSurvivors: rep.optSurvivors.map((s) => ({ key: s.key, rule: s.rule, h1: s.v.h1.avgR, h1n: s.v.h1.n, h2: s.v.h2.avgR, h2n: s.v.h2.n, h1NoBest: s.v.h1NoBest, h2NoBest: s.v.h2NoBest })),
  }, null, 1));
  console.log(`survivors: ${rep.survivors.length} stock cells, ${rep.optSurvivors.length} option cells; ${requests} requests; ${((Date.now() - t0) / 60000).toFixed(1)} min`);
}

void meanWithoutBest;
if (process.argv[1]?.endsWith('holy-grail-replay.ts')) main().catch((e) => { console.error(e); process.exit(1); });
