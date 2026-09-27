import assert from 'node:assert/strict';
import { LEGACY_REDIRECTS, mergeRedirectQuery, resolveLegacyRedirect } from '../client/src/lib/legacy-redirects';

const literalSources = new Set(LEGACY_REDIRECTS.map(([source]) => source).filter((source) => !source.includes(':')));
for (const [, target] of LEGACY_REDIRECTS) {
  if (typeof target !== 'string') continue;
  const pathname = target.split('?')[0];
  assert(!literalSources.has(pathname), `redirect chain detected through ${pathname}`);
}
assert.equal(resolveLegacyRedirect('/dashboard'), '/t');
assert.equal(resolveLegacyRedirect('/stock/MSFT'), '/r/MSFT?tab=chart');
assert.equal(resolveLegacyRedirect('/dashboard/'), null);
assert.equal(mergeRedirectQuery('/t?tab=gex', '?symbol=SPY&tab=flow'), '/t?symbol=SPY&tab=gex');
console.log(`redirect checks passed (${LEGACY_REDIRECTS.length} legacy routes)`);
