/**
 * Ask Quantinum — provider abstraction + fallback chain.
 *
 * Same SDKs as server/ai-service.ts / multi-llm-service.ts (no new deps):
 *   groq      → openai SDK at api.groq.com/openai/v1 (Llama, free tier)
 *   gemini    → @google/genai (Flash)
 *   anthropic → @anthropic-ai/sdk (Claude Haiku 4.5 for "deep analyze")
 *   openai    → openai SDK
 * Keys are read server-side only (process.env at call time) and never logged.
 * Nothing about the member (email, name, id) is sent — only system + one user
 * message built by quantinum-ai-prompt.ts.
 *
 * runChain(): try each configured step in order; a step with no key is skipped;
 * any error (429, 5xx, timeout, auth, refusal, empty) falls through to the next.
 * If a step already streamed text before failing, onReset() tells the client to
 * clear the partial answer before the next provider starts.
 */
import type { ProviderStep, QuantinumProviderId } from '@shared/quantinum-ai';

export interface LlmRequest { system: string; user: string; maxTokens: number; signal?: AbortSignal }
export interface LlmResult { text: string; inputTokens: number; outputTokens: number; stopReason?: string | null }
export interface LlmAdapter {
  id: QuantinumProviderId;
  available(): boolean;
  stream(model: string, req: LlmRequest, onDelta: (text: string) => void): Promise<LlmResult>;
}

export class ProviderError extends Error {
  constructor(message: string, public readonly status: number | null = null, public readonly kind: 'rate_limit' | 'unavailable' | 'error' | 'empty' | 'refusal' = 'error') {
    super(message);
  }
}

const TIMEOUT_MS = 45_000;

function classify(e: any): ProviderError {
  if (e instanceof ProviderError) return e;
  const status = Number(e?.status ?? e?.response?.status ?? e?.code) || null;
  const kind = status === 429 ? 'rate_limit' : status && status >= 500 ? 'unavailable' : 'error';
  // Never echo provider error bodies (they can include request ids / partial keys).
  return new ProviderError(status ? `HTTP ${status}` : String(e?.name ?? 'error'), status, kind);
}

function withTimeout(signal?: AbortSignal): AbortSignal {
  const t = AbortSignal.timeout(TIMEOUT_MS);
  return signal ? (AbortSignal as any).any?.([signal, t]) ?? t : t;
}

// ─── adapters ────────────────────────────────────────────────

function openAiCompatible(id: 'groq' | 'openai', keyEnv: string, baseURL?: string): LlmAdapter {
  return {
    id,
    available: () => !!process.env[keyEnv],
    async stream(model, req, onDelta) {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey: process.env[keyEnv], ...(baseURL ? { baseURL } : {}), maxRetries: 0 });
      let text = '', inputTokens = 0, outputTokens = 0, stopReason: string | null = null;
      try {
        const body: any = {
          model, stream: true, stream_options: { include_usage: true }, temperature: 0.2,
          messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.user }],
        };
        if (id === 'openai') body.max_completion_tokens = req.maxTokens; else body.max_tokens = req.maxTokens;
        const stream: any = await client.chat.completions.create(body, { signal: withTimeout(req.signal) });
        for await (const chunk of stream) {
          const d = chunk?.choices?.[0]?.delta?.content;
          if (d) { text += d; onDelta(d); }
          if (chunk?.choices?.[0]?.finish_reason) stopReason = chunk.choices[0].finish_reason;
          if (chunk?.usage) { inputTokens = chunk.usage.prompt_tokens ?? 0; outputTokens = chunk.usage.completion_tokens ?? 0; }
        }
      } catch (e) { throw classify(e); }
      return { text, inputTokens, outputTokens, stopReason };
    },
  };
}

const geminiAdapter: LlmAdapter = {
  id: 'gemini',
  available: () => !!process.env.GEMINI_API_KEY,
  async stream(model, req, onDelta) {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    let text = '', inputTokens = 0, outputTokens = 0, stopReason: string | null = null;
    try {
      const stream = await ai.models.generateContentStream({
        model,
        contents: [{ role: 'user', parts: [{ text: req.user }] }],
        config: {
          systemInstruction: req.system,
          maxOutputTokens: req.maxTokens,
          temperature: 0.2,
          // Flash thinks by default and bills it against the output budget; answers here are grounded lookups.
          thinkingConfig: { thinkingBudget: 0 },
          abortSignal: withTimeout(req.signal),
        },
      });
      for await (const chunk of stream) {
        const d = chunk.text;
        if (d) { text += d; onDelta(d); }
        const fr = chunk.candidates?.[0]?.finishReason;
        if (fr) stopReason = String(fr);
        if (chunk.usageMetadata) {
          inputTokens = chunk.usageMetadata.promptTokenCount ?? inputTokens;
          outputTokens = (chunk.usageMetadata.candidatesTokenCount ?? 0) + (chunk.usageMetadata.thoughtsTokenCount ?? 0);
        }
      }
    } catch (e) { throw classify(e); }
    if (stopReason === 'SAFETY' || stopReason === 'PROHIBITED_CONTENT') throw new ProviderError('blocked', null, 'refusal');
    return { text, inputTokens, outputTokens, stopReason };
  },
};

const anthropicAdapter: LlmAdapter = {
  id: 'anthropic',
  available: () => !!process.env.ANTHROPIC_API_KEY,
  async stream(model, req, onDelta) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    // Our chain is the retry policy; one SDK retry covers a transient blip.
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: TIMEOUT_MS });
    try {
      const stream = client.messages.stream(
        { model, max_tokens: req.maxTokens, system: req.system, messages: [{ role: 'user', content: req.user }] },
        { signal: req.signal },
      );
      stream.on('text', (d: string) => { if (d) onDelta(d); });
      const msg = await stream.finalMessage();
      const stopReason = String(msg.stop_reason ?? '');
      if (stopReason === 'refusal') throw new ProviderError('refusal', null, 'refusal');
      const text = msg.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('');
      return { text, inputTokens: msg.usage?.input_tokens ?? 0, outputTokens: msg.usage?.output_tokens ?? 0, stopReason };
    } catch (e: any) {
      if (e instanceof ProviderError) throw e;
      if (e instanceof Anthropic.RateLimitError) throw new ProviderError('rate limited', 429, 'rate_limit');
      if (e instanceof Anthropic.APIError) throw classify(e);
      throw classify(e);
    }
  },
};

export function defaultAdapters(): Record<QuantinumProviderId, LlmAdapter> {
  return {
    groq: openAiCompatible('groq', 'GROQ_API_KEY', 'https://api.groq.com/openai/v1'),
    openai: openAiCompatible('openai', 'OPENAI_API_KEY'),
    gemini: geminiAdapter,
    anthropic: anthropicAdapter,
  };
}

// ─── fallback chain ──────────────────────────────────────────

export interface ChainAttempt { provider: QuantinumProviderId; model: string; error: string | null; kind?: string; skipped?: boolean }
export interface ChainHooks {
  onDelta: (text: string) => void;
  /** A provider failed after streaming some text; the client should discard it. */
  onReset?: (from: ProviderStep) => void;
}
export interface ChainResult { step: ProviderStep; result: LlmResult; attempts: ChainAttempt[]; fallbacks: number }

export class ChainExhausted extends Error {
  constructor(public readonly attempts: ChainAttempt[]) { super('every provider in the chain failed'); }
}

export async function runChain(
  chain: ProviderStep[],
  adapters: Partial<Record<QuantinumProviderId, LlmAdapter>>,
  req: LlmRequest,
  hooks: ChainHooks,
): Promise<ChainResult> {
  const attempts: ChainAttempt[] = [];
  for (const step of chain) {
    if (req.signal?.aborted) break;
    const a = adapters[step.provider];
    if (!a || !a.available()) { attempts.push({ ...step, error: 'no key configured', skipped: true }); continue; }
    let streamed = false;
    try {
      const result = await a.stream(step.model, req, (d) => { streamed = true; hooks.onDelta(d); });
      if (!result.text.trim()) throw new ProviderError('empty answer', null, 'empty');
      attempts.push({ ...step, error: null });
      return { step, result, attempts, fallbacks: attempts.filter((x) => x.error && !x.skipped).length };
    } catch (e) {
      const pe = classify(e);
      attempts.push({ ...step, error: pe.message, kind: pe.kind });
      if (streamed) hooks.onReset?.(step);
    }
  }
  throw new ChainExhausted(attempts);
}
