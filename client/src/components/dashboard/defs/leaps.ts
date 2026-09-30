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
    id: 'leaps-summary', category: 'Ideas', title: 'LEAPS Summary',
    what: 'Liquid-of-scanned count, S-grade names, average score and average DTE, with the session, staleness and SPY move the scan ran against.',
    units: 'count, score 0–100, days', source: 'LEAP tracker', backing: `LeapsNexus only="summary" ← ${FEED}`,
    defaultSize: { w: 4, h: 6 }, minSize: { w: 3, h: 4 }, Component: lazyTool(leaps, 'LeapsSummaryTool'),
  },
  {
    id: 'leaps-grades', category: 'Ideas', title: 'LEAPS Grade Distribution',
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
 * LEAPS is a SIMPLE page (pages.ts `simple`: the ranked LEAPS board full
 * bleed). No Customize switch since 2026-09-29; this grid is documentation only (12 × 18):
 *   ┌──────── ranked contracts 7×18 ────────┬ stock chart 5×11 ┐
 *   │                                       ├ summary 5×7      ┤
 * The chart follows whichever card was clicked. Grades: Add tool.
 */
export const LEAPS_DEFAULTS: DefaultLayout[] = [{
  id: 'default', name: 'LEAPS',
  tools: [
    ['leaps-list', 0, 0, 7, 18],
    ['stock-chart', 7, 0, 5, 11],
    ['leaps-summary', 7, 11, 5, 7],
  ],
}];
