/**
 * Journal Insights — what to stop doing, in dollars, with the sample behind it.
 *
 * Pure functions over the SAME filtered rows every other journal number uses
 * (client-side, New York time), so the Insights page cannot disagree with the
 * dashboard. Replaces the server "behaviour insights" block, which bucketed by
 * the server's clock and UTC days.
 *
 * Honesty rules
 *   • Every finding carries n (closed trades), win rate, PF and net $.
 *   • Buckets under MIN_N closed trades are never a finding; under LOW_SAMPLE
 *     they are flagged.
 *   • Findings are chosen on this same data (in-sample). Each one reports its
 *     net in the first and second chronological halves of the book: a bucket
 *     that lost in only one half is most likely a regime artifact.
 *   • Buckets overlap (SPXW trades are also 0 DTE trades…) — the page says so;
 *     their dollars must not be added up.
 */
import { DURATION_BUCKETS, LOW_SAMPLE, WEEKDAYS, fmtMoney, fmtPct, type JTrade } from './metrics';
import type { BehaviorInsight } from './types';

export const MIN_N = 5;

const ET = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' });
export function etOf(iso: string): { day: string; weekday: string; hour: number; minute: number } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = ET.formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { day: `${g('year')}-${g('month')}-${g('day')}`, weekday: g('weekday'), hour: Number(g('hour')) % 24, minute: Number(g('minute')) };
}

export type InsightDim = 'hour' | 'session' | 'weekday' | 'dte' | 'cost' | 'hold' | 'symbol' | 'side' | 'tradeOfDay' | 'dayLoad' | 'tilt';

export const INSIGHT_DIM_LABEL: Record<InsightDim, string> = {
  hour: 'Entry hour (ET)', session: 'Time of day (ET)', weekday: 'Weekday', dte: 'Days to expiry at entry', cost: 'Position cost at entry',
  hold: 'Holding time', symbol: 'Ticker', side: 'Contract / side', tradeOfDay: 'Trade # of the day', dayLoad: 'Trades that day', tilt: 'After a loss',
};

export interface InsightBucket {
  dim: InsightDim;
  key: string;
  n: number;
  wins: number;
  net: number;
  won: number;
  lost: number;
  winRate: number | null;
  pf: number | null;
  expectancy: number | null;
  /** Net in the first / second chronological half of the book (by entry). */
  firstHalf: number;
  secondHalf: number;
  /** n in each half. */
  firstN: number;
  secondN: number;
  /** The closed trades in this bucket (drill-down to exactly these on the Trades page). */
  ids: string[];
}

/** Position cost at entry: premium × 100 × contracts for options, price × shares otherwise. */
export function positionCost(t: JTrade): number {
  const q = Math.abs(Number(t.row.quantity) || 0);
  const px = Math.abs(Number(t.row.entryPrice) || 0);
  return px * q * (t.assetType === 'option' ? 100 : 1);
}

export const COST_BUCKETS = [
  { key: '< $100', max: 100 }, { key: '$100–300', max: 300 }, { key: '$300–1k', max: 1000 }, { key: '$1k–3k', max: 3000 }, { key: '$3k+', max: Infinity },
] as const;

export function costBucket(cost: number): string {
  return COST_BUCKETS.find((b) => cost < b.max)!.key;
}

/** DTE at entry: calendar days from the New York entry day to expiry; null for non-options. */
export function dteAtEntry(t: JTrade): number | null {
  if (t.assetType !== 'option' || !t.row.expiryDate) return null;
  const e = etOf(t.openedAt);
  if (!e) return null;
  const d = Math.round((Date.parse(String(t.row.expiryDate).slice(0, 10)) - Date.parse(e.day)) / 86_400_000);
  return Number.isFinite(d) ? d : null;
}

export function dteLabel(d: number | null): string | null {
  if (d == null) return null;
  if (d <= 0) return '0 DTE';
  if (d <= 7) return '1–7 DTE';
  if (d <= 30) return '8–30 DTE';
  if (d <= 90) return '31–90 DTE';
  return '91+ DTE';
}

export const SESSIONS = ['Open 09:30–10:00', 'Morning 10:00–12:00', 'Midday 12:00–14:00', 'Afternoon 14:00–15:00', 'Power hour 15:00–16:00', 'Outside regular hours'] as const;
export function sessionOf(e: { weekday: string; hour: number; minute: number }): string {
  if (e.weekday === 'Sat' || e.weekday === 'Sun') return SESSIONS[5];
  const m = e.hour * 60 + e.minute;
  if (m < 570 || m >= 960) return SESSIONS[5];
  if (m < 600) return SESSIONS[0];
  if (m < 720) return SESSIONS[1];
  if (m < 840) return SESSIONS[2];
  if (m < 900) return SESSIONS[3];
  return SESSIONS[4];
}

const ORDINAL = (i: number) => (i === 1 ? '1st trade' : i === 2 ? '2nd trade' : i === 3 ? '3rd trade' : i <= 5 ? '4th–5th trade' : '6th+ trade');
const LOAD = (n: number) => (n <= 2 ? '1–2 trades that day' : n <= 5 ? '3–5 trades that day' : n <= 8 ? '6–8 trades that day' : '9+ trades that day');

/** Closed trades, entry order, with the context every dimension needs. */
interface Ctx { t: JTrade; e: NonNullable<ReturnType<typeof etOf>>; tilt: string[]; ofDay: number; dayLoad: number }

function contexts(trades: JTrade[]): Ctx[] {
  const closed = trades.filter((t) => t.status !== 'open' && t.closedAt).sort((a, b) => Date.parse(a.openedAt) - Date.parse(b.openedAt) || a.id.localeCompare(b.id));
  const byClose = [...closed].sort((a, b) => Date.parse(a.closedAt!) - Date.parse(b.closedAt!));
  const perDay = new Map<string, number>();
  const out: Ctx[] = [];
  for (const t of closed) {
    const e = etOf(t.openedAt);
    if (!e) continue;
    const i = (perDay.get(e.day) ?? 0) + 1;
    perDay.set(e.day, i);
    // Closes that happened before this entry: the most recent two.
    const entry = Date.parse(t.openedAt);
    let lo = 0, hi = byClose.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (Date.parse(byClose[mid].closedAt!) <= entry) lo = mid + 1; else hi = mid; }
    const prev = lo > 0 ? byClose[lo - 1] : null;
    const prev2 = lo > 1 ? byClose[lo - 2] : null;
    const tilt: string[] = [];
    if (prev && prev.id !== t.id) {
      if (prev.status === 'loss') {
        tilt.push('Next trade after a loss');
        if (entry - Date.parse(prev.closedAt!) <= 15 * 60_000 && journalDay(prev.closedAt!) === e.day) tilt.push('Re-entered ≤15 min after a losing close');
        if (prev2 && prev2.status === 'loss') tilt.push('After 2+ losses in a row');
      } else if (prev.status === 'win') tilt.push('Next trade after a win');
    }
    out.push({ t, e, tilt, ofDay: i, dayLoad: 0 });
  }
  for (const c of out) c.dayLoad = perDay.get(c.e.day) ?? 1;
  return out;
}

const journalDay = (iso: string) => etOf(iso)?.day ?? '';

function keysOf(c: Ctx, dim: InsightDim): string[] {
  const t = c.t;
  switch (dim) {
    case 'hour': return [`${String(c.e.hour).padStart(2, '0')}:00–${String((c.e.hour + 1) % 24).padStart(2, '0')}:00 ET`];
    case 'session': return [sessionOf(c.e)];
    case 'weekday': return [c.e.weekday];
    case 'dte': { const l = dteLabel(dteAtEntry(t)); return l ? [l] : []; }
    case 'cost': { const cost = positionCost(t); return cost > 0 ? [`${costBucket(cost)}${t.assetType === 'option' ? ' premium' : ' position'}`] : []; }
    case 'hold': return t.durationMs == null ? [] : [DURATION_BUCKETS.find((b) => t.durationMs! < b.maxMs)!.key];
    case 'symbol': return [t.symbol];
    case 'side': {
      const ot = (t.row.optionType ?? '').toLowerCase();
      if (t.assetType === 'option' && (ot === 'call' || ot === 'put')) return [`${t.direction === 'short' ? 'Sold' : 'Bought'} ${ot}s`];
      return [`${t.direction === 'short' ? 'Short' : 'Long'} ${t.assetType}`];
    }
    case 'tradeOfDay': return [ORDINAL(c.ofDay)];
    case 'dayLoad': return [LOAD(c.dayLoad)];
    case 'tilt': return c.tilt;
  }
}

const ORDER: Partial<Record<InsightDim, readonly string[]>> = {
  session: SESSIONS,
  weekday: WEEKDAYS,
  dte: ['0 DTE', '1–7 DTE', '8–30 DTE', '31–90 DTE', '91+ DTE'],
  hold: DURATION_BUCKETS.map((b) => b.key),
  tradeOfDay: ['1st trade', '2nd trade', '3rd trade', '4th–5th trade', '6th+ trade'],
  dayLoad: ['1–2 trades that day', '3–5 trades that day', '6–8 trades that day', '9+ trades that day'],
};

export interface InsightModel {
  closed: number;
  net: number;
  /** Entry instant splitting the book into chronological halves. */
  splitAt: string | null;
  buckets: Record<InsightDim, InsightBucket[]>;
}

export function buildInsights(trades: JTrade[]): InsightModel {
  const ctx = contexts(trades);
  const half = Math.floor(ctx.length / 2);
  const splitAt = ctx.length > 1 ? ctx[half].t.openedAt : null;
  const inFirst = new Set(ctx.slice(0, half).map((c) => c.t.id));
  const dims = Object.keys(INSIGHT_DIM_LABEL) as InsightDim[];
  const buckets = {} as Record<InsightDim, InsightBucket[]>;
  for (const dim of dims) {
    const m = new Map<string, InsightBucket>();
    for (const c of ctx) {
      for (const key of keysOf(c, dim)) {
        let b = m.get(key);
        if (!b) { b = { dim, key, n: 0, wins: 0, net: 0, won: 0, lost: 0, winRate: null, pf: null, expectancy: null, firstHalf: 0, secondHalf: 0, firstN: 0, secondN: 0, ids: [] }; m.set(key, b); }
        const p = c.t.netPnl;
        b.n++;
        b.ids.push(c.t.id);
        if (c.t.status === 'win') b.wins++;
        b.net += p;
        if (p > 0) b.won += p; else b.lost += p;
        if (inFirst.has(c.t.id)) { b.firstHalf += p; b.firstN++; } else { b.secondHalf += p; b.secondN++; }
      }
    }
    const list = [...m.values()].map((b) => ({ ...b, winRate: b.n ? b.wins / b.n : null, pf: b.lost < 0 ? b.won / -b.lost : null, expectancy: b.n ? b.net / b.n : null }));
    const order = ORDER[dim];
    if (order) list.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    else if (dim === 'hour') list.sort((a, b) => a.key.localeCompare(b.key));
    else if (dim === 'cost') list.sort((a, b) => COST_BUCKETS.findIndex((x) => a.key.startsWith(x.key)) - COST_BUCKETS.findIndex((x) => b.key.startsWith(x.key)) || a.key.localeCompare(b.key));
    else list.sort((a, b) => a.net - b.net);
    buckets[dim] = list;
  }
  return { closed: ctx.length, net: ctx.reduce((s, c) => s + c.t.netPnl, 0), splitAt, buckets };
}

export interface Finding extends InsightBucket {
  /** $ the book would have kept by not taking these trades (−net for a leak). */
  impact: number;
  /** Lost in both chronological halves (leaks) / won in both (edges). */
  bothHalves: boolean;
  lowSample: boolean;
  /** Book net and PF without these trades. */
  netWithout: number;
}

/** Dimensions that make a "what to stop doing" candidate (tilt rows are behaviours, not partitions). */
const FINDING_DIMS: InsightDim[] = ['session', 'hour', 'weekday', 'dte', 'cost', 'hold', 'symbol', 'side', 'tradeOfDay', 'dayLoad', 'tilt'];

export function stopDoing(model: InsightModel, limit = 50): Finding[] {
  const out: Finding[] = [];
  for (const dim of FINDING_DIMS) {
    for (const b of model.buckets[dim]) {
      if (b.n < MIN_N || b.net >= 0 || b.n >= model.closed * 0.9) continue;
      out.push({ ...b, impact: -b.net, bothHalves: b.firstN > 0 && b.secondN > 0 && b.firstHalf < 0 && b.secondHalf < 0, lowSample: b.n < LOW_SAMPLE, netWithout: model.net - b.net });
    }
  }
  return out.sort((a, b) => b.impact - a.impact).slice(0, limit);
}

export function keepDoing(model: InsightModel, limit = 8): Finding[] {
  const out: Finding[] = [];
  for (const dim of FINDING_DIMS) {
    if (dim === 'tilt') continue;
    for (const b of model.buckets[dim]) {
      if (b.n < Math.max(MIN_N, 10) || b.net <= 0 || b.n >= model.closed * 0.9) continue;
      out.push({ ...b, impact: b.net, bothHalves: b.firstN > 0 && b.secondN > 0 && b.firstHalf > 0 && b.secondHalf > 0, lowSample: b.n < LOW_SAMPLE, netWithout: model.net - b.net });
    }
  }
  return out.sort((a, b) => b.impact - a.impact).slice(0, limit);
}

export interface Concentration {
  symbols: number;
  top: { symbol: string; n: number; net: number; share: number }[];
  /** Share of closed trades in the 5 most-traded tickers. */
  top5Share: number;
  /** Tickers traded fewer than 3 times: count, n, net. */
  oneOffs: { symbols: number; n: number; net: number };
  /** Net of tickers with n ≥ MIN_N that lost, and how many. */
  losingNames: { symbols: number; n: number; net: number };
}

export function concentration(model: InsightModel): Concentration {
  const bs = [...model.buckets.symbol].sort((a, b) => b.n - a.n);
  const total = model.closed || 1;
  const one = bs.filter((b) => b.n < 3);
  const losing = bs.filter((b) => b.n >= MIN_N && b.net < 0);
  return {
    symbols: bs.length,
    top: bs.slice(0, 8).map((b) => ({ symbol: b.key, n: b.n, net: b.net, share: b.n / total })),
    top5Share: bs.slice(0, 5).reduce((s, b) => s + b.n, 0) / total,
    oneOffs: { symbols: one.length, n: one.reduce((s, b) => s + b.n, 0), net: one.reduce((s, b) => s + b.net, 0) },
    losingNames: { symbols: losing.length, n: losing.reduce((s, b) => s + b.n, 0), net: losing.reduce((s, b) => s + b.net, 0) },
  };
}

const money = (v: number) => fmtMoney(v, { compact: Math.abs(v) >= 10_000 });

/** The headline cards, as BehaviorInsight (lib/journal/types) — every one names its n and $. */
export function behaviorInsights(model: InsightModel, expired?: { n: number; pnl: number }): BehaviorInsight[] {
  const out: BehaviorInsight[] = [];
  if (expired && expired.n > 0) {
    out.push({
      id: 'expired-unclosed', category: 'data', severity: 'warning',
      title: `${expired.n} option${expired.n === 1 ? '' : 's'} held to expiry with no exit`,
      description: `No closing fill in the broker export, so each is settled at its intrinsic value from the underlying's expiry-day print (unverified ones at $0): ${money(expired.pnl)} in total. Before this was counted they were missing from every number.`,
      metric: `${money(expired.pnl)} · n=${expired.n}`,
      suggestion: 'Unverified ones (no close available) can be retried from Import › Re-settle expired options.', icon: 'hourglass',
    });
  }
  for (const f of stopDoing(model, 3)) {
    out.push({
      id: `stop-${f.dim}-${f.key}`, category: INSIGHT_DIM_LABEL[f.dim], severity: f.bothHalves && !f.lowSample ? 'critical' : 'warning',
      title: `Stop: ${f.key}`,
      description: `${f.n} closed trades, ${fmtPct(f.winRate)} win, PF ${f.pf == null ? '—' : f.pf.toFixed(2)}: ${money(f.net)}. ${f.bothHalves ? 'Lost in both halves of the period.' : 'Lost in only one half of the period — may be a regime, not a habit.'}`,
      metric: `${money(f.net)} · n=${f.n}`,
      suggestion: `Without them the book would be ${money(f.netWithout)} instead of ${money(model.net)} (in-sample).`, icon: 'ban',
    });
  }
  const after = model.buckets.tilt.find((b) => b.key === 'Next trade after a loss');
  const afterWin = model.buckets.tilt.find((b) => b.key === 'Next trade after a win');
  if (after && afterWin && after.n >= MIN_N && afterWin.n >= MIN_N && (after.expectancy ?? 0) < (afterWin.expectancy ?? 0)) {
    out.push({
      id: 'tilt', category: 'Tilt', severity: (after.expectancy ?? 0) < 0 ? 'warning' : 'neutral',
      title: 'Trades after a loss are worse',
      description: `After a loss: ${fmtMoney(after.expectancy)} per trade (${fmtPct(after.winRate)} win, n=${after.n}). After a win: ${fmtMoney(afterWin.expectancy)} per trade (${fmtPct(afterWin.winRate)} win, n=${afterWin.n}).`,
      metric: `${fmtMoney(after.expectancy)}/trade · n=${after.n}`,
      suggestion: 'A pause rule after a losing close (e.g. 15 minutes, or half size on the next trade).', icon: 'flame',
    });
  }
  for (const f of keepDoing(model, 2)) {
    out.push({
      id: `keep-${f.dim}-${f.key}`, category: INSIGHT_DIM_LABEL[f.dim], severity: 'positive',
      title: `Keep: ${f.key}`,
      description: `${f.n} closed trades, ${fmtPct(f.winRate)} win, PF ${f.pf == null ? '∞' : f.pf.toFixed(2)}: ${money(f.net)}.${f.bothHalves ? ' Won in both halves of the period.' : ''}`,
      metric: `${money(f.net)} · n=${f.n}`, icon: 'check',
    });
  }
  return out;
}
