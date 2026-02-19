/**
 * WEB PROCESS — Lightweight HTTP Server + WebSocket + SPX Scanners
 *
 * This is Process 1 of 2 in production. It serves:
 * - All 642 API routes (Express)
 * - WebSocket for real-time prices (Coinbase, DataBento)
 * - WebSocket for bot notifications
 * - SPX ORB Scanner + Session Scanner + Intelligence Service
 * - Watchlist monitor (lightweight price alerts)
 *
 * Expected memory: 500-800MB
 * Expected CPU: Low idle, moderate during SPX scans
 *
 * Process 2 (worker.ts) handles all heavy background services.
 * Both processes share the same Neon PostgreSQL database.
 */

import "dotenv/config";
import { runStartupCheck } from "./startup-check";

// Run environment check immediately after loading .env
runStartupCheck();

import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import compression from "compression";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { startWatchlistMonitor } from "./watchlist-monitor";
import { logger } from "./logger";
import { validateTradierAPI } from "./tradier-api";
import { initializeRealtimePrices, getRealtimeStatus } from "./realtime-price-service";
import { initializeBotNotificationService } from "./bot-notification-service";
import { securityHeaders } from "./security";
import { csrfMiddleware, validateCSRF } from "./csrf";

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

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  const realtimeStatus = getRealtimeStatus();
  const overallStatus = realtimeStatus.isHealthy ? "OK" : "DEGRADED";
  res.status(realtimeStatus.isHealthy ? 200 : 503).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    process: "web",
    realtimePrices: realtimeStatus,
    message: realtimeStatus.isHealthy ? "Server is healthy" : "Realtime price service is degraded",
  });
});

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

    // ── Essential services (ALWAYS run) ──────────────────────────────────
    initializeRealtimePrices(server);
    log('📡 Real-time price feeds initialized');

    initializeBotNotificationService(server);
    log('🤖 Bot notification service initialized');

    startWatchlistMonitor(5);
    log('🔔 Watchlist Monitor started');

    // ── SPX Scanners (market hours only) ─────────────────────────────────
    function isMarketCurrentlyOpen(): boolean {
      const now = new Date();
      const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const hour = et.getHours();
      const minute = et.getMinutes();
      const day = et.getDay();
      const isWeekday = day >= 1 && day <= 5;
      const timeInMinutes = hour * 60 + minute;
      // 9:00 AM - 4:30 PM ET
      return isWeekday && timeInMinutes >= 540 && timeInMinutes <= 990;
    }

    let spxStarted = false;

    async function startSPXScanners() {
      if (spxStarted) return;
      spxStarted = true;
      log('🚀 Starting SPX scanners...');

      try {
        const { startORBScanner } = await import('./spx-orb-scanner');
        const { startSessionScanner } = await import('./spx-session-scanner');
        startORBScanner(60000);
        startSessionScanner(30000);
        log('📊 SPX ORB + Session scanners started');

        const { startSPXIntelligenceService } = await import('./spx-intelligence-service');
        startSPXIntelligenceService();
        log('🧠 SPX Intelligence Service started');
      } catch (err) {
        logger.error('❌ Error starting SPX scanners:', err);
      }
    }

    // Start SPX scanners if market is open
    if (isMarketCurrentlyOpen()) {
      log('📈 Market is OPEN — starting SPX scanners in 5s...');
      setTimeout(() => startSPXScanners(), 5000);
    } else {
      log('🌙 Market is CLOSED — SPX scanners will start at 9:25 AM ET');
    }

    // Cron: Start SPX scanners at market open
    const cron = await import('node-cron');
    cron.default.schedule('25 9 * * 1-5', () => {
      log('⏰ Market open — starting SPX scanners...');
      startSPXScanners();
    }, { timezone: 'America/New_York' });

    // Cron: Stop SPX scanners at market close
    cron.default.schedule('5 16 * * 1-5', () => {
      log('🌙 Market closed — stopping SPX scanners...');
      import('./spx-orb-scanner').then(m => m.stopORBScanner()).catch(() => {});
      import('./spx-session-scanner').then(m => m.stopSessionScanner()).catch(() => {});
      spxStarted = false;
    }, { timezone: 'America/New_York' });

    log('✅ [WEB] Process ready — serving HTTP + WebSocket + SPX scanners');
  });
})();
