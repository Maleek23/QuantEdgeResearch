/**
 * INDEX SWING SCANNER — SPX-complex pullback entries with the discount measured.
 *
 * Operator ask (2026-09-23): "find SPX discounts for swings... SPX QQQ IWM
 * SPY... a 1.0 can turn to 30." The honest version of that trade: buy index
 * premium when (a) the trend is up, (b) price has pulled back to a measured
 * level, and (c) premium is CHEAP (low VIX regime / chain IV near realized).
 * The $1→$30 outcome is a convexity tail, not a plan — cards say the 2R math
 * and let the tail be a bonus.
 *
 * Indices were structurally invisible before this: the tape leaderboard
 * excludes ETFs and the reversal scanner needs a 10% decline that index
 * products rarely print. This scanner owns the SPX complex directly.
 */
import { logger } from './logger';
import { getUniverseBars, liquidUniverseStatus, type UBar } from './liquid-universe';
import { ingestTradeIdea } from './trade-idea-ingestion';
import { quoteWithDayLow } from './bullflow-tape-scanner';

const INDEX_ETFS = ['SPY', 'QQQ', 'IWM', 'DIA', 'SMH', 'IGV', 'XBI'];
const MAX_PUBLISH = 2;
/** VIX below this = the cheap end of index premium (measured each run). */
const VIX_CHEAP = 16;

const dayDone = new Map<string, string>();
const marketDateET = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

interface IndexSetup {
  symbol: string;
  lastClose: number;
  sma50: number;
  high20: number;
  pullbackPct: number;   // off the 20d high
  stop: number;
  stopBasis: string;
  t1: number;            // the 20d high — a real level
  t2: number;            // 2R beyond, declared
  riskPct: number;
  score: number;
  reasons: string[];
}

function detectIndexPullback(symbol: string, bars: UBar[]): IndexSetup | null {
  const n = bars.length;
  if (n < 60) return null;
  const closes = bars.map((b) => b.close);
  const last = bars[n - 1];
  const sma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
  const sma50Prev = closes.slice(-60, -10).reduce((a, b) => a + b, 0) / 50;
  // Trend filter: above a RISING 50-session mean. Swing longs only (house
  // rule: no shorts without an event catalyst).
  if (!(last.close > sma50 && sma50 > sma50Prev)) return null;

  const last20 = bars.slice(-20);
  const high20 = Math.max(...last20.map((b) => b.high));
  const pullbackPct = (high20 - last.close) / high20;
  // The discount window: pulled back a real amount, but the trend intact.
  if (pullbackPct < 0.012 || pullbackPct > 0.06) return null;

  // Pullback, not a crash: a single -3% index day IS the discount being
  // bought (XBI -3.2% on 2026-09-23 was the setup, not a disqualifier). What
  // disqualifies is persistent selling: any single session <= -3.5%, or the
  // last 3 sessions compounding to <= -5%.
  const last4 = bars.slice(-4);
  for (let k = 1; k < last4.length; k++) {
    if (last4[k].close / last4[k - 1].close - 1 <= -0.035) return null;
  }
  if (last4.length === 4 && last4[3].close / last4[0].close - 1 <= -0.05) return null;

  // Stop cascade, tightest printed low first: the pullback's own 3-session
  // floor is the natural invalidation; widen to 5 then 10 sessions only when
  // the tighter low leaves no room (<0.6%). A wide stop against a near
  // target is the R:R trap the storage gate rejects — tighter measured
  // stops fix the geometry honestly (IGV 2026-09-23: 3-session low made
  // R:R 1.3 where the 5-session low gave 0.49).
  let stop = NaN;
  let riskPct = NaN;
  for (const win of [3, 5, 10]) {
    const s2 = Math.min(...bars.slice(-win).map((b) => b.low));
    const r2 = (last.close - s2) / last.close;
    if (r2 >= 0.006 && r2 <= 0.045) { stop = s2; riskPct = r2; break; }
  }
  if (!Number.isFinite(stop)) return null;

  const risk = last.close - stop;
  const t1 = Number(high20.toFixed(2));
  const t2 = Number((last.close + 2 * (t1 - last.close) + risk).toFixed(2));

  let score = 60;
  const reasons = [
    `uptrend: above a rising 50-session mean ($${sma50.toFixed(2)})`,
    `pulled back ${(pullbackPct * 100).toFixed(1)}% off the 20-session high $${high20.toFixed(2)}`,
    `invalidation at the 5-session low $${stop.toFixed(2)} (${(riskPct * 100).toFixed(1)}% risk)`,
  ];
  if (pullbackPct >= 0.025) { score += 8; reasons.push('deeper discount within the trend'); }
  const rr = (t1 - last.close) / risk;
  if (rr >= 1.5) { score += 8; reasons.push(`${rr.toFixed(1)}R just back to the prior high`); }

  return { symbol, lastClose: last.close, sma50, high20, pullbackPct, stop, stopBasis: '5-session low', t1, t2, riskPct, score, reasons };
}

async function vixNow(): Promise<number | null> {
  try {
    const YahooFinance = (await import('yahoo-finance2')).default as any;
    const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
    const q: any = await yf.quote('^VIX');
    const v = Number(q?.regularMarketPrice);
    return Number.isFinite(v) ? v : null;
  } catch { return null; }
}

export async function runIndexSwingScan(): Promise<number> {
  if (liquidUniverseStatus().size === 0) {
    logger.warn('[INDEX-SWING] liquid universe not warmed — skipped');
    return 0;
  }
  const bars = await getUniverseBars(70);
  const vix = await vixNow();
  const today = marketDateET();
  let published = 0;

  for (const sym of INDEX_ETFS) {
    if (published >= MAX_PUBLISH) break;
    if (dayDone.get(sym) === today) continue;
    let series = bars.get(sym);
    if (!series) continue;
    // Grouped daily bars end at the PRIOR close; the pullback being hunted is
    // usually happening TODAY. Append a live synthetic bar so the detector
    // sees the current session (volume unknown — set 0, never fabricated).
    try {
      const lq = await quoteWithDayLow(sym);
      if (lq) {
        const lastBarDate = new Date(series[series.length - 1].time * 1000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        if (lastBarDate !== today) {
          series = [...series, {
            time: Math.floor(Date.now() / 1000),
            open: Number.isFinite(lq.prevClose) ? lq.prevClose : lq.last,
            high: Math.max(lq.last, Number.isFinite(lq.prevClose) ? lq.prevClose : lq.last),
            low: lq.low,
            close: lq.last,
            volume: 0,
          }];
        }
      }
    } catch { /* live augmentation is best-effort */ }
    const setup = detectIndexPullback(sym, series);
    if (!setup) { logger.info(`[INDEX-SWING] ${sym}: no qualifying pullback (trend/depth/risk gates)`); continue; }

    // The discount half: cheap index premium regime, measured not vibed.
    const cheap = vix != null && vix < VIX_CHEAP;
    const vixNote = vix != null
      ? `VIX ${vix.toFixed(1)} — ${cheap ? 'cheap end of index premium' : 'premium not at a discount'}`
      : 'VIX unavailable';

    // Convexity contract note from the picker (best-effort decoration).
    let contractNote = '';
    try {
      const { pickContracts } = await import('./contract-picker');
      const picked = await pickContracts(sym, { direction: 'long', dteMin: 7, dteMax: 21 });
      const c = picked?.candidates?.[0];
      if (c && c.delta != null) {
        const moveToT1 = setup.t1 - setup.lastClose;
        const roiT1 = (c.delta * moveToT1 * 100) / c.costPerContract;
        contractNote = ` Convexity read: ${c.label} @ $${c.mid} — delta-approx ${(roiT1 * 100).toFixed(0)}% on premium at T1 (approximation, not a promise; the $1→$30 story is a tail outcome, not the plan).`;
      }
    } catch { /* decoration only */ }

    const signals = [
      { type: 'index_trend_pullback', weight: 22, description: setup.reasons.slice(0, 2).join('; ') },
      { type: 'measured_invalidation', weight: 8, description: setup.reasons[2] },
      { type: 'premium_regime', weight: cheap ? 8 : 3, description: vixNote },
    ];

    try {
      const result = await ingestTradeIdea({
        source: 'market_scanner',
        symbol: sym,
        assetType: 'stock',
        direction: 'bullish',
        signals,
        holdingPeriod: 'swing',
        currentPrice: setup.lastClose,
        targetPrice: setup.t1,
        stopLoss: Number(setup.stop.toFixed(2)),
        catalyst: `Index swing discount: ${(setup.pullbackPct * 100).toFixed(1)}% pullback in an uptrend · ${vixNote}`,
        analysis:
          `Index-swing entry on the ${sym} complex: ${setup.reasons.join('; ')}. ` +
          `T1 $${setup.t1} is the prior 20-session high (a real level); T2 $${setup.t2} is declared as trend extension beyond it. ` +
          `${vixNote}.${contractNote}`,
        sourceMetadata: { scannerType: 'index_swing', vix, pullbackPct: setup.pullbackPct, t2: setup.t2 },
      });
      dayDone.set(sym, today);
      if (result.success) {
        published++;
        logger.info(`[INDEX-SWING] 📤 ${sym} — ${(setup.pullbackPct * 100).toFixed(1)}% pullback, ${vixNote}`);
      } else {
        logger.info(`[INDEX-SWING] ${sym} not published: ${result.reason}`);
      }
    } catch (err: any) {
      logger.warn(`[INDEX-SWING] ${sym} failed: ${err?.message ?? err}`);
    }
  }

  logger.info(`[INDEX-SWING] run done — ${published} published`);
  return published;
}
