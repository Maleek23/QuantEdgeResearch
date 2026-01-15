/**
 * Watchlist Tracker with Whale Flow Integration
 *
 * Tracks user's favorite stocks and shows:
 * - Current price
 * - Whale flow activity (institutional options)
 * - Price alerts
 */

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Star, Plus, X, TrendingUp, TrendingDown, Eye, AlertCircle, Loader2, DollarSign } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface WatchlistItem {
  id: string;
  symbol: string;
  assetType: string;
  notes?: string;
  nickname?: string;
  addedAt: string;
  currentPrice?: number;
  priceChange?: number;
  priceChangePercent?: number;
}

interface WhaleFlow {
  id: string;
  symbol: string;
  optionType: 'call' | 'put';
  strikePrice: number;
  expiryDate: string;
  premiumPerContract: number;
  isMegaWhale: boolean;
  grade: string;
  detectedAt: string;
  confidenceScore: number;
}

export function WatchlistTracker() {
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newSymbol, setNewSymbol] = useState('');
  const [newNotes, setNewNotes] = useState('');

  // Fetch user's watchlist
  const { data: watchlist = [], isLoading: watchlistLoading } = useQuery<WatchlistItem[]>({
    queryKey: ['/api/watchlist'],
    refetchInterval: 60000, // Refresh every minute for price updates
  });

  // Fetch all whale flows to check for watchlist symbols
  const { data: allWhaleFlows = [] } = useQuery<WhaleFlow[]>({
    queryKey: ['/api/whale-flows'],
    queryFn: async () => {
      const res = await fetch('/api/whale-flows?days=7');
      if (!res.ok) throw new Error('Failed to fetch whale flows');
      return res.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Group whale flows by symbol
  const whaleFlowsBySymbol = allWhaleFlows.reduce((acc, flow) => {
    if (!acc[flow.symbol]) acc[flow.symbol] = [];
    acc[flow.symbol].push(flow);
    return acc;
  }, {} as Record<string, WhaleFlow[]>);

  // Add symbol mutation
  const addSymbolMutation = useMutation({
    mutationFn: async (data: { symbol: string; notes: string }) => {
      return apiRequest('POST', '/api/watchlist', {
        symbol: data.symbol.toUpperCase(),
        assetType: 'stock',
        notes: data.notes,
        category: 'active',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
      setIsAddDialogOpen(false);
      setNewSymbol('');
      setNewNotes('');
      toast({ title: 'Added to watchlist', description: 'Tracking whale flows for this symbol' });
    },
    onError: () => {
      toast({ title: 'Failed to add', description: 'Could not add symbol to watchlist', variant: 'destructive' });
    }
  });

  // Remove symbol mutation
  const removeSymbolMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/watchlist/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
      toast({ title: 'Removed from watchlist', description: 'Symbol removed' });
    },
    onError: () => {
      toast({ title: 'Failed to remove', description: 'Could not remove symbol', variant: 'destructive' });
    }
  });

  // Quick add default stocks
  const quickAddStocks = ['MYT', 'NBIS', 'EOSE', 'ONDS'];
  const handleQuickAdd = async (symbol: string) => {
    if (watchlist.some(w => w.symbol === symbol)) {
      toast({ title: 'Already watching', description: `${symbol} is already in your watchlist` });
      return;
    }
    addSymbolMutation.mutate({ symbol, notes: '2026 growth play' });
  };

  const formatPremium = (premium: number) => {
    if (premium >= 1000000) return `$${(premium / 1000000).toFixed(1)}M`;
    if (premium >= 1000) return `$${(premium / 1000).toFixed(0)}K`;
    return `$${premium.toFixed(0)}`;
  };

  const getPriceChangeColor = (changePercent?: number) => {
    if (!changePercent) return 'text-muted-foreground';
    return changePercent >= 0 ? 'text-green-400' : 'text-red-400';
  };

  return (
    <Card data-testid="watchlist-tracker">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 text-amber-400 fill-amber-400" />
            <CardTitle className="text-lg">My Watchlist</CardTitle>
            <Badge variant="outline" className="text-xs">
              {watchlist.length} stocks
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" data-testid="button-add-to-watchlist">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Stock
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Stock to Watchlist</DialogTitle>
                  <DialogDescription>
                    Track stocks and get alerts for whale flow activity
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div>
                    <label className="text-sm text-muted-foreground">Symbol</label>
                    <Input
                      placeholder="TSLA"
                      value={newSymbol}
                      onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                      data-testid="input-watchlist-symbol"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Notes (optional)</label>
                    <Input
                      placeholder="Why are you watching this stock?"
                      value={newNotes}
                      onChange={(e) => setNewNotes(e.target.value)}
                      data-testid="input-watchlist-notes"
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => addSymbolMutation.mutate({ symbol: newSymbol, notes: newNotes })}
                    disabled={!newSymbol || addSymbolMutation.isPending}
                    data-testid="button-submit-watchlist"
                  >
                    {addSymbolMutation.isPending ? 'Adding...' : 'Add to Watchlist'}
                  </Button>

                  {/* Quick Add Section */}
                  <div className="pt-4 border-t">
                    <p className="text-xs text-muted-foreground mb-2">Quick add:</p>
                    <div className="flex flex-wrap gap-2">
                      {quickAddStocks.map(symbol => (
                        <Button
                          key={symbol}
                          size="sm"
                          variant="outline"
                          onClick={() => handleQuickAdd(symbol)}
                          disabled={watchlist.some(w => w.symbol === symbol)}
                          className="text-xs"
                        >
                          {watchlist.some(w => w.symbol === symbol) ? (
                            <>✓ {symbol}</>
                          ) : (
                            <>+ {symbol}</>
                          )}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <CardDescription>
          Track your stocks and get alerted to whale flow activity
        </CardDescription>
      </CardHeader>
      <CardContent>
        {watchlistLoading ? (
          <div className="text-center py-8 text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading watchlist...
          </div>
        ) : watchlist.length === 0 ? (
          <div className="text-center py-8">
            <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground mb-4">No stocks in your watchlist</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {quickAddStocks.map(symbol => (
                <Button
                  key={symbol}
                  size="sm"
                  variant="outline"
                  onClick={() => handleQuickAdd(symbol)}
                  className="text-xs"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {symbol}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {watchlist.map((item) => {
                const flows = whaleFlowsBySymbol[item.symbol] || [];
                const recentFlows = flows.filter(f => {
                  const age = Date.now() - new Date(f.detectedAt).getTime();
                  return age < 7 * 24 * 60 * 60 * 1000; // Last 7 days
                });
                const megaWhales = recentFlows.filter(f => f.isMegaWhale);
                const hasWhaleActivity = recentFlows.length > 0;

                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border transition-all",
                      hasWhaleActivity
                        ? "bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/20"
                        : "bg-card/50 border-border/50 hover:bg-card"
                    )}
                    data-testid={`watchlist-item-${item.symbol}`}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-lg">{item.symbol}</span>

                          {/* Whale Activity Indicators */}
                          {megaWhales.length > 0 && (
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge variant="outline" className="bg-purple-600/30 text-purple-300 border-purple-500/50 text-xs">
                                  🐋🐋 {megaWhales.length}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">{megaWhales.length} mega whale flow(s) detected</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {recentFlows.length > 0 && megaWhales.length === 0 && (
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge variant="outline" className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-xs">
                                  🐋 {recentFlows.length}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">{recentFlows.length} whale flow(s) detected</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>

                        {/* Price Info */}
                        {item.currentPrice && (
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-mono font-medium">
                              ${item.currentPrice.toFixed(2)}
                            </span>
                            {item.priceChangePercent !== undefined && (
                              <span className={cn("text-xs font-mono flex items-center", getPriceChangeColor(item.priceChangePercent))}>
                                {item.priceChangePercent >= 0 ? (
                                  <TrendingUp className="h-3 w-3 mr-0.5" />
                                ) : (
                                  <TrendingDown className="h-3 w-3 mr-0.5" />
                                )}
                                {Math.abs(item.priceChangePercent).toFixed(2)}%
                              </span>
                            )}
                          </div>
                        )}

                        {/* Recent Whale Flow Details */}
                        {recentFlows.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {recentFlows.slice(0, 2).map((flow) => (
                              <div key={flow.id} className="text-xs text-muted-foreground flex items-center gap-2">
                                <Badge
                                  variant="outline"
                                  className={flow.optionType === 'call' ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}
                                >
                                  {flow.optionType.toUpperCase()}
                                </Badge>
                                <span>${flow.strikePrice}</span>
                                <span>•</span>
                                <span>{formatPremium(flow.premiumPerContract)}</span>
                                <span>•</span>
                                <span>{formatDistanceToNow(new Date(flow.detectedAt), { addSuffix: true })}</span>
                              </div>
                            ))}
                            {recentFlows.length > 2 && (
                              <p className="text-xs text-purple-400">
                                +{recentFlows.length - 2} more flow(s)
                              </p>
                            )}
                          </div>
                        )}

                        {/* User Notes */}
                        {item.notes && !hasWhaleActivity && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {item.notes}
                          </p>
                        )}
                      </div>
                    </div>

                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeSymbolMutation.mutate(item.id)}
                      disabled={removeSymbolMutation.isPending}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
