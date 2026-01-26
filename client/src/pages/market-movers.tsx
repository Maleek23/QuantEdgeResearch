import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp,
  TrendingDown,
  Star,
  Coins,
  Bitcoin,
  DollarSign,
  Eye,
  Plus,
  ChevronDown,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { getStockLogoUrl } from "@/lib/stock-logos";

interface MoverStock {
  symbol: string;
  name?: string;
  price: number;
  change: number;
  changePercent?: number;
  marketCap?: string;
  volume?: number;
}

const assetTypes = [
  { id: "stocks", label: "Stocks", icon: Star },
  { id: "etfs", label: "ETFs", icon: Coins },
  { id: "crypto", label: "Crypto", icon: Bitcoin },
  { id: "forex", label: "Forex", icon: DollarSign },
];

const tabOptions = ["Top Gainers", "Top Losers"];

export default function MarketMovers() {
  const [activeAsset, setActiveAsset] = useState("stocks");
  const [activeTab, setActiveTab] = useState("Top Gainers");
  const [period, setPeriod] = useState("day");
  const [filter, setFilter] = useState("all");

  // Fetch real market movers data
  const { data, isLoading, refetch, dataUpdatedAt } = useQuery<{
    gainers: MoverStock[];
    losers: MoverStock[];
  }>({
    queryKey: ["/api/market/top-movers", period],
    refetchInterval: 60000, // Refresh every minute
  });

  const movers = activeTab === "Top Gainers" ? data?.gainers : data?.losers;
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "--";

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-6"
        >
          <h1 className="text-2xl font-semibold text-slate-100">Market Movers</h1>

          {/* Asset Type Tabs */}
          <div className="flex items-center gap-2">
            {assetTypes.map((asset) => (
              <Button
                key={asset.id}
                variant="ghost"
                size="sm"
                onClick={() => setActiveAsset(asset.id)}
                className={cn(
                  "gap-2",
                  activeAsset === asset.id
                    ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30"
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                <asset.icon className="w-4 h-4" />
                {asset.label}
              </Button>
            ))}
          </div>
        </motion.div>

        {/* Tabs & Filters */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="flex items-center justify-between mb-6"
        >
          <div className="flex items-center gap-2">
            {tabOptions.map((tab) => (
              <Button
                key={tab}
                variant="ghost"
                size="sm"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  activeTab === tab
                    ? "bg-cyan-500/10 text-cyan-400"
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                {tab === "Top Gainers" && <TrendingUp className="w-4 h-4 mr-1" />}
                {tab === "Top Losers" && <TrendingDown className="w-4 h-4 mr-1" />}
                {tab}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-32 bg-slate-800/50 border-slate-700">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Today</SelectItem>
                <SelectItem value="week">1 Week</SelectItem>
                <SelectItem value="month">1 Month</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              className="text-slate-400 hover:text-cyan-400"
            >
              <RefreshCw className={cn("w-4 h-4 mr-1", isLoading && "animate-spin")} />
              {lastUpdated}
            </Button>
          </div>
        </motion.div>

        {/* Movers Table */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-slate-900/60 border-slate-800 overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
              </div>
            ) : movers && movers.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-800 text-sm text-slate-400">
                      <th className="text-left p-4 font-medium">Symbol</th>
                      <th className="text-right p-4 font-medium">Price</th>
                      <th className="text-right p-4 font-medium">Change %</th>
                      <th className="text-right p-4 font-medium">Volume</th>
                      <th className="text-center p-4 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movers.slice(0, 20).map((stock) => {
                      const isGainer = (stock.change || 0) >= 0;
                      return (
                        <tr
                          key={stock.symbol}
                          className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                        >
                          <td className="p-4">
                            <Link href={`/chart-analysis?symbol=${stock.symbol}`}>
                              <div className="flex items-center gap-3 cursor-pointer hover:opacity-80">
                                <img
                                  src={getStockLogoUrl(stock.symbol)}
                                  alt={stock.symbol}
                                  className="w-8 h-8 rounded-full bg-slate-800"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                                <div>
                                  <span className="font-semibold text-cyan-400">{stock.symbol}</span>
                                  {stock.name && (
                                    <p className="text-xs text-slate-500 truncate max-w-[150px]">{stock.name}</p>
                                  )}
                                </div>
                              </div>
                            </Link>
                          </td>
                          <td className="p-4 text-right text-slate-200 font-mono">
                            ${stock.price?.toFixed(2) || '--'}
                          </td>
                          <td className={cn(
                            "p-4 text-right font-mono font-semibold",
                            isGainer ? "text-emerald-400" : "text-red-400"
                          )}>
                            {isGainer ? "+" : ""}{stock.change?.toFixed(2) || 0}%
                          </td>
                          <td className="p-4 text-right text-slate-400 font-mono text-sm">
                            {stock.volume ? formatVolume(stock.volume) : '--'}
                          </td>
                          <td className="p-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <Link href={`/chart-analysis?symbol=${stock.symbol}`}>
                                <Button variant="ghost" size="sm" className="text-cyan-400 hover:text-cyan-300">
                                  <Eye className="w-4 h-4 mr-1" />
                                  Analyze
                                </Button>
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-20 text-center text-slate-500">
                No market data available
              </div>
            )}
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

function formatVolume(volume: number): string {
  if (volume >= 1_000_000_000) return `${(volume / 1_000_000_000).toFixed(1)}B`;
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(1)}M`;
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(1)}K`;
  return volume.toString();
}
