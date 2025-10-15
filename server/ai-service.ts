// Blueprint integrations: javascript_openai, javascript_anthropic, javascript_gemini
import OpenAI from "openai";
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from "@google/genai";
import type { TradeIdea, InsertTradeIdea } from "@shared/schema";

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

// Generate trade ideas using all 3 AI models
export async function generateTradeIdeas(marketContext: string): Promise<AITradeIdea[]> {
  const systemPrompt = `You are a quantitative trading analyst. Generate 3-4 high-quality trade ideas based on current market conditions.

For each trade idea, provide:
- symbol: Stock ticker or crypto symbol
- assetType: "stock", "option", or "crypto"
- direction: "long" or "short"
- entryPrice: Suggested entry price (realistic number)
- targetPrice: Price target
- stopLoss: Stop loss price
- catalyst: Key catalyst driving this trade (1-2 sentences)
- analysis: Technical/fundamental analysis (2-3 sentences)
- sessionContext: Market session context
- expiryDate: (only for options, format: "YYYY-MM-DD")

Return valid JSON array of trade ideas. Focus on actionable, research-grade opportunities.`;

  const userPrompt = `Generate trade ideas for: ${marketContext}`;

  try {
    // Use all 3 models in parallel for diverse perspectives
    const [openaiResponse, anthropicResponse, geminiResponse] = await Promise.all([
      // OpenAI GPT-5
      getOpenAI().chat.completions.create({
        model: "gpt-5",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 2048,
      }),
      
      // Anthropic Claude
      getAnthropic().messages.create({
        model: DEFAULT_ANTHROPIC_MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      
      // Google Gemini
      getGemini().models.generateContent({
        model: "gemini-2.5-pro",
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
        },
        contents: userPrompt,
      })
    ]);

    // Parse responses
    const openaiIdeas = JSON.parse(openaiResponse.choices[0].message.content || '{"ideas":[]}');
    
    const anthropicText = anthropicResponse.content.find(block => block.type === 'text');
    const anthropicIdeas = JSON.parse(anthropicText && 'text' in anthropicText ? anthropicText.text : '{"ideas":[]}');
    
    const geminiIdeas = JSON.parse(geminiResponse.text || '{"ideas":[]}');

    // Combine all ideas
    const allIdeas: AITradeIdea[] = [
      ...(openaiIdeas.ideas || []),
      ...(anthropicIdeas.ideas || []),
      ...(geminiIdeas.ideas || [])
    ];

    return allIdeas.slice(0, 10); // Return max 10 ideas
  } catch (error: any) {
    console.error("AI trade idea generation failed:", error);
    
    // Provide helpful error messages
    if (error?.status === 400 && error?.message?.includes('credit balance')) {
      throw new Error("AI service unavailable: Please check your API credits");
    } else if (error?.status === 401) {
      throw new Error("AI service unavailable: Invalid API credentials");
    } else if (error?.status === 429) {
      throw new Error("AI service unavailable: Rate limit exceeded");
    }
    
    throw new Error("Failed to generate trade ideas");
  }
}

// Chat with QuantAI Bot
export async function chatWithQuantAI(userMessage: string, conversationHistory: Array<{role: string, content: string}>): Promise<string> {
  const systemPrompt = `You are QuantAI Bot, an expert quantitative trading assistant for QuantEdge Research platform.

Your role:
- Provide educational market analysis and trading insights
- Answer questions about stocks, options, crypto, and trading strategies
- Explain risk management and position sizing
- Discuss technical indicators, chart patterns, and market catalysts
- Always emphasize that this is educational content, not financial advice

Be concise, professional, and data-driven. Use plain language while maintaining technical accuracy.`;

  try {
    // Use Claude for chat (best conversational AI)
    const response = await getAnthropic().messages.create({
      model: DEFAULT_ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        ...conversationHistory.map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        })),
        { role: 'user', content: userMessage }
      ],
    });

    const textBlock = response.content.find(block => block.type === 'text');
    return textBlock && 'text' in textBlock ? textBlock.text : "I couldn't process that request";
  } catch (error: any) {
    console.error("QuantAI chat failed:", error);
    
    // Provide helpful error messages based on error type
    if (error?.status === 400 && error?.message?.includes('credit balance')) {
      throw new Error("AI service unavailable: Please check your Anthropic API credits at https://console.anthropic.com/settings/billing");
    } else if (error?.status === 401) {
      throw new Error("AI service unavailable: Invalid API credentials");
    } else if (error?.status === 429) {
      throw new Error("AI service unavailable: Rate limit exceeded. Please try again in a moment.");
    }
    
    throw new Error("Failed to process chat message");
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
    console.error("Quick analysis failed:", error);
    return "Market analysis currently unavailable";
  }
}
