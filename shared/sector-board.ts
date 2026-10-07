/**
 * SECTOR BOARD — pure core (no I/O). The server half is server/sector-board.ts.
 * ============================================================================
 * Ranks every sector-peers group (shared/sector-peers.ts — one source of truth,
 * closeness groups + thematic overlays) on equal-weight member daily bars:
 *
 *   returns     equal-weight mean of member returns over 1/3/10/20 sessions
 *   breadth     % of members closing above their own 20-session SMA
 *   highs/lows  % of members whose close is the highest/lowest of 20 sessions
 *   RS          sector 20-session return − SPY 20-session return (pp)
 *   RS momentum RS now − RS five sessions ago (pp)
 *   regime      quadrant on (RS, RS momentum): Leading (+,+) / Weakening (+,−)
 *               / Lagging (−,−) / Improving (−,+) — RRG-style, read on returns
 *   composite   0.6 × mean percentile (across sectors) of 3D/10D/20D/RS
 *               + 0.4 × breadth — the breadth-weighted score the rank uses
 *   stretch     equal-weight index vs its own 20-session mean (%)
 *   drawdown    equal-weight index vs its 55-session peak (%)
 *
 * Rank flow = the composite rank on each of the last 10 sessions. Consensus
 * counts OUR independent reads that agree; leaders are members ranked by a
 * confluence of explicit, named components (chart, flow, levels, gamma, RS,
 * overnight gap, NEXUS). Every weight and threshold in BOARD_CFG is
 * unvalidated → status 'measuring'. The forward log (server side) records each
 * close's top-3 leaders in the top-5 sectors and their next 1/3/5-session
 * returns vs the sector so the weights can be judged in weeks, not believed.
 */
import { PEER_GROUPS, type PeerGroup } from './sector-peers';

export type Side = 'long' | 'short';
export type Regime = 'leading' | 'improving' | 'weakening' | 'lagging';
export type Lean = 'bull' | 'bear' | 'neutral' | 'na';
export type ChipState = 'pass' | 'fail' | 'na';

export const BOARD_CFG = {
  /** Sessions shown in the rank flow. */
  sessions: 10,
  /** Fewest aligned sessions a member needs to be read (20D return + 5-session RS momentum + slack). */
  minBars: 26,
  maPeriod: 20,
  emaFast: 20,
  emaSlow: 50,
  highLookback: 55,
  rsMomentumLag: 5,
  composite: { momentumWeight: 0.6, breadthWeight: 0.4 },
  /** Fewer members read than this → the sector is listed but not ranked. */
  minMembersRead: 2,
  climbers: 5,
  consensus: { breadthBull: 60, breadthBear: 40, rsBand: 1, flowMin: 250_000, flowMembers: 2 },
  overnight: { moverPct: 2, driftBand: 0.3 },
  confluence: {
    weights: { trend: 2, high: 1, setup: 1, flow: 2, levels: 1, gamma: 1, rs: 2, gap: 1, nexus: 1 } as Record<string, number>,
    nearHighPct: 3,
    compressionRatio: 0.35,
    flowMin: 100_000,
    supportWithinPct: 3,
    minClusterScore: 2,
    roomAtr: 1,
    wallRoomPct: 1,
    gapPct: 0.5,
  },
  leadersShown: 3,
  laggardsShown: 3,
  log: { topSectors: 5, leadersPerSector: 3, horizons: [1, 3, 5] as const },
} as const;

// ─── groups ──────────────────────────────────────────────────────────────

export interface BoardGroup { id: string; label: string; etf: string | null; members: string[]; thematic: boolean }

/** Every sector-peers group except the index benchmark set; the group ETF is never its own member. */
export function boardGroups(groups: readonly PeerGroup[] = PEER_GROUPS): BoardGroup[] {
  return groups.filter((g) => g.id !== 'us_indices').map((g) => ({
    id: g.id, label: g.label, etf: g.etf, thematic: !!g.thematic,
    members: Array.from(new Set(g.members.filter((m) => m !== g.etf))),
  }));
}

// ─── numeric helpers ─────────────────────────────────────────────────────

export const r1 = (x: number) => Math.round(x * 10) / 10;
export const r2 = (x: number) => Math.round(x * 100) / 100;
const fin = (x: number | null | undefined): x is number => typeof x === 'number' && Number.isFinite(x);
export function mean(xs: Array<number | null | undefined>): number | null {
  const v = xs.filter(fin);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
export function median(xs: Array<number | null | undefined>): number | null {
  const v = xs.filter(fin).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
/** Trailing finite values of xs ending at index `end` (inclusive). */
function tail(xs: number[], end: number, n: number): number[] | null {
  if (end - n + 1 < 0) return null;
  const out = xs.slice(end - n + 1, end + 1);
  return out.length === n && out.every(fin) ? out : null;
}
export function retPct(closes: number[], end: number, k: number): number | null {
  if (end - k < 0) return null;
  const a = closes[end - k]; const b = closes[end];
  return fin(a) && fin(b) && a > 0 ? ((b / a) - 1) * 100 : null;
}
/** EMA of the finite prefix ending at `end`, seeded with the SMA of the first n; null with fewer than n values. */
export function emaAt(closes: number[], end: number, n: number): number | null {
  const v = closes.slice(0, end + 1).filter(fin);
  if (v.length < n) return null;
  let e = v.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const k = 2 / (n + 1);
  for (let i = n; i < v.length; i++) e = v[i] * k + e * (1 - k);
  return e;
}
/** Percentile (0–100) of each value among the finite values; ties share the average rank; null stays null. */
export function pctRanks(vals: Array<number | null>): Array<number | null> {
  const idx = vals.map((v, i) => [v, i] as const).filter((x): x is readonly [number, number] => fin(x[0])).sort((a, b) => a[0] - b[0]);
  const out: Array<number | null> = vals.map(() => null);
  if (idx.length === 1) { out[idx[0][1]] = 50; return out; }
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const p = ((i + j) / 2) / (idx.length - 1) * 100;
    for (let k = i; k <= j; k++) out[idx[k][1]] = p;
    i = j + 1;
  }
  return out;
}

// ─── per-sector stats at one session index ───────────────────────────────

export interface SectorStats {
  r1: number | null; r3: number | null; r10: number | null; r20: number | null;
  breadth: number | null; highsPct: number | null; lowsPct: number | null;
  rs: number | null; membersRead: number;
}

/** Equal-weight sector stats at session index `end` of the aligned calendar. */
export function sectorStatsAt(members: number[][], spy: number[], end: number, cfg = BOARD_CFG): SectorStats {
  const read = members.filter((c) => fin(c[end]) && fin(c[end - 1]));
  const per = read.map((c) => {
    const ma = tail(c, end, cfg.maPeriod);
    const win = tail(c, end, cfg.maPeriod);
    return {
      r1: retPct(c, end, 1), r3: retPct(c, end, 3), r10: retPct(c, end, 10), r20: retPct(c, end, 20),
      above: ma ? c[end] > ma.reduce((a, b) => a + b, 0) / ma.length : null,
      high: win ? c[end] >= Math.max(...win) : null,
      low: win ? c[end] <= Math.min(...win) : null,
    };
  });
  const share = (xs: Array<boolean | null>) => { const v = xs.filter((x): x is boolean => x != null); return v.length ? (v.filter(Boolean).length / v.length) * 100 : null; };
  const r20 = mean(per.map((p) => p.r20));
  const spy20 = retPct(spy, end, 20);
  return {
    r1: mean(per.map((p) => p.r1)), r3: mean(per.map((p) => p.r3)), r10: mean(per.map((p) => p.r10)), r20,
    breadth: share(per.map((p) => p.above)), highsPct: share(per.map((p) => p.high)), lowsPct: share(per.map((p) => p.low)),
    rs: r20 != null && spy20 != null ? r20 - spy20 : null,
    membersRead: read.length,
  };
}

/** Equal-weight index (chain-linked mean daily member return), 100 at `start`. */
export function ewIndex(members: number[][], start: number, end: number): number[] {
  const out: number[] = [100];
  for (let i = start + 1; i <= end; i++) {
    const r = mean(members.map((c) => (fin(c[i]) && fin(c[i - 1]) && c[i - 1] > 0 ? c[i] / c[i - 1] - 1 : null)));
    out.push(out[out.length - 1] * (1 + (r ?? 0)));
  }
  return out;
}

export function regimeOf(rs: number | null, mom: number | null): Regime | null {
  if (rs == null || mom == null) return null;
  if (rs >= 0) return mom >= 0 ? 'leading' : 'weakening';
  return mom >= 0 ? 'improving' : 'lagging';
}
export const REGIME_LABEL: Record<Regime, string> = { leading: 'Leading', improving: 'Improving', weakening: 'Weakening', lagging: 'Lagging' };
export const sideOfRegime = (r: Regime | null): Side | null => (r == null ? null : r === 'leading' || r === 'improving' ? 'long' : 'short');

/** Breadth-weighted composite for a set of sectors read on the same session. */
export function compositeScores(rows: SectorStats[], cfg = BOARD_CFG): Array<number | null> {
  const ok = rows.map((r) => r.membersRead >= cfg.minMembersRead);
  const pick = (f: (r: SectorStats) => number | null) => pctRanks(rows.map((r, i) => (ok[i] ? f(r) : null)));
  const p3 = pick((r) => r.r3); const p10 = pick((r) => r.r10); const p20 = pick((r) => r.r20); const prs = pick((r) => r.rs);
  return rows.map((r, i) => {
    if (!ok[i]) return null;
    const mom = mean([p3[i], p10[i], p20[i], prs[i]]);
    if (mom == null) return null;
    const b = r.breadth ?? 50;
    return r1(cfg.composite.momentumWeight * mom + cfg.composite.breadthWeight * b);
  });
}
/** 1 = best; ties broken by input order; null scores are unranked. */
export function ranksOf(scores: Array<number | null>): Array<number | null> {
  const order = scores.map((s, i) => [s, i] as const).filter((x): x is readonly [number, number] => x[0] != null).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const out: Array<number | null> = scores.map(() => null);
  order.forEach(([, i], k) => { out[i] = k + 1; });
  return out;
}

// ─── rank flow over the last N sessions ──────────────────────────────────

export interface RankPoint { date: string; rank: number | null; score: number | null }
export interface SectorCore {
  id: string; label: string; etf: string | null; thematic: boolean; members: string[];
  stats: SectorStats; rsMomentum: number | null; regime: Regime | null; side: Side | null;
  composite: number | null; rank: number | null; rankThen: number | null; rankDelta: number | null;
  stretch: number | null; drawdown: number | null; trendUp: boolean | null; trendDown: boolean | null;
  history: RankPoint[];
}

export interface CoreInput {
  /** Aligned session calendar oldest → newest (the last entry may be a provisional live bar). */
  dates: string[];
  spy: number[];
  /** Closes per symbol on `dates` (NaN where missing). */
  closes: Map<string, number[]>;
  groups: BoardGroup[];
}

export function computeCore(inp: CoreInput, cfg = BOARD_CFG): { sectors: SectorCore[]; sessions: string[]; climbers: string[]; sliders: string[] } {
  const end = inp.dates.length - 1;
  const first = Math.max(cfg.rsMomentumLag + 20, end - cfg.sessions + 1);
  const sessions = inp.dates.slice(first, end + 1);
  const memSeries = inp.groups.map((g) => g.members.map((m) => inp.closes.get(m)).filter((c): c is number[] => !!c));
  const byIdx = new Map<number, { stats: SectorStats[]; scores: Array<number | null>; ranks: Array<number | null> }>();
  for (let i = first; i <= end; i++) {
    const stats = memSeries.map((ms) => sectorStatsAt(ms, inp.spy, i, cfg));
    const scores = compositeScores(stats, cfg);
    byIdx.set(i, { stats, scores, ranks: ranksOf(scores) });
  }
  const last = byIdx.get(end);
  const sectors: SectorCore[] = inp.groups.map((g, gi) => {
    const st = last ? last.stats[gi] : sectorStatsAt(memSeries[gi], inp.spy, end, cfg);
    const back = sectorStatsAt(memSeries[gi], inp.spy, end - cfg.rsMomentumLag, cfg);
    const rsMomentum = st.rs != null && back.rs != null ? r2(st.rs - back.rs) : null;
    const regime = st.membersRead >= cfg.minMembersRead ? regimeOf(st.rs, rsMomentum) : null;
    const history: RankPoint[] = [];
    for (let i = first; i <= end; i++) { const b = byIdx.get(i)!; history.push({ date: inp.dates[i], rank: b.ranks[gi], score: b.scores[gi] }); }
    const idx = memSeries[gi].length ? ewIndex(memSeries[gi], Math.max(0, end - cfg.highLookback), end) : [];
    const ma = idx.length >= cfg.maPeriod ? mean(idx.slice(-cfg.maPeriod)) : null;
    const lastIdx = idx.length ? idx[idx.length - 1] : null;
    const stretch = lastIdx != null && ma ? r2((lastIdx / ma - 1) * 100) : null;
    const drawdown = lastIdx != null && idx.length ? r2((lastIdx / Math.max(...idx) - 1) * 100) : null;
    const rankNow = last?.ranks[gi] ?? null;
    const rankThen = history.find((h) => h.rank != null)?.rank ?? null;
    return {
      id: g.id, label: g.label, etf: g.etf, thematic: g.thematic, members: g.members,
      stats: roundStats(st), rsMomentum, regime, side: sideOfRegime(regime),
      composite: last?.scores[gi] ?? null, rank: rankNow, rankThen,
      rankDelta: rankNow != null && rankThen != null ? rankThen - rankNow : null,
      stretch, drawdown,
      trendUp: ma != null && lastIdx != null && st.r10 != null ? lastIdx > ma && st.r10 > 0 : null,
      trendDown: ma != null && lastIdx != null && st.r10 != null ? lastIdx < ma && st.r10 < 0 : null,
      history,
    };
  });
  const moved = sectors.filter((s) => s.rankDelta != null);
  const climbers = [...moved].filter((s) => s.rankDelta! > 0).sort((a, b) => b.rankDelta! - a.rankDelta! || a.rank! - b.rank!).slice(0, cfg.climbers).map((s) => s.id);
  const sliders = [...moved].filter((s) => s.rankDelta! < 0).sort((a, b) => a.rankDelta! - b.rankDelta! || b.rank! - a.rank!).slice(0, cfg.climbers).map((s) => s.id);
  return { sectors, sessions, climbers, sliders };
}
function roundStats(s: SectorStats): SectorStats {
  const f = (x: number | null) => (x == null ? null : r2(x));
  return { r1: f(s.r1), r3: f(s.r3), r10: f(s.r10), r20: f(s.r20), breadth: s.breadth == null ? null : Math.round(s.breadth), highsPct: s.highsPct == null ? null : Math.round(s.highsPct), lowsPct: s.lowsPct == null ? null : Math.round(s.lowsPct), rs: f(s.rs), membersRead: s.membersRead };
}

// ─── consensus ───────────────────────────────────────────────────────────

export interface ConsensusSignal { key: string; label: string; lean: Lean; detail: string }
export interface Consensus { bull: number; bear: number; n: number; lean: 'bull' | 'bear' | 'mixed'; signals: ConsensusSignal[] }
export interface IgnitionLeanInput { stage: string; side: Side | null; asOf: string | null }
export interface ConsensusInput {
  breadth: number | null;
  rs: number | null;
  trendUp: boolean | null;
  trendDown: boolean | null;
  /** Per ignition horizon; undefined = the horizon was not read; null = this group is not an ignition group. */
  ignition: Record<string, IgnitionLeanInput | null | undefined> | null;
  /** Calls − puts alert premium of members today; null = flow not read. */
  flow: { net: number; up: number; down: number } | null;
  /** Open NEXUS ideas on members; null = ideas not read. */
  nexus: { long: number; short: number } | null;
  /** ETF spot vs its cached zero-gamma; null = nothing cached. */
  gex: { spot: number; zeroGamma: number; source: string } | null;
}

const fmtUsd = (x: number) => `${x < 0 ? '−' : '+'}$${Math.abs(x) >= 1e6 ? `${(Math.abs(x) / 1e6).toFixed(1)}M` : `${Math.round(Math.abs(x) / 1e3)}k`}`;
const fmtPp = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}`;

export function consensusOf(i: ConsensusInput, cfg = BOARD_CFG.consensus): Consensus {
  const sig: ConsensusSignal[] = [];
  sig.push(i.breadth == null
    ? { key: 'breadth', label: 'Breadth', lean: 'na', detail: 'not read' }
    : { key: 'breadth', label: 'Breadth', lean: i.breadth >= cfg.breadthBull ? 'bull' : i.breadth <= cfg.breadthBear ? 'bear' : 'neutral', detail: `${Math.round(i.breadth)}% of members above their 20-day MA` });
  sig.push(i.rs == null
    ? { key: 'rs', label: 'RS vs SPY', lean: 'na', detail: 'not read' }
    : { key: 'rs', label: 'RS vs SPY', lean: i.rs >= cfg.rsBand ? 'bull' : i.rs <= -cfg.rsBand ? 'bear' : 'neutral', detail: `${fmtPp(i.rs)}pp vs SPY over 20 sessions` });
  sig.push(i.trendUp == null
    ? { key: 'trend', label: 'Trend', lean: 'na', detail: 'not read' }
    : { key: 'trend', label: 'Trend', lean: i.trendUp ? 'bull' : i.trendDown ? 'bear' : 'neutral', detail: i.trendUp ? 'equal-weight index above its 20-day mean, 10D up' : i.trendDown ? 'equal-weight index below its 20-day mean, 10D down' : 'mixed' });
  for (const h of ['intraday', 'daily', 'swing', 'weekly']) {
    const label = `Ignition ${h}`;
    if (i.ignition === null) { sig.push({ key: `ign_${h}`, label, lean: 'na', detail: 'thematic group — not an ignition group' }); continue; }
    const g = i.ignition?.[h];
    if (!g) { sig.push({ key: `ign_${h}`, label, lean: 'na', detail: 'no read published' }); continue; }
    const active = g.stage !== 'quiet' && g.side;
    sig.push({ key: `ign_${h}`, label, lean: active ? (g.side === 'long' ? 'bull' : 'bear') : 'neutral', detail: `${g.stage}${g.side ? ` ${g.side}` : ''}${g.asOf ? ` (read ${g.asOf.slice(11, 16)}Z ${g.asOf.slice(0, 10)})` : ''}` });
  }
  sig.push(i.flow == null
    ? { key: 'flow', label: 'Flow', lean: 'na', detail: 'flow tape not read' }
    : { key: 'flow', label: 'Flow', lean: i.flow.net >= cfg.flowMin && i.flow.up >= cfg.flowMembers ? 'bull' : i.flow.net <= -cfg.flowMin && i.flow.down >= cfg.flowMembers ? 'bear' : 'neutral', detail: `${fmtUsd(i.flow.net)} call−put alert premium today; ${i.flow.up} member(s) call-heavy, ${i.flow.down} put-heavy` });
  sig.push(i.nexus == null
    ? { key: 'nexus', label: 'NEXUS ideas', lean: 'na', detail: 'ideas not read' }
    : { key: 'nexus', label: 'NEXUS ideas', lean: i.nexus.long > i.nexus.short ? 'bull' : i.nexus.short > i.nexus.long ? 'bear' : 'neutral', detail: `${i.nexus.long} open long / ${i.nexus.short} open short in members` });
  sig.push(i.gex == null
    ? { key: 'gex', label: 'ETF gamma', lean: 'na', detail: 'no cached GEX for the ETF' }
    : { key: 'gex', label: 'ETF gamma', lean: i.gex.spot >= i.gex.zeroGamma ? 'bull' : 'bear', detail: `spot ${i.gex.spot.toFixed(2)} ${i.gex.spot >= i.gex.zeroGamma ? 'above' : 'below'} zero-γ ${i.gex.zeroGamma.toFixed(2)} (${i.gex.source})` });
  const n = sig.filter((s) => s.lean !== 'na').length;
  const bull = sig.filter((s) => s.lean === 'bull').length;
  const bear = sig.filter((s) => s.lean === 'bear').length;
  return { bull, bear, n, lean: bull > bear ? 'bull' : bear > bull ? 'bear' : 'mixed', signals: sig };
}

// ─── overnight ───────────────────────────────────────────────────────────

export type GapFlag = 'confirms' | 'fights' | 'flat';
/** Median member overnight move; the flag compares its sign with the sector's rotation side. */
export function overnightDrift(gaps: Array<number | null>, side: Side | null, cfg = BOARD_CFG.overnight): { driftPct: number | null; n: number; flag: GapFlag | null } {
  const v = gaps.filter(fin);
  const d = median(v);
  if (d == null) return { driftPct: null, n: 0, flag: null };
  const flag: GapFlag | null = Math.abs(d) < cfg.driftBand ? 'flat' : side == null ? null : (d > 0) === (side === 'long') ? 'confirms' : 'fights';
  return { driftPct: r2(d), n: v.length, flag };
}

// ─── leader confluence ───────────────────────────────────────────────────

export interface Chip { key: string; label: string; state: ChipState; detail: string; weight: number }
export interface MemberInput {
  symbol: string;
  closes: number[];
  /** Equal-weight sector 10-session return at the same index. */
  sectorR10: number | null;
  flow: { net: number; big: number } | null;
  gapPct: number | null;
  levels: { support: { price: number; score: number; label: string } | null; resistance: { price: number; score: number; label: string } | null; atr: number | null; asOf: string } | null;
  gamma: { zeroGamma: number | null; callWall: number | null; putWall: number | null; source: string; asOf: string } | null;
  nexus: { long: number; short: number };
  earnings: string | null;
}
export interface MemberRead {
  symbol: string; last: number | null; r1: number | null; r10: number | null; relSector: number | null;
  score: number | null; passed: number; available: number; chips: Chip[]; earnings: string | null;
}

export function confluenceOf(m: MemberInput, side: Side, cfg = BOARD_CFG.confluence): MemberRead {
  const c = m.closes;
  const end = c.length - 1;
  const last = fin(c[end]) ? c[end] : null;
  const w = cfg.weights;
  const L = side === 'long';
  const chips: Chip[] = [];
  const add = (key: string, label: string, state: ChipState, detail: string) => chips.push({ key, label, state, detail, weight: w[key] ?? 1 });

  // chart — trend
  const e20 = emaAt(c, end, BOARD_CFG.emaFast); const e50 = emaAt(c, end, BOARD_CFG.emaSlow);
  if (last == null || e20 == null) add('trend', 'Trend', 'na', 'not enough bars');
  else {
    const ok = L ? last > e20 && (e50 == null || e20 > e50) : last < e20 && (e50 == null || e20 < e50);
    add('trend', 'Trend', ok ? 'pass' : 'fail', `${last >= e20 ? 'above' : 'below'} 20 EMA ${e20.toFixed(2)}${e50 != null ? `; 20 EMA ${e20 >= e50 ? 'above' : 'below'} 50 EMA ${e50.toFixed(2)}` : '; 50 EMA n/a (<50 bars)'}`);
  }
  // chart — distance to the 55-session extreme (closes)
  const win55 = c.slice(Math.max(0, end - BOARD_CFG.highLookback + 1), end + 1).filter(fin);
  if (last == null || win55.length < 20) add('high', L ? 'Near high' : 'Near low', 'na', 'not enough bars');
  else {
    const ext = L ? Math.max(...win55) : Math.min(...win55);
    const dist = L ? (1 - last / ext) * 100 : (last / ext - 1) * 100;
    add('high', L ? 'Near high' : 'Near low', dist <= cfg.nearHighPct ? 'pass' : 'fail', `${dist.toFixed(1)}% from the ${win55.length}-session closing ${L ? 'high' : 'low'} ${ext.toFixed(2)}`);
  }
  // chart — breakout / compression
  const prior20 = c.slice(Math.max(0, end - 20), end).filter(fin);
  const win10 = c.slice(Math.max(0, end - 9), end + 1).filter(fin);
  if (last == null || prior20.length < 20 || win55.length < 20) add('setup', 'Setup', 'na', 'not enough bars');
  else {
    const brk = L ? last > Math.max(...prior20) : last < Math.min(...prior20);
    const range = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    const ratio = range(win55) > 0 ? range(win10) / range(win55) : 1;
    const tight = ratio <= cfg.compressionRatio;
    add('setup', 'Setup', brk || tight ? 'pass' : 'fail', brk ? `close ${L ? 'above' : 'below'} the prior 20-session ${L ? 'high' : 'low'} (breakout)` : tight ? `10-session range ${(ratio * 100).toFixed(0)}% of the ${win55.length}-session range (compression)` : `no breakout; 10/${win55.length}-session range ${(ratio * 100).toFixed(0)}%`);
  }
  // flow
  if (!m.flow) add('flow', 'Flow', 'na', 'flow tape not read');
  else {
    const ok = L ? m.flow.net >= cfg.flowMin : m.flow.net <= -cfg.flowMin;
    add('flow', 'Flow', ok ? 'pass' : 'fail', `${fmtUsd(m.flow.net)} call−put alert premium today${m.flow.big ? `; ${m.flow.big} print(s) ≥ $250k` : ''} (Bullflow side not reported)`);
  }
  // algorithmic levels (cached level map only)
  if (!m.levels || last == null) add('levels', 'Levels', 'na', 'no cached level map');
  else {
    const near = L ? m.levels.support : m.levels.resistance;
    const far = L ? m.levels.resistance : m.levels.support;
    const nearOk = !!near && near.score >= cfg.minClusterScore && Math.abs(last - near.price) / last * 100 <= cfg.supportWithinPct;
    const room = far ? Math.abs(far.price - last) : null;
    const roomOk = far == null ? true : m.levels.atr != null ? room! >= cfg.roomAtr * m.levels.atr : room! / last * 100 >= 2;
    add('levels', 'Levels', nearOk && roomOk ? 'pass' : 'fail', `${near ? `${L ? 'support' : 'resistance'} ${near.price.toFixed(2)} (${near.label}, ${near.score} famil${near.score === 1 ? 'y' : 'ies'})` : `no confluent ${L ? 'support' : 'resistance'}`}; ${far ? `next ${L ? 'resistance' : 'support'} ${far.price.toFixed(2)}` : `no ${L ? 'resistance' : 'support'} mapped`}`);
  }
  // gamma (cached only)
  if (!m.gamma || last == null || (m.gamma.zeroGamma == null && m.gamma.callWall == null && m.gamma.putWall == null)) add('gamma', 'Gamma', 'na', 'no cached GEX');
  else {
    const g = m.gamma;
    const sideOk = g.zeroGamma == null ? null : L ? last > g.zeroGamma : last < g.zeroGamma;
    const wall = L ? g.callWall : g.putWall;
    const roomPct = wall == null ? null : (L ? wall - last : last - wall) / last * 100;
    const ok = (sideOk ?? true) && (roomPct == null || roomPct >= cfg.wallRoomPct) && (sideOk != null || roomPct != null);
    add('gamma', 'Gamma', ok ? 'pass' : 'fail', `${g.zeroGamma != null ? `${last >= g.zeroGamma ? 'above' : 'below'} zero-γ ${g.zeroGamma.toFixed(2)}` : 'zero-γ n/a'}; ${wall != null ? `${L ? 'call' : 'put'} wall ${wall.toFixed(2)} (${roomPct!.toFixed(1)}% away)` : `${L ? 'call' : 'put'} wall n/a`} — ${g.source}`);
  }
  // relative strength vs its sector
  const r10 = retPct(c, end, 10);
  const rel = r10 != null && m.sectorR10 != null ? r10 - m.sectorR10 : null;
  if (rel == null) add('rs', 'RS vs sector', 'na', 'not read');
  else add('rs', 'RS vs sector', (L ? rel >= 0 : rel <= 0) ? 'pass' : 'fail', `${fmtPp(rel)}pp vs the sector over 10 sessions`);
  // overnight gap
  if (m.gapPct == null) add('gap', 'Overnight', 'na', 'no overnight print read');
  else add('gap', 'Overnight', (L ? m.gapPct >= cfg.gapPct : m.gapPct <= -cfg.gapPct) ? 'pass' : 'fail', `${m.gapPct >= 0 ? '+' : ''}${m.gapPct.toFixed(1)}% overnight`);
  // NEXUS
  const withN = L ? m.nexus.long : m.nexus.short; const against = L ? m.nexus.short : m.nexus.long;
  add('nexus', 'NEXUS', withN ? 'pass' : against ? 'fail' : 'na', withN ? `${withN} open ${side} idea(s)` : against ? `${against} open idea(s) on the other side` : 'no open idea');

  const avail = chips.filter((x) => x.state !== 'na');
  const wAvail = avail.reduce((a, x) => a + x.weight, 0);
  const wPass = avail.filter((x) => x.state === 'pass').reduce((a, x) => a + x.weight, 0);
  return {
    symbol: m.symbol, last: last == null ? null : r2(last), r1: nz(retPct(c, end, 1)), r10: nz(r10), relSector: nz(rel),
    score: wAvail > 0 ? Math.round((wPass / wAvail) * 100) : null,
    passed: avail.filter((x) => x.state === 'pass').length, available: avail.length, chips, earnings: m.earnings,
  };
}
const nz = (x: number | null) => (x == null ? null : r2(x));

/** Leaders first (score, then RS vs sector on the side); members with no score last. */
export function rankMembers(rows: MemberRead[], side: Side): MemberRead[] {
  const s = side === 'long' ? 1 : -1;
  return [...rows].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || s * ((b.relSector ?? -1e9 * s) - (a.relSector ?? -1e9 * s)));
}

/** Members furthest behind the sector on its side — catch-up candidates — with a plain why-line. */
export function laggardsOf(rows: MemberRead[], side: Side, exclude: Set<string>, n = BOARD_CFG.laggardsShown): Array<{ symbol: string; relSector: number; why: string }> {
  const s = side === 'long' ? 1 : -1;
  return rows.filter((r) => r.relSector != null && !exclude.has(r.symbol) && s * r.relSector < 0)
    .sort((a, b) => s * (a.relSector! - b.relSector!))
    .slice(0, n)
    .map((r) => {
      const bits = [`${fmtPp(r.relSector!)}pp vs the sector over 10 sessions`];
      const trend = r.chips.find((c) => c.key === 'trend');
      if (trend && trend.state === 'fail') bits.push(`trend: ${trend.detail}`);
      const gap = r.chips.find((c) => c.key === 'gap');
      if (gap && gap.state !== 'na') bits.push(gap.detail);
      bits.push(r.earnings ? `earnings ${r.earnings}` : 'no earnings/news flag read');
      return { symbol: r.symbol, relSector: r.relSector!, why: bits.join('; ') };
    });
}

// ─── forward log ─────────────────────────────────────────────────────────

export interface LeaderLogRow {
  kind: 'leaders'; date: string; at: string; sectorId: string; rank: number; side: Side; regime: Regime | null;
  members: string[]; leaders: Array<{ symbol: string; score: number | null; close: number | null }>; status: 'measuring';
}
export interface OutcomeLogRow {
  kind: 'outcome'; date: string; at: string; sectorId: string; symbol: string; h: number; side: Side;
  ret: number; sectorRet: number; excess: number; status: 'measuring';
}
export type BoardLogRow = LeaderLogRow | OutcomeLogRow;

/** Top-N leaders of the top-K ranked sectors, for the close's forward-log line. */
export function leaderLogRows(sectors: Array<{ id: string; rank: number | null; side: Side | null; regime: Regime | null; members: string[]; leaders: MemberRead[] }>, date: string, at: string, cfg = BOARD_CFG.log): LeaderLogRow[] {
  return sectors.filter((s) => s.rank != null && s.rank <= cfg.topSectors).sort((a, b) => a.rank! - b.rank!)
    .map((s) => ({
      kind: 'leaders' as const, date, at, sectorId: s.id, rank: s.rank!, side: s.side ?? 'long', regime: s.regime, members: s.members,
      leaders: s.leaders.slice(0, cfg.leadersPerSector).map((l) => ({ symbol: l.symbol, score: l.score, close: l.last })), status: 'measuring' as const,
    }));
}

/**
 * Outcome rows now measurable: for each logged leader and horizon h, the
 * h-session close-to-close return from the log date vs the equal-weight sector
 * over the same window (side-signed excess). Rows already logged are skipped.
 */
export function outcomesDue(rows: BoardLogRow[], closes: Map<string, Map<string, number>>, dates: string[], at: string, cfg = BOARD_CFG.log): OutcomeLogRow[] {
  const done = new Set(rows.filter((r): r is OutcomeLogRow => r.kind === 'outcome').map((r) => `${r.date}|${r.sectorId}|${r.symbol}|${r.h}`));
  const pos = new Map(dates.map((d, i) => [d, i]));
  const ret = (sym: string, a: string, b: string) => { const m = closes.get(sym); const x = m?.get(a); const y = m?.get(b); return fin(x) && fin(y) && x > 0 ? (y / x - 1) * 100 : null; };
  const out: OutcomeLogRow[] = [];
  for (const r of rows) {
    if (r.kind !== 'leaders') continue;
    const i = pos.get(r.date);
    if (i == null) continue;
    for (const h of cfg.horizons) {
      if (i + h >= dates.length) continue;
      const d1 = dates[i + h];
      const sec = mean(r.members.map((m) => ret(m, r.date, d1)));
      if (sec == null) continue;
      for (const l of r.leaders) {
        const k = `${r.date}|${r.sectorId}|${l.symbol}|${h}`;
        if (done.has(k)) continue;
        const x = ret(l.symbol, r.date, d1);
        if (x == null) continue;
        done.add(k);
        const s = r.side === 'long' ? 1 : -1;
        out.push({ kind: 'outcome', date: r.date, at, sectorId: r.sectorId, symbol: l.symbol, h, side: r.side, ret: r2(x), sectorRet: r2(sec), excess: r2(s * (x - sec)), status: 'measuring' });
      }
    }
  }
  return out;
}

/** Summary of logged outcomes per horizon: n, mean side-signed excess, share beating the sector. */
export function outcomeSummary(rows: BoardLogRow[]): Array<{ h: number; n: number; meanExcess: number | null; beatPct: number | null }> {
  const o = rows.filter((r): r is OutcomeLogRow => r.kind === 'outcome');
  return BOARD_CFG.log.horizons.map((h) => {
    const xs = o.filter((r) => r.h === h).map((r) => r.excess);
    return { h, n: xs.length, meanExcess: xs.length ? r2(mean(xs)!) : null, beatPct: xs.length ? Math.round((xs.filter((x) => x > 0).length / xs.length) * 100) : null };
  });
}

// ─── published snapshot shape (server writes, client reads) ──────────────

export type BoardPhase = 'premarket' | 'session' | 'close' | 'after_hours' | 'closed';
export interface OvernightMover { symbol: string; movePct: number; kind: 'premarket' | 'after_hours'; sectors: string[]; price: number | null; at: string | null }
export interface IdeaRef { id: string; symbol: string; direction: Side; source: string | null; at: string | null; tag: 'with' | 'against' | 'neutral' }
export interface SectorRow {
  id: string; label: string; etf: string | null; thematic: boolean; memberCount: number; membersRead: number;
  /** Members not read on the newest session, each with the reason (never a silent "—"). */
  unread?: Array<{ symbol: string; reason: string }>;
  rank: number | null; rankThen: number | null; rankDelta: number | null; composite: number | null;
  r1: number | null; r3: number | null; r10: number | null; r20: number | null;
  breadth: number | null; highsPct: number | null; lowsPct: number | null;
  rs: number | null; rsMomentum: number | null; regime: Regime | null; side: Side | null;
  stretch: number | null; drawdown: number | null;
  history: RankPoint[];
  consensus: Consensus;
  overnight: { driftPct: number | null; n: number; flag: GapFlag | null; kind: 'premarket' | 'after_hours' | null };
  leaders: MemberRead[];
  laggards: Array<{ symbol: string; relSector: number; why: string }>;
  ideas: IdeaRef[];
}
export interface BoardSnapshot {
  asOf: string;
  dateKey: string;
  phase: BoardPhase;
  /** Last completed session in the bars. */
  sessionThrough: string | null;
  /** Set when the last rank-flow column is today's forming session priced from live quotes. */
  provisional: { date: string; quotesAt: string | null; quotes: number } | null;
  sessions: string[];
  sectors: SectorRow[];
  climbers: string[];
  sliders: string[];
  overnight: { kind: 'premarket' | 'after_hours' | null; at: string | null; movers: OvernightMover[] };
  forward: { rows: number; summary: ReturnType<typeof outcomeSummary>; since: string | null };
  dataAsOf: Record<string, string | null>;
  notes: string[];
  compute: { ms: number; rssBeforeMb: number; rssAfterMb: number; heapDeltaMb: number; symbols: number };
  /** Per-run member coverage: members with bars, members read on the newest session, and why the rest were not. */
  coverage?: { members: number; withBars: number; readNow: number; reasons: Record<string, number> };
  cadence: string;
  status: 'measuring';
}

export const BOARD_HONESTY = 'Measuring: the composite, regime rules, consensus signals and leader-confluence weights are unvalidated. The forward log records each close\'s top-3 leaders in the top-5 sectors and their next 1/3/5-session returns vs the sector — judge it there, not here. Research, not a recommendation.';
