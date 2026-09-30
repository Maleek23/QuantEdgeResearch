/**
 * 0DTE DESK — pure core (no I/O). The producer / route (server/zero-dte-desk.ts)
 * fetches; this file decides and describes. Unit-tested with synthetic
 * fixtures in scripts/test-zero-dte-desk.ts.
 *
 *   sessionPhase          the desk clock: pre · open drive 09:30–10:00 · midday
 *                         10:00–15:00 · power hour 15:00–16:00 · closed — and what
 *                         the engine looks for in each (windows come from
 *                         server/zero-dte-policies.ts POLICY_WINDOWS, one source).
 *   pickDeskExpiry        same-day expiry when one is listed, else the nearest one
 *                         labelled honestly ("nearest: Fri").
 *   expectedMoveFor       ATM straddle mid of that expiry (the market's own price
 *                         for the move); IV × √T when no two-sided straddle quote.
 *   expiryBucketLevels    GEX of ONE expiry only (0DTE bucket): call wall, put
 *                         wall, zero-γ, max-γ, regime — via the canonical
 *                         computeExposures (server/options-exposures.ts), so the
 *                         desk and the GEX hub agree on definitions.
 *   armedReads / deskEngineState   the engine's state for a name in plain words.
 *   planShortSwing        2–4 day swing: weekly-path-model drift rule + GEX regime
 *                         + flow; T1 capped at 1σ of the horizon (loss rule 3),
 *                         time stop at half the horizon, contracts 30–60 DTE (rule 4).
 *   summarizeDeskRecord   this engine's record: decided n, W/L, R, date range, LOW N.
 *
 * Integrity: nothing is interpolated. A missing input is null and the reading
 * that needs it says "—" or does not fire. Every output carries its basis.
 */
import { computeExposures, optionToInput, type OptionInput } from './options-exposures';
import { POLICY_WINDOWS, POWER_HOUR_START, type ZeroDteSetup } from './zero-dte-policies';
import { dteFitWindow, expectedMove, planTimeStop, DEFAULT_LOSS_RULES_CONFIG } from '../shared/loss-rules';

// ─── config ──────────────────────────────────────────────────────────────

/** Operator's list 2026-09-29 ("spcx" read as SPX/SPXW — SPCX is ALSO a listed optionable stock; add it via ZERO_DTE_WATCH if that was meant). */
export const DEFAULT_ZERO_DTE_WATCH = ['SPX', 'TSLA', 'MSTR', 'KWEB'] as const;
/** Only post-fix outcomes count (memory: pre-2026-08-26 rates are invalid). */
export const RECORD_SINCE = '2026-08-26';
export const LOW_N = 20;
export const SWING_HOLD_DAYS = 3;          // the plan's horizon inside the 2–4 day band
export const SWING_MAX_HOLD_DAYS = 4;
export const SWING_MIN_RR = 1.3;

export function parseWatch(raw: string | undefined | null): string[] {
  const list = String(raw ?? '').split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z.^]{1,8}$/.test(s));
  const uniq = [...new Set(list)];
  return uniq.length ? uniq.slice(0, 8) : [...DEFAULT_ZERO_DTE_WATCH];
}

// ─── ET clock ────────────────────────────────────────────────────────────

export function etDateKey(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}
export function etMinutes(ms: number): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ms));
  return (Number(p.find((x) => x.type === 'hour')?.value ?? 0) % 24) * 60 + Number(p.find((x) => x.type === 'minute')?.value ?? 0);
}
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function weekdayOfKey(key: string): string {
  return WD[new Date(`${key}T12:00:00Z`).getUTCDay()];
}
function isWeekendKey(key: string): boolean {
  const d = new Date(`${key}T12:00:00Z`).getUTCDay();
  return d === 0 || d === 6;
}
/** Weekday sessions strictly after `fromKey` up to and including `toKey` (US holidays NOT excluded — disclosed). */
export function sessionsBetween(fromKey: string, toKey: string): number {
  let n = 0;
  const end = Date.parse(`${toKey}T12:00:00Z`);
  for (let t = Date.parse(`${fromKey}T12:00:00Z`) + 864e5; t <= end; t += 864e5) {
    const d = new Date(t).getUTCDay();
    if (d !== 0 && d !== 6) n++;
  }
  return n;
}

// ─── session phases ──────────────────────────────────────────────────────

export type PhaseId = 'pre' | 'open_drive' | 'midday' | 'power_hour' | 'closed';

export interface SessionPhase {
  id: PhaseId;
  label: string;
  window: string;
  etMin: number;
  /** Minutes to the 16:00 close (0 outside the session). */
  minutesToClose: number;
  /** Is the engine allowed to open a NEW 0DTE idea right now? */
  entriesOpen: boolean;
  policies: { A: boolean; B: boolean };
  looksFor: string[];
  /** Next phase boundary, ET "HH:MM", when there is one today. */
  nextAt: string | null;
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const inAny = (ws: ReadonlyArray<{ start: number; end: number }>, m: number) => ws.some((w) => m >= w.start && m <= w.end);

export function sessionPhase(nowMs: number): SessionPhase {
  const key = etDateKey(nowMs);
  const m = etMinutes(nowMs);
  const weekend = isWeekendKey(key);
  const A = !weekend && inAny(POLICY_WINDOWS.A, m);
  const B = !weekend && inAny(POLICY_WINDOWS.B, m);
  const entriesOpen = !weekend && m >= POLICY_WINDOWS.entry.start && m <= POLICY_WINDOWS.entry.end;
  const base = { etMin: m, policies: { A, B }, entriesOpen };
  if (weekend || m >= 960) {
    return { ...base, id: 'closed', label: 'Closed', window: 'after 16:00 / weekend', minutesToClose: 0, nextAt: null,
      looksFor: ['Nothing new. Open ideas were flattened by the 15:55 ET time stop; the record updates as outcomes resolve.', 'Short swings (2–4d) are planned in session and publish at 10:30 / 14:30 ET.'] };
  }
  if (m < 570) {
    return { ...base, id: 'pre', label: 'Pre-market', window: 'before 09:30', minutesToClose: 0, nextAt: '09:30',
      looksFor: ['No 0DTE entries before the open. Levels shown are from the chain as of now; the opening range is not formed yet.'] };
  }
  const minutesToClose = 960 - m;
  if (m < 600) {
    return { ...base, id: 'open_drive', label: 'Open drive', window: '09:30–10:00', minutesToClose, nextAt: '10:00',
      looksFor: [
        'Opening range (OR30) forming — no structure-gated entry before 09:45.',
        `A (−γ continuation) opens at ${hhmm(POLICY_WINDOWS.A[0].start)}: two 5-min closes holding beyond a measured level (zero-γ, walls, PDH/PDL, OR30 once set) price was on the other side of within 30 min, on the VWAP side.`,
        'B (+γ wall fade) waits for 10:00 — the open is where walls break, not where they hold.',
        'The separate ORB scanner covers opening-range breakouts (baseline, not validated).',
      ] };
  }
  if (m < POWER_HOUR_START) {
    return { ...base, id: 'midday', label: 'Midday', window: '10:00–15:00', minutesToClose, nextAt: '15:00',
      looksFor: [
        'A (−γ continuation) in negative gamma: held break of zero-γ / walls / OR30 / PDH-PDL, next measured level ≥ 1.5R, risk ≤ cap.',
        B ? 'B (+γ wall fade) in positive gamma: a tag of a wall (all-expiry or 0DTE) in the last 15 min, close back inside and turning, stretched from VWAP; target VWAP / zero-γ ≥ 1.5R.'
          : 'B is off 14:30–15:00 (pre-registered window); A still runs.',
        'Neutral gamma, a high-impact release inside ±30 min, stale GEX (>10 min) or bars (>12 min) → WAIT (policy C).',
      ] };
  }
  return { ...base, id: 'power_hour', label: 'Power hour', window: '15:00–16:00', minutesToClose, nextAt: m <= POLICY_WINDOWS.entry.end ? hhmm(POLICY_WINDOWS.entry.end) : '16:00',
    looksFor: [
      'A (−γ) adds HOD/LOD as trigger levels — a held break of the day\'s extreme into the close.',
      'B power-hour PIN (15:00–15:40) in +γ: a tag + rejection at a wall, target VWAP / zero-γ / the same-day max-γ magnet.',
      `No new entries after ${hhmm(POLICY_WINDOWS.entry.end)}; every 0DTE idea is flat by 15:55 ET.`,
      'Scanned every 2 min (every 5 min earlier in the day).',
    ] };
}

// ─── expiries ────────────────────────────────────────────────────────────

export interface DeskExpiry {
  expiry: string | null;
  sameDay: boolean;
  /** '0DTE' or 'nearest: Fri' (+ calendar days) */
  label: string;
  calendarDays: number | null;
  /** Full sessions after today up to and including expiry day. */
  sessionsAfterToday: number | null;
  /** The next 5 listed expiries, for the availability line. */
  upcoming: string[];
}

/** @param afterClose true once today's session is over — today's expiry no longer counts. */
export function pickDeskExpiry(expirations: string[], todayKey: string, afterClose = false): DeskExpiry {
  const list = [...new Set(expirations.filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e)))].sort()
    .filter((e) => (afterClose ? e > todayKey : e >= todayKey));
  const e = list[0] ?? null;
  if (!e) return { expiry: null, sameDay: false, label: 'no listed expiry', calendarDays: null, sessionsAfterToday: null, upcoming: [] };
  const cal = Math.round((Date.parse(`${e}T12:00:00Z`) - Date.parse(`${todayKey}T12:00:00Z`)) / 864e5);
  const sameDay = e === todayKey;
  return {
    expiry: e, sameDay,
    label: sameDay ? '0DTE' : `nearest: ${weekdayOfKey(e)} (${cal}d)`,
    calendarDays: cal,
    sessionsAfterToday: sessionsBetween(todayKey, e),
    upcoming: list.slice(0, 5),
  };
}

// ─── expected move ───────────────────────────────────────────────────────

/** The option shape every chain adapter in the repo produces (Tradier-like). */
export interface DeskChainRow {
  option_type: 'call' | 'put';
  strike: number;
  expiration_date: string;
  bid?: number | null;
  ask?: number | null;
  last?: number | null;
  volume?: number | null;
  open_interest?: number | null;
  greeks?: { delta?: number; gamma?: number; mid_iv?: number; smv_vol?: number } | null;
  greek_source?: string;
}

export interface ExpectedMove {
  source: 'atm_straddle' | 'atm_iv';
  expiry: string;
  strike: number;
  straddle: number | null;
  iv: number | null;
  /** 1σ-style move to the expiry's close, $ and % of spot. */
  toExpiry: number;
  toExpiryPct: number;
  /** Share attributable to what is left of TODAY's session ($ and %). Equals toExpiry on a 0DTE. */
  today: number;
  todayPct: number;
  basis: string;
}

const mid = (r: DeskChainRow): number | null => {
  const b = Number(r.bid); const a = Number(r.ask);
  return b > 0 && a > 0 && a >= b ? (a + b) / 2 : null;
};

/**
 * @param todayFrac        share of today's session still ahead (1 pre-open, 0 after the close)
 * @param sessionsAfterToday  full sessions between today and the expiry (0 on a 0DTE)
 */
export function expectedMoveFor(rows: DeskChainRow[], spot: number, expiry: string, todayFrac: number, sessionsAfterToday: number): ExpectedMove | null {
  if (!(spot > 0)) return null;
  const leg = rows.filter((r) => r.expiration_date === expiry && r.strike > 0);
  if (!leg.length) return null;
  const strikes = [...new Set(leg.map((r) => r.strike))].sort((a, b) => Math.abs(a - spot) - Math.abs(b - spot));
  const tf = Math.min(1, Math.max(0, todayFrac));
  const totalT = tf + Math.max(0, sessionsAfterToday);
  const todayShare = totalT > 0 ? Math.sqrt(tf / totalT) : 0;
  const pack = (source: ExpectedMove['source'], strike: number, straddle: number | null, iv: number | null, move: number, basis: string): ExpectedMove => ({
    source, expiry, strike, straddle, iv,
    toExpiry: move, toExpiryPct: (move / spot) * 100,
    today: move * todayShare, todayPct: (move * todayShare / spot) * 100,
    basis: sessionsAfterToday > 0 ? `${basis}; today's share = √(${tf.toFixed(2)} of a session / ${totalT.toFixed(2)} to expiry)` : basis,
  });
  // 1. Two-sided straddle at the strike nearest spot (look at the 3 nearest).
  for (const k of strikes.slice(0, 3)) {
    const c = leg.find((r) => r.strike === k && r.option_type === 'call');
    const p = leg.find((r) => r.strike === k && r.option_type === 'put');
    const cm = c ? mid(c) : null; const pm = p ? mid(p) : null;
    if (cm != null && pm != null) {
      const straddle = cm + pm;
      return pack('atm_straddle', k, straddle, null, straddle, `ATM ${k} straddle mid $${straddle.toFixed(2)} (call $${cm.toFixed(2)} + put $${pm.toFixed(2)})`);
    }
  }
  // 2. IV of the nearest strike: spot × iv × √(T in years, trading-day basis).
  for (const k of strikes.slice(0, 3)) {
    const ivs = leg.filter((r) => r.strike === k).map((r) => Number(r.greeks?.mid_iv ?? r.greeks?.smv_vol ?? 0)).filter((v) => v > 0 && v < 5);
    if (ivs.length) {
      const iv = ivs.reduce((a, b) => a + b, 0) / ivs.length;
      const move = spot * iv * Math.sqrt(totalT / 252);
      return pack('atm_iv', k, null, iv, move, `no two-sided straddle quote — ATM IV ${(iv * 100).toFixed(1)}% × √(${totalT.toFixed(2)}/252)`);
    }
  }
  return null;
}

/** Share of today's regular session still ahead. */
export function todayFraction(etMin: number): number {
  if (etMin < 570) return 1;
  if (etMin >= 960) return 0;
  return (960 - etMin) / 390;
}

// ─── 0DTE (single-expiry) GEX bucket ─────────────────────────────────────

export interface BucketLevels {
  expiry: string;
  contracts: number;
  callWall: number | null;
  putWall: number | null;
  zeroGamma: number | null;
  maxGamma: number | null;
  regime: 'positive' | 'negative' | 'neutral';
  regimeTitle: string;
  nearFlip: boolean;
  /** Net GEX of this expiry, $ per 1% move. */
  netGex: number;
  basis: string;
  modelledGrossShare: number;
}

/**
 * GEX of ONE expiry. The hub's byDte.today bucket is 0–1 days by a rounded
 * calendar diff, so before the close it mixes the same-day and next-day
 * expiries; this filters by the exact expiry date instead.
 */
export function expiryBucketLevels(symbol: string, rows: DeskChainRow[], spot: number, expiry: string): BucketLevels | null {
  if (!(spot > 0)) return null;
  const inputs: OptionInput[] = [];
  for (const r of rows) {
    if (r.expiration_date !== expiry) continue;
    const i = optionToInput(r, expiry);
    if (i && i.openInterest > 0) inputs.push(i);
  }
  if (inputs.length < 4) return null;
  const snap = computeExposures(symbol, spot, inputs, [expiry]);
  const rr = snap.regimeRead;
  return {
    expiry,
    contracts: snap.contractsUsed,
    callWall: snap.callWall,
    putWall: snap.putWall,
    zeroGamma: snap.zeroGammaLevel,
    maxGamma: snap.maxGammaStrike || null,
    regime: rr.regime,
    regimeTitle: rr.title,
    nearFlip: rr.nearFlip,
    netGex: snap.totalGEX * 1e9,
    basis: rr.basis,
    modelledGrossShare: snap.modelledGrossShare,
  };
}

// ─── ORB / VWAP state ────────────────────────────────────────────────────

export interface IntradayRead {
  vwap: number | null;
  vwapSide: 'above' | 'below' | null;
  vwapDistPct: number | null;
  or30High: number | null;
  or30Low: number | null;
  orbState: 'forming' | 'inside' | 'above' | 'below' | 'n/a';
  lastClose: number | null;
}

export function intradayRead(st: { vwap: number | null; or30High: number | null; or30Low: number | null; lastClose: number | null } | null, etMin: number): IntradayRead {
  if (!st || st.lastClose == null) return { vwap: st?.vwap ?? null, vwapSide: null, vwapDistPct: null, or30High: st?.or30High ?? null, or30Low: st?.or30Low ?? null, orbState: 'n/a', lastClose: null };
  const c = st.lastClose;
  const vwapSide = st.vwap != null ? (c >= st.vwap ? 'above' : 'below') : null;
  const orbState: IntradayRead['orbState'] = etMin >= 570 && etMin < 600 ? 'forming'
    : st.or30High == null || st.or30Low == null ? 'n/a'
    : c > st.or30High ? 'above' : c < st.or30Low ? 'below' : 'inside';
  return { vwap: st.vwap, vwapSide, vwapDistPct: st.vwap ? ((c - st.vwap) / st.vwap) * 100 : null, or30High: st.or30High, or30Low: st.or30Low, orbState, lastClose: c };
}

// ─── engine state ────────────────────────────────────────────────────────

export type EngineStateId = 'no_setup' | 'armed' | 'triggered' | 'in_trade' | 'exited' | 'closed';

export interface DeskIdeaRef {
  id: string;
  direction: 'long' | 'short';
  outcomeStatus: string | null;
  timestamp: string;
  entry: number;
  stop: number;
  target: number;
  exitPrice?: number | null;
  resolutionReason?: string | null;
  kind: '0dte' | 'swing';
}

/** Levels a policy would trigger on if price did the next thing. Descriptive, never a signal. */
export function armedReads(gexSign: 'positive' | 'negative' | 'neutral', price: number | null, levels: Array<{ name: string; price: number | null }>, phase: SessionPhase): string[] {
  if (price == null || !(price > 0) || gexSign === 'neutral' || !phase.entriesOpen) return [];
  const out: string[] = [];
  const ls = levels.filter((l): l is { name: string; price: number } => l.price != null && l.price > 0);
  if (gexSign === 'negative' && phase.policies.A) {
    const above = ls.filter((l) => l.price > price).sort((a, b) => a.price - b.price)[0];
    const below = ls.filter((l) => l.price < price).sort((a, b) => b.price - a.price)[0];
    for (const [l, dir] of [[above, 'long'], [below, 'short']] as const) {
      if (!l) continue;
      const d = Math.abs(l.price - price) / price * 100;
      if (d <= 0.3) out.push(`A ${dir} arms: ${l.name} $${l.price.toFixed(2)} is ${d.toFixed(2)}% away — two 5-min closes ${dir === 'long' ? 'above' : 'below'} it (on the VWAP side) trigger`);
    }
  }
  if (gexSign === 'positive' && phase.policies.B) {
    for (const l of ls.filter((x) => /wall/.test(x.name))) {
      const d = Math.abs(l.price - price) / price * 100;
      if (d <= 0.2) out.push(`B ${l.price > price ? 'short' : 'long'} arms: ${l.name} $${l.price.toFixed(2)} is ${d.toFixed(2)}% away — a tag, then a close back inside and turning, triggers the fade`);
    }
  }
  return out;
}

export interface EngineState { state: EngineStateId; headline: string; why: string[] }

export function deskEngineState(i: {
  phase: SessionPhase;
  setup: ZeroDteSetup | null;
  /** Why the policy waited this pass (policy C and gates). */
  wait: string[];
  /** The setup fired but was not published — why (no account-fit contract, dedup…). */
  withheld?: string | null;
  todays0dte: DeskIdeaRef[];
  armed: string[];
  owner?: string;
}): EngineState {
  const open = i.todays0dte.filter((x) => x.outcomeStatus === 'open' || x.outcomeStatus == null);
  const done = i.todays0dte.filter((x) => x.outcomeStatus && x.outcomeStatus !== 'open');
  const own = i.owner ? ` (${i.owner})` : '';
  if (open.length) {
    const x = open[0];
    return { state: 'in_trade', headline: `In trade — ${x.direction} from $${x.entry.toFixed(2)}, stop $${x.stop.toFixed(2)}, target $${x.target.toFixed(2)}`,
      why: [`Published ${new Date(x.timestamp).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false })} ET${own}; the outcome tracker resolves it on target, stop or the 15:55 ET time stop.`] };
  }
  if (i.setup) {
    const s = i.setup;
    return { state: 'triggered', headline: `Triggered — ${s.policy.startsWith('A') ? 'A · −γ continuation' : s.powerHour ? 'B · power-hour pin' : 'B · +γ wall fade'} ${s.direction} at $${s.entry.toFixed(2)} (${s.rr.toFixed(2)}R)`,
      why: [...(i.withheld ? [`Not published: ${i.withheld}`] : []), ...s.evidence.slice(0, 2)] };
  }
  if (i.phase.id === 'closed' || i.phase.id === 'pre') {
    const last = done[done.length - 1];
    if (last) return { state: 'exited', headline: `Exited — ${last.direction} ${String(last.outcomeStatus).replace('_', ' ')}`, why: [last.resolutionReason ?? 'resolved by the outcome tracker'] };
    return { state: 'closed', headline: i.phase.id === 'pre' ? 'Pre-market — no entries before 09:45 ET' : 'Session closed — nothing new until 09:45 ET', why: [] };
  }
  if (done.length && !i.armed.length) {
    const last = done[done.length - 1];
    return { state: 'exited', headline: `Exited — ${last.direction} ${String(last.outcomeStatus).replace('_', ' ')}; watching for a fresh setup`, why: [...i.wait.slice(0, 2)] };
  }
  if (i.armed.length) return { state: 'armed', headline: 'Setup armed — a level is within reach', why: [...i.armed, ...i.wait.slice(0, 1)] };
  return { state: 'no_setup', headline: 'No setup', why: i.wait.length ? i.wait.slice(0, 3) : ['no measured level near price in a regime that has a rule'] };
}

// ─── short swings (2–4 days) ─────────────────────────────────────────────

export interface SwingInput {
  symbol: string;
  spot: number;
  /** 20-day realized daily σ (decimal), shared/loss-rules realizedVolDaily. */
  sigmaDaily: number | null;
  /** All-expiry dealer regime (the weekly-path model reads the whole book). */
  regime: 'positive' | 'negative' | 'neutral';
  zeroGamma: number | null;
  callWall: number | null;
  putWall: number | null;
  /** Max-γ strike — the weekly-path model's pin magnet. */
  maxGamma: number | null;
  flowLean: 'long' | 'short' | 'flat' | null;
  nowMs: number;
  holdDays?: number;
}

export interface SwingPlan {
  symbol: string;
  verdict: 'plan' | 'no_plan';
  direction: 'long' | 'short' | null;
  entry: number;
  stop: number | null;
  target: number | null;
  /** The structural target before the 1σ cap (kept as the T2 stretch). */
  structuralTarget: number | null;
  capped: boolean;
  rr: number | null;
  holdDays: number;
  maxHoldDays: number;
  sigmaH: number | null;
  timeStopIso: string | null;
  exitByIso: string | null;
  dteWindow: { min: number; max: number; label: string };
  basis: string[];
  wait: string[];
}

/** Structural stop inside [0.35σ, 0.75σ] of the horizon, else 0.5σ — stop width was the #1 loss driver (model validation). */
function boundedStop(dir: 'long' | 'short', spot: number, sigmaH: number, structural: number | null): { stop: number; note: string } {
  const lo = 0.35 * sigmaH; const hi = 0.75 * sigmaH;
  if (structural != null && structural > 0) {
    const d = dir === 'long' ? spot - structural : structural - spot;
    const buffered = d + spot * 0.002;
    if (d > 0 && buffered >= lo && buffered <= hi) {
      return { stop: dir === 'long' ? spot - buffered : spot + buffered, note: `stop beyond the structural level $${structural.toFixed(2)} (+0.2% buffer), ${(buffered / sigmaH).toFixed(2)}σ` };
    }
  }
  const d = 0.5 * sigmaH;
  return { stop: dir === 'long' ? spot - d : spot + d, note: `no structural level inside 0.35–0.75σ — stop at 0.5σ ($${d.toFixed(2)})` };
}

export function planShortSwing(i: SwingInput): SwingPlan {
  const hold = Math.min(SWING_MAX_HOLD_DAYS, Math.max(2, Math.round(i.holdDays ?? SWING_HOLD_DAYS)));
  const w = dteFitWindow(hold, DEFAULT_LOSS_RULES_CONFIG);
  const dteWindow = w ? { min: w.min, max: w.max, label: `${w.label} — loss rule 4` } : { min: 7, max: 21, label: '2-day hold: 7–21 DTE (rule 4 does not bind under 3 days)' };
  const base: SwingPlan = {
    symbol: i.symbol, verdict: 'no_plan', direction: null, entry: i.spot, stop: null, target: null, structuralTarget: null, capped: false, rr: null,
    holdDays: hold, maxHoldDays: SWING_MAX_HOLD_DAYS, sigmaH: null, timeStopIso: null, exitByIso: null, dteWindow, basis: [], wait: [],
  };
  if (!(i.spot > 0)) return { ...base, wait: ['no spot'] };
  if (!(i.sigmaDaily && i.sigmaDaily > 0)) return { ...base, wait: ['no 20-day realized vol — the 1σ cap cannot be sized, so no plan'] };
  const sigmaH = expectedMove(i.spot, i.sigmaDaily, hold);
  base.sigmaH = sigmaH;
  base.basis.push(`1σ over ${hold} sessions = $${sigmaH.toFixed(2)} (${(sigmaH / i.spot * 100).toFixed(2)}%, σ ${(i.sigmaDaily * 100).toFixed(2)}%/day 20-day realized)`);

  let dir: 'long' | 'short' | null = null;
  let structural: number | null = null;
  let stopLevel: number | null = null;
  if (i.regime === 'neutral') return { ...base, wait: ['neutral gamma — the weekly-path model makes no directional claim'] };
  if (i.regime === 'positive') {
    // Weekly-path rule: in long gamma, drift toward the max-γ pin, only when it is far enough to matter.
    const mg = i.maxGamma;
    if (!mg) return { ...base, wait: ['positive gamma but no max-γ magnet'] };
    const dist = mg - i.spot;
    if (Math.abs(dist) < 0.25 * sigmaH) return { ...base, wait: [`positive gamma, pinned: max-γ $${mg.toFixed(2)} is ${(Math.abs(dist) / sigmaH).toFixed(2)}σ away (< 0.25σ) — nothing to swing`] };
    dir = dist > 0 ? 'long' : 'short';
    structural = mg;
    stopLevel = dir === 'long' ? (i.putWall != null && i.putWall < i.spot ? i.putWall : null) : (i.callWall != null && i.callWall > i.spot ? i.callWall : null);
    base.basis.push(`positive gamma — dealers dampen; the weekly-path model drifts toward the max-γ pin $${mg.toFixed(2)} (${dir})`);
  } else {
    // Short gamma widens ranges without picking a side: direction must come from flow AND spot's side of zero-γ.
    if (!i.flowLean || i.flowLean === 'flat') return { ...base, wait: ['negative gamma and no directional flow lean — the model makes no directional claim'] };
    if (i.zeroGamma == null) return { ...base, wait: ['negative gamma but no zero-γ level to anchor the side'] };
    const side = i.spot >= i.zeroGamma ? 'long' : 'short';
    if (side !== i.flowLean) return { ...base, wait: [`negative gamma: flow leans ${i.flowLean} but spot is ${side === 'long' ? 'above' : 'below'} zero-γ $${i.zeroGamma.toFixed(2)} — disagree, no plan`] };
    dir = side;
    structural = dir === 'long' ? (i.callWall != null && i.callWall > i.spot ? i.callWall : null) : (i.putWall != null && i.putWall < i.spot ? i.putWall : null);
    stopLevel = i.zeroGamma;
    base.basis.push(`negative gamma — dealers amplify; flow leans ${dir} with spot on the ${dir === 'long' ? 'upper' : 'lower'} side of zero-γ $${i.zeroGamma.toFixed(2)}`);
  }
  if (i.flowLean && i.flowLean !== 'flat' && i.flowLean !== dir) return { ...base, direction: dir, wait: [`model says ${dir} but today's flow leans ${i.flowLean} — no plan`] };

  const rawTarget = structural ?? (dir === 'long' ? i.spot + sigmaH : i.spot - sigmaH);
  const rawDist = Math.abs(rawTarget - i.spot);
  const capped = rawDist > sigmaH;
  const target = capped ? (dir === 'long' ? i.spot + sigmaH : i.spot - sigmaH) : rawTarget;
  const { stop, note } = boundedStop(dir, i.spot, sigmaH, stopLevel);
  const rr = Math.abs(target - i.spot) / Math.abs(i.spot - stop);
  base.basis.push(capped ? `T1 capped at 1σ: $${rawTarget.toFixed(2)} → $${target.toFixed(2)} (loss rule 3); original kept as T2 stretch` : `T1 $${target.toFixed(2)} inside 1σ`);
  base.basis.push(note);
  if (rr < SWING_MIN_RR) {
    return { ...base, direction: dir, stop, target, structuralTarget: rawTarget, capped, rr, wait: [`R:R ${rr.toFixed(2)} after the 1σ cap < ${SWING_MIN_RR} — no plan`] };
  }
  const ts = planTimeStop(i.nowMs, hold, DEFAULT_LOSS_RULES_CONFIG.timeStopFraction, DEFAULT_LOSS_RULES_CONFIG.timeStopMinR);
  const hard = planTimeStop(i.nowMs, SWING_MAX_HOLD_DAYS, 1, 0);
  return {
    ...base, verdict: 'plan', direction: dir, stop, target, structuralTarget: rawTarget, capped, rr,
    timeStopIso: ts.atIso, exitByIso: hard.atIso,
    basis: [...base.basis, `time stop ${ts.atIso} (half the ${hold}-session horizon) unless ≥ ${ts.minR}R; hard exit by ${hard.atIso} (${SWING_MAX_HOLD_DAYS} sessions)`],
  };
}

// ─── record ──────────────────────────────────────────────────────────────

export interface RecordRow {
  timestamp: string;
  direction: string;
  entryPrice: number;
  stopLoss: number;
  exitPrice?: number | null;
  outcomeStatus?: string | null;
  kind: '0dte' | 'swing';
}

export interface DeskRecord {
  since: string;
  n: number;              // decided (target or stop)
  total: number;          // every logged idea since RECORD_SINCE
  open: number;
  unresolvedClosed: number; // expired / time stop / manual — no target or stop
  wins: number;
  losses: number;
  winRate: number | null;
  avgR: number | null;    // over closed rows with an exit price
  rCount: number;
  firstAt: string | null;
  lastAt: string | null;
  lowN: boolean;
  byKind: Record<'0dte' | 'swing', { n: number; wins: number; losses: number; total: number }>;
}

export function summarizeDeskRecord(rows: RecordRow[], since = RECORD_SINCE): DeskRecord {
  const r = rows.filter((x) => String(x.timestamp) >= since).sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  const byKind = { '0dte': { n: 0, wins: 0, losses: 0, total: 0 }, swing: { n: 0, wins: 0, losses: 0, total: 0 } };
  let wins = 0; let losses = 0; let open = 0; let other = 0; let rSum = 0; let rCount = 0;
  for (const x of r) {
    const k = byKind[x.kind]; k.total++;
    const s = String(x.outcomeStatus ?? 'open');
    if (s === 'open') { open++; continue; }
    if (s === 'hit_target') { wins++; k.wins++; k.n++; } else if (s === 'hit_stop') { losses++; k.losses++; k.n++; } else other++;
    const risk = Math.abs(x.entryPrice - x.stopLoss);
    if (x.exitPrice != null && x.exitPrice > 0 && risk > 0) {
      rSum += (String(x.direction) === 'short' ? x.entryPrice - x.exitPrice : x.exitPrice - x.entryPrice) / risk;
      rCount++;
    }
  }
  const n = wins + losses;
  return {
    since, n, total: r.length, open, unresolvedClosed: other, wins, losses,
    winRate: n ? wins / n : null, avgR: rCount ? rSum / rCount : null, rCount,
    firstAt: r[0]?.timestamp ?? null, lastAt: r[r.length - 1]?.timestamp ?? null,
    lowN: n < LOW_N, byKind,
  };
}
