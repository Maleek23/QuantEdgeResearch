/**
 * BOT tools — the BOT board (components/bot/bot-nexus.tsx) split into tools,
 * one board section per tile (tools/bot/bot-tools.tsx → <BotNexus only=…>).
 * All tools share the board's react-query keys (one request per feed); a lone
 * section only enables the feeds it shows. `bot-classic` is the whole board.
 */
import { lazyTool, type DefaultLayout, type ToolDef } from '../tool-def';

const bot = () => import('../tools/bot/bot-tools');
const BACK = 'BotNexus (components/bot/bot-nexus.tsx)';

export const BOT_TOOLS: ToolDef[] = [
  {
    id: 'bot-stats', category: 'Bot', title: 'Automation KPIs',
    what: 'Jobs live, rules enforced, latest scan size, observed outcomes (withheld under the coverage gate) and the next macro release.',
    units: 'counts, % win rate (only when n ≥ 30 and ≥ 80% coverage)', source: 'job outputs · outcome model v2 · FRED',
    backing: `${BACK} only="stats" ← /api/convictions, /api/performance/outcome-model, /api/economic-calendar + job feeds`,
    defaultSize: { w: 12, h: 4 }, minSize: { w: 4, h: 3 }, Component: lazyTool(bot, 'BotStatsTool'),
  },
  {
    id: 'bot-jobs', category: 'Bot', title: 'Engines & jobs',
    what: 'The real background jobs (conviction engine, news sentry, flow scanner, LEAPS, macro calendar, crypto pulse); status derived from each job\'s own output freshness.',
    units: 'running / stale / idle, output age, counts', source: 'each job\'s own output',
    backing: `${BACK} only="jobs" ← convictions, catalysts/recent, options-flow, leap-tracker, economic-calendar, crypto/pulse, realtime-status`,
    ageInside: true, defaultSize: { w: 8, h: 10 }, minSize: { w: 3, h: 6 }, Component: lazyTool(bot, 'BotJobsTool'),
  },
  {
    id: 'bot-book', category: 'Bot', title: 'Paper book · open positions',
    what: 'What the quant bot holds on paper, in every run (each paper portfolio it traded): value = cash + open positions at their marks, each position with its mark age, brackets and where the mark sits between stop and target. ⤢ = chart + barriers; row → workup.',
    units: '$, % (option rows in contract premium)', source: 'paper execution ledger',
    backing: `${BACK} only="book" ← GET /api/quant-bot/status (60s)`,
    defaultSize: { w: 5, h: 8 }, minSize: { w: 4, h: 5 }, Component: lazyTool(bot, 'BotBookTool'),
  },
  {
    id: 'bot-history', category: 'Bot', title: 'Bot track record · every run',
    what: 'The bot\'s record per run and combined (n closed, W–L, win rate withheld under n=30, realized, open), with a run filter, then every closed paper position newest first. Same rows and metrics as the journal\'s Bot book.',
    units: '$, % from entry', source: 'paper execution ledger (all bot portfolios)',
    backing: `${BACK} only="history" ← GET /api/journal/trades?journal=bot (5m) · metrics.ts runRecords`,
    defaultSize: { w: 6, h: 9 }, minSize: { w: 4, h: 5 }, Component: lazyTool(bot, 'BotHistoryTool'),
  },
  {
    id: 'bot-ledger', category: 'Bot', title: 'Blocked ledger · shadow shorts',
    what: 'Shorts the discipline gate refused, replayed on daily bars: did blocking save or cost us? REPLAY draws the blocked trade on the chart.',
    units: 'would-be % P&L, $ levels', source: 'discipline ledger + daily bars',
    backing: `${BACK} only="ledger" ← GET /api/discipline/ledger`,
    defaultSize: { w: 4, h: 8 }, minSize: { w: 4, h: 5 }, Component: lazyTool(bot, 'BotLedgerTool'),
  },
  {
    id: 'bot-rules', category: 'Bot', title: 'Gates & rules',
    what: 'The gates, signals and disclosure rules enforced in code, with the file that enforces each. Locked — rules are code, not switches.',
    units: 'rule · file', source: 'code (static list)',
    backing: `${BACK} only="rules" (RULES const)`,
    staticContent: true, defaultSize: { w: 12, h: 10 }, minSize: { w: 4, h: 5 }, Component: lazyTool(bot, 'BotRulesTool'),
  },
  {
    id: 'bot-log', category: 'Bot', title: 'Activity log',
    what: 'Real recent events — ideas published by the conviction engine and catalysts ingested by the news sentry, merged by time.',
    units: 'time, $ entry', source: 'conviction engine · news sentry',
    backing: `${BACK} only="log" ← /api/convictions, /api/catalysts/recent`,
    defaultSize: { w: 6, h: 9 }, minSize: { w: 4, h: 5 }, Component: lazyTool(bot, 'BotLogTool'),
  },
  {
    id: 'bot-queue', category: 'Bot', title: 'Macro queue · FRED',
    what: 'Upcoming economic releases from the FRED calendar — the same feed the macro cash gate reads.',
    units: 'date, days to release', source: 'FRED economic calendar',
    backing: `${BACK} only="queue" ← GET /api/economic-calendar`,
    defaultSize: { w: 4, h: 5 }, minSize: { w: 3, h: 4 }, Component: lazyTool(bot, 'BotQueueTool'),
  },
  {
    id: 'bot-outcomes', category: 'Bot', title: 'Outcome integrity · SR 11-7',
    what: 'Observed decided outcomes with the unresolved population visible; win rate withheld until n ≥ 30 and coverage ≥ 80%; best / worst diagnostic slice.',
    units: 'W–L counts, % coverage, R', source: 'outcome model v2',
    backing: `${BACK} only="outcomes" ← GET /api/performance/outcome-model`,
    defaultSize: { w: 3, h: 8 }, minSize: { w: 3, h: 5 }, Component: lazyTool(bot, 'BotOutcomesTool'),
  },
  {
    id: 'bot-status', category: 'Bot', title: 'Safeguards & system status',
    what: 'Standing safeguards (short gate, catalyst bar, sample floor, coverage gate, broker: none) and system rows: jobs running, catalysts, calendar, last scan heartbeat.',
    units: 'state, counts', source: 'job outputs · outcome model v2',
    backing: `${BACK} only="status"`,
    defaultSize: { w: 4, h: 5 }, minSize: { w: 3, h: 4 }, Component: lazyTool(bot, 'BotStatusTool'),
  },
  {
    id: 'bot-classic', category: 'Bot', title: 'BOT board (all-in-one, classic)',
    what: 'The previous BOT page in one tile: every section, the resizable right rail and ⌘K search over jobs, rules and events.',
    units: 'mixed', source: 'job outputs · paper ledger · FRED · outcome model',
    backing: BACK, ageInside: true,
    defaultSize: { w: 12, h: 20 }, minSize: { w: 8, h: 12 }, Component: lazyTool(bot, 'BotClassicTool'),
  },
];

/**
 * BOT default — KPIs across the top; then the paper book, the blocked ledger
 * and outcome integrity (what the bot holds and whether its record is
 * reportable); then jobs with the macro queue and safeguards beside them;
 * below the fold, trade history, the activity log and the rules table.
 */
export const BOT_DEFAULTS: DefaultLayout[] = [{
  id: 'default', name: 'BOT',
  tools: [
    ['bot-stats', 0, 0, 12, 4],
    ['bot-book', 0, 4, 5, 8],
    ['bot-ledger', 5, 4, 4, 8],
    ['bot-outcomes', 9, 4, 3, 8],
    ['bot-jobs', 0, 12, 8, 10],
    ['bot-queue', 8, 12, 4, 5],
    ['bot-status', 8, 17, 4, 5],
    ['bot-history', 0, 22, 6, 9],
    ['bot-log', 6, 22, 6, 9],
    ['bot-rules', 0, 31, 12, 10],
  ],
}];
