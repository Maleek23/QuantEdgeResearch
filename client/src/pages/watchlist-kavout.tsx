import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Star,
  Plus,
  Edit2,
  Trash2,
  Eye,
  ChevronDown,
  Lock,
  Search,
} from "lucide-react";

interface WatchlistStock {
  symbol: string;
  name: string;
  price: number;
  ytdReturn: number;
  marketCap: string;
  outlook: "Outperform" | "Neutral" | "Underperform" | null;
  stockRank: string;
}

const watchlistData: WatchlistStock[] = [
  { symbol: "SPY", name: "SPDR S&P 500 ETF Trust", price: 689.13, ytdReturn: 1.07, marketCap: "711.44B", outlook: "Outperform", stockRank: "n/a" },
  { symbol: "MSFT", name: "Microsoft Corporation", price: 465.95, ytdReturn: -3.65, marketCap: "3.46T", outlook: null, stockRank: "n/a" },
  { symbol: "AAPL", name: "Apple Inc.", price: 248.04, ytdReturn: -8.76, marketCap: "3.67T", outlook: null, stockRank: "n/a" },
  { symbol: "QQQ", name: "Invesco QQQ Trust, Series ...", price: 622.72, ytdReturn: 1.37, marketCap: "408.46B", outlook: null, stockRank: "n/a" },
  { symbol: "NFLX", name: "Netflix, Inc.", price: 86.08, ytdReturn: -8.19, marketCap: "393.37B", outlook: null, stockRank: "n/a" },
  { symbol: "TSLA", name: "Tesla, Inc.", price: 449.06, ytdReturn: -0.15, marketCap: "1.49T", outlook: null, stockRank: "n/a" },
  { symbol: "BTCUSD", name: "Bitcoin USD", price: 88527.17, ytdReturn: 1.14, marketCap: "1.77T", outlook: null, stockRank: "n/a" },
];

const notificationTabs = ["All", "Analyst Updates", "Insider Activity", "Congress Trades", "Earnings", "Dividends", "Price Alerts"];

export default function WatchlistKavout() {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedWatchlist, setSelectedWatchlist] = useState("Main");
  const [searchTicker, setSearchTicker] = useState("");

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-6"
        >
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-100">Watchlist</h1>
            <Badge className="bg-cyan-500/20 text-cyan-400 border-0">1</Badge>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="border-slate-700 text-slate-300">
              <Edit2 className="w-4 h-4 mr-2" />
              Edit
            </Button>
            <Button size="sm" className="bg-cyan-500 hover:bg-cyan-600 text-white">
              <Plus className="w-4 h-4 mr-2" />
              Create Watchlist
            </Button>
          </div>
        </motion.div>

        {/* Watchlist Selector + Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="flex items-center justify-between mb-6"
        >
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-400" />
              <span className="text-sm text-slate-300">Default</span>
            </div>
            <Select value={selectedWatchlist} onValueChange={setSelectedWatchlist}>
              <SelectTrigger className="w-32 bg-cyan-500/10 border-cyan-500/30 text-cyan-400" data-testid="select-watchlist">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Main">Main</SelectItem>
                <SelectItem value="Tech">Tech</SelectItem>
                <SelectItem value="Crypto">Crypto</SelectItem>
              </SelectContent>
            </Select>
            <ChevronDown className="w-4 h-4 text-slate-500" />
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-slate-800/50">
              <TabsTrigger value="overview" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
                Overview
              </TabsTrigger>
              <TabsTrigger value="technical" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
                Technical
              </TabsTrigger>
              <TabsTrigger value="moving-averages" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
                Moving Averages
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Add Symbol:</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                placeholder="Search ticker or name..."
                value={searchTicker}
                onChange={(e) => setSearchTicker(e.target.value)}
                className="pl-9 w-48 bg-slate-800/50 border-slate-700"
                data-testid="input-add-symbol"
              />
            </div>
          </div>
        </motion.div>

        {/* Watchlist Table */}
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
                    <th className="text-left p-4 font-medium">
                      Symbol
                      <ChevronDown className="w-3 h-3 inline ml-1" />
                    </th>
                    <th className="text-right p-4 font-medium">
                      Price($)
                      <ChevronDown className="w-3 h-3 inline ml-1" />
                    </th>
                    <th className="text-right p-4 font-medium">
                      YTD Return
                      <ChevronDown className="w-3 h-3 inline ml-1" />
                    </th>
                    <th className="text-right p-4 font-medium">
                      Market Cap
                      <ChevronDown className="w-3 h-3 inline ml-1" />
                    </th>
                    <th className="text-center p-4 font-medium">
                      Outlook
                      <ChevronDown className="w-3 h-3 inline ml-1" />
                    </th>
                    <th className="text-center p-4 font-medium">Stock Rank</th>
                    <th className="text-center p-4 font-medium">AI Research</th>
                    <th className="text-center p-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {watchlistData.map((stock, i) => (
                    <tr 
                      key={stock.symbol}
                      className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                      data-testid={`watchlist-row-${stock.symbol}`}
                    >
                      <td className="p-4">
                        <div>
                          <span className="font-semibold text-cyan-400">{stock.symbol}</span>
                          <p className="text-xs text-slate-500 mt-0.5">{stock.name}</p>
                        </div>
                      </td>
                      <td className="p-4 text-right text-slate-200 font-mono">
                        {stock.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-4 text-right">
                        <span className={cn(
                          "font-mono",
                          stock.ytdReturn >= 0 ? "text-emerald-400" : "text-red-400"
                        )}>
                          {stock.ytdReturn >= 0 ? "+" : ""}{stock.ytdReturn.toFixed(2)}%
                        </span>
                      </td>
                      <td className="p-4 text-right text-slate-200">{stock.marketCap}</td>
                      <td className="p-4 text-center">
                        {stock.outlook ? (
                          <Badge className={cn(
                            "text-xs",
                            stock.outlook === "Outperform" 
                              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" 
                              : stock.outlook === "Underperform"
                              ? "bg-red-500/20 text-red-400 border-red-500/30"
                              : "bg-slate-500/20 text-slate-400 border-slate-500/30"
                          )}>
                            {stock.outlook}
                          </Badge>
                        ) : (
                          <Lock className="w-4 h-4 text-slate-600 mx-auto" />
                        )}
                      </td>
                      <td className="p-4 text-center text-slate-400">
                        {stock.stockRank === "n/a" ? (
                          <Lock className="w-4 h-4 text-slate-600 mx-auto" />
                        ) : stock.stockRank}
                      </td>
                      <td className="p-4 text-center">
                        <Button variant="ghost" size="sm" className="text-cyan-400 hover:text-cyan-300">
                          <Eye className="w-4 h-4 mr-1" />
                          Run Research
                        </Button>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-400">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-cyan-400">
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </motion.div>

        {/* Notifications Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mt-8"
        >
          <Card className="bg-slate-900/60 border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-100">Notifications</h3>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  placeholder="Filter by symbol or keyword..."
                  className="pl-9 w-64 bg-slate-800/50 border-slate-700 text-sm"
                  data-testid="input-filter-notifications"
                />
              </div>
            </div>
            
            {/* Notification Tabs */}
            <div className="px-4 py-3 border-b border-slate-800/50 flex gap-2 overflow-x-auto">
              {notificationTabs.map((tab) => (
                <Button
                  key={tab}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "whitespace-nowrap",
                    tab === "All" 
                      ? "bg-cyan-500/10 text-cyan-400" 
                      : "text-slate-400 hover:text-slate-200"
                  )}
                  data-testid={`notification-tab-${tab.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {tab}
                </Button>
              ))}
            </div>

            {/* Notifications Table Header */}
            <div className="grid grid-cols-4 gap-4 px-4 py-3 text-sm text-slate-400 border-b border-slate-800/50">
              <div>Symbol</div>
              <div>Type</div>
              <div>Time</div>
              <div>Alert</div>
            </div>

            {/* Empty State */}
            <div className="p-12 text-center">
              <p className="text-slate-500">No notifications yet. Add stocks to your watchlist to receive alerts.</p>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
