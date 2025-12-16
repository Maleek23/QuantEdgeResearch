import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { AlertTriangle } from "lucide-react";

interface ConfidenceBand {
  band: string;
  bandLabel: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
}

interface ConfidenceCalibrationProps {
  selectedEngine?: string;
}

const getBarColor = (winRate: number) => {
  if (winRate >= 70) return "hsl(142, 76%, 45%)";
  if (winRate >= 50) return "hsl(45, 93%, 58%)";
  return "hsl(0, 72%, 55%)";
};

function CustomTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
        <p className="font-semibold text-sm">Confidence: {data.bandLabel}</p>
        <div className="mt-2 space-y-1 text-xs">
          <p className="text-muted-foreground">
            Trades: <span className="font-mono text-foreground">{data.trades}</span>
          </p>
          <p className="text-green-500">
            Wins: <span className="font-mono">{data.wins}</span>
          </p>
          <p className="text-red-500">
            Losses: <span className="font-mono">{data.losses}</span>
          </p>
          <p className="font-semibold mt-2">
            Actual Win Rate: <span className="font-mono">{data.winRate.toFixed(1)}%</span>
          </p>
        </div>
      </div>
    );
  }
  return null;
}

export default function ConfidenceCalibration({ selectedEngine }: ConfidenceCalibrationProps) {
  const queryParams = selectedEngine ? `?engine=${selectedEngine}` : '';
  
  const { data, isLoading } = useQuery<ConfidenceBand[]>({
    queryKey: ['/api/performance/confidence-calibration', selectedEngine],
    queryFn: async () => {
      const response = await fetch(`/api/performance/confidence-calibration${queryParams}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch confidence calibration data');
      }
      return response.json();
    },
    staleTime: 30000,
  });

  if (isLoading) {
    return (
      <Card data-testid="card-confidence-calibration-loading">
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

  if (!data || data.length === 0) {
    return (
      <Card data-testid="card-confidence-calibration-empty">
        <CardHeader>
          <CardTitle>Confidence Calibration</CardTitle>
          <CardDescription>No data available</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Not enough closed trades with confidence scores to display calibration analysis.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-confidence-calibration">
      <CardHeader>
        <CardTitle>Confidence Calibration</CardTitle>
        <CardDescription>
          Predicted confidence vs actual win rate by confidence band
          {selectedEngine && ` (${selectedEngine.toUpperCase()} engine)`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
            Lower confidence scores often perform BETTER - inverse relationship observed
          </p>
        </div>

        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis
                dataKey="bandLabel"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                label={{ value: 'Confidence Band', position: 'insideBottom', offset: -5, style: { fill: 'hsl(var(--muted-foreground))' } }}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                label={{ value: 'Actual Win Rate %', angle: -90, position: 'insideLeft', style: { fill: 'hsl(var(--muted-foreground))' } }}
                domain={[0, 100]}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--accent))' }} />
              <Bar dataKey="winRate" radius={[4, 4, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${entry.band}-${index}`} fill={getBarColor(entry.winRate)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-xs text-center">
          {data.map((band, index) => (
            <div key={`band-${band.band}-${index}`} className="p-2 rounded border bg-muted/20">
              <p className="font-semibold">{band.bandLabel}</p>
              <p className="font-mono text-muted-foreground mt-1">{band.trades} trades</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
