/**
 * Realtime prices — compatibility shim over the live price bus.
 *
 * This provider used to open its own /ws/prices socket for every page and copy
 * a whole Map into React state on EVERY tick (Coinbase prints dozens a second),
 * re-rendering the provider continuously while nothing in the app read it.
 * The single socket now lives in @/lib/live-price-bus and is opened only while
 * something subscribes (a live chart). The provider stays so the tree shape and
 * the useRealtimePrices() API keep working; it no longer does any work itself.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { getLastLiveTick, subscribeLiveStatus } from '@/lib/live-price-bus';

interface PriceData {
  price: number;
  source: string;
  timestamp: string;
  previousPrice?: number;
}

interface RealtimePricesContextValue {
  prices: Map<string, PriceData>;
  isConnected: boolean;
  getPrice: (symbol: string) => PriceData | undefined;
}

export function RealtimePricesProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useRealtimePrices(): RealtimePricesContextValue {
  const [isConnected, setConnected] = useState(false);
  useEffect(() => subscribeLiveStatus(setConnected), []);
  const getPrice = useCallback((symbol: string): PriceData | undefined => {
    const t = getLastLiveTick(symbol);
    return t ? { price: t.price, source: t.source, timestamp: new Date(t.ts).toISOString() } : undefined;
  }, []);
  return { prices: new Map(), isConnected, getPrice };
}
