/**
 * PUBLISH GUARD — an option idea must carry its entry premium.
 *
 * WHAT WAS WRONG (SR 11-7 v6 F-4, docs/LOSS_ATTRIBUTION_2026-09-30.md §1)
 * 374 of 844 ideas could not be scored. 108 of them were options published with
 * no entry premium — all 142 spx_session ideas and 43 gex_scanner ones. The
 * journal (server/journal-row-maps.ts mapDeskIdea) scores an option on its
 * premiums, so those rows were silently dropped from every P&L number.
 *
 * THE RULE (applied at the single write point, storage.createTradeIdea)
 *   An automated option idea without a positive entry premium is published as
 *   an UNDERLYING-ONLY idea: assetType 'stock', no contract fields, the plan's
 *   entry/target/stop unchanged (they are already underlying levels), and the
 *   idea says so in its own text. The journal then scores it on the underlying
 *   at $1,000 notional. The contract it named is kept in the note, and its
 *   expiry becomes the idea's exit deadline (exitBy) when it had none, so the
 *   plan's horizon survives the conversion.
 *
 * Operator-authored ideas (manual / user) are left alone — a person may enter
 * an option before its fill is known.
 */
import { optionExpiryCloseMs } from './option-expiry';

export const UNDERLYING_ONLY_SIGNAL = 'underlying_only:no_entry_premium';
export const UNDERLYING_ONLY_NOTE_HEAD = 'Underlying-only idea';

const OPERATOR_SOURCES = new Set(['manual', 'user']);

interface GuardableIdea {
  assetType?: string | null;
  source?: string | null;
  symbol?: string | null;
  entryPremium?: number | null;
  optionType?: string | null;
  strikePrice?: number | null;
  expiryDate?: string | null;
  exitBy?: string | null;
  analysis?: string | null;
  qualitySignals?: unknown;
}

export function hasEntryPremium(idea: Pick<GuardableIdea, 'entryPremium'>): boolean {
  const p = Number(idea.entryPremium);
  return idea.entryPremium != null && Number.isFinite(p) && p > 0;
}

/**
 * Returns the idea unchanged when it is scorable; otherwise the underlying-only
 * version and the reason. Pure.
 */
export function ensureScorableOptionIdea<T extends GuardableIdea>(idea: T): { idea: T; converted: boolean; reason?: string } {
  if (idea.assetType !== 'option' || hasEntryPremium(idea)) return { idea, converted: false };
  if (OPERATOR_SOURCES.has(String(idea.source ?? '').toLowerCase())) return { idea, converted: false };

  const cp = String(idea.optionType ?? '').toLowerCase().startsWith('p') ? 'P' : String(idea.optionType ?? '') ? 'C' : '';
  const day = idea.expiryDate ? String(idea.expiryDate).slice(0, 10) : '';
  const contract = [idea.strikePrice != null ? `${idea.strikePrice}${cp}` : cp, day].filter(Boolean).join(' ');
  const reason = 'no entry premium was recorded for the option';
  const note = `${UNDERLYING_ONLY_NOTE_HEAD}: ${reason}${contract ? ` (${String(idea.symbol ?? '').toUpperCase()} ${contract})` : ''}, ` +
    'so it is published and scored on the underlying (entry/target/stop are underlying levels), not as a contract.';
  const closeMs = optionExpiryCloseMs(idea.expiryDate);
  const exitBy = idea.exitBy || (Number.isFinite(closeMs) ? new Date(closeMs).toISOString() : idea.exitBy);
  const signals = Array.isArray(idea.qualitySignals) ? [...(idea.qualitySignals as unknown[]), UNDERLYING_ONLY_SIGNAL] : [UNDERLYING_ONLY_SIGNAL];

  return {
    converted: true,
    reason,
    idea: {
      ...idea,
      assetType: 'stock',
      optionType: null,
      strikePrice: null,
      expiryDate: null,
      entryPremium: null,
      exitBy: exitBy ?? null,
      analysis: idea.analysis ? `${idea.analysis} ${note}` : note,
      qualitySignals: signals,
    },
  };
}
