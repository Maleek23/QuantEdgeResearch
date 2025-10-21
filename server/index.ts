import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { startWatchlistMonitor } from "./watchlist-monitor";
import { logger } from "./logger";
import { validateTradierAPI } from "./tradier-api";
import { mlRetrainingService } from "./ml-retraining-service";

const app = express();

// Trust proxy for accurate rate limiting (Replit sets X-Forwarded-For header)
app.set('trust proxy', true);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// SECURITY: Safe logging middleware - prevents sensitive data leakage
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      // SECURITY: Only log request method, path, status, and duration
      // NEVER log request bodies (could contain passwords) or response bodies (could contain tokens/keys)
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      
      // Add safe metadata only (no sensitive data)
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

  // SECURITY: Sanitized error handler - prevents stack trace and internal detail exposure
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    
    // Log full error server-side
    import('./logger').then(({ logger }) => {
      logger.error('Express error handler:', err);
    });

    // Send sanitized message to client (never expose stack traces or internal details)
    res.status(status).json({ 
      error: status >= 500 ? 'Internal server error' : (err.message || 'Request failed')
    });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, async () => {
    log(`serving on port ${port}`);
    
    // Validate Tradier API on startup
    await validateTradierAPI();
    
    // Start watchlist price alert monitoring (checks every 5 minutes)
    startWatchlistMonitor(5);
    log('🔔 Watchlist Monitor started - checking every 5 minutes');
    
    // Initialize ML Auto-Retraining Service (must have storage initialized)
    const { storage } = await import('./storage');
    mlRetrainingService.initialize(storage);
    
    // Start automated performance validation (checks every 5 minutes)
    const { performanceValidationService } = await import('./performance-validation-service');
    performanceValidationService.start();
  });
})();
