import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Zap, TrendingUp, Activity, Target, Brain, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { EngineStatusGrid } from "@/components/dashboard/engine-status-grid";
import { InteractivePerformanceChart } from "@/components/dashboard/interactive-performance-chart";
import { InteractiveSparkline } from "@/components/dashboard/interactive-sparkline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface QuickAction {
  title: string;
  description: string;
  icon: typeof Zap;
  color: string;
  href: string;
}

const quickActions: QuickAction[] = [
  {
    title: "Find Trades",
    description: "AI-powered setups ready now",
    icon: Brain,
    color: "#a855f7",
    href: "/trade-desk"
  },
  {
    title: "Scan Market",
    description: "Real-time technical signals",
    icon: Activity,
    color: "#06b6d4",
    href: "/market-scanner"
  },
  {
    title: "Analyze Chart",
    description: "Deep technical analysis",
    icon: Target,
    color: "#10b981",
    href: "/chart-analysis"
  }
];

// Mock performance data - replace with real API
const mockPerformanceData = [
  { date: "Jan 1", winRate: 55, profit: 1200, trades: 8 },
  { date: "Jan 5", winRate: 62, profit: 1850, trades: 12 },
  { date: "Jan 10", winRate: 58, profit: 1450, trades: 10 },
  { date: "Jan 15", winRate: 71, profit: 2900, trades: 14 },
  { date: "Jan 20", winRate: 65, profit: 2200, trades: 11 },
  { date: "Jan 25", winRate: 69, profit: 2650, trades: 13 },
  { date: "Jan 30", winRate: 73, profit: 3100, trades: 15 },
];

export default function CommandCenterV2() {
  const [, setLocation] = useLocation();

  // Fetch active ideas
  const { data: activeIdeas, isLoading: ideasLoading } = useQuery({
    queryKey: ["/api/setup-ideas"],
    refetchInterval: 30000,
  });

  // Fetch recent performance
  const { data: perfStats } = useQuery({
    queryKey: ["/api/performance/stats"],
  });

  const openIdeas = activeIdeas?.filter((idea: any) => idea.status === "open") || [];
  const recentIdeas = openIdeas.slice(0, 5);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Hero Section - Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <div>
            <h1 className="text-3xl font-bold mb-2">Command Center</h1>
            <p className="text-muted-foreground">Your trading hub. All systems synchronized.</p>
          </div>

          {/* Quick Action Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {quickActions.map((action, index) => {
              const Icon = action.icon;
              return (
                <motion.button
                  key={action.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setLocation(action.href)}
                  className="group relative overflow-hidden rounded-xl glass-card border border-slate-800 hover:border-slate-700 p-5 text-left transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className="h-12 w-12 rounded-xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-110"
                      style={{
                        background: `linear-gradient(135deg, ${action.color} 0%, ${action.color}dd 100%)`,
                        boxShadow: `0 4px 12px ${action.color}33`
                      }}
                    >
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                  <h3 className="font-semibold mb-1 group-hover:text-cyan-400 transition-colors">{action.title}</h3>
                  <p className="text-sm text-muted-foreground">{action.description}</p>
                </motion.button>
              );
            })}
          </div>
        </motion.div>

        {/* Engine Status Grid */}
        <EngineStatusGrid />

        {/* Performance Chart & Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <InteractivePerformanceChart
              data={mockPerformanceData}
              title="30-Day Performance"
              timeframe="30D"
            />
          </div>

          {/* Quick Stats */}
          <div className="space-y-4">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="glass-card rounded-xl p-5 border border-slate-800"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Active Positions</h3>
                <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30">
                  {openIdeas.length} Open
                </Badge>
              </div>

              <div className="space-y-3">
                {ideasLoading ? (
                  <>
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </>
                ) : recentIdeas.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground mb-3">No active positions</p>
                    <Button
                      size="sm"
                      onClick={() => setLocation("/trade-desk")}
                      className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Find Trades
                    </Button>
                  </div>
                ) : (
                  recentIdeas.map((idea: any) => (
                    <button
                      key={idea.id}
                      onClick={() => setLocation("/trade-desk")}
                      className="w-full glass-subtle rounded-lg p-3 hover:bg-slate-800/50 transition-colors text-left group"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono font-semibold">{idea.symbol}</span>
                        <Badge
                          className={`text-xs ${
                            idea.assetType === "stock"
                              ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                              : idea.assetType === "option"
                              ? "bg-purple-500/10 text-purple-400 border-purple-500/30"
                              : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                          }`}
                        >
                          {idea.assetType}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          {idea.expiryDate ? `Expires ${new Date(idea.expiryDate).toLocaleDateString()}` : 'Active'}
                        </span>
                        <span className="font-mono text-cyan-400 group-hover:text-cyan-300">
                          View →
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.div>

            {/* Win Rate Card */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="glass-card rounded-xl p-5 border border-slate-800"
            >
              <h3 className="font-semibold mb-4">Today's Win Rate</h3>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-4xl font-bold font-mono tabular-nums text-cyan-400">
                  {perfStats?.overall?.winRate?.toFixed(0) || "—"}%
                </span>
                <div className="flex items-center gap-1 text-sm text-green-400">
                  <TrendingUp className="h-4 w-4" />
                  <span>+5.2%</span>
                </div>
              </div>
              <InteractiveSparkline
                data={[55, 58, 62, 59, 65, 68, 73]}
                color="#06b6d4"
                height={40}
                showDots
                animate
              />
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
