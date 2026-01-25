import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Brain,
  ChevronRight,
  LineChart,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
  Eye,
  Clock,
  CheckCircle2,
  AlertCircle,
  Play,
  Pause,
  Bot,
  DollarSign,
} from "lucide-react";

interface EngineData {
  name: string;
  status: "active" | "standby";
  signals: number;
  winRate: number;
  color: string;
}

const engines: EngineData[] = [
  { name: "AI Engine", status: "standby", signals: 56, winRate: 56, color: "from-purple-500 to-violet-500" },
  { name: "Quant Engine", status: "active", signals: 91, winRate: 52, color: "from-blue-500 to-cyan-500" },
  { name: "Flow Engine", status: "standby", signals: 92, winRate: 92, color: "from-cyan-500 to-teal-500" },
  { name: "Hybrid Engine", status: "standby", signals: 40, winRate: 40, color: "from-emerald-500 to-green-500" },
  { name: "Manual Trades", status: "standby", signals: 78, winRate: 78, color: "from-amber-500 to-orange-500" },
  { name: "Lotto Plays", status: "standby", signals: 97, winRate: 97, color: "from-pink-500 to-rose-500" },
];

const quickActions = [
  { 
    title: "Find Trades", 
    description: "AI-powered setups ready now", 
    icon: Sparkles, 
    href: "/research",
    color: "from-cyan-500/10 to-purple-500/10",
    borderColor: "border-cyan-500/20"
  },
  { 
    title: "Scan Market", 
    description: "Real-time technical signals", 
    icon: Search, 
    href: "/trade-desk",
    color: "from-emerald-500/10 to-cyan-500/10",
    borderColor: "border-emerald-500/20"
  },
  { 
    title: "Analyze Chart", 
    description: "Deep technical analysis", 
    icon: LineChart, 
    href: "/chart-analysis",
    color: "from-purple-500/10 to-pink-500/10",
    borderColor: "border-purple-500/20"
  },
];

export default function CommandCenter() {
  const activeEngines = engines.filter(e => e.status === "active").length;
  const totalTrades = 83;
  const avgWinRate = 64.7;
  const totalPnL = 15350;
  const todayWinRate = 62;

  // Performance data points for mini chart
  const performanceData = [55, 58, 62, 65, 68, 73, 71, 73];
  const maxVal = Math.max(...performanceData);
  const minVal = Math.min(...performanceData);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <h1 className="text-3xl font-semibold text-slate-100 mb-2 tracking-tight">
            Command Center
          </h1>
          <p className="text-slate-400 text-lg">
            Your trading hub. All systems synchronized.
          </p>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10"
        >
          {quickActions.map((action, i) => (
            <Link key={action.title} href={action.href}>
              <Card 
                className={cn(
                  "p-5 bg-gradient-to-br border cursor-pointer transition-all hover:scale-[1.02] group",
                  action.color,
                  action.borderColor
                )}
                data-testid={`card-quick-action-${i}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <action.icon className="w-5 h-5 text-slate-300" />
                      <h3 className="font-semibold text-slate-100">{action.title}</h3>
                    </div>
                    <p className="text-sm text-slate-400">{action.description}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-slate-300 group-hover:translate-x-1 transition-all" />
                </div>
              </Card>
            </Link>
          ))}
        </motion.div>

        {/* Research Engines Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-10"
        >
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-xl font-semibold text-slate-100 mb-1">Research Engines</h2>
              <p className="text-sm text-slate-400">Real-time analysis from database</p>
            </div>
            <Badge variant="outline" className="text-slate-400 border-slate-700">
              {activeEngines} of {engines.length} Active
            </Badge>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {engines.map((engine, i) => (
              <motion.div
                key={engine.name}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.03 }}
              >
                <Card 
                  className={cn(
                    "p-4 bg-slate-900/60 border-slate-800 hover:border-slate-700 transition-all cursor-pointer group",
                    engine.status === "active" && "border-emerald-500/30 bg-emerald-500/5"
                  )}
                  data-testid={`card-engine-${engine.name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {/* Status indicator */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      engine.status === "active" ? "bg-emerald-400" : "bg-slate-600"
                    )} />
                    <span className={cn(
                      "text-[10px] font-medium uppercase tracking-wider",
                      engine.status === "active" ? "text-emerald-400" : "text-slate-500"
                    )}>
                      {engine.status}
                    </span>
                  </div>

                  {/* Engine name */}
                  <h3 className="text-sm font-medium text-slate-200 mb-3 line-clamp-1">
                    {engine.name}
                  </h3>

                  {/* Stats */}
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-2xl font-bold text-slate-100">{engine.signals}</span>
                    <span className="text-xs text-slate-500">Signals</span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>Win Rate</span>
                    <span className={cn(
                      "font-medium",
                      engine.winRate >= 60 ? "text-emerald-400" : 
                      engine.winRate >= 50 ? "text-amber-400" : "text-slate-400"
                    )}>
                      {engine.winRate}%
                    </span>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Performance & Stats Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
          {/* 30-Day Performance */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-2"
          >
            <Card className="p-6 bg-slate-900/60 border-slate-800" data-testid="card-performance">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-semibold text-slate-100">30-Day Performance</h3>
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-bold text-slate-100">73.0%</span>
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                    +5.8%
                  </Badge>
                </div>
              </div>

              {/* Mini Chart */}
              <div className="h-32 flex items-end gap-1">
                {performanceData.map((val, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-gradient-to-t from-cyan-500/30 to-cyan-500/10 rounded-t transition-all hover:from-cyan-500/50 hover:to-cyan-500/20"
                    style={{ 
                      height: `${((val - minVal) / (maxVal - minVal)) * 80 + 20}%` 
                    }}
                  />
                ))}
              </div>

              {/* X-axis labels */}
              <div className="flex justify-between mt-2 text-xs text-slate-500">
                <span>Jan 1</span>
                <span>Jan 10</span>
                <span>Jan 20</span>
                <span>Jan 25</span>
              </div>
            </Card>
          </motion.div>

          {/* Stats Panel */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="space-y-4"
          >
            {/* Total Trades */}
            <Card className="p-4 bg-slate-900/60 border-slate-800" data-testid="stat-trades">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Total Trades</span>
                <Activity className="w-4 h-4 text-slate-500" />
              </div>
              <p className="text-2xl font-bold text-slate-100 mt-1">{totalTrades}</p>
            </Card>

            {/* Avg Win Rate */}
            <Card className="p-4 bg-slate-900/60 border-slate-800" data-testid="stat-winrate">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Avg Win Rate</span>
                <Target className="w-4 h-4 text-slate-500" />
              </div>
              <p className="text-2xl font-bold text-emerald-400 mt-1">{avgWinRate}%</p>
            </Card>

            {/* Total P&L */}
            <Card className="p-4 bg-slate-900/60 border-slate-800" data-testid="stat-pnl">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Total P&L</span>
                <DollarSign className="w-4 h-4 text-slate-500" />
              </div>
              <p className="text-2xl font-bold text-emerald-400 mt-1">
                ${totalPnL.toLocaleString()}
              </p>
            </Card>
          </motion.div>
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Active Positions */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="p-6 bg-slate-900/60 border-slate-800" data-testid="card-positions">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-100">Active Positions</h3>
                <Badge variant="outline" className="text-slate-400 border-slate-700">
                  0 Open
                </Badge>
              </div>
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mb-3">
                  <Eye className="w-6 h-6 text-slate-500" />
                </div>
                <p className="text-slate-400 text-sm">No active positions</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 border-slate-700 text-slate-300"
                  asChild
                >
                  <Link href="/research">
                    Find Trades <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </div>
            </Card>
          </motion.div>

          {/* Today's Performance */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <Card className="p-6 bg-slate-900/60 border-slate-800" data-testid="card-today">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-100">Today's Win Rate</h3>
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                  +5.2%
                </Badge>
              </div>
              
              {/* Circular progress indicator */}
              <div className="flex items-center gap-6">
                <div className="relative w-24 h-24">
                  <svg className="w-24 h-24 transform -rotate-90">
                    <circle
                      cx="48"
                      cy="48"
                      r="40"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="8"
                      className="text-slate-800"
                    />
                    <circle
                      cx="48"
                      cy="48"
                      r="40"
                      fill="none"
                      stroke="url(#gradient)"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${todayWinRate * 2.51} 251`}
                    />
                    <defs>
                      <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#06b6d4" />
                        <stop offset="100%" stopColor="#a855f7" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-bold text-slate-100">{todayWinRate}%</span>
                  </div>
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm text-slate-300">Bot Connected</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Auto-Lotto Bot is monitoring the market for high-probability setups.
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
