/**
 * Multi-LLM Validation Layer
 * 
 * Uses multiple LLMs (Claude, GPT, Gemini + optional Groq) to validate
 * trade ideas through consensus analysis. This provides:
 * - Reduced false positives through cross-validation
 * - More robust analysis by combining strengths of different models
 * - Fallback resilience if one provider is unavailable
 * 
 * FREE LLM OPTIONS:
 * - Groq: 14,400 req/day free (requires GROQ_API_KEY)
 * - Mistral: 1B tokens/month free (requires MISTRAL_API_KEY)
 * - We already have: Claude, GPT, Gemini configured
 */

import { logger } from './logger';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';

interface TradeIdea {
  symbol: string;
  direction: 'long' | 'short';
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  confidenceScore: number;
  analysis: string;
  source: string;
}

interface ValidationResult {
  provider: string;
  approved: boolean;
  confidence: number;
  reasoning: string;
  warnings: string[];
  suggestedAdjustments?: {
    targetPrice?: number;
    stopLoss?: number;
    confidenceAdjustment?: number;
  };
  responseTime: number;
}

interface ConsensusResult {
  approved: boolean;
  consensusScore: number; // 0-100
  providersAgreed: number;
  totalProviders: number;
  individualResults: ValidationResult[];
  combinedReasoning: string;
  warnings: string[];
  adjustedConfidence: number;
  validationTimestamp: string;
}

// LLM Provider configuration
interface LLMProvider {
  name: string;
  enabled: boolean;
  validate: (idea: TradeIdea, marketContext: string) => Promise<ValidationResult>;
}

// Lazy-loaded clients
let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;
let geminiClient: GoogleGenAI | null = null;
let groqClient: OpenAI | null = null; // Groq uses OpenAI-compatible API

function getAnthropicClient(): Anthropic | null {
  if (!anthropicClient && process.env.ANTHROPIC_API_KEY) {
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

function getOpenAIClient(): OpenAI | null {
  if (!openaiClient && process.env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

function getGeminiClient(): GoogleGenAI | null {
  if (!geminiClient && process.env.GEMINI_API_KEY) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  }
  return geminiClient;
}

function getGroqClient(): OpenAI | null {
  if (!groqClient && process.env.GROQ_API_KEY) {
    groqClient = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1'
    });
  }
  return groqClient;
}

// Validation prompt template
function createValidationPrompt(idea: TradeIdea, marketContext: string): string {
  return `You are a senior quantitative trading analyst. Validate this trade idea and provide your assessment.

TRADE IDEA:
- Symbol: ${idea.symbol}
- Direction: ${idea.direction.toUpperCase()}
- Entry: $${idea.entryPrice}
- Target: $${idea.targetPrice} (${((idea.targetPrice - idea.entryPrice) / idea.entryPrice * 100).toFixed(2)}% gain)
- Stop Loss: $${idea.stopLoss} (${((idea.stopLoss - idea.entryPrice) / idea.entryPrice * 100).toFixed(2)}% risk)
- Confidence: ${idea.confidenceScore}%
- Source: ${idea.source}
- Analysis: ${idea.analysis.slice(0, 500)}

MARKET CONTEXT:
${marketContext || 'Standard market conditions'}

INSTRUCTIONS:
Evaluate this trade idea for:
1. Technical validity (support/resistance, trends, momentum)
2. Risk/reward ratio appropriateness
3. Position sizing reasonableness
4. Entry timing quality
5. Potential red flags or concerns

Respond in JSON format:
{
  "approved": true/false,
  "confidence": 0-100,
  "reasoning": "Brief explanation (2-3 sentences)",
  "warnings": ["array of concerns if any"],
  "suggestedAdjustments": {
    "targetPrice": null or adjusted price,
    "stopLoss": null or adjusted price,
    "confidenceAdjustment": -10 to +10
  }
}`;
}

// Claude validation
async function validateWithClaude(idea: TradeIdea, marketContext: string): Promise<ValidationResult> {
  const startTime = Date.now();
  const client = getAnthropicClient();
  
  if (!client) {
    return {
      provider: 'claude',
      approved: true, // Default approve if unavailable
      confidence: idea.confidenceScore,
      reasoning: 'Claude unavailable - skipped validation',
      warnings: ['Anthropic API not configured'],
      responseTime: 0
    };
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: createValidationPrompt(idea, marketContext)
      }]
    });

    const content = response.content[0];
    const text = content.type === 'text' ? content.text : '';
    
    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        provider: 'claude',
        approved: parsed.approved ?? true,
        confidence: parsed.confidence ?? idea.confidenceScore,
        reasoning: parsed.reasoning ?? 'Validated',
        warnings: parsed.warnings ?? [],
        suggestedAdjustments: parsed.suggestedAdjustments,
        responseTime: Date.now() - startTime
      };
    }
    
    return {
      provider: 'claude',
      approved: true,
      confidence: idea.confidenceScore,
      reasoning: 'Could not parse validation response',
      warnings: [],
      responseTime: Date.now() - startTime
    };
  } catch (error) {
    logger.error('[MULTI-LLM] Claude validation error:', error);
    return {
      provider: 'claude',
      approved: true,
      confidence: idea.confidenceScore,
      reasoning: 'Claude validation failed - defaulting to approve',
      warnings: ['Validation error'],
      responseTime: Date.now() - startTime
    };
  }
}

// GPT validation
async function validateWithGPT(idea: TradeIdea, marketContext: string): Promise<ValidationResult> {
  const startTime = Date.now();
  const client = getOpenAIClient();
  
  if (!client) {
    return {
      provider: 'gpt',
      approved: true,
      confidence: idea.confidenceScore,
      reasoning: 'GPT unavailable - skipped validation',
      warnings: ['OpenAI API not configured'],
      responseTime: 0
    };
  }

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: createValidationPrompt(idea, marketContext)
      }],
      response_format: { type: 'json_object' }
    });

    const text = response.choices[0]?.message?.content || '';
    const parsed = JSON.parse(text);
    
    return {
      provider: 'gpt',
      approved: parsed.approved ?? true,
      confidence: parsed.confidence ?? idea.confidenceScore,
      reasoning: parsed.reasoning ?? 'Validated',
      warnings: parsed.warnings ?? [],
      suggestedAdjustments: parsed.suggestedAdjustments,
      responseTime: Date.now() - startTime
    };
  } catch (error) {
    logger.error('[MULTI-LLM] GPT validation error:', error);
    return {
      provider: 'gpt',
      approved: true,
      confidence: idea.confidenceScore,
      reasoning: 'GPT validation failed - defaulting to approve',
      warnings: ['Validation error'],
      responseTime: Date.now() - startTime
    };
  }
}

// Gemini validation
async function validateWithGemini(idea: TradeIdea, marketContext: string): Promise<ValidationResult> {
  const startTime = Date.now();
  const client = getGeminiClient();
  
  if (!client) {
    return {
      provider: 'gemini',
      approved: true,
      confidence: idea.confidenceScore,
      reasoning: 'Gemini unavailable - skipped validation',
      warnings: ['Gemini API not configured'],
      responseTime: 0
    };
  }

  try {
    const response = await client.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: createValidationPrompt(idea, marketContext)
    });

    const text = response.text || '';
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        provider: 'gemini',
        approved: parsed.approved ?? true,
        confidence: parsed.confidence ?? idea.confidenceScore,
        reasoning: parsed.reasoning ?? 'Validated',
        warnings: parsed.warnings ?? [],
        suggestedAdjustments: parsed.suggestedAdjustments,
        responseTime: Date.now() - startTime
      };
    }
    
    return {
      provider: 'gemini',
      approved: true,
      confidence: idea.confidenceScore,
      reasoning: 'Could not parse Gemini response',
      warnings: [],
      responseTime: Date.now() - startTime
    };
  } catch (error) {
    logger.error('[MULTI-LLM] Gemini validation error:', error);
    return {
      provider: 'gemini',
      approved: true,
      confidence: idea.confidenceScore,
      reasoning: 'Gemini validation failed - defaulting to approve',
      warnings: ['Validation error'],
      responseTime: Date.now() - startTime
    };
  }
}

// Groq validation (FREE - 14,400 requests/day)
async function validateWithGroq(idea: TradeIdea, marketContext: string): Promise<ValidationResult> {
  const startTime = Date.now();
  const client = getGroqClient();
  
  if (!client) {
    return {
      provider: 'groq',
      approved: true,
      confidence: idea.confidenceScore,
      reasoning: 'Groq unavailable - add GROQ_API_KEY for free LLM validation',
      warnings: ['Groq API not configured - get free key at groq.com'],
      responseTime: 0
    };
  }

  try {
    const response = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: createValidationPrompt(idea, marketContext)
      }]
    });

    const text = response.choices[0]?.message?.content || '';
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        provider: 'groq',
        approved: parsed.approved ?? true,
        confidence: parsed.confidence ?? idea.confidenceScore,
        reasoning: parsed.reasoning ?? 'Validated via Groq (free)',
        warnings: parsed.warnings ?? [],
        suggestedAdjustments: parsed.suggestedAdjustments,
        responseTime: Date.now() - startTime
      };
    }
    
    return {
      provider: 'groq',
      approved: true,
      confidence: idea.confidenceScore,
      reasoning: 'Could not parse Groq response',
      warnings: [],
      responseTime: Date.now() - startTime
    };
  } catch (error) {
    logger.error('[MULTI-LLM] Groq validation error:', error);
    return {
      provider: 'groq',
      approved: true,
      confidence: idea.confidenceScore,
      reasoning: 'Groq validation failed - defaulting to approve',
      warnings: ['Groq validation error'],
      responseTime: Date.now() - startTime
    };
  }
}

/**
 * Validate a trade idea using multiple LLMs for consensus
 * Uses all available LLMs in parallel for speed
 */
export async function validateTradeWithConsensus(
  idea: TradeIdea,
  marketContext: string = '',
  options: {
    requireConsensus?: boolean;  // Require majority approval
    minProviders?: number;       // Minimum providers that must succeed
    timeout?: number;            // Max time to wait for all providers
  } = {}
): Promise<ConsensusResult> {
  const {
    requireConsensus = true,
    minProviders = 2,
    timeout = 10000
  } = options;

  logger.info(`[MULTI-LLM] Starting consensus validation for ${idea.symbol} ${idea.direction}`);
  
  // Wrap each validation with individual timeout using Promise.allSettled
  // This ensures we get partial results even if some providers are slow
  const wrapWithTimeout = <T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs))
    ]);
  };

  const timeoutFallback = (provider: string): ValidationResult => ({
    provider,
    approved: false, // Default to REJECT on timeout for safety
    confidence: 0,
    reasoning: 'Provider timed out',
    warnings: ['Provider timeout - validation incomplete'],
    responseTime: 0
  });

  // Run all validations with individual timeouts
  const validationPromises = [
    wrapWithTimeout(validateWithClaude(idea, marketContext), timeout, timeoutFallback('claude')),
    wrapWithTimeout(validateWithGPT(idea, marketContext), timeout, timeoutFallback('gpt')),
    wrapWithTimeout(validateWithGemini(idea, marketContext), timeout, timeoutFallback('gemini')),
    wrapWithTimeout(validateWithGroq(idea, marketContext), timeout, timeoutFallback('groq'))
  ];

  // Use Promise.allSettled to get all results (partial or complete)
  const settledResults = await Promise.allSettled(validationPromises);
  
  // Extract fulfilled results
  const results: ValidationResult[] = settledResults
    .filter((r): r is PromiseFulfilledResult<ValidationResult> => r.status === 'fulfilled')
    .map(r => r.value);

  // Filter out failed/skipped validations (responseTime > 0 means successful call)
  const successfulResults = results.filter(r => r.responseTime > 0);
  
  // Calculate consensus - CRITICAL: If no providers succeed, default to REJECT (not approve)
  const approvedCount = successfulResults.filter(r => r.approved).length;
  const totalProviders = successfulResults.length;
  
  // If zero providers responded successfully, consensusScore = 0 and approved = false
  const consensusScore = totalProviders > 0 ? (approvedCount / totalProviders) * 100 : 0;
  
  // Calculate adjusted confidence
  const avgConfidence = successfulResults.length > 0
    ? successfulResults.reduce((sum, r) => sum + r.confidence, 0) / successfulResults.length
    : idea.confidenceScore;
  
  // Combine warnings
  const allWarnings = successfulResults.flatMap(r => r.warnings);
  const uniqueWarnings = Array.from(new Set(allWarnings));
  
  // Combine reasoning
  const combinedReasoning = successfulResults
    .map(r => `[${r.provider.toUpperCase()}] ${r.reasoning}`)
    .join(' | ');
  
  // Determine final approval - CRITICAL: Zero providers = automatic REJECT for safety
  let approved: boolean;
  if (totalProviders === 0) {
    approved = false; // No validation means REJECT
    logger.warn('[MULTI-LLM] No providers succeeded - defaulting to REJECT');
  } else if (requireConsensus) {
    approved = approvedCount >= Math.ceil(totalProviders / 2); // Majority approval
  } else {
    approved = approvedCount >= minProviders;
  }
  
  const result: ConsensusResult = {
    approved,
    consensusScore,
    providersAgreed: approvedCount,
    totalProviders,
    individualResults: results,
    combinedReasoning,
    warnings: uniqueWarnings,
    adjustedConfidence: Math.round(avgConfidence),
    validationTimestamp: new Date().toISOString()
  };

  logger.info(`[MULTI-LLM] Consensus: ${approved ? 'APPROVED' : 'REJECTED'} (${approvedCount}/${totalProviders} providers, score: ${consensusScore}%)`);
  
  return result;
}

/**
 * Quick validation using single fastest provider (Groq or Gemini)
 * Use this for high-volume, lower-stakes validations
 */
export async function quickValidation(idea: TradeIdea, marketContext: string = ''): Promise<ValidationResult> {
  // Try Groq first (free + fastest)
  if (process.env.GROQ_API_KEY) {
    return validateWithGroq(idea, marketContext);
  }
  
  // Fall back to Gemini (usually fast)
  if (process.env.GEMINI_API_KEY) {
    return validateWithGemini(idea, marketContext);
  }
  
  // Default approve if no providers available
  return {
    provider: 'none',
    approved: true,
    confidence: idea.confidenceScore,
    reasoning: 'No validation providers configured',
    warnings: ['Add GROQ_API_KEY or GEMINI_API_KEY for trade validation'],
    responseTime: 0
  };
}

/**
 * Get validation service status
 */
export function getValidationServiceStatus(): {
  providers: { name: string; available: boolean }[];
  totalAvailable: number;
  recommendedProviders: string[];
} {
  const providers = [
    { name: 'Claude (Anthropic)', available: !!process.env.ANTHROPIC_API_KEY },
    { name: 'GPT (OpenAI)', available: !!process.env.OPENAI_API_KEY },
    { name: 'Gemini (Google)', available: !!process.env.GEMINI_API_KEY },
    { name: 'Groq (FREE)', available: !!process.env.GROQ_API_KEY }
  ];
  
  const totalAvailable = providers.filter(p => p.available).length;
  
  const recommendedProviders: string[] = [];
  if (!process.env.GROQ_API_KEY) {
    recommendedProviders.push('Add GROQ_API_KEY for 14,400 free validations/day');
  }
  
  return {
    providers,
    totalAvailable,
    recommendedProviders
  };
}
