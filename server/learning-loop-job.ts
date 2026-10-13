/**
 * LEARNING LOOP JOB — ledger · nightly scorecard · weekly re-fit · shadow · gate.
 * ==========================================================================
 * Pure logic lives in shared/learning-ledger.ts and shared/learning-loop.ts;
 * this file does the I/O. Worker job `learning-loop` (server/background-jobs.ts).
 *
 *   every 15 min, weekdays 09:00–16:59 ET   LEDGER pass: newly published ideas get a
 *       feature row (features are read from what the row carried AT PUBLISH) and,
 *       while a challenger is in shadow, a side-by-side shadow decision line.
 *   19:00 ET weekdays                       NIGHTLY: rebuild the ledger joined to outcomes
 *       → .cache/shared/learning-ledger.jsonl; scorecard + drift → learning-scorecard.json;
 *       shadow report + promotion gate + auto-rollback check → learning-state.json.
 *   Saturday 10:00 ET                       RE-FIT: walk-forward candidate search
 *       → learning-refit.json; an accepted challenger starts its shadow period.
 *
 * Nothing here changes publishing. The approved calibration (calibration.json,
 * written only by an admin Approve on /admin/learning) is read by
 * server/learning-calibration.ts behind LEARNING_LOOP_APPLY (default off).
 * Kill switches: LEARNING_LOOP=off (whole job) · LEARNING_SCORECARD=off ·
 * LEARNING_SHADOW=off (both default on).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Express, RequestHandler } from 'express';
import { logger } from './logger';
import { OUTCOME_BASELINE_DATE } from '@shared/constants';
import { buildLedgerRow, type LedgerIdea, type LedgerRow } from '@shared/learning-ledger';
import {
  buildScorecard, refit, shadowReport, promotionGate, approveInto, rollbackFrom, autoRollbackCheck, activeCalibration,
  tradingDaysBetween, evaluateRow, reweightedGrade, INCUMBENT,
  type ChallengerState, type RefitReport, type Scorecard, type ShadowReport, type CalibrationFile, type ShadowEntry, type RollbackCheck,
} from '@shared/learning-loop';
import { readShared, sharedDir, writeShared, writeSharedSync } from './lib/shared-state';
import { CALIBRATION_NAME, readCalibrationFile } from './learning-calibration';

const off = (v: string | undefined) => /^(0|false|off|no)$/i.test(String(v ?? '').trim());
export const learningLoopEnabled = () => !off(process.env.LEARNING_LOOP);
export const scorecardEnabled = () => !off(process.env.LEARNING_SCORECARD);
export const shadowEnabled = () => !off(process.env.LEARNING_SHADOW);

export const LEDGER_FILE = 'learning-ledger.jsonl';
export const SHADOW_FILE = 'learning-shadow.jsonl';
const ledgerPath = () => path.join(sharedDir(), LEDGER_FILE);
const shadowPath = () => path.join(sharedDir(), SHADOW_FILE);

export interface LearningState {
  challenger: ChallengerState | null;
  shadow: ShadowReport | null;
  gate: { eligible: boolean; reasons: string[] } | null;
  rollback: RollbackCheck | null;
  history: Array<{ at: string; event: string; detail: string }>;
  cursor: string | null;
}
const EMPTY_STATE: LearningState = { challenger: null, shadow: null, gate: null, rollback: null, history: [], cursor: null };
export function readState(): LearningState { return { ...EMPTY_STATE, ...(readShared<LearningState>('learning-state')?.data ?? {}) }; }
function writeState(s: LearningState): void {
  s.history = s.history.slice(-200);
  writeSharedSync('learning-state', s);
}
const note = (s: LearningState, event: string, detail: string) => { s.history.push({ at: new Date().toISOString(), event, detail }); };

// ─── I/O ─────────────────────────────────────────────────────────────────────

async function loadIdeas(sinceIso: string): Promise<LedgerIdea[]> {
  const { db } = await import('./db');
  const { tradeIdeas } = await import('@shared/schema');
  const { gte } = await import('drizzle-orm');
  return (await db.select().from(tradeIdeas).where(gte(tradeIdeas.timestamp, sinceIso))) as unknown as LedgerIdea[];
}

async function context() {
  const { loadDeskVerifyLedger } = await import('./desk-verify-ledger');
  const { loadManagedLedger } = await import('./managed-replay-ledger');
  const verify = loadDeskVerifyLedger();
  const replay = loadManagedLedger();
  return {
    verifyAsOf: verify?.asOf ?? null,
    replayAsOf: replay?.asOf ?? null,
    ctx: {
      verdictOf: (id: string) => verify?.byId.get(id)?.verdict ?? null,
      replayOf: (id: string) => {
        const e = replay?.byId.get(id);
        if (!e) return null;
        return { call: e.call.result, managedR: e.managed.status === 'closed' ? e.managed.rMultiple : null };
      },
    },
  };
}

export function readLedger(file = ledgerPath()): LedgerRow[] {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as LedgerRow);
  } catch { return []; }
}
async function writeLedger(rows: LedgerRow[], file = ledgerPath()): Promise<void> {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tmp, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  await fs.promises.rename(tmp, file);
}
function appendShadow(entries: ShadowEntry[]): void {
  if (!entries.length) return;
  fs.mkdirSync(path.dirname(shadowPath()), { recursive: true });
  fs.appendFileSync(shadowPath(), entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
}
export function readShadowLog(): ShadowEntry[] {
  try { return fs.readFileSync(shadowPath(), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
}

// ─── passes ──────────────────────────────────────────────────────────────────

/** Intraday: feature rows for ideas published since the cursor + shadow decisions. */
export async function ledgerPass(): Promise<{ added: number; shadowed: number }> {
  const state = readState();
  const since = state.cursor ?? `${OUTCOME_BASELINE_DATE}T00:00:00-04:00`;
  const ideas = await loadIdeas(since);
  const { ctx } = await context();
  const existing = new Set(readLedger().map((r) => r.id));
  const fresh = ideas.filter((i) => !existing.has(i.id)).map((i) => buildLedgerRow(i, ctx));
  if (fresh.length) {
    fs.mkdirSync(path.dirname(ledgerPath()), { recursive: true });
    fs.appendFileSync(ledgerPath(), fresh.map((r) => JSON.stringify(r)).join('\n') + '\n');
  }
  let shadowed = 0;
  if (shadowEnabled() && state.challenger?.status === 'shadow') {
    const ch = state.challenger;
    const seen = new Set(readShadowLog().filter((e) => e.challengerId === ch.config.id).map((e) => e.id));
    const entries: ShadowEntry[] = fresh.filter((r) => !r.excluded && r.publishedAt >= ch.createdAt && !seen.has(r.id)).map((r) => ({
      id: r.id, at: new Date().toISOString(), challengerId: ch.config.id,
      take: shadowTakes(ch.config, r), grade: reweightedGrade(r.features.grade.f, ch.config.gradeWeights),
    }));
    appendShadow(entries);
    shadowed = entries.length;
  }
  const latest = ideas.reduce((m, i) => (i.timestamp > m ? i.timestamp : m), state.cursor ?? '');
  if (latest && latest !== state.cursor) { state.cursor = latest; writeState(state); }
  return { added: fresh.length, shadowed };
}

/** Would the challenger take this idea at publish? (filters only — outcome unknown yet). */
export function shadowTakes(cfg: ChallengerState['config'], r: LedgerRow): boolean {
  const probe: LedgerRow = { ...r, outcome: { ...(r.outcome ?? {} as any), decided: true, R: 0, managedR: 0, mfeAtr: 0, maeAtr: 0, closeAtr: 0 } };
  return evaluateRow({ ...cfg, stopAtr: null, t1Atr: null, exitPolicy: 'plan' }, probe) != null;
}

/** Nightly: full rebuild joined to outcomes, scorecard, shadow, gate, auto-rollback. */
export async function nightly(nowMs = Date.now()): Promise<{ rows: number; decided: number; drift: number }> {
  const ideas = await loadIdeas(`${OUTCOME_BASELINE_DATE}T00:00:00-04:00`);
  const { ctx, verifyAsOf, replayAsOf } = await context();
  const rows = ideas.map((i) => buildLedgerRow(i, { ...ctx, nowMs }));
  await writeLedger(rows);
  let sc: Scorecard | null = null;
  if (scorecardEnabled()) {
    sc = buildScorecard(rows, OUTCOME_BASELINE_DATE, nowMs);
    sc.caveats.push(verifyAsOf ? `verification ledger as of ${verifyAsOf}` : 'verification ledger not present — MISMATCH exclusion could not be applied');
    sc.caveats.push(replayAsOf ? `managed-replay ledger (call accuracy, managed R) as of ${replayAsOf}` : 'managed-replay ledger not present — no call accuracy / managed R');
    await writeShared('learning-scorecard', sc);
  }
  const state = readState();
  if (state.challenger?.status === 'shadow') {
    state.shadow = shadowReport(state.challenger, rows, tradingDaysBetween(state.challenger.createdAt, nowMs));
    state.gate = promotionGate(state.challenger, state.shadow);
  }
  const cal = readCalibrationFile();
  state.rollback = autoRollbackCheck(cal, rows);
  if (state.rollback.due && cal) {
    const next = rollbackFrom(cal, 'learning-loop', 'auto_rollback', state.rollback.reason, nowMs);
    writeCalibration(next);
    note(state, 'auto_rollback', state.rollback.reason);
    logger.warn(`[LEARNING] auto-rollback: ${state.rollback.reason}`);
  }
  writeState(state);
  return { rows: rows.length, decided: sc?.population.decided ?? 0, drift: sc?.drift.length ?? 0 };
}

/** Weekly: walk-forward candidate search; an accepted challenger enters shadow. */
export async function weeklyRefit(nowMs = Date.now()): Promise<RefitReport> {
  let rows = readLedger();
  if (!rows.length) { await nightly(nowMs); rows = readLedger(); }
  const report = refit(rows, nowMs);
  await writeShared('learning-refit', report);
  const state = readState();
  if (report.challenger && shadowEnabled()) {
    const sameAsShadow = state.challenger?.status === 'shadow' && state.challenger.config.id === report.challenger.id;
    if (!sameAsShadow) {
      if (state.challenger?.status === 'shadow') state.challenger.status = 'superseded';
      state.challenger = { config: report.challenger, createdAt: new Date(nowMs).toISOString(), refitAsOf: report.asOf, refitBothHalves: true, status: 'shadow' };
      state.shadow = null;
      state.gate = promotionGate(state.challenger, null);
      note(state, 'challenger', `${report.challenger.id} entered shadow`);
    }
  } else {
    note(state, 'refit', `no candidate beat the incumbent in both halves (${report.tested} tested)`);
  }
  writeState(state);
  return report;
}

// ─── calibration writes (admin) ──────────────────────────────────────────────

function writeCalibration(f: CalibrationFile): void {
  writeSharedSync(CALIBRATION_NAME, f);
}

export function approveChallenger(by: string, nowMs = Date.now()): { ok: boolean; error?: string; file?: CalibrationFile } {
  const state = readState();
  const gate = promotionGate(state.challenger, state.shadow);
  if (!gate.eligible || !state.challenger) return { ok: false, error: `not eligible: ${gate.reasons.join('; ')}` };
  const file = approveInto(readCalibrationFile(), state.challenger, state.shadow, by, nowMs);
  writeCalibration(file);
  state.challenger = { ...state.challenger, status: 'approved', decidedAt: new Date(nowMs).toISOString(), decidedBy: by };
  state.gate = promotionGate(state.challenger, state.shadow);
  note(state, 'approve', `${state.challenger.config.id} → calibration v${file.current} by ${by}`);
  writeState(state);
  return { ok: true, file };
}
export function rejectChallenger(by: string, nowMs = Date.now()): { ok: boolean; error?: string } {
  const state = readState();
  if (!state.challenger || state.challenger.status !== 'shadow') return { ok: false, error: 'no challenger in shadow' };
  state.challenger = { ...state.challenger, status: 'rejected', decidedAt: new Date(nowMs).toISOString(), decidedBy: by };
  state.gate = promotionGate(state.challenger, state.shadow);
  note(state, 'reject', `${state.challenger.config.id} rejected by ${by}`);
  writeState(state);
  return { ok: true };
}
export function manualRollback(by: string, nowMs = Date.now()): { ok: boolean; error?: string; file?: CalibrationFile } {
  const cal = readCalibrationFile();
  if (!activeCalibration(cal)) return { ok: false, error: 'no active calibration' };
  const file = rollbackFrom(cal!, by, 'rollback', `manual rollback by ${by}`, nowMs);
  writeCalibration(file);
  const state = readState();
  note(state, 'rollback', `calibration → v${file.current} by ${by}`);
  writeState(state);
  return { ok: true, file };
}

// ─── schedule ────────────────────────────────────────────────────────────────

export async function scheduleLearningLoop(log: (m: string) => void): Promise<void> {
  if (!learningLoopEnabled()) { log('⏸️  [LEARNING] LEARNING_LOOP off'); return; }
  const cron = (await import('./guarded-cron')).default;
  const { runHeavy } = await import('./lib/heavy-job-gate');
  const ET = { timezone: 'America/New_York' };
  cron.schedule('*/15 9-16 * * 1-5', () => {
    void runHeavy('learning-ledger', () => ledgerPass(), { priority: 'low' })
      .then((r) => { if (r && (r.added || r.shadowed)) log(`📒 [LEARNING] ledger +${r.added} rows, ${r.shadowed} shadow decisions`); })
      .catch((e) => logger.error('[LEARNING] ledger pass failed', e));
  }, ET);
  cron.schedule('0 19 * * 1-5', () => {
    void runHeavy('learning-nightly', () => nightly(), { priority: 'low', maxWaitMs: 60 * 60_000 })
      .then((r) => { if (r) log(`📊 [LEARNING] nightly scorecard: ${r.rows} rows, ${r.decided} decided, ${r.drift} drift flags`); })
      .catch((e) => logger.error('[LEARNING] nightly failed', e));
  }, ET);
  cron.schedule('0 10 * * 6', () => {
    void runHeavy('learning-refit', () => weeklyRefit(), { priority: 'low', maxWaitMs: 60 * 60_000 })
      .then((r) => { if (r) log(`🔬 [LEARNING] weekly re-fit: ${r.tested} candidates, ${r.accepted.length} accepted${r.challenger ? ` → challenger ${r.challenger.id}` : ''}`); })
      .catch((e) => logger.error('[LEARNING] re-fit failed', e));
  }, ET);
  // Cold start: no scorecard yet → one nightly build so the admin page is not empty.
  if (!readShared('learning-scorecard')) {
    setTimeout(() => { void runHeavy('learning-nightly', () => nightly(), { priority: 'low', maxWaitMs: 60 * 60_000 }).catch(() => {}); }, 15 * 60_000).unref?.();
  }
  log('🧠 [LEARNING] ledger 15m (09–16 ET) · scorecard 19:00 ET weekdays · re-fit Sat 10:00 ET (never auto-promotes)');
}

// ─── routes ──────────────────────────────────────────────────────────────────

export function registerLearningRoutes(app: Express, requireAdmin: RequestHandler): void {
  app.get('/api/admin/learning', requireAdmin, async (_req, res) => {
    const sc = readShared<Scorecard>('learning-scorecard');
    const rf = readShared<RefitReport>('learning-refit');
    const { learningApplyEnabled } = await import('./learning-calibration');
    const cal = readCalibrationFile();
    const state = readState();
    res.json({
      scorecard: sc?.data ?? null, scorecardAsOf: sc?.writtenAt ?? null,
      refit: rf?.data ?? null, refitAsOf: rf?.writtenAt ?? null,
      state: { ...state, history: state.history.slice(-30).reverse() },
      gate: promotionGate(state.challenger, state.shadow),
      calibration: cal, active: activeCalibration(cal), incumbent: INCUMBENT,
      flags: { apply: learningApplyEnabled(), scorecard: scorecardEnabled(), shadow: shadowEnabled(), loop: learningLoopEnabled() },
    });
  });
  const actor = async (req: any) => (await import('./admin-audit')).auditActor(req);
  const audit = async (req: any, action: string, detail: Record<string, unknown>) => {
    try { (await import('./admin-audit')).appendAdminAudit({ action: action as any, actor: await actor(req), target: 'learning-loop', detail, ip: req.ip ?? null }); } catch { /* best effort */ }
  };
  app.post('/api/admin/learning/approve', requireAdmin, async (req, res) => {
    const r = approveChallenger(await actor(req));
    if (!r.ok) return res.status(409).json(r);
    await audit(req, 'learning.approve', { version: r.file?.current });
    res.json(r);
  });
  app.post('/api/admin/learning/reject', requireAdmin, async (req, res) => {
    const r = rejectChallenger(await actor(req));
    if (!r.ok) return res.status(409).json(r);
    await audit(req, 'learning.reject', {});
    res.json(r);
  });
  app.post('/api/admin/learning/rollback', requireAdmin, async (req, res) => {
    const r = manualRollback(await actor(req));
    if (!r.ok) return res.status(409).json(r);
    await audit(req, 'learning.rollback', { version: r.file?.current });
    res.json(r);
  });
}
