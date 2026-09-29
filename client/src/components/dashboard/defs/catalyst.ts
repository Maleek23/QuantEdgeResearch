/**
 * CATALYST tools — the Catalyst page (catalyst-nexus.tsx) split into tools
 * (tools/catalyst/catalyst-tools.tsx). Each renders one section of
 * CatalystNexus via its `only` prop; all share the page's three query keys.
 */
import { lazyTool, type DefaultLayout, type ToolDef } from '../tool-def';

const cat = () => import('../tools/catalyst/catalyst-tools');
const BOARD = 'GET /api/catalysts/board (conviction picks × verified events, 5-min refresh)';

export const CATALYST_TOOLS: ToolDef[] = [
  {
    id: 'catalyst-impact', category: 'Catalyst', title: 'Signal impact · calendar × book',
    what: 'Published conviction signals joined to verified events: conflict, event risk, confluence and unclaimed catalysts, with the standing response rule. Filter by bucket; click a row for the workup.',
    units: 'conviction score 0–100, days to event', source: 'catalyst board', backing: `CatalystNexus only="impact" ← ${BOARD}`,
    defaultSize: { w: 7, h: 16 }, minSize: { w: 4, h: 6 }, Component: lazyTool(cat, 'CatalystImpactTool'),
  },
  {
    id: 'catalyst-earnings', category: 'Catalyst', title: 'Earnings calendar · 7 days',
    what: 'Every scheduled report in the next 7 days grouped by day: BMO / AMC / TBD and est. EPS (negatives in parentheses). Names in the active book are ringed.',
    units: 'EPS estimate $', source: 'earnings calendar (Nasdaq)', backing: 'CatalystNexus only="earnings" ← GET /api/earnings/calendar?days=7 (30-min refresh)',
    defaultSize: { w: 5, h: 8 }, minSize: { w: 3, h: 5 }, Component: lazyTool(cat, 'CatalystEarningsTool'),
  },
  {
    id: 'catalyst-econ', category: 'Catalyst', title: 'Economic calendar · macro releases',
    what: 'Upcoming US macro releases with date, ET time, importance and what each one moves. A stale calendar shows nothing rather than guessed dates.',
    units: 'date · ET time · importance', source: 'economic calendar (FRED)', backing: 'CatalystNexus only="econ" ← GET /api/economic-calendar (10-min refresh)',
    defaultSize: { w: 7, h: 10 }, minSize: { w: 3, h: 5 }, Component: lazyTool(cat, 'CatalystEconTool'),
  },
  {
    id: 'catalyst-summary', category: 'Catalyst', title: 'Catalyst summary · coverage',
    what: 'Tracked signals, event risk, conflicts and confluence counts; how many live signals have a tracked event inside their horizon; feed status.',
    units: 'count, % of live signals', source: 'catalyst board', backing: `CatalystNexus only="summary" ← ${BOARD} + earnings + economic calendars`,
    defaultSize: { w: 5, h: 8 }, minSize: { w: 3, h: 5 }, Component: lazyTool(cat, 'CatalystSummaryTool'),
  },
  {
    id: 'catalyst-distance', category: 'Catalyst', title: 'Distance to event',
    what: 'Every tracked signal with a dated event, nearest first; bar length scales with days away (≤2d close, ≤6d medium).',
    units: 'days to event', source: 'catalyst board', backing: `CatalystNexus only="distance" ← ${BOARD}`,
    defaultSize: { w: 5, h: 10 }, minSize: { w: 3, h: 4 }, Component: lazyTool(cat, 'CatalystDistanceTool'),
  },
  {
    id: 'catalyst-classic', category: 'Catalyst', title: 'Catalyst (all-in-one)',
    what: 'The previous Catalyst page in one tile: calendars, signal-impact table and the summary rail.',
    units: 'conviction score, days to event, EPS $', source: 'catalyst board', backing: 'CatalystNexus (components/catalyst/catalyst-nexus.tsx)',
    defaultSize: { w: 12, h: 20 }, minSize: { w: 8, h: 12 }, Component: lazyTool(cat, 'CatalystClassicTool'),
  },
];

/**
 * Catalyst default — the impact board (the page's point: conflicts first)
 * on the left; summary + this week's earnings on the right; macro releases
 * and distance-to-event below.
 */
export const CATALYST_DEFAULTS: DefaultLayout[] = [{
  id: 'default', name: 'Catalyst',
  tools: [
    ['catalyst-impact', 0, 0, 7, 16],
    ['catalyst-summary', 7, 0, 5, 8],
    ['catalyst-earnings', 7, 8, 5, 8],
    ['catalyst-econ', 0, 16, 7, 10],
    ['catalyst-distance', 7, 16, 5, 10],
  ],
}];
