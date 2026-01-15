import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FuturesContent } from "@/pages/futures";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TradeIdeaBlock } from "@/components/trade-idea-block";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineEmptyState } from "@/components/ui/empty-state";
import { TerminalLoading } from "@/components/ui/terminal-loading";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { TradeIdea, IdeaSource, MarketData, Catalyst } from "@shared/schema";
import { 
  TrendingUp, 
  Target, 
  Shield, 
  Clock, 
  ChevronLeft,
  ChevronRight, 
  Filter, 
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Activity,
  BarChart3,
  Bot,
  Brain,
  Star,
  Loader2,
  CalendarClock,
  ChevronDown,
  Info,
  List,
  LayoutGrid,
  TrendingUp as TrendingUpIcon,
  X,
  XCircle,
  CheckCircle,
  FileText,
  AlertTriangle,
  AlertCircle,
  Newspaper,
  Calendar as CalendarIcon,
  RefreshCw,
  Sparkles,
  UserPlus,
  Eye,
  ArrowUpDown,
  SlidersHorizontal,
  Flame,
  Bitcoin,
  DollarSign,
  LineChart,
  Globe,
  Send
} from "lucide-react";
import { formatCurrency, formatPercent } from "@/lib/utils";
import ResearchPulseWidget from "@/components/research-pulse-widget";
import PersonalEdgeAnalytics from "@/components/personal-edge-analytics";
import BestSetupsExplainer from "@/components/best-setups-explainer";

// Compact expiry badge for quick time-left display
function ExpiryBadge({ minutes }: { minutes: number }) {
  if (minutes <= 0) return <Badge variant="destructive">Expired</Badge>;
  if (minutes < 60) return <Badge variant="outline" className="text-amber-400 border-amber-400/30">{minutes}m left</Badge>;
  const hours = Math.floor(minutes / 60);
  return <Badge variant="outline" className="text-cyan-400 border-cyan-400/30">{hours}h left</Badge>;
}

// Mini sparkline component for visual flair
function MiniSparkline({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  const points = trend === 'up' 
    ? "0,12 4,10 8,8 12,6 16,8 20,4 24,2" 
    : trend === 'down'
    ? "0,2 4,4 8,6 12,8 16,6 20,10 24,12"
    : "0,7 4,6 8,8 12,7 16,7 20,6 24,7";
  
  return (
    <svg width="28" height="14" viewBox="0 0 28 14" className="opacity-60">
      <polyline
        fill="none"
        stroke={trend === 'up' ? '#4ade80' : trend === 'down' ? '#f87171' : '#94a3b8'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

// Market stats ticker with live data - uses dedicated /api/realtime-status query
function MarketStatsTicker() {
  // Use a unique query key with explicit fetch to avoid cache collisions
  const { data: realtimeData, isLoading } = useQuery({
    queryKey: ['/api/realtime-status', 'market-ticker'],
    queryFn: async () => {
      const res = await fetch('/api/realtime-status');
      if (!res.ok) throw new Error('Failed to fetch realtime status');
      return res.json() as Promise<{ 
        prices: {
          futures: Record<string, { price: number; ageSeconds: number }>,
          crypto: Record<string, { price: number; ageSeconds: number }>
        }
      }>;
    },
    refetchInterval: 15000,
    staleTime: 10000,
  });

  // Build stats from realtime-status prices
  const stats = [
    { 
      label: 'NQ', 
      value: realtimeData?.prices?.futures?.NQ?.price,
      icon: TrendingUp,
      color: 'text-cyan-400'
    },
    { 
      label: 'ES', 
      value: realtimeData?.prices?.futures?.ES?.price,
      icon: BarChart3,
      color: 'text-blue-400'
    },
    { 
      label: 'Gold', 
      value: realtimeData?.prices?.futures?.GC?.price,
      icon: DollarSign,
      color: 'text-amber-400'
    },
    { 
      label: 'BTC', 
      value: realtimeData?.prices?.crypto?.BTC?.price,
      icon: Bitcoin,
      color: 'text-orange-400'
    },
    { 
      label: 'ETH', 
      value: realtimeData?.prices?.crypto?.ETH?.price,
      icon: Globe,
      color: 'text-purple-400'
    },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center gap-6 py-3 px-4 rounded-xl bg-gradient-to-r from-muted/40 via-muted/20 to-transparent border border-border/30">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <div className="flex flex-col gap-1">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 py-3 px-4 rounded-xl bg-gradient-to-r from-muted/40 via-muted/20 to-transparent border border-border/30 overflow-x-auto" data-testid="market-stats-ticker">
      <div className="flex items-center gap-2 pr-4 border-r border-border/30">
        <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-xs text-muted-foreground font-medium">LIVE</span>
      </div>
      {stats.map((stat, i) => {
        const Icon = stat.icon;
        const hasValue = stat.value !== undefined && stat.value !== null;
        
        return (
          <div key={stat.label} className="flex items-center gap-3 shrink-0">
            <div className="p-1.5 rounded-lg bg-muted/50">
              <Icon className={cn("h-4 w-4", stat.color)} />
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">{stat.label}</span>
              <span className="font-mono font-semibold text-sm">
                {hasValue ? (
                  stat.label === 'BTC' || stat.label === 'ETH' || stat.label === 'Gold' 
                    ? `$${stat.value?.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                    : stat.value?.toLocaleString(undefined, { maximumFractionDigits: 2 })
                ) : '--'}
              </span>
            </div>
            {i < stats.length - 1 && <Separator orientation="vertical" className="h-6 ml-2" />}
          </div>
        );
      })}
      <MiniSparkline trend="up" />
    </div>
  );
}

import { format, startOfDay, isSameDay, parseISO, subHours, subDays, subMonths, subYears, isAfter, isBefore } from "date-fns";
import { isWeekend, getNextTradingWeekStart, cn, getMarketStatus } from "@/lib/utils";
import { RiskDisclosure } from "@/components/risk-disclosure";
import { TimingDisplay } from "@/components/timing-display";
import { Calendar } from "@/components/ui/calendar";
import { getSignalGrade, getResolutionReasonLabel } from "@/lib/signal-grade";
import { AIResearchPanel } from "@/components/ai-research-panel";
import { UsageBadge } from "@/components/tier-gate";
import { useTier } from "@/hooks/useTier";
import { type TimeframeBucket, TIMEFRAME_LABELS, filterByTimeframe, getTimeframeCounts } from "@/lib/timeframes";
import { isRealLoss } from "@shared/constants";
import { MultiFactorAnalysis } from "@/components/multi-factor-analysis";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SmartMoneyFlowTracker } from "@/components/smart-money-flow-tracker";
import { TradeHeatmap } from "@/components/trade-heatmap";

interface BestSetup extends TradeIdea {
  convictionScore: number;
  signalCount: number;
  riskReward: number;
  mlBoost?: number;
  hourlyConfirmed?: boolean;
  breakoutBonus?: number;
  historicalWinRate?: number;
  sampleSize?: number;
  winRateBonus?: number;
  confidence?: number;
  thesis?: string;
}

interface BestSetupsResponse {
  period: string;
  count: number;
  totalOpen: number;
  setups: BestSetup[];
  generatedAt: string;
}

function BestSetupsCard() {
  const [period, setPeriod] = useState<'daily' | 'weekly'>('daily');
  const [expandedSetup, setExpandedSetup] = useState<string | null>(null);
  
  const { data: bestSetups, isLoading } = useQuery<BestSetupsResponse>({
    queryKey: ['/api/trade-ideas/best-setups', period],
    queryFn: async () => {
      const res = await fetch(`/api/trade-ideas/best-setups?period=${period}&limit=5`);
      if (!res.ok) throw new Error('Failed to fetch best setups');
      // NOTE: Direction filtering handled server-side based on real-time market bias
      return res.json();
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const getGradeBadge = (grade: string | null | undefined) => {
    if (!grade) return null;
    const colors: Record<string, string> = {
      'A+': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      'A': 'bg-green-500/20 text-green-400 border-green-500/30',
      'A-': 'bg-green-500/15 text-green-400/90 border-green-500/25',
      'B+': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
      'B': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    };
    return (
      <Badge variant="outline" className={cn("text-xs font-mono", colors[grade] || "")}>
        {grade}
      </Badge>
    );
  };

  return (
    <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent" data-testid="card-best-setups">
      <CardHeader className="py-3 px-4 border-b border-amber-500/20">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2 text-amber-400">
            <Star className="h-4 w-4 fill-amber-400" />
            Best Setups
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPeriod('daily')}
              className={cn(
                "h-7 px-2 text-xs",
                period === 'daily' ? "bg-amber-500/20 text-amber-400" : "text-muted-foreground"
              )}
              data-testid="button-setups-daily"
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPeriod('weekly')}
              className={cn(
                "h-7 px-2 text-xs",
                period === 'weekly' ? "bg-amber-500/20 text-amber-400" : "text-muted-foreground"
              )}
              data-testid="button-setups-weekly"
            >
              Week
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Top conviction plays - wait for the perfect pitch
        </p>
      </CardHeader>
      <CardContent className="p-3">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : bestSetups?.setups && bestSetups.setups.length > 0 ? (
          <div className="space-y-2">
            {bestSetups.setups.map((setup, idx) => {
              const isExpanded = expandedSetup === setup.id;
              return (
                <div key={setup.id} className="rounded-lg bg-muted/30 overflow-hidden">
                  <div 
                    className="flex items-center gap-3 p-2 hover-elevate cursor-pointer"
                    onClick={() => setExpandedSetup(isExpanded ? null : setup.id)}
                    data-testid={`setup-row-${setup.symbol}`}
                  >
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-sm">{setup.symbol}</span>
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          {setup.assetType?.toUpperCase() || 'STOCK'}
                        </Badge>
                        {getGradeBadge(setup.probabilityBand)}
                        <Badge variant="outline" className={cn(
                          "text-xs",
                          setup.direction === 'long' ? "text-green-400 border-green-500/30" : "text-red-400 border-red-500/30"
                        )}>
                          {setup.direction === 'long' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        </Badge>
                      </div>
                      {(setup.catalyst || setup.thesis) && (
                        <p className="text-xs text-foreground/80 mt-1 line-clamp-1">{setup.catalyst || setup.thesis}</p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{setup.signalCount} signals</span>
                        <span className="text-muted-foreground/50">|</span>
                        <span>{setup.riskReward}:1 R:R</span>
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-2">
                      <div>
                        <div className="flex items-center gap-1 text-amber-400">
                          <Flame className="h-3.5 w-3.5" />
                          <span className="font-mono font-bold text-sm">{setup.convictionScore}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">conviction</span>
                      </div>
                      <ChevronDown className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform",
                        isExpanded && "rotate-180"
                      )} />
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-3 pb-3 pt-1 border-t border-border/30 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Conviction Breakdown:</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex justify-between bg-background/50 rounded px-2 py-1">
                          <span className="text-muted-foreground">Base Confidence</span>
                          <span className="font-mono">{setup.confidence || 50}</span>
                        </div>
                        <div className="flex justify-between bg-background/50 rounded px-2 py-1">
                          <span className="text-muted-foreground">Signals ({setup.signalCount}x5)</span>
                          <span className="font-mono text-green-400">+{setup.signalCount * 5}</span>
                        </div>
                        <div className="flex justify-between bg-background/50 rounded px-2 py-1">
                          <span className="text-muted-foreground">R:R Bonus</span>
                          <span className="font-mono text-green-400">+{Math.min(setup.riskReward, 3) * 10}</span>
                        </div>
                        <div className="flex justify-between bg-background/50 rounded px-2 py-1">
                          <span className="text-muted-foreground">Grade Bonus</span>
                          <span className={cn("font-mono", 
                            (setup.probabilityBand === 'A+' || setup.probabilityBand === 'A') ? "text-green-400" : "text-muted-foreground"
                          )}>
                            {(setup.probabilityBand === 'A+' || setup.probabilityBand === 'A') ? '+10' : 
                             (setup.probabilityBand === 'A-' || setup.probabilityBand === 'B+') ? '+5' : '0'}
                          </span>
                        </div>
                        {setup.mlBoost !== undefined && setup.mlBoost !== 0 && (
                          <div className="flex justify-between bg-background/50 rounded px-2 py-1">
                            <span className="text-muted-foreground">ML Intelligence</span>
                            <span className={cn("font-mono", setup.mlBoost > 0 ? "text-cyan-400" : "text-red-400")}>
                              {setup.mlBoost > 0 ? `+${setup.mlBoost}` : setup.mlBoost}
                            </span>
                          </div>
                        )}
                        {setup.breakoutBonus !== undefined && setup.breakoutBonus > 0 && (
                          <div className="flex justify-between bg-background/50 rounded px-2 py-1">
                            <span className="text-muted-foreground">Breakout {setup.hourlyConfirmed ? '(Confirmed)' : ''}</span>
                            <span className="font-mono text-purple-400">+{setup.breakoutBonus}</span>
                          </div>
                        )}
                        {setup.winRateBonus !== undefined && setup.winRateBonus !== 0 && (
                          <div className="flex justify-between bg-background/50 rounded px-2 py-1">
                            <span className="text-muted-foreground">
                              Win Rate ({setup.historicalWinRate}% / {setup.sampleSize} trades)
                            </span>
                            <span className={cn("font-mono", setup.winRateBonus > 0 ? "text-green-400" : "text-red-400")}>
                              {setup.winRateBonus > 0 ? `+${setup.winRateBonus}` : setup.winRateBonus}
                            </span>
                          </div>
                        )}
                      </div>
                      {(setup.catalyst || setup.analysis || setup.thesis) && (
                        <div className="mt-2 text-xs">
                          <span className="text-muted-foreground">Thesis: </span>
                          <span className="text-foreground">{setup.catalyst || setup.analysis || setup.thesis}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <BestSetupsExplainer />
        )}
        {bestSetups && bestSetups.totalOpen > 0 && (
          <p className="text-xs text-muted-foreground text-center mt-3">
            Showing top {bestSetups.count} of {bestSetups.totalOpen} active ideas
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// Market Movers Card - Shows top surging/dropping stocks
interface MarketMover {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  volumeRatio: number;
  marketCap: number;
  alertReason?: string;
}

interface MarketMoversResponse {
  timestamp: string;
  session: string;
  scannedCount: number;
  topGainers: MarketMover[];
  topLosers: MarketMover[];
  volumeSpikes: MarketMover[];
  highAlertMovers: MarketMover[];
  catalystNews: any[];
  alerts: any[];
}

function MarketMoversCard() {
  const [tab, setTab] = useState<'gainers' | 'losers' | 'alerts'>('gainers');
  
  const { data: movers, isLoading, isError } = useQuery<MarketMoversResponse>({
    queryKey: ['/api/market-movers'],
    refetchInterval: 120000,
    staleTime: 60000,
  });

  const displayData = tab === 'gainers' 
    ? movers?.topGainers || [] 
    : tab === 'losers' 
    ? movers?.topLosers || []
    : movers?.highAlertMovers || [];

  return (
    <Card className="border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 to-transparent" data-testid="card-market-movers">
      <CardHeader className="py-3 px-4 border-b border-cyan-500/20">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2 text-cyan-400">
            <Flame className="h-4 w-4" />
            Market Movers
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTab('gainers')}
              className={cn(
                "h-7 px-2 text-xs",
                tab === 'gainers' ? "bg-green-500/20 text-green-400" : "text-muted-foreground"
              )}
              data-testid="button-movers-gainers"
            >
              <ArrowUpRight className="h-3 w-3 mr-1" />
              Gainers
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTab('losers')}
              className={cn(
                "h-7 px-2 text-xs",
                tab === 'losers' ? "bg-red-500/20 text-red-400" : "text-muted-foreground"
              )}
              data-testid="button-movers-losers"
            >
              <ArrowDownRight className="h-3 w-3 mr-1" />
              Losers
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTab('alerts')}
              className={cn(
                "h-7 px-2 text-xs",
                tab === 'alerts' ? "bg-amber-500/20 text-amber-400" : "text-muted-foreground"
              )}
              data-testid="button-movers-alerts"
            >
              <Zap className="h-3 w-3 mr-1" />
              Hot
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {movers?.scannedCount || 0} stocks scanned • {movers?.session || 'Market'} session
        </p>
      </CardHeader>
      <CardContent className="p-3">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-6 text-muted-foreground" data-testid="movers-error-state">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50 text-red-400" />
            <p className="text-sm">Failed to load market movers</p>
            <p className="text-xs mt-1">Try refreshing the page</p>
          </div>
        ) : displayData.length > 0 ? (
          <div className="space-y-2" data-testid={`movers-list-${tab}`}>
            {displayData.slice(0, 6).map((stock, idx) => (
              <div 
                key={stock.symbol} 
                className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-muted/30 hover-elevate cursor-pointer"
                data-testid={`mover-row-${stock.symbol}-${idx}`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="w-6 h-6 flex items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-bold">{idx + 1}</span>
                  <div className="min-w-0">
                    <span className="font-mono font-bold text-base" data-testid={`text-symbol-${stock.symbol}`}>{stock.symbol}</span>
                    {stock.volumeRatio > 1.5 && (
                      <Badge variant="outline" className="ml-2 text-xs border-amber-500/30 text-amber-400">
                        {stock.volumeRatio.toFixed(1)}x vol
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="font-mono text-base font-medium" data-testid={`text-price-${stock.symbol}`}>${stock.price.toFixed(2)}</span>
                  <p className={cn(
                    "text-sm font-mono font-bold",
                    stock.changePercent > 0 ? "text-green-400" : "text-red-400"
                  )} data-testid={`text-change-${stock.symbol}`}>
                    {stock.changePercent > 0 ? '+' : ''}{stock.changePercent.toFixed(1)}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <InlineEmptyState 
            message="No movers found. Check back during market hours." 
          />
        )}
      </CardContent>
    </Card>
  );
}

export default function TradeDeskPage() {
  const { canGenerateTradeIdea } = useTier();
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const initialTab = urlParams.get('tab') === 'futures' ? 'futures' : 'research';
  const [mainTab, setMainTab] = useState<'research' | 'futures'>(initialTab);
  
  const [tradeIdeaSearch, setTradeIdeaSearch] = useState("");
  const [activeDirection, setActiveDirection] = useState<"long" | "short" | "day_trade" | "all">("all");
  const [activeSource, setActiveSource] = useState<IdeaSource | "all">("all");
  const [activeAssetType, setActiveAssetType] = useState<"stock" | "penny_stock" | "option" | "crypto" | "all">("all");
  
  // User-controlled asset type order (stored in localStorage)
  const [assetTypeOrder, setAssetTypeOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem('tradeDesk_assetTypeOrder');
    // Default: Options first, then stocks, penny stocks, futures, crypto
    return saved ? JSON.parse(saved) : ['option', 'stock', 'penny_stock', 'future', 'crypto'];
  });
  
  // Save order to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('tradeDesk_assetTypeOrder', JSON.stringify(assetTypeOrder));
  }, [assetTypeOrder]);
  
  // Move an asset type up or down in the order
  const moveAssetType = (assetType: string, direction: 'up' | 'down') => {
    setAssetTypeOrder(prev => {
      const idx = prev.indexOf(assetType);
      if (idx === -1) return prev;
      const newOrder = [...prev];
      if (direction === 'up' && idx > 0) {
        [newOrder[idx], newOrder[idx - 1]] = [newOrder[idx - 1], newOrder[idx]];
      } else if (direction === 'down' && idx < prev.length - 1) {
        [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
      }
      return newOrder;
    });
  };
  const [dateRange, setDateRange] = useState<string>('all');
  const [expandedIdeaId, setExpandedIdeaId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'heatmap'>('list');
  
  // NEW: Source tabs and status view state
  const [sourceTab, setSourceTab] = useState<IdeaSource | "all">("all");
  const [statusView, setStatusView] = useState<'all' | 'published' | 'draft'>('published');
  
  // Timeframe tabs for temporal filtering
  const [activeTimeframe, setActiveTimeframe] = useState<TimeframeBucket>('all');
  
  // Trade Type filter (Day vs Swing) - persisted to localStorage
  const [tradeTypeFilter, setTradeTypeFilter] = useState<'all' | 'day' | 'swing'>(() => {
    const saved = localStorage.getItem('tradeDesk_tradeTypeFilter');
    return (saved as 'all' | 'day' | 'swing') || 'all';
  });
  
  // Price tier filter - for finding low-priced stocks for shares or options - persisted
  const [priceTierFilter, setPriceTierFilter] = useState<'all' | 'under5' | 'under10' | 'under15' | 'under25'>(() => {
    const saved = localStorage.getItem('tradeDesk_priceTierFilter');
    return (saved as 'all' | 'under5' | 'under10' | 'under15' | 'under25') || 'all';
  });
  
  // Filter state for new filter toolbar - persisted to localStorage
  const [expiryFilter, setExpiryFilter] = useState<string>('all');
  const [assetTypeFilter, setAssetTypeFilter] = useState<string>(() => {
    const saved = localStorage.getItem('tradeDesk_assetTypeFilter');
    return saved || 'all';
  });
  // Default to 'quality' which excludes D/F tier ideas (user requested no more D ratings) - persisted
  const [gradeFilter, setGradeFilter] = useState<string>(() => {
    const saved = localStorage.getItem('tradeDesk_gradeFilter');
    return saved || 'quality';
  });
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('priority');
  const [symbolSearch, setSymbolSearch] = useState<string>('');
  
  // Date filter state (Posted date)
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [customDate, setCustomDate] = useState<Date | undefined>(undefined);
  
  // Multi-Factor Analysis panel state
  const [analysisSymbol, setAnalysisSymbol] = useState<string | null>(null);
  
  // Advanced filters collapsed by default for cleaner UI
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  
  // Pagination state
  const [visibleCount, setVisibleCount] = useState(50);
  
  // Per-group pagination for Active Research accordion
  const [groupPage, setGroupPage] = useState<Record<string, number>>({});
  const ITEMS_PER_PAGE = 20;
  
  
  // Persist key filters to localStorage
  useEffect(() => {
    localStorage.setItem('tradeDesk_tradeTypeFilter', tradeTypeFilter);
  }, [tradeTypeFilter]);
  
  useEffect(() => {
    localStorage.setItem('tradeDesk_priceTierFilter', priceTierFilter);
  }, [priceTierFilter]);
  
  useEffect(() => {
    localStorage.setItem('tradeDesk_assetTypeFilter', assetTypeFilter);
  }, [assetTypeFilter]);
  
  useEffect(() => {
    localStorage.setItem('tradeDesk_gradeFilter', gradeFilter);
  }, [gradeFilter]);
  
  // Reset pagination when filters change
  useEffect(() => {
    setVisibleCount(50);
    setGroupPage({});
  }, [expiryFilter, assetTypeFilter, gradeFilter, statusFilter, sortBy, symbolSearch, dateRange, tradeIdeaSearch, activeDirection, activeSource, activeAssetType, sourceTab, statusView, activeTimeframe, tradeTypeFilter, priceTierFilter, dateFilter, customDate]);
  
  const { toast } = useToast();
  
  // Memoize market status to avoid recalculating on every render
  const marketStatus = useMemo(() => getMarketStatus(), []);

  const { data: tradeIdeas = [], isLoading: ideasLoading } = useQuery<TradeIdea[]>({
    queryKey: ['/api/trade-ideas'],
    refetchInterval: 5000, // FAST UPDATE: 5s for active trading
    staleTime: 2000,
  });

  const { data: marketData = [] } = useQuery<MarketData[]>({
    queryKey: ['/api/market-data'],
    refetchInterval: 60000, // 60s for market data
    staleTime: 30000,
  });

  const { data: catalysts = [] } = useQuery<Catalyst[]>({
    queryKey: ['/api/catalysts'],
    refetchInterval: 3600000,
    staleTime: 3600000, // 1 hour stale time for catalysts (slow-changing data)
  });

  const priceMap = tradeIdeas.reduce((acc, idea) => {
    if (idea.currentPrice != null) {
      acc[idea.symbol] = idea.currentPrice;
    }
    return acc;
  }, {} as Record<string, number>);
  
  marketData.forEach(data => {
    if (!priceMap[data.symbol]) {
      priceMap[data.symbol] = data.currentPrice;
    }
  });

  // Helper to get date range bounds for Posted date filter
  const getDateRangeBoundsForCounts = (filter: string, customDateVal?: Date) => {
    const now = new Date();
    switch (filter) {
      case 'today': 
        return { start: startOfDay(now), end: null };
      case 'yesterday': {
        const yesterdayStart = startOfDay(subDays(now, 1));
        const yesterdayEnd = new Date(startOfDay(now).getTime() - 1);
        return { start: yesterdayStart, end: yesterdayEnd };
      }
      case '3d': 
        return { start: subDays(now, 3), end: null };
      case '7d': 
        return { start: subDays(now, 7), end: null };
      case '30d': 
        return { start: subDays(now, 30), end: null };
      case 'custom':
        if (!customDateVal) return { start: new Date(0), end: null };
        const dayStart = startOfDay(customDateVal);
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
        return { start: dayStart, end: dayEnd };
      case 'all':
      default: 
        return { start: new Date(0), end: null };
    }
  };

  // Memoized count helpers for source tabs and status
  // Counts should reflect ALL active filters except source filter itself
  const sourceCounts = useMemo(() => {
    const dateBounds = getDateRangeBoundsForCounts(dateFilter, customDate);
    
    // Apply all filters except source filter
    const baseFiltered = tradeIdeas.filter(idea => {
      // Status view filter
      const ideaStatus = idea.status || 'published';
      if (statusView !== 'all' && ideaStatus !== statusView) return false;
      
      // Posted date filter
      const ideaDate = parseISO(idea.timestamp);
      if (dateFilter !== 'all') {
        if (isBefore(ideaDate, dateBounds.start)) return false;
        if (dateBounds.end !== null && isAfter(ideaDate, dateBounds.end)) return false;
      }
      
      // Trade type filter
      if (tradeTypeFilter !== 'all') {
        if (tradeTypeFilter === 'day' && idea.holdingPeriod !== 'day') return false;
        if (tradeTypeFilter === 'swing' && !['swing', 'position', 'week-ending'].includes(idea.holdingPeriod)) return false;
      }
      
      // Price tier filter - use currentPrice (live) or entryPrice as fallback
      if (priceTierFilter !== 'all') {
        const price = idea.currentPrice || idea.entryPrice || 0;
        if (priceTierFilter === 'under5' && price >= 5) return false;
        if (priceTierFilter === 'under10' && price >= 10) return false;
        if (priceTierFilter === 'under15' && price >= 15) return false;
        if (priceTierFilter === 'under25' && price >= 25) return false;
      }
      
      // Status filter (active/won/lost)
      const status = (idea.outcomeStatus || '').trim().toLowerCase();
      if (statusFilter !== 'all') {
        if (statusFilter === 'active' && status !== 'open' && status !== '') return false;
        if (statusFilter === 'won' && status !== 'hit_target') return false;
        if (statusFilter === 'lost' && status !== 'hit_stop') return false;
      }
      
      // Timeframe filter
      if (activeTimeframe !== 'all' && idea.expiryDate) {
        const today = startOfDay(new Date());
        const expiry = startOfDay(new Date(idea.expiryDate));
        const daysToExp = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (activeTimeframe === 'today_tomorrow' && !(daysToExp >= 0 && daysToExp <= 1)) return false;
        if (activeTimeframe === 'few_days' && !(daysToExp >= 2 && daysToExp <= 5)) return false;
        if (activeTimeframe === 'next_week' && !(daysToExp >= 0 && daysToExp <= 7)) return false;
      }
      
      return true;
    });
    
    const counts: Record<string, number> = {
      all: baseFiltered.length,
      ai: 0,
      quant: 0,
      hybrid: 0,
      chart_analysis: 0,
      flow: 0,
      news: 0,
      manual: 0,
    };
    
    baseFiltered.forEach(idea => {
      const source = idea.source || 'quant';
      if (counts[source] !== undefined) {
        counts[source]++;
      }
    });
    
    return counts;
  }, [tradeIdeas, statusView, dateFilter, customDate, tradeTypeFilter, statusFilter, activeTimeframe]);

  const statusCounts = useMemo(() => {
    const counts = {
      all: tradeIdeas.length,
      published: 0,
      draft: 0,
    };
    
    tradeIdeas.forEach(idea => {
      // Treat missing status field as 'published' for backward compatibility
      const status = idea.status || 'published';
      if (status === 'published') {
        counts.published++;
      } else if (status === 'draft') {
        counts.draft++;
      }
    });
    
    return counts;
  }, [tradeIdeas]);

  // Generate ideas for a specific timeframe/holding period
  const generateTimeframeIdeas = useMutation({
    mutationFn: async (targetTimeframe: TimeframeBucket) => {
      // Map timeframe bucket to holding period
      const holdingPeriodMap: Record<TimeframeBucket, string | undefined> = {
        'all': undefined,
        'today_tomorrow': 'day',
        'few_days': 'swing',
        'next_week': 'swing',
        'next_month': 'position',
      };
      const holdingPeriod = holdingPeriodMap[targetTimeframe];
      return await apiRequest('POST', '/api/quant/generate-ideas', { 
        targetHoldingPeriod: holdingPeriod 
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/stats'] });
      const label = TIMEFRAME_LABELS[activeTimeframe] || 'selected timeframe';
      toast({
        title: `${label} Research Generated`,
        description: `Generated ${data.count || data.newIdeas || 0} research briefs for ${label.toLowerCase()}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate ideas",
        variant: "destructive"
      });
    }
  });

  const generateQuantIdeas = useMutation({
    mutationFn: async (timeframe?: TimeframeBucket) => {
      return await apiRequest('POST', '/api/quant/generate-ideas', { 
        timeframe: timeframe || 'all',
        holdingPeriod: timeframe === 'today_tomorrow' ? 'day' : 
                       timeframe === 'few_days' ? 'swing' : 
                       timeframe === 'next_week' ? 'week-ending' : 
                       timeframe === 'next_month' ? 'position' : undefined
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/stats'] });
      const label = activeTimeframe !== 'all' ? TIMEFRAME_LABELS[activeTimeframe] : '';
      toast({
        title: "Quant Research Generated",
        description: `Generated ${data.count || data.newIdeas || 0} new quantitative research briefs${label ? ` for ${label}` : ''}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate quant ideas",
        variant: "destructive"
      });
    }
  });

  const generateAIIdeas = useMutation({
    mutationFn: async (timeframe?: TimeframeBucket) => {
      return await apiRequest('POST', '/api/ai/generate-ideas', {
        marketContext: "Current market conditions with focus on stocks, options, and crypto",
        timeframe: timeframe || 'all',
        holdingPeriod: timeframe === 'today_tomorrow' ? 'day' : 
                       timeframe === 'few_days' ? 'swing' : 
                       timeframe === 'next_week' ? 'week-ending' : 
                       timeframe === 'next_month' ? 'position' : undefined
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/stats'] });
      const label = activeTimeframe !== 'all' ? TIMEFRAME_LABELS[activeTimeframe] : '';
      toast({
        title: "AI Research Generated",
        description: `Generated ${data.count || 0} new AI-powered research briefs${label ? ` for ${label}` : ''}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate AI ideas",
        variant: "destructive"
      });
    }
  });

  const generateHybridIdeas = useMutation({
    mutationFn: async (timeframe?: TimeframeBucket) => {
      return await apiRequest('POST', '/api/hybrid/generate-ideas', { 
        timeframe: timeframe || 'all',
        holdingPeriod: timeframe === 'today_tomorrow' ? 'day' : 
                       timeframe === 'few_days' ? 'swing' : 
                       timeframe === 'next_week' ? 'week-ending' : 
                       timeframe === 'next_month' ? 'position' : undefined
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/stats'] });
      const label = activeTimeframe !== 'all' ? TIMEFRAME_LABELS[activeTimeframe] : '';
      toast({
        title: "Hybrid Research Generated",
        description: `Generated ${data.count || 0} new hybrid (AI+Quant) research briefs${label ? ` for ${label}` : ''}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate hybrid ideas",
        variant: "destructive"
      });
    }
  });

  const generateNewsIdeas = useMutation({
    mutationFn: async (timeframe?: TimeframeBucket) => {
      return await apiRequest('POST', '/api/news/generate-ideas', { 
        timeframe: timeframe || 'all',
        holdingPeriod: timeframe === 'today_tomorrow' ? 'day' : 
                       timeframe === 'few_days' ? 'swing' : 
                       timeframe === 'next_week' ? 'week-ending' : 
                       timeframe === 'next_month' ? 'position' : undefined
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/stats'] });
      const label = activeTimeframe !== 'all' ? TIMEFRAME_LABELS[activeTimeframe] : '';
      toast({
        title: "News Research Generated",
        description: `Generated ${data.count || 0} news-driven research briefs${label ? ` for ${label}` : ''}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate news ideas",
        variant: "destructive"
      });
    }
  });

  const generateFlowIdeas = useMutation({
    mutationFn: async (targetTimeframe?: TimeframeBucket) => {
      // Map timeframe bucket to holding period for flow scanner
      const holdingPeriodMap: Record<TimeframeBucket, string | undefined> = {
        'all': undefined,
        'today_tomorrow': 'day',
        'few_days': 'swing',
        'next_week': 'swing',
        'next_month': 'position',
      };
      const holdingPeriod = holdingPeriodMap[targetTimeframe || 'all'];
      return await apiRequest('POST', '/api/flow/generate-ideas', { holdingPeriod });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/stats'] });
      const timeframeLabel = activeTimeframe !== 'all' ? TIMEFRAME_LABELS[activeTimeframe] : 'All';
      toast({
        title: "Flow Scanner Complete",
        description: data.message || `Scanned ${timeframeLabel} options, found ${data.count || 0} flow patterns`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Scan Failed",
        description: error.message || "Failed to scan options flow",
        variant: "destructive"
      });
    }
  });

  // Send trade idea to Discord manually
  const sendToDiscordMutation = useMutation({
    mutationFn: async (ideaId: string) => {
      const response = await apiRequest("POST", `/api/trade-ideas/${ideaId}/share-discord`);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Sent to Discord",
        description: data.message || "Trade idea shared to Discord channel",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Discord Send Failed",
        description: error.message || "Could not send to Discord",
        variant: "destructive"
      });
    }
  });

  const handleToggleExpand = (ideaId: string) => {
    setExpandedIdeaId(expandedIdeaId === ideaId ? null : ideaId);
  };

  const handleCollapseAll = () => {
    setExpandedIdeaId(null);
  };

  const calculatePriorityScore = (idea: TradeIdea): number => {
    const confidenceScore = idea.confidenceScore || 0;
    const rrRatio = idea.riskRewardRatio || 0;
    const hitProbability = idea.targetHitProbability || 0;
    
    return (confidenceScore * 0.4) + (rrRatio * 15) + (hitProbability * 0.3);
  };

  // Calculate date range bounds for Posted date filter
  const getDateRangeBounds = () => {
    const now = new Date();
    switch (dateFilter) {
      case 'today': 
        return { start: startOfDay(now), end: null };
      case 'yesterday': {
        const yesterdayStart = startOfDay(subDays(now, 1));
        const yesterdayEnd = new Date(startOfDay(now).getTime() - 1);
        return { start: yesterdayStart, end: yesterdayEnd };
      }
      case '3d': 
        return { start: subDays(now, 3), end: null };
      case '7d': 
        return { start: subDays(now, 7), end: null };
      case '30d': 
        return { start: subDays(now, 30), end: null };
      case 'custom':
        if (!customDate) return { start: new Date(0), end: null };
        const dayStart = startOfDay(customDate);
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
        return { start: dayStart, end: dayEnd };
      case 'all':
      default: 
        return { start: new Date(0), end: null };
    }
  };

  // Force default to today if not set to see fresh bot activity
  useEffect(() => {
    if (!dateFilter || dateFilter === 'all') {
      setDateFilter('today');
    }
  }, []);

  const rangeStart = (() => {
    const now = new Date();
    switch (dateRange) {
      case 'today':
        return startOfDay(now);
      case '7d':
        return subDays(now, 7);
      case '30d':
        return subDays(now, 30);
      case '3m':
        return subMonths(now, 3);
      case '1y':
        return subYears(now, 1);
      case 'all':
      default:
        return new Date(0);
    }
  })();

  const filteredIdeas = tradeIdeas.filter(idea => {
    // NOTE: SHORT filtering is now handled server-side based on real-time market bias
    // When market is bullish (trending_up + risk_on), SHORTs are filtered out
    // When market is bearish/volatile, SHORTs become relevant and are shown

    const matchesSearch = !tradeIdeaSearch || 
      idea.symbol.toLowerCase().includes(tradeIdeaSearch.toLowerCase()) ||
      (idea.catalyst || '').toLowerCase().includes(tradeIdeaSearch.toLowerCase());

    const isDayTrade = idea.holdingPeriod === 'day';
    const matchesDirection = activeDirection === "all" || 
      (activeDirection === "day_trade" && isDayTrade) ||
      (activeDirection !== "day_trade" && idea.direction === activeDirection);
    
    const matchesSource = activeSource === "all" || idea.source === activeSource;
    const matchesAssetType = activeAssetType === "all" || idea.assetType === activeAssetType;
    // Legacy activeGrade is always "all" - real filtering happens via gradeFilter with signal counts
    const matchesGrade = true;
    
    const ideaDate = parseISO(idea.timestamp);
    const matchesDateRange = dateRange === 'all' || (!isBefore(ideaDate, rangeStart) || ideaDate.getTime() === rangeStart.getTime());
    
    // Posted date filter
    const dateBounds = getDateRangeBounds();
    const matchesDateFilter = dateFilter === 'all' || (
      !isBefore(ideaDate, dateBounds.start) && 
      (dateBounds.end === null || !isAfter(ideaDate, dateBounds.end))
    );
    
    // NEW: Filter by source tab
    const matchesSourceTab = sourceTab === "all" || idea.source === sourceTab;
    
    // NEW: Filter by status view (treat missing status as 'published' for backward compatibility)
    const ideaStatus = idea.status || 'published';
    const matchesStatusView = statusView === 'all' || ideaStatus === statusView;
    
    // Trade Type filter: day trades vs swing trades (PDT-friendly)
    // 'day' = holdingPeriod 'day', 'swing' = 'swing', 'position', or 'week-ending'
    const matchesTradeType = tradeTypeFilter === 'all' || 
      (tradeTypeFilter === 'day' && idea.holdingPeriod === 'day') ||
      (tradeTypeFilter === 'swing' && ['swing', 'position', 'week-ending'].includes(idea.holdingPeriod));
    
    // Price tier filter - use currentPrice (live) or entryPrice as fallback
    const price = idea.currentPrice || idea.entryPrice || 0;
    const matchesPriceTier = priceTierFilter === 'all' ||
      (priceTierFilter === 'under5' && price < 5) ||
      (priceTierFilter === 'under10' && price < 10) ||
      (priceTierFilter === 'under15' && price < 15) ||
      (priceTierFilter === 'under25' && price < 25);
    
    // Status filter: ACTIVE, WON, LOST
    const status = (idea.outcomeStatus || '').trim().toLowerCase();
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'active' && (status === 'open' || status === '')) ||
      (statusFilter === 'won' && status === 'hit_target') ||
      (statusFilter === 'lost' && status === 'hit_stop');
    
    return matchesSearch && matchesDirection && matchesSource && matchesAssetType && matchesGrade && matchesDateRange && matchesDateFilter && matchesSourceTab && matchesStatusView && matchesTradeType && matchesPriceTier && matchesStatus;
  });

  const dayTrades = useMemo(() => filteredIdeas.filter(i => i.holdingPeriod === 'day'), [filteredIdeas]);
  const swingTrades = useMemo(() => filteredIdeas.filter(i => ['swing', 'position', 'week-ending'].includes(i.holdingPeriod)), [filteredIdeas]);

  const TradeTable = ({ ideas, title }: { ideas: TradeIdea[], title: string }) => (
    <Card className="border-muted/50">
      <CardHeader className="py-3 px-4 border-b border-muted/50 bg-muted/5">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            {title === "Day Trades" ? <Clock className="h-4 w-4 text-amber-400" /> : <CalendarClock className="h-4 w-4 text-cyan-400" />}
            {title.toUpperCase()}
            <Badge variant="secondary" className="ml-2 font-mono">{ideas.length}</Badge>
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-muted/10 text-muted-foreground font-mono text-[10px] uppercase tracking-wider border-b border-muted/50">
              <tr>
                <th className="px-4 py-2 font-semibold">Symbol</th>
                <th className="px-4 py-2 font-semibold">Signal</th>
                <th className="px-4 py-2 font-semibold">Entry</th>
                <th className="px-4 py-2 font-semibold">Target/Stop</th>
                <th className="px-4 py-2 font-semibold">R:R</th>
                <th className="px-4 py-2 font-semibold">Time Remaining</th>
                <th className="px-4 py-2 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-muted/30">
              {ideas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6">
                    <InlineEmptyState message={`No active ${title.toLowerCase()} found matching filters.`} />
                  </td>
                </tr>
              ) : (
                ideas.map((idea) => {
                  const currentPrice = priceMap[idea.symbol];
                  const isLong = idea.direction === 'long';
                  const stopLossPercent = isLong
                    ? ((idea.stopLoss - idea.entryPrice) / idea.entryPrice) * 100
                    : ((idea.entryPrice - idea.stopLoss) / idea.entryPrice) * 100;
                  const targetPercent = isLong
                    ? ((idea.targetPrice - idea.entryPrice) / idea.entryPrice) * 100
                    : ((idea.entryPrice - idea.targetPrice) / idea.entryPrice) * 100;

                  return (
                    <tr key={idea.id} className="hover:bg-muted/5 transition-colors group">
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-col">
                          <span className="font-bold font-mono text-base">{idea.symbol}</span>
                          <span className="text-[10px] text-muted-foreground uppercase">{idea.assetType}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <Badge variant={isLong ? "default" : "destructive"} className="text-[10px] h-5 px-1.5 font-bold">
                          {idea.direction.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="font-mono font-bold">{formatCurrency(idea.entryPrice)}</div>
                        {currentPrice && (
                          <div className="text-[10px] text-muted-foreground">
                            Now: {formatCurrency(currentPrice)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-bullish font-mono font-bold">{formatCurrency(idea.targetPrice)}</span>
                            <span className="text-[10px] text-bullish font-semibold">({formatPercent(targetPercent)})</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-bearish font-mono font-bold">{formatCurrency(idea.stopLoss)}</span>
                            <span className="text-[10px] text-bearish font-semibold">({formatPercent(stopLossPercent)})</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <Badge variant={(idea.riskRewardRatio ?? 0) >= 2 ? "default" : "secondary"} className="text-[10px] h-5 font-bold bg-muted/50">
                          {idea.riskRewardRatio?.toFixed(1)}:1
                        </Badge>
                      </td>
                      <td className="px-4 py-3 align-top">
                        {idea.exitBy ? (
                          <TimingDisplay 
                            timestamp={idea.exitBy} 
                            label="Exit By" 
                            showCountdown 
                            className="border-none bg-transparent p-0 h-auto" 
                          />
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => handleToggleExpand(idea.id.toString())} className="h-8 px-2 text-xs">
                            Details
                          </Button>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8 text-muted-foreground hover:text-indigo-400"
                            onClick={() => sendToDiscordMutation.mutate(idea.id.toString())}
                            disabled={sendToDiscordMutation.isPending}
                            title="Send to Discord"
                            data-testid={`button-discord-${idea.id}`}
                          >
                            <Send className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-yellow-400">
                            <Star className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );

  // Trade type counts - computed from ALL ideas (before trade type filter is applied)
  // This allows the toggle to show accurate counts even when filtered
  const tradeTypeCounts = useMemo(() => {
    // Count from ideas BEFORE trade type filter
    const baseFiltered = tradeIdeas.filter(idea => {
      const matchesSearch = !tradeIdeaSearch || 
        idea.symbol.toLowerCase().includes(tradeIdeaSearch.toLowerCase()) ||
        (idea.catalyst || '').toLowerCase().includes(tradeIdeaSearch.toLowerCase());
      const matchesSourceTab = sourceTab === "all" || idea.source === sourceTab;
      const ideaStatus = idea.status || 'published';
      const matchesStatusView = statusView === 'all' || ideaStatus === statusView;
      const status = (idea.outcomeStatus || '').trim().toLowerCase();
      const isActive = status === 'open' || status === '';
      return matchesSearch && matchesSourceTab && matchesStatusView && isActive;
    });
    
    return {
      all: baseFiltered.length,
      day: baseFiltered.filter(i => i.holdingPeriod === 'day').length,
      swing: baseFiltered.filter(i => ['swing', 'position', 'week-ending'].includes(i.holdingPeriod)).length,
    };
  }, [tradeIdeas, tradeIdeaSearch, sourceTab, statusView]);

  // Timeframe counts - computed from ACTIVE ideas only (outcomeStatus === 'open')
  // This ensures tabs show actionable plays, not old historical data
  const timeframeCounts = useMemo(() => {
    const activeOnly = filteredIdeas.filter(idea => {
      const status = (idea.outcomeStatus || '').trim().toLowerCase();
      return status === 'open' || status === '';
    });
    return getTimeframeCounts(activeOnly);
  }, [filteredIdeas]);

  // Helper to normalize outcomeStatus (trim whitespace + lowercase)
  const normalizeStatus = (status: string | null | undefined): string => {
    return (status || '').trim().toLowerCase();
  };

  const isTodayIdea = (idea: TradeIdea) => {
    const ideaDate = parseISO(idea.timestamp);
    const today = new Date();
    return isSameDay(ideaDate, today) && normalizeStatus(idea.outcomeStatus) === 'open';
  };
  
  const isVeryFreshIdea = (idea: TradeIdea) => {
    const ideaDate = parseISO(idea.timestamp);
    const cutoffTime = subHours(new Date(), 2);
    return ideaDate >= cutoffTime && normalizeStatus(idea.outcomeStatus) === 'open';
  };

  // Helper: Apply non-expiry filters (asset type, grade, symbol, status)
  const applyNonExpiryFilters = (ideas: TradeIdea[]) => {
    let filtered = [...ideas];

    // 1. Asset type filter
    if (assetTypeFilter !== 'all') {
      filtered = filtered.filter(idea => idea.assetType === assetTypeFilter);
    }

    // 2. Grade filter - Use stored probabilityBand (backend-assigned grade)
    // 'quality' = A+, A, B, C (excludes D/F) - default for cleaner trade desk
    if (gradeFilter !== 'all') {
      filtered = filtered.filter(idea => {
        if (gradeFilter === 'LOTTO') return idea.isLottoPlay;
        
        // Use the stored grade from backend (probabilityBand), NOT recalculated getSignalGrade
        const storedGrade = idea.probabilityBand || 'C';
        
        // Quality filter: Show only A+, A, B, C - exclude D and F grades
        if (gradeFilter === 'quality') {
          const qualityGrades = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C'];
          return qualityGrades.includes(storedGrade);
        }
        if (gradeFilter === 'A') return storedGrade === 'A+' || storedGrade === 'A' || storedGrade === 'A-';
        if (gradeFilter === 'B') return storedGrade === 'B+' || storedGrade === 'B' || storedGrade === 'B-';
        if (gradeFilter === 'C') return storedGrade === 'C+' || storedGrade === 'C' || storedGrade === 'C-';
        if (gradeFilter === 'D') return storedGrade === 'D+' || storedGrade === 'D' || storedGrade === 'D-' || storedGrade === 'F';
        return true;
      });
    }

    // 3. Symbol search
    if (symbolSearch) {
      filtered = filtered.filter(idea => idea.symbol.toUpperCase().includes(symbolSearch));
    }

    // 4. TASK 1: Status filter (normalized: trim + lowercase)
    if (statusFilter !== 'all') {
      filtered = filtered.filter(idea => {
        const status = normalizeStatus(idea.outcomeStatus);
        switch (statusFilter) {
          case 'active': return status === 'open';
          case 'won': return status === 'hit_target';
          case 'lost': return status === 'hit_stop';
          case 'expired': return status === 'expired';
          default: return true;
        }
      });
    }

    return filtered;
  };

  // Apply all filters and sorting to trade ideas
  const filterAndSortIdeas = (ideas: TradeIdea[]) => {
    // First apply non-expiry filters
    let filtered = applyNonExpiryFilters(ideas);

    // Then apply expiry filter
    if (expiryFilter !== 'all') {
      const today = startOfDay(new Date());
      filtered = filtered.filter(idea => {
        // Non-option trades (stocks/crypto) don't have expiry dates
        // When filtering by specific expiry bucket, exclude them
        if (!idea.expiryDate && !idea.exitBy) {
          return false; // Hide stocks/crypto when filtering by expiry buckets
        }
        
        const expiry = startOfDay(new Date(idea.expiryDate || idea.exitBy!));
        const daysToExp = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        // Apply specific expiry filter
        switch (expiryFilter) {
          case 'expired': return daysToExp < 0; // Expired (yesterday or earlier)
          case '7d': return daysToExp >= 0 && daysToExp <= 7; // 0-7 days (includes today)
          case '14d': return daysToExp > 7 && daysToExp <= 14; // 8-14 days (non-overlapping)
          case '30d': return daysToExp > 14 && daysToExp <= 60; // 15-60 days (monthly range)
          case '90d': return daysToExp > 60 && daysToExp <= 270; // 61-270 days (quarterly)
          case 'leaps': return daysToExp > 270; // 270+ days (LEAPS)
          default: return true;
        }
      });
    }

    // Finally sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'priority': {
          // Priority-based sorting: Fresh → Active → Closed/Expired
          const getPriorityRank = (idea: TradeIdea): number => {
            // Normalize outcomeStatus (trim whitespace + lowercase)
            const status = normalizeStatus(idea.outcomeStatus);
            
            if (isVeryFreshIdea(idea)) return 0; // Fresh trades (last 2h, open)
            if (status === 'open') return 1; // Active trades (open)
            return 2; // Closed/Expired trades
          };
          
          const aRank = getPriorityRank(a);
          const bRank = getPriorityRank(b);
          
          // Sort by rank first
          if (aRank !== bRank) {
            return aRank - bRank;
          }
          
          // Within same rank, sort by timestamp (newest first)
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        }
        case 'timestamp':
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        case 'expiry':
          const aExp = new Date(a.expiryDate || a.exitBy || a.timestamp).getTime();
          const bExp = new Date(b.expiryDate || b.exitBy || b.timestamp).getTime();
          return aExp - bExp;
        case 'confidence':
          // Sort by signal count (signal strength) - more signals = higher strength
          const aSignals = (a.qualitySignals?.length || 0);
          const bSignals = (b.qualitySignals?.length || 0);
          return bSignals - aSignals;
        case 'rr':
          return b.riskRewardRatio - a.riskRewardRatio;
        case 'price_asc':
          // Cheap to expensive (by entry price / premium)
          return (a.entryPrice || 0) - (b.entryPrice || 0);
        case 'price_desc':
          // Expensive to cheap (by entry price / premium)
          return (b.entryPrice || 0) - (a.entryPrice || 0);
        default:
          return 0;
      }
    });

    return filtered;
  };

  // Apply timeframe filtering - only to active trades when a specific timeframe is selected
  const timeframeFilteredIdeas = useMemo(() => {
    if (activeTimeframe === 'all') {
      return filteredIdeas;
    }
    // When filtering by timeframe, only include active (open) trades
    const activeOnly = filteredIdeas.filter(idea => {
      const status = normalizeStatus(idea.outcomeStatus);
      return status === 'open' || status === '';
    });
    return filterByTimeframe(activeOnly, activeTimeframe);
  }, [filteredIdeas, activeTimeframe]);
  
  const filteredAndSortedIdeas = filterAndSortIdeas(timeframeFilteredIdeas);

  // DUAL-SECTION: Split into active and closed trades
  const activeIdeas = filteredAndSortedIdeas.filter(idea => normalizeStatus(idea.outcomeStatus) === 'open');
  const closedIdeas = filteredAndSortedIdeas.filter(idea => {
    const status = normalizeStatus(idea.outcomeStatus);
    return status === 'hit_target' || status === 'hit_stop' || status === 'expired';
  });

  // Determine which ideas to show based on status filter
  // When statusFilter is 'all' or 'active', show active trades. 
  // If 'today' filter is active, we should also show expired trades from today if user wants to see everything system did today.
  const displayIdeas = useMemo(() => {
    if (statusFilter === 'won') return closedIdeas.filter(i => normalizeStatus(i.outcomeStatus) === 'hit_target');
    if (statusFilter === 'lost') return closedIdeas.filter(i => normalizeStatus(i.outcomeStatus) === 'hit_stop');
    if (statusFilter === 'expired') return closedIdeas.filter(i => normalizeStatus(i.outcomeStatus) === 'expired');
    
    if (dateFilter === 'today') {
      // For "Today" view, show everything (active + closed) to show bot activity
      return [...activeIdeas, ...closedIdeas];
    }
    
    return activeIdeas;
  }, [statusFilter, activeIdeas, closedIdeas, dateFilter]);

  // TASK 2: Paginate the display ideas
  const paginatedActiveIdeas = displayIdeas.slice(0, 500);

  // Calculate trade counts for each expiry bucket (AFTER non-expiry filters, BEFORE expiry filter)
  const calculateExpiryCounts = () => {
    const today = startOfDay(new Date());
    // Start with ideas after non-expiry filters (asset type, grade, symbol)
    const baseIdeas = applyNonExpiryFilters(filteredIdeas);
    const counts = { '7d': 0, '14d': 0, '30d': 0, '90d': 0, 'leaps': 0, 'expired': 0, 'all': baseIdeas.length };
    
    baseIdeas.forEach(idea => {
      // Non-option trades (stocks/crypto) count towards 'all' but not expiry buckets
      if (!idea.expiryDate && !idea.exitBy) {
        return;
      }
      
      const expiry = startOfDay(new Date(idea.expiryDate || idea.exitBy!));
      // Use calendar days (start of day) to avoid time-of-day issues
      // This keeps same-day expirations in 0-7d bucket until midnight
      const daysToExp = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysToExp < 0) counts['expired']++; // Truly expired (yesterday or earlier)
      else if (daysToExp >= 0 && daysToExp <= 7) counts['7d']++; // 0-7 days (includes today)
      else if (daysToExp > 7 && daysToExp <= 14) counts['14d']++;
      else if (daysToExp > 14 && daysToExp <= 60) counts['30d']++;
      else if (daysToExp > 60 && daysToExp <= 270) counts['90d']++;
      else if (daysToExp > 270) counts['leaps']++;
    });
    
    return counts;
  };

  const expiryCounts = calculateExpiryCounts();

  // Compute derived values from filtered and sorted ideas
  const topPicks = filteredAndSortedIdeas
    .filter(idea => isTodayIdea(idea))
    .slice(0, 5);

  // TASK 2: Use paginated active ideas for grouping (active trades only)
  const groupedIdeas = paginatedActiveIdeas.reduce((acc, idea) => {
    const assetType = idea.assetType;
    if (!acc[assetType]) acc[assetType] = [];
    acc[assetType].push(idea);
    return acc;
  }, {} as Record<string, TradeIdea[]>);

  const newIdeasCount = filteredAndSortedIdeas.filter(isVeryFreshIdea).length;

  // TASK 3: Calculate summary stats for each group (normalized status)
  const calculateGroupStats = (ideas: TradeIdea[]) => {
    const closedTrades = ideas.filter(i => {
      const status = normalizeStatus(i.outcomeStatus);
      return status === 'hit_target' || status === 'hit_stop';
    });
    const wins = ideas.filter(i => normalizeStatus(i.outcomeStatus) === 'hit_target').length;
    const winRate = closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0;
    
    const netPL = ideas.reduce((sum, i) => sum + (i.realizedPnL || 0), 0);
    
    const rrValues = ideas.map(i => i.riskRewardRatio).filter(rr => rr != null && rr > 0);
    const avgRR = rrValues.length > 0 ? rrValues.reduce((sum, rr) => sum + rr, 0) / rrValues.length : 0;
    
    return { winRate, netPL, avgRR, closedTrades: closedTrades.length };
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Top-level Navigation Tabs - Research and Futures */}
      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as 'research' | 'futures')} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 mb-6" data-testid="tabs-trade-desk-main">
          <TabsTrigger value="research" className="gap-2" data-testid="tab-research">
            <Brain className="h-4 w-4" />
            Research Hub
          </TabsTrigger>
          <TabsTrigger value="futures" className="gap-2" data-testid="tab-futures">
            <LineChart className="h-4 w-4" />
            Futures
          </TabsTrigger>
        </TabsList>

        {/* Research Tab Content */}
        <TabsContent value="research" className="space-y-6">
      {/* Premium Research Hub Header */}
      <header className="relative overflow-hidden rounded-xl bg-gradient-to-br from-slate-900/80 via-slate-800/60 to-slate-900/40 dark:from-slate-900/80 dark:via-slate-800/60 dark:to-slate-900/40 border border-slate-700/30 p-6" data-testid="research-hub-header">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-cyan-500/5 via-transparent to-transparent pointer-events-none" />
        <div className="relative">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            {/* Title & Stats */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                  <Brain className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight" data-testid="text-page-title">Research Hub</h1>
                  <p className="text-sm text-muted-foreground">Institutional-grade trade analysis</p>
                </div>
              </div>
              
              {/* Quick Stats Row */}
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/30">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-sm font-mono text-green-600 dark:text-green-400">{activeIdeas.length}</span>
                  <span className="text-xs text-muted-foreground">Active</span>
                </div>
                {newIdeasCount > 0 && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                    <Zap className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                    <span className="text-sm font-mono text-cyan-600 dark:text-cyan-400">{newIdeasCount}</span>
                    <span className="text-xs text-muted-foreground">New Today</span>
                  </div>
                )}
                <UsageBadge className="hidden sm:flex" data-testid="badge-usage-remaining" />
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="icon"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] })}
                title="Refresh"
                className="border-slate-700/50"
                data-testid="button-refresh-ideas"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    className="bg-cyan-600 hover:bg-cyan-500 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white gap-2"
                    size="default"
                    disabled={!canGenerateTradeIdea()}
                    data-testid="button-generate-ideas"
                  >
                    <Sparkles className="h-4 w-4" />
                    Generate
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    onClick={() => generateHybridIdeas.mutate(activeTimeframe)}
                    disabled={generateHybridIdeas.isPending}
                    data-testid="menu-generate-hybrid"
                  >
                    <Sparkles className="h-4 w-4 mr-2 text-amber-400" />
                    Smart Picks
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => generateQuantIdeas.mutate(activeTimeframe)}
                    disabled={generateQuantIdeas.isPending}
                    data-testid="menu-generate-quant"
                  >
                    <BarChart3 className="h-4 w-4 mr-2 text-blue-400" />
                    Quant Signals
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => generateAIIdeas.mutate(activeTimeframe)}
                    disabled={generateAIIdeas.isPending}
                    data-testid="menu-generate-ai"
                  >
                    <Bot className="h-4 w-4 mr-2 text-purple-400" />
                    AI Analysis
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => generateFlowIdeas.mutate(activeTimeframe)}
                    disabled={generateFlowIdeas.isPending}
                    data-testid="menu-generate-flow"
                  >
                    <Activity className="h-4 w-4 mr-2 text-cyan-400" />
                    Options Flow
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      {/* AI Research Panel - Full Width */}
      <AIResearchPanel />

      {/* Live Market Data Strip */}
      <MarketStatsTicker />

      {/* Best Setups - Top conviction plays */}
      <BestSetupsCard />

      {/* Smart Money Flow Tracker - Unusual options activity */}
      <SmartMoneyFlowTracker />

      {/* Engine Filter Tabs - Premium Design */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-slate-800/30 dark:bg-slate-800/30 border border-slate-700/30">
        {([
          { value: 'all', label: 'All', icon: Globe, color: 'text-foreground' },
          { value: 'ai', label: 'AI', icon: Bot, color: 'text-purple-400' },
          { value: 'quant', label: 'Quant', icon: BarChart3, color: 'text-blue-400' },
          { value: 'flow', label: 'Flow', icon: Activity, color: 'text-cyan-400' },
          { value: 'hybrid', label: 'Smart', icon: Sparkles, color: 'text-amber-400' },
        ] as const).map(({ value, label, icon: Icon, color }) => (
          <button
            key={value}
            onClick={() => setSourceTab(value as IdeaSource | "all")}
            className={cn(
              "px-3 py-2 rounded-lg text-sm transition-all flex items-center gap-2",
              sourceTab === value 
                ? "bg-foreground text-background shadow-lg"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
            data-testid={`tab-source-${value}`}
          >
            <Icon className={cn("h-4 w-4", sourceTab === value ? "text-background" : color)} />
            {label}
            {sourceCounts[value] > 0 && (
              <Badge variant="secondary" className={cn(
                "ml-1 px-1.5 py-0 text-xs font-mono",
                sourceTab === value ? "bg-background/20 text-background" : ""
              )}>
                {sourceCounts[value]}
              </Badge>
            )}
          </button>
        ))}
        
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className="text-xs gap-1.5"
            data-testid="button-toggle-advanced-filters"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {showAdvancedFilters ? 'Less' : 'More'}
          </Button>
        </div>
      </div>

      {/* Advanced Filters - Collapsed by default */}
      {showAdvancedFilters && (
        <div className="flex flex-wrap items-center gap-6 py-3 px-4 rounded-lg bg-muted/20 border border-border/30">
          {/* Asset Type Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Asset:</span>
            <Select value={assetTypeFilter} onValueChange={setAssetTypeFilter}>
              <SelectTrigger className="w-[90px] h-7 text-xs border-0 bg-transparent" data-testid="filter-asset-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="option">Options</SelectItem>
                <SelectItem value="stock">Stocks</SelectItem>
                <SelectItem value="penny_stock">Penny</SelectItem>
                <SelectItem value="crypto">Crypto</SelectItem>
                <SelectItem value="future">Futures</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Grade Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Grade:</span>
            <Select value={gradeFilter} onValueChange={setGradeFilter}>
              <SelectTrigger className="w-[90px] h-7 text-xs border-0 bg-transparent" data-testid="filter-grade">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="quality">Quality (A-C)</SelectItem>
                <SelectItem value="A">A Tier</SelectItem>
                <SelectItem value="B">B Tier</SelectItem>
                <SelectItem value="C">C Tier</SelectItem>
                <SelectItem value="D">D/F Tier</SelectItem>
                <SelectItem value="LOTTO">Lotto Plays</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Trade Type */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Type:</span>
            {(['all', 'swing', 'day'] as const).map((value) => (
              <button
                key={value}
                onClick={() => setTradeTypeFilter(value)}
                className={cn(
                  "text-sm capitalize px-2 py-0.5 rounded",
                  tradeTypeFilter === value 
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                data-testid={`tab-tradetype-${value}`}
              >
                {value}
              </button>
            ))}
          </div>

          {/* Price Tier Filter - For finding low-priced stocks */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Price:</span>
            <Select value={priceTierFilter} onValueChange={(val) => setPriceTierFilter(val as typeof priceTierFilter)}>
              <SelectTrigger className="w-[90px] h-7 text-xs border-0 bg-transparent" data-testid="select-price-tier">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="under5">&lt; $5</SelectItem>
                <SelectItem value="under10">&lt; $10</SelectItem>
                <SelectItem value="under15">&lt; $15</SelectItem>
                <SelectItem value="under25">&lt; $25</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Timeframe */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Horizon:</span>
            <Select value={activeTimeframe} onValueChange={(val) => setActiveTimeframe(val as TimeframeBucket)}>
              <SelectTrigger className="w-[100px] h-7 text-xs border-0 bg-transparent" data-testid="select-timeframe">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="today_tomorrow">1-2 Days</SelectItem>
                <SelectItem value="few_days">3-5 Days</SelectItem>
                <SelectItem value="next_week">This Week</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Posted Date Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Posted:</span>
            <Select value={dateFilter} onValueChange={(val) => {
              setDateFilter(val);
              if (val !== 'custom') setCustomDate(undefined);
            }}>
              <SelectTrigger className="w-[90px] h-7 text-xs border-0 bg-transparent" data-testid="select-date-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="3d">3 Days</SelectItem>
                <SelectItem value="7d">7 Days</SelectItem>
                <SelectItem value="30d">30 Days</SelectItem>
                <SelectItem value="custom">Pick Date</SelectItem>
              </SelectContent>
            </Select>
            {dateFilter === 'custom' && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 font-mono h-7 text-xs" data-testid="button-custom-date">
                    <CalendarIcon className="h-3 w-3" />
                    {customDate ? format(customDate, 'MMM d') : 'Select'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customDate}
                    onSelect={setCustomDate}
                    disabled={(date) => date > new Date()}
                  />
                </PopoverContent>
              </Popover>
            )}
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Status:</span>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[80px] h-7 text-xs border-0 bg-transparent" data-testid="filter-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="won">Won</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Symbol Search */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Symbol"
                value={symbolSearch}
                onChange={(e) => setSymbolSearch(e.target.value.toUpperCase())}
                className="pl-7 h-7 w-24 text-xs bg-transparent border-0 focus-visible:ring-1"
                data-testid="filter-symbol-search"
              />
            </div>
          </div>

          {/* Clear All */}
          {(symbolSearch || statusFilter !== 'all' || dateFilter !== 'all' || tradeTypeFilter !== 'all' || activeTimeframe !== 'all' || assetTypeFilter !== 'all' || gradeFilter !== 'quality' || priceTierFilter !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSymbolSearch('');
                setStatusFilter('all');
                setDateFilter('all');
                setTradeTypeFilter('all');
                setActiveTimeframe('all');
                setAssetTypeFilter('all');
                setGradeFilter('quality');
                setPriceTierFilter('all');
                setCustomDate(undefined);
              }}
              className="h-7 px-2 text-xs"
              data-testid="button-clear-filters"
            >
              Reset
            </Button>
          )}
        </div>
      )}

      {/* Market Status - Enhanced Visual */}
      {isWeekend() && (
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent border border-amber-500/20 p-4" data-testid="weekend-preview-section">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-amber-500/5 via-transparent to-transparent" />
          <div className="relative flex items-center gap-4">
            <div className="p-2.5 rounded-lg bg-amber-500/20">
              <Clock className="h-5 w-5 text-amber-500" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium">Markets Closed - Weekend</span>
              <span className="text-xs text-muted-foreground">
                Trading resumes {format(getNextTradingWeekStart(), 'EEEE, MMM d')} at 9:30 AM CT
              </span>
            </div>
            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              Futures trading open Sunday 6PM ET
            </div>
          </div>
        </div>
      )}

      {/* All Research Briefs */}
      <div className="space-y-8">
        {/* Loading State */}
        {ideasLoading ? (
          <TerminalLoading message="Fetching research briefs..." />
        ) : filteredAndSortedIdeas.length === 0 ? (
          <div className="py-16 text-center">
            <h3 className="text-lg font-semibold mb-2">No Research Briefs Found</h3>
            <p className="text-muted-foreground max-w-md mx-auto mb-4">
              {tradeIdeas.length === 0 
                ? "Generate research briefs using the toolbar above."
                : "No briefs match your current filters."}
            </p>
            {statusFilter !== 'all' && tradeIdeas.length > 0 && (
              <Button
                variant="outline"
                onClick={() => setStatusFilter('all')}
                data-testid="button-show-all-statuses"
              >
                Show All
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Active Research Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/10">
                    <Flame className="h-5 w-5 text-cyan-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">Active Research</h2>
                    <p className="text-xs text-muted-foreground">{activeIdeas.length} live signals across {Object.keys(groupedIdeas).length} asset classes</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="w-[120px] h-8 text-sm border-0 bg-transparent" data-testid="select-sort-by">
                      <SelectValue placeholder="Sort" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="priority">Priority</SelectItem>
                      <SelectItem value="confidence">Strength</SelectItem>
                      <SelectItem value="rr">R:R</SelectItem>
                      <SelectItem value="expiry">Expiry</SelectItem>
                      <SelectItem value="timestamp">Newest</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center rounded-md border">
                    <Button
                      variant={viewMode === "list" ? "secondary" : "ghost"}
                      size="icon"
                      onClick={() => setViewMode("list")}
                      data-testid="button-view-list"
                      className="h-8 w-8 rounded-none rounded-l-md"
                    >
                      <List className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewMode === "grid" ? "secondary" : "ghost"}
                      size="icon"
                      onClick={() => setViewMode("grid")}
                      data-testid="button-view-grid"
                      className="h-8 w-8 rounded-none"
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewMode === "heatmap" ? "secondary" : "ghost"}
                      size="icon"
                      onClick={() => setViewMode("heatmap")}
                      data-testid="button-view-heatmap"
                      className="h-8 w-8 rounded-none rounded-r-md"
                    >
                      <Flame className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {activeIdeas.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-muted-foreground">No active research briefs match your filters</p>
                </div>
              ) : (
                <Accordion type="single" collapsible className="space-y-2" defaultValue={Object.entries(groupedIdeas)[0]?.[0]}>
                  {Object.entries(groupedIdeas)
                    .sort(([a], [b]) => {
                      // Use user's custom order (stored in localStorage)
                      const orderA = assetTypeOrder.indexOf(a);
                      const orderB = assetTypeOrder.indexOf(b);
                      // If not found in order array, put at end
                      return (orderA === -1 ? 999 : orderA) - (orderB === -1 ? 999 : orderB);
                    })
                    .map(([assetType, ideas], sortedIndex, sortedArray) => {
                      const assetTypeLabels = {
                        'stock': 'Stocks',
                        'penny_stock': 'Penny Stocks',
                        'option': 'Options',
                        'future': 'Futures',
                        'crypto': 'Crypto'
                      };
                      const label = assetTypeLabels[assetType as keyof typeof assetTypeLabels] || assetType;
                      
                      const stats = calculateGroupStats(ideas);
                      const currentPage = groupPage[assetType] || 1;
                      const totalPages = Math.ceil(ideas.length / ITEMS_PER_PAGE);
                      const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
                      const endIdx = startIdx + ITEMS_PER_PAGE;
                      const pageIdeas = ideas.slice(startIdx, endIdx);
                      
                      const isFirst = sortedIndex === 0;
                      const isLast = sortedIndex === sortedArray.length - 1;
                      
                      return (
                        <AccordionItem key={assetType} value={assetType} className="border rounded-lg">
                          <AccordionTrigger className="px-4 py-3 hover:no-underline" data-testid={`accordion-asset-${assetType}`}>
                            <div className="flex items-center gap-3 flex-1">
                              {/* Move up/down buttons */}
                              <div className="flex flex-col gap-0.5 mr-1" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-4 w-4 p-0 opacity-50 hover:opacity-100"
                                  onClick={(e) => { e.stopPropagation(); moveAssetType(assetType, 'up'); }}
                                  disabled={isFirst}
                                  data-testid={`button-move-up-${assetType}`}
                                >
                                  <ChevronDown className="h-3 w-3 rotate-180" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-4 w-4 p-0 opacity-50 hover:opacity-100"
                                  onClick={(e) => { e.stopPropagation(); moveAssetType(assetType, 'down'); }}
                                  disabled={isLast}
                                  data-testid={`button-move-down-${assetType}`}
                                >
                                  <ChevronDown className="h-3 w-3" />
                                </Button>
                              </div>
                              <span className="font-medium">{label}</span>
                              <Badge variant="secondary" className="text-xs" data-testid={`badge-count-${assetType}`}>
                                {ideas.length}
                              </Badge>
                              {stats.avgRR > 0 && (
                                <span className="text-xs text-muted-foreground font-mono">
                                  {stats.avgRR.toFixed(1)}:1 avg
                                </span>
                              )}
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-4 pb-4">
                            {viewMode === 'heatmap' ? (
                              <TradeHeatmap
                                trades={ideas}
                                priceMap={priceMap}
                                onTradeClick={(tradeId) => handleToggleExpand(tradeId)}
                              />
                            ) : (
                              <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3' : 'space-y-3'}>
                                {pageIdeas.map(idea => (
                                  <TradeIdeaBlock
                                    key={idea.id}
                                    idea={idea}
                                    currentPrice={idea.assetType === 'option' ? undefined : priceMap[idea.symbol]}
                                    catalysts={catalysts}
                                    isExpanded={expandedIdeaId === idea.id}
                                    onToggleExpand={() => handleToggleExpand(idea.id)}
                                    onAnalyze={(symbol) => setAnalysisSymbol(symbol)}
                                    onSendToDiscord={(ideaId) => sendToDiscordMutation.mutate(ideaId)}
                                    data-testid={`idea-card-${idea.id}`}
                                  />
                                ))}
                              </div>
                            )}
                            {/* Numbered Pagination - Hidden in heatmap mode */}
                            {viewMode !== 'heatmap' && totalPages > 1 && (
                              <div className="pt-4 flex items-center justify-center gap-1">
                                <span className="text-xs text-muted-foreground mr-2 font-mono">
                                  {startIdx + 1}-{Math.min(endIdx, ideas.length)} of {ideas.length}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setGroupPage(prev => ({ ...prev, [assetType]: Math.max(1, currentPage - 1) }))}
                                  disabled={currentPage === 1}
                                  className="h-8 w-8 p-0"
                                  data-testid={`button-prev-${assetType}`}
                                >
                                  <ChevronLeft className="h-4 w-4" />
                                </Button>
                                {(() => {
                                  const pages: (number | 'ellipsis-start' | 'ellipsis-end')[] = [];
                                  if (totalPages <= 7) {
                                    for (let i = 1; i <= totalPages; i++) pages.push(i);
                                  } else {
                                    pages.push(1);
                                    if (currentPage > 4) pages.push('ellipsis-start');
                                    const start = Math.max(2, currentPage - 1);
                                    const end = Math.min(totalPages - 1, currentPage + 1);
                                    for (let i = start; i <= end; i++) pages.push(i);
                                    if (currentPage < totalPages - 3) pages.push('ellipsis-end');
                                    pages.push(totalPages);
                                  }
                                  return pages.map((p, idx) => {
                                    if (p === 'ellipsis-start' || p === 'ellipsis-end') {
                                      return <span key={p} className="text-muted-foreground px-1">...</span>;
                                    }
                                    return (
                                      <Button
                                        key={p}
                                        variant={currentPage === p ? "default" : "ghost"}
                                        size="sm"
                                        onClick={() => setGroupPage(prev => ({ ...prev, [assetType]: p }))}
                                        className="h-8 w-8 p-0 font-mono text-sm"
                                        data-testid={`button-page-${assetType}-${p}`}
                                      >
                                        {p}
                                      </Button>
                                    );
                                  });
                                })()}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setGroupPage(prev => ({ ...prev, [assetType]: Math.min(totalPages, currentPage + 1) }))}
                                  disabled={currentPage === totalPages}
                                  className="h-8 w-8 p-0"
                                  data-testid={`button-next-${assetType}`}
                                >
                                  <ChevronRight className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                </Accordion>
              )}

            </div>

            {/* Performance Summary */}
            {closedIdeas.length > 0 && (
              <div className="flex items-center justify-between py-4 border-t mt-4">
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">Recent:</span>
                  <span className="text-green-500">
                    {closedIdeas.filter(i => normalizeStatus(i.outcomeStatus) === 'hit_target').length} wins
                  </span>
                  <span className="text-red-500">
                    {closedIdeas.filter(i => isRealLoss(i)).length} losses
                  </span>
                </div>
                <Button variant="ghost" size="sm" asChild data-testid="link-view-performance">
                  <a href="/performance">View Performance</a>
                </Button>
              </div>
            )}
          </>
        )}
      </div>
      
      {/* Multi-Factor Analysis Sheet */}
      <Sheet open={!!analysisSymbol} onOpenChange={(open) => !open && setAnalysisSymbol(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-cyan-400" />
              Deep Analysis: {analysisSymbol}
            </SheetTitle>
          </SheetHeader>
          {analysisSymbol && (
            <div className="mt-4">
              <MultiFactorAnalysis symbol={analysisSymbol} onClose={() => setAnalysisSymbol(null)} />
            </div>
          )}
        </SheetContent>
      </Sheet>
      </TabsContent>

      {/* Futures Tab Content */}
      <TabsContent value="futures" className="space-y-6">
        <FuturesContent />
      </TabsContent>
      </Tabs>
    </div>
  );
}
