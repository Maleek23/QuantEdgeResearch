/**
 * IDEA TIMELINE + "TEST THIS SETUP" — NEXUS setup detail (item 9).
 *
 *   GET  /api/ideas/:id/timeline    recorded lifecycle events (shared/idea-timeline.ts)
 *   POST /api/ideas/:id/test-setup  the idea's own plan rules replayed on similar
 *                                   PAST setups (shared/run-up.ts simulateExit 'actual')
 *
 * test-setup — honest, bounded, unvalidated:
 *   • Cohort: published BEFORE this idea, since OUTCOME_BASELINE_DATE, same engine
 *     (source) + direction + asset type + holding period. If that yields fewer than
 *     MIN_COHORT rows it widens to engine + direction and SAYS so.
 *   • Population filter: shared/run-up.ts inRunUpPopulation (not excluded /
 *     synthetic, barriers on the underlying scale, not a missed entry, audited
 *     as triggered when an audit exists).
 *   • Per idea: bars via server/lib/exit-time-bars.ts (5m when history reaches
 *     entry, else daily; equities regular session), trigger = audit time else
 *     first bar through entry inside the entry window, then the published plan:
 *     full exit at T1, stop, or the holding-window close (shared/setup-lifecycle
 *     windowFor). Same bar stop + T1 = stop; stop gaps fill at the open.
 *   • At most MAX_REPLAY ideas, sequential, cached 30 min per idea. Nothing is
 *     written. R is on the UNDERLYING plan, not option premium.
 */
import type { Express, RequestHandler } from 'express';
import { and, desc, eq, gte, lt, ne } from 'drizzle-orm';
import { db } from './db';
import { storage } from './storage';
import { logger } from './logger';
import { tradeIdeas } from '@shared/schema';
import { buildIdeaTimeline, type SetupTestResult } from '@shared/idea-timeline';
export type { SetupTestResult };
import { OUTCOME_BASELINE_DATE } from '@shared/constants';
import {
  inRunUpPopulation, resolveTrigger, simulateExit, exitStats, underlyingDirection, EXIT_VARIANTS,
  type RunUpBar, type RunUpIdea, type ExitResult,
} from '@shared/run-up';
import { windowFor } from '@shared/setup-lifecycle';
import { BoundedCache } from './lib/bounded-cache';

const MAX_REPLAY = 25;
const MIN_COHORT = 8;


const cache = new BoundedCache<string, { at: number; v: SetupTestResult }>({ name: 'setup-test', maxEntries: 200, ttlMs: 30 * 60_000, noSizing: true });
const inflight = new Map<string, Promise<SetupTestResult>>();
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

async function replayOne(row: any, nowMs: number): Promise<{ r: ExitResult | null; outcome: 'ok' | 'never' | 'nodata'; interval: string | null; startMs: number }> {
  const { barsSinceEntry } = await import('./lib/exit-time-bars');
  const publishMs = Date.parse(row.timestamp);
  const win = windowFor({
    direction: row.direction, entryPrice: row.entryPrice, stopLoss: row.stopLoss, targetPrice: row.targetPrice,
    assetType: row.assetType, holdingPeriod: row.holdingPeriod, tradeType: row.tradeType, source: row.source,
    expiryDate: row.expiryDate, generatedAt: row.timestamp, exitBy: row.exitBy, entryValidUntil: row.entryValidUntil,
  }, publishMs);
  const endMs = win.endMs;
  const { bars: raw, interval } = await barsSinceEntry(row.symbol, row.assetType, publishMs, nowMs);
  const bars: RunUpBar[] = raw.map((b) => ({ t: b.time * 1000, open: b.open ?? b.close, high: b.high, low: b.low, close: b.close }));
  if (!bars.length) return { r: null, outcome: 'nodata', interval, startMs: publishMs };
  const trig = resolveTrigger(row as RunUpIdea, bars, endMs);
  if (!trig) return { r: null, outcome: 'never', interval, startMs: publishMs };
  const r = simulateExit('actual', {
    direction: underlyingDirection(row.direction), entry: row.entryPrice, stop: row.stopLoss, target: row.targetPrice,
    triggerMs: trig.ms, horizonEndMs: endMs, bars, horizonComplete: endMs <= nowMs,
  });
  return { r, outcome: r.reason === 'nodata' ? 'nodata' : 'ok', interval, startMs: publishMs };
}

export async function testSetup(ideaId: string): Promise<SetupTestResult | null> {
  const hit = cache.get(ideaId);
  if (hit) return hit.v;
  const running = inflight.get(ideaId);
  if (running) return running;
  const idea = await storage.getTradeIdeaById(ideaId);
  if (!idea) return null;
  const p = (async (): Promise<SetupTestResult> => {
    const nowMs = Date.now();
    const sinceIso = new Date(`${OUTCOME_BASELINE_DATE}T00:00:00-04:00`).toISOString();
    const before = idea.timestamp;
    const base = [gte(tradeIdeas.timestamp, sinceIso), lt(tradeIdeas.timestamp, before), ne(tradeIdeas.id, idea.id), eq(tradeIdeas.direction, idea.direction)];
    const exact = [...base, eq(tradeIdeas.source, idea.source), eq(tradeIdeas.assetType, idea.assetType), eq(tradeIdeas.holdingPeriod, idea.holdingPeriod)];
    let rows = (await db.select().from(tradeIdeas).where(and(...exact)).orderBy(desc(tradeIdeas.timestamp)).limit(120)).filter((r) => inRunUpPopulation(r as any));
    let widened = false;
    if (rows.length < MIN_COHORT) {
      rows = (await db.select().from(tradeIdeas).where(and(...base, eq(tradeIdeas.source, idea.source))).orderBy(desc(tradeIdeas.timestamp)).limit(120)).filter((r) => inRunUpPopulation(r as any));
      widened = true;
    }
    const pick = rows.slice(0, MAX_REPLAY);
    const results: ExitResult[] = [];
    let never = 0; let nodata = 0;
    const intervals: Record<string, number> = {};
    let fromMs = Infinity; let toMs = -Infinity;
    for (const row of pick) {
      try {
        const o = await replayOne(row, nowMs);
        intervals[o.interval ?? 'none'] = (intervals[o.interval ?? 'none'] ?? 0) + 1;
        fromMs = Math.min(fromMs, o.startMs); toMs = Math.max(toMs, o.startMs);
        if (o.outcome === 'never') never++;
        else if (o.outcome === 'nodata' || !o.r) nodata++;
        else results.push(o.r);
      } catch (e) {
        nodata++;
        logger.warn(`[setup-test] ${row.symbol} ${row.id}: ${(e as Error).message}`);
      }
    }
    const stats = exitStats(results);
    const hitT1 = results.filter((r) => r.reason === 'target').length;
    const stopped = results.filter((r) => r.reason === 'stop').length;
    const horizon = results.filter((r) => r.reason === 'horizon').length;
    const n = stats.n;
    const cohortRule = widened
      ? `engine ${idea.source} · ${idea.direction} (widened: fewer than ${MIN_COHORT} with the same asset type + holding period)`
      : `engine ${idea.source} · ${idea.direction} · ${idea.assetType} · ${idea.holdingPeriod}`;
    const notes = [
      'Measuring, unvalidated: a small recent cohort replayed on public bars — not an out-of-sample test and not the model record.',
      'R is measured on the underlying plan (entry → stop = 1R), not on option premium.',
    ];
    if (rows.length > MAX_REPLAY) notes.push(`Capped at the ${MAX_REPLAY} most recent of ${rows.length} eligible setups.`);
    if (intervals['1d']) notes.push(`${intervals['1d']} replayed on daily bars (5m history did not reach their entry) — intraday order inside a day is unknown there.`);
    return {
      ideaId,
      label: `measuring, unvalidated, n=${n}`,
      status: n > 0 ? 'measured' : 'insufficient',
      cohort: { rule: cohortRule, widened, source: idea.source ?? null, direction: idea.direction, assetType: widened ? null : idea.assetType, holdingPeriod: widened ? null : idea.holdingPeriod, since: OUTCOME_BASELINE_DATE, before },
      rules: [
        `Plan: ${EXIT_VARIANTS.actual}.`,
        'Trigger: executionAudit time when recorded, else the first bar through the entry after publish, inside the entry window.',
        'Horizon: the holding window from the idea fields (exit_by, expiry, holding period) — shared/setup-lifecycle windowFor.',
        'Fills: stop at the level or the gap-through open; T1 at the level; a bar touching both = stop.',
      ],
      window: { from: Number.isFinite(fromMs) ? new Date(fromMs).toISOString() : null, to: Number.isFinite(toMs) ? new Date(toMs).toISOString() : null },
      considered: rows.length,
      replayed: pick.length,
      neverTriggered: never,
      noData: nodata,
      open: stats.open,
      n, hitT1, stopped, horizon,
      hitT1Rate: pct(hitT1, n),
      stopRate: pct(stopped, n),
      avgR: stats.avgR,
      intervals,
      asOf: new Date(nowMs).toISOString(),
      notes,
    };
  })();
  inflight.set(ideaId, p);
  try {
    const v = await p;
    cache.set(ideaId, { at: Date.now(), v });
    return v;
  } finally {
    inflight.delete(ideaId);
  }
}

export function registerIdeaTimelineRoutes(app: Express, gate: RequestHandler): void {
  app.get('/api/ideas/:id/timeline', gate, async (req, res) => {
    try {
      const idea = await storage.getTradeIdeaById(String(req.params.id));
      if (!idea) return res.status(404).json({ error: 'idea not found — no trade_ideas row for this id' });
      res.set('Cache-Control', 'private, max-age=15');
      res.json(buildIdeaTimeline(idea as any));
    } catch (e: any) {
      logger.error('[idea-timeline] failed', { error: e?.message });
      res.status(500).json({ error: 'timeline failed' });
    }
  });

  app.post('/api/ideas/:id/test-setup', gate, async (req, res) => {
    try {
      const out = await testSetup(String(req.params.id));
      if (!out) return res.status(404).json({ error: 'idea not found — no trade_ideas row for this id' });
      res.json(out);
    } catch (e: any) {
      logger.error('[setup-test] failed', { error: e?.message });
      res.status(500).json({ error: 'setup test failed' });
    }
  });
}
