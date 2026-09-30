/**
 * TODAY tools — the /today page split into dashboard tools. UNUSED by /today
 * since 2026-09-30 (the page is hand-composed again: pages/today.tsx reuses
 * today-model.tsx directly); kept registered so persisted ids resolve.
 *
 * Tools: tools/today/today-tools.tsx (data + drawing in today-model.tsx).
 * Every tool shares the page's queries, so a full TODAY dashboard costs one
 * request per endpoint. Ids are persisted in saved layouts — never rename.
 */
import { lazyTool, type DefaultLayout, type ToolDef } from '../tool-def';

const today = () => import('../tools/today/today-tools');
const zeroDteIdeas = () => import('@/components/zerodte/zero-dte-ideas');
const BOOK = 'convictions engine (ranked book)';
const BOOK_API = 'GET /api/convictions (90s refresh) + /api/quotes/batch (live prices)';

export const TODAY_TOOLS: ToolDef[] = [
  {
    id: 'today-week-map', category: 'Market', title: 'Week Dealer Map · SPY',
    what: 'SPY this week in one sentence and one chart: measured call wall / max-γ magnet / put wall, the 1σ weekly band and the model-projected path (not a forecast), plus live SPY and the book.',
    units: 'SPY price $, ±σ points, % of gamma', source: 'GEX engine (SPY chain) + weekly-path model',
    backing: 'WeekMap (tools/today/today-model.tsx) ← GET /api/weekly-path/SPY + /api/gex-vex/terminal/SPY (shared with GEX tools)',
    defaultSize: { w: 8, h: 11 }, minSize: { w: 5, h: 8 }, Component: lazyTool(today, 'TodayWeekMapTool'),
  },
  {
    id: 'today-best-idea', category: 'Ideas', title: "Today's Best Idea",
    what: 'The top-ranked live idea in plain English — why, what is against it, where price sits between stop and target — with its full analysis and audit trail.',
    units: 'evidence 0–100, price $, R multiple', source: BOOK,
    backing: `explain() + Ladder + SigCard ← ${BOOK_API}`,
    defaultSize: { w: 4, h: 11 }, minSize: { w: 3, h: 8 }, Component: lazyTool(today, 'TodayBestIdeaTool'),
  },
  {
    id: 'today-ranked-book', category: 'Ideas', title: 'Ranked Book',
    what: 'The rest of the live book ranked by evidence, one card and one plain-English reason each (starts at #3 when Best idea is on the dashboard).',
    units: 'evidence 0–100, price $, R:R', source: BOOK,
    backing: `SigCard (components/landing/live-widgets.tsx) ← ${BOOK_API}`,
    defaultSize: { w: 8, h: 12 }, minSize: { w: 4, h: 6 }, Component: lazyTool(today, 'TodayRankedBookTool'),
  },
  {
    id: 'today-index-desk', category: 'Market', title: 'Index Desk',
    what: "Today's index calls from the intraday engine for the four instruments it monitors; an index with no call shows 'watch'.",
    units: 'confidence 0–100, R multiple', source: 'index scalp engine',
    backing: 'GET /api/index-scalps (60s refresh)',
    defaultSize: { w: 4, h: 6 }, minSize: { w: 3, h: 4 }, Component: lazyTool(today, 'TodayIndexDeskTool'),
  },
  {
    id: 'today-book-stats', category: 'Ideas', title: 'Book Stats',
    what: 'How many live ideas are in the book, the long/short split, and the top evidence score.',
    units: 'count, evidence 0–100', source: BOOK, backing: `ideas filter (today-model.tsx useBook) ← ${BOOK_API}`,
    defaultSize: { w: 4, h: 5 }, minSize: { w: 3, h: 4 }, Component: lazyTool(today, 'TodayBookStatsTool'),
  },
  {
    id: 'today-model-record', category: 'Journal', title: 'Model Record',
    what: 'The honest record: win rate of decided ideas (with n), average result per idea and profit factor; links to the full track record.',
    units: '% win rate, % per idea, profit factor', source: 'performance stats (replayed outcomes)',
    backing: 'GET /api/performance/stats/ (server cache ≤5m)',
    defaultSize: { w: 5, h: 9 }, minSize: { w: 3, h: 6 }, Component: lazyTool(today, 'TodayModelRecordTool'),
  },
  {
    id: 'today-rotation', category: 'Market', title: 'Sector Rotation',
    what: 'Tracked sectors on relative strength × momentum, with the two leaders money is moving into and the two laggards it is leaving.',
    units: 'rel strength / momentum vs SPY, % vs SPY', source: 'sector rotation',
    backing: 'RotQuad (components/landing/live-widgets.tsx) ← GET /api/sector-rotation',
    defaultSize: { w: 7, h: 9 }, minSize: { w: 4, h: 7 }, Component: lazyTool(today, 'TodayRotationTool'),
  },
  {
    id: 'today-premarket', category: 'Market', title: 'Pre-Market Gaps',
    what: 'The leading direction read before the open: each name\'s pre-market gap vs the prior close (04:00–09:30 ET), book ideas first with whether the gap confirms or goes against them, then the weekly watchlist. Collapsed and stamped outside the window.',
    units: 'gap % vs prior close, $', source: 'Yahoo pre/post quotes (60s server cache)',
    backing: 'GET /api/premarket/gappers?minGapPct=0 (server/pre-market-service.ts) + the ranked book',
    defaultSize: { w: 4, h: 3 }, minSize: { w: 3, h: 2 }, Component: lazyTool(today, 'TodayPremarketTool'),
  },
  {
    id: 'today-crypto', category: 'Market', title: 'Crypto Pulse',
    what: 'The crypto majors at a glance: live price, 24h and 7-day change and the 24h range, stamped with the feed\'s age.',
    units: '$, 24h %, 7d %', source: 'crypto pulse',
    backing: 'GET /api/crypto/pulse (shared with the tape — no extra request)',
    defaultSize: { w: 5, h: 2 }, minSize: { w: 3, h: 2 }, Component: lazyTool(today, 'TodayCryptoTool'),
  },
  {
    id: 'today-tape', category: 'Market', title: 'Sector & Crypto Tape',
    what: 'A scrolling tape of every sector ETF (session %) and the crypto majors (24h %); hover to pause.',
    units: 'session % (sectors), 24h % (crypto), $', source: 'sector rotation + crypto pulse',
    backing: 'GET /api/sector-rotation + /api/crypto/pulse',
    defaultSize: { w: 12, h: 3 }, minSize: { w: 4, h: 2 }, Component: lazyTool(today, 'TodayTapeTool'),
  },
  {
    id: 'today-0dte-ideas', category: 'Ideas', title: '0DTE ideas',
    what: 'The live 0DTE ideas on SPX / MSTR / META / BE / TSLA — stage (WATCH → TRIGGERED → IN PLAY), side, exact contract, premium now, trigger and stop — linking to the full 0DTE desk on NEXUS. Model ideas, unvalidated; the engine record shows as "measuring · n=".',
    units: 'price $, premium $', source: 'NEXUS · 0DTE desk',
    backing: 'ZeroDteIdeas (components/zerodte/zero-dte-ideas.tsx) ← GET /api/zero-dte/desk (server/zero-dte-desk.ts)',
    defaultSize: { w: 3, h: 6 }, minSize: { w: 3, h: 4 }, Component: lazyTool(zeroDteIdeas, 'ZeroDteIdeasTool'),
  },
];

/**
 * TODAY default — an editorial page in reading order (2026-09-30, operator:
 * "everything is all cramped"). PAGE mode draws each y-band as one row at
 * natural height; the page CSS (today.css, .dash-today) centres a ≤1360px
 * column with 48px between rows. Rows (12 × 18):
 *   tape 12×1 · pre-market 12×1                     — free-flowing strips
 *   week dealer map 12×6                           — the hero (headline, map, levels)
 *   index desk 12×2                                — SPX · SPY · QQQ · IWM
 *   best idea 12×3 · ranked book 12×2               — the ideas
 *   rotation 7×2 │ crypto pulse 5×2                 — market context
 *   model record 7×1 │ book stats 5×1               — the record, compact
 */
export const TODAY_DEFAULTS: DefaultLayout[] = [{
  id: 'default', name: 'Today',
  tools: [
    ['today-tape', 0, 0, 12, 1],
    ['today-premarket', 0, 1, 12, 1],
    ['today-week-map', 0, 2, 12, 6],
    ['today-0dte-ideas', 0, 8, 12, 2],
    ['today-best-idea', 0, 10, 12, 3],
    ['today-ranked-book', 0, 13, 12, 2],
    ['today-rotation', 0, 15, 7, 2],
    ['today-crypto', 7, 15, 5, 2],
    ['today-model-record', 0, 17, 7, 1],
    ['today-book-stats', 7, 17, 5, 1],
  ],
}];
