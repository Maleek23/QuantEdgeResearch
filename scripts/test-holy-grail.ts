/**
 * Unit tests — shared/trend-indicators.ts (EMA, Wilder DMI/ADX) and the Holy
 * Grail core (shared/holy-grail.ts): detector, fills, exits, the walk-forward law.
 *   npm run -s test:holy-grail
 */
import assert from 'node:assert/strict';
import { ADX as TiADX, EMA as TiEMA } from 'technicalindicators';
import { emaSeries, lastDefined, wilderDmi } from '../shared/trend-indicators';
import {
  HG_DEFAULTS, adxBucket, aggregateBars, detectHolyGrail, hgStats, hgTarget, hgVerdict, meanWithoutBest, simulateHolyGrail, todBucket,
  type HgBar,
} from '../shared/holy-grail';
import { calculateADX } from '../server/technical-indicators';

let n = 0;
const t = (name: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`✗ ${name}`); throw e; } };
const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

// ── reference series: deterministic pseudo-random walk (LCG), 200 bars ──
function refSeries(len = 200, seed = 7) {
  let s = seed; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const h: number[] = [], l: number[] = [], c: number[] = []; let px = 100;
  for (let i = 0; i < len; i++) {
    const drift = i < 80 ? 0.35 : i < 140 ? -0.3 : 0.05;
    const o = px; px = Math.max(5, px + drift + (rnd() - 0.5) * 2.4);
    const hi = Math.max(o, px) + rnd() * 1.2, lo = Math.min(o, px) - rnd() * 1.2;
    h.push(+hi.toFixed(2)); l.push(+lo.toFixed(2)); c.push(+px.toFixed(2));
  }
  return { h, l, c };
}

// ── EMA ──
t('EMA: SMA seed then 2/(n+1) recursion; matches technicalindicators EMA', () => {
  const v = [1, 2, 3, 4, 5, 6, 7, 8];
  const e = emaSeries(v, 3);
  assert.ok(Number.isNaN(e[0]) && Number.isNaN(e[1]));
  assert.equal(e[2], 2);
  assert.ok(close(e[3], 3) && close(e[7], 7));
  const { c } = refSeries();
  const mine = emaSeries(c, 20).filter(Number.isFinite);
  const ref = TiEMA.calculate({ period: 20, values: c });
  assert.equal(mine.length, ref.length);
  for (let i = 0; i < ref.length; i++) assert.ok(close(mine[i], ref[i], 1e-6), `EMA[${i}] ${mine[i]} vs ${ref[i]}`);
});

// ── Wilder DMI / ADX ──
t('ADX: hand-checkable — a straight staircase up gives +DI 100, −DI 0, DX/ADX 100', () => {
  const h = Array.from({ length: 40 }, (_, i) => 10 + i + 0.5), l = h.map((x) => x - 1), c = h.slice(); // close at the high → TR = 1 = +DM
  const d = wilderDmi(h, l, c, 14);
  assert.ok(Number.isNaN(d.plusDI[13]) && Number.isFinite(d.plusDI[14]), 'DI defined from bar n');
  assert.ok(Number.isNaN(d.adx[26]) && Number.isFinite(d.adx[27]), 'ADX defined from bar 2n−1');
  assert.ok(close(d.plusDI[39], 100) && close(d.minusDI[39], 0) && close(d.adx[39], 100));
});

t('ADX: matches the technicalindicators ADX (same Wilder definition) on a 200-bar reference series', () => {
  const { h, l, c } = refSeries();
  const d = wilderDmi(h, l, c, 14);
  const ref = TiADX.calculate({ high: h, low: l, close: c, period: 14 });
  const mine = d.adx.map((a, i) => ({ a, p: d.plusDI[i], m: d.minusDI[i] })).filter((x) => Number.isFinite(x.a));
  assert.equal(mine.length, ref.length, `${mine.length} vs ${ref.length}`);
  for (let i = 0; i < ref.length; i++) {
    assert.ok(close(mine[i].a, ref[i].adx, 1e-6), `ADX[${i}] ${mine[i].a} vs ${ref[i].adx}`);
    assert.ok(close(mine[i].p, ref[i].pdi, 1e-6) && close(mine[i].m, ref[i].mdi, 1e-6), `DI[${i}]`);
  }
  // trending first leg → strong ADX with +DI on top; the down leg flips DI
  assert.ok(d.adx[79] > 25 && d.plusDI[79] > d.minusDI[79]);
  assert.ok(d.minusDI[139] > d.plusDI[139]);
});

t('server calculateADX delegates to the shared Wilder ADX (last value) and keeps its short-series fallbacks', () => {
  const { h, l, c } = refSeries();
  assert.ok(close(calculateADX(h, l, c, 14), +(lastDefined(wilderDmi(h, l, c, 14).adx) as number).toFixed(2), 1e-9));
  assert.equal(calculateADX([1, 2], [0, 1], [1, 2], 14), 50);
});

// ── Holy Grail detector ──
const DAY = '2026-09-30';
function mk(rows: Array<[number, number, number, number]>, session = DAY, t0 = Date.parse('2026-09-30T13:30:00Z'), stepMin = 5): HgBar[] {
  return rows.map(([o, h, l, c], i) => ({ t: t0 + i * stepMin * 60_000, o, h, l, c, v: 1000, session }));
}
/** A strong up-trend (staircase), a 3-bar pullback into the EMA, then a breakout above the touch bar. */
function upTrendPullback(): HgBar[] {
  const rows: Array<[number, number, number, number]> = [];
  let px = 100;
  // chop (ADX low) → a trend leg with shallow dips (ADX rises through 30) → a 5-bar pullback through EMA20 → resumption
  for (let i = 0; i < 40; i++) { const o = px; px = 100 + 1.5 * Math.sin(i / 2); rows.push([o, Math.max(o, px) + 0.3, Math.min(o, px) - 0.3, px]); }
  for (let i = 0; i < 25; i++) { const o = px; px += i % 4 === 3 ? -0.4 : 0.9; rows.push([o, Math.max(o, px) + 0.15, Math.min(o, px) - 0.15, px]); }
  for (let i = 0; i < 5; i++) { const o = px; px -= 1.3; rows.push([o, o + 0.05, px - 0.05, px]); }
  for (let i = 0; i < 6; i++) { const o = px; px += 1.0; rows.push([o, px + 0.1, o - 0.05, px]); }
  return mk(rows);
}

t('detector: up-trend + pullback to EMA20 + break of the touch bar high → one long, stop = pullback low, target = swing high', () => {
  const bars = upTrendPullback();
  const sigs = detectHolyGrail(bars, { entryBars: 1 });
  const longs = sigs.filter((s) => s.side === 'long');
  assert.equal(longs.length, 1, JSON.stringify(sigs));
  const s = longs[0];
  assert.ok(s.adx > 30, `ADX ${s.adx}`);
  assert.ok(s.plusDI > s.minusDI);
  const touch = bars[s.touchIdx];
  assert.ok(touch.l <= s.ema + 1e-9 || bars[s.signalIdx].l <= s.ema + 1e-9);
  assert.ok(bars[s.touchIdx - 1].l > 0);
  assert.ok(close(s.entryStop, bars[s.signalIdx].h + 0.01, 1e-4));
  assert.equal(s.fillIdx, s.signalIdx + 1);
  assert.ok(s.stop <= bars[s.signalIdx].l);
  assert.ok(close(s.swingTarget, Math.max(...bars.slice(Math.max(0, s.touchIdx - 20), s.touchIdx).map((b) => b.h)), 1e-4));
  assert.ok(sigs.every((x) => x.side !== 'short' || x.adx > 30));
});

t('detector: baseline (requireAdx false) fires on a weak-trend pullback the ADX>30 rule rejects', () => {
  const rows: Array<[number, number, number, number]> = [];
  let px = 100;
  for (let i = 0; i < 60; i++) { const o = px; px += (i % 2 ? 0.5 : -0.38); rows.push([o, Math.max(o, px) + 0.3, Math.min(o, px) - 0.3, px]); }
  for (let i = 0; i < 4; i++) { const o = px; px -= 0.6; rows.push([o, o + 0.05, px - 0.1, px]); }
  for (let i = 0; i < 4; i++) { const o = px; px += 0.8; rows.push([o, px + 0.1, o - 0.05, px]); }
  const bars = mk(rows);
  assert.equal(detectHolyGrail(bars).filter((s) => s.side === 'long').length, 0);
  assert.ok(detectHolyGrail(bars, { requireAdx: false }).length >= 1);
});

t('detector: N=3 keeps the order alive for three bars; N=1 lets it expire', () => {
  const bars = upTrendPullback();
  const s1 = detectHolyGrail(bars, { entryBars: 1 }).find((s) => s.side === 'long')!;
  const sig = bars[s1.signalIdx];
  const head = bars.slice(0, s1.signalIdx + 1);
  // bar A: below the entry stop, clear of the EMA (no new signal); bar B: takes out the signal high
  const A: HgBar = { ...sig, t: sig.t + 300_000, o: sig.h - 0.1, h: sig.h - 0.02, l: sig.h - 0.2, c: sig.h - 0.05 };
  const B: HgBar = { ...sig, t: sig.t + 600_000, o: sig.h - 0.05, h: sig.h + 0.8, l: sig.h - 0.1, c: sig.h + 0.7 };
  const tweaked = [...head, A, B];
  assert.equal(detectHolyGrail(tweaked, { entryBars: 1 }).filter((s) => s.side === 'long' && s.signalIdx === s1.signalIdx).length, 0);
  const b = detectHolyGrail(tweaked, { entryBars: 3 }).find((s) => s.side === 'long' && s.signalIdx === s1.signalIdx);
  assert.ok(b, 'N=3 fills on bar B');
  assert.equal(b!.fillIdx, s1.signalIdx + 2);
});

t('detector: intraday setups never cross sessions; pending setup surfaces at the last bar', () => {
  const bars = upTrendPullback();
  const s = detectHolyGrail(bars).find((x) => x.side === 'long')!;
  const cut = bars.slice(0, s.signalIdx + 1);
  const pend = detectHolyGrail(cut, {}, { includePending: true }).filter((x) => x.fillIdx == null);
  assert.equal(pend.length, 1);
  assert.equal(pend[0].side, 'long');
  const nextDay = cut.concat(bars.slice(s.signalIdx + 1).map((b) => ({ ...b, session: '2026-10-01' })));
  assert.equal(detectHolyGrail(nextDay).filter((x) => x.side === 'long' && x.session === DAY && x.fillIdx != null && nextDay[x.fillIdx].session !== DAY).length, 0);
});

t('detector: mirrored down-trend → short with stop above the pullback high', () => {
  const up = upTrendPullback();
  const down = up.map((b) => ({ ...b, o: 300 - b.o, h: 300 - b.l, l: 300 - b.h, c: 300 - b.c }));
  const s = detectHolyGrail(down).filter((x) => x.side === 'short');
  assert.equal(s.length, 1);
  assert.ok(s[0].stop > (s[0].fill as number) && s[0].minusDI > s[0].plusDI);
});

// ── exits ──
t('exits: 2R target, stop with slippage, both-touched bar = stop, BE after 1R, session time stop', () => {
  const base = mk([[100, 100.5, 99.5, 100], [100, 101, 99.8, 100.9], [100.9, 102.6, 100.8, 102], [102, 102.1, 101.0, 101.2], [101.2, 101.4, 99.4, 99.6]]);
  const sig = { side: 'long' as const, touchIdx: 0, signalIdx: 0, fillIdx: 1, entryStop: 100.51, fill: 100.51, stop: 99.5, swingTarget: 103, adx: 35, plusDI: 30, minusDI: 10, ema: 100, validThroughIdx: 1, session: DAY };
  const risk = 1.01;
  assert.ok(close(hgTarget(sig, 'r2') as number, 100.51 + 2 * risk));
  const r2 = simulateHolyGrail(base, sig, 'r2');
  assert.equal(r2.reason, 'target'); assert.ok(close(r2.r, 2, 1e-3));
  const sw = simulateHolyGrail(base, sig, 'swing');
  assert.equal(sw.reason, 'stop'); assert.ok(close(sw.exitPrice, 99.49)); // 103 never reached; stop 99.5 − tick
  const be = simulateHolyGrail(base, sig, 'be1r');
  assert.equal(be.reason, 'target'); // bar 2 reached 2R before anything else
  const tm = simulateHolyGrail(base.slice(0, 4), sig, 'time');
  assert.equal(tm.reason, 'time'); assert.equal(tm.exitIdx, 3);
  // both stop and target in one bar → stop
  const both = mk([[100, 100.5, 99.5, 100], [100, 100.6, 100.2, 100.55], [100.5, 103, 99, 101]]);
  assert.equal(simulateHolyGrail(both, sig, 'r2').reason, 'stop');
  assert.equal(simulateHolyGrail(both, sig, 'r2', { ambiguity: 'optimistic' }).reason, 'target', 'optimistic sensitivity: both-touched bar → target');
  // fill bar dips through the stop but closes above it: conservative = stop, optimistic = still open
  const dip = mk([[100, 100.5, 99.5, 100], [100, 100.7, 99.4, 100.6], [100.6, 102.6, 100.5, 102.5]]);
  assert.equal(simulateHolyGrail(dip, sig, 'r2').reason, 'stop');
  assert.equal(simulateHolyGrail(dip, sig, 'r2', { ambiguity: 'optimistic' }).reason, 'target');
  // BE: +1R then back to entry
  const beBars = mk([[100, 100.5, 99.5, 100], [100, 100.6, 100.2, 100.55], [100.6, 101.6, 100.6, 101.5], [101.5, 101.6, 100.3, 100.4]]);
  const b2 = simulateHolyGrail(beBars, sig, 'be1r');
  assert.equal(b2.reason, 'breakeven'); assert.ok(close(b2.r, 0));
});

t('exits: swing target behind the fill falls back to 1R', () => {
  const sig = { side: 'long' as const, touchIdx: 0, signalIdx: 0, fillIdx: 1, entryStop: 100.51, fill: 100.51, stop: 99.5, swingTarget: 100.2, adx: 35, plusDI: 30, minusDI: 10, ema: 100, validThroughIdx: 1, session: DAY };
  assert.ok(close(hgTarget(sig, 'swing') as number, 101.52));
});

// ── stats + law ──
t('stats + walk-forward law', () => {
  const s = hgStats([2, -1, -1, 2]);
  assert.equal(s.n, 4); assert.equal(s.winPct, 50); assert.equal(s.avgR, 0.5); assert.equal(s.pf, 2);
  assert.equal(meanWithoutBest([5, 1, -1]), 0);
  const good = Array.from({ length: 40 }, (_, i) => (i % 2 ? 1.5 : -1));
  assert.ok(hgVerdict(good, good).pass);
  assert.ok(!hgVerdict(good.slice(0, 20), good).pass, 'n < 30 fails');
  const outlier = [...Array.from({ length: 39 }, () => -0.2), 30];
  const v = hgVerdict(outlier, good);
  assert.ok(!v.pass && /without best/.test(v.why), v.why);
  assert.ok(!hgVerdict(good, good.map((x) => -x)).pass);
});

t('buckets + aggregation', () => {
  assert.equal(adxBucket(35), '30–40'); assert.equal(adxBucket(45), '40–50'); assert.equal(adxBucket(51), '>50'); assert.equal(adxBucket(25), '20–30');
  assert.equal(todBucket(9 * 60 + 45), '09:30–10:30'); assert.equal(todBucket(15 * 60 + 50), '14:00–16:00');
  const one = mk(Array.from({ length: 10 }, (_, i) => [i, i + 1, i - 1, i + 0.5] as [number, number, number, number]), DAY, Date.parse('2026-09-30T13:30:00Z'), 1);
  const five = aggregateBars(one, 5);
  assert.equal(five.length, 2);
  assert.deepEqual([five[0].o, five[0].h, five[0].l, five[0].c, five[0].v], [0, 5, -1, 4.5, 5000]);
});

t('defaults are Raschke\'s: ADX 14 > 30, EMA 20, N = 1', () => {
  assert.equal(HG_DEFAULTS.adxPeriod, 14); assert.equal(HG_DEFAULTS.adxMin, 30); assert.equal(HG_DEFAULTS.emaPeriod, 20); assert.equal(HG_DEFAULTS.entryBars, 1);
});

// ── live engine (server/holy-grail.ts) with a mocked Alpaca: warm-up 5-min, today's 1-min via the sniper's stage-1 store ──
async function engineTests() {
  process.env.ROLE = process.env.ROLE ?? 'test';
  const { runHolyGrail, getHolyGrailForSymbol, HG_POLICIES, buildIntraday, buildDaily } = await import('../server/holy-grail');
  const pattern = upTrendPullback();
  const prior = '2026-09-29', today = '2026-09-30';
  const open = (d: string) => Date.parse(`${d}T13:30:00Z`); // 09:30 ET (EDT)
  // 65 bars of chop + trend yesterday (5-min); today's pullback + resumption as 1-min bars (each 5-min bar → 5 minutes)
  const warm5 = pattern.slice(0, 65).map((b, i) => ({ ...b, t: open(prior) + i * 300_000 }));
  const today1: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }> = [];
  pattern.slice(65).forEach((b, i) => { for (let k = 0; k < 5; k++) today1.push({ t: open(today) + i * 300_000 + k * 60_000, o: k === 0 ? b.o : b.c, h: b.h, l: b.l, c: b.c, v: 200 }); });
  const iso = (ms: number) => new Date(ms).toISOString();
  const daily = Array.from({ length: 120 }, (_, i) => ({ t: iso(Date.parse('2026-04-01T04:00:00Z') + i * 86400_000), o: 100, h: 101 + (i % 3) * 0.1, l: 99 - (i % 2) * 0.1, c: 100 + (i % 5) * 0.05, v: 1e6 }));
  const calls: string[] = [];
  const fetchJson = async (url: string) => {
    calls.push(url);
    const u = new URL(url);
    const syms = u.searchParams.get('symbols')!.split(',');
    const since = Date.parse(u.searchParams.get('start')!);
    const tf = u.searchParams.get('timeframe');
    const src = tf === '1Day' ? daily.filter((b) => Date.parse(b.t) >= since)
      : tf === '5Min' ? warm5.filter((b) => b.t >= since).map((b) => ({ t: iso(b.t), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }))
      : today1.filter((b) => b.t >= since).map((b) => ({ ...b, t: iso(b.t), vw: b.c }));
    return { status: 200, json: { bars: Object.fromEntries(syms.map((s) => [s, s === 'HGX' ? src : []])), next_page_token: null } };
  };
  const now = open(today) + 41 * 60_000 + 20_000; // 10:11:20 ET — the 10:05 5-min bar has closed
  const c = await runHolyGrail(now, { force: true, fetchJson, publish: false, universe: ['HGX'] });
  t('engine: one cycle → a triggered 5m long with exact trigger bar, ADX > 30, EMA; watch-only (policy not publishable)', () => {
    assert.equal(c.errors.length, 0, c.errors.join('; '));
    const row = c.rows.find((r) => r.symbol === 'HGX' && r.tf === '5m' && r.side === 'long' && r.status === 'triggered');
    assert.ok(row, JSON.stringify(c.rows.map((r) => [r.tf, r.side, r.status, r.signalEt, r.triggerEt])));
    assert.equal(row!.triggerEt, '10:05');
    assert.ok(row!.adx > 30 && row!.ema > 0 && row!.fill! > row!.stop);
    assert.equal(row!.measuring, true);
    assert.equal(HG_POLICIES['5m|long'].publish, row!.replay.publish);
    if (!row!.replay.publish) assert.match(row!.reason ?? '', /did not survive/);
    assert.equal(c.published.length, 0);
    assert.ok(calls.some((u) => u.includes('timeframe=1Min')), 'today\'s bars came through the sniper stage-1 fetch');
  });
  t('engine: the per-symbol read (NEXUS badge) returns the active setup', () => {
    const r = getHolyGrailForSymbol('hgx', now + 60_000);
    assert.ok(r.active.some((x) => x.tf === '5m' && x.side === 'long'));
    assert.equal(getHolyGrailForSymbol('NOPE', now).active.length, 0);
  });
  t('engine: only CLOSED bars are used (the forming 5-min bar is excluded)', () => {
    const today1Hg = today1.map((b) => ({ ...b, session: today }));
    const at = open(today) + 12 * 60_000; // 09:42 — bars 09:30 and 09:35 closed, 09:40 forming
    const b5 = buildIntraday([], today1Hg.filter((b) => b.t + 60_000 <= at), 5, at);
    assert.equal(b5.length, 2);
    const d = buildDaily([], today1Hg.slice(0, 10), today);
    assert.equal(d.length, 1); assert.equal(d[0].h, Math.max(...today1Hg.slice(0, 10).map((b) => b.h)));
  });
}

engineTests().then(() => console.log(`holy-grail: ${n} tests passed`)).catch((e) => { console.error(e); process.exit(1); });
