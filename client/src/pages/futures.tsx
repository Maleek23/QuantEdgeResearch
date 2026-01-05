import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  RefreshCw, 
  Activity,
  Sun,
  Moon,
  Sunrise,
  AlertTriangle,
  BarChart3,
  DollarSign,
  Fuel,
  Coins,
  Brain,
  Target,
  ShieldAlert,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  FileText,
  Zap,
  LineChart,
  Bot,
  Play,
  Pause,
  Wallet,
  TrendingUp as TrendUp,
  CheckCircle2,
  XCircle
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { formatInTimeZone } from "date-fns-tz";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { FuturesResearchBrief } from "@shared/schema";

interface FuturesQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
  previousClose: number;
  session: 'pre' | 'rth' | 'post' | 'overnight' | 'closed';
  lastUpdate: string;
}

interface FuturesSymbolInfo {
  symbol: string;
  name: string;
  tickSize: number;
  pointValue: number;
}

const SESSION_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  rth: { label: 'Regular Hours', color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: Sun },
  pre: { label: 'Pre-Market', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: Sunrise },
  post: { label: 'Post-Market', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: Sunset },
  overnight: { label: 'Overnight', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: Moon },
  closed: { label: 'Closed', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: AlertTriangle },
};

const CATEGORY_ICONS: Record<string, any> = {
  'ES': BarChart3,
  'NQ': BarChart3,
  'YM': BarChart3,
  'RTY': BarChart3,
  'GC': Coins,
  'SI': Coins,
  'CL': Fuel,
  'NG': Fuel,
  'ZB': DollarSign,
  'ZN': DollarSign,
  '6E': DollarSign,
  '6J': DollarSign,
};

function Sunset(props: any) {
  return <Sun {...props} />;
}

function FuturesCard({ quote, onClick }: { quote: FuturesQuote; onClick: () => void }) {
  const isPositive = quote.changePercent >= 0;
  const Icon = CATEGORY_ICONS[quote.symbol] || Activity;
  
  return (
    <Card 
      className="hover-elevate cursor-pointer transition-all duration-200 glass-card"
      onClick={onClick}
      data-testid={`card-futures-${quote.symbol}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${isPositive ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
              <Icon className={`h-4 w-4 ${isPositive ? 'text-green-400' : 'text-red-400'}`} />
            </div>
            <div>
              <div className="font-bold text-lg" data-testid={`text-futures-symbol-${quote.symbol}`}>{quote.symbol}</div>
              <div className="text-xs text-muted-foreground truncate max-w-[120px]">{quote.name}</div>
            </div>
          </div>
          {isPositive ? (
            <TrendingUp className="h-5 w-5 text-green-400" />
          ) : (
            <TrendingDown className="h-5 w-5 text-red-400" />
          )}
        </div>
        
        <div className="space-y-2">
          <div className="text-2xl font-bold font-mono tabular-nums tracking-tight" data-testid={`text-futures-price-${quote.symbol}`}>
            ${quote.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          
          <div className={`flex items-center gap-2 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
            <span className="font-medium" data-testid={`text-futures-change-${quote.symbol}`}>
              {isPositive ? '+' : ''}{quote.change.toFixed(2)}
            </span>
            <Badge variant="outline" className={isPositive ? 'border-green-500/30 text-green-400' : 'border-red-500/30 text-red-400'}>
              {isPositive ? '+' : ''}{quote.changePercent.toFixed(2)}%
            </Badge>
          </div>
          
          <div className="flex justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
            <span>H: ${quote.high.toLocaleString()}</span>
            <span>L: ${quote.low.toLocaleString()}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SessionIndicator({ session }: { session: string }) {
  const config = SESSION_LABELS[session] || SESSION_LABELS.closed;
  const Icon = config.icon;
  
  return (
    <Badge variant="outline" className={`${config.color} border gap-1.5`} data-testid="badge-futures-session">
      <Icon className="h-3.5 w-3.5" />
      {config.label}
    </Badge>
  );
}

function BiasIndicator({ bias, biasStrength }: { bias: string; biasStrength: string }) {
  const getBiasColor = () => {
    if (bias === 'bullish') return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (bias === 'bearish') return 'bg-red-500/20 text-red-400 border-red-500/30';
    return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  };

  return (
    <Badge variant="outline" className={`${getBiasColor()} border gap-1.5`} data-testid="badge-bias">
      {bias === 'bullish' && <ArrowUpRight className="h-3 w-3" />}
      {bias === 'bearish' && <ArrowDownRight className="h-3 w-3" />}
      {bias === 'neutral' && <Activity className="h-3 w-3" />}
      {biasStrength.toUpperCase()} {bias.toUpperCase()}
    </Badge>
  );
}

function ResearchBriefCard({ 
  brief, 
  onGenerateResearch,
  isGenerating 
}: { 
  brief: FuturesResearchBrief; 
  onGenerateResearch: (symbol: string) => void;
  isGenerating: boolean;
}) {
  const Icon = CATEGORY_ICONS[brief.symbol] || Activity;
  const generatedDate = brief.generatedAt ? new Date(brief.generatedAt) : null;
  
  const resistanceLevels = brief.resistanceLevels || [];
  const supportLevels = brief.supportLevels || [];

  return (
    <Card className="glass-card hover-elevate" data-testid={`card-research-brief-${brief.symbol}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-green-500 to-green-600 shadow-lg">
              <Icon className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg" data-testid={`text-brief-symbol-${brief.symbol}`}>
                {brief.symbol}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{brief.name}</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onGenerateResearch(brief.symbol)}
            disabled={isGenerating}
            data-testid={`button-refresh-research-${brief.symbol}`}
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-xl font-bold font-mono tabular-nums" data-testid={`text-brief-price-${brief.symbol}`}>
            ${brief.currentPrice?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || 'N/A'}
          </div>
          <SessionIndicator session={brief.session || 'closed'} />
          <BiasIndicator bias={brief.bias} biasStrength={brief.biasStrength} />
        </div>

        <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
          <p className="text-sm" data-testid={`text-brief-summary-${brief.symbol}`}>
            {brief.technicalSummary}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="p-2 rounded-lg stat-glass">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Resistance</div>
            <div className="text-sm font-medium font-mono text-red-400" data-testid={`text-brief-resistance-${brief.symbol}`}>
              {resistanceLevels.length > 0 
                ? resistanceLevels.slice(0, 2).map(r => '$' + parseFloat(r).toFixed(2)).join(', ')
                : 'N/A'}
            </div>
          </div>
          <div className="p-2 rounded-lg stat-glass">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Pivot</div>
            <div className="text-sm font-medium font-mono text-yellow-400" data-testid={`text-brief-pivot-${brief.symbol}`}>
              {brief.pivotLevel ? '$' + brief.pivotLevel.toFixed(2) : 'N/A'}
            </div>
          </div>
          <div className="p-2 rounded-lg stat-glass">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Support</div>
            <div className="text-sm font-medium font-mono text-green-400" data-testid={`text-brief-support-${brief.symbol}`}>
              {supportLevels.length > 0 
                ? supportLevels.slice(0, 2).map(s => '$' + parseFloat(s).toFixed(2)).join(', ')
                : 'N/A'}
            </div>
          </div>
        </div>

        {brief.tradeDirection && (
          <div className={`p-3 rounded-lg border ${brief.tradeDirection === 'long' ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}
               data-testid={`panel-trade-idea-${brief.symbol}`}>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={brief.tradeDirection === 'long' ? 'default' : 'destructive'}>
                {brief.tradeDirection === 'long' ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
                {brief.tradeDirection.toUpperCase()}
              </Badge>
              <span className="text-xs font-medium">Trade Idea</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Entry: </span>
                <span className="font-medium" data-testid={`text-trade-entry-${brief.symbol}`}>
                  ${brief.tradeEntry?.toFixed(2) || 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Target: </span>
                <span className="font-medium text-green-400" data-testid={`text-trade-target-${brief.symbol}`}>
                  ${brief.tradeTarget?.toFixed(2) || 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Stop: </span>
                <span className="font-medium text-red-400" data-testid={`text-trade-stop-${brief.symbol}`}>
                  ${brief.tradeStop?.toFixed(2) || 'N/A'}
                </span>
              </div>
            </div>
            {brief.tradeRationale && (
              <p className="text-xs text-muted-foreground mt-2" data-testid={`text-trade-rationale-${brief.symbol}`}>
                {brief.tradeRationale}
              </p>
            )}
          </div>
        )}

        {generatedDate && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span data-testid={`text-brief-timestamp-${brief.symbol}`}>
              Updated {format(generatedDate, 'MMM d, h:mm a')}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function FuturesPage() {
  const { toast } = useToast();
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeTab, setActiveTab] = useState<'research' | 'quotes' | 'ideas' | 'bot'>('ideas');
  const [generatingSymbol, setGeneratingSymbol] = useState<string | null>(null);

  interface BotPortfolio {
    id?: string;
    name: string;
    cashBalance: number;
    totalValue?: number;
    startingCapital: number;
    totalPnL?: number;
    openPositions?: number;
    closedPositions?: number;
    wins?: number;
    losses?: number;
    winRate?: string;
  }

  interface BotPosition {
    id: string;
    symbol: string;
    direction: string;
    quantity: number;
    entryPrice: number;
    currentPrice: number;
    targetPrice: number;
    stopLoss: number;
    unrealizedPnL: number;
    unrealizedPnLPercent: number;
    entryTime: string;
    status: string;
  }

  interface BotStats {
    totalTrades: number;
    winRate: number;
    totalPnL: number;
    openPositions: number;
  }

  interface BotData {
    portfolio: BotPortfolio | null;
    futuresPortfolio: BotPortfolio | null;
    positions: BotPosition[];
    futuresPositions: BotPosition[];
    stats: BotStats | null;
  }

  interface BotPreferences {
    enableFutures: boolean;
    futuresMaxContracts: number;
    futuresStopPoints: number;
    futuresTargetPoints: number;
    enablePropFirm?: boolean;
  }

  const { data: botData, isLoading: botLoading, refetch: refetchBot } = useQuery<BotData>({
    queryKey: ['/api/auto-lotto-bot'],
    refetchInterval: 15000,
  });

  const { data: botPreferences, refetch: refetchPreferences } = useQuery<BotPreferences>({
    queryKey: ['/api/auto-lotto-bot/preferences'],
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: async (prefs: Partial<BotPreferences>) => {
      return await apiRequest('PUT', '/api/auto-lotto-bot/preferences', prefs);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auto-lotto-bot/preferences'] });
      toast({
        title: "Preferences Updated",
        description: "Your futures bot preferences have been saved.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update preferences",
        variant: "destructive",
      });
    },
  });

  const triggerScanMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/auto-lotto-bot/scan', { type: 'futures' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auto-lotto-bot'] });
      toast({
        title: "Scan Complete",
        description: "Futures bot scan has been triggered successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Scan Failed",
        description: error.message || "Failed to trigger scan",
        variant: "destructive",
      });
    },
  });
  
  const { data: quotes = [], isLoading: quotesLoading, refetch: refetchQuotes, isFetching: isFetchingQuotes } = useQuery<FuturesQuote[]>({
    queryKey: ['/api/futures'],
    refetchInterval: 10000,
  });
  
  const { data: symbols = [] } = useQuery<FuturesSymbolInfo[]>({
    queryKey: ['/api/futures/symbols'],
  });

  const { data: researchBriefs = [], isLoading: briefsLoading, refetch: refetchBriefs } = useQuery<FuturesResearchBrief[]>({
    queryKey: ['/api/futures-research/briefs'],
    refetchInterval: 60000,
  });

  const generateAllMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/futures-research/generate-all');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/futures-research/briefs'] });
      toast({
        title: "Research Generated",
        description: "All futures research briefs have been generated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate research briefs",
        variant: "destructive",
      });
    },
  });

  const generateSingleMutation = useMutation({
    mutationFn: async (symbol: string) => {
      setGeneratingSymbol(symbol);
      return await apiRequest('POST', `/api/futures-research/generate/${symbol}`);
    },
    onSuccess: (_data, symbol) => {
      queryClient.invalidateQueries({ queryKey: ['/api/futures-research/briefs'] });
      toast({
        title: "Research Updated",
        description: `Research brief for ${symbol} has been regenerated.`,
      });
      setGeneratingSymbol(null);
    },
    onError: (error: any, symbol) => {
      toast({
        title: "Generation Failed",
        description: error.message || `Failed to generate research for ${symbol}`,
        variant: "destructive",
      });
      setGeneratingSymbol(null);
    },
  });
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  const etTime = formatInTimeZone(currentTime, 'America/New_York', 'h:mm:ss a');
  const ctTime = formatInTimeZone(currentTime, 'America/Chicago', 'h:mm:ss a');
  
  const currentSession = quotes[0]?.session || 'closed';
  
  const indexFutures = quotes.filter(q => ['ES', 'NQ', 'YM', 'RTY'].includes(q.symbol));
  const metalsFutures = quotes.filter(q => ['GC', 'SI'].includes(q.symbol));
  const energyFutures = quotes.filter(q => ['CL', 'NG'].includes(q.symbol));
  const bondFutures = quotes.filter(q => ['ZB', 'ZN'].includes(q.symbol));
  const currencyFutures = quotes.filter(q => ['6E', '6J'].includes(q.symbol));
  
  const handleCardClick = (symbol: string) => {
    if (symbol === selectedSymbol) {
      setSelectedSymbol(null);
    } else {
      setSelectedSymbol(symbol);
    }
  };
  
  const selectedQuote = quotes.find(q => q.symbol === selectedSymbol);
  const selectedInfo = symbols.find(s => s.symbol === selectedSymbol);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <PageHeader 
        label="Futures"
        title="Futures Research"
        description="Real-time futures quotes and research briefs"
        icon={LineChart}
        iconColor="text-cyan-400"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-3 mr-4 flex-wrap">
              <SessionIndicator session={currentSession} />
              <div className="flex items-center gap-2 glass rounded-lg px-3 py-1.5">
                <Clock className="h-4 w-4 text-cyan-400" />
                <span className="text-sm font-medium" data-testid="text-ct-time">{ctTime} CT</span>
              </div>
              <div className="flex items-center gap-2 glass rounded-lg px-3 py-1.5">
                <Clock className="h-4 w-4 text-purple-400" />
                <span className="text-sm font-medium" data-testid="text-et-time">{etTime} ET</span>
              </div>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={() => generateAllMutation.mutate()}
              disabled={generateAllMutation.isPending}
              className="gap-2"
              data-testid="button-generate-all-research"
            >
              {generateAllMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {generateAllMutation.isPending ? 'Generating...' : 'Generate All Research'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                refetchQuotes();
                refetchBriefs();
              }}
              disabled={isFetchingQuotes}
              data-testid="button-refresh-futures"
            >
              <RefreshCw className={`h-4 w-4 ${isFetchingQuotes ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        }
      />

      <div className="glass-card rounded-xl p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div className="text-center p-2 rounded-lg hover-elevate cursor-default">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Overnight</div>
            <div className="font-medium font-mono text-purple-400">5:00 PM - 6:00 AM ET</div>
          </div>
          <div className="text-center p-2 rounded-lg hover-elevate cursor-default">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Pre-Market</div>
            <div className="font-medium font-mono text-yellow-400">6:00 AM - 9:30 AM ET</div>
          </div>
          <div className="text-center p-2 rounded-lg hover-elevate cursor-default">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Regular Hours</div>
            <div className="font-medium font-mono text-green-400">9:30 AM - 4:00 PM ET</div>
          </div>
          <div className="text-center p-2 rounded-lg hover-elevate cursor-default">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Closed</div>
            <div className="font-medium font-mono text-red-400">Fri 5PM - Sun 6PM ET</div>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'research' | 'quotes' | 'ideas' | 'bot')} className="w-full">
        <TabsList className="glass mb-4" data-testid="tabs-futures-main">
          <TabsTrigger value="ideas" className="gap-2" data-testid="tab-trade-ideas">
            <Target className="h-4 w-4" />
            Trade Ideas
            {researchBriefs.filter(b => b.tradeDirection).length > 0 && (
              <Badge variant="secondary" className="ml-1 bg-green-500/20 text-green-400">
                {researchBriefs.filter(b => b.tradeDirection).length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="bot" className="gap-2" data-testid="tab-auto-bot">
            <Bot className="h-4 w-4" />
            Auto Bot
            {(botData?.futuresPositions?.filter(p => p.status === 'open').length || 0) > 0 && (
              <Badge variant="secondary" className="ml-1 bg-cyan-500/20 text-cyan-400">
                {botData?.futuresPositions?.filter(p => p.status === 'open').length || 0}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="research" className="gap-2" data-testid="tab-research-briefs">
            <FileText className="h-4 w-4" />
            Research Briefs
            {researchBriefs.length > 0 && (
              <Badge variant="secondary" className="ml-1">{researchBriefs.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="quotes" className="gap-2" data-testid="tab-live-quotes">
            <Zap className="h-4 w-4" />
            Live Quotes
          </TabsTrigger>
        </TabsList>

        {/* Trade Ideas Tab - Shows only actionable trade setups */}
        <TabsContent value="ideas" className="space-y-6">
          {briefsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-[200px] rounded-xl" />
              ))}
            </div>
          ) : researchBriefs.filter(b => b.tradeDirection).length === 0 ? (
            <Card className="glass-card">
              <CardContent className="p-12 text-center">
                <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Trade Ideas Available</h3>
                <p className="text-muted-foreground mb-4">
                  Generate research briefs to get AI-powered trade ideas for futures contracts.
                </p>
                <Button
                  onClick={() => generateAllMutation.mutate()}
                  disabled={generateAllMutation.isPending}
                  className="gap-2"
                  data-testid="button-generate-ideas"
                >
                  {generateAllMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {generateAllMutation.isPending ? 'Generating...' : 'Generate Trade Ideas'}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="stat-glass rounded-lg p-3">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Active Ideas</div>
                  <div className="text-xl font-bold text-green-400">
                    {researchBriefs.filter(b => b.tradeDirection).length}
                  </div>
                </div>
                <div className="stat-glass rounded-lg p-3">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Long Setups</div>
                  <div className="text-xl font-bold text-green-400">
                    {researchBriefs.filter(b => b.tradeDirection === 'long').length}
                  </div>
                </div>
                <div className="stat-glass rounded-lg p-3">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Short Setups</div>
                  <div className="text-xl font-bold text-red-400">
                    {researchBriefs.filter(b => b.tradeDirection === 'short').length}
                  </div>
                </div>
                <div className="stat-glass rounded-lg p-3">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Session</div>
                  <div className="text-xl font-bold text-cyan-400">
                    {quotes.length > 0 && quotes[0]?.session ? quotes[0].session.toUpperCase() : 'N/A'}
                  </div>
                </div>
              </div>
              
              {/* Trade Ideas Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {researchBriefs
                  .filter(b => b.tradeDirection && typeof b.tradeDirection === 'string')
                  .sort((a, b) => {
                    // Sort by direction (long first) then by bias strength
                    const dirA = a.tradeDirection || 'long';
                    const dirB = b.tradeDirection || 'long';
                    if (dirA !== dirB) {
                      return dirA === 'long' ? -1 : 1;
                    }
                    const strengthOrder: Record<string, number> = { strong: 0, moderate: 1, weak: 2 };
                    const strengthA = strengthOrder[a.biasStrength || 'moderate'] ?? 2;
                    const strengthB = strengthOrder[b.biasStrength || 'moderate'] ?? 2;
                    return strengthA - strengthB;
                  })
                  .map((brief) => {
                    const Icon = CATEGORY_ICONS[brief.symbol] || Activity;
                    const direction = brief.tradeDirection || 'long';
                    const isLong = direction === 'long';
                    const entry = typeof brief.tradeEntry === 'number' ? brief.tradeEntry : 0;
                    const target = typeof brief.tradeTarget === 'number' ? brief.tradeTarget : 0;
                    const stop = typeof brief.tradeStop === 'number' ? brief.tradeStop : 0;
                    const risk = isLong ? Math.abs(entry - stop) : Math.abs(stop - entry);
                    const reward = isLong ? Math.abs(target - entry) : Math.abs(entry - target);
                    const rrRatio = risk > 0 && reward > 0 ? (reward / risk).toFixed(2) : 'N/A';
                    const biasStrengthValue = brief.biasStrength || 'moderate';
                    
                    return (
                      <Card 
                        key={brief.id}
                        className={`glass-card hover-elevate ${isLong ? 'border-green-500/20' : 'border-red-500/20'}`}
                        data-testid={`card-trade-idea-${brief.symbol}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-lg ${isLong ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                                <Icon className={`h-5 w-5 ${isLong ? 'text-green-400' : 'text-red-400'}`} />
                              </div>
                              <div>
                                <div className="font-bold text-lg flex items-center gap-2">
                                  {brief.symbol}
                                  <Badge variant={isLong ? 'default' : 'destructive'} className="text-xs">
                                    {isLong ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
                                    {direction.toUpperCase()}
                                  </Badge>
                                </div>
                                <div className="text-xs text-muted-foreground">{brief.name}</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-lg font-bold font-mono">
                                ${typeof brief.currentPrice === 'number' ? brief.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 }) : 'N/A'}
                              </div>
                              <Badge variant="outline" className={`text-xs ${biasStrengthValue === 'strong' ? 'border-green-500/30 text-green-400' : ''}`}>
                                {biasStrengthValue}
                              </Badge>
                            </div>
                          </div>
                          
                          {/* Entry/Target/Stop Grid */}
                          <div className="grid grid-cols-4 gap-2 mb-3">
                            <div className="p-2 rounded-lg stat-glass text-center">
                              <div className="text-[10px] text-muted-foreground uppercase">Entry</div>
                              <div className="font-mono font-medium text-sm">
                                {entry > 0 ? `$${entry.toFixed(2)}` : 'N/A'}
                              </div>
                            </div>
                            <div className="p-2 rounded-lg stat-glass text-center">
                              <div className="text-[10px] text-muted-foreground uppercase">Target</div>
                              <div className="font-mono font-medium text-sm text-green-400">
                                {target > 0 ? `$${target.toFixed(2)}` : 'N/A'}
                              </div>
                            </div>
                            <div className="p-2 rounded-lg stat-glass text-center">
                              <div className="text-[10px] text-muted-foreground uppercase">Stop</div>
                              <div className="font-mono font-medium text-sm text-red-400">
                                {stop > 0 ? `$${stop.toFixed(2)}` : 'N/A'}
                              </div>
                            </div>
                            <div className="p-2 rounded-lg stat-glass text-center">
                              <div className="text-[10px] text-muted-foreground uppercase">R:R</div>
                              <div className="font-mono font-medium text-sm text-cyan-400">{rrRatio}</div>
                            </div>
                          </div>
                          
                          {/* Rationale */}
                          {brief.tradeRationale && (
                            <div className="p-2 rounded-lg bg-muted/30 text-xs text-muted-foreground">
                              {brief.tradeRationale}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Autonomous Bot Tab */}
        <TabsContent value="bot" className="space-y-6">
          {botLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-[180px] rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Bot Control Panel */}
              <Card className="glass-card border-cyan-500/20" data-testid="card-bot-control">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                        <Bot className="h-5 w-5 text-cyan-400" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">Futures Auto Bot</CardTitle>
                        <p className="text-sm text-muted-foreground">Autonomous NQ/GC paper trading</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Enabled</span>
                        <Switch
                          checked={botPreferences?.enableFutures ?? true}
                          onCheckedChange={(checked) => 
                            updatePreferencesMutation.mutate({ enableFutures: checked })
                          }
                          data-testid="switch-enable-futures-bot"
                        />
                      </div>
                      <div className="flex items-center gap-2 px-2 py-1 rounded-lg border border-amber-500/30 bg-amber-500/10">
                        <ShieldAlert className="h-4 w-4 text-amber-400" />
                        <span className="text-sm text-amber-400 font-medium">Prop Firm</span>
                        <Switch
                          checked={botPreferences?.enablePropFirm ?? false}
                          onCheckedChange={(checked) => 
                            updatePreferencesMutation.mutate({ enablePropFirm: checked })
                          }
                          data-testid="switch-prop-firm-mode"
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => triggerScanMutation.mutate()}
                        disabled={triggerScanMutation.isPending}
                        className="gap-2"
                        data-testid="button-trigger-scan"
                      >
                        {triggerScanMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                        Scan Now
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => refetchBot()}
                        data-testid="button-refresh-bot"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="stat-glass rounded-lg p-3" data-testid="stat-bot-portfolio">
                      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Portfolio</div>
                      <div className="text-xl font-bold font-mono text-cyan-400" data-testid="text-bot-portfolio-value">
                        ${((botData?.futuresPortfolio?.startingCapital || 300) + (botData?.futuresPortfolio?.totalPnL || 0)).toFixed(0)}
                      </div>
                    </div>
                    <div className="stat-glass rounded-lg p-3" data-testid="stat-bot-pnl">
                      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total P&L</div>
                      <div className={`text-xl font-bold font-mono ${(botData?.futuresPortfolio?.totalPnL || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`} data-testid="text-bot-pnl-value">
                        {(botData?.futuresPortfolio?.totalPnL || 0) >= 0 ? '+' : ''}${(botData?.futuresPortfolio?.totalPnL || 0).toFixed(2)}
                      </div>
                    </div>
                    <div className="stat-glass rounded-lg p-3" data-testid="stat-bot-winrate">
                      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Win Rate</div>
                      <div className="text-xl font-bold font-mono text-green-400" data-testid="text-bot-winrate-value">
                        {botData?.futuresPortfolio?.winRate || 0}%
                      </div>
                    </div>
                    <div className="stat-glass rounded-lg p-3" data-testid="stat-bot-trades">
                      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Trades</div>
                      <div className="text-xl font-bold font-mono" data-testid="text-bot-trades-value">
                        {botData?.futuresPortfolio?.closedPositions || 0}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Prop Firm Mode Info Panel */}
              {botPreferences?.enablePropFirm && (
                <Card className="glass-card border-amber-500/30" data-testid="card-prop-firm-info">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        <ShieldAlert className="h-5 w-5 text-amber-400" />
                      </div>
                      <div>
                        <CardTitle className="text-lg text-amber-400">Prop Firm Mode Active</CardTitle>
                        <p className="text-sm text-muted-foreground">Conservative settings for funded account evaluations</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="stat-glass rounded-lg p-3 border border-amber-500/20">
                        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Account Size</div>
                        <div className="text-lg font-bold font-mono text-amber-400">$50,000</div>
                      </div>
                      <div className="stat-glass rounded-lg p-3 border border-amber-500/20">
                        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Daily Loss Limit</div>
                        <div className="text-lg font-bold font-mono text-red-400">$1,000</div>
                      </div>
                      <div className="stat-glass rounded-lg p-3 border border-amber-500/20">
                        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Max Drawdown</div>
                        <div className="text-lg font-bold font-mono text-red-400">$2,500</div>
                      </div>
                      <div className="stat-glass rounded-lg p-3 border border-amber-500/20">
                        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Profit Target</div>
                        <div className="text-lg font-bold font-mono text-green-400">$3,000</div>
                      </div>
                    </div>
                    <div className="mt-4 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                      <div className="text-sm text-amber-400 font-medium mb-1">Risk Rules Applied:</div>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        <li className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-green-400" /> Max 1 contract per trade (micro NQ/ES)</li>
                        <li className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-green-400" /> Strict 10-point stop loss enforced</li>
                        <li className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-green-400" /> 20-point profit targets for 2:1 R:R</li>
                        <li className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-green-400" /> Only trades during RTH (9:30 AM - 4:00 PM ET)</li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Open Positions */}
              <Card className="glass-card" data-testid="card-bot-positions">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-cyan-400" />
                    Open Positions
                    {(botData?.futuresPositions?.filter(p => p.status === 'open').length || 0) > 0 && (
                      <Badge variant="secondary" className="bg-cyan-500/20 text-cyan-400 ml-2">
                        {botData?.futuresPositions?.filter(p => p.status === 'open').length}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!botData?.futuresPositions?.filter(p => p.status === 'open').length ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Bot className="h-10 w-10 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">No open futures positions</p>
                      <p className="text-xs mt-1">Bot scans during CME RTH (9:30 AM - 4:00 PM ET)</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {botData?.futuresPositions?.filter(p => p.status === 'open').map((position) => {
                        const isLong = position.direction === 'long';
                        const pnlPositive = (position.unrealizedPnL || 0) >= 0;
                        return (
                          <div 
                            key={position.id}
                            className={`p-4 rounded-lg border ${isLong ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'}`}
                            data-testid={`position-${position.id}`}
                          >
                            <div className="flex items-center justify-between gap-4 mb-3">
                              <div className="flex items-center gap-3">
                                <Badge variant={isLong ? 'default' : 'destructive'}>
                                  {isLong ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
                                  {position.direction.toUpperCase()}
                                </Badge>
                                <span className="font-bold font-mono">{position.symbol}</span>
                                <span className="text-sm text-muted-foreground">x{position.quantity}</span>
                              </div>
                              <div className={`font-bold font-mono ${pnlPositive ? 'text-green-400' : 'text-red-400'}`} data-testid={`text-position-pnl-${position.id}`}>
                                {pnlPositive ? '+' : ''}${position.unrealizedPnL?.toFixed(2) || '0.00'}
                                <span className="text-xs ml-1">({position.unrealizedPnLPercent?.toFixed(2) || '0.00'}%)</span>
                              </div>
                            </div>
                            <div className="grid grid-cols-4 gap-2 text-xs">
                              <div className="stat-glass rounded p-2 text-center" data-testid={`stat-position-entry-${position.id}`}>
                                <div className="text-muted-foreground uppercase">Entry</div>
                                <div className="font-mono font-medium">${position.entryPrice?.toFixed(2)}</div>
                              </div>
                              <div className="stat-glass rounded p-2 text-center" data-testid={`stat-position-current-${position.id}`}>
                                <div className="text-muted-foreground uppercase">Current</div>
                                <div className="font-mono font-medium">${position.currentPrice?.toFixed(2)}</div>
                              </div>
                              <div className="stat-glass rounded p-2 text-center" data-testid={`stat-position-target-${position.id}`}>
                                <div className="text-muted-foreground uppercase">Target</div>
                                <div className="font-mono font-medium text-green-400">${position.targetPrice?.toFixed(2)}</div>
                              </div>
                              <div className="stat-glass rounded p-2 text-center" data-testid={`stat-position-stop-${position.id}`}>
                                <div className="text-muted-foreground uppercase">Stop</div>
                                <div className="font-mono font-medium text-red-400">${position.stopLoss?.toFixed(2)}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent Closed Trades */}
              <Card className="glass-card" data-testid="card-bot-history">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Activity className="h-5 w-5 text-muted-foreground" />
                    Recent Trades
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!botData?.futuresPositions?.filter(p => p.status !== 'open').length ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <p className="text-sm">No closed trades yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {botData?.futuresPositions?.filter(p => p.status !== 'open').slice(0, 5).map((trade) => {
                        const isWin = (trade.unrealizedPnL || 0) > 0;
                        return (
                          <div 
                            key={trade.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors"
                            data-testid={`row-closed-trade-${trade.id}`}
                          >
                            <div className="flex items-center gap-3">
                              {isWin ? (
                                <CheckCircle2 className="h-4 w-4 text-green-400" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-400" />
                              )}
                              <span className="font-mono font-medium" data-testid={`text-trade-symbol-${trade.id}`}>{trade.symbol}</span>
                              <Badge variant="outline" className="text-xs">
                                {trade.direction}
                              </Badge>
                            </div>
                            <div className={`font-mono font-bold ${isWin ? 'text-green-400' : 'text-red-400'}`} data-testid={`text-trade-pnl-${trade.id}`}>
                              {isWin ? '+' : ''}${trade.unrealizedPnL?.toFixed(2) || '0.00'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Bot Info */}
              <div className="p-4 rounded-lg bg-muted/20 border border-border/30 text-sm text-muted-foreground">
                <p className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  <strong>Paper Trading Only</strong>
                </p>
                <p>
                  The futures bot trades NQ (Nasdaq) and GC (Gold) futures contracts during CME Regular Trading Hours.
                  All trades are simulated using a $300 paper portfolio. The bot uses RSI(2) mean reversion, 
                  session momentum, and volatility filters to identify high-probability setups.
                </p>
              </div>
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="research" className="space-y-6">
          {briefsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-[350px] rounded-xl" />
              ))}
            </div>
          ) : researchBriefs.length === 0 ? (
            <Card className="glass-card">
              <CardContent className="p-12 text-center">
                <Brain className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Research Briefs Yet</h3>
                <p className="text-muted-foreground mb-4">
                  Generate AI-powered research briefs for all main futures contracts.
                </p>
                <Button
                  onClick={() => generateAllMutation.mutate()}
                  disabled={generateAllMutation.isPending}
                  className="gap-2"
                  data-testid="button-generate-first-research"
                >
                  {generateAllMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {generateAllMutation.isPending ? 'Generating...' : 'Generate Research Briefs'}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {researchBriefs.map((brief) => (
                <ResearchBriefCard
                  key={brief.id}
                  brief={brief}
                  onGenerateResearch={(symbol) => generateSingleMutation.mutate(symbol)}
                  isGenerating={generatingSymbol === brief.symbol}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="quotes" className="space-y-6">
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="glass mb-4" data-testid="tabs-futures-categories">
              <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
              <TabsTrigger value="indices" data-testid="tab-indices">Indices</TabsTrigger>
              <TabsTrigger value="metals" data-testid="tab-metals">Metals</TabsTrigger>
              <TabsTrigger value="energy" data-testid="tab-energy">Energy</TabsTrigger>
              <TabsTrigger value="bonds" data-testid="tab-bonds">Bonds</TabsTrigger>
              <TabsTrigger value="currencies" data-testid="tab-currencies">Currencies</TabsTrigger>
            </TabsList>
            
            <TabsContent value="all" className="space-y-6">
              {quotesLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[...Array(8)].map((_, i) => (
                    <Skeleton key={i} className="h-[180px] rounded-xl" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {quotes.map((quote) => (
                    <FuturesCard 
                      key={quote.symbol} 
                      quote={quote} 
                      onClick={() => handleCardClick(quote.symbol)}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="indices">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {indexFutures.map((quote) => (
                  <FuturesCard key={quote.symbol} quote={quote} onClick={() => handleCardClick(quote.symbol)} />
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="metals">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {metalsFutures.map((quote) => (
                  <FuturesCard key={quote.symbol} quote={quote} onClick={() => handleCardClick(quote.symbol)} />
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="energy">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {energyFutures.map((quote) => (
                  <FuturesCard key={quote.symbol} quote={quote} onClick={() => handleCardClick(quote.symbol)} />
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="bonds">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {bondFutures.map((quote) => (
                  <FuturesCard key={quote.symbol} quote={quote} onClick={() => handleCardClick(quote.symbol)} />
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="currencies">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {currencyFutures.map((quote) => (
                  <FuturesCard key={quote.symbol} quote={quote} onClick={() => handleCardClick(quote.symbol)} />
                ))}
              </div>
            </TabsContent>
          </Tabs>

          {selectedQuote && selectedInfo && (
            <Card className="glass-card" data-testid="card-futures-detail">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${selectedQuote.changePercent >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                    {CATEGORY_ICONS[selectedQuote.symbol] ? 
                      (() => { const Icon = CATEGORY_ICONS[selectedQuote.symbol]; return <Icon className="h-5 w-5 text-foreground" />; })() : 
                      <Activity className="h-5 w-5" />
                    }
                  </div>
                  {selectedQuote.symbol} - {selectedQuote.name}
                </CardTitle>
                <Button
                  onClick={() => setSelectedSymbol(null)}
                  variant="ghost"
                  size="sm"
                  data-testid="button-close-detail"
                >
                  Close
                </Button>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                  <div className="stat-glass rounded-lg p-3">
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Current Price</div>
                    <div className="text-2xl font-bold font-mono tabular-nums">${selectedQuote.price.toLocaleString()}</div>
                  </div>
                  <div className="stat-glass rounded-lg p-3">
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Change</div>
                    <div className={`text-xl font-bold font-mono tabular-nums ${selectedQuote.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {selectedQuote.changePercent >= 0 ? '+' : ''}{selectedQuote.changePercent.toFixed(2)}%
                    </div>
                  </div>
                  <div className="stat-glass rounded-lg p-3">
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Tick Size</div>
                    <div className="text-xl font-bold font-mono tabular-nums">${selectedInfo.tickSize}</div>
                  </div>
                  <div className="stat-glass rounded-lg p-3">
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Point Value</div>
                    <div className="text-xl font-bold font-mono tabular-nums">${selectedInfo.pointValue.toLocaleString()}</div>
                  </div>
                  <div className="stat-glass rounded-lg p-3">
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Day High</div>
                    <div className="text-lg font-semibold font-mono tabular-nums">${selectedQuote.high.toLocaleString()}</div>
                  </div>
                  <div className="stat-glass rounded-lg p-3">
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Day Low</div>
                    <div className="text-lg font-semibold font-mono tabular-nums">${selectedQuote.low.toLocaleString()}</div>
                  </div>
                  <div className="stat-glass rounded-lg p-3">
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Previous Close</div>
                    <div className="text-lg font-semibold font-mono tabular-nums">${selectedQuote.previousClose.toLocaleString()}</div>
                  </div>
                  <div className="stat-glass rounded-lg p-3">
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Volume</div>
                    <div className="text-lg font-semibold font-mono tabular-nums">{selectedQuote.volume.toLocaleString()}</div>
                  </div>
                </div>
                
                <div className="p-4 rounded-lg glass-card">
                  <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">Quick Math</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">1 Tick Move = </span>
                      <span className="font-medium font-mono">${(selectedInfo.tickSize * selectedInfo.pointValue).toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">1 Point Move = </span>
                      <span className="font-medium font-mono">${selectedInfo.pointValue.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Day Range = </span>
                      <span className="font-medium font-mono">${(selectedQuote.high - selectedQuote.low).toFixed(2)} pts</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Day P&L (1 lot) = </span>
                      <span className={`font-medium font-mono ${selectedQuote.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {selectedQuote.change >= 0 ? '+' : ''}${(selectedQuote.change * selectedInfo.pointValue).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
