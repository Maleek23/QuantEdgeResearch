import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Page Container Component
 * Provides consistent page layouts with optional background effects
 */

interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Show subtle grid pattern overlay */
  showGrid?: boolean;
  /** Show gradient orbs */
  showOrbs?: boolean;
  /** Container width variant */
  width?: "default" | "narrow" | "wide" | "full";
  /** Padding variant */
  padding?: "none" | "sm" | "md" | "lg";
}

const widthClasses = {
  default: "max-w-7xl",
  narrow: "max-w-4xl",
  wide: "max-w-[1600px]",
  full: "max-w-full",
};

const paddingClasses = {
  none: "",
  sm: "px-4 py-4",
  md: "px-6 py-6",
  lg: "px-8 py-8",
};

export function PageContainer({
  children,
  className,
  showGrid = true,
  showOrbs = true,
  width = "wide",
  padding = "md",
  ...props
}: PageContainerProps) {
  return (
    <div className={cn("min-h-screen bg-[#0a0a0b] text-white relative", className)} {...props}>
      {/* Grid pattern overlay */}
      {showGrid && (
        <div
          className="fixed inset-0 z-0 opacity-[0.02] pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '60px 60px'
          }}
        />
      )}

      {/* Gradient orbs */}
      {showOrbs && (
        <>
          <div className="fixed top-0 right-0 w-[600px] h-[600px] bg-gradient-to-br from-teal-500/8 via-cyan-500/4 to-transparent rounded-full blur-3xl pointer-events-none" />
          <div className="fixed bottom-0 left-0 w-[500px] h-[500px] bg-gradient-to-tr from-blue-500/8 via-indigo-500/4 to-transparent rounded-full blur-3xl pointer-events-none" />
        </>
      )}

      {/* Content */}
      <div className={cn("relative z-10 mx-auto", widthClasses[width], paddingClasses[padding])}>
        {children}
      </div>
    </div>
  );
}

/**
 * Page Header Component
 * Consistent header styling for all pages
 */

interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  /** Gradient color for icon background */
  iconColor?: "teal" | "cyan" | "blue" | "purple" | "amber";
}

const iconColorClasses = {
  teal: "from-teal-500/20 to-cyan-500/20 border-teal-500/30",
  cyan: "from-cyan-500/20 to-blue-500/20 border-cyan-500/30",
  blue: "from-blue-500/20 to-indigo-500/20 border-blue-500/30",
  purple: "from-purple-500/20 to-pink-500/20 border-purple-500/30",
  amber: "from-amber-500/20 to-orange-500/20 border-amber-500/30",
};

export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  iconColor = "teal",
  className,
  ...props
}: PageHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between mb-6", className)} {...props}>
      <div className="flex items-center gap-4">
        {icon && (
          <div className={cn(
            "p-3 rounded-xl bg-gradient-to-br border",
            iconColorClasses[iconColor]
          )}>
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          {subtitle && (
            <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-3">
          {actions}
        </div>
      )}
    </div>
  );
}

/**
 * Section Component
 * For dividing page content into sections
 */

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
  ...props
}: SectionProps) {
  return (
    <section className={cn("mb-8", className)} {...props}>
      {(title || actions) && (
        <div className="flex items-center justify-between mb-4">
          <div>
            {title && <h2 className="text-lg font-semibold text-white">{title}</h2>}
            {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Stats Bar Component
 * Horizontal bar of key metrics
 */

interface StatItem {
  label: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon?: React.ReactNode;
}

interface StatsBarProps extends React.HTMLAttributes<HTMLDivElement> {
  stats: StatItem[];
}

export function StatsBar({ stats, className, ...props }: StatsBarProps) {
  return (
    <div
      className={cn(
        "grid gap-4 p-4 rounded-2xl bg-slate-900/60 border border-slate-800/50",
        className
      )}
      style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
      {...props}
    >
      {stats.map((stat, index) => (
        <div key={index} className="flex items-center gap-3">
          {stat.icon && (
            <div className="w-10 h-10 rounded-xl bg-slate-800/50 flex items-center justify-center text-slate-400">
              {stat.icon}
            </div>
          )}
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wide">{stat.label}</div>
            <div className="text-lg font-bold text-white">{stat.value}</div>
            {stat.change && (
              <div className={cn(
                "text-xs",
                stat.changeType === "positive" && "text-emerald-400",
                stat.changeType === "negative" && "text-red-400",
                stat.changeType === "neutral" && "text-slate-400"
              )}>
                {stat.change}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Empty State Component
 * For when there's no data to display
 */

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-8 text-center",
        className
      )}
      {...props}
    >
      {icon && (
        <div className="w-16 h-16 rounded-2xl bg-slate-800/50 flex items-center justify-center mb-4 text-slate-500">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-medium text-white mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-slate-400 max-w-md mb-4">{description}</p>
      )}
      {action}
    </div>
  );
}
