/**
 * Loss analysis — WHY each losing trade lost, measured from real price bars.
 *
 * Pure functions (no React, no fetch) so scripts/test-journal.ts can pin every
 * rule. The page is pages/journal/loss-view.tsx; bars come from the same
 * /api/historical-prices feed the trade page charts (use-loss-bars.ts).
 *
 * What is measured, per closed trade, on the UNDERLYING (options included —
 * no option-premium bars exist in the feed, so premium paths are never
 * invented; the premium result is the ledger's):
 *   · MFE / MAE — best / worst excursion in the thesis direction while held,
 *     in % of the entry reference and in R when the plan has a usable stop
 *     (R = |entry − stop| on the underlying).
 *   · time to MFE / MAE, whether the idea was ever meaningfully in profit,
 *     the underlying's move at the exit, whether the stop / target printed.
 *   · after the exit, up to the trade's horizon (option expiry, else exit +
 *     max(hold, 5 days)): the best move our way and whether the target printed.
 *   · timing: stamped outside regular hours (09:30–16:00 ET, weekdays), the
 *     first bar's gap against the entry, and entering after the trigger.
 *
 * Every loss gets ONE primary class (first rule that fires, in LOSS_CLASSES
 * order) plus every other rule that fired as a flag. No bars → 'unknown',
 * never a guess.
 */

export interface Bar { time: number; open: number; high: number; low: number; close: number }
/** Hourly bars (extended hours included) and daily bars for one symbol; null = the feed had none. */
export interface SymbolBars { h1?: Bar[] | null; d1?: Bar[] | null }

/** The subset of a journal row the analysis reads (JournalTradeRow satisfies it). */
export interface LossRow {
  id: string;
  symbol: string;
  assetType: string;
  direction: string;
  optionType?: string | null;
  expiryDate?: string | null;
  entryPrice: number;
  exitPrice?: number | null;
  entryTime: string;
  exitTime?: string | null;
  holdingMinutes?: number | null;
  realizedPnL?: number | null;
  realizedPnLPercent?: number | null;
  status: string;
  notes?: string | null;
  setupType?: string | null;
}

// ─── thresholds (every rule's number lives here and in its text) ──────────

export const LOSS_RULES = {
  /** "never in profit": best excursion below this. */
  NEVER_R: 0.2,
  NEVER_PCT: 0.003,
  /** "gave back a winner": best excursion at least this. */
  GIVEBACK_R: 1,
  GIVEBACK_PCT: 0.02,
  /** "stop too tight": after the stop, the underlying went at least this far our way (or printed the target). */
  TIGHT_AFTER_R: 1,
  TIGHT_AFTER_PCT: 0.02,
  /** "theta/decay": underlying at the exit no worse than this (flat or right). */
  THETA_FLAT_PCT: -0.0025,
  /** "late entry": first bar after an out-of-hours stamp opened this far against the entry. */
  LATE_GAP_R: 0.25,
  LATE_GAP_PCT: 0.005,
  /** "entered after the trigger": price at the stamp already this far past the plan entry, our way. */
  CHASE_R: 0.25,
  CHASE_PCT: 0.005,
  /** A plan level is an underlying price only if within this fraction of the entry reference (bot option stops are premiums). */
  LEVEL_BAND: 0.4,
  /** Post-exit horizon for non-options: exit + max(hold, this). */
  STOCK_HORIZON_MS: 5 * 86_400_000,
} as const;

export type LossClass = 'unknown' | 'gave_back' | 'stop_tight' | 'late_entry' | 'theta' | 'target_far' | 'wrong_direction' | 'normal';

/** Primary-class order = the precedence the classifier applies. */
export const LOSS_CLASSES: readonly { id: LossClass; label: string; rule: string; lesson: string }[] = [
  {
    id: 'unknown', label: 'Unknown (no bars)',
    rule: 'The price feed had no bars covering the trade (symbol not served, or older than the feed reaches). Not classified — never guessed.',
    lesson: 'Nothing to learn until the bars exist.',
  },
  {
    id: 'gave_back', label: 'Gave back a winner',
    rule: `Best excursion while held ≥ ${LOSS_RULES.GIVEBACK_R}R (≥ ${LOSS_RULES.GIVEBACK_PCT * 100}% of entry when there is no usable stop), yet the trade closed at a loss.`,
    lesson: 'Take partials / move the stop to break-even once +1R prints.',
  },
  {
    id: 'stop_tight', label: 'Stop too tight',
    rule: `Exited at the stop (recorded exit reason, or the stop printed when no reason is recorded), then before the horizon (option expiry, else exit + max(hold, 5d)) the underlying printed the target or went ≥ ${LOSS_RULES.TIGHT_AFTER_R}R our way from the entry (≥ ${LOSS_RULES.TIGHT_AFTER_PCT * 100}% without a stop).`,
    lesson: 'The thesis was right and the stop was inside the noise — size down and widen it (ATR-based).',
  },
  {
    id: 'late_entry', label: 'Late / after-hours entry',
    rule: `Stamped outside 09:30–16:00 ET (or a weekend) and the first bar after the stamp opened ≥ ${LOSS_RULES.LATE_GAP_R}R against the entry (≥ ${LOSS_RULES.LATE_GAP_PCT * 100}% without a stop) — the loss was in the price before a fill was possible.`,
    lesson: 'Do not publish/enter off a stale close; re-price at the open or skip.',
  },
  {
    id: 'theta', label: 'Theta / decay',
    rule: `Option trade: the underlying was flat or moved the right way at the exit (thesis-direction move ≥ ${LOSS_RULES.THETA_FLAT_PCT * 100}%), yet the premium lost money — time decay / IV crush, not direction.`,
    lesson: 'More time (DTE) or less premium: spreads, or stock instead of the option.',
  },
  {
    id: 'target_far', label: 'Target too far',
    rule: 'Neither the stop nor the target printed while held and the trade was closed without hitting either (expired / time exit) — the target was beyond what the market gave inside the horizon.',
    lesson: 'Targets the move can reach in the horizon (ATR × days), or a longer horizon.',
  },
  {
    id: 'wrong_direction', label: 'Wrong direction',
    rule: `Never meaningfully in profit: best excursion < ${LOSS_RULES.NEVER_R}R (< ${LOSS_RULES.NEVER_PCT * 100}% without a stop) from the entry to the exit.`,
    lesson: 'The read itself was wrong — check which source / setup produces these.',
  },
  {
    id: 'normal', label: 'Ordinary loss',
    rule: `None of the above: it was in profit, but by less than ${LOSS_RULES.GIVEBACK_R}R, then went against and closed red.`,
    lesson: 'Cost of doing business at this win rate — judge in aggregate.',
  },
];

export const LOSS_CLASS_LABEL: Record<LossClass, string> = Object.fromEntries(LOSS_CLASSES.map((c) => [c.id, c.label])) as Record<LossClass, string>;

export type LossFlag =
  | 'outside_rth' | 'chased' | 'never_in_profit' | 'gave_back' | 'stop_tight' | 'late_gap' | 'theta' | 'target_far'
  | 'target_after_exit' | 'stop_printed' | 'coarse_bars';

export const LOSS_FLAG_LABEL: Record<LossFlag, string> = {
  outside_rth: 'stamped outside RTH',
  chased: 'entered after the trigger',
  never_in_profit: 'never in profit',
  gave_back: 'was ≥1R up',
  stop_tight: 'stopped, then worked',
  late_gap: 'gapped against before a fill',
  theta: 'underlying right, premium lost',
  target_far: 'expired between stop and target',
  target_after_exit: 'target printed after the exit',
  stop_printed: 'stop printed',
  coarse_bars: 'daily bars only',
};

// ─── context parsed from the row ───────────────────────────────────────────

export type ExitCat = 'stop' | 'target' | 'expired' | 'other' | 'not recorded';

export interface TradeContext {
  id: string;
  symbol: string;
  isOption: boolean;
  /** Direction of the thesis on the UNDERLYING (a bought put is short the underlying). */
  thesis: 'long' | 'short';
  entryMs: number;
  exitMs: number | null;
  pnl: number | null;
  /** The ledger's % result (premium % for options), as a fraction. */
  resultPct: number | null;
  /** Plan levels as recorded (may be premiums for bot options — validated against the bars later). */
  planEntry: number | null;
  stop: number | null;
  target: number | null;
  source: string;
  exitCat: ExitCat;
  exitRaw: string;
  conviction: string | null;
  dte: number | null;
  expiryMs: number | null;
  hourET: number;
  minuteET: number;
  weekdayET: string;
  outsideRTH: boolean;
  holdMs: number | null;
  instrument: string;
}

const num = (s: string | undefined) => {
  if (s == null) return null;
  const v = Number(s.replace(/,/g, ''));
  return Number.isFinite(v) && v > 0 ? v : null;
};

const ET = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });

/** New York weekday / hour / minute of an instant. */
export function etParts(ms: number): { weekday: string; hour: number; minute: number } {
  const parts = ET.formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { weekday: get('weekday'), hour: Number(get('hour')) % 24, minute: Number(get('minute')) };
}

export function isOutsideRTH(ms: number): boolean {
  const { weekday, hour, minute } = etParts(ms);
  if (weekday === 'Sat' || weekday === 'Sun') return true;
  const m = hour * 60 + minute;
  return m < 9 * 60 + 30 || m >= 16 * 60;
}

/** Normalise a recorded exit reason (desk "outcome: hit_stop (…)", bot "Exit: …"). */
export function exitCategory(raw: string): ExitCat {
  const s = raw.toLowerCase();
  if (!s.trim()) return 'not recorded';
  if (/stop|stopped|sl\b/.test(s)) return 'stop';
  if (/target|take[_ ]?profit|\btp\b|hit_t/.test(s)) return 'target';
  if (/expir|time|max[_ ]?hold|eod|end of day|stale|timeout|horizon/.test(s)) return 'expired';
  return 'other';
}

export function tradeContext(row: LossRow): TradeContext {
  const notes = row.notes ?? '';
  const isOption = row.assetType === 'option';
  const ot = (row.optionType ?? '').toLowerCase();
  const thesis: 'long' | 'short' = isOption && (ot === 'put' || ot === 'call')
    ? (ot === 'put' ? 'short' : 'long')
    : row.direction === 'short' ? 'short' : 'long';
  const entryMs = Date.parse(row.entryTime);
  const exitMs = row.exitTime ? Date.parse(row.exitTime) : null;
  const planEntry = num(notes.match(/\bplan:\s*entry\s*\$?([\d,]+(?:\.\d+)?)/i)?.[1]);
  const stop = num(notes.match(/\bstop(?:\s*loss)?\s*[:=]?\s*\$?([\d,]+(?:\.\d+)?)/i)?.[1]);
  const target = num(notes.match(/\b(?:target|t1)\s*[:=]?\s*\$?([\d,]+(?:\.\d+)?)/i)?.[1]);
  const deskOutcome = notes.match(/\boutcome:\s*([a-z_]+)(?:\s*\(([^)]*)\))?/i);
  const botExit = notes.match(/^Exit:\s*(.+)$/im);
  const botRaw = botExit && !/not recorded/i.test(botExit[1]) ? botExit[1].trim() : '';
  const exitRaw = deskOutcome ? `${deskOutcome[1]}${deskOutcome[2] ? ` (${deskOutcome[2]})` : ''}` : botRaw;
  // The desk's outcome status is the category; its parenthesised reason is prose.
  const exitCat = exitCategory(deskOutcome ? deskOutcome[1] : botRaw);
  const conviction = notes.match(/conviction band at publish:\s*([^\s\n]+)/i)?.[1] ?? null;
  const expiryMs = isOption && row.expiryDate ? Date.parse(`${row.expiryDate.slice(0, 10)}T20:00:00Z`) : null;
  const entryDay = Number.isFinite(entryMs) ? Date.parse(new Date(entryMs).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })) : NaN;
  const dte = expiryMs != null && Number.isFinite(entryDay) ? Math.round((Date.parse(row.expiryDate!.slice(0, 10)) - entryDay) / 86_400_000) : null;
  const p = Number.isFinite(entryMs) ? etParts(entryMs) : { weekday: '—', hour: 0, minute: 0 };
  const holdMs = row.holdingMinutes != null ? row.holdingMinutes * 60_000 : exitMs != null ? Math.max(0, exitMs - entryMs) : null;
  const closed = row.status !== 'open' && row.realizedPnL != null && Number.isFinite(Number(row.realizedPnL));
  return {
    id: row.id,
    symbol: row.symbol,
    isOption,
    thesis,
    entryMs,
    exitMs,
    pnl: closed ? Number(row.realizedPnL) : null,
    resultPct: closed && row.realizedPnLPercent != null && Number.isFinite(Number(row.realizedPnLPercent)) ? Number(row.realizedPnLPercent) / 100 : null,
    planEntry,
    stop,
    target,
    source: row.setupType?.trim() || 'not recorded',
    exitCat,
    exitRaw: exitRaw || 'not recorded',
    conviction,
    dte,
    expiryMs,
    hourET: p.hour,
    minuteET: p.minute,
    weekdayET: p.weekday,
    outsideRTH: Number.isFinite(entryMs) ? isOutsideRTH(entryMs) : false,
    holdMs: holdMs != null && Number.isFinite(holdMs) ? holdMs : null,
    instrument: isOption ? (ot === 'put' ? 'put option' : ot === 'call' ? 'call option' : 'option') : (row.assetType || 'stock'),
  };
}

// ─── bars → excursions ─────────────────────────────────────────────────────

const DAY_SESSION_MS = 6.5 * 3_600_000;

/** When each bar ends: the next bar's start, capped at the bar's nominal length. */
function barEnds(bars: Bar[], kind: 'h1' | 'd1'): number[] {
  const nominal = kind === 'h1' ? 3_600_000 : DAY_SESSION_MS;
  return bars.map((b, i) => Math.min(b.time + nominal, i + 1 < bars.length ? bars[i + 1].time : Infinity));
}

/** ATR(14) from daily bars that closed before `ms`; null with fewer than 5 bars. */
export function atrBefore(d1: Bar[] | null | undefined, ms: number, period = 14): number | null {
  if (!d1?.length) return null;
  const prior = d1.filter((b) => b.time + DAY_SESSION_MS <= ms);
  if (prior.length < 5) return null;
  const tail = prior.slice(-(period + 1));
  const trs: number[] = [];
  for (let i = 1; i < tail.length; i++) {
    const pc = tail[i - 1].close, b = tail[i];
    trs.push(Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc)));
  }
  return trs.length ? trs.reduce((s, v) => s + v, 0) / trs.length : null;
}

export interface TradeAnalysis {
  ctx: TradeContext;
  /** Which bars were used; null = none covered the trade. */
  barKind: 'h1' | 'd1' | null;
  barsInTrade: number;
  /** Underlying entry reference (plan entry, else the fill for stock, else the bar at the stamp). */
  ref: number | null;
  /** 1R in underlying price units (plan stop distance) — null without a usable stop. */
  risk: number | null;
  /** Usable plan levels on the underlying (null when absent or not an underlying price). */
  stop: number | null;
  target: number | null;
  mfePct: number | null;
  maePct: number | null;
  mfeR: number | null;
  maeR: number | null;
  tMfeMs: number | null;
  tMaeMs: number | null;
  /** Thesis-direction underlying move entry→exit, fraction. */
  moveAtExitPct: number | null;
  stopPrinted: boolean;
  targetPrinted: boolean;
  /** After the exit, to the horizon: best move our way from the entry reference. */
  postFavPct: number | null;
  postFavR: number | null;
  targetAfterExit: boolean;
  horizonMs: number | null;
  /** First bar after the stamp: open vs the entry reference, thesis direction (negative = against). */
  gapPct: number | null;
  gapR: number | null;
  /** Price at the stamp vs the plan entry, thesis direction (positive = already past the trigger). */
  chasePct: number | null;
  atr: number | null;
  cls: LossClass | null;
  flags: LossFlag[];
}

const dirSign = (thesis: 'long' | 'short') => (thesis === 'long' ? 1 : -1);

/** Pick the series that covers the entry: hourly first, then daily. */
function pickSeries(bars: SymbolBars | undefined, entryMs: number): { kind: 'h1' | 'd1'; bars: Bar[] } | null {
  // A series covers the entry when its first bar is no later than the next
  // session after it (weekend / overnight stamps) and it reaches past it.
  const SLACK = 3.5 * 86_400_000;
  const h1 = bars?.h1;
  if (h1 && h1.length > 1 && h1[0].time <= entryMs + SLACK && h1[h1.length - 1].time >= entryMs - SLACK) return { kind: 'h1', bars: h1 };
  const d1 = bars?.d1;
  if (d1 && d1.length > 1 && d1[0].time <= entryMs + SLACK && d1[d1.length - 1].time >= entryMs - 5 * 86_400_000) return { kind: 'd1', bars: d1 };
  return null;
}

function horizonOf(ctx: TradeContext, nowMs: number): number | null {
  if (ctx.exitMs == null) return null;
  const h = ctx.isOption && ctx.expiryMs != null
    ? Math.max(ctx.expiryMs, ctx.exitMs)
    : ctx.exitMs + Math.max(ctx.holdMs ?? 0, LOSS_RULES.STOCK_HORIZON_MS);
  return Math.min(h, nowMs);
}

/** Measure one trade against its symbol's bars (and classify it when it lost). */
export function analyseTrade(row: LossRow, bars: SymbolBars | undefined, nowMs = Date.now()): TradeAnalysis {
  const ctx = tradeContext(row);
  const empty: TradeAnalysis = {
    ctx, barKind: null, barsInTrade: 0, ref: null, risk: null, stop: null, target: null,
    mfePct: null, maePct: null, mfeR: null, maeR: null, tMfeMs: null, tMaeMs: null, moveAtExitPct: null,
    stopPrinted: false, targetPrinted: false, postFavPct: null, postFavR: null, targetAfterExit: false, horizonMs: null,
    gapPct: null, gapR: null, chasePct: null, atr: atrBefore(bars?.d1, ctx.entryMs), cls: null, flags: [],
  };
  const series = Number.isFinite(ctx.entryMs) && ctx.exitMs != null ? pickSeries(bars, ctx.entryMs) : null;
  if (!series || ctx.exitMs == null) return finish(empty);
  const ends = barEnds(series.bars, series.kind);
  const idx: number[] = [];
  for (let i = 0; i < series.bars.length; i++) {
    if (ends[i] > ctx.entryMs && series.bars[i].time <= ctx.exitMs) idx.push(i);
  }
  if (!idx.length || series.bars[idx[0]].time > ctx.entryMs + 3.5 * 86_400_000) return finish({ ...empty, barKind: series.kind });
  const B = series.bars;
  const s = dirSign(ctx.thesis);
  const first = B[idx[0]];

  // Entry reference on the underlying.
  const stampPx = first.time <= ctx.entryMs ? first.close : first.open;
  const plausible = (v: number | null, around: number) => v != null && Math.abs(v / around - 1) <= LOSS_RULES.LEVEL_BAND;
  let ref: number;
  if (ctx.planEntry != null && plausible(ctx.planEntry, stampPx)) ref = ctx.planEntry;
  else if (!ctx.isOption && row.entryPrice > 0 && plausible(row.entryPrice, stampPx)) ref = row.entryPrice;
  else ref = stampPx;
  const stop = plausible(ctx.stop, ref) && (ctx.stop! - ref) * s < 0 ? ctx.stop : null;
  const target = plausible(ctx.target, ref) && (ctx.target! - ref) * s > 0 ? ctx.target : null;
  const risk = stop != null ? Math.abs(ref - stop) : null;
  const toR = (px: number | null) => (px == null || risk == null || !(risk > 0) ? null : px / risk);

  let mfe = -Infinity, mae = Infinity, tMfe = ctx.entryMs, tMae = ctx.entryMs;
  let stopPrinted = false, targetPrinted = false;
  for (const i of idx) {
    const b = B[i];
    const fav = s > 0 ? b.high - ref : ref - b.low;
    const adv = s > 0 ? b.low - ref : ref - b.high;
    const t = Math.max(b.time, ctx.entryMs);
    if (fav > mfe) { mfe = fav; tMfe = t; }
    if (adv < mae) { mae = adv; tMae = t; }
    if (stop != null && (s > 0 ? b.low <= stop : b.high >= stop)) stopPrinted = true;
    if (target != null && (s > 0 ? b.high >= target : b.low <= target)) targetPrinted = true;
  }
  const last = B[idx[idx.length - 1]];

  // After the exit.
  const horizonMs = horizonOf(ctx, nowMs);
  let postFav: number | null = null, targetAfterExit = false;
  if (horizonMs != null) {
    for (let i = idx[idx.length - 1] + 1; i < B.length && B[i].time <= horizonMs; i++) {
      const b = B[i];
      const fav = s > 0 ? b.high - ref : ref - b.low;
      postFav = postFav == null ? fav : Math.max(postFav, fav);
      if (target != null && (s > 0 ? b.high >= target : b.low <= target)) targetAfterExit = true;
    }
  }

  // Out-of-hours stamp: the next regular-session open vs the entry. Chasing: price at the stamp vs the plan entry.
  const rthBar = ctx.outsideRTH ? idx.map((i) => B[i]).find((b) => b.time >= ctx.entryMs && !isOutsideRTH(b.time)) : undefined;
  const gap = rthBar ? (rthBar.open - ref) * s : null;
  const chase = ctx.planEntry != null && plausible(ctx.planEntry, stampPx) ? (stampPx - ctx.planEntry) * s : null;

  return finish({
    ...empty,
    barKind: series.kind,
    barsInTrade: idx.length,
    ref, risk, stop, target,
    mfePct: mfe / ref,
    maePct: mae / ref,
    mfeR: toR(mfe),
    maeR: toR(mae),
    tMfeMs: tMfe - ctx.entryMs,
    tMaeMs: tMae - ctx.entryMs,
    moveAtExitPct: ((last.close - ref) * s) / ref,
    stopPrinted,
    targetPrinted,
    postFavPct: postFav == null ? null : postFav / ref,
    postFavR: toR(postFav),
    targetAfterExit,
    horizonMs,
    gapPct: gap == null ? null : gap / ref,
    gapR: toR(gap),
    chasePct: chase == null ? null : chase / ref,
  });
}

/** Apply the rules: flags for every rule that fires, primary class = first in LOSS_CLASSES order. */
function finish(a: TradeAnalysis): TradeAnalysis {
  const { ctx } = a;
  const flags: LossFlag[] = [];
  if (ctx.outsideRTH) flags.push('outside_rth');
  if (a.barKind === 'd1') flags.push('coarse_bars');
  if (a.stopPrinted) flags.push('stop_printed');
  if (a.targetAfterExit) flags.push('target_after_exit');
  const R = a.risk != null;
  if (a.chasePct != null && (R && a.ref != null ? (a.chasePct * a.ref) / a.risk! >= LOSS_RULES.CHASE_R : a.chasePct >= LOSS_RULES.CHASE_PCT)) flags.push('chased');

  const isLoss = ctx.pnl != null && ctx.pnl < 0;
  if (!isLoss) return { ...a, flags, cls: null };
  if (a.barKind == null || a.barsInTrade === 0 || a.mfePct == null) return { ...a, flags, cls: 'unknown' };

  const fired = new Set<LossClass>();
  if (R ? a.mfeR! >= LOSS_RULES.GIVEBACK_R : a.mfePct >= LOSS_RULES.GIVEBACK_PCT) fired.add('gave_back');
  const stopped = ctx.exitCat === 'stop' || (ctx.exitCat === 'not recorded' && a.stopPrinted);
  const workedAfter = a.targetAfterExit || (R ? (a.postFavR ?? -Infinity) >= LOSS_RULES.TIGHT_AFTER_R : (a.postFavPct ?? -Infinity) >= LOSS_RULES.TIGHT_AFTER_PCT);
  if (stopped && workedAfter) fired.add('stop_tight');
  if (ctx.outsideRTH && a.gapPct != null && (R ? -(a.gapR ?? 0) >= LOSS_RULES.LATE_GAP_R : -a.gapPct >= LOSS_RULES.LATE_GAP_PCT)) fired.add('late_entry');
  if (ctx.isOption && a.moveAtExitPct != null && a.moveAtExitPct >= LOSS_RULES.THETA_FLAT_PCT) fired.add('theta');
  if (a.target != null && !a.stopPrinted && !a.targetPrinted && ctx.exitCat !== 'stop' && ctx.exitCat !== 'target') fired.add('target_far');
  if (R ? a.mfeR! < LOSS_RULES.NEVER_R : a.mfePct < LOSS_RULES.NEVER_PCT) fired.add('wrong_direction');

  const FLAG_OF: Partial<Record<LossClass, LossFlag>> = {
    gave_back: 'gave_back', stop_tight: 'stop_tight', late_entry: 'late_gap', theta: 'theta', target_far: 'target_far', wrong_direction: 'never_in_profit',
  };
  for (const c of fired) if (FLAG_OF[c]) flags.push(FLAG_OF[c]!);
  const cls = LOSS_CLASSES.find((c) => fired.has(c.id))?.id ?? 'normal';
  return { ...a, flags, cls };
}

// ─── aggregation ───────────────────────────────────────────────────────────

export interface ClassSummary {
  id: LossClass;
  label: string;
  rule: string;
  lesson: string;
  n: number;
  lost: number;
  /** Losses where this rule fired at all (primary or outranked). */
  fired: number;
  examples: TradeAnalysis[];
}

export function summariseLosses(all: TradeAnalysis[]): { losses: TradeAnalysis[]; lost: number; classes: ClassSummary[] } {
  const losses = all.filter((a) => a.cls != null);
  const lost = losses.reduce((s, a) => s + (a.ctx.pnl ?? 0), 0);
  const FLAG_OF: Partial<Record<LossClass, LossFlag>> = {
    gave_back: 'gave_back', stop_tight: 'stop_tight', late_entry: 'late_gap', theta: 'theta', target_far: 'target_far', wrong_direction: 'never_in_profit',
  };
  const classes = LOSS_CLASSES.map((c) => {
    const mine = losses.filter((a) => a.cls === c.id).sort((x, y) => (x.ctx.pnl ?? 0) - (y.ctx.pnl ?? 0));
    const f = FLAG_OF[c.id];
    return {
      ...c,
      n: mine.length,
      lost: mine.reduce((s, a) => s + (a.ctx.pnl ?? 0), 0),
      fired: f ? losses.filter((a) => a.flags.includes(f)).length : mine.length,
      examples: mine.slice(0, 3),
    };
  });
  return { losses, lost, classes };
}

export type DriverDim = 'source' | 'direction' | 'instrument' | 'dte' | 'hour' | 'weekday' | 'hold' | 'conviction' | 'exit' | 'symbol' | 'session';

export const DRIVER_DIM_LABEL: Record<DriverDim, string> = {
  source: 'Source / setup', direction: 'Direction (underlying)', instrument: 'Instrument', dte: 'DTE at entry', hour: 'Entry hour (ET)',
  weekday: 'Entry weekday (ET)', hold: 'Hold time', conviction: 'Conviction band', exit: 'Exit reason', symbol: 'Symbol', session: 'Entry session (ET)',
};

export function dteBucket(dte: number | null): string {
  if (dte == null) return 'not an option';
  if (dte <= 0) return '0 DTE';
  if (dte <= 7) return '1–7 DTE';
  if (dte <= 30) return '8–30 DTE';
  if (dte <= 90) return '31–90 DTE';
  return '91+ DTE';
}

export function holdBucket(ms: number | null): string {
  if (ms == null) return 'not recorded';
  const h = ms / 3_600_000;
  if (h < 1) return '< 1h';
  if (h < 4) return '1–4h';
  if (h < 24) return '4h–1d';
  if (h < 48) return '1–2d';
  if (h < 120) return '2–5d';
  return '5d+';
}

export function sessionBucket(ctx: TradeContext): string {
  if (ctx.weekdayET === 'Sat' || ctx.weekdayET === 'Sun') return 'weekend';
  const m = ctx.hourET * 60 + ctx.minuteET;
  if (m < 4 * 60) return 'overnight (00–04)';
  if (m < 9 * 60 + 30) return 'pre-market (04–09:30)';
  if (m < 12 * 60) return 'morning (09:30–12)';
  if (m < 16 * 60) return 'afternoon (12–16)';
  if (m < 20 * 60) return 'after-hours (16–20)';
  return 'evening (20–24)';
}

export function driverKey(ctx: TradeContext, dim: DriverDim): string {
  switch (dim) {
    case 'source': return ctx.source;
    case 'direction': return ctx.thesis;
    case 'instrument': return ctx.instrument;
    case 'dte': return dteBucket(ctx.dte);
    case 'hour': return `${String(ctx.hourET).padStart(2, '0')}:00 ET`;
    case 'weekday': return ctx.weekdayET;
    case 'hold': return holdBucket(ctx.holdMs);
    case 'conviction': return ctx.conviction ?? 'not recorded';
    case 'exit': return ctx.exitCat === 'not recorded' ? 'not recorded' : ctx.exitCat;
    case 'symbol': return ctx.symbol;
    case 'session': return sessionBucket(ctx);
  }
}

export interface DriverRow { key: string; n: number; wins: number; losses: number; net: number; lost: number; won: number; pf: number | null; winRate: number | null }

/** $ lost / PF per bucket over CLOSED trades, sorted by $ lost (most first). */
export function lossDrivers(ctxs: TradeContext[], dim: DriverDim): DriverRow[] {
  const m = new Map<string, DriverRow>();
  for (const c of ctxs) {
    if (c.pnl == null) continue;
    const k = driverKey(c, dim);
    let r = m.get(k);
    if (!r) { r = { key: k, n: 0, wins: 0, losses: 0, net: 0, lost: 0, won: 0, pf: null, winRate: null }; m.set(k, r); }
    r.n++;
    r.net += c.pnl;
    if (c.pnl > 0) { r.wins++; r.won += c.pnl; } else if (c.pnl < 0) { r.losses++; r.lost += c.pnl; }
  }
  return [...m.values()]
    .map((r) => ({ ...r, pf: r.lost < 0 ? r.won / -r.lost : null, winRate: r.n ? r.wins / r.n : null }))
    .sort((a, b) => a.lost - b.lost || a.net - b.net);
}

// ─── counterfactuals (hypothetical) ────────────────────────────────────────

export interface CfResult {
  id: string;
  label: string;
  how: string;
  basis: 'R' | '$';
  n: number;
  /** Trades the scenario could not be computed for (no bars / no stop). */
  skipped: number;
  wins: number;
  net: number;
  pf: number | null;
  /** Same scenario's baseline on the same trades. */
  baseNet: number;
  basePf: number | null;
  /** Chronological halves: improvement vs baseline in each (walk-forward sanity check). */
  firstHalfDelta: number;
  secondHalfDelta: number;
}

const pfOf = (xs: number[]) => {
  const won = xs.filter((x) => x > 0).reduce((s, x) => s + x, 0);
  const lost = -xs.filter((x) => x < 0).reduce((s, x) => s + x, 0);
  return lost > 0 ? won / lost : null;
};

/** Replay the plan on the underlying bars: stop/target (stop first when a bar prints both), else the close at `endMs`. Result in R. */
export function replayR(bars: Bar[], kind: 'h1' | 'd1', entryMs: number, endMs: number, thesis: 'long' | 'short', ref: number, stop: number, target: number | null, risk: number): number | null {
  const ends = barEnds(bars, kind);
  const s = dirSign(thesis);
  let lastClose: number | null = null;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (ends[i] <= entryMs) continue;
    if (b.time > endMs) break;
    if (s > 0 ? b.low <= stop : b.high >= stop) {
      const fill = s > 0 ? Math.min(b.open, stop) : Math.max(b.open, stop);
      return ((fill - ref) * s) / risk;
    }
    if (target != null && (s > 0 ? b.high >= target : b.low <= target)) {
      const fill = s > 0 ? Math.max(b.open, target) : Math.min(b.open, target);
      return ((fill - ref) * s) / risk;
    }
    lastClose = b.close;
  }
  return lastClose == null ? null : ((lastClose - ref) * s) / risk;
}

function seriesFor(bars: SymbolBars | undefined, entryMs: number) { return pickSeries(bars, entryMs); }

/**
 * Hypothetical scenarios. Replays are on the underlying in R (option premium
 * paths are not modelled — no option bars exist); filters use the ledger's
 * real $ on the trades kept. Each carries its chronological-halves delta.
 */
export function counterfactuals(analyses: TradeAnalysis[], barsBySymbol: Map<string, SymbolBars>): CfResult[] {
  const closed = analyses.filter((a) => a.ctx.pnl != null).sort((a, b) => a.ctx.entryMs - b.ctx.entryMs);
  const half = Math.floor(closed.length / 2);
  const halfOf = new Map(closed.map((a, i) => [a.ctx.id, i < half ? 0 : 1] as const));
  const out: CfResult[] = [];

  // ── replays (R) ──
  const replayable = closed.filter((a) => a.risk != null && a.ref != null && a.stop != null && a.barKind != null);
  const endOf = (a: TradeAnalysis) => (a.ctx.exitCat === 'stop' || a.stopPrinted ? a.horizonMs ?? a.ctx.exitMs! : a.ctx.exitMs!);
  const base = new Map<string, number>();
  for (const a of replayable) {
    const sr = seriesFor(barsBySymbol.get(a.ctx.symbol), a.ctx.entryMs);
    if (!sr) continue;
    const r = replayR(sr.bars, sr.kind, a.ctx.entryMs, endOf(a), a.ctx.thesis, a.ref!, a.stop!, a.target, a.risk!);
    if (r != null) base.set(a.ctx.id, r);
  }
  const scenario = (id: string, label: string, how: string, fn: (a: TradeAnalysis, sr: { kind: 'h1' | 'd1'; bars: Bar[] }) => number | null) => {
    const res: { id: string; v: number; b: number }[] = [];
    for (const a of replayable) {
      const b = base.get(a.ctx.id);
      const sr = seriesFor(barsBySymbol.get(a.ctx.symbol), a.ctx.entryMs);
      if (b == null || !sr) continue;
      const v = fn(a, sr);
      if (v != null) res.push({ id: a.ctx.id, v, b });
    }
    const d = (h: number) => res.filter((x) => halfOf.get(x.id) === h).reduce((s, x) => s + (x.v - x.b), 0);
    out.push({
      id, label, how, basis: 'R', n: res.length, skipped: closed.length - res.length,
      wins: res.filter((x) => x.v > 0).length,
      net: res.reduce((s, x) => s + x.v, 0), pf: pfOf(res.map((x) => x.v)),
      baseNet: res.reduce((s, x) => s + x.b, 0), basePf: pfOf(res.map((x) => x.b)),
      firstHalfDelta: d(0), secondHalfDelta: d(1),
    });
  };
  scenario('plan', 'The plan as written (replay)', 'Stop and target from the plan on the underlying; stop first when one bar prints both; otherwise out at the recorded exit time (stopped trades run to the horizon so wider stops can be compared).',
    (a) => base.get(a.ctx.id) ?? null);
  for (const k of [1.25, 1.5]) {
    scenario(`atr${k}`, `Stop ≥ ${k}× ATR(14)`, `Stop moved out to at least ${k}× the 14-day ATR at entry (never tighter than the plan); losses still counted in the plan's R.`,
      (a, sr) => {
        if (a.atr == null) return null;
        const dist = Math.max(a.risk!, k * a.atr);
        const stop = a.ref! - dirSign(a.ctx.thesis) * dist;
        return replayR(sr.bars, sr.kind, a.ctx.entryMs, endOf(a), a.ctx.thesis, a.ref!, stop, a.target, a.risk!);
      });
  }
  for (const d of [1, 2, 3]) {
    scenario(`time${d}`, `Time-stop at ${d} day${d > 1 ? 's' : ''}`, `Plan stop and target, but out at the bar close ${d}×24h after entry if neither printed.`,
      (a, sr) => replayR(sr.bars, sr.kind, a.ctx.entryMs, Math.min(endOf(a), a.ctx.entryMs + d * 86_400_000), a.ctx.thesis, a.ref!, a.stop!, a.target, a.risk!));
  }

  // ── filters ($, the ledger's own P&L) ──
  const filterScenario = (id: string, label: string, how: string, keep: (a: TradeAnalysis) => boolean) => {
    const kept = closed.filter(keep);
    const pnl = (xs: TradeAnalysis[]) => xs.reduce((s, a) => s + a.ctx.pnl!, 0);
    const delta = (h: number) => {
      const all = closed.filter((a) => halfOf.get(a.ctx.id) === h);
      return pnl(all.filter(keep)) - pnl(all);
    };
    out.push({
      id, label, how, basis: '$', n: kept.length, skipped: closed.length - kept.length,
      wins: kept.filter((a) => a.ctx.pnl! > 0).length,
      net: pnl(kept), pf: pfOf(kept.map((a) => a.ctx.pnl!)),
      baseNet: pnl(closed), basePf: pfOf(closed.map((a) => a.ctx.pnl!)),
      firstHalfDelta: delta(0), secondHalfDelta: delta(1),
    });
  };
  filterScenario('morning', 'Morning entries only', 'Keep only trades stamped 09:30–12:00 ET on a weekday; the rest are not taken.',
    (a) => { const m = a.ctx.hourET * 60 + a.ctx.minuteET; return !a.ctx.outsideRTH && m < 12 * 60; });
  filterScenario('rth', 'Regular-hours entries only', 'Drop every trade stamped outside 09:30–16:00 ET or on a weekend.', (a) => !a.ctx.outsideRTH);
  const bySource = lossDrivers(closed.map((a) => a.ctx), 'source');
  const worst = bySource.length > 1 ? bySource.filter((r) => r.net < 0).sort((x, y) => x.net - y.net)[0] : undefined;
  if (worst) {
    filterScenario('no-worst-source', `Without "${worst.key}"`, `Drop the source/setup with the worst net P&L (${worst.key}, n=${worst.n}). Picked on this same data — in-sample by construction.`,
      (a) => a.ctx.source !== worst.key);
  }
  return out;
}
