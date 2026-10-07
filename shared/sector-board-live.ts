/**
 * SECTOR BOARD — LIVE PASS, pure core (no I/O). Server half: server/sector-board.ts.
 * ================================================================================
 * The heavy board run (every 15 min) reads daily bars, flow, levels, gamma, ideas.
 * Between those runs this quotes-only pass (every 5 min in session) re-prices the
 * board from one batch of member quotes — no daily-bar refetch — and keeps a
 * bounded in-day ring so the page can show motion that is real:
 *
 *   today        equal-weight mean of member (price / prior close − 1)
 *   since open   equal-weight mean of (price / today's regular open − 1)   session
 *   last 30m     equal-weight mean of (price / price ~30 min earlier − 1)  session
 *   pre-mkt      median member pre-market move vs the prior close           pre-market
 *   after-hrs    median member after-hours move vs the regular close       after hours
 *   breadth      members up / down vs the prior close; above / below VWAP
 *   intraday rank  sectors ranked by `today` (≥ minMembersRead quoted)
 *   live composite rank  the board's composite recomputed with today's column
 *                re-priced from these quotes (completed sessions untouched)
 *   ring         one point per pass: today % (spark), composite + intraday rank
 *
 * Nothing is carried: a member without a quote this pass is not read this pass.
 */
import {
  BOARD_CFG, computeCore, mean, median, r2, ranksOf, type BoardGroup, type BoardPhase, type Regime, type SectorRow,
} from './sector-board';

export const LIVE_CFG = {
  /** Ring bound — 08:00–20:00 at 5–10 min passes fits well inside this. */
  maxPoints: 120,
  /** Rank-change lookbacks shown as arrows. */
  lookbackMin: [15, 30] as const,
} as const;

/** The subset of a pre-market-service snapshot the live pass reads. */
export interface LiveQuote {
  price: number | null;
  prevClose: number | null;
  open: number | null;
  vwap: number | null;
  p30: number | null;
  preGapPct: number | null;
  postMovePct: number | null;
  /** Regular-session close/price (after the bell this is today's close). */
  regular: number | null;
  at: string | null;
}

/** What the heavy run leaves behind for the live pass: completed sessions only. */
export interface LiveBase {
  asOf: string;
  dateKey: string;
  /** Completed sessions oldest → newest (never today's forming bar). */
  dates: string[];
  series: Map<string, number[]>;
  groups: BoardGroup[];
}

export interface LivePoint { t: string; phase: BoardPhase }

export interface SectorLive {
  quoted: number; total: number;
  today: number | null; sinceOpen: number | null; last30m: number | null;
  preMkt: number | null; afterHrs: number | null;
  up: number; down: number; aboveVwap: number | null; vwapRead: number;
  /** Intraday rank by `today`; at the first session pass; 15 / 30 min ago. */
  irank: number | null; irankOpen: number | null; irank15: number | null; irank30: number | null;
  /** Live composite rank (completed sessions + today re-priced); 15 / 30 min ago. */
  rank: number | null; rank15: number | null; rank30: number | null;
  composite: number | null;
  r1: number | null; r3: number | null; r10: number | null; r20: number | null;
  breadth: number | null; rs: number | null; regime: Regime | null;
  /** Ring, aligned with BoardLive.points: today %, composite rank, intraday rank. */
  spark: Array<number | null>;
  ranks: Array<number | null>;
  iranks: Array<number | null>;
}

export interface BoardLive {
  asOf: string;
  dateKey: string;
  phase: BoardPhase;
  /** Newest quote time read this pass (the data's own time, not the run's). */
  quotesAt: string | null;
  quoted: number;
  total: number;
  /** asOf of the heavy snapshot whose completed sessions this pass re-priced (null = quotes-only). */
  base: string | null;
  points: LivePoint[];
  sectors: Record<string, SectorLive>;
  notes: string[];
  compute: { ms: number; heapDeltaMb: number; rssMb: number };
  status: 'measuring';
}

const fin = (x: number | null | undefined): x is number => typeof x === 'number' && Number.isFinite(x);
const pctOf = (a: number | null, b: number | null) => (fin(a) && fin(b) && b > 0 ? (a / b - 1) * 100 : null);
const n2 = (x: number | null) => (x == null ? null : r2(x));

/** Rank at the newest ring point at or before `cutoffMs` (null when the ring does not reach back that far). */
export function rankAgo(points: LivePoint[], ranks: Array<number | null>, cutoffMs: number): number | null {
  for (let i = points.length - 1; i >= 0; i--) {
    if (Date.parse(points[i].t) <= cutoffMs) return ranks[i] ?? null;
  }
  return null;
}

export interface LiveInput {
  nowMs: number;
  dateKey: string;
  phase: BoardPhase;
  groups: BoardGroup[];
  quotes: Map<string, LiveQuote>;
  base: LiveBase | null;
  prev: BoardLive | null;
}

export function computeLive(inp: LiveInput, cfg = BOARD_CFG): Omit<BoardLive, 'compute'> {
  const { groups, quotes, phase } = inp;
  const notes: string[] = [];
  const base = inp.base && inp.base.dates.length >= cfg.minBars && inp.base.dates[inp.base.dates.length - 1] < inp.dateKey ? inp.base : null;
  const prev = inp.prev && inp.prev.dateKey === inp.dateKey ? inp.prev : null;
  const inSession = phase === 'session' || phase === 'close';

  // Prior close: the last completed daily bar when the heavy run left one, else the quote's.
  const prevCloseOf = (sym: string, q: LiveQuote): number | null => {
    const s = base?.series.get(sym);
    const b = s ? s[s.length - 1] : NaN;
    return fin(b) && b > 0 ? b : fin(q.prevClose) && q.prevClose > 0 ? q.prevClose : null;
  };
  const nowPx = (q: LiveQuote): number | null => {
    if (phase === 'close') return fin(q.regular) ? q.regular : q.price;
    return q.price;
  };

  // 1. per-sector quote reads
  const perSector = groups.map((g) => {
    const today: number[] = []; const since: number[] = []; const l30: number[] = []; const pre: number[] = []; const post: number[] = [];
    let up = 0; let down = 0; let above = 0; let vwapRead = 0; let quoted = 0;
    for (const m of g.members) {
      const q = quotes.get(m);
      if (!q) continue;
      const px = nowPx(q);
      const t = pctOf(px, prevCloseOf(m, q));
      if (t != null) { quoted++; today.push(t); if (t > 0) up++; else if (t < 0) down++; }
      if (inSession) {
        const so = pctOf(px, q.open); if (so != null) since.push(so);
        const p3 = pctOf(px, q.p30); if (p3 != null) l30.push(p3);
        if (fin(q.vwap) && fin(px)) { vwapRead++; if (px > q.vwap) above++; }
      }
      if (fin(q.preGapPct)) pre.push(q.preGapPct);
      if (fin(q.postMovePct)) post.push(q.postMovePct);
    }
    return {
      quoted, total: g.members.length,
      today: today.length >= cfg.minMembersRead ? mean(today) : null,
      sinceOpen: since.length >= cfg.minMembersRead ? mean(since) : null,
      last30m: l30.length >= cfg.minMembersRead ? mean(l30) : null,
      preMkt: phase === 'premarket' && pre.length ? median(pre) : null,
      afterHrs: (phase === 'after_hours' || phase === 'closed') && post.length ? median(post) : null,
      up, down, aboveVwap: vwapRead ? above : null, vwapRead,
    };
  });
  const iranks = ranksOf(perSector.map((s) => s.today));

  // 2. live composite: completed sessions + today's column priced from these quotes
  let core: ReturnType<typeof computeCore> | null = null;
  if (base && inSession) {
    const dates = [...base.dates, inp.dateKey];
    const series = new Map<string, number[]>();
    let priced = 0;
    for (const [sym, arr] of base.series) {
      const q = quotes.get(sym);
      const px = q ? nowPx(q) : null;
      if (fin(px) && px > 0) priced++;
      series.set(sym, [...arr, fin(px) && px > 0 ? px : NaN]);
    }
    const spy = series.get('SPY');
    if (spy && fin(spy[spy.length - 1])) {
      core = computeCore({ dates, spy, closes: series, groups }, cfg);
    } else notes.push('SPY not quoted this pass — live composite rank not recomputed');
    if (!priced) notes.push('no member quoted this pass');
  } else if (inSession && !base) {
    notes.push('completed-session bars not in memory yet (worker restarted) — composite rank stays at the last board run until the next 15-min recompute');
  }

  // 3. ring
  const t = new Date(inp.nowMs).toISOString();
  const points = [...(prev?.points ?? []), { t, phase }];
  const drop = Math.max(0, points.length - LIVE_CFG.maxPoints);
  const sectors: Record<string, SectorLive> = {};
  groups.forEach((g, gi) => {
    const s = perSector[gi];
    const c = core?.sectors[gi] ?? null;
    const p = prev?.sectors[g.id];
    const ring = <T,>(old: Array<T | null> | undefined, v: T | null) => {
      const a = [...(old ?? []), v];
      while (a.length < points.length) a.unshift(null); // a sector new to the ring
      return a.slice(drop);
    };
    const spark = ring(p?.spark, n2(s.today));
    const ranks = ring(p?.ranks, c?.rank ?? null);
    const ir = ring(p?.iranks, iranks[gi]);
    sectors[g.id] = {
      quoted: s.quoted, total: s.total,
      today: n2(s.today), sinceOpen: n2(s.sinceOpen), last30m: n2(s.last30m), preMkt: n2(s.preMkt), afterHrs: n2(s.afterHrs),
      up: s.up, down: s.down, aboveVwap: s.aboveVwap, vwapRead: s.vwapRead,
      irank: iranks[gi], irankOpen: null, irank15: null, irank30: null,
      rank: c?.rank ?? null, rank15: null, rank30: null, composite: c?.composite ?? null,
      r1: c?.stats.r1 ?? null, r3: c?.stats.r3 ?? null, r10: c?.stats.r10 ?? null, r20: c?.stats.r20 ?? null,
      breadth: c?.stats.breadth ?? null, rs: c?.stats.rs ?? null, regime: c?.regime ?? null,
      spark, ranks, iranks: ir,
    };
  });
  const pts = points.slice(drop);
  const firstSess = pts.findIndex((x) => x.phase === 'session');
  for (const g of groups) {
    const x = sectors[g.id];
    // lookbacks exclude the point just added
    const older = pts.slice(0, -1);
    x.rank15 = rankAgo(older, x.ranks, inp.nowMs - LIVE_CFG.lookbackMin[0] * 60_000);
    x.rank30 = rankAgo(older, x.ranks, inp.nowMs - LIVE_CFG.lookbackMin[1] * 60_000);
    x.irank15 = rankAgo(older, x.iranks, inp.nowMs - LIVE_CFG.lookbackMin[0] * 60_000);
    x.irank30 = rankAgo(older, x.iranks, inp.nowMs - LIVE_CFG.lookbackMin[1] * 60_000);
    x.irankOpen = firstSess >= 0 ? x.iranks[firstSess] ?? null : null;
  }

  let quotesAt: string | null = null; let quoted = 0;
  for (const q of quotes.values()) { if (q.price != null || q.preGapPct != null) quoted++; if (q.at && (!quotesAt || q.at > quotesAt)) quotesAt = q.at; }
  const symbols = new Set(groups.flatMap((g) => g.members));
  return {
    asOf: t, dateKey: inp.dateKey, phase, quotesAt, quoted, total: symbols.size, base: base?.asOf ?? null,
    points: pts, sectors, notes, status: 'measuring',
  };
}

/**
 * Lay a live pass over the board rows (same dateKey only, never older than the
 * board): today's numbers and the live composite rank replace the 15-min ones,
 * the rank-flow's provisional today* point moves with them, rows re-sort.
 */
export function applyLive<T extends Pick<SectorRow, 'id' | 'rank' | 'rankThen' | 'rankDelta' | 'composite' | 'r1' | 'r3' | 'r10' | 'r20' | 'breadth' | 'rs' | 'regime' | 'history'>>(
  board: { asOf: string; dateKey: string; provisional: { date: string } | null; sectors: T[] },
  live: BoardLive | null,
): { sectors: Array<T & { live: SectorLive | null }>; applied: boolean } {
  const ok = !!live && live.dateKey === board.dateKey && live.asOf >= board.asOf;
  if (!ok) return { sectors: board.sectors.map((s) => ({ ...s, live: null })), applied: false };
  const out = board.sectors.map((s) => {
    const l = live!.sectors[s.id] ?? null;
    if (!l) return { ...s, live: null };
    const row = { ...s, live: l };
    if (l.rank != null && live!.base) {
      const hist = [...s.history];
      const lastH = hist[hist.length - 1];
      if (lastH && lastH.date === board.dateKey) hist[hist.length - 1] = { date: lastH.date, rank: l.rank, score: l.composite };
      row.history = hist;
      row.rank = l.rank; row.composite = l.composite;
      row.rankDelta = row.rankThen != null ? row.rankThen - l.rank : null;
      row.r1 = l.r1; row.r3 = l.r3; row.r10 = l.r10; row.r20 = l.r20; row.breadth = l.breadth; row.rs = l.rs; row.regime = l.regime;
    }
    return row;
  });
  out.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  return { sectors: out, applied: true };
}
