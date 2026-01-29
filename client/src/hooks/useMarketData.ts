/**
 * Shared Market Data Hooks
 *
 * These hooks centralize common API queries used across multiple pages.
 * Benefits:
 * - Consistent caching/refetch behavior
 * - Single source of truth for data types
 * - Reduces code duplication
 * - Easy to modify behavior globally
 */

import { useQuery, UseQueryOptions } from "@tanstack/react-query";

// ======================
// TYPE DEFINITIONS
// ======================

export interface Mover {
  symbol: string;
  name?: string;
  price: number;
  percentChange: number;
  changePercent?: number;
  change?: number;
  volume?: number;
}

export interface MarketMoversData {
  topGainers: Mover[];
  topLosers: Mover[];
  gainers?: Mover[];
  losers?: Mover[];
  active?: Mover[];
}

export interface NewsItem {
  id: string;
  title: string;
  summary?: string;
  description?: string;
  url: string;
  source: string;
  publishedAt: string;
  symbol?: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
  image?: string;
}

export interface EarningsEvent {
  symbol: string;
  name?: string;
  companyName?: string;
  date: string;
  time?: string;
  timing?: 'before' | 'after' | 'during';
  eps?: number;
  epsEstimate?: number;
  revenue?: number;
  revenueEstimate?: number;
}

export interface BreakoutStock {
  symbol: string;
  name?: string;
  price: number;
  percentChange: number;
  breakoutType?: string;
  volume?: number;
  avgVolume?: number;
  score?: number;
}

// ======================
// HOOKS
// ======================

/**
 * useMarketMovers - Top gainers and losers
 * Used by: home, landing, trade-desk, market, smart-money, discover
 */
export function useMarketMovers(options?: Partial<UseQueryOptions<MarketMoversData>>) {
  return useQuery<MarketMoversData>({
    queryKey: ["/api/market-movers"],
    staleTime: 30 * 1000, // Fresh for 30 seconds
    gcTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchInterval: 60 * 1000, // Refetch every minute
    ...options,
  });
}

/**
 * useNewsFeed - Market news with optional symbol filter
 * Used by: home, landing, discover, stock-detail
 */
export function useNewsFeed(params?: { symbol?: string; limit?: number }, options?: Partial<UseQueryOptions<NewsItem[]>>) {
  const queryParams = new URLSearchParams();
  if (params?.symbol) queryParams.set('symbol', params.symbol);
  if (params?.limit) queryParams.set('limit', params.limit.toString());

  const queryString = queryParams.toString();
  const endpoint = queryString ? `/api/news?${queryString}` : '/api/news';

  return useQuery<NewsItem[]>({
    queryKey: ["/api/news", params],
    queryFn: async () => {
      const res = await fetch(endpoint);
      if (!res.ok) return [];
      const data = await res.json();
      return data.articles || data || [];
    },
    staleTime: 60 * 1000, // Fresh for 1 minute
    gcTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchInterval: 2 * 60 * 1000, // Refetch every 2 minutes
    ...options,
  });
}

/**
 * useEarningsCalendar - Upcoming earnings events
 * Used by: home, landing, discover, market-scanner
 */
export function useEarningsCalendar(params?: { days?: number; limit?: number }, options?: Partial<UseQueryOptions<EarningsEvent[]>>) {
  const days = params?.days || 7;
  const limit = params?.limit || 10;

  return useQuery<EarningsEvent[]>({
    queryKey: ["/api/earnings/upcoming", { days, limit }],
    queryFn: async () => {
      const res = await fetch(`/api/earnings/upcoming?days=${days}&limit=${limit}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.earnings || data || [];
    },
    staleTime: 5 * 60 * 1000, // Fresh for 5 minutes
    gcTime: 15 * 60 * 1000, // Cache for 15 minutes
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    ...options,
  });
}

/**
 * useBreakouts - Stocks breaking out of patterns
 * Used by: trade-desk, market-scanner, bullish-trends
 */
export function useBreakouts(options?: Partial<UseQueryOptions<BreakoutStock[]>>) {
  return useQuery<BreakoutStock[]>({
    queryKey: ["/api/breakout/scan-stocks"],
    queryFn: async () => {
      const res = await fetch('/api/breakout/scan-stocks');
      if (!res.ok) return [];
      const data = await res.json();
      return data.breakouts || data.stocks || data || [];
    },
    staleTime: 60 * 1000, // Fresh for 1 minute
    gcTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchInterval: 2 * 60 * 1000, // Refetch every 2 minutes
    ...options,
  });
}

/**
 * useBestTradeIdeas - Top AI-generated trade setups
 * Used by: home, landing, trade-desk
 */
export function useBestTradeIdeas(params?: { limit?: number }, options?: Partial<UseQueryOptions<any[]>>) {
  const limit = params?.limit || 5;

  return useQuery<any[]>({
    queryKey: ["/api/trade-ideas/best-setups", { limit }],
    queryFn: async () => {
      const res = await fetch(`/api/trade-ideas/best-setups?limit=${limit}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.ideas || data || [];
    },
    staleTime: 30 * 1000, // Fresh for 30 seconds
    gcTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchInterval: 60 * 1000, // Refetch every minute
    ...options,
  });
}

/**
 * useMarketTicker - Real-time quotes for major indices
 * Used by: home, landing, market
 */
export function useMarketTicker(symbols?: string[], options?: Partial<UseQueryOptions<Record<string, any>>>) {
  const defaultSymbols = ['SPY', 'QQQ', 'DIA', 'IWM', 'VIX', 'BTC-USD', 'ETH-USD'];
  const tickerSymbols = symbols || defaultSymbols;

  return useQuery<Record<string, any>>({
    queryKey: ["/api/market-data/batch", tickerSymbols],
    queryFn: async () => {
      const res = await fetch(`/api/market-data/batch/${tickerSymbols.join(',')}`);
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 10 * 1000, // Fresh for 10 seconds
    gcTime: 60 * 1000, // Cache for 1 minute
    refetchInterval: 15 * 1000, // Refetch every 15 seconds
    ...options,
  });
}
