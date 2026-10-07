/**
 * BOT SLEEVES — the Quantinum Bot's two books inside one paper portfolio, plus
 * the pure rules the cycle applies to them. No I/O; server/quant-bot.ts wires it.
 *
 * WHY (2026-10-01 diagnosis, research/bot-diagnose.ts)
 *   The bot opened nothing after 2026-09-25. One ranked list (the board's raw
 *   evidence score, floor 18) fed one capacity (maxOpen 10) and one contract path:
 *     · the evidence score is INVERTED on the honest record (docs/GRADE_AUDIT_2026-10-01.md,
 *       top third did worst) and index 0DTE plans carry a deliberately modest score,
 *       so the floor kept every 0DTE idea out;
 *     · the index-0DTE path refused anything not expiring TODAY (a 1DTE IWM fallback
 *       contract was "stale"); zero_dte_desk / gex_magnet ideas had no path at all;
 *     · swing contracts had to be 30–60 DTE (loss rule 4) under a $300 debit cap —
 *       almost no large-cap contract fits both;
 *     · pending-trigger refusals were counted but never said why.
 *
 * THE SLEEVES (each its own capacity)
 *   0dte    index & mega-cap 0–2 DTE ideas (index scalps, zero_dte_desk,
 *           zero_dte_flow, gex_magnet ≤ 2 DTE). Entry 09:31–11:30 ET (BOT_0DTE_START; +13:30–15:00
 *           with BOT_0DTE_AFTERNOON=1). Small fixed premium risk. Premium bracket:
 *           −40% stop · +50% arms a breakeven stop · +100% target · flat 15:45 ET.
 *   swing   NEXUS ideas ordered by the NEXUS grade (shared/nexus-grade.ts — the one
 *           grade every surface shows), independent of BOARD_SORT. The raw evidence
 *           score is logged, never used to select.
 *
 * HARD RULES (both sleeves): never both directions on one symbol (any run);
 * no same-day re-entry on a symbol after a stop-out; one position per symbol.
 *
 * Every refusal is tallied by reason (SkipTally) so a cycle that opens nothing
 * says exactly why.
 */
import { manageSignal, exitPolicyPlan, type ExitPolicyId } from './exit-policy';
import { windowFor, publishMsOf, etDay, type LifecycleInput } from './setup-lifecycle';
import { marketSessionAt, etClock, etHHMM } from './quote-freshness';
import { NEXUS_GRADE_POINTS, type NexusGrade } from './nexus-grade';

export type BotSleeve = '0dte' | 'swing';

export interface BotSleeveConfig {
  zeroDteMax: number;
  swingMax: number;
  /** Fixed premium risk per 0DTE trade, $ (debit × stop%). */
  zeroDteRiskUsd: number;
  /** Entry windows, ET minutes [start, end). */
  zeroDteWindows: Array<[number, number]>;
  zeroDteMaxDte: number;
  zeroDteUniverse: ReadonlySet<string>;
  premStopPct: number;
  premT1Pct: number;
  premT2Pct: number;
  /** ET minute at/after which every 0DTE-sleeve position is flattened. */
  flattenEt: number;
  /** Minimum NEXUS grade score for a swing entry (65 = C). */
  swingMinGrade: number;
  swingRiskUsd: number;
  swingMaxDebitUsd: number;
  /** Apply the stale-position time stop to retired runs' open contracts too. */
  timeStopRetired: boolean;
}

export const DEFAULT_ZERO_DTE_UNIVERSE = Object.freeze([
  // index
  'SPY', 'QQQ', 'IWM', 'SPX', 'XSP', 'NDX', 'DIA',
  // mega-cap
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'GOOG', 'TSLA', 'AVGO', 'AMD', 'NFLX',
]);

type Env = Record<string, string | undefined>;
const num = (v: string | undefined, d: number, lo: number, hi: number) => {
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const hhmm = (v: string | undefined, d: number) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : d;
};

export function readBotSleeveConfig(env: Env = {}): BotSleeveConfig {
  // BOT_0DTE_START (HH:MM ET, default 09:31 — operator 2026-10-06: take open-drive ideas from the open).
  const windows: Array<[number, number]> = [[hhmm(env.BOT_0DTE_START, 9 * 60 + 31), 11 * 60 + 30]];
  if (env.BOT_0DTE_AFTERNOON === '1' || env.BOT_0DTE_AFTERNOON === 'true') windows.push([13 * 60 + 30, 15 * 60]);
  const uni = String(env.BOT_0DTE_UNIVERSE ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  return {
    zeroDteMax: Math.round(num(env.BOT_0DTE_MAX, 3, 0, 20)),
    swingMax: Math.round(num(env.BOT_SWING_MAX, 4, 0, 30)),
    zeroDteRiskUsd: num(env.BOT_0DTE_RISK_USD, 150, 10, 5_000),
    zeroDteWindows: windows,
    zeroDteMaxDte: Math.round(num(env.BOT_0DTE_MAX_DTE, 2, 0, 5)),
    zeroDteUniverse: new Set(uni.length ? uni : DEFAULT_ZERO_DTE_UNIVERSE),
    premStopPct: num(env.BOT_0DTE_STOP_PCT, 40, 5, 95) / 100,
    premT1Pct: num(env.BOT_0DTE_T1_PCT, 50, 5, 500) / 100,
    premT2Pct: num(env.BOT_0DTE_T2_PCT, 100, 10, 1_000) / 100,
    flattenEt: hhmm(env.BOT_0DTE_FLATTEN_ET, 15 * 60 + 45),
    swingMinGrade: num(env.BOT_SWING_MIN_GRADE, 65, 0, 100),
    swingRiskUsd: num(env.BOT_SWING_RISK_USD, 500, 50, 10_000),
    swingMaxDebitUsd: num(env.BOT_SWING_MAX_DEBIT_USD, 1_500, 100, 20_000),
    timeStopRetired: env.BOT_TIME_STOP_RETIRED !== 'false',
  };
}

// ── clock ───────────────────────────────────────────────────────────────────

export function etMinutesOf(ms: number): number { return etClock(ms).minutes; }

export function in0dteWindow(nowMs: number, cfg: Pick<BotSleeveConfig, 'zeroDteWindows'>): boolean {
  const { dow, minutes } = etClock(nowMs);
  if (dow === 0 || dow === 6) return false;
  return cfg.zeroDteWindows.some(([a, b]) => minutes >= a && minutes < b);
}

/** Calendar days from the ET day of `nowMs` to an expiry (YYYY-MM-DD); null if unreadable. */
export function daysToExpiry(expiry: string | null | undefined, nowMs: number): number | null {
  const e = String(expiry ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e)) return null;
  return Math.round((Date.parse(`${e}T12:00:00Z`) - Date.parse(`${etDay(nowMs)}T12:00:00Z`)) / 86_400_000);
}

// ── 0DTE sleeve: which ideas belong to it ───────────────────────────────────

export type ZeroDteKind = 'index_scalp' | 'zero_dte_desk' | 'zero_dte_flow' | 'gex_magnet';

export interface ZeroDteIdeaLike {
  symbol: string;
  source?: string | null;
  dataSourceUsed?: string | null;
  optionType?: string | null;
  strikePrice?: number | null;
  expiryDate?: string | null;
  timestamp?: string | null;
  entryValidUntil?: string | null;
  exitBy?: string | null;
  outcomeStatus?: string | null;
}

export function zeroDteKindOf(idea: Pick<ZeroDteIdeaLike, 'source' | 'dataSourceUsed'>): ZeroDteKind | null {
  const src = String(idea.source ?? '').toLowerCase();
  if (src === 'gex_scanner' && String(idea.dataSourceUsed ?? '').startsWith('GEX_index_scalp_')) return 'index_scalp';
  if (src === 'index_scalp') return 'index_scalp';
  if (src === 'zero_dte_desk') return 'zero_dte_desk';
  if (src === 'zero_dte_flow') return 'zero_dte_flow';
  if (src === 'gex_magnet') return 'gex_magnet';
  return null;
}

export interface ZeroDteVerdict { ok: boolean; code: string; reason: string; kind: ZeroDteKind | null; dte: number | null }

/** Does this idea belong to (and still qualify for) the 0DTE sleeve right now? Clock/fields only — no quote. */
export function classifyZeroDteIdea(idea: ZeroDteIdeaLike, nowMs: number, cfg: Pick<BotSleeveConfig, 'zeroDteMaxDte' | 'zeroDteUniverse'>): ZeroDteVerdict {
  const kind = zeroDteKindOf(idea);
  const no = (code: string, reason: string, dte: number | null = null): ZeroDteVerdict => ({ ok: false, code, reason, kind, dte });
  if (!kind) return no('not_0dte_source', `source ${idea.source ?? 'unknown'} is not a 0DTE engine`);
  if (idea.outcomeStatus && idea.outcomeStatus !== 'open') return no('resolved', `idea already ${idea.outcomeStatus}`);
  const opt = String(idea.optionType ?? '').toLowerCase();
  if ((opt !== 'call' && opt !== 'put') || !(Number(idea.strikePrice) > 0)) return no('no_contract_fields', 'idea carries no concrete contract (type/strike)');
  const dte = daysToExpiry(idea.expiryDate, nowMs);
  if (dte == null) return no('no_contract_fields', 'idea carries no contract expiry');
  if (dte < 0) return no('expired_contract', `contract expired ${String(idea.expiryDate).slice(0, 10)}`, dte);
  if (dte > cfg.zeroDteMaxDte) return no('dte_too_long', `${dte} DTE > ${cfg.zeroDteMaxDte} DTE sleeve limit`, dte);
  const pub = Date.parse(String(idea.timestamp ?? ''));
  if (!Number.isFinite(pub) || etDay(pub) !== etDay(nowMs)) return no('not_today', 'not published this session', dte);
  const until = Date.parse(String(idea.entryValidUntil ?? ''));
  if (Number.isFinite(until) && nowMs >= until) return no('entry_expired', `entry window closed ${etHHMM(until)} ET`, dte);
  const exitBy = Date.parse(String(idea.exitBy ?? ''));
  if (Number.isFinite(exitBy) && nowMs >= exitBy) return no('entry_expired', `exit-by ${etHHMM(exitBy)} ET already passed`, dte);
  if (!cfg.zeroDteUniverse.has(String(idea.symbol).toUpperCase())) return no('outside_universe', `${idea.symbol} is not an index / mega-cap 0DTE name`, dte);
  return { ok: true, code: 'ok', reason: `${kind} · ${dte} DTE`, kind, dte };
}

/** Contracts that fit the fixed premium risk at the sleeve stop; 0 = too expensive. */
export function zeroDteQuantity(ask: number, cfg: Pick<BotSleeveConfig, 'zeroDteRiskUsd' | 'premStopPct'>, maxContracts = 3): number {
  if (!(ask > 0)) return 0;
  const riskPerContract = ask * 100 * cfg.premStopPct;
  return Math.max(0, Math.min(maxContracts, Math.floor(cfg.zeroDteRiskUsd / riskPerContract)));
}

// ── 0DTE sleeve: premium management ─────────────────────────────────────────

export type PremiumAction = 'flatten' | 'stop' | 'target' | 'breakeven_stop' | 'arm_breakeven' | 'hold';

/**
 * What to do with a 0DTE-sleeve position at a LIVE premium mark.
 * `stop` is the position's current premium stop (entry once the breakeven is armed).
 */
export function premiumManage(p: { entry: number; mark: number; stop: number | null; etMin: number }, cfg: Pick<BotSleeveConfig, 'premStopPct' | 'premT1Pct' | 'premT2Pct' | 'flattenEt'>): { action: PremiumAction; reason: string } {
  const pct = (p.mark / p.entry - 1) * 100;
  const pctTxt = `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`;
  if (p.etMin >= cfg.flattenEt) return { action: 'flatten', reason: `0DTE hard flatten ${etTxt(cfg.flattenEt)} ET (${pctTxt})` };
  if (p.mark >= p.entry * (1 + cfg.premT2Pct)) return { action: 'target', reason: `premium target +${Math.round(cfg.premT2Pct * 100)}% (${pctTxt})` };
  const armed = p.stop != null && p.stop >= p.entry - 1e-9;
  if (armed && p.mark <= p.entry) return { action: 'breakeven_stop', reason: `breakeven stop after +${Math.round(cfg.premT1Pct * 100)}% (${pctTxt})` };
  if (p.mark <= p.entry * (1 - cfg.premStopPct)) return { action: 'stop', reason: `premium stop −${Math.round(cfg.premStopPct * 100)}% (${pctTxt})` };
  if (!armed && p.mark >= p.entry * (1 + cfg.premT1Pct)) return { action: 'arm_breakeven', reason: `+${Math.round(cfg.premT1Pct * 100)}% reached — stop to entry (${pctTxt})` };
  return { action: 'hold', reason: pctTxt };
}

const etTxt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// ── which sleeve a held position belongs to ─────────────────────────────────

export function sleeveTag(s: BotSleeve): string { return `sleeve:${s}`; }

export function sleeveOfPosition(pos: { entrySignals?: string | null; expiryDate?: string | null; entryTime?: string | null }): BotSleeve {
  try {
    const sig = pos.entrySignals ? JSON.parse(pos.entrySignals) : null;
    if (Array.isArray(sig)) {
      if (sig.includes('sleeve:0dte')) return '0dte';
      if (sig.includes('sleeve:swing')) return 'swing';
    }
  } catch { /* legacy free text */ }
  const at = Date.parse(String(pos.entryTime ?? ''));
  const dte = Number.isFinite(at) ? daysToExpiry(pos.expiryDate, at) : null;
  return dte != null && dte <= 2 ? '0dte' : 'swing';
}

// ── swing sleeve ordering ───────────────────────────────────────────────────

export interface GradedCandidate { ideaId: string; grade: NexusGrade; publishMs: number | null }

/** NEXUS grade desc → newest publish → idea id. The evidence score never enters. */
export function swingOrder<T extends GradedCandidate>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    b.grade.score - a.grade.score
    || (b.publishMs ?? 0) - (a.publishMs ?? 0)
    || String(a.ideaId).localeCompare(String(b.ideaId)));
}

/** Live & valid (fresh or carried) — the grade's lifecycle factor at full points. */
export function isLiveGrade(g: NexusGrade): boolean {
  const life = g.factors.find((f) => f.key === 'lifecycle');
  return !!life && life.points >= NEXUS_GRADE_POINTS.valid;
}

// ── no same-day re-entry after a stop ───────────────────────────────────────

/** Exit reasons that count as a stop-out (premium, underlying, breakeven, trailing). */
export function isStopExit(exitReason: string | null | undefined): boolean {
  // 'stop_hit' (checkStopsAndTargets), sleeve 'premium_stop' / 'breakeven_stop', trailing stops,
  // and the wide-stop exits: 'underlying_stop' (2d) / 'premium_stop_wide_…' (shared/wide-stops.ts).
  // A 'time_stop' is a clock exit, not a stop-out.
  return /(^|[^a-z])(stop_hit|premium_stop|breakeven_stop|trailing_stop|stop_loss|hit_stop|underlying_stop)/i.test(String(exitReason ?? ''));
}

/** Symbols stopped out on the ET day of `nowMs` (any run). */
export function stoppedOutToday<T extends { symbol: string; status?: string | null; exitTime?: string | Date | null; exitReason?: string | null }>(
  rows: T[], nowMs: number,
): Set<string> {
  const today = etDay(nowMs);
  const out = new Set<string>();
  for (const r of rows) {
    if (r.status !== 'closed' || !isStopExit(r.exitReason)) continue;
    const t = Date.parse(String(r.exitTime ?? ''));
    if (Number.isFinite(t) && etDay(t) === today) out.add(String(r.symbol).toUpperCase());
  }
  return out;
}

// ── stale-position hygiene (swing sleeve) ───────────────────────────────────

export interface TimeStopInput {
  nowMs: number;
  /** The linked idea (null when the row was deleted): its own fields decide the hold window. Pass the row's timestamp as generatedAt. */
  idea: LifecycleInput | null;
  /** Fallbacks when the idea is gone. */
  entryTime: string | null;
  direction: 'long' | 'short';
  expiryDate: string | null;
  /** Live underlying price, or null. */
  liveUnderlying: number | null;
  policy: ExitPolicyId;
}

export interface TimeStopVerdict { due: boolean; why: string; windowEndsMs: number | null }

/**
 * Hold-window end (docs/SETUP_LIFECYCLE.md windowFor) and, under EXIT_POLICY=time_half,
 * the half-horizon time stop unless ≥ +0.5R on the underlying. Never decides from an
 * unknown underlying for the R test; the window end needs no price.
 */
export function timeStopDue(i: TimeStopInput): TimeStopVerdict {
  const idea: LifecycleInput = i.idea ?? {
    direction: i.direction, entryPrice: NaN, stopLoss: NaN, targetPrice: NaN,
    assetType: 'option', holdingPeriod: 'swing', expiryDate: i.expiryDate, generatedAt: i.entryTime,
  };
  const entryMs = Date.parse(String(i.entryTime ?? ''));
  const publishMs = publishMsOf(idea) ?? (Number.isFinite(entryMs) ? entryMs : null);
  if (publishMs == null) return { due: false, why: 'no publish/entry time', windowEndsMs: null };
  const w = windowFor(idea, publishMs);
  if (i.nowMs >= w.endMs) {
    return { due: true, why: `hold window ended ${new Date(w.endMs).toISOString().slice(0, 16)}Z (${w.basis})`, windowEndsMs: w.endMs };
  }
  if (i.policy === 'time_half' && i.idea && Number(i.idea.entryPrice) > 0 && Number(i.idea.stopLoss) > 0) {
    if (i.liveUnderlying == null || !(i.liveUnderlying > 0)) return { due: false, why: 'time_half: no live underlying — not judged', windowEndsMs: w.endMs };
    const plan = exitPolicyPlan({ policy: 'time_half', publishedMs: publishMs, holdingPeriod: i.idea.holdingPeriod, expiryDate: i.idea.expiryDate });
    const sig = manageSignal(plan, {
      direction: i.direction, entry: Number(i.idea.entryPrice), stop: Number(i.idea.stopLoss),
      target: Number(i.idea.targetPrice) || null, live: i.liveUnderlying, nowMs: i.nowMs,
    });
    if (sig?.state === 'time_exit') return { due: true, why: `time_half: ${sig.headline}`, windowEndsMs: w.endMs };
  }
  return { due: false, why: 'inside the hold window', windowEndsMs: w.endMs };
}

// ── executable quote ────────────────────────────────────────────────────────

export interface QuoteLike { bid: number; ask: number; mid: number; source?: string; delayed?: boolean }

export interface QuoteVerdict { ok: boolean; code: string; reason: string; stamp: string | null; spreadPct: number | null }

/** Two-sided, regular-session, inside the spread cap; delayed quotes wait for price discovery. */
export function executableQuote(q: QuoteLike | null | undefined, o: { nowMs: number; maxSpreadPct: number; delayedNotBeforeEt?: number }): QuoteVerdict {
  if (!q) return { ok: false, code: 'no_quote', reason: 'no contract mark from any source', stamp: null, spreadPct: null };
  const bid = Number(q.bid), ask = Number(q.ask);
  const stamp = `${q.source ?? 'unknown'}${q.delayed ? ' · delayed' : ''} @ ${etHHMM(o.nowMs)} ET ${bid.toFixed(2)}/${ask.toFixed(2)}`;
  if (!(bid > 0 && ask > 0 && ask >= bid)) return { ok: false, code: 'one_sided', reason: `one-sided market (${bid}/${ask})`, stamp, spreadPct: null };
  const mid = (bid + ask) / 2;
  const spreadPct = (ask - bid) / mid;
  if (spreadPct > o.maxSpreadPct) return { ok: false, code: 'wide_spread', reason: `spread ${(spreadPct * 100).toFixed(1)}% > ${(o.maxSpreadPct * 100).toFixed(0)}%`, stamp, spreadPct };
  if (marketSessionAt(o.nowMs) !== 'regular') return { ok: false, code: 'market_closed', reason: 'outside the regular session — no executable option market', stamp, spreadPct };
  if (q.delayed && o.delayedNotBeforeEt != null && etMinutesOf(o.nowMs) < o.delayedNotBeforeEt) {
    return { ok: false, code: 'delayed_quote', reason: `delayed quote before ${etTxt(o.delayedNotBeforeEt)} ET (opening price discovery)`, stamp, spreadPct };
  }
  return { ok: true, code: 'ok', reason: 'executable', stamp, spreadPct };
}

// ── per-cycle skip tally ────────────────────────────────────────────────────

export interface SkipRow { symbol: string; sleeve: BotSleeve | 'all'; code: string; reason: string; rank: number }
export interface SkipSummary {
  total: number;
  byReason: Record<string, number>;
  bySleeve: Record<string, Record<string, number>>;
  /** The three best-ranked rejected candidates, with why. */
  top: Array<Omit<SkipRow, 'rank'>>;
  /** Free-capacity snapshot at entry time. */
  capacity?: Record<string, { held: number; max: number }>;
}

export class SkipTally {
  private rows: SkipRow[] = [];
  private seq = 0;
  capacity: SkipSummary['capacity'] = undefined;
  add(sleeve: SkipRow['sleeve'], symbol: string, code: string, reason: string, rank?: number): void {
    this.rows.push({ symbol, sleeve, code, reason, rank: rank ?? 1_000_000 + this.seq++ });
  }
  get size(): number { return this.rows.length; }
  summary(): SkipSummary {
    const byReason: Record<string, number> = {};
    const bySleeve: Record<string, Record<string, number>> = {};
    for (const r of this.rows) {
      byReason[r.code] = (byReason[r.code] ?? 0) + 1;
      (bySleeve[r.sleeve] ??= {})[r.code] = (bySleeve[r.sleeve][r.code] ?? 0) + 1;
    }
    const top = [...this.rows].sort((a, b) => a.rank - b.rank).slice(0, 3).map(({ rank: _r, ...x }) => x);
    return { total: this.rows.length, byReason, bySleeve, top, capacity: this.capacity };
  }
}

export function formatSkipSummary(s: SkipSummary): string {
  const counts = Object.entries(s.byReason).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none';
  const cap = s.capacity ? Object.entries(s.capacity).map(([k, v]) => `${k} ${v.held}/${v.max}`).join(', ') : '';
  const top = s.top.map((t) => `${t.symbol}(${t.sleeve}) ${t.code}: ${t.reason}`).join(' | ');
  return `skips ${s.total} [${counts}]${cap ? ` · held ${cap}` : ''}${top ? ` · top: ${top}` : ''}`;
}

// ── one symbol, one side ────────────────────────────────────────────────────

/**
 * Thesis side on the UNDERLYING: a bought put is short, a bought call is long,
 * a share position is its direction. (2026-10-01 journal: MU long put AND MU
 * long call were open at the same time — a straddle nobody chose.)
 */
export function underlyingSide(p: { assetType?: string | null; optionType?: string | null; direction?: string | null }): 'long' | 'short' {
  const opt = String(p.optionType ?? '').toLowerCase();
  if (opt === 'put') return 'short';
  if (opt === 'call') return 'long';
  return String(p.direction ?? '').toLowerCase() === 'short' ? 'short' : 'long';
}

/** The open position holding the OPPOSITE side of `symbol`, if any. */
export function oppositeSideHeld<T extends { symbol: string; status?: string | null; assetType?: string | null; optionType?: string | null; direction?: string | null }>(
  open: T[], symbol: string, side: 'long' | 'short',
): T | null {
  const sym = symbol.toUpperCase();
  return open.find((p) => (p.status == null || p.status === 'open') && String(p.symbol).toUpperCase() === sym && underlyingSide(p) !== side) ?? null;
}
