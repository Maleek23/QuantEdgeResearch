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
 *   GET    /api/journal/balance?journal=            the book's account balance, when one exists (edge score / relative drawdown)
 *   GET    /api/journal/bars?symbols=&interval=&from=  OHLC for many symbols in one call (Loss analysis MFE/MAE)
 *   GET    /api/traders                             traders (with watchlist counts)
 *   POST   /api/traders                             create            (admin)
 *   PATCH  /api/traders/:slug                       handle/source/…   (admin)
 *   GET    /api/traders/:slug/watchlist             read              (any beta user)
 *   POST   /api/traders/:slug/watchlist             add               (admin or the trader)
 *   DELETE /api/traders/:slug/watchlist/:id         remove            (admin or the trader)
 *   POST   /api/journal/discord/preview             parse, no writes  (admin or the trader)
 *   POST   /api/journal/discord/commit              write previewed   (same person who previewed)
 *   POST   /api/journal/discord/forum/preview       forum → threads → traders, no writes (admin)
 *   POST   /api/journal/discord/forum/commit        write previewed threads with the confirmed mapping (admin)
 *   GET    /api/traders/leaderboard                 ranked traders (stated + measured-on-underlying)
 *   GET    /api/traders/:slug/analysis              one trader's stats, calls, rank
 *   GET    /api/trader-calls?symbol=                NEXUS evidence: recent open calls from ranked traders, repriced live
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
import { journalNotes, journalTrades, paperPortfolios, traders, traderWatchlistItems } from '@shared/schema';
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

/** A note attachment: an https link or a compact inline image/PDF (the client downscales images first). */
const MAX_ATTACHMENT_CHARS = 2_500_000;
const attachmentSchema = z.object({
  url: z.string().max(MAX_ATTACHMENT_CHARS, 'attachment is too large (max ~1.8MB)').refine(
    (s) => /^https:\/\/\S+$/i.test(s) || /^data:(image\/(png|jpeg|webp)|application\/pdf);base64,[A-Za-z0-9+/=]+$/.test(s),
    'attachment must be an https link or a PNG/JPEG/WebP image or PDF',
  ),
  name: z.string().trim().min(1).max(120),
  isImage: z.boolean(),
}).strict();

/** Account balance cache (Alpaca /v2/account is rate-limited; one read per user per minute). */
const balanceCache = new Map<string, { at: number; value: unknown }>();

export function registerJournalsRoutes(app: Express, requireBetaAccess: Mw) {
  // ── Bars for the Loss analysis page ──────────────────────
  // One request for up to 25 symbols instead of one per symbol per interval
  // (a desk book spans ~80 symbols — per-symbol fetches would spend a third of
  // the 500/15min API budget on one page view). Same provider path and cache
  // as /api/historical-prices; bars are trimmed to [from − 40d, now] and sent
  // as [t(ms), o, h, l, c] rows. A symbol the feed has nothing for is null.
  app.get('/api/journal/bars', requireBetaAccess, async (req, res) => {
    try {
      const interval = req.query.interval === '1h' ? '1h' : req.query.interval === '1d' ? '1d' : null;
      if (!interval) return res.status(400).json({ error: 'interval must be 1h or 1d' });
      const symbols = [...new Set(String(req.query.symbols ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))];
      if (!symbols.length || symbols.length > 25 || symbols.some((s) => !/^[A-Z0-9^][A-Z0-9.\-=/^]{0,14}$/.test(s))) {
        return res.status(400).json({ error: 'symbols: 1–25 tickers, comma-separated' });
      }
      const fromRaw = Number(req.query.from);
      const from = Number.isFinite(fromRaw) && fromRaw > 0 ? fromRaw - 40 * 86_400_000 : 0;
      const { fetchCandlesBatch } = await import('./historical-candles');
      const got = await fetchCandlesBatch(symbols, interval === '1h' ? '6mo' : '2y', interval, 3);
      const bars: Record<string, [number, number, number, number, number][] | null> = {};
      for (const s of symbols) {
        const rows = (got.get(s) ?? [])
          .map((c) => [c.time < 10_000_000_000 ? c.time * 1000 : c.time, c.open, c.high, c.low, c.close] as [number, number, number, number, number])
          .filter((r) => r[0] >= from && r.slice(1).every((v) => Number.isFinite(v) && v > 0));
        bars[s] = rows.length > 1 ? rows : null;
      }
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.json({ interval, bars });
    } catch (err) { fail(res, err, 'Journal bars'); }
  });

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
    body: z.string().max(60_000),
    symbols: z.array(z.string().trim().toUpperCase().regex(SYMBOL_RE)).max(12).optional(),
    /** playbook: the setup name the definition belongs to; trade_review: the trade id. */
    ref: z.string().trim().min(1).max(80).optional(),
    /** day_note / note / trade_review: up to 6 attachments (≤ ~6MB total — see the route's body limit). */
    attachments: z.array(attachmentSchema).max(6).optional(),
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
      if (kind === 'trade_review') {
        if (!parsed.data.ref) return res.status(400).json({ error: 'A trade review needs the trade id (ref)' });
        // Reviews attach only to a trade in this same book.
        const [t] = await db.select({ id: journalTrades.id }).from(journalTrades)
          .where(and(eq(journalTrades.id, parsed.data.ref), eq(journalTrades.userId, j.ownerId))).limit(1);
        if (!t) return res.status(404).json({ error: 'No such trade in this journal' });
      }
      if (kind === 'playbook' && parsed.data.attachments?.length) return res.status(400).json({ error: 'Playbook definitions do not take attachments' });
      const attachments = parsed.data.attachments?.length ? parsed.data.attachments : null;
      const key = journalNoteKey(kind, kind === 'playbook' || kind === 'trade_review' ? parsed.data.ref! : day);
      const values = {
        ownerId: j.ownerId, day, body, source: 'manual', reason: kind, sourceMessageId: key, attachments,
        symbols: symbols?.length ? [...new Set(symbols)] : null, postedAt: new Date().toISOString(),
      };
      if (key) {
        // One per day / per setup / per trade: an empty body with no attachments clears it.
        if (!body && !attachments) {
          await db.delete(journalNotes).where(and(eq(journalNotes.ownerId, j.ownerId), eq(journalNotes.source, 'manual'), eq(journalNotes.sourceMessageId, key)));
          return res.json({ note: null, cleared: true });
        }
        const [note] = await db.insert(journalNotes).values(values)
          .onConflictDoUpdate({ target: [journalNotes.ownerId, journalNotes.source, journalNotes.sourceMessageId], set: { body, symbols: values.symbols, postedAt: values.postedAt, day, attachments } })
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
      const { BOT_PORTFOLIO_NAME, DEFAULT_BOT_CONFIG } = await import('./quant-bot');
      const { loadBotLedger } = await import('./bot-ledger');
      const { portfolios, positions, runs } = await loadBotLedger();
      res.json({
        asOf: new Date().toISOString(),
        config: DEFAULT_BOT_CONFIG,
        activePortfolio: BOT_PORTFOLIO_NAME,
        runs,
        portfolios: runs.map((run) => {
          const p = portfolios.find((x) => x.id === run.id)!;
          const open = positions.filter((x) => x.portfolioId === run.id && x.status !== 'closed');
          // Value = cash + open positions at their marks, computed now. The stored
          // total_value column drifted from that and is returned only for audit.
          const positionsValue = open.reduce((s2, x) => s2 + Number(x.currentPrice ?? x.entryPrice) * x.quantity * (x.assetType === 'option' ? 100 : 1), 0);
          const marks = open.map((x) => x.lastPriceUpdate).filter((x): x is string => !!x).sort();
          return {
            id: p.id, name: p.name, displayName: run.displayName, runLabel: run.label, runNo: run.runNo, active: run.active,
            startingCapital: p.startingCapital, cashBalance: p.cashBalance,
            positionsValue: Math.round(positionsValue * 100) / 100,
            totalValue: Math.round((p.cashBalance + positionsValue) * 100) / 100,
            storedTotalValue: p.totalValue,
            openCount: open.length, unmarked: open.filter((x) => x.currentPrice == null || !x.lastPriceUpdate).length,
            oldestMarkAt: marks[0] ?? null, newestMarkAt: marks[marks.length - 1] ?? null,
            totalPnL: p.totalPnL, totalPnLPercent: p.totalPnLPercent, winCount: p.winCount, lossCount: p.lossCount,
            riskPerTrade: p.riskPerTrade, maxPositionSize: p.maxPositionSize,
            createdAt: p.createdAt, updatedAt: p.updatedAt,
          };
        }),
      });
    } catch (err) { fail(res, err, 'Bot rules'); }
  });

  // ── Account balance behind a book (for % drawdown and the edge score) ──
  // Only real balances: the bot's paper portfolio starting capital, or (Mine)
  // the connected Alpaca account's equity. Every other book answers
  // balance: null with the reason — the client never substitutes a number.
  app.get('/api/journal/balance', requireBetaAccess, async (req, res) => {
    try {
      const actor = await journalActor(req);
      const key = parseJournalKey(req.query.journal as string);
      const j = await resolveJournal(actor, key);
      const none = (reason: string) => res.json({ key, balance: null, reason });
      if (key === 'bot') {
        const { BOT_PORTFOLIO_NAME, BOT_USER_ID } = await import('./quant-bot');
        const [p] = await db.select().from(paperPortfolios)
          .where(and(eq(paperPortfolios.userId, BOT_USER_ID), eq(paperPortfolios.name, BOT_PORTFOLIO_NAME))).limit(1);
        if (!p || !(Number(p.startingCapital) > 0)) return none('The bot has no paper portfolio with a starting capital.');
        return res.json({
          key, balance: { kind: 'starting', amount: Number(p.startingCapital), label: `${p.name} starting capital`, source: 'paper_portfolios.starting_capital', asOf: p.updatedAt ?? null },
        });
      }
      if (key === 'mine') {
        if (!actor.userId) return none('Sign in to read a connected account.');
        const mod = await import('./alpaca-journal-import');
        const row = await mod.getAlpacaConnection(actor.userId);
        if (!row) return none('No account balance for Mine — connect Alpaca (Accounts) to anchor drawdown % to your equity.');
        const hit = balanceCache.get(actor.userId);
        if (hit && Date.now() - hit.at < 60_000) return res.json(hit.value);
        try {
          const eq0 = await mod.fetchAlpacaEquity(mod.credsFromConnection(row));
          const value = { key, balance: { kind: 'equity', amount: eq0.equity, label: `Alpaca ${row.paper ? 'paper' : 'live'} equity now`, source: 'Alpaca GET /v2/account', asOf: eq0.asOf } };
          balanceCache.set(actor.userId, { at: Date.now(), value });
          return res.json(value);
        } catch (e) {
          return none(`Alpaca account read failed (${(e as Error).message}) — no balance this time.`);
        }
      }
      if (key === 'desk') return none('The trade desk book sizes each idea on its own (1 contract / $1,000 notional) — there is no account balance behind it.');
      return none(`${j.label}'s journal has no account balance on record.`);
    } catch (err) { fail(res, err, 'Journal balance'); }
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

  // ── Discord FORUM import (admin): every trader's thread at once ──
  const forumPreviewBody = z.object({
    source: z.enum(['bot', 'files']),
    forumId: z.string().trim().regex(/^\d{15,22}$/, 'numeric Discord channel id').optional(),
    files: z.array(z.object({ name: z.string().trim().min(1).max(200), content: z.string().max(15_000_000) }).strict()).max(80).optional(),
  }).strict();

  app.post('/api/journal/discord/forum/preview', requireBetaAccess, async (req, res) => {
    try {
      const actor = await journalActor(req);
      if (!actor.isAdmin || !actor.userId) return res.status(403).json({ error: 'Only an admin can import a Discord forum' });
      const parsed = forumPreviewBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid forum import request', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
      const { source, forumId, files } = parsed.data;
      if (source === 'bot' && !forumId) return res.status(400).json({ error: 'Enter the forum channel id' });
      if (source === 'files' && !files?.length) return res.status(400).json({ error: 'Upload DiscordChatExporter JSON exports of the threads (or a .zip of them)' });
      const { buildForumPreview } = await import('./discord-forum-import');
      res.json(await buildForumPreview({
        actorId: actor.userId,
        source: source === 'bot' ? { kind: 'bot', forumId: forumId! } : { kind: 'files', files: files! },
      }));
    } catch (err) { fail(res, err, 'Discord forum preview'); }
  });

  const forumCommitBody = z.object({
    token: z.string().min(8).max(64),
    threads: z.array(z.object({
      threadId: z.string().trim().min(1).max(240),
      /** null = skip this thread. */
      slug: z.string().trim().toLowerCase().regex(TRADER_SLUG_RE).nullable(),
      /** Required when slug is a NEW trader: the operator's confirmation, with the display name. */
      createName: z.string().trim().min(1).max(60).nullish(),
    }).strict()).min(1).max(200),
  }).strict();

  app.post('/api/journal/discord/forum/commit', requireBetaAccess, async (req, res) => {
    try {
      const actor = await journalActor(req);
      if (!actor.isAdmin || !actor.userId) return res.status(403).json({ error: 'Only an admin can import a Discord forum' });
      const parsed = forumCommitBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid forum commit', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
      const { commitForumPreview } = await import('./discord-forum-import');
      res.json({ success: true, ...(await commitForumPreview(parsed.data.token, actor.userId, parsed.data.threads)) });
    } catch (err) { fail(res, err, 'Discord forum import'); }
  });

  // ── Trader analysis, leaderboard, NEXUS trader-call evidence ──
  app.get('/api/traders/leaderboard', requireBetaAccess, async (_req, res) => {
    try {
      const { leaderboard } = await import('./trader-analysis');
      res.json(await leaderboard());
    } catch (err) { fail(res, err, 'Trader leaderboard'); }
  });

  app.get('/api/traders/:slug/analysis', requireBetaAccess, async (req, res) => {
    try {
      const slug = String(req.params.slug).toLowerCase();
      if (!TRADER_SLUG_RE.test(slug)) return res.status(400).json({ error: 'Invalid trader' });
      const { traderAnalysis, leaderboard } = await import('./trader-analysis');
      const a = await traderAnalysis(slug);
      if (!a) return res.status(404).json({ error: 'No such trader' });
      const board = await leaderboard();
      const row = board.rows.find((r) => r.slug === slug) ?? null;
      res.json({ ...a, rank: row?.rank ?? null, passes: row?.passes ?? false, config: board.config, rankedOf: board.rows.filter((r) => r.rank != null).length });
    } catch (err) { fail(res, err, 'Trader analysis'); }
  });

  app.get('/api/trader-calls', requireBetaAccess, async (req, res) => {
    try {
      const symbol = typeof req.query.symbol === 'string' && SYMBOL_RE.test(req.query.symbol.toUpperCase()) ? req.query.symbol.toUpperCase() : null;
      const { traderCallsFeed } = await import('./trader-analysis');
      res.setHeader('Cache-Control', 'private, max-age=30');
      res.json(await traderCallsFeed({ symbol }));
    } catch (err) { fail(res, err, 'Trader calls'); }
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
