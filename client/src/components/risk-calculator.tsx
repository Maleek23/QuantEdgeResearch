import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { calculatePositionSize, calculateRiskReward, formatCurrency, formatPercent, cn } from "@/lib/utils";
import { Calculator, TrendingUp, Shield, DollarSign } from "lucide-react";

export function RiskCalculator() {
  const [entryPrice, setEntryPrice] = useState<number>(100);
  const [stopLoss, setStopLoss] = useState<number>(95);
  const [targetPrice, setTargetPrice] = useState<number>(110);
  const [capitalAllocated, setCapitalAllocated] = useState<number>(1000);
  const [maxRiskPercent, setMaxRiskPercent] = useState<number>(5);

  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (entryPrice > 0 && stopLoss > 0 && targetPrice > 0 && capitalAllocated > 0 && maxRiskPercent > 0) {
      const positionSize = calculatePositionSize(entryPrice, stopLoss, capitalAllocated, maxRiskPercent);
      const riskReward = calculateRiskReward(entryPrice, stopLoss, targetPrice);
      const potentialProfit = positionSize.shares * (targetPrice - entryPrice);
      const stopLossPercent = ((stopLoss - entryPrice) / entryPrice) * 100;
      const targetPercent = ((targetPrice - entryPrice) / entryPrice) * 100;

      setResult({
        ...positionSize,
        riskReward,
        potentialProfit,
        stopLossPercent,
        targetPercent,
      });
    }
  }, [entryPrice, stopLoss, targetPrice, capitalAllocated, maxRiskPercent]);

  return (
    <Card data-testid="card-risk-calculator">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          <CardTitle>Position Size Calculator</CardTitle>
        </div>
        <CardDescription>
          Calculate optimal position sizing based on risk parameters
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="entry-price">Entry Price</Label>
            <Input
              id="entry-price"
              type="number"
              step="0.01"
              value={entryPrice}
              onChange={(e) => setEntryPrice(parseFloat(e.target.value) || 0)}
              className="font-mono"
              data-testid="input-entry-price"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="stop-loss">Stop Loss</Label>
            <Input
              id="stop-loss"
              type="number"
              step="0.01"
              value={stopLoss}
              onChange={(e) => setStopLoss(parseFloat(e.target.value) || 0)}
              className="font-mono"
              data-testid="input-stop-loss"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="target-price">Target Price</Label>
            <Input
              id="target-price"
              type="number"
              step="0.01"
              value={targetPrice}
              onChange={(e) => setTargetPrice(parseFloat(e.target.value) || 0)}
              className="font-mono"
              data-testid="input-target-price"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="capital">Capital Allocated</Label>
            <Input
              id="capital"
              type="number"
              step="100"
              value={capitalAllocated}
              onChange={(e) => setCapitalAllocated(parseFloat(e.target.value) || 0)}
              className="font-mono"
              data-testid="input-capital"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="max-risk">Max Risk Per Trade (%)</Label>
            <Input
              id="max-risk"
              type="number"
              step="0.1"
              value={maxRiskPercent}
              onChange={(e) => setMaxRiskPercent(parseFloat(e.target.value) || 0)}
              className="font-mono"
              data-testid="input-max-risk"
            />
          </div>
        </div>

        {result && (
          <>
            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-card rounded-lg border border-card-border">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-primary" />
                  <div>
                    <div className="text-sm text-muted-foreground">Position Size</div>
                    <div className="text-2xl font-bold font-mono" data-testid="text-position-size">
                      {result.shares} shares
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">Total Cost</div>
                  <div className="text-lg font-semibold font-mono">
                    {formatCurrency(result.shares * entryPrice)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-bearish/10 rounded-lg border border-bearish/20">
                  <div className="flex items-center gap-2 mb-1">
                    <Shield className="h-4 w-4 text-bearish" />
                    <span className="text-xs text-muted-foreground">Risk Amount</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-bearish" data-testid="text-risk-amount">
                    {formatCurrency(result.riskAmount)}
                  </div>
                  <div className="text-xs font-mono text-bearish mt-0.5">
                    {formatPercent(result.riskPercent)} of capital
                  </div>
                </div>

                <div className="p-3 bg-bullish/10 rounded-lg border border-bullish/20">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="h-4 w-4 text-bullish" />
                    <span className="text-xs text-muted-foreground">Potential Profit</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-bullish" data-testid="text-potential-profit">
                    {formatCurrency(result.potentialProfit)}
                  </div>
                  <div className="text-xs font-mono text-bullish mt-0.5">
                    {formatPercent(result.targetPercent)}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <span className="text-sm font-medium">Risk/Reward Ratio</span>
                <Badge variant="default" className="text-base font-bold px-3" data-testid="badge-risk-reward">
                  1:{result.riskReward.toFixed(2)}
                </Badge>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}