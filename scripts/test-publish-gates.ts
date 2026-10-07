import assert from 'node:assert/strict';
import { publishGateFor, calendarDte } from '../server/lib/publish-gates';
import { capturePlanSnapshot, readPlanSnapshot, freezePlanFields, touchesPlan } from '../shared/plan-snapshot';
const at = (iso: string) => Date.parse(iso);
// 2026-09-30 is a Wednesday; EDT = UTC-4.
const opt = { source: 'gex_scanner', assetType: 'option', expiryDate: '2026-10-16' };
assert.equal(publishGateFor(opt, at('2026-09-30T14:00:00Z')), null, 'in session passes');
assert.match(String(publishGateFor(opt, at('2026-09-30T20:30:00Z'))), /after the close/, '16:30 ET refused');
assert.match(String(publishGateFor(opt, at('2026-10-01T03:00:00Z'))), /after the close/, '23:00 ET refused');
assert.equal(publishGateFor(opt, at('2026-09-30T12:30:00Z')), null, '08:30 ET pre-market left to its engine');
assert.match(String(publishGateFor(opt, at('2026-10-03T15:00:00Z'))), /after the close/, 'Saturday refused');
assert.equal(publishGateFor({ ...opt, assetType: 'stock' }, at('2026-09-30T22:00:00Z')), null, 'stocks untouched');
assert.equal(publishGateFor(opt, at('2026-09-30T20:30:00Z'), { OPTIONS_AFTER_CLOSE: 'allow' }), null, 'env override');
const ms = { source: 'market_scanner', assetType: 'option', expiryDate: '2026-10-16' };
assert.equal(calendarDte('2026-10-16', at('2026-09-30T14:00:00Z')), 16);
assert.match(String(publishGateFor(ms, at('2026-09-30T14:00:00Z'))), /suspended/, 'market_scanner 16 DTE suspended');
assert.equal(publishGateFor({ ...ms, expiryDate: '2026-11-20' }, at('2026-09-30T14:00:00Z')), null, '51 DTE allowed');
assert.equal(publishGateFor({ ...ms, expiryDate: '2026-10-02' }, at('2026-09-30T14:00:00Z')), null, '2 DTE allowed');
assert.equal(publishGateFor(ms, at('2026-09-30T14:00:00Z'), { MARKET_SCANNER_SWING_OPTIONS: 'on' }), null, 'env re-enables');
// Plan snapshot: levels freeze at publish; a contract unknown at publish may be attached once.
{
  const snap = readPlanSnapshot(capturePlanSnapshot({}, { direction: 'long', entryPrice: 100, targetPrice: 110, stopLoss: 95, entryPremium: null, optionType: null, strikePrice: null, expiryDate: null }))!;
  assert.ok(snap && snap.riskRewardRatio === 2, 'snapshot captured with R:R');
  const a = freezePlanFields({ stopLoss: 90, targetPrice: 130 } as any, snap);
  assert.equal(a.fields.stopLoss, 95, 'published stop cannot move');
  assert.equal(a.fields.targetPrice, 110, 'published target cannot move');
  const b = freezePlanFields({ assetType: 'option', optionType: 'call', strikePrice: 105, expiryDate: '2026-10-16', entryPremium: 2.1 } as any, snap);
  assert.equal(b.fields.strikePrice, 105, 'backfilled contract is accepted');
  assert.equal(b.snapshot.optionType, 'call', 'backfilled contract enters the snapshot');
  const c = freezePlanFields({ strikePrice: 120 } as any, b.snapshot);
  assert.equal(c.fields.strikePrice, 105, 'published contract stays frozen');
  assert.equal(touchesPlan({ outcomeStatus: 'hit_stop', exitPrice: 1 }), false, 'outcome updates skip the plan read');
  assert.equal(touchesPlan({ stopLoss: 1 }), true);
}
console.log('publish gates: 21 checks passed');
