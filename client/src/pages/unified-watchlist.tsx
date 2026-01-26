/**
 * Unified Watchlist - Merges 3 watchlist pages into one
 * Tabs: Default (Personal) | Kavout | Bot-Generated
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { cn, formatCurrency } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Star,
  Plus,
  Edit2,
  Trash2,
  Eye,
  Search,
  Lock,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Bot,
  Sparkles,
  Download,
  Bell,
  ChevronDown,
  BarChart3,
  DollarSign,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import type { WatchlistItem, TradeIdea } from "@shared/schema";

// Tier configuration for grading display
const TIER_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  S: { bg: "bg-purple-500/20", text: "text-purple-400", label: "S" },
  A: { bg: "bg-emerald-500/20", text: "text-emerald-400", label: "A" },
  B: { bg: "bg-cyan-500/20", text: "text-cyan-400", label: "B" },
  C: { bg: "bg-amber-500/20", text: "text-amber-400", label: "C" },
  D: { bg: "bg-orange-500/20", text: "text-orange-400", label: "D" },
  F: { bg: "bg-red-500/20", text: "text-red-400", label: "F" },
};

interface QuoteData {
  price: number;
  change: number;
  changePercent: number;
}

export default function UnifiedWatchlist() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"default" | "kavout" | "bot">("default");
  const [selectedWatchlist, setSelectedWatchlist] = useState("Main");
  const [searchSymbol, setSearchSymbol] = useState("");
  const [newSymbol, setNewSymbol] = useState("");
  const [sortColumn, setSortColumn] = useState<string>("symbol");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Fetch personal watchlist items
  const { data: watchlistItems = [], isLoading: watchlistLoading, refetch: refetchWatchlist } = useQuery<WatchlistItem[]>({
    queryKey: ['/api/watchlist'],
  });

  // Fetch trade ideas for bot-generated tab
  const { data: tradeIdeas = [] } = useQuery<TradeIdea[]>({
    queryKey: ['/api/trade-ideas'],
  });

  // Batch fetch quotes
  const { data: batchQuotes = {} } = useQuery<Record<string, QuoteData>>({
    queryKey: ['/api/realtime-quotes/batch', watchlistItems.map(i => i.symbol).join(',')],
    queryFn: async () => {
      if (watchlistItems.length === 0) return {};
      const requests = watchlistItems.map(item => ({
        symbol: item.symbol,
        assetType: item.assetType || 'stock'
      }));
      const res = await fetch('/api/realtime-quotes/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests })
      });
      if (!res.ok) throw new Error('Failed to fetch quotes');
      const data = await res.json();
      return data.quotes || {};
    },
    staleTime: 30000,
    refetchInterval: 60000,
    enabled: watchlistItems.length > 0,
  });

  // Add symbol mutation
  const addSymbolMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/watchlist', {
        symbol: newSymbol.toUpperCase(),
        assetType: 'stock',
        addedAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
      setNewSymbol("");
      toast({ title: "Added to watchlist", description: `${newSymbol.toUpperCase()} added successfully` });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add", description: error.message, variant: "destructive" });
    },
  });

  // Remove symbol mutation
  const removeSymbolMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/watchlist/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
      toast({ title: "Removed from watchlist" });
    },
  });

  // Re-grade mutation
  const reGradeAllMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/watchlist/grade-all');
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
      toast({ title: "Grades Refreshed", description: `${data.graded} symbols re-graded` });
    },
  });

  // Calculate derived data
  const filteredItems = useMemo(() => {
    let items = [...watchlistItems];
    if (searchSymbol.trim()) {
      const search = searchSymbol.toLowerCase();
      items = items.filter(i =>
        i.symbol.toLowerCase().includes(search) ||
        (i.notes && i.notes.toLowerCase().includes(search))
      );
    }
    return items;
  }, [watchlistItems, searchSymbol]);

  const sortedItems = useMemo(() => {
    const items = [...filteredItems];
    items.sort((a, b) => {
      let aVal: any, bVal: any;

      if (sortColumn === 'symbol') {
        aVal = a.symbol;
        bVal = b.symbol;
      } else if (sortColumn === 'price') {
        aVal = batchQuotes[a.symbol]?.price ?? a.currentPrice ?? 0;
        bVal = batchQuotes[b.symbol]?.price ?? b.currentPrice ?? 0;
      } else if (sortColumn === 'ytd') {
        aVal = batchQuotes[a.symbol]?.changePercent ?? 0;
        bVal = batchQuotes[b.symbol]?.changePercent ?? 0;
      } else if (sortColumn === 'tier') {
        const tierOrder = { S: 0, A: 1, B: 2, C: 3, D: 4, F: 5 };
        aVal = tierOrder[a.tier || 'C'] ?? 3;
        bVal = tierOrder[b.tier || 'C'] ?? 3;
      } else {
        return 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return items;
  }, [filteredItems, sortColumn, sortDirection, batchQuotes]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getMarketCap = (item: WatchlistItem): string => {
    // Mock market cap - would come from API in production
    return "N/A";
  };

  const getOutlook = (item: WatchlistItem): string | null => {
    if (item.tier === 'S' || item.tier === 'A') return "Outperform";
    if (item.tier === 'D' || item.tier === 'F') return "Underperform";
    return "Neutral";
  };

  // Bot-generated items from today's trade ideas
  const botGeneratedItems = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return tradeIdeas
      .filter(idea => idea.timestamp && idea.timestamp.startsWith(today))
      .sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0))
      .slice(0, 20); // Top 20 bot picks
  }, [tradeIdeas]);

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold text-slate-100 flex items-center gap-3">
              <Star className="h-7 w-7 text-cyan-400" />
              Watchlist
            </h1>
            <Badge className="bg-cyan-500/20 text-cyan-400 border-0 font-mono">
              {watchlistItems.length}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-slate-700"
              onClick={() => reGradeAllMutation.mutate()}
              disabled={reGradeAllMutation.isPending}
            >
              <RefreshCw className={cn("w-4 h-4 mr-2", reGradeAllMutation.isPending && "animate-spin")} />
              Refresh All
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-slate-700"
              onClick={() => {
                const csv = [
                  ['Symbol', 'Price', 'Type', 'YTD Return', 'Market Cap', 'Outlook', 'Tier'].join(','),
                  ...sortedItems.map(item => {
                    const quote = batchQuotes[item.symbol];
                    return [
                      item.symbol,
                      quote?.price?.toFixed(2) || '',
                      item.assetType || 'stock',
                      quote?.changePercent?.toFixed(2) + '%' || '',
                      getMarketCap(item),
                      getOutlook(item) || '',
                      item.tier || 'C'
                    ].join(',');
                  })
                ].join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `watchlist_${new Date().toISOString().split('T')[0]}.csv`;
                a.click();
                toast({ title: "Downloaded", description: "Watchlist exported to CSV" });
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
            <Button
              size="sm"
              className="bg-cyan-500 hover:bg-cyan-600"
              onClick={() => {
                if (!newSymbol.trim()) {
                  toast({ title: "Enter a symbol", variant: "destructive" });
                  return;
                }
                addSymbolMutation.mutate();
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Symbol
            </Button>
          </div>
        </motion.div>

        {/* Watchlist Selector + Search */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-400">Default</span>
            <Select value={selectedWatchlist} onValueChange={setSelectedWatchlist}>
              <SelectTrigger className="w-40 bg-cyan-500/10 border-cyan-500/30 text-cyan-400">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Main">Main</SelectItem>
                <SelectItem value="Tech">Tech</SelectItem>
                <SelectItem value="Growth">Growth</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList className="bg-slate-800/50">
              <TabsTrigger value="default" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
                <Star className="w-4 h-4 mr-2" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="kavout" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400">
                <BarChart3 className="w-4 h-4 mr-2" />
                Technical
              </TabsTrigger>
              <TabsTrigger value="bot" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400">
                <Bot className="w-4 h-4 mr-2" />
                Moving Averages
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Add Symbol:</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                placeholder="AAPL, TSLA..."
                value={newSymbol}
                onChange={(e) => setNewSymbol(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    addSymbolMutation.mutate();
                  }
                }}
                className="pl-9 w-48 bg-slate-800/50 border-slate-700"
              />
            </div>
          </div>
        </motion.div>

        {/* Main Content - Table */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-slate-900/60 border-slate-800 overflow-hidden">
            {watchlistLoading ? (
              <div className="p-12 text-center">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-cyan-400 mb-4" />
                <p className="text-slate-400">Loading watchlist...</p>
              </div>
            ) : sortedItems.length === 0 ? (
              <div className="p-12 text-center">
                <Star className="h-12 w-12 mx-auto text-slate-700 mb-4" />
                <h3 className="text-lg font-semibold text-slate-300 mb-2">No symbols in watchlist</h3>
                <p className="text-sm text-slate-500">Add symbols using the search bar above</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-slate-800 hover:bg-transparent">
                      <TableHead className="cursor-pointer" onClick={() => handleSort('symbol')}>
                        <div className="flex items-center gap-1">
                          Symbol
                          <ChevronDown className="w-3 h-3" />
                        </div>
                      </TableHead>
                      <TableHead className="text-right cursor-pointer" onClick={() => handleSort('price')}>
                        <div className="flex items-center justify-end gap-1">
                          Price ($)
                          <ChevronDown className="w-3 h-3" />
                        </div>
                      </TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right cursor-pointer" onClick={() => handleSort('ytd')}>
                        <div className="flex items-center justify-end gap-1">
                          YTD Return
                          <ChevronDown className="w-3 h-3" />
                        </div>
                      </TableHead>
                      <TableHead className="text-right">Market Cap</TableHead>
                      <TableHead className="text-center">Outlook</TableHead>
                      <TableHead className="text-center cursor-pointer" onClick={() => handleSort('tier')}>
                        <div className="flex items-center justify-center gap-1">
                          Stock Rank
                          <ChevronDown className="w-3 h-3" />
                        </div>
                      </TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedItems.map((item, i) => {
                      const quote = batchQuotes[item.symbol];
                      const price = quote?.price ?? item.currentPrice ?? 0;
                      const changePercent = quote?.changePercent ?? 0;
                      const isPositive = changePercent >= 0;
                      const tier = item.tier || 'C';
                      const config = TIER_CONFIG[tier];
                      const outlook = getOutlook(item);

                      return (
                        <TableRow
                          key={item.id}
                          className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                        >
                          <TableCell>
                            <div>
                              <Link href={`/stock/${item.symbol}`}>
                                <span className="font-semibold text-cyan-400 hover:text-cyan-300 cursor-pointer">
                                  {item.symbol}
                                </span>
                              </Link>
                              <p className="text-xs text-slate-500 mt-0.5 max-w-xs truncate">
                                {item.notes || item.assetType?.toUpperCase() || 'Stock'}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="font-mono text-slate-200">
                              {price > 0 ? price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {(item.assetType || 'stock').toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {isPositive ? (
                                <ArrowUpRight className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <ArrowDownRight className="w-3 h-3 text-red-400" />
                              )}
                              <span className={cn(
                                "font-mono text-sm",
                                isPositive ? "text-emerald-400" : "text-red-400"
                              )}>
                                {isPositive ? '+' : ''}{changePercent.toFixed(2)}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-slate-400 text-sm">
                            {getMarketCap(item)}
                          </TableCell>
                          <TableCell className="text-center">
                            {outlook ? (
                              <Badge className={cn(
                                "text-xs",
                                outlook === "Outperform"
                                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                  : outlook === "Underperform"
                                  ? "bg-red-500/20 text-red-400 border-red-500/30"
                                  : "bg-slate-500/20 text-slate-400 border-slate-500/30"
                              )}>
                                {outlook}
                              </Badge>
                            ) : (
                              <Lock className="w-4 h-4 text-slate-600 mx-auto" />
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-2">
                              <div className={cn("px-2 py-1 rounded text-xs font-bold", config.bg, config.text)}>
                                {tier}
                              </div>
                              {item.gradeScore && (
                                <span className="text-xs text-slate-500 font-mono">
                                  {item.gradeScore}/100
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Link href={`/stock/${item.symbol}`}>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-cyan-400 hover:text-cyan-300">
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </Link>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-400 hover:text-red-300"
                                onClick={() => {
                                  if (confirm(`Remove ${item.symbol} from watchlist?`)) {
                                    removeSymbolMutation.mutate(item.id);
                                  }
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </motion.div>

        {/* Notifications Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Card className="bg-slate-900/60 border-slate-800">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-cyan-400" />
                <h3 className="font-semibold text-slate-100">Notifications & Alerts</h3>
              </div>
              <Button variant="ghost" size="sm" className="text-xs text-slate-400">
                Upgrade to Premium
                <ArrowUpRight className="w-3 h-3 ml-1" />
              </Button>
            </div>

            {/* Notification Tabs */}
            <div className="px-4 py-3 border-b border-slate-800/50 flex gap-2 overflow-x-auto">
              {["All", "Analyst Updates", "Insider Activity", "Congress Trades", "Earnings", "Dividends", "Price Alerts"].map((tab) => (
                <Button
                  key={tab}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "whitespace-nowrap text-xs",
                    tab === "All"
                      ? "bg-cyan-500/10 text-cyan-400"
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  {tab}
                </Button>
              ))}
            </div>

            {/* Empty State */}
            <div className="p-12 text-center">
              <Bell className="h-12 w-12 mx-auto text-slate-700 mb-4" />
              <p className="text-slate-500">No notifications yet. Add stocks to receive alerts.</p>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
