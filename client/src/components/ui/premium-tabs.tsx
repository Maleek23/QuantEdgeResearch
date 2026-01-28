import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

/**
 * Premium Tabs Component
 * Clean, minimal tab navigation for the design system
 */

const PremiumTabs = TabsPrimitive.Root;

const PremiumTabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
    variant?: "default" | "pills" | "underline";
  }
>(({ className, variant = "default", ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex items-center gap-1",
      variant === "default" && "p-1 rounded-xl bg-slate-900/60 border border-slate-800/50",
      variant === "pills" && "gap-2",
      variant === "underline" && "border-b border-slate-800/50 gap-0",
      className
    )}
    {...props}
  />
));
PremiumTabsList.displayName = "PremiumTabsList";

const PremiumTabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
    variant?: "default" | "pills" | "underline";
    accentColor?: "teal" | "cyan" | "blue" | "purple" | "amber";
  }
>(({ className, variant = "default", accentColor = "teal", ...props }, ref) => {
  const accentClasses = {
    teal: "data-[state=active]:from-teal-600 data-[state=active]:to-cyan-600",
    cyan: "data-[state=active]:from-cyan-600 data-[state=active]:to-blue-600",
    blue: "data-[state=active]:from-blue-600 data-[state=active]:to-indigo-600",
    purple: "data-[state=active]:from-purple-600 data-[state=active]:to-pink-600",
    amber: "data-[state=active]:from-amber-600 data-[state=active]:to-orange-600",
  };

  const underlineAccent = {
    teal: "data-[state=active]:border-teal-500",
    cyan: "data-[state=active]:border-cyan-500",
    blue: "data-[state=active]:border-blue-500",
    purple: "data-[state=active]:border-purple-500",
    amber: "data-[state=active]:border-amber-500",
  };

  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
        variant === "default" && cn(
          "px-4 py-2 rounded-lg text-slate-400 data-[state=active]:bg-gradient-to-r data-[state=active]:text-white",
          accentClasses[accentColor]
        ),
        variant === "pills" && cn(
          "px-4 py-2 rounded-full text-slate-400 data-[state=active]:bg-gradient-to-r data-[state=active]:text-white",
          accentClasses[accentColor]
        ),
        variant === "underline" && cn(
          "px-4 py-3 text-slate-400 border-b-2 border-transparent -mb-px data-[state=active]:text-white",
          underlineAccent[accentColor]
        ),
        className
      )}
      {...props}
    />
  );
});
PremiumTabsTrigger.displayName = "PremiumTabsTrigger";

const PremiumTabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-4 focus-visible:outline-none",
      className
    )}
    {...props}
  />
));
PremiumTabsContent.displayName = "PremiumTabsContent";

export { PremiumTabs, PremiumTabsList, PremiumTabsTrigger, PremiumTabsContent };
