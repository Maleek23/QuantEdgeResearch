/**
 * RUN-UP TRACKER — server side of shared/run-up.ts.
 *
 * For each published idea since OUTCOME_BASELINE_DATE that actually TRIGGERED,
 * compute from real bars after the trigger: best favourable excursion % on the
 * underlying, and whether +3 / +5 / +10 % was reached BEFORE the stop.
 * This is a separately-labelled number ("not the win rate"); it never feeds
 * classifyOutcomeV2 or the model record's win/loss counts.
 *
 * Population + trigger rule: shared/run-up.ts (inRunUpPopulation, resolveTrigger)
 * — the same code research/replay-tp5.ts uses.
 *
 * Bounded: results live in a BoundedCache; the summary never fetches inline —
 * it returns what is cached and kicks ONE background pass of at most 25 ideas,
 * so the model-record route stays fast and the droplet never fans out. Bars
 * come from exit-time-bars.ts (provider cache coalesces per symbol).
 */
import { BoundedCache } from './bounded-cache';
import { barsSinceEntry } from './exit-time-bars';
import type { TimedBar } from '@shared/exit-hit-time';
import { logger } from '../logger';
import { OUTCOME_BASELINE_DATE } from '@shared/constants';
import {
  computeRunUp, inRunUpPopulation, resolveTrigger, summarizeRunUps, thresholdHit, underlyingDirection,
  type RunUpBar, type RunUpIdea, type RunUpResult, type RunUpSummary,
} from '@shared/run-up';

export const RUN_UP_BATCH = 25;

export interface IdeaRunUp {
  ideaId: string;
  symbol: string;
  triggered: boolean;
  triggerMs: number | null;
  triggerSource: 'audit' | 'bars' | null;
  result: RunUpResult | null;
  bestPct: number | null;
  reached5BeforeStop: boolean;
  computedAt: string;
  barInterval: string | null;
  note?: string;
}

interface Entry { at: number; v: IdeaRunUp }
const cache = new BoundedCache<string, Entry>({ name: 'run-up', maxEntries: 800, ttlMs: 6 * 3600_000, noSizing: true });
const OPEN_TTL = 10 * 60_000;
const ms = (s?: string | null) => (s ? Date.parse(s) : NaN);

/**
 * Bars via server/lib/exit-time-bars.ts (the exit-dates helper): 5m when the
 * history reaches back to entry, else daily; equities regular-session only;
 * crypto 24h; futures none. Same provider cache, so a sweep costs one fetch per symbol.
 */
async function barsFor(i: RunUpIdea, fromMs: number): Promise<{ bars: RunUpBar[]; interval: string | null }> {
  const { bars, interval } = await barsSinceEntry(i.symbol, i.assetType, fromMs);
  return {
    bars: bars.map((b: TimedBar) => ({ t: b.time * 1000, open: b.open ?? b.close, high: b.high, low: b.low, close: b.close })),
    interval,
  };
}

export async function computeIdeaRunUp(i: RunUpIdea): Promise<IdeaRunUp> {
  const base = { ideaId: i.id, symbol: i.symbol, computedAt: new Date().toISOString() };
  const none = (note: string, interval: string | null = null, trig: { ms: number; source: 'audit' | 'bars' } | null = null): IdeaRunUp =>
    ({ ...base, triggered: !!trig, triggerMs: trig?.ms ?? null, triggerSource: trig?.source ?? null, result: null, bestPct: null, reached5BeforeStop: false, barInterval: interval, note });
  if (!inRunUpPopulation(i)) return none('not in the run-up population (before baseline, excluded, never triggered, or premium-scale barriers)');
  const closed = (i.outcomeStatus ?? 'open') !== 'open';
  const endMs = closed && Number.isFinite(ms(i.exitDate)) ? ms(i.exitDate) + 1 : Date.now();
  const auditTrig = resolveTrigger(i, [], endMs);
  const { bars, interval } = await barsFor(i, auditTrig?.ms ?? ms(i.timestamp));
  if (!bars.length) return none('no bars from the candle source', interval, auditTrig);
  const trig = auditTrig ?? resolveTrigger(i, bars, endMs);
  if (!trig) return none('entry never traded after publish', interval);
  const result = computeRunUp({ direction: underlyingDirection(i.direction), entry: i.entryPrice, stop: i.stopLoss, triggerMs: trig.ms, endMs, bars });
  if (result.barsUsed === 0) return none('triggered, no bars after the trigger yet', interval, trig);
  return { ...base, triggered: true, triggerMs: trig.ms, triggerSource: trig.source, result, bestPct: result.mfePct, reached5BeforeStop: thresholdHit(result, 5), barInterval: interval };
}

function fresh(i: RunUpIdea): IdeaRunUp | null {
  const e = cache.get(i.id);
  if (!e) return null;
  const live = (i.outcomeStatus ?? 'open') === 'open' && !e.v.result?.stopHit;
  if (live && Date.now() - e.at > OPEN_TTL) return null;
  return e.v;
}

/** One idea (NEXUS detail) — cached, computed on demand. */
export async function getIdeaRunUp(i: RunUpIdea): Promise<IdeaRunUp> {
  const hit = fresh(i);
  if (hit) return hit;
  const v = await computeIdeaRunUp(i);
  cache.set(i.id, { at: Date.now(), v });
  return v;
}

let passRunning = false;
/** Compute up to RUN_UP_BATCH missing/stale ideas, sequentially. */
async function runPass(ideas: RunUpIdea[]): Promise<void> {
  if (passRunning) return;
  passRunning = true;
  try {
    for (const i of ideas.slice(0, RUN_UP_BATCH)) {
      try { cache.set(i.id, { at: Date.now(), v: await computeIdeaRunUp(i) }); }
      catch (e) { logger.warn(`[run-up] ${i.symbol} ${i.id}: ${(e as Error).message}`); }
    }
  } finally { passRunning = false; }
}

/**
 * Summary for the model record. Never fetches inline: returns the cached
 * results and schedules one bounded background pass for the rest.
 */
export function getRunUpSummary(all: RunUpIdea[]): RunUpSummary {
  const done: RunUpResult[] = [];
  const missing: RunUpIdea[] = [];
  for (const i of all) {
    if (!inRunUpPopulation(i)) continue;
    const v = fresh(i);
    if (!v) { missing.push(i); continue; }
    if (v.triggered && v.result) done.push(v.result);
  }
  // Oldest first so closed ideas (stable results) fill in before live ones churn.
  missing.sort((a, b) => ms(a.timestamp) - ms(b.timestamp));
  if (missing.length) void runPass(missing);
  return summarizeRunUps(done, OUTCOME_BASELINE_DATE, missing.length);
}
