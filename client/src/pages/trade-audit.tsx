import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Target,
  TrendingUp,
  TrendingDown,
  Clock,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  XCircle,
  FileText,
  Camera,
  Activity,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { cn } from "@/lib/utils";
import type { TradeIdea, TradePriceSnapshot } from "@shared/schema";

interface AuditTrailData {
  tradeIdea: TradeIdea;
  priceSnapshots: TradePriceSnapshot[];
}

const TIMEZONE = "America/Chicago";

function formatCT(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  const zonedDate = toZonedTime(date, TIMEZONE);
  return format(zonedDate, "MMM d, h:mm a") + " CT";
}

function getOutcomeColor(status: string | null): string {
  switch (status) {
    case "hit_target": return "text-green-400";
    case "hit_stop": return "text-red-400";
    case "expired": return "text-amber-400";
    default: return "text-cyan-400";
  }
}

function getOutcomeBadge(status: string | null) {
  switch (status) {
    case "hit_target":
      return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Target Hit</Badge>;
    case "hit_stop":
      return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Stop Hit</Badge>;
    case "expired":
      return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Expired</Badge>;
    default:
      return <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30">Open</Badge>;
  }
}

function getEventIcon(eventType: string) {
  switch (eventType) {
    case "target_hit":
      return <CheckCircle className="h-4 w-4 text-green-400" />;
    case "stop_hit":
      return <XCircle className="h-4 w-4 text-red-400" />;
    case "expired":
      return <Clock className="h-4 w-4 text-amber-400" />;
    case "idea_published":
      return <FileText className="h-4 w-4 text-cyan-400" />;
    case "validation_check":
      return <Activity className="h-4 w-4 text-blue-400" />;
    default:
      return <Camera className="h-4 w-4 text-muted-foreground" />;
  }
}

function getEventLabel(eventType: string): string {
  switch (eventType) {
    case "target_hit": return "Target Reached";
    case "stop_hit": return "Stop Triggered";
    case "expired": return "Trade Expired";
    case "idea_published": return "Idea Published";
    case "validation_check": return "Validation Check";
    default: return eventType;
  }
}

function PlanCard({ idea }: { idea: TradeIdea }) {
  const isLong = idea.direction === "long";
  
  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5 text-cyan-400" />
          Trade Plan
        </CardTitle>
        <CardDescription>Original trade thesis and parameters</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn(
            isLong ? "border-green-500/50 text-green-400" : "border-red-500/50 text-red-400"
          )}>
            {isLong ? "LONG" : "SHORT"}
          </Badge>
          <span className="font-mono text-lg font-bold">{idea.symbol}</span>
          <Badge variant="secondary">{idea.assetType}</Badge>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Entry Price</p>
            <p className="font-mono text-lg">${Number(idea.entryPrice).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Target Price</p>
            <p className="font-mono text-lg text-green-400">${Number(idea.targetPrice).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Stop Loss</p>
            <p className="font-mono text-lg text-red-400">${Number(idea.stopLoss).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Risk/Reward</p>
            <p className="font-mono text-lg">
              {idea.riskRewardRatio ? Number(idea.riskRewardRatio).toFixed(2) + ":1" : "—"}
            </p>
          </div>
        </div>
        
        <div className="pt-2 border-t border-border/50">
          <p className="text-xs text-muted-foreground">Analysis</p>
          <p className="text-sm mt-1">{idea.analysis || "No analysis provided"}</p>
        </div>
        
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div>
            <p className="text-xs text-muted-foreground">Published</p>
            <p className="text-sm">{formatCT(idea.timestamp)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Exit By</p>
            <p className="text-sm">{formatCT(idea.exitBy)}</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Badge variant="outline">{idea.source}</Badge>
          {idea.confidenceScore && (
            <Badge variant="secondary">{idea.confidenceScore}% confidence</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function OutcomeCard({ idea }: { idea: TradeIdea }) {
  const isResolved = idea.outcomeStatus && idea.outcomeStatus !== "open";
  const isWin = idea.outcomeStatus === "hit_target";
  const isLoss = idea.outcomeStatus === "hit_stop";
  
  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isWin ? (
            <TrendingUp className="h-5 w-5 text-green-400" />
          ) : isLoss ? (
            <TrendingDown className="h-5 w-5 text-red-400" />
          ) : (
            <Activity className="h-5 w-5 text-cyan-400" />
          )}
          Outcome
        </CardTitle>
        <CardDescription>
          {isResolved ? "Trade result and exit details" : "Trade is still active"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          {getOutcomeBadge(idea.outcomeStatus)}
          {idea.percentGain !== null && (
            <span className={cn(
              "font-mono text-2xl font-bold",
              Number(idea.percentGain) >= 0 ? "text-green-400" : "text-red-400"
            )}>
              {Number(idea.percentGain) >= 0 ? "+" : ""}{Number(idea.percentGain).toFixed(2)}%
            </span>
          )}
        </div>
        
        {isResolved && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Exit Price</p>
                <p className="font-mono text-lg">${Number(idea.exitPrice || 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Holding Time</p>
                <p className="font-mono text-lg">
                  {idea.actualHoldingTimeMinutes 
                    ? `${Math.round(idea.actualHoldingTimeMinutes)}m`
                    : "—"
                  }
                </p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">High Reached</p>
                <p className="font-mono text-green-400">
                  ${Number(idea.highestPriceReached || 0).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Low Reached</p>
                <p className="font-mono text-red-400">
                  ${Number(idea.lowestPriceReached || 0).toFixed(2)}
                </p>
              </div>
            </div>
            
            {idea.resolutionReason && (
              <div className="pt-2 border-t border-border/50">
                <p className="text-xs text-muted-foreground">Resolution Reason</p>
                <p className="text-sm mt-1">{idea.resolutionReason}</p>
              </div>
            )}
            
            <div>
              <p className="text-xs text-muted-foreground">Exited At</p>
              <p className="text-sm">{formatCT(idea.exitDate)}</p>
            </div>
          </>
        )}
        
        {!isResolved && (
          <div className="text-center py-8">
            <Activity className="h-12 w-12 text-cyan-400 mx-auto mb-2 animate-pulse" />
            <p className="text-muted-foreground">Trade in progress...</p>
            <p className="text-xs text-muted-foreground mt-1">
              Validation runs every 5 minutes
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PriceSnapshotTimeline({ snapshots }: { snapshots: TradePriceSnapshot[] }) {
  if (snapshots.length === 0) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-cyan-400" />
            Price Evidence Timeline
          </CardTitle>
          <CardDescription>
            No price snapshots recorded yet
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Camera className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground">
              Price snapshots are captured when the trade reaches target/stop or expires
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5 text-cyan-400" />
          Price Evidence Timeline
        </CardTitle>
        <CardDescription>
          {snapshots.length} price snapshot{snapshots.length !== 1 ? "s" : ""} recorded
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-border" />
          
          <div className="space-y-6">
            {snapshots.map((snapshot, index) => (
              <div key={snapshot.id} className="relative flex gap-4">
                {/* Timeline dot */}
                <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-background border border-border">
                  {getEventIcon(snapshot.eventType)}
                </div>
                
                {/* Content */}
                <div className="flex-1 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{getEventLabel(snapshot.eventType)}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatCT(snapshot.createdAt?.toISOString?.() || snapshot.eventTimestamp)}
                    </span>
                  </div>
                  
                  <div className="glass-secondary rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-4">
                      <div>
                        <span className="text-xs text-muted-foreground">Price: </span>
                        <span className="font-mono font-bold">
                          ${Number(snapshot.currentPrice).toFixed(2)}
                        </span>
                      </div>
                      {snapshot.bidPrice && (
                        <div>
                          <span className="text-xs text-muted-foreground">Bid: </span>
                          <span className="font-mono">${Number(snapshot.bidPrice).toFixed(2)}</span>
                        </div>
                      )}
                      {snapshot.askPrice && (
                        <div>
                          <span className="text-xs text-muted-foreground">Ask: </span>
                          <span className="font-mono">${Number(snapshot.askPrice).toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                    
                    {snapshot.distanceToTargetPercent !== null && (
                      <p className="text-xs text-muted-foreground">
                        Distance to target: {Number(snapshot.distanceToTargetPercent).toFixed(1)}%
                      </p>
                    )}
                    
                    {snapshot.validatorVersion && (
                      <p className="text-xs text-muted-foreground">
                        Validator: v{snapshot.validatorVersion}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ComparisonCard({ idea }: { idea: TradeIdea }) {
  const isResolved = idea.outcomeStatus && idea.outcomeStatus !== "open";
  if (!isResolved) return null;
  
  const entryPrice = Number(idea.entryPrice);
  const targetPrice = Number(idea.targetPrice);
  const stopLoss = Number(idea.stopLoss);
  const exitPrice = Number(idea.exitPrice || 0);
  
  // Calculate target % and stop % from entry
  const targetPct = ((targetPrice - entryPrice) / entryPrice) * 100;
  const stopPct = ((stopLoss - entryPrice) / entryPrice) * 100;
  const actualPct = Number(idea.percentGain || 0);
  
  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-cyan-400" />
          Plan vs Reality
        </CardTitle>
        <CardDescription>Side-by-side comparison of expected vs actual</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="comparison-table">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-2 font-medium text-muted-foreground">Metric</th>
                <th className="text-right py-2 font-medium text-muted-foreground">Planned</th>
                <th className="text-right py-2 font-medium text-muted-foreground">Actual</th>
                <th className="text-right py-2 font-medium text-muted-foreground">Difference</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/30">
                <td className="py-2">Target Price</td>
                <td className="text-right font-mono text-green-400">${targetPrice.toFixed(2)}</td>
                <td className="text-right font-mono">—</td>
                <td className="text-right font-mono">—</td>
              </tr>
              <tr className="border-b border-border/30">
                <td className="py-2">Stop Loss</td>
                <td className="text-right font-mono text-red-400">${stopLoss.toFixed(2)}</td>
                <td className="text-right font-mono">—</td>
                <td className="text-right font-mono">—</td>
              </tr>
              <tr className="border-b border-border/30">
                <td className="py-2">Exit Price</td>
                <td className="text-right font-mono">—</td>
                <td className="text-right font-mono">${exitPrice.toFixed(2)}</td>
                <td className="text-right font-mono">
                  {(exitPrice - entryPrice >= 0 ? "+" : "") + (exitPrice - entryPrice).toFixed(2)}
                </td>
              </tr>
              <tr className="border-b border-border/30">
                <td className="py-2">Max Upside</td>
                <td className="text-right font-mono text-green-400">+{targetPct.toFixed(1)}%</td>
                <td className={cn(
                  "text-right font-mono",
                  actualPct >= 0 ? "text-green-400" : "text-red-400"
                )}>
                  {actualPct >= 0 ? "+" : ""}{actualPct.toFixed(1)}%
                </td>
                <td className={cn(
                  "text-right font-mono",
                  actualPct >= targetPct ? "text-green-400" : "text-amber-400"
                )}>
                  {(actualPct - targetPct).toFixed(1)}%
                </td>
              </tr>
              <tr>
                <td className="py-2">Max Risk</td>
                <td className="text-right font-mono text-red-400">{stopPct.toFixed(1)}%</td>
                <td className="text-right font-mono">
                  {idea.outcomeStatus === "hit_stop" ? `${actualPct.toFixed(1)}%` : "—"}
                </td>
                <td className="text-right font-mono">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TradeAudit() {
  const params = useParams<{ id: string }>();
  const tradeId = params.id;
  
  const { data, isLoading, error } = useQuery<AuditTrailData>({
    queryKey: ["/api/trade-ideas", tradeId, "audit"],
    enabled: !!tradeId,
  });
  
  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
        <Skeleton className="h-60" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  
  if (error || !data) {
    return (
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        <Link href="/trade-desk">
          <Button variant="ghost" size="sm" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Trade Desk
          </Button>
        </Link>
        <Card className="glass-card">
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Trade Not Found</h2>
            <p className="text-muted-foreground">
              The trade idea you're looking for doesn't exist or has been removed.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  const { tradeIdea, priceSnapshots } = data;
  
  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto" data-testid="trade-audit-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/trade-desk">
            <Button variant="ghost" size="sm" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6 text-cyan-400" />
              Trade Audit Trail
            </h1>
            <p className="text-muted-foreground text-sm">
              {tradeIdea.symbol} • {formatCT(tradeIdea.timestamp)}
            </p>
          </div>
        </div>
        {getOutcomeBadge(tradeIdea.outcomeStatus)}
      </div>
      
      {/* Plan vs Outcome Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PlanCard idea={tradeIdea} />
        <OutcomeCard idea={tradeIdea} />
      </div>
      
      {/* Comparison Table */}
      <ComparisonCard idea={tradeIdea} />
      
      {/* Price Evidence Timeline */}
      <PriceSnapshotTimeline snapshots={priceSnapshots} />
      
      {/* Disclaimer */}
      <Card className="glass-secondary border-amber-500/20">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-400">Educational Disclaimer</p>
              <p className="text-xs text-muted-foreground mt-1">
                This audit trail is provided for educational and research purposes only. 
                Past performance does not guarantee future results. All trade ideas are 
                research publications, not investment advice. You are solely responsible 
                for your own trading decisions.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
