/**
 * Data-subject request path (docs/PRIVACY_IMPACT_ASSESSMENT.md §8, 2026-09-30).
 *
 *   GET  /api/account/deletion-request        my latest deletion request (or null)
 *   POST /api/account/deletion-request        queue one (idempotent while one is open)
 *   GET  /api/admin/privacy-requests          every request, newest first (admin JWT)
 *   POST /api/admin/privacy-requests/:id      set status: 'completed' | 'rejected' (admin JWT)
 *
 * Deliberately NOT destructive: a request is a row in user_activity_events
 * (activity_type 'privacy_request', metadata { kind, status, requestedAt, … }) plus
 * an email to PRIVACY_CONTACT_EMAIL (else ADMIN_EMAIL) with ids only. The operator
 * verifies and deletes by hand per the runbook — storage.deleteUser() does not yet
 * cascade to journals, broker keys, analytics or AI ledger rows (PIA risk R6), so
 * an automatic delete would leave orphans and a false "deleted" promise.
 * No migration: the table and its jsonb metadata column already exist.
 */
import type { Express, Request, Response, NextFunction } from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from './db';
import { logger } from './logger';
import { userActivityEvents } from '@shared/schema';

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;

export type PrivacyRequestStatus = 'pending' | 'completed' | 'rejected';
export interface PrivacyRequestView {
  id: string;
  userId: string;
  kind: 'account_deletion';
  status: PrivacyRequestStatus;
  requestedAt: string;
  resolvedAt: string | null;
  notified: boolean;
}

const KIND = 'account_deletion' as const;

function view(row: typeof userActivityEvents.$inferSelect): PrivacyRequestView {
  const m = (row.metadata ?? {}) as Record<string, unknown>;
  const status = m.status === 'completed' || m.status === 'rejected' ? m.status : 'pending';
  return {
    id: row.id,
    userId: row.userId,
    kind: KIND,
    status,
    requestedAt: typeof m.requestedAt === 'string' ? m.requestedAt : (row.occurredAt?.toISOString() ?? ''),
    resolvedAt: typeof m.resolvedAt === 'string' ? m.resolvedAt : null,
    notified: m.notified === true,
  };
}

async function latestFor(userId: string): Promise<PrivacyRequestView | null> {
  const [row] = await db.select().from(userActivityEvents)
    .where(and(eq(userActivityEvents.userId, userId), eq(userActivityEvents.activityType, 'privacy_request')))
    .orderBy(desc(userActivityEvents.occurredAt)).limit(1);
  return row ? view(row) : null;
}

export function registerPrivacyRoutes(app: Express, requireAdminJWT: Mw) {
  const sessionUser = (req: Request): string | null => ((req.session as any)?.userId as string | undefined) ?? null;

  app.get('/api/account/deletion-request', async (req: Request, res: Response) => {
    const userId = sessionUser(req);
    if (!userId) return res.status(401).json({ error: 'Sign in to see your requests' });
    try {
      res.json({ request: await latestFor(userId) });
    } catch (err) {
      logger.error('[PRIVACY] read request failed', { error: (err as Error)?.message });
      res.status(500).json({ error: 'Could not load your request' });
    }
  });

  app.post('/api/account/deletion-request', async (req: Request, res: Response) => {
    const userId = sessionUser(req);
    if (!userId) return res.status(401).json({ error: 'Sign in to request account deletion' });
    try {
      const open = await latestFor(userId);
      if (open && open.status === 'pending') return res.json({ request: open, alreadyOpen: true });

      const requestedAt = new Date().toISOString();
      const [row] = await db.insert(userActivityEvents).values({
        userId,
        activityType: 'privacy_request',
        description: KIND,
        metadata: { kind: KIND, status: 'pending', requestedAt, notified: false },
      }).returning();

      // Tell the operator — ids only. A failed email leaves the row pending; the
      // admin list is the source of truth.
      const to = process.env.PRIVACY_CONTACT_EMAIL?.trim() || process.env.ADMIN_EMAIL?.trim();
      let notified = false;
      if (to) {
        const { sendPrivacyRequestNotice } = await import('./emailService');
        const r = await sendPrivacyRequestNotice(to, { requestId: row.id, userId, kind: KIND, requestedAt });
        notified = r.success;
        if (notified) {
          await db.update(userActivityEvents)
            .set({ metadata: sql`${userActivityEvents.metadata} || ${JSON.stringify({ notified: true })}::jsonb` })
            .where(eq(userActivityEvents.id, row.id));
        }
      }
      logger.info('[PRIVACY] account deletion requested', { requestId: row.id, userId, notified });
      res.status(201).json({ request: { ...view(row), notified } });
    } catch (err) {
      logger.error('[PRIVACY] create request failed', { error: (err as Error)?.message });
      res.status(500).json({ error: 'Could not record your request — please try again' });
    }
  });

  app.get('/api/admin/privacy-requests', requireAdminJWT, async (_req: Request, res: Response) => {
    try {
      const rows = await db.select().from(userActivityEvents)
        .where(eq(userActivityEvents.activityType, 'privacy_request'))
        .orderBy(desc(userActivityEvents.occurredAt)).limit(500);
      res.json({ requests: rows.map(view) });
    } catch (err) {
      res.status(500).json({ error: 'Could not load privacy requests', message: (err as Error)?.message });
    }
  });

  app.post('/api/admin/privacy-requests/:id', requireAdminJWT, async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const status = req.body?.status;
    if (!/^[a-f0-9-]{8,64}$/i.test(id)) return res.status(400).json({ error: 'bad id' });
    if (status !== 'completed' && status !== 'rejected') return res.status(400).json({ error: "status must be 'completed' or 'rejected'" });
    try {
      const patch = { status, resolvedAt: new Date().toISOString() };
      const [row] = await db.update(userActivityEvents)
        .set({ metadata: sql`${userActivityEvents.metadata} || ${JSON.stringify(patch)}::jsonb` })
        .where(and(eq(userActivityEvents.id, id), eq(userActivityEvents.activityType, 'privacy_request')))
        .returning();
      if (!row) return res.status(404).json({ error: 'No such request' });
      logger.info('[PRIVACY] request resolved', { requestId: id, status });
      res.json({ request: view(row) });
    } catch (err) {
      res.status(500).json({ error: 'Could not update the request', message: (err as Error)?.message });
    }
  });
}
