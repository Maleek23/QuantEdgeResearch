import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend, Area, ComposedChart } from "recharts";
import { AlertTriangle, CheckCircle, Target, TrendingUp, TrendingDown, Info } from "lucide-react";
import { cn, safeToFixed } from "@/lib/utils";

interface CalibrationPoint {
  confidenceRange: string;
  midpoint: number;
  predicted: number;
  actual: number;
  trades: number;
  wins: number;
  losses: number;
  avgPnL: number;
  calibrationError: number;
  isCalibrated: boolean;
}

interface CalibrationCurveData {
  calibrationCurve: CalibrationPoint[];
  summary: {
    totalTrades: number;
    avgCalibrationError: number;
    calibratedBuckets: number;
    totalBuckets: number;
    calibrationQuality: string;
    status: 'WELL_CALIBRATED' | 'NEEDS_ADJUSTMENT' | 'POORLY_CALIBRATED';
    brierScore?: number;
    brierSkillScore?: number;
    brierInterpretation?: string;
  };
}

function CustomTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const errorDir = data.calibrationError > 0 ? 'overconfident' : 'underconfident';
    
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
        <p className="font-semibold text-sm">Confidence Range: {data.confidenceRange}%</p>
        <div className="mt-2 space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-blue-500">Predicted:</span>
            <span className="font-mono">{safeToFixed(data.predicted, 1)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-500">Actual:</span>
            <span className="font-mono">{safeToFixed(data.actual, 1)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Error:</span>
            <span className={cn(
              "font-mono font-semibold",
              Math.abs(data.calibrationError) <= 10 ? "text-green-500" :
              Math.abs(data.calibrationError) <= 20 ? "text-amber-500" : "text-red-500"
            )}>
              {data.calibrationError > 0 ? '+' : ''}{safeToFixed(data.calibrationError, 1)}%
            </span>
            <span className="text-muted-foreground">({errorDir})</span>
          </div>
          <div className="border-t border-border pt-2 mt-2">
            <p className="text-muted-foreground">
              Trades: <span className="font-mono text-foreground">{data.trades}</span>
              {' '}({data.wins}W / {data.losses}L)
            </p>
            <p className="text-muted-foreground">
              Avg P&L: <span className={cn("font-mono", data.avgPnL >= 0 ? "text-green-500" : "text-red-500")}>
                {data.avgPnL >= 0 ? '+' : ''}{safeToFixed(data.avgPnL, 1)}%
              </span>
            </p>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

export default function CalibrationCurve() {
  const { data, isLoading, error } = useQuery<CalibrationCurveData>({
    queryKey: ['/api/performance/calibration-curve'],
    staleTime: 60000,
  });

  if (isLoading) {
    return (
      <Card data-testid="card-calibration-curve-loading">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-80 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card data-testid="card-calibration-curve-error">
        <CardHeader>
          <CardTitle>Calibration Curve</CardTitle>
          <CardDescription>Predicted vs Actual Win Rate</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Failed to load calibration data.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { calibrationCurve, summary } = data;
  const statusColors = {
    WELL_CALIBRATED: 'text-green-500 bg-green-500/10 border-green-500/20',
    NEEDS_ADJUSTMENT: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    POORLY_CALIBRATED: 'text-red-500 bg-red-500/10 border-red-500/20',
  };

  const statusIcons = {
    WELL_CALIBRATED: <CheckCircle className="h-4 w-4" />,
    NEEDS_ADJUSTMENT: <AlertTriangle className="h-4 w-4" />,
    POORLY_CALIBRATED: <AlertTriangle className="h-4 w-4" />,
  };

  return (
    <Card data-testid="card-calibration-curve">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Calibration Curve
            </CardTitle>
            <CardDescription>
              Predicted confidence vs actual win rate (411 resolved trades)
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge 
              variant="outline"
              className={cn("font-mono", statusColors[summary.status])}
            >
              {statusIcons[summary.status]}
              <span className="ml-1">{summary.status.replace('_', ' ')}</span>
            </Badge>
            <Badge variant="secondary" className="font-mono">
              {summary.calibrationQuality} Calibrated
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
          <div className="text-sm text-blue-600 dark:text-blue-400">
            <p className="font-medium">Why This Matters</p>
            <p className="text-xs mt-1 text-blue-500/80">
              A well-calibrated system means confidence scores match actual outcomes. 
              If we say 80% confidence, trades should win ~80% of the time.
              Current avg error: <span className="font-mono font-semibold">{summary.avgCalibrationError}%</span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="p-3 rounded-lg bg-muted/30 border">
            <p className="text-xs text-muted-foreground">Calibrated</p>
            <p className="text-lg font-bold font-mono">
              {summary.calibratedBuckets}/{summary.totalBuckets}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-muted/30 border">
            <p className="text-xs text-muted-foreground">Avg Error</p>
            <p className={cn(
              "text-lg font-bold font-mono",
              summary.avgCalibrationError <= 15 ? "text-green-500" :
              summary.avgCalibrationError <= 25 ? "text-amber-500" : "text-red-500"
            )}>
              {summary.avgCalibrationError}%
            </p>
          </div>
          <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
            <p className="text-xs text-muted-foreground">Brier Score</p>
            <p className={cn(
              "text-lg font-bold font-mono",
              (summary.brierScore || 0) <= 0.15 ? "text-green-500" :
              (summary.brierScore || 0) <= 0.20 ? "text-cyan-500" :
              (summary.brierScore || 0) <= 0.25 ? "text-amber-500" : "text-red-500"
            )}>
              {summary.brierScore !== undefined ? safeToFixed(summary.brierScore, 3, 'N/A') : 'N/A'}
            </p>
            <p className="text-[10px] text-muted-foreground">{summary.brierInterpretation || ''}</p>
          </div>
          <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
            <p className="text-xs text-muted-foreground">Skill Score</p>
            <p className={cn(
              "text-lg font-bold font-mono",
              (summary.brierSkillScore || 0) > 0 ? "text-green-500" : "text-red-500"
            )}>
              {summary.brierSkillScore !== undefined ? (summary.brierSkillScore > 0 ? '+' : '') + safeToFixed(summary.brierSkillScore, 3) : 'N/A'}
            </p>
            <p className="text-[10px] text-muted-foreground">vs baseline</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/30 border">
            <p className="text-xs text-muted-foreground">Trades</p>
            <p className="text-lg font-bold font-mono">{summary.totalTrades}</p>
          </div>
        </div>

        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={calibrationCurve} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis
                dataKey="midpoint"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                tickFormatter={(val) => `${val}%`}
                label={{ value: 'Predicted Confidence', position: 'insideBottom', offset: -5, style: { fill: 'hsl(var(--muted-foreground))', fontSize: 11 } }}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                domain={[0, 100]}
                tickFormatter={(val) => `${val}%`}
                label={{ value: 'Win Rate', angle: -90, position: 'insideLeft', style: { fill: 'hsl(var(--muted-foreground))', fontSize: 11 } }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ paddingTop: '10px' }} />
              
              <ReferenceLine 
                stroke="hsl(var(--muted-foreground))" 
                strokeDasharray="5 5"
                strokeOpacity={0.5}
                segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]}
              />
              
              <Line
                type="monotone"
                dataKey="predicted"
                name="Perfect Calibration"
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="5 5"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="actual"
                name="Actual Win Rate"
                stroke="hsl(142, 76%, 45%)"
                strokeWidth={3}
                dot={{ fill: 'hsl(142, 76%, 45%)', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-500" />
            Best Performing Buckets
          </p>
          <div className="flex flex-wrap gap-2">
            {calibrationCurve
              .filter(c => c.trades >= 10)
              .sort((a, b) => b.actual - a.actual)
              .slice(0, 3)
              .map(c => (
                <Badge key={c.confidenceRange} variant="outline" className="bg-green-500/10 text-green-600 dark:text-green-400 font-mono">
                  {c.confidenceRange}%: {safeToFixed(c.actual, 0)}% win ({c.trades} trades)
                </Badge>
              ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-red-500" />
            Overconfident Buckets (Predicted {'>'} Actual)
          </p>
          <div className="flex flex-wrap gap-2">
            {calibrationCurve
              .filter(c => c.calibrationError > 20 && c.trades >= 10)
              .sort((a, b) => b.calibrationError - a.calibrationError)
              .slice(0, 3)
              .map(c => (
                <Badge key={c.confidenceRange} variant="outline" className="bg-red-500/10 text-red-600 dark:text-red-400 font-mono">
                  {c.confidenceRange}%: predicted {safeToFixed(c.predicted, 0)}% → actual {safeToFixed(c.actual, 0)}%
                </Badge>
              ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
