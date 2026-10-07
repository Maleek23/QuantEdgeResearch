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
 * INDEX LANE (2026-10-01). The index 0DTE engine was blind for the first 50
 * minutes: its 'high' pass still waited behind whatever low job held the one
 * main slot (index-0dte "done in 71.9s" = ~60 s gate wait + a 12 s chain wait
 * that timed out). `lane: 'index'` gives the index engine (and its pre-open
 * chain warm) a slot of its own — one job at a time inside the lane, never
 * waiting for the main lane.
 *
 * OPEN QUIET WINDOW (2026-10-01). 09:30–09:45 ET on weekdays, the deferrable
 * low-value jobs below (magnet ranking, sector board, conviction warm, non-index
 * chart recorder, self-learning, quant/swing scans) do not start — they are
 * re-submitted at 09:45 ET. The index engine, 0DTE desk, 0DTE flow, outcome
 * tracker and quant bot keep running. OPEN_QUIET_WINDOW=off disables it.
 *
 * Only wrap at SCHEDULE call sites. Never call runHeavy from inside a function
 * that may itself run under runHeavy in the SAME lane — with concurrency 1 that
 * would deadlock (the hold cap would eventually release it, but only after 5
 * minutes).
 */
import { logger } from '../logger';

type Priority = 'high' | 'normal' | 'low';
export type Lane = 'main' | 'index';
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

interface LaneState { concurrency: number; active: number; queue: Waiter[] }
const lanes: Record<Lane, LaneState> = {
  main: { concurrency: CONCURRENCY, active: 0, queue: [] },
  index: { concurrency: 1, active: 0, queue: [] },
};
const running = new Map<number, { name: string; lane: Lane; startedAt: number }>();
let seq = 0;
const stats = { ran: 0, waited: 0, totalWaitMs: 0, maxWaitMs: 0, droppedDuplicate: 0, droppedStale: 0, holdReleased: 0, failed: 0, deferredAtOpen: 0 };

/** Clock seam for fake-clock tests (scripts/test-index-open.ts). */
let clock: () => number = () => Date.now();
export function __setGateClock(fn: (() => number) | null): void { clock = fn ?? (() => Date.now()); }

function pump(lane: LaneState): void {
  while (lane.active < lane.concurrency && lane.queue.length) {
    const w = lane.queue.shift()!;
    if (clock() - w.enqueuedAt > w.maxWaitMs) {
      stats.droppedStale++;
      logger.warn(`[HEAVY-GATE] ${w.name}: dropped after waiting ${Math.round((clock() - w.enqueuedAt) / 1000)}s (slot passed; next tick runs it)`);
      w.drop();
      continue;
    }
    w.start();
  }
}

function insert(lane: LaneState, w: Waiter): void {
  // Stable by priority: after every waiter of the same or higher priority.
  let i = lane.queue.length;
  while (i > 0 && RANK[lane.queue[i - 1].priority] > RANK[w.priority]) i--;
  lane.queue.splice(i, 0, w);
}

export interface HeavyOptions {
  priority?: Priority;
  /** Drop the run if it cannot start within this long. Default 4 min. */
  maxWaitMs?: number;
  /** 'index' = the index 0DTE engine's own slot (never waits behind the main lane). Default 'main'. */
  lane?: Lane;
}

// ─── Open quiet window ────────────────────────────────────────────────────

export const OPEN_QUIET_START_MIN = 9 * 60 + 30;
export const OPEN_QUIET_END_MIN = 9 * 60 + 45;
const INDEX_CHART_SYMS = new Set(['SPY', 'QQQ', 'IWM', 'SPX']);
/**
 * Jobs that wait for 09:45 ET. Matched on the runHeavy name. Everything NOT here
 * keeps running in the window — notably producer:index-0dte, producer:0dte-desk,
 * 0dte-flow chains, outcome-tracker, quant-bot:*, flow-scan, premarket-triggers.
 */
const DEFER_AT_OPEN: Array<(name: string) => boolean> = [
  (n) => n.startsWith('gex-rank:'),                        // magnet / cross-ticker ranking cycle
  (n) => n.startsWith('producer:sector-board'),            // sector board full recompute
  (n) => n === 'convictions-warm',                         // conviction board warm
  (n) => n.startsWith('chart-gex:') && !INDEX_CHART_SYMS.has(n.slice('chart-gex:'.length).toUpperCase()), // non-index chart recorder
  (n) => n === 'self-learning',
  (n) => n === 'producer:quant',                           // quant sweep
  (n) => /^producer:(index-swing|leader-swing|premium-discount|short-swings|crypto-proxy|gex-setups|bull-flag|bear-flag|base-reclaim)$/.test(n), // swing / structure scans
];

export function isDeferrableAtOpen(name: string): boolean {
  return DEFER_AT_OPEN.some((f) => f(name));
}

/** ET weekday + minute-of-day (DST-correct). */
export function etMinuteOf(ms: number): { weekday: boolean; min: number; secOfMin: number } {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(new Date(ms));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { weekday: !['Sat', 'Sun'].includes(v('weekday')), min: (Number(v('hour')) % 24) * 60 + Number(v('minute')), secOfMin: Number(v('second')) };
}

/**
 * How long a job named `name` must wait before it may start at `nowMs`:
 * > 0 inside the weekday 09:30–09:45 ET window for a deferrable job, else 0.
 */
export function openQuietDeferMs(name: string, nowMs: number): number {
  if (process.env.OPEN_QUIET_WINDOW === 'off') return 0;
  if (!isDeferrableAtOpen(name)) return 0;
  const { weekday, min, secOfMin } = etMinuteOf(nowMs);
  if (!weekday || min < OPEN_QUIET_START_MIN || min >= OPEN_QUIET_END_MIN) return 0;
  const msIntoMinute = secOfMin * 1000 + (nowMs % 1000);
  return (OPEN_QUIET_END_MIN - min) * 60_000 - msIntoMinute;
}

const deferred = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Heavy jobs (chain parses, GEX books, board builds) leave 150–250 MB of dead
 * objects; V8 collects them lazily, so RSS rode past pm2's cap between jobs
 * (2026-09-30: worker 334 → 1,046 MB in 8 s). When the process runs with
 * --expose-gc, collect right after each heavy job — at most every 5 s — so
 * jemalloc can hand the pages back. No-op without the flag.
 */
let lastGc = 0;
function collectAfterHeavy(): void {
  const gc = (globalThis as any).gc as (() => void) | undefined;
  if (typeof gc !== 'function' || Date.now() - lastGc < 5_000) return;
  lastGc = Date.now();
  setImmediate(() => { try { gc(); } catch { /* ignore */ } });
}

/**
 * Run `fn` under the gate. Resolves with fn's result, or `undefined` when the
 * run was dropped (duplicate already queued / deferred, or it waited past maxWaitMs).
 */
export function runHeavy<T>(name: string, fn: () => Promise<T>, opts: HeavyOptions = {}): Promise<T | undefined> {
  const laneName: Lane = opts.lane ?? 'main';
  const lane = lanes[laneName];

  // Open quiet window: a deferrable job waits for 09:45 ET (one deferred run per name).
  if (laneName === 'main') {
    const deferMs = openQuietDeferMs(name, clock());
    if (deferMs > 0) {
      if (deferred.has(name)) {
        stats.droppedDuplicate++;
        logger.info(`[HEAVY-GATE] ${name}: already deferred to 09:45 ET — this tick skipped`);
        return Promise.resolve(undefined);
      }
      stats.deferredAtOpen++;
      logger.info(`[HEAVY-GATE] ${name}: deferred ${Math.round(deferMs / 1000)}s to 09:45 ET (open quiet window — index engine first)`);
      return new Promise<T | undefined>((resolve, reject) => {
        const t = setTimeout(() => {
          deferred.delete(name);
          runHeavy(name, fn, opts).then(resolve, reject);
        }, deferMs + 250);
        t.unref?.();
        deferred.set(name, t);
      });
    }
  }

  if (lane.queue.some((q) => q.name === name)) {
    stats.droppedDuplicate++;
    logger.info(`[HEAVY-GATE] ${name}: already queued — this tick skipped`);
    return Promise.resolve(undefined);
  }
  return new Promise<T | undefined>((resolve, reject) => {
    const enqueuedAt = clock();
    const start = () => {
      lane.active++;
      const id = ++seq;
      const waited = clock() - enqueuedAt;
      running.set(id, { name, lane: laneName, startedAt: clock() });
      stats.ran++;
      if (waited > 1_000) {
        stats.waited++;
        stats.totalWaitMs += waited;
        stats.maxWaitMs = Math.max(stats.maxWaitMs, waited);
        const behind = [...running.values()].filter((r) => r.name !== name && r.lane === laneName).map((r) => r.name).join(', ');
        logger.info(`[HEAVY-GATE] ${name}: waited ${(waited / 1000).toFixed(1)}s for a ${laneName}-lane slot${behind ? ` (running: ${behind})` : ''}`);
      }
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        running.delete(id);
        lane.active--;
        pump(lane);
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
        .finally(() => { clearTimeout(hold); release(); collectAfterHeavy(); });
    };
    insert(lane, { name, priority: opts.priority ?? 'normal', enqueuedAt, maxWaitMs: opts.maxWaitMs ?? 4 * 60_000, start, drop: () => resolve(undefined) });
    pump(lane);
  });
}

export function heavyGateStats() {
  const now = clock();
  const main = lanes.main;
  return {
    concurrency: CONCURRENCY,
    maxHoldMs: MAX_HOLD_MS,
    running: [...running.values()].map((r) => ({ name: r.name, lane: r.lane, forSec: Math.round((now - r.startedAt) / 1000) })),
    queued: [...main.queue, ...lanes.index.queue].map((q) => ({ name: q.name, priority: q.priority, waitingSec: Math.round((now - q.enqueuedAt) / 1000) })),
    deferredToOpenEnd: [...deferred.keys()],
    ...stats,
    avgWaitMs: stats.waited ? Math.round(stats.totalWaitMs / stats.waited) : 0,
  };
}
