/**
 * JOURNAL tools — the journal Dashboard page's widgets
 * (tools/journal/journal-tools.tsx). Inside the journal they read the selected
 * book + filters; placed on any other page they read your own book, unfiltered.
 * Ids are persisted in saved layouts — never rename.
 *
 * Widget set and default order follow LuxAlgo Trade Journal's dashboard
 * (apps/web/src/app/page.tsx, MIT — see client/src/lib/journal/LICENSE-luxalgo.txt).
 */
import { lazyTool, type DefaultLayout, type ToolDef } from '../tool-def';

const j = () => import('../tools/journal/journal-tools');
const SRC = 'journal (selected book, filtered)';
const ROWS = 'journal rows → lib/journal/metrics.ts (client-computed)';

const tile = (id: string, title: string, what: string, units: string, name: string, backing = ROWS, size = { w: 3, h: 4 }): ToolDef => ({
  id, category: 'Journal', title, what, units, source: SRC, backing,
  defaultSize: size, minSize: { w: 2, h: 3 }, Component: lazyTool(j, name as never),
});

export const JOURNAL_TOOLS: ToolDef[] = [
  tile('journal-net-pnl', 'Net P&L', 'Realized P&L net of fees over closed trades in view, with last 7 days vs the 7 before.', '$', 'JournalNetPnlTool'),
  tile('journal-win-rate', 'Trade win %', 'Winning closed trades ÷ all closed trades (breakevens count as not-wins).', '% of closed trades', 'JournalWinRateTool'),
  tile('journal-profit-factor', 'Profit factor', 'Gross profit ÷ gross loss. Above 1 = the wins outweigh the losses.', 'ratio', 'JournalProfitFactorTool'),
  tile('journal-day-win', 'Day win %', 'Green trading days ÷ all trading days in view (New York days).', '% of days', 'JournalDayWinTool'),
  tile('journal-avg-win-loss', 'Avg win / loss', 'Average winning trade ÷ average losing trade; the bar shows the two to scale.', 'ratio, $', 'JournalAvgWinLossTool'),
  tile('journal-max-drawdown', 'Max drawdown', 'Largest peak-to-trough fall of cumulative net P&L; % only when the book has an account balance.', '$, % of balance+peak', 'JournalMaxDrawdownTool',
    `${ROWS} + GET /api/journal/balance`),
  tile('journal-streaks', 'Streaks', 'Current run of consecutive wins (W) or losses (L), with the best and worst runs.', 'trades', 'JournalStreaksTool'),
  tile('journal-expectancy', 'Expectancy / trade', 'Average net P&L per closed trade.', '$ per trade', 'JournalExpectancyTool'),
  tile('journal-duration', 'Avg duration', 'Average holding time, entry to exit, of closed trades.', 'minutes / hours / days', 'JournalDurationTool'),
  tile('journal-best-worst-day', 'Best / worst day', 'Highest and lowest single-day net P&L in view.', '$', 'JournalBestWorstDayTool'),
  {
    id: 'journal-edge', category: 'Journal', title: 'Edge score',
    what: 'The open 0–100 edge score (v2 formula) on six axes. Withheld — never guessed — with under 5 closed trades or no account balance for the drawdown axis.',
    units: 'score 0–100 per axis', source: SRC, backing: `metrics-extra.ts edgeScore ← ${ROWS} + GET /api/journal/balance`,
    defaultSize: { w: 4, h: 10 }, minSize: { w: 3, h: 7 }, Component: lazyTool(j, 'JournalEdgeTool'),
  },
  {
    id: 'journal-equity', category: 'Journal', title: 'Cumulative P&L & relative drawdown',
    what: 'Running net P&L at each close (or net P&L per day), with drawdown from the running peak as a % of balance + peak underneath.',
    units: '$, % of balance+peak', source: SRC, backing: `EquityChart + RelativeDrawdownBars ← ${ROWS} + GET /api/journal/balance`,
    defaultSize: { w: 8, h: 10 }, minSize: { w: 4, h: 7 }, Component: lazyTool(j, 'JournalEquityTool'),
  },
  {
    id: 'journal-calendar', category: 'Journal', title: 'P&L calendar',
    what: 'Month grid of net P&L per trading day with week totals; a day opens the Daily journal.',
    units: '$ per day, trades', source: SRC, backing: `CalendarPnl ← ${ROWS}`,
    defaultSize: { w: 7, h: 10 }, minSize: { w: 4, h: 8 }, Component: lazyTool(j, 'JournalCalendarTool'),
  },
  {
    id: 'journal-activity', category: 'Journal', title: 'Activity',
    what: 'Most recent closed trades, or the open positions; a row opens the trade.',
    units: '$, trades', source: SRC, backing: `TradeMiniList ← ${ROWS}`,
    defaultSize: { w: 5, h: 10 }, minSize: { w: 3, h: 6 }, Component: lazyTool(j, 'JournalActivityTool'),
  },
  {
    id: 'journal-time-heatmap', category: 'Journal', title: 'Trade time performance',
    what: 'Net P&L by entry weekday × entry hour (New York), each cell with its n.',
    units: '$ per cell, closed trades', source: SRC, backing: `metrics-extra.ts timeGrid ← ${ROWS}`,
    defaultSize: { w: 12, h: 7 }, minSize: { w: 4, h: 5 }, Component: lazyTool(j, 'JournalTimeHeatmapTool'),
  },
  {
    id: 'journal-facts', category: 'Journal', title: 'Performance facts',
    what: 'Day win rate, largest win/loss, recovery factor, profit concentration, trades since peak, fees.',
    units: '%, $, ratio', source: SRC, backing: ROWS,
    defaultSize: { w: 6, h: 7 }, minSize: { w: 3, h: 5 }, Component: lazyTool(j, 'JournalFactsTool'),
  },
  {
    id: 'journal-by-setup', category: 'Journal', title: 'By setup',
    what: 'Net P&L, win rate and n for each setup tag in view.',
    units: '$, % of closed', source: SRC, backing: `groupBy(setup) ← ${ROWS}`,
    defaultSize: { w: 6, h: 7 }, minSize: { w: 3, h: 5 }, Component: lazyTool(j, 'JournalBySetupTool'),
  },
  {
    id: 'journal-insights', category: 'Journal', title: 'Behaviour insights',
    what: 'Patterns the journal insight engine finds in the same filtered trades.',
    units: 'text, win %, $', source: 'journal insight engine (server, same filters)', backing: 'GET /api/journal/analytics',
    defaultSize: { w: 6, h: 8 }, minSize: { w: 3, h: 5 }, Component: lazyTool(j, 'JournalInsightsTool'),
  },
  {
    id: 'journal-notes', category: 'Journal', title: 'Notes & analysis',
    what: 'The latest notes in the date range (day notes, notebook, imported analysis).',
    units: 'notes', source: SRC, backing: 'GET /api/journal/notes',
    defaultSize: { w: 6, h: 8 }, minSize: { w: 3, h: 5 }, Component: lazyTool(j, 'JournalNotesTool'),
  },
];

/** LuxAlgo's order: KPI row · edge / cumulative · calendar / activity · secondary KPIs · time performance · facts. */
export const JOURNAL_DEFAULTS: DefaultLayout[] = [{
  id: 'default', name: 'Journal',
  tools: [
    ['journal-net-pnl', 0, 0, 3, 4],
    ['journal-win-rate', 3, 0, 3, 4],
    ['journal-profit-factor', 6, 0, 2, 4],
    ['journal-day-win', 8, 0, 2, 4],
    ['journal-avg-win-loss', 10, 0, 2, 4],
    ['journal-edge', 0, 4, 4, 10],
    ['journal-equity', 4, 4, 8, 10],
    ['journal-calendar', 0, 14, 7, 10],
    ['journal-activity', 7, 14, 5, 10],
    ['journal-max-drawdown', 0, 24, 3, 4],
    ['journal-streaks', 3, 24, 2, 4],
    ['journal-expectancy', 5, 24, 2, 4],
    ['journal-duration', 7, 24, 2, 4],
    ['journal-best-worst-day', 9, 24, 3, 4],
    ['journal-time-heatmap', 0, 28, 12, 7],
    ['journal-facts', 0, 35, 6, 7],
    ['journal-by-setup', 6, 35, 6, 7],
    ['journal-insights', 0, 42, 6, 8],
    ['journal-notes', 6, 42, 6, 8],
  ],
}];
