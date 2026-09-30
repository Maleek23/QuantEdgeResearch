/**
 * WEB PROCESS — HTTP + websockets + cheap reads (dist/web.js)
 *
 * ROLE (server/lib/process-role.ts) decides what else runs here:
 *   ROLE=web    HTTP, price/bot/weekly websockets, this process's memory guard.
 *               Producers, trackers, recorders and the conviction build run in
 *               dist/worker.js; routes read their state from Postgres and from
 *               .cache/shared (server/lib/shared-state.ts).
 *   ROLE=all    (default) web + every worker job in this one process — the
 *               pre-split production shape, and the rollback.
 * The job list is server/background-jobs.ts; docs/WORKER_SPLIT.md is the runbook.
 */

import "dotenv/config";
import { releaseSchedulerLock } from "./scheduler-lock";
import { runStartupCheck } from "./startup-check";
import { installProcessGuard } from "./process-guard";

// Before anything else can throw: an unpaid API bill must not take the app down.
installProcessGuard("web");

// Run environment check immediately after loading .env
runStartupCheck();

import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import compression from "compression";
import { registerRoutes } from "./routes";
import { serveStatic, log } from "./static";
import { logger } from "./logger";
import { validateTradierAPI } from "./tradier-api";
import { getRealtimeStatus } from "./realtime-price-service";
import { startJobs } from "./background-jobs";
import { processRole } from "./lib/process-role";
import { securityHeaders } from "./security";
import { csrfMiddleware, validateCSRF } from "./csrf";
import { seoRedirects } from "./seo-serve";

const app = express();

// Trust proxy for accurate rate limiting
app.set('trust proxy', true);

// Enable gzip compression for all responses
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }}));

// SEO: www → apex, trailing slash, legacy URLs → 301 (server/seo-serve.ts)
app.use(seoRedirects);

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  const realtimeStatus = getRealtimeStatus();
  const overallStatus = realtimeStatus.isHealthy ? "OK" : "DEGRADED";
  // Railway needs process liveness, not a promise that every optional market
  // feed is currently perfect. Keep HTTP 200 while reporting feed quality in
  // the payload so the terminal can degrade honestly without being restarted.
  res.status(200).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    process: "web",
    realtimePrices: realtimeStatus,
    message: realtimeStatus.isHealthy ? "Server is healthy" : "Realtime price service is degraded",
  });
});

// Journal writes carry whole broker CSV exports and downscaled chart screenshots
// (see server/index.ts — keep the two entry points in step).
app.use(['/api/journal/import-csv', '/api/journal/trade'], express.json({ limit: '4mb' }));
// Discord imports upload a whole DiscordChatExporter file (JSON/CSV) for preview.
app.use('/api/journal/discord/preview', express.json({ limit: '12mb' }));
app.use('/api/journal/discord/forum/preview', express.json({ limit: '40mb' }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(cookieParser());

app.use(securityHeaders);
app.use(csrfMiddleware);
app.use((req, res, next) => {
  if (/^(GET|HEAD|OPTIONS)$/i.test(req.method)) {
    return next();
  }
  validateCSRF(req, res, next);
});

// SECURITY: Safe logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (res.statusCode >= 400) {
        logLine += ` [ERROR]`;
      }
      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  // Sanitized error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    import('./logger').then(({ logger }) => {
      logger.error('Express error handler:', err);
    });
    res.status(status).json({
      error: status >= 500 ? 'Internal server error' : (err.message || 'Request failed')
    });
  });

  // Serve frontend
  if (app.get("env") === "development") {
    // Dev only: dynamic so the prod bundle never pulls vite/rollup/babel.
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, async () => {
    log(`[WEB] serving on port ${port}`);

    // ====================================================================
    // WEB PROCESS SERVICES — Lightweight, always-on
    // ====================================================================

    // Validate Tradier API
    await validateTradierAPI();

    // ── Background jobs: ONE registry (server/background-jobs.ts) ─────────
    // ROLE=web    → web jobs only (price/bot/weekly websockets, own memory guard);
    //               every producer/tracker/recorder runs in dist/worker.js.
    // ROLE=all    → web jobs + worker jobs in this process (pre-split behaviour,
    //               the default, and the rollback).
    const role = processRole();
    if (role === 'worker') {
      logger.warn('[WEB] ROLE=worker on the web entry point — serving HTTP and running worker jobs only; use dist/worker.js for the worker');
    }
    log(`🧩 [WEB] ROLE=${role}`);
    await startJobs('web', { server, log });
    await startJobs('worker', { server, log });

    log(`✅ [WEB] Process ready — serving HTTP + WebSocket (ROLE=${role})`);
  });
})();

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.once(sig, () => { void releaseSchedulerLock().finally(() => process.exit(0)); });
}
