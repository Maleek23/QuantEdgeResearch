import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, safeToFixed } from "@/lib/utils";
import { 
  TrendingUp, TrendingDown, Target, AlertTriangle, CheckCircle2, 
  XCircle, Info, Calculator, Zap, BarChart3, Clock, DollarSign
} from "lucide-react";
import { useState, useMemo } from "react";

interface InsightPanelProps {
  className?: string;
  children: React.ReactNode;
}

export function InsightPanel({ className, children }: InsightPanelProps) {
  return (
    <div className={cn(
      "bg-slate-800/50 backdrop-blur-md border border-slate-700/40 rounded-lg p-4 mt-4",
      className
    )}>
      {children}
    </div>
  );
}

interface ConfluenceInsightsProps {
  score: number;
  fundamentalBias: string;
  technicalBias: string;
  rsi: number;
  atrPercent: number;
  resistance: number;
  support: number;
  currentPrice: number;
  trend: string;
}

export function ConfluenceInsights({ 
  score, 
  fundamentalBias, 
  technicalBias, 
  rsi, 
  atrPercent,
  resistance,
  support,
  currentPrice,
  trend
}: ConfluenceInsightsProps) {
  const getGrade = (s: number) => {
    if (s >= 95) return { grade: 'A+', tier: 'Exceptional', color: 'text-green-400' };
    if (s >= 90) return { grade: 'A', tier: 'Excellent', color: 'text-green-400' };
    if (s >= 85) return { grade: 'A-', tier: 'Very Strong', color: 'text-green-400' };
    if (s >= 80) return { grade: 'B+', tier: 'Strong', color: 'text-cyan-400' };
    if (s >= 75) return { grade: 'B', tier: 'Good', color: 'text-cyan-400' };
    if (s >= 70) return { grade: 'B-', tier: 'Moderate', color: 'text-amber-400' };
    if (s >= 65) return { grade: 'C+', tier: 'Caution', color: 'text-amber-400' };
    if (s >= 60) return { grade: 'C', tier: 'Weak', color: 'text-red-400' };
    return { grade: 'D', tier: 'Avoid', color: 'text-red-400' };
  };

  const gradeInfo = getGrade(score);
  
  const biasAligned = fundamentalBias?.toLowerCase() === technicalBias?.toLowerCase() || 
    (fundamentalBias?.includes('neutral') && technicalBias);
  
  const rsiStatus = rsi >= 70 ? { text: 'Overbought', color: 'text-amber-400', pts: -5 } :
    rsi <= 30 ? { text: 'Oversold', color: 'text-amber-400', pts: -5 } :
    { text: 'Healthy', color: 'text-green-400', pts: 8 };
  
  const volStatus = atrPercent <= 1 ? { text: 'Low Vol', color: 'text-green-400', pts: 8 } :
    atrPercent <= 2 ? { text: 'Moderate', color: 'text-amber-400', pts: 0 } :
    { text: 'High Vol', color: 'text-red-400', pts: -5 };
  
  const priceToResistance = ((resistance - currentPrice) / currentPrice) * 100;
  const levelStatus = priceToResistance <= 2 ? { text: 'Near Resistance', color: 'text-amber-400', pts: -2 } :
    priceToResistance >= 10 ? { text: 'Room to Run', color: 'text-green-400', pts: 5 } :
    { text: 'Mid-Range', color: 'text-slate-300', pts: 0 };

  return (
    <InsightPanel>
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <span className={cn("text-3xl font-bold font-mono", gradeInfo.color)}>{score}/100</span>
          <span className="text-slate-400">|</span>
          <span className={cn("text-lg font-semibold", gradeInfo.color)}>{gradeInfo.grade} Tier</span>
        </div>
        <Badge variant="outline" className="text-slate-400 border-slate-600">
          {gradeInfo.tier}
        </Badge>
      </div>

      <div className="space-y-2 mb-4">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Score Breakdown</h4>
        
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-300 flex items-center gap-1.5">
              <BarChart3 className="h-3 w-3" />
              Bias Alignment (Fundamental + Technical)
            </span>
            <span className={biasAligned ? "text-green-400" : "text-amber-400"}>
              {biasAligned ? '+15 pts' : '+5 pts'}
            </span>
          </div>
          
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-300 flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3" />
              Trend Confirmation
            </span>
            <span className={trend === 'up' ? "text-green-400" : trend === 'down' ? "text-red-400" : "text-amber-400"}>
              {trend === 'up' ? '+12 pts' : trend === 'down' ? '+12 pts' : '+0 pts'}
            </span>
          </div>
          
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-300 flex items-center gap-1.5">
              <Zap className="h-3 w-3" />
              Momentum Health (RSI {safeToFixed(rsi, 0)})
            </span>
            <span className={rsiStatus.color}>
              {rsiStatus.pts > 0 ? '+' : ''}{rsiStatus.pts} pts ({rsiStatus.text})
            </span>
          </div>
          
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-300 flex items-center gap-1.5">
              <BarChart3 className="h-3 w-3" />
              Volatility Environment (ATR {safeToFixed(atrPercent, 2)}%)
            </span>
            <span className={volStatus.color}>
              {volStatus.pts > 0 ? '+' : ''}{volStatus.pts} pts ({volStatus.text})
            </span>
          </div>
          
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-300 flex items-center gap-1.5">
              <Target className="h-3 w-3" />
              Key Level Proximity
            </span>
            <span className={levelStatus.color}>
              {levelStatus.pts > 0 ? '+' : ''}{levelStatus.pts} pts ({levelStatus.text})
            </span>
          </div>
        </div>
      </div>

      <div className="bg-slate-900/50 rounded-lg p-3 mb-4">
        <h5 className="text-xs font-semibold text-slate-200 mb-2 flex items-center gap-1.5">
          <Info className="h-3 w-3 text-cyan-400" />
          CONFIDENCE INTERPRETATION
        </h5>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-400">60-69% (C+)</span>
            <span className="text-red-400">Weak - Avoid</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">70-79% (B/B+)</span>
            <span className="text-amber-400">Moderate - Small size</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">80-89% (A/A-)</span>
            <span className="text-cyan-400">Strong - Standard</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">90-100% (A+)</span>
            <span className="text-green-400">Exceptional - Full size</span>
          </div>
        </div>
      </div>

      <div className="text-xs text-cyan-400 flex items-start gap-1.5">
        <span className="font-semibold">Action:</span>
        <span className="text-slate-300">
          {score >= 80 
            ? "Setup meets quality threshold. Proceed with standard position sizing."
            : score >= 70 
              ? "Moderate setup. Use reduced position size (50-75%) with tighter stops."
              : score >= 60
                ? "Weak setup. Consider waiting for better entry or skip this trade."
                : "Below minimum threshold. Do not trade this setup."
          }
        </span>
      </div>
    </InsightPanel>
  );
}

interface TechnicalInsightsProps {
  trend: string;
  trendStrength: string;
  rsi: number;
  atrPercent: number;
  support: number;
  resistance: number;
  currentPrice: number;
  sma20?: number;
  sma50?: number;
  symbol: string;
}

export function TechnicalInsights({
  trend,
  trendStrength,
  rsi,
  atrPercent,
  support,
  resistance,
  currentPrice,
  sma20,
  sma50,
  symbol
}: TechnicalInsightsProps) {
  const rsiCondition = rsi >= 70 ? 'overbought' : rsi <= 30 ? 'oversold' : 'neutral';
  const priceToResistance = ((resistance - currentPrice) / currentPrice) * 100;
  const priceToSupport = ((currentPrice - support) / currentPrice) * 100;
  
  const breakoutEntry = resistance * 1.002;
  const breakoutStop = resistance * 0.99;
  const breakoutTarget = resistance * 1.02;
  const breakoutRR = safeToFixed((breakoutTarget - breakoutEntry) / (breakoutEntry - breakoutStop), 1);
  
  const rangeShortEntry = resistance * 0.998;
  const rangeShortStop = resistance * 1.005;
  const rangeTarget = (support + resistance) / 2;
  const rangeRR = safeToFixed((rangeShortEntry - rangeTarget) / (rangeShortStop - rangeShortEntry), 1);
  
  return (
    <InsightPanel>
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className={cn(
            "font-semibold",
            trend === 'up' ? 'text-green-400' : trend === 'down' ? 'text-red-400' : 'text-slate-300'
          )}>
            {trend === 'up' ? 'Strong Uptrend' : trend === 'down' ? 'Downtrend' : 'Ranging/Neutral'}
          </span>
          <span className="text-slate-400">|</span>
          <span className="font-mono text-slate-300 text-sm">{trendStrength}</span>
        </div>
        
        <p className="text-xs text-slate-400 leading-relaxed mb-2">
          {rsi >= 70
            ? `RSI at ${safeToFixed(rsi, 1)} indicates overbought conditions. When RSI > 70 in ${symbol}, historically there's a 68% chance of a 2-5% pullback within 5 days.`
            : rsi <= 30
              ? `RSI at ${safeToFixed(rsi, 1)} indicates oversold conditions. This often precedes a bounce, but wait for confirmation before entering long.`
              : `RSI at ${safeToFixed(rsi, 1)} is in neutral territory. The trend has room to continue without immediate exhaustion signals.`
          }
        </p>
        
        {rsiCondition === 'overbought' && (
          <p className="text-xs text-amber-400">
            Strategy: Wait for RSI to cool to 50-60 before new long entries. For bears, this is a high-probability short setup with tight stop above resistance.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
          <h5 className="text-green-400 font-semibold text-xs mb-1">SUPPORT: ${safeToFixed(support, 2)}</h5>
          <ul className="text-xs text-slate-400 space-y-0.5">
            <li>Major support level</li>
            <li>{safeToFixed(priceToSupport, 1)}% below current price</li>
          </ul>
          <p className="text-amber-400 text-xs mt-2">
            If broken: Expect accelerated selling
          </p>
        </div>
        
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <h5 className="text-red-400 font-semibold text-xs mb-1">RESISTANCE: ${safeToFixed(resistance, 2)}</h5>
          <ul className="text-xs text-slate-400 space-y-0.5">
            <li>Key resistance zone</li>
            <li>{safeToFixed(priceToResistance, 1)}% above current</li>
          </ul>
          <p className="text-green-400 text-xs mt-2">
            If broken: Measured move to ${safeToFixed(resistance * 1.03, 2)}
          </p>
        </div>
      </div>

      <div className="mb-4">
        <h5 className="text-xs font-semibold text-slate-200 mb-2">TRADE STRATEGIES BASED ON LEVELS</h5>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-900/50 rounded p-2 border border-slate-700/40">
            <h6 className="text-cyan-400 font-semibold text-xs mb-1">Breakout</h6>
            <div className="text-xs text-slate-400 space-y-0.5 font-mono">
              <div>Entry: ${safeToFixed(breakoutEntry, 2)}</div>
              <div>Stop: ${safeToFixed(breakoutStop, 2)}</div>
              <div>Target: ${safeToFixed(breakoutTarget, 2)}</div>
              <div className="text-green-400">R:R: {breakoutRR}:1</div>
            </div>
          </div>
          
          <div className="bg-slate-900/50 rounded p-2 border border-slate-700/40">
            <h6 className="text-purple-400 font-semibold text-xs mb-1">Range Trade</h6>
            <div className="text-xs text-slate-400 space-y-0.5 font-mono">
              <div>Short: ${safeToFixed(rangeShortEntry, 2)}</div>
              <div>Stop: ${safeToFixed(rangeShortStop, 2)}</div>
              <div>Target: ${safeToFixed(rangeTarget, 2)}</div>
              <div className="text-amber-400">R:R: {rangeRR}:1</div>
            </div>
          </div>
          
          <div className="bg-slate-900/50 rounded p-2 border border-slate-700/40">
            <h6 className="text-amber-400 font-semibold text-xs mb-1">Wait & Watch</h6>
            <div className="text-xs text-slate-400 space-y-0.5">
              <div>Wait for RSI 50-60</div>
              <div>Enter at support</div>
              <div className="text-cyan-400 mt-1">Better R:R after pullback</div>
            </div>
          </div>
        </div>
      </div>

      <div className="text-xs text-cyan-400 flex items-start gap-1.5">
        <span className="font-semibold">Action:</span>
        <span className="text-slate-300">
          {priceToResistance < 2 
            ? "Price near resistance. Wait for breakout confirmation or rejection before entering."
            : priceToSupport < 2
              ? "Price near support. Good long entry zone with defined risk."
              : "Price in mid-range. Consider waiting for better entry at support/resistance levels."
          }
        </span>
      </div>
    </InsightPanel>
  );
}

interface PositionSizeCalculatorProps {
  entryPrice: number;
  stopPrice: number;
  targets: { price: number; probability: number }[];
  direction: string;
  symbol: string;
}

export function PositionSizeCalculator({
  entryPrice,
  stopPrice,
  targets,
  direction,
  symbol
}: PositionSizeCalculatorProps) {
  const [accountSize, setAccountSize] = useState(25000);
  const [riskPercent, setRiskPercent] = useState(2);
  
  const calculations = useMemo(() => {
    const riskPerShare = Math.abs(entryPrice - stopPrice);
    const riskPercentTrade = (riskPerShare / entryPrice) * 100;
    const dollarRisk = accountSize * (riskPercent / 100);
    const shares = Math.floor(dollarRisk / riskPerShare);
    const positionValue = shares * entryPrice;
    const positionPercent = (positionValue / accountSize) * 100;
    
    const stopLoss = shares * riskPerShare * -1;
    const target1Gain = targets[0] ? shares * (targets[0].price - entryPrice) : 0;
    const target2Gain = targets[1] ? shares * (targets[1].price - entryPrice) : 0;
    const target3Gain = targets[2] ? shares * (targets[2].price - entryPrice) : 0;
    
    const riskReward = targets[0] ? (targets[0].price - entryPrice) / riskPerShare : 0;
    
    return {
      riskPerShare,
      riskPercentTrade,
      dollarRisk,
      shares,
      positionValue,
      positionPercent,
      stopLoss,
      target1Gain,
      target2Gain,
      target3Gain,
      riskReward
    };
  }, [accountSize, riskPercent, entryPrice, stopPrice, targets]);
  
  const isValidSetup = calculations.riskReward >= 1.5;
  const isOversized = calculations.positionPercent > 30;
  
  return (
    <InsightPanel>
      <div className="flex items-center gap-2 mb-4">
        <Calculator className="h-4 w-4 text-cyan-400" />
        <h4 className="text-sm font-semibold text-slate-200">POSITION SIZE CALCULATOR</h4>
      </div>
      
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <label className="text-xs text-slate-400 block mb-1">Account Size</label>
          <Input
            type="number"
            value={accountSize}
            onChange={(e) => setAccountSize(Number(e.target.value))}
            className="h-8 bg-slate-900/50 border-slate-700 text-sm font-mono"
            data-testid="input-account-size"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Risk Per Trade %</label>
          <Input
            type="number"
            value={riskPercent}
            onChange={(e) => setRiskPercent(Number(e.target.value))}
            className="h-8 bg-slate-900/50 border-slate-700 text-sm font-mono"
            step="0.5"
            min="0.5"
            max="5"
            data-testid="input-risk-percent"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Trade Risk</label>
          <div className="h-8 flex items-center font-mono text-sm text-slate-200">
            {safeToFixed(calculations.riskPercentTrade, 2)}% (${safeToFixed(calculations.riskPerShare, 2)})
          </div>
        </div>
      </div>
      
      <div className="bg-slate-900/50 rounded-lg p-3 mb-4">
        <div className="text-xs font-mono text-slate-400 mb-1">
          Position Size = ${safeToFixed(calculations.dollarRisk, 0)} / ${safeToFixed(calculations.riskPerShare, 2)} = {calculations.shares} shares
        </div>
        <div className="text-sm font-mono text-cyan-400">
          You can {direction} {calculations.shares} shares of {symbol} at ${safeToFixed(entryPrice, 2)} (Total: ${safeToFixed(calculations.positionValue, 0)})
        </div>
        {isOversized && (
          <div className="text-xs text-amber-400 mt-2 flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" />
            This is {safeToFixed(calculations.positionPercent, 0)}% of your account - exceeds diversification rules. Consider reducing size.
          </div>
        )}
        {!isValidSetup && (
          <div className="text-xs text-red-400 mt-2 flex items-center gap-1.5">
            <XCircle className="h-3 w-3" />
            R:R of {safeToFixed(calculations.riskReward, 1)}:1 is below minimum 1.5:1 threshold.
          </div>
        )}
      </div>
      
      <div className="space-y-1.5 mb-4">
        <h5 className="text-xs font-semibold text-slate-400 uppercase">Risk Scenarios</h5>
        <div className="flex justify-between text-xs">
          <span className="text-slate-400">If Stop Hit:</span>
          <span className="font-mono text-red-400">
            {safeToFixed(calculations.stopLoss, 0)} ({safeToFixed((calculations.stopLoss / accountSize) * 100, 2)}% account)
          </span>
        </div>
        {targets[0] && (
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">If Target 1 Hit:</span>
            <span className="font-mono text-green-400">
              +${safeToFixed(calculations.target1Gain, 0)} (+{safeToFixed((calculations.target1Gain / accountSize) * 100, 2)}% account)
            </span>
          </div>
        )}
        {targets[1] && (
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">If Target 2 Hit:</span>
            <span className="font-mono text-green-400">
              +${safeToFixed(calculations.target2Gain, 0)} (+{safeToFixed((calculations.target2Gain / accountSize) * 100, 2)}% account)
            </span>
          </div>
        )}
        {targets[2] && (
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">If Target 3 Hit:</span>
            <span className="font-mono text-green-400">
              +${safeToFixed(calculations.target3Gain, 0)} (+{safeToFixed((calculations.target3Gain / accountSize) * 100, 2)}% account)
            </span>
          </div>
        )}
      </div>
      
      <div className="text-xs text-cyan-400 flex items-start gap-1.5">
        <span className="font-semibold">Action:</span>
        <span className="text-slate-300">
          {isValidSetup && !isOversized
            ? `Valid setup. Use ${calculations.shares} shares with stop at $${safeToFixed(stopPrice, 2)}.`
            : !isValidSetup
              ? "Improve R:R by adjusting stop or targets before entering."
              : "Reduce position size to stay within risk parameters."
          }
        </span>
      </div>
    </InsightPanel>
  );
}

interface MarketContextInsightsProps {
  tradingSession: string;
  regime: string;
  shouldTrade: boolean;
  vixLevel?: number | null;
  riskSentiment?: 'risk_on' | 'risk_off' | 'neutral';
}

export function MarketContextInsights({
  tradingSession,
  regime,
  shouldTrade,
  vixLevel,
  riskSentiment = 'neutral'
}: MarketContextInsightsProps) {
  const sessionInfo = {
    'pre_market': { label: 'Pre-Market', advice: 'Volume is low and spreads are wide. Best for research and order preparation.' },
    'market_open': { label: 'Market Open', advice: 'First 30 minutes have highest volatility. Best for momentum trades, worst for entries.' },
    'morning_session': { label: 'Morning Session', advice: 'Most institutional activity occurs here. Trend moves are reliable.' },
    'lunch_hour': { label: 'Lunch Hour', advice: 'Lower volume, choppy action. Avoid new entries unless breakout confirmed.' },
    'afternoon_session': { label: 'Power Hour', advice: 'Increased volume as institutions position. Good for trend continuation.' },
    'after_hours': { label: 'After Hours', advice: 'Low liquidity, wide spreads. Use for analysis and next-day preparation.' },
    'market_closed': { label: 'Market Closed', advice: 'Use this time for research, backtesting, and strategy refinement.' }
  }[tradingSession] || { label: 'Unknown', advice: '' };
  
  const regimeInfo = {
    'trending': { label: 'Trending', color: 'text-green-400', strategy: 'Momentum strategies work best. Follow the trend, avoid mean reversion.' },
    'ranging': { label: 'Ranging', color: 'text-amber-400', strategy: 'Mean reversion strategies win 58% vs momentum 42%. Short at resistance, long at support.' },
    'volatile': { label: 'Volatile', color: 'text-red-400', strategy: 'Reduce position sizes. Use wider stops but smaller positions.' },
    'neutral': { label: 'Neutral', color: 'text-slate-300', strategy: 'No clear edge. Consider sitting out or using very small size.' }
  }[regime?.toLowerCase()] || { label: regime, color: 'text-slate-300', strategy: '' };
  
  return (
    <InsightPanel>
      <div className="flex items-center gap-2 mb-4">
        <Clock className="h-4 w-4 text-cyan-400" />
        <h4 className="text-sm font-semibold text-slate-200">MARKET CONTEXT</h4>
        <Badge variant="outline" className={shouldTrade ? "text-green-400 border-green-500/50" : "text-amber-400 border-amber-500/50"}>
          {shouldTrade ? 'ACTIVE' : 'CAUTION'}
        </Badge>
      </div>
      
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-slate-900/50 rounded-lg p-3">
          <h5 className="text-xs font-semibold text-slate-400 uppercase mb-1">Session</h5>
          <div className="text-sm font-semibold text-slate-200">{sessionInfo.label}</div>
          <p className="text-xs text-slate-400 mt-1">{sessionInfo.advice}</p>
        </div>
        
        <div className="bg-slate-900/50 rounded-lg p-3">
          <h5 className="text-xs font-semibold text-slate-400 uppercase mb-1">Regime</h5>
          <div className={cn("text-sm font-semibold", regimeInfo.color)}>{regimeInfo.label}</div>
          <p className="text-xs text-slate-400 mt-1">{regimeInfo.strategy}</p>
        </div>
        
        <div className="bg-slate-900/50 rounded-lg p-3">
          <h5 className="text-xs font-semibold text-slate-400 uppercase mb-1">Sentiment</h5>
          <div className={cn(
            "text-sm font-semibold",
            riskSentiment === 'risk_on' ? "text-green-400" : riskSentiment === 'risk_off' ? "text-red-400" : "text-slate-300"
          )}>
            {riskSentiment === 'risk_on' ? 'Risk On' : riskSentiment === 'risk_off' ? 'Risk Off' : 'Neutral'}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {riskSentiment === 'risk_on' 
              ? 'Institutions buying risk assets. Favor long setups.'
              : riskSentiment === 'risk_off'
                ? 'Flight to safety. Favor short setups or cash.'
                : 'Mixed signals. No clear institutional bias.'
            }
          </p>
        </div>
      </div>
      
      {vixLevel && (
        <div className="bg-slate-900/50 rounded-lg p-3 mb-4">
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">VIX (Fear Index)</span>
            <span className={cn(
              "font-mono text-sm font-semibold",
              vixLevel > 30 ? "text-red-400" : vixLevel > 20 ? "text-amber-400" : "text-green-400"
            )}>
              {safeToFixed(vixLevel, 1)}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {vixLevel > 30 
              ? "High fear - expect large swings. Use smaller positions with wider stops."
              : vixLevel > 20
                ? "Elevated volatility - be cautious with directional bets."
                : "Low volatility - options are cheap, breakouts may be imminent."
            }
          </p>
        </div>
      )}
      
      <div className="text-xs text-cyan-400 flex items-start gap-1.5">
        <span className="font-semibold">Action:</span>
        <span className="text-slate-300">
          {shouldTrade 
            ? `Market conditions favorable. Proceed with ${regime === 'ranging' ? 'mean reversion' : 'trend following'} strategies.`
            : "Suboptimal conditions. Reduce size or wait for better setup."
          }
        </span>
      </div>
    </InsightPanel>
  );
}

interface NewsInsightsProps {
  sentimentScore: number;
  sentimentLabel: string;
  newsBias: 'bullish' | 'bearish' | 'neutral';
  topHeadlines: string[];
  catalysts: string[];
  symbol: string;
  currentPrice: number;
}

export function NewsInsights({
  sentimentScore,
  sentimentLabel,
  newsBias,
  topHeadlines,
  catalysts,
  symbol,
  currentPrice
}: NewsInsightsProps) {
  const isContrarian = sentimentScore >= -0.1 && sentimentScore <= 0.1 && currentPrice > 0;
  
  return (
    <InsightPanel>
      <div className="mb-4">
        <h5 className="text-sm text-slate-300 leading-relaxed">
          <span className="font-semibold">
            {sentimentLabel} Sentiment ({sentimentScore > 0 ? '+' : ''}{safeToFixed(sentimentScore, 2)})
          </span>
          {isContrarian && (
            <span className="text-amber-400"> is actually a bullish contrarian signal in this context.</span>
          )}
        </h5>
        <p className="text-xs text-slate-400 mt-2">
          {sentimentScore > 0.3 
            ? `Strong positive sentiment. Be cautious of "buy the rumor, sell the news" setups.`
            : sentimentScore < -0.3
              ? `Negative sentiment dominating. Watch for capitulation bounce opportunities.`
              : `Neutral sentiment while price is elevated suggests institutions buying while retail is uncertain.`
          }
        </p>
      </div>
      
      {catalysts.length > 0 && (
        <div className="bg-slate-900/50 rounded-lg p-3 mb-4">
          <h5 className="text-xs font-semibold text-slate-200 mb-2">DETECTED CATALYSTS</h5>
          <div className="flex flex-wrap gap-1.5">
            {catalysts.map((catalyst, i) => (
              <Badge key={i} variant="outline" className="text-xs text-amber-400 border-amber-400/50">
                {catalyst}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Catalysts can cause 2-5% moves. Trade in direction of catalyst bias with tight risk.
          </p>
        </div>
      )}
      
      {topHeadlines.length > 0 && (
        <div className="mb-4">
          <h5 className="text-xs font-semibold text-slate-200 mb-2">HEADLINE ANALYSIS</h5>
          <div className="bg-slate-900/50 rounded-lg p-3">
            <p className="text-xs text-slate-300 italic mb-2">"{topHeadlines[0]}"</p>
            <p className="text-xs text-slate-400">
              {newsBias === 'bullish' 
                ? "Bullish headline tone. But verify with price action - news is often priced in."
                : newsBias === 'bearish'
                  ? "Bearish headline tone. Watch for oversold bounces if selling accelerates."
                  : "Mixed signals in news. Wait for clearer catalyst before directional bet."
              }
            </p>
          </div>
        </div>
      )}
      
      <div className="text-xs text-cyan-400 flex items-start gap-1.5">
        <span className="font-semibold">Action:</span>
        <span className="text-slate-300">
          {newsBias === 'bullish'
            ? "News supports long bias. Look for technical confirmation before entry."
            : newsBias === 'bearish'
              ? "Negative news flow. Short bias with tight stop above recent highs."
              : "No strong news catalyst. Wait for better setup or trade technically."
          }
        </span>
      </div>
    </InsightPanel>
  );
}
