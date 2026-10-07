/**
 * Trader accounts: the operator creates his traders' logins
 * (docs/DESK_ADMINS.md §Trader accounts). Secrets: server/trader-accounts.ts.
 *
 * Admin hub — requireAdminJWT (the admin hub cookie), like every /api/admin/*:
 *   GET    /api/admin/ops/trader-accounts                 books + trader accounts with status, link expiry
 *   POST   /api/admin/ops/trader-accounts                 { displayName, email?, username?, traderSlug, tier?, deskAdmin?, method? }
 *   POST   /api/admin/ops/trader-accounts/:id/regenerate  { method? } new setup link (or temp password); old ones die
 *   POST   /api/admin/ops/trader-accounts/:id/revoke      kill outstanding link / temp password
 *
 * Public (setupLinkLimiters, per IP):
 *   POST   /api/auth/setup/inspect   { token }            who the link is for (does not consume it)
 *   POST   /api/auth/setup/complete  { token, password }  set own password → signed in (single use)
 *   POST   /api/auth/first-login     { login, password, newPassword }  temp password → own password → signed in
 *
 * The plaintext link token / temp password exists only in the ONE response to
 * the admin who created it. The database holds sha256 (token) / bcrypt
 * (password); logs and the audit file hold at most the last 4 characters.
 * Data access goes through `deps`, so scripts/test-trader-accounts.ts runs the
 * real routes with no database.
 */
import type { Express, Request, RequestHandler, Response } from 'express';
import { validatePassword } from '@shared/password-policy';
import {
  loginNameOf, resolveLoginIdentifier, usernameOfLoginEmail,
  type CredentialMethod, type TraderAccountStatus,
} from '@shared/trader-accounts';
import { appendAdminAudit, auditActor, codeTail } from './admin-audit';
import {
  generateSetupToken, generateTempPassword, hashSetupToken, inertSetupRowHash, liveSetupLink, looksLikeSetupToken,
  markMustChange, parseCreateTraderAccountInput, parseCredentialMethod, passwordState, pendingPasswordHash,
  setupLink, setupLinkExpiry, traderAccountStatus, type SetupRowLike,
} from './trader-accounts';

export interface TAUser {
  id: string; email: string; firstName?: string | null; lastName?: string | null; passwordHash?: string | null;
  subscriptionTier?: string | null; subscriptionStatus?: string | null; hasBetaAccess?: boolean | null; createdAt?: Date | string | null;
}
export interface TATrader { slug: string; name: string; linkedUserId: string | null }
export interface TASetupRow extends SetupRowLike { id: string; userId: string }

export interface TraderAccountDeps {
  listTraders: () => Promise<TATrader[]>;
  getTrader: (slug: string) => Promise<TATrader | null>;
  getUser: (id: string) => Promise<TAUser | null>;
  getUserByEmail: (email: string) => Promise<TAUser | null>;
  insertUser: (row: { email: string; passwordHash: string; firstName: string; subscriptionTier: string; hasBetaAccess: boolean }) => Promise<TAUser>;
  setPasswordHash: (userId: string, hash: string) => Promise<void>;
  setLinkedUser: (slug: string, userId: string | null) => Promise<void>;
  isProtectedAdmin: (u: TAUser) => boolean;
  /** Every 'setup:' row (live, used, expired, inert). */
  listSetupRows: (userId?: string) => Promise<TASetupRow[]>;
  insertSetupRow: (userId: string, email: string, tokenHash: string, expiresAt: Date, used?: boolean) => Promise<void>;
  /** used = true on every 'setup:' row of the user. */
  revokeSetupRows: (userId: string) => Promise<void>;
  findSetupRow: (tokenHash: string) => Promise<TASetupRow | null>;
  /** Atomic single use: UPDATE … SET used = true WHERE token = $1 AND used = false AND expires_at > now() RETURNING. */
  consumeSetupRow: (tokenHash: string) => Promise<TASetupRow | null>;
  hashPassword: (p: string) => Promise<string>;
  verifyPassword: (p: string, hash: string | null | undefined) => Promise<boolean>;
  deleteUserSessions: (userId: string) => Promise<number>;
  establishSession: (req: Request, userId: string) => Promise<void>;
  now: () => number;
}

async function defaultDeps(): Promise<TraderAccountDeps> {
  const { db } = await import('./db');
  const { users, traders, passwordResetTokens } = await import('@shared/schema');
  const { and, eq, gt, like, sql } = await import('drizzle-orm');
  const { storage } = await import('./storage');
  const { hashPassword, verifyPassword } = await import('./userAuth');
  const { establishSession } = await import('./auth-hardening');
  const { isProtectedAdmin } = await import('./admin-ops');
  const js = () => import('./journal-sources');
  const toTrader = (t: { slug: string; name: string; linkedUserId: string | null } | null | undefined): TATrader | null =>
    t ? { slug: t.slug, name: t.name, linkedUserId: t.linkedUserId ?? null } : null;
  return {
    listTraders: async () => (await (await js()).listTraders()).map((t) => toTrader(t)!),
    getTrader: async (slug) => toTrader(await (await js()).getTraderBySlug(slug)),
    getUser: async (id) => ((await storage.getUser(id).catch(() => undefined)) as TAUser | undefined) ?? null,
    getUserByEmail: async (email) => ((await storage.getUserByEmail(email)) as TAUser | undefined) ?? null,
    insertUser: async (row) => {
      const [u] = await db.insert(users).values({ ...row, subscriptionTier: row.subscriptionTier as never, subscriptionStatus: 'active' }).returning();
      return u as TAUser;
    },
    setPasswordHash: async (userId, hash) => { await db.update(users).set({ passwordHash: hash, updatedAt: new Date() }).where(eq(users.id, userId)); },
    setLinkedUser: async (slug, userId) => { await db.update(traders).set({ linkedUserId: userId }).where(eq(traders.slug, slug)); },
    isProtectedAdmin: (u) => isProtectedAdmin(u),
    listSetupRows: async (userId) => {
      const cond = userId ? and(like(passwordResetTokens.token, 'setup:%'), eq(passwordResetTokens.userId, userId)) : like(passwordResetTokens.token, 'setup:%');
      return (await db.select().from(passwordResetTokens).where(cond)) as TASetupRow[];
    },
    insertSetupRow: async (userId, email, tokenHash, expiresAt, used = false) => {
      await db.insert(passwordResetTokens).values({ userId, email, token: tokenHash, expiresAt, used });
    },
    revokeSetupRows: async (userId) => {
      await db.update(passwordResetTokens).set({ used: true })
        .where(and(eq(passwordResetTokens.userId, userId), like(passwordResetTokens.token, 'setup:%')));
    },
    findSetupRow: async (tokenHash) => {
      const [r] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, tokenHash)).limit(1);
      return (r as TASetupRow | undefined) ?? null;
    },
    consumeSetupRow: async (tokenHash) => {
      const [r] = await db.update(passwordResetTokens).set({ used: true })
        .where(and(eq(passwordResetTokens.token, tokenHash), eq(passwordResetTokens.used, false), gt(passwordResetTokens.expiresAt, sql`now()`)))
        .returning();
      return (r as TASetupRow | undefined) ?? null;
    },
    hashPassword,
    verifyPassword,
    deleteUserSessions: (id) => storage.deleteUserSessions(id).catch(() => 0),
    establishSession: (req, userId) => establishSession(req, userId),
    now: () => Date.now(),
  };
}

const ID_RE = /^[A-Za-z0-9_.:@-]{1,128}$/;
/** One answer for every bad / used / expired / revoked link: a guesser learns nothing. */
export const SETUP_LINK_ERROR = 'This setup link is invalid, used or expired. Ask for a new one.';
const LOGIN_ERROR = 'Invalid email/username or password';

function fail(res: Response, err: unknown, context: string) {
  // The message only — never the request body (it may hold a password or token).
  void import('./logger').then(({ logger }) => logger.error(`[TRADER-ACCOUNTS] ${context} failed`, { error: (err as Error)?.message })).catch(() => {});
  return res.status(500).json({ error: `${context} failed` });
}

function origin(req: Request): string {
  const env = process.env.APP_URL || process.env.PUBLIC_URL;
  if (env && /^https?:\/\//.test(env)) return env.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

export interface TraderAccountRow {
  id: string; displayName: string; login: string; email: string | null; username: string | null;
  status: TraderAccountStatus; linkExpiresAt: string | null; traderSlug: string | null; traderName: string | null;
  tier: string; hasBetaAccess: boolean; createdAt: string | null;
}

function toRow(u: TAUser, rows: SetupRowLike[], book: TATrader | undefined, now: number): TraderAccountRow {
  const live = liveSetupLink(rows, now);
  const username = usernameOfLoginEmail(u.email);
  return {
    id: u.id,
    displayName: [u.firstName, u.lastName].filter((s) => typeof s === 'string' && s.trim()).join(' ').trim() || loginNameOf(u.email),
    login: loginNameOf(u.email),
    email: username ? null : u.email,
    username,
    status: traderAccountStatus(u, rows, now),
    linkExpiresAt: live ? new Date(live.expiresAt).toISOString() : null,
    traderSlug: book?.slug ?? null,
    traderName: book?.name ?? null,
    tier: u.subscriptionTier ?? 'free',
    hasBetaAccess: !!u.hasBetaAccess,
    createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : null,
  };
}

export function registerTraderAccountRoutes(
  app: Express,
  requireAdmin: RequestHandler,
  limiters: { setup: RequestHandler[]; login: RequestHandler[] },
  injected?: Partial<TraderAccountDeps>,
) {
  let depsP: Promise<TraderAccountDeps> | null = null;
  const deps = async (): Promise<TraderAccountDeps> => {
    if (!depsP) depsP = defaultDeps().then((d) => ({ ...d, ...injected }));
    return depsP;
  };
  let dummyHash: Promise<string> | null = null;
  /** Spend one bcrypt on refusals too, so timing does not say which accounts hold a temp password. */
  const burnBcrypt = async (d: TraderAccountDeps, p: string) => {
    dummyHash ??= d.hashPassword('trader-accounts-timing-dummy');
    await d.verifyPassword(p, await dummyHash).catch(() => false);
  };
  const hubAudit = (req: Request, action: string, target: string, detail: Record<string, unknown> = {}) =>
    appendAdminAudit({ action, actor: auditActor(req as never), target, detail: { role: 'super', ...detail }, ip: req.ip ?? null });

  /** A user this feature may act on: not the platform admin; linked to a book or issued credentials here. */
  const traderAccount = async (d: TraderAccountDeps, id: string) => {
    if (!ID_RE.test(id)) return { status: 400, error: 'Bad account id' } as const;
    const u = await d.getUser(id);
    if (!u) return { status: 404, error: 'No such account' } as const;
    if (d.isProtectedAdmin(u)) return { status: 403, error: 'The platform admin account is not managed here' } as const;
    const [rows, books] = await Promise.all([d.listSetupRows(id), d.listTraders()]);
    const book = books.find((t) => t.linkedUserId === id);
    if (!book && !rows.length) return { status: 404, error: 'Not a trader account' } as const;
    return { user: u, rows, book } as const;
  };

  /** Issues one credential; returns the plaintext for the single response. */
  const issue = async (d: TraderAccountDeps, user: TAUser, method: CredentialMethod, req: Request) => {
    await d.revokeSetupRows(user.id); // every earlier link dies first
    if (method === 'link') {
      // An outstanding temp password dies too (an own password, if set, keeps working until the link is used).
      if (passwordState(user.passwordHash) === 'must_change') await d.setPasswordHash(user.id, pendingPasswordHash());
      const token = generateSetupToken();
      const expiresAt = setupLinkExpiry(d.now());
      await d.insertSetupRow(user.id, user.email, hashSetupToken(token), expiresAt);
      return { secret: token, credential: { method: 'link' as const, link: setupLink(origin(req), token), expiresAt: expiresAt.toISOString() } };
    }
    const temp = generateTempPassword();
    await d.setPasswordHash(user.id, markMustChange(await d.hashPassword(temp)));
    // Inert marker (used, random hash): "credentials were issued here", never consumable.
    await d.insertSetupRow(user.id, user.email, inertSetupRowHash(), new Date(d.now()), true);
    return { secret: temp, credential: { method: 'temp' as const, tempPassword: temp, login: loginNameOf(user.email) } };
  };

  // ── Admin hub ─────────────────────────────────────────
  app.get('/api/admin/ops/trader-accounts', requireAdmin, async (_req, res) => {
    try {
      const d = await deps();
      const [books, rows] = await Promise.all([d.listTraders(), d.listSetupRows()]);
      const byUser = new Map<string, TASetupRow[]>();
      for (const r of rows) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);
      const ids = Array.from(new Set([...books.map((b) => b.linkedUserId).filter((x): x is string => !!x), ...Array.from(byUser.keys())]));
      const now = d.now();
      const accounts: TraderAccountRow[] = [];
      for (const id of ids) {
        const u = await d.getUser(id);
        if (!u || d.isProtectedAdmin(u)) continue;
        accounts.push(toRow(u, byUser.get(id) ?? [], books.find((b) => b.linkedUserId === id), now));
      }
      accounts.sort((a, b) => (a.traderName ?? '~').localeCompare(b.traderName ?? '~') || a.login.localeCompare(b.login));
      res.set('Cache-Control', 'no-store');
      res.json({ traders: books.map((b) => ({ slug: b.slug, name: b.name, hasDeskAdmin: !!b.linkedUserId })), accounts });
    } catch (err) { fail(res, err, 'Trader account list'); }
  });

  app.post('/api/admin/ops/trader-accounts', requireAdmin, async (req, res) => {
    try {
      const parsed = parseCreateTraderAccountInput(req.body);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      const v = parsed.value;
      const d = await deps();
      const book = await d.getTrader(v.traderSlug);
      if (!book) return res.status(404).json({ error: 'No such trader book' });
      if (v.deskAdmin && book.linkedUserId) {
        return res.status(409).json({ error: `${book.name}'s desk already has a desk admin — remove them in Desk admins first, or untick "desk admin"` });
      }
      if (await d.getUserByEmail(v.loginEmail)) {
        return res.status(409).json({ error: v.username ? `The username "${v.username}" is taken` : `An account with ${v.email} already exists — link it in Desk admins instead` });
      }

      let user: TAUser;
      try {
        // No usable password until the trader sets one ('pending$…' never verifies).
        user = await d.insertUser({ email: v.loginEmail, passwordHash: pendingPasswordHash(), firstName: v.displayName, subscriptionTier: v.tier, hasBetaAccess: true });
      } catch (e) {
        if ((e as { code?: string })?.code === '23505') return res.status(409).json({ error: 'That email or username was just taken' });
        throw e;
      }
      if (v.deskAdmin) await d.setLinkedUser(v.traderSlug, user.id);
      const { secret, credential } = await issue(d, user, v.method, req);

      hubAudit(req, 'trader_account.create', `${user.id} ${loginNameOf(user.email)}`, {
        traderSlug: v.traderSlug, deskAdmin: v.deskAdmin, tier: v.tier, betaAccess: true, method: v.method, codeTail: codeTail(secret),
      });
      if (v.deskAdmin) hubAudit(req, 'desk.assign', v.traderSlug, { userId: user.id, email: user.email, replaced: null, via: 'trader_account.create' });

      res.set('Cache-Control', 'no-store');
      const fresh = (await d.getUser(user.id)) ?? user; // the credential step changed the hash state
      res.status(201).json({ ok: true, account: toRow(fresh, await d.listSetupRows(user.id), v.deskAdmin ? book : undefined, d.now()), credential, shownOnce: true });
    } catch (err) { fail(res, err, 'Trader account create'); }
  });

  app.post('/api/admin/ops/trader-accounts/:id/regenerate', requireAdmin, async (req, res) => {
    try {
      const d = await deps();
      const method = parseCredentialMethod(req.body?.method);
      if (!method) return res.status(400).json({ error: "method must be 'link' or 'temp'" });
      const t = await traderAccount(d, String(req.params.id ?? ''));
      if ('error' in t) return res.status(t.status ?? 400).json({ error: t.error });
      if (t.user.subscriptionStatus === 'disabled') return res.status(400).json({ error: 'That account is disabled — enable it in Users first' });
      const { secret, credential } = await issue(d, t.user, method, req);
      // A temp password replaces the old one at once: sign the account out everywhere.
      const sessionsEnded = method === 'temp' ? await d.deleteUserSessions(t.user.id) : 0;
      hubAudit(req, 'trader_account.regenerate', `${t.user.id} ${loginNameOf(t.user.email)}`, { method, codeTail: codeTail(secret), sessionsEnded });
      res.set('Cache-Control', 'no-store');
      const fresh = (await d.getUser(t.user.id)) ?? t.user;
      res.json({ ok: true, account: toRow(fresh, await d.listSetupRows(t.user.id), t.book, d.now()), credential, shownOnce: true });
    } catch (err) { fail(res, err, 'Regenerate'); }
  });

  app.post('/api/admin/ops/trader-accounts/:id/revoke', requireAdmin, async (req, res) => {
    try {
      const d = await deps();
      const t = await traderAccount(d, String(req.params.id ?? ''));
      if ('error' in t) return res.status(t.status ?? 400).json({ error: t.error });
      await d.revokeSetupRows(t.user.id);
      const tempRevoked = passwordState(t.user.passwordHash) === 'must_change';
      if (tempRevoked) await d.setPasswordHash(t.user.id, pendingPasswordHash());
      hubAudit(req, 'trader_account.revoke', `${t.user.id} ${loginNameOf(t.user.email)}`, { tempPasswordRevoked: tempRevoked });
      const fresh = (await d.getUser(t.user.id)) ?? t.user;
      res.json({ ok: true, account: toRow(fresh, await d.listSetupRows(t.user.id), t.book, d.now()) });
    } catch (err) { fail(res, err, 'Revoke'); }
  });

  // ── Public: setup link ────────────────────────────────
  /** Live link → its account, or null (every failure looks the same). */
  const resolveLink = async (d: TraderAccountDeps, raw: unknown) => {
    if (!looksLikeSetupToken(raw)) return null;
    const row = await d.findSetupRow(hashSetupToken(raw));
    if (!row || row.used || new Date(row.expiresAt).getTime() <= d.now()) return null;
    const u = await d.getUser(row.userId);
    if (!u || u.subscriptionStatus === 'disabled' || d.isProtectedAdmin(u)) return null;
    return { row, user: u };
  };

  app.post('/api/auth/setup/inspect', ...limiters.setup, async (req, res) => {
    try {
      const d = await deps();
      const hit = await resolveLink(d, req.body?.token);
      res.set('Cache-Control', 'no-store');
      if (!hit) return res.status(400).json({ error: SETUP_LINK_ERROR });
      const books = await d.listTraders();
      const book = books.find((b) => b.linkedUserId === hit.user.id);
      res.json({
        displayName: hit.user.firstName || loginNameOf(hit.user.email),
        login: loginNameOf(hit.user.email),
        loginIsUsername: !!usernameOfLoginEmail(hit.user.email),
        traderName: book?.name ?? null,
        expiresAt: new Date(hit.row.expiresAt).toISOString(),
      });
    } catch (err) { fail(res, err, 'Setup link check'); }
  });

  app.post('/api/auth/setup/complete', ...limiters.setup, async (req, res) => {
    try {
      const d = await deps();
      const { token, password } = (req.body ?? {}) as { token?: unknown; password?: unknown };
      if (!looksLikeSetupToken(token)) return res.status(400).json({ error: SETUP_LINK_ERROR });
      // Policy first, so a weak password does not burn the link.
      const pwErr = validatePassword(password);
      if (pwErr) return res.status(400).json({ error: pwErr });
      const hit = await resolveLink(d, token);
      if (!hit) return res.status(400).json({ error: SETUP_LINK_ERROR });
      const consumed = await d.consumeSetupRow(hashSetupToken(token)); // atomic: a second use (or a race) gets null
      if (!consumed || consumed.userId !== hit.user.id) return res.status(400).json({ error: SETUP_LINK_ERROR });

      await d.setPasswordHash(hit.user.id, await d.hashPassword(password as string));
      await d.revokeSetupRows(hit.user.id);
      await d.deleteUserSessions(hit.user.id);
      await d.establishSession(req, hit.user.id);
      appendAdminAudit({ action: 'trader_account.setup_complete', actor: `user:${hit.user.id}`, target: `${hit.user.id} ${loginNameOf(hit.user.email)}`, detail: {}, ip: req.ip ?? null });
      res.set('Cache-Control', 'no-store');
      res.json({ ok: true, login: loginNameOf(hit.user.email), redirect: '/desk' });
    } catch (err) { fail(res, err, 'Account setup'); }
  });

  // ── Public: first sign-in with a temporary password ───
  app.post('/api/auth/first-login', ...limiters.login, async (req, res) => {
    try {
      const d = await deps();
      const { login, password, newPassword } = (req.body ?? {}) as Record<string, unknown>;
      if (typeof password !== 'string' || password.length > 1024) return res.status(401).json({ error: LOGIN_ERROR });
      const email = resolveLoginIdentifier(login);
      const u = email ? await d.getUserByEmail(email) : null;
      // Unknown account, no temp password, wrong password: the same 401 (and one bcrypt each).
      if (!u || passwordState(u.passwordHash) !== 'must_change') {
        await burnBcrypt(d, password);
        return res.status(401).json({ error: LOGIN_ERROR });
      }
      if (!(await d.verifyPassword(password, u.passwordHash))) return res.status(401).json({ error: LOGIN_ERROR });
      if (u.subscriptionStatus === 'disabled') return res.status(403).json({ error: 'This account is disabled.' });
      const pwErr = validatePassword(newPassword);
      if (pwErr) return res.status(400).json({ error: pwErr });
      if (newPassword === password) return res.status(400).json({ error: 'Choose a new password — not the temporary one' });

      await d.setPasswordHash(u.id, await d.hashPassword(newPassword as string));
      await d.revokeSetupRows(u.id);
      await d.deleteUserSessions(u.id);
      await d.establishSession(req, u.id);
      appendAdminAudit({ action: 'trader_account.password_changed', actor: `user:${u.id}`, target: `${u.id} ${loginNameOf(u.email)}`, detail: {}, ip: req.ip ?? null });
      res.set('Cache-Control', 'no-store');
      res.json({ ok: true, login: loginNameOf(u.email), redirect: '/desk' });
    } catch (err) { fail(res, err, 'First sign-in'); }
  });
}

