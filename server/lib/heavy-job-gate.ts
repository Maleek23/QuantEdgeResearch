/**
 * HEAVY-JOB GATE — at most N heavy background jobs at once (default 1).
 *
 * The droplet has ONE vCPU. At the 2026-09-30 open the flow scan, GEX
 * archive, GEX setups, index 0DTE, tape scan and pre-market triggers all fired
 * on the same minute, on top of the conviction warm-up and the chart GEX
 * recorder. Each is fine alone; together they held the event loop and
 * doubled heap while HTTP requests waited 30–160 s.
 *
 * Rules:
 *   • Scheduled heavy work goes through `runHeavy(name, fn)`. Only ONE runs at
 *     a time (HEAVY_JOB_CONCURRENCY to change); others queue in FIFO order,
 *     'high' priority (0DTE / pre-market triggers — minute-sensitive) first.
 *   • A job already queued under the same name is not queued twice — the new
 *     call is dropped with a log line (the queued run will do the same work).
 *   • A job that waited is logged with its wait time, so contention is visible.
 *   • A queued job older than `maxWaitMs` (default 4 min) is dropped: by then
 *     its schedule slot has passed and the next tick will run it fresh.
 *   • A running job that exceeds `HEAVY_JOB_MAX_HOLD_MS` (default 5 min) gives
 *     its slot back (logged) so one hung upstream cannot freeze every job; the
 *     job itself keeps running.
 *
 * Only wrap at SCHEDULE call sites. Never call runHeavy from inside a function
 * that may itself run under runHeavy — with concurrency 1 that would deadlock
 * (the hold cap would eventually release it, but only after 5 minutes).
 */
import { logger } from '../logger';

type Priority = 'high' | 'normal' | 'low';
interface Waiter {
  name: string;
  priority: Priority;
  enqueuedAt: number;
  maxWaitMs: number;
  start: () => void;
  drop: () => void;
}

const CONCURRENCY = Math.max(1, Number(process.env.HEAVY_JOB_CONCURRENCY) || 1);
const MAX_HOLD_MS = Math.max(30_000, Number(process.env.HEAVY_JOB_MAX_HOLD_MS) || 5 * 60_000);
const RANK: Record<Priority, number> = { high: 0, normal: 1, low: 2 };

let active = 0;
const running = new Map<number, { name: string; startedAt: number }>();
let seq = 0;
const queue: Waiter[] = [];
const stats = { ran: 0, waited: 0, totalWaitMs: 0, maxWaitMs: 0, droppedDuplicate: 0, droppedStale: 0, holdReleased: 0, failed: 0 };

function pump(): void {
  while (active < CONCURRENCY && queue.length) {
    const w = queue.shift()!;
    if (Date.now() - w.enqueuedAt > w.maxWaitMs) {
      stats.droppedStale++;
      logger.warn(`[HEAVY-GATE] ${w.name}: dropped after waiting ${Math.round((Date.now() - w.enqueuedAt) / 1000)}s (slot passed; next tick runs it)`);
      w.drop();
      continue;
    }
    w.start();
  }
}

function insert(w: Waiter): void {
  // Stable by priority: after every waiter of the same or higher priority.
  let i = queue.length;
  while (i > 0 && RANK[queue[i - 1].priority] > RANK[w.priority]) i--;
  queue.splice(i, 0, w);
}

export interface HeavyOptions {
  priority?: Priority;
  /** Drop the run if it cannot start within this long. Default 4 min. */
  maxWaitMs?: number;
}

/**
 * Run `fn` under the gate. Resolves with fn's result, or `undefined` when the
 * run was dropped (duplicate already queued, or it waited past maxWaitMs).
 */
export function runHeavy<T>(name: string, fn: () => Promise<T>, opts: HeavyOptions = {}): Promise<T | undefined> {
  if (queue.some((q) => q.name === name)) {
    stats.droppedDuplicate++;
    logger.info(`[HEAVY-GATE] ${name}: already queued — this tick skipped`);
    return Promise.resolve(undefined);
  }
  return new Promise<T | undefined>((resolve, reject) => {
    const enqueuedAt = Date.now();
    const start = () => {
      active++;
      const id = ++seq;
      const waited = Date.now() - enqueuedAt;
      running.set(id, { name, startedAt: Date.now() });
      stats.ran++;
      if (waited > 1_000) {
        stats.waited++;
        stats.totalWaitMs += waited;
        stats.maxWaitMs = Math.max(stats.maxWaitMs, waited);
        const behind = [...running.values()].filter((r) => r.name !== name).map((r) => r.name).join(', ');
        logger.info(`[HEAVY-GATE] ${name}: waited ${(waited / 1000).toFixed(1)}s for a slot${behind ? ` (running: ${behind})` : ''}`);
      }
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        running.delete(id);
        active--;
        pump();
      };
      const hold = setTimeout(() => {
        stats.holdReleased++;
        logger.warn(`[HEAVY-GATE] ${name}: still running after ${Math.round(MAX_HOLD_MS / 1000)}s — releasing its slot (job continues)`);
        release();
      }, MAX_HOLD_MS);
      hold.unref?.();
      Promise.resolve()
        .then(fn)
        .then((v) => resolve(v), (e) => { stats.failed++; reject(e); })
        .finally(() => { clearTimeout(hold); release(); });
    };
    insert({ name, priority: opts.priority ?? 'normal', enqueuedAt, maxWaitMs: opts.maxWaitMs ?? 4 * 60_000, start, drop: () => resolve(undefined) });
    pump();
  });
}

export function heavyGateStats() {
  const now = Date.now();
  return {
    concurrency: CONCURRENCY,
    maxHoldMs: MAX_HOLD_MS,
    running: [...running.values()].map((r) => ({ name: r.name, forSec: Math.round((now - r.startedAt) / 1000) })),
    queued: queue.map((q) => ({ name: q.name, priority: q.priority, waitingSec: Math.round((now - q.enqueuedAt) / 1000) })),
    ...stats,
    avgWaitMs: stats.waited ? Math.round(stats.totalWaitMs / stats.waited) : 0,
  };
}
