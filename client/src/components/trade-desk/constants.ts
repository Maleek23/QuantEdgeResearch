/**
 * Trade Desk Constants
 * ====================
 * Tier mappings, source colors, timeframe config.
 * Source of truth: STRATEGY_INSIGHTS.md watchlist (Apr 4, 2026)
 */

// Watchlist tiers — from backtested TradingView v15 strategy
export const WATCHLIST_TIERS: Record<string, 'S' | 'A' | 'INDEX' | 'NEW'> = {
  // S-Tier (highest conviction, best backtested results)
  AAOI: 'S', INTA: 'S', LUNR: 'S', CRCL: 'S', KLAC: 'S', OKLO: 'S',
  AEHR: 'S', SMTC: 'S', HIMS: 'S', AFRM: 'S', OLED: 'S', RMBS: 'S',
  BILL: 'S', MKSI: 'S',

  // A-Tier (strong results, proven setups)
  WDC: 'A', LRCX: 'A', AMD: 'A', MU: 'A', BROS: 'A', SOFI: 'A',
  TSEM: 'A', COIN: 'A', MARA: 'A', DDOG: 'A', DELL: 'A', ENTG: 'A',
  SHOP: 'A', DKNG: 'A', UPST: 'A', ARM: 'A', ONTO: 'A', COHU: 'A',
  DUOL: 'A', PATH: 'A', MDB: 'A', AMBA: 'A', SNOW: 'A', NET: 'A',
  FRSH: 'A', ESTC: 'A', ACLS: 'A', ASAN: 'A',

  // Index ETFs
  SPY: 'INDEX', QQQ: 'INDEX', IWM: 'INDEX', XSP: 'INDEX',

  // New finds (optics/photonics sector)
  ALGM: 'NEW', COHR: 'NEW',
};

export const ALL_WATCHLIST_SYMBOLS = Object.keys(WATCHLIST_TIERS);

export function getTier(symbol: string): 'S' | 'A' | 'INDEX' | 'NEW' | null {
  return WATCHLIST_TIERS[symbol.toUpperCase()] || null;
}

export function getTierLabel(tier: 'S' | 'A' | 'INDEX' | 'NEW'): string {
  switch (tier) {
    case 'S': return 'S-Tier';
    case 'A': return 'A-Tier';
    case 'INDEX': return 'Index';
    case 'NEW': return 'New Find';
  }
}

// Source display config
export const SOURCE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  tradingview: { label: 'TV', color: 'text-purple-400', bg: 'bg-purple-500/15', border: 'border-purple-500/30' },
  ai: { label: 'AI', color: 'text-blue-400', bg: 'bg-blue-500/15', border: 'border-blue-500/30' },
  flow: { label: 'FLOW', color: 'text-cyan-400', bg: 'bg-cyan-500/15', border: 'border-cyan-500/30' },
  quant: { label: 'QUANT', color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30' },
  lotto: { label: 'LOTTO', color: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/30' },
  manual: { label: 'MANUAL', color: 'text-slate-400', bg: 'bg-slate-500/15', border: 'border-slate-500/30' },
};

export function getSourceConfig(source: string) {
  return SOURCE_CONFIG[source] || SOURCE_CONFIG.quant;
}

// Timeframe classification
export type Timeframe = '0dte' | 'weekly' | 'swing' | 'all';

export function classifyTimeframe(idea: { expiryDate?: string | null; holdingPeriod?: string | null }): Timeframe {
  const expiry = idea.expiryDate;
  if (!expiry) {
    return idea.holdingPeriod === 'day' ? '0dte' : 'swing';
  }
  const dte = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
  if (dte <= 0) return '0dte';
  if (dte <= 7) return 'weekly';
  return 'swing';
}

export const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  '0dte': '0DTE',
  weekly: 'Weekly',
  swing: 'Swing',
  all: 'All',
};
