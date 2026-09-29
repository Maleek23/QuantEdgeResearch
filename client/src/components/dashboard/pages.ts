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

export type PageId = 'flow' | 'gex' | 'nexus' | 'chart' | 'crypto' | 'catalyst' | 'leaps' | 'bot' | 'positions' | 'today';

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
}

const spec = (id: PageId, label: string, defaults: DefaultLayout[], primary: ToolCategory[], starters: string[]): PageSpec => ({
  id, label, defaults, primary, starters,
  storagePrefix: `${id}:`, lsKey: `qe-dash-${id}-v1`, lsActive: `qe-dash-${id}-active`,
});

export const PAGES: Record<PageId, PageSpec> = {
  flow: {
    id: 'flow', label: 'FLOW', defaults: FLOW_DEFAULTS, primary: ['Options', 'Market', 'Dark Pool'],
    storagePrefix: 'flowdash:', lsKey: 'qe-flowdash-v1', lsActive: 'qe-flowdash-active', seedOnlyWhenEmpty: true,
    starters: ['options-flow', 'stock-chart'],
  },
  gex: spec('gex', 'GEX', GEX_DEFAULTS, ['GEX', 'Market'], ['gex-dealer-map', 'gex-levels', 'stock-chart']),
  nexus: spec('nexus', 'NEXUS', NEXUS_DEFAULTS, ['Ideas', 'Market'], NEXUS_DEFAULTS[0]?.tools.slice(0, 2).map((t) => t[0]) ?? []),
  chart: spec('chart', 'CHART', CHART_DEFAULTS, ['Market', 'Research'], ['stock-chart']),
  crypto: spec('crypto', 'CRYPTO', CRYPTO_DEFAULTS, ['Crypto', 'Market'], CRYPTO_DEFAULTS[0]?.tools.slice(0, 2).map((t) => t[0]) ?? []),
  catalyst: spec('catalyst', 'CATALYST', CATALYST_DEFAULTS, ['Catalyst', 'Ideas'], CATALYST_DEFAULTS[0]?.tools.slice(0, 2).map((t) => t[0]) ?? []),
  leaps: spec('leaps', 'LEAPS', LEAPS_DEFAULTS, ['Ideas', 'Research'], LEAPS_DEFAULTS[0]?.tools.slice(0, 2).map((t) => t[0]) ?? []),
  bot: spec('bot', 'BOT', BOT_DEFAULTS, ['Bot', 'Book'], BOT_DEFAULTS[0]?.tools.slice(0, 2).map((t) => t[0]) ?? []),
  positions: spec('positions', 'POSITIONS', POSITIONS_DEFAULTS, ['Book', 'Bot'], POSITIONS_DEFAULTS[0]?.tools.slice(0, 2).map((t) => t[0]) ?? []),
  today: spec('today', 'TODAY', TODAY_DEFAULTS, ['Market', 'Ideas', 'Book'], TODAY_DEFAULTS[0]?.tools.slice(0, 2).map((t) => t[0]) ?? []),
};
