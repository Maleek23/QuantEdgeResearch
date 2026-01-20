import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ActivityItem {
  id: string;
  type: "signal" | "win" | "loss";
  symbol: string;
  action: string;
  time: string;
  profit?: string;
}

const mockActivities: ActivityItem[] = [
  { id: "1", type: "win", symbol: "NVDA", action: "Options signal closed", time: "2m ago", profit: "+127%" },
  { id: "2", type: "signal", symbol: "TSLA", action: "Flow engine detected sweep", time: "5m ago" },
  { id: "3", type: "win", symbol: "SPY", action: "Quant signal closed", time: "8m ago", profit: "+43%" },
  { id: "4", type: "signal", symbol: "AAPL", action: "ML prediction generated", time: "12m ago" },
  { id: "5", type: "win", symbol: "AMD", action: "Swing trade closed", time: "15m ago", profit: "+89%" },
  { id: "6", type: "signal", symbol: "MSTR", action: "6-engine convergence", time: "18m ago" },
  { id: "7", type: "win", symbol: "PLTR", action: "Day trade closed", time: "22m ago", profit: "+52%" },
  { id: "8", type: "signal", symbol: "COIN", action: "Technical breakout detected", time: "25m ago" },
];

export function LiveActivityFeed() {
  const [activities, setActivities] = useState<ActivityItem[]>(mockActivities.slice(0, 3));
  const [currentIndex, setCurrentIndex] = useState(3);

  useEffect(() => {
    const interval = setInterval(() => {
      setActivities(prev => {
        const newActivity = mockActivities[currentIndex % mockActivities.length];
        const updated = [newActivity, ...prev.slice(0, 2)];
        return updated;
      });
      setCurrentIndex(prev => prev + 1);
    }, 4000);

    return () => clearInterval(interval);
  }, [currentIndex]);

  return (
    <div className="w-full max-w-md space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <div className="relative">
          <Activity className="h-4 w-4 text-cyan-400" />
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
        </div>
        <span className="text-xs font-mono uppercase tracking-wider text-cyan-400">Live Activity</span>
      </div>

      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {activities.map((activity) => (
            <motion.div
              key={activity.id}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="glass-card rounded-lg px-3 py-2.5 border border-slate-800/50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  {activity.type === "win" ? (
                    <div className="h-6 w-6 rounded bg-green-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <TrendingUp className="h-3.5 w-3.5 text-green-400" />
                    </div>
                  ) : activity.type === "loss" ? (
                    <div className="h-6 w-6 rounded bg-red-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                    </div>
                  ) : (
                    <div className="h-6 w-6 rounded bg-cyan-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Activity className="h-3.5 w-3.5 text-cyan-400" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-mono font-semibold text-foreground">{activity.symbol}</span>
                      {activity.profit && (
                        <span className="text-xs font-mono font-bold text-green-400">{activity.profit}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{activity.action}</p>
                  </div>
                </div>

                <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap">{activity.time}</span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="text-[10px] text-muted-foreground/60 text-center pt-1">
        Real-time platform activity
      </div>
    </div>
  );
}
