import { useQuery } from "@tanstack/react-query";
import { cn, safeToFixed, safeNumber } from "@/lib/utils";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Target,
  Activity,
  Brain,
  RefreshCw,
} from "lucide-react";

function OpportunityCard({ opp }: { opp: any }) {
  return (
    <Link href={`/stock/${opp.symbol}`}>
      <Card
        className={cn(
          "cursor-pointer transition-all duration-200 hover:-translate-y-0.5",
          opp.urgency === "critical"
            ? "bg-[var(--trade-bearish)]/8 border-[var(--trade-bearish)]/25 hover:border-red-400/50"
            : opp.urgency === "high"
              ? "bg-[var(--trade-neutral)]/8 border-[var(--trade-neutral)]/25 hover:border-amber-400/50"
              : "bg-purple-500/8 border-purple-500/25 hover:border-purple-400/50"
        )}
      >
        <CardContent className="p-2.5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-[10px] font-mono",
                  opp.urgency === "critical"
                    ? "bg-[var(--trade-bearish)]/15 text-[var(--trade-bearish)]"
                    : opp.urgency === "high"
                      ? "bg-[var(--trade-neutral)]/15 text-[var(--trade-neutral)]"
                      : "bg-purple-500/15 text-purple-400"
                )}
              >
                {opp.symbol.slice(0, 2)}
              </div>
              <div>
                <span className="text-xs font-bold text-foreground">
                  {opp.symbol}
                </span>
                <Badge
                  className={cn(
                    "ml-1.5 text-[8px] px-1 py-0",
                    opp.direction === "bullish"
                      ? "bg-[var(--trade-bullish)]/20 text-[var(--trade-bullish)]"
                      : "bg-[var(--trade-bearish)]/20 text-[var(--trade-bearish)]"
                  )}
                >
                  {opp.direction?.toUpperCase()}
                </Badge>
              </div>
            </div>
            <div className="text-right">
              <div
                className={cn(
                  "text-sm font-bold font-mono tabular-nums",
                  opp.convergenceScore >= 80
                    ? "text-[var(--trade-bullish)]"
                    : opp.convergenceScore >= 65
                      ? "text-[var(--trade-neutral)]"
                      : "text-foreground"
                )}
              >
                {opp.convergenceScore}%
              </div>
              <Badge
                className={cn(
                  "text-[8px] px-1 py-0",
                  opp.urgency === "critical"
                    ? "bg-[var(--trade-bearish)]/20 text-[var(--trade-bearish)]"
                    : opp.urgency === "high"
                      ? "bg-[var(--trade-neutral)]/20 text-[var(--trade-neutral)]"
                      : "bg-muted-foreground/20 text-muted-foreground"
                )}
              >
                {opp.urgency?.toUpperCase()}
              </Badge>
            </div>
          </div>
          {opp.signals && opp.signals.length > 0 && (
            <div className="space-y-0.5">
              {opp.signals.slice(0, 4).map((signal: any, idx: number) => (
                <div
                  key={idx}
                  className="flex items-center gap-1.5 text-[9px] text-muted-foreground"
                >
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      opp.urgency === "critical"
                        ? "bg-red-400"
                        : opp.urgency === "high"
                          ? "bg-amber-400"
                          : "bg-purple-400"
                    )}
                  />
                  <span className="truncate">
                    {signal.source}: {signal.description?.slice(0, 40)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function ConvergenceView() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/convergence/opportunities", "subpage"],
    queryFn: async () => {
      const res = await fetch("/api/convergence/opportunities");
      if (!res.ok) throw new Error("Failed to fetch convergence data");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
    refetchInterval: 3 * 60 * 1000,
  });

  const opportunities = data?.opportunities || [];
  const criticalCount = data?.critical || 0;
  const highCount = data?.high || 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-purple-500/20 to-violet-500/20 border border-purple-500/40">
            <Target className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">
              Convergence Signals
            </h2>
            <p className="text-[9px] text-muted-foreground">Loading...</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-28 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-purple-500/20 to-violet-500/20 border border-purple-500/40">
            <Target className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              Convergence Signals
              <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/40 text-[9px] px-1.5 py-0">
                MULTI-SOURCE
              </Badge>
            </h2>
            <p className="text-[9px] text-muted-foreground">
              When multiple data sources agree, something big is brewing
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => refetch()}
          >
            <RefreshCw className="w-3 h-3 mr-1.5" /> Refresh
          </Button>
          {criticalCount > 0 && (
            <Badge className="bg-[var(--trade-bearish)]/20 text-[var(--trade-bearish)] text-[9px]">
              {criticalCount} Critical
            </Badge>
          )}
          {highCount > 0 && (
            <Badge className="bg-[var(--trade-neutral)]/20 text-[var(--trade-neutral)] text-[9px]">
              {highCount} High
            </Badge>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="bg-[var(--trade-bearish)]/8 border-[var(--trade-bearish)]/25 p-2.5">
          <div className="text-[9px] text-[var(--trade-bearish)] mb-0.5">
            Critical Urgency
          </div>
          <div className="text-lg font-bold font-mono tabular-nums text-red-300">
            {criticalCount}
          </div>
        </Card>
        <Card className="bg-[var(--trade-neutral)]/8 border-[var(--trade-neutral)]/25 p-2.5">
          <div className="text-[9px] text-[var(--trade-neutral)] mb-0.5">
            High Urgency
          </div>
          <div className="text-lg font-bold font-mono tabular-nums text-amber-300">
            {highCount}
          </div>
        </Card>
        <Card className="bg-purple-500/8 border-purple-500/25 p-2.5">
          <div className="text-[9px] text-purple-400 mb-0.5">
            Total Opportunities
          </div>
          <div className="text-lg font-bold font-mono tabular-nums text-purple-300">
            {opportunities.length}
          </div>
        </Card>
      </div>

      {/* Opportunity cards */}
      {opportunities.length === 0 ? (
        <div className="text-center py-12">
          <Activity className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-xs text-muted-foreground">
            Monitoring for convergence... detected
          </p>
          <p className="text-[9px] text-muted-foreground mt-1">
            Monitoring news, options flow, insider activity, and sector
            momentum...
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {opportunities.map((opp: any) => (
            <OpportunityCard key={opp.symbol} opp={opp} />
          ))}
        </div>
      )}

      {/* Info card */}
      <Card className="bg-card border-border">
        <CardContent className="p-2.5">
          <div className="flex items-start gap-2">
            <div className="p-1.5 rounded-md bg-purple-500/10">
              <Brain className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div className="text-[9px] text-muted-foreground">
              <p className="font-medium text-foreground/80 mb-0.5">
                How Convergence Detection Works
              </p>
              <p>
                Our system monitors multiple data sources (news sentiment,
                options flow, insider trades, sector momentum) and alerts when 2+
                sources align on the same symbol within a short timeframe. Higher
                urgency = more sources converging.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
