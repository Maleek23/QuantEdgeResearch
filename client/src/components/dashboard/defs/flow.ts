/**
 * FLOW tools (Options, Market, Dark Pool) — the original flowdash registry.
 * Ids are persisted in saved layouts (`flowdash:<id>` rows) — never rename.
 * See docs/TOOLS_MIGRATION.md for what each one replaces.
 */
import { lazyTool, type DefaultLayout, type ToolDef } from '../tool-def';

const flow = () => import('../tools/flow/flow-tools');

export const FLOW_TOOLS: ToolDef[] = [
  // ── Options ──
  {
    id: 'options-flow', category: 'Options', title: 'Options Flow',
    what: 'Every print in the window — Bullflow alerts and our chain-scan observations, source-tagged, sortable, filterable.',
    units: 'premium $, strike $, size contracts, SigScore 0–1',
    source: 'Bullflow alerts + chain scan', backing: 'GET /api/flow/tape (Bullflow SSE ring + options_flow_history, 15s cache)',
    defaultSize: { w: 8, h: 16 }, minSize: { w: 4, h: 8 }, Component: lazyTool(() => import('../tools/flow/options-flow'), 'OptionsFlowTool'),
  },
  {
    id: 'top-tickers', category: 'Options', title: 'Top Tickers',
    what: 'Market-wide leaders by provider-measured net premium (ask-side minus bid-side), ETFs excluded.',
    units: 'net premium $', source: 'Bullflow optionsTopTickers', backing: 'GET /api/bullflow/leaders (6-min service cache)',
    defaultSize: { w: 4, h: 8 }, minSize: { w: 3, h: 5 }, Component: lazyTool(flow, 'TopTickersTool'),
  },
  {
    id: 'historical-flow', category: 'Options', title: 'Historical Flow',
    what: 'The previous FLOW board — 1D/1W/1M/all windows, desk score, cards view, repeats and GEX convergence rail.',
    units: 'premium $, score 0–100', source: 'options_flow_history + Bullflow', backing: 'FlowBoard (components/flow/flow-board.tsx) → /api/options-flow',
    ageInside: true, defaultSize: { w: 12, h: 18 }, minSize: { w: 6, h: 10 }, Component: lazyTool(flow, 'HistoricalFlowTool'),
  },
  {
    id: 'net-premium', category: 'Options', title: 'Net Premium',
    what: 'Intraday cumulative call vs put NET premium for the focused ticker (provider aggressor inference).',
    units: 'cumulative net premium $', source: 'Bullflow netPremiumSeries', backing: 'GET /api/bullflow/net-premium-series/:symbol (3-min cache, 2 cold symbols/min)',
    needs: ['symbol'], defaultSize: { w: 4, h: 8 }, minSize: { w: 3, h: 5 }, Component: lazyTool(flow, 'NetPremiumTool'),
  },
  {
    id: 'net-flow-strike', category: 'Options', title: 'Net Flow By Strike',
    what: 'Call vs put premium summed per strike for the focused ticker, from prints in the loaded tape only.',
    units: 'premium $ per strike', source: 'flow tape (Bullflow + chain scan)', backing: 'GET /api/flow/tape (shared with Options Flow)',
    needs: ['symbol'], defaultSize: { w: 4, h: 8 }, minSize: { w: 3, h: 5 }, Component: lazyTool(flow, 'NetFlowByStrikeTool'),
  },
  {
    id: 'flow-alerts', category: 'Options', title: 'Flow Alerts',
    what: 'Bullflow algo + custom alert prints as they land today (Sizable Sweep, Urgent Repeater, Grenade…).',
    units: 'premium $', source: 'Bullflow SSE alerts', backing: 'GET /api/flow/tape (Bullflow rows only)',
    defaultSize: { w: 4, h: 8 }, minSize: { w: 3, h: 5 }, Component: lazyTool(flow, 'FlowAlertsTool'),
  },
  {
    id: 'repeat-buyers', category: 'Options', title: 'Repeat Buyers & Exits',
    what: 'Contracts whose open interest keeps building (or unwinding) across sessions.',
    units: 'contracts, OI change', source: 'OI history', backing: 'RepeatBuyers (components/flow/repeat-buyers.tsx) → /api/flow/repeats, /api/flow/exits',
    ageInside: true, defaultSize: { w: 4, h: 10 }, minSize: { w: 3, h: 6 }, Component: lazyTool(flow, 'RepeatBuyersTool'),
  },
  {
    id: 'flow-gex-convergence', category: 'Options', title: 'Flow × GEX Convergence',
    what: 'Where flow and dealer positioning point the same way.',
    units: 'score, premium $', source: 'flow + GEX engines', backing: 'ConvergenceCard (components/flow/convergence-card.tsx) → /api/flow-gex-convergence/top',
    ageInside: true, defaultSize: { w: 4, h: 10 }, minSize: { w: 3, h: 6 }, Component: lazyTool(flow, 'ConvergenceTool'),
  },
  {
    id: 'index-pulse', category: 'Options', title: 'Index 0DTE Pulse',
    what: 'SPX bias, VWAP bands, gamma magnet and the SPY net-flow lean for 0DTE context.',
    units: 'index points, score /100', source: 'SPX intelligence + Bullflow', backing: 'IndexZeroDtePulsePanel (flow-board.tsx) → /api/spx/intelligence, /api/index-scalps, /api/bullflow/status',
    defaultSize: { w: 12, h: 5 }, minSize: { w: 6, h: 4 }, Component: lazyTool(flow, 'IndexPulseTool'),
  },
  // ── Market ──
  {
    id: 'stock-chart', category: 'Market', title: 'Stock Chart',
    what: 'Price with GEX-through-time bubbles, multi-day dark-pool levels and flow prints for the focused ticker.',
    units: 'price $, GEX $/1%, notional $', source: 'candles + /api/chart/overlays', backing: 'FlowChartBoard (components/charting/flow-chart-nexus.tsx)',
    ageInside: true, needs: ['symbol'], defaultSize: { w: 4, h: 16 }, minSize: { w: 4, h: 10 }, Component: lazyTool(flow, 'StockChartTool'),
  },
  {
    id: 'watchlist', category: 'Market', title: 'Watchlist',
    what: 'Your watchlist with the latest extended-hours move; unpriced names show a dash.',
    units: '% change', source: 'watchlist + extended-hours scan', backing: 'WatchlistRail (components/oracle/oracle-rails.tsx) → /api/watchlist',
    ageInside: true, defaultSize: { w: 3, h: 8 }, minSize: { w: 3, h: 5 }, Component: lazyTool(flow, 'WatchlistTool'),
  },
  {
    id: 'market-tide', category: 'Market', title: 'Market Flow Tide',
    what: 'SPY cumulative call vs put net premium today — a market proxy, not the whole tape.',
    units: 'cumulative net premium $', source: 'Bullflow netPremiumSeries (SPY)', backing: 'GET /api/bullflow/net-premium-series/SPY',
    defaultSize: { w: 4, h: 8 }, minSize: { w: 3, h: 5 }, Component: lazyTool(flow, 'MarketTideTool'),
  },
  // ── Dark Pool ──
  {
    id: 'dark-pool-flow', category: 'Dark Pool', title: 'Dark Pool Flow',
    what: 'Largest dark-pool prints today (≥ $1M notional) for the focused ticker. Levels, not direction.',
    units: 'price $, notional $, % of day volume', source: 'Bullflow darkPoolTrades', backing: 'GET /api/bullflow/context/:ticker (6-min service cache)',
    needs: ['symbol'], defaultSize: { w: 4, h: 8 }, minSize: { w: 3, h: 5 }, Component: lazyTool(flow, 'DarkPoolTool'),
  },
];

/** FLOW default — unchanged from the flowdash default the operator signed off. */
export const FLOW_DEFAULTS: DefaultLayout[] = [{
  id: 'default', name: 'Flow',
  tools: [
    ['options-flow', 0, 0, 8, 16],
    ['stock-chart', 8, 0, 4, 16],
    ['top-tickers', 0, 16, 4, 8],
    ['market-tide', 4, 16, 4, 8],
    ['net-flow-strike', 8, 16, 4, 8],
  ],
}];
