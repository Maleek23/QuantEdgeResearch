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
import { and, asc, eq, gte, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from './db';
import { storage } from './storage';
import {
  journalNotes, tradeIdeas, traders,
  type JournalTrade, type Trader,
} from '@shared/schema';
import { OUTCOME_BASELINE_DATE } from '@shared/constants';
import { auditBotOptionFill } from '@shared/bot-fill-verification';
import { peakLine, readPeakSignal } from '@shared/option-peak';
import {
  DESK_STOCK_NOTIONAL, assetOf, deskVerificationMeta, mapDeskIdea, minutesBetween, outcomeOf, r2, verifyDeskRows,
  type DeskIdea, type JournalWireRow,
} from './journal-row-maps';
import { loadDeskVerifyLedger } from './desk-verify-ledger';
import {
  journalKindOf, traderOwnerId, traderSlugOf,
  type JournalKey, type JournalSourceMeta, type DeskVerificationMeta, type JournalExcludedRow,
} from '@shared/journal-sources';

// ─── Who is asking ───────────────────────────────────────────

export interface JournalActor {
  userId: string | null;
  isAdmin: boolean;
  /** Trader slugs whose passcode this session entered. */
  unlocked?: string[];
}

/** A trader book is locked when it has a passcode and the caller isn't admin, linked, or unlocked. */
export function isTraderLocked(actor: JournalActor, trader: Pick<Trader, 'slug' | 'passcodeHash' | 'linkedUserId'>): boolean {
  if (!trader.passcodeHash) return false;
  if (canWriteTrader(actor, trader)) return false;
  return !(actor.unlocked ?? []).includes(trader.slug);
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
  const raw = (req as any).session?.journalUnlocks;
  const unlocked: string[] = Array.isArray(raw) ? raw.filter((x: unknown) => typeof x === 'string') : [];
  const beta = (req as any).betaUser;
  if (beta?.id) return { userId: String(beta.id), isAdmin: isAdminUser(beta), unlocked };
  const sessionId = (req as any).session?.userId ?? (req as any).user?.claims?.sub;
  if (sessionId) {
    const user = await storage.getUser(String(sessionId)).catch(() => undefined);
    return { userId: String(sessionId), isAdmin: isAdminUser(user) || (isDevBypass() && !user), unlocked };
  }
  if (isDevBypass()) return { userId: 'default', isAdmin: true, unlocked };
  return { userId: null, isAdmin: false, unlocked };
}

// ─── Traders ─────────────────────────────────────────────────

/** The personal book is named after its owner: the trader linked to this user
 *  (e.g. "Malik"), else the user's first name, else "My journal". */
export async function personalBookLabel(userId: string | null): Promise<string> {
  if (!userId) return 'My journal';
  const linked = (await listTraders()).find((t) => t.linkedUserId === userId);
  if (linked) return linked.name;
  const user = await storage.getUser(userId).catch(() => undefined) as any;
  const first = typeof user?.firstName === 'string' ? user.firstName.trim() : '';
  return first || 'My journal';
}

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
    return { key, kind, label: await personalBookLabel(actor.userId), ownerId: actor.userId, trader: null, readOnly: false, canWrite: true };
  }
  if (kind === 'bot') return { key, kind, label: 'Quantinum Bot', ownerId: null, trader: null, readOnly: true, canWrite: false };
  if (kind === 'desk') return { key, kind, label: 'NEXUS ideas', ownerId: null, trader: null, readOnly: true, canWrite: false };
  const trader = await getTraderBySlug(traderSlugOf(key)!);
  if (!trader) throw new JournalAccessError(404, 'No such trader');
  // DESK_ADMINS: trader books are private by default (docs/DESK_ADMINS.md §Privacy) — a hidden book reads as missing.
  const { traderVisibilityFor } = await import('./desk-admin');
  if (!(await traderVisibilityFor(actor))(trader)) throw new JournalAccessError(404, 'No such trader');
  if (isTraderLocked(actor, trader)) throw new JournalAccessError(423, `locked:${trader.slug} — ${trader.name}'s journal is passcode-protected`);
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
  // EVERY run the bot has traded — not the first portfolio matching a name. Two
  // portfolios share the name "Quant Bot · 100K"; the old name lookup with
  // LIMIT 1 showed Run 2 (+$429) and hid Run 3 (−$3,500).
  const { loadBotLedger } = await import('./bot-ledger');
  const { runs, positions } = await loadBotLedger();
  if (!runs.length) {
    return { rows: [], meta: { basis: 'Quantinum Bot paper ledger — the bot owns no paper portfolio yet (it has not run a cycle)', runs: [] } };
  }
  const runOf = new Map(runs.map((r) => [r.id, r]));
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
    const measurement = option
      ? closed ? auditBotOptionFill(p) : { status: 'pending' as const, reason: 'open position — no realized outcome yet' }
      : { status: 'not_applicable' as const, reason: 'not an option fill' };
    const thesis = option && p.direction === 'short' ? 'bearish thesis' : option ? 'bullish thesis' : null;
    const run = runOf.get(p.portfolioId);
    const marked = !closed && p.currentPrice != null && !!p.lastPriceUpdate;
    const notes = [
      run ? `Run: ${run.label} (portfolio "${run.displayName}")` : null,
      p.entryReason ? `Entry: ${p.entryReason}` : null,
      thesis ? `Bought ${p.optionType ?? 'option'} contract (${thesis}); P&L is the contract's.` : null,
      p.targetPrice != null || p.stopLoss != null ? `Plan: target ${p.targetPrice ?? '—'} · stop ${p.stopLoss ?? '—'}` : null,
      closed ? `Exit: ${p.exitReason ?? 'reason not recorded'}` : p.currentPrice != null
        ? `Open — last mark ${p.currentPrice} (${ago(p.lastPriceUpdate, now)}, not live)` : 'Open — no mark recorded yet',
      option && closed ? `Fill: ${measurement.status === 'verified' ? 'verified fill' : 'unverified fill'} — ${measurement.reason}` : null,
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
      measurementStatus: measurement.status,
      measurementNote: measurement.reason,
      ...(option ? (() => { const pk = peakLine(readPeakSignal((p as any).entrySignals), closed ? p.exitPrice ?? null : null); return pk ? { peakLine: pk } : {}; })() : {}),
      notes,
      emotion: null,
      setupType: (p.tradeIdeaId && sourceOf.get(p.tradeIdeaId)) || null,
      mistakeTag: null,
      rating: null,
      screenshot: null,
      importBatchId: null,
      broker: 'quant-bot',
      runId: run?.id ?? null,
      runLabel: run?.label ?? null,
      mark: marked ? {
        price: p.currentPrice!,
        asOf: p.lastPriceUpdate!,
        unrealizedPnL: r2((p.currentPrice! - p.entryPrice) * p.quantity * (option ? 100 : 1) * (option || p.direction !== 'short' ? 1 : -1)),
      } : null,
    });
  }
  return {
    rows,
    meta: {
      basis: `Quantinum Bot paper ledger — every fill in all ${runs.length} of the bot's paper portfolios (${runs.map((r) => r.short).join(', ')}; paper_positions), at the bot's own size`,
      runs,
      sizing: 'Bot-sized paper fills; fees and slippage are not modelled. Setup = the engine that published the signal.',
      excluded: unpriced ? [{ count: unpriced, reason: 'closed without a recorded P&L' }] : [],
    },
  };
}

async function loadDesk(includeUnverified = false): Promise<{ rows: JournalWireRow[]; meta: Partial<JournalSourceMeta> }> {
  const ideas = await db.select({
    id: tradeIdeas.id, symbol: tradeIdeas.symbol, assetType: tradeIdeas.assetType, direction: tradeIdeas.direction,
    entryPrice: tradeIdeas.entryPrice, targetPrice: tradeIdeas.targetPrice, stopLoss: tradeIdeas.stopLoss,
    riskRewardRatio: tradeIdeas.riskRewardRatio, optionType: tradeIdeas.optionType, strikePrice: tradeIdeas.strikePrice,
    expiryDate: tradeIdeas.expiryDate, entryPremium: tradeIdeas.entryPremium, exitPremium: tradeIdeas.exitPremium,
    optionPercentGain: tradeIdeas.optionPercentGain, exitPrice: tradeIdeas.exitPrice, percentGain: tradeIdeas.percentGain,
    outcomeStatus: tradeIdeas.outcomeStatus, outcomeNotes: tradeIdeas.outcomeNotes,
    resolutionReason: tradeIdeas.resolutionReason, exitDate: tradeIdeas.exitDate,
    timestamp: tradeIdeas.timestamp, source: tradeIdeas.source, catalyst: tradeIdeas.catalyst, genConvictionBand: tradeIdeas.genConvictionBand,
    genConvictionScore: tradeIdeas.genConvictionScore, genScoringLayers: tradeIdeas.genScoringLayers,
    generationTimestamp: tradeIdeas.generationTimestamp, holdingPeriod: tradeIdeas.holdingPeriod, exitBy: tradeIdeas.exitBy,
    // Only the plan snapshot + the logged grade — the full JSON is large and this reads every desk row.
    convergenceSignalsJson: sql<unknown>`json_build_object('planSnapshot', (${tradeIdeas.convergenceSignalsJson})::jsonb -> 'planSnapshot')`,
    nexusGradeAtPublish: sql<{ letter?: string; score?: number } | null>`(${tradeIdeas.convergenceSignalsJson})::jsonb -> 'nexusGradeAtPublish'`,
    exitPremiumBasis: sql<string | null>`substring(${tradeIdeas.outcomeNotes} from '\\[exit-premium:(touch_bar|pass|withheld)\\]')`,
    // Only the [exit-time:…] tag, not the notes text (shared/exit-hit-time.ts).
    exitTimeSource: sql<string | null>`substring(${tradeIdeas.outcomeNotes} from '\\[exit-time:([a-z_]+)\\]')`,
    highestPriceReached: tradeIdeas.highestPriceReached, lowestPriceReached: tradeIdeas.lowestPriceReached,
    // Only the lifecycle state, not the whole analysis blob.
    executionState: sql<string | null>`${tradeIdeas.convergenceSignalsJson}->'executionAudit'->>'state'`,
    // Provenance for the integrity checks (shared/desk-integrity.ts).
    dataSourceUsed: tradeIdeas.dataSourceUsed, sessionContext: tradeIdeas.sessionContext,
  }).from(tradeIdeas).where(and(
    gte(tradeIdeas.timestamp, OUTCOME_BASELINE_DATE),
    ne(tradeIdeas.status, 'draft'),
    or(eq(tradeIdeas.excludeFromTraining, false), isNull(tradeIdeas.excludeFromTraining)),
  ));

  const pairs: { idea: DeskIdea; row: JournalWireRow }[] = [];
  const excluded = new Map<string, number>();
  const excludedRows: JournalExcludedRow[] = [];
  for (const i of ideas) {
    const res = mapDeskIdea(i as DeskIdea);
    if ('row' in res) pairs.push({ idea: i as DeskIdea, row: res.row });
    else {
      excluded.set(res.excluded, (excluded.get(res.excluded) ?? 0) + 1);
      excludedRows.push({ id: `desk:${i.id}`, symbol: i.symbol, entryTime: String(i.timestamp ?? ''), reason: res.excluded });
    }
  }
  // Audit 2026-10-06: the verified total counts only verified / integrity-checked
  // P&L. Operator rule 2026-10-07: every called trade is still SHOWN — unverified
  // closed rows ride along labelled (includeUnverified, the route default);
  // includeUnverified=false (?unverified=0, the public record) drops them.
  const ledger = loadDeskVerifyLedger();
  const split = verifyDeskRows(pairs, ledger);
  const verification = deskVerificationMeta(split, ledger, includeUnverified);
  const rows = includeUnverified ? [...split.counted, ...split.unverified] : split.counted;
  const u = verification.unverified;
  excludedRows.sort((a, b) => b.entryTime.localeCompare(a.entryTime));
  return {
    rows,
    meta: {
      basis: `NEXUS ideas — every idea NEXUS published since ${OUTCOME_BASELINE_DATE} (clean-era baseline), each scored as a trade from its published entry once its trigger was hit (untriggered ideas are listed as awaiting entry, with no P&L)`,
      sizing: `Unit-sized: 1 contract per option idea at its recorded premiums; $${DESK_STOCK_NOTIONAL.toLocaleString()} notional per stock/crypto idea. ` +
        (includeUnverified
          ? `Every called trade is shown. Net P&L (verified) counts ${ledger ? `bar-verified (ledger ${ledger.asOf.slice(0, 10)}) and ` : ''}integrity-checked rows${u.count ? `; ${u.count} unverified closed row${u.count === 1 ? '' : 's'} (recorded ${u.recordedPnL >= 0 ? '+' : '−'}$${Math.abs(u.recordedPnL).toLocaleString('en-US', { maximumFractionDigits: 0 })}) are listed with an amber "unverified" chip and shown separately as "incl. unverified"` : ''}. `
          : `Only verified P&L is counted: ${ledger ? `bar-verified by research/verify-nexus-book.ts (ledger ${ledger.asOf.slice(0, 10)}), ` : 'no bar-verification ledger on this server — '}rows passing every integrity check count${u.count ? `; ${u.count} closed row${u.count === 1 ? '' : 's'} (recorded ${u.recordedPnL >= 0 ? '+' : '−'}$${Math.abs(u.recordedPnL).toLocaleString('en-US', { maximumFractionDigits: 0 })}) are unverified and not counted` : ''}. `) +
        `Journal win = positive P&L; the canonical hit-target/hit-stop rate is on Track record. Setup = publishing engine.`,
      excluded: [...excluded.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
      excludedRows: excludedRows.slice(0, 5000),
      verification,
    },
  };
}

/**
 * The NEXUS ideas book as the default journal reads it (unverified rows split off),
 * for the public landing's verified record strip (server/public-showcase.ts).
 * Read-only; the caller summarises it with shared/landing-record.ts.
 */
export async function loadNexusBookForPublicRecord(): Promise<{ rows: JournalWireRow[]; verification: DeskVerificationMeta | undefined }> {
  const { rows, meta } = await loadDesk(false);
  return { rows, verification: meta.verification };
}

// ─── Loader ──────────────────────────────────────────────────

export async function loadJournal(j: ResolvedJournal, opts: { includeUnverified?: boolean } = {}): Promise<{ rows: JournalWireRow[]; meta: JournalSourceMeta }> {
  const now = Date.now();
  const base = { key: j.key, kind: j.kind, label: j.label, readOnly: j.readOnly, canWrite: j.canWrite, asOf: new Date(now).toISOString() };
  if (j.kind === 'bot') {
    const { rows, meta } = await loadBot(now);
    return { rows, meta: { ...base, basis: meta.basis!, sizing: meta.sizing ?? null, excluded: meta.excluded ?? [], runs: meta.runs ?? [] } };
  }
  if (j.kind === 'desk') {
    const { rows, meta } = await loadDesk(!!opts.includeUnverified);
    return { rows, meta: { ...base, basis: meta.basis!, sizing: meta.sizing ?? null, excluded: meta.excluded ?? [], excludedRows: meta.excludedRows ?? [], verification: meta.verification } };
  }
  // origin: 'quantedge_idea' for a trade taken from a NEXUS idea ("I took this"), else 'own_idea'.
  const { journalOriginOf } = await import('@shared/desk-admin');
  const rows = ((await storage.getJournalTrades(j.ownerId!)) as unknown as JournalWireRow[])
    .map((r) => ({ ...r, origin: journalOriginOf(r) }));
  const basis = j.kind === 'mine'
    ? 'Your journal — trades you logged, imported from a broker CSV, or synced from Alpaca'
    : `${j.label}'s journal — trades imported from ${j.trader?.source ?? 'their posts'}${j.trader?.handle ? ` (${j.trader.handle})` : ''} or logged by an admin`;
  return { rows, meta: { ...base, basis, sizing: j.kind === 'trader' ? 'Where a post states no size, the trade is journaled as 1 contract/share (flagged in its notes).' : null, excluded: [] } };
}

export async function loadJournalNotes(j: ResolvedJournal) {
  if (!j.ownerId) return [];
  return db.select().from(journalNotes).where(eq(journalNotes.ownerId, j.ownerId)).orderBy(asc(journalNotes.postedAt));
}
