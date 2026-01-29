/**
 * WSB Trending Card
 *
 * Displays trending stocks from r/wallstreetbets with sentiment analysis.
 * Data sourced from Tradestie + ApeWisdom APIs via our social-sentiment-scanner.
 *
 * Used in: Home page, Discover page
 */

import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp,
  TrendingDown,
  MessageSquare,
  Flame,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TrendingTicker {
  symbol: string;
  mentionCount: number;
  sentimentScore: number;
  sentiment: "bullish" | "bearish" | "neutral";
  change24h: number;
  rank?: number;
  source: "tradestie" | "apewisdom" | "combined";
}

interface WSBTrendingResponse {
  success: boolean;
  count: number;
  lastUpdated: string;
  trending: TrendingTicker[];
  sources: string[];
}

function useWSBTrending(limit = 10) {
  return useQuery<WSBTrendingResponse>({
    queryKey: ["/api/automations/wsb-trending"],
    queryFn: async () => {
      const res = await fetch("/api/automations/wsb-trending");
      if (!res.ok) throw new Error("Failed to fetch WSB trending");
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // Fresh for 5 minutes
    gcTime: 15 * 60 * 1000, // Cache for 15 minutes
    refetchInterval: 10 * 60 * 1000, // Refetch every 10 minutes
    select: (data) => ({
      ...data,
      trending: data.trending.slice(0, limit),
    }),
  });
}

interface WSBTrendingCardProps {
  limit?: number;
  compact?: boolean;
  className?: string;
}

export function WSBTrendingCard({
  limit = 5,
  compact = false,
  className,
}: WSBTrendingCardProps) {
  const [, setLocation] = useLocation();
  const { data, isLoading, error } = useWSBTrending(limit);

  const handleTickerClick = (symbol: string) => {
    setLocation(`/stock/${symbol}`);
  };

  if (isLoading) {
    return (
      <Card className={cn("glass-card", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Flame className="h-5 w-5 text-orange-500" />
            Trending on WSB
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: limit }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error || !data?.trending?.length) {
    return (
      <Card className={cn("glass-card", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Flame className="h-5 w-5 text-orange-500" />
            Trending on WSB
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            Unable to load WSB trending data
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("glass-card", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Flame className="h-5 w-5 text-orange-500" />
            Trending on WSB
          </CardTitle>
          <Badge variant="outline" className="text-xs text-muted-foreground">
            Live
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {data.trending.map((ticker, index) => (
          <TrendingTickerRow
            key={ticker.symbol}
            ticker={ticker}
            rank={index + 1}
            compact={compact}
            onClick={() => handleTickerClick(ticker.symbol)}
          />
        ))}

        {/* View All Link */}
        <Button
          variant="ghost"
          className="w-full mt-2 text-cyan-400 hover:text-cyan-300"
          onClick={() => setLocation("/discover?tab=social")}
        >
          View All Social Trends
          <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
}

interface TrendingTickerRowProps {
  ticker: TrendingTicker;
  rank: number;
  compact?: boolean;
  onClick: () => void;
}

function TrendingTickerRow({
  ticker,
  rank,
  compact,
  onClick,
}: TrendingTickerRowProps) {
  const sentimentColor =
    ticker.sentiment === "bullish"
      ? "text-emerald-400"
      : ticker.sentiment === "bearish"
      ? "text-red-400"
      : "text-slate-400";

  const sentimentBg =
    ticker.sentiment === "bullish"
      ? "bg-emerald-500/10 border-emerald-500/20"
      : ticker.sentiment === "bearish"
      ? "bg-red-500/10 border-red-500/20"
      : "bg-slate-500/10 border-slate-500/20";

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 p-2 rounded-lg",
        "hover:bg-slate-800/50 transition-colors",
        "text-left group"
      )}
    >
      {/* Rank */}
      <span
        className={cn(
          "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
          rank <= 3 ? "bg-orange-500/20 text-orange-400" : "bg-slate-700 text-slate-400"
        )}
      >
        {rank}
      </span>

      {/* Symbol */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white group-hover:text-cyan-400 transition-colors">
            ${ticker.symbol}
          </span>
          {ticker.source === "combined" && (
            <Badge variant="outline" className="text-[10px] px-1 py-0">
              2 sources
            </Badge>
          )}
        </div>
        {!compact && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MessageSquare className="h-3 w-3" />
            <span>{ticker.mentionCount.toLocaleString()} mentions</span>
          </div>
        )}
      </div>

      {/* Sentiment */}
      <Badge
        variant="outline"
        className={cn("capitalize text-xs", sentimentBg, sentimentColor)}
      >
        {ticker.sentiment === "bullish" ? (
          <TrendingUp className="h-3 w-3 mr-1" />
        ) : ticker.sentiment === "bearish" ? (
          <TrendingDown className="h-3 w-3 mr-1" />
        ) : null}
        {ticker.sentiment}
      </Badge>
    </button>
  );
}

/**
 * Compact inline version for sidebars or smaller spaces
 */
export function WSBTrendingInline({ limit = 3 }: { limit?: number }) {
  const [, setLocation] = useLocation();
  const { data, isLoading } = useWSBTrending(limit);

  if (isLoading || !data?.trending?.length) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <Flame className="h-4 w-4 text-orange-500 flex-shrink-0" />
      <span className="text-muted-foreground">WSB:</span>
      <div className="flex items-center gap-1 overflow-hidden">
        {data.trending.map((ticker, i) => (
          <button
            key={ticker.symbol}
            onClick={() => setLocation(`/stock/${ticker.symbol}`)}
            className={cn(
              "px-2 py-0.5 rounded text-xs font-medium hover:bg-slate-700 transition-colors",
              ticker.sentiment === "bullish"
                ? "text-emerald-400"
                : ticker.sentiment === "bearish"
                ? "text-red-400"
                : "text-slate-300"
            )}
          >
            ${ticker.symbol}
          </button>
        ))}
      </div>
    </div>
  );
}

export { useWSBTrending };
