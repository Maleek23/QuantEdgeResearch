import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  TrendingUp,
  TrendingDown,
  MessageSquare,
  Flame,
  DollarSign,
  Target,
  Filter,
  RefreshCw,
  ExternalLink,
  BarChart3,
  Zap,
  Coins,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { SiReddit } from "react-icons/si";
import { cn } from "@/lib/utils";

interface TrendingStock {
  symbol: string;
  mentionCount: number;
  sentimentScore: number;
  sentiment: "bullish" | "bearish" | "neutral";
  change24h: number;
  rank: number;
  source: string;
}

interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
}

const PRICE_TIERS = [
  { label: "Under $5", max: 5, description: "Penny stocks - high risk, low capital" },
  { label: "Under $10", max: 10, description: "Micro caps - small account friendly" },
  { label: "Under $25", max: 25, description: "Mid-range - options accessible" },
  { label: "Under $50", max: 50, description: "Blue chips lite" },
  { label: "All Prices", max: Infinity, description: "Show everything" },
];

export default function WSBTrending() {
  const { toast } = useToast();
  const [maxPrice, setMaxPrice] = useState<number>(25);
  const [showOptionsOnly, setShowOptionsOnly] = useState(false);
  const [minMentions, setMinMentions] = useState(10);
  const [selectedTier, setSelectedTier] = useState<number>(2);
  const [searchFilter, setSearchFilter] = useState("");

  const { data: trendingData, isLoading: trendingLoading, refetch: refetchTrending } = useQuery<{
    success: boolean;
    count: number;
    trending: TrendingStock[];
    lastUpdated: string;
  }>({
    queryKey: ["/api/automations/wsb-trending"],
    refetchInterval: 60000,
  });

  const trendingSymbols = useMemo(() => {
    return trendingData?.trending?.slice(0, 50).map(t => t.symbol) || [];
  }, [trendingData]);

  const { data: quotesData, isLoading: quotesLoading } = useQuery<{
    quotes: Record<string, StockQuote>;
  }>({
    queryKey: ["/api/quotes/batch", trendingSymbols.join(",")],
    enabled: trendingSymbols.length > 0,
    refetchInterval: 30000,
  });

  const filteredStocks = useMemo(() => {
    if (!trendingData?.trending) return [];
    
    const effectiveMax = PRICE_TIERS[selectedTier]?.max || maxPrice;
    
    return trendingData.trending
      .filter(stock => {
        const quote = quotesData?.quotes?.[stock.symbol];
        const price = quote?.price || 0;
        
        if (searchFilter && !stock.symbol.toLowerCase().includes(searchFilter.toLowerCase())) {
          return false;
        }
        
        if (stock.mentionCount < minMentions) return false;
        
        if (effectiveMax !== Infinity && price > effectiveMax) return false;
        
        if (showOptionsOnly && price < 2.5) return false;
        
        return true;
      })
      .map(stock => ({
        ...stock,
        quote: quotesData?.quotes?.[stock.symbol],
      }));
  }, [trendingData, quotesData, selectedTier, maxPrice, minMentions, showOptionsOnly, searchFilter]);

  const cheapOptionsPlays = useMemo(() => {
    return filteredStocks.filter(s => {
      const price = s.quote?.price || 0;
      return price >= 5 && price <= 50 && s.sentiment === "bullish" && s.mentionCount >= 20;
    }).slice(0, 10);
  }, [filteredStocks]);

  const cheapSharesPlays = useMemo(() => {
    return filteredStocks.filter(s => {
      const price = s.quote?.price || 0;
      return price <= 15 && s.mentionCount >= 15;
    }).slice(0, 15);
  }, [filteredStocks]);

  const handleRefresh = () => {
    refetchTrending();
    toast({
      title: "Refreshing Trending Data",
      description: "Fetching latest WSB/Reddit mentions...",
    });
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case "bullish": return "text-green-400";
      case "bearish": return "text-red-400";
      default: return "text-slate-400";
    }
  };

  const getSentimentBg = (sentiment: string) => {
    switch (sentiment) {
      case "bullish": return "bg-green-500/10 border-green-500/30";
      case "bearish": return "bg-red-500/10 border-red-500/30";
      default: return "bg-slate-500/10 border-slate-500/30";
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/20">
                <SiReddit className="w-6 h-6 text-orange-400" />
              </div>
              <h1 className="text-2xl font-bold" data-testid="text-page-title">WSB & Reddit Trending</h1>
              <Badge variant="outline" className="bg-cyan-500/10 border-cyan-500/30 text-cyan-400">
                <Flame className="w-3 h-3 mr-1" />
                Live
              </Badge>
            </div>
            <p className="text-slate-400 mt-1">
              Cheap stocks for shares & options from social sentiment
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh} data-testid="button-refresh">
              <RefreshCw className="w-4 h-4 mr-1" />
              Refresh
            </Button>
            <Link href="/chart-analysis">
              <Button size="sm" className="bg-cyan-500 hover:bg-cyan-400 text-slate-950" data-testid="button-analyze">
                <BarChart3 className="w-4 h-4 mr-1" />
                Analyze
              </Button>
            </Link>
          </div>
        </div>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Filter className="w-5 h-5 text-cyan-400" />
                Small Account Filters
              </CardTitle>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch 
                    checked={showOptionsOnly} 
                    onCheckedChange={setShowOptionsOnly}
                    id="options-only"
                    data-testid="switch-options-only"
                  />
                  <Label htmlFor="options-only" className="text-sm text-slate-300">
                    Options-Ready Only ($5+)
                  </Label>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {PRICE_TIERS.map((tier, idx) => (
                  <Button
                    key={tier.label}
                    variant={selectedTier === idx ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedTier(idx)}
                    className={cn(
                      selectedTier === idx && "bg-cyan-500 hover:bg-cyan-400 text-slate-950"
                    )}
                    data-testid={`button-tier-${idx}`}
                  >
                    <DollarSign className="w-3 h-3 mr-1" />
                    {tier.label}
                  </Button>
                ))}
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <Label className="text-xs text-slate-400 mb-2 block">Search Symbol</Label>
                  <Input
                    placeholder="Filter by ticker..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="bg-slate-800 border-slate-700"
                    data-testid="input-search"
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-xs text-slate-400 mb-2 block">
                    Min Mentions: {minMentions}
                  </Label>
                  <Slider
                    value={[minMentions]}
                    onValueChange={([v]) => setMinMentions(v)}
                    min={5}
                    max={100}
                    step={5}
                    className="mt-3"
                    data-testid="slider-mentions"
                  />
                </div>
              </div>
              
              <div className="flex items-center gap-4 text-sm text-slate-400">
                <span>Showing: <span className="text-white font-medium">{filteredStocks.length}</span> stocks</span>
                <span>Last updated: <span className="text-cyan-400">{trendingData?.lastUpdated ? new Date(trendingData.lastUpdated).toLocaleTimeString() : "..."}</span></span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="all" className="space-y-4">
          <TabsList className="bg-slate-900 border border-slate-800">
            <TabsTrigger value="all" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-slate-950" data-testid="tab-all">
              All Trending ({filteredStocks.length})
            </TabsTrigger>
            <TabsTrigger value="shares" className="data-[state=active]:bg-green-500 data-[state=active]:text-slate-950" data-testid="tab-shares">
              <Coins className="w-4 h-4 mr-1" />
              Cheap Shares ({cheapSharesPlays.length})
            </TabsTrigger>
            <TabsTrigger value="options" className="data-[state=active]:bg-purple-500 data-[state=active]:text-slate-950" data-testid="tab-options">
              <Target className="w-4 h-4 mr-1" />
              Options Plays ({cheapOptionsPlays.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {trendingLoading || quotesLoading ? (
                Array.from({ length: 9 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 bg-slate-800" />
                ))
              ) : (
                filteredStocks.slice(0, 30).map((stock) => (
                  <StockCard key={stock.symbol} stock={stock} />
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="shares" className="space-y-4">
            <Card className="bg-green-500/5 border-green-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2 text-green-400">
                  <Coins className="w-5 h-5" />
                  Best Cheap Shares for Small Accounts
                </CardTitle>
                <p className="text-sm text-slate-400">Under $15, high social buzz - perfect for share accumulation</p>
              </CardHeader>
            </Card>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {cheapSharesPlays.length === 0 ? (
                <div className="col-span-full text-center py-12 text-slate-400">
                  <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No cheap share plays matching your filters</p>
                  <p className="text-sm">Try adjusting price tier or minimum mentions</p>
                </div>
              ) : (
                cheapSharesPlays.map((stock) => (
                  <StockCard key={stock.symbol} stock={stock} highlight="shares" />
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="options" className="space-y-4">
            <Card className="bg-purple-500/5 border-purple-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2 text-purple-400">
                  <Target className="w-5 h-5" />
                  Trending Options Opportunities
                </CardTitle>
                <p className="text-sm text-slate-400">$5-$50 range, bullish sentiment, 20+ mentions - options-ready tickers</p>
              </CardHeader>
            </Card>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {cheapOptionsPlays.length === 0 ? (
                <div className="col-span-full text-center py-12 text-slate-400">
                  <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No options plays matching your filters</p>
                  <p className="text-sm">Looking for bullish stocks $5-$50 with 20+ mentions</p>
                </div>
              ) : (
                cheapOptionsPlays.map((stock) => (
                  <StockCard key={stock.symbol} stock={stock} highlight="options" />
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>

        <Card className="bg-amber-500/5 border-amber-500/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-amber-200 font-medium">Educational Disclaimer</p>
                <p className="text-xs text-slate-400 mt-1">
                  Social sentiment data is for research purposes only. High mention count does not equal good investment. 
                  Penny stocks and meme stocks carry extreme risk. Always do your own due diligence and never risk more than you can afford to lose.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StockCard({ stock, highlight }: { 
  stock: TrendingStock & { quote?: StockQuote }; 
  highlight?: "shares" | "options";
}) {
  const price = stock.quote?.price || 0;
  const change = stock.quote?.changePercent || 0;
  const isUp = change >= 0;

  const borderColor = highlight === "shares" 
    ? "border-green-500/30 hover:border-green-500/50" 
    : highlight === "options" 
    ? "border-purple-500/30 hover:border-purple-500/50"
    : "border-slate-700 hover:border-cyan-500/30";

  return (
    <Card className={cn("bg-slate-900/50 transition-colors", borderColor)} data-testid={`card-stock-${stock.symbol}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-white">{stock.symbol}</span>
            <Badge variant="outline" className={cn("text-xs", 
              stock.sentiment === "bullish" ? "bg-green-500/10 border-green-500/30 text-green-400" :
              stock.sentiment === "bearish" ? "bg-red-500/10 border-red-500/30 text-red-400" :
              "bg-slate-500/10 border-slate-500/30 text-slate-400"
            )}>
              {stock.sentiment}
            </Badge>
          </div>
          <span className="text-xs text-slate-500">#{stock.rank}</span>
        </div>

        <div className="mt-3 flex items-end justify-between">
          <div>
            <div className="text-2xl font-bold text-white">
              {price > 0 ? `$${price.toFixed(2)}` : "..."}
            </div>
            <div className={cn("flex items-center gap-1 text-sm", isUp ? "text-green-400" : "text-red-400")}>
              {isUp ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              {change.toFixed(2)}%
            </div>
          </div>
          
          <div className="text-right">
            <div className="flex items-center gap-1 text-orange-400">
              <MessageSquare className="w-4 h-4" />
              <span className="font-medium">{stock.mentionCount}</span>
            </div>
            <div className="text-xs text-slate-500">mentions</div>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {price > 0 && price <= 10 && (
              <Badge variant="outline" className="text-xs bg-green-500/10 border-green-500/30 text-green-400">
                <Coins className="w-3 h-3 mr-1" />
                Cheap
              </Badge>
            )}
            {price >= 5 && stock.sentiment === "bullish" && (
              <Badge variant="outline" className="text-xs bg-purple-500/10 border-purple-500/30 text-purple-400">
                <Target className="w-3 h-3 mr-1" />
                Options
              </Badge>
            )}
          </div>
          
          <Link href={`/chart-analysis?symbol=${stock.symbol}`}>
            <Button size="sm" variant="ghost" className="h-7 text-xs" data-testid={`button-analyze-${stock.symbol}`}>
              <Zap className="w-3 h-3 mr-1" />
              Analyze
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
