/**
 * TODAY tools — the /today page split into dashboard tools
 * (tools/today/today-tools.tsx; data + drawing in today-model.tsx).
 * Every tool shares the page's queries, so a full TODAY dashboard costs one
 * request per endpoint. Ids are persisted in saved layouts — never rename.
 */
import { lazyTool, type DefaultLayout, type ToolDef } from '../tool-def';

const today = () => import('../tools/today/today-tools');
const BOOK = 'convictions engine (ranked book)';
const BOOK_API = 'GET /api/convictions (90s refresh) + /api/quotes/batch (live prices)';

export const TODAY_TOOLS: ToolDef[] = [
  {
    id: 'today-week-map', category: 'Market', title: 'Week dealer map · SPY',
    what: 'SPY this week in one sentence and one chart: measured call wall / max-γ magnet / put wall, the 1σ weekly band and the model-projected path (not a forecast), plus live SPY and the book.',
    units: 'SPY price $, ±σ points, % of gamma', source: 'GEX engine (SPY chain) + weekly-path model',
    backing: 'WeekMap (tools/today/today-model.tsx) ← GET /api/weekly-path/SPY + /api/gex-vex/terminal/SPY (shared with GEX tools)',
    defaultSize: { w: 8, h: 11 }, minSize: { w: 5, h: 8 }, Component: lazyTool(today, 'TodayWeekMapTool'),
  },
  {
    id: 'today-best-idea', category: 'Ideas', title: 'Best idea · top ranked setup',
    what: 'The top-ranked live idea in plain English — why, what is against it, where price sits between stop and target — with its full analysis and audit trail.',
    units: 'evidence 0–100, price $, R multiple', source: BOOK,
    backing: `explain() + Ladder + SigCard ← ${BOOK_API}`,
    defaultSize: { w: 4, h: 11 }, minSize: { w: 3, h: 8 }, Component: lazyTool(today, 'TodayBestIdeaTool'),
  },
  {
    id: 'today-ranked-book', category: 'Ideas', title: 'Ranked book',
    what: 'The rest of the live book ranked by evidence, one card and one plain-English reason each (starts at #3 when Best idea is on the dashboard).',
    units: 'evidence 0–100, price $, R:R', source: BOOK,
    backing: `SigCard (components/landing/live-widgets.tsx) ← ${BOOK_API}`,
    defaultSize: { w: 8, h: 12 }, minSize: { w: 4, h: 6 }, Component: lazyTool(today, 'TodayRankedBookTool'),
  },
  {
    id: 'today-index-desk', category: 'Market', title: 'Index desk · SPX SPY QQQ IWM',
    what: "Today's index calls from the intraday engine for the four instruments it monitors; an index with no call shows 'watch'.",
    units: 'confidence 0–100, R multiple', source: 'index scalp engine',
    backing: 'GET /api/index-scalps (60s refresh)',
    defaultSize: { w: 4, h: 6 }, minSize: { w: 3, h: 4 }, Component: lazyTool(today, 'TodayIndexDeskTool'),
  },
  {
    id: 'today-book-stats', category: 'Ideas', title: 'Book stats',
    what: 'How many live ideas are in the book, the long/short split, and the top evidence score.',
    units: 'count, evidence 0–100', source: BOOK, backing: `ideas filter (today-model.tsx useBook) ← ${BOOK_API}`,
    defaultSize: { w: 4, h: 5 }, minSize: { w: 3, h: 4 }, Component: lazyTool(today, 'TodayBookStatsTool'),
  },
  {
    id: 'today-model-record', category: 'Journal', title: 'Model record',
    what: 'The honest record: win rate of decided ideas (with n), average result per idea and profit factor; links to the full track record.',
    units: '% win rate, % per idea, profit factor', source: 'performance stats (replayed outcomes)',
    backing: 'GET /api/performance/stats/ (server cache ≤5m)',
    defaultSize: { w: 5, h: 9 }, minSize: { w: 3, h: 6 }, Component: lazyTool(today, 'TodayModelRecordTool'),
  },
  {
    id: 'today-rotation', category: 'Market', title: 'Rotation · sector quadrant',
    what: 'Tracked sectors on relative strength × momentum, with the two leaders money is moving into and the two laggards it is leaving.',
    units: 'rel strength / momentum vs SPY, % vs SPY', source: 'sector rotation',
    backing: 'RotQuad (components/landing/live-widgets.tsx) ← GET /api/sector-rotation',
    defaultSize: { w: 7, h: 9 }, minSize: { w: 4, h: 7 }, Component: lazyTool(today, 'TodayRotationTool'),
  },
  {
    id: 'today-tape', category: 'Market', title: 'Sector & crypto tape',
    what: 'A scrolling tape of every sector ETF (session %) and the crypto majors (24h %); hover to pause.',
    units: 'session % (sectors), 24h % (crypto), $', source: 'sector rotation + crypto pulse',
    backing: 'GET /api/sector-rotation + /api/crypto/pulse',
    defaultSize: { w: 12, h: 3 }, minSize: { w: 4, h: 2 }, Component: lazyTool(today, 'TodayTapeTool'),
  },
];

/**
 * TODAY default — the old page's reading order on one screen (12 × 18):
 *   ┌────────── week dealer map · SPY 8×9 ───────────┬ best idea 4×9 ─┐
 *   ├──────────────────── sector & crypto tape 12×3 ───────────────────┤
 *   ├───── ranked book 6×6 ─────┬ index desk 3×6 ┬ model record 3×6 ──┤
 * Book stats, rotation and book by horizon: Add tool.
 */
export const TODAY_DEFAULTS: DefaultLayout[] = [{
  id: 'default', name: 'Today',
  tools: [
    ['today-week-map', 0, 0, 8, 9],
    ['today-best-idea', 8, 0, 4, 9],
    ['today-tape', 0, 9, 12, 3],
    ['today-ranked-book', 0, 12, 6, 6],
    ['today-index-desk', 6, 12, 3, 6],
    ['today-model-record', 9, 12, 3, 6],
  ],
}];
