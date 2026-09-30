/**
 * Waitlist Prompt Modal
 *
 * Shown to visitors when they try to access protected features.
 * Encourages signup with benefits list.
 */

import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, ArrowRight, Zap, TrendingUp, BarChart3 } from "lucide-react";
import { authHref } from "@/lib/return-to";

interface WaitlistPromptModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  /** Deep link to land on after sign-in / sign-up (sanitised again by the auth pages). */
  returnTo?: string | null;
}

export function WaitlistPromptModal({
  open,
  onClose,
  title = "Join the QuantEdge beta",
  description = "QuantEdge is a trading research terminal for stocks, options and crypto — every number carries its evidence and its record.",
  returnTo,
}: WaitlistPromptModalProps) {
  const [, setLocation] = useLocation();

  // Navigate straight to the auth page — NOT through onClose, which for the
  // route gate means "dismissed" (go home + reminder toast).
  const handleSignup = () => setLocation(authHref("/signup", returnTo));
  const handleLogin = () => setLocation(authHref("/login", returnTo));

  const benefits = [
    {
      icon: TrendingUp,
      title: "Dealer positioning",
      description: "GEX and VEX by strike, walls, zero-γ and the squeeze radar",
      color: "text-[var(--trade-bullish)]",
      bgColor: "bg-emerald-500/10",
    },
    {
      icon: Zap,
      title: "Options flow",
      description: "Sweeps, blocks, market tide and dark-pool levels, with source and age",
      color: "text-[var(--trade-neutral)]",
      bgColor: "bg-amber-500/10",
    },
    {
      icon: BarChart3,
      title: "Evidence-ranked setups",
      description: "NEXUS, the trading desk — plus Quantinum Bot, whose paper record is public",
      color: "text-sky-400",
      bgColor: "bg-sky-500/10",
    },
    {
      icon: Sparkles,
      title: "Your trading journal",
      description: "Broker import, insights and loss analysis on your own trades",
      color: "text-purple-400",
      bgColor: "bg-purple-500/10",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-sky-500/20 to-blue-500/20 flex items-center justify-center mb-4">
            <Sparkles className="h-8 w-8 text-sky-400" />
          </div>
          <DialogTitle className="text-2xl font-bold text-white">{title}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Benefits List */}
          <div className="space-y-3">
            {benefits.map((benefit) => (
              <div key={benefit.title} className="flex items-start gap-3">
                <div className={`rounded-full ${benefit.bgColor} p-2`}>
                  <benefit.icon className={`h-4 w-4 ${benefit.color}`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{benefit.title}</p>
                  <p className="text-xs text-muted-foreground">{benefit.description}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Beta Access Note */}
          <div className="bg-muted/50 rounded-lg p-3 border border-border/50">
            <div className="flex items-start gap-2">
              <Check className="h-4 w-4 text-[var(--trade-bullish)] mt-0.5 flex-shrink-0" />
              <p className="text-xs text-foreground/80">
                <span className="font-medium text-white">Invite-only beta.</span>{" "}
                Have an invite code? Create your account to open the terminal.
                No code yet? Join the waitlist on the same page.
              </p>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="space-y-3 pt-2">
            <Button
              className="w-full bg-gradient-to-r from-sky-500 to-blue-500 hover:from-sky-600 hover:to-blue-600 text-white font-medium"
              size="lg"
              onClick={handleSignup}
            >
              Join the beta
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Already have an account?{" "}
              <button
                className="text-sky-400 hover:text-sky-300 hover:underline transition-colors"
                onClick={handleLogin}
              >
                Log in
              </button>
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
