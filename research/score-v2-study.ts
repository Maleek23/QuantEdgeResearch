/**
 * SCORE V2 STUDY — does any point-in-time setup feature rank NEXUS ideas by what
 * they then did? Old evidence score vs a small, shrunk points table, out of sample.
 *
 *   npm run research:score-v2       (needs .cache/score-v2/ideas-raw.json — see docs/SCORE_V2_STUDY.md)
 *
 * LABELS (bar-verified, not the tracker's stamps): research/lib/idea-replay.ts — the
 * exit-rule replay's entries and exits. Primary label = underlying R under rule 7
 * (published plan + time stop at ½ horizon unless ≥ +0.5R), winsorised to [−3, +5]
 * for means; Spearman uses ranks. Secondary = $ at equal size ($500 premium per
 * option idea at the bar-high fill, $1,000 notional per stock / crypto idea).
 *
 * FEATURES: computed at the idea's publish time from (a) the layers persisted when it
 * was first surfaced (gen_scoring_layers) and (b) completed daily bars only
 * (shared/setup-features.ts completedThrough) plus the last 1-min price before publish.
 * Sector rotation = shared/sector-ignition.ts scoreSwing on the peer group's ETF and
 * members, cut at the same completed session.
 *
 * METHOD: halves split at the median publish day. Honest out-of-sample: feature
 * selection AND weights are fit on one half only (selection = same-sign Spearman in
 * that half's own two quarters), then scored on the other half; both directions.
 * The production table (same sign in both halves, fit on all data) is reported
 * separately and flagged as selection-optimistic.
 */
import fs from 'fs';
import path from 'path';
import { replayIdeas, getJson, pool, cached, NOW, requests, type Idea, type Row, type Store } from './lib/idea-replay';
import { nyDayMinute } from '../shared/option-expiry';
import { completedThrough, dailyFeatures, relStrength5, rotationAlignment, type DayBar, type Dir } from '../shared/setup-features';
import { scoreSwing, ignitionGroups, type GroupRead } from '../shared/sector-ignition';
import { getPeerSet } from '../shared/sector-peers';

const ROOT = path.resolve(process.cwd(), '.cache/score-v2');
const DAY_DIR = path.join(ROOT, 'day');
fs.mkdirSync(DAY_DIR, { recursive: true });
const OUT = path.resolve(process.cwd(), 'research/score-v2-study-results.json');
const R_LO = -3, R_HI = 5;
const wins = (r: number) => Math.max(R_LO, Math.min(R_HI, r));

// ── daily bars with volume ─────────────────────────────────────────────────
async function daily(sym: string, crypto: boolean): Promise<DayBar[]> {
  const endDay = nyDayMinute(NOW).day;
  const file = path.join(DAY_DIR, `${sym.replace('/', '_')}_${endDay}.json`);
  const c = cached<DayBar[]>(file); if (c) return c;
  const base = crypto ? 'https://data.alpaca.markets/v1beta3/crypto/us/bars' : 'https://data.alpaca.markets/v2/stocks/bars';
  const out: DayBar[] = []; let token: string | undefined;
  for (let p = 0; p < 20; p++) {
    const u = new URL(base);
    u.searchParams.set('symbols', sym); u.searchParams.set('timeframe', '1Day'); u.searchParams.set('start', '2026-01-15T00:00:00Z');
    u.searchParams.set('end', new Date(NOW).toISOString()); u.searchParams.set('limit', '10000');
    if (!crypto) { u.searchParams.set('adjustment', 'split'); u.searchParams.set('feed', 'sip'); }
    if (token) u.searchParams.set('page_token', token);
    const j = await getJson(u.toString());
    for (const b of j.bars?.[sym] ?? []) {
      const t = Date.parse(b.t);
      out.push({ day: crypto ? new Date(t).toISOString().slice(0, 10) : nyDayMinute(t + 12 * 3600_000).day, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v ?? 0 });
    }
    token = j.next_page_token || undefined; if (!token) break;
  }
  out.sort((a, b) => (a.day < b.day ? -1 : 1));
  fs.writeFileSync(file, JSON.stringify(out));
  return out;
}

// ── stats helpers ──────────────────────────────────────────────────────────
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const rd = (x: number, d = 3) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);
function ranks(xs: number[]): number[] {
  const idx = xs.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; }
  return r;
}
function pearson(a: number[], b: number[]): number {
  const n = a.length; if (n < 3) return NaN;
  const ma = mean(a), mb = mean(b); let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
}
const spearman = (a: number[], b: number[]) => pearson(ranks(a), ranks(b));
function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
let seed = 12345; const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);

// ── per-row features ───────────────────────────────────────────────────────
interface FRow {
  id: string; symbol: string; day: string; half: 'H1' | 'H2'; dir: Dir; source: string; kind: string; hp: string;
  R: number; Rw: number; usd: number; rPlan: number; open: boolean;
  old: number | null; f: Record<string, number | null>; cat: Record<string, string>;
}
const LAYER_KINDS = ['technical', 'structure', 'regime', 'ta', 'premarket', 'gex', 'sector', 'breadth', 'compression'];

function priceAt(st: Store | undefined, ms: number): number | null {
  if (!st) return null;
  let lo = 0, hi = st.bars.length - 1, k = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (st.bars[m].t + 60_000 <= ms) { k = m; lo = m + 1; } else hi = m - 1; }
  return k >= 0 ? st.bars[k].c : null;
}
function sessionOpen(st: Store | undefined, day: string, ms: number): number | null {
  if (!st) return null;
  const b = st.bars.find((x) => x.day === day);
  return b && b.t + 60_000 <= ms ? b.o : null;
}

async function main() {
  const rawFile = path.join(ROOT, 'ideas-raw.json');
  if (!fs.existsSync(rawFile)) throw new Error(`missing ${rawFile} — dump trade_ideas first (docs/SCORE_V2_STUDY.md)`);
  const raw: any[] = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
  const byId = new Map(raw.map((x) => [x.id, x]));
  const ideas: Idea[] = raw.map((x) => ({ ...x, conv: x.gen_conviction_score }));
  const { rows, excl, stores } = await replayIdeas(ideas);
  console.log(`replayed ${rows.length}`, excl);

  // Daily bars: idea symbols, SPY, every ignition group's ETF + members.
  const groups = ignitionGroups();
  const syms = new Set<string>(['SPY']);
  for (const r of rows) if (r.kind !== 'crypto') syms.add(r.symbol === 'SPX' ? 'SPY' : r.symbol);
  for (const g of groups) { syms.add(g.etf); g.members.forEach((m) => syms.add(m)); }
  const dbars = new Map<string, DayBar[]>();
  await pool([...syms], 6, async (s) => { try { dbars.set(s, await daily(s, false)); } catch (e) { console.warn('daily fail', s, (e as Error).message); } });
  for (const r of rows) if (r.kind === 'crypto' && !dbars.has('C:' + r.symbol)) { try { dbars.set('C:' + r.symbol, await daily(`${r.symbol}/USD`, true)); } catch { /* none */ } }
  console.log(`daily series ${dbars.size} (requests ${requests})`);
  const spy = dbars.get('SPY')!;

  // Rotation read per (group, cutoff session) — scoreSwing on completed closes.
  const rotMemo = new Map<string, GroupRead | null>();
  function rotationFor(symbol: string, cutDay: string): GroupRead | null {
    const ps = getPeerSet(symbol);
    const g = ps ? groups.find((x) => x.groupId === ps.group.id) : undefined;
    if (!g) return null;
    const key = `${g.groupId}|${cutDay}`;
    if (rotMemo.has(key)) return rotMemo.get(key)!;
    const dates = spy.filter((b) => b.day <= cutDay).map((b) => b.day).slice(-90);
    const ser = (s: string) => { const m = new Map((dbars.get(s) ?? []).map((b) => [b.day, b.c])); return dates.map((d) => m.get(d) ?? NaN); };
    const spyS = ser('SPY'); const etfRaw = ser(g.etf);
    const ok = etfRaw.map((v, k) => Number.isFinite(v) && Number.isFinite(spyS[k]));
    const read = scoreSwing({
      groupId: g.groupId, label: g.label, etf: g.etf,
      etfCloses: etfRaw.filter((_, k) => ok[k]), spyCloses: spyS.filter((_, k) => ok[k]),
      members: g.members.map((m) => ({ symbol: m, closes: ser(m).filter((x) => Number.isFinite(x)) })).filter((m) => m.closes.length > 0),
      flowDays: null,
    });
    rotMemo.set(key, read);
    return read;
  }

  const days = rows.map((r) => r.pubDay).sort();
  const median = days[Math.floor(days.length / 2)];
  const fr: FRow[] = [];
  const miss: Record<string, number> = {};
  for (const r of rows) {
    const x = byId.get(r.id);
    const dir: Dir = r.dir;
    const crypto = r.kind === 'crypto';
    const st = stores.get(r.symbol === 'SPX' ? 'SPX' : (crypto ? 'C:' : '') + r.symbol);
    const dKey = crypto ? 'C:' + r.symbol : r.symbol === 'SPX' ? 'SPY' : r.symbol;
    const all = dbars.get(dKey) ?? [];
    const cut = completedThrough(all, r.pubMs, crypto);
    let bars = all.slice(0, cut);
    let price = priceAt(st, r.pubMs) ?? (bars.length ? bars[bars.length - 1].c : null);
    if (r.symbol === 'SPX' && bars.length && price) {
      // SPX levels are SPY × the ^GSPC/SPY ratio; rescale SPY daily bars by the ratio at publish.
      const spyPx = priceAt(stores.get('SPY'), r.pubMs) ?? bars[bars.length - 1].c;
      const k = price / spyPx;
      bars = bars.map((b) => ({ ...b, o: b.o * k, h: b.h * k, l: b.l * k, c: b.c * k }));
    }
    const dfeat = price ? dailyFeatures(bars, price, dir) : null;
    if (!dfeat) miss.daily = (miss.daily ?? 0) + 1;
    const cutDay = bars.length ? bars[bars.length - 1].day : '';
    const rot = crypto || !cutDay ? null : rotationFor(r.symbol, cutDay);
    const ra = rotationAlignment(rot ? { groupLabel: rot.label, etf: rot.etf, side: rot.side, relPct: rot.relPct, breadthPct: rot.breadthPct, stage: rot.stage } : null, dir);
    const rs5Self = crypto ? null : relStrength5(bars, spy.slice(0, completedThrough(spy, r.pubMs)), dir);
    const { day: pDay, minute } = nyDayMinute(r.pubMs);
    const isSession = !!st?.bars.some((b) => b.day === pDay);
    const tod = crypto ? 'crypto' : !isSession ? 'non-session' : minute < 570 ? 'pre-open' : minute < 630 ? 'first-hour' : minute < 900 ? 'midday' : minute < 960 ? 'last-hour' : 'after-close';
    let gapAtr: number | null = null;
    if (!crypto && dfeat && isSession && minute >= 570) {
      const o = sessionOpen(st, pDay, r.pubMs);
      const prevBars = bars.filter((b) => b.day < pDay);
      const pc = prevBars.length ? prevBars[prevBars.length - 1].c : null;
      if (o && pc) gapAtr = ((dir === 'long' ? 1 : -1) * (o - pc)) / dfeat.atr;
    }
    const risk = Math.abs(r.entry - r.stop);
    const layers: Array<{ kind: string; points: number; why: string }> = x?.gen_scoring_layers ?? [];
    const lsum = (k: string) => layers.filter((l) => l.kind === k).reduce((s, l) => s + Number(l.points || 0), 0);
    const flowLayer = layers.some((l) => /net premium|Aggressor tape/i.test(String(l.why)) && Number(l.points) > 0) ? 1 : 0;
    const dte = x?.asset_type === 'option' && x.expiry_date ? Math.round((Date.parse(String(x.expiry_date).slice(0, 10) + 'T20:00:00Z') - r.pubMs) / 86_400_000) : null;
    const v = r.v.cons!;
    const f: Record<string, number | null> = {
      old: r.conv,
      layerCount: layers.length ? layers.filter((l) => Number(l.points) !== 0).length : null,
      ...Object.fromEntries(LAYER_KINDS.map((k) => [`L_${k}`, layers.length ? lsum(k) : null])),
      flowLayer: layers.length ? flowLayer : null,
      rotAligned: crypto ? null : ra.aligned,
      rotRs5: crypto ? null : ra.rs5,
      rs5Self,
      brk20: dfeat?.brk20 ?? null, brk55: dfeat?.brk55 ?? null,
      insideDays5: dfeat?.insideDays5 ?? null, nr7: dfeat ? (dfeat.nr7 ? 1 : 0) : null,
      ema20Dist: dfeat?.ema20Dist ?? null, ema50Side: dfeat?.ema50Side ?? null,
      adx: dfeat?.adx ?? null, diAligned: dfeat?.diAligned ?? null, rvol: dfeat?.rvol ?? null,
      gapAtr,
      stopAtr: dfeat && risk > 0 ? risk / dfeat.atr : null,
      rr: risk > 0 ? Math.abs(r.target - r.entry) / risk : null,
      entryDist: dfeat && price ? ((dir === 'long' ? 1 : -1) * (x.entry_price - price)) / dfeat.atr : null,
      dte,
      // binary indicators for the categorical slices (≥ 25 rows each in the sample)
      isCall: r.kind === 'call' ? 1 : 0, isPut: r.kind === 'put' ? 1 : 0, isStock: r.kind === 'stock' ? 1 : 0,
      isShort: dir === 'short' ? 1 : 0,
      srcMarketScanner: r.source === 'market_scanner' ? 1 : 0, srcGex: r.source === 'gex_scanner' ? 1 : 0,
      srcQuant: r.source === 'quant' ? 1 : 0, srcFlow: r.source === 'flow' ? 1 : 0,
      hpDay: r.hp === 'day' ? 1 : 0,
      afterClose: tod === 'after-close' || tod === 'non-session' ? 1 : 0,
      preOpen: tod === 'pre-open' ? 1 : 0, firstHour: tod === 'first-hour' ? 1 : 0,
    };
    const R = r.rU.time_half ?? 0;
    fr.push({
      id: r.id, symbol: r.symbol, day: r.pubDay, half: r.pubDay < median ? 'H1' : 'H2', dir, source: r.source, kind: r.kind, hp: r.hp,
      R, Rw: wins(R), usd: v.pnlEq.time_half ?? 0, rPlan: r.rU.plan ?? 0, open: r.open, old: r.conv, f,
      cat: { source: r.source, kind: r.kind === 'stock' || r.kind === 'crypto' ? `${r.kind} ${dir}` : r.kind, hp: r.hp, tod, rotation: rot ? `${rot.side ?? 'flat'}${rot.side ? (rot.side === dir ? ' (aligned)' : ' (opposed)') : ''}` : 'unmapped', stage: rot ? rot.stage : 'unmapped', dteBucket: dte == null ? 'n/a (stock)' : dte <= 1 ? '0–1d' : dte <= 7 ? '2–7d' : dte <= 21 ? '8–21d' : '22d+' },
    });
  }
  console.log(`features ${fr.length}; missing`, miss, `median split ${median}`);

  const FEATS = Object.keys(fr[0].f);
  const H1 = fr.filter((r) => r.half === 'H1'), H2 = fr.filter((r) => r.half === 'H2');

  // ── univariate ──────────────────────────────────────────────────────────
  const summ = (rs: FRow[]) => ({ n: rs.length, meanR: rd(mean(rs.map((r) => r.Rw)), 3), win: rs.length ? rd((100 * rs.filter((r) => r.R > 0).length) / rs.length, 1) : null, usd: rd(rs.reduce((s, r) => s + r.usd, 0), 0), usdPer: rs.length ? rd(rs.reduce((s, r) => s + r.usd, 0) / rs.length, 1) : null });
  const rhoOf = (rs: FRow[], k: string) => { const z = rs.filter((r) => r.f[k] != null); return { n: z.length, rho: rd(spearman(z.map((r) => r.f[k]!), z.map((r) => r.R)), 3) }; };
  const uni: any = {};
  for (const k of FEATS) {
    const vals = fr.map((r) => r.f[k]).filter((v): v is number => v != null).sort((a, b) => a - b);
    const distinct = new Set(vals).size;
    let bucket: (v: number | null) => string;
    if (distinct <= 4) bucket = (v) => (v == null ? 'n/a' : `= ${rd(v, 2)}`);
    else {
      const c1 = vals[Math.floor(vals.length / 3)], c2 = vals[Math.floor((2 * vals.length) / 3)];
      bucket = (v) => (v == null ? 'n/a' : v < c1 ? `low (< ${rd(c1, 2)})` : v < c2 ? `mid` : `high (≥ ${rd(c2, 2)})`);
    }
    const tbl: any = {};
    for (const r of fr) { const b = bucket(r.f[k]); (tbl[b] ??= { all: [], H1: [], H2: [] }); tbl[b].all.push(r); tbl[b][r.half].push(r); }
    uni[k] = {
      rho: { all: rhoOf(fr, k), H1: rhoOf(H1, k), H2: rhoOf(H2, k) },
      buckets: Object.fromEntries(Object.entries<any>(tbl).sort().map(([b, g]) => [b, { all: summ(g.all), H1: summ(g.H1), H2: summ(g.H2) }])),
    };
  }
  const uniCat: any = {};
  for (const c of Object.keys(fr[0].cat)) {
    const tbl: any = {};
    for (const r of fr) { const b = r.cat[c]; (tbl[b] ??= { all: [], H1: [], H2: [] }); tbl[b].all.push(r); tbl[b][r.half].push(r); }
    uniCat[c] = Object.fromEntries(Object.entries<any>(tbl).sort((a, b) => b[1].all.length - a[1].all.length).map(([b, g]) => [b, { all: summ(g.all), H1: summ(g.H1), H2: summ(g.H2) }]));
  }

  // ── points-table model ──────────────────────────────────────────────────
  type Table = { id: string; sign: number; edges: number[]; points: number[]; med: number; binary: boolean; rhoTrain: number };
  const CANDIDATES = FEATS.filter((k) => k !== 'old');
  let K_SHRINK = 40;
  function pav(ys: number[], ws: number[], inc: boolean): number[] {
    // pool-adjacent violators for a monotone (inc/dec) fit
    const v = ys.map((y, i) => ({ y, w: ws[i], n: 1 }));
    const ok = (a: { y: number }, b: { y: number }) => (inc ? a.y <= b.y : a.y >= b.y);
    for (let i = 0; i < v.length - 1;) {
      if (ok(v[i], v[i + 1])) { i++; continue; }
      const w = v[i].w + v[i + 1].w; const y = w > 0 ? (v[i].y * v[i].w + v[i + 1].y * v[i + 1].w) / w : (v[i].y + v[i + 1].y) / 2;
      v.splice(i, 2, { y, w, n: v[i].n + v[i + 1].n }); if (i > 0) i--;
    }
    return v.flatMap((g) => Array(g.n).fill(g.y));
  }
  function fitTable(train: FRow[], id: string, sign: number, rhoTrain: number): Table | null {
    const z = train.filter((r) => r.f[id] != null);
    if (z.length < 30) return null;
    const vals = z.map((r) => r.f[id]!).sort((a, b) => a - b);
    const med = vals[Math.floor(vals.length / 2)];
    const binary = new Set(vals).size <= 2;
    const edges = binary ? [0.5] : [vals[Math.floor(vals.length / 3)], vals[Math.floor((2 * vals.length) / 3)]].filter((e, i, a) => i === 0 || e > a[0]);
    const nb = edges.length + 1;
    const bIdx = (v: number) => { let b = 0; while (b < edges.length && v >= edges[b]) b++; return b; };
    const mu = mean(train.map((r) => r.Rw));
    const sums = Array(nb).fill(0), ns = Array(nb).fill(0);
    for (const r of z) { const b = bIdx(r.f[id]!); sums[b] += r.Rw - mu; ns[b]++; }
    const eff = sums.map((s, b) => (ns[b] ? (s / ns[b]) * (ns[b] / (ns[b] + K_SHRINK)) : 0));
    const mono = pav(eff, ns, sign > 0);
    return { id, sign, edges, points: mono, med, binary, rhoTrain };
  }
  const scoreWith = (tables: Table[], scale: number, r: FRow) => scale * tables.reduce((s, t) => { const v = r.f[t.id] ?? t.med; let b = 0; while (b < t.edges.length && v >= t.edges[b]) b++; return s + t.points[b]; }, 0);
  function selectFeatures(train: FRow[], splitA: FRow[], splitB: FRow[], maxF = 8, minRho = 0.05) {
    const cand = CANDIDATES.map((k) => {
      const ra = rhoOf(splitA, k).rho ?? 0, rb = rhoOf(splitB, k).rho ?? 0, rt = rhoOf(train, k);
      return { k, ra, rb, rt: rt.rho ?? 0, n: rt.n };
    }).filter((c) => c.n >= 60 && Math.sign(c.ra) === Math.sign(c.rb) && Math.sign(c.ra) !== 0 && Math.abs(c.rt) >= minRho && Math.sign(c.rt) === Math.sign(c.ra))
      .sort((a, b) => Math.abs(b.rt) - Math.abs(a.rt));
    const chosen: typeof cand = [];
    for (const c of cand) {
      if (chosen.length >= maxF) break;
      const corrOk = chosen.every((s) => { const z = train.filter((r) => r.f[s.k] != null && r.f[c.k] != null); return Math.abs(spearman(z.map((r) => r.f[s.k]!), z.map((r) => r.f[c.k]!))) <= 0.6; });
      if (corrOk) chosen.push(c);
    }
    return chosen;
  }
  function fitModel(train: FRow[], chosen: Array<{ k: string; rt: number }>) {
    const tables = chosen.map((c) => fitTable(train, c.k, Math.sign(c.rt), c.rt)).filter((t): t is Table => !!t);
    // global shrink for double counting: OLS slope of Rw on the raw sum, clipped to [0, 1]
    const s = train.map((r) => scoreWith(tables, 1, r)), y = train.map((r) => r.Rw);
    const ms = mean(s), my = mean(y);
    let num = 0, den = 0; for (let i = 0; i < s.length; i++) { num += (s[i] - ms) * (y[i] - my); den += (s[i] - ms) ** 2; }
    const scale = den > 0 ? Math.max(0, Math.min(1, num / den)) : 0;
    return { tables, scale, intercept: my - scale * ms };
  }
  function evaluate(test: FRow[], score: (r: FRow) => number | null, train?: FRow[], cal?: { a: number; b: number }) {
    const z = test.map((r) => ({ r, s: score(r) })).filter((q): q is { r: FRow; s: number } => q.s != null);
    const rho = spearman(z.map((q) => q.s), z.map((q) => q.r.R));
    const sorted = [...z].sort((a, b) => a.s - b.s || hash(a.r.id) - hash(b.r.id));
    const t = Math.floor(sorted.length / 3);
    const lo = sorted.slice(0, t), mid = sorted.slice(t, sorted.length - t), hi = sorted.slice(sorted.length - t);
    const g = (xs: typeof z) => ({ n: xs.length, meanR: rd(mean(xs.map((q) => q.r.Rw))), win: rd((100 * xs.filter((q) => q.r.R > 0).length) / Math.max(1, xs.length), 1), usd: rd(xs.reduce((s, q) => s + q.r.usd, 0), 0), predR: cal ? rd(mean(xs.map((q) => cal.a + cal.b * q.s))) : undefined });
    // bootstrap CI of rho
    const boots: number[] = [];
    for (let b = 0; b < 500; b++) { const xs: number[] = [], ys: number[] = []; for (let i = 0; i < z.length; i++) { const q = z[Math.floor(rnd() * z.length)]; xs.push(q.s); ys.push(q.r.R); } boots.push(spearman(xs, ys)); }
    boots.sort((a, b) => a - b);
    const rhoUsd = spearman(z.map((q) => q.s), z.map((q) => q.r.usd));
    return { n: z.length, rho: rd(rho), rhoUsd: rd(rhoUsd), rhoCI95: [rd(boots[12]), rd(boots[487])], spreadR: rd(mean(hi.map((q) => q.r.Rw)) - mean(lo.map((q) => q.r.Rw))), spreadUsd: rd(hi.reduce((s, q) => s + q.r.usd, 0) - lo.reduce((s, q) => s + q.r.usd, 0), 0), terciles: { low: g(lo), mid: g(mid), high: g(hi) } };
  }
  function pairedDelta(test: FRow[], a: (r: FRow) => number | null, b: (r: FRow) => number | null) {
    const z = test.filter((r) => a(r) != null && b(r) != null);
    const ds: number[] = [];
    for (let k = 0; k < 500; k++) { const xs: FRow[] = []; for (let i = 0; i < z.length; i++) xs.push(z[Math.floor(rnd() * z.length)]); ds.push(spearman(xs.map((r) => a(r)!), xs.map((r) => r.R)) - spearman(xs.map((r) => b(r)!), xs.map((r) => r.R))); }
    ds.sort((x, y) => x - y);
    return { n: z.length, delta: rd(spearman(z.map((r) => a(r)!), z.map((r) => r.R)) - spearman(z.map((r) => b(r)!), z.map((r) => r.R))), ci95: [rd(ds[12]), rd(ds[487])], pNewBetter: rd(ds.filter((d) => d > 0).length / ds.length) };
  }
  const quarters = (rs: FRow[]) => { const d = rs.map((r) => r.day).sort(); const m = d[Math.floor(d.length / 2)]; return [rs.filter((r) => r.day < m), rs.filter((r) => r.day >= m)] as const; };

  const oos: any = {};
  for (const [name, train, test] of [['H1→H2', H1, H2], ['H2→H1', H2, H1]] as const) {
    const [qa, qb] = quarters(train);
    const chosen = selectFeatures(train, qa, qb);
    const m = fitModel(train, chosen);
    const sNew = (r: FRow) => scoreWith(m.tables, m.scale, r);
    const sOld = (r: FRow) => r.old;
    const common = test.filter((r) => r.old != null);
    // old-score calibration fit on the train half too
    const tr = train.filter((r) => r.old != null);
    const so = tr.map((r) => r.old!), yo = tr.map((r) => r.Rw); const mso = mean(so), myo = mean(yo);
    let nu = 0, de = 0; for (let i = 0; i < so.length; i++) { nu += (so[i] - mso) * (yo[i] - myo); de += (so[i] - mso) ** 2; }
    const bOld = de > 0 ? nu / de : 0;
    oos[name] = {
      chosen: chosen.map((c) => ({ feature: c.k, rhoTrain: rd(c.rt), rhoQ1: rd(c.ra), rhoQ2: rd(c.rb) })),
      tables: m.tables.map((t) => ({ ...t, points: t.points.map((p) => rd(p * m.scale)) })), scale: rd(m.scale), intercept: rd(m.intercept),
      oldOnCommon: evaluate(common, sOld, train, { a: myo - bOld * mso, b: bOld }),
      newOnCommon: evaluate(common, sNew, train, { a: m.intercept, b: 1 }),
      newOnAll: evaluate(test, sNew, train, { a: m.intercept, b: 1 }),
      newMinusOld: pairedDelta(common, sNew, sOld),
    };
    console.log(`\n${name}: chosen ${chosen.map((c) => `${c.k}(${rd(c.rt, 2)})`).join(', ') || '— none —'} scale ${rd(m.scale)}`);
    console.log(`  $-label: old ρ$ ${oos[name].oldOnCommon.rhoUsd} new ρ$ ${oos[name].newOnCommon.rhoUsd}`);
    console.log(`  old ρ ${oos[name].oldOnCommon.rho} spread ${oos[name].oldOnCommon.spreadR}R / $${oos[name].oldOnCommon.spreadUsd} | new ρ ${oos[name].newOnCommon.rho} spread ${oos[name].newOnCommon.spreadR}R / $${oos[name].newOnCommon.spreadUsd} | Δρ ${oos[name].newMinusOld.delta} ${JSON.stringify(oos[name].newMinusOld.ci95)}`);
  }

  // ── sensitivity: the pre-registered spec is ≤ 8 features, shrink K = 40 ──
  const sensitivity: any[] = [];
  for (const maxF of [3, 5, 8]) for (const K of [20, 40, 80]) {
    K_SHRINK = K;
    const res: any = { maxF, K };
    for (const [name, train, test] of [['H1→H2', H1, H2], ['H2→H1', H2, H1]] as const) {
      const [qa, qb] = quarters(train);
      const m = fitModel(train, selectFeatures(train, qa, qb, maxF));
      const e = evaluate(test.filter((r) => r.old != null), (r) => scoreWith(m.tables, m.scale, r));
      res[name] = { rho: e.rho, rhoUsd: e.rhoUsd, spreadR: e.spreadR, spreadUsd: e.spreadUsd };
    }
    sensitivity.push(res);
    console.log(`  sens maxF ${maxF} K ${K}: H1→H2 ρ ${res['H1→H2'].rho} spread ${res['H1→H2'].spreadR} | H2→H1 ρ ${res['H2→H1'].rho} spread ${res['H2→H1'].spreadR}`);
  }
  K_SHRINK = 40;

  // ── engine record as the ranking (BOARD_SORT=engine_record) ─────────────
  // Per-engine mean R shrunk toward the train mean (K = 40); engines unseen in train get the mean.
  const engineTable = (train: FRow[]) => {
    const mu = mean(train.map((r) => r.Rw));
    const g = new Map<string, number[]>();
    for (const r of train) (g.get(r.source) ?? g.set(r.source, []).get(r.source)!).push(r.Rw);
    const t: Record<string, { n: number; meanR: number; shrunkR: number }> = {};
    for (const [k, xs] of g) t[k] = { n: xs.length, meanR: rd(mean(xs))!, shrunkR: rd(mu + (mean(xs) - mu) * (xs.length / (xs.length + 40)), 4)! };
    return { mu, t };
  };
  const engineOOS: any = {};
  for (const [name, train, test] of [['H1→H2', H1, H2], ['H2→H1', H2, H1]] as const) {
    const et = engineTable(train);
    const common = test.filter((r) => r.old != null);
    engineOOS[name] = { onCommon: evaluate(common, (r) => et.t[r.source]?.shrunkR ?? et.mu), table: et.t };
    console.log(`  engine-record ${name}: ρ ${engineOOS[name].onCommon.rho} spread ${engineOOS[name].onCommon.spreadR}R / $${engineOOS[name].onCommon.spreadUsd}`);
  }
  const engineAll = engineTable(fr);

  // ── production candidate: same sign in BOTH halves, fit on all ─────────
  const prodChosen = selectFeatures(fr, H1, H2);
  const prod = fitModel(fr, prodChosen);
  const fixedSet: any = {};
  for (const [name, train, test] of [['H1→H2', H1, H2], ['H2→H1', H2, H1]] as const) {
    const m = fitModel(train, prodChosen);
    const common = test.filter((r) => r.old != null);
    fixedSet[name] = { scale: rd(m.scale), newOnCommon: evaluate(common, (r) => scoreWith(m.tables, m.scale, r)), oldOnCommon: evaluate(common, (r) => r.old) };
  }
  console.log(`\nproduction set: ${prodChosen.map((c) => `${c.k}(H1 ${rd(c.ra, 2)} H2 ${rd(c.rb, 2)})`).join(', ') || '— none —'} scale ${rd(prod.scale)}`);
  for (const [n, v] of Object.entries<any>(fixedSet)) console.log(`  fixed-set ${n}: old ρ ${v.oldOnCommon.rho} spread ${v.oldOnCommon.spreadR} | new ρ ${v.newOnCommon.rho} spread ${v.newOnCommon.spreadR}`);

  // Old score in-sample by half (the inversion, re-measured on bar-verified labels).
  const oldByHalf = { H1: evaluate(H1.filter((r) => r.old != null), (r) => r.old), H2: evaluate(H2.filter((r) => r.old != null), (r) => r.old), all: evaluate(fr.filter((r) => r.old != null), (r) => r.old) };
  console.log(`old score in-sample ρ: H1 ${oldByHalf.H1.rho} H2 ${oldByHalf.H2.rho} all ${oldByHalf.all.rho}`);

  const beats = (['H1→H2', 'H2→H1'] as const).every((k) => oos[k].newOnCommon.rho > oos[k].oldOnCommon.rho && oos[k].newOnCommon.spreadR > oos[k].oldOnCommon.spreadR && oos[k].newOnCommon.rho > 0 && oos[k].newOnCommon.spreadR > 0);
  const verdict = beats ? 'v2 beats the old score out of sample in both directions' : 'v2 does NOT beat the old score (or no ranking) out of sample in both directions';
  console.log(`\nVERDICT: ${verdict}`);

  const out = {
    generatedAt: new Date().toISOString(), now: new Date(NOW).toISOString(), medianSplit: median, label: `underlying R, rule 7 (time_half), winsorised [${R_LO}, ${R_HI}] for means; $ = equal size (time_half, bar-high option fill)`,
    exclusions: excl, n: fr.length, nH1: H1.length, nH2: H2.length, missing: miss,
    labelSummary: { all: summ(fr), H1: summ(H1), H2: summ(H2) },
    oldByHalf, sensitivity, engineRecord: { oos: engineOOS, table: engineAll.t, meanR: rd(engineAll.mu, 4) }, univariate: uni, univariateCategorical: uniCat, oos, production: { chosen: prodChosen.map((c) => ({ feature: c.k, rhoAll: rd(c.rt), rhoH1: rd(c.ra), rhoH2: rd(c.rb) })), scale: rd(prod.scale), intercept: rd(prod.intercept), tables: prod.tables.map((t) => ({ ...t, points: t.points.map((p) => rd(p * prod.scale)) })), fixedSetOOS: fixedSet, scoreDistribution: (() => { const s = fr.map((r) => scoreWith(prod.tables, prod.scale, r)).sort((a, b) => a - b); return { p10: rd(s[Math.floor(s.length * 0.1)]), p33: rd(s[Math.floor(s.length / 3)]), p50: rd(s[Math.floor(s.length / 2)]), p67: rd(s[Math.floor((2 * s.length) / 3)]), p90: rd(s[Math.floor(s.length * 0.9)]), min: rd(s[0]), max: rd(s[s.length - 1]) }; })() },
    beats, verdict,
    rows: fr.map((r) => ({ id: r.id, symbol: r.symbol, day: r.day, half: r.half, dir: r.dir, source: r.source, kind: r.kind, R: rd(r.R), usd: rd(r.usd, 1), old: r.old, f: Object.fromEntries(Object.entries(r.f).map(([k, v]) => [k, v == null ? null : rd(v)])), cat: r.cat })),
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(`wrote ${OUT} (requests ${requests})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
