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

interface WaitlistPromptModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
}

export function WaitlistPromptModal({
  open,
  onClose,
  title = "Join the Waitlist",
  description = "Get access to QuantEdge's AI-powered trading research tools",
}: WaitlistPromptModalProps) {
  const [, setLocation] = useLocation();

  const handleSignup = () => {
    onClose();
    setLocation("/signup");
  };

  const handleLogin = () => {
    onClose();
    setLocation("/login");
  };

  const benefits = [
    {
      icon: TrendingUp,
      title: "Free Market Data",
      description: "Stock quotes, charts, news, and earnings calendar",
      color: "text-emerald-400",
      bgColor: "bg-emerald-500/10",
    },
    {
      icon: Zap,
      title: "Free AI Trials",
      description: "Try each AI feature once - summaries, sentiment, predictions",
      color: "text-amber-400",
      bgColor: "bg-amber-500/10",
    },
    {
      icon: BarChart3,
      title: "Save Your Watchlist",
      description: "Track your favorite stocks and set price alerts",
      color: "text-cyan-400",
      bgColor: "bg-cyan-500/10",
    },
    {
      icon: Sparkles,
      title: "Apply for Beta",
      description: "Get unlimited access to trade ideas, 6-engine analysis & more",
      color: "text-purple-400",
      bgColor: "bg-purple-500/10",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-slate-900 border-slate-700">
        <DialogHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center mb-4">
            <Sparkles className="h-8 w-8 text-cyan-400" />
          </div>
          <DialogTitle className="text-2xl font-bold text-white">{title}</DialogTitle>
          <DialogDescription className="text-slate-400">
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
                  <p className="text-xs text-slate-400">{benefit.description}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Beta Access Note */}
          <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
            <div className="flex items-start gap-2">
              <Check className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-slate-300">
                <span className="font-medium text-white">Free to browse!</span>{" "}
                Explore market data instantly. Sign up to save watchlists and
                try AI features. Apply for beta to unlock everything.
              </p>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="space-y-3 pt-2">
            <Button
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-medium"
              size="lg"
              onClick={handleSignup}
            >
              Create Free Account
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>

            <p className="text-xs text-center text-slate-500">
              Already have an account?{" "}
              <button
                className="text-cyan-400 hover:text-cyan-300 hover:underline transition-colors"
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
