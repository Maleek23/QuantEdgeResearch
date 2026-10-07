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
const ignition = () => import('@/components/sector-ignition/sector-ignition');
const strips = () => import('../tools/nexus/nexus-strips');
const BOOK = 'convictions engine';

export const NEXUS_TOOLS: ToolDef[] = [
  {
    id: 'nexus-tracked', category: 'Ideas', title: 'Tracked Symbols',
    phoneTitle: 'Tracking',
    what: "The operator's time-boxed tracked names: live quote + change, nearest support / resistance, today's options net premium, open ideas on the board and the expiry; a symbol click opens its top setup.",
    units: 'price $, % change, net premium $', source: 'nexus tracked + live quotes', backing: 'TrackedRow (tools/nexus/tracked-row.tsx) ← GET /api/nexus/tracked, /api/levels/:symbol, /api/bullflow/net-premium-batch',
    ageInside: true, defaultSize: { w: 7, h: 4 }, minSize: { w: 3, h: 2 }, Component: lazyTool(strips, 'NexusTrackedTool'),
  },
  {
    id: 'nexus-rotation', category: 'Market', title: 'Rotation Strip',
    what: 'One line: the sector groups money is moving into and out of (igniting / extended), plus laggards to watch; click a group for its members ranked.',
    units: '% move', source: 'sector ignition', backing: 'RotationStrip (components/sector-ignition) ← GET /api/sector-ignition?horizon=daily|swing',
    defaultSize: { w: 5, h: 4 }, minSize: { w: 3, h: 2 }, Component: lazyTool(strips, 'NexusRotationTool'),
  },
  {
    id: 'nexus-board', category: 'Ideas', title: 'Ranked Setups',
    what: 'Published setups ranked by conviction, filterable by side, recency / top-10 / S–A band and ticker or sector; list, card grid or table.',
    units: 'conviction /100, price $', source: BOOK, backing: 'SetupRow + SignalGrid + SignalTable ← GET /api/convictions (+ /api/spx/expression for the SPX-linked row)',
    defaultSize: { w: 3, h: 16 }, minSize: { w: 3, h: 6 }, Component: lazyTool(nexus, 'NexusBoardTool'),
  },
  {
    id: 'nexus-detail', category: 'Ideas', title: 'Setup Detail',
    what: 'The last selected setup, position or developing candidate: chart with trigger/stop/T1, levels, and overview · technical · manage · risk · contract tabs.',
    units: 'price $, R multiple, conviction /100', source: BOOK, backing: 'SetupDetail / DevelopingDetail (nexus-parts.tsx) ← /api/convictions, /api/patterns/scan, /api/extended-hours/:symbol',
    defaultSize: { w: 6, h: 16 }, minSize: { w: 4, h: 8 }, Component: lazyTool(nexus, 'NexusDetailTool'),
  },
  {
    id: 'nexus-developing', category: 'Ideas', title: 'Developing Candidates',
    what: 'Pattern-scan structures within 20% of their trigger not yet published as setups; shows its own detail when no detail tool is placed.',
    units: 'price $, detector levels', source: 'pattern scanner', backing: 'DevelopingRow + DevelopingDetail (nexus-parts.tsx) ← GET /api/patterns/scan, /api/extended-hours/:symbol',
    defaultSize: { w: 5, h: 12 }, minSize: { w: 3, h: 6 }, Component: lazyTool(nexus, 'NexusDevelopingTool'),
  },
  {
    id: 'nexus-positions', category: 'Ideas', title: 'Quantinum Bot Positions',
    what: 'What Quantinum Bot actually holds on paper, ranked by unrealized P&L; click one to open it in the detail tool.',
    units: 'unrealized P&L %', source: BOOK, backing: 'SetupRow (nexus-parts.tsx) ← GET /api/convictions (isBotHeld rows)',
    defaultSize: { w: 3, h: 7 }, minSize: { w: 3, h: 4 }, Component: lazyTool(nexus, 'NexusPositionsTool'),
  },
  {
    id: 'nexus-context', category: 'Market', title: 'Market Context · macro risk',
    what: 'Regime and score, the macro risk gauge (10Y level and direction, TLT, VIX), preferred side and why it matters now.',
    units: 'score /100, yield %, % change, VIX pts', source: 'regime + market pulse + extended hours', backing: 'MarketSummary + ContextBody (nexus-parts.tsx) ← /api/convictions marketContext, /api/market-pulse, /api/extended-hours',
    defaultSize: { w: 3, h: 9 }, minSize: { w: 3, h: 5 }, Component: lazyTool(nexus, 'NexusContextTool'),
  },
  {
    id: 'nexus-trader-calls', category: 'Ideas', title: 'Trader Calls',
    what: "Open calls (≤ 5 trading days old) from traders whose imported Discord journals rank above the threshold — trader, age, message link, stated entry as posted, underlying repriced live. Evidence only: not scored into conviction, not used by Quantinum Bot.",
    units: 'stated premium/price (as posted), underlying $ (live), ranking score /100', source: 'imported Discord journals', backing: 'TraderCallLine (tools/nexus/trader-calls.tsx) ← GET /api/trader-calls (server/trader-analysis.ts)',
    defaultSize: { w: 3, h: 6 }, minSize: { w: 3, h: 4 }, Component: lazyTool(nexus, 'NexusTraderCallsTool'),
  },
  {
    id: 'nexus-horizon', category: 'Ideas', title: 'Book by Horizon',
    what: 'Every published idea cut by horizon — 0DTE · weekly (1–7D) · swing (8–30D) · monthly (31–60D) · position · LEAPS (>180D) — as a sortable table; click a row to open it.',
    units: 'DTE days, conviction /100, price $', source: BOOK, backing: 'HorizonBook (components/ideas) ← GET /api/convictions (horizon from shared/idea-horizon.ts)',
    defaultSize: { w: 12, h: 10 }, minSize: { w: 4, h: 6 }, Component: lazyTool(nexus, 'NexusHorizonTool'),
  },
  {
    id: 'nexus-0dte', category: 'Ideas', title: '0DTE Desk',
    what: 'SPX · MSTR · META · BE · TSLA (ZERO_DTE_WATCH): 0DTE ideas first (WATCH → TRIGGERED → IN PLAY → DONE, exact contract, live premium, trigger / stop / targets / exit-by), then the session clock and what the engine looks for, same-day expected move, single-expiry GEX walls / zero-γ / max-γ, VWAP + opening range, flow tide on the expiry, engine state in plain words; 2–4 day swings (T1 ≤ 1σ); this engine\'s record with n (LOW N < 20).',
    units: 'price $, % of spot, R multiple, premium $', source: '0DTE desk', backing: 'ZeroDteDesk (components/zerodte/zero-dte-desk.tsx) ← GET /api/zero-dte/desk (server/zero-dte-desk.ts)',
    defaultSize: { w: 12, h: 16 }, minSize: { w: 4, h: 8 }, Component: lazyTool(zeroDte, 'ZeroDteTool'),
  },
  {
    id: 'nexus-sector-ignition', category: 'Market', title: 'Sector Ignition',
    what: 'Which peer groups (SMH, IGV, CIBR, XLF … from shared/sector-peers) are quiet → stirring → igniting → extended on four horizons — 0DTE/intraday (VWAP breadth, ETF vs SPY, ORB breadth, 30-min call/put flow cluster, pre-market gap), daily (gap → ORB → held into close), swing (RS-line turn, breadth thrust, flow persistence) and weeks (RRG quadrant path). Leaders and laggards (catch-up candidates) link to the ticker page. Measuring — unvalidated thresholds.',
    units: '% move, % vs SPY, breadth %, flow members', source: 'sector ignition', backing: 'SectorIgnitionPanel (components/sector-ignition) ← GET /api/sector-ignition?horizon= (server/sector-ignition.ts)',
    defaultSize: { w: 4, h: 10 }, minSize: { w: 3, h: 6 }, Component: lazyTool(ignition, 'SectorIgnitionTool'),
  },
  {
    id: 'nexus-classic', category: 'Ideas', title: 'NEXUS (all-in-one, classic)',
    what: 'The previous NEXUS page in one tile: setups / developing / positions queue, detail stage, grid & table views and the context drawer.',
    units: 'conviction /100, price $', source: BOOK, backing: 'NexusPrototype (pages/nexus-prototype.tsx)',
    defaultSize: { w: 12, h: 20 }, minSize: { w: 8, h: 12 }, Component: lazyTool(nexus, 'NexusClassicTool'),
  },
];

/**
 * NEXUS default (operator 2026-10-07: "way too many irrelevant tools open —
 * default should have ranked setups, setup details and market context side by
 * side; 0DTE at the bottom, then developing candidates; trader calls last").
 * Everything else (tracked symbols, rotation strip, sector ignition, bot
 * positions, book by horizon, classic board) stays one click away in Tools.
 *
 *   ┌ ranked setups 4×16 ┬ setup detail 5×16 ──────┬ market context 3×16 ┐
 *   ├ 0DTE desk 12×16 ──────────────────────────────────────────────────┤
 *   ├ developing candidates 12×8 ─────────────────────────────────────────┤
 *   └ trader calls 12×6 ──────────────────────────────────────────────────┘
 */
export const NEXUS_DEFAULTS: DefaultLayout[] = [{
  id: 'default', name: 'NEXUS',
  tools: [
    ['nexus-board', 0, 0, 4, 16],
    ['nexus-detail', 4, 0, 5, 16],
    ['nexus-context', 9, 0, 3, 16],
    ['nexus-0dte', 0, 16, 12, 16],
    ['nexus-developing', 0, 32, 12, 8],
    ['nexus-trader-calls', 0, 40, 12, 6],
  ],
}];
