/**
 * 0DTE DESK — which names get a card, and how the engine-state age is labelled.
 *
 * Operator, 2026-10-07: the fixed MSTR / META / BE / TSLA "desk engine" cards
 * said "evaluated 16.8h old" before the open — a stale age with no label, on
 * names nobody was trading. The desk now shows:
 *   • the SPX / index card (always);
 *   • an AUTO list — names with an open or today's short-dated option idea
 *     (NEXUS board, 0DTE desk, index scalps, flow ignition …) and today's
 *     flow-ignition triggers;
 *   • any ticker the operator searches, read on demand.
 *
 * Pure: no I/O.
 */
import { isShortDatedOptionIdea, type ShortDatedLike } from './short-dated-option';

const ET_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const etDay = (ms: number) => ET_DAY.format(new Date(ms));
const ET_HM = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
const etHm = (ms: number) => ET_HM.format(new Date(ms));

export interface ActiveIdeaLike extends ShortDatedLike {
  symbol: string;
  assetType?: string | null;
  outcomeStatus?: string | null;
  timestamp: string;
  qualitySignals?: string[] | null;
}
export interface FlowTriggerLike { symbol: string; at: string; side?: string | null }

export interface AutoName {
  symbol: string;
  /** Open short-dated option ideas on this name. */
  open: number;
  /** Short-dated option ideas published today (open or resolved). */
  today: number;
  /** Today's flow-ignition triggers. */
  flow: number;
  lastAt: string | null;
  /** One short line: "1 open · 2 today · flow 09:56". */
  why: string;
}

/** Index-scalp ideas published on SPY carry underlying:SPY — they belong to the SPX card. */
function nameOf(i: ActiveIdeaLike): string {
  const u = (i.qualitySignals ?? []).find((s) => typeof s === 'string' && s.startsWith('underlying:'))?.slice(11);
  if (String(i.dataSourceUsed ?? '').startsWith('GEX_index_scalp_') && (u === 'SPY' || i.symbol === 'SPX')) return 'SPX';
  return String(i.symbol ?? '').toUpperCase();
}

export function autoZeroDteNames(
  ideas: ActiveIdeaLike[], flow: FlowTriggerLike[], nowMs: number,
  opts: { exclude?: string[]; limit?: number } = {},
): AutoName[] {
  const today = etDay(nowMs);
  const ex = new Set((opts.exclude ?? []).map((s) => s.toUpperCase()));
  const m = new Map<string, { open: number; today: number; flow: number; last: number; flowAt: number[] }>();
  const at = (s: string) => { let e = m.get(s); if (!e) { e = { open: 0, today: 0, flow: 0, last: 0, flowAt: [] }; m.set(s, e); } return e; };
  for (const i of ideas) {
    if (String(i.assetType ?? 'option') !== 'option') continue;
    const t = Date.parse(i.timestamp);
    if (!Number.isFinite(t)) continue;
    if (!isShortDatedOptionIdea(i, t)) continue; // DTE judged at publish time
    const isOpen = !i.outcomeStatus || i.outcomeStatus === 'open';
    const isToday = etDay(t) === today;
    if (!isOpen && !isToday) continue;
    const e = at(nameOf(i));
    if (isOpen) e.open++;
    if (isToday) e.today++;
    e.last = Math.max(e.last, t);
  }
  for (const f of flow) {
    const t = Date.parse(f.at);
    if (!Number.isFinite(t) || etDay(t) !== today) continue;
    const e = at(String(f.symbol).toUpperCase());
    e.flow++; e.flowAt.push(t); e.last = Math.max(e.last, t);
  }
  const out: AutoName[] = [];
  for (const [symbol, e] of m) {
    if (!symbol || ex.has(symbol)) continue;
    const parts: string[] = [];
    if (e.open) parts.push(`${e.open} open`);
    if (e.today) parts.push(`${e.today} today`);
    if (e.flow) parts.push(`flow ${etHm(Math.max(...e.flowAt))}`);
    out.push({ symbol, open: e.open, today: e.today, flow: e.flow, lastAt: e.last ? new Date(e.last).toISOString() : null, why: parts.join(' · ') });
  }
  return out
    .sort((a, b) => (b.open - a.open) || (Date.parse(b.lastAt ?? '') || 0) - (Date.parse(a.lastAt ?? '') || 0) || a.symbol.localeCompare(b.symbol))
    .slice(0, opts.limit ?? 12);
}

/**
 * The engine-state stamp on a name card. Never a bare stale age:
 *   pre-market → "pre-market · entries from 09:31 (open drive) / 09:45";
 *   closed     → "session closed · last read HH:MM ET";
 *   an evaluation from an earlier session or > 15 min old is named as such.
 */
export function engineStampLabel(phaseId: string, evaluatedAgeSec: number | null, nowMs: number): string {
  if (phaseId === 'pre') return 'pre-market · entries from 09:31 (open drive) / 09:45';
  if (evaluatedAgeSec == null) return phaseId === 'closed' ? 'session closed · not evaluated this session' : 'not evaluated yet this session';
  const evalMs = nowMs - evaluatedAgeSec * 1000;
  const when = `${etHm(evalMs)} ET`;
  if (etDay(evalMs) !== etDay(nowMs)) return `last evaluated ${when} prior session — not current`;
  if (phaseId === 'closed') return `session closed · last evaluated ${when}`;
  if (evaluatedAgeSec > 15 * 60) return `last evaluated ${when} (${Math.round(evaluatedAgeSec / 60)}m ago — stale)`;
  return `evaluated ${evaluatedAgeSec < 90 ? `${Math.max(0, evaluatedAgeSec)}s` : `${Math.round(evaluatedAgeSec / 60)}m`} ago`;
}
