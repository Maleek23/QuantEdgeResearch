import { motion } from "framer-motion";
import { Sparkles, Brain, Calculator, Activity, TrendingUp, CandlestickChart, Zap, CheckCircle2, AlertCircle } from "lucide-react";
import { useState } from "react";

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

const engines: Engine[] = [
  {
    id: "ml",
    name: "ML Engine",
    icon: Sparkles,
    color: "#ec4899",
    bgGradient: "from-pink-500/10 to-pink-600/5",
    score: 85,
    status: "active",
    recentSignals: 12,
    winRate: 67
  },
  {
    id: "ai",
    name: "AI Engine",
    icon: Brain,
    color: "#a855f7",
    bgGradient: "from-purple-500/10 to-purple-600/5",
    score: 92,
    status: "active",
    recentSignals: 8,
    winRate: 72
  },
  {
    id: "quant",
    name: "Quant Engine",
    icon: Calculator,
    color: "#3b82f6",
    bgGradient: "from-blue-500/10 to-blue-600/5",
    score: 78,
    status: "processing",
    recentSignals: 15,
    winRate: 64
  },
  {
    id: "flow",
    name: "Flow Engine",
    icon: Activity,
    color: "#06b6d4",
    bgGradient: "from-cyan-500/10 to-cyan-600/5",
    score: 88,
    status: "active",
    recentSignals: 6,
    winRate: 69
  },
  {
    id: "sentiment",
    name: "Sentiment Engine",
    icon: TrendingUp,
    color: "#f59e0b",
    bgGradient: "from-amber-500/10 to-amber-600/5",
    score: 73,
    status: "standby",
    recentSignals: 10,
    winRate: 58
  },
  {
    id: "technical",
    name: "Technical Engine",
    icon: CandlestickChart,
    color: "#10b981",
    bgGradient: "from-green-500/10 to-green-600/5",
    score: 81,
    status: "active",
    recentSignals: 14,
    winRate: 71
  }
];

export function EngineStatusGrid() {
  const [selectedEngine, setSelectedEngine] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold mb-1">Research Engines</h2>
          <p className="text-sm text-muted-foreground">Real-time analysis across 6 independent systems</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-muted-foreground">All Systems Operational</span>
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
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Status Indicator */}
              <div className="absolute top-3 right-3 flex items-center gap-1">
                {engine.status === "active" && (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                    <span className="text-[10px] text-green-400 font-medium">ACTIVE</span>
                  </>
                )}
                {engine.status === "processing" && (
                  <>
                    <Zap className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
                    <span className="text-[10px] text-amber-400 font-medium">PROCESSING</span>
                  </>
                )}
                {engine.status === "standby" && (
                  <>
                    <AlertCircle className="h-3.5 w-3.5 text-slate-500" />
                    <span className="text-[10px] text-slate-500 font-medium">STANDBY</span>
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
                      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
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
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Signals</p>
                    <p className="text-lg font-bold font-mono tabular-nums">{engine.recentSignals}</p>
                  </div>
                  <div className="glass-subtle rounded-lg p-2.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Win Rate</p>
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
                  <div className="mt-3 pt-3 border-t border-slate-800">
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
