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
    console.log("OpenAI parsing failed, trying Anthropic...", openaiError);
    
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
      console.log("Anthropic parsing failed, trying Gemini...", anthropicError);
      
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
        console.error("All AI providers failed to parse trade ideas:", geminiError);
        return [];
      }
    }
  }
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

Return valid JSON object with structure: {"ideas": [array of trade ideas]}
Focus on actionable, research-grade opportunities.`;

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

    // Parse responses - handle both array and object formats
    const parseIdeas = (content: string): AITradeIdea[] => {
      try {
        const parsed = JSON.parse(content);
        // Handle both array format and object with ideas property
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

    const openaiIdeas = parseIdeas(openaiResponse.choices[0].message.content || '[]');
    
    const anthropicText = anthropicResponse.content.find(block => block.type === 'text');
    const anthropicIdeas = parseIdeas(anthropicText && 'text' in anthropicText ? anthropicText.text : '[]');
    
    // Gemini: use text getter
    const geminiText = geminiResponse.text || '';
    const geminiIdeas = parseIdeas(geminiText);

    // Combine all ideas
    const allIdeas: AITradeIdea[] = [
      ...openaiIdeas,
      ...anthropicIdeas,
      ...geminiIdeas
    ];

    console.log(`Generated ${openaiIdeas.length} ideas from OpenAI, ${anthropicIdeas.length} from Anthropic, ${geminiIdeas.length} from Gemini`);

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

  // Try Anthropic (Claude) first - best conversational AI
  try {
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
    
    // Try OpenAI as fallback
    try {
      console.log("Falling back to OpenAI for chat...");
      const openaiResponse = await getOpenAI().chat.completions.create({
        model: "gpt-5",
        messages: [
          { role: "system", content: systemPrompt },
          ...conversationHistory.map(msg => ({
            role: msg.role as 'system' | 'user' | 'assistant',
            content: msg.content
          })),
          { role: "user", content: userMessage }
        ],
        max_completion_tokens: 1024,
      });

      return openaiResponse.choices[0].message.content || "I couldn't process that request";
    } catch (openaiError: any) {
      console.error("OpenAI chat also failed:", openaiError);
      
      // Try Gemini as final fallback
      try {
        console.log("Falling back to Gemini for chat...");
        const conversationText = conversationHistory.map(msg => msg.content).join('\n');
        const fullPrompt = conversationText ? `${conversationText}\n\n${userMessage}` : userMessage;
        
        const geminiResponse = await getGemini().models.generateContent({
          model: "gemini-2.5-pro",
          config: {
            systemInstruction: systemPrompt,
          },
          contents: fullPrompt,
        });

        return geminiResponse.text || "I couldn't process that request";
      } catch (geminiError: any) {
        console.error("All AI providers failed for chat:", geminiError);
        
        // Provide helpful error message
        if (error?.status === 400 && error?.message?.includes('credit balance')) {
          throw new Error("AI service unavailable: Anthropic credits low. Please add OpenAI or Gemini credits, or upgrade Anthropic at https://console.anthropic.com/settings/billing");
        } else if (error?.status === 401) {
          throw new Error("AI service unavailable: Please check your API keys for OpenAI, Anthropic, or Gemini");
        } else if (error?.status === 429) {
          throw new Error("AI service unavailable: Rate limits exceeded on all providers. Please try again in a moment.");
        }
        
        throw new Error("Failed to process chat message - all AI providers unavailable");
      }
    }
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
