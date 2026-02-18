import * as React from "react";
import { cn } from "@/lib/utils";
import { zIndex, backgrounds } from "@/lib/design-tokens";

/**
 * QuantEdge Page Shell
 * ====================
 * Unified layout wrapper for ALL pages. Replaces PageContainer + PageHeader.
 *
 * Features:
 *   - Consistent dark background (design token #0a0e17)
 *   - Optional terminal grid overlay (from templates)
 *   - Optional ambient glow orbs
 *   - Proper z-index layering
 *   - Safe area awareness for mobile
 *   - Accounts for glass header offset
 *
 * Usage:
 *   import { QEPageShell, QEPageHeader } from "@/components/ui/qe-page-shell";
 *
 *   <QEPageShell>
 *     <QEPageHeader title="Trade Desk" marker="01 // EXECUTION" />
 *     {children}
 *   </QEPageShell>
 */

// =============================================================================
// QEPageShell -- Full-page wrapper
// =============================================================================

export interface QEPageShellProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Container width constraint */
  width?: "narrow" | "default" | "wide" | "full";
  /** Padding size */
  padding?: "none" | "sm" | "md" | "lg";
  /** Show subtle grid background pattern */
  grid?: boolean | "subtle" | "cyan";
  /** Show ambient glow orbs in corners */
  orbs?: boolean;
  /** Custom top offset (e.g., for ticker strip + nav) */
  topOffset?: string;
  /** Scroll the inner content (default: true) */
  scrollable?: boolean;
}

const widthClasses = {
  narrow: "max-w-4xl",
  default: "max-w-7xl",
  wide: "max-w-[1600px]",
  full: "max-w-full",
};

const paddingClasses = {
  none: "",
  sm: "px-4 py-3 sm:px-5 sm:py-4",
  md: "px-4 py-4 sm:px-6 sm:py-6",
  lg: "px-6 py-6 sm:px-8 sm:py-8",
};

export function QEPageShell({
  children,
  className,
  width = "wide",
  padding = "md",
  grid = true,
  orbs = true,
  topOffset,
  scrollable = true,
  ...props
}: QEPageShellProps) {
  // Determine which grid pattern to use
  const gridVariant = grid === true ? "default" : grid === false ? null : grid;

  return (
    <div
      className={cn(
        "min-h-screen bg-[#0a0e17] text-white relative",
        scrollable && "overflow-y-auto",
        className
      )}
      style={topOffset ? { paddingTop: topOffset } : undefined}
      {...props}
    >
      {/* Terminal grid pattern overlay */}
      {gridVariant && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            zIndex: zIndex.behind,
            backgroundImage: gridVariant === "cyan"
              ? backgrounds.gridCyan.image
              : gridVariant === "subtle"
                ? backgrounds.gridSubtle.image
                : backgrounds.grid.image,
            backgroundSize: gridVariant === "cyan"
              ? backgrounds.gridCyan.size
              : gridVariant === "subtle"
                ? backgrounds.gridSubtle.size
                : backgrounds.grid.size,
          }}
          aria-hidden="true"
        />
      )}

      {/* Ambient glow orbs */}
      {orbs && (
        <>
          <div
            className="fixed top-0 right-0 w-[500px] h-[500px] rounded-full blur-3xl pointer-events-none opacity-40"
            style={{
              zIndex: zIndex.behind,
              background: `radial-gradient(ellipse at center, rgba(0, 212, 255, 0.06), transparent 70%)`,
            }}
            aria-hidden="true"
          />
          <div
            className="fixed bottom-0 left-0 w-[400px] h-[400px] rounded-full blur-3xl pointer-events-none opacity-30"
            style={{
              zIndex: zIndex.behind,
              background: `radial-gradient(ellipse at center, rgba(59, 130, 246, 0.05), transparent 70%)`,
            }}
            aria-hidden="true"
          />
        </>
      )}

      {/* Content container */}
      <div
        className={cn(
          "relative mx-auto",
          widthClasses[width],
          paddingClasses[padding],
        )}
        style={{ zIndex: zIndex.base }}
      >
        {children}
      </div>
    </div>
  );
}

// =============================================================================
// QEPageHeader -- Unified page title/header bar
// =============================================================================

export interface QEPageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Page title */
  title: string;
  /** Section marker -- "01 // INGESTION LAYER" style */
  marker?: string;
  /** Subtitle / description */
  subtitle?: string;
  /** Icon element (Lucide, etc.) */
  icon?: React.ReactNode;
  /** Gradient accent for icon container */
  iconAccent?: "cyan" | "ai" | "gold" | "bullish" | "bearish";
  /** Right-aligned actions */
  actions?: React.ReactNode;
  /** Compact mode (less vertical space) */
  compact?: boolean;
}

const iconAccentClasses = {
  cyan: "from-[#00d4ff]/15 to-blue-500/15 border-[#00d4ff]/25",
  ai: "from-violet-500/15 to-cyan-500/15 border-violet-500/25",
  gold: "from-amber-500/15 to-orange-500/15 border-amber-500/25",
  bullish: "from-emerald-500/15 to-cyan-500/15 border-emerald-500/25",
  bearish: "from-red-500/15 to-pink-500/15 border-red-500/25",
};

export function QEPageHeader({
  title,
  marker,
  subtitle,
  icon,
  iconAccent = "cyan",
  actions,
  compact,
  className,
  ...props
}: QEPageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-center justify-between gap-3",
        compact ? "mb-4" : "mb-6",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <div
            className={cn(
              "p-2.5 rounded-xl bg-gradient-to-br border flex-shrink-0",
              iconAccentClasses[iconAccent]
            )}
          >
            {icon}
          </div>
        )}
        <div className="min-w-0">
          {marker && (
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 font-mono mb-0.5">
              {marker}
            </div>
          )}
          <h1 className="text-xl sm:text-2xl font-bold text-white font-display tracking-tight truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// QESectionDivider -- Labeled horizontal rule between sections
// =============================================================================

export interface QESectionDividerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Section label */
  label?: string;
  /** Marker number (e.g., "02") */
  number?: string;
}

export function QESectionDivider({
  label,
  number,
  className,
  ...props
}: QESectionDividerProps) {
  if (!label && !number) {
    return (
      <hr className={cn("border-white/[0.06] my-6", className)} {...props} />
    );
  }

  return (
    <div className={cn("flex items-center gap-3 my-6", className)} {...props}>
      <div className="h-px flex-1 bg-white/[0.06]" />
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 font-mono flex-shrink-0">
        {number && `${number} // `}{label}
      </span>
      <div className="h-px flex-1 bg-white/[0.06]" />
    </div>
  );
}

// =============================================================================
// QEGridLayout -- Simple responsive grid for cards
// =============================================================================

export interface QEGridLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Number of columns at different breakpoints */
  cols?: 1 | 2 | 3 | 4 | 5 | 6;
  /** Gap size */
  gap?: "sm" | "md" | "lg";
}

const colClasses = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
  6: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
};

const gapClasses = {
  sm: "gap-2",
  md: "gap-3",
  lg: "gap-4",
};

export function QEGridLayout({
  cols = 3,
  gap = "md",
  className,
  children,
  ...props
}: QEGridLayoutProps) {
  return (
    <div
      className={cn("grid", colClasses[cols], gapClasses[gap], className)}
      {...props}
    >
      {children}
    </div>
  );
}

// =============================================================================
// QEEmptyState -- Placeholder when there's no data
// =============================================================================

export interface QEEmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function QEEmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: QEEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-8 text-center",
        className
      )}
      {...props}
    >
      {icon && (
        <div className="w-14 h-14 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4 text-slate-500">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-white mb-1.5 font-display">{title}</h3>
      {description && (
        <p className="text-sm text-slate-400 max-w-sm mb-4">{description}</p>
      )}
      {action}
    </div>
  );
}
