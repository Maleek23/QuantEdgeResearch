import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatPercent, formatCTTime, cn } from "@/lib/utils";
import type { TradeIdea } from "@shared/schema";
import { AlertTriangle, TrendingUp, TrendingDown, Target, Shield, DollarSign } from "lucide-react";

interface TradeIdeaCardProps {
  idea: TradeIdea;
}

export function TradeIdeaCard({ idea }: TradeIdeaCardProps) {
  const isLong = idea.direction === 'long';
  const stopLossPercent = ((idea.stopLoss - idea.entryPrice) / idea.entryPrice) * 100;
  const targetPercent = ((idea.targetPrice - idea.entryPrice) / idea.entryPrice) * 100;

  return (
    <Card className="hover-elevate transition-all" data-testid={`card-trade-idea-${idea.symbol}`}>
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-xl font-bold font-mono" data-testid={`text-trade-symbol-${idea.symbol}`}>
                {idea.symbol}
              </CardTitle>
              <Badge variant={isLong ? "default" : "destructive"} className="font-semibold" data-testid={`badge-direction-${idea.symbol}`}>
                {isLong ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                {idea.direction.toUpperCase()}
              </Badge>
              <Badge variant="outline" className="text-xs">{idea.assetType.toUpperCase()}</Badge>
            </div>
            <CardDescription className="mt-2 text-xs" data-testid={`text-trade-time-${idea.symbol}`}>
              {formatCTTime(idea.timestamp)} • {idea.sessionContext}
            </CardDescription>
          </div>
          {idea.liquidityWarning && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              Low Liquidity
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Catalyst:</span>
          <span className="font-medium" data-testid={`text-catalyst-${idea.symbol}`}>{idea.catalyst}</span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              <span>Entry</span>
            </div>
            <div className="text-lg font-bold font-mono" data-testid={`text-entry-${idea.symbol}`}>
              {formatCurrency(idea.entryPrice)}
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Target className="h-3 w-3" />
              <span>Target</span>
            </div>
            <div className="space-y-0.5">
              <div className="text-lg font-bold font-mono text-bullish" data-testid={`text-target-${idea.symbol}`}>
                {formatCurrency(idea.targetPrice)}
              </div>
              <div className="text-xs font-mono text-bullish">
                {formatPercent(targetPercent)}
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Shield className="h-3 w-3" />
              <span>Stop Loss</span>
            </div>
            <div className="space-y-0.5">
              <div className="text-lg font-bold font-mono text-bearish" data-testid={`text-stoploss-${idea.symbol}`}>
                {formatCurrency(idea.stopLoss)}
              </div>
              <div className="text-xs font-mono text-bearish">
                {formatPercent(stopLossPercent)}
              </div>
            </div>
          </div>
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Badge 
              variant={idea.riskRewardRatio >= 2 ? "default" : "secondary"} 
              className={cn(
                "text-base font-bold py-1.5 px-3",
                idea.riskRewardRatio >= 2 && "bg-bullish hover:bg-bullish"
              )}
              data-testid={`badge-risk-reward-${idea.symbol}`}
            >
              {idea.riskRewardRatio.toFixed(2)}:1 R:R
            </Badge>
            <div className="space-y-0.5">
              <div className="text-xs text-muted-foreground">Risk/Reward Ratio</div>
              <div className="text-xs font-mono">
                <span className="text-bullish font-semibold">{formatPercent(targetPercent)}</span>
                <span className="text-muted-foreground mx-1">/</span>
                <span className="text-bearish font-semibold">{formatPercent(Math.abs(stopLossPercent))}</span>
              </div>
            </div>
          </div>
          {idea.expiryDate && (
            <div className="space-y-1 text-right">
              <div className="text-xs text-muted-foreground">Expiry</div>
              <div className="text-sm font-mono font-medium">{idea.expiryDate}</div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Analysis</div>
          <p className="text-sm text-muted-foreground leading-relaxed" data-testid={`text-analysis-${idea.symbol}`}>
            {idea.analysis}
          </p>
        </div>

        <div className="bg-muted/50 rounded-md p-3 border border-muted-border">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Educational Research Only:</strong> This is not financial advice. 
            Trade ideas are for research and educational purposes. Consider liquidity, volatility, and your own risk tolerance. 
            Never risk more than you can afford to lose.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}