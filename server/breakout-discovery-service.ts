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
  tier?: 'SURGE' | 'MOMENTUM' | 'SETUP' | 'WATCH';
}

const SURGE_WATCH_UNIVERSE = [
  // Semiconductors - HIGH PRIORITY (ARM surge situation)
  'ARM', 'NVDA', 'AMD', 'INTC', 'AVGO', 'QCOM', 'MU', 'MRVL', 'SWKS', 'ON',
  'AMAT', 'LRCX', 'KLAC', 'ASML', 'TSM', 'SNPS', 'CDNS', 'WOLF', 'MPWR', 'ALGM',
  
  // AI/Quantum - Growth plays
  'IONQ', 'RGTI', 'QUBT', 'AI', 'SOUN', 'PLTR', 'PATH', 'SNOW', 'MDB', 'DDOG',
  'CRWD', 'ZS', 'NET', 'ESTC', 'CFLT', 'GTLB', 'DOCN', 'DT', 'NEWR', 'SUMO',
  
  // Space/Aviation - Momentum plays
  'RKLB', 'LUNR', 'JOBY', 'ACHR', 'ASTS', 'SPCE', 'RDW', 'LLAP', 'BA', 'LMT',
  'RTX', 'NOC', 'GD', 'HII', 'TDG', 'HWM', 'SPR', 'KTOS', 'AVAV', 'AXON',
  
  // Nuclear/Energy - Policy plays  
  'NNE', 'OKLO', 'SMR', 'CCJ', 'LEU', 'UUUU', 'UEC', 'DNN', 'URG', 'NXE',
  'BWXT', 'FLR', 'BWE', 'VST', 'CEG', 'NRG', 'AES', 'NEE', 'SO', 'DUK',
  
  // Crypto/Mining - Volatility plays
  'COIN', 'MARA', 'RIOT', 'BITF', 'HIVE', 'CLSK', 'WULF', 'CORZ', 'IREN', 'HUT',
  'BTBT', 'CIFR', 'ARBK', 'GREE', 'MSTR', 'SQ', 'PYPL', 'AFRM', 'NU', 'HOOD',
  
  // EV/Auto - Sector plays
  'TSLA', 'RIVN', 'LCID', 'NIO', 'XPEV', 'LI', 'FSR', 'GOEV', 'NKLA', 'HYLN',
  'QS', 'CHPT', 'BLNK', 'EVGO', 'GM', 'F', 'TM', 'HMC', 'STLA', 'RACE',
  
  // China/Emerging - Rebound plays
  'BABA', 'JD', 'PDD', 'BIDU', 'TME', 'BILI', 'IQ', 'NTES', 'SE', 'GRAB',
  'MELI', 'STNE', 'PAGS', 'VTEX', 'DLO', 'GLBE', 'SHOP', 'WIX', 'BIGC', 'CPNG',
  
  // Social/Media - Trend plays
  'SNAP', 'PINS', 'MTCH', 'BMBL', 'RDDT', 'YELP', 'TTD', 'ROKU', 'PUBM', 'MGNI',
  'CRTO', 'DV', 'IAS', 'APPS', 'FLYW', 'ZI', 'TWLO', 'DBX', 'BOX', 'FVRR',
  
  // Growth/Tech - FOMO plays
  'SOFI', 'UPST', 'ONDAS', 'ZETA', 'HIMS', 'DOCS', 'TDOC', 'AMWL', 'LVGO', 'CERT',
  'SMCI', 'DELL', 'HPE', 'PSTG', 'NTAP', 'WDC', 'STX', 'PANW', 'OKTA', 'FTNT',
  
  // Biotech/Health - Catalyst plays
  'MRNA', 'BNTX', 'NVAX', 'ARKG', 'XBI', 'SGEN', 'VRTX', 'REGN', 'ILMN', 'EXAS',

  // Precious Metals & Commodities - Silver, Gold, Copper plays
  'SLV', 'PSLV', 'AGI', 'AG', 'PAAS', 'HL', 'EXK', 'MAG', 'FSM', 'WPM', // Silver
  'GLD', 'IAU', 'GDX', 'GDXJ', 'GOLD', 'NEM', 'AEM', 'KGC', 'FNV', 'RGLD', // Gold
  'COPX', 'CPER', 'FCX', 'SCCO', 'TECK', 'RIO', 'BHP', 'VALE', // Copper & Base metals
  'USO', 'XLE', 'OXY', 'COP', 'DVN', 'PXD', 'EOG', 'FANG', 'HES', 'MRO' // Oil & Energy
];

export async function discoverBreakoutCandidates(): Promise<BreakoutCandidate[]> {
  logger.info('[SURGE-DETECTOR] Scanning ALL tickers for momentum and pre-breakout signals...');
  
  const candidates: BreakoutCandidate[] = [];
  
  try {
    const yahooFinance = (await import('yahoo-finance2')).default;
    
    const shuffled = [...SURGE_WATCH_UNIVERSE].sort(() => Math.random() - 0.5);
    const toScan = shuffled.slice(0, 60);
    
    const batchSize = 10;
    for (let i = 0; i < toScan.length; i += batchSize) {
      const batch = toScan.slice(i, i + batchSize);
      
      const results = await Promise.allSettled(
        batch.map(async (symbol) => {
          const quote = await yahooFinance.quote(symbol);
          if (!quote || !quote.regularMarketPrice) return null;
          
          const price = quote.regularMarketPrice;
          let score = 40;
          const reasons: string[] = [];
          let tier: 'SURGE' | 'MOMENTUM' | 'SETUP' | 'WATCH' = 'WATCH';
          
          const change = quote.regularMarketChangePercent || 0;
          const volume = quote.regularMarketVolume || 0;
          const avgVolume = quote.averageDailyVolume10Day || quote.averageVolume || volume;
          const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;
          
          // SURGE DETECTION - Major moves happening NOW
          if (change >= 5) {
            tier = 'SURGE';
            reasons.push(`🚀 SURGING +${change.toFixed(1)}%`);
            score += 35;
          } else if (change >= 3) {
            tier = 'MOMENTUM';
            reasons.push(`📈 +${change.toFixed(1)}% momentum`);
            score += 25;
          } else if (change >= 1.5) {
            tier = 'SETUP';
            reasons.push(`⬆️ +${change.toFixed(1)}% building`);
            score += 15;
          } else if (change > 0) {
            reasons.push(`Green +${change.toFixed(1)}%`);
            score += 5;
          }
          
          // VOLUME SPIKE - Early warning signal
          if (volumeRatio >= 3) {
            reasons.push(`🔥 Volume 3x+ unusual`);
            score += 25;
            if (tier === 'WATCH') tier = 'SETUP';
          } else if (volumeRatio >= 2) {
            reasons.push(`📊 Volume 2x spike`);
            score += 15;
          } else if (volumeRatio >= 1.5) {
            reasons.push(`Volume ${volumeRatio.toFixed(1)}x`);
            score += 8;
          }
          
          // NEAR DAY HIGH - Strength signal
          const dayHigh = quote.regularMarketDayHigh || price;
          const dayLow = quote.regularMarketDayLow || price;
          const range = dayHigh - dayLow;
          if (range > 0) {
            const positionInRange = (price - dayLow) / range;
            if (positionInRange > 0.85) {
              reasons.push('At day highs');
              score += 12;
            } else if (positionInRange > 0.7) {
              reasons.push('Near highs');
              score += 6;
            }
          }
          
          // 52-WEEK ANALYSIS - Upside potential
          const fiftyTwoWeekHigh = quote.fiftyTwoWeekHigh || price;
          const fiftyTwoWeekLow = quote.fiftyTwoWeekLow || price;
          const fromHigh = ((fiftyTwoWeekHigh - price) / fiftyTwoWeekHigh) * 100;
          const fromLow = ((price - fiftyTwoWeekLow) / fiftyTwoWeekLow) * 100;
          
          // Breaking out from lows = high potential
          if (fromLow > 20 && fromHigh > 30) {
            reasons.push(`Breakout from lows +${fromLow.toFixed(0)}%`);
            score += 10;
          }
          
          // Near 52-week high = momentum confirmed
          if (fromHigh < 5) {
            reasons.push('Near 52W high 🎯');
            score += 8;
          } else if (fromHigh < 15) {
            reasons.push('Within 15% of highs');
            score += 5;
          }
          
          // SECTOR BONUSES
          if (symbol.match(/^(ARM|NVDA|AMD|AVGO|QCOM|MU|MRVL|TSM|ASML)/)) {
            reasons.push('🔷 Semiconductor');
            score += 8;
          } else if (symbol.match(/^(IONQ|RGTI|QUBT|AI|SOUN|PLTR)/)) {
            reasons.push('🤖 AI/Quantum');
            score += 8;
          } else if (symbol.match(/^(NNE|OKLO|SMR|CCJ|LEU|UUUU|UEC)/)) {
            reasons.push('⚛️ Nuclear');
            score += 8;
          } else if (symbol.match(/^(RKLB|LUNR|JOBY|ACHR|ASTS)/)) {
            reasons.push('🚀 Space');
            score += 8;
          } else if (symbol.match(/^(COIN|MARA|RIOT|MSTR|CLSK)/)) {
            reasons.push('₿ Crypto');
            score += 5;
          } else if (symbol.match(/^(SLV|PSLV|AGI|AG|PAAS|HL|EXK|MAG|FSM|WPM)/)) {
            reasons.push('🥈 Silver');
            score += 6;
          } else if (symbol.match(/^(GLD|IAU|GDX|GDXJ|GOLD|NEM|AEM|KGC|FNV|RGLD)/)) {
            reasons.push('🥇 Gold');
            score += 6;
          } else if (symbol.match(/^(COPX|CPER|FCX|SCCO|TECK|RIO|BHP|VALE)/)) {
            reasons.push('🔶 Copper/Base');
            score += 6;
          }
          
          // PRICE TIER INFO (no filtering, just info)
          if (price < 10) {
            reasons.push(`$${price.toFixed(2)} low-priced`);
          } else if (price < 25) {
            reasons.push(`$${price.toFixed(2)} mid-tier`);
          } else if (price < 50) {
            reasons.push(`$${price.toFixed(2)}`);
          } else if (price < 100) {
            reasons.push(`$${price.toFixed(0)} premium`);
          } else {
            reasons.push(`$${price.toFixed(0)} high-cap`);
          }
          
          return {
            symbol,
            price,
            score: Math.min(98, score),
            reason: reasons.join(' | '),
            upside: fromHigh,
            volume,
            change,
            tier
          };
        })
      );
      
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          // Include all SURGE/MOMENTUM, and any stock with score >= 45 (more inclusive)
          const c = result.value;
          if (c.tier === 'SURGE' || c.tier === 'MOMENTUM' || c.score >= 45) {
            candidates.push(c);
          }
        }
      }
      
      await new Promise(r => setTimeout(r, 400));
    }
    
    // Sort by tier priority, then by score
    const tierOrder = { 'SURGE': 0, 'MOMENTUM': 1, 'SETUP': 2, 'WATCH': 3 };
    candidates.sort((a, b) => {
      const tierDiff = tierOrder[a.tier || 'WATCH'] - tierOrder[b.tier || 'WATCH'];
      if (tierDiff !== 0) return tierDiff;
      return b.score - a.score;
    });
    
    logger.info(`[SURGE-DETECTOR] Found ${candidates.length} candidates (SURGE: ${candidates.filter(c => c.tier === 'SURGE').length}, MOMENTUM: ${candidates.filter(c => c.tier === 'MOMENTUM').length})`);
    return candidates.slice(0, 30);
    
  } catch (error) {
    logger.error('[SURGE-DETECTOR] Scan failed:', error);
    return [];
  }
}

export async function detectPreBreakout(): Promise<BreakoutCandidate[]> {
  logger.info('[PRE-BREAKOUT] Scanning for early surge signals...');
  
  const candidates: BreakoutCandidate[] = [];
  
  try {
    const yahooFinance = (await import('yahoo-finance2')).default;
    
    // Focus on high-quality names that could surge
    const priorityTickers = [
      'ARM', 'NVDA', 'AMD', 'SMCI', 'AVGO', 'TSM', 'ASML', 'MRVL', 'MU', 'QCOM',
      'RKLB', 'OKLO', 'NNE', 'SMR', 'IONQ', 'PLTR', 'COIN', 'MSTR', 'MARA',
      'SOFI', 'HOOD', 'UPST', 'AFRM', 'SQ', 'NET', 'CRWD', 'ZS', 'SNOW', 'DDOG'
    ];
    
    for (const symbol of priorityTickers) {
      try {
        const quote = await yahooFinance.quote(symbol);
        if (!quote || !quote.regularMarketPrice) continue;
        
        const price = quote.regularMarketPrice;
        const change = quote.regularMarketChangePercent || 0;
        const volume = quote.regularMarketVolume || 0;
        const avgVolume = quote.averageDailyVolume10Day || quote.averageVolume || volume;
        const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;
        
        // Pre-breakout signals: volume building + small positive move
        if (volumeRatio >= 1.3 && change > 0 && change < 5) {
          const reasons: string[] = [];
          let score = 60;
          
          reasons.push(`📊 Volume building ${volumeRatio.toFixed(1)}x`);
          reasons.push(`+${change.toFixed(1)}% early move`);
          score += volumeRatio * 5;
          score += change * 3;
          
          candidates.push({
            symbol,
            price,
            score: Math.min(90, score),
            reason: reasons.join(' | '),
            volume,
            change,
            tier: 'SETUP'
          });
        }
        
        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        // Skip failed quotes
      }
    }
    
    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, 15);
    
  } catch (error) {
    logger.error('[PRE-BREAKOUT] Detection failed:', error);
    return [];
  }
}

export { SURGE_WATCH_UNIVERSE };
