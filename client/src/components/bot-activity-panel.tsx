import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Bot, Activity, Zap, BarChart3, Sparkles, TrendingUp } from "lucide-react";

interface BotStatus {
  id: string;
  name: string;
  icon: React.ElementType;
  status: "scanning" | "analyzing" | "idle" | "found";
  progress: number;
  lastScan?: string;
  nextScan?: number; // seconds until next scan
  signalsFound?: number;
  color: string;
}

const MOCK_BOTS: BotStatus[] = [
  {
    id: "quant",
    name: "Quant Bot",
    icon: BarChart3,
    status: "scanning",
    progress: 47,
    lastScan: "12s ago",
    nextScan: 48,
    color: "text-purple-400",
  },
  {
    id: "flow",
    name: "Flow Bot",
    icon: Activity,
    status: "analyzing",
    progress: 72,
    lastScan: "8s ago",
    nextScan: 52,
    color: "text-cyan-400",
  },
  {
    id: "penny",
    name: "Penny Bot",
    icon: TrendingUp,
    status: "found",
    progress: 100,
    lastScan: "2m ago",
    nextScan: 180,
    signalsFound: 3,
    color: "text-emerald-400",
  },
  {
    id: "ai",
    name: "AI Bot",
    icon: Sparkles,
    status: "scanning",
    progress: 65,
    lastScan: "5s ago",
    nextScan: 35,
    color: "text-amber-400",
  },
];

export function BotActivityPanel() {
  const [bots, setBots] = useState<BotStatus[]>(MOCK_BOTS);

  // Simulate bot progress updates
  useEffect(() => {
    const interval = setInterval(() => {
      setBots((prevBots) =>
        prevBots.map((bot) => {
          // Simulate progress
          let newProgress = bot.progress;
          let newStatus = bot.status;

          if (bot.status === "scanning" || bot.status === "analyzing") {
            newProgress = Math.min(100, bot.progress + Math.random() * 15);

            if (newProgress >= 100) {
              newProgress = 0;
              newStatus = Math.random() > 0.7 ? "found" : "scanning";
            }
          } else if (bot.status === "found") {
            // Reset after found
            setTimeout(() => {
              newStatus = "scanning";
              newProgress = 0;
            }, 3000);
          }

          // Update nextScan countdown
          const newNextScan = bot.nextScan ? Math.max(0, bot.nextScan - 1) : 0;

          return {
            ...bot,
            progress: newProgress,
            status: newStatus,
            nextScan: newNextScan,
          };
        })
      );
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const getStatusText = (bot: BotStatus) => {
    switch (bot.status) {
      case "scanning":
        return "Scanning markets...";
      case "analyzing":
        return "Analyzing options";
      case "found":
        return `Found ${bot.signalsFound} signals!`;
      case "idle":
        return "Idle";
      default:
        return "Active";
    }
  };

  const getStatusColor = (status: BotStatus["status"]) => {
    switch (status) {
      case "scanning":
        return "bg-cyan-500/20 text-cyan-400 border-cyan-500/30";
      case "analyzing":
        return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      case "found":
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      default:
        return "bg-slate-500/20 text-slate-400 border-slate-500/30";
    }
  };

  return (
    <Card className="bg-gradient-to-br from-slate-900/90 to-slate-800/50 backdrop-blur-xl border-cyan-500/20">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
            <Bot className="h-4 w-4 text-cyan-400" />
          </div>
          <CardTitle className="text-base">AI Bots Working For You</CardTitle>
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="ml-auto"
          >
            <div className="h-2 w-2 rounded-full bg-green-500" />
          </motion.div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <AnimatePresence mode="wait">
          {bots.map((bot) => {
            const Icon = bot.icon;
            return (
              <motion.div
                key={bot.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <motion.div
                      animate={{
                        rotate: bot.status === "scanning" ? [0, 360] : 0,
                      }}
                      transition={{
                        duration: 2,
                        repeat: bot.status === "scanning" ? Infinity : 0,
                        ease: "linear",
                      }}
                    >
                      <Icon className={cn("h-4 w-4", bot.color)} />
                    </motion.div>
                    <span className="text-sm font-medium text-slate-200">
                      {bot.name}
                    </span>
                  </div>

                  <Badge
                    variant="outline"
                    className={cn("text-xs", getStatusColor(bot.status))}
                  >
                    {bot.status === "found" && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 0.5 }}
                      >
                        ⚡{" "}
                      </motion.span>
                    )}
                    {getStatusText(bot)}
                  </Badge>
                </div>

                {/* Progress bar */}
                <div className="relative h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <motion.div
                    animate={{ width: `${bot.progress}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className={cn(
                      "h-full rounded-full",
                      bot.status === "found"
                        ? "bg-emerald-500"
                        : bot.status === "analyzing"
                        ? "bg-purple-500"
                        : "bg-cyan-500"
                    )}
                  />

                  {/* Animated shimmer effect */}
                  {(bot.status === "scanning" || bot.status === "analyzing") && (
                    <motion.div
                      animate={{
                        x: ["-100%", "200%"],
                      }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                      className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                    />
                  )}
                </div>

                {/* Last scan / Next scan info */}
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Last: {bot.lastScan}</span>
                  {bot.nextScan !== undefined && (
                    <span>Next: {bot.nextScan}s</span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
