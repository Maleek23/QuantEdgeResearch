/**
 * 0DTE sniper checks — every setup detector (fires / does not fire), detector
 * causality and long/short mirror symmetry, the three contract pickers
 * (incl. the lotto band), option-path exits, the stage-2 chain cap, the board
 * universe cap, and stage 1 end-to-end on a stubbed Alpaca (fresh vs stale,
 * no re-fire).
 *
 *   npx tsx scripts/test-zero-dte-sniper.ts      (npm run test:zero-dte-sniper)
 *
 * FIXTURES ONLY. Every bar, chain and quote below is synthetic, written for
 * these tests. Nothing here is market data, and nothing touches the network.
 */
import assert from 'node:assert/strict';
import {
  detectSetups, evaluateOptionPath, levelStopTime, pickLotto, pickLottoNear, pickNearestOtm, pickContract, selectForStage2, vwapSeries,
  SNIPER_POLICIES, SETUP_IDS, type ContractCandidate, type DayContext, type MinuteBar, type SetupId,
} from '../server/zero-dte-sniper-core';
import { buildUniverse, runStage1 } from '../server/zero-dte-sniper';

let passed = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); passed++; console.log(`  ✓ ${name}`); };
const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

/** 2026-09-29 (Tuesday, EDT = UTC−4) at minute-of-day `min` ET. */
const T0 = Date.UTC(2026, 8, 29, 4, 0);
const tAt = (min: number) => T0 + min * 60_000;

/** Bars from 09:30 given closes; open = previous close, high/low = ±wick, flat volume. */
function mk(closes: number[], opts: { open?: number; wick?: number; vol?: number } = {}): MinuteBar[] {
  const w = opts.wick ?? 0.05;
  return closes.map((c, i) => {
    const o = i === 0 ? (opts.open ?? c) : closes[i - 1];
    return { t: tAt(570 + i), min: 570 + i, o, c, h: Math.max(o, c) + w, l: Math.min(o, c) - w, v: opts.vol ?? 1000 };
  });
}
const flat = (n: number, p: number) => Array.from({ length: n }, () => p);
const ramp = (n: number, a: number, b: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * (i + 1)) / n);
const has = (bars: MinuteBar[], ctx: DayContext, id: SetupId, side: 'long' | 'short') => detectSetups(bars, ctx, [id]).find((t) => t.side === side) ?? null;
const CTX: DayContext = { pdh: 110, pdl: 90, pdc: 100 };

async function main() {
  console.log('0DTE sniper — detectors');

  await ok('ORB15 long fires on the first close above the 15-min high, not before 09:45', () => {
    const bars = mk([...flat(15, 100), ...flat(10, 100.02), 100.4, ...flat(20, 100.5)]);
    const t = has(bars, CTX, 'orb15', 'long');
    assert.ok(t); assert.equal(t!.min, 570 + 25); close(t!.level, 100.05); assert.equal(t!.levelName, 'OR15H');
  });
  await ok('ORB15 does not fire while price stays inside the range', () => {
    assert.equal(has(mk(flat(120, 100)), CTX, 'orb15', 'long'), null);
    assert.equal(has(mk(flat(120, 100)), CTX, 'orb15', 'short'), null);
  });
  await ok('ORB30 short fires on a close below the 30-min low (mirror), labelled OR30L', () => {
    const bars = mk([...flat(30, 100), ...flat(5, 99.98), 99.5, ...flat(20, 99.4)]);
    const t = has(bars, CTX, 'orb30', 'short');
    assert.ok(t); assert.equal(t!.min, 570 + 35); assert.equal(t!.levelName, 'OR30L'); assert.match(t!.note, /below the 30-min range low 99\.95/);
  });

  await ok('VWAP reclaim fires after ≥10 of 15 closes below VWAP, only after 10:00', () => {
    // Open high, bleed under VWAP for 40 min, then a sharp reclaim at ~10:20.
    const bars = mk([...flat(10, 101), ...ramp(40, 100.9, 99.5), ...ramp(3, 99.8, 101.5), ...flat(20, 101.5)]);
    const t = has(bars, CTX, 'vwap_cross', 'long');
    assert.ok(t); assert.ok(t!.min >= 600); const v = vwapSeries(bars); assert.ok(bars[t!.idx].c > v[t!.idx] && bars[t!.idx - 1].c <= v[t!.idx - 1]);
  });
  await ok('VWAP cross does not fire in chop (price alternating around VWAP)', () => {
    const chop = Array.from({ length: 120 }, (_, i) => 100 + (i % 2 ? 0.1 : -0.1));
    assert.equal(has(mk(chop), CTX, 'vwap_cross', 'long'), null);
  });

  // The AMD 2026-09-30 shape: open spike, fade to 600 (11:15), bounce, retest 600 (12:30), VWAP reclaim ~12:45.
  const amd = (): MinuteBar[] => {
    const seq = [
      ...ramp(10, 606, 609), ...ramp(95, 609, 600.4),  // spike then fade to the 600 area by ~11:15
      ...ramp(3, 600.3, 600.2),                          // test 1
      ...ramp(30, 600.5, 602.5), ...ramp(40, 602.5, 600.4), // bounce, drift back
      ...ramp(3, 600.3, 600.25),                         // test 2 (~12:30)
      ...ramp(12, 600.6, 603.0), ...ramp(10, 603.2, 606.5), ...ramp(60, 606.5, 610.5),
    ];
    return mk(seq, { wick: 0.1 });
  };
  await ok('level hold → VWAP reclaim fires on the AMD shape (two tests of ~600, then VWAP reclaim)', () => {
    const t = has(amd(), { pdh: 615, pdl: 596, pdc: 604 }, 'level_reclaim', 'long');
    assert.ok(t, 'expected a trigger'); assert.ok(t!.min > 12 * 60 + 30, `fired at ${t!.min}`);
    assert.match(t!.levelName, /round 600|session low/); assert.match(t!.note, /held .* twice/);
    const v = vwapSeries(amd()); assert.ok(t!.price > v[t!.idx]);
  });
  await ok('level hold → VWAP reclaim does not fire on a single test (no double bottom)', () => {
    const seq = [...ramp(10, 606, 609), ...ramp(95, 609, 600.4), ...ramp(3, 600.3, 600.2), ...ramp(120, 600.5, 610)];
    assert.equal(has(mk(seq, { wick: 0.1 }), { pdh: 615, pdl: 596, pdc: 604 }, 'level_reclaim', 'long'), null);
  });
  await ok('level hold → VWAP reclaim is disarmed when the level breaks before the reclaim', () => {
    const b = amd();
    // Drive a close well under 600 right after the second test.
    const i2 = b.findIndex((x, i) => i > 150 && x.c < 600.3);
    for (let k = i2 + 2; k < i2 + 6; k++) { b[k].c = 598.5; b[k].l = 598.4; b[k].o = 598.6; b[k].h = 598.7; }
    const t = has(b, { pdh: 615, pdl: 596, pdc: 604 }, 'level_reclaim', 'long');
    assert.ok(t === null || t.idx < i2 || t.idx > i2 + 20, 'no reclaim trigger right after a broken level');
  });

  await ok('PDH break & hold fires on the 5th straight close above; 4 closes or a gap-open do not', () => {
    const five = mk([...flat(20, 109), ...flat(5, 110.5), ...flat(10, 111)], { open: 108 });
    const t = has(five, CTX, 'pd_break_hold', 'long');
    assert.ok(t); assert.equal(t!.min, 570 + 24); assert.equal(t!.levelName, 'prior-day high');
    const four = mk([...flat(20, 109), ...flat(4, 110.5), ...flat(30, 109.5)], { open: 108 });
    assert.equal(has(four, CTX, 'pd_break_hold', 'long'), null);
    const gap = mk(flat(60, 111), { open: 111 });
    assert.equal(has(gap, CTX, 'pd_break_hold', 'long'), null);
  });

  await ok('failed breakout (PDH) → short fade fires when it closes back inside within 15 bars', () => {
    const bars = mk([...flat(20, 109.5), ...flat(5, 110.3), 109.6, ...flat(20, 109.2)], { open: 109 });
    const t = has(bars, CTX, 'failed_breakout', 'short');
    assert.ok(t); assert.equal(t!.min, 570 + 25); assert.equal(t!.levelName, 'prior-day high'); assert.match(t!.note, /closed back inside/);
  });
  await ok('failed breakout does not fire when the break holds past 15 bars', () => {
    const bars = mk([...flat(20, 109.5), ...flat(25, 110.3), ...flat(20, 110.8)], { open: 109 });
    assert.equal(has(bars, CTX, 'failed_breakout', 'short'), null);
  });

  await ok('power hour: continuation long fires 15:00–15:30 on a breakout above VWAP with a higher low', () => {
    // 09:30–14:29 grind up, 14:30 pullback, 14:45 higher low, 15:00 flat, 15:10 breakout.
    const seq = [...ramp(300, 100, 103), ...ramp(15, 103, 102.6), ...ramp(15, 102.7, 103.1), ...flat(10, 103.1), 103.6, ...flat(10, 103.7)];
    const bars = mk(seq);
    const t = has(bars, CTX, 'power_hour', 'long');
    assert.ok(t); assert.ok(t!.min >= 900 && t!.min <= 930);
  });
  await ok('power hour does not fire before 15:00 or on a flat tape', () => {
    assert.equal(has(mk(flat(390, 100)), CTX, 'power_hour', 'long'), null);
    assert.equal(has(mk(ramp(300, 100, 103)), CTX, 'power_hour', 'long'), null); // ends 14:30
  });

  const flushCtx: DayContext = { pdh: 104, pdl: 99, pdc: 100, preLow: 99.6, preHigh: 101, atr20: 3 };
  await ok('opening flush → reclaim fires on the first close back above the prior close', () => {
    const seq = [...ramp(10, 100.5, 101), ...ramp(15, 101, 98.2), ...ramp(20, 98.3, 99.9), 100.3, ...flat(30, 100.4)];
    const t = has(mk(seq), flushCtx, 'flush_reclaim', 'long');
    assert.ok(t); assert.equal(t!.min, 570 + 45); close(t!.level, 100);
  });
  await ok('opening flush does not fire without pre-market context or when the drop is < 0.5×ATR', () => {
    const seq = [...ramp(10, 100.5, 101), ...ramp(15, 101, 98.2), ...ramp(20, 98.3, 99.9), 100.3, ...flat(30, 100.4)];
    assert.equal(has(mk(seq), { ...flushCtx, preLow: null }, 'flush_reclaim', 'long'), null);
    assert.equal(has(mk(seq), { ...flushCtx, atr20: 10 }, 'flush_reclaim', 'long'), null);
  });

  // Liquidity sweeps. A choppy 1-min tape (±0.10) gives a 5-min ATR ≈ 0.3, so the depth cap is ≈ 0.15.
  const chop = (n: number, p: number) => Array.from({ length: n }, (_, i) => p + (i % 2 ? 0.1 : -0.1));
  const sweepCtx: DayContext = { pdh: 103, pdl: 97, pdc: 100, preLow: 99.5, preHigh: 101 };
  const sweepDay = (lowDip: number, closeBack: number) => {
    const b = mk([...chop(40, 100), ...chop(10, 99.8)], { wick: 0.05 });
    // bar 50: wick through the pre-market low 99.50, then close at `closeBack`
    b.push({ t: tAt(620), min: 620, o: 99.7, h: 99.75, l: lowDip, c: closeBack, v: 3000 });
    for (let k = 1; k <= 20; k++) b.push({ t: tAt(620 + k), min: 620 + k, o: 99.8, h: 99.9, l: 99.7, c: 99.8, v: 1000 });
    return b;
  };
  await ok('liquidity sweep (low → long): a shallow wick through the pre-market low that closes back above fires', () => {
    const t = has(sweepDay(99.4, 99.6), sweepCtx, 'liquidity_sweep', 'long');
    assert.ok(t); assert.equal(t!.min, 620); assert.equal(t!.levelName, 'pre-market low'); close(t!.level, 99.5);
  });
  await ok('liquidity sweep does not fire when the run is too deep (> 0.5×ATR5) or too shallow (< 0.05%)', () => {
    assert.equal(has(sweepDay(98.9, 99.6), sweepCtx, 'liquidity_sweep', 'long'), null);  // 0.60 deep
    assert.equal(has(sweepDay(99.47, 99.6), sweepCtx, 'liquidity_sweep', 'long'), null); // 0.03 < 0.05%
  });
  await ok('liquidity sweep: no close back inside within 3 bars → no trigger (the level is consumed)', () => {
    const b = sweepDay(99.42, 99.45);
    for (let k = 1; k <= 3; k++) { b[50 + k].c = 99.44; b[50 + k].l = 99.41; b[50 + k].o = 99.45; b[50 + k].h = 99.48; }
    b[54].c = 99.7; b[54].h = 99.75;
    assert.equal(has(b, sweepCtx, 'liquidity_sweep', 'long'), null);
  });
  await ok('double sweep: high swept first, then the low → a double_sweep LONG on the second (low) sweep', () => {
    const b = mk([...chop(40, 100.6), ...chop(9, 100.8)], { wick: 0.05 });
    b.push({ t: tAt(619), min: 619, o: 100.9, h: 101.1, l: 100.85, c: 100.9, v: 3000 }); // sweeps pre-market high 101 and closes back under
    for (let k = 1; k <= 30; k++) b.push({ t: tAt(619 + k), min: 619 + k, o: 100.0 - k * 0.01, h: 100.05 - k * 0.01, l: 99.95 - k * 0.01, c: 100 - k * 0.01, v: 1000 });
    const last = b[b.length - 1];
    b.push({ t: last.t + 60_000, min: last.min + 1, o: 99.7, h: 99.75, l: 99.42, c: 99.6, v: 3000 });     // sweeps pre-market low 99.5
    for (let k = 1; k <= 5; k++) b.push({ t: last.t + (1 + k) * 60_000, min: last.min + 1 + k, o: 99.6, h: 99.7, l: 99.55, c: 99.65, v: 1000 });
    const all = detectSetups(b, sweepCtx, ['liquidity_sweep', 'double_sweep']);
    const ds = all.filter((t) => t.setup === 'double_sweep');
    assert.equal(ds.length, 1); assert.equal(ds[0].side, 'long'); assert.equal(ds[0].min, last.min + 1);
    assert.ok(all.some((t) => t.setup === 'liquidity_sweep' && t.side === 'short' && t.min === 619));
  });

  // Reactive zone: support at round 100 (step 5). Touch 1 at 10:10, reaction to 100.8, touch 2 holds, reaction, touch 3 holds, then a break.
  const zoneDay = () => {
    // closes 100.03 / 100.04 / 100.03 put the 1-min lows (close − 0.03 wick) inside the 0.05% band of 100; 99.8 breaks it.
    const seq: number[] = [...ramp(40, 101.5, 100.3), 100.03, ...ramp(10, 100.3, 100.9), ...ramp(10, 100.8, 100.2), 100.04, ...ramp(10, 100.3, 100.9), ...ramp(10, 100.8, 100.2), 100.03, ...ramp(10, 100.3, 100.7), ...ramp(8, 100.6, 100.2), 99.8, ...flat(20, 99.7)];
    const b = mk(seq, { wick: 0.03 });
    return b;
  };
  await ok('reactive zone: touch 1 makes the zone; touches 2 and 3 fire (numbered); the break ends it', () => {
    const ts = detectSetups(zoneDay(), { pdh: 110, pdl: 90, pdc: 104 }, ['reactive_zone'], { zoneRoundStep: 5 }).filter((t) => t.side === 'long' && /round 100/.test(t.levelName));
    assert.deepEqual(ts.map((t) => t.touch), [2, 3]);
    assert.ok(ts.every((t) => t.zoneKind === 'round')); close(ts[0].level, 100);
  });
  await ok('reactive zone: no reaction ≥ 1×ATR5 between touches → the second touch does not fire', () => {
    const seq = [...ramp(40, 101.5, 100.3), 100.1, ...ramp(6, 100.12, 100.15), 100.05, ...flat(30, 100.12)];
    const ts = detectSetups(mk(seq, { wick: 0.03 }), { pdh: 110, pdl: 90, pdc: 104 }, ['reactive_zone'], { zoneRoundStep: 5 }).filter((t) => t.side === 'long' && /round 100/.test(t.levelName));
    assert.equal(ts.length, 0);
  });
  await ok('reactive zone: external (GEX) zones are used and tagged gex', () => {
    const b = zoneDay().map((x) => ({ ...x, o: x.o + 0.33, h: x.h + 0.33, l: x.l + 0.33, c: x.c + 0.33 })); // zone now at 100.33, off every round number
    const ts = detectSetups(b, { pdh: 110, pdl: 90, pdc: 104 }, ['reactive_zone'], { zoneRoundStep: 5, zones: [{ price: 100.33, source: 'GEX call wall' }] }).filter((t) => t.side === 'long' && t.zoneKind === 'gex');
    assert.ok(ts.length >= 1); assert.equal(ts[0].levelName, 'GEX call wall');
  });
  await ok('level stop: time of the first close through the level by > 0.05%, sells at the next option print', () => {
    const b = mk([...flat(10, 100.2), 100.1, 99.9, ...flat(5, 99.8)]);
    const tStop = levelStopTime(b, 5, 100, 'long');
    assert.equal(tStop, b[11].t + 60_000); // 99.9 < 100 − 0.05
    const o = (m: number, px: number) => ({ t: b[0].t + m * 60_000, o: px, h: px, l: px, c: px, v: 1 });
    const out = evaluateOptionPath(1, [o(7, 1.2), o(12, 0.7), o(13, 0.6)], 0, b[6].t, tStop);
    close(out.pnl.level_stop, -0.3); close(out.pnl.level_stop_take2x, -0.3); close(out.pnl.hold, -1);
    assert.equal(levelStopTime(b, 5, 99, 'long'), null);
  });

  // Seeded random walk for the structural properties.
  const rw = (seed: number, n = 390, round = true) => { let s = seed, p = 100; const out: number[] = []; for (let i = 0; i < n; i++) { s = (s * 16807) % 2147483647; p += ((s / 2147483647) - 0.5) * 0.3; out.push(round ? +p.toFixed(2) : p); } return out; };
  await ok('causality: the day truncated at any bar c yields exactly the full day\'s triggers with idx ≤ c (no look-ahead, every setup)', () => {
    let checked = 0; const seen = new Set<string>();
    const key = (t: { setup: string; side: string; idx: number; touch?: number }) => `${t.setup}:${t.side}:${t.idx}:${t.touch ?? ''}`;
    for (let seed = 1; seed <= 12; seed++) {
      const bars = mk(rw(seed), { wick: 0.04 });
      const ctx: DayContext = { pdh: 100.8, pdl: 99.2, pdc: 100, preLow: 99.7, preHigh: 100.3, atr20: 1.2 };
      const full = detectSetups(bars, ctx);
      full.forEach((t) => seen.add(t.setup));
      for (let c = 20; c < bars.length; c += 5) {
        const want = full.filter((t) => t.idx <= c).map(key).sort();
        const got = detectSetups(bars.slice(0, c + 1), ctx).map(key).sort();
        assert.deepEqual(got, want, `seed ${seed} cut ${c}`);
        checked += want.length;
      }
    }
    assert.ok(checked > 500, `only ${checked} trigger-cuts checked`);
    for (const s of ['orb15', 'vwap_cross', 'failed_breakout', 'liquidity_sweep', 'reactive_zone']) assert.ok(seen.has(s), `random walks never exercised ${s}`);
  });
  const symmetric = (K: number, ids: SetupId[], zones: Array<{ price: number; source: string }> = []) => {
    for (let seed = 3; seed <= 12; seed++) {
      // Unrounded prices: with 2-decimal prices, K − p can land exactly on a band edge and float rounding decides the tie.
      const bars = mk(rw(seed, 390, false), { wick: 0.04 });
      const refl = bars.map((b) => ({ ...b, o: K - b.o, c: K - b.c, h: K - b.l, l: K - b.h }));
      const ctx: DayContext = { pdh: 100.8, pdl: 99.2, pdc: 100, preLow: 99.7, preHigh: 100.3, atr20: 1.2 };
      const rctx: DayContext = { pdh: K - 99.2, pdl: K - 100.8, pdc: K - 100, preLow: K - 100.3, preHigh: K - 99.7, atr20: 1.2 };
      const a = detectSetups(bars, ctx, ids, { zoneRoundStep: 5, zones }).map((t) => `${t.setup}:${t.side}:${t.idx}:${t.touch ?? ''}`).sort();
      const b = detectSetups(refl, rctx, ids, { zoneRoundStep: 5, zones: zones.map((z) => ({ ...z, price: K - z.price })) }).map((t) => `${t.setup}:${t.side === 'long' ? 'short' : 'long'}:${t.idx}:${t.touch ?? ''}`).sort();
      assert.deepEqual(b, a, `seed ${seed} K ${K}`);
    }
  };
  await ok('mirror symmetry: reflecting prices about 200 swaps long ↔ short at the same bar (absolute-threshold setups)', () => {
    symmetric(200, ['orb15', 'orb30', 'vwap_cross', 'pd_break_hold', 'failed_breakout', 'power_hour', 'flush_reclaim']);
  });
  await ok('mirror symmetry about 0 for every setup incl. sweeps / double sweep / reactive zones with external zones', () => {
    // Zone and sweep tolerances are % of |price|, so only reflection about 0 preserves them exactly; this checks that
    // the context, external zones and double-sweep pairing are mirrored consistently.
    symmetric(0, [...SETUP_IDS], [{ price: 100.4, source: 'GEX wall' }, { price: 99.6, source: 'GEX put wall' }]);
  });

  console.log('0DTE sniper — contracts, exits, stage 2');
  const chain: ContractCandidate[] = [
    { occ: 'C600', strike: 600, type: 'call', price: 5.2, volume: 900 },   // ITM
    { occ: 'C605', strike: 605, type: 'call', price: 1.8, volume: 700 },
    { occ: 'C610', strike: 610, type: 'call', price: 0.62, volume: 500 },
    { occ: 'C615', strike: 615, type: 'call', price: 0.25, volume: 400 },
    { occ: 'C620', strike: 620, type: 'call', price: 0.07, volume: 300 },
    { occ: 'C622', strike: 622, type: 'call', price: 0.07, volume: 10 },
    { occ: 'C625', strike: 625, type: 'call', price: 0.03, volume: 200 },  // under the band
    { occ: 'C630', strike: 630, type: 'call', price: 0.06, volume: 0 },    // no volume
    { occ: 'P595', strike: 595, type: 'put', price: 0.4, volume: 50 },
    { occ: 'P590', strike: 590, type: 'put', price: 0.12, volume: 20 },
  ];
  await ok('nearest OTM: first strike above spot for calls, below for puts', () => {
    assert.equal(pickNearestOtm(chain, 603, 'call')!.occ, 'C605');
    assert.equal(pickNearestOtm(chain, 603, 'put')!.occ, 'P595');
    assert.equal(pickNearestOtm(chain, 640, 'call'), null);
  });
  await ok('lotto: cheapest OTM in $0.05–$0.50 with volume; ties go nearer the money; ignores under-band and zero-volume', () => {
    assert.equal(pickLotto(chain, 603, 'call')!.occ, 'C620'); // 0.07 twice → 620 nearer than 622; 625 (0.03) and 630 (0 vol) excluded
    assert.equal(pickLotto(chain, 603, 'put')!.occ, 'P590');
    assert.equal(pickLotto(chain.filter((c) => c.strike >= 625), 603, 'call'), null);
  });
  await ok('near lotto: the OTM contract nearest the money still inside the band (AMD 615C @ $0.25 shape)', () => {
    assert.equal(pickLottoNear(chain, 603, 'call')!.occ, 'C615');
    assert.equal(pickContract('lotto_near', chain, 603, 'call')!.occ, 'C615');
    assert.equal(pickContract('otm1', chain, 603, 'call')!.occ, 'C605');
    assert.equal(pickContract('lotto', chain, 603, 'call')!.occ, 'C620');
  });

  await ok('option path: 2× touch, −50% stop, half-at-3×, hold = expiry value; same-bar stop+target = stop', () => {
    const b = (m: number, o: number, h: number, l: number, c: number) => ({ t: 1_000_000 + m * 60_000, o, h, l, c, v: 1 });
    const up = evaluateOptionPath(0.25, [b(1, 0.25, 0.3, 0.2, 0.28), b(5, 0.3, 0.55, 0.3, 0.5), b(9, 0.5, 0.8, 0.5, 0.78), b(20, 0.8, 1.3, 0.8, 1.2)], 0.6, 1_000_000);
    close(up.pnl.take2x, 1); close(up.pnl.hold, 0.6 / 0.25 - 1); close(up.pnl.half3x, 0.5 * 2 + 0.5 * (0.6 / 0.25 - 1));
    assert.equal(up.minsTo.x2, 5); assert.equal(up.minsTo.x3, 9); assert.equal(up.minsTo.x5, 20); close(up.maxMult, 1.3 / 0.25);
    close(up.pnl.take2x_close, 1); // first 1-min CLOSE ≥ $0.50 is the m5 bar's 0.50
    const both = evaluateOptionPath(1, [b(1, 1, 2.2, 0.4, 1)], 0, 1_000_000);
    close(both.pnl.stop50_take2x, -0.5); close(both.pnl.take2x, 1); assert.equal(both.worthless, true); close(both.pnl.hold, -1);
    const gap = evaluateOptionPath(1, [b(1, 0.3, 0.35, 0.2, 0.25)], 0, 1_000_000);
    close(gap.pnl.stop50, -0.7); // gap through the stop fills at the open
  });

  await ok('stage-2 cap: at most N symbols, publishable first, one chain per symbol, the rest deferred', () => {
    const tr = [
      { symbol: 'AAA', publish: false, t: 1 }, { symbol: 'BBB', publish: true, t: 5 }, { symbol: 'AAA', publish: true, t: 6 },
      { symbol: 'CCC', publish: false, t: 2 }, { symbol: 'DDD', publish: false, t: 3 }, { symbol: 'EEE', publish: false, t: 4 },
    ];
    const s = selectForStage2(tr, 3);
    assert.deepEqual(s.chosen, ['BBB', 'AAA', 'CCC']); assert.deepEqual(s.deferred, ['DDD', 'EEE']);
    assert.deepEqual(selectForStage2(tr, 0).chosen, []); assert.equal(selectForStage2(tr, 0).deferred.length, 5);
    // rank: a frequent zone touch (rank 1) yields its slot to a once-a-day setup even when it fired earlier
    const ranked = selectForStage2([{ symbol: 'ZONE', publish: false, t: 1, rank: 1 }, { symbol: 'ORB', publish: false, t: 9, rank: 0 }], 1);
    assert.deepEqual(ranked.chosen, ['ORB']); assert.deepEqual(ranked.deferred, ['ZONE']);
  });

  await ok('universe: ETFs first, then the watch list, then the board; non-stock symbols dropped; cap logs the cut', () => {
    const conv = Array.from({ length: 200 }, (_, i) => `S${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`);
    const u = buildUniverse({ convictions: ['BTC-USD', 'AMD', ...conv], watch: ['SPX', 'TSLA', 'META'], cap: 150 });
    assert.deepEqual(u.symbols.slice(0, 5), ['SPY', 'QQQ', 'IWM', 'TSLA', 'META']);
    assert.equal(u.symbols.length, 150); assert.equal(u.cut.length, 3 + 2 + 1 + 200 - 150);
    assert.ok(u.dropped.includes('SPX') && u.dropped.includes('BTC-USD'));
  });

  await ok('no setup is publishable unless it survived both replay halves (policy table only holds survivors)', () => {
    for (const [k, p] of Object.entries(SNIPER_POLICIES)) assert.ok(p && p.publish && /H1 .*H2 /.test(p.evidence), `${k} evidence must cite both halves`);
  });

  console.log('0DTE sniper — stage 1 on a stubbed Alpaca');
  await ok('stage 1: batched request, fresh trigger reported once, an old trigger counted stale, no re-fire next cycle', async () => {
    const iso = (ms: number) => new Date(ms).toISOString();
    const daily = (pdh: number, pdl: number, pdc: number) => [
      { t: iso(Date.UTC(2026, 8, 25, 4)), o: 100, h: pdh - 1, l: pdl + 1, c: 100 }, { t: iso(Date.UTC(2026, 8, 28, 4)), o: 100, h: pdh, l: pdl, c: pdc },
    ];
    // FRESH: ORB15 break on the 10:30 bar (closes 10:31). OLD: ORB15 break at 09:50.
    const fresh = [...flat(15, 100), ...flat(45, 100.02), 100.6];
    const old = [...flat(15, 50), ...flat(5, 50.01), 50.5, ...flat(40, 50.6)];
    const toApi = (bars: MinuteBar[]) => bars.map((b) => ({ t: iso(b.t), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, vw: b.c }));
    const calls: string[] = [];
    const fetchJson = async (url: string) => {
      calls.push(url);
      const u = new URL(url);
      const syms = u.searchParams.get('symbols')!.split(',');
      if (u.searchParams.get('timeframe') === '1Day') return { status: 200, json: { bars: Object.fromEntries(syms.map((s) => [s, daily(s === 'OLDX' ? 60 : 110, s === 'OLDX' ? 40 : 90, s === 'OLDX' ? 50 : 100)])), next_page_token: null } };
      const since = Date.parse(u.searchParams.get('start')!);
      const all: Record<string, MinuteBar[]> = { FRSH: mk(fresh), OLDX: mk(old), QUIET: mk(flat(61, 20)) };
      return { status: 200, json: { bars: Object.fromEntries(syms.map((s) => [s, toApi((all[s] ?? []).filter((b) => b.t >= since))])), next_page_token: null } };
    };
    const now = tAt(10 * 60 + 31) + 20_000; // 10:31:20 ET — the 10:30 bar has closed
    const r = await runStage1(['FRSH', 'OLDX', 'QUIET'], now, { fetchJson });
    assert.equal(calls.filter((c) => c.includes('1Min')).length, 1, 'one batched minute-bar request for all symbols');
    assert.ok(calls[0].includes('symbols=FRSH%2COLDX%2CQUIET') || calls[0].includes('symbols=FRSH,OLDX,QUIET'));
    const f = r.fresh.find((t) => t.symbol === 'FRSH' && t.setup === 'orb15' && t.side === 'long');
    assert.ok(f, 'FRSH ORB15 long is fresh'); assert.equal(f!.closeAt, tAt(10 * 60 + 31));
    assert.equal(r.fresh.some((t) => t.symbol === 'OLDX' && t.setup === 'orb15'), false, 'OLDX ORB15 is not fresh');
    assert.ok(r.stale >= 1);
    const again = await runStage1(['FRSH', 'OLDX', 'QUIET'], now + 60_000, { fetchJson });
    assert.equal(again.fresh.some((t) => t.symbol === 'FRSH' && t.setup === 'orb15'), false, 'no re-fire');
    assert.ok(calls[calls.length - 1].includes('start='), 'incremental fetch carries a start');
  });

  console.log(`\n${passed} passed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
