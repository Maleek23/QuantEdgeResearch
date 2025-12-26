import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ActiveTrade, AssetType } from "@shared/schema";
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
  Calendar as CalendarIcon,
  Clock,
  Trash2,
  CheckCircle
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

const newTradeFormSchema = z.object({
  symbol: z.string().min(1, "Symbol is required").toUpperCase(),
  assetType: z.enum(["stock", "option", "crypto"]),
  optionType: z.enum(["call", "put"]).optional(),
  strikePrice: z.coerce.number().positive().optional(),
  expiryDate: z.date().optional(),
  entryPrice: z.coerce.number().positive("Entry price must be positive"),
  quantity: z.coerce.number().int().positive().default(1),
  direction: z.enum(["long", "short"]),
  targetPrice: z.coerce.number().positive().optional().or(z.literal("")),
  stopLoss: z.coerce.number().positive().optional().or(z.literal("")),
  notes: z.string().optional(),
});

type NewTradeFormValues = z.infer<typeof newTradeFormSchema>;

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

  const { data: trades = [], isLoading, refetch } = useQuery<ActiveTrade[]>({
    queryKey: ['/api/active-trades'],
    refetchInterval: 10000,
    staleTime: 5000,
    enabled: isAuthenticated,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setLastRefresh(new Date());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const openTrades = trades.filter(t => t.status === 'open');
  const closedTrades = trades.filter(t => t.status === 'closed');

  const newTradeForm = useForm<NewTradeFormValues>({
    resolver: zodResolver(newTradeFormSchema),
    defaultValues: {
      symbol: "",
      assetType: "stock",
      direction: "long",
      quantity: 1,
      entryPrice: 0,
      notes: "",
    },
  });

  const closeTradeForm = useForm<CloseTradeFormValues>({
    resolver: zodResolver(closeTradeFormSchema),
    defaultValues: {
      exitPrice: 0,
    },
  });

  const watchedAssetType = newTradeForm.watch("assetType");

  const createTradeMutation = useMutation({
    mutationFn: async (data: NewTradeFormValues) => {
      const payload = {
        symbol: data.symbol.toUpperCase(),
        assetType: data.assetType,
        direction: data.direction,
        entryPrice: data.entryPrice,
        quantity: data.quantity,
        entryTime: new Date().toISOString(),
        ...(data.assetType === "option" && {
          optionType: data.optionType,
          strikePrice: data.strikePrice,
          expiryDate: data.expiryDate ? format(data.expiryDate, "yyyy-MM-dd") : undefined,
        }),
        ...(data.targetPrice && typeof data.targetPrice === 'number' && { targetPrice: data.targetPrice }),
        ...(data.stopLoss && typeof data.stopLoss === 'number' && { stopLoss: data.stopLoss }),
        ...(data.notes && { notes: data.notes }),
      };
      return await apiRequest('POST', '/api/active-trades', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/active-trades'] });
      toast({ title: "Trade Added", description: "Your position has been recorded" });
      setIsNewTradeOpen(false);
      newTradeForm.reset();
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

  const handleNewTradeSubmit = (data: NewTradeFormValues) => {
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
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Position</DialogTitle>
                <DialogDescription>
                  Record a new trade entry for live tracking
                </DialogDescription>
              </DialogHeader>
              <Form {...newTradeForm}>
                <form onSubmit={newTradeForm.handleSubmit(handleNewTradeSubmit)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={newTradeForm.control}
                      name="symbol"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Symbol</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="AAPL" 
                              {...field} 
                              className="uppercase"
                              data-testid="input-symbol"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={newTradeForm.control}
                      name="assetType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Asset Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-asset-type">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="stock">Stock</SelectItem>
                              <SelectItem value="option">Option</SelectItem>
                              <SelectItem value="crypto">Crypto</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {watchedAssetType === "option" && (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={newTradeForm.control}
                          name="optionType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Option Type</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-option-type">
                                    <SelectValue placeholder="Select..." />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="call">Call</SelectItem>
                                  <SelectItem value="put">Put</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={newTradeForm.control}
                          name="strikePrice"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Strike Price</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number" 
                                  step="0.01"
                                  placeholder="150.00" 
                                  {...field} 
                                  data-testid="input-strike-price"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={newTradeForm.control}
                        name="expiryDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Expiry Date</FormLabel>
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    className={cn(
                                      "w-full pl-3 text-left font-normal",
                                      !field.value && "text-muted-foreground"
                                    )}
                                    data-testid="button-expiry-date"
                                  >
                                    {field.value ? format(field.value, "PPP") : "Pick a date"}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={field.value}
                                  onSelect={field.onChange}
                                  disabled={(date) => date < new Date()}
                                  data-testid="calendar-expiry"
                                />
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={newTradeForm.control}
                      name="direction"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Direction</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-direction">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="long">Long</SelectItem>
                              <SelectItem value="short">Short</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={newTradeForm.control}
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

                  <FormField
                    control={newTradeForm.control}
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

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={newTradeForm.control}
                      name="targetPrice"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Target Price (Optional)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              step="0.01"
                              placeholder="0.00" 
                              {...field}
                              value={field.value || ""}
                              data-testid="input-target-price"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={newTradeForm.control}
                      name="stopLoss"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Stop Loss (Optional)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              step="0.01"
                              placeholder="0.00" 
                              {...field}
                              value={field.value || ""}
                              data-testid="input-stop-loss"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={newTradeForm.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes (Optional)</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Trade thesis, catalyst, etc..."
                            className="resize-none"
                            {...field}
                            data-testid="textarea-notes"
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
                      onClick={() => setIsNewTradeOpen(false)}
                      data-testid="button-cancel-new-trade"
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={createTradeMutation.isPending}
                      data-testid="button-submit-new-trade"
                    >
                      {createTradeMutation.isPending ? "Adding..." : "Add Trade"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
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
