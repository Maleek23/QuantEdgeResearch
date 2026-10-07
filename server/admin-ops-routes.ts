/**
 * Admin hub › operator actions (docs/ADMIN_TAB.md). Every route sits behind
 * requireAdminJWT — the same admin_token cookie (access code → password,
 * constant-time compares, adminLimiter + IP lockout) that guards every other
 * /api/admin/* route. Every write is appended to the admin action log
 * (server/admin-audit.ts).
 *
 *   GET    /api/admin/ops/overview               counts, sessions, job last-runs, memory
 *   GET    /api/admin/ops/users                  list (no password hashes)
 *   PATCH  /api/admin/ops/users/:id              { tier?, hasBetaAccess?, disabled? }
 *   POST   /api/admin/ops/users/:id/password-reset   email the existing reset link
 *   DELETE /api/admin/ops/users/:id              { confirmEmail } — full cascade
 *   GET    /api/admin/ops/invites                list with status + who redeemed
 *   POST   /api/admin/ops/invites/generate       { count, email?, tierOverride?, expiryDays?, note? }
 *   POST   /api/admin/ops/invites/:id/revoke
 *   POST   /api/admin/ops/waitlist/approve       { ids[], tierOverride?, expiryDays? } → email-locked codes
 *   GET    /api/admin/ops/traders                trader books with passcode set / unset
 *   GET    /api/admin/ops/audit                  admin action log, newest first
 */
import type { Express, Request, RequestHandler, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { betaInvites, betaWaitlist, userLoginHistory, users } from '@shared/schema';
import { logger } from './logger';
import {
  DISABLED_STATUS, MAX_INVITES_PER_BATCH, UNLOCKED_INVITE_EMAIL, deleteConfirmed,
  generateInviteCode, inviteDisplayStatus, inviteExpiryDate, inviteLink, isInviteEmailLocked, isProtectedAdmin,
  parseAssignableTier, parseGenerateInvitesInput, summarizeUsers, toAdminUserRow, DEFAULT_INVITE_EXPIRY_DAYS,
  type AdminUserRow,
} from './admin-ops';
import { appendAdminAudit, auditActor, codeTail, readAdminAudit } from './admin-audit';

const fail = (res: Response, err: unknown, context: string) => {
  logger.error(`[ADMIN-OPS] ${context} failed`, { error: (err as Error)?.message });
  res.status(500).json({ error: `${context} failed` });
};

const ID_RE = /^[A-Za-z0-9_.:@-]{1,128}$/;

/** Shared-state files the worker writes after each pass (server/lib/shared-state.ts). */
const JOBS: { id: string; label: string; file: string; cadence: string; staleAfterMin: number }[] = [
  { id: 'sector-board', label: 'Sector board', file: 'sector-board', cadence: 'worker, market hours', staleAfterMin: 30 },
  { id: 'sector-ignition', label: 'Sector ignition (intraday)', file: 'sector-ignition-intraday', cadence: 'worker, market hours', staleAfterMin: 15 },
  { id: 'zero-dte-sniper', label: '0DTE sniper', file: 'zero-dte-sniper', cadence: 'every 2 min 09:45–15:50 ET', staleAfterMin: 10 },
  { id: 'wall-touch', label: 'Wall touch', file: 'wall-touch', cadence: 'worker, market hours', staleAfterMin: 10 },
  { id: 'index-0dte', label: 'Index 0DTE scan + SPX fast moves', file: 'index-0dte-last', cadence: 'worker, 09:45–15:55 ET', staleAfterMin: 10 },
  { id: 'worker-health', label: 'Worker heartbeat', file: 'worker-health', cadence: 'every 60 s', staleAfterMin: 3 },
];

async function lastLogins(): Promise<Map<string, Date>> {
  const { db } = await import('./db');
  const rows = await db.select({ userId: userLoginHistory.userId, last: sql<Date>`max(${userLoginHistory.loginAt})` })
    .from(userLoginHistory).groupBy(userLoginHistory.userId);
  return new Map(rows.map((r) => [r.userId, r.last]));
}

async function userRows(): Promise<AdminUserRow[]> {
  const { storage } = await import('./storage');
  const [all, logins] = await Promise.all([storage.getAllUsers(), lastLogins().catch(() => new Map<string, Date>())]);
  return all
    .map((u) => toAdminUserRow(u, logins.get(u.id) ?? null))
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}

function origin(req: Request): string {
  const env = process.env.APP_URL || process.env.PUBLIC_URL;
  if (env && /^https?:\/\//.test(env)) return env.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

async function createCode(input: { email: string; tierOverride: string | null; expiresAt: Date; notes: string | null }) {
  const { storage } = await import('./storage');
  // A unique-constraint collision on ~99 bits is not going to happen; retry once anyway.
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = generateInviteCode();
    try {
      return await storage.createBetaInvite({
        email: input.email,
        token,
        tierOverride: (input.tierOverride ?? undefined) as never,
        notes: input.notes ?? undefined,
        expiresAt: input.expiresAt,
      });
    } catch (e) {
      if ((e as { code?: string })?.code !== '23505' || attempt === 1) throw e;
    }
  }
  throw new Error('unreachable');
}

export function registerAdminOpsRoutes(app: Express, requireAdmin: RequestHandler) {
  const actorOf = (req: Request) => auditActor(req as never);

  // ── Overview ────────────────────────────────────────────
  app.get('/api/admin/ops/overview', requireAdmin, async (_req, res) => {
    try {
      const { storage } = await import('./storage');
      const { db } = await import('./db');
      const [rows, waitlist, invites] = await Promise.all([userRows(), storage.getAllWaitlistEntries(), storage.getAllBetaInvites()]);

      let sessions: { active: number; users: number } | null = null;
      try {
        const r = await db.execute(sql`SELECT count(*)::int AS active,
          count(DISTINCT coalesce(sess->>'userId', sess->'passport'->'user'->>'id'))::int AS users
          FROM sessions WHERE expire > now()`);
        const row = (r as unknown as { rows: { active: number; users: number }[] }).rows?.[0];
        sessions = row ? { active: Number(row.active), users: Number(row.users) } : null;
      } catch { sessions = null; }

      const waitByStatus: Record<string, number> = {};
      for (const w of waitlist) waitByStatus[w.status ?? 'pending'] = (waitByStatus[w.status ?? 'pending'] ?? 0) + 1;
      const now = Date.now();
      const inviteCounts = { issued: invites.length, unused: 0, used: 0, expired: 0, revoked: 0 };
      for (const i of invites) inviteCounts[inviteDisplayStatus(i, now)]++;

      const { readShared, sharedStamp } = await import('./lib/shared-state');
      const jobs = JOBS.map((j) => {
        const r = readShared<unknown>(j.file, j.staleAfterMin * 60_000);
        return { id: j.id, label: j.label, cadence: j.cadence, ...sharedStamp(r) };
      });
      const worker = readShared<{ pid?: number; rssMb?: number; peakRssMb?: number; heapUsedMb?: number; uptimeSec?: number }>('worker-health');
      const mem = process.memoryUsage();

      res.set('Cache-Control', 'no-store');
      res.json({
        users: summarizeUsers(rows, now),
        sessions,
        waitlist: { total: waitlist.length, byStatus: waitByStatus },
        invites: inviteCounts,
        jobs,
        web: { rssMb: Math.round(mem.rss / 1048576), heapUsedMb: Math.round(mem.heapUsed / 1048576), uptimeSec: Math.round(process.uptime()) },
        worker: worker ? {
          pid: worker.data.pid ?? null, rssMb: worker.data.rssMb ?? null, peakRssMb: worker.data.peakRssMb ?? null,
          heapUsedMb: worker.data.heapUsedMb ?? null, uptimeSec: worker.data.uptimeSec ?? null,
          asOf: worker.writtenAt, ageSec: Math.round(worker.ageMs / 1000),
        } : null,
        at: new Date().toISOString(),
      });
    } catch (err) { fail(res, err, 'Admin overview'); }
  });

  // ── Users ───────────────────────────────────────────────
  app.get('/api/admin/ops/users', requireAdmin, async (_req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      res.json({ users: await userRows() });
    } catch (err) { fail(res, err, 'User list'); }
  });

  app.patch('/api/admin/ops/users/:id', requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id ?? '');
      if (!ID_RE.test(id)) return res.status(400).json({ error: 'Bad user id' });
      const { storage } = await import('./storage');
      const user = await storage.getUser(id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (isProtectedAdmin(user)) {
        return res.status(403).json({ error: 'The admin account is managed by ADMIN_EMAIL / the admin tier, not from the hub' });
      }
      const b = (req.body ?? {}) as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      const audits: { action: string; detail: Record<string, unknown> }[] = [];

      if (b.tier !== undefined) {
        const tier = parseAssignableTier(b.tier);
        if (!tier) return res.status(400).json({ error: 'Tier must be free, advanced or pro (admin is set by environment only)' });
        if (tier !== user.subscriptionTier) {
          patch.subscriptionTier = tier;
          audits.push({ action: 'user.tier', detail: { from: user.subscriptionTier, to: tier } });
        }
      }
      if (b.hasBetaAccess !== undefined) {
        if (typeof b.hasBetaAccess !== 'boolean') return res.status(400).json({ error: 'hasBetaAccess must be true or false' });
        if (b.hasBetaAccess !== !!user.hasBetaAccess) {
          patch.hasBetaAccess = b.hasBetaAccess;
          audits.push({ action: 'user.beta', detail: { to: b.hasBetaAccess } });
        }
      }
      let signOut = false;
      if (b.disabled !== undefined) {
        if (typeof b.disabled !== 'boolean') return res.status(400).json({ error: 'disabled must be true or false' });
        const isDisabled = user.subscriptionStatus === DISABLED_STATUS;
        if (b.disabled !== isDisabled) {
          patch.subscriptionStatus = b.disabled ? DISABLED_STATUS : 'active';
          audits.push({ action: b.disabled ? 'user.disable' : 'user.enable', detail: {} });
          signOut = b.disabled;
        }
      }
      if (!audits.length) return res.json({ ok: true, unchanged: true });

      const updated = await storage.updateUser(id, patch as never);
      let sessionsEnded = 0;
      if (signOut) sessionsEnded = await storage.deleteUserSessions(id).catch(() => 0);
      for (const a of audits) {
        appendAdminAudit({ action: a.action, actor: actorOf(req), target: `${id} ${user.email}`, detail: { ...a.detail, ...(a.action === 'user.disable' ? { sessionsEnded } : {}) }, ip: req.ip ?? null });
      }
      const logins = await lastLogins().catch(() => new Map<string, Date>());
      res.json({ ok: true, user: updated ? toAdminUserRow(updated, logins.get(id) ?? null) : null, sessionsEnded });
    } catch (err) { fail(res, err, 'User update'); }
  });

  app.post('/api/admin/ops/users/:id/password-reset', requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id ?? '');
      if (!ID_RE.test(id)) return res.status(400).json({ error: 'Bad user id' });
      if (!process.env.RESEND_API_KEY) return res.status(503).json({ error: 'Email is not configured (RESEND_API_KEY), so a reset link cannot be sent' });
      const { storage } = await import('./storage');
      const user = await storage.getUser(id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (!user.passwordHash) return res.status(400).json({ error: 'This account signs in with Google — there is no password to reset' });
      const { randomBytes } = await import('node:crypto');
      await storage.invalidateUserResetTokens(user.id);
      const token = randomBytes(32).toString('hex');
      await storage.createPasswordResetToken(user.id, user.email.toLowerCase(), token);
      const { sendPasswordResetEmail } = await import('./emailService');
      const sent = await sendPasswordResetEmail(user.email.toLowerCase(), token);
      if (!sent.success) {
        await storage.invalidateUserResetTokens(user.id);
        return res.status(502).json({ error: sent.error || 'The reset email could not be sent' });
      }
      appendAdminAudit({ action: 'user.password_reset', actor: actorOf(req), target: `${id} ${user.email}`, ip: req.ip ?? null });
      res.json({ ok: true, sentTo: user.email });
    } catch (err) { fail(res, err, 'Password reset'); }
  });

  app.delete('/api/admin/ops/users/:id', requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id ?? '');
      if (!ID_RE.test(id)) return res.status(400).json({ error: 'Bad user id' });
      const { storage } = await import('./storage');
      const user = await storage.getUser(id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (isProtectedAdmin(user)) return res.status(403).json({ error: 'The admin account cannot be deleted from the hub' });
      if (!deleteConfirmed(user, req.body?.confirmEmail)) {
        return res.status(400).json({ error: 'Type the account email exactly to confirm the delete' });
      }
      const deleted = await storage.deleteUser(id);
      if (!deleted) return res.status(404).json({ error: 'User not found' });
      appendAdminAudit({ action: 'user.delete', actor: actorOf(req), target: `${id} ${user.email}`, detail: { tier: user.subscriptionTier }, ip: req.ip ?? null });
      res.json({ ok: true });
    } catch (err) { fail(res, err, 'User delete'); }
  });

  // ── Invite codes ────────────────────────────────────────
  app.get('/api/admin/ops/invites', requireAdmin, async (req, res) => {
    try {
      const { storage } = await import('./storage');
      const { db } = await import('./db');
      const invites = await storage.getAllBetaInvites();
      const redeemers = await db.select({ id: users.id, email: users.email, inviteId: users.betaInviteId, createdAt: users.createdAt })
        .from(users).where(sql`${users.betaInviteId} IS NOT NULL`);
      const byInvite = new Map(redeemers.map((u) => [u.inviteId!, u]));
      const now = Date.now();
      const base = origin(req);
      res.set('Cache-Control', 'no-store');
      res.json({
        invites: invites.map((i) => {
          const u = byInvite.get(i.id);
          return {
            id: i.id,
            code: i.token,
            link: inviteLink(base, i.token),
            email: isInviteEmailLocked(i) ? i.email : null,
            status: inviteDisplayStatus(i, now),
            rawStatus: i.status,
            tierOverride: i.tierOverride ?? null,
            note: i.notes ?? null,
            createdAt: i.createdAt,
            expiresAt: i.expiresAt,
            sentAt: i.sentAt,
            redeemedAt: i.redeemedAt,
            redeemedBy: u ? { id: u.id, email: u.email } : null,
          };
        }),
      });
    } catch (err) { fail(res, err, 'Invite list'); }
  });

  app.post('/api/admin/ops/invites/generate', requireAdmin, async (req, res) => {
    try {
      const parsed = parseGenerateInvitesInput(req.body);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      const { count, email, tierOverride, expiryDays, note } = parsed.value;
      const { storage } = await import('./storage');
      if (email) {
        const open = await storage.getBetaInviteByEmail(email);
        if (open && inviteDisplayStatus(open) === 'unused') {
          return res.status(409).json({ error: `${email} already has an unused invite — revoke it first or copy that code` });
        }
      }
      const expiresAt = inviteExpiryDate(expiryDays);
      const base = origin(req);
      const created: { id: string; code: string; link: string }[] = [];
      for (let n = 0; n < count; n++) {
        const inv = await createCode({ email: email ?? UNLOCKED_INVITE_EMAIL, tierOverride, expiresAt, notes: note });
        created.push({ id: inv.id, code: inv.token, link: inviteLink(base, inv.token) });
      }
      if (email) {
        const w = await storage.getWaitlistEntry(email);
        if (w && w.status !== 'joined') await storage.updateWaitlistStatus(w.id, 'approved', created[0].id);
      }
      appendAdminAudit({
        action: 'invite.generate', actor: actorOf(req), target: email ?? `${count} unlocked`,
        detail: { count, tierOverride: tierOverride ?? 'none', expiryDays, note, codeTails: created.map((c) => codeTail(c.code)) },
        ip: req.ip ?? null,
      });
      res.json({ ok: true, invites: created, expiresAt: expiresAt.toISOString() });
    } catch (err) { fail(res, err, 'Invite generation'); }
  });

  app.post('/api/admin/ops/invites/:id/revoke', requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id ?? '');
      if (!ID_RE.test(id)) return res.status(400).json({ error: 'Bad invite id' });
      const { db } = await import('./db');
      const [inv] = await db.select().from(betaInvites).where(eq(betaInvites.id, id)).limit(1);
      if (!inv) return res.status(404).json({ error: 'Invite not found' });
      if (inv.status === 'redeemed') return res.status(409).json({ error: 'This code was already used — disable or delete the account instead' });
      if (inv.status === 'revoked') return res.json({ ok: true, unchanged: true });
      await db.update(betaInvites).set({ status: 'revoked' }).where(eq(betaInvites.id, id));
      appendAdminAudit({ action: 'invite.revoke', actor: actorOf(req), target: isInviteEmailLocked(inv) ? inv.email : id, detail: { inviteId: id, codeTail: codeTail(inv.token) }, ip: req.ip ?? null });
      res.json({ ok: true });
    } catch (err) { fail(res, err, 'Invite revoke'); }
  });

  // ── Waitlist ────────────────────────────────────────────
  // Approve → an email-locked code per entry (no email is sent; the operator
  // copies the code or link). An entry that already has an unused code gets
  // that code back instead of a second one.
  app.post('/api/admin/ops/waitlist/approve', requireAdmin, async (req, res) => {
    try {
      const ids: unknown = req.body?.ids;
      if (!Array.isArray(ids) || !ids.length || ids.length > MAX_INVITES_PER_BATCH || ids.some((x) => typeof x !== 'string' || !ID_RE.test(x))) {
        return res.status(400).json({ error: `ids: 1–${MAX_INVITES_PER_BATCH} waitlist entry ids` });
      }
      const opts = parseGenerateInvitesInput({ tierOverride: req.body?.tierOverride, expiryDays: req.body?.expiryDays ?? DEFAULT_INVITE_EXPIRY_DAYS });
      if (!opts.ok) return res.status(400).json({ error: opts.error });
      const { storage } = await import('./storage');
      const { db } = await import('./db');
      const entries = await db.select().from(betaWaitlist).where(sql`${betaWaitlist.id} IN (${sql.join((ids as string[]).map((x) => sql`${x}`), sql`, `)})`);
      const base = origin(req);
      const expiresAt = inviteExpiryDate(opts.value.expiryDays);
      const results: { id: string; email: string; code: string | null; link: string | null; reused: boolean; skipped?: string }[] = [];
      for (const e of entries) {
        if (e.status === 'joined') { results.push({ id: e.id, email: e.email, code: null, link: null, reused: false, skipped: 'already joined' }); continue; }
        const existing = await storage.getBetaInviteByEmail(e.email);
        if (existing && inviteDisplayStatus(existing) === 'unused') {
          await storage.updateWaitlistStatus(e.id, e.status === 'invited' ? 'invited' : 'approved', existing.id);
          results.push({ id: e.id, email: e.email, code: existing.token, link: inviteLink(base, existing.token), reused: true });
          continue;
        }
        const inv = await createCode({ email: e.email.toLowerCase(), tierOverride: opts.value.tierOverride, expiresAt, notes: 'waitlist approval' });
        await storage.updateWaitlistStatus(e.id, 'approved', inv.id);
        results.push({ id: e.id, email: e.email, code: inv.token, link: inviteLink(base, inv.token), reused: false });
      }
      appendAdminAudit({
        action: 'waitlist.approve', actor: actorOf(req), target: `${results.length} entries`,
        detail: { emails: results.map((r) => r.email), created: results.filter((r) => r.code && !r.reused).length, tierOverride: opts.value.tierOverride ?? 'none' },
        ip: req.ip ?? null,
      });
      res.json({ ok: true, results, notFound: (ids as string[]).length - entries.length });
    } catch (err) { fail(res, err, 'Waitlist approval'); }
  });

  // ── Trader books ────────────────────────────────────────
  app.get('/api/admin/ops/traders', requireAdmin, async (_req, res) => {
    try {
      const { listTraders } = await import('./journal-sources');
      const list = await listTraders();
      res.set('Cache-Control', 'no-store');
      res.json({ traders: list.map((t) => ({ slug: t.slug, name: t.name, locked: !!t.passcodeHash, linked: !!t.linkedUserId, source: t.source ?? null })) });
    } catch (err) { fail(res, err, 'Trader list'); }
  });

  // ── Audit log ───────────────────────────────────────────
  app.get('/api/admin/ops/audit', requireAdmin, (req, res) => {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 200) || 200));
    res.set('Cache-Control', 'no-store');
    res.json({ entries: readAdminAudit(limit) });
  });
}

