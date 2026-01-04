import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { TradeIdea } from "@shared/schema";
import { Database, Search, Filter, TrendingUp, TrendingDown, BarChart3, Target, Calendar } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { getPnlColor } from "@/lib/signal-grade";

export default function ChartDatabase() {
  const [symbolSearch, setSymbolSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [assetFilter, setAssetFilter] = useState<string>("all");

  const { data: tradeIdeas = [], isLoading } = useQuery<TradeIdea[]>({
    queryKey: ['/api/trade-ideas'],
  });

  // ONLY show user-uploaded chart analyses, not auto-generated flow/lotto/quant ideas
  const chartAnalyses = tradeIdeas.filter(idea => idea.source === 'chart_analysis');
  
  // Only include trades with resolved outcomes (hit_target or hit_stop)
  const resolvedTrades = chartAnalyses.filter(idea => 
    idea.outcomeStatus === 'hit_target' || idea.outcomeStatus === 'hit_stop'
  );
  
  const allClosedTrades = chartAnalyses.filter(idea => 
    idea.outcomeStatus && idea.outcomeStatus !== 'open'
  );
  
  const openTrades = chartAnalyses.filter(idea => 
    !idea.outcomeStatus || idea.outcomeStatus === 'open'
  );

  // Filter all chart analyses (including open ones) for display
  const filteredTrades = chartAnalyses.filter(trade => {
    if (symbolSearch && !trade.symbol.toLowerCase().includes(symbolSearch.toLowerCase())) return false;
    if (outcomeFilter !== "all") {
      if (outcomeFilter === "open" && trade.outcomeStatus && trade.outcomeStatus !== 'open') return false;
      if (outcomeFilter !== "open" && trade.outcomeStatus !== outcomeFilter) return false;
    }
    if (assetFilter !== "all" && trade.assetType !== assetFilter) return false;
    return true;
  });

  const wins = resolvedTrades.filter(t => t.outcomeStatus === 'hit_target').length;
  const losses = resolvedTrades.filter(t => t.outcomeStatus === 'hit_stop').length;
  const totalResolved = wins + losses;
  
  const stats = {
    total: chartAnalyses.length,
    open: openTrades.length,
    totalResolved: totalResolved,
    expired: allClosedTrades.length - totalResolved,
    wins: wins,
    losses: losses,
    // Win rate only calculated from resolved trades (not expired)
    winRate: totalResolved > 0 ? Math.round((wins / totalResolved) * 100) : 0,
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="container mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <p className="text-xs font-medium uppercase tracking-wider text-amber-400 mb-2">
            Chart Database
          </p>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Database className="h-5 w-5 text-amber-400" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold">My Chart Analyses</h1>
          </div>
          <p className="text-base text-muted-foreground leading-relaxed">
            Track performance of charts you've uploaded for AI analysis
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <div className="stat-glass rounded-lg p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Charts Uploaded</p>
                <p className="text-2xl font-bold font-mono tabular-nums">{stats.total}</p>
              </div>
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <BarChart3 className="h-4 w-4 text-amber-400" />
              </div>
            </div>
          </div>
          <div className="stat-glass rounded-lg p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Still Open</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-cyan-400">{stats.open}</p>
              </div>
              <div className="h-8 w-8 rounded-lg bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                <Calendar className="h-4 w-4 text-cyan-400" />
              </div>
            </div>
          </div>
          <div className="stat-glass rounded-lg p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Wins</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-green-400">{stats.wins}</p>
              </div>
              <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="h-4 w-4 text-green-400" />
              </div>
            </div>
          </div>
          <div className="stat-glass rounded-lg p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Losses</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-red-400">{stats.losses}</p>
              </div>
              <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                <TrendingDown className="h-4 w-4 text-red-400" />
              </div>
            </div>
          </div>
          <div className="stat-glass rounded-lg p-4 col-span-2 md:col-span-1">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Win Rate</p>
                <p className="text-2xl font-bold font-mono tabular-nums">{stats.winRate}%</p>
                <p className="text-xs text-muted-foreground font-mono">{stats.totalResolved} resolved</p>
              </div>
              <div className="h-8 w-8 rounded-lg bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                <Target className="h-4 w-4 text-cyan-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="glass-card rounded-lg p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Filter className="h-4 w-4 text-amber-400" />
            </div>
            <h3 className="font-semibold">Filter Charts</h3>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search symbol..."
                value={symbolSearch}
                onChange={(e) => setSymbolSearch(e.target.value)}
                className="pl-9"
                data-testid="input-symbol-search"
              />
            </div>
            <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
              <SelectTrigger data-testid="select-outcome-filter">
                <SelectValue placeholder="Outcome" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Outcomes</SelectItem>
                <SelectItem value="open">Still Open</SelectItem>
                <SelectItem value="hit_target">Hit Target (Win)</SelectItem>
                <SelectItem value="hit_stop">Hit Stop (Loss)</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
            <Select value={assetFilter} onValueChange={setAssetFilter}>
              <SelectTrigger data-testid="select-asset-filter">
                <SelectValue placeholder="Asset Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Assets</SelectItem>
                <SelectItem value="stock">Stocks</SelectItem>
                <SelectItem value="option">Options</SelectItem>
                <SelectItem value="crypto">Crypto</SelectItem>
                <SelectItem value="future">Futures</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Patterns Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">
              <span className="font-mono tabular-nums">{filteredTrades.length}</span> Chart{filteredTrades.length !== 1 ? 's' : ''} Found
            </h2>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="glass-card rounded-lg p-6">
                  <Skeleton className="h-24 w-full" />
                </div>
              ))}
            </div>
          ) : filteredTrades.length === 0 ? (
            <div className="glass-card rounded-lg p-12 text-center">
              <div className="h-16 w-16 rounded-lg bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
                <Database className="h-8 w-8 text-amber-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">No Patterns Found</h3>
              <p className="text-muted-foreground">
                Try adjusting your filters to see more results
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTrades.map((trade, index) => (
                <div key={trade.id} className="glass-card rounded-lg p-6 hover-elevate" data-testid={`pattern-${index}`}>
                  <div className="grid md:grid-cols-6 gap-4 items-center">
                    <div>
                      <div className="font-bold text-lg font-mono mb-1">{trade.symbol}</div>
                      <Badge variant="outline" className="text-xs">{trade.assetType}</Badge>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Direction</p>
                      <Badge variant={trade.direction === 'long' ? 'default' : 'destructive'}>
                        {trade.direction.toUpperCase()}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Entry / Exit</p>
                      <p className="text-sm font-mono font-semibold tabular-nums">
                        ${trade.entryPrice.toFixed(2)} → {trade.exitPrice ? `$${trade.exitPrice.toFixed(2)}` : <span className="text-muted-foreground">Pending</span>}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">P&L</p>
                      {trade.outcomeStatus && trade.outcomeStatus !== 'open' ? (
                        <p className={cn("text-sm font-bold font-mono tabular-nums", getPnlColor(trade.outcomeStatus, trade.percentGain))}>
                          {(trade.percentGain || 0) >= 0 ? '+' : ''}{(trade.percentGain || 0).toFixed(1)}%
                        </p>
                      ) : (
                        <Badge variant="secondary" className="text-xs">OPEN</Badge>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Status</p>
                      {trade.outcomeStatus === 'hit_target' ? (
                        <Badge className="bg-green-500/10 text-green-400 border-green-500/30 text-xs">WIN</Badge>
                      ) : trade.outcomeStatus === 'hit_stop' ? (
                        <Badge className="bg-red-500/10 text-red-400 border-red-500/30 text-xs">LOSS</Badge>
                      ) : trade.outcomeStatus === 'expired' ? (
                        <Badge variant="secondary" className="text-xs">EXPIRED</Badge>
                      ) : (
                        <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-xs">TRACKING</Badge>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Date</p>
                      <div className="flex items-center gap-1 text-xs font-mono">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        {format(parseISO(trade.timestamp), 'MMM d, yyyy')}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
