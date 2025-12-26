import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ActiveTrade, TradeIdea } from "@shared/schema";
import { Link } from "wouter";
import { 
  Plus, 
  TrendingUp, 
  TrendingDown, 
  X, 
  RefreshCw, 
  DollarSign, 
  Target, 
  AlertTriangle,
  Clock,
  Trash2,
  CheckCircle,
  Search,
  ArrowLeft,
  ExternalLink,
  LineChart,
  Lightbulb
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

const confirmEntryFormSchema = z.object({
  entryPrice: z.coerce.number().positive("Entry price must be positive"),
  quantity: z.coerce.number().int().positive("Quantity must be at least 1").default(1),
});

type ConfirmEntryFormValues = z.infer<typeof confirmEntryFormSchema>;

const closeTradeFormSchema = z.object({
  exitPrice: z.coerce.number().positive("Exit price must be positive"),
});

type CloseTradeFormValues = z.infer<typeof closeTradeFormSchema>;

export default function LiveTradingPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [isNewTradeOpen, setIsNewTradeOpen] = useState(false);
  const [closingTradeId, setClosingTradeId] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedIdea, setSelectedIdea] = useState<TradeIdea | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: trades = [], isLoading, refetch } = useQuery<ActiveTrade[]>({
    queryKey: ['/api/active-trades'],
    refetchInterval: 10000,
    staleTime: 5000,
    enabled: isAuthenticated,
  });

  const { data: tradeIdeas = [], isLoading: isLoadingIdeas } = useQuery<TradeIdea[]>({
    queryKey: ['/api/trade-ideas'],
    enabled: isAuthenticated && isNewTradeOpen,
  });

  // Filter and categorize ideas - today's ideas first
  const { todaysIdeas, olderIdeas, filteredIdeas } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const isToday = (dateStr: string | null | undefined) => {
      if (!dateStr) return false;
      const date = new Date(dateStr);
      date.setHours(0, 0, 0, 0);
      return date.getTime() === today.getTime();
    };
    
    const allIdeas = tradeIdeas.filter(idea => idea.status === 'published');
    const todays = allIdeas.filter(idea => isToday(idea.timestamp)); // Using timestamp field
    const older = allIdeas.filter(idea => !isToday(idea.timestamp));
    
    // Apply search filter
    const query = searchQuery.toLowerCase().trim();
    const filtered = query 
      ? allIdeas.filter(idea => 
          idea.symbol.toLowerCase().includes(query) ||
          idea.headline?.toLowerCase().includes(query) ||
          idea.source?.toLowerCase().includes(query)
        )
      : [...todays, ...older.slice(0, 10)]; // Show today's + last 10 older
    
    return { todaysIdeas: todays, olderIdeas: older, filteredIdeas: filtered };
  }, [tradeIdeas, searchQuery]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLastRefresh(new Date());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isNewTradeOpen) {
      setStep(1);
      setSelectedIdea(null);
      setSearchQuery("");
    }
  }, [isNewTradeOpen]);

  const openTrades = trades.filter(t => t.status === 'open');
  const closedTrades = trades.filter(t => t.status === 'closed');

  const confirmEntryForm = useForm<ConfirmEntryFormValues>({
    resolver: zodResolver(confirmEntryFormSchema),
    defaultValues: {
      entryPrice: 0,
      quantity: 1,
    },
  });

  const closeTradeForm = useForm<CloseTradeFormValues>({
    resolver: zodResolver(closeTradeFormSchema),
    defaultValues: {
      exitPrice: 0,
    },
  });

  const createTradeMutation = useMutation({
    mutationFn: async (data: ConfirmEntryFormValues) => {
      if (!selectedIdea) throw new Error("No trade idea selected");
      
      const direction = selectedIdea.direction === 'bullish' ? 'long' : 
                        selectedIdea.direction === 'bearish' ? 'short' : 
                        selectedIdea.direction;
      
      const payload = {
        symbol: selectedIdea.symbol.toUpperCase(),
        assetType: selectedIdea.assetType === 'penny_stock' ? 'stock' : selectedIdea.assetType,
        direction: direction,
        entryPrice: data.entryPrice,
        quantity: data.quantity,
        entryTime: new Date().toISOString(),
        targetPrice: selectedIdea.targetPrice,
        stopLoss: selectedIdea.stopLoss,
        notes: [selectedIdea.headline, selectedIdea.rationale].filter(Boolean).join('\n\n'),
        ...(selectedIdea.assetType === "option" && {
          optionType: selectedIdea.optionType,
          strikePrice: selectedIdea.strikePrice,
          expiryDate: selectedIdea.expiryDate,
        }),
        tradeIdeaId: selectedIdea.id,
      };
      return await apiRequest('POST', '/api/active-trades', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/active-trades'] });
      toast({ title: "Trade Added", description: "Your position has been recorded" });
      setIsNewTradeOpen(false);
      confirmEntryForm.reset();
      setSelectedIdea(null);
      setStep(1);
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to add trade", 
        description: error.message || "Please try again", 
        variant: "destructive" 
      });
    },
  });

  const closeTradeMutation = useMutation({
    mutationFn: async ({ id, exitPrice }: { id: string; exitPrice: number }) => {
      return await apiRequest('POST', `/api/active-trades/${id}/close`, { exitPrice });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/active-trades'] });
      toast({ title: "Trade Closed", description: "Position has been closed" });
      setClosingTradeId(null);
      closeTradeForm.reset();
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to close trade", 
        description: error.message || "Please try again", 
        variant: "destructive" 
      });
    },
  });

  const deleteTradeMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('DELETE', `/api/active-trades/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/active-trades'] });
      toast({ title: "Trade Deleted", description: "Position has been removed" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to delete trade", 
        description: error.message || "Please try again", 
        variant: "destructive" 
      });
    },
  });

  const handleSelectIdea = (idea: TradeIdea) => {
    setSelectedIdea(idea);
    confirmEntryForm.reset({
      entryPrice: idea.entryPrice || 0,
      quantity: 1,
    });
    setStep(2);
  };

  const handleConfirmEntry = (data: ConfirmEntryFormValues) => {
    createTradeMutation.mutate(data);
  };

  const handleCloseTrade = (data: CloseTradeFormValues) => {
    if (closingTradeId) {
      closeTradeMutation.mutate({ id: closingTradeId, exitPrice: data.exitPrice });
    }
  };

  const formatPnL = (pnl: number | null | undefined) => {
    if (pnl === null || pnl === undefined) return "-";
    const sign = pnl >= 0 ? "+" : "";
    return `${sign}$${Math.abs(pnl).toFixed(2)}`;
  };

  const formatPnLPercent = (pnlPercent: number | null | undefined) => {
    if (pnlPercent === null || pnlPercent === undefined) return "-";
    const sign = pnlPercent >= 0 ? "+" : "";
    return `${sign}${pnlPercent.toFixed(2)}%`;
  };

  const getOptionLabel = (trade: ActiveTrade) => {
    if (trade.assetType !== 'option') return trade.symbol;
    const parts = [trade.symbol];
    if (trade.expiryDate) parts.push(format(parseISO(trade.expiryDate), "MM/dd"));
    if (trade.strikePrice) parts.push(`$${trade.strikePrice}`);
    if (trade.optionType) parts.push(trade.optionType.toUpperCase());
    return parts.join(" ");
  };

  const getIdeaOptionLabel = (idea: TradeIdea) => {
    if (idea.assetType !== 'option') return idea.symbol;
    const parts = [idea.symbol];
    if (idea.expiryDate) {
      try {
        parts.push(format(parseISO(idea.expiryDate), "MM/dd"));
      } catch {
        parts.push(idea.expiryDate);
      }
    }
    if (idea.strikePrice) parts.push(`$${idea.strikePrice}`);
    if (idea.optionType) parts.push(idea.optionType.toUpperCase());
    return parts.join(" ");
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'ai':
        return <Lightbulb className="h-3 w-3" />;
      case 'quant':
        return <LineChart className="h-3 w-3" />;
      case 'chart_analysis':
        return <TrendingUp className="h-3 w-3" />;
      default:
        return <Target className="h-3 w-3" />;
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'ai': return 'AI';
      case 'quant': return 'Quant';
      case 'chart_analysis': return 'Chart';
      default: return source;
    }
  };

  const totalUnrealizedPnL = openTrades.reduce((sum, t) => sum + (t.unrealizedPnL || 0), 0);
  const totalRealizedPnL = closedTrades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0);

  if (authLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CardTitle data-testid="text-login-prompt">Login Required</CardTitle>
            <CardDescription>
              Please log in to track your live trading positions
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Link href="/login">
              <Button data-testid="button-go-to-login">Go to Login</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Live Trading</h1>
          <p className="text-sm text-muted-foreground" data-testid="text-last-refresh">
            Last refresh: {format(lastRefresh, "HH:mm:ss")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            data-testid="button-refresh"
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
            Refresh
          </Button>
          <Dialog open={isNewTradeOpen} onOpenChange={setIsNewTradeOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-trade">
                <Plus className="h-4 w-4 mr-2" />
                New Trade
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle>
                  {step === 1 ? "Select Trade Idea" : "Confirm Entry"}
                </DialogTitle>
                <DialogDescription>
                  {step === 1 
                    ? (
                      <span className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5" />
                        {format(new Date(), "EEEE, MMMM d, yyyy")} — {todaysIdeas.length} ideas today
                      </span>
                    )
                    : "Review details and enter your position size"
                  }
                </DialogDescription>
              </DialogHeader>

              {step === 1 && (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by symbol, headline..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                      data-testid="input-search-ideas"
                    />
                  </div>

                  {isLoadingIdeas ? (
                    <div className="space-y-3 py-4">
                      {[1, 2, 3].map(i => (
                        <Skeleton key={i} className="h-20 w-full" />
                      ))}
                    </div>
                  ) : filteredIdeas.length === 0 ? (
                    <div className="text-center py-12">
                      <Lightbulb className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-30" />
                      <p className="font-medium text-muted-foreground">No trade ideas available</p>
                      <p className="text-sm text-muted-foreground mt-1 mb-4">
                        Generate ideas from Chart Analysis or the Trade Desk
                      </p>
                      <Link href="/chart-analysis">
                        <Button variant="outline" onClick={() => setIsNewTradeOpen(false)} data-testid="button-go-to-chart-analysis">
                          <LineChart className="h-4 w-4 mr-2" />
                          Go to Chart Analysis
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <ScrollArea className="flex-1 max-h-[400px] -mx-6 px-6">
                      <div className="space-y-2 py-2">
                        {filteredIdeas.map((idea) => (
                          <button
                            key={idea.id}
                            onClick={() => handleSelectIdea(idea)}
                            className="w-full text-left p-3 rounded-lg border hover-elevate transition-colors"
                            data-testid={`button-select-idea-${idea.id}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono font-semibold">
                                    {getIdeaOptionLabel(idea)}
                                  </span>
                                  <Badge 
                                    variant={idea.direction === 'bullish' ? 'default' : 'secondary'}
                                    className="text-xs"
                                  >
                                    {idea.direction === 'bullish' ? (
                                      <TrendingUp className="h-3 w-3 mr-1" />
                                    ) : (
                                      <TrendingDown className="h-3 w-3 mr-1" />
                                    )}
                                    {idea.direction}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs">
                                    {getSourceIcon(idea.source)}
                                    <span className="ml-1">{getSourceLabel(idea.source)}</span>
                                  </Badge>
                                </div>
                                {idea.headline && (
                                  <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                                    {idea.headline}
                                  </p>
                                )}
                                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {idea.timestamp ? format(new Date(idea.timestamp), "h:mm a") : "—"}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Target className="h-3 w-3 text-green-500" />
                                    ${idea.targetPrice?.toFixed(2)}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3 text-red-500" />
                                    ${idea.stopLoss?.toFixed(2)}
                                  </span>
                                  {idea.confidenceScore && (
                                    <span className="flex items-center gap-1">
                                      {idea.confidenceScore.toFixed(0)}%
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  )}

                  <DialogFooter>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsNewTradeOpen(false)}
                      data-testid="button-cancel-new-trade"
                    >
                      Cancel
                    </Button>
                  </DialogFooter>
                </>
              )}

              {step === 2 && selectedIdea && (
                <>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setStep(1);
                          setSelectedIdea(null);
                        }}
                        data-testid="button-back-to-ideas"
                      >
                        <ArrowLeft className="h-4 w-4 mr-1" />
                        Back
                      </Button>
                    </div>

                    <Card>
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-bold text-lg">
                                {getIdeaOptionLabel(selectedIdea)}
                              </span>
                              <Badge 
                                variant={selectedIdea.direction === 'bullish' ? 'default' : 'secondary'}
                              >
                                {selectedIdea.direction === 'bullish' ? (
                                  <TrendingUp className="h-3 w-3 mr-1" />
                                ) : (
                                  <TrendingDown className="h-3 w-3 mr-1" />
                                )}
                                {selectedIdea.direction === 'bullish' ? 'LONG' : 'SHORT'}
                              </Badge>
                            </div>
                            {selectedIdea.headline && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {selectedIdea.headline}
                              </p>
                            )}
                          </div>
                          <Link href="/trade-desk">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setIsNewTradeOpen(false)}
                              data-testid="link-view-trade-desk"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </Link>
                        </div>

                        <Separator className="my-3" />

                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground text-xs">Target</p>
                            <p className="font-mono text-green-600 dark:text-green-400">
                              ${selectedIdea.targetPrice?.toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Stop Loss</p>
                            <p className="font-mono text-red-600 dark:text-red-400">
                              ${selectedIdea.stopLoss?.toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">R:R Ratio</p>
                            <p className="font-mono">
                              {selectedIdea.riskRewardRatio?.toFixed(2) || '-'}
                            </p>
                          </div>
                        </div>

                        {selectedIdea.assetType === 'option' && (
                          <>
                            <Separator className="my-3" />
                            <div className="grid grid-cols-3 gap-4 text-sm">
                              <div>
                                <p className="text-muted-foreground text-xs">Type</p>
                                <p className="font-medium uppercase">{selectedIdea.optionType}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground text-xs">Strike</p>
                                <p className="font-mono">${selectedIdea.strikePrice?.toFixed(2)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground text-xs">Expiry</p>
                                <p className="font-mono">
                                  {selectedIdea.expiryDate ? (
                                    (() => {
                                      try {
                                        return format(parseISO(selectedIdea.expiryDate), "MM/dd/yy");
                                      } catch {
                                        return selectedIdea.expiryDate;
                                      }
                                    })()
                                  ) : '-'}
                                </p>
                              </div>
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>

                    <Form {...confirmEntryForm}>
                      <form onSubmit={confirmEntryForm.handleSubmit(handleConfirmEntry)} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={confirmEntryForm.control}
                            name="entryPrice"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Entry Price</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="number" 
                                    step="0.01"
                                    placeholder="0.00" 
                                    {...field} 
                                    data-testid="input-entry-price"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={confirmEntryForm.control}
                            name="quantity"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Quantity</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="number" 
                                    min="1"
                                    {...field} 
                                    data-testid="input-quantity"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <DialogFooter>
                          <Button 
                            type="button" 
                            variant="outline" 
                            onClick={() => setIsNewTradeOpen(false)}
                            data-testid="button-cancel-confirm"
                          >
                            Cancel
                          </Button>
                          <Button 
                            type="submit" 
                            disabled={createTradeMutation.isPending}
                            data-testid="button-confirm-trade"
                          >
                            {createTradeMutation.isPending ? "Adding..." : "Confirm Trade"}
                          </Button>
                        </DialogFooter>
                      </form>
                    </Form>
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Open Positions</p>
                <p className="text-2xl font-bold" data-testid="text-open-positions-count">{openTrades.length}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Unrealized P&L</p>
                <p 
                  className={cn(
                    "text-2xl font-bold font-mono",
                    totalUnrealizedPnL >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                  )}
                  data-testid="text-unrealized-pnl"
                >
                  {formatPnL(totalUnrealizedPnL)}
                </p>
              </div>
              <div className={cn(
                "h-10 w-10 rounded-lg flex items-center justify-center",
                totalUnrealizedPnL >= 0 ? "bg-green-100 dark:bg-green-500/20" : "bg-red-100 dark:bg-red-500/20"
              )}>
                <DollarSign className={cn(
                  "h-5 w-5",
                  totalUnrealizedPnL >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                )} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Realized P&L</p>
                <p 
                  className={cn(
                    "text-2xl font-bold font-mono",
                    totalRealizedPnL >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                  )}
                  data-testid="text-realized-pnl"
                >
                  {formatPnL(totalRealizedPnL)}
                </p>
              </div>
              <div className={cn(
                "h-10 w-10 rounded-lg flex items-center justify-center",
                totalRealizedPnL >= 0 ? "bg-green-100 dark:bg-green-500/20" : "bg-red-100 dark:bg-red-500/20"
              )}>
                <CheckCircle className={cn(
                  "h-5 w-5",
                  totalRealizedPnL >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                )} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" data-testid="text-open-positions-title">
            <TrendingUp className="h-5 w-5 text-blue-500" />
            Open Positions
          </CardTitle>
          <CardDescription>Active trades with real-time P&L tracking</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : openTrades.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground" data-testid="text-no-open-positions">
              <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="font-medium">No open positions</p>
              <p className="text-sm">Click "New Trade" to add your first position</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead className="text-right">Entry</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">P&L ($)</TableHead>
                    <TableHead className="text-right">P&L (%)</TableHead>
                    <TableHead>Target/Stop</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openTrades.map((trade) => (
                    <TableRow key={trade.id} data-testid={`row-open-trade-${trade.id}`}>
                      <TableCell>
                        <div className="font-medium" data-testid={`text-symbol-${trade.id}`}>
                          {getOptionLabel(trade)}
                        </div>
                        <Badge variant="outline" className="text-xs mt-1">
                          {trade.assetType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={trade.direction === 'long' ? 'default' : 'secondary'}
                          data-testid={`badge-direction-${trade.id}`}
                        >
                          {trade.direction === 'long' ? (
                            <TrendingUp className="h-3 w-3 mr-1" />
                          ) : (
                            <TrendingDown className="h-3 w-3 mr-1" />
                          )}
                          {trade.direction.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono" data-testid={`text-entry-price-${trade.id}`}>
                        ${trade.entryPrice.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono" data-testid={`text-current-price-${trade.id}`}>
                        {trade.currentPrice ? `$${trade.currentPrice.toFixed(2)}` : "-"}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-quantity-${trade.id}`}>
                        {trade.quantity}
                      </TableCell>
                      <TableCell 
                        className={cn(
                          "text-right font-mono font-medium",
                          (trade.unrealizedPnL || 0) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                        )}
                        data-testid={`text-unrealized-pnl-${trade.id}`}
                      >
                        {formatPnL(trade.unrealizedPnL)}
                      </TableCell>
                      <TableCell 
                        className={cn(
                          "text-right font-mono",
                          (trade.unrealizedPnLPercent || 0) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                        )}
                        data-testid={`text-unrealized-pnl-percent-${trade.id}`}
                      >
                        {formatPnLPercent(trade.unrealizedPnLPercent)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 text-xs">
                          {trade.targetPrice && (
                            <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                              <Target className="h-3 w-3" />
                              <span>${trade.targetPrice.toFixed(2)}</span>
                            </div>
                          )}
                          {trade.stopLoss && (
                            <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                              <AlertTriangle className="h-3 w-3" />
                              <span>${trade.stopLoss.toFixed(2)}</span>
                            </div>
                          )}
                          {!trade.targetPrice && !trade.stopLoss && (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Dialog 
                            open={closingTradeId === trade.id} 
                            onOpenChange={(open) => {
                              if (!open) setClosingTradeId(null);
                            }}
                          >
                            <DialogTrigger asChild>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => {
                                  setClosingTradeId(trade.id);
                                  closeTradeForm.reset({ exitPrice: trade.currentPrice || trade.entryPrice });
                                }}
                                data-testid={`button-close-trade-${trade.id}`}
                              >
                                <X className="h-3 w-3 mr-1" />
                                Close
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Close Position</DialogTitle>
                                <DialogDescription>
                                  Enter the exit price to close {getOptionLabel(trade)}
                                </DialogDescription>
                              </DialogHeader>
                              <Form {...closeTradeForm}>
                                <form onSubmit={closeTradeForm.handleSubmit(handleCloseTrade)} className="space-y-4">
                                  <FormField
                                    control={closeTradeForm.control}
                                    name="exitPrice"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Exit Price</FormLabel>
                                        <FormControl>
                                          <Input 
                                            type="number" 
                                            step="0.01"
                                            {...field}
                                            data-testid="input-exit-price"
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  <DialogFooter>
                                    <Button 
                                      type="button" 
                                      variant="outline" 
                                      onClick={() => setClosingTradeId(null)}
                                      data-testid="button-cancel-close"
                                    >
                                      Cancel
                                    </Button>
                                    <Button 
                                      type="submit"
                                      disabled={closeTradeMutation.isPending}
                                      data-testid="button-confirm-close"
                                    >
                                      {closeTradeMutation.isPending ? "Closing..." : "Confirm Close"}
                                    </Button>
                                  </DialogFooter>
                                </form>
                              </Form>
                            </DialogContent>
                          </Dialog>
                          <Button 
                            size="icon" 
                            variant="ghost"
                            onClick={() => deleteTradeMutation.mutate(trade.id)}
                            disabled={deleteTradeMutation.isPending}
                            data-testid={`button-delete-trade-${trade.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" data-testid="text-closed-positions-title">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Closed Positions
          </CardTitle>
          <CardDescription>Trade history with realized P&L</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : closedTrades.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground" data-testid="text-no-closed-positions">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="font-medium">No closed positions yet</p>
              <p className="text-sm">Closed trades will appear here</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead className="text-right">Entry</TableHead>
                    <TableHead className="text-right">Exit</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">P&L ($)</TableHead>
                    <TableHead className="text-right">P&L (%)</TableHead>
                    <TableHead>Exit Time</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closedTrades.map((trade) => (
                    <TableRow key={trade.id} data-testid={`row-closed-trade-${trade.id}`}>
                      <TableCell>
                        <div className="font-medium" data-testid={`text-closed-symbol-${trade.id}`}>
                          {getOptionLabel(trade)}
                        </div>
                        <Badge variant="outline" className="text-xs mt-1">
                          {trade.assetType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={trade.direction === 'long' ? 'default' : 'secondary'}>
                          {trade.direction.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        ${trade.entryPrice.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono" data-testid={`text-exit-price-${trade.id}`}>
                        {trade.exitPrice ? `$${trade.exitPrice.toFixed(2)}` : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {trade.quantity}
                      </TableCell>
                      <TableCell 
                        className={cn(
                          "text-right font-mono font-medium",
                          (trade.realizedPnL || 0) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                        )}
                        data-testid={`text-realized-pnl-${trade.id}`}
                      >
                        {formatPnL(trade.realizedPnL)}
                      </TableCell>
                      <TableCell 
                        className={cn(
                          "text-right font-mono",
                          (trade.realizedPnLPercent || 0) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                        )}
                        data-testid={`text-realized-pnl-percent-${trade.id}`}
                      >
                        {formatPnLPercent(trade.realizedPnLPercent)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm" data-testid={`text-exit-time-${trade.id}`}>
                        {trade.exitTime ? (
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(parseISO(trade.exitTime), "MM/dd HH:mm")}
                          </div>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          size="icon" 
                          variant="ghost"
                          onClick={() => deleteTradeMutation.mutate(trade.id)}
                          disabled={deleteTradeMutation.isPending}
                          data-testid={`button-delete-closed-trade-${trade.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
