/**
 * GRADE v3 INPUTS — the measured quality inputs (shared/nexus-grade.ts GradeV3Inputs) for
 * every board pick, under GRADE_VERSION=v3 only.
 *
 * Measured ONCE per idea at first board surfacing (≈ publish) from completed daily bars
 * (server/market-data-fallback.ts getBars: Polygon grouped-daily → Yahoo) and the board's
 * price, persisted to trade_ideas.convergence_signals_json.gradeInputs (never overwritten),
 * and carried on the pick so the client, bot, alerts and Discord all grade from the same
 * numbers. research/grade-v3-study.ts derives the same fields with the same pure function
 * (gradeV3InputsFrom).
 *
 * A pick whose inputs could not be measured this build still carries an all-null inputs
 * object (so every surface grades it v3, conservatively) and is retried next build — only a
 * read with an ATR is persisted.
 */
import { inArray, sql } from 'drizzle-orm';
import { gradeV3InputsFrom, readGradeInputs, type GradeV3Inputs } from '@shared/nexus-grade';
import { etDayMinute, type DayBar } from '@shared/setup-features';
import { logger } from './logger';

const MAX_MEMO = 2000;
const BUILD_BUDGET_MS = 8000;
const BAR_TTL_MS = 30 * 60_000;

const inputsMemo = new Map<string, GradeV3Inputs>();
const barsMemo = new Map<string, { at: number; bars: DayBar[] }>();

export interface StampablePick {
  ideaId: string; symbol: string; direction: string; assetType?: string | null; levelBasis?: 'contract' | 'underlying';
  entryPrice: number; stopLoss: number; strikePrice?: number | null; currentPrice?: number | null;
  gradeInputs?: GradeV3Inputs | null;
}

/** Daily bars from getBars → DayBar keyed by ET session day. */
export function toDayBars(bars: Array<{ date: Date; open: number; high: number; low: number; close: number; volume: number }>): DayBar[] {
  return bars
    .filter((b) => b && b.date instanceof Date && Number.isFinite(b.close) && b.high > 0)
    .map((b) => ({ day: etDayMinute(b.date.getTime() + 6 * 3600_000).day, o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume ?? 0 }));
}

/** Plan levels are on the underlying (not option premium)? Mirrors the convictions engine's levelBasis rule. */
export function levelsOnUnderlying(p: Pick<StampablePick, 'assetType' | 'levelBasis' | 'entryPrice' | 'strikePrice'>): boolean {
  if (p.levelBasis) return p.levelBasis === 'underlying';
  if (String(p.assetType ?? '') !== 'option') return true;
  const k = Number(p.strikePrice);
  return !(Number.isFinite(k) && k > 0 && p.entryPrice < k * 0.5);
}

async function dailyBars(symbol: string): Promise<DayBar[]> {
  const key = symbol.toUpperCase();
  const hit = barsMemo.get(key);
  if (hit && Date.now() - hit.at < BAR_TTL_MS) return hit.bars;
  const { getBars } = await import('./market-data-fallback');
  const bars = toDayBars(await getBars(key, 90));
  barsMemo.set(key, { at: Date.now(), bars });
  return bars;
}

const emptyInputs = (atMs: number): GradeV3Inputs => ({ v: 'v3', at: new Date(atMs).toISOString(), atr: null, stopAtr: null, chaseAtr: null, regime: null, gapAtr: null });

/** Measure one pick now (pure given bars). */
export function measurePick(p: StampablePick, daily: DayBar[], spyDaily: DayBar[], atMs: number): GradeV3Inputs {
  return gradeV3InputsFrom({
    direction: p.direction, entry: Number(p.entryPrice), stop: Number(p.stopLoss),
    price: p.currentPrice != null && Number(p.currentPrice) > 0 ? Number(p.currentPrice) : null,
    atMs, levelsUnderlying: levelsOnUnderlying(p), daily, spyDaily, crypto: String(p.assetType ?? '') === 'crypto',
  });
}

/** Attach `gradeInputs` to every pick (persisted first measure → memo → measure now). Never throws. */
export async function stampGradeInputs(picks: StampablePick[], nowMs: number = Date.now()): Promise<void> {
  const started = Date.now();
  try {
    const missing = picks.filter((p) => p.ideaId && !inputsMemo.has(p.ideaId)).map((p) => p.ideaId);
    if (missing.length) {
      try {
        const { db } = await import('./db');
        const { tradeIdeas } = await import('@shared/schema');
        const rows = await db.select({ id: tradeIdeas.id, csj: tradeIdeas.convergenceSignalsJson }).from(tradeIdeas).where(inArray(tradeIdeas.id, missing));
        for (const r of rows) {
          const gi = readGradeInputs((r.csj as any)?.gradeInputs);
          if (gi) inputsMemo.set(r.id, gi);
        }
      } catch (e: any) { logger.debug(`[GRADE-V3] persisted inputs read failed: ${e?.message ?? e}`); }
    }
    const todo = picks.filter((p) => p.ideaId && !inputsMemo.has(p.ideaId));
    if (todo.length) {
      const spy = await dailyBars('SPY').catch(() => [] as DayBar[]);
      for (const p of todo) {
        if (Date.now() - started > BUILD_BUDGET_MS) break;
        const daily = await dailyBars(p.symbol).catch(() => [] as DayBar[]);
        const gi = measurePick(p, daily, spy, nowMs);
        if (gi.atr == null) continue; // unmeasured: retry next build, do not persist
        if (inputsMemo.size >= MAX_MEMO) inputsMemo.delete(inputsMemo.keys().next().value as string);
        inputsMemo.set(p.ideaId, gi);
        void persist(p.ideaId, gi);
      }
    }
  } catch (e: any) {
    logger.debug(`[GRADE-V3] stamping failed: ${e?.message ?? e}`);
  }
  for (const p of picks) p.gradeInputs = inputsMemo.get(p.ideaId) ?? emptyInputs(nowMs);
}

async function persist(ideaId: string, gi: GradeV3Inputs): Promise<void> {
  try {
    const { db } = await import('./db');
    await db.execute(sql`update trade_ideas
      set convergence_signals_json = coalesce(convergence_signals_json, '{}'::jsonb) || jsonb_build_object('gradeInputs', ${JSON.stringify(gi)}::jsonb)
      where id = ${ideaId} and not (coalesce(convergence_signals_json, '{}'::jsonb) ? 'gradeInputs')`);
  } catch { /* telemetry only */ }
}

/** Test hook. */
export function _resetGradeInputsMemo(): void { inputsMemo.clear(); barsMemo.clear(); }
