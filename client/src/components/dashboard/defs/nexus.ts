/**
 * NEXUS tools — the NEXUS board (pages/nexus-prototype.tsx) split into
 * dashboard tools (tools/nexus/nexus-tools.tsx, parts in nexus-parts.tsx).
 * All tools share the page's queries (identical keys) and one selection
 * (useDashState 'nexus:selection'); selecting a row also re-points the focus
 * ticker so chart / GEX tools follow.
 */
import { lazyTool, type DefaultLayout, type ToolDef } from '../tool-def';

const nexus = () => import('../tools/nexus/nexus-tools');
const zeroDte = () => import('@/components/zerodte/zero-dte-desk');
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
    id: 'nexus-trader-calls', category: 'Ideas', title: 'Trader calls',
    what: "Open calls (≤ 5 trading days old) from traders whose imported Discord journals rank above the threshold — trader, age, message link, stated entry as posted, underlying repriced live. Evidence only: not scored into conviction, not used by the bot.",
    units: 'stated premium/price (as posted), underlying $ (live), ranking score /100', source: 'imported Discord journals', backing: 'TraderCallLine (tools/nexus/trader-calls.tsx) ← GET /api/trader-calls (server/trader-analysis.ts)',
    defaultSize: { w: 3, h: 6 }, minSize: { w: 3, h: 4 }, Component: lazyTool(nexus, 'NexusTraderCallsTool'),
  },
  {
    id: 'nexus-horizon', category: 'Ideas', title: 'Book by horizon',
    what: 'Every published idea cut by horizon — 0DTE · weekly (1–7D) · swing (8–30D) · monthly (31–60D) · position · LEAPS (>180D) — as a sortable table; click a row to open it.',
    units: 'DTE days, conviction /100, price $', source: BOOK, backing: 'HorizonBook (components/ideas) ← GET /api/convictions (horizon from shared/idea-horizon.ts)',
    defaultSize: { w: 12, h: 10 }, minSize: { w: 4, h: 6 }, Component: lazyTool(nexus, 'NexusHorizonTool'),
  },
  {
    id: 'nexus-0dte', category: 'Ideas', title: '0DTE desk',
    what: 'SPX · TSLA · MSTR · KWEB (ZERO_DTE_WATCH): session clock and what the engine looks for, same-day expected move, single-expiry GEX walls / zero-γ / max-γ, VWAP + opening range, flow tide on the expiry, engine state in plain words; 2–4 day swings (T1 ≤ 1σ); this engine\'s record with n (LOW N < 20).',
    units: 'price $, % of spot, R multiple, premium $', source: '0DTE desk', backing: 'ZeroDteDesk (components/zerodte/zero-dte-desk.tsx) ← GET /api/zero-dte/desk (server/zero-dte-desk.ts)',
    defaultSize: { w: 12, h: 16 }, minSize: { w: 4, h: 8 }, Component: lazyTool(zeroDte, 'ZeroDteTool'),
  },
  {
    id: 'nexus-classic', category: 'Ideas', title: 'NEXUS (all-in-one, classic)',
    what: 'The previous NEXUS page in one tile: setups / developing / positions queue, detail stage, grid & table views and the context drawer.',
    units: 'conviction /100, price $', source: BOOK, backing: 'NexusPrototype (pages/nexus-prototype.tsx)',
    defaultSize: { w: 12, h: 20 }, minSize: { w: 8, h: 12 }, Component: lazyTool(nexus, 'NexusClassicTool'),
  },
];

/**
 * NEXUS default — one screen (12 × 18):
 *
 *   ┌ ranked ┬──────── setup detail ─────────────┬ context ──────┐
 *   │ setups │ chart, levels, tabs               │ regime, macro │   three columns, each the
 *   │ 3×12   │ 6×12                              │ 3×12          │   height of the screen and
 *   ├────────┴────── developing 6×6 ───┬──── bot positions 6×6 ──┤   its own framed scroller
 *   └──────────────────────────────────┴─────────────────────────┘   (PageSpec.columns)
 *
 * Master → detail left to right; the market context that frames every idea
 * on the right, with ranked traders' recent calls (evidence, not signals)
 * under it; the funnel (developing) and what the bot holds underneath.
 * Book by horizon, stock chart, GEX levels and flow context: Add tool.
 */
export const NEXUS_DEFAULTS: DefaultLayout[] = [{
  id: 'default', name: 'NEXUS',
  tools: [
    ['nexus-board', 0, 0, 3, 12],
    ['nexus-detail', 3, 0, 6, 12],
    ['nexus-context', 9, 0, 3, 12],
    ['nexus-developing', 0, 12, 4, 6],
    ['nexus-positions', 4, 12, 4, 6],
    ['nexus-trader-calls', 8, 12, 4, 6],
  ],
}];
