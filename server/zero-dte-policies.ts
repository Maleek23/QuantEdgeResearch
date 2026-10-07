/**
 * INDEX 0DTE POLICIES — pre-registered, structural, and labelled unvalidated.
 * ==========================================================================
 * Pure functions. The producer (server/index-scalp-engine.ts) fetches the
 * inputs; this file only decides.
 *
 * PROVENANCE — read before trusting any output:
 *   • Policies A and B are the pre-registered family in
 *     research/SPX-0DTE-RESEARCH-AND-VALIDATION.md (2026-09-25). Their only
 *     executable test so far is a 5-observation pilot (1 target, 4 stops) —
 *     "insufficient coverage", NOT a validation. Every idea says so.
 *   • spx_session stays suspended (SR 11-7 2026-09-24: −0.27R; live record
 *     WR 9.2% over 193 trades). Nothing here reuses its signals.
 *   • The validated reversal detector (research/validate-bottom-reversal.ts) is
 *     a DAILY-bar, 10-session model; it has no intraday analogue and is not
 *     borrowed here. The 2026-09-24 validation found intraday "HOD/LOD key
 *     level / VWAP / urgency" TAGS the worst predictors — so VWAP here is a
 *     side-of-mean confirmation inside a gamma-regime rule, never a trigger.
 *   • Levels: zero-gamma and walls from the spot-grid GEX engine
 *     (shared/gex-math.ts, gap-filled chain); VWAP / opening range / prior-day
 *     levels from 5-minute bars (server/zero-dte-structure.ts).
 *
 *   A · NEGATIVE-GAMMA CONTINUATION (09:45–15:45 ET)
 *       net GEX < 0 (dealers amplify) · the last two closed 5-min bars hold
 *       beyond a measured level that price was on the other side of within the
 *       last 30 min · price on the break side of VWAP · stop = back inside the
 *       level (0.10%) · target = the next measured level · R:R ≥ 1.5 · risk ≤ 0.6%.
 *   B · POSITIVE-GAMMA WALL FADE (10:00–14:30 ET; 15:00–15:40 as power-hour pin)
 *       net GEX > 0 (dealers dampen) · a bar in the last three tagged the wall ·
 *       the last close is back inside it and turning · price stretched away from
 *       VWAP on the wall side · stop = beyond the wall's high/low (0.10%) ·
 *       target = VWAP or zero-gamma, whichever is nearer · R:R ≥ 1.5.
 *   C · NO TRADE: neutral gamma, a high-impact event inside ±30 min, stale
 *       inputs, or GEX spot and bar price disagreeing by > 0.4%. WAIT is a result.
 *
 * Every 0DTE idea carries a hard time stop at 15:55 ET (SPXW stops trading at
 * 16:00; index ETF 0DTEs settle at the close).
 */
import type { IntradayStructure } from './zero-dte-structure';

export type ZeroDtePolicy = 'A_neg_gamma_continuation' | 'B_pos_gamma_wall_fade';

export const ZERO_DTE_PROVENANCE =
  'Pre-registered policy (research/SPX-0DTE-RESEARCH-AND-VALIDATION.md). NOT validated: the only executable ' +
  'replay is a 5-observation pilot (1 target / 4 stops). spx_session remains suspended (−0.27R). Treat as a paper/shadow call.';

export const TIME_STOP_ET = '15:55';

export interface GexInput {
  spot: number;
  zeroGamma: number | null;
  callWall: number | null;
  putWall: number | null;
  sign: 'positive' | 'negative' | 'neutral';
  fetchedAt: string;           // ISO — when the snapshot was computed
  modelledGrossShare?: number | null;
}

export interface Level { name: string; price: number }

export interface ZeroDteSetup {
  /** 'open_drive' only when the 0DTE desk mirrors an index open-drive idea (server/open-drive-core.ts). */
  policy: ZeroDtePolicy | 'open_drive';
  powerHour: boolean;
  direction: 'long' | 'short';
  entry: number;
  stop: number;
  target: number;
  rr: number;
  trigger: Level;
  targetLevel: Level;
  evidence: string[];
}

export interface PolicyVerdict { setup: ZeroDteSetup | null; wait: string[] }

/**
 * 0DTE-ONLY LEVELS (desk addition 2026-09-29 — NOT in the pre-registered spec).
 * The pre-registered A/B read the all-expiry walls. Those sit 1–3% away on SPY
 * most days, so a power-hour PIN — a same-day-expiry phenomenon — could almost
 * never tag one: B needs a bar in the last 15 min to touch the wall. The
 * same-day expiry's own walls (server/zero-dte-desk-core.ts expiryBucketLevels)
 * are where the pin actually forms. When supplied they are ADDED as candidate
 * levels / walls / destinations (never replace the measured all-expiry ones),
 * and every idea that uses one names it in its evidence. Unvalidated like the
 * rest; ZERO_DTE_WALLS_IN_POLICY=false removes them without a deploy.
 */
export interface ZeroDteBucketInput {
  expiry: string;
  callWall: number | null;
  putWall: number | null;
  maxGamma: number | null;
  zeroGamma: number | null;
}

export interface PolicyOptions {
  zeroDte?: ZeroDteBucketInput | null;
  /** Per-symbol risk cap (%). Index default 0.6; single names scale with their own expected move. */
  maxRiskPct?: number;
}

/** Entry windows (ET minutes after midnight) — one definition for the policies AND the desk clock. */
export const POLICY_WINDOWS = {
  entry: { start: 585, end: 945 },                    // 09:45–15:45 — nothing new outside it
  A: [{ start: 585, end: 945 }],                      // −γ continuation
  B: [{ start: 600, end: 870 }, { start: 900, end: 940 }], // +γ wall fade · power-hour pin
} as const;
export const POWER_HOUR_START = 900;
export function policyOpen(policy: 'A' | 'B', etMin: number): boolean {
  return POLICY_WINDOWS[policy].some((w) => etMin >= w.start && etMin <= w.end);
}
export function zeroDteWallsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return !/^(0|false|off|no)$/i.test(String(env.ZERO_DTE_WALLS_IN_POLICY ?? '').trim());
}

const GEX_MAX_AGE_MS = 10 * 60_000;
const BAR_MAX_AGE_MS = 12 * 60_000;   // last CLOSED bar's start time
const SPOT_AGREE_PCT = 0.4;
const MIN_RR = 1.5;
const MAX_RISK_PCT = 0.6;
const STOP_BUFFER = 0.001;            // 0.10% of the level

const f2 = (x: number) => x.toFixed(2);
const ageMin = (ms: number) => `${Math.max(0, Math.round(ms / 60_000))}m`;

export function evaluateZeroDte(symbol: string, gex: GexInput, st: IntradayStructure, nowMs: number, etMin: number, eventBlock: string | null, opts: PolicyOptions = {}): PolicyVerdict {
  const wait: string[] = [];
  const z = opts.zeroDte ?? null;
  const maxRiskPct = opts.maxRiskPct ?? MAX_RISK_PCT;
  if (etMin < POLICY_WINDOWS.entry.start || etMin > POLICY_WINDOWS.entry.end) return { setup: null, wait: ['outside 09:45–15:45 ET entry window'] };
  if (eventBlock) return { setup: null, wait: [`event gate: ${eventBlock}`] };
  const gexAge = nowMs - Date.parse(gex.fetchedAt);
  if (!(gexAge <= GEX_MAX_AGE_MS)) return { setup: null, wait: [`GEX snapshot ${ageMin(gexAge)} old`] };
  const bars = st.closed;
  if (bars.length < 6 || st.lastBarAt == null) return { setup: null, wait: ['fewer than 6 closed 5-min bars'] };
  const barAge = nowMs - st.lastBarAt;
  if (barAge > BAR_MAX_AGE_MS) return { setup: null, wait: [`last bar ${ageMin(barAge)} old`] };
  const c1 = bars[bars.length - 1].c; const c2 = bars[bars.length - 2].c;
  if (Math.abs(gex.spot - c1) / c1 * 100 > SPOT_AGREE_PCT) return { setup: null, wait: [`GEX spot ${f2(gex.spot)} vs bar ${f2(c1)} disagree`] };
  if (st.vwap == null) return { setup: null, wait: ['no VWAP'] };
  if (gex.sign === 'neutral') return { setup: null, wait: ['neutral gamma — no dealer footprint (policy C)'] };

  const powerHour = etMin >= POWER_HOUR_START;
  const barTime = new Date(st.lastBarAt + 5 * 60_000).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
  const baseEvidence = [
    `GEX ${gex.sign} (net at spot) · zero-γ ${gex.zeroGamma ? '$' + f2(gex.zeroGamma) : '—'} · put/call wall ${gex.putWall ?? '—'}/${gex.callWall ?? '—'} · snapshot ${ageMin(gexAge)} old` +
      (gex.modelledGrossShare != null ? ` · ${(gex.modelledGrossShare * 100).toFixed(1)}% of gross gamma modelled` : ''),
    ...(z ? [`0DTE-only levels (${z.expiry}): put/call wall ${z.putWall ?? '—'}/${z.callWall ?? '—'} · max-γ ${z.maxGamma ?? '—'} — desk addition, not in the pre-registered spec`] : []),
    `VWAP $${f2(st.vwap)} · OR30 ${st.or30Low != null ? '$' + f2(st.or30Low) : '—'}–${st.or30High != null ? '$' + f2(st.or30High) : '—'} · PDH/PDL ${st.pdh != null ? '$' + f2(st.pdh) : '—'}/${st.pdl != null ? '$' + f2(st.pdl) : '—'}`,
    `last closed 5-min bar $${f2(c1)} at ${barTime} ET (${ageMin(nowMs - (st.lastBarAt + 5 * 60_000))} ago)`,
  ];
  const lv = (name: string, p: number | null | undefined): Level | null => (p != null && Number.isFinite(p) && p > 0 ? { name, price: p } : null);

  // ── Policy A — negative-gamma continuation ─────────────────────────────
  if (gex.sign === 'negative') {
    const recent = bars.slice(-6, -2); // bars 3–6 back: where price was before the break (≤30 min)
    const up = [lv('zero-γ', gex.zeroGamma), lv('call wall', gex.callWall), lv('OR30 high', st.or30High), lv('PDH', st.pdh), powerHour ? lv('HOD', st.hodPrior) : null, lv('0DTE call wall', z?.callWall)]
      .filter((x): x is Level => !!x);
    const dn = [lv('zero-γ', gex.zeroGamma), lv('put wall', gex.putWall), lv('OR30 low', st.or30Low), lv('PDL', st.pdl), powerHour ? lv('LOD', st.lodPrior) : null, lv('0DTE put wall', z?.putWall)]
      .filter((x): x is Level => !!x);

    const longTrig = up.filter((L) => c1 > L.price && c2 > L.price && recent.some((b) => b.c <= L.price)).sort((a, b) => b.price - a.price)[0];
    const shortTrig = dn.filter((L) => c1 < L.price && c2 < L.price && recent.some((b) => b.c >= L.price)).sort((a, b) => a.price - b.price)[0];
    for (const [dir, trig] of [['long', longTrig], ['short', shortTrig]] as const) {
      if (!trig) continue;
      if (dir === 'long' ? c1 <= st.vwap : c1 >= st.vwap) { wait.push(`A ${dir}: ${trig.name} broken but price on the wrong side of VWAP`); continue; }
      const stop = dir === 'long' ? trig.price * (1 - STOP_BUFFER) : trig.price * (1 + STOP_BUFFER);
      const risk = Math.abs(c1 - stop);
      if (risk / c1 * 100 > maxRiskPct) { wait.push(`A ${dir}: ${(risk / c1 * 100).toFixed(2)}% from the broken level — chasing`); continue; }
      const pool = (dir === 'long'
        ? [lv('call wall', gex.callWall), lv('PDH', st.pdh), lv('OR30 high', st.or30High), lv('zero-γ', gex.zeroGamma), lv('0DTE call wall', z?.callWall)]
        : [lv('put wall', gex.putWall), lv('PDL', st.pdl), lv('OR30 low', st.or30Low), lv('zero-γ', gex.zeroGamma), lv('0DTE put wall', z?.putWall)])
        .filter((x): x is Level => !!x && (dir === 'long' ? x.price > c1 * 1.0005 : x.price < c1 * 0.9995));
      const tgt = pool.sort((a, b) => Math.abs(a.price - c1) - Math.abs(b.price - c1))
        .find((x) => Math.abs(x.price - c1) / risk >= MIN_RR);
      if (!tgt) { wait.push(`A ${dir}: no measured level ${dir === 'long' ? 'above' : 'below'} at ≥${MIN_RR}R`); continue; }
      const rr = Math.abs(tgt.price - c1) / risk;
      return {
        setup: {
          policy: 'A_neg_gamma_continuation', powerHour, direction: dir,
          entry: c1, stop, target: tgt.price, rr, trigger: trig, targetLevel: tgt,
          evidence: [
            `A · negative-gamma continuation: two 5-min closes ${dir === 'long' ? 'above' : 'below'} ${trig.name} $${f2(trig.price)} after trading ${dir === 'long' ? 'below' : 'above'} it within 30 min; price ${dir === 'long' ? 'above' : 'below'} VWAP`,
            ...baseEvidence,
          ],
        },
        wait,
      };
    }
    if (!longTrig && !shortTrig) wait.push('A: no fresh held break of a measured level');
    return { setup: null, wait };
  }

  // ── Policy B — positive-gamma wall fade ─────────────────────────────────
  const inB = policyOpen('B', etMin);
  if (!inB) return { setup: null, wait: ['B: outside 10:00–14:30 / 15:00–15:40 ET'] };
  const last3 = bars.slice(-3);
  const hi3 = Math.max(...last3.map((b) => b.h)); const lo3 = Math.min(...last3.map((b) => b.l));
  const candidates: Array<{ dir: 'long' | 'short'; wall: Level }> = [];
  const callWalls: Level[] = [lv('call wall', gex.callWall), lv('0DTE call wall', z?.callWall)].filter((x): x is Level => !!x);
  const putWalls: Level[] = [lv('put wall', gex.putWall), lv('0DTE put wall', z?.putWall)].filter((x): x is Level => !!x);
  for (const w of callWalls) if (hi3 >= w.price * 0.9995 && c1 < w.price && c1 < c2 && c1 > st.vwap) candidates.push({ dir: 'short', wall: w });
  for (const w of putWalls) if (lo3 <= w.price * 1.0005 && c1 > w.price && c1 > c2 && c1 < st.vwap) candidates.push({ dir: 'long', wall: w });
  for (const { dir, wall } of candidates) {
    const stop = dir === 'short' ? Math.max(hi3, wall.price) * (1 + STOP_BUFFER) : Math.min(lo3, wall.price) * (1 - STOP_BUFFER);
    const risk = Math.abs(stop - c1);
    // Power-hour pin: the same-day max-γ strike is the magnet (desk addition).
    const pool = [lv('VWAP', st.vwap), lv('zero-γ', gex.zeroGamma), powerHour ? lv('0DTE max-γ', z?.maxGamma) : null]
      .filter((x): x is Level => !!x && (dir === 'short' ? x.price < c1 * 0.9995 : x.price > c1 * 1.0005))
      .sort((a, b) => Math.abs(a.price - c1) - Math.abs(b.price - c1));
    const tgt = pool[0];
    if (!tgt) { wait.push(`B ${dir}: no VWAP/zero-γ destination`); continue; }
    const rr = Math.abs(tgt.price - c1) / risk;
    if (rr < MIN_RR) { wait.push(`B ${dir}: ${rr.toFixed(2)}R to ${tgt.name} < ${MIN_RR}`); continue; }
    return {
      setup: {
        policy: 'B_pos_gamma_wall_fade', powerHour, direction: dir,
        entry: c1, stop, target: tgt.price, rr, trigger: wall, targetLevel: tgt,
        evidence: [
          `B · positive-gamma ${powerHour ? 'power-hour pin' : 'wall fade'}: tagged ${wall.name} $${f2(wall.price)} in the last 15 min, closed back inside and turning; stretched ${dir === 'short' ? 'above' : 'below'} VWAP`,
          ...baseEvidence,
        ],
      },
      wait,
    };
  }
  if (!candidates.length) wait.push(`B: no wall tag + rejection${z ? ' (all-expiry or 0DTE walls)' : ''}`);
  return { setup: null, wait };
}

/** 15:55 ET today as an ISO instant — the hard time stop for every 0DTE idea. */
export function timeStopIso(nowMs = Date.now()): string {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(nowMs));
  const [y, m, dd] = d.split('-').map(Number);
  // Find the UTC instant whose ET wall-clock is 15:55 on that date.
  const probe = Date.UTC(y, m - 1, dd, 12);
  const nyHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false }).format(new Date(probe))) % 24;
  return new Date(Date.UTC(y, m - 1, dd, 15 + (12 - nyHour), 55)).toISOString();
}
