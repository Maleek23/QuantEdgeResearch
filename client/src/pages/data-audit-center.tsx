import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { 
  Download, 
  AlertTriangle, 
  CheckCircle, 
  Search, 
  Filter,
  Database,
  FileSpreadsheet,
  Bot,
  Brain,
  BarChart3,
  Clock,
  XCircle,
  RefreshCw,
  Eye,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { cn } from "@/lib/utils";
import type { TradeIdea } from "@shared/schema";

const TIMEZONE = "America/Chicago";

interface BotAuditData {
  summary: {
    totalTrades: number;
    closedTrades: number;
    openTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    totalPnL: number;
  };
  trades: BotTrade[];
}

interface BotTrade {
  tradeNumber: number;
  id: string;
  symbol: string;
  optionType: string | null;
  strikePrice: number | null;
  direction: string;
  entryTime: string;
  entryTimeFormatted: string;
  entryDayOfWeek: string;
  entrySession: string;
  entryPrice: number;
  entryCost: number;
  quantity: number;
  dteAtEntry: number | null;
  status: string;
  exitTime: string | null;
  exitTimeFormatted: string | null;
  exitDayOfWeek: string | null;
  exitSession: string | null;
  exitPrice: number | null;
  exitReason: string | null;
  realizedPnL: number | null;
  realizedPnLPercent: number | null;
  targetPrice: number;
  stopLoss: number;
  holdTimeFormatted: string | null;
  tradeIdeaId: string | null;
}

interface IdeasAuditData {
  summary: {
    totalIdeas: number;
    closedIdeas: number;
    openIdeas: number;
    wins: number;
    losses: number;
    expired: number;
    winRateVsLosses: number;
    winRateVsAll: number;
  };
  ideas: IdeaAudit[];
}

interface IdeaAudit {
  ideaNumber: number;
  id: string;
  symbol: string;
  assetType: string;
  direction: string;
  optionType: string | null;
  strikePrice: number | null;
  dteAtIdea: number | null;
  ideaTimeFormatted: string;
  ideaDayOfWeek: string;
  ideaSession: string;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  outcomeStatus: string;
  exitDateFormatted: string | null;
  exitDayOfWeek: string | null;
  exitSession: string | null;
  exitPrice: number | null;
  percentGain: number | null;
  source: string;
  confidenceScore: number | null;
  holdingPeriod: string | null;
}

interface DataIssue {
  type: 'warning' | 'error' | 'info';
  category: string;
  description: string;
  affectedCount: number;
  details?: string[];
}

function formatCT(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  const zonedDate = toZonedTime(date, TIMEZONE);
  return format(zonedDate, "MMM d, h:mm a") + " CT";
}

function getOutcomeBadge(status: string | null) {
  switch (status) {
    case "hit_target":
      return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Win</Badge>;
    case "hit_stop":
      return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Loss</Badge>;
    case "expired":
      return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Expired</Badge>;
    case "closed":
      return <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">Closed</Badge>;
    default:
      return <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30">Open</Badge>;
  }
}

function getSourceBadge(source: string) {
  switch (source) {
    case "ai":
      return <Badge variant="outline" className="border-purple-500/50 text-purple-400">AI</Badge>;
    case "quant":
      return <Badge variant="outline" className="border-blue-500/50 text-blue-400">Quant</Badge>;
    case "lotto":
      return <Badge variant="outline" className="border-pink-500/50 text-pink-400">Lotto</Badge>;
    case "flow":
      return <Badge variant="outline" className="border-cyan-500/50 text-cyan-400">Flow</Badge>;
    case "chart":
      return <Badge variant="outline" className="border-amber-500/50 text-amber-400">Chart</Badge>;
    default:
      return <Badge variant="outline">{source}</Badge>;
  }
}

export default function DataAuditCenterPage() {
  const [activeTab, setActiveTab] = useState("bot");
  const [symbolFilter, setSymbolFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [dateRangeFilter, setDateRangeFilter] = useState("7d");

  // Fetch bot audit data
  const { data: botData, isLoading: botLoading, refetch: refetchBot } = useQuery<BotAuditData>({
    queryKey: ['/api/audit/auto-lotto-bot'],
  });

  // Fetch trade ideas audit data
  const { data: ideasData, isLoading: ideasLoading, refetch: refetchIdeas } = useQuery<IdeasAuditData>({
    queryKey: ['/api/audit/trade-ideas'],
  });

  // Helper: filter by date range
  const filterByDateRange = <T extends { entryTime?: string; ideaTime?: string; ideaTimeFormatted?: string; entryTimeFormatted?: string }>(items: T[]): T[] => {
    if (dateRangeFilter === 'all') return items;
    
    const now = new Date();
    let cutoff: Date;
    switch (dateRangeFilter) {
      case '1d': cutoff = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); break;
      case '7d': cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
      case '30d': cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
      default: return items;
    }
    
    return items.filter(item => {
      const timeStr = item.entryTime || item.ideaTime;
      if (!timeStr) return true;
      return new Date(timeStr) >= cutoff;
    });
  };

  // Analyze data for issues
  const dataIssues = useMemo<DataIssue[]>(() => {
    const issues: DataIssue[] = [];
    
    if (botData?.trades) {
      // Check for PUT options with "short" direction - these have inverted P&L bug
      // Only flag PUTs that are marked as "short" with suspicious P&L patterns
      const buggyShortPuts = botData.trades.filter(t => 
        t.direction === 'short' && 
        t.optionType === 'put' &&
        t.status === 'closed' &&
        t.realizedPnL !== null &&
        // Suspicious: "target_hit" exit but negative P&L (or vice versa)
        ((t.exitReason?.includes('target') && t.realizedPnL < 0) ||
         (t.exitReason?.includes('stop') && t.realizedPnL > 0))
      );
      if (buggyShortPuts.length > 0) {
        issues.push({
          type: 'error',
          category: 'P&L Calculation Bug',
          description: 'PUT trades with inverted P&L (short direction bug)',
          affectedCount: buggyShortPuts.length,
          details: buggyShortPuts.slice(0, 5).map(t => `#${t.tradeNumber} ${t.symbol}`)
        });
      }

      // Check for $0 P&L on closed trades (excluding breakeven exits)
      const zeroPnL = botData.trades.filter(t => 
        t.status === 'closed' && 
        t.realizedPnL === 0 &&
        !t.exitReason?.toLowerCase().includes('breakeven')
      );
      if (zeroPnL.length > 0) {
        issues.push({
          type: 'warning',
          category: 'Stale Data',
          description: 'Closed trades with $0 P&L (may be stale)',
          affectedCount: zeroPnL.length,
          details: zeroPnL.slice(0, 5).map(t => `#${t.tradeNumber} ${t.symbol}`)
        });
      }

      // Check for trades without exit reason
      const noExitReason = botData.trades.filter(t => t.status === 'closed' && !t.exitReason);
      if (noExitReason.length > 0) {
        issues.push({
          type: 'warning',
          category: 'Missing Data',
          description: 'Closed trades without exit reason',
          affectedCount: noExitReason.length,
        });
      }
    }

    if (ideasData?.ideas) {
      // Check for extreme percent gains (data bug) - more specific threshold
      const extremeGains = ideasData.ideas.filter(i => 
        i.percentGain !== null && (i.percentGain > 1000 || i.percentGain < -100)
      );
      if (extremeGains.length > 0) {
        issues.push({
          type: 'error',
          category: 'Data Bug',
          description: 'Trade ideas with impossible percent gains (>1000% or <-100%)',
          affectedCount: extremeGains.length,
          details: extremeGains.slice(0, 5).map(i => `${i.symbol}: ${i.percentGain?.toFixed(1)}%`)
        });
      }

      // Check for wins with negative percent gain
      const negativeWins = ideasData.ideas.filter(i => 
        i.outcomeStatus === 'hit_target' && i.percentGain !== null && i.percentGain < 0
      );
      if (negativeWins.length > 0) {
        issues.push({
          type: 'error',
          category: 'Logic Error',
          description: 'Winning trades with negative percent gain',
          affectedCount: negativeWins.length,
          details: negativeWins.slice(0, 5).map(i => `${i.symbol}: ${i.percentGain?.toFixed(1)}%`)
        });
      }

      // Check for exit price equals stock price (options bug)
      const suspiciousExits = ideasData.ideas.filter(i => 
        i.assetType === 'option' && 
        i.exitPrice !== null && 
        i.entryPrice < 10 && // Low-cost option
        i.exitPrice > 100 // Exit price way too high (likely stock price)
      );
      if (suspiciousExits.length > 0) {
        issues.push({
          type: 'error',
          category: 'Exit Price Bug',
          description: 'Options with exit price = stock price (not option price)',
          affectedCount: suspiciousExits.length,
          details: suspiciousExits.slice(0, 5).map(i => `${i.symbol}: $${i.entryPrice}→$${i.exitPrice}`)
        });
      }
    }

    // Add info if no issues found
    if (issues.length === 0) {
      issues.push({
        type: 'info',
        category: 'Status',
        description: 'No data integrity issues detected',
        affectedCount: 0
      });
    }

    return issues;
  }, [botData, ideasData]);

  // Filter bot trades
  const filteredBotTrades = useMemo(() => {
    if (!botData?.trades) return [];
    let filtered = filterByDateRange(botData.trades);
    
    if (symbolFilter) {
      filtered = filtered.filter(t => t.symbol.toLowerCase().includes(symbolFilter.toLowerCase()));
    }
    if (statusFilter !== 'all') {
      if (statusFilter === 'win') {
        filtered = filtered.filter(t => t.realizedPnL !== null && t.realizedPnL > 0);
      } else if (statusFilter === 'loss') {
        filtered = filtered.filter(t => t.realizedPnL !== null && t.realizedPnL <= 0);
      } else if (statusFilter === 'open') {
        filtered = filtered.filter(t => t.status === 'open');
      }
    }
    return filtered;
  }, [botData, symbolFilter, statusFilter, dateRangeFilter]);

  // Filter trade ideas
  const filteredIdeas = useMemo(() => {
    if (!ideasData?.ideas) return [];
    let filtered = filterByDateRange(ideasData.ideas);
    
    if (symbolFilter) {
      filtered = filtered.filter(i => i.symbol.toLowerCase().includes(symbolFilter.toLowerCase()));
    }
    if (statusFilter !== 'all') {
      if (statusFilter === 'win') {
        filtered = filtered.filter(i => i.outcomeStatus === 'hit_target');
      } else if (statusFilter === 'loss') {
        filtered = filtered.filter(i => i.outcomeStatus === 'hit_stop');
      } else if (statusFilter === 'expired') {
        filtered = filtered.filter(i => i.outcomeStatus === 'expired');
      } else if (statusFilter === 'open') {
        filtered = filtered.filter(i => i.outcomeStatus === 'open');
      }
    }
    if (sourceFilter !== 'all') {
      filtered = filtered.filter(i => i.source === sourceFilter);
    }
    return filtered.slice(0, 100); // Limit for performance
  }, [ideasData, symbolFilter, statusFilter, sourceFilter, dateRangeFilter]);

  const handleExport = (type: 'bot' | 'ideas') => {
    const url = type === 'bot' 
      ? '/api/audit/auto-lotto-bot?format=csv'
      : '/api/audit/trade-ideas?format=csv';
    window.open(url, '_blank');
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
            Transparency & Verification
          </p>
          <h1 className="text-2xl sm:text-3xl font-semibold flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Database className="h-5 w-5 text-purple-400" />
            </div>
            Data Audit Center
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => { refetchBot(); refetchIdeas(); }}
            data-testid="button-refresh-audit"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Data Integrity Issues */}
      <Card className="glass-card border-amber-500/20">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <CardTitle className="text-base">Data Integrity Check</CardTitle>
              <CardDescription>Automatic validation of trade data</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {dataIssues.map((issue, idx) => (
              <div 
                key={idx}
                className={cn(
                  "p-3 rounded-lg border",
                  issue.type === 'error' && "bg-red-500/5 border-red-500/20",
                  issue.type === 'warning' && "bg-amber-500/5 border-amber-500/20",
                  issue.type === 'info' && "bg-green-500/5 border-green-500/20"
                )}
              >
                <div className="flex items-start gap-2">
                  {issue.type === 'error' && <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />}
                  {issue.type === 'warning' && <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />}
                  {issue.type === 'info' && <CheckCircle className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {issue.category}
                    </p>
                    <p className="text-sm font-medium">{issue.description}</p>
                    {issue.affectedCount > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {issue.affectedCount} affected
                        {issue.details && `: ${issue.details.join(', ')}`}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card className="glass-card">
        <CardContent className="py-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters:</span>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Symbol..."
                value={symbolFilter}
                onChange={(e) => setSymbolFilter(e.target.value.toUpperCase())}
                className="w-32 pl-8 h-9"
                data-testid="input-symbol-filter"
              />
            </div>
            <Select value={dateRangeFilter} onValueChange={setDateRangeFilter}>
              <SelectTrigger className="w-24 h-9" data-testid="select-date-filter">
                <SelectValue placeholder="Date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1d">Today</SelectItem>
                <SelectItem value="7d">7 Days</SelectItem>
                <SelectItem value="30d">30 Days</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-28 h-9" data-testid="select-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="win">Wins</SelectItem>
                <SelectItem value="loss">Losses</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="open">Open</SelectItem>
              </SelectContent>
            </Select>
            {activeTab === 'ideas' && (
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-28 h-9" data-testid="select-source-filter">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="ai">AI</SelectItem>
                  <SelectItem value="quant">Quant</SelectItem>
                  <SelectItem value="lotto">Lotto</SelectItem>
                  <SelectItem value="flow">Flow</SelectItem>
                  <SelectItem value="chart">Chart</SelectItem>
                </SelectContent>
              </Select>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleExport(activeTab === 'bot' ? 'bot' : 'ideas')}
                data-testid="button-export-csv"
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full max-w-lg grid-cols-2">
          <TabsTrigger value="bot" className="gap-2" data-testid="tab-bot-trades">
            <Bot className="h-4 w-4" />
            Bot Trades ({botData?.summary?.totalTrades || 0})
          </TabsTrigger>
          <TabsTrigger value="ideas" className="gap-2" data-testid="tab-trade-ideas">
            <Brain className="h-4 w-4" />
            Trade Ideas ({ideasData?.summary?.totalIdeas || 0})
          </TabsTrigger>
        </TabsList>

        {/* Bot Trades Tab */}
        <TabsContent value="bot" className="space-y-4">
          {/* Summary Stats */}
          {botData?.summary && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Card className="glass-card">
                <CardContent className="p-4 text-center">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold font-mono">{botData.summary.totalTrades}</p>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardContent className="p-4 text-center">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Win Rate</p>
                  <p className="text-2xl font-bold font-mono text-green-400">{botData.summary.winRate}%</p>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardContent className="p-4 text-center">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Wins</p>
                  <p className="text-2xl font-bold font-mono text-green-400">{botData.summary.wins}</p>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardContent className="p-4 text-center">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Losses</p>
                  <p className="text-2xl font-bold font-mono text-red-400">{botData.summary.losses}</p>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardContent className="p-4 text-center">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total P&L</p>
                  <p className={cn(
                    "text-2xl font-bold font-mono",
                    botData.summary.totalPnL >= 0 ? "text-green-400" : "text-red-400"
                  )}>
                    {botData.summary.totalPnL >= 0 ? '+' : ''}${botData.summary.totalPnL.toFixed(2)}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Trades Table */}
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-cyan-400" />
                Bot Trade History ({filteredBotTrades.length} trades)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {botLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">#</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">Symbol</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">Type</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">Entry</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">Session</th>
                        <th className="text-right py-2 px-2 font-medium text-muted-foreground">Entry $</th>
                        <th className="text-right py-2 px-2 font-medium text-muted-foreground">Exit $</th>
                        <th className="text-right py-2 px-2 font-medium text-muted-foreground">P&L</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">Exit Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBotTrades.map((trade) => (
                        <tr key={trade.id} className="border-b border-border/30 hover-elevate" data-testid={`row-bot-trade-${trade.tradeNumber}`}>
                          <td className="py-2 px-2 font-mono text-muted-foreground" data-testid={`text-trade-number-${trade.tradeNumber}`}>{trade.tradeNumber}</td>
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{trade.symbol}</span>
                              {trade.optionType && (
                                <Badge variant="outline" className={cn(
                                  "text-xs",
                                  trade.optionType === 'call' ? "border-green-500/50 text-green-400" : "border-red-500/50 text-red-400"
                                )}>
                                  {trade.optionType.toUpperCase()} ${trade.strikePrice}
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-2">
                            <Badge variant="outline" className={cn(
                              trade.direction === 'long' ? "border-green-500/50 text-green-400" : "border-red-500/50 text-red-400"
                            )}>
                              {trade.direction.toUpperCase()}
                            </Badge>
                          </td>
                          <td className="py-2 px-2 text-xs text-muted-foreground">{trade.entryTimeFormatted}</td>
                          <td className="py-2 px-2">
                            <Badge variant="secondary" className="text-xs">{trade.entrySession}</Badge>
                          </td>
                          <td className="py-2 px-2 text-right font-mono">${trade.entryPrice.toFixed(2)}</td>
                          <td className="py-2 px-2 text-right font-mono">
                            {trade.exitPrice ? `$${trade.exitPrice.toFixed(2)}` : '—'}
                          </td>
                          <td className={cn(
                            "py-2 px-2 text-right font-mono font-semibold",
                            (trade.realizedPnL ?? 0) >= 0 ? "text-green-400" : "text-red-400"
                          )}>
                            {trade.realizedPnL !== null 
                              ? `${trade.realizedPnL >= 0 ? '+' : ''}$${trade.realizedPnL.toFixed(2)}`
                              : '—'
                            }
                          </td>
                          <td className="py-2 px-2 text-xs text-muted-foreground max-w-[200px] truncate">
                            {trade.exitReason || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trade Ideas Tab */}
        <TabsContent value="ideas" className="space-y-4">
          {/* Summary Stats */}
          {ideasData?.summary && (
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              <Card className="glass-card">
                <CardContent className="p-4 text-center">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold font-mono">{ideasData.summary.totalIdeas}</p>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardContent className="p-4 text-center">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Win Rate (vs Stops)</p>
                  <p className="text-2xl font-bold font-mono text-green-400">{ideasData.summary.winRateVsLosses}%</p>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardContent className="p-4 text-center">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Wins</p>
                  <p className="text-2xl font-bold font-mono text-green-400">{ideasData.summary.wins}</p>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardContent className="p-4 text-center">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Losses</p>
                  <p className="text-2xl font-bold font-mono text-red-400">{ideasData.summary.losses}</p>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardContent className="p-4 text-center">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Expired</p>
                  <p className="text-2xl font-bold font-mono text-amber-400">{ideasData.summary.expired}</p>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardContent className="p-4 text-center">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Open</p>
                  <p className="text-2xl font-bold font-mono text-cyan-400">{ideasData.summary.openIdeas}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Ideas Table */}
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="h-4 w-4 text-purple-400" />
                Trade Ideas Database (showing {filteredIdeas.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {ideasLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">#</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">Symbol</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">Source</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">Direction</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">Idea Time</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">Session</th>
                        <th className="text-right py-2 px-2 font-medium text-muted-foreground">Entry $</th>
                        <th className="text-right py-2 px-2 font-medium text-muted-foreground">Target $</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">Outcome</th>
                        <th className="text-right py-2 px-2 font-medium text-muted-foreground">Gain %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredIdeas.map((idea) => (
                        <tr key={idea.id} className="border-b border-border/30 hover-elevate" data-testid={`row-idea-${idea.ideaNumber}`}>
                          <td className="py-2 px-2 font-mono text-muted-foreground" data-testid={`text-idea-number-${idea.ideaNumber}`}>{idea.ideaNumber}</td>
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{idea.symbol}</span>
                              {idea.optionType && (
                                <Badge variant="outline" className={cn(
                                  "text-xs",
                                  idea.optionType === 'call' ? "border-green-500/50 text-green-400" : "border-red-500/50 text-red-400"
                                )}>
                                  {idea.optionType.toUpperCase()} ${idea.strikePrice}
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-2">{getSourceBadge(idea.source)}</td>
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-1">
                              {idea.direction === 'long' 
                                ? <TrendingUp className="h-3 w-3 text-green-400" />
                                : <TrendingDown className="h-3 w-3 text-red-400" />
                              }
                              <span className={idea.direction === 'long' ? 'text-green-400' : 'text-red-400'}>
                                {idea.direction.toUpperCase()}
                              </span>
                            </div>
                          </td>
                          <td className="py-2 px-2 text-xs text-muted-foreground">{idea.ideaTimeFormatted}</td>
                          <td className="py-2 px-2">
                            <Badge variant="secondary" className="text-xs">{idea.ideaSession}</Badge>
                          </td>
                          <td className="py-2 px-2 text-right font-mono">${idea.entryPrice.toFixed(2)}</td>
                          <td className="py-2 px-2 text-right font-mono">${idea.targetPrice.toFixed(2)}</td>
                          <td className="py-2 px-2">{getOutcomeBadge(idea.outcomeStatus)}</td>
                          <td className={cn(
                            "py-2 px-2 text-right font-mono font-semibold",
                            (idea.percentGain ?? 0) >= 0 ? "text-green-400" : "text-red-400"
                          )}>
                            {idea.percentGain !== null 
                              ? `${idea.percentGain >= 0 ? '+' : ''}${idea.percentGain.toFixed(1)}%`
                              : '—'
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Export Links Footer */}
      <Card className="glass-card">
        <CardContent className="py-4">
          <div className="flex items-center gap-4 flex-wrap justify-center">
            <p className="text-sm text-muted-foreground">Direct Download Links:</p>
            <Button variant="outline" size="sm" asChild>
              <a href="/api/audit/auto-lotto-bot?format=csv" download data-testid="link-bot-csv">
                <Download className="h-4 w-4 mr-2" />
                Bot Trades CSV
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="/api/audit/trade-ideas?format=csv" download data-testid="link-ideas-csv">
                <Download className="h-4 w-4 mr-2" />
                Trade Ideas CSV
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
