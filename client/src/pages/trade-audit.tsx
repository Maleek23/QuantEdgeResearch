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
  Scale,
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
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
            <Target className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Original Plan</p>
            <CardTitle className="text-lg">Trade Plan</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={cn(
            isLong ? "border-green-500/50 text-green-400" : "border-red-500/50 text-red-400"
          )}>
            {isLong ? "LONG" : "SHORT"}
          </Badge>
          <span className="font-mono text-lg font-bold">{idea.symbol}</span>
          <Badge variant="secondary">{idea.assetType}</Badge>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="stat-glass rounded-lg p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Entry Price</p>
            <p className="font-mono text-lg font-bold tabular-nums">${Number(idea.entryPrice).toFixed(2)}</p>
          </div>
          <div className="stat-glass rounded-lg p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Target Price</p>
            <p className="font-mono text-lg font-bold tabular-nums text-green-400">${Number(idea.targetPrice).toFixed(2)}</p>
          </div>
          <div className="stat-glass rounded-lg p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Stop Loss</p>
            <p className="font-mono text-lg font-bold tabular-nums text-red-400">${Number(idea.stopLoss).toFixed(2)}</p>
          </div>
          <div className="stat-glass rounded-lg p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Risk/Reward</p>
            <p className="font-mono text-lg font-bold tabular-nums">
              {idea.riskRewardRatio ? Number(idea.riskRewardRatio).toFixed(2) + ":1" : "—"}
            </p>
          </div>
        </div>
        
        <div className="pt-2 border-t border-border/50">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Analysis</p>
          <p className="text-sm leading-relaxed">{idea.analysis || "No analysis provided"}</p>
        </div>
        
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Published</p>
            <p className="text-sm font-mono">{formatCT(idea.timestamp)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Exit By</p>
            <p className="text-sm font-mono">{formatCT(idea.exitBy)}</p>
          </div>
        </div>
        
        <div className="flex gap-2 flex-wrap">
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
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            "h-10 w-10 rounded-lg flex items-center justify-center",
            isWin ? "bg-green-500/10" : isLoss ? "bg-red-500/10" : "bg-cyan-500/10"
          )}>
            {isWin ? (
              <TrendingUp className="h-5 w-5 text-green-400" />
            ) : isLoss ? (
              <TrendingDown className="h-5 w-5 text-red-400" />
            ) : (
              <Activity className="h-5 w-5 text-cyan-400" />
            )}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Trade Result</p>
            <CardTitle className="text-lg">Outcome</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          {getOutcomeBadge(idea.outcomeStatus)}
          {idea.percentGain !== null && (
            <span className={cn(
              "font-mono text-2xl font-bold tabular-nums",
              Number(idea.percentGain) >= 0 ? "text-green-400" : "text-red-400"
            )}>
              {Number(idea.percentGain) >= 0 ? "+" : ""}{Number(idea.percentGain).toFixed(2)}%
            </span>
          )}
        </div>
        
        {isResolved && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="stat-glass rounded-lg p-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Exit Price</p>
                <p className="font-mono text-lg font-bold tabular-nums">${Number(idea.exitPrice || 0).toFixed(2)}</p>
              </div>
              <div className="stat-glass rounded-lg p-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Holding Time</p>
                <p className="font-mono text-lg font-bold tabular-nums">
                  {idea.actualHoldingTimeMinutes 
                    ? `${Math.round(idea.actualHoldingTimeMinutes)}m`
                    : "—"
                  }
                </p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="stat-glass rounded-lg p-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">High Reached</p>
                <p className="font-mono text-lg font-bold tabular-nums text-green-400">
                  ${Number(idea.highestPriceReached || 0).toFixed(2)}
                </p>
              </div>
              <div className="stat-glass rounded-lg p-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Low Reached</p>
                <p className="font-mono text-lg font-bold tabular-nums text-red-400">
                  ${Number(idea.lowestPriceReached || 0).toFixed(2)}
                </p>
              </div>
            </div>
            
            {idea.resolutionReason && (
              <div className="pt-2 border-t border-border/50">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Resolution Reason</p>
                <p className="text-sm leading-relaxed">{idea.resolutionReason}</p>
              </div>
            )}
            
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Exited At</p>
              <p className="text-sm font-mono">{formatCT(idea.exitDate)}</p>
            </div>
          </>
        )}
        
        {!isResolved && (
          <div className="text-center py-8">
            <div className="h-12 w-12 rounded-lg bg-cyan-500/10 flex items-center justify-center mx-auto mb-3">
              <Activity className="h-6 w-6 text-cyan-400 animate-pulse" />
            </div>
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
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Camera className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Evidence Log</p>
              <CardTitle className="text-lg">Price Timeline</CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="h-12 w-12 rounded-lg bg-muted/30 flex items-center justify-center mx-auto mb-3">
              <Camera className="h-6 w-6 text-muted-foreground" />
            </div>
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
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <Camera className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Evidence Log</p>
            <CardTitle className="text-lg">Price Timeline</CardTitle>
          </div>
        </div>
        <CardDescription className="mt-2">
          {snapshots.length} price snapshot{snapshots.length !== 1 ? "s" : ""} recorded
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-border" />
          
          <div className="space-y-6">
            {snapshots.map((snapshot, index) => (
              <div key={snapshot.id} className="relative flex gap-4">
                <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-background border border-border">
                  {getEventIcon(snapshot.eventType)}
                </div>
                
                <div className="flex-1 pb-4">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="font-medium">{getEventLabel(snapshot.eventType)}</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {formatCT(snapshot.createdAt?.toISOString?.() || snapshot.eventTimestamp)}
                    </span>
                  </div>
                  
                  <div className="stat-glass rounded-lg p-4 space-y-3 hover-elevate transition-all">
                    <div className="flex items-center gap-4 flex-wrap">
                      <div>
                        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Price</span>
                        <p className="font-mono font-bold tabular-nums">
                          ${Number(snapshot.currentPrice).toFixed(2)}
                        </p>
                      </div>
                      {snapshot.bidPrice && (
                        <div>
                          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Bid</span>
                          <p className="font-mono tabular-nums">${Number(snapshot.bidPrice).toFixed(2)}</p>
                        </div>
                      )}
                      {snapshot.askPrice && (
                        <div>
                          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Ask</span>
                          <p className="font-mono tabular-nums">${Number(snapshot.askPrice).toFixed(2)}</p>
                        </div>
                      )}
                    </div>
                    
                    {snapshot.distanceToTargetPercent !== null && (
                      <p className="text-xs text-muted-foreground">
                        Distance to target: <span className="font-mono">{Number(snapshot.distanceToTargetPercent).toFixed(1)}%</span>
                      </p>
                    )}
                    
                    {snapshot.validatorVersion && (
                      <p className="text-xs text-muted-foreground">
                        Validator: <span className="font-mono">v{snapshot.validatorVersion}</span>
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
  
  const targetPct = ((targetPrice - entryPrice) / entryPrice) * 100;
  const stopPct = ((stopLoss - entryPrice) / entryPrice) * 100;
  const actualPct = Number(idea.percentGain || 0);
  
  return (
    <Card className="glass-card">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Scale className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Analysis</p>
            <CardTitle className="text-lg">Plan vs Reality</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="comparison-table">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-3 font-medium text-xs uppercase tracking-wider text-muted-foreground">Metric</th>
                <th className="text-right py-3 font-medium text-xs uppercase tracking-wider text-muted-foreground">Planned</th>
                <th className="text-right py-3 font-medium text-xs uppercase tracking-wider text-muted-foreground">Actual</th>
                <th className="text-right py-3 font-medium text-xs uppercase tracking-wider text-muted-foreground">Difference</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/30 hover-elevate">
                <td className="py-3">Target Price</td>
                <td className="text-right font-mono tabular-nums text-green-400">${targetPrice.toFixed(2)}</td>
                <td className="text-right font-mono tabular-nums">—</td>
                <td className="text-right font-mono tabular-nums">—</td>
              </tr>
              <tr className="border-b border-border/30 hover-elevate">
                <td className="py-3">Stop Loss</td>
                <td className="text-right font-mono tabular-nums text-red-400">${stopLoss.toFixed(2)}</td>
                <td className="text-right font-mono tabular-nums">—</td>
                <td className="text-right font-mono tabular-nums">—</td>
              </tr>
              <tr className="border-b border-border/30 hover-elevate">
                <td className="py-3">Exit Price</td>
                <td className="text-right font-mono tabular-nums">—</td>
                <td className="text-right font-mono tabular-nums">${exitPrice.toFixed(2)}</td>
                <td className="text-right font-mono tabular-nums">
                  {(exitPrice - entryPrice >= 0 ? "+" : "") + (exitPrice - entryPrice).toFixed(2)}
                </td>
              </tr>
              <tr className="border-b border-border/30 hover-elevate">
                <td className="py-3">Max Upside</td>
                <td className="text-right font-mono tabular-nums text-green-400">+{targetPct.toFixed(1)}%</td>
                <td className={cn(
                  "text-right font-mono tabular-nums",
                  actualPct >= 0 ? "text-green-400" : "text-red-400"
                )}>
                  {actualPct >= 0 ? "+" : ""}{actualPct.toFixed(1)}%
                </td>
                <td className={cn(
                  "text-right font-mono tabular-nums",
                  actualPct >= targetPct ? "text-green-400" : "text-amber-400"
                )}>
                  {(actualPct - targetPct).toFixed(1)}%
                </td>
              </tr>
              <tr className="hover-elevate">
                <td className="py-3">Max Risk</td>
                <td className="text-right font-mono tabular-nums text-red-400">{stopPct.toFixed(1)}%</td>
                <td className="text-right font-mono tabular-nums">
                  {idea.outcomeStatus === "hit_stop" ? `${actualPct.toFixed(1)}%` : "—"}
                </td>
                <td className="text-right font-mono tabular-nums">—</td>
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
            <div className="h-12 w-12 rounded-lg bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="h-6 w-6 text-amber-400" />
            </div>
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
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Link href="/trade-desk">
            <Button variant="ghost" size="sm" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Audit Trail</p>
              <h1 className="text-xl sm:text-2xl font-semibold">
                {tradeIdea.symbol} <span className="text-muted-foreground font-mono text-base">• {formatCT(tradeIdea.timestamp)}</span>
              </h1>
            </div>
          </div>
        </div>
        {getOutcomeBadge(tradeIdea.outcomeStatus)}
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PlanCard idea={tradeIdea} />
        <OutcomeCard idea={tradeIdea} />
      </div>
      
      <ComparisonCard idea={tradeIdea} />
      
      <PriceSnapshotTimeline snapshots={priceSnapshots} />
      
      <Card className="glass-card border-amber-500/20">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-amber-400">Educational Disclaimer</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
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
