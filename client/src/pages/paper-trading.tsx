import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { PaperPortfolio, PaperPosition, PaperEquitySnapshot } from "@shared/schema";
import {
  TrendingUp,
  TrendingDown,
  Plus,
  RefreshCw,
  ChevronDown,
  DollarSign,
  Target,
  Wallet,
  Trophy,
  XCircle,
  Activity,
  Settings,
  X,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface PortfolioWithPositions extends PaperPortfolio {
  positions: PaperPosition[];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function PnLDisplay({ value, percent, showPercent = true }: { value: number; percent?: number; showPercent?: boolean }) {
  const isProfit = value >= 0;
  return (
    <span className={cn("font-mono font-medium tabular-nums", isProfit ? "text-green-400" : "text-red-400")}>
      {isProfit ? "+" : ""}
      {formatCurrency(value)}
      {showPercent && percent !== undefined && (
        <span className="text-xs ml-1">({formatPercent(percent)})</span>
      )}
    </span>
  );
}

function DirectionBadge({ direction }: { direction: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs",
        direction === "long" 
          ? "bg-green-500/10 text-green-400 border-green-500/30" 
          : "bg-red-500/10 text-red-400 border-red-500/30"
      )}
    >
      {direction === "long" ? "Long" : "Short"}
    </Badge>
  );
}

function AssetTypeBadge({ assetType }: { assetType: string }) {
  const variants: Record<string, string> = {
    stock: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    option: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    crypto: "bg-green-500/20 text-green-400 border-green-500/30",
    penny_stock: "bg-red-500/20 text-red-400 border-red-500/30",
    future: "bg-cyan-600/20 text-cyan-300 border-cyan-400/30",
  };
  return (
    <Badge variant="outline" className={cn("text-xs", variants[assetType] || "")}>
      {assetType.replace("_", " ")}
    </Badge>
  );
}

function PortfolioSummaryCard({
  portfolio,
  onSettingsChange,
  onRefreshPrices,
  isRefreshing,
}: {
  portfolio: PortfolioWithPositions;
  onSettingsChange: (settings: Partial<PaperPortfolio>) => void;
  onRefreshPrices: () => void;
  isRefreshing: boolean;
}) {
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [maxPositionSize, setMaxPositionSize] = useState(portfolio.maxPositionSize?.toString() || "5000");

  const openPositions = portfolio.positions.filter((p) => p.status === "open");
  const positionsValue = openPositions.reduce((sum, p) => {
    const multiplier = p.assetType === "option" ? 100 : 1;
    return sum + (p.currentPrice || p.entryPrice) * p.quantity * multiplier;
  }, 0);
  const totalValue = portfolio.cashBalance + positionsValue;
  const totalUnrealizedPnL = openPositions.reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0);

  const handleMaxPositionSave = () => {
    const value = parseFloat(maxPositionSize);
    if (!isNaN(value) && value > 0) {
      onSettingsChange({ maxPositionSize: value });
      setIsEditingSettings(false);
    }
  };

  return (
    <Card className="glass-card" data-testid="card-portfolio-summary">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/10 flex items-center justify-center border border-green-500/20">
            <DollarSign className="h-5 w-5 text-green-400" />
          </div>
          <div>
            <CardTitle className="text-xl font-semibold">{portfolio.name}</CardTitle>
            <CardDescription>Virtual Trading Portfolio</CardDescription>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefreshPrices}
          disabled={isRefreshing}
          className="border-slate-700"
          data-testid="button-refresh-prices"
        >
          <RefreshCw className={cn("h-4 w-4 mr-1", isRefreshing && "animate-spin")} />
          Refresh Prices
        </Button>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-4">
          <div className="stat-glass rounded-lg p-4 min-w-[140px] flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1 truncate">Total Value</p>
            <p className="text-xl font-bold font-mono tabular-nums" data-testid="text-total-value">
              {formatCurrency(totalValue)}
            </p>
          </div>
          <div className="stat-glass rounded-lg p-4 min-w-[150px] flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1 truncate">Cash / Positions</p>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="font-mono text-sm" data-testid="text-cash-balance">{formatCurrency(portfolio.cashBalance)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="font-mono text-sm" data-testid="text-positions-value">{formatCurrency(positionsValue)}</span>
              </div>
            </div>
          </div>
          <div className="stat-glass rounded-lg p-4 min-w-[120px] flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1 truncate">Total P&L</p>
            <p className="text-lg font-bold" data-testid="text-total-pnl">
              <PnLDisplay
                value={portfolio.totalPnL + totalUnrealizedPnL}
                percent={((portfolio.totalPnL + totalUnrealizedPnL) / portfolio.startingCapital) * 100}
              />
            </p>
          </div>
          <div className="stat-glass rounded-lg p-4 min-w-[140px] flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1 truncate">Win/Loss</p>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                <Trophy className="h-4 w-4 text-green-400" />
                <span className="font-bold font-mono text-green-400" data-testid="text-win-count">{portfolio.winCount}</span>
              </div>
              <span className="text-muted-foreground">/</span>
              <div className="flex items-center gap-1">
                <XCircle className="h-4 w-4 text-red-400" />
                <span className="font-bold font-mono text-red-400" data-testid="text-loss-count">{portfolio.lossCount}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <Switch
              id="auto-execute"
              checked={portfolio.autoExecute || false}
              onCheckedChange={(checked) => onSettingsChange({ autoExecute: checked })}
              data-testid="switch-auto-execute"
            />
            <Label htmlFor="auto-execute" className="cursor-pointer">
              Auto-Execute Signals
            </Label>
          </div>

          <div className="flex items-center gap-3">
            <Settings className="h-4 w-4 text-muted-foreground" />
            {isEditingSettings ? (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={maxPositionSize}
                  onChange={(e) => setMaxPositionSize(e.target.value)}
                  className="w-28 h-8"
                  data-testid="input-max-position"
                />
                <Button size="sm" variant="glass" onClick={handleMaxPositionSave} data-testid="button-save-settings">
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setIsEditingSettings(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setIsEditingSettings(true)}
                className="text-sm text-muted-foreground hover:text-foreground"
                data-testid="button-edit-max-position"
              >
                Max Position: <span className="font-mono">{formatCurrency(portfolio.maxPositionSize || 5000)}</span>
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OpenPositionsSection({
  positions,
  onClosePosition,
  isClosing,
}: {
  positions: PaperPosition[];
  onClosePosition: (positionId: string) => void;
  isClosing: boolean;
}) {
  const openPositions = positions.filter((p) => p.status === "open");

  if (openPositions.length === 0) {
    return (
      <Card className="glass-card" data-testid="card-open-positions">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
              <Activity className="h-4 w-4 text-cyan-400" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Positions</p>
              <CardTitle className="text-lg font-semibold">Open Positions</CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">No Open Positions</p>
            <p className="text-sm mt-1">Study research briefs from the Research Desk to start paper trading</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card" data-testid="card-open-positions">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
            <Activity className="h-4 w-4 text-cyan-400" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Positions</p>
            <CardTitle className="text-lg font-semibold">Open Positions ({openPositions.length})</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead className="text-right">Entry</TableHead>
                <TableHead className="text-right">Current</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">P&L</TableHead>
                <TableHead className="text-right">Target / Stop</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {openPositions.map((position) => (
                <TableRow key={position.id} data-testid={`row-position-${position.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-bold font-mono">{position.symbol}</span>
                      <AssetTypeBadge assetType={position.assetType} />
                    </div>
                    {position.optionType && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {position.strikePrice} {position.optionType?.toUpperCase()} {position.expiryDate}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <DirectionBadge direction={position.direction} />
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(position.entryPrice)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {position.currentPrice ? formatCurrency(position.currentPrice) : "-"}
                  </TableCell>
                  <TableCell className="text-right font-mono">{position.quantity}</TableCell>
                  <TableCell className="text-right">
                    <PnLDisplay
                      value={position.unrealizedPnL || 0}
                      percent={position.unrealizedPnLPercent || 0}
                    />
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    <div className="flex items-center justify-end gap-1">
                      <Target className="h-3 w-3 text-green-500" />
                      <span className="font-mono text-green-500">
                        {position.targetPrice ? formatCurrency(position.targetPrice) : "-"}
                      </span>
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      <XCircle className="h-3 w-3 text-red-500" />
                      <span className="font-mono text-red-500">
                        {position.stopLoss ? formatCurrency(position.stopLoss) : "-"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => onClosePosition(position.id)}
                      disabled={isClosing}
                      data-testid={`button-close-position-${position.id}`}
                    >
                      Close
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function ClosedPositionsSection({ positions }: { positions: PaperPosition[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const closedPositions = positions
    .filter((p) => p.status === "closed")
    .sort((a, b) => new Date(b.exitTime || "").getTime() - new Date(a.exitTime || "").getTime());

  if (closedPositions.length === 0) {
    return null;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="glass-card" data-testid="card-closed-positions">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover-elevate rounded-t-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center border border-green-500/20">
                  <TrendingUp className="h-4 w-4 text-green-400" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">History</p>
                  <CardTitle className="text-lg font-semibold">Closed Positions ({closedPositions.length})</CardTitle>
                </div>
              </div>
              <ChevronDown className={cn("h-5 w-5 transition-transform text-muted-foreground", isOpen && "rotate-180")} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="p-0">
            <ScrollArea className="w-full max-h-96">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead className="text-right">Entry</TableHead>
                    <TableHead className="text-right">Exit</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">P&L</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Exit Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closedPositions.map((position) => (
                    <TableRow key={position.id} data-testid={`row-closed-position-${position.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-bold font-mono">{position.symbol}</span>
                          <AssetTypeBadge assetType={position.assetType} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <DirectionBadge direction={position.direction} />
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(position.entryPrice)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {position.exitPrice ? formatCurrency(position.exitPrice) : "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono">{position.quantity}</TableCell>
                      <TableCell className="text-right">
                        <PnLDisplay
                          value={position.realizedPnL || 0}
                          percent={position.realizedPnLPercent || 0}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">
                          {position.exitReason?.replace("_", " ") || "manual"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {position.exitTime ? format(parseISO(position.exitTime), "MMM d, h:mm a") : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function EquityCurveChart({ portfolioId }: { portfolioId: string }) {
  const { data: equityData = [], isLoading } = useQuery<PaperEquitySnapshot[]>({
    queryKey: ["/api/paper/portfolios", portfolioId, "equity"],
    enabled: !!portfolioId,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Equity Curve</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (equityData.length === 0) {
    return (
      <Card className="glass-card" data-testid="card-equity-curve">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/10 flex items-center justify-center border border-green-500/20">
              <TrendingUp className="h-4 w-4 text-green-400" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Performance</p>
              <CardTitle className="text-lg font-semibold">Equity Curve</CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-center justify-center text-muted-foreground">
            <p>No equity data yet. Trade to see your performance over time.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = equityData.map((d) => ({
    date: d.date,
    value: d.totalValue,
  }));

  return (
    <Card className="glass-card" data-testid="card-equity-curve">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/10 flex items-center justify-center border border-green-500/20">
            <TrendingUp className="h-4 w-4 text-green-400" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Performance</p>
            <CardTitle className="text-lg font-semibold">Equity Curve</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickFormatter={(value) => format(parseISO(value), "MMM d")}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
                formatter={(value: number) => [formatCurrency(value), "Portfolio Value"]}
                labelFormatter={(label) => format(parseISO(label as string), "MMMM d, yyyy")}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function CreatePortfolioCard({ onCreate, isCreating }: { onCreate: () => void; isCreating: boolean }) {
  return (
    <Card className="glass-card border-dashed border-slate-700" data-testid="card-create-portfolio">
      <CardContent className="flex flex-col items-center justify-center py-16">
        <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/10 flex items-center justify-center border border-green-500/20 mb-4">
          <DollarSign className="h-8 w-8 text-green-400" />
        </div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
          Get Started
        </p>
        <h3 className="text-xl font-semibold mb-2">Start Paper Trading</h3>
        <p className="text-muted-foreground text-center max-w-md mb-6">
          Create a virtual portfolio with $100,000 to practice trading without risking real money.
          Test strategies and track your performance.
        </p>
        <Button 
          className="bg-cyan-500 hover:bg-cyan-400 text-slate-950" 
          onClick={onCreate} 
          disabled={isCreating} 
          size="lg" 
          data-testid="button-create-portfolio"
        >
          <Plus className="h-5 w-5 mr-2" />
          {isCreating ? "Creating..." : "Create Portfolio"}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function PaperTradingPage() {
  const { toast } = useToast();
  const [closingPositionId, setClosingPositionId] = useState<string | null>(null);

  const { data: portfolios = [], isLoading: portfoliosLoading } = useQuery<PaperPortfolio[]>({
    queryKey: ["/api/paper/portfolios"],
  });

  const primaryPortfolio = portfolios[0];

  const { data: portfolioWithPositions, isLoading: portfolioLoading } = useQuery<PortfolioWithPositions>({
    queryKey: ["/api/paper/portfolios", primaryPortfolio?.id],
    enabled: !!primaryPortfolio?.id,
  });

  const createPortfolioMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/paper/portfolios", { name: "My Paper Portfolio" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/paper/portfolios"] });
      toast({
        title: "Portfolio Created",
        description: "Your paper trading portfolio is ready with $100,000 virtual cash.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create portfolio",
        variant: "destructive",
      });
    },
  });

  const updatePortfolioMutation = useMutation({
    mutationFn: async (settings: Partial<PaperPortfolio>) => {
      return apiRequest("PATCH", `/api/paper/portfolios/${primaryPortfolio?.id}`, settings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/paper/portfolios", primaryPortfolio?.id] });
      toast({
        title: "Settings Updated",
        description: "Portfolio settings have been saved.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update settings",
        variant: "destructive",
      });
    },
  });

  const refreshPricesMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/paper/portfolios/${primaryPortfolio?.id}/update-prices`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/paper/portfolios", primaryPortfolio?.id] });
      toast({
        title: "Prices Updated",
        description: "Position prices have been refreshed.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to refresh prices",
        variant: "destructive",
      });
    },
  });

  const closePositionMutation = useMutation({
    mutationFn: async (positionId: string) => {
      setClosingPositionId(positionId);
      return apiRequest("POST", `/api/paper/positions/${positionId}/close`, { exitReason: "manual" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/paper/portfolios", primaryPortfolio?.id] });
      toast({
        title: "Position Closed",
        description: "Your position has been closed.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to close position",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setClosingPositionId(null);
    },
  });

  const isLoading = portfoliosLoading || portfolioLoading;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/10 flex items-center justify-center border border-green-500/20">
            <Wallet className="h-5 w-5 text-green-400" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Virtual Portfolio
            </p>
            <h1 className="text-2xl sm:text-3xl font-semibold" data-testid="text-page-title">
              Paper Trading Simulator
            </h1>
          </div>
        </div>
        <p className="text-muted-foreground mt-2 ml-13" data-testid="text-page-subtitle">
          Practice trading with virtual $100K - no risk
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : !primaryPortfolio ? (
        <CreatePortfolioCard
          onCreate={() => createPortfolioMutation.mutate()}
          isCreating={createPortfolioMutation.isPending}
        />
      ) : portfolioWithPositions ? (
        <div className="space-y-6">
          <PortfolioSummaryCard
            portfolio={portfolioWithPositions}
            onSettingsChange={(settings) => updatePortfolioMutation.mutate(settings)}
            onRefreshPrices={() => refreshPricesMutation.mutate()}
            isRefreshing={refreshPricesMutation.isPending}
          />

          <OpenPositionsSection
            positions={portfolioWithPositions.positions}
            onClosePosition={(id) => closePositionMutation.mutate(id)}
            isClosing={closePositionMutation.isPending}
          />

          <ClosedPositionsSection positions={portfolioWithPositions.positions} />

          <EquityCurveChart portfolioId={portfolioWithPositions.id} />
        </div>
      ) : null}
    </div>
  );
}
