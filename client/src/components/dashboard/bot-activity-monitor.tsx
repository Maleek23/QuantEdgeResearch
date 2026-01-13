import { cn } from "@/lib/utils";
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
      color: "text-green-400",
      bg: "bg-green-500/20",
      label: "Running",
    },
    paused: {
      icon: Pause,
      color: "text-amber-400",
      bg: "bg-amber-500/20",
      label: "Paused",
    },
    error: {
      icon: AlertTriangle,
      color: "text-red-400",
      bg: "bg-red-500/20",
      label: "Error",
    },
    completed: {
      icon: CheckCircle2,
      color: "text-slate-400",
      bg: "bg-slate-500/20",
      label: "Done",
    },
  };

  const runningBots = bots.filter((b) => b.status === "running").length;

  return (
    <div
      className={cn(
        "bg-slate-900/60 backdrop-blur-2xl border border-slate-700/30 rounded-lg p-4",
        className
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-cyan-400" />
          <span className="text-xs uppercase tracking-widest text-slate-400">
            Bot Activity
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div className={cn("w-2 h-2 rounded-full", runningBots > 0 ? "bg-green-400 animate-pulse" : "bg-slate-500")} />
          <span className="text-xs text-slate-400">{runningBots} active</span>
        </div>
      </div>

      <div className="space-y-3">
        {bots.map((bot) => {
          const config = statusConfig[bot.status];
          const Icon = config.icon;
          return (
            <div
              key={bot.id}
              className="p-3 bg-slate-800/40 rounded-lg hover:bg-slate-800/60 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-slate-200">
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
                    bot.todayPnl >= 0 ? "text-green-400" : "text-red-400"
                  )}
                >
                  {bot.todayPnl >= 0 ? "+" : ""}${bot.todayPnl.toFixed(0)}
                </span>
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>{bot.lastAction}</span>
                <span>{bot.lastActionTime}</span>
              </div>

              <div className="flex items-center gap-4 mt-2 pt-2 border-t border-slate-700/30">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-400">Positions:</span>
                  <span className="text-xs font-mono text-slate-300">{bot.positionsOpen}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-400">Trades:</span>
                  <span className="text-xs font-mono text-slate-300">{bot.todayTrades}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {bots.length === 0 && (
        <div className="flex flex-col items-center justify-center py-6 text-slate-500">
          <Bot className="w-8 h-8 mb-2 opacity-50" />
          <span className="text-sm">No bots configured</span>
        </div>
      )}
    </div>
  );
}
