/**
 * test-roles — the web/worker split (docs/WORKER_SPLIT.md) keeps every job in
 * exactly one process.
 *
 *   npx tsx scripts/test-roles.ts
 *
 * 1. Registry partition: every job ROLE=all starts is in exactly one of
 *    ROLE=web / ROLE=worker; names unique.
 * 2. Every scheduler the pre-split web.ts started (list below) is started from
 *    exactly one registry job, and from nowhere else in web.ts / worker.ts /
 *    routes.ts (static parse).
 * 3. process-role env semantics; shared-state atomic round trip.
 * 4. dist/worker.js --dry (when built) lists exactly the worker jobs, no DB.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

let failed = 0;
const ok = (cond: unknown, msg: string) => {
  if (cond) console.log(`  ✓ ${msg}`);
  else { failed++; console.log(`  ✗ ${msg}`); }
};
const root = path.resolve(import.meta.dirname ?? __dirname, '..');
const src = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');

// Every background start the pre-split server/web.ts (+ routes.ts lazy start,
// + self-learning import-time start) performed. Adding a scheduler means adding
// it here AND to server/background-jobs.ts.
const KNOWN_STARTS = [
  'initializeRealtimePrices', 'initializeBotNotificationService', 'initializeWeeklyTracker',
  'startWatchlistMonitor', 'startORBScanner', 'startSessionScanner', 'startSPXIntelligenceService',
  'startSwingCatcher', 'scanOptionsFlow', 'archiveGexSnapshots', 'scheduleIdeaProducers',
  'observeTriggeredIdeas', 'performanceValidationService', 'startChartOverlayRecorder',
  'scheduleQuantBot', 'warmConvictions', 'startMemoryGuard', 'startHealthPublisher',
  'startGexRankingJob', 'selfLearning.start', 'startWorkerEventRelay', 'scheduleAfterStopJob',
];

async function main() {
  console.log('1. registry partition');
  const { JOBS, jobsForRole } = await import('../server/background-jobs');
  const all = jobsForRole('all').map((j) => j.name);
  const web = jobsForRole('web').map((j) => j.name);
  const worker = jobsForRole('worker').map((j) => j.name);
  ok(new Set(all).size === all.length, `job names unique (${all.length})`);
  ok(all.every((n) => (web.includes(n) ? 1 : 0) + (worker.includes(n) ? 1 : 0) === 1), 'every ROLE=all job is in exactly one of web/worker');
  ok(web.length + worker.length === all.length, `web (${web.length}) + worker (${worker.length}) = all (${all.length})`);
  ok(web.every((n) => ['realtime-prices', 'bot-notification-ws', 'weekly-tracker-ws', 'memory-guard:web'].includes(n)),
    `web runs only websockets + its own memory guard: ${web.join(', ')}`);

  console.log('2. every known start in exactly one job, nowhere else');
  const helper = src('server/background-jobs.ts');
  const spxHelper = helper.slice(helper.indexOf('async function startSPXScanners'), helper.indexOf('export const JOBS'));
  const bodyOf = (j: { start: Function }) => {
    const b = j.start.toString();
    return b.includes('startSPXScanners') ? b + spxHelper : b;
  };
  // Each process guards its own heap: one memory-guard job per role, by design.
  const PER_PROCESS = new Set(['startMemoryGuard']);
  for (const fn of KNOWN_STARTS) {
    if (PER_PROCESS.has(fn)) {
      const owners = JOBS.filter((j) => bodyOf(j).includes(fn));
      ok(owners.length === 2 && owners.some((j) => j.role === 'web') && owners.some((j) => j.role === 'worker'), `${fn} → one per process (${owners.map((j) => j.name).join(', ')})`);
      continue;
    }
    const owners = JOBS.filter((j) => bodyOf(j).includes(fn)).map((j) => `${j.role}:${j.name}`);
    ok(owners.length === 1, `${fn} → ${owners.join(', ') || 'NO JOB'}`);
  }
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  // routes.ts: admin one-shot passes (manual flow scan, archive-now) are not
  // schedulers; the admin scanner start controls must be refused under ROLE=web.
  const ONE_SHOT = new Set(['scanOptionsFlow', 'archiveGexSnapshots']);
  const ROLE_GATED = new Set(['startORBScanner', 'startSessionScanner']);
  const routesCode = strip(src('server/routes.ts'));
  for (const fn of ROLE_GATED) {
    const at = routesCode.search(new RegExp(`\\b${fn}\\(intervalMs\\)`));
    ok(at > 0 && routesCode.slice(Math.max(0, at - 700), at).includes('readsSharedState()'), `routes.ts ${fn} admin control is refused under ROLE=web`);
  }
  for (const f of ['server/web.ts', 'server/worker.ts', 'server/routes.ts']) {
    const code = strip(src(f));
    const skip = f.endsWith('routes.ts') ? new Set([...ONE_SHOT, ...ROLE_GATED]) : new Set<string>();
    const hits = KNOWN_STARTS.filter((fn) => !skip.has(fn) && new RegExp(`\\b${fn.replace('.', '\\.')}\\s*\\(`).test(code));
    ok(hits.length === 0, `${f} starts no scheduler directly${hits.length ? ` (found ${hits.join(', ')})` : ''}`);
  }
  for (const f of ['server/web.ts', 'server/worker.ts']) {
    const code = strip(src(f));
    ok(!/\.schedule\(/.test(code), `${f} registers no cron directly`);
    const intervals = (code.match(/setInterval\(/g) ?? []).length;
    ok(intervals <= (f.endsWith('worker.ts') ? 1 : 0), `${f} has no job setInterval (keep-alive only)`);
  }
  ok(!/^\s*selfLearning\.start\(\)/m.test(strip(src('server/self-learning-service.ts'))), 'self-learning no longer auto-starts on import');

  console.log('2b. worker boot stagger (docs/WORKER_SPLIT.md)');
  {
    const { bootPlan } = await import('../server/background-jobs');
    const wjobs = JOBS.filter((j) => j.role === 'worker');
    ok(wjobs.every((j) => typeof j.bootDelayMs === 'number'), 'every worker job declares a bootDelayMs');
    const plan = bootPlan(wjobs);
    const at = (n: string) => plan.find((p) => p.job.name === n)!.delayMs;
    ok(plan[0].delayMs === 0 && at('convictions-warm') === 0, 'conviction boot build starts first (t=0)');
    const nonZero = plan.filter((p) => p.delayMs > 0).map((p) => p.delayMs);
    ok(new Set(nonZero).size === nonZero.length, 'no two delayed jobs start on the same second');
    const gaps = nonZero.slice(1).map((d, i) => d - nonZero[i]);
    ok(gaps.every((g) => g >= 20_000 && g <= 60_000) && nonZero[0] >= 20_000, `delayed jobs spread 20–60 s apart (${nonZero.map((d) => d / 1000).join(', ')} s)`);
    // Full-chain GEX first passes: chart recorder (+90 s internal), GEX rankings (+90 s internal), hourly archive, index scans (producers).
    ok(at('chart-gex-recorder') + 90_000 >= 240_000 && at('gex-rankings') + 90_000 >= 300_000 && at('gex-archive') >= 180_000 && at('idea-producers') >= 60_000,
      'chart recorder / GEX rankings / archive / index scans cannot share the first minutes');
    const code = strip(src('server/background-jobs.ts'));
    ok(/runHeavy\('paper-reconcile:boot'/.test(code), 'boot paper reconcile runs through runHeavy');
    ok(!/setTimeout\(\(\) => \{\s*void import\('\.\/performance-validation-service'\)/.test(code), 'outcome tracker has no second boot timer (registry delay only)');
    const pvs = strip(src('server/performance-validation-service.ts'));
    const startBody = pvs.slice(pvs.indexOf('start()'), pvs.indexOf('this.intervalId = setInterval'));
    ok(/runHeavy\('outcome-tracker'/.test(startBody) && /runHeavy\('contract-backfill'/.test(startBody), 'outcome tracker first sweep + contract backfill go through runHeavy');
    ok(/runHeavy\('self-learning'/.test(strip(src('server/self-learning-service.ts'))), 'self-learning passes go through runHeavy');
    ok(/runHeavy\(`gex-rank:\$\{sym\}`/.test(strip(src('server/gex-rankings.ts'))), 'GEX ranking chain parses go through runHeavy, per symbol');
  }

  console.log('3. process-role + shared-state');
  const role = await import('../server/lib/process-role');
  const saved = { ROLE: process.env.ROLE, WORKER_ENABLED: process.env.WORKER_ENABLED };
  const withEnv = (r: string | undefined, we: string | undefined, fn: () => void) => {
    if (r === undefined) delete process.env.ROLE; else process.env.ROLE = r;
    if (we === undefined) delete process.env.WORKER_ENABLED; else process.env.WORKER_ENABLED = we;
    fn();
  };
  withEnv(undefined, undefined, () => ok(role.processRole() === 'all' && role.runsWebJobs() && role.runsWorkerJobs() && !role.writesSharedState() && !role.readsSharedState(), 'default ROLE=all: both halves, no shared files'));
  withEnv('web', undefined, () => ok(role.runsWebJobs() && !role.runsWorkerJobs() && role.readsSharedState() && !role.writesSharedState(), 'ROLE=web: web jobs, reads shared'));
  withEnv('worker', undefined, () => ok(!role.runsWebJobs() && role.runsWorkerJobs() && role.writesSharedState(), 'ROLE=worker: worker jobs, writes shared'));
  withEnv(undefined, 'true', () => ok(role.processRole() === 'web', 'WORKER_ENABLED=true (legacy) → web'));
  withEnv('bogus', undefined, () => ok(role.processRole() === 'all', 'unknown ROLE → all'));
  withEnv(saved.ROLE, saved.WORKER_ENABLED, () => {});

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qe-shared-'));
  process.env.SHARED_STATE_DIR = dir;
  const ss = await import('../server/lib/shared-state');
  ok(ss.readShared('nope') === null, 'missing file reads null');
  ss.writeSharedSync('t', { a: 1 });
  const r1 = ss.readShared<{ a: number }>('t', 60_000);
  ok(r1?.data.a === 1 && r1.stale === false && r1.ageMs < 5_000, 'write → read round trip, fresh');
  ok(fs.readdirSync(dir).every((f) => !f.endsWith('.tmp')), 'no tmp file left behind (atomic rename)');
  await ss.writeShared('t', { a: 2 });
  ok(ss.readShared<{ a: number }>('t')?.data.a === 2, 'async write replaces, reader sees the new mtime');
  fs.writeFileSync(path.join(dir, 'bad.json'), '{not json');
  ok(ss.readShared('bad') === null, 'corrupt file reads null, never throws');
  ok(ss.sharedStamp(null).stale === true, 'missing stamp is stale');
  fs.rmSync(dir, { recursive: true, force: true });

  console.log('4. dist/worker.js --dry');
  const dist = path.join(root, 'dist', 'worker.js');
  if (!fs.existsSync(dist)) {
    console.log('  – dist/worker.js not built (npm run build) — skipped');
  } else {
    const env = { ...process.env, ROLE: '', DATABASE_URL: '' } as NodeJS.ProcessEnv;
    delete env.ROLE; delete env.DATABASE_URL;
    const out = spawnSync(process.execPath, [dist, '--dry'], { cwd: root, env, encoding: 'utf8', timeout: 30_000 });
    ok(out.status === 0, `exits 0 without a database (status ${out.status}${out.stderr ? `, stderr: ${out.stderr.slice(0, 200)}` : ''})`);
    ok(/ROLE=worker/.test(out.stdout), 'defaults to ROLE=worker');
    const listed = worker.filter((n) => new RegExp(`\\b${n.replace(/[.:]/g, '\\$&')}\\b`).test(out.stdout));
    ok(listed.length === worker.length && !web.some((n) => out.stdout.includes(` ${n} `)), `lists all ${worker.length} worker jobs and no web job`);
  }

  console.log(failed ? `\n${failed} FAILED` : '\nall role checks passed');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
