/**
 * POSITIONS tools — the Position Heat Map page (pages/positions-heatmap.tsx)
 * split into tools (tools/positions/positions-tools.tsx). Every tool shares the
 * page's one query ('positions-live' → /api/positions/live, 60s), so the page
 * costs one request per refresh. `positions-classic` is the whole page.
 */
import { lazyTool, type DefaultLayout, type ToolDef } from '../tool-def';

const pos = () => import('../tools/positions/positions-tools');
const SRC = 'open positions (live repriced)';
const FEED = 'GET /api/positions/live (shared query, 60s)';

export const POSITIONS_TOOLS: ToolDef[] = [
  {
    id: 'positions-pnl', category: 'Book', title: 'Net Open P&L · KPIs',
    what: 'Net open P&L across every tracked position, plus count, share in profit, and hot / cold counts.',
    units: '% and $ open P&L, counts', source: SRC, backing: `PositionsHeatmapPage summary ← ${FEED}`,
    defaultSize: { w: 12, h: 3 }, minSize: { w: 4, h: 3 }, Component: lazyTool(pos, 'PositionsPnlTool'),
  },
  {
    id: 'positions-heat', category: 'Book', title: 'Position Heat Map',
    what: 'One tile per open position, coloured by heat rank (momentum bucket) with P&L %; sort shared with the detail table; click a tile for the ticker.',
    units: '% P&L, days held', source: SRC, backing: `HeatTile / HeatLegend (pages/positions-heatmap.tsx) ← ${FEED}`,
    defaultSize: { w: 8, h: 13 }, minSize: { w: 3, h: 5 }, Component: lazyTool(pos, 'PositionsHeatTool'),
  },
  {
    id: 'positions-best-worst', category: 'Book', title: 'Best vs Worst',
    what: 'The best and the worst open position right now, with contract, days in and P&L.',
    units: '% and $ P&L', source: SRC, backing: `BestWorstCard (pages/positions-heatmap.tsx) ← ${FEED}`,
    defaultSize: { w: 4, h: 6 }, minSize: { w: 3, h: 4 }, Component: lazyTool(pos, 'PositionsBestWorstTool'),
  },
  {
    id: 'positions-mix', category: 'Book', title: 'Book Mix · source / asset',
    what: 'How many open positions came from each source (engine) and asset type, with their share of the book.',
    units: 'count, % of positions', source: SRC, backing: `summary.bySource / byAssetType ← ${FEED}`,
    defaultSize: { w: 4, h: 7 }, minSize: { w: 3, h: 4 }, Component: lazyTool(pos, 'PositionsMixTool'),
  },
  {
    id: 'positions-table', category: 'Book', title: 'Positions Detail Table',
    what: 'Every open position: type, direction, entry, spot, target, stop, P&L, days held, DTE, heat and source. Row click focuses the ticker; symbol opens it.',
    units: '$ price levels, % and $ P&L, days', source: SRC, backing: `DetailTable / PositionRow (pages/positions-heatmap.tsx) ← ${FEED}`,
    defaultSize: { w: 12, h: 12 }, minSize: { w: 6, h: 5 }, Component: lazyTool(pos, 'PositionsTableTool'),
  },
  {
    id: 'positions-classic', category: 'Book', title: 'Position Heat Map (all-in-one, classic)',
    what: 'The previous POSITIONS page in one tile: P&L hero, KPI strip, best vs worst, heat map and detail table.',
    units: '% and $ P&L', source: SRC, backing: 'PositionsHeatmapPage (pages/positions-heatmap.tsx)',
    ageInside: true, defaultSize: { w: 12, h: 20 }, minSize: { w: 6, h: 10 }, Component: lazyTool(pos, 'PositionsClassicTool'),
  },
];

/**
 * POSITIONS is a SIMPLE page (pages.ts `simple`: the heat-map page full
 * bleed). No Customize switch since 2026-09-29; this grid is documentation only (12 × 18):
 *   ┌──────────────────── net open P&L 12×3 ────────────────────┐
 *   ├────────── heat map 8×9 ──────────┬ best vs worst 4×5 ──────┤
 *   │                                  ├ book mix 4×4 ───────────┤
 *   ├──────────────────── detail table 12×6 ────────────────────┤
 */
export const POSITIONS_DEFAULTS: DefaultLayout[] = [{
  id: 'default', name: 'POSITIONS',
  tools: [
    ['positions-pnl', 0, 0, 12, 3],
    ['positions-heat', 0, 3, 8, 9],
    ['positions-best-worst', 8, 3, 4, 5],
    ['positions-mix', 8, 8, 4, 4],
    ['positions-table', 0, 12, 12, 6],
  ],
}];
