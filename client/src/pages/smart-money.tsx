import { useState } from "react";
import { motion } from "framer-motion";
import { cn, safeToFixed, safeNumber } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  TrendingUp,
  TrendingDown,
  Building2,
  ChevronRight,
  ArrowRight,
  BarChart3,
  Briefcase,
  Eye,
  RefreshCw,
  DollarSign,
  Activity,
} from "lucide-react";
import { getStockLogoUrl } from "@/lib/stock-logos";

interface InsiderTrade {
  symbol: string;
  name?: string;
  title?: string;
  transactionType: string;
  shares: number;
  value: number;
  date: string;
}

interface AnalystRating {
  symbol: string;
  firm: string;
  rating: string;
  targetPrice: number;
  previousPrice?: number;
  date: string;
}

function formatValue(value: number): string {
  const safeVal = safeNumber(value);
  if (safeVal >= 1_000_000_000) return `$${safeToFixed(safeVal / 1_000_000_000, 1)}B`;
  if (safeVal >= 1_000_000) return `$${safeToFixed(safeVal / 1_000_000, 1)}M`;
  if (safeVal >= 1_000) return `$${safeToFixed(safeVal / 1_000, 1)}K`;
  return `$${safeToFixed(safeVal, 0)}`;
}

function formatShares(shares: number): string {
  const safeShares = safeNumber(shares);
  if (safeShares >= 1_000_000) return `${safeToFixed(safeShares / 1_000_000, 1)}M`;
  if (safeShares >= 1_000) return `${safeToFixed(safeShares / 1_000, 1)}K`;
  return safeShares.toString();
}

export default function SmartMoney() {
  // Fetch catalysts data (includes insider trades)
  const { data: catalystData, isLoading: catalystLoading, refetch: refetchCatalysts } = useQuery<{
    catalysts: Array<{
      symbol: string;
      type: string;
      title: string;
      insiderName?: string;
      insiderTitle?: string;
      transactionType?: string;
      shares?: number;
      value?: number;
      date?: string;
      createdAt?: string;
    }>;
  }>({
    queryKey: ["/api/catalysts"],
    refetchInterval: 300000,
  });

  // Fetch whale flows for options activity
  const { data: whaleData, isLoading: flowLoading } = useQuery<{
    flows: Array<{
      symbol: string;
      putCallRatio: number;
      callVolume: number;
      putVolume: number;
      sentiment: string;
      avgPremium: number;
    }>;
  }>({
    queryKey: ["/api/whale-flow"],
    refetchInterval: 120000,
  });

  // Fetch top movers for hot stocks
  const { data: moversData, isLoading: moversLoading } = useQuery<{
    topGainers: Array<{ symbol: string; percentChange: number; price: number; name?: string }>;
    topLosers: Array<{ symbol: string; percentChange: number; price: number; name?: string }>;
  }>({
    queryKey: ["/api/market-movers"],
    refetchInterval: 60000,
  });

  // Transform catalysts to insider trades format
  const insiderTrades: InsiderTrade[] = (catalystData?.catalysts || [])
    .filter((c) => c.type === "insider_buy" || c.type === "insider_sell")
    .slice(0, 10)
    .map((c) => ({
      symbol: c.symbol,
      name: c.insiderName || "Corporate Insider",
      title: c.insiderTitle,
      transactionType: c.type === "insider_buy" ? "Buy" : "Sell",
      shares: c.shares || 0,
      value: c.value || 0,
      date: c.date || c.createdAt || new Date().toISOString(),
    }));

  // Transform whale flows to options flow format
  const optionsFlow = (whaleData?.flows || []).slice(0, 6).map((f) => ({
    symbol: f.symbol,
    type: f.putCallRatio < 1 ? "Call" : "Put",
    strike: 0,
    expiry: "",
    premium: f.avgPremium || (f.callVolume + f.putVolume) * 100,
    sentiment: f.sentiment,
    callVolume: f.callVolume,
    putVolume: f.putVolume,
  }));

  const hotStocks = (moversData?.topGainers || []).slice(0, 4).map((s) => ({
    symbol: s.symbol,
    change: s.percentChange,
    price: s.price,
    name: s.name,
  }));

  const insiderLoading = catalystLoading;
  const refetchInsider = refetchCatalysts;

  const totalInsiderValue = insiderTrades.reduce((sum, t) => sum + (t.value || 0), 0);
  const buyCount = insiderTrades.filter((t) => t.transactionType === "Buy" || t.transactionType === "P-Purchase").length;

  return (
    <>
      <div className="min-h-screen relative z-10 pb-12">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3">
          {/* Header — Bloomberg compact */}
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4"
          >
            <h1 className="text-base font-bold text-foreground tracking-tight">Smart Money</h1>
            <p className="text-[10px] text-muted-foreground">
              Insider trades, institutional flow, analyst ratings
            </p>
          </motion.div>

          {/* Stats Cards — compact */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4"
          >
            <Card className="p-3 bg-card/60 border-border">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-md bg-emerald-500/10 border border-emerald-500/30">
                  <Users className="w-3.5 h-3.5 text-[var(--trade-bullish)]" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground font-mono uppercase">Insiders</p>
                  <p className="text-lg font-bold text-foreground font-mono tabular-nums">{insiderTrades.length}</p>
                </div>
              </div>
            </Card>

            <Card className="p-3 bg-card/60 border-border">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-md bg-emerald-500/10 border border-emerald-500/30">
                  <DollarSign className="w-3.5 h-3.5 text-[var(--trade-bullish)]" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Value</p>
                  <p className="text-2xl font-bold text-[var(--trade-bullish)]">{formatValue(totalInsiderValue)}</p>
                </div>
              </div>
            </Card>

            <Card className="p-5 bg-card/60 border-border">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/30">
                  <TrendingUp className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Buy Signals</p>
                  <p className="text-2xl font-bold text-purple-400">{buyCount}</p>
                </div>
              </div>
            </Card>

            <Card className="p-5 bg-card/60 border-border">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <Activity className="w-5 h-5 text-[var(--trade-neutral)]" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Options Flow</p>
                  <p className="text-2xl font-bold text-[var(--trade-neutral)]">{optionsFlow.length}</p>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Action Cards */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10"
          >
            <Link href="/options-analyzer">
              <Card className="p-6 bg-card/60 border-border hover:border-emerald-500/30 transition-all cursor-pointer group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                      <BarChart3 className="w-6 h-6 text-[var(--trade-bullish)]" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-foreground/95">Options Analyzer</h3>
                      <p className="text-sm text-muted-foreground">Deep options analysis</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-[var(--trade-bullish)] transition-colors" />
                </div>
              </Card>
            </Link>

            <Link href="/market?tab=scanner">
              <Card className="p-6 bg-card/60 border-border hover:border-purple-500/30 transition-all cursor-pointer group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center">
                      <Briefcase className="w-6 h-6 text-purple-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-foreground/95">Market Movers</h3>
                      <p className="text-sm text-muted-foreground">Top gainers and losers</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-purple-400 transition-colors" />
                </div>
              </Card>
            </Link>
          </motion.div>

          {/* Recent Insider Trades Table */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="bg-card/60 border-border overflow-hidden">
              <div className="p-5 border-b border-border flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground/95">Recent Insider Trades</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refetchInsider()}
                  className="text-muted-foreground hover:text-[var(--trade-bullish)]"
                >
                  <RefreshCw className={cn("w-4 h-4", insiderLoading && "animate-spin")} />
                </Button>
              </div>
              <div className="overflow-x-auto">
                {insiderLoading ? (
                  <div className="p-4 space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-14 bg-muted" />
                    ))}
                  </div>
                ) : insiderTrades.length > 0 ? (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border text-sm text-muted-foreground">
                        <th className="text-left p-4 font-medium">Symbol</th>
                        <th className="text-left p-4 font-medium">Insider</th>
                        <th className="text-left p-4 font-medium">Type</th>
                        <th className="text-right p-4 font-medium">Shares</th>
                        <th className="text-right p-4 font-medium">Value</th>
                        <th className="text-right p-4 font-medium">Date</th>
                        <th className="text-center p-4 font-medium">Research</th>
                      </tr>
                    </thead>
                    <tbody>
                      {insiderTrades.map((trade, i) => {
                        const isBuy = trade.transactionType === "Buy" || trade.transactionType === "P-Purchase";
                        return (
                          <tr
                            key={i}
                            className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                          >
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                <img
                                  src={getStockLogoUrl(trade.symbol)}
                                  alt={trade.symbol}
                                  className="w-8 h-8 rounded-full bg-muted"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = "none";
                                  }}
                                />
                                <span className="font-semibold text-[var(--trade-bullish)]">{trade.symbol}</span>
                              </div>
                            </td>
                            <td className="p-4">
                              <div>
                                <span className="text-foreground/90">{trade.name || "Corporate Insider"}</span>
                                {trade.title && (
                                  <p className="text-xs text-muted-foreground">{trade.title}</p>
                                )}
                              </div>
                            </td>
                            <td className="p-4">
                              <Badge
                                className={cn(
                                  "text-xs",
                                  isBuy
                                    ? "bg-emerald-500/20 text-[var(--trade-bullish)] border-emerald-500/30"
                                    : "bg-red-500/20 text-[var(--trade-bearish)] border-red-500/30"
                                )}
                              >
                                {isBuy ? (
                                  <TrendingUp className="w-3 h-3 mr-1" />
                                ) : (
                                  <TrendingDown className="w-3 h-3 mr-1" />
                                )}
                                {isBuy ? "Buy" : "Sell"}
                              </Badge>
                            </td>
                            <td className="p-4 text-right text-foreground/90 font-mono">
                              {formatShares(trade.shares)}
                            </td>
                            <td className="p-4 text-right text-foreground/90 font-mono">
                              {formatValue(trade.value)}
                            </td>
                            <td className="p-4 text-right text-muted-foreground text-sm">
                              {new Date(trade.date).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </td>
                            <td className="p-4 text-center">
                              <Link href={`/chart-analysis?symbol=${trade.symbol}`}>
                                <Button variant="ghost" size="sm" className="text-[var(--trade-bullish)] hover:text-[var(--trade-bullish)]">
                                  <Eye className="w-4 h-4 mr-1" />
                                  Analyze
                                </Button>
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-12 text-center text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No insider trades available</p>
                    <p className="text-sm mt-1">Check back later for updates</p>
                  </div>
                )}
              </div>
            </Card>
          </motion.div>

          {/* Options Flow + Hot Stocks Grid */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8"
          >
            {/* Unusual Options Flow */}
            <Card className="bg-card/60 border-border">
              <div className="p-5 border-b border-border">
                <h3 className="text-lg font-semibold text-foreground/95 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-[var(--trade-neutral)]" />
                  Unusual Options Flow
                </h3>
              </div>
              <div className="p-4">
                {flowLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 bg-muted" />
                    ))}
                  </div>
                ) : optionsFlow.length > 0 ? (
                  <div className="space-y-3">
                    {optionsFlow.slice(0, 5).map((flow, i) => (
                      <Link key={i} href={`/chart-analysis?symbol=${flow.symbol}`}>
                        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-[var(--trade-bullish)]">{flow.symbol}</span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs",
                                flow.type === "Call"
                                  ? "border-emerald-500/30 text-[var(--trade-bullish)]"
                                  : "border-red-500/30 text-[var(--trade-bearish)]"
                              )}
                            >
                              {flow.type} Heavy
                            </Badge>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-foreground font-mono">{formatValue(flow.premium)}</p>
                            <p className="text-xs text-muted-foreground">
                              {flow.callVolume?.toLocaleString() || 0} calls / {flow.putVolume?.toLocaleString() || 0} puts
                            </p>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No unusual flow detected</p>
                  </div>
                )}
              </div>
            </Card>

            {/* Hot Stocks */}
            <Card className="bg-card/60 border-border">
              <div className="p-5 border-b border-border">
                <h3 className="text-lg font-semibold text-foreground/95 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-[var(--trade-bullish)]" />
                  Today's Hot Stocks
                </h3>
              </div>
              <div className="p-4">
                {moversLoading ? (
                  <div className="grid grid-cols-2 gap-3">
                    {[1, 2, 3, 4].map((i) => (
                      <Skeleton key={i} className="h-24 bg-muted" />
                    ))}
                  </div>
                ) : hotStocks.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3">
                    {hotStocks.map((stock) => {
                      const isUp = (stock.change || 0) >= 0;
                      return (
                        <Link key={stock.symbol} href={`/chart-analysis?symbol=${stock.symbol}`}>
                          <Card className={cn(
                            "p-4 bg-muted/50 border-border transition-all cursor-pointer",
                            isUp ? "hover:border-emerald-500/30" : "hover:border-red-500/30"
                          )}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <img
                                  src={getStockLogoUrl(stock.symbol)}
                                  alt={stock.symbol}
                                  className="w-6 h-6 rounded-full bg-muted"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = "none";
                                  }}
                                />
                                <span className="font-bold text-[var(--trade-bullish)]">{stock.symbol}</span>
                              </div>
                              <Badge className={cn(
                                "text-xs",
                                isUp ? "bg-emerald-500/20 text-[var(--trade-bullish)]" : "bg-red-500/20 text-[var(--trade-bearish)]"
                              )}>
                                {isUp ? "+" : ""}{safeToFixed(stock.change, 1)}%
                              </Badge>
                            </div>
                            <div className="text-lg font-semibold text-foreground/95">
                              ${safeToFixed(stock.price, 2)}
                            </div>
                            {stock.name && (
                              <p className="text-xs text-muted-foreground truncate mt-1">{stock.name}</p>
                            )}
                          </Card>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No market data available</p>
                  </div>
                )}
              </div>
            </Card>
          </motion.div>
        </div>
      </div>
    </>
  );
}
