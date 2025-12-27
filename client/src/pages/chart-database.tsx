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

export default function ChartDatabase() {
  const [symbolSearch, setSymbolSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [assetFilter, setAssetFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  const { data: tradeIdeas = [], isLoading } = useQuery<TradeIdea[]>({
    queryKey: ['/api/trade-ideas'],
  });

  // Only include trades with resolved outcomes (hit_target or hit_stop)
  // Expired trades are excluded because they timed out without resolution
  const resolvedTrades = tradeIdeas.filter(idea => 
    idea.outcomeStatus === 'hit_target' || idea.outcomeStatus === 'hit_stop'
  );
  
  const allClosedTrades = tradeIdeas.filter(idea => 
    idea.outcomeStatus && idea.outcomeStatus !== 'open'
  );

  const filteredTrades = allClosedTrades.filter(trade => {
    if (symbolSearch && !trade.symbol.toLowerCase().includes(symbolSearch.toLowerCase())) return false;
    if (outcomeFilter !== "all" && trade.outcomeStatus !== outcomeFilter) return false;
    if (assetFilter !== "all" && trade.assetType !== assetFilter) return false;
    if (sourceFilter !== "all" && trade.source !== sourceFilter) return false;
    return true;
  });

  const wins = resolvedTrades.filter(t => t.outcomeStatus === 'hit_target').length;
  const losses = resolvedTrades.filter(t => t.outcomeStatus === 'hit_stop').length;
  const totalResolved = wins + losses;
  
  const stats = {
    total: allClosedTrades.length,
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
          <div className="flex items-center gap-3 mb-2">
            <Database className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold">Chart Database</h1>
          </div>
          <p className="text-lg text-muted-foreground">
            Historical trade patterns and performance analytics library
          </p>
        </div>

        {/* Data Source Notice */}
        <div className="glass-card rounded-xl border-l-2 border-l-amber-400 p-4 mb-6">
          <div className="flex items-start gap-3">
            <BarChart3 className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-400">About This Data</p>
              <p className="text-xs text-muted-foreground mt-1">
                This database includes auto-generated ideas from flow scanners, quant signals, and AI analysis. 
                Win rate is calculated from <strong>resolved trades only</strong> (hit target or hit stop). 
                {stats.expired > 0 && ` ${stats.expired.toLocaleString()} expired trades are excluded from win rate.`}
              </p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Total Closed</p>
                  <p className="text-3xl font-bold">{stats.total.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{stats.totalResolved} resolved</p>
                </div>
                <BarChart3 className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Winning Trades</p>
                  <p className="text-3xl font-bold text-green-500">{stats.wins}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Losing Trades</p>
                  <p className="text-3xl font-bold text-red-500">{stats.losses}</p>
                </div>
                <TrendingDown className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Win Rate</p>
                  <p className="text-3xl font-bold">{stats.winRate}%</p>
                  <p className="text-xs text-muted-foreground">of resolved trades</p>
                </div>
                <Target className="h-8 w-8 text-cyan-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filter Patterns
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-4 gap-4">
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
                  <SelectItem value="hit_target">Hit Target</SelectItem>
                  <SelectItem value="hit_stop">Hit Stop</SelectItem>
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
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger data-testid="select-source-filter">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="ai">AI Engine</SelectItem>
                  <SelectItem value="quant">Quantitative</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                  <SelectItem value="news_catalyst">News Catalyst</SelectItem>
                  <SelectItem value="flow_scanner">Flow Scanner</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Patterns Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">
              {filteredTrades.length} Pattern{filteredTrades.length !== 1 ? 's' : ''} Found
            </h2>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <Skeleton className="h-24 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredTrades.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Database className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">No Patterns Found</h3>
                <p className="text-muted-foreground">
                  Try adjusting your filters to see more results
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredTrades.map((trade, index) => (
                <Card key={trade.id} className="hover-elevate" data-testid={`pattern-${index}`}>
                  <CardContent className="p-6">
                    <div className="grid md:grid-cols-6 gap-4 items-center">
                      <div>
                        <div className="font-bold text-lg mb-1">{trade.symbol}</div>
                        <Badge variant="outline" className="text-xs">{trade.assetType}</Badge>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Direction</p>
                        <Badge variant={trade.direction === 'long' ? 'default' : 'destructive'}>
                          {trade.direction.toUpperCase()}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Entry / Exit</p>
                        <p className="text-sm font-mono font-semibold">
                          ${trade.entryPrice.toFixed(2)} → ${(trade.exitPrice || 0).toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">P&L</p>
                        <p className={`text-sm font-bold ${(trade.percentGain || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {(trade.percentGain || 0) >= 0 ? '+' : ''}{(trade.percentGain || 0).toFixed(1)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Source</p>
                        <Badge variant="secondary" className="text-xs">{trade.source}</Badge>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Date</p>
                        <div className="flex items-center gap-1 text-xs">
                          <Calendar className="h-3 w-3" />
                          {format(parseISO(trade.timestamp), 'MMM d, yyyy')}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
