import { cn, safeToFixed } from "@/lib/utils";
import { Bot, Play, Pause, AlertTriangle, CheckCircle2 } from "lucide-react";

type BotStatus = "running" | "paused" | "error" | "completed";

interface BotActivity {
  id: string;
  name: string;
  status: BotStatus;
  lastAction: string;
  lastActionTime: string;
  positionsOpen: number;
  todayPnl: number;
  todayTrades: number;
}

interface BotActivityMonitorProps {
  bots: BotActivity[];
  className?: string;
}

export function BotActivityMonitor({ bots, className }: BotActivityMonitorProps) {
  const statusConfig = {
    running: {
      icon: Play,
      color: "text-[var(--trade-bullish)]",
      bg: "bg-[var(--trade-bullish)]/20",
      label: "Running",
    },
    paused: {
      icon: Pause,
      color: "text-[var(--trade-neutral)]",
      bg: "bg-amber-500/20",
      label: "Paused",
    },
    error: {
      icon: AlertTriangle,
      color: "text-[var(--trade-bearish)]",
      bg: "bg-red-500/20",
      label: "Error",
    },
    completed: {
      icon: CheckCircle2,
      color: "text-muted-foreground",
      bg: "bg-muted-foreground/20",
      label: "Done",
    },
  };

  const runningBots = bots.filter((b) => b.status === "running").length;

  return (
    <div
      className={cn(
        "bg-card/60 backdrop-blur-2xl border border-border/30 rounded-lg p-4",
        className
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-cyan-400" />
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            Bot Activity
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div className={cn("w-2 h-2 rounded-full", runningBots > 0 ? "bg-[var(--trade-bullish)] animate-pulse" : "bg-muted-foreground")} />
          <span className="text-xs text-muted-foreground">{runningBots} active</span>
        </div>
      </div>

      <div className="space-y-3">
        {bots.map((bot) => {
          const config = statusConfig[bot.status];
          const Icon = config.icon;
          return (
            <div
              key={bot.id}
              className="p-3 bg-muted/40 rounded-lg hover:bg-muted/60 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-foreground/90">
                    {bot.name}
                  </span>
                  <span
                    className={cn(
                      "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded",
                      config.bg,
                      config.color
                    )}
                  >
                    <Icon className="w-3 h-3" />
                    {config.label}
                  </span>
                </div>
                <span
                  className={cn(
                    "text-sm font-mono tabular-nums font-medium",
                    bot.todayPnl >= 0 ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]"
                  )}
                >
                  {bot.todayPnl >= 0 ? "+" : ""}${safeToFixed(bot.todayPnl, 0, '0')}
                </span>
              </div>

              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{bot.lastAction}</span>
                <span>{bot.lastActionTime}</span>
              </div>

              <div className="flex items-center gap-4 mt-2 pt-2 border-t border-border/30">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">Positions:</span>
                  <span className="text-xs font-mono text-foreground/80">{bot.positionsOpen}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">Trades:</span>
                  <span className="text-xs font-mono text-foreground/80">{bot.todayTrades}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {bots.length === 0 && (
        <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
          <Bot className="w-8 h-8 mb-2 opacity-50" />
          <span className="text-sm">No bots configured</span>
        </div>
      )}
    </div>
  );
}
