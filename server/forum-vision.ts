/**
 * Screenshot reading for the Discord forum import (I/O side of shared/forum-vision.ts).
 *
 *   visionCallerFromEnv()   Anthropic claude-sonnet-5 (ANTHROPIC_API_KEY), else
 *                           Gemini gemini-2.5-flash (GEMINI_API_KEY / GOOGLE_API_KEY) —
 *                           the vision providers the codebase already uses
 *                           (server/ai-service.ts, server/portfolio-ai-insights.ts)
 *   createVisionRunner()    reads images: cache → fetch bytes → budget → model →
 *                           zod validation; concurrency 3; retries 429/529 with
 *                           backoff (Retry-After honoured); a per-import cap
 *                           (FORUM_VISION_MAX_IMAGES, default 1500)
 *
 * Images are fetched from the (fresh, signed) Discord CDN url at import time and
 * sent inline as base64. They are NEVER stored: only the extracted JSON (plus
 * attachment id and sha256, the cache keys) lands in journal_notes.meta.vision.
 * The caller, the image fetch and the sleep are injectable so tests run
 * against a mocked model (scripts/test-forum-vision.ts) — no key, no network.
 */
import { createHash } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import {
  VISION_FALLBACK_MODEL, VISION_MAX_IMAGE_BYTES, VISION_MIN_CONFIDENCE, VISION_MODEL, VISION_PRICE, VISION_PROMPT_VERSION, VISION_SYSTEM_PROMPT,
  attachmentIdOf, estimateVisionCost, parseVisionText, reusableRecord, sniffImageType, visionUserPrompt,
  type VisionImageRecord,
} from '@shared/forum-vision';

export interface VisionImageInput { base64: string; mediaType: string; postedAt: string }
export interface VisionCallResult { text: string; provider: 'anthropic' | 'gemini'; model: string; usage: { input: number; output: number } | null }
export type VisionCaller = (img: VisionImageInput) => Promise<VisionCallResult>;

/** A provider error with the HTTP status (429 / 529 are retried). */
export class VisionHttpError extends Error {
  constructor(public status: number, message: string, public retryAfterMs: number | null = null) { super(message); }
}

const RETRY_STATUSES = new Set([429, 529]);

export function visionCallerFromEnv(env: NodeJS.ProcessEnv = process.env): { caller: VisionCaller | null; provider: 'anthropic' | 'gemini' | null; model: string | null } {
  const anthropicKey = env.ANTHROPIC_API_KEY?.trim();
  if (anthropicKey) {
    // SDK retries off: the runner owns retry/backoff so 429/529 waits are counted and bounded.
    const client = new Anthropic({ apiKey: anthropicKey, maxRetries: 0, timeout: 120_000 });
    const caller: VisionCaller = async (img) => {
      try {
        const res = await client.messages.create({
          model: VISION_MODEL,
          max_tokens: 2048,
          // Extraction, not reasoning: thinking off keeps each image to one short JSON reply.
          thinking: { type: 'disabled' },
          system: VISION_SYSTEM_PROMPT,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: img.mediaType as 'image/png', data: img.base64 } },
              { type: 'text', text: visionUserPrompt(img.postedAt) },
            ],
          }],
        } as any);
        if ((res.stop_reason as string) === 'refusal') throw new VisionHttpError(400, 'the model declined this image');
        const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
        return { text, provider: 'anthropic', model: VISION_MODEL, usage: { input: res.usage.input_tokens, output: res.usage.output_tokens } };
      } catch (e) {
        if (e instanceof VisionHttpError) throw e;
        if (e instanceof Anthropic.APIError && typeof e.status === 'number') {
          const h = (e.headers ?? {}) as Record<string, string | null | undefined>;
          const ra = Number(h['retry-after']);
          throw new VisionHttpError(e.status, e.message, Number.isFinite(ra) && ra > 0 ? ra * 1000 : null);
        }
        throw new VisionHttpError(0, (e as Error)?.message ?? String(e));
      }
    };
    return { caller, provider: 'anthropic', model: VISION_MODEL };
  }
  const geminiKey = (env.GEMINI_API_KEY || env.GOOGLE_API_KEY)?.trim();
  if (geminiKey) {
    const caller: VisionCaller = async (img) => {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      try {
        const r = await ai.models.generateContent({
          model: VISION_FALLBACK_MODEL,
          config: { systemInstruction: VISION_SYSTEM_PROMPT, temperature: 0, responseMimeType: 'application/json' },
          contents: [{ parts: [{ text: visionUserPrompt(img.postedAt) }, { inlineData: { mimeType: img.mediaType, data: img.base64 } }] }],
        });
        const u = (r as any).usageMetadata;
        return { text: r.text ?? '', provider: 'gemini', model: VISION_FALLBACK_MODEL, usage: u ? { input: u.promptTokenCount ?? 0, output: u.candidatesTokenCount ?? 0 } : null };
      } catch (e) {
        const status = Number((e as any)?.status ?? (e as any)?.code);
        // Gemini's overload/quota answers are 429 / 503 — map 503 onto the retried 529 class.
        throw new VisionHttpError(status === 503 ? 529 : Number.isFinite(status) ? status : 0, (e as Error)?.message ?? String(e));
      }
    };
    return { caller, provider: 'gemini', model: VISION_FALLBACK_MODEL };
  }
  return { caller: null, provider: null, model: null };
}

export interface VisionItem {
  /** Discord message id — results are grouped by it. */
  messageId: string;
  index: number;
  url: string;
  name: string;
  postedAt: string;
}

export interface VisionCache {
  byAttachment: Map<string, VisionImageRecord>;
  byHash: Map<string, VisionImageRecord>;
}

export function emptyVisionCache(): VisionCache { return { byAttachment: new Map(), byHash: new Map() }; }

/** Build the cache from stored post metadata (journal_notes.meta.vision). */
export function visionCacheFrom(metas: unknown[]): VisionCache {
  const c = emptyVisionCache();
  for (const m of metas) {
    const recs = (m as any)?.vision;
    if (!Array.isArray(recs)) continue;
    for (const r of recs as VisionImageRecord[]) {
      if (!reusableRecord(r)) continue;
      if (r.attachmentId) c.byAttachment.set(r.attachmentId, r);
      if (r.sha256) c.byHash.set(r.sha256, r);
    }
  }
  return c;
}

export interface VisionProgress {
  total: number;
  done: number;
  cached: number;
  called: number;
  failed: number;
  skippedBudget: number;
  lowConfidence: number;
  tradesFound: number;
  retries: number;
  usage: { input: number; output: number };
  /** Spend from the usage Anthropic reports, at list price (Gemini calls not priced here). */
  usd: number;
}

export interface VisionRunnerOptions {
  caller: VisionCaller | null;
  cache: VisionCache;
  maxImages: number;
  concurrency?: number;
  maxRetries?: number;
  fetchImage?: (url: string) => Promise<{ ok: boolean; status: number; bytes: Uint8Array | null }>;
  sleep?: (ms: number) => Promise<void>;
  onProgress?: (p: VisionProgress) => void;
  now?: () => string;
}

async function defaultFetchImage(url: string) {
  const res = await fetch(url, { headers: { 'User-Agent': 'QuantEdgeJournalImport (https://quantedgelabs.net, 1.0)' } });
  if (!res.ok) return { ok: false, status: res.status, bytes: null };
  const len = Number(res.headers.get('content-length'));
  if (Number.isFinite(len) && len > VISION_MAX_IMAGE_BYTES) return { ok: true, status: res.status, bytes: new Uint8Array(VISION_MAX_IMAGE_BYTES + 1) };
  return { ok: true, status: res.status, bytes: new Uint8Array(await res.arrayBuffer()) };
}

/**
 * One runner per import job: the budget, cache and progress span every thread
 * of the job. `run(items)` returns the readings grouped by message id, each
 * message's records in attachment order.
 */
export function createVisionRunner(opts: VisionRunnerOptions) {
  const concurrency = Math.max(1, opts.concurrency ?? 3);
  const maxRetries = opts.maxRetries ?? 5;
  const fetchImage = opts.fetchImage ?? defaultFetchImage;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? (() => new Date().toISOString());
  let reserved = 0;
  let anthropicUsd = 0;
  const p: VisionProgress = { total: 0, done: 0, cached: 0, called: 0, failed: 0, skippedBudget: 0, lowConfidence: 0, tradesFound: 0, retries: 0, usage: { input: 0, output: 0 }, usd: 0 };
  const emit = () => opts.onProgress?.({ ...p, usage: { ...p.usage } });

  const blank = (it: VisionItem, attachmentId: string | null, status: VisionImageRecord['status'], error: string | null, sha256: string | null = null): VisionImageRecord => ({
    attachmentId, sha256, name: it.name, status, provider: null, model: null, v: VISION_PROMPT_VERSION, at: now(), result: null, error, usage: null,
  });

  async function readOne(it: VisionItem): Promise<VisionImageRecord> {
    const attachmentId = attachmentIdOf(it.url);
    const hitA = attachmentId ? opts.cache.byAttachment.get(attachmentId) : undefined;
    if (hitA) { p.cached++; return { ...hitA, name: it.name }; }

    let got: { ok: boolean; status: number; bytes: Uint8Array | null };
    try { got = await fetchImage(it.url); } catch (e) { got = { ok: false, status: 0, bytes: null }; }
    if (!got.ok || !got.bytes) { p.failed++; return blank(it, attachmentId, 'fetch_failed', `image fetch failed (${got.status || 'network'}) — Discord links expire after ~24h; re-read the forum with the bot`); }
    if (got.bytes.length > VISION_MAX_IMAGE_BYTES) { p.failed++; return blank(it, attachmentId, 'too_large', `image over ${(VISION_MAX_IMAGE_BYTES / 1e6).toFixed(1)}MB`); }
    const mediaType = sniffImageType(got.bytes);
    if (!mediaType) { p.failed++; return blank(it, attachmentId, 'unsupported', 'not a PNG/JPEG/GIF/WebP image'); }
    const sha256 = createHash('sha256').update(got.bytes).digest('hex');
    const hitH = opts.cache.byHash.get(sha256);
    if (hitH) { p.cached++; return { ...hitH, attachmentId, name: it.name }; }

    if (!opts.caller) { p.failed++; return blank(it, attachmentId, 'error', 'no vision provider configured (ANTHROPIC_API_KEY or GEMINI_API_KEY)', sha256); }
    if (reserved >= opts.maxImages) { p.skippedBudget++; return blank(it, attachmentId, 'skipped_budget', `per-import cap of ${opts.maxImages} images reached (FORUM_VISION_MAX_IMAGES)`, sha256); }
    reserved++;

    const base64 = Buffer.from(got.bytes).toString('base64');
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await opts.caller({ base64, mediaType, postedAt: it.postedAt });
        p.called++;
        if (res.usage) {
          p.usage.input += res.usage.input;
          p.usage.output += res.usage.output;
          if (res.provider === 'anthropic') {
            anthropicUsd += (res.usage.input * VISION_PRICE.inputPerMTok + res.usage.output * VISION_PRICE.outputPerMTok) / 1_000_000;
            p.usd = Math.round(anthropicUsd * 100) / 100;
          }
        }
        const parsed = parseVisionText(res.text);
        const base = { attachmentId, sha256, name: it.name, provider: res.provider, model: res.model, v: VISION_PROMPT_VERSION, at: now(), usage: res.usage };
        if (!parsed.ok) { p.failed++; return { ...base, status: 'invalid', result: null, error: parsed.error }; }
        const low = parsed.result.confidence < VISION_MIN_CONFIDENCE;
        if (low) p.lowConfidence++; else p.tradesFound += parsed.result.trades.length;
        return { ...base, status: low ? 'low_confidence' : 'ok', result: parsed.result, error: null };
      } catch (e) {
        const err = e instanceof VisionHttpError ? e : new VisionHttpError(0, (e as Error)?.message ?? String(e));
        if (RETRY_STATUSES.has(err.status) && attempt < maxRetries) {
          p.retries++;
          const backoff = err.retryAfterMs ?? Math.min(30_000, 1000 * 2 ** attempt);
          await sleep(backoff);
          continue;
        }
        p.failed++;
        return blank(it, attachmentId, 'error', `${err.status ? `HTTP ${err.status}: ` : ''}${err.message}`.slice(0, 300), sha256);
      }
    }
  }

  async function run(items: VisionItem[]): Promise<Map<string, VisionImageRecord[]>> {
    const out = new Map<string, VisionImageRecord[]>();
    const slots: VisionImageRecord[] = new Array(items.length);
    let next = 0;
    const worker = async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        const rec = await readOne(items[i]);
        slots[i] = rec;
        // Later images in this job hit the cache (same attachment reposted, same bytes).
        if (reusableRecord(rec)) {
          if (rec.attachmentId) opts.cache.byAttachment.set(rec.attachmentId, rec);
          if (rec.sha256) opts.cache.byHash.set(rec.sha256, rec);
        }
        p.done++;
        emit();
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    items.forEach((it, i) => {
      const list = out.get(it.messageId) ?? [];
      list[it.index] = slots[i];
      out.set(it.messageId, list);
    });
    for (const [k, v] of out) out.set(k, v.filter(Boolean));
    return out;
  }

  return {
    run,
    /** Declare how many images the job will read (progress denominator). */
    setTotal(n: number) { p.total = n; emit(); },
    progress: () => ({ ...p, usage: { ...p.usage } }),
    estimate: (images: number, cached = 0) => estimateVisionCost(images, { cached, cap: opts.maxImages }),
  };
}
