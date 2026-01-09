/**
 * DYNAMIC MOVER DISCOVERY SERVICE
 * 
 * Fetches real-time most-active stocks and biggest gainers/losers from Yahoo Finance
 * to catch movers NOT in the static ticker universe.
 * 
 * This ensures we never miss a CVNA-style move again.
 */

import { logger } from './logger';
import { getFullUniverse } from './ticker-universe';
import { recordSymbolAttention } from './attention-tracking-service';

// Cache for discovered movers (refreshed every scan)
let discoveredMovers: Set<string> = new Set();
let lastDiscoveryTime: Date | null = null;

// Yahoo Finance screener endpoints
const YAHOO_SCREENER_BASE = 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved';

interface YahooScreenerResult {
  symbol: string;
  shortName?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  regularMarketVolume?: number;
  averageVolume?: number;
}

interface DiscoveredMover {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  relativeVolume: number;
  source: 'most_active' | 'day_gainers' | 'day_losers' | 'trending';
  discoveredAt: Date;
  isNewDiscovery: boolean; // Not in static universe
}

/**
 * Fetch most active stocks from Yahoo Finance
 */
async function fetchYahooScreener(screenerType: string): Promise<YahooScreenerResult[]> {
  try {
    const url = `${YAHOO_SCREENER_BASE}?formatted=false&lang=en-US&region=US&scrIds=${screenerType}&count=50`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      logger.warn(`[MOVER-DISCOVERY] Yahoo screener ${screenerType} returned ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    const quotes = data?.finance?.result?.[0]?.quotes || [];
    
    return quotes.map((q: any) => ({
      symbol: q.symbol,
      shortName: q.shortName || q.longName,
      regularMarketPrice: q.regularMarketPrice,
      regularMarketChangePercent: q.regularMarketChangePercent,
      regularMarketVolume: q.regularMarketVolume,
      averageVolume: q.averageDailyVolume3Month || q.averageVolume
    }));
  } catch (error) {
    logger.error(`[MOVER-DISCOVERY] Error fetching ${screenerType}:`, error);
    return [];
  }
}

/**
 * Fetch trending tickers from Yahoo Finance
 */
async function fetchTrendingTickers(): Promise<string[]> {
  try {
    const url = 'https://query1.finance.yahoo.com/v1/finance/trending/US?count=50';
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) return [];
    
    const data = await response.json();
    const quotes = data?.finance?.result?.[0]?.quotes || [];
    
    return quotes.map((q: any) => q.symbol).filter(Boolean);
  } catch (error) {
    logger.error('[MOVER-DISCOVERY] Error fetching trending:', error);
    return [];
  }
}

/**
 * Discover movers from all sources
 */
export async function discoverMovers(): Promise<DiscoveredMover[]> {
  const staticUniverse = new Set(getFullUniverse());
  const allMovers: DiscoveredMover[] = [];
  
  logger.info('[MOVER-DISCOVERY] Starting mover discovery scan...');
  
  // Fetch from multiple sources in parallel
  const [mostActive, dayGainers, dayLosers, trending] = await Promise.all([
    fetchYahooScreener('most_actives'),
    fetchYahooScreener('day_gainers'),
    fetchYahooScreener('day_losers'),
    fetchTrendingTickers()
  ]);
  
  // Process most active
  for (const stock of mostActive) {
    if (!stock.symbol || stock.symbol.includes('^') || stock.symbol.includes('.')) continue;
    
    const relVol = stock.averageVolume ? stock.regularMarketVolume! / stock.averageVolume : 1;
    
    allMovers.push({
      symbol: stock.symbol,
      name: stock.shortName || stock.symbol,
      price: stock.regularMarketPrice || 0,
      changePercent: stock.regularMarketChangePercent || 0,
      volume: stock.regularMarketVolume || 0,
      avgVolume: stock.averageVolume || 0,
      relativeVolume: relVol,
      source: 'most_active',
      discoveredAt: new Date(),
      isNewDiscovery: !staticUniverse.has(stock.symbol)
    });
  }
  
  // Process day gainers
  for (const stock of dayGainers) {
    if (!stock.symbol || stock.symbol.includes('^') || stock.symbol.includes('.')) continue;
    if (allMovers.some(m => m.symbol === stock.symbol)) continue;
    
    const relVol = stock.averageVolume ? stock.regularMarketVolume! / stock.averageVolume : 1;
    
    allMovers.push({
      symbol: stock.symbol,
      name: stock.shortName || stock.symbol,
      price: stock.regularMarketPrice || 0,
      changePercent: stock.regularMarketChangePercent || 0,
      volume: stock.regularMarketVolume || 0,
      avgVolume: stock.averageVolume || 0,
      relativeVolume: relVol,
      source: 'day_gainers',
      discoveredAt: new Date(),
      isNewDiscovery: !staticUniverse.has(stock.symbol)
    });
  }
  
  // Process day losers
  for (const stock of dayLosers) {
    if (!stock.symbol || stock.symbol.includes('^') || stock.symbol.includes('.')) continue;
    if (allMovers.some(m => m.symbol === stock.symbol)) continue;
    
    const relVol = stock.averageVolume ? stock.regularMarketVolume! / stock.averageVolume : 1;
    
    allMovers.push({
      symbol: stock.symbol,
      name: stock.shortName || stock.symbol,
      price: stock.regularMarketPrice || 0,
      changePercent: stock.regularMarketChangePercent || 0,
      volume: stock.regularMarketVolume || 0,
      avgVolume: stock.averageVolume || 0,
      relativeVolume: relVol,
      source: 'day_losers',
      discoveredAt: new Date(),
      isNewDiscovery: !staticUniverse.has(stock.symbol)
    });
  }
  
  // Add trending tickers not already in list
  for (const symbol of trending) {
    if (!symbol || symbol.includes('^') || symbol.includes('.')) continue;
    if (allMovers.some(m => m.symbol === symbol)) continue;
    
    allMovers.push({
      symbol,
      name: symbol,
      price: 0,
      changePercent: 0,
      volume: 0,
      avgVolume: 0,
      relativeVolume: 1,
      source: 'trending',
      discoveredAt: new Date(),
      isNewDiscovery: !staticUniverse.has(symbol)
    });
  }
  
  // Update cache
  discoveredMovers = new Set(allMovers.map(m => m.symbol));
  lastDiscoveryTime = new Date();
  
  // Log new discoveries
  const newDiscoveries = allMovers.filter(m => m.isNewDiscovery);
  if (newDiscoveries.length > 0) {
    logger.info(`[MOVER-DISCOVERY] Found ${newDiscoveries.length} stocks NOT in static universe:`);
    newDiscoveries.slice(0, 10).forEach(m => {
      logger.info(`  - ${m.symbol}: ${m.changePercent.toFixed(1)}% (${m.source})`);
    });
  }
  
  // 🎯 CONVERGENCE TRACKING: Record significant movers for heat map
  const significantMovers = allMovers.filter(m => Math.abs(m.changePercent) >= 5 || m.relativeVolume >= 3);
  for (const mover of significantMovers.slice(0, 20)) {
    try {
      await recordSymbolAttention(mover.symbol, 'mover_discovery', 'discovery', {
        changePercent: mover.changePercent,
        direction: mover.changePercent >= 0 ? 'bullish' : 'bearish',
        message: `${mover.source.replace('_', ' ')}: ${mover.changePercent >= 0 ? '+' : ''}${mover.changePercent.toFixed(1)}%`
      });
    } catch (err) {
      // Silently ignore attention tracking errors
    }
  }
  
  logger.info(`[MOVER-DISCOVERY] Total movers discovered: ${allMovers.length}, New discoveries: ${newDiscoveries.length}`);
  
  return allMovers;
}

/**
 * Get symbols that should be added to scanner queue
 * Returns symbols that are moving but NOT in the static universe
 */
export async function getNewMoverSymbols(): Promise<string[]> {
  const movers = await discoverMovers();
  
  // Filter for new discoveries with significant moves
  return movers
    .filter(m => m.isNewDiscovery)
    .filter(m => Math.abs(m.changePercent) >= 3 || m.relativeVolume >= 2) // 3%+ move OR 2x avg volume
    .map(m => m.symbol);
}

/**
 * Get the combined universe: static list + discovered movers
 */
export function getExpandedUniverse(): string[] {
  const staticUniverse = getFullUniverse();
  const combined = new Set(staticUniverse);
  discoveredMovers.forEach(symbol => combined.add(symbol));
  return Array.from(combined);
}

/**
 * Get discovery status
 */
export function getDiscoveryStatus() {
  return {
    lastDiscoveryTime,
    discoveredCount: discoveredMovers.size,
    discoveredSymbols: Array.from(discoveredMovers)
  };
}

/**
 * Check if a symbol was dynamically discovered (not in static list)
 */
export function isDiscoveredMover(symbol: string): boolean {
  return discoveredMovers.has(symbol) && !getFullUniverse().includes(symbol);
}
