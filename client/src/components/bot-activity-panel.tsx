import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Bot, Activity, Zap, BarChart3, Sparkles, TrendingUp, Brain, Target } from "lucide-react";

interface BotConfig {
  id: string;
  name: string;
  icon: React.ElementType;
  color: string;
  sources: string[]; // matching source names from trade ideas
}

interface BotStatus {
  id: string;
  name: string;
  icon: React.ElementType;
  status: "active" | "idle";
  recentIdeas: number;
  lastActivity?: string;
  color: string;
}

// Bot configuration mapping to trade idea sources
const BOT_CONFIGS: BotConfig[] = [
  {
    id: "quant",
    name: "Quant Bot",
    icon: BarChart3,
    color: "text-purple-400",
    sources: ["quant_signal", "bot_screener"],
  },
  {
    id: "flow",
    name: "Flow Bot",
    icon: Activity,
    color: "text-cyan-400",
    sources: ["options_flow", "whale_flow"],
  },
  {
    id: "ai",
    name: "AI Bot",
    icon: Brain,
    color: "text-amber-400",
    sources: ["ai_analysis", "sentiment"],
  },
  {
    id: "scanner",
    name: "Scanner Bot",
    icon: Target,
    color: "text-emerald-400",
    sources: ["market_scanner", "bullish_trend"],
  },
];

interface TradeIdea {
  source: string;
  createdAt: string;
}

export function BotActivityPanel() {
  const { data: ideasData } = useQuery<{ ideas: TradeIdea[] }>({
    queryKey: ["/api/trade-ideas?limit=50&status=active"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Calculate bot status from real trade ideas
  const botStatuses: BotStatus[] = BOT_CONFIGS.map((config) => {
    const recentIdeas = ideasData?.ideas?.filter((idea) =>
      config.sources.includes(idea.source)
    ) || [];

    const lastIdea = recentIdeas[0];
    const lastActivity = lastIdea
      ? formatTimeAgo(new Date(lastIdea.createdAt))
      : "No recent activity";

    return {
      id: config.id,
      name: config.name,
      icon: config.icon,
      color: config.color,
      status: recentIdeas.length > 0 ? "active" : "idle",
      recentIdeas: recentIdeas.length,
      lastActivity,
    };
  });

  const totalActive = botStatuses.filter((b) => b.status === "active").length;

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-cyan-400" />
            <CardTitle className="text-sm font-semibold text-slate-200">AI Bot Activity</CardTitle>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "text-xs",
              totalActive > 0
                ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                : "border-slate-700 text-slate-500"
            )}
          >
            {totalActive}/{BOT_CONFIGS.length} Active
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {botStatuses.map((bot) => {
          const Icon = bot.icon;
          return (
            <div
              key={bot.id}
              className="flex items-center justify-between py-2 border-b border-slate-800/50 last:border-0"
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-1.5 rounded",
                  bot.status === "active" ? "bg-slate-800" : "bg-slate-900"
                )}>
                  <Icon className={cn("h-4 w-4", bot.color)} />
                </div>
                <div>
                  <span className="text-sm font-medium text-slate-200">{bot.name}</span>
                  <p className="text-xs text-slate-500">{bot.lastActivity}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {bot.recentIdeas > 0 && (
                  <span className="text-xs text-slate-400">
                    {bot.recentIdeas} ideas
                  </span>
                )}
                <div className={cn(
                  "h-2 w-2 rounded-full",
                  bot.status === "active" ? "bg-emerald-400" : "bg-slate-600"
                )} />
              </div>
            </div>
          );
        })}

        {/* Summary */}
        <div className="pt-2 text-center">
          <p className="text-xs text-slate-500">
            {ideasData?.ideas?.length || 0} active trade ideas
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}
