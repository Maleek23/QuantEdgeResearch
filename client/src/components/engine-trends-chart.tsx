import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, Tooltip, Legend } from "recharts";
import { TrendingUp } from "lucide-react";
import { safeToFixed } from "@/lib/utils";
import { QEEmpty, QEError } from "@/components/ui/qe-states";
import { AnalyticsChart, AnalyticsXAxis, AnalyticsYAxis, AnalyticsGrid, CHART_COLORS } from "@/components/ui/analytics-chart";

interface WeekData {
  week: string;
  weekLabel: string;
  ai: number;
  quant: number;
  hybrid: number;
  flow: number;
  news: number;
}

export default function EngineTrendsChart() {
  const { data, isLoading, isError, isFetching, refetch } = useQuery<WeekData[]>({
    queryKey: ['/api/performance/engine-trends'],
    staleTime: 30000,
  });

  if (isLoading) {
    return (
      <Card data-testid="card-engine-trends-loading">
        <CardHeader>
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-80 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-96 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Error before empty: a failed fetch is not "not enough history" (SR 11-7 T3).
  if (isError && (!data || data.length === 0)) {
    return (
      <Card data-testid="card-engine-trends-error">
        <CardHeader>
          <CardTitle>Engine Performance Trends (Last 8 Weeks)</CardTitle>
        </CardHeader>
        <CardContent>
          <QEError
            title="Engine trends API didn't respond"
            message="The weekly engine win rates couldn't be loaded. This is a connection failure, not a lack of history."
            onRetry={() => void refetch()}
            retrying={isFetching}
          />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card data-testid="card-engine-trends-empty">
        <CardHeader>
          <CardTitle>Engine Performance Trends (Last 8 Weeks)</CardTitle>
          <CardDescription>Weekly win rate comparison across all trading engines</CardDescription>
        </CardHeader>
        <CardContent>
          <QEEmpty message="Not enough resolved history yet to chart weekly engine win rates." />
        </CardContent>
      </Card>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-card-border rounded-lg p-3 shadow-lg">
          <p className="font-semibold text-sm mb-2">{label}</p>
          <div className="space-y-1 text-xs">
            {payload.map((entry: any) => (
              <p key={entry.name} style={{ color: entry.color }}>
                <span className="font-semibold">{entry.name.toUpperCase()}:</span>{' '}
                <span className="font-mono">{safeToFixed(entry.value, 1)}%</span>
              </p>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card data-testid="card-engine-trends">
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          <CardTitle>Engine Performance Trends (Last 8 Weeks)</CardTitle>
        </div>
        <CardDescription>
          Weekly win rate comparison across all trading engines
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isError && (
          <QEError
            className="mb-4"
            title="Engine trends API didn't respond"
            message="Showing the last trends that loaded — they may be stale."
            onRetry={() => void refetch()}
            retrying={isFetching}
          />
        )}
        <AnalyticsChart config={{}} className="h-96">
          <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <AnalyticsGrid opacity={0.3} />
            <AnalyticsXAxis
              dataKey="weekLabel"
            />
            <AnalyticsYAxis
              label={{ value: 'Win Rate %', angle: -90, position: 'insideLeft', style: { fill: 'hsl(var(--muted-foreground))' } }}
              domain={[0, 100]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="line"
              formatter={(value) => value.toUpperCase()}
            />
            <Line
              type="monotone"
              dataKey="ai"
              stroke={CHART_COLORS.blue}
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
              name="ai"
              data-testid="line-ai"
            />
            <Line
              type="monotone"
              dataKey="quant"
              stroke={CHART_COLORS.purple}
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
              name="quant"
              data-testid="line-quant"
            />
            <Line
              type="monotone"
              dataKey="hybrid"
              stroke={CHART_COLORS.bull}
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
              name="hybrid"
              data-testid="line-hybrid"
            />
            <Line
              type="monotone"
              dataKey="flow"
              stroke={CHART_COLORS.gold}
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
              name="flow"
              data-testid="line-flow"
            />
            <Line
              type="monotone"
              dataKey="news"
              stroke={CHART_COLORS.orange}
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
              name="news"
              data-testid="line-news"
            />
          </LineChart>
        </AnalyticsChart>
      </CardContent>
    </Card>
  );
}
