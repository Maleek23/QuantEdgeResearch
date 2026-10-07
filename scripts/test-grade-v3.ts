/**
 * NEXUS grade v3 (shared/nexus-grade.ts, GRADE_VERSION=v3), its server inputs
 * (server/grade-v3-inputs.ts), the study core (research/grade-v3-core.ts) and the
 * v2-vs-v3 audit (research/grade-audit.ts).
 *   npm run test:grade-v3
 */
import assert from 'node:assert/strict';
import {
  nexusGrade, nexusGradeV3, gradePick, gradeIdeaRow, gradeIdeaRowAtPublish, pickFromIdeaRow, formatNexusGrade, nexusGradeLine, gradeBreakdown,
  whyThisGrade, gradeAtLeast, isGradeLive, gradeSortValue, gradeComponents, gradeComponentsTag, readGradeVersion, setGradeVersion,
  activeGradeVersion, resolveGradeVersion, v3StopPoints, v3ChasePoints, v3RegimePoints, gradeV3InputsFrom, readGradeInputs,
  V3_QUALITY_POINTS, V3_VALIDATED, NEXUS_GRADE_V3_VERSION, NEXUS_GRADE_VERSION, type GradeInput, type GradeV3Inputs,
} from '../shared/nexus-grade';
import { orderBoard } from '../shared/board-sort';
import { swingOrder, isLiveGrade } from '../shared/bot-sleeves';
import { levelsOnUnderlying, toDayBars, measurePick } from '../server/grade-v3-inputs';
import {
  ledgerTruth, rFromPnl, isotonic, fitScore, scoreRow, ranking, crossFit, validatedFeatures, numericAssoc, categoricalAssoc,
  splitHalves, sessionVwap, gexRoomAtr, dteFit, plannedHoldDays, quantileEdges, bucketIndex, validatedEntry, clipR, type StudyRow,
} from '../research/grade-v3-core';
import { IDEAS_SQL } from '../research/grade-v3-study';
import { rowFromDb, rowFromStudy, audit, sideBySide, IDEAS_SQL as AUDIT_SQL } from '../research/grade-audit';
import type { DayBar } from '../shared/setup-features';

let n = 0;
const t = (name: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const et = (day: string, hhmm: string) => Date.parse(`${day}T${hhmm}:00-04:00`);
const NOW = et('2026-10-01', '11:00');
const good: GradeV3Inputs = { v: 'v3', at: '2026-10-01T13:45:00Z', atr: 2, stopAtr: 1.5, chaseAtr: 0.1, regime: 1, gapAtr: 0.2 };
const base: GradeInput = {
  lifecycle: 'fresh', publishMs: et('2026-10-01', '09:30'), windowEndsMs: et('2026-10-01', '16:00'),
  publishedDay: '2026-10-01', today: '2026-10-01', nowMs: NOW, layers: [], version: 'v3', gradeInputs: good, direction: 'long',
};

// ── version selection ─────────────────────────────────────────────────────
t('GRADE_VERSION: v3 only when set to v3; default g2', () => {
  assert.equal(readGradeVersion({}), 'g2');
  assert.equal(readGradeVersion({ GRADE_VERSION: ' V3 ' }), 'v3');
  assert.equal(readGradeVersion({ GRADE_VERSION: 'g2' }), 'g2');
  assert.equal(readGradeVersion(null), 'g2');
});
t('server (env present, GRADE_VERSION unset) grades g2 even when a pick carries inputs', () => {
  const prev = process.env.GRADE_VERSION; delete process.env.GRADE_VERSION;
  try {
    assert.equal(activeGradeVersion(), 'g2');
    assert.equal(nexusGrade({ ...base, version: undefined }).version, NEXUS_GRADE_VERSION);
    process.env.GRADE_VERSION = 'v3';
    assert.equal(nexusGrade({ ...base, version: undefined }).version, NEXUS_GRADE_V3_VERSION);
  } finally { if (prev == null) delete process.env.GRADE_VERSION; else process.env.GRADE_VERSION = prev; }
});
t('browser (no process): the server-stamped inputs decide; setGradeVersion pins', () => {
  const g = globalThis as any; const saved = g.process;
  try {
    g.process = undefined;
    assert.equal(activeGradeVersion(), null);
    assert.equal(resolveGradeVersion({ gradeInputs: good }), 'v3');
    assert.equal(resolveGradeVersion({ gradeInputs: null }), 'g2');
    setGradeVersion('g2');
    assert.equal(resolveGradeVersion({ gradeInputs: good }), 'g2');
  } finally { g.process = saved; setGradeVersion(null); }
});

// ── quality prior ─────────────────────────────────────────────────────────
t('V3_VALIDATED is empty until the study validates a feature (all prior)', () => {
  assert.deepEqual(Object.keys(V3_VALIDATED), []);
  assert.equal(V3_QUALITY_POINTS.stop + V3_QUALITY_POINTS.chase + V3_QUALITY_POINTS.regime, 100);
});
t('stop prior: 0 at ≤0.5×ATR, full at ≥1.25×ATR, linear between, 0 when unread', () => {
  assert.equal(v3StopPoints(0.4), 0); assert.equal(v3StopPoints(0.5), 0); assert.equal(v3StopPoints(0.875), 20);
  assert.equal(v3StopPoints(1.25), 40); assert.equal(v3StopPoints(3), 40); assert.equal(v3StopPoints(null), 0);
  assert.equal(v3StopPoints(0.51), 0.5, 'the median NEXUS stop earns almost nothing');
});
t('chase prior: full ≤0.25 ATR past entry (or before it), 0 at ≥1 ATR', () => {
  assert.equal(v3ChasePoints(-2), 30); assert.equal(v3ChasePoints(0.25), 30); assert.equal(v3ChasePoints(0.625), 15);
  assert.equal(v3ChasePoints(1), 0); assert.equal(v3ChasePoints(null), 0);
});
t('regime prior: with 30, flat 15, against 0, unread 0', () => {
  assert.equal(v3RegimePoints(1), 30); assert.equal(v3RegimePoints(0), 15); assert.equal(v3RegimePoints(-1), 0); assert.equal(v3RegimePoints(null), 0);
});
t('wide, unchased, aligned = A 100; median-stop chased counter-trend = F', () => {
  const g = nexusGradeV3(base);
  assert.equal(g.score, 100); assert.equal(g.letter, 'A'); assert.equal(g.validated, false);
  const bad = nexusGradeV3({ ...base, gradeInputs: { ...good, stopAtr: 0.51, chaseAtr: 1.2, regime: -1 } });
  assert.equal(bad.letter, 'F'); assert.equal(bad.score, 1);
});
t('no inputs = conservative 0 quality, labelled as unread', () => {
  const g = nexusGradeV3({ ...base, gradeInputs: null });
  assert.equal(g.score, 0);
  assert.match(g.factors.find((f) => f.key === 'stop')!.label, /no ATR read/);
});
t('confluence NOT rewarded, R:R not rewarded, shorts not penalised', () => {
  const a = nexusGradeV3(base);
  const b = nexusGradeV3({ ...base, layers: ['technical', 'structure', 'regime', 'ta', 'gex'].map((k) => ({ kind: k, points: 8 })), riskRewardRatio: 4 });
  const c = nexusGradeV3({ ...base, direction: 'short' });
  assert.equal(a.score, b.score); assert.equal(a.score, c.score);
  assert.match(b.factors.find((f) => f.key === 'confluence')!.label, /5 confluence families — not rewarded/);
  assert.equal(c.factors.find((f) => f.key === 'short')!.label, 'short — not penalised');
  for (const k of ['short', 'confluence', 'rr', 'gap']) assert.equal(b.factors.find((f) => f.key === k)!.status, 'measuring');
  for (const k of ['stop', 'chase', 'regime']) assert.equal(b.factors.find((f) => f.key === k)!.status, 'prior');
});

// ── actionability is a state, not points ──────────────────────────────────
t('stale / resolved keep the quality letter; state = not actionable now', () => {
  const live = nexusGradeV3(base);
  const stale = nexusGradeV3({ ...base, lifecycle: 'stale' });
  const resolved = nexusGradeV3({ ...base, lifecycle: 'resolved' });
  assert.equal(stale.score, live.score); assert.equal(resolved.letter, live.letter);
  assert.equal(live.action!.state, 'actionable'); assert.equal(stale.action!.label, 'not actionable now');
  assert.equal(formatNexusGrade(live), 'A 100'); assert.equal(formatNexusGrade(stale), 'A 100 · not now');
  assert.match(nexusGradeLine(stale), /A 100\/100 · not actionable now — quality grade/);
});
t('window closed on a live plan = not actionable; unreadable window stays actionable', () => {
  assert.equal(nexusGradeV3({ ...base, nowMs: et('2026-10-01', '16:30') }).action!.state, 'not_actionable');
  assert.equal(nexusGradeV3({ ...base, publishMs: null, windowEndsMs: null }).action!.state, 'actionable');
});
t('gates: gradeAtLeast and isGradeLive require actionable under v3', () => {
  const live = nexusGradeV3(base), stale = nexusGradeV3({ ...base, lifecycle: 'stale' });
  assert.equal(gradeAtLeast(live, 'B'), true); assert.equal(gradeAtLeast(stale, 'B'), false);
  assert.equal(isGradeLive(live), true); assert.equal(isGradeLive(stale), false);
  assert.equal(isLiveGrade(stale), false);
});
t('sort: actionable first, then quality, then actionability rank as tiebreak', () => {
  const aStale = nexusGradeV3({ ...base, lifecycle: 'stale' });
  const cLive = nexusGradeV3({ ...base, gradeInputs: { ...good, stopAtr: 0.8 } });
  const aEarly = nexusGradeV3(base);
  const aLate = nexusGradeV3({ ...base, nowMs: et('2026-10-01', '15:00') });
  assert.ok(gradeSortValue(cLive) > gradeSortValue(aStale));
  assert.ok(gradeSortValue(aEarly) > gradeSortValue(aLate));
  assert.ok(gradeSortValue(aLate) > gradeSortValue(cLive));
  assert.equal(aEarly.score, aLate.score, 'window left never moves the letter');
  const rows = [{ ideaId: 's', convictionScore: 0, nexusGrade: aStale }, { ideaId: 'c', convictionScore: 0, nexusGrade: cLive }, { ideaId: 'a', convictionScore: 0, nexusGrade: aLate }];
  assert.deepEqual(orderBoard(rows, 'grade').map((r) => r.ideaId), ['a', 'c', 's']);
  assert.deepEqual(swingOrder(rows.map((r) => ({ ideaId: r.ideaId, grade: r.nexusGrade, publishMs: 0 }))).map((r) => r.ideaId), ['a', 'c', 's']);
});
t('why this grade: every feature with points + status, actionability as a gate row', () => {
  const rows = whyThisGrade(nexusGradeV3({ ...base, lifecycle: 'stale' }));
  assert.deepEqual(rows.map((r) => r.key), ['stop', 'chase', 'regime', 'short', 'confluence', 'rr', 'gap', 'action']);
  assert.equal(rows.at(-1)!.status, 'state');
  assert.match(rows.at(-1)!.note, /not points/);
  assert.match(gradeBreakdown(nexusGradeV3(base)), /stop 1\.50×ATR 40\/40 \[prior\]/);
});
t('components log v3 inputs + action; tag carries act=', () => {
  const g = nexusGradeV3(base);
  const c = gradeComponents(g, NOW);
  assert.equal(c.v, NEXUS_GRADE_V3_VERSION); assert.deepEqual(c.q, good); assert.equal(c.a!.state, 'actionable');
  assert.deepEqual(Object.keys(c.f), ['stop', 'chase', 'regime']);
  assert.equal(gradeComponentsTag(g), `nexus-grade:${NEXUS_GRADE_V3_VERSION}:A:100|stop=40|chase=30|regime=30|act=actionable`);
});

// ── one grade on every surface under v3 ───────────────────────────────────
t('v3: board pick and stored row (convergenceSignalsJson.gradeInputs) show the same grade', () => {
  setGradeVersion('v3');
  try {
    const at = et('2026-10-01', '10:30');
    const pick = { ideaId: 'fx', direction: 'long', entryPrice: 100, stopLoss: 97, targetPrice: 106, holdingPeriod: 'swing', assetType: 'stock',
      calledAt: new Date(et('2026-10-01', '09:45')).toISOString(), currentPrice: 100.4, convictionScore: 24, layers: [{ kind: 'technical', points: 5 }], gradeInputs: good };
    const row = { direction: 'long', entryPrice: 100, stopLoss: 97, targetPrice: 106, holdingPeriod: 'swing', assetType: 'stock', timestamp: pick.calledAt,
      generationTimestamp: pick.calledAt, outcomeStatus: 'open', currentPrice: 100.4, genConvictionScore: 24, genScoringLayers: pick.layers,
      convergenceSignalsJson: { gradeInputs: good } };
    const shown = [gradePick(pick, at), gradeIdeaRow(row, at), gradePick(pickFromIdeaRow(row), at)].map(formatNexusGrade);
    assert.equal(new Set(shown).size, 1, shown.join(' / '));
    assert.equal(shown[0], 'A 100');
    assert.equal(formatNexusGrade(gradeIdeaRowAtPublish(row)!), 'A 100');
    // through the stop: resolved → same letter, not actionable
    assert.equal(formatNexusGrade(gradePick({ ...pick, currentPrice: 96 }, at)), 'A 100 · not now');
  } finally { setGradeVersion(null); }
});
t('readGradeInputs: only v3 objects; coerces numbers', () => {
  assert.equal(readGradeInputs(null), null); assert.equal(readGradeInputs({ v: 'g2' }), null);
  assert.deepEqual(readGradeInputs({ v: 'v3', at: 'x', atr: '2', stopAtr: 1, chaseAtr: null, regime: -3 }), { v: 'v3', at: 'x', atr: 2, stopAtr: 1, chaseAtr: null, regime: -1, gapAtr: null });
});

// ── inputs from bars (shared + server) ────────────────────────────────────
const mkDays = (n: number, start: string, close: (i: number) => number, range = 2): DayBar[] => {
  const out: DayBar[] = []; let d = Date.parse(`${start}T12:00:00Z`);
  for (let i = 0; i < n; i++) { const day = new Date(d).toISOString().slice(0, 10); const c = close(i); out.push({ day, o: c, h: c + range / 2, l: c - range / 2, c, v: 1e6 }); d += 86400_000; }
  return out;
};
t('gradeV3InputsFrom: ATR, stop ÷ ATR, chase, SPY regime, completed bars only', () => {
  const daily = mkDays(40, '2026-08-20', () => 100);           // TR = 2 → ATR 2
  const spyUp = mkDays(40, '2026-08-20', (i) => 500 + i * 2);  // rising
  const atMs = Date.parse('2026-09-29T14:00:00Z');             // 10:00 ET on 09-29 (that day's bar not complete)
  const gi = gradeV3InputsFrom({ direction: 'long', entry: 100, stop: 97, price: 100.5, atMs, levelsUnderlying: true, daily, spyDaily: spyUp, todayOpen: 101 });
  assert.equal(gi.atr, 2); assert.equal(gi.stopAtr, 1.5); assert.equal(gi.chaseAtr, 0.25); assert.equal(gi.regime, 1); assert.equal(gi.gapAtr, 0.5);
  const sh = gradeV3InputsFrom({ direction: 'short', entry: 100, stop: 103, price: 99, atMs, levelsUnderlying: true, daily, spyDaily: spyUp });
  assert.equal(sh.regime, -1); assert.equal(sh.chaseAtr, 0.5);
  const prem = gradeV3InputsFrom({ direction: 'long', entry: 2.1, stop: 1.0, price: 100, atMs, levelsUnderlying: false, daily, spyDaily: spyUp });
  assert.equal(prem.stopAtr, null); assert.equal(prem.chaseAtr, null); assert.equal(prem.atr, 2);
  assert.equal(gradeV3InputsFrom({ direction: 'long', entry: 100, stop: 97, price: 100, atMs, levelsUnderlying: true, daily: daily.slice(0, 5), spyDaily: [] }).atr, null);
});
t('server inputs: level basis, getBars → DayBar, measurePick', () => {
  assert.equal(levelsOnUnderlying({ assetType: 'stock', entryPrice: 100 }), true);
  assert.equal(levelsOnUnderlying({ assetType: 'option', entryPrice: 2.1, strikePrice: 175 }), false);
  assert.equal(levelsOnUnderlying({ assetType: 'option', entryPrice: 170, strikePrice: 175 }), true);
  assert.equal(levelsOnUnderlying({ assetType: 'option', levelBasis: 'contract', entryPrice: 170 }), false);
  const db = toDayBars([{ date: new Date('2026-09-28T04:00:00Z'), open: 1, high: 2, low: 0.5, close: 1.5, volume: 9 }]);
  assert.deepEqual(db, [{ day: '2026-09-28', o: 1, h: 2, l: 0.5, c: 1.5, v: 9 }]);
  const gi = measurePick({ ideaId: 'x', symbol: 'X', direction: 'long', entryPrice: 100, stopLoss: 97, currentPrice: 100 }, mkDays(40, '2026-08-20', () => 100), mkDays(40, '2026-08-20', () => 500), Date.parse('2026-09-29T14:00:00Z'));
  assert.equal(gi.stopAtr, 1.5); assert.equal(gi.regime, 0);
});

// ── study core ────────────────────────────────────────────────────────────
t('ledger truth: VERIFIED recorded, MISMATCH recomputed, excludes never-triggered/synthetic/duplicates/unverifiable', () => {
  const tr = { id: '1', recordedPnL: 50, recomputedPnL: 40, recordedEntry: 2 };
  assert.deepEqual(ledgerTruth({ ...tr, verdict: 'VERIFIED' }), { ok: true, pnl: 50, basis: 'verified', entry: 2, triggerAt: null });
  assert.equal((ledgerTruth({ ...tr, verdict: 'MISMATCH', bugClass: 'exit_price_not_traded' }) as any).pnl, 40);
  assert.deepEqual(ledgerTruth({ ...tr, verdict: 'MISMATCH', bugClass: 'never_triggered', recomputedPnL: 0 }), { ok: false, reason: 'never_triggered' });
  assert.deepEqual(ledgerTruth({ ...tr, verdict: 'MISMATCH', bugClass: 'synthetic_or_retroactive' }), { ok: false, reason: 'synthetic_or_retroactive' });
  assert.deepEqual(ledgerTruth({ ...tr, verdict: 'VERIFIED', duplicateOf: '0' }), { ok: false, reason: 'duplicate' });
  assert.deepEqual(ledgerTruth({ ...tr, verdict: 'UNVERIFIABLE' }), { ok: false, reason: 'unverifiable' });
  assert.deepEqual(ledgerTruth({ ...tr, verdict: 'MISMATCH', recomputedPnL: null }), { ok: false, reason: 'mismatch without recomputed P&L' });
  assert.deepEqual(ledgerTruth(undefined), { ok: false, reason: 'not in ledger' });
});
t('R from P&L: stock $1k notional, option premium stop, option 1R = premium', () => {
  assert.equal(rFromPnl({ assetType: 'stock', pnl: 40, entry: 100, stop: 98, premium: null, contractLevels: false }), 2);
  assert.equal(rFromPnl({ assetType: 'option', pnl: 100, entry: 2, stop: 1, premium: 2, contractLevels: true }), 1);
  assert.equal(rFromPnl({ assetType: 'option', pnl: -100, entry: 170, stop: 165, premium: 2, contractLevels: false }), -0.5);
  assert.equal(rFromPnl({ assetType: 'option', pnl: 10, entry: 2, stop: 1, premium: null, contractLevels: true }), null);
  assert.equal(clipR(9), 5); assert.equal(clipR(-9), -3);
});
t('isotonic (PAV) is non-decreasing and weight-preserving', () => {
  assert.deepEqual(isotonic([1, 3, 2], [1, 1, 1]), [1, 2.5, 2.5]);
  assert.deepEqual(isotonic([3, 2, 1], [1, 1, 2]), [1.75, 1.75, 1.75]);
  assert.deepEqual(quantileEdges([1, 2, 3, 4, 5, 6], 3), [3, 5]);
  assert.equal(bucketIndex([3, 5], 4), 1); assert.equal(bucketIndex([3, 5], 9), 2);
});
// Synthetic book: `good` drives R in both halves; `noise` flips sign across halves.
const synth: StudyRow[] = [];
for (let i = 0; i < 120; i++) {
  const half = i < 60 ? 'A' : 'B';
  const g = (i % 60) / 60;
  const R = (g - 0.5) * 2 + ((i * 7) % 5 - 2) * 0.1;
  synth.push({ id: String(i), day: half === 'A' ? '2026-09-01' : '2026-09-20', half, R, f: { good: g, noise: half === 'A' ? g : -g }, c: { engine: i % 2 ? 'quant' : 'flow' }, s: { grade: (i * 37) % 100, v3prior: g * 100 } });
}
t('fit: monotone tables, chosen sign, missing → middle bucket', () => {
  const fit = fitScore(synth.filter((r) => r.half === 'A'), ['good'], [], 'A');
  const tb = fit.tables[0];
  assert.equal(tb.key, 'good'); assert.equal(tb.sign, 1);
  assert.ok(tb.points.every((p, i) => i === 0 || p >= tb.points[i - 1]), `monotone ${tb.points}`);
  assert.equal(scoreRow(fit, { ...synth[0], f: { good: null } }), tb.missing);
});
t('cross-fit: a real driver ranks the other half; a flipping one does not validate', () => {
  const fits = crossFit(synth);
  assert.equal(fits.length, 2);
  for (const f of fits) assert.ok((f.test.fitted.rho ?? 0) > 0, `${f.direction} ρ ${f.test.fitted.rho}`);
  const assoc = ['good', 'noise'].map((k) => numericAssoc(synth, k));
  assert.equal(assoc[0].holdsBoth, true); assert.equal(assoc[1].holdsBoth, false);
  const tweak = fits.map((f) => ({ ...f, fit: fitScore(synth.filter((r) => r.half === f.fit.trainHalf), ['good', 'noise'], [], f.fit.trainHalf) }));
  assert.deepEqual(validatedFeatures(synth, tweak, assoc), ['good']);
  const r = ranking(synth, (x) => x.s.v3prior);
  assert.equal(r.buckets.length, 5); assert.ok((r.topMinusBottomR ?? 0) > 0);
  const e = validatedEntry(synth.map((x) => ({ ...x, f: { ...x.f, stopAtr: x.f.good } })), 'stopAtr', 40)!;
  assert.equal(Math.max(...e.points), 40); assert.match(e.note, /validated on the verified book/);
});
t('categorical: per-level halves with top 5 removed', () => {
  const c = categoricalAssoc(synth, 'engine');
  assert.deepEqual(c.levels.map((l) => l.level), ['flow', 'quant']);
  assert.ok(c.levels.every((l) => l.A.n + l.B.n === 60));
  assert.deepEqual(splitHalves([{ day: '2026-09-01' }, { day: '2026-09-02' }, { day: '2026-09-03' }, { day: '2026-09-04' }]).map((r) => r.half), ['A', 'A', 'B', 'B']);
});
t('feature helpers: VWAP, GEX room, DTE fit, planned hold', () => {
  const bars = [{ t: 1, h: 11, l: 9, c: 10, v: 100 }, { t: 2, h: 13, l: 11, c: 12, v: 300 }, { t: 3, h: 99, l: 99, c: 99, v: 1 }];
  assert.equal(sessionVwap(bars, 2), 11.5);
  assert.equal(gexRoomAtr('long', 100, 104, 95, 2), 2); assert.equal(gexRoomAtr('short', 100, 104, 95, 2), 2.5);
  assert.equal(gexRoomAtr('long', 100, null, 95, 2), null);
  assert.equal(dteFit(7, 5), 0); assert.equal(dteFit(null, 5), null);
  assert.equal(plannedHoldDays('day'), 1); assert.equal(plannedHoldDays('position'), 10); assert.equal(plannedHoldDays(null), 5);
});
t('study SQL: one read-only SELECT with the lateral GEX snapshot', () => {
  const q = IDEAS_SQL('2026-08-26');
  assert.match(q, /^select json_agg/);
  assert.doesNotMatch(q, /\b(insert|update|delete|drop|alter|truncate|create)\b/i);
  assert.match(q, /left join lateral/); assert.match(q, /gex_snapshots/); assert.match(q, /timestamp >= '2026-08-26'/);
});

// ── audit: v2 vs v3 side by side ──────────────────────────────────────────
t('audit: DB row gets gradeV3 from measured inputs; a v3 stamp never feeds the g2 column', () => {
  assert.match(AUDIT_SQL, /'gradeInputs' as grade_inputs/);
  const ok = { id: '1', ts: '2026-09-02T14:00:00Z', direction: 'long', entry_price: 100, stop_loss: 98, target_price: 104, exit_price: 101, outcome_status: 'manual_exit', holding_period: 'swing', asset_type: 'stock', gen_scoring_layers: [{ kind: 'technical', points: 6 }] };
  assert.equal(rowFromDb(ok)!.f.gradeV3, null, 'no inputs → no v3 grade, never a zero');
  assert.equal(rowFromDb({ ...ok, grade_inputs: good })!.f.gradeV3, 100);
  const v3stamp = { v: NEXUS_GRADE_V3_VERSION, score: 55, q: { ...good, stopAtr: 0.875 } };
  const r = rowFromDb({ ...ok, logged_grade: v3stamp })!;
  assert.equal(r.f.gradeV3, 80); assert.equal(r.f.grade, 69); assert.equal(r.f.gLogged, 0);
});
t('audit: study rows grade v3 from stopAtr + chase; side-by-side report', () => {
  const row = rowFromStudy({ id: 'a', day: '2026-09-01', half: 'H1', dir: 'long', R: 1, old: 10, f: { stopAtr: 1.25, entryDist: 0, L_technical: 4 } });
  assert.equal(row.f.gradeV3, 70); // stop 40 + not chased 30 + regime unread 0
  const rows = [];
  for (let i = 0; i < 40; i++) rows.push({ id: `a${i}`, day: '2026-09-01', half: 'H1' as const, R: i / 10, f: { grade: 40 - i, gradeV3: i } });
  for (let i = 0; i < 40; i++) rows.push({ id: `b${i}`, day: '2026-09-20', half: 'H2' as const, R: i / 10, f: { grade: i % 7, gradeV3: i } });
  const s = sideBySide(audit(rows));
  assert.equal(s.v3!.sameSignDropTop, true); assert.equal(s.v2!.sameSignDropTop, false);
});

console.log(`grade-v3: ${n} tests passed`);
