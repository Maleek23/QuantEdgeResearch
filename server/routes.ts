import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { searchSymbol } from "./market-api";
import { generateTradeIdeas, chatWithQuantAI } from "./ai-service";
import {
  insertMarketDataSchema,
  insertTradeIdeaSchema,
  insertCatalystSchema,
  insertWatchlistSchema,
  insertOptionsDataSchema,
  insertUserPreferencesSchema,
} from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Market Data Routes
  app.get("/api/market-data", async (_req, res) => {
    try {
      const data = await storage.getAllMarketData();
      res.json(data);
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

  // Trade Ideas Routes
  app.get("/api/trade-ideas", async (_req, res) => {
    try {
      const ideas = await storage.getAllTradeIdeas();
      res.json(ideas);
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
      const validated = insertWatchlistSchema.parse(req.body);
      const item = await storage.addToWatchlist(validated);
      res.status(201).json(item);
    } catch (error) {
      res.status(400).json({ error: "Invalid watchlist item" });
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
    } catch (error) {
      res.status(400).json({ error: "Invalid preferences data" });
    }
  });

  // AI QuantBot Routes
  app.post("/api/ai/generate-ideas", async (req, res) => {
    try {
      const schema = z.object({
        marketContext: z.string().optional().default("Current market conditions with focus on stocks, options, and crypto"),
      });
      const { marketContext } = schema.parse(req.body);
      
      const aiIdeas = await generateTradeIdeas(marketContext);
      
      // Save AI-generated ideas to storage
      const savedIdeas = [];
      for (const aiIdea of aiIdeas) {
        const riskRewardRatio = (aiIdea.targetPrice - aiIdea.entryPrice) / (aiIdea.entryPrice - aiIdea.stopLoss);
        
        const tradeIdea = await storage.createTradeIdea({
          symbol: aiIdea.symbol,
          assetType: aiIdea.assetType,
          direction: aiIdea.direction,
          entryPrice: aiIdea.entryPrice,
          targetPrice: aiIdea.targetPrice,
          stopLoss: aiIdea.stopLoss,
          riskRewardRatio: Math.round(riskRewardRatio * 10) / 10,
          catalyst: aiIdea.catalyst,
          analysis: aiIdea.analysis,
          liquidityWarning: aiIdea.entryPrice < 5,
          sessionContext: aiIdea.sessionContext,
          timestamp: new Date().toISOString(),
          expiryDate: aiIdea.expiryDate || null,
        });
        savedIdeas.push(tradeIdea);
      }
      
      res.json({ success: true, ideas: savedIdeas, count: savedIdeas.length });
    } catch (error: any) {
      console.error("AI idea generation error:", error);
      res.status(500).json({ error: error?.message || "Failed to generate trade ideas" });
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
      
      res.json({ message: aiResponse, messageId: assistantMessage.id });
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

  const httpServer = createServer(app);

  return httpServer;
}
