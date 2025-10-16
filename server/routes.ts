import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { searchSymbol } from "./market-api";
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
      // Auto-archive ideas that hit target, stop, or are stale
      const ideas = await storage.getAllTradeIdeas();
      const marketData = await storage.getAllMarketData();
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      for (const idea of ideas) {
        // Skip if already archived
        if (idea.outcomeStatus && idea.outcomeStatus !== 'open') continue;
        
        // Skip options - we don't have live option prices to compare
        if (idea.assetType === 'option') continue;
        
        // Check if idea is stale (7+ days old with no movement)
        const ideaDate = new Date(idea.timestamp);
        if (ideaDate < sevenDaysAgo) {
          await storage.updateTradeIdeaPerformance(idea.id, { 
            outcomeStatus: 'expired',
            exitDate: now.toISOString()
          });
          continue;
        }
        
        // Get current price for the symbol
        const symbolData = marketData.find(m => m.symbol === idea.symbol);
        if (!symbolData) continue;
        
        const currentPrice = symbolData.currentPrice;
        
        // Check if target or stop hit
        if (idea.direction === 'long') {
          // Long trade: check if price >= target or <= stop
          if (currentPrice >= idea.targetPrice) {
            await storage.updateTradeIdeaPerformance(idea.id, {
              outcomeStatus: 'hit_target',
              actualExit: currentPrice,
              exitDate: now.toISOString()
            });
          } else if (currentPrice <= idea.stopLoss) {
            await storage.updateTradeIdeaPerformance(idea.id, {
              outcomeStatus: 'hit_stop',
              actualExit: currentPrice,
              exitDate: now.toISOString()
            });
          }
        } else {
          // Short trade: check if price <= target or >= stop
          if (currentPrice <= idea.targetPrice) {
            await storage.updateTradeIdeaPerformance(idea.id, {
              outcomeStatus: 'hit_target',
              actualExit: currentPrice,
              exitDate: now.toISOString()
            });
          } else if (currentPrice >= idea.stopLoss) {
            await storage.updateTradeIdeaPerformance(idea.id, {
              outcomeStatus: 'hit_stop',
              actualExit: currentPrice,
              exitDate: now.toISOString()
            });
          }
        }
      }
      
      // Fetch updated ideas after archiving
      const updatedIdeas = await storage.getAllTradeIdeas();
      res.json(updatedIdeas);
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

  app.patch("/api/trade-ideas/:id/performance", async (req, res) => {
    try {
      const { outcomeStatus, actualExit, exitDate } = req.body;
      const updated = await storage.updateTradeIdeaPerformance(req.params.id, {
        outcomeStatus,
        actualExit,
        exitDate
      });
      if (!updated) {
        return res.status(404).json({ error: "Trade idea not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update performance" });
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

      // Generate simulated historical prices (last 60 days)
      const generateHistoricalPrices = (currentPrice: number, changePercent: number, periods: number = 60): number[] => {
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

      const historicalPrices = generateHistoricalPrices(marketData.currentPrice, marketData.changePercent, 60);
      
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

  // Quantitative Idea Generator (No AI required)
  app.post("/api/quant/generate-ideas", async (req, res) => {
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
      
      // Save ideas to storage
      const savedIdeas = [];
      for (const idea of quantIdeas) {
        const tradeIdea = await storage.createTradeIdea(idea);
        savedIdeas.push(tradeIdea);
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
          strikePrice: aiIdea.assetType === 'option' ? aiIdea.entryPrice * (aiIdea.direction === 'long' ? 1.02 : 0.98) : null,
          optionType: aiIdea.assetType === 'option' ? (aiIdea.direction === 'long' ? 'call' : 'put') : null,
          source: 'ai'
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
