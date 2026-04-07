import { motion } from "framer-motion";
import { Sparkles, Brain, Calculator, Activity, TrendingUp, CandlestickChart, Zap, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface Engine {
  id: string;
  name: string;
  icon: typeof Sparkles;
  color: string;
  bgGradient: string;
  score: number;
  status: "active" | "standby" | "processing";
  recentSignals: number;
  winRate: number;
}

// Engine configuration (static UI properties only)
const engineConfig: Omit<Engine, 'score' | 'status' | 'recentSignals' | 'winRate'>[] = [
  {
    id: "ai",
    name: "AI Engine",
    icon: Brain,
    color: "#a855f7",
    bgGradient: "from-purple-500/10 to-purple-600/5",
  },
  {
    id: "quant",
    name: "Quant Engine",
    icon: Calculator,
    color: "#3b82f6",
    bgGradient: "from-blue-500/10 to-blue-600/5",
  },
  {
    id: "flow",
    name: "Flow Engine",
    icon: Activity,
    color: "#06b6d4",
    bgGradient: "from-cyan-500/10 to-cyan-600/5",
  },
  {
    id: "hybrid",
    name: "Hybrid Engine",
    icon: Sparkles,
    color: "#ec4899",
    bgGradient: "from-pink-500/10 to-pink-600/5",
  },
  {
    id: "manual",
    name: "Manual Trades",
    icon: TrendingUp,
    color: "#f59e0b",
    bgGradient: "from-amber-500/10 to-amber-600/5",
  },
  {
    id: "lotto",
    name: "Lotto Plays",
    icon: CandlestickChart,
    color: "#10b981",
    bgGradient: "from-green-500/10 to-green-600/5",
  }
];

export function EngineStatusGrid() {
  const [selectedEngine, setSelectedEngine] = useState<string | null>(null);

  // Fetch REAL engine health data from API
  const { data: healthData, isLoading, error } = useQuery({
    queryKey: ['/api/engine-health'],
    queryFn: async () => {
      const response = await fetch('/api/engine-health');
      if (!response.ok) throw new Error('Failed to fetch engine health');
      return response.json();
    },
    refetchInterval: 60000, // Refresh every minute
    staleTime: 30000,
  });

  // Combine static config with real data
  const engines: Engine[] = engineConfig.map(config => {
    const engineData = healthData?.today?.[config.id];
    const weekData = healthData?.week?.[config.id];

    // Calculate status based on recent activity
    const recentSignals = engineData?.ideasGenerated || 0;
    const status: Engine['status'] =
      recentSignals > 5 ? 'active' :
      recentSignals > 0 ? 'processing' :
      'standby';

    // Use real win rate or show N/A
    const winRate = weekData?.winRate !== null && weekData?.winRate !== undefined
      ? Math.round(weekData.winRate)
      : 0;

    // Score based on win rate and confidence
    const score = engineData?.avgConfidenceScore !== null && engineData?.avgConfidenceScore !== undefined
      ? Math.round(engineData.avgConfidenceScore)
      : (winRate || 50);

    return {
      ...config,
      score,
      status,
      recentSignals,
      winRate,
    };
  });

  if (error) {
    return (
      <div className="p-8 text-center border rounded-lg bg-red-500/10 border-red-500/30">
        <AlertCircle className="h-8 w-8 text-[var(--trade-bearish)] mx-auto mb-2" />
        <p className="text-sm text-[var(--trade-bearish)]">Failed to load engine data</p>
        <p className="text-xs text-muted-foreground mt-1">Check server connection</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold mb-1">Research Engines</h2>
          <p className="text-sm text-muted-foreground">Loading real-time engine data...</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-48 rounded-xl bg-card/60 border border-border animate-pulse flex items-center justify-center">
              <Loader2 className="h-6 w-6 text-muted-foreground/70 animate-spin" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Count active engines
  const activeEngines = engines.filter(e => e.status === 'active').length;
  const totalEngines = engines.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold mb-1">Research Engines</h2>
          <p className="text-sm text-muted-foreground">Real-time analysis from database</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${activeEngines > 0 ? 'bg-[var(--trade-bullish)] animate-pulse' : 'bg-muted-foreground'}`} />
            <span className="text-muted-foreground">
              {activeEngines} of {totalEngines} Active
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {engines.map((engine, index) => {
          const Icon = engine.icon;
          const isSelected = selectedEngine === engine.id;

          return (
            <motion.div
              key={engine.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: 1.02 }}
              onClick={() => setSelectedEngine(isSelected ? null : engine.id)}
              className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${engine.bgGradient} border cursor-pointer transition-all ${
                isSelected
                  ? `border-[${engine.color}] shadow-lg`
                  : 'border-border hover:border-border'
              }`}
            >
              {/* Status Indicator */}
              <div className="absolute top-3 right-3 flex items-center gap-1">
                {engine.status === "active" && (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-[var(--trade-bullish)]" />
                    <span className="text-[10px] text-[var(--trade-bullish)] font-medium">ACTIVE</span>
                  </>
                )}
                {engine.status === "processing" && (
                  <>
                    <Zap className="h-3.5 w-3.5 text-[var(--trade-neutral)] animate-pulse" />
                    <span className="text-[10px] text-[var(--trade-neutral)] font-medium">PROCESSING</span>
                  </>
                )}
                {engine.status === "standby" && (
                  <>
                    <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground font-medium">STANDBY</span>
                  </>
                )}
              </div>

              <div className="p-5">
                {/* Icon & Name */}
                <div className="flex items-start gap-3 mb-4">
                  <div
                    className="h-12 w-12 rounded-xl flex items-center justify-center shadow-lg"
                    style={{
                      background: `linear-gradient(135deg, ${engine.color} 0%, ${engine.color}dd 100%)`,
                      boxShadow: `0 4px 12px ${engine.color}33`
                    }}
                  >
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1">{engine.name}</h3>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${engine.score}%` }}
                          transition={{ duration: 1, delay: index * 0.1 + 0.3 }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: engine.color }}
                        />
                      </div>
                      <span className="text-xs font-mono font-bold" style={{ color: engine.color }}>
                        {engine.score}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="glass-subtle rounded-lg p-2.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide tracking-wider mb-1">Signals</p>
                    <p className="text-lg font-bold font-mono tabular-nums">{engine.recentSignals}</p>
                  </div>
                  <div className="glass-subtle rounded-lg p-2.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide tracking-wider mb-1">Win Rate</p>
                    <p
                      className="text-lg font-bold font-mono tabular-nums"
                      style={{ color: engine.color }}
                    >
                      {engine.winRate}%
                    </p>
                  </div>
                </div>

                {/* Expanded Details */}
                <motion.div
                  initial={false}
                  animate={{
                    height: isSelected ? "auto" : 0,
                    opacity: isSelected ? 1 : 0
                  }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                      Last signal: 3m ago • Confidence: {engine.score}%
                    </p>
                  </div>
                </motion.div>
              </div>

              {/* Pulse Animation for Active */}
              {engine.status === "active" && (
                <motion.div
                  className="absolute inset-0 rounded-xl"
                  style={{
                    background: `radial-gradient(circle at 50% 50%, ${engine.color}15, transparent 70%)`
                  }}
                  animate={{
                    scale: [1, 1.05, 1],
                    opacity: [0.3, 0.6, 0.3]
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                />
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
