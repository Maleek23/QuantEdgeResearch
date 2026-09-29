/**
 * Journal sources (server) — who is asking, which book they may read or write,
 * and the rows of that book in the journal's wire shape.
 *
 *   mine            journal_trades where user_id = the signed-in user
 *   bot             paper_positions of the Quant Bot's portfolio (read-only)
 *   desk            trade_ideas published since OUTCOME_BASELINE_DATE, each scored
 *                   as a trade at a stated unit size (read-only)
 *   trader:<slug>   journal_trades where user_id = trader:<traders.id>
 *
 * Read-only books are mapped, never copied: the journal reads the bot's ledger
 * and the idea table directly, so they cannot drift from their sources.
 */
import type { Request } from 'express';
import { and, asc, eq, gte, inArray, isNull, ne, or } from 'drizzle-orm';
import { db } from './db';
import { storage } from './storage';
import {
  journalNotes, paperPortfolios, paperPositions, tradeIdeas, traders,
  type JournalTrade, type Trader,
} from '@shared/schema';
import { OUTCOME_BASELINE_DATE } from '@shared/constants';
import {
  DESK_STOCK_NOTIONAL, assetOf, mapDeskIdea, minutesBetween, outcomeOf, r2, type DeskIdea, type JournalWireRow,
} from './journal-row-maps';
import {
  journalKindOf, traderOwnerId, traderSlugOf,
  type JournalKey, type JournalSourceMeta,
} from '@shared/journal-sources';

// ─── Who is asking ───────────────────────────────────────────

export interface JournalActor {
  userId: string | null;
  isAdmin: boolean;
}

const isDevBypass = () => process.env.NODE_ENV !== 'production' && !process.env.REPL_ID;

function isAdminUser(user: { email?: string | null; subscriptionTier?: string | null } | null | undefined): boolean {
  if (!user) return false;
  const adminEmail = process.env.ADMIN_EMAIL;
  return (!!adminEmail && !!user.email && user.email.toLowerCase() === adminEmail.toLowerCase()) || user.subscriptionTier === 'admin';
}

/**
 * The signed-in user. Journal routes used to read `req.user?.id`, which the
 * session login never sets — so every user's rows landed under 'default'. The
 * id now comes from the user requireBetaAccess loaded, then the session.
 * Local dev (where requireBetaAccess is bypassed) with no session falls back
 * to the historical 'default' owner and is treated as admin, dev only.
 */
export async function journalActor(req: Request): Promise<JournalActor> {
  const beta = (req as any).betaUser;
  if (beta?.id) return { userId: String(beta.id), isAdmin: isAdminUser(beta) };
  const sessionId = (req as any).session?.userId ?? (req as any).user?.claims?.sub;
  if (sessionId) {
    const user = await storage.getUser(String(sessionId)).catch(() => undefined);
    return { userId: String(sessionId), isAdmin: isAdminUser(user) || (isDevBypass() && !user) };
  }
  if (isDevBypass()) return { userId: 'default', isAdmin: true };
  return { userId: null, isAdmin: false };
}

// ─── Traders ─────────────────────────────────────────────────

export async function listTraders(): Promise<Trader[]> {
  return db.select().from(traders).orderBy(asc(traders.createdAt), asc(traders.slug));
}

export async function getTraderBySlug(slug: string): Promise<Trader | null> {
  const [t] = await db.select().from(traders).where(eq(traders.slug, slug)).limit(1);
  return t ?? null;
}

export function canWriteTrader(actor: JournalActor, trader: Pick<Trader, 'linkedUserId'>): boolean {
  return actor.isAdmin || (!!actor.userId && trader.linkedUserId === actor.userId);
}

// ─── Resolution ──────────────────────────────────────────────

export interface ResolvedJournal {
  key: JournalKey;
  kind: ReturnType<typeof journalKindOf>;
  label: string;
  /** journal_trades.user_id for writable books (mine / trader). */
  ownerId: string | null;
  trader: Trader | null;
  readOnly: boolean;
  canWrite: boolean;
}

export class JournalAccessError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function resolveJournal(actor: JournalActor, key: JournalKey): Promise<ResolvedJournal> {
  const kind = journalKindOf(key);
  if (kind === 'mine') {
    if (!actor.userId) throw new JournalAccessError(401, 'Sign in to open your journal');
    return { key, kind, label: 'Mine', ownerId: actor.userId, trader: null, readOnly: false, canWrite: true };
  }
  if (kind === 'bot') return { key, kind, label: 'Bot', ownerId: null, trader: null, readOnly: true, canWrite: false };
  if (kind === 'desk') return { key, kind, label: 'Trade desk', ownerId: null, trader: null, readOnly: true, canWrite: false };
  const trader = await getTraderBySlug(traderSlugOf(key)!);
  if (!trader) throw new JournalAccessError(404, 'No such trader');
  const canWrite = canWriteTrader(actor, trader);
  return { key, kind, label: trader.name, ownerId: traderOwnerId(trader.id), trader, readOnly: !canWrite, canWrite };
}

/** Writable owner id for a mutation, or a 403/404 — used by every journal write. */
export async function writableOwner(actor: JournalActor, key: JournalKey): Promise<ResolvedJournal & { ownerId: string }> {
  const j = await resolveJournal(actor, key);
  if (!j.canWrite || !j.ownerId) {
    throw new JournalAccessError(403, j.kind === 'trader'
      ? `Only an admin or ${j.label} can change ${j.label}'s journal`
      : `The ${j.label} journal is read-only — it is computed from its source ledger`);
  }
  return j as ResolvedJournal & { ownerId: string };
}

function ago(iso: string | null | undefined, now: number): string {
  if (!iso) return 'time unknown';
  const m = Math.round((now - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(m)) return 'time unknown';
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
}

// ─── Bot: the Quant Bot's paper ledger ───────────────────────

async function loadBot(now: number): Promise<{ rows: JournalWireRow[]; meta: Partial<JournalSourceMeta> }> {
  const { BOT_PORTFOLIO_NAME } = await import('./quant-bot');
  const [portfolio] = await db.select().from(paperPortfolios).where(eq(paperPortfolios.name, BOT_PORTFOLIO_NAME)).limit(1);
  if (!portfolio) {
    return { rows: [], meta: { basis: `Quant Bot paper ledger — the "${BOT_PORTFOLIO_NAME}" portfolio does not exist yet (the bot has not run a cycle)` } };
  }
  const positions = await db.select().from(paperPositions).where(eq(paperPositions.portfolioId, portfolio.id));
  const ideaIds = [...new Set(positions.map((p) => p.tradeIdeaId).filter((x): x is string => !!x))];
  const ideas = ideaIds.length
    ? await db.select({ id: tradeIdeas.id, source: tradeIdeas.source }).from(tradeIdeas).where(inArray(tradeIdeas.id, ideaIds))
    : [];
  const sourceOf = new Map(ideas.map((i) => [i.id, i.source]));

  let unpriced = 0;
  const rows: JournalWireRow[] = [];
  for (const p of positions) {
    const closed = p.status === 'closed';
    if (closed && (p.realizedPnL == null || !Number.isFinite(p.realizedPnL))) { unpriced++; continue; }
    const pnl = closed ? r2(p.realizedPnL!) : null;
    const option = p.assetType === 'option';
    const thesis = option && p.direction === 'short' ? 'bearish thesis' : option ? 'bullish thesis' : null;
    const notes = [
      p.entryReason ? `Entry: ${p.entryReason}` : null,
      thesis ? `Bought ${p.optionType ?? 'option'} contract (${thesis}); P&L is the contract's.` : null,
      p.targetPrice != null || p.stopLoss != null ? `Plan: target ${p.targetPrice ?? '—'} · stop ${p.stopLoss ?? '—'}` : null,
      closed ? `Exit: ${p.exitReason ?? 'reason not recorded'}` : p.currentPrice != null
        ? `Open — last mark ${p.currentPrice} (${ago(p.lastPriceUpdate, now)}, not live)` : 'Open — no mark recorded yet',
    ].filter(Boolean).join('\n');
    rows.push({
      id: `bot:${p.id}`,
      symbol: p.symbol,
      assetType: assetOf(p.assetType),
      // Journal convention: direction is the side of the instrument held. Every bot
      // option is a bought contract (long), whatever the thesis on the underlying.
      direction: option ? 'long' : p.direction === 'short' ? 'short' : 'long',
      optionType: (p.optionType as 'call' | 'put' | null) ?? null,
      strikePrice: p.strikePrice ?? null,
      expiryDate: p.expiryDate ?? null,
      quantity: p.quantity,
      entryPrice: p.entryPrice,
      exitPrice: closed ? p.exitPrice ?? null : null,
      fees: 0,
      entryTime: p.entryTime,
      exitTime: closed ? p.exitTime ?? null : null,
      holdingMinutes: closed ? minutesBetween(p.entryTime, p.exitTime) : null,
      realizedPnL: pnl,
      realizedPnLPercent: closed ? p.realizedPnLPercent ?? null : null,
      grossPnL: pnl,
      status: closed ? 'closed' : 'open',
      outcome: outcomeOf(pnl),
      notes,
      emotion: null,
      setupType: (p.tradeIdeaId && sourceOf.get(p.tradeIdeaId)) || null,
      mistakeTag: null,
      rating: null,
      screenshot: null,
      importBatchId: null,
      broker: 'quant-bot',
    });
  }
  return {
    rows,
    meta: {
      basis: `Quant Bot paper ledger — every fill in the "${BOT_PORTFOLIO_NAME}" portfolio (paper_positions), at the bot's own size`,
      sizing: 'Bot-sized paper fills; fees and slippage are not modelled. Setup = the engine that published the signal.',
      excluded: unpriced ? [{ count: unpriced, reason: 'closed without a recorded P&L' }] : [],
    },
  };
}

async function loadDesk(): Promise<{ rows: JournalWireRow[]; meta: Partial<JournalSourceMeta> }> {
  const ideas = await db.select({
    id: tradeIdeas.id, symbol: tradeIdeas.symbol, assetType: tradeIdeas.assetType, direction: tradeIdeas.direction,
    entryPrice: tradeIdeas.entryPrice, targetPrice: tradeIdeas.targetPrice, stopLoss: tradeIdeas.stopLoss,
    riskRewardRatio: tradeIdeas.riskRewardRatio, optionType: tradeIdeas.optionType, strikePrice: tradeIdeas.strikePrice,
    expiryDate: tradeIdeas.expiryDate, entryPremium: tradeIdeas.entryPremium, exitPremium: tradeIdeas.exitPremium,
    optionPercentGain: tradeIdeas.optionPercentGain, exitPrice: tradeIdeas.exitPrice, percentGain: tradeIdeas.percentGain,
    outcomeStatus: tradeIdeas.outcomeStatus, resolutionReason: tradeIdeas.resolutionReason, exitDate: tradeIdeas.exitDate,
    timestamp: tradeIdeas.timestamp, source: tradeIdeas.source, catalyst: tradeIdeas.catalyst, genConvictionBand: tradeIdeas.genConvictionBand,
  }).from(tradeIdeas).where(and(
    gte(tradeIdeas.timestamp, OUTCOME_BASELINE_DATE),
    ne(tradeIdeas.status, 'draft'),
    or(eq(tradeIdeas.excludeFromTraining, false), isNull(tradeIdeas.excludeFromTraining)),
  ));

  const rows: JournalWireRow[] = [];
  const excluded = new Map<string, number>();
  for (const i of ideas) {
    const res = mapDeskIdea(i as DeskIdea);
    if ('row' in res) rows.push(res.row);
    else excluded.set(res.excluded, (excluded.get(res.excluded) ?? 0) + 1);
  }
  return {
    rows,
    meta: {
      basis: `Trade desk — every idea published since ${OUTCOME_BASELINE_DATE} (clean-era baseline), each scored as a trade from its published entry`,
      sizing: `Unit-sized: 1 contract per option idea at its recorded premiums; $${DESK_STOCK_NOTIONAL.toLocaleString()} notional per stock/crypto idea. Journal win = positive P&L; the canonical hit-target/hit-stop rate is on Track record. Setup = publishing engine.`,
      excluded: [...excluded.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    },
  };
}

// ─── Loader ──────────────────────────────────────────────────

export async function loadJournal(j: ResolvedJournal): Promise<{ rows: JournalWireRow[]; meta: JournalSourceMeta }> {
  const now = Date.now();
  const base = { key: j.key, kind: j.kind, label: j.label, readOnly: j.readOnly, canWrite: j.canWrite, asOf: new Date(now).toISOString() };
  if (j.kind === 'bot') {
    const { rows, meta } = await loadBot(now);
    return { rows, meta: { ...base, basis: meta.basis!, sizing: meta.sizing ?? null, excluded: meta.excluded ?? [] } };
  }
  if (j.kind === 'desk') {
    const { rows, meta } = await loadDesk();
    return { rows, meta: { ...base, basis: meta.basis!, sizing: meta.sizing ?? null, excluded: meta.excluded ?? [] } };
  }
  const rows = (await storage.getJournalTrades(j.ownerId!)) as unknown as JournalWireRow[];
  const basis = j.kind === 'mine'
    ? 'Your journal — trades you logged, imported from a broker CSV, or synced from Alpaca'
    : `${j.label}'s journal — trades imported from ${j.trader?.source ?? 'their posts'}${j.trader?.handle ? ` (${j.trader.handle})` : ''} or logged by an admin`;
  return { rows, meta: { ...base, basis, sizing: j.kind === 'trader' ? 'Where a post states no size, the trade is journaled as 1 contract/share (flagged in its notes).' : null, excluded: [] } };
}

export async function loadJournalNotes(j: ResolvedJournal) {
  if (!j.ownerId) return [];
  return db.select().from(journalNotes).where(eq(journalNotes.ownerId, j.ownerId)).orderBy(asc(journalNotes.postedAt));
}
