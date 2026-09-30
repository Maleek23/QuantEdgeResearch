/**
 * BACKGROUND JOB REGISTRY — the one list of everything that runs on a timer.
 *
 * Every scheduler / producer / tracker / recorder / websocket service that used
 * to be started inline in server/web.ts is registered here with exactly ONE role:
 *
 *   web     serves requests or websockets (or trims this process's own caches)
 *   worker  writes the database, computes ideas, grades outcomes, records timelines
 *
 * server/web.ts starts the web jobs (ROLE=web|all) and, under ROLE=all, the
 * worker jobs too — the pre-split single-process behaviour. server/worker.ts
 * starts the worker jobs (ROLE=worker). Both call startJobs(), so nothing is
 * started from two places. scripts/test-roles.ts asserts the partition.
 *
 * Worker jobs start only after this process holds the scheduler lock
 * (server/scheduler-lock.ts): during a deploy overlap (old ROLE=all web still
 * alive, or a second worker) the newcomer retries every 30 s and starts nothing
 * until the lock is free — setInterval-based jobs are guarded too, not only the
 * guarded-cron ones.
 *
 * Kill switches kept from the pre-split web.ts: DISABLE_WEB_FLOW_CRON=1,
 * TRIGGER_OBSERVER_IN_WEB=false, OUTCOME_TRACKER_IN_WEB=false,
 * IDEA_PRODUCERS_IN_WEB=false, QUANT_BOT_IN_WEB=false, GEX_RANKINGS_JOB=off,
 * MEMORY_GUARD=false (names kept so prod env files need no edit).
 */
import type { Server } from 'http';
import { logger } from './logger';
import { processRole, runsWebJobs, runsWorkerJobs, writesSharedState, type ProcessRole } from './lib/process-role';

export type JobRole = 'web' | 'worker';
export interface JobCtx {
  /** HTTP server — present in the web process only. */
  server?: Server;
  log: (msg: string) => void;
}
export interface JobDef {
  name: string;
  role: JobRole;
  what: string;
  /** Env kill switch: returns a reason string when the job is disabled. */
  disabled?: () => string | null;
  start: (ctx: JobCtx) => void | Promise<void>;
}

const ET = { timezone: 'America/New_York' };

// ── SPX scanners (ORB / session / swing catcher / index intelligence) ──────
let spxStarted = false;
async function startSPXScanners(log: (m: string) => void): Promise<void> {
  if (spxStarted) return;
  spxStarted = true;
  try {
    const { startORBScanner } = await import('./spx-orb-scanner');
    const { startSessionScanner } = await import('./spx-session-scanner');
    startORBScanner(60000);
    startSessionScanner(30000);
    const { startSPXIntelligenceService } = await import('./spx-intelligence-service');
    startSPXIntelligenceService();
    const { startSwingCatcher } = await import('./spx-swing-catcher');
    startSwingCatcher(120000);
    log('📊 SPX ORB + Session scanners, Intelligence Service and Swing Catcher started');
  } catch (err) {
    logger.error('❌ Error starting SPX scanners:', err);
  }
}

export const JOBS: JobDef[] = [
  // ─────────────────────────── web ───────────────────────────
  {
    name: 'realtime-prices', role: 'web',
    what: 'Coinbase/DataBento price websockets feeding /ws price clients',
    start: async ({ server }) => {
      const { initializeRealtimePrices } = await import('./realtime-price-service');
      initializeRealtimePrices(server);
    },
  },
  {
    name: 'bot-notification-ws', role: 'web',
    what: '/ws/bot websocket; under ROLE=web also relays worker bot events (.cache/shared/bot-events.jsonl)',
    start: async ({ server }) => {
      const m = await import('./bot-notification-service');
      if (server) m.initializeBotNotificationService(server);
      m.startWorkerEventRelay();
    },
  },
  {
    name: 'weekly-tracker-ws', role: 'web',
    what: 'weekly watchlist websocket (symbol refresh + gap alerts pushed to connected clients)',
    start: async ({ server }) => {
      if (!server) return;
      const { initializeWeeklyTracker } = await import('./weekly-tracker');
      initializeWeeklyTracker(server);
    },
  },
  {
    name: 'memory-guard:web', role: 'web',
    what: "this process's RSS watch + cache trim + 10-min cache report",
    disabled: () => (process.env.MEMORY_GUARD === 'false' ? 'MEMORY_GUARD=false' : null),
    start: async () => { (await import('./lib/memory-guard')).startMemoryGuard(); },
  },

  // ─────────────────────────── worker ───────────────────────────
  {
    name: 'memory-guard:worker', role: 'worker',
    what: "worker's own RSS watch/trim + health snapshot to .cache/shared/worker-health.json every 60s",
    disabled: () => (process.env.MEMORY_GUARD === 'false' ? 'MEMORY_GUARD=false' : null),
    start: async () => {
      const mg = await import('./lib/memory-guard');
      mg.startMemoryGuard();
      if (writesSharedState()) mg.startHealthPublisher();
    },
  },
  {
    name: 'watchlist-monitor', role: 'worker',
    what: 'watchlist price alerts every 5 min (DB updates + Discord)',
    start: async ({ log }) => {
      const { startWatchlistMonitor } = await import('./watchlist-monitor');
      startWatchlistMonitor(5);
      log('🔔 Watchlist Monitor started');
    },
  },
  {
    name: 'spx-scanners', role: 'worker',
    what: 'SPX ORB 60s / session 30s / swing catcher 2m / index intelligence 60s (publish ideas; state → shared files); 09:25 start, 16:05 stop',
    start: async ({ log }) => {
      setTimeout(() => { void startSPXScanners(log); }, 5000);
      if (writesSharedState()) {
        // ROLE=worker: the routes that read these scanners live in the web process.
        const publish = async () => {
          try {
            (await import('./spx-orb-scanner')).publishORBState();
            (await import('./spx-session-scanner')).publishSessionState();
            (await import('./spx-swing-catcher')).publishSwingState();
            (await import('./spx-intelligence-service')).publishSPXIntelligence();
          } catch (err) { logger.debug?.(`[JOBS] spx state publish failed: ${(err as Error).message}`); }
        };
        setInterval(() => { void publish(); }, 30_000).unref?.();
      }
      const cron = (await import('./guarded-cron')).default;
      cron.schedule('25 9 * * 1-5', () => { void startSPXScanners(log); }, ET);
      cron.schedule('5 16 * * 1-5', () => {
        import('./spx-orb-scanner').then((m) => m.stopORBScanner()).catch(() => {});
        import('./spx-session-scanner').then((m) => m.stopSessionScanner()).catch(() => {});
        spxStarted = false; // swing catcher + intelligence keep running
      }, ET);
    },
  },
  {
    name: 'flow-scan', role: 'worker',
    what: 'options-flow scan :03/:18/:33/:48 09–15 ET (heavy gate)',
    disabled: () => (process.env.DISABLE_WEB_FLOW_CRON === '1' ? 'DISABLE_WEB_FLOW_CRON=1' : null),
    start: async ({ log }) => {
      const cron = (await import('./guarded-cron')).default;
      const { runHeavy } = await import('./lib/heavy-job-gate');
      cron.schedule('3-59/15 9-15 * * 1-5', async () => {
        try {
          const { scanOptionsFlow, setOptionsFlowActive, getOptionsFlowStatus } = await import('./options-flow-scanner');
          if (!getOptionsFlowStatus().isActive) setOptionsFlowActive(true);
          const flows = await runHeavy('flow-scan', () => scanOptionsFlow());
          if (flows) log(`💸 [FLOW] scan complete — ${flows.length} qualifying prints`);
        } catch (err) {
          logger.error('[FLOW] Scheduled scan failed:', err);
        }
      }, ET);
    },
  },
  {
    name: 'gex-archive', role: 'worker',
    what: 'hourly GEX snapshot archive (:08, 09–16 ET) → gex_snapshots',
    disabled: () => (process.env.DISABLE_WEB_FLOW_CRON === '1' ? 'DISABLE_WEB_FLOW_CRON=1' : null),
    start: async () => {
      const cron = (await import('./guarded-cron')).default;
      const { runHeavy } = await import('./lib/heavy-job-gate');
      cron.schedule('8 * * * *', async () => {
        try {
          const nowEt = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }).format(new Date()));
          if (nowEt < 9 || nowEt > 16) return;
          const { archiveGexSnapshots } = await import('./gex-history-archiver');
          const result = await runHeavy('gex-archive', () => archiveGexSnapshots(), { priority: 'low' });
          if (result) logger.info(`📸 [GEX-ARCHIVE] Hourly snapshot: ${result.archived} symbols archived`);
        } catch (err) {
          logger.error('[GEX-ARCHIVE] Scheduled archive failed:', err);
        }
      }, ET);
    },
  },
  {
    name: 'idea-producers', role: 'worker',
    what: 'every idea producer in server/idea-producer-schedule.ts (0DTE index/desk, flags, tape, GEX setups, quant, swings, crypto engine + tracker, pre-market plan/triggers, reversal slate)',
    disabled: () => (process.env.IDEA_PRODUCERS_IN_WEB === 'false' ? 'IDEA_PRODUCERS_IN_WEB=false' : null),
    start: async ({ log }) => {
      const { scheduleIdeaProducers } = await import('./idea-producer-schedule');
      await scheduleIdeaProducers(log);
    },
  },
  {
    name: 'trigger-observer', role: 'worker',
    what: 'oracle lifecycle: triggered/stale ideas every 2 min weekdays + paper reconcile at boot',
    disabled: () => (process.env.TRIGGER_OBSERVER_IN_WEB === 'false' ? 'TRIGGER_OBSERVER_IN_WEB=false' : null),
    start: async ({ log }) => {
      const { observeTriggeredIdeas, expireStaleIdeas, reconcileOpenPaperExecutions } = await import('./oracle-lifecycle-reconciler');
      const cron = (await import('./guarded-cron')).default;
      cron.schedule('*/2 * * * 1-5', async () => {
        try { await observeTriggeredIdeas(); await expireStaleIdeas(); }
        catch (err) { logger.error('[ORACLE LIFECYCLE] Trigger observation failed', err); }
      });
      setTimeout(() => { void reconcileOpenPaperExecutions().catch((err) => logger.error('[ORACLE LIFECYCLE] reconcile failed', err)); }, 90_000);
      log('🎯 Trigger observer started — open setups checked against live price every 2 min');
    },
  },
  {
    name: 'outcome-tracker', role: 'worker',
    what: 'performance-validation-service (stock/option outcome grading), 2 min after boot',
    disabled: () => (process.env.OUTCOME_TRACKER_IN_WEB === 'false' ? 'OUTCOME_TRACKER_IN_WEB=false' : null),
    start: ({ log }) => {
      setTimeout(() => {
        void import('./performance-validation-service')
          .then(({ performanceValidationService }) => { performanceValidationService.start(); log('🎯 Outcome tracker started'); })
          .catch((err) => logger.error('outcome tracker failed to start:', err));
      }, 120_000);
    },
  },
  {
    name: 'chart-gex-recorder', role: 'worker',
    what: 'chart GEX timeline (orbs) sampler every 5 min 09:00–16:30 ET → .cache/chart-gex files',
    start: async () => { (await import('./chart-overlays')).startChartOverlayRecorder(); },
  },
  {
    name: 'quant-bot', role: 'worker',
    what: 'paper quant bot cycle every 10 min in session + 15:56 flatten + 16:20 settle + boot reconcile',
    disabled: () => (process.env.QUANT_BOT_IN_WEB === 'false' ? 'QUANT_BOT_IN_WEB=false' : null),
    start: async ({ log }) => {
      const { scheduleQuantBot } = await import('./quant-bot-schedule');
      await scheduleQuantBot(log);
    },
  },
  {
    name: 'convictions-warm', role: 'worker',
    what: 'conviction board build at boot + every 4 min (heavy gate); ROLE=worker publishes boards to .cache/shared',
    start: () => {
      void (async () => {
        try {
          const { warmConvictions } = await import('./convictions-engine');
          const { runHeavy } = await import('./lib/heavy-job-gate');
          await runHeavy('convictions-warm', () => warmConvictions('boot'), { priority: 'low', maxWaitMs: 10 * 60_000 });
          setInterval(() => { void runHeavy('convictions-warm', () => warmConvictions('interval'), { priority: 'low' }); }, 4 * 60_000);
        } catch (err) {
          logger.warn('conviction warm-up failed to start:', err);
        }
      })();
    },
  },
  {
    name: 'gex-rankings', role: 'worker',
    what: 'cross-ticker GEX ranking cycle (CBOE/Alpaca chains) + magnet setup actions + squeeze radar cycle',
    disabled: () => (process.env.GEX_RANKINGS_JOB === 'off' ? 'GEX_RANKINGS_JOB=off' : null),
    start: async () => { (await import('./gex-rankings')).startGexRankingJob(); },
  },
  {
    name: 'self-learning', role: 'worker',
    what: 'hourly self-learning analysis of closed trades (used to auto-start on first import, in whichever process)',
    start: async () => { (await import('./self-learning-service')).selfLearning.start(); },
  },
];

/** Jobs a given process role runs. ROLE=all = web ∪ worker. */
export function jobsForRole(role: ProcessRole): JobDef[] {
  return JOBS.filter((j) => role === 'all' || j.role === role);
}

async function startOne(j: JobDef, ctx: JobCtx): Promise<void> {
  const off = j.disabled?.();
  if (off) { ctx.log(`⏸️  [JOBS] ${j.name} disabled (${off})`); return; }
  try {
    await j.start(ctx);
    ctx.log(`▶️  [JOBS] ${j.role}:${j.name} started`);
  } catch (err) {
    logger.error(`[JOBS] ${j.name} failed to start:`, err);
  }
}

let workerJobsStarted = false;

/**
 * Start this process's share of the jobs. `which` narrows to one side so web.ts
 * can start web jobs immediately and worker jobs (under ROLE=all) after listen.
 */
export async function startJobs(which: JobRole, ctx: JobCtx): Promise<void> {
  if (which === 'web') {
    if (!runsWebJobs()) return;
    for (const j of JOBS.filter((x) => x.role === 'web')) await startOne(j, ctx);
    return;
  }
  if (!runsWorkerJobs() || workerJobsStarted) return;
  const { acquireSchedulerLock } = await import('./scheduler-lock');
  const go = async () => {
    workerJobsStarted = true;
    for (const j of JOBS.filter((x) => x.role === 'worker')) await startOne(j, ctx);
    ctx.log(`✅ [JOBS] worker jobs running in this process (ROLE=${processRole()})`);
  };
  if (await acquireSchedulerLock()) { await go(); return; }
  if (process.env.DISABLE_SCHEDULERS === 'true') return;
  // Another process holds the lock (deploy overlap, second worker, dev server on
  // the prod DB). Start nothing; take over when it goes away.
  ctx.log('👥 [JOBS] scheduler lock held elsewhere — worker jobs wait (retry every 30s)');
  const t = setInterval(() => {
    void acquireSchedulerLock().then(async (ok) => {
      if (!ok || workerJobsStarted) return;
      clearInterval(t);
      ctx.log('👑 [JOBS] scheduler lock acquired — starting worker jobs');
      await go();
    }).catch(() => {});
  }, 30_000);
}
