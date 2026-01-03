import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  label?: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  iconColor?: string;
  iconGradient?: string;
  actions?: React.ReactNode;
  className?: string;
  variant?: "default" | "minimal" | "gradient";
}

export function PageHeader({
  label,
  title,
  description,
  icon: Icon,
  iconColor = "text-cyan-400",
  iconGradient = "from-cyan-500/20 to-purple-500/20",
  actions,
  className,
  variant = "default",
}: PageHeaderProps) {
  if (variant === "minimal") {
    return (
      <div className={cn("flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4", className)}>
        <div>
          {label && (
            <p className="text-xs text-muted-foreground font-medium tracking-wide uppercase mb-1">
              {label}
            </p>
          )}
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-3" data-testid="text-page-title">
            {Icon && (
              <div className={cn(
                "h-10 w-10 rounded-lg border flex items-center justify-center",
                `bg-gradient-to-br ${iconGradient} border-cyan-500/30`
              )}>
                <Icon className={cn("h-5 w-5", iconColor)} />
              </div>
            )}
            {title}
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden rounded-xl glass-card p-6", className)}>
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-purple-500/10" />
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          {label && (
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
              {label}
            </p>
          )}
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-3" data-testid="text-page-title">
            {Icon && (
              <div className={cn(
                "h-10 w-10 rounded-lg border flex items-center justify-center",
                `bg-gradient-to-br ${iconGradient} border-cyan-500/30`
              )}>
                <Icon className={cn("h-5 w-5", iconColor)} />
              </div>
            )}
            {title}
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground mt-2">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

interface PageSectionProps {
  label?: string;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function PageSection({
  label,
  title,
  description,
  children,
  className,
}: PageSectionProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {(label || title) && (
        <div>
          {label && (
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
          )}
          {title && (
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          )}
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
