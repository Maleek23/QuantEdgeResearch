/**
 * Journal metrics — computed on the client from the rows in view, so every
 * filter moves every number at once.
 *
 * Ported and adapted from LuxAlgo Trade Journal's @luxalgo/journal-core
 * (packages/core/src/{metrics,equity,aggregate}.ts),
 * https://github.com/LuxAlgo/trade-journal — MIT License,
 * Copyright (c) 2026 LuxAlgo Global, LLC. The permission notice is reproduced
 * in client/src/lib/journal/LICENSE-luxalgo.txt.
 *
 * Adaptations: LuxAlgo builds round trips from raw fills; our journal_trades
 * rows already are round trips (imports reconstruct them server-side), so a row
 * maps 1:1 to a trade. Day keys are New York trading days. We do not port the
 * Edge Score: its drawdown component needs an account balance we don't store,
 * and LuxAlgo scores that case a neutral 50 — a number we would be inventing.
 */
import { journalDayKey, journalRowOutcome } from '@shared/journal-filters';
import type { JournalTradeRow } from './types';

export type TradeStatus = 'open' | 'win' | 'loss' | 'breakeven';

export interface JTrade {
  row: JournalTradeRow;
  id: string;
  symbol: string;
  direction: 'long' | 'short';
  assetType: string;
  status: TradeStatus;
  openedAt: string;
  closedAt?: string;
  /** Net of fees. 0 while open. */
  netPnl: number;
  grossPnl: number;
  fees: number;
  quantity: number;
  durationMs?: number;
}

export function toTrade(row: JournalTradeRow): JTrade {
  const status = journalRowOutcome(row);
  const closed = status !== 'open';
  const netPnl = closed ? Number(row.realizedPnL) : 0;
  const fees = Number(row.fees ?? 0) || 0;
  const closedAt = closed ? row.exitTime || row.entryTime : undefined;
  const durationMs = row.holdingMinutes != null
    ? row.holdingMinutes * 60_000
    : closed && row.exitTime ? Math.max(0, Date.parse(row.exitTime) - Date.parse(row.entryTime)) : undefined;
  return {
    row,
    id: row.id,
    symbol: row.symbol,
    direction: row.direction === 'short' ? 'short' : 'long',
    assetType: row.assetType || 'stock',
    status,
    openedAt: row.entryTime,
    closedAt,
    netPnl,
    grossPnl: closed ? Number(row.grossPnL ?? netPnl + fees) : 0,
    fees,
    quantity: Number(row.quantity) || 0,
    durationMs: Number.isFinite(durationMs) ? durationMs : undefined,
  };
}

// ─── Equity & days (from equity.ts) ─────────────────────────

export interface EquityPoint { t: string; cumNetPnl: number; pnl: number; symbol?: string; id?: string }

export interface DayStats {
  date: string;
  netPnl: number;
  fees: number;
  trades: number;
  wins: number;
  losses: number;
  breakevens: number;
}

const closedByCloseTime = (trades: JTrade[]) =>
  trades
    .filter((t): t is JTrade & { closedAt: string } => t.status !== 'open' && !!t.closedAt)
    .sort((a, b) => Date.parse(a.closedAt) - Date.parse(b.closedAt) || a.id.localeCompare(b.id));

/** Trade-level equity curve: cumulative net P&L at each trade close. */
export function equityCurve(trades: JTrade[]): EquityPoint[] {
  let cum = 0;
  return closedByCloseTime(trades).map((t) => {
    cum += t.netPnl;
    return { t: t.closedAt, cumNetPnl: cum, pnl: t.netPnl, symbol: t.symbol, id: t.id };
  });
}

/** Per-day realized stats keyed by New York trading day. */
export function dailyStats(trades: JTrade[]): DayStats[] {
  const days = new Map<string, DayStats>();
  for (const t of closedByCloseTime(trades)) {
    const date = journalDayKey(t.closedAt);
    if (!date) continue;
    let d = days.get(date);
    if (!d) {
      d = { date, netPnl: 0, fees: 0, trades: 0, wins: 0, losses: 0, breakevens: 0 };
      days.set(date, d);
    }
    d.netPnl += t.netPnl;
    d.fees += t.fees;
    d.trades += 1;
    if (t.status === 'win') d.wins += 1;
    else if (t.status === 'loss') d.losses += 1;
    else d.breakevens += 1;
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export interface DrawdownStats {
  maxDrawdown: number;
  currentDrawdown: number;
  peak: number;
  /** Closed trades since the curve last made a new high (0 at a peak). */
  tradesSincePeak: number;
}

/** Peak-to-trough over the cumulative curve, measured from a 0 start. */
export function drawdown(curve: EquityPoint[]): DrawdownStats {
  let peak = 0;
  let maxDrawdown = 0;
  let sincePeak = 0;
  for (const p of curve) {
    if (p.cumNetPnl >= peak) { peak = p.cumNetPnl; sincePeak = 0; } else sincePeak += 1;
    maxDrawdown = Math.max(maxDrawdown, peak - p.cumNetPnl);
  }
  const last = curve.length ? curve[curve.length - 1].cumNetPnl : 0;
  return { maxDrawdown, currentDrawdown: Math.max(0, peak - last), peak, tradesSincePeak: sincePeak };
}

/** Underwater series: distance below the running peak at each close (≤ 0). */
export function underwater(curve: EquityPoint[]): { t: string; dd: number }[] {
  let peak = 0;
  return curve.map((p) => {
    peak = Math.max(peak, p.cumNetPnl);
    return { t: p.t, dd: p.cumNetPnl - peak };
  });
}

export interface DrawdownPeriod {
  /** Close time of the peak the fall started from. */
  start: string;
  /** Close time of the trough. */
  trough: string;
  /** Close time the curve got back to the peak; undefined while still under water. */
  recovered?: string;
  depth: number;
  trades: number;
}

/** Distinct peak → trough → recovery episodes, deepest first. */
export function drawdownPeriods(curve: EquityPoint[]): DrawdownPeriod[] {
  const out: DrawdownPeriod[] = [];
  let peak = 0;
  let peakT = curve[0]?.t ?? '';
  let cur: DrawdownPeriod | null = null;
  for (const p of curve) {
    if (p.cumNetPnl >= peak) {
      if (cur) { cur.recovered = p.t; out.push(cur); cur = null; }
      peak = p.cumNetPnl;
      peakT = p.t;
      continue;
    }
    const depth = peak - p.cumNetPnl;
    if (!cur) cur = { start: peakT, trough: p.t, depth, trades: 0 };
    cur.trades += 1;
    if (depth > cur.depth) { cur.depth = depth; cur.trough = p.t; }
  }
  if (cur) out.push(cur);
  return out.sort((a, b) => b.depth - a.depth);
}

// ─── Metrics (from metrics.ts) ───────────────────────────────

export interface TradeMetrics {
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  fees: number;
  winRate: number | null;
  dayWinRate: number | null;
  tradingDays: number;
  winningDays: number;
  profitFactor: number | null;
  profitFactorIsInfinite: boolean;
  avgWin: number | null;
  avgLoss: number | null;
  avgWinLossRatio: number | null;
  expectancy: number | null;
  largestWin: number;
  largestLoss: number;
  maxWinStreak: number;
  maxLossStreak: number;
  /** + = current winning run, − = losing run. */
  currentStreak: number;
  avgDurationMs: number | null;
  maxDrawdown: number;
  currentDrawdown: number;
  peakEquity: number;
  tradesSincePeak: number;
  /** netPnl / maxDrawdown; null before any drawdown. */
  recoveryFactor: number | null;
  /** Largest winning day's share of all winning-day profit (0–1). */
  profitConcentration: number | null;
  bestDay: DayStats | null;
  worstDay: DayStats | null;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);

export function computeMetrics(trades: JTrade[], days = dailyStats(trades), curve = equityCurve(trades)): TradeMetrics {
  const closed = trades.filter((t) => t.status !== 'open');
  const wins = closed.filter((t) => t.status === 'win');
  const losses = closed.filter((t) => t.status === 'loss');
  const grossProfit = closed.reduce((s, t) => s + Math.max(0, t.netPnl), 0);
  const grossLoss = closed.reduce((s, t) => s - Math.min(0, t.netPnl), 0);
  const netPnl = closed.reduce((s, t) => s + t.netPnl, 0);

  let maxWinStreak = 0;
  let maxLossStreak = 0;
  let run = 0;
  for (const t of closedByCloseTime(trades)) {
    if (t.status === 'breakeven') continue;
    const dir = t.status === 'win' ? 1 : -1;
    run = Math.sign(run) === dir ? run + dir : dir;
    maxWinStreak = Math.max(maxWinStreak, run);
    maxLossStreak = Math.max(maxLossStreak, -run);
  }

  const dd = drawdown(curve);
  const avgWin = mean(wins.map((t) => t.netPnl));
  const avgLoss = mean(losses.map((t) => Math.abs(t.netPnl)));
  const dayProfits = days.filter((d) => d.netPnl > 0).map((d) => d.netPnl);
  const totalDayProfit = dayProfits.reduce((s, v) => s + v, 0);
  const tradedDays = days.filter((d) => d.trades > 0);

  return {
    totalTrades: trades.length,
    closedTrades: closed.length,
    openTrades: trades.length - closed.length,
    wins: wins.length,
    losses: losses.length,
    breakevens: closed.length - wins.length - losses.length,
    netPnl,
    grossProfit,
    grossLoss,
    fees: closed.reduce((s, t) => s + t.fees, 0),
    winRate: closed.length ? wins.length / closed.length : null,
    dayWinRate: tradedDays.length ? dayProfits.length / tradedDays.length : null,
    tradingDays: tradedDays.length,
    winningDays: dayProfits.length,
    profitFactor: closed.length === 0 ? null : grossLoss > 0 ? grossProfit / grossLoss : null,
    profitFactorIsInfinite: closed.length > 0 && grossLoss === 0 && grossProfit > 0,
    avgWin,
    avgLoss,
    avgWinLossRatio: avgWin != null && avgLoss != null && avgLoss > 0 ? avgWin / avgLoss : null,
    expectancy: closed.length ? netPnl / closed.length : null,
    largestWin: wins.reduce((m, t) => Math.max(m, t.netPnl), 0),
    largestLoss: losses.reduce((m, t) => Math.min(m, t.netPnl), 0),
    maxWinStreak,
    maxLossStreak,
    currentStreak: run,
    avgDurationMs: mean(closed.map((t) => t.durationMs).filter((d): d is number => d != null)),
    maxDrawdown: dd.maxDrawdown,
    currentDrawdown: dd.currentDrawdown,
    peakEquity: dd.peak,
    tradesSincePeak: dd.tradesSincePeak,
    recoveryFactor: dd.maxDrawdown > 0 ? netPnl / dd.maxDrawdown : null,
    profitConcentration: totalDayProfit > 0 ? Math.max(...dayProfits) / totalDayProfit : null,
    bestDay: tradedDays.length ? tradedDays.reduce((b, d) => (d.netPnl > b.netPnl ? d : b)) : null,
    worstDay: tradedDays.length ? tradedDays.reduce((b, d) => (d.netPnl < b.netPnl ? d : b)) : null,
  };
}

// ─── Buckets (from aggregate.ts) ─────────────────────────────

export interface BucketStats {
  key: string;
  /** All trades in the bucket, open included. */
  trades: number;
  /** Closed trades — the sample size every rate below is computed on. */
  closed: number;
  wins: number;
  netPnl: number;
  winRate: number | null;
  profitFactor: number | null;
  profitFactorIsInfinite: boolean;
  expectancy: number | null;
}

export function bucketStats(key: string, trades: JTrade[]): BucketStats {
  let closed = 0, wins = 0, netPnl = 0, profit = 0, loss = 0;
  for (const t of trades) {
    if (t.status === 'open') continue;
    closed++;
    if (t.status === 'win') wins++;
    netPnl += t.netPnl;
    profit += Math.max(0, t.netPnl);
    loss -= Math.min(0, t.netPnl);
  }
  return {
    key,
    trades: trades.length,
    closed,
    wins,
    netPnl,
    winRate: closed ? wins / closed : null,
    profitFactor: loss > 0 ? profit / loss : null,
    profitFactorIsInfinite: loss === 0 && profit > 0,
    expectancy: closed ? netPnl / closed : null,
  };
}

export function groupInto(trades: JTrade[], keysOf: (t: JTrade) => string[]): BucketStats[] {
  const groups = new Map<string, JTrade[]>();
  for (const t of trades) {
    for (const key of keysOf(t)) {
      const g = groups.get(key);
      if (g) g.push(t);
      else groups.set(key, [t]);
    }
  }
  return [...groups.entries()].map(([k, g]) => bucketStats(k, g)).sort((a, b) => b.netPnl - a.netPnl);
}

const tagOf = (v: string | null | undefined) => (v && v.trim() ? [v.trim()] : []);

export type GroupBy = 'setup' | 'symbol' | 'mistake' | 'emotion' | 'side' | 'asset' | 'broker' | 'rating';

export const GROUP_BY_LABEL: Record<GroupBy, string> = {
  setup: 'Setup',
  symbol: 'Symbol',
  mistake: 'Mistake',
  emotion: 'Emotion',
  side: 'Side',
  asset: 'Asset type',
  broker: 'Source',
  rating: 'Self-rating',
};

export function groupBy(trades: JTrade[], by: GroupBy): BucketStats[] {
  switch (by) {
    case 'setup': return groupInto(trades, (t) => tagOf(t.row.setupType));
    case 'symbol': return groupInto(trades, (t) => [t.symbol]);
    case 'mistake': return groupInto(trades, (t) => tagOf(t.row.mistakeTag));
    case 'emotion': return groupInto(trades, (t) => tagOf(t.row.emotion));
    case 'side': return groupInto(trades, (t) => [t.direction]);
    case 'asset': return groupInto(trades, (t) => [t.assetType]);
    case 'broker': return groupInto(trades, (t) => [t.row.broker || 'manual']);
    case 'rating': return groupInto(trades, (t) => (t.row.rating ? [`${t.row.rating}/5`] : [])).sort((a, b) => b.key.localeCompare(a.key));
  }
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const partsFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', hourCycle: 'h23' });
function nyParts(iso: string) {
  const parts = partsFmt.formatToParts(new Date(iso));
  return {
    weekday: parts.find((p) => p.type === 'weekday')?.value ?? '',
    hour: Number(parts.find((p) => p.type === 'hour')?.value ?? NaN),
  };
}

/** By weekday of entry (New York), Mon→Sun, only days that have trades. */
export function byWeekday(trades: JTrade[]): BucketStats[] {
  return groupInto(trades, (t) => [nyParts(t.openedAt).weekday])
    .filter((b) => b.key)
    .sort((a, b) => WEEKDAYS.indexOf(a.key as never) - WEEKDAYS.indexOf(b.key as never));
}

/** By hour of entry (New York, 24h). */
export function byHour(trades: JTrade[]): BucketStats[] {
  return groupInto(trades, (t) => {
    const h = nyParts(t.openedAt).hour;
    return Number.isFinite(h) ? [String(h).padStart(2, '0')] : [];
  }).sort((a, b) => a.key.localeCompare(b.key));
}

export const DURATION_BUCKETS = [
  { key: '< 5m', maxMs: 300_000 },
  { key: '5–30m', maxMs: 1_800_000 },
  { key: '30m–2h', maxMs: 7_200_000 },
  { key: '2h–1d', maxMs: 86_400_000 },
  { key: '1–5d', maxMs: 432_000_000 },
  { key: '> 5d', maxMs: Number.POSITIVE_INFINITY },
] as const;

export function byDuration(trades: JTrade[]): BucketStats[] {
  const order = DURATION_BUCKETS.map((b) => b.key as string);
  return groupInto(
    trades.filter((t) => t.durationMs != null),
    (t) => [DURATION_BUCKETS.find((b) => t.durationMs! < b.maxMs)!.key],
  ).sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

/** Monday-anchored week key for a day key. */
export function weekKey(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function byWeek(days: DayStats[]): { week: string; netPnl: number; trades: number; wins: number; days: number }[] {
  const weeks = new Map<string, { week: string; netPnl: number; trades: number; wins: number; days: number }>();
  for (const d of days) {
    const k = weekKey(d.date);
    const w = weeks.get(k) ?? { week: k, netPnl: 0, trades: 0, wins: 0, days: 0 };
    w.netPnl += d.netPnl;
    w.trades += d.trades;
    w.wins += d.wins;
    w.days += 1;
    weeks.set(k, w);
  }
  return [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week));
}

// ─── Calendar (from aggregate.ts calendarMonthFromDays) ─────

export interface CalendarWeek { days: (DayStats | null)[]; weekNetPnl: number; weekTrades: number }
export interface CalendarMonth {
  year: number;
  month: number;
  weeks: CalendarWeek[];
  monthNetPnl: number;
  monthTrades: number;
  tradingDays: number;
  winningDays: number;
}

/** Month grid, Monday-first (US equities trade Mon–Fri), with week and month totals. */
export function calendarMonth(days: DayStats[], year: number, month: number): CalendarMonth {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const byDate = new Map(days.filter((d) => d.date.startsWith(prefix)).map((d) => [d.date, d]));
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leading = (first.getUTCDay() + 6) % 7;
  const cells: (DayStats | null)[] = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${prefix}-${String(day).padStart(2, '0')}`;
    cells.push(byDate.get(date) ?? { date, netPnl: 0, fees: 0, trades: 0, wins: 0, losses: 0, breakevens: 0 });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: CalendarWeek[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const wd = cells.slice(i, i + 7);
    weeks.push({
      days: wd,
      weekNetPnl: wd.reduce((s, d) => s + (d?.netPnl ?? 0), 0),
      weekTrades: wd.reduce((s, d) => s + (d?.trades ?? 0), 0),
    });
  }
  const traded = [...byDate.values()].filter((d) => d.trades > 0);
  return {
    year,
    month,
    weeks,
    monthNetPnl: traded.reduce((s, d) => s + d.netPnl, 0),
    monthTrades: traded.reduce((s, d) => s + d.trades, 0),
    tradingDays: traded.length,
    winningDays: traded.filter((d) => d.netPnl > 0).length,
  };
}

// ─── Formatting ─────────────────────────────────────────────

const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compactFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });

/** Signed money: +$171.00 / −$102.50 — sign is text, never colour alone. */
export function fmtMoney(v: number | null | undefined, opts: { signed?: boolean; compact?: boolean } = {}): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const { signed = true, compact = false } = opts;
  const abs = (compact && Math.abs(v) >= 1000 ? compactFmt : moneyFmt).format(Math.abs(v));
  if (!signed) return v < 0 ? `−${abs}` : abs;
  return v > 0 ? `+${abs}` : v < 0 ? `−${abs}` : abs;
}

export function fmtPct(v: number | null | undefined, digits = 0): string {
  return v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(digits)}%`;
}

export function fmtRatio(v: number | null | undefined, infinite = false): string {
  if (infinite) return '∞';
  return v == null || !Number.isFinite(v) ? '—' : v.toFixed(2);
}

export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const m = ms / 60_000;
  if (m < 60) return `${Math.max(1, Math.round(m))}m`;
  if (m < 1440) return `${(m / 60).toFixed(1)}h`;
  return `${(m / 1440).toFixed(1)}d`;
}

export function fmtPrice(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `$${v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : v.toFixed(2)}`;
}

/** Below this many closed trades a rate is shown with a "low sample" flag. */
export const LOW_SAMPLE = 20;
