/**
 * JOURNAL / NEXUS / 0DTE INTEGRITY — one read model over trade_ideas rows.
 *
 * Operator, 2026-10-13: "0DTE desk isn't tracking or keeping plays, I can't go
 * back and analyze… a lot of gaps in journal and NEXUS… misinfo and confusion".
 *
 *   · toPlay()          — one 0DTE play (any date) straight from its DB row:
 *                         contract, fired time, entry, T1/T2/stop on premium,
 *                         peak + time, exit, outcome, why fired. The desk's
 *                         "Today's results" and "Past sessions" both read this
 *                         (one source of truth — the AMZN class: desk said
 *                         "stop", DB said "missed entry").
 *   · toSetupRow()      — one NEXUS setup of any day with its outcome.
 *   · dataHealth()      — gaps by ET day: missing contract, stale outcome,
 *                         premium/outcome mismatch, unpriced outcome.
 * A row with no contract renders "contract not recorded" — never shares, never
 * a made-up number. Every derived number carries its source.
 */
import { CONTRACT_NOT_RECORDED, contractGap, instrumentIntent, instrumentLabel, wasConvertedToShares } from './options-only';
import { premiumConsistent, premiumPlanFor, readPremiumPlan, etDateKey, etWallMs } from './premium-outcome';
import { parsePeak } from './option-peak';

export const ZERO_DTE_SOURCES: readonly string[] = ['zero_dte_flow', 'zero_dte_desk', 'zero_dte_sniper', 'index_scalp', 'spx_fast_move'];

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const num = (x: unknown): number | null => (x == null || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null);
const etHm = (ms: number | null) => (ms == null || !Number.isFinite(ms) ? null : new Date(ms).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }));

export interface IdeaRowLike {
  id: string;
  symbol: string;
  source?: string | null;
  assetType?: string | null;
  direction?: string | null;
  optionType?: string | null;
  strikePrice?: number | null;
  expiryDate?: string | null;
  expiryTier?: string | null;
  entryPrice?: number | null;
  targetPrice?: number | null;
  stopLoss?: number | null;
  entryPremium?: number | null;
  exitPremium?: number | null;
  optionPercentGain?: number | null;
  exitPrice?: number | null;
  percentGain?: number | null;
  optionDelta?: number | null;
  outcomeStatus?: string | null;
  resolutionReason?: string | null;
  outcomeNotes?: string | null;
  timestamp: string;
  exitDate?: string | null;
  exitBy?: string | null;
  catalyst?: string | null;
  analysis?: string | null;
  dataSourceUsed?: string | null;
  qualitySignals?: unknown;
  convergenceSignalsJson?: unknown;
}

/** Is this row a same-day (0DTE desk) play? Pure. */
export function isZeroDtePlay(r: IdeaRowLike): boolean {
  const src = String(r.source ?? '').toLowerCase();
  if (ZERO_DTE_SOURCES.includes(src) && !/_swing$/.test(String(r.dataSourceUsed ?? ''))) return true;
  if (String(r.dataSourceUsed ?? '').startsWith('GEX_index_scalp_')) return true;
  if (String(r.expiryTier ?? '').toUpperCase() === '0DTE') return true;
  const e = String(r.expiryDate ?? '').slice(0, 10);
  return String(r.assetType) === 'option' && !!e && e === etDateKey(Date.parse(r.timestamp));
}

/** Plain-word outcome for a row. Pure. */
export function outcomeWord(r: IdeaRowLike): { label: string; tone: 'win' | 'loss' | 'flat' | 'open' } {
  const s = String(r.outcomeStatus ?? 'open');
  const why = String(r.resolutionReason ?? '');
  if (why.startsWith('missed_entry')) return { label: 'not entered', tone: 'flat' };
  if (why.startsWith('superseded')) return { label: 'superseded', tone: 'flat' };
  if (s === 'open' || !s) return { label: 'open', tone: 'open' };
  const pct = String(r.assetType) === 'option' ? num(r.optionPercentGain) ?? pctOf(num(r.entryPremium), num(r.exitPremium)) : num(r.percentGain);
  if (s === 'hit_target') return { label: '✓ T1', tone: pct != null && pct < 0 ? 'loss' : 'win' };
  if (s === 'hit_stop') return { label: '✕ stop', tone: pct != null && pct > 0 ? 'win' : 'loss' };
  if (s === 'expired') return { label: 'time exit', tone: pct == null ? 'flat' : pct > 0 ? 'win' : pct < 0 ? 'loss' : 'flat' };
  return { label: s.replace('_', ' '), tone: 'flat' };
}
const pctOf = (e: number | null, x: number | null) => (e != null && e > 0 && x != null ? Math.round(((x - e) / e) * 10000) / 100 : null);

export interface ZeroDtePlay {
  id: string;
  symbol: string;
  source: string;
  side: 'CALLS' | 'PUTS' | null;
  /** "TSLA 380P 10/07" — or null with contractNote "contract not recorded". */
  contract: string | null;
  contractNote: string | null;
  firedAt: string;
  firedEt: string | null;
  entryPremium: number | null;
  plan: { t1: number | null; t2: number | null; stop: number | null; basis: string } | null;
  underlying: { entry: number | null; t1: number | null; stop: number | null };
  peak: { premium: number; at: string | null; basis: string } | null;
  exit: { premium: number | null; at: string | null; atEt: string | null; pct: number | null; basis: string } | null;
  outcome: { status: string; label: string; tone: 'win' | 'loss' | 'flat' | 'open'; reason: string | null };
  why: string | null;
  gaps: string[];
  source_note: string;
}

/** One 0DTE play from its DB row. Pure. */
export function toPlay(r: IdeaRowLike): ZeroDtePlay {
  const gap = contractGap(r);
  const isOpt = String(r.assetType) === 'option' && !gap;
  const t = String(r.optionType ?? '').toLowerCase();
  const side: ZeroDtePlay['side'] = t.startsWith('p') ? 'PUTS' : t.startsWith('c') ? 'CALLS' : String(r.direction) === 'short' ? 'PUTS' : String(r.direction) === 'long' ? 'CALLS' : null;
  const exp = String(r.expiryDate ?? '').slice(0, 10);
  const contract = isOpt ? `${r.symbol} ${r.strikePrice}${t.startsWith('p') ? 'P' : 'C'} ${exp.slice(5, 7)}/${exp.slice(8, 10)}` : null;
  const firedMs = Date.parse(r.timestamp);
  const stored = readPremiumPlan(r.convergenceSignalsJson);
  const plan = isOpt ? (stored ?? premiumPlanFor(r as any, { zeroDte: true })) : null;
  const pk = isOpt ? parsePeak(r.outcomeNotes) : null;
  const resolved = !!r.outcomeStatus && r.outcomeStatus !== 'open';
  const exitMs = Date.parse(String(r.exitDate ?? ''));
  const ow = outcomeWord(r);
  const gaps: string[] = [];
  if (gap) gaps.push(`${CONTRACT_NOT_RECORDED}: ${gap}`);
  if (isOpt && resolved && !String(r.resolutionReason ?? '').startsWith('missed_entry') && num(r.exitPremium) == null) gaps.push('resolved without an exit premium');
  const inv = premiumConsistent(r.outcomeStatus, r.entryPremium, r.exitPremium);
  if (!inv.ok) gaps.push(`mismatch: ${inv.reason}`);
  return {
    id: r.id,
    symbol: r.symbol,
    source: String(r.source ?? 'unknown'),
    side,
    contract,
    contractNote: gap ? CONTRACT_NOT_RECORDED : null,
    firedAt: r.timestamp,
    firedEt: etHm(firedMs),
    entryPremium: isOpt ? num(r.entryPremium) : null,
    plan: plan ? { t1: plan.t1, t2: plan.t2, stop: plan.stop, basis: stored ? `premium plan stored at publish (${plan.mapping})` : `premium plan mapped now from the publish levels (${plan.mapping})` } : null,
    underlying: { entry: num(r.entryPrice), t1: num(r.targetPrice), stop: num(r.stopLoss) },
    peak: pk ? { premium: pk.premium, at: new Date(pk.atMs).toISOString(), basis: `${pk.basis} · ${pk.source} · ${pk.window === 'to_eod' ? 'through 16:00' : 'to the exit'}` } : null,
    exit: resolved ? {
      premium: isOpt ? num(r.exitPremium) : null,
      at: r.exitDate ?? null,
      atEt: etHm(Number.isFinite(exitMs) ? exitMs : null),
      pct: isOpt ? num(r.optionPercentGain) ?? pctOf(num(r.entryPremium), num(r.exitPremium)) : null,
      basis: /\[premium-outcome\]|premium_/.test(`${r.outcomeNotes ?? ''} ${r.resolutionReason ?? ''}`) ? 'contract 1-min bars (premium-judged)' : /\[exit-premium:pass\]/.test(String(r.outcomeNotes ?? '')) ? 'tracker pass mark (not at the outcome time — unverified)' : 'tracker record',
    } : null,
    outcome: { status: String(r.outcomeStatus ?? 'open'), label: ow.label, tone: ow.tone, reason: r.resolutionReason ?? null },
    why: r.catalyst ?? null,
    gaps,
    source_note: `trade_ideas row ${r.id.slice(0, 8)} · ${r.source ?? 'unknown'}`,
  };
}

export interface SetupRow {
  id: string;
  symbol: string;
  source: string;
  instrument: string;
  direction: string | null;
  contract: string | null;
  calledAt: string;
  calledEt: string | null;
  entry: number | null;
  target: number | null;
  stop: number | null;
  entryPremium: number | null;
  exitPremium: number | null;
  resultPct: number | null;
  resultBasis: string;
  outcome: { status: string; label: string; tone: 'win' | 'loss' | 'flat' | 'open' };
  gaps: string[];
}

/** One NEXUS setup of any day. Legacy shares ideas are labelled "Shares idea (legacy, not in the options book)"; contract-less option ideas "contract not recorded". Pure. */
export function toSetupRow(r: IdeaRowLike): SetupRow {
  const gap = contractGap(r);
  const isOpt = String(r.assetType) === 'option' && !gap;
  const t = String(r.optionType ?? '').toLowerCase();
  const exp = String(r.expiryDate ?? '').slice(0, 10);
  const ow = outcomeWord(r);
  const gaps: string[] = [];
  if (gap) gaps.push(`${CONTRACT_NOT_RECORDED}: ${gap}`);
  const inv = premiumConsistent(r.outcomeStatus, r.entryPremium, r.exitPremium);
  if (!inv.ok) gaps.push(`mismatch: ${inv.reason}`);
  const intent = instrumentIntent(r);
  const resultPct = isOpt ? (num(r.optionPercentGain) ?? pctOf(num(r.entryPremium), num(r.exitPremium))) : intent === 'option' ? null : num(r.percentGain);
  return {
    id: r.id, symbol: r.symbol, source: String(r.source ?? 'unknown'), instrument: instrumentLabel(r),
    direction: r.direction ?? null,
    contract: isOpt ? `${r.strikePrice}${t.startsWith('p') ? 'P' : 'C'} ${exp}` : gap ? CONTRACT_NOT_RECORDED : null,
    calledAt: r.timestamp, calledEt: etHm(Date.parse(r.timestamp)),
    entry: num(r.entryPrice), target: num(r.targetPrice), stop: num(r.stopLoss),
    entryPremium: isOpt ? num(r.entryPremium) : null, exitPremium: isOpt ? num(r.exitPremium) : null,
    resultPct,
    resultBasis: isOpt ? 'contract premium (entry → exit premium)' : intent === 'option' ? `no result — ${CONTRACT_NOT_RECORDED}` : 'underlying % (shares idea — legacy, not in the options book)',
    outcome: { status: String(r.outcomeStatus ?? 'open'), label: ow.label, tone: ow.tone },
    gaps,
  };
}

export type GapKind = 'missing_contract' | 'stale_outcome' | 'mismatch' | 'unpriced_outcome';
export const GAP_LABEL: Record<GapKind, string> = {
  missing_contract: 'missing contract',
  stale_outcome: 'stale outcome',
  mismatch: 'outcome/premium mismatch',
  unpriced_outcome: 'resolved without exit premium',
};

export interface DayHealth {
  day: string;
  total: number;
  counts: Record<GapKind, number>;
  items: Array<{ id: string; symbol: string; source: string; kind: GapKind; detail: string }>;
}

/** Gaps of one row. Pure. */
export function rowGaps(r: IdeaRowLike, nowMs: number): Array<{ kind: GapKind; detail: string }> {
  const out: Array<{ kind: GapKind; detail: string }> = [];
  const gap = contractGap(r);
  if (gap) out.push({ kind: 'missing_contract', detail: wasConvertedToShares(r) && String(r.assetType) !== 'option' ? `${gap} (shown as "${CONTRACT_NOT_RECORDED}", not as shares)` : gap });
  const status = String(r.outcomeStatus ?? 'open');
  if (status === 'open') {
    const exitBy = Date.parse(String(r.exitBy ?? ''));
    const exp = String(r.expiryDate ?? '').slice(0, 10);
    const expClose = /^\d{4}-\d{2}-\d{2}$/.test(exp) ? Date.parse(`${exp}T21:00:00Z`) : NaN;
    const due = [exitBy, expClose].filter((x) => Number.isFinite(x)).sort((a, b) => a - b)[0];
    if (due != null && due < nowMs - 60 * 60_000) out.push({ kind: 'stale_outcome', detail: `still open ${Math.round((nowMs - due) / 3_600_000)}h after its ${due === exitBy ? 'exit-by deadline' : 'expiry'}` });
  }
  const inv = premiumConsistent(status, r.entryPremium, r.exitPremium);
  if (!inv.ok) out.push({ kind: 'mismatch', detail: inv.reason! });
  if (String(r.assetType) === 'option' && !gap && status !== 'open' && !String(r.resolutionReason ?? '').startsWith('missed_entry') &&
      !String(r.resolutionReason ?? '').startsWith('superseded') && num(r.exitPremium) == null && !/withheld|unmeasured/.test(String(r.resolutionReason ?? '') + String(r.outcomeNotes ?? ''))) {
    out.push({ kind: 'unpriced_outcome', detail: `${status} with no exit premium recorded` });
  }
  return out;
}

/** Data-health strip: gaps by ET day, newest first. Pure. */
export function dataHealth(rows: IdeaRowLike[], nowMs: number): { days: DayHealth[]; totals: Record<GapKind, number>; rows: number } {
  const byDay = new Map<string, DayHealth>();
  const totals: Record<GapKind, number> = { missing_contract: 0, stale_outcome: 0, mismatch: 0, unpriced_outcome: 0 };
  for (const r of rows) {
    const day = etDateKey(Date.parse(r.timestamp));
    let d = byDay.get(day);
    if (!d) { d = { day, total: 0, counts: { missing_contract: 0, stale_outcome: 0, mismatch: 0, unpriced_outcome: 0 }, items: [] }; byDay.set(day, d); }
    d.total++;
    for (const g of rowGaps(r, nowMs)) {
      d.counts[g.kind]++; totals[g.kind]++;
      if (d.items.length < 200) d.items.push({ id: r.id, symbol: r.symbol, source: String(r.source ?? 'unknown'), kind: g.kind, detail: g.detail });
    }
  }
  return { days: [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day)), totals, rows: rows.length };
}

/** ISO bounds [start, end) of an ET calendar day. Pure. */
export function etDayBounds(day: string): { fromIso: string; toIso: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const from = etWallMs(day, 0);
  const next = new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return { fromIso: new Date(from).toISOString(), toIso: new Date(etWallMs(next, 0)).toISOString() };
}

