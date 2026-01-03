import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  TrendingUp, TrendingDown, Activity, Target, DollarSign, 
  BarChart3, PieChart, Zap, Clock, AlertTriangle, RefreshCw,
  ArrowRight, Rocket, Brain, LineChart
} from "lucide-react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RechartsPie, Pie, Cell, Legend
} from "recharts";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface DashboardStats {
  portfolioValue: number;
  dailyPnL: number;
  dailyPnLPercent: number;
  totalTrades: number;
  winRate: number;
  activePositions: number;
  weeklyPerformance: { day: string; pnl: number }[];
  assetAllocation: { name: string; value: number; color: string }[];
  winLossRatio: { name: string; value: number; color: string }[];
  recentBriefs: { title: string; summary: string; sentiment: string; time: string }[];
  systemStatus: { name: string; status: string; lastUpdate: string }[];
}

export default function Dashboard() {
  const { data: stats, isLoading, refetch } = useQuery<DashboardStats>({
    queryKey: ['/api/dashboard/stats'],
    refetchInterval: 60000,
  });

  const { data: marketBrief } = useQuery<{ brief: string; timestamp: string }>({
    queryKey: ['/api/dashboard/market-brief'],
    refetchInterval: 300000,
  });

  const defaultStats: DashboardStats = {
    portfolioValue: 0,
    dailyPnL: 0,
    dailyPnLPercent: 0,
    totalTrades: 0,
    winRate: 0,
    activePositions: 0,
    weeklyPerformance: [
      { day: 'Mon', pnl: 0 },
      { day: 'Tue', pnl: 0 },
      { day: 'Wed', pnl: 0 },
      { day: 'Thu', pnl: 0 },
      { day: 'Fri', pnl: 0 },
    ],
    assetAllocation: [
      { name: 'Stocks', value: 40, color: '#22d3ee' },
      { name: 'Options', value: 30, color: '#a855f7' },
      { name: 'Crypto', value: 20, color: '#f59e0b' },
      { name: 'Futures', value: 10, color: '#10b981' },
    ],
    winLossRatio: [
      { name: 'Wins', value: 65, color: '#22c55e' },
      { name: 'Losses', value: 35, color: '#ef4444' },
    ],
    recentBriefs: [],
    systemStatus: [],
  };

  const data = stats || defaultStats;

  const StatCard = ({ 
    title, value, subtitle, icon: Icon, trend, color = "cyan", testId 
  }: { 
    title: string; 
    value: string | number; 
    subtitle?: string; 
    icon: any; 
    trend?: 'up' | 'down' | 'neutral';
    color?: string;
    testId?: string;
  }) => (
    <Card className="glass-card border-slate-700/50 hover-elevate" data-testid={testId}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{title}</p>
            <p 
              className={cn(
                "text-2xl font-bold font-mono tabular-nums",
                color === "cyan" && "text-cyan-400",
                color === "green" && "text-green-400",
                color === "red" && "text-red-400",
                color === "purple" && "text-purple-400",
                color === "amber" && "text-amber-400",
              )}
              data-testid={testId ? `${testId}-value` : undefined}
            >
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {trend === 'up' && <TrendingUp className="h-3 w-3 text-green-400" />}
                {trend === 'down' && <TrendingDown className="h-3 w-3 text-red-400" />}
                {subtitle}
              </p>
            )}
          </div>
          <div className={cn(
            "p-2 rounded-lg",
            color === "cyan" && "bg-cyan-500/10",
            color === "green" && "bg-green-500/10",
            color === "red" && "bg-red-500/10",
            color === "purple" && "bg-purple-500/10",
            color === "amber" && "bg-amber-500/10",
          )}>
            <Icon className={cn(
              "h-5 w-5",
              color === "cyan" && "text-cyan-400",
              color === "green" && "text-green-400",
              color === "red" && "text-red-400",
              color === "purple" && "text-purple-400",
              color === "amber" && "text-amber-400",
            )} />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const Ring3DChart = ({ 
    data: chartData, 
    title, 
    centerLabel,
    testId 
  }: { 
    data: { name: string; value: number; color: string }[]; 
    title: string;
    centerLabel?: string;
    testId?: string;
  }) => (
    <Card className="glass-card border-slate-700/50" data-testid={testId}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <PieChart className="h-4 w-4 text-purple-400" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative h-[200px]" style={{ perspective: '1000px' }}>
          <div 
            className="absolute inset-0"
            style={{ 
              transform: 'rotateX(55deg)',
              transformStyle: 'preserve-3d'
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPie>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {chartData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.color}
                      style={{
                        filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.4))'
                      }}
                    />
                  ))}
                </Pie>
              </RechartsPie>
            </ResponsiveContainer>
          </div>
          {centerLabel && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-xl font-bold text-foreground">{centerLabel}</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap justify-center gap-3 mt-2">
          {chartData.map((item, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <div 
                className="w-2.5 h-2.5 rounded-full" 
                style={{ backgroundColor: item.color }}
              />
              <span className="text-muted-foreground">{item.name}</span>
              <span className="font-mono font-medium">{item.value}%</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-10 w-48" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-28" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-cyan-400" />
              Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              {format(new Date(), 'EEEE, MMMM d, yyyy')} • Market Overview
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => refetch()}
              data-testid="button-refresh-dashboard"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
            <Link href="/trade-desk">
              <Button size="sm" className="bg-cyan-500 hover:bg-cyan-400 text-slate-950" data-testid="link-trade-desk">
                Trade Desk
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard 
            title="Portfolio Value" 
            value={`$${data.portfolioValue.toLocaleString()}`}
            icon={DollarSign}
            color="cyan"
            testId="stat-portfolio-value"
          />
          <StatCard 
            title="Daily P&L" 
            value={`${data.dailyPnL >= 0 ? '+' : ''}$${data.dailyPnL.toLocaleString()}`}
            subtitle={`${data.dailyPnLPercent >= 0 ? '+' : ''}${data.dailyPnLPercent.toFixed(2)}%`}
            icon={data.dailyPnL >= 0 ? TrendingUp : TrendingDown}
            trend={data.dailyPnL >= 0 ? 'up' : 'down'}
            color={data.dailyPnL >= 0 ? 'green' : 'red'}
            testId="stat-daily-pnl"
          />
          <StatCard 
            title="Win Rate" 
            value={`${data.winRate.toFixed(1)}%`}
            subtitle={`${data.totalTrades} total trades`}
            icon={Target}
            color="purple"
            testId="stat-win-rate"
          />
          <StatCard 
            title="Active Positions" 
            value={data.activePositions}
            icon={Activity}
            color="amber"
            testId="stat-active-positions"
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Weekly Performance Bar Chart */}
          <Card className="glass-card border-slate-700/50 lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-cyan-400" />
                Weekly Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.weeklyPerformance} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis 
                      dataKey="day" 
                      stroke="#64748b" 
                      fontSize={12} 
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      stroke="#64748b" 
                      fontSize={12} 
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1e293b', 
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        fontSize: '12px'
                      }}
                      formatter={(value: number) => [`$${value.toLocaleString()}`, 'P&L']}
                    />
                    <Bar 
                      dataKey="pnl" 
                      radius={[4, 4, 0, 0]}
                      fill="#22d3ee"
                    >
                      {data.weeklyPerformance.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.pnl >= 0 ? '#22c55e' : '#ef4444'} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Asset Allocation 3D Ring */}
          <Ring3DChart 
            data={data.assetAllocation}
            title="Asset Allocation"
            centerLabel=""
            testId="chart-asset-allocation"
          />
        </div>

        {/* Second Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Win/Loss Ring */}
          <Ring3DChart 
            data={data.winLossRatio}
            title="Win/Loss Ratio"
            centerLabel={`${data.winRate.toFixed(0)}%`}
            testId="chart-win-loss"
          />

          {/* Daily Market Brief */}
          <Card className="glass-card border-slate-700/50 lg:col-span-2" data-testid="card-market-brief">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Brain className="h-4 w-4 text-purple-400" />
                Daily Market Brief
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {marketBrief?.brief ? (
                <div className="space-y-3">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {marketBrief.brief}
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    Last updated: {marketBrief.timestamp}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/30">
                    <Zap className="h-4 w-4 text-amber-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Market Update</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Markets showing mixed signals. S&P 500 futures flat, Nasdaq slightly positive. 
                        Watch for key economic data releases today.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/30">
                    <Rocket className="h-4 w-4 text-cyan-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Top Movers</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Quantum computing stocks showing strength. AI sector consolidating after recent rally.
                        Crypto holding steady with BTC above key support.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/30">
                    <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Risk Watch</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Elevated VIX suggests caution. Consider tighter stops on swing positions.
                        Options IV elevated ahead of earnings season.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* System Status */}
        <Card className="glass-card border-slate-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-green-400" />
              System Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {[
                { name: 'Auto-Lotto Bot', status: 'active', icon: Zap },
                { name: 'Futures Bot', status: 'active', icon: LineChart },
                { name: 'Crypto Bot', status: 'active', icon: Activity },
                { name: 'Quant Engine', status: 'active', icon: Brain },
                { name: 'Price Feed', status: 'active', icon: TrendingUp },
                { name: 'Market Scanner', status: 'active', icon: Target },
              ].map((system, i) => (
                <div 
                  key={i}
                  className="flex items-center gap-2 p-3 rounded-lg bg-slate-800/30 border border-slate-700/30"
                  data-testid={`status-${system.name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <system.icon className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{system.name}</p>
                  </div>
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-[10px] px-1.5 py-0",
                      system.status === 'active' 
                        ? "border-green-500 text-green-400" 
                        : "border-amber-500 text-amber-400"
                    )}
                  >
                    {system.status === 'active' ? 'Online' : 'Offline'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link href="/trade-desk" data-testid="link-quick-trade-desk">
            <Card className="glass-card border-slate-700/50 hover-elevate cursor-pointer h-full">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/10">
                  <Target className="h-5 w-5 text-cyan-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">Trade Desk</p>
                  <p className="text-xs text-muted-foreground">View research briefs</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/watchlist-bot" data-testid="link-quick-watchlist">
            <Card className="glass-card border-slate-700/50 hover-elevate cursor-pointer h-full">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Rocket className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">Watchlist Bot</p>
                  <p className="text-xs text-muted-foreground">Manage portfolios</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/performance" data-testid="link-quick-performance">
            <Card className="glass-card border-slate-700/50 hover-elevate cursor-pointer h-full">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <BarChart3 className="h-5 w-5 text-green-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">Performance</p>
                  <p className="text-xs text-muted-foreground">Analytics & stats</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/market-scanner" data-testid="link-quick-scanner">
            <Card className="glass-card border-slate-700/50 hover-elevate cursor-pointer h-full">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <Zap className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">Market Scanner</p>
                  <p className="text-xs text-muted-foreground">Find opportunities</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Educational Disclaimer */}
        <Card className="glass-card border-amber-500/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-amber-400">Educational Disclaimer:</span>{" "}
                This dashboard is for research and educational purposes only. All data shown is based on paper trading 
                simulations and historical analysis. Past performance does not guarantee future results. 
                Not financial advice.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
