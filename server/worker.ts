/**
 * WORKER PROCESS — every scheduler, producer, tracker and recorder (dist/worker.js)
 *
 * No HTTP server. Starts the 'worker' half of server/background-jobs.ts — the
 * same start functions ROLE=all runs inside dist/web.js, so nothing is defined
 * twice — once it holds the scheduler lock (server/scheduler-lock.ts). The web
 * process (ROLE=web) reads what this process produces from Postgres and from
 * .cache/shared (server/lib/shared-state.ts). Runbook: docs/WORKER_SPLIT.md.
 *
 *   node dist/worker.js           ROLE defaults to worker
 *   node dist/worker.js --dry     list the jobs this role would start and exit
 *                                 (no DB, no network, no timers)
 *
 * The pre-split worker.ts (auto idea generator, penny scanner, catalyst polling,
 * 40-odd crons, the 4:10 PM self-exit) never ran in production and is retired:
 * the job set is exactly what production ran in dist/web.js.
 */
import './lib/role-worker';
import 'dotenv/config';

const DRY = process.argv.includes('--dry');

async function dryRun(): Promise<void> {
  const { processRole } = await import('./lib/process-role');
  const { jobsForRole } = await import('./background-jobs');
  const role = processRole();
  const jobs = jobsForRole(role === 'all' ? 'all' : 'worker');
  console.log(`[worker --dry] ROLE=${role} — ${jobs.length} job(s) would start:`);
  for (const j of jobs) {
    const off = j.disabled?.();
    const at = j.role === 'worker' ? `+${Math.round((j.bootDelayMs ?? 0) / 1000)}s`.padEnd(6) : ''.padEnd(6);
    console.log(`  ${j.role.padEnd(6)} ${j.name.padEnd(22)} ${at} ${off ? `(disabled: ${off}) ` : ''}${j.what}`);
  }
}

function log(msg: string) {
  console.log(`${new Date().toLocaleTimeString('en-US')} [worker] ${msg}`);
}

async function main(): Promise<void> {
  const { installProcessGuard } = await import('./process-guard');
  installProcessGuard('worker');
  const { runStartupCheck } = await import('./startup-check');
  runStartupCheck();

  const { processRole } = await import('./lib/process-role');
  const role = processRole();
  if (role === 'web') {
    log('ROLE=web on the worker entry point — nothing to run; exiting');
    process.exit(0);
  }
  log(`🔧 worker starting (ROLE=${role}, pid ${process.pid})`);

  const { validateTradierAPI } = await import('./tradier-api');
  await validateTradierAPI().catch(() => { /* logged inside */ });

  const { startJobs } = await import('./background-jobs');
  await startJobs('worker', { log });

  const { releaseSchedulerLock } = await import('./scheduler-lock');
  for (const sig of ['SIGTERM', 'SIGINT'] as const) {
    process.once(sig, () => {
      log(`${sig} — releasing the scheduler lock`);
      void releaseSchedulerLock().finally(() => process.exit(0));
    });
  }
  // Keep the event loop alive even if every job is disabled.
  setInterval(() => {}, 60 * 60_000);
}

if (DRY) {
  dryRun().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
} else {
  main().catch((err) => { console.error('[worker] fatal:', err); process.exit(1); });
}
