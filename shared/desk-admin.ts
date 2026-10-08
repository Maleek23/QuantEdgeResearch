/**
 * Desk admins (docs/DESK_ADMINS.md) — the pure rules, shared by server, client
 * and scripts/test-desk-admins.ts. No DB, no env.
 *
 * A desk admin is a normal signed-in user linked to ONE trader book
 * (traders.linked_user_id). They run their own desk: their bot's config within
 * platform caps, their book (passcode, import, notes), their watchlist. They are
 * not platform admins. The super-admin (ADMIN_EMAIL / admin tier) manages every
 * desk.
 */
import { TRADER_SLUG_RE } from './journal-sources';

export const DESK_SLUG_RE = TRADER_SLUG_RE;

// ─── Roles ───────────────────────────────────────────────────

export type DeskRole = 'super' | 'desk' | 'none';

export interface DeskAccess {
  role: DeskRole;
  userId: string | null;
  /** The one book a desk admin runs; null for super / none. */
  deskSlug: string | null;
}

export interface DeskTraderLink { slug: string; linkedUserId: string | null; createdAt?: Date | string | null }

/**
 * Who is asking. Super-admin wins; otherwise the user's linked trader book
 * (oldest first, so a stray second link never changes which desk they run).
 * A disabled account is 'none', whatever it is linked to.
 */
export function resolveDeskAccess(input: {
  userId: string | null;
  isSuperAdmin: boolean;
  disabled?: boolean;
  traders: DeskTraderLink[];
}): DeskAccess {
  const { userId } = input;
  if (!userId || input.disabled) return { role: 'none', userId: userId ?? null, deskSlug: null };
  if (input.isSuperAdmin) return { role: 'super', userId, deskSlug: null };
  const linked = input.traders
    .filter((t) => t.linkedUserId === userId && DESK_SLUG_RE.test(t.slug))
    .sort((a, b) => Date.parse(String(a.createdAt ?? 0)) - Date.parse(String(b.createdAt ?? 0)) || a.slug.localeCompare(b.slug));
  return linked.length ? { role: 'desk', userId, deskSlug: linked[0].slug } : { role: 'none', userId, deskSlug: null };
}

/** May this caller manage the desk `slug`? Super: any desk. Desk admin: their own only. */
export function canManageDesk(access: DeskAccess, slug: string): boolean {
  if (!DESK_SLUG_RE.test(slug)) return false;
  if (access.role === 'super') return true;
  return access.role === 'desk' && access.deskSlug === slug;
}

// ─── Bot config ──────────────────────────────────────────────
//
// A desk bot runs the platform bot's two-sleeve engine (shared/bot-sleeves.ts):
// a 0DTE/1DTE sleeve and a swing sleeve graded by NEXUS grade. The desk picks
// capacity, dollars and its own filters; everything else is platform-set.

export type DeskUniverse = 'board' | 'watchlist';

/** What a desk admin may change about their own bot. Everything else is platform-set. */
export interface DeskBotConfig {
  /** 0DTE / 1DTE sleeve capacity (0 = sleeve off). */
  zeroDteMax: number;
  /** Fixed premium risk per 0DTE trade, $. */
  zeroDteRiskUsd: number;
  /** Swing sleeve capacity (0 = sleeve off). */
  swingMax: number;
  swingRiskUsd: number;
  swingMaxDebitUsd: number;
  /** Minimum NEXUS grade score for a swing entry (65 = C). */
  swingMinGrade: number;
  /** Chase guard: refuse a swing signal already this far entry → T1. */
  maxProgressPct: number;
  minUnderlyingRR: number;
  minContractRoiAtT1Pct: number;
  /** Refuse an idea whose underlying stop is closer than this to entry (stop width = #1 loss driver). */
  minStopWidthPct: number;
  allowLongs: boolean;
  allowShorts: boolean;
  /** 'board' = every published idea; 'watchlist' = only names on the desk's own watchlist. */
  universe: DeskUniverse;
  blockedSymbols: string[];
  /** New entries only inside this New York window (minutes after midnight), on top of the sleeve windows. Exits always run. */
  entryStartEt: number;
  entryEndEt: number;
}

type NumKey = 'zeroDteMax' | 'zeroDteRiskUsd' | 'swingMax' | 'swingRiskUsd' | 'swingMaxDebitUsd' | 'swingMinGrade'
  | 'maxProgressPct' | 'minUnderlyingRR' | 'minContractRoiAtT1Pct' | 'minStopWidthPct' | 'entryStartEt' | 'entryEndEt';
const INT_KEYS = new Set<NumKey>(['zeroDteMax', 'swingMax', 'swingMinGrade', 'entryStartEt', 'entryEndEt']);

/**
 * Platform caps (inclusive). The direction of every bound keeps a desk bot at
 * least as strict as the platform bot's defaults: floors (grade, R:R, contract
 * ROI, stop width, entry start) only go up; ceilings (capacity, dollars, chase,
 * entry end) only come down. deskSleeveConfig() also never lets a desk be looser
 * than the platform bot's CURRENT env config.
 */
export const DESK_BOT_CAPS: Record<NumKey, { min: number; max: number; step: number; label: string; unit?: string }> = {
  zeroDteMax:           { min: 0,   max: 3,    step: 1,   label: '0DTE sleeve: max open' },
  zeroDteRiskUsd:       { min: 25,  max: 150,  step: 5,   label: '0DTE sleeve: risk per trade', unit: '$' },
  swingMax:             { min: 0,   max: 4,    step: 1,   label: 'Swing sleeve: max open' },
  swingRiskUsd:         { min: 50,  max: 500,  step: 10,  label: 'Swing sleeve: risk per trade', unit: '$' },
  swingMaxDebitUsd:     { min: 100, max: 1500, step: 50,  label: 'Swing sleeve: max debit per trade', unit: '$' },
  swingMinGrade:        { min: 65,  max: 95,   step: 1,   label: 'Swing sleeve: minimum NEXUS grade' },
  maxProgressPct:       { min: 5,   max: 35,   step: 1,   label: 'Chase guard (max % of the way to T1)', unit: '%' },
  minUnderlyingRR:      { min: 1,   max: 5,    step: 0.1, label: 'Minimum reward:risk on the underlying' },
  minContractRoiAtT1Pct:{ min: 30,  max: 300,  step: 5,   label: 'Minimum contract return at T1', unit: '%' },
  minStopWidthPct:      { min: 0.5, max: 15,   step: 0.1, label: 'Minimum stop width (underlying)', unit: '%' },
  entryStartEt:         { min: 9 * 60 + 31, max: 15 * 60 + 30, step: 1, label: 'Entries from (ET)' },
  entryEndEt:           { min: 9 * 60 + 46, max: 15 * 60 + 54, step: 1, label: 'Entries until (ET)' },
};
export const DESK_BOT_MAX_BLOCKED = 50;
/** Every desk bot starts with a fresh 100K paper book, the size the platform bot trades. */
export const DESK_BOT_STARTING_CAPITAL = 100_000;
const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,11}$/;

/** The platform bot's fields a desk default is cloned from (BotConfig + BotSleeveConfig). */
export interface PlatformBotConfigLike {
  maxProgressPct: number; minUnderlyingRR: number; minContractRoiAtT1Pct: number;
}
export interface PlatformSleevesLike {
  zeroDteMax: number; zeroDteRiskUsd: number; swingMax: number; swingRiskUsd: number; swingMaxDebitUsd: number; swingMinGrade: number;
  zeroDteWindows: Array<[number, number]>;
}

const clampTo = (k: NumKey, v: number) => Math.min(DESK_BOT_CAPS[k].max, Math.max(DESK_BOT_CAPS[k].min, v));

/** "Replica but fresh": the platform bot's current rules, clamped into the desk caps. */
export function defaultDeskBotConfig(base: PlatformBotConfigLike, sleeves: PlatformSleevesLike): DeskBotConfig {
  return {
    zeroDteMax: clampTo('zeroDteMax', sleeves.zeroDteMax),
    zeroDteRiskUsd: clampTo('zeroDteRiskUsd', sleeves.zeroDteRiskUsd),
    swingMax: clampTo('swingMax', sleeves.swingMax),
    swingRiskUsd: clampTo('swingRiskUsd', sleeves.swingRiskUsd),
    swingMaxDebitUsd: clampTo('swingMaxDebitUsd', sleeves.swingMaxDebitUsd),
    swingMinGrade: clampTo('swingMinGrade', sleeves.swingMinGrade),
    maxProgressPct: clampTo('maxProgressPct', base.maxProgressPct),
    minUnderlyingRR: clampTo('minUnderlyingRR', base.minUnderlyingRR),
    minContractRoiAtT1Pct: clampTo('minContractRoiAtT1Pct', base.minContractRoiAtT1Pct),
    minStopWidthPct: DESK_BOT_CAPS.minStopWidthPct.min,
    allowLongs: true,
    allowShorts: true,
    universe: 'board',
    blockedSymbols: [],
    entryStartEt: DESK_BOT_CAPS.entryStartEt.min,
    entryEndEt: DESK_BOT_CAPS.entryEndEt.max,
  };
}

const BOOL_KEYS = ['allowLongs', 'allowShorts'] as const;

/**
 * Validate a PATCH from the desk portal. Unknown keys and out-of-cap values are
 * refused with a reason (never silently clamped, so the trader sees why).
 */
export function parseDeskBotPatch(input: unknown, current: DeskBotConfig): { ok: true; value: DeskBotConfig; changed: string[] } | { ok: false; errors: string[] } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: ['Body must be an object'] };
  const b = input as Record<string, unknown>;
  const errors: string[] = [];
  const next: DeskBotConfig = { ...current, blockedSymbols: [...current.blockedSymbols] };
  const allowed = new Set<string>([...Object.keys(DESK_BOT_CAPS), ...BOOL_KEYS, 'universe', 'blockedSymbols']);
  for (const k of Object.keys(b)) if (!allowed.has(k)) errors.push(`${k}: not a setting you can change`);

  for (const k of Object.keys(DESK_BOT_CAPS) as NumKey[]) {
    if (b[k] === undefined) continue;
    const v = b[k];
    const cap = DESK_BOT_CAPS[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) { errors.push(`${k}: must be a number`); continue; }
    if (v < cap.min || v > cap.max) { errors.push(`${k}: ${cap.label} must be between ${cap.min} and ${cap.max}`); continue; }
    (next as unknown as Record<string, number>)[k] = INT_KEYS.has(k) ? Math.round(v) : v;
  }
  for (const k of BOOL_KEYS) {
    if (b[k] === undefined) continue;
    if (typeof b[k] !== 'boolean') { errors.push(`${k}: must be true or false`); continue; }
    next[k] = b[k] as boolean;
  }
  if (b.universe !== undefined) {
    if (b.universe !== 'board' && b.universe !== 'watchlist') errors.push("universe: 'board' or 'watchlist'");
    else next.universe = b.universe;
  }
  if (b.blockedSymbols !== undefined) {
    if (!Array.isArray(b.blockedSymbols) || b.blockedSymbols.length > DESK_BOT_MAX_BLOCKED) {
      errors.push(`blockedSymbols: a list of up to ${DESK_BOT_MAX_BLOCKED} tickers`);
    } else {
      const syms = b.blockedSymbols.map((s) => (typeof s === 'string' ? s.trim().toUpperCase().replace(/^\$/, '') : ''));
      const bad = syms.filter((s) => !SYMBOL_RE.test(s));
      if (bad.length) errors.push(`blockedSymbols: not tickers — ${bad.slice(0, 3).map((s) => s || '(blank)').join(', ')}`);
      else next.blockedSymbols = Array.from(new Set(syms)).sort();
    }
  }
  if (!next.allowLongs && !next.allowShorts) errors.push('Allow longs, shorts or both — a bot with neither never trades');
  if (next.zeroDteMax === 0 && next.swingMax === 0) errors.push('Turn on at least one sleeve — a bot with no capacity never trades (switch the bot off instead)');
  if (next.entryEndEt - next.entryStartEt < 15) errors.push('The entry window must be at least 15 minutes long');
  if (errors.length) return { ok: false, errors };
  const changed = (Object.keys(next) as (keyof DeskBotConfig)[]).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(current[k]));
  return { ok: true, value: next, changed };
}

/**
 * A stored config read back: fill missing keys from the default and pull every
 * value inside today's caps (caps can tighten after a row was written).
 */
export function normalizeStoredDeskConfig(stored: unknown, base: PlatformBotConfigLike, sleeves: PlatformSleevesLike): DeskBotConfig {
  const d = defaultDeskBotConfig(base, sleeves);
  const s = (stored && typeof stored === 'object' ? stored : {}) as Partial<DeskBotConfig>;
  const out: DeskBotConfig = { ...d };
  for (const k of Object.keys(DESK_BOT_CAPS) as NumKey[]) {
    const v = (s as Record<string, unknown>)[k];
    if (typeof v === 'number' && Number.isFinite(v)) (out as unknown as Record<string, number>)[k] = clampTo(k, v);
  }
  for (const k of BOOL_KEYS) if (typeof s[k] === 'boolean') out[k] = s[k] as boolean;
  if (s.universe === 'board' || s.universe === 'watchlist') out.universe = s.universe;
  if (Array.isArray(s.blockedSymbols)) out.blockedSymbols = s.blockedSymbols.filter((x): x is string => typeof x === 'string' && SYMBOL_RE.test(x)).slice(0, DESK_BOT_MAX_BLOCKED);
  if (!out.allowLongs && !out.allowShorts) out.allowLongs = true;
  if (out.entryEndEt - out.entryStartEt < 15) { out.entryStartEt = d.entryStartEt; out.entryEndEt = d.entryEndEt; }
  return out;
}

/**
 * The sleeve config a desk bot runs with: the platform's current sleeves with the
 * desk's choices applied — never looser than the platform (ceilings take the min,
 * floors the max). Retired-run time stops are the platform bot's alone.
 */
export function deskSleeveConfig<S extends PlatformSleevesLike & { timeStopRetired: boolean }>(desk: DeskBotConfig, platform: S): S {
  return {
    ...platform,
    zeroDteMax: Math.min(desk.zeroDteMax, platform.zeroDteMax),
    zeroDteRiskUsd: Math.min(desk.zeroDteRiskUsd, platform.zeroDteRiskUsd),
    swingMax: Math.min(desk.swingMax, platform.swingMax),
    swingRiskUsd: Math.min(desk.swingRiskUsd, platform.swingRiskUsd),
    swingMaxDebitUsd: Math.min(desk.swingMaxDebitUsd, platform.swingMaxDebitUsd),
    swingMinGrade: Math.max(desk.swingMinGrade, platform.swingMinGrade),
    timeStopRetired: false,
  };
}

/** The engine config a desk bot cycle runs with: desk choices + platform-fixed fields (spread, debit %, quote rules). */
export function deskEngineConfig<T extends PlatformBotConfigLike & { startingCapital: number; maxRiskDollars: number; maxDebitDollars: number }>(desk: DeskBotConfig, platform: T): T {
  return {
    ...platform,
    maxProgressPct: Math.min(desk.maxProgressPct, platform.maxProgressPct),
    minUnderlyingRR: Math.max(desk.minUnderlyingRR, platform.minUnderlyingRR),
    minContractRoiAtT1Pct: Math.max(desk.minContractRoiAtT1Pct, platform.minContractRoiAtT1Pct),
    maxRiskDollars: Math.min(desk.swingRiskUsd, platform.maxRiskDollars),
    maxDebitDollars: Math.min(desk.swingMaxDebitUsd, platform.maxDebitDollars),
    startingCapital: DESK_BOT_STARTING_CAPITAL,
  };
}

export interface DeskPickLike {
  symbol: string;
  direction?: string | null;
  entryPrice?: number | null;
  stopLoss?: number | null;
}
export interface DeskIdeaLike { source?: string | null; dataSourceUsed?: string | null; entryPrice?: number | null; stopLoss?: number | null; assetType?: string | null }

/**
 * The desk's own entry rules, applied on top of — never instead of — every
 * platform gate (sleeve windows and capacity, publish gates, loss rules, tape,
 * BTC-proxy shorts, one-side-per-symbol, executable-quote checks).
 */
export function deskEntryCheck(cfg: DeskBotConfig, pick: DeskPickLike, idea: DeskIdeaLike | null, ctx: { etMinutes: number; watchlist: ReadonlySet<string> }): { ok: true } | { ok: false; code: string; reason: string } {
  const sym = String(pick.symbol || '').toUpperCase();
  if (ctx.etMinutes < cfg.entryStartEt || ctx.etMinutes > cfg.entryEndEt) {
    return { ok: false, code: 'desk_window', reason: `outside the desk entry window (${fmtEt(cfg.entryStartEt)}–${fmtEt(cfg.entryEndEt)} ET)` };
  }
  const short = String(pick.direction ?? '').toLowerCase() === 'short';
  if (short && !cfg.allowShorts) return { ok: false, code: 'desk_no_shorts', reason: 'shorts are off for this desk' };
  if (!short && !cfg.allowLongs) return { ok: false, code: 'desk_no_longs', reason: 'longs are off for this desk' };
  if (cfg.blockedSymbols.includes(sym)) return { ok: false, code: 'desk_blocked', reason: `${sym} is on the desk's block list` };
  if (cfg.universe === 'watchlist' && !ctx.watchlist.has(sym)) return { ok: false, code: 'desk_universe', reason: `${sym} is not on the desk watchlist` };
  // Stop width is measured on the UNDERLYING plan. Contract-level (premium) stops — the 0DTE sleeve's — are not comparable.
  const entry = Number(idea?.entryPrice ?? pick.entryPrice);
  const stop = Number(idea?.stopLoss ?? pick.stopLoss);
  const underlyingPlan = !idea || idea.assetType !== 'option' || !String(idea.dataSourceUsed ?? '').startsWith('GEX_index_scalp_');
  if (underlyingPlan && Number.isFinite(entry) && Number.isFinite(stop) && entry > 0 && stop > 0) {
    const widthPct = (Math.abs(entry - stop) / entry) * 100;
    if (widthPct < cfg.minStopWidthPct) {
      return { ok: false, code: 'desk_stop_width', reason: `stop ${widthPct.toFixed(2)}% from entry is tighter than the desk minimum ${cfg.minStopWidthPct}%` };
    }
  }
  return { ok: true };
}

export function fmtEt(mins: number): string {
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Paper-portfolio owner id of a desk bot. Never a users.id, so no account cascade touches it. */
export function deskBotOwnerId(slug: string): string {
  if (!DESK_SLUG_RE.test(slug)) throw new Error('bad desk slug');
  return `desk-bot:${slug}`;
}
export function deskBotPortfolioName(name: string): string {
  return `Desk Bot · ${name.slice(0, 40)} · 100K`;
}

/** Which enabled desks run this cycle: oldest-enabled first, at most `max`. */
export function deskBotsToRun<T extends { traderSlug: string; enabled: boolean; enabledAt?: Date | string | null }>(rows: T[], max: number): T[] {
  return rows
    .filter((r) => r.enabled)
    .sort((a, b) => Date.parse(String(a.enabledAt ?? 0)) - Date.parse(String(b.enabledAt ?? 0)) || a.traderSlug.localeCompare(b.traderSlug))
    .slice(0, Math.max(0, max));
}

/** Audit actions written by desk admins (and the super-admin acting on a desk). */
export const DESK_AUDIT_ACTIONS = [
  'desk.assign', 'desk.unassign', 'desk.bot_config', 'desk.bot_enable', 'desk.bot_disable', 'desk.bot_run',
  'desk.passcode_set', 'desk.passcode_clear', 'desk.privacy',
] as const;

// ─── Privacy: trader books are private by default ───────────

/**
 * With DESK_ADMINS on, a trader book (its journal, watchlist, analysis, calls,
 * leaderboard row and every "I took this" attribution in it) is visible only to
 * the super-admin and the book's own desk admin — unless the desk admin opts in
 * to sharing it with the group (desk_bots.share_book). A passcode still locks a
 * shared book on top of this.
 */
export function traderBookVisible(
  actor: { userId: string | null; isAdmin: boolean },
  trader: { slug: string; linkedUserId: string | null },
  sharedWithGroup: boolean,
): boolean {
  // Confidential since 2026-10-07: a trader book is visible ONLY to the user it is
  // linked to — not to admins, not to the group (operator: "everyone has their own
  // account, confidentially"). `actor.isAdmin` / `sharedWithGroup` are kept in the
  // signature for callers but no longer widen visibility.
  void actor.isAdmin; void sharedWithGroup;
  return !!actor.userId && trader.linkedUserId === actor.userId;
}

// ─── "I took this": NEXUS idea → the taker's journal book ────

/** journal_trades.broker for a trade taken from a QuantEdge idea (no migration: broker is free text). */
export const QUANTEDGE_IDEA_BROKER = 'quantedge';
export type JournalOrigin = 'own_idea' | 'quantedge_idea';
export function journalOriginOf(row: { broker?: string | null }): JournalOrigin {
  return row.broker === QUANTEDGE_IDEA_BROKER ? 'quantedge_idea' : 'own_idea';
}
/** journal_trades.broker_order_id of a taken idea — one take per idea per book. */
export function tookIdeaKey(ideaId: string): string { return `idea:${ideaId}`; }

export interface TookIdeaSource {
  id: string; symbol: string; assetType?: string | null; direction?: string | null;
  optionType?: string | null; strikePrice?: number | null; expiryDate?: string | null;
  entryPrice?: number | null; entryPremium?: number | null; targetPrice?: number | null; stopLoss?: number | null;
  source?: string | null; timestamp?: string | null;
}

/**
 * The journal row for "I took this". Origin 'quantedge_idea' (broker
 * 'quantedge'), attribution (who took it, from which desk) in raw_csv_row.
 * The entry is the trader's fill when given; otherwise the PUBLISHED level,
 * stamped as such in the notes (never presented as their fill).
 */
export function buildTookIdeaTrade(idea: TookIdeaSource, o: {
  ownerId: string; takenBy: string; deskSlug: string | null; journalKey: string; nowIso: string;
  entryPrice?: unknown; quantity?: unknown; note?: unknown;
}): { ok: true; row: Record<string, unknown> } | { ok: false; error: string } {
  const isOption = idea.assetType === 'option' && !!idea.optionType;
  const fill = typeof o.entryPrice === 'number' && Number.isFinite(o.entryPrice) && o.entryPrice > 0 ? o.entryPrice : null;
  if (o.entryPrice !== undefined && o.entryPrice !== null && fill === null) return { ok: false, error: 'entryPrice must be a positive number' };
  const published = isOption ? (Number(idea.entryPremium) > 0 ? Number(idea.entryPremium) : null) : (Number(idea.entryPrice) > 0 ? Number(idea.entryPrice) : null);
  const entry = fill ?? published;
  if (!entry) return { ok: false, error: 'This idea has no published entry — enter your fill price' };
  let qty = 1;
  if (o.quantity !== undefined && o.quantity !== null) {
    if (typeof o.quantity !== 'number' || !Number.isFinite(o.quantity) || o.quantity <= 0 || o.quantity > 100_000) return { ok: false, error: 'quantity must be a positive number' };
    qty = o.quantity;
  }
  const note = typeof o.note === 'string' ? o.note.trim().slice(0, 500) : '';
  const assetType = isOption ? 'option' : idea.assetType === 'crypto' ? 'crypto' : idea.assetType === 'future' ? 'future' : 'stock';
  const direction = isOption ? 'long' : idea.direction === 'short' ? 'short' : 'long';
  const notes = [
    `Taken from a QuantEdge idea (${idea.source ?? 'NEXUS'}, published ${idea.timestamp ?? 'time unknown'}).`,
    fill ? `Entry ${fill} = your fill.` : `Entry ${entry} = the PUBLISHED ${isOption ? 'premium' : 'entry'}, not your fill — edit it to your fill.`,
    idea.targetPrice != null || idea.stopLoss != null ? `Published plan (underlying): target ${idea.targetPrice ?? '—'} · stop ${idea.stopLoss ?? '—'}` : null,
    note || null,
  ].filter(Boolean).join('\n');
  return {
    ok: true,
    row: {
      userId: o.ownerId,
      symbol: String(idea.symbol).toUpperCase(),
      assetType, direction,
      optionType: isOption ? idea.optionType : null,
      strikePrice: isOption ? idea.strikePrice ?? null : null,
      expiryDate: isOption ? idea.expiryDate ?? null : null,
      quantity: qty,
      entryPrice: entry,
      entryTime: o.nowIso,
      status: 'open',
      outcome: 'open',
      notes,
      setupType: idea.source ?? null,
      broker: QUANTEDGE_IDEA_BROKER,
      brokerOrderId: tookIdeaKey(idea.id),
      rawCsvRow: {
        origin: 'quantedge_idea', ideaId: idea.id, takenBy: o.takenBy, deskSlug: o.deskSlug, journal: o.journalKey,
        entryBasis: fill ? 'fill' : 'published', takenAt: o.nowIso,
      },
    },
  };
}
