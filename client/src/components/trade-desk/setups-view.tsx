/**
 * SetupsView — Extracted from BestSetupsSubPage
 * Top conviction trade ideas with TradeCard rendering.
 */

import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TradeCard } from "@/components/ui/trade-card";
import type { TradeCardData } from "@/components/ui/trade-card";
import { cn, safeToFixed } from "@/lib/utils";
import { displayedGrade, displayedScore } from "@/lib/conviction-display";
import {
  Star,
  TrendingUp,
  Eye,
  RefreshCw,
} from "lucide-react";
import type { TradeIdea } from "@shared/schema";

// ── Map a setup object to TradeCardData ──

function setupToCardData(setup: any): TradeCardData {
  const grade = displayedGrade(setup);
  const numeric = displayedScore(setup);

  return {
    id: setup.id,
    symbol: setup.symbol,
    direction: (setup.direction === "LONG" || setup.direction === "long")
      ? "long"
      : "short",
    confidenceScore: typeof numeric === "number" ? numeric : parseFloat(numeric) || undefined,
    grade,
    entryPrice: setup.entryPrice || undefined,
    targetPrice: setup.targetPrice || undefined,
    stopLoss: setup.stopLoss || undefined,
    source:
      (setup as any).source === "tradingview"
        ? "tradingview"
        : setup.dataSourceUsed?.replace(/_/g, " ") ||
          setup.source?.replace(/_/g, " ") ||
          "scanner",
    catalyst: setup.catalyst || undefined,
    timestamp: setup.timestamp || undefined,
    assetType: setup.assetType || undefined,
    optionType: setup.optionType || undefined,
    strikePrice: setup.strikePrice || undefined,
    expiryDate: setup.expiryDate || undefined,
  };
}

// ═══════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════

export default function SetupsView() {
  const todayKey = new Date().toISOString().split("T")[0];
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/trade-ideas/best-setups", "subpage", "today", todayKey],
    queryFn: async () => {
      const res = await fetch(
        `/api/trade-ideas/best-setups?period=daily&limit=50&date=today&_t=${Date.now()}`
      );
      if (!res.ok) return { setups: [] };
      return res.json();
    },
    staleTime: 0,
    gcTime: 60 * 1000,
    refetchInterval: 60000,
  });

  const setups = data?.setups || [];

  // Group by grade using canonical displayedGrade
  const eliteSetups = setups.filter((s: any) =>
    ["A+", "A", "A-"].includes(displayedGrade(s))
  );
  const strongSetups = setups.filter((s: any) =>
    ["B+", "B", "B-"].includes(displayedGrade(s))
  );
  const otherSetups = setups.filter((s: any) => {
    const grade = displayedGrade(s);
    return !["A+", "A", "A-", "B+", "B", "B-"].includes(grade);
  });

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-yellow-500/20 border border-[var(--trade-neutral)]/40">
            <Star className="w-5 h-5 text-[var(--trade-neutral)]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Best Setups</h2>
            <p className="text-xs text-muted-foreground">
              Loading AI-picked trades...
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-40 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // ── Render a grade-group section ──
  const renderSection = (
    items: any[],
    label: string,
    icon: React.ReactNode
  ) => {
    if (items.length === 0) return null;
    return (
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          {icon} {label}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((setup: any) => (
            <TradeCard
              key={setup.id || `${setup.symbol}-${setup.timestamp}`}
              data={setupToCardData(setup)}
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
          <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-yellow-500/20 border border-[var(--trade-neutral)]/40">
            <Star className="w-5 h-5 text-[var(--trade-neutral)]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              Best Setups
              <Badge className="bg-[var(--trade-neutral)]/20 text-[var(--trade-neutral)] dark:text-[var(--trade-neutral)] border-[var(--trade-neutral)]/40 text-[10px]">
                CONVERGENCE
              </Badge>
            </h2>
            <p className="text-xs text-muted-foreground">
              Top conviction trade ideas from multi-engine convergence
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Badge variant="outline">{setups.length} Setups</Badge>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-[var(--trade-bullish)]/10 border-[var(--trade-bullish)]/30 p-4">
          <div className="text-xs text-[var(--trade-bullish)] mb-1">
            Elite (A Grade)
          </div>
          <div className="text-2xl font-bold text-[var(--trade-bullish)]">
            {eliteSetups.length}
          </div>
        </Card>
        <Card className="bg-blue-500/10 border-blue-500/30 p-4">
          <div className="text-xs text-blue-400 mb-1">Strong (B Grade)</div>
          <div className="text-2xl font-bold text-blue-300">
            {strongSetups.length}
          </div>
        </Card>
        <Card className="bg-muted-foreground/10 border-muted-foreground/30 p-4">
          <div className="text-xs text-muted-foreground mb-1">Watchlist</div>
          <div className="text-2xl font-bold text-foreground/80">
            {otherSetups.length}
          </div>
        </Card>
      </div>

      {setups.length === 0 ? (
        <div className="text-center py-16">
          <Star className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">
            Scanning engines for setups...
          </p>
        </div>
      ) : (
        <>
          {renderSection(
            eliteSetups,
            "Elite Setups (A Grade)",
            <Star className="w-4 h-4 text-[var(--trade-bullish)]" />
          )}

          {renderSection(
            strongSetups,
            "Strong Setups (B Grade)",
            <TrendingUp className="w-4 h-4 text-blue-400" />
          )}

          {renderSection(
            otherSetups,
            "Watchlist",
            <Eye className="w-4 h-4 text-muted-foreground" />
          )}
        </>
      )}
    </div>
  );
}
