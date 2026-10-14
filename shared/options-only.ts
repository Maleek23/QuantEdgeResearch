/**
 * OPTIONS-ONLY FOR OPTION ENGINES (operator, 2026-10-13: "journal is doing
 * shares instead of options").
 *
 * WHAT WAS WRONG
 *   Three write-time fallbacks turned an option idea into a SHARE idea:
 *     · the premium guard (shared/option-premium-guard.ts) — no entry premium → 'stock'
 *     · the liquidity gate (server/lib/liquidity-gate.ts) — no liquid strike → 'stock'
 *     · producer fallbacks (gex-idea-scanner, gex-vex-scanner, sector-ignition,
 *       leaders) — contract selection failed → { ...base, assetType: 'stock' }
 *   Prod 2026-10-06..13: quant 17 / gex_scanner 5 / zero_dte_flow 3 /
 *   sector_ignition 1 / market_scanner 1 option ideas were published as shares.
 *
 * THE RULE (applied at the single write point, storage.createTradeIdea)
 *   An OPTION-INTENDED idea is published on a real, whole, liquid contract or
 *   not at all:
 *     1. primary contract passes liquidity (kept / stepped) → published as is;
 *     2. otherwise the BUDGET CONTRACT (shared/budget-contract.ts — whole
 *        contracts, liquidity-gated, delta band) becomes the tradable contract;
 *     3. no liquid whole contract → WITHHELD: reason logged and kept in the
 *        admin "withheld" list (analysis_audit_log, consumed_by 'withheld_idea').
 *   It is never converted to shares.
 *
 * OPTION-INTENDED = arrives as assetType 'option', OR carries the producer's
 * OPTION_INTENT_SIGNAL (a producer whose contract pick failed), OR comes from
 * an option-only engine (OPTION_ONLY_SOURCES).
 *
 * NO SHARES IDEAS AT ALL (operator decision 2026-10-14, options-only-v2): the
 * "Shares idea" exception is gone. Every automated equity idea (stock / penny
 * stock, any engine — market_scanner, quant, sector_ignition, leaders,
 * gex_scanner, flow, …) is OPTION-INTENDED at the write (isOptionIntendedWrite):
 * published on its contract, else the budget contract, else WITHHELD. Crypto
 * stays crypto (labelled, outside the options headline); futures stay futures.
 * Rows already published as shares are "Legacy shares idea" — the journal shows
 * the rule-picked options view beside them (shared/journal-pnl-truth.ts).
 */

export const OPTIONS_ONLY_VERSION = 'options-only-v2';

/** Engines whose every idea is an option trade by construction. A stock idea from these is never written. */
export const OPTION_ONLY_SOURCES: ReadonlySet<string> = new Set([
  'zero_dte_flow', 'zero_dte_desk', 'zero_dte_sniper', 'index_scalp', 'spx_fast_move', 'gex_scanner',
]);

/** A producer whose contract selection failed stamps this instead of silently publishing shares. */
export const OPTION_INTENT_SIGNAL = 'instrument_intent:option';
/** Signals left by the legacy option → shares conversions (rows already in the DB). */
export const LEGACY_CONVERSION_SIGNALS: readonly string[] = ['underlying_only:no_entry_premium', 'underlying_only:no_liquid_contract'];
export const OPTIONS_ONLY_WITHHELD_CODE = 'options_only_no_tradable_contract';
export const BUDGET_PROMOTED_SIGNAL = 'contract:budget_promoted';
export const SHARES_IDEA_LABEL = 'Legacy shares idea';
export const CONTRACT_NOT_RECORDED = 'contract not recorded';

export type InstrumentIntent = 'option' | 'shares' | 'crypto' | 'future' | 'other';

interface IntentRow {
  source?: string | null;
  assetType?: string | null;
  qualitySignals?: unknown;
  analysis?: string | null;
  dataSourceUsed?: string | null;
}

const signalsOf = (q: unknown): string[] => {
  if (Array.isArray(q)) return q.map((x) => String(x));
  if (typeof q === 'string') { try { const p = JSON.parse(q); return Array.isArray(p) ? p.map(String) : []; } catch { return []; } }
  return [];
};

export function hasOptionIntentSignal(row: IntentRow): boolean {
  return signalsOf(row.qualitySignals).includes(OPTION_INTENT_SIGNAL);
}

/**
 * Write-time rule (options-only-v2): an automated equity idea is option-intended —
 * any stock / penny_stock idea, the producer's intent signal, or an option-only
 * engine. Crypto / futures are not. Pure.
 */
export function isOptionIntendedWrite(row: IntentRow): boolean {
  const a = String(row.assetType ?? '').toLowerCase();
  if (a === 'option') return false; // already an option — nothing to convert
  if (a === 'crypto' || a === 'future' || a === 'futures') return false;
  return a === 'stock' || a === 'penny_stock' || hasOptionIntentSignal(row) || OPTION_ONLY_SOURCES.has(String(row.source ?? '').toLowerCase());
}

/** True when a STOCK row in the DB is really an option idea that a legacy fallback converted. Pure. */
export function wasConvertedToShares(row: IntentRow): boolean {
  const a = String(row.assetType ?? '');
  if (a !== 'stock' && a !== 'penny_stock') return false;
  const sig = signalsOf(row.qualitySignals);
  if (sig.includes(OPTION_INTENT_SIGNAL) || LEGACY_CONVERSION_SIGNALS.some((s) => sig.includes(s))) return true;
  if (/Underlying-only idea/i.test(String(row.analysis ?? ''))) return true;
  return OPTION_ONLY_SOURCES.has(String(row.source ?? '').toLowerCase());
}

/** What the engine meant to publish. Pure. */
export function instrumentIntent(row: IntentRow): InstrumentIntent {
  const a = String(row.assetType ?? '').toLowerCase();
  if (a === 'option') return 'option';
  if (a === 'crypto') return 'crypto';
  if (a === 'future' || a === 'futures') return 'future';
  if (a === 'stock' || a === 'penny_stock') return wasConvertedToShares(row) ? 'option' : 'shares';
  return 'other';
}

interface ContractRow extends IntentRow {
  strikePrice?: number | null;
  optionType?: string | null;
  expiryDate?: string | null;
  entryPremium?: number | null;
}

/** Why an option-intended row has no usable contract, or null when it has one. Pure. */
export function contractGap(row: ContractRow): string | null {
  if (instrumentIntent(row) !== 'option') return null;
  if (String(row.assetType ?? '') !== 'option') return 'option engine idea stored as shares — the contract was never recorded';
  const t = String(row.optionType ?? '').toLowerCase();
  if (t !== 'call' && t !== 'put') return 'no call/put on the contract';
  if (!(Number(row.strikePrice) > 0)) return 'no strike on the contract';
  if (!(Number(row.entryPremium) > 0)) return 'no entry premium on the contract';
  return null;
}

/** One instrument label for every surface: "Option", "Shares idea", "Contract not recorded", … Pure. */
export function instrumentLabel(row: ContractRow): string {
  const intent = instrumentIntent(row);
  if (intent === 'option') return contractGap(row) ? 'Contract not recorded' : 'Option';
  if (intent === 'shares') return SHARES_IDEA_LABEL;
  if (intent === 'crypto') return 'Crypto';
  if (intent === 'future') return 'Future';
  return String(row.assetType ?? 'unknown');
}

// ── budget contract promotion (pure) ────────────────────────────────────────

export interface PromotableBudgetContract {
  label: string;
  optionType: 'call' | 'put';
  strike: number;
  expiry: string;
  dte: number;
  entryPremium: number;
  delta: number;
  premiumT1: number;
  premiumT2: number | null;
  premiumStop: number;
  mapping: string;
  rationale: string;
  liquidity?: unknown;
}

/**
 * The idea published ON its budget contract: primary contract fields replaced
 * by the whole-contract, liquid budget pick; the premium plan (T1/T2/stop on
 * the contract) stored at convergenceSignalsJson.premiumPlan; the reason the
 * primary was replaced appended to the analysis. Pure.
 */
export function promoteBudgetContract<T extends Record<string, any>>(idea: T, bc: PromotableBudgetContract, why: string, nowMs: number): T {
  const cs = idea.convergenceSignalsJson && typeof idea.convergenceSignalsJson === 'object' ? idea.convergenceSignalsJson as Record<string, unknown> : {};
  const sig = signalsOf(idea.qualitySignals).filter((s) => s !== OPTION_INTENT_SIGNAL && !LEGACY_CONVERSION_SIGNALS.includes(s));
  const note = `Tradable contract: ${bc.label} @ $${bc.entryPremium.toFixed(2)} (budget contract — whole, liquid, Δ${Math.abs(bc.delta).toFixed(2)}, ${bc.dte} DTE). ` +
    `Primary contract not tradable: ${why}. Options-only rule: published on the budget contract, never as shares.`;
  return {
    ...idea,
    assetType: 'option',
    optionType: bc.optionType,
    strikePrice: bc.strike,
    expiryDate: bc.expiry,
    entryPremium: bc.entryPremium,
    optionDelta: bc.delta,
    optionDte: bc.dte,
    expiryTier: bc.dte <= 0 ? '0DTE' : idea.expiryTier ?? null,
    analysis: idea.analysis ? `${idea.analysis} ${note}` : note,
    qualitySignals: [...sig, BUDGET_PROMOTED_SIGNAL],
    convergenceSignalsJson: {
      ...cs,
      ...(bc.liquidity ? { contractLiquidity: bc.liquidity } : {}),
      premiumPlan: {
        v: 'premium-plan-v1', entry: bc.entryPremium, t1: bc.premiumT1, t2: bc.premiumT2, stop: bc.premiumStop,
        mapping: `budget contract: ${bc.mapping}`, source: 'budget_contract', at: new Date(nowMs).toISOString(),
      },
      optionsOnly: { v: OPTIONS_ONLY_VERSION, action: 'budget_promoted', why, at: new Date(nowMs).toISOString() },
    },
  };
}

/** The option-intended idea with its failed primary contract fields cleared, ready for the budget picker. Pure. */
export function stripFailedContract<T extends Record<string, any>>(idea: T): T {
  const sig = signalsOf(idea.qualitySignals).filter((s) => !LEGACY_CONVERSION_SIGNALS.includes(s));
  return { ...idea, assetType: 'option', qualitySignals: sig.includes(OPTION_INTENT_SIGNAL) ? sig : [...sig, OPTION_INTENT_SIGNAL] };
}

export interface WithheldRecord {
  v: typeof OPTIONS_ONLY_VERSION;
  code: string;
  reason: string;
  source: string;
  symbol: string;
  direction: string | null;
  contract: string | null;
  entryPrice: number | null;
  targetPrice: number | null;
  stopLoss: number | null;
  at: string;
}

/** What the admin "withheld" list stores for one refused idea. Pure. */
export function withheldRecord(idea: Record<string, any>, code: string, reason: string, nowMs: number): WithheldRecord {
  const t = String(idea.optionType ?? '').toLowerCase();
  const contract = Number(idea.strikePrice) > 0 && idea.expiryDate
    ? `${String(idea.symbol ?? '').toUpperCase()} ${String(idea.expiryDate).slice(0, 10)} ${idea.strikePrice}${t.startsWith('p') ? 'P' : 'C'}`
    : null;
  const n = (x: unknown) => (x == null || x === '' || !Number.isFinite(Number(x)) ? null : Number(x));
  return {
    v: OPTIONS_ONLY_VERSION, code, reason, source: String(idea.source ?? 'unknown'), symbol: String(idea.symbol ?? '').toUpperCase(),
    direction: idea.direction ?? null, contract, entryPrice: n(idea.entryPrice), targetPrice: n(idea.targetPrice), stopLoss: n(idea.stopLoss),
    at: new Date(nowMs).toISOString(),
  };
}
