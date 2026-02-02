import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  TrendingUp, TrendingDown, Calendar, Target, AlertCircle,
  MessageSquare, DollarSign, ArrowUpDown
} from "lucide-react";
import { cn, safeToFixed, safeNumber } from "@/lib/utils";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  ComposedChart,
} from "recharts";
import { format, parseISO } from "date-fns";

interface WatchlistHistoryRecord {
  id: string;
  symbol: string;
  snapshotDate: string;
  year: number;
  gradeScore: number | null;
  gradeLetter: string | null;
  tier: string | null;
  confidenceScore: number | null;
  price: number;
  priceChange: number | null;
  hasEarnings: boolean;
  hasNews: boolean;
  hasTrade: boolean;
  hasNote: boolean;
}

interface GradeTimelineProps {
  symbol: string;
  year?: number;
  height?: string;
  showPrice?: boolean;
}

function getTierColor(tier: string | null): string {
  switch (tier) {
    case 'S': return 'text-purple-400';
    case 'A': return 'text-green-400';
    case 'B': return 'text-cyan-400';
    case 'C': return 'text-amber-400';
    case 'D': return 'text-orange-400';
    case 'F': return 'text-red-400';
    default: return 'text-muted-foreground';
  }
}

function getTierBackground(tier: string | null): string {
  switch (tier) {
    case 'S': return 'bg-purple-500/20';
    case 'A': return 'bg-green-500/20';
    case 'B': return 'bg-cyan-500/20';
    case 'C': return 'bg-amber-500/20';
    case 'D': return 'bg-orange-500/20';
    case 'F': return 'bg-red-500/20';
    default: return 'bg-muted/20';
  }
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  
  const data = payload[0].payload;
  
  return (
    <div className="bg-slate-800/95 backdrop-blur-sm border border-slate-700 rounded-lg p-3 shadow-xl">
      <p className="text-xs text-muted-foreground mb-1">
        {format(parseISO(data.snapshotDate), 'MMM d, yyyy')}
      </p>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs">Grade:</span>
          <Badge variant="outline" className={cn("text-xs", getTierColor(data.tier))}>
            {data.gradeLetter || data.tier || 'N/A'}
          </Badge>
          <span className="text-xs font-mono text-cyan-400">
            {data.gradeScore ? safeToFixed(data.gradeScore, 0) : '--'}/100
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs">Price:</span>
          <span className="text-xs font-mono font-medium">
            ${safeToFixed(data.price, 2)}
          </span>
          {data.priceChange !== null && (
            <span className={cn(
              "text-xs font-mono",
              data.priceChange >= 0 ? "text-green-400" : "text-red-400"
            )}>
              {data.priceChange >= 0 ? '+' : ''}{safeToFixed(data.priceChange, 1)}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-2">
          {data.hasTrade && (
            <Badge variant="outline" className="text-xs bg-green-500/20 text-green-400">
              <DollarSign className="h-3 w-3 mr-0.5" /> Traded
            </Badge>
          )}
          {data.hasNote && (
            <Badge variant="outline" className="text-xs bg-purple-500/20 text-purple-400">
              <MessageSquare className="h-3 w-3 mr-0.5" /> Note
            </Badge>
          )}
          {data.hasEarnings && (
            <Badge variant="outline" className="text-xs bg-amber-500/20 text-amber-400">
              <Calendar className="h-3 w-3 mr-0.5" /> Earnings
            </Badge>
          )}
          {data.hasNews && (
            <Badge variant="outline" className="text-xs bg-cyan-500/20 text-cyan-400">
              <AlertCircle className="h-3 w-3 mr-0.5" /> News
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GradeTimeline({ symbol, year, height = "h-64", showPrice = true }: GradeTimelineProps) {
  const currentYear = new Date().getFullYear();
  const targetYear = year || currentYear;

  const { data: history, isLoading, error } = useQuery<WatchlistHistoryRecord[]>({
    queryKey: ['/api/watchlist/history', symbol, targetYear],
    enabled: !!symbol,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card className="bg-slate-800/30 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className={cn("w-full", height)} />
        </CardContent>
      </Card>
    );
  }

  if (error || !history || history.length === 0) {
    return (
      <Card className="bg-slate-800/30 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4 text-cyan-400" />
            {symbol} Grade Timeline ({targetYear})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={cn("flex items-center justify-center text-muted-foreground", height)}>
            <p className="text-sm">No historical data available for {symbol}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const sortedHistory = [...history].sort((a, b) => 
    a.snapshotDate.localeCompare(b.snapshotDate)
  );

  const firstRecord = sortedHistory[0];
  const lastRecord = sortedHistory[sortedHistory.length - 1];
  
  const gradeChange = (lastRecord.gradeScore || 0) - (firstRecord.gradeScore || 0);
  const firstPrice = safeNumber(firstRecord.price, 1);
  const priceChange = firstPrice > 0
    ? ((safeNumber(lastRecord.price) - firstPrice) / firstPrice) * 100
    : 0;

  const tradeDays = history.filter(h => h.hasTrade).length;

  return (
    <Card className="bg-slate-800/30 backdrop-blur-sm" data-testid="grade-timeline">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4 text-cyan-400" />
            <span className="font-mono">{symbol}</span> Grade Timeline ({targetYear})
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn("text-xs", getTierColor(lastRecord.tier))}>
              {lastRecord.gradeLetter || lastRecord.tier || 'N/A'}
            </Badge>
            <span className={cn(
              "text-xs font-mono",
              gradeChange >= 0 ? "text-green-400" : "text-red-400"
            )}>
              {gradeChange >= 0 ? '+' : ''}{safeToFixed(gradeChange, 0)} pts
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{sortedHistory.length} days tracked</span>
          <span>Price: {priceChange >= 0 ? '+' : ''}{safeToFixed(priceChange, 1)}%</span>
          {tradeDays > 0 && (
            <span className="text-green-400">{tradeDays} trade(s)</span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className={cn("w-full", height)}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={sortedHistory} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <defs>
                <linearGradient id="gradeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
              <XAxis 
                dataKey="snapshotDate" 
                tick={{ fill: '#94a3b8', fontSize: 10 }}
                tickFormatter={(date) => format(parseISO(date), 'M/d')}
                axisLine={{ stroke: '#475569' }}
              />
              <YAxis 
                domain={[0, 100]}
                tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                axisLine={{ stroke: '#475569' }}
                ticks={[0, 25, 50, 75, 100]}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={80} stroke="#22c55e" strokeDasharray="3 3" opacity={0.5} />
              <ReferenceLine y={60} stroke="#eab308" strokeDasharray="3 3" opacity={0.5} />
              <Area
                type="monotone"
                dataKey="gradeScore"
                fill="url(#gradeGradient)"
                stroke="none"
              />
              <Line
                type="monotone"
                dataKey="gradeScore"
                stroke="#22d3ee"
                strokeWidth={2}
                dot={(props: any) => {
                  const { cx, cy, payload } = props;
                  if (payload.hasTrade || payload.hasNote || payload.hasEarnings) {
                    return (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={4}
                        fill={
                          payload.hasTrade ? '#22c55e' :
                          payload.hasNote ? '#a855f7' :
                          payload.hasEarnings ? '#f59e0b' : '#22d3ee'
                        }
                        stroke="#1e293b"
                        strokeWidth={1}
                      />
                    );
                  }
                  return null;
                }}
                activeDot={{ r: 6, fill: '#22d3ee', stroke: '#1e293b', strokeWidth: 2 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            <span>Trade</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-purple-400" />
            <span>Note</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-amber-400" />
            <span>Earnings</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-0.5 w-4 bg-green-500 opacity-50" style={{ borderTop: '1px dashed' }} />
            <span>A-tier (80+)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-0.5 w-4 bg-amber-500 opacity-50" style={{ borderTop: '1px dashed' }} />
            <span>C-tier (60+)</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
