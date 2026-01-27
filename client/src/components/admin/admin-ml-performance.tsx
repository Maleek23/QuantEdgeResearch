/**
 * Admin ML Performance Panel
 *
 * Shows comprehensive ML and self-learning metrics for admin analysis.
 * All raw metrics are here - users see simplified versions.
 *
 * Includes:
 * - Engine performance with Sharpe, Profit Factor, Expectancy
 * - Self-learning thresholds and adjustments
 * - ML calibration and diagnostics
 * - Feature importance analysis
 */

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  BarChart3,
  Gauge,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EngineMetrics {
  engine: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  expectancy: number;
  sharpeRatio: number;
  profitFactor: number;
  maxDrawdown: number;
  avgWinPercent: number;
  avgLossPercent: number;
}

interface MLHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  issues: string[];
  recommendations: string[];
}

interface CalibrationData {
  bins: Array<{
    binStart: number;
    binEnd: number;
    predictedConfidence: number;
    actualWinRate: number;
    sampleSize: number;
    isCalibrated: boolean;
  }>;
  brierScore: number;
  expectedCalibrationError: number;
  reliability: number;
  recommendations: string[];
}

// Helper to format metrics with color coding
function MetricValue({
  value,
  format = "number",
  goodThreshold,
  badThreshold,
  inverse = false,
}: {
  value: number;
  format?: "number" | "percent" | "ratio";
  goodThreshold?: number;
  badThreshold?: number;
  inverse?: boolean;
}) {
  let formatted: string;
  if (format === "percent") {
    formatted = `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  } else if (format === "ratio") {
    formatted = value === Infinity ? "∞" : value.toFixed(2);
  } else {
    formatted = value.toFixed(2);
  }

  let colorClass = "text-muted-foreground";
  if (goodThreshold !== undefined && badThreshold !== undefined) {
    if (inverse) {
      if (value <= goodThreshold) colorClass = "text-green-500";
      else if (value >= badThreshold) colorClass = "text-red-500";
      else colorClass = "text-yellow-500";
    } else {
      if (value >= goodThreshold) colorClass = "text-green-500";
      else if (value <= badThreshold) colorClass = "text-red-500";
      else colorClass = "text-yellow-500";
    }
  }

  return <span className={cn("font-mono font-semibold", colorClass)}>{formatted}</span>;
}

// Engine Performance Card
function EngineCard({ metrics }: { metrics: EngineMetrics }) {
  const isHealthy = metrics.expectancy > 0 && metrics.profitFactor >= 1 && metrics.sharpeRatio > -0.5;
  const isWarning = metrics.expectancy > 0 && (metrics.profitFactor < 1 || metrics.sharpeRatio < 0);

  return (
    <Card className={cn(
      "border-l-4",
      isHealthy ? "border-l-green-500" : isWarning ? "border-l-yellow-500" : "border-l-red-500"
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg capitalize flex items-center gap-2">
            {metrics.engine}
            {isHealthy ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : isWarning ? (
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500" />
            )}
          </CardTitle>
          <Badge variant="outline">
            {metrics.totalTrades.toLocaleString()} trades
          </Badge>
        </div>
        <CardDescription>
          {metrics.wins}W / {metrics.losses}L
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Win Rate</p>
            <MetricValue
              value={metrics.winRate}
              format="percent"
              goodThreshold={55}
              badThreshold={45}
            />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Expectancy</p>
            <MetricValue
              value={metrics.expectancy}
              format="percent"
              goodThreshold={1}
              badThreshold={0}
            />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Sharpe Ratio</p>
            <MetricValue
              value={metrics.sharpeRatio}
              format="ratio"
              goodThreshold={0.5}
              badThreshold={0}
            />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Profit Factor</p>
            <MetricValue
              value={metrics.profitFactor}
              format="ratio"
              goodThreshold={1.5}
              badThreshold={1}
            />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Max Drawdown</p>
            <MetricValue
              value={-metrics.maxDrawdown}
              format="percent"
              goodThreshold={-20}
              badThreshold={-50}
              inverse
            />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Avg Win / Loss</p>
            <span className="text-xs font-mono">
              <span className="text-green-500">+{metrics.avgWinPercent.toFixed(1)}%</span>
              {" / "}
              <span className="text-red-500">-{metrics.avgLossPercent.toFixed(1)}%</span>
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Calibration Bin Chart
function CalibrationChart({ bins }: { bins: CalibrationData["bins"] }) {
  return (
    <div className="space-y-2">
      {bins.filter(b => b.sampleSize > 0).map((bin) => (
        <div key={`${bin.binStart}-${bin.binEnd}`} className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-16">
            {bin.binStart}-{bin.binEnd}%
          </span>
          <div className="flex-1 relative h-6 bg-muted rounded">
            {/* Predicted (confidence) */}
            <div
              className="absolute h-full bg-blue-500/30 rounded"
              style={{ width: `${bin.predictedConfidence}%` }}
            />
            {/* Actual (win rate) */}
            <div
              className={cn(
                "absolute h-full rounded",
                bin.isCalibrated ? "bg-green-500/50" : "bg-red-500/50"
              )}
              style={{ width: `${bin.actualWinRate}%` }}
            />
          </div>
          <div className="text-xs font-mono w-24 text-right">
            {bin.actualWinRate.toFixed(0)}% ({bin.sampleSize})
          </div>
        </div>
      ))}
      <div className="flex gap-4 text-xs text-muted-foreground mt-2">
        <span className="flex items-center gap-1">
          <div className="w-3 h-3 bg-blue-500/30 rounded" /> Predicted
        </span>
        <span className="flex items-center gap-1">
          <div className="w-3 h-3 bg-green-500/50 rounded" /> Actual (calibrated)
        </span>
        <span className="flex items-center gap-1">
          <div className="w-3 h-3 bg-red-500/50 rounded" /> Actual (miscalibrated)
        </span>
      </div>
    </div>
  );
}

export function AdminMLPerformance() {
  // Fetch self-learning engine metrics
  const { data: engineMetrics, isLoading: metricsLoading, refetch: refetchMetrics } = useQuery({
    queryKey: ["/api/admin/ml/engine-metrics"],
    queryFn: async () => {
      const res = await fetch("/api/admin/ml/engine-metrics", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch engine metrics");
      return res.json() as Promise<EngineMetrics[]>;
    },
  });

  // Fetch ML health status
  const { data: mlHealth, isLoading: healthLoading } = useQuery({
    queryKey: ["/api/ml/health"],
    queryFn: async () => {
      const res = await fetch("/api/ml/health", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch ML health");
      return res.json() as Promise<MLHealth>;
    },
  });

  // Fetch calibration data
  const { data: calibration, isLoading: calibrationLoading } = useQuery({
    queryKey: ["/api/performance/confidence-calibration"],
    queryFn: async () => {
      const res = await fetch("/api/performance/confidence-calibration", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch calibration");
      return res.json() as Promise<CalibrationData>;
    },
  });

  // Calculate aggregate metrics
  const aggregateMetrics = engineMetrics
    ? {
        totalTrades: engineMetrics.reduce((sum, e) => sum + e.totalTrades, 0),
        totalWins: engineMetrics.reduce((sum, e) => sum + e.wins, 0),
        totalLosses: engineMetrics.reduce((sum, e) => sum + e.losses, 0),
        avgExpectancy:
          engineMetrics.reduce((sum, e) => sum + e.expectancy * e.totalTrades, 0) /
          engineMetrics.reduce((sum, e) => sum + e.totalTrades, 0),
        healthyEngines: engineMetrics.filter(
          (e) => e.expectancy > 0 && e.profitFactor >= 1
        ).length,
        unhealthyEngines: engineMetrics.filter(
          (e) => e.expectancy < 0 || e.profitFactor < 1
        ).length,
      }
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6" />
            ML Performance Dashboard
          </h2>
          <p className="text-muted-foreground">
            Self-learning metrics, calibration, and engine health
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetchMetrics()}
          disabled={metricsLoading}
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", metricsLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* ML Health Status */}
      {healthLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : mlHealth ? (
        <Card className={cn(
          "border-l-4",
          mlHealth.status === "healthy" ? "border-l-green-500" :
          mlHealth.status === "degraded" ? "border-l-yellow-500" : "border-l-red-500"
        )}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" />
              ML System Health: {mlHealth.status.toUpperCase()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {mlHealth.issues.length > 0 && (
              <div className="mb-2">
                <p className="text-sm font-medium text-red-500">Issues:</p>
                <ul className="text-sm text-muted-foreground list-disc list-inside">
                  {mlHealth.issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
            {mlHealth.recommendations.length > 0 && (
              <div>
                <p className="text-sm font-medium text-blue-500">Recommendations:</p>
                <ul className="text-sm text-muted-foreground list-disc list-inside">
                  {mlHealth.recommendations.map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}
            {mlHealth.issues.length === 0 && (
              <p className="text-sm text-green-500 flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" />
                All systems operational
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Aggregate Stats */}
      {aggregateMetrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Total Trades</span>
              </div>
              <p className="text-2xl font-bold">{aggregateMetrics.totalTrades.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                <span className="text-sm text-muted-foreground">Total Wins</span>
              </div>
              <p className="text-2xl font-bold text-green-500">
                {aggregateMetrics.totalWins.toLocaleString()}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-500" />
                <span className="text-sm text-muted-foreground">Total Losses</span>
              </div>
              <p className="text-2xl font-bold text-red-500">
                {aggregateMetrics.totalLosses.toLocaleString()}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Avg Expectancy</span>
              </div>
              <p className={cn(
                "text-2xl font-bold",
                aggregateMetrics.avgExpectancy >= 0 ? "text-green-500" : "text-red-500"
              )}>
                {aggregateMetrics.avgExpectancy >= 0 ? "+" : ""}
                {aggregateMetrics.avgExpectancy.toFixed(2)}%
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Engine Performance Grid */}
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Engine Performance (Self-Learning Metrics)
        </h3>
        {metricsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-48 w-full" />
            ))}
          </div>
        ) : engineMetrics && engineMetrics.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {engineMetrics
              .sort((a, b) => b.totalTrades - a.totalTrades)
              .map((metrics) => (
                <EngineCard key={metrics.engine} metrics={metrics} />
              ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No engine metrics available. Run a learning cycle first.
            </CardContent>
          </Card>
        )}
      </div>

      {/* Calibration Analysis */}
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Confidence Calibration
        </h3>
        {calibrationLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : calibration ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Calibration by Confidence Bin</CardTitle>
                <CardDescription>
                  Predicted confidence vs actual win rate
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CalibrationChart bins={calibration.bins} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Calibration Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground">Brier Score (lower = better)</p>
                  <div className="flex items-center gap-2">
                    <Progress
                      value={Math.max(0, 100 - calibration.brierScore * 400)}
                      className="flex-1"
                    />
                    <span className="font-mono text-sm">{calibration.brierScore.toFixed(3)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {calibration.brierScore < 0.15
                      ? "Good calibration"
                      : calibration.brierScore < 0.2
                      ? "Moderate calibration"
                      : "Poor calibration"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Expected Calibration Error</p>
                  <div className="flex items-center gap-2">
                    <Progress
                      value={Math.max(0, 100 - calibration.expectedCalibrationError * 2)}
                      className="flex-1"
                    />
                    <span className="font-mono text-sm">
                      {calibration.expectedCalibrationError.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Reliability Score</p>
                  <div className="flex items-center gap-2">
                    <Progress value={calibration.reliability} className="flex-1" />
                    <span className="font-mono text-sm">{calibration.reliability.toFixed(0)}%</span>
                  </div>
                </div>
                {calibration.recommendations.length > 0 && (
                  <div className="pt-2 border-t">
                    <p className="text-xs font-medium mb-1">Recommendations:</p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      {calibration.recommendations.slice(0, 3).map((rec, i) => (
                        <li key={i}>• {rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No calibration data available.
            </CardContent>
          </Card>
        )}
      </div>

      {/* Legend / Guide */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-sm">Metrics Guide</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-2">
          <p>
            <strong>Sharpe Ratio:</strong> Risk-adjusted return. {">"}0.5 is good, {">"}1.0 is
            excellent, {"<"}0 means returns don't justify risk.
          </p>
          <p>
            <strong>Profit Factor:</strong> Gross profit / Gross loss. {">"}1.5 is good, {"<"}1
            means losing money.
          </p>
          <p>
            <strong>Expectancy:</strong> Expected return per trade. Positive = profitable system.
          </p>
          <p>
            <strong>Brier Score:</strong> Measures calibration accuracy. 0 = perfect, 0.25 =
            random guessing.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default AdminMLPerformance;
