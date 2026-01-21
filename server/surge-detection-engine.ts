import { logger } from './logger';

interface DetectionAlert {
  symbol: string;
  trigger: 'VOLUME_SPIKE' | 'PRICE_BREAKOUT' | 'NEWS_CATALYST' | 'SECTOR_MOVE' | 'TECHNICAL_SIGNAL';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
  price: number;
  change: number;
  detectedAt: Date;
  data?: any;
}

interface WatchCriteria {
  volumeMultiplier: number;
  priceChangeThreshold: number;
  technicalBreakout: boolean;
  newsWatch: boolean;
}

const DEFAULT_CRITERIA: WatchCriteria = {
  volumeMultiplier: 2.0,
  priceChangeThreshold: 3.0,
  technicalBreakout: true,
  newsWatch: true
};

const activeAlerts: Map<string, DetectionAlert> = new Map();
const watchedSymbols: Map<string, { lastPrice: number; lastVolume: number; avgVolume: number }> = new Map();

const PRIORITY_WATCHLIST = [
  'ARM', 'NVDA', 'AMD', 'SMCI', 'AVGO', 'TSM', 'ASML', 'MU', 'QCOM', 'MRVL',
  'WDC', 'STX', 'INTC', 'AMAT', 'LRCX', 'KLAC', 'ON', 'WOLF', 'MPWR',
  'RKLB', 'OKLO', 'NNE', 'SMR', 'CCJ', 'LEU', 'UUUU', 'UEC',
  'IONQ', 'RGTI', 'QUBT', 'PLTR', 'AI', 'SOUN', 'PATH', 'SNOW', 'DDOG',
  'COIN', 'MARA', 'RIOT', 'MSTR', 'CLSK', 'BITF', 'WULF',
  'SOFI', 'HOOD', 'UPST', 'AFRM', 'SQ', 'PYPL', 'NET', 'CRWD', 'ZS'
];

async function checkPriceThresholds(): Promise<DetectionAlert[]> {
  const alerts: DetectionAlert[] = [];
  
  try {
    const YahooFinance = (await import('yahoo-finance2')).default;
    const yahooFinance = new YahooFinance();
    
    const batchSize = 15;
    for (let i = 0; i < PRIORITY_WATCHLIST.length; i += batchSize) {
      const batch = PRIORITY_WATCHLIST.slice(i, i + batchSize);
      
      const results = await Promise.allSettled(
        batch.map(async (symbol) => {
          try {
            const quote = await yahooFinance.quote(symbol);
            if (!quote || !quote.regularMarketPrice) return null;
            
            const price = quote.regularMarketPrice;
            const change = quote.regularMarketChangePercent || 0;
            const volume = quote.regularMarketVolume || 0;
            const avgVolume = quote.averageDailyVolume10Day || quote.averageVolume || volume;
            const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;
            
            const prev = watchedSymbols.get(symbol);
            watchedSymbols.set(symbol, { lastPrice: price, lastVolume: volume, avgVolume });
            
            if (change >= DEFAULT_CRITERIA.priceChangeThreshold) {
              const alert: DetectionAlert = {
                symbol,
                trigger: 'PRICE_BREAKOUT',
                severity: change >= 8 ? 'HIGH' : change >= 5 ? 'MEDIUM' : 'LOW',
                message: `${symbol} breaking out +${change.toFixed(1)}%`,
                price,
                change,
                detectedAt: new Date(),
                data: { volumeRatio, dayHigh: quote.regularMarketDayHigh }
              };
              alerts.push(alert);
              activeAlerts.set(`${symbol}-PRICE`, alert);
            }
            
            if (volumeRatio >= DEFAULT_CRITERIA.volumeMultiplier) {
              const existingAlert = activeAlerts.get(`${symbol}-VOLUME`);
              const isNew = !existingAlert || (Date.now() - existingAlert.detectedAt.getTime()) > 30 * 60 * 1000;
              
              if (isNew) {
                const alert: DetectionAlert = {
                  symbol,
                  trigger: 'VOLUME_SPIKE',
                  severity: volumeRatio >= 4 ? 'HIGH' : volumeRatio >= 2.5 ? 'MEDIUM' : 'LOW',
                  message: `${symbol} unusual volume ${volumeRatio.toFixed(1)}x average`,
                  price,
                  change,
                  detectedAt: new Date(),
                  data: { volumeRatio, volume, avgVolume }
                };
                alerts.push(alert);
                activeAlerts.set(`${symbol}-VOLUME`, alert);
              }
            }
            
            const fiftyTwoWeekHigh = quote.fiftyTwoWeekHigh || price * 1.5;
            const nearHigh = (price / fiftyTwoWeekHigh) > 0.95;
            if (nearHigh && change > 1) {
              const alert: DetectionAlert = {
                symbol,
                trigger: 'TECHNICAL_SIGNAL',
                severity: 'MEDIUM',
                message: `${symbol} testing 52-week high at $${price.toFixed(2)}`,
                price,
                change,
                detectedAt: new Date(),
                data: { fiftyTwoWeekHigh, percentOfHigh: (price / fiftyTwoWeekHigh * 100).toFixed(1) }
              };
              alerts.push(alert);
              activeAlerts.set(`${symbol}-TECHNICAL`, alert);
            }
            
            return { symbol, price, change, volumeRatio };
          } catch (e) {
            return null;
          }
        })
      );
      
      await new Promise(r => setTimeout(r, 300));
    }
    
  } catch (error) {
    logger.error('[DETECTION-ENGINE] Price threshold check failed:', error);
  }
  
  return alerts;
}

async function checkNewsCatalysts(): Promise<DetectionAlert[]> {
  const alerts: DetectionAlert[] = [];
  
  try {
    const alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY;
    if (!alphaVantageKey) return alerts;
    
    const keywords = ['ARM', 'NVIDIA', 'AMD', 'SMCI', 'semiconductor', 'AI chip', 'quantum', 'nuclear'];
    const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&topics=technology,earnings&apikey=${alphaVantageKey}`;
    
    const response = await fetch(url);
    if (!response.ok) return alerts;
    
    const data = await response.json();
    if (!data.feed) return alerts;
    
    const recentNews = data.feed.slice(0, 20);
    
    for (const article of recentNews) {
      const title = (article.title || '').toLowerCase();
      const summary = (article.summary || '').toLowerCase();
      
      for (const symbol of PRIORITY_WATCHLIST.slice(0, 20)) {
        if (title.includes(symbol.toLowerCase()) || summary.includes(symbol.toLowerCase())) {
          const existingKey = `${symbol}-NEWS-${article.title?.slice(0, 20)}`;
          if (!activeAlerts.has(existingKey)) {
            const sentiment = article.overall_sentiment_score || 0;
            const alert: DetectionAlert = {
              symbol,
              trigger: 'NEWS_CATALYST',
              severity: Math.abs(sentiment) > 0.3 ? 'HIGH' : 'MEDIUM',
              message: `News: ${article.title?.slice(0, 60)}...`,
              price: 0,
              change: 0,
              detectedAt: new Date(),
              data: { 
                title: article.title, 
                sentiment,
                source: article.source
              }
            };
            alerts.push(alert);
            activeAlerts.set(existingKey, alert);
          }
        }
      }
    }
    
  } catch (error) {
    logger.error('[DETECTION-ENGINE] News catalyst check failed:', error);
  }
  
  return alerts;
}

async function checkSectorMoves(): Promise<DetectionAlert[]> {
  const alerts: DetectionAlert[] = [];
  
  try {
    const YahooFinance = (await import('yahoo-finance2')).default;
    const yahooFinance = new YahooFinance();
    
    const sectorETFs = [
      { symbol: 'SMH', sector: 'Semiconductor', triggers: ['ARM', 'NVDA', 'AMD', 'AVGO', 'INTC', 'MU', 'QCOM'] },
      { symbol: 'ARKK', sector: 'Innovation', triggers: ['COIN', 'PLTR', 'PATH', 'ROKU', 'SQ'] },
      { symbol: 'URA', sector: 'Uranium/Nuclear', triggers: ['CCJ', 'LEU', 'UUUU', 'UEC', 'NNE', 'OKLO', 'SMR'] },
      { symbol: 'BITQ', sector: 'Crypto', triggers: ['COIN', 'MARA', 'RIOT', 'MSTR', 'CLSK'] }
    ];
    
    for (const etf of sectorETFs) {
      try {
        const quote = await yahooFinance.quote(etf.symbol);
        if (!quote || !quote.regularMarketChangePercent) continue;
        
        const change = quote.regularMarketChangePercent;
        
        if (Math.abs(change) >= 2) {
          const alert: DetectionAlert = {
            symbol: etf.symbol,
            trigger: 'SECTOR_MOVE',
            severity: Math.abs(change) >= 4 ? 'HIGH' : 'MEDIUM',
            message: `${etf.sector} sector ${change > 0 ? 'surging' : 'dropping'} ${change.toFixed(1)}% - watch ${etf.triggers.slice(0, 3).join(', ')}`,
            price: quote.regularMarketPrice || 0,
            change,
            detectedAt: new Date(),
            data: { relatedSymbols: etf.triggers }
          };
          alerts.push(alert);
        }
        
        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
      }
    }
    
  } catch (error) {
    logger.error('[DETECTION-ENGINE] Sector move check failed:', error);
  }
  
  return alerts;
}

export async function runDetectionCycle(): Promise<DetectionAlert[]> {
  logger.info('[DETECTION-ENGINE] Running detection cycle...');
  
  const oldAlerts = [...activeAlerts.entries()];
  for (const [key, alert] of oldAlerts) {
    if (Date.now() - alert.detectedAt.getTime() > 60 * 60 * 1000) {
      activeAlerts.delete(key);
    }
  }
  
  const [priceAlerts, newsAlerts, sectorAlerts] = await Promise.all([
    checkPriceThresholds(),
    checkNewsCatalysts(),
    checkSectorMoves()
  ]);
  
  const allAlerts = [...priceAlerts, ...newsAlerts, ...sectorAlerts];
  
  allAlerts.sort((a, b) => {
    const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
  
  if (allAlerts.length > 0) {
    logger.info(`[DETECTION-ENGINE] Found ${allAlerts.length} alerts: ${allAlerts.filter(a => a.severity === 'HIGH').length} HIGH, ${allAlerts.filter(a => a.severity === 'MEDIUM').length} MEDIUM`);
  }
  
  return allAlerts;
}

export function getActiveAlerts(): DetectionAlert[] {
  return Array.from(activeAlerts.values())
    .sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());
}

export function clearAlert(symbol: string): void {
  for (const key of activeAlerts.keys()) {
    if (key.startsWith(symbol)) {
      activeAlerts.delete(key);
    }
  }
}

let detectionInterval: NodeJS.Timeout | null = null;
let lastDetectionAlerts: DetectionAlert[] = [];

export function startDetectionEngine(intervalMs: number = 60000): void {
  if (detectionInterval) {
    clearInterval(detectionInterval);
  }
  
  logger.info(`[DETECTION-ENGINE] Starting with ${intervalMs / 1000}s interval`);
  
  runDetectionCycle().then(alerts => {
    lastDetectionAlerts = alerts;
  });
  
  detectionInterval = setInterval(async () => {
    const alerts = await runDetectionCycle();
    lastDetectionAlerts = alerts;
  }, intervalMs);
}

export function stopDetectionEngine(): void {
  if (detectionInterval) {
    clearInterval(detectionInterval);
    detectionInterval = null;
    logger.info('[DETECTION-ENGINE] Stopped');
  }
}

export function getLastDetectionAlerts(): DetectionAlert[] {
  return lastDetectionAlerts;
}

export { DetectionAlert, WatchCriteria, PRIORITY_WATCHLIST };
