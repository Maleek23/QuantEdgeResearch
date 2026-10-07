/**
 * Equal-risk sizing for the NEXUS ideas book (shared/position-sizing.ts,
 * shared/desk-view.ts) — operator rule 2026-10-07: no trade risks more than
 * $500–1,000; Risk $500 is the default.
 *   npm run test:risk-sizing
 */
import assert from 'node:assert/strict';
import {
  DEFAULT_SIZING, MAX_RISK_DOLLARS, clampRiskDollars, effectivePremiumStop, parsePremiumStopTag, parseSizingParam,
  readNexusRiskDollars, riskSizedFromPct, riskSizedPnl, sizeForRisk, sizingParam,
} from '../shared/position-sizing';
import { applyDeskView, parseSizingChoice, type DeskViewRow } from '../shared/desk-view';
import { mapDeskIdea, type DeskIdea } from '../server/journal-row-maps';

let n = 0;
const t = (name: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error('FAIL', name); throw e; } };

// ── sizing math ──
t('stocks: qty = floor(risk / |entry − stop|)', () => {
  const s = sizeForRisk({ assetType: 'stock', entry: 100, stop: 97 }, 500);
  assert.ok(s.ok); assert.equal(s.qty, 166); assert.equal(s.scaled, false); assert.ok(Math.abs(s.riskDollars - 498) < 1e-9);
});
t('shorts size the same way', () => {
  const s = sizeForRisk({ assetType: 'stock', entry: 50, stop: 52 }, 1000);
  assert.ok(s.ok); assert.equal(s.qty, 500);
});
t('options: contracts = floor(risk / ((premium − premium stop) × 100)), plan stop first', () => {
  const s = sizeForRisk({ assetType: 'option', entry: 0, stop: null, entryPremium: 2.0, premiumStop: 1.2 }, 500);
  assert.ok(s.ok); assert.equal(s.qty, 6); assert.equal(s.premiumStopBasis, 'plan premium stop');
});
t('options default premium stop: −40% 0DTE, −50% swing', () => {
  assert.equal(effectivePremiumStop({ entryPremium: 1, zeroDte: true })!.stop, 0.6);
  assert.equal(effectivePremiumStop({ entryPremium: 1, zeroDte: false })!.stop, 0.5);
  const z = sizeForRisk({ assetType: 'option', entry: 0, stop: null, entryPremium: 1.0, zeroDte: true }, 500);
  assert.ok(z.ok); assert.equal(z.qty, 12); // 500 / 40
});
t('one contract over budget → fractional, labelled scaled', () => {
  const s = sizeForRisk({ assetType: 'option', entry: 0, stop: null, entryPremium: 20, zeroDte: false }, 500);
  assert.ok(s.ok); assert.equal(s.scaled, true); assert.equal(s.qty, 0.5); assert.equal(s.riskDollars, 500);
});
t('no stop → not sizeable (reason, never a guess)', () => {
  const s = sizeForRisk({ assetType: 'stock', entry: 100, stop: null }, 500);
  assert.equal(s.ok, false);
});
t('futures are not risk-sized', () => assert.equal(sizeForRisk({ assetType: 'future', entry: 5000, stop: 4990 }, 500).ok, false));
t('prem_stop tags: absolute, basis:abs, percent', () => {
  assert.equal(parsePremiumStopTag(['qty:3', 'prem_stop:1.25'], 2), 1.25);
  assert.equal(parsePremiumStopTag(['prem_stop:atr:0.9'], 2), 0.9);
  assert.equal(parsePremiumStopTag(['prem_stop:-40'], 2), 1.2);
  assert.equal(parsePremiumStopTag(['prem_stop:3'], 2), null);
});
t('loss cap: a loss worse than the stop is capped at −risk', () => {
  const s = sizeForRisk({ assetType: 'stock', entry: 100, stop: 98 }, 500); // 250 sh, risk $500
  const r = riskSizedPnl(-100, 10, s); // unit: 10 sh lost $100 ($10/sh) → 250 sh = −$2,500
  assert.equal(r.capped, true); assert.equal(r.pnl, -500); assert.equal(r.uncapped, -2500);
  const w = riskSizedPnl(30, 10, s);
  assert.equal(w.capped, false); assert.equal(w.pnl, 750);
});
t('budget bounds: $50–$1,000; default Risk $500', () => {
  assert.equal(MAX_RISK_DOLLARS, 1000);
  assert.equal(clampRiskDollars(1500), null); assert.equal(clampRiskDollars(750), 750);
  assert.deepEqual(DEFAULT_SIZING, { mode: 'risk', riskDollars: 500 });
  assert.deepEqual(parseSizingParam(null), DEFAULT_SIZING);
  assert.deepEqual(parseSizingParam('risk:5000'), DEFAULT_SIZING);
  assert.deepEqual(parseSizingParam('unit'), { mode: 'unit', riskDollars: 0 });
  assert.equal(sizingParam({ mode: 'risk', riskDollars: 750 }), 'risk:750');
  assert.deepEqual(parseSizingChoice(undefined), DEFAULT_SIZING);
  assert.deepEqual(parseSizingChoice({ mode: 'risk', riskDollars: 2000 }), DEFAULT_SIZING);
  assert.equal(readNexusRiskDollars({}), 500);
  assert.equal(readNexusRiskDollars({ NEXUS_RISK_DOLLARS: '1000' }), 1000);
  assert.equal(readNexusRiskDollars({ NEXUS_RISK_DOLLARS: '5000' }), 500);
});

// ── the operator's example: a −$1,617 one-contract loss on Oct 7 ──
const idea = (over: Partial<DeskIdea>): DeskIdea => ({
  id: 'x', symbol: 'MU', assetType: 'option', direction: 'long', entryPrice: 1100, targetPrice: 1130, stopLoss: 1085, riskRewardRatio: 2,
  optionType: 'call', strikePrice: 1100, expiryDate: '2026-10-17', entryPremium: 25.0, exitPremium: 8.83, optionPercentGain: null,
  exitPrice: 1080, percentGain: null, outcomeStatus: 'hit_stop', resolutionReason: null, exitDate: '2026-10-07T15:10:00Z',
  timestamp: '2026-10-07T13:53:00Z', source: 'quant', catalyst: null, genConvictionBand: null, ...over,
});
const rowOf = (i: DeskIdea) => { const m = mapDeskIdea(i); assert.ok('row' in m, 'scored'); return m.row; };

t('−$1,617 one-contract loss shows ≤ −$500 at the default', () => {
  const row = rowOf(idea({}));
  assert.equal(row.realizedPnL, -1617);
  assert.ok(row.riskBasis && row.riskBasis.entryPremium === 25 && row.riskBasis.unitQty === 1);
  const v = applyDeskView([row as DeskViewRow], { view: 'recorded', sizing: DEFAULT_SIZING });
  const r = v.rows[0];
  assert.ok(r.realizedPnL! >= -500 - 1e-9, `got ${r.realizedPnL}`);
  assert.equal(r.realizedPnL, -500);
  assert.equal(r.sizedAs!.scaled, true); assert.equal(r.sizedAs!.capped, true);
  assert.equal(r.quantity, 0.4); // −50% swing stop on a $25 contract = $1,250 risk → 0.4 contracts
  assert.equal(v.scaled, 1); assert.equal(v.capped.count, 1);
  // $1,000 budget: still ≤ the budget
  const k = applyDeskView([row as DeskViewRow], { view: 'recorded', sizing: { mode: 'risk', riskDollars: 1000 } }).rows[0];
  assert.ok(k.realizedPnL! >= -1000);
  // Unit view keeps the recorded number untouched
  const u = applyDeskView([row as DeskViewRow], { view: 'recorded', sizing: { mode: 'unit', riskDollars: 0 } }).rows[0];
  assert.equal(u.realizedPnL, -1617);
});
t('no closed risk-sized trade loses more than its budget (property)', () => {
  const rows: DeskViewRow[] = [];
  for (let k = 0; k < 200; k++) {
    const opt = k % 2 === 0;
    const entry = 20 + (k % 37) * 7;
    const stopDist = entry * (0.003 + (k % 11) * 0.006);
    const exitMove = ((k * 7919) % 200 - 120) / 100 * stopDist * 3; // includes gaps far past the stop
    const prem = 0.2 + (k % 13) * 2.1;
    const r = rowOf(idea({
      id: `p${k}`, assetType: opt ? 'option' : 'stock', entryPrice: entry, stopLoss: entry - stopDist, targetPrice: entry + 2 * stopDist,
      entryPremium: opt ? prem : null, exitPremium: opt ? Math.max(0, prem * (1 + exitMove / entry * 10)) : null,
      exitPrice: entry + exitMove, optionType: opt ? 'call' : null, strikePrice: opt ? entry : null, expiryDate: opt ? '2026-10-17' : null,
      outcomeStatus: 'closed',
    }));
    rows.push(r as DeskViewRow);
  }
  for (const budget of [500, 750, 1000]) {
    const v = applyDeskView(rows, { view: 'recorded', sizing: { mode: 'risk', riskDollars: budget } });
    assert.equal(v.rows.length, rows.length);
    for (const r of v.rows) assert.ok((r.realizedPnL ?? 0) >= -budget - 0.01, `${r.id} ${r.realizedPnL} at ${budget}`);
  }
});
t('risk sizing keeps the sign of every recorded result', () => {
  const win = rowOf(idea({ id: 'w', exitPremium: 31, outcomeStatus: 'hit_target', exitPrice: 1130 }));
  const v = applyDeskView([win as DeskViewRow], { view: 'recorded', sizing: DEFAULT_SIZING }).rows[0];
  assert.ok(v.realizedPnL! > 0); assert.equal(v.outcome, 'win');
});
t('stock idea: $1,000 notional row re-sized to risk $500', () => {
  const r = rowOf(idea({ id: 's', assetType: 'stock', entryPrice: 100, stopLoss: 98, targetPrice: 104, entryPremium: null, exitPremium: null,
    optionType: null, strikePrice: null, expiryDate: null, exitPrice: 104, outcomeStatus: 'hit_target' }));
  assert.equal(r.realizedPnL, 40); // $1,000 × 4%
  const v = applyDeskView([r as DeskViewRow], { view: 'recorded', sizing: DEFAULT_SIZING }).rows[0];
  assert.equal(v.quantity, 250); assert.equal(v.realizedPnL, 1000); // 250 sh × $4 = 2R on $500
});
t('rows with no stop are counted out of the risk view, never dropped silently', () => {
  const r = rowOf(idea({ id: 'n', assetType: 'stock', entryPrice: 100, stopLoss: null, entryPremium: null, exitPremium: null, optionType: null, strikePrice: null, expiryDate: null, exitPrice: 101, outcomeStatus: 'closed' }));
  const v = applyDeskView([r as DeskViewRow], { view: 'recorded', sizing: DEFAULT_SIZING });
  assert.equal(v.rows.length, 0);
  assert.equal(v.skipped[0].count, 1);
});

// ── Discord exit posts ──
t('Discord: option exit $ at $500 risk never below −$500', () => {
  const r = riskSizedFromPct({ isOption: true, entry: 1100, stop: 1085, premium: 25, zeroDte: false, underlyingPct: -1.8, optionPct: -64.7 }, 500)!;
  assert.equal(r.pnl, -500); assert.equal(r.scaled, true); assert.equal(r.capped, true);
  const s = riskSizedFromPct({ isOption: false, entry: 100, stop: 98, premium: null, zeroDte: false, underlyingPct: 4, optionPct: null }, 500)!;
  assert.equal(s.pnl, 1000);
});

console.log(`test-risk-sizing: ${n} passed`);
