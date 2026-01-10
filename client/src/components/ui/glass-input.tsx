import * as React from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

export interface GlassInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: "glass" | "solid";
  inputSize?: "sm" | "default" | "lg";
  font?: "default" | "mono";
  iconLeft?: LucideIcon;
  iconRight?: LucideIcon;
  rightIcon?: React.ReactNode;
  error?: string;
  hint?: string;
}

const GlassInput = React.forwardRef<HTMLInputElement, GlassInputProps>(
  ({ 
    className, 
    type, 
    variant = "glass",
    inputSize = "default",
    font = "default",
    iconLeft: IconLeft,
    iconRight: IconRight,
    rightIcon,
    error,
    hint,
    disabled,
    ...props 
  }, ref) => {
    const hasRightContent = IconRight || rightIcon;
    const sizeClasses = {
      sm: "min-h-8 text-xs py-1.5",
      default: "min-h-9 text-sm py-2",
      lg: "min-h-10 text-base py-2.5",
    };

    const variantClasses = {
      glass: "bg-slate-800/50 backdrop-blur-md border-slate-700/40 focus:border-cyan-500/60 focus:ring-cyan-500/20",
      solid: "bg-slate-800 border-slate-700 focus:border-cyan-500 focus:ring-cyan-500/30",
    };

    return (
      <div className="space-y-1">
        <div className="relative">
          {IconLeft && (
            <IconLeft className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          )}
          <input
            type={type}
            className={cn(
              "flex w-full rounded-lg border",
              "text-slate-200 placeholder:text-slate-500",
              "transition-colors duration-200",
              "focus:outline-none focus:ring-2 focus:ring-offset-0",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              variantClasses[variant],
              sizeClasses[inputSize],
              font === "mono" && "font-mono tabular-nums",
              IconLeft && "pl-10",
              hasRightContent && "pr-10",
              error && "border-red-500/60 focus:border-red-500 focus:ring-red-500/20",
              className
            )}
            ref={ref}
            disabled={disabled}
            {...props}
          />
          {IconRight && (
            <IconRight className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          )}
          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {rightIcon}
            </div>
          )}
        </div>
        {hint && !error && (
          <p className="text-xs text-slate-500">{hint}</p>
        )}
        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}
      </div>
    );
  }
);
GlassInput.displayName = "GlassInput";

export { GlassInput };
