/**
 * DiscoveryPicksPanel — surfaces quant_signal sourced trade ideas
 *
 * Bridges the gap: Discovery engine pushes ideas into tradeIdeas table
 * with source='quant_signal'. This panel pulls them and renders them
 * as SignalCards on the Trade Desk page.
 *
 * Inspired by MomoEdge's left rail showing active signals.
 *
 * Phase 4: data fetching extracted to useDiscoveryPicks so the Today's
 * Picks "All" tab can merge the same ideas without a second network call
 * (same query key → shared React Query cache). A `bare` prop renders the
 * panel without its outer card for embedding in tabs, and `assetFilter`
 * applies the page-level filter before rendering.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SignalCard } from '@/components/signal-card';
import type { SignalCardData } from '@/components/signal-card';
import { queryClient } from '@/lib/queryClient';
import {
  matchesAssetFilter,
  type PageAssetFilter,
} from '@/lib/trade-desk-filters';

export interface RawIdea {
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

/** Shared fetch for Discovery picks — same query key wherever it's used,
 *  so panels and the Today's Picks "All" tab share one cached result. */
export function useDiscoveryPicks(sourceFilter = 'quant_signal', maxItems = 10) {
  return useQuery<{ ideas: RawIdea[] }>({
    queryKey: ['discovery-picks', sourceFilter, maxItems],
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
}

interface Props {
  size?: 'mini' | 'standard' | 'full';
  maxItems?: number;
  sourceFilter?: string;       // 'quant_signal' to show only Discovery picks
  /** Render without the outer card — for embedding in Today's Picks tabs. */
  bare?: boolean;
  /** Page-level asset filter, applied to raw ideas before rendering. */
  assetFilter?: PageAssetFilter;
  watchlistSymbols?: Set<string>;
}

export function DiscoveryPicksPanel({
  size = 'standard',
  maxItems = 10,
  sourceFilter = 'quant_signal',
  bare = false,
  assetFilter = 'all',
  watchlistSymbols,
}: Props) {
  const [selectedSize, setSelectedSize] = useState(size);

  const { data, isLoading } = useDiscoveryPicks(sourceFilter, maxItems);

  // Page-level asset filter applies before the SignalData translation.
  const rawIdeas = (data?.ideas || []).filter((idea) =>
    matchesAssetFilter(idea, assetFilter, watchlistSymbols),
  );

  // Transform raw ideas → SignalData
  const signals = rawIdeas.map((idea) => ({ id: idea.id, data: translateToSignal(idea) }));

  const sizeToggle = (
    <div className="flex gap-1">
      {(['mini', 'standard', 'full'] as const).map((s) => (
        <button
          key={s}
          onClick={() => setSelectedSize(s)}
          className={`text-[10px] px-2 py-1 rounded ${
            selectedSize === s ? 'bg-sky-500/20 text-sky-400' : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  );

  const runDiscoveryNow = async () => {
    await fetch('/api/discovery/push-to-trade-desk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minScore: 70, maxIdeas: 8 })
    });
    // Phase 4: invalidate instead of a full page reload.
    queryClient.invalidateQueries({ queryKey: ['discovery-picks'] });
  };

  const body = isLoading ? (
    <div className="text-sm text-zinc-500 italic">Loading Discovery picks...</div>
  ) : signals.length === 0 ? (
    <div className="text-center py-8 text-zinc-500">
      <p className="text-sm">No Discovery picks yet.</p>
      <button
        onClick={runDiscoveryNow}
        className="mt-3 text-xs px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded text-[var(--trade-bullish)] hover:bg-emerald-500/20"
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
          d={signal.data}
        />
      ))}
    </div>
  );

  if (bare) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">
            Auto-pushed from convergence engine (score ≥ 70) · {signals.length} active
          </p>
          {sizeToggle}
        </div>
        {body}
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            🎯 Discovery Picks
            <span className="text-xs px-2 py-0.5 bg-sky-500/10 border border-sky-500/30 rounded text-sky-400">
              {signals.length} active
            </span>
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Auto-pushed from convergence engine (score ≥ 70)
          </p>
        </div>
        {sizeToggle}
      </div>

      {body}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Raw trade idea → SignalData shape
// ═══════════════════════════════════════════════════════════════
function translateToSignal(idea: RawIdea): SignalCardData {
  return {
    symbol: idea.symbol,
    direction: idea.direction === 'short' ? 'short' : 'long',
    confidence: idea.confidenceScore || 70,
    entry: idea.entryPrice,
    target: idea.targetPrice,
    stop: idea.stopLoss,
    riskReward: idea.riskRewardRatio,
    horizon: idea.assetType === 'option' ? 'OPTION' : 'SWING',
    setup: idea.catalyst || idea.analysis,
    status: idea.status || 'PENDING',
    optionType: idea.optionType,
    strike: idea.strikePrice,
  };
}
