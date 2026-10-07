/**
 * OPTION PEAK + RUNNER JOB — light, never blocking (heavy gate, low priority).
 *
 *   peak pass    (weekdays 16:30 ET, and 09:15 ET to fill the prior day from Massive
 *                aggregates, which our plan serves for completed sessions only)
 *                · resolved option ideas of the last OPTION_PEAK_LOOKBACK_DAYS (default 5)
 *                  without a bar-basis peak → the contract's best print after entry
 *                  (0–2 DTE: through 16:00 ET of the exit session; longer: through the
 *                  exit) + the underlying's best print → `[peak:…]` tag in outcome_notes
 *                  (shared/option-peak.ts). No contract bars → intrinsic at the
 *                  underlying's best print, labelled 'intrinsic'.
 *                · closed bot option positions → the same peak in entry_signals.
 *   runner pass  (every 5 min 09:35–16:10 ET + inside the peak pass) — 0DTE ideas whose
 *                T1 half is booked (`[runner:open…]`, written by the outcome tracker
 *                when RUNNER_POLICY is on): the runner half is walked on the contract's
 *                1-minute bars (shared/runner-policy.ts, same machine as the replay).
 *                When it exits: exit_premium = BLENDED premium, option_percent_gain
 *                from it, `[runner:closed…]` tag, convergence_signals_json.runner keeps
 *                the T1-touch premium as its own field. outcome_status is never touched.
 *
 * Kill switch: OPTION_PEAK_JOB=off.
 */
import { logger } from './logger';
import { contractMinuteBars } from './option-bars-chain';
import {
  premiumPeakFromBars, underlyingPeakFromBars, intrinsicAt, withPeakTag, parsePeak, peakLine, withPeakSignal, readPeakSignal, type OptionPeak,
} from '@shared/option-peak';
import {
  buildRunnerTicks, parseRunner, readRunnerPolicy, runnerLine, runnerPath, runnerResume, summarizeRunner, withRunnerTag, type RunnerPlan,
} from '@shared/runner-policy';
import { etParts, etWallToMs } from '@shared/loss-rules';
import { readOracleExecutionAudit } from '@shared/oracle-lifecycle';
import { readPlanSnapshot } from '@shared/plan-snapshot';
import { daysToExpiry, sleeveOfPosition } from '@shared/bot-sleeves';
import { budgetContractEnabled, budgetLine, readBudgetContract, trackBudgetContract } from '@shared/budget-contract';

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const num = (x: unknown): number | null => (x == null || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null);
const r2 = (x: number) => Math.round(x * 100) / 100;
const BAR_LAG_MS = 16 * 60_000;

export interface PeakPassResult { ideas: number; ideaPeaks: number; positions: number; positionPeaks: number; pending: number; skipped: Record<string, number> }

function sessionBounds(ms: number) {
  const p = etParts(ms);
  return { day: p.dateKey, openMs: etWallToMs(p.y, p.m, p.d, 9 * 60 + 30), closeMs: etWallToMs(p.y, p.m, p.d, 16 * 60) };
}

/** Underlying 1m bars of one session (Yahoo via fetchCandles; extended hours dropped by the caller). */
async function underlyingBars(symbol: string, aroundMs: number, nowMs: number): Promise<Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>> {
  const { fetchCandles } = await import('./historical-candles');
  const ageDays = (nowMs - aroundMs) / 86_400_000;
  const [range, interval] = ageDays < 6 ? ['5d', '1m'] : ['1mo', '5m'];
  try {
    return (await fetchCandles(symbol.toUpperCase(), range, interval))
      .map((c) => ({ t: c.time * 1000, o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume ?? 0 }))
      .filter((b) => fin(b.t) && b.h > 0)
      .sort((a, b) => a.t - b.t);
  } catch { return []; }
}

const optSide = (t: unknown): 'call' | 'put' => (String(t ?? '').toLowerCase().startsWith('p') ? 'put' : 'call');

/** Entry instant of an idea: the trigger observer's pass when recorded (≥ publish), else publication. */
export function ideaEntryMs(i: { timestamp?: string | null; convergenceSignalsJson?: unknown }): number | null {
  const pub = Date.parse(String(i.timestamp ?? ''));
  if (!fin(pub)) return null;
  const a = readOracleExecutionAudit(i.convergenceSignalsJson);
  const trig = a?.triggerObservedAt ? Date.parse(a.triggerObservedAt) : NaN;
  return fin(trig) && trig >= pub ? trig : pub;
}

/** The peak of one contract over [fromMs, toMs): bars first, intrinsic at the underlying's best print as a labelled floor. */
export async function measurePeak(a: {
  symbol: string; expiry: string; optionType: 'call' | 'put'; strike: number; fromMs: number; toMs: number; window: 'to_exit' | 'to_eod'; nowMs: number;
}): Promise<OptionPeak | null> {
  const cb = await contractMinuteBars({ symbol: a.symbol, expiry: a.expiry, optionType: a.optionType, strike: a.strike, fromMs: a.fromMs, toMs: a.toMs, nowMs: a.nowMs });
  const ub = (await underlyingBars(a.symbol, a.fromMs, a.nowMs)).filter((b) => b.t >= a.fromMs && b.t < a.toMs);
  const dir = a.optionType === 'put' ? 'short' : 'long';
  const up = underlyingPeakFromBars(ub, dir, a.fromMs, a.toMs);
  const pk = premiumPeakFromBars(cb.bars, a.fromMs, a.toMs, 60_000);
  if (pk) return { premium: pk.premium, atMs: pk.atMs, basis: 'bar', source: cb.source, window: a.window, underlying: up?.price ?? null, underlyingAtMs: up?.atMs ?? null };
  if (up) {
    const intr = intrinsicAt(a.optionType, a.strike, up.price);
    if (intr != null && intr > 0) return { premium: intr, atMs: up.atMs, basis: 'intrinsic', source: 'underlying 1m', window: a.window, underlying: up.price, underlyingAtMs: up.atMs };
  }
  return null;
}

export async function runPeakPass(opts: { nowMs?: number; lookbackDays?: number; limit?: number; dryRun?: boolean } = {}): Promise<PeakPassResult> {
  const nowMs = opts.nowMs ?? Date.now();
  const lookbackDays = opts.lookbackDays ?? Math.max(1, Math.min(30, Number(process.env.OPTION_PEAK_LOOKBACK_DAYS ?? 5) || 5));
  const limit = opts.limit ?? Math.max(1, Math.min(300, Number(process.env.OPTION_PEAK_LIMIT ?? 60) || 60));
  const out: PeakPassResult = { ideas: 0, ideaPeaks: 0, positions: 0, positionPeaks: 0, pending: 0, skipped: {} };
  const skip = (k: string) => { out.skipped[k] = (out.skipped[k] ?? 0) + 1; };
  const { db } = await import('./db');
  const { tradeIdeas, paperPositions } = await import('@shared/schema');
  const { and, gte, ne, eq, or, isNull, notLike, desc } = await import('drizzle-orm');
  const since = new Date(nowMs - lookbackDays * 86_400_000).toISOString();

  // ── ideas ──
  const rows = await db.select().from(tradeIdeas).where(and(
    eq(tradeIdeas.assetType, 'option'), ne(tradeIdeas.outcomeStatus, 'open'), gte(tradeIdeas.exitDate, since),
    or(isNull(tradeIdeas.outcomeNotes), notLike(tradeIdeas.outcomeNotes, '%|bar|%|to_eod%')),
  )).orderBy(desc(tradeIdeas.exitDate)).limit(limit) as any[];
  out.ideas = rows.length;
  for (const i of rows) {
    try {
      const prev = parsePeak(i.outcomeNotes);
      if (prev?.basis === 'bar' && prev.window === 'to_eod') { skip('already_final'); continue; }
      if (String(i.resolutionReason ?? '').startsWith('missed_entry')) { skip('never_entered'); continue; }
      const snap = readPlanSnapshot(i.convergenceSignalsJson);
      const strike = num(snap?.strikePrice ?? i.strikePrice);
      const expiry = String(snap?.expiryDate ?? i.expiryDate ?? '').slice(0, 10);
      if (!(strike && strike > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) { skip('no_contract'); continue; }
      const entryMs = ideaEntryMs(i);
      const exitMs = Date.parse(String(i.exitDate ?? ''));
      if (entryMs == null || !fin(exitMs) || exitMs < entryMs) { skip('no_times'); continue; }
      const dte = daysToExpiry(expiry, entryMs);
      const short = dte != null && dte <= 2;
      const toMs = short ? Math.max(exitMs, sessionBounds(exitMs).closeMs) : exitMs;
      if (toMs > nowMs - BAR_LAG_MS) { out.pending++; continue; }
      const pk = await measurePeak({ symbol: i.symbol, expiry, optionType: optSide(snap?.optionType ?? i.optionType), strike, fromMs: entryMs, toMs, window: short ? 'to_eod' : 'to_exit', nowMs });
      if (!pk) { skip('no_bars'); continue; }
      const notes = withPeakTag(i.outcomeNotes, pk);
      if (notes === String(i.outcomeNotes ?? '')) { skip('no_improvement'); continue; }
      out.ideaPeaks++;
      if (!opts.dryRun) {
        await db.update(tradeIdeas).set({ outcomeNotes: notes } as any).where(eq(tradeIdeas.id, i.id));
        const line = peakLine(parsePeak(notes), num(i.exitPremium));
        if (line && pk.basis === 'bar') void import('./discord-lifecycle').then((m) => m.onIdeaFollowUp({ ideaId: i.id, key: 'peak', line: `${line} (contract bars, ${pk.window === 'to_eod' ? 'through 16:00' : 'to the exit'})` })).catch(() => {});
      }
    } catch (err) {
      skip('error');
      logger.warn(`[OPTION-PEAK] idea ${i.symbol} ${i.id}: ${(err as Error).message}`);
    }
  }

  // ── bot positions ──
  const pos = await db.select().from(paperPositions).where(and(
    eq(paperPositions.assetType, 'option'), eq(paperPositions.status, 'closed'), gte(paperPositions.exitTime, since),
  )).orderBy(desc(paperPositions.exitTime)).limit(limit) as any[];
  out.positions = pos.length;
  for (const p of pos) {
    try {
      const prev = readPeakSignal(p.entrySignals);
      if (prev?.basis === 'bar' && prev.window === 'to_eod') { skip('pos_already_final'); continue; }
      const entryMs = Date.parse(String(p.entryTime ?? ''));
      const exitMs = Date.parse(String(p.exitTime ?? ''));
      const expiry = String(p.expiryDate ?? '').slice(0, 10);
      if (!fin(entryMs) || !fin(exitMs) || !(Number(p.strikePrice) > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) { skip('pos_no_contract'); continue; }
      const zero = sleeveOfPosition(p) === '0dte';
      const toMs = zero ? Math.max(exitMs, sessionBounds(exitMs).closeMs) : exitMs;
      if (toMs > nowMs - BAR_LAG_MS) { out.pending++; continue; }
      const pk = await measurePeak({ symbol: p.symbol, expiry, optionType: optSide(p.optionType), strike: Number(p.strikePrice), fromMs: entryMs, toMs, window: zero ? 'to_eod' : 'to_exit', nowMs });
      if (!pk) { skip('pos_no_bars'); continue; }
      const sig = withPeakSignal(p.entrySignals, pk);
      if (sig == null || sig === p.entrySignals) { skip('pos_no_improvement'); continue; }
      out.positionPeaks++;
      if (!opts.dryRun) await db.update(paperPositions).set({ entrySignals: sig } as any).where(eq(paperPositions.id, p.id));
    } catch (err) {
      skip('pos_error');
      logger.warn(`[OPTION-PEAK] position ${p.symbol} ${p.id}: ${(err as Error).message}`);
    }
  }
  return out;
}

export interface RunnerPassResult { open: number; closed: number; stillOpen: number; skipped: Record<string, number> }

/** Walk every booked-T1 runner on its contract's bars; close the ones whose exit printed. */
export async function runRunnerPass(opts: { nowMs?: number; dryRun?: boolean } = {}): Promise<RunnerPassResult> {
  const nowMs = opts.nowMs ?? Date.now();
  const out: RunnerPassResult = { open: 0, closed: 0, stillOpen: 0, skipped: {} };
  const skip = (k: string) => { out.skipped[k] = (out.skipped[k] ?? 0) + 1; };
  const cfg = { ...readRunnerPolicy(process.env), on: true };
  const { db } = await import('./db');
  const { tradeIdeas } = await import('@shared/schema');
  const { and, eq, like } = await import('drizzle-orm');
  const rows = await db.select().from(tradeIdeas).where(and(
    eq(tradeIdeas.outcomeStatus, 'hit_target'), like(tradeIdeas.outcomeNotes, '%[runner:open%'),
  )).limit(50) as any[];
  out.open = rows.length;
  for (const i of rows) {
    try {
      const rec = parseRunner(i.outcomeNotes);
      if (!rec || rec.state !== 'open') { skip('no_open_tag'); continue; }
      const snap = readPlanSnapshot(i.convergenceSignalsJson);
      const E = num(snap?.entryPremium ?? i.entryPremium);
      const strike = num(snap?.strikePrice ?? i.strikePrice);
      const expiry = String(snap?.expiryDate ?? i.expiryDate ?? '').slice(0, 10);
      if (!(E && E > 0) || !(strike && strike > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) { skip('no_contract'); continue; }
      const side = optSide(snap?.optionType ?? i.optionType);
      const entryMs = ideaEntryMs(i) ?? rec.t1AtMs;
      const { openMs, closeMs } = sessionBounds(rec.t1AtMs);
      const dataEnd = Math.min(closeMs, nowMs - BAR_LAG_MS);
      if (dataEnd <= rec.t1AtMs) { out.stillOpen++; continue; }
      const cb = await contractMinuteBars({ symbol: i.symbol, expiry, optionType: side, strike, fromMs: Math.min(entryMs, rec.t1AtMs), toMs: dataEnd, nowMs });
      if (!cb.bars.length) { out.stillOpen++; skip('no_contract_bars'); continue; }
      const ub = (await underlyingBars(i.symbol, rec.t1AtMs, nowMs)).filter((b) => b.t >= openMs && b.t < dataEnd);
      if (!ub.length) { out.stillOpen++; skip('no_underlying_bars'); continue; }
      const plan: RunnerPlan = { dir: side === 'put' ? 'short' : 'long', entryPremium: E, uStop: null, uT1: null };
      const pre = premiumPeakFromBars(cb.bars, entryMs, rec.t1AtMs + 60_000, 60_000);
      const from = runnerResume(plan, { premium: rec.t1ExitPremium, atMs: rec.t1AtMs }, cfg, pre);
      // The runner starts on the bar AFTER the T1 touch bar.
      const ticks = buildRunnerTicks(cb.bars, ub, Math.floor(rec.t1AtMs / 60_000) * 60_000 + 60_000, dataEnd, openMs, (ms) => etParts(ms).minutes);
      const sessionDone = nowMs - BAR_LAG_MS >= closeMs;
      const s = runnerPath(ticks, plan, cfg, 'runner', { from, endFill: sessionDone });
      const sum = summarizeRunner(s);
      if (!sum.closed || sum.blendedPremium == null) { out.stillOpen++; continue; }
      out.closed++;
      if (opts.dryRun) continue;
      const blend = r2(sum.blendedPremium);
      const notes = withRunnerTag(i.outcomeNotes, {
        state: 'closed', t1ExitPremium: rec.t1ExitPremium, t1AtMs: rec.t1AtMs, stop: E,
        runnerExitPremium: sum.runnerExitPremium, runnerAtMs: sum.runnerAtMs, runnerWhy: `${sum.runnerWhy ?? 'exit'} · ${cb.source}`, blendedPremium: blend,
      });
      const csj = (i.convergenceSignalsJson && typeof i.convergenceSignalsJson === 'object') ? i.convergenceSignalsJson : {};
      await db.update(tradeIdeas).set({
        exitPremium: blend,
        optionPercentGain: r2(((blend - E) / E) * 100),
        outcomeNotes: notes,
        convergenceSignalsJson: {
          ...csj,
          runner: {
            policy: 'runner-v1', trailPct: cfg.trailPct, partialFrac: cfg.partialFrac,
            t1ExitPremium: rec.t1ExitPremium, t1At: new Date(rec.t1AtMs).toISOString(),
            runnerExitPremium: sum.runnerExitPremium, runnerAt: sum.runnerAtMs ? new Date(sum.runnerAtMs).toISOString() : null,
            runnerWhy: sum.runnerWhy, blendedPremium: blend, barSource: cb.source,
          },
        },
      } as any).where(and(eq(tradeIdeas.id, i.id), eq(tradeIdeas.outcomeStatus, 'hit_target')));
      const rl = runnerLine(parseRunner(notes));
      if (rl) void import('./discord-lifecycle').then((m) => m.onIdeaFollowUp({ ideaId: i.id, key: 'runner', line: `runner closed · ${rl}` })).catch(() => {});
    } catch (err) {
      skip('error');
      logger.warn(`[RUNNER] ${i.symbol} ${i.id}: ${(err as Error).message}`);
    }
  }
  return out;
}

export interface BudgetPassResult { ideas: number; updated: number; skipped: Record<string, number> }

/**
 * BUDGET CONTRACT pass (shared/budget-contract.ts): every idea carrying
 * convergenceSignalsJson.budgetContract, published in the lookback, is followed
 * on the budget contract's OWN 1-minute bars from entry: peak (MFE) and the first
 * touch of its premium T1 / T2 / stop. Written back into
 * convergenceSignalsJson.budgetContract.tracking — the primary's outcome is never
 * touched. Runs intraday (live status) and after the close.
 */
export async function runBudgetPass(opts: { nowMs?: number; lookbackDays?: number; limit?: number; dryRun?: boolean } = {}): Promise<BudgetPassResult> {
  const nowMs = opts.nowMs ?? Date.now();
  const out: BudgetPassResult = { ideas: 0, updated: 0, skipped: {} };
  if (!budgetContractEnabled(process.env)) return out;
  const skip = (k: string) => { out.skipped[k] = (out.skipped[k] ?? 0) + 1; };
  const lookbackDays = opts.lookbackDays ?? Math.max(1, Math.min(30, Number(process.env.OPTION_PEAK_LOOKBACK_DAYS ?? 5) || 5));
  const { db } = await import('./db');
  const { tradeIdeas } = await import('@shared/schema');
  const { and, gte, eq, sql, desc } = await import('drizzle-orm');
  const since = new Date(nowMs - lookbackDays * 86_400_000).toISOString();
  const rows = await db.select().from(tradeIdeas).where(and(
    eq(tradeIdeas.assetType, 'option'), gte(tradeIdeas.timestamp, since),
    sql`${tradeIdeas.convergenceSignalsJson} ? 'budgetContract'`,
  )).orderBy(desc(tradeIdeas.timestamp)).limit(opts.limit ?? 100) as any[];
  out.ideas = rows.length;
  for (const i of rows) {
    try {
      const bc = readBudgetContract(i.convergenceSignalsJson);
      if (!bc) { skip('unreadable'); continue; }
      const fin0 = bc.tracking?.outcome;
      if ((fin0 === 'hit_t2' || fin0 === 'hit_stop' || fin0 === 'expired') && bc.tracking?.peak) { skip('final'); continue; }
      if (String(i.resolutionReason ?? '').startsWith('missed_entry')) { skip('never_entered'); continue; }
      const entryMs = ideaEntryMs(i);
      if (entryMs == null) { skip('no_times'); continue; }
      const expiryClose = sessionBounds(Date.parse(`${bc.expiry}T16:00:00Z`)).closeMs;
      const toMs = Math.min(nowMs - BAR_LAG_MS, expiryClose);
      if (toMs <= entryMs) { skip('pending'); continue; }
      const cb = await contractMinuteBars({ symbol: bc.symbol, expiry: bc.expiry, optionType: bc.optionType, strike: bc.strike, fromMs: entryMs, toMs, nowMs });
      if (!cb.bars.length) { skip('no_bars'); continue; }
      const prevT = bc.tracking ?? {};
      const tr = trackBudgetContract(bc, cb.bars, entryMs, toMs, cb.source, nowMs);
      if (JSON.stringify({ ...tr, updatedAt: 0, lastMark: 0, lastMarkAt: 0 }) === JSON.stringify({ ...prevT, updatedAt: 0, lastMark: 0, lastMarkAt: 0 }) && prevT.lastMarkAt === tr.lastMarkAt) { skip('no_change'); continue; }
      out.updated++;
      if (opts.dryRun) continue;
      const csj = (i.convergenceSignalsJson && typeof i.convergenceSignalsJson === 'object') ? i.convergenceSignalsJson : {};
      await db.update(tradeIdeas).set({ convergenceSignalsJson: { ...csj, budgetContract: { ...bc, tracking: tr } } } as any).where(eq(tradeIdeas.id, i.id));
      const line = budgetLine({ ...bc, tracking: tr });
      if (line && tr.t1HitAt != null && prevT.t1HitAt == null) void import('./discord-lifecycle').then((m) => m.onIdeaFollowUp({ ideaId: i.id, key: 'budget_t1', line })).catch(() => {});
      else if (line && tr.stopHitAt != null && prevT.stopHitAt == null && tr.t1HitAt == null) void import('./discord-lifecycle').then((m) => m.onIdeaFollowUp({ ideaId: i.id, key: 'budget_stop', line })).catch(() => {});
    } catch (err) {
      skip('error');
      logger.warn(`[BUDGET] idea ${i.symbol} ${i.id}: ${(err as Error).message}`);
    }
  }
  return out;
}

/** Worker registration (server/background-jobs.ts). */
export async function scheduleOptionPeakJob(log: (m: string) => void): Promise<void> {
  const cron = (await import('./guarded-cron')).default;
  const { runHeavy } = await import('./lib/heavy-job-gate');
  const peak = async (why: string) => {
    try {
      const rr = await runHeavy('runner-pass', () => runRunnerPass(), { priority: 'low' });
      if (rr && (rr.open || rr.closed)) logger.info(`[RUNNER] ${why}: ${rr.open} open · closed ${rr.closed} · still open ${rr.stillOpen} · ${JSON.stringify(rr.skipped)}`);
      const r = await runHeavy('option-peak', () => runPeakPass(), { priority: 'low' });
      const b = await runHeavy('budget-pass', () => runBudgetPass(), { priority: 'low' });
      if (b && (b.ideas || b.updated)) logger.info(`[BUDGET] ${why}: ${b.ideas} ideas · updated ${b.updated} · ${JSON.stringify(b.skipped)}`);
      if (r) logger.info(`[OPTION-PEAK] ${why}: ideas ${r.ideas} → peaks ${r.ideaPeaks} · positions ${r.positions} → peaks ${r.positionPeaks} · pending ${r.pending} · skipped ${JSON.stringify(r.skipped)}`);
    } catch (err) {
      logger.error('[OPTION-PEAK] pass failed:', err);
    }
  };
  cron.schedule('30 16 * * 1-5', () => peak('after close'), { timezone: 'America/New_York' });
  cron.schedule('15 9 * * 1-5', () => peak('morning (prior-day Massive aggs)'), { timezone: 'America/New_York' });
  cron.schedule('*/5 9-16 * * 1-5', async () => {
    const m = etParts(Date.now()).minutes;
    if (m < 9 * 60 + 35 || m > 16 * 60 + 10) return;
    try {
      const rr = await runHeavy('runner-pass', () => runRunnerPass(), { priority: 'low' });
      if (rr?.closed) logger.info(`[RUNNER] closed ${rr.closed} runner(s) · still open ${rr.stillOpen}`);
      if (m % 15 === 5) { // budget contract live status every 15 min (light: cached bars, ≤100 ideas)
        const b = await runHeavy('budget-pass', () => runBudgetPass(), { priority: 'low' });
        if (b?.updated) logger.info(`[BUDGET] intraday: updated ${b.updated} of ${b.ideas}`);
      }
    } catch (err) { logger.warn('[RUNNER] intraday pass failed:', err); }
  }, { timezone: 'America/New_York' });
  log('🏔️  Option peak job scheduled — 16:30 ET + 09:15 ET peak backfill (Massive prior-day → Alpaca → Yahoo); runner pass every 5 min in session');
}
