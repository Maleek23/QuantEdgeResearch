/**
 * Unit tests for the score-v2 study's point-in-time features (shared/setup-features.ts)
 * and the board order that replaced score ranking (shared/board-sort.ts).
 *   npm run test:score-v2
 */
import assert from 'node:assert/strict';
import { completedThrough, dailyFeatures, relStrength5, rotationAlignment, atr, etDayMinute, type DayBar } from '../shared/setup-features';
import { readBoardSort, orderBoard, boardComparator, compareBoardRows, engineRecordR, ENGINE_RECORD_MEAN_R } from '../shared/board-sort';
import { scoreSwing } from '../shared/sector-ignition';

let n = 0;
const t = (name: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error('FAIL', name); throw e; } };

/** Weekday sessions from 2026-06-01, a gentle uptrend with a deterministic wiggle. */
function series(count: number, f: (i: number) => Partial<DayBar> = () => ({})): DayBar[] {
  const out: DayBar[] = [];
  const d = new Date('2026-06-01T12:00:00Z');
  let i = 0;
  while (out.length < count) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) {
      const c = 100 + i * 0.3 + Math.sin(i) * 1.5;
      out.push({ day: d.toISOString().slice(0, 10), o: c - 0.4, h: c + 1, l: c - 1, c, v: 1_000_000 + (i % 5) * 50_000, ...f(i) });
      i++;
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
const et = (day: string, hhmm: string) => Date.parse(`${day}T${hhmm}:00-04:00`); // EDT dates used below

// ── point-in-time cut ─────────────────────────────────────────────────────
t('ET clock: 15:59 / 16:00 EDT', () => {
  assert.deepEqual(etDayMinute(et('2026-09-15', '15:59')), { day: '2026-09-15', minute: 959 });
  assert.equal(etDayMinute(et('2026-09-15', '16:00')).minute, 960);
});
t('intraday publish never sees its own session bar', () => {
  const bars = [{ day: '2026-09-14' }, { day: '2026-09-15' }, { day: '2026-09-16' }] as DayBar[];
  assert.equal(completedThrough(bars, et('2026-09-15', '10:30')), 1);
  assert.equal(completedThrough(bars, et('2026-09-15', '15:59')), 1);
});
t('after the 16:00 close the session bar is complete', () => {
  const bars = [{ day: '2026-09-14' }, { day: '2026-09-15' }, { day: '2026-09-16' }] as DayBar[];
  assert.equal(completedThrough(bars, et('2026-09-15', '16:00')), 2);
  assert.equal(completedThrough(bars, et('2026-09-15', '20:15')), 2);
});
t('pre-open publish sees only the prior session', () => {
  const bars = [{ day: '2026-09-14' }, { day: '2026-09-15' }] as DayBar[];
  assert.equal(completedThrough(bars, et('2026-09-15', '08:45')), 1);
});
t('weekend publish sees Friday', () => {
  const bars = [{ day: '2026-09-18' }, { day: '2026-09-21' }] as DayBar[];
  assert.equal(completedThrough(bars, et('2026-09-19', '12:00')), 1);
});
t('crypto: a UTC day completes at 00:00 UTC next day', () => {
  const bars = [{ day: '2026-09-14' }, { day: '2026-09-15' }] as DayBar[];
  assert.equal(completedThrough(bars, Date.parse('2026-09-15T23:59:00Z'), true), 1);
  assert.equal(completedThrough(bars, Date.parse('2026-09-16T00:00:00Z'), true), 2);
});
t('features are invariant to bars after the cut (no look-ahead)', () => {
  const full = series(120);
  const pub = et(full[90].day, '11:00');   // mid-session on day 90 → bars 0..89 usable
  const cut = completedThrough(full, pub);
  assert.equal(cut, 90);
  const a = dailyFeatures(full.slice(0, cut), 125, 'long');
  // Rewrite every bar from the publish session on (a huge breakout) — the read must not move.
  const altered = full.map((b, i) => (i >= 90 ? { ...b, h: b.h * 3, l: b.l * 0.2, c: b.c * 2, v: b.v * 50 } : b));
  const b = dailyFeatures(altered.slice(0, completedThrough(altered, pub)), 125, 'long');
  assert.deepEqual(a, b);
});
t('rotation read uses only sessions completed at publish (study pipeline)', () => {
  const mk = (bump: number) => ({
    etf: series(80, (i) => ({ c: 100 + i * 0.4 * (i >= 60 ? bump : 1) })),
    spy: series(80, (i) => ({ c: 400 + i * 0.1 })),
    mem: [0, 1, 2, 3].map((k) => series(80, (i) => ({ c: 50 + k + i * 0.2 * (i >= 60 ? -bump : 1) }))),
  });
  const read = (d: ReturnType<typeof mk>, pub: number) => {
    const cut = (b: DayBar[]) => b.slice(0, completedThrough(b, pub)).map((x) => x.c);
    return scoreSwing({ groupId: 'g', label: 'g', etf: 'E', etfCloses: cut(d.etf), spyCloses: cut(d.spy), members: d.mem.map((m, k) => ({ symbol: `M${k}`, closes: cut(m) })), flowDays: null });
  };
  const pub = et(series(80)[60].day, '12:00');               // session 60 still forming
  const a = read(mk(1), pub), b = read(mk(25), pub);         // sessions ≥ 60 rewritten
  assert.equal(a.side, 'long');
  assert.deepEqual([a.side, a.relPct, a.breadthPct, a.stage], [b.side, b.relPct, b.breadthPct, b.stage]);
  const after = read(mk(25), et(series(80)[60].day, '16:05')); // after the close session 60 counts
  assert.notEqual(after.breadthPct, a.breadthPct);
});

// ── feature arithmetic ────────────────────────────────────────────────────
t('breakout proximity is direction-signed and in ATRs', () => {
  const bars = series(60);
  const a = atr(bars, 14)!;
  const hi20 = Math.max(...bars.slice(-20).map((b) => b.h)), lo20 = Math.min(...bars.slice(-20).map((b) => b.l));
  const L = dailyFeatures(bars, hi20 - 2 * a, 'long')!;
  assert.ok(Math.abs(L.brk20 + 2) < 1e-9);                   // 2 ATR below the 20-day high
  const S = dailyFeatures(bars, lo20 - a, 'short')!;
  assert.ok(Math.abs(S.brk20 - 1) < 1e-9);                    // 1 ATR through the 20-day low
});
t('inside days and NR7', () => {
  const bars = series(40);
  const last = bars.length - 1;
  bars[last - 1] = { ...bars[last - 1], h: bars[last - 2].h - 0.1, l: bars[last - 2].l + 0.1 };
  bars[last] = { ...bars[last], h: bars[last - 1].h - 0.1, l: bars[last - 1].l + 0.1 };
  const f = dailyFeatures(bars, bars[last].c, 'long')!;
  assert.equal(f.insideDays5, 2);
  assert.equal(f.nr7, true);
});
t('EMA distance flips sign with direction; RVOL uses the prior 20 sessions', () => {
  const bars = series(60, (i) => (i === 59 ? { v: 3_000_000 } : {}));
  const L = dailyFeatures(bars, 200, 'long')!, S = dailyFeatures(bars, 200, 'short')!;
  assert.ok(L.ema20Dist > 0 && Math.abs(L.ema20Dist + S.ema20Dist) < 1e-9);
  assert.equal(L.ema50Side, 1); assert.equal(S.ema50Side, -1);
  const prior = bars.slice(-21, -1).map((b) => b.v);
  assert.ok(Math.abs(L.rvol! - 3_000_000 / (prior.reduce((a, b) => a + b, 0) / 20)) < 1e-9);
});
t('thin history → null, never a fabricated read', () => {
  assert.equal(dailyFeatures(series(10), 100, 'long'), null);
  assert.equal(dailyFeatures(series(60), 0, 'long'), null);
});
t('relative strength vs SPY is direction-signed', () => {
  const spy = series(30, () => ({ c: 400 }));
  const sym = series(30, (i) => ({ c: 100 + (i >= 25 ? 10 : 0) }));
  assert.ok(Math.abs(relStrength5(sym, spy, 'long')! - 10) < 1e-9);
  assert.ok(Math.abs(relStrength5(sym, spy, 'short')! + 10) < 1e-9);
});
t('rotation alignment', () => {
  const read = { groupLabel: 'memory/storage', etf: 'SMH', side: 'long' as const, relPct: 2.5, breadthPct: 80, stage: 'extended' };
  assert.deepEqual(rotationAlignment(read, 'long'), { aligned: 1, rs5: 2.5 });
  assert.deepEqual(rotationAlignment(read, 'short'), { aligned: -1, rs5: -2.5 });
  assert.deepEqual(rotationAlignment({ ...read, side: null }, 'long'), { aligned: 0, rs5: 0 });
  assert.deepEqual(rotationAlignment(null, 'long'), { aligned: 0, rs5: 0 });
});

// ── board order ───────────────────────────────────────────────────────────
const picks = [
  { ideaId: 'a', convictionScore: 30, source: 'market_scanner', calledAt: '2026-09-30T14:00:00Z' },
  { ideaId: 'b', convictionScore: 10, source: 'quant', calledAt: '2026-09-29T14:00:00Z' },
  { ideaId: 'c', convictionScore: 20, source: 'brand_new_engine', calledAt: '2026-09-30T19:00:00Z' },
];
t('BOARD_SORT parsing defaults to score', () => {
  assert.equal(readBoardSort({}), 'score');
  assert.equal(readBoardSort({ BOARD_SORT: 'Recency' }), 'recency');
  assert.equal(readBoardSort({ BOARD_SORT: 'engine_record' }), 'engine_record');
  assert.equal(readBoardSort({ BOARD_SORT: 'v2' }), 'score');
});
t('score order unchanged', () => assert.deepEqual([...picks].sort(boardComparator('score')).map((p) => p.ideaId), ['a', 'c', 'b']));
t('recency: newest call first, boardRank stamped', () => {
  const o = orderBoard(picks, 'recency');
  assert.deepEqual(o.map((p) => [p.ideaId, p.boardRank]), [['c', 0], ['a', 1], ['b', 2]]);
  assert.equal(picks[0].hasOwnProperty('boardRank'), false); // input not mutated
});
t('engine_record: shrunk engine R, unknown engines at the book mean, ties by recency', () => {
  assert.equal(engineRecordR('brand_new_engine'), ENGINE_RECORD_MEAN_R);
  assert.deepEqual(orderBoard(picks, 'engine_record').map((p) => p.ideaId), ['b', 'c', 'a']); // quant > mean > market_scanner
});
t('client keeps the server order when both rows carry boardRank, else score', () => {
  assert.ok(compareBoardRows({ convictionScore: 5, boardRank: 0 }, { convictionScore: 40, boardRank: 1 }) < 0);
  assert.ok(compareBoardRows({ convictionScore: 5 }, { convictionScore: 40, boardRank: 1 }) > 0);
});

console.log(`score-v2: ${n} tests passed`);
