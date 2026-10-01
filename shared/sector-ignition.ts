/**
 * SECTOR IGNITION — one model, four horizons (pure core, no I/O).
 * =================================================================
 * Operator, 2026-09-30: "SMH was called accurately — can we make sector
 * rotation and ignition dynamics for 0DTE, daily, swings, weeks?"
 *
 * A GROUP is a closeness set from shared/sector-peers.ts (members + the ETF that
 * represents its tape — SMH, IGV, CIBR, XLF …). On every horizon the group is
 * read into the same four stages:
 *
 *   quiet     nothing measurable is moving the group
 *   stirring  some of the ignition signals are present, not the core pair
 *   igniting  the core signals agree (breadth AND the ETF vs SPY) plus at least
 *             one confirmation — this is the stage that can emit ideas
 *   extended  the move is already made (ETF far ahead of SPY) — chasing it is
 *             the failure mode, so extended groups never emit ideas
 *
 * Each horizon has its OWN inputs and thresholds (IGNITION_CFG below):
 *
 *   intraday  1–5m bars 09:30–11:30 ET every 5 min — % of members above VWAP,
 *             ETF vs SPY since the open, opening-range-breakout breadth, call-
 *             (or put-) flow clustering (≥3 members with net premium on the
 *             group's side in the last 30 min), pre-market group gap.
 *   daily     pre-market gap breadth → first-hour ORB breadth → holding into
 *             the close (members above VWAP, ETF closing in the top third).
 *   swing     daily bars: ETF/SPY relative-strength line turning (slope change),
 *             breadth thrust (% members above their 10-day MA crossing 70% from
 *             < 40% within ≤ 5 sessions), multi-day flow persistence.
 *   weekly    RRG-style quadrant (RS-ratio / RS-momentum on ETF/SPY): lagging →
 *             improving → leading transitions and multi-week RS.
 *
 * Direction: every read is two-sided. A group falling through VWAP with put
 * flow and the ETF lagging SPY ignites SHORT on equal footing with a long
 * (operator rule 2026-09-24: shorts on equal footing).
 *
 * WALK-FORWARD LAW: none of these thresholds is validated. Every read and every
 * idea carries status 'measuring' until the forward log + the backtest
 * (research/sector-ignition-backtest.ts) say otherwise.
 */

export type IgnitionHorizon = 'intraday' | 'daily' | 'swing' | 'weekly';
export const HORIZONS: readonly IgnitionHorizon[] = ['intraday', 'daily', 'swing', 'weekly'];
export type IgnitionStage = 'quiet' | 'stirring' | 'igniting' | 'extended';
export const STAGE_RANK: Record<IgnitionStage, number> = { quiet: 0, stirring: 1, igniting: 2, extended: 3 };
export type Side = 'long' | 'short';

/** Documented thresholds, one block per horizon. Everything is "measuring". */
export const IGNITION_CFG = {
  /** Members read per group (closest first, sector-peers order). */
  maxMembersPerGroup: 8,
  /** A group needs at least this many members with a read to be staged at all. */
  minMembersRead: 3,
  intraday: {
    windowStartEt: 9 * 60 + 30,
    windowEndEt: 11 * 60 + 30,
    /** Opening range for the ORB breadth, minutes after 09:30. */
    orMinutes: 15,
    vwapBreadthIgnite: 70, vwapBreadthStir: 55,
    relIgnitePct: 0.5, relStirPct: 0.25,
    orbBreadthIgnite: 50, orbBreadthStir: 25,
    flowWindowMin: 30, flowMinNetPremium: 50_000, flowMembersIgnite: 3, flowMembersStir: 2,
    gapIgnitePct: 0.5, gapStirPct: 0.25,
    /** Points needed (each signal 1, half-signal 0.5). */
    pointsIgnite: 3, pointsStir: 1.5,
    extendedRelPct: 1.5, extendedMedianMovePct: 3,
  },
  daily: {
    gapMemberPct: 0.5,
    gapBreadthStirPremarket: 60, medianGapStirPremarket: 0.75,
    gapBreadthIgnite: 50, orbBreadthIgnite: 50, relIgnitePct: 0.3, orbBreadthStir: 40,
    extendedRelPct: 2, extendedMedianMovePct: 4,
    heldVwapBreadth: 60, heldCloseLocation: 0.67, heldRelPct: 0.3, closeExtendedRelPct: 2.5,
  },
  swing: {
    maPeriod: 10, thrustHigh: 70, thrustLow: 40, thrustWithin: 5,
    rsRecent: 5, rsPrior: 10, rsTurnRecentPct: 0.5,
    breadthSupport: 60, flowDaysIgnite: 2, flowLookbackDays: 3,
    extendedRs10Pct: 8,
  },
  weekly: {
    ratioSma: 50, momentumLag: 10, stepSessions: 5, transitionWithin: 10,
    multiWeekSessions: 20, extendedWeeks: 4,
  },
  ideas: {
    perGroupPerHorizon: 2,
    perDay: { intraday: 4, daily: 3, swing: 3, weekly: 0 } as Record<IgnitionHorizon, number>,
    /** Laggard: moved ≤ this fraction of the ETF's move in the group's direction. */
    laggardMaxFraction: 0.5,
    minSignalsForLaggard: 1,
  },
} as const;

// ─── Groups (shared/sector-peers.ts, ETF-backed only) ─────────────────────

import { PEER_GROUPS } from './sector-peers';

export interface IgnitionGroup { groupId: string; label: string; etf: string; members: string[] }

/** Every peer group with a representative ETF; members closest-first, ETF excluded, capped. */
export function ignitionGroups(max = IGNITION_CFG.maxMembersPerGroup): IgnitionGroup[] {
  return PEER_GROUPS.filter((g) => !!g.etf && !g.thematic).map((g) => ({
    groupId: g.id, label: g.label, etf: g.etf as string,
    members: g.members.filter((m) => m !== g.etf).slice(0, max),
  }));
}

// ─── Small numeric helpers ────────────────────────────────────────────────

export const r2 = (x: number) => Math.round(x * 100) / 100;
export function median(xs: number[]): number | null {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
export function sma(xs: number[], n: number, end = xs.length): number | null {
  if (end < n || n <= 0) return null;
  let s = 0;
  for (let i = end - n; i < end; i++) s += xs[i];
  return s / n;
}
const pct = (num: number, den: number) => (den > 0 ? (num / den) * 100 : 0);
const sgn = (s: Side) => (s === 'long' ? 1 : -1);
const fmtPct = (x: number | null | undefined, d = 2) => (x == null || !Number.isFinite(x) ? '—' : `${x >= 0 ? '+' : ''}${x.toFixed(d)}%`);

// ─── Shared output shape ──────────────────────────────────────────────────

export interface MemberChip { symbol: string; movePct: number | null; note: string }
export interface IgnitionLevel { name: string; price: number }

export interface GroupRead {
  groupId: string;
  label: string;
  etf: string;
  horizon: IgnitionHorizon;
  /** daily only: which read produced it. */
  phase?: 'premarket' | 'first_hour' | 'close' | null;
  stage: IgnitionStage;
  side: Side | null;
  points: number;
  /** ETF move over the horizon's window (%), signed. */
  etfMovePct: number | null;
  /** ETF minus SPY over the same window, signed. */
  relPct: number | null;
  /** The horizon's primary breadth % (members on the group's side). */
  breadthPct: number | null;
  /** Members with net premium on the group's side (intraday: last 30 min; swing: persistence days). */
  flowCount: number | null;
  membersRead: number;
  metrics: Record<string, number | string | boolean | null>;
  leaders: MemberChip[];
  laggards: MemberChip[];
  levels: IgnitionLevel[];
  why: string[];
  status: 'measuring';
}

export interface MemberSignalInput {
  symbol: string;
  /** Move over the horizon's window (%), signed. */
  movePct: number | null;
  /** Which of the group's signals this member carries (e.g. 'above VWAP', 'call flow'). */
  signals: string[];
  /** Optional theme-leverage read of the member on the group ETF (shared/theme-leverage.ts). */
  leverage?: { beta: number; rSquared: number; residualPct: number; catchUpScore: number; breakingDown: boolean; decoupling: boolean } | null;
}

/**
 * Leaders = members that moved with (or ahead of) the ETF on the group's side.
 * Laggards = members carrying at least one of the group's signals but that have
 * moved ≤ half of the ETF's move in the group's direction — the catch-up
 * candidates. A member the theme-leverage read calls "breaking down" (a widening
 * gap against a rising driver) is NOT a laggard: it is being left behind.
 */
export function selectLeadersLaggards(
  members: MemberSignalInput[], etfMovePct: number | null, side: Side | null,
  cfg = IGNITION_CFG.ideas, maxEach = 4,
): { leaders: MemberChip[]; laggards: MemberChip[] } {
  if (!side) return { leaders: [], laggards: [] };
  const s = sgn(side);
  const etfAligned = etfMovePct != null ? etfMovePct * s : null;
  const withMove = members.filter((m) => m.movePct != null && Number.isFinite(m.movePct));
  const leaders = withMove
    .filter((m) => (m.movePct as number) * s > 0 && (etfAligned == null || (m.movePct as number) * s >= etfAligned))
    .sort((a, b) => (b.movePct as number) * s - (a.movePct as number) * s)
    .slice(0, maxEach)
    .map((m) => ({ symbol: m.symbol, movePct: r2(m.movePct as number), note: m.signals.slice(0, 2).join(' · ') || 'moved with the group' }));
  const leaderSet = new Set(leaders.map((l) => l.symbol));
  const lagCut = etfAligned != null && etfAligned > 0 ? etfAligned * cfg.laggardMaxFraction : null;
  const laggards = withMove
    .filter((m) => !leaderSet.has(m.symbol))
    .filter((m) => m.signals.length >= cfg.minSignalsForLaggard)
    .filter((m) => lagCut != null && (m.movePct as number) * s <= lagCut)
    .filter((m) => !m.leverage?.breakingDown)
    .sort((a, b) =>
      (b.leverage?.catchUpScore ?? -1) - (a.leverage?.catchUpScore ?? -1)
      || b.signals.length - a.signals.length
      || (a.movePct as number) * s - (b.movePct as number) * s)
    .slice(0, maxEach)
    .map((m) => ({
      symbol: m.symbol, movePct: r2(m.movePct as number),
      note: [
        `${fmtPct(m.movePct)} vs ETF ${fmtPct(etfMovePct)}`,
        m.signals.slice(0, 2).join(' · '),
        m.leverage ? `β ${m.leverage.beta.toFixed(1)} (R² ${m.leverage.rSquared.toFixed(2)})${m.leverage.catchUpScore > 0 ? `, catch-up ${m.leverage.catchUpScore}` : ''}` : '',
      ].filter(Boolean).join(' · '),
    }));
  return { leaders, laggards };
}

function sideOf(x: number | null | undefined, eps = 0): Side | null {
  if (x == null || !Number.isFinite(x) || Math.abs(x) <= eps) return null;
  return x > 0 ? 'long' : 'short';
}

function baseRead(g: { groupId: string; label: string; etf: string }, horizon: IgnitionHorizon): GroupRead {
  return {
    groupId: g.groupId, label: g.label, etf: g.etf, horizon, phase: null, stage: 'quiet', side: null, points: 0,
    etfMovePct: null, relPct: null, breadthPct: null, flowCount: null, membersRead: 0, metrics: {},
    leaders: [], laggards: [], levels: [], why: [], status: 'measuring',
  };
}

// ─── INTRADAY / 0DTE ──────────────────────────────────────────────────────

export interface IntradayMember {
  symbol: string;
  /** % since today's regular-session open. */
  movePct: number | null;
  last: number | null;
  vwap: number | null;
  orHigh: number | null;
  orLow: number | null;
  /** Did a 5m close after the opening range close beyond its high / low? */
  orBreak: 'up' | 'down' | null;
  /** Calls − puts premium in the last flowWindowMin minutes (null = no flow read). */
  netPremium30m: number | null;
  /** Opening gap vs the prior close (%). */
  gapPct: number | null;
}
export interface IntradayGroupInput {
  groupId: string; label: string; etf: string;
  etfMovePct: number | null;
  spyMovePct: number | null;
  /** ETF's own intraday levels for the why-lines / key levels. */
  etfLevels?: { vwap: number | null; orHigh: number | null; orLow: number | null; last: number | null; pdh: number | null; pdl: number | null } | null;
  /** Group median PRE-MARKET gap recorded before the open (leading signal); null → opening gap is used. */
  pmGapPct?: number | null;
  members: IntradayMember[];
}

export function scoreIntraday(i: IntradayGroupInput, cfg = IGNITION_CFG.intraday): GroupRead {
  const out = baseRead(i, 'intraday');
  const read = i.members.filter((m) => m.movePct != null);
  out.membersRead = read.length;
  const rel = i.etfMovePct != null && i.spyMovePct != null ? i.etfMovePct - i.spyMovePct : null;
  out.etfMovePct = i.etfMovePct != null ? r2(i.etfMovePct) : null;
  out.relPct = rel != null ? r2(rel) : null;
  if (read.length < IGNITION_CFG.minMembersRead) {
    out.why.push(`only ${read.length} member(s) with an intraday read — not staged`);
    return out;
  }
  const medMove = median(read.map((m) => m.movePct as number));
  const side = sideOf(rel, 0.1) ?? sideOf(medMove, 0.1);
  out.side = side;
  if (!side) { out.why.push('ETF level with SPY and members flat — no direction'); return out; }
  const s = sgn(side);
  const vw = read.filter((m) => m.vwap != null && m.last != null);
  const vwapBreadth = vw.length ? pct(vw.filter((m) => ((m.last as number) - (m.vwap as number)) * s > 0).length, vw.length) : null;
  const orRead = read.filter((m) => m.orHigh != null);
  const orbBreadth = orRead.length ? pct(orRead.filter((m) => m.orBreak === (side === 'long' ? 'up' : 'down')).length, orRead.length) : null;
  const flowRead = read.filter((m) => m.netPremium30m != null);
  const flowCount = flowRead.length ? flowRead.filter((m) => (m.netPremium30m as number) * s >= cfg.flowMinNetPremium).length : null;
  const openGap = median(read.filter((m) => m.gapPct != null).map((m) => m.gapPct as number));
  const gap = i.pmGapPct ?? openGap;
  const alignedRel = rel != null ? rel * s : null;
  const alignedGap = gap != null ? gap * s : null;

  let pts = 0; const why: string[] = [];
  const add = (full: boolean, half: boolean, text: string) => { if (full) { pts += 1; why.push(text); } else if (half) { pts += 0.5; why.push(`${text} (partial)`); } };
  add(vwapBreadth != null && vwapBreadth >= cfg.vwapBreadthIgnite, vwapBreadth != null && vwapBreadth >= cfg.vwapBreadthStir,
    `${vwapBreadth?.toFixed(0)}% of ${vw.length} members ${side === 'long' ? 'above' : 'below'} VWAP`);
  add(alignedRel != null && alignedRel >= cfg.relIgnitePct, alignedRel != null && alignedRel >= cfg.relStirPct,
    `${i.etf} ${fmtPct(rel)} vs SPY since the open`);
  add(orbBreadth != null && orbBreadth >= cfg.orbBreadthIgnite, orbBreadth != null && orbBreadth >= cfg.orbBreadthStir,
    `${orbBreadth?.toFixed(0)}% broke the ${cfg.orMinutes}-min opening range ${side === 'long' ? 'high' : 'low'}`);
  add(flowCount != null && flowCount >= cfg.flowMembersIgnite, flowCount != null && flowCount >= cfg.flowMembersStir,
    `${flowCount} member(s) with net ${side === 'long' ? 'call' : 'put'} premium ≥ $${cfg.flowMinNetPremium / 1000}K in ${cfg.flowWindowMin} min`);
  add(alignedGap != null && alignedGap >= cfg.gapIgnitePct, alignedGap != null && alignedGap >= cfg.gapStirPct,
    `group ${i.pmGapPct != null ? 'pre-market' : 'opening'} gap ${fmtPct(gap)} (leading direction)`);
  if (flowCount == null) why.push('no flow read (Bullflow ring empty) — flow not counted');

  const alignedMed = medMove != null ? medMove * s : null;
  let stage: IgnitionStage = 'quiet';
  if ((alignedRel != null && alignedRel >= cfg.extendedRelPct) || (alignedMed != null && alignedMed >= cfg.extendedMedianMovePct)) {
    stage = 'extended';
    why.unshift(`extended: ${i.etf} ${fmtPct(rel)} vs SPY, median member ${fmtPct(medMove)} — the move is made`);
  } else if (vwapBreadth != null && vwapBreadth >= cfg.vwapBreadthIgnite && alignedRel != null && alignedRel >= cfg.relIgnitePct && pts >= cfg.pointsIgnite) {
    stage = 'igniting';
  } else if (pts >= cfg.pointsStir) {
    stage = 'stirring';
  }
  out.stage = stage; out.points = pts; out.breadthPct = vwapBreadth != null ? Math.round(vwapBreadth) : null; out.flowCount = flowCount;
  out.metrics = { vwapBreadthPct: vwapBreadth != null ? Math.round(vwapBreadth) : null, orbBreadthPct: orbBreadth != null ? Math.round(orbBreadth) : null, flowMembers: flowCount, gapPct: gap != null ? r2(gap) : null, gapBasis: i.pmGapPct != null ? 'pre-market' : 'opening', medianMovePct: medMove != null ? r2(medMove) : null };
  out.why = why;
  const mem: MemberSignalInput[] = read.map((m) => {
    const sig: string[] = [];
    if (m.vwap != null && m.last != null && (m.last - m.vwap) * s > 0) sig.push(side === 'long' ? 'above VWAP' : 'below VWAP');
    if (m.orBreak === (side === 'long' ? 'up' : 'down')) sig.push('ORB');
    if (m.netPremium30m != null && m.netPremium30m * s >= cfg.flowMinNetPremium) sig.push(side === 'long' ? 'call flow' : 'put flow');
    return { symbol: m.symbol, movePct: m.movePct, signals: sig };
  });
  Object.assign(out, selectLeadersLaggards(mem, i.etfMovePct, side));
  const L = i.etfLevels;
  if (L) {
    for (const [name, v] of [['VWAP', L.vwap], [`OR${cfg.orMinutes} high`, L.orHigh], [`OR${cfg.orMinutes} low`, L.orLow], ['prior-day high', L.pdh], ['prior-day low', L.pdl]] as const) {
      if (v != null && Number.isFinite(v)) out.levels.push({ name: `${i.etf} ${name}`, price: r2(v) });
    }
  }
  return out;
}

/** Opening-range + VWAP read from one symbol's 5m regular-session bars (oldest first). */
export function intradayMemberFromBars(
  symbol: string,
  bars: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>,
  pdc: number | null, nowMs: number, orMinutes = IGNITION_CFG.intraday.orMinutes, barMs = 5 * 60_000,
): Omit<IntradayMember, 'netPremium30m'> {
  const closed = bars.filter((b) => b.t + barMs <= nowMs + 1000);
  if (!bars.length) return { symbol, movePct: null, last: null, vwap: null, orHigh: null, orLow: null, orBreak: null, gapPct: null };
  const open = bars[0].o;
  const last = (closed[closed.length - 1] ?? bars[bars.length - 1]).c;
  let pv = 0; let vv = 0;
  for (const b of bars) if (b.v > 0) { pv += ((b.h + b.l + b.c) / 3) * b.v; vv += b.v; }
  const orEnd = bars[0].t + orMinutes * 60_000;
  const orBars = bars.filter((b) => b.t < orEnd);
  const orDone = closed.some((b) => b.t + barMs >= orEnd);
  const orHigh = orDone && orBars.length ? Math.max(...orBars.map((b) => b.h)) : null;
  const orLow = orDone && orBars.length ? Math.min(...orBars.map((b) => b.l)) : null;
  let orBreak: 'up' | 'down' | null = null;
  if (orHigh != null && orLow != null) {
    for (const b of closed.filter((x) => x.t >= orEnd)) {
      if (b.c > orHigh) { orBreak = 'up'; break; }
      if (b.c < orLow) { orBreak = 'down'; break; }
    }
  }
  return {
    symbol, movePct: open > 0 ? ((last - open) / open) * 100 : null, last, vwap: vv > 0 ? pv / vv : null,
    orHigh, orLow, orBreak, gapPct: pdc && pdc > 0 ? ((open - pdc) / pdc) * 100 : null,
  };
}

// ─── DAILY ────────────────────────────────────────────────────────────────

export interface DailyMember {
  symbol: string;
  gapPct: number | null;
  /** % since the open (first hour / close reads). */
  movePct: number | null;
  orBreak: 'up' | 'down' | null;
  aboveVwap: boolean | null;
}
export interface DailyGroupInput {
  groupId: string; label: string; etf: string;
  phase: 'premarket' | 'first_hour' | 'close';
  etfGapPct: number | null;
  etfMovePct: number | null;
  spyMovePct: number | null;
  /** ETF close location in the day's range, 0 = low, 1 = high (close read). */
  etfCloseLocation?: number | null;
  members: DailyMember[];
}

export function scoreDaily(i: DailyGroupInput, cfg = IGNITION_CFG.daily): GroupRead {
  const out = baseRead(i, 'daily');
  out.phase = i.phase;
  const withGap = i.members.filter((m) => m.gapPct != null);
  const withMove = i.members.filter((m) => m.movePct != null);
  out.membersRead = i.phase === 'premarket' ? withGap.length : withMove.length;
  if (out.membersRead < IGNITION_CFG.minMembersRead) { out.why.push(`only ${out.membersRead} member(s) read — not staged`); return out; }
  const medGap = median(withGap.map((m) => m.gapPct as number));
  const rel = i.etfMovePct != null && i.spyMovePct != null ? i.etfMovePct - i.spyMovePct : null;
  out.relPct = rel != null ? r2(rel) : null;
  out.etfMovePct = i.phase === 'premarket' ? (i.etfGapPct != null ? r2(i.etfGapPct) : null) : (i.etfMovePct != null ? r2(i.etfMovePct) : null);
  const side = i.phase === 'premarket' ? sideOf(medGap, 0.1) : (sideOf(medGap, 0.3) ?? sideOf(rel, 0.1));
  out.side = side;
  if (!side) { out.why.push('no gap and no relative move — no direction'); return out; }
  const s = sgn(side);
  const gapBreadth = withGap.length ? pct(withGap.filter((m) => (m.gapPct as number) * s >= cfg.gapMemberPct).length, withGap.length) : null;
  const orRead = i.members.filter((m) => m.movePct != null);
  const orbBreadth = orRead.length ? pct(orRead.filter((m) => m.orBreak === (side === 'long' ? 'up' : 'down')).length, orRead.length) : null;
  const vwRead = i.members.filter((m) => m.aboveVwap != null);
  const vwapBreadth = vwRead.length ? pct(vwRead.filter((m) => (side === 'long' ? m.aboveVwap : !m.aboveVwap)).length, vwRead.length) : null;
  const alignedRel = rel != null ? rel * s : null;
  const medMove = median(withMove.map((m) => m.movePct as number));
  const alignedMed = medMove != null ? medMove * s : null;
  const why: string[] = [];
  why.push(`${gapBreadth?.toFixed(0) ?? '—'}% of members gapped ${side === 'long' ? 'up' : 'down'} ≥ ${cfg.gapMemberPct}% (median ${fmtPct(medGap)})`);
  let stage: IgnitionStage = 'quiet';
  if (i.phase === 'premarket') {
    if (gapBreadth != null && gapBreadth >= cfg.gapBreadthStirPremarket && medGap != null && Math.abs(medGap) >= cfg.medianGapStirPremarket) {
      stage = 'stirring';
      why.push('pre-market only — the open has to confirm before this can ignite');
    }
    out.breadthPct = gapBreadth != null ? Math.round(gapBreadth) : null;
  } else if (i.phase === 'first_hour') {
    why.push(`${orbBreadth?.toFixed(0) ?? '—'}% broke the opening range ${side === 'long' ? 'high' : 'low'}; ${i.etf} ${fmtPct(rel)} vs SPY`);
    if ((alignedRel != null && alignedRel >= cfg.extendedRelPct) || (alignedMed != null && alignedMed >= cfg.extendedMedianMovePct)) {
      stage = 'extended'; why.unshift('extended: the day\'s move is largely made');
    } else if (gapBreadth != null && gapBreadth >= cfg.gapBreadthIgnite && orbBreadth != null && orbBreadth >= cfg.orbBreadthIgnite && alignedRel != null && alignedRel >= cfg.relIgnitePct) {
      stage = 'igniting';
    } else if ((gapBreadth != null && gapBreadth >= cfg.gapBreadthIgnite) || (orbBreadth != null && orbBreadth >= cfg.orbBreadthStir)) {
      stage = 'stirring';
    }
    out.breadthPct = orbBreadth != null ? Math.round(orbBreadth) : null;
  } else {
    const loc = i.etfCloseLocation;
    const alignedLoc = loc == null ? null : side === 'long' ? loc : 1 - loc;
    why.push(`${vwapBreadth?.toFixed(0) ?? '—'}% of members closed ${side === 'long' ? 'above' : 'below'} VWAP; ${i.etf} closed ${alignedLoc != null ? `${Math.round(alignedLoc * 100)}% toward the ${side === 'long' ? 'high' : 'low'}` : '— (no range read)'}`);
    if (alignedRel != null && alignedRel >= cfg.closeExtendedRelPct) {
      stage = 'extended'; why.unshift('extended into the close');
    } else if (vwapBreadth != null && vwapBreadth >= cfg.heldVwapBreadth && alignedLoc != null && alignedLoc >= cfg.heldCloseLocation && alignedRel != null && alignedRel >= cfg.heldRelPct) {
      stage = 'igniting'; why.unshift('held into the close — a day-2 candidate');
    } else if (vwapBreadth != null && vwapBreadth >= 50 && alignedRel != null && alignedRel > 0) {
      stage = 'stirring';
    } else {
      why.push('did not hold into the close');
    }
    out.breadthPct = vwapBreadth != null ? Math.round(vwapBreadth) : null;
  }
  out.stage = stage;
  out.metrics = { gapBreadthPct: gapBreadth != null ? Math.round(gapBreadth) : null, medianGapPct: medGap != null ? r2(medGap) : null, orbBreadthPct: orbBreadth != null ? Math.round(orbBreadth) : null, vwapBreadthPct: vwapBreadth != null ? Math.round(vwapBreadth) : null, closeLocation: i.etfCloseLocation != null ? r2(i.etfCloseLocation) : null, medianMovePct: medMove != null ? r2(medMove) : null };
  out.points = stage === 'igniting' ? 3 : stage === 'stirring' ? 1.5 : 0;
  out.why = why;
  const mem: MemberSignalInput[] = i.members.map((m) => {
    const sig: string[] = [];
    if (m.gapPct != null && m.gapPct * s >= cfg.gapMemberPct) sig.push(`gap ${fmtPct(m.gapPct, 1)}`);
    if (m.orBreak === (side === 'long' ? 'up' : 'down')) sig.push('ORB');
    if (m.aboveVwap != null && (side === 'long' ? m.aboveVwap : !m.aboveVwap)) sig.push(side === 'long' ? 'above VWAP' : 'below VWAP');
    return { symbol: m.symbol, movePct: i.phase === 'premarket' ? m.gapPct : m.movePct, signals: sig };
  });
  Object.assign(out, selectLeadersLaggards(mem, out.etfMovePct, side));
  return out;
}

// ─── SWING (2–5 days, daily bars) ─────────────────────────────────────────

export interface SwingMember { symbol: string; closes: number[]; lows?: number[]; highs?: number[]; leverage?: MemberSignalInput['leverage'] }
export interface SwingGroupInput {
  groupId: string; label: string; etf: string;
  /** Aligned (same dates) daily closes, oldest first. */
  etfCloses: number[];
  spyCloses: number[];
  members: SwingMember[];
  /** Sessions (of the last flowLookbackDays) where ≥2 members had net premium on each side; null = no flow read. */
  flowDays?: { long: number; short: number } | null;
}

/** % of members above (long) / below (short) their N-day SMA, `back` sessions ago. */
export function breadthAboveMa(members: SwingMember[], n: number, back: number, side: Side): number | null {
  let k = 0; let tot = 0;
  for (const m of members) {
    const end = m.closes.length - back;
    const ma = sma(m.closes, n, end);
    if (ma == null) continue;
    const c = m.closes[end - 1];
    tot++;
    if ((c - ma) * sgn(side) > 0) k++;
  }
  return tot ? pct(k, tot) : null;
}

export function scoreSwing(i: SwingGroupInput, cfg = IGNITION_CFG.swing): GroupRead {
  const out = baseRead(i, 'swing');
  const n = Math.min(i.etfCloses.length, i.spyCloses.length);
  const members = i.members.filter((m) => m.closes.length >= cfg.maPeriod + cfg.thrustWithin + 1);
  out.membersRead = members.length;
  if (n < cfg.rsRecent + cfg.rsPrior + 1 || members.length < IGNITION_CFG.minMembersRead) {
    out.why.push(`insufficient history (${n} ETF sessions, ${members.length} members) — not staged`);
    return out;
  }
  const etf = i.etfCloses.slice(-n); const spy = i.spyCloses.slice(-n);
  const rs = etf.map((c, k) => c / spy[k]);
  const t = rs.length - 1;
  const slopeRecent = (rs[t] / rs[t - cfg.rsRecent] - 1) * 100;
  const slopePrior = (rs[t - cfg.rsRecent] / rs[t - cfg.rsRecent - cfg.rsPrior] - 1) * 100;
  const rs10 = t >= 10 ? (rs[t] / rs[t - 10] - 1) * 100 : null;
  const side: Side | null = sideOf(slopeRecent, 0.05);
  out.side = side;
  out.etfMovePct = r2((etf[t] / etf[t - cfg.rsRecent] - 1) * 100);
  out.relPct = r2(slopeRecent);
  if (!side) { out.why.push('RS line flat over 5 sessions'); return out; }
  const s = sgn(side);
  const turn = slopeRecent * s >= cfg.rsTurnRecentPct && slopePrior * s <= 0;
  const bNow = breadthAboveMa(members, cfg.maPeriod, 0, side);
  const bPrev: number[] = [];
  for (let b = 1; b <= cfg.thrustWithin; b++) { const v = breadthAboveMa(members, cfg.maPeriod, b, side); if (v != null) bPrev.push(v); }
  const thrust = bNow != null && bNow >= cfg.thrustHigh && bPrev.length > 0 && Math.min(...bPrev) < cfg.thrustLow;
  const flowDays = i.flowDays ? i.flowDays[side] : null;
  const why: string[] = [];
  why.push(`${i.etf}/SPY RS line ${fmtPct(slopeRecent)} over ${cfg.rsRecent} sessions after ${fmtPct(slopePrior)} over the prior ${cfg.rsPrior}${turn ? ` — turning ${side === 'long' ? 'up' : 'down'}` : ''}`);
  why.push(`${bNow?.toFixed(0) ?? '—'}% of ${members.length} members ${side === 'long' ? 'above' : 'below'} their ${cfg.maPeriod}-day MA${thrust ? ` — breadth thrust from ${Math.min(...bPrev).toFixed(0)}% within ${cfg.thrustWithin} sessions` : ''}`);
  why.push(flowDays == null ? 'no multi-day flow read' : `${flowDays} of the last ${cfg.flowLookbackDays} sessions with ≥2 members on ${side === 'long' ? 'call' : 'put'} premium`);
  let stage: IgnitionStage = 'quiet';
  const allHigh = bNow != null && bNow >= 90 && bPrev.length >= cfg.thrustWithin && bPrev.every((v) => v >= 90);
  if ((rs10 != null && rs10 * s >= cfg.extendedRs10Pct) || allHigh) {
    stage = 'extended'; why.unshift(`extended: ${i.etf} ${fmtPct(rs10)} vs SPY over 10 sessions${allHigh ? ', breadth ≥ 90% for a week' : ''}`);
  } else if ((turn && thrust) || (turn && bNow != null && bNow >= cfg.breadthSupport && (flowDays ?? 0) >= cfg.flowDaysIgnite) || (thrust && (flowDays ?? 0) >= cfg.flowDaysIgnite && slopeRecent * s > 0)) {
    stage = 'igniting';
  } else if (turn || thrust || (bNow != null && bNow >= cfg.breadthSupport && slopeRecent * s > 0)) {
    stage = 'stirring';
  }
  out.stage = stage;
  out.points = stage === 'igniting' ? 3 : stage === 'stirring' ? 1.5 : 0;
  out.breadthPct = bNow != null ? Math.round(bNow) : null;
  out.flowCount = flowDays;
  out.metrics = { rsSlope5Pct: r2(slopeRecent), rsSlopePrior10Pct: r2(slopePrior), rs10Pct: rs10 != null ? r2(rs10) : null, rsTurn: turn, thrust, breadthNow: bNow != null ? Math.round(bNow) : null, breadthMin5: bPrev.length ? Math.round(Math.min(...bPrev)) : null, flowDays };
  out.why = why;
  const mem: MemberSignalInput[] = members.map((m) => {
    const c = m.closes; const k = c.length - 1;
    const ma = sma(c, cfg.maPeriod);
    const sig: string[] = [];
    if (ma != null && (c[k] - ma) * s > 0) sig.push(side === 'long' ? `above ${cfg.maPeriod}d MA` : `below ${cfg.maPeriod}d MA`);
    const prevMa = sma(c, cfg.maPeriod, c.length - 1);
    if (ma != null && prevMa != null && (ma - prevMa) * s > 0) sig.push(`${cfg.maPeriod}d MA turning`);
    return { symbol: m.symbol, movePct: k >= cfg.rsRecent ? (c[k] / c[k - cfg.rsRecent] - 1) * 100 : null, signals: sig, leverage: m.leverage ?? null };
  });
  Object.assign(out, selectLeadersLaggards(mem, out.etfMovePct, side));
  const hi = Math.max(...etf.slice(-20)); const lo = Math.min(...etf.slice(-20));
  out.levels = [{ name: `${i.etf} last close`, price: r2(etf[t]) }, { name: `${i.etf} 20-session high`, price: r2(hi) }, { name: `${i.etf} 20-session low`, price: r2(lo) }];
  const ma10 = sma(etf, cfg.maPeriod); if (ma10 != null) out.levels.push({ name: `${i.etf} ${cfg.maPeriod}-day MA`, price: r2(ma10) });
  return out;
}

// ─── WEEKLY (RRG-style) ───────────────────────────────────────────────────

export type RrgQuadrant = 'leading' | 'weakening' | 'lagging' | 'improving';
export function quadrantOf(ratio: number, momentum: number): RrgQuadrant {
  if (ratio >= 100) return momentum >= 100 ? 'leading' : 'weakening';
  return momentum >= 100 ? 'improving' : 'lagging';
}

/**
 * RS-ratio = 100 × RS / SMA50(RS); RS-momentum = 100 × ratio / ratio 10 sessions
 * earlier. A simplified JdK construction on daily bars (the published JdK
 * normalisation is proprietary); what matters here is the quadrant path.
 */
export function rrgSeries(etfCloses: number[], spyCloses: number[], cfg = IGNITION_CFG.weekly): Array<{ ratio: number; momentum: number; quadrant: RrgQuadrant }> {
  const n = Math.min(etfCloses.length, spyCloses.length);
  const rs = etfCloses.slice(-n).map((c, k) => c / spyCloses.slice(-n)[k]);
  const ratio: Array<number | null> = rs.map((_, k) => { const m = sma(rs, cfg.ratioSma, k + 1); return m ? (100 * rs[k]) / m : null; });
  const out: Array<{ ratio: number; momentum: number; quadrant: RrgQuadrant }> = [];
  for (let k = 0; k < n; k++) {
    const r = ratio[k]; const p = k >= cfg.momentumLag ? ratio[k - cfg.momentumLag] : null;
    if (r == null || p == null) continue;
    const mom = (100 * r) / p;
    out.push({ ratio: r, momentum: mom, quadrant: quadrantOf(r, mom) });
  }
  return out;
}

const NEXT_UP: Record<RrgQuadrant, RrgQuadrant | null> = { lagging: 'improving', improving: 'leading', leading: null, weakening: null };
const NEXT_DOWN: Record<RrgQuadrant, RrgQuadrant | null> = { leading: 'weakening', weakening: 'lagging', lagging: null, improving: null };

export interface WeeklyGroupInput {
  groupId: string; label: string; etf: string;
  etfCloses: number[]; spyCloses: number[];
  members: Array<{ symbol: string; closes: number[] }>;
}

export function scoreWeekly(i: WeeklyGroupInput, cfg = IGNITION_CFG.weekly): GroupRead {
  const out = baseRead(i, 'weekly');
  const rr = rrgSeries(i.etfCloses, i.spyCloses, cfg);
  out.membersRead = i.members.filter((m) => m.closes.length > cfg.multiWeekSessions).length;
  const need = cfg.transitionWithin + cfg.stepSessions + 1;
  if (rr.length < Math.max(need, cfg.extendedWeeks * 5 + 1)) { out.why.push(`only ${rr.length} RRG points — need ${Math.max(need, cfg.extendedWeeks * 5 + 1)}`); return out; }
  const t = rr.length - 1;
  const n = Math.min(i.etfCloses.length, i.spyCloses.length);
  const etf = i.etfCloses.slice(-n); const spy = i.spyCloses.slice(-n);
  const rsNow = etf[n - 1] / spy[n - 1]; const rsThen = etf[n - 1 - cfg.multiWeekSessions] / spy[n - 1 - cfg.multiWeekSessions];
  const multiWeekRs = (rsNow / rsThen - 1) * 100;
  out.relPct = r2(multiWeekRs);
  out.etfMovePct = r2((etf[n - 1] / etf[n - 1 - cfg.multiWeekSessions] - 1) * 100);
  const q = rr[t].quadrant;
  const path: RrgQuadrant[] = [];
  for (let b = cfg.extendedWeeks * 5; b >= 0; b -= 5) path.push(rr[t - b].quadrant);
  // Transition: a step lagging→improving→leading (up) or leading→weakening→lagging (down) inside the window.
  let up = false; let down = false; let stepText = '';
  for (let b = 1; b <= cfg.transitionWithin; b++) {
    const from = rr[t - b].quadrant; const to = rr[t - b + 1].quadrant;
    if (NEXT_UP[from] === to && (to === q || NEXT_UP[to] === q)) { up = true; stepText = `${from} → ${to} ${b} session(s) ago`; }
    if (NEXT_DOWN[from] === to && (to === q || NEXT_DOWN[to] === q)) { down = true; stepText = `${from} → ${to} ${b} session(s) ago`; }
  }
  const momRising = rr[t].momentum > rr[t - cfg.stepSessions].momentum;
  const why: string[] = [`RRG ${q} (RS-ratio ${rr[t].ratio.toFixed(1)}, RS-momentum ${rr[t].momentum.toFixed(1)}); path by week: ${path.join(' → ')}`, `${i.etf} ${fmtPct(multiWeekRs)} vs SPY over ${cfg.multiWeekSessions} sessions`];
  let stage: IgnitionStage = 'quiet'; let side: Side | null = null;
  const allLeading = path.slice(-cfg.extendedWeeks - 1).every((x) => x === 'leading');
  const allLagging = path.slice(-cfg.extendedWeeks - 1).every((x) => x === 'lagging');
  if (allLeading) { stage = 'extended'; side = 'long'; why.unshift(`leading for ${cfg.extendedWeeks}+ weeks — extended`); }
  else if (allLagging) { stage = 'extended'; side = 'short'; why.unshift(`lagging for ${cfg.extendedWeeks}+ weeks — extended to the downside`); }
  else if (up && momRising && (q === 'improving' || multiWeekRs > 0)) { stage = 'igniting'; side = 'long'; why.unshift(`transition ${stepText}, momentum rising`); }
  else if (down && !momRising && (q === 'weakening' || multiWeekRs < 0)) { stage = 'igniting'; side = 'short'; why.unshift(`transition ${stepText}, momentum falling`); }
  else if (q === 'improving' && momRising) { stage = 'stirring'; side = 'long'; }
  else if (q === 'weakening' && !momRising) { stage = 'stirring'; side = 'short'; }
  else { side = q === 'leading' || q === 'improving' ? 'long' : 'short'; }
  out.stage = stage; out.side = stage === 'quiet' ? null : side;
  out.points = stage === 'igniting' ? 3 : stage === 'stirring' ? 1.5 : 0;
  out.metrics = { quadrant: q, rsRatio: r2(rr[t].ratio), rsMomentum: r2(rr[t].momentum), multiWeekRsPct: r2(multiWeekRs), momentumRising: momRising, path: path.join('>') };
  out.why = why;
  if (out.side) {
    const s = out.side;
    const mem: MemberSignalInput[] = i.members.filter((m) => m.closes.length > cfg.multiWeekSessions).map((m) => {
      const c = m.closes; const k = c.length - 1;
      const mv = (c[k] / c[k - cfg.multiWeekSessions] - 1) * 100;
      const ma20 = sma(c, 20);
      const sig: string[] = [];
      if (ma20 != null && (c[k] - ma20) * sgn(s) > 0) sig.push(s === 'long' ? 'above 20d MA' : 'below 20d MA');
      return { symbol: m.symbol, movePct: mv, signals: sig };
    });
    Object.assign(out, selectLeadersLaggards(mem, out.etfMovePct, s));
    const withMa = mem.length;
    out.breadthPct = withMa ? Math.round((mem.filter((m) => m.signals.length > 0).length / withMa) * 100) : null;
    out.metrics.breadthBasis = `% of members ${s === 'long' ? 'above' : 'below'} their 20-day MA`;
  }
  out.levels = [{ name: `${i.etf} last close`, price: r2(etf[n - 1]) }, { name: `${i.etf} ${cfg.multiWeekSessions}-session high`, price: r2(Math.max(...etf.slice(-cfg.multiWeekSessions))) }, { name: `${i.etf} ${cfg.multiWeekSessions}-session low`, price: r2(Math.min(...etf.slice(-cfg.multiWeekSessions))) }];
  return out;
}

// ─── Ideas: caps + dedupe (pure) ──────────────────────────────────────────

export interface IdeaCapState {
  /** Already emitted today on this horizon, keyed `${groupId}` → count. */
  perGroup: Record<string, number>;
  emittedToday: number;
  /** Open ideas in the book (any source) — symbol + direction. */
  open: Array<{ symbol: string; direction: string; source?: string | null }>;
  /** Symbols this engine already emitted today on this horizon. */
  emittedSymbols: Set<string>;
}

export function ideaCapCheck(horizon: IgnitionHorizon, groupId: string, symbol: string, side: Side, st: IdeaCapState, cfg = IGNITION_CFG.ideas): { ok: boolean; reason: string } {
  const perDay = cfg.perDay[horizon];
  if (perDay <= 0) return { ok: false, reason: `${horizon} emits watchlist/theme entries only — no auto trades` };
  if (st.emittedToday >= perDay) return { ok: false, reason: `daily cap ${perDay} for ${horizon} reached` };
  if ((st.perGroup[groupId] ?? 0) >= cfg.perGroupPerHorizon) return { ok: false, reason: `≤${cfg.perGroupPerHorizon} ideas per group per horizon per day` };
  if (st.emittedSymbols.has(symbol)) return { ok: false, reason: `${symbol} already emitted today on ${horizon}` };
  const clash = st.open.find((o) => o.symbol?.toUpperCase() === symbol && String(o.direction).toLowerCase() === side);
  if (clash) return { ok: false, reason: `${clash.source ?? 'another engine'} already has an open ${side} on ${symbol}` };
  return { ok: true, reason: 'ok' };
}

/**
 * Vehicle for an igniting group on a horizon: intraday → the best laggard if one
 * exists, else the ETF; daily/swing → laggards first (the catch-up), then the
 * top leader only for daily; weekly → none (watchlist only). ≤ perGroup names.
 */
export function ideaVehicles(g: GroupRead, cfg = IGNITION_CFG.ideas): string[] {
  if (g.stage !== 'igniting' || !g.side) return [];
  if (g.horizon === 'weekly') return [];
  const lag = g.laggards.map((l) => l.symbol);
  let v: string[];
  if (g.horizon === 'intraday') v = [...lag.slice(0, 1), g.etf];
  else if (g.horizon === 'daily') v = [...lag, ...g.leaders.map((l) => l.symbol).slice(0, 1)];
  else v = lag;
  return Array.from(new Set(v)).slice(0, cfg.perGroupPerHorizon);
}

/** Structural targets beyond entry: the first ≥ minRR becomes T1, the next T2. Never a fixed %. */
export function pickStructuralTargets(side: Side, entry: number, stop: number, cands: Array<{ price: number | null | undefined; label: string }>, minRR = 1): { t1: number; t2: number | null; t1Basis: string; rr: number } | null {
  const risk = Math.abs(entry - stop);
  if (!(risk > 0)) return null;
  const beyond = cands
    .filter((c): c is { price: number; label: string } => c.price != null && Number.isFinite(c.price) && c.price > 0 && (side === 'long' ? c.price > entry : c.price < entry))
    .sort((a, b) => (side === 'long' ? a.price - b.price : b.price - a.price));
  const idx = beyond.findIndex((c) => Math.abs(c.price - entry) / risk >= minRR);
  if (idx < 0) return null;
  const t1 = beyond[idx];
  const next = beyond.slice(idx + 1).find((c) => Math.abs(c.price - t1.price) / risk >= 0.25) ?? null;
  return { t1: r2(t1.price), t2: next ? r2(next.price) : null, t1Basis: t1.label, rr: r2(Math.abs(t1.price - entry) / risk) };
}

// ─── Event log shape (append-only jsonl) ──────────────────────────────────

export interface IgnitionEvent {
  at: string;
  horizon: IgnitionHorizon;
  kind: 'stage' | 'idea' | 'watchlist';
  groupId: string;
  etf: string;
  from: IgnitionStage | null;
  to: IgnitionStage;
  side: Side | null;
  etfPrice: number | null;
  etfMovePct: number | null;
  relPct: number | null;
  breadthPct: number | null;
  leaders: string[];
  laggards: string[];
  symbol?: string;
  ideaId?: string | null;
  note?: string;
  status: 'measuring';
}

/** Should a new read be logged? Stage changes always; the first read of a day only if ≥ stirring. */
export function shouldLogTransition(prev: { stage: IgnitionStage; dateKey: string } | undefined, next: GroupRead, dateKey: string): boolean {
  if (!prev) return STAGE_RANK[next.stage] >= 1;
  if (prev.dateKey !== dateKey) return STAGE_RANK[next.stage] >= 1 || prev.stage !== next.stage;
  return prev.stage !== next.stage;
}

/** Sort rows for display: igniting first, then stirring, extended, quiet; by points then |rel|. */
export function sortGroupReads(rows: GroupRead[]): GroupRead[] {
  const order: Record<IgnitionStage, number> = { igniting: 0, stirring: 1, extended: 2, quiet: 3 };
  return [...rows].sort((a, b) => order[a.stage] - order[b.stage] || b.points - a.points || Math.abs(b.relPct ?? 0) - Math.abs(a.relPct ?? 0));
}
