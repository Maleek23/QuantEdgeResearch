/**
 * NEXUS tools — the NEXUS board (pages/nexus-prototype.tsx) split into
 * dashboard tools (tools/nexus/nexus-tools.tsx, parts in nexus-parts.tsx).
 * All tools share the page's queries (identical keys) and one selection
 * (useDashState 'nexus:selection'); selecting a row also re-points the focus
 * ticker so chart / GEX tools follow.
 */
import { lazyTool, type DefaultLayout, type ToolDef } from '../tool-def';

const nexus = () => import('../tools/nexus/nexus-tools');
const BOOK = 'convictions engine';

export const NEXUS_TOOLS: ToolDef[] = [
  {
    id: 'nexus-board', category: 'Ideas', title: 'Ranked setups',
    what: 'Published setups ranked by conviction, filterable by side, recency / top-10 / S–A band and ticker or sector; list, card grid or table.',
    units: 'conviction /100, price $', source: BOOK, backing: 'SetupRow + SignalGrid + SignalTable ← GET /api/convictions (+ /api/spx/expression for the SPX-linked row)',
    defaultSize: { w: 3, h: 16 }, minSize: { w: 3, h: 6 }, Component: lazyTool(nexus, 'NexusBoardTool'),
  },
  {
    id: 'nexus-detail', category: 'Ideas', title: 'Setup detail',
    what: 'The last selected setup, position or developing candidate: chart with trigger/stop/T1, levels, and overview · technical · manage · risk · contract tabs.',
    units: 'price $, R multiple, conviction /100', source: BOOK, backing: 'SetupDetail / DevelopingDetail (nexus-parts.tsx) ← /api/convictions, /api/patterns/scan, /api/extended-hours/:symbol',
    defaultSize: { w: 6, h: 16 }, minSize: { w: 4, h: 8 }, Component: lazyTool(nexus, 'NexusDetailTool'),
  },
  {
    id: 'nexus-developing', category: 'Ideas', title: 'Developing candidates',
    what: 'Pattern-scan structures within 20% of their trigger not yet published as setups; shows its own detail when no detail tool is placed.',
    units: 'price $, detector levels', source: 'pattern scanner', backing: 'DevelopingRow + DevelopingDetail (nexus-parts.tsx) ← GET /api/patterns/scan, /api/extended-hours/:symbol',
    defaultSize: { w: 5, h: 12 }, minSize: { w: 3, h: 6 }, Component: lazyTool(nexus, 'NexusDevelopingTool'),
  },
  {
    id: 'nexus-positions', category: 'Ideas', title: 'Bot positions',
    what: 'What the bot actually holds, ranked by unrealized P&L; click one to open it in the detail tool.',
    units: 'unrealized P&L %', source: BOOK, backing: 'SetupRow (nexus-parts.tsx) ← GET /api/convictions (isBotHeld rows)',
    defaultSize: { w: 3, h: 7 }, minSize: { w: 3, h: 4 }, Component: lazyTool(nexus, 'NexusPositionsTool'),
  },
  {
    id: 'nexus-context', category: 'Market', title: 'Market context · macro risk',
    what: 'Regime and score, the Macro Risk Oracle (10Y level and direction, TLT, VIX), preferred side and why it matters now.',
    units: 'score /100, yield %, % change, VIX pts', source: 'regime + market pulse + extended hours', backing: 'MarketSummary + ContextBody (nexus-parts.tsx) ← /api/convictions marketContext, /api/market-pulse, /api/extended-hours',
    defaultSize: { w: 3, h: 9 }, minSize: { w: 3, h: 5 }, Component: lazyTool(nexus, 'NexusContextTool'),
  },
  {
    id: 'nexus-classic', category: 'Ideas', title: 'NEXUS (all-in-one, classic)',
    what: 'The previous NEXUS page in one tile: setups / developing / positions queue, detail stage, grid & table views and the context drawer.',
    units: 'conviction /100, price $', source: BOOK, backing: 'NexusPrototype (pages/nexus-prototype.tsx)',
    defaultSize: { w: 12, h: 20 }, minSize: { w: 8, h: 12 }, Component: lazyTool(nexus, 'NexusClassicTool'),
  },
];

/**
 * NEXUS default — ranked board left, selected detail centre, market context
 * and bot positions right (all in the first 16 rows); below, the developing
 * funnel with the stock chart and GEX levels following the selection.
 */
export const NEXUS_DEFAULTS: DefaultLayout[] = [{
  id: 'default', name: 'NEXUS',
  tools: [
    ['nexus-board', 0, 0, 3, 16],
    ['nexus-detail', 3, 0, 6, 16],
    ['nexus-context', 9, 0, 3, 9],
    ['nexus-positions', 9, 9, 3, 7],
    ['nexus-developing', 0, 16, 5, 12],
    ['stock-chart', 5, 16, 4, 12],
    ['gex-levels', 9, 16, 3, 12],
  ],
}];
