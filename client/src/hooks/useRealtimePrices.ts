import { useState, useEffect, useCallback, useRef } from 'react';

interface PriceData {
  price: number;
  source: 'coinbase' | 'yahoo';
  timestamp: string;
  previousPrice?: number;
}

interface PriceMessage {
  type: 'price';
  symbol: string;
  price: number;
  source: 'coinbase' | 'yahoo';
  timestamp: string;
}

interface UseRealtimePricesReturn {
  prices: Map<string, PriceData>;
  isConnected: boolean;
  getPrice: (symbol: string) => PriceData | undefined;
}

export function useRealtimePrices(): UseRealtimePricesReturn {
  const [prices, setPrices] = useState<Map<string, PriceData>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/prices`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (mountedRef.current) {
          setIsConnected(true);
        }
      };

      ws.onmessage = (event) => {
        try {
          const message: PriceMessage = JSON.parse(event.data);
          
          if (message.type === 'price' && mountedRef.current) {
            setPrices(prev => {
              const newPrices = new Map(prev);
              const existing = newPrices.get(message.symbol);
              newPrices.set(message.symbol, {
                price: message.price,
                source: message.source,
                timestamp: message.timestamp,
                previousPrice: existing?.price
              });
              return newPrices;
            });
          }
        } catch (e) {
          console.error('[WS] Failed to parse message:', e);
        }
      };

      ws.onclose = () => {
        if (mountedRef.current) {
          setIsConnected(false);
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              connect();
            }
          }, 3000);
        }
      };

      ws.onerror = (error) => {
        console.error('[WS] Error:', error);
        ws.close();
      };
    } catch (error) {
      console.error('[WS] Failed to connect:', error);
      reconnectTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) {
          connect();
        }
      }, 3000);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  const getPrice = useCallback((symbol: string): PriceData | undefined => {
    return prices.get(symbol.toUpperCase());
  }, [prices]);

  return { prices, isConnected, getPrice };
}
