/**
 * Engine Verdict Panel
 * Clear verdict, recommendations, and risk factors
 */

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, safeToFixed, safeNumber } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Shield,
  AlertTriangle,
  Lightbulb,
  Zap
} from "lucide-react";

interface AIInsightsPanelProps {
  verdict: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  recommendation: {
    action: string;
    entry?: number;
    stop?: number;
    target?: number;
    riskReward?: number;
  };
  insights: string[];
  risks: string[];
  className?: string;
}

export function AIInsightsPanel({
  verdict,
  confidence,
  recommendation,
  insights,
  risks,
  className
}: AIInsightsPanelProps) {
  const getVerdictConfig = () => {
    switch (verdict) {
      case 'bullish':
        return {
          icon: TrendingUp,
          label: 'BULLISH',
          color: 'emerald',
          bg: 'from-emerald-900/20',
          border: 'border-emerald-500/20',
          textColor: 'text-[var(--trade-bullish)]'
        };
      case 'bearish':
        return {
          icon: TrendingDown,
          label: 'BEARISH',
          color: 'red',
          bg: 'from-red-900/20',
          border: 'border-red-500/20',
          textColor: 'text-[var(--trade-bearish)]'
        };
      default:
        return {
          icon: Minus,
          label: 'NEUTRAL',
          color: 'slate',
          bg: 'from-slate-900/20',
          border: 'border-muted-foreground/20',
          textColor: 'text-muted-foreground'
        };
    }
  };

  const config = getVerdictConfig();
  const VerdictIcon = config.icon;

  return (
    <Card className={cn("p-6 bg-gradient-to-br from-slate-900 to-slate-800 border-border", className)}>
      <div className="space-y-6">
        {/* Verdict Header */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-5 w-5 text-cyan-400" />
            <h3 className="text-lg font-bold text-foreground/95">Engine Verdict</h3>
          </div>

          <div className={cn("p-4 rounded-lg border", config.bg, config.border)}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-lg", `bg-${config.color}-500/20`)}>
                  <VerdictIcon className={cn("h-6 w-6", config.textColor)} />
                </div>
                <div>
                  <Badge variant="outline" className={cn("font-bold", config.textColor, `border-${config.color}-500/30`)}>
                    {config.label}
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-1">Signal Strength: {confidence}pts</p>
                </div>
              </div>

              <div className="text-right">
                <div className="w-16 h-16">
                  <svg className="transform -rotate-90 w-16 h-16">
                    <circle
                      cx="32"
                      cy="32"
                      r="28"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                      className="text-muted-foreground/60"
                    />
                    <circle
                      cx="32"
                      cy="32"
                      r="28"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                      strokeDasharray={`${2 * Math.PI * 28}`}
                      strokeDashoffset={`${2 * Math.PI * 28 * (1 - confidence / 100)}`}
                      className={config.textColor}
                      strokeLinecap="round"
                    />
                  </svg>
                  <p className="text-center -mt-14 text-sm font-bold text-foreground/90">{confidence}pts</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Trade Recommendation */}
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-cyan-400" />
            <h4 className="text-sm font-semibold text-foreground/80">Trade Setup</h4>
          </div>

          <p className="text-base font-semibold text-foreground/95 mb-4">{recommendation.action}</p>

          {(recommendation.entry || recommendation.stop || recommendation.target) && (
            <div className="grid grid-cols-2 gap-3">
              {recommendation.entry && (
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-1">Entry Zone</p>
                  <p className="text-lg font-bold font-mono text-cyan-400">${safeToFixed(recommendation.entry, 2)}</p>
                </div>
              )}
              {recommendation.stop && (
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-1">Stop Loss</p>
                  <p className="text-lg font-bold font-mono text-[var(--trade-bearish)]">${safeToFixed(recommendation.stop, 2)}</p>
                  {recommendation.entry && (
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      ({safeToFixed((safeNumber(recommendation.stop) - safeNumber(recommendation.entry)) / safeNumber(recommendation.entry, 1) * 100, 1)}%)
                    </p>
                  )}
                </div>
              )}
              {recommendation.target && (
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-1">Price Target</p>
                  <p className="text-lg font-bold font-mono text-[var(--trade-bullish)]">${safeToFixed(recommendation.target, 2)}</p>
                  {recommendation.entry && (
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      (+{safeToFixed((safeNumber(recommendation.target) - safeNumber(recommendation.entry)) / safeNumber(recommendation.entry, 1) * 100, 1)}%)
                    </p>
                  )}
                </div>
              )}
              {recommendation.riskReward && (
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-1">Risk/Reward</p>
                  <p className="text-lg font-bold font-mono text-purple-400">
                    1:{safeToFixed(recommendation.riskReward, 2)}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Key Insights */}
        {insights.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="h-4 w-4 text-[var(--trade-neutral)]" />
              <h4 className="text-sm font-semibold text-foreground/80">Key Insights</h4>
            </div>
            <div className="space-y-2">
              {insights.map((insight, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <span className="text-[var(--trade-bullish)] mt-0.5">•</span>
                  <p className="text-sm text-muted-foreground leading-relaxed">{insight}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Risk Factors */}
        {risks.length > 0 && (
          <div className="p-4 rounded-lg bg-red-950/10 border border-red-500/20">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-[var(--trade-bearish)]" />
              <h4 className="text-sm font-semibold text-[var(--trade-bearish)]">Risk Factors</h4>
            </div>
            <div className="space-y-2">
              {risks.map((risk, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <Shield className="h-3 w-3 text-[var(--trade-bearish)] mt-1 shrink-0" />
                  <p className="text-sm text-muted-foreground leading-relaxed">{risk}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
