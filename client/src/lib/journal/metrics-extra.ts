/**
 * Journal metrics, second file — the pieces the LuxAlgo-parity pages need
 * (dashboard gauges/radar/heatmap/relative drawdown, calendar insights,
 * performance trends, playbook rule adherence, trade review storage, the day
 * recap and the trade chart's market-data window).
 *
 * Ported and adapted from LuxAlgo Trade Journal
 * (packages/core/src/{edge-score,equity,adherence}.ts and
 * apps/web/src/lib/{calendar-insights,performance-trends}.ts),
 * https://github.com/LuxAlgo/trade-journal — MIT License,
 * Copyright (c) 2026 LuxAlgo Global, LLC. The permission notice is reproduced
 * in client/src/lib/journal/LICENSE-luxalgo.txt.
 *
 * Kept apart from metrics.ts so another branch can extend that file freely.
 *
 * Adaptations, all in the direction of never inventing a number:
 *   · Edge score: LuxAlgo scores the drawdown component a neutral 50 when no
 *     account balance exists. We leave that component null and withhold the
 *     composite, with the reason — the other five axes still draw.
 *   · Relative drawdown needs a balance; without one the series is empty.
 *   · Weekday × hour, calendar insights and trends use New York trading days.
 */
import { journalDayKey } from '@shared/journal-filters';
import {
  bucketStats, dayStreaks, WEEKDAYS,
  type BucketStats, type DayStats, type EquityPoint, type JTrade, type TradeMetrics,
} from './metrics';

// ─── Edge score (edge-score.ts, formula v2) ──────────────────

export const EDGE_SCORE_VERSION = 2;
export const EDGE_MIN_CLOSED = 5;

export interface EdgeComponents {
  winRate: number;
  profitFactor: number;
  avgWinLoss: number;
  /** null when the book has no account balance — never a neutral guess. */
  drawdown: number | null;
  recovery: number;
  consistency: number;
}

export const EDGE_WEIGHTS: Record<keyof EdgeComponents, number> = {
  winRate: 15, profitFactor: 25, avgWinLoss: 20, drawdown: 15, recovery: 10, consistency: 15,
};

export const EDGE_LABELS: Record<keyof EdgeComponents, string> = {
  winRate: 'Win %', profitFactor: 'Profit factor', avgWinLoss: 'Avg win/loss', drawdown: 'Drawdown', recovery: 'Recovery', consistency: 'Consistency',
};

/** What earns full marks on each axis (the pinned v2 thresholds). */
export const EDGE_FULL_MARKS: Record<keyof EdgeComponents, string> = {
  winRate: '60% win rate',
  profitFactor: 'profit factor 3.0',
  avgWinLoss: 'avg win 2.5× avg loss',
  drawdown: '0% max drawdown of balance+peak (0 at 25%+)',
  recovery: 'net P&L = 3× max drawdown',
  consistency: 'best day ≤ 15% of green-day profit',
};

export interface EdgeResult {
  version: number;
  /** 0–100 composite, or null with `withheld` saying why. */
  score: number | null;
  withheld: string | null;
  components: EdgeComponents;
  closedTrades: number;
  maxDrawdownPct: number | null;
}

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

/** Max drawdown as a fraction of (balance + running peak), LuxAlgo's definition. */
export function maxDrawdownPct(curve: EquityPoint[], balance: number | null): number | null {
  if (balance == null || !(balance > 0)) return null;
  let peak = 0, maxDd = 0, pct: number | null = 0;
  for (const p of curve) {
    if (p.cumNetPnl > peak) peak = p.cumNetPnl;
    const dd = peak - p.cumNetPnl;
    if (dd > maxDd) {
      maxDd = dd;
      const base = balance + peak;
      pct = base > 0 ? dd / base : null;
    }
  }
  return pct;
}

export function edgeScore(m: TradeMetrics, curve: EquityPoint[], balance: number | null): EdgeResult {
  const ddPct = maxDrawdownPct(curve, balance);
  const pf = m.profitFactorIsInfinite ? 3 : (m.profitFactor ?? 0);
  const conc = m.profitConcentration;
  const components: EdgeComponents = {
    winRate: clamp01((m.winRate ?? 0) / 0.6) * 100,
    profitFactor: clamp01(pf / 3) * 100,
    avgWinLoss: clamp01((m.avgWinLossRatio ?? 0) / 2.5) * 100,
    drawdown: ddPct == null ? null : (1 - clamp01(ddPct / 0.25)) * 100,
    recovery: m.maxDrawdown > 0 ? clamp01((m.recoveryFactor ?? 0) / 3) * 100 : m.netPnl > 0 ? 100 : 0,
    consistency: conc == null ? 0 : conc <= 0.15 ? 100 : (1 - clamp01((conc - 0.15) / 0.85)) * 100,
  };
  let withheld: string | null = null;
  if (m.closedTrades < EDGE_MIN_CLOSED) withheld = `Needs ${EDGE_MIN_CLOSED}+ closed trades (n=${m.closedTrades}).`;
  else if (components.drawdown == null) withheld = 'No account balance behind this book, so drawdown as a % of the account is unknowable — the composite is withheld rather than scored on a guess.';
  let score: number | null = null;
  if (!withheld) {
    const total = Object.values(EDGE_WEIGHTS).reduce((s, w) => s + w, 0);
    const weighted = (Object.keys(EDGE_WEIGHTS) as (keyof EdgeComponents)[])
      .reduce((s, k) => s + (components[k] as number) * EDGE_WEIGHTS[k], 0) / total;
    score = Math.round(weighted * 100) / 100;
  }
  return { version: EDGE_SCORE_VERSION, score, withheld, components, closedTrades: m.closedTrades, maxDrawdownPct: ddPct };
}

// ─── Relative drawdown (equity.ts relativeDrawdownCurve) ────

export interface RelDrawdownPoint { t: string; pct: number }

/** Fall from the running peak as a fraction of balance + peak, at each close. Empty without a balance. */
export function relativeDrawdown(curve: EquityPoint[], balance: number | null): RelDrawdownPoint[] {
  if (balance == null || !(balance > 0)) return [];
  let peak = 0;
  const out: RelDrawdownPoint[] = [];
  for (const p of curve) {
    if (p.cumNetPnl > peak) peak = p.cumNetPnl;
    const base = balance + peak;
    if (base > 0) out.push({ t: p.t, pct: (peak - p.cumNetPnl) / base });
  }
  return out;
}

// ─── Weekday × hour (time-heatmap) ───────────────────────────

const wdHourFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', hourCycle: 'h23' });

export function nyWeekdayHour(iso: string): { weekday: string; hour: number } | null {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const parts = wdHourFmt.formatToParts(d);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? NaN);
  return weekday && Number.isFinite(hour) ? { weekday, hour } : null;
}

export interface TimeCell { weekday: string; hour: number; closed: number; wins: number; netPnl: number; /** closed trades in the cell (drill-down) */ ids: string[] }
export interface TimeGrid {
  weekdays: string[];
  hours: number[];
  cells: Map<string, TimeCell>;
  /** Largest |net P&L| of any cell (colour scale). */
  maxAbs: number;
  /** Closed trades placed on the grid (entry time known). */
  n: number;
}

/** Closed trades by entry weekday × entry hour (New York). Only rows/columns that have trades. */
export function timeGrid(trades: JTrade[]): TimeGrid {
  const cells = new Map<string, TimeCell>();
  let n = 0;
  for (const t of trades) {
    if (t.status === 'open') continue;
    const p = nyWeekdayHour(t.openedAt);
    if (!p) continue;
    n++;
    const k = `${p.weekday}|${p.hour}`;
    const c = cells.get(k) ?? { weekday: p.weekday, hour: p.hour, closed: 0, wins: 0, netPnl: 0, ids: [] };
    c.closed++;
    c.ids.push(t.id);
    if (t.status === 'win') c.wins++;
    c.netPnl += t.netPnl;
    cells.set(k, c);
  }
  const vals = [...cells.values()];
  const weekdays = WEEKDAYS.filter((w) => vals.some((c) => c.weekday === w));
  const hours = [...new Set(vals.map((c) => c.hour))].sort((a, b) => a - b);
  return { weekdays, hours, cells, maxAbs: Math.max(0, ...vals.map((c) => Math.abs(c.netPnl))), n };
}

// ─── Calendar insights (calendar-insights.ts) ────────────────

export interface WeekdayDays { weekday: string; days: number; netPnl: number; avg: number | null; green: number; trades: number }

export interface CalendarInsights {
  tradingDays: number;
  greenDays: number;
  redDays: number;
  flatDays: number;
  greenPct: number | null;
  avgDay: number | null;
  avgGreenDay: number | null;
  avgRedDay: number | null;
  /** Mon–Fri only (the calendar has no weekend columns). */
  weekdays: WeekdayDays[];
  /** Saturday + Sunday closes (crypto) as one bucket; null when there are none. */
  weekend: WeekdayDays | null;
  /** Highest average day (needs ≥ 1 day on that weekday; read n). */
  bestWeekday: WeekdayDays | null;
  worstWeekday: WeekdayDays | null;
  maxGreenStreak: number;
  maxRedStreak: number;
  currentStreak: number;
}

const WD_OF_DATE = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const weekdayOfDay = (date: string) => WD_OF_DATE[new Date(`${date}T12:00:00Z`).getUTCDay()];

export function calendarInsights(days: DayStats[]): CalendarInsights {
  const traded = days.filter((d) => d.trades > 0).sort((a, b) => a.date.localeCompare(b.date));
  const green = traded.filter((d) => d.netPnl > 0);
  const red = traded.filter((d) => d.netPnl < 0);
  const sum = (xs: DayStats[]) => xs.reduce((s, d) => s + d.netPnl, 0);
  const bucket = (weekday: string, ds: DayStats[]): WeekdayDays =>
    ({ weekday, days: ds.length, netPnl: sum(ds), avg: ds.length ? sum(ds) / ds.length : null, green: ds.filter((d) => d.netPnl > 0).length, trades: ds.reduce((s, d) => s + d.trades, 0) });
  const weekdays: WeekdayDays[] = WEEKDAYS.slice(0, 5).map((w) => bucket(w, traded.filter((d) => weekdayOfDay(d.date) === w))).filter((w) => w.days > 0);
  const wkndDays = traded.filter((d) => { const w = weekdayOfDay(d.date); return w === 'Sat' || w === 'Sun'; });
  const byAvg = [...weekdays].sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
  const st = dayStreaks(traded);
  return {
    tradingDays: traded.length,
    greenDays: green.length,
    redDays: red.length,
    flatDays: traded.length - green.length - red.length,
    greenPct: traded.length ? green.length / traded.length : null,
    avgDay: traded.length ? sum(traded) / traded.length : null,
    avgGreenDay: green.length ? sum(green) / green.length : null,
    avgRedDay: red.length ? sum(red) / red.length : null,
    weekdays,
    weekend: wkndDays.length ? bucket('Weekend', wkndDays) : null,
    bestWeekday: byAvg[0] ?? null,
    worstWeekday: byAvg.length > 1 ? byAvg[byAvg.length - 1] : null,
    maxGreenStreak: st.maxGreen,
    maxRedStreak: st.maxRed,
    currentStreak: st.current,
  };
}

// ─── Performance trends (performance-trends.ts, extended) ────

export interface TrendPoint {
  index: number;
  t: string;
  winRate: number;
  expectancy: number;
  /** null when the window has no losing trade (infinite) or no winners and no losers. */
  profitFactor: number | null;
  avgWinLoss: number | null;
  n: number;
}

/** Rolling metrics over the trailing `window` closed trades, from the window-th close on. */
export function performanceTrends(trades: JTrade[], window: number): TrendPoint[] {
  const closed = trades
    .filter((t): t is JTrade & { closedAt: string } => t.status !== 'open' && !!t.closedAt)
    .sort((a, b) => Date.parse(a.closedAt) - Date.parse(b.closedAt) || a.id.localeCompare(b.id));
  const out: TrendPoint[] = [];
  for (let i = window - 1; i < closed.length; i++) {
    const w = closed.slice(i - window + 1, i + 1);
    const wins = w.filter((t) => t.status === 'win');
    const losses = w.filter((t) => t.status === 'loss');
    const gp = w.reduce((s, t) => s + Math.max(0, t.netPnl), 0);
    const gl = w.reduce((s, t) => s - Math.min(0, t.netPnl), 0);
    const aw = wins.length ? wins.reduce((s, t) => s + t.netPnl, 0) / wins.length : null;
    const al = losses.length ? losses.reduce((s, t) => s - t.netPnl, 0) / losses.length : null;
    out.push({
      index: i + 1,
      t: closed[i].closedAt,
      winRate: wins.length / window,
      expectancy: w.reduce((s, t) => s + t.netPnl, 0) / window,
      profitFactor: gl > 0 ? gp / gl : null,
      avgWinLoss: aw != null && al != null && al > 0 ? aw / al : null,
      n: window,
    });
  }
  return out;
}

// ─── Playbook rules + trade reviews ──────────────────────────

/**
 * Rules of a playbook from its written definition. Lines that start with a
 * bullet (-, *, •, [ ], 1.) are rules; when none do, every line after the first
 * (the first line is the description) is a rule. Blank lines never are.
 */
export function playbookRules(body: string | null | undefined): string[] {
  const lines = (body ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  const bullet = /^(?:[-*•]\s+|\[[ xX]?\]\s*|\d+[.)]\s+)/;
  const bulleted = lines.filter((l) => bullet.test(l)).map((l) => l.replace(bullet, '').replace(/^\[[ xX]?\]\s*/, '').trim());
  const rules = bulleted.length ? bulleted : lines.slice(1);
  return [...new Set(rules.map((r) => r.slice(0, 160)).filter(Boolean))];
}

export type RuleVerdict = 'followed' | 'broken';

export interface TradeAnnotation {
  id: string;
  text: string;
  /** Chart anchor: ISO time and/or price. Either may be absent (a general remark). */
  at?: string | null;
  price?: number | null;
}

/** The per-trade review stored in journal_notes (reason 'trade_review'), body = JSON. */
export interface TradeReview {
  v: 1;
  /** Markdown notes (rendered with the journal's safe renderer; no raw HTML). */
  notes: string;
  /** rule text → verdict; rules not present were not assessed. */
  checklist: Record<string, RuleVerdict>;
  annotations: TradeAnnotation[];
  /** Planned levels the trader recorded (the chart draws them). */
  stop: number | null;
  target: number | null;
}

export const EMPTY_REVIEW: TradeReview = { v: 1, notes: '', checklist: {}, annotations: [], stop: null, target: null };

const finiteOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

/** Tolerant decode: a malformed or plain-text body becomes notes, never a crash. */
export function decodeTradeReview(body: string | null | undefined): TradeReview {
  if (!body?.trim()) return { ...EMPTY_REVIEW, checklist: {}, annotations: [] };
  try {
    const j = JSON.parse(body);
    if (!j || typeof j !== 'object' || j.v !== 1) throw new Error('not a review');
    const checklist: Record<string, RuleVerdict> = {};
    for (const [k, v] of Object.entries(j.checklist ?? {})) if (v === 'followed' || v === 'broken') checklist[k] = v;
    const annotations: TradeAnnotation[] = Array.isArray(j.annotations)
      ? j.annotations.filter((a: any) => a && typeof a.text === 'string' && a.text.trim()).slice(0, 50).map((a: any, i: number) => ({
        id: typeof a.id === 'string' ? a.id : `a${i}`,
        text: String(a.text).slice(0, 500),
        at: typeof a.at === 'string' && Number.isFinite(Date.parse(a.at)) ? a.at : null,
        price: finiteOrNull(a.price),
      }))
      : [];
    return { v: 1, notes: typeof j.notes === 'string' ? j.notes : '', checklist, annotations, stop: finiteOrNull(j.stop), target: finiteOrNull(j.target) };
  } catch {
    return { ...EMPTY_REVIEW, checklist: {}, annotations: [], notes: body };
  }
}

export function encodeTradeReview(r: TradeReview): string {
  const empty = !r.notes.trim() && !Object.keys(r.checklist).length && !r.annotations.length && r.stop == null && r.target == null;
  return empty ? '' : JSON.stringify({ v: 1, notes: r.notes, checklist: r.checklist, annotations: r.annotations, stop: r.stop, target: r.target });
}

export interface RuleAdherence {
  rule: string;
  /** Trades where this rule was assessed. */
  evaluated: number;
  /** Share of assessed trades where it was followed. */
  rate: number | null;
  followed: BucketStats;
  broken: BucketStats;
}

export interface PlaybookAdherence {
  setup: string;
  rules: string[];
  /** Closed trades tagged with this setup. */
  trades: number;
  /** Closed trades with at least one rule assessed. */
  reviewed: number;
  /** Every rule assessed and none broken. */
  followedAll: BucketStats;
  /** At least one rule broken. */
  brokeAny: BucketStats;
  unassessed: number;
  /** Assessed rule-checks that were "followed" ÷ all assessed rule-checks. */
  rate: number | null;
  perRule: RuleAdherence[];
}

/** analyzeAdherence (adherence.ts) on our storage: setup tag ↔ playbook, verdicts from each trade's review. */
export function playbookAdherence(
  trades: JTrade[],
  playbooks: { setup: string; rules: string[] }[],
  reviews: Map<string, TradeReview>,
): PlaybookAdherence[] {
  return playbooks.map(({ setup, rules }) => {
    const key = setup.trim().toLowerCase();
    const ts = trades.filter((t) => t.status !== 'open' && (t.row.setupType ?? '').trim().toLowerCase() === key);
    const per = rules.map((rule) => ({ rule, f: [] as JTrade[], b: [] as JTrade[] }));
    const followedAll: JTrade[] = [];
    const brokeAny: JTrade[] = [];
    let evaluated = 0, positive = 0, reviewed = 0;
    for (const t of ts) {
      const c = reviews.get(t.id)?.checklist ?? {};
      let complete = rules.length > 0, broke = false, any = false;
      for (const r of per) {
        const v = c[r.rule];
        if (!v) { complete = false; continue; }
        any = true;
        evaluated++;
        if (v === 'followed') { positive++; r.f.push(t); } else { broke = true; r.b.push(t); }
      }
      if (any) reviewed++;
      if (broke) brokeAny.push(t);
      else if (complete) followedAll.push(t);
    }
    return {
      setup,
      rules,
      trades: ts.length,
      reviewed,
      followedAll: bucketStats('followed every rule', followedAll),
      brokeAny: bucketStats('broke a rule', brokeAny),
      unassessed: ts.length - followedAll.length - brokeAny.length,
      rate: evaluated ? positive / evaluated : null,
      perRule: per.map((r) => ({
        rule: r.rule,
        evaluated: r.f.length + r.b.length,
        rate: r.f.length + r.b.length ? r.f.length / (r.f.length + r.b.length) : null,
        followed: bucketStats('followed', r.f),
        broken: bucketStats('broken', r.b),
      })),
    };
  });
}

// ─── Planned levels carried in a ledger's notes ──────────────

/** "plan: entry 412 · target 430 · stop 405" (trade desk / bot notes) → levels. Absent → null. */
export function planLevels(notes: string | null | undefined): { stop: number | null; target: number | null } {
  const s = notes ?? '';
  const num = (re: RegExp) => {
    const m = s.match(re);
    const v = m ? Number(m[1].replace(/,/g, '')) : NaN;
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  return {
    stop: num(/\bstop(?:\s*loss)?\s*[:=]?\s*\$?([\d,]+(?:\.\d+)?)/i),
    target: num(/\b(?:target|t1)\s*[:=]?\s*\$?([\d,]+(?:\.\d+)?)/i),
  };
}

// ─── Daily journal: day curve + measured recap ───────────────

/** Running realized P&L through one New York day, one point per close. */
export function dayEquity(trades: JTrade[], day: string): { t: string; cum: number; pnl: number; symbol: string }[] {
  let cum = 0;
  return trades
    .filter((t): t is JTrade & { closedAt: string } => t.status !== 'open' && !!t.closedAt && journalDayKey(t.closedAt) === day)
    .sort((a, b) => Date.parse(a.closedAt) - Date.parse(b.closedAt))
    .map((t) => { cum += t.netPnl; return { t: t.closedAt, cum, pnl: t.netPnl, symbol: t.symbol }; });
}

export interface RecapLine { k: string; text: string; tone?: 'gain' | 'loss' }

const money = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}$${Math.abs(v).toFixed(2)}`;

/**
 * The day in sentences built only from its measured stats (no text generation):
 * result vs the average day in view, win rate, best/worst trade, the symbol
 * that mattered most, intraday give-back from the day's high, and rule checks.
 */
export function dayRecap(day: string, trades: JTrade[], allDays: DayStats[], reviews?: Map<string, TradeReview>): RecapLine[] {
  const curve = dayEquity(trades, day);
  if (!curve.length) return [];
  const closed = trades.filter((t) => t.status !== 'open' && t.closedAt && journalDayKey(t.closedAt) === day);
  const net = curve[curve.length - 1].cum;
  const wins = closed.filter((t) => t.status === 'win').length;
  const losses = closed.filter((t) => t.status === 'loss').length;
  const lines: RecapLine[] = [];
  const others = allDays.filter((d) => d.trades > 0 && d.date !== day);
  const avg = others.length ? others.reduce((s, d) => s + d.netPnl, 0) / others.length : null;
  lines.push({
    k: 'result',
    tone: net > 0 ? 'gain' : net < 0 ? 'loss' : undefined,
    text: `Closed ${closed.length} trade${closed.length === 1 ? '' : 's'} for ${money(net)} net (${wins}W/${losses}L${closed.length - wins - losses ? `/${closed.length - wins - losses}BE` : ''}).`
      + (avg != null ? ` The average other day in view is ${money(avg)} (n=${others.length} days).` : ''),
  });
  if (others.length >= 2) {
    const rank = [...others.map((d) => d.netPnl), net].sort((a, b) => b - a).indexOf(net) + 1;
    lines.push({ k: 'rank', text: `Ranks ${rank} of ${others.length + 1} trading days in view by net P&L.` });
  }
  const best = closed.reduce<JTrade | null>((b, t) => (!b || t.netPnl > b.netPnl ? t : b), null);
  const worst = closed.reduce<JTrade | null>((b, t) => (!b || t.netPnl < b.netPnl ? t : b), null);
  if (best && worst && closed.length > 1) lines.push({ k: 'extremes', text: `Best trade ${best.symbol} ${money(best.netPnl)}; worst ${worst.symbol} ${money(worst.netPnl)}.` });
  const bySym = new Map<string, number>();
  for (const t of closed) bySym.set(t.symbol, (bySym.get(t.symbol) ?? 0) + t.netPnl);
  if (bySym.size > 1) {
    const [sym, v] = [...bySym.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
    lines.push({ k: 'symbol', text: `${sym} moved the day most: ${money(v)} of the ${money(net)} net across ${bySym.size} symbols.` });
  }
  const high = Math.max(0, ...curve.map((p) => p.cum));
  if (high > 0 && net < high) lines.push({ k: 'giveback', tone: 'loss', text: `Peaked at ${money(high)} intraday and gave back ${money(high - net).replace('+', '')} after it.` });
  if (reviews) {
    let f = 0, b = 0;
    for (const t of closed) for (const v of Object.values(reviews.get(t.id)?.checklist ?? {})) { if (v === 'followed') f++; else b++; }
    if (f + b) lines.push({ k: 'rules', tone: b ? 'loss' : 'gain', text: `Rule checks: ${f} followed, ${b} broken (${Math.round((f / (f + b)) * 100)}% followed).` });
  }
  return lines;
}

// ─── Trade chart: timeframe + market data around the trade ───

/** Oldest bar each timeframe's feed range reaches (see chart-engine TF_CONFIG ranges). */
const TF_REACH_MS: [string, number][] = [
  ['1m', 5 * 86_400_000],
  ['5m', 28 * 86_400_000],
  ['15m', 28 * 86_400_000],
  ['1h', 180 * 86_400_000],
  ['1D', 730 * 86_400_000],
  ['1W', 3650 * 86_400_000],
];

/** Finest timeframe whose history still reaches the entry and gives the holding period ~20+ bars. */
export function tradeTimeframe(entryMs: number, exitMs: number | null, nowMs = Date.now()): string {
  const held = Math.max(0, (exitMs ?? nowMs) - entryMs);
  const age = nowMs - entryMs;
  const bar: Record<string, number> = { '1m': 60_000, '5m': 300_000, '15m': 900_000, '1h': 3_600_000, '1D': 86_400_000, '1W': 604_800_000 };
  for (const [tf, reach] of TF_REACH_MS) {
    if (age > reach * 0.97) continue;
    if (held / bar[tf] > 400 && tf !== '1W') continue; // too many bars to read
    return tf;
  }
  return '1W';
}

export interface MarketWindow {
  tf: string;
  /** Bars inside [entry, exit]. */
  barsInTrade: number;
  underlyingAtEntry: number | null;
  underlyingAtExit: number | null;
  /** Underlying move entry→exit, % (signed, price terms). */
  movePct: number | null;
  highInTrade: number | null;
  lowInTrade: number | null;
  /** Stock/crypto only: best and worst excursion in the trade's direction, % of entry price. */
  mfePct: number | null;
  maePct: number | null;
  /** Underlying move over the same number of bars after the exit (capped at 20), %. */
  afterExitPct: number | null;
  afterExitBars: number;
}

interface Bar { time: number; open: number; high: number; low: number; close: number }

/** Market data around a trade from real OHLC bars. Anything the bars don't cover is null. */
export function marketWindow(bars: Bar[], tf: string, entryMs: number, exitMs: number | null, dir: 'long' | 'short', entryPrice: number | null): MarketWindow {
  const barMs = bars.length > 1 ? Math.max(1, (bars[bars.length - 1].time - bars[0].time) / (bars.length - 1)) : 60_000;
  const idxAt = (t: number) => {
    let i = -1;
    for (let k = 0; k < bars.length; k++) { if (bars[k].time <= t) i = k; else break; }
    return i >= 0 && t < bars[i].time + barMs * 3 ? i : -1;
  };
  const ei = idxAt(entryMs);
  const xi = exitMs != null ? idxAt(exitMs) : -1;
  const inTrade = ei >= 0 ? bars.slice(ei, (xi >= 0 ? xi : bars.length - 1) + 1) : [];
  const hi = inTrade.length ? Math.max(...inTrade.map((b) => b.high)) : null;
  const lo = inTrade.length ? Math.min(...inTrade.map((b) => b.low)) : null;
  const atEntry = ei >= 0 ? bars[ei].close : null;
  const atExit = xi >= 0 ? bars[xi].close : null;
  const ref = entryPrice ?? atEntry;
  let mfe: number | null = null, mae: number | null = null;
  if (ref && hi != null && lo != null && entryPrice != null) {
    mfe = dir === 'long' ? (hi - ref) / ref : (ref - lo) / ref;
    mae = dir === 'long' ? (lo - ref) / ref : (ref - hi) / ref;
  }
  const afterN = xi >= 0 ? Math.min(20, Math.max(1, inTrade.length), bars.length - 1 - xi) : 0;
  const after = xi >= 0 && afterN > 0 ? (bars[xi + afterN].close - bars[xi].close) / bars[xi].close : null;
  return {
    tf,
    barsInTrade: inTrade.length,
    underlyingAtEntry: atEntry,
    underlyingAtExit: atExit,
    movePct: atEntry && atExit ? (atExit - atEntry) / atEntry : null,
    highInTrade: hi,
    lowInTrade: lo,
    mfePct: mfe,
    maePct: mae,
    afterExitPct: after,
    afterExitBars: after == null ? 0 : afterN,
  };
}

// ─── Import reconciliation ──────────────────────────────────

/** "Row 7: bad price" → reason "bad price", row 7. Save failures group separately. */
export function groupImportErrors(errors: string[]) {
  const rows: Map<string, number[]> = new Map();
  const saves: string[] = [];
  const other: string[] = [];
  for (const e of errors) {
    const m = e.match(/^Row (\d+):\s*(.*)$/);
    if (m) {
      const reason = m[2].replace(/\d+(\.\d+)?/g, '#').slice(0, 120) || 'unreadable row';
      const list = rows.get(reason) ?? [];
      list.push(Number(m[1]));
      rows.set(reason, list);
    } else if (/^Save failed/i.test(e)) saves.push(e);
    else other.push(e);
  }
  return { rejected: [...rows.entries()].map(([reason, at]) => ({ reason, rows: at })).sort((a, b) => b.rows.length - a.rows.length), saves, other };
}

// ─── CSV export ──────────────────────────────────────────────

/** RFC 4180 CSV; text cells that a spreadsheet would run as a formula are prefixed with '. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    if (v == null) return '';
    if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : '';
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
