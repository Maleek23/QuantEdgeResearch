import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Zap,
  Brain,
  BarChart3,
  Bell,
  Info,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { EngineHealthAlert } from "@shared/schema";

interface EngineMetrics {
  ideasGenerated: number;
  ideasPublished: number;
  tradesResolved: number;
  tradesWon: number;
  tradesLost: number;
  tradesExpired: number;
  winRate: number | null;
  avgGainPercent: number | null;
  avgLossPercent: number | null;
  expectancy: number | null;
  avgHoldingTimeMinutes: number | null;
  avgConfidenceScore: number | null;
}

interface EngineHealthData {
  todayMetrics: Record<string, EngineMetrics>;
  weekMetrics: Record<string, EngineMetrics>;
  historicalMetrics: Array<{
    date: string;
    engine: string;
    winRate: number | null;
  }>;
  activeAlerts: EngineHealthAlert[];
}

interface TrendDataPoint {
  date: string;
  dateLabel: string;
  flow: number | null;
  lotto: number | null;
  quant: number | null;
  ai: number | null;
}

interface CalibrationBand {
  band: string;
  bandLabel: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
}

const ENGINE_CONFIG = {
  flow: { label: "Flow Scanner", icon: Activity, color: "hsl(142, 76%, 45%)" },
  lotto: { label: "Lotto Detector", icon: Zap, color: "hsl(45, 93%, 58%)" },
  quant: { label: "Quant Engine", icon: BarChart3, color: "hsl(280, 70%, 60%)" },
  ai: { label: "AI Engine", icon: Brain, color: "hsl(217, 91%, 60%)" },
} as const;

type EngineKey = keyof typeof ENGINE_CONFIG;

function getWinRateColor(winRate: number | null): string {
  if (winRate === null) return "text-muted-foreground";
  if (winRate >= 60) return "text-green-500";
  if (winRate >= 50) return "text-yellow-500";
  return "text-red-500";
}

function getWinRateBadgeVariant(winRate: number | null): "default" | "secondary" | "destructive" | "outline" {
  if (winRate === null) return "secondary";
  if (winRate >= 60) return "default";
  if (winRate >= 50) return "outline";
  return "destructive";
}

function getSeverityIcon(severity: string) {
  switch (severity) {
    case "critical":
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    case "warning":
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    default:
      return <Info className="h-4 w-4 text-blue-500" />;
  }
}

function getSeverityBadgeClass(severity: string): string {
  switch (severity) {
    case "critical":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    case "warning":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    default:
      return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  }
}

function EngineSummaryCard({
  engineKey,
  todayMetrics,
  weekMetrics,
  alertCount,
}: {
  engineKey: EngineKey;
  todayMetrics: EngineMetrics | undefined;
  weekMetrics: EngineMetrics | undefined;
  alertCount: number;
}) {
  const config = ENGINE_CONFIG[engineKey];
  const Icon = config.icon;

  const todayIdeas = todayMetrics?.ideasGenerated ?? 0;
  const weekIdeas = weekMetrics?.ideasGenerated ?? 0;
  const winRate = weekMetrics?.winRate ?? null;
  const expectancy = weekMetrics?.expectancy ?? null;

  return (
    <Card className="glass-card" data-testid={`card-engine-${engineKey}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-2">
          <div
            className="p-2 rounded-lg"
            style={{ backgroundColor: `${config.color}20` }}
          >
            <Icon className="h-4 w-4" style={{ color: config.color }} />
          </div>
          <CardTitle className="text-base font-semibold">{config.label}</CardTitle>
        </div>
        {alertCount > 0 && (
          <Badge
            variant="destructive"
            className="text-xs"
            data-testid={`badge-alert-count-${engineKey}`}
          >
            <Bell className="h-3 w-3 mr-1" />
            {alertCount}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Today</p>
            <p className="text-lg font-mono font-semibold" data-testid={`text-today-ideas-${engineKey}`}>
              {todayIdeas}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">7 Days</p>
            <p className="text-lg font-mono font-semibold" data-testid={`text-week-ideas-${engineKey}`}>
              {weekIdeas}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <div>
            <p className="text-xs text-muted-foreground">Win Rate</p>
            <p
              className={cn("text-lg font-mono font-bold", getWinRateColor(winRate))}
              data-testid={`text-win-rate-${engineKey}`}
            >
              {winRate !== null ? `${winRate.toFixed(1)}%` : "N/A"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Expectancy</p>
            <p
              className={cn(
                "text-lg font-mono font-bold",
                expectancy !== null && expectancy > 0 ? "text-green-500" : expectancy !== null && expectancy < 0 ? "text-red-500" : "text-muted-foreground"
              )}
              data-testid={`text-expectancy-${engineKey}`}
            >
              {expectancy !== null ? `${expectancy > 0 ? "+" : ""}${expectancy.toFixed(2)}%` : "N/A"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TrendsChart({ data }: { data: TrendDataPoint[] }) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="font-semibold text-sm mb-2">{label}</p>
          <div className="space-y-1 text-xs">
            {payload.map((entry: any) => (
              <p key={entry.name} style={{ color: entry.color }}>
                <span className="font-semibold">{entry.name.toUpperCase()}:</span>{" "}
                <span className="font-mono">
                  {entry.value !== null ? `${entry.value.toFixed(1)}%` : "N/A"}
                </span>
              </p>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="glass-card" data-testid="card-trends-chart">
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-cyan-400" />
          <CardTitle>Performance Trends (Last 30 Days)</CardTitle>
        </div>
        <CardDescription>Win rate comparison across trading engines</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis
                dataKey="dateLabel"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                label={{
                  value: "Win Rate %",
                  angle: -90,
                  position: "insideLeft",
                  style: { fill: "hsl(var(--muted-foreground))" },
                }}
                domain={[0, 100]}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ paddingTop: "20px" }} iconType="line" formatter={(value) => value.toUpperCase()} />
              <Line
                type="monotone"
                dataKey="flow"
                stroke={ENGINE_CONFIG.flow.color}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                name="flow"
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="lotto"
                stroke={ENGINE_CONFIG.lotto.color}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                name="lotto"
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="quant"
                stroke={ENGINE_CONFIG.quant.color}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                name="quant"
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="ai"
                stroke={ENGINE_CONFIG.ai.color}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                name="ai"
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function ConfidenceCalibrationSection() {
  const { data, isLoading } = useQuery<CalibrationBand[]>({
    queryKey: ["/api/performance/confidence-calibration"],
    staleTime: 60000,
  });

  const qualityBands = [
    { band: "A", expectedWinRate: 75 },
    { band: "B+", expectedWinRate: 65 },
    { band: "B", expectedWinRate: 55 },
    { band: "C+", expectedWinRate: 45 },
    { band: "C", expectedWinRate: 35 },
  ];

  if (isLoading) {
    return (
      <Card className="glass-card" data-testid="card-calibration-loading">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card" data-testid="card-confidence-calibration">
      <CardHeader>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-cyan-400" />
          <CardTitle>Confidence Calibration</CardTitle>
        </div>
        <CardDescription>Expected vs actual win rate by quality band</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {qualityBands.map((qb) => {
            const bandData = data?.find((d) => d.bandLabel === qb.band || d.band === qb.band);
            const actualWinRate = bandData?.winRate ?? null;
            const trades = bandData?.trades ?? 0;
            const diff = actualWinRate !== null ? actualWinRate - qb.expectedWinRate : null;
            const isMiscalibrated = diff !== null && Math.abs(diff) > 15;

            return (
              <div
                key={qb.band}
                className={cn(
                  "p-3 rounded-lg border text-center",
                  isMiscalibrated
                    ? "border-yellow-500/50 bg-yellow-500/10"
                    : "border-border/50 bg-muted/20"
                )}
                data-testid={`calibration-band-${qb.band}`}
              >
                <p className="font-bold text-lg">{qb.band}</p>
                <div className="mt-2 space-y-1 text-xs">
                  <p className="text-muted-foreground">
                    Expected: <span className="font-mono">{qb.expectedWinRate}%</span>
                  </p>
                  <p className={cn(actualWinRate !== null && isMiscalibrated ? "text-yellow-500 font-semibold" : "")}>
                    Actual:{" "}
                    <span className="font-mono">
                      {actualWinRate !== null ? `${actualWinRate.toFixed(1)}%` : "N/A"}
                    </span>
                  </p>
                  <p className="text-muted-foreground mt-1">{trades} trades</p>
                </div>
                {isMiscalibrated && (
                  <Badge className="mt-2 bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">
                    Miscalibrated
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function HealthAlertsSection({
  alerts,
  isAdmin,
}: {
  alerts: EngineHealthAlert[];
  isAdmin: boolean;
}) {
  const { toast } = useToast();

  const acknowledgeMutation = useMutation({
    mutationFn: async (alertId: string) => {
      return await apiRequest("POST", `/api/engine-health/alerts/${alertId}/acknowledge`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/engine-health"] });
      toast({
        title: "Alert Acknowledged",
        description: "The alert has been acknowledged successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Acknowledge",
        description: error.message || "Could not acknowledge the alert.",
        variant: "destructive",
      });
    },
  });

  if (alerts.length === 0) {
    return (
      <Card className="glass-card" data-testid="card-alerts-empty">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-cyan-400" />
            <CardTitle>Active Health Alerts</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <p>No active alerts. All engines are operating normally.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card" data-testid="card-health-alerts">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-cyan-400" />
          <CardTitle>Active Health Alerts</CardTitle>
          <Badge variant="destructive" className="ml-2">
            {alerts.length}
          </Badge>
        </div>
        <CardDescription>Issues detected that may require attention</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg border",
                alert.severity === "critical"
                  ? "border-red-500/30 bg-red-500/10"
                  : alert.severity === "warning"
                  ? "border-yellow-500/30 bg-yellow-500/10"
                  : "border-blue-500/30 bg-blue-500/10"
              )}
              data-testid={`alert-item-${alert.id}`}
            >
              <div className="pt-0.5">{getSeverityIcon(alert.severity)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={cn("text-xs border", getSeverityBadgeClass(alert.severity))}>
                    {alert.severity.toUpperCase()}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {alert.engine.toUpperCase()}
                  </Badge>
                </div>
                <p className="mt-1 text-sm" data-testid={`alert-message-${alert.id}`}>
                  {alert.message}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {alert.createdAt ? format(new Date(alert.createdAt), "MMM d, yyyy h:mm a") : "Unknown time"}
                </p>
              </div>
              {isAdmin && !alert.acknowledged && (
                <Button
                  variant="glass-secondary"
                  size="sm"
                  onClick={() => acknowledgeMutation.mutate(alert.id)}
                  disabled={acknowledgeMutation.isPending}
                  data-testid={`button-acknowledge-${alert.id}`}
                >
                  {acknowledgeMutation.isPending ? "..." : "Acknowledge"}
                </Button>
              )}
              {alert.acknowledged && (
                <Badge variant="outline" className="text-xs text-green-500 border-green-500/30">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Acknowledged
                </Badge>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function EngineHealthPage() {
  const { user } = useAuth();
  const isAdmin = !!(user as any)?.isAdmin || (user as any)?.role === "admin";

  const { data, isLoading, error } = useQuery<EngineHealthData>({
    queryKey: ["/api/engine-health"],
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const transformedTrendData = (): TrendDataPoint[] => {
    if (!data?.historicalMetrics) return [];

    const grouped: Record<string, TrendDataPoint> = {};

    data.historicalMetrics.forEach((m) => {
      if (!grouped[m.date]) {
        grouped[m.date] = {
          date: m.date,
          dateLabel: format(new Date(m.date), "MMM d"),
          flow: null,
          lotto: null,
          quant: null,
          ai: null,
        };
      }
      const engine = m.engine as EngineKey;
      if (engine in ENGINE_CONFIG) {
        grouped[m.date][engine] = m.winRate;
      }
    });

    return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
  };

  const getAlertCountForEngine = (engineKey: EngineKey): number => {
    return data?.activeAlerts?.filter((a) => a.engine === engineKey && !a.acknowledged).length ?? 0;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-64" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card className="glass-card border-red-500/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-red-400">
              <AlertCircle className="h-6 w-6" />
              <div>
                <p className="font-semibold">Failed to load engine health data</p>
                <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const engines: EngineKey[] = ["flow", "lotto", "quant", "ai"];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="relative overflow-hidden rounded-xl glass-card p-6">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-purple-500/10" />
        <div className="relative z-10">
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            Engine Health Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor performance and health metrics across all trading engines
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {engines.map((engineKey) => (
          <EngineSummaryCard
            key={engineKey}
            engineKey={engineKey}
            todayMetrics={data?.todayMetrics?.[engineKey]}
            weekMetrics={data?.weekMetrics?.[engineKey]}
            alertCount={getAlertCountForEngine(engineKey)}
          />
        ))}
      </div>

      <TrendsChart data={transformedTrendData()} />

      <ConfidenceCalibrationSection />

      <HealthAlertsSection alerts={data?.activeAlerts ?? []} isAdmin={isAdmin} />
    </div>
  );
}
