/**
 * Quote freshness, extended hours and index proxies (docs/DATA_LATENCY.md).
 * Pure — no network. Run: npm run test:quote-freshness
 */
import assert from 'node:assert/strict';
import { etWallToMs } from '../shared/loss-rules';
import {
  marketSessionAt, freshnessChip, parseEtWallTime, pickFreshest, ratioProxy, barCloseAt, etHHMM,
} from '../shared/quote-freshness';
import { dayChangeFromIntradayChart, priorRegularCloseFromMeta } from '../shared/price-change';
import { metaToSnapshot } from '../server/pre-market-service';
import {
  computeIndexProxy, alpacaLatestTrades, applyFresher, feedsForSession, isEntitlementRefusal, _resetAlpacaFeedState,
} from '../server/extended-quote';
import type { RealtimeQuote } from '../server/realtime-pricing-service';

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => {
  try { await fn(); n++; } catch (e) { console.error(`FAIL ${name}`); throw e; }
};
// 2026-10-01 is a Thursday.
const et = (d: number, hh: number, mm: number, month = 10) => etWallToMs(2026, month, d, hh * 60 + mm);

async function main() {
  await t('sessions by ET clock', () => {
    assert.equal(marketSessionAt(et(1, 3, 59)), 'overnight');
    assert.equal(marketSessionAt(et(1, 4, 0)), 'pre');
    assert.equal(marketSessionAt(et(1, 9, 29)), 'pre');
    assert.equal(marketSessionAt(et(1, 9, 30)), 'regular');
    assert.equal(marketSessionAt(et(1, 15, 59)), 'regular');
    assert.equal(marketSessionAt(et(1, 16, 0)), 'post');
    assert.equal(marketSessionAt(et(1, 19, 59)), 'post');
    assert.equal(marketSessionAt(et(1, 20, 0)), 'overnight');
    assert.equal(marketSessionAt(et(2, 20, 30)), 'closed'); // Friday night
    assert.equal(marketSessionAt(et(3, 12, 0)), 'closed'); // Saturday
    assert.equal(marketSessionAt(et(4, 19, 0)), 'closed'); // Sunday before 20:00
    assert.equal(marketSessionAt(et(4, 20, 30)), 'overnight'); // Sunday night session
    assert.equal(marketSessionAt(et(5, 2, 0)), 'overnight'); // Monday 02:00
    // Winter (EST) too.
    assert.equal(marketSessionAt(etWallToMs(2026, 12, 15, 9 * 60 + 31)), 'regular');
  });

  await t('CBOE ET wall time parses with the right DST offset', () => {
    assert.equal(parseEtWallTime('2026-09-30T16:14:59'), et(30, 16, 14, 9) + 59_000);
    assert.equal(parseEtWallTime('2026-12-15T09:30:00'), etWallToMs(2026, 12, 15, 570));
    assert.equal(parseEtWallTime('garbage'), null);
    assert.equal(etHHMM(et(1, 7, 42)), '07:42');
  });

  await t('chip labels — never "Live" unless realtime, regular and recent', () => {
    const now = et(1, 10, 0);
    assert.equal(freshnessChip({ session: 'regular', asOf: now - 5_000 }, now).label, 'Live');
    assert.equal(freshnessChip({ session: 'regular', asOf: now - 5_000 }, now).tone, 'live');
    assert.equal(freshnessChip({ session: 'regular', asOf: now - 900_000, delayed: true, delayedSec: 900 }, now).label, 'Delayed 15m');
    assert.equal(freshnessChip({ session: 'regular', asOf: now - 900_000, delayed: true }, now).label, 'Delayed 15m');
    assert.match(freshnessChip({ session: 'regular', asOf: now - 600_000 }, now).label, /^Last 09:50$/);
    assert.equal(freshnessChip({ session: 'pre', asOf: et(1, 7, 42) }, now).label, 'Pre-mkt 07:42');
    assert.equal(freshnessChip({ session: 'post', asOf: et(1, 17, 10) }, et(1, 17, 11)).label, 'After-hrs 17:10');
    assert.equal(freshnessChip({ session: 'overnight', asOf: et(1, 22, 5), proxy: true }, et(1, 22, 6)).label, 'Overnight (proxy)');
    assert.equal(freshnessChip({ session: 'regular', asOf: now - 2_000, proxy: true }, now).label, 'Live (proxy)');
    assert.equal(freshnessChip({ session: 'regular', asOf: now - 2_000, stale: true }, now).tone, 'stale');
    // Session falls back to the print's clock when the provider gave none.
    assert.equal(freshnessChip({ asOf: et(1, 6, 0) }, now).label, 'Pre-mkt 06:00');
  });

  await t('pickFreshest / ratioProxy / barCloseAt', () => {
    const best = pickFreshest([{ price: 1, at: 10, source: 'a' }, null, { price: 2, at: 20, source: 'b' }, { price: 0, at: 99, source: 'bad' }]);
    assert.equal(best?.source, 'b');
    assert.equal(ratioProxy(760, 7650, 765), 7600);
    assert.equal(ratioProxy(0, 1, 1), null);
    assert.equal(barCloseAt([100, 160, 220], [1, 2, 3], 200), 2);
    assert.equal(barCloseAt([100], [1], 1000), null); // gap too large
  });

  // Yahoo SPY range=1d at 07:04 ET 2026-10-01 (measured): previousClose is the D-2 close.
  const regStart = Math.floor(et(1, 9, 30) / 1000);
  const preMeta = {
    regularMarketPrice: 762.63, regularMarketTime: Math.floor(et(30, 16, 0, 9) / 1000),
    previousClose: 764.2, chartPreviousClose: 764.2,
    currentTradingPeriod: { pre: { start: Math.floor(et(1, 4, 0) / 1000), end: regStart }, regular: { start: regStart, end: Math.floor(et(1, 16, 0) / 1000) }, post: { start: Math.floor(et(1, 16, 0) / 1000), end: Math.floor(et(1, 20, 0) / 1000) } },
  };

  await t('pre-market % is measured against the LAST regular close, not D-2', () => {
    assert.equal(priorRegularCloseFromMeta(preMeta), 762.63);
    const res = { meta: preMeta, timestamp: [Math.floor(et(1, 7, 4) / 1000)], indicators: { quote: [{ close: [765.5], volume: [100] }] } };
    const dc = dayChangeFromIntradayChart(res)!;
    assert.equal(dc.previousClose, 762.63);
    assert.equal(dc.session, 'pre');
    assert.ok(Math.abs(dc.changePercent - ((765.5 - 762.63) / 762.63) * 100) < 1e-9);
    // No bar (index before the open): unchanged behaviour — yesterday's day move.
    const idx = dayChangeFromIntradayChart({ meta: preMeta, timestamp: [], indicators: { quote: [{ close: [] }] } })!;
    assert.equal(idx.previousClose, 764.2);
    // During the regular session previousClose is untouched.
    const rth = { ...preMeta, regularMarketTime: Math.floor(et(1, 10, 0) / 1000), previousClose: 762.63 };
    assert.equal(priorRegularCloseFromMeta(rth, Math.floor(et(1, 10, 0) / 1000)), 762.63);
  });

  await t('pre-market service gap uses the last close; post uses the post-window bar', () => {
    const snap = metaToSnapshot('SPY', { ...preMeta, __pmLast: 765.5, __pmLastAt: et(1, 7, 4) }, 'pre_market')!;
    assert.equal(snap.previousClose, 762.63);
    assert.ok(Math.abs((snap.preMarketGapPct ?? 0) - ((765.5 - 762.63) / 762.63) * 100) < 1e-9);
    const postMeta = { ...preMeta, regularMarketPrice: 770, regularMarketTime: Math.floor(et(1, 16, 0) / 1000), previousClose: 762.63, postMarketPrice: null, __postLast: 771, __postLastAt: et(1, 17, 0) };
    const post = metaToSnapshot('SPY', postMeta, 'post_market')!;
    assert.equal(post.price, 771);
    assert.ok(Math.abs(post.gapPct - ((771 - 770) / 770) * 100) < 1e-9);
  });

  await t('index proxy: RTH stale CBOE → SPY × live ratio; fresh index stands', () => {
    const now = et(1, 11, 0);
    const indexAt = now - 900_000; // CBOE 15 min behind
    const r = computeIndexProxy('SPX', {
      now, index: { price: 7650, at: indexAt, previousClose: 7600 },
      etf: { price: 766, at: now - 3_000, previousClose: 760, priceAtIndexPrint: 765, regularClose: 760 },
    })!;
    assert.ok(r);
    assert.equal(r.session, 'regular');
    assert.ok(Math.abs(r.price - 766 * (7650 / 765)) < 1e-9);
    assert.match(r.source, /^proxy:SPY×/);
    // Fresh index print → no proxy.
    assert.equal(computeIndexProxy('SPX', { now, index: { price: 7650, at: now - 10_000 }, etf: { price: 766, at: now - 1_000, priceAtIndexPrint: 765 } }), null);
    // ETF itself stale → keep the index.
    assert.equal(computeIndexProxy('SPX', { now, index: { price: 7650, at: indexAt }, etf: { price: 766, at: now - 120_000, priceAtIndexPrint: 765 } }), null);
    // No live ratio → prior-close ratio.
    const c = computeIndexProxy('SPX', { now, index: { price: 7650, at: indexAt, previousClose: 7600 }, etf: { price: 766, at: now - 1_000, previousClose: 760 } })!;
    assert.ok(Math.abs(c.price - 766 * 10) < 1e-9);
    // VIX has no proxy.
    assert.equal(computeIndexProxy('VIX', { now, index: { price: 16, at: indexAt } }), null);
  });

  await t('index proxy outside RTH: freshest of ETF-extended and futures, labelled by session', () => {
    const close = et(30, 16, 15, 9);
    // Overnight 22:00: SPY has no print after 20:00, ES has.
    const now = et(30, 22, 0, 9);
    const r = computeIndexProxy('SPX', {
      now, index: { price: 7651.54, at: close },
      etf: { price: 763.6, at: et(30, 19, 59, 9), regularClose: 762.63 },
      future: { price: 7743.75, at: now - 600_000, previousClose: 7715.5 },
    })!;
    assert.equal(r.session, 'overnight');
    assert.match(r.source, /ES=F/);
    assert.ok(Math.abs(r.price - 7651.54 * 7743.75 / 7715.5) < 1e-9);
    // Pre-market 07:30: SPY prints are fresher than ES (10-min delayed on Yahoo).
    const pre = et(1, 7, 30);
    const p = computeIndexProxy('SPX', {
      now: pre, index: { price: 7651.54, at: close },
      etf: { price: 765.5, at: pre - 5_000, regularClose: 762.63 },
      future: { price: 7743.75, at: pre - 600_000, previousClose: 7715.5 },
    })!;
    assert.equal(p.session, 'pre');
    assert.match(p.source, /^proxy:SPY×/);
    assert.ok(Math.abs(p.price - 765.5 * 7651.54 / 762.63) < 1e-9);
    // Post 16:30: futures previousClose is the prior day → never used.
    const post = et(1, 16, 30);
    const q = computeIndexProxy('SPX', {
      now: post, index: { price: 7700, at: et(1, 16, 15) },
      future: { price: 7800, at: post - 1_000, previousClose: 7715.5 },
    });
    assert.equal(q, null);
  });

  await t('Alpaca: entitlement refusals are detected and remembered', async () => {
    const prevK = process.env.ALPACA_API_KEY; const prevS = process.env.ALPACA_SECRET_KEY;
    process.env.ALPACA_API_KEY = 'k'; process.env.ALPACA_SECRET_KEY = 's';
    _resetAlpacaFeedState();
    let calls = 0;
    const refuse = (async () => { calls++; return new Response('{"message":"subscription does not permit querying overnight data"}', { status: 403 }); }) as unknown as typeof fetch;
    assert.equal((await alpacaLatestTrades(['SPY'], 'overnight', refuse)).size, 0);
    assert.equal((await alpacaLatestTrades(['SPY'], 'overnight', refuse)).size, 0);
    assert.equal(calls, 1, 'second call must not hit a feed that refused');
    const ok = (async () => new Response(JSON.stringify({ trades: { SPY: { p: 765.6, t: '2026-10-01T10:47:40.394Z' } } }), { status: 200 })) as unknown as typeof fetch;
    const m = await alpacaLatestTrades(['spy'], 'delayed_sip', ok);
    assert.equal(m.get('SPY')?.price, 765.6);
    assert.ok(isEntitlementRefusal(422) && isEntitlementRefusal(401) && !isEntitlementRefusal(500));
    _resetAlpacaFeedState();
    process.env.ALPACA_API_KEY = prevK; process.env.ALPACA_SECRET_KEY = prevS;
    if (prevK === undefined) delete process.env.ALPACA_API_KEY;
    if (prevS === undefined) delete process.env.ALPACA_SECRET_KEY;
  });

  await t('feeds per session; applyFresher only replaces with a newer print', () => {
    assert.deepEqual(feedsForSession('regular'), []);
    assert.deepEqual(feedsForSession('overnight'), ['overnight', 'boats']);
    assert.ok(feedsForSession('pre').includes('delayed_sip'));
    const base: RealtimeQuote = { symbol: 'AAPL', name: 'AAPL', price: 330, change: 0, changePercent: 0, high: 330, low: 330, volume: 0, lastUpdate: new Date(et(1, 19, 59)), assetType: 'stock', source: 'yahoo', session: 'post', previousClose: 320 };
    const newer = applyFresher(base, { price: 333, at: et(1, 21, 0), source: 'alpaca-overnight', delayedSec: 0, session: 'overnight' });
    assert.equal(newer.price, 333);
    assert.equal(newer.session, 'overnight');
    assert.equal(newer.source, 'alpaca-overnight');
    assert.ok(Math.abs(newer.changePercent - (13 / 320) * 100) < 1e-9);
    assert.equal(applyFresher(base, { price: 1, at: et(1, 19, 0), source: 'old', session: 'post' }), base);
    const delayed = applyFresher(base, { price: 331, at: et(1, 20, 30), source: 'alpaca-delayed_sip', delayedSec: 900, session: 'overnight' });
    assert.equal(delayed.delayed, true);
    assert.equal(freshnessChip({ session: delayed.session, asOf: delayed.lastUpdate.getTime(), delayedSec: delayed.delayedSec }, et(1, 20, 45)).label, 'Delayed 15m');
  });

  console.log(`quote-freshness: ${n} groups passed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
