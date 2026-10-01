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

export type DeskUniverse = 'board' | 'watchlist';

/** What a desk admin may change about their own bot. Everything else is platform-set. */
export interface DeskBotConfig {
  /** Raw conviction floor (confluence points). */
  minConviction: number;
  maxOpen: number;
  riskPerTradePct: number;
  maxRiskDollars: number;
  maxDebitDollars: number;
  /** Chase guard: refuse a signal already this far entry → T1. */
  maxProgressPct: number;
  minUnderlyingRR: number;
  minContractRoiAtT1Pct: number;
  /** Refuse an idea whose underlying stop is closer than this to entry (stop width = #1 loss driver). */
  minStopWidthPct: number;
  allowLongs: boolean;
  allowShorts: boolean;
  /** Index 0DTE scalps (SPX/SPY/QQQ contracts the scalp engine picked). */
  allowIndex0dte: boolean;
  /** 'board' = every published pick; 'watchlist' = only names on the desk's own watchlist. */
  universe: DeskUniverse;
  blockedSymbols: string[];
  /** New entries only inside this New York window (minutes after midnight). Exits always run. */
  entryStartEt: number;
  entryEndEt: number;
}

type NumKey = 'minConviction' | 'maxOpen' | 'riskPerTradePct' | 'maxRiskDollars' | 'maxDebitDollars' | 'maxProgressPct'
  | 'minUnderlyingRR' | 'minContractRoiAtT1Pct' | 'minStopWidthPct' | 'entryStartEt' | 'entryEndEt';

/**
 * Platform caps. Each range is inclusive. The direction of every bound keeps a
 * desk bot at least as strict as the platform bot: floors (conviction, R:R,
 * contract ROI, stop width, entry start) can only go up; ceilings (risk, debit,
 * positions, chase, entry end) can only come down.
 */
export const DESK_BOT_CAPS: Record<NumKey, { min: number; max: number; step: number; label: string; unit?: string }> = {
  minConviction:        { min: 18,  max: 40,  step: 1,    label: 'Minimum conviction (points)' },
  maxOpen:              { min: 1,   max: 5,   step: 1,    label: 'Max open positions' },
  riskPerTradePct:      { min: 0.25, max: 2,  step: 0.25, label: 'Risk per trade', unit: '%' },
  maxRiskDollars:       { min: 25,  max: 250, step: 5,    label: 'Max managed loss per trade', unit: '$' },
  maxDebitDollars:      { min: 25,  max: 300, step: 5,    label: 'Max debit per trade', unit: '$' },
  maxProgressPct:       { min: 5,   max: 35,  step: 1,    label: 'Chase guard (max % of the way to T1)', unit: '%' },
  minUnderlyingRR:      { min: 1,   max: 5,   step: 0.1,  label: 'Minimum reward:risk on the underlying' },
  minContractRoiAtT1Pct:{ min: 30,  max: 300, step: 5,    label: 'Minimum contract return at T1', unit: '%' },
  minStopWidthPct:      { min: 0.5, max: 15,  step: 0.1,  label: 'Minimum stop width (underlying)', unit: '%' },
  entryStartEt:         { min: 9 * 60 + 34, max: 15 * 60 + 30, step: 1, label: 'Entries from (ET)' },
  entryEndEt:           { min: 9 * 60 + 49, max: 15 * 60 + 54, step: 1, label: 'Entries until (ET)' },
};
export const DESK_BOT_MAX_BLOCKED = 50;
/** Every desk bot starts with a fresh 100K paper book, the size the platform bot trades. */
export const DESK_BOT_STARTING_CAPITAL = 100_000;
const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,11}$/;

/** The platform bot's config fields a desk default is cloned from. */
export interface PlatformBotConfigLike {
  minConviction: number; maxOpen: number; riskPerTradePct: number; maxRiskDollars: number; maxDebitDollars: number;
  maxProgressPct: number; minUnderlyingRR: number; minContractRoiAtT1Pct: number;
}

const clampTo = (k: NumKey, v: number) => Math.min(DESK_BOT_CAPS[k].max, Math.max(DESK_BOT_CAPS[k].min, v));

/** "Replica but fresh": the platform bot's current rules, clamped into the desk caps. */
export function defaultDeskBotConfig(base: PlatformBotConfigLike): DeskBotConfig {
  return {
    minConviction: clampTo('minConviction', base.minConviction),
    maxOpen: clampTo('maxOpen', base.maxOpen),
    riskPerTradePct: clampTo('riskPerTradePct', base.riskPerTradePct),
    maxRiskDollars: clampTo('maxRiskDollars', base.maxRiskDollars),
    maxDebitDollars: clampTo('maxDebitDollars', base.maxDebitDollars),
    maxProgressPct: clampTo('maxProgressPct', base.maxProgressPct),
    minUnderlyingRR: clampTo('minUnderlyingRR', base.minUnderlyingRR),
    minContractRoiAtT1Pct: clampTo('minContractRoiAtT1Pct', base.minContractRoiAtT1Pct),
    minStopWidthPct: DESK_BOT_CAPS.minStopWidthPct.min,
    allowLongs: true,
    allowShorts: true,
    allowIndex0dte: true,
    universe: 'board',
    blockedSymbols: [],
    entryStartEt: DESK_BOT_CAPS.entryStartEt.min,
    entryEndEt: DESK_BOT_CAPS.entryEndEt.max,
  };
}

/**
 * Validate a PATCH from the desk portal. Unknown keys and out-of-cap values are
 * refused with a reason (never silently clamped, so the trader sees why).
 */
export function parseDeskBotPatch(input: unknown, current: DeskBotConfig): { ok: true; value: DeskBotConfig; changed: string[] } | { ok: false; errors: string[] } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: ['Body must be an object'] };
  const b = input as Record<string, unknown>;
  const errors: string[] = [];
  const next: DeskBotConfig = { ...current, blockedSymbols: [...current.blockedSymbols] };
  const allowed = new Set<string>([...Object.keys(DESK_BOT_CAPS), 'allowLongs', 'allowShorts', 'allowIndex0dte', 'universe', 'blockedSymbols']);
  for (const k of Object.keys(b)) if (!allowed.has(k)) errors.push(`${k}: not a setting you can change`);

  for (const k of Object.keys(DESK_BOT_CAPS) as NumKey[]) {
    if (b[k] === undefined) continue;
    const v = b[k];
    const cap = DESK_BOT_CAPS[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) { errors.push(`${k}: must be a number`); continue; }
    if (v < cap.min || v > cap.max) { errors.push(`${k}: ${cap.label} must be between ${cap.min} and ${cap.max}`); continue; }
    (next as unknown as Record<string, number>)[k] = (k === 'maxOpen' || k === 'entryStartEt' || k === 'entryEndEt' || k === 'minConviction') ? Math.round(v) : v;
  }
  for (const k of ['allowLongs', 'allowShorts', 'allowIndex0dte'] as const) {
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
  if (next.entryEndEt - next.entryStartEt < 15) errors.push('The entry window must be at least 15 minutes long');
  if (errors.length) return { ok: false, errors };
  const changed = (Object.keys(next) as (keyof DeskBotConfig)[]).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(current[k]));
  return { ok: true, value: next, changed };
}

/**
 * A stored config read back: fill missing keys from the default and pull every
 * value inside today's caps (caps can tighten after a row was written).
 */
export function normalizeStoredDeskConfig(stored: unknown, base: PlatformBotConfigLike): DeskBotConfig {
  const d = defaultDeskBotConfig(base);
  const s = (stored && typeof stored === 'object' ? stored : {}) as Partial<DeskBotConfig>;
  const out: DeskBotConfig = { ...d };
  for (const k of Object.keys(DESK_BOT_CAPS) as NumKey[]) {
    const v = (s as Record<string, unknown>)[k];
    if (typeof v === 'number' && Number.isFinite(v)) (out as unknown as Record<string, number>)[k] = clampTo(k, v);
  }
  for (const k of ['allowLongs', 'allowShorts', 'allowIndex0dte'] as const) if (typeof s[k] === 'boolean') out[k] = s[k] as boolean;
  if (s.universe === 'board' || s.universe === 'watchlist') out.universe = s.universe;
  if (Array.isArray(s.blockedSymbols)) out.blockedSymbols = s.blockedSymbols.filter((x): x is string => typeof x === 'string' && SYMBOL_RE.test(x)).slice(0, DESK_BOT_MAX_BLOCKED);
  if (!out.allowLongs && !out.allowShorts) out.allowLongs = true;
  if (out.entryEndEt - out.entryStartEt < 15) { out.entryStartEt = d.entryStartEt; out.entryEndEt = d.entryEndEt; }
  return out;
}

/** The engine config a desk bot cycle runs with: desk choices + platform-fixed fields. */
export function deskEngineConfig<T extends PlatformBotConfigLike & { startingCapital: number }>(desk: DeskBotConfig, platform: T): T {
  return {
    ...platform,
    minConviction: desk.minConviction,
    maxOpen: desk.maxOpen,
    riskPerTradePct: desk.riskPerTradePct,
    maxRiskDollars: desk.maxRiskDollars,
    maxDebitDollars: desk.maxDebitDollars,
    maxProgressPct: desk.maxProgressPct,
    minUnderlyingRR: desk.minUnderlyingRR,
    minContractRoiAtT1Pct: desk.minContractRoiAtT1Pct,
    startingCapital: DESK_BOT_STARTING_CAPITAL,
  };
}

export interface DeskPickLike {
  symbol: string;
  direction?: string | null;
  entryPrice?: number | null;
  stopLoss?: number | null;
}
export interface DeskIdeaLike { source?: string | null; dataSourceUsed?: string | null; entryPrice?: number | null; stopLoss?: number | null }

/**
 * The desk's own entry rules, applied on top of — never instead of — every
 * platform gate (publish gates, loss rules, tape gate, spread/quote checks).
 */
export function deskEntryCheck(cfg: DeskBotConfig, pick: DeskPickLike, idea: DeskIdeaLike | null, ctx: { etMinutes: number; watchlist: ReadonlySet<string> }): { ok: true } | { ok: false; code: string; reason: string } {
  const sym = String(pick.symbol || '').toUpperCase();
  if (ctx.etMinutes < cfg.entryStartEt || ctx.etMinutes > cfg.entryEndEt) {
    return { ok: false, code: 'desk_window', reason: `outside the desk entry window (${fmtEt(cfg.entryStartEt)}–${fmtEt(cfg.entryEndEt)} ET)` };
  }
  const short = pick.direction === 'short';
  if (short && !cfg.allowShorts) return { ok: false, code: 'desk_no_shorts', reason: 'shorts are off for this desk' };
  if (!short && !cfg.allowLongs) return { ok: false, code: 'desk_no_longs', reason: 'longs are off for this desk' };
  const isIndexScalp = idea?.source === 'gex_scanner' && String(idea?.dataSourceUsed ?? '').startsWith('GEX_index_scalp_');
  if (isIndexScalp && !cfg.allowIndex0dte) return { ok: false, code: 'desk_no_0dte', reason: 'index 0DTE is off for this desk' };
  if (cfg.blockedSymbols.includes(sym)) return { ok: false, code: 'desk_blocked', reason: `${sym} is on the desk's block list` };
  if (cfg.universe === 'watchlist' && !ctx.watchlist.has(sym)) return { ok: false, code: 'desk_universe', reason: `${sym} is not on the desk watchlist` };
  const entry = Number(idea?.entryPrice ?? pick.entryPrice);
  const stop = Number(idea?.stopLoss ?? pick.stopLoss);
  if (!isIndexScalp && Number.isFinite(entry) && Number.isFinite(stop) && entry > 0) {
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
  'desk.passcode_set', 'desk.passcode_clear',
] as const;
