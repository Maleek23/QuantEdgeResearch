/**
 * ══════════════════════════════════════════════════════════════════
 *  Bull Flag Pullback Scanner — "Femi's Scanner"
 * ══════════════════════════════════════════════════════════════════
 *
 * Reverse-engineered from the NFLX / AAOI / OKLO pattern DNA:
 *
 *   1. Strong prior uptrend (price well above 200 SMA)
 *   2. Currently pulling back / consolidating (the "flag")
 *   3. EMA stacking: 20 EMA > 50 EMA (trend structure intact)
 *   4. RSI resetting into 40–60 zone (momentum cool-off, not breakdown)
 *   5. Volume declining during pullback (low selling pressure)
 *   6. Up significantly from 52-week low (strong prior leg)
 *   7. Down from recent high (pullback offers entry)
 *   8. MACD above zero or histogram turning positive
 *   9. Price holding above 50 SMA as support
 *  10. Tight consolidation range (Bollinger squeeze forming)
 *  11. Price within a "flag channel" — lower highs + flat/rising lows
 *
 * Each criterion maps to a weighted score. Total 0–100.
 * Grade: S ≥ 85, A ≥ 75, B ≥ 65, C ≥ 55, D < 55.
 *
 * Inspired by the group chat: Femi said "all of these setups have
 * sum in common like crossing 50/200 EMA or a gap up, RSI, etc we
 * just gotta find the right combination" — so we did.
 */

import { logger } from "./logger";

// ─── Result Shape ────────────────────────────────────────────────

export interface BullFlagSetup {
  symbol: string;
  currentPrice: number;
  score: number;
  grade: string;
  direction: 'long';

  // Trend context
  ema20: number;
  ema50: number;
  sma200: number;
  trendBias: 'bullish' | 'neutral';

  // Flag metrics
  priorLegPercent: number;      // how big was the uptrend leg
  pullbackPercent: number;      // how much has it pulled back from high
  pullbackFromHigh: number;     // dollar amount below recent high
  flagDays: number;             // how many days the flag has been forming
  flagTightness: number;        // 0-1 — how tight the consolidation is

  // Momentum
  rsi14: number;
  macdHistogram: number;
  macdAboveZero: boolean;

  // Volume
  volumeRatio: number;          // current vs 20d avg
  flagVolumeDecline: boolean;   // volume declining during flag?
  avgVolume: number;

  // Levels
  entryPrice: number;
  targetPrice: number;
  targetPercent: number;
  stopLoss: number;
  stopLossPercent: number;
  holdDays: number;

  // Pattern description
  pattern: string;
  reason: string;
  signals: string[];
  createdAt: Date;
}

// ─── Ticker Universe ─────────────────────────────────────────────
// Broader than the swing scanner — covers semis, optics, software,
// consumer, home goods, energy per Maleek's request

const BULL_FLAG_UNIVERSE = [
  // Semiconductors / Chips
  'NVDA', 'AMD', 'INTC', 'AVGO', 'QCOM', 'MU', 'MRVL', 'ON', 'AEHR', 'LRCX',
  'KLAC', 'AMAT', 'TSM', 'ASML', 'TXN', 'NXPI', 'MCHP', 'SWKS', 'QRVO',
  // Optics / Photonics
  'AAOI', 'COHR', 'IIVI', 'LITE', 'CIEN', 'INFN',
  // Software / SaaS
  'CRM', 'NOW', 'SNOW', 'PLTR', 'DDOG', 'NET', 'CRWD', 'ZS', 'MDB', 'PANW',
  'S', 'OKTA', 'HUBS', 'BILL', 'PCOR', 'CFLT', 'MNDY',
  // Consumer / Streaming / Media
  'NFLX', 'DIS', 'AMZN', 'SPOT', 'ROKU', 'PARA', 'WBD',
  // Home Goods / Consumer Discretionary
  'HD', 'LOW', 'TGT', 'COST', 'WMT', 'WSM', 'RH', 'ETSY', 'W', 'BBBY',
  // Clean Energy / EV
  'OKLO', 'TSLA', 'RIVN', 'NIO', 'XPEV', 'ENPH', 'SEDG', 'FSLR', 'RUN',
  // Financials
  'SQ', 'PYPL', 'COIN', 'SOFI', 'HOOD', 'AFRM',
  // Tech mega caps (flag pullbacks happen here too)
  'AAPL', 'MSFT', 'GOOGL', 'META',
  // Biotech/Health (momentum names)
  'MRNA', 'LLY', 'ABBV',
  // Misc high-beta growth
  'SHOP', 'UBER', 'DKNG', 'ABNB', 'TTD', 'RBLX', 'DASH', 'ARM', 'SMCI',
];

// ─── Data Cache ──────────────────────────────────────────────────

const dailyCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 min

async function fetchDaily(symbol: string): Promise<any> {
  const cached = dailyCache.get(symbol);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=6mo`
    );
    if (!res.ok) return null;

    const json = await res.json();
    const result = json.chart?.result?.[0];
    if (result) dailyCache.set(symbol, { data: result, ts: Date.now() });
    return result;
  } catch (err) {
    logger.error(`[BULL-FLAG] Fetch error for ${symbol}:`, err);
    return null;
  }
}

// ─── Technical Helpers ───────────────────────────────────────────

function calcSMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] || 0;
  const slice = prices.slice(-period);
  return slice.reduce((s, p) => s + p, 0) / period;
}

function calcEMA(prices: number[], period: number): number[] {
  if (prices.length < period) return [prices[prices.length - 1] || 0];
  const ema: number[] = [];
  const mult = 2 / (period + 1);
  const sma = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  ema.push(sma);
  for (let i = period; i < prices.length; i++) {
    ema.push((prices[i] - ema[ema.length - 1]) * mult + ema[ema.length - 1]);
  }
  return ema;
}

function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

function calcMACD(prices: number[]): { macd: number; signal: number; histogram: number } {
  if (prices.length < 35) return { macd: 0, signal: 0, histogram: 0 };
  const fast = calcEMA(prices, 12);
  const slow = calcEMA(prices, 26);
  const offset = 26 - 12; // 14
  const macdLine: number[] = [];
  for (let i = 0; i < slow.length; i++) {
    macdLine.push(fast[i + offset] - slow[i]);
  }
  const signalLine = calcEMA(macdLine, 9);
  const macd = macdLine[macdLine.length - 1];
  const signal = signalLine[signalLine.length - 1];
  return { macd, signal, histogram: macd - signal };
}

function calcBollingerWidth(closes: number[], period = 20): number {
  if (closes.length < period) return 1;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, v) => a + (v - mean) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);
  const upper = mean + 2 * stdDev;
  const lower = mean - 2 * stdDev;
  return mean > 0 ? (upper - lower) / mean : 1; // normalized width
}

// ─── Pattern Detection ───────────────────────────────────────────

interface FlagAnalysis {
  hasPriorUptrend: boolean;
  priorLegPercent: number;
  pullbackPercent: number;
  pullbackFromHigh: number;
  flagDays: number;
  flagTightness: number;       // 0-1, higher = tighter
  lowerHighsUpperFlat: boolean; // classic flag shape
  volumeDeclining: boolean;
  lowFromLow52: number;        // % above 52wk low
  highFromHigh52: number;      // % below recent high
}

function analyzeFlag(
  closes: number[],
  highs: number[],
  lows: number[],
  volumes: number[]
): FlagAnalysis {
  const n = closes.length;
  const current = closes[n - 1];

  // 52-week high/low (use available data, up to 6mo)
  const allHigh = Math.max(...highs);
  const allLow = Math.min(...lows.filter(l => l > 0));
  const lowFromLow52 = allLow > 0 ? ((current - allLow) / allLow) * 100 : 0;
  const highFromHigh52 = allHigh > 0 ? ((allHigh - current) / allHigh) * 100 : 0;

  // Find the recent swing high (highest close in last 60 days)
  const lookback = Math.min(60, n);
  const recentHighIdx = closes.slice(-lookback).reduce(
    (maxIdx, v, i) => v > closes[n - lookback + maxIdx] ? i : maxIdx,
    0
  );
  const recentHigh = closes[n - lookback + recentHighIdx];
  const daysSinceHigh = lookback - recentHighIdx - 1;

  // Prior uptrend: from the low before the recent high
  const priorSlice = closes.slice(Math.max(0, n - lookback), n - lookback + recentHighIdx + 1);
  const priorLow = priorSlice.length > 0 ? Math.min(...priorSlice) : current;
  const priorLegPercent = priorLow > 0 ? ((recentHigh - priorLow) / priorLow) * 100 : 0;
  const hasPriorUptrend = priorLegPercent > 10; // at least 10% prior move

  // Pullback from high
  const pullbackPercent = recentHigh > 0 ? ((recentHigh - current) / recentHigh) * 100 : 0;
  const pullbackFromHigh = recentHigh - current;

  // Flag days = days since high
  const flagDays = daysSinceHigh;

  // Flag tightness: range of last `flagDays` bars relative to price
  const flagSlice = Math.min(flagDays || 5, 20);
  const flagHighs = highs.slice(-flagSlice);
  const flagLows = lows.slice(-flagSlice);
  const flagRange = flagHighs.length > 0
    ? Math.max(...flagHighs) - Math.min(...flagLows.filter(l => l > 0))
    : current * 0.1;
  const flagTightness = current > 0
    ? Math.max(0, 1 - (flagRange / current) * 10) // normalized: 0=wide, 1=very tight
    : 0;

  // Lower highs pattern during flag (bearish flag channel)
  let lowerHighCount = 0;
  const flagBarHighs = highs.slice(-(Math.min(flagSlice, 10)));
  for (let i = 1; i < flagBarHighs.length; i++) {
    if (flagBarHighs[i] < flagBarHighs[i - 1]) lowerHighCount++;
  }
  const lowerHighsUpperFlat = lowerHighCount >= Math.floor(flagBarHighs.length * 0.5);

  // Volume declining during flag vs prior leg
  const flagVols = volumes.slice(-flagSlice);
  const priorVols = volumes.slice(-(flagSlice * 2), -flagSlice);
  const avgFlagVol = flagVols.length > 0
    ? flagVols.reduce((a, b) => a + b, 0) / flagVols.length
    : 0;
  const avgPriorVol = priorVols.length > 0
    ? priorVols.reduce((a, b) => a + b, 0) / priorVols.length
    : avgFlagVol;
  const volumeDeclining = avgFlagVol < avgPriorVol * 0.85; // at least 15% lower vol in flag

  return {
    hasPriorUptrend,
    priorLegPercent,
    pullbackPercent,
    pullbackFromHigh,
    flagDays,
    flagTightness,
    lowerHighsUpperFlat,
    volumeDeclining,
    lowFromLow52,
    highFromHigh52,
  };
}

// ─── Scoring Engine ──────────────────────────────────────────────
// Each criterion gets a weighted score, totaled 0–100

function scoreBullFlag(
  flag: FlagAnalysis,
  rsi: number,
  macdAboveZero: boolean,
  macdHistTurning: boolean,
  emaStacking: boolean,       // EMA20 > EMA50
  priceAboveSMA50: boolean,
  priceAboveSMA200: boolean,
  bollingerWidth: number,
): { score: number; signals: string[] } {
  let score = 0;
  const signals: string[] = [];

  // 1. Prior uptrend (max 15 pts)
  if (flag.hasPriorUptrend) {
    if (flag.priorLegPercent > 30) { score += 15; signals.push(`Strong prior leg (+${flag.priorLegPercent.toFixed(0)}%)`); }
    else if (flag.priorLegPercent > 20) { score += 12; signals.push(`Solid prior leg (+${flag.priorLegPercent.toFixed(0)}%)`); }
    else if (flag.priorLegPercent > 10) { score += 8; signals.push(`Prior uptrend (+${flag.priorLegPercent.toFixed(0)}%)`); }
  }

  // 2. Pullback depth — sweet spot is 5-20% (max 12 pts)
  if (flag.pullbackPercent >= 5 && flag.pullbackPercent <= 20) {
    score += 12;
    signals.push(`Healthy pullback (-${flag.pullbackPercent.toFixed(1)}%)`);
  } else if (flag.pullbackPercent > 2 && flag.pullbackPercent < 5) {
    score += 6;
    signals.push(`Shallow pullback (-${flag.pullbackPercent.toFixed(1)}%)`);
  } else if (flag.pullbackPercent > 20 && flag.pullbackPercent <= 30) {
    score += 4;
    signals.push(`Deep pullback (-${flag.pullbackPercent.toFixed(1)}%)`);
  }

  // 3. EMA stacking: 20 > 50 (max 12 pts)
  if (emaStacking) {
    score += 12;
    signals.push('EMA 20 > EMA 50 (trend intact)');
  }

  // 4. RSI 40-60 sweet spot (max 10 pts)
  if (rsi >= 40 && rsi <= 60) {
    score += 10;
    signals.push(`RSI resetting (${rsi.toFixed(0)})`);
  } else if (rsi >= 35 && rsi < 40) {
    score += 6;
    signals.push(`RSI near oversold (${rsi.toFixed(0)})`);
  } else if (rsi > 60 && rsi <= 65) {
    score += 5;
    signals.push(`RSI still healthy (${rsi.toFixed(0)})`);
  }

  // 5. Volume declining during flag (max 10 pts)
  if (flag.volumeDeclining) {
    score += 10;
    signals.push('Volume declining in flag (low selling pressure)');
  }

  // 6. Up from 52-week low (max 8 pts)
  if (flag.lowFromLow52 > 30) {
    score += 8;
    signals.push(`+${flag.lowFromLow52.toFixed(0)}% from 52wk low`);
  } else if (flag.lowFromLow52 > 15) {
    score += 5;
    signals.push(`+${flag.lowFromLow52.toFixed(0)}% from 52wk low`);
  }

  // 7. MACD above zero or histogram turning positive (max 8 pts)
  if (macdAboveZero && macdHistTurning) {
    score += 8;
    signals.push('MACD above zero + histogram turning up');
  } else if (macdAboveZero) {
    score += 5;
    signals.push('MACD above zero');
  } else if (macdHistTurning) {
    score += 4;
    signals.push('MACD histogram turning positive');
  }

  // 8. Price above 50 SMA (max 8 pts)
  if (priceAboveSMA50) {
    score += 8;
    signals.push('Holding above 50 SMA');
  }

  // 9. Price above 200 SMA — overall uptrend (max 7 pts)
  if (priceAboveSMA200) {
    score += 7;
    signals.push('Above 200 SMA (long-term uptrend)');
  }

  // 10. Bollinger squeeze / tight consolidation (max 5 pts)
  if (bollingerWidth < 0.08) {
    score += 5;
    signals.push('Bollinger squeeze (tight range)');
  } else if (bollingerWidth < 0.12) {
    score += 3;
    signals.push('Narrowing Bollinger bands');
  }

  // 11. Flag shape — lower highs (max 5 pts)
  if (flag.lowerHighsUpperFlat && flag.flagDays >= 3) {
    score += 5;
    signals.push(`Classic flag shape (${flag.flagDays} days)`);
  }

  return { score: Math.min(100, score), signals };
}

// ─── Main Scanner ────────────────────────────────────────────────

export async function scanBullFlagPullbacks(): Promise<BullFlagSetup[]> {
  // The static list froze the book into a software monoculture: the gainers
  // study found only 5 of the quarter's top-50 winners on ANY hand-list, while
  // the sectors that actually led (biotech, defense-on-news, leveraged
  // vehicles) had no seats. Movers from the whole liquid market join every
  // scan — a name that is RUNNING is exactly where a flag pullback forms next
  // — plus the buckets the hand-list never had.
  let universe: string[] = [...BULL_FLAG_UNIVERSE];
  try {
    const { getLiquidMovers } = await import('./liquid-universe');
    const { getSectorTickers } = await import('./ticker-universe');
    const movers = getLiquidMovers(3, 75e6, 60).map((m) => m.symbol);
    const buckets = ['defense', 'nuclear', 'space', 'quantum'].flatMap((s) => {
      try { return getSectorTickers(s); } catch { return []; }
    });
    universe = Array.from(new Set([...BULL_FLAG_UNIVERSE, ...movers, ...buckets].map((s) => s.toUpperCase())));
  } catch { /* universe cold — the static list still scans */ }
  logger.info(`[BULL-FLAG] 🚩 Scanning ${universe.length} tickers (${universe.length - BULL_FLAG_UNIVERSE.length} beyond the hand-list) for bull flag pullbacks...`);

  const results: BullFlagSetup[] = [];

  for (const symbol of universe) {
    try {
      const data = await fetchDaily(symbol);
      if (!data) continue;

      const quotes = data.indicators?.quote?.[0];
      const closes: number[] = (quotes?.close || []).filter((p: any) => p != null);
      const highs: number[] = (quotes?.high || []).filter((p: any) => p != null);
      const lows: number[] = (quotes?.low || []).filter((p: any) => p != null);
      const volumes: number[] = (quotes?.volume || []).filter((v: any) => v != null);

      if (closes.length < 50) continue;

      const currentPrice = closes[closes.length - 1];
      if (currentPrice <= 0) continue;

      // ── Compute indicators ──
      const ema20Arr = calcEMA(closes, 20);
      const ema50Arr = calcEMA(closes, 50);
      const ema20 = ema20Arr[ema20Arr.length - 1];
      const ema50 = ema50Arr[ema50Arr.length - 1];
      const sma200 = calcSMA(closes, Math.min(200, closes.length));
      const sma50 = calcSMA(closes, 50);
      const rsi14 = calcRSI(closes);
      const macd = calcMACD(closes);
      const bollingerWidth = calcBollingerWidth(closes);

      // ── Flag analysis ──
      const flag = analyzeFlag(closes, highs, lows, volumes);

      // ── Quick gate: skip if no prior uptrend or pullback too small/large ──
      if (!flag.hasPriorUptrend) continue;
      if (flag.pullbackPercent < 2 || flag.pullbackPercent > 35) continue;

      // ── Volume ──
      const currentVol = volumes[volumes.length - 1] || 0;
      const avgVol = volumes.slice(-20).reduce((s, v) => s + v, 0) / 20;
      const volumeRatio = avgVol > 0 ? currentVol / avgVol : 1;

      // ── Score ──
      const { score, signals } = scoreBullFlag(
        flag,
        rsi14,
        macd.macd > 0,
        macd.histogram > 0 || (macd.histogram > -0.05 && macd.histogram > 0), // turning positive
        ema20 > ema50,
        currentPrice > sma50,
        currentPrice > sma200,
        bollingerWidth,
      );

      // Only keep setups scoring ≥ 45
      if (score < 45) continue;

      // ── Grade ──
      let grade = 'D';
      if (score >= 85) grade = 'S';
      else if (score >= 75) grade = 'A';
      else if (score >= 65) grade = 'B';
      else if (score >= 55) grade = 'C';

      // ── Targets ──
      // Target: retrace to prior high, then extension
      const targetPercent = flag.pullbackPercent > 10
        ? Math.min(flag.pullbackPercent * 1.5, 25)
        : Math.min(flag.pullbackPercent * 2, 15);
      const targetPrice = currentPrice * (1 + targetPercent / 100);

      // Stop: below the flag low
      const flagLows = lows.slice(-(Math.min(flag.flagDays || 5, 15)));
      const flagLow = flagLows.length > 0 ? Math.min(...flagLows.filter(l => l > 0)) : currentPrice * 0.95;
      const stopLoss = flagLow * 0.99; // tiny buffer below flag low
      const stopLossPercent = ((currentPrice - stopLoss) / currentPrice) * 100;

      // Hold time based on flag duration
      const holdDays = Math.max(3, Math.min(15, Math.round(flag.flagDays * 0.7)));

      // Build reason string
      const reason = signals.slice(0, 4).join(' · ');

      // Trend bias
      const trendBias = (ema20 > ema50 && currentPrice > sma200) ? 'bullish' as const : 'neutral' as const;

      results.push({
        symbol,
        currentPrice,
        score,
        grade,
        direction: 'long',
        ema20,
        ema50,
        sma200,
        trendBias,
        priorLegPercent: flag.priorLegPercent,
        pullbackPercent: flag.pullbackPercent,
        pullbackFromHigh: flag.pullbackFromHigh,
        flagDays: flag.flagDays,
        flagTightness: flag.flagTightness,
        rsi14,
        macdHistogram: macd.histogram,
        macdAboveZero: macd.macd > 0,
        volumeRatio,
        flagVolumeDecline: flag.volumeDeclining,
        avgVolume: avgVol,
        entryPrice: currentPrice,
        targetPrice,
        targetPercent,
        stopLoss,
        stopLossPercent,
        holdDays,
        pattern: 'bull_flag_pullback',
        reason,
        signals,
        createdAt: new Date(),
      });

    } catch (err) {
      logger.error(`[BULL-FLAG] Error on ${symbol}:`, err);
    }

    // Rate limit Yahoo
    await new Promise(r => setTimeout(r, 100));
  }

  // Sort by score
  results.sort((a, b) => b.score - a.score);

  logger.info(`[BULL-FLAG] ✅ Found ${results.length} bull flag pullback setups`);
  return results;
}

/**
 * Get top bull flag opportunities — main export for API route
 */
export async function getTopBullFlagSetups(limit = 15): Promise<BullFlagSetup[]> {
  const all = await scanBullFlagPullbacks();
  return all.slice(0, limit);
}

/**
 * Auto-ingest high-scoring bull flag setups to Trade Desk
 */
export async function ingestBullFlagIdeas(): Promise<number> {
  try {
    const setups = await getTopBullFlagSetups(10);
    const { ingestTradeIdea } = await import("./trade-idea-ingestion");
    let ingested = 0;

    for (const setup of setups) {
      if (setup.score < 65) break; // Only B+ setups get auto-ingested

      try {
        const result = await ingestTradeIdea({
          source: 'market_scanner',
          symbol: setup.symbol,
          assetType: 'stock',
          direction: 'bullish',
          signals: setup.signals.map((sig, i) => ({
            type: `bull_flag_${i}`,
            weight: Math.min(15, Math.round(setup.score / 7)),
            description: sig,
          })),
          holdingPeriod: 'swing',
          currentPrice: setup.currentPrice,
          targetPrice: setup.targetPrice,
          stopLoss: setup.stopLoss,
          catalyst: `🚩 Bull Flag Pullback · pattern quality ${setup.score}/100 (${setup.grade}). ${setup.reason}`,
          analysis: `Bull flag pattern detected. Prior leg: +${setup.priorLegPercent.toFixed(0)}%, pullback: -${setup.pullbackPercent.toFixed(1)}%. ` +
            `RSI: ${setup.rsi14.toFixed(0)}, EMA stacking: ${setup.ema20 > setup.ema50 ? 'yes' : 'no'}. ` +
            `Signals: ${setup.signals.join(', ')}`,
        });
        if (result.success) ingested++;
      } catch {
        // Dedup gate blocked — expected
      }
    }

    if (ingested > 0) {
      logger.info(`[BULL-FLAG] 📤 Auto-ingested ${ingested} bull flag setups to Trade Desk`);
    }
    return ingested;
  } catch (err) {
    logger.error('[BULL-FLAG] Ingest error:', err);
    return 0;
  }
}
