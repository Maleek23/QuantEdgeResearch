/**
 * test:journal-integrity — options-only, premium-based outcomes, 0DTE history,
 * journal "contract not recorded", data-health strip. Pure; no DB, no network.
 */
import assert from 'node:assert/strict';
import {
  OPTION_INTENT_SIGNAL, contractGap, instrumentIntent, instrumentLabel, promoteBudgetContract, stripFailedContract, wasConvertedToShares, withheldRecord,
} from '../shared/options-only';
import {
  backfillWindow, contractFromCatalyst, judgePremiumOutcome, peakOverWindow, premiumConsistent, premiumPlanFor, etWallMs,
} from '../shared/premium-outcome';
import { dataHealth, isZeroDtePlay, outcomeWord, rowGaps, toPlay, toSetupRow, etDayBounds } from '../shared/journal-integrity';
import { mapDeskIdea, type DeskIdea } from '../server/journal-row-maps';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const MIN = 60_000;

console.log('options-only');
t('0DTE flow stock row (GOOGL 10/07) is option-intended, contract not recorded', () => {
  const r = { source: 'zero_dte_flow', assetType: 'stock', qualitySignals: [] };
  assert.equal(wasConvertedToShares(r), true);
  assert.equal(instrumentIntent(r), 'option');
  assert.equal(instrumentLabel(r), 'Contract not recorded');
  assert.match(contractGap(r)!, /stored as shares/);
});
t('legacy underlying-only signal marks a converted quant row', () => {
  assert.equal(wasConvertedToShares({ source: 'quant', assetType: 'stock', qualitySignals: ['underlying_only:no_entry_premium'] }), true);
  assert.equal(wasConvertedToShares({ source: 'quant', assetType: 'stock', analysis: 'x Underlying-only idea: no liquid contract' }), true);
});
t('genuine market_scanner stock idea is a Shares idea', () => {
  const r = { source: 'market_scanner', assetType: 'stock', qualitySignals: ['breakout'] };
  assert.equal(instrumentIntent(r), 'shares');
  assert.equal(instrumentLabel(r), 'Shares idea');
  assert.equal(contractGap(r), null);
});
t('producer fallback carries the option-intent signal', () => {
  assert.equal(instrumentIntent({ source: 'sector_ignition', assetType: 'stock', qualitySignals: [OPTION_INTENT_SIGNAL] }), 'option');
});
t('option without premium / strike has a gap', () => {
  assert.match(contractGap({ assetType: 'option', optionType: 'put', strikePrice: 380, expiryDate: '2026-10-07', entryPremium: null })!, /premium/);
  assert.match(contractGap({ assetType: 'option', optionType: 'put', strikePrice: null, expiryDate: '2026-10-07', entryPremium: 1 })!, /strike/);
  assert.equal(contractGap({ assetType: 'option', optionType: 'put', strikePrice: 380, expiryDate: '2026-10-07', entryPremium: 3.05 }), null);
});
t('budget promotion makes the budget contract the tradable option (never shares)', () => {
  const idea = stripFailedContract({ symbol: 'MU', source: 'quant', assetType: 'stock', direction: 'long', entryPrice: 1028.59, targetPrice: 1096.16, stopLoss: 1017.5, qualitySignals: ['underlying_only:no_liquid_contract'] });
  const out = promoteBudgetContract(idea, {
    label: 'MU 2026-10-09 1090C', optionType: 'call', strike: 1090, expiry: '2026-10-09', dte: 2, entryPremium: 1.93, delta: 0.09,
    premiumT1: 6.16, premiumT2: null, premiumStop: 0.97, mapping: 'bs', rationale: 'r',
  }, 'primary 1100C over budget', Date.parse('2026-10-07T13:53:00Z'));
  assert.equal(out.assetType, 'option');
  assert.equal(out.strikePrice, 1090);
  assert.equal(out.entryPremium, 1.93);
  assert.equal(out.convergenceSignalsJson.premiumPlan.t1, 6.16);
  assert.ok(!out.qualitySignals.includes('underlying_only:no_liquid_contract'));
  assert.match(out.analysis, /never as shares/);
});
t('withheld record names the contract and reason', () => {
  const w = withheldRecord({ source: 'gex_scanner', symbol: 'amzn', optionType: 'put', strikePrice: 250, expiryDate: '2026-11-20', direction: 'short' }, 'options_only_no_tradable_contract', 'no liquid', 0);
  assert.equal(w.contract, 'AMZN 2026-11-20 250P');
  assert.equal(w.symbol, 'AMZN');
});

console.log('premium-based outcomes');
const t0 = Date.parse('2026-10-07T14:26:00Z');
const bar = (m: number, o: number, h: number, l: number, c: number) => ({ t: t0 + m * MIN, o, h, l, c });
t('TSLA 377.5C 10/07: underlying "target" but premium hit the stop first → hit_stop', () => {
  const plan = premiumPlanFor({ assetType: 'option', entryPremium: 0.81, qualitySignals: ['prem_t1:1.5', 'prem_stop:0.4'] }, { zeroDte: true })!;
  assert.equal(plan.source, 'desk_signals');
  const bars = [bar(0, 0.81, 0.9, 0.78, 0.85), bar(9, 0.9, 1.17, 0.88, 1.1), bar(60, 0.6, 0.62, 0.39, 0.42), bar(200, 0.45, 0.47, 0.44, 0.45)];
  const v = judgePremiumOutcome(bars, plan, t0, t0 + 300 * MIN, { final: true });
  assert.equal(v.status, 'hit_stop');
  assert.equal(v.exitPremium, 0.4);
  assert.equal(v.peak!.premium, 1.17);
});
t('premium T1 touch → hit_target with exit ≥ entry', () => {
  const plan = { v: 'premium-plan-v1' as const, entry: 3.05, t1: 4.25, t2: 5.5, stop: 2.38, mapping: 'm', source: 'delta_map' as const };
  const v = judgePremiumOutcome([bar(0, 3.05, 3.3, 3.0, 3.2), bar(5, 3.9, 4.4, 3.9, 4.3), bar(20, 5.0, 5.85, 4.9, 5.5)], plan, t0, t0 + 400 * MIN, { final: false });
  assert.equal(v.status, 'hit_target');
  assert.ok(v.exitPremium! >= plan.entry);
  assert.equal(v.t2HitAt, t0 + 20 * MIN);
});
t('no barrier and not final → open; final → expired at the last close', () => {
  const plan = { v: 'premium-plan-v1' as const, entry: 2.35, t1: 2.64, t2: null, stop: 2.18, mapping: 'm', source: 'delta_map' as const };
  const bars = [bar(0, 2.35, 2.5, 2.3, 2.4), bar(3, 2.4, 2.45, 2.25, 2.26)];
  assert.equal(judgePremiumOutcome(bars, plan, t0, t0 + 10 * MIN, { final: false }).status, 'open');
  const f = judgePremiumOutcome(bars, plan, t0, t0 + 10 * MIN, { final: true });
  assert.equal(f.status, 'expired');
  assert.equal(f.exitPremium, 2.26);
});
t('same-bar T1 and stop → stop (conservative)', () => {
  const plan = { v: 'premium-plan-v1' as const, entry: 1, t1: 1.5, t2: null, stop: 0.6, mapping: 'm', source: 'delta_map' as const };
  assert.equal(judgePremiumOutcome([bar(0, 1, 1.6, 0.5, 1)], plan, t0, t0 + MIN * 2, { final: true }).status, 'hit_stop');
});
t('invariant: hit_target with exit < entry is rejected', () => {
  assert.equal(premiumConsistent('hit_target', 0.81, 0.45).ok, false);
  assert.equal(premiumConsistent('hit_target', 2.35, 2.26).ok, false);
  assert.equal(premiumConsistent('hit_target', 3.05, 4.25).ok, true);
  assert.equal(premiumConsistent('hit_stop', 3.05, 1).ok, true);
});
t('delta map: T1 above entry, stop below, floored', () => {
  const p = premiumPlanFor({ assetType: 'option', entryPremium: 3.05, entryPrice: 378.17, targetPrice: 375.78, stopLoss: 379.52, optionDelta: -0.5 }, { zeroDte: true })!;
  assert.equal(p.source, 'delta_map');
  assert.ok(p.t1 > 3.05 && p.stop < 3.05 && p.stop >= 3.05 * 0.6 - 0.01);
});
t('a prem_t1 beyond 6× entry is ignored (unit error)', () => {
  assert.notEqual(premiumPlanFor({ assetType: 'option', entryPremium: 0.23, qualitySignals: ['prem_t1:50'] })!.source, 'desk_signals');
});
t('backfill window: 0DTE runs to that session close; missed entry skipped', () => {
  const w = backfillWindow({ timestamp: '2026-10-07T13:58:00Z', expiryDate: '2026-10-07', outcomeStatus: 'hit_target', exitDate: '2026-10-07T14:00:00Z' }, Date.parse('2026-10-13T12:00:00Z'));
  assert.ok(w.ok && w.final && w.shortDated && w.toMs === etWallMs('2026-10-07', 16 * 60));
  assert.equal(backfillWindow({ timestamp: '2026-10-07T13:52:00Z', expiryDate: '2026-10-07', resolutionReason: 'missed_entry_invalidated_before_trigger' }, Date.now()).ok, false);
});
t('true peak over the whole window (TSLA 380P 5.85 @ 10:20 ET)', () => {
  const pk = peakOverWindow([{ t: Date.parse('2026-10-07T14:00:00Z'), o: 4, h: 4.3, l: 4, c: 4.2 }, { t: Date.parse('2026-10-07T14:20:00Z'), o: 5.5, h: 5.85, l: 5.4, c: 5.6 }], 0, Infinity)!;
  assert.equal(pk.premium, 5.85);
});
t('contract recovered from a 0DTE catalyst', () => {
  assert.deepEqual(contractFromCatalyst('AMZN 255P 0DTE — opening-flow ignition @ 09:52:00 ET · mid $1.33 · delayed quote'), { strike: 255, optionType: 'put', mid: 1.33 });
  assert.deepEqual(contractFromCatalyst('MSFT 527.5P 0DTE — x · mid $1.56'), { strike: 527.5, optionType: 'put', mid: 1.56 });
});

console.log('0DTE history / NEXUS by day / data health');
const amzn = { id: 'd91452b5-ecfd-4208-801b-d9c2940cc84b', symbol: 'AMZN', source: 'zero_dte_flow', assetType: 'stock', direction: 'short', entryPrice: 254.58, targetPrice: 253.39, stopLoss: 254.74, outcomeStatus: 'expired', resolutionReason: 'missed_entry_invalidated_before_trigger', timestamp: '2026-10-07T13:52:00.162Z', catalyst: 'AMZN 255P 0DTE — opening-flow ignition' };
t('AMZN 10/07: the play says "not entered" (DB truth), contract not recorded', () => {
  assert.equal(isZeroDtePlay(amzn), true);
  const p = toPlay(amzn);
  assert.equal(p.outcome.label, 'not entered');
  assert.equal(p.contract, null);
  assert.equal(p.contractNote, 'contract not recorded');
  assert.equal(p.entryPremium, null);
});
const mstr = { id: '57e78a2c-385e-412e-8a5f-f44b6c899d06', symbol: 'MSTR', source: 'zero_dte_desk', assetType: 'option', direction: 'long', optionType: 'call', strikePrice: 157.5, expiryDate: '2026-10-09', entryPrice: 155.24, targetPrice: 155.92, stopLoss: 154.82, entryPremium: 2.35, exitPremium: 2.26, outcomeStatus: 'hit_target', resolutionReason: 'auto_target_hit', timestamp: '2026-10-07T15:51:47.529Z', exitDate: '2026-10-07T16:00:00Z', outcomeNotes: '[peak:2.62@2026-10-07T16:09Z|bar|alpaca:1Min|to_eod]' };
t('MSTR 157.5C: play shows the mismatch, never a silent "win"', () => {
  const p = toPlay(mstr);
  assert.equal(p.contract, 'MSTR 157.5C 10/09');
  assert.equal(p.outcome.tone, 'loss');
  assert.ok(p.gaps.some((g) => /mismatch/.test(g)));
  assert.equal(p.peak!.premium, 2.62);
});
t('setup row labels instruments', () => {
  assert.equal(toSetupRow({ id: 'x', symbol: 'TENB', source: 'leaders', assetType: 'stock', timestamp: '2026-10-09T19:03:41Z', percentGain: 1.2 }).instrument, 'Shares idea');
  const s = toSetupRow({ id: 'y', symbol: 'GOOGL', source: 'zero_dte_flow', assetType: 'stock', timestamp: '2026-10-07T13:56:00Z', percentGain: 0.3 });
  assert.equal(s.contract, 'contract not recorded');
  assert.equal(s.resultPct, null, 'no shares % on an option idea');
});
t('data health groups gaps by ET day', () => {
  const now = Date.parse('2026-10-13T15:00:00Z');
  const stale = { id: 's', symbol: 'AMZN', source: 'gex_scanner', assetType: 'option', optionType: 'put', strikePrice: 250, expiryDate: '2026-10-09', entryPremium: 9, outcomeStatus: 'open', timestamp: '2026-10-07T16:19:31Z' };
  const h = dataHealth([amzn, mstr, stale], now);
  assert.equal(h.totals.missing_contract, 1);
  assert.equal(h.totals.mismatch, 1);
  assert.equal(h.totals.stale_outcome, 1);
  assert.equal(h.days[0].day, '2026-10-07');
  assert.equal(rowGaps({ id: 'ok', symbol: 'SPY', source: 'market_scanner', assetType: 'stock', timestamp: '2026-10-07T13:00:00Z', outcomeStatus: 'hit_target' }, now).length, 0);
});
t('ET day bounds', () => {
  const b = etDayBounds('2026-10-07')!;
  assert.equal(b.fromIso, '2026-10-07T04:00:00.000Z');
  assert.equal(b.toIso, '2026-10-08T04:00:00.000Z');
});
t('outcome words', () => {
  assert.equal(outcomeWord({ id: 'a', symbol: 'A', timestamp: '', outcomeStatus: 'open' }).tone, 'open');
  assert.equal(outcomeWord({ id: 'a', symbol: 'A', timestamp: '', assetType: 'option', outcomeStatus: 'hit_target', entryPremium: 1, exitPremium: 1.5 }).tone, 'win');
});

console.log('journal');
const base: DeskIdea = {
  id: 'g', symbol: 'GOOGL', assetType: 'stock', direction: 'short', entryPrice: 346.23, targetPrice: 345.07, stopLoss: 346.43, riskRewardRatio: 5.8,
  optionType: null, strikePrice: null, expiryDate: null, entryPremium: null, exitPremium: null, optionPercentGain: null, exitPrice: 345.07, percentGain: 0.33,
  outcomeStatus: 'hit_target', resolutionReason: 'auto_target_hit', exitDate: '2026-10-07T14:05:00Z', timestamp: '2026-10-07T13:56:00Z',
  source: 'zero_dte_flow', catalyst: 'GOOGL 345P 0DTE', genConvictionBand: null,
};
t('0DTE stored as shares → "contract not recorded", not a shares P&L row', () => {
  const r = mapDeskIdea(base);
  assert.ok('excluded' in r);
  assert.match((r as any).excluded, /^contract not recorded/);
});
t('option with no premium → contract not recorded', () => {
  const r = mapDeskIdea({ ...base, source: 'gex_scanner', assetType: 'option', optionType: 'put', strikePrice: 345, expiryDate: '2026-10-07' });
  assert.match((r as any).excluded, /^contract not recorded — no entry premium/);
});
t('genuine shares idea renders with the "Shares idea" label', () => {
  const r = mapDeskIdea({ ...base, source: 'market_scanner', catalyst: 'Day mover' });
  assert.ok('row' in r);
  assert.equal((r as any).row.instrumentLabel, 'Shares idea');
  assert.match((r as any).row.notes, /^Shares idea/);
});

console.log(`\n${n} journal-integrity checks passed`);
