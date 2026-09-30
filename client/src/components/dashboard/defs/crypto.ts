/**
 * CRYPTO tools — the Crypto board (components/crypto/crypto-nexus.tsx) split
 * into tools (tools/crypto/crypto-tools.tsx). Every tool shares the board's
 * queries (identical keys): one pulse, one sentiment, one proxy trace.
 */
import { lazyTool, type DefaultLayout, type ToolDef } from '../tool-def';

const crypto = () => import('../tools/crypto/crypto-tools');
const BOARD = 'CryptoNexus (components/crypto/crypto-nexus.tsx)';
const PULSE = 'crypto pulse';

export const CRYPTO_TOOLS: ToolDef[] = [
  {
    id: 'crypto-ideas', category: 'Crypto', title: 'Crypto Ideas · 24/7',
    what: 'Native crypto trade ideas (BTC, ETH, SOL, HYPE, QNT, XRP, DOGE, LINK, AVAX, SUI), long and short: trend pullback, range breakout / reclaim with volume, funding + OI squeeze / fade, BTC-regime filter for alts. Entry zone, stop, T1 (≤ 1σ of the horizon) / T2, time stop, why + evidence, crypto structure grade (CS-A/B, its own scale); BTC/ETH ideas list the equity proxies to WATCH (not confirmed until their own tape confirms); the engine\'s record since first publish with n (LOW N < 20).',
    units: 'price $, R multiple, funding % APR, OI %', source: 'crypto engine (Coinbase spot candles + Hyperliquid perps), scans every 30 min 24/7',
    backing: 'CryptoIdeasList (components/crypto/crypto-ideas.tsx) ← GET /api/crypto/ideas (server/crypto-ideas-engine.ts)',
    defaultSize: { w: 12, h: 9 }, minSize: { w: 4, h: 5 }, Component: lazyTool(crypto, 'CryptoIdeasTool'),
  },
  {
    id: 'crypto-spot', category: 'Crypto', title: 'Spot Read · BTC / ETH',
    what: 'BTC and ETH spot with 60 daily closes, 24h / 7d / 30d change, 14-day RSI (extended ≥70 or ≤30) and 30-day realized volatility.',
    units: 'price $, % change, RSI 0–100, annualized vol %', source: PULSE,
    backing: `CryptoSpotRead (${BOARD}) → /api/crypto/pulse`,
    defaultSize: { w: 5, h: 9 }, minSize: { w: 3, h: 6 }, Component: lazyTool(crypto, 'CryptoSpotTool'),
  },
  {
    id: 'crypto-chart', category: 'Crypto', title: 'Structure Lab · coin chart',
    what: 'Interactive chart for BTC, ETH, SOL, XRP or QNT against USD, with spot, 7d / 30d change, RSI and realized vol for the selected coin.',
    units: 'price $, % change, RSI, vol %', source: 'coin candles + crypto pulse',
    backing: `CryptoChartDeck (${BOARD}) → /api/historical-prices/<COIN>-USD, /api/crypto/pulse`,
    defaultSize: { w: 7, h: 16 }, minSize: { w: 4, h: 9 }, Component: lazyTool(crypto, 'CryptoChartTool'),
  },
  {
    id: 'crypto-summary', category: 'Crypto', title: 'Crypto Summary · ratio & feeds',
    what: 'BTC and ETH spot with 24h change, the ETH/BTC ratio of the live spots with its 7-day change, and how many realtime feeds (Coinbase, futures) are connected.',
    units: 'price $, % change, ratio, feeds', source: `${PULSE} · realtime status`,
    backing: `CryptoSummary (${BOARD}) → /api/crypto/pulse, /api/realtime-status`,
    defaultSize: { w: 5, h: 5 }, minSize: { w: 3, h: 4 }, Component: lazyTool(crypto, 'CryptoSummaryTool'),
  },
  {
    id: 'crypto-sentiment', category: 'Crypto', title: 'Fear & Greed · BTC dominance',
    what: 'The crypto Fear & Greed index (alternative.me) on a fear→greed meter and BTC market-cap dominance (CoinGecko); NOT MEASURED when the feed is down.',
    units: 'index 0–100, % of crypto market cap', source: 'alternative.me · CoinGecko (30-min server cache)',
    backing: `CryptoSentiment (${BOARD}) → /api/crypto/sentiment`,
    defaultSize: { w: 3, h: 6 }, minSize: { w: 3, h: 4 }, Component: lazyTool(crypto, 'CryptoSentimentTool'),
  },
  {
    id: 'crypto-correlation', category: 'Crypto', title: 'Proxy Correlation · ~30d',
    what: 'Pearson r of daily log returns, each equity proxy vs its coin (IBIT, MSTR, MARA, COIN, RIOT vs BTC; HOOD vs ETH), aligned by date; fewer than 12 overlapping sessions shows a dash.',
    units: 'correlation r (−1…1)', source: `${PULSE} + daily equity closes`,
    backing: `CryptoCorrelation (${BOARD}) → /api/crypto/pulse + price history`,
    defaultSize: { w: 4, h: 7 }, minSize: { w: 3, h: 5 }, Component: lazyTool(crypto, 'CryptoCorrelationTool'),
  },
  {
    id: 'crypto-proxy-gate', category: 'Crypto', title: 'Proxy Promotion Gate',
    what: 'Which crypto proxies may become Nexus trade ideas now: the coin\'s 7d move, the proxy\'s own options-tape gate and a measured chart invalidation; click a row for the full workup.',
    units: '% change, gate status', source: 'proxy-candidate trace',
    backing: `CryptoProxyGate (${BOARD}) → /api/crypto/proxy-candidates`,
    defaultSize: { w: 8, h: 8 }, minSize: { w: 4, h: 5 }, Component: lazyTool(crypto, 'CryptoProxyGateTool'),
  },
  {
    id: 'crypto-proxy-board', category: 'Crypto', title: 'Proxy Board · BTC & ETH routes',
    what: 'Equity routes to each coin (spot ETF, treasury, exchange, miner, broker) with the measured correlation to the coin; click a card for the full ticker workup.',
    units: 'correlation r, % change', source: `${PULSE} + daily equity closes`,
    backing: `CryptoProxyBoard (${BOARD}) → /api/crypto/pulse + price history`,
    defaultSize: { w: 8, h: 12 }, minSize: { w: 4, h: 6 }, Component: lazyTool(crypto, 'CryptoProxyBoardTool'),
  },
  {
    id: 'crypto-guide', category: 'Crypto', title: 'How to Read Crypto',
    what: 'The method: read the underlying, choose the transmission, validate the option in the workup — plus the spot-read heartbeat, feeds live and proxy count.',
    units: 'steps', source: 'editorial · spot pulse heartbeat',
    backing: `CryptoHeader + CryptoHowTo (${BOARD})`,
    defaultSize: { w: 12, h: 8 }, minSize: { w: 4, h: 5 }, Component: lazyTool(crypto, 'CryptoGuideTool'),
  },
  {
    id: 'crypto-board', category: 'Crypto', title: 'Crypto (all-in-one, classic)',
    what: 'The previous Crypto page in one tile: spot read, structure lab, promotion gate, proxy board and guide, with the summary / correlation / sentiment rail.',
    units: 'price $, % change, r, index', source: PULSE, backing: BOARD,
    defaultSize: { w: 12, h: 20 }, minSize: { w: 8, h: 12 }, Component: lazyTool(crypto, 'CryptoBoardTool'),
  },
];

/**
 * CRYPTO default — the native ideas list (12×9) on top, then (12 × 18):
 *   ┌────────── coin chart 8×11 ──────────┬ spot read 4×11 ┐
 *   ├──── promotion gate 6×7 ─────┬ fear & greed 3×7 ┬ correlation 3×7 ┤
 * Proxy board, summary and the method: Add tool.
 */
export const CRYPTO_DEFAULTS: DefaultLayout[] = [{
  id: 'default', name: 'Crypto',
  tools: [
    ['crypto-ideas', 0, 0, 12, 9],
    ['crypto-chart', 0, 9, 8, 11],
    ['crypto-spot', 8, 9, 4, 11],
    ['crypto-proxy-gate', 0, 20, 6, 7],
    ['crypto-sentiment', 6, 20, 3, 7],
    ['crypto-correlation', 9, 20, 3, 7],
  ],
}];
