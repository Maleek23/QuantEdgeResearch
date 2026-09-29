/**
 * MARKET tools — pulse, rotation, session brief (were the terminal's
 * unreachable market-focus overlay; IA functions markets.pulse / markets.rotation),
 * plus Stock Chart (research.chart) and Watchlist (markets.watchlist).
 */
import { lazyTool, type ToolDef } from '../tool-def';

const market = () => import('../tools/market/market-tools');
const flowTools = () => import('../tools/flow/flow-tools');

export const MARKET_TOOLS: ToolDef[] = [
  // Stock Chart + Watchlist (were in defs/flow.ts; components still live in tools/flow/flow-tools.tsx).
  {
    id: 'stock-chart', category: 'Market', title: 'Stock Chart',
    what: 'Price with GEX-through-time bubbles, multi-day dark-pool levels and flow prints for the focused ticker.',
    units: 'price $, GEX $/1%, notional $', source: 'candles + /api/chart/overlays', backing: 'FlowChartBoard (components/charting/flow-chart-nexus.tsx)',
    ageInside: true, needs: ['symbol'], defaultSize: { w: 4, h: 16 }, minSize: { w: 4, h: 10 }, Component: lazyTool(flowTools, 'StockChartTool'),
  },
  {
    id: 'watchlist', category: 'Market', title: 'Watchlist',
    what: 'Your watchlist with the latest extended-hours move; unpriced names show a dash.',
    units: '% change', source: 'watchlist + extended-hours scan', backing: 'WatchlistRail (components/oracle/oracle-rails.tsx) → /api/watchlist',
    ageInside: true, defaultSize: { w: 3, h: 8 }, minSize: { w: 3, h: 5 }, Component: lazyTool(flowTools, 'WatchlistTool'),
  },
  {
    id: 'market-pulse', category: 'Market', title: 'Market pulse',
    what: 'Broad asset participation and where money is rotating right now, across asset classes.',
    units: '% change', source: 'sector rotation + extended-hours scan', backing: 'OracleMarketField (oracle/oracle-market-field.tsx) → /api/sector-rotation, /api/extended-hours',
    ageInside: true, defaultSize: { w: 6, h: 10 }, minSize: { w: 4, h: 6 }, Component: lazyTool(market, 'MarketPulseTool'),
  },
  {
    id: 'market-rotation', category: 'Market', title: 'Rotation map',
    what: 'Relative strength × momentum across the sector universe; click a sector for its rotation tape.',
    units: 'relative strength vs SPY, momentum', source: 'sector rotation', backing: 'RotationMap (components/rotation-map.tsx) → /api/sector-rotation, /api/rotation-tape/:etf',
    ageInside: true, defaultSize: { w: 6, h: 12 }, minSize: { w: 4, h: 8 }, Component: lazyTool(market, 'RotationMapTool'),
  },
  {
    id: 'market-session-brief', category: 'Market', title: 'Session brief',
    what: 'The groups carrying today’s tape and the names inside them, with the macro cash gate.',
    units: '% change, leadership rank', source: 'sector leadership + macro cash gate', backing: 'SessionBrief (oracle/session-brief.tsx) → /api/sector-leadership, /api/macro/cash-gate',
    ageInside: true, defaultSize: { w: 6, h: 10 }, minSize: { w: 4, h: 6 }, Component: lazyTool(market, 'SessionBriefTool'),
  },
];
