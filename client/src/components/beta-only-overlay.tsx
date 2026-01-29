/**
 * Beta Only Overlay
 *
 * Overlay shown on top of beta-only features for non-beta users.
 * Shows a lock icon with "Beta Feature" badge and apply CTA.
 * Also supports "Free Trial Used" variant for features that had a free trial.
 */

import { useLocation } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, Sparkles, ArrowRight, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { WaitlistPopup } from "@/components/waitlist-popup";

interface BetaOnlyOverlayProps {
  featureName?: string;
  description?: string;
  className?: string;
  variant?: "default" | "compact" | "inline";
  freeTrialUsed?: boolean; // True if this was a free trial feature that's now locked
}

export function BetaOnlyOverlay({
  featureName = "Feature",
  description = "This feature is only available to beta users",
  className,
  variant = "default",
  freeTrialUsed = false,
}: BetaOnlyOverlayProps) {
  const [, setLocation] = useLocation();
  const [waitlistOpen, setWaitlistOpen] = useState(false);

  const handleApply = () => {
    setWaitlistOpen(true);
  };

  const badgeText = freeTrialUsed ? "Trial Used" : "Beta Feature";
  const BadgeIcon = freeTrialUsed ? Zap : Sparkles;

  if (variant === "inline") {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20",
          className
        )}
      >
        <Lock className="h-3.5 w-3.5 text-amber-400" />
        <span className="text-xs font-medium text-amber-400">Beta Only</span>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "flex items-center justify-center gap-3 p-4 rounded-lg bg-slate-900/80 backdrop-blur-sm border border-slate-700/50",
          className
        )}
      >
        <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
          <Lock className="h-5 w-5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{featureName}</p>
          <p className="text-xs text-slate-400">Beta access required</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="border-amber-500/30 hover:bg-amber-500/10 flex-shrink-0"
          onClick={handleApply}
        >
          Apply
        </Button>
      </div>
    );
  }

  // Default variant - full overlay
  return (
    <div
      className={cn(
        "absolute inset-0 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm rounded-lg z-10",
        className
      )}
    >
      <div className="text-center p-6 max-w-sm">
        {/* Icon */}
        <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center mb-4 ring-2 ring-amber-500/20">
          <Lock className="h-8 w-8 text-amber-400" />
        </div>

        {/* Badge */}
        <Badge
          variant="outline"
          className={cn(
            "mb-3",
            freeTrialUsed
              ? "border-purple-500/30 bg-purple-500/10 text-purple-400"
              : "border-amber-500/30 bg-amber-500/10 text-amber-400"
          )}
        >
          <BadgeIcon className="h-3 w-3 mr-1" />
          {badgeText}
        </Badge>

        {/* Title */}
        <h3 className="text-lg font-semibold text-white mb-2">{featureName}</h3>

        {/* Description */}
        <p className="text-sm text-slate-400 mb-5">{description}</p>

        {/* CTA */}
        <Button
          className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-medium"
          onClick={handleApply}
        >
          Apply for Beta Access
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>

        {/* Note */}
        <p className="text-xs text-slate-500 mt-3">
          {freeTrialUsed
            ? "You've used your free trial. Apply for beta to continue."
            : "Beta spots are limited. Apply now to get early access."}
        </p>
      </div>

      {/* Waitlist Popup */}
      <WaitlistPopup open={waitlistOpen} onOpenChange={setWaitlistOpen} />
    </div>
  );
}

/**
 * Wrapper component that adds blur effect and overlay
 */
interface BetaOnlyWrapperProps {
  children: React.ReactNode;
  featureName?: string;
  description?: string;
  blurAmount?: "sm" | "md" | "lg";
  className?: string;
}

export function BetaOnlyWrapper({
  children,
  featureName,
  description,
  blurAmount = "md",
  className,
}: BetaOnlyWrapperProps) {
  const blurClasses = {
    sm: "blur-sm",
    md: "blur-md",
    lg: "blur-lg",
  };

  return (
    <div className={cn("relative", className)}>
      {/* Blurred content */}
      <div className={cn(blurClasses[blurAmount], "pointer-events-none select-none")}>
        {children}
      </div>

      {/* Overlay */}
      <BetaOnlyOverlay featureName={featureName} description={description} />
    </div>
  );
}
