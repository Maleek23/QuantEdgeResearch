import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  TrendingUp,
  TrendingDown,
  MessageSquare,
  Flame,
  DollarSign,
  Target,
  Filter,
  RefreshCw,
  Send,
  Zap,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
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

interface FeedResult {
  success: boolean;
  ideasCreated: number;
  processed: number;
  results: { symbol: string; grade: string; confidence: number; id: string }[];
}

const PRICE_TIERS = [
  { label: "Under $5", max: 5, description: "Penny stocks" },
  { label: "Under $10", max: 10, description: "Small cap friendly" },
  { label: "Under $25", max: 25, description: "Options accessible" },
  { label: "Under $50", max: 50, description: "Mid-range" },
  { label: "All Prices", max: Infinity, description: "Everything" },
];

export default function SocialTrends() {
  const { toast } = useToast();
  const [maxPrice, setMaxPrice] = useState<number>(50);
  const [minMentions, setMinMentions] = useState(10);
  const [selectedTier, setSelectedTier] = useState<number>(3);
  const [searchFilter, setSearchFilter] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState<"all" | "bullish" | "bearish">("bullish");
  const [selectedSymbols, setSelectedSymbols] = useState<Set<string>>(new Set());
  const [showOptionsOnly, setShowOptionsOnly] = useState(false);

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

  const feedMutation = useMutation({
    mutationFn: async (params: { symbols?: string[]; minMentions?: number; sentimentFilter?: string }) => {
      const response = await apiRequest("POST", "/api/automations/social-trends/feed-to-trade-desk", params);
      return response.json() as Promise<FeedResult>;
    },
    onSuccess: (data) => {
      if (data.ideasCreated > 0) {
        toast({
          title: "Trade Ideas Created",
          description: `${data.ideasCreated} ideas sent to Trade Desk from ${data.processed} stocks`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/trade-ideas"] });
        setSelectedSymbols(new Set());
      } else {
        toast({
          title: "No Ideas Created",
          description: "Stocks didn't meet quality thresholds or already exist",
          variant: "default",
        });
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send to Trade Desk",
        variant: "destructive",
      });
    },
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
        
        if (sentimentFilter !== "all" && stock.sentiment !== sentimentFilter) return false;
        
        return true;
      })
      .map(stock => ({
        ...stock,
        quote: quotesData?.quotes?.[stock.symbol],
      }));
  }, [trendingData, quotesData, selectedTier, maxPrice, minMentions, showOptionsOnly, searchFilter, sentimentFilter]);

  const toggleSymbol = (symbol: string) => {
    setSelectedSymbols(prev => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedSymbols(new Set(filteredStocks.map(s => s.symbol)));
  };

  const clearSelection = () => {
    setSelectedSymbols(new Set());
  };

  const feedSelected = () => {
    if (selectedSymbols.size === 0) {
      toast({ title: "Select stocks first", variant: "default" });
      return;
    }
    feedMutation.mutate({ symbols: Array.from(selectedSymbols) });
  };

  const feedTopTrending = () => {
    feedMutation.mutate({ minMentions: 30, sentimentFilter: "bullish" });
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case "bullish": return "text-green-500";
      case "bearish": return "text-red-500";
      default: return "text-muted-foreground";
    }
  };

  const getSentimentBg = (sentiment: string) => {
    switch (sentiment) {
      case "bullish": return "bg-green-500/10 border-green-500/30";
      case "bearish": return "bg-red-500/10 border-red-500/30";
      default: return "bg-muted/50";
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <SiReddit className="text-orange-500" />
            Social Market Trends
          </h1>
          <p className="text-muted-foreground text-sm">
            Reddit/WSB trending stocks - Feed high-conviction setups to Trade Desk
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchTrending()}
            disabled={trendingLoading}
            data-testid="button-refresh-trends"
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", trendingLoading && "animate-spin")} />
            Refresh
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={feedTopTrending}
            disabled={feedMutation.isPending}
            data-testid="button-feed-top"
          >
            {feedMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 mr-2" />
            )}
            Feed Top 20
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="md:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs">Search Symbol</Label>
              <Input
                placeholder="AAPL..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="h-8 mt-1"
                data-testid="input-search-symbol"
              />
            </div>

            <div>
              <Label className="text-xs">Price Tier</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {PRICE_TIERS.map((tier, idx) => (
                  <Button
                    key={tier.label}
                    size="sm"
                    variant={selectedTier === idx ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => setSelectedTier(idx)}
                    data-testid={`button-tier-${idx}`}
                  >
                    {tier.label}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">Min Mentions: {minMentions}</Label>
              <Slider
                value={[minMentions]}
                onValueChange={([v]) => setMinMentions(v)}
                min={5}
                max={100}
                step={5}
                className="mt-2"
              />
            </div>

            <div>
              <Label className="text-xs">Sentiment</Label>
              <div className="flex gap-1 mt-1">
                {(["all", "bullish", "bearish"] as const).map(s => (
                  <Button
                    key={s}
                    size="sm"
                    variant={sentimentFilter === s ? "default" : "outline"}
                    className="h-7 text-xs flex-1"
                    onClick={() => setSentimentFilter(s)}
                    data-testid={`button-sentiment-${s}`}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs">Options Ready ($5+)</Label>
              <Switch
                checked={showOptionsOnly}
                onCheckedChange={setShowOptionsOnly}
                data-testid="switch-options-only"
              />
            </div>

            <div className="pt-2 border-t space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Selected: {selectedSymbols.size}</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={selectAll}>
                    All
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={clearSelection}>
                    Clear
                  </Button>
                </div>
              </div>
              <Button
                className="w-full"
                size="sm"
                onClick={feedSelected}
                disabled={selectedSymbols.size === 0 || feedMutation.isPending}
                data-testid="button-feed-selected"
              >
                {feedMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Feed {selectedSymbols.size} to Trade Desk
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-3">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-500" />
                Trending Stocks ({filteredStocks.length})
              </CardTitle>
              {trendingData?.lastUpdated && (
                <span className="text-xs text-muted-foreground">
                  Updated: {new Date(trendingData.lastUpdated).toLocaleTimeString()}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {trendingLoading ? (
              <div className="space-y-2">
                {[...Array(8)].map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : filteredStocks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No stocks match your filters</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {filteredStocks.map((stock) => (
                  <div
                    key={stock.symbol}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                      selectedSymbols.has(stock.symbol)
                        ? "bg-primary/10 border-primary"
                        : "hover:bg-muted/50",
                      getSentimentBg(stock.sentiment)
                    )}
                    onClick={() => toggleSymbol(stock.symbol)}
                    data-testid={`stock-row-${stock.symbol}`}
                  >
                    <Checkbox
                      checked={selectedSymbols.has(stock.symbol)}
                      onCheckedChange={() => toggleSymbol(stock.symbol)}
                      data-testid={`checkbox-${stock.symbol}`}
                    />
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{stock.symbol}</span>
                        <Badge variant="outline" className="text-xs">
                          #{stock.rank}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn("text-xs", getSentimentColor(stock.sentiment))}
                        >
                          {stock.sentiment}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {stock.mentionCount} mentions
                        </span>
                        <span>Score: {stock.sentimentScore}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      {stock.quote ? (
                        <>
                          <div className="font-mono font-bold">
                            ${stock.quote.price?.toFixed(2) || "—"}
                          </div>
                          <div
                            className={cn(
                              "text-xs flex items-center justify-end gap-1",
                              (stock.quote.changePercent || 0) >= 0
                                ? "text-green-500"
                                : "text-red-500"
                            )}
                          >
                            {(stock.quote.changePercent || 0) >= 0 ? (
                              <ArrowUpRight className="h-3 w-3" />
                            ) : (
                              <ArrowDownRight className="h-3 w-3" />
                            )}
                            {Math.abs(stock.quote.changePercent || 0).toFixed(2)}%
                          </div>
                        </>
                      ) : (
                        <Skeleton className="h-8 w-16" />
                      )}
                    </div>

                    <Link href={`/chart-analysis?symbol=${stock.symbol}`}>
                      <Button size="sm" variant="ghost" className="h-8">
                        <BarChart3 className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {feedMutation.data && feedMutation.data.ideasCreated > 0 && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-green-500">
              <CheckCircle2 className="h-4 w-4" />
              Ideas Created
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {feedMutation.data.results.map((r) => (
                <Badge key={r.id} variant="outline" className="gap-1">
                  {r.symbol}
                  <span className="text-muted-foreground">({r.grade})</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-amber-500/5 border-amber-500/20">
        <CardContent className="py-3">
          <p className="text-xs text-muted-foreground text-center">
            Social sentiment data from Reddit/WSB. High mention counts may indicate momentum plays.
            Always verify with technical analysis before trading. Not financial advice.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
