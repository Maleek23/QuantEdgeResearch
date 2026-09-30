/**
 * Admin hub › System health — one read-only status call for what /api/health
 * does not already carry (docs/ADMIN_HUB.md). Everything here is OBSERVED in
 * this process; nothing is a hardcoded "operational". A value the runtime does
 * not expose (e.g. pm2's restart count when pm2 doesn't pass it into the env)
 * is returned as null and the page says "not exposed".
 *
 *   GET /api/admin/hub/status   (requireAdminJWT)
 */
import type { Express, RequestHandler } from 'express';
import { RELEASE_LABEL, CURRENT_RELEASE } from '@shared/release';

const mb = (n: number) => Math.round((n / 1024 / 1024) * 10) / 10;
const num = (v: string | undefined) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

export function registerAdminHubRoutes(app: Express, requireAdmin: RequestHandler) {
  app.get('/api/admin/hub/status', requireAdmin, async (_req, res) => {
    const mem = process.memoryUsage();
    let faults: Record<string, number> = {};
    try { faults = (await import('./process-guard')).faultCounts(); } catch { /* guard not installed */ }
    let discordBot = false;
    try { discordBot = (await import('./discord-journal-import')).discordBotConfigured(); } catch { /* module unavailable */ }
    let ideaProducersInWeb: boolean | null = null;
    const roleMod = await import('./lib/process-role');
    const role = roleMod.processRole();
    try { ideaProducersInWeb = roleMod.runsWorkerJobs() && (await import('./idea-producer-schedule')).ideaProducersEnabledInWeb(); } catch { /* */ }
    // Split deployment: the worker's own memory/heavy-gate snapshot (written every 60s).
    let worker: unknown = null;
    if (roleMod.readsSharedState()) {
      try {
        const { readShared, sharedStamp } = await import('./lib/shared-state');
        const r = readShared<unknown>('worker-health', 3 * 60_000);
        worker = r ? { ...(r.data as object), ...sharedStamp(r) } : { ...sharedStamp(null), note: 'no worker health file — is quantedge-worker running?' };
      } catch { /* */ }
    }
    let api: { summary: unknown; rateLimited: { provider: string; endpoint: string; failureCount: number; lastFailure: string | null }[] } | null = null;
    try {
      const { monitoringService } = await import('./monitoring-service');
      const metrics = monitoringService.getAPIMetrics();
      api = {
        summary: monitoringService.getSummary(),
        rateLimited: metrics.filter((m) => m.rateLimitWarning).map((m) => ({ provider: m.provider, endpoint: m.endpoint, failureCount: m.failureCount, lastFailure: m.lastFailure })),
      };
    } catch { /* monitoring unavailable */ }

    // Memory budget view (docs/MEMORY_BUDGET.md): per-cache entries/approx MB,
    // watchdog trims, heavy-job gate queue. Observed in this process.
    let memory: unknown = null;
    try { memory = (await import('./lib/memory-guard')).memorySnapshot(); } catch { /* guard unavailable */ }

    res.set('Cache-Control', 'no-store');
    res.json({
      release: { label: RELEASE_LABEL, version: CURRENT_RELEASE.version, series: CURRENT_RELEASE.series, date: CURRENT_RELEASE.date },
      gitSha: process.env.GIT_SHA ?? null,
      env: process.env.NODE_ENV ?? null,
      process: {
        pid: process.pid,
        node: process.version,
        uptimeSec: Math.round(process.uptime()),
        rssMb: mb(mem.rss),
        heapUsedMb: mb(mem.heapUsed),
        heapTotalMb: mb(mem.heapTotal),
        externalMb: mb(mem.external),
        // pm2 puts pm_id / name into the env; the restart counter only when it passes pm2_env through.
        pm2: process.env.pm_id != null ? { id: num(process.env.pm_id), name: process.env.name ?? null, restarts: num(process.env.restart_time) } : null,
      },
      memory,
      role,
      worker,
      faultsSinceBoot: faults,
      discord: { botConfigured: discordBot },
      ideaProducersInWeb,
      api,
      at: new Date().toISOString(),
    });
  });
}
