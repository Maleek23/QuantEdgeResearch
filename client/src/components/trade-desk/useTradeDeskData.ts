/**
 * Trade Desk Data Hook
 * ====================
 * Single hook returning all data needed by the Trade Desk.
 * Consolidates queries, filtering, deduplication.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { TradeIdea } from "@shared/schema";
import { classifyTimeframe, type Timeframe, ALL_WATCHLIST_SYMBOLS } from "./constants";

interface TradeDeskFilters {
  timeframe: Timeframe;
  selectedSymbol: string | null;
  maxContractCost: number;
}

export interface WatchlistItem {
  symbol: string;
  currentPrice?: number;
  priceChange?: number;
  priceChangePercent?: number;
  category?: string;
  notes?: string;
}

export interface PerformanceData {
  winRate: number;
  profitFactor: number;
  totalTrades: number;
  wins: number;
  losses: number;
  avgWinPct: number;
  avgLossPct: number;
}

export function useTradeDeskData(filters: TradeDeskFilters) {
  // Weekend detection — show 'week' data on weekends
  const isWeekend = useMemo(() => {
    const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    return et.getDay() === 0 || et.getDay() === 6;
  }, []);

  const dateRange = isWeekend ? 'week' : 'today';

  // Fetch trade ideas
  const { data: rawIdeas = [], isLoading: ideasLoading, refetch: refetchIdeas } = useQuery<TradeIdea[]>({
    queryKey: ['/api/trade-ideas/best-setups', dateRange],
    queryFn: async () => {
      const res = await fetch(
        `/api/trade-ideas/best-setups?period=daily&limit=500&status=all&date=${dateRange}&_t=${Date.now()}`
      );
      if (!res.ok) return [];
      const data = await res.json();
      return data.setups || [];
    },
    staleTime: 0,
    refetchInterval: 30_000,
  });

  // Fetch watchlist
  const { data: watchlistRaw = [] } = useQuery<WatchlistItem[]>({
    queryKey: ['/api/watchlist'],
    queryFn: async () => {
      const res = await fetch('/api/watchlist', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  // Fetch closed trades for performance
  const { data: allIdeasForPerf = [] } = useQuery<TradeIdea[]>({
    queryKey: ['/api/trade-ideas/best-setups', 'perf-30d'],
    queryFn: async () => {
      const res = await fetch(
        `/api/trade-ideas/best-setups?period=daily&limit=2000&status=all&date=all&_t=${Date.now()}`
      );
      if (!res.ok) return [];
      const data = await res.json();
      return data.setups || [];
    },
    staleTime: 300_000, // 5 min
  });

  // Deduplicate ideas (keep best per symbol+assetType+optionType)
  const ideas = useMemo(() => {
    const groups = new Map<string, TradeIdea[]>();
    for (const idea of rawIdeas) {
      if (!idea.timestamp) continue;
      const key = `${idea.symbol}:${idea.assetType || 'stock'}:${(idea as any).optionType || ''}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(idea);
    }
    const result: TradeIdea[] = [];
    for (const group of groups.values()) {
      group.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
      result.push(group[0]);
    }
    return result.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
  }, [rawIdeas]);

  // Apply filters
  const filteredIdeas = useMemo(() => {
    let filtered = ideas;

    // Timeframe filter
    if (filters.timeframe !== 'all') {
      filtered = filtered.filter(i => classifyTimeframe(i as any) === filters.timeframe);
    }

    // Symbol filter (from sidebar click)
    if (filters.selectedSymbol) {
      filtered = filtered.filter(i => i.symbol === filters.selectedSymbol);
    }

    // Max contract cost filter
    if (filters.maxContractCost < 10000) {
      filtered = filtered.filter(i => {
        if (i.assetType !== 'option') return true;
        const cost = (i.entryPrice || 0) * 100;
        return cost <= filters.maxContractCost;
      });
    }

    return filtered;
  }, [ideas, filters]);

  // Count by timeframe for tab badges
  const ideaCounts = useMemo(() => {
    const counts = { '0dte': 0, weekly: 0, swing: 0, all: ideas.length };
    for (const idea of ideas) {
      const tf = classifyTimeframe(idea as any);
      if (tf in counts) counts[tf as keyof typeof counts]++;
    }
    return counts;
  }, [ideas]);

  // Performance data (last 30 days)
  const performance = useMemo((): PerformanceData => {
    const thirtyDaysAgo = Date.now() - 30 * 86400000;
    const resolved = allIdeasForPerf.filter(i => {
      if (!i.timestamp || new Date(i.timestamp).getTime() < thirtyDaysAgo) return false;
      const status = (i as any).outcomeStatus;
      return status === 'hit_target' || status === 'hit_stop';
    });

    const wins = resolved.filter(i => (i as any).outcomeStatus === 'hit_target');
    const losses = resolved.filter(i => (i as any).outcomeStatus === 'hit_stop');

    const avgWin = wins.length > 0
      ? wins.reduce((s, i) => s + ((i as any).percentGain || 0), 0) / wins.length
      : 0;
    const avgLoss = losses.length > 0
      ? losses.reduce((s, i) => s + ((i as any).percentGain || 0), 0) / losses.length
      : 0;

    const decided = wins.length + losses.length;
    const winRate = decided > 0 ? (wins.length / decided) * 100 : 0;
    const profitFactor = avgLoss !== 0
      ? Math.abs((avgWin * wins.length) / (avgLoss * losses.length))
      : wins.length > 0 ? 999 : 0;

    return {
      winRate: +winRate.toFixed(1),
      profitFactor: +profitFactor.toFixed(2),
      totalTrades: decided,
      wins: wins.length,
      losses: losses.length,
      avgWinPct: +avgWin.toFixed(1),
      avgLossPct: +avgLoss.toFixed(1),
    };
  }, [allIdeasForPerf]);

  // Recent closed trades
  const closedTrades = useMemo(() => {
    return allIdeasForPerf
      .filter(i => {
        const s = (i as any).outcomeStatus;
        return s === 'hit_target' || s === 'hit_stop' || s === 'expired';
      })
      .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
      .slice(0, 10);
  }, [allIdeasForPerf]);

  // Watchlist grouped by tier
  const watchlist = useMemo(() => {
    return watchlistRaw.sort((a, b) => {
      const aInWl = ALL_WATCHLIST_SYMBOLS.indexOf(a.symbol);
      const bInWl = ALL_WATCHLIST_SYMBOLS.indexOf(b.symbol);
      if (aInWl === -1 && bInWl === -1) return 0;
      if (aInWl === -1) return 1;
      if (bInWl === -1) return -1;
      return aInWl - bInWl;
    });
  }, [watchlistRaw]);

  return {
    ideas: filteredIdeas,
    allIdeas: ideas,
    watchlist,
    performance,
    closedTrades,
    ideaCounts,
    isLoading: ideasLoading,
    refetch: refetchIdeas,
    isWeekend,
    dateRange,
  };
}
