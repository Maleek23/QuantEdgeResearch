/**
 * GEX MAGNET DETECTOR — "find more BE plays"
 * ==========================================
 * The BE 300C (exp 2026-10-02) went ~$0.89 → ~$8.5–11. On 2026-09-29 the
 * 300 strike was BE's largest near-expiry gamma strike, ~2.4% above spot,
 * with call volume ~2.2× open interest, and the stock was moving up. This
 * module turns that shape into explicit criteria, a score and why-lines.
 *
 * CRITERIA (all required — docs/GEX_VEX_METHODOLOGY.md §Magnet detector):
 *   C1 near expiry      contracts expiring in 0.75–10.5 calendar days (no same-day
 *                       0DTE: its OI is yesterday's and its ATM gamma is noise);
 *                       if none list in that window, the nearest expiry ≤ 21 d
 *   C2 location         call strike 0.5%–5% ABOVE spot (put: 0.5%–5% BELOW)
 *   C3 concentration    that strike's call gamma $ ≥ 5% of gross near-expiry gamma $
 *                       AND it is one of the top-3 call-gamma strikes near expiry
 *   C4 fresh buying     call volume ÷ call OI ≥ 1.5 at the strike, volume ≥ 500
 *                       contracts, OI ≥ 100 (volume > OI means positions were OPENED
 *                       today; customer buying leaves dealers SHORT those calls —
 *                       the naive +GEX sign is likely wrong there, which is the squeeze)
 *   C5 momentum         day change > 0 (put: < 0) — price moving toward the strike
 * IV context (scored, not required): front ATM IV ÷ ~30-day ATM IV. > 1 = front
 *   demand bid; reported with both numbers so the reader can judge.
 *
 * SCORE 0–100 = concentration 30 + vol/OI 25 + proximity 15 + momentum 15 + IV term 10 + top strike 5.
 * These weights are judgment, not fitted — there is no labelled sample yet
 * (research/gex-magnet-backtest.ts reports what exists). Treat the score as an
 * ordering, not a probability.
 */

export type MagnetSide = 'call' | 'put';

export interface MagnetStrikeAgg {
  strike: number;
  callGEX: number; putGEX: number;           // unsigned $ per 1%, near expiries
  callVol: number; putVol: number;
  callOI: number; putOI: number;
  /** Expiry carrying the most volume on each side at this strike, with its quote. */
  callTop?: { exp: string; dte: number; vol: number; oi: number; bid: number | null; ask: number | null; last: number | null };
  putTop?: { exp: string; dte: number; vol: number; oi: number; bid: number | null; ask: number | null; last: number | null };
}

export interface MagnetContext {
  symbol: string;
  spot: number;
  changePct: number | null;
  atmIvNear: number | null;   // decimal
  atmIv30: number | null;     // decimal
  nearExpiries: string[];
  grossNearGEX: number;       // Σ call+put gamma $ over near expiries
}

export interface MagnetSetup {
  symbol: string;
  side: MagnetSide;
  strike: number;
  expiry: string | null;
  dte: number | null;
  distPct: number;            // signed, strike vs spot
  share: number;              // strike's side gamma / gross near gamma
  sideRank: number;           // 1 = largest call (put) gamma strike near expiry
  volume: number;
  openInterest: number;
  volOI: number;
  changePct: number;
  atmIvNear: number | null;
  atmIv30: number | null;
  ivTerm: number | null;
  premium: { bid: number | null; ask: number | null; last: number | null; mid: number | null } | null;
  score: number;
  components: { concentration: number; volOI: number; proximity: number; momentum: number; ivTerm: number; topStrike: number };
  why: string[];
}

export const MAGNET_RULES = {
  nearMinDays: 0.75,
  nearMaxDays: 10.5,
  fallbackMaxDays: 21,
  minDistPct: 0.5,
  maxDistPct: 5,
  minShare: 0.05,
  maxSideRank: 3,
  minVolOI: 1.5,
  minVolume: 500,
  minOI: 100,
} as const;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const pctStr = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}%`;

export function detectMagnets(ctx: MagnetContext, strikes: MagnetStrikeAgg[]): MagnetSetup[] {
  const out: MagnetSetup[] = [];
  if (!(ctx.spot > 0) || !(ctx.grossNearGEX > 0) || ctx.changePct == null) return out;
  const ivTerm = ctx.atmIvNear && ctx.atmIv30 ? ctx.atmIvNear / ctx.atmIv30 : null;

  for (const side of ['call', 'put'] as const) {
    const g = (s: MagnetStrikeAgg) => (side === 'call' ? s.callGEX : s.putGEX);
    const ranked = [...strikes].filter((s) => g(s) > 0).sort((a, b) => g(b) - g(a));
    const rankOf = new Map(ranked.map((s, i) => [s.strike, i + 1]));
    let best: MagnetSetup | null = null;
    for (const s of strikes) {
      const distPct = ((s.strike - ctx.spot) / ctx.spot) * 100;
      const dirDist = side === 'call' ? distPct : -distPct;
      if (dirDist < MAGNET_RULES.minDistPct || dirDist > MAGNET_RULES.maxDistPct) continue;          // C2
      const share = g(s) / ctx.grossNearGEX;
      const sideRank = rankOf.get(s.strike) ?? 99;
      if (share < MAGNET_RULES.minShare || sideRank > MAGNET_RULES.maxSideRank) continue;          // C3
      const vol = side === 'call' ? s.callVol : s.putVol;
      const oi = side === 'call' ? s.callOI : s.putOI;
      if (vol < MAGNET_RULES.minVolume || oi < MAGNET_RULES.minOI) continue;                         // C4
      const volOI = vol / oi;
      if (volOI < MAGNET_RULES.minVolOI) continue;
      const toward = side === 'call' ? ctx.changePct : -ctx.changePct;
      if (!(toward > 0)) continue;                                                                   // C5

      const components = {
        concentration: 30 * clamp01(share / 0.2),
        volOI: 25 * clamp01(volOI / 5),
        proximity: 15 * clamp01(1 - (dirDist - MAGNET_RULES.minDistPct) / (MAGNET_RULES.maxDistPct - MAGNET_RULES.minDistPct)),
        momentum: 15 * clamp01(toward / 3),
        ivTerm: ivTerm != null ? 10 * clamp01((ivTerm - 1) / 0.3) : 0,
        topStrike: sideRank === 1 ? 5 : 0,
      };
      const score = Math.round(Object.values(components).reduce((a, b) => a + b, 0));
      const top = side === 'call' ? s.callTop : s.putTop;
      const mid = top && top.bid != null && top.ask != null && top.ask > 0 ? (top.bid + top.ask) / 2 : null;
      const tag = `${s.strike}${side === 'call' ? 'C' : 'P'}`;
      const why = [
        `${tag}${top ? ` (exp ${top.exp}, ${top.dte.toFixed(1)}d)` : ''} holds ${(share * 100).toFixed(1)}% of near-expiry gamma — #${sideRank} ${side} strike`,
        `${side === 'call' ? 'Call' : 'Put'} volume ${vol.toLocaleString()} vs OI ${oi.toLocaleString()} = ${volOI.toFixed(1)}× — opened today; if customers bought, dealers are short these ${side}s`,
        `Spot $${ctx.spot.toFixed(2)} → strike ${pctStr(distPct)}; ${pctStr(ctx.changePct)} today (${toward > 0 ? 'toward' : 'away from'} the strike)`,
        ctx.atmIvNear && ctx.atmIv30
          ? `Front ATM IV ${(ctx.atmIvNear * 100).toFixed(0)}% vs ~30d ${(ctx.atmIv30 * 100).toFixed(0)}% (${ivTerm!.toFixed(2)}×)${ivTerm! > 1.05 ? ' — near-dated demand bid' : ''}`
          : 'IV term structure unavailable for this chain',
      ];
      const setup: MagnetSetup = {
        symbol: ctx.symbol, side, strike: s.strike,
        expiry: top?.exp ?? null, dte: top?.dte ?? null,
        distPct, share, sideRank, volume: vol, openInterest: oi, volOI,
        changePct: ctx.changePct, atmIvNear: ctx.atmIvNear, atmIv30: ctx.atmIv30, ivTerm,
        premium: top ? { bid: top.bid, ask: top.ask, last: top.last, mid } : null,
        score, components, why,
      };
      if (!best || setup.score > best.score) best = setup;
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => b.score - a.score);
}
