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
import { QEEmpty, QEError, QELoading } from '@/components/ui/qe-states';
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
        // A failed retry must surface as an error, not parse an error body
        // into `{ ideas: undefined }` and read as "no picks" (SR 11-7 T3).
        if (!r2.ok) throw new Error(`trade-ideas ${r2.status}`);
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

  const { data, isLoading, isError, isFetching, refetch } = useDiscoveryPicks(sourceFilter, maxItems);

  // Page-level asset filter applies before the card translation.
  const rawIdeas = (data?.ideas || []).filter((idea) =>
    matchesAssetFilter(idea, assetFilter, watchlistSymbols),
  );

  // Transform raw ideas → SignalCard shape (+ explicitly-unknown live fields)
  const signals: DiscoveryPick[] = rawIdeas.map(translateToSignal);

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

  const errorCard = isError ? (
    <QEError
      title="Discovery picks API didn't respond"
      message={
        data
          ? 'Showing the last picks that loaded — they may be stale.'
          : "Discovery picks couldn't be loaded. This is a connection failure, not an empty queue — picks may exist."
      }
      onRetry={() => void refetch()}
      retrying={isFetching}
      className="mb-3"
    />
  ) : null;

  const body = isLoading ? (
    <QELoading rows={3} label="Loading Discovery picks…" />
  ) : isError && !data ? (
    errorCard
  ) : (
    <>
      {errorCard}
      {signals.length === 0 ? (
        <QEEmpty
          message="No Discovery picks yet — the convergence engine hasn't pushed any ideas scoring ≥ 70."
          action={
            <button
              onClick={runDiscoveryNow}
              className="text-xs px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded text-[var(--trade-bullish)] hover:bg-emerald-500/20"
            >
              🎯 Run Discovery Now
            </button>
          }
        />
      ) : (
        <div className={`grid gap-3 ${
          selectedSize === 'mini' ? 'grid-cols-2 lg:grid-cols-3' :
          selectedSize === 'full' ? 'grid-cols-1' :
          'grid-cols-1 lg:grid-cols-2'
        }`}>
          {signals.map((pick) => (
            <div key={pick.id} className="flex flex-col gap-1">
              <SignalCard d={pick.card} />
              {/* F5.2: no live quote is merged into this payload yet, so live
                  P&L and today's move are unknown — rendered as "—", never 0. */}
              <div
                className="flex gap-3 px-1 font-mono text-[10px] text-zinc-500 tabular-nums"
                title="No live quote merged into Discovery picks — live P&L and today's move are unknown"
              >
                <span>P&amp;L {fmtPct(pick.pnlPct)}</span>
                <span>TODAY {fmtPct(pick.spotChangeToday)}</span>
                <span>{pick.daysActive}d active</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
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
// HELPER: Raw trade idea → SignalCard shape
// ═══════════════════════════════════════════════════════════════

/** A Discovery pick as rendered: the card data plus the live fields this
 *  payload does NOT carry. `null` means unknown — there is no live quote
 *  merged in yet, so these must render "—", never a fabricated 0. */
export interface DiscoveryPick {
  id: string;
  card: SignalCardData;
  pnlPct: number | null;
  pnlAbs: number | null;
  spotChangeToday: number | null;
  daysActive: number;
}

function fmtPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

const STATUS_LABEL: Record<string, string> = {
  t1_hit: 'T1 HIT',
  t2_hit: 'T2 HIT',
  stopped: 'STOPPED',
};

function translateToSignal(idea: RawIdea): DiscoveryPick {
  const issued = new Date(idea.timestamp);
  const daysActive = Math.max(1, Math.floor((Date.now() - issued.getTime()) / 86400000));
  const isOption = idea.assetType === 'option';

  const card: SignalCardData = {
    symbol: idea.symbol,
    direction: idea.direction === 'short' ? 'short' : 'long',
    // No live quote in this payload — leave price unset rather than echo entry.
    price: undefined,
    confidence: typeof idea.confidenceScore === 'number' ? Math.round(idea.confidenceScore) : undefined,
    entry: idea.entryPrice,
    target: idea.targetPrice,
    stop: idea.stopLoss,
    riskReward: typeof idea.riskRewardRatio === 'number' ? idea.riskRewardRatio : undefined,
    horizon: isOption ? (idea.expiryDate ? `OPTION · exp ${idea.expiryDate}` : 'OPTION') : 'SWING',
    setup: idea.catalyst ? String(idea.catalyst).slice(0, 64) : undefined,
    status: (idea.status && STATUS_LABEL[idea.status]) || (idea.status ? idea.status.toUpperCase() : undefined),
    optionType: isOption ? idea.optionType ?? null : null,
    strike: isOption ? idea.strikePrice ?? null : null,
  };

  return {
    id: idea.id,
    card,
    pnlPct: null,          // unknown until a live quote is merged
    pnlAbs: null,
    spotChangeToday: null,
    daysActive,
  };
}
