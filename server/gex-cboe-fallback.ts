/**
 * CBOE-BASED GEX FALLBACK
 * =======================
 * Direct CBOE chain → full GEX snapshot.
 * Works on weekends, after-hours, when Tradier is rate-limited.
 *
 * Used as fallback when calculateAggregateGammaExposure (Tradier-first)
 * returns null. CBOE returns end-of-day option chains that update
 * even when markets are closed — perfect for "last known good" data.
 *
 * Returns the same GEXSnapshot shape as toSnapshot() so callers
 * can drop it in transparently. Same math and units as options-exposures v2
 * (shared/gex-math.ts): GEX $B per 1%, VEX $M per IV point, spot-grid
 * zero-gamma, gamma-ranked walls, shared regime.
 */

import { logger } from './logger';
import type { GEXSnapshot } from '../shared/gex-types';
import { bucketizeChain, dealerFlowPer1PctFromGamma, type BucketContract } from './gex-dte-buckets';
import { rateLimited } from './provider-cache';
import {
  bsGamma, bsVanna, gexPer1Pct, vannaPerVolPt, gammaProfile, thinProfile, pickWalls,
  expiryInstantMs, YEAR_MS, MIN_T_YEARS, type GammaContract,
} from '../shared/gex-math';
import { classifyGammaRegime } from '../shared/gex-regime';

interface CBOEContract {
  option: string;
  bid: number;
  ask: number;
  iv: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  open_interest: number;
  volume: number;
  last_trade_price: number;
}

interface CBOEResponse {
  data: {
    symbol: string;
    current_price: number;
    bid: number;
    ask: number;
    options: CBOEContract[];
  };
}

interface AggregatedStrike {
  strike: number;
  callGEX: number;
  putGEX: number;
  netGEX: number;
  callOI: number;
  putOI: number;
  callVEX: number;
  putVEX: number;
}

/** CBOE's own snapshot time ("2026-10-01 15:44:02", exchange-local ET) when parseable, else the download time. */
export function cboeDataTime(raw: unknown, fetchedAtMs: number): string {
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(raw)) {
    const base = raw.trim().replace(' ', 'T');
    const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(base);
    if (hasZone) {
      const t = Date.parse(base);
      if (Number.isFinite(t)) return new Date(t).toISOString();
    } else {
      // Naive timestamp = America/New_York wall clock: keep the offset (EDT/EST)
      // whose instant reads back as the same ET wall-clock hour.
      for (const off of ['-04:00', '-05:00']) {
        const t = Date.parse(`${base}${off}`);
        if (!Number.isFinite(t)) continue;
        const etHour = Number(new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false })) % 24;
        if (etHour === Number(base.slice(11, 13))) return new Date(t).toISOString();
      }
    }
  }
  return new Date(fetchedAtMs).toISOString();
}

export async function computeGEXFromCBOE(symbol: string): Promise<GEXSnapshot | null> {
  try {
    // CBOE exposes index chains behind underscored quote symbols. The option
    // contracts inside the payload still use OCC roots such as SPX and SPXW.
    // Shared loader: one parse at a time, trimmed to near expiries (lib/cboe-loader.ts).
    const { loadCboeChain } = await import('./lib/cboe-loader');
    const loaded = await loadCboeChain(symbol);
    const j = loaded.payload as CBOEResponse | null;
    const data = j?.data;
    if (!data?.current_price || !data?.options?.length) return null;

    const spot = data.current_price;
    const now = Date.now();
    const byStrike = new Map<number, AggregatedStrike>();
    let totalCallGEX = 0, totalPutGEX = 0; // unsigned $ per 1%
    let totalVEX = 0;                        // $ per IV point, liquidity sign
    const contractList: BucketContract[] = [];
    const profileContracts: GammaContract[] = [];
    let netGammaSum = 0; // for dealer-flow calc
    let excludedGross = 0;
    const byExpiry = new Map<string, { days: number; net: number }>();
    // Strike × expiry cells, same units as the primary engine ($B GEX, $M VEX per
    // IV pt). v1 sent [] on this path, so the GEX matrix tile was blank on every
    // weekend/after-hours/Alpaca failure (audit 2026-10-01 P0 #13).
    const matrix = new Map<string, { strike: number; expiryLabel: string; dte: number; netGEX: number; netVEX: number }>();

    for (const o of data.options) {
      // OCC compact symbol: ROOT + YYMMDD + C/P + 8-digit strike. SPX chains
      // mix monthly SPX and weekly SPXW roots, so parse the contract itself.
      const parsed = /^([A-Z]+)(\d{6})([CP])(\d{8})$/.exec(o.option);
      if (!parsed) continue;
      const [, , expiryCode, cp, strikeCode] = parsed;
      const strike = parseInt(strikeCode, 10) / 1000;
      if (!Number.isFinite(strike) || strike <= 0) continue;
      const oi = o.open_interest || 0;
      if (oi === 0) continue;
      const expirationDate = `20${expiryCode.slice(0, 2)}-${expiryCode.slice(2, 4)}-${expiryCode.slice(4, 6)}`;
      const T = (expiryInstantMs(expirationDate) - now) / YEAR_MS;
      if (T <= 0) continue; // expired contracts carry no forward exposure
      const isCall = cp === 'C';
      const sign = isCall ? 1 : -1;
      const iv = o.iv > 0 ? o.iv : 0;
      const gamma = o.gamma > 0 ? o.gamma : iv > 0 ? bsGamma(spot, strike, Math.max(T, MIN_T_YEARS), iv) : 0;
      contractList.push({ expirationDate, strike, cp: cp as 'C' | 'P', oi, gamma, iv: iv > 0 ? iv : undefined, T: Math.max(T, MIN_T_YEARS) });
      netGammaSum += oi * gamma * sign;

      // GEX $ per 1% move: Γ·OI·100·S²·0.01 (multiplier and 1% cancel).
      const gexContribution = gexPer1Pct(gamma, oi, spot);
      const be = byExpiry.get(expirationDate) ?? { days: T * 365, net: 0 };
      be.net += sign * gexContribution;
      byExpiry.set(expirationDate, be);
      // VEX $ per IV point with REAL Black-Scholes vanna (v1 used OI·vega·S·100,
      // which is not vanna and is positive for every contract).
      const vanna = iv > 0 ? bsVanna(spot, strike, Math.max(T, MIN_T_YEARS), iv) : 0;
      const vexContribution = -sign * vannaPerVolPt(vanna, oi, spot);
      totalVEX += vexContribution;
      if (Math.abs(strike - spot) / spot <= 0.15) {
        const dte = Math.max(0, Math.round(T * 365));
        const mk = `${strike}|${expirationDate}`;
        let cell = matrix.get(mk);
        if (!cell) {
          const [yy, mm, dd] = expirationDate.split('-').map(Number);
          const expiryLabel = new Date(Date.UTC(yy, mm - 1, dd)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).toUpperCase();
          cell = { strike, expiryLabel, dte, netGEX: 0, netVEX: 0 };
          matrix.set(mk, cell);
        }
        cell.netGEX += (sign * gexContribution) / 1e9;
        cell.netVEX += vexContribution / 1e6;
      }
      if (iv > 0) profileContracts.push({ strike, T: Math.max(T, MIN_T_YEARS), iv, oi, isCall });
      else excludedGross += gexContribution;

      const existing = byStrike.get(strike) || {
        strike, callGEX: 0, putGEX: 0, netGEX: 0, callOI: 0, putOI: 0, callVEX: 0, putVEX: 0
      };
      if (isCall) {
        existing.callGEX += gexContribution;
        existing.callOI += oi;
        existing.callVEX += vexContribution;
        totalCallGEX += gexContribution;
      } else {
        existing.putGEX += gexContribution;
        existing.putOI += oi;
        existing.putVEX += vexContribution;
        totalPutGEX += gexContribution;
      }
      existing.netGEX = existing.callGEX - existing.putGEX;
      byStrike.set(strike, existing);
    }

    if (byStrike.size === 0) return null;
    const strikes = Array.from(byStrike.values()).sort((a, b) => a.strike - b.strike);

    // Walls + zero-gamma + regime: the shared definitions (docs/GEX_VEX_METHODOLOGY.md).
    const walls = pickWalls(strikes, spot);
    const callWall = walls.callWall;
    const putWall = walls.putWall;

    let maxGammaStrike = strikes[0].strike;
    let maxAbs = 0;
    for (const s of strikes) {
      if (Math.abs(s.netGEX) > maxAbs) { maxAbs = Math.abs(s.netGEX); maxGammaStrike = s.strike; }
    }

    const profile = gammaProfile(profileContracts, spot, { lo: 0.8, hi: 1.2, steps: 120 });
    const gammaFlipPrice = profile.zeroGamma;

    const totalGEX = totalCallGEX - totalPutGEX;
    const grossGEX = totalCallGEX + totalPutGEX;
    const putCallRatio = totalCallGEX > 0 ? Math.abs(totalPutGEX) / totalCallGEX : 0;
    const regimeRead = classifyGammaRegime({ netGEX: totalGEX, grossGEX, spot, zeroGamma: gammaFlipPrice });
    const zeroGammaProjection = totalGEX > 0 ? maxGammaStrike : gammaFlipPrice;

    // Build levels for rendering (top 20 by |netGEX|, sorted by strike)
    const levelsRaw = [...strikes]
      .sort((a, b) => Math.abs(b.netGEX) - Math.abs(a.netGEX))
      .slice(0, 20)
      .sort((a, b) => a.strike - b.strike);

    const totalAbsStrikeGEX = strikes.reduce((sum, row) => sum + Math.abs(row.netGEX), 0);
    const levels = levelsRaw.map(l => {
      let role: GEXSnapshot['levels'][number]['role'] = 'neutral';
      if (l.strike === maxGammaStrike) role = 'max_gamma';
      else if (l.strike === callWall) role = 'call_wall';
      else if (l.strike === putWall) role = 'put_wall';
      else if (gammaFlipPrice != null && Math.abs(l.strike - gammaFlipPrice) <= Math.max(0.5, spot * 0.0025)) role = 'flip'; // same tolerance as toSnapshot
      else if (l.netGEX > 0 && l.strike > spot) role = 'resistance';
      else if (l.netGEX < 0 && l.strike < spot) role = 'support';
      return {
        strike: l.strike,
        gex: l.netGEX / 1e9,
        callGex: l.callGEX / 1e9,
        putGex: -l.putGEX / 1e9,
        vex: (l.callVEX + l.putVEX) / 1e6,
        gammaPct: totalAbsStrikeGEX > 0 ? Math.abs(l.netGEX) / totalAbsStrikeGEX : 0,
        openInterest: l.callOI + l.putOI,
        role,
        distancePct: ((l.strike - spot) / spot) * 100,
      };
    });

    // P0: DTE buckets + dealer-flow
    const byDte = bucketizeChain(contractList, spot);
    const dealerFlowPer1Pct = dealerFlowPer1PctFromGamma(netGammaSum, spot);

    return {
      symbol,
      spotPrice: spot,
      calculatedAt: Date.now(),
      unitsVersion: 2,
      totalGEX: totalGEX / 1e9,         // $B per 1% move
      totalNetGEX: totalGEX / 1e9,
      grossGEX: grossGEX / 1e9,
      gexByScope: (() => {
        const e = [...byExpiry.values()].sort((a, b) => a.days - b.days);
        return {
          all: totalGEX / 1e9,
          frontExpiry: e.length ? e[0].net / 1e9 : 0,
          frontExpiryDays: e.length ? Math.round(e[0].days * 100) / 100 : null,
          le7d: e.filter((x) => x.days <= 7).reduce((a, x) => a + x.net, 0) / 1e9,
        };
      })(),
      totalVEX: totalVEX / 1e6,         // $M per 1 IV point — same as options-exposures v2
      callGEX: totalCallGEX / 1e9,
      putGEX: totalPutGEX / 1e9,       // magnitude, same sign as the main engine's snapshot (v1 was negative here only)
      putCallRatio,
      gammaFlipPrice,
      zeroGammaLevel: gammaFlipPrice,
      gammaProfile: thinProfile(profile.points, 41).map((p) => ({ spot: p.spot, netGEX: p.netGEX / 1e9 })),
      maxGammaStrike,
      callWall,
      putWall,
      callWallOI: walls.callWallOI,
      putWallOI: walls.putWallOI,
      zeroGammaProjection,
      levels,
      regime: regimeRead.legacy,
      regimeRead,
      dealerFlowPer1Pct,
      byDte,
      source: 'cboe',
      expirationsUsed: [...new Set(contractList.map((contract) => contract.expirationDate))],
      chainFeed: 'cboe-delayed',
      // The data's own time: CBOE's payload timestamp (its delayed snapshot), else
      // when the chain was actually downloaded (it is cached) — never "now".
      chainFetchedAt: cboeDataTime((j as any)?.timestamp, loaded.fetchedAt),
      strikeExpiryMatrix: Array.from(matrix.values()).sort((a, b) => b.strike - a.strike || a.dte - b.dte),
      profileExcludedGrossShare: grossGEX > 0 ? excludedGross / grossGEX : 0,
    } as GEXSnapshot;
  } catch (e: any) {
    logger.warn(`[GEX-CBOE-FALLBACK] failed ${symbol}: ${e.message}`);
    return null;
  }
}

/**
 * Bulk version — used by GEX Hub when Tradier scan fails.
 * Returns only symbols that yielded data.
 */
export async function bulkComputeGEXFromCBOE(symbols: string[]): Promise<Map<string, GEXSnapshot>> {
  const results = new Map<string, GEXSnapshot>();
  const BATCH = 8;
  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    const data = await Promise.all(batch.map(s => computeGEXFromCBOE(s)));
    for (let j = 0; j < batch.length; j++) {
      if (data[j]) results.set(batch[j], data[j]!);
    }
  }
  return results;
}
