/**
 * The QuantEdge primitive layer — import from '@/components/lux'.
 *
 * New primitives live in this folder; where a qe-* primitive already did the
 * job it was UPGRADED to this look instead of duplicated, and is re-exported
 * here so there is one import path and one design system. Map and rules:
 * docs/LUX_PORT.md. Styles: ./lux.css (imported once in main.tsx).
 *
 * Portions adapted from the Trade Journal web app (MIT, Copyright (c) 2026
 * LuxAlgo Global, LLC) — see ./LICENSE-luxalgo.txt and each file's header.
 */
export { LuxSidebar, type LuxNavGroup, type LuxNavItem, type LuxIcon, type LuxSidebarProps } from './lux-sidebar';
export { LuxTopBar, type LuxTopBarProps } from './lux-topbar';
export { LuxSegmented, type LuxSegmentedOption } from './lux-segmented';
export { HoverHint, HelpHint } from './lux-tooltip';
export { LuxMenu, LuxMenuTrigger, LuxMenuContent, LuxMenuItem, LuxMenuLabel, LuxMenuSeparator } from './lux-menu';
export { LuxFilterBar, LuxFilterButton, LuxButton, LuxChip } from './lux-filter';
export { LuxTableWrap, LuxSortHead, nextSort, type LuxSortDir } from './lux-table';
export { LuxChartFrame, usePageReveal } from './lux-motion';
export {
  LuxPage, LuxPageHeader, LuxPanel, LuxKpiGrid, LuxKpi, LuxTag, LuxFootnote,
  LuxCard, LuxCardHeader, LuxCardTitle, LuxCardDescription, LuxCardContent, type LuxTone,
} from './lux-page';
export { useVizTokens, readVizTokens, vizTooltipStyle, type LuxVizTokens } from './lux-viz';

// Upgraded existing primitives — same components, lux look.
export { QETabs, type QETabItem, type QETabsProps } from '@/components/ui/qe-tabs';
export { QECard, QECardHeader, QECardTitle, QECardContent, type QECardVariant } from '@/components/ui/qe-card';
export { QEStat, QEStatStrip, type QEStatProps } from '@/components/ui/qe-stat';
export { QESection } from '@/components/ui/qe-section';
export { QEDrawer, type QEDrawerProps } from '@/components/ui/qe-drawer';
export { QELoading, QEError, QEEmpty } from '@/components/ui/qe-states';
export { QEPill } from '@/components/ui/qe-pill';
export { QEDensityToggle, useDensity } from '@/components/ui/qe-density';
