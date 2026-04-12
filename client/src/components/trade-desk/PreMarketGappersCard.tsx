/**
 * Pre-Market Gappers Card
 * =======================
 * Surfaces overnight movers from the user's weekly watchlist + approved
 * tickers, sorted by absolute gap %. Used as a leading direction signal
 * before the open.
 *
 * Auto-refreshes every 60s. Shows weekly watchlist gappers with a star.
 */

import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Star, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface Gapper {
  symbol: string;
  price: number;
  previousClose: number;
  gapPct: number;
  direction: "up" | "down" | "flat";
  phase: "pre_market" | "regular" | "post_market" | "closed";
  isWeekly: boolean;
}

interface GappersResponse {
  phase: "pre_market" | "regular" | "post_market" | "closed";
  scanned: number;
  gappers: Gapper[];
  generatedAt: string;
}

const PHASE_LABEL: Record<GappersResponse["phase"], string> = {
  pre_market: "Overnight Movers",
  regular: "Opening Gappers",
  post_market: "After-Hours Movers",
  closed: "Today's Biggest Movers",
};

const PHASE_HINT: Record<GappersResponse["phase"], string> = {
  pre_market: "Pre-market price vs. yesterday's close",
  regular: "Today's open vs. yesterday's close",
  post_market: "After-hours price vs. regular close",
  closed: "Most recent session change vs. prior close",
};

export default function PreMarketGappersCard() {
  const { data, isLoading, isError } = useQuery<GappersResponse>({
    queryKey: ["/api/premarket/gappers"],
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <Card className="p-3">
        <div className="text-xs text-muted-foreground">Loading pre-market gappers…</div>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card className="p-3">
        <div className="text-xs text-muted-foreground">Pre-market data unavailable</div>
      </Card>
    );
  }

  const top = data.gappers.slice(0, 12);

  return (
    <Card className="p-3 space-y-2" data-testid="card-premarket-gappers">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-amber-400" />
          <h3
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            title={PHASE_HINT[data.phase]}
          >
            {PHASE_LABEL[data.phase]}
          </h3>
        </div>
        <Badge variant="outline" className="text-[10px] h-5">
          {data.gappers.length} / {data.scanned}
        </Badge>
      </div>
      <div className="text-[10px] text-muted-foreground/60 leading-tight">
        {PHASE_HINT[data.phase]}
      </div>

      {top.length === 0 ? (
        <div className="text-xs text-muted-foreground/70 py-2">
          No significant overnight gaps in your universe.
        </div>
      ) : (
        <div className="space-y-1">
          {top.map((g) => {
            const isUp = g.direction === "up";
            const Icon = isUp ? TrendingUp : TrendingDown;
            return (
              <div
                key={g.symbol}
                className={cn(
                  "flex items-center justify-between text-xs px-2 py-1.5 rounded border",
                  g.isWeekly
                    ? "bg-amber-500/5 border-amber-500/30"
                    : "border-border/40 hover:bg-muted/30",
                )}
                data-testid={`gapper-${g.symbol}`}
              >
                <div className="flex items-center gap-2">
                  {g.isWeekly && (
                    <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                  )}
                  <span className="font-mono font-semibold">{g.symbol}</span>
                  <span className="text-muted-foreground/70 font-mono">
                    ${g.price.toFixed(2)}
                  </span>
                </div>
                <div
                  className={cn(
                    "flex items-center gap-1 font-mono font-semibold tabular-nums",
                    isUp ? "text-emerald-400" : "text-red-400",
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {g.gapPct >= 0 ? "+" : ""}
                  {g.gapPct.toFixed(2)}%
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
