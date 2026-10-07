/**
 * "I took this" (docs/DESK_ADMINS.md §I took this) — a signed-in member marks a
 * NEXUS idea as taken; it lands in THEIR book as origin 'quantedge_idea'
 * (journal_trades.broker = 'quantedge'), distinct from their own ideas.
 *
 *   POST /api/journal/took-idea   { ideaId, journal?, entryPrice?, quantity?, note? }
 *        journal defaults to the caller's desk book (trader:<slug>) when they are a
 *        desk admin, else their personal book ('mine'). Any other book must be one
 *        the caller can write (journal-sources writableOwner — admin or linked user).
 *        One take per idea per book (409 with the existing row id).
 *   GET  /api/journal/took-ideas  { journal, ideaIds[] } — which ideas the caller
 *        already took into their default book (drives the button state).
 *
 * Attribution (who took it, from which desk) is stored on the row, so it is as
 * private as the book it sits in (DESK_ADMINS privacy: private by default).
 */
import type { Express, Request, RequestHandler, Response } from 'express';
import { buildTookIdeaTrade, tookIdeaKey, QUANTEDGE_IDEA_BROKER, type TookIdeaSource } from '@shared/desk-admin';

export interface TookIdeaDeps {
  /** The writable book for this caller + requested key (throws {status,message} like JournalAccessError). */
  resolveBook: (req: Request, requested: string | undefined) => Promise<{ ownerId: string; key: string; userId: string; deskSlug: string | null }>;
  getIdea: (id: string) => Promise<TookIdeaSource | null>;
  findTaken: (ownerId: string, brokerOrderId: string) => Promise<{ id: string } | null>;
  listTakenIdeaIds: (ownerId: string) => Promise<string[]>;
  insert: (row: Record<string, unknown>) => Promise<{ id: string }>;
}

async function defaultDeps(): Promise<TookIdeaDeps> {
  return {
    resolveBook: async (req, requested) => {
      const { journalActor, writableOwner } = await import('./journal-sources');
      const { parseJournalKey } = await import('@shared/journal-sources');
      const { deskAccessFor, deskAdminsEnabled } = await import('./desk-admin');
      const actor = await journalActor(req);
      if (!actor.userId) throw Object.assign(new Error('Sign in first'), { status: 401 });
      const access = deskAdminsEnabled() ? await deskAccessFor(req) : null;
      const deskSlug = access?.role === 'desk' ? access.deskSlug : null;
      const key = requested ?? (deskSlug ? `trader:${deskSlug}` : 'mine');
      const j = await writableOwner(actor, parseJournalKey(key));
      return { ownerId: j.ownerId, key: j.key, userId: actor.userId, deskSlug: j.kind === 'trader' ? j.trader?.slug ?? null : null };
    },
    getIdea: async (id) => {
      const { storage } = await import('./storage');
      return ((await storage.getTradeIdeaById(id).catch(() => null)) as unknown as TookIdeaSource | null) ?? null;
    },
    findTaken: async (ownerId, key) => {
      const { db } = await import('./db');
      const { journalTrades } = await import('@shared/schema');
      const { and, eq } = await import('drizzle-orm');
      const [r] = await db.select({ id: journalTrades.id }).from(journalTrades)
        .where(and(eq(journalTrades.userId, ownerId), eq(journalTrades.broker, QUANTEDGE_IDEA_BROKER), eq(journalTrades.brokerOrderId, key))).limit(1);
      return r ?? null;
    },
    listTakenIdeaIds: async (ownerId) => {
      const { db } = await import('./db');
      const { journalTrades } = await import('@shared/schema');
      const { and, eq, desc } = await import('drizzle-orm');
      const rows = await db.select({ k: journalTrades.brokerOrderId }).from(journalTrades)
        .where(and(eq(journalTrades.userId, ownerId), eq(journalTrades.broker, QUANTEDGE_IDEA_BROKER)))
        .orderBy(desc(journalTrades.createdAt)).limit(500);
      return rows.map((r) => String(r.k ?? '').replace(/^idea:/, '')).filter(Boolean);
    },
    insert: async (row) => {
      const { storage } = await import('./storage');
      return storage.createJournalTrade(row as never);
    },
  };
}

const ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;
const KEY_RE = /^(mine|trader:[a-z0-9][a-z0-9-]{0,31})$/;

function fail(res: Response, err: unknown, context: string) {
  const status = (err as { status?: number })?.status;
  if (status && status >= 400 && status < 500) return res.status(status).json({ error: (err as Error).message });
  void import('./logger').then(({ logger }) => logger.error(`[TOOK-IDEA] ${context} failed`, { error: (err as Error)?.message })).catch(() => {});
  return res.status(500).json({ error: `${context} failed` });
}

export function registerTookIdeaRoutes(app: Express, requireBetaAccess: RequestHandler, injected?: Partial<TookIdeaDeps>) {
  let depsP: Promise<TookIdeaDeps> | null = null;
  const deps = () => (depsP ??= defaultDeps().then((d) => ({ ...d, ...injected })));

  app.post('/api/journal/took-idea', requireBetaAccess, async (req, res) => {
    try {
      const b = (req.body ?? {}) as Record<string, unknown>;
      if (typeof b.ideaId !== 'string' || !ID_RE.test(b.ideaId)) return res.status(400).json({ error: 'ideaId is required' });
      if (b.journal !== undefined && (typeof b.journal !== 'string' || !KEY_RE.test(b.journal))) return res.status(400).json({ error: "journal must be 'mine' or 'trader:<slug>'" });
      const d = await deps();
      const book = await d.resolveBook(req, b.journal as string | undefined);
      const idea = await d.getIdea(b.ideaId);
      if (!idea) return res.status(404).json({ error: 'No such idea' });
      const existing = await d.findTaken(book.ownerId, tookIdeaKey(idea.id));
      if (existing) return res.status(409).json({ error: 'Already in your journal', tradeId: existing.id, journal: book.key });
      const built = buildTookIdeaTrade(idea, {
        ownerId: book.ownerId, takenBy: book.userId, deskSlug: book.deskSlug, journalKey: book.key, nowIso: new Date().toISOString(),
        entryPrice: b.entryPrice, quantity: b.quantity, note: b.note,
      });
      if (!built.ok) return res.status(400).json({ error: built.error });
      const row = await d.insert(built.row);
      res.status(201).json({ ok: true, tradeId: row.id, journal: book.key, origin: 'quantedge_idea' });
    } catch (err) { fail(res, err, 'I took this'); }
  });

  app.get('/api/journal/took-ideas', requireBetaAccess, async (req, res) => {
    try {
      const d = await deps();
      const book = await d.resolveBook(req, undefined);
      res.set('Cache-Control', 'no-store');
      res.json({ journal: book.key, ideaIds: await d.listTakenIdeaIds(book.ownerId) });
    } catch (err) { fail(res, err, 'Taken ideas'); }
  });
}
