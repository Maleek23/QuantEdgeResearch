/**
 * THE GLOBAL TOOL REGISTRY — every tool any dashboard page can place.
 *
 * One registry for the whole platform (docs/IA_SYSTEM_DESIGN.md §2): a tool is
 * the single owner of one function; a page is just a default arrangement of
 * tools, and any tool can be added to any page. Each category's definitions
 * live in defs/<category>.ts; this file only assembles them.
 *
 * A tool WRAPS an existing component or endpoint wherever one exists. Tools
 * we have no data for (Option Chart, Dark Pool Alerts, Trade Terminal) are
 * deliberately NOT registered — an "Add tool" entry that opens an empty shell
 * would be a claim we can't back. See docs/TOOLS_MIGRATION.md.
 */
import { CATEGORY_ORDER, type ToolCategory, type ToolDef } from './tool-def';
import { FLOW_TOOLS } from './defs/flow';
import { GEX_TOOLS } from './defs/gex';
import { NEXUS_TOOLS } from './defs/nexus';
import { CHART_TOOLS } from './defs/chart';
import { CRYPTO_TOOLS } from './defs/crypto';
import { CATALYST_TOOLS } from './defs/catalyst';
import { LEAPS_TOOLS } from './defs/leaps';
import { BOT_TOOLS } from './defs/bot';
import { POSITIONS_TOOLS } from './defs/positions';
import { TODAY_TOOLS } from './defs/today';
import { MARKET_TOOLS } from './defs/market';

export type { ToolDef, ToolCategory, ToolNeed, DefaultLayout } from './tool-def';
export { CATEGORY_ORDER, lazyTool } from './tool-def';

export const TOOLS: ToolDef[] = [
  ...FLOW_TOOLS, ...GEX_TOOLS, ...NEXUS_TOOLS, ...CHART_TOOLS, ...CRYPTO_TOOLS,
  ...CATALYST_TOOLS, ...LEAPS_TOOLS, ...BOT_TOOLS, ...POSITIONS_TOOLS, ...TODAY_TOOLS, ...MARKET_TOOLS,
];

export const TOOL_BY_ID = new Map<string, ToolDef>(TOOLS.map((t) => [t.id, t]));

if (import.meta.env?.DEV && TOOL_BY_ID.size !== TOOLS.length) {
  const seen = new Set<string>();
  for (const t of TOOLS) { if (seen.has(t.id)) console.error(`[dashboard] duplicate tool id "${t.id}"`); seen.add(t.id); }
}

/** Categories that actually have tools, in menu order, the page's own first. */
export function categoriesFor(primary: ToolCategory[]): ToolCategory[] {
  const have = new Set(TOOLS.map((t) => t.category));
  const rest = CATEGORY_ORDER.filter((c) => !primary.includes(c));
  return [...primary, ...rest].filter((c) => have.has(c));
}
