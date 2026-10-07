/**
 * OPTION EXIT PREMIUM AT THE TOUCH, NOT AT THE TRACKER PASS.
 *
 * WHAT WAS WRONG (SR 11-7 v6 F-1, docs/LOSS_ATTRIBUTION_2026-09-30.md §6)
 * When an option idea's underlying touched its stop/target, the tracker priced
 * the contract at whatever the chain quoted on the pass that NOTICED it —
 * minutes or days later. 17 "hit_stop" rows booked gains (+$1,166).
 *
 * THE RULE (pure — the server fetches the bars)
 *   • Price the contract from its OWN bar at the touch time: the bar that
 *     contains the touch (or the first one after it, within `maxLagMs`). A gap
 *     fill (the underlying bar opened through the level) takes the option bar's
 *     OPEN; an intrabar touch takes that bar's CLOSE.
 *   • No contract bar there → the pass quote, labelled
 *     "priced at pass (touch price unavailable)".
 *   • Intrinsic floor at the underlying fill: a quote below intrinsic is stale.
 *   • A STOP never books a gain unless the stop fill itself is on the
 *     profitable side of entry (a trailed stop, or a gap in favour). Otherwise
 *     the premium is WITHHELD (null, with a note) rather than recorded as a
 *     win, and the caller logs the row.
 */

import { exceedsOptionValue, fillOnStrikeScale, optionSideOf, safeIntrinsic } from './option-value-bounds';

export interface PremiumBar { t: number; o: number; h: number; l: number; c: number }

export const EXIT_PREMIUM_TAG_RE = /\[exit-premium:(touch_bar|pass|withheld)\]/;
export const PRICED_AT_PASS = 'priced at pass (touch price unavailable)';

/** The contract's price at the touch, from its own bars (epoch-ms starts). */
export function premiumAtTouch(
  bars: PremiumBar[], touchMs: number,
  opts: { barMs?: number; maxLagMs?: number; gap?: boolean } = {},
): { premium: number; barStartMs: number; basis: 'open' | 'close' } | null {
  const barMs = opts.barMs ?? 5 * 60_000;
  const maxLag = opts.maxLagMs ?? 30 * 60_000;
  const sorted = bars.filter((b) => Number.isFinite(b.t)).sort((a, b) => a.t - b.t);
  const bar = sorted.find((b) => b.t <= touchMs && touchMs < b.t + barMs)
    ?? sorted.find((b) => b.t > touchMs && b.t - touchMs <= maxLag);
  if (!bar) return null;
  const basis = opts.gap ? 'open' : 'close';
  const px = basis === 'open' ? bar.o : bar.c;
  return Number.isFinite(px) && px > 0 ? { premium: px, barStartMs: bar.t, basis } : null;
}

export interface OptionBarrierExitInput {
  outcome: 'hit_target' | 'hit_stop';
  /** Underlying thesis direction (a bought put on a bearish thesis is 'short'). */
  direction: 'long' | 'short';
  /** Underlying plan entry. */
  entryPrice: number;
  /** Underlying fill: the level, or the gap bar's open. */
  fillPrice: number;
  entryPremium: number;
  /** From the contract's bar at the touch; null when unavailable. */
  touchPremium: number | null;
  /** Human detail for the touch source ("5m bar 14:35Z, SPY261016P00575000"). */
  touchDetail?: string;
  /** The quote on the tracker pass (fallback). */
  passPremium: number | null;
  strike?: number | null;
  optionType?: string | null;
}

export interface OptionBarrierExit {
  exitPremium: number | null;
  basis: 'touch_bar' | 'pass' | 'withheld' | 'none';
  note: string;
  /** Set when a stop exit would book a gain: allowed (genuine) or withheld. */
  stopGain?: 'allowed' | 'withheld';
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function priceOptionBarrierExit(i: OptionBarrierExitInput): OptionBarrierExit {
  const raw = i.touchPremium ?? i.passPremium;
  if (raw == null || !Number.isFinite(raw) || raw < 0) {
    return { exitPremium: null, basis: 'none', note: '[exit-premium:pass] no contract quote at the touch or at the pass — exit premium not recorded' };
  }
  const basis: 'touch_bar' | 'pass' = i.touchPremium != null ? 'touch_bar' : 'pass';
  let px = raw;
  let floorNote = '';
  const strike = Number(i.strike);
  if (Number.isFinite(strike) && strike > 0 && Number.isFinite(i.fillPrice) && i.fillPrice > 0) {
    // NEXUS book audit 2026-10-06: the floor only applies when the fill is on
    // the strike's scale — a premium-space or foreign-scale fill made the
    // "intrinsic" ≈ the strike and booked thousands per contract.
    const intrinsic = safeIntrinsic(i.optionType, strike, i.fillPrice);
    if (intrinsic == null) floorNote = ` (fill ${i.fillPrice} not on strike ${strike}'s scale — intrinsic floor skipped)`;
    else if (intrinsic > px) { floorNote = ` (quote ${r2(raw)} below intrinsic ${r2(intrinsic)} at the fill — intrinsic used)`; px = intrinsic; }
  }
  px = r2(px);
  const underlyingForCap = fillOnStrikeScale(i.fillPrice, strike) ? i.fillPrice : null;
  if (exceedsOptionValue(px, i.optionType, strike, underlyingForCap)) {
    return {
      exitPremium: null, basis: 'withheld',
      note: `[exit-premium:withheld] exit premium ${px} exceeds what the contract can be worth (${optionSideOf(i.optionType) === 'put' ? `put ≤ strike ${strike}` : `call ≤ underlying ${underlyingForCap}`}) — not recorded`,
    };
  }
  const how = basis === 'touch_bar'
    ? `[exit-premium:touch_bar] priced from the contract's own bar at the touch${i.touchDetail ? ` (${i.touchDetail})` : ''}`
    : `[exit-premium:pass] ${PRICED_AT_PASS}`;

  if (i.outcome === 'hit_stop' && px > i.entryPremium) {
    const inFavour = i.direction === 'long' ? i.fillPrice > i.entryPrice : i.fillPrice < i.entryPrice;
    if (inFavour) {
      return {
        exitPremium: px, basis, stopGain: 'allowed',
        note: `${how}${floorNote} · stop exit books a gain (${i.entryPremium} → ${px}): the stop filled at ${i.fillPrice}, on the profitable side of entry ${i.entryPrice}`,
      };
    }
    return {
      exitPremium: null, basis: 'withheld', stopGain: 'withheld',
      note: `[exit-premium:withheld] stop exit priced ${px} (${basis === 'touch_bar' ? 'touch bar' : 'at pass'}) above entry premium ${i.entryPremium}, ` +
        `but the stop filled at ${i.fillPrice}, against entry ${i.entryPrice} — a stop cannot book a gain; premium withheld pending review`,
    };
  }
  return { exitPremium: px, basis, note: `${how}${floorNote}` };
}
