import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
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
      price: marketData?.quotes?.SPY?.regularMarketPrice || 0,
      change: marketData?.quotes?.SPY?.regularMarketChange || 0,
      changePercent: marketData?.quotes?.SPY?.regularMarketChangePercent || 0,
    },
    { 
      symbol: "QQQ", 
      name: "Nasdaq", 
      price: marketData?.quotes?.QQQ?.regularMarketPrice || 0,
      change: marketData?.quotes?.QQQ?.regularMarketChange || 0,
      changePercent: marketData?.quotes?.QQQ?.regularMarketChangePercent || 0,
    },
    { 
      symbol: "DIA", 
      name: "Dow Jones", 
      price: marketData?.quotes?.DIA?.regularMarketPrice || 0,
      change: marketData?.quotes?.DIA?.regularMarketChange || 0,
      changePercent: marketData?.quotes?.DIA?.regularMarketChangePercent || 0,
    },
    { 
      symbol: "IWM", 
      name: "Russell 2000", 
      price: marketData?.quotes?.IWM?.regularMarketPrice || 0,
      change: marketData?.quotes?.IWM?.regularMarketChange || 0,
      changePercent: marketData?.quotes?.IWM?.regularMarketChangePercent || 0,
    },
    { 
      symbol: "VIX", 
      name: "Volatility", 
      price: marketData?.quotes?.VIX?.regularMarketPrice || 0,
      change: marketData?.quotes?.VIX?.regularMarketChange || 0,
      changePercent: marketData?.quotes?.VIX?.regularMarketChangePercent || 0,
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
