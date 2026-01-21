import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { 
  TrendingUp, 
  TrendingDown, 
  Search, 
  RefreshCw, 
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Calendar,
  LineChart,
  Target,
  Lightbulb,
  AlertTriangle,
  Zap,
  Star,
  FileText,
  Award,
  Clock,
  Activity,
  ChevronRight,
  Send,
  Repeat
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SmartWatchlistPick {
  symbol: string;
  name: string;
  currentPrice: number;
  changePercent: number;
  timeframe: string;
  direction: 'long' | 'short';
  volume: number;
  avgVolume?: number;
  volumeRatio: number;
  marketCap?: number;
  week52High?: number;
  week52Low?: number;
  distanceFrom52High?: number;
  distanceFrom52Low?: number;
  tradeIdea: {
    thesis: string;
    entryReason: string;
    riskLevel: 'low' | 'medium' | 'high' | 'speculative';
    suggestedAction: string;
    technicalSignals: string[];
  };
  score: number;
}

interface SmartWatchlistResponse {
  timeframe: string;
  count: number;
  generated: string;
  picks: SmartWatchlistPick[];
}

interface StockPerformance {
  symbol: string;
  name: string;
  sector?: string;
  currentPrice: number;
  previousClose: number;
  dayChange: number;
  dayChangePercent: number;
  weekChangePercent?: number;
  monthChangePercent?: number;
  ytdChangePercent?: number;
  yearChangePercent?: number;
  volume: number;
  avgVolume?: number;
  marketCap?: number;
  peRatio?: number;
  week52High?: number;
  week52Low?: number;
  lastUpdated: string;
}

interface MoversResponse {
  timeframe: string;
  category: string;
  gainers: StockPerformance[];
  losers: StockPerformance[];
}

interface SectorData {
  [sector: string]: { avg: number; count: number };
}

interface SurgeSignal {
  symbol: string;
  name: string;
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;
  volume: number;
  avgVolume: number;
  volumeRatio: number;
  surgeType: 'PRE_SURGE' | 'BREAKOUT' | 'MOMENTUM' | 'VOLUME_SPIKE' | 'EARLY_MOVER';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  signals: string[];
  score: number;
  detectedAt: string;
  nearHigh52?: boolean;
  breakingResistance?: boolean;
  marketCap?: number;
}

interface SurgeResponse {
  success: boolean;
  count: number;
  highPriority: number;
  surges: SurgeSignal[];
  lastScan: string;
}

interface CatalystData {
  symbol: string;
  secFilings: Array<{
    accessionNumber: string;
    filingType: string;
    filingDate: string;
    filingUrl: string;
    sentiment?: string;
    companyName?: string;
  }>;
  governmentContracts: Array<{
    contractId: string;
    awardDate: string;
    awardAmount?: number;
    contractDescription?: string;
    awardingAgency?: string;
  }>;
  catalystEvents: Array<{
    title: string;
    eventType: string;
    polarity: string;
    eventDate: string;
    isActive?: boolean;
  }>;
  hasCatalysts: boolean;
}

interface HistoricalData {
  symbol: string;
  totalTrades: number;
  winRate: string | null;
  wins: number;
  losses: number;
  avgGain: string;
  avgLoss: string;
  monthlyPerformance: Record<string, { wins: number; losses: number }>;
  recentTrades: Array<{
    date: string;
    direction: string;
    entry: number;
    target: number;
    stop: number;
    outcome: string;
    gain: number;
    timeframe: string;
  }>;
  hasHistoricalData: boolean;
}

interface OutlookData {
  symbol: string;
  currentYear: number;
  yearlyStats: Record<number, {
    trades: number;
    wins: number;
    avgGain: number;
    bestTrade: number;
    worstTrade: number;
  }>;
  yearsOfData: number;
  projections: Record<number, { trades: number; wins: number; avgGain: number } | null>;
}

interface SwingOpportunity {
  symbol: string;
  currentPrice: number;
  rsi14: number;
  targetPrice: number;
  targetPercent: number;
  stopLoss: number;
  stopLossPercent: number;
  holdDays: number;
  pattern: string;
  grade: string;
  score: number;
  volume: number;
  avgVolume: number;
  volumeRatio: number;
  sma50: number;
  sma200: number;
  trendBias: 'bullish' | 'bearish' | 'neutral';
  reason: string;
  createdAt: string;
}

interface DayTradeOpportunity {
  symbol: string;
  name?: string;
  currentPrice: number;
  vwap: number;
  vwapDistance: number;
  rsi2: number;
  momentum5m: number;
  volumeSpike: number;
  direction: 'long' | 'short';
  pattern: string;
  entry: number;
  target: number;
  targetPercent: number;
  stopLoss: number;
  stopPercent: number;
  riskReward: number;
  confidence: number;
  signals: string[];
  timeframe: string;
  createdAt: string;
}

function getSwingGradeVariant(grade: string): "default" | "secondary" | "destructive" | "outline" {
  switch (grade) {
    case 'S': 
    case 'A': return 'default';
    case 'B': return 'secondary';
    default: return 'outline';
  }
}

function getTrendIcon(trend: string) {
  if (trend === 'bullish') return <TrendingUp className="w-4 h-4 text-green-500" />;
  if (trend === 'bearish') return <TrendingDown className="w-4 h-4 text-red-500" />;
  return <Activity className="w-4 h-4 text-gray-500" />;
}

const formatPrice = (price: number) => {
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(8)}`;
};

const formatPercentage = (value: number | undefined) => {
  if (value === undefined || value === null) return "-";
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
};

const formatVolume = (vol: number) => {
  if (vol >= 1e9) return `${(vol / 1e9).toFixed(1)}B`;
  if (vol >= 1e6) return `${(vol / 1e6).toFixed(1)}M`;
  if (vol >= 1e3) return `${(vol / 1e3).toFixed(1)}K`;
  return vol.toString();
};

const formatMarketCap = (cap: number | undefined) => {
  if (!cap) return "-";
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(1)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(0)}M`;
  return `$${cap.toFixed(0)}`;
};

function StockRow({ stock, timeframe }: { stock: StockPerformance; timeframe: string }) {
  const getChangeForTimeframe = () => {
    switch (timeframe) {
      case 'week': return stock.weekChangePercent;
      case 'month': return stock.monthChangePercent;
      case 'ytd': return stock.ytdChangePercent;
      case 'year': return stock.yearChangePercent;
      default: return stock.dayChangePercent;
    }
  };

  const change = getChangeForTimeframe();
  const isPositive = (change ?? 0) >= 0;

  return (
    <div className="flex items-center justify-between py-3 px-4 border-b border-border/50 hover-elevate cursor-pointer"
         data-testid={`stock-row-${stock.symbol}`}>
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-foreground" data-testid={`text-symbol-${stock.symbol}`}>
              {stock.symbol}
            </span>
            {stock.marketCap && stock.marketCap >= 10e9 && (
              <Badge variant="secondary" className="text-xs">Large Cap</Badge>
            )}
            {stock.currentPrice < 5 && (
              <Badge variant="outline" className="text-xs text-amber-400 border-amber-400/30">Penny</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate max-w-[200px]" data-testid={`text-name-${stock.symbol}`}>
            {stock.name}
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-6 text-right">
        <div className="min-w-[80px]">
          <p className="font-mono font-medium" data-testid={`text-price-${stock.symbol}`}>
            {formatPrice(stock.currentPrice)}
          </p>
        </div>
        
        <div className={`min-w-[80px] flex items-center justify-end gap-1 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
          {isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
          <span className="font-mono font-medium" data-testid={`text-change-${stock.symbol}`}>
            {formatPercentage(change)}
          </span>
        </div>
        
        <div className="min-w-[60px] text-muted-foreground text-sm font-mono" data-testid={`text-volume-${stock.symbol}`}>
          {formatVolume(stock.volume)}
        </div>
        
        <div className="min-w-[70px] text-muted-foreground text-sm" data-testid={`text-marketcap-${stock.symbol}`}>
          {formatMarketCap(stock.marketCap)}
        </div>
      </div>
    </div>
  );
}

function SectorCard({ sector, data }: { sector: string; data: { avg: number; count: number } }) {
  const isPositive = data.avg >= 0;
  
  return (
    <div className="bg-card border border-border/50 rounded-lg p-4 hover-elevate">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{sector}</span>
        <div className={`flex items-center gap-1 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
          {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          <span className="font-mono font-bold">{formatPercentage(data.avg)}</span>
        </div>
      </div>
    </div>
  );
}

function getRiskBadgeColor(risk: string) {
  switch (risk) {
    case 'low': return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'medium': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    case 'speculative': return 'bg-red-500/20 text-red-400 border-red-500/30';
    default: return 'bg-muted text-muted-foreground';
  }
}

function getPolarityColor(polarity: string) {
  switch (polarity) {
    case 'bullish': return 'text-green-400';
    case 'bearish': return 'text-red-400';
    default: return 'text-muted-foreground';
  }
}

function CatalystIntelligencePanel({ symbol }: { symbol: string }) {
  const [showDetails, setShowDetails] = useState(false);
  const [outlookYear, setOutlookYear] = useState<number | '2028+'>(2026);

  const catalystQuery = useQuery<CatalystData>({
    queryKey: ['/api/market-scanner/catalyst', symbol],
    queryFn: async () => {
      const res = await fetch(`/api/market-scanner/catalyst/${symbol}`);
      if (!res.ok) throw new Error("Failed to fetch catalyst data");
      return res.json();
    },
    enabled: showDetails,
    staleTime: 300000,
  });

  const historicalQuery = useQuery<HistoricalData>({
    queryKey: ['/api/market-scanner/historical', symbol],
    queryFn: async () => {
      const res = await fetch(`/api/market-scanner/historical/${symbol}`);
      if (!res.ok) throw new Error("Failed to fetch historical data");
      return res.json();
    },
    enabled: showDetails,
    staleTime: 300000,
  });

  const outlookQuery = useQuery<OutlookData>({
    queryKey: ['/api/market-scanner/outlook', symbol],
    queryFn: async () => {
      const res = await fetch(`/api/market-scanner/outlook/${symbol}`);
      if (!res.ok) throw new Error("Failed to fetch outlook data");
      return res.json();
    },
    enabled: showDetails,
    staleTime: 300000,
  });

  if (!showDetails) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowDetails(true)}
        className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
        data-testid={`btn-show-intelligence-${symbol}`}
      >
        <Activity className="w-4 h-4" />
        <span>View Catalyst Intelligence & Historical Patterns</span>
        <ChevronRight className="w-4 h-4 ml-auto" />
      </Button>
    );
  }

  const isLoading = catalystQuery.isLoading || historicalQuery.isLoading;
  const catalyst = catalystQuery.data;
  const historical = historicalQuery.data;

  return (
    <div className="space-y-4 pt-2 border-t border-border/50">
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-purple-400" />
        <span className="text-sm font-medium text-purple-400">Intelligence Data</span>
        {isLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Catalyst Events */}
        <div className="bg-card/50 border border-border/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-medium">Catalyst Events</span>
          </div>
          
          {catalyst?.hasCatalysts ? (
            <div className="space-y-2">
              {catalyst.secFilings.slice(0, 3).map((filing, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {filing.filingType}
                    </Badge>
                    <span className="text-muted-foreground truncate max-w-[120px]">
                      {new Date(filing.filingDate).toLocaleDateString()}
                    </span>
                  </div>
                  {filing.sentiment && (
                    <Badge 
                      variant="secondary" 
                      className={`text-[10px] ${filing.sentiment === 'bullish' ? 'bg-green-500/20 text-green-400' : filing.sentiment === 'bearish' ? 'bg-red-500/20 text-red-400' : ''}`}
                    >
                      {filing.sentiment}
                    </Badge>
                  )}
                </div>
              ))}
              
              {catalyst.governmentContracts.slice(0, 2).map((contract, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Award className="w-3 h-3 text-amber-400" />
                    <span className="text-muted-foreground truncate max-w-[150px]">
                      Gov Contract
                    </span>
                  </div>
                  {contract.awardAmount && (
                    <span className="text-green-400 font-mono">
                      ${(contract.awardAmount / 1e6).toFixed(1)}M
                    </span>
                  )}
                </div>
              ))}

              {catalyst.catalystEvents.slice(0, 3).map((event, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className={`truncate max-w-[180px] ${getPolarityColor(event.polarity)}`}>
                    {event.title}
                  </span>
                  {event.isActive && (
                    <Badge variant="secondary" className="text-[10px] bg-cyan-500/20 text-cyan-400">
                      Active
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No recent catalysts found</p>
          )}
        </div>

        {/* Historical Performance */}
        <div className="bg-card/50 border border-border/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-green-400" />
            <span className="text-sm font-medium">Historical Performance</span>
          </div>
          
          {historical?.hasHistoricalData ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-mono font-bold text-green-400">{historical.winRate}%</p>
                  <p className="text-[10px] text-muted-foreground">Win Rate</p>
                </div>
                <div>
                  <p className="text-lg font-mono font-bold text-foreground">{historical.totalTrades}</p>
                  <p className="text-[10px] text-muted-foreground">Trades</p>
                </div>
                <div>
                  <p className="text-lg font-mono font-bold text-cyan-400">+{historical.avgGain}%</p>
                  <p className="text-[10px] text-muted-foreground">Avg Gain</p>
                </div>
              </div>
              
              {historical.recentTrades.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Recent Trades:</p>
                  {historical.recentTrades.slice(0, 3).map((trade, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {new Date(trade.date).toLocaleDateString()}
                      </span>
                      <Badge 
                        variant="secondary"
                        className={`text-[10px] ${trade.outcome === 'hit_target' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}
                      >
                        {trade.outcome === 'hit_target' ? 'WIN' : 'LOSS'} {trade.gain > 0 ? '+' : ''}{trade.gain?.toFixed(1)}%
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {historical ? 'Less than 3 historical trades - insufficient data' : 'Loading...'}
            </p>
          )}
        </div>
      </div>

      {/* Multi-Year Outlook */}
      <div className="bg-card/50 border border-border/50 rounded-lg p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium">Multi-Year Outlook</span>
          </div>
          <div className="flex gap-1">
            {([2026, 2027, '2028+'] as const).map(year => (
              <Button
                key={year}
                variant={outlookYear === year ? "secondary" : "ghost"}
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setOutlookYear(year)}
                data-testid={`btn-outlook-year-${year}-${symbol}`}
              >
                {year}
              </Button>
            ))}
          </div>
        </div>
        
        {outlookQuery.isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : outlookQuery.data?.yearsOfData && outlookQuery.data.yearsOfData > 0 ? (
          <div className="space-y-2">
            {Object.entries(outlookQuery.data.yearlyStats)
              .filter(([year]) => {
                const y = parseInt(year);
                if (outlookYear === '2028+') return y >= 2028 || y <= 2027;
                return y <= outlookYear;
              })
              .slice(-3)
              .map(([year, stats]) => {
                const avgGainNum = typeof stats.avgGain === 'number' ? stats.avgGain : parseFloat(String(stats.avgGain)) || 0;
                return (
                  <div key={year} className="flex items-center justify-between text-xs p-2 bg-muted/30 rounded">
                    <span className="font-mono font-medium">{year}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">{stats.trades} trades</span>
                      <span className="text-green-400">{stats.trades > 0 ? ((stats.wins / stats.trades) * 100).toFixed(0) : 0}% win</span>
                      <span className={`font-mono ${avgGainNum >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>
                        {avgGainNum >= 0 ? '+' : ''}{avgGainNum.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            
            {outlookYear === '2028+' && (
              <div className="text-center text-xs text-muted-foreground mt-2 py-2 border-t border-border/30">
                2028+ outlook based on historical patterns and projections
              </div>
            )}
            
            {typeof outlookYear === 'number' && !outlookQuery.data?.projections?.[outlookYear + 1] && (
              <div className="text-center text-xs text-muted-foreground mt-2 py-2 border-t border-border/30">
                Future projections available after more historical data
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-2">
            No yearly data available for {symbol}
          </p>
        )}
      </div>
    </div>
  );
}

function SmartWatchlistCard({ pick, index }: { pick: SmartWatchlistPick; index: number }) {
  const isPositive = pick.changePercent >= 0;
  
  return (
    <AccordionItem value={pick.symbol} className="border border-border/50 rounded-lg mb-3 overflow-hidden" data-testid={`watchlist-pick-${pick.symbol}`}>
      <AccordionTrigger className="px-4 py-3 hover:no-underline hover-elevate">
        <div className="flex items-center justify-between w-full pr-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-400 font-bold text-sm">
              {index + 1}
            </div>
            <div className="text-left">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-foreground">{pick.symbol}</span>
                <Badge variant="outline" className={getRiskBadgeColor(pick.tradeIdea.riskLevel)}>
                  {pick.tradeIdea.riskLevel}
                </Badge>
                {pick.score >= 80 && (
                  <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate max-w-[200px]">{pick.name}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-6 text-right">
            <div>
              <p className="font-mono font-medium">{formatPrice(pick.currentPrice)}</p>
              <div className={`flex items-center justify-end gap-1 text-sm ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                <span className="font-mono">{formatPercentage(pick.changePercent)}</span>
              </div>
            </div>
            <div className="hidden sm:block">
              <p className="text-xs text-muted-foreground">Score</p>
              <p className="font-mono font-bold text-cyan-400">{pick.score}</p>
            </div>
          </div>
        </div>
      </AccordionTrigger>
      
      <AccordionContent className="px-4 pb-4">
        <div className="space-y-4 pt-2">
          <div className="bg-muted/30 rounded-lg p-4">
            <div className="flex items-start gap-2 mb-3">
              <Lightbulb className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-foreground">Trade Thesis</p>
                <p className="text-sm text-muted-foreground mt-1">{pick.tradeIdea.thesis}</p>
              </div>
            </div>
            
            <div className="flex items-start gap-2 mt-3">
              <Zap className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-foreground">Entry Reason</p>
                <p className="text-sm text-muted-foreground mt-1">{pick.tradeIdea.entryReason}</p>
              </div>
            </div>
            
            <div className="flex items-start gap-2 mt-3">
              <Target className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-foreground">Suggested Action</p>
                <p className="text-sm text-muted-foreground mt-1">{pick.tradeIdea.suggestedAction}</p>
              </div>
            </div>
          </div>
          
          {pick.tradeIdea.technicalSignals.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pick.tradeIdea.technicalSignals.map((signal, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {signal}
                </Badge>
              ))}
            </div>
          )}
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="bg-card border border-border/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Volume</p>
              <p className="font-mono font-medium">{formatVolume(pick.volume)}</p>
              {pick.volumeRatio > 1 && (
                <p className="text-xs text-cyan-400">{pick.volumeRatio.toFixed(1)}x avg</p>
              )}
            </div>
            <div className="bg-card border border-border/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Market Cap</p>
              <p className="font-mono font-medium">{formatMarketCap(pick.marketCap)}</p>
            </div>
            {pick.distanceFrom52High !== undefined && (
              <div className="bg-card border border-border/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">From 52W High</p>
                <p className="font-mono font-medium text-amber-400">-{pick.distanceFrom52High.toFixed(1)}%</p>
              </div>
            )}
            {pick.week52High && (
              <div className="bg-card border border-border/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">52W High</p>
                <p className="font-mono font-medium">{formatPrice(pick.week52High)}</p>
              </div>
            )}
          </div>
          
          {/* Catalyst Intelligence & Historical Patterns */}
          <CatalystIntelligencePanel symbol={pick.symbol} />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

export default function MarketScanner() {
  const searchString = useSearch();
  const [timeframe, setTimeframe] = useState<string>("day");
  const [category, setCategory] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<string>("movers");
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const tabParam = params.get('tab');
    if (tabParam === 'swing') {
      setActiveTab('swing');
    } else if (tabParam === 'daytrade') {
      setActiveTab('daytrade');
    }
  }, [searchString]);

  const moversQuery = useQuery<MoversResponse>({
    queryKey: ["/api/market-scanner/movers", timeframe, category],
    queryFn: async () => {
      const res = await fetch(`/api/market-scanner/movers?timeframe=${timeframe}&category=${category}&limit=25`);
      if (!res.ok) throw new Error("Failed to fetch movers");
      return res.json();
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const sectorsQuery = useQuery<SectorData>({
    queryKey: ["/api/market-scanner/sectors"],
    refetchInterval: 120000,
    staleTime: 60000,
  });

  const watchlistQuery = useQuery<SmartWatchlistResponse>({
    queryKey: ["/api/market-scanner/watchlist", timeframe],
    queryFn: async () => {
      const res = await fetch(`/api/market-scanner/watchlist?timeframe=${timeframe}&limit=15`);
      if (!res.ok) throw new Error("Failed to fetch smart watchlist");
      return res.json();
    },
    refetchInterval: 300000,
    staleTime: 120000,
  });

  const swingQuery = useQuery<SwingOpportunity[]>({
    queryKey: ['/api/swing-scanner'],
    queryFn: async () => {
      const res = await fetch('/api/swing-scanner');
      if (!res.ok) throw new Error('Failed to fetch swing opportunities');
      return res.json();
    },
    refetchInterval: 5 * 60 * 1000,
    enabled: activeTab === 'swing',
  });

  const daytradeQuery = useQuery<DayTradeOpportunity[]>({
    queryKey: ['/api/daytrade-scanner'],
    queryFn: async () => {
      const res = await fetch('/api/daytrade-scanner');
      if (!res.ok) throw new Error('Failed to fetch day trade opportunities');
      return res.json();
    },
    refetchInterval: 60 * 1000,
    enabled: activeTab === 'daytrade',
  });

  // Surge Scanner - Real-time breakout detection
  const surgeQuery = useQuery<SurgeResponse>({
    queryKey: ['/api/market-scanner/surges'],
    queryFn: async () => {
      const res = await fetch('/api/market-scanner/surges');
      if (!res.ok) throw new Error('Failed to fetch surge signals');
      return res.json();
    },
    refetchInterval: 60 * 1000, // Refresh every minute for real-time detection
    staleTime: 30000,
  });

  // Feed surges to Trade Desk
  const feedSurgesToTradeDeskMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/market-scanner/surges/feed', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to feed surges');
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Surges Fed to Trade Desk",
        description: `${data.ingested} surge alerts sent to Trade Desk`,
      });
    },
    onError: () => {
      toast({
        title: "Failed to feed surges",
        description: "Check server logs for details",
        variant: "destructive",
      });
    },
  });

  const sendSwingToDiscord = useMutation({
    mutationFn: async (opp: SwingOpportunity) => {
      const response = await fetch('/api/swing-scanner/send-discord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opp),
      });
      if (!response.ok) throw new Error('Failed to send');
      return response.json();
    },
    onSuccess: (_, opp) => {
      toast({
        title: "Sent to Discord",
        description: `${opp.symbol} swing opportunity shared`,
      });
    },
    onError: () => {
      toast({
        title: "Failed to send",
        description: "Check Discord webhook configuration",
        variant: "destructive",
      });
    },
  });

  const handleRefresh = () => {
    moversQuery.refetch();
    sectorsQuery.refetch();
    watchlistQuery.refetch();
    surgeQuery.refetch();
  };

  const timeframeLabels: Record<string, string> = {
    day: "Daily",
    week: "Weekly",
    month: "Monthly",
    ytd: "YTD",
    year: "52-Week",
  };

  const categoryLabels: Record<string, string> = {
    all: "All Stocks (500+)",
    sp500: "S&P 500 + Tech",
    growth: "Growth Stocks",
    penny: "Penny Stocks",
    etf: "ETFs",
  };

  return (
    <div className="min-h-screen p-6 bg-background">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3" data-testid="page-title">
              <BarChart3 className="w-8 h-8 text-cyan-400" />
              Market Scanner
            </h1>
            <p className="text-muted-foreground mt-1">
              Track 500+ stocks across multiple timeframes
            </p>
          </div>
          
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-[180px]" data-testid="category-select">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stocks (500+)</SelectItem>
                <SelectItem value="sp500">S&P 500 + Tech</SelectItem>
                <SelectItem value="growth">Growth Stocks</SelectItem>
                <SelectItem value="penny">Penny Stocks</SelectItem>
                <SelectItem value="etf">ETFs</SelectItem>
              </SelectContent>
            </Select>
            
            <Button 
              variant="outline" 
              onClick={handleRefresh}
              disabled={moversQuery.isFetching}
              data-testid="refresh-button"
            >
              {moversQuery.isFetching ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Refresh
            </Button>
          </div>
        </div>

        {/* SURGE SCANNER - Real-time Breakout Detection */}
        <Card className="border-red-500/50 bg-gradient-to-r from-red-500/10 to-orange-500/10">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500/20 rounded-lg">
                  <Zap className="w-6 h-6 text-red-400" />
                </div>
                <div>
                  <CardTitle className="text-xl text-red-400 flex items-center gap-2" data-testid="surge-scanner-title">
                    Surge Scanner
                    {surgeQuery.data && surgeQuery.data.highPriority > 0 && (
                      <Badge className="bg-red-500 text-white animate-pulse" data-testid="badge-surge-hot-count">{surgeQuery.data.highPriority} HOT</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>Real-time breakout detection across 800+ symbols</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => surgeQuery.refetch()}
                  disabled={surgeQuery.isFetching}
                  data-testid="refresh-surges-button"
                >
                  {surgeQuery.isFetching ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => feedSurgesToTradeDeskMutation.mutate()}
                  disabled={feedSurgesToTradeDeskMutation.isPending || !surgeQuery.data?.highPriority}
                  data-testid="feed-surges-button"
                >
                  {feedSurgesToTradeDeskMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Feed to Trade Desk
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {surgeQuery.isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-24 bg-muted/30 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : surgeQuery.data && surgeQuery.data.surges.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {surgeQuery.data.surges.slice(0, 12).map((surge) => (
                  <Link
                    key={surge.symbol}
                    href={`/chart-analysis?symbol=${surge.symbol}`}
                    className="block p-3 rounded-lg border border-border/50 hover-elevate cursor-pointer bg-card/50"
                    data-testid={`surge-card-${surge.symbol}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-foreground" data-testid={`text-symbol-${surge.symbol}`}>{surge.symbol}</span>
                        <Badge 
                          data-testid={`badge-severity-${surge.symbol}`}
                          className={
                            surge.severity === 'CRITICAL' ? 'bg-red-500 text-white' :
                            surge.severity === 'HIGH' ? 'bg-orange-500 text-white' :
                            surge.severity === 'MEDIUM' ? 'bg-amber-500 text-black' :
                            'bg-slate-500 text-white'
                          }
                        >
                          {surge.severity}
                        </Badge>
                      </div>
                      <div className={`font-mono font-bold ${surge.priceChangePercent > 0 ? 'text-green-400' : 'text-red-400'}`} data-testid={`text-change-${surge.symbol}`}>
                        {surge.priceChangePercent > 0 ? '+' : ''}{surge.priceChangePercent.toFixed(1)}%
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
                      <span className="font-mono" data-testid={`text-price-${surge.symbol}`}>${surge.currentPrice.toFixed(2)}</span>
                      <span className="text-cyan-400" data-testid={`text-volume-${surge.symbol}`}>{surge.volumeRatio.toFixed(1)}x vol</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-xs" data-testid={`badge-type-${surge.symbol}`}>
                        {surge.surgeType.replace('_', ' ')}
                      </Badge>
                      {surge.breakingResistance && (
                        <Badge className="bg-green-500/20 text-green-400 text-xs" data-testid={`badge-high52-${surge.symbol}`}>52W HIGH!</Badge>
                      )}
                    </div>
                    {surge.signals.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-2 truncate">
                        {surge.signals[0]}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground" data-testid="surge-empty-state">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p data-testid="text-surge-empty-message">No surge signals detected. Market may be quiet.</p>
                <p className="text-xs mt-1">Scanner checks 800+ symbols every minute</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Main Tab Navigation: Movers vs Day Trade vs Swing */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-flex mb-4 gap-1">
            <TabsTrigger value="movers" data-testid="tab-movers">
              <TrendingUp className="w-4 h-4 mr-2" />
              Movers
            </TabsTrigger>
            <TabsTrigger value="daytrade" data-testid="tab-daytrade">
              <Zap className="w-4 h-4 mr-2" />
              Day Trade
            </TabsTrigger>
            <TabsTrigger value="swing" data-testid="tab-swing">
              <Repeat className="w-4 h-4 mr-2" />
              Swing
            </TabsTrigger>
          </TabsList>

          {/* Movers Tab Content */}
          <TabsContent value="movers" className="mt-0">
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {sectorsQuery.isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-16 bg-muted/30 rounded-lg animate-pulse" />
                  ))
                ) : sectorsQuery.data ? (
                  Object.entries(sectorsQuery.data).slice(0, 10).map(([sector, data]) => (
                    <SectorCard key={sector} sector={sector} data={data} />
                  ))
                ) : null}
              </div>

              <Tabs value={timeframe} onValueChange={setTimeframe} className="w-full">
                <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-flex">
                  <TabsTrigger value="day" data-testid="tab-day">
                    <Calendar className="w-4 h-4 mr-2 hidden sm:inline" />
                    Daily
                  </TabsTrigger>
                  <TabsTrigger value="week" data-testid="tab-week">
                    <LineChart className="w-4 h-4 mr-2 hidden sm:inline" />
                    Weekly
                  </TabsTrigger>
                  <TabsTrigger value="month" data-testid="tab-month">
                    <BarChart3 className="w-4 h-4 mr-2 hidden sm:inline" />
                    Monthly
                  </TabsTrigger>
                  <TabsTrigger value="ytd" data-testid="tab-ytd">
                    <Target className="w-4 h-4 mr-2 hidden sm:inline" />
                    YTD
                  </TabsTrigger>
                  <TabsTrigger value="year" data-testid="tab-year">
                    <TrendingUp className="w-4 h-4 mr-2 hidden sm:inline" />
                    52-Week
                  </TabsTrigger>
                </TabsList>

          <Card className="mt-6 border-cyan-500/30 bg-cyan-500/5">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-cyan-400" data-testid="smart-watchlist-title">
                    <Star className="w-5 h-5" />
                    Smart Watchlist - {timeframeLabels[timeframe]} Picks
                  </CardTitle>
                  <CardDescription>
                    Top 15 curated stocks with trade ideas based on {timeframeLabels[timeframe].toLowerCase()} analysis
                  </CardDescription>
                </div>
                {watchlistQuery.data && (
                <Badge variant="outline" className="text-cyan-400 border-cyan-500/30">
                  {watchlistQuery.data.count} picks
                </Badge>
              )}
              </div>
            </CardHeader>
            <CardContent>
              {watchlistQuery.isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
                  <span className="ml-3 text-muted-foreground">Analyzing stocks...</span>
                </div>
              ) : watchlistQuery.error ? (
                <div className="flex items-center justify-center py-12 text-red-400">
                  <AlertTriangle className="w-5 h-5 mr-2" />
                  Failed to generate watchlist. Try refreshing.
                </div>
              ) : watchlistQuery.data?.picks.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  No picks available for this timeframe
                </div>
              ) : (
                <Accordion type="single" collapsible className="w-full" data-testid="smart-watchlist">
                  {watchlistQuery.data?.picks.map((pick, index) => (
                    <SmartWatchlistCard key={pick.symbol} pick={pick} index={index} />
                  ))}
                </Accordion>
              )}
            </CardContent>
          </Card>

          {["day", "week", "month", "ytd", "year"].map((tf) => (
            <TabsContent key={tf} value={tf} className="mt-6">
              <div className="grid lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-green-400">
                      <TrendingUp className="w-5 h-5" />
                      Top Gainers
                    </CardTitle>
                    <CardDescription>
                      {timeframeLabels[tf]} top performers in {categoryLabels[category]}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground border-b border-border/50 bg-muted/30">
                      <span>Symbol / Name</span>
                      <div className="flex items-center gap-6 text-right">
                        <span className="min-w-[80px]">Price</span>
                        <span className="min-w-[80px]">Change</span>
                        <span className="min-w-[60px]">Volume</span>
                        <span className="min-w-[70px]">Mkt Cap</span>
                      </div>
                    </div>
                    
                    {moversQuery.isLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
                      </div>
                    ) : moversQuery.error ? (
                      <div className="flex items-center justify-center py-12 text-red-400">
                        Failed to load data. Try refreshing.
                      </div>
                    ) : moversQuery.data?.gainers.length === 0 ? (
                      <div className="flex items-center justify-center py-12 text-muted-foreground">
                        No gainers found for this timeframe
                      </div>
                    ) : (
                      <div className="max-h-[500px] overflow-y-auto" data-testid="gainers-list">
                        {moversQuery.data?.gainers.map((stock) => (
                          <StockRow key={stock.symbol} stock={stock} timeframe={tf} />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-red-400">
                      <TrendingDown className="w-5 h-5" />
                      Top Losers
                    </CardTitle>
                    <CardDescription>
                      {timeframeLabels[tf]} worst performers in {categoryLabels[category]}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground border-b border-border/50 bg-muted/30">
                      <span>Symbol / Name</span>
                      <div className="flex items-center gap-6 text-right">
                        <span className="min-w-[80px]">Price</span>
                        <span className="min-w-[80px]">Change</span>
                        <span className="min-w-[60px]">Volume</span>
                        <span className="min-w-[70px]">Mkt Cap</span>
                      </div>
                    </div>
                    
                    {moversQuery.isLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
                      </div>
                    ) : moversQuery.error ? (
                      <div className="flex items-center justify-center py-12 text-red-400">
                        Failed to load data. Try refreshing.
                      </div>
                    ) : moversQuery.data?.losers.length === 0 ? (
                      <div className="flex items-center justify-center py-12 text-muted-foreground">
                        No losers found for this timeframe
                      </div>
                    ) : (
                      <div className="max-h-[500px] overflow-y-auto" data-testid="losers-list">
                        {moversQuery.data?.losers.map((stock) => (
                          <StockRow key={stock.symbol} stock={stock} timeframe={tf} />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          ))}
              </Tabs>
            </div>
          </TabsContent>

          {/* Day Trade Tab Content */}
          <TabsContent value="daytrade" className="mt-0">
            <div className="space-y-6">
              <Card className="bg-cyan-950/20 border-cyan-600/30">
                <CardContent className="py-3">
                  <p className="text-cyan-200 text-sm flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    <span>
                      <strong>Intraday Focus:</strong> These are short-term setups for same-day entries/exits. 
                      Uses VWAP, RSI(2), momentum breakouts, and volume spikes. 0-2 day holds max.
                    </span>
                  </p>
                </CardContent>
              </Card>

              {daytradeQuery.isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Card key={i}>
                      <CardContent className="p-4 space-y-3">
                        <Skeleton className="h-6 w-24" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : daytradeQuery.data && daytradeQuery.data.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {daytradeQuery.data.map((opp, idx) => (
                    <Card 
                      key={`${opp.symbol}-${idx}`} 
                      className={`hover-elevate transition-all ${opp.direction === 'long' ? 'border-green-500/30' : 'border-red-500/30'}`}
                      data-testid={`card-daytrade-${opp.symbol}`}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-xl font-bold">{opp.symbol}</CardTitle>
                            <Badge 
                              variant={opp.direction === 'long' ? 'default' : 'destructive'}
                              className="text-xs"
                            >
                              {opp.direction === 'long' ? 'LONG' : 'SHORT'}
                            </Badge>
                          </div>
                          <Badge variant="secondary" className="font-mono">
                            {opp.confidence}%
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span className="font-mono">${opp.currentPrice.toFixed(2)}</span>
                          <span>•</span>
                          <span className="truncate text-xs">{opp.pattern}</span>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">VWAP:</span>
                            <span className={`ml-2 font-mono ${opp.vwapDistance > 0 ? 'text-green-400' : 'text-red-400'}`}>
                              ${opp.vwap.toFixed(2)} ({opp.vwapDistance > 0 ? '+' : ''}{opp.vwapDistance.toFixed(1)}%)
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">RSI(2):</span>
                            <span className={`ml-2 font-mono ${opp.rsi2 < 20 ? 'text-red-400' : opp.rsi2 > 80 ? 'text-green-400' : ''}`}>
                              {opp.rsi2.toFixed(0)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Target className="w-3 h-3 text-green-500" />
                            <span className="text-green-400">
                              ${opp.target.toFixed(2)} (+{opp.targetPercent.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-red-500" />
                            <span className="text-red-400">
                              ${opp.stopLoss.toFixed(2)} (-{opp.stopPercent.toFixed(1)}%)
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Activity className="w-3 h-3" />
                            <span>{opp.volumeSpike.toFixed(1)}x vol</span>
                          </div>
                          <Badge variant="outline" className={`text-xs ${opp.riskReward >= 2 ? 'text-green-400 border-green-500/30' : ''}`}>
                            R:R {opp.riskReward.toFixed(1)}:1
                          </Badge>
                        </div>

                        {opp.signals && opp.signals.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {opp.signals.slice(0, 3).map((signal, i) => (
                              <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0">
                                {signal}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Zap className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">No Day Trade Setups</h3>
                    <p className="text-muted-foreground text-sm mt-2">
                      No intraday opportunities currently meet the VWAP/momentum criteria.
                      Check back during market hours for active setups.
                    </p>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Day Trade Criteria</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                    <div className="space-y-1">
                      <div className="font-medium text-cyan-400">VWAP Strategy</div>
                      <div className="text-muted-foreground">Price vs VWAP for direction bias</div>
                    </div>
                    <div className="space-y-1">
                      <div className="font-medium text-cyan-400">RSI(2) Extreme</div>
                      <div className="text-muted-foreground">Oversold {"<"}20 or overbought {">"}80</div>
                    </div>
                    <div className="space-y-1">
                      <div className="font-medium text-cyan-400">Volume Spike</div>
                      <div className="text-muted-foreground">1.5x+ average volume required</div>
                    </div>
                    <div className="space-y-1">
                      <div className="font-medium text-cyan-400">Hold Time</div>
                      <div className="text-muted-foreground">Same-day to next-day exits</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Swing Tab Content */}
          <TabsContent value="swing" className="mt-0">
            <div className="space-y-6">
              <Card className="bg-amber-950/20 border-amber-600/30">
                <CardContent className="py-3">
                  <p className="text-amber-200 text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    <span>
                      <strong>Research Only:</strong> These swing trade ideas are for educational purposes. 
                      Always conduct your own analysis and manage risk appropriately.
                    </span>
                  </p>
                </CardContent>
              </Card>

              {swingQuery.isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Card key={i}>
                      <CardContent className="p-4 space-y-3">
                        <Skeleton className="h-6 w-24" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : swingQuery.data && swingQuery.data.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {swingQuery.data.map((opp) => (
                    <Card 
                      key={opp.symbol} 
                      className="hover-elevate transition-all"
                      data-testid={`card-swing-${opp.symbol}`}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="text-xl font-bold">{opp.symbol}</CardTitle>
                          <Badge variant={getSwingGradeVariant(opp.grade)}>
                            {opp.grade} ({opp.score})
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {getTrendIcon(opp.trendBias)}
                          <span className="capitalize">{opp.trendBias} trend</span>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Entry:</span>
                            <span className="ml-2 font-mono">${opp.currentPrice.toFixed(2)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">RSI(14):</span>
                            <span className={`ml-2 font-mono ${opp.rsi14 < 30 ? 'text-red-400' : opp.rsi14 < 40 ? 'text-orange-400' : ''}`}>
                              {opp.rsi14.toFixed(1)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Target className="w-3 h-3 text-green-500" />
                            <span className="text-green-400">
                              ${opp.targetPrice.toFixed(2)} (+{opp.targetPercent.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-red-500" />
                            <span className="text-red-400">
                              ${opp.stopLoss.toFixed(2)} (-{opp.stopLossPercent.toFixed(1)}%)
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            <span>{opp.holdDays} day hold</span>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {opp.pattern.replace(/_/g, ' ')}
                          </Badge>
                        </div>

                        <div className="text-xs text-muted-foreground">
                          Volume: {opp.volumeRatio.toFixed(1)}x avg • SMA50: ${opp.sma50.toFixed(2)}
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => sendSwingToDiscord.mutate(opp)}
                          disabled={sendSwingToDiscord.isPending}
                          data-testid={`button-discord-${opp.symbol}`}
                        >
                          <Send className="w-3 h-3 mr-2" />
                          Send to Discord
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Activity className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">No Swing Opportunities</h3>
                    <p className="text-muted-foreground text-sm mt-2">
                      No stocks currently meet the RSI(14) oversold criteria with sufficient pattern quality.
                      Check back later as market conditions change.
                    </p>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Scanner Criteria</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                    <div className="space-y-1">
                      <div className="font-medium text-primary">Timeframe</div>
                      <div className="text-muted-foreground">Daily charts (not intraday)</div>
                    </div>
                    <div className="space-y-1">
                      <div className="font-medium text-primary">RSI Filter</div>
                      <div className="text-muted-foreground">RSI(14) below 50, best under 40</div>
                    </div>
                    <div className="space-y-1">
                      <div className="font-medium text-primary">Target Range</div>
                      <div className="text-muted-foreground">5-10% profit targets</div>
                    </div>
                    <div className="space-y-1">
                      <div className="font-medium text-primary">Hold Time</div>
                      <div className="text-muted-foreground">3-10 trading days</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        <Card className="bg-amber-500/10 border-amber-500/30">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Search className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-amber-300 font-medium">Data Refresh</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Market data refreshes every minute during market hours. Historical timeframes (weekly, monthly, YTD, yearly) 
                  update every 5 minutes. Data is sourced from Yahoo Finance with a 5-minute cache.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
