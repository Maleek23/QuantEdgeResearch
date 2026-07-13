/**
 * QuantEdge canonical UI primitives.
 *
 * Import path: `@/components/ui/qe`
 *
 *   import { QECard, QEStat, QEPill, QEBar, QESection, QETabs, QEDrawer } from '@/components/ui/qe';
 *
 * These are the ONLY building blocks pages should compose. Every page is
 *   <QESection>
 *     <QECard>
 *       <QEStat /> + <QEBar /> + <QEPill />
 *     </QECard>
 *   </QESection>
 *
 * If you find yourself reaching for `bg-zinc-900/40 border border-zinc-800 rounded-lg`,
 * stop — use a primitive instead.
 */
export { QECard, type QECardProps, type QECardVariant } from './card';
export { QEStat, QEStatStrip, type QEStatProps, type QEStatTone, type QEStatSize } from './stat';
export { QEPill, type QEPillProps, type QEPillVariant } from './pill';
export { QEBar, type QEBarProps, type QEBarTone, type QEBarSize, type BarSegment } from './bar';
export { QESection, type QESectionProps } from './section';
export { QETabs, type QETabsProps, type QETabItem, type QETabsVariant, type QETabsSize } from './tabs';
export { QEDrawer, type QEDrawerProps } from './drawer';

// Numeric primitives — every number/percent/price/ticker goes through these.
export { Num, Pct, Price, Ticker, type NumProps, type PctProps, type PriceProps, type TickerProps, type NumTone, type PriceSize } from './num';

// Layout density (spacing axis) — provider + toggle, writes data-density to <html>.
export { DensityProvider, useDensity, QEDensityToggle, type LayoutDensity } from './density';

// Premium Glass — the platform design language. Frosted surfaces + cyan + glow.
export { GlassCard, GlassKpi, GlassSignal, FlowChip, GlassMicroLabel, glassSurface, glassMesh, type GlassSignalProps } from './glass';
