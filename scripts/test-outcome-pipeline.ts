/**
 * Outcome/idea pipeline defects from docs/LOSS_ATTRIBUTION_2026-09-30.md and
 * docs/SR11-7_VALIDATION_v6.md (no DB, no network):
 *   F-3  option expiry = 16:00 ET on the expiry date (shared/option-expiry.ts)
 *   F-7  holding period from contract DTE; F-8 shared 1.25× ATR stop floor
 *   F-1/F-2  barrier touch searched from publication; gap fills at the open;
 *        option exits priced at the touch; a stop never books a false gain
 *   F-4  option ideas without an entry premium publish as underlying-only
 *   npm run test:outcome-pipeline
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  optionExpiryCloseMs, isOptionExpired, calendarDaysToExpiry, holdingPeriodForDte, expiryDay, nyWallTimeMs, nyDayMinute,
} from '../shared/option-expiry';
import { expiryCloseIso } from '../shared/journal-expiry';
import { horizonTradingDays } from '../shared/loss-rules';
import { planExitTiming, barrierFill, formatExitDate, type TimedBar, type ExitTimingIdea } from '../shared/exit-hit-time';
import { premiumAtTouch, priceOptionBarrierExit, PRICED_AT_PASS } from '../shared/option-exit-pricing';
import { exceedsOptionValue, fillOnStrikeScale, maxOptionValue, safeIntrinsic } from '../shared/option-value-bounds';
import { ensureScorableOptionIdea, UNDERLYING_ONLY_SIGNAL, UNDERLYING_ONLY_NOTE_HEAD } from '../shared/option-premium-guard';
import { computeAtrStopFloor, atr14, type DailyBar } from '../server/lib/atr-stop-floor';
import { optionPublishPlan } from '../server/lib/option-publish-plan';
import { pickSessionContract } from '../server/lib/session-contract';
import { toExitTimingIdea } from '../server/lib/exit-time-bars';
import { PerformanceValidator } from '../server/performance-validator';
import { deadlineOf, type RepairRow } from '../server/lib/exit-date-repair';
import { mapDeskIdea } from '../server/journal-row-maps';

const tests: Array<[string, () => void | Promise<void>]> = [];
const t = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const ROOT = path.resolve(import.meta.dirname ?? __dirname, '..');
const src = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ── 1. EXPIRY = 16:00 ET ─────────────────────────────────────────────────
t('date-only expiry closes 16:00 EDT (20:00Z) — not 00:00Z / 8 PM ET the evening before', () => {
  assert.equal(new Date(optionExpiryCloseMs('2026-10-01')).toISOString(), '2026-10-01T20:00:00.000Z');
  // The bug: new Date('2026-10-01') is 2026-09-30 20:00 ET.
  assert.equal(nyDayMinute(new Date('2026-10-01').getTime()).day, '2026-09-30');
});
t('EST dates close at 21:00Z; DST boundaries are exact', () => {
  assert.equal(new Date(optionExpiryCloseMs('2026-12-18')).toISOString(), '2026-12-18T21:00:00.000Z');
  // 2026 DST: starts Sun 03-08, ends Sun 11-01.
  assert.equal(new Date(optionExpiryCloseMs('2026-03-06')).toISOString(), '2026-03-06T21:00:00.000Z'); // Fri before spring-forward (EST)
  assert.equal(new Date(optionExpiryCloseMs('2026-03-09')).toISOString(), '2026-03-09T20:00:00.000Z'); // Mon after (EDT)
  assert.equal(new Date(optionExpiryCloseMs('2026-10-30')).toISOString(), '2026-10-30T20:00:00.000Z'); // Fri before fall-back (EDT)
  assert.equal(new Date(optionExpiryCloseMs('2026-11-02')).toISOString(), '2026-11-02T21:00:00.000Z'); // Mon after (EST)
  assert.equal(new Date(nyWallTimeMs('2026-11-01', 16 * 60)).toISOString(), '2026-11-01T21:00:00.000Z'); // the fall-back Sunday itself
  assert.equal(new Date(nyWallTimeMs('2026-03-08', 16 * 60)).toISOString(), '2026-03-08T20:00:00.000Z'); // the spring-forward Sunday
});
t('expiry formats: ISO timestamp keeps its date, US format, Date object, junk', () => {
  assert.equal(expiryDay('2026-10-16T00:00:00.000Z'), '2026-10-16');
  assert.equal(expiryDay('10/16/2026'), '2026-10-16');
  assert.equal(expiryDay(new Date('2026-10-16')), '2026-10-16');
  assert.equal(expiryDay('soon'), null);
  assert.ok(Number.isNaN(optionExpiryCloseMs(null)));
  assert.equal(isOptionExpired('garbage', Date.now()), false);
});
t('0DTE idea is live all expiry day and expired only from 16:00 ET', () => {
  const day = '2026-09-30';
  assert.equal(isOptionExpired(day, Date.parse('2026-09-30T00:30:00Z')), false); // 8:30 PM ET the 29th — the old bug expired here
  assert.equal(isOptionExpired(day, Date.parse('2026-09-30T14:00:00Z')), false); // 10:00 ET
  assert.equal(isOptionExpired(day, Date.parse('2026-09-30T19:59:00Z')), false); // 15:59 ET
  assert.equal(isOptionExpired(day, Date.parse('2026-09-30T20:00:00Z')), true);  // 16:00 ET
});
t('journal expiryCloseIso delegates to the shared helper (both seasons)', () => {
  assert.equal(expiryCloseIso('2026-09-18'), '2026-09-18T20:00:00.000Z');
  assert.equal(expiryCloseIso('2026-01-16'), '2026-01-16T21:00:00.000Z');
});
t('calendar DTE counts New York days (evening UTC rollover does not add a day)', () => {
  assert.equal(calendarDaysToExpiry('2026-10-16', Date.parse('2026-09-30T14:00:00Z')), 16);
  assert.equal(calendarDaysToExpiry('2026-09-30', Date.parse('2026-10-01T02:00:00Z')), 0); // 22:00 ET on the 30th
  assert.equal(calendarDaysToExpiry('2026-09-29', Date.parse('2026-09-30T14:00:00Z')), -1);
});
t('validator: an option expiring TOMORROW is not expired now (old parse expired it from 8 PM ET today)', () => {
  const tomorrow = nyDayMinute(Date.now() + 86_400_000).day;
  const r = PerformanceValidator.validateTradeIdea({
    id: 'x', symbol: 'IWM', assetType: 'option', direction: 'short', optionType: 'put', strikePrice: 240, expiryDate: tomorrow,
    entryPrice: 245, targetPrice: 240, stopLoss: 250, timestamp: new Date(Date.now() - 60_000).toISOString(), outcomeStatus: 'open',
    convergenceSignalsJson: { executionAudit: { version: 1, state: 'triggered', triggerObservedAt: new Date(Date.now() - 60_000).toISOString() } },
    highestPriceReached: 245, lowestPriceReached: 245,
  } as any, 245);
  assert.notEqual(r.outcomeStatus, 'expired');
});
t('validator: an expired option is stamped at 16:00 ET of its expiry, never before publication', () => {
  const ts = '2026-09-28T14:00:00Z';
  const r: any = PerformanceValidator.validateTradeIdea({
    id: 'x', symbol: 'IWM', assetType: 'option', direction: 'short', optionType: 'put', strikePrice: 240, expiryDate: '2026-09-29',
    entryPrice: 245, targetPrice: 240, stopLoss: 250, timestamp: ts, outcomeStatus: 'open',
    convergenceSignalsJson: { executionAudit: { version: 1, state: 'triggered', triggerObservedAt: ts } },
    highestPriceReached: 245, lowestPriceReached: 245,
  } as any, 245);
  assert.equal(r.outcomeStatus, 'expired');
  assert.equal(r.deadlineMs, Date.parse('2026-09-29T20:00:00Z'));
  assert.equal(r.exitDate, formatExitDate(Date.parse('2026-09-29T20:00:00Z')));
  // Published AFTER its contract's close (after-close 0DTE): the deadline is the publish time, not earlier.
  const late = '2026-09-29T22:30:00Z';
  const r2: any = PerformanceValidator.validateTradeIdea({
    id: 'y', symbol: 'SPY', assetType: 'option', direction: 'long', optionType: 'call', strikePrice: 700, expiryDate: '2026-09-29',
    entryPrice: 690, targetPrice: 700, stopLoss: 680, timestamp: late, outcomeStatus: 'open',
    convergenceSignalsJson: { executionAudit: { version: 1, state: 'triggered', triggerObservedAt: late } },
    highestPriceReached: 690, lowestPriceReached: 690,
  } as any, 690);
  assert.equal(r2.deadlineMs, Date.parse(late));
});
t('exit-date repair uses the same 16:00 ET deadline', () => {
  const row = { id: 'r', symbol: 'IWM', assetType: 'option', direction: 'short', entryPrice: 1, targetPrice: 1, stopLoss: 1,
    timestamp: '2026-09-28T14:00:00Z', outcomeStatus: 'expired', resolutionReason: 'auto_expired', exitDate: null, exitPrice: null,
    percentGain: null, predictionValidatedAt: null, outcomeNotes: null, expiryDate: '2026-09-29' } as RepairRow;
  assert.equal(deadlineOf(row, Date.parse('2026-10-01T00:00:00Z')), Date.parse('2026-09-29T20:00:00Z'));
  assert.equal(deadlineOf(row, Date.parse('2026-09-29T19:00:00Z')), null); // 15:00 ET — not yet
});
t('loss-rules horizon caps at the 16:00 ET expiry close (EST contract)', () => {
  // Published Mon 2026-12-14 15:00 ET (20:00Z), expiry Fri 12-18 → 4 days 1h calendar → floor(4.04*5/7)=2
  assert.equal(horizonTradingDays({ holdingPeriod: 'swing', expiryDate: '2026-12-18', publishedMs: Date.parse('2026-12-14T20:00:00Z') }), 2);
});
t('no raw `new Date(idea.expiryDate)` left in the outcome path', () => {
  for (const f of ['server/performance-validator.ts', 'server/lib/exit-date-repair.ts']) {
    assert.doesNotMatch(src(f), /new Date\((idea|row)\.expiryDate\)/, f);
  }
  assert.doesNotMatch(src('server/storage.ts'), /new Date\(idea\.expiryDate\)\.getTime\(\)/);
});

// ── 2. HOLDING PERIOD FROM DTE + SHARED ATR FLOOR ────────────────────────
t('holding period from DTE: 0 → day, 1–10 → swing, >10 → position', () => {
  assert.equal(holdingPeriodForDte(0), 'day');
  assert.equal(holdingPeriodForDte(1), 'swing');
  assert.equal(holdingPeriodForDte(10), 'swing');
  assert.equal(holdingPeriodForDte(16), 'position');
  assert.equal(holdingPeriodForDte(null, { fallback: 'day' }), 'day');
});
const daily = (atrish: number, n = 20, px = 250): DailyBar[] =>
  Array.from({ length: n }, () => ({ high: px + atrish / 2, low: px - atrish / 2, close: px }));
t('ATR floor: widens a swing stop inside 1.25×ATR, restates R, leaves day trades and wide stops alone', () => {
  assert.equal(atr14(daily(4)), 4);
  const w = computeAtrStopFloor({ symbol: 'IWM', entry: 250, stop: 248, target: 256, direction: 'long', holdingPeriod: 'swing', assetType: 'option' }, daily(4));
  assert.equal(w.widened, true);
  assert.equal(w.stopLoss, 245); // 250 − 1.25×4
  assert.equal(w.riskRewardRatio, 1.2);
  assert.match(w.note, /Stop widened from \$248\.00 to \$245\.00 \(1\.25× ATR \$4\.00\)/);
  const s = computeAtrStopFloor({ symbol: 'IWM', entry: 250, stop: 252, target: 244, direction: 'bearish', holdingPeriod: 'position', assetType: 'stock' }, daily(4));
  assert.equal(s.stopLoss, 255);
  assert.equal(computeAtrStopFloor({ symbol: 'IWM', entry: 250, stop: 248, direction: 'long', holdingPeriod: 'day' }, daily(4)).widened, false);
  assert.equal(computeAtrStopFloor({ symbol: 'IWM', entry: 250, stop: 240, direction: 'long', holdingPeriod: 'swing' }, daily(4)).widened, false);
  assert.equal(computeAtrStopFloor({ symbol: 'BTC', entry: 250, stop: 248, direction: 'long', holdingPeriod: 'swing', assetType: 'crypto' }, daily(4)).widened, false);
  assert.equal(computeAtrStopFloor({ symbol: 'IWM', entry: 250, stop: 248, direction: 'long', holdingPeriod: 'swing' }, daily(4, 10)).widened, false); // too few bars
});
t('GEX publish plan: the 16-DTE IWM put is a position hold and gets the ATR floor (the 09-30 shakeouts)', async () => {
  const now = Date.parse('2026-09-30T15:00:00Z');
  const p = await optionPublishPlan({ symbol: 'IWM', direction: 'short', entry: 250, stop: 251, target: 246, expiryDate: '2026-10-16', fallbackHolding: 'day', nowMs: now }, { daily: daily(4) });
  assert.equal(p.dte, 16);
  assert.equal(p.holdingPeriod, 'position');
  assert.equal(p.stopLoss, 255);
  assert.equal(p.riskRewardRatio, 0.8);
  assert.ok(horizonTradingDays({ holdingPeriod: p.holdingPeriod, expiryDate: '2026-10-16', publishedMs: now }) > 1);
  const zero = await optionPublishPlan({ symbol: 'SPY', direction: 'long', entry: 700, stop: 699, target: 702, expiryDate: '2026-09-30', fallbackHolding: 'swing', nowMs: now }, { daily: daily(8, 20, 700) });
  assert.equal(zero.holdingPeriod, 'day');
  assert.equal(zero.stopLoss, 699); // day trades are not floored
});
t('every bypassing producer calls the shared floor; ingestion no longer has its own copy', () => {
  assert.match(src('server/trade-idea-ingestion.ts'), /applyAtrStopFloor\(/);
  assert.doesNotMatch(src('server/trade-idea-ingestion.ts'), /const floor = 1\.25 \* atr/);
  assert.match(src('server/gex-idea-scanner.ts'), /gexPublishPlan\(\{/);
  assert.equal(src('server/gex-idea-scanner.ts').match(/holdingPeriod: plan\.holdingPeriod/g)?.length, 2);
  assert.match(src('server/gex-magnet-actions.ts'), /optionPublishPlan\(\{/);
  assert.match(src('server/gex-magnet-actions.ts'), /holdingPeriod: plan\.holdingPeriod/);
  assert.match(src('server/gex-to-trade-desk.ts'), /applyAtrStopFloor\(\{/);
  assert.match(src('server/gex-to-trade-desk.ts'), /holdingFromContractDte: true/);
});

// ── 3. EXIT AT THE FIRST TOUCH SINCE PUBLICATION ─────────────────────────
const S = (iso: string) => Date.parse(iso) / 1000;
const b = (iso: string, open: number, low: number, high: number, close: number): TimedBar => ({ time: S(iso), open, high, low, close });
t('stop already breached before the trigger pass → hit = first crossing after PUBLICATION, not the next bar after the pass', () => {
  // The 09-30 XBI case: published Sep 28, crossed its stop 157.36 at 13:10 ET Sep 28; observer triggered it Sep 30 11:35 ET.
  const idea = toExitTimingIdea({
    symbol: 'XBI', timestamp: '2026-09-28T14:00:00Z', entryPrice: 160, targetPrice: 170, stopLoss: 157.36, direction: 'long',
    convergenceSignalsJson: { executionAudit: { version: 1, state: 'triggered', triggerObservedAt: '2026-09-30T15:35:35.404Z' } },
  });
  assert.equal(idea.entryMs, Date.parse('2026-09-30T15:35:35.404Z'));
  assert.equal(idea.touchFromMs, Date.parse('2026-09-28T14:00:00Z'));
  const bars = [
    b('2026-09-28T16:00:00Z', 159, 158.5, 159.5, 159),
    b('2026-09-28T17:10:00Z', 158, 157.0, 158.2, 157.2), // real first crossing
    b('2026-09-30T15:40:00Z', 155, 154.5, 155.5, 155),  // the old "hit"
  ];
  const p = planExitTiming(idea, { outcomeStatus: 'hit_stop' }, bars, Date.parse('2026-09-30T16:00:00Z'), { barInterval: '5m' });
  assert.equal(p.source, 'bar_hit');
  assert.equal(p.exitMs, Date.parse('2026-09-28T17:10:00Z'));
  assert.equal(p.fill, 'level');
  assert.equal(p.exitPrice, undefined); // filled at the level
  assert.match(p.note, /crossed before the trigger was observed/);
});
t('gap through the stop fills at the bar open; gap through the target fills at the (better) open', () => {
  const idea: ExitTimingIdea = { symbol: 'CRM', timestamp: '2026-09-29T20:30:00Z', entryPrice: 230, targetPrice: 240, stopLoss: 227.43, direction: 'long', entryMs: Date.parse('2026-09-29T20:30:00Z') };
  const gap = [b('2026-09-30T13:30:00Z', 225, 224, 226, 225.5)];
  const p = planExitTiming(idea, { outcomeStatus: 'hit_stop' }, gap, Date.parse('2026-09-30T16:00:00Z'), { barInterval: '5m' });
  assert.equal(p.fill, 'gap_open');
  assert.equal(p.exitPrice, 225);
  assert.ok((p.percentGain as number) < 0);
  assert.match(p.note, /filled at the open 225/);
  const up = [b('2026-09-30T13:30:00Z', 242, 241, 243, 242.5)];
  const q = planExitTiming(idea, { outcomeStatus: 'hit_target' }, up, Date.parse('2026-09-30T16:00:00Z'));
  assert.equal(q.exitPrice, 242);
  // short thesis mirror
  assert.deepEqual(barrierFill('short', 'stop', 100, { time: 0, open: 101, high: 102, low: 100.5, close: 101 }), { price: 101, gap: true });
  assert.deepEqual(barrierFill('short', 'stop', 100, { time: 0, open: 99, high: 100.5, low: 98, close: 100 }), { price: 100, gap: false });
});
const optBars = [
  { t: Date.parse('2026-09-30T14:30:00Z'), o: 3.0, h: 3.1, l: 2.9, c: 3.05 },
  { t: Date.parse('2026-09-30T14:35:00Z'), o: 2.6, h: 2.7, l: 2.2, c: 2.3 },
  { t: Date.parse('2026-09-30T14:40:00Z'), o: 2.3, h: 2.4, l: 2.1, c: 2.2 },
];
t('option premium at the touch: containing bar close; gap → open; nothing near → null', () => {
  assert.deepEqual(premiumAtTouch(optBars, Date.parse('2026-09-30T14:35:00Z')), { premium: 2.3, barStartMs: optBars[1].t, basis: 'close' });
  assert.equal(premiumAtTouch(optBars, Date.parse('2026-09-30T14:35:00Z'), { gap: true })?.premium, 2.6);
  assert.equal(premiumAtTouch(optBars, Date.parse('2026-09-30T14:25:00Z'))?.premium, 3.05); // first bar after, within lag
  assert.equal(premiumAtTouch(optBars, Date.parse('2026-09-30T18:00:00Z')), null);
});
t('option stop exit priced at the touch bar, labelled; pass fallback labelled "priced at pass (touch price unavailable)"', () => {
  const base = { outcome: 'hit_stop' as const, direction: 'long' as const, entryPrice: 700, fillPrice: 695, entryPremium: 3.0, strike: 705, optionType: 'call' };
  const touch = priceOptionBarrierExit({ ...base, touchPremium: 2.3, touchDetail: 'SPY 5m', passPremium: 1.1 });
  assert.equal(touch.exitPremium, 2.3);
  assert.equal(touch.basis, 'touch_bar');
  assert.match(touch.note, /^\[exit-premium:touch_bar\]/);
  const pass = priceOptionBarrierExit({ ...base, touchPremium: null, passPremium: 1.1 });
  assert.equal(pass.exitPremium, 1.1);
  assert.equal(pass.basis, 'pass');
  assert.ok(pass.note.includes(PRICED_AT_PASS));
});
t('a stop never books a gain unless the stop fill itself is on the profitable side of entry', () => {
  // The 17 "stops that won": pass quote above entry after the underlying came back.
  const bad = priceOptionBarrierExit({ outcome: 'hit_stop', direction: 'short', entryPrice: 250, fillPrice: 252, entryPremium: 2.0, touchPremium: null, passPremium: 2.6, strike: 245, optionType: 'put' });
  assert.equal(bad.exitPremium, null);
  assert.equal(bad.basis, 'withheld');
  assert.equal(bad.stopGain, 'withheld');
  assert.match(bad.note, /^\[exit-premium:withheld\]/);
  // Trailed stop above entry on a long: a genuine gain — allowed, flagged for the log.
  const ok = priceOptionBarrierExit({ outcome: 'hit_stop', direction: 'long', entryPrice: 100, fillPrice: 104, entryPremium: 2.0, touchPremium: 4.2, passPremium: null, strike: 100, optionType: 'call' });
  assert.equal(ok.exitPremium, 4.2);
  assert.equal(ok.stopGain, 'allowed');
  // Targets may gain; intrinsic floor at the fill.
  const tgt = priceOptionBarrierExit({ outcome: 'hit_target', direction: 'long', entryPrice: 80, fillPrice: 88.92, entryPremium: 4.55, touchPremium: null, passPremium: 5.22, strike: 77, optionType: 'call' });
  assert.equal(tgt.exitPremium, 11.92);
});
t('intrinsic floor skipped when the fill is not on the strike scale (premium-space / foreign-scale fill)', () => {
  // SMCI-style premium ladder: put strike 40, stop "fill" 1.55 (a premium). Old floor: 40 − 1.55 = $38.45 exit.
  const put = priceOptionBarrierExit({ outcome: 'hit_stop', direction: 'short', entryPrice: 3.09, fillPrice: 1.55, entryPremium: 3.09, touchPremium: null, passPremium: 2.1, strike: 40, optionType: 'put' });
  assert.equal(put.exitPremium, 2.1);
  assert.match(put.note, /intrinsic floor skipped/);
  // SPX strike against a SPY-scale fill.
  const spx = priceOptionBarrierExit({ outcome: 'hit_target', direction: 'short', entryPrice: 670, fillPrice: 668, entryPremium: 4, touchPremium: null, passPremium: 6, strike: 6700, optionType: 'put' });
  assert.equal(spx.exitPremium, 6);
  assert.equal(safeIntrinsic('put', 6700, 668), null);
  assert.equal(safeIntrinsic('call', 100, 104), 4);
  assert.equal(fillOnStrikeScale(1.55, 40), false);
});
t('a recorded exit premium above the contract maximum (call ≤ S, put ≤ K) is withheld', () => {
  const bad = priceOptionBarrierExit({ outcome: 'hit_target', direction: 'long', entryPrice: 100, fillPrice: 104, entryPremium: 2, touchPremium: 866, passPremium: null, strike: 100, optionType: 'call' });
  assert.equal(bad.exitPremium, null);
  assert.equal(bad.basis, 'withheld');
  assert.match(bad.note, /exceeds what the contract can be worth/);
  assert.equal(exceedsOptionValue(41, 'put', 40, null), true);
  assert.equal(exceedsOptionValue(39, 'put', 40, null), false);
  assert.equal(maxOptionValue('call', 100, null), Infinity);
  const s = src('server/performance-validation-service.ts');
  assert.match(s, /safeIntrinsic\(isCall \? 'call' : 'put', strike, underlyingExit\)/);
  assert.match(s, /exceedsOptionValue\(effective/);
  assert.match(src('research/repair-option-gains.ts'), /safeIntrinsic\(x\.option_type, k, und\)/);
});
t('service wiring: barrier option exits priced via the touch helper, stop gains logged', () => {
  const s = src('server/performance-validation-service.ts');
  assert.match(s, /priceOptionBarrierExit\(\{/);
  assert.match(s, /getAlpacaOptionBars\(occ/);
  assert.match(s, /\[STOP-GAIN\]/);
  assert.match(s, /barsSinceEntry\(idea\.symbol, idea\.assetType, tIdea\.touchFromMs \?\? tIdea\.entryMs, now\)/);
});

// ── 4. NO UNSCORABLE OPTION IDEAS ────────────────────────────────────────
const spx = {
  symbol: 'SPY', assetType: 'option', direction: 'long', source: 'spx_session', entryPrice: 700.1, targetPrice: 703, stopLoss: 698.5,
  optionType: 'call', strikePrice: 705, expiryDate: '2026-09-30', entryPremium: null, analysis: 'VWAP reclaim.', qualitySignals: ['x'],
  timestamp: '2026-09-30T14:00:00Z', holdingPeriod: 'day',
};
t('option idea without entry premium → underlying-only, stated in the idea, horizon kept as exitBy', () => {
  const g = ensureScorableOptionIdea(spx as any);
  assert.equal(g.converted, true);
  const i: any = g.idea;
  assert.equal(i.assetType, 'stock');
  assert.equal(i.optionType, null);
  assert.equal(i.strikePrice, null);
  assert.equal(i.expiryDate, null);
  assert.equal(i.exitBy, '2026-09-30T20:00:00.000Z');
  assert.ok(i.analysis.startsWith('VWAP reclaim. ' + UNDERLYING_ONLY_NOTE_HEAD));
  assert.match(i.analysis, /SPY 705C 2026-09-30/);
  assert.deepEqual(i.qualitySignals, ['x', UNDERLYING_ONLY_SIGNAL]);
  // …and the journal scores it on the underlying instead of excluding it.
  const before = mapDeskIdea({ ...spx, id: 'a', outcomeStatus: 'hit_target', exitPrice: 703, percentGain: 0.41, exitDate: '2026-09-30T11:00:00-05:00' } as any);
  assert.ok('excluded' in before && /entry premium/.test((before as any).excluded));
  const after = mapDeskIdea({ ...i, id: 'a', outcomeStatus: 'hit_target', exitPrice: 703, percentGain: 0.41, exitDate: '2026-09-30T11:00:00-05:00' } as any);
  assert.ok('row' in after && (after as any).row.realizedPnL > 0);
});
t('priced options, zero-premium options, and operator ideas', () => {
  assert.equal(ensureScorableOptionIdea({ ...spx, entryPremium: 1.25 } as any).converted, false);
  assert.equal(ensureScorableOptionIdea({ ...spx, entryPremium: 0 } as any).converted, true);
  assert.equal(ensureScorableOptionIdea({ ...spx, source: 'manual' } as any).converted, false);
  assert.equal(ensureScorableOptionIdea({ ...spx, assetType: 'stock' } as any).converted, false);
  assert.equal((ensureScorableOptionIdea({ ...spx, exitBy: '2026-09-30T18:00:00Z' } as any).idea as any).exitBy, '2026-09-30T18:00:00Z');
});
t('spx_session picks a LISTED contract and its mid; none → null', () => {
  const chain = [
    { option_type: 'call', strike: 703, expiration_date: '2026-09-30', bid: 1.1, ask: 1.2 },
    { option_type: 'call', strike: 704, expiration_date: '2026-09-30', bid: 0.8, ask: 0.9 },
    { option_type: 'call', strike: 705, expiration_date: '2026-10-02', bid: 2.0, ask: 2.2 },
    { option_type: 'put', strike: 705, expiration_date: '2026-09-30', bid: 4.0, ask: 4.2 },
    { option_type: 'call', strike: 706, expiration_date: '2026-09-30', bid: 0, ask: 0.05 },
  ];
  assert.deepEqual(pickSessionContract(chain, 'call', 705, '2026-09-30'), { strike: 704, mid: 0.85 });
  assert.deepEqual(pickSessionContract(chain, 'call', 703, '2026-09-30'), { strike: 703, mid: 1.15 });
  assert.equal(pickSessionContract(chain, 'call', 705, '2026-10-09'), null);
});
t('the guard sits at the single write point and spx_session records the premium', () => {
  const st = src('server/storage.ts');
  const gi = st.indexOf('ensureScorableOptionIdea(sourced');
  assert.ok(gi > 0 && gi < st.indexOf('validateTradeIdeaForCreate(idea)'), 'guard runs before the write gate');
  const sx = src('server/spx-session-scanner.ts');
  assert.match(sx, /entryPremium: contract\?\.mid \?\? null/);
  assert.match(sx, /ensureScorableOptionIdea\(optionIdea\)/);
});

(async () => {
  let pass = 0;
  for (const [name, fn] of tests) {
    try { await fn(); pass++; console.log(`✓ ${name}`); } catch (e) { console.log(`✗ ${name}`); console.error(e); process.exitCode = 1; }
  }
  console.log(`\noutcome-pipeline: ${pass}/${tests.length} passed`);
})();
