/**
 * QUANT BOT — paper-trades the platform's own signals, so the engine gets a track record.
 *
 * Everything upstream produces opinions; nothing was recording whether they worked. The
 * bot closes that loop: it takes the highest-conviction signals into a paper portfolio,
 * manages them against their own stop/target, and books the result. That produces the one
 * number that actually matters — did this engine make money — and feeds grade calibration
 * with real outcomes instead of assumptions.
 *
 * Rules are deliberately mechanical. A bot that second-guesses the signal is no longer
 * measuring the signal.
 */
import { logger } from './logger';
import { storage } from './storage';
import {
  executeTradeIdea, checkStopsAndTargets, updatePositionPrices,
  calculatePortfolioValue, recordEquitySnapshot,
  getOpenPositions, getClosedPositions,
} from './paper-trading-service';

const BOT_PORTFOLIO_NAME = 'Quant Bot';
const BOT_USER = 'system-quant-bot';

export interface BotConfig {
  minConviction: number;   // only take signals at/above this raw conviction score
  maxOpen: number;         // concurrent positions
  startingCapital: number;
  riskPerTradePct: number;
}

export const DEFAULT_BOT_CONFIG: BotConfig = {
  // convictionScore is a raw CONFLUENCE-POINT sum, not a percent: it tops out around the
  // high 20s and the bands are S>=30 / A>=22 / B>=15. A threshold of 25 therefore left
  // only 3 eligible names out of 52. 18 takes solid B/A-band setups without scraping the
  // bottom of the board.
  minConviction: 18,
  maxOpen: 10,
  startingCapital: 10_000,
  riskPerTradePct: 2,
};

/** The bot trades one dedicated portfolio; create it on first run. */
export async function getBotPortfolio(cfg: BotConfig = DEFAULT_BOT_CONFIG) {
  const all = await storage.getAllPaperPortfolios().catch(() => [] as any[]);
  const existing = Array.isArray(all) ? all.find((p: any) => p.name === BOT_PORTFOLIO_NAME) : null;
  if (existing) return existing;

  return storage.createPaperPortfolio({
    userId: BOT_USER,
    name: BOT_PORTFOLIO_NAME,
    startingCapital: cfg.startingCapital,
    cashBalance: cfg.startingCapital,
    totalValue: cfg.startingCapital,
    // riskPerTrade is stored as a FRACTION (0.02 = 2%). Passing the percent value made
    // the sizer read 2 as 200% risk, which then hit the flat $5,000 position cap — two
    // trades consumed the entire $10k account. A bot that goes all-in on two names isn't
    // measuring signals.
    riskPerTrade: cfg.riskPerTradePct / 100,
    maxPositionSize: Math.round((cfg.startingCapital * 0.15)),
  } as any);
}

export interface BotRunResult {
  ranAt: string;
  portfolioId: string;
  opened: { symbol: string; reason: string }[];
  closed: { symbol: string; reason: string }[];
  skipped: number;
  openCount: number;
  error?: string;
}

/**
 * One bot cycle: mark positions to market, take exits the signal itself defined, then
 * fill any remaining slots with the best signals available.
 */
export async function runBotCycle(cfg: BotConfig = DEFAULT_BOT_CONFIG): Promise<BotRunResult> {
  const ranAt = new Date().toISOString();
  const opened: BotRunResult['opened'] = [];
  const closed: BotRunResult['closed'] = [];
  let skipped = 0;

  const portfolio: any = await getBotPortfolio(cfg);
  if (!portfolio?.id) {
    return { ranAt, portfolioId: '', opened, closed, skipped, openCount: 0, error: 'no portfolio' };
  }

  // 1 — mark to market, then let stops/targets fire. Exits come BEFORE entries so a slot
  //     freed this cycle can be reused immediately.
  try {
    await updatePositionPrices(portfolio.id);
    const exited = await checkStopsAndTargets(portfolio.id);
    for (const p of exited ?? []) {
      closed.push({ symbol: p.symbol, reason: (p as any).exitReason ?? 'stop/target' });
    }
  } catch (err) {
    logger.warn('[QUANT-BOT] mark-to-market / exit check failed:', err);
  }

  // 2 — fill free slots with the best available signals
  try {
    const open = await getOpenPositions(portfolio.id);
    const slots = Math.max(0, cfg.maxOpen - open.length);

    if (slots > 0) {
      const { getCachedConvictions } = await import('./convictions-engine');
      const board = await getCachedConvictions({});
      const heldSymbols = new Set(open.map((p) => p.symbol));

      const candidates = (board.picks ?? [])
        .filter((p) => p.convictionScore >= cfg.minConviction)
        .filter((p) => !heldSymbols.has(p.symbol))
        .sort((a, b) => b.convictionScore - a.convictionScore)
        .slice(0, slots);

      for (const pick of candidates) {
        const idea: any = await storage.getTradeIdeaById(pick.ideaId).catch(() => null);
        if (!idea) { skipped++; continue; }

        // Most signals are tagged assetType 'option', but the platform stores the
        // UNDERLYING stock levels on them — the thesis is on the stock and the Contract
        // Engine picks the vehicle separately. Paper-trading them as options would need
        // live premium data, which we don't have (Tradier is unfunded/401). So the bot
        // trades the underlying against those same levels: it measures the SIGNAL, which
        // is the point, instead of failing to fill on a dead options feed.
        // The live price lives on the API pick, not on the stored row — without passing
        // it through, the fill falls back to the idea's planned entry and the position
        // opens already in profit on a stale signal. Paper P&L must start at zero.
        const base = { ...idea, currentPrice: pick.currentPrice ?? null };
        const tradeable = idea.assetType === 'option'
          ? { ...base, assetType: 'stock', optionType: null, strikePrice: null, expiryDate: null }
          : base;

        if (!pick.currentPrice) { skipped++; continue; }  // no live mark → no honest fill

        const res = await executeTradeIdea(portfolio.id, tradeable as any);
        if (res.success) {
          opened.push({
            symbol: pick.symbol,
            reason: `${pick.convictionBand}-band ${pick.convictionScore} · R:R 1:${(pick.riskRewardRatio ?? 0).toFixed(1)}`,
          });
        } else {
          skipped++;
          logger.debug(`[QUANT-BOT] skipped ${pick.symbol}: ${res.error ?? 'no fill'}`);
        }
      }
    }
  } catch (err) {
    logger.warn('[QUANT-BOT] entry pass failed:', err);
  }

  // 3 — snapshot the curve so performance is measurable over time
  try { await recordEquitySnapshot(portfolio.id); } catch { /* non-fatal */ }

  const openCount = (await getOpenPositions(portfolio.id)).length;
  logger.info(`[QUANT-BOT] cycle: +${opened.length} opened, -${closed.length} closed, ${openCount} open`);
  return { ranAt, portfolioId: portfolio.id, opened, closed, skipped, openCount };
}

export interface BotStatus {
  portfolioId: string;
  name: string;
  startingCapital: number;
  cashBalance: number;
  totalValue: number;
  totalPnL: number;
  totalPnLPercent: number;
  winCount: number;
  lossCount: number;
  winRate: number | null;
  openPositions: any[];
  closedPositions: any[];
  config: BotConfig;
}

export async function getBotStatus(cfg: BotConfig = DEFAULT_BOT_CONFIG): Promise<BotStatus | null> {
  const portfolio: any = await getBotPortfolio(cfg);
  if (!portfolio?.id) return null;

  try { await updatePositionPrices(portfolio.id); } catch { /* stale marks are still usable */ }

  const [open, closedAll, value] = await Promise.all([
    getOpenPositions(portfolio.id).catch(() => []),
    getClosedPositions(portfolio.id).catch(() => []),
    calculatePortfolioValue(portfolio.id).catch(() => null),
  ]);

  const startingCapital = portfolio.startingCapital ?? cfg.startingCapital;
  const totalValue = value?.totalValue ?? portfolio.totalValue ?? startingCapital;

  const wins = closedAll.filter((p: any) => (p.realizedPnL ?? 0) > 0).length;
  const losses = closedAll.filter((p: any) => (p.realizedPnL ?? 0) <= 0).length;
  const decided = wins + losses;

  return {
    portfolioId: portfolio.id,
    name: portfolio.name,
    startingCapital,
    cashBalance: value?.cashBalance ?? portfolio.cashBalance ?? 0,
    totalValue,
    // PortfolioValue reports UNREALISED only, so total P&L is measured against the
    // starting capital — that captures realised and unrealised together.
    totalPnL: totalValue - startingCapital,
    totalPnLPercent: startingCapital > 0 ? ((totalValue - startingCapital) / startingCapital) * 100 : 0,
    winCount: wins,
    lossCount: losses,
    // Honest: no win rate until something has actually closed.
    winRate: decided > 0 ? (wins / decided) * 100 : null,
    openPositions: open,
    closedPositions: closedAll.slice(0, 25),
    config: cfg,
  };
}
