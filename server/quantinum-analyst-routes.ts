/**
 * Quantinum Analyst routes — slash-command tools, shared conversation history,
 * timeframe preference. Same access policy as Ask Quantinum (flag QUANTINUM_AI,
 * admin by default → super-admins + desk admins); registered from
 * registerQuantinumAiRoutes so nothing in routes.ts changes.
 *
 *   POST   /api/quantinum/ai/command   { text | command+arg, horizon, page } → { card }   (no model, no quota)
 *   GET    /api/quantinum/ai/history   { messages, horizon, updatedAt }
 *   PUT    /api/quantinum/ai/history   { messages }  (whole thread, sanitized, capped)
 *   DELETE /api/quantinum/ai/history
 *   PUT    /api/quantinum/ai/prefs     { horizon }
 *
 * History is a per-member JSON file under QUANTINUM_AI_DIR/conversations
 * (file name = sha256 of the user id; no DB migration). The client keeps a
 * localStorage copy and falls back to it when this is unreachable.
 */
import type { Express, Request, RequestHandler } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { canUseAskQuantinum, readQuantinumAiMode, type AskCaller } from '@shared/quantinum-ai';
import { ANALYST_COMMANDS, parsePageContext, parseSlash, sanitizeConversation, type AnalystCommand, type ConvMessage } from '@shared/quantinum-analyst';
import { DEFAULT_HORIZON, parseHorizon, type Horizon } from '@shared/quantinum-horizon';
import { runAnalystCommand, type AnalystDeps } from './quantinum-analyst-tools';

export interface ConversationStore {
  read: (userId: string) => { messages: ConvMessage[]; horizon: Horizon; updatedAt: string | null };
  write: (userId: string, patch: { messages?: ConvMessage[]; horizon?: Horizon }) => { messages: ConvMessage[]; horizon: Horizon; updatedAt: string };
  clear: (userId: string) => void;
}

export function fileConversationStore(dir: string): ConversationStore {
  const file = (u: string) => path.join(dir, `${crypto.createHash('sha256').update(u).digest('hex').slice(0, 32)}.json`);
  const read = (u: string) => {
    try {
      const raw = JSON.parse(fs.readFileSync(file(u), 'utf8'));
      return { messages: sanitizeConversation(raw.messages), horizon: parseHorizon(raw.horizon), updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null };
    } catch { return { messages: [], horizon: DEFAULT_HORIZON, updatedAt: null }; }
  };
  return {
    read,
    write: (u, patch) => {
      const cur = read(u);
      const next = { messages: patch.messages ? sanitizeConversation(patch.messages) : cur.messages, horizon: patch.horizon ?? cur.horizon, updatedAt: new Date().toISOString() };
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${file(u)}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(next));
      fs.renameSync(tmp, file(u));
      return next;
    },
    clear: (u) => { try { fs.unlinkSync(file(u)); } catch { /* none */ } },
  };
}

export interface AnalystRouteDeps {
  mode: () => string | undefined;
  caller: (req: Request) => Promise<AskCaller>;
  tools: () => AnalystDeps;
  store: () => ConversationStore;
}

export function registerQuantinumAnalystRoutes(app: Express, requireMember: RequestHandler, deps: AnalystRouteDeps): void {
  const gate = async (req: Request) => {
    const caller = await deps.caller(req).catch((): AskCaller => ({ userId: null, tier: null, role: 'none' }));
    return canUseAskQuantinum(readQuantinumAiMode(deps.mode()), caller) ? caller : null;
  };
  const denied = { error: 'Ask Quantinum is not enabled for your account.', code: 'disabled' };

  app.post('/api/quantinum/ai/command', requireMember, async (req, res) => {
    const caller = await gate(req);
    if (!caller) return res.status(403).json(denied);
    const page = parsePageContext(req.body?.page);
    const horizon = parseHorizon(req.body?.horizon);
    let parsed: ReturnType<typeof parseSlash>;
    if (typeof req.body?.text === 'string') parsed = parseSlash(req.body.text);
    else if ((ANALYST_COMMANDS as readonly string[]).includes(String(req.body?.command))) {
      const arg = typeof req.body?.arg === 'string' ? req.body.arg : '';
      parsed = parseSlash(`/${req.body.command}${arg ? ` ${arg}` : ''}`);
    } else parsed = null;
    if (!parsed) return res.status(400).json({ error: 'Not a command.', code: 'bad_request' });
    if (!parsed.ok) return res.status(400).json({ error: parsed.error, code: 'bad_command' });
    try {
      const out = await runAnalystCommand(parsed.cmd, { horizon, page, caller: { userId: caller.userId, isSuper: caller.role === 'super' } }, deps.tools());
      if (!out.ok) return res.status(400).json({ error: out.error, code: 'bad_command' });
      res.json({ card: out.card });
    } catch {
      res.status(500).json({ error: `/${parsed.cmd.command as AnalystCommand} hit an error reading the data.`, code: 'tool_error' });
    }
  });

  app.get('/api/quantinum/ai/history', requireMember, async (req, res) => {
    const caller = await gate(req);
    if (!caller) return res.status(403).json(denied);
    res.json(deps.store().read(caller.userId!));
  });

  app.put('/api/quantinum/ai/history', requireMember, async (req, res) => {
    const caller = await gate(req);
    if (!caller) return res.status(403).json(denied);
    if (!Array.isArray(req.body?.messages)) return res.status(400).json({ error: 'messages[] required', code: 'bad_request' });
    const saved = deps.store().write(caller.userId!, { messages: req.body.messages });
    res.json({ ok: true, count: saved.messages.length, updatedAt: saved.updatedAt });
  });

  app.delete('/api/quantinum/ai/history', requireMember, async (req, res) => {
    const caller = await gate(req);
    if (!caller) return res.status(403).json(denied);
    const cur = deps.store().read(caller.userId!);
    deps.store().clear(caller.userId!);
    deps.store().write(caller.userId!, { messages: [], horizon: cur.horizon });
    res.json({ ok: true });
  });

  app.put('/api/quantinum/ai/prefs', requireMember, async (req, res) => {
    const caller = await gate(req);
    if (!caller) return res.status(403).json(denied);
    const saved = deps.store().write(caller.userId!, { horizon: parseHorizon(req.body?.horizon) });
    res.json({ ok: true, horizon: saved.horizon });
  });
}
