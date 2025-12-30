import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Loader2
} from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { apiRequest } from "@/lib/queryClient";

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

interface FuturesResearchBrief {
  symbol: string;
  name: string;
  currentPrice: number;
  session: string;
  generatedAt: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  biasStrength: 'strong' | 'moderate' | 'weak';
  keyLevels: {
    resistance: number[];
    support: number[];
    pivot: number;
  };
  technicalSummary: string;
  sessionContext: string;
  catalysts: string[];
  riskFactors: string[];
  tradingIdea?: {
    direction: 'long' | 'short';
    entry: number;
    target: number;
    stop: number;
    rationale: string;
  };
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
          <div className="text-2xl font-bold tracking-tight" data-testid={`text-futures-price-${quote.symbol}`}>
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

export default function FuturesPage() {
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [researchBrief, setResearchBrief] = useState<FuturesResearchBrief | null>(null);
  
  const { data: quotes = [], isLoading, refetch, isFetching } = useQuery<FuturesQuote[]>({
    queryKey: ['/api/futures'],
    refetchInterval: 10000,
  });
  
  const { data: symbols = [] } = useQuery<FuturesSymbolInfo[]>({
    queryKey: ['/api/futures/symbols'],
  });
  
  const researchMutation = useMutation({
    mutationFn: async (symbol: string) => {
      const response = await fetch(`/api/futures/${symbol}/research`);
      if (!response.ok) throw new Error('Failed to generate research');
      return response.json() as Promise<FuturesResearchBrief>;
    },
    onSuccess: (data) => setResearchBrief(data),
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
      setResearchBrief(null);
    } else {
      setSelectedSymbol(symbol);
      setResearchBrief(null);
    }
  };
  
  const selectedQuote = quotes.find(q => q.symbol === selectedSymbol);
  const selectedInfo = symbols.find(s => s.symbol === selectedSymbol);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="relative overflow-hidden rounded-xl glass-card p-6">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-cyan-400/10" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3" data-testid="text-page-title">
              <Activity className="h-8 w-8 text-purple-400" />
              Futures Trading
            </h1>
            <p className="text-muted-foreground mt-1">24-hour markets - Trade anytime</p>
            <div className="flex items-center gap-3 mt-3 flex-wrap">
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
          </div>
          
          <Button
            variant="glass"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh-futures"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

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
          {isLoading ? (
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
              onClick={() => researchMutation.mutate(selectedQuote.symbol)}
              disabled={researchMutation.isPending}
              className="gap-2"
              data-testid="button-generate-research"
            >
              {researchMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Brain className="h-4 w-4" />
              )}
              {researchMutation.isPending ? 'Analyzing...' : 'AI Research'}
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              <div>
                <div className="text-sm text-muted-foreground">Current Price</div>
                <div className="text-2xl font-bold">${selectedQuote.price.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Change</div>
                <div className={`text-xl font-bold ${selectedQuote.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {selectedQuote.changePercent >= 0 ? '+' : ''}{selectedQuote.changePercent.toFixed(2)}%
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Tick Size</div>
                <div className="text-xl font-bold">${selectedInfo.tickSize}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Point Value</div>
                <div className="text-xl font-bold">${selectedInfo.pointValue.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Day High</div>
                <div className="text-lg font-semibold">${selectedQuote.high.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Day Low</div>
                <div className="text-lg font-semibold">${selectedQuote.low.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Previous Close</div>
                <div className="text-lg font-semibold">${selectedQuote.previousClose.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Volume</div>
                <div className="text-lg font-semibold">{selectedQuote.volume.toLocaleString()}</div>
              </div>
            </div>
            
            <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
              <h4 className="font-semibold mb-2">Quick Math</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">1 Tick Move = </span>
                  <span className="font-medium">${(selectedInfo.tickSize * selectedInfo.pointValue).toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">1 Point Move = </span>
                  <span className="font-medium">${selectedInfo.pointValue.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Day Range = </span>
                  <span className="font-medium">${(selectedQuote.high - selectedQuote.low).toFixed(2)} pts</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Day P&L (1 lot) = </span>
                  <span className={`font-medium ${selectedQuote.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {selectedQuote.change >= 0 ? '+' : ''}${(selectedQuote.change * selectedInfo.pointValue).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {researchBrief && researchBrief.symbol === selectedSymbol && (
              <div className="space-y-4" data-testid="panel-futures-research">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    AI Research Brief
                  </h4>
                  <Badge 
                    variant="outline" 
                    className={
                      researchBrief.bias === 'bullish' 
                        ? 'border-green-500/30 text-green-400' 
                        : researchBrief.bias === 'bearish' 
                        ? 'border-red-500/30 text-red-400' 
                        : 'border-yellow-500/30 text-yellow-400'
                    }
                    data-testid="badge-research-bias"
                  >
                    {researchBrief.bias === 'bullish' && <ArrowUpRight className="h-3 w-3 mr-1" />}
                    {researchBrief.bias === 'bearish' && <ArrowDownRight className="h-3 w-3 mr-1" />}
                    {researchBrief.biasStrength.toUpperCase()} {researchBrief.bias.toUpperCase()}
                  </Badge>
                </div>

                <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                  <p className="text-sm" data-testid="text-technical-summary">{researchBrief.technicalSummary}</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                    <div className="text-xs text-muted-foreground mb-1">Key Resistance</div>
                    <div className="font-medium text-red-400">
                      {researchBrief.keyLevels.resistance.map(r => '$' + r.toFixed(2)).join(', ')}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                    <div className="text-xs text-muted-foreground mb-1">Pivot Point</div>
                    <div className="font-medium text-yellow-400">${researchBrief.keyLevels.pivot.toFixed(2)}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                    <div className="text-xs text-muted-foreground mb-1">Key Support</div>
                    <div className="font-medium text-green-400">
                      {researchBrief.keyLevels.support.map(s => '$' + s.toFixed(2)).join(', ')}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                      <Target className="h-3 w-3 text-cyan-400" />
                      Catalysts
                    </div>
                    <ul className="text-sm space-y-1">
                      {researchBrief.catalysts.map((c, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-cyan-400 mt-0.5">•</span>
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                      <ShieldAlert className="h-3 w-3 text-orange-400" />
                      Risk Factors
                    </div>
                    <ul className="text-sm space-y-1">
                      {researchBrief.riskFactors.map((r, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-orange-400 mt-0.5">•</span>
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {researchBrief.tradingIdea && (
                  <div className={`p-4 rounded-lg border ${researchBrief.tradingIdea.direction === 'long' ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant={researchBrief.tradingIdea.direction === 'long' ? 'default' : 'destructive'}>
                        {researchBrief.tradingIdea.direction === 'long' ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
                        {researchBrief.tradingIdea.direction.toUpperCase()}
                      </Badge>
                      <span className="text-sm font-medium">Trade Idea</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 mb-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Entry: </span>
                        <span className="font-medium">${researchBrief.tradingIdea.entry.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Target: </span>
                        <span className="font-medium text-green-400">${researchBrief.tradingIdea.target.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Stop: </span>
                        <span className="font-medium text-red-400">${researchBrief.tradingIdea.stop.toFixed(2)}</span>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">{researchBrief.tradingIdea.rationale}</p>
                  </div>
                )}

                <div className="text-xs text-muted-foreground text-right">
                  Generated: {new Date(researchBrief.generatedAt).toLocaleString()}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-400" />
            Educational Disclaimer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Futures trading involves substantial risk of loss and is not suitable for all investors. 
            The leverage in futures can work against you as well as for you. This information is for 
            educational purposes only and should not be considered investment advice. Past performance 
            is not indicative of future results. Always consult with a qualified financial advisor 
            before making trading decisions.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
