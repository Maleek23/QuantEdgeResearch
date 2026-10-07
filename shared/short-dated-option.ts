/**
 * 0DTE / ≤1DTE IDEAS NEVER BECOME SHARES.
 *
 * WHAT WAS WRONG (operator, 2026-10-07)
 *   GOOGL zero_dte_flow 09:56 ET was published as a SHORT STOCK idea (2.89 sh,
 *   entry 346.23 / target 345.07 / stop 346.43) while its own catalyst read
 *   "GOOGL 345P 0DTE … mid $0.83". The liquidity gate's "no liquid strike →
 *   underlying-only" fallback (and the no-premium guard) turned a same-day
 *   option trigger into a share trade with a 0.2-point stop: a different trade
 *   from the one the engine saw, scored as if it were the same.
 *
 * THE RULE
 *   A short-dated option idea — expiring today or tomorrow, or produced by a
 *   same-day options engine (0DTE desk / flow / sniper, index scalps, the
 *   open-drive mirror, SPX fast moves) — is either published on a LIQUID
 *   contract (kept, or stepped to the nearest liquid strike) or WITHHELD with
 *   a logged reason. It is never converted to an underlying-only stock idea.
 *   Longer-dated swing ideas keep the underlying-only fallback.
 */
import { calendarDaysToExpiry } from './option-expiry';

/** Sources whose ideas are same-day option trades by construction. */
export const SHORT_DATED_SOURCES: ReadonlySet<string> = new Set([
  'zero_dte_flow', 'zero_dte_desk', 'zero_dte_sniper', 'index_scalp', 'spx_fast_move',
]);

/** Max calendar DTE treated as short-dated (0DTE and next-day). */
export const SHORT_DATED_MAX_DTE = 1;

export const SHORT_DATED_WITHHELD_CODE = 'short_dated_no_liquid_contract';

export interface ShortDatedLike {
  source?: string | null;
  dataSourceUsed?: string | null;
  expiryDate?: string | null;
  expiryTier?: string | null;
  optionDte?: number | null;
}

/** Why an idea counts as short-dated, or null when it does not. Pure. */
export function shortDatedReason(idea: ShortDatedLike, nowMs: number): string | null {
  const src = String(idea.source ?? '').toLowerCase();
  const dsu = String(idea.dataSourceUsed ?? '');
  // The 0DTE desk's 2–4 day swing ideas ride 30–60 DTE contracts — not same-day by source.
  if (SHORT_DATED_SOURCES.has(src) && !/_swing$/.test(dsu)) return `source ${src}`;
  if (dsu.startsWith('GEX_index_scalp_')) return 'index scalp';
  if (/open_drive/i.test(dsu)) return 'open drive';
  if (String(idea.expiryTier ?? '').toUpperCase() === '0DTE') return '0DTE tier';
  const od = idea.optionDte;
  if (od != null && Number.isFinite(Number(od)) && Number(od) <= SHORT_DATED_MAX_DTE) return `${Number(od)} DTE`;
  const dte = calendarDaysToExpiry(idea.expiryDate, nowMs);
  if (dte != null && dte <= SHORT_DATED_MAX_DTE) return `${Math.max(0, dte)} DTE`;
  return null;
}

export function isShortDatedOptionIdea(idea: ShortDatedLike, nowMs: number): boolean {
  return shortDatedReason(idea, nowMs) != null;
}

/**
 * The last check before an automated idea is written: a same-day engine idea
 * (by source, not by expiry) must carry a concrete contract — option, call/put,
 * strike, expiry. AMZN zero_dte_flow 2026-10-07 09:52 was published with no
 * strike; GOOGL / MSFT 09:56 / 09:58 as short stock. Returns the reason to
 * withhold, or null when the idea may be written.
 */
export function sameDayContractMissing(idea: ShortDatedLike & {
  assetType?: string | null; optionType?: string | null; strikePrice?: number | null;
}, nowMs: number): string | null {
  const sd = shortDatedReason({ source: idea.source, dataSourceUsed: idea.dataSourceUsed }, nowMs);
  if (!sd) return null;
  if (String(idea.assetType ?? '') !== 'option') return `${sd}: published as ${idea.assetType ?? 'unknown'} — a same-day engine idea is an option or nothing`;
  const t = String(idea.optionType ?? '').toLowerCase();
  if (t !== 'call' && t !== 'put') return `${sd}: no call/put on the contract`;
  if (!(Number(idea.strikePrice) > 0)) return `${sd}: no strike on the contract`;
  if (!idea.expiryDate) return `${sd}: no expiry on the contract`;
  return null;
}
