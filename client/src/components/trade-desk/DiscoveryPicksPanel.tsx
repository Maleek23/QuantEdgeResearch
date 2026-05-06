/**
 * DiscoveryPicksPanel — surfaces quant_signal sourced trade ideas
 *
 * Bridges the gap: Discovery engine pushes ideas into tradeIdeas table
 * with source='quant_signal'. This panel pulls them and renders them
 * as SignalCards on the Trade Desk page.
 *
 * Inspired by MomoEdge's left rail showing active signals.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SignalCard } from '@/components/signal-card';
import type { SignalData } from '@/components/signal-card';

interface RawIdea {
  id: string;
  symbol: string;
  direction: string;
  assetType: string;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  catalyst: string;
  analysis: string;
  timestamp: string;
  expiryDate?: string;
  strikePrice?: number;
  optionType?: string;
  confidenceScore?: number;
  riskRewardRatio?: number;
  source?: string;
  status?: string;
}

interface Props {
  size?: 'mini' | 'standard' | 'full';
  maxItems?: number;
  sourceFilter?: string;       // 'quant_signal' to show only Discovery picks
}

export function DiscoveryPicksPanel({ size = 'standard', maxItems = 10, sourceFilter = 'quant_signal' }: Props) {
  const [selectedSize, setSelectedSize] = useState(size);

  const { data, isLoading } = useQuery<{ ideas: RawIdea[] }>({
    queryKey: ['discovery-picks', sourceFilter],
    queryFn: async () => {
      const res = await fetch(`/api/trade-ideas?source=${sourceFilter}&limit=${maxItems}`);
      if (!res.ok) {
        // Fallback: trigger a Discovery push
        await fetch('/api/discovery/push-to-trade-desk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ minScore: 70, maxIdeas: maxItems })
        });
        const r2 = await fetch(`/api/trade-ideas?source=${sourceFilter}&limit=${maxItems}`);
        return r2.json();
      }
      return res.json();
    },
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 min
    staleTime: 60 * 1000,
  });

  // Transform raw ideas → SignalData
  const signals: SignalData[] = (data?.ideas || []).map(translateToSignal);

  return (
    <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            🎯 Discovery Picks
            <span className="text-xs px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/30 rounded text-cyan-400">
              {signals.length} active
            </span>
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Auto-pushed from convergence engine (score ≥ 70)
          </p>
        </div>
        <div className="flex gap-1">
          {(['mini', 'standard', 'full'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSelectedSize(s)}
              className={`text-[10px] px-2 py-1 rounded ${
                selectedSize === s ? 'bg-cyan-500/20 text-cyan-400' : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-zinc-500 italic">Loading Discovery picks...</div>
      ) : signals.length === 0 ? (
        <div className="text-center py-8 text-zinc-500">
          <p className="text-sm">No Discovery picks yet.</p>
          <button
            onClick={async () => {
              await fetch('/api/discovery/push-to-trade-desk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ minScore: 70, maxIdeas: 8 })
              });
              window.location.reload();
            }}
            className="mt-3 text-xs px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded text-emerald-400 hover:bg-emerald-500/20"
          >
            🎯 Run Discovery Now
          </button>
        </div>
      ) : (
        <div className={`grid gap-3 ${
          selectedSize === 'mini' ? 'grid-cols-2 lg:grid-cols-3' :
          selectedSize === 'full' ? 'grid-cols-1' :
          'grid-cols-1 lg:grid-cols-2'
        }`}>
          {signals.map((signal) => (
            <SignalCard
              key={signal.id}
              signal={signal}
              size={selectedSize}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Raw trade idea → SignalData shape
// ═══════════════════════════════════════════════════════════════
function translateToSignal(idea: RawIdea): SignalData {
  const direction =
    idea.direction === 'long' ? 'BULL' :
    idea.direction === 'short' ? 'BEAR' :
    'NEUTRAL';

  const issued = new Date(idea.timestamp);
  const daysActive = Math.max(1, Math.floor((Date.now() - issued.getTime()) / 86400000));
  const totalMove = Math.abs(idea.targetPrice - idea.entryPrice);

  // We don't have live spot in this payload — would need to merge with /api/quote/:symbol
  // For now estimate based on entry as placeholder; will be replaced when wired
  const spot = idea.entryPrice; // TODO: merge with live quote
  const pnlPct = ((spot - idea.entryPrice) / idea.entryPrice) * 100;
  const pnlAbs = spot - idea.entryPrice;

  // Determine status
  let status: SignalData['status'] = 'TRIGGER_PENDING';
  if (idea.status === 't1_hit') status = 'T1_HIT';
  else if (idea.status === 't2_hit') status = 'T2_HIT';
  else if (idea.status === 'stopped') status = 'STOPPED';
  else if (Math.abs(pnlPct) > 0.5) status = 'TRIGGER_CONFIRMED';

  return {
    id: idea.id,
    symbol: idea.symbol,
    direction,
    spot,
    spotChangeToday: 0,  // TODO: live merge
    confidence: idea.confidenceScore || 70,
    confidenceDelta: 0,
    holdPeriodLabel: idea.assetType === 'option' ? 'OPTION' : 'SWING',
    entry: idea.entryPrice,
    t1: idea.targetPrice,
    stop: idea.stopLoss,
    pnlPct,
    pnlAbs,
    daysActive,
    status,
    issuedAt: idea.timestamp,
    targetDate: idea.expiryDate,
    trigger: { confirmed: status !== 'TRIGGER_PENDING', price: idea.entryPrice },
    geometry: {
      stopRMultiple: Math.abs(spot - idea.stopLoss) / Math.max(0.01, Math.abs(idea.entryPrice - idea.stopLoss)),
      horizonUsedPct: idea.expiryDate
        ? Math.min(100, (daysActive / Math.max(1, Math.floor((new Date(idea.expiryDate).getTime() - issued.getTime()) / 86400000))) * 100)
        : Math.min(100, daysActive * 2)
    },
    oracleOption: idea.assetType === 'option' && idea.strikePrice && idea.expiryDate ? {
      strike: idea.strikePrice,
      expiry: idea.expiryDate,
      optionType: (idea.optionType as 'call' | 'put') || 'call',
      premiumAtIssue: idea.entryPrice,
      premiumNow: spot,
      pctChange: pnlPct
    } : undefined,
    source: idea.source || 'unknown'
  };
}
