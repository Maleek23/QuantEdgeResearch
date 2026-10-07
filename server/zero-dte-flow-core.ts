/**
 * 0DTE FLOW IGNITION — pure core (no I/O). The engine (server/zero-dte-flow.ts)
 * fetches chains / bars and writes; this file decides and describes.
 * Unit-tested with synthetic fixtures in scripts/test-zero-dte-flow.ts.
 *
 * The operator's examples (2026-09-30): morning 0DTE / near-dated ATM-ish CALLS
 * on mega caps and index ETFs, bought 09:35–11:30 ET, then +45–470% within
 * 6–260 minutes (AMZN 247.5C 0.85→4.90, AAPL 332.5C 1.32→7.08, SPY 767C,
 * QQQ 742C …) and an SPX bot alert "dominant 0DTE call strike fully unwound →
 * SHORT, play the ATM put". Nothing here claims an edge: every trigger is
 * MEASURING and forward-logged with its outcome.
 *
 * FLOW LEG (live, measured from the option chain itself — options_flow_history
 * sentiment is always 'unknown', so it is not used):
 *   Each cycle reads the 0–2 DTE chain (±2% strikes). A contract's volume growth
 *   since the previous read × its price × 100 is the premium that traded in the
 *   interval. The interval is classed by the contract's LAST print against its
 *   quote at read time: at/near the ask (≥ ask − ¼ spread) = aggressive buy.
 *   That side is applied to the whole interval's volume — a PROXY, stated as one.
 *   Opening flow = today's volume > open interest (Alpaca OI, lags 1–2 sessions).
 *   Bullflow sweeps on the same contract in the window are corroboration (score).
 *
 * TRIGGER (long calls; puts mirror):
 *   ≥ $250K (SPY/QQQ/IWM) / $100K (single names) aggressive premium in the last
 *   10 min on a 0–2 DTE strike from 0.5% ITM to 1.5% OTM, with vol > OI, AND
 *   price above VWAP with the 5-min opening-range high broken and held for the
 *   last 2 closed 1-min bars, AND no opposing GEX wall within 0.5% (call wall
 *   above for longs / put wall below for shorts; unchecked — and said so — when
 *   no wall map is held).
 */
import type { MinuteBar } from './zero-dte-sniper-core';
import { atr5Series, vwapSeries } from './zero-dte-sniper-core';

export type Side = 'long' | 'short';
export type FlowState = 'watch' | 'fired' | 'reached' | 'faded';

export const INDEX_ETFS = ['SPY', 'QQQ', 'IWM'] as const;
export const MEGA_CAPS = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'TSLA', 'AMD', 'AVGO', 'NFLX'] as const;

export const FLOW_CFG = {
  /** Trigger window (ET minutes) — the bot loss-rule entry window. */
  START_MIN: 9 * 60 + 35,
  END_MIN: 11 * 60 + 30,
  /** Fired ideas are marked until the time stop. */
  TIME_STOP_MIN: 15 * 60 + 30,
  WINDOW_MS: 10 * 60_000,
  MAX_DTE: 2,
  CHAIN_BAND: 0.02,
  OTM_MAX: 0.015,
  ITM_MAX: 0.005,
  MIN_PREMIUM_INDEX: Number(process.env.ZERO_DTE_FLOW_MIN_INDEX ?? 250_000),
  MIN_PREMIUM_SINGLE: Number(process.env.ZERO_DTE_FLOW_MIN_SINGLE ?? 100_000),
  OR_MINUTES: 5,
  HOLD_BARS: 2,
  WALL_BLOCK_PCT: 0.005,
  /** A quote at most this old is treated as current. */
  MAX_QUOTE_AGE_MS: 2 * 60_000,
  /**
   * Delayed quotes (2026-10-06): our option feeds are Alpaca INDICATIVE / CBOE (~15 min), so a
   * 2-minute rule refused every trigger ("1 trigger(s), 0 published" all morning). A two-sided
   * quote up to 20 min old with spread ≤ 15% is accepted and LABELLED "delayed quote · Nm".
   */
  MAX_DELAYED_QUOTE_AGE_MS: 20 * 60_000,
  MAX_SPREAD: 0.15,
  T1_GAIN: 0.5,
  T2_GAIN: 1.0,
  PREMIUM_STOP: 0.4,
  MAX_PUBLISH_PER_DAY: 6,
  UNIVERSE_CAP: 20,
  /** Unwind: the dominant strike's net (aggressor-signed) contracts fall ≥ 40% from a peak of ≥ N within 30 min. */
  UNWIND_SYMBOLS: ['SPY'] as string[],
  UNWIND_MIN_PEAK: Number(process.env.ZERO_DTE_FLOW_UNWIND_MIN_PEAK ?? 3_000),
  UNWIND_DROP: 0.4,
  UNWIND_LOOKBACK_MS: 30 * 60_000,
  /** Price rejection from the strike: came within 0.10%, now ≥ 0.25% away on the far side. */
  UNWIND_TOUCH_PCT: 0.001,
  UNWIND_AWAY_PCT: 0.0025,
} as const;

export const FLOW_LOSS_RULES = [
  'Entry only 09:35–11:30 ET; a one-sided quote, a quote older than 20 min, or one wider than 15% of mid is refused; a quote older than 2 min (or from a delayed feed) is labelled "delayed quote · Nm".',
  'Stop: underlying back through VWAP / opening-range mid, or premium −40%, whichever first.',
  'Targets in premium: +50% (T1), +100% (T2). Time stop 15:30 ET — never held into the close.',
  'At most 6 per day, one per symbol per side.',
];

export const isIndex = (sym: string) => (INDEX_ETFS as readonly string[]).includes(sym);
export const premiumFloor = (sym: string) => (isIndex(sym) ? FLOW_CFG.MIN_PREMIUM_INDEX : FLOW_CFG.MIN_PREMIUM_SINGLE);

/** Index ETFs, mega caps, then tracked names; uppercase, deduped, capped. */
export function buildFlowUniverse(tracked: string[], cap: number = FLOW_CFG.UNIVERSE_CAP): string[] {
  const all = [...INDEX_ETFS, ...MEGA_CAPS, ...tracked].map((s) => String(s).trim().toUpperCase()).filter((s) => /^[A-Z.]{1,6}$/.test(s) && s !== 'SPX');
  return Array.from(new Set(all)).slice(0, cap);
}

// ─── flow accumulation ───────────────────────────────────────────────────

export interface ChainRow {
  occ: string; strike: number; type: 'call' | 'put'; expiration: string;
  volume: number; bid: number | null; ask: number | null; last: number | null;
  quoteTime: string | null; openInterest: number | null; delta: number | null;
}
export type PrintSide = 'ask' | 'bid' | 'mid' | 'unknown';
export interface FlowSlice { t: number; contracts: number; premium: number; side: PrintSide }
export interface FlowMemory {
  /** occ → last seen day volume. */
  lastVol: Map<string, number>;
  /** occ → interval slices (pruned to the unwind lookback). */
  slices: Map<string, FlowSlice[]>;
  /** occ → cumulative aggressor-signed contracts (ask +, bid −) since the first read, with its history. */
  net: Map<string, Array<{ t: number; net: number }>>;
}
export const newFlowMemory = (): FlowMemory => ({ lastVol: new Map(), slices: new Map(), net: new Map() });

export function midOf(bid: number | null, ask: number | null): number | null {
  return bid != null && ask != null && ask > 0 && bid >= 0 && ask >= bid ? (bid + ask) / 2 : null;
}

/** The last print against the quote: at/near the ask (≥ ask − ¼ spread) = buyer-initiated. */
export function printSide(last: number | null, bid: number | null, ask: number | null): PrintSide {
  if (last == null || bid == null || ask == null || !(ask >= bid) || ask <= 0) return 'unknown';
  const q = (ask - bid) / 4;
  if (last >= ask - q) return 'ask';
  if (last <= bid + q) return 'bid';
  return 'mid';
}

/**
 * Fold one chain read into memory. `minutesSinceOpen` decides what a first
 * sighting means: inside the 10-min window the whole day volume is in-window
 * (it all traded since 09:30); later it only seeds the baseline.
 */
export function ingestChainRead(mem: FlowMemory, rows: ChainRow[], nowMs: number, minutesSinceOpen: number): void {
  for (const c of rows) {
    const prev = mem.lastVol.get(c.occ);
    mem.lastVol.set(c.occ, c.volume);
    let delta = 0;
    if (prev == null) delta = minutesSinceOpen <= FLOW_CFG.WINDOW_MS / 60_000 ? c.volume : 0;
    else delta = Math.max(0, c.volume - prev); // a provider reset never counts as negative flow
    if (delta <= 0) continue;
    const px = c.last ?? midOf(c.bid, c.ask);
    if (px == null || !(px > 0)) continue;
    const side = printSide(c.last, c.bid, c.ask);
    const arr = mem.slices.get(c.occ) ?? [];
    arr.push({ t: nowMs, contracts: delta, premium: delta * px * 100, side });
    mem.slices.set(c.occ, arr.filter((s) => nowMs - s.t <= FLOW_CFG.UNWIND_LOOKBACK_MS * 2));
    const sign = side === 'ask' ? 1 : side === 'bid' ? -1 : 0;
    const hist = mem.net.get(c.occ) ?? [];
    const before = hist.length ? hist[hist.length - 1].net : 0;
    hist.push({ t: nowMs, net: before + sign * delta });
    mem.net.set(c.occ, hist.length > 400 ? hist.slice(-400) : hist);
  }
}

export interface WindowFlow { aggressive: number; total: number; contracts: number; aggressiveContracts: number }
export function windowFlow(mem: FlowMemory, occ: string, nowMs: number, windowMs: number = FLOW_CFG.WINDOW_MS): WindowFlow {
  const out: WindowFlow = { aggressive: 0, total: 0, contracts: 0, aggressiveContracts: 0 };
  for (const s of mem.slices.get(occ) ?? []) {
    if (nowMs - s.t > windowMs) continue;
    out.total += s.premium; out.contracts += s.contracts;
    if (s.side === 'ask') { out.aggressive += s.premium; out.aggressiveContracts += s.contracts; }
  }
  return out;
}

// ─── structure ───────────────────────────────────────────────────────────

export interface Structure {
  ok: boolean; reason: string | null;
  last: number | null; vwap: number | null; orHigh: number | null; orLow: number | null; orMid: number | null;
  atr5: number | null; heldBars: number; barAt: number | null;
}

/** VWAP + 5-min opening range + "broken and held for the last 2 closed bars" (bars = today's closed RTH 1-min bars). */
export function structureFor(bars: readonly MinuteBar[], side: Side): Structure {
  const empty: Structure = { ok: false, reason: null, last: null, vwap: null, orHigh: null, orLow: null, orMid: null, atr5: null, heldBars: 0, barAt: null };
  const or = bars.filter((b) => b.min >= 570 && b.min < 570 + FLOW_CFG.OR_MINUTES);
  if (or.length < FLOW_CFG.OR_MINUTES - 1) return { ...empty, reason: 'opening range not complete' };
  const after = bars.filter((b) => b.min >= 570 + FLOW_CFG.OR_MINUTES);
  const orHigh = Math.max(...or.map((b) => b.h)); const orLow = Math.min(...or.map((b) => b.l));
  const orMid = (orHigh + orLow) / 2;
  const vw = vwapSeries(bars as MinuteBar[]);
  const atr = atr5Series(bars as MinuteBar[]);
  const lastBar = bars[bars.length - 1];
  const vwap = vw[vw.length - 1] ?? null;
  const s: Structure = { ...empty, last: lastBar?.c ?? null, vwap, orHigh, orLow, orMid, atr5: atr[atr.length - 1] ?? null, barAt: lastBar?.t ?? null };
  if (after.length < FLOW_CFG.HOLD_BARS) return { ...s, reason: `need ${FLOW_CFG.HOLD_BARS} closed bars after the opening range` };
  let held = 0;
  for (let i = after.length - 1; i >= 0; i--) {
    const c = after[i].c;
    if (side === 'long' ? c > orHigh : c < orLow) held++; else break;
  }
  s.heldBars = held;
  const vwOk = vwap != null && (side === 'long' ? lastBar.c > vwap : lastBar.c < vwap);
  if (held < FLOW_CFG.HOLD_BARS) return { ...s, reason: `opening-range ${side === 'long' ? 'high' : 'low'} ${(side === 'long' ? orHigh : orLow).toFixed(2)} not broken and held ${FLOW_CFG.HOLD_BARS} bars (${held})` };
  if (!vwOk) return { ...s, reason: `price ${side === 'long' ? 'not above' : 'not below'} VWAP ${vwap?.toFixed(2) ?? '—'}` };
  return { ...s, ok: true };
}

// ─── walls ───────────────────────────────────────────────────────────────

export interface Walls { callWall: number | null; putWall: number | null; source: string }
/** An opposing wall within 0.5%: call wall just above for longs, put wall just below for shorts. */
export function wallBlock(side: Side, spot: number, walls: Walls | null): { blocked: boolean; checked: boolean; note: string } {
  if (!walls) return { blocked: false, checked: false, note: 'no wall map held — wall leg unchecked' };
  const w = side === 'long' ? walls.callWall : walls.putWall;
  if (w == null) return { blocked: false, checked: true, note: `no ${side === 'long' ? 'call' : 'put'} wall (${walls.source})` };
  const dist = side === 'long' ? (w - spot) / spot : (spot - w) / spot;
  if (dist >= 0 && dist <= FLOW_CFG.WALL_BLOCK_PCT) return { blocked: true, checked: true, note: `${side === 'long' ? 'call' : 'put'} wall ${w} is ${(dist * 100).toFixed(2)}% away (≤ 0.5%) — ${walls.source}` };
  return { blocked: false, checked: true, note: `${side === 'long' ? 'call' : 'put'} wall ${w} ${dist < 0 ? 'already crossed' : `${(dist * 100).toFixed(2)}% away`} (${walls.source})` };
}

// ─── candidates ──────────────────────────────────────────────────────────

export function calendarDays(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T12:00:00Z`) - Date.parse(`${fromKey}T12:00:00Z`)) / 86_400_000);
}

/** Strike from 0.5% ITM to 1.5% OTM, 0–2 DTE, the side's option type. */
export function inBand(c: Pick<ChainRow, 'strike' | 'type' | 'expiration'>, spot: number, side: Side, todayKey: string): boolean {
  const type = side === 'long' ? 'call' : 'put';
  if (c.type !== type) return false;
  const dte = calendarDays(todayKey, c.expiration);
  if (dte < 0 || dte > FLOW_CFG.MAX_DTE) return false;
  const otm = side === 'long' ? (c.strike - spot) / spot : (spot - c.strike) / spot;
  return otm <= FLOW_CFG.OTM_MAX && otm >= -FLOW_CFG.ITM_MAX;
}

export interface FlowLeg {
  occ: string; strike: number; type: 'call' | 'put'; expiry: string; dte: number;
  aggressive: number; total: number; aggressiveContracts: number; dayVolume: number; openInterest: number | null;
  volOverOi: boolean | null; share: number; relSize: number; floor: number; sweeps: number;
}

/** The heaviest aggressive strike for a side, with every flow-leg number (null when no in-band flow at all). */
export function bestFlow(mem: FlowMemory, rows: ChainRow[], sym: string, spot: number, side: Side, todayKey: string, nowMs: number, sweepsFor: (occ: string) => number = () => 0): FlowLeg | null {
  const band = rows.filter((c) => inBand(c, spot, side, todayKey));
  let sideTotal = 0; let best: { c: ChainRow; w: WindowFlow } | null = null;
  for (const c of band) {
    const w = windowFlow(mem, c.occ, nowMs);
    sideTotal += w.aggressive;
    if (w.aggressive > 0 && (!best || w.aggressive > best.w.aggressive)) best = { c, w };
  }
  if (!best) return null;
  const floor = premiumFloor(sym);
  const oi = best.c.openInterest;
  return {
    occ: best.c.occ, strike: best.c.strike, type: best.c.type, expiry: best.c.expiration, dte: calendarDays(todayKey, best.c.expiration),
    aggressive: Math.round(best.w.aggressive), total: Math.round(best.w.total), aggressiveContracts: best.w.aggressiveContracts,
    dayVolume: best.c.volume, openInterest: oi, volOverOi: oi == null ? null : best.c.volume > oi,
    share: sideTotal > 0 ? +(best.w.aggressive / sideTotal).toFixed(3) : 0, relSize: +(best.w.aggressive / floor).toFixed(2), floor,
    sweeps: sweepsFor(best.c.occ),
  };
}

export function flowLegReason(f: FlowLeg | null): string | null {
  if (!f) return 'no aggressive in-band 0–2 DTE flow in the last 10 min';
  if (f.aggressive < f.floor) return `aggressive premium $${Math.round(f.aggressive / 1000)}K < $${Math.round(f.floor / 1000)}K floor`;
  if (f.volOverOi == null) return 'no open interest for the contract — opening flow unproven';
  if (!f.volOverOi) return `day volume ${f.dayVolume} ≤ OI ${f.openInterest} — not opening flow`;
  return null;
}

/** 0–100: flow size vs the floor (≤ 50), dominance on the side (≤ 15), structure margin (≤ 25), Bullflow sweep (10). */
export function scoreTrigger(f: FlowLeg, s: Structure, side: Side): number {
  const flow = Math.max(0, Math.min(50, 25 + 12.5 * Math.log2(Math.max(f.relSize, 0.01))));
  const dom = 15 * Math.max(0, Math.min(1, f.share));
  let struct = s.ok ? 15 : 0;
  if (s.ok && s.last != null && s.vwap != null && s.atr5 && s.atr5 > 0) {
    const d = side === 'long' ? s.last - s.vwap : s.vwap - s.last;
    struct += 10 * Math.max(0, Math.min(1, d / (2 * s.atr5)));
  }
  return Math.round(flow + dom + struct + (f.sweeps > 0 ? 10 : 0));
}

// ─── quote + plan ────────────────────────────────────────────────────────

export interface QuoteCheck {
  ok: boolean; mid: number | null; spreadPct: number | null; ageMs: number | null; reason: string | null;
  /** True when the quote is > 2 min old or came from a delayed feed. */
  delayed: boolean;
  /** "delayed quote · Nm" when delayed, else null — carried into the idea text. */
  label: string | null;
}
export function delayedQuoteLabel(ageMs: number | null): string {
  return `delayed quote · ${ageMs == null ? '?' : Math.max(0, Math.round(ageMs / 60_000))}m`;
}
export function quoteCheck(c: Pick<ChainRow, 'bid' | 'ask' | 'quoteTime'>, nowMs: number, opts: { delayedFeed?: boolean } = {}): QuoteCheck {
  const mid = midOf(c.bid, c.ask);
  const at = c.quoteTime ? Date.parse(c.quoteTime) : NaN;
  const ageMs = Number.isFinite(at) ? Math.max(0, nowMs - at) : null;
  const spreadPct = mid && c.ask != null && c.bid != null ? +((c.ask - c.bid) / mid).toFixed(4) : null;
  const delayed = !!opts.delayedFeed || (ageMs != null && ageMs > FLOW_CFG.MAX_QUOTE_AGE_MS);
  const label = delayed ? delayedQuoteLabel(ageMs) : null;
  const no = (reason: string, m: number | null = mid): QuoteCheck => ({ ok: false, mid: m, spreadPct, ageMs, reason, delayed, label });
  if (mid == null || !(mid > 0) || !(Number(c.bid) > 0) || !(Number(c.ask) > 0)) return no('no two-sided quote', mid != null && mid > 0 ? mid : null);
  if (ageMs == null) return no('quote has no timestamp');
  if (ageMs > FLOW_CFG.MAX_DELAYED_QUOTE_AGE_MS) return no(`quote ${Math.round(ageMs / 60_000)}m old (> ${FLOW_CFG.MAX_DELAYED_QUOTE_AGE_MS / 60_000}m, even for a delayed feed)`);
  if (spreadPct != null && spreadPct > FLOW_CFG.MAX_SPREAD) return no(`spread ${(spreadPct * 100).toFixed(1)}% of mid (> 15%)`);
  return { ok: true, mid: +mid.toFixed(2), spreadPct, ageMs, reason: null, delayed, label };
}

export interface FlowPlan {
  entryPremium: number;
  t1Premium: number; t2Premium: number; stopPremium: number;
  /** Underlying level each premium target maps to — first-order delta, gamma ignored (stated). */
  t1Underlying: number | null; t2Underlying: number | null;
  /** The nearest GEX wall in the trade's direction, if any (a level the move may stall at). */
  wallAhead: number | null;
  stopUnderlying: number; stopBasis: string;
  /**
   * The underlying stop the PUBLISHED idea is tracked on: the farther of the
   * structure stop and the −40% premium stop mapped through delta. A 0DTE plan
   * exits on premium; a VWAP 0.2 points away (GOOGL 345P 2026-10-07: entry
   * 346.23, stop 346.43) would stop the idea out on noise the contract absorbs.
   */
  ideaStopUnderlying: number; ideaStopBasis: string;
  timeStopEt: string;
  mapping: string;
}

export function planFor(side: Side, spot: number, mid: number, delta: number | null, s: Structure, walls: Walls | null): FlowPlan {
  const long = side === 'long';
  const t1Premium = +(mid * (1 + FLOW_CFG.T1_GAIN)).toFixed(2);
  const t2Premium = +(mid * (1 + FLOW_CFG.T2_GAIN)).toFixed(2);
  const stopPremium = +(mid * (1 - FLOW_CFG.PREMIUM_STOP)).toFixed(2);
  const d = delta != null && Math.abs(delta) >= 0.05 ? Math.abs(delta) : null;
  const move = (gain: number) => (d ? (mid * gain) / d : null);
  const lvl = (m: number | null) => (m == null ? null : +(long ? spot + m : spot - m).toFixed(2));
  const vw = s.vwap ?? spot; const om = s.orMid ?? spot;
  // The nearer of VWAP / OR mid that is still on the right side of spot.
  const cands = [{ v: vw, b: 'VWAP' }, { v: om, b: 'opening-range mid' }].filter((x) => (long ? x.v < spot : x.v > spot));
  const pick = cands.sort((a, b) => (long ? b.v - a.v : a.v - b.v))[0] ?? { v: long ? spot * 0.997 : spot * 1.003, b: '0.3% (VWAP / OR mid not on the stop side)' };
  const ahead = walls ? (long ? walls.callWall : walls.putWall) : null;
  const premStopMove = move(FLOW_CFG.PREMIUM_STOP);
  const premStopLvl = premStopMove == null ? null : +(long ? spot - premStopMove : spot + premStopMove).toFixed(2);
  const structStop = +pick.v.toFixed(2);
  const premFarther = premStopLvl != null && (long ? premStopLvl < structStop : premStopLvl > structStop);
  return {
    entryPremium: +mid.toFixed(2), t1Premium, t2Premium, stopPremium,
    t1Underlying: lvl(move(FLOW_CFG.T1_GAIN)), t2Underlying: lvl(move(FLOW_CFG.T2_GAIN)),
    wallAhead: ahead != null && (long ? ahead > spot : ahead < spot) ? ahead : null,
    stopUnderlying: structStop, stopBasis: pick.b,
    ideaStopUnderlying: premFarther ? premStopLvl! : structStop,
    ideaStopBasis: premFarther ? `premium −${Math.round(FLOW_CFG.PREMIUM_STOP * 100)}% mapped by delta ${d!.toFixed(2)}` : pick.b,
    timeStopEt: '15:30',
    mapping: d ? `premium → underlying by delta ${d.toFixed(2)} (first order; gamma makes the real move smaller)` : 'no usable delta — underlying targets not mapped',
  };
}

// ─── live state ──────────────────────────────────────────────────────────

/** fired → reached (mid ≥ +50%) / faded (premium stop, underlying stop, or time stop). Sticky once reached/faded. */
export function liveState(prev: FlowState, p: { entry: number; mid: number | null; spot: number | null; side: Side; stopUnderlying: number; etMin: number }): { state: FlowState; why: string | null } {
  if (prev === 'reached' || prev === 'faded' || prev === 'watch') return { state: prev, why: null };
  if (p.mid != null && p.mid >= p.entry * (1 + FLOW_CFG.T1_GAIN)) return { state: 'reached', why: `mid ${p.mid.toFixed(2)} ≥ +50% of ${p.entry.toFixed(2)}` };
  if (p.mid != null && p.mid <= p.entry * (1 - FLOW_CFG.PREMIUM_STOP)) return { state: 'faded', why: `premium −40% (${p.mid.toFixed(2)})` };
  if (p.spot != null && (p.side === 'long' ? p.spot < p.stopUnderlying : p.spot > p.stopUnderlying)) return { state: 'faded', why: `underlying ${p.spot.toFixed(2)} back through ${p.stopUnderlying}` };
  if (p.etMin >= FLOW_CFG.TIME_STOP_MIN) return { state: 'faded', why: 'time stop 15:30 ET' };
  return { state: 'fired', why: null };
}

// ─── unwind detector (SPY 0DTE dominant strike) ──────────────────────────

export interface UnwindSignal {
  strike: number; strikeType: 'call' | 'put'; occ: string;
  peakNet: number; peakAt: number; nowNet: number; dropPct: number;
  touchHigh: number; last: number; side: Side; text: string;
}

/** The dominant same-day strike per type within ±1.5%: highest day volume (OI as a tie-break). */
export function dominantStrikes(rows: ChainRow[], spot: number, todayKey: string): { call: ChainRow | null; put: ChainRow | null } {
  const zero = rows.filter((c) => c.expiration === todayKey && Math.abs(c.strike - spot) / spot <= 0.015);
  const top = (type: 'call' | 'put') => zero.filter((c) => c.type === type).sort((a, b) => b.volume - a.volume || (b.openInterest ?? 0) - (a.openInterest ?? 0))[0] ?? null;
  return { call: top('call'), put: top('put') };
}

/**
 * The dominant strike's aggressor-signed net (an OI proxy — real OI is a day late)
 * fell ≥ 40% from a peak of ≥ UNWIND_MIN_PEAK inside the lookback, AND price
 * came to the strike and was rejected (call strike: high within 0.10%, last
 * ≥ 0.25% below and falling) → fade with the opposite side.
 */
export function detectUnwind(hist: Array<{ t: number; net: number }>, c: Pick<ChainRow, 'strike' | 'type' | 'occ'>, bars: readonly MinuteBar[], nowMs: number): UnwindSignal | null {
  const recent = hist.filter((h) => nowMs - h.t <= FLOW_CFG.UNWIND_LOOKBACK_MS);
  if (recent.length < 2 || bars.length < 3) return null;
  let peak = recent[0];
  for (const h of recent) if (h.net > peak.net) peak = h;
  const now = recent[recent.length - 1];
  if (peak.net < FLOW_CFG.UNWIND_MIN_PEAK || now.t <= peak.t) return null;
  const drop = (peak.net - now.net) / peak.net;
  if (drop < FLOW_CFG.UNWIND_DROP) return null;
  const since = bars.filter((b) => b.t >= peak.t - 5 * 60_000);
  if (since.length < 2) return null;
  const last = bars[bars.length - 1]; const prev = bars[bars.length - 2];
  const k = c.strike;
  if (c.type === 'call') {
    const hi = Math.max(...since.map((b) => b.h));
    if (hi < k * (1 - FLOW_CFG.UNWIND_TOUCH_PCT) || last.c > k * (1 - FLOW_CFG.UNWIND_AWAY_PCT) || last.c >= prev.c) return null;
    return { strike: k, strikeType: 'call', occ: c.occ, peakNet: peak.net, peakAt: peak.t, nowNet: now.net, dropPct: +drop.toFixed(3), touchHigh: hi, last: last.c, side: 'short',
      text: `dominant 0DTE ${k}C net ${Math.round(peak.net)} → ${Math.round(now.net)} contracts (−${Math.round(drop * 100)}%, aggressor-signed proxy) and price rejected from ${k} (high ${hi.toFixed(2)}, last ${last.c.toFixed(2)}) → fade SHORT` };
  }
  const lo = Math.min(...since.map((b) => b.l));
  if (lo > k * (1 + FLOW_CFG.UNWIND_TOUCH_PCT) || last.c < k * (1 + FLOW_CFG.UNWIND_AWAY_PCT) || last.c <= prev.c) return null;
  return { strike: k, strikeType: 'put', occ: c.occ, peakNet: peak.net, peakAt: peak.t, nowNet: now.net, dropPct: +drop.toFixed(3), touchHigh: lo, last: last.c, side: 'long',
    text: `dominant 0DTE ${k}P net ${Math.round(peak.net)} → ${Math.round(now.net)} contracts (−${Math.round(drop * 100)}%, aggressor-signed proxy) and price bounced from ${k} (low ${lo.toFixed(2)}, last ${last.c.toFixed(2)}) → fade LONG` };
}

/** Nearest-the-money same-day contract of a type (for the unwind fade). */
export function atmContract(rows: ChainRow[], spot: number, type: 'call' | 'put', todayKey: string): ChainRow | null {
  const z = rows.filter((c) => c.type === type && c.expiration === todayKey);
  const pool = z.length ? z : rows.filter((c) => c.type === type && calendarDays(todayKey, c.expiration) <= FLOW_CFG.MAX_DTE);
  return pool.sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot) || a.expiration.localeCompare(b.expiration))[0] ?? null;
}

// ─── outcome (forward log, after the close) ──────────────────────────────

export interface OptMin { t: number; o: number; h: number; l: number; c: number; v: number }
export type FlowResult = 'reached_100' | 'reached_50' | 'stopped' | 'time_stop' | 'no_data';
export interface FlowOutcome {
  result: FlowResult; hit50At: number | null; hit100At: number | null; stoppedAt: number | null; stopReason: string | null;
  maxMult: number | null; exitMult: number | null; minutesTo50: number | null;
}

/**
 * Walk the minutes after entry to the time stop. Per minute the STOP is checked
 * first (a bar that touched both counts as stopped — conservative): underlying
 * close back through the stop level, or option low ≤ entry × 0.6. Targets on
 * the option high: +50%, then +100% (which ends the walk).
 */
export function evaluateFlowOutcome(p: { entry: number; side: Side; stopUnderlying: number; entryAt: number; timeStopAt: number }, opt: readonly OptMin[], under: readonly MinuteBar[]): FlowOutcome {
  const o = opt.filter((b) => b.t >= p.entryAt && b.t < p.timeStopAt);
  const out: FlowOutcome = { result: 'no_data', hit50At: null, hit100At: null, stoppedAt: null, stopReason: null, maxMult: null, exitMult: null, minutesTo50: null };
  if (!o.length || !(p.entry > 0)) return out;
  const u = new Map(under.map((b) => [Math.floor(b.t / 60_000), b]));
  let maxH = 0;
  for (const b of o) {
    const ub = u.get(Math.floor(b.t / 60_000));
    const underStop = ub ? (p.side === 'long' ? ub.c < p.stopUnderlying : ub.c > p.stopUnderlying) : false;
    const premStop = b.l <= p.entry * (1 - FLOW_CFG.PREMIUM_STOP);
    if (underStop || premStop) {
      out.stoppedAt = b.t; out.stopReason = underStop ? 'underlying stop' : 'premium −40%';
      out.exitMult = +((premStop ? p.entry * (1 - FLOW_CFG.PREMIUM_STOP) : b.c) / p.entry).toFixed(3);
      break;
    }
    maxH = Math.max(maxH, b.h);
    if (out.hit50At == null && b.h >= p.entry * (1 + FLOW_CFG.T1_GAIN)) out.hit50At = b.t;
    if (b.h >= p.entry * (1 + FLOW_CFG.T2_GAIN)) { out.hit100At = b.t; out.exitMult = 1 + FLOW_CFG.T2_GAIN; break; }
  }
  out.maxMult = maxH > 0 ? +(maxH / p.entry).toFixed(3) : null;
  out.minutesTo50 = out.hit50At != null ? Math.round((out.hit50At - p.entryAt) / 60_000) : null;
  if (out.hit100At != null) out.result = 'reached_100';
  else if (out.hit50At != null) out.result = 'reached_50';
  else if (out.stoppedAt != null) out.result = 'stopped';
  else { out.result = 'time_stop'; out.exitMult = +(o[o.length - 1].c / p.entry).toFixed(3); }
  return out;
}

export function summarizeFlowOutcomes(recs: Array<{ result: FlowResult; kind: string; published: boolean }>) {
  const by = (xs: typeof recs) => {
    const n = xs.filter((x) => x.result !== 'no_data').length;
    const r50 = xs.filter((x) => x.result === 'reached_50' || x.result === 'reached_100').length;
    const r100 = xs.filter((x) => x.result === 'reached_100').length;
    return { n, reached50: r50, reached100: r100, hit50Rate: n ? +(r50 / n).toFixed(3) : null, noData: xs.length - n };
  };
  return { all: by(recs), ignition: by(recs.filter((r) => r.kind === 'ignition')), unwind: by(recs.filter((r) => r.kind === 'unwind')), published: by(recs.filter((r) => r.published)), lowN: recs.length < 20 };
}
