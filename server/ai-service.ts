// Blueprint integrations: javascript_openai, javascript_anthropic, javascript_gemini
import OpenAI from "openai";
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from "@google/genai";
import type { TradeIdea, InsertTradeIdea } from "@shared/schema";
import { logger } from './logger';
import { logAPIError, logAPISuccess } from './monitoring-service';

// The newest Anthropic model is "claude-sonnet-4-20250514"
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

// Lazy-loaded AI clients (only created when needed)
let openai: OpenAI | null = null;
let anthropic: Anthropic | null = null;
let gemini: GoogleGenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openai) {
    // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

function getAnthropic(): Anthropic {
  if (!anthropic) {
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return anthropic;
}

function getGemini(): GoogleGenAI {
  if (!gemini) {
    // The newest Gemini model series is "gemini-2.5-flash" or "gemini-2.5-pro"
    gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  }
  return gemini;
}

interface AITradeIdea {
  symbol: string;
  assetType: 'stock' | 'option' | 'crypto';
  direction: 'long' | 'short';
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  catalyst: string;
  analysis: string;
  sessionContext: string;
  expiryDate?: string;
}

// Parse trade ideas from conversational text with multi-provider fallback
export async function parseTradeIdeasFromText(text: string): Promise<AITradeIdea[]> {
  const systemPrompt = `You are a trade idea extraction specialist. Parse the given text and extract any trade ideas mentioned.

For each trade idea found, extract:
- symbol: Stock ticker or crypto symbol
- assetType: "stock", "option", or "crypto" 
- direction: "long" or "short" (or "buy"/"sell")
- entryPrice: Suggested entry price (extract from text or estimate based on context)
- targetPrice: Price target
- stopLoss: Stop loss price (if not mentioned, calculate 2-3% below entry for long, above for short)
- catalyst: Why this trade (from the text)
- analysis: The reasoning provided
- sessionContext: Brief market context
- expiryDate: (only for options, format: "YYYY-MM-DD")

Return valid JSON object with structure: {"ideas": [array of trade ideas]}
If no clear trade ideas are found, return empty array.`;

  const userPrompt = `Extract trade ideas from this text:\n\n${text}`;

  // Try OpenAI first (fastest with JSON mode)
  try {
    const openaiResponse = await getOpenAI().chat.completions.create({
      model: "gpt-5",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1024,
    });

    const content = openaiResponse.choices[0].message.content || '{"ideas":[]}';
    const parsed = JSON.parse(content);
    
    if (Array.isArray(parsed)) {
      return parsed;
    } else if (parsed.ideas && Array.isArray(parsed.ideas)) {
      return parsed.ideas;
    }
    return [];
  } catch (openaiError) {
    logger.info("OpenAI parsing failed, trying Anthropic...", openaiError);
    
    // Fallback to Anthropic
    try {
      const anthropicResponse = await getAnthropic().messages.create({
        model: DEFAULT_ANTHROPIC_MODEL,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `${systemPrompt}\n\n${userPrompt}`
          }
        ],
      });

      const content = anthropicResponse.content[0].type === 'text' 
        ? anthropicResponse.content[0].text 
        : '{"ideas":[]}';
      
      // Extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        return parsed;
      } else if (parsed.ideas && Array.isArray(parsed.ideas)) {
        return parsed.ideas;
      }
      return [];
    } catch (anthropicError) {
      logger.info("Anthropic parsing failed, trying Gemini...", anthropicError);
      
      // Fallback to Gemini
      try {
        const geminiResponse = await getGemini().models.generateContent({
          model: "gemini-2.5-flash",
          contents: `${systemPrompt}\n\n${userPrompt}`,
          config: {
            responseMimeType: "application/json"
          }
        });

        const content = geminiResponse.text || '{"ideas":[]}';
        const parsed = JSON.parse(content);
        
        if (Array.isArray(parsed)) {
          return parsed;
        } else if (parsed.ideas && Array.isArray(parsed.ideas)) {
          return parsed.ideas;
        }
        return [];
      } catch (geminiError) {
        logger.error("All AI providers failed to parse trade ideas:", geminiError);
        return [];
      }
    }
  }
}

// Generate trade ideas using FREE Gemini tier (25 requests/day)
export async function generateTradeIdeas(marketContext: string): Promise<AITradeIdea[]> {
  const systemPrompt = `You are a quantitative trading analyst. Generate 3-4 high-quality trade ideas based on current market conditions.

For each trade idea, provide:
- symbol: Stock ticker or crypto symbol
- assetType: "stock", "option", or "crypto"
- direction: "long" or "short"
- entryPrice: Current realistic market price (for stocks/crypto use stock price, for options use option premium like $5-$20)
- targetPrice: Price target (MUST follow direction rules below)
- stopLoss: Stop loss price (MUST follow direction rules below)
- catalyst: Key catalyst driving this trade (1-2 sentences)
- analysis: Technical/fundamental analysis (2-3 sentences)
- sessionContext: Market session context
- expiryDate: (only for options, format: "YYYY-MM-DD")

CRITICAL PRICE RULES:
- For LONG stocks/crypto: targetPrice > entryPrice > stopLoss (e.g., Entry $580, Target $590, Stop $575)
- For SHORT stocks/crypto: stopLoss > entryPrice > targetPrice (e.g., Entry $580, Target $570, Stop $585)
- For options: Use option PREMIUM prices ($5-$50 range), NOT stock prices
- NO options trades - focus on stocks and crypto only
- Use realistic prices: SPY ~$580, NVDA ~$140, BTC ~$67000, ETH ~$2600

Return valid JSON object with structure: {"ideas": [array of trade ideas]}
Focus on actionable, research-grade opportunities.`;

  const userPrompt = `Generate trade ideas for: ${marketContext}`;

  try {
    // Use FREE Gemini Flash tier (25 requests/day, commercial use allowed)
    const startTime = Date.now();
    logger.info("🆓 Using FREE Gemini API tier (25 requests/day)");
    
    const geminiResponse = await getGemini().models.generateContent({
      model: "gemini-2.5-flash", // Free tier model
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
      },
      contents: userPrompt,
    });

    logAPISuccess('Gemini (Free)', 'generateContent', Date.now() - startTime);

    // Parse response
    const parseIdeas = (content: string): AITradeIdea[] => {
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          return parsed;
        } else if (parsed.ideas && Array.isArray(parsed.ideas)) {
          return parsed.ideas;
        }
        return [];
      } catch {
        return [];
      }
    };

    const geminiText = geminiResponse.text || '';
    const geminiIdeas = parseIdeas(geminiText);

    logger.info(`🆓 Generated ${geminiIdeas.length} ideas using FREE Gemini tier`);

    return geminiIdeas.slice(0, 10); // Return max 10 ideas
  } catch (error: any) {
    logger.error("Gemini AI trade idea generation failed:", error);
    
    // Provide helpful error messages
    if (error?.status === 429) {
      throw new Error("Free AI limit reached (25/day). Try again tomorrow or upgrade to paid tier.");
    } else if (error?.status === 401) {
      throw new Error("AI service unavailable: Invalid API credentials");
    }
    
    throw new Error("Failed to generate trade ideas with free AI");
  }
}

// Chat with QuantAI Bot (using FREE Gemini tier)
export async function chatWithQuantAI(userMessage: string, conversationHistory: Array<{role: string, content: string}>): Promise<string> {
  const systemPrompt = `You are QuantAI Bot, an expert quantitative trading assistant for QuantEdge Research platform.

Your role:
- Provide educational market analysis and trading insights
- Answer questions about stocks, options, crypto, and trading strategies
- Explain risk management and position sizing
- Discuss technical indicators, chart patterns, and market catalysts
- Always emphasize that this is educational content, not financial advice

Be concise, professional, and data-driven. Use plain language while maintaining technical accuracy.`;

  // Use FREE Gemini tier (25 requests/day)
  try {
    logger.info("🆓 Using FREE Gemini for chat");
    const conversationText = conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n');
    const fullPrompt = conversationText ? `${conversationText}\nuser: ${userMessage}` : userMessage;
    
    const geminiResponse = await getGemini().models.generateContent({
      model: "gemini-2.5-flash", // Free tier model
      config: {
        systemInstruction: systemPrompt,
      },
      contents: fullPrompt,
    });

    return geminiResponse.text || "I couldn't process that request";
  } catch (error: any) {
    logger.error("Gemini chat failed:", error);
    
    // Provide helpful error message
    if (error?.status === 429) {
      throw new Error("Free AI limit reached (25/day). Try again tomorrow.");
    } else if (error?.status === 401) {
      throw new Error("AI service unavailable: Invalid API credentials");
    }
    
    throw new Error("Failed to process chat message with free AI");
  }
}

// Quick market analysis using Gemini (fast model)
export async function quickMarketAnalysis(symbols: string[]): Promise<string> {
  const prompt = `Provide a brief market analysis for these symbols: ${symbols.join(', ')}. 
  
Include:
- Current market sentiment
- Key catalysts to watch
- Risk factors
- 2-3 sentence summary

Keep it concise and actionable.`;

  try {
    const response = await getGemini().models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return response.text || "Unable to generate analysis";
  } catch (error) {
    logger.error("Quick analysis failed:", error);
    return "Market analysis currently unavailable";
  }
}

// Test a specific AI provider (admin tool)
export async function testAIProvider(provider: string, prompt: string): Promise<AITradeIdea[]> {
  const systemPrompt = `You are a quantitative trading analyst. Generate 1-2 high-quality trade ideas based on the user's request.

For each trade idea, provide:
- symbol: Stock ticker or crypto symbol
- assetType: "stock", "option", or "crypto"
- direction: "long" or "short"
- entryPrice: Suggested entry price
- targetPrice: Price target
- stopLoss: Stop loss price
- catalyst: Why this trade
- analysis: Brief reasoning
- sessionContext: Current market conditions
- expiryDate: (only for options, format: "YYYY-MM-DD")

Return valid JSON object with structure: {"ideas": [array of trade ideas]}`;

  if (provider === 'openai') {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await getOpenAI().chat.completions.create({
      model: "gpt-5",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1024,
    });

    const content = response.choices[0].message.content || '{"ideas":[]}';
    const parsed = JSON.parse(content);
    return parsed.ideas || [];

  } else if (provider === 'anthropic') {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('Anthropic API key not configured');
    }

    const response = await getAnthropic().messages.create({
      model: DEFAULT_ANTHROPIC_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `${systemPrompt}\n\n${prompt}`
        }
      ],
    });

    const content = response.content[0].type === 'text' 
      ? response.content[0].text 
      : '{"ideas":[]}';
    
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
    const parsed = JSON.parse(jsonStr);
    return parsed.ideas || [];

  } else if (provider === 'gemini') {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('Gemini API key not configured');
    }

    const response = await getGemini().models.generateContent({
      model: "gemini-2.5-flash",
      contents: `${systemPrompt}\n\n${prompt}\n\nPlease respond with valid JSON only.`,
    });

    const content = response.text || '{"ideas":[]}';
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
    const parsed = JSON.parse(jsonStr);
    return parsed.ideas || [];

  } else {
    throw new Error(`Invalid provider: ${provider}`);
  }
}

// 🎯 AI + Quant HYBRID: Combine proven quant signals with FREE AI market intelligence
export async function generateHybridIdeas(marketContext: string = "Current market conditions"): Promise<AITradeIdea[]> {
  logger.info("🔬 Starting AI + Quant HYBRID generation");
  
  try {
    // Import quant generator and storage
    const { generateQuantIdeas } = await import('./quant-ideas-generator');
    const { storage } = await import('./storage');
    
    // Step 1: Generate quant ideas using v3.0.0 proven signals (RSI2+200MA, VWAP, Volume)
    const marketData = await storage.getAllMarketData();
    const catalysts = await storage.getAllCatalysts();
    const quantIdeas = await generateQuantIdeas(marketData, catalysts, 4, storage);
    
    if (quantIdeas.length === 0) {
      logger.info("No quant signals found, falling back to pure AI");
      return await generateTradeIdeas(marketContext);
    }
    
    logger.info(`✅ Generated ${quantIdeas.length} quant ideas, enhancing with AI...`);
    
    // Step 2: Use FREE Gemini to enhance each quant idea with market intelligence
    const enhancedIdeas: AITradeIdea[] = [];
    
    for (const quantIdea of quantIdeas.slice(0, 3)) { // Enhance top 3 to stay within free tier
      try {
        const aiPrompt = `You are a market analyst. A quantitative signal detected this opportunity:

Symbol: ${quantIdea.symbol}
Type: ${quantIdea.assetType}
Direction: ${quantIdea.direction}
Entry: $${quantIdea.entryPrice}
Target: $${quantIdea.targetPrice}
Stop Loss: $${quantIdea.stopLoss}
Quant Signal: ${quantIdea.source || 'v3.0 proven signal'}

Provide:
1. Fundamental context (earnings, news, sector strength)
2. Institutional sentiment
3. Risk factors specific to this symbol
4. Enhanced catalyst analysis (2-3 sentences)

Keep response concise (3-4 sentences total).`;

        const geminiResponse = await getGemini().models.generateContent({
          model: "gemini-2.5-flash",
          contents: aiPrompt,
        });
        
        const aiContext = geminiResponse.text || quantIdea.analysis;
        
        // Combine quant data with AI intelligence
        enhancedIdeas.push({
          symbol: quantIdea.symbol,
          assetType: quantIdea.assetType as 'stock' | 'option' | 'crypto',
          direction: quantIdea.direction as 'long' | 'short',
          entryPrice: quantIdea.entryPrice,
          targetPrice: quantIdea.targetPrice,
          stopLoss: quantIdea.stopLoss,
          catalyst: quantIdea.catalyst || `${quantIdea.source || 'v3.0'} signal detected`,
          analysis: `🔬 HYBRID: ${aiContext}`,
          sessionContext: quantIdea.sessionContext || marketContext,
          expiryDate: quantIdea.expiryDate || undefined,
        });
        
      } catch (aiError) {
        logger.warn(`AI enhancement failed for ${quantIdea.symbol}, using quant-only data`);
        // Fallback to quant-only idea
        enhancedIdeas.push({
          symbol: quantIdea.symbol,
          assetType: quantIdea.assetType as 'stock' | 'option' | 'crypto',
          direction: quantIdea.direction as 'long' | 'short',
          entryPrice: quantIdea.entryPrice,
          targetPrice: quantIdea.targetPrice,
          stopLoss: quantIdea.stopLoss,
          catalyst: quantIdea.catalyst || `${quantIdea.source || 'v3.0'} signal`,
          analysis: quantIdea.analysis || `Quantitative signal: ${quantIdea.source || 'v3.0'}`,
          sessionContext: quantIdea.sessionContext || marketContext,
          expiryDate: quantIdea.expiryDate || undefined,
        });
      }
    }
    
    logger.info(`🎯 HYBRID complete: ${enhancedIdeas.length} ideas (quant signals + AI intelligence)`);
    return enhancedIdeas;
    
  } catch (error: any) {
    logger.error("Hybrid generation failed:", error);
    throw new Error("Failed to generate hybrid AI + Quant ideas");
  }
}
