/**
 * Unified Watchlist - Merges 3 watchlist pages into one
 * Tabs: Default (Personal) | Kavout | Bot-Generated
 */

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { cn, formatCurrency, safeToFixed, safeNumber } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMarketPoll, POLL } from "@/hooks/use-market-poll";
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
  Upload,
  Bell,
  ChevronDown,
  BarChart3,
  DollarSign,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Zap,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { WatchlistItem, TradeIdea } from "@shared/schema";

// ─── Weekly Watchlist WS Hook ─────────────────────────────────────

interface WeeklyTick {
  symbol: string;
  price: number;
  chgPct: number;
  ts: number;
}

function useWeeklyTickerStream() {
  const [ticks, setTicks] = useState<Map<string, WeeklyTick>>(new Map());
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/weekly-watchlist`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      // Reconnect after 5s
      reconnectTimer.current = setTimeout(connect, 5000);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === "snapshot" || msg.type === "tick") {
          setTicks((prev) => {
            const next = new Map(prev);
            for (const t of msg.symbols as WeeklyTick[]) {
              next.set(t.symbol, t);
            }
            return next;
          });
        }
      } catch {}
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { ticks, connected };
}

// ─── Weekly Watchlist Item Type ───────────────────────────────────

interface WeeklyItem {
  id: number;
  symbol: string;
  category: string;
  weekStartDate: string;
  autoSeeded: boolean;
  weeklyConvictionScore: number | null;
  weeklyConvictionBand: string | null;
  weeklyThesis: string | null;
  addedAt: string;
}

// ─── "This Week" Tab Component ────────────────────────────────────

function ThisWeekTab() {
  const { toast } = useToast();
  const { ticks, connected } = useWeeklyTickerStream();
  const [newSymbol, setNewSymbol] = useState("");

  // Get current Monday's date
  const currentMonday = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    return monday.toISOString().split("T")[0];
  }, []);

  const { data: weeklyItems = [], isLoading, refetch } = useQuery<WeeklyItem[]>({
    queryKey: ["/api/watchlist/weekly", currentMonday],
    queryFn: async () => {
      const res = await fetch(`/api/watchlist/weekly?weekStart=${currentMonday}`);
      if (!res.ok) throw new Error("Failed to load weekly watchlist");
      const data = await res.json();
      return data.items || [];
    },
    refetchInterval: 30_000,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/watchlist/weekly", {
        symbol: newSymbol.toUpperCase(),
        thesis: "",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist/weekly"] });
      setNewSymbol("");
      toast({ title: "Added", description: `${newSymbol.toUpperCase()} added to this week` });
    },
    onError: (err: Error) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/watchlist/weekly/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist/weekly"] });
      toast({ title: "Removed from weekly list" });
    },
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/watchlist/weekly/seed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist/weekly"] });
      toast({ title: "Seeded", description: "Weekly list refreshed from top convictions" });
    },
  });

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-mono text-muted-foreground">
            Week of {currentMonday}
          </span>
          <div className="flex items-center gap-1 ml-2">
            {connected ? (
              <Wifi className="w-3 h-3 text-[var(--trade-bullish)]" />
            ) : (
              <WifiOff className="w-3 h-3 text-muted-foreground" />
            )}
            <span className={cn("text-[10px] font-mono", connected ? "text-[var(--trade-bullish)]" : "text-muted-foreground")}>
              {connected ? "LIVE" : "OFFLINE"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Input
              placeholder="Add ticker..."
              value={newSymbol}
              onChange={(e) => setNewSymbol(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newSymbol.trim()) addMutation.mutate();
              }}
              className="w-32 h-8 text-xs bg-muted/50 border-border"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs border-border"
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
          >
            <Zap className={cn("w-3 h-3 mr-1", seedMutation.isPending && "animate-spin")} />
            Auto-seed
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card className="bg-card/60 border-border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto text-[var(--brand-teal)] mb-2" />
            <p className="text-sm text-muted-foreground">Loading weekly list...</p>
          </div>
        ) : weeklyItems.length === 0 ? (
          <div className="p-8 text-center">
            <Calendar className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <h3 className="text-sm font-semibold text-foreground/70 mb-1">No tickers this week</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Click "Auto-seed" to populate from top convictions, or add tickers manually.
            </p>
            <Button
              size="sm"
              className="bg-[var(--brand-teal)] hover:bg-[var(--brand-teal)]/80 text-white"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
            >
              <Zap className="w-3 h-3 mr-1" />
              Seed from Convictions
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border hover:bg-transparent">
                  <TableHead className="w-[100px]">Symbol</TableHead>
                  <TableHead className="text-right w-[90px]">Price</TableHead>
                  <TableHead className="text-right w-[80px]">% Chg</TableHead>
                  <TableHead className="text-center w-[60px]">Band</TableHead>
                  <TableHead className="text-right w-[60px]">Score</TableHead>
                  <TableHead>Thesis</TableHead>
                  <TableHead className="text-center w-[60px]">Source</TableHead>
                  <TableHead className="text-center w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {weeklyItems.map((item) => {
                  const tick = ticks.get(item.symbol);
                  const price = tick?.price;
                  const chgPct = tick?.chgPct ?? 0;
                  const isPos = chgPct >= 0;
                  const band = item.weeklyConvictionBand || "–";
                  const bandConfig = TIER_CONFIG[band] || { bg: "bg-muted/30", text: "text-muted-foreground", label: band };

                  return (
                    <TableRow key={item.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <TableCell>
                        <Link href={`/stock/${item.symbol}`}>
                          <span className="font-semibold text-[var(--brand-teal)] hover:underline cursor-pointer">
                            {item.symbol}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-mono text-foreground/80 text-sm">
                          {price != null ? `$${price.toFixed(2)}` : "–"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          {isPos ? (
                            <ArrowUpRight className="w-3 h-3 text-[var(--trade-bullish)]" />
                          ) : (
                            <ArrowDownRight className="w-3 h-3 text-[var(--trade-bearish)]" />
                          )}
                          <span className={cn("font-mono text-xs", isPos ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]")}>
                            {isPos ? "+" : ""}{chgPct.toFixed(2)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold", bandConfig.bg, bandConfig.text)}>
                          {band}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-mono text-xs text-muted-foreground">
                          {item.weeklyConvictionScore != null ? Math.round(item.weeklyConvictionScore) : "–"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground truncate max-w-[200px] block">
                          {item.weeklyThesis || "–"}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {item.autoSeeded ? (
                          <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 font-mono bg-[var(--brand-teal)]/10 text-[var(--brand-teal)] border-[var(--brand-teal)]/30">
                            AUTO
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 font-mono">
                            MANUAL
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-[var(--trade-bearish)] hover:text-red-300"
                          onClick={() => removeMutation.mutate(item.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

// Tier configuration for grading display
const TIER_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  S: { bg: "bg-purple-500/20", text: "text-purple-400", label: "S" },
  A: { bg: "bg-emerald-500/20", text: "text-[var(--trade-bullish)]", label: "A" },
  B: { bg: "bg-emerald-500/20", text: "text-[var(--trade-bullish)]", label: "B" },
  C: { bg: "bg-amber-500/20", text: "text-[var(--trade-neutral)]", label: "C" },
  D: { bg: "bg-orange-500/20", text: "text-orange-400", label: "D" },
  F: { bg: "bg-red-500/20", text: "text-[var(--trade-bearish)]", label: "F" },
};

interface QuoteData {
  price: number;
  change: number;
  changePercent: number;
}

export default function UnifiedWatchlist() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"weekly" | "default" | "kavout" | "bot">("weekly");
  const [selectedWatchlist, setSelectedWatchlist] = useState("Main");
  const [searchSymbol, setSearchSymbol] = useState("");
  const [newSymbol, setNewSymbol] = useState("");
  const [sortColumn, setSortColumn] = useState<string>("symbol");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const priceInterval = useMarketPoll(POLL.PRICES.open, POLL.PRICES.closed);
  const scannerInterval = useMarketPoll(POLL.SCANNER.open, POLL.SCANNER.closed);

  // Fetch personal watchlist items
  const { data: watchlistItems = [], isLoading: watchlistLoading, refetch: refetchWatchlist } = useQuery<WatchlistItem[]>({
    queryKey: ['/api/watchlist'],
    refetchInterval: scannerInterval,
  });

  // Fetch trade ideas for bot-generated tab
  const { data: tradeIdeas = [] } = useQuery<TradeIdea[]>({
    queryKey: ['/api/trade-ideas'],
    refetchInterval: scannerInterval,
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
    staleTime: 10_000,
    refetchInterval: priceInterval,
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

  // Bulk import state + mutation
  const [bulkInput, setBulkInput] = useState("");
  const [showBulkImport, setShowBulkImport] = useState(false);
  const bulkImportMutation = useMutation({
    mutationFn: async (symbols: string[]) => {
      const res = await apiRequest('POST', '/api/watchlist/batch-add', { symbols });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
      const added = data.results?.length || 0;
      const errors = data.errors?.length || 0;
      toast({
        title: `Imported ${added} symbols`,
        description: errors > 0 ? `${errors} failed — check symbols and retry` : 'All symbols added successfully',
      });
      setBulkInput("");
      setShowBulkImport(false);
    },
    onError: (error: Error) => {
      toast({ title: "Bulk import failed", description: error.message, variant: "destructive" });
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
    <div className="min-h-screen p-3 sm:p-4">
      <div className="max-w-[1600px] mx-auto space-y-3">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col"
        >
          <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold text-foreground/90 flex items-center gap-2">
              <Star className="h-4 w-4 text-[var(--trade-bullish)]" />
              Watchlist
            </h1>
            <Badge className="bg-emerald-500/20 text-[var(--trade-bullish)] border-0 font-mono">
              {watchlistItems.length}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-border"
              onClick={() => reGradeAllMutation.mutate()}
              disabled={reGradeAllMutation.isPending}
            >
              <RefreshCw className={cn("w-4 h-4 mr-2", reGradeAllMutation.isPending && "animate-spin")} />
              Refresh All
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-border"
              onClick={() => {
                const csv = [
                  ['Symbol', 'Price', 'Type', 'YTD Return', 'Market Cap', 'Outlook', 'Tier'].join(','),
                  ...sortedItems.map(item => {
                    const quote = batchQuotes[item.symbol];
                    return [
                      item.symbol,
                      quote?.price ? safeToFixed(quote.price, 2) : '',
                      item.assetType || 'stock',
                      quote?.changePercent != null ? safeToFixed(quote.changePercent, 2) + '%' : '',
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
            <Button
              size="sm"
              variant="outline"
              className="border-[var(--brand-teal)]/30 text-[var(--brand-teal)] hover:bg-[var(--brand-teal)]/10"
              onClick={() => setShowBulkImport(!showBulkImport)}
            >
              <Upload className="w-4 h-4 mr-2" />
              Bulk Import
            </Button>
          </div>
          </div>

          {/* Bulk Import Panel — paste symbols from TradingView or elsewhere */}
          {showBulkImport && (
            <div className="mt-3 p-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--brand-teal)]/30">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                PASTE SYMBOLS FROM TRADINGVIEW OR ANY SOURCE
              </div>
              <textarea
                className="w-full h-20 px-3 py-2 text-sm font-mono bg-background border border-border rounded-md resize-none placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-[var(--brand-teal)]"
                placeholder="AAPL, TSLA, NVDA, MSFT&#10;or one per line..."
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] font-mono text-muted-foreground">
                  {bulkInput.trim() ? `${bulkInput.split(/[,\s\n]+/).filter(s => s.trim()).length} symbols detected` : 'Comma or newline separated'}
                </span>
                <Button
                  size="sm"
                  className="bg-[var(--brand-teal)] hover:bg-[var(--brand-teal)]/80"
                  disabled={!bulkInput.trim() || bulkImportMutation.isPending}
                  onClick={() => {
                    const symbols = bulkInput.split(/[,\s\n]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
                    if (symbols.length === 0) {
                      toast({ title: "No symbols found", variant: "destructive" });
                      return;
                    }
                    bulkImportMutation.mutate(symbols);
                  }}
                >
                  {bulkImportMutation.isPending ? 'Importing...' : `Import ${bulkInput.split(/[,\s\n]+/).filter(s => s.trim()).length} Symbols`}
                </Button>
              </div>
            </div>
          )}
        </motion.div>

        {/* Watchlist Selector + Search */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Default</span>
            <Select value={selectedWatchlist} onValueChange={setSelectedWatchlist}>
              <SelectTrigger className="w-40 bg-emerald-500/10 border-emerald-500/30 text-[var(--trade-bullish)]">
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
            <TabsList className="bg-muted/50">
              <TabsTrigger value="weekly" className="data-[state=active]:bg-[var(--brand-teal)]/15 data-[state=active]:text-[var(--brand-teal)]">
                <Calendar className="w-4 h-4 mr-2" />
                This Week
              </TabsTrigger>
              <TabsTrigger value="default" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-[var(--trade-bullish)]">
                <Star className="w-4 h-4 mr-2" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="kavout" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400">
                <BarChart3 className="w-4 h-4 mr-2" />
                Technical
              </TabsTrigger>
              <TabsTrigger value="bot" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-[var(--trade-bullish)]">
                <Bot className="w-4 h-4 mr-2" />
                Moving Averages
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Add Symbol:</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="AAPL, TSLA..."
                value={newSymbol}
                onChange={(e) => setNewSymbol(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    addSymbolMutation.mutate();
                  }
                }}
                className="pl-9 w-48 bg-muted/50 border-border"
              />
            </div>
          </div>
        </motion.div>

        {/* Weekly Tab Content */}
        {activeTab === "weekly" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <ThisWeekTab />
          </motion.div>
        )}

        {/* Main Content - Table (Overview / Technical / Moving Averages) */}
        {activeTab !== "weekly" && <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-card/60 border-border overflow-hidden">
            {watchlistLoading ? (
              <div className="p-12 text-center">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-[var(--trade-bullish)] mb-4" />
                <p className="text-muted-foreground">Loading watchlist...</p>
              </div>
            ) : sortedItems.length === 0 ? (
              <div className="p-12 text-center">
                <Star className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-semibold text-foreground/80 mb-2">No symbols in watchlist</h3>
                <p className="text-sm text-muted-foreground">Add symbols using the search bar above</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border hover:bg-transparent">
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
                          className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                        >
                          <TableCell>
                            <div>
                              <Link href={`/stock/${item.symbol}`}>
                                <span className="font-semibold text-[var(--trade-bullish)] hover:text-[var(--trade-bullish)] cursor-pointer">
                                  {item.symbol}
                                </span>
                              </Link>
                              <p className="text-xs text-muted-foreground mt-0.5 max-w-xs truncate">
                                {item.notes || item.assetType?.toUpperCase() || 'Stock'}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="font-mono text-foreground/80">
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
                                <ArrowUpRight className="w-3 h-3 text-[var(--trade-bullish)]" />
                              ) : (
                                <ArrowDownRight className="w-3 h-3 text-[var(--trade-bearish)]" />
                              )}
                              <span className={cn(
                                "font-mono text-sm",
                                isPositive ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]"
                              )}>
                                {isPositive ? '+' : ''}{safeToFixed(changePercent, 2)}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground text-sm">
                            {getMarketCap(item)}
                          </TableCell>
                          <TableCell className="text-center">
                            {outlook ? (
                              <Badge className={cn(
                                "text-xs",
                                outlook === "Outperform"
                                  ? "bg-emerald-500/20 text-[var(--trade-bullish)] border-emerald-500/30"
                                  : outlook === "Underperform"
                                  ? "bg-red-500/20 text-[var(--trade-bearish)] border-red-500/30"
                                  : "bg-muted-foreground/20 text-muted-foreground border-muted-foreground/30"
                              )}>
                                {outlook}
                              </Badge>
                            ) : (
                              <Lock className="w-4 h-4 text-muted-foreground/70 mx-auto" />
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-2">
                              <div className={cn("px-2 py-1 rounded text-xs font-bold", config.bg, config.text)}>
                                {tier}
                              </div>
                              {item.gradeScore && (
                                <span className="text-xs text-muted-foreground font-mono">
                                  {item.gradeScore}/100
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Link href={`/stock/${item.symbol}`}>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-[var(--trade-bullish)] hover:text-[var(--trade-bullish)]">
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </Link>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-[var(--trade-bearish)] hover:text-red-300"
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
        </motion.div>}

        {/* Notifications Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Card className="bg-card/60 border-border">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-[var(--trade-bullish)]" />
                <h3 className="font-semibold text-foreground/90">Notifications & Alerts</h3>
              </div>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
                Upgrade to Premium
                <ArrowUpRight className="w-3 h-3 ml-1" />
              </Button>
            </div>

            {/* Notification Tabs */}
            <div className="px-4 py-3 border-b border-border/50 flex gap-2 overflow-x-auto">
              {["All", "Analyst Updates", "Insider Activity", "Congress Trades", "Earnings", "Dividends", "Price Alerts"].map((tab) => (
                <Button
                  key={tab}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "whitespace-nowrap text-xs",
                    tab === "All"
                      ? "bg-emerald-500/10 text-[var(--trade-bullish)]"
                      : "text-muted-foreground hover:text-foreground/80"
                  )}
                >
                  {tab}
                </Button>
              ))}
            </div>

            {/* Empty State */}
            <div className="p-12 text-center">
              <Bell className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No notifications yet. Add stocks to receive alerts.</p>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
