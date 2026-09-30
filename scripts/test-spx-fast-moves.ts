/**
 * SPX fast-move checks — calendar flags, the 2026-09-30-shaped synthetic tape
 * fires (session-low break + calendar close-flow puts) while a normal afternoon
 * does not, NO LOOK-AHEAD (every prefix of the day gives exactly the triggers
 * the full day gives up to that bar), call/put mirror symmetry, contract bands,
 * option-path exits, the publish policy (nothing publishes without the
 * candidate flag), and the live engine end-to-end on a stubbed Alpaca
 * (future bars ignored, no re-fire, close-flow context line).
 *
 *   npx tsx scripts/test-spx-fast-moves.ts      (npm run test:spx-fast-moves)
 *
 * FIXTURES ONLY. Every bar below is synthetic, written for these tests.
 * Nothing here is market data, and nothing touches the network.
 */
import assert from 'node:assert/strict';
import {
  detectFastMoves, calendarFlags, pickFastStrike, spxwEquivalent, evaluateFastExit, closeFlowRiskLine, fastMovePolicy,
  monthlyOpex, vixExpiry, isTradingDay, prevTradingDay, FAST_MOVE_POLICIES, CAUSE_IDS,
  type FmDayContext, type MinuteBar,
} from '../server/spx-fast-moves-core';
import { runSpxFastMoves, etWallMs, __resetSpxFastMoves, type FetchJson } from '../server/spx-fast-moves';

let passed = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); passed++; console.log(`  ✓ ${name}`); };

const DAY = '2026-09-30';        // quarter-end (fixture date only)
const ORD = '2026-09-29';        // ordinary Tuesday
const tAt = (day: string, min: number) => etWallMs(day, min);

/** A session of 1-min RTH bars from a close path; wick ±0.05; volume per bar from `vol`. */
function session(day: string, path: (min: number) => number, vol: (min: number) => number = () => 100_000): MinuteBar[] {
  const out: MinuteBar[] = [];
  let prev = path(570);
  for (let m = 570; m < 960; m++) {
    const c = +path(m).toFixed(2);
    const o = prev;
    out.push({ t: tAt(day, m), min: m, o, c, h: +(Math.max(o, c) + 0.05).toFixed(2), l: +(Math.min(o, c) - 0.05).toFixed(2), v: vol(m) });
    prev = c;
  }
  return out;
}
const lerp = (m: number, m0: number, m1: number, a: number, b: number) => a + ((b - a) * (m - m0)) / (m1 - m0);

/** The 2026-09-30 SHAPE (synthetic): morning low 766.00, midday 768.5, afternoon below VWAP with lower highs, 15:37 session-low break, flush into the close on building volume. */
function flushPath(m: number): number {
  if (m <= 600) return lerp(m, 570, 600, 768.0, 766.0);
  if (m <= 780) return lerp(m, 600, 780, 766.0, 768.5);
  if (m <= 840) return lerp(m, 780, 840, 768.5, 767.3);
  if (m <= 930) return lerp(m, 840, 930, 767.3, 766.35) + 0.08 * Math.sin((m - 840) / 4);
  if (m <= 936) return lerp(m, 930, 936, 766.35, 766.12);
  if (m === 937) return 765.8;
  return lerp(m, 937, 959, 765.8, 762.0);
}
const flushVol = (m: number) => (m < 930 ? 100_000 : m < 937 ? 150_000 : m === 937 ? 320_000 : 300_000 + (m - 937) * 60_000);
/** A normal afternoon: morning drift, then a flat oscillation around 767 that never leaves its range after 15:00. */
const calmPath = (m: number) => (m <= 700 ? lerp(m, 570, 700, 766.5, 767.0) : 767.0 + 0.3 * Math.sin((m - 700) / 3.2));

const volBase = new Float64Array(390).fill(100_000);
const ctxFor = (day: string, extra: Partial<FmDayContext> = {}): FmDayContext => ({
  day, pdh: 769.5, pdl: 764.0, pdc: 767.5, atr20: 5, volBase, cal: calendarFlags(day), macro0830: false, vix: null, ...extra,
});

async function main() {
  console.log('SPX fast moves');

  await ok('calendar: 2026-09-30 quarter-end + month-end is a close-flow day; 09-29 is not', () => {
    const q = calendarFlags(DAY);
    assert.ok(q.monthEnd && q.quarterEnd && q.closeFlowDay);
    assert.deepEqual(q.labels, ['quarter-end']);
    const o = calendarFlags(ORD);
    assert.ok(!o.closeFlowDay && !o.monthEnd && !o.opex);
  });
  await ok('calendar: OPEX / quad witching / VIX expiry / holidays', () => {
    assert.equal(monthlyOpex('2026-09'), '2026-09-18');
    assert.ok(calendarFlags('2026-09-18').quadWitching && calendarFlags('2026-09-18').indexRebalance);
    assert.equal(vixExpiry('2026-09'), '2026-09-16');         // 30 days before Fri 2026-10-16
    assert.ok(calendarFlags('2026-09-16').fomc && calendarFlags('2026-09-16').vixExpiry);
    assert.ok(!isTradingDay('2026-04-03'));                      // Good Friday
    assert.ok(calendarFlags('2026-03-31').monthEnd && calendarFlags('2026-03-31').quarterEnd);
    assert.ok(calendarFlags('2026-06-26').indexRebalance);       // last Friday of June — Russell
    assert.equal(prevTradingDay('2026-09-08'), '2026-09-04');   // over Labor Day
  });

  const flush = session(DAY, flushPath, flushVol);
  const calm = session(DAY, calmPath);

  await ok("today's pattern fires: session-low break puts at the 15:37 bar and the calendar close-flow puts", () => {
    const trig = detectFastMoves(flush, ctxFor(DAY));
    const lod = trig.find((t) => t.cause === 'pm_lod_break' && t.side === 'short');
    assert.ok(lod, 'pm_lod_break short missing');
    assert.equal(lod!.min, 937);
    assert.ok(lod!.level > 765.9 && lod!.level < 766.0, `session low ${lod!.level}`);
    const cf = trig.find((t) => t.cause === 'close_flow' && t.side === 'short');
    assert.ok(cf && cf.min >= 930 && cf.min < 937, `close_flow at ${cf?.min}`);
    assert.ok(!trig.some((t) => t.cause === 'close_flow_ctrl'), 'control cause must not fire on a calendar day');
    assert.ok(!trig.some((t) => t.side === 'long' && t.min >= 840), 'no afternoon calls on a flush');
  });
  await ok('the same tape on an ordinary day fires the CONTROL, not the calendar cause', () => {
    const trig = detectFastMoves(session(ORD, flushPath, flushVol), ctxFor(ORD));
    assert.ok(trig.some((t) => t.cause === 'close_flow_ctrl' && t.side === 'short'));
    assert.ok(!trig.some((t) => t.cause === 'close_flow'));
  });
  await ok('a normal afternoon does not fire anything after 14:00', () => {
    const trig = detectFastMoves(calm, ctxFor(DAY));
    const pm = trig.filter((t) => t.min >= 840);
    assert.deepEqual(pm.map((t) => `${t.cause}:${t.side}@${t.min}`), []);
  });
  await ok('no look-ahead: every prefix gives exactly the full-day triggers up to that bar', () => {
    for (const bars of [flush, calm, session(ORD, flushPath, flushVol)]) {
      const day = bars === calm || bars === flush ? DAY : ORD;
      const full = detectFastMoves(bars, ctxFor(day));
      for (let k = 1; k <= bars.length; k++) {
        const pre = detectFastMoves(bars.slice(0, k), ctxFor(day));
        const want = full.filter((t) => t.idx < k).map((t) => `${t.cause}:${t.side}@${t.idx}`);
        assert.deepEqual(pre.map((t) => `${t.cause}:${t.side}@${t.idx}`), want, `prefix ${k}`);
      }
    }
  });
  await ok('no look-ahead with VIXY: future VIX bars never change a trigger', () => {
    const vix = session(DAY, (m) => 20 + (m >= 840 ? (m - 840) * 0.02 : 0));
    const full = detectFastMoves(flush, ctxFor(DAY, { vix }));
    const vixT = full.find((t) => t.cause === 'vix_pm_break');
    assert.ok(vixT, 'vix_pm_break should fire (VIXY +3% by the afternoon)');
    const cut = detectFastMoves(flush.slice(0, vixT!.idx + 1), ctxFor(DAY, { vix: vix.slice(0, vixT!.idx + 1) }));
    assert.equal(cut.find((t) => t.cause === 'vix_pm_break')?.idx, vixT!.idx);
    const noFuture = detectFastMoves(flush.slice(0, vixT!.idx), ctxFor(DAY, { vix }));
    assert.ok(!noFuture.some((t) => t.cause === 'vix_pm_break' && t.idx >= vixT!.idx));
  });
  await ok('mirror: the flipped tape fires the session-HIGH break calls at the same bar', () => {
    const P = 1532;
    const mir = flush.map((b) => ({ ...b, o: P - b.o, c: P - b.c, h: P - b.l, l: P - b.h }));
    const trig = detectFastMoves(mir, ctxFor(DAY, { pdh: P - 764.0, pdl: P - 769.5, pdc: P - 767.5 }));
    const hod = trig.find((t) => t.cause === 'pm_lod_break' && t.side === 'long');
    assert.equal(hod?.min, 937);
    assert.ok(trig.some((t) => t.cause === 'close_flow' && t.side === 'long'));
  });
  await ok('contracts: first OTM / 0.2–0.4% / 0.5–0.8% bands, SPXW equivalent', () => {
    const k = Array.from({ length: 30 }, (_, i) => 750 + i);
    assert.equal(pickFastStrike(k, 765.8, 'short', 'otm1'), 765);
    assert.equal(pickFastStrike(k, 765.8, 'short', 'near'), 764);   // 0.235% OTM (763 is 0.366% — 764 is nearer the 0.3% midpoint)
    assert.equal(pickFastStrike(k, 765.8, 'short', 'cheap'), 761);  // 0.63%
    assert.equal(pickFastStrike(k, 765.8, 'long', 'otm1'), 766);
    assert.equal(pickFastStrike([765], 765.8, 'long', 'near'), null);
    assert.equal(spxwEquivalent(765, 10.04), 7680);
  });
  await ok('exits: take2x / take3x / stop50 (same-bar → stop) / half2x_trail / hold', () => {
    const b = (i: number, o: number, h: number, l: number, c: number) => ({ t: i * 60_000, o, h, l, c, v: 1 });
    const o1 = evaluateFastExit(1, [b(1, 1, 1.5, 0.9, 1.4), b(2, 1.4, 2.2, 1.3, 2.1), b(3, 2.1, 4, 2, 3.9), b(4, 3.9, 4, 2, 2.2)], 3, 0);
    assert.equal(o1.pnl.take2x, 1); assert.equal(o1.pnl.take3x, 2); assert.equal(o1.pnl.hold, 2);
    // half at 2× (+1.0 on half), rest trails: peak 4 → out on the 2.2 close (≤ 60% of 4 = 2.4) → +1.2 on half
    assert.ok(Math.abs(o1.pnl.half2x_trail - (0.5 * 1 + 0.5 * 1.2)) < 1e-9, `${o1.pnl.half2x_trail}`);
    const o2 = evaluateFastExit(1, [b(1, 1, 2.5, 0.4, 1)], 0, 0);
    assert.equal(o2.pnl.stop50, -0.5);
    assert.equal(o2.worthless, true); assert.equal(o2.pnl.hold, -1);
  });
  await ok('policy: nothing is publish:true (replay); candidates need the explicit flag', () => {
    assert.ok(Object.values(FAST_MOVE_POLICIES).every((p) => !p!.publish));
    assert.ok(fastMovePolicy('pm_lod_break', 'short')?.candidate);
    assert.equal(fastMovePolicy('close_flow', 'short'), null);
    assert.ok(CAUSE_IDS.length >= 12);
  });
  await ok('close-flow context line: quarter-end from 15:30 only; none on an ordinary day', () => {
    assert.equal(closeFlowRiskLine(calendarFlags(DAY), 929), null);
    assert.match(closeFlowRiskLine(calendarFlags(DAY), 930) ?? '', /quarter-end/);
    assert.equal(closeFlowRiskLine(calendarFlags(ORD), 945), null);
  });

  // ── live engine on a stubbed Alpaca ──
  const days: string[] = []; let d = DAY;
  while (days.length < 22) { d = prevTradingDay(d); days.unshift(d); }
  const hist = days.flatMap((x) => session(x, () => 767 + Math.random() * 0.01));
  const toApi = (b: MinuteBar) => ({ t: new Date(b.t).toISOString(), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, vw: (b.h + b.l + b.c) / 3 });
  const vixToday = session(DAY, () => 20);
  let requests = 0;
  const stub: FetchJson = async (url) => {
    requests++;
    const u = new URL(url);
    if (!u.pathname.endsWith('/v2/stocks/bars')) return { status: 200, json: { bars: {} } };
    const start = Date.parse(u.searchParams.get('start')!);
    const end = u.searchParams.get('end') ? Date.parse(u.searchParams.get('end')!) : Infinity;
    const syms = u.searchParams.get('symbols')!.split(',');
    const bars: Record<string, any[]> = {};
    for (const s of syms) {
      // The stub returns the WHOLE day (future bars included) — the engine must ignore bars not closed yet.
      const src = s === 'VIXY' ? vixToday : [...hist, ...flush];
      bars[s] = src.filter((b) => b.t >= start && b.t < end).map(toApi);
    }
    return { status: 200, json: { bars, next_page_token: null } };
  };

  await ok('live engine: at 15:36 nothing afternoon-put yet (future bars in the feed ignored)', async () => {
    __resetSpxFastMoves();
    const r = await runSpxFastMoves(tAt(DAY, 936), { force: true, publish: false, fetchJson: stub });
    assert.ok(r.ran, r.reason);
    assert.ok(!r.fresh.some((x) => x.cause === 'pm_lod_break'));
    assert.match(r.closeFlowLine ?? '', /quarter-end/);
  });
  await ok('live engine: the 15:37 bar is seen at 15:38 as a fresh candidate (not published, flag off) — once', async () => {
    const r = await runSpxFastMoves(tAt(DAY, 938), { force: true, publish: false, fetchJson: stub });
    const row = r.fresh.find((x) => x.cause === 'pm_lod_break' && x.side === 'short');
    assert.ok(row, JSON.stringify(r.fresh));
    assert.equal(row!.at, '15:38');
    assert.equal(row!.status, 'candidate (flag off)');
    const again = await runSpxFastMoves(tAt(DAY, 939), { force: true, publish: false, fetchJson: stub });
    assert.ok(!again.fresh.some((x) => x.cause === 'pm_lod_break'), 'must not re-fire');
    assert.ok(again.rows.filter((x) => x.cause === 'pm_lod_break').length === 1);
  });
  await ok('live engine: off by default and outside its windows', async () => {
    __resetSpxFastMoves();
    const off = await runSpxFastMoves(tAt(DAY, 938), { publish: false, fetchJson: stub });
    assert.equal(off.ran, false); assert.match(off.reason ?? '', /SPX_FAST_MOVES is off/);
  });
  console.log(`\n${passed} checks passed (${requests} stubbed requests)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
