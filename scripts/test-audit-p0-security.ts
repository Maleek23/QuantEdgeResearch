/**
 * Audit 2026-10-01 P0 security fixes (#1 Validate All, #2 Share to Discord, #3 /w).
 *   npx tsx scripts/test-audit-p0-security.ts
 * Pure checks — no DB, no network, no Discord post.
 */
import assert from 'node:assert/strict';
import { guardFor } from '../server/route-guards';
import { buildLivePriceMap, isApplyRequest, quoteAssetType, MAX_QUOTE_AGE_MS } from '../server/performance-validate-live';
import { publicWatchlistOwners, filterOptedInWatchlist } from '../server/public-watchlist-optin';
import { tradeIdeaDiscordBlockReason, markTradeIdeaShared } from '../server/discord-service';

let n = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); n++; };

// ── #1 Validate All ──────────────────────────────────────────────────────────
ok(guardFor('POST', '/api/performance/validate') === 'operator', 'Validate All is operator-only');
ok(guardFor('POST', '/API/Performance/Validate/') === 'operator', 'guard is case/slash-insensitive');

const now = new Date('2026-10-01T15:00:00Z');
const fresh = new Date(now.getTime() - 10_000);
const old = new Date(now.getTime() - MAX_QUOTE_AGE_MS - 1);
const ideas = [
  { id: '1', symbol: 'AAPL', assetType: 'stock' },
  { id: '2', symbol: 'MSFT', assetType: 'stock' },    // no quote
  { id: '3', symbol: 'TSLA', assetType: 'stock' },    // stale flag
  { id: '4', symbol: 'NVDA', assetType: 'stock' },    // too old
  { id: '5', symbol: 'SPY', assetType: 'option' },    // option — never on the underlying
  { id: '6', symbol: 'AMD', assetType: 'stock' },     // zero price
];
const quotes = new Map<string, { price: number; stale?: boolean; lastUpdate?: Date }>([
  ['AAPL', { price: 200, lastUpdate: fresh }],
  ['TSLA', { price: 250, stale: true, lastUpdate: fresh }],
  ['NVDA', { price: 120, lastUpdate: old }],
  ['SPY', { price: 600, lastUpdate: fresh }],
  ['AMD', { price: 0, lastUpdate: fresh }],
]);
const { priceMap, skipped } = buildLivePriceMap(ideas, quotes, now);
ok(priceMap.size === 1 && priceMap.get('AAPL') === 200, 'only the fresh live quote is used');
ok(skipped.length === 5, 'every idea without a live quote is skipped, not priced');
ok(skipped.find((s) => s.id === '2')?.reason === 'quote unavailable', 'missing quote → unavailable');
ok(/stale/.test(skipped.find((s) => s.id === '3')!.reason), 'stale quote is refused');
ok(/older/.test(skipped.find((s) => s.id === '4')!.reason), 'old quote is refused');
ok(/option/.test(skipped.find((s) => s.id === '5')!.reason), 'options are never resolved on the underlying');
ok(quoteAssetType('option') === null && quoteAssetType('crypto') === 'crypto' && quoteAssetType(undefined) === 'stock', 'asset mapping');

ok(isApplyRequest(undefined, undefined) === false, 'dry run by default');
ok(isApplyRequest({}, {}) === false, 'empty body is a dry run');
ok(isApplyRequest({ apply: 'yes' }, {}) === false, 'only a literal true applies');
ok(isApplyRequest({ apply: true }, {}) === true, 'apply:true writes');
ok(isApplyRequest({}, { apply: 'true' }) === true, '?apply=true writes');

// ── #2 Share to Discord ──────────────────────────────────────────────────────
ok(guardFor('POST', '/api/trade-ideas/abc/share-discord') === 'operator', 'share-discord is operator-only');
ok(guardFor('POST', '/api/trade-ideas/abc/share-discord-card') === 'operator', 'share-discord-card is operator-only');

const base: any = {
  id: 'x', symbol: 'ZZTEST', direction: 'long', assetType: 'stock', entryPrice: 10, targetPrice: 11, stopLoss: 9.5,
  timestamp: now.toISOString(), source: 'quant',
};
const low = tradeIdeaDiscordBlockReason({ ...base, grade: 'D' });
ok(low && /grade D/.test(low), 'a low-grade idea is refused (no more forceBypass)');
ok(tradeIdeaDiscordBlockReason({ ...base, grade: 'A' }) === null, 'an A idea passes');
ok(tradeIdeaDiscordBlockReason({ ...base, grade: 'C', convictionBand: 'S' }) === null, 'an S-band idea passes the band gate');
markTradeIdeaShared({ ...base, grade: 'A' });
const dup = tradeIdeaDiscordBlockReason({ ...base, grade: 'A' });
ok(dup && /4 hours/.test(dup), 'a second share inside the dedup window is refused');

// ── #3 /w public watchlist ───────────────────────────────────────────────────
ok(guardFor('GET', '/api/public/watchlist') === null, 'the public read stays public (it is opt-in filtered)');
ok(publicWatchlistOwners('').size === 0 && publicWatchlistOwners(undefined).size === 0, 'no opt-in list → nobody');
ok(publicWatchlistOwners(' u1, ,u2 ').size === 2, 'opt-in list parses');
const rows = [
  { userId: 'u1', symbol: 'AAPL' },
  { userId: 'u2', symbol: 'TSLA' },
  { userId: 'u3', symbol: 'GME' },
  { userId: null, symbol: 'LEGACY' },
];
ok(filterOptedInWatchlist(rows, new Set()).length === 0, 'private by default: nothing published');
const pub = filterOptedInWatchlist(rows, new Set(['u1']));
ok(pub.length === 1 && pub[0].symbol === 'AAPL', 'only opted-in owners are published');
ok(!filterOptedInWatchlist(rows, new Set(['u1', 'u2'])).some((r) => r.userId === null), 'ownerless rows never published');

console.log(`audit-p0-security: ${n} checks passed`);
process.exit(0);
