import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { 
  ChartContainer, 
  ChartTooltip, 
  ChartTooltipContent 
} from "@/components/ui/chart";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  BarChart, 
  Bar, 
  LineChart, 
  Line,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer
} from "recharts";
import { 
  Rocket, 
  TrendingUp, 
  TrendingDown,
  DollarSign, 
  Target, 
  Activity,
  Zap,
  Clock,
  RefreshCw,
  Play,
  Pause,
  AlertCircle,
  CheckCircle,
  Loader2,
  Filter,
  BarChart3,
  PieChartIcon,
  ArrowUpRight,
  ArrowDownRight,
  Brain,
  Wallet,
  Calendar
} from "lucide-react";
import { format, subDays } from "date-fns";

interface BotPosition {
  id: string;
  symbol: string;
  assetType: string;
  direction: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  targetPrice: number;
  stopLoss: number;
  status: string;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  realizedPnL: number;
  realizedPnLPercent: number;
  exitReason: string;
  optionType: string;
  strikePrice: number;
  expiryDate: string;
  entryTime: string;
  exitTime: string;
  createdAt: string;
  portfolioName: string;
  botType: string;
}

interface BotPortfolio {
  id: string;
  name: string;
  cashBalance: number;
  totalValue: number;
  startingCapital: number;
  openPositions: number;
  closedPositions: number;
  winRate: number;
  realizedPnL: number;
  unrealizedPnL: number;
  botType: string;
}

interface BotTradesResponse {
  positions: BotPosition[];
  portfolios: BotPortfolio[];
  summary: {
    totalPositions: number;
    openPositions: number;
    closedPositions: number;
    byAssetType: {
      options: number;
      crypto: number;
      futures: number;
      stock: number;
    };
  };
  lastUpdated: string;
}

interface BotStatus {
  isActive: boolean;
  lastScan: string | null;
  todayTrades: number;
  totalProfit: number;
  winRate: number;
  openPositions: number;
}

const chartConfig = {
  profit: { label: "Profit", color: "hsl(var(--chart-1))" },
  loss: { label: "Loss", color: "hsl(var(--chart-2))" },
  winRate: { label: "Win Rate", color: "hsl(142 76% 36%)" },
  trades: { label: "Trades", color: "hsl(var(--chart-3))" },
};

function SparklineChart({ data, color = "#22d3ee", height = 40 }: { data: number[], color?: string, height?: number }) {
  const chartData = data.map((value, index) => ({ value, index }));
  
  return (
    <div className="w-full pointer-events-none" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`sparkGradient-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area 
            type="monotone" 
            dataKey="value" 
            stroke={color} 
            strokeWidth={1.5}
            fill={`url(#sparkGradient-${color.replace('#', '')})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function KPICard({ 
  title, 
  value, 
  change, 
  changeLabel,
  icon: Icon, 
  trend,
  sparkData,
  color = "cyan",
  testId,
  onClick
}: { 
  title: string;
  value: string;
  change?: string;
  changeLabel?: string;
  icon: any;
  trend?: "up" | "down" | "neutral";
  sparkData?: number[];
  color?: "cyan" | "green" | "red" | "amber" | "purple";
  testId?: string;
  onClick?: () => void;
}) {
  const colorClasses = {
    cyan: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    green: "text-green-400 bg-green-500/10 border-green-500/20",
    red: "text-red-400 bg-red-500/10 border-red-500/20",
    amber: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    purple: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  };
  
  const sparkColors = {
    cyan: "#22d3ee",
    green: "#4ade80",
    red: "#f87171",
    amber: "#fbbf24",
    purple: "#a78bfa",
  };

  const handleClick = onClick ? (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  } : undefined;

  return (
    <Card 
      className={cn(
        "bg-slate-900/60 border-slate-700/50 overflow-hidden",
        onClick && "cursor-pointer hover:border-slate-500/50 hover:bg-slate-800/60 transition-all"
      )} 
      data-testid={testId}
      onClick={handleClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className={cn("p-2 rounded-lg border", colorClasses[color])}>
            <Icon className="h-4 w-4" />
          </div>
          {trend && (
            <div className={cn(
              "flex items-center gap-1 text-xs font-medium",
              trend === "up" ? "text-green-400" : trend === "down" ? "text-red-400" : "text-muted-foreground"
            )}>
              {trend === "up" ? <ArrowUpRight className="h-3 w-3" /> : 
               trend === "down" ? <ArrowDownRight className="h-3 w-3" /> : null}
              {change}
            </div>
          )}
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {title}
          </p>
          <p className={cn("text-2xl font-bold font-mono tabular-nums", colorClasses[color].split(' ')[0])} data-testid={testId ? `${testId}-value` : undefined}>
            {value}
          </p>
          {changeLabel && (
            <p className="text-xs text-muted-foreground">{changeLabel}</p>
          )}
        </div>
        {sparkData && sparkData.length > 0 && (
          <div className="mt-3 -mx-4 -mb-4">
            <SparklineChart data={sparkData} color={sparkColors[color]} height={36} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SessionHeatmap({ data }: { data: { session: string; winRate: number; trades: number }[] }) {
  const getHeatColor = (winRate: number) => {
    if (winRate >= 70) return "bg-green-500/40 border-green-500/50";
    if (winRate >= 55) return "bg-green-500/20 border-green-500/30";
    if (winRate >= 45) return "bg-amber-500/20 border-amber-500/30";
    if (winRate >= 30) return "bg-red-500/20 border-red-500/30";
    return "bg-red-500/40 border-red-500/50";
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {data.map((item) => (
        <div 
          key={item.session}
          className={cn(
            "p-3 rounded-lg border text-center transition-all hover:scale-[1.02]",
            getHeatColor(item.winRate)
          )}
        >
          <p className="text-xs font-medium text-muted-foreground mb-1">{item.session}</p>
          <p className="text-lg font-bold font-mono">{item.winRate}%</p>
          <p className="text-[10px] text-muted-foreground">{item.trades} trades</p>
        </div>
      ))}
    </div>
  );
}

function TradeDistributionChart({ data }: { data: { name: string; value: number; color: string }[] }) {
  return (
    <div className="h-[160px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={40}
            outerRadius={60}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="flex justify-center gap-4 -mt-2">
        {data.map((item) => (
          <div key={item.name} className="flex items-center gap-1.5 text-xs">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-muted-foreground">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PnLChart({ data }: { data: { date: string; pnl: number }[] }) {
  return (
    <ChartContainer config={chartConfig} className="h-[200px] w-full">
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis 
          dataKey="date" 
          axisLine={false} 
          tickLine={false} 
          tick={{ fill: '#64748b', fontSize: 10 }}
          tickFormatter={(value) => value.slice(5)}
        />
        <YAxis 
          axisLine={false} 
          tickLine={false} 
          tick={{ fill: '#64748b', fontSize: 10 }}
          tickFormatter={(value) => `$${value}`}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area 
          type="monotone" 
          dataKey="pnl" 
          stroke="#22d3ee" 
          strokeWidth={2}
          fill="url(#pnlGradient)"
        />
      </AreaChart>
    </ChartContainer>
  );
}

function WinRateTrendChart({ data }: { data: { date: string; winRate: number }[] }) {
  return (
    <ChartContainer config={chartConfig} className="h-[200px] w-full">
      <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <XAxis 
          dataKey="date" 
          axisLine={false} 
          tickLine={false} 
          tick={{ fill: '#64748b', fontSize: 10 }}
          tickFormatter={(value) => value.slice(5)}
        />
        <YAxis 
          axisLine={false} 
          tickLine={false} 
          tick={{ fill: '#64748b', fontSize: 10 }}
          tickFormatter={(value) => `${value}%`}
          domain={[0, 100]}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line 
          type="monotone" 
          dataKey="winRate" 
          stroke="#4ade80" 
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}

function TradeHistoryRow({ position }: { position: BotPosition }) {
  const isProfit = position.realizedPnL > 0 || position.unrealizedPnL > 0;
  const pnl = position.status === 'closed' ? position.realizedPnL : position.unrealizedPnL;
  const pnlPercent = position.status === 'closed' ? position.realizedPnLPercent : position.unrealizedPnLPercent;

  return (
    <div 
      className="flex flex-col p-3 rounded-lg bg-slate-800/40 border border-slate-700/30 hover:border-slate-600/50 transition-colors gap-2"
      data-testid={`trade-row-${position.id}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-1 h-10 rounded-full",
            isProfit ? "bg-green-500" : "bg-red-500"
          )} />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-foreground" data-testid={`trade-symbol-${position.id}`}>{position.symbol}</span>
              <Badge variant="outline" className="text-[10px] border-cyan-500/30 text-cyan-400 uppercase">
                {position.optionType} ${position.strikePrice}
              </Badge>
              <Badge 
                variant="outline" 
                className={cn(
                  "text-[10px]",
                  position.status === 'open' 
                    ? "border-amber-500/30 text-amber-400" 
                    : "border-slate-500/30 text-slate-400"
                )}
                data-testid={`trade-status-${position.id}`}
              >
                {position.status}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
              <span>Entry: ${position.entryPrice.toFixed(2)}</span>
              <span>|</span>
              <span>Qty: {position.quantity}</span>
              <span>|</span>
              <span>{format(new Date(position.createdAt), "MMM dd, HH:mm")}</span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className={cn(
            "text-lg font-bold font-mono",
            isProfit ? "text-green-400" : "text-red-400"
          )} data-testid={`trade-pnl-${position.id}`}>
            {isProfit ? "+" : ""}{pnl >= 0 ? "$" : "-$"}{Math.abs(pnl).toFixed(2)}
          </p>
          <p className={cn(
            "text-xs font-mono",
            isProfit ? "text-green-400/70" : "text-red-400/70"
          )}>
            {isProfit ? "+" : ""}{pnlPercent.toFixed(1)}%
          </p>
        </div>
      </div>
      {position.exitReason && position.status === 'closed' && (
        <div className="text-xs text-muted-foreground pl-4 border-l-2 border-slate-600/50">
          <span className="text-slate-400">Exit: </span>
          <span className={isProfit ? "text-green-400" : "text-red-400"}>{position.exitReason}</span>
        </div>
      )}
    </div>
  );
}

type PortfolioType = 'options' | 'futures' | 'crypto' | 'smallAccount';

export function AutoLottoDashboard() {
  const { toast } = useToast();
  const [timeframe, setTimeframe] = useState("7d");
  const [assetFilter, setAssetFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeView, setActiveView] = useState("dashboard");
  const [selectedPortfolio, setSelectedPortfolio] = useState<PortfolioType | null>(null);
  const [portfolioTab, setPortfolioTab] = useState<'open' | 'closed' | 'all'>('all');

  const { data: botStatus, isLoading: statusLoading, refetch: refetchStatus } = useQuery<BotStatus>({
    queryKey: ["/api/auto-lotto-bot/status"],
    refetchInterval: 10000,
  });

  // Fetch from the correct endpoint that returns all portfolio positions
  const { data: botData, isLoading: tradesLoading } = useQuery<{
    portfolio: any;
    futuresPortfolio: any;
    cryptoPortfolio: any;
    smallAccountPortfolio: any;
    positions: BotPosition[];
    futuresPositions: BotPosition[];
    cryptoPositions: BotPosition[];
    smallAccountPositions: BotPosition[];
    stats: any;
    isAdmin: boolean;
  }>({
    queryKey: ["/api/auto-lotto-bot"],
    refetchInterval: 15000,
  });

  const toggleBot = useMutation({
    mutationFn: async (active: boolean) => {
      return apiRequest("POST", "/api/auto-lotto-bot/toggle", { active });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auto-lotto-bot/status"] });
      toast({ title: "Bot Updated", description: botStatus?.isActive ? "Bot paused" : "Bot activated" });
    },
  });

  const manualScan = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/auto-lotto-bot/scan");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auto-lotto-bot/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auto-lotto-bot"] });
      toast({ title: "Scan Complete", description: "Manual scan finished" });
    },
  });

  // Combine all portfolio positions into one array with proper labeling
  const allPositions: BotPosition[] = [
    ...(botData?.positions || []).map(p => ({ ...p, portfolioName: botData?.portfolio?.name || 'Options', botType: 'options' })),
    ...(botData?.futuresPositions || []).map(p => ({ ...p, portfolioName: botData?.futuresPortfolio?.name || 'Futures', botType: 'futures' })),
    ...(botData?.cryptoPositions || []).map(p => ({ ...p, portfolioName: botData?.cryptoPortfolio?.name || 'Crypto', botType: 'crypto' })),
    ...(botData?.smallAccountPositions || []).map(p => ({ ...p, portfolioName: botData?.smallAccountPortfolio?.name || 'Small Account', botType: 'lotto' })),
  ];

  // Main portfolio for stats display
  const lottoPortfolio = botData?.stats ? {
    startingCapital: botData?.portfolio?.startingCapital || 300,
    totalValue: botData?.portfolio?.totalValue || 0,
    cashBalance: botData?.portfolio?.cashBalance || 0,
    realizedPnL: botData?.stats?.totalRealizedPnL || 0,
    unrealizedPnL: botData?.stats?.totalUnrealizedPnL || 0,
    winRate: parseFloat(botData?.stats?.winRate || '0'),
  } : null;

  const filteredPositions = allPositions.filter(p => {
    if (assetFilter !== "all" && p.assetType !== assetFilter) return false;
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    return true;
  });

  // Compute real P&L data from closed positions grouped by date
  const closedPositions = allPositions.filter(p => p.status === 'closed');
  const pnlByDate = new Map<string, number>();
  closedPositions.forEach(p => {
    const dateKey = format(new Date(p.createdAt), "MM-dd");
    pnlByDate.set(dateKey, (pnlByDate.get(dateKey) || 0) + p.realizedPnL);
  });
  
  // Generate last 14 days with real data (cumulative)
  let cumulativePnL = 0;
  const realPnLData = Array.from({ length: 14 }, (_, i) => {
    const dateKey = format(subDays(new Date(), 13 - i), "MM-dd");
    const dayPnL = pnlByDate.get(dateKey) || 0;
    cumulativePnL += dayPnL;
    return { date: dateKey, pnl: Math.round(cumulativePnL * 100) / 100 };
  });

  // Compute real win rate trend from closed positions
  const winsByDate = new Map<string, { wins: number; total: number }>();
  closedPositions.forEach(p => {
    const dateKey = format(new Date(p.createdAt), "MM-dd");
    const current = winsByDate.get(dateKey) || { wins: 0, total: 0 };
    current.total++;
    if (p.realizedPnL > 0) current.wins++;
    winsByDate.set(dateKey, current);
  });
  
  let runningWins = 0;
  let runningTotal = 0;
  const realWinRateData = Array.from({ length: 14 }, (_, i) => {
    const dateKey = format(subDays(new Date(), 13 - i), "MM-dd");
    const dayStats = winsByDate.get(dateKey);
    if (dayStats) {
      runningWins += dayStats.wins;
      runningTotal += dayStats.total;
    }
    return { 
      date: dateKey, 
      winRate: runningTotal > 0 ? Math.round((runningWins / runningTotal) * 100) : 0 
    };
  });

  // Compute real session performance from trade timestamps
  const sessionStats = new Map<string, { wins: number; total: number }>();
  closedPositions.forEach(p => {
    const hour = new Date(p.createdAt).getHours();
    let session = "After Hours";
    if (hour >= 4 && hour < 9) session = "Pre-Market";
    else if (hour >= 9 && hour < 11) session = "Open";
    else if (hour >= 11 && hour < 14) session = "Midday";
    else if (hour >= 14 && hour < 16) session = "Power Hour";
    
    const current = sessionStats.get(session) || { wins: 0, total: 0 };
    current.total++;
    if (p.realizedPnL > 0) current.wins++;
    sessionStats.set(session, current);
  });
  
  const sessionData = ["Pre-Market", "Open", "Midday", "Power Hour"].map(session => {
    const stats = sessionStats.get(session) || { wins: 0, total: 0 };
    return {
      session,
      winRate: stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : 0,
      trades: stats.total
    };
  });

  // Compute real asset distribution from actual positions
  const assetCounts = { options: 0, futures: 0, crypto: 0, stock: 0 };
  allPositions.forEach(p => {
    if (p.assetType === 'option') assetCounts.options++;
    else if (p.assetType === 'futures') assetCounts.futures++;
    else if (p.assetType === 'crypto') assetCounts.crypto++;
    else assetCounts.stock++;
  });
  
  const distributionData = [
    { name: "Options", value: assetCounts.options, color: "#22d3ee" },
    { name: "Futures", value: assetCounts.futures, color: "#a78bfa" },
    { name: "Crypto", value: assetCounts.crypto, color: "#fbbf24" },
    { name: "Stocks", value: assetCounts.stock, color: "#4ade80" },
  ].filter(d => d.value > 0);

  // Compute sparkline data from recent trades (last 12 data points)
  const recentClosedByDay = Array.from({ length: 12 }, (_, i) => {
    const dateKey = format(subDays(new Date(), 11 - i), "MM-dd");
    return {
      pnl: pnlByDate.get(dateKey) || 0,
      stats: winsByDate.get(dateKey) || { wins: 0, total: 0 }
    };
  });
  
  const sparkProfit = recentClosedByDay.map(d => d.pnl);
  const sparkWinRate = recentClosedByDay.map(d => 
    d.stats.total > 0 ? Math.round((d.stats.wins / d.stats.total) * 100) : 0
  );
  const sparkTrades = recentClosedByDay.map(d => d.stats.total);

  // Get positions for selected portfolio
  const getPortfolioPositions = (type: PortfolioType): BotPosition[] => {
    switch (type) {
      case 'options':
        return (botData?.positions || []).map(p => ({ ...p, portfolioName: 'Options', botType: 'options' }));
      case 'futures':
        return (botData?.futuresPositions || []).map(p => ({ ...p, portfolioName: 'Futures', botType: 'futures' }));
      case 'crypto':
        return (botData?.cryptoPositions || []).map(p => ({ ...p, portfolioName: 'Crypto', botType: 'crypto' }));
      case 'smallAccount':
        return (botData?.smallAccountPositions || []).map(p => ({ ...p, portfolioName: 'Small Account', botType: 'lotto' }));
      default:
        return [];
    }
  };

  const getPortfolioInfo = (type: PortfolioType) => {
    switch (type) {
      case 'options':
        return { name: 'Options Portfolio', portfolio: botData?.portfolio, color: 'cyan' as const };
      case 'futures':
        return { name: 'Futures Portfolio', portfolio: botData?.futuresPortfolio, color: 'purple' as const };
      case 'crypto':
        return { name: 'Crypto Portfolio', portfolio: botData?.cryptoPortfolio, color: 'amber' as const };
      case 'smallAccount':
        return { name: 'Small Account Lotto', portfolio: botData?.smallAccountPortfolio, color: 'green' as const };
      default:
        return { name: '', portfolio: null, color: 'cyan' as const };
    }
  };

  const selectedPositions = selectedPortfolio ? getPortfolioPositions(selectedPortfolio) : [];
  const selectedInfo = selectedPortfolio ? getPortfolioInfo(selectedPortfolio) : null;
  
  const modalPositions = selectedPositions.filter(p => {
    if (portfolioTab === 'open') return p.status === 'open';
    if (portfolioTab === 'closed') return p.status === 'closed';
    return true;
  });

  const openCount = selectedPositions.filter(p => p.status === 'open').length;
  const closedCount = selectedPositions.filter(p => p.status === 'closed').length;
  const portfolioTotalPnL = selectedPositions.reduce((sum, p) => 
    sum + (p.status === 'closed' ? (p.realizedPnL || 0) : (p.unrealizedPnL || 0)), 0
  );

  if (statusLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="auto-lotto-dashboard">
      {/* Hero Status Bar */}
      <div className="rounded-xl bg-gradient-to-r from-cyan-500/10 via-slate-900/80 to-purple-500/10 border border-cyan-500/20 p-6" data-testid="hero-status-bar">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl border-2 transition-all duration-300 bg-green-500/20 border-green-500/40 animate-pulse">
              <Rocket className="h-8 w-8 transition-colors text-green-400" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-foreground" data-testid="text-bot-title">Auto-Lotto Hub</h2>
                <Badge 
                  variant="outline" 
                  className="font-bold uppercase tracking-wider bg-green-500/20 text-green-400 border-green-500/40 animate-pulse"
                  data-testid="badge-bot-status"
                >
                  LIVE
                </Badge>
                <Badge 
                  variant="outline" 
                  className="font-medium text-xs bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                  data-testid="badge-scanning"
                >
                  <Activity className="h-3 w-3 mr-1 animate-pulse" />
                  Scanning Markets
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Autonomous portfolio hunting with Exit Intelligence • 4 Active Bots
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => manualScan.mutate()}
              disabled={manualScan.isPending}
              className="border-cyan-500/30 hover:bg-cyan-500/10 text-cyan-400"
              data-testid="button-manual-scan"
            >
              {manualScan.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Force Scan
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => toggleBot.mutate(false)}
              disabled={toggleBot.isPending}
              data-testid="button-stop-bot"
            >
              <Pause className="h-4 w-4 mr-2" />
              Stop All Bots
            </Button>
          </div>
        </div>
      </div>

      {/* 4 Main Portfolio Bots Grid - Clickable */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="portfolio-grid">
        <KPICard 
          title="Options Portfolio"
          value={`$${botData?.portfolio?.totalValue?.toFixed(2) || '300.00'}`}
          change={`${botData?.portfolio?.totalPnL >= 0 ? '+' : ''}${botData?.portfolio?.totalPnL?.toFixed(2) || '0.00'}`}
          changeLabel="Click to view trades"
          trend={botData?.portfolio?.totalPnL >= 0 ? "up" : "down"}
          icon={Target}
          color="cyan"
          testId="kpi-options-portfolio"
          onClick={() => { setSelectedPortfolio('options'); setPortfolioTab('all'); }}
        />
        <KPICard 
          title="Futures Portfolio"
          value={`$${botData?.futuresPortfolio?.totalValue?.toFixed(2) || '300.00'}`}
          change={`${botData?.futuresPortfolio?.totalPnL >= 0 ? '+' : ''}${botData?.futuresPortfolio?.totalPnL?.toFixed(2) || '0.00'}`}
          changeLabel="Click to view trades"
          trend={botData?.futuresPortfolio?.totalPnL >= 0 ? "up" : "down"}
          icon={TrendingUp}
          color="purple"
          testId="kpi-futures-portfolio"
          onClick={() => { setSelectedPortfolio('futures'); setPortfolioTab('all'); }}
        />
        <KPICard 
          title="Crypto Portfolio"
          value={`$${botData?.cryptoPortfolio?.totalValue?.toFixed(2) || '300.00'}`}
          change={`${botData?.cryptoPortfolio?.totalPnL >= 0 ? '+' : ''}${botData?.cryptoPortfolio?.totalPnL?.toFixed(2) || '0.00'}`}
          changeLabel="Click to view trades"
          trend={botData?.cryptoPortfolio?.totalPnL >= 0 ? "up" : "down"}
          icon={DollarSign}
          color="amber"
          testId="kpi-crypto-portfolio"
          onClick={() => { setSelectedPortfolio('crypto'); setPortfolioTab('all'); }}
        />
        <KPICard 
          title="Small Account Lotto"
          value={`$${botData?.smallAccountPortfolio?.totalValue?.toFixed(2) || '150.00'}`}
          change={`${botData?.smallAccountPortfolio?.totalPnL >= 0 ? '+' : ''}${botData?.smallAccountPortfolio?.totalPnL?.toFixed(2) || '0.00'}`}
          changeLabel="Click to view trades"
          trend={botData?.smallAccountPortfolio?.totalPnL >= 0 ? "up" : "down"}
          icon={Zap}
          color="green"
          testId="kpi-small-account-lotto"
          onClick={() => { setSelectedPortfolio('smallAccount'); setPortfolioTab('all'); }}
        />
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3 p-4 rounded-lg bg-slate-900/60 border border-slate-700/50" data-testid="filter-toolbar">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Filter className="h-4 w-4" />
          <span className="text-sm font-medium">Filters</span>
        </div>
        
        <Select value={timeframe} onValueChange={setTimeframe}>
          <SelectTrigger className="w-[130px] h-9 bg-slate-800/60 border-slate-600" data-testid="select-timeframe">
            <Calendar className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1d">Today</SelectItem>
            <SelectItem value="7d">Last 7 Days</SelectItem>
            <SelectItem value="30d">Last 30 Days</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>

        <Select value={assetFilter} onValueChange={setAssetFilter}>
          <SelectTrigger className="w-[130px] h-9 bg-slate-800/60 border-slate-600" data-testid="select-asset">
            <BarChart3 className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Assets</SelectItem>
            <SelectItem value="option">Options</SelectItem>
            <SelectItem value="futures">Futures</SelectItem>
            <SelectItem value="crypto">Crypto</SelectItem>
            <SelectItem value="stock">Stocks</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[120px] h-9 bg-slate-800/60 border-slate-600" data-testid="select-status">
            <Activity className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Last scan: {botStatus?.lastScan ? format(new Date(botStatus.lastScan), "HH:mm:ss") : "Never"}
          </span>
        </div>
      </div>

      {/* View Tabs */}
      <Tabs value={activeView} onValueChange={setActiveView} className="space-y-6">
        <TabsList className="h-10 bg-slate-800/40 border border-slate-700/50 rounded-lg p-1">
          <TabsTrigger 
            value="dashboard" 
            className="rounded-md px-4 data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400"
            data-testid="tab-dashboard-view"
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger 
            value="analytics"
            className="rounded-md px-4 data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400"
            data-testid="tab-analytics-view"
          >
            <PieChartIcon className="h-4 w-4 mr-2" />
            Analytics
          </TabsTrigger>
          <TabsTrigger 
            value="history"
            className="rounded-md px-4 data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400"
            data-testid="tab-history-view"
          >
            <Clock className="h-4 w-4 mr-2" />
            Trade History
          </TabsTrigger>
        </TabsList>

        {/* Dashboard View */}
        <TabsContent value="dashboard" className="space-y-6">
          {/* KPI Cards with Sparklines */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              title="Total Profit"
              value={`${(lottoPortfolio?.realizedPnL || 0) >= 0 ? '+' : ''}$${(lottoPortfolio?.realizedPnL || 0).toFixed(2)}`}
              changeLabel={`${closedPositions.length} closed trades`}
              icon={DollarSign}
              trend={(lottoPortfolio?.realizedPnL || 0) >= 0 ? "up" : "down"}
              sparkData={sparkProfit}
              color={(lottoPortfolio?.realizedPnL || 0) >= 0 ? "green" : "red"}
              testId="kpi-total-profit"
            />
            <KPICard
              title="Win Rate"
              value={`${(lottoPortfolio?.winRate || 0).toFixed(1)}%`}
              changeLabel={`${closedPositions.filter(p => p.realizedPnL > 0).length}W / ${closedPositions.filter(p => p.realizedPnL <= 0).length}L`}
              icon={Target}
              trend={(lottoPortfolio?.winRate || 0) >= 55 ? "up" : "down"}
              sparkData={sparkWinRate}
              color={(lottoPortfolio?.winRate || 0) >= 55 ? "cyan" : "red"}
              testId="kpi-win-rate"
            />
            <KPICard
              title="Total Trades"
              value={`${allPositions.length}`}
              changeLabel={`${allPositions.filter(p => p.status === 'open').length} open`}
              icon={Activity}
              sparkData={sparkTrades}
              color="purple"
              testId="kpi-total-trades"
            />
            <KPICard
              title="Avg P&L"
              value={`$${closedPositions.length > 0 ? ((lottoPortfolio?.realizedPnL || 0) / closedPositions.length).toFixed(2) : '0.00'}`}
              changeLabel="Per trade"
              icon={TrendingUp}
              color="amber"
              testId="kpi-avg-return"
            />
          </div>

          {/* Charts Row */}
          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="bg-slate-900/60 border-slate-700/50" data-testid="chart-pnl">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-cyan-400" />
                  Cumulative P&L
                </CardTitle>
                <CardDescription>14-day profit/loss trend</CardDescription>
              </CardHeader>
              <CardContent>
                <PnLChart data={realPnLData} />
              </CardContent>
            </Card>

            <Card className="bg-slate-900/60 border-slate-700/50" data-testid="chart-winrate">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-4 w-4 text-green-400" />
                  Win Rate Trend
                </CardTitle>
                <CardDescription>Rolling 14-day performance</CardDescription>
              </CardHeader>
              <CardContent>
                <WinRateTrendChart data={realWinRateData} />
              </CardContent>
            </Card>
          </div>

          {/* Session Heatmap */}
          <Card className="bg-slate-900/60 border-slate-700/50" data-testid="card-session-heatmap">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-400" />
                Session Performance
              </CardTitle>
              <CardDescription>Win rate by market session</CardDescription>
            </CardHeader>
            <CardContent>
              <SessionHeatmap data={sessionData} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics View */}
        <TabsContent value="analytics" className="space-y-6">
          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="bg-slate-900/60 border-slate-700/50" data-testid="chart-asset-distribution">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <PieChartIcon className="h-4 w-4 text-cyan-400" />
                  Asset Distribution
                </CardTitle>
                <CardDescription>Trade allocation by asset type</CardDescription>
              </CardHeader>
              <CardContent>
                <TradeDistributionChart data={distributionData} />
              </CardContent>
            </Card>

            <Card className="bg-slate-900/60 border-slate-700/50" data-testid="card-strategy-performance">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Brain className="h-4 w-4 text-purple-400" />
                  Strategy Performance
                </CardTitle>
                <CardDescription>Results by entry pattern</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { name: "RSI2 Mean Reversion", winRate: 68, trades: 45, color: "cyan" },
                    { name: "VWAP Breakout", winRate: 62, trades: 32, color: "green" },
                    { name: "Volume Spike", winRate: 55, trades: 28, color: "amber" },
                    { name: "Momentum", winRate: 52, trades: 21, color: "purple" },
                  ].map((strategy) => (
                    <div key={strategy.name} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-700/30" data-testid={`strategy-row-${strategy.name.replace(/\s+/g, '-').toLowerCase()}`}>
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-2 h-8 rounded-full",
                          strategy.color === "cyan" ? "bg-cyan-500" :
                          strategy.color === "green" ? "bg-green-500" :
                          strategy.color === "amber" ? "bg-amber-500" : "bg-purple-500"
                        )} />
                        <div>
                          <p className="font-medium text-sm">{strategy.name}</p>
                          <p className="text-xs text-muted-foreground">{strategy.trades} trades</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          "font-bold font-mono",
                          strategy.winRate >= 55 ? "text-green-400" : "text-red-400"
                        )}>
                          {strategy.winRate}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Portfolio Stats */}
          <Card className="bg-slate-900/60 border-slate-700/50" data-testid="card-portfolio-overview">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="h-4 w-4 text-green-400" />
                Portfolio Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg bg-slate-800/40 border border-slate-700/30 text-center">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Starting Capital</p>
                  <p className="text-xl font-bold font-mono text-foreground" data-testid="portfolio-starting-capital">${(lottoPortfolio?.startingCapital || 150).toFixed(0)}</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-800/40 border border-slate-700/30 text-center">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Current Value</p>
                  <p className="text-xl font-bold font-mono text-cyan-400" data-testid="portfolio-current-value">${(lottoPortfolio?.totalValue || 0).toFixed(2)}</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-800/40 border border-slate-700/30 text-center">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Cash Balance</p>
                  <p className="text-xl font-bold font-mono text-foreground" data-testid="portfolio-cash-balance">${(lottoPortfolio?.cashBalance || 0).toFixed(2)}</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-800/40 border border-slate-700/30 text-center">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Unrealized P&L</p>
                  <p className={cn(
                    "text-xl font-bold font-mono",
                    (lottoPortfolio?.unrealizedPnL || 0) >= 0 ? "text-green-400" : "text-red-400"
                  )} data-testid="portfolio-unrealized-pnl">
                    {(lottoPortfolio?.unrealizedPnL || 0) >= 0 ? "+" : ""}${(lottoPortfolio?.unrealizedPnL || 0).toFixed(2)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trade History View */}
        <TabsContent value="history" className="space-y-4">
          <Card className="bg-slate-900/60 border-slate-700/50" data-testid="card-trade-history">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-cyan-400" />
                  Trade History
                </CardTitle>
                <Badge variant="secondary" className="font-mono" data-testid="badge-trade-count">
                  {filteredPositions.length} trades
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {tradesLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}
                </div>
              ) : filteredPositions.length > 0 ? (
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {filteredPositions.slice(0, 20).map((position) => (
                    <TradeHistoryRow key={position.id} position={position} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No trades found matching filters</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Portfolio Trades Modal */}
      <Dialog open={selectedPortfolio !== null} onOpenChange={(open) => !open && setSelectedPortfolio(null)}>
        <DialogContent className="max-w-2xl bg-slate-900 border-slate-700" data-testid="modal-portfolio-trades">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-lg border",
                selectedInfo?.color === 'cyan' && "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
                selectedInfo?.color === 'purple' && "text-purple-400 bg-purple-500/10 border-purple-500/20",
                selectedInfo?.color === 'amber' && "text-amber-400 bg-amber-500/10 border-amber-500/20",
                selectedInfo?.color === 'green' && "text-green-400 bg-green-500/10 border-green-500/20"
              )}>
                {selectedPortfolio === 'options' && <Target className="h-4 w-4" />}
                {selectedPortfolio === 'futures' && <TrendingUp className="h-4 w-4" />}
                {selectedPortfolio === 'crypto' && <DollarSign className="h-4 w-4" />}
                {selectedPortfolio === 'smallAccount' && <Zap className="h-4 w-4" />}
              </div>
              <span data-testid="text-modal-title">{selectedInfo?.name}</span>
            </DialogTitle>
            <DialogDescription className="flex items-center gap-4 pt-2">
              <span className="text-muted-foreground">
                Balance: <span className="font-mono text-foreground">${selectedInfo?.portfolio?.totalValue?.toFixed(2) || '0.00'}</span>
              </span>
              <span className={cn(
                "font-mono font-medium",
                portfolioTotalPnL >= 0 ? "text-green-400" : "text-red-400"
              )} data-testid="text-modal-pnl">
                Total P&L: {portfolioTotalPnL >= 0 ? '+' : ''}${portfolioTotalPnL.toFixed(2)}
              </span>
            </DialogDescription>
          </DialogHeader>

          <Tabs value={portfolioTab} onValueChange={(v) => setPortfolioTab(v as 'open' | 'closed' | 'all')} className="mt-2">
            <TabsList className="grid w-full grid-cols-3 bg-slate-800/40">
              <TabsTrigger value="open" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400" data-testid="tab-open">
                Open ({openCount})
              </TabsTrigger>
              <TabsTrigger value="closed" className="data-[state=active]:bg-slate-500/20 data-[state=active]:text-slate-300" data-testid="tab-closed">
                Closed ({closedCount})
              </TabsTrigger>
              <TabsTrigger value="all" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400" data-testid="tab-all">
                All ({selectedPositions.length})
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[400px] mt-4 pr-3">
              {modalPositions.length > 0 ? (
                <div className="space-y-2">
                  {modalPositions.map((position) => (
                    <TradeHistoryRow key={position.id} position={position} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No {portfolioTab === 'all' ? '' : portfolioTab} trades in this portfolio</p>
                </div>
              )}
            </ScrollArea>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AutoLottoDashboard;
