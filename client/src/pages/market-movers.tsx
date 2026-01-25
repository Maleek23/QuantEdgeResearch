import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuroraBackground } from "@/components/aurora-background";
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
  Lock,
  ChevronDown,
  RefreshCw,
} from "lucide-react";

interface MoverStock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  marketCap: string;
  dailyRsi: number;
  dailyMa: number;
  dailyAtr: number;
}

const mockMovers: MoverStock[] = [
  { symbol: "TMCWW", name: "TMC the metals compa...", price: 2.26, change: 0.51, changePercent: 29.14, marketCap: "933.44M", dailyRsi: 70.37, dailyMa: 1.53, dailyAtr: 0.31 },
  { symbol: "LIF", name: "Life360, Inc.", price: 68.10, change: 13.29, changePercent: 24.25, marketCap: "5.34B", dailyRsi: 57.15, dailyMa: 62.43, dailyAtr: 0 },
  { symbol: "ASM", name: "Avino Silver & Gold ...", price: 9.31, change: 1.48, changePercent: 18.9, marketCap: "1.46B", dailyRsi: 83.17, dailyMa: 6.73, dailyAtr: 0 },
  { symbol: "SGML", name: "Sigma Lithium Corpor...", price: 14.74, change: 2.2, changePercent: 17.54, marketCap: "1.64B", dailyRsi: 55.52, dailyMa: 14.18, dailyAtr: 0 },
  { symbol: "TMC", name: "TMC the metals compa...", price: 9.44, change: 1.12, changePercent: 13.46, marketCap: "3.9B", dailyRsi: 69.07, dailyMa: 7.32, dailyAtr: 0 },
  { symbol: "FBYDW", name: "Falcon's Beyond Glob...", price: 1.35, change: 0.16, changePercent: 13.45, marketCap: "1.34B", dailyRsi: 45.24, dailyMa: 1.77, dailyAtr: 0 },
  { symbol: "BBOT", name: "BridgeBio Oncology T...", price: 12.62, change: 1.37, changePercent: 12.18, marketCap: "1.01B", dailyRsi: 55.01, dailyMa: 12.08, dailyAtr: 0 },
  { symbol: "WSHP", name: "WeShop Holdings Limi...", price: 72.01, change: 7.7, changePercent: 11.97, marketCap: "1.85B", dailyRsi: 44.79, dailyMa: 81.69, dailyAtr: 0 },
  { symbol: "CRML", name: "Critical Metals Corp...", price: 20.62, change: 2.16, changePercent: 11.7, marketCap: "1.93B", dailyRsi: 72.36, dailyMa: 13.06, dailyAtr: 0 },
  { symbol: "QURE", name: "uniQure N.V.", price: 25.08, change: 2.39, changePercent: 10.53, marketCap: "1.55B", dailyRsi: 54.69, dailyMa: 23.29, dailyAtr: 0 },
];

const assetTypes = [
  { id: "stocks", label: "Stocks", icon: Star },
  { id: "etfs", label: "ETFs", icon: Coins },
  { id: "crypto", label: "Crypto", icon: Bitcoin },
  { id: "forex", label: "Forex", icon: DollarSign },
];

const tabOptions = ["Top Gainers", "Top Losers", "52wk High", "52wk Low"];

export default function MarketMovers() {
  const [activeAsset, setActiveAsset] = useState("stocks");
  const [activeTab, setActiveTab] = useState("Top Gainers");
  const [period, setPeriod] = useState("prev-day");
  const [filter, setFilter] = useState("all");

  return (
    <>
      <AuroraBackground />
      <div className="min-h-screen relative z-10 pb-20">
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
                data-testid={`asset-${asset.id}`}
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
                data-testid={`tab-${tab.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {tab}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-32 bg-slate-800/50 border-slate-700" data-testid="select-period">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="prev-day">Prev. Day</SelectItem>
                <SelectItem value="1-week">1 Week</SelectItem>
                <SelectItem value="1-month">1 Month</SelectItem>
                <SelectItem value="ytd">YTD</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-32 bg-slate-800/50 border-slate-700" data-testid="select-filter">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stocks</SelectItem>
                <SelectItem value="large-cap">Large Cap</SelectItem>
                <SelectItem value="mid-cap">Mid Cap</SelectItem>
                <SelectItem value="small-cap">Small Cap</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2 text-sm text-slate-400">
              <RefreshCw className="w-4 h-4" />
              Updates at: 2026-01-23 EST
            </div>
          </div>
        </motion.div>

        {/* Movers Table */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-slate-900/60 border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800 text-sm text-slate-400">
                    <th className="text-left p-4 font-medium">Symbol</th>
                    <th className="text-right p-4 font-medium">
                      Price($)
                      <ChevronDown className="w-3 h-3 inline ml-1" />
                    </th>
                    <th className="text-right p-4 font-medium">Change($)</th>
                    <th className="text-right p-4 font-medium">%Change</th>
                    <th className="text-right p-4 font-medium">Market Cap</th>
                    <th className="text-right p-4 font-medium">
                      Daily RSI(14)
                      <ChevronDown className="w-3 h-3 inline ml-1" />
                    </th>
                    <th className="text-right p-4 font-medium">
                      Daily MA(20)
                      <ChevronDown className="w-3 h-3 inline ml-1" />
                    </th>
                    <th className="text-right p-4 font-medium">
                      Daily ATR(14)
                      <ChevronDown className="w-3 h-3 inline ml-1" />
                    </th>
                    <th className="text-center p-4 font-medium">AI Research</th>
                    <th className="text-center p-4 font-medium">Add To Watchlist</th>
                  </tr>
                </thead>
                <tbody>
                  {mockMovers.map((stock, i) => (
                    <tr 
                      key={stock.symbol}
                      className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                      data-testid={`mover-row-${stock.symbol}`}
                    >
                      <td className="p-4">
                        <div>
                          <span className="font-semibold text-cyan-400">{stock.symbol}</span>
                          <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[150px]">{stock.name}</p>
                        </div>
                      </td>
                      <td className="p-4 text-right text-slate-200 font-mono">
                        {stock.price.toFixed(2)}
                      </td>
                      <td className="p-4 text-right font-mono text-emerald-400">
                        {stock.change.toFixed(2)}
                      </td>
                      <td className="p-4 text-right font-mono text-emerald-400">
                        +{stock.changePercent.toFixed(2)}%
                      </td>
                      <td className="p-4 text-right text-slate-200">{stock.marketCap}</td>
                      <td className="p-4 text-right text-slate-200 font-mono">{stock.dailyRsi.toFixed(2)}</td>
                      <td className="p-4 text-right text-slate-200 font-mono">{stock.dailyMa.toFixed(2)}</td>
                      <td className="p-4 text-right text-slate-200 font-mono">{stock.dailyAtr.toFixed(2)}</td>
                      <td className="p-4 text-center">
                        <Button variant="ghost" size="sm" className="text-cyan-400 hover:text-cyan-300">
                          <Eye className="w-4 h-4 mr-1" />
                          Run Research
                        </Button>
                      </td>
                      <td className="p-4 text-center">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-cyan-400">
                          <Plus className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 text-center border-t border-slate-800">
              <Button variant="ghost" className="text-cyan-400">
                View More
              </Button>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
    </>
  );
}
