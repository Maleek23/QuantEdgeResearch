/**
 * GEX tools — the GEX hub split into dashboard tools (tools/gex/gex-tools.tsx).
 * `gex-hub`, `gex-levels`, `gex-setups` keep the ids flowdash persisted.
 * All ticker tools share one /api/gex-vex/terminal query per symbol.
 */
import { lazyTool, type DefaultLayout, type ToolDef } from '../tool-def';

const gex = () => import('../tools/gex/gex-tools');
const ENGINE = 'GEX engine (Alpaca/CBOE chains)';
const TERMINAL = 'GET /api/gex-vex/terminal/:symbol (shared query, 2-min refresh)';

export const GEX_TOOLS: ToolDef[] = [
  {
    id: 'gex-dealer-map', category: 'GEX', title: 'Dealer map · near-term ladder',
    what: 'Net dealer gamma at every listed strike, expiries ≤7 days, with walls, max-γ and zero-γ drawn as rows; scrolls the full strike range.',
    units: 'GEX $ per 1% move', source: ENGINE, backing: `GexStrikeLadder (gex-strike-grid.tsx) ← ${TERMINAL}`,
    needs: ['symbol'], defaultSize: { w: 3, h: 16 }, minSize: { w: 3, h: 8 }, Component: lazyTool(gex, 'GexDealerMapTool'),
  },
  {
    id: 'gex-matrix', category: 'GEX', title: 'Strike × expiry matrix',
    what: 'Every listed strike × expiry cell, GEX or VEX, filterable by days to expiry; click a cell for its share of the strike and expiry.',
    units: 'GEX $/1% move · VEX $/IV pt', source: ENGINE, backing: `GexStrikeMatrix (gex-strike-grid.tsx) ← ${TERMINAL}`,
    needs: ['symbol'], defaultSize: { w: 6, h: 14 }, minSize: { w: 4, h: 8 }, Component: lazyTool(gex, 'GexMatrixTool'),
  },
  {
    id: 'gex-profile', category: 'GEX', title: 'Gamma profile · zero-γ',
    what: 'Net GEX re-priced across hypothetical spot prices (±20%); where the curve crosses zero is the zero-gamma flip.',
    units: 'GEX $ per 1% move vs price $', source: ENGINE, backing: `GammaProfileChart (gex-parts.tsx) ← snapshot.gammaProfile`,
    needs: ['symbol'], defaultSize: { w: 3, h: 7 }, minSize: { w: 3, h: 5 }, Component: lazyTool(gex, 'GexProfileTool'),
  },
  {
    id: 'gex-levels', category: 'GEX', title: 'Key levels · walls / magnet / flip',
    what: 'Call wall, put wall, max-γ magnet, zero-γ flip and net GEX/VEX on a price rail with spot, plus the 0–7 DTE nodes.',
    units: 'strike $, % from spot, GEX $/1%, VEX $/IV pt', source: ENGINE, backing: `snapshot walls + nearTermByStrike (gex-model.ts) ← ${TERMINAL}`,
    needs: ['symbol'], defaultSize: { w: 3, h: 9 }, minSize: { w: 3, h: 6 }, Component: lazyTool(gex, 'GexKeyLevelsTool'),
  },
  {
    id: 'gex-regime', category: 'GEX', title: 'Regime & narrative',
    what: 'The gamma regime in words — what dealers do, what to expect, and what changes if price holds inside or breaks a wall.',
    units: 'GEX $ per 1% move', source: ENGINE, backing: `regimeView + regimeNarrative (gex-model.ts, shared/gex-regime.ts) ← ${TERMINAL}`,
    needs: ['symbol'], defaultSize: { w: 3, h: 7 }, minSize: { w: 3, h: 5 }, Component: lazyTool(gex, 'GexRegimeTool'),
  },
  {
    id: 'gex-gravity', category: 'GEX', title: 'Gravity & strongest nodes',
    what: 'Positive vs negative share of exposure across the book, and the strongest listed node above and below spot.',
    units: '% of |GEX| or |VEX|, strike $', source: ENGINE, backing: `shapeMatrix (gex-model.ts) ← ${TERMINAL}`,
    needs: ['symbol'], defaultSize: { w: 3, h: 9 }, minSize: { w: 3, h: 6 }, Component: lazyTool(gex, 'GexGravityTool'),
  },
  {
    id: 'gex-rankings', category: 'GEX', title: 'Cross-ticker rankings',
    what: 'Every scanned ticker ranked by play score (or |VEX|) with its gamma regime; click one to focus every GEX tool on it.',
    units: 'score 0–100, VEX $/IV pt', source: 'GEX hub scan', backing: 'GET /api/gex-vex/hub (topPlays, 3-min refresh)',
    defaultSize: { w: 3, h: 14 }, minSize: { w: 3, h: 6 }, Component: lazyTool(gex, 'GexRankingsTool'),
  },
  {
    id: 'gex-setups', category: 'GEX', title: 'Magnet setups · screener',
    what: 'Magnet-detector hits (near-expiry gamma just beyond spot, opened today, price moving toward it), −VEX, lowest GEX+ and pins.',
    units: 'GEX $/1%, VEX $/IV pt, score', source: 'GEX rankings job', backing: 'GexRankingsPanel (components/gex/gex-rankings-panel.tsx) → /api/gex-vex/rankings',
    ageInside: true, defaultSize: { w: 7, h: 13 }, minSize: { w: 5, h: 8 }, Component: lazyTool(gex, 'GexSetupsTool'),
  },
  {
    id: 'gex-hub', category: 'GEX', title: 'GEX Hub (all-in-one)',
    what: 'The previous GEX page in one tile: ranked list, near-term map, strike × expiry surface and context rail.',
    units: 'GEX $/1% move, VEX $/IV pt', source: ENGINE, backing: 'GexHubNexus (components/gex/gex-hub-nexus.tsx)',
    ageInside: true, defaultSize: { w: 12, h: 20 }, minSize: { w: 8, h: 12 }, Component: lazyTool(gex, 'GexHubTool'),
  },
  {
    id: 'money-flow', category: 'Market', title: 'Money flow · sector rotation',
    what: 'Sector ETFs this session: the laggards money is leaving and the leaders it is moving into.',
    units: '% change', source: 'sector rotation', backing: 'GET /api/sector-rotation',
    defaultSize: { w: 3, h: 6 }, minSize: { w: 3, h: 4 }, Component: lazyTool(gex, 'MoneyFlowTool'),
  },
];

/**
 * GEX default — a pro GEX terminal: regime + levels on the left, the stock
 * chart with GEX overlay in the middle, the near-term ladder on the right;
 * below, the full strike × expiry matrix, profile, gravity and the
 * cross-ticker rankings with the one compact flow-context tool (links to
 * FLOW — the flow views themselves live there); then magnet setups and the
 * (3D surface removed 2026-09-29).
 */
export const GEX_DEFAULTS: DefaultLayout[] = [{
  id: 'default', name: 'GEX',
  tools: [
    ['gex-regime', 0, 0, 3, 7],
    ['gex-levels', 0, 7, 3, 9],
    ['stock-chart', 3, 0, 5, 16],
    ['gex-dealer-map', 8, 0, 4, 16],
    ['gex-matrix', 0, 16, 6, 14],
    ['gex-profile', 6, 16, 3, 6],
    ['gex-gravity', 6, 22, 3, 8],
    ['gex-rankings', 9, 16, 3, 8],
    ['flow-context', 9, 24, 3, 6],
    ['gex-setups', 0, 30, 7, 13],
  ],
}];
