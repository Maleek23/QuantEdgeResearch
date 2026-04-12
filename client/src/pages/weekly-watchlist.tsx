/**
 * Weekly Watchlist — your curated focus list for the week.
 * Auto-seeded Monday + manually editable all week.
 * Live prices update via WebSocket (see /ws/weekly-watchlist).
 */

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Plus,
  Trash2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Calendar,
  Sparkles,
  Activity,
} from "lucide-react";
import { cn, formatCurrency, safeToFixed } from "@/lib/utils";

interface WeeklyItem {
  id: string;
  symbol: string;
  assetType: string;
  weekStartDate: string;
  autoSeeded: boolean;
  weeklyConvictionScore: number | null;
  weeklyConvictionBand: string | null;
  weeklyThesis: string | null;
  thesis: string | null;
  livePrice: number | null;
  liveChangePercent: number | null;
  addedAt: string;
}

interface WeeklyResponse {
  weekStartDate: string;
  availableWeeks: string[];
  items: WeeklyItem[];
}

const BAND_COLORS: Record<string, string> = {
  S: "bg-purple-500/20 text-purple-400 border-purple-500/40",
  A: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  B: "bg-sky-500/20 text-sky-400 border-sky-500/40",
  C: "bg-amber-500/20 text-amber-400 border-amber-500/40",
};

export default function WeeklyWatchlistPage() {
  const { toast } = useToast();
  const [selectedWeek, setSelectedWeek] = useState<string>("");
  const [newSymbol, setNewSymbol] = useState("");
  const [newThesis, setNewThesis] = useState("");
  const [flashMap, setFlashMap] = useState<Record<string, "up" | "down">>({});
  const wsRef = useRef<WebSocket | null>(null);

  const { data, isLoading, refetch } = useQuery<WeeklyResponse>({
    queryKey: ["/api/watchlist/weekly", selectedWeek],
    queryFn: async () => {
      const url = selectedWeek
        ? `/api/watchlist/weekly?weekStart=${selectedWeek}`
        : "/api/watchlist/weekly";
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch weekly watchlist");
      return r.json();
    },
  });

  // Subscribe to live tracker WebSocket for current-week ticks
  useEffect(() => {
    // Only subscribe when viewing the current week
    if (selectedWeek && data && selectedWeek !== data.weekStartDate) return;
    if (!data || data.items.length === 0) return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/weekly-watchlist`);
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "tick" && Array.isArray(msg.symbols)) {
          // Update query cache in-place
          queryClient.setQueryData<WeeklyResponse>(
            ["/api/watchlist/weekly", selectedWeek],
            (prev) => {
              if (!prev) return prev;
              const updates = new Map<string, { price: number; chgPct: number }>();
              for (const t of msg.symbols) {
                updates.set(t.symbol, { price: t.price, chgPct: t.chgPct });
              }
              return {
                ...prev,
                items: prev.items.map((it) => {
                  const u = updates.get(it.symbol);
                  if (!u) return it;
                  // Trigger flash
                  if (it.livePrice && u.price !== it.livePrice) {
                    const dir = u.price > it.livePrice ? "up" : "down";
                    setFlashMap((m) => ({ ...m, [it.symbol]: dir }));
                    setTimeout(() => {
                      setFlashMap((m) => {
                        const next = { ...m };
                        delete next[it.symbol];
                        return next;
                      });
                    }, 600);
                  }
                  return { ...it, livePrice: u.price, liveChangePercent: u.chgPct };
                }),
              };
            },
          );
        }
      } catch {
        /* ignore */
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [selectedWeek, data?.weekStartDate, data?.items?.length]);

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!newSymbol.trim()) throw new Error("Symbol required");
      return apiRequest("POST", "/api/watchlist/weekly", {
        symbol: newSymbol.toUpperCase().trim(),
        thesis: newThesis.trim() || undefined,
      });
    },
    onSuccess: () => {
      setNewSymbol("");
      setNewThesis("");
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist/weekly"] });
      toast({ title: "Added", description: "Symbol added to this week's watchlist" });
    },
    onError: (err: any) => {
      toast({ title: "Add failed", description: err?.message || "Unknown error", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/watchlist/weekly/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist/weekly"] });
      toast({ title: "Removed" });
    },
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/watchlist/weekly/seed", { limit: 15 });
      return res;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist/weekly"] });
      toast({
        title: "Seeded from convictions",
        description: `Added ${data?.inserted ?? 0} symbols (${data?.skipped ?? 0} skipped)`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Seed failed", description: err?.message || "Unknown error", variant: "destructive" });
    },
  });

  const items = data?.items ?? [];
  const isCurrentWeek = !selectedWeek || (data && selectedWeek === data.weekStartDate);

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-7xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="w-6 h-6 text-emerald-400" />
            <h1 className="text-3xl font-bold text-foreground">This Week</h1>
            {isCurrentWeek && items.length > 0 && (
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/40">
                <Activity className="w-3 h-3 mr-1" />
                LIVE
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Curated focus list — auto-seeded Monday from Top Convictions, edit any time. Live prices stream every 5 seconds.
          </p>
        </motion.div>

        {/* Controls bar */}
        <Card className="bg-card/60 border-border p-4 mb-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Week</label>
              <Select
                value={selectedWeek || data?.weekStartDate || ""}
                onValueChange={(v) => setSelectedWeek(v)}
              >
                <SelectTrigger className="w-44 bg-muted/50">
                  <SelectValue placeholder="Current week" />
                </SelectTrigger>
                <SelectContent>
                  {data?.availableWeeks?.length ? (
                    data.availableWeeks.map((wk) => (
                      <SelectItem key={wk} value={wk}>
                        {wk} {wk === data.weekStartDate && "(current)"}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>No weeks yet</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
              <label className="text-xs text-muted-foreground">Add symbol</label>
              <Input
                placeholder="AAPL"
                value={newSymbol}
                onChange={(e) => setNewSymbol(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addMutation.mutate()}
                className="bg-muted/50 border-border"
              />
            </div>

            <div className="flex flex-col gap-1 flex-1 min-w-[260px]">
              <label className="text-xs text-muted-foreground">Thesis (optional)</label>
              <Input
                placeholder="Earnings catalyst, breakout setup..."
                value={newThesis}
                onChange={(e) => setNewThesis(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addMutation.mutate()}
                className="bg-muted/50 border-border"
              />
            </div>

            <Button
              onClick={() => addMutation.mutate()}
              disabled={!newSymbol.trim() || addMutation.isPending}
              className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/40"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>

            <Button
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              variant="outline"
              className="border-purple-500/40 text-purple-400 hover:bg-purple-500/10"
            >
              <Sparkles className={cn("w-4 h-4 mr-1", seedMutation.isPending && "animate-spin")} />
              {seedMutation.isPending ? "Seeding..." : "Auto-seed from Top Convictions"}
            </Button>

            <Button
              onClick={() => refetch()}
              variant="outline"
              size="icon"
              className="border-border"
            >
              <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
            </Button>
          </div>
        </Card>

        {/* Table */}
        <Card className="bg-card/60 border-border overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-emerald-400 mb-4" />
              <p className="text-muted-foreground">Loading...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center">
              <Calendar className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold text-foreground/80 mb-2">No symbols this week</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Auto-seed from Top Convictions or add a symbol manually above.
              </p>
              <Button
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
                className="bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 border border-purple-500/40"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Auto-seed now
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-xs uppercase">Symbol</TableHead>
                  <TableHead className="text-xs uppercase text-right">Price</TableHead>
                  <TableHead className="text-xs uppercase text-right">% Chg</TableHead>
                  <TableHead className="text-xs uppercase">Band</TableHead>
                  <TableHead className="text-xs uppercase text-right">Score</TableHead>
                  <TableHead className="text-xs uppercase">Thesis</TableHead>
                  <TableHead className="text-xs uppercase">Source</TableHead>
                  <TableHead className="text-xs uppercase w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const flash = flashMap[item.symbol];
                  const flashClass =
                    flash === "up"
                      ? "bg-emerald-500/10"
                      : flash === "down"
                      ? "bg-rose-500/10"
                      : "";
                  const chgPct = item.liveChangePercent ?? 0;
                  const isUp = chgPct >= 0;
                  return (
                    <TableRow
                      key={item.id}
                      className={cn(
                        "border-border transition-colors duration-300",
                        flashClass,
                      )}
                    >
                      <TableCell className="font-bold text-foreground">{item.symbol}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.livePrice != null ? formatCurrency(item.livePrice) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.liveChangePercent != null ? (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1",
                              isUp ? "text-emerald-400" : "text-rose-400",
                            )}
                          >
                            {isUp ? (
                              <TrendingUp className="w-3 h-3" />
                            ) : (
                              <TrendingDown className="w-3 h-3" />
                            )}
                            {safeToFixed(chgPct, 2)}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        {item.weeklyConvictionBand ? (
                          <Badge
                            variant="outline"
                            className={cn("border", BAND_COLORS[item.weeklyConvictionBand] || "")}
                          >
                            {item.weeklyConvictionBand}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {item.weeklyConvictionScore != null
                          ? safeToFixed(item.weeklyConvictionScore, 0)
                          : "—"}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                        {item.weeklyThesis || item.thesis || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs",
                            item.autoSeeded
                              ? "bg-purple-500/10 text-purple-400 border-purple-500/30"
                              : "bg-sky-500/10 text-sky-400 border-sky-500/30",
                          )}
                        >
                          {item.autoSeeded ? "Auto" : "Manual"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(item.id)}
                          className="h-8 w-8 text-muted-foreground hover:text-rose-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
