import WebSocket, { WebSocketServer } from 'ws';
import { logger } from './logger';
import type { Server } from 'http';

interface PriceUpdate {
  symbol: string;
  price: number;
  timestamp: Date;
  source: 'coinbase' | 'databento' | 'yahoo';
}

interface PriceCache {
  price: number;
  timestamp: Date;
  source: string;
}

interface BroadcastMessage {
  type: 'price';
  symbol: string;
  price: number;
  source: 'coinbase' | 'yahoo';
  timestamp: string;
}

const cryptoPrices = new Map<string, PriceCache>();
const futuresPrices = new Map<string, PriceCache>();

let coinbaseWs: WebSocket | null = null;
let coinbaseReconnectTimer: NodeJS.Timeout | null = null;

let wss: WebSocketServer | null = null;

const COINBASE_WS_URL = 'wss://ws-feed.exchange.coinbase.com';

function broadcastPrice(symbol: string, price: number, source: 'coinbase' | 'yahoo'): void {
  if (!wss) return;
  
  const message: BroadcastMessage = {
    type: 'price',
    symbol,
    price,
    source,
    timestamp: new Date().toISOString()
  };
  
  const payload = JSON.stringify(message);
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

const COINBASE_SYMBOLS = [
  'BTC-USD', 'ETH-USD', 'SOL-USD', 'DOGE-USD', 'XRP-USD',
  'ADA-USD', 'AVAX-USD', 'DOT-USD', 'LINK-USD', 'MATIC-USD',
  'ATOM-USD', 'LTC-USD', 'UNI-USD', 'NEAR-USD', 'APT-USD',
  'SUI-USD', 'PEPE-USD', 'SHIB-USD', 'ARB-USD', 'OP-USD',
  'RNDR-USD', 'POL-USD', 'BONK-USD'  // Additional coins for crypto bot
];

export function initializeCoinbaseWebSocket(): void {
  if (coinbaseWs?.readyState === WebSocket.OPEN) {
    logger.info('[REALTIME] Coinbase WebSocket already connected');
    return;
  }

  logger.info('[REALTIME] Connecting to Coinbase WebSocket...');

  try {
    coinbaseWs = new WebSocket(COINBASE_WS_URL);

    coinbaseWs.on('open', () => {
      logger.info('[REALTIME] Coinbase WebSocket connected');
      
      const subscribeMsg = {
        type: 'subscribe',
        channels: [
          {
            name: 'ticker',
            product_ids: COINBASE_SYMBOLS
          }
        ]
      };
      
      coinbaseWs?.send(JSON.stringify(subscribeMsg));
      logger.info(`[REALTIME] Subscribed to ${COINBASE_SYMBOLS.length} crypto pairs`);
    });

    coinbaseWs.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'ticker' && message.price) {
          const symbol = message.product_id.replace('-USD', '');
          const price = parseFloat(message.price);
          
          cryptoPrices.set(symbol, {
            price,
            timestamp: new Date(),
            source: 'coinbase'
          });
          
          broadcastPrice(symbol, price, 'coinbase');
          logger.debug(`[REALTIME] ${symbol}: $${price}`);
        }
      } catch (error) {
        logger.error('[REALTIME] Error parsing Coinbase message:', error);
      }
    });

    coinbaseWs.on('error', (error) => {
      logger.error('[REALTIME] Coinbase WebSocket error:', error);
    });

    coinbaseWs.on('close', (code, reason) => {
      logger.warn(`[REALTIME] Coinbase WebSocket closed: ${code} - ${reason}`);
      coinbaseWs = null;
      
      if (coinbaseReconnectTimer) {
        clearTimeout(coinbaseReconnectTimer);
      }
      coinbaseReconnectTimer = setTimeout(() => {
        logger.info('[REALTIME] Reconnecting to Coinbase...');
        initializeCoinbaseWebSocket();
      }, 5000);
    });
  } catch (error) {
    logger.error('[REALTIME] Failed to initialize Coinbase WebSocket:', error);
  }
}

let futuresPollingInterval: NodeJS.Timeout | null = null;

async function pollFuturesPrices(): Promise<void> {
  const symbols = { NQ: 'NQ=F', ES: 'ES=F', GC: 'GC=F' };
  
  for (const [rootSymbol, yahooSymbol] of Object.entries(symbols)) {
    try {
      const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1m&range=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      
      if (response.ok) {
        const data = await response.json();
        const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
        
        if (price) {
          futuresPrices.set(rootSymbol, {
            price,
            timestamp: new Date(),
            source: 'yahoo'
          });
          broadcastPrice(rootSymbol, price, 'yahoo');
          logger.debug(`[FUTURES-RT] ${rootSymbol}: $${price}`);
        }
      }
    } catch (error) {
      logger.debug(`[FUTURES-RT] Failed to fetch ${rootSymbol}:`, error);
    }
  }
}

export function initializeDatabentoWebSocket(): void {
  const apiKey = process.env.DATABENTO_API_KEY;
  
  if (!apiKey) {
    logger.info('[REALTIME] Databento requires Python SDK - using Yahoo Finance polling for futures');
  } else {
    logger.info('[REALTIME] Databento API key found - note: requires Python SDK for live TCP feed');
    logger.info('[REALTIME] Using Yahoo Finance polling for real-time futures (10s intervals)');
  }
  
  if (futuresPollingInterval) {
    clearInterval(futuresPollingInterval);
  }
  
  pollFuturesPrices();
  futuresPollingInterval = setInterval(pollFuturesPrices, 10000);
  logger.info('[REALTIME] Futures price polling started (10s intervals via Yahoo Finance)');
}

export function getCryptoPrice(symbol: string): PriceCache | null {
  const cached = cryptoPrices.get(symbol.toUpperCase());
  if (cached) {
    const age = Date.now() - cached.timestamp.getTime();
    if (age < 60000) {
      return cached;
    }
  }
  return null;
}

export function getFuturesPrice(rootSymbol: string): PriceCache | null {
  const cached = futuresPrices.get(rootSymbol.toUpperCase());
  if (cached) {
    const age = Date.now() - cached.timestamp.getTime();
    if (age < 60000) {
      return cached;
    }
  }
  return null;
}

export function getAllCryptoPrices(): Map<string, PriceCache> {
  return new Map(cryptoPrices);
}

export function getAllFuturesPrices(): Map<string, PriceCache> {
  return new Map(futuresPrices);
}

export function getRealtimeStatus(): {
  coinbase: { connected: boolean; symbols: number; lastUpdate: Date | null };
  futures: { connected: boolean; symbols: number; lastUpdate: Date | null };
} {
  let coinbaseLastUpdate: Date | null = null;
  let futuresLastUpdate: Date | null = null;
  
  cryptoPrices.forEach((cache) => {
    if (!coinbaseLastUpdate || cache.timestamp > coinbaseLastUpdate) {
      coinbaseLastUpdate = cache.timestamp;
    }
  });
  
  futuresPrices.forEach((cache) => {
    if (!futuresLastUpdate || cache.timestamp > futuresLastUpdate) {
      futuresLastUpdate = cache.timestamp;
    }
  });
  
  return {
    coinbase: {
      connected: coinbaseWs?.readyState === WebSocket.OPEN,
      symbols: cryptoPrices.size,
      lastUpdate: coinbaseLastUpdate
    },
    futures: {
      connected: futuresPollingInterval !== null,
      symbols: futuresPrices.size,
      lastUpdate: futuresLastUpdate
    }
  };
}

export function initializeRealtimePrices(httpServer?: Server): void {
  logger.info('[REALTIME] Initializing real-time price feeds...');
  
  if (httpServer) {
    // Use noServer mode to avoid intercepting Vite's HMR WebSocket
    wss = new WebSocketServer({ noServer: true });
    
    // Only handle upgrade for our specific path, let other paths (like Vite HMR) pass through
    httpServer.on('upgrade', (request, socket, head) => {
      const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;
      
      if (pathname === '/ws/prices') {
        wss!.handleUpgrade(request, socket, head, (ws) => {
          wss!.emit('connection', ws, request);
        });
      }
      // Don't destroy socket for other paths - let Vite handle them
    });
    
    wss.on('connection', (ws) => {
      logger.info(`[WS-BROADCAST] Client connected (total: ${wss?.clients.size})`);
      
      const snapshot: BroadcastMessage[] = [];
      cryptoPrices.forEach((cache, symbol) => {
        snapshot.push({
          type: 'price',
          symbol,
          price: cache.price,
          source: 'coinbase',
          timestamp: cache.timestamp.toISOString()
        });
      });
      futuresPrices.forEach((cache, symbol) => {
        snapshot.push({
          type: 'price',
          symbol,
          price: cache.price,
          source: 'yahoo',
          timestamp: cache.timestamp.toISOString()
        });
      });
      
      snapshot.forEach(msg => ws.send(JSON.stringify(msg)));
      
      ws.on('close', () => {
        logger.info(`[WS-BROADCAST] Client disconnected (total: ${wss?.clients.size})`);
      });
      
      ws.on('error', (error) => {
        logger.error('[WS-BROADCAST] Client error:', error);
      });
    });
    
    logger.info('[REALTIME] WebSocket broadcast server started on /ws/prices');
  }
  
  initializeCoinbaseWebSocket();
  initializeDatabentoWebSocket();
}

export function shutdownRealtimePrices(): void {
  logger.info('[REALTIME] Shutting down real-time price feeds...');
  
  if (coinbaseReconnectTimer) clearTimeout(coinbaseReconnectTimer);
  if (futuresPollingInterval) clearInterval(futuresPollingInterval);
  
  if (coinbaseWs) {
    coinbaseWs.close();
    coinbaseWs = null;
  }
}
