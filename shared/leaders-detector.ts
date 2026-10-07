/**
 * MOVERS / LEADERS DETECTOR — pure core (2026-10-07, fix/catch-leaders).
 * ======================================================================
 * 2026-10-06: AMD, AAOI, AVGO, ZS, CRWD ran and the platform published none of
 * them — the only stock scanner that saw them ran at 14:58 / 15:30 ET and
 * refused them on the legacy score and a 2R floor. This engine looks for the
 * names that are ALREADY leading the session and states a proper plan for them.
 *
 * Qualify (all must hold, in session, after the opening range completes):
 *   move    |last vs prior close| ≥ 3%  OR  ≥ 2 × ATR%(14)        (minMovePct / minMoveAtrMult)
 *   volume  relative volume ≥ 1.5× — today's cumulative RTH volume vs the mean
 *           of prior sessions' cumulative volume to the SAME minute (time-of-day)
 *   holding long: last close above session VWAP AND above the opening-range high
 *           short: below VWAP AND below the opening-range low
 *   sector  the name's sector-board regime is Leading/Improving (long) or
 *           Weakening (short) — LEADERS_CFG.longRegimes / shortRegimes
 * Trigger (structural entry — never "buy wherever it is"):
 *   continuation  the last closed 5-min bar closed through the prior session high
 *                 (low for shorts) of the day, not more than maxExtensionAtr × daily
 *                 ATR beyond VWAP
 *   retest        within the last `retestBars` closed bars price tagged VWAP or the
 *                 OR high (low) within tolerance and the last bar closed back on the
 *                 trend side, green (red)
 *   none          withheld this pass with the levels it is watching
 * Plan: stop beyond the retested level / VWAP (whichever the trigger defends),
 *   then the shared ATR floor (1.25× ATR(14), or NEXUS_STOP_ATR_MULT) and the
 *   platform snap (shared/levels/snap.ts) for targets (2R/3R formula moved to
 *   structure, expected-move cap); refused under MIN_RR_PUBLISH (1.0R) to T1.
 *
 * Unvalidated: source `leaders`, labelled MEASURING. Caps: 6 per ET day, one per
 * symbol + side per day. Every candidate is logged with why it was published or
 * withheld (server/leaders-scanner.ts).
 */
import { snapPlanToStructure, type SnapHorizon } from './levels/snap';
import type { LevelCluster } from './levels/level-math';

export const LEADERS_SOURCE = 'leaders';
export const LEADERS_VERSION = 'leaders-v1';
export const LEADERS_DATA_SOURCE = 'leaders_detector';

export const LEADERS_CFG = {
  minMovePct: 3,
  minMoveAtrMult: 2,
  minRvol: 1.5,
  /** Minimum prior sessions for a time-of-day RVOL. */
  minRvolSessions: 2,
  /** Opening range length (minutes from 09:30). */
  orMinutes: 15,
  /** Continuation: entry no further than this × daily ATR beyond VWAP. */
  maxExtensionAtr: 1.0,
  /** Retest: look-back in closed 5-min bars, and the touch tolerance as a fraction of daily ATR. */
  retestBars: 3,
  retestTolAtr: 0.1,
  /** Structural stop pad beyond the defended level, × daily ATR. */
  stopPadAtr: 0.1,
  stopFloorAtr: 1.25,
  formulaTargetsR: [2, 3] as const,
  maxPerDay: 6,
  /** No new leaders before the OR completes or after this ET minute (the last slot is 15:32). */
  lastEntryEt: 15 * 60 + 35,
  longRegimes: ['leading', 'improving'] as const,
  shortRegimes: ['weakening'] as const,
  /** Stage-A prefilter: fetch structure for at most this many movers per pass. */
  maxDeepReads: 25,
  /** Universe: top-N liquid names (plus every board leader). */
  universeN: 300,
  optionMinPrice: 10,
  option: { delta: 0.4, dteMin: 14, dteMax: 45 },
} as const;

export type Side = 'long' | 'short';
export interface Bar5 { t: number; o: number; h: number; l: number; c: number; v: number }

const r2 = (x: number) => Math.round(x * 100) / 100;
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const BAR_MS = 5 * 60_000;

// ─── ET clock, cached per UTC hour (bars are thousands; Intl is slow) ─────

const hourCache = new Map<number, { dateKey: string; min0: number }>();
const ET_FMT = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
export function etKeyMin(ms: number): { dateKey: string; min: number } {
  const hour = Math.floor(ms / 3_600_000);
  let h = hourCache.get(hour);
  if (!h) {
    const p: Record<string, string> = {};
    for (const x of ET_FMT.formatToParts(new Date(hour * 3_600_000))) p[x.type] = x.value;
    h = { dateKey: `${p.year}-${p.month}-${p.day}`, min0: (Number(p.hour) % 24) * 60 + Number(p.minute) };
    if (hourCache.size > 5000) hourCache.clear();
    hourCache.set(hour, h);
  }
  return { dateKey: h.dateKey, min: h.min0 + Math.floor((ms % 3_600_000) / 60_000) };
}

// ─── session read ─────────────────────────────────────────────────────────

export interface SessionRead {
  dateKey: string;
  /** ET minute the read is through (end of the last closed bar). */
  throughMin: number;
  last: number;
  lastBar: Bar5;
  vwap: number;
  orHigh: number;
  orLow: number;
  /** Session high / low BEFORE the last closed bar. */
  hodPrior: number;
  lodPrior: number;
  cumVol: number;
  rvol: number | null;
  rvolSessions: number;
  /** Closed bars today, oldest first. */
  closed: Bar5[];
  /** Prior regular-session close found in the bars (null when the bars hold no prior session). */
  prevCloseFromBars: number | null;
}

/**
 * Read today's regular session from 5-minute bars (any mix of days, any order,
 * extended hours dropped). Null when the opening range has not completed or no
 * bar has closed after it.
 */
export function readSession(bars: Bar5[], nowMs: number, cfg = LEADERS_CFG): SessionRead | null {
  const today = etKeyMin(nowMs).dateKey;
  const byDay = new Map<string, Array<Bar5 & { min: number }>>();
  for (const b of bars) {
    if (!(fin(b.t) && fin(b.c) && b.c > 0)) continue;
    const k = etKeyMin(b.t);
    if (k.min < 570 || k.min >= 960) continue;
    if (k.dateKey > today) continue;
    const arr = byDay.get(k.dateKey) ?? [];
    arr.push({ ...b, min: k.min });
    byDay.set(k.dateKey, arr);
  }
  const todays = (byDay.get(today) ?? []).sort((a, b) => a.t - b.t);
  const closed = todays.filter((b) => b.t + BAR_MS <= nowMs);
  const orEnd = 570 + cfg.orMinutes;
  const orBars = closed.filter((b) => b.min < orEnd);
  const after = closed.filter((b) => b.min >= orEnd);
  if (!orBars.length || !after.length || orBars[orBars.length - 1].min + 5 < orEnd) return null;
  const last = closed[closed.length - 1];
  const throughMin = last.min + 5;

  let pv = 0; let vv = 0; let cumVol = 0;
  for (const b of closed) { cumVol += b.v; if (b.v > 0) { pv += ((b.h + b.l + b.c) / 3) * b.v; vv += b.v; } }
  if (!(vv > 0)) return null;
  const prior = closed.slice(0, -1);

  const priorDays = Array.from(byDay.keys()).filter((d) => d < today).sort();
  const cums: number[] = [];
  for (const d of priorDays.slice(-10)) {
    const dayBars = byDay.get(d)!;
    if (dayBars.length < 30) continue; // half sessions / gaps make a poor yardstick
    let c = 0; for (const b of dayBars) if (b.min < throughMin) c += b.v;
    if (c > 0) cums.push(c);
  }
  const base = cums.length ? cums.reduce((a, b) => a + b, 0) / cums.length : 0;
  const prevDay = priorDays.length ? byDay.get(priorDays[priorDays.length - 1])!.sort((a, b) => a.t - b.t) : [];
  return {
    dateKey: today, throughMin, last: last.c, lastBar: last,
    vwap: pv / vv,
    orHigh: Math.max(...orBars.map((b) => b.h)), orLow: Math.min(...orBars.map((b) => b.l)),
    hodPrior: prior.length ? Math.max(...prior.map((b) => b.h)) : last.h,
    lodPrior: prior.length ? Math.min(...prior.map((b) => b.l)) : last.l,
    cumVol,
    rvol: cums.length >= cfg.minRvolSessions && base > 0 ? r2(cumVol / base) : null,
    rvolSessions: cums.length,
    closed,
    prevCloseFromBars: prevDay.length ? prevDay[prevDay.length - 1].c : null,
  };
}

/** 14-period simple ATR from completed daily bars (same definition as server/lib/atr-stop-floor atr14). */
export function dailyAtr14(daily: Array<{ high: number; low: number; close: number }>): number | null {
  const d = daily.slice(-16);
  if (d.length < 15) return null;
  const tr = d.slice(1).map((b, i) => Math.max(b.high - b.low, Math.abs(b.high - d[i].close), Math.abs(b.low - d[i].close)));
  const atr = tr.reduce((a, b) => a + b, 0) / tr.length;
  return Number.isFinite(atr) && atr > 0 ? atr : null;
}

// ─── qualify ──────────────────────────────────────────────────────────────

export interface QualifyInput {
  symbol: string;
  prevClose: number;
  atr: number | null;
  read: SessionRead;
  /** Sector-board regime for the name's sector, or null when unmapped. */
  regime: string | null;
  sectorLabel?: string | null;
}
export interface Qualify {
  ok: boolean;
  side: Side;
  movePct: number;
  atrPct: number | null;
  /** Threshold the move was held to: min(minMovePct, minMoveAtrMult × ATR%). */
  threshold: number;
  checks: Array<{ key: 'move' | 'rvol' | 'vwap' | 'or' | 'sector'; pass: boolean; detail: string }>;
  reason: string | null;
}

export function qualify(i: QualifyInput, cfg = LEADERS_CFG): Qualify {
  const { read } = i;
  const movePct = r2((read.last / i.prevClose - 1) * 100);
  const side: Side = movePct >= 0 ? 'long' : 'short';
  const L = side === 'long';
  const atrPct = i.atr && i.atr > 0 ? r2((i.atr / i.prevClose) * 100) : null;
  const threshold = atrPct != null ? Math.min(cfg.minMovePct, cfg.minMoveAtrMult * atrPct) : cfg.minMovePct;
  const sideRegimes: readonly string[] = L ? cfg.longRegimes : cfg.shortRegimes;
  const checks: Qualify['checks'] = [
    { key: 'move', pass: Math.abs(movePct) + 1e-9 >= threshold, detail: `${movePct >= 0 ? '+' : ''}${movePct.toFixed(2)}% vs prior close (needs ${threshold.toFixed(2)}%: ${cfg.minMovePct}% or ${cfg.minMoveAtrMult}× ATR% ${atrPct ?? '—'}%)` },
    { key: 'rvol', pass: read.rvol != null && read.rvol + 1e-9 >= cfg.minRvol, detail: read.rvol == null ? `relative volume unknown (${read.rvolSessions} prior session(s) in the bars)` : `${read.rvol.toFixed(2)}× time-of-day volume (needs ${cfg.minRvol}×, ${read.rvolSessions} sessions)` },
    { key: 'vwap', pass: L ? read.last > read.vwap : read.last < read.vwap, detail: `last $${r2(read.last)} ${read.last > read.vwap ? 'above' : 'below'} VWAP $${r2(read.vwap)}` },
    { key: 'or', pass: L ? read.last > read.orHigh : read.last < read.orLow, detail: `${L ? `OR high $${r2(read.orHigh)}` : `OR low $${r2(read.orLow)}`} (${cfg.orMinutes}-min opening range)` },
    { key: 'sector', pass: i.regime != null && sideRegimes.includes(i.regime), detail: i.regime == null ? 'no sector-board read for this name' : `${i.sectorLabel ?? 'sector'} reads ${i.regime} (${side} needs ${sideRegimes.join('/')})` },
  ];
  const failed = checks.filter((c) => !c.pass);
  return { ok: failed.length === 0, side, movePct, atrPct, threshold: r2(threshold), checks, reason: failed.length ? failed.map((c) => `${c.key}: ${c.detail}`).join('; ') : null };
}

// ─── trigger ──────────────────────────────────────────────────────────────

export type TriggerRule = 'continuation' | 'vwap_retest' | 'or_retest';
export const TRIGGER_LABEL: Record<TriggerRule, string> = {
  continuation: 'continuation through the session high',
  vwap_retest: 'pullback to VWAP held',
  or_retest: 'opening-range retest held',
};
export interface Trigger {
  rule: TriggerRule;
  entry: number;
  /** The level the trigger defends (stop goes beyond it). */
  defended: number;
  defendedLabel: string;
  text: string;
}

export function findTrigger(side: Side, read: SessionRead, atr: number, cfg = LEADERS_CFG): { trigger: Trigger | null; watching: string } {
  const L = side === 'long'; const s = L ? 1 : -1;
  const last = read.lastBar;
  const orEdge = L ? read.orHigh : read.orLow;
  const tol = cfg.retestTolAtr * atr;
  const recent = read.closed.slice(-cfg.retestBars);
  const closedOnSide = L ? last.c > last.o : last.c < last.o;
  const watching = `watching: pullback to VWAP $${r2(read.vwap)} / OR ${L ? 'high' : 'low'} $${r2(orEdge)}, or a 5-min close ${L ? 'above' : 'below'} $${r2(L ? read.hodPrior : read.lodPrior)}`;

  // Retest first — the better-located entry when both are true.
  if (closedOnSide) {
    const touched = (lvl: number) => recent.some((b) => (L ? b.l <= lvl + tol : b.h >= lvl - tol)) && s * (last.c - lvl) > 0;
    // The nearer defended level wins (VWAP vs OR edge), whichever was actually tagged.
    const cands: Array<{ rule: TriggerRule; lvl: number; label: string }> = [
      { rule: 'vwap_retest', lvl: read.vwap, label: 'VWAP' },
      { rule: 'or_retest', lvl: orEdge, label: `OR ${L ? 'high' : 'low'}` },
    ];
    const hit = cands.filter((c) => touched(c.lvl)).sort((a, b) => Math.abs(last.c - a.lvl) - Math.abs(last.c - b.lvl))[0];
    if (hit) {
      return {
        trigger: { rule: hit.rule, entry: r2(last.c), defended: hit.lvl, defendedLabel: hit.label, text: `${TRIGGER_LABEL[hit.rule]}: tagged ${hit.label} $${r2(hit.lvl)} and closed back ${L ? 'up' : 'down'} at $${r2(last.c)}` },
        watching,
      };
    }
  }
  const brk = L ? read.hodPrior : read.lodPrior;
  if (s * (last.c - brk) > 0) {
    const ext = s * (last.c - read.vwap);
    if (ext > cfg.maxExtensionAtr * atr) {
      return { trigger: null, watching: `extended: $${r2(last.c)} is ${(ext / atr).toFixed(2)}× ATR beyond VWAP (max ${cfg.maxExtensionAtr}×) — ${watching}` };
    }
    // Continuation defends the nearer of VWAP and the OR edge on the trend side.
    const lv = [{ lvl: read.vwap, label: 'VWAP' }, { lvl: orEdge, label: `OR ${L ? 'high' : 'low'}` }]
      .filter((x) => s * (last.c - x.lvl) > 0)
      .sort((a, b) => Math.abs(last.c - a.lvl) - Math.abs(last.c - b.lvl))[0] ?? { lvl: read.vwap, label: 'VWAP' };
    return {
      trigger: { rule: 'continuation', entry: r2(last.c), defended: lv.lvl, defendedLabel: lv.label, text: `${TRIGGER_LABEL.continuation}: 5-min close $${r2(last.c)} ${L ? 'above' : 'below'} the prior session ${L ? 'high' : 'low'} $${r2(brk)}` },
      watching,
    };
  }
  return { trigger: null, watching: `no trigger yet — ${watching}` };
}

// ─── plan ─────────────────────────────────────────────────────────────────

export interface PlanInput {
  side: Side;
  trigger: Trigger;
  atr: number;
  clusters: LevelCluster[];
  tolerance: number;
  maxTarget: number | null;
  minRR: number;
  /** ATR multiple for the stop floor (nexusStopAtrK on the server). */
  floorK?: number;
  horizon?: SnapHorizon;
  levelsAsOf?: string;
}
export interface LeaderPlan {
  entry: number; stop: number; t1: number; t2: number | null; rr: number;
  structuralStop: number; stopBasis: string; t1Basis: string; snapText: string;
}

export function planLeader(i: PlanInput, cfg = LEADERS_CFG): { plan: LeaderPlan | null; reason: string | null } {
  const L = i.side === 'long'; const s = L ? 1 : -1;
  const { entry, defended, defendedLabel } = i.trigger;
  const k = i.floorK ?? cfg.stopFloorAtr;
  const structuralStop = r2(defended - s * cfg.stopPadAtr * i.atr);
  if (!(s * (entry - structuralStop) > 0)) return { plan: null, reason: 'no valid plan: defended level is not behind entry' };
  // Floor first (further of structure and k × ATR), then targets from the 2R/3R formula snapped to structure.
  const floorStop = r2(entry - s * k * i.atr);
  const stop0 = s * (structuralStop - floorStop) < 0 ? structuralStop : floorStop;
  const risk0 = Math.abs(entry - stop0);
  const targets = cfg.formulaTargetsR.map((m) => r2(entry + s * m * risk0));
  const snap = snapPlanToStructure({
    direction: i.side, entry, stop: stop0, targets, clusters: i.clusters, horizon: i.horizon ?? 'swing',
    tolerance: i.tolerance, dailyAtr: i.atr, stopFloorAtr: k, maxTarget: i.maxTarget, levelsAsOf: i.levelsAsOf,
  });
  const stop = snap.stop; const t1 = snap.targets[0]; const t2raw = snap.targets[1];
  const risk = Math.abs(entry - stop);
  if (!(risk > 0) || !fin(t1) || !(s * (t1 - entry) > 0)) return { plan: null, reason: 'no valid plan: snap left no target beyond entry' };
  const rr = r2(Math.abs(t1 - entry) / risk);
  if (rr + 1e-9 < i.minRR) return { plan: null, reason: `T1 $${r2(t1)} is ${rr.toFixed(2)}R on the $${r2(stop)} stop (< ${i.minRR.toFixed(2)}R after the ATR floor and the expected-move cap)` };
  const lv = snap.targetLevels[0];
  return {
    plan: {
      entry, stop, t1, t2: fin(t2raw) && s * (t2raw - t1) > 0.004 ? t2raw : null, rr, structuralStop,
      stopBasis: snap.stopLevel
        ? `beyond ${snap.stopLevel.label} (${snap.stopLevel.families} families)`
        : stop0 === structuralStop ? `beyond ${defendedLabel} $${r2(defended)} (wider than ${k}× ATR)` : `${k}× ATR(14) floor (${defendedLabel} $${r2(defended)} is the thesis line)`,
      t1Basis: lv ? `${lv.label} (${lv.families} families)` : `${cfg.formulaTargetsR[0]}R formula${i.maxTarget != null && Math.abs(t1 - i.maxTarget) < 0.01 ? ', capped at the expected move' : ''} — not structure`,
      snapText: snap.text,
    },
    reason: null,
  };
}

// ─── caps ─────────────────────────────────────────────────────────────────

export function readLeadersEnv(env: Record<string, string | undefined> = {}): { enabled: boolean; cap: number } {
  const enabled = String(env.LEADERS_IDEAS ?? '').toLowerCase() !== 'false';
  const n = Number(env.LEADERS_MAX_PER_DAY);
  const cap = Number.isFinite(n) && n >= 0 ? Math.min(20, Math.floor(n)) : LEADERS_CFG.maxPerDay;
  return { enabled, cap };
}

export function capCheck(symbol: string, side: Side, st: { publishedToday: number; keys: Set<string> }, cap: number): { ok: boolean; reason: string | null } {
  if (st.publishedToday >= cap) return { ok: false, reason: `daily cap reached (${st.publishedToday}/${cap})` };
  if (st.keys.has(`${symbol}|${side}`)) return { ok: false, reason: `already published ${symbol} ${side} today (1 per symbol/side/day)` };
  return { ok: true, reason: null };
}

export const LEADERS_HONESTY = 'Measuring — unvalidated. A session leader is a name already moving on volume in a sector the board reads as leading; the engine adds a structural entry, an ATR-floored stop and level-snapped targets. Whether chasing confirmed leaders pays is exactly what source `leaders` exists to measure.';
