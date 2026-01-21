import { logger } from './logger';

interface BreakoutCandidate {
  symbol: string;
  price: number;
  score: number;
  reason: string;
  upside?: number;
  volume?: number;
  change?: number;
  sector?: string;
}

const SUB_40_BREAKOUT_TICKERS = [
  'ONDAS', 'ZETA', 'SOFI', 'HOOD', 'PLTR', 'RKLB', 'LUNR', 'NNE', 'OKLO', 'SMR',
  'IONQ', 'RGTI', 'QUBT', 'AI', 'SOUN', 'UPST', 'COIN', 'MARA', 'RIOT', 'BITF',
  'HIVE', 'CLSK', 'WULF', 'CORZ', 'IREN', 'HUT', 'BTBT', 'CIFR', 'ARBK', 'GREE',
  'JOBY', 'ACHR', 'ASTS', 'SPCE', 'RDW', 'LLAP', 'MNTS', 'ASTR', 'VORB',
  'NIO', 'XPEV', 'LI', 'RIVN', 'LCID', 'FSR', 'GOEV', 'RIDE', 'NKLA', 'HYLN',
  'BIDU', 'BABA', 'JD', 'PDD', 'TME', 'BILI', 'IQ', 'DIDI', 'YMM', 'NTES',
  'CCJ', 'LEU', 'UUUU', 'UEC', 'DNN', 'URG', 'NXE', 'BWXT', 'FLR', 'BWE',
  'SMCI', 'DELL', 'HPE', 'PSTG', 'NTAP', 'WDC', 'STX', 'MU', 'LRCX', 'AMAT',
  'SNAP', 'PINS', 'MTCH', 'BMBL', 'RDDT', 'YELP', 'ZI', 'TWLO', 'DBX', 'BOX',
  'CRWD', 'PANW', 'ZS', 'FTNT', 'OKTA', 'NET', 'DDOG', 'S', 'TENB', 'RPD',
  'PATH', 'DOCN', 'GTLB', 'MDB', 'SNOW', 'ESTC', 'CFLT', 'SUMO', 'DT', 'NEWR',
  'AFRM', 'SQ', 'PYPL', 'NU', 'STNE', 'PAGS', 'GPN', 'FIS', 'FISV', 'ADP',
  'ARM', 'INTC', 'AMD', 'NVDA', 'AVGO', 'QCOM', 'TXN', 'MU', 'MRVL', 'SWKS',
  'ROKU', 'TTD', 'PUBM', 'MGNI', 'CRTO', 'DV', 'IAS', 'APPS', 'IRNT', 'FLYW'
];

export async function discoverBreakoutCandidates(): Promise<BreakoutCandidate[]> {
  logger.info('[BREAKOUT-DISCOVERY] Scanning for sub-$40 breakout candidates...');
  
  const candidates: BreakoutCandidate[] = [];
  
  try {
    const YahooFinance = (await import('yahoo-finance2')).default;
    const yahooFinance = new YahooFinance();
    
    const shuffled = [...SUB_40_BREAKOUT_TICKERS].sort(() => Math.random() - 0.5);
    const toScan = shuffled.slice(0, 50);
    
    const batchSize = 10;
    for (let i = 0; i < toScan.length; i += batchSize) {
      const batch = toScan.slice(i, i + batchSize);
      
      const results = await Promise.allSettled(
        batch.map(async (symbol) => {
          const quote = await yahooFinance.quote(symbol);
          if (!quote || !quote.regularMarketPrice) return null;
          
          const price = quote.regularMarketPrice;
          
          if (price > 40) return null;
          
          let score = 50;
          const reasons: string[] = [];
          
          if (price < 5) {
            reasons.push('Penny stock');
            score += 5;
          } else if (price < 10) {
            reasons.push('Low-priced mover');
            score += 10;
          } else if (price < 20) {
            reasons.push('Sub-$20 setup');
            score += 15;
          } else {
            reasons.push('Mid-cap potential');
            score += 10;
          }
          
          const change = quote.regularMarketChangePercent || 0;
          if (change > 3) {
            reasons.push(`+${change.toFixed(1)}% today`);
            score += 15;
          } else if (change > 1) {
            reasons.push(`Green day +${change.toFixed(1)}%`);
            score += 5;
          }
          
          const volume = quote.regularMarketVolume || 0;
          const avgVolume = quote.averageDailyVolume10Day || quote.averageVolume || volume;
          if (avgVolume > 0 && volume > avgVolume * 1.5) {
            reasons.push(`Volume spike ${(volume / avgVolume).toFixed(1)}x`);
            score += 20;
          }
          
          const dayHigh = quote.regularMarketDayHigh || price;
          const dayLow = quote.regularMarketDayLow || price;
          const range = dayHigh - dayLow;
          if (range > 0 && (price - dayLow) / range > 0.7) {
            reasons.push('Near day high');
            score += 10;
          }
          
          const fiftyTwoWeekHigh = quote.fiftyTwoWeekHigh || price * 2;
          const fromHigh = ((fiftyTwoWeekHigh - price) / fiftyTwoWeekHigh) * 100;
          if (fromHigh > 30 && fromHigh < 70) {
            reasons.push(`${fromHigh.toFixed(0)}% below 52w high`);
            score += 5;
          }
          
          if (symbol.match(/^(IONQ|RGTI|QUBT|AI|SOUN)/)) {
            reasons.push('AI/Quantum sector');
            score += 10;
          } else if (symbol.match(/^(NNE|OKLO|SMR|CCJ|LEU|UUUU|UEC|DNN)/)) {
            reasons.push('Nuclear/Energy sector');
            score += 10;
          } else if (symbol.match(/^(RKLB|LUNR|JOBY|ACHR|ASTS|SPCE)/)) {
            reasons.push('Space/Aviation sector');
            score += 10;
          } else if (symbol.match(/^(MARA|RIOT|COIN|BITF|CLSK|WULF)/)) {
            reasons.push('Crypto/Mining sector');
            score += 8;
          }
          
          return {
            symbol,
            price,
            score: Math.min(95, score),
            reason: reasons.join(' | '),
            upside: fromHigh,
            volume,
            change
          };
        })
      );
      
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value && result.value.score >= 60) {
          candidates.push(result.value);
        }
      }
      
      await new Promise(r => setTimeout(r, 500));
    }
    
    candidates.sort((a, b) => b.score - a.score);
    
    logger.info(`[BREAKOUT-DISCOVERY] Found ${candidates.length} breakout candidates`);
    return candidates.slice(0, 20);
    
  } catch (error) {
    logger.error('[BREAKOUT-DISCOVERY] Scan failed:', error);
    return [];
  }
}

export async function findMissedOpportunities(symbols: string[]): Promise<BreakoutCandidate[]> {
  logger.info(`[BREAKOUT-DISCOVERY] Checking ${symbols.length} symbols for missed opportunities...`);
  
  const candidates: BreakoutCandidate[] = [];
  
  try {
    const YahooFinance = (await import('yahoo-finance2')).default;
    const yahooFinance = new YahooFinance();
    
    for (const symbol of symbols) {
      try {
        const quote = await yahooFinance.quote(symbol);
        if (!quote || !quote.regularMarketPrice) continue;
        
        const price = quote.regularMarketPrice;
        const change = quote.regularMarketChangePercent || 0;
        
        if (change > 5 && price < 50) {
          candidates.push({
            symbol,
            price,
            score: 80 + Math.min(15, change),
            reason: `MISSED: +${change.toFixed(1)}% move today`,
            change,
            upside: change
          });
        }
      } catch (e) {
      }
    }
    
    candidates.sort((a, b) => (b.change || 0) - (a.change || 0));
    return candidates;
    
  } catch (error) {
    logger.error('[BREAKOUT-DISCOVERY] Missed opportunities check failed:', error);
    return [];
  }
}

export { SUB_40_BREAKOUT_TICKERS };
