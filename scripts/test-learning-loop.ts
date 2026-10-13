/**
 * test-learning-loop — shared/learning-ledger.ts + shared/learning-loop.ts +
 * server/learning-calibration.ts gate + the job's file round trips (no DB).
 *
 *   npx tsx scripts/test-learning-loop.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildLedgerRow, excludeReason, todBucket, dteBucket, atrFromLevelSnap, type LedgerIdea, type LedgerRow } from '../shared/learning-ledger';
import {
  wilson, sliceStats, buildScorecard, driftFor, candidateSet, walkForward, refit, bracketR, reweightedGrade, evaluateRow,
  shadowReport, promotionGate, approveInto, rollbackFrom, autoRollbackCheck, activeCalibration, tradingDaysBetween,
  INCUMBENT, MIN_SLICE_N, SHADOW_MIN_DECIDED, type ChallengerState, type LearningConfig,
} from '../shared/learning-loop';

let failed = 0;
const ok = (cond: unknown, msg: string) => { if (cond) console.log(`  ✓ ${msg}`); else { failed++; console.log(`  ✗ ${msg}`); } };
const near = (a: number | null | undefined, b: number, eps = 1e-3) => a != null && Math.abs(a - b) < eps;

const base: LedgerIdea = {
  id: 'x', symbol: 'MSFT', assetType: 'option', direction: 'short', source: 'market_scanner', status: 'published',
  timestamp: '2026-10-13T15:20:43.000Z', entryPrice: 547.33, targetPrice: 537.28, stopLoss: 562.41, riskRewardRatio: 0.67,
  optionType: 'put', strikePrice: 495, expiryDate: '2026-11-20', optionDelta: -0.14, optionDte: 38,
  entryPremium: 4.43, exitPremium: 2.22, optionPercentGain: -49.89, outcomeStatus: 'hit_stop', resolutionReason: 'premium_hit_stop',
  outcomeNotes: '[peak:4.55@2026-10-13T15:57Z|quote]', highestPriceReached: 563, lowestPriceReached: 545,
  qualitySignals: ['gamma_regime:positive_gamma', 'flip:448.42', 'call_wall:550.00', 'put_wall:500.00', 'rel_spy:-1.05', 'stage:igniting'],
  convergenceSignalsJson: {
    levelSnap: { notes: ['formula stop $552.75 was inside 1.25× daily ATR ($12.06), so the search starts at $562.41'] },
    premiumPlan: { v: 'premium-plan-v1', entry: 4.43, t1: 4.63, t2: null, stop: 2.22, mapping: 'x', source: 'budget_contract' },
    budgetContract: { strike: 495, expiry: '2026-11-20', entryPremium: 4.43, premiumT1: 4.63, premiumStop: 2.22 },
    optionsOnly: { action: 'budget_promoted' },
    nexusGradeAtPublish: { v: 'g2-2026-10-03', score: 91, letter: 'A', f: { window: 25, session: 10, evidence: 15.8, lifecycle: 25, technical: 15 } },
  },
};

console.log('1. ledger row (features at publish, premium outcome)');
{
  const r = buildLedgerRow(base, { nowMs: Date.parse('2026-10-14T00:00:00Z') });
  ok(r.excluded === null, 'eligible');
  ok(near(r.features.atr, 9.648), `ATR from level-snap note (${r.features.atr})`);
  ok(near(r.features.stopAtr, Math.abs(547.33 - 562.41) / 9.648, 0.01), `stop width in ATR (${r.features.stopAtr})`);
  ok(r.features.gexRegime === 'positive_gamma' && r.features.gex.flipPct != null, 'GEX regime + flip distance');
  ok(r.features.rotation.tag === 'leading' && near(r.features.rotation.relSpy, 1.05), 'rel_spy read WITH the trade (short, −1.05 → leading)');
  ok(r.features.tod === 'morning' && r.features.dteBucket === '22-60' && near(r.features.delta, 0.14), 'tod / dte / |delta|');
  ok(r.features.gradeBand === 'A' && r.features.grade.f?.evidence === 15.8, 'g2 grade components');
  ok(r.features.contract === 'budget_promoted', 'budget-vs-primary');
  const o = r.outcome!;
  ok(o.basis === 'premium' && o.result === 'loss' && o.decided, 'option judged on premium, decided loss');
  ok(near(o.R, (2.22 - 4.43) / (4.43 - 2.22)) && near(o.R, -1), `R = premium move ÷ premium risk (${o.R})`);
  ok(o.qty500 === 1 && o.qty1000 === 2 && near(o.pnl500, -221) && near(o.pnl1000, -442), 'whole-contract P&L at $500 / $1,000');
  ok(near(o.premium?.peak, 4.55) && o.premium!.peakR! > 0, 'premium peak from outcome notes');
  const win = buildLedgerRow({ ...base, id: 'w', outcomeStatus: 'hit_target', exitPremium: 4.63, optionPercentGain: 4.51, resolutionReason: 'premium_hit_target' });
  ok(win.outcome!.result === 'win' && near(win.outcome!.R, 0.2 / 2.21, 0.002), 'premium target win R');
}

console.log('2. exclusions');
{
  ok(excludeReason({ ...base, timestamp: '2026-08-20T15:00:00Z' }) === 'before_baseline', 'pre-2026-08-26 never used');
  ok(excludeReason(base, { verdictOf: () => 'MISMATCH' }) === 'verify_mismatch', 'verification MISMATCH excluded');
  ok(excludeReason({ ...base, resolutionReason: 'duplicate_collapsed' }) === 'duplicate', 'duplicates excluded');
  ok(excludeReason({ ...base, excludeFromTraining: true }) === 'excluded_from_training', 'excludeFromTraining excluded');
  ok(excludeReason({ ...base, entryPremium: null }) === 'no_entry_premium', 'option without premium excluded');
  const missed = buildLedgerRow({ ...base, id: 'm', resolutionReason: 'missed_entry_invalidated_before_trigger', outcomeStatus: 'expired' });
  ok(missed.outcome && !missed.outcome.decided, 'missed entry is unresolved (coverage only)');
  ok(todBucket(9 * 60 + 35) === 'open' && todBucket(15 * 60 + 45) === 'power' && dteBucket('option', 0) === '0' && dteBucket('stock', null) === 'stock', 'buckets');
  ok(atrFromLevelSnap({ notes: ['nothing'] }) === null, 'no ATR note → null');
}

console.log('3. statistics');
{
  const w = wilson(50, 100)!;
  ok(near(w.lo, 0.404, 0.002) && near(w.hi, 0.596, 0.002), `Wilson 50/100 = ${w.lo}–${w.hi}`);
  ok(wilson(0, 0) === null, 'Wilson n=0 → null');
}

// synthetic book: engine "good" wins 60% at +1.5R / −1R; engine "bad" wins 25%.
function synth(n: number, seed = 1, startDay = Date.parse('2026-09-01T14:00:00Z')): LedgerRow[] {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const rows: LedgerRow[] = [];
  for (let i = 0; i < n; i++) {
    const engine = i % 2 ? 'good' : 'bad';
    const win = rnd() < (engine === 'good' ? 0.6 : 0.25);
    const ms = startDay + Math.floor(i / 6) * 86_400_000 + (i % 6) * 3_600_000;
    const r = buildLedgerRow({
      ...base, id: `s${seed}-${i}`, source: engine, timestamp: new Date(ms).toISOString(),
      outcomeStatus: win ? 'hit_target' : 'hit_stop', resolutionReason: win ? 'premium_hit_target' : 'premium_hit_stop',
      exitPremium: win ? 4.43 + 1.5 * 2.21 : 2.22, optionPercentGain: win ? 74.8 : -49.9,
      highestPriceReached: win ? 547.33 + 0.2 * 9.648 : 547.33 + 1.3 * 9.648, lowestPriceReached: win ? 547.33 - 2.2 * 9.648 : 547.33 - 0.1 * 9.648,
    });
    rows.push(r);
  }
  return rows;
}

console.log('4. scorecard + drift');
{
  const rows = synth(240);
  const sc = buildScorecard(rows, '2026-08-26', Date.parse('2026-10-14T00:00:00Z'));
  const eng = sc.slices.engine;
  const good = eng.find((x) => x.value === 'good')!, bad = eng.find((x) => x.value === 'bad')!;
  ok(sc.population.decided === 240 && good.n === 120 && bad.n === 120, 'every slice carries n');
  ok(good.expectancyR! > 0 && bad.expectancyR! < 0 && good.ci!.lo > bad.ci!.hi - 0.2, `engine slices separate (good ${good.expectancyR}R, bad ${bad.expectancyR}R)`);
  ok(near(good.expectancyR, good.avgR!, 0.002), 'expectancy = p·avgWin + (1−p)·avgLoss = avg R');
  ok(SCOREDIM_OK(sc), 'all six dimensions present');
  // drift: append 20 losses to "good"
  const lateLoss = synth(40, 7, Date.parse('2026-10-20T14:00:00Z')).filter((r) => r.features.engine === 'good').map((r) => ({ ...r, outcome: { ...r.outcome!, R: -1, result: 'loss' as const } }));
  const flags = driftFor([...rows.filter((r) => r.features.engine === 'good'), ...lateLoss], 'engine', 'good');
  ok(flags.some((f) => f.kind === 'win_rate') && flags.some((f) => f.kind === 'avg_r'), 'last-20 collapse flags win-rate and avg-R drift');
  ok(driftFor(rows.filter((r) => r.features.engine === 'good'), 'engine', 'good').length === 0, 'stable slice → no drift flag');
}
function SCOREDIM_OK(sc: ReturnType<typeof buildScorecard>) { return ['engine', 'gradeBand', 'setup', 'tod', 'regime', 'dte'].every((d) => Array.isArray((sc.slices as any)[d])); }

console.log('5. re-fit (walk-forward, both halves)');
{
  const rows = synth(300);
  const cands = candidateSet(rows);
  ok(cands.some((c) => c.family === 'grade') && cands.some((c) => c.family === 'bracket') && cands.some((c) => c.family === 'contract') && cands.some((c) => c.family === 'exit'), 'bounded candidate families');
  ok(cands.filter((c) => c.family === 'mute').map((c) => c.config.id).includes('mute:engine:bad'), 'mute candidates come from slices with n ≥ minN');
  const muteBad = walkForward(cands.find((c) => c.config.id === 'mute:engine:bad')!, rows);
  ok(muteBad.accepted && muteBad.beatsBothHalves, `muting the losing engine is accepted (${muteBad.why})`);
  const muteGood = walkForward(cands.find((c) => c.config.id === 'mute:engine:good')!, rows);
  ok(!muteGood.accepted, 'muting the winning engine is rejected');
  const rep = refit(rows);
  ok(rep.challenger?.muteEngines.includes('bad') && !rep.challenger.muteEngines.includes('good'), `challenger = merged family winners (${rep.challenger?.id})`);
  ok(rep.challenger != null && rep.challenger.stopAtr == null && rep.challenger.t1Atr == null, 'advisory bracket family never enters the challenger');
  ok(rep.tested === cands.length && rep.notes[0].includes('candidates tested'), 'multiple-comparison count disclosed');
  // a flat book (every idea +0.5R, managed identical) → no filter can strictly beat the incumbent
  const flat = synth(300, 3).map((r) => ({ ...r, outcome: { ...r.outcome!, R: 0.5, managedR: 0.5 } }));
  const frep = refit(flat);
  ok(!frep.byFamily.mute.accepted && !frep.byFamily.contract.accepted && !frep.byFamily.grade.accepted && !frep.byFamily.exit.accepted, 'flat book: no filter / exit candidate accepted');
  // small sample → rejected for n
  const tiny = walkForward(cands.find((c) => c.config.id === 'mute:engine:bad')!, rows.slice(0, 40));
  ok(!tiny.accepted && /n per half/.test(tiny.why), `min n per half enforced (${tiny.why})`);
}

console.log('6. bracket replay + grade reweight');
{
  const r = synth(2)[1]; // a "good" win: MFE 2.2 ATR, MAE 0.2 ATR
  ok(bracketR(r, 1, 2) === 2 && bracketR(r, 0.1, 2) === -1, 'stop-first: reachable stop → −1R; else T1/stop');
  ok(reweightedGrade({ evidence: 25, technical: 15, lifecycle: 25, window: 25, session: 10 }, INCUMBENT.gradeWeights) === 100, 'g2 weights → 100 at max');
  ok(reweightedGrade(null, INCUMBENT.gradeWeights) === null, 'no components → null');
  const cfg: LearningConfig = { ...INCUMBENT, deltaBand: [0.3, 0.5] };
  ok(evaluateRow(cfg, r) === null, '|Δ| 0.14 outside 0.3–0.5 → not taken');
}

console.log('7. shadow, gate, calibration versions, auto-rollback');
{
  const ch: ChallengerState = { config: { ...INCUMBENT, id: 'challenger:mute:engine:bad', label: 'mute bad', muteEngines: ['bad'] }, createdAt: '2026-09-01T00:00:00.000Z', refitAsOf: 'x', refitBothHalves: true, status: 'shadow' };
  const rows = synth(120);
  const sh = shadowReport(ch, rows, 12);
  ok(sh.decided === 120 && sh.challenger.n === 60 && sh.beats && sh.complete, 'shadow scores challenger vs incumbent on live ideas');
  ok(promotionGate(ch, sh).eligible, 'gate eligible: both halves + shadow n ≥ 50 + beats');
  ok(!promotionGate(ch, { ...sh, tradingDays: 4 }).eligible, 'gate: < 10 trading days → not eligible');
  ok(!promotionGate(ch, { ...sh, decided: SHADOW_MIN_DECIDED - 1 }).eligible, 'gate: n < 50 → not eligible');
  ok(!promotionGate({ ...ch, refitBothHalves: false }, sh).eligible, 'gate: refit not both halves → not eligible');
  ok(!promotionGate(ch, null).eligible, 'gate: no shadow → not eligible');
  const f1 = approveInto(null, ch, sh, 'admin', Date.parse('2026-10-01T00:00:00Z'));
  ok(f1.current === 1 && activeCalibration(f1)?.config.id === ch.config.id && f1.versions[0].expectation != null, 'approve → v1 with expectation band');
  const f2 = rollbackFrom(f1, 'admin', 'rollback', 'manual');
  ok(f2.current === 2 && activeCalibration(f2)?.config.id === 'incumbent' && f2.versions.length === 2, 'rollback → v2 = incumbent, history kept');
  // auto-rollback: 30 losers after approval
  const after = synth(80, 5, Date.parse('2026-10-02T14:00:00Z')).filter((r) => r.features.engine === 'good').map((r) => ({ ...r, outcome: { ...r.outcome!, R: -1 } }));
  const chk = autoRollbackCheck(f1, after);
  ok(chk.due && chk.n === 30, `auto-rollback due when first 30 decided average below the floor (${chk.reason})`);
  ok(!autoRollbackCheck(f1, after.slice(0, 10)).due, 'auto-rollback waits for 30 decided');
  ok(!autoRollbackCheck(f2, after).due, 'no auto-rollback for a rollback version');
  ok(tradingDaysBetween('2026-10-09T15:00:00Z', Date.parse('2026-10-16T15:00:00Z')) === 5, 'trading days count (Fri → next Fri = 5)');
}

console.log('8. publish gate (LEARNING_LOOP_APPLY) + file round trip');
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qe-learning-'));
  process.env.SHARED_STATE_DIR = dir;
  const lc = await import('../server/learning-calibration');
  ok(!lc.learningApplyEnabled({}) && lc.learningApplyEnabled({ LEARNING_LOOP_APPLY: 'on' }), 'LEARNING_LOOP_APPLY defaults off');
  const cal = { version: 3, config: { ...INCUMBENT, muteEngines: ['bad'], dteBand: [0, 2] as [number, number] }, at: 'x', by: 'a', action: 'approve' as const, expectation: null, note: '' };
  const now = Date.parse('2026-10-13T15:00:00Z');
  ok(/engine bad muted/.test(lc.calibrationGateFor(cal, { source: 'bad', assetType: 'stock' }, now) ?? ''), 'muted engine refused');
  ok(/DTE 38/.test(lc.calibrationGateFor(cal, { source: 'good', assetType: 'option', expiryDate: '2026-11-20' }, now) ?? ''), 'DTE band refused');
  ok(lc.calibrationGateFor(null, { source: 'bad' }, now) === null, 'no calibration → no gate');
  const { writeSharedSync } = await import('../server/lib/shared-state');
  writeSharedSync('calibration', approveInto(null, { config: cal.config, createdAt: 'x', refitAsOf: 'x', refitBothHalves: true, status: 'shadow' } as ChallengerState, null, 'a'));
  ok(fs.existsSync(path.join(dir, 'calibration.json')), 'calibration lives at .cache/shared/calibration.json');
  const saved = process.env.LEARNING_LOOP_APPLY;
  delete process.env.LEARNING_LOOP_APPLY;
  ok(lc.learningPublishGate({ source: 'bad' }) === null, 'flag off → approved file ignored');
  process.env.LEARNING_LOOP_APPLY = 'on';
  ok(lc.learningPublishGate({ source: 'bad' }) != null, 'flag on → approved mutes applied');
  if (saved === undefined) delete process.env.LEARNING_LOOP_APPLY; else process.env.LEARNING_LOOP_APPLY = saved;
  const job = await import('../server/learning-loop-job');
  ok(job.readLedger(path.join(dir, 'nope.jsonl')).length === 0, 'missing ledger reads empty');
  ok(job.readState().challenger === null, 'empty state');
  ok(!job.approveChallenger('admin').ok, 'approve refused without an eligible challenger (never auto-promote)');
  ok(job.shadowTakes({ ...INCUMBENT, muteEngines: ['bad'] }, synth(2)[0]) === false && job.shadowTakes(INCUMBENT, synth(2)[1]), 'shadow take decision uses filters only');
  const src = fs.readFileSync(path.join(import.meta.dirname ?? __dirname, '..', 'server', 'learning-loop-job.ts'), 'utf8');
  ok(!/approveChallenger\(\s*['"]learning-loop/.test(src) && /'0 19 \* \* 1-5'/.test(src) && /'0 10 \* \* 6'/.test(src), 'scheduler: 19:00 ET weekdays scorecard, Saturday re-fit, no auto-approve');
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(failed ? `\n${failed} FAILED` : '\nall learning-loop checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

void MIN_SLICE_N;
