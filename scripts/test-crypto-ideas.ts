/**
 * Unit tests for the native crypto ideas engine core (shared/crypto-ideas-core.ts):
 * setup detection on synthetic candles/funding, stop floors + expected-move
 * target caps, the path tracker, 24/7 (weekend) scheduling, publish caps.
 *   npm run test:crypto-ideas
 */
import assert from 'node:assert/strict';
import {
  aggregate4h, analyzeCoin, atr, buildPlan, cronFires, CRYPTO_ENGINE_CRON, CRYPTO_TRACKER_CRON, ema, gradeFor,
  parseUniverse, resolveCryptoPath, selectForPublish, summarizeCryptoRecord, T,
  type Candle, type CoinInput, type PerpContext,
} from '../shared/crypto-ideas-core';

let n = 0;
const t = (name: string, fn: () => void) => {
  try { fn(); n++; } catch (e) { console.error(`✗ ${name}`); throw e; }
};

const H = 3600;
const NOW = Date.UTC(2026, 8, 26, 14, 30); // Saturday 2026-09-26 14:30 UTC
const nowSec = Math.floor(NOW / 1000 / H) * H; // forming 1h bar start

/** 1h bars ending with the forming bar at nowSec. `px(i)` = close of bar i (0 = oldest). */
function hourly(count: number, px: (i: number) => number, vol: (i: number) => number = () => 100, wick = 0.004): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const close = px(i); const open = i ? px(i - 1) : close;
    out.push({ time: nowSec - (count - 1 - i) * H, open, high: Math.max(open, close) * (1 + wick), low: Math.min(open, close) * (1 - wick), close, volume: vol(i) });
  }
  return out;
}
/** Daily bars ending today, alternating ±`swing` around a drift so σ is known. */
function daily(count: number, start: number, drift: number, swing = 0.03): Candle[] {
  const day0 = Math.floor(NOW / 86_400_000) * 86_400;
  const out: Candle[] = []; let p = start;
  for (let i = 0; i < count; i++) {
    const open = p; p = p * (1 + drift + (i % 2 ? swing : -swing));
    out.push({ time: day0 - (count - 1 - i) * 86_400, open, high: Math.max(open, p) * 1.01, low: Math.min(open, p) * 0.99, close: p, volume: 1000 });
  }
  return out;
}
const noPerp: PerpContext | null = null;
const base = (over: Partial<CoinInput>): CoinInput => ({ symbol: 'SOL', h1: [], d1: daily(120, 50, 0.004), perp: noPerp, btcRegime: null, nowMs: NOW, ...over });

// ── indicators ────────────────────────────────────────────────────────────
t('ema seeds with SMA and tracks', () => {
  const e = ema([1, 2, 3, 4, 5, 6], 3);
  assert.ok(Number.isNaN(e[0]) && Number.isNaN(e[1]));
  assert.equal(e[2], 2); assert.equal(e[3], 3); assert.equal(e[5], 5);
});
t('4h buckets align to UTC 00/04/08…', () => {
  const bars = hourly(9, (i) => 100 + i);
  const b4 = aggregate4h(bars);
  for (const b of b4) assert.equal(b.time % 14_400, 0);
  const total = bars.reduce((a, b) => a + b.volume, 0);
  assert.equal(b4.reduce((a, b) => a + b.volume, 0), total);
});
t('universe env override', () => {
  assert.deepEqual(parseUniverse(undefined).slice(0, 4), ['BTC', 'ETH', 'SOL', 'HYPE']);
  assert.deepEqual(parseUniverse('btc-usd, qnt  pepe'), ['BTC', 'QNT', 'PEPE']);
  assert.equal(parseUniverse('  ').length, 10);
});

// ── A. trend continuation (pullback to the 4h EMA20) ──────────────────────
/** Uptrend for 280 bars, then a pullback that ends right at the 4h EMA20 (+0.2 ATR). */
function trendPullback(dir: 1 | -1): Candle[] {
  const up = (i: number) => 100 * Math.exp(dir * 0.0025 * i + 0.01 * Math.sin(i / 3));
  const pre = hourly(292, up);
  const h4 = aggregate4h(pre.slice(0, -1));
  const e20 = ema(h4.map((b) => b.close), 20).at(-1)!;
  const a4 = atr(h4, 14)!;
  const land = e20 + dir * 0.2 * a4;
  const last = pre.at(-1)!.close;
  const pull = hourly(300, (i) => (i < 292 ? up(i) : last + (land - last) * ((i - 291) / 8)));
  return pull;
}
t('trend pullback LONG: detected, stop ≥ 1.25 ATR, T1 capped ≤ 1σ·√2d, clocks 24h/48h', () => {
  const h1 = trendPullback(1);
  const r = analyzeCoin(base({ h1, d1: daily(120, 50, 0.004) }));
  const p = r.plans.find((x) => x.setup === 'trend_pullback');
  assert.ok(p, `no trend plan: ${r.notes.join(' | ')}`);
  assert.equal(p!.direction, 'long'); assert.equal(p!.horizon, 'swing'); assert.equal(p!.horizonDays, 2);
  const a4 = atr(aggregate4h(h1).slice(0, -1), 14)!;
  assert.ok(p!.entry - p!.stop >= 1.25 * a4 - 0.002, `stop floor 1.25 ATR: ${p!.entry - p!.stop} vs ${1.25 * a4}`);
  assert.ok(p!.expectedMove != null && p!.t1 - p!.entry <= p!.expectedMove! + 0.01, 'T1 within expected move');
  assert.ok(p!.t2 > p!.t1);
  assert.equal(Date.parse(p!.timeStopAtIso) - NOW, 24 * H * 1000);
  assert.equal(Date.parse(p!.exitByIso) - NOW, 48 * H * 1000);
  assert.ok(p!.rr >= T.minRR);
  assert.match(p!.grade, /^CS-[ABC]$/);
  assert.ok(p!.evidence.some((e) => /daily trend up/.test(e)));
});
t('trend pullback SHORT mirrors (shorts on equal footing)', () => {
  const h1 = trendPullback(-1);
  const r = analyzeCoin(base({ h1, d1: daily(120, 50, -0.004) }));
  const p = r.plans.find((x) => x.setup === 'trend_pullback');
  assert.ok(p, `no short trend plan: ${r.notes.join(' | ')}`);
  assert.equal(p!.direction, 'short');
  assert.ok(p!.stop > p!.entry && p!.t1 < p!.entry && p!.t2 < p!.t1);
});
t('BTC regime filter blocks alt longs when BTC is down', () => {
  const r = analyzeCoin(base({ h1: trendPullback(1), btcRegime: 'down' }));
  assert.equal(r.plans.filter((p) => p.direction === 'long').length, 0);
  assert.ok(r.notes.some((x) => /blocked by BTC regime/.test(x)));
});
t('BTC/ETH ideas carry the proxy watch line; alts do not', () => {
  const btc = analyzeCoin(base({ symbol: 'BTC', h1: trendPullback(1) })).plans[0];
  assert.ok(btc && btc.proxies.includes('MSTR') && btc.evidence.some((e) => /not confirmed until their own tape confirms/.test(e)));
  const sol = analyzeCoin(base({ h1: trendPullback(1) })).plans[0];
  assert.equal(sol.proxies.length, 0);
});

// ── B. range breakout with volume ─────────────────────────────────────────
function rangeThenBreak(volMult: number, dir: 1 | -1 = 1): Candle[] {
  // 270 flat-ish bars (100 ± 0.6), then the breakout bar, then the forming bar near the edge.
  return hourly(300, (i) => {
    if (i < 297) return 100 + 0.6 * Math.sin(i / 2);
    if (i === 297) return 100 + dir * 0.4;
    if (i === 298) return 100 + dir * 1.15;   // completed breakout bar
    return 100 + dir * 1.0;                   // forming bar = live (inside the no-chase zone)
  }, (i) => (i === 298 ? 100 * volMult : 100), 0.002);
}
t('range breakout LONG needs ≥ 1.5× volume', () => {
  const ok = analyzeCoin(base({ h1: rangeThenBreak(2.2), d1: daily(120, 100, 0) }));
  const p = ok.plans.find((x) => x.setup === 'range_breakout');
  assert.ok(p, `no breakout plan: ${ok.notes.join(' | ')}`);
  assert.equal(p!.direction, 'long'); assert.equal(p!.horizon, 'intraday'); assert.equal(p!.horizonDays, 0.5);
  const weak = analyzeCoin(base({ h1: rangeThenBreak(1.1), d1: daily(120, 100, 0) }));
  assert.equal(weak.plans.filter((x) => x.setup === 'range_breakout').length, 0);
  assert.ok(weak.notes.some((x) => /unconfirmed/.test(x)));
});
t('range breakdown SHORT', () => {
  const r = analyzeCoin(base({ h1: rangeThenBreak(2.2, -1), d1: daily(120, 100, 0) }));
  const p = r.plans.find((x) => x.setup === 'range_breakout');
  assert.ok(p, r.notes.join(' | ')); assert.equal(p!.direction, 'short');
});

// ── C. funding / OI extremes ──────────────────────────────────────────────
const perp = (fundingHourly: number, oiChangePct: number | null): PerpContext => ({
  fundingHourly, fundingAvg24h: fundingHourly, openInterest: 1e6, oiChangePct, oiWindowHours: oiChangePct == null ? null : 3,
  markPx: 100, oraclePx: 100, basisPct: 0, dayNtlVlm: 1e8, asOf: new Date(NOW).toISOString(),
});
/** Flat, then a flush to a 24h low ~12h ago, then a base holding above it. */
function heldLow(): Candle[] {
  return hourly(300, (i) => {
    if (i < 280) return 100 + 0.3 * Math.sin(i);
    if (i < 286) return 100 - (i - 279) * 0.5;  // flush to 97
    return 97.6 + 0.15 * Math.sin(i);            // holding above the low
  });
}
t('funding squeeze LONG: funding ≤ −10% APR + OI rising + holding the 24h low', () => {
  const r = analyzeCoin(base({ h1: heldLow(), d1: daily(120, 100, 0), perp: perp(-0.00002, 0.06) })); // −17.5% APR
  const p = r.plans.find((x) => x.setup === 'funding_squeeze');
  assert.ok(p, r.notes.join(' | ')); assert.equal(p!.direction, 'long');
  assert.ok(p!.evidence.some((e) => /APR/.test(e)));
});
t('no squeeze without rising OI (not measured / flat)', () => {
  for (const oi of [null, 0.005]) {
    const r = analyzeCoin(base({ h1: heldLow(), d1: daily(120, 100, 0), perp: perp(-0.00002, oi) }));
    assert.equal(r.plans.filter((x) => x.setup === 'funding_squeeze').length, 0);
    assert.ok(r.notes.some((x) => /OI not rising/.test(x)));
  }
});
t('funding fade SHORT on crowded longs failing under the 24h high', () => {
  const h1 = hourly(300, (i) => (i < 280 ? 100 + 0.3 * Math.sin(i) : i < 286 ? 100 + (i - 279) * 0.5 : 102.4 + 0.15 * Math.sin(i)));
  const r = analyzeCoin(base({ h1, d1: daily(120, 100, 0), perp: perp(0.00006, 0.05) })); // 52.6% APR
  const p = r.plans.find((x) => x.setup === 'funding_fade');
  assert.ok(p, r.notes.join(' | ')); assert.equal(p!.direction, 'short');
});

// ── stop / target caps ────────────────────────────────────────────────────
t('expected-move cap: T1 capped, original kept as T2; too-wide stop rejected', () => {
  const h1 = hourly(300, () => 100);
  const inp = base({ h1, d1: daily(120, 100, 0, 0.01) }); // σ ≈ 1%/day
  const draft = { setup: 'trend_pullback' as const, direction: 'long' as const, horizon: 'swing' as const, entryZone: [99, 101] as [number, number], stop: 99, stopBasis: 'test', atrRef: 0.5, structuralT1: 110, t2: null, why: 'x', evidence: [], basePoints: 5 };
  const r = buildPlan(inp, draft, []);
  assert.ok(r.plan, r.reason ?? '');
  const em = r.plan!.expectedMove!;
  assert.ok(r.plan!.t1Capped); assert.ok(Math.abs(r.plan!.t1 - (100 + em)) < 0.01); assert.equal(r.plan!.t2, 110);
  const wide = buildPlan(inp, { ...draft, stop: 98.5, atrRef: 0.6 }, []); // risk 1.5 vs EM ≈ 1.41 → R:R < 1.2
  assert.equal(wide.plan, null); assert.match(wide.reason!, /R:R/);
  const tight = buildPlan(inp, { ...draft, stop: 99.8 }, []);
  assert.equal(tight.plan, null); assert.match(tight.reason!, /noise stop/);
  const chase = buildPlan(inp, { ...draft, entryZone: [95, 97] }, []);
  assert.equal(chase.plan, null); assert.match(chase.reason!, /not chased/);
});
t('grade scale is its own (CS-*)', () => {
  assert.equal(gradeFor(8), 'CS-A'); assert.equal(gradeFor(5), 'CS-B'); assert.equal(gradeFor(4), 'CS-C');
});

// ── tracker path ──────────────────────────────────────────────────────────
const P0 = NOW;
const bar = (minAfter: number, o: number, h: number, l: number, c: number): Candle => ({ time: Math.floor(P0 / 1000) + minAfter * 60, open: o, high: h, low: l, close: c, volume: 1 });
const path = (bars: Candle[], over: Record<string, unknown> = {}) => resolveCryptoPath({
  direction: 'long', entry: 100, stop: 97, target: 106, publishedMs: P0, timeStopAtMs: P0 + 12 * H * 1000, minR: 0.5, exitByMs: P0 + 24 * H * 1000,
  bars, granSec: 900, nowMs: P0 + 30 * H * 1000, ...over,
});
t('path: target, stop, same-bar → stop, pre-publish bar ignored', () => {
  assert.equal(path([bar(0, 100, 102, 99, 101), bar(15, 101, 106.5, 100.5, 106)]).status, 'hit_target');
  assert.equal(path([bar(0, 100, 101, 96.9, 97.5)]).status, 'hit_stop');
  const both = path([bar(0, 100, 107, 96, 100)]);
  assert.equal(both.status, 'hit_stop'); assert.match(both.reason, /same bar/);
  assert.equal(path([bar(-15, 100, 101, 90, 100), bar(0, 100, 101, 99, 100)]).status, 'open');
});
t('path: time stop at half-horizon unless ≥ 0.5R; horizon exit', () => {
  const flat = [bar(0, 100, 100.5, 99.5, 100), bar(12 * 60, 100.4, 100.6, 100.2, 100.5)];
  const ts = path(flat);
  assert.equal(ts.status, 'expired'); assert.equal(ts.resolution, 'time_stop'); assert.equal(ts.exitPrice, 100.4);
  const ahead = path([bar(0, 100, 100.5, 99.5, 100), bar(12 * 60, 102, 102.5, 101.8, 102), bar(24 * 60, 103, 103, 103, 103)]);
  assert.equal(ahead.status, 'expired'); assert.equal(ahead.resolution, 'horizon'); assert.equal(ahead.exitPrice, 103);
  const short = resolveCryptoPath({ direction: 'short', entry: 100, stop: 103, target: 94, publishedMs: P0, timeStopAtMs: null, minR: 0.5, exitByMs: null, bars: [bar(0, 100, 100.5, 93.9, 94)], granSec: 900, nowMs: P0 + H * 1000 });
  assert.equal(short.status, 'hit_target');
});

// ── 24/7 scheduling (weekends) ────────────────────────────────────────────
t('crypto engine + tracker fire on Saturday and Sunday, every hour', () => {
  assert.ok(cronFires(CRYPTO_ENGINE_CRON, { minute: 7, hour: 3, weekday: 6 }));
  assert.ok(cronFires(CRYPTO_ENGINE_CRON, { minute: 37, hour: 23, weekday: 0 }));
  assert.ok(!cronFires(CRYPTO_ENGINE_CRON, { minute: 8, hour: 3, weekday: 6 }));
  assert.ok(cronFires(CRYPTO_TRACKER_CRON, { minute: 55, hour: 2, weekday: 0 }));
  let fires = 0;
  for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m++) if (cronFires(CRYPTO_ENGINE_CRON, { minute: m, hour: h, weekday: 6 })) fires++;
  assert.equal(fires, 48);
  // Contrast: the stock quant sweep does not run on a Saturday.
  assert.ok(!cronFires('12,42 9-15 * * 1-5', { minute: 12, hour: 10, weekday: 6 }));
  assert.ok(cronFires('12,42 9-15 * * 1-5', { minute: 12, hour: 10, weekday: 2 }));
});

// ── publish selection ─────────────────────────────────────────────────────
t('publish: grade bar, one open idea per coin, dedupe, daily cap', () => {
  const c = (symbol: string, points: number, direction: 'long' | 'short' = 'long', setup = 'trend_pullback' as const) => ({ symbol, points, direction, setup });
  const r = selectForPublish([c('BTC', 8), c('BTC', 6, 'short'), c('ETH', 4), c('SOL', 6), c('XRP', 7), c('LINK', 5)], [
    { symbol: 'SOL', direction: 'long', setup: 'trend_pullback', timestampMs: NOW - 3 * H * 1000, open: false },
    { symbol: 'DOGE', direction: 'long', setup: 'range_breakout', timestampMs: NOW - H * 1000, open: true },
  ], { nowMs: NOW, maxPerDay: 4, dedupHours: 12 }); // 2 already today (SOL, DOGE)
  assert.deepEqual(r.publish.map((x) => x.symbol), ['BTC', 'XRP']); // ETH grade C, BTC short (coin taken), SOL dup, LINK over the cap
  assert.ok(r.skipped.some((s) => s.c.symbol === 'ETH' && /grade/.test(s.why)));
  assert.ok(r.skipped.some((s) => s.c.symbol === 'SOL' && /published/.test(s.why)));
  assert.ok(r.skipped.some((s) => s.c.symbol === 'LINK' && /daily cap/.test(s.why)));
  const run = selectForPublish([c('BTC', 8), c('ETH', 7), c('SOL', 7), c('XRP', 6)], [], { nowMs: NOW, maxPerDay: 10, dedupHours: 12, maxPerRun: 3 });
  assert.equal(run.publish.length, 3); assert.ok(run.skipped.some((s) => /per-run cap/.test(s.why)));
});

// ── record ────────────────────────────────────────────────────────────────
t('record: n counts target/stop only, avgR, LOW N', () => {
  const rec = summarizeCryptoRecord([
    { timestamp: '2026-09-26T01:00:00Z', direction: 'long', entryPrice: 100, stopLoss: 97, exitPrice: 106, outcomeStatus: 'hit_target' },
    { timestamp: '2026-09-26T02:00:00Z', direction: 'short', entryPrice: 100, stopLoss: 102, exitPrice: 102, outcomeStatus: 'hit_stop' },
    { timestamp: '2026-09-26T03:00:00Z', direction: 'long', entryPrice: 100, stopLoss: 98, exitPrice: 100.5, outcomeStatus: 'expired' },
    { timestamp: '2026-09-26T04:00:00Z', direction: 'long', entryPrice: 100, stopLoss: 98, outcomeStatus: 'open' },
  ]);
  assert.equal(rec.n, 2); assert.equal(rec.wins, 1); assert.equal(rec.open, 1); assert.equal(rec.unresolvedClosed, 1);
  assert.ok(Math.abs(rec.avgR! - (2 - 1 + 0.25) / 3) < 1e-9);
  assert.equal(rec.lowN, true); assert.equal(rec.firstAt, '2026-09-26T01:00:00Z');
});

console.log(`crypto-ideas: ${n} tests passed`);
