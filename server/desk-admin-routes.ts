/**
 * Desk admin API (docs/DESK_ADMINS.md). Flag DESK_ADMINS=true; with it off every
 * /api/desk/:slug route answers 404 and /api/desk/me reports enabled:false.
 *
 * Desk routes — a signed-in session; the caller must be the super-admin
 * (ADMIN_EMAIL / admin tier) or the desk admin of :slug. Anyone else: 403.
 *   GET    /api/desk/me                       { enabled, role, deskSlug, desks? }
 *   GET    /api/desk/:slug                    overview: trader, bot status, book stats
 *   GET    /api/desk/:slug/bot                config, caps, enabled
 *   PATCH  /api/desk/:slug/bot                change config (within DESK_BOT_CAPS)
 *   POST   /api/desk/:slug/bot/enabled        { enabled }
 *   POST   /api/desk/:slug/bot/run            one cycle now — super-admin only
 *   PUT    /api/desk/:slug/passcode           { passcode } ('' clears) — the desk's own book
 *   PUT    /api/desk/:slug/privacy            { shareWithGroup } — book private (default) or visible to the group
 *
 * Hub routes — requireAdminJWT (the admin hub cookie), like every /api/admin/*:
 *   GET    /api/admin/ops/desks               every trader book, its desk admin, its bot
 *   POST   /api/admin/ops/desks/:slug/assign  { userId, replace? } make that user the desk admin
 *   DELETE /api/admin/ops/desks/:slug/assign  remove the desk admin
 *   POST   /api/admin/ops/desks/:slug/bot     { enabled } turn a desk bot on/off
 *
 * Every write is appended to the admin audit log (server/admin-audit.ts).
 * Data access goes through `deps`, so scripts/test-desk-admins.ts can run the
 * real routes with no database.
 */
import type { Express, Request, RequestHandler, Response } from 'express';
import { appendAdminAudit, auditActor } from './admin-audit';
import {
  DESK_BOT_CAPS, DESK_BOT_MAX_BLOCKED, DESK_SLUG_RE, canManageDesk, parseDeskBotPatch,
  type DeskAccess, type DeskBotConfig,
} from '@shared/desk-admin';

export interface DeskTraderRow { id: string; slug: string; name: string; handle?: string | null; source?: string | null; linkedUserId: string | null; passcodeHash?: string | null; createdAt?: Date | string | null }
export interface DeskUserRow { id: string; email: string; firstName?: string | null; subscriptionTier?: string | null; subscriptionStatus?: string | null; hasBetaAccess?: boolean | null }
export interface DeskBotStateLike { enabled: boolean; shareBook?: boolean; config: DeskBotConfig; exists: boolean; updatedAt: string | null }

export interface DeskRouteDeps {
  enabled: () => boolean;
  maxBots: () => number;
  access: (req: Request) => Promise<DeskAccess>;
  listTraders: () => Promise<DeskTraderRow[]>;
  getTrader: (slug: string) => Promise<DeskTraderRow | null>;
  getUser: (id: string) => Promise<DeskUserRow | null>;
  isProtectedAdmin: (u: DeskUserRow) => boolean;
  readBot: (slug: string) => Promise<DeskBotStateLike>;
  writeBotConfig: (slug: string, cfg: DeskBotConfig, actorId: string | null) => Promise<void>;
  setBotEnabled: (slug: string, enabled: boolean, actorId: string | null) => Promise<{ ok: true } | { ok: false; status: number; error: string }>;
  listBots: () => Promise<(DeskBotStateLike & { slug: string })[]>;
  botStatus: (t: DeskTraderRow) => Promise<unknown>;
  bookStats: (t: DeskTraderRow) => Promise<unknown>;
  setPasscodeHash: (slug: string, hash: string | null) => Promise<void>;
  setShareBook: (slug: string, share: boolean, actorId: string | null) => Promise<void>;
  hashPasscode: (code: string) => Promise<string>;
  setLinkedUser: (slug: string, userId: string | null) => Promise<void>;
  runCycle: (slug: string) => Promise<unknown>;
}

async function defaultDeps(): Promise<DeskRouteDeps> {
  const d = await import('./desk-admin');
  const js = () => import('./journal-sources');
  return {
    enabled: d.deskAdminsEnabled,
    maxBots: d.deskBotsMax,
    access: d.deskAccessFor,
    listTraders: async () => (await js()).listTraders(),
    getTrader: async (slug) => (await js()).getTraderBySlug(slug),
    getUser: async (id) => {
      const { storage } = await import('./storage');
      return ((await storage.getUser(id).catch(() => undefined)) as DeskUserRow | undefined) ?? null;
    },
    isProtectedAdmin: (u) => d.isSuperAdminUser(u),
    readBot: d.readDeskBot,
    writeBotConfig: d.writeDeskBotConfig,
    setBotEnabled: d.setDeskBotEnabled,
    listBots: d.listDeskBots,
    botStatus: (t) => d.deskBotStatus(t),
    bookStats: (t) => d.deskBookStats(t),
    setPasscodeHash: async (slug, hash) => {
      const { db } = await import('./db');
      const { traders } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');
      await db.update(traders).set({ passcodeHash: hash }).where(eq(traders.slug, slug));
    },
    setShareBook: d.setDeskShareBook,
    hashPasscode: async (code) => (await import('bcrypt')).default.hash(code, 12),
    setLinkedUser: async (slug, userId) => {
      const { db } = await import('./db');
      const { traders } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');
      await db.update(traders).set({ linkedUserId: userId }).where(eq(traders.slug, slug));
    },
    runCycle: async (slug) => {
      const { runHeavy } = await import('./lib/heavy-job-gate');
      const { getTraderBySlug } = await js();
      const { DEFAULT_BOT_CONFIG, runDeskBotCycle } = await import('./quant-bot');
      const { deskEngineConfig } = await import('@shared/desk-admin');
      const t = await getTraderBySlug(slug);
      if (!t) throw Object.assign(new Error('No such trader'), { status: 404 });
      const state = await d.readDeskBot(slug);
      const owner = await d.deskOwner(t, state.config);
      return runHeavy(`desk-bot:${slug}:manual`, () => runDeskBotCycle(slug, deskEngineConfig(state.config, DEFAULT_BOT_CONFIG), owner, 'manual'));
    },
  };
}

const ID_RE = /^[A-Za-z0-9_.:@-]{1,128}$/;

function fail(res: Response, err: unknown, context: string) {
  const name = (err as Error)?.constructor?.name;
  if (name === 'DeskBotsUnavailable') return res.status(503).json({ error: (err as Error).message, setUp: false });
  const status = (err as { status?: number })?.status;
  if (status && status >= 400 && status < 500) return res.status(status).json({ error: (err as Error).message });
  void import('./logger').then(({ logger }) => logger.error(`[DESK] ${context} failed`, { error: (err as Error)?.message })).catch(() => {});
  return res.status(500).json({ error: `${context} failed` });
}

export function registerDeskAdminRoutes(app: Express, requireAdmin: RequestHandler, injected?: Partial<DeskRouteDeps>) {
  let depsP: Promise<DeskRouteDeps> | null = null;
  const deps = async (): Promise<DeskRouteDeps> => {
    if (!depsP) depsP = defaultDeps().then((d) => ({ ...d, ...injected }));
    return depsP;
  };

  /**
   * The desk gate: flag on, signed in, and allowed on :slug. It runs BEFORE any
   * data is read, so a refused caller learns nothing about the desk (not even
   * whether it exists — an unknown slug and someone else's slug both 403).
   */
  const deskGate = (opts: { superOnly?: boolean } = {}): RequestHandler => async (req, res, next) => {
    try {
      const d = await deps();
      if (!d.enabled()) return res.status(404).json({ error: 'Desk admins are not enabled' });
      const access = await d.access(req);
      if (!access.userId) return res.status(401).json({ error: 'Sign in first' });
      const slug = String(req.params.slug ?? '').toLowerCase();
      if (!DESK_SLUG_RE.test(slug) || !canManageDesk(access, slug)) return res.status(403).json({ error: 'Not your desk' });
      if (opts.superOnly && access.role !== 'super') return res.status(403).json({ error: 'Only the platform admin can do this' });
      (req as any).desk = { access, slug };
      next();
    } catch (err) { fail(res, err, 'Desk access'); }
  };
  const ctx = (req: Request) => (req as any).desk as { access: DeskAccess; slug: string };
  const audit = (req: Request, action: string, target: string, detail: Record<string, unknown> = {}) =>
    appendAdminAudit({ action, actor: auditActor(req as never), target, detail: { role: ctx(req)?.access.role ?? 'super', ...detail }, ip: req.ip ?? null });

  // ── Who am I (the client's useDeskRole) ─────────────────
  app.get('/api/desk/me', async (req, res) => {
    try {
      const d = await deps();
      const access = await d.access(req);
      res.set('Cache-Control', 'no-store');
      const enabled = d.enabled();
      const body: Record<string, unknown> = {
        enabled,
        role: access.role,
        isSuperAdmin: access.role === 'super',
        deskSlug: enabled ? access.deskSlug : null,
      };
      if (enabled && access.role === 'super') body.desks = (await d.listTraders()).map((t) => ({ slug: t.slug, name: t.name }));
      if (enabled && access.role === 'desk' && access.deskSlug) {
        const t = await d.getTrader(access.deskSlug);
        body.deskName = t?.name ?? access.deskSlug;
      }
      res.json(body);
    } catch (err) { fail(res, err, 'Desk role'); }
  });

  // ── Overview ────────────────────────────────────────────
  app.get('/api/desk/:slug', deskGate(), async (req, res) => {
    try {
      const d = await deps();
      const t = await d.getTrader(ctx(req).slug);
      if (!t) return res.status(404).json({ error: 'No such trader book' });
      const [bot, book, user] = await Promise.all([
        d.botStatus(t).catch((e) => ({ error: (e as Error).message })),
        d.bookStats(t).catch((e) => ({ error: (e as Error).message })),
        t.linkedUserId ? d.getUser(t.linkedUserId) : Promise.resolve(null),
      ]);
      res.set('Cache-Control', 'no-store');
      res.json({
        trader: { slug: t.slug, name: t.name, handle: t.handle ?? null, source: t.source ?? null, locked: !!t.passcodeHash },
        shareWithGroup: await d.readBot(t.slug).then((b) => !!b.shareBook).catch(() => false),
        deskAdmin: user ? { email: user.email, name: user.firstName ?? null, hasBetaAccess: !!user.hasBetaAccess } : null,
        viewer: { role: ctx(req).access.role },
        bot, book,
        at: new Date().toISOString(),
      });
    } catch (err) { fail(res, err, 'Desk overview'); }
  });

  // ── Bot settings ────────────────────────────────────────
  app.get('/api/desk/:slug/bot', deskGate(), async (req, res) => {
    try {
      const d = await deps();
      const s = await d.readBot(ctx(req).slug);
      res.set('Cache-Control', 'no-store');
      res.json({ enabled: s.enabled, shareWithGroup: !!s.shareBook, config: s.config, updatedAt: s.updatedAt, caps: DESK_BOT_CAPS, maxBlocked: DESK_BOT_MAX_BLOCKED, maxBots: d.maxBots() });
    } catch (err) { fail(res, err, 'Desk bot'); }
  });

  app.patch('/api/desk/:slug/bot', deskGate(), async (req, res) => {
    try {
      const d = await deps();
      const { slug, access } = ctx(req);
      const current = await d.readBot(slug);
      const parsed = parseDeskBotPatch(req.body, current.config);
      if (!parsed.ok) return res.status(400).json({ error: parsed.errors[0], errors: parsed.errors });
      if (!parsed.changed.length) return res.json({ ok: true, unchanged: true, config: current.config });
      await d.writeBotConfig(slug, parsed.value, access.userId);
      audit(req, 'desk.bot_config', slug, { changed: Object.fromEntries(parsed.changed.map((k) => [k, (parsed.value as unknown as Record<string, unknown>)[k]])) });
      res.json({ ok: true, config: parsed.value });
    } catch (err) { fail(res, err, 'Desk bot update'); }
  });

  app.post('/api/desk/:slug/bot/enabled', deskGate(), async (req, res) => {
    try {
      const d = await deps();
      const { slug, access } = ctx(req);
      if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be true or false' });
      const r = await d.setBotEnabled(slug, req.body.enabled, access.userId);
      if (!r.ok) return res.status(r.status).json({ error: r.error });
      audit(req, req.body.enabled ? 'desk.bot_enable' : 'desk.bot_disable', slug);
      res.json({ ok: true, enabled: req.body.enabled });
    } catch (err) { fail(res, err, 'Desk bot toggle'); }
  });

  app.post('/api/desk/:slug/bot/run', deskGate({ superOnly: true }), async (req, res) => {
    try {
      const d = await deps();
      const r = await d.runCycle(ctx(req).slug);
      audit(req, 'desk.bot_run', ctx(req).slug);
      res.json({ ok: true, result: r ?? null });
    } catch (err) { fail(res, err, 'Desk bot run'); }
  });

  // ── The desk's own book ─────────────────────────────────
  app.put('/api/desk/:slug/passcode', deskGate(), async (req, res) => {
    try {
      const d = await deps();
      const { slug } = ctx(req);
      const code = req.body?.passcode;
      if (typeof code !== 'string') return res.status(400).json({ error: "passcode must be a string ('' clears it)" });
      if (code && (code.length < 6 || code.length > 128)) return res.status(400).json({ error: 'Passcode must be 6–128 characters' });
      const t = await d.getTrader(slug);
      if (!t) return res.status(404).json({ error: 'No such trader book' });
      const hash = code ? await d.hashPasscode(code) : null;
      await d.setPasscodeHash(slug, hash);
      audit(req, hash ? 'desk.passcode_set' : 'desk.passcode_clear', slug);
      res.json({ ok: true, locked: !!hash });
    } catch (err) { fail(res, err, 'Set passcode'); }
  });

  app.put('/api/desk/:slug/privacy', deskGate(), async (req, res) => {
    try {
      const d = await deps();
      const { slug, access } = ctx(req);
      if (typeof req.body?.shareWithGroup !== 'boolean') return res.status(400).json({ error: 'shareWithGroup must be true or false' });
      await d.setShareBook(slug, req.body.shareWithGroup, access.userId);
      audit(req, 'desk.privacy', slug, { shareWithGroup: req.body.shareWithGroup });
      res.json({ ok: true, shareWithGroup: req.body.shareWithGroup });
    } catch (err) { fail(res, err, 'Desk privacy'); }
  });

  // ── Admin hub: desk admins (requireAdminJWT) ───────────
  const hubAudit = (req: Request, action: string, target: string, detail: Record<string, unknown> = {}) =>
    appendAdminAudit({ action, actor: auditActor(req as never), target, detail: { role: 'super', ...detail }, ip: req.ip ?? null });

  app.get('/api/admin/ops/desks', requireAdmin, async (_req, res) => {
    try {
      const d = await deps();
      const traders = await d.listTraders();
      let bots: (DeskBotStateLike & { slug: string })[] = [];
      let setUp = true;
      try { bots = await d.listBots(); } catch (e) { if ((e as Error)?.constructor?.name === 'DeskBotsUnavailable') setUp = false; else throw e; }
      const byslug = new Map(bots.map((b) => [b.slug, b]));
      const rows = await Promise.all(traders.map(async (t) => {
        const u = t.linkedUserId ? await d.getUser(t.linkedUserId) : null;
        const b = byslug.get(t.slug);
        return {
          slug: t.slug, name: t.name,
          deskAdmin: u ? { id: u.id, email: u.email, hasBetaAccess: !!u.hasBetaAccess, isSuperAdmin: d.isProtectedAdmin(u) } : (t.linkedUserId ? { id: t.linkedUserId, email: null, hasBetaAccess: false, isSuperAdmin: false } : null),
          bot: b ? { enabled: b.enabled, updatedAt: b.updatedAt } : { enabled: false, updatedAt: null },
        };
      }));
      res.set('Cache-Control', 'no-store');
      res.json({ enabled: d.enabled(), setUp, maxBots: d.maxBots(), enabledBots: bots.filter((b) => b.enabled).length, desks: rows });
    } catch (err) { fail(res, err, 'Desk list'); }
  });

  app.post('/api/admin/ops/desks/:slug/assign', requireAdmin, async (req, res) => {
    try {
      const d = await deps();
      const slug = String(req.params.slug ?? '').toLowerCase();
      const userId = req.body?.userId;
      if (!DESK_SLUG_RE.test(slug)) return res.status(400).json({ error: 'Bad trader slug' });
      if (typeof userId !== 'string' || !ID_RE.test(userId)) return res.status(400).json({ error: 'userId is required' });
      const [t, u, all] = await Promise.all([d.getTrader(slug), d.getUser(userId), d.listTraders()]);
      if (!t) return res.status(404).json({ error: 'No such trader book' });
      if (!u) return res.status(404).json({ error: 'No such user' });
      if (d.isProtectedAdmin(u)) return res.status(400).json({ error: 'The platform admin already manages every desk' });
      if (u.subscriptionStatus === 'disabled') return res.status(400).json({ error: 'That account is disabled — enable it first' });
      const other = all.find((x) => x.linkedUserId === userId && x.slug !== slug);
      if (other) return res.status(409).json({ error: `${u.email} already runs the ${other.name} desk — remove them there first` });
      if (t.linkedUserId && t.linkedUserId !== userId && req.body?.replace !== true) {
        return res.status(409).json({ error: `${t.name}'s desk already has a desk admin — remove them first, or confirm the replacement`, needsReplace: true });
      }
      if (t.linkedUserId === userId) return res.json({ ok: true, unchanged: true });
      await d.setLinkedUser(slug, userId);
      hubAudit(req, 'desk.assign', slug, { userId, email: u.email, replaced: t.linkedUserId ?? null });
      res.json({ ok: true, warning: u.hasBetaAccess ? null : 'This account has no beta access: the journal and watchlist need it. Turn beta access on in Users.' });
    } catch (err) { fail(res, err, 'Desk assign'); }
  });

  app.delete('/api/admin/ops/desks/:slug/assign', requireAdmin, async (req, res) => {
    try {
      const d = await deps();
      const slug = String(req.params.slug ?? '').toLowerCase();
      if (!DESK_SLUG_RE.test(slug)) return res.status(400).json({ error: 'Bad trader slug' });
      const t = await d.getTrader(slug);
      if (!t) return res.status(404).json({ error: 'No such trader book' });
      if (!t.linkedUserId) return res.json({ ok: true, unchanged: true });
      await d.setLinkedUser(slug, null);
      hubAudit(req, 'desk.unassign', slug, { userId: t.linkedUserId });
      res.json({ ok: true });
    } catch (err) { fail(res, err, 'Desk unassign'); }
  });

  app.post('/api/admin/ops/desks/:slug/bot', requireAdmin, async (req, res) => {
    try {
      const d = await deps();
      const slug = String(req.params.slug ?? '').toLowerCase();
      if (!DESK_SLUG_RE.test(slug)) return res.status(400).json({ error: 'Bad trader slug' });
      if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be true or false' });
      if (!(await d.getTrader(slug))) return res.status(404).json({ error: 'No such trader book' });
      const r = await d.setBotEnabled(slug, req.body.enabled, null);
      if (!r.ok) return res.status(r.status).json({ error: r.error });
      hubAudit(req, req.body.enabled ? 'desk.bot_enable' : 'desk.bot_disable', slug);
      res.json({ ok: true, enabled: req.body.enabled });
    } catch (err) { fail(res, err, 'Desk bot toggle'); }
  });
}
