import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Brain, Calculator, GitBranch, TrendingUp } from "lucide-react";

interface EngineStats {
  totalIdeas: number;
  closedIdeas: number;
  winRate: number;
  avgPercentGain: number;
}

interface EngineBreakdown {
  ai: EngineStats;
  quant: EngineStats;
  hybrid: EngineStats;
  flow: EngineStats;
}

export function EnginePerformanceChart() {
  const { data, isLoading } = useQuery<EngineBreakdown>({
    queryKey: ['/api/performance/engine-breakdown'],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No data available
      </div>
    );
  }

  const chartData = [
    {
      name: "AI",
      winRate: data.ai.winRate,
      closedIdeas: data.ai.closedIdeas,
      icon: Brain,
      color: "#3b82f6", // blue
    },
    {
      name: "Quant",
      winRate: data.quant.winRate,
      closedIdeas: data.quant.closedIdeas,
      icon: Calculator,
      color: "#10b981", // green
    },
    {
      name: "Hybrid",
      winRate: data.hybrid.winRate,
      closedIdeas: data.hybrid.closedIdeas,
      icon: GitBranch,
      color: "#8b5cf6", // purple
    },
    {
      name: "Flow",
      winRate: data.flow.winRate,
      closedIdeas: data.flow.closedIdeas,
      icon: TrendingUp,
      color: "#f59e0b", // amber
    },
  ];

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="font-semibold mb-1">{data.name} Engine</p>
          <p className="text-sm text-muted-foreground">
            Win Rate: <span className="font-semibold text-foreground">{data.winRate.toFixed(1)}%</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Validated Trades: <span className="font-semibold text-foreground">{data.closedIdeas}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4" data-testid="engine-performance-chart">
      {/* Header */}
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-1">Dual-Engine Performance</h3>
        <p className="text-sm text-muted-foreground">Validated win rates across all engines</p>
      </div>

      {/* Bar Chart */}
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis 
            dataKey="name" 
            tick={{ fill: 'currentColor' }} 
            className="text-muted-foreground text-xs"
          />
          <YAxis 
            tick={{ fill: 'currentColor' }} 
            className="text-muted-foreground text-xs"
            domain={[0, 100]}
            label={{ value: 'Win Rate (%)', angle: -90, position: 'insideLeft', className: 'text-xs' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="winRate" radius={[8, 8, 0, 0]} data-testid="performance-bars">
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Engine Legend */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {chartData.map((engine) => {
          const Icon = engine.icon;
          return (
            <div key={engine.name} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: engine.color }}
              />
              <Icon className="h-4 w-4" style={{ color: engine.color }} />
              <div>
                <p className="text-xs font-medium">{engine.name}</p>
                <p className="text-xs text-muted-foreground">{engine.winRate.toFixed(1)}%</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Key Insight */}
      <div className="text-center p-3 bg-primary/10 rounded-lg border border-primary/20">
        <p className="text-sm text-primary font-medium">
          Hybrid engine combines AI + Quant for optimal performance
        </p>
      </div>
    </div>
  );
}
