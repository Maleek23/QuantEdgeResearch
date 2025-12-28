/**
 * Sector Exposure Limits - Risk Management Compliance
 * 
 * Prevents over-concentration in any single sector.
 * Max 3 open positions per sector to ensure diversification.
 */

// Common stock-to-sector mapping (tech-focused since that's where concentration risk is highest)
const SECTOR_MAP: Record<string, string> = {
  // Magnificent 7 / Large Tech
  'AAPL': 'Technology',
  'MSFT': 'Technology',
  'GOOGL': 'Technology',
  'GOOG': 'Technology',
  'AMZN': 'Consumer Discretionary',
  'META': 'Technology',
  'NVDA': 'Technology',
  'TSLA': 'Consumer Discretionary',
  
  // Semiconductors
  'AMD': 'Technology',
  'INTC': 'Technology',
  'AVGO': 'Technology',
  'QCOM': 'Technology',
  'MU': 'Technology',
  'ARM': 'Technology',
  'MRVL': 'Technology',
  'TSM': 'Technology',
  'SMCI': 'Technology',
  'LRCX': 'Technology',
  'AMAT': 'Technology',
  'ASML': 'Technology',
  
  // Software/Cloud
  'CRM': 'Technology',
  'ORCL': 'Technology',
  'ADBE': 'Technology',
  'NOW': 'Technology',
  'SNOW': 'Technology',
  'PLTR': 'Technology',
  'NET': 'Technology',
  'DDOG': 'Technology',
  'ZS': 'Technology',
  'CRWD': 'Technology',
  'PANW': 'Technology',
  'OKTA': 'Technology',
  'SHOP': 'Technology',
  'SQ': 'Technology',
  'PYPL': 'Technology',
  
  // AI/Robotics
  'AI': 'Technology',
  'PATH': 'Technology',
  'SOUN': 'Technology',
  'IONQ': 'Technology',
  'RGTI': 'Technology',
  
  // Financials
  'JPM': 'Financials',
  'BAC': 'Financials',
  'WFC': 'Financials',
  'GS': 'Financials',
  'MS': 'Financials',
  'C': 'Financials',
  'AXP': 'Financials',
  'V': 'Financials',
  'MA': 'Financials',
  'BLK': 'Financials',
  'SCHW': 'Financials',
  'COF': 'Financials',
  
  // Healthcare/Pharma
  'UNH': 'Healthcare',
  'JNJ': 'Healthcare',
  'PFE': 'Healthcare',
  'ABBV': 'Healthcare',
  'MRK': 'Healthcare',
  'LLY': 'Healthcare',
  'TMO': 'Healthcare',
  'ABT': 'Healthcare',
  'BMY': 'Healthcare',
  'AMGN': 'Healthcare',
  'GILD': 'Healthcare',
  'MRNA': 'Healthcare',
  'BNTX': 'Healthcare',
  
  // Energy
  'XOM': 'Energy',
  'CVX': 'Energy',
  'COP': 'Energy',
  'SLB': 'Energy',
  'EOG': 'Energy',
  'OXY': 'Energy',
  'MPC': 'Energy',
  'VLO': 'Energy',
  'PSX': 'Energy',
  
  // Consumer
  'WMT': 'Consumer Staples',
  'COST': 'Consumer Staples',
  'PG': 'Consumer Staples',
  'KO': 'Consumer Staples',
  'PEP': 'Consumer Staples',
  'MCD': 'Consumer Discretionary',
  'SBUX': 'Consumer Discretionary',
  'NKE': 'Consumer Discretionary',
  'DIS': 'Consumer Discretionary',
  'HD': 'Consumer Discretionary',
  'LOW': 'Consumer Discretionary',
  'TGT': 'Consumer Discretionary',
  
  // Industrials
  'CAT': 'Industrials',
  'DE': 'Industrials',
  'BA': 'Industrials',
  'RTX': 'Industrials',
  'LMT': 'Industrials',
  'GE': 'Industrials',
  'HON': 'Industrials',
  'UPS': 'Industrials',
  'FDX': 'Industrials',
  
  // Real Estate
  'AMT': 'Real Estate',
  'PLD': 'Real Estate',
  'EQIX': 'Real Estate',
  'SPG': 'Real Estate',
  'O': 'Real Estate',
  
  // Utilities
  'NEE': 'Utilities',
  'DUK': 'Utilities',
  'SO': 'Utilities',
  'D': 'Utilities',
  
  // Materials
  'LIN': 'Materials',
  'APD': 'Materials',
  'ECL': 'Materials',
  'NEM': 'Materials',
  'FCX': 'Materials',
};

// Crypto is tracked separately
const CRYPTO_SYMBOLS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'DOT', 'MATIC', 'LINK', 'SHIB', 'UNI', 'PEPE'];

// Sector exposure limits
export const SECTOR_LIMITS = {
  'Technology': 3,        // Max 3 tech positions (high correlation risk)
  'Financials': 3,
  'Healthcare': 3,
  'Energy': 2,
  'Consumer Staples': 2,
  'Consumer Discretionary': 3,
  'Industrials': 2,
  'Real Estate': 2,
  'Utilities': 2,
  'Materials': 2,
  'Crypto': 2,            // Max 2 crypto positions (high volatility)
  'Unknown': 5,           // More lenient for unmapped symbols
};

export function getSector(symbol: string): string {
  const upperSymbol = symbol.toUpperCase();
  
  // Check if it's a crypto symbol
  if (CRYPTO_SYMBOLS.includes(upperSymbol) || 
      upperSymbol.endsWith('USD') || 
      upperSymbol.endsWith('USDT')) {
    return 'Crypto';
  }
  
  return SECTOR_MAP[upperSymbol] || 'Unknown';
}

export function getSectorLimit(sector: string): number {
  return SECTOR_LIMITS[sector as keyof typeof SECTOR_LIMITS] || SECTOR_LIMITS['Unknown'];
}

export interface SectorExposureCheck {
  allowed: boolean;
  sector: string;
  currentCount: number;
  limit: number;
  message?: string;
}

export function checkSectorExposure(
  newSymbol: string,
  openPositions: Array<{ symbol: string }>
): SectorExposureCheck {
  const newSector = getSector(newSymbol);
  const sectorLimit = getSectorLimit(newSector);
  
  // Count existing positions in the same sector
  const sectorCount = openPositions.filter(
    pos => getSector(pos.symbol) === newSector
  ).length;
  
  if (sectorCount >= sectorLimit) {
    return {
      allowed: false,
      sector: newSector,
      currentCount: sectorCount,
      limit: sectorLimit,
      message: `Sector limit reached: You already have ${sectorCount} ${newSector} position${sectorCount > 1 ? 's' : ''} (max ${sectorLimit}). Close an existing position first.`
    };
  }
  
  return {
    allowed: true,
    sector: newSector,
    currentCount: sectorCount,
    limit: sectorLimit
  };
}

export function getSectorExposureSummary(
  openPositions: Array<{ symbol: string }>
): Record<string, { count: number; limit: number; symbols: string[] }> {
  const summary: Record<string, { count: number; limit: number; symbols: string[] }> = {};
  
  for (const pos of openPositions) {
    const sector = getSector(pos.symbol);
    if (!summary[sector]) {
      summary[sector] = {
        count: 0,
        limit: getSectorLimit(sector),
        symbols: []
      };
    }
    summary[sector].count++;
    summary[sector].symbols.push(pos.symbol);
  }
  
  return summary;
}
