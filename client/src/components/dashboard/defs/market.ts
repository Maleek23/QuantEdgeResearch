/**
 * MARKET tools — pulse, rotation, session brief (were the terminal's
 * unreachable market-focus overlay; IA functions markets.pulse / markets.rotation).
 */
import { lazyTool, type ToolDef } from '../tool-def';

const market = () => import('../tools/market/market-tools');

export const MARKET_TOOLS: ToolDef[] = [
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
