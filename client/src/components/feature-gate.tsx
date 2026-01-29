/**
 * Feature Gate Component
 *
 * Wraps content that may require authentication or beta access.
 *
 * Access Levels:
 * - FREE: Available to everyone
 * - FREE_TRIAL: One free use, then shows blurred preview
 * - BETA_ONLY: Shows blurred preview with "Apply for Beta" CTA
 *
 * Shows appropriate UI based on access:
 * - Free trial available: Shows content + banner "This is your free trial"
 * - Trial used / Beta only: Blurred preview with overlay
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { useFeatureAccess, FEATURES, type FeatureConfig } from "@/hooks/useFeatureAccess";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Lock,
  Sparkles,
  ArrowRight,
  Bot,
  TrendingUp,
  LineChart,
  Brain,
  Activity,
  Check,
  Zap,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WaitlistPopup } from "@/components/waitlist-popup";

interface FeatureGateProps {
  featureId: string;
  children: React.ReactNode;
  className?: string;
  /** Show a blurred preview when locked (default: true for beta features) */
  showBlurredPreview?: boolean;
  /** Custom locked state UI */
  lockedFallback?: React.ReactNode;
  /** Called when free trial is used */
  onTrialUsed?: () => void;
}

export function FeatureGate({
  featureId,
  children,
  className,
  showBlurredPreview = true,
  lockedFallback,
  onTrialUsed,
}: FeatureGateProps) {
  const { checkFeature, useFreeTrial } = useFeatureAccess();
  const [showModal, setShowModal] = useState(false);
  const [trialActivated, setTrialActivated] = useState(false);

  const access = checkFeature(featureId);
  const feature = access.feature || FEATURES[featureId];

  // Handle starting free trial
  const handleStartTrial = () => {
    useFreeTrial(featureId);
    setTrialActivated(true);
    onTrialUsed?.();
  };

  // If can access, render children
  // Also show if it's a free trial that hasn't been used yet
  if (access.canAccess) {
    // If this is a free trial feature, show a banner
    if (access.hasFreeTrial && !access.freeTrialUsed && !trialActivated) {
      return (
        <div className={className}>
          {/* Free Trial Banner */}
          <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              <span className="text-sm text-amber-200">
                <strong>Free Trial:</strong> Try this feature once for free
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
              onClick={handleStartTrial}
            >
              Start Trial
            </Button>
          </div>
          {/* Actual content (will be revealed after clicking Start Trial) */}
          <div className="opacity-50 pointer-events-none blur-sm">
            {children}
          </div>
        </div>
      );
    }

    // Full access or trial activated
    return <div className={className}>{children}</div>;
  }

  // === LOCKED STATE ===

  // Show blurred preview for beta-only or trial-used features
  if (access.showBlurred && showBlurredPreview) {
    return (
      <>
        <div className={cn("relative", className)}>
          {/* Blurred content */}
          <div className="blur-md pointer-events-none select-none">
            {children}
          </div>

          {/* Overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm rounded-lg">
            <div className="text-center p-6 max-w-sm">
              {/* Icon */}
              <div className="mx-auto w-14 h-14 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center mb-4 ring-2 ring-amber-500/20">
                <Lock className="h-7 w-7 text-amber-400" />
              </div>

              {/* Badge */}
              <Badge
                variant="outline"
                className={cn(
                  "mb-3",
                  access.freeTrialUsed
                    ? "border-purple-500/30 bg-purple-500/10 text-purple-400"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-400"
                )}
              >
                {access.freeTrialUsed ? (
                  <>
                    <Zap className="h-3 w-3 mr-1" />
                    Trial Used
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3 w-3 mr-1" />
                    Beta Feature
                  </>
                )}
              </Badge>

              {/* Title & Description */}
              <h3 className="text-lg font-semibold text-white mb-2">
                {feature?.name || "Premium Feature"}
              </h3>
              <p className="text-sm text-slate-400 mb-4">{access.lockMessage}</p>

              {/* CTA */}
              <Button
                className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white font-medium"
                onClick={() => setShowModal(true)}
              >
                Apply for Beta
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>

        <WaitlistPopup open={showModal} onOpenChange={setShowModal} />
      </>
    );
  }

  // Non-blurred locked state (requires auth)
  return (
    <>
      <div
        className={cn("relative cursor-pointer group", className)}
        onClick={() => setShowModal(true)}
      >
        {/* Content preview (greyed out) or fallback */}
        {lockedFallback || (
          <div className="opacity-40 pointer-events-none select-none filter grayscale">
            {children}
          </div>
        )}

        {/* Lock overlay on hover */}
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/90 rounded-full border border-slate-600/50">
            <Lock className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-medium text-white">
              {access.reason === "requires_auth" ? "Sign up to unlock" : "Beta feature"}
            </span>
          </div>
        </div>
      </div>

      {/* Join Modal */}
      <JoinBetaModal
        open={showModal}
        onClose={() => setShowModal(false)}
        feature={feature}
        requiresAuth={access.reason === "requires_auth"}
      />
    </>
  );
}

// Inline locked indicator for smaller elements
export function LockedBadge({
  featureId,
  className,
}: {
  featureId: string;
  className?: string;
}) {
  const { checkFeature } = useFeatureAccess();
  const [showModal, setShowModal] = useState(false);
  const access = checkFeature(featureId);
  const feature = access.feature || FEATURES[featureId];

  if (access.canAccess) return null;

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className={cn(
          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
          "bg-amber-500/10 text-amber-400 border border-amber-500/20",
          "hover:bg-amber-500/20 transition-colors",
          className
        )}
      >
        <Lock className="h-3 w-3" />
        Beta
      </button>

      <JoinBetaModal
        open={showModal}
        onClose={() => setShowModal(false)}
        feature={feature}
        requiresAuth={access.reason === "requires_auth"}
      />
    </>
  );
}

// Free Trial Badge - shows when feature has unused free trial
export function FreeTrialBadge({
  featureId,
  className,
}: {
  featureId: string;
  className?: string;
}) {
  const { checkFeature } = useFeatureAccess();
  const access = checkFeature(featureId);

  if (!access.hasFreeTrial || access.freeTrialUsed) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
        "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
        className
      )}
    >
      <Zap className="h-3 w-3" />
      Free Trial
    </span>
  );
}

// Join Beta Modal
function JoinBetaModal({
  open,
  onClose,
  feature,
  requiresAuth,
}: {
  open: boolean;
  onClose: () => void;
  feature: FeatureConfig | null;
  requiresAuth: boolean;
}) {
  const [, setLocation] = useLocation();

  const handleJoinBeta = () => {
    onClose();
    setLocation("/signup");
  };

  const handleLogin = () => {
    onClose();
    setLocation("/login");
  };

  // Get category icon
  const getCategoryIcon = () => {
    if (!feature) return Bot;
    switch (feature.category) {
      case "ai":
        return Brain;
      case "trading":
        return TrendingUp;
      case "data":
        return LineChart;
      default:
        return Activity;
    }
  };

  const CategoryIcon = getCategoryIcon();

  // Beta features to highlight
  const betaFeatures = [
    "AI-powered stock analysis",
    "6-engine convergence signals",
    "Real-time trade ideas",
    "Options flow & dark pool data",
    "Paper trading simulator",
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-slate-900 border-slate-700">
        <DialogHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center mb-4">
            <CategoryIcon className="h-8 w-8 text-cyan-400" />
          </div>
          <DialogTitle className="text-xl font-bold text-white">
            {feature?.name || "Premium Feature"}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {feature?.description || "This feature requires beta access"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* What's included in beta */}
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-medium text-white">Beta Access Includes:</span>
            </div>
            <ul className="space-y-2">
              {betaFeatures.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-slate-300">
                  <Check className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* CTA */}
          <div className="space-y-3">
            <Button
              className="w-full bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white font-medium"
              size="lg"
              onClick={handleJoinBeta}
            >
              {requiresAuth ? "Create Free Account" : "Apply for Beta Access"}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>

            {requiresAuth && (
              <p className="text-xs text-center text-slate-500">
                Already have an account?{" "}
                <button
                  className="text-cyan-400 hover:text-cyan-300 hover:underline"
                  onClick={handleLogin}
                >
                  Log in
                </button>
              </p>
            )}
          </div>

          {/* Note */}
          <p className="text-xs text-center text-slate-500">
            {requiresAuth
              ? "Sign up to get 10 free daily credits and try AI features."
              : "Beta spots are limited. We're reviewing applications daily."}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { JoinBetaModal };
