/**
 * THE TOOL CONTRACT — every tool on every dashboard page is one of these.
 *
 * A tool WRAPS an existing component or endpoint (reuse, don't rewrite). It
 * declares what it shows, in which units, from which source, how big it is by
 * default and at minimum, and what shared context it needs. The frame
 * (frame.tsx) prints title · source · age · units for every tool, so no tool
 * can ship without provenance.
 *
 * Kept separate from registry.ts so the per-category definition files
 * (defs/*.ts) can import it without a cycle.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/** "Add tool" menu groups, in menu order (a page lists its own first). */
export type ToolCategory =
  | 'Options' | 'GEX' | 'Market' | 'Dark Pool' | 'Ideas' | 'Research'
  | 'Book' | 'Bot' | 'Crypto' | 'Catalyst' | 'Journal';

export const CATEGORY_ORDER: ToolCategory[] = [
  'Options', 'GEX', 'Market', 'Dark Pool', 'Ideas', 'Research', 'Book', 'Bot', 'Crypto', 'Catalyst', 'Journal',
];

/**
 * Shared context a tool reads (never owns):
 *   symbol — the focused ticker (StockContext; the dashboard bar shows and
 *            changes it; a row click in any tool re-points it)
 */
export type ToolNeed = 'symbol';

export interface ToolDef {
  /** globally unique; persisted in saved layouts — never rename one */
  id: string;
  category: ToolCategory;
  title: string;
  /** one line: what this shows */
  what: string;
  units: string;
  /** data source as the operator should read it */
  source: string;
  /** the wrapped component / endpoint (migration doc + tooltip) */
  backing: string;
  /** the wrapped component already stamps an age on every row */
  ageInside?: boolean;
  needs?: ToolNeed[];
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  Component: LazyExoticComponent<ComponentType<any>>;
}

/** React.lazy on a NAMED export — each tool module loads only when placed + visible. */
export const lazyTool = <M extends Record<string, any>>(load: () => Promise<M>, name: keyof M & string) =>
  lazy(() => load().then((m) => ({ default: m[name] as ComponentType<any> })));

/** A page's shipped layout: [toolId, x, y, w, h] in 12-col grid cells. */
export interface DefaultLayout {
  /** stable id → persisted as `<page>:<id>` (e.g. gex:default) */
  id: string;
  name: string;
  tools: Array<[string, number, number, number, number]>;
}
