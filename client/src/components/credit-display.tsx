/**
 * Access Tier Display Component
 *
 * Shows user's access tier in the header.
 * - Beta users: Shows "Beta" badge with unlimited icon
 * - Waitlist users: Shows "Waitlist" badge
 * - Visitors: Hidden
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Infinity, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { WaitlistPopup } from "@/components/waitlist-popup";

interface CreditDisplayProps {
  compact?: boolean;
  className?: string;
}

export function CreditDisplay({ compact = false, className }: CreditDisplayProps) {
  const { isBeta, isFree, isAuthenticated, usedTrials } = useFeatureAccess();
  const [waitlistOpen, setWaitlistOpen] = useState(false);

  // Non-authenticated users don't see anything
  if (!isAuthenticated) return null;

  // Beta users see unlimited badge
  if (isBeta) {
    if (compact) {
      return (
        <Badge
          variant="outline"
          className={cn(
            "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-medium",
            className
          )}
        >
          <Infinity className="h-3 w-3 mr-1" />
          Beta
        </Badge>
      );
    }

    return (
      <Badge
        variant="outline"
        className={cn(
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 px-3 py-1",
          className
        )}
      >
        <Infinity className="h-3.5 w-3.5 mr-1.5" />
        <span className="font-medium">Full Access</span>
      </Badge>
    );
  }

  // Free users (logged in but not beta) see upgrade option
  if (isFree) {
    const trialsUsed = usedTrials.length;

    if (compact) {
      return (
        <>
          <Badge
            variant="outline"
            className={cn(
              "border-amber-500/30 bg-amber-500/10 text-amber-400 font-medium cursor-pointer hover:bg-amber-500/20 transition-colors",
              className
            )}
            onClick={() => setWaitlistOpen(true)}
          >
            <Sparkles className="h-3 w-3 mr-1" />
            Get Beta
          </Badge>
          <WaitlistPopup open={waitlistOpen} onOpenChange={setWaitlistOpen} />
        </>
      );
    }

    return (
      <>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "gap-2 hover:bg-amber-500/10 px-3 border border-amber-500/20",
            className
          )}
          onClick={() => setWaitlistOpen(true)}
        >
          <Sparkles className="h-4 w-4 text-amber-400" />
          <span className="text-amber-400 font-medium">Apply for Beta</span>
          {trialsUsed > 0 && (
            <span className="text-xs text-slate-400">
              ({trialsUsed} trial{trialsUsed > 1 ? "s" : ""} used)
            </span>
          )}
        </Button>
        <WaitlistPopup open={waitlistOpen} onOpenChange={setWaitlistOpen} />
      </>
    );
  }

  return null;
}
