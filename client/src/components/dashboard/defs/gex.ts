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
    id: 'gex-dealer-map', category: 'GEX', title: 'Dealer Map · near-term ladder',
    what: 'Net dealer gamma at every listed strike, expiries ≤7 days, with walls, max-γ and zero-γ drawn as rows; scrolls the full strike range.',
    units: 'GEX $ per 1% move', source: ENGINE, backing: `GexStrikeLadder (gex-strike-grid.tsx) ← ${TERMINAL}`,
    needs: ['symbol'], defaultSize: { w: 3, h: 16 }, minSize: { w: 3, h: 8 }, Component: lazyTool(gex, 'GexDealerMapTool'),
  },
  {
    id: 'gex-matrix', category: 'GEX', title: 'Strike × Expiry Matrix',
    what: 'Every listed strike × expiry cell, GEX or VEX, filterable by days to expiry. Coloured per expiry by default (each column 0 → its own max; toggle Absolute), top-2 cells of every expiry labelled, net per expiry in the header; click a cell to drill.',
    units: 'GEX $/1% move · VEX $/IV pt', source: ENGINE, backing: `GexStrikeMatrix (gex-strike-grid.tsx) ← ${TERMINAL}`,
    needs: ['symbol'], defaultSize: { w: 8, h: 18 }, minSize: { w: 4, h: 8 }, Component: lazyTool(gex, 'GexMatrixTool'),
  },
  {
    id: 'gex-profile', category: 'GEX', title: 'Gamma Profile · zero-γ',
    what: 'Net GEX re-priced across hypothetical spot prices (±20%); where the curve crosses zero is the zero-gamma flip.',
    units: 'GEX $ per 1% move vs price $', source: ENGINE, backing: `GammaProfileChart (gex-parts.tsx) ← snapshot.gammaProfile`,
    needs: ['symbol'], defaultSize: { w: 3, h: 7 }, minSize: { w: 3, h: 5 }, Component: lazyTool(gex, 'GexProfileTool'),
  },
  {
    id: 'gex-levels', category: 'GEX', title: 'Key Levels · walls / king node / zero-γ',
    what: 'Call wall, put wall, max-γ magnet, zero-γ flip and net GEX/VEX on a price rail with spot, plus the 0–7 DTE nodes.',
    units: 'strike $, % from spot, GEX $/1%, VEX $/IV pt', source: ENGINE, backing: `snapshot walls + nearTermByStrike (gex-model.ts) ← ${TERMINAL}`,
    needs: ['symbol'], defaultSize: { w: 3, h: 9 }, minSize: { w: 3, h: 6 }, Component: lazyTool(gex, 'GexKeyLevelsTool'),
  },
  {
    id: 'gex-regime', category: 'GEX', title: 'Regime & Narrative',
    what: 'The gamma regime in words — what dealers do, what to expect, and what changes if price holds inside or breaks a wall.',
    units: 'GEX $ per 1% move', source: ENGINE, backing: `regimeView + regimeNarrative (gex-model.ts, shared/gex-regime.ts) ← ${TERMINAL}`,
    needs: ['symbol'], defaultSize: { w: 3, h: 7 }, minSize: { w: 3, h: 5 }, Component: lazyTool(gex, 'GexRegimeTool'),
  },
  {
    id: 'gex-gravity', category: 'GEX', title: 'Gravity & Strongest Nodes',
    what: 'Positive vs negative share of exposure across the book, and the strongest listed node above and below spot.',
    units: '% of |GEX| or |VEX|, strike $', source: ENGINE, backing: `shapeMatrix (gex-model.ts) ← ${TERMINAL}`,
    needs: ['symbol'], defaultSize: { w: 3, h: 9 }, minSize: { w: 3, h: 6 }, Component: lazyTool(gex, 'GexGravityTool'),
  },
  {
    id: 'gex-rankings', category: 'GEX', title: 'Cross-Ticker Rankings',
    what: 'Every scanned ticker ranked by play score (or |VEX|) with its gamma regime; click one to focus every GEX tool on it.',
    units: 'score 0–100, VEX $/IV pt', source: 'GEX hub scan', backing: 'GET /api/gex-vex/hub (topPlays, 3-min refresh)',
    defaultSize: { w: 3, h: 14 }, minSize: { w: 3, h: 6 }, Component: lazyTool(gex, 'GexRankingsTool'),
  },
  {
    id: 'gex-setups', category: 'GEX', title: 'Magnet Setups · screener',
    what: 'Magnet-detector hits (near-expiry gamma just beyond spot, opened today, price moving toward it), −VEX, lowest GEX+ and pins.',
    units: 'GEX $/1%, VEX $/IV pt, score', source: 'GEX rankings job', backing: 'GexRankingsPanel (components/gex/gex-rankings-panel.tsx) → /api/gex-vex/rankings',
    ageInside: true, defaultSize: { w: 4, h: 7 }, minSize: { w: 3, h: 5 }, Component: lazyTool(gex, 'GexSetupsTool'),
  },
  {
    id: 'squeeze-radar', category: 'GEX', title: 'Squeeze Radar · gamma squeeze build',
    what: 'Per-ticker 0–100 squeeze score with its components: near-dated OTM call build, call-wall migration, customer call buying, dealer short gamma (customer-long-calls assumption), room to the squeeze strike, IV with spot, RV expansion, OCC customer calls, short interest. Stage + key strikes. Unvalidated — measuring.',
    units: 'score 0–100 (not a probability), strikes $', source: 'Squeeze radar (GEX rankings chain reads + tape + OCC + bars)',
    backing: 'SqueezeRadarTool (tools/gex/squeeze-radar-tool.tsx) → /api/gex-vex/squeeze-radar',
    defaultSize: { w: 5, h: 14 }, minSize: { w: 4, h: 8 }, Component: lazyTool(() => import('../tools/gex/squeeze-radar-tool'), 'SqueezeRadarTool'),
  },
  {
    id: 'gex-hub', category: 'GEX', title: 'GEX Hub (all-in-one)',
    what: 'The previous GEX page in one tile: ranked list, near-term map, strike × expiry surface and context rail.',
    units: 'GEX $/1% move, VEX $/IV pt', source: ENGINE, backing: 'GexHubNexus (components/gex/gex-hub-nexus.tsx)',
    ageInside: true, defaultSize: { w: 12, h: 20 }, minSize: { w: 8, h: 12 }, Component: lazyTool(gex, 'GexHubTool'),
  },
  {
    id: 'money-flow', category: 'Market', title: 'Money Flow · sector rotation',
    what: 'Sector ETFs this session: the laggards money is leaving and the leaders it is moving into.',
    units: '% change', source: 'sector rotation', backing: 'GET /api/sector-rotation',
    defaultSize: { w: 3, h: 6 }, minSize: { w: 3, h: 4 }, Component: lazyTool(gex, 'MoneyFlowTool'),
  },
];

/**
 * GEX default — one screen (12 × 18), tiled exactly at every desktop/tablet
 * size (rows scale: layout.ts fitRowHeight). Operator 2026-10-01: "this is
 * GEX, it needs to fit to screen" + the Magnet Setups screener back in the
 * default (it had dropped out of sight). The matrix keeps the full height —
 * strikes are what a GEX read needs most; its columns stretch to the tile and
 * page by width (gex-strike-grid.tsx).
 *
 *   ┌──────────── strike × expiry matrix 8×18 ────────────┬ key levels 4×7 ─┐
 *   │ 0–14d by default, columns fill the tile              ├ magnet setups 4×6┤
 *   │                                                      ├ regime 4×5 ──────┤
 *   └──────────────────────────────────────────────────────┴──────────────────┘
 */
export const GEX_DEFAULTS: DefaultLayout[] = [{
  id: 'default', name: 'GEX',
  tools: [
    ['gex-matrix', 0, 0, 8, 18],
    ['gex-levels', 8, 0, 4, 7],
    ['gex-setups', 8, 7, 4, 6],
    ['gex-regime', 8, 13, 4, 5],
  ],
}];
