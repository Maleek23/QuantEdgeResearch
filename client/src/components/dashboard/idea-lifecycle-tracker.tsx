import { cn, safeToFixed, safeNumber } from "@/lib/utils";
import { Activity, Clock, CheckCircle2, XCircle, Circle } from "lucide-react";

type LifecycleStage = "new" | "active" | "resolved" | "expired";

interface TradeIdea {
  id: string;
  symbol: string;
  direction: "long" | "short";
  stage: LifecycleStage;
  entryPrice: number;
  currentPrice: number;
  createdAt: string;
  resolvedAt?: string;
  pnlPercent?: number;
}

interface IdeaLifecycleTrackerProps {
  ideas: TradeIdea[];
  className?: string;
}

export function IdeaLifecycleTracker({ ideas, className }: IdeaLifecycleTrackerProps) {
  const stageConfig = {
    new: {
      icon: Circle,
      color: "text-cyan-400",
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/30",
      label: "New",
    },
    active: {
      icon: Activity,
      color: "text-[var(--trade-neutral)]",
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
      label: "Active",
    },
    resolved: {
      icon: CheckCircle2,
      color: "text-[var(--trade-bullish)]",
      bg: "bg-[var(--trade-bullish)]/10",
      border: "border-green-500/30",
      label: "Resolved",
    },
    expired: {
      icon: XCircle,
      color: "text-muted-foreground",
      bg: "bg-muted-foreground/10",
      border: "border-muted-foreground/30",
      label: "Expired",
    },
  };

  const stageCounts = {
    new: ideas.filter((i) => i.stage === "new").length,
    active: ideas.filter((i) => i.stage === "active").length,
    resolved: ideas.filter((i) => i.stage === "resolved").length,
    expired: ideas.filter((i) => i.stage === "expired").length,
  };

  const recentIdeas = ideas.slice(0, 5);

  return (
    <div
      className={cn(
        "bg-card/60 backdrop-blur-2xl border border-border/30 rounded-lg p-4",
        className
      )}
    >
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-4 h-4 text-cyan-400" />
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          Idea Lifecycle
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-4">
        {(Object.keys(stageCounts) as LifecycleStage[]).map((stage) => {
          const config = stageConfig[stage];
          const Icon = config.icon;
          return (
            <div
              key={stage}
              className={cn(
                "p-2 rounded-lg border text-center",
                config.bg,
                config.border
              )}
            >
              <Icon className={cn("w-4 h-4 mx-auto mb-1", config.color)} />
              <span className="text-lg font-mono font-bold block">
                {stageCounts[stage]}
              </span>
              <span className="text-[10px] text-muted-foreground">{config.label}</span>
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        {recentIdeas.map((idea) => {
          const config = stageConfig[idea.stage];
          const Icon = config.icon;
          const safeEntry = safeNumber(idea.entryPrice, 1);
          const pnl = idea.pnlPercent ?? (safeEntry > 0 ? ((safeNumber(idea.currentPrice) - safeEntry) / safeEntry * 100) : 0);
          
          return (
            <div
              key={idea.id}
              className="flex items-center justify-between p-2 bg-muted/30 rounded hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Icon className={cn("w-3 h-3", config.color)} />
                <span className="font-mono text-sm font-medium text-foreground/90">
                  {idea.symbol}
                </span>
                <span
                  className={cn(
                    "text-[10px] uppercase px-1.5 py-0.5 rounded",
                    idea.direction === "long"
                      ? "bg-[var(--trade-bullish)]/20 text-[var(--trade-bullish)]"
                      : "bg-red-500/20 text-[var(--trade-bearish)]"
                  )}
                >
                  {idea.direction}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "text-xs font-mono tabular-nums",
                    pnl >= 0 ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]"
                  )}
                >
                  {pnl >= 0 ? "+" : ""}{safeToFixed(pnl, 2)}%
                </span>
                <span className="text-[10px] text-muted-foreground">{idea.createdAt}</span>
              </div>
            </div>
          );
        })}
      </div>

      {ideas.length === 0 && (
        <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
          <Activity className="w-8 h-8 mb-2 opacity-50" />
          <span className="text-sm">No active ideas</span>
        </div>
      )}
    </div>
  );
}
