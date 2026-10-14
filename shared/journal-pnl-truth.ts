/**
 * JOURNAL P&L TRUTH — one P&L definition for the NEXUS ideas book (operator, 2026-10-14:
 * "audit the P&L … verify everything, we need this accurate henceforth").
 *
 * WHAT WAS WRONG (Journal → NEXUS ideas, 2026-10-14)
 *   · header "Verified 203 (+$3,340) · 280 integrity-checked (+$1,875)" was the UNIT
 *     book (1 contract / $1,000 notional); the Net P&L tile (+$18,426, n=413) was the
 *     RISK-sized book of the same rows plus integrity-checked-only rows, and stock rows
 *     fractionally scaled to $500 risk — three numbers, three populations;
 *   · "integrity-checked" rows (never compared with a bar) were in the headline;
 *   · shares and crypto rows sat in an options desk's headline;
 *   · call accuracy (60%) was computed on every row, realized win rate (52%) on the
 *     counted ones — different n.
 *
 * THE ONE DEFINITION (PNL_TRUTH_VERSION)
 *   HEADLINE = closed OPTION trades whose P&L is BAR-VERIFIED:
 *     verified      the nightly bar recomputation (research/verify-nexus-book.ts →
 *                   the verify ledger) agreed with the recorded P&L;
 *     corrected     the recomputation disagreed but priced BOTH legs from the
 *                   contract's own bars — the bar value replaces the recorded one
 *                   (recorded value kept on the row, labelled);
 *     retro         a legacy shares idea from an option-capable engine, converted to
 *                   the contract the budget rule would have picked AT PUBLISH and
 *                   priced entry/exit from that contract's bars (scripts/
 *                   retro-options-convert.ts → the retro ledger). Labelled
 *                   "Options view (rule-picked, verified)".
 *   Duplicates (same position while an earlier one was open) are removed — the
 *   first is kept. Sized as WHOLE contracts whose debit fits the budget
 *   ($500 default, $1,000 max; shared/position-sizing.ts) — never fractional, and a
 *   bar-verified loss is never capped at a stop it did not fill at.
 *   Everything else is listed OUTSIDE the headline with its reason and never
 *   summed into it: bar_pending (closed, not yet bar-checked), bar_unverifiable,
 *   bar_mismatch, duplicate, integrity_fail, not_options (legacy shares with no
 *   verified options view), crypto_excluded (crypto stays crypto, labelled).
 *
 * Pure: no I/O. Server (server/journal-row-maps.ts) labels rows; the client sums
 * the rows the server marks counted — header, tiles, calendar, curve and insights
 * all read that one set.
 */

export const PNL_TRUTH_VERSION = 'pnl-truth-v1';

/** Engines whose legacy shares ideas get a rule-picked options view (operator list, 2026-10-14). */
export const RETRO_OPTION_ENGINES: ReadonlySet<string> = new Set(['market_scanner', 'quant', 'sector_ignition', 'leaders', 'gex_scanner', 'flow']);
/** Clean-era start (OUTCOME_BASELINE_DATE): conversions only from here. */
export const RETRO_SINCE = '2026-08-26';
/** Operator delta band for the rule pick (IV-implied delta at publish). */
export const RETRO_DELTA_MIN = 0.15;
export const RETRO_DELTA_MAX = 0.45;
export const RETRO_LEDGER_VERSION = 'retro-options-v1';

/**
 * Bar-recomputation bug classes whose recomputed value priced BOTH legs from the
 * contract's own bars (research/verify-nexus-book.ts verifyOption, full-bars path).
 * expiry_settlement is not here: there the entry is the recorded one.
 */
export const CORRECTABLE_BUG_CLASSES: ReadonlySet<string> = new Set([
  'exit_premium_not_traded', 'entry_premium_not_traded', 'entry_premium_at_publish_not_trigger', 'unexplained', 'exit_premium_pass',
]);

export type TruthClass =
  | 'verified' | 'corrected' | 'retro'
  | 'bar_pending' | 'bar_unverifiable' | 'bar_mismatch' | 'duplicate' | 'integrity_fail' | 'not_options' | 'crypto_excluded';

export const TRUTH_CLASS_LABEL: Record<TruthClass, string> = {
  verified: 'bar-verified — recorded P&L matched the contract\'s bars',
  corrected: 'bar-corrected — recorded P&L disagreed; both legs re-priced from the contract\'s bars',
  retro: 'options view (rule-picked, verified) — legacy shares idea converted to the contract the budget rule picks at publish, priced from its bars',
  bar_pending: 'closed, not yet bar-checked — the nightly verify (17:30 ET) has not reached it',
  bar_unverifiable: 'no contract/underlying bars to recompute it',
  bar_mismatch: 'bar recomputation disagrees and could not re-price both legs from bars',
  duplicate: 'same position as an earlier idea that was still open — counted once (first kept)',
  integrity_fail: 'fails a row-level integrity check (impossible / off-scale / synthetic)',
  not_options: 'published as shares; no verified options view — outside the options headline',
  crypto_excluded: 'crypto — labelled, outside the options headline',
};

export const HEADLINE_CLASSES: ReadonlySet<TruthClass> = new Set(['verified', 'corrected', 'retro']);

export interface TruthLedgerEntry {
  verdict: 'VERIFIED' | 'MISMATCH' | 'UNVERIFIABLE';
  recordedPnL: number | null;
  recomputedPnL: number | null;
  recomputedEntry?: number | null;
  recomputedExit?: number | null;
  bugClass: string | null;
  reason: string | null;
  /** Where the contract bars came from (massive:… / alpaca:… / yahoo-opr:…), when priced. */
  optionSource?: string | null;
}

export interface ClassifyInput {
  instrument: 'option' | 'shares' | 'crypto' | 'future' | 'other';
  duplicateOf: string | null;
  ledger: TruthLedgerEntry | null | undefined;
  /** A failing row-level integrity flag (shared/desk-integrity.ts). */
  integrityFail: boolean;
}

export interface Classified {
  cls: TruthClass;
  counted: boolean;
  /** corrected only: the bar-priced legs and unit (1-contract) P&L that replace the recorded ones. */
  corrected?: { entry: number; exit: number; pnl: number };
}

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const r2 = (x: number) => Math.round(x * 100) / 100;

/** True when a MISMATCH ledger entry carries a both-legs bar re-price we can count. */
export function isCorrectable(e: TruthLedgerEntry | null | undefined): boolean {
  if (!e || e.verdict !== 'MISMATCH' || !e.bugClass || !CORRECTABLE_BUG_CLASSES.has(e.bugClass)) return false;
  if (!(fin(e.recomputedEntry) && e.recomputedEntry > 0 && fin(e.recomputedExit) && e.recomputedExit >= 0 && fin(e.recomputedPnL))) return false;
  const src = String(e.optionSource ?? '');
  return src !== '' && src !== 'none';
}

/** The one classification of a CLOSED desk row. Pure. */
export function classifyClosedRow(a: ClassifyInput): Classified {
  if (a.duplicateOf) return { cls: 'duplicate', counted: false };
  if (a.instrument === 'crypto') return { cls: 'crypto_excluded', counted: false };
  if (a.instrument !== 'option') return { cls: 'not_options', counted: false };
  const e = a.ledger;
  if (e?.verdict === 'VERIFIED') return { cls: 'verified', counted: true };
  if (e && isCorrectable(e)) {
    return { cls: 'corrected', counted: true, corrected: { entry: r2(e.recomputedEntry!), exit: r2(e.recomputedExit!), pnl: r2(e.recomputedPnL!) } };
  }
  if (e?.verdict === 'MISMATCH') return { cls: 'bar_mismatch', counted: false };
  if (e?.verdict === 'UNVERIFIABLE') return { cls: 'bar_unverifiable', counted: false };
  if (a.integrityFail) return { cls: 'integrity_fail', counted: false };
  return { cls: 'bar_pending', counted: false };
}

// ── whole-contract sizing ───────────────────────────────────────────────────

/** Whole contracts a budget buys at an entry premium (0 = one contract costs more than the budget). */
export function contractsForBudget(budget: number, entryPremium: number): number {
  if (!(budget > 0) || !(entryPremium > 0)) return 0;
  return Math.floor(budget / (entryPremium * 100) + 1e-9);
}

/** Whole-contract P&L of an option trade at a budget; null when one contract is over budget. */
export function wholeContractPnl(entryPremium: number, exitPremium: number, budget: number): { qty: number; debit: number; pnl: number } | null {
  const qty = contractsForBudget(budget, entryPremium);
  if (qty < 1 || !fin(exitPremium)) return null;
  return { qty, debit: r2(qty * entryPremium * 100), pnl: r2(qty * (exitPremium - entryPremium) * 100) };
}

// ── headline summary (pure; client + server + tests) ───────────────────────

export interface TruthRowLike {
  status: string;
  realizedPnL?: number | null;
  verification?: { status?: string; truth?: TruthClass | null } | null;
}

export interface HeadlineSummary {
  version: typeof PNL_TRUTH_VERSION;
  n: number;
  pnl: number;
  byClass: Partial<Record<TruthClass, { n: number; pnl: number }>>;
  outside: { n: number; pnl: number };
}

/** Sum closed rows by truth class: headline = counted classes only. Pure. */
export function summarizeTruth(rows: readonly TruthRowLike[]): HeadlineSummary {
  const byClass: HeadlineSummary['byClass'] = {};
  let n = 0, pnl = 0, on = 0, op = 0;
  for (const r of rows) {
    if (r.status !== 'closed') continue;
    const cls = (r.verification?.truth ?? null) as TruthClass | null;
    const v = fin(r.realizedPnL) ? r.realizedPnL : 0;
    const k = cls ?? 'bar_pending';
    const cur = byClass[k] ?? { n: 0, pnl: 0 };
    cur.n++; cur.pnl = r2(cur.pnl + v);
    byClass[k] = cur;
    if (cls && HEADLINE_CLASSES.has(cls)) { n++; pnl += v; } else { on++; op += v; }
  }
  return { version: PNL_TRUTH_VERSION, n, pnl: r2(pnl), byClass, outside: { n: on, pnl: r2(op) } };
}

/** "3h ago" / "2d ago" for a ledger timestamp. */
export function ageText(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return 'age unknown';
  const m = Math.round((nowMs - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(m)) return 'age unknown';
  return m < 60 ? `${Math.max(0, m)}m old` : m < 2880 ? `${Math.round(m / 60)}h old` : `${Math.round(m / 1440)}d old`;
}

// ── retro (shares → options) conversion: rule pick, pure ──────────────────

export interface RetroCandidate {
  type: 'call' | 'put';
  strike: number;
  expiry: string; // YYYY-MM-DD
  dte: number;
  /** Contract price observed at/just before the idea's trigger (bar close). */
  price: number;
  /** Volume of that bar (0 = traded-through but no prints). */
  volume: number;
  occ: string;
}

export interface RetroPickInput {
  direction: 'long' | 'short';
  /** Underlying at the trigger. */
  spot: number;
  t1: number;
  /** Calendar days from trigger to each candidate's expiry is in `dte`. */
  candidates: RetroCandidate[];
  budget: number;
}

export interface RetroPick {
  occ: string; type: 'call' | 'put'; strike: number; expiry: string; dte: number;
  entry: number; delta: number; iv: number; qty: number; debit: number; payoffPerDollar: number; considered: number;
}

/**
 * The contract the budget rule picks from what was knowable at publish: call for a
 * long, put for a short; IV inverted from the contract's own price at the trigger;
 * |delta| in [0.15, 0.45]; whole contracts within the budget; traded (volume > 0);
 * best projected payoff at T1 per dollar (Black-Scholes re-price at the same IV,
 * half a day elapsed), tie → higher |delta|, then cheaper. Pure.
 */
export function pickRetroContract(
  input: RetroPickInput,
  bs: { price: (S: number, K: number, T: number, v: number, call: boolean) => number; delta: (S: number, K: number, T: number, v: number, call: boolean) => number; iv: (p: number, S: number, K: number, T: number, call: boolean) => number | null },
): { ok: true; pick: RetroPick } | { ok: false; reason: string; considered: number } {
  const type = input.direction === 'short' ? 'put' : 'call';
  const isCall = type === 'call';
  const rej = { type: 0, volume: 0, iv: 0, band: 0, budget: 0, payoff: 0 };
  let best: RetroPick | null = null;
  let considered = 0;
  for (const c of input.candidates) {
    if (c.type !== type) { rej.type++; continue; }
    considered++;
    if (!(c.volume > 0) || !(c.price > 0)) { rej.volume++; continue; }
    const T = Math.max(0.25, c.dte) / 365;
    const iv = bs.iv(c.price, input.spot, c.strike, T, isCall);
    if (iv == null) { rej.iv++; continue; }
    const d = Math.abs(bs.delta(input.spot, c.strike, T, iv, isCall));
    if (!(d >= RETRO_DELTA_MIN - 1e-9 && d <= RETRO_DELTA_MAX + 1e-9)) { rej.band++; continue; }
    const qty = contractsForBudget(input.budget, c.price);
    if (qty < 1) { rej.budget++; continue; }
    const Tl = Math.max(0.1, c.dte - 0.5) / 365;
    const now = bs.price(input.spot, c.strike, T, iv, isCall);
    const later = bs.price(input.t1, c.strike, Tl, iv, isCall);
    const intrinsic = Math.max(0, isCall ? input.t1 - c.strike : c.strike - input.t1);
    const atT1 = Math.max(intrinsic, c.price + later - now, 0);
    const ppd = (atT1 - c.price) / c.price;
    if (!(ppd > 0)) { rej.payoff++; continue; }
    const cand: RetroPick = {
      occ: c.occ, type, strike: c.strike, expiry: c.expiry, dte: c.dte, entry: r2(c.price), delta: r2(d), iv: Math.round(iv * 1000) / 1000,
      qty, debit: r2(qty * c.price * 100), payoffPerDollar: Math.round(ppd * 1000) / 1000, considered: 0,
    };
    if (!best || cand.payoffPerDollar > best.payoffPerDollar + 1e-9
      || (Math.abs(cand.payoffPerDollar - best.payoffPerDollar) <= 1e-9 && (cand.delta > best.delta || (cand.delta === best.delta && cand.entry < best.entry)))) best = cand;
  }
  if (!best) {
    const why = Object.entries(rej).filter(([k, n]) => n > 0 && k !== 'type').map(([k, n]) => `${n} ${k}`).join(', ');
    return { ok: false, reason: `no ${type} fits the rule (Δ ${RETRO_DELTA_MIN}–${RETRO_DELTA_MAX}, whole contracts ≤ $${input.budget}, traded at the trigger)${why ? `: ${why}` : ': no candidate contract had bars'}`, considered };
  }
  return { ok: true, pick: { ...best, considered } };
}

/** Expiries the rule considers: the nearest Friday with DTE ≥ minDte, then the monthly (3rd Friday) ≥ minDte. Pure. */
export function retroExpiries(triggerDay: string, minDte: number): string[] {
  const base = Date.parse(`${triggerDay}T12:00:00Z`);
  if (!Number.isFinite(base)) return [];
  const out: string[] = [];
  for (let d = Math.max(0, minDte); d <= minDte + 60 && out.length < 1; d++) {
    const dt = new Date(base + d * 86_400_000);
    if (dt.getUTCDay() === 5) out.push(dt.toISOString().slice(0, 10));
  }
  for (let d = Math.max(0, minDte); d <= minDte + 70; d++) {
    const dt = new Date(base + d * 86_400_000);
    if (dt.getUTCDay() === 5 && dt.getUTCDate() >= 15 && dt.getUTCDate() <= 21) {
      const s = dt.toISOString().slice(0, 10);
      if (!out.includes(s)) out.push(s);
      break;
    }
  }
  return out;
}

/** Minimum DTE for a legacy idea's holding period (budget-contract rule: day ≥ 1, swing/position ≥ hold days, default 3). */
export function retroMinDte(holdingPeriod: string | null | undefined, holdDays: number | null | undefined): number {
  const h = String(holdingPeriod ?? '').toLowerCase();
  if (h === 'day' || h === 'intraday' || h === 'scalp') return 1;
  return Math.max(1, Math.ceil(fin(holdDays) && holdDays > 0 ? holdDays : 3));
}

/** Strike grid around spot for listing-free candidate generation. Pure. */
export function strikeGrid(spot: number, type: 'call' | 'put', n = 10): number[] {
  const step = spot < 5 ? 0.5 : spot < 25 ? 1 : spot < 100 ? 2.5 : spot < 250 ? 5 : spot < 1000 ? 10 : 25;
  const atm = Math.round(spot / step) * step;
  const out: number[] = [];
  // OTM-leaning: the delta band 0.15–0.45 sits at/above spot for calls, at/below for puts.
  for (let i = -2; i < n - 2; i++) out.push(Math.round((atm + (type === 'call' ? i : -i) * step) * 1000) / 1000);
  return out.filter((k) => k > 0);
}

export interface RetroRecord {
  v: typeof RETRO_LEDGER_VERSION;
  id: string;
  symbol: string;
  source: string | null;
  direction: 'long' | 'short';
  status: 'verified' | 'unverifiable' | 'not_triggered';
  reason: string;
  /** The rule pick (null when nothing fit). */
  contract: { occ: string; label: string; type: 'call' | 'put'; strike: number; expiry: string; dte: number; delta: number; iv: number; qty: number; debit: number } | null;
  triggerAt: string | null;
  exitAt: string | null;
  entryPremium: number | null;
  exitPremium: number | null;
  peakPremium: number | null;
  /** 1-contract P&L (unit) and at the budget (whole contracts). */
  unitPnL: number | null;
  budgetPnL: number | null;
  budget: number;
  sources: { entry: string | null; exit: string | null };
  /** What the shares idea recorded ($1,000 notional), for comparison. */
  sharesPnL: number | null;
  at: string;
}

/** Read a retro ledger (object from JSON) into id → record. Pure. */
export function readRetroLedger(raw: unknown): Map<string, RetroRecord> {
  const out = new Map<string, RetroRecord>();
  const list: unknown[] = Array.isArray((raw as any)?.records) ? (raw as any).records : [];
  for (const x of list) {
    const r = x as RetroRecord;
    if (r && r.v === RETRO_LEDGER_VERSION && typeof r.id === 'string') out.set(r.id, r);
  }
  return out;
}

/** "Options view (rule-picked, verified): 10/17 105C ×3 @ $1.42 → $2.10 · +$204" */
export function retroLine(r: RetroRecord): string {
  if (r.status !== 'verified' || !r.contract) return `Options view (rule-picked): ${r.status.replace('_', ' ')} — ${r.reason}`;
  const c = r.contract;
  const money = (v: number | null) => v == null ? '—' : `${v < 0 ? '−' : '+'}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `Options view (rule-picked, verified): ${c.expiry.slice(5, 7)}/${c.expiry.slice(8, 10)} ${c.strike}${c.type === 'put' ? 'P' : 'C'} ×${c.qty} @ $${r.entryPremium?.toFixed(2)} → $${r.exitPremium?.toFixed(2)} · ${money(r.budgetPnL)} (Δ${c.delta.toFixed(2)}, IV ${Math.round(c.iv * 100)}%, bars ${r.sources.entry ?? '—'})`;
}
