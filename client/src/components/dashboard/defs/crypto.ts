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
    id: 'crypto-spot', category: 'Crypto', title: 'Spot read · BTC / ETH',
    what: 'BTC and ETH spot with 60 daily closes, 24h / 7d / 30d change, 14-day RSI (extended ≥70 or ≤30) and 30-day realized volatility.',
    units: 'price $, % change, RSI 0–100, annualized vol %', source: PULSE,
    backing: `CryptoSpotRead (${BOARD}) → /api/crypto/pulse`,
    defaultSize: { w: 5, h: 9 }, minSize: { w: 3, h: 6 }, Component: lazyTool(crypto, 'CryptoSpotTool'),
  },
  {
    id: 'crypto-chart', category: 'Crypto', title: 'Structure lab · coin chart',
    what: 'Interactive chart for BTC, ETH, SOL, XRP or QNT against USD, with spot, 7d / 30d change, RSI and realized vol for the selected coin.',
    units: 'price $, % change, RSI, vol %', source: 'coin candles + crypto pulse',
    backing: `CryptoChartDeck (${BOARD}) → /api/historical-prices/<COIN>-USD, /api/crypto/pulse`,
    defaultSize: { w: 7, h: 16 }, minSize: { w: 4, h: 9 }, Component: lazyTool(crypto, 'CryptoChartTool'),
  },
  {
    id: 'crypto-summary', category: 'Crypto', title: 'Crypto summary · ratio & feeds',
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
    id: 'crypto-correlation', category: 'Crypto', title: 'Proxy correlation · ~30d',
    what: 'Pearson r of daily log returns, each equity proxy vs its coin (IBIT, MSTR, MARA, COIN, RIOT vs BTC; HOOD vs ETH), aligned by date; fewer than 12 overlapping sessions shows a dash.',
    units: 'correlation r (−1…1)', source: `${PULSE} + daily equity closes`,
    backing: `CryptoCorrelation (${BOARD}) → /api/crypto/pulse + price history`,
    defaultSize: { w: 4, h: 7 }, minSize: { w: 3, h: 5 }, Component: lazyTool(crypto, 'CryptoCorrelationTool'),
  },
  {
    id: 'crypto-proxy-gate', category: 'Crypto', title: 'Proxy promotion gate',
    what: 'Which crypto proxies may become Nexus trade ideas now: the coin\'s 7d move, the proxy\'s own options-tape gate and a measured chart invalidation; click a row for the full workup.',
    units: '% change, gate status', source: 'proxy-candidate trace',
    backing: `CryptoProxyGate (${BOARD}) → /api/crypto/proxy-candidates`,
    defaultSize: { w: 8, h: 8 }, minSize: { w: 4, h: 5 }, Component: lazyTool(crypto, 'CryptoProxyGateTool'),
  },
  {
    id: 'crypto-proxy-board', category: 'Crypto', title: 'Proxy board · BTC & ETH routes',
    what: 'Equity routes to each coin (spot ETF, treasury, exchange, miner, broker) with the measured correlation to the coin; click a card for the full ticker workup.',
    units: 'correlation r, % change', source: `${PULSE} + daily equity closes`,
    backing: `CryptoProxyBoard (${BOARD}) → /api/crypto/pulse + price history`,
    defaultSize: { w: 8, h: 12 }, minSize: { w: 4, h: 6 }, Component: lazyTool(crypto, 'CryptoProxyBoardTool'),
  },
  {
    id: 'crypto-guide', category: 'Crypto', title: 'How to read crypto',
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
 * CRYPTO default — the coin chart large with the spot read beside it; the
 * ratio/feeds summary under the spot cards; then the promotion gate with
 * sentiment and correlation, the proxy board, and the method last.
 */
export const CRYPTO_DEFAULTS: DefaultLayout[] = [{
  id: 'default', name: 'Crypto',
  tools: [
    ['crypto-chart', 0, 0, 7, 16],
    ['crypto-spot', 7, 0, 5, 10],
    ['crypto-summary', 7, 10, 5, 6],
    ['crypto-proxy-gate', 0, 16, 8, 8],
    ['crypto-sentiment', 8, 16, 4, 6],
    ['crypto-correlation', 8, 22, 4, 7],
    ['crypto-proxy-board', 0, 24, 8, 12],
    ['crypto-guide', 8, 29, 4, 7],
  ],
}];
