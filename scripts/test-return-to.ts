/**
 * Batch A checks: the sign-in return-to sanitizer (no open redirect), NEXUS
 * idea deep links, and the pre-market window / gap-alignment helpers.
 *   npx tsx scripts/test-return-to.ts
 */
import assert from 'node:assert/strict';
import { authHref, describeTarget, readReturnTo, sanitizeReturnTo } from '../client/src/lib/return-to';
import { nexusIdeaHref, readNexusTarget } from '../client/src/lib/nexus-link';
import { gapAlignment, isPreMarketWindow, rankGappers } from '../client/src/lib/premarket';

// ── return-to: accepted (same-origin relative, path + query + hash kept) ──
assert.equal(sanitizeReturnTo('/r/NVDA'), '/r/NVDA');
assert.equal(sanitizeReturnTo('/r/NVDA?tab=analyze#setups'), '/r/NVDA?tab=analyze#setups');
assert.equal(sanitizeReturnTo('/t?tab=gex&idea=abc-123'), '/t?tab=gex&idea=abc-123');
assert.equal(sanitizeReturnTo('  /today  '), '/today', 'surrounding whitespace trimmed');
assert.equal(sanitizeReturnTo('/t?tab=journal&jtab=trades&jids=bot:1,desk:2'), '/t?tab=journal&jtab=trades&jids=bot:1,desk:2');
assert.equal(sanitizeReturnTo('/r/../settings'), '/settings', 'dot segments resolve inside the origin');

// ── return-to: rejected (anything that can leave the site, loops, non-pages) ──
const bad = [
  null, undefined, 42, {}, '', '   ', 'r/NVDA', 'NVDA',
  '//evil.com', '//evil.com/r/NVDA', '/\\evil.com', '\\\\evil.com', '/\\/evil.com',
  'https://evil.com', 'http://quantedgelabs.net.evil.com/x', 'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x',
  '/%2F%2Fevil.com', '/%2fevil.com', '/%5Cevil.com', '/\t/evil.com', '/\n/evil.com', '/ /evil.com', '/r/NVDA\u0000',
  '/login', '/login?returnTo=/r/NVDA', '/LOGIN', '/signup', '/signup/', '/forgot-password', '/reset-password?t=1', '/logout', '/api/auth/me', '/api',
  '/', `/${'a'.repeat(2100)}`,
];
for (const b of bad) assert.equal(sanitizeReturnTo(b), null, `rejects ${JSON.stringify(b)?.slice(0, 60)}`);
assert.equal(sanitizeReturnTo('/loginx'), '/loginx', 'only the exact auth paths are blocked');
assert.equal(sanitizeReturnTo('/apiary'), '/apiary');

// ── return-to: query plumbing ──
assert.equal(readReturnTo('?returnTo=%2Fr%2FNVDA%3Ftab%3Danalyze%23setups'), '/r/NVDA?tab=analyze#setups');
assert.equal(readReturnTo('?returnTo=%2F%2Fevil.com'), null);
assert.equal(readReturnTo('?returnTo=https%3A%2F%2Fevil.com'), null);
assert.equal(readReturnTo(''), null);
assert.equal(authHref('/login', '/r/NVDA?tab=analyze#x'), '/login?returnTo=%2Fr%2FNVDA%3Ftab%3Danalyze%23x');
assert.equal(authHref('/signup', '//evil.com'), '/signup', 'unsafe target → bare auth page');
assert.equal(authHref('/login', null), '/login');
// round trip: what the gate writes, the login page reads back unchanged
const deep = '/r/SPY?tab=gex&from=terminal-oracle#levels';
assert.equal(readReturnTo(authHref('/login', deep).split('?')[1] ? `?${authHref('/login', deep).split('?')[1]}` : ''), deep);
assert.equal(describeTarget('/r/nvda?tab=analyze'), 'NVDA');
assert.equal(describeTarget('/t?tab=gex'), 'the terminal');
assert.equal(describeTarget('//evil.com'), 'this page');

// ── NEXUS idea links ──
assert.equal(nexusIdeaHref({ ideaId: 'abc-123', symbol: 'nvda' }), '/t?idea=abc-123&sym=NVDA');
assert.equal(nexusIdeaHref({ ideaId: null, symbol: 'SPX' }), '/t?sym=SPX');
assert.equal(nexusIdeaHref({ symbol: 'bad sym!' }), '/t', 'invalid symbol dropped');
assert.deepEqual(readNexusTarget('?idea=abc-123&sym=nvda'), { ideaId: 'abc-123', symbol: 'NVDA' });
assert.deepEqual(readNexusTarget('?tab=oracle'), null);
assert.deepEqual(readNexusTarget('?sym=%3Cscript%3E'), null, 'junk symbol ignored');
assert.deepEqual(readNexusTarget(nexusIdeaHref({ ideaId: 'x:1', symbol: 'BRK.B' }).slice(2)), { ideaId: 'x:1', symbol: 'BRK.B' });

// ── pre-market window (ET) ──
// 2026-09-30 is a Wednesday; EDT = UTC−4.
assert.equal(isPreMarketWindow(new Date('2026-09-30T07:59:00Z')), false, '03:59 ET');
assert.equal(isPreMarketWindow(new Date('2026-09-30T08:00:00Z')), true, '04:00 ET');
assert.equal(isPreMarketWindow(new Date('2026-09-30T13:29:00Z')), true, '09:29 ET');
assert.equal(isPreMarketWindow(new Date('2026-09-30T13:30:00Z')), false, '09:30 ET is the open');
assert.equal(isPreMarketWindow(new Date('2026-10-03T12:00:00Z')), false, 'Saturday');
assert.equal(isPreMarketWindow(new Date('2026-12-02T10:00:00Z')), true, 'EST (UTC−5): 05:00 ET');
// gap vs idea direction — longs and shorts symmetric, |gap| < 0.5% is flat
assert.equal(gapAlignment(2.1, 'long'), 'confirms');
assert.equal(gapAlignment(-2.1, 'long'), 'against');
assert.equal(gapAlignment(-1.2, 'short'), 'confirms');
assert.equal(gapAlignment(1.2, 'short'), 'against');
assert.equal(gapAlignment(0.3, 'long'), 'flat');
assert.equal(gapAlignment(3, null), 'flat');
assert.deepEqual(
  rankGappers([{ symbol: 'A', gapPct: 5 }, { symbol: 'B', gapPct: 0.2 }, { symbol: 'C', gapPct: -3, isWeekly: true }, { symbol: 'D', gapPct: -6 }], (s) => s === 'B').map((r) => r.symbol),
  ['B', 'C', 'D', 'A'], 'book names, then weekly watchlist, then |gap|',
);

console.log('return-to / nexus-link / premarket: all checks passed');
