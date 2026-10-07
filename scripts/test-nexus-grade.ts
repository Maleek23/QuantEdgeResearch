/**
 * NEXUS grade (shared/nexus-grade.ts), BOARD_SORT=grade (shared/board-sort.ts) and the
 * read-only grade audit (research/grade-audit.ts).
 *   npm run test:nexus-grade
 */
import assert from 'node:assert/strict';
import { nexusGrade, gradePick, gradeFromLife, letterFor, rotationAligned, windowLeft, whyRankedHere, NEXUS_GRADE_POINTS, type GradeInput } from '../shared/nexus-grade';
import { readBoardSort, orderBoard, boardComparator } from '../shared/board-sort';
import { setupLifecycle } from '../shared/setup-lifecycle';
import { dbR, rowFromDb, rrBand, spearman, splitHalves, featureReport, audit, IDEAS_SQL, type AuditRow } from '../research/grade-audit';

let n = 0;
const t = (name: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const et = (day: string, hhmm: string) => Date.parse(`${day}T${hhmm}:00-04:00`);

const NOW = et('2026-10-01', '11:00');
const base: GradeInput = {
  lifecycle: 'fresh', publishMs: et('2026-10-01', '09:30'), windowEndsMs: et('2026-10-01', '16:00'),
  publishedDay: '2026-10-01', today: '2026-10-01', nowMs: NOW, layers: [],
};

// ── points + letters ──────────────────────────────────────────────────────
t('points table sums to 100', () => {
  const P = NEXUS_GRADE_POINTS;
  assert.equal(P.valid + P.fresh + P.window + P.rotation, 100);
});
t('fresh day trade 1.5h into a 6.5h window', () => {
  const g = nexusGrade(base);
  // 60 + 20 + 15 × (5/6.5) = 91.5
  assert.equal(g.score, 91.5);
  assert.equal(g.letter, 'A');
  assert.equal(g.validated, false);
  assert.equal(g.factors.length, 4);
});
t('letters: A ≥ 90, B ≥ 80, C ≥ 60, D ≥ 10, else F', () => {
  assert.equal(letterFor(100), 'A'); assert.equal(letterFor(90), 'A'); assert.equal(letterFor(89.9), 'B');
  assert.equal(letterFor(80), 'B'); assert.equal(letterFor(79), 'C'); assert.equal(letterFor(60), 'C');
  assert.equal(letterFor(59), 'D'); assert.equal(letterFor(10), 'D'); assert.equal(letterFor(9), 'F');
  assert.equal(letterFor(NaN), 'F');
});
t('carried (earlier day) gets no fresh points → C band', () => {
  const g = nexusGrade({ ...base, lifecycle: 'carried', publishedDay: '2026-09-30', publishMs: et('2026-09-30', '10:00'), windowEndsMs: et('2026-10-06', '16:00') });
  assert.equal(g.factors.find((f) => f.key === 'fresh')!.points, 0);
  assert.equal(g.letter, 'C');
});
t('stale and resolved sink below every live setup', () => {
  const stale = nexusGrade({ ...base, lifecycle: 'stale', layers: [{ kind: 'sector', points: 8 }] });
  const resolved = nexusGrade({ ...base, lifecycle: 'resolved' });
  const worstLive = nexusGrade({ ...base, lifecycle: 'carried', publishedDay: '2026-09-30', windowEndsMs: NOW });
  assert.ok(stale.score < worstLive.score);
  assert.ok(resolved.score < stale.score);
  assert.equal(stale.letter, 'D'); assert.equal(resolved.letter, 'F');
  // no window or fresh credit once not live
  assert.equal(stale.factors.find((f) => f.key === 'window')!.points, 0);
});
t('window left clamps to [0, 1] and is 0 when unreadable', () => {
  assert.equal(windowLeft(0, 100, -50), 1);
  assert.equal(windowLeft(0, 100, 150), 0);
  assert.equal(windowLeft(null, 100, 50), 0);
  assert.equal(windowLeft(100, 100, 50), 0);
});

// ── rotation bonus: bounded, with-rotation only, never negative ──────────
t('with rotation = +5 exactly', () => {
  const a = nexusGrade(base);
  const b = nexusGrade({ ...base, layers: [{ kind: 'sector', points: 6 }] });
  assert.equal(Math.round((b.score - a.score) * 10) / 10, NEXUS_GRADE_POINTS.rotation);
  assert.equal(b.rotationAligned, true);
  const f = b.factors.find((x) => x.key === 'rotation')!;
  assert.equal(f.basis, 'operator prior'); assert.equal(f.validated, false);
});
t('against rotation = 0, not negative', () => {
  const a = nexusGrade(base);
  const against = nexusGrade({ ...base, layers: [{ kind: 'sector', points: -14 }] });
  assert.equal(against.score, a.score);
  assert.equal(against.factors.find((x) => x.key === 'rotation')!.points, 0);
});
t('rotation reads only the sector / peers layer, net of its parts', () => {
  assert.equal(rotationAligned([{ kind: 'technical', points: 10 }]), false);
  assert.equal(rotationAligned([{ kind: 'sector', points: 3 }, { kind: 'sector', points: -4 }]), false);
  assert.equal(rotationAligned([{ kind: 'sector', points: 3 }]), true);
  assert.equal(rotationAligned(null), false);
});
t('the evidence score / confluence count / R:R do not move the grade', () => {
  const thin = nexusGrade({ ...base, layers: [] });
  const thick = nexusGrade({ ...base, layers: [{ kind: 'technical', points: 14 }, { kind: 'gex', points: 10 }, { kind: 'ta', points: 8 }, { kind: 'structure', points: 6 }] });
  assert.equal(thin.score, thick.score);
});
t('top 3 contributors + why line', () => {
  const g = nexusGrade({ ...base, layers: [{ kind: 'sector', points: 4 }] });
  assert.equal(g.top.length, 3);
  assert.deepEqual(g.top.map((f) => f.key), ['lifecycle', 'fresh', 'window']);
  assert.match(whyRankedHere(g), /^live & valid \+60 · published today \+20 · \d+% of window left \+[\d.]+$/);
  const late = nexusGrade({ ...base, nowMs: et('2026-10-01', '15:55'), layers: [{ kind: 'sector', points: 4 }] });
  assert.deepEqual(late.top.map((f) => f.key), ['lifecycle', 'fresh', 'rotation']);
});

// ── pick-level grading uses the shared lifecycle ──────────────────────────
const pick = (o: Record<string, unknown> = {}) => ({
  ideaId: 'x', direction: 'long', entryPrice: 100, stopLoss: 98, targetPrice: 104, holdingPeriod: 'swing',
  assetType: 'stock', calledAt: new Date(et('2026-10-01', '09:45')).toISOString(), currentPrice: 100.5, layers: [], convictionScore: 10, ...o,
});
t('gradePick: fresh swing on its first session', () => {
  const g = gradePick(pick(), NOW);
  assert.equal(g.letter, 'A');
  assert.equal(g.factors[0].label, 'live & valid');
});
t('gradePick: through the stop = resolved → F', () => {
  assert.equal(gradePick(pick({ currentPrice: 97 }), NOW).letter, 'F');
});
t('gradeFromLife matches gradePick on the same read', () => {
  const p = pick();
  assert.deepEqual(gradeFromLife(setupLifecycle(p, NOW), p, NOW), gradePick(p, NOW));
});

// ── BOARD_SORT=grade ──────────────────────────────────────────────────────
t('readBoardSort accepts grade, keeps recency, defaults score', () => {
  assert.equal(readBoardSort({ BOARD_SORT: 'grade' }), 'grade');
  assert.equal(readBoardSort({ BOARD_SORT: ' GRADE ' }), 'grade');
  assert.equal(readBoardSort({ BOARD_SORT: 'recency' }), 'recency');
  assert.equal(readBoardSort({}), 'score');
});
t('grade order: highest grade first, ties newest first, score ignored', () => {
  const rows = [
    { ideaId: 'a', convictionScore: 40, calledAt: '2026-10-01T13:00:00Z', nexusGrade: { score: 70 } },
    { ideaId: 'b', convictionScore: 1, calledAt: '2026-10-01T12:00:00Z', nexusGrade: { score: 95 } },
    { ideaId: 'c', convictionScore: 5, calledAt: '2026-10-01T14:00:00Z', nexusGrade: { score: 95 } },
    { ideaId: 'd', convictionScore: 99, calledAt: '2026-10-01T15:00:00Z' },
  ];
  const out = orderBoard(rows, 'grade');
  assert.deepEqual(out.map((r) => r.ideaId), ['c', 'b', 'a', 'd']);
  assert.deepEqual(out.map((r) => r.boardRank), [0, 1, 2, 3]);
  assert.ok(boardComparator('grade')(rows[0], rows[1]) > 0);
});
t('recency mode unchanged by a stamped grade', () => {
  const rows = [
    { ideaId: 'a', convictionScore: 0, calledAt: '2026-10-01T13:00:00Z', nexusGrade: { score: 10 } },
    { ideaId: 'b', convictionScore: 0, calledAt: '2026-10-01T12:00:00Z', nexusGrade: { score: 99 } },
  ];
  assert.deepEqual(orderBoard(rows, 'recency').map((r) => r.ideaId), ['a', 'b']);
});

// ── grade audit (read-only research) ──────────────────────────────────────
t('audit SQL is a single SELECT on the honest window', () => {
  assert.match(IDEAS_SQL, /^select json_agg/);
  assert.doesNotMatch(IDEAS_SQL, /\b(insert|update|delete|drop|alter|truncate|create)\b/i);
  assert.match(IDEAS_SQL, /timestamp >= '2026-08-26'/);
});
t('dbR: long stock, short stock, premium-level option', () => {
  assert.equal(dbR({ direction: 'long', entry_price: 100, stop_loss: 98, exit_price: 104 }), 2);
  assert.equal(dbR({ direction: 'short', entry_price: 100, stop_loss: 102, exit_price: 101 }), -0.5);
  // premium levels: entry 2.00 on a 175 strike, stop 1.00, exit premium 3.00 → +1R
  assert.equal(dbR({ direction: 'long', option_type: 'call', strike_price: 175, entry_price: 2, stop_loss: 1, exit_price: 180, exit_premium: 3 }), 1);
  assert.equal(dbR({ direction: 'long', entry_price: 100, stop_loss: 100, exit_price: 104 }), null);
  assert.equal(dbR({ direction: 'long', entry_price: 100, stop_loss: 98, exit_price: null }), null);
});
t('rowFromDb: drops pre-2026-08-26, open and unlabelled rows', () => {
  const ok = { id: '1', ts: '2026-09-02T14:00:00Z', direction: 'long', entry_price: 100, stop_loss: 98, target_price: 104, exit_price: 101, outcome_status: 'manual_exit', holding_period: 'swing', asset_type: 'stock', gen_scoring_layers: [{ kind: 'sector', points: 4 }, { kind: 'technical', points: 6 }] };
  const r = rowFromDb(ok)!;
  assert.equal(r.R, 0.5);
  assert.equal(r.f.rotWith, 1); assert.equal(r.f.confFamilies, 1); assert.equal(r.f.rrBand, 2);
  assert.equal(r.f.grade, 100);
  assert.equal(rowFromDb({ ...ok, ts: '2026-08-20T14:00:00Z' }), null);
  assert.equal(rowFromDb({ ...ok, outcome_status: 'open' }), null);
  assert.equal(rowFromDb({ ...ok, exit_price: null }), null);
});
t('rrBand + spearman + halves', () => {
  assert.equal(rrBand(2), 2); assert.equal(rrBand(1.2), 1); assert.equal(rrBand(4), 1); assert.equal(rrBand(8), 0); assert.equal(rrBand(null), null);
  assert.equal(spearman([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]), 1);
  assert.equal(spearman([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]), -1);
  const rows: AuditRow[] = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'].map((day, i) => ({ id: String(i), day, R: i, f: { x: i } }));
  assert.deepEqual(splitHalves(rows).map((r) => r.half), ['H1', 'H1', 'H2', 'H2']);
});
t('a feature passes only when both halves agree with the top 5 removed', () => {
  const rows: AuditRow[] = [];
  for (let i = 0; i < 40; i++) rows.push({ id: `a${i}`, day: '2026-09-01', half: 'H1', R: i / 10, f: { good: i, flip: i } });
  for (let i = 0; i < 40; i++) rows.push({ id: `b${i}`, day: '2026-09-20', half: 'H2', R: i / 10, f: { good: i, flip: -i } });
  assert.equal(featureReport(rows, 'good').sameSignDropTop, true);
  assert.equal(featureReport(rows, 'flip').sameSignDropTop, false);
  assert.deepEqual(audit(rows).passing, ['good']);
});

console.log(`nexus-grade: ${n} tests passed`);
