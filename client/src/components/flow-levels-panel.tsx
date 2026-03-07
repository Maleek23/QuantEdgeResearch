/**
 * Flow & Levels Panel — Surfaces GEX, Dark Pool, and Whale Flow data
 * Powered by existing backend engines: gamma-exposure.ts, whale-flow-service.ts, options-flow-scanner.ts
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Target,
  Zap,
  Search,
  RefreshCw,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Shield,
  Flame,
  Eye,
} from "lucide-react";

// ============================================
// GAMMA EXPOSURE (GEX) LEVELS
// ============================================

interface GammaByStrike {
  strike: number;
  callGamma: number;
  putGamma: number;
  callOI: number;
  putOI: number;
  netGEX: number;
  callGEX: number;
  putGEX: number;
}

interface GammaExposureData {
  symbol: string;
  spotPrice: number;
  expiration: string;
  totalNetGEX: number;
  flipPoint: number | null;
  maxGammaStrike: number;
  strikes: GammaByStrike[];
  timestamp: string;
}

function GEXLevelsPanel({ symbol }: { symbol: string }) {
  const { data, isLoading, refetch } = useQuery<GammaExposureData>({
    queryKey: ['/api/gamma-exposure', symbol],
    queryFn: async () => {
      const res = await fetch(`/api/gamma-exposure/${symbol}`);
      if (!res.ok) throw new Error('Failed to fetch GEX');
      return res.json();
    },
    refetchInterval: 120000, // 2 min
    enabled: !!symbol,
  });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-8 bg-slate-800/50 rounded" />
        ))}
      </div>
    );
  }

  if (!data || !data.strikes?.length) {
    return (
      <div className="text-center py-8 text-slate-500">
        <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No GEX data available for {symbol}</p>
        <p className="text-xs mt-1">Requires active options chain</p>
      </div>
    );
  }

  // Sort strikes by absolute GEX and take top 15
  const topStrikes = [...data.strikes]
    .sort((a, b) => Math.abs(b.netGEX) - Math.abs(a.netGEX))
    .slice(0, 15)
    .sort((a, b) => b.strike - a.strike);

  const maxAbsGEX = Math.max(...topStrikes.map(s => Math.abs(s.netGEX)), 1);
  const isPositiveGamma = data.totalNetGEX > 0;

  return (
    <div className="space-y-4">
      {/* Header Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-800/50">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Spot Price</div>
          <div className="text-lg font-mono font-bold text-white">${data.spotPrice.toLocaleString()}</div>
        </div>
        <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-800/50">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Gamma Flip</div>
          <div className={cn("text-lg font-mono font-bold", data.flipPoint ? "text-amber-400" : "text-slate-600")}>
            {data.flipPoint ? `$${data.flipPoint.toLocaleString()}` : '—'}
          </div>
        </div>
        <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-800/50">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Net GEX</div>
          <div className={cn("text-lg font-mono font-bold", isPositiveGamma ? "text-emerald-400" : "text-rose-400")}>
            {isPositiveGamma ? '+' : ''}{(data.totalNetGEX / 1e9).toFixed(2)}B
          </div>
        </div>
      </div>

      {/* Gamma Regime Badge */}
      <div className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm",
        isPositiveGamma
          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
          : "bg-rose-500/10 border-rose-500/30 text-rose-400"
      )}>
        <Shield className="w-4 h-4" />
        <span className="font-medium">
          {isPositiveGamma ? 'POSITIVE GAMMA' : 'NEGATIVE GAMMA'}
        </span>
        <span className="text-xs opacity-70">
          — {isPositiveGamma
            ? 'Market makers dampen moves (mean-reverting)'
            : 'Market makers amplify moves (trending/volatile)'}
        </span>
      </div>

      {/* GEX Bar Chart */}
      <div className="space-y-1">
        {topStrikes.map((s) => {
          const barWidth = Math.abs(s.netGEX) / maxAbsGEX * 100;
          const isCall = s.netGEX > 0;
          const isSpot = Math.abs(s.strike - data.spotPrice) < data.spotPrice * 0.003;
          const isFlip = data.flipPoint && Math.abs(s.strike - data.flipPoint) < data.spotPrice * 0.003;
          const isMax = s.strike === data.maxGammaStrike;

          return (
            <div
              key={s.strike}
              className={cn(
                "flex items-center gap-2 py-1.5 px-2 rounded transition-colors",
                isSpot && "bg-cyan-500/10 border border-cyan-500/30",
                isFlip && "bg-amber-500/10 border border-amber-500/30",
                isMax && "bg-purple-500/10 border border-purple-500/30",
              )}
            >
              <div className="w-16 text-right">
                <span className={cn(
                  "text-xs font-mono",
                  isSpot ? "text-cyan-400 font-bold" : "text-slate-400"
                )}>
                  ${s.strike.toLocaleString()}
                </span>
              </div>

              {/* Negative bar (left) */}
              <div className="flex-1 flex justify-end">
                {!isCall && (
                  <div
                    className="h-5 rounded-l bg-gradient-to-l from-rose-500/80 to-rose-600/40 transition-all"
                    style={{ width: `${barWidth}%` }}
                  />
                )}
              </div>

              {/* Center divider */}
              <div className="w-px h-5 bg-slate-700" />

              {/* Positive bar (right) */}
              <div className="flex-1">
                {isCall && (
                  <div
                    className="h-5 rounded-r bg-gradient-to-r from-emerald-500/80 to-emerald-600/40 transition-all"
                    style={{ width: `${barWidth}%` }}
                  />
                )}
              </div>

              <div className="w-20 text-right">
                <span className={cn(
                  "text-[10px] font-mono",
                  isCall ? "text-emerald-400" : "text-rose-400"
                )}>
                  {isCall ? '+' : ''}{(s.netGEX / 1e6).toFixed(1)}M
                </span>
              </div>

              {/* Labels */}
              <div className="w-14 flex gap-1">
                {isSpot && <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/40 text-[8px] px-1">SPOT</Badge>}
                {isFlip && <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40 text-[8px] px-1">FLIP</Badge>}
                {isMax && <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/40 text-[8px] px-1">MAX</Badge>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between text-[10px] text-slate-600 px-2">
        <span>← Put GEX (bearish)</span>
        <span>Call GEX (bullish) →</span>
      </div>
    </div>
  );
}

// ============================================
// WHALE FLOW FEED
// ============================================

interface WhaleFlow {
  id?: number;
  symbol: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  flowType: string;
  premium: number;
  strike?: number;
  expiry?: string;
  optionType?: string;
  size?: number;
  timestamp: string;
  sentiment?: string;
}

function WhaleFlowFeed() {
  const { data, isLoading } = useQuery<{ flows: WhaleFlow[] }>({
    queryKey: ['/api/whale-flow'],
    queryFn: async () => {
      const res = await fetch('/api/whale-flow');
      if (!res.ok) return { flows: [] };
      return res.json();
    },
    refetchInterval: 60000,
  });

  const { data: signals } = useQuery<{ signals: any[] }>({
    queryKey: ['/api/whale-flow/signals/actionable'],
    queryFn: async () => {
      const res = await fetch('/api/whale-flow/signals/actionable');
      if (!res.ok) return { signals: [] };
      return res.json();
    },
    refetchInterval: 60000,
  });

  const flows = data?.flows || [];
  const actionableSignals = signals?.signals || [];

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 bg-slate-800/50 rounded" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Actionable Signals */}
      {actionableSignals.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-amber-400 font-medium">
            <Zap className="w-3.5 h-3.5" />
            ACTIONABLE SIGNALS
          </div>
          {actionableSignals.slice(0, 3).map((sig: any, i: number) => (
            <div key={i} className={cn(
              "flex items-center justify-between p-3 rounded-lg border",
              sig.direction === 'bullish'
                ? "bg-emerald-500/5 border-emerald-500/20"
                : "bg-rose-500/5 border-rose-500/20"
            )}>
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-white">{sig.symbol}</span>
                <Badge className={cn(
                  "text-[10px]",
                  sig.direction === 'bullish'
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                    : "bg-rose-500/20 text-rose-400 border-rose-500/40"
                )}>
                  {sig.direction?.toUpperCase()}
                </Badge>
              </div>
              <span className="text-xs text-slate-400">{sig.reason || sig.flowType}</span>
            </div>
          ))}
        </div>
      )}

      {/* Flow Feed */}
      <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
        {flows.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No whale flow detected</p>
            <p className="text-xs mt-1">Large institutional orders appear here in real-time</p>
          </div>
        ) : (
          flows.slice(0, 20).map((flow, i) => {
            const isBullish = flow.direction === 'bullish';
            const premium = typeof flow.premium === 'number' ? flow.premium : 0;
            const premiumStr = premium >= 1e6
              ? `$${(premium / 1e6).toFixed(1)}M`
              : premium >= 1e3
                ? `$${(premium / 1e3).toFixed(0)}K`
                : `$${premium.toFixed(0)}`;

            return (
              <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-800/40 transition-colors border border-transparent hover:border-slate-700/50">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-1.5 h-8 rounded-full",
                    isBullish ? "bg-emerald-500" : flow.direction === 'bearish' ? "bg-rose-500" : "bg-slate-600"
                  )} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-white">{flow.symbol}</span>
                      <Badge className="text-[8px] bg-slate-700/50 text-slate-400 border-slate-600/50">
                        {flow.flowType?.replace('_', ' ').toUpperCase() || 'FLOW'}
                      </Badge>
                    </div>
                    {flow.strike && (
                      <span className="text-[10px] text-slate-500 font-mono">
                        ${flow.strike} {flow.optionType?.toUpperCase()} {flow.expiry || ''}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className={cn(
                    "text-sm font-mono font-bold",
                    isBullish ? "text-emerald-400" : flow.direction === 'bearish' ? "text-rose-400" : "text-slate-400"
                  )}>
                    {premiumStr}
                  </div>
                  <div className="text-[10px] text-slate-600">
                    {flow.timestamp ? new Date(flow.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ============================================
// SMART MONEY SCORE
// ============================================

function SmartMoneyScore() {
  const { data } = useQuery<any>({
    queryKey: ['/api/whale-flow/market'],
    queryFn: async () => {
      const res = await fetch('/api/whale-flow/market');
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 60000,
  });

  const sentiment = data?.sentiment || 'neutral';
  const score = data?.score || 50;
  const isBullish = sentiment === 'bullish';
  const isBearish = sentiment === 'bearish';

  return (
    <div className={cn(
      "flex items-center gap-4 p-4 rounded-xl border",
      isBullish ? "bg-emerald-500/5 border-emerald-500/20" :
      isBearish ? "bg-rose-500/5 border-rose-500/20" :
      "bg-slate-800/30 border-slate-700/30"
    )}>
      <div className={cn(
        "flex items-center justify-center w-14 h-14 rounded-full border-2",
        isBullish ? "border-emerald-500 text-emerald-400" :
        isBearish ? "border-rose-500 text-rose-400" :
        "border-slate-600 text-slate-400"
      )}>
        <span className="text-xl font-bold font-mono">{score}</span>
      </div>
      <div>
        <div className="text-sm font-medium text-white flex items-center gap-2">
          Smart Money Bias
          {isBullish && <ArrowUpRight className="w-4 h-4 text-emerald-400" />}
          {isBearish && <ArrowDownRight className="w-4 h-4 text-rose-400" />}
        </div>
        <div className={cn(
          "text-xs font-mono",
          isBullish ? "text-emerald-400" : isBearish ? "text-rose-400" : "text-slate-500"
        )}>
          {sentiment.toUpperCase()} — {data?.callPremium && data?.putPremium
            ? `Calls: $${(data.callPremium / 1e6).toFixed(1)}M | Puts: $${(data.putPremium / 1e6).toFixed(1)}M`
            : 'Analyzing flow...'}
        </div>
      </div>
    </div>
  );
}

// ============================================
// MAIN EXPORT: FLOW & LEVELS TAB
// ============================================

export function FlowLevelsPanel() {
  const [gexSymbol, setGexSymbol] = useState('SPY');
  const [symbolInput, setSymbolInput] = useState('SPY');

  return (
    <div className="space-y-6">
      {/* Smart Money Score - Full Width */}
      <SmartMoneyScore />

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: GEX Levels */}
        <Card className="bg-[#0a0a0a] border-[#1a1a1a] p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-purple-400" />
              <h3 className="font-semibold text-white">Gamma Exposure (GEX)</h3>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && setGexSymbol(symbolInput)}
                placeholder="Symbol"
                className="w-20 h-7 text-xs bg-slate-900 border-slate-700 font-mono"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setGexSymbol(symbolInput)}
                className="h-7 w-7 p-0"
              >
                <Search className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Quick symbol buttons */}
          <div className="flex gap-1.5 mb-4">
            {['SPY', 'QQQ', 'IWM', 'AAPL', 'TSLA', 'NVDA'].map(s => (
              <button
                key={s}
                onClick={() => { setGexSymbol(s); setSymbolInput(s); }}
                className={cn(
                  "px-2 py-1 rounded text-[10px] font-mono transition-colors",
                  gexSymbol === s
                    ? "bg-purple-500/20 text-purple-400 border border-purple-500/40"
                    : "bg-slate-800/50 text-slate-500 hover:text-slate-300 border border-transparent"
                )}
              >
                {s}
              </button>
            ))}
          </div>

          <GEXLevelsPanel symbol={gexSymbol} />
        </Card>

        {/* Right: Whale Flow Feed */}
        <Card className="bg-[#0a0a0a] border-[#1a1a1a] p-4">
          <div className="flex items-center gap-2 mb-4">
            <Flame className="w-5 h-5 text-orange-400" />
            <h3 className="font-semibold text-white">Whale Flow</h3>
            <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/40 text-[8px]">
              LIVE
            </Badge>
          </div>
          <WhaleFlowFeed />
        </Card>
      </div>
    </div>
  );
}

export default FlowLevelsPanel;
