/**
 * Unit tests for server/premarket-ideas.ts (pure core) on synthetic pre-market
 * data and 1m bars: ranking, each setup's trigger logic, caps, record, and the
 * 0–7 DTE intraday contract window.
 *   npm run -s test:premarket-ideas
 */
import assert from 'node:assert/strict';
import { etWallToMs } from '../shared/loss-rules';
import {
  pmSessionStats, avgPriorPmVolume, rankPreMarketMovers, planSetups, evaluateSetups, pickTargets, capCheck, summarizeRecord,
  type Bar, type MoverInput, type PlanContext,
} from '../server/premarket-ideas';
import { intradayWindowFor, selectFromChain, type RawChainOption } from '../server/option-selection-engine';

let n = 0;
const t = (name: string, fn: () => void) => {
  try { fn(); n++; } catch (e) { console.error(`✗ ${name}`); throw e; }
};

// Wednesday 2026-09-30 and the prior sessions (ET wall clock → epoch seconds).
const D = { y: 2026, m: 9, d: 30 };
const at = (min: number, d = D) => Math.floor(etWallToMs(d.y, d.m, d.d, min) / 1000);
const hm = (h: number, m: number) => h * 60 + m;
const bar = (min: number, o: number, h: number, l: number, c: number, v = 1000, d = D): Bar => ({ time: at(min, d), open: o, high: h, low: l, close: c, volume: v });
const flat = (min: number, px: number, v = 1000, d = D) => bar(min, px, px + 0.05, px - 0.05, px, v, d);
const nowAt = (h: number, m: number) => etWallToMs(D.y, D.m, D.d, hm(h, m));

// ── pre-market stats ───────────────────────────────────────────────────────
t('PM stats read only 04:00–09:30 ET of the day', () => {
  const bars = [
    bar(hm(3, 55), 99, 99, 99, 99, 999_999), // before 04:00 — ignored
    bar(hm(4, 0), 104, 105, 103.5, 104.5, 2000),
    bar(hm(8, 0), 104.5, 106, 104, 105.5, 3000),
    bar(hm(9, 25), 105.5, 105.8, 105, 105.2, 1000),
    bar(hm(9, 30), 105.2, 110, 105, 109, 50_000), // RTH — ignored
  ];
  const s = pmSessionStats(bars, '2026-09-30')!;
  assert.equal(s.high, 106); assert.equal(s.low, 103.5); assert.equal(s.volume, 6000); assert.equal(s.last, 105.2); assert.equal(s.bars, 3);
  assert.equal(pmSessionStats(bars, '2026-09-29'), null);
});
t('20-session PM average excludes today and needs ≥5 sessions', () => {
  const days = [22, 23, 24, 25, 26, 29].map((d) => ({ y: 2026, m: 9, d }));
  const bars = days.flatMap((d, i) => [flat(hm(7, 0), 100, 1000 * (i + 1), d)]).concat([flat(hm(7, 0), 100, 99_999)]);
  const a = avgPriorPmVolume(bars, '2026-09-30');
  assert.equal(a.sessions, 6); assert.equal(a.avg, 3500);
  assert.equal(avgPriorPmVolume(bars.slice(0, 3), '2026-09-30').avg, null);
});

// ── ranking ────────────────────────────────────────────────────────────────
const mover = (o: Partial<MoverInput> & { symbol: string }): MoverInput => ({
  gapPct: 3, pmPrice: 103, prevClose: 100, pmVolume: 300_000, pmAvgVolume20: 100_000, pmDollarVolume: 30_000_000, catalyst: null, ...o,
});
t('gap thresholds: 2% stocks, 1% index ETFs', () => {
  const { ranked, rejected } = rankPreMarketMovers([
    mover({ symbol: 'AAA', gapPct: 1.5 }),
    mover({ symbol: 'SPY', gapPct: -1.2, pmVolume: null, pmAvgVolume20: null, pmDollarVolume: 60_000_000 }),
    mover({ symbol: 'BBB', gapPct: -2.4 }),
  ]);
  assert.deepEqual(ranked.map((r) => r.symbol).sort(), ['BBB', 'SPY']);
  assert.equal(rejected[0].symbol, 'AAA');
  assert.equal(ranked.find((r) => r.symbol === 'SPY')!.isIndex, true);
});
t('participation: PM-volume ratio OR dollar-volume floor; thin names rejected', () => {
  const { ranked, rejected } = rankPreMarketMovers([
    mover({ symbol: 'RAT', pmVolume: 200_000, pmAvgVolume20: 100_000, pmDollarVolume: 500_000 }), // ratio 2× passes
    mover({ symbol: 'DOL', pmVolume: 50_000, pmAvgVolume20: null, pmDollarVolume: 5_000_000 }),   // no avg, floor passes
    mover({ symbol: 'THN', pmVolume: 10_000, pmAvgVolume20: 100_000, pmDollarVolume: 400_000 }),  // thin
  ]);
  assert.deepEqual(ranked.map((r) => r.symbol).sort(), ['DOL', 'RAT']);
  assert.equal(rejected.find((r) => r.symbol === 'THN')!.reason.startsWith('thin pre-market'), true);
});
t('score: bigger gap, heavier volume and a catalyst rank first', () => {
  const { ranked } = rankPreMarketMovers([
    mover({ symbol: 'LOW', gapPct: 2.1, pmVolume: 160_000 }),
    mover({ symbol: 'CAT', gapPct: 2.1, pmVolume: 160_000, catalyst: 'earnings: beat' }),
    mover({ symbol: 'BIG', gapPct: -6, pmVolume: 800_000 }),
  ]);
  assert.deepEqual(ranked.map((r) => r.symbol), ['BIG', 'CAT', 'LOW']);
  assert.ok(ranked[1].why.some((w) => w.startsWith('catalyst:')));
});

// ── planning ───────────────────────────────────────────────────────────────
const ctxUp: PlanContext = { pmHigh: 104, pmLow: 102, prevClose: 100, prevHigh: 101, prevLow: 98, sma20: 95, gex: { callWall: 110, putWall: 95, flip: 99, regime: 'negative_gamma' } };
t('plan: gap-and-go + PM breaks always; fade only with resistance or against trend', () => {
  const kinds = planSetups({ gapPct: 3, pmPrice: 103 }, ctxUp).map((s) => `${s.kind}:${s.direction}${s.variant ? `:${s.variant}` : ''}`);
  assert.deepEqual(kinds, ['gap_and_go:long', 'pm_break:long:drive', 'pm_break:short:failure']);
  const wall = planSetups({ gapPct: 3, pmPrice: 103.9 }, { ...ctxUp, gex: { ...ctxUp.gex!, callWall: 104.2 } });
  const fade = wall.find((s) => s.kind === 'gap_fill_fade')!;
  assert.equal(fade.direction, 'short'); assert.match(fade.context, /call wall/);
  const trend = planSetups({ gapPct: 3, pmPrice: 103 }, { ...ctxUp, sma20: 105 });
  assert.match(trend.find((s) => s.kind === 'gap_fill_fade')!.context, /against the daily trend/);
  const down = planSetups({ gapPct: -3, pmPrice: 97 }, { ...ctxUp, pmHigh: 98, pmLow: 96.5, sma20: 105, prevLow: 99 });
  assert.equal(down[0].direction, 'short'); assert.equal(down.find((s) => s.kind === 'gap_fill_fade')?.direction, undefined);
});

// ── triggers ───────────────────────────────────────────────────────────────
const openRange = (lo: number, hi: number) => Array.from({ length: 15 }, (_, i) => bar(hm(9, 30) + i, (lo + hi) / 2, hi, lo, (lo + hi) / 2));
const only = (kind: string, variant?: string) => planSetups({ gapPct: 3, pmPrice: 103 }, ctxUp).filter((s) => s.kind === kind && (!variant || s.variant === variant));

t('gap-and-go: OR holds above prior close, then a 1m close above max(PM high, OR high)', () => {
  const bars = [...openRange(102.6, 103.8), flat(hm(9, 45), 103.9), bar(hm(9, 46), 103.9, 104.4, 103.9, 104.3)];
  const r = evaluateSetups({ symbol: 'AAA', gapPct: 3 }, ctxUp, only('gap_and_go'), bars, nowAt(9, 48));
  assert.ok(r.trigger, JSON.stringify(r.misses));
  assert.equal(r.trigger!.direction, 'long'); assert.equal(r.trigger!.entry, 104.3); assert.equal(r.trigger!.stop, 102.6);
  assert.ok(r.trigger!.rr >= 1); assert.ok(r.trigger!.t1 > 104.3);
  assert.ok(r.trigger!.t2 == null || r.trigger!.t2 > r.trigger!.t1);
});
t('gap-and-go: no trigger before 09:45, none when the OR filled the gap', () => {
  const early = evaluateSetups({ symbol: 'AAA', gapPct: 3 }, ctxUp, only('gap_and_go'), openRange(102.6, 104.5).slice(0, 10), nowAt(9, 41));
  assert.equal(early.trigger, null); assert.match(early.misses[0].reason, /not complete/);
  const filled = evaluateSetups({ symbol: 'AAA', gapPct: 3 }, ctxUp, only('gap_and_go'), [...openRange(99.5, 103.8), bar(hm(9, 46), 104, 104.6, 104, 104.5)], nowAt(9, 48));
  assert.equal(filled.trigger, null); assert.match(filled.misses[0].reason, /filled the gap/);
});
t('gap-fill fade: close below the OR low with the gap open → short toward the prior close', () => {
  const ctx = { ...ctxUp, gex: { ...ctxUp.gex!, callWall: 104.2 } };
  const setups = planSetups({ gapPct: 3.9, pmPrice: 103.9 }, ctx).filter((s) => s.kind === 'gap_fill_fade');
  const bars = [...openRange(103, 104.1), flat(hm(9, 45), 103.4), bar(hm(9, 46), 103.3, 103.35, 102.6, 102.7)];
  const r = evaluateSetups({ symbol: 'AAA', gapPct: 3.9 }, ctx, setups, bars, nowAt(9, 48));
  assert.ok(r.trigger, JSON.stringify(r.misses));
  assert.equal(r.trigger!.direction, 'short'); assert.equal(r.trigger!.entry, 102.7);
  assert.equal(r.trigger!.stop, 104.1); assert.equal(r.trigger!.t1, 100); assert.equal(r.trigger!.t1Basis, 'prior close (gap fill)');
});
t('PM break (drive): 1m close above the PM high inside 09:30–09:45', () => {
  const bars = [flat(hm(9, 30), 103.5), bar(hm(9, 31), 103.5, 104.3, 103.2, 104.2)];
  const r = evaluateSetups({ symbol: 'AAA', gapPct: 3 }, ctxUp, only('pm_break', 'drive'), bars, nowAt(9, 33));
  assert.ok(r.trigger, JSON.stringify(r.misses));
  assert.equal(r.trigger!.variant, 'drive'); assert.equal(r.trigger!.stop, 103.2); assert.equal(r.trigger!.entry, 104.2);
  // After 09:45 the drive variant no longer fires.
  const late = [...openRange(103, 103.9), bar(hm(9, 50), 103.9, 104.5, 103.9, 104.4)];
  assert.equal(evaluateSetups({ symbol: 'AAA', gapPct: 3 }, ctxUp, only('pm_break', 'drive'), late, nowAt(9, 52)).trigger, null);
});
t('PM break (failure): close below the PM low → short, T1 the prior close', () => {
  const bars = [flat(hm(9, 30), 102.4), bar(hm(9, 31), 102.4, 102.5, 101.7, 101.8)];
  const r = evaluateSetups({ symbol: 'AAA', gapPct: 3 }, ctxUp, only('pm_break', 'failure'), bars, nowAt(9, 33));
  assert.ok(r.trigger, JSON.stringify(r.misses));
  assert.equal(r.trigger!.direction, 'short'); assert.equal(r.trigger!.stop, 103); assert.equal(r.trigger!.t1, 100);
});
t('stale or already-played triggers are not published', () => {
  const bars = [flat(hm(9, 30), 102.4), bar(hm(9, 31), 102.4, 102.5, 101.7, 101.8)];
  const stale = evaluateSetups({ symbol: 'AAA', gapPct: 3 }, ctxUp, only('pm_break', 'failure'), bars, nowAt(9, 50));
  assert.equal(stale.trigger, null); assert.match(stale.misses.at(-1)!.reason, /too old/);
  const through = [...bars, bar(hm(9, 32), 101.8, 103.5, 101.8, 103.4)];
  const r = evaluateSetups({ symbol: 'AAA', gapPct: 3 }, ctxUp, only('pm_break', 'failure'), through, nowAt(9, 34));
  assert.equal(r.trigger, null); assert.match(r.misses.at(-1)!.reason, /through the stop/);
});
t('earliest trigger wins across setups', () => {
  const bars = [flat(hm(9, 30), 102.4), bar(hm(9, 31), 102.4, 102.5, 101.7, 101.8)];
  const r = evaluateSetups({ symbol: 'AAA', gapPct: 3 }, ctxUp, planSetups({ gapPct: 3, pmPrice: 103 }, ctxUp), bars, nowAt(9, 33));
  assert.equal(r.trigger?.kind, 'pm_break'); assert.equal(r.trigger?.variant, 'failure');
});
t('targets: structural only, ≥1R, never a fixed percentage', () => {
  assert.equal(pickTargets('long', 100, 99, [{ price: 100.5, label: 'near' }]), null);
  const p = pickTargets('long', 100, 99, [{ price: 100.5, label: 'near' }, { price: 101.5, label: 'wall' }, { price: 103, label: 'next' }])!;
  assert.equal(p.t1, 101.5); assert.equal(p.t2, 103); assert.equal(p.t1Basis, 'wall'); assert.equal(p.rr, 1.5);
});

// ── caps ───────────────────────────────────────────────────────────────────
t('caps: 5/day, one per symbol, no stacking on another engine’s same-side open idea', () => {
  const st = { publishedToday: 0, publishedSymbols: new Set<string>(), openIdeas: [{ symbol: 'NVDA', direction: 'long', source: 'gex_scanner' }] };
  assert.equal(capCheck('AAPL', 'long', st).ok, true);
  assert.match(capCheck('NVDA', 'long', st).reason, /gex_scanner already has an open long/);
  assert.equal(capCheck('NVDA', 'short', st).ok, true);
  assert.match(capCheck('AAPL', 'long', { ...st, publishedSymbols: new Set(['AAPL']) }).reason, /one pre-market idea per symbol/);
  assert.match(capCheck('AAPL', 'long', { ...st, publishedToday: 5 }).reason, /daily cap 5/);
});

// ── record ─────────────────────────────────────────────────────────────────
t('record: resolved only, LOW N under 20, always "measuring"', () => {
  const r = summarizeRecord([{ outcomeStatus: 'hit_target' }, { outcomeStatus: 'hit_stop' }, { outcomeStatus: 'open' }, { outcomeStatus: 'expired', percentGain: -0.4 }]);
  assert.deepEqual([r.n, r.wins, r.losses, r.open, r.lowN, r.label], [3, 1, 2, 1, true, 'measuring']);
  const big = summarizeRecord(Array.from({ length: 20 }, (_, i) => ({ outcomeStatus: i % 2 ? 'hit_target' : 'hit_stop' })));
  assert.equal(big.lowN, false); assert.equal(big.winRate, 50);
});

// ── intraday contract window (0–7 DTE) ─────────────────────────────────────
t('intraday window: 0–7 DTE only with allowZeroDte; bypasses the conviction floor', () => {
  assert.equal(intradayWindowFor({ intradayMaxDte: 7 }), null);
  assert.deepEqual(intradayWindowFor({ allowZeroDte: true, intradayMaxDte: 7 }), { min: 0, max: 7, ideal: 2, fallbackMaxDte: 7, label: 'Intraday (0–7 DTE)' });
  const exp = (days: number) => new Date(Date.now() + days * 86_400_000 + 3_600_000).toISOString().slice(0, 10);
  const row = (days: number, strike: number, delta: number): RawChainOption => ({
    symbol: `T${days}C${strike}`, option_type: 'call', strike, expiration_date: exp(days), bid: 1.0, ask: 1.05,
    open_interest: 500, volume: 50, greeks: { delta, gamma: 0.05, theta: -0.08, vega: 0.05, mid_iv: 0.35 },
  });
  const chain = [2, 5, 10, 20].flatMap((d) => [row(d, 100, 0.52), row(d, 102, 0.35), row(d, 98, 0.68)]);
  const th = { symbol: 'TST', direction: 'bullish' as const, setup: 'scalp' as const, expiryTier: 'DAILY' as const, entry: 100, stop: 99, t1: 102, holdingDays: 0, conviction: 60 };
  const floor = selectFromChain(th, 100, chain);
  assert.ok(floor.picks.every((p) => p.dte >= 14), `conviction floor pushes a 60 read out: ${floor.picks.map((p) => p.dte)}`);
  const intr = selectFromChain({ ...th, allowZeroDte: true, intradayMaxDte: 7 }, 100, chain);
  assert.deepEqual(intr.dteWindow, { min: 0, max: 7 });
  assert.ok(intr.picks.length > 0 && intr.picks.every((p) => p.dte <= 7), `intraday picks ${intr.picks.map((p) => p.dte)}`);
  const none = selectFromChain({ ...th, allowZeroDte: true, intradayMaxDte: 7 }, 100, chain.filter((o) => !o.expiration_date.startsWith(exp(2)) && !o.expiration_date.startsWith(exp(5))));
  assert.equal(none.picks.length, 0, 'no 0–7 DTE listed → no contract, never a far expiry');
});

console.log(`premarket-ideas: ${n} tests passed`);
