/**
 * TOOL REGISTRY — every tool the FLOW dashboard can place.
 *
 * A tool WRAPS an existing component or endpoint wherever one exists; new
 * code only fills gaps (Options Flow table, net-premium series, per-strike
 * sums). Tools Bullflow offers that we have no data for (Option Chart,
 * Dark Pool Alerts, Trade Terminal) are deliberately NOT registered — an
 * "Add tool" entry that opens an empty shell would be a claim we can't back.
 * See docs/TOOLS_MIGRATION.md for the full map.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export type ToolGroup = 'OPTIONS' | 'MARKET' | 'GEX' | 'DARK POOL';
export const GROUP_ORDER: ToolGroup[] = ['OPTIONS', 'MARKET', 'GEX', 'DARK POOL'];

export type ToolType =
  | 'options-flow' | 'top-tickers' | 'historical-flow' | 'net-premium' | 'net-flow-strike'
  | 'flow-alerts' | 'repeat-buyers' | 'flow-gex-convergence' | 'index-pulse'
  | 'watchlist' | 'market-tide' | 'stock-chart'
  | 'gex-hub' | 'gex-levels' | 'gex-setups'
  | 'dark-pool-flow';

export interface ToolDef {
  type: ToolType;
  group: ToolGroup;
  title: string;
  /** One line: what this shows. */
  blurb: string;
  units: string;
  /** Data source as the operator should read it. */
  source: string;
  /** The wrapped component / endpoint, for the migration doc and tooltips. */
  backing: string;
  /** Wrapped component already stamps an age on every row. */
  ageInside?: boolean;
  w: number; h: number; minW: number; minH: number;
  Component: LazyExoticComponent<ComponentType<any>>;
}

const T = (m: () => Promise<any>, name: string) => lazy(() => m().then((x) => ({ default: x[name] })));
const tools = () => import('./tools');

export const TOOLS: ToolDef[] = [
  // ── OPTIONS ──
  {
    type: 'options-flow', group: 'OPTIONS', title: 'Options Flow',
    blurb: 'Every print in the window — Bullflow alerts and our chain-scan observations, source-tagged, sortable, filterable.',
    units: 'premium $, strike $, size contracts, SigScore 0–1',
    source: 'Bullflow alerts + chain scan', backing: 'GET /api/flow/tape (new; Bullflow SSE ring + options_flow_history, 15s cache)',
    w: 8, h: 16, minW: 4, minH: 8, Component: T(() => import('./options-flow'), 'OptionsFlowTool'),
  },
  {
    type: 'top-tickers', group: 'OPTIONS', title: 'Top Tickers',
    blurb: 'Market-wide leaders by provider-measured net premium (ask-side minus bid-side), ETFs excluded.',
    units: 'net premium $', source: 'Bullflow optionsTopTickers', backing: 'GET /api/bullflow/leaders (6-min service cache)',
    w: 4, h: 8, minW: 3, minH: 5, Component: T(tools, 'TopTickersTool'),
  },
  {
    type: 'historical-flow', group: 'OPTIONS', title: 'Historical Flow',
    blurb: 'The previous FLOW board — 1D/1W/1M/all windows, desk score, cards view, repeats and GEX convergence rail.',
    units: 'premium $, score 0–100', source: 'options_flow_history + Bullflow', backing: 'FlowBoard (components/flow/flow-board.tsx) → /api/options-flow',
    ageInside: true, w: 12, h: 18, minW: 6, minH: 10, Component: T(tools, 'HistoricalFlowTool'),
  },
  {
    type: 'net-premium', group: 'OPTIONS', title: 'Net Premium',
    blurb: 'Intraday cumulative call vs put NET premium for the focused ticker (provider aggressor inference).',
    units: 'cumulative net premium $', source: 'Bullflow netPremiumSeries', backing: 'GET /api/bullflow/net-premium-series/:symbol (new; 3-min cache, 2 cold symbols/min)',
    w: 4, h: 8, minW: 3, minH: 5, Component: T(tools, 'NetPremiumTool'),
  },
  {
    type: 'net-flow-strike', group: 'OPTIONS', title: 'Net Flow By Strike',
    blurb: 'Call vs put premium summed per strike for the focused ticker, from prints in the loaded tape only.',
    units: 'premium $ per strike', source: 'flow tape (Bullflow + chain scan)', backing: 'GET /api/flow/tape (shared with Options Flow)',
    w: 4, h: 8, minW: 3, minH: 5, Component: T(tools, 'NetFlowByStrikeTool'),
  },
  {
    type: 'flow-alerts', group: 'OPTIONS', title: 'Flow Alerts',
    blurb: 'Bullflow algo + custom alert prints as they land today (Sizable Sweep, Urgent Repeater, Grenade…).',
    units: 'premium $', source: 'Bullflow SSE alerts', backing: 'GET /api/flow/tape (Bullflow rows only)',
    w: 4, h: 8, minW: 3, minH: 5, Component: T(tools, 'FlowAlertsTool'),
  },
  {
    type: 'repeat-buyers', group: 'OPTIONS', title: 'Repeat Buyers & Exits',
    blurb: 'Contracts whose open interest keeps building (or unwinding) across sessions.',
    units: 'contracts, OI change', source: 'OI history', backing: 'RepeatBuyers (components/flow/repeat-buyers.tsx) → /api/flow/repeats, /api/flow/exits',
    ageInside: true, w: 4, h: 10, minW: 3, minH: 6, Component: T(tools, 'RepeatBuyersTool'),
  },
  {
    type: 'flow-gex-convergence', group: 'OPTIONS', title: 'Flow × GEX Convergence',
    blurb: 'Where flow and dealer positioning point the same way.',
    units: 'score, premium $', source: 'flow + GEX engines', backing: 'ConvergenceCard (components/flow/convergence-card.tsx) → /api/flow-gex-convergence/top',
    ageInside: true, w: 4, h: 10, minW: 3, minH: 6, Component: T(tools, 'ConvergenceTool'),
  },
  {
    type: 'index-pulse', group: 'OPTIONS', title: 'Index 0DTE Pulse',
    blurb: 'SPX bias, VWAP bands, gamma magnet and the SPY net-flow lean for 0DTE context.',
    units: 'index points, score /100', source: 'SPX intelligence + Bullflow', backing: 'IndexZeroDtePulsePanel (flow-board.tsx) → /api/spx/intelligence, /api/index-scalps, /api/bullflow/status',
    w: 12, h: 5, minW: 6, minH: 4, Component: T(tools, 'IndexPulseTool'),
  },
  // ── MARKET ──
  {
    type: 'stock-chart', group: 'MARKET', title: 'Stock Chart',
    blurb: 'Price with GEX-through-time bubbles, multi-day dark-pool levels and flow prints for the focused ticker.',
    units: 'price $, GEX $/1%, notional $', source: 'candles + /api/chart/overlays', backing: 'FlowChartBoard (components/charting/flow-chart-nexus.tsx)',
    ageInside: true, w: 4, h: 16, minW: 4, minH: 10, Component: T(tools, 'StockChartTool'),
  },
  {
    type: 'watchlist', group: 'MARKET', title: 'Watchlist',
    blurb: 'Your watchlist with the latest extended-hours move; unpriced names show a dash.',
    units: '% change', source: 'watchlist + extended-hours scan', backing: 'WatchlistRail (components/oracle/oracle-rails.tsx) → /api/watchlist',
    ageInside: true, w: 3, h: 8, minW: 3, minH: 5, Component: T(tools, 'WatchlistTool'),
  },
  {
    type: 'market-tide', group: 'MARKET', title: 'Market Flow Tide',
    blurb: 'SPY cumulative call vs put net premium today — a market proxy, not the whole tape.',
    units: 'cumulative net premium $', source: 'Bullflow netPremiumSeries (SPY)', backing: 'GET /api/bullflow/net-premium-series/SPY',
    w: 4, h: 8, minW: 3, minH: 5, Component: T(tools, 'MarketTideTool'),
  },
  // ── GEX ──
  {
    type: 'gex-hub', group: 'GEX', title: 'GEX Chart',
    blurb: 'The full GEX hub: strike × expiry map, surface, ranks and drill-downs for one ticker.',
    units: 'GEX $/1% move, VEX $/IV pt', source: 'GEX engine (Alpaca/CBOE chains)', backing: 'GexHubNexus (components/gex/gex-hub-nexus.tsx)',
    ageInside: true, w: 12, h: 20, minW: 8, minH: 12, Component: T(tools, 'GexHubTool'),
  },
  {
    type: 'gex-levels', group: 'GEX', title: 'GEX Levels',
    blurb: 'Regime, zero-gamma, call/put walls and the top strike for the focused ticker.',
    units: 'strike $, GEX $/1% move', source: 'GEX rankings job', backing: 'GET /api/gex-vex/rankings (background job cache)',
    w: 4, h: 8, minW: 3, minH: 6, Component: T(tools, 'GexLevelsTool'),
  },
  {
    type: 'gex-setups', group: 'GEX', title: 'GEX Setups',
    blurb: 'Magnet setups, −VEX, lowest GEX+ and pins across the screener universe.',
    units: 'GEX $/1%, VEX $/IV pt, score', source: 'GEX rankings job', backing: 'GexRankingsPanel (components/gex/gex-rankings-panel.tsx) → /api/gex-vex/rankings',
    ageInside: true, w: 8, h: 12, minW: 6, minH: 8, Component: T(tools, 'GexSetupsTool'),
  },
  // ── DARK POOL ──
  {
    type: 'dark-pool-flow', group: 'DARK POOL', title: 'Dark Pool Flow',
    blurb: 'Largest dark-pool prints today (≥ $1M notional) for the focused ticker. Levels, not direction.',
    units: 'price $, notional $, % of day volume', source: 'Bullflow darkPoolTrades', backing: 'GET /api/bullflow/context/:ticker (6-min service cache)',
    w: 4, h: 8, minW: 3, minH: 5, Component: T(tools, 'DarkPoolTool'),
  },
];

export const TOOL_BY_TYPE = new Map<ToolType, ToolDef>(TOOLS.map((t) => [t.type, t]));
