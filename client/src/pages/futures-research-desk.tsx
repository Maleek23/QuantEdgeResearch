import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Brain, 
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
  Target,
  ShieldAlert,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Zap
} from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface FuturesResearchBrief {
  id: string;
  symbol: string;
  name: string;
  currentPrice: number;
  session: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  biasStrength: 'strong' | 'moderate' | 'weak';
  technicalSummary: string;
  sessionContext: string;
  resistanceLevels: string[] | null;
  supportLevels: string[] | null;
  pivotLevel: number | null;
  catalysts: string[] | null;
  riskFactors: string[] | null;
  tradeDirection: 'long' | 'short' | null;
  tradeEntry: number | null;
  tradeTarget: number | null;
  tradeStop: number | null;
  tradeRationale: string | null;
  generatedAt: string;
  expiresAt: string;
  source: string;
  isActive: boolean;
}

const SESSION_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  rth: { label: 'Regular Hours', color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: Sun },
  pre: { label: 'Pre-Market', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: Sunrise },
  post: { label: 'Post-Market', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: Sun },
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

const BIAS_STYLES: Record<string, { bg: string; text: string; icon: any }> = {
  bullish: { bg: 'bg-green-500/20', text: 'text-green-400', icon: TrendingUp },
  bearish: { bg: 'bg-red-500/20', text: 'text-red-400', icon: TrendingDown },
  neutral: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', icon: Activity },
};

function SessionIndicator({ session }: { session: string }) {
  const config = SESSION_LABELS[session] || SESSION_LABELS.closed;
  const Icon = config.icon;
  
  return (
    <Badge variant="outline" className={`${config.color} border gap-1.5`} data-testid="badge-session">
      <Icon className="h-3.5 w-3.5" />
      {config.label}
    </Badge>
  );
}

function ResearchBriefCard({ brief, onRefresh, isRefreshing }: { 
  brief: FuturesResearchBrief; 
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const Icon = CATEGORY_ICONS[brief.symbol] || Activity;
  const biasStyle = BIAS_STYLES[brief.bias] || BIAS_STYLES.neutral;
  const BiasIcon = biasStyle.icon;
  
  const generatedDate = new Date(brief.generatedAt);
  const timeAgo = Math.floor((Date.now() - generatedDate.getTime()) / 60000);
  const timeDisplay = timeAgo < 60 ? `${timeAgo}m ago` : `${Math.floor(timeAgo / 60)}h ago`;
  
  return (
    <Card className="glass-card hover-elevate transition-all duration-200" data-testid={`card-research-brief-${brief.symbol}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${biasStyle.bg}`}>
              <Icon className={`h-5 w-5 ${biasStyle.text}`} />
            </div>
            <div>
              <CardTitle className="text-xl flex items-center gap-2" data-testid={`text-brief-symbol-${brief.symbol}`}>
                {brief.symbol}
                <Badge variant="outline" className={`${biasStyle.bg} ${biasStyle.text} border-transparent gap-1`}>
                  <BiasIcon className="h-3 w-3" />
                  {brief.biasStrength} {brief.bias}
                </Badge>
              </CardTitle>
              <p className="text-sm text-muted-foreground">{brief.name}</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onRefresh}
            disabled={isRefreshing}
            data-testid={`button-refresh-${brief.symbol}`}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <div className="text-2xl font-bold" data-testid={`text-price-${brief.symbol}`}>
            ${brief.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <SessionIndicator session={brief.session} />
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {timeDisplay}
          </span>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Key Levels */}
        <div className="grid grid-cols-3 gap-3">
          <div className="glass rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground mb-1">Resistance</div>
            <div className="text-sm font-medium text-red-400" data-testid={`text-resistance-${brief.symbol}`}>
              {brief.resistanceLevels?.[0] || '-'}
            </div>
          </div>
          <div className="glass rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground mb-1">Pivot</div>
            <div className="text-sm font-medium text-yellow-400" data-testid={`text-pivot-${brief.symbol}`}>
              {brief.pivotLevel?.toLocaleString() || '-'}
            </div>
          </div>
          <div className="glass rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground mb-1">Support</div>
            <div className="text-sm font-medium text-green-400" data-testid={`text-support-${brief.symbol}`}>
              {brief.supportLevels?.[0] || '-'}
            </div>
          </div>
        </div>
        
        {/* Technical Summary */}
        <div className="glass rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-medium">Technical Analysis</span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed" data-testid={`text-summary-${brief.symbol}`}>
            {brief.technicalSummary}
          </p>
        </div>
        
        {/* Trading Idea */}
        {brief.tradeDirection && brief.tradeEntry && (
          <div className={`rounded-lg p-4 border ${brief.tradeDirection === 'long' ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
            <div className="flex items-center gap-2 mb-3">
              <Target className={`h-4 w-4 ${brief.tradeDirection === 'long' ? 'text-green-400' : 'text-red-400'}`} />
              <span className="text-sm font-medium">Trading Idea</span>
              <Badge variant="outline" className={brief.tradeDirection === 'long' ? 'text-green-400 border-green-500/30' : 'text-red-400 border-red-500/30'}>
                {brief.tradeDirection === 'long' ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
                {brief.tradeDirection.toUpperCase()}
              </Badge>
            </div>
            
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <div className="text-xs text-muted-foreground">Entry</div>
                <div className="font-medium" data-testid={`text-entry-${brief.symbol}`}>${brief.tradeEntry.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Target</div>
                <div className="font-medium text-green-400" data-testid={`text-target-${brief.symbol}`}>${brief.tradeTarget?.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Stop</div>
                <div className="font-medium text-red-400" data-testid={`text-stop-${brief.symbol}`}>${brief.tradeStop?.toLocaleString()}</div>
              </div>
            </div>
            
            {brief.tradeRationale && (
              <p className="text-sm text-muted-foreground" data-testid={`text-rationale-${brief.symbol}`}>
                {brief.tradeRationale}
              </p>
            )}
          </div>
        )}
        
        {/* Catalysts & Risks */}
        {(brief.catalysts?.length || brief.riskFactors?.length) && (
          <div className="grid grid-cols-2 gap-3">
            {brief.catalysts?.length ? (
              <div className="glass rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                  <span className="text-xs font-medium">Catalysts</span>
                </div>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {brief.catalysts.slice(0, 3).map((c, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <span className="text-cyan-400">•</span> {c}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            
            {brief.riskFactors?.length ? (
              <div className="glass rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <ShieldAlert className="h-3.5 w-3.5 text-orange-400" />
                  <span className="text-xs font-medium">Risks</span>
                </div>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {brief.riskFactors.slice(0, 3).map((r, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <span className="text-orange-400">•</span> {r}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function FuturesResearchDesk() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [refreshingSymbol, setRefreshingSymbol] = useState<string | null>(null);
  const { toast } = useToast();
  
  const { data: briefs = [], isLoading, refetch, isFetching } = useQuery<FuturesResearchBrief[]>({
    queryKey: ['/api/futures-research/briefs'],
    refetchInterval: 60000,
  });
  
  const generateAllMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/futures-research/generate-all');
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/futures-research/briefs'] });
      toast({
        title: "Research Generated",
        description: `Generated ${data.generated || 0} research briefs`,
      });
    },
    onError: () => {
      toast({
        title: "Generation Failed",
        description: "Failed to generate research briefs. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  const generateSingleMutation = useMutation({
    mutationFn: async (symbol: string) => {
      setRefreshingSymbol(symbol);
      const response = await apiRequest('POST', `/api/futures-research/generate/${symbol}`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/futures-research/briefs'] });
      setRefreshingSymbol(null);
      toast({
        title: "Research Updated",
        description: "Research brief has been refreshed",
      });
    },
    onError: () => {
      setRefreshingSymbol(null);
      toast({
        title: "Refresh Failed",
        description: "Failed to refresh research brief",
        variant: "destructive",
      });
    },
  });
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  const etTime = formatInTimeZone(currentTime, 'America/New_York', 'h:mm:ss a');
  const ctTime = formatInTimeZone(currentTime, 'America/Chicago', 'h:mm:ss a');
  
  const indexBriefs = briefs.filter(b => ['ES', 'NQ', 'YM', 'RTY'].includes(b.symbol));
  const commodityBriefs = briefs.filter(b => ['GC', 'SI', 'CL', 'NG'].includes(b.symbol));
  const otherBriefs = briefs.filter(b => !['ES', 'NQ', 'YM', 'RTY', 'GC', 'SI', 'CL', 'NG'].includes(b.symbol));

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl glass-card p-6">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-cyan-400/10" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3" data-testid="text-page-title">
              <Brain className="h-8 w-8 text-purple-400" />
              Research Desk (Futures)
            </h1>
            <p className="text-muted-foreground mt-1">AI-powered futures market analysis • 24-hour markets</p>
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <div className="flex items-center gap-2 glass rounded-lg px-3 py-1.5">
                <Clock className="h-4 w-4 text-cyan-400" />
                <span className="text-sm font-medium" data-testid="text-ct-time">{ctTime} CT</span>
              </div>
              <div className="flex items-center gap-2 glass rounded-lg px-3 py-1.5">
                <Clock className="h-4 w-4 text-purple-400" />
                <span className="text-sm font-medium" data-testid="text-et-time">{etTime} ET</span>
              </div>
              <Badge variant="outline" className="text-cyan-400 border-cyan-500/30">
                <Zap className="h-3 w-3 mr-1" />
                {briefs.length} Active Briefs
              </Badge>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button
              variant="glass"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="button-refresh-briefs"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => generateAllMutation.mutate()}
              disabled={generateAllMutation.isPending}
              data-testid="button-generate-all-research"
            >
              {generateAllMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Generate All Research
            </Button>
          </div>
        </div>
      </div>

      {/* Session Schedule */}
      <div className="glass-card rounded-xl p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div className="text-center">
            <div className="text-muted-foreground">Overnight</div>
            <div className="font-medium text-purple-400">5:00 PM - 6:00 AM ET</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">Pre-Market</div>
            <div className="font-medium text-yellow-400">6:00 AM - 9:30 AM ET</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">Regular Hours</div>
            <div className="font-medium text-green-400">9:30 AM - 4:00 PM ET</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">Closed</div>
            <div className="font-medium text-red-400">Fri 5PM - Sun 6PM ET</div>
          </div>
        </div>
      </div>

      {/* Research Briefs */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-[400px] rounded-xl" />
          ))}
        </div>
      ) : briefs.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="py-16 text-center">
            <Brain className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Research Briefs Yet</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Generate AI-powered research briefs for major futures contracts including indices, commodities, and currencies.
            </p>
            <Button
              onClick={() => generateAllMutation.mutate()}
              disabled={generateAllMutation.isPending}
              data-testid="button-generate-research-empty"
            >
              {generateAllMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Generate Research Briefs
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Index Futures */}
          {indexBriefs.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-cyan-400" />
                Index Futures
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {indexBriefs.map((brief) => (
                  <ResearchBriefCard 
                    key={brief.id} 
                    brief={brief} 
                    onRefresh={() => generateSingleMutation.mutate(brief.symbol)}
                    isRefreshing={refreshingSymbol === brief.symbol}
                  />
                ))}
              </div>
            </div>
          )}
          
          {/* Commodity Futures */}
          {commodityBriefs.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Coins className="h-5 w-5 text-yellow-400" />
                Commodity Futures
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {commodityBriefs.map((brief) => (
                  <ResearchBriefCard 
                    key={brief.id} 
                    brief={brief} 
                    onRefresh={() => generateSingleMutation.mutate(brief.symbol)}
                    isRefreshing={refreshingSymbol === brief.symbol}
                  />
                ))}
              </div>
            </div>
          )}
          
          {/* Other Futures */}
          {otherBriefs.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-green-400" />
                Other Futures
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {otherBriefs.map((brief) => (
                  <ResearchBriefCard 
                    key={brief.id} 
                    brief={brief} 
                    onRefresh={() => generateSingleMutation.mutate(brief.symbol)}
                    isRefreshing={refreshingSymbol === brief.symbol}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Educational Disclaimer */}
      <Card className="glass-card border-yellow-500/30">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-yellow-400">Educational Research Only:</span>{" "}
              Futures research briefs are AI-generated for educational purposes. They do not constitute financial advice. 
              Futures trading involves substantial risk of loss and is not suitable for all investors. Always do your own research and consult with a qualified financial advisor.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
