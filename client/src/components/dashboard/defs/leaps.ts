/**
 * LEAPS tools — the LEAPS page (hunt/leaps-nexus.tsx) split into tools
 * (tools/leaps/leaps-tools.tsx). Each renders one section of LeapsNexus via
 * its `only` prop; all share one /api/leap-tracker query, and the budget /
 * min-grade filters are shared across LEAPS tiles on the page.
 */
import { lazyTool, type DefaultLayout, type ToolDef } from '../tool-def';

const leaps = () => import('../tools/leaps/leaps-tools');
const FEED = 'GET /api/leap-tracker (10-min refresh)';

export const LEAPS_TOOLS: ToolDef[] = [
  {
    id: 'leaps-list', category: 'Ideas', title: 'LEAPS · ranked contracts',
    what: 'Liquid stock-replacement calls ranked by grade (sector 30 + trend 30 + contract 40): strike, expiry, premium, DTE, IV and ROI at a +30% move. Budget and min-grade filters; ⌘K search; a card click focuses its ticker.',
    units: 'score 0–100, premium $/sh, DTE days, ROI %', source: 'LEAP tracker', backing: `LeapsNexus only="list" ← ${FEED}`,
    defaultSize: { w: 8, h: 16 }, minSize: { w: 4, h: 7 }, Component: lazyTool(leaps, 'LeapsListTool'),
  },
  {
    id: 'leaps-summary', category: 'Ideas', title: 'LEAPS summary',
    what: 'Liquid-of-scanned count, S-grade names, average score and average DTE, with the session, staleness and SPY move the scan ran against.',
    units: 'count, score 0–100, days', source: 'LEAP tracker', backing: `LeapsNexus only="summary" ← ${FEED}`,
    defaultSize: { w: 4, h: 6 }, minSize: { w: 3, h: 4 }, Component: lazyTool(leaps, 'LeapsSummaryTool'),
  },
  {
    id: 'leaps-grades', category: 'Ideas', title: 'LEAPS grade distribution',
    what: 'How many picks landed in each grade (S/A/B/C), how many the current min-grade filter shows, and the grading weights.',
    units: 'count, weight points', source: 'LEAP tracker', backing: `LeapsNexus only="grades" ← ${FEED}`,
    defaultSize: { w: 4, h: 10 }, minSize: { w: 3, h: 5 }, Component: lazyTool(leaps, 'LeapsGradesTool'),
  },
  {
    id: 'leaps-classic', category: 'Ideas', title: 'LEAPS (all-in-one)',
    what: 'The previous LEAPS page in one tile: header, filters, ranked cards, summary rail and ⌘K search.',
    units: 'score 0–100, premium $/sh, DTE days, ROI %', source: 'LEAP tracker', backing: 'LeapsNexus (components/hunt/leaps-nexus.tsx)',
    defaultSize: { w: 12, h: 20 }, minSize: { w: 8, h: 12 }, Component: lazyTool(leaps, 'LeapsClassicTool'),
  },
];

/**
 * LEAPS default — the ranked cards take the first screen with summary and
 * grade distribution beside them; below, the stock chart follows whichever
 * card was clicked (cards set the focus ticker).
 */
export const LEAPS_DEFAULTS: DefaultLayout[] = [{
  id: 'default', name: 'LEAPS',
  tools: [
    ['leaps-list', 0, 0, 8, 16],
    ['leaps-summary', 8, 0, 4, 6],
    ['leaps-grades', 8, 6, 4, 10],
    ['stock-chart', 0, 16, 12, 12],
  ],
}];
