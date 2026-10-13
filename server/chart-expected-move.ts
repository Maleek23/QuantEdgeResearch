/**
 * CHART EXPECTED MOVE — "priced range (options)" for the CHART tab.
 *
 *   daily   the nearest listed expiry's ATM straddle mid (IV × √T when there is
 *           no two-sided quote — zero-dte-desk-core expectedMoveFor), scaled to
 *           TODAY's share of the time to that expiry; ANCHORED at the first read
 *           of the session (spot + move frozen, with the anchor time), so the
 *           lines are fixed for the day instead of following price.
 *   weekly  the last listed expiry on or before this week's Friday, to that
 *           expiry; anchored at the first read of the week.
 *   cone    forward from the CURRENT spot: ±(per-session move) × √(sessions
 *           ahead). The per-session move is the weekly (else daily) straddle ÷
 *           √(sessions to its expiry). The √t scaling is a MODEL — labelled so.
 *
 * Chain: the 0DTE desk's chain cache (Alpaca indicative, CBOE delayed for
 * SPX / fallback) — no extra provider budget when the desk already holds it.
 * Anchors persist in .cache/chart-em so a restart keeps the day's lines; a
 * restart before the first read simply anchors later, and the stamp says when.
 */
import fs from 'fs';
import path from 'path';
import { marketDateET } from '@shared/market-day';
import { horizonLastExpiry } from '@shared/gex-horizon';
import { logger } from './logger';

export interface EmLine {
  /** Spot the range is centred on (at anchorAt). */
  anchorSpot: number;
  anchorAt: string;
  /** Session date (daily) or the week's expiry (weekly) this anchor belongs to. */
  key: string;
  move: number;
  movePct: number;
  upper: number;
  lower: number;
  expiry: string;
  source: 'atm_straddle' | 'atm_iv';
  basis: string;
}
export interface ExpectedMovePayload {
  symbol: string;
  generatedAt: string;
  label: 'priced range (options)';
  spot: number | null;
  chainSource: string | null;
  chainAgeSec: number | null;
  daily: EmLine | null;
  weekly: EmLine | null;
  cone: null | { fromSpot: number; perSessionMove: number; basis: string };
  note: string;
}

const DIR = path.join(process.cwd(), '.cache', 'chart-em');
const anchors = new Map<string, { daily?: EmLine; weekly?: EmLine }>();
const safe = (s: string) => s.replace(/[^A-Z0-9.^]/gi, '');

function loadAnchors(sym: string) {
  if (anchors.has(sym)) return anchors.get(sym)!;
  let a: { daily?: EmLine; weekly?: EmLine } = {};
  try { a = JSON.parse(fs.readFileSync(path.join(DIR, `${safe(sym)}.json`), 'utf8')) ?? {}; } catch { /* none yet */ }
  anchors.set(sym, a);
  return a;
}
function saveAnchors(sym: string, a: { daily?: EmLine; weekly?: EmLine }) {
  anchors.set(sym, a);
  fs.promises.mkdir(DIR, { recursive: true })
    .then(() => fs.promises.writeFile(path.join(DIR, `${safe(sym)}.json`), JSON.stringify(a)))
    .catch(() => { /* memory still serves */ });
}

function etMinute(ms: number): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ms));
  const v = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return (v('hour') % 24) * 60 + v('minute');
}

/** Per-session 1σ-style move from a move priced to an expiry `totalSessions` away (√t; modelled). Pure. */
export function perSessionMove(toExpiry: number, totalSessions: number): number | null {
  return totalSessions > 0 && toExpiry > 0 ? toExpiry / Math.sqrt(totalSessions) : null;
}

/** Cone half-width `sessionsAhead` sessions forward (√t; modelled). Pure. */
export function coneHalfWidth(perSession: number, sessionsAhead: number): number {
  return perSession * Math.sqrt(Math.max(0, sessionsAhead));
}

export async function buildExpectedMove(sym: string, nowMs = Date.now()): Promise<ExpectedMovePayload> {
  const base: ExpectedMovePayload = {
    symbol: sym, generatedAt: new Date(nowMs).toISOString(), label: 'priced range (options)',
    spot: null, chainSource: null, chainAgeSec: null, daily: null, weekly: null, cone: null,
    note: 'Priced range from the options market (ATM straddle mid; IV × √T when no two-sided quote). Not a forecast of direction.',
  };
  const { getDeskChain } = await import('./zero-dte-desk');
  const core = await import('./zero-dte-desk-core');
  let chain = null;
  try { chain = await getDeskChain(sym, true); } catch (e) { logger.debug?.(`[CHART-EM] ${sym} chain: ${(e as Error).message}`); }
  if (!chain || !(chain.spot > 0)) return { ...base, note: `No option chain for ${sym} right now — no priced range is shown (nothing is estimated in its place).` };

  const spot = chain.spot;
  const todayKey = marketDateET(new Date(nowMs));
  const etMin = etMinute(nowMs);
  const afterClose = etMin >= 960;
  const tf = core.todayFraction(etMin);
  const a = loadAnchors(sym);
  const out: ExpectedMovePayload = { ...base, spot, chainSource: chain.source, chainAgeSec: Math.max(0, Math.round((nowMs - chain.fetchedAt) / 1000)) };
  const line = (key: string, em: NonNullable<ReturnType<typeof core.expectedMoveFor>>, move: number): EmLine => ({
    anchorSpot: spot, anchorAt: new Date(nowMs).toISOString(), key,
    move, movePct: (move / spot) * 100, upper: spot + move, lower: spot - move,
    expiry: em.expiry, source: em.source, basis: em.basis,
  });

  // daily
  const sessionKey = afterClose ? null : todayKey;
  const d = core.pickDeskExpiry(chain.expirations, todayKey, afterClose);
  const emD = d.expiry ? core.expectedMoveFor(chain.rows, spot, d.expiry, afterClose ? 1 : tf, d.sessionsAfterToday ?? 0) : null;
  let perSession: number | null = null;
  if (emD) {
    perSession = perSessionMove(emD.toExpiry, (afterClose ? 1 : tf) + (d.sessionsAfterToday ?? 0));
    const key = sessionKey ?? `next:${d.expiry}`;
    if (a.daily?.key === key) out.daily = a.daily;
    else { out.daily = line(key, emD, emD.today > 0 ? emD.today : emD.toExpiry); a.daily = out.daily; }
  }

  // weekly — the last listed expiry on/before this week's Friday
  const friday = horizonLastExpiry('week', nowMs);
  const wExp = [...new Set(chain.expirations)].filter((e) => e <= (friday ?? '') && (afterClose ? e > todayKey : e >= todayKey)).sort().pop() ?? null;
  if (wExp) {
    const sessions = core.sessionsBetween(todayKey, wExp);
    const emW = core.expectedMoveFor(chain.rows, spot, wExp, afterClose ? 0 : tf, sessions);
    if (emW) {
      const ps = perSessionMove(emW.toExpiry, (afterClose ? 0 : tf) + sessions);
      if (ps != null) perSession = ps;
      if (a.weekly?.key === wExp) out.weekly = a.weekly;
      else { out.weekly = line(wExp, emW, emW.toExpiry); a.weekly = out.weekly; }
    }
  }
  saveAnchors(sym, a);

  if (perSession != null) {
    out.cone = {
      fromSpot: spot, perSessionMove: perSession,
      basis: `modelled: ±${perSession.toFixed(2)} per session × √(sessions ahead), from the ${out.weekly ? 'weekly' : 'daily'} priced move; holidays not excluded`,
    };
  }
  return out;
}
