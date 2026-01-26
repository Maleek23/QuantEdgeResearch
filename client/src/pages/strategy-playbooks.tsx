import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  BarChart3,
  Zap,
  Target,
  Coins,
  LineChart,
  ArrowLeft,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StrategyGrid } from "@/components/ui/strategy-card";
import { FeaturedScreeners } from "@/components/ui/screener-card";
import { WinnersShowcase, type WinnerItem } from "@/components/ui/winners-showcase";
import { CryptoMarketSection } from "@/components/ui/market-gauge";
import { EarningsPredictionSection, type EarningsItem } from "@/components/ui/earnings-card";
import { ChartWorkbench } from "@/components/ui/chart-workbench";
import { SidebarTrigger } from "@/components/ui/sidebar";

// Types for API responses
interface TradeIdea {
  id: number;
  symbol: string;
  direction: string;
  entryPrice: number;
  exitPrice?: number;
  percentGain?: number;
  createdAt: string;
  exitDate?: string;
  source: string;
  outcomeStatus: string;
}

interface EarningsData {
  symbol: string;
  companyName: string;
  date: string;
  time: string;
  estimateEps?: number;
  actualEps?: number;
}

const strategies = [
  {
    id: "best-setups",
    title: "AI Stock Picker",
    description: "AI-selected daily top stocks with highest conviction based on 6-engine analysis",
    icon: TrendingUp,
    iconColor: "text-emerald-500",
    performance: { winRate: 68.5, annualizedReturn: 156, sharpeRatio: 1.82 },
    badge: "STOCKS",
  },
  {
    id: "swing-scanner",
    title: "Swing Trading",
    description: "Multi-day momentum plays with trend confirmation and volume validation",
    icon: BarChart3,
    iconColor: "text-blue-500",
    performance: { winRate: 62.3, annualizedReturn: 89 },
    badge: "STOCKS",
  },
  {
    id: "day-trade",
    title: "Day Trading",
    description: "Intraday signals for quick trades with strict risk controls and tight stops",
    icon: Zap,
    iconColor: "text-amber-500",
    performance: { winRate: 58.7, sharpeRatio: 1.45 },
    badge: "STOCKS",
  },
  {
    id: "options-lotto",
    title: "Options Lotto",
    description: "High-risk/high-reward weekly options plays with strict position sizing",
    icon: Target,
    iconColor: "text-purple-500",
    performance: { winRate: 42.1, annualizedReturn: 312 },
    badge: "OPTIONS",
  },
  {
    id: "crypto-signals",
    title: "Crypto Radar",
    description: "24/7 crypto momentum signals with sentiment analysis and whale tracking",
    icon: Coins,
    iconColor: "text-orange-500",
    performance: { winRate: 55.8, sharpeRatio: 1.21 },
    badge: "CRYPTO",
  },
  {
    id: "futures-bot",
    title: "Futures Trading",
    description: "CME futures signals for ES, NQ, CL with regime-aware entry gates",
    icon: LineChart,
    iconColor: "text-cyan-500",
    performance: { winRate: 54.2, annualizedReturn: 67 },
    badge: "FUTURES",
  },
];

const featuredScreeners = [
  { id: "stocks-bullish-tomorrow", title: "Stocks Bullish Tomorrow", symbolCount: 12, sentiment: "bullish" as const },
  { id: "stocks-bullish-week", title: "Stocks Bullish for a Week", symbolCount: 76, sentiment: "bullish" as const },
  { id: "stocks-bullish-month", title: "Stocks Bullish for a Month", symbolCount: 219, sentiment: "bullish" as const },
  { id: "crypto-bullish-tomorrow", title: "Cryptos Bullish Tomorrow", symbolCount: 45, sentiment: "bullish" as const },
  { id: "crypto-bullish-week", title: "Cryptos Bullish for a Week", symbolCount: 28, sentiment: "bullish" as const },
  { id: "crypto-bullish-month", title: "Cryptos Bullish for a Month", symbolCount: 18, sentiment: "bullish" as const },
];

// Winners and earnings will be fetched from real APIs

export default function StrategyPlaybooks() {
  const [, navigate] = useLocation();
  const [selectedSymbol, setSelectedSymbol] = useState("SPY");

  // Fetch successful trade ideas for winners showcase
  const { data: winnersData, isLoading: winnersLoading } = useQuery<{ ideas: TradeIdea[] }>({
    queryKey: ["/api/trade-ideas?status=closed&outcome=win&limit=10"],
    refetchInterval: 60000,
  });

  // Fetch upcoming earnings
  const { data: earningsData, isLoading: earningsLoading } = useQuery<{ earnings: EarningsData[] }>({
    queryKey: ["/api/earnings/upcoming?limit=5"],
    refetchInterval: 300000,
  });

  // Transform trade ideas to winners format
  const winners: WinnerItem[] = winnersData?.ideas?.slice(0, 3).map(idea => ({
    symbol: idea.symbol,
    companyName: idea.symbol, // Will be enhanced when we have company data
    dateAdded: idea.createdAt,
    dateClosed: idea.exitDate || idea.createdAt,
    totalReturn: idea.percentGain || 0,
    strategySource: idea.source || "AI Picker",
  })) || [];

  // Transform earnings data to earnings format
  const earnings: EarningsItem[] = earningsData?.earnings?.slice(0, 3).map(e => ({
    symbol: e.symbol,
    companyName: e.companyName,
    reportDate: e.date,
    reportTime: e.time || "TBD",
    prediction: "neutral" as const,
    probability: 50,
    revenuePrediction: "neutral" as const,
    epsPrediction: "neutral" as const,
  })) || [];

  // Chart data - use empty array or fetch real data
  const chartData: any[] = [];

  const handleStrategyClick = (id: string) => {
    switch (id) {
      case "best-setups":
        navigate("/command-center");
        break;
      case "swing-scanner":
        navigate("/market-scanner?mode=swing");
        break;
      case "day-trade":
        navigate("/market-scanner?mode=day");
        break;
      case "options-lotto":
        navigate("/command-center?tab=bots");
        break;
      case "crypto-signals":
        navigate("/command-center?tab=bots");
        break;
      case "futures-bot":
        navigate("/command-center?tab=bots");
        break;
      default:
        navigate("/trade-desk");
    }
  };

  const handleScreenerClick = (id: string) => {
    navigate(`/market-scanner?screener=${id}`);
  };

  return (
    <div className="flex flex-col h-full">
      <header className="sticky top-0 z-10 flex items-center justify-between p-4 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-3">
          <SidebarTrigger data-testid="button-sidebar-toggle" />
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold">Strategy Playbooks</h1>
          </div>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => navigate("/trade-desk")}
          data-testid="button-back-to-trade-desk"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Trade Desk
        </Button>
      </header>

      <main className="flex-1 overflow-auto p-6 space-y-8">
        <section>
          <StrategyGrid 
            strategies={strategies} 
            onStrategyClick={handleStrategyClick}
          />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-xl font-bold">Market Monitor</h2>
              <span className="text-muted-foreground">&gt;</span>
            </div>
            <ChartWorkbench
              symbol={selectedSymbol}
              data={chartData}
              height={350}
            />
          </div>
          <div>
            <CryptoMarketSection 
              marketStrength={62} 
              altcoinIndex={48}
            />
          </div>
        </section>

        <section>
          {winnersLoading ? (
            <Skeleton className="h-48 w-full bg-slate-800/50 rounded-xl" />
          ) : winners.length > 0 ? (
            <WinnersShowcase
              winners={winners}
              onWinnerClick={(symbol) => navigate(`/chart-analysis?symbol=${symbol}`)}
              onSeeAllClick={() => navigate("/analytics")}
            />
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No recent winning trades to display
            </div>
          )}
        </section>

        <section>
          <FeaturedScreeners 
            screeners={featuredScreeners}
            onScreenerClick={handleScreenerClick}
          />
        </section>

        <section>
          {earningsLoading ? (
            <Skeleton className="h-48 w-full bg-slate-800/50 rounded-xl" />
          ) : earnings.length > 0 ? (
            <EarningsPredictionSection
              earnings={earnings}
              onEarningsClick={(symbol) => navigate(`/chart-analysis?symbol=${symbol}`)}
              onSeeAllClick={() => navigate("/market-overview")}
            />
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No upcoming earnings to display
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
