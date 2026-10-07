/**
 * AFTER-STOP JOB — after the close, record what every stopped-out idea did next
 * inside its own holding window (shared/after-stop.ts). Light by design:
 *   · weekdays 16:40 ET (worker, guarded cron), one pass, ≤ AFTER_STOP_LIMIT ideas (default 40)
 *   · only stop-outs closed in the last AFTER_STOP_LOOKBACK_DAYS (default 15) with no final verdict yet
 *   · one 5-minute Yahoo series per symbol per pass (fetchCandles cache), no option chains
 *   · writes ONE tag to outcome_notes — `[after-stop:t1@…]` / `[after-stop:entry@…]` / `[after-stop:none]` —
 *     guarded on outcome_status still being a stop-out. Status, P&L and the win rate are never touched.
 * A verdict is written only when final: T1 as soon as it printed; 'entry' / 'none' once the
 * window is complete. Undecided ideas are simply tried again the next evening.
 *
 * The bar logic is research/losers-later.ts's (afterClose / firstStopBar, now in shared/after-stop.ts),
 * so the nightly numbers and the research report agree by construction.
 *
 * Kill switch: AFTER_STOP_JOB=off.
 */
import { logger } from './logger';
import {
  afterClose, firstStopBar, holdEndFor, classifyAfterStop, withAfterStopTag, parseAfterStop, isStoppedOut, type Bar, type Dir,
} from '@shared/after-stop';
import { readPlanSnapshot } from '@shared/plan-snapshot';
import { resolveTrigger, type RunUpBar } from '@shared/run-up';
import { isOptionScaleIncoherent } from '@shared/option-unit-guard';
import { optionSideOf } from '@shared/option-value-bounds';
import { isSyntheticOutcome } from '@shared/model-record';
import { etParts } from '@shared/loss-rules';

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const num = (x: unknown): number | null => (x == null || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null);
const STOP_STATUSES = ['hit_stop', 'stopped_out'];

export interface AfterStopPassResult { candidates: number; written: number; t1: number; entry: number; none: number; pending: number; skipped: Record<string, number> }

const rth = (b: Bar) => { const m = etParts(b.t).minutes; return m >= 570 && m < 960; };
const widthOf = (bars: Bar[]) => {
  const ds = bars.slice(1, 50).map((b, i) => b.t - bars[i].t).filter((d) => d > 0).sort((a, b) => a - b);
  return ds[0] ?? 5 * 60_000;
};

/** One pass. Pure inputs from the DB row + bars; the only write is the outcome_notes tag. */
export async function runAfterStopPass(opts: { nowMs?: number; limit?: number; lookbackDays?: number; dryRun?: boolean } = {}): Promise<AfterStopPassResult> {
  const nowMs = opts.nowMs ?? Date.now();
  const limit = opts.limit ?? Math.max(1, Math.min(500, Number(process.env.AFTER_STOP_LIMIT ?? 40) || 40));
  const lookbackDays = opts.lookbackDays ?? Math.max(1, Math.min(60, Number(process.env.AFTER_STOP_LOOKBACK_DAYS ?? 15) || 15));
  const out: AfterStopPassResult = { candidates: 0, written: 0, t1: 0, entry: 0, none: 0, pending: 0, skipped: {} };
  const skip = (k: string) => { out.skipped[k] = (out.skipped[k] ?? 0) + 1; };

  const { db } = await import('./db');
  const { tradeIdeas } = await import('@shared/schema');
  const { and, gte, inArray, or, isNull, notLike, eq, desc } = await import('drizzle-orm');
  const since = new Date(nowMs - lookbackDays * 86_400_000).toISOString();
  const rows = await db.select().from(tradeIdeas).where(and(
    inArray(tradeIdeas.outcomeStatus, STOP_STATUSES as any),
    gte(tradeIdeas.exitDate, since),
    or(isNull(tradeIdeas.outcomeNotes), notLike(tradeIdeas.outcomeNotes, '%[after-stop:%')),
  )).orderBy(desc(tradeIdeas.exitDate)).limit(limit) as any[];
  out.candidates = rows.length;
  if (!rows.length) return out;

  const { fetchCandles } = await import('./historical-candles');
  const barsMemo = new Map<string, Bar[]>();
  const barsFor = async (symbol: string, assetType: string): Promise<Bar[]> => {
    const k = `${symbol.toUpperCase()}:${assetType === 'crypto' ? 'c' : 'e'}`;
    if (barsMemo.has(k)) return barsMemo.get(k)!;
    let bars: Bar[] = [];
    try {
      bars = (await fetchCandles(symbol, '1mo', '5m'))
        .map((c) => ({ t: c.time * 1000, o: c.open, h: c.high, l: c.low, c: c.close }))
        .filter((b) => fin(b.t) && b.h > 0)
        .sort((a, b) => a.t - b.t);
      if (assetType !== 'crypto') bars = bars.filter(rth);
    } catch { bars = []; }
    barsMemo.set(k, bars);
    return bars;
  };

  for (const i of rows) {
    if (!isStoppedOut(i.outcomeStatus) || parseAfterStop(i.outcomeNotes)) { skip('already_final'); continue; }
    if (i.excludeFromTraining || isSyntheticOutcome(i)) { skip('excluded'); continue; }
    const snap = readPlanSnapshot(i.convergenceSignalsJson);
    const entry = num(snap?.entryPrice ?? i.entryPrice);
    const stop = num(snap?.stopLoss ?? i.stopLoss);
    const target = num(snap?.targetPrice ?? i.targetPrice);
    const option = i.assetType === 'option';
    const optType = snap?.optionType ?? i.optionType;
    const strike = num(snap?.strikePrice ?? i.strikePrice);
    const expiry = snap?.expiryDate ?? i.expiryDate;
    if (!(entry && entry > 0) || !(stop && stop > 0) || !(target && target > 0)) { skip('no_levels'); continue; }
    if (isOptionScaleIncoherent({ assetType: i.assetType, entryPrice: entry, strikePrice: strike } as any)) { skip('option_levels_on_premium_scale'); continue; }
    const dir: Dir = option ? (optionSideOf(optType) === 'put' ? 'short' : 'long') : String(snap?.direction ?? i.direction) === 'short' ? 'short' : 'long';

    const bars = await barsFor(i.symbol, i.assetType);
    if (!bars.length) { skip('no_bars'); continue; }
    const pubMs = Date.parse(String(i.timestamp ?? ''));
    const exitMs = Date.parse(String(i.exitDate ?? ''));
    if (!fin(pubMs) || !fin(exitMs)) { skip('no_times'); continue; }
    const ref = bars.find((b) => b.t >= pubMs) ?? bars[bars.length - 1];
    if (Math.abs(entry / ref.c - 1) > 0.25) { skip('entry_off_underlying'); continue; }

    const runUpBars: RunUpBar[] = bars.map((b) => ({ t: b.t, open: b.o, high: b.h, low: b.l, close: b.c }));
    const trig = resolveTrigger({ id: i.id, symbol: i.symbol, entryPrice: entry, stopLoss: stop, timestamp: i.timestamp, entryValidUntil: i.entryValidUntil, convergenceSignalsJson: i.convergenceSignalsJson } as any, runUpBars, exitMs + 1);
    const anchor = trig?.ms ?? pubMs;
    const holdEnd = holdEndFor({ anchorMs: anchor, publishedMs: pubMs, holdingPeriod: i.holdingPeriod, expiryDate: expiry, exitBy: i.exitBy, isOption: option });
    const w = widthOf(bars);
    const sb = firstStopBar(bars, dir, stop, trig?.ms ?? pubMs, exitMs + w);
    const closeMs = sb ? sb.t + w : exitMs;
    const dataEndMs = Math.min(nowMs - 16 * 60_000, bars[bars.length - 1].t + w);
    const a = afterClose({ dir, entry, stop, target, closeMs, holdEndMs: holdEnd, weekEndMs: holdEnd, dataEndMs, bars });
    const v = classifyAfterStop(a);
    if (!v) { out.pending++; continue; }
    out[v.kind]++;
    if (opts.dryRun) continue;
    try {
      const { db: d } = await import('./db');
      await d.update(tradeIdeas)
        .set({ outcomeNotes: withAfterStopTag(i.outcomeNotes, v) } as any)
        .where(and(eq(tradeIdeas.id, i.id), inArray(tradeIdeas.outcomeStatus, STOP_STATUSES as any)));
      out.written++;
    } catch (err) {
      skip('write_failed');
      logger.warn(`[AFTER-STOP] ${i.symbol} ${i.id}: write failed — ${(err as Error).message}`);
    }
  }
  return out;
}

/** Worker registration (server/background-jobs.ts): weekdays 16:40 ET, through the heavy gate at low priority. */
export async function scheduleAfterStopJob(log: (m: string) => void): Promise<void> {
  const cron = (await import('./guarded-cron')).default;
  const { runHeavy } = await import('./lib/heavy-job-gate');
  cron.schedule('40 16 * * 1-5', async () => {
    try {
      const r = await runHeavy('after-stop', () => runAfterStopPass(), { priority: 'low' });
      if (r) logger.info(`[AFTER-STOP] ${r.candidates} stop-outs checked · wrote ${r.written} (later T1 ${r.t1} · back to entry ${r.entry} · none ${r.none}) · pending ${r.pending} · skipped ${JSON.stringify(r.skipped)}`);
    } catch (err) {
      logger.error('[AFTER-STOP] pass failed:', err);
    }
  }, { timezone: 'America/New_York' });
  log('🔁 After-stop job scheduled — weekdays 16:40 ET: stopped-out ideas → later T1 / back to entry / none (outcome_notes tag; record unchanged)');
}
