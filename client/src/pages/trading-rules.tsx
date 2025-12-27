import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Calculator, 
  Shield, 
  Target, 
  AlertTriangle, 
  TrendingUp,
  TrendingDown,
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
  
  const [capital, setCapital] = useState<number>(300);
  
  const [optionPrice, setOptionPrice] = useState<number>(1.50);
  const [contracts, setContracts] = useState<number>(1);
  
  const [stockPrice, setStockPrice] = useState<number>(150);
  const [shares, setShares] = useState<number>(10);
  
  const [cryptoPrice, setCryptoPrice] = useState<number>(45000);
  const [cryptoAmount, setCryptoAmount] = useState<number>(0.01);

  const [checklist, setChecklist] = useState({
    trendConfirmed: false,
    volumeCheck: false,
    riskCalculated: false,
    stopSet: false,
    targetSet: false,
    emotionCheck: false,
  });

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

  const stocksPositionCost = stockPrice * shares;
  const stocksMaxRiskPercent = 0.10;
  const stocksMaxRiskAmount = capital * stocksMaxRiskPercent;
  const stocksStopLossPercent = 0.035;
  const stocksStopLossPrice = stockPrice * (1 - stocksStopLossPercent);
  const stocksStopLossAmount = stockPrice * stocksStopLossPercent * shares;
  const stocksIsWithinRisk = stocksStopLossAmount <= stocksMaxRiskAmount;
  const stocksSuggestedShares = Math.floor(stocksMaxRiskAmount / (stockPrice * stocksStopLossPercent));
  const stocksTarget1 = stockPrice * 1.07;
  const stocksTarget2 = stockPrice * 1.105;

  const cryptoPositionCost = cryptoPrice * cryptoAmount;
  const cryptoMaxRiskPercent = 0.10;
  const cryptoMaxRiskAmount = capital * cryptoMaxRiskPercent;
  const cryptoStopLossPercent = 0.05;
  const cryptoStopLossPrice = cryptoPrice * (1 - cryptoStopLossPercent);
  const cryptoStopLossAmount = cryptoPrice * cryptoStopLossPercent * cryptoAmount;
  const cryptoIsWithinRisk = cryptoStopLossAmount <= cryptoMaxRiskAmount;
  const cryptoTarget1 = cryptoPrice * 1.10;
  const cryptoTarget2 = cryptoPrice * 1.15;

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
      {/* Header - Glassmorphism */}
      <div className="relative overflow-hidden rounded-xl glass-card p-6">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-blue-500/10" />
        <div className="relative z-10">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="text-page-title">Trading Rules Portal</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Risk management and trading rules for consistent profits
          </p>
        </div>
      </div>

      {/* Asset Type Navigation */}
      <Tabs value={assetType} onValueChange={(v) => setAssetType(v as AssetType)} className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md glass" data-testid="tabs-asset-type">
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
            <div className="glass-card rounded-xl border-l-2 border-l-cyan-500" data-testid="card-options-sizing">
              <div className="p-5 pb-3">
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                  <Calculator className="h-5 w-5 text-cyan-400" />
                  <span className="text-cyan-400">Options Position Sizing</span>
                </h3>
                <p className="text-sm text-muted-foreground mt-1">Calculate position size based on your capital</p>
              </div>
              <div className="px-5 pb-5 space-y-4">
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="capital-options">Trading Capital ($)</Label>
                    <Input
                      id="capital-options"
                      type="number"
                      value={capital}
                      onChange={(e) => setCapital(Number(e.target.value))}
                      className="font-mono glass"
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
                      className="font-mono glass"
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
                      className="font-mono glass"
                      data-testid="input-contracts"
                    />
                  </div>
                </div>

                <Separator className="bg-white/10" />

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
                    <span className="font-mono font-medium text-red-400">-${optionsStopLossAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm items-center">
                    <span className="text-muted-foreground">Risk Status:</span>
                    {optionsIsWithinRisk ? (
                      <span className="flex items-center gap-1 glass-success rounded px-2 py-0.5 text-xs font-medium">
                        <CheckCircle className="h-3 w-3" />
                        Within Limits
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 glass-danger rounded px-2 py-0.5 text-xs font-medium">
                        <XCircle className="h-3 w-3" />
                        Too Risky
                      </span>
                    )}
                  </div>
                  {!optionsIsWithinRisk && (
                    <div className="flex items-start gap-3 p-3 rounded-lg glass border-l-2 border-l-amber-500">
                      <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-sm text-muted-foreground">
                        Suggested: {optionsSuggestedContracts} contract(s) max for this price
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Options Stop Loss & Targets */}
            <div className="glass-card rounded-xl border-l-2 border-l-green-500" data-testid="card-options-targets">
              <div className="p-5 pb-3">
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                  <Target className="h-5 w-5 text-green-400" />
                  <span className="text-green-400">Stop Loss & Targets</span>
                </h3>
                <p className="text-sm text-muted-foreground mt-1">Pre-calculated exit levels for your option</p>
              </div>
              <div className="px-5 pb-5 space-y-4">
                <div className="p-4 rounded-lg glass-danger">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="h-4 w-4 text-red-400" />
                    <span className="font-medium text-red-400">Stop Loss (50% drop)</span>
                  </div>
                  <div className="text-2xl font-mono font-bold text-red-400">
                    ${optionsStopLoss50.toFixed(2)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Exit immediately if option drops to this price. Loss: -${optionsStopLossAmount.toFixed(2)}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="p-4 rounded-lg glass-success">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-green-400" />
                        <span className="text-sm font-medium text-green-400">Target 1 (50%)</span>
                      </div>
                      <span className="text-lg font-mono font-bold text-green-400">${optionsTarget50.toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Sell half, lock in +${(optionPrice * 50 * contracts).toFixed(2)}</p>
                  </div>

                  <div className="p-4 rounded-lg glass-success">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-green-400" />
                        <span className="text-sm font-medium text-green-400">Target 2 (100%)</span>
                      </div>
                      <span className="text-lg font-mono font-bold text-green-400">${optionsTarget100.toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Double your money: +${(optionPrice * 100 * contracts).toFixed(2)}</p>
                  </div>

                  <div className="p-4 rounded-lg glass-success">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-green-400" />
                        <span className="text-sm font-medium text-green-400">Target 3 (200%)</span>
                      </div>
                      <span className="text-lg font-mono font-bold text-green-400">${optionsTarget200.toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Triple up: +${(optionPrice * 200 * contracts).toFixed(2)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Options Trading Rules */}
          <div className="glass-card rounded-xl border-l-2 border-l-amber-500" data-testid="card-options-rules">
            <div className="p-5 pb-3">
              <h3 className="flex items-center gap-2 text-lg font-semibold">
                <Shield className="h-5 w-5 text-amber-400" />
                <span className="text-amber-400">Options Trading Rules</span>
              </h3>
              <p className="text-sm text-muted-foreground mt-1">Follow these rules strictly for consistent results</p>
            </div>
            <div className="px-5 pb-5">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    Risk Management
                  </h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">1</span>
                      <span><strong>10% Max Risk:</strong> Never risk more than 10% of capital on a single trade</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">2</span>
                      <span><strong>50% Stop Loss:</strong> Exit if option drops 50% from entry. No exceptions.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">3</span>
                      <span><strong>3 Trades Max/Week:</strong> Quality over quantity. Wait for A+ setups only.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">4</span>
                      <span><strong>Daily Loss Limit:</strong> Stop trading after 2 consecutive losses in a day.</span>
                    </li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-400" />
                    Entry Rules
                  </h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">1</span>
                      <span><strong>Trend Confirmation:</strong> Only trade in direction of the trend (use 20 EMA)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">2</span>
                      <span><strong>Volume Spike:</strong> Enter only when volume is 1.5x+ average</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">3</span>
                      <span><strong>Delta 0.40-0.60:</strong> Buy ATM or slightly ITM options for better odds</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">4</span>
                      <span><strong>7-14 DTE:</strong> Choose expiration 7-14 days out to balance cost vs. time decay</span>
                    </li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Target className="h-4 w-4 text-cyan-400" />
                    Exit Rules
                  </h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">1</span>
                      <span><strong>Scale Out at 50%:</strong> Sell half position at 50% profit to lock in gains</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">2</span>
                      <span><strong>Trail Stop:</strong> After 50% gain, move stop to breakeven</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">3</span>
                      <span><strong>Close by Thursday:</strong> Exit weekly options by Thursday to avoid Friday decay</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">4</span>
                      <span><strong>No Overnight Holds:</strong> Close all 0DTE positions before market close</span>
                    </li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-400" />
                    Things to Avoid
                  </h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <span className="glass-danger rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">X</span>
                      <span><strong>Revenge Trading:</strong> Never chase losses with bigger positions</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="glass-danger rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">X</span>
                      <span><strong>FOMO Entries:</strong> If you missed the move, wait for next setup</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="glass-danger rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">X</span>
                      <span><strong>Cheap Far-OTM:</strong> Avoid lottery tickets with delta {"<"}0.20</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="glass-danger rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">X</span>
                      <span><strong>Earnings Plays:</strong> Skip binary events until capital grows</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Pre-Trade Checklist */}
          <div className="glass-card rounded-xl border-l-2 border-l-blue-500">
            <div className="p-5 pb-3">
              <h3 className="flex items-center gap-2 text-lg font-semibold">
                <CheckCircle className="h-5 w-5 text-blue-400" />
                <span className="text-blue-400">Pre-Trade Checklist</span>
              </h3>
              <p className="text-sm text-muted-foreground mt-1">Complete before every trade</p>
            </div>
            <div className="px-5 pb-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-3 p-3 rounded-lg glass">
                  <Checkbox
                    id="trend"
                    checked={checklist.trendConfirmed}
                    onCheckedChange={(checked) => setChecklist(prev => ({ ...prev, trendConfirmed: !!checked }))}
                  />
                  <Label htmlFor="trend" className="cursor-pointer">Trend direction confirmed</Label>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg glass">
                  <Checkbox
                    id="volume"
                    checked={checklist.volumeCheck}
                    onCheckedChange={(checked) => setChecklist(prev => ({ ...prev, volumeCheck: !!checked }))}
                  />
                  <Label htmlFor="volume" className="cursor-pointer">Volume above average</Label>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg glass">
                  <Checkbox
                    id="risk"
                    checked={checklist.riskCalculated}
                    onCheckedChange={(checked) => setChecklist(prev => ({ ...prev, riskCalculated: !!checked }))}
                  />
                  <Label htmlFor="risk" className="cursor-pointer">Risk calculated (10% max)</Label>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg glass">
                  <Checkbox
                    id="stop"
                    checked={checklist.stopSet}
                    onCheckedChange={(checked) => setChecklist(prev => ({ ...prev, stopSet: !!checked }))}
                  />
                  <Label htmlFor="stop" className="cursor-pointer">Stop loss set</Label>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg glass">
                  <Checkbox
                    id="target"
                    checked={checklist.targetSet}
                    onCheckedChange={(checked) => setChecklist(prev => ({ ...prev, targetSet: !!checked }))}
                  />
                  <Label htmlFor="target" className="cursor-pointer">Profit target defined</Label>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg glass">
                  <Checkbox
                    id="emotion"
                    checked={checklist.emotionCheck}
                    onCheckedChange={(checked) => setChecklist(prev => ({ ...prev, emotionCheck: !!checked }))}
                  />
                  <Label htmlFor="emotion" className="cursor-pointer">Emotionally neutral</Label>
                </div>
              </div>
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
                <div className="flex items-center gap-2">
                  {allChecked ? (
                    <span className="flex items-center gap-2 glass-success rounded-lg px-3 py-1.5 text-sm font-medium">
                      <CheckCircle className="h-4 w-4" />
                      Ready to Trade
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 glass rounded-lg px-3 py-1.5 text-sm text-muted-foreground">
                      Complete all items before trading
                    </span>
                  )}
                </div>
                <Button variant="glass-secondary" size="sm" onClick={resetChecklist}>
                  Reset
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ======================= STOCKS TAB ======================= */}
        <TabsContent value="stocks" className="space-y-6 mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Stocks Position Sizing Calculator */}
            <div className="glass-card rounded-xl border-l-2 border-l-cyan-500" data-testid="card-stocks-sizing">
              <div className="p-5 pb-3">
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                  <Calculator className="h-5 w-5 text-cyan-400" />
                  <span className="text-cyan-400">Stock Position Sizing</span>
                </h3>
                <p className="text-sm text-muted-foreground mt-1">Calculate share count based on your capital and risk</p>
              </div>
              <div className="px-5 pb-5 space-y-4">
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="capital-stocks">Trading Capital ($)</Label>
                    <Input
                      id="capital-stocks"
                      type="number"
                      value={capital}
                      onChange={(e) => setCapital(Number(e.target.value))}
                      className="font-mono glass"
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
                      className="font-mono glass"
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
                      className="font-mono glass"
                      data-testid="input-shares"
                    />
                  </div>
                </div>

                <Separator className="bg-white/10" />

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
                    <span className="font-mono font-medium text-red-400">-${stocksStopLossAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm items-center">
                    <span className="text-muted-foreground">Risk Status:</span>
                    {stocksIsWithinRisk ? (
                      <span className="flex items-center gap-1 glass-success rounded px-2 py-0.5 text-xs font-medium">
                        <CheckCircle className="h-3 w-3" />
                        Within Limits
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 glass-danger rounded px-2 py-0.5 text-xs font-medium">
                        <XCircle className="h-3 w-3" />
                        Too Risky
                      </span>
                    )}
                  </div>
                  {!stocksIsWithinRisk && (
                    <div className="flex items-start gap-3 p-3 rounded-lg glass border-l-2 border-l-amber-500">
                      <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-sm text-muted-foreground">
                        Suggested: {stocksSuggestedShares} shares max for this price
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Stocks Stop Loss & Targets */}
            <div className="glass-card rounded-xl border-l-2 border-l-green-500" data-testid="card-stocks-targets">
              <div className="p-5 pb-3">
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                  <Target className="h-5 w-5 text-green-400" />
                  <span className="text-green-400">Stop Loss & Targets</span>
                </h3>
                <p className="text-sm text-muted-foreground mt-1">Pre-calculated exit levels (3.5% stop, 2:1+ R:R)</p>
              </div>
              <div className="px-5 pb-5 space-y-4">
                <div className="p-4 rounded-lg glass-danger">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="h-4 w-4 text-red-400" />
                    <span className="font-medium text-red-400">Stop Loss (3.5% drop)</span>
                  </div>
                  <div className="text-2xl font-mono font-bold text-red-400">
                    ${stocksStopLossPrice.toFixed(2)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Exit if price drops below this level. Loss: -${stocksStopLossAmount.toFixed(2)}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="p-4 rounded-lg glass-success">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-green-400" />
                        <span className="text-sm font-medium text-green-400">Target 1 (7% - 2:1 R:R)</span>
                      </div>
                      <span className="text-lg font-mono font-bold text-green-400">${stocksTarget1.toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Sell half, lock in +${((stocksTarget1 - stockPrice) * shares).toFixed(2)}</p>
                  </div>

                  <div className="p-4 rounded-lg glass-success">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-green-400" />
                        <span className="text-sm font-medium text-green-400">Target 2 (10.5% - 3:1 R:R)</span>
                      </div>
                      <span className="text-lg font-mono font-bold text-green-400">${stocksTarget2.toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Let winners run: +${((stocksTarget2 - stockPrice) * shares).toFixed(2)}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg glass border-l-2 border-l-blue-500">
                  <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    Stock stops are tighter than options (3.5% vs 50%) because stocks don't have time decay working against you.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Stocks Trading Rules */}
          <div className="glass-card rounded-xl border-l-2 border-l-amber-500" data-testid="card-stocks-rules">
            <div className="p-5 pb-3">
              <h3 className="flex items-center gap-2 text-lg font-semibold">
                <Shield className="h-5 w-5 text-amber-400" />
                <span className="text-amber-400">Stock Trading Rules</span>
              </h3>
              <p className="text-sm text-muted-foreground mt-1">Day trading and swing trading rules for equities</p>
            </div>
            <div className="px-5 pb-5">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    Risk Management
                  </h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">1</span>
                      <span><strong>10% Max Risk:</strong> Never risk more than 10% of capital per trade</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">2</span>
                      <span><strong>3.5% Stop Loss:</strong> Set stop 3.5% below entry for day trades</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">3</span>
                      <span><strong>Min 2:1 R:R:</strong> Target at least 7% gain for every 3.5% risk</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">4</span>
                      <span><strong>Position Size:</strong> Never use more than 50% of capital on one stock</span>
                    </li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-400" />
                    Entry Rules
                  </h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">1</span>
                      <span><strong>Above 200 MA:</strong> Only go long when price is above 200-day moving average</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">2</span>
                      <span><strong>RSI Confirmation:</strong> Enter on RSI(2) oversold bounces (&lt;10) or breakouts</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">3</span>
                      <span><strong>Volume Confirmation:</strong> Volume should be 1.5x+ average on entry</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">4</span>
                      <span><strong>Market Hours:</strong> Trade during regular hours (9:30 AM - 4:00 PM ET)</span>
                    </li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Target className="h-4 w-4 text-cyan-400" />
                    Exit Rules
                  </h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">1</span>
                      <span><strong>Scale Out at Target 1:</strong> Sell half at 7% profit (2:1 R:R)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">2</span>
                      <span><strong>Trail Stop:</strong> Move stop to breakeven after hitting Target 1</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">3</span>
                      <span><strong>Day Trade Exit:</strong> Close all day trade positions by market close</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">4</span>
                      <span><strong>Swing Trade:</strong> Hold overnight only if trend is strong and stop is set</span>
                    </li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-400" />
                    Things to Avoid
                  </h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <span className="glass-danger rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">X</span>
                      <span><strong>Penny Stocks:</strong> Avoid stocks under $5 (low liquidity, manipulation)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="glass-danger rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">X</span>
                      <span><strong>Averaging Down:</strong> Never add to losing positions</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="glass-danger rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">X</span>
                      <span><strong>Earnings Plays:</strong> Avoid holding through earnings announcements</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="glass-danger rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">X</span>
                      <span><strong>Pre/Post Market:</strong> Avoid trading in extended hours (low volume)</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ======================= CRYPTO TAB ======================= */}
        <TabsContent value="crypto" className="space-y-6 mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Crypto Position Sizing Calculator */}
            <div className="glass-card rounded-xl border-l-2 border-l-cyan-500" data-testid="card-crypto-sizing">
              <div className="p-5 pb-3">
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                  <Calculator className="h-5 w-5 text-cyan-400" />
                  <span className="text-cyan-400">Crypto Position Sizing</span>
                </h3>
                <p className="text-sm text-muted-foreground mt-1">Calculate position size for volatile crypto markets</p>
              </div>
              <div className="px-5 pb-5 space-y-4">
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="capital-crypto">Trading Capital ($)</Label>
                    <Input
                      id="capital-crypto"
                      type="number"
                      value={capital}
                      onChange={(e) => setCapital(Number(e.target.value))}
                      className="font-mono glass"
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
                      className="font-mono glass"
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
                      className="font-mono glass"
                      data-testid="input-crypto-amount"
                    />
                  </div>
                </div>

                <Separator className="bg-white/10" />

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
                    <span className="font-mono font-medium text-red-400">-${cryptoStopLossAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm items-center">
                    <span className="text-muted-foreground">Risk Status:</span>
                    {cryptoIsWithinRisk ? (
                      <span className="flex items-center gap-1 glass-success rounded px-2 py-0.5 text-xs font-medium">
                        <CheckCircle className="h-3 w-3" />
                        Within Limits
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 glass-danger rounded px-2 py-0.5 text-xs font-medium">
                        <XCircle className="h-3 w-3" />
                        Too Risky
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Crypto Stop Loss & Targets */}
            <div className="glass-card rounded-xl border-l-2 border-l-green-500" data-testid="card-crypto-targets">
              <div className="p-5 pb-3">
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                  <Target className="h-5 w-5 text-green-400" />
                  <span className="text-green-400">Stop Loss & Targets</span>
                </h3>
                <p className="text-sm text-muted-foreground mt-1">Wider stops for crypto volatility (5% stop, 2:1+ R:R)</p>
              </div>
              <div className="px-5 pb-5 space-y-4">
                <div className="p-4 rounded-lg glass-danger">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="h-4 w-4 text-red-400" />
                    <span className="font-medium text-red-400">Stop Loss (5% drop)</span>
                  </div>
                  <div className="text-2xl font-mono font-bold text-red-400">
                    ${cryptoStopLossPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Wider stop to account for crypto volatility. Loss: -${cryptoStopLossAmount.toFixed(2)}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="p-4 rounded-lg glass-success">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-green-400" />
                        <span className="text-sm font-medium text-green-400">Target 1 (10% - 2:1 R:R)</span>
                      </div>
                      <span className="text-lg font-mono font-bold text-green-400">${cryptoTarget1.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Take partial profit: +${((cryptoTarget1 - cryptoPrice) * cryptoAmount).toFixed(2)}</p>
                  </div>

                  <div className="p-4 rounded-lg glass-success">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-green-400" />
                        <span className="text-sm font-medium text-green-400">Target 2 (15% - 3:1 R:R)</span>
                      </div>
                      <span className="text-lg font-mono font-bold text-green-400">${cryptoTarget2.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Let winners run: +${((cryptoTarget2 - cryptoPrice) * cryptoAmount).toFixed(2)}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg glass border-l-2 border-l-amber-500">
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    Crypto trades 24/7. Set stop-loss orders on exchange - don't rely on watching the market manually.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Crypto Trading Rules */}
          <div className="glass-card rounded-xl border-l-2 border-l-amber-500" data-testid="card-crypto-rules">
            <div className="p-5 pb-3">
              <h3 className="flex items-center gap-2 text-lg font-semibold">
                <Shield className="h-5 w-5 text-amber-400" />
                <span className="text-amber-400">Crypto Trading Rules</span>
              </h3>
              <p className="text-sm text-muted-foreground mt-1">Rules for navigating the volatile 24/7 crypto market</p>
            </div>
            <div className="px-5 pb-5">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    Risk Management
                  </h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">1</span>
                      <span><strong>10% Max Risk:</strong> Never risk more than 10% of capital per trade</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">2</span>
                      <span><strong>5% Stop Loss:</strong> Wider stop for crypto volatility (vs 3.5% for stocks)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">3</span>
                      <span><strong>Min 2:1 R:R:</strong> Target at least 10% gain for every 5% risk</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">4</span>
                      <span><strong>Use Stop Orders:</strong> Always set stop-loss on exchange (24/7 market)</span>
                    </li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-400" />
                    Entry Rules
                  </h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">1</span>
                      <span><strong>BTC Correlation:</strong> Check Bitcoin trend before trading altcoins</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">2</span>
                      <span><strong>Major Coins Only:</strong> Focus on top 20 by market cap for liquidity</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">3</span>
                      <span><strong>Volume Confirmation:</strong> Only enter on above-average volume</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">4</span>
                      <span><strong>Trend Alignment:</strong> Trade with the higher timeframe trend</span>
                    </li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Target className="h-4 w-4 text-cyan-400" />
                    Exit Rules
                  </h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">1</span>
                      <span><strong>Scale Out at Target 1:</strong> Sell half at 10% profit (2:1 R:R)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">2</span>
                      <span><strong>Trail Stop:</strong> Move stop to breakeven after hitting Target 1</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">3</span>
                      <span><strong>Weekend Caution:</strong> Consider reducing exposure before weekends</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">4</span>
                      <span><strong>Position Trades:</strong> Crypto can be held longer-term (position trades)</span>
                    </li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-400" />
                    Things to Avoid
                  </h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <span className="glass-danger rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">X</span>
                      <span><strong>Leverage Trading:</strong> Avoid leverage until you're consistently profitable</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="glass-danger rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">X</span>
                      <span><strong>Shitcoins:</strong> Avoid low-cap meme coins (high rug pull risk)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="glass-danger rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">X</span>
                      <span><strong>FOMO Chasing:</strong> Don't buy pumps - wait for consolidation</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="glass-danger rounded px-2 py-0.5 text-xs mt-0.5 shrink-0">X</span>
                      <span><strong>Ignoring BTC:</strong> Never fight Bitcoin's trend direction</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
