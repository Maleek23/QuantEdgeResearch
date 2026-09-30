/** Unit checks for client/src/lib/format.ts — docs/UX_COPY_GUIDE.md "Numbers, units and time". */
import assert from 'node:assert/strict';
import { fmtAgo, fmtGex, fmtNum, fmtPct, fmtR, fmtRatioPct, fmtTimeET, fmtUsd, fmtVex, fmtWinRate, MISSING } from '../client/src/lib/format';

for (const bad of [null, undefined, NaN, Infinity, '', 'abc']) {
  assert.equal(fmtUsd(bad), MISSING); assert.equal(fmtPct(bad), MISSING); assert.equal(fmtR(bad), MISSING); assert.equal(fmtNum(bad), MISSING);
}
assert.equal(fmtUsd(1234.5), '$1,234.50');
assert.equal(fmtUsd(-40, { signed: true }), '−$40.00');
assert.equal(fmtUsd(40, { signed: true }), '+$40.00');
assert.equal(fmtUsd(2_350_000_000, { compact: true }), '$2.35B');
assert.equal(fmtUsd(812_000, { compact: true }), '$812K');
assert.equal(fmtUsd(0.000123), '$0.000123');
assert.equal(fmtPct(4.25), '4.3%');
assert.equal(fmtPct(-4.2, { signed: true }), '−4.2%');
assert.equal(fmtPct(4.2, { signed: true, decimals: 2 }), '+4.20%');
assert.equal(fmtRatioPct(0.42), '42%');
assert.equal(fmtR(1.25), '+1.3R');
assert.equal(fmtR(-1), '−1.0R');
assert.equal(fmtWinRate(42.05, 88), '42% · n=88');
assert.equal(fmtWinRate(0.5, 10, { ratio: true }), '50% · n=10');
assert.equal(fmtWinRate(null, 0), '— · n=0');
assert.equal(fmtGex(1.2e9), '+$1.20B per 1% move');
assert.equal(fmtVex(-6.4e8, true), '−$640.0M/vol pt');
const now = Date.parse('2026-09-30T14:00:00Z');
assert.equal(fmtAgo(now - 3_000, now), 'just now');
assert.equal(fmtAgo(now - 45_000, now), '45s ago');
assert.equal(fmtAgo(now - 120_000, now), '2m ago');
assert.equal(fmtAgo(new Date(now - 3 * 3600_000).toISOString(), now), '3h ago');
assert.equal(fmtAgo(null, now), 'age unknown');
assert.equal(fmtTimeET('2026-09-30T13:45:00Z'), '09:45 ET');
console.log('test-format: all checks passed');
