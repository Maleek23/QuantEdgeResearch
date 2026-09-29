/**
 * FLOW tools — the FLOW page is the ONE owner of everything options-flow
 * (docs/IA_SYSTEM_DESIGN.md §2, docs/TOOLS_MIGRATION.md "FLOW domain").
 * Every function below has exactly one tool; other pages may place any of
 * them, but their DEFAULT layouts carry at most the compact `flow-context`
 * tool, which links here for the full view.
 *
 * Ids are persisted in saved layouts (`flowdash:<id>` rows) — never rename.
 * `net-flow-strike`, `repeat-buyers`, `flow-gex-convergence`, `top-tickers`
 * and `dark-pool-flow` keep their ids; their components were upgraded in
 * place (tools/flow/flow-depth.tsx) so saved dashboards get the new tool.
 * Stock Chart and Watchlist are Market tools (defs/market.ts), not flow.
 */
import { lazyTool, type DefaultLayout, type ToolDef } from '../tool-def';

const flow = () => import('../tools/flow/flow-tools');
const depth = () => import('../tools/flow/flow-depth');
const TAPE = 'GET /api/flow/tape (Bullflow SSE ring + options_flow_history, 15s server cache; no provider call)';
const TICKER_TAPE = 'GET /api/flow/tape?symbol= (one underlying, 15s cache) — window / source / DTE shared by the FLOW ticker tools';

export const FLOW_TOOLS: ToolDef[] = [
  // ── Options: market-wide tape ──
  {
    id: 'options-flow', category: 'Options', title: 'Options Flow',
    what: 'Every print in the window — Bullflow alerts and our chain-scan observations, source-tagged, sortable, filterable.',
    units: 'premium $, strike $, size contracts, SigScore 0–1',
    source: 'Bullflow alerts + chain scan', backing: TAPE,
    defaultSize: { w: 8, h: 16 }, minSize: { w: 4, h: 8 }, Component: lazyTool(() => import('../tools/flow/options-flow'), 'OptionsFlowTool'),
  },
  {
    id: 'top-tickers', category: 'Options', title: 'Top tickers',
    what: 'Market-wide leaders: Bullflow net premium (ask − bid, provider-measured) or total premium per ticker in our own tape.',
    units: 'net premium $ · premium $', source: 'Bullflow optionsTopTickers / flow tape',
    backing: 'GET /api/bullflow/leaders (6-min service cache) · /api/flow/tape',
    defaultSize: { w: 4, h: 8 }, minSize: { w: 3, h: 5 }, Component: lazyTool(depth, 'TopTickersTool'),
  },
  {
    id: 'flow-sweeps-blocks', category: 'Options', title: 'Sweeps & blocks',
    what: 'Today\'s sweeps and block / grenade prints, market-wide or the focused ticker, with a premium floor.',
    units: 'premium $, contracts', source: 'Bullflow alerts + chain scan (pattern inferred)', backing: TAPE,
    defaultSize: { w: 4, h: 8 }, minSize: { w: 3, h: 5 }, Component: lazyTool(depth, 'SweepsBlocksTool'),
  },
  {
    id: 'flow-unusual', category: 'Options', title: 'Unusual activity · vol/OI',
    what: 'Contracts that traded at least 2× / 5× / 10× their open interest — chain-scan rows only (the only feed with OI).',
    units: 'volume ÷ OI, contracts, premium $', source: 'chain scan (options_flow_history)', backing: TAPE,
    defaultSize: { w: 4, h: 8 }, minSize: { w: 3, h: 5 }, Component: lazyTool(depth, 'UnusualActivityTool'),
  },
  {
    id: 'repeat-buyers', category: 'Options', title: 'Repeat & position builders',
    what: 'Open interest building or unwinding across sessions, or the same contract printed repeatedly in the tape.',
    units: 'contracts, OI change, prints', source: 'OI history + flow tape',
    backing: 'GET /api/flow/repeats, /api/flow/exits (same key as RepeatBuyers) · /api/flow/tape',
    defaultSize: { w: 6, h: 9 }, minSize: { w: 3, h: 6 }, Component: lazyTool(depth, 'PositionBuildersTool'),
  },
  {
    id: 'flow-alerts', category: 'Options', title: 'Flow Alerts',
    what: 'Bullflow algo + custom alert prints as they land today (Sizable Sweep, Urgent Repeater, Grenade…).',
    units: 'premium $', source: 'Bullflow SSE alerts', backing: `${TAPE} — Bullflow rows only`,
    defaultSize: { w: 4, h: 8 }, minSize: { w: 3, h: 5 }, Component: lazyTool(flow, 'FlowAlertsTool'),
  },
  {
    id: 'market-tide', category: 'Options', title: 'Market Flow Tide',
    what: 'SPY cumulative call vs put net premium today — a market proxy, not the whole tape.',
    units: 'cumulative net premium $', source: 'Bullflow netPremiumSeries (SPY)', backing: 'GET /api/bullflow/net-premium-series/SPY (3-min cache, 2 cold symbols/min)',
    defaultSize: { w: 4, h: 8 }, minSize: { w: 3, h: 5 }, Component: lazyTool(flow, 'MarketTideTool'),
  },
  {
    id: 'flow-setups', category: 'Options', title: 'Flow-driven setups',
    what: 'Published setups whose evidence is flow: flow-originated (flow scanner / aggressor tape) or flow-confirmed (a scoring layer cites flow).',
    units: 'conviction /100', source: 'convictions engine', backing: 'GET /api/convictions (shared NEXUS key)',
    defaultSize: { w: 4, h: 8 }, minSize: { w: 3, h: 5 }, Component: lazyTool(depth, 'FlowSetupsTool'),
  },
  {
    id: 'index-pulse', category: 'Options', title: 'Index 0DTE Pulse',
    what: 'SPX bias, VWAP bands, gamma magnet and the SPY net-flow lean for 0DTE context.',
    units: 'index points, score /100', source: 'SPX intelligence + Bullflow', backing: 'IndexZeroDtePulsePanel (flow-board.tsx) → /api/spx/intelligence, /api/index-scalps, /api/bullflow/status',
    defaultSize: { w: 12, h: 5 }, minSize: { w: 6, h: 4 }, Component: lazyTool(flow, 'IndexPulseTool'),
  },
  {
    id: 'historical-flow', category: 'Options', title: 'Historical Flow (classic)',
    what: 'The previous FLOW board — 1D/1W/1M/all windows, desk score, cards view, repeats and scanner convergence rail.',
    units: 'premium $, score 0–100', source: 'options_flow_history + Bullflow', backing: 'FlowBoard (components/flow/flow-board.tsx) → /api/options-flow',
    ageInside: true, defaultSize: { w: 12, h: 18 }, minSize: { w: 6, h: 10 }, Component: lazyTool(flow, 'HistoricalFlowTool'),
  },
  // ── Options: focused ticker ──
  {
    id: 'net-flow-strike', category: 'Options', title: 'Flow by strike · call vs put ladder',
    what: 'Call vs put premium at every strike the focused ticker traded, with the spot line — the flow counterpart of the GEX ladder. Click a strike for its expiries.',
    units: 'premium $ per strike', source: 'flow tape (Auto: chain scan, else Bullflow)', backing: `${TICKER_TAPE} · spot /api/quotes/batch`,
    needs: ['symbol'], defaultSize: { w: 3, h: 16 }, minSize: { w: 3, h: 6 }, Component: lazyTool(depth, 'FlowStrikeLadderTool'),
  },
  {
    id: 'flow-strike-expiry', category: 'Options', title: 'Flow by expiry · strike × expiry heatmap',
    what: 'Premium in every strike × expiry cell for the focused ticker (calls, puts or both), spot row marked — the flow counterpart of the GEX matrix.',
    units: 'premium $ per cell', source: 'flow tape (Auto: chain scan, else Bullflow)', backing: `${TICKER_TAPE} · spot /api/quotes/batch`,
    needs: ['symbol'], defaultSize: { w: 6, h: 14 }, minSize: { w: 4, h: 7 }, Component: lazyTool(depth, 'FlowExpiryHeatmapTool'),
  },
  {
    id: 'flow-timeline', category: 'Options', title: 'Premium timeline',
    what: 'Call vs put premium through the session (5-min bins; hourly for multi-day) for the focused ticker or the whole tape, as bars or cumulative.',
    units: 'premium $ per bin / cumulative $', source: 'flow tape', backing: `${TICKER_TAPE} · /api/flow/tape (market scope)`,
    needs: ['symbol'], defaultSize: { w: 4, h: 9 }, minSize: { w: 3, h: 6 }, Component: lazyTool(depth, 'FlowTimelineTool'),
  },
  {
    id: 'net-premium', category: 'Options', title: 'Net premium · provider',
    what: 'Intraday cumulative call vs put NET premium for the focused ticker (provider aggressor inference).',
    units: 'cumulative net premium $', source: 'Bullflow netPremiumSeries', backing: 'GET /api/bullflow/net-premium-series/:symbol (3-min cache, 2 cold symbols/min)',
    needs: ['symbol'], defaultSize: { w: 4, h: 8 }, minSize: { w: 3, h: 5 }, Component: lazyTool(flow, 'NetPremiumTool'),
  },
  {
    id: 'flow-gex-convergence', category: 'Options', title: 'Flow × GEX convergence',
    what: 'Where the focused ticker\'s traded premium sits against the GEX engine\'s walls, magnet and flip, and the dealer gamma at its heaviest flow strikes.',
    units: 'premium $, strike $, GEX $/1%', source: 'flow tape + GEX engine (read, not recomputed)',
    backing: `${TICKER_TAPE} · useGexTerminal (gex-model.ts, the GEX page's shared query)`,
    needs: ['symbol'], defaultSize: { w: 4, h: 10 }, minSize: { w: 3, h: 6 }, Component: lazyTool(depth, 'FlowGexConvergenceTool'),
  },
  {
    id: 'flow-context', category: 'Options', title: 'Flow context',
    what: 'Compact read of the focused ticker\'s options flow today (calls vs puts, sweeps, top strike, last alert) with a link to FLOW for the full view.',
    units: 'premium $, prints', source: 'flow tape (Auto: chain scan, else Bullflow)', backing: 'GET /api/flow/tape?symbol=&days=1',
    needs: ['symbol'], defaultSize: { w: 4, h: 6 }, minSize: { w: 3, h: 4 }, Component: lazyTool(depth, 'FlowContextTool'),
  },
  // ── Dark Pool ──
  {
    id: 'dark-pool-flow', category: 'Dark Pool', title: 'Dark pool · levels & prints',
    what: 'The focused ticker\'s dark-pool levels (prints summed by price over ~28 days, near spot) or today\'s largest prints ≥ $1M. Levels, not direction.',
    units: 'price $, notional $, prints', source: 'Bullflow darkPoolTrades',
    backing: 'GET /api/chart/overlays/:symbol darkPool (30-min + disk cache) · /api/bullflow/context/:ticker (6-min cache)',
    needs: ['symbol'], defaultSize: { w: 4, h: 9 }, minSize: { w: 3, h: 5 }, Component: lazyTool(depth, 'DarkPoolTool'),
  },
];

/**
 * FLOW shipped dashboards — each one screen (12 × 18).
 *
 * Market flow — the whole tape first, then its three cuts:
 *   ┌──────────── options flow 8×11 ────────────┬ top tickers 4×11 ┐
 *   ├── market tide 4×7 ──┬── sweeps & blocks 4×7 ──┬ unusual 4×7 ──┤
 *
 * Ticker flow — one symbol (list tools follow the focus ticker):
 *   ┌──── stock chart 6×11 ────┬ strike ladder 3×11 ┬ flow×GEX 3×11 ┐
 *   ├── strike × expiry 6×7 ───┬── timeline 3×7 ────┬ dark pool 3×7 ┤
 *
 * Alerts, setups, builders, net premium and Index pulse: Add tool.
 */
export const FLOW_DEFAULTS: DefaultLayout[] = [
  {
    id: 'default', name: 'Market flow',
    tools: [
      ['options-flow', 0, 0, 8, 11],
      ['top-tickers', 8, 0, 4, 11],
      ['market-tide', 0, 11, 4, 7],
      ['flow-sweeps-blocks', 4, 11, 4, 7],
      ['flow-unusual', 8, 11, 4, 7],
    ],
  },
  {
    id: 'ticker', name: 'Ticker flow',
    tools: [
      ['stock-chart', 0, 0, 6, 11],
      ['net-flow-strike', 6, 0, 3, 11],
      ['flow-gex-convergence', 9, 0, 3, 11],
      ['flow-strike-expiry', 0, 11, 6, 7],
      ['flow-timeline', 6, 11, 3, 7],
      ['dark-pool-flow', 9, 11, 3, 7],
    ],
  },
];
