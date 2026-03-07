/**
 * Strategy Lab — OptionStrat-style Options Strategy Builder
 * Powered by existing backend: options-quant.ts (Black-Scholes, Greeks, IV analysis, strategy sim)
 */

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import {
  Target,
  TrendingUp,
  TrendingDown,
  Zap,
  Calculator,
  BarChart3,
  Activity,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
  Plus,
  Minus,
  X,
  RefreshCw,
  Layers,
} from "lucide-react";

// ============================================
// TYPES
// ============================================

interface StrategyLeg {
  optionType: 'call' | 'put';
  strike: number;
  expiry: string;
  quantity: number;
  premium: number;
}

interface Greeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

interface StrategyPayoff {
  name: string;
  legs: StrategyLeg[];
  maxProfit: number | 'unlimited';
  maxLoss: number | 'unlimited';
  breakEvenPoints: number[];
  probabilityOfProfit: number;
  expectedValue: number;
  payoffCurve: Array<{ price: number; pnl: number }>;
  greeksAggregate: Greeks;
}

interface OptionPrice {
  theoreticalPrice: number;
  intrinsicValue: number;
  timeValue: number;
  greeks: Greeks;
}

interface IVAnalysis {
  currentIV: number;
  ivRank: number;
  ivPercentile: number;
  ivHigh52Week: number;
  ivLow52Week: number;
  ivMean: number;
  ivStdDev: number;
  ivTrend: 'rising' | 'falling' | 'neutral';
  expectedMove: number;
  expectedMovePercent: number;
}

// ============================================
// PRESET STRATEGIES
// ============================================

type StrategyPreset = {
  name: string;
  description: string;
  icon: string;
  buildLegs: (spot: number, expiry: string) => StrategyLeg[];
};

const STRATEGY_PRESETS: StrategyPreset[] = [
  {
    name: 'Long Call',
    description: 'Bullish — unlimited upside',
    icon: 'C+',
    buildLegs: (spot, expiry) => [
      { optionType: 'call', strike: Math.round(spot / 5) * 5, expiry, quantity: 1, premium: 0 }
    ],
  },
  {
    name: 'Long Put',
    description: 'Bearish — profit on decline',
    icon: 'P+',
    buildLegs: (spot, expiry) => [
      { optionType: 'put', strike: Math.round(spot / 5) * 5, expiry, quantity: 1, premium: 0 }
    ],
  },
  {
    name: 'Bull Call Spread',
    description: 'Moderate bullish — defined risk',
    icon: 'B+',
    buildLegs: (spot, expiry) => {
      const atm = Math.round(spot / 5) * 5;
      return [
        { optionType: 'call', strike: atm, expiry, quantity: 1, premium: 0 },
        { optionType: 'call', strike: atm + 10, expiry, quantity: -1, premium: 0 },
      ];
    },
  },
  {
    name: 'Bear Put Spread',
    description: 'Moderate bearish — defined risk',
    icon: 'B-',
    buildLegs: (spot, expiry) => {
      const atm = Math.round(spot / 5) * 5;
      return [
        { optionType: 'put', strike: atm, expiry, quantity: 1, premium: 0 },
        { optionType: 'put', strike: atm - 10, expiry, quantity: -1, premium: 0 },
      ];
    },
  },
  {
    name: 'Straddle',
    description: 'Big move either direction',
    icon: 'S',
    buildLegs: (spot, expiry) => {
      const atm = Math.round(spot / 5) * 5;
      return [
        { optionType: 'call', strike: atm, expiry, quantity: 1, premium: 0 },
        { optionType: 'put', strike: atm, expiry, quantity: 1, premium: 0 },
      ];
    },
  },
  {
    name: 'Iron Condor',
    description: 'Range-bound — collect premium',
    icon: 'IC',
    buildLegs: (spot, expiry) => {
      const atm = Math.round(spot / 5) * 5;
      return [
        { optionType: 'put', strike: atm - 20, expiry, quantity: 1, premium: 0 },
        { optionType: 'put', strike: atm - 10, expiry, quantity: -1, premium: 0 },
        { optionType: 'call', strike: atm + 10, expiry, quantity: -1, premium: 0 },
        { optionType: 'call', strike: atm + 20, expiry, quantity: 1, premium: 0 },
      ];
    },
  },
];

// ============================================
// PAYOFF DIAGRAM
// ============================================

function PayoffDiagram({ data, breakEvens, spotPrice }: {
  data: Array<{ price: number; pnl: number }>;
  breakEvens: number[];
  spotPrice: number;
}) {
  if (!data?.length) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
        Configure a strategy to see the payoff diagram
      </div>
    );
  }

  const maxPnl = Math.max(...data.map(d => d.pnl));
  const minPnl = Math.min(...data.map(d => d.pnl));
  const padding = Math.max(Math.abs(maxPnl), Math.abs(minPnl)) * 0.1;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="50%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="lossGradient" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
            <stop offset="50%" stopColor="#ef4444" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          dataKey="price"
          tickFormatter={(v) => `$${v.toLocaleString()}`}
          stroke="#475569"
          tick={{ fill: '#64748b', fontSize: 10 }}
        />
        <YAxis
          tickFormatter={(v) => `$${v >= 0 ? '+' : ''}${v.toLocaleString()}`}
          stroke="#475569"
          tick={{ fill: '#64748b', fontSize: 10 }}
          domain={[minPnl - padding, maxPnl + padding]}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: 8,
            fontSize: 12,
          }}
          labelFormatter={(v) => `Price: $${Number(v).toLocaleString()}`}
          formatter={(value: number) => [
            `$${value >= 0 ? '+' : ''}${value.toFixed(2)}`,
            'P&L'
          ]}
        />
        <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
        <ReferenceLine
          x={spotPrice}
          stroke="#06b6d4"
          strokeDasharray="5 5"
          label={{ value: 'SPOT', fill: '#06b6d4', fontSize: 10, position: 'top' }}
        />
        {breakEvens.map((be, i) => (
          <ReferenceLine
            key={i}
            x={be}
            stroke="#f59e0b"
            strokeDasharray="3 3"
            label={{ value: 'BE', fill: '#f59e0b', fontSize: 10, position: 'top' }}
          />
        ))}
        <Area
          type="monotone"
          dataKey="pnl"
          stroke="#10b981"
          fill="url(#profitGradient)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: '#10b981' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ============================================
// GREEKS DISPLAY
// ============================================

function GreeksDisplay({ greeks, compact }: { greeks: Greeks | null; compact?: boolean }) {
  if (!greeks) return null;

  const items = [
    { label: 'Delta (Δ)', value: greeks.delta, color: 'text-cyan-400', format: (v: number) => v.toFixed(4) },
    { label: 'Gamma (Γ)', value: greeks.gamma, color: 'text-purple-400', format: (v: number) => v.toFixed(4) },
    { label: 'Theta (Θ)', value: greeks.theta, color: 'text-rose-400', format: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(4)}` },
    { label: 'Vega (ν)', value: greeks.vega, color: 'text-amber-400', format: (v: number) => v.toFixed(4) },
    { label: 'Rho (ρ)', value: greeks.rho, color: 'text-emerald-400', format: (v: number) => v.toFixed(4) },
  ];

  if (compact) {
    return (
      <div className="flex gap-4">
        {items.slice(0, 4).map(item => (
          <div key={item.label} className="text-center">
            <div className="text-[10px] text-slate-500">{item.label.split(' ')[0]}</div>
            <div className={cn("text-sm font-mono font-bold", item.color)}>{item.format(item.value)}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-5 gap-3">
      {items.map(item => (
        <div key={item.label} className="bg-slate-900/60 rounded-lg p-3 border border-slate-800/50 text-center">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{item.label}</div>
          <div className={cn("text-lg font-mono font-bold", item.color)}>{item.format(item.value)}</div>
        </div>
      ))}
    </div>
  );
}

// ============================================
// IV ANALYSIS PANEL
// ============================================

function IVAnalysisPanel({ ivData }: { ivData: IVAnalysis | null }) {
  if (!ivData) return null;

  const rankColor = ivData.ivRank > 70 ? 'text-rose-400' : ivData.ivRank > 30 ? 'text-amber-400' : 'text-emerald-400';
  const rankBg = ivData.ivRank > 70 ? 'bg-rose-500/10 border-rose-500/30' : ivData.ivRank > 30 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-emerald-500/10 border-emerald-500/30';
  const trendIcon = ivData.ivTrend === 'rising' ? <ArrowUpRight className="w-3.5 h-3.5" /> :
                    ivData.ivTrend === 'falling' ? <ArrowDownRight className="w-3.5 h-3.5" /> : null;

  return (
    <div className="space-y-3">
      {/* IV Rank / Percentile */}
      <div className="grid grid-cols-2 gap-3">
        <div className={cn("rounded-lg p-3 border text-center", rankBg)}>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">IV Rank</div>
          <div className={cn("text-2xl font-mono font-bold", rankColor)}>{ivData.ivRank.toFixed(0)}%</div>
        </div>
        <div className={cn("rounded-lg p-3 border text-center", rankBg)}>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">IV Percentile</div>
          <div className={cn("text-2xl font-mono font-bold", rankColor)}>{ivData.ivPercentile.toFixed(0)}%</div>
        </div>
      </div>

      {/* IV Stats */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-slate-900/60 rounded-lg p-2 border border-slate-800/50 text-center">
          <div className="text-[9px] text-slate-600 uppercase">Current</div>
          <div className="text-sm font-mono text-white font-bold">{(ivData.currentIV * 100).toFixed(1)}%</div>
        </div>
        <div className="bg-slate-900/60 rounded-lg p-2 border border-slate-800/50 text-center">
          <div className="text-[9px] text-slate-600 uppercase">52w High</div>
          <div className="text-sm font-mono text-rose-400">{(ivData.ivHigh52Week * 100).toFixed(1)}%</div>
        </div>
        <div className="bg-slate-900/60 rounded-lg p-2 border border-slate-800/50 text-center">
          <div className="text-[9px] text-slate-600 uppercase">52w Low</div>
          <div className="text-sm font-mono text-emerald-400">{(ivData.ivLow52Week * 100).toFixed(1)}%</div>
        </div>
        <div className="bg-slate-900/60 rounded-lg p-2 border border-slate-800/50 text-center">
          <div className="text-[9px] text-slate-600 uppercase">Trend</div>
          <div className={cn("text-sm font-mono font-bold flex items-center justify-center gap-1",
            ivData.ivTrend === 'rising' ? 'text-rose-400' : ivData.ivTrend === 'falling' ? 'text-emerald-400' : 'text-slate-400'
          )}>
            {trendIcon}
            {ivData.ivTrend.toUpperCase()}
          </div>
        </div>
      </div>

      {/* Expected Move */}
      <div className="bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/20 rounded-lg p-3">
        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Expected Move (1σ)</div>
        <div className="flex items-center gap-4">
          <span className="text-xl font-mono font-bold text-cyan-400">
            ±${ivData.expectedMove.toFixed(2)}
          </span>
          <span className="text-sm font-mono text-slate-400">
            ({ivData.expectedMovePercent.toFixed(2)}%)
          </span>
        </div>
      </div>

      {/* IV Rank Gauge */}
      <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-800/50">
        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">IV Rank Gauge</div>
        <div className="relative h-3 rounded-full bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500 overflow-hidden">
          <div
            className="absolute top-0 h-full w-1 bg-white shadow-lg shadow-white/50 rounded-full"
            style={{ left: `${Math.min(100, Math.max(0, ivData.ivRank))}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-emerald-500">Low IV</span>
          <span className="text-[9px] text-amber-500">Normal</span>
          <span className="text-[9px] text-rose-500">High IV</span>
        </div>
      </div>
    </div>
  );
}

// ============================================
// LEG EDITOR
// ============================================

function LegEditor({ legs, setLegs, spotPrice }: {
  legs: StrategyLeg[];
  setLegs: (legs: StrategyLeg[]) => void;
  spotPrice: number;
}) {
  const updateLeg = (index: number, field: keyof StrategyLeg, value: any) => {
    const updated = [...legs];
    updated[index] = { ...updated[index], [field]: value };
    setLegs(updated);
  };

  const removeLeg = (index: number) => {
    setLegs(legs.filter((_, i) => i !== index));
  };

  const addLeg = () => {
    setLegs([...legs, {
      optionType: 'call',
      strike: Math.round(spotPrice / 5) * 5,
      expiry: getDefaultExpiry(),
      quantity: 1,
      premium: 0,
    }]);
  };

  return (
    <div className="space-y-2">
      {legs.map((leg, i) => (
        <div key={i} className="flex items-center gap-2 p-2 bg-slate-900/40 rounded-lg border border-slate-800/50">
          {/* Long/Short */}
          <button
            onClick={() => updateLeg(i, 'quantity', leg.quantity > 0 ? -Math.abs(leg.quantity) : Math.abs(leg.quantity))}
            className={cn(
              "px-2 py-1 rounded text-[10px] font-bold min-w-[50px]",
              leg.quantity > 0
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                : "bg-rose-500/20 text-rose-400 border border-rose-500/40"
            )}
          >
            {leg.quantity > 0 ? 'LONG' : 'SHORT'}
          </button>

          {/* Qty */}
          <Input
            type="number"
            value={Math.abs(leg.quantity)}
            onChange={(e) => {
              const abs = Math.max(1, parseInt(e.target.value) || 1);
              updateLeg(i, 'quantity', leg.quantity > 0 ? abs : -abs);
            }}
            className="w-14 h-7 text-xs bg-slate-900 border-slate-700 font-mono text-center"
          />

          {/* Call/Put */}
          <button
            onClick={() => updateLeg(i, 'optionType', leg.optionType === 'call' ? 'put' : 'call')}
            className={cn(
              "px-2 py-1 rounded text-[10px] font-bold min-w-[44px]",
              leg.optionType === 'call'
                ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                : "bg-orange-500/20 text-orange-400 border border-orange-500/40"
            )}
          >
            {leg.optionType.toUpperCase()}
          </button>

          {/* Strike */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-600">$</span>
            <Input
              type="number"
              value={leg.strike}
              onChange={(e) => updateLeg(i, 'strike', parseFloat(e.target.value) || 0)}
              className="w-20 h-7 text-xs bg-slate-900 border-slate-700 font-mono"
            />
          </div>

          {/* Premium */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-600">@</span>
            <Input
              type="number"
              step="0.01"
              value={leg.premium}
              onChange={(e) => updateLeg(i, 'premium', parseFloat(e.target.value) || 0)}
              className="w-16 h-7 text-xs bg-slate-900 border-slate-700 font-mono"
              placeholder="Price"
            />
          </div>

          {/* Expiry */}
          <Input
            type="date"
            value={leg.expiry}
            onChange={(e) => updateLeg(i, 'expiry', e.target.value)}
            className="w-32 h-7 text-xs bg-slate-900 border-slate-700 font-mono"
          />

          {/* Remove */}
          <button onClick={() => removeLeg(i)} className="text-slate-600 hover:text-rose-400 transition-colors p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      <button
        onClick={addLeg}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-cyan-400 transition-colors py-1"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Leg
      </button>
    </div>
  );
}

// ============================================
// QUICK PRICE CALCULATOR
// ============================================

function QuickPriceCalc() {
  const [symbol, setSymbol] = useState('SPY');
  const [strike, setStrike] = useState(580);
  const [optionType, setOptionType] = useState<'call' | 'put'>('call');
  const [vol, setVol] = useState(0.2);
  const [daysToExpiry, setDaysToExpiry] = useState(30);

  const priceMutation = useMutation({
    mutationFn: async () => {
      // First get current price
      const quoteRes = await fetch(`/api/stock/${symbol}`);
      const quoteData = quoteRes.ok ? await quoteRes.json() : null;
      const spotPrice = quoteData?.price || quoteData?.last || strike;

      const res = await fetch('/api/options-quant/price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spotPrice,
          strikePrice: strike,
          timeToExpiry: daysToExpiry / 365,
          volatility: vol,
          optionType,
        }),
      });
      if (!res.ok) throw new Error('Failed to price option');
      return { ...await res.json(), spotPrice };
    },
  });

  return (
    <Card className="bg-[#0a0a0a] border-[#1a1a1a] p-4">
      <div className="flex items-center gap-2 mb-3">
        <Calculator className="w-4 h-4 text-cyan-400" />
        <h4 className="text-sm font-semibold text-white">Quick Price</h4>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        <Input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="Symbol"
          className="w-16 h-7 text-xs bg-slate-900 border-slate-700 font-mono"
        />
        <Input
          type="number"
          value={strike}
          onChange={(e) => setStrike(parseFloat(e.target.value) || 0)}
          className="w-20 h-7 text-xs bg-slate-900 border-slate-700 font-mono"
          placeholder="Strike"
        />
        <button
          onClick={() => setOptionType(optionType === 'call' ? 'put' : 'call')}
          className={cn(
            "px-2 py-1 rounded text-[10px] font-bold",
            optionType === 'call'
              ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
              : "bg-orange-500/20 text-orange-400 border border-orange-500/40"
          )}
        >
          {optionType.toUpperCase()}
        </button>
        <Input
          type="number"
          value={daysToExpiry}
          onChange={(e) => setDaysToExpiry(parseInt(e.target.value) || 1)}
          className="w-14 h-7 text-xs bg-slate-900 border-slate-700 font-mono"
          placeholder="DTE"
        />
        <Input
          type="number"
          step="0.01"
          value={vol}
          onChange={(e) => setVol(parseFloat(e.target.value) || 0.2)}
          className="w-14 h-7 text-xs bg-slate-900 border-slate-700 font-mono"
          placeholder="IV"
        />
        <Button
          size="sm"
          onClick={() => priceMutation.mutate()}
          disabled={priceMutation.isPending}
          className="h-7 text-xs bg-cyan-600 hover:bg-cyan-500"
        >
          {priceMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Price'}
        </Button>
      </div>

      {priceMutation.data && (
        <div className="space-y-2">
          <div className="flex items-center gap-4">
            <div>
              <div className="text-[10px] text-slate-500">Theoretical Price</div>
              <div className="text-2xl font-mono font-bold text-white">
                ${priceMutation.data.theoreticalPrice.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">Contract Cost</div>
              <div className="text-lg font-mono font-bold text-amber-400">
                ${(priceMutation.data.theoreticalPrice * 100).toFixed(0)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">Spot</div>
              <div className="text-sm font-mono text-slate-400">
                ${priceMutation.data.spotPrice?.toLocaleString()}
              </div>
            </div>
          </div>
          <GreeksDisplay greeks={priceMutation.data.greeks} compact />
        </div>
      )}
    </Card>
  );
}

// ============================================
// HELPER
// ============================================

function getDefaultExpiry(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  const fri = new Date(d);
  fri.setDate(fri.getDate() + ((5 - fri.getDay() + 7) % 7 || 7));
  return fri.toISOString().split('T')[0];
}

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.max(1, Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

// ============================================
// MAIN EXPORT: STRATEGY LAB
// ============================================

export function StrategyLab() {
  const [symbol, setSymbol] = useState('SPY');
  const [symbolInput, setSymbolInput] = useState('SPY');
  const [legs, setLegs] = useState<StrategyLeg[]>([]);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [showIV, setShowIV] = useState(false);

  // Fetch current stock price
  const { data: quoteData } = useQuery({
    queryKey: ['/api/stock', symbol],
    queryFn: async () => {
      const res = await fetch(`/api/stock/${symbol}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!symbol,
    staleTime: 30000,
  });

  const spotPrice = quoteData?.price || quoteData?.last || 580;

  // Price each leg with Black-Scholes when legs change
  const priceLegsMutation = useMutation({
    mutationFn: async (currentLegs: StrategyLeg[]) => {
      const pricedLegs = await Promise.all(
        currentLegs.map(async (leg) => {
          if (leg.premium > 0) return leg; // Already has a price
          try {
            const res = await fetch('/api/options-quant/price', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                spotPrice,
                strikePrice: leg.strike,
                timeToExpiry: daysUntil(leg.expiry) / 365,
                volatility: 0.25,
                optionType: leg.optionType,
              }),
            });
            if (!res.ok) return leg;
            const data = await res.json();
            return { ...leg, premium: data.theoreticalPrice };
          } catch {
            return leg;
          }
        })
      );
      return pricedLegs;
    },
    onSuccess: (pricedLegs) => {
      setLegs(pricedLegs);
    },
  });

  // Simulate strategy payoff
  const simulateMutation = useMutation<StrategyPayoff>({
    mutationFn: async () => {
      const res = await fetch('/api/options-quant/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legs,
          spotPrice,
          priceRange: {
            min: spotPrice * 0.85,
            max: spotPrice * 1.15,
            step: spotPrice * 0.005,
          },
          volatility: 0.25,
        }),
      });
      if (!res.ok) throw new Error('Failed to simulate');
      return res.json();
    },
  });

  // IV Analysis
  const ivMutation = useMutation<IVAnalysis>({
    mutationFn: async () => {
      const res = await fetch('/api/options-quant/iv-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentIV: 0.25,
          // Let backend generate synthetic historical data if none provided
        }),
      });
      if (!res.ok) throw new Error('Failed to get IV analysis');
      return res.json();
    },
  });

  // Apply a preset strategy
  const applyPreset = useCallback((preset: StrategyPreset) => {
    const expiry = getDefaultExpiry();
    const newLegs = preset.buildLegs(spotPrice, expiry);
    setLegs(newLegs);
    setActivePreset(preset.name);
    // Auto-price the legs
    setTimeout(() => priceLegsMutation.mutate(newLegs), 100);
  }, [spotPrice]);

  // Run simulation
  const runSimulation = useCallback(() => {
    if (legs.length === 0) return;
    simulateMutation.mutate();
    if (showIV) ivMutation.mutate();
  }, [legs, showIV]);

  const handleSymbolChange = () => {
    setSymbol(symbolInput);
    setLegs([]);
    setActivePreset(null);
  };

  const payoff = simulateMutation.data;
  const netCost = legs.reduce((sum, leg) => sum + leg.premium * leg.quantity * 100, 0);

  return (
    <div className="space-y-6">
      {/* Header: Symbol + Quick Symbols */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Input
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleSymbolChange()}
            placeholder="Symbol"
            className="w-24 h-8 text-sm bg-slate-900 border-slate-700 font-mono"
          />
          <Button size="sm" onClick={handleSymbolChange} className="h-8 text-xs bg-cyan-600 hover:bg-cyan-500">
            Go
          </Button>
        </div>
        <div className="flex gap-1.5">
          {['SPY', 'QQQ', 'SPX', 'IWM', 'TSLA', 'NVDA', 'AAPL'].map(s => (
            <button
              key={s}
              onClick={() => { setSymbolInput(s); setSymbol(s); setLegs([]); setActivePreset(null); }}
              className={cn(
                "px-2 py-1 rounded text-[10px] font-mono transition-colors",
                symbol === s
                  ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                  : "bg-slate-800/50 text-slate-500 hover:text-slate-300 border border-transparent"
              )}
            >
              {s}
            </button>
          ))}
        </div>
        {quoteData && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-lg font-mono font-bold text-white">${spotPrice.toLocaleString()}</span>
            <Badge className="bg-slate-700/50 text-slate-400 border-slate-600/50 text-[10px]">{symbol}</Badge>
          </div>
        )}
      </div>

      {/* Strategy Presets */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {STRATEGY_PRESETS.map(preset => (
          <button
            key={preset.name}
            onClick={() => applyPreset(preset)}
            className={cn(
              "p-3 rounded-lg border text-left transition-all hover:scale-[1.02]",
              activePreset === preset.name
                ? "bg-cyan-500/10 border-cyan-500/40 shadow-lg shadow-cyan-500/10"
                : "bg-slate-900/60 border-slate-800/50 hover:border-slate-700"
            )}
          >
            <div className="text-lg mb-1">{preset.icon}</div>
            <div className="text-xs font-semibold text-white">{preset.name}</div>
            <div className="text-[10px] text-slate-500">{preset.description}</div>
          </button>
        ))}
      </div>

      {/* Main Content: Builder + Results */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Leg Builder (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="bg-[#0a0a0a] border-[#1a1a1a] p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-white">Strategy Legs</h3>
              </div>
              {legs.length > 0 && (
                <Badge className="bg-slate-700/50 text-slate-400 border-slate-600/50 text-[10px]">
                  {legs.length} leg{legs.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>

            <LegEditor legs={legs} setLegs={setLegs} spotPrice={spotPrice} />

            {legs.length > 0 && (
              <div className="flex gap-2 mt-4">
                <Button
                  onClick={() => priceLegsMutation.mutate(legs)}
                  disabled={priceLegsMutation.isPending}
                  size="sm"
                  variant="outline"
                  className="text-xs border-slate-700 hover:bg-slate-800"
                >
                  {priceLegsMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <DollarSign className="w-3 h-3 mr-1" />}
                  Auto-Price
                </Button>
                <Button
                  onClick={runSimulation}
                  disabled={simulateMutation.isPending}
                  size="sm"
                  className="text-xs bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 flex-1"
                >
                  {simulateMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <Zap className="w-3 h-3 mr-1" />}
                  Simulate
                </Button>
              </div>
            )}
          </Card>

          {/* Net Cost / Credit */}
          {legs.length > 0 && (
            <Card className="bg-[#0a0a0a] border-[#1a1a1a] p-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Net Premium</div>
                  <div className={cn("text-xl font-mono font-bold",
                    netCost > 0 ? "text-rose-400" : netCost < 0 ? "text-emerald-400" : "text-slate-400"
                  )}>
                    {netCost > 0 ? '-' : netCost < 0 ? '+' : ''}${Math.abs(netCost).toFixed(0)}
                  </div>
                  <div className="text-[10px] text-slate-600">
                    {netCost > 0 ? 'Debit (you pay)' : netCost < 0 ? 'Credit (you receive)' : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Per Contract</div>
                  <div className="text-xl font-mono font-bold text-white">
                    ${Math.abs(netCost / 100).toFixed(2)}
                  </div>
                  <div className="text-[10px] text-slate-600">×100 multiplier</div>
                </div>
              </div>
            </Card>
          )}

          {/* Quick Price Calc */}
          <QuickPriceCalc />
        </div>

        {/* Right: Payoff Diagram + Greeks + Stats (3 cols) */}
        <div className="lg:col-span-3 space-y-4">
          {/* Payoff Diagram */}
          <Card className="bg-[#0a0a0a] border-[#1a1a1a] p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">Payoff Diagram</h3>
              </div>
              {payoff && (
                <div className="flex items-center gap-3">
                  {payoff.breakEvenPoints.length > 0 && (
                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40 text-[10px]">
                      BE: ${payoff.breakEvenPoints.map(b => b.toFixed(0)).join(' / $')}
                    </Badge>
                  )}
                </div>
              )}
            </div>

            <PayoffDiagram
              data={payoff?.payoffCurve || []}
              breakEvens={payoff?.breakEvenPoints || []}
              spotPrice={spotPrice}
            />
          </Card>

          {/* Strategy Stats */}
          {payoff && (
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-center">
                <div className="text-[10px] text-slate-500 uppercase">Max Profit</div>
                <div className="text-lg font-mono font-bold text-emerald-400">
                  {payoff.maxProfit === 'unlimited' ? '∞' : `$${Number(payoff.maxProfit).toFixed(0)}`}
                </div>
              </div>
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 text-center">
                <div className="text-[10px] text-slate-500 uppercase">Max Loss</div>
                <div className="text-lg font-mono font-bold text-rose-400">
                  {payoff.maxLoss === 'unlimited' ? '∞' : `$${Math.abs(Number(payoff.maxLoss)).toFixed(0)}`}
                </div>
              </div>
              <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3 text-center">
                <div className="text-[10px] text-slate-500 uppercase">P(Profit)</div>
                <div className="text-lg font-mono font-bold text-cyan-400">
                  {(payoff.probabilityOfProfit * 100).toFixed(0)}%
                </div>
              </div>
              <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 text-center">
                <div className="text-[10px] text-slate-500 uppercase">E[Value]</div>
                <div className={cn("text-lg font-mono font-bold",
                  payoff.expectedValue >= 0 ? "text-emerald-400" : "text-rose-400"
                )}>
                  ${payoff.expectedValue.toFixed(0)}
                </div>
              </div>
            </div>
          )}

          {/* Greeks */}
          {payoff?.greeksAggregate && (
            <Card className="bg-[#0a0a0a] border-[#1a1a1a] p-4">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-semibold text-white">Position Greeks</h3>
              </div>
              <GreeksDisplay greeks={payoff.greeksAggregate} />
            </Card>
          )}

          {/* IV Analysis Toggle */}
          <Card className="bg-[#0a0a0a] border-[#1a1a1a] p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-white">IV Analysis</h3>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setShowIV(!showIV); if (!showIV) ivMutation.mutate(); }}
                className="h-6 text-[10px] border-slate-700"
              >
                {showIV ? 'Hide' : 'Analyze IV'}
              </Button>
            </div>

            {showIV && ivMutation.isPending && (
              <div className="flex items-center gap-2 py-4 text-slate-500 text-sm">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Analyzing implied volatility...
              </div>
            )}

            {showIV && ivMutation.data && (
              <IVAnalysisPanel ivData={ivMutation.data} />
            )}

            {showIV && !ivMutation.data && !ivMutation.isPending && (
              <div className="text-center py-4 text-slate-600 text-sm">
                Click "Analyze IV" to see IV rank, percentile, and expected move
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default StrategyLab;
