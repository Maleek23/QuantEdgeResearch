import * as React from "react";
import { cn } from "@/lib/utils";
import { componentStyles } from "@/lib/design-tokens";

/**
 * QuantEdge Unified Panel System
 * ===============================
 * Replaces ALL card classes: terminal-card, glass-card, pro-card, quant-card, etc.
 *
 * Hierarchy:
 *   QEPanel          -- Standard card/section container
 *   QEPanelGlass     -- Elevated glass panel (nav, sidebar, modals)
 *   QEPanelNested    -- Inside another panel (nested surface)
 *   QEPanelInteractive -- Clickable/hoverable cards (watchlist items, etc.)
 *   QEPanelStat      -- Key metric display card
 *   QELayer          -- Dashed-border group container (Architecture Blueprint style)
 *
 * All panels support composable sub-components:
 *   <QEPanel>
 *     <QEPanelHeader>       -- title + optional actions row
 *     <QEPanelContent>      -- main body (auto-padded)
 *     <QEPanelFooter>       -- bottom actions
 *   </QEPanel>
 *
 * Usage:
 *   import { QEPanel, QEPanelHeader, QEPanelContent } from "@/components/ui/qe-panel";
 *
 *   <QEPanel>
 *     <QEPanelHeader title="Open Positions" badge="12" />
 *     <QEPanelContent>
 *       {children}
 *     </QEPanelContent>
 *   </QEPanel>
 */

// =============================================================================
// PANEL VARIANTS
// =============================================================================

type PanelVariant = "default" | "glass" | "nested" | "interactive" | "stat" | "layer";

const variantClasses: Record<PanelVariant, string> = {
  default: componentStyles.panel.default,
  glass: componentStyles.panel.glass,
  nested: componentStyles.panel.nested,
  interactive: componentStyles.panel.interactive,
  stat: componentStyles.panel.stat,
  layer: componentStyles.panel.layer,
};

// =============================================================================
// QEPanel -- Primary panel component
// =============================================================================

export interface QEPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Panel visual style */
  variant?: PanelVariant;
  /** Optional glow color on hover/active */
  glow?: "cyan" | "ai" | "bullish" | "bearish" | "gold" | "none";
  /** Compact padding (for data-dense layouts) */
  compact?: boolean;
  /** No padding at all */
  flush?: boolean;
}

const glowClasses = {
  cyan: "hover:shadow-[0_0_20px_rgba(0,212,255,0.15)]",
  ai: "hover:shadow-[0_0_20px_rgba(139,92,246,0.15)]",
  bullish: "hover:shadow-[0_0_15px_rgba(16,185,129,0.15)]",
  bearish: "hover:shadow-[0_0_15px_rgba(239,68,68,0.12)]",
  gold: "hover:shadow-[0_0_20px_rgba(245,158,11,0.12)]",
  none: "",
};

const QEPanel = React.forwardRef<HTMLDivElement, QEPanelProps>(
  ({ className, variant = "default", glow = "none", compact, flush, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        variantClasses[variant],
        glow !== "none" && glowClasses[glow],
        !flush && !compact && "p-4",
        compact && "p-2.5",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
QEPanel.displayName = "QEPanel";

// =============================================================================
// Convenience wrappers (thin aliases for common variants)
// =============================================================================

const QEPanelGlass = React.forwardRef<HTMLDivElement, Omit<QEPanelProps, "variant">>(
  (props, ref) => <QEPanel ref={ref} variant="glass" {...props} />
);
QEPanelGlass.displayName = "QEPanelGlass";

const QEPanelNested = React.forwardRef<HTMLDivElement, Omit<QEPanelProps, "variant">>(
  (props, ref) => <QEPanel ref={ref} variant="nested" {...props} />
);
QEPanelNested.displayName = "QEPanelNested";

const QEPanelInteractive = React.forwardRef<HTMLDivElement, Omit<QEPanelProps, "variant">>(
  (props, ref) => <QEPanel ref={ref} variant="interactive" glow="cyan" {...props} />
);
QEPanelInteractive.displayName = "QEPanelInteractive";

const QEPanelStat = React.forwardRef<HTMLDivElement, Omit<QEPanelProps, "variant">>(
  (props, ref) => <QEPanel ref={ref} variant="stat" {...props} />
);
QEPanelStat.displayName = "QEPanelStat";

const QELayer = React.forwardRef<HTMLDivElement, Omit<QEPanelProps, "variant">>(
  (props, ref) => <QEPanel ref={ref} variant="layer" {...props} />
);
QELayer.displayName = "QELayer";

// =============================================================================
// QEPanelHeader -- Title bar with optional marker, badge, and actions
// =============================================================================

export interface QEPanelHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Panel title */
  title?: string;
  /** Optional section marker (e.g., "01 // DATA FEED") */
  marker?: string;
  /** Optional subtitle/description */
  subtitle?: string;
  /** Badge content (count, status text) */
  badge?: React.ReactNode;
  /** Badge color */
  badgeColor?: "cyan" | "bullish" | "bearish" | "gold" | "ai" | "live";
  /** Right-aligned actions (buttons, toggles) */
  actions?: React.ReactNode;
  /** Icon to show before title */
  icon?: React.ReactNode;
  /** Compact header (less padding) */
  compact?: boolean;
}

const badgeColorClasses = {
  cyan: componentStyles.badge.cyan,
  bullish: componentStyles.badge.bullish,
  bearish: componentStyles.badge.bearish,
  gold: componentStyles.badge.gold,
  ai: componentStyles.badge.ai,
  live: componentStyles.badge.live,
};

const QEPanelHeader = React.forwardRef<HTMLDivElement, QEPanelHeaderProps>(
  ({ className, title, marker, subtitle, badge, badgeColor = "cyan", actions, icon, compact, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-center justify-between",
        compact ? "pb-2" : "pb-3",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && (
          <span className="flex-shrink-0 text-slate-400">{icon}</span>
        )}
        <div className="min-w-0">
          {marker && (
            <div className={componentStyles.text.sectionMarker}>{marker}</div>
          )}
          <div className="flex items-center gap-2">
            {title && (
              <h3 className="text-sm font-semibold text-white truncate font-display tracking-tight">
                {title}
              </h3>
            )}
            {badge && (
              <span className={badgeColorClasses[badgeColor]}>{badge}</span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          {actions}
        </div>
      )}
    </div>
  )
);
QEPanelHeader.displayName = "QEPanelHeader";

// =============================================================================
// QEPanelContent -- Main body area
// =============================================================================

export interface QEPanelContentProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Remove default spacing */
  flush?: boolean;
}

const QEPanelContent = React.forwardRef<HTMLDivElement, QEPanelContentProps>(
  ({ className, flush, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(!flush && "space-y-3", className)}
      {...props}
    />
  )
);
QEPanelContent.displayName = "QEPanelContent";

// =============================================================================
// QEPanelFooter -- Bottom actions bar
// =============================================================================

export interface QEPanelFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

const QEPanelFooter = React.forwardRef<HTMLDivElement, QEPanelFooterProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-center justify-between pt-3 mt-3 border-t border-white/[0.06]",
        className
      )}
      {...props}
    />
  )
);
QEPanelFooter.displayName = "QEPanelFooter";

// =============================================================================
// QEStatCard -- Pre-composed stat display card
// =============================================================================

export interface QEStatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon?: React.ReactNode;
  /** Use mono font for value (default: true) */
  mono?: boolean;
}

function QEStatCard({
  label,
  value,
  change,
  changeType,
  icon,
  mono = true,
  className,
  ...props
}: QEStatCardProps) {
  return (
    <QEPanelStat className={cn("flex items-start gap-3", className)} {...props}>
      {icon && (
        <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-slate-400 flex-shrink-0">
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <div className={componentStyles.text.statLabel}>{label}</div>
        <div className={cn(
          "text-xl font-bold text-white tracking-tight mt-0.5",
          mono && "font-mono"
        )}>
          {value}
        </div>
        {change && (
          <div className={cn(
            "text-xs font-medium mt-0.5",
            changeType === "positive" && "text-emerald-400",
            changeType === "negative" && "text-red-400",
            changeType === "neutral" && "text-slate-400"
          )}>
            {change}
          </div>
        )}
      </div>
    </QEPanelStat>
  );
}
QEStatCard.displayName = "QEStatCard";

// =============================================================================
// QEGradeDisplay -- Engine grade badge (S/A/B/C/D/F)
// =============================================================================

export type GradeLetter = "S" | "A" | "B" | "C" | "D" | "F";

export interface QEGradeDisplayProps extends React.HTMLAttributes<HTMLDivElement> {
  grade: GradeLetter;
  label?: string;
  size?: "sm" | "md";
}

function QEGradeDisplay({ grade, label, size = "sm", className, ...props }: QEGradeDisplayProps) {
  const sizeClasses = size === "md"
    ? "w-8 h-8 text-xs"
    : "w-6 h-6 text-[10px]";

  // Get base styles from component tokens but override size
  const baseGrade = componentStyles.grade[grade] || componentStyles.grade.B;

  return (
    <div className={cn("flex items-center gap-1.5", className)} {...props}>
      <div className={cn(
        "flex items-center justify-center font-bold rounded-sm",
        sizeClasses,
        grade === "S" && "bg-[#00d4ff]/20 border border-[#00d4ff]/40 text-[#00d4ff]",
        grade === "A" && "bg-emerald-500/20 border border-emerald-500/40 text-emerald-400",
        grade === "B" && "bg-white/[0.05] border border-white/[0.10] text-slate-400",
        grade === "C" && "bg-amber-500/10 border border-amber-500/30 text-amber-400",
        grade === "D" && "bg-red-500/10 border border-red-500/30 text-red-400",
        grade === "F" && "bg-red-500/20 border border-red-500/40 text-red-500",
      )}>
        {grade}
      </div>
      {label && (
        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">
          {label}
        </span>
      )}
    </div>
  );
}
QEGradeDisplay.displayName = "QEGradeDisplay";

// =============================================================================
// QEConfidenceBar -- Gradient progress bar for AI confidence
// =============================================================================

export interface QEConfidenceBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number; // 0-100
  showLabel?: boolean;
  size?: "sm" | "md";
}

function QEConfidenceBar({ value, showLabel, size = "sm", className, ...props }: QEConfidenceBarProps) {
  const clamped = Math.max(0, Math.min(100, value));

  const getGradient = () => {
    if (clamped >= 80) return "bg-gradient-to-r from-emerald-500 to-cyan-500";
    if (clamped >= 60) return "bg-gradient-to-r from-blue-500 to-violet-500";
    return "bg-gradient-to-r from-amber-500 to-red-500";
  };

  return (
    <div className={cn("flex items-center gap-2", className)} {...props}>
      <div className={cn(
        "w-full bg-white/[0.05] rounded-full overflow-hidden",
        size === "sm" ? "h-1.5" : "h-2.5",
      )}>
        <div
          className={cn("h-full rounded-full transition-all duration-500", getGradient())}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-[10px] font-bold font-mono text-slate-400 flex-shrink-0 w-8 text-right">
          {clamped}%
        </span>
      )}
    </div>
  );
}
QEConfidenceBar.displayName = "QEConfidenceBar";

// =============================================================================
// QEStatusDot -- Live/online/warning indicator
// =============================================================================

export interface QEStatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: "online" | "warning" | "error" | "live";
  label?: string;
}

function QEStatusDot({ status, label, className, ...props }: QEStatusDotProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} {...props}>
      <span className={componentStyles.status[status]} />
      {label && (
        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
          {label}
        </span>
      )}
    </span>
  );
}
QEStatusDot.displayName = "QEStatusDot";

// =============================================================================
// EXPORTS
// =============================================================================

export {
  QEPanel,
  QEPanelGlass,
  QEPanelNested,
  QEPanelInteractive,
  QEPanelStat,
  QELayer,
  QEPanelHeader,
  QEPanelContent,
  QEPanelFooter,
  QEStatCard,
  QEGradeDisplay,
  QEConfidenceBar,
  QEStatusDot,
};
