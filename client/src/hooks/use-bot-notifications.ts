import { useState, useEffect, useCallback, useRef } from 'react';

export type BotEventType = 'looking' | 'entry' | 'exit' | 'skip' | 'error' | 'connected';

export interface BotNotification {
  type: 'bot_event';
  eventType: BotEventType;
  symbol: string;
  optionType?: 'call' | 'put';
  strike?: number;
  expiry?: string;
  price?: number;
  quantity?: number;
  confidence?: number;
  reason?: string;
  portfolio?: 'options' | 'small_account';
  pnl?: number;
  timestamp: string;
  id?: string;
}

interface UseBotNotificationsOptions {
  maxNotifications?: number;
  autoConnect?: boolean;
}

export function useBotNotifications(options: UseBotNotificationsOptions = {}) {
  const { maxNotifications = 10, autoConnect = true } = options;
  
  const [notifications, setNotifications] = useState<BotNotification[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/bot`;
    
    try {
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        setIsConnected(true);
        setConnectionError(null);
        console.log('[BOT-WS] Connected to bot notifications');
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as BotNotification;
          if (data.type === 'bot_event') {
            const notification = {
              ...data,
              id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
            };
            
            setNotifications(prev => {
              const updated = [notification, ...prev];
              return updated.slice(0, maxNotifications);
            });
          }
        } catch (err) {
          console.error('[BOT-WS] Failed to parse message:', err);
        }
      };
      
      wsRef.current.onclose = () => {
        setIsConnected(false);
        console.log('[BOT-WS] Disconnected');
        
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 5000);
      };
      
      wsRef.current.onerror = (error) => {
        setConnectionError('Connection failed');
        console.error('[BOT-WS] WebSocket error:', error);
      };
    } catch (err) {
      setConnectionError('Failed to connect');
      console.error('[BOT-WS] Failed to create WebSocket:', err);
    }
  }, [maxNotifications]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    
    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    notifications,
    isConnected,
    connectionError,
    connect,
    disconnect,
    clearNotifications,
    dismissNotification
  };
}
