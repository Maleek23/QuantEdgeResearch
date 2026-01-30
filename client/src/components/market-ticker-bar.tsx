import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";
import { cn, safeNumber, safeToFixed } from "@/lib/utils";
import { Link } from "wouter";

interface MarketQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

export function MarketTickerBar() {
  const { data: marketData } = useQuery<{ quotes: Record<string, any> }>({
    queryKey: ["/api/market-data/batch/SPY,QQQ,DIA,IWM,VIX"],
    refetchInterval: 30000,
  });

  const tickers: MarketQuote[] = [
    {
      symbol: "SPY",
      name: "S&P 500",
      price: safeNumber(marketData?.quotes?.SPY?.regularMarketPrice),
      change: safeNumber(marketData?.quotes?.SPY?.regularMarketChange),
      changePercent: safeNumber(marketData?.quotes?.SPY?.regularMarketChangePercent),
    },
    {
      symbol: "QQQ",
      name: "Nasdaq",
      price: safeNumber(marketData?.quotes?.QQQ?.regularMarketPrice),
      change: safeNumber(marketData?.quotes?.QQQ?.regularMarketChange),
      changePercent: safeNumber(marketData?.quotes?.QQQ?.regularMarketChangePercent),
    },
    {
      symbol: "DIA",
      name: "Dow Jones",
      price: safeNumber(marketData?.quotes?.DIA?.regularMarketPrice),
      change: safeNumber(marketData?.quotes?.DIA?.regularMarketChange),
      changePercent: safeNumber(marketData?.quotes?.DIA?.regularMarketChangePercent),
    },
    {
      symbol: "IWM",
      name: "Russell 2000",
      price: safeNumber(marketData?.quotes?.IWM?.regularMarketPrice),
      change: safeNumber(marketData?.quotes?.IWM?.regularMarketChange),
      changePercent: safeNumber(marketData?.quotes?.IWM?.regularMarketChangePercent),
    },
    {
      symbol: "VIX",
      name: "Volatility",
      price: safeNumber(marketData?.quotes?.VIX?.regularMarketPrice),
      change: safeNumber(marketData?.quotes?.VIX?.regularMarketChange),
      changePercent: safeNumber(marketData?.quotes?.VIX?.regularMarketChangePercent),
    },
  ];

  return (
    <div className="w-full bg-card/50 border-b border-border py-2 px-4 overflow-hidden">
      <div className="flex items-center gap-6 overflow-x-auto scrollbar-hide">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Activity className="h-4 w-4" />
          <span className="text-xs font-medium whitespace-nowrap">LIVE MARKETS</span>
        </div>
        {tickers.map((ticker) => (
          <Link key={ticker.symbol} href={`/chart-analysis?symbol=${ticker.symbol}`}>
            <div 
              className="flex items-center gap-3 px-3 py-1 rounded-md hover:bg-muted/50 transition-colors cursor-pointer whitespace-nowrap"
              data-testid={`ticker-${ticker.symbol}`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-foreground">{ticker.name}</span>
                <span className="text-xs text-muted-foreground">({ticker.symbol})</span>
              </div>
              <span className="text-sm font-medium text-foreground">
                ${ticker.price.toFixed(2)}
              </span>
              <div className={cn(
                "flex items-center gap-0.5 text-xs font-medium",
                ticker.change >= 0 ? "text-green-500" : "text-red-500"
              )}>
                {ticker.change >= 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                <span>
                  {ticker.change >= 0 ? "+" : ""}{ticker.changePercent.toFixed(2)}%
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
