/**
 * npm run test:entry-premium-truth — an option idea's entry premium must be a
 * price the contract traded at when it was published (shared/entry-premium-truth.ts).
 * Fixtures: 2026-10-14 SPY 777C 0DTE (a9408764) published 09:34:48 ET at $2.72
 * — the 10/13 closing mark — with the live Alpaca mid at $0.635.
 */
import assert from 'node:assert/strict';
import {
  decideEntryPremium, guardEntryAgainstBars, wasEntryRepriced, ENTRY_PREMIUM_NOT_TRADED, type MinuteBar,
} from '../shared/entry-premium-truth';
import { premiumPlanFor, judgePremiumOutcome } from '../shared/premium-outcome';
import { applyEntryPremiumGate } from '../server/lib/entry-premium-gate';

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`  ✓ ${name}`); };

const PUB = Date.parse('2026-10-14T13:34:48.322Z');
const m = (hhmm: string) => Date.parse(`2026-10-14T${hhmm}:00Z`);
// SPY261014C00777000 Alpaca 1-min bars (o h l c), 13:30Z → 13:52Z.
const BARS: MinuteBar[] = ([
  ['13:30', 0.63, 0.69, 0.51, 0.58], ['13:31', 0.59, 0.71, 0.56, 0.56], ['13:32', 0.56, 0.61, 0.54, 0.6], ['13:33', 0.59, 0.75, 0.57, 0.75],
  ['13:34', 0.75, 0.75, 0.59, 0.6], ['13:35', 0.59, 0.59, 0.5, 0.52], ['13:36', 0.51, 0.56, 0.46, 0.52], ['13:37', 0.51, 0.59, 0.48, 0.52],
  ['13:38', 0.51, 0.67, 0.48, 0.67], ['13:39', 0.66, 0.74, 0.63, 0.7], ['13:40', 0.7, 0.81, 0.64, 0.8], ['13:41', 0.8, 0.82, 0.69, 0.73],
  ['13:42', 0.73, 0.79, 0.68, 0.75], ['13:43', 0.76, 0.76, 0.6, 0.61], ['13:44', 0.61, 0.62, 0.52, 0.57], ['13:45', 0.57, 0.62, 0.54, 0.55],
  ['13:46', 0.54, 0.68, 0.54, 0.59], ['13:47', 0.58, 0.78, 0.55, 0.77], ['13:48', 0.78, 0.85, 0.68, 0.68], ['13:49', 0.68, 0.87, 0.66, 0.8],
  ['13:50', 0.81, 0.81, 0.66, 0.71], ['13:51', 0.71, 0.73, 0.6, 0.67], ['13:52', 0.68, 0.68, 0.45, 0.47],
] as const).map(([h, o, hi, l, c]) => ({ t: m(h), o, h: hi, l, c }));

async function main() {
  console.log('decideEntryPremium (publish)');
  await t('prior-close premium $2.72 vs live mid $0.635 → re-priced to the live ask', () => {
    const s = decideEntryPremium(2.72, { bid: 0.61, ask: 0.66, source: 'alpaca_indicative', asOfMs: PUB - 1000 }, PUB);
    assert.equal(s.action, 'repriced');
    assert.equal(s.basis, 'ask'); // spread 7.9% ≤ 10%
    assert.equal(s.entry, 0.66);
    assert.match(s.reason, /328% off the live mid/);
  });
  await t('wide spread → mid, not ask', () => {
    const s = decideEntryPremium(0.3, { bid: 0.27, ask: 0.32, source: 'alpaca_indicative', asOfMs: PUB }, PUB);
    assert.equal(s.action, 'confirmed'); assert.equal(s.basis, 'mid'); assert.equal(s.entry, 0.3);
  });
  await t('within 25% → confirmed, entry = live fill', () => {
    const s = decideEntryPremium(0.6, { bid: 0.61, ask: 0.66, source: 'alpaca_indicative', asOfMs: PUB }, PUB);
    assert.equal(s.action, 'confirmed'); assert.equal(s.entry, 0.66);
  });
  await t('stale (>60s), delayed source, one-sided, missing → withheld', () => {
    assert.equal(decideEntryPremium(2.72, { bid: 0.61, ask: 0.66, source: 'alpaca_indicative', asOfMs: PUB - 61_000 }, PUB).action, 'withheld');
    assert.equal(decideEntryPremium(2.72, { bid: 2.7, ask: 2.74, source: 'cboe_delayed', asOfMs: PUB }, PUB).action, 'withheld');
    assert.equal(decideEntryPremium(2.72, { bid: null, ask: 0.66, source: 'alpaca_indicative', asOfMs: PUB }, PUB).action, 'withheld');
    assert.equal(decideEntryPremium(2.72, null, PUB).action, 'withheld');
  });

  console.log('applyEntryPremiumGate (storage write)');
  const idea = {
    symbol: 'SPY', assetType: 'option', optionType: 'call', strikePrice: 777, expiryDate: '2026-10-14', entryPremium: 2.72,
    direction: 'long', entryPrice: 775.19, targetPrice: 778.14, stopLoss: 772.55, analysis: 'Flow signal detected.',
    convergenceSignalsJson: { contractLiquidity: { contract: 'SPY 2026-10-14 777C', bid: 0.61, ask: 0.66, source: 'alpaca_indicative', asOf: '2026-10-14T13:34:49.176Z' } },
  };
  await t('a9408764 replay: liquidity snapshot re-prices $2.72 → $0.66, plan re-mapped from it', async () => {
    const r = await applyEntryPremiumGate(idea, Date.parse('2026-10-14T13:34:50Z'), { env: {} });
    assert.equal(r.stamp?.action, 'repriced');
    assert.equal(r.idea.entryPremium, 0.66);
    assert.equal((r.idea.convergenceSignalsJson as any).entryQuote.claimed, 2.72);
    assert.match(String(r.idea.analysis), /re-priced at publish/);
    const plan = premiumPlanFor(r.idea as any, { zeroDte: true });
    assert.equal(plan?.entry, 0.66);
    assert.ok(plan!.stop < 0.66 && plan!.t1 > 0.66);
  });
  await t('stale snapshot → fresh Alpaca quote; none → withheld; index root → unverified; off → untouched', async () => {
    const late = Date.parse('2026-10-14T13:36:30Z');
    const fresh = await applyEntryPremiumGate(idea, late, { env: {}, fetchQuote: async () => ({ bid: 0.5, ask: 0.54, quoteTime: null, via: 'snapshot' }) });
    assert.equal(fresh.stamp?.action, 'repriced'); assert.equal(fresh.idea.entryPremium, 0.54);
    const none = await applyEntryPremiumGate(idea, late, { env: {}, fetchQuote: async () => null });
    assert.equal(none.stamp?.action, 'withheld');
    const spx = await applyEntryPremiumGate({ ...idea, symbol: 'SPX', convergenceSignalsJson: {} }, late, { env: {}, fetchQuote: async () => null });
    assert.equal(spx.stamp?.action, 'unverified'); assert.equal(spx.idea.entryPremium, 2.72);
    const off = await applyEntryPremiumGate(idea, late, { env: { ENTRY_PREMIUM_TRUTH: 'off' } });
    assert.equal(off.stamp, null); assert.equal(off.idea.entryPremium, 2.72);
  });

  console.log('guardEntryAgainstBars (outcome tracking)');
  await t('$2.72 outside the 5-min range → entry = 13:34 bar close $0.60, flagged', () => {
    const g = guardEntryAgainstBars(2.72, BARS, PUB);
    assert.equal(g.repriced, true);
    assert.equal(g.entry, 0.6);
    assert.equal(g.barAtMs, m('13:34'));
    assert.deepEqual(g.range, { lo: 0.46, hi: 0.75, bars: 6 });
    assert.ok(g.note.includes(ENTRY_PREMIUM_NOT_TRADED) && wasEntryRepriced(g.note));
  });
  await t('a traded entry is left alone; no bars → not judged', () => {
    assert.equal(guardEntryAgainstBars(0.66, BARS, PUB).repriced, false);
    assert.equal(guardEntryAgainstBars(2.72, [], PUB).repriced, false);
  });
  await t('no instant stop: re-priced plan is not stopped at 13:35 the way the $2.72 plan was', () => {
    const bad = premiumPlanFor({ ...idea, convergenceSignalsJson: {} } as any, { zeroDte: true })!;
    const old = judgePremiumOutcome(BARS, bad, Date.parse('2026-10-14T13:35:00Z'), m('13:52'), { final: false });
    assert.equal(old.status, 'hit_stop'); assert.equal(old.stopHitAt, m('13:35'));
    const g = guardEntryAgainstBars(2.72, BARS, PUB);
    const good = premiumPlanFor({ ...idea, entryPremium: g.entry, convergenceSignalsJson: {} } as any, { zeroDte: true })!;
    const v = judgePremiumOutcome(BARS, good, g.barAtMs! + 60_000, m('13:52'), { final: false });
    assert.notEqual(v.stopHitAt, m('13:35'));
    assert.equal(good.stop, 0.36); // −40% 0DTE floor off $0.60
    assert.equal(v.status, 'open'); // low $0.45 by 13:52 never reached $0.36
  });

  console.log(`\n${n} entry-premium-truth checks passed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
