import assert from 'node:assert/strict';
import { publishGateFor, calendarDte } from '../server/lib/publish-gates';
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
console.log('publish gates: 13 checks passed');
