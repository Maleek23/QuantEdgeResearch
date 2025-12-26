import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Zap,
  BarChart3,
  Bitcoin,
  Briefcase
} from "lucide-react";

type AssetType = 'options' | 'stocks' | 'crypto';

export default function TradingRules() {
  const [assetType, setAssetType] = useState<AssetType>('options');
  
  // Shared capital state
  const [capital, setCapital] = useState<number>(300);
  
  // Options-specific state
  const [optionPrice, setOptionPrice] = useState<number>(1.50);
  const [contracts, setContracts] = useState<number>(1);
  
  // Stocks-specific state
  const [stockPrice, setStockPrice] = useState<number>(150);
  const [shares, setShares] = useState<number>(10);
  
  // Crypto-specific state
  const [cryptoPrice, setCryptoPrice] = useState<number>(45000);
  const [cryptoAmount, setCryptoAmount] = useState<number>(0.01);

  // Checklist state - varies by asset type
  const [checklist, setChecklist] = useState({
    trendConfirmed: false,
    volumeCheck: false,
    riskCalculated: false,
    stopSet: false,
    targetSet: false,
    emotionCheck: false,
  });

  // Options calculations
  const optionsPositionCost = optionPrice * 100 * contracts;
  const optionsMaxRiskPercent = 0.10;
  const optionsMaxRiskAmount = capital * optionsMaxRiskPercent;
  const optionsStopLoss50 = optionPrice * 0.50;
  const optionsStopLossAmount = optionsStopLoss50 * 100 * contracts;
  const optionsIsWithinRisk = optionsStopLossAmount <= optionsMaxRiskAmount;
  const optionsSuggestedContracts = Math.floor(optionsMaxRiskAmount / (optionPrice * 50));
  const optionsTarget50 = optionPrice * 1.50;
  const optionsTarget100 = optionPrice * 2.00;
  const optionsTarget200 = optionPrice * 3.00;

  // Stocks calculations (3.5% stop loss per quant engine)
  const stocksPositionCost = stockPrice * shares;
  const stocksMaxRiskPercent = 0.10;
  const stocksMaxRiskAmount = capital * stocksMaxRiskPercent;
  const stocksStopLossPercent = 0.035; // 3.5% stop
  const stocksStopLossPrice = stockPrice * (1 - stocksStopLossPercent);
  const stocksStopLossAmount = stockPrice * stocksStopLossPercent * shares;
  const stocksIsWithinRisk = stocksStopLossAmount <= stocksMaxRiskAmount;
  const stocksSuggestedShares = Math.floor(stocksMaxRiskAmount / (stockPrice * stocksStopLossPercent));
  const stocksTarget1 = stockPrice * 1.07; // 7% target (2:1 R:R)
  const stocksTarget2 = stockPrice * 1.105; // 10.5% target (3:1 R:R)

  // Crypto calculations (5% stop loss per quant engine)
  const cryptoPositionCost = cryptoPrice * cryptoAmount;
  const cryptoMaxRiskPercent = 0.10;
  const cryptoMaxRiskAmount = capital * cryptoMaxRiskPercent;
  const cryptoStopLossPercent = 0.05; // 5% stop
  const cryptoStopLossPrice = cryptoPrice * (1 - cryptoStopLossPercent);
  const cryptoStopLossAmount = cryptoPrice * cryptoStopLossPercent * cryptoAmount;
  const cryptoIsWithinRisk = cryptoStopLossAmount <= cryptoMaxRiskAmount;
  const cryptoTarget1 = cryptoPrice * 1.10; // 10% target (2:1 R:R)
  const cryptoTarget2 = cryptoPrice * 1.15; // 15% target (3:1 R:R)

  const allChecked = Object.values(checklist).every(Boolean);

  const resetChecklist = () => {
    setChecklist({
      trendConfirmed: false,
      volumeCheck: false,
      riskCalculated: false,
      stopSet: false,
      targetSet: false,
      emotionCheck: false,
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="pb-2">
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Trading Rules Portal</h1>
        <p className="text-sm text-muted-foreground">
          Risk management and trading rules for consistent profits
        </p>
      </div>

      {/* Asset Type Navigation */}
      <Tabs value={assetType} onValueChange={(v) => setAssetType(v as AssetType)} className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md" data-testid="tabs-asset-type">
          <TabsTrigger value="options" className="flex items-center gap-2" data-testid="tab-options">
            <Briefcase className="h-4 w-4" />
            Options
          </TabsTrigger>
          <TabsTrigger value="stocks" className="flex items-center gap-2" data-testid="tab-stocks">
            <BarChart3 className="h-4 w-4" />
            Stocks
          </TabsTrigger>
          <TabsTrigger value="crypto" className="flex items-center gap-2" data-testid="tab-crypto">
            <Bitcoin className="h-4 w-4" />
            Crypto
          </TabsTrigger>
        </TabsList>

        {/* ======================= OPTIONS TAB ======================= */}
        <TabsContent value="options" className="space-y-6 mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Options Position Sizing Calculator */}
            <Card data-testid="card-options-sizing">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calculator className="h-5 w-5 text-primary" />
                  Options Position Sizing
                </CardTitle>
                <CardDescription>Calculate position size based on your capital</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="capital-options">Trading Capital ($)</Label>
                    <Input
                      id="capital-options"
                      type="number"
                      value={capital}
                      onChange={(e) => setCapital(Number(e.target.value))}
                      className="font-mono"
                      data-testid="input-capital-options"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="optionPrice">Option Premium ($)</Label>
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
                    <span className="font-mono font-medium">${optionsPositionCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Max Risk (10%):</span>
                    <span className="font-mono font-medium">${optionsMaxRiskAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Stop Loss (50%):</span>
                    <span className="font-mono font-medium text-red-500">-${optionsStopLossAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm items-center">
                    <span className="text-muted-foreground">Risk Status:</span>
                    {optionsIsWithinRisk ? (
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
                  {!optionsIsWithinRisk && (
                    <Alert className="border-amber-500/30 bg-amber-500/10">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <AlertDescription className="text-sm">
                        Suggested: {optionsSuggestedContracts} contract(s) max for this price
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Options Stop Loss & Targets */}
            <Card data-testid="card-options-targets">
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
                    ${optionsStopLoss50.toFixed(2)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Exit immediately if option drops to this price. Loss: -${optionsStopLossAmount.toFixed(2)}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-green-500" />
                        <span className="text-sm font-medium text-green-500">Target 1 (50%)</span>
                      </div>
                      <span className="text-lg font-mono font-bold text-green-500">${optionsTarget50.toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Sell half, lock in +${(optionPrice * 50 * contracts).toFixed(2)}</p>
                  </div>

                  <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-medium text-green-600">Target 2 (100%)</span>
                      </div>
                      <span className="text-lg font-mono font-bold text-green-600">${optionsTarget100.toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Double your money: +${(optionPrice * 100 * contracts).toFixed(2)}</p>
                  </div>

                  <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-green-700" />
                        <span className="text-sm font-medium text-green-700">Target 3 (200%)</span>
                      </div>
                      <span className="text-lg font-mono font-bold text-green-700">${optionsTarget200.toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Triple up: +${(optionPrice * 200 * contracts).toFixed(2)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Options Trading Rules */}
          <Card data-testid="card-options-rules">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Shield className="h-5 w-5 text-primary" />
                Options Trading Rules
              </CardTitle>
              <CardDescription>Follow these rules strictly for consistent results</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Risk Management
                  </h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5 shrink-0">1</Badge>
                      <span><strong>10% Max Risk:</strong> Never risk more than 10% of capital on a single trade</span>
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
        </TabsContent>

        {/* ======================= STOCKS TAB ======================= */}
        <TabsContent value="stocks" className="space-y-6 mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Stocks Position Sizing Calculator */}
            <Card data-testid="card-stocks-sizing">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calculator className="h-5 w-5 text-primary" />
                  Stock Position Sizing
                </CardTitle>
                <CardDescription>Calculate share count based on your capital and risk</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="capital-stocks">Trading Capital ($)</Label>
                    <Input
                      id="capital-stocks"
                      type="number"
                      value={capital}
                      onChange={(e) => setCapital(Number(e.target.value))}
                      className="font-mono"
                      data-testid="input-capital-stocks"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stockPrice">Stock Price ($)</Label>
                    <Input
                      id="stockPrice"
                      type="number"
                      step="0.01"
                      value={stockPrice}
                      onChange={(e) => setStockPrice(Number(e.target.value))}
                      className="font-mono"
                      data-testid="input-stock-price"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="shares">Number of Shares</Label>
                    <Input
                      id="shares"
                      type="number"
                      min={1}
                      value={shares}
                      onChange={(e) => setShares(Number(e.target.value))}
                      className="font-mono"
                      data-testid="input-shares"
                    />
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Position Cost:</span>
                    <span className="font-mono font-medium">${stocksPositionCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Max Risk (10%):</span>
                    <span className="font-mono font-medium">${stocksMaxRiskAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Stop Loss (3.5%):</span>
                    <span className="font-mono font-medium text-red-500">-${stocksStopLossAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm items-center">
                    <span className="text-muted-foreground">Risk Status:</span>
                    {stocksIsWithinRisk ? (
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
                  {!stocksIsWithinRisk && (
                    <Alert className="border-amber-500/30 bg-amber-500/10">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <AlertDescription className="text-sm">
                        Suggested: {stocksSuggestedShares} shares max for this price
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Stocks Stop Loss & Targets */}
            <Card data-testid="card-stocks-targets">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Target className="h-5 w-5 text-primary" />
                  Stop Loss & Targets
                </CardTitle>
                <CardDescription>Pre-calculated exit levels (3.5% stop, 2:1+ R:R)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="h-4 w-4 text-red-500" />
                    <span className="font-medium text-red-500">Stop Loss (3.5% drop)</span>
                  </div>
                  <div className="text-2xl font-mono font-bold text-red-500">
                    ${stocksStopLossPrice.toFixed(2)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Exit if price drops below this level. Loss: -${stocksStopLossAmount.toFixed(2)}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-green-500" />
                        <span className="text-sm font-medium text-green-500">Target 1 (7% - 2:1 R:R)</span>
                      </div>
                      <span className="text-lg font-mono font-bold text-green-500">${stocksTarget1.toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Sell half, lock in +${((stocksTarget1 - stockPrice) * shares).toFixed(2)}</p>
                  </div>

                  <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-medium text-green-600">Target 2 (10.5% - 3:1 R:R)</span>
                      </div>
                      <span className="text-lg font-mono font-bold text-green-600">${stocksTarget2.toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Let winners run: +${((stocksTarget2 - stockPrice) * shares).toFixed(2)}</p>
                  </div>
                </div>

                <Alert className="border-blue-500/30 bg-blue-500/10">
                  <Info className="h-4 w-4 text-blue-500" />
                  <AlertDescription className="text-sm">
                    Stock stops are tighter than options (3.5% vs 50%) because stocks don't have time decay working against you.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </div>

          {/* Stocks Trading Rules */}
          <Card data-testid="card-stocks-rules">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Shield className="h-5 w-5 text-primary" />
                Stock Trading Rules
              </CardTitle>
              <CardDescription>Day trading and swing trading rules for equities</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Risk Management
                  </h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5 shrink-0">1</Badge>
                      <span><strong>10% Max Risk:</strong> Never risk more than 10% of capital per trade</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5 shrink-0">2</Badge>
                      <span><strong>3.5% Stop Loss:</strong> Set stop 3.5% below entry for day trades</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5 shrink-0">3</Badge>
                      <span><strong>Min 2:1 R:R:</strong> Target at least 7% gain for every 3.5% risk</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5 shrink-0">4</Badge>
                      <span><strong>Position Size:</strong> Never use more than 50% of capital on one stock</span>
                    </li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    Entry Rules
                  </h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5 shrink-0">1</Badge>
                      <span><strong>Above 200 MA:</strong> Only go long when price is above 200-day moving average</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5 shrink-0">2</Badge>
                      <span><strong>RSI Confirmation:</strong> Enter on RSI(2) oversold bounces (&lt;10) or breakouts</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5 shrink-0">3</Badge>
                      <span><strong>Volume Confirmation:</strong> Volume should be 1.5x+ average on entry</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5 shrink-0">4</Badge>
                      <span><strong>Market Hours:</strong> Trade during regular hours (9:30 AM - 4:00 PM ET)</span>
                    </li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Target className="h-4 w-4 text-blue-500" />
                    Exit Rules
                  </h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5 shrink-0">1</Badge>
                      <span><strong>Scale Out at Target 1:</strong> Sell half at 7% profit (2:1 R:R)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5 shrink-0">2</Badge>
                      <span><strong>Trail Stop:</strong> Move stop to breakeven after hitting Target 1</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5 shrink-0">3</Badge>
                      <span><strong>Day Trade Exit:</strong> Close all day trade positions by market close</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5 shrink-0">4</Badge>
                      <span><strong>Swing Trade:</strong> Hold overnight only if trend is strong and stop is set</span>
                    </li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-500" />
                    Things to Avoid
                  </h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <Badge variant="destructive" className="mt-0.5 shrink-0">X</Badge>
                      <span><strong>Penny Stocks:</strong> Avoid stocks under $5 (low liquidity, manipulation)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Badge variant="destructive" className="mt-0.5 shrink-0">X</Badge>
                      <span><strong>Averaging Down:</strong> Never add to losing positions</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Badge variant="destructive" className="mt-0.5 shrink-0">X</Badge>
                      <span><strong>Earnings Plays:</strong> Avoid holding through earnings announcements</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Badge variant="destructive" className="mt-0.5 shrink-0">X</Badge>
                      <span><strong>Pre/Post Market:</strong> Avoid trading in extended hours (low volume)</span>
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ======================= CRYPTO TAB ======================= */}
        <TabsContent value="crypto" className="space-y-6 mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Crypto Position Sizing Calculator */}
            <Card data-testid="card-crypto-sizing">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calculator className="h-5 w-5 text-primary" />
                  Crypto Position Sizing
                </CardTitle>
                <CardDescription>Calculate position size for volatile crypto markets</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="capital-crypto">Trading Capital ($)</Label>
                    <Input
                      id="capital-crypto"
                      type="number"
                      value={capital}
                      onChange={(e) => setCapital(Number(e.target.value))}
                      className="font-mono"
                      data-testid="input-capital-crypto"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cryptoPrice">Crypto Price ($)</Label>
                    <Input
                      id="cryptoPrice"
                      type="number"
                      step="0.01"
                      value={cryptoPrice}
                      onChange={(e) => setCryptoPrice(Number(e.target.value))}
                      className="font-mono"
                      data-testid="input-crypto-price"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cryptoAmount">Amount (coins/tokens)</Label>
                    <Input
                      id="cryptoAmount"
                      type="number"
                      step="0.001"
                      value={cryptoAmount}
                      onChange={(e) => setCryptoAmount(Number(e.target.value))}
                      className="font-mono"
                      data-testid="input-crypto-amount"
                    />
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Position Cost:</span>
                    <span className="font-mono font-medium">${cryptoPositionCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Max Risk (10%):</span>
                    <span className="font-mono font-medium">${cryptoMaxRiskAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Stop Loss (5%):</span>
                    <span className="font-mono font-medium text-red-500">-${cryptoStopLossAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm items-center">
                    <span className="text-muted-foreground">Risk Status:</span>
                    {cryptoIsWithinRisk ? (
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
                </div>
              </CardContent>
            </Card>

            {/* Crypto Stop Loss & Targets */}
            <Card data-testid="card-crypto-targets">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Target className="h-5 w-5 text-primary" />
                  Stop Loss & Targets
                </CardTitle>
                <CardDescription>Wider stops for crypto volatility (5% stop, 2:1+ R:R)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="h-4 w-4 text-red-500" />
                    <span className="font-medium text-red-500">Stop Loss (5% drop)</span>
                  </div>
                  <div className="text-2xl font-mono font-bold text-red-500">
                    ${cryptoStopLossPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Wider stop to account for crypto volatility. Loss: -${cryptoStopLossAmount.toFixed(2)}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-green-500" />
                        <span className="text-sm font-medium text-green-500">Target 1 (10% - 2:1 R:R)</span>
                      </div>
                      <span className="text-lg font-mono font-bold text-green-500">${cryptoTarget1.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Take partial profit: +${((cryptoTarget1 - cryptoPrice) * cryptoAmount).toFixed(2)}</p>
                  </div>

                  <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-medium text-green-600">Target 2 (15% - 3:1 R:R)</span>
                      </div>
                      <span className="text-lg font-mono font-bold text-green-600">${cryptoTarget2.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Let winners run: +${((cryptoTarget2 - cryptoPrice) * cryptoAmount).toFixed(2)}</p>
                  </div>
                </div>

                <Alert className="border-amber-500/30 bg-amber-500/10">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <AlertDescription className="text-sm">
                    Crypto trades 24/7. Set stop-loss orders on exchange - don't rely on watching the market manually.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </div>

          {/* Crypto Trading Rules */}
          <Card data-testid="card-crypto-rules">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Shield className="h-5 w-5 text-primary" />
                Crypto Trading Rules
              </CardTitle>
              <CardDescription>Rules for navigating the volatile 24/7 crypto market</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Risk Management
                  </h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5 shrink-0">1</Badge>
                      <span><strong>10% Max Risk:</strong> Never risk more than 10% of capital per trade</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5 shrink-0">2</Badge>
                      <span><strong>5% Stop Loss:</strong> Wider stop for crypto volatility (vs 3.5% for stocks)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5 shrink-0">3</Badge>
                      <span><strong>Min 2:1 R:R:</strong> Target at least 10% gain for every 5% risk</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5 shrink-0">4</Badge>
                      <span><strong>Use Stop Orders:</strong> Always set stop-loss on exchange (24/7 market)</span>
                    </li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    Entry Rules
                  </h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5 shrink-0">1</Badge>
                      <span><strong>BTC Correlation:</strong> Check Bitcoin trend before trading altcoins</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5 shrink-0">2</Badge>
                      <span><strong>Major Coins Only:</strong> Focus on top 20 by market cap for liquidity</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5 shrink-0">3</Badge>
                      <span><strong>Volume Confirmation:</strong> Only enter on above-average volume</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5 shrink-0">4</Badge>
                      <span><strong>Trend Alignment:</strong> Trade with the higher timeframe trend</span>
                    </li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Target className="h-4 w-4 text-blue-500" />
                    Exit Rules
                  </h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5 shrink-0">1</Badge>
                      <span><strong>Scale Out at Target 1:</strong> Sell half at 10% profit (2:1 R:R)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5 shrink-0">2</Badge>
                      <span><strong>Trail Stop:</strong> Move stop to breakeven after hitting Target 1</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5 shrink-0">3</Badge>
                      <span><strong>Weekend Caution:</strong> Consider reducing exposure before weekends</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5 shrink-0">4</Badge>
                      <span><strong>Position Trades:</strong> Crypto can be held longer-term (position trades)</span>
                    </li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-500" />
                    Things to Avoid
                  </h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <Badge variant="destructive" className="mt-0.5 shrink-0">X</Badge>
                      <span><strong>Leverage:</strong> Avoid leveraged crypto trading (too volatile)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Badge variant="destructive" className="mt-0.5 shrink-0">X</Badge>
                      <span><strong>New/Low-Cap Coins:</strong> Skip meme coins and low-liquidity tokens</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Badge variant="destructive" className="mt-0.5 shrink-0">X</Badge>
                      <span><strong>FOMO Buying:</strong> Don't chase parabolic moves or breakouts</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Badge variant="destructive" className="mt-0.5 shrink-0">X</Badge>
                      <span><strong>No Stop Loss:</strong> Never trade crypto without a stop order set</span>
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Shared Weekly Goal Tracker */}
      <Card data-testid="card-weekly-goal">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <DollarSign className="h-5 w-5 text-primary" />
            Weekly Profit Goal
          </CardTitle>
          <CardDescription>Based on your ${capital} capital</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 rounded-lg bg-muted/50 text-center">
              <div className="text-2xl font-bold text-green-500">$100</div>
              <div className="text-sm text-muted-foreground">Conservative</div>
              <div className="text-xs text-muted-foreground mt-1">
                ~2-3 winning trades
              </div>
            </div>
            <div className="p-4 rounded-lg bg-primary/10 border-2 border-primary/30 text-center">
              <div className="text-2xl font-bold text-primary">$200</div>
              <div className="text-sm text-muted-foreground">Target</div>
              <div className="text-xs text-muted-foreground mt-1">
                2-3 solid trades per week
              </div>
            </div>
            <div className="p-4 rounded-lg bg-muted/50 text-center">
              <div className="text-2xl font-bold text-amber-500">$500</div>
              <div className="text-sm text-muted-foreground">Aggressive</div>
              <div className="text-xs text-muted-foreground mt-1">
                ~4-5 winning trades
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
          <CardDescription>Complete all items before entering any {assetType === 'options' ? 'options' : assetType === 'stocks' ? 'stock' : 'crypto'} trade</CardDescription>
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
                {assetType === 'crypto' ? 'Bitcoin trend confirmed (for alts)' : 'Trend confirmed with 20 EMA'}
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
                {assetType === 'crypto' ? 'Stop-loss order set on exchange' : 'Stop loss price calculated'}
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
                Profit targets set (min 2:1 R:R)
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
              onClick={resetChecklist}
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
