/**
 * SPX FAST MOVES — causes catalog + 0DTE option replay on REAL option bars
 * ========================================================================
 * Question: which causes of FAST intraday index moves (both directions), bought
 * as same-day-expiry SPY options (the SPX proxy), made money over the last 12
 * months — and did it hold in BOTH walk-forward halves?
 *
 * Causes (server/spx-fast-moves-core.ts — the SAME detectors the live engine
 * runs): session low/high break after 14:00 · trend afternoon (VWAP side +
 * lower highs) 30-min break on volume · prior-day low/high break after 14:00 ·
 * 5-min volume ≥ 3× with the trend · calendar close-flow (month/quarter-end,
 * monthly OPEX, quad witching, index rebalance) 15:30+ break and the same rule
 * on ordinary days (control) · the 15:50 imbalance bar · FOMC statement-range
 * break · 08:30-release open drive (and non-release control) · opening-range
 * failure · VIX-ETF ±3% "short-gamma proxy" afternoon break.
 *
 * CONTRACTS at the trigger (known at the close of trigger bar m):
 *   near  — the SPY 0DTE strike 0.2–0.4% OTM (~0.20–0.35 delta), nearest 0.3%
 *   cheap — the SPY 0DTE strike 0.5–0.8% OTM, nearest 0.65%
 * ENTRY = the HIGH of that contract's 1-min bar m+1 (first bar within 4 min;
 * else no fill). Entries under $0.05 are not counted.
 * EXITS (server/spx-fast-moves-core.ts FM_EXIT_LABEL): hold · take2x ·
 * take2x_close · take3x · half2x_trail · stop50. Expiry = intrinsic at the
 * underlying's 15:59 bar close.
 *
 * SURVIVAL per cause × side × contract × exit: ≥ 20 trades in each half, mean
 * P&L > 0 in BOTH halves, and still > 0 with each half's best trade removed.
 *
 * Also written: the CAUSES CATALOG — does the calendar/event flag change the
 * size of the move itself (|15:30→close|, |14:00→close|, |open 30 min|) vs
 * ordinary days, regardless of any trigger.
 *
 * Run: npx tsx research/spx-fast-moves-replay.ts [--from 2025-10-01] [--to 2026-09-30] [--split 2026-04-01]
 *   → research/spx-fast-moves-results.json + the replay section of docs/SPX_FAST_MOVES_2026-09-30.md
 */
import fs from 'fs';
import path from 'path';
import {
  detectFastMoves, calendarFlags, evaluateFastExit, pickFastStrike, spxwEquivalent, fmHhmm,
  CAUSE_IDS, CAUSE_LABEL, FM_EXITS, FM_EXIT_LABEL, FM_VARIANTS, FM_VARIANT_BAND,
  type CauseId, type FmExit, type FmSide, type FmVariant, type FmDayContext, type OptBarLite,
} from '../server/spx-fast-moves-core';
import { loadDays, contractsMonth, optionBars, volBaseline, premarket0830Rvol, et, etWall, requests, type CRow, type DayBars } from './fast-moves-data';

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const FROM = arg('--from') ?? '2025-10-01';
const TO = arg('--to') ?? '2026-09-30';
const SPLIT = arg('--split') ?? '2026-04-01';
const START = new Date(Date.parse(`${FROM}T12:00:00Z`) - 60 * 86400_000).toISOString().slice(0, 10);
const MACRO_MULT = 2.5;
const MIN_HALF_N = 20;
/**
 * SPX = REAL SPXW 0DTE option bars (signals from SPY bars; strikes on the SPXW 5-point grid at SPY × the prior
 * close's ^GSPC/SPY ratio; settlement = ^GSPC official close). Alpaca's contract LISTING shows SPXW only from
 * ~May 2026, but its 1-min bars exist for the whole window when the OCC symbol is requested directly.
 * SPY / QQQ / IWM ETF 0DTEs are replayed alongside; SPY+QQQ+IWM are also pooled ("ETF pool").
 */
const SYMBOLS = (arg('--symbols') ?? 'SPX,SPY,QQQ,IWM').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

export interface FmTrade {
  sym: string; day: string; cause: CauseId; side: FmSide; variant: FmVariant; trigMin: number; trigPx: number; level: number; levelName: string;
  occ: string; strike: number; spxw: number | null; entry: number; entryMin: number; rvol1: number | null;
  flags: Record<string, boolean | null>; cal: string[];
  maxMult: number; minsTo2x: number | null; worthless: boolean; pnl: Record<FmExit, number>;
  /** Underlying move from trigger close to the 15:59 close, in the trade direction (%). */
  undMovePct: number;
}
interface Miss { sym: string; day: string; cause: CauseId; side: FmSide; variant: FmVariant; reason: 'no_strike' | 'no_fill' | 'below_band' }

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const median = (a: number[]) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const r3 = (x: number) => (Number.isFinite(x) ? +x.toFixed(3) : null);
function exBest(a: number[]): number { if (a.length < 2) return NaN; const s = [...a].sort((x, y) => y - x); return mean(s.slice(1)); }

/** ^GSPC official daily closes (Yahoo), cached. SPXW 0DTE (PM-settled) settles on the official 16:00 close. */
export async function gspcDaily(): Promise<Map<string, number>> {
  const file = path.resolve(process.cwd(), `.cache/zdte-replay/gspc-daily-${TO}.json`);
  if (fs.existsSync(file)) return new Map(JSON.parse(fs.readFileSync(file, 'utf8')));
  const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=2y', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const j: any = await r.json();
  const res = j?.chart?.result?.[0]; const ts: number[] = res?.timestamp ?? []; const c = res?.indicators?.quote?.[0]?.close ?? [];
  const out: Array<[string, number]> = [];
  for (let i = 0; i < ts.length; i++) if (typeof c[i] === 'number') out.push([et(ts[i] * 1000).day, c[i]]);
  fs.writeFileSync(file, JSON.stringify(out));
  return new Map(out);
}
const pdDay = (days: string[], i: number) => days[i - 1];

async function main() {
  const t0 = Date.now();
  const END = TO;
  console.log(`SPX fast-moves replay ${FROM} → ${END} (warm-up from ${START}), split ${SPLIT}`);
  const vixy = await loadDays('VIXY', START, END);
  const trades: FmTrade[] = []; const misses: Miss[] = [];
  const catalog: Array<{ day: string; labels: string[]; closeFlow: boolean; fomc: boolean; macro: boolean; vixExp: boolean; monthEnd: boolean; opex: boolean; last30: number; last10: number; pm: number; open30: number; macroRvol: number | null }> = [];
  const triggerLog: Array<{ sym: string; day: string; cause: CauseId; side: FmSide; at: string; px: number }> = [];
  const zeroBySym: Record<string, number> = {};
  let nZero = 0;
  // The 08:30 release flag is market-wide: detected on SPY, applied to every symbol.
  const macroByDay = new Map<string, { macro: boolean; mr: number | null }>();
  const gspc = await gspcDaily();
  const order = (s: string) => (s === 'SPY' ? 0 : s === 'SPX' ? 1 : 2);
  for (const SYM of [...SYMBOLS].sort((a, b) => order(a) - order(b))) {
  // SPX: signals from SPY bars (Alpaca has no index bars); contracts are REAL SPXW 0DTE bars.
  const isSpx = SYM === 'SPX';
  const spy = await loadDays(isSpx ? 'SPY' : SYM, START, END);
  const days = [...spy.keys()].filter((d) => spy.get(d)!.rth.length >= 300).sort();
  const daily = days.map((d) => { const r = spy.get(d)!.rth; return { d, h: Math.max(...r.map((b) => b.h)), l: Math.min(...r.map((b) => b.l)), c: r[r.length - 1].c }; });

  // contracts → strikes per 0DTE expiry (ETFs: listed contracts; SPX: the SPXW 5-point grid, every session is a 0DTE session)
  const strikes = new Map<string, CRow[]>();
  const monthsSeen = new Map<string, { lo: number; hi: number }>();
  for (const d of daily) { const ym = d.d.slice(0, 7); const m = monthsSeen.get(ym) ?? { lo: Infinity, hi: -Infinity }; m.lo = Math.min(m.lo, d.l); m.hi = Math.max(m.hi, d.h); monthsSeen.set(ym, m); }
  if (!isSpx) for (const [ym, rg] of monthsSeen) {
    if (`${ym}-31` < FROM) continue;
    for (const c of await contractsMonth(SYM, ym, rg.lo * 0.85, rg.hi * 1.15, END)) { const a = strikes.get(c[1]) ?? []; a.push(c); strikes.set(c[1], a); }
  }

  for (let i = 21; i < days.length; i++) {
    const day = days[i];
    if (day < FROM) continue;
    const { rth, pre } = spy.get(day)!;
    if (rth[rth.length - 1].min < 959 - 5) continue; // half-day — skipped
    const prior = days.slice(i - 20, i).map((d) => spy.get(d)!);
    const cal = calendarFlags(day);
    if (SYM === 'SPY') { const r = premarket0830Rvol(spy.get(day)!, prior); macroByDay.set(day, { mr: r, macro: r != null && r >= MACRO_MULT }); }
    const { mr, macro } = macroByDay.get(day) ?? { mr: null, macro: false };
    const pd = daily[i - 1];
    const prev20 = daily.slice(i - 20, i);
    const ctx: FmDayContext = {
      day, pdh: pd.h, pdl: pd.l, pdc: pd.c, atr20: mean(prev20.map((x) => x.h - x.l)),
      volBase: volBaseline(prior), cal, macro0830: macro, vix: vixy.get(day)?.rth ?? null,
    };
    // Catalog row (move sizes, no trigger).
    const at = (min: number) => { const b = rth.filter((x) => x.min <= min).pop(); return b ? b.c : NaN; };
    // SPX: the SPY→SPX ratio is the PRIOR session's close ratio (known before the open); settlement = ^GSPC official close.
    const ratio = isSpx ? (gspc.get(pdDay(days, i)) ?? NaN) / daily[i - 1].c : 1;
    if (isSpx && !(ratio > 5 && gspc.has(day))) continue;
    const settle = isSpx ? gspc.get(day)! : rth[rth.length - 1].c;
    if (SYM === 'SPY') catalog.push({
      day, labels: cal.labels, closeFlow: cal.closeFlowDay, fomc: cal.fomc, macro, vixExp: cal.vixExpiry, monthEnd: cal.monthEnd, opex: cal.opex,
      last30: (settle / at(929) - 1) * 100, last10: (settle / at(949) - 1) * 100, pm: (settle / at(839) - 1) * 100, open30: (at(599) / rth[0].o - 1) * 100, macroRvol: mr,
    });
    void pre;
    if (!isSpx && !strikes.has(day)) continue;
    nZero++; zeroBySym[SYM] = (zeroBySym[SYM] ?? 0) + 1;
    const trig = detectFastMoves(rth, ctx);
    for (const t of trig) triggerLog.push({ sym: SYM, day, cause: t.cause, side: t.side, at: fmHhmm(t.min), px: t.price });
    if (!trig.length) continue;
    const closeT = etWall(day, 960) / 1000;
    const minEntry = isSpx ? 0.10 : 0.05;
    for (const type of ['C', 'P'] as const) {
      const need = trig.filter((t) => (t.side === 'long') === (type === 'C'));
      if (!need.length) continue;
      let byStrike: Map<number, string>;
      if (isSpx) {
        byStrike = new Map();
        const mid = Math.round((need[0].price * ratio) / 5) * 5;
        for (let k = mid - 300; k <= mid + 300; k += 5) byStrike.set(k, `SPXW${day.slice(2).replace(/-/g, '')}${type}${String(k * 1000).padStart(8, '0')}`);
      } else {
        byStrike = new Map(strikes.get(day)!.filter((c) => c[2] === type).map((c) => [c[3], c[0]]));
      }
      const kList = [...byStrike.keys()];
      const picks = need.flatMap((t) => FM_VARIANTS.map((v) => ({ t, v, k: pickFastStrike(kList, t.price * ratio, t.side, v) })));
      const occs = [...new Set(picks.filter((p) => p.k != null).map((p) => byStrike.get(p.k!)!))];
      let ob: Record<string, [number, number, number, number, number, number][]> = {};
      if (occs.length) {
        try { ob = await optionBars(isSpx ? 'SPXW' : SYM, day, type, occs); }
        catch (e) { console.log(`  ${day} ${type}: option bars unavailable (${(e as Error).message.slice(0, 80)})`); }
      }
      for (const { t, v, k } of picks) {
        if (k == null) { misses.push({ sym: SYM, day, cause: t.cause, side: t.side, variant: v, reason: 'no_strike' }); continue; }
        const occ = byStrike.get(k)!;
        const bars = ob[occ] ?? [];
        const trigT = t.t / 1000;
        const eb = bars.find((r) => r[0] > trigT && r[0] <= trigT + 240);
        if (!eb || !(eb[2] > 0)) { misses.push({ sym: SYM, day, cause: t.cause, side: t.side, variant: v, reason: 'no_fill' }); continue; }
        if (eb[2] < minEntry) { misses.push({ sym: SYM, day, cause: t.cause, side: t.side, variant: v, reason: 'below_band' }); continue; }
        const after: OptBarLite[] = bars.filter((r) => r[0] > eb[0] && r[0] < closeT).map((r) => ({ t: r[0] * 1000, o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] }));
        const intrinsic = type === 'C' ? Math.max(0, settle - k) : Math.max(0, k - settle);
        const o = evaluateFastExit(eb[2], after, intrinsic, eb[0] * 1000);
        trades.push({
          sym: SYM, day, cause: t.cause, side: t.side, variant: v, trigMin: t.min, trigPx: t.price, level: +t.level.toFixed(3), levelName: t.levelName,
          occ, strike: k, spxw: SYM === 'SPY' ? spxwEquivalent(k, (gspc.get(pdDay(days, i)) ?? NaN) / daily[i - 1].c || 10) : isSpx ? k : null, entry: eb[2], entryMin: et(eb[0] * 1000).min, rvol1: t.rvol1 != null ? +t.rvol1.toFixed(2) : null,
          flags: t.flags, cal: cal.labels,
          maxMult: +o.maxMult.toFixed(3), minsTo2x: o.minsTo2x, worthless: o.worthless,
          pnl: Object.fromEntries(FM_EXITS.map((x) => [x, +o.pnl[x].toFixed(4)])) as Record<FmExit, number>,
          undMovePct: +(((t.side === 'short' ? t.price * ratio - settle : settle - t.price * ratio) / (t.price * ratio)) * 100).toFixed(3),
        });
      }
    }
  }
  console.log(`  ${SYM}: ${zeroBySym[SYM] ?? 0} 0DTE sessions`);
  }
  console.log(`${nZero} symbol-sessions with a same-day expiry (${JSON.stringify(zeroBySym)}) · ${triggerLog.length} triggers · ${trades.length} option trades · ${misses.length} misses · ${requests} requests`);

  // ── stats ──
  const summarise = (ts: FmTrade[]) => {
    const n = ts.length; if (!n) return { n: 0 } as any;
    const pct = (f: (t: FmTrade) => boolean) => +((ts.filter(f).length / n) * 100).toFixed(1);
    return {
      n, hit2x: pct((t) => t.maxMult >= 2), hit3x: pct((t) => t.maxMult >= 3), hit5x: pct((t) => t.maxMult >= 5), worthless: pct((t) => t.worthless),
      medEntry: r3(median(ts.map((t) => t.entry))), medMinsTo2x: (() => { const a = ts.map((t) => t.minsTo2x).filter((x): x is number => x != null); return a.length ? median(a) : null; })(),
      undMove: r3(mean(ts.map((t) => t.undMovePct))),
      exp: Object.fromEntries(FM_EXITS.map((k) => [k, r3(mean(ts.map((t) => t.pnl[k])))])),
      expExBest: Object.fromEntries(FM_EXITS.map((k) => [k, r3(exBest(ts.map((t) => t.pnl[k])))])),
    };
  };
  const survivors = (ts: FmTrade[]) => {
    const h1 = ts.filter((t) => t.day < SPLIT), h2 = ts.filter((t) => t.day >= SPLIT);
    const out: Array<{ exit: FmExit; h1n: number; h2n: number; h1: number; h2: number; h1ExBest: number; h2ExBest: number; all: number }> = [];
    if (h1.length < MIN_HALF_N || h2.length < MIN_HALF_N) return out;
    for (const k of FM_EXITS) {
      const a = h1.map((t) => t.pnl[k]), b = h2.map((t) => t.pnl[k]);
      const m1 = mean(a), m2 = mean(b), e1 = exBest(a), e2 = exBest(b);
      if (m1 > 0 && m2 > 0 && e1 > 0 && e2 > 0) out.push({ exit: k, h1n: h1.length, h2n: h2.length, h1: r3(m1)!, h2: r3(m2)!, h1ExBest: r3(e1)!, h2ExBest: r3(e2)!, all: r3(mean(ts.map((t) => t.pnl[k])))! });
    }
    return out.sort((x, y) => Math.min(y.h1, y.h2) - Math.min(x.h1, x.h2));
  };
  /** Same criteria with a lower bar (≥ 5 per half) — for rare causes; reported, never published. */
  const survivorsLowN = (ts: FmTrade[]) => {
    const h1 = ts.filter((t) => t.day < SPLIT), h2 = ts.filter((t) => t.day >= SPLIT);
    if (h1.length < 5 || h2.length < 5) return [] as FmExit[];
    return FM_EXITS.filter((k) => { const a = h1.map((t) => t.pnl[k]), b = h2.map((t) => t.pnl[k]); return mean(a) > 0 && mean(b) > 0 && exBest(a) > 0 && exBest(b) > 0; });
  };
  const TOD = [
    { k: '09:35–10:59', lo: 575, hi: 659 }, { k: '11:00–13:59', lo: 660, hi: 839 }, { k: '14:00–14:59', lo: 840, hi: 899 },
    { k: '15:00–15:29', lo: 900, hi: 929 }, { k: '15:30–15:49', lo: 930, hi: 949 }, { k: '15:50–15:55', lo: 950, hi: 955 },
  ];
  const SPLITS: Array<{ k: string; f: (t: FmTrade) => boolean }> = [
    { k: 'close-flow day', f: (t) => !!t.flags.closeFlowDay }, { k: 'ordinary day', f: (t) => !t.flags.closeFlowDay },
    { k: 'VIXY confirms', f: (t) => t.flags.vixConfirm === true }, { k: 'VIXY does not', f: (t) => t.flags.vixConfirm === false },
    { k: 'range ≥ 0.8 ATR', f: (t) => t.flags.rangeExp === true }, { k: 'range < 0.8 ATR', f: (t) => t.flags.rangeExp === false },
    { k: 'trigger RVOL ≥ 3', f: (t) => !!t.flags.rvol3 },
  ];
  const cells: any[] = [];
  for (const cause of CAUSE_IDS) for (const side of ['short', 'long'] as FmSide[]) for (const variant of FM_VARIANTS) {
    const cellAll = trades.filter((t) => t.cause === cause && t.side === side && t.variant === variant);
    // PRIMARY = SPXW (the instrument the operator trades). SPY and the ETF pool are corroboration.
    const base = cellAll.filter((t) => t.sym === 'SPX');
    const pool = cellAll.filter((t) => t.sym !== 'SPX');
    const poolSurv = survivors(pool);
    const surv = survivors(base);
    const splits: Record<string, any> = {};
    const subSurv: any[] = [];
    for (const s of SPLITS) {
      const ts = base.filter(s.f);
      const sv = survivors(ts);
      splits[s.k] = { all: summarise(ts), h1: summarise(ts.filter((t) => t.day < SPLIT)), h2: summarise(ts.filter((t) => t.day >= SPLIT)), surv: sv };
      for (const x of sv) subSurv.push({ subset: s.k, ...x });
    }
    const spyT = cellAll.filter((t) => t.sym === 'SPY');
    // SPY-only check for each SPXW survivor: same exit, mean ≥ 0 in both halves (n ≥ 5 per half), else "SPY disagrees / too few".
    const spyCheck = Object.fromEntries(surv.map((s) => {
      const a = spyT.filter((t) => t.day < SPLIT).map((t) => t.pnl[s.exit]), b = spyT.filter((t) => t.day >= SPLIT).map((t) => t.pnl[s.exit]);
      return [s.exit, a.length < 5 || b.length < 5 ? `too few SPY trades (${a.length}/${b.length})` : mean(a) >= 0 && mean(b) >= 0 ? `SPY agrees (${r3(mean(a))} / ${r3(mean(b))})` : `SPY disagrees (${r3(mean(a))} / ${r3(mean(b))})`];
    }));
    cells.push({
      cause, side, variant, label: `${CAUSE_LABEL[cause]} · ${side === 'short' ? 'puts' : 'calls'} · ${FM_VARIANT_BAND[variant].label}`,
      all: summarise(base), h1: summarise(base.filter((t) => t.day < SPLIT)), h2: summarise(base.filter((t) => t.day >= SPLIT)),
      days: new Set(base.map((t) => t.day)).size,
      spy: summarise(spyT), spyH1: summarise(spyT.filter((t) => t.day < SPLIT)), spyH2: summarise(spyT.filter((t) => t.day >= SPLIT)), spyCheck,
      pool: summarise(pool), poolH1: summarise(pool.filter((t) => t.day < SPLIT)), poolH2: summarise(pool.filter((t) => t.day >= SPLIT)), poolSurv, poolDays: new Set(pool.map((t) => t.day)).size,
      survives: surv.length > 0, surv, lowNSurv: survivorsLowN(base), subSurv, splits,
      byTod: Object.fromEntries(TOD.map((b) => [b.k, summarise(base.filter((t) => t.trigMin >= b.lo && t.trigMin <= b.hi))])),
      misses: Object.fromEntries((['no_strike', 'no_fill', 'below_band'] as const).map((r) => [r, misses.filter((m) => m.sym === 'SPX' && m.cause === cause && m.side === side && m.variant === variant && m.reason === r).length])),
    });
  }
  // catalog aggregates
  const grp = (name: string, f: (c: typeof catalog[number]) => boolean) => {
    const rows = catalog.filter(f); const n = rows.length;
    const absM = (k: 'last30' | 'last10' | 'pm' | 'open30') => r3(mean(rows.map((r) => Math.abs(r[k]))));
    const share = (k: 'last30' | 'pm' | 'open30', x: number) => (n ? +((rows.filter((r) => Math.abs(r[k]) >= x).length / n) * 100).toFixed(0) : null);
    const down = (k: 'last30' | 'pm') => (n ? +((rows.filter((r) => r[k] < 0).length / n) * 100).toFixed(0) : null);
    return { name, n, last30: absM('last30'), last10: absM('last10'), pm: absM('pm'), open30: absM('open30'), last30ge03: share('last30', 0.3), pmge05: share('pm', 0.5), open30ge05: share('open30', 0.5), last30down: down('last30'), pmDown: down('pm') };
  };
  const catalogRows = [
    grp('all sessions', () => true),
    grp('ordinary (no calendar/event flag)', (c) => !c.closeFlow && !c.fomc && !c.macro && !c.vixExp),
    grp('close-flow day (any)', (c) => c.closeFlow),
    grp('month-end (incl. quarter-end)', (c) => c.monthEnd),
    grp('quarter-end', (c) => c.labels.includes('quarter-end')),
    grp('monthly OPEX (incl. quad witching)', (c) => c.opex),
    grp('quad witching / index rebalance', (c) => c.labels.includes('quad witching')),
    grp('FOMC day', (c) => c.fomc),
    grp('08:30 release day (detected)', (c) => c.macro),
    grp('VIX expiry Wednesday', (c) => c.vixExp),
  ];
  const report = {
    generatedAt: new Date().toISOString(), window: { from: FROM, to: END, split: SPLIT, warmup: START }, symbol: SYMBOLS.join(","), macroMult: MACRO_MULT, minHalfN: MIN_HALF_N,
    totals: { zeroDteSessions: nZero, triggers: triggerLog.length, trades: trades.length, misses: misses.length }, zeroBySym, symbols: SYMBOLS, requests, runtimeSec: Math.round((Date.now() - t0) / 1000),
    exits: FM_EXIT_LABEL, catalog: catalogRows, catalogDays: catalog, cells, triggerLog,
    macroDays: catalog.filter((c) => c.macro).map((c) => `${c.day} (${c.macroRvol?.toFixed(1)}×)`),
    fomcCheck: catalog.filter((c) => c.fomc).map((c) => c.day),
  };
  fs.writeFileSync(path.resolve(process.cwd(), 'research/spx-fast-moves-results.json'), JSON.stringify(report, null, 1));
  fs.writeFileSync(path.resolve(process.cwd(), '.cache/zdte-replay/fast-moves-trades.jsonl'), trades.map((t) => JSON.stringify(t)).join('\n') + '\n');
  writeSection(report);
  for (const c of cells) {
    const a = c.all; if (!a.n && !c.pool?.n) continue;
    console.log(`${c.survives ? 'SURVIVES' : c.poolSurv.length ? 'POOL-SUR' : '        '} ${c.label.padEnd(110)} pool ${c.pool?.n ?? 0}:${c.pool?.exp?.hold ?? '—'}/${c.pool?.exp?.half2x_trail ?? '—'} (${c.poolH1?.exp?.half2x_trail ?? '—'}/${c.poolH2?.exp?.half2x_trail ?? '—'}) spy ${c.spy?.n ?? 0}:${c.spy?.exp?.hold ?? '—'}/${c.spy?.exp?.half2x_trail ?? '—'} SPXW n=${String(a.n ?? 0).padStart(4)} 2×${String(a.hit2x).padStart(5)}% 0=${String(a.worthless).padStart(5)}% hold ${a.exp?.hold} t2 ${a.exp?.take2x} h2t ${a.exp?.half2x_trail} · H1 ${c.h1.exp?.hold}/${c.h1.exp?.half2x_trail} H2 ${c.h2.exp?.hold}/${c.h2.exp?.half2x_trail}${c.survives ? ` · ${c.surv.map((s: any) => s.exit).join(',')}` : ''}${c.lowNSurv.length ? ` · lowN:${c.lowNSurv.join(',')}` : ''}`);
    for (const s of c.subSurv) console.log(`           sub ${s.subset} ${s.exit} H1 ${s.h1} (${s.h1n}) H2 ${s.h2} (${s.h2n})`);
  }
  console.log(catalogRows);
}

const MARK_A = '<!-- REPLAY:BEGIN -->', MARK_B = '<!-- REPLAY:END -->';
export function upsertSection(file: string, a: string, b: string, body: string) {
  let doc = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const block = `${a}\n${body}\n${b}`;
  if (doc.includes(a) && doc.includes(b)) doc = doc.slice(0, doc.indexOf(a)) + block + doc.slice(doc.indexOf(b) + b.length);
  else doc = `${doc}${doc ? '\n' : ''}${block}\n`;
  fs.writeFileSync(file, doc);
}

function writeSection(rep: any) {
  const f = (x: any) => (x == null || Number.isNaN(x) ? '—' : typeof x === 'number' ? (Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(2)) : String(x));
  const L: string[] = [];
  const win = `_Window: trades ${rep.window.from} → ${rep.window.to} · H1 ${rep.window.from} → 2026-03-31 · H2 ${rep.window.split} → ${rep.window.to} · SPXW real bars (signals from SPY 1-min bars) · generated ${rep.generatedAt.slice(0, 16)}Z by \`research/spx-fast-moves-replay.ts\`_`;
  L.push('## Causes catalog — does the flag itself make the move bigger?', '', win, '');
  L.push('Every session in the window (no trigger, no option): mean absolute SPY move and the share of sessions with a big move. A calendar/event cause matters only if its row is clearly larger than the ordinary row.', '');
  L.push('| sessions | n | mean abs 15:30→close % | mean abs 15:50→close % | share with abs 15:30→close ≥ 0.30% | share down 15:30→close | mean abs 14:00→close % | share ≥ 0.50% | mean abs open 30 min % | share ≥ 0.50% |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rep.catalog) L.push(`| ${r.name} | ${r.n} | ${f(r.last30)} | ${f(r.last10)} | ${f(r.last30ge03)}% | ${f(r.last30down)}% | ${f(r.pm)} | ${f(r.pmge05)}% | ${f(r.open30)} | ${f(r.open30ge05)}% |`);
  L.push('', `08:30 release days are DETECTED (SPY 08:30–08:34 pre-market volume ≥ ${rep.macroMult}× its 20-session median — known before the open): ${rep.macroDays.length} days. FOMC days from the Fed schedule: ${rep.fomcCheck.join(', ')}.`, '');
  L.push('## Replay — every cause × side × contract (real SPXW 0DTE option bars; SPY and the ETF pool alongside)', '', win, '');
  L.push(`${rep.totals.trades} option trades from ${rep.totals.triggers} triggers (${Object.entries(rep.zeroBySym).map(([k, v]) => `${k} ${v} sessions`).join(', ')}). **Primary = SPX: real SPXW 0DTE 1-min bars** (signals from SPY bars; strike on the SPXW grid at SPY × the prior close's ^GSPC/SPY ratio; expiry value from the ^GSPC official close). SPY ETF 0DTE and the SPY+QQQ+IWM pool are shown as corroboration — pooled trades are NOT independent (the same index move hits all three on the same day). Expectancy = mean P&L per $1 of premium (−1.00 = total loss). Survives = SPXW ≥ ${rep.minHalfN} trades per half and positive in both halves with and without each half's best trade.`, '');
  L.push('| cause | side | contract | SPXW n (H1/H2) | 2×% | 3×% | 5×% | worthless % | med entry | und. move % | hold | take2x | take2x_close | take3x | half2x_trail | stop50 | H1 hold / h2t | H2 hold / h2t | SPY 0DTE: n · hold · h2t | ETF pool: n · days · hold · h2t (H1/H2 h2t) | SPXW survives |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const c of rep.cells) {
    const a = c.all;
    const sp = c.spy?.n ? `${c.spy.n} · ${f(c.spy.exp.hold)} · ${f(c.spy.exp.half2x_trail)}` : '—';
    const pl = c.pool?.n ? `${c.pool.n} · ${c.poolDays} · ${f(c.pool.exp.hold)} · ${f(c.pool.exp.half2x_trail)} (${f(c.poolH1.exp?.half2x_trail)}/${f(c.poolH2.exp?.half2x_trail)})${c.poolSurv.length ? ` · pool survives: ${c.poolSurv.map((s: any) => s.exit).join(', ')}` : ''}` : '—';
    if (!a.n) { L.push(`| ${CAUSE_LABEL[c.cause as CauseId]} | ${c.side === 'short' ? 'puts' : 'calls'} | ${c.variant} | 0 | | | | | | | | | | | | | | | ${sp} | ${pl} | — |`); continue; }
    const sv = c.survives ? `**yes** (${c.surv.map((s: any) => `${s.exit}; ${c.spyCheck[s.exit]}`).join(' · ')})` : c.lowNSurv.length ? `n too small; both halves > 0 on ${c.lowNSurv.join(', ')}` : 'no';
    L.push(`| ${CAUSE_LABEL[c.cause as CauseId]} | ${c.side === 'short' ? 'puts' : 'calls'} | ${c.variant} | ${a.n} (${c.h1.n ?? 0}/${c.h2.n ?? 0}) | ${f(a.hit2x)} | ${f(a.hit3x)} | ${f(a.hit5x)} | ${f(a.worthless)} | ${f(a.medEntry)} | ${f(a.undMove)} | ${f(a.exp.hold)} | ${f(a.exp.take2x)} | ${f(a.exp.take2x_close)} | ${f(a.exp.take3x)} | ${f(a.exp.half2x_trail)} | ${f(a.exp.stop50)} | ${f(c.h1.exp?.hold)} / ${f(c.h1.exp?.half2x_trail)} | ${f(c.h2.exp?.hold)} / ${f(c.h2.exp?.half2x_trail)} | ${sp} | ${pl} | ${sv} |`);
  }
  L.push('', '## Survivors on SPXW (whole cells, then sub-cell splits)', '', win, '');
  const surv = rep.cells.filter((c: any) => c.survives);
  if (!surv.length) L.push('**No whole cell survived.**', '');
  else {
    L.push('| cause · side · contract | exit | n (H1/H2) | H1 | H2 | H1 ex-best | H2 ex-best |', '|---|---|---|---|---|---|---|');
    for (const c of surv) for (const s of c.surv) L.push(`| ${c.label} | ${s.exit} | ${s.h1n + s.h2n} (${s.h1n}/${s.h2n}) | ${f(s.h1)} | ${f(s.h2)} | ${f(s.h1ExBest)} | ${f(s.h2ExBest)} |`);
    L.push('');
  }
  const subs = rep.cells.flatMap((c: any) => c.subSurv.map((s: any) => ({ label: c.label, ...s })));
  L.push('Sub-cell survivors (calendar / VIXY / range / RVOL splits — extra comparisons, hypotheses only):', '');
  if (!subs.length) L.push('None.', '');
  else {
    L.push('| cause · side · contract | subset | exit | n (H1/H2) | H1 | H2 | H1 ex-best | H2 ex-best |', '|---|---|---|---|---|---|---|---|');
    for (const s of subs) L.push(`| ${s.label} | ${s.subset} | ${s.exit} | ${s.h1n + s.h2n} (${s.h1n}/${s.h2n}) | ${f(s.h1)} | ${f(s.h2)} | ${f(s.h1ExBest)} | ${f(s.h2ExBest)} |`);
    L.push('');
  }
  L.push('## Calendar / short-gamma-proxy splits on SPXW (half2x_trail expectancy, n)', '', win, '');
  const keys = ['close-flow day', 'ordinary day', 'VIXY confirms', 'VIXY does not', 'range ≥ 0.8 ATR', 'range < 0.8 ATR', 'trigger RVOL ≥ 3'];
  L.push(`| cause | side | contract | ${keys.join(' | ')} |`, `|---|---|---|${keys.map(() => '---').join('|')}|`);
  for (const c of rep.cells) {
    if (!c.all.n) continue;
    L.push(`| ${CAUSE_LABEL[c.cause as CauseId]} | ${c.side === 'short' ? 'puts' : 'calls'} | ${c.variant} | ${keys.map((k) => { const s = c.splits[k]; return s?.all?.n ? `${f(s.all.exp.half2x_trail)} (${s.all.n}; H1 ${f(s.h1.exp?.half2x_trail)} / H2 ${f(s.h2.exp?.half2x_trail)})` : '—'; }).join(' | ')} |`);
  }
  L.push('', '## Time of day on SPXW (hold-to-close expectancy · half2x_trail, n)', '', win, '');
  const tk = Object.keys(rep.cells[0].byTod);
  L.push(`| cause | side | contract | ${tk.join(' | ')} |`, `|---|---|---|${tk.map(() => '---').join('|')}|`);
  for (const c of rep.cells) if (c.all.n) L.push(`| ${CAUSE_LABEL[c.cause as CauseId]} | ${c.side === 'short' ? 'puts' : 'calls'} | ${c.variant} | ${tk.map((k) => { const s = c.byTod[k]; return s.n ? `${f(s.exp.hold)} · ${f(s.exp.half2x_trail)} (${s.n})` : '—'; }).join(' | ')} |`);
  L.push('', '## Exits', '');
  for (const [k, v] of Object.entries(rep.exits)) L.push(`- \`${k}\` — ${v}`);
  upsertSection(path.resolve(process.cwd(), 'docs/SPX_FAST_MOVES_2026-09-30.md'), MARK_A, MARK_B, L.join('\n'));
}

if (process.argv[1] && /spx-fast-moves-replay/.test(process.argv[1])) main().catch((e) => { console.error(e); process.exit(1); });
export { main as runFastMovesReplay, type DayBars };
