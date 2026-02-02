import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent, getPriceChangeColor, cn, safeToFixed, safeNumber } from "@/lib/utils";
import type { MarketData } from "@shared/schema";
import { TrendingUp, TrendingDown } from "lucide-react";

interface PriceCardProps {
  data: MarketData;
  onClick?: () => void;
}

export function PriceCard({ data, onClick }: PriceCardProps) {
  const isPositive = data.changePercent > 0;
  const isNegative = data.changePercent < 0;

  return (
    <Card 
      className={cn("hover-elevate transition-all cursor-pointer", onClick && "active-elevate-2")} 
      onClick={onClick}
      data-testid={`card-price-${data.symbol}`}
    >
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="space-y-1 flex-1 min-w-0">
          <CardTitle className="text-base font-semibold font-mono truncate" data-testid={`text-symbol-${data.symbol}`}>
            {data.symbol}
          </CardTitle>
          <Badge variant="outline" className="text-xs" data-testid={`badge-asset-type-${data.symbol}`}>
            {data.assetType.toUpperCase()}
          </Badge>
        </div>
        <div className="flex items-center">
          {isPositive && <TrendingUp className="h-4 w-4 text-bullish mr-1" />}
          {isNegative && <TrendingDown className="h-4 w-4 text-bearish mr-1" />}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold font-mono" data-testid={`text-price-${data.symbol}`}>
            {formatCurrency(data.currentPrice)}
          </span>
          <span className={cn("text-sm font-semibold font-mono", getPriceChangeColor(data.changePercent))} data-testid={`text-change-${data.symbol}`}>
            {formatPercent(data.changePercent)}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Vol: <span className="font-mono" data-testid={`text-volume-${data.symbol}`}>{safeToFixed(safeNumber(data.volume) / 1000000, 2)}M</span></span>
          {data.marketCap && (
            <span>MCap: <span className="font-mono">{safeToFixed(safeNumber(data.marketCap) / 1000000000, 2)}B</span></span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}