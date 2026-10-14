/**
 * NEXUS P&L — the same money rules as the journal, applied to every NEXUS setup.
 *
 * Operator, 2026-10-14: "I don't see any P&L — NEXUS". The desk showed plans
 * with no dollars. This module turns a setup + its contract mark / exit into
 * a status-aware P&L, and a day of setups into a day line:
 *
 *   OPTIONS ONLY. A shares idea has no P&L here ("not in the options book").
 *   WHOLE CONTRACTS at the budget ($500 default, $1,000 option):
 *       qty = floor(budget ÷ (entry premium × 100))      (shared/journal-pnl-truth.ts contractsForBudget)
 *       P&L = qty × (premium − entry premium) × 100       (long premium; puts and calls alike)
 *   TRADABLE CONTRACT: the primary contract when one contract fits the budget,
 *       else the budget contract (shared/budget-contract.ts) the engine picked
 *       for exactly this case; neither → "over budget", no number.
 *   STATUS:
 *       waiting   no trigger yet            → "—" (a plan has no P&L)
 *       open      triggered / executed      → UNREALIZED from the contract's current mark
 *       resolved  outcome recorded          → REALIZED from the exit premium (+ peak %)
 *   MARKS ARE STAMPED: every mark carries its quote time; older than
 *       MARK_STALE_MS it is "stale", a delayed feed says "delayed". Never live
 *       unless it is.
 *   R = P&L ÷ (qty × (entry − premium stop) × 100), stop = the plan's premium
 *       stop or the sizing default (shared/position-sizing.ts effectivePremiumStop).
 *
 * Pure: no I/O. Client (NEXUS rows, Setup Detail, day strip, HISTORY) + tests.
 */
import { contractsForBudget } from './journal-pnl-truth';
import { effectivePremiumStop } from './position-sizing';

export const NEXUS_PNL_VERSION = 'nexus-pnl-v1';
export const PNL_BUDGETS = [500, 1000] as const;
export type PnlBudget = (typeof PNL_BUDGETS)[number];
export const DEFAULT_PNL_BUDGET: PnlBudget = 500;
/** A mark older than this is shown as stale (never as live). */
export const MARK_STALE_MS = 5 * 60_000;

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const r2 = (x: number) => Math.round(x * 100) / 100;
const r1 = (x: number) => Math.round(x * 10) / 10;

export interface BudgetContractLike {
  optionType: 'call' | 'put';
  strike: number;
  expiry: string;
  entryPremium: number;
  premiumStop?: number | null;
  premiumT1?: number | null;
  premiumT2?: number | null;
  label?: string;
  tracking?: {
    outcome?: string | null;
    lastMark?: number | null; lastMarkAt?: number | null;
    peak?: { premium: number; atMs: number } | null;
    t1HitAt?: number | null; t2HitAt?: number | null; stopHitAt?: number | null;
  } | null;
}

export interface TradableInput {
  symbol: string;
  assetType?: string | null;
  optionType?: string | null;
  strikePrice?: number | null;
  expiryDate?: string | null;
  entryPremium?: number | null;
  premiumStop?: number | null;
  zeroDte?: boolean;
  budgetContract?: BudgetContractLike | null;
}

export type Tradable =
  | {
    ok: true; basis: 'primary' | 'budget'; symbol: string; optionType: 'call' | 'put'; strike: number; expiry: string;
    entryPremium: number; premiumStop: number; stopBasis: string; qty: number; debit: number; budget: number;
    /** Instrument key shared with the journal's mark cache: O:SYM|YYYY-MM-DD|call|185 */
    key: string; label: string;
  }
  | { ok: false; reason: string; code: 'not_option' | 'no_contract' | 'over_budget' };

const typeOf = (t: unknown): 'call' | 'put' | null => {
  const s = String(t ?? '').toLowerCase();
  return s.startsWith('c') ? 'call' : s.startsWith('p') ? 'put' : null;
};

/** O:SYM|YYYY-MM-DD|call|185 — the same key server/journal-marks.ts instrumentKey builds. Pure. */
export function contractKey(symbol: string, expiry: string, optionType: 'call' | 'put', strike: number): string {
  return `O:${symbol.trim().toUpperCase()}|${expiry.slice(0, 10)}|${optionType}|${Number(strike)}`;
}

const fmtStrike = (k: number) => (Number.isInteger(k) ? String(k) : k.toFixed(1));
const shortExp = (exp: string) => { const [, m, d] = exp.split('-'); return m && d ? `${Number(m)}/${Number(d)}` : exp; };

/** The contract the budget actually trades, and its whole-contract size. Pure. */
export function tradableContract(i: TradableInput, budget: number): Tradable {
  if (String(i.assetType ?? '').toLowerCase() !== 'option') return { ok: false, code: 'not_option', reason: 'shares idea — not in the options book' };
  const sym = String(i.symbol ?? '').toUpperCase();
  const pType = typeOf(i.optionType);
  const pExp = String(i.expiryDate ?? '').slice(0, 10);
  const pStrike = Number(i.strikePrice);
  const pEntry = Number(i.entryPremium);
  const primaryOk = !!pType && /^\d{4}-\d{2}-\d{2}$/.test(pExp) && pStrike > 0 && pEntry > 0;
  const make = (basis: 'primary' | 'budget', type: 'call' | 'put', exp: string, strike: number, entry: number, planStop: number | null | undefined): Tradable | null => {
    const qty = contractsForBudget(budget, entry);
    if (qty < 1) return null;
    const st = effectivePremiumStop({ entryPremium: entry, premiumStop: planStop ?? null, zeroDte: !!i.zeroDte });
    return {
      ok: true, basis, symbol: sym, optionType: type, strike, expiry: exp, entryPremium: entry,
      premiumStop: st ? r2(st.stop) : r2(entry * 0.5), stopBasis: st?.basis ?? 'default', qty, debit: r2(qty * entry * 100), budget,
      key: contractKey(sym, exp, type, strike), label: `${sym} ${fmtStrike(strike)}${type === 'put' ? 'P' : 'C'} ${shortExp(exp)}`,
    };
  };
  if (primaryOk) {
    const p = make('primary', pType!, pExp, pStrike, pEntry, i.premiumStop);
    if (p) return p;
  }
  const bc = i.budgetContract;
  if (bc && bc.strike > 0 && bc.entryPremium > 0 && /^\d{4}-\d{2}-\d{2}$/.test(String(bc.expiry).slice(0, 10))) {
    const b = make('budget', bc.optionType, String(bc.expiry).slice(0, 10), bc.strike, bc.entryPremium, bc.premiumStop);
    if (b) return b;
  }
  if (!primaryOk) return { ok: false, code: 'no_contract', reason: 'contract or entry premium not recorded' };
  return { ok: false, code: 'over_budget', reason: `1 contract ($${Math.round(pEntry * 100)}) is over the $${budget} budget and no budget contract fits` };
}

/** Exit premium of a budget contract from its own tracking (first barrier), else null. Pure. */
export function budgetExitPremium(bc: BudgetContractLike | null | undefined): { premium: number; atMs: number | null; basis: string } | null {
  const t = bc?.tracking;
  if (!bc || !t) return null;
  if (t.outcome === 'hit_t2' && fin(bc.premiumT2)) return { premium: bc.premiumT2, atMs: t.t2HitAt ?? null, basis: 'budget contract hit T2' };
  if (t.outcome === 'hit_t1' && fin(bc.premiumT1)) return { premium: bc.premiumT1, atMs: t.t1HitAt ?? null, basis: 'budget contract hit T1' };
  if (t.outcome === 'hit_stop' && fin(bc.premiumStop)) return { premium: bc.premiumStop, atMs: t.stopHitAt ?? null, basis: 'budget contract hit its stop' };
  if (t.outcome === 'expired' && fin(t.lastMark)) return { premium: t.lastMark, atMs: t.lastMarkAt ?? null, basis: 'budget contract last mark at expiry' };
  return null;
}

export type PnlState = 'waiting' | 'open' | 'resolved';

/** Lifecycle → P&L state. `outcomeStatus` (stored row) wins over the board's lifecycle. Pure. */
export function pnlStateOf(p: { lifecycleState?: string | null; outcomeStatus?: string | null; triggeredAt?: string | null; isBotHeld?: boolean }): PnlState {
  const o = String(p.outcomeStatus ?? '').toLowerCase();
  if (o && o !== 'open') return 'resolved';
  const s = String(p.lifecycleState ?? '').toLowerCase();
  if (s === 'closed') return 'resolved';
  if (s === 'triggered' || s === 'executed' || p.isBotHeld) return 'open';
  return 'waiting';
}

export interface MarkLike { price: number; asOf: string; delayed: boolean; source: string }

export interface PremiumPoint { premium: number; atMs: number | null }

export interface NexusPnl {
  v: typeof NEXUS_PNL_VERSION;
  status: PnlState | 'none';
  /** Why there is no number (status none, or open without a mark). */
  reason: string | null;
  tradable: Extract<Tradable, { ok: true }> | null;
  /** Current mark (open) or exit premium (resolved). */
  premium: number | null;
  premiumAtMs: number | null;
  premiumKind: 'mark' | 'exit' | null;
  /** Mark only: feed is delayed / older than MARK_STALE_MS. */
  delayed: boolean;
  stale: boolean;
  source: string | null;
  loadingMark: boolean;
  pnl: number | null;
  pct: number | null;
  r: number | null;
  peak: (PremiumPoint & { pct: number; pnl: number }) | null;
  trough: (PremiumPoint & { pct: number; pnl: number }) | null;
}

export interface PnlArgs {
  state: PnlState;
  tradable: Tradable;
  /** Open: the contract's mark; 'loading' while the batched marks endpoint is still fetching it. */
  mark?: MarkLike | 'loading' | null;
  /** Resolved: the exit premium (primary: stored exitPremium; budget: budgetExitPremium). */
  exit?: PremiumPoint | null;
  peak?: PremiumPoint | null;
  trough?: PremiumPoint | null;
  nowMs: number;
}

/** One setup's P&L. Pure. */
export function nexusPnl(a: PnlArgs): NexusPnl {
  const base: NexusPnl = {
    v: NEXUS_PNL_VERSION, status: a.state, reason: null, tradable: null, premium: null, premiumAtMs: null, premiumKind: null,
    delayed: false, stale: false, source: null, loadingMark: false, pnl: null, pct: null, r: null, peak: null, trough: null,
  };
  if (!a.tradable.ok) return { ...base, status: a.state === 'waiting' ? 'waiting' : 'none', reason: a.tradable.reason };
  const t = a.tradable;
  base.tradable = t;
  if (a.state === 'waiting') return base;
  const money = (px: number) => r2(t.qty * (px - t.entryPremium) * 100);
  const pctOf = (px: number) => r1(((px - t.entryPremium) / t.entryPremium) * 100);
  const riskPer = t.entryPremium - t.premiumStop;
  const rOf = (pnl: number) => (riskPer > 0 ? r2(pnl / (t.qty * riskPer * 100)) : null);
  const ext = (p: PremiumPoint | null | undefined) => (p && fin(p.premium) && p.premium >= 0 ? { ...p, pct: pctOf(p.premium), pnl: money(p.premium) } : null);
  let px: number | null = null;
  if (a.state === 'open') {
    if (a.mark === 'loading') return { ...base, loadingMark: true, reason: 'loading mark', peak: ext(a.peak), trough: ext(a.trough) };
    if (!a.mark || !fin(a.mark.price) || a.mark.price < 0) return { ...base, reason: 'no contract mark', peak: ext(a.peak), trough: ext(a.trough) };
    const at = Date.parse(a.mark.asOf);
    px = a.mark.price;
    Object.assign(base, {
      premium: px, premiumAtMs: Number.isFinite(at) ? at : null, premiumKind: 'mark', source: a.mark.source,
      delayed: !!a.mark.delayed, stale: !Number.isFinite(at) || a.nowMs - at > MARK_STALE_MS,
    });
  } else {
    if (!a.exit || !fin(a.exit.premium) || a.exit.premium < 0) return { ...base, reason: 'exit premium not recorded', peak: ext(a.peak), trough: ext(a.trough) };
    px = a.exit.premium;
    Object.assign(base, { premium: px, premiumAtMs: a.exit.atMs, premiumKind: 'exit' });
  }
  const pnl = money(px);
  // Peak never below what the position shows now/at exit once above entry; trough never above it.
  const pk = a.peak && fin(a.peak.premium) ? (a.peak.premium >= px ? a.peak : { premium: px, atMs: base.premiumAtMs }) : null;
  const tr = a.trough && fin(a.trough.premium) ? (a.trough.premium <= px ? a.trough : { premium: px, atMs: base.premiumAtMs }) : null;
  return { ...base, pnl, pct: pctOf(px), r: rOf(pnl), peak: ext(pk), trough: ext(tr) };
}

// ── text ────────────────────────────────────────────────────────────────────

export const usd = (v: number) => `${v < 0 ? '−' : '+'}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: v !== 0 && Math.abs(v) < 100 ? 2 : 0, minimumFractionDigits: 0 })}`;
export const pctText = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`;

/** "12s" / "4m" / "3h" — age of an observation. Pure. */
export function ageShort(atMs: number | null, nowMs: number): string {
  if (atMs == null) return 'age ?';
  const s = Math.max(0, Math.round((nowMs - atMs) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : s < 86_400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86_400)}d`;
}

export type PnlTone = 'gain' | 'loss' | 'flat' | 'muted';
export interface PnlChip { text: string; sub: string | null; tone: PnlTone; title: string }

/** Row chip: "—" waiting; "+$120 +24%" open (age · delayed); realized + "peak +92%". Pure. */
export function pnlChip(p: NexusPnl, nowMs: number): PnlChip {
  const tone: PnlTone = p.pnl == null ? 'muted' : p.pnl > 0 ? 'gain' : p.pnl < 0 ? 'loss' : 'flat';
  const t = p.tradable;
  const size = t ? `${t.qty}× ${t.label}${t.basis === 'budget' ? ' (budget contract)' : ''} · $${t.debit.toLocaleString('en-US')} debit at $${t.budget}` : '';
  if (p.status === 'waiting') return { text: '—', sub: 'not triggered', tone: 'muted', title: `No trigger yet — a plan has no P&L.${size ? ` Would trade ${size}.` : ''}` };
  if (p.status === 'none') return { text: 'no P&L', sub: p.reason, tone: 'muted', title: p.reason ?? 'no P&L' };
  if (p.loadingMark) return { text: 'loading mark', sub: t ? `${t.qty}× ${t.label}` : null, tone: 'muted', title: `Fetching the contract mark… ${size}` };
  if (p.pnl == null || p.pct == null) return { text: p.status === 'open' ? 'no mark' : 'no exit', sub: p.reason, tone: 'muted', title: `${p.reason ?? ''}${size ? ` — ${size}` : ''}` };
  if (p.status === 'open') {
    const age = ageShort(p.premiumAtMs, nowMs);
    const flags = [p.delayed ? 'delayed' : null, p.stale ? 'stale' : null].filter(Boolean).join(' · ');
    return {
      text: `${usd(p.pnl)} ${pctText(p.pct)}`, sub: `unrealized · mark ${age}${flags ? ` · ${flags}` : ''}`, tone,
      title: `Unrealized: ${size}. Mark $${p.premium!.toFixed(2)} (${p.source ?? 'feed'}, ${age} old${flags ? `, ${flags}` : ''}) vs entry $${t!.entryPremium.toFixed(2)}.`,
    };
  }
  return {
    text: `${usd(p.pnl)} ${pctText(p.pct)}`, sub: `realized${p.peak && p.peak.pct > 0 ? ` · peak ${pctText(p.peak.pct)}` : ''}`, tone,
    title: `Realized: ${size}. Exit $${p.premium!.toFixed(2)} vs entry $${t!.entryPremium.toFixed(2)}.${p.peak ? ` Peak premium $${p.peak.premium.toFixed(2)} (${pctText(p.peak.pct)}).` : ''}`,
  };
}

// ── day line ────────────────────────────────────────────────────────────────

export interface DayRow { id: string; symbol: string; pnl: NexusPnl }
export interface DaySummary {
  realized: number; unrealized: number; total: number;
  wins: number; losses: number; flat: number; open: number; waiting: number;
  /** Open rows without a usable mark (loading / not quoted) — not in unrealized. */
  unmarked: number;
  /** Resolved rows with no exit premium, or ideas with no tradable contract. */
  unpriced: number;
  staleMarks: number;
  best: { id: string; symbol: string; pnl: number; kind: 'realized' | 'unrealized' } | null;
  worst: { id: string; symbol: string; pnl: number; kind: 'realized' | 'unrealized' } | null;
}

/** Sum a day of setups: realized (closed) + unrealized (open, marked). Pure. */
export function summarizeDay(rows: readonly DayRow[]): DaySummary {
  const s: DaySummary = { realized: 0, unrealized: 0, total: 0, wins: 0, losses: 0, flat: 0, open: 0, waiting: 0, unmarked: 0, unpriced: 0, staleMarks: 0, best: null, worst: null };
  for (const { id, symbol, pnl: p } of rows) {
    if (p.status === 'waiting') { s.waiting++; continue; }
    // Shares ideas are outside the options book — not "unpriced", just not counted.
    if (p.status === 'none') { if (!String(p.reason ?? '').startsWith('shares idea')) s.unpriced++; continue; }
    if (p.status === 'open') {
      s.open++;
      if (p.pnl == null) { s.unmarked++; continue; }
      if (p.stale) s.staleMarks++;
      s.unrealized += p.pnl;
    } else {
      if (p.pnl == null) { s.unpriced++; continue; }
      s.realized += p.pnl;
      if (p.pnl > 0) s.wins++; else if (p.pnl < 0) s.losses++; else s.flat++;
    }
    const kind = p.status === 'open' ? 'unrealized' as const : 'realized' as const;
    if (!s.best || p.pnl > s.best.pnl) s.best = { id, symbol, pnl: p.pnl, kind };
    if (!s.worst || p.pnl < s.worst.pnl) s.worst = { id, symbol, pnl: p.pnl, kind };
  }
  s.realized = r2(s.realized); s.unrealized = r2(s.unrealized); s.total = r2(s.realized + s.unrealized);
  return s;
}

// ── verify-ledger chip ──────────────────────────────────────────────────────

export interface PnlVerification {
  status: 'verified' | 'corrected' | 'unverified';
  /** Short reason for unverified / corrected. */
  detail: string;
  ledgerAsOf: string | null;
}

/** Verify-ledger entry (server/desk-verify-ledger.ts) → chip. Open ideas are never verified (nothing closed to check). Pure. */
export function verificationOf(
  entry: { verdict: string; recomputedPnL?: number | null; recomputedEntry?: number | null; recomputedExit?: number | null; reason?: string | null; bugClass?: string | null } | null | undefined,
  ledgerAsOf: string | null,
): PnlVerification {
  if (!ledgerAsOf) return { status: 'unverified', detail: 'verify ledger not available', ledgerAsOf: null };
  if (!entry) return { status: 'unverified', detail: 'not bar-checked yet (nightly verify 17:30 ET)', ledgerAsOf };
  if (entry.verdict === 'VERIFIED') return { status: 'verified', detail: 'recorded P&L matched the contract bars', ledgerAsOf };
  if (entry.verdict === 'MISMATCH' && fin(entry.recomputedEntry) && fin(entry.recomputedExit)) {
    return { status: 'corrected', detail: `bars disagree — re-priced ${entry.recomputedEntry.toFixed(2)} → ${entry.recomputedExit.toFixed(2)}`, ledgerAsOf };
  }
  return { status: 'unverified', detail: [entry.verdict.toLowerCase(), entry.bugClass, entry.reason].filter(Boolean).join(': ').slice(0, 160), ledgerAsOf };
}
