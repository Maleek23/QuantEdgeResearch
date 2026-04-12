/**
 * OvernightView — Extracted from TomorrowSurgersSubPage
 * Overnight surge predictions with TradeCard rendering.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TradeCard } from "@/components/ui/trade-card";
import type { TradeCardData } from "@/components/ui/trade-card";
import { cn, safeToFixed, safeNumber } from "@/lib/utils";
import {
  Sparkles,
  Star,
  TrendingUp,
  Eye,
  Activity,
  AlertTriangle,
  RefreshCw,
  Clock,
  Brain,
} from "lucide-react";

// ── Tier-to-grade mapping for TradeCard ──

function tierToGrade(tier?: string): string | undefined {
  switch (tier) {
    case "HIGH_CONVICTION": return "A+";
    case "STRONG_SETUP": return "A";
    case "WATCH_CLOSELY": return "B";
    case "SPECULATIVE": return "C";
    default: return undefined;
  }
}

// ── Map a prediction object to TradeCardData ──

function predictionToCardData(pred: any): TradeCardData {
  return {
    symbol: pred.symbol,
    direction: "long" as const,
    confidenceScore: safeNumber(pred.prediction?.probability) || undefined,
    grade: tierToGrade(pred.prediction?.tier),
    entryPrice: safeNumber(pred.currentPrice) || undefined,
    targetPrice: safeNumber(pred.prediction?.targetRange?.high) || undefined,
    catalyst: pred.prediction?.reasoning
      ? pred.prediction.reasoning.slice(0, 90)
      : undefined,
    source: "ai",
    timestamp: pred.timestamp || undefined,
    tier: pred.prediction?.tier?.replace("_", " ") || undefined,
  };
}

// ═══════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════

export default function OvernightView() {
  const [forceRefresh, setForceRefresh] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["/api/discovery/overnight-predictions", forceRefresh],
    queryFn: async () => {
      const url = forceRefresh
        ? "/api/discovery/overnight-predictions?refresh=true"
        : "/api/discovery/overnight-predictions";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch overnight predictions");
      setForceRefresh(false);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    retry: 2,
  });

  const predictions = data?.predictions || [];

  // Group by tier
  const highConviction = predictions.filter(
    (p: any) => p.prediction?.tier === "HIGH_CONVICTION"
  );
  const strongSetup = predictions.filter(
    (p: any) => p.prediction?.tier === "STRONG_SETUP"
  );
  const watchClosely = predictions.filter(
    (p: any) => p.prediction?.tier === "WATCH_CLOSELY"
  );
  const speculative = predictions.filter(
    (p: any) => p.prediction?.tier === "SPECULATIVE"
  );

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 border border-violet-500/40">
              <Sparkles className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                Tomorrow's Potential Surgers
              </h2>
              <p className="text-xs text-muted-foreground">
                Loading predictions...
              </p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-48 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (isError) {
    return (
      <div className="text-center py-16">
        <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-[var(--trade-bearish)] opacity-50" />
        <p className="text-[var(--trade-bearish)]">
          Failed to load overnight predictions
        </p>
        <Button variant="outline" className="mt-4" onClick={() => refetch()}>
          Try Again
        </Button>
      </div>
    );
  }

  // ── Render a tier section ──
  const renderSection = (
    items: any[],
    label: string,
    icon: React.ReactNode,
    badgeText: string,
    badgeClass: string
  ) => {
    if (items.length === 0) return null;
    return (
      <div>
        <div className="flex items-center gap-2 mb-4">
          {icon}
          <h3 className="text-sm font-semibold text-foreground">{label}</h3>
          <Badge className={cn("text-[10px]", badgeClass)}>{badgeText}</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((pred: any, idx: number) => (
            <TradeCard
              key={`${pred.symbol}-${idx}`}
              data={predictionToCardData(pred)}
              variant="full"
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 border border-violet-500/40">
            <Sparkles className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              Tomorrow's Potential Surgers
              <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/40 text-[10px]">
                PREDICTIVE AI
              </Badge>
            </h2>
            <p className="text-xs text-muted-foreground">
              Stocks showing overnight surge patterns &bull; Best scanned near
              market close
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 bg-muted border-border/50"
            onClick={() => {
              setForceRefresh(true);
              refetch();
            }}
            disabled={isLoading}
          >
            <RefreshCw
              className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")}
            />
            Refresh
          </Button>
          <Badge variant="outline" className="text-xs">
            {predictions.length} Predictions
          </Badge>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-violet-500/10 border-violet-500/30 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Star className="w-4 h-4 text-violet-400" />
            <span className="text-xs text-violet-400">High Conviction</span>
          </div>
          <div className="text-2xl font-bold text-violet-300">
            {highConviction.length}
          </div>
        </Card>
        <Card className="bg-[var(--trade-bullish)]/10 border-[var(--trade-bullish)]/30 p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-[var(--trade-bullish)]" />
            <span className="text-xs text-[var(--trade-bullish)]">
              Strong Setup
            </span>
          </div>
          <div className="text-2xl font-bold text-[var(--trade-bullish)]">
            {strongSetup.length}
          </div>
        </Card>
        <Card className="bg-[var(--trade-neutral)]/10 border-[var(--trade-neutral)]/30 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Eye className="w-4 h-4 text-[var(--trade-neutral)]" />
            <span className="text-xs text-[var(--trade-neutral)]">
              Watch Closely
            </span>
          </div>
          <div className="text-2xl font-bold text-amber-300">
            {watchClosely.length}
          </div>
        </Card>
        <Card className="bg-muted-foreground/10 border-muted-foreground/30 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Speculative</span>
          </div>
          <div className="text-2xl font-bold text-foreground/80">
            {speculative.length}
          </div>
        </Card>
      </div>

      {predictions.length === 0 ? (
        <div className="text-center py-16">
          <Clock className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">
            Generating overnight predictions...
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Best results when scanned near market close (3-4 PM ET)
          </p>
        </div>
      ) : (
        <>
          {renderSection(
            highConviction,
            "High Conviction Plays",
            <Star className="w-4 h-4 text-violet-400" />,
            "70%+ Probability",
            "bg-violet-500/20 text-violet-400"
          )}

          {renderSection(
            strongSetup,
            "Strong Setups",
            <TrendingUp className="w-4 h-4 text-[var(--trade-bullish)]" />,
            "55-70% Probability",
            "bg-[var(--trade-bullish)]/20 text-[var(--trade-bullish)]"
          )}

          {renderSection(
            watchClosely,
            "Watch Closely",
            <Eye className="w-4 h-4 text-[var(--trade-neutral)]" />,
            "40-55% Probability",
            "bg-[var(--trade-neutral)]/20 text-[var(--trade-neutral)]"
          )}

          {renderSection(
            speculative,
            "Speculative",
            <Activity className="w-4 h-4 text-muted-foreground" />,
            "<40% Probability",
            "bg-muted-foreground/20 text-muted-foreground"
          )}
        </>
      )}

      {/* Info Footer */}
      <Card className="bg-card border-border p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-violet-500/10">
            <Brain className="w-4 h-4 text-violet-400" />
          </div>
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground/80 mb-1">
              How Overnight Surge Prediction Works
            </p>
            <p>
              Our AI analyzes consolidation patterns, volume accumulation,
              after-hours activity, and sector momentum to identify stocks with
              high probability of significant moves the next trading day. Best
              used for weekly options plays on high-momentum stocks.
            </p>
          </div>
        </div>
      </Card>

      {data?.cached && (
        <p className="text-[9px] text-muted-foreground/70 text-center">
          Data cached {data.cacheAge}s ago &bull; Next refresh in{" "}
          {Math.max(0, 600 - (data.cacheAge || 0))}s
        </p>
      )}
    </div>
  );
}
