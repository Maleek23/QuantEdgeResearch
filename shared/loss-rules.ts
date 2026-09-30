/**
 * LOSS RULES v1 — the five rules the operator approved on 2026-09-29 after the
 * live-journal loss study (≈5 weeks, small samples — every rule is a HYPOTHESIS
 * the measurement layer below exists to confirm or kill).
 *
 *   1. BOT CONFLUENCE   the bot enters only when ≥2 INDEPENDENT evidence families
 *                       agree on direction. Single-source ideas still count as
 *                       confirmation for other ideas, never as a trade alone.
 *   2. BOT ENTRY WINDOW new bot entries 09:30–11:30 ET only; exits all day. An
 *                       idea published outside RTH needs a next-session trigger
 *                       (price trades AT the entry after 09:30) — never a fill
 *                       at a stale close.
 *   3. TARGET CAP + TIME STOP  new ideas: T1 ≤ 1× the expected move for the
 *                       idea's horizon (σ = 20-day realized vol × √days); the
 *                       original T1 is kept as the T2 stretch. Time stop: at 50%
 *                       of the horizon, exit unless ≥0.5R in profit.
 *   4. DTE FIT          option vehicles for multi-day holds (≥3 days) are 30–60
 *                       DTE; nothing 1–30 DTE on a multi-day hold.
 *   5. MEASUREMENT      every new idea / bot fill is stamped with the rule-set
 *                       version (LOSS_RULES_VERSION) so before/after is a query.
 *
 * Pure: no I/O, no imports. Server wiring lives in server/loss-rules.ts; the
 * report core in shared/loss-rules-report.ts. Unit tests: scripts/test-loss-rules.ts.
 *
 * Every rule sits behind its own flag, default ON, read from the environment
 * (see readLossRulesConfig). LOSS_RULES=off turns all five off at once; turning
 * a rule off restores the pre-rules behaviour exactly (the code paths are
 * guarded, not rewritten).
 */
import { optionExpiryCloseMs } from './option-expiry';

export const LOSS_RULES_VERSION = 'loss-rules-v1.1'; // v1.1 (2026-09-30): flow-led picks exempt from bot confluence, bot entry window to 15:00 ET
/** Tag written into a bot fill's entry_signals / a report row's provenance. */
export const LOSS_RULES_TAG = `rules:${LOSS_RULES_VERSION}`;

// ─── Config ────────────────────────────────────────────────────────────────

export interface LossRulesConfig {
  /** LOSS_RULE_BOT_CONFLUENCE — rule 1. */
  botConfluence: boolean;
  /** LOSS_RULE_MIN_SOURCES — independent evidence families required (default 2). */
  minIndependentSources: number;
  /** LOSS_RULE_BOT_ENTRY_WINDOW — rule 2. */
  botEntryWindow: boolean;
  /** LOSS_RULE_ENTRY_WINDOW="09:30-11:30" — ET minutes after midnight. */
  entryWindowStartEt: number;
  entryWindowEndEt: number;
  /** LOSS_RULE_TARGET_CAP — rule 3a. */
  targetCap: boolean;
  /** LOSS_RULE_TARGET_CAP_MULT — T1 ≤ mult × expected move (default 1.0). */
  targetCapMultiple: number;
  /** LOSS_RULE_TIME_STOP — rule 3b. */
  timeStop: boolean;
  /** LOSS_RULE_TIME_STOP_FRACTION — fraction of the horizon (default 0.5). */
  timeStopFraction: number;
  /** LOSS_RULE_TIME_STOP_MIN_R — progress required to stay in (default 0.5R). */
  timeStopMinR: number;
  /** LOSS_RULE_DTE_FIT — rule 4. */
  dteFit: boolean;
  /** Holds of at least this many trading days are "multi-day" (default 3). */
  multiDayHoldDays: number;
  multiDayDteMin: number;
  multiDayDteMax: number;
}

export const DEFAULT_LOSS_RULES_CONFIG: LossRulesConfig = {
  botConfluence: true,
  minIndependentSources: 2,
  botEntryWindow: true,
  entryWindowStartEt: 9 * 60 + 30,
  entryWindowEndEt: 11 * 60 + 30,
  targetCap: true,
  targetCapMultiple: 1.0,
  timeStop: true,
  timeStopFraction: 0.5,
  timeStopMinR: 0.5,
  dteFit: true,
  multiDayHoldDays: 3,
  multiDayDteMin: 30,
  multiDayDteMax: 60,
};

type Env = Record<string, string | undefined>;

const flag = (v: string | undefined, dflt: boolean): boolean => {
  if (v == null || v === '') return dflt;
  return !/^(0|false|off|no)$/i.test(v.trim());
};
const num = (v: string | undefined, dflt: number, lo: number, hi: number): number => {
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) && n >= lo && n <= hi ? n : dflt;
};
const hhmm = (s: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]); const mm = Number(m[2]);
  return h < 24 && mm < 60 ? h * 60 + mm : null;
};

/** Read the flags. Unknown / malformed values fall back to the default. */
export function readLossRulesConfig(env: Env = {}): LossRulesConfig {
  const d = DEFAULT_LOSS_RULES_CONFIG;
  const master = flag(env.LOSS_RULES, true);
  let start = d.entryWindowStartEt; let end = d.entryWindowEndEt;
  if (env.LOSS_RULE_ENTRY_WINDOW) {
    const [a, b] = env.LOSS_RULE_ENTRY_WINDOW.split('-');
    const s = a ? hhmm(a) : null; const e = b ? hhmm(b) : null;
    if (s != null && e != null && e > s) { start = s; end = e; }
  }
  const dteMin = num(env.LOSS_RULE_MULTIDAY_DTE_MIN, d.multiDayDteMin, 1, 365);
  const dteMax = num(env.LOSS_RULE_MULTIDAY_DTE_MAX, d.multiDayDteMax, 1, 730);
  return {
    botConfluence: master && flag(env.LOSS_RULE_BOT_CONFLUENCE, d.botConfluence),
    minIndependentSources: Math.round(num(env.LOSS_RULE_MIN_SOURCES, d.minIndependentSources, 1, 5)),
    botEntryWindow: master && flag(env.LOSS_RULE_BOT_ENTRY_WINDOW, d.botEntryWindow),
    entryWindowStartEt: start,
    entryWindowEndEt: end,
    targetCap: master && flag(env.LOSS_RULE_TARGET_CAP, d.targetCap),
    targetCapMultiple: num(env.LOSS_RULE_TARGET_CAP_MULT, d.targetCapMultiple, 0.25, 5),
    timeStop: master && flag(env.LOSS_RULE_TIME_STOP, d.timeStop),
    timeStopFraction: num(env.LOSS_RULE_TIME_STOP_FRACTION, d.timeStopFraction, 0.1, 1),
    timeStopMinR: num(env.LOSS_RULE_TIME_STOP_MIN_R, d.timeStopMinR, 0, 3),
    dteFit: master && flag(env.LOSS_RULE_DTE_FIT, d.dteFit),
    multiDayHoldDays: num(env.LOSS_RULE_MULTIDAY_DAYS, d.multiDayHoldDays, 1, 60),
    multiDayDteMin: Math.min(dteMin, dteMax),
    multiDayDteMax: Math.max(dteMin, dteMax),
  };
}

// ─── New York clock (pure, DST-correct via Intl) ───────────────────────────

export interface EtParts { y: number; m: number; d: number; hh: number; mm: number; weekday: number; dateKey: string; minutes: number }

export function etParts(ms: number): EtParts {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(new Date(ms));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  const y = Number(v('year')); const m = Number(v('month')); const d = Number(v('day'));
  const hh = Number(v('hour')) % 24; const mm = Number(v('minute'));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(v('weekday'));
  return { y, m, d, hh, mm, weekday, dateKey: `${v('year')}-${v('month')}-${v('day')}`, minutes: hh * 60 + mm };
}

/** UTC epoch ms of a New York wall-clock time (DST-correct). */
export function etWallToMs(y: number, m: number, d: number, minutes: number): number {
  const guess = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  // New York is UTC−4 or UTC−5; test both offsets and keep the one that round-trips.
  for (const off of [4, 5]) {
    const t = guess + off * 3_600_000;
    const p = etParts(t);
    if (p.y === y && p.m === m && p.d === d && p.minutes === minutes) return t;
  }
  return guess + 5 * 3_600_000;
}

export const RTH_OPEN_ET = 9 * 60 + 30;
export const RTH_CLOSE_ET = 16 * 60;
const SESSION_MIN = RTH_CLOSE_ET - RTH_OPEN_ET; // 390

export function isRegularSession(ms: number): boolean {
  const p = etParts(ms);
  return p.weekday >= 1 && p.weekday <= 5 && p.minutes >= RTH_OPEN_ET && p.minutes < RTH_CLOSE_ET;
}

/** Start (09:30 ET) of the next regular session strictly after `ms`'s session. Weekends skipped; holidays are not modelled. */
function nextSessionOpen(ms: number): number {
  let p = etParts(ms);
  let t = etWallToMs(p.y, p.m, p.d, RTH_OPEN_ET);
  if (!(p.weekday >= 1 && p.weekday <= 5 && p.minutes < RTH_OPEN_ET)) {
    // move to the next calendar day(s) until a weekday
    let probe = t + 86_400_000;
    for (let i = 0; i < 7; i++) {
      p = etParts(probe);
      if (p.weekday >= 1 && p.weekday <= 5) break;
      probe += 86_400_000;
    }
    t = etWallToMs(p.y, p.m, p.d, RTH_OPEN_ET);
  }
  return t;
}

/**
 * Advance `tradingMinutes` of regular-session time from `fromMs` (09:30–16:00 ET,
 * Mon–Fri; exchange holidays are NOT modelled — a holiday counts as a session,
 * which makes the time stop fire at most one session early around holidays).
 * A start outside RTH is anchored at the next session's open.
 */
export function addTradingMinutes(fromMs: number, tradingMinutes: number): number {
  let t = isRegularSession(fromMs) ? fromMs : nextSessionOpen(fromMs);
  let left = Math.max(0, tradingMinutes);
  for (let guard = 0; guard < 400; guard++) {
    const p = etParts(t);
    const close = etWallToMs(p.y, p.m, p.d, RTH_CLOSE_ET);
    const avail = (close - t) / 60_000;
    if (left <= avail) return t + left * 60_000;
    left -= avail;
    t = nextSessionOpen(close);
  }
  return t;
}

// ─── Rule 1: confluence ────────────────────────────────────────────────────

/**
 * EVIDENCE FAMILIES — what "independent" means, explicitly.
 *
 * Two pieces of evidence are independent only if they come from different
 * FAMILIES. A family is a way of knowing something about the name:
 *   • flow   — options tape / aggressor prints (flow scanner, Bullflow, whale/
 *              unusual activity, a measured-tape structure layer, an options-
 *              flow convergence signal). All of these read the same tape.
 *   • gex    — dealer positioning (GEX scanner, GEX magnet, a supportive GEX
 *              conviction layer). All read the same chain's gamma.
 *   • every other publishing engine is its own family, keyed by its canonical
 *              source name (quant, market_scanner, spx_session, swing_catcher…):
 *              a second scanner that independently published the same symbol
 *              and direction is a second family.
 *
 * NOT evidence (same-source duplicates / context, never counted): the same
 * engine publishing the name twice; regime, breadth, macro, sector-peer,
 * pre-market, technical/TA/compression layers (they re-read the idea's own
 * chart or the whole tape, not the name's own independent evidence); the
 * leadership "benchmark name" bonus; a GEX layer that is neutral or negative.
 */
export type EvidenceFamily = string;

const FLOW_SOURCES = new Set([
  'flow', 'options_flow', 'bullflow', 'flow_scanner', 'unusual_activity', 'unusual_options',
  'institutional_flow', 'whale_flow', 'dark_pool', 'darkpool', 'tape',
]);
const GEX_SOURCES = new Set(['gex_scanner', 'gex_magnet', 'gex', 'gex_vex', 'gex_vex_scanner', 'gamma']);
const SOURCE_SYNONYMS: Record<string, string> = {
  quant_signal: 'quant', quant_mean_reversion: 'quant', ai_analysis: 'ai',
  news_catalyst: 'news', breaking_news: 'news', news_nlp: 'news',
};

export function evidenceFamilyOf(source: string | null | undefined): EvidenceFamily {
  const s = String(source ?? '').trim().toLowerCase().replace(/-/g, '_');
  if (!s) return 'unknown';
  if (FLOW_SOURCES.has(s) || /flow|bullflow|whale/.test(s)) return 'flow';
  if (GEX_SOURCES.has(s) || s.startsWith('gex')) return 'gex';
  return SOURCE_SYNONYMS[s] ?? s;
}

/** Minimum points a GEX layer must carry to count as supportive dealer positioning. */
export const GEX_SUPPORT_MIN_POINTS = 3;

export interface EvidenceLayer { kind: string; points: number; why?: string | null; label?: string | null; data?: Record<string, unknown> | null }
export interface PeerIdeaRef { source: string | null | undefined; direction: 'long' | 'short'; id?: string }
export interface FlowRead {
  /** Real-dollar premium on the dominant side today. */
  dominantPremium: number;
  dominantSide: 'long' | 'short';
  /** dominant ÷ other side premium (Infinity when one-sided). */
  skew: number;
  /** Aggressor tape contradicts the dominant side (bid/ask evidence). */
  tapeContradicts?: boolean;
}

/** Flow agreement threshold (real dollars, skew) for the live tape read. */
export const FLOW_CONFIRM_MIN_PREMIUM = 250_000;
export const FLOW_CONFIRM_MIN_SKEW = 1.5;

export interface ConfluenceInput {
  primarySource: string | null | undefined;
  direction: 'long' | 'short';
  /** Conviction layers (live pick layers, or gen_scoring_layers for history). */
  layers?: EvidenceLayer[] | null;
  /** Convergence-signal sources stored on the idea (convergenceSignalsJson.signals[].source). */
  convergenceSources?: Array<{ source: string; direction?: string | null }> | null;
  /** Other open/recent ideas on the same symbol (any direction; filtered here). */
  peerIdeas?: PeerIdeaRef[] | null;
  /** Today's options tape for the symbol, when read. */
  flow?: FlowRead | null;
  minIndependentSources?: number;
}

export interface ConfluenceResult {
  passed: boolean;
  families: EvidenceFamily[];
  /** family → the evidence that established it. */
  evidence: Array<{ family: EvidenceFamily; via: string }>;
  required: number;
  reason: string;
}

export function assessConfluence(input: ConfluenceInput): ConfluenceResult {
  const required = input.minIndependentSources ?? DEFAULT_LOSS_RULES_CONFIG.minIndependentSources;
  const evidence: Array<{ family: EvidenceFamily; via: string }> = [];
  const seen = new Set<EvidenceFamily>();
  const add = (family: EvidenceFamily, via: string) => {
    if (!family || family === 'unknown' || seen.has(family)) return;
    seen.add(family);
    evidence.push({ family, via });
  };
  const primary = evidenceFamilyOf(input.primarySource);
  add(primary, `publishing engine (${input.primarySource ?? 'unknown'})`);

  for (const p of input.peerIdeas ?? []) {
    if (p.direction !== input.direction) continue;
    const f = evidenceFamilyOf(p.source);
    add(f, `second engine published the same side (${p.source})`);
  }

  for (const l of input.layers ?? []) {
    if (!l || typeof l.points !== 'number') continue;
    if (l.kind === 'gex' && l.points >= GEX_SUPPORT_MIN_POINTS) add('gex', `GEX layer +${l.points} (${String(l.why ?? '').slice(0, 60)})`);
    const txt = `${l.label ?? ''} ${l.why ?? ''}`;
    if (l.kind === 'structure' && l.points > 0 && /aggressor tape|measured tape/i.test(txt)) add('flow', `measured aggressor tape +${l.points}`);
  }

  const wantDir = input.direction === 'long' ? /bull|long|up/i : /bear|short|down/i;
  for (const c of input.convergenceSources ?? []) {
    if (!c?.source) continue;
    if (c.direction && !wantDir.test(c.direction) && !/neutral/i.test(c.direction)) continue;
    const f = evidenceFamilyOf(c.source);
    // A convergence signal from the idea's own daily chart is the primary again.
    if (/ohlcv|daily_chart|price_action/.test(c.source)) continue;
    add(f, `convergence signal (${c.source})`);
  }

  const fl = input.flow;
  if (fl && fl.dominantSide === input.direction && !fl.tapeContradicts &&
      fl.dominantPremium >= FLOW_CONFIRM_MIN_PREMIUM && fl.skew >= FLOW_CONFIRM_MIN_SKEW) {
    add('flow', `options tape $${(fl.dominantPremium / 1e6).toFixed(2)}M ${input.direction === 'long' ? 'call' : 'put'}-side at ${fl.skew === Infinity ? 'one-sided' : `${fl.skew.toFixed(1)}:1`}`);
  }

  const families = evidence.map((e) => e.family);
  const passed = families.length >= required;
  const reason = passed
    ? `${families.length} independent evidence families agree: ${evidence.map((e) => `${e.family} (${e.via})`).join('; ')}`
    : `single-source: only ${families.length} independent evidence famil${families.length === 1 ? 'y' : 'ies'} (${families.join(', ') || 'none'}) — rule needs ${required}; no second engine, supportive flow or supportive GEX on this side`;
  return { passed, families, evidence, required, reason };
}

/** Aggregate raw flow prints (scanner units: premium WITHOUT ×100) into one read. */
export function aggregateFlowRead(
  prints: Array<{ optionType: string; premium: number; biasBasis?: string | null; sentiment?: string | null }>,
): FlowRead | null {
  let call = 0; let put = 0; let tapeNet = 0;
  for (const f of prints) {
    const dollars = Number(f.premium) * 100;
    if (!Number.isFinite(dollars) || dollars <= 0) continue;
    if (f.optionType === 'call') call += dollars; else if (f.optionType === 'put') put += dollars;
    if (f.biasBasis === 'tape') tapeNet += f.sentiment === 'bullish' ? 1 : f.sentiment === 'bearish' ? -1 : 0;
  }
  if (call + put <= 0) return null;
  const dominantSide = call >= put ? 'long' : 'short';
  const dom = Math.max(call, put); const other = Math.min(call, put);
  return {
    dominantPremium: dom,
    dominantSide,
    skew: other > 0 ? dom / other : Infinity,
    tapeContradicts: (dominantSide === 'long' && tapeNet < 0) || (dominantSide === 'short' && tapeNet > 0),
  };
}

// ─── Rule 2: entry window + next-session trigger ───────────────────────────

export interface EntryWindowInput {
  nowMs: number;
  /** When the idea was published (ISO or ms). */
  publishedAt: string | number | null | undefined;
  direction: 'long' | 'short';
  entry: number;
  live: number | null | undefined;
  /** Intraday bars (epoch SECONDS in `time`, as fetchCandles returns). */
  bars?: Array<{ time: number; high: number; low: number }> | null;
  cfg?: Pick<LossRulesConfig, 'entryWindowStartEt' | 'entryWindowEndEt'>;
}

export interface EntryWindowResult {
  ok: boolean;
  code: 'ok' | 'outside_window' | 'stale_close_untriggered' | 'no_session_bars';
  reason: string;
  publishedOutsideRth: boolean;
}

const fmtEt = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Did price TRADE AT the entry during this session (a 09:30+ bar whose range contains it)? */
export function sessionTradedThrough(bars: Array<{ time: number; high: number; low: number }>, entry: number, sessionOpenMs: number): boolean {
  return bars.some((b) => b.time * 1000 >= sessionOpenMs && b.low <= entry && entry <= b.high);
}

export function checkEntryWindow(input: EntryWindowInput): EntryWindowResult {
  const cfg = input.cfg ?? DEFAULT_LOSS_RULES_CONFIG;
  const now = etParts(input.nowMs);
  const inWindow = now.weekday >= 1 && now.weekday <= 5 && now.minutes >= cfg.entryWindowStartEt && now.minutes < cfg.entryWindowEndEt;
  const pubMs = typeof input.publishedAt === 'number' ? input.publishedAt : Date.parse(String(input.publishedAt ?? ''));
  const pubValid = Number.isFinite(pubMs);
  const publishedOutsideRth = pubValid ? !isRegularSession(pubMs) : false;
  if (!inWindow) {
    return {
      ok: false, code: 'outside_window', publishedOutsideRth,
      reason: `outside the ${fmtEt(cfg.entryWindowStartEt)}–${fmtEt(cfg.entryWindowEndEt)} ET entry window (now ${fmtEt(now.minutes)} ET) — every bot entry at/after 12:00 ET lost in the measured book`,
    };
  }
  // Published before today's open (outside RTH, or during an earlier session):
  // the entry was priced off a close that is no longer the market. Require price
  // to have TRADED AT the entry after 09:30 today.
  const todayOpen = etWallToMs(now.y, now.m, now.d, RTH_OPEN_ET);
  const needsTrigger = pubValid && (publishedOutsideRth || pubMs < todayOpen);
  if (!needsTrigger) return { ok: true, code: 'ok', publishedOutsideRth, reason: 'inside the entry window, published this session' };
  const bars = input.bars ?? [];
  const session = bars.filter((b) => b.time * 1000 >= todayOpen);
  if (!session.length) {
    return { ok: false, code: 'no_session_bars', publishedOutsideRth, reason: 'published before this session — needs a next-session trigger, and no intraday bars since 09:30 ET were available to confirm one' };
  }
  const traded = sessionTradedThrough(session, input.entry, todayOpen);
  const live = Number(input.live);
  const onSide = Number.isFinite(live) && live > 0 && (input.direction === 'long' ? live >= input.entry : live <= input.entry);
  if (traded && onSide) return { ok: true, code: 'ok', publishedOutsideRth, reason: `next-session trigger: traded at entry $${input.entry} after 09:30 ET` };
  return {
    ok: false, code: 'stale_close_untriggered', publishedOutsideRth,
    reason: `published ${publishedOutsideRth ? 'outside RTH' : 'in an earlier session'} — price has not traded at entry $${input.entry} since 09:30 ET${traded ? ' (touched, but live is back on the wrong side)' : ''}; never fill at a stale close`,
  };
}

// ─── Rule 3: target cap + time stop ────────────────────────────────────────

/** Holding horizon in TRADING days for an idea. Options cannot outlive their expiry. */
export function horizonTradingDays(args: { holdingPeriod?: string | null; expiryDate?: string | null; publishedMs?: number | null }): number {
  const hp = String(args.holdingPeriod ?? '').toLowerCase();
  let days = hp.includes('position') || hp.includes('long') ? 10
    : hp.includes('week') || hp.includes('swing') ? 5
    : hp.includes('day') || hp.includes('scalp') || hp.includes('intraday') ? 1
    : 5;
  const expClose = optionExpiryCloseMs(args.expiryDate);
  if (Number.isFinite(expClose) && args.publishedMs && Number.isFinite(args.publishedMs)) {
    const cal = (expClose - args.publishedMs) / 86_400_000;
    const trading = Math.max(1, Math.floor(cal * 5 / 7));
    days = Math.min(days, trading);
  }
  return Math.max(1, days);
}

/** Sample stdev of the last `n` daily log returns (needs n+1 closes). Null when not enough data. */
export function realizedVolDaily(closes: number[], n = 20): number | null {
  const c = closes.filter((x) => Number.isFinite(x) && x > 0);
  if (c.length < n + 1) return null;
  const tail = c.slice(-(n + 1));
  const r: number[] = [];
  for (let i = 1; i < tail.length; i++) r.push(Math.log(tail[i] / tail[i - 1]));
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const v = r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1);
  const s = Math.sqrt(v);
  return Number.isFinite(s) && s > 0 ? s : null;
}

/** 1σ price move over `days` trading days: entry × σ_daily × √days (≡ σ_annual × √(days/252)). */
export function expectedMove(entry: number, sigmaDaily: number, days: number): number {
  return entry * sigmaDaily * Math.sqrt(Math.max(days, 0));
}

export interface TargetCapInput {
  direction: 'long' | 'short';
  entry: number;
  target: number;
  stop: number;
  sigmaDaily: number | null;
  horizonDays: number;
  multiple?: number;
}
export interface TargetCapResult {
  target: number;
  capped: boolean;
  /** The producer's T1 — kept as the T2 stretch when capped. */
  originalTarget: number;
  expectedMove: number | null;
  riskReward: number;
  note: string;
}

export function capTargetToExpectedMove(i: TargetCapInput): TargetCapResult {
  const risk = Math.abs(i.entry - i.stop);
  const rr = (t: number) => (risk > 0 ? Math.abs(t - i.entry) / risk : 0);
  if (!(i.sigmaDaily && i.sigmaDaily > 0) || !(i.entry > 0)) {
    return { target: i.target, capped: false, originalTarget: i.target, expectedMove: null, riskReward: rr(i.target), note: 'no realized-vol read — target unchanged' };
  }
  const em = expectedMove(i.entry, i.sigmaDaily, i.horizonDays) * (i.multiple ?? 1);
  const dist = Math.abs(i.target - i.entry);
  if (dist <= em) {
    return { target: i.target, capped: false, originalTarget: i.target, expectedMove: em, riskReward: rr(i.target), note: `T1 within ${(i.multiple ?? 1)}× the ${i.horizonDays}d expected move ($${em.toFixed(2)})` };
  }
  const raw = i.direction === 'long' ? i.entry + em : i.entry - em;
  const target = Math.round(raw * 100) / 100;
  return {
    target, capped: true, originalTarget: i.target, expectedMove: em, riskReward: rr(target),
    note: `T1 capped $${i.target} → $${target} (${(i.multiple ?? 1)}× the ${i.horizonDays}-day expected move ±$${em.toFixed(2)}, σ ${(i.sigmaDaily * 100).toFixed(2)}%/day from 20-day realized vol); original T1 kept as the T2 stretch`,
  };
}

export interface TimeStopPlan { atIso: string; fraction: number; minR: number; horizonDays: number }

export function planTimeStop(anchorMs: number, horizonDays: number, fraction: number, minR: number): TimeStopPlan {
  const at = addTradingMinutes(anchorMs, fraction * horizonDays * SESSION_MIN);
  return { atIso: new Date(at).toISOString(), fraction, minR, horizonDays };
}

/** Progress toward target in R (positive = in profit). */
export function progressR(direction: 'long' | 'short', entry: number, stop: number, price: number): number {
  const risk = Math.abs(entry - stop);
  if (!(risk > 0)) return 0;
  return ((direction === 'long' ? price - entry : entry - price) / risk);
}

export function evaluateTimeStop(args: {
  direction: 'long' | 'short'; entry: number; stop: number; price: number | null | undefined; nowMs: number; atIso: string; minR: number;
}): { exit: boolean; progressR: number | null; reason: string } {
  const at = Date.parse(args.atIso);
  if (!Number.isFinite(at) || args.nowMs < at) return { exit: false, progressR: null, reason: 'time stop not reached' };
  const px = Number(args.price);
  if (!(px > 0)) return { exit: false, progressR: null, reason: 'time stop reached but no price to measure progress' };
  const r = progressR(args.direction, args.entry, args.stop, px);
  if (r >= args.minR) return { exit: false, progressR: r, reason: `time stop passed at +${r.toFixed(2)}R ≥ ${args.minR}R — kept` };
  return { exit: true, progressR: r, reason: `time stop: ${r.toFixed(2)}R at ${args.atIso} (< ${args.minR}R required by half-horizon)` };
}

// ─── Rule 4: DTE fit ───────────────────────────────────────────────────────

export interface DteFitWindow { min: number; max: number; ideal: number; fallbackMaxDte: number; label: string }

/**
 * The DTE window a hold of `holdDays` must use, or null when the rule does not
 * constrain it. Multi-day (≥ cfg.multiDayHoldDays): 30–60 DTE, no fallback
 * outside it. Intraday / ≤2-day holds keep the caller's window (1–7 DTE is
 * permitted ONLY there — the multi-day window excludes it).
 */
export function dteFitWindow(holdDays: number, cfg: Pick<LossRulesConfig, 'multiDayHoldDays' | 'multiDayDteMin' | 'multiDayDteMax'> = DEFAULT_LOSS_RULES_CONFIG): DteFitWindow | null {
  if (!(holdDays >= cfg.multiDayHoldDays)) return null;
  return {
    min: cfg.multiDayDteMin,
    max: cfg.multiDayDteMax,
    ideal: Math.round((cfg.multiDayDteMin + cfg.multiDayDteMax) / 2),
    fallbackMaxDte: cfg.multiDayDteMax,
    label: `Multi-day hold (${cfg.multiDayDteMin}–${cfg.multiDayDteMax} DTE)`,
  };
}

/** Does an option of `dte` fit a hold of `holdDays`? */
export function isDteFit(dte: number, holdDays: number, cfg: Pick<LossRulesConfig, 'multiDayHoldDays' | 'multiDayDteMin' | 'multiDayDteMax'> = DEFAULT_LOSS_RULES_CONFIG): boolean {
  const w = dteFitWindow(holdDays, cfg);
  if (!w) return dte >= 0;
  return dte >= w.min && dte <= w.max;
}

/** Hold days implied by a setup label when no explicit holding days are given. */
export function holdDaysForSetup(setup: string | null | undefined, holdingDays?: number | null): number {
  if (holdingDays != null && Number.isFinite(holdingDays) && holdingDays > 0) return holdingDays;
  const s = String(setup ?? '').toLowerCase();
  if (s.includes('position')) return 10;
  if (s.includes('swing') || s.includes('week')) return 5;
  if (s.includes('scalp') || s.includes('day') || s.includes('lotto') || s.includes('intraday')) return 1;
  return 5;
}

// ─── Stamp stored on each new idea (convergenceSignalsJson.lossRules) ──────

export interface LossRulesStamp {
  version: string;
  appliedAt: string;
  targetCap?: {
    applied: boolean;
    originalTarget: number;
    cappedTarget: number | null;
    expectedMove: number | null;
    sigmaDaily: number | null;
    horizonDays: number;
    multiple: number;
    note: string;
  };
  timeStop?: TimeStopPlan | null;
  skipped?: string;
}

export function readLossRulesStamp(json: unknown): LossRulesStamp | null {
  if (!json || typeof json !== 'object') return null;
  const s = (json as { lossRules?: LossRulesStamp }).lossRules;
  return s && typeof s === 'object' && typeof s.version === 'string' ? s : null;
}
