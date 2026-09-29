/**
 * PAGES — every destination that is a dashboard, with its namespaced storage
 * and its shipped DEFAULT layout(s). A page owns no tools: it is a default
 * arrangement of registry tools.
 *
 * PAGE MODES (operator decision 2026-09-29) — how much of the layout the
 * viewer may change:
 *
 *   workspace  GEX and FLOW only. The full dashboard chrome: named dashboards,
 *              Add tool (a CURATED catalogue — `catalog` below — never the
 *              whole registry), drag / resize, Auto-arrange, Clear, Restore
 *              default. Layouts persist per user (use-dashboards.ts).
 *   fixed      Every other dashboard page (Today, NEXUS, CATALYST, CRYPTO,
 *              BOT, JOURNAL). Same tile format, the curated default layout,
 *              and nothing editable: no Add tool, drag, resize, clear, restore
 *              or dashboard switcher. A layout saved for the page before this
 *              change is IGNORED (never read, never deleted).
 *   simple     CHART, LEAPS, POSITIONS: one primary tool full bleed (+ an
 *              optional rail). No Customize switch any more.
 *
 * Persistence (use-dashboards.ts): one `user_page_layouts` row per dashboard,
 * pageId = `<storagePrefix><dashboardId>` — e.g. `gex:default`, `nexus:default`.
 * FLOW keeps its original `flowdash:` prefix and localStorage keys so the
 * layouts saved before the framework existed still load.
 */
import type { DefaultLayout, ToolCategory } from './tool-def';
import { VIEW_ROWS, tilingIssues } from './layout';
import { FLOW_DEFAULTS } from './defs/flow';
import { GEX_DEFAULTS } from './defs/gex';
import { NEXUS_DEFAULTS } from './defs/nexus';
import { CHART_DEFAULTS } from './defs/chart';
import { CRYPTO_DEFAULTS } from './defs/crypto';
import { CATALYST_DEFAULTS } from './defs/catalyst';
import { LEAPS_DEFAULTS } from './defs/leaps';
import { BOT_DEFAULTS } from './defs/bot';
import { POSITIONS_DEFAULTS } from './defs/positions';
import { TODAY_DEFAULTS } from './defs/today';
import { JOURNAL_DEFAULTS } from './defs/journal';

export type PageId = 'flow' | 'gex' | 'nexus' | 'chart' | 'crypto' | 'catalyst' | 'leaps' | 'bot' | 'positions' | 'today' | 'journal';

export type PageMode = 'workspace' | 'fixed' | 'simple';

/** A workspace's Add-tool catalogue: whole categories plus named tools. */
export interface ToolCatalog {
  categories: ToolCategory[];
  tools: string[];
}

export interface PageSpec {
  id: PageId;
  /** workspace (GEX, FLOW) · fixed · simple — see the header comment */
  mode: PageMode;
  /** workspace only: the tools its "Add tool" menu offers */
  catalog?: ToolCatalog;
  /** eyebrow in the dashboard bar */
  label: string;
  storagePrefix: string;
  lsKey: string;
  lsActive: string;
  /** shipped layouts; the first is the page's default dashboard */
  defaults: DefaultLayout[];
  /** categories listed first in this page's "Add tool" menu */
  primary: ToolCategory[];
  /**
   * FLOW only: its pre-framework rows had random ids, so shipped defaults are
   * merged in only when the account has no rows at all (as before).
   */
  seedOnlyWhenEmpty?: boolean;
  /** tools offered as one-click adds when a dashboard is empty */
  starters: string[];
  /**
   * SIMPLE page: the page is ONE primary tool, full bleed — no grid, no tool
   * chrome (provenance moves to the page bar) — with an optional collapsible
   * right rail. (Its `defaults` are kept only for the loading skeleton and
   * the docs; they are never rendered as a grid.)
   */
  simple?: { tool: string; rail?: { tool: string; label: string } };
}

const spec = (id: PageId, label: string, defaults: DefaultLayout[], primary: ToolCategory[], starters: string[], mode: PageMode = 'fixed'): PageSpec => ({
  id, label, defaults, primary, starters, mode,
  storagePrefix: `${id}:`, lsKey: `qe-dash-${id}-v1`, lsActive: `qe-dash-${id}-active`,
});

/* ── workspace catalogues: only what belongs next to GEX / FLOW work ── */
/** Price charts that follow the focus ticker. */
const CHART_TOOLS = ['stock-chart', 'chart-lab-chart', 'chart-levels'];
/** Market context: regime, macro, rotation, index desk, tape, readouts. */
const MARKET_CONTEXT = [
  'nexus-context', 'market-pulse', 'market-session-brief', 'market-rotation', 'today-rotation', 'money-flow',
  'today-index-desk', 'today-week-map', 'today-tape', 'chart-readouts', 'chart-es-risk',
];
/** Compact flow read for the GEX workspace (the full flow tools live on FLOW). */
const FLOW_CONTEXT = ['flow-context'];
/** Compact GEX read for the FLOW workspace (the full GEX tools live on GEX). */
const GEX_CONTEXT = ['gex-levels', 'gex-regime'];

export const GEX_CATALOG: ToolCatalog = { categories: ['GEX'], tools: [...CHART_TOOLS, ...MARKET_CONTEXT, ...FLOW_CONTEXT] };
export const FLOW_CATALOG: ToolCatalog = { categories: ['Options', 'Dark Pool'], tools: [...CHART_TOOLS, ...MARKET_CONTEXT, ...GEX_CONTEXT] };

/** Is this tool in the workspace's catalogue? (A non-workspace page offers nothing.) */
export function inCatalog(p: PageSpec, tool: { id: string; category: ToolCategory }): boolean {
  if (p.mode !== 'workspace' || !p.catalog) return false;
  return p.catalog.categories.includes(tool.category) || p.catalog.tools.includes(tool.id);
}

export const PAGES: Record<PageId, PageSpec> = {
  flow: {
    // Shipped defaults (Market flow, Ticker flow) now always show, like every
    // other page: pre-framework random-id rows stay alongside as the user's own.
    id: 'flow', label: 'FLOW', mode: 'workspace', catalog: FLOW_CATALOG, defaults: FLOW_DEFAULTS, primary: ['Options', 'Dark Pool', 'Market'],
    storagePrefix: 'flowdash:', lsKey: 'qe-flowdash-v1', lsActive: 'qe-flowdash-active',
    starters: ['options-flow', 'net-flow-strike', 'flow-strike-expiry'],
  },
  gex: { ...spec('gex', 'GEX', GEX_DEFAULTS, ['GEX', 'Market'], ['gex-dealer-map', 'gex-levels', 'stock-chart'], 'workspace'), catalog: GEX_CATALOG },
  nexus: spec('nexus', 'NEXUS', NEXUS_DEFAULTS, ['Ideas', 'Market'], NEXUS_DEFAULTS[0]?.tools.slice(0, 2).map((t) => t[0]) ?? []),
  chart: { ...spec('chart', 'CHART', CHART_DEFAULTS, ['Market', 'Research'], ['stock-chart'], 'simple'), simple: { tool: 'stock-chart', rail: { tool: 'chart-watchlists', label: 'Watchlist' } } },
  crypto: spec('crypto', 'CRYPTO', CRYPTO_DEFAULTS, ['Crypto', 'Market'], CRYPTO_DEFAULTS[0]?.tools.slice(0, 2).map((t) => t[0]) ?? []),
  catalyst: spec('catalyst', 'CATALYST', CATALYST_DEFAULTS, ['Catalyst', 'Ideas'], CATALYST_DEFAULTS[0]?.tools.slice(0, 2).map((t) => t[0]) ?? []),
  leaps: { ...spec('leaps', 'LEAPS', LEAPS_DEFAULTS, ['Ideas', 'Research'], LEAPS_DEFAULTS[0]?.tools.slice(0, 2).map((t) => t[0]) ?? [], 'simple'), simple: { tool: 'leaps-classic' } },
  bot: spec('bot', 'BOT', BOT_DEFAULTS, ['Bot', 'Book'], BOT_DEFAULTS[0]?.tools.slice(0, 2).map((t) => t[0]) ?? []),
  positions: { ...spec('positions', 'POSITIONS', POSITIONS_DEFAULTS, ['Book', 'Bot'], POSITIONS_DEFAULTS[0]?.tools.slice(0, 2).map((t) => t[0]) ?? [], 'simple'), simple: { tool: 'positions-classic' } },
  journal: spec('journal', 'JOURNAL', JOURNAL_DEFAULTS, ['Journal'], ['journal-net-pnl', 'journal-equity', 'journal-calendar']),
  today: spec('today', 'TODAY', TODAY_DEFAULTS, ['Market', 'Ideas', 'Book'], TODAY_DEFAULTS[0]?.tools.slice(0, 2).map((t) => t[0]) ?? []),
};

/** Where a page's loading skeleton puts its tiles — the page's own default grid. */
export function skeletonTiles(page: PageId): Array<[number, number, number, number]> {
  const p = PAGES[page];
  if (p.mode === 'simple' && p.simple) return p.simple.rail ? [[0, 0, 9, VIEW_ROWS], [9, 0, 3, VIEW_ROWS]] : [[0, 0, 12, VIEW_ROWS]];
  return (p.defaults[0]?.tools ?? []).map(([, x, y, w, h]) => [x, y, w, h]);
}

// Every shipped default must tile COLS × VIEW_ROWS exactly (no holes, no overlaps).
if (import.meta.env?.DEV) {
  for (const p of Object.values(PAGES)) {
    for (const d of p.defaults) {
      const issues = tilingIssues(d.tools.map(([type, x, y, w, h]) => ({ type, x, y, w, h })));
      if (issues.length) console.warn(`[dashboard] ${p.id}:${d.id} default does not tile:`, issues);
    }
    if (p.mode === 'simple' && !p.simple) console.warn(`[dashboard] ${p.id} is mode 'simple' without a simple spec`);
    if (p.mode === 'workspace' && !p.catalog) console.warn(`[dashboard] workspace ${p.id} has no catalog`);
  }
}
