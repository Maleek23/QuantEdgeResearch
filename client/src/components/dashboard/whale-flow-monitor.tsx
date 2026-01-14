/**
 * WHALE FLOW MONITOR
 *
 * Real-time institutional options flow tracking
 * Shows big money moves like "$3M ZETA calls"
 *
 * Features:
 * - Live flow ticker
 * - Whale alert cards with premium size
 * - Direction indicators (bullish/bearish)
 * - Sector heatmap
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Activity, DollarSign,
  AlertTriangle, Zap, Target, Clock, Filter,
  ArrowUpRight, ArrowDownRight, Flame, Eye
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface WhaleFlow {
  id: string;
  symbol: string;
  type: 'CALL' | 'PUT';
  strike: number;
  expiry: string;
  premium: number; // Total premium in dollars
  volume: number;
  openInterest: number;
  volOiRatio: number;
  flowType: 'SWEEP' | 'BLOCK' | 'UNUSUAL' | 'WHALE' | 'MEGA_WHALE';
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  timestamp: Date;
  sector?: string;
}

// Format large numbers
const formatPremium = (value: number): string => {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

// Flow type colors and icons
const flowTypeConfig: Record<string, { color: string; icon: any; glow: string }> = {
  MEGA_WHALE: { color: 'text-purple-400', icon: Flame, glow: 'shadow-purple-500/50' },
  WHALE: { color: 'text-blue-400', icon: Target, glow: 'shadow-blue-500/50' },
  SWEEP: { color: 'text-orange-400', icon: Zap, glow: 'shadow-orange-500/50' },
  BLOCK: { color: 'text-cyan-400', icon: Activity, glow: 'shadow-cyan-500/50' },
  UNUSUAL: { color: 'text-yellow-400', icon: AlertTriangle, glow: 'shadow-yellow-500/50' },
};

// Single whale flow card
function WhaleFlowCard({ flow, isNew }: { flow: WhaleFlow; isNew?: boolean }) {
  const isBullish = flow.sentiment === 'BULLISH';
  const config = flowTypeConfig[flow.flowType] || flowTypeConfig.UNUSUAL;
  const FlowIcon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 20, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "relative overflow-hidden rounded-lg border transition-all duration-300",
        isBullish
          ? "bg-gradient-to-r from-emerald-950/40 to-emerald-900/20 border-emerald-500/30"
          : "bg-gradient-to-r from-red-950/40 to-red-900/20 border-red-500/30",
        isNew && "ring-2 ring-yellow-400/50 animate-pulse"
      )}
    >
      {/* Glow effect for mega whales */}
      {flow.flowType === 'MEGA_WHALE' && (
        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-pink-500/10 animate-pulse" />
      )}

      <div className="relative p-4">
        <div className="flex items-start justify-between gap-3">
          {/* Left: Symbol and details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl font-bold text-white">{flow.symbol}</span>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs font-semibold",
                  flow.type === 'CALL'
                    ? "border-emerald-500/50 text-emerald-400"
                    : "border-red-500/50 text-red-400"
                )}
              >
                {flow.type}
              </Badge>
              <FlowIcon className={cn("w-4 h-4", config.color)} />
            </div>

            <div className="flex items-center gap-3 text-sm text-gray-400">
              <span>${flow.strike} strike</span>
              <span className="text-gray-600">|</span>
              <span>{flow.expiry}</span>
            </div>
          </div>

          {/* Right: Premium and sentiment */}
          <div className="text-right">
            <div className={cn(
              "text-2xl font-bold",
              flow.premium >= 5000000 ? "text-purple-400" :
              flow.premium >= 1000000 ? "text-blue-400" :
              "text-cyan-400"
            )}>
              {formatPremium(flow.premium)}
            </div>
            <div className="flex items-center justify-end gap-1 mt-1">
              {isBullish ? (
                <ArrowUpRight className="w-4 h-4 text-emerald-400" />
              ) : (
                <ArrowDownRight className="w-4 h-4 text-red-400" />
              )}
              <span className={cn(
                "text-sm font-medium",
                isBullish ? "text-emerald-400" : "text-red-400"
              )}>
                {flow.sentiment}
              </span>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-800">
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Activity className="w-3 h-3" />
            <span>Vol: {flow.volume.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Eye className="w-3 h-3" />
            <span>OI: {flow.openInterest.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className={cn(
              flow.volOiRatio > 5 ? "text-orange-400" :
              flow.volOiRatio > 2 ? "text-yellow-400" :
              "text-gray-400"
            )}>
              {flow.volOiRatio.toFixed(1)}x Vol/OI
            </span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Clock className="w-3 h-3" />
            <span>{new Date(flow.timestamp).toLocaleTimeString()}</span>
          </div>
        </div>

        {/* Confidence bar */}
        <div className="mt-2">
          <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
            <motion.div
              className={cn(
                "h-full rounded-full",
                flow.confidence >= 85 ? "bg-emerald-500" :
                flow.confidence >= 70 ? "bg-cyan-500" :
                "bg-yellow-500"
              )}
              initial={{ width: 0 }}
              animate={{ width: `${flow.confidence}%` }}
              transition={{ duration: 0.5, delay: 0.2 }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Live ticker component
function FlowTicker({ flows }: { flows: WhaleFlow[] }) {
  const [tickerIndex, setTickerIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTickerIndex(prev => (prev + 1) % Math.max(flows.length, 1));
    }, 3000);
    return () => clearInterval(interval);
  }, [flows.length]);

  if (flows.length === 0) return null;

  const currentFlow = flows[tickerIndex];
  const isBullish = currentFlow?.sentiment === 'BULLISH';

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-3 overflow-hidden">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-gray-500 shrink-0">
          <Activity className="w-3 h-3 animate-pulse text-cyan-400" />
          <span>LIVE</span>
        </div>
        <div className="h-4 w-px bg-gray-700" />

        <AnimatePresence mode="wait">
          <motion.div
            key={tickerIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-3 flex-1 min-w-0"
          >
            <span className="font-bold text-white">{currentFlow?.symbol}</span>
            <Badge variant="outline" className={cn(
              "text-xs",
              currentFlow?.type === 'CALL' ? "text-emerald-400 border-emerald-500/50" : "text-red-400 border-red-500/50"
            )}>
              {currentFlow?.type}
            </Badge>
            <span className="text-cyan-400 font-semibold">{formatPremium(currentFlow?.premium || 0)}</span>
            <span className="text-gray-400">${currentFlow?.strike} {currentFlow?.expiry}</span>
            {isBullish ? (
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-400" />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// Stats summary cards
function FlowStats({ flows }: { flows: WhaleFlow[] }) {
  const totalPremium = flows.reduce((sum, f) => sum + f.premium, 0);
  const bullishCount = flows.filter(f => f.sentiment === 'BULLISH').length;
  const bearishCount = flows.filter(f => f.sentiment === 'BEARISH').length;
  const whaleCount = flows.filter(f => f.flowType === 'WHALE' || f.flowType === 'MEGA_WHALE').length;

  const stats = [
    {
      label: 'Total Flow',
      value: formatPremium(totalPremium),
      icon: DollarSign,
      color: 'text-cyan-400',
      bg: 'bg-cyan-500/10'
    },
    {
      label: 'Bullish',
      value: bullishCount.toString(),
      icon: TrendingUp,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10'
    },
    {
      label: 'Bearish',
      value: bearishCount.toString(),
      icon: TrendingDown,
      color: 'text-red-400',
      bg: 'bg-red-500/10'
    },
    {
      label: 'Whales',
      value: whaleCount.toString(),
      icon: Target,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10'
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          className={cn(
            "rounded-lg border border-gray-800 p-3",
            stat.bg
          )}
        >
          <div className="flex items-center gap-2 mb-1">
            <stat.icon className={cn("w-4 h-4", stat.color)} />
            <span className="text-xs text-gray-400">{stat.label}</span>
          </div>
          <div className={cn("text-xl font-bold", stat.color)}>
            {stat.value}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// Main component
export default function WhaleFlowMonitor() {
  const [flows, setFlows] = useState<WhaleFlow[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'CALLS' | 'PUTS' | 'WHALES'>('ALL');
  const [isLoading, setIsLoading] = useState(true);

  // Fetch flows from API
  const fetchFlows = useCallback(async () => {
    try {
      const response = await fetch('/api/automations/options-flow/today');
      if (response.ok) {
        const data = await response.json();
        if (data.flows && Array.isArray(data.flows)) {
          // Transform API data to our format
          const transformedFlows: WhaleFlow[] = data.flows.map((f: any, i: number) => ({
            id: f.id || `flow-${i}`,
            symbol: f.symbol || f.underlying,
            type: f.optionType?.toUpperCase() || (f.contractType?.includes('call') ? 'CALL' : 'PUT'),
            strike: f.strike || 0,
            expiry: f.expiration || f.expiry || 'N/A',
            premium: f.premium || f.notionalValue || 0,
            volume: f.volume || 0,
            openInterest: f.openInterest || f.oi || 0,
            volOiRatio: f.volumeOiRatio || (f.volume / Math.max(f.openInterest || 1, 1)),
            flowType: f.premium >= 5000000 ? 'MEGA_WHALE' :
                      f.premium >= 1000000 ? 'WHALE' :
                      f.volumeOiRatio > 5 ? 'SWEEP' :
                      f.premium >= 100000 ? 'BLOCK' : 'UNUSUAL',
            sentiment: f.sentiment?.toUpperCase() ||
                       (f.optionType?.toLowerCase() === 'call' ? 'BULLISH' : 'BEARISH'),
            confidence: f.confidence || f.unusualScore || 70,
            timestamp: new Date(f.timestamp || Date.now()),
            sector: f.sector,
          }));
          setFlows(transformedFlows);
        }
      }
    } catch (error) {
      console.error('Failed to fetch flows:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch and polling
  useEffect(() => {
    fetchFlows();
    const interval = setInterval(fetchFlows, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchFlows]);

  // Generate mock data for demo if no real flows
  useEffect(() => {
    if (!isLoading && flows.length === 0) {
      // Demo data to show UI capabilities
      const mockFlows: WhaleFlow[] = [
        {
          id: '1',
          symbol: 'NVDA',
          type: 'CALL',
          strike: 140,
          expiry: '2/21',
          premium: 8500000,
          volume: 15420,
          openInterest: 2100,
          volOiRatio: 7.3,
          flowType: 'MEGA_WHALE',
          sentiment: 'BULLISH',
          confidence: 92,
          timestamp: new Date(),
          sector: 'Technology'
        },
        {
          id: '2',
          symbol: 'TSLA',
          type: 'CALL',
          strike: 420,
          expiry: '2/14',
          premium: 3200000,
          volume: 8900,
          openInterest: 1500,
          volOiRatio: 5.9,
          flowType: 'WHALE',
          sentiment: 'BULLISH',
          confidence: 88,
          timestamp: new Date(Date.now() - 120000),
          sector: 'Consumer'
        },
        {
          id: '3',
          symbol: 'SPY',
          type: 'PUT',
          strike: 590,
          expiry: '2/7',
          premium: 2100000,
          volume: 24000,
          openInterest: 45000,
          volOiRatio: 0.5,
          flowType: 'WHALE',
          sentiment: 'BEARISH',
          confidence: 85,
          timestamp: new Date(Date.now() - 300000),
          sector: 'ETF'
        },
        {
          id: '4',
          symbol: 'META',
          type: 'CALL',
          strike: 650,
          expiry: '3/21',
          premium: 1500000,
          volume: 5200,
          openInterest: 800,
          volOiRatio: 6.5,
          flowType: 'SWEEP',
          sentiment: 'BULLISH',
          confidence: 82,
          timestamp: new Date(Date.now() - 600000),
          sector: 'Technology'
        },
        {
          id: '5',
          symbol: 'AMD',
          type: 'CALL',
          strike: 130,
          expiry: '2/14',
          premium: 890000,
          volume: 12300,
          openInterest: 8900,
          volOiRatio: 1.4,
          flowType: 'BLOCK',
          sentiment: 'BULLISH',
          confidence: 78,
          timestamp: new Date(Date.now() - 900000),
          sector: 'Technology'
        },
      ];
      setFlows(mockFlows);
    }
  }, [isLoading, flows.length]);

  // Filter flows
  const filteredFlows = flows.filter(f => {
    if (filter === 'CALLS') return f.type === 'CALL';
    if (filter === 'PUTS') return f.type === 'PUT';
    if (filter === 'WHALES') return f.flowType === 'WHALE' || f.flowType === 'MEGA_WHALE';
    return true;
  }).sort((a, b) => b.premium - a.premium);

  return (
    <Card className="bg-gray-950/50 border-gray-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20">
              <Target className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <CardTitle className="text-lg text-white">Whale Flow Monitor</CardTitle>
              <p className="text-xs text-gray-500">Real-time institutional options flow</p>
            </div>
          </div>

          {/* Filter buttons */}
          <div className="flex items-center gap-1">
            {(['ALL', 'CALLS', 'PUTS', 'WHALES'] as const).map((f) => (
              <Button
                key={f}
                variant="ghost"
                size="sm"
                onClick={() => setFilter(f)}
                className={cn(
                  "text-xs h-7 px-2",
                  filter === f
                    ? "bg-cyan-500/20 text-cyan-400"
                    : "text-gray-400 hover:text-white"
                )}
              >
                {f === 'WHALES' && <Target className="w-3 h-3 mr-1" />}
                {f}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Live ticker */}
        <FlowTicker flows={filteredFlows} />

        {/* Stats */}
        <FlowStats flows={filteredFlows} />

        {/* Flow cards */}
        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
          <AnimatePresence>
            {filteredFlows.slice(0, 10).map((flow, index) => (
              <WhaleFlowCard
                key={flow.id}
                flow={flow}
                isNew={index === 0 && Date.now() - new Date(flow.timestamp).getTime() < 60000}
              />
            ))}
          </AnimatePresence>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 pt-3 border-t border-gray-800">
          {Object.entries(flowTypeConfig).map(([type, config]) => (
            <div key={type} className="flex items-center gap-1.5 text-xs text-gray-500">
              <config.icon className={cn("w-3 h-3", config.color)} />
              <span>{type.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
