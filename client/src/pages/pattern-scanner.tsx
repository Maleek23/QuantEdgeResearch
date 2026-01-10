import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  TrendingUp, 
  Target, 
  Clock, 
  AlertTriangle, 
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Filter,
  Zap,
  BarChart3,
  Flag,
  Triangle,
  Circle,
  Activity
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { fetchWithParams } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { PatternType, PatternStatus, PatternSignal } from "@shared/schema";

const PATTERN_ICONS: Record<PatternType, typeof TrendingUp> = {
  bull_flag: Flag,
  bear_flag: Flag,
  ascending_triangle: Triangle,
  descending_triangle: Triangle,
  symmetrical_triangle: Triangle,
  cup_and_handle: Circle,
  inverse_head_shoulders: Activity,
  double_bottom: Activity,
  falling_wedge: Triangle,
  channel_breakout: BarChart3,
  vcp: Zap,
  parabolic_move: TrendingUp,
  base_breakout: BarChart3,
  momentum_surge: Zap,
};

const URGENCY_COLORS: Record<string, string> = {
  imminent: "text-red-400 bg-red-500/10 border-red-500/30",
  soon: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  developing: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
};

const STATUS_COLORS: Record<PatternStatus, string> = {
  forming: "text-amber-400 bg-amber-500/10",
  confirmed: "text-green-400 bg-green-500/10",
  failed: "text-red-400 bg-red-500/10",
  completed: "text-slate-400 bg-slate-500/10",
};

interface PatternSignalResponse {
  count: number;
  signals: PatternSignal[];
  patternTypes: Record<PatternType, string>;
  timestamp: string;
}

type SortKey = "patternScore" | "symbol" | "urgency" | "riskRewardRatio" | "distanceToBreakout";
type SortDirection = "asc" | "desc";

export default function PatternScanner() {
  const queryClient = useQueryClient();
  const [patternFilter, setPatternFilter] = useState<string>("all");
  const [urgencyFilter, setUrgencyFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("patternScore");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const itemsPerPage = 20;

  const { data, isLoading, refetch } = useQuery<PatternSignalResponse>({
    queryKey: ["/api/pattern-scanner/signals", { bullishOnly: "true", limit: "100" }] as const,
    queryFn: fetchWithParams<PatternSignalResponse>(),
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/pattern-scanner/scan");
      if (!response.ok) throw new Error("Failed to run pattern scan");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pattern-scanner/signals"] });
    },
  });

  const filteredAndSortedSignals = useMemo(() => {
    if (!data?.signals) return [];
    
    let signals = [...data.signals];
    
    if (patternFilter !== "all") {
      signals = signals.filter(s => s.patternType === patternFilter);
    }
    
    if (urgencyFilter !== "all") {
      signals = signals.filter(s => s.urgency === urgencyFilter);
    }
    
    signals.sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;
      
      switch (sortKey) {
        case "patternScore":
          aVal = a.patternScore || 0;
          bVal = b.patternScore || 0;
          break;
        case "symbol":
          aVal = a.symbol;
          bVal = b.symbol;
          break;
        case "urgency":
          const urgencyOrder = { imminent: 3, soon: 2, developing: 1 };
          aVal = urgencyOrder[a.urgency as keyof typeof urgencyOrder] || 0;
          bVal = urgencyOrder[b.urgency as keyof typeof urgencyOrder] || 0;
          break;
        case "riskRewardRatio":
          aVal = a.riskRewardRatio || 0;
          bVal = b.riskRewardRatio || 0;
          break;
        case "distanceToBreakout":
          aVal = a.distanceToBreakout || 0;
          bVal = b.distanceToBreakout || 0;
          break;
      }
      
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      
      return sortDirection === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    
    return signals;
  }, [data?.signals, patternFilter, urgencyFilter, sortKey, sortDirection]);

  const paginatedSignals = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    return filteredAndSortedSignals.slice(start, start + itemsPerPage);
  }, [filteredAndSortedSignals, page]);

  const totalPages = Math.ceil(filteredAndSortedSignals.length / itemsPerPage);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  };

  const SortHeader = ({ label, sortKeyName, className }: { label: string; sortKeyName: SortKey; className?: string }) => (
    <button
      onClick={() => handleSort(sortKeyName)}
      className={cn(
        "flex items-center gap-1 font-mono text-xs text-slate-400 hover:text-cyan-400 transition-colors uppercase tracking-wider",
        className
      )}
      data-testid={`sort-${sortKeyName}`}
    >
      {label}
      {sortKey === sortKeyName && (
        sortDirection === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />
      )}
    </button>
  );

  const patternStats = useMemo(() => {
    if (!data?.signals) return { imminent: 0, bullish: 0, avgScore: 0 };
    const imminent = data.signals.filter(s => s.urgency === "imminent").length;
    const bullish = data.signals.filter(s => s.patternScore && s.patternScore >= 75).length;
    const avgScore = data.signals.reduce((acc, s) => acc + (s.patternScore || 0), 0) / (data.signals.length || 1);
    return { imminent, bullish, avgScore: Math.round(avgScore) };
  }, [data?.signals]);

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-cyan-400" />
            Pattern Scanner
          </h1>
          <p className="text-sm text-muted-foreground font-mono">
            Breakout patterns • Bull flags • VCP • Momentum surges
          </p>
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
          className="gap-2"
          data-testid="button-scan-patterns"
        >
          <RefreshCw className={cn("h-4 w-4", scanMutation.isPending && "animate-spin")} />
          {scanMutation.isPending ? "Scanning..." : "Run Scan"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900/50 border-slate-700/40">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-mono uppercase">Total Patterns</p>
                <p className="text-2xl font-bold">{data?.count || 0}</p>
              </div>
              <BarChart3 className="h-8 w-8 text-cyan-400/50" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-slate-900/50 border-slate-700/40">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-mono uppercase">Imminent</p>
                <p className="text-2xl font-bold text-red-400">{patternStats.imminent}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-400/50" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-slate-900/50 border-slate-700/40">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-mono uppercase">High Conviction</p>
                <p className="text-2xl font-bold text-green-400">{patternStats.bullish}</p>
              </div>
              <Target className="h-8 w-8 text-green-400/50" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-slate-900/50 border-slate-700/40">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-mono uppercase">Avg Score</p>
                <p className="text-2xl font-bold">{patternStats.avgScore}</p>
              </div>
              <Zap className="h-8 w-8 text-amber-400/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-900/50 border-slate-700/40">
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle className="text-base font-mono flex items-center gap-2">
              <Filter className="h-4 w-4 text-cyan-400" />
              Active Patterns
            </CardTitle>
            
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={patternFilter} onValueChange={setPatternFilter}>
                <SelectTrigger className="w-[160px] h-8 text-xs" data-testid="select-pattern-type">
                  <SelectValue placeholder="Pattern Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Patterns</SelectItem>
                  <SelectItem value="bull_flag">Bull Flag</SelectItem>
                  <SelectItem value="ascending_triangle">Ascending Triangle</SelectItem>
                  <SelectItem value="cup_and_handle">Cup & Handle</SelectItem>
                  <SelectItem value="vcp">VCP</SelectItem>
                  <SelectItem value="parabolic_move">Parabolic Move</SelectItem>
                  <SelectItem value="momentum_surge">Momentum Surge</SelectItem>
                  <SelectItem value="falling_wedge">Falling Wedge</SelectItem>
                  <SelectItem value="double_bottom">Double Bottom</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
                <SelectTrigger className="w-[130px] h-8 text-xs" data-testid="select-urgency">
                  <SelectValue placeholder="Urgency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Urgency</SelectItem>
                  <SelectItem value="imminent">Imminent</SelectItem>
                  <SelectItem value="soon">Soon</SelectItem>
                  <SelectItem value="developing">Developing</SelectItem>
                </SelectContent>
              </Select>
              
              <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-8" data-testid="button-refresh">
                <RefreshCw className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : paginatedSignals.length === 0 ? (
            <div className="p-8 text-center">
              <BarChart3 className="h-12 w-12 mx-auto text-slate-600 mb-3" />
              <h3 className="font-semibold mb-1">No Patterns Found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Run a scan to detect chart patterns across the market.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => scanMutation.mutate()}
                disabled={scanMutation.isPending}
                data-testid="button-empty-scan"
              >
                Run Pattern Scan
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-800/50 border-b border-slate-700/40">
                    <tr>
                      <th className="text-left p-3">
                        <SortHeader label="Symbol" sortKeyName="symbol" />
                      </th>
                      <th className="text-left p-3">
                        <span className="font-mono text-xs text-slate-400 uppercase tracking-wider">Pattern</span>
                      </th>
                      <th className="text-center p-3">
                        <SortHeader label="Score" sortKeyName="patternScore" className="justify-center" />
                      </th>
                      <th className="text-center p-3">
                        <SortHeader label="Urgency" sortKeyName="urgency" className="justify-center" />
                      </th>
                      <th className="text-right p-3">
                        <span className="font-mono text-xs text-slate-400 uppercase tracking-wider">Entry</span>
                      </th>
                      <th className="text-right p-3">
                        <span className="font-mono text-xs text-slate-400 uppercase tracking-wider">Target</span>
                      </th>
                      <th className="text-right p-3">
                        <span className="font-mono text-xs text-slate-400 uppercase tracking-wider">Stop</span>
                      </th>
                      <th className="text-center p-3">
                        <SortHeader label="R:R" sortKeyName="riskRewardRatio" className="justify-center" />
                      </th>
                      <th className="text-center p-3">
                        <SortHeader label="Dist" sortKeyName="distanceToBreakout" className="justify-center" />
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {paginatedSignals.map((signal) => {
                      const PatternIcon = PATTERN_ICONS[signal.patternType] || TrendingUp;
                      const displayName = data?.patternTypes?.[signal.patternType] || signal.patternType;
                      
                      return (
                        <tr 
                          key={signal.id} 
                          className="hover:bg-slate-800/30 transition-colors"
                          data-testid={`row-pattern-${signal.symbol}`}
                        >
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-cyan-400">{signal.symbol}</span>
                              <Badge 
                                variant="outline" 
                                className={cn("text-xs", STATUS_COLORS[signal.patternStatus])}
                              >
                                {signal.patternStatus}
                              </Badge>
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <PatternIcon className="h-4 w-4 text-amber-400" />
                              <span className="text-sm">{displayName}</span>
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge 
                                  variant="outline"
                                  className={cn(
                                    "font-mono",
                                    signal.patternScore && signal.patternScore >= 80 ? "text-green-400 bg-green-500/10" :
                                    signal.patternScore && signal.patternScore >= 70 ? "text-cyan-400 bg-cyan-500/10" :
                                    "text-amber-400 bg-amber-500/10"
                                  )}
                                >
                                  {signal.patternScore}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="font-mono text-xs">Pattern confidence score</p>
                              </TooltipContent>
                            </Tooltip>
                          </td>
                          <td className="p-3 text-center">
                            <Badge 
                              variant="outline" 
                              className={cn("text-xs font-mono", URGENCY_COLORS[signal.urgency || "developing"])}
                            >
                              <Clock className="h-3 w-3 mr-1" />
                              {signal.urgency}
                            </Badge>
                          </td>
                          <td className="p-3 text-right font-mono text-sm">
                            ${signal.currentPrice?.toFixed(2) || "—"}
                          </td>
                          <td className="p-3 text-right font-mono text-sm text-green-400">
                            ${signal.targetPrice?.toFixed(2) || "—"}
                          </td>
                          <td className="p-3 text-right font-mono text-sm text-red-400">
                            ${signal.stopLoss?.toFixed(2) || "—"}
                          </td>
                          <td className="p-3 text-center">
                            <span className={cn(
                              "font-mono text-sm",
                              signal.riskRewardRatio && signal.riskRewardRatio >= 2 ? "text-green-400" : "text-slate-400"
                            )}>
                              {signal.riskRewardRatio?.toFixed(1) || "—"}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <span className="font-mono text-sm text-slate-400">
                              {signal.distanceToBreakout !== undefined && signal.distanceToBreakout !== null 
                                ? `${signal.distanceToBreakout.toFixed(1)}%` 
                                : "—"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/40">
                  <p className="text-xs text-muted-foreground font-mono">
                    Showing {(page - 1) * itemsPerPage + 1}-{Math.min(page * itemsPerPage, filteredAndSortedSignals.length)} of {filteredAndSortedSignals.length}
                  </p>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                      <Button
                        key={pageNum}
                        variant={pageNum === page ? "default" : "ghost"}
                        size="sm"
                        className="h-7 w-7 p-0 font-mono text-xs"
                        onClick={() => setPage(pageNum)}
                        data-testid={`button-page-${pageNum}`}
                      >
                        {pageNum}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {data?.signals && data.signals.length > 0 && (
        <Card className="bg-slate-900/50 border-slate-700/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-mono flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              Imminent Breakouts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {data.signals
                .filter(s => s.urgency === "imminent")
                .slice(0, 8)
                .map((signal) => {
                  const PatternIcon = PATTERN_ICONS[signal.patternType] || TrendingUp;
                  const displayName = data.patternTypes?.[signal.patternType] || signal.patternType;
                  
                  return (
                    <div 
                      key={signal.id}
                      className="p-3 rounded-lg bg-slate-800/50 border border-red-500/20 hover:border-red-500/40 transition-colors"
                      data-testid={`card-imminent-${signal.symbol}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono font-bold text-cyan-400">{signal.symbol}</span>
                        <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">
                          {signal.patternScore}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
                        <PatternIcon className="h-3 w-3" />
                        <span>{displayName}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                        <div>
                          <span className="text-slate-500">Target</span>
                          <span className="text-green-400 ml-1">${signal.targetPrice?.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">R:R</span>
                          <span className="text-slate-300 ml-1">{signal.riskRewardRatio?.toFixed(1)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
            {data.signals.filter(s => s.urgency === "imminent").length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No imminent breakouts detected at this time.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
