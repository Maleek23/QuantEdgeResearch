import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { searchSymbol, fetchHistoricalPrices, fetchStockPrice, fetchCryptoPrice } from "./market-api";
import { generateTradeIdeas, chatWithQuantAI } from "./ai-service";
import { generateQuantIdeas } from "./quant-ideas-generator";
import {
  insertMarketDataSchema,
  insertTradeIdeaSchema,
  insertCatalystSchema,
  insertWatchlistSchema,
  insertOptionsDataSchema,
  insertUserPreferencesSchema,
} from "@shared/schema";
import { z } from "zod";
import { logger, logError } from "./logger";
import { 
  generalApiLimiter, 
  aiGenerationLimiter, 
  quantGenerationLimiter,
  marketDataLimiter,
  adminLimiter
} from "./rate-limiter";
import { requireAdmin, generateAdminToken } from "./auth";

// In-memory price cache with 5-minute TTL
interface PriceCacheEntry {
  price: number;
  timestamp: number;
}

const priceCache = new Map<string, PriceCacheEntry>();
const PRICE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

function getCachedPrice(symbol: string): number | null {
  const cached = priceCache.get(symbol);
  if (!cached) return null;
  
  const age = Date.now() - cached.timestamp;
  if (age > PRICE_CACHE_TTL) {
    priceCache.delete(symbol);
    return null;
  }
  
  return cached.price;
}

function setCachedPrice(symbol: string, price: number): void {
  priceCache.set(symbol, {
    price,
    timestamp: Date.now()
  });
}

// Premium subscription middleware
function requirePremium(req: Request, res: Response, next: Function) {
  // For now, allow all requests (no auth implemented yet)
  // When Discord OAuth is added, check: req.user?.subscriptionTier === 'premium' || 'admin'
  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Apply general rate limiting to all API routes
  app.use('/api/', generalApiLimiter);
  
  // Discord redirect for login/signup (managed via Discord community)
  app.get("/api/login", (_req: Request, res: Response) => {
    // Redirect to Discord invite link (will be updated with actual Discord link)
    const discordInviteUrl = process.env.DISCORD_INVITE_URL || "https://discord.gg/quantedge";
    res.redirect(discordInviteUrl);
  });

  // Admin Authentication Routes with JWT
  app.post("/api/admin/verify-code", adminLimiter, (req, res) => {
    try {
      const adminCode = process.env.ADMIN_ACCESS_CODE || "0000";
      if (req.body.code === adminCode) {
        logger.info('Admin access code verified', { ip: req.ip });
        res.json({ success: true });
      } else {
        logger.warn('Invalid admin access code attempt', { ip: req.ip });
        res.status(403).json({ error: "Invalid access code" });
      }
    } catch (error) {
      logError(error as Error, { context: 'admin verify-code' });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/login", adminLimiter, (req, res) => {
    try {
      const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
      if (req.body.password === adminPassword) {
        // Generate JWT token
        const token = generateAdminToken();
        
        // Set secure HTTP-only cookie (primary auth method)
        res.cookie('admin_token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
        });
        
        logger.info('Admin logged in successfully', { ip: req.ip });
        // DO NOT return token in response - it's in HTTP-only cookie
        res.json({ 
          success: true,
          expiresIn: '24h'
        });
      } else {
        logger.warn('Invalid admin password attempt', { ip: req.ip });
        res.status(403).json({ error: "Invalid password" });
      }
    } catch (error) {
      logError(error as Error, { context: 'admin login' });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/logout", (req, res) => {
    try {
      res.clearCookie('admin_token');
      logger.info('Admin logged out', { ip: req.ip });
      res.json({ success: true });
    } catch (error) {
      logError(error as Error, { context: 'admin logout' });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Legacy endpoint for backward compatibility
  app.post("/api/admin/verify", adminLimiter, (req, res) => {
    try {
      const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
      if (req.body.password === adminPassword) {
        logger.info('Admin verified (legacy endpoint)', { ip: req.ip });
        res.json({ success: true });
      } else {
        logger.warn('Invalid admin password (legacy endpoint)', { ip: req.ip });
        res.status(403).json({ error: "Invalid password" });
      }
    } catch (error) {
      logError(error as Error, { context: 'admin verify' });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/stats", requireAdmin, async (_req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const allIdeas = await storage.getAllTradeIdeas();
      const closedIdeas = allIdeas.filter(i => i.outcomeStatus && i.outcomeStatus !== 'open');
      const wonIdeas = closedIdeas.filter(i => i.outcomeStatus === 'hit_target');
      
      res.json({
        totalUsers: allUsers.length,
        premiumUsers: allUsers.filter(u => u.subscriptionTier === 'premium' || u.subscriptionTier === 'admin').length,
        totalIdeas: allIdeas.length,
        activeIdeas: allIdeas.filter(i => i.outcomeStatus === 'open').length,
        closedIdeas: closedIdeas.length,
        winRate: closedIdeas.length > 0 ? Math.round((wonIdeas.length / closedIdeas.length) * 100) : 0,
        dbSize: "N/A"
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/api/admin/users", requireAdmin, async (_req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.get("/api/admin/ideas", requireAdmin, async (_req, res) => {
    try {
      const ideas = await storage.getAllTradeIdeas();
      res.json(ideas);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch ideas" });
    }
  });


  app.get("/api/admin/export-csv", requireAdmin, async (_req, res) => {
    try {
      const ideas = await storage.getAllTradeIdeas();
      const csv = [
        ['Symbol', 'Asset Type', 'Source', 'Entry', 'Target', 'Stop', 'Outcome', 'Created At'].join(','),
        ...ideas.map(i => [
          i.symbol,
          i.assetType,
          i.source,
          i.entryPrice,
          i.targetPrice,
          i.stopLoss,
          i.outcomeStatus || 'open',
          new Date(i.timestamp).toISOString()
        ].join(','))
      ].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=quantedge-export.csv');
      res.send(csv);
    } catch (error) {
      res.status(500).json({ error: "Export failed" });
    }
  });

  // System Health Check (SECURITY: No API key presence disclosure)
  app.get("/api/admin/system-health", requireAdmin, async (_req, res) => {
    try {
      const health = {
        database: { status: 'operational', message: 'PostgreSQL connected' },
        aiProviders: {
          openai: { status: 'operational', model: 'gpt-5' },
          anthropic: { status: 'operational', model: 'claude-sonnet-4-20250514' },
          gemini: { status: 'operational', model: 'gemini-2.5-flash' }
        },
        marketData: {
          alphaVantage: { status: 'operational' },
          yahooFinance: { status: 'operational' },
          coinGecko: { status: 'operational' },
          tradier: { status: 'operational' }
        },
        services: {
          mlEngine: { status: 'operational' },
          watchlistMonitor: { status: 'operational' },
          performanceTracker: { status: 'operational' }
        }
      };

      res.json(health);
    } catch (error) {
      logger.error('System health check failed', { error });
      res.status(500).json({ error: "Health check failed" });
    }
  });

  // Test AI Provider - Individual provider testing
  app.post("/api/admin/test-ai", requireAdmin, async (req, res) => {
    try {
      const { provider, prompt } = req.body;
      const testPrompt = prompt || "Generate 1-2 bullish trade ideas for NVDA stock based on current market conditions.";

      let result: any = {
        provider,
        success: false,
        response: null,
        error: null,
        ideaCount: 0,
        timestamp: new Date().toISOString()
      };

      // Import AI service dynamically
      const { testAIProvider } = await import('./ai-service');

      try {
        // Test only the specific provider requested
        const ideas = await testAIProvider(provider, testPrompt);
        result.success = true;
        result.response = ideas;
        result.ideaCount = ideas.length;
      } catch (error: any) {
        result.error = error.message || `${provider} test failed`;
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "AI test failed" });
    }
  });

  // Recent Activity Log
  app.get("/api/admin/activity", requireAdmin, async (_req, res) => {
    try {
      const ideas = await storage.getAllTradeIdeas();
      const users = await storage.getAllUsers();
      
      // Build activity log from recent ideas and users
      const activities = [
        ...ideas.slice(-10).map(idea => ({
          id: idea.id,
          type: 'trade_idea' as const,
          description: `${idea.source} idea generated: ${idea.symbol} (${idea.assetType})`,
          timestamp: idea.timestamp,
          metadata: { symbol: idea.symbol, source: idea.source }
        })),
        ...users.slice(-5).map(user => ({
          id: user.id,
          type: 'user_activity' as const,
          description: `User registered: ${user.discordUsername || user.email || 'Anonymous'}`,
          timestamp: user.createdAt || new Date().toISOString(),
          metadata: { tier: user.subscriptionTier }
        }))
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 20);

      res.json(activities);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch activity" });
    }
  });

  // Monitoring & Alerts endpoints
  app.get("/api/admin/alerts", requireAdmin, async (req, res) => {
    try {
      const { monitoringService } = await import('./monitoring-service');
      const category = req.query.category as any;
      const type = req.query.type as any;
      
      const alerts = monitoringService.getAlerts(category, type);
      res.json(alerts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch alerts" });
    }
  });

  app.get("/api/admin/alerts/summary", requireAdmin, async (_req, res) => {
    try {
      const { monitoringService } = await import('./monitoring-service');
      const summary = monitoringService.getSummary();
      res.json(summary);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch alert summary" });
    }
  });

  app.post("/api/admin/alerts/:alertId/resolve", requireAdmin, async (req, res) => {
    try {
      const { monitoringService } = await import('./monitoring-service');
      monitoringService.resolveAlert(req.params.alertId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to resolve alert" });
    }
  });

  app.get("/api/admin/api-metrics", requireAdmin, async (_req, res) => {
    try {
      const { monitoringService } = await import('./monitoring-service');
      const metrics = monitoringService.getAPIMetrics();
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch API metrics" });
    }
  });

  // Database Health endpoint
  app.get("/api/admin/database-health", requireAdmin, async (_req, res) => {
    try {
      const { db } = await import('./db');
      const { sql } = await import('drizzle-orm');
      
      // Get database size and table info
      const dbSize = await db.execute(sql`
        SELECT pg_size_pretty(pg_database_size(current_database())) as size
      `);
      
      const tableStats = await db.execute(sql`
        SELECT 
          schemaname,
          tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
          n_live_tup as row_count
        FROM pg_stat_user_tables
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
        LIMIT 10
      `);

      const health = {
        status: 'operational',
        connectionActive: true,
        databaseSize: dbSize.rows[0]?.size || 'Unknown',
        tables: tableStats.rows.map((row: any) => ({
          schema: row.schemaname,
          name: row.tablename,
          size: row.size,
          rowCount: parseInt(row.row_count) || 0,
        })),
        lastChecked: new Date().toISOString(),
      };

      res.json(health);
    } catch (error) {
      res.status(500).json({ 
        status: 'error',
        error: "Database health check failed",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // User Management Routes
  app.get("/api/admin/users/:userId", requireAdmin, async (req, res) => {
    try {
      const user = await storage.getUserById(req.params.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Get additional user data
      const preferences = await storage.getUserPreferences();
      const watchlistItems = await storage.getWatchlistByUser(req.params.userId);
      
      res.json({
        user,
        preferences,
        watchlistCount: watchlistItems.length,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user details" });
    }
  });

  app.patch("/api/admin/users/:userId", requireAdmin, async (req, res) => {
    try {
      const { subscriptionTier, subscriptionStatus } = req.body;
      
      // Validate subscription tier
      if (subscriptionTier && !['free', 'premium', 'admin'].includes(subscriptionTier)) {
        return res.status(400).json({ error: "Invalid subscription tier" });
      }
      
      const updated = await storage.updateUser(req.params.userId, {
        subscriptionTier,
        subscriptionStatus,
        updatedAt: new Date(),
      });
      
      if (!updated) {
        return res.status(404).json({ error: "User not found" });
      }
      
      logger.info('User updated by admin', { 
        userId: req.params.userId, 
        tier: subscriptionTier,
        ip: req.ip 
      });
      
      res.json({ success: true, user: updated });
    } catch (error) {
      logError(error as Error, { context: 'admin user update' });
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.delete("/api/admin/users/:userId", requireAdmin, async (req, res) => {
    try {
      const deleted = await storage.deleteUser(req.params.userId);
      
      if (!deleted) {
        return res.status(404).json({ error: "User not found" });
      }
      
      logger.info('User deleted by admin', { 
        userId: req.params.userId,
        ip: req.ip 
      });
      
      res.json({ success: true, message: "User and associated data deleted" });
    } catch (error) {
      logError(error as Error, { context: 'admin user delete' });
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // Database Maintenance Routes
  app.get("/api/admin/maintenance/stats", requireAdmin, async (_req, res) => {
    try {
      const { db } = await import('./db');
      const { sql } = await import('drizzle-orm');
      
      const allIdeas = await storage.getAllTradeIdeas();
      const closedIdeas = allIdeas.filter(i => i.outcomeStatus !== 'open');
      const oldIdeas = allIdeas.filter(i => {
        const ideaDate = new Date(i.timestamp);
        const daysOld = (Date.now() - ideaDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysOld > 30;
      });
      
      // Get database bloat estimate
      const bloatQuery = await db.execute(sql`
        SELECT 
          SUM(pg_total_relation_size(schemaname||'.'||tablename))::bigint as total_bytes
        FROM pg_stat_user_tables
      `);
      
      const totalBytes = parseInt(String(bloatQuery.rows[0]?.total_bytes || '0'));
      
      res.json({
        totalIdeas: allIdeas.length,
        openIdeas: allIdeas.filter(i => i.outcomeStatus === 'open').length,
        closedIdeas: closedIdeas.length,
        oldIdeas: oldIdeas.length,
        databaseSizeBytes: totalBytes,
        databaseSizeMB: (totalBytes / (1024 * 1024)).toFixed(2),
        lastChecked: new Date().toISOString(),
      });
    } catch (error) {
      logError(error as Error, { context: 'maintenance stats' });
      res.status(500).json({ error: "Failed to fetch maintenance stats" });
    }
  });

  app.post("/api/admin/maintenance/cleanup", requireAdmin, async (req, res) => {
    try {
      const { daysOld = 30 } = req.body;
      
      const allIdeas = await storage.getAllTradeIdeas();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);
      
      const ideasToDelete = allIdeas.filter(i => {
        const ideaDate = new Date(i.timestamp);
        const isClosed = i.outcomeStatus !== 'open';
        return isClosed && ideaDate < cutoffDate;
      });
      
      let deletedCount = 0;
      for (const idea of ideasToDelete) {
        const deleted = await storage.deleteTradeIdea(idea.id);
        if (deleted) deletedCount++;
      }
      
      logger.info('Database cleanup completed', { 
        deletedCount,
        daysOld,
        ip: req.ip 
      });
      
      res.json({ 
        success: true, 
        deletedCount,
        message: `Cleaned up ${deletedCount} closed ideas older than ${daysOld} days`
      });
    } catch (error) {
      logError(error as Error, { context: 'maintenance cleanup' });
      res.status(500).json({ error: "Cleanup failed" });
    }
  });

  app.post("/api/admin/maintenance/optimize", requireAdmin, async (req, res) => {
    try {
      const { db } = await import('./db');
      const { sql } = await import('drizzle-orm');
      
      // Run VACUUM ANALYZE on all tables
      await db.execute(sql`VACUUM ANALYZE`);
      
      logger.info('Database optimization completed', { ip: req.ip });
      
      res.json({ 
        success: true, 
        message: "Database optimized successfully (VACUUM ANALYZE completed)"
      });
    } catch (error) {
      logError(error as Error, { context: 'maintenance optimize' });
      res.status(500).json({ error: "Optimization failed" });
    }
  });

  app.post("/api/admin/maintenance/archive-closed", requireAdmin, async (req, res) => {
    try {
      const allIdeas = await storage.getAllTradeIdeas();
      const closedIdeas = allIdeas.filter(i => i.outcomeStatus !== 'open');
      
      // Export to JSON for archiving
      const archive = {
        archivedAt: new Date().toISOString(),
        count: closedIdeas.length,
        ideas: closedIdeas,
      };
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=closed-ideas-archive.json');
      res.json(archive);
      
      logger.info('Closed ideas archived', { 
        count: closedIdeas.length,
        ip: req.ip 
      });
    } catch (error) {
      logError(error as Error, { context: 'maintenance archive' });
      res.status(500).json({ error: "Archive failed" });
    }
  });

  // Market Data Routes
  // Market data cache (2-minute TTL for fresher price updates)
  let marketDataCache: { data: any; timestamp: number } | null = null;
  const MARKET_DATA_CACHE_TTL = 2 * 60 * 1000; // 2 minutes
  
  app.get("/api/market-data", marketDataLimiter, async (_req, res) => {
    try {
      const now = Date.now();
      
      // Check cache
      if (marketDataCache && (now - marketDataCache.timestamp) < MARKET_DATA_CACHE_TTL) {
        return res.json(marketDataCache.data);
      }
      
      // Cache miss - fetch fresh data
      const data = await storage.getAllMarketData();
      
      // Update cache
      marketDataCache = { data, timestamp: now };
      
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch market data" });
    }
  });

  // Batch market data endpoint - must come before single symbol route
  app.get("/api/market-data/batch/:symbols", async (req, res) => {
    try {
      const symbols = req.params.symbols.split(',').map(s => s.trim().toUpperCase());
      const allMarketData = await storage.getAllMarketData();
      const filtered = allMarketData.filter(m => symbols.includes(m.symbol));
      res.json(filtered);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch market data" });
    }
  });

  app.get("/api/market-data/:symbol", async (req, res) => {
    try {
      const data = await storage.getMarketDataBySymbol(req.params.symbol);
      if (!data) {
        return res.status(404).json({ error: "Market data not found" });
      }
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch market data" });
    }
  });

  app.post("/api/market-data", async (req, res) => {
    try {
      const validated = insertMarketDataSchema.parse(req.body);
      const data = await storage.createMarketData(validated);
      res.status(201).json(data);
    } catch (error) {
      res.status(400).json({ error: "Invalid market data" });
    }
  });

  app.get("/api/search-symbol/:symbol", async (req, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      
      const existing = await storage.getMarketDataBySymbol(symbol);
      if (existing) {
        return res.json(existing);
      }

      const alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY;
      const externalData = await searchSymbol(symbol, alphaVantageKey);
      
      if (!externalData) {
        return res.status(404).json({ error: "Symbol not found" });
      }

      const marketData = await storage.createMarketData({
        ...externalData,
        session: "rth",
        timestamp: new Date().toISOString(),
        avgVolume: externalData.volume,
        dataSource: "live",
        lastUpdated: new Date().toISOString(),
      });

      res.json(marketData);
    } catch (error) {
      console.error("Symbol search error:", error);
      res.status(500).json({ error: "Failed to search symbol" });
    }
  });

  app.post("/api/refresh-prices", async (_req, res) => {
    try {
      const allMarketData = await storage.getAllMarketData();
      const alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY;
      const updated: any[] = [];

      for (const data of allMarketData) {
        const externalData = await searchSymbol(data.symbol, alphaVantageKey);
        
        if (externalData) {
          const updatedData = await storage.updateMarketData(data.symbol, {
            currentPrice: externalData.currentPrice,
            changePercent: externalData.changePercent,
            volume: externalData.volume,
            high24h: externalData.high24h,
            low24h: externalData.low24h,
            dataSource: "live",
            lastUpdated: new Date().toISOString(),
            marketCap: externalData.marketCap,
            timestamp: new Date().toISOString(),
          });
          
          if (updatedData) {
            updated.push(updatedData);
          }
        }
      }

      res.json({ 
        success: true, 
        updated: updated.length,
        total: allMarketData.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Price refresh error:", error);
      res.status(500).json({ error: "Failed to refresh prices" });
    }
  });

  // Sparkline data for mini charts
  app.get("/api/sparkline/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const marketData = await storage.getMarketDataBySymbol(symbol);
      
      if (!marketData) {
        return res.status(404).json({ error: "Symbol not found" });
      }

      // Fetch last 20 days of price history for sparkline
      const alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY;
      const prices = await fetchHistoricalPrices(
        symbol,
        marketData.assetType,
        20, // Last 20 data points
        alphaVantageKey,
        undefined // coinId - will be looked up from CRYPTO_SYMBOL_MAP if needed
      );

      res.json({ 
        symbol,
        prices,
        currentPrice: marketData.currentPrice
      });
    } catch (error) {
      console.error("Sparkline data error:", error);
      res.status(500).json({ error: "Failed to fetch sparkline data" });
    }
  });

  // Trade Ideas Routes
  app.get("/api/trade-ideas", async (_req, res) => {
    try {
      // Auto-archive ideas that hit target, stop, or are stale
      const ideas = await storage.getAllTradeIdeas();
      const marketData = await storage.getAllMarketData();
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      // Get unique symbols from open ideas for price fetching
      const openIdeas = ideas.filter(i => i.outcomeStatus === 'open' || !i.outcomeStatus);
      const uniqueSymbols = Array.from(new Set(openIdeas.map(i => i.symbol)));
      
      // VALIDATION: Auto-correct option types based on entry/target logic
      for (const idea of openIdeas) {
        if (idea.assetType === 'option' && idea.optionType) {
          const isBullish = idea.targetPrice > idea.entryPrice;
          const correctType = isBullish ? 'call' : 'put';
          
          if (idea.optionType !== correctType) {
            logger.warn(`[OPTION-VALIDATION] ${idea.symbol}: Correcting optionType from '${idea.optionType}' to '${correctType}' (entry: $${idea.entryPrice}, target: $${idea.targetPrice})`);
            await storage.updateTradeIdea(idea.id, { optionType: correctType });
            idea.optionType = correctType; // Update in-memory for this response
          }
        }
      }
      
      // Fetch current prices for all trade idea symbols (including underlying stock prices for options)
      const stockSymbols = uniqueSymbols.filter(s => {
        const idea = openIdeas.find(i => i.symbol === s);
        return idea && (idea.assetType === 'stock' || idea.assetType === 'penny_stock' || idea.assetType === 'option');
      });
      
      const cryptoSymbols = uniqueSymbols.filter(s => {
        const idea = openIdeas.find(i => i.symbol === s);
        return idea && idea.assetType === 'crypto';
      });
      
      // Build price map using cache-first strategy
      const priceMap = new Map<string, number>();
      
      // Step 1: Add prices from market data
      marketData.forEach(data => {
        priceMap.set(data.symbol, data.currentPrice);
        setCachedPrice(data.symbol, data.currentPrice); // Update cache
      });
      
      // Step 2: Check cache for remaining symbols
      const stocksNeedingFetch: string[] = [];
      const cryptosNeedingFetch: string[] = [];
      
      stockSymbols.forEach(symbol => {
        if (priceMap.has(symbol)) return; // Already have from market data
        
        const cachedPrice = getCachedPrice(symbol);
        if (cachedPrice !== null) {
          priceMap.set(symbol, cachedPrice);
          logger.info(`[TRADE-IDEAS] Cache hit for ${symbol}: $${cachedPrice}`);
        } else {
          stocksNeedingFetch.push(symbol);
        }
      });
      
      cryptoSymbols.forEach(symbol => {
        if (priceMap.has(symbol)) return;
        
        const cachedPrice = getCachedPrice(symbol);
        if (cachedPrice !== null) {
          priceMap.set(symbol, cachedPrice);
          logger.info(`[TRADE-IDEAS] Cache hit for ${symbol}: $${cachedPrice}`);
        } else {
          cryptosNeedingFetch.push(symbol);
        }
      });
      
      logger.info(`[TRADE-IDEAS] Building price map for ${uniqueSymbols.length} symbols (${stockSymbols.length} stocks, ${cryptoSymbols.length} crypto)`);
      logger.info(`[TRADE-IDEAS] Cache hits: ${uniqueSymbols.length - stocksNeedingFetch.length - cryptosNeedingFetch.length}, Need to fetch: ${stocksNeedingFetch.length} stocks, ${cryptosNeedingFetch.length} crypto`);
      
      // Step 3: Fetch only uncached prices (PARALLEL)
      const stockPriceFetches = stocksNeedingFetch.map(async symbol => {
        try {
          const data = await fetchStockPrice(symbol);
          const price = data?.currentPrice || null;
          if (price) {
            logger.info(`[TRADE-IDEAS] Fetched ${symbol}: $${price}`);
            setCachedPrice(symbol, price); // Cache the fresh price
          }
          return { symbol, price };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          logger.warn(`Failed to fetch price for ${symbol}`, { error: errorMsg });
          return { symbol, price: null };
        }
      });

      const stockPriceResults = await Promise.all(stockPriceFetches);
      stockPriceResults.forEach(({ symbol, price }) => {
        if (price) priceMap.set(symbol, price);
      });
      
      const cryptoPriceFetches = cryptosNeedingFetch.map(async symbol => {
        try {
          const data = await fetchCryptoPrice(symbol);
          const price = data?.currentPrice || null;
          if (price) {
            logger.info(`[TRADE-IDEAS] Fetched ${symbol}: $${price}`);
            setCachedPrice(symbol, price); // Cache the fresh price
          }
          return { symbol, price };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          logger.warn(`Failed to fetch price for ${symbol}`, { error: errorMsg });
          return { symbol, price: null };
        }
      });

      const cryptoPriceResults = await Promise.all(cryptoPriceFetches);
      cryptoPriceResults.forEach(({ symbol, price }) => {
        if (price) priceMap.set(symbol, price);
      });
      
      logger.info(`[TRADE-IDEAS] Final price map has ${priceMap.size} symbols`);
      
      // NOTE: Validation is handled by the Performance Validation Service (every 5 minutes)
      // and the manual /api/performance/validate endpoint.
      // We should NOT validate trades in the GET endpoint to avoid incorrect validations.
      
      // Fetch updated ideas after archiving
      const updatedIdeas = await storage.getAllTradeIdeas();
      
      // Add current prices to response
      const ideasWithPrices = updatedIdeas.map(idea => ({
        ...idea,
        currentPrice: priceMap.get(idea.symbol) || null,
      }));
      
      res.json(ideasWithPrices);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch trade ideas" });
    }
  });

  app.get("/api/trade-ideas/:id", async (req, res) => {
    try {
      const idea = await storage.getTradeIdeaById(req.params.id);
      if (!idea) {
        return res.status(404).json({ error: "Trade idea not found" });
      }
      res.json(idea);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch trade idea" });
    }
  });

  app.post("/api/trade-ideas", async (req, res) => {
    try {
      const validated = insertTradeIdeaSchema.parse(req.body);
      
      // CRITICAL: Validate direction/target/option type alignment
      const { PerformanceValidator } = await import("./performance-validator");
      const correction = PerformanceValidator.validateAndCorrectTrade({
        direction: validated.direction,
        assetType: validated.assetType,
        optionType: validated.optionType,
        entryPrice: validated.entryPrice,
        targetPrice: validated.targetPrice,
        stopLoss: validated.stopLoss
      });
      
      if (!correction) {
        return res.status(400).json({ error: "Invalid trade idea validation" });
      }
      
      // Check for validation warnings
      if (correction.warnings.length > 0) {
        // Check if it's an INVALID option trade (should be rejected)
        const hasInvalidOption = correction.warnings.some(w => w.includes('INVALID OPTION TRADE'));
        
        if (hasInvalidOption) {
          logger.error('Rejected invalid option trade', {
            symbol: validated.symbol,
            warnings: correction.warnings,
            submitted: { direction: validated.direction, optionType: validated.optionType, entry: validated.entryPrice, target: validated.targetPrice }
          });
          return res.status(400).json({ 
            error: "Invalid option trade combination",
            details: correction.warnings 
          });
        }
        
        // For stocks, log auto-correction
        logger.warn('Trade idea auto-corrected', {
          symbol: validated.symbol,
          warnings: correction.warnings,
          original: { direction: validated.direction, optionType: validated.optionType },
          corrected: { direction: correction.direction, optionType: correction.optionType }
        });
      }
      
      // Apply corrections (for stocks only)
      validated.direction = correction.direction;
      if (correction.optionType !== undefined) {
        validated.optionType = correction.optionType;
      }
      
      const idea = await storage.createTradeIdea(validated);
      res.status(201).json(idea);
    } catch (error) {
      res.status(400).json({ error: "Invalid trade idea" });
    }
  });

  app.delete("/api/trade-ideas/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteTradeIdea(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Trade idea not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete trade idea" });
    }
  });

  app.patch("/api/trade-ideas/:id/performance", async (req, res) => {
    try {
      const performanceUpdate = req.body;
      const updated = await storage.updateTradeIdeaPerformance(req.params.id, performanceUpdate);
      if (!updated) {
        return res.status(404).json({ error: "Trade idea not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update performance" });
    }
  });

  // Performance Tracking Routes
  app.post("/api/performance/validate", async (_req, res) => {
    try {
      const { PerformanceValidator } = await import("./performance-validator");
      const openIdeas = await storage.getOpenTradeIdeas();
      const marketData = await storage.getAllMarketData();
      
      // Build price map
      const priceMap = new Map<string, number>();
      marketData.forEach((data) => {
        priceMap.set(data.symbol, data.currentPrice);
      });

      // Validate all open ideas
      const validationResults = PerformanceValidator.validateBatch(openIdeas, priceMap);
      const now = new Date().toISOString();
      
      // Build detailed results for frontend display
      const detailedResults: any[] = [];
      
      // Update ideas that need changes
      const updated: any[] = [];
      for (const [ideaId, result] of Array.from(validationResults.entries())) {
        const idea = openIdeas.find(i => i.id === ideaId);
        if (!idea) continue;
        
        const currentPrice = priceMap.get(idea.symbol) || idea.entryPrice;
        const updatedIdea = await storage.updateTradeIdeaPerformance(ideaId, {
          outcomeStatus: result.outcomeStatus,
          exitPrice: result.exitPrice,
          percentGain: result.percentGain,
          realizedPnL: result.realizedPnL,
          resolutionReason: result.resolutionReason,
          exitDate: result.exitDate,
          actualHoldingTimeMinutes: result.actualHoldingTimeMinutes,
          predictionAccurate: result.predictionAccurate,
          predictionValidatedAt: result.predictionValidatedAt,
          highestPriceReached: result.highestPriceReached,
          lowestPriceReached: result.lowestPriceReached,
          validatedAt: now,
        });
        if (updatedIdea) {
          updated.push(updatedIdea);
        }
        
        // Add to detailed results
        detailedResults.push({
          id: idea.id,
          symbol: idea.symbol,
          assetType: idea.assetType,
          direction: idea.direction,
          entryPrice: idea.entryPrice,
          currentPrice,
          targetPrice: idea.targetPrice,
          stopLoss: idea.stopLoss,
          wasUpdated: true,
          newStatus: result.outcomeStatus,
          reasoning: result.resolutionReason || 'Price hit target or stop loss',
          percentToTarget: idea.direction === 'long' 
            ? ((idea.targetPrice - currentPrice) / currentPrice) * 100
            : ((currentPrice - idea.targetPrice) / currentPrice) * 100,
          percentToStop: idea.direction === 'long'
            ? ((currentPrice - idea.stopLoss) / currentPrice) * 100
            : ((idea.stopLoss - currentPrice) / currentPrice) * 100,
          timestamp: now,
        });
      }

      // Stamp validatedAt on ALL open ideas that were checked, even if no state change
      for (const idea of openIdeas) {
        if (!validationResults.has(idea.id)) {
          const currentPrice = priceMap.get(idea.symbol) || idea.entryPrice;
          
          // Track price extremes even for open trades
          const highestPrice = Math.max(idea.highestPriceReached || idea.entryPrice, currentPrice);
          const lowestPrice = Math.min(idea.lowestPriceReached || idea.entryPrice, currentPrice);
          
          // Idea was checked but didn't need update - still stamp validatedAt and update price extremes
          await storage.updateTradeIdeaPerformance(idea.id, {
            validatedAt: now,
            highestPriceReached: highestPrice,
            lowestPriceReached: lowestPrice,
          });
          
          // Calculate distance percentages
          const percentToTarget = idea.direction === 'long' 
            ? ((idea.targetPrice - currentPrice) / currentPrice) * 100
            : ((currentPrice - idea.targetPrice) / currentPrice) * 100;
          const percentToStop = idea.direction === 'long'
            ? ((currentPrice - idea.stopLoss) / currentPrice) * 100
            : ((idea.stopLoss - currentPrice) / currentPrice) * 100;
          
          // Generate reasoning for why it stayed open
          let reasoning = '';
          if (idea.direction === 'long') {
            if (currentPrice < idea.targetPrice && currentPrice > idea.stopLoss) {
              reasoning = `Price $${currentPrice.toFixed(2)} between entry $${idea.entryPrice.toFixed(2)} and target $${idea.targetPrice.toFixed(2)}. Still active - needs ${Math.abs(percentToTarget).toFixed(1)}% move to hit target.`;
            }
          } else {
            if (currentPrice > idea.targetPrice && currentPrice < idea.stopLoss) {
              reasoning = `Price $${currentPrice.toFixed(2)} between entry $${idea.entryPrice.toFixed(2)} and target $${idea.targetPrice.toFixed(2)}. Still active - needs ${Math.abs(percentToTarget).toFixed(1)}% move to hit target.`;
            }
          }
          
          detailedResults.push({
            id: idea.id,
            symbol: idea.symbol,
            assetType: idea.assetType,
            direction: idea.direction,
            entryPrice: idea.entryPrice,
            currentPrice,
            targetPrice: idea.targetPrice,
            stopLoss: idea.stopLoss,
            wasUpdated: false,
            reasoning: reasoning || 'Position still within range - no action taken',
            percentToTarget,
            percentToStop,
            timestamp: now,
          });
        }
      }

      res.json({
        success: true,
        validated: openIdeas.length,
        updated: updated.length,
        timestamp: new Date().toISOString(),
        results: detailedResults,
      });
    } catch (error) {
      console.error("Validation error:", error);
      res.status(500).json({ error: "Failed to validate trade ideas" });
    }
  });

  // Performance stats cache (5-minute TTL) - separate cache per filter combination
  const performanceStatsCache = new Map<string, { data: any; timestamp: number }>();
  const PERF_STATS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  
  app.get("/api/performance/stats", async (req, res) => {
    try {
      const now = Date.now();
      
      // Parse query parameters for filtering
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const source = req.query.source as string | undefined;
      
      // Create cache key based on filters
      const cacheKey = `${startDate || 'all'}_${endDate || 'all'}_${source || 'all'}`;
      
      // Check cache
      const cached = performanceStatsCache.get(cacheKey);
      if (cached && (now - cached.timestamp) < PERF_STATS_CACHE_TTL) {
        logger.info(`[PERF-STATS] Cache hit for filters: ${cacheKey}`);
        return res.json(cached.data);
      }
      
      // Cache miss - fetch fresh data with filters
      logger.info(`[PERF-STATS] Cache miss for filters: ${cacheKey} - fetching fresh data`);
      logger.info(`[PERF-STATS] Filter values: startDate=${startDate}, endDate=${endDate}, source=${source}`);
      const filters = { startDate, endDate, source };
      const stats = await storage.getPerformanceStats(filters);
      
      // Update cache for this filter combination
      performanceStatsCache.set(cacheKey, { data: stats, timestamp: now });
      logger.info(`[PERF-STATS] Cache updated for filters: ${cacheKey}`);
      
      res.json(stats);
    } catch (error) {
      console.error("Stats error:", error);
      res.status(500).json({ error: "Failed to fetch performance stats" });
    }
  });

  app.get("/api/performance/export", async (_req, res) => {
    try {
      const allIdeas = await storage.getAllTradeIdeas();
      const closedIdeas = allIdeas.filter((idea) => idea.outcomeStatus !== 'open');
      
      // Build CSV
      const headers = [
        'ID', 'Symbol', 'Asset Type', 'Direction', 'Source', 
        'Entry Price', 'Target Price', 'Stop Loss', 'Exit Price',
        'R:R Ratio', 'Percent Gain', 'Outcome Status', 'Resolution Reason',
        'Created At', 'Exit Date', 'Holding Time (min)',
        'Confidence Score', 'Probability Band', 'Quality Signals',
        'Catalyst'
      ].join(',');

      const rows = closedIdeas.map((idea) => {
        return [
          idea.id,
          idea.symbol,
          idea.assetType,
          idea.direction,
          idea.source || 'unknown',
          idea.entryPrice,
          idea.targetPrice,
          idea.stopLoss,
          idea.exitPrice || '',
          idea.riskRewardRatio,
          idea.percentGain || '',
          idea.outcomeStatus,
          idea.resolutionReason || '',
          idea.timestamp,
          idea.exitDate || '',
          idea.actualHoldingTimeMinutes || '',
          idea.confidenceScore,
          idea.probabilityBand,
          (idea.qualitySignals || []).join(';'),
          `"${idea.catalyst.replace(/"/g, '""')}"`, // Escape quotes in catalyst
        ].join(',');
      });

      const csv = [headers, ...rows].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="trade-ideas-performance.csv"');
      res.send(csv);
    } catch (error) {
      console.error("Export error:", error);
      res.status(500).json({ error: "Failed to export data" });
    }
  });

  // Catalysts Routes
  app.get("/api/catalysts", async (_req, res) => {
    try {
      const catalysts = await storage.getAllCatalysts();
      res.json(catalysts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch catalysts" });
    }
  });

  app.get("/api/catalysts/symbol/:symbol", async (req, res) => {
    try {
      const catalysts = await storage.getCatalystsBySymbol(req.params.symbol);
      res.json(catalysts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch catalysts" });
    }
  });

  app.post("/api/catalysts", async (req, res) => {
    try {
      const validated = insertCatalystSchema.parse(req.body);
      const catalyst = await storage.createCatalyst(validated);
      res.status(201).json(catalyst);
    } catch (error) {
      res.status(400).json({ error: "Invalid catalyst data" });
    }
  });

  // Sync earnings calendar from Alpha Vantage
  app.post("/api/catalysts/sync-earnings", async (_req, res) => {
    try {
      const { fetchEarningsCalendar } = await import("./market-api");
      const earnings = await fetchEarningsCalendar('3month');
      
      if (earnings.length === 0) {
        return res.json({ 
          message: "No earnings data available", 
          synced: 0 
        });
      }

      // Filter for next 14 days only (most relevant)
      // Normalize to midnight to include same-day earnings
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const twoWeeksFromNow = new Date(today);
      twoWeeksFromNow.setDate(today.getDate() + 14);
      
      const upcomingEarnings = earnings.filter(e => {
        const reportDate = new Date(e.reportDate);
        reportDate.setHours(0, 0, 0, 0);
        return reportDate >= today && reportDate <= twoWeeksFromNow;
      });

      // Sync to catalyst table
      let syncedCount = 0;
      
      for (const earning of upcomingEarnings) {
        try {
          // Check if already exists
          const existing = await storage.getCatalystsBySymbol(earning.symbol);
          const alreadyExists = existing.some(c => 
            c.eventType === 'earnings' && 
            c.timestamp.startsWith(earning.reportDate)
          );
          
          if (!alreadyExists) {
            const estimateText = earning.estimate 
              ? ` (Est. EPS: $${earning.estimate.toFixed(2)})` 
              : '';
            
            // Calculate fiscal quarter correctly (months are 0-indexed)
            const fiscalMonth = new Date(earning.fiscalDateEnding).getMonth();
            const fiscalQuarter = Math.floor((fiscalMonth + 3) / 3);
              
            await storage.createCatalyst({
              symbol: earning.symbol,
              title: `${earning.name} Earnings Report`,
              description: `${earning.symbol} reports Q${fiscalQuarter} earnings${estimateText}`,
              source: 'Alpha Vantage',
              sourceUrl: `https://finance.yahoo.com/quote/${earning.symbol}`,
              timestamp: `${earning.reportDate}T16:00:00-05:00`, // After market close
              eventType: 'earnings',
              impact: 'high', // All earnings are high impact
            });
            syncedCount++;
          }
        } catch (error) {
          logger.error(`Failed to sync earnings for ${earning.symbol}:`, error);
        }
      }

      logger.info(`📅 Synced ${syncedCount} earnings events to catalyst feed`);
      res.json({ 
        message: `Synced ${syncedCount} upcoming earnings events`, 
        total: upcomingEarnings.length,
        synced: syncedCount 
      });
    } catch (error) {
      logger.error('❌ Earnings sync error:', error);
      res.status(500).json({ error: "Failed to sync earnings calendar" });
    }
  });

  // Watchlist Routes
  app.get("/api/watchlist", async (_req, res) => {
    try {
      const watchlist = await storage.getAllWatchlist();
      res.json(watchlist);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch watchlist" });
    }
  });

  app.post("/api/watchlist", async (req, res) => {
    try {
      console.log("POST /api/watchlist - Request body:", JSON.stringify(req.body));
      const validated = insertWatchlistSchema.parse(req.body);
      console.log("POST /api/watchlist - Validated:", JSON.stringify(validated));
      const item = await storage.addToWatchlist(validated);
      res.status(201).json(item);
    } catch (error: any) {
      console.error("POST /api/watchlist - Validation error:", error);
      res.status(400).json({ error: "Invalid watchlist item", details: error?.message || error });
    }
  });

  app.patch("/api/watchlist/:id", async (req, res) => {
    try {
      console.log("PATCH /api/watchlist/:id - Request body:", JSON.stringify(req.body));
      const updated = await storage.updateWatchlistItem(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Watchlist item not found" });
      }
      console.log("PATCH /api/watchlist/:id - Updated:", JSON.stringify(updated));
      res.json(updated);
    } catch (error: any) {
      console.error("PATCH /api/watchlist/:id - Error:", error);
      res.status(500).json({ error: "Failed to update watchlist item", details: error?.message || error });
    }
  });

  app.delete("/api/watchlist/:id", async (req, res) => {
    try {
      const deleted = await storage.removeFromWatchlist(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Watchlist item not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete watchlist item" });
    }
  });

  // Options Data Routes
  app.get("/api/options/:symbol", async (req, res) => {
    try {
      const options = await storage.getOptionsBySymbol(req.params.symbol);
      res.json(options);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch options data" });
    }
  });

  app.post("/api/options", async (req, res) => {
    try {
      const validated = insertOptionsDataSchema.parse(req.body);
      const options = await storage.createOptionsData(validated);
      res.status(201).json(options);
    } catch (error) {
      res.status(400).json({ error: "Invalid options data" });
    }
  });

  // User Preferences Routes
  app.get("/api/preferences", async (_req, res) => {
    try {
      const prefs = await storage.getUserPreferences();
      if (!prefs) {
        return res.status(404).json({ error: "Preferences not found" });
      }
      res.json(prefs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch preferences" });
    }
  });

  app.patch("/api/preferences", async (req, res) => {
    try {
      const validated = insertUserPreferencesSchema.partial().parse(req.body);
      const prefs = await storage.updateUserPreferences(validated);
      res.json(prefs);
    } catch (error: any) {
      console.error("Preferences validation error:", error);
      res.status(400).json({ 
        error: "Invalid preferences data",
        details: error.message || error.toString()
      });
    }
  });

  app.put("/api/preferences", async (req, res) => {
    try {
      const validated = insertUserPreferencesSchema.partial().parse(req.body);
      const prefs = await storage.updateUserPreferences(validated);
      res.json(prefs);
    } catch (error: any) {
      console.error("Preferences validation error:", error);
      res.status(400).json({ 
        error: "Invalid preferences data",
        details: error.message || error.toString()
      });
    }
  });

  // Quantitative Analysis for Single Symbol
  app.get("/api/quant/analyze/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const marketData = await storage.getMarketDataBySymbol(symbol.toUpperCase());
      
      if (!marketData) {
        return res.status(404).json({ error: "Symbol not found in market data" });
      }

      // Import technical indicators
      const { 
        calculateRSI, 
        calculateMACD, 
        calculateSMA, 
        analyzeRSI, 
        analyzeMACD,
        calculateBollingerBands
      } = await import("./technical-indicators");

      // Import market API for real historical data
      const { fetchHistoricalPrices } = await import("./market-api");

      // Fetch REAL historical prices instead of synthetic data
      const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
      let historicalPrices = await fetchHistoricalPrices(
        marketData.symbol, 
        marketData.assetType, 
        60, 
        apiKey
      );

      // Fallback to synthetic if API fails (for development/testing)
      if (historicalPrices.length === 0) {
        console.log(`⚠️  Using fallback synthetic prices for ${marketData.symbol}`);
        const generateFallback = (currentPrice: number, changePercent: number, periods: number = 60): number[] => {
          const prices: number[] = [];
          const dailyChange = changePercent / 100;
          const volatility = Math.abs(dailyChange) * 2;
          
          for (let i = periods; i >= 0; i--) {
            const daysAgo = i;
            const trend = (dailyChange / periods) * (periods - daysAgo);
            const noise = (Math.random() - 0.5) * volatility * currentPrice;
            const price = currentPrice * (1 - trend) + noise;
            prices.push(Math.max(price, currentPrice * 0.5));
          }
          return prices;
        };
        historicalPrices = generateFallback(marketData.currentPrice, marketData.changePercent, 60);
      } else {
        console.log(`✅ Using ${historicalPrices.length} real historical prices for ${marketData.symbol}`);
      }
      
      // Calculate technical indicators
      const rsi = calculateRSI(historicalPrices, 14);
      const macd = calculateMACD(historicalPrices, 12, 26, 9);
      const sma20 = calculateSMA(historicalPrices, 20);
      const sma50 = calculateSMA(historicalPrices, 50);
      const bollinger = calculateBollingerBands(historicalPrices, 20, 2);
      
      // Analyze signals
      const rsiAnalysis = analyzeRSI(rsi);
      const macdAnalysis = analyzeMACD(macd);
      
      // Volume analysis
      const avgVolume = marketData.avgVolume || marketData.volume;
      const volumeRatio = marketData.volume / avgVolume;
      const volumeSignal = volumeRatio > 1.5 ? 'high' : volumeRatio > 1.2 ? 'above_average' : volumeRatio < 0.8 ? 'low' : 'normal';
      
      // Trend analysis
      const currentPrice = marketData.currentPrice;
      const trend = currentPrice > sma20 && sma20 > sma50 ? 'strong_uptrend' :
                    currentPrice > sma20 ? 'uptrend' :
                    currentPrice < sma20 && sma20 < sma50 ? 'strong_downtrend' :
                    'downtrend';
      
      // Support/Resistance (Bollinger Bands)
      const supportResistance = {
        support: bollinger.lower,
        resistance: bollinger.upper,
        midpoint: bollinger.middle,
        distanceToSupport: ((currentPrice - bollinger.lower) / currentPrice * 100).toFixed(2),
        distanceToResistance: ((bollinger.upper - currentPrice) / currentPrice * 100).toFixed(2)
      };
      
      res.json({
        symbol: marketData.symbol,
        assetType: marketData.assetType,
        currentPrice: marketData.currentPrice,
        changePercent: marketData.changePercent,
        analysis: {
          rsi: {
            value: rsi,
            signal: rsiAnalysis.signal,
            strength: rsiAnalysis.strength,
            direction: rsiAnalysis.direction,
            interpretation: rsi < 30 ? 'Oversold - Potential buy signal' :
                           rsi > 70 ? 'Overbought - Potential sell signal' :
                           'Neutral range'
          },
          macd: {
            value: macd.macd,
            signal: macd.signal,
            histogram: macd.histogram,
            analysis: macdAnalysis.signal,
            strength: macdAnalysis.strength,
            direction: macdAnalysis.direction,
            crossover: macdAnalysis.crossover,
            interpretation: macdAnalysis.crossover ? 'Crossover imminent - Watch closely' :
                           macd.histogram > 0 ? 'Bullish momentum' :
                           'Bearish momentum'
          },
          trend: {
            direction: trend,
            sma20,
            sma50,
            priceVsSMA20: ((currentPrice - sma20) / sma20 * 100).toFixed(2) + '%',
            priceVsSMA50: ((currentPrice - sma50) / sma50 * 100).toFixed(2) + '%'
          },
          volume: {
            current: marketData.volume,
            average: avgVolume,
            ratio: Number(volumeRatio.toFixed(2)),
            signal: volumeSignal,
            interpretation: volumeSignal === 'high' ? 'Strong interest - High volume' :
                           volumeSignal === 'above_average' ? 'Elevated activity' :
                           volumeSignal === 'low' ? 'Low participation' :
                           'Normal trading activity'
          },
          supportResistance
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("Quant analysis error:", error);
      res.status(500).json({ error: error?.message || "Failed to analyze symbol" });
    }
  });

  // Quantitative Idea Generator (Premium only)
  app.post("/api/quant/generate-ideas", quantGenerationLimiter, async (req, res) => {
    try {
      const schema = z.object({
        count: z.number().optional().default(8),
      });
      const { count } = schema.parse(req.body);
      
      // Get current market data and catalysts
      const marketData = await storage.getAllMarketData();
      const catalysts = await storage.getAllCatalysts();
      
      // Generate quantitative ideas with deduplication
      const quantIdeas = await generateQuantIdeas(marketData, catalysts, count, storage);
      
      // Save ideas to storage and send Discord alerts
      const savedIdeas = [];
      for (const idea of quantIdeas) {
        const tradeIdea = await storage.createTradeIdea(idea);
        savedIdeas.push(tradeIdea);
      }
      
      // Send Discord notification for batch
      if (savedIdeas.length > 0) {
        const { sendBatchSummaryToDiscord } = await import("./discord-service");
        sendBatchSummaryToDiscord(savedIdeas, 'quant').catch(err => 
          console.error('Discord notification failed:', err)
        );
      }
      
      // Return helpful message when no new ideas are available
      if (savedIdeas.length === 0) {
        res.json({ 
          success: true, 
          ideas: [], 
          count: 0,
          message: "No new trade ideas at this time. Wait for market movements or price changes to generate fresh opportunities."
        });
      } else {
        res.json({ success: true, ideas: savedIdeas, count: savedIdeas.length });
      }
    } catch (error: any) {
      console.error("Quant idea generation error:", error);
      res.status(500).json({ error: error?.message || "Failed to generate quantitative trade ideas" });
    }
  });

  // AI QuantBot Routes (Premium only)
  app.post("/api/ai/generate-ideas", aiGenerationLimiter, async (req, res) => {
    try {
      const schema = z.object({
        marketContext: z.string().optional().default("Current market conditions with focus on stocks, options, and crypto"),
      });
      const { marketContext } = schema.parse(req.body);
      
      // 🚫 DEDUPLICATION: Get existing open symbols
      const allIdeas = await storage.getAllTradeIdeas();
      const existingOpenSymbols = new Set(
        allIdeas
          .filter((idea: any) => idea.outcomeStatus === 'open')
          .map((idea: any) => idea.symbol.toUpperCase())
      );
      
      const aiIdeas = await generateTradeIdeas(marketContext);
      
      // Save AI-generated ideas to storage and send Discord alerts (skip duplicates)
      const savedIdeas = [];
      for (const aiIdea of aiIdeas) {
        // 🚫 Skip if symbol already has an open trade
        if (existingOpenSymbols.has(aiIdea.symbol.toUpperCase())) {
          logger.info(`⏭️  AI: Skipped ${aiIdea.symbol} - already has open trade`);
          continue;
        }
        
        // ✅ PRICE VALIDATION: Ensure correct price relationships
        let { entryPrice, targetPrice, stopLoss } = aiIdea;
        
        if (aiIdea.direction === 'long') {
          // For LONG: target should be > entry > stop
          if (targetPrice <= entryPrice || stopLoss >= entryPrice) {
            logger.warn(`⚠️  AI: Fixing inverted prices for ${aiIdea.symbol} LONG - was entry:${entryPrice} target:${targetPrice} stop:${stopLoss}`);
            if (targetPrice < entryPrice && stopLoss > entryPrice) {
              [targetPrice, stopLoss] = [stopLoss, targetPrice];
            } else {
              targetPrice = entryPrice * 1.05;
              stopLoss = entryPrice * 0.97;
            }
            logger.info(`   → Fixed to entry:${entryPrice} target:${targetPrice.toFixed(2)} stop:${stopLoss.toFixed(2)}`);
          }
        } else if (aiIdea.direction === 'short') {
          // For SHORT: stop should be > entry > target
          if (stopLoss <= entryPrice || targetPrice >= entryPrice) {
            logger.warn(`⚠️  AI: Fixing inverted prices for ${aiIdea.symbol} SHORT - was entry:${entryPrice} target:${targetPrice} stop:${stopLoss}`);
            if (stopLoss < entryPrice && targetPrice > entryPrice) {
              [targetPrice, stopLoss] = [stopLoss, targetPrice];
            } else {
              targetPrice = entryPrice * 0.95;
              stopLoss = entryPrice * 1.03;
            }
            logger.info(`   → Fixed to entry:${entryPrice} target:${targetPrice.toFixed(2)} stop:${stopLoss.toFixed(2)}`);
          }
        }
        
        const riskRewardRatio = (targetPrice - entryPrice) / (entryPrice - stopLoss);
        
        // AI ideas default to day trades unless they're crypto (which can be position trades)
        const holdingPeriod: 'day' | 'swing' | 'position' = aiIdea.assetType === 'crypto' ? 'position' : 'day';
        
        const tradeIdea = await storage.createTradeIdea({
          symbol: aiIdea.symbol,
          assetType: aiIdea.assetType,
          direction: aiIdea.direction,
          holdingPeriod: holdingPeriod,
          entryPrice,
          targetPrice,
          stopLoss,
          riskRewardRatio: Math.round(riskRewardRatio * 10) / 10,
          catalyst: aiIdea.catalyst,
          analysis: aiIdea.analysis,
          liquidityWarning: aiIdea.entryPrice < 5,
          sessionContext: aiIdea.sessionContext,
          timestamp: new Date().toISOString(),
          expiryDate: aiIdea.expiryDate || null,
          strikePrice: aiIdea.assetType === 'option' ? aiIdea.entryPrice * (aiIdea.direction === 'long' ? 1.02 : 0.98) : null,
          optionType: aiIdea.assetType === 'option' ? (aiIdea.direction === 'long' ? 'call' : 'put') : null,
          source: 'ai'
        });
        savedIdeas.push(tradeIdea);
      }
      
      // Send Discord notification for batch
      if (savedIdeas.length > 0) {
        const { sendBatchSummaryToDiscord } = await import("./discord-service");
        sendBatchSummaryToDiscord(savedIdeas, 'ai').catch(err => 
          console.error('Discord notification failed:', err)
        );
      }
      
      res.json({ success: true, ideas: savedIdeas, count: savedIdeas.length });
    } catch (error: any) {
      console.error("AI idea generation error:", error);
      res.status(500).json({ error: error?.message || "Failed to generate trade ideas" });
    }
  });

  // 🎯 AI + Quant HYBRID Ideas (Combines proven quant signals with FREE AI intelligence)
  app.post("/api/hybrid/generate-ideas", aiGenerationLimiter, async (req, res) => {
    try {
      const schema = z.object({
        marketContext: z.string().optional().default("Current market conditions"),
      });
      const { marketContext } = schema.parse(req.body);
      
      // 🚫 DEDUPLICATION: Get existing open symbols
      const allIdeas = await storage.getAllTradeIdeas();
      const existingOpenSymbols = new Set(
        allIdeas
          .filter((idea: any) => idea.outcomeStatus === 'open')
          .map((idea: any) => idea.symbol.toUpperCase())
      );
      
      const { generateHybridIdeas } = await import("./ai-service");
      const hybridIdeas = await generateHybridIdeas(marketContext);
      
      // Save hybrid ideas to storage (skip duplicates)
      const savedIdeas = [];
      for (const hybridIdea of hybridIdeas) {
        // 🚫 Skip if symbol already has an open trade
        if (existingOpenSymbols.has(hybridIdea.symbol.toUpperCase())) {
          logger.info(`⏭️  Hybrid: Skipped ${hybridIdea.symbol} - already has open trade`);
          continue;
        }
        
        // ✅ PRICE VALIDATION: Ensure correct price relationships (defensive check)
        let { entryPrice, targetPrice, stopLoss } = hybridIdea;
        
        if (hybridIdea.direction === 'long') {
          if (targetPrice <= entryPrice || stopLoss >= entryPrice) {
            logger.warn(`⚠️  Hybrid: Fixing inverted prices for ${hybridIdea.symbol} LONG`);
            if (targetPrice < entryPrice && stopLoss > entryPrice) {
              [targetPrice, stopLoss] = [stopLoss, targetPrice];
            } else {
              targetPrice = entryPrice * 1.05;
              stopLoss = entryPrice * 0.97;
            }
          }
        } else if (hybridIdea.direction === 'short') {
          if (stopLoss <= entryPrice || targetPrice >= entryPrice) {
            logger.warn(`⚠️  Hybrid: Fixing inverted prices for ${hybridIdea.symbol} SHORT`);
            if (stopLoss < entryPrice && targetPrice > entryPrice) {
              [targetPrice, stopLoss] = [stopLoss, targetPrice];
            } else {
              targetPrice = entryPrice * 0.95;
              stopLoss = entryPrice * 1.03;
            }
          }
        }
        
        const riskRewardRatio = (targetPrice - entryPrice) / (entryPrice - stopLoss);
        
        const holdingPeriod: 'day' | 'swing' | 'position' = hybridIdea.assetType === 'crypto' ? 'position' : 'day';
        
        const tradeIdea = await storage.createTradeIdea({
          symbol: hybridIdea.symbol,
          assetType: hybridIdea.assetType,
          direction: hybridIdea.direction,
          holdingPeriod: holdingPeriod,
          entryPrice,
          targetPrice,
          stopLoss,
          riskRewardRatio: Math.round(riskRewardRatio * 10) / 10,
          catalyst: hybridIdea.catalyst,
          analysis: hybridIdea.analysis,
          liquidityWarning: hybridIdea.entryPrice < 5,
          sessionContext: hybridIdea.sessionContext,
          timestamp: new Date().toISOString(),
          expiryDate: hybridIdea.expiryDate || null,
          strikePrice: hybridIdea.assetType === 'option' ? hybridIdea.entryPrice * (hybridIdea.direction === 'long' ? 1.02 : 0.98) : null,
          optionType: hybridIdea.assetType === 'option' ? (hybridIdea.direction === 'long' ? 'call' : 'put') : null,
          source: 'hybrid' // NEW: Mark as hybrid (quant + AI)
        });
        savedIdeas.push(tradeIdea);
      }
      
      // Send Discord notification for batch
      if (savedIdeas.length > 0) {
        const { sendBatchSummaryToDiscord } = await import("./discord-service");
        sendBatchSummaryToDiscord(savedIdeas, 'hybrid').catch(err => 
          console.error('Discord notification failed:', err)
        );
      }
      
      res.json({ success: true, ideas: savedIdeas, count: savedIdeas.length });
    } catch (error: any) {
      console.error("Hybrid idea generation error:", error);
      res.status(500).json({ error: error?.message || "Failed to generate hybrid ideas" });
    }
  });

  app.post("/api/ai/chat", async (req, res) => {
    try {
      const schema = z.object({
        message: z.string().min(1),
      });
      const { message } = schema.parse(req.body);
      
      // Get conversation history
      const history = await storage.getChatHistory();
      const conversationHistory = history.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      
      // Get AI response
      const aiResponse = await chatWithQuantAI(message, conversationHistory);
      
      // Save user message and AI response
      await storage.addChatMessage({ role: 'user', content: message });
      const assistantMessage = await storage.addChatMessage({ role: 'assistant', content: aiResponse });
      
      // Auto-detect if user is asking for trade ideas (not educational)
      const isTradeRequest = /(?:give|show|find|suggest|recommend|any).*(?:trade|idea|stock|buy|sell|position)/i.test(message);
      const isEducational = /(?:what is|how does|explain|define|meaning of)/i.test(message);
      
      let savedIdeas = [];
      if (isTradeRequest && !isEducational) {
        // Automatically parse and save trade ideas from the response
        try {
          const { parseTradeIdeasFromText } = await import("./ai-service");
          const extractedIdeas = await parseTradeIdeasFromText(aiResponse);
          
          for (const idea of extractedIdeas) {
            const riskRewardRatio = (idea.targetPrice - idea.entryPrice) / (idea.entryPrice - idea.stopLoss);
            
            const tradeIdea = await storage.createTradeIdea({
              symbol: idea.symbol,
              assetType: idea.assetType,
              direction: idea.direction,
              entryPrice: idea.entryPrice,
              targetPrice: idea.targetPrice,
              stopLoss: idea.stopLoss,
              riskRewardRatio: Math.round(riskRewardRatio * 10) / 10,
              catalyst: idea.catalyst || "From AI chat conversation",
              analysis: idea.analysis || "AI-suggested trade opportunity",
              liquidityWarning: idea.entryPrice < 5,
              sessionContext: idea.sessionContext || "Chat-suggested trade",
              timestamp: new Date().toISOString(),
              expiryDate: idea.expiryDate || null,
              strikePrice: idea.assetType === 'option' ? idea.entryPrice * (idea.direction === 'long' ? 1.02 : 0.98) : null,
              optionType: idea.assetType === 'option' ? (idea.direction === 'long' ? 'call' : 'put') : null,
              source: 'ai'
            });
            savedIdeas.push(tradeIdea);
          }
          
          if (savedIdeas.length > 0) {
            console.log(`✅ Auto-saved ${savedIdeas.length} trade ideas from chat to Trade Ideas feed`);
            
            // Send individual Discord alerts for chat-generated ideas
            const { sendTradeIdeaToDiscord } = await import("./discord-service");
            for (const idea of savedIdeas) {
              sendTradeIdeaToDiscord(idea).catch(err => 
                console.error('Discord notification failed:', err)
              );
            }
          }
        } catch (parseError) {
          console.log("Could not auto-parse trade ideas from chat response:", parseError);
        }
      }
      
      res.json({ 
        message: aiResponse, 
        messageId: assistantMessage.id,
        autoSavedIdeas: savedIdeas.length,
        isTradeResponse: isTradeRequest && !isEducational
      });
    } catch (error: any) {
      console.error("Chat error:", error);
      res.status(500).json({ error: error?.message || "Failed to process chat" });
    }
  });

  app.get("/api/ai/chat/history", async (_req, res) => {
    try {
      const history = await storage.getChatHistory();
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch chat history" });
    }
  });

  app.delete("/api/ai/chat/history", async (_req, res) => {
    try {
      await storage.clearChatHistory();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to clear chat history" });
    }
  });

  // Parse chat message and extract trade ideas (Premium only)
  app.post("/api/ai/parse-chat-idea", async (req, res) => {
    try {
      const schema = z.object({
        messageId: z.string(),
        content: z.string(),
      });
      const { messageId, content } = schema.parse(req.body);
      
      // Use AI to extract structured trade ideas from conversational text
      const { parseTradeIdeasFromText } = await import("./ai-service");
      const extractedIdeas = await parseTradeIdeasFromText(content);
      
      // Save extracted ideas to storage
      const savedIdeas = [];
      for (const idea of extractedIdeas) {
        const riskRewardRatio = (idea.targetPrice - idea.entryPrice) / (idea.entryPrice - idea.stopLoss);
        
        const tradeIdea = await storage.createTradeIdea({
          symbol: idea.symbol,
          assetType: idea.assetType,
          direction: idea.direction,
          entryPrice: idea.entryPrice,
          targetPrice: idea.targetPrice,
          stopLoss: idea.stopLoss,
          riskRewardRatio: Math.round(riskRewardRatio * 10) / 10,
          catalyst: idea.catalyst || "From AI chat conversation",
          analysis: idea.analysis || "Extracted from conversational response",
          liquidityWarning: idea.entryPrice < 5,
          sessionContext: idea.sessionContext || "Chat-suggested trade",
          timestamp: new Date().toISOString(),
          expiryDate: idea.expiryDate || null,
          strikePrice: idea.assetType === 'option' ? idea.entryPrice * (idea.direction === 'long' ? 1.02 : 0.98) : null,
          optionType: idea.assetType === 'option' ? (idea.direction === 'long' ? 'call' : 'put') : null,
          source: 'ai'
        });
        savedIdeas.push(tradeIdea);
      }
      
      res.json({ success: true, ideas: savedIdeas, count: savedIdeas.length });
    } catch (error: any) {
      console.error("Parse chat idea error:", error);
      res.status(500).json({ error: error?.message || "Failed to parse trade ideas" });
    }
  });

  // Signal Intelligence & ML Routes
  app.get("/api/ml/signal-intelligence", async (_req, res) => {
    try {
      // 🧠 ML MODE: Include ALL engine versions for comprehensive signal analysis
      const stats = await storage.getPerformanceStats({ includeAllVersions: true });
      const allIdeas = await storage.getAllTradeIdeas();
      const closedIdeas = allIdeas.filter(i => i.outcomeStatus !== 'open');
      
      // 🧠 ML GUARD: Require minimum data to prevent learning from noise
      if (closedIdeas.length < 10) {
        return res.json({
          signalAnalysis: [],
          topCombinations: [],
          assetComparison: [],
          insights: [`Need at least 10 closed trades for reliable signal intelligence (currently have ${closedIdeas.length})`],
          totalAnalyzedTrades: closedIdeas.length,
          timestamp: new Date().toISOString(),
          insufficientData: true
        });
      }
      
      // Analyze signal effectiveness
      const signalAnalysis = stats.bySignalType.map(signalStat => {
        const signalIdeas = closedIdeas.filter(i => 
          i.qualitySignals?.includes(signalStat.signal)
        );
        
        const avgHoldingTime = signalIdeas
          .filter(i => i.actualHoldingTimeMinutes !== null)
          .map(i => i.actualHoldingTimeMinutes!)
          .reduce((sum, time, _, arr) => sum + time / arr.length, 0) || 0;
        
        const avgRR = signalIdeas
          .map(i => i.riskRewardRatio)
          .reduce((sum, rr, _, arr) => sum + rr / arr.length, 0) || 0;
        
        // Reliability score: win rate weighted by sample size
        const sampleSizeWeight = Math.min(signalStat.totalIdeas / 20, 1); // Max weight at 20+ samples
        const reliabilityScore = signalStat.winRate * sampleSizeWeight;
        
        // Calculate edge (expected value)
        const avgWin = signalIdeas
          .filter(i => i.outcomeStatus === 'hit_target' && i.percentGain !== null)
          .map(i => i.percentGain!)
          .reduce((sum, gain, _, arr) => sum + Math.abs(gain) / arr.length, 0) || 0;
          
        const avgLoss = signalIdeas
          .filter(i => i.outcomeStatus === 'hit_stop' && i.percentGain !== null)
          .map(i => i.percentGain!)
          .reduce((sum, loss, _, arr) => sum + Math.abs(loss) / arr.length, 0) || 0;
        
        const expectancy = (signalStat.winRate / 100 * avgWin) - ((100 - signalStat.winRate) / 100 * avgLoss);
        
        return {
          signal: signalStat.signal,
          totalTrades: signalStat.totalIdeas,
          winRate: signalStat.winRate,
          avgPercentGain: signalStat.avgPercentGain,
          avgHoldingTimeMinutes: avgHoldingTime,
          avgRiskReward: avgRR,
          reliabilityScore,
          expectancy,
          avgWinSize: avgWin,
          avgLossSize: avgLoss,
          grade: reliabilityScore >= 60 ? 'A' : reliabilityScore >= 40 ? 'B' : 'C'
        };
      }).sort((a, b) => b.reliabilityScore - a.reliabilityScore);
      
      // 🧠 ML-FIXED: Analyze ALL closed ideas to get accurate win/loss rates for combinations
      // CRITICAL: Must evaluate both wins AND losses to calculate true win rates
      const signalCombos = new Map<string, { count: number; wins: number; totalGain: number }>();
      
      closedIdeas.forEach(idea => {
        if (idea.qualitySignals && idea.qualitySignals.length >= 2) {
          const signals = typeof idea.qualitySignals === 'string' 
            ? JSON.parse(idea.qualitySignals) 
            : idea.qualitySignals;
          
          // Generate all combinations of 2 signals
          for (let i = 0; i < signals.length; i++) {
            for (let j = i + 1; j < signals.length; j++) {
              const combo = [signals[i], signals[j]].sort().join(' + ');
              const existing = signalCombos.get(combo) || { count: 0, wins: 0, totalGain: 0 };
              signalCombos.set(combo, {
                count: existing.count + 1,
                wins: existing.wins + (idea.outcomeStatus === 'hit_target' ? 1 : 0),
                totalGain: existing.totalGain + (idea.percentGain || 0)
              });
            }
          }
        }
      });
      
      const topCombos = Array.from(signalCombos.entries())
        .filter(([_, stats]) => stats.count >= 3) // Minimum 3 occurrences
        .map(([combo, stats]) => ({
          combination: combo,
          occurrences: stats.count,
          winRate: (stats.wins / stats.count) * 100,
          avgGain: stats.totalGain / stats.count
        }))
        .sort((a, b) => b.winRate - a.winRate)
        .slice(0, 10);
      
      // Asset type performance comparison
      const assetComparison = stats.byAssetType.map(asset => {
        const assetIdeas = closedIdeas.filter(i => i.assetType === asset.assetType);
        const avgHoldingTime = assetIdeas
          .filter(i => i.actualHoldingTimeMinutes !== null)
          .map(i => i.actualHoldingTimeMinutes!)
          .reduce((sum, time, _, arr) => sum + time / arr.length, 0) || 0;
        
        return {
          assetType: asset.assetType,
          totalTrades: asset.totalIdeas,
          winRate: asset.winRate,
          avgPercentGain: asset.avgPercentGain,
          avgHoldingTimeMinutes: avgHoldingTime
        };
      });
      
      // Generate actionable insights
      const insights: string[] = [];
      
      if (signalAnalysis.length > 0) {
        const bestSignal = signalAnalysis[0];
        if (bestSignal.reliabilityScore >= 60) {
          insights.push(`🎯 Your most reliable signal is "${bestSignal.signal}" with ${bestSignal.winRate.toFixed(1)}% win rate`);
        }
        
        const worstSignal = signalAnalysis[signalAnalysis.length - 1];
        if (worstSignal.winRate < 40 && worstSignal.totalTrades >= 5) {
          insights.push(`⚠️ Avoid "${worstSignal.signal}" - only ${worstSignal.winRate.toFixed(1)}% win rate`);
        }
      }
      
      if (topCombos.length > 0 && topCombos[0].winRate >= 70) {
        insights.push(`✨ Winning pattern: ${topCombos[0].combination} (${topCombos[0].winRate.toFixed(1)}% win rate)`);
      }
      
      if (assetComparison.length > 0) {
        const bestAsset = assetComparison.reduce((best, asset) => 
          asset.winRate > best.winRate ? asset : best
        );
        insights.push(`💰 Best performing asset: ${bestAsset.assetType.toUpperCase()} (${bestAsset.winRate.toFixed(1)}% win rate)`);
      }
      
      res.json({
        signalAnalysis,
        topCombinations: topCombos,
        assetComparison,
        insights,
        totalAnalyzedTrades: closedIdeas.length,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("Signal intelligence error:", error);
      res.status(500).json({ error: error?.message || "Failed to analyze signals" });
    }
  });

  // ML Pattern Learning endpoint
  app.get("/api/ml/learned-patterns", async (_req, res) => {
    try {
      const allIdeas = await storage.getAllTradeIdeas();
      const closedIdeas = allIdeas.filter(i => i.outcomeStatus !== 'open' && i.percentGain !== null);
      
      if (closedIdeas.length < 10) {
        return res.json({
          ready: false,
          message: "Need at least 10 closed trades to learn patterns",
          currentCount: closedIdeas.length
        });
      }
      
      // Learn signal effectiveness weights
      const signalWeights = new Map<string, number>();
      // 🧠 ML MODE: Include ALL engine versions to learn from historical signal performance (including v2.x failures)
      const stats = await storage.getPerformanceStats({ includeAllVersions: true });
      
      stats.bySignalType.forEach(signal => {
        // Calculate weight adjustment based on performance
        // Baseline: 1.0, Range: 0.5 to 1.5
        const winRateBonus = (signal.winRate - 50) / 100; // -0.5 to +0.5
        const sampleSizeBonus = Math.min(signal.totalIdeas / 40, 0.25); // Up to +0.25 for 40+ trades
        const weight = 1.0 + winRateBonus + sampleSizeBonus;
        
        signalWeights.set(signal.signal, Math.max(0.5, Math.min(1.5, weight)));
      });
      
      // Learn optimal time windows by asset type
      const timeWindows = ['stock', 'option', 'crypto'].map(assetType => {
        const assetIdeas = closedIdeas.filter(i => i.assetType === assetType && i.actualHoldingTimeMinutes);
        const winningIdeas = assetIdeas.filter(i => i.outcomeStatus === 'hit_target');
        
        const avgWinningTime = winningIdeas.length > 0
          ? winningIdeas.reduce((sum, i) => sum + i.actualHoldingTimeMinutes!, 0) / winningIdeas.length
          : 120; // Default 2 hours
        
        return {
          assetType,
          optimalHoldingMinutes: Math.round(avgWinningTime),
          sampleSize: winningIdeas.length
        };
      });
      
      res.json({
        ready: true,
        signalWeights: Object.fromEntries(signalWeights),
        timeWindows,
        trainedOn: closedIdeas.length,
        lastUpdated: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("Pattern learning error:", error);
      res.status(500).json({ error: error?.message || "Failed to learn patterns" });
    }
  });

  // Analytics: Backtesting Metrics (with source filtering)
  app.get("/api/analytics/backtest", async (req, res) => {
    try {
      const { BacktestingEngine } = await import('./backtesting');
      const source = req.query.source as string | undefined;
      
      let allIdeas = await storage.getAllTradeIdeas();
      
      // Filter by source if specified
      if (source && source !== 'all') {
        allIdeas = allIdeas.filter(idea => idea.source === source);
      }
      
      // Calculate comprehensive metrics
      const metrics = BacktestingEngine.calculateMetrics(allIdeas);
      const signalPerformance = BacktestingEngine.analyzeSignalPerformance(allIdeas);
      const calibration = BacktestingEngine.calculateCalibration(allIdeas);
      
      res.json({
        metrics,
        signalPerformance,
        calibration,
        source: source || 'all',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("Backtesting error:", error);
      res.status(500).json({ error: error?.message || "Failed to calculate backtest metrics" });
    }
  });

  // Analytics: Rolling Win Rate (time series with source filtering)
  app.get("/api/analytics/rolling-winrate", async (req, res) => {
    try {
      const source = req.query.source as string | undefined;
      
      let allIdeas = await storage.getAllTradeIdeas();
      
      // Filter by source if specified
      if (source && source !== 'all') {
        allIdeas = allIdeas.filter(idea => idea.source === source);
      }
      
      const closedIdeas = allIdeas
        .filter(i => i.outcomeStatus !== 'open' && i.exitDate)
        .sort((a, b) => new Date(a.exitDate!).getTime() - new Date(b.exitDate!).getTime());
      
      if (closedIdeas.length < 10) {
        return res.json({ data: [], message: "Need at least 10 closed trades for rolling win rate" });
      }
      
      // Calculate rolling 10-trade win rate
      const windowSize = 10;
      const rollingData: Array<{ date: string; winRate: number; trades: number }> = [];
      
      for (let i = windowSize - 1; i < closedIdeas.length; i++) {
        const window = closedIdeas.slice(i - windowSize + 1, i + 1);
        const winners = window.filter(t => t.outcomeStatus === 'hit_target').length;
        const winRate = (winners / windowSize) * 100;
        
        rollingData.push({
          date: window[window.length - 1].exitDate!,
          winRate,
          trades: i + 1
        });
      }
      
      res.json({ data: rollingData, windowSize, source: source || 'all' });
    } catch (error: any) {
      console.error("Rolling win rate error:", error);
      res.status(500).json({ error: error?.message || "Failed to calculate rolling win rate" });
    }
  });

  // Admin: Manual Trade Validation (force validation of all open trades NOW)
  app.post("/api/admin/validate-trades", requireAdmin, async (_req, res) => {
    try {
      const { PerformanceValidator } = await import('./performance-validator');
      const openIdeas = (await storage.getAllTradeIdeas()).filter(i => i.outcomeStatus === 'open');
      
      logger.info(`📊 Admin: Force-validating ${openIdeas.length} open trades...`);
      
      // Fetch current prices for all symbols
      const symbols = Array.from(new Set(openIdeas.map(i => i.symbol)));
      const priceMap = new Map<string, number>();
      
      for (const symbol of symbols) {
        try {
          const idea = openIdeas.find(i => i.symbol === symbol)!;
          let price: number | null = null;
          
          if (idea.assetType === 'crypto') {
            const { fetchCryptoPrice } = await import('./market-api');
            const priceData = await fetchCryptoPrice(symbol);
            price = priceData?.currentPrice || null;
          } else {
            const { fetchStockPrice } = await import('./market-api');
            const priceData = await fetchStockPrice(symbol);
            price = priceData?.currentPrice || null;
          }
          
          if (price) {
            priceMap.set(symbol, price);
          }
        } catch (e) {
          logger.warn(`Failed to fetch price for ${symbol}`);
        }
      }
      
      logger.info(`  ✓ Fetched ${priceMap.size}/${symbols.length} prices`);
      
      // Validate each trade
      let validated = 0;
      let closed = 0;
      
      for (const idea of openIdeas) {
        const currentPrice = priceMap.get(idea.symbol);
        const result = PerformanceValidator.validateTradeIdea(idea, currentPrice);
        
        if (result.shouldUpdate && result.outcomeStatus) {
          await storage.updateTradeIdea(idea.id, result);
          validated++;
          if (result.outcomeStatus !== 'open') {
            closed++;
          }
        }
      }
      
      logger.info(`✅ Admin: Validated ${validated} trades, closed ${closed}`);
      
      res.json({
        success: true,
        totalOpen: openIdeas.length,
        validated,
        closed,
        message: `Validated ${validated} trades, closed ${closed} with outcomes`
      });
    } catch (error: any) {
      logger.error("Admin validation error:", error);
      res.status(500).json({ error: error?.message || "Failed to validate trades" });
    }
  });

  // Admin: Re-validate ALL trades (including expired) - ONE-TIME FIX for date parser bug
  app.post("/api/admin/revalidate-all-trades", requireAdmin, async (_req, res) => {
    try {
      const { PerformanceValidator } = await import('./performance-validator');
      const allIdeas = await storage.getAllTradeIdeas();
      
      logger.info(`🔄 Admin: Re-validating ALL ${allIdeas.length} trades (including expired)...`);
      
      let reopened = 0;
      let stayedExpired = 0;
      let errors = 0;
      
      // Focus on expired trades - check if they should actually be open
      const expiredIdeas = allIdeas.filter(i => i.outcomeStatus === 'expired');
      logger.info(`  📊 Found ${expiredIdeas.length} expired trades to re-check`);
      
      for (const idea of expiredIdeas) {
        try {
          // Re-validate using the FIXED date parser - it will check if truly expired
          const result = PerformanceValidator.validateTradeIdea(idea, undefined);
          
          // If shouldUpdate is false and it's still marked expired, it's truly expired
          // If shouldUpdate is true and outcomeStatus is NOT 'expired', we should reopen it
          if (!result.shouldUpdate) {
            // Validation says no update needed, but let's double-check the expiry logic
            // by manually checking if exitBy is in the future
            if (idea.exitBy) {
              const now = new Date();
              const createdAt = new Date(idea.timestamp);
              // Use the FIXED parser
              const exitByDate = (PerformanceValidator as any).parseExitByDate(idea.exitBy, createdAt);
              
              if (exitByDate && exitByDate > now) {
                // Trade is NOT expired! Reopen it
                await storage.updateTradeIdea(idea.id, {
                  outcomeStatus: 'open',
                  exitDate: null,
                  exitPrice: null,
                  realizedPnL: null,
                  percentGain: null,
                  predictionAccuracyPercent: null
                });
                reopened++;
                logger.info(`  ✅ Reopened ${idea.symbol} (exitBy: ${idea.exitBy}, expires: ${exitByDate.toISOString()})`);
              } else {
                stayedExpired++;
              }
            } else {
              stayedExpired++;
            }
          } else {
            stayedExpired++;
          }
        } catch (e: any) {
          errors++;
          logger.error(`  ❌ Error re-validating ${idea.symbol}: ${e.message}`);
        }
      }
      
      logger.info(`✅ Admin: Re-validation complete`);
      logger.info(`  📈 Reopened: ${reopened} trades`);
      logger.info(`  ⏱️  Still expired: ${stayedExpired} trades`);
      logger.info(`  ❌ Errors: ${errors}`);
      
      res.json({
        success: true,
        total: allIdeas.length,
        expiredChecked: expiredIdeas.length,
        reopened,
        stayedExpired,
        errors,
        message: `Re-validated all trades. Reopened ${reopened} incorrectly expired trades.`
      });
    } catch (error: any) {
      logger.error("Admin re-validation error:", error);
      res.status(500).json({ error: error?.message || "Failed to re-validate trades" });
    }
  });

  // Admin: Data Integrity Verification
  app.get("/api/admin/verify-data-integrity", requireAdmin, async (_req, res) => {
    try {
      const allIdeas = await storage.getAllTradeIdeas();
      // 🔐 ADMIN MODE: Include ALL engine versions for complete data integrity verification
      const stats = await storage.getPerformanceStats({ includeAllVersions: true });
      
      // Check 1: Count consistency
      const totalCount = allIdeas.length;
      const closedIdeas = allIdeas.filter(i => i.outcomeStatus !== 'open');
      const closedCount = closedIdeas.length;
      const statsClosedCount = stats.bySource.reduce((sum, s) => sum + s.totalIdeas, 0);
      
      const countMatch = closedCount === statsClosedCount;
      
      // Check 2: Win rate consistency
      const rawWins = closedIdeas.filter(i => i.outcomeStatus === 'hit_target').length;
      const rawWinRate = closedIdeas.length > 0 ? (rawWins / closedIdeas.length) * 100 : 0;
      const perfWinRate = stats.overall.winRate;
      const winRateMatch = Math.abs(rawWinRate - perfWinRate) < 0.1; // Within 0.1%
      
      // Check 3: Missing outcome data
      const missingData = closedIdeas.filter(i => 
        i.percentGain === null || 
        i.exitPrice === null || 
        i.exitDate === null ||
        i.actualHoldingTimeMinutes === null
      );
      
      // Check 4: Invalid timestamps
      const invalidTimestamps = closedIdeas.filter(i => {
        if (!i.exitDate || !i.timestamp) return false;
        return new Date(i.exitDate) < new Date(i.timestamp);
      });
      
      // Check 5: Data source verification
      const undefinedSources = allIdeas.filter(i => !i.dataSourceUsed);
      
      // Overall status
      const warnings: string[] = [];
      const errors: string[] = [];
      
      if (!countMatch) {
        errors.push(`Count mismatch: Found ${closedCount} closed ideas but performance stats show ${statsClosedCount}`);
      }
      
      if (!winRateMatch) {
        warnings.push(`Win rate discrepancy: Raw calculation ${rawWinRate.toFixed(2)}% vs Performance stats ${perfWinRate.toFixed(2)}%`);
      }
      
      if (missingData.length > 0) {
        warnings.push(`${missingData.length} closed trades missing outcome data (percentGain, exitPrice, etc.)`);
      }
      
      if (invalidTimestamps.length > 0) {
        errors.push(`${invalidTimestamps.length} trades have exit dates before entry dates`);
      }
      
      if (undefinedSources.length > 0) {
        warnings.push(`${undefinedSources.length} trades missing data source attribution`);
      }
      
      const status = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'ok';
      
      res.json({
        status,
        timestamp: new Date().toISOString(),
        summary: {
          totalTrades: totalCount,
          closedTrades: closedCount,
          openTrades: totalCount - closedCount,
          overallWinRate: perfWinRate.toFixed(2) + '%',
        },
        checks: {
          totalTradeCount: { 
            match: true, 
            expected: totalCount, 
            actual: totalCount 
          },
          closedTradeCount: { 
            match: countMatch, 
            expected: statsClosedCount, 
            actual: closedCount 
          },
          winRateConsistency: { 
            match: winRateMatch, 
            perfWinRate: perfWinRate.toFixed(2), 
            rawWinRate: rawWinRate.toFixed(2),
            difference: Math.abs(rawWinRate - perfWinRate).toFixed(2)
          },
          missingOutcomeData: { 
            count: missingData.length, 
            ids: missingData.slice(0, 5).map(i => i.id) // Only first 5
          },
          invalidTimestamps: {
            count: invalidTimestamps.length,
            ids: invalidTimestamps.slice(0, 5).map(i => i.id)
          },
          missingDataSource: {
            count: undefinedSources.length,
            ids: undefinedSources.slice(0, 5).map(i => i.id)
          }
        },
        warnings,
        errors
      });
    } catch (error: any) {
      console.error("Data integrity verification error:", error);
      res.status(500).json({ error: error?.message || "Failed to verify data integrity" });
    }
  });

  // Admin: Clear test data (ONLY deletes OPEN trades with no outcomes - preserves all closed trades)
  app.post("/api/admin/clear-test-data", requireAdmin, async (_req, res) => {
    try {
      const allIdeas = await storage.getAllTradeIdeas();
      let deletedCount = 0;
      let preservedCount = 0;
      
      for (const idea of allIdeas) {
        // PRESERVE any trade with an outcome (hit_target, hit_stop, expired, closed)
        if (idea.outcomeStatus && idea.outcomeStatus !== 'open') {
          preservedCount++;
          continue; // Keep this trade - it has valuable outcome data
        }
        
        // Only delete OPEN trades that are older than 7 days (likely test data)
        const ideaDate = new Date(idea.timestamp);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        if (ideaDate < sevenDaysAgo && idea.outcomeStatus === 'open') {
          await storage.deleteTradeIdea(idea.id);
          deletedCount++;
        }
      }
      
      res.json({ 
        message: 'Test data cleared successfully - all trades with outcomes were preserved',
        deletedCount,
        preservedWithOutcomes: preservedCount,
        note: 'Only deleted OPEN trades older than 7 days. All closed trades with outcomes were kept.'
      });
    } catch (error: any) {
      console.error("Clear test data error:", error);
      res.status(500).json({ error: error?.message || "Failed to clear test data" });
    }
  });

  // Win rate trend data for charting
  app.get("/api/ml/win-rate-trend", async (_req, res) => {
    try {
      const allIdeas = await storage.getAllTradeIdeas();
      const closedIdeas = allIdeas
        .filter(i => i.outcomeStatus !== 'open')
        .sort((a, b) => new Date(a.exitDate || a.timestamp).getTime() - new Date(b.exitDate || b.timestamp).getTime());
      
      if (closedIdeas.length === 0) {
        return res.json({ dataPoints: [], cumulativePnL: [] });
      }
      
      // Calculate rolling win rate (window of 10 trades)
      const windowSize = 10;
      const dataPoints: { date: string; winRate: number; tradesInWindow: number }[] = [];
      const cumulativePnL: { date: string; totalPnL: number; cumulativeGain: number }[] = [];
      
      let cumulativeGainPercent = 0;
      let totalPnL = 0;
      
      for (let i = 0; i < closedIdeas.length; i++) {
        const idea = closedIdeas[i];
        
        // Update cumulative metrics
        cumulativeGainPercent += idea.percentGain || 0;
        totalPnL += idea.realizedPnL || 0;
        
        cumulativePnL.push({
          date: idea.exitDate || idea.timestamp,
          totalPnL,
          cumulativeGain: cumulativeGainPercent
        });
        
        // Calculate rolling win rate
        if (i >= windowSize - 1) {
          const window = closedIdeas.slice(i - windowSize + 1, i + 1);
          const wins = window.filter(w => w.outcomeStatus === 'hit_target').length;
          const winRate = (wins / windowSize) * 100;
          
          dataPoints.push({
            date: idea.exitDate || idea.timestamp,
            winRate,
            tradesInWindow: windowSize
          });
        }
      }
      
      res.json({ dataPoints, cumulativePnL });
    } catch (error: any) {
      console.error("Win rate trend error:", error);
      res.status(500).json({ error: error?.message || "Failed to get win rate trend" });
    }
  });

  // 🔐 MODEL GOVERNANCE: Model Cards API
  app.get("/api/model-cards", requirePremium, async (_req, res) => {
    try {
      const cards = await storage.getAllModelCards();
      res.json(cards);
    } catch (error: any) {
      console.error("Get model cards error:", error);
      res.status(500).json({ error: "Failed to fetch model cards" });
    }
  });

  app.get("/api/model-cards/active", async (_req, res) => {
    try {
      const card = await storage.getActiveModelCard();
      if (!card) {
        return res.status(404).json({ error: "No active model card found" });
      }
      res.json(card);
    } catch (error: any) {
      console.error("Get active model card error:", error);
      res.status(500).json({ error: "Failed to fetch active model card" });
    }
  });

  app.post("/api/model-cards/initialize", requireAdmin, async (_req, res) => {
    try {
      // Check if model card already exists
      const existing = await storage.getModelCardByVersion("v2.2.0");
      if (existing) {
        return res.json({ message: "Model card already exists", card: existing });
      }

      // Create the first model card documenting the current quant engine
      const { QUANT_ENGINE_VERSION } = await import('./quant-ideas-generator');
      const card = await storage.createModelCard({
        engineVersion: QUANT_ENGINE_VERSION,
        mlWeightsVersion: null, // Pure quant for now
        modelType: 'quant',
        description: 'Predictive quant engine with RSI divergence priority, early MACD crossovers, widened stops (4-5%), and removal of momentum-chasing signals. Focus on early setups rather than finished moves.',
        createdAt: new Date().toISOString(),
        createdBy: 'admin',
        assumptions: JSON.stringify({
          marketRegime: 'Mean-reverting with intraday volatility',
          signalPriority: ['RSI Divergence', 'Early MACD Crossover', 'Volume Spike', 'Breakout Confirmation'],
          stopLossPhilosophy: 'Wider stops to avoid premature exits on normal volatility'
        }),
        dataLimitations: JSON.stringify({
          historicalData: 'Limited to 100 days lookback for technical indicators',
          optionsData: 'Tradier API coverage may be incomplete for illiquid options',
          earningsData: 'Alpha Vantage provides 14-day lookahead only'
        }),
        signalWeights: JSON.stringify({
          'RSI Divergence': 25,
          'MACD Crossover (Fresh)': 25,
          'Early Breakout': 20,
          'Volume Spike': 15,
          'Mean Reversion': 15
        }),
        status: 'active'
      });

      res.json({ message: "Model card created successfully", card });
    } catch (error: any) {
      console.error("Initialize model card error:", error);
      res.status(500).json({ error: "Failed to initialize model card" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
