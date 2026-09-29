/**
 * Journals API — sources, traders + watchlists, notes, Discord import, Alpaca.
 * (The core trade routes — /api/journal/trades, /trade, /analytics, /import-csv —
 * stay in routes.ts and take ?journal= through the same helpers.)
 *
 *   GET    /api/journal/sources                     switcher list + caller's rights
 *   GET    /api/journal/notes?journal=              notes for a book
 *   POST   /api/journal/notes?journal=              day note / notebook / missed / playbook (writable books)
 *   DELETE /api/journal/notes/:id?journal=          remove a manual note (writable books)
 *   GET    /api/journal/bot                         the Quant Bot's rules (config) + paper portfolios
 *   GET    /api/traders                             traders (with watchlist counts)
 *   POST   /api/traders                             create            (admin)
 *   PATCH  /api/traders/:slug                       handle/source/…   (admin)
 *   GET    /api/traders/:slug/watchlist             read              (any beta user)
 *   POST   /api/traders/:slug/watchlist             add               (admin or the trader)
 *   DELETE /api/traders/:slug/watchlist/:id         remove            (admin or the trader)
 *   POST   /api/journal/discord/preview             parse, no writes  (admin or the trader)
 *   POST   /api/journal/discord/commit              write previewed   (same person who previewed)
 *   GET    /api/journal/broker/alpaca               connection status (never keys)
 *   POST   /api/journal/broker/alpaca               connect (verify, seal, store)
 *   DELETE /api/journal/broker/alpaca               disconnect
 *   POST   /api/journal/broker/alpaca/sync          import fills → my journal
 */
import type { Express, Request, Response, NextFunction } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from './db';
import { logger } from './logger';
import { journalNotes, paperPortfolios, traders, traderWatchlistItems } from '@shared/schema';
import { JOURNAL_NOTE_KINDS, TRADER_SLUG_RE, journalNoteKey, parseJournalKey, type JournalSourceListItem } from '@shared/journal-sources';
import {
  JournalAccessError, canWriteTrader, getTraderBySlug, journalActor, listTraders, loadJournalNotes, resolveJournal, writableOwner,
} from './journal-sources';

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;

function fail(res: Response, err: unknown, context: string) {
  if (err instanceof JournalAccessError) return res.status(err.status).json({ error: err.message });
  const status = (err as any)?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) return res.status(status).json({ error: (err as Error).message });
  logger.error(`[JOURNALS] ${context} failed`, { error: (err as Error)?.message });
  return res.status(500).json({ error: `${context} failed`, message: (err as Error)?.message });
}

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-/]{0,11}$/;

export function registerJournalsRoutes(app: Express, requireBetaAccess: Mw) {
  // ── Sources ──────────────────────────────────────────────
  app.get('/api/journal/sources', requireBetaAccess, async (req, res) => {
    try {
      const actor = await journalActor(req);
      const list = await listTraders();
      const items: JournalSourceListItem[] = [
        { key: 'mine', kind: 'mine', label: 'Mine', hint: 'Your trades — manual, broker CSV, Alpaca', readOnly: false, canWrite: !!actor.userId },
        { key: 'bot', kind: 'bot', label: 'Bot', hint: "The Quant Bot's paper fills", readOnly: true, canWrite: false },
        { key: 'desk', kind: 'desk', label: 'Trade desk', hint: 'Every published idea, scored as a trade', readOnly: true, canWrite: false },
        ...list.map((t): JournalSourceListItem => {
          const canWrite = canWriteTrader(actor, t);
          return { key: `trader:${t.slug}`, kind: 'trader', label: t.name, hint: `${t.name}'s journal${t.source ? ` · from ${t.source}` : ''}`, readOnly: !canWrite, canWrite };
        }),
      ];
      const { discordBotConfigured } = await import('./discord-journal-import');
      const { secretBoxConfigured } = await import('./secret-box');
      const { envAlpacaCreds } = await import('./alpaca-journal-import');
      res.json({
        sources: items,
        isAdmin: actor.isAdmin,
        capabilities: {
          discordBot: discordBotConfigured(),
          brokerKeys: secretBoxConfigured(),
          serverAlpaca: actor.isAdmin && !!envAlpacaCreds(),
        },
      });
    } catch (err) { fail(res, err, 'Journal sources'); }
  });

  app.get('/api/journal/notes', requireBetaAccess, async (req, res) => {
    try {
      const actor = await journalActor(req);
      const j = await resolveJournal(actor, parseJournalKey(req.query.journal as string));
      const notes = await loadJournalNotes(j);
      res.json({ notes, count: notes.length });
    } catch (err) { fail(res, err, 'Journal notes'); }
  });

  // Notes written from the journal (day notes, notebook entries, missed trades,
  // playbook definitions). Only writable books; only source='manual' rows.
  const noteBody = z.object({
    kind: z.enum(JOURNAL_NOTE_KINDS),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'day: YYYY-MM-DD'),
    body: z.string().max(20_000),
    symbols: z.array(z.string().trim().toUpperCase().regex(SYMBOL_RE)).max(12).optional(),
    /** playbook: the setup name the definition belongs to. */
    ref: z.string().trim().min(1).max(60).optional(),
  }).strict();

  app.post('/api/journal/notes', requireBetaAccess, async (req, res) => {
    try {
      const actor = await journalActor(req);
      const j = await writableOwner(actor, parseJournalKey(req.query.journal as string));
      const parsed = noteBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid note', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
      const { kind, day, symbols } = parsed.data;
      const body = parsed.data.body.trim();
      if (kind === 'playbook' && !parsed.data.ref) return res.status(400).json({ error: 'A playbook definition needs the setup name (ref)' });
      const key = journalNoteKey(kind, kind === 'playbook' ? parsed.data.ref! : day);
      const values = {
        ownerId: j.ownerId, day, body, source: 'manual', reason: kind, sourceMessageId: key,
        symbols: symbols?.length ? [...new Set(symbols)] : null, postedAt: new Date().toISOString(),
      };
      if (key) {
        // One per day / per setup: an empty body clears it.
        if (!body) {
          await db.delete(journalNotes).where(and(eq(journalNotes.ownerId, j.ownerId), eq(journalNotes.source, 'manual'), eq(journalNotes.sourceMessageId, key)));
          return res.json({ note: null, cleared: true });
        }
        const [note] = await db.insert(journalNotes).values(values)
          .onConflictDoUpdate({ target: [journalNotes.ownerId, journalNotes.source, journalNotes.sourceMessageId], set: { body, symbols: values.symbols, postedAt: values.postedAt, day } })
          .returning();
        return res.json({ note });
      }
      if (!body) return res.status(400).json({ error: 'Write something first' });
      const [note] = await db.insert(journalNotes).values(values).returning();
      res.status(201).json({ note });
    } catch (err) { fail(res, err, 'Save journal note'); }
  });

  app.delete('/api/journal/notes/:id', requireBetaAccess, async (req, res) => {
    try {
      const actor = await journalActor(req);
      const j = await writableOwner(actor, parseJournalKey(req.query.journal as string));
      const del = await db.delete(journalNotes)
        .where(and(eq(journalNotes.id, String(req.params.id)), eq(journalNotes.ownerId, j.ownerId), eq(journalNotes.source, 'manual')))
        .returning({ id: journalNotes.id });
      if (!del.length) return res.status(404).json({ error: 'No such note in this journal (imported notes are removed by re-importing)' });
      res.json({ success: true });
    } catch (err) { fail(res, err, 'Delete journal note'); }
  });

  // ── Bot book: its rules (config) and paper accounts ─────
  app.get('/api/journal/bot', requireBetaAccess, async (_req, res) => {
    try {
      const { BOT_PORTFOLIO_NAME, DEFAULT_BOT_CONFIG, BOT_USER_ID } = await import('./quant-bot');
      const portfolios = await db.select().from(paperPortfolios).where(eq(paperPortfolios.userId, BOT_USER_ID));
      res.json({
        asOf: new Date().toISOString(),
        config: DEFAULT_BOT_CONFIG,
        activePortfolio: BOT_PORTFOLIO_NAME,
        portfolios: portfolios.map((p) => ({
          id: p.id, name: p.name, active: p.name === BOT_PORTFOLIO_NAME,
          startingCapital: p.startingCapital, cashBalance: p.cashBalance, totalValue: p.totalValue,
          totalPnL: p.totalPnL, totalPnLPercent: p.totalPnLPercent, winCount: p.winCount, lossCount: p.lossCount,
          riskPerTrade: p.riskPerTrade, maxPositionSize: p.maxPositionSize,
          createdAt: p.createdAt, updatedAt: p.updatedAt,
        })),
      });
    } catch (err) { fail(res, err, 'Bot rules'); }
  });

  // ── Traders ──────────────────────────────────────────────
  app.get('/api/traders', requireBetaAccess, async (req, res) => {
    try {
      const actor = await journalActor(req);
      const list = await listTraders();
      const counts = await db.select({ traderId: traderWatchlistItems.traderId, n: sql<number>`count(*)::int` })
        .from(traderWatchlistItems).groupBy(traderWatchlistItems.traderId);
      const n = new Map(counts.map((c) => [c.traderId, c.n]));
      res.json({
        isAdmin: actor.isAdmin,
        traders: list.map((t) => ({
          id: t.id, slug: t.slug, name: t.name, handle: t.handle, source: t.source,
          watchlistCount: n.get(t.id) ?? 0, canWrite: canWriteTrader(actor, t),
          // Channel/author ids are configuration — admins only.
          ...(actor.isAdmin ? { discordChannelId: t.discordChannelId, discordAuthorId: t.discordAuthorId, linkedUserId: t.linkedUserId } : {}),
        })),
      });
    } catch (err) { fail(res, err, 'Traders'); }
  });

  const traderBody = z.object({
    slug: z.string().trim().toLowerCase().regex(TRADER_SLUG_RE, 'slug: lowercase letters, digits, dashes'),
    name: z.string().trim().min(1).max(60),
    handle: z.string().trim().max(80).nullish(),
    source: z.string().trim().max(40).nullish(),
    discordChannelId: z.string().trim().regex(/^\d{15,22}$/, 'numeric Discord id').nullish(),
    discordAuthorId: z.string().trim().max(40).nullish(),
    linkedUserId: z.string().trim().max(80).nullish(),
  }).strict();

  app.post('/api/traders', requireBetaAccess, async (req, res) => {
    try {
      const actor = await journalActor(req);
      if (!actor.isAdmin) return res.status(403).json({ error: 'Only an admin can add traders' });
      const parsed = traderBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid trader', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
      if (await getTraderBySlug(parsed.data.slug)) return res.status(409).json({ error: `A trader called "${parsed.data.slug}" already exists` });
      const [t] = await db.insert(traders).values({ ...parsed.data, createdBy: actor.userId }).returning();
      res.status(201).json({ trader: t });
    } catch (err) { fail(res, err, 'Create trader'); }
  });

  app.patch('/api/traders/:slug', requireBetaAccess, async (req, res) => {
    try {
      const actor = await journalActor(req);
      if (!actor.isAdmin) return res.status(403).json({ error: 'Only an admin can edit traders' });
      const t = await getTraderBySlug(String(req.params.slug));
      if (!t) return res.status(404).json({ error: 'No such trader' });
      const parsed = traderBody.omit({ slug: true }).partial().strict().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid update', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
      const [u] = await db.update(traders).set(parsed.data).where(eq(traders.id, t.id)).returning();
      res.json({ trader: u });
    } catch (err) { fail(res, err, 'Update trader'); }
  });

  // ── Trader watchlists ────────────────────────────────────
  app.get('/api/traders/:slug/watchlist', requireBetaAccess, async (req, res) => {
    try {
      const actor = await journalActor(req);
      const t = await getTraderBySlug(String(req.params.slug));
      if (!t) return res.status(404).json({ error: 'No such trader' });
      const items = await db.select().from(traderWatchlistItems).where(eq(traderWatchlistItems.traderId, t.id)).orderBy(traderWatchlistItems.addedAt);
      res.json({ trader: { slug: t.slug, name: t.name }, canWrite: canWriteTrader(actor, t), items: items.map(({ id, symbol, note, addedAt }) => ({ id, symbol, note, addedAt })) });
    } catch (err) { fail(res, err, 'Trader watchlist'); }
  });

  app.post('/api/traders/:slug/watchlist', requireBetaAccess, async (req, res) => {
    try {
      const actor = await journalActor(req);
      const t = await getTraderBySlug(String(req.params.slug));
      if (!t) return res.status(404).json({ error: 'No such trader' });
      if (!canWriteTrader(actor, t)) return res.status(403).json({ error: `Only an admin or ${t.name} can change ${t.name}'s watchlist` });
      const symbol = String(req.body?.symbol ?? '').trim().toUpperCase().replace(/^\$/, '');
      if (!SYMBOL_RE.test(symbol)) return res.status(400).json({ error: 'Enter a ticker like NVDA' });
      const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 280) || null : null;
      const [item] = await db.insert(traderWatchlistItems).values({ traderId: t.id, symbol, note, addedBy: actor.userId })
        .onConflictDoNothing().returning();
      if (!item) return res.status(409).json({ error: `${symbol} is already on ${t.name}'s watchlist` });
      res.status(201).json({ item });
    } catch (err) { fail(res, err, 'Add to trader watchlist'); }
  });

  app.delete('/api/traders/:slug/watchlist/:id', requireBetaAccess, async (req, res) => {
    try {
      const actor = await journalActor(req);
      const t = await getTraderBySlug(String(req.params.slug));
      if (!t) return res.status(404).json({ error: 'No such trader' });
      if (!canWriteTrader(actor, t)) return res.status(403).json({ error: `Only an admin or ${t.name} can change ${t.name}'s watchlist` });
      const del = await db.delete(traderWatchlistItems)
        .where(and(eq(traderWatchlistItems.id, String(req.params.id)), eq(traderWatchlistItems.traderId, t.id)))
        .returning({ id: traderWatchlistItems.id });
      if (!del.length) return res.status(404).json({ error: 'Not on this watchlist' });
      res.json({ success: true });
    } catch (err) { fail(res, err, 'Remove from trader watchlist'); }
  });

  // ── Discord import ───────────────────────────────────────
  const previewBody = z.object({
    trader: z.string().trim().toLowerCase().regex(TRADER_SLUG_RE),
    source: z.enum(['file', 'bot']),
    content: z.string().max(12_000_000).optional(),
    channelId: z.string().trim().optional(),
    authorId: z.string().trim().max(40).nullish(),
  }).strict();

  app.post('/api/journal/discord/preview', requireBetaAccess, async (req, res) => {
    try {
      const actor = await journalActor(req);
      const parsed = previewBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid import request', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
      const { trader: slug, source, content, channelId, authorId } = parsed.data;
      // Admins may import into any trader's journal; a trader linked to this user into their own.
      const j = await writableOwner(actor, `trader:${slug}`);
      const { buildDiscordPreview } = await import('./discord-journal-import');
      let src: { kind: 'file'; content: string } | { kind: 'bot'; channelId: string };
      if (source === 'file') {
        if (!content?.trim()) return res.status(400).json({ error: 'Upload a DiscordChatExporter JSON or CSV file' });
        src = { kind: 'file', content };
      } else {
        const id = channelId || j.trader?.discordChannelId;
        if (!id) return res.status(400).json({ error: `No channel id — enter one, or set ${j.label}'s Discord channel` });
        src = { kind: 'bot', channelId: id };
      }
      const preview = await buildDiscordPreview({
        ownerId: j.ownerId, traderSlug: slug, actorId: actor.userId!, source: src,
        authorId: authorId ?? j.trader?.discordAuthorId ?? null,
      });
      res.json(preview);
    } catch (err) { fail(res, err, 'Discord preview'); }
  });

  app.post('/api/journal/discord/commit', requireBetaAccess, async (req, res) => {
    try {
      const actor = await journalActor(req);
      const token = typeof req.body?.token === 'string' ? req.body.token : '';
      const slug = typeof req.body?.trader === 'string' ? req.body.trader.toLowerCase() : '';
      if (!token || !TRADER_SLUG_RE.test(slug)) return res.status(400).json({ error: 'Missing preview token or trader' });
      await writableOwner(actor, `trader:${slug}`); // rights are re-checked at commit, not only at preview
      const { commitDiscordPreview } = await import('./discord-journal-import');
      res.json({ success: true, ...(await commitDiscordPreview(token, actor.userId!, slug)) });
    } catch (err) { fail(res, err, 'Discord import'); }
  });

  // ── Alpaca (read-only) ───────────────────────────────────
  app.get('/api/journal/broker/alpaca', requireBetaAccess, async (req, res) => {
    try {
      const actor = await journalActor(req);
      if (!actor.userId) return res.status(401).json({ error: 'Sign in first' });
      const mod = await import('./alpaca-journal-import');
      const { secretBoxConfigured } = await import('./secret-box');
      res.json({
        connection: mod.publicConnection(await mod.getAlpacaConnection(actor.userId)),
        canStoreKeys: secretBoxConfigured(),
        serverAccount: actor.isAdmin && mod.envAlpacaCreds() ? { paper: mod.envAlpacaCreds()!.paper } : null,
      });
    } catch (err) { fail(res, err, 'Alpaca status'); }
  });

  const connectBody = z.object({
    keyId: z.string().trim().min(8).max(128),
    secretKey: z.string().trim().min(8).max(256),
    paper: z.boolean().default(true),
  }).strict();

  app.post('/api/journal/broker/alpaca', requireBetaAccess, async (req, res) => {
    try {
      const actor = await journalActor(req);
      if (!actor.userId) return res.status(401).json({ error: 'Sign in first' });
      const parsed = connectBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Enter your Alpaca key id and secret' });
      const mod = await import('./alpaca-journal-import');
      const { secretBoxConfigured } = await import('./secret-box');
      if (!secretBoxConfigured()) {
        return res.status(503).json({ error: 'Saving broker keys is not enabled on this server yet (the operator must set BROKER_CREDENTIALS_KEY)' });
      }
      const creds = { keyId: parsed.data.keyId, secret: parsed.data.secretKey, paper: parsed.data.paper };
      try {
        await mod.verifyAlpaca(creds);
      } catch (e) {
        if (e instanceof mod.AlpacaAuthError) return res.status(400).json({ error: e.message });
        throw e;
      }
      const row = await mod.saveAlpacaConnection(actor.userId, creds);
      res.json({ connection: mod.publicConnection(row) });
    } catch (err) { fail(res, err, 'Alpaca connect'); }
  });

  app.delete('/api/journal/broker/alpaca', requireBetaAccess, async (req, res) => {
    try {
      const actor = await journalActor(req);
      if (!actor.userId) return res.status(401).json({ error: 'Sign in first' });
      const { deleteAlpacaConnection } = await import('./alpaca-journal-import');
      res.json({ success: await deleteAlpacaConnection(actor.userId) });
    } catch (err) { fail(res, err, 'Alpaca disconnect'); }
  });

  app.post('/api/journal/broker/alpaca/sync', requireBetaAccess, async (req, res) => {
    const actor = await journalActor(req);
    if (!actor.userId) return res.status(401).json({ error: 'Sign in first' });
    const mod = await import('./alpaca-journal-import');
    const useServer = req.body?.account === 'server';
    try {
      // Imports always land in the caller's own journal ("mine").
      const j = await writableOwner(actor, 'mine');
      let creds;
      if (useServer) {
        if (!actor.isAdmin) return res.status(403).json({ error: 'Only the operator can sync the server-configured Alpaca account' });
        creds = mod.envAlpacaCreds();
        if (!creds) return res.status(400).json({ error: 'No server Alpaca account is configured (ALPACA_API_KEY / ALPACA_SECRET_KEY)' });
      } else {
        const row = await mod.getAlpacaConnection(actor.userId);
        if (!row) return res.status(400).json({ error: 'Connect your Alpaca account first' });
        creds = mod.credsFromConnection(row);
      }
      const result = await mod.syncAlpacaIntoJournal(j.ownerId, creds, useServer ? 'server account' : 'your keys');
      if (!useServer) await mod.recordSync(actor.userId, result);
      res.json({ success: true, ...result });
    } catch (err) {
      if (!useServer) await mod.recordSync(actor.userId, { error: (err as Error).message, at: new Date().toISOString() }).catch(() => {});
      if (err instanceof mod.AlpacaAuthError) return res.status(400).json({ error: err.message });
      fail(res, err, 'Alpaca sync');
    }
  });
}
