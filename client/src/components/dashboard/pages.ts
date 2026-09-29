/**
 * PAGES — every destination that is a dashboard, with its namespaced storage
 * and its shipped DEFAULT layout(s). A page owns no tools: it is a default
 * arrangement of registry tools, and the user can add any tool to it.
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

export interface PageSpec {
  id: PageId;
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
   * SIMPLE page: by default the page is ONE primary tool, full bleed — no
   * grid, no tool chrome (provenance moves to the page bar) — with an
   * optional collapsible right rail. "Customize" switches that viewer to the
   * page's dashboards (remembered per device); "Simple view" switches back.
   */
  simple?: { tool: string; rail?: { tool: string; label: string } };
}

const spec = (id: PageId, label: string, defaults: DefaultLayout[], primary: ToolCategory[], starters: string[]): PageSpec => ({
  id, label, defaults, primary, starters,
  storagePrefix: `${id}:`, lsKey: `qe-dash-${id}-v1`, lsActive: `qe-dash-${id}-active`,
});

export const PAGES: Record<PageId, PageSpec> = {
  flow: {
    // Shipped defaults (Market flow, Ticker flow) now always show, like every
    // other page: pre-framework random-id rows stay alongside as the user's own.
    id: 'flow', label: 'FLOW', defaults: FLOW_DEFAULTS, primary: ['Options', 'Dark Pool', 'Market'],
    storagePrefix: 'flowdash:', lsKey: 'qe-flowdash-v1', lsActive: 'qe-flowdash-active',
    starters: ['options-flow', 'net-flow-strike', 'flow-strike-expiry'],
  },
  gex: spec('gex', 'GEX', GEX_DEFAULTS, ['GEX', 'Market'], ['gex-dealer-map', 'gex-levels', 'stock-chart']),
  nexus: spec('nexus', 'NEXUS', NEXUS_DEFAULTS, ['Ideas', 'Market'], NEXUS_DEFAULTS[0]?.tools.slice(0, 2).map((t) => t[0]) ?? []),
  chart: { ...spec('chart', 'CHART', CHART_DEFAULTS, ['Market', 'Research'], ['stock-chart']), simple: { tool: 'stock-chart', rail: { tool: 'chart-watchlists', label: 'Watchlist' } } },
  crypto: spec('crypto', 'CRYPTO', CRYPTO_DEFAULTS, ['Crypto', 'Market'], CRYPTO_DEFAULTS[0]?.tools.slice(0, 2).map((t) => t[0]) ?? []),
  catalyst: spec('catalyst', 'CATALYST', CATALYST_DEFAULTS, ['Catalyst', 'Ideas'], CATALYST_DEFAULTS[0]?.tools.slice(0, 2).map((t) => t[0]) ?? []),
  leaps: { ...spec('leaps', 'LEAPS', LEAPS_DEFAULTS, ['Ideas', 'Research'], LEAPS_DEFAULTS[0]?.tools.slice(0, 2).map((t) => t[0]) ?? []), simple: { tool: 'leaps-classic' } },
  bot: spec('bot', 'BOT', BOT_DEFAULTS, ['Bot', 'Book'], BOT_DEFAULTS[0]?.tools.slice(0, 2).map((t) => t[0]) ?? []),
  positions: { ...spec('positions', 'POSITIONS', POSITIONS_DEFAULTS, ['Book', 'Bot'], POSITIONS_DEFAULTS[0]?.tools.slice(0, 2).map((t) => t[0]) ?? []), simple: { tool: 'positions-classic' } },
  journal: spec('journal', 'JOURNAL', JOURNAL_DEFAULTS, ['Journal'], ['journal-net-pnl', 'journal-equity', 'journal-calendar']),
  today: spec('today', 'TODAY', TODAY_DEFAULTS, ['Market', 'Ideas', 'Book'], TODAY_DEFAULTS[0]?.tools.slice(0, 2).map((t) => t[0]) ?? []),
};

export type ViewMode = 'simple' | 'dashboard';
export const viewModeKey = (page: PageId) => `qe-dash-${page}-view`;
/** A simple page's view for this device: 'simple' unless the viewer chose Customize. */
export function readViewMode(page: PageId): ViewMode {
  if (!PAGES[page].simple) return 'dashboard';
  try { return localStorage.getItem(viewModeKey(page)) === 'dashboard' ? 'dashboard' : 'simple'; } catch { return 'simple'; }
}

/** Where a page's loading skeleton puts its tiles — the page's own default grid. */
export function skeletonTiles(page: PageId, mode: ViewMode = readViewMode(page)): Array<[number, number, number, number]> {
  const p = PAGES[page];
  if (mode === 'simple' && p.simple) return p.simple.rail ? [[0, 0, 9, VIEW_ROWS], [9, 0, 3, VIEW_ROWS]] : [[0, 0, 12, VIEW_ROWS]];
  return (p.defaults[0]?.tools ?? []).map(([, x, y, w, h]) => [x, y, w, h]);
}

// Every shipped default must tile COLS × VIEW_ROWS exactly (no holes, no overlaps).
if (import.meta.env?.DEV) {
  for (const p of Object.values(PAGES)) {
    for (const d of p.defaults) {
      const issues = tilingIssues(d.tools.map(([type, x, y, w, h]) => ({ type, x, y, w, h })));
      if (issues.length) console.warn(`[dashboard] ${p.id}:${d.id} default does not tile:`, issues);
    }
  }
}
