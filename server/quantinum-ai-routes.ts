/**
 * Ask Quantinum API (docs/ASK_QUANTINUM.md).
 *
 *   GET  /api/quantinum/ai/status           { enabled, mode, quota, used, remaining, disclaimer }
 *   POST /api/quantinum/ai/ask              SSE: meta → delta* (reset?) (lookup?) → done | error
 *        body { question, target, mode: 'quick'|'deep', history? }
 *   GET  /api/admin/quantinum-ai            config, defaults, provider key presence, cap, spend, usage summary  (admin JWT)
 *   PUT  /api/admin/quantinum-ai/config     { quick:[{provider,model}], deep:[…] }                              (admin JWT)
 *   DELETE /api/admin/quantinum-ai/config   back to the defaults in code                                        (admin JWT)
 *
 * Flag QUANTINUM_AI = admin (default) | all | off. Quota per ET day by tier;
 * global spend cap QUANTINUM_AI_DAILY_USD (default 5). Every question writes one
 * usage line (counts / tokens / cost / provider — never content).
 */
import type { Express, Request, RequestHandler, Response } from 'express';
import {
  ASK_QUANTINUM_DISCLAIMER, MAX_OUTPUT_TOKENS, QUANTINUM_PROVIDERS, DEFAULT_QUANTINUM_AI_CONFIG,
  canUseAskQuantinum, costUsd, dailyQuotaFor, estimateTokens, extractCitations, parseAskTarget, parseQuantinumAiConfig,
  readDailyUsdCap, readQuantinumAiMode, MODEL_PRICING_USD_PER_MTOK, UNKNOWN_MODEL_PRICING,
  type AskCaller, type AskMode, type ContextPack, type QuantinumAiConfig, type QuantinumProviderId,
} from '@shared/quantinum-ai';
import { buildPrompt, sanitizeHistory, parseLookup, mightBeLookup, violatesNoAdvice, NO_ADVICE_NOTE, MAX_LOOKUPS } from './quantinum-ai-prompt';
import { applyLookup, buildContextPack, defaultContextDeps, type ContextDeps } from './quantinum-ai-context';
import { ChainExhausted, defaultAdapters, runChain, type LlmAdapter } from './quantinum-ai-providers';
import {
  UsageLedger, quantinumAiDir, readQuantinumAiConfig, readUsage, resetQuantinumAiConfig, summarizeUsage, writeQuantinumAiConfig,
} from './quantinum-ai-ledger';
import path from 'node:path';

export interface QuantinumAiDeps {
  env: () => { mode: string | undefined; capUsd: string | undefined };
  caller: (req: Request) => Promise<AskCaller>;
  ledger: UsageLedger;
  usageFile: string;
  adapters: Partial<Record<QuantinumProviderId, LlmAdapter>>;
  context: ContextDeps;
  readConfig: () => QuantinumAiConfig;
  writeConfig: (cfg: Pick<QuantinumAiConfig, 'quick' | 'deep'>, actor: string) => QuantinumAiConfig;
  resetConfig: () => void;
  audit: (req: Request, action: string, detail: Record<string, unknown>) => void;
}

async function defaultCaller(req: Request): Promise<AskCaller> {
  const d = await import('./desk-admin');
  const userId = d.sessionUserId(req);
  if (!userId) return { userId: null, tier: null, role: 'none' };
  const { storage } = await import('./storage');
  const user: any = await storage.getUser(userId).catch(() => undefined);
  if (!user) return { userId: null, tier: null, role: 'none' };
  let role: AskCaller['role'] = d.isSuperAdminUser(user) ? 'super' : 'none';
  if (role === 'none' && d.deskAdminsEnabled()) {
    const access = await d.deskAccessFor(req).catch(() => null);
    if (access?.role === 'desk') role = 'desk';
  }
  return { userId, tier: user.subscriptionTier ?? 'free', role };
}

export function defaultQuantinumAiDeps(): QuantinumAiDeps {
  const usageFile = path.join(quantinumAiDir(), 'usage.jsonl');
  return {
    env: () => ({ mode: process.env.QUANTINUM_AI, capUsd: process.env.QUANTINUM_AI_DAILY_USD }),
    caller: defaultCaller,
    ledger: new UsageLedger(usageFile),
    usageFile,
    adapters: defaultAdapters(),
    context: defaultContextDeps(),
    readConfig: () => readQuantinumAiConfig(),
    writeConfig: (cfg, actor) => writeQuantinumAiConfig(cfg, actor),
    resetConfig: () => resetQuantinumAiConfig(),
    audit: (req, action, detail) => {
      import('./admin-audit').then(({ appendAdminAudit, auditActor }) =>
        appendAdminAudit({ action, actor: auditActor(req as any), target: 'quantinum-ai', detail, ip: req.ip ?? null }),
      ).catch(() => {});
    },
  };
}

/** Worst-case dollars for one question on this chain: the priciest step, full output, ×(1 + lookups). */
export function worstCaseUsd(chain: { model: string }[], promptText: string, mode: AskMode): number {
  const inTok = estimateTokens(promptText);
  const outTok = MAX_OUTPUT_TOKENS[mode];
  const per = Math.max(0, ...chain.map((s) => costUsd(s.model, inTok, outTok)));
  return per * (1 + MAX_LOOKUPS);
}

function sse(res: Response) {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  (res as any).flushHeaders?.();
  return (event: string, data: unknown) => {
    if (res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    (res as any).flush?.();
  };
}

const LIMIT_COPY = {
  quota: (q: number) => `You've used today's ${q} Quantinum questions. The count resets at midnight ET.`,
  cost_cap: () => 'Quantinum has reached today\'s platform spend limit. It resets at midnight ET.',
  disabled: () => 'Ask Quantinum is not enabled for your account.',
};

export function registerQuantinumAiRoutes(
  app: Express,
  requireMember: RequestHandler,
  requireAdminJWT: RequestHandler,
  depsArg?: QuantinumAiDeps,
): void {
  let deps = depsArg ?? null;
  const D = () => (deps ??= defaultQuantinumAiDeps());

  app.get('/api/quantinum/ai/status', requireMember, async (req, res) => {
    try {
      const d = D();
      const mode = readQuantinumAiMode(d.env().mode);
      const caller = await d.caller(req);
      const enabled = canUseAskQuantinum(mode, caller);
      if (!enabled) return res.json({ enabled: false, mode, disclaimer: ASK_QUANTINUM_DISCLAIMER });
      const quota = dailyQuotaFor(caller);
      const used = d.ledger.usedBy(caller.userId!);
      res.json({ enabled: true, mode, quota, used, remaining: Math.max(0, quota - used), disclaimer: ASK_QUANTINUM_DISCLAIMER });
    } catch {
      res.json({ enabled: false, mode: 'off', disclaimer: ASK_QUANTINUM_DISCLAIMER });
    }
  });

  app.post('/api/quantinum/ai/ask', requireMember, async (req, res) => {
    const d = D();
    const started = Date.now();
    const mode = readQuantinumAiMode(d.env().mode);
    const caller = await d.caller(req).catch((): AskCaller => ({ userId: null, tier: null, role: 'none' }));
    if (!canUseAskQuantinum(mode, caller)) return res.status(403).json({ error: LIMIT_COPY.disabled(), code: 'disabled' });

    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    if (!question || question.length > 2000) return res.status(400).json({ error: 'Ask a question (up to 2,000 characters).', code: 'bad_request' });
    const askMode: AskMode = req.body?.mode === 'deep' ? 'deep' : 'quick';
    const target = parseAskTarget(req.body?.target);
    const history = sanitizeHistory(req.body?.history);
    const userKey = caller.userId!;
    const tier = caller.role === 'super' ? 'admin' : caller.role === 'desk' ? `desk:${caller.tier ?? 'free'}` : String(caller.tier ?? 'free');
    const quota = dailyQuotaFor(caller);
    const capUsd = readDailyUsdCap(d.env().capUsd);
    const chain = d.readConfig()[askMode];

    const pre = d.ledger.check(userKey, quota, capUsd, 0);
    if (!pre.ok && pre.code === 'quota') {
      d.ledger.record({ userKey, tier, mode: askMode, targetKind: target.kind, provider: null, model: null, inputTokens: 0, outputTokens: 0, costUsd: 0, ok: false, error: 'quota', fallbacks: 0, latencyMs: 0 });
      return res.status(429).json({ error: LIMIT_COPY.quota(quota), code: 'quota', quota, used: pre.used, remaining: 0 });
    }

    let pack: ContextPack = await buildContextPack(target, { userId: caller.userId, isSuper: caller.role === 'super' }, d.context);
    let prompt = buildPrompt(pack, question, history, askMode);
    const worst = worstCaseUsd(chain, prompt.system + prompt.user, askMode);
    const gate = d.ledger.acquire(userKey, quota, capUsd, worst);
    if (!gate.ok) {
      d.ledger.record({ userKey, tier, mode: askMode, targetKind: target.kind, provider: null, model: null, inputTokens: 0, outputTokens: 0, costUsd: 0, ok: false, error: gate.code, fallbacks: 0, latencyMs: 0 });
      return res.status(429).json({ error: gate.code === 'quota' ? LIMIT_COPY.quota(quota) : LIMIT_COPY.cost_cap(), code: gate.code, quota, used: gate.used, remaining: gate.remaining });
    }

    const send = sse(res);
    const abort = new AbortController();
    res.on('close', () => { if (!res.writableEnded) abort.abort(); });
    const metaOf = (p: ContextPack) => ({ fields: p.fields.map((f) => ({ key: f.key, label: f.label, source: f.source, asOf: f.asOf ?? null })), missing: p.missing });
    send('meta', { ...metaOf(pack), mode: askMode, disclaimer: ASK_QUANTINUM_DISCLAIMER });

    let inTok = 0, outTok = 0, spend = 0, fallbacks = 0, lookups = 0;
    let provider: string | null = null, model: string | null = null;
    let answer = '';
    let errorCode: string | null = null;
    try {
      for (;;) {
        let buffer = '';
        let holding = true;
        const out = await runChain(chain, d.adapters, { system: prompt.system, user: prompt.user, maxTokens: MAX_OUTPUT_TOKENS[askMode], signal: abort.signal }, {
          onDelta: (t) => {
            if (!holding) { send('delta', { text: t }); return; }
            buffer += t;
            if (!mightBeLookup(buffer)) { holding = false; send('delta', { text: buffer }); buffer = ''; }
          },
          onReset: () => { buffer = ''; holding = true; send('reset', {}); },
        });
        inTok += out.result.inputTokens || estimateTokens(prompt.system + prompt.user);
        outTok += out.result.outputTokens || estimateTokens(out.result.text);
        spend += costUsd(out.step.model, out.result.inputTokens || estimateTokens(prompt.system + prompt.user), out.result.outputTokens || estimateTokens(out.result.text));
        fallbacks += out.fallbacks;
        provider = out.step.provider; model = out.step.model;
        const text = out.result.text;
        if (/^\s*LOOKUP\b/.test(text)) {
          const lk = parseLookup(text);
          if (lk && lookups < MAX_LOOKUPS) {
            lookups++;
            send('lookup', { tool: lk.tool, symbol: lk.symbol });
            pack = await applyLookup(pack, lk, d.context);
            prompt = buildPrompt(pack, question, history, askMode);
            send('meta', { ...metaOf(pack), mode: askMode, disclaimer: ASK_QUANTINUM_DISCLAIMER });
            continue;
          }
          // Not on the whitelist (or out of lookups): never run it, never improvise.
          answer = 'That lookup is not one Quantinum can run, so the answer is **not in the data** on this page. Try asking about a ticker, setup, level or flow print you have open.';
          send('reset', {});
          send('delta', { text: answer });
          break;
        }
        answer = text;
        if (holding && buffer) send('delta', { text: buffer });
        break;
      }
      if (violatesNoAdvice(answer)) { answer += NO_ADVICE_NOTE; send('delta', { text: NO_ADVICE_NOTE }); }
      const citations = extractCitations(answer, pack).map((f) => ({ key: f.key, label: f.label, source: f.source, asOf: f.asOf ?? null }));
      const remaining = Math.max(0, quota - (d.ledger.usedBy(userKey) + 1));
      send('done', { citations, provider, model, fallbacks, lookups, usage: { inputTokens: inTok, outputTokens: outTok, costUsd: +spend.toFixed(6) }, remaining, quota, disclaimer: ASK_QUANTINUM_DISCLAIMER });
    } catch (e) {
      errorCode = abort.signal.aborted ? 'aborted' : 'provider_error';
      if (e instanceof ChainExhausted) {
        fallbacks += e.attempts.filter((a) => a.error && !a.skipped).length;
        const rate = e.attempts.some((a) => a.kind === 'rate_limit');
        send('error', { code: rate ? 'rate_limited' : 'provider_error', error: rate ? 'Quantinum\'s model providers are rate-limited right now. Try again in a minute.' : 'Quantinum could not reach a model provider. Try again shortly.' });
      } else {
        send('error', { code: errorCode, error: 'Quantinum hit an error answering that.' });
      }
    } finally {
      d.ledger.release(userKey, worst);
      d.ledger.record({
        userKey, tier, mode: askMode, targetKind: target.kind, provider, model,
        inputTokens: inTok, outputTokens: outTok, costUsd: +spend.toFixed(6), ok: errorCode == null, error: errorCode,
        fallbacks, latencyMs: Date.now() - started,
      });
      if (!res.writableEnded) res.end();
    }
  });

  // ─── admin ────────────────────────────────────────────────

  app.get('/api/admin/quantinum-ai', requireAdminJWT, (_req, res) => {
    const d = D();
    const env = d.env();
    const providers = Object.fromEntries(QUANTINUM_PROVIDERS.map((p) => [p, !!d.adapters[p]?.available()]));
    res.json({
      mode: readQuantinumAiMode(env.mode),
      capUsd: readDailyUsdCap(env.capUsd),
      today: d.ledger.today(),
      spentTodayUsd: +d.ledger.spentToday().toFixed(4),
      config: d.readConfig(),
      defaults: DEFAULT_QUANTINUM_AI_CONFIG,
      providersWithKey: providers,
      pricing: { ...MODEL_PRICING_USD_PER_MTOK, unknown: UNKNOWN_MODEL_PRICING },
      usage: summarizeUsage(readUsage(d.usageFile), d.ledger.today(), 7),
      note: 'Usage log holds counts, tokens, cost and provider per question — never the question or answer.',
    });
  });

  app.put('/api/admin/quantinum-ai/config', requireAdminJWT, (req, res) => {
    const d = D();
    const parsed = parseQuantinumAiConfig(req.body);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const actor = (req as any).session?.userId ? `user:${(req as any).session.userId}` : 'admin-hub';
    const saved = d.writeConfig(parsed.config, actor);
    d.audit(req, 'quantinum_ai.config', { quick: saved.quick.map((s) => `${s.provider}:${s.model}`).join(','), deep: saved.deep.map((s) => `${s.provider}:${s.model}`).join(',') });
    res.json({ ok: true, config: saved });
  });

  app.delete('/api/admin/quantinum-ai/config', requireAdminJWT, (req, res) => {
    const d = D();
    d.resetConfig();
    d.audit(req, 'quantinum_ai.config_reset', {});
    res.json({ ok: true, config: d.readConfig() });
  });
}
