/**
 * SQUEEZE RADAR — historical replay of the history-capable legs + case studies.
 * ============================================================================
 *   npx tsx research/squeeze-radar-backtest.ts [--occ-dir DIR] [--bars-dir DIR] [--offline]
 *   npx tsx research/squeeze-radar-backtest.ts --fetch-occ 2024-09-30 2026-09-28   (polite: 1 request / session, 1.5 s apart, ~4 MB each, cached compact)
 *
 * WHAT CAN BE REPLAYED (docs/GAMMA_SQUEEZE.md §Validation):
 *   - OCC daily volume by account type (customer / firm / market maker, calls /
 *     puts) per underlying — public, one request per session, 24 months deep.
 *     Files: <occ-dir>/YYYY-MM-DD.json in the server cache format
 *     ({ SYM: { cC, fC, mC, cP, fP, mP } }), written by server/squeeze-radar.ts
 *     or by the polite downloader described in the doc.
 *   - Daily OHLCV (Yahoo chart API, cached under <bars-dir>/SYM.json).
 * WHAT CANNOT (no historical source we have): per-strike OI, call walls,
 * zero-gamma, IV / skew, the aggressor tape, point-in-time short interest.
 * Those radar components are NOT simulated here — this replays only
 * scoreHistoryCapable() (rv expansion 8 + momentum 6 + OCC customer calls 8 =
 * 22 of the radar's 100 points), with the same code the live engine uses.
 *
 * SIGNAL (declared before the replay; not tuned): history-capable sub-score
 *   ≥ 60% of its 22-point max (≥ 13.2), evaluated after the close of day t
 *   (OCC publishes that evening; bars are completed sessions).
 * OUTCOME: max HIGH over sessions t+1..t+10 ≥ close_t × 1.20 (also × 1.35).
 * BASE RATES: (a) every universe-day; (b) matched — same cross-sectional RV20
 *   quintile × dollar-volume tercile on the same day, from non-signal days.
 * WALK-FORWARD: half A = signals dated before 2025-10-01, half B = on/after.
 *   Also: the sub-score threshold that maximised lift on A, applied unchanged to B.
 * Independence: signals within 10 sessions of an earlier signal on the same
 *   ticker are folded into it ("episodes") — both counts are printed.
 */
import fs from 'fs';
import path from 'path';
import { scoreHistoryCapable, squeezeMedian, SQUEEZE_WEIGHTS, type SqueezeOccRead } from '../shared/squeeze-radar';
import { INDEX_TICKERS, S_TIER, A_TIER, SECONDARY, SMALL_ACCOUNT_TIER } from '../shared/approved-tickers';

const arg = (k: string, d: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OCC_DIR = arg('--occ-dir', path.join(process.cwd(), '.cache', 'occ-volume'));
const BARS_DIR = arg('--bars-dir', path.join(process.cwd(), '.cache', 'yahoo-daily'));
const OFFLINE = process.argv.includes('--offline');
const HORIZON = 10;
const HIT1 = 1.2, HIT2 = 1.35;
const HC_MAX = SQUEEZE_WEIGHTS.rvExpansion + SQUEEZE_WEIGHTS.momentum + SQUEEZE_WEIGHTS.occCustomerCalls;
const THRESH = 0.6 * HC_MAX;
const SPLIT = '2025-10-01';

// Same static universe as the rankings job (gex-rankings buildUniverse 1–2 + squeeze watch), single stocks only.
const HIGH_BETA = ['BE', 'STX', 'MSTR', 'COIN', 'SMCI', 'PLTR', 'TSLA', 'NVDA', 'AMD', 'SNDK', 'MU', 'WDC'];
const SQUEEZE_WATCH = ['IONQ', 'RKLB', 'SPCE', 'ASTS', 'BE', 'AMD', 'TSLA', 'LUNR', 'OKLO', 'AAOI', 'CRCL', 'CRWV', 'NBIS', 'APP', 'RGTI', 'QBTS', 'HOOD'];
const ETFS = new Set(['SPY', 'QQQ', 'IWM', 'XSP', 'DIA', 'SMH', 'XLK', 'EWY', 'SOXX', 'IGV', 'XBI', 'ARKK', 'COPX']);
const UNIVERSE = [...new Set([...INDEX_TICKERS, ...S_TIER, ...A_TIER, ...SECONDARY, ...SMALL_ACCOUNT_TIER, ...HIGH_BETA, ...SQUEEZE_WATCH].map(String))]
  .filter((s) => /^[A-Z]{1,5}$/.test(s) && !ETFS.has(s)).sort();

interface Bar { d: string; o: number; h: number; l: number; c: number; v: number }
type OccDay = Record<string, { cC: number; fC: number; mC: number; cP: number; fP: number; mP: number }>;

// ─── Data ───────────────────────────────────────────────────────────────
async function bars(sym: string): Promise<Bar[]> {
  const f = path.join(BARS_DIR, `${sym}.json`);
  let raw: any = null;
  try { raw = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* fetch */ }
  if (!raw && !OFFLINE) {
    await new Promise((r) => setTimeout(r, 1200)); // polite
    const r = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${sym}?range=2y&interval=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (r.ok) { raw = await r.json(); fs.mkdirSync(BARS_DIR, { recursive: true }); fs.writeFileSync(f, JSON.stringify(raw)); }
  }
  const res = raw?.chart?.result?.[0];
  if (!res?.timestamp) return [];
  const q = res.indicators.quote[0];
  const out: Bar[] = [];
  res.timestamp.forEach((ts: number, i: number) => {
    const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(ts * 1000));
    if (q.close[i] > 0 && q.high[i] > 0 && q.low[i] > 0) out.push({ d, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], v: q.volume[i] ?? 0 });
  });
  return out;
}

function loadOcc(): Map<string, OccDay> {
  const m = new Map<string, OccDay>();
  for (const f of fs.readdirSync(OCC_DIR).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort()) {
    const d = JSON.parse(fs.readFileSync(path.join(OCC_DIR, f), 'utf8')) as OccDay;
    if (Object.keys(d).length) m.set(f.slice(0, 10), d);
  }
  return m;
}

// ─── Per ticker-day features ────────────────────────────────────────────
interface Row {
  sym: string; d: string; i: number; close: number;
  sub: number; rvRatio: number | null; ret5: number | null; occRatio: number | null;
  rv20: number | null; dollarVol: number;
  custCalls: number | null; custCallShare: number | null;
  fwdMax: number | null; hit1: boolean | null; hit2: boolean | null;
}

function features(sym: string, b: Bar[], occ: Map<string, OccDay>, occDates: string[]): Row[] {
  const rows: Row[] = [];
  const occIdx = new Map(occDates.map((d, i) => [d, i]));
  for (let i = 25; i < b.length; i++) {
    const d = b[i].d;
    const oi = occIdx.get(d);
    let occRead: SqueezeOccRead | null = null;
    let custCalls: number | null = null, custCallShare: number | null = null;
    if (oi != null && oi >= 20) {
      const cur = occ.get(d)![sym];
      if (cur) {
        const base = occDates.slice(oi - 20, oi).map((x) => occ.get(x)![sym]?.cC ?? 0);
        occRead = { customerCallSides: cur.cC, baselineMedian: squeezeMedian(base), sessions: base.length, date: d };
        custCalls = cur.cC;
        custCallShare = cur.cC + cur.cP > 0 ? cur.cC / (cur.cC + cur.cP) : null;
      }
    }
    const closes = b.slice(Math.max(0, i - 40), i + 1).map((x) => x.c);
    const hc = scoreHistoryCapable({ closes, avgDollarVolume20: null, asOf: d }, occRead);
    const sub = (hc.rvExpansion ?? 0) + (hc.momentum ?? 0) + (hc.occCustomerCalls ?? 0);
    let fwdMax: number | null = null;
    if (i + HORIZON < b.length) fwdMax = Math.max(...b.slice(i + 1, i + 1 + HORIZON).map((x) => x.h));
    const dv = b.slice(i - 19, i + 1).reduce((a, x) => a + x.c * x.v, 0) / 20;
    rows.push({
      sym, d, i, close: b[i].c, sub, rvRatio: hc.rvRatio, ret5: hc.ret5, occRatio: hc.occRatio, rv20: hc.rv20, dollarVol: dv,
      custCalls, custCallShare,
      fwdMax, hit1: fwdMax == null ? null : fwdMax >= b[i].c * HIT1, hit2: fwdMax == null ? null : fwdMax >= b[i].c * HIT2,
    });
  }
  return rows;
}

// ─── Stats ──────────────────────────────────────────────────────────────
function wilson(k: number, n: number): [number, number] {
  if (!n) return [NaN, NaN];
  const z = 1.96, p = k / n, den = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / den, h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / den;
  return [c - h, c + h];
}
const pc = (x: number) => `${(x * 100).toFixed(1)}%`;

function cellKey(r: Row, cuts: Map<string, { rv: number[]; dv: number[] }>): string | null {
  const c = cuts.get(r.d); if (!c || r.rv20 == null) return null;
  const q = c.rv.filter((x) => r.rv20! > x).length;      // 0..4
  const t = c.dv.filter((x) => r.dollarVol > x).length;  // 0..2
  return `${q}|${t}`;
}

function evaluate(label: string, sig: (r: Row) => boolean, rows: Row[], cuts: Map<string, { rv: number[]; dv: number[] }>, which: 'hit1' | 'hit2') {
  const res: Record<string, any> = {};
  for (const [half, f] of [['A', (r: Row) => r.d < SPLIT], ['B', (r: Row) => r.d >= SPLIT], ['all', () => true]] as const) {
    const pool = rows.filter((r) => r[which] != null && r.rv20 != null && f(r));
    const signals = pool.filter(sig);
    // episodes: first signal per ticker, then skip HORIZON sessions
    const lastBySym = new Map<string, number>();
    const episodes = signals.filter((r) => { const l = lastBySym.get(r.sym); if (l != null && r.i - l <= HORIZON) return false; lastBySym.set(r.sym, r.i); return true; });
    const cell = new Map<string, { k: number; n: number }>();
    for (const r of pool) if (!sig(r)) { const key = cellKey(r, cuts); if (!key) continue; const c = cell.get(key) ?? { k: 0, n: 0 }; c.n++; if (r[which]) c.k++; cell.set(key, c); }
    const expected = (xs: Row[]) => { let s = 0, n = 0; for (const r of xs) { const c = cell.get(cellKey(r, cuts) ?? ''); if (c && c.n >= 20) { s += c.k / c.n; n++; } } return n ? s / n : NaN; };
    const k = signals.filter((r) => r[which]).length, ke = episodes.filter((r) => r[which]).length;
    const base = pool.filter((r) => r[which]).length / pool.length;
    res[half] = { n: signals.length, k, rate: k / signals.length, ci: wilson(k, signals.length), ep: episodes.length, ke, epRate: ke / episodes.length, epCi: wilson(ke, episodes.length), base, pool: pool.length, matched: expected(signals), matchedEp: expected(episodes) };
  }
  console.log(`\n${label} — outcome ${which === 'hit1' ? '+20%' : '+35%'} high within ${HORIZON} sessions`);
  for (const h of ['A', 'B', 'all']) {
    const x = res[h];
    console.log(`  ${h.padEnd(3)} signal-days n=${x.n} hit ${pc(x.rate)} [${pc(x.ci[0])}–${pc(x.ci[1])}] | episodes n=${x.ep} hit ${pc(x.epRate)} [${pc(x.epCi[0])}–${pc(x.epCi[1])}] | base all-days ${pc(x.base)} (n=${x.pool}) | matched RV×$vol ${pc(x.matched)} (episodes ${pc(x.matchedEp)}) | lift vs matched ${(x.epRate / x.matchedEp).toFixed(2)}×`);
  }
  return res;
}

// ─── Case studies ───────────────────────────────────────────────────────
const CASES: Array<{ sym: string; start: string; peak: string; note: string }> = [
  { sym: 'AMD', start: '2026-09-03', peak: '2026-09-25', note: 'operator: "440→660, ~3 weeks ago"' },
  { sym: 'TSLA', start: '2025-09-04', peak: '2025-10-02', note: 'largest TSLA run in the last 12 months' },
  { sym: 'IONQ', start: '2026-09-14', peak: '2026-09-28', note: 'most recent ≥35% run' },
  { sym: 'RKLB', start: '2026-04-29', peak: '2026-05-27', note: 'largest recent run' },
  { sym: 'SPCE', start: '2026-05-01', peak: '2026-06-01', note: 'largest recent run' },
  { sym: 'ASTS', start: '2026-05-05', peak: '2026-05-28', note: 'largest recent run' },
  { sym: 'BE', start: '2026-08-24', peak: '2026-09-17', note: 'run before the 300C week' },
  { sym: 'BE', start: '2026-09-24', peak: '2026-09-29', note: '300C (exp 10-02) week — option prices not verifiable here' },
];

function caseStudy(c: (typeof CASES)[number], b: Bar[], rows: Row[]) {
  const si = b.findIndex((x) => x.d === c.start), pi = b.findIndex((x) => x.d === c.peak);
  if (si < 0 || pi < 0) { console.log(`\n${c.sym}: dates not in bars`); return; }
  const lo = b[si].l, hi = Math.max(...b.slice(si, pi + 1).map((x) => x.h));
  console.log(`\n── ${c.sym} ${c.start} → ${c.peak} (${c.note}): low ${lo.toFixed(2)} → high ${hi.toFixed(2)} (+${((hi / lo - 1) * 100).toFixed(0)}%), close ${b[si].c.toFixed(2)} → ${b[pi].c.toFixed(2)}`);
  console.log('   date        close    ret5   RV5/20  custCalls  vs20d  callShr  sub/22  fired');
  const byD = new Map(rows.map((r) => [r.d, r]));
  let first: Row | null = null;
  for (let i = Math.max(0, si - 12); i <= Math.min(b.length - 1, pi + 2); i++) {
    const r = byD.get(b[i].d);
    const fired = !!r && r.sub >= THRESH;
    if (fired && !first && i <= pi) first = r!;
    console.log(`   ${b[i].d}  ${b[i].c.toFixed(2).padStart(8)}  ${r?.ret5 != null ? r.ret5.toFixed(1).padStart(6) : '     —'}  ${r?.rvRatio != null ? r.rvRatio.toFixed(2).padStart(6) : '     —'}  ${r?.custCalls != null ? String(r.custCalls).padStart(9) : '        —'}  ${r?.occRatio != null ? r.occRatio.toFixed(2).padStart(5) : '    —'}  ${r?.custCallShare != null ? pc(r.custCallShare).padStart(7) : '      —'}  ${r ? r.sub.toFixed(1).padStart(6) : '     —'}  ${fired ? 'YES' : ''}${b[i].d === c.start ? '  ← low' : ''}${b[i].d === c.peak ? '  ← peak' : ''}`);
  }
  if (first) {
    const fi = b.findIndex((x) => x.d === first!.d);
    console.log(`   first fire ${first.d}: ${fi - si >= 0 ? `${fi - si} sessions AFTER the low` : `${si - fi} sessions BEFORE the low`}; ${pc(hi / first.close - 1)} of upside left from that close to the peak high`);
  } else console.log('   no fire between start−12 and peak');
}

// ─── Main ───────────────────────────────────────────────────────────────
if (process.argv.includes('--fetch-occ')) {
  const i = process.argv.indexOf('--fetch-occ');
  const [from, to] = [process.argv[i + 1], process.argv[i + 2]];
  const { parseOccCsv } = await import('../server/squeeze-radar');
  fs.mkdirSync(OCC_DIR, { recursive: true });
  for (let d = new Date(`${from}T12:00:00Z`); d <= new Date(`${to}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const iso = d.toISOString().slice(0, 10);
    const f = path.join(OCC_DIR, `${iso}.json`);
    if (fs.existsSync(f)) continue;
    const url = `https://marketdata.theocc.com/volume-query?reportDate=${iso.replace(/-/g, '')}&format=csv&volumeQueryType=O&symbolType=ALL&symbol=&reportType=D&accountType=ALL&productKind=ALL&porc=BOTH`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (research; one request per session)' } });
    if (r.ok) { const day = parseOccCsv(await r.text()); fs.writeFileSync(f, JSON.stringify(day)); console.log(iso, Object.keys(day).length); }
    else console.log(iso, 'HTTP', r.status);
    await new Promise((res) => setTimeout(res, 1500));
  }
  process.exit(0);
}
const occ = loadOcc();
const occDates = [...occ.keys()].sort();
console.log(`OCC sessions: ${occDates.length} (${occDates[0]} → ${occDates[occDates.length - 1]}); universe ${UNIVERSE.length} single stocks (ETFs excluded); signal = sub-score ≥ ${THRESH.toFixed(1)} of ${HC_MAX}`);
const all: Row[] = [];
const barsBy = new Map<string, Bar[]>();
let missing: string[] = [];
for (const s of [...new Set([...UNIVERSE, ...CASES.map((c) => c.sym)])]) {
  const b = await bars(s);
  if (b.length < 60) { missing.push(s); continue; }
  barsBy.set(s, b);
  all.push(...features(s, b, occ, occDates));
}
console.log(`bars for ${barsBy.size} names${missing.length ? `; missing ${missing.join(', ')}` : ''}; ticker-days ${all.length}`);

// Cross-sectional cut points per day (RV20 quintiles, $-volume terciles) — no look-ahead.
const cuts = new Map<string, { rv: number[]; dv: number[] }>();
const byDay = new Map<string, Row[]>();
for (const r of all) { const a = byDay.get(r.d) ?? []; a.push(r); byDay.set(r.d, a); }
const qs = (xs: number[], ps: number[]) => { const v = [...xs].sort((a, b) => a - b); return ps.map((p) => v[Math.min(v.length - 1, Math.floor(p * v.length))]); };
for (const [d, rs] of byDay) {
  const rv = rs.map((r) => r.rv20).filter((x): x is number => x != null);
  if (rv.length >= 30) cuts.set(d, { rv: qs(rv, [0.2, 0.4, 0.6, 0.8]), dv: qs(rs.map((r) => r.dollarVol), [1 / 3, 2 / 3]) });
}

for (const c of CASES) { const b = barsBy.get(c.sym); if (b) caseStudy(c, b, all.filter((r) => r.sym === c.sym)); }

console.log('\n════════ VALIDATION (history-capable legs only) ════════');
const withOcc = all.filter((r) => r.occRatio != null);
console.log(`ticker-days with OCC baseline: ${withOcc.length}`);
const sigMain = (r: Row) => r.occRatio != null && r.sub >= THRESH;
evaluate(`A priori: sub-score ≥ ${THRESH.toFixed(1)}/${HC_MAX}`, sigMain, withOcc, cuts, 'hit1');
evaluate(`A priori: sub-score ≥ ${THRESH.toFixed(1)}/${HC_MAX}`, sigMain, withOcc, cuts, 'hit2');
evaluate('OCC leg alone: customer call sides ≥ 2× 20-session median', (r) => (r.occRatio ?? 0) >= 2, withOcc, cuts, 'hit1');

// Tuned on A, tested on B.
let best = { t: THRESH, lift: -Infinity };
for (let t = 6; t <= 20; t += 1) {
  const sig = (r: Row) => r.occRatio != null && r.sub >= t;
  const A = withOcc.filter((r) => r.d < SPLIT && r.hit1 != null && r.rv20 != null);
  const s = A.filter(sig);
  if (s.length < 30) continue;
  const lift = (s.filter((r) => r.hit1).length / s.length) / (A.filter((r) => r.hit1).length / A.length);
  if (lift > best.lift) best = { t, lift };
}
console.log(`\nWalk-forward: threshold maximising raw lift on half A = ${best.t} (A lift ${best.lift.toFixed(2)}×) — applied unchanged to B:`);
evaluate(`Tuned-on-A threshold ${best.t}`, (r) => r.occRatio != null && r.sub >= best.t, withOcc, cuts, 'hit1');

// Event recall: every ≥35% low→high run within 20 sessions (non-overlapping) in the universe.
console.log('\n════════ EVENT RECALL ════════');
let events = 0, caught = 0, occupancy = 0, occN = 0;
for (const [s, b] of barsBy) {
  const rs = new Map(all.filter((r) => r.sym === s).map((r) => [r.i, r]));
  const firstOcc = b.findIndex((x) => x.d >= (occDates[20] ?? '9999'));
  if (firstOcc < 0) continue;
  const used = new Set<number>();
  const cands: Array<{ i: number; k: number; g: number }> = [];
  for (let i = firstOcc; i < b.length; i++) for (let k = i + 1; k < Math.min(b.length, i + 21); k++) { const g = b[k].h / b[i].l - 1; if (g >= 0.35) cands.push({ i, k, g }); }
  cands.sort((a, z) => z.g - a.g);
  for (const c of cands) {
    let okk = true; for (let x = c.i; x <= c.k; x++) if (used.has(x)) okk = false;
    if (!okk) continue;
    for (let x = c.i; x <= c.k; x++) used.add(x);
    events++;
    let hit = false;
    for (let x = c.i - 5; x <= c.i + 3; x++) { const r = rs.get(x); if (r && sigMain(r)) hit = true; }
    if (hit) caught++;
  }
  // occupancy: share of all 9-session windows containing a fire (the chance a random window 'catches')
  for (let i = firstOcc + 5; i < b.length - 3; i += 9) { let f = false; for (let x = i - 5; x <= i + 3; x++) { const r = rs.get(x); if (r && sigMain(r)) f = true; } occN++; if (f) occupancy++; }
}
console.log(`≥35% runs (≤20 sessions, non-overlapping): ${events}; signal fired in [low−5, low+3]: ${caught} (${pc(caught / events)}); random 9-session windows with a fire: ${pc(occupancy / occN)} (n=${occN})`);
