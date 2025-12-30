import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
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
  Bitcoin,
  DollarSign,
  Brain,
  Search,
  Loader2,
  FileText,
  Sparkles,
  AlertCircle
} from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { apiRequest } from "@/lib/queryClient";
import { getMarketSession } from "@/lib/utils";

interface RealtimeQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
  lastUpdate: string;
  assetType: string;
}

interface BatchQuotesResponse {
  quotes: Record<string, RealtimeQuote>;
  count: number;
}

const STOCKS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AMD', 'NFLX', 'COIN'];
const STOCK_NAMES: Record<string, string> = {
  'AAPL': 'Apple Inc.',
  'MSFT': 'Microsoft Corp.',
  'GOOGL': 'Alphabet Inc.',
  'AMZN': 'Amazon.com Inc.',
  'NVDA': 'NVIDIA Corp.',
  'META': 'Meta Platforms',
  'TSLA': 'Tesla Inc.',
  'AMD': 'AMD Inc.',
  'NFLX': 'Netflix Inc.',
  'COIN': 'Coinbase Global'
};

const CRYPTOS = ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'ADA', 'AVAX', 'LINK'];
const CRYPTO_NAMES: Record<string, string> = {
  'BTC': 'Bitcoin',
  'ETH': 'Ethereum',
  'SOL': 'Solana',
  'DOGE': 'Dogecoin',
  'XRP': 'XRP',
  'ADA': 'Cardano',
  'AVAX': 'Avalanche',
  'LINK': 'Chainlink'
};

const SESSION_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  rth: { label: 'Regular Hours', color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: Sun },
  'pre-market': { label: 'Pre-Market', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: Sunrise },
  'after-hours': { label: 'After-Hours', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: Moon },
  closed: { label: 'Market Closed', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: AlertTriangle },
};

function MarketCard({ quote, onClick }: { quote: RealtimeQuote; onClick: () => void }) {
  const isPositive = quote.changePercent >= 0;
  const isCrypto = quote.assetType === 'crypto';
  const Icon = isCrypto ? Bitcoin : DollarSign;
  
  return (
    <Card 
      className="hover-elevate cursor-pointer transition-all duration-200 glass-card"
      onClick={onClick}
      data-testid={`card-market-${quote.symbol}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${isPositive ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
              <Icon className={`h-4 w-4 ${isPositive ? 'text-green-400' : 'text-red-400'}`} />
            </div>
            <div>
              <div className="font-bold text-lg" data-testid={`text-market-symbol-${quote.symbol}`}>{quote.symbol}</div>
              <div className="text-xs text-muted-foreground truncate max-w-[120px]">
                {isCrypto ? CRYPTO_NAMES[quote.symbol] : STOCK_NAMES[quote.symbol] || quote.name}
              </div>
            </div>
          </div>
          {isPositive ? (
            <TrendingUp className="h-5 w-5 text-green-400" />
          ) : (
            <TrendingDown className="h-5 w-5 text-red-400" />
          )}
        </div>
        
        <div className="space-y-2">
          <div className="text-2xl font-bold tracking-tight" data-testid={`text-market-price-${quote.symbol}`}>
            ${quote.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          
          <div className={`flex items-center gap-2 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
            <span className="font-medium" data-testid={`text-market-change-${quote.symbol}`}>
              {isPositive ? '+' : ''}{quote.change.toFixed(2)}
            </span>
            <Badge variant="outline" className={isPositive ? 'border-green-500/30 text-green-400' : 'border-red-500/30 text-red-400'}>
              {isPositive ? '+' : ''}{quote.changePercent.toFixed(2)}%
            </Badge>
          </div>
          
          <div className="flex justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
            <span>H: ${quote.high.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span>L: ${quote.low.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          
          {quote.volume > 0 && (
            <div className="text-xs text-muted-foreground">
              Vol: {formatVolume(quote.volume)}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function formatVolume(volume: number): string {
  if (volume >= 1_000_000_000) return `${(volume / 1_000_000_000).toFixed(2)}B`;
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(2)}M`;
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(2)}K`;
  return volume.toFixed(0);
}

function SessionIndicator({ session }: { session: string }) {
  const config = SESSION_LABELS[session] || SESSION_LABELS.closed;
  const Icon = config.icon;
  
  return (
    <Badge variant="outline" className={`${config.color} border gap-1.5`} data-testid="badge-market-session">
      <Icon className="h-3.5 w-3.5" />
      {config.label}
    </Badge>
  );
}

export default function MarketsPage() {
  const [selectedQuote, setSelectedQuote] = useState<RealtimeQuote | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [optionSymbol, setOptionSymbol] = useState('');
  const [activeTab, setActiveTab] = useState('stocks');
  
  const stockRequests = STOCKS.map(symbol => ({ symbol, assetType: 'stock' as const }));
  const cryptoRequests = CRYPTOS.map(symbol => ({ symbol, assetType: 'crypto' as const }));
  
  const { data: stocksData, isLoading: stocksLoading, refetch: refetchStocks, isFetching: stocksFetching } = useQuery<BatchQuotesResponse>({
    queryKey: ['/api/realtime-quotes/batch', 'stocks'],
    queryFn: async () => {
      const response = await apiRequest('POST', '/api/realtime-quotes/batch', { requests: stockRequests });
      return await response.json();
    },
    refetchInterval: 10000,
  });
  
  const { data: cryptoData, isLoading: cryptoLoading, refetch: refetchCrypto, isFetching: cryptoFetching } = useQuery<BatchQuotesResponse>({
    queryKey: ['/api/realtime-quotes/batch', 'crypto'],
    queryFn: async () => {
      const response = await apiRequest('POST', '/api/realtime-quotes/batch', { requests: cryptoRequests });
      return await response.json();
    },
    refetchInterval: 10000,
  });
  
  const optionMutation = useMutation({
    mutationFn: async (occSymbol: string) => {
      const response = await apiRequest('POST', '/api/realtime-quotes/batch', { 
        requests: [{ symbol: occSymbol, assetType: 'option' }] 
      });
      return await response.json() as BatchQuotesResponse;
    },
  });
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  const ctTime = formatInTimeZone(currentTime, 'America/Chicago', 'h:mm:ss a');
  const currentSession = getMarketSession();
  
  const stockQuotes = stocksData?.quotes || {};
  const cryptoQuotes = cryptoData?.quotes || {};
  
  // API returns quotes keyed just by symbol (not with asset type prefix)
  const stocksList = STOCKS.map(symbol => stockQuotes[symbol]).filter(Boolean) as RealtimeQuote[];
  const cryptoList = CRYPTOS.map(symbol => cryptoQuotes[symbol]).filter(Boolean) as RealtimeQuote[];
  
  const handleRefresh = () => {
    if (activeTab === 'stocks') {
      refetchStocks();
    } else if (activeTab === 'crypto') {
      refetchCrypto();
    }
  };
  
  const handleCardClick = (quote: RealtimeQuote) => {
    if (selectedQuote?.symbol === quote.symbol) {
      setSelectedQuote(null);
    } else {
      setSelectedQuote(quote);
    }
  };
  
  const handleOptionSearch = () => {
    if (optionSymbol.trim()) {
      optionMutation.mutate(optionSymbol.trim().toUpperCase());
    }
  };
  
  const isFetching = activeTab === 'stocks' ? stocksFetching : cryptoFetching;
  const isLoading = activeTab === 'stocks' ? stocksLoading : cryptoLoading;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="relative overflow-hidden rounded-xl glass-card p-6">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-green-400/10" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3" data-testid="text-page-title">
              <Activity className="h-8 w-8 text-cyan-400" />
              Markets Overview
            </h1>
            <p className="text-muted-foreground mt-1">Real-time pricing for Stocks, Crypto & Options</p>
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <SessionIndicator session={currentSession} />
              <div className="flex items-center gap-2 glass rounded-lg px-3 py-1.5">
                <Clock className="h-4 w-4 text-cyan-400" />
                <span className="text-sm font-medium" data-testid="text-ct-time">{ctTime} CT</span>
              </div>
            </div>
          </div>
          
          <Button
            variant="glass"
            size="sm"
            onClick={handleRefresh}
            disabled={isFetching}
            data-testid="button-refresh-markets"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="glass mb-4" data-testid="tabs-market-categories">
          <TabsTrigger value="stocks" data-testid="tab-stocks">
            <DollarSign className="h-4 w-4 mr-1.5" />
            Stocks
          </TabsTrigger>
          <TabsTrigger value="crypto" data-testid="tab-crypto">
            <Bitcoin className="h-4 w-4 mr-1.5" />
            Crypto
          </TabsTrigger>
          <TabsTrigger value="options" data-testid="tab-options">
            <FileText className="h-4 w-4 mr-1.5" />
            Options
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="stocks" className="space-y-6">
          {stocksLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-[180px] rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {stocksList.map((quote) => (
                <MarketCard 
                  key={quote.symbol} 
                  quote={quote} 
                  onClick={() => handleCardClick(quote)}
                />
              ))}
            </div>
          )}
          
          {selectedQuote && selectedQuote.assetType === 'stock' && (
            <Card className="glass-card" data-testid="card-stock-detail">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${selectedQuote.changePercent >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                    <DollarSign className="h-5 w-5 text-foreground" />
                  </div>
                  {selectedQuote.symbol} - {STOCK_NAMES[selectedQuote.symbol] || selectedQuote.name}
                </CardTitle>
                <Button className="gap-2" data-testid="button-ai-research">
                  <Brain className="h-4 w-4" />
                  AI Research
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                  <div>
                    <div className="text-sm text-muted-foreground">Current Price</div>
                    <div className="text-2xl font-bold">${selectedQuote.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Change</div>
                    <div className={`text-xl font-bold ${selectedQuote.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {selectedQuote.changePercent >= 0 ? '+' : ''}{selectedQuote.changePercent.toFixed(2)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Day High</div>
                    <div className="text-lg font-semibold">${selectedQuote.high.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Day Low</div>
                    <div className="text-lg font-semibold">${selectedQuote.low.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  </div>
                </div>
                {selectedQuote.volume > 0 && (
                  <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
                    <span className="text-muted-foreground">Volume: </span>
                    <span className="font-medium">{formatVolume(selectedQuote.volume)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        <TabsContent value="crypto" className="space-y-6">
          {cryptoLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-[180px] rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {cryptoList.map((quote) => (
                <MarketCard 
                  key={quote.symbol} 
                  quote={quote} 
                  onClick={() => handleCardClick(quote)}
                />
              ))}
            </div>
          )}
          
          {selectedQuote && selectedQuote.assetType === 'crypto' && (
            <Card className="glass-card" data-testid="card-crypto-detail">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${selectedQuote.changePercent >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                    <Bitcoin className="h-5 w-5 text-foreground" />
                  </div>
                  {selectedQuote.symbol} - {CRYPTO_NAMES[selectedQuote.symbol] || selectedQuote.name}
                </CardTitle>
                <Button className="gap-2" data-testid="button-ai-research-crypto">
                  <Brain className="h-4 w-4" />
                  AI Research
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                  <div>
                    <div className="text-sm text-muted-foreground">Current Price</div>
                    <div className="text-2xl font-bold">${selectedQuote.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">24h Change</div>
                    <div className={`text-xl font-bold ${selectedQuote.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {selectedQuote.changePercent >= 0 ? '+' : ''}{selectedQuote.changePercent.toFixed(2)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">24h High</div>
                    <div className="text-lg font-semibold">${selectedQuote.high.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">24h Low</div>
                    <div className="text-lg font-semibold">${selectedQuote.low.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  </div>
                </div>
                {selectedQuote.volume > 0 && (
                  <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
                    <span className="text-muted-foreground">24h Volume: </span>
                    <span className="font-medium">${formatVolume(selectedQuote.volume)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        <TabsContent value="options" className="space-y-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <FileText className="h-6 w-6 text-purple-400" />
                Options Contract Lookup
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-yellow-400 mb-1">Options require a specific contract symbol</p>
                  <p className="text-muted-foreground">
                    Enter an OCC symbol to lookup option pricing. Example: <code className="bg-muted px-1 rounded">AAPL250117C00200000</code> for AAPL Jan 17, 2025 $200 Call.
                  </p>
                </div>
              </div>
              
              <div className="flex gap-3">
                <Input
                  placeholder="Enter OCC symbol (e.g., AAPL250117C00200000)"
                  value={optionSymbol}
                  onChange={(e) => setOptionSymbol(e.target.value)}
                  className="flex-1"
                  data-testid="input-option-symbol"
                />
                <Button 
                  onClick={handleOptionSearch}
                  disabled={optionMutation.isPending || !optionSymbol.trim()}
                  data-testid="button-search-option"
                >
                  {optionMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Search className="h-4 w-4 mr-2" />
                  )}
                  Lookup
                </Button>
              </div>
              
              {optionMutation.data && Object.keys(optionMutation.data.quotes).length > 0 && (
                <div className="space-y-4">
                  {Object.values(optionMutation.data.quotes).map((quote) => (
                    <div key={quote.symbol} className="p-4 rounded-lg bg-muted/30 border border-border/50">
                      <div className="flex items-center justify-between mb-3">
                        <div className="font-bold text-lg">{quote.symbol}</div>
                        <Badge variant="outline" className="border-purple-500/30 text-purple-400">Option</Badge>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div>
                          <div className="text-xs text-muted-foreground">Last Price</div>
                          <div className="font-bold">${quote.price.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Bid</div>
                          <div className="font-medium">${quote.low.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Ask</div>
                          <div className="font-medium">${quote.high.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Spread</div>
                          <div className="font-medium">${(quote.high - quote.low).toFixed(2)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {optionMutation.isError && (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  Failed to fetch option quote. Please verify the OCC symbol format.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="glass-card rounded-xl p-4 border border-yellow-500/20 bg-yellow-500/5">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-yellow-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-yellow-400 mb-1">Educational Disclaimer</p>
            <p>
              The information provided on this page is for educational and informational purposes only. 
              It should not be considered financial advice. All investments carry risk and past performance 
              does not guarantee future results. Please consult with a qualified financial advisor before 
              making any investment decisions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
