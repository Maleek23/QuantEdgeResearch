import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn, safeToFixed, safeNumber } from "@/lib/utils";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Zap,
  Flame,
  TrendingUp,
  Sparkles,
  Clock,
  RefreshCw,
} from "lucide-react";

function SurgeCard({ stock, type }: { stock: any; type: string }) {
  return (
    <Link href={`/stock/${stock.symbol}`}>
      <Card
        className={cn(
          "cursor-pointer transition-all duration-200 hover:-translate-y-0.5",
          stock.tier === "SURGE"
            ? "bg-rose-500/8 border-rose-500/25 hover:border-rose-400/50"
            : stock.tier === "MOMENTUM"
              ? "bg-[var(--trade-neutral)]/8 border-[var(--trade-neutral)]/25 hover:border-amber-400/50"
              : "bg-blue-500/8 border-blue-500/25 hover:border-blue-400/50",
          stock.hasCatalyst && "ring-1 ring-purple-500/40"
        )}
      >
        <CardContent className="p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-[10px] font-mono relative",
                  stock.tier === "SURGE"
                    ? "bg-rose-500/15 text-rose-400"
                    : stock.tier === "MOMENTUM"
                      ? "bg-[var(--trade-neutral)]/15 text-[var(--trade-neutral)]"
                      : "bg-blue-500/15 text-blue-400"
                )}
              >
                {stock.symbol.slice(0, 2)}
                {stock.hasCatalyst && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-purple-500 flex items-center justify-center text-[7px]">
                    {stock.catalyst?.icon || "!"}
                  </span>
                )}
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-foreground">
                    {stock.symbol}
                  </span>
                  <Badge
                    className={cn(
                      "text-[8px] px-1 py-0",
                      stock.tier === "SURGE"
                        ? "bg-rose-500/20 text-rose-400"
                        : stock.tier === "MOMENTUM"
                          ? "bg-[var(--trade-neutral)]/20 text-[var(--trade-neutral)]"
                          : "bg-blue-500/20 text-blue-400"
                    )}
                  >
                    {stock.tier}
                  </Badge>
                  {stock.hasCatalyst && stock.catalyst && (
                    <Badge className="text-[8px] px-1 py-0 bg-purple-500/20 text-purple-300 border-purple-500/30">
                      {stock.catalyst.icon} Catalyst
                    </Badge>
                  )}
                </div>
                {stock.hasCatalyst && stock.catalyst?.title && (
                  <p className="text-[9px] text-purple-300/80 mt-0.5 truncate max-w-[160px]">
                    {stock.catalyst.title}
                  </p>
                )}
              </div>
            </div>
            <div className="text-right">
              <div
                className={cn(
                  "text-sm font-bold font-mono tabular-nums",
                  safeNumber(stock.change) > 0
                    ? "text-[var(--trade-bullish)]"
                    : "text-[var(--trade-bearish)]"
                )}
              >
                {safeNumber(stock.change) > 0 ? "+" : ""}
                {safeToFixed(stock.change, 1)}%
              </div>
              <div className="text-[10px] font-mono tabular-nums text-muted-foreground">
                ${safeToFixed(stock.price, 2)}
              </div>
            </div>
          </div>
          <p className="text-[9px] text-muted-foreground truncate">
            {stock.reason}
          </p>
          {stock.score && (
            <div className="mt-1.5 h-0.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-emerald-500"
                style={{ width: `${stock.score}%` }}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function TomorrowCard({ pred }: { pred: any }) {
  return (
    <Link href={`/stock/${pred.symbol}`}>
      <Card
        className={cn(
          "cursor-pointer transition-all duration-200 hover:-translate-y-0.5",
          pred.prediction?.tier === "HIGH_CONVICTION"
            ? "bg-violet-500/8 border-violet-500/25 hover:border-violet-400/50"
            : pred.prediction?.tier === "STRONG_SETUP"
              ? "bg-[var(--trade-bullish)]/8 border-[var(--trade-bullish)]/25 hover:border-cyan-400/50"
              : "bg-muted-foreground/8 border-muted-foreground/25 hover:border-muted-foreground/50",
          pred.hasCatalyst && "ring-1 ring-purple-500/40"
        )}
      >
        <CardContent className="p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-[10px] font-mono relative",
                  pred.prediction?.tier === "HIGH_CONVICTION"
                    ? "bg-violet-500/15 text-violet-400"
                    : "bg-[var(--trade-bullish)]/15 text-[var(--trade-bullish)]"
                )}
              >
                {pred.symbol.slice(0, 2)}
                {pred.hasCatalyst && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-purple-500 flex items-center justify-center text-[7px]">
                    {pred.catalyst?.icon || "!"}
                  </span>
                )}
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-foreground">
                    {pred.symbol}
                  </span>
                  {pred.prediction?.tier === "HIGH_CONVICTION" && (
                    <Sparkles className="w-3 h-3 text-violet-400" />
                  )}
                  {pred.hasCatalyst && pred.catalyst && (
                    <Badge className="text-[8px] px-1 py-0 bg-purple-500/20 text-purple-300 border-purple-500/30">
                      {pred.catalyst.icon} Catalyst
                    </Badge>
                  )}
                </div>
                {pred.hasCatalyst && pred.catalyst?.title && (
                  <p className="text-[9px] text-purple-300/80 mt-0.5 truncate max-w-[160px]">
                    {pred.catalyst.title}
                  </p>
                )}
              </div>
            </div>
            <div className="text-right">
              <div
                className={cn(
                  "text-sm font-bold font-mono tabular-nums",
                  pred.prediction?.tier === "HIGH_CONVICTION"
                    ? "text-violet-400"
                    : "text-[var(--trade-bullish)]"
                )}
              >
                {safeToFixed(pred.prediction?.probability, 0)}%
              </div>
              <div className="text-[10px] font-mono tabular-nums text-muted-foreground">
                ${safeToFixed(pred.currentPrice, 2)}
              </div>
            </div>
          </div>
          {pred.prediction?.targetRange && (
            <div className="text-[9px] text-muted-foreground font-mono tabular-nums">
              Target: ${safeToFixed(pred.prediction.targetRange.low, 2)} - $
              {safeToFixed(pred.prediction.targetRange.high, 2)}
            </div>
          )}
          {pred.signals && pred.signals.length > 0 && (
            <div className="flex flex-wrap gap-0.5 mt-1.5">
              {pred.signals.slice(0, 3).map((signal: any, idx: number) => (
                <span
                  key={idx}
                  className="text-[8px] px-1 py-0 rounded bg-muted/50 text-foreground/80"
                >
                  {signal.name || signal}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function SurgesView() {
  const [activeSubTab, setActiveSubTab] = useState<
    "now" | "early" | "tomorrow"
  >("now");

  const {
    data: breakoutData,
    isLoading: breakoutLoading,
    refetch: refetchBreakouts,
  } = useQuery({
    queryKey: ["/api/discovery/breakouts", "subpage"],
    queryFn: async () => {
      const res = await fetch("/api/discovery/breakouts");
      if (!res.ok) throw new Error("Failed to fetch surge data");
      return res.json();
    },
    staleTime: 4 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: preBreakoutData, isLoading: preLoading } = useQuery({
    queryKey: ["/api/discovery/pre-breakout", "subpage"],
    queryFn: async () => {
      const res = await fetch("/api/discovery/pre-breakout");
      if (!res.ok) throw new Error("Failed to fetch pre-breakout data");
      return res.json();
    },
    staleTime: 4 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: overnightData, isLoading: overnightLoading } = useQuery({
    queryKey: ["/api/discovery/overnight-predictions", "subpage"],
    queryFn: async () => {
      const res = await fetch("/api/discovery/overnight-predictions");
      if (!res.ok) throw new Error("Failed to fetch overnight predictions");
      return res.json();
    },
    staleTime: 8 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  const allCandidates = breakoutData?.candidates || [];
  const surgeMomentum = allCandidates.filter(
    (c: any) => c.tier === "SURGE" || c.tier === "MOMENTUM"
  );
  const setupTier = allCandidates.filter(
    (c: any) => c.tier === "SETUP" || c.score >= 50
  );
  const surges =
    surgeMomentum.length > 0
      ? surgeMomentum
      : setupTier.length > 0
        ? setupTier
        : allCandidates;
  const earlySetups = preBreakoutData?.candidates || [];
  const tomorrowPlays = overnightData?.predictions || [];

  const isLoading =
    activeSubTab === "now"
      ? breakoutLoading
      : activeSubTab === "early"
        ? preLoading
        : overnightLoading;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-[var(--trade-neutral)]/40">
            <Zap className="w-4 h-4 text-[var(--trade-neutral)]" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              Surge Detection
              <Badge className="bg-[var(--trade-neutral)]/20 text-[var(--trade-neutral)] border-[var(--trade-neutral)]/40 text-[9px] px-1.5 py-0">
                REAL-TIME
              </Badge>
            </h2>
            <p className="text-[9px] text-muted-foreground">
              Momentum & pre-breakout detection system
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => refetchBreakouts()}
        >
          <RefreshCw className="w-3 h-3 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* Sub-tabs: Now / Early / Tomorrow */}
      <div className="flex items-center gap-1.5 p-0.5 bg-muted rounded-lg w-fit">
        <Button
          variant={activeSubTab === "now" ? "default" : "ghost"}
          size="sm"
          className={cn(
            "h-7 text-xs",
            activeSubTab === "now" && "bg-amber-600"
          )}
          onClick={() => setActiveSubTab("now")}
        >
          <Flame className="w-3 h-3 mr-1.5" /> Now ({surges.length})
        </Button>
        <Button
          variant={activeSubTab === "early" ? "default" : "ghost"}
          size="sm"
          className={cn(
            "h-7 text-xs",
            activeSubTab === "early" && "bg-blue-600"
          )}
          onClick={() => setActiveSubTab("early")}
        >
          <TrendingUp className="w-3 h-3 mr-1.5" /> Early ({earlySetups.length})
        </Button>
        <Button
          variant={activeSubTab === "tomorrow" ? "default" : "ghost"}
          size="sm"
          className={cn(
            "h-7 text-xs",
            activeSubTab === "tomorrow" && "bg-violet-600"
          )}
          onClick={() => setActiveSubTab("tomorrow")}
        >
          <Sparkles className="w-3 h-3 mr-1.5" /> Tomorrow (
          {tomorrowPlays.length})
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : activeSubTab === "now" ? (
        surges.length === 0 ? (
          <div className="text-center py-12">
            <Zap className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-xs text-muted-foreground">
              Market calm -- monitoring momentum right now
            </p>
            <p className="text-[9px] text-muted-foreground mt-1">
              Scanning market for momentum signals...
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {surges.map((stock: any) => (
              <SurgeCard
                key={`${stock.symbol}-now`}
                stock={stock}
                type="now"
              />
            ))}
          </div>
        )
      ) : activeSubTab === "early" ? (
        earlySetups.length === 0 ? (
          <div className="text-center py-12">
            <TrendingUp className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-xs text-muted-foreground">
              Scanning for early-stage signals...
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {earlySetups.map((stock: any) => (
              <SurgeCard
                key={`${stock.symbol}-early`}
                stock={stock}
                type="early"
              />
            ))}
          </div>
        )
      ) : tomorrowPlays.length === 0 ? (
        <div className="text-center py-12">
          <Clock className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-xs text-muted-foreground">
            Generating overnight predictions...
          </p>
          <p className="text-[9px] text-muted-foreground mt-1">
            Best scanned near market close (3-4 PM ET)
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {tomorrowPlays.map((pred: any) => (
            <TomorrowCard key={pred.symbol} pred={pred} />
          ))}
        </div>
      )}
    </div>
  );
}
