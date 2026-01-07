import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { 
  TrendingUp, TrendingDown, Activity, Target, DollarSign, 
  BarChart3, PieChart, Zap, Clock, AlertTriangle, RefreshCw,
  ArrowRight, Rocket, Brain, LineChart as LineChartIcon, Settings, Eye, EyeOff, Plus, LayoutGrid
} from "lucide-react";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RechartsPie, Pie, Cell, BarChart, Bar, Legend
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

type WidgetId = 
  | 'stats-row'
  | 'weekly-performance'
  | 'asset-allocation'
  | 'win-loss'
  | 'market-brief'
  | 'system-status'
  | 'quick-actions';

interface WidgetConfig {
  id: WidgetId;
  name: string;
  description: string;
  defaultEnabled: boolean;
  icon: any;
}

const WIDGET_CONFIGS: WidgetConfig[] = [
  { id: 'stats-row', name: 'Summary Stats', description: 'Portfolio value, P&L, win rate, positions', defaultEnabled: true, icon: DollarSign },
  { id: 'weekly-performance', name: 'Weekly Performance', description: 'Chart of daily P&L over the week', defaultEnabled: true, icon: TrendingUp },
  { id: 'asset-allocation', name: 'Asset Allocation', description: 'Breakdown by asset type', defaultEnabled: true, icon: PieChart },
  { id: 'win-loss', name: 'Win/Loss Ratio', description: 'Trade outcome distribution', defaultEnabled: true, icon: Target },
  { id: 'market-brief', name: 'Market Brief', description: 'Daily market summary and alerts', defaultEnabled: true, icon: Brain },
  { id: 'system-status', name: 'System Status', description: 'Bot and service health indicators', defaultEnabled: true, icon: Activity },
  { id: 'quick-actions', name: 'Quick Actions', description: 'Navigation shortcuts', defaultEnabled: true, icon: Rocket },
];

const STORAGE_KEY = 'dashboard-widgets';

function getDefaultWidgets(): Record<WidgetId, boolean> {
  const defaults: Record<WidgetId, boolean> = {} as any;
  WIDGET_CONFIGS.forEach(w => defaults[w.id] = w.defaultEnabled);
  return defaults;
}

function loadWidgetSettings(): Record<WidgetId, boolean> {
  if (typeof window === 'undefined') return getDefaultWidgets();
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return { ...getDefaultWidgets(), ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('Failed to load widget settings', e);
  }
  return getDefaultWidgets();
}

function saveWidgetSettings(settings: Record<WidgetId, boolean>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save widget settings', e);
  }
}

export default function Dashboard() {
  const [widgets, setWidgets] = useState<Record<WidgetId, boolean>>(() => loadWidgetSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);

  const toggleWidget = (id: WidgetId) => {
    const newSettings = { ...widgets, [id]: !widgets[id] };
    setWidgets(newSettings);
    saveWidgetSettings(newSettings);
  };

  const enableAllWidgets = () => {
    const all: Record<WidgetId, boolean> = {} as any;
    WIDGET_CONFIGS.forEach(w => all[w.id] = true);
    setWidgets(all);
    saveWidgetSettings(all);
  };

  const disableAllWidgets = () => {
    const minimal: Record<WidgetId, boolean> = {} as any;
    WIDGET_CONFIGS.forEach(w => minimal[w.id] = false);
    minimal['stats-row'] = true; // Keep at least stats
    setWidgets(minimal);
    saveWidgetSettings(minimal);
  };

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
    assetAllocation: [],
    winLossRatio: [],
    recentBriefs: [],
    systemStatus: [],
  };

  const data = stats || defaultStats;

  // Check if we have any real data for charts
  const hasWeeklyData = data.weeklyPerformance.some(d => d.pnl !== 0);

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
    <Card className="glass-card border-border/50 hover-elevate" data-testid={testId}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{title}</p>
            <p 
              className={cn(
                "text-2xl font-bold font-mono tabular-nums",
                color === "cyan" && "text-cyan-600 dark:text-cyan-400",
                color === "green" && "text-green-600 dark:text-green-400",
                color === "red" && "text-red-600 dark:text-red-400",
                color === "purple" && "text-purple-600 dark:text-purple-400",
                color === "amber" && "text-amber-600 dark:text-amber-400",
              )}
              data-testid={testId ? `${testId}-value` : undefined}
            >
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {trend === 'up' && <TrendingUp className="h-3 w-3 text-green-600 dark:text-green-400" />}
                {trend === 'down' && <TrendingDown className="h-3 w-3 text-red-600 dark:text-red-400" />}
                {subtitle}
              </p>
            )}
          </div>
          <div className={cn(
            "p-2 rounded-lg",
            color === "cyan" && "bg-cyan-500/10 dark:bg-cyan-500/10",
            color === "green" && "bg-green-500/10 dark:bg-green-500/10",
            color === "red" && "bg-red-500/10 dark:bg-red-500/10",
            color === "purple" && "bg-purple-500/10 dark:bg-purple-500/10",
            color === "amber" && "bg-amber-500/10 dark:bg-amber-500/10",
          )}>
            <Icon className={cn(
              "h-5 w-5",
              color === "cyan" && "text-cyan-600 dark:text-cyan-400",
              color === "green" && "text-green-600 dark:text-green-400",
              color === "red" && "text-red-600 dark:text-red-400",
              color === "purple" && "text-purple-600 dark:text-purple-400",
              color === "amber" && "text-amber-600 dark:text-amber-400",
            )} />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const DonutChart = ({ 
    data: chartData, 
    title, 
    centerLabel,
    testId,
    emptyMessage
  }: { 
    data: { name: string; value: number; color: string }[]; 
    title: string;
    centerLabel?: string;
    testId?: string;
    emptyMessage?: string;
  }) => {
    const hasData = chartData.length > 0;
    
    return (
      <Card className="glass-card border-border/50" data-testid={testId}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <PieChart className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasData ? (
            <>
              <div className="relative h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPie>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="hsl(var(--background))"
                      strokeWidth={2}
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: 'hsl(var(--foreground))'
                      }}
                      formatter={(value: number, name: string) => [`${value}%`, name]}
                    />
                  </RechartsPie>
                </ResponsiveContainer>
                {centerLabel && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-2xl font-bold text-foreground">{centerLabel}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap justify-center gap-3 mt-3">
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
            </>
          ) : (
            <div className="h-[200px] flex flex-col items-center justify-center text-muted-foreground">
              <PieChart className="h-12 w-12 opacity-20 mb-2" />
              <p className="text-sm">{emptyMessage || 'No data available'}</p>
              <p className="text-xs opacity-70">Complete some trades to see stats</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

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

  const enabledCount = Object.values(widgets).filter(Boolean).length;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
              Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              {format(new Date(), 'EEEE, MMMM d, yyyy')} • Market Overview
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
              <SheetTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm"
                  data-testid="button-widget-settings"
                >
                  <LayoutGrid className="h-4 w-4 mr-1" />
                  Widgets ({enabledCount}/{WIDGET_CONFIGS.length})
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Dashboard Widgets
                  </SheetTitle>
                  <SheetDescription>
                    Toggle widgets to customize your dashboard view
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-4">
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={enableAllWidgets}
                      data-testid="button-show-all-widgets"
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      Show All
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={disableAllWidgets}
                      data-testid="button-hide-widgets"
                    >
                      <EyeOff className="h-4 w-4 mr-1" />
                      Minimal
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {WIDGET_CONFIGS.map((config) => (
                      <div 
                        key={config.id}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg border transition-colors",
                          widgets[config.id] 
                            ? "bg-muted/50 border-border" 
                            : "bg-background border-border/50 opacity-60"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <config.icon className={cn(
                            "h-4 w-4",
                            widgets[config.id] ? "text-cyan-500" : "text-muted-foreground"
                          )} />
                          <div>
                            <Label className="font-medium cursor-pointer" htmlFor={config.id}>
                              {config.name}
                            </Label>
                            <p className="text-xs text-muted-foreground">{config.description}</p>
                          </div>
                        </div>
                        <Switch
                          id={config.id}
                          checked={widgets[config.id]}
                          onCheckedChange={() => toggleWidget(config.id)}
                          data-testid={`toggle-widget-${config.id}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
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
        {widgets['stats-row'] && (
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
        )}

        {/* Charts Row */}
        {(widgets['weekly-performance'] || widgets['asset-allocation']) && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Weekly Performance Area Chart */}
            {widgets['weekly-performance'] && (
              <Card className="glass-card border-border/50 lg:col-span-2" data-testid="chart-weekly-performance">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                    Weekly Performance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[250px]">
                    {hasWeeklyData ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.weeklyPerformance} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                          <defs>
                            <linearGradient id="pnlGradientPos" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4}/>
                              <stop offset="95%" stopColor="#22c55e" stopOpacity={0.05}/>
                            </linearGradient>
                            <linearGradient id="pnlGradientNeg" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4}/>
                              <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" vertical={false} />
                          <XAxis 
                            dataKey="day" 
                            className="text-muted-foreground" 
                            stroke="hsl(var(--muted-foreground))"
                            fontSize={12} 
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis 
                            className="text-muted-foreground"
                            stroke="hsl(var(--muted-foreground))"
                            fontSize={12} 
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(v) => `$${v}`}
                          />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--card))', 
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px',
                              fontSize: '12px',
                              color: 'hsl(var(--foreground))'
                            }}
                            formatter={(value: number) => [`$${value.toLocaleString()}`, 'P&L']}
                          />
                          <Area 
                            type="monotone"
                            dataKey="pnl" 
                            stroke="#22c55e"
                            strokeWidth={2}
                            fill="url(#pnlGradientPos)"
                            dot={{ fill: '#22c55e', strokeWidth: 0, r: 4 }}
                            activeDot={{ r: 6, fill: '#22c55e', stroke: 'hsl(var(--background))', strokeWidth: 2 }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                        <BarChart3 className="h-12 w-12 opacity-20 mb-2" />
                        <p className="text-sm">No performance data yet</p>
                        <p className="text-xs opacity-70">Complete trades to see weekly P&L</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Asset Allocation Donut */}
            {widgets['asset-allocation'] && (
              <DonutChart 
                data={data.assetAllocation}
                title="Asset Allocation"
                centerLabel=""
                testId="chart-asset-allocation"
                emptyMessage="No positions"
              />
            )}
          </div>
        )}

        {/* Second Row */}
        {(widgets['win-loss'] || widgets['market-brief']) && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Win/Loss Donut */}
            {widgets['win-loss'] && (
              <DonutChart 
                data={data.winLossRatio}
                title="Win/Loss Ratio"
                centerLabel={data.winLossRatio.length > 0 ? `${data.winRate.toFixed(0)}%` : ''}
                testId="chart-win-loss"
                emptyMessage="No trades yet"
              />
            )}

            {/* Daily Market Brief */}
            {widgets['market-brief'] && (
              <Card className="glass-card border-border/50 lg:col-span-2" data-testid="card-market-brief">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Brain className="h-4 w-4 text-purple-600 dark:text-purple-400" />
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
                      <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                        <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">Market Update</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Markets showing mixed signals. S&P 500 futures flat, Nasdaq slightly positive. 
                            Watch for key economic data releases today.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                        <Rocket className="h-4 w-4 text-cyan-600 dark:text-cyan-400 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">Top Movers</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Quantum computing stocks showing strength. AI sector consolidating after recent rally.
                            Crypto holding steady with BTC above key support.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                        <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5" />
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
            )}
          </div>
        )}

        {/* System Status */}
        {widgets['system-status'] && (
          <Card className="glass-card border-border/50" data-testid="card-system-status">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4 text-green-600 dark:text-green-400" />
                System Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {[
                  { name: 'Auto-Lotto Bot', status: 'active', icon: Zap },
                  { name: 'Futures Bot', status: 'active', icon: LineChartIcon },
                  { name: 'Crypto Bot', status: 'active', icon: Activity },
                  { name: 'Quant Engine', status: 'active', icon: Brain },
                  { name: 'Price Feed', status: 'active', icon: TrendingUp },
                  { name: 'Market Scanner', status: 'active', icon: Target },
                ].map((system, i) => (
                  <div 
                    key={i}
                    className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border/30"
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
                          ? "border-green-500 text-green-600 dark:text-green-400" 
                          : "border-amber-500 text-amber-600 dark:text-amber-400"
                      )}
                    >
                      {system.status === 'active' ? 'Online' : 'Offline'}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        {widgets['quick-actions'] && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link href="/trade-desk" data-testid="link-quick-trade-desk">
              <Card className="glass-card border-border/50 hover-elevate cursor-pointer h-full">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-cyan-500/10">
                    <Target className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Trade Desk</p>
                    <p className="text-xs text-muted-foreground">View research briefs</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href="/watchlist-bot" data-testid="link-quick-watchlist">
              <Card className="glass-card border-border/50 hover-elevate cursor-pointer h-full">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10">
                    <Rocket className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Watchlist Bot</p>
                    <p className="text-xs text-muted-foreground">Manage portfolios</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href="/performance" data-testid="link-quick-performance">
              <Card className="glass-card border-border/50 hover-elevate cursor-pointer h-full">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <BarChart3 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Performance</p>
                    <p className="text-xs text-muted-foreground">Analytics & stats</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href="/market-scanner" data-testid="link-quick-scanner">
              <Card className="glass-card border-border/50 hover-elevate cursor-pointer h-full">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10">
                    <Zap className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Market Scanner</p>
                    <p className="text-xs text-muted-foreground">Find opportunities</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        )}

        {/* No widgets message */}
        {enabledCount === 0 && (
          <Card className="glass-card border-border/50">
            <CardContent className="p-8 text-center">
              <LayoutGrid className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground mb-4">No widgets enabled</p>
              <Button 
                variant="outline" 
                onClick={() => setSettingsOpen(true)}
                data-testid="button-add-widgets"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Widgets
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Educational Disclaimer */}
        <Card className="glass-card border-amber-500/20 dark:border-amber-500/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-amber-600 dark:text-amber-400">Educational Disclaimer:</span>{" "}
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
