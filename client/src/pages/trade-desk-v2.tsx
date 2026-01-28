/**
 * Trade Desk V2
 * Simplified, premium design using QuantEdge Design System
 *
 * Structure:
 * - 2 main tabs: Ideas | Portfolio
 * - Asset type filter (All, Stocks, Options, Crypto)
 * - Clean card-based layout
 */

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Brain, Briefcase, TrendingUp, TrendingDown, Filter, RefreshCw, Zap, BarChart3, Flame, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageContainer, PageHeader, Section, StatsBar, EmptyState } from "@/components/ui/page-container";
import { PremiumCard, PremiumCardHeader, PremiumCardIcon, PremiumCardTitle, PremiumCardContent } from "@/components/ui/premium-card";
import { PremiumTabs, PremiumTabsList, PremiumTabsTrigger, PremiumTabsContent } from "@/components/ui/premium-tabs";
import { TradeIdeaCard } from "@/components/ui/trade-idea-card";
import { cn } from "@/lib/utils";

// Types
interface TradeIdea {
  id: string;
  symbol: string;
  companyName?: string;
  direction: string;
  assetType?: string;
  optionType?: string;
  strike?: number;
  expiryDate?: string;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  confidenceScore: number;
  riskRewardRatio?: number;
  catalyst?: string;
  analysis?: string;
  timestamp?: string;
  tier?: string;
  holdingPeriod?: string;
  outcomeStatus?: string;
}

// Asset filter options
const assetFilters = [
  { value: "all", label: "All", icon: BarChart3 },
  { value: "stock", label: "Stocks", icon: TrendingUp },
  { value: "option", label: "Options", icon: Zap },
  { value: "crypto", label: "Crypto", icon: Flame },
];

export default function TradeDeskV2() {
  const [activeTab, setActiveTab] = useState("ideas");
  const [assetFilter, setAssetFilter] = useState("all");

  // Fetch trade ideas
  const { data: tradeIdeas = [], isLoading, refetch } = useQuery<TradeIdea[]>({
    queryKey: ['/api/trade-ideas/best-setups', 'v2'],
    queryFn: async () => {
      const res = await fetch('/api/trade-ideas/best-setups?period=weekly&limit=100');
      if (!res.ok) return [];
      const data = await res.json();
      return data.setups || [];
    },
    staleTime: 60 * 1000,
    refetchInterval: 60000,
  });

  // Filter and deduplicate ideas
  const filteredIdeas = useMemo(() => {
    let filtered = tradeIdeas;

    // Filter by asset type
    if (assetFilter !== "all") {
      filtered = filtered.filter(idea => {
        if (assetFilter === "stock") return idea.assetType === "stock" || (!idea.assetType && !idea.optionType);
        if (assetFilter === "option") return idea.assetType === "option" || idea.optionType;
        if (assetFilter === "crypto") return idea.assetType === "crypto";
        return true;
      });
    }

    // Deduplicate: max 2 per symbol/direction
    const groups = new Map<string, TradeIdea[]>();
    filtered.forEach(idea => {
      const key = `${idea.symbol}-${idea.direction}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(idea);
    });

    const result: TradeIdea[] = [];
    groups.forEach(group => {
      group.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));
      result.push(...group.slice(0, 2));
    });

    return result.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));
  }, [tradeIdeas, assetFilter]);

  // Stats calculations
  const stats = useMemo(() => {
    const total = filteredIdeas.length;
    const bullish = filteredIdeas.filter(i => i.direction?.toLowerCase() === "long").length;
    const bearish = total - bullish;
    const avgConfidence = total > 0
      ? Math.round(filteredIdeas.reduce((sum, i) => sum + (i.confidenceScore || 0), 0) / total)
      : 0;
    const highConviction = filteredIdeas.filter(i => (i.confidenceScore || 0) >= 75).length;

    return [
      { label: "Total Ideas", value: total, icon: <Brain className="w-4 h-4" /> },
      { label: "Bullish", value: bullish, icon: <TrendingUp className="w-4 h-4 text-emerald-400" /> },
      { label: "Bearish", value: bearish, icon: <TrendingDown className="w-4 h-4 text-red-400" /> },
      { label: "Avg Confidence", value: `${avgConfidence}%`, icon: <Zap className="w-4 h-4 text-amber-400" /> },
      { label: "High Conviction", value: highConviction, icon: <Flame className="w-4 h-4 text-orange-400" /> },
    ];
  }, [filteredIdeas]);

  return (
    <PageContainer width="wide" padding="md">
      {/* Page Header */}
      <PageHeader
        title="AI Trade Desk"
        subtitle="High-conviction trade ideas powered by 6-engine analysis"
        icon={<Brain className="w-6 h-6 text-teal-400" />}
        iconColor="teal"
        actions={
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="border-slate-700 hover:bg-slate-800"
            >
              <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
              Refresh
            </Button>
            <Link href="/chart-analysis">
              <Button size="sm" className="bg-gradient-to-r from-teal-500 to-cyan-500 text-black">
                Open Charts
              </Button>
            </Link>
          </div>
        }
      />

      {/* Stats Bar */}
      <StatsBar stats={stats} className="mb-6" />

      {/* Main Content */}
      <PremiumTabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between mb-4">
          <PremiumTabsList>
            <PremiumTabsTrigger value="ideas">
              <Brain className="w-4 h-4 mr-2" />
              Trade Ideas
            </PremiumTabsTrigger>
            <PremiumTabsTrigger value="portfolio">
              <Briefcase className="w-4 h-4 mr-2" />
              Portfolio
            </PremiumTabsTrigger>
          </PremiumTabsList>

          {/* Asset Filter */}
          {activeTab === "ideas" && (
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/60 border border-slate-800/50">
              {assetFilters.map(filter => (
                <button
                  key={filter.value}
                  onClick={() => setAssetFilter(filter.value)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                    assetFilter === filter.value
                      ? "bg-teal-500/20 text-teal-400"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                  )}
                >
                  <filter.icon className="w-3.5 h-3.5" />
                  {filter.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Ideas Tab */}
        <PremiumTabsContent value="ideas">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-48 rounded-2xl bg-slate-900/60 animate-pulse" />
              ))}
            </div>
          ) : filteredIdeas.length === 0 ? (
            <EmptyState
              icon={<Brain className="w-8 h-8" />}
              title="No trade ideas found"
              description="Try adjusting your filters or check back later for new opportunities."
              action={
                <Button variant="outline" onClick={() => setAssetFilter("all")}>
                  Clear Filters
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredIdeas.slice(0, 30).map((idea) => (
                <Link key={idea.id} href={`/stocks/${idea.symbol}`}>
                  <TradeIdeaCard
                    symbol={idea.symbol}
                    companyName={idea.companyName}
                    direction={idea.direction as "long" | "short"}
                    assetType={idea.assetType as any}
                    optionType={idea.optionType as any}
                    strike={idea.strike}
                    expiry={idea.expiryDate}
                    entryPrice={idea.entryPrice}
                    targetPrice={idea.targetPrice}
                    stopLoss={idea.stopLoss}
                    confidenceScore={idea.confidenceScore || 0}
                    riskReward={idea.riskRewardRatio}
                    catalyst={idea.catalyst || idea.analysis?.slice(0, 100)}
                    timestamp={idea.timestamp}
                    tier={idea.tier}
                  />
                </Link>
              ))}
            </div>
          )}

          {/* Load more indicator */}
          {filteredIdeas.length > 30 && (
            <div className="mt-6 text-center text-sm text-slate-500">
              Showing 30 of {filteredIdeas.length} ideas
            </div>
          )}
        </PremiumTabsContent>

        {/* Portfolio Tab */}
        <PremiumTabsContent value="portfolio">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Positions */}
            <div className="lg:col-span-2">
              <PremiumCard variant="default" padding="md">
                <PremiumCardHeader>
                  <PremiumCardIcon color="emerald">
                    <Briefcase className="w-5 h-5" />
                  </PremiumCardIcon>
                  <div>
                    <PremiumCardTitle>Open Positions</PremiumCardTitle>
                    <p className="text-sm text-slate-500">Track your active trades</p>
                  </div>
                </PremiumCardHeader>
                <PremiumCardContent>
                  <EmptyState
                    icon={<Briefcase className="w-6 h-6" />}
                    title="No open positions"
                    description="Start paper trading to track your positions here."
                    action={
                      <Link href="/paper-trading">
                        <Button size="sm" className="bg-gradient-to-r from-teal-500 to-cyan-500 text-black">
                          Start Paper Trading
                        </Button>
                      </Link>
                    }
                  />
                </PremiumCardContent>
              </PremiumCard>
            </div>

            {/* Performance Summary */}
            <div className="space-y-4">
              <PremiumCard variant="feature" padding="md">
                <PremiumCardHeader>
                  <PremiumCardIcon color="teal">
                    <BarChart3 className="w-5 h-5" />
                  </PremiumCardIcon>
                  <PremiumCardTitle>Performance</PremiumCardTitle>
                </PremiumCardHeader>
                <PremiumCardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-400">Win Rate</span>
                      <span className="text-lg font-bold text-emerald-400">--</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-400">Total P/L</span>
                      <span className="text-lg font-bold text-white">--</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-400">Avg R/R</span>
                      <span className="text-lg font-bold text-teal-400">--</span>
                    </div>
                  </div>
                </PremiumCardContent>
              </PremiumCard>

              <PremiumCard variant="interactive" padding="md">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">Trade History</div>
                    <div className="text-xs text-slate-500">View past trades</div>
                  </div>
                </div>
              </PremiumCard>
            </div>
          </div>
        </PremiumTabsContent>
      </PremiumTabs>
    </PageContainer>
  );
}
