import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Shield, TrendingUp, TrendingDown, Activity, DollarSign } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";

interface PortfolioRiskMetrics {
  accountSize: number;
  totalExposure: number;
  exposurePercent: number;
  totalRisk: number;
  riskPercent: number;
  openPositions: number;
  maxPositions: number;
  todayPnL: number;
  todayPnLPercent: number;
  currentAccountValue: number;
  drawdown: number;
  circuitBreakerTriggered: boolean;
  tradingPaused: boolean;
}

export function PortfolioRiskCard() {
  const { data: metrics, isLoading } = useQuery<PortfolioRiskMetrics>({
    queryKey: ['/api/portfolio-risk'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <Card data-testid="card-portfolio-risk">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-500" />
            <CardTitle className="text-lg">Portfolio Risk Overview</CardTitle>
          </div>
          <CardDescription>Real-time risk management & exposure tracking</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!metrics) return null;

  const isProfitable = metrics.todayPnL >= 0;
  const isDrawdownDangerous = metrics.drawdown < -5; // Warn at -5% drawdown
  const isExposureHigh = metrics.exposurePercent > 60; // Warn at 60% exposure
  const isRiskHigh = metrics.riskPercent > 3; // Warn at 3% total risk

  return (
    <Card 
      className={cn(
        "border-2 transition-all",
        metrics.circuitBreakerTriggered && "border-red-500 bg-red-500/5"
      )}
      data-testid="card-portfolio-risk"
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Shield className={cn(
              "h-5 w-5",
              metrics.circuitBreakerTriggered ? "text-red-500" : "text-blue-500"
            )} />
            <CardTitle className="text-lg">Portfolio Risk Overview</CardTitle>
          </div>
          {metrics.circuitBreakerTriggered && (
            <Badge variant="destructive" className="gap-1" data-testid="badge-trading-paused">
              <AlertTriangle className="h-3 w-3" />
              TRADING PAUSED
            </Badge>
          )}
        </div>
        <CardDescription>Real-time risk management & exposure tracking</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Circuit Breaker Warning */}
        {metrics.circuitBreakerTriggered && (
          <div className="rounded-lg border border-red-500 bg-red-500/10 p-4" data-testid="alert-circuit-breaker">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5" />
              <div>
                <h4 className="font-semibold text-red-500 mb-1">Circuit Breaker Triggered</h4>
                <p className="text-sm text-muted-foreground">
                  Account drawdown has exceeded -10%. Idea generation is paused to protect capital.
                  Review your open positions and close losing trades before resuming.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Account Value */}
          <div className="space-y-1" data-testid="metric-account-value">
            <div className="text-xs text-muted-foreground">Account Value</div>
            <div className="text-lg font-bold font-mono">
              {formatCurrency(metrics.currentAccountValue)}
            </div>
            <div className={cn(
              "text-xs font-medium",
              isDrawdownDangerous ? "text-red-500" : "text-muted-foreground"
            )}>
              {metrics.drawdown >= 0 ? '+' : ''}{metrics.drawdown.toFixed(1)}% from peak
            </div>
          </div>

          {/* Today's P&L */}
          <div className="space-y-1" data-testid="metric-today-pnl">
            <div className="text-xs text-muted-foreground">Today's P&L</div>
            <div className={cn(
              "text-lg font-bold font-mono flex items-center gap-1",
              isProfitable ? "text-green-500" : "text-red-500"
            )}>
              {isProfitable ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {formatCurrency(Math.abs(metrics.todayPnL))}
            </div>
            <div className={cn(
              "text-xs font-medium",
              isProfitable ? "text-green-500" : "text-red-500"
            )}>
              {isProfitable ? '+' : '-'}{Math.abs(metrics.todayPnLPercent).toFixed(1)}%
            </div>
          </div>

          {/* Open Positions */}
          <div className="space-y-1" data-testid="metric-open-positions">
            <div className="text-xs text-muted-foreground">Open Positions</div>
            <div className="text-lg font-bold font-mono">
              {metrics.openPositions} / {metrics.maxPositions}
            </div>
            <div className="text-xs text-muted-foreground">
              {metrics.maxPositions - metrics.openPositions} slots available
            </div>
          </div>

          {/* Total Exposure */}
          <div className="space-y-1" data-testid="metric-total-exposure">
            <div className="text-xs text-muted-foreground">Capital Deployed</div>
            <div className="text-lg font-bold font-mono">
              {formatCurrency(metrics.totalExposure)}
            </div>
            <div className={cn(
              "text-xs font-medium",
              isExposureHigh ? "text-amber-500" : "text-muted-foreground"
            )}>
              {metrics.exposurePercent.toFixed(1)}% of account
            </div>
          </div>
        </div>

        {/* Risk Exposure Progress Bars */}
        <div className="space-y-4">
          {/* Capital Exposure Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Capital Exposure</span>
              </div>
              <span className={cn(
                "text-sm font-mono font-bold",
                isExposureHigh && "text-amber-500"
              )}>
                {metrics.exposurePercent.toFixed(1)}%
              </span>
            </div>
            <Progress 
              value={metrics.exposurePercent} 
              className="h-2"
              data-testid="progress-exposure"
            />
            {isExposureHigh && (
              <p className="text-xs text-amber-500">
                High exposure - consider closing positions before adding new trades
              </p>
            )}
          </div>

          {/* Risk Exposure Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Total Risk at Stops</span>
              </div>
              <span className={cn(
                "text-sm font-mono font-bold",
                isRiskHigh && "text-red-500"
              )}>
                {metrics.riskPercent.toFixed(1)}%
              </span>
            </div>
            <Progress 
              value={metrics.riskPercent} 
              max={5}
              className="h-2"
              data-testid="progress-risk"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Potential loss if all stops hit: {formatCurrency(metrics.totalRisk)}</span>
              {isRiskHigh && <span className="text-red-500 font-medium">Risk threshold exceeded</span>}
            </div>
          </div>
        </div>

        {/* Risk Guidelines */}
        <div className="rounded-lg border bg-card/50 p-3 space-y-1">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-semibold">Risk Guidelines</span>
          </div>
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p>• Keep total exposure below 80% of account</p>
            <p>• Limit risk to 5% maximum across all positions</p>
            <p>• Maximum {metrics.maxPositions} concurrent positions</p>
            <p>• Circuit breaker triggers at -10% drawdown</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
