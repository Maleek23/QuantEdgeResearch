/**
 * Desk admins — server side (docs/DESK_ADMINS.md). Flag: DESK_ADMINS=true.
 *
 *   role        a signed-in user linked to one trader book (traders.linked_user_id);
 *               the super-admin is ADMIN_EMAIL / the admin tier (same rule as
 *               everywhere else). No shared code, no admin JWT — desk admins sign
 *               in like any member, and can never reach /api/admin/*.
 *   desk bot    one paper bot per book: config in desk_bots (migration 0005),
 *               ledger in paper_portfolios owned by `desk-bot:<slug>`, run through
 *               the platform bot's own cycle (server/quant-bot.ts runDeskBotCycle)
 *               so every publish / loss-rule / tape / quote gate applies.
 *               At most DESK_BOTS_MAX (default 3) desk bots are enabled at once —
 *               the droplet has one vCPU.
 */
import type { Request } from 'express';
import { and, asc, count, eq, ne } from 'drizzle-orm';
import { logger } from './logger';
import { isAccountDisabled } from './admin-ops';
import {
  DESK_BOT_STARTING_CAPITAL, defaultDeskBotConfig, deskBotOwnerId, deskBotPortfolioName, deskBotsToRun, deskEngineConfig,
  deskEntryCheck, normalizeStoredDeskConfig, resolveDeskAccess,
  type DeskAccess, type DeskBotConfig,
} from '@shared/desk-admin';
import type { Trader } from '@shared/schema';

export const deskAdminsEnabled = (): boolean => process.env.DESK_ADMINS === 'true';

export function deskBotsMax(): number {
  const raw = process.env.DESK_BOTS_MAX;
  const n = raw === undefined || raw === '' ? 3 : Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.min(6, Math.floor(n))) : 3;
}

/** Same super-admin rule as journal-sources / sanitizeUser: ADMIN_EMAIL or the admin tier. */
export function isSuperAdminUser(user: { email?: string | null; subscriptionTier?: string | null } | null | undefined): boolean {
  if (!user) return false;
  const adminEmail = process.env.ADMIN_EMAIL;
  return (!!adminEmail && !!user.email && user.email.toLowerCase() === adminEmail.toLowerCase()) || user.subscriptionTier === 'admin';
}

/** The session user id (email session, then Google), as /api/auth/me reads it. */
export function sessionUserId(req: Request): string | null {
  const s = (req as any).session?.userId;
  if (s) return String(s);
  const g = (req as any).user?.claims?.sub;
  return g ? String(g) : null;
}

/** Who is asking, resolved from the session. Never a dev bypass. */
export async function deskAccessFor(req: Request): Promise<DeskAccess> {
  const userId = sessionUserId(req);
  if (!userId) return { role: 'none', userId: null, deskSlug: null };
  const { storage } = await import('./storage');
  const user = await storage.getUser(userId).catch(() => undefined);
  if (!user) return { role: 'none', userId: null, deskSlug: null };
  const { listTraders } = await import('./journal-sources');
  const traders = await listTraders();
  return resolveDeskAccess({ userId, isSuperAdmin: isSuperAdminUser(user), disabled: isAccountDisabled(user), traders });
}

// ─── desk_bots ───────────────────────────────────────────────

export class DeskBotsUnavailable extends Error {
  constructor() { super('Desk bots are not set up on this database yet (migration 0005_desk_admins.sql)'); }
}
const isMissingTable = (e: unknown) => (e as { code?: string })?.code === '42P01';

async function platformConfig() {
  const { DEFAULT_BOT_CONFIG } = await import('./quant-bot');
  return DEFAULT_BOT_CONFIG;
}

export interface DeskBotState { slug: string; enabled: boolean; enabledAt: string | null; config: DeskBotConfig; updatedAt: string | null; updatedBy: string | null; exists: boolean }

export async function readDeskBot(slug: string): Promise<DeskBotState> {
  const { db } = await import('./db');
  const { deskBots } = await import('@shared/schema');
  const base = await platformConfig();
  try {
    const [row] = await db.select().from(deskBots).where(eq(deskBots.traderSlug, slug)).limit(1);
    if (!row) return { slug, enabled: false, enabledAt: null, config: defaultDeskBotConfig(base), updatedAt: null, updatedBy: null, exists: false };
    return {
      slug, enabled: row.enabled, enabledAt: row.enabledAt ? new Date(row.enabledAt).toISOString() : null,
      config: normalizeStoredDeskConfig(row.config, base), updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
      updatedBy: row.updatedBy ?? null, exists: true,
    };
  } catch (e) {
    if (isMissingTable(e)) throw new DeskBotsUnavailable();
    throw e;
  }
}

export async function writeDeskBotConfig(slug: string, config: DeskBotConfig, actorId: string | null): Promise<void> {
  const { db } = await import('./db');
  const { deskBots } = await import('@shared/schema');
  try {
    await db.insert(deskBots).values({ traderSlug: slug, config, updatedBy: actorId, enabled: false })
      .onConflictDoUpdate({ target: deskBots.traderSlug, set: { config, updatedBy: actorId, updatedAt: new Date() } });
  } catch (e) {
    if (isMissingTable(e)) throw new DeskBotsUnavailable();
    throw e;
  }
}

/** Enable / disable. Enabling past DESK_BOTS_MAX is refused (409) — the cap is per platform, not per desk. */
export async function setDeskBotEnabled(slug: string, enabled: boolean, actorId: string | null): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { db } = await import('./db');
  const { deskBots } = await import('@shared/schema');
  try {
    if (enabled) {
      const max = deskBotsMax();
      const [{ n }] = await db.select({ n: count() }).from(deskBots).where(and(eq(deskBots.enabled, true), ne(deskBots.traderSlug, slug)));
      if (Number(n) >= max) return { ok: false, status: 409, error: `The platform runs at most ${max} desk bot${max === 1 ? '' : 's'} at once and that many are on. Ask Malik to free a slot.` };
      const base = await platformConfig();
      const current = await readDeskBot(slug);
      await db.insert(deskBots).values({ traderSlug: slug, config: current.config ?? defaultDeskBotConfig(base), enabled: true, enabledAt: new Date(), updatedBy: actorId })
        .onConflictDoUpdate({ target: deskBots.traderSlug, set: { enabled: true, enabledAt: new Date(), updatedBy: actorId, updatedAt: new Date() } });
    } else {
      await db.update(deskBots).set({ enabled: false, updatedBy: actorId, updatedAt: new Date() }).where(eq(deskBots.traderSlug, slug));
    }
    return { ok: true };
  } catch (e) {
    if (isMissingTable(e)) throw new DeskBotsUnavailable();
    throw e;
  }
}

export async function listDeskBots(): Promise<DeskBotState[]> {
  const { db } = await import('./db');
  const { deskBots } = await import('@shared/schema');
  const base = await platformConfig();
  try {
    const rows = await db.select().from(deskBots).orderBy(asc(deskBots.traderSlug));
    return rows.map((row) => ({
      slug: row.traderSlug, enabled: row.enabled, enabledAt: row.enabledAt ? new Date(row.enabledAt).toISOString() : null,
      config: normalizeStoredDeskConfig(row.config, base), updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
      updatedBy: row.updatedBy ?? null, exists: true,
    }));
  } catch (e) {
    if (isMissingTable(e)) throw new DeskBotsUnavailable();
    throw e;
  }
}

// ─── Running desk bots ───────────────────────────────────────

async function deskWatchlist(traderId: string): Promise<Set<string>> {
  const { db } = await import('./db');
  const { traderWatchlistItems } = await import('@shared/schema');
  const rows = await db.select({ symbol: traderWatchlistItems.symbol }).from(traderWatchlistItems).where(eq(traderWatchlistItems.traderId, traderId));
  return new Set(rows.map((r) => r.symbol.toUpperCase()));
}

function etMinutesNow(d = new Date()): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const v = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return (v('hour') % 24) * 60 + v('minute');
}

/** The BotOwner a desk bot runs as — its own book plus its own entry rules. */
export async function deskOwner(trader: Pick<Trader, 'id' | 'slug' | 'name'>, cfg: DeskBotConfig) {
  const watchlist = cfg.universe === 'watchlist' ? await deskWatchlist(trader.id) : new Set<string>();
  return {
    userId: deskBotOwnerId(trader.slug),
    portfolioName: deskBotPortfolioName(trader.name),
    label: `Desk bot ${trader.slug}`,
    primary: false as const,
    entryCheck: (pick: any, idea: any) => deskEntryCheck(cfg, pick, idea, { etMinutes: etMinutesNow(), watchlist }),
  };
}

/** One cycle of every enabled desk bot (capped), one after another. Never throws. */
export async function runDeskBots(origin: string): Promise<{ ran: string[]; skipped: string[] }> {
  const out = { ran: [] as string[], skipped: [] as string[] };
  if (!deskAdminsEnabled()) return out;
  let rows: DeskBotState[];
  try { rows = await listDeskBots(); } catch (e) {
    if (!(e instanceof DeskBotsUnavailable)) logger.warn('[DESK-BOTS] list failed:', e);
    return out;
  }
  const max = deskBotsMax();
  const run = deskBotsToRun(rows.map((r) => ({ ...r, traderSlug: r.slug })), max);
  out.skipped = rows.filter((r) => r.enabled && !run.some((x) => x.slug === r.slug)).map((r) => r.slug);
  if (out.skipped.length) logger.warn(`[DESK-BOTS] over DESK_BOTS_MAX=${max}: not running ${out.skipped.join(', ')}`);
  const { getTraderBySlug } = await import('./journal-sources');
  const { DEFAULT_BOT_CONFIG, runDeskBotCycle } = await import('./quant-bot');
  for (const r of run) {
    try {
      const trader = await getTraderBySlug(r.slug);
      if (!trader) { out.skipped.push(r.slug); continue; }
      const owner = await deskOwner(trader, r.config);
      const res = await runDeskBotCycle(r.slug, deskEngineConfig(r.config, DEFAULT_BOT_CONFIG), owner, origin);
      out.ran.push(r.slug);
      logger.info(`🤖 [DESK-BOT ${r.slug}] ${origin}: ${res.error ?? `+${res.opened.length} opened, -${res.closed.length} closed, ${res.openCount} open`}`);
    } catch (err) {
      logger.error(`[DESK-BOT ${r.slug}] ${origin} cycle failed:`, err);
    }
  }
  return out;
}

// ─── Status (read-only; never creates a book, never re-prices) ─────────

export async function deskBotStatus(trader: Pick<Trader, 'id' | 'slug' | 'name'>) {
  const state = await readDeskBot(trader.slug).catch((e) => (e instanceof DeskBotsUnavailable ? null : Promise.reject(e)));
  const { findDeskBotPortfolio, deskBotLastCycle } = await import('./quant-bot');
  const owner = { userId: deskBotOwnerId(trader.slug), portfolioName: deskBotPortfolioName(trader.name), label: trader.slug, primary: false };
  const pf: any = await findDeskBotPortfolio(owner);
  const base = { setUp: !!state, enabled: state?.enabled ?? false, lastCycle: deskBotLastCycle(trader.slug), startingCapital: DESK_BOT_STARTING_CAPITAL };
  if (!pf?.id) return { ...base, portfolio: null, cash: null, totalValue: null, realizedPnL: 0, unrealizedPnL: null, open: [], closed: [], wins: 0, losses: 0 };
  const { db } = await import('./db');
  const { paperPositions } = await import('@shared/schema');
  const rows: any[] = await db.select().from(paperPositions).where(eq(paperPositions.portfolioId, pf.id));
  const now = Date.now();
  let positionsValue = 0, unreal = 0, unmarked = 0, realized = 0, wins = 0, losses = 0;
  const open: any[] = [], closed: any[] = [];
  for (const x of rows) {
    const mult = x.assetType === 'option' ? 100 : 1;
    if (x.status === 'closed') {
      const r = Number(x.realizedPnL ?? 0);
      realized += r; if (r > 0) wins++; else if (r < 0) losses++;
      closed.push({ id: x.id, symbol: x.symbol, optionType: x.optionType, strikePrice: x.strikePrice, expiryDate: x.expiryDate, quantity: x.quantity, entryPrice: x.entryPrice, exitPrice: x.exitPrice, exitTime: x.exitTime, exitReason: x.exitReason, realizedPnL: x.realizedPnL });
      continue;
    }
    const marked = x.currentPrice != null && Number.isFinite(Number(x.currentPrice)) && !!x.lastPriceUpdate;
    positionsValue += Number(marked ? x.currentPrice : x.entryPrice) * Number(x.quantity) * mult;
    if (marked) unreal += (Number(x.currentPrice) - Number(x.entryPrice)) * Number(x.quantity) * mult;
    else unmarked++;
    const age = marked ? Math.max(0, Math.round((now - Date.parse(String(x.lastPriceUpdate))) / 60_000)) : null;
    open.push({ id: x.id, symbol: x.symbol, optionType: x.optionType, strikePrice: x.strikePrice, expiryDate: x.expiryDate, quantity: x.quantity, entryPrice: x.entryPrice, entryTime: x.entryTime, currentPrice: marked ? x.currentPrice : null, markAgeMin: Number.isFinite(age as number) ? age : null, unrealizedPnL: marked ? x.unrealizedPnL : null });
  }
  closed.sort((a, b) => Date.parse(b.exitTime ?? 0) - Date.parse(a.exitTime ?? 0));
  const cash = Number(pf.cashBalance ?? 0);
  return {
    ...base,
    portfolio: { id: pf.id, name: pf.name, createdAt: pf.createdAt },
    cash: Math.round(cash * 100) / 100,
    totalValue: Math.round((cash + positionsValue) * 100) / 100,
    realizedPnL: Math.round(realized * 100) / 100,
    unrealizedPnL: open.length - unmarked > 0 ? Math.round(unreal * 100) / 100 : open.length ? null : 0,
    open, closed: closed.slice(0, 25), wins, losses,
  };
}

/** The desk's own journal book, summarised (journal_trades under trader:<id>). */
export async function deskBookStats(trader: Pick<Trader, 'id'>) {
  const { db } = await import('./db');
  const { journalTrades } = await import('@shared/schema');
  const { traderOwnerId } = await import('@shared/journal-sources');
  const rows = await db.select({ status: journalTrades.status, outcome: journalTrades.outcome, pnl: journalTrades.realizedPnL })
    .from(journalTrades).where(eq(journalTrades.userId, traderOwnerId(trader.id)));
  let open = 0, closed = 0, wins = 0, losses = 0, pnl = 0;
  for (const r of rows) {
    if (r.status === 'open') { open++; continue; }
    closed++;
    if (r.outcome === 'win') wins++; else if (r.outcome === 'loss') losses++;
    pnl += Number(r.pnl ?? 0);
  }
  return { trades: rows.length, open, closed, wins, losses, winRate: wins + losses ? Math.round((wins / (wins + losses)) * 1000) / 10 : null, realizedPnL: Math.round(pnl * 100) / 100 };
}
