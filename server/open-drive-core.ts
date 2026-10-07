/**
 * OPEN DRIVE — the index 0DTE engine's 09:31–09:44 ET policy (operator decision 2026-10-06).
 * =========================================================================================
 * Pure. The producer (server/index-scalp-engine.ts) fetches 1-minute bars and the
 * pre-warmed GEX snapshot (server/index-prewarm.ts); this file only decides. The
 * replay (scripts/replay-open-drive.ts) calls the same function on historical bars.
 *
 * Before this, the engine returned "outside 09:45–15:45 ET entry window" for the
 * first fifteen minutes — the most directional stretch of the day — because the
 * A/B policies need a 30-minute opening range and 5-minute bars. Open drive uses
 * 1-minute bars and a 1-minute opening range instead. 09:45 onward A/B are unchanged.
 *
 *   OPENING RANGE  high/low of the first OR_BARS (default 3) one-minute bars from 09:30.
 *   LONG   the last HOLD_BARS (2) closed 1-min bars CLOSE above the OR high (break AND hold)
 *          · price above the prior close OR above the pre-market high
 *          · price above session VWAP
 *          · opening gamma is not pinning (below)
 *   SHORT  mirror: closes below the OR low · below prior close OR below pre-market low · below VWAP.
 *   PIN    net GEX positive AND a pin magnet (0DTE max-gamma strike, or a wall / zero-gamma)
 *          within PIN_PCT of price → WAIT. Missing or stale (>10 min) GEX → WAIT: the pin
 *          cannot be ruled out. Negative / neutral net GEX never pins.
 *   STOP   the other side of the opening range (premium stop −40% on the contract, whichever first).
 *   TARGET the nearest measured wall in the trade's direction; if it is closer than 1R the
 *          wall blocks the move → WAIT; if none is on the board, a 1.5R measured move.
 *          Premium targets +50% / +100% are carried on the idea for the bot's bracket.
 *   CHASE  no entry once price is more than one OR-width beyond the broken edge.
 *   CAPS   one per symbol per day, two in total per day.
 *
 * PROVENANCE: a new, unvalidated policy — status "measuring". It publishes through the same
 * index-scalp source with qualitySignal policy:open_drive so its record is measured on its own.
 */
import type { Bar } from './zero-dte-structure';

export const OPEN_DRIVE_POLICY = 'open_drive' as const;
export const OPEN_DRIVE_WINDOW = { start: 9 * 60 + 31, end: 9 * 60 + 44 } as const; // ET minutes, inclusive
export const OPEN_DRIVE_CAPS = { perSymbol: 1, total: 2 } as const;
export const OPEN_DRIVE_PREMIUM = { stopPct: -40, t1Pct: 50, t2Pct: 100 } as const;
export const OPEN_DRIVE_PROVENANCE =
  'Open-drive policy (09:31–09:44 ET, 1-minute opening range) — NEW and UNVALIDATED, status: measuring. ' +
  'Its record is kept separately (policy:open_drive). Treat as a paper/shadow call.';

const HOLD_BARS = 2;
const PIN_PCT = 0.15;          // % of price
const GEX_MAX_AGE_MS = 10 * 60_000;
const MAX_RISK_PCT = 0.6;
const MIN_OR_PCT = 0.03;
const MEASURED_R = 1.5;
const MIN_WALL_R = 1.0;
const BAR_MS = 60_000;

export interface OpenDriveGex {
  sign: 'positive' | 'negative' | 'neutral';
  zeroGamma: number | null;
  callWall: number | null;
  putWall: number | null;
  /** 0DTE bucket levels (server/zero-dte-desk-core.ts) when available. */
  zeroDte?: { callWall: number | null; putWall: number | null; maxGamma: number | null } | null;
  fetchedAt: string;
}

export interface OpenDriveInput {
  symbol: string;
  /** Today's regular-session 1-minute bars from 09:30, oldest first (the last may be forming). */
  rth: Bar[];
  /** Today's pre-market 1-minute bars (04:00–09:29). Empty = no pre-market levels. */
  pre: Bar[];
  /** Prior session close. */
  pdc: number | null;
  gex: OpenDriveGex | null;
  nowMs: number;
  etMin: number;
  firedToday: { bySymbol: Record<string, number>; total: number };
  orBars?: number;
  /** Replay only: the gamma gate cannot be evaluated on history — skip it and say so. */
  skipGammaGate?: boolean;
}

export interface OpenDriveSetup {
  policy: typeof OPEN_DRIVE_POLICY;
  direction: 'long' | 'short';
  entry: number;
  stop: number;
  target: number;
  targetName: string;
  rr: number;
  orHigh: number;
  orLow: number;
  vwap: number;
  evidence: string[];
  /** ms of the last closed bar used (the trigger bar). */
  triggerAt: number;
}

export interface OpenDriveVerdict { setup: OpenDriveSetup | null; wait: string[] }

const f2 = (x: number) => x.toFixed(2);

export function openDriveOrBars(env: Record<string, string | undefined> = process.env): number {
  return env.OPEN_DRIVE_OR_BARS === '2' ? 2 : 3;
}

/** OPEN_DRIVE=off disables the 09:31–09:44 open-drive policy without a deploy. */
export function openDriveEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return !/^(0|false|off|no)$/i.test(String(env.OPEN_DRIVE ?? '').trim());
}

export function inOpenDriveWindow(etMin: number): boolean {
  return etMin >= OPEN_DRIVE_WINDOW.start && etMin <= OPEN_DRIVE_WINDOW.end;
}

export function evaluateOpenDrive(inp: OpenDriveInput): OpenDriveVerdict {
  const { symbol, nowMs, etMin } = inp;
  const orBars = inp.orBars ?? 3;
  if (!inOpenDriveWindow(etMin)) return { setup: null, wait: ['outside 09:31–09:44 ET open-drive window'] };
  if ((inp.firedToday.bySymbol[symbol] ?? 0) >= OPEN_DRIVE_CAPS.perSymbol) return { setup: null, wait: [`open drive: ${symbol} already fired today (cap ${OPEN_DRIVE_CAPS.perSymbol}/symbol)`] };
  if (inp.firedToday.total >= OPEN_DRIVE_CAPS.total) return { setup: null, wait: [`open drive: daily cap reached (${OPEN_DRIVE_CAPS.total} total)`] };

  const closed = inp.rth.filter((b) => b.t + BAR_MS <= nowMs);
  if (closed.length < orBars + HOLD_BARS) return { setup: null, wait: [`open drive: opening range forming (${closed.length}/${orBars + HOLD_BARS} one-minute bars closed)`] };
  const or = closed.slice(0, orBars);
  const orHigh = Math.max(...or.map((b) => b.h));
  const orLow = Math.min(...or.map((b) => b.l));
  const last = closed[closed.length - 1];
  const price = last.c;
  if (!((orHigh - orLow) / price * 100 >= MIN_OR_PCT)) return { setup: null, wait: [`open drive: opening range too narrow (${f2(orLow)}–${f2(orHigh)})`] };

  let pv = 0; let vv = 0;
  for (const b of closed) if (b.v > 0) { pv += ((b.h + b.l + b.c) / 3) * b.v; vv += b.v; }
  const vwap = vv > 0 ? pv / vv : null;
  if (vwap == null) return { setup: null, wait: ['open drive: no volume — VWAP unavailable'] };

  const hold = closed.slice(-HOLD_BARS);
  const post = closed.slice(orBars);
  const longHold = post.length >= HOLD_BARS && hold.every((b) => b.c > orHigh);
  const shortHold = post.length >= HOLD_BARS && hold.every((b) => b.c < orLow);
  if (!longHold && !shortHold) return { setup: null, wait: [`open drive: no held break of the ${orBars}-min OR ${f2(orLow)}–${f2(orHigh)} (last ${f2(price)})`] };
  const direction: 'long' | 'short' = longHold ? 'long' : 'short';
  const sgn = direction === 'long' ? 1 : -1;
  const orWidth = orHigh - orLow;
  const edge = direction === 'long' ? orHigh : orLow;
  if ((price - edge) * sgn > orWidth) return { setup: null, wait: [`open drive: ${direction} break already extended ${f2(Math.abs(price - edge))} beyond the OR (> one OR width) — no chase`] };

  const preHigh = inp.pre.length ? Math.max(...inp.pre.map((b) => b.h)) : null;
  const preLow = inp.pre.length ? Math.min(...inp.pre.map((b) => b.l)) : null;
  const evidence: string[] = [`${orBars}-min OR ${f2(orLow)}–${f2(orHigh)}; last ${HOLD_BARS} one-minute closes ${direction === 'long' ? 'above' : 'below'} it (${hold.map((b) => f2(b.c)).join(', ')})`];
  if (direction === 'long') {
    const vsPdc = inp.pdc != null && price > inp.pdc;
    const vsPmh = preHigh != null && price > preHigh;
    if (!vsPdc && !vsPmh) return { setup: null, wait: [`open drive: long break but ${f2(price)} is below prior close ${inp.pdc != null ? f2(inp.pdc) : 'n/a'} and pre-market high ${preHigh != null ? f2(preHigh) : 'n/a'}`] };
    if (price <= vwap) return { setup: null, wait: [`open drive: long break but below VWAP ${f2(vwap)}`] };
    evidence.push(vsPdc ? `above prior close ${f2(inp.pdc!)}` : `above pre-market high ${f2(preHigh!)}`, `above VWAP ${f2(vwap)}`);
  } else {
    const vsPdc = inp.pdc != null && price < inp.pdc;
    const vsPml = preLow != null && price < preLow;
    if (!vsPdc && !vsPml) return { setup: null, wait: [`open drive: short break but ${f2(price)} is above prior close ${inp.pdc != null ? f2(inp.pdc) : 'n/a'} and pre-market low ${preLow != null ? f2(preLow) : 'n/a'}`] };
    if (price >= vwap) return { setup: null, wait: [`open drive: short break but above VWAP ${f2(vwap)}`] };
    evidence.push(vsPdc ? `below prior close ${f2(inp.pdc!)}` : `below pre-market low ${f2(preLow!)}`, `below VWAP ${f2(vwap)}`);
  }

  // Gamma: not pinning.
  const g = inp.gex;
  const walls: Array<{ name: string; price: number }> = [];
  if (!inp.skipGammaGate) {
    if (!g) return { setup: null, wait: ['open drive: no opening GEX snapshot — cannot rule out a pin'] };
    const age = nowMs - Date.parse(g.fetchedAt);
    if (!(age <= GEX_MAX_AGE_MS)) return { setup: null, wait: [`open drive: GEX snapshot ${Math.round(age / 60_000)}m old — cannot rule out a pin`] };
    const magnets = [
      { name: '0DTE max-gamma', price: g.zeroDte?.maxGamma ?? null },
      { name: 'call wall', price: g.callWall }, { name: 'put wall', price: g.putWall },
      { name: '0DTE call wall', price: g.zeroDte?.callWall ?? null }, { name: '0DTE put wall', price: g.zeroDte?.putWall ?? null },
      { name: 'zero-gamma', price: g.zeroGamma },
    ].filter((m): m is { name: string; price: number } => m.price != null && m.price > 0);
    if (g.sign === 'positive') {
      const pin = magnets.find((m) => Math.abs(m.price - price) / price * 100 <= PIN_PCT);
      if (pin) return { setup: null, wait: [`open drive: +γ pin — ${pin.name} ${f2(pin.price)} within ${PIN_PCT}% of ${f2(price)}`] };
    }
    evidence.push(`net GEX ${g.sign}${g.sign === 'positive' ? ', no magnet within ' + PIN_PCT + '%' : ' — dealers not dampening'}`);
    for (const m of magnets) if (m.name !== 'zero-gamma' || g.sign !== 'positive') walls.push(m);
  } else {
    evidence.push('gamma gate NOT evaluated (historical replay — no stored opening GEX)');
  }

  const entry = price;
  const stop = direction === 'long' ? orLow : orHigh;
  const risk = Math.abs(entry - stop);
  if (!(risk / entry * 100 <= MAX_RISK_PCT)) return { setup: null, wait: [`open drive: OR stop ${f2(stop)} is ${(risk / entry * 100).toFixed(2)}% away (> ${MAX_RISK_PCT}%)`] };

  const ahead = walls.filter((w) => (w.price - entry) * sgn > 0).sort((a, b) => Math.abs(a.price - entry) - Math.abs(b.price - entry));
  let target: number; let targetName: string;
  if (ahead.length) {
    const w = ahead[0];
    const r = Math.abs(w.price - entry) / risk;
    if (r < MIN_WALL_R) return { setup: null, wait: [`open drive: ${w.name} ${f2(w.price)} only ${r.toFixed(2)}R ahead — no room`] };
    target = w.price; targetName = w.name;
  } else {
    target = entry + sgn * MEASURED_R * risk; targetName = `${MEASURED_R}R measured move (no wall ahead)`;
  }
  const rr = Math.abs(target - entry) / risk;
  evidence.push(`stop ${f2(stop)} (other side of OR) or premium ${OPEN_DRIVE_PREMIUM.stopPct}%; target ${targetName} ${f2(target)}; premium +${OPEN_DRIVE_PREMIUM.t1Pct}% / +${OPEN_DRIVE_PREMIUM.t2Pct}%`);
  return {
    setup: { policy: OPEN_DRIVE_POLICY, direction, entry, stop, target, targetName, rr, orHigh, orLow, vwap, evidence, triggerAt: last.t },
    wait: [],
  };
}
