import * as React from "react";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

/**
 * Premium Card Component
 * Part of QuantEdge Design System
 *
 * Variants:
 * - default: Standard card with subtle border
 * - glass: Frosted glass effect
 * - elevated: With shadow
 * - interactive: Hover effects
 * - feature: Large feature card with gradient
 * - glow: With accent glow on hover
 */

const cardVariants = cva(
  "relative overflow-hidden transition-all duration-200",
  {
    variants: {
      variant: {
        default: "rounded-2xl bg-slate-900/80 border border-slate-800/50 backdrop-blur-sm",
        glass: "rounded-2xl bg-slate-900/60 border border-slate-700/50 backdrop-blur-md",
        elevated: "rounded-2xl bg-slate-900/80 border border-slate-800/50 backdrop-blur-sm shadow-xl",
        interactive: "rounded-2xl bg-slate-900/80 border border-slate-800/50 backdrop-blur-sm hover:border-teal-500/30 cursor-pointer",
        feature: "rounded-3xl bg-gradient-to-br from-slate-900/80 to-slate-950/80 border border-slate-800/50 backdrop-blur-sm",
        glow: "rounded-2xl bg-slate-900/80 border border-slate-800/50 backdrop-blur-sm hover:border-teal-500/40 hover:shadow-[0_0_30px_rgba(20,184,166,0.1)]",
        ghost: "rounded-2xl bg-transparent border border-transparent hover:bg-slate-900/40 hover:border-slate-800/50",
      },
      padding: {
        none: "",
        sm: "p-4",
        md: "p-6",
        lg: "p-8",
      },
    },
    defaultVariants: {
      variant: "default",
      padding: "md",
    },
  }
);

export interface PremiumCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  /** Optional gradient accent on top border */
  accentBorder?: boolean;
  /** Glow color for hover effect */
  glowColor?: "teal" | "cyan" | "blue" | "purple" | "gold";
}

const PremiumCard = React.forwardRef<HTMLDivElement, PremiumCardProps>(
  ({ className, variant, padding, accentBorder, glowColor, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          cardVariants({ variant, padding }),
          accentBorder && "before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-teal-500 before:to-transparent",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
PremiumCard.displayName = "PremiumCard";

// Card Header
const PremiumCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center gap-3 mb-4", className)}
    {...props}
  />
));
PremiumCardHeader.displayName = "PremiumCardHeader";

// Card Icon Container
interface PremiumCardIconProps extends React.HTMLAttributes<HTMLDivElement> {
  color?: "teal" | "cyan" | "blue" | "purple" | "amber" | "emerald" | "rose";
}

const colorMap = {
  teal: "bg-teal-500/20 text-teal-400",
  cyan: "bg-cyan-500/20 text-cyan-400",
  blue: "bg-blue-500/20 text-blue-400",
  purple: "bg-purple-500/20 text-purple-400",
  amber: "bg-amber-500/20 text-amber-400",
  emerald: "bg-emerald-500/20 text-emerald-400",
  rose: "bg-rose-500/20 text-rose-400",
};

const PremiumCardIcon = React.forwardRef<HTMLDivElement, PremiumCardIconProps>(
  ({ className, color = "teal", children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
        colorMap[color],
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
PremiumCardIcon.displayName = "PremiumCardIcon";

// Card Title
const PremiumCardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("text-lg font-semibold text-white", className)}
    {...props}
  />
));
PremiumCardTitle.displayName = "PremiumCardTitle";

// Card Description
const PremiumCardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-slate-400", className)}
    {...props}
  />
));
PremiumCardDescription.displayName = "PremiumCardDescription";

// Card Content
const PremiumCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("", className)} {...props} />
));
PremiumCardContent.displayName = "PremiumCardContent";

// Card Footer
const PremiumCardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("mt-4 pt-4 border-t border-slate-800/50 flex items-center justify-between", className)}
    {...props}
  />
));
PremiumCardFooter.displayName = "PremiumCardFooter";

export {
  PremiumCard,
  PremiumCardHeader,
  PremiumCardIcon,
  PremiumCardTitle,
  PremiumCardDescription,
  PremiumCardContent,
  PremiumCardFooter,
};
