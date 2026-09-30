/**
 * PROCESS ROLE — which half of the platform this Node process runs.
 *
 *   ROLE=web     HTTP + websockets + cheap reads. Starts NO background job that
 *                writes the database, computes ideas, tracks outcomes or records
 *                timelines. Reads what the worker produces from Postgres and from
 *                the shared-state files (server/lib/shared-state.ts).
 *   ROLE=worker  Every scheduler / producer / tracker / recorder. No HTTP server.
 *   ROLE=all     Both, in one process — exactly how prod ran before the split, and
 *                the default so dev (`npm run dev`, `tsx server/web.ts`) and a
 *                rollback (`ROLE=all` on dist/web.js) keep working unchanged.
 *
 * Back-compat: WORKER_ENABLED=true with no ROLE means "a worker owns the jobs",
 * i.e. ROLE=web. dist/worker.js defaults to ROLE=worker (server/lib/role-worker.ts).
 *
 * Read lazily (every call) so an entry point can set process.env.ROLE before
 * anything asks.
 */
export type ProcessRole = 'web' | 'worker' | 'all';

export function processRole(): ProcessRole {
  const raw = String(process.env.ROLE ?? '').trim().toLowerCase();
  if (raw === 'web' || raw === 'worker' || raw === 'all') return raw;
  if (process.env.WORKER_ENABLED === 'true') return 'web';
  return 'all';
}

/** This process serves HTTP / websockets (web or all). */
export function runsWebJobs(): boolean {
  return processRole() !== 'worker';
}

/** This process runs the background producers/trackers/recorders (worker or all). */
export function runsWorkerJobs(): boolean {
  return processRole() !== 'web';
}

/**
 * Shared-state direction. Only a split deployment needs files between processes:
 * the worker writes, the web reads. ROLE=all keeps everything in memory as before
 * (no extra disk writes, no behaviour change on rollback).
 */
export function writesSharedState(): boolean {
  return processRole() === 'worker';
}
export function readsSharedState(): boolean {
  return processRole() === 'web';
}
