/**
 * Shared Approved Tickers
 * =======================
 * Single source of truth for the watchlist gate.
 * Import this everywhere instead of inline copies.
 */

// MEGA-CAP TIER — FAANG + mega-cap tech the platform must always cover.
// These are the names the broader market reacts to; even if user doesn't
// trade them daily, scanners need them for breadth, regime, and GEX context.
// NOTE: NVDA is intentionally excluded (proven 0% WR per user backtest).
export const MEGA_CAP_TIER = [
  'AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN',
] as const;

// S-Tier: highest conviction, best backtested results
export const S_TIER = [
  'AAOI', 'CRCL', 'OKLO', 'LUNR', 'KLAC', 'SMTC',
  'AEHR', 'OLED', 'RMBS', 'BILL', 'INTA', 'MKSI',
] as const;

// A-Tier: strong results, proven setups
export const A_TIER = [
  'LRCX', 'AFRM', 'WDC', 'MU', 'AMD', 'TSEM', 'COIN', 'ARM',
  'HIMS', 'ONTO', 'ENTG', 'UPST', 'DUOL', 'PATH', 'MDB',
  'AMBA', 'COHU', 'SNOW', 'NET', 'FRSH', 'ESTC', 'ACLS', 'ASAN',
  'SOFI', 'DDOG', 'DELL', 'SHOP', 'DKNG', 'MARA', 'BROS',
  'LITE', 'FN', 'CIEN', 'AXTI', 'NBIS', 'TSLA', 'AVGO', 'NFLX',
  'COHR', 'ALGM',
] as const;

// Index ETFs
export const INDEX_TICKERS = ['SPY', 'QQQ', 'IWM', 'XSP', 'DIA'] as const;

// Crypto
export const CRYPTO_TICKERS = ['BTC', 'ETH', 'SOL', 'DOGE'] as const;

// Secondary (allowed but not prioritized)
export const SECONDARY = [
  'CLSK', 'RKLB', 'ASTS', 'PLTR', 'SMCI', 'SMH', 'XLK',
  // Added for 25-ticker watchlist backtest coverage
  'EWY', 'SOXX', 'CRWV', 'MRVL', 'APP', 'ORCL', 'SNDK', 'FSLY',
  // User's "Big Watch This Week" additions
  'SATL',
  // Defensive / health (LLY is on user's tier-work list)
  'LLY',
] as const;

// SMALL ACCOUNT TIER — cheap, high-vol, catalyst-driven names where
// 100%-200% premium runs actually happen on weekly options. Built for
// $300-$1K accounts where mega-cap weeklies are too expensive.
//
// Selection criteria:
//   - Stock price typically $3-$60 (so weekly premiums are $0.10-$1.50)
//   - 30d realized vol > 60% (room for 100%+ premium pops)
//   - Has weekly option chains (not monthlies-only)
//   - Catalyst-driven: earnings, AI/quantum/crypto/EV/space news
//
// Already in S_TIER/A_TIER/SECONDARY (just listing them for reference):
//   FSLY · OKLO · LUNR · CLSK · RKLB · ASTS · MARA · SOFI · AFRM · HIMS · COIN
//
// New names added below:
export const SMALL_ACCOUNT_TIER = [
  // AI / quantum (cheap, news-driven, regular 50-200% pops)
  'SOUN', 'IONQ', 'RGTI', 'BBAI', 'QBTS',
  // Crypto miners (BTC beta, weekly weeklies under $0.50)
  'RIOT', 'WULF', 'BTBT', 'IREN',
  // EV / mobility (catalyst-rich, cheap)
  'NIO', 'RIVN', 'LCID', 'JOBY', 'ACHR',
  // Nuclear / energy (small modular reactor theme)
  'SMR', 'NNE', 'BWXT',
  // Fintech / consumer (sub-$50, weekly liquidity)
  'HOOD', 'OPEN', 'CHWY', 'PTON',
  // Meme / high-vol catalyst names
  'BB', 'GME', 'AMC',
] as const;

// All approved tickers combined
export const APPROVED_TICKERS: Set<string> = new Set<string>([
  ...MEGA_CAP_TIER,
  ...S_TIER, ...A_TIER, ...INDEX_TICKERS, ...CRYPTO_TICKERS, ...SECONDARY,
  ...SMALL_ACCOUNT_TIER,
]);

// Skip list: proven money losers
export const SKIP_TICKERS: Set<string> = new Set<string>([
  'AI', 'GLBE', 'TOST', 'CYBR', 'MNDY', 'GRAB', 'SE',
]);

/**
 * Return all approved symbols as an array (for scanner universe merging).
 */
export function getAllApprovedSymbols(): string[] {
  return Array.from(APPROVED_TICKERS);
}

/**
 * Check if a ticker is on the approved watchlist
 */
export function isApprovedTicker(symbol: string): boolean {
  return APPROVED_TICKERS.has(symbol.toUpperCase());
}

/**
 * Check if a ticker is on the skip list
 */
export function isSkipTicker(symbol: string): boolean {
  return SKIP_TICKERS.has(symbol.toUpperCase());
}

/**
 * Get tier for a ticker
 */
export function getTier(symbol: string): 'MEGA' | 'S' | 'A' | 'INDEX' | 'SECONDARY' | null {
  const s = symbol.toUpperCase();
  if ((MEGA_CAP_TIER as readonly string[]).includes(s)) return 'MEGA';
  if ((S_TIER as readonly string[]).includes(s)) return 'S';
  if ((A_TIER as readonly string[]).includes(s)) return 'A';
  if ((INDEX_TICKERS as readonly string[]).includes(s)) return 'INDEX';
  if ((SECONDARY as readonly string[]).includes(s)) return 'SECONDARY';
  return null;
}

// ─────────────────────────────────────────────────────────────
// Sector map — used by GEX Hub for sector aggregation
// Source: backtested watchlist groupings in user memory
// ─────────────────────────────────────────────────────────────
export type Sector =
  | 'semi_equipment'
  | 'optics'
  | 'chips'
  | 'fintech'
  | 'software'
  | 'space'
  | 'energy'
  | 'crypto'
  | 'index'
  | 'mega_tech'
  | 'other';

export const SECTOR_MAP: Record<string, Sector> = {
  // Semi equipment
  AEHR: 'semi_equipment', KLAC: 'semi_equipment', LRCX: 'semi_equipment',
  MKSI: 'semi_equipment', ACLS: 'semi_equipment', ONTO: 'semi_equipment',
  ENTG: 'semi_equipment', COHU: 'semi_equipment', AXTI: 'semi_equipment',

  // Optics / photonics
  AAOI: 'optics', COHR: 'optics', OLED: 'optics', AMBA: 'optics',
  LITE: 'optics', FN: 'optics', CIEN: 'optics',

  // Memory / chips / silicon
  MU: 'chips', RMBS: 'chips', AMD: 'chips', TSEM: 'chips', ARM: 'chips',
  SMTC: 'chips', WDC: 'chips', ALGM: 'chips',

  // Mega-cap tech (MEGA_CAP_TIER + the rest of the cohort)
  AAPL: 'mega_tech', MSFT: 'mega_tech', GOOGL: 'mega_tech',
  META: 'mega_tech', AMZN: 'mega_tech',
  TSLA: 'mega_tech', AVGO: 'mega_tech', NFLX: 'mega_tech',
  NBIS: 'mega_tech', SMCI: 'mega_tech', DELL: 'mega_tech', PLTR: 'mega_tech',

  // Fintech
  BILL: 'fintech', AFRM: 'fintech', SOFI: 'fintech', UPST: 'fintech',
  COIN: 'fintech', HIMS: 'fintech',

  // Software / SaaS
  SNOW: 'software', NET: 'software', MDB: 'software', DDOG: 'software',
  PATH: 'software', ESTC: 'software', DUOL: 'software', FRSH: 'software',
  ASAN: 'software', SHOP: 'software', INTA: 'software', DKNG: 'software',
  CRCL: 'software', BROS: 'software',

  // Space / nuclear
  LUNR: 'space', OKLO: 'space', RKLB: 'space', ASTS: 'space',
  CLSK: 'space',

  // Energy / mining
  MARA: 'energy',

  // Index ETFs
  SPY: 'index', QQQ: 'index', IWM: 'index', XSP: 'index', DIA: 'index',
  SMH: 'index', XLK: 'index', SOXX: 'index', EWY: 'index',

  // Newly added secondaries
  CRWV: 'mega_tech', MRVL: 'chips', APP: 'software',
  ORCL: 'mega_tech', SNDK: 'chips', FSLY: 'software',
  SATL: 'space', LLY: 'other',

  // SMALL ACCOUNT TIER — cheap volatile names
  SOUN: 'software', IONQ: 'software', RGTI: 'software',
  BBAI: 'software', QBTS: 'software',
  RIOT: 'crypto', WULF: 'crypto', BTBT: 'crypto', IREN: 'crypto',
  NIO: 'other', RIVN: 'other', LCID: 'other',
  JOBY: 'space', ACHR: 'space',
  SMR: 'energy', NNE: 'energy', BWXT: 'energy',
  HOOD: 'fintech', OPEN: 'fintech',
  CHWY: 'other', PTON: 'other',
  BB: 'other', GME: 'other', AMC: 'other',

  // Crypto
  BTC: 'crypto', ETH: 'crypto', SOL: 'crypto', DOGE: 'crypto',
};

export function getSector(symbol: string): Sector {
  return SECTOR_MAP[symbol.toUpperCase()] || 'other';
}

export const SECTOR_LABELS: Record<Sector, string> = {
  semi_equipment: 'Semi Equipment',
  optics: 'Optics / Photonics',
  chips: 'Memory / Chips',
  fintech: 'Fintech',
  software: 'Software',
  space: 'Space / Nuclear',
  energy: 'Energy',
  crypto: 'Crypto',
  index: 'Index ETFs',
  mega_tech: 'Mega-Cap Tech',
  other: 'Other',
};
