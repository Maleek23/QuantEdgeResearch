import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Calculator, 
  Shield, 
  Target, 
  AlertTriangle, 
  TrendingUp,
  TrendingDown,
  DollarSign,
  CheckCircle,
  XCircle,
  Info,
  Zap
} from "lucide-react";

export default function TradingRules() {
  // Capital and position sizing state
  const [capital, setCapital] = useState<number>(300);
  const [optionPrice, setOptionPrice] = useState<number>(1.50);
  const [contracts, setContracts] = useState<number>(1);

  // Checklist state
  const [checklist, setChecklist] = useState({
    trendConfirmed: false,
    volumeCheck: false,
    riskCalculated: false,
    stopSet: false,
    targetSet: false,
    emotionCheck: false,
  });

  // Calculations
  const positionCost = optionPrice * 100 * contracts;
  const maxRiskPercent = 0.10; // 10% max risk per trade
  const maxRiskAmount = capital * maxRiskPercent;
  const stopLoss50 = optionPrice * 0.50; // 50% stop loss
  const stopLossAmount = stopLoss50 * 100 * contracts;
  const target50 = optionPrice * 1.50; // 50% gain
  const target100 = optionPrice * 2.00; // 100% gain (double)
  const target200 = optionPrice * 3.00; // 200% gain (triple)
  
  // Risk check
  const isWithinRisk = stopLossAmount <= maxRiskAmount;
  const suggestedContracts = Math.floor(maxRiskAmount / (optionPrice * 50)); // 50% stop loss

  // Weekly target calculations
  const weeklyTargetLow = 100;
  const weeklyTargetHigh = 500;
  const tradesNeededLow = Math.ceil(weeklyTargetLow / (optionPrice * 100 * 0.5)); // 50% gain per trade
  const tradesNeededHigh = Math.ceil(weeklyTargetHigh / (optionPrice * 100 * 1.0)); // 100% gain per trade

  const allChecked = Object.values(checklist).every(Boolean);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="pb-2">
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Trading Rules Portal</h1>
        <p className="text-sm text-muted-foreground">
          Options trading rules for consistent profits with small capital
        </p>
      </div>

      {/* Capital & Position Sizing */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card data-testid="card-position-sizing">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calculator className="h-5 w-5 text-primary" />
              Position Sizing Calculator
            </CardTitle>
            <CardDescription>Calculate position size based on your capital</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="capital">Trading Capital ($)</Label>
                <Input
                  id="capital"
                  type="number"
                  value={capital}
                  onChange={(e) => setCapital(Number(e.target.value))}
                  className="font-mono"
                  data-testid="input-capital"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="optionPrice">Option Price ($)</Label>
                <Input
                  id="optionPrice"
                  type="number"
                  step="0.05"
                  value={optionPrice}
                  onChange={(e) => setOptionPrice(Number(e.target.value))}
                  className="font-mono"
                  data-testid="input-option-price"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contracts">Number of Contracts</Label>
                <Input
                  id="contracts"
                  type="number"
                  min={1}
                  value={contracts}
                  onChange={(e) => setContracts(Number(e.target.value))}
                  className="font-mono"
                  data-testid="input-contracts"
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Position Cost:</span>
                <span className="font-mono font-medium">${positionCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Max Risk (10%):</span>
                <span className="font-mono font-medium">${maxRiskAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Stop Loss (50%):</span>
                <span className="font-mono font-medium text-red-500">-${stopLossAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm items-center">
                <span className="text-muted-foreground">Risk Status:</span>
                {isWithinRisk ? (
                  <Badge variant="default" className="bg-green-500/20 text-green-600 border-green-500/30">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Within Limits
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <XCircle className="h-3 w-3 mr-1" />
                    Too Risky
                  </Badge>
                )}
              </div>
              {!isWithinRisk && (
                <Alert className="border-amber-500/30 bg-amber-500/10">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <AlertDescription className="text-sm">
                    Suggested: {suggestedContracts} contract(s) max for this price
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Stop Loss & Take Profit Calculator */}
        <Card data-testid="card-stop-target">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5 text-primary" />
              Stop Loss & Targets
            </CardTitle>
            <CardDescription>Pre-calculated exit levels for your option</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="h-4 w-4 text-red-500" />
                <span className="font-medium text-red-500">Stop Loss (50% drop)</span>
              </div>
              <div className="text-2xl font-mono font-bold text-red-500">
                ${stopLoss50.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Exit immediately if option drops to this price. Loss: -${stopLossAmount.toFixed(2)}
              </p>
            </div>

            <div className="space-y-2">
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium text-green-500">Target 1 (50%)</span>
                  </div>
                  <span className="text-lg font-mono font-bold text-green-500">${target50.toFixed(2)}</span>
                </div>
                <p className="text-xs text-muted-foreground">Sell half, lock in +${(optionPrice * 50 * contracts).toFixed(2)}</p>
              </div>

              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-green-600">Target 2 (100%)</span>
                  </div>
                  <span className="text-lg font-mono font-bold text-green-600">${target100.toFixed(2)}</span>
                </div>
                <p className="text-xs text-muted-foreground">Double your money: +${(optionPrice * 100 * contracts).toFixed(2)}</p>
              </div>

              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-green-700" />
                    <span className="text-sm font-medium text-green-700">Target 3 (200%)</span>
                  </div>
                  <span className="text-lg font-mono font-bold text-green-700">${target200.toFixed(2)}</span>
                </div>
                <p className="text-xs text-muted-foreground">Triple up: +${(optionPrice * 200 * contracts).toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Core Trading Rules */}
      <Card data-testid="card-trading-rules">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5 text-primary" />
            Core Trading Rules
          </CardTitle>
          <CardDescription>Follow these rules strictly for consistent results</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {/* Risk Management */}
            <div className="space-y-3">
              <h4 className="font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Risk Management
              </h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <Badge variant="outline" className="mt-0.5 shrink-0">1</Badge>
                  <span><strong>10% Max Risk:</strong> Never risk more than 10% of capital on a single trade (${maxRiskAmount.toFixed(0)} max loss)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Badge variant="outline" className="mt-0.5 shrink-0">2</Badge>
                  <span><strong>50% Stop Loss:</strong> Exit if option drops 50% from entry. No exceptions.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Badge variant="outline" className="mt-0.5 shrink-0">3</Badge>
                  <span><strong>3 Trades Max/Week:</strong> Quality over quantity. Wait for A+ setups only.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Badge variant="outline" className="mt-0.5 shrink-0">4</Badge>
                  <span><strong>Daily Loss Limit:</strong> Stop trading after 2 consecutive losses in a day.</span>
                </li>
              </ul>
            </div>

            {/* Entry Rules */}
            <div className="space-y-3">
              <h4 className="font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                Entry Rules
              </h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <Badge variant="outline" className="mt-0.5 shrink-0">1</Badge>
                  <span><strong>Trend Confirmation:</strong> Only trade in direction of the trend (use 20 EMA)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Badge variant="outline" className="mt-0.5 shrink-0">2</Badge>
                  <span><strong>Volume Spike:</strong> Enter only when volume is 1.5x+ average</span>
                </li>
                <li className="flex items-start gap-2">
                  <Badge variant="outline" className="mt-0.5 shrink-0">3</Badge>
                  <span><strong>Delta 0.40-0.60:</strong> Buy ATM or slightly ITM options for better odds</span>
                </li>
                <li className="flex items-start gap-2">
                  <Badge variant="outline" className="mt-0.5 shrink-0">4</Badge>
                  <span><strong>7-14 DTE:</strong> Choose expiration 7-14 days out to balance cost vs. time decay</span>
                </li>
              </ul>
            </div>

            {/* Exit Rules */}
            <div className="space-y-3">
              <h4 className="font-semibold flex items-center gap-2">
                <Target className="h-4 w-4 text-blue-500" />
                Exit Rules
              </h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <Badge variant="outline" className="mt-0.5 shrink-0">1</Badge>
                  <span><strong>Scale Out at 50%:</strong> Sell half position at 50% profit to lock in gains</span>
                </li>
                <li className="flex items-start gap-2">
                  <Badge variant="outline" className="mt-0.5 shrink-0">2</Badge>
                  <span><strong>Trail Stop:</strong> After 50% gain, move stop to breakeven</span>
                </li>
                <li className="flex items-start gap-2">
                  <Badge variant="outline" className="mt-0.5 shrink-0">3</Badge>
                  <span><strong>Close by Thursday:</strong> Exit weekly options by Thursday to avoid Friday decay</span>
                </li>
                <li className="flex items-start gap-2">
                  <Badge variant="outline" className="mt-0.5 shrink-0">4</Badge>
                  <span><strong>No Overnight Holds:</strong> Close all 0DTE positions before market close</span>
                </li>
              </ul>
            </div>

            {/* Avoid */}
            <div className="space-y-3">
              <h4 className="font-semibold flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                Things to Avoid
              </h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <Badge variant="destructive" className="mt-0.5 shrink-0">X</Badge>
                  <span><strong>Revenge Trading:</strong> Never chase losses with bigger positions</span>
                </li>
                <li className="flex items-start gap-2">
                  <Badge variant="destructive" className="mt-0.5 shrink-0">X</Badge>
                  <span><strong>FOMO Entries:</strong> If you missed the move, wait for next setup</span>
                </li>
                <li className="flex items-start gap-2">
                  <Badge variant="destructive" className="mt-0.5 shrink-0">X</Badge>
                  <span><strong>Cheap Far-OTM:</strong> Avoid lottery tickets with delta {"<"}0.20</span>
                </li>
                <li className="flex items-start gap-2">
                  <Badge variant="destructive" className="mt-0.5 shrink-0">X</Badge>
                  <span><strong>Earnings Plays:</strong> Skip binary events until capital grows</span>
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Weekly Goal Tracker */}
      <Card data-testid="card-weekly-goal">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <DollarSign className="h-5 w-5 text-primary" />
            Weekly Profit Goal
          </CardTitle>
          <CardDescription>Based on your ${capital} capital and ${optionPrice.toFixed(2)} options</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 rounded-lg bg-muted/50 text-center">
              <div className="text-2xl font-bold text-green-500">${weeklyTargetLow}</div>
              <div className="text-sm text-muted-foreground">Conservative</div>
              <div className="text-xs text-muted-foreground mt-1">
                ~{tradesNeededLow} winning trade(s) at 50%
              </div>
            </div>
            <div className="p-4 rounded-lg bg-primary/10 border-2 border-primary/30 text-center">
              <div className="text-2xl font-bold text-primary">${(weeklyTargetLow + weeklyTargetHigh) / 2}</div>
              <div className="text-sm text-muted-foreground">Target</div>
              <div className="text-xs text-muted-foreground mt-1">
                2-3 solid trades per week
              </div>
            </div>
            <div className="p-4 rounded-lg bg-muted/50 text-center">
              <div className="text-2xl font-bold text-amber-500">${weeklyTargetHigh}</div>
              <div className="text-sm text-muted-foreground">Aggressive</div>
              <div className="text-xs text-muted-foreground mt-1">
                ~{tradesNeededHigh} trade(s) at 100%
              </div>
            </div>
          </div>
          <Alert className="mt-4 border-blue-500/30 bg-blue-500/10">
            <Info className="h-4 w-4 text-blue-500" />
            <AlertDescription className="text-sm">
              Focus on consistency. A 33% win rate with 2:1 reward:risk is profitable long-term. Don't chase weekly targets if setups aren't there.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Pre-Trade Checklist */}
      <Card data-testid="card-checklist">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CheckCircle className="h-5 w-5 text-primary" />
            Pre-Trade Checklist
          </CardTitle>
          <CardDescription>Complete all items before entering any trade</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center space-x-3 p-3 rounded-lg border hover-elevate">
              <Checkbox 
                id="trend" 
                checked={checklist.trendConfirmed}
                onCheckedChange={(checked) => setChecklist(prev => ({ ...prev, trendConfirmed: !!checked }))}
                data-testid="check-trend"
              />
              <Label htmlFor="trend" className="flex-1 cursor-pointer">
                Trend confirmed with 20 EMA
              </Label>
            </div>
            <div className="flex items-center space-x-3 p-3 rounded-lg border hover-elevate">
              <Checkbox 
                id="volume" 
                checked={checklist.volumeCheck}
                onCheckedChange={(checked) => setChecklist(prev => ({ ...prev, volumeCheck: !!checked }))}
                data-testid="check-volume"
              />
              <Label htmlFor="volume" className="flex-1 cursor-pointer">
                Volume above average (1.5x+)
              </Label>
            </div>
            <div className="flex items-center space-x-3 p-3 rounded-lg border hover-elevate">
              <Checkbox 
                id="risk" 
                checked={checklist.riskCalculated}
                onCheckedChange={(checked) => setChecklist(prev => ({ ...prev, riskCalculated: !!checked }))}
                data-testid="check-risk"
              />
              <Label htmlFor="risk" className="flex-1 cursor-pointer">
                Position size within 10% risk limit
              </Label>
            </div>
            <div className="flex items-center space-x-3 p-3 rounded-lg border hover-elevate">
              <Checkbox 
                id="stop" 
                checked={checklist.stopSet}
                onCheckedChange={(checked) => setChecklist(prev => ({ ...prev, stopSet: !!checked }))}
                data-testid="check-stop"
              />
              <Label htmlFor="stop" className="flex-1 cursor-pointer">
                Stop loss price calculated
              </Label>
            </div>
            <div className="flex items-center space-x-3 p-3 rounded-lg border hover-elevate">
              <Checkbox 
                id="target" 
                checked={checklist.targetSet}
                onCheckedChange={(checked) => setChecklist(prev => ({ ...prev, targetSet: !!checked }))}
                data-testid="check-target"
              />
              <Label htmlFor="target" className="flex-1 cursor-pointer">
                Profit targets set (50%, 100%)
              </Label>
            </div>
            <div className="flex items-center space-x-3 p-3 rounded-lg border hover-elevate">
              <Checkbox 
                id="emotion" 
                checked={checklist.emotionCheck}
                onCheckedChange={(checked) => setChecklist(prev => ({ ...prev, emotionCheck: !!checked }))}
                data-testid="check-emotion"
              />
              <Label htmlFor="emotion" className="flex-1 cursor-pointer">
                Emotionally neutral (not tilted)
              </Label>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setChecklist({
                trendConfirmed: false,
                volumeCheck: false,
                riskCalculated: false,
                stopSet: false,
                targetSet: false,
                emotionCheck: false,
              })}
              data-testid="button-reset-checklist"
            >
              Reset Checklist
            </Button>
            {allChecked ? (
              <Badge className="bg-green-500/20 text-green-600 border-green-500/30 text-sm py-1 px-3">
                <CheckCircle className="h-4 w-4 mr-2" />
                Ready to Trade
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-sm py-1 px-3">
                {Object.values(checklist).filter(Boolean).length}/6 Complete
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
