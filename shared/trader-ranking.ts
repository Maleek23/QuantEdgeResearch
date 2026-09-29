/**
 * Trader analysis + ranking (pure; no I/O, no clock unless passed in).
 *
 * Two kinds of evidence, never mixed up:
 *
 *   STATED   the trader's own P&L — only trades whose post states BOTH an
 *            entry and an exit (price, or a % the exit price is derived from).
 *            Returns are per-trade % on the stated entry, equal-weighted,
 *            because most posts state no size.
 *   MEASURED a call with no stated exit, scored on the UNDERLYING's price bars
 *            after the post time: reference = the open of the first bar that
 *            starts after the post (no look-ahead), then up to 5 trading bars
 *            (fewer if an option expires first). This is "measured on
 *            underlying", NOT the trader's P&L, and every surface says so.
 *
 * External traders' histories are shown with their dates. The platform's own
 * pre-2026-08-26 outcome invalidation (OUTCOME_BASELINE_DATE) is about the
 * PLATFORM's records and does not apply to these.
 */

// ─── Config (server may override from env — see server/trader-analysis.ts) ──

export interface TraderFeedConfig {
  /** Ranking score (0–100) a trader must reach for their calls to show in NEXUS. */
  minScore: number;
  /** Scored calls (stated + measured) needed before the score counts at all. */
  minSample: number;
  /** Only calls posted within this many trading days appear in NEXUS. */
  maxAgeTradingDays: number;
  /** Calls below this parse confidence never reach NEXUS. */
  minConfidence: number;
}

export const TRADER_FEED_DEFAULTS: TraderFeedConfig = { minScore: 55, minSample: 10, maxAgeTradingDays: 5, minConfidence: 0.6 };

/** Under this many scored trades a win rate is noise — every surface flags it. */
export const SMALL_SAMPLE = 20;
/** Trading bars after the post a measured call is scored over. */
export const MEASURE_BARS = 5;

// ─── Trading days ────────────────────────────────────────────

const nyDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });

function nyParts(ms: number): { day: string; weekday: string } {
  const parts = nyDate.formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, weekday: get('weekday') };
}

/**
 * Weekday sessions (New York) strictly after `fromMs`'s day up to and including
 * `toMs`'s day. Exchange holidays are not modelled — a holiday counts as a
 * session, which only makes the age window slightly shorter, never longer.
 */
export function tradingDaysBetween(fromMs: number, toMs: number): number {
  if (!(toMs > fromMs)) return 0;
  const start = nyParts(fromMs).day;
  const end = nyParts(toMs).day;
  let n = 0;
  // Step in 24h hops from noon UTC of the start day (DST-safe for day counting).
  let t = Date.parse(`${start}T16:00:00Z`);
  for (let i = 0; i < 4000; i++) {
    t += 86_400_000;
    const p = nyParts(t);
    if (p.day > end) break;
    if (p.weekday !== 'Sat' && p.weekday !== 'Sun') n++;
  }
  return n;
}

// ─── Measured on the underlying ──────────────────────────────

/** [time ms (bar start), open, high, low, close] */
export type BarRow = [number, number, number, number, number];

export interface MeasuredOutcome {
  basis: 'measured on underlying';
  /** Underlying price the call is measured from (open of the first bar after the post). */
  refPrice: number;
  refTime: number;
  /** Close of the last bar in the window vs the reference, signed for the call's side (+ = the call was right). */
  closePct: number;
  /** Best / worst excursion in the call's favour / against it over the window, %. */
  mfePct: number;
  maePct: number;
  bars: number;
  /** The whole window has printed (5 bars, or through expiry). */
  complete: boolean;
  /** Stock calls with a stated stop/target on the underlying: which printed first (same bar = stop, conservative). */
  hit: 'target' | 'stop' | null;
  /** Direction right at the end of the window (closePct > 0), or the target printed first. */
  correct: boolean;
}

/**
 * Score one call on the underlying's bars. `side` is the view on the
 * UNDERLYING: a bought call = long, a bought put = short, a shorted stock =
 * short. Returns null when no bar starts after the post (too recent / no data).
 */
export function measureOnUnderlying(
  bars: BarRow[],
  postMs: number,
  side: 'long' | 'short',
  opts: { maxBars?: number; expiryMs?: number | null; stop?: number | null; target?: number | null } = {},
): MeasuredOutcome | null {
  const maxBars = opts.maxBars ?? MEASURE_BARS;
  const sorted = [...bars].filter((b) => b.slice(1).every((v) => Number.isFinite(v) && v > 0)).sort((a, b) => a[0] - b[0]);
  const i0 = sorted.findIndex((b) => b[0] > postMs);
  if (i0 < 0) return null;
  const ref = sorted[i0][1];
  let win = sorted.slice(i0, i0 + maxBars);
  let expired = false;
  if (opts.expiryMs != null && Number.isFinite(opts.expiryMs)) {
    // An option's window ends at its expiry; the window is complete once a bar after expiry exists.
    win = win.filter((b) => b[0] <= opts.expiryMs!);
    expired = sorted.some((b) => b[0] > opts.expiryMs!);
  }
  if (!win.length) return null;
  const sgn = side === 'long' ? 1 : -1;
  const pct = (px: number) => ((px - ref) / ref) * 100 * sgn;
  let mfe = -Infinity, mae = Infinity;
  let hit: MeasuredOutcome['hit'] = null;
  const stop = opts.stop ?? null, target = opts.target ?? null;
  const levelsValid = stop != null && target != null && (side === 'long' ? stop < ref && target > ref : stop > ref && target < ref);
  for (const [, , h, l] of win) {
    const fav = side === 'long' ? h : l;
    const adv = side === 'long' ? l : h;
    mfe = Math.max(mfe, pct(fav));
    mae = Math.min(mae, pct(adv));
    if (levelsValid && !hit) {
      const stopHit = side === 'long' ? l <= stop! : h >= stop!;
      const tgtHit = side === 'long' ? h >= target! : l <= target!;
      if (stopHit) hit = 'stop';
      else if (tgtHit) hit = 'target';
    }
  }
  const closePct = pct(win[win.length - 1][4]);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return {
    basis: 'measured on underlying',
    refPrice: ref, refTime: sorted[i0][0],
    closePct: r2(closePct), mfePct: r2(mfe), maePct: r2(mae),
    bars: win.length,
    complete: win.length >= maxBars || expired,
    hit,
    correct: hit ? hit === 'target' : closePct > 0,
  };
}

/** The call's view on the underlying (a bought put is a short view). */
export function underlyingSide(t: { assetType: string; direction: string; optionType?: string | null }): 'long' | 'short' {
  if (t.assetType === 'option') {
    const view = t.optionType === 'put' ? 'short' : 'long';
    // A sold-to-open option inverts the view.
    return t.direction === 'short' ? (view === 'long' ? 'short' : 'long') : view;
  }
  return t.direction === 'short' ? 'short' : 'long';
}

// ─── Per-trader statistics ───────────────────────────────────

export interface RankTrade {
  id: string;
  symbol: string;
  assetType: string;
  direction: string;
  optionType?: string | null;
  setupType?: string | null;
  status: string;
  entryPrice: number;
  exitPrice?: number | null;
  stop?: number | null;
  entryTime: string;
  exitTime?: string | null;
  holdingMinutes?: number | null;
  /** Stated result, % on the stated entry (null unless both entry and exit are stated). */
  pnlPct?: number | null;
  confidence?: number | null;
  measured?: MeasuredOutcome | null;
}

export interface GroupStat { key: string; n: number; winRate: number; avgPct: number }

export interface TraderStats {
  /** Trades with a stated entry AND exit. */
  stated: {
    n: number; wins: number; losses: number; winRate: number | null; avgPct: number | null;
    /** Mean R where a stop on the risk side of the entry was stated; n = how many had one. */
    avgR: number | null; rN: number;
    /** Σ winning % / |Σ losing %| on equal-weighted per-trade returns. */
    profitFactor: number | null;
    avgHoldMinutes: number | null;
    smallSample: boolean;
  };
  /** Calls without a stated exit, measured on the underlying. */
  measured: { n: number; correct: number; hitRate: number | null; avgClosePct: number | null; pending: number; smallSample: boolean };
  open: number;
  bestSetups: GroupStat[];
  bestTickers: GroupStat[];
  firstAt: string | null;
  lastAt: string | null;
  /** 0–100, see rankScore. null when there is nothing scored. */
  score: number | null;
  sample: number;
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** Stated R: (exit − entry) / (entry − stop), sign by side; null unless the stop is on the risk side. */
export function statedR(t: Pick<RankTrade, 'direction' | 'entryPrice' | 'exitPrice' | 'stop'>): number | null {
  if (t.exitPrice == null || t.stop == null) return null;
  const long = t.direction !== 'short';
  const risk = long ? t.entryPrice - t.stop : t.stop - t.entryPrice;
  if (!(risk > 0)) return null;
  return r2(((long ? t.exitPrice - t.entryPrice : t.entryPrice - t.exitPrice) / risk));
}

function groupStats(rows: RankTrade[], keyOf: (t: RankTrade) => string | null | undefined): GroupStat[] {
  const g = new Map<string, number[]>();
  for (const t of rows) {
    const k = keyOf(t);
    if (!k || t.pnlPct == null) continue;
    g.set(k, [...(g.get(k) ?? []), t.pnlPct]);
  }
  return [...g.entries()]
    .map(([key, xs]) => ({ key, n: xs.length, winRate: r2((xs.filter((x) => x > 0).length / xs.length) * 100), avgPct: r2(mean(xs)!) }))
    .filter((s) => s.n >= 2)
    .sort((a, b) => b.avgPct - a.avgPct || b.n - a.n)
    .slice(0, 5);
}

/**
 * Ranking score, 0–100: the mean of the available components, each a win
 * rate shrunk toward 50% by 5 phantom trades (so 3/3 is 68, not 100):
 *   stated   (wins + 2.5) / (n + 5)
 *   measured (correct + 2.5) / (m + 5)
 */
export function rankScore(stated: { n: number; wins: number }, measured: { n: number; correct: number }): number | null {
  const parts: number[] = [];
  if (stated.n > 0) parts.push((stated.wins + 2.5) / (stated.n + 5));
  if (measured.n > 0) parts.push((measured.correct + 2.5) / (measured.n + 5));
  return parts.length ? Math.round(mean(parts)! * 1000) / 10 : null;
}

export function traderStats(rows: RankTrade[]): TraderStats {
  const closed = rows.filter((t) => t.status === 'closed' && t.pnlPct != null);
  const wins = closed.filter((t) => t.pnlPct! > 0).length;
  const losses = closed.filter((t) => t.pnlPct! < 0).length;
  const pos = closed.filter((t) => t.pnlPct! > 0).reduce((s, t) => s + t.pnlPct!, 0);
  const neg = closed.filter((t) => t.pnlPct! < 0).reduce((s, t) => s + t.pnlPct!, 0);
  const rs = closed.map(statedR).filter((x): x is number => x != null);
  const holds = closed.map((t) => t.holdingMinutes).filter((x): x is number => x != null && x >= 0);
  const openRows = rows.filter((t) => t.status !== 'closed');
  const measuredDone = openRows.filter((t) => t.measured && t.measured.complete);
  const measuredCorrect = measuredDone.filter((t) => t.measured!.correct).length;
  const times = rows.map((t) => t.entryTime).filter(Boolean).sort();
  const stated = {
    n: closed.length, wins, losses,
    winRate: closed.length ? r2((wins / closed.length) * 100) : null,
    avgPct: closed.length ? r2(mean(closed.map((t) => t.pnlPct!))!) : null,
    avgR: rs.length ? r2(mean(rs)!) : null, rN: rs.length,
    profitFactor: neg < 0 ? r2(pos / Math.abs(neg)) : null,
    avgHoldMinutes: holds.length ? Math.round(mean(holds)!) : null,
    smallSample: closed.length < SMALL_SAMPLE,
  };
  const measured = {
    n: measuredDone.length, correct: measuredCorrect,
    hitRate: measuredDone.length ? r2((measuredCorrect / measuredDone.length) * 100) : null,
    avgClosePct: measuredDone.length ? r2(mean(measuredDone.map((t) => t.measured!.closePct))!) : null,
    pending: openRows.filter((t) => t.measured && !t.measured.complete).length,
    smallSample: measuredDone.length < SMALL_SAMPLE,
  };
  return {
    stated, measured,
    open: openRows.length,
    bestSetups: groupStats(closed, (t) => t.setupType ?? null),
    bestTickers: groupStats(closed, (t) => t.symbol),
    firstAt: times[0] ?? null,
    lastAt: times[times.length - 1] ?? null,
    score: rankScore(stated, measured),
    sample: stated.n + measured.n,
  };
}

export interface LeaderRow { slug: string; name: string; stats: TraderStats; passes: boolean; rank: number | null }

/** Traders ordered by score (unscored last); `passes` = eligible for the NEXUS feed. */
export function rankTraders(list: { slug: string; name: string; stats: TraderStats }[], cfg: TraderFeedConfig = TRADER_FEED_DEFAULTS): LeaderRow[] {
  const passes = (s: TraderStats) => s.score != null && s.score >= cfg.minScore && s.sample >= cfg.minSample;
  const sorted = [...list].sort((a, b) => (b.stats.score ?? -1) - (a.stats.score ?? -1) || b.stats.sample - a.stats.sample || a.slug.localeCompare(b.slug));
  let r = 0;
  return sorted.map((x) => ({ ...x, passes: passes(x.stats), rank: x.stats.score == null ? null : ++r }));
}

/** A NEXUS-eligible call: open, recent enough, confident enough, from a passing trader. */
export function feedEligible(
  t: { status: string; entryTime: string; confidence?: number | null },
  traderPasses: boolean,
  nowMs: number,
  cfg: TraderFeedConfig = TRADER_FEED_DEFAULTS,
): boolean {
  if (!traderPasses || t.status === 'closed') return false;
  const at = Date.parse(t.entryTime);
  if (!Number.isFinite(at) || at > nowMs) return false;
  if ((t.confidence ?? 0) < cfg.minConfidence) return false;
  return tradingDaysBetween(at, nowMs) <= cfg.maxAgeTradingDays;
}

/** "2h ago", "3d ago" — every trader call carries its age. */
export function ageLabel(iso: string, nowMs: number): string {
  const m = Math.round((nowMs - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(m) || m < 0) return 'time unknown';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}
