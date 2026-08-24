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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Clock,
  Share2,
  Check,
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
              {connected ? "CONNECTED" : "OFFLINE"}
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
            <Calendar className="h-10 w-10 mx-auto text-muted-foreground/60 mb-3" />
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

// Pull the ranking rationale out of the grader's stored inputs so the table can
// show WHY a ticker scores where it does (momentum, upside-to-target, top signal).
function parseEdge(item: WatchlistItem): {
  momentum: number | null;
  upside: number | null;
  topSignal: string | null;
} {
  try {
    const gi = item.gradeInputs ? JSON.parse(item.gradeInputs as string) : null;
    if (!gi) return { momentum: null, upside: null, topSignal: null };
    return {
      momentum: typeof gi.momentum5d === "number" ? gi.momentum5d : null,
      upside: typeof gi.fairValueUpside === "number" ? gi.fairValueUpside : null,
      topSignal: Array.isArray(gi.signals) && gi.signals.length ? gi.signals[0] : null,
    };
  } catch {
    return { momentum: null, upside: null, topSignal: null };
  }
}

// ─── "Today" Tab — what got added recently (daily flow / weekend influx) ───
// Buckets the watchlist by add-date so a group can see at a glance what's new
// today, yesterday, and over the weekend without scrolling the full ranking.
function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dayBucketLabel(addedAt: string): string | null {
  const t = new Date(addedAt).getTime();
  if (Number.isNaN(t)) return null;
  const now = new Date();
  const today = startOfDay(now);
  const dayMs = 86_400_000;
  const added = startOfDay(new Date(t));
  const diffDays = Math.round((today - added) / dayMs);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  // Anything Sat/Sun within the last 7 days rolls up as the weekend influx.
  const dow = new Date(t).getDay(); // 0 Sun, 6 Sat
  if (diffDays <= 7 && (dow === 0 || dow === 6)) return "This weekend";
  if (diffDays <= 7) return new Date(t).toLocaleDateString(undefined, { weekday: "long" });
  return null; // older than a week — not "recent"
}

const DAILY_BUCKET_ORDER = ["Today", "Yesterday", "This weekend", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function DailyTab({ items }: { items: WatchlistItem[] }) {
  const buckets = useMemo(() => {
    // Dedupe by symbol, keeping the most recently added entry.
    const bySymbol = new Map<string, WatchlistItem>();
    for (const it of items) {
      const key = (it.symbol || "").toUpperCase();
      const existing = bySymbol.get(key);
      const t = it.addedAt ? new Date(it.addedAt).getTime() : 0;
      const et = existing?.addedAt ? new Date(existing.addedAt).getTime() : -1;
      if (!existing || t > et) bySymbol.set(key, it);
    }
    const tierOrder: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, D: 4, F: 5 };
    const groups = new Map<string, WatchlistItem[]>();
    for (const it of Array.from(bySymbol.values())) {
      const label = it.addedAt ? dayBucketLabel(it.addedAt) : null;
      if (!label) continue;
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(it);
    }
    for (const arr of Array.from(groups.values())) {
      arr.sort((a, b) => {
        const at = a.tier ? tierOrder[a.tier] ?? 6 : 6;
        const bt = b.tier ? tierOrder[b.tier] ?? 6 : 6;
        if (at !== bt) return at - bt;
        return (b.gradeScore || 0) - (a.gradeScore || 0);
      });
    }
    return DAILY_BUCKET_ORDER
      .filter((l) => groups.has(l))
      .map((l) => ({ label: l, rows: groups.get(l)! }));
  }, [items]);

  const total = buckets.reduce((n, b) => n + b.rows.length, 0);

  if (total === 0) {
    return (
      <Card className="bg-card/60 border-border p-8 text-center">
        <Calendar className="h-10 w-10 mx-auto text-muted-foreground/60 mb-3" />
        <h3 className="text-sm font-semibold text-foreground/70 mb-1">Nothing added in the last 7 days</h3>
        <p className="text-xs text-muted-foreground">
          New tickers you add (here or in "This Week") show up grouped by day so your group can track the daily flow.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {buckets.map((bucket) => (
        <Card key={bucket.label} className="bg-card/60 border-border overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <h3 className="text-sm font-semibold text-foreground/90">{bucket.label}</h3>
            <span className="text-xs font-mono text-muted-foreground">{bucket.rows.length}</span>
          </div>
          <div className="divide-y divide-border/40">
            {bucket.rows.map((item) => {
              const edge = parseEdge(item);
              const tier = item.tier || "C";
              const config = TIER_CONFIG[tier] || { bg: "bg-muted/30", text: "text-muted-foreground", label: tier };
              return (
                <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors">
                  <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded text-xs font-bold", config.bg, config.text)}>
                    {tier}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link href={`/stock/${item.symbol}`}>
                        <span className="font-semibold text-[var(--trade-bullish)] hover:underline cursor-pointer">
                          {item.symbol}
                        </span>
                      </Link>
                      {item.gradeLetter && (
                        <span className="font-mono text-xs text-muted-foreground">
                          {item.gradeLetter}
                          {item.gradeScore != null ? ` · ${Math.round(item.gradeScore)}` : ""}
                        </span>
                      )}
                    </div>
                    {edge.topSignal && (
                      <p className="truncate text-xs text-muted-foreground max-w-[260px]">{edge.topSignal}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    {edge.momentum != null && (
                      <div className={cn("font-mono text-sm", edge.momentum >= 0 ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]")}>
                        {edge.momentum >= 0 ? "+" : ""}{safeToFixed(edge.momentum, 1)}% 5d
                      </div>
                    )}
                    {item.addedAt && (
                      <div className="text-[10px] text-muted-foreground/70 font-mono">
                        {new Date(item.addedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function UnifiedWatchlist() {
  const { toast } = useToast();
  // Land on the graded "Overview" ranking by default (best-grade-first).
  const [activeTab, setActiveTab] = useState<"weekly" | "today" | "default" | "kavout" | "bot">("default");
  const [selectedWatchlist, setSelectedWatchlist] = useState("Main");
  const [searchSymbol, setSearchSymbol] = useState("");
  const [newSymbol, setNewSymbol] = useState("");
  // Default to best-grade-first — the core job of this page is "which of these
  // should I actually buy", so the ranked list is the landing state.
  const [sortColumn, setSortColumn] = useState<string>("tier");
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

  // Edit (modify) an item — notes / thesis / target price via PATCH.
  const [editItem, setEditItem] = useState<WatchlistItem | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editThesis, setEditThesis] = useState("");
  const [editTarget, setEditTarget] = useState("");
  const openEditor = (item: WatchlistItem) => {
    setEditItem(item);
    setEditNotes(item.notes || "");
    setEditThesis(item.thesis || "");
    setEditTarget(item.targetPrice != null ? String(item.targetPrice) : "");
  };
  const editItemMutation = useMutation({
    mutationFn: async () => {
      if (!editItem) return;
      const target = parseFloat(editTarget);
      return apiRequest('PATCH', `/api/watchlist/${editItem.id}`, {
        notes: editNotes.trim() || null,
        thesis: editThesis.trim() || null,
        targetPrice: Number.isFinite(target) ? target : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
      toast({ title: "Updated", description: `${editItem?.symbol} saved` });
      setEditItem(null);
    },
    onError: (error: Error) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
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
  const [shareCopied, setShareCopied] = useState(false);
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
    // Dedupe by symbol — the watchlist can accumulate multiple rows for the
    // same ticker (repeat adds, bulk imports). Keep one line per ticker,
    // preferring the best-graded entry so the ranked view stays clean.
    const bySymbol = new Map<string, WatchlistItem>();
    for (const it of items) {
      const key = (it.symbol || '').toUpperCase();
      const existing = bySymbol.get(key);
      if (!existing || (it.gradeScore ?? -1) > (existing.gradeScore ?? -1)) {
        bySymbol.set(key, it);
      }
    }
    items = Array.from(bySymbol.values());
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
        const at = tierOrder[a.tier || 'C'] ?? 3;
        const bt = tierOrder[b.tier || 'C'] ?? 3;
        if (at !== bt) return sortDirection === 'asc' ? at - bt : bt - at;
        // Within the same tier, higher grade score always ranks first.
        return (b.gradeScore || 0) - (a.gradeScore || 0);
      } else {
        return 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return items;
  }, [filteredItems, sortColumn, sortDirection, batchQuotes]);

  // Insights — at-a-glance summary computed from the live watchlist + quotes.
  // Gives the page some signal instead of just a flat table.
  const insights = useMemo(() => {
    const items = sortedItems;
    const n = items.length;
    const tierCounts: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 };
    let gradeSum = 0;
    let gradedN = 0;
    let bullish = 0;
    let bearish = 0;
    let upToday = 0;
    let downToday = 0;
    let topGainer: { symbol: string; pct: number } | null = null;
    let topLoser: { symbol: string; pct: number } | null = null;

    for (const it of items) {
      const tier = (it.tier || 'C').toUpperCase();
      if (tier in tierCounts) tierCounts[tier]++;
      if (typeof it.gradeScore === 'number') { gradeSum += it.gradeScore; gradedN++; }
      // Inline outlook (don't call getOutlook — it's declared later in this
      // component and would be in the temporal dead zone during this memo).
      if (tier === 'S' || tier === 'A') bullish++;
      else if (tier === 'D' || tier === 'F') bearish++;

      const chg = batchQuotes[it.symbol]?.changePercent;
      if (typeof chg === 'number') {
        if (chg > 0) upToday++; else if (chg < 0) downToday++;
        if (!topGainer || chg > topGainer.pct) topGainer = { symbol: it.symbol, pct: chg };
        if (!topLoser || chg < topLoser.pct) topLoser = { symbol: it.symbol, pct: chg };
      }
    }

    return {
      n,
      tierCounts,
      avgGrade: gradedN ? gradeSum / gradedN : 0,
      gradedN,
      bullish,
      bearish,
      upToday,
      downToday,
      topGainer,
      topLoser,
      eliteCount: tierCounts.S + tierCounts.A,
    };
  }, [sortedItems, batchQuotes]);

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
    <div>
      <div className="space-y-3">
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
              {new Set(watchlistItems.map(i => (i.symbol || '').toUpperCase())).size}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10"
              onClick={async () => {
                const url = `${window.location.origin}/w`;
                try {
                  await navigator.clipboard.writeText(url);
                  setShareCopied(true);
                  toast({ title: "Share link copied", description: `${url} — read-only, no login needed` });
                  setTimeout(() => setShareCopied(false), 2000);
                } catch {
                  toast({ title: "Share link", description: url });
                }
              }}
            >
              {shareCopied ? <Check className="w-4 h-4 mr-2" /> : <Share2 className="w-4 h-4 mr-2" />}
              {shareCopied ? "Copied!" : "Share"}
            </Button>
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
                className="w-full h-20 px-3 py-2 text-sm font-mono bg-background border border-border rounded-md resize-none placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-[var(--brand-teal)]"
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
              <TabsTrigger value="today" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
                <Clock className="w-4 h-4 mr-2" />
                Today
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

        {/* Insights panel — at-a-glance signal on the whole watchlist */}
        {activeTab === "default" && insights.n > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.07 }}
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2"
          >
            <InsightTile
              icon={<Star className="w-3.5 h-3.5" />}
              label="Names"
              value={String(insights.n)}
              sub={`${insights.gradedN} graded`}
            />
            <InsightTile
              icon={<BarChart3 className="w-3.5 h-3.5" />}
              label="Avg Grade"
              value={insights.avgGrade.toFixed(0)}
              sub={`S+A: ${insights.eliteCount}`}
              tone={insights.avgGrade >= 70 ? 'bull' : insights.avgGrade >= 50 ? 'cyan' : 'bear'}
            />
            <InsightTile
              icon={<Activity className="w-3.5 h-3.5" />}
              label="Tiers"
              value={`${insights.tierCounts.S}·${insights.tierCounts.A}·${insights.tierCounts.B}`}
              sub="S · A · B"
              tone="cyan"
            />
            <InsightTile
              icon={insights.upToday >= insights.downToday ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              label="Today"
              value={`${insights.upToday}▲ ${insights.downToday}▼`}
              sub="up / down"
              tone={insights.upToday >= insights.downToday ? 'bull' : 'bear'}
            />
            <InsightTile
              icon={<ArrowUpRight className="w-3.5 h-3.5" />}
              label="Top Gainer"
              value={insights.topGainer ? insights.topGainer.symbol : '—'}
              sub={insights.topGainer ? `${insights.topGainer.pct >= 0 ? '+' : ''}${insights.topGainer.pct.toFixed(1)}%` : 'no quotes'}
              tone="bull"
            />
            <InsightTile
              icon={<ArrowDownRight className="w-3.5 h-3.5" />}
              label="Top Loser"
              value={insights.topLoser ? insights.topLoser.symbol : '—'}
              sub={insights.topLoser ? `${insights.topLoser.pct.toFixed(1)}%` : 'no quotes'}
              tone="bear"
            />
          </motion.div>
        )}

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

        {/* Today Tab Content — recent adds grouped by day */}
        {activeTab === "today" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <DailyTab items={watchlistItems} />
          </motion.div>
        )}

        {/* Main Content - Table (Overview / Technical / Moving Averages) */}
        {(activeTab === "default" || activeTab === "kavout" || activeTab === "bot") && <motion.div
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
                <Star className="h-12 w-12 mx-auto text-muted-foreground/60 mb-4" />
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
                      <TableHead>Edge</TableHead>
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
                          <TableCell className="text-sm">
                            {(() => {
                              const edge = parseEdge(item);
                              if (edge.momentum == null && edge.upside == null && !edge.topSignal) {
                                return <span className="text-muted-foreground/60 text-xs">—</span>;
                              }
                              return (
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-2 font-mono text-xs">
                                    {edge.momentum != null && (
                                      <span
                                        className={cn(
                                          edge.momentum >= 0
                                            ? "text-[var(--trade-bullish)]"
                                            : "text-[var(--trade-bearish)]",
                                        )}
                                        title="5-day momentum"
                                      >
                                        {edge.momentum >= 0 ? "+" : ""}
                                        {safeToFixed(edge.momentum, 1)}% 5d
                                      </span>
                                    )}
                                    {edge.upside != null && (
                                      <span className="text-cyan-400" title="Upside to analyst target">
                                        {edge.upside >= 0 ? "+" : ""}
                                        {safeToFixed(edge.upside, 0)}% tgt
                                      </span>
                                    )}
                                  </div>
                                  {edge.topSignal && (
                                    <span className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                                      {edge.topSignal}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
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
                                className="h-8 w-8 text-muted-foreground hover:text-[var(--brand-cyan)]"
                                title="Edit notes / thesis / target"
                                onClick={() => openEditor(item)}
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
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

        {/* Edit item modal — modify notes / thesis / target */}
        <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="font-mono">
                Edit {editItem?.symbol}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Target Price</label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 150.00"
                  value={editTarget}
                  onChange={(e) => setEditTarget(e.target.value)}
                  className="mt-1 bg-muted/50 border-border"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Thesis</label>
                <textarea
                  placeholder="Why are you watching this?"
                  value={editThesis}
                  onChange={(e) => setEditThesis(e.target.value)}
                  className="mt-1 w-full h-16 px-3 py-2 text-sm bg-muted/50 border border-border rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-[var(--brand-cyan)]"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Notes</label>
                <textarea
                  placeholder="Quick notes…"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="mt-1 w-full h-16 px-3 py-2 text-sm bg-muted/50 border border-border rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-[var(--brand-cyan)]"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" className="border-border" onClick={() => setEditItem(null)}>
                Cancel
              </Button>
              <Button
                className="bg-cyan-500 hover:bg-cyan-600"
                disabled={editItemMutation.isPending}
                onClick={() => editItemMutation.mutate()}
              >
                {editItemMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
              <Bell className="h-12 w-12 mx-auto text-muted-foreground/60 mb-4" />
              <p className="text-muted-foreground">No notifications yet. Add stocks to receive alerts.</p>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

// ─── Insights tile ────────────────────────────────────────────────────
function InsightTile({
  icon, label, value, sub, tone = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'bull' | 'bear' | 'cyan';
}) {
  const toneClass =
    tone === 'bull' ? 'text-[var(--trade-bullish)]' :
    tone === 'bear' ? 'text-[var(--trade-bearish)]' :
    tone === 'cyan' ? 'text-[var(--brand-cyan)]' :
    'text-foreground';
  return (
    <Card className="p-2.5 bg-muted/30 border-border">
      <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60">
        <span className={toneClass}>{icon}</span>
        {label}
      </div>
      <div className={cn('mt-1 text-lg font-mono font-bold tabular-nums leading-none', toneClass)}>{value}</div>
      {sub && <div className="mt-0.5 text-[9px] font-mono text-muted-foreground/60">{sub}</div>}
    </Card>
  );
}
