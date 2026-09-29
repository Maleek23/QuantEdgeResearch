/**
 * CHART tools — Chart Lab (components/charting/chart-lab-nexus.tsx) split into
 * tools (tools/chart/chart-tools.tsx). The Stock Chart itself (FlowChartBoard,
 * GEX bubbles + dark-pool levels + flow prints) is the Flow page's
 * 'stock-chart' tool and is placed here by id, not re-registered.
 * All Chart Lab tools share the board's queries (identical keys).
 */
import { lazyTool, type DefaultLayout, type ToolDef } from '../tool-def';

const chart = () => import('../tools/chart/chart-tools');
const LAB = 'ChartLabBoard (components/charting/chart-lab-nexus.tsx)';

export const CHART_TOOLS: ToolDef[] = [
  {
    id: 'chart-lab-chart', category: 'Market', title: 'Chart Lab · levels chart',
    what: 'The shared price engine for the focused ticker with the published STOP / ENTRY / T1 and dealer walls, flip, king node and strongest Γ nodes drawn on price; instrument picker and OHLC readout.',
    units: 'price $, volume', source: 'candles + convictions + GEX engine',
    backing: `ChartLabChartPane (${LAB}) → /api/historical-prices, /api/convictions, /api/gex-vex/terminal/:symbol`,
    needs: ['symbol'], defaultSize: { w: 8, h: 16 }, minSize: { w: 4, h: 9 }, Component: lazyTool(chart, 'ChartLabChartTool'),
  },
  {
    id: 'chart-levels', category: 'Research', title: 'QuantEdge levels',
    what: 'The published signal\'s STOP / ENTRY / T1 plus measured dealer structure (walls, gamma flip, king node, top Γ nodes within 15%) for the focused ticker, with side and R:R. States absence when no signal is published.',
    units: 'price $', source: 'convictions + GEX engine',
    backing: `ChartLabLevels (${LAB}) → /api/convictions, /api/gex-vex/terminal/:symbol`,
    needs: ['symbol'], defaultSize: { w: 4, h: 8 }, minSize: { w: 3, h: 5 }, Component: lazyTool(chart, 'ChartLevelsTool'),
  },
  {
    id: 'chart-es-risk', category: 'Market', title: 'ES translation · futures risk',
    what: 'Measured ES and SPX quotes with the ES–SPX basis, and a contract sizer: account, risk % and stop points → max MES / ES contracts.',
    units: 'index points, $ risk, contracts', source: 'ES context',
    backing: `ChartLabEsRisk (${LAB}) → /api/futures/es-context`,
    defaultSize: { w: 4, h: 7 }, minSize: { w: 3, h: 5 }, Component: lazyTool(chart, 'ChartEsRiskTool'),
  },
  {
    id: 'chart-watchlists', category: 'Market', title: 'Watchlists · mine + traders',
    what: 'Your watchlist and one tab per trader (their lists, journal link, add/remove when permitted) with 5-day sparks and the latest move; click a name to chart it.',
    units: '% change', source: 'watchlists + extended-hours sweep',
    backing: `ChartLabWatchlist + TraderWatchlistTabs (${LAB}) → /api/watchlist, /api/traders, /api/extended-hours`,
    defaultSize: { w: 4, h: 9 }, minSize: { w: 3, h: 5 }, Component: lazyTool(chart, 'ChartWatchlistsTool'),
  },
  {
    id: 'chart-readouts', category: 'Market', title: 'Market readouts',
    what: 'SPY last print, BTC from the live stream, seconds to the next candle poll, wall clock; running bots, watchlist size and VIX.',
    units: 'price $, % change, s, count, VIX pts', source: 'extended-hours sweep · realtime stream · market pulse',
    backing: `ChartLabSummary + ChartLabSysStatus (${LAB}) → /api/extended-hours, /api/realtime-status, /api/market-pulse, /api/automations/status`,
    defaultSize: { w: 4, h: 6 }, minSize: { w: 3, h: 4 }, Component: lazyTool(chart, 'ChartReadoutsTool'),
  },
  {
    id: 'chart-lab', category: 'Research', title: 'Chart Lab (all-in-one, classic)',
    what: 'The previous Chart Lab page in one tile: levels chart plus the right rail (readouts, levels, ES translation, watchlists, system).',
    units: 'price $, % change', source: 'candles + convictions + GEX engine', backing: LAB,
    needs: ['symbol'], defaultSize: { w: 12, h: 20 }, minSize: { w: 8, h: 12 }, Component: lazyTool(chart, 'ChartLabTool'),
  },
];

/**
 * CHART default — the Stock Chart large (GEX bubbles, dark-pool levels, flow)
 * with Chart Lab's levels and watchlists down the right; below, the lab's
 * levels chart, ES sizing and market readouts.
 * LAB — the classic Chart Lab full size, one click away in the switcher.
 */
export const CHART_DEFAULTS: DefaultLayout[] = [
  {
    id: 'default', name: 'Chart',
    tools: [
      ['stock-chart', 0, 0, 8, 16],
      ['chart-levels', 8, 0, 4, 7],
      ['chart-watchlists', 8, 7, 4, 9],
      ['chart-lab-chart', 0, 16, 8, 14],
      ['chart-es-risk', 8, 16, 4, 8],
      ['chart-readouts', 8, 24, 4, 6],
    ],
  },
  {
    id: 'lab', name: 'Chart Lab',
    tools: [
      ['chart-lab', 0, 0, 12, 20],
    ],
  },
];
