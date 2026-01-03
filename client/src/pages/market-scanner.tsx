import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Target
} from "lucide-react";

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

export default function MarketScanner() {
  const [timeframe, setTimeframe] = useState<string>("day");
  const [category, setCategory] = useState<string>("all");

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

  const handleRefresh = () => {
    moversQuery.refetch();
    sectorsQuery.refetch();
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
