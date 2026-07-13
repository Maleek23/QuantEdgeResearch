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

  // ── Expanded coverage (Apr 2026) ──────────────────────────
  // Cybersecurity
  'CRWD', 'PANW', 'ZS', 'FTNT',
  // Enterprise SaaS (gap fills)
  'CRM', 'ADBE', 'NOW', 'WDAY', 'HUBS', 'IBM',
  // AI Infrastructure
  'CRDO', 'VRT', 'ANET',
  // Chips expansion
  'INTC', 'QCOM', 'ON',
  // Index ETFs expansion
  'IGV', 'XBI', 'ARKK',
  // Defense / Aerospace
  'KTOS', 'LMT',
  // Nuclear / Energy renaissance
  'CEG', 'VST',
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

  // ── Emerging gems (Apr 2026) ──────────────────────────────
  // Uranium / nuclear fuel (supply squeeze + SMR demand)
  'LEU', 'CCJ', 'UEC',
  // AI data center infrastructure (power + cooling + connectivity)
  'APLD', 'ALAB',
  // Drones / robotics (defense contracts, delivery, autonomy)
  'RCAT', 'SERV',
  // Satellite / connectivity (Apple partnership, Starlink competitor)
  'GSAT',
  // AI drug discovery / biotech catalyst
  'RXRX',
  // Quantum pure-plays (DARPA contracts, Google partnership buzz)
  'QUBT', 'ARQQ',
] as const;

// HEALTHCARE TIER — the rotation destination the platform was blind to.
// When money rotates OUT of chips/tech and INTO defensives (pharma, health
// insurers, med-devices), Hunt needs names to actually suggest. Before this,
// the universe was ~100% semis/tech, so a healthcare-rotation day produced
// zero healthcare ideas — Hunt just kept pushing the bleeding chips.
//
// Curated for liquidity + weekly option chains (the user explicitly named
// LLY, NVO, CVS). Larger-cap and pricier than the chip names, but these are
// where the money goes in a risk-off / rotation tape.
export const HEALTHCARE_TIER = [
  // Pharma
  'LLY', 'NVO', 'MRK', 'ABBV', 'PFE', 'AMGN', 'GILD', 'BMY',
  // Health insurers / providers
  'UNH', 'CVS', 'ELV', 'CI', 'HUM', 'HCA',
  // Med devices / diagnostics / life-science tools
  'ISRG', 'MDT', 'ABT', 'TMO', 'DHR',
  // Large-cap optionable biotech
  'VRTX', 'REGN', 'MRNA',
] as const;

// All approved tickers combined
export const APPROVED_TICKERS: Set<string> = new Set<string>([
  ...MEGA_CAP_TIER,
  ...S_TIER, ...A_TIER, ...INDEX_TICKERS, ...CRYPTO_TICKERS, ...SECONDARY,
  ...SMALL_ACCOUNT_TIER, ...HEALTHCARE_TIER,
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
export function getTier(symbol: string): 'MEGA' | 'S' | 'A' | 'INDEX' | 'SECONDARY' | 'SMALL' | null {
  const s = symbol.toUpperCase();
  if ((MEGA_CAP_TIER as readonly string[]).includes(s)) return 'MEGA';
  if ((S_TIER as readonly string[]).includes(s)) return 'S';
  if ((A_TIER as readonly string[]).includes(s)) return 'A';
  if ((INDEX_TICKERS as readonly string[]).includes(s)) return 'INDEX';
  if ((SECONDARY as readonly string[]).includes(s)) return 'SECONDARY';
  if ((SMALL_ACCOUNT_TIER as readonly string[]).includes(s)) return 'SMALL';
  // Healthcare names ride the SECONDARY tier for scoring (modest base bonus);
  // their conviction comes from sector rotation, not a user-validated edge tier.
  if ((HEALTHCARE_TIER as readonly string[]).includes(s)) return 'SECONDARY';
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
  | 'cybersecurity'
  | 'ai_infra'
  | 'space'
  | 'defense'
  | 'energy'
  | 'crypto'
  | 'index'
  | 'mega_tech'
  | 'quantum'
  | 'robotics'
  | 'biotech'
  | 'pharma'
  | 'healthcare'
  | 'ev_mobility'
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
  SATL: 'space',

  // Cybersecurity
  CRWD: 'cybersecurity', PANW: 'cybersecurity', ZS: 'cybersecurity', FTNT: 'cybersecurity',
  // Enterprise SaaS (gap fills)
  CRM: 'software', ADBE: 'software', NOW: 'software', WDAY: 'software', HUBS: 'software', IBM: 'software',
  // AI Infrastructure
  CRDO: 'ai_infra', VRT: 'ai_infra', ANET: 'ai_infra',
  // Chips expansion
  INTC: 'chips', QCOM: 'chips', ON: 'chips',
  // Index ETFs expansion
  IGV: 'index', XBI: 'index', ARKK: 'index',
  // Defense / Aerospace
  KTOS: 'defense', LMT: 'defense',
  // Nuclear / Energy renaissance
  CEG: 'energy', VST: 'energy',

  // SMALL ACCOUNT TIER — cheap volatile names
  SOUN: 'ai_infra', IONQ: 'quantum', RGTI: 'quantum',
  BBAI: 'ai_infra', QBTS: 'quantum',
  RIOT: 'crypto', WULF: 'crypto', BTBT: 'crypto', IREN: 'crypto',
  NIO: 'ev_mobility', RIVN: 'ev_mobility', LCID: 'ev_mobility',
  JOBY: 'ev_mobility', ACHR: 'ev_mobility',
  SMR: 'energy', NNE: 'energy', BWXT: 'energy',
  HOOD: 'fintech', OPEN: 'fintech',
  CHWY: 'other', PTON: 'other',
  BB: 'other', GME: 'other', AMC: 'other',

  // Emerging gems — uranium / nuclear fuel
  LEU: 'energy', CCJ: 'energy', UEC: 'energy',
  // AI data center infra
  APLD: 'ai_infra', ALAB: 'ai_infra',
  // Drones / robotics
  RCAT: 'robotics', SERV: 'robotics',
  // Satellite / connectivity
  GSAT: 'space',
  // Biotech catalyst
  RXRX: 'biotech',
  // Quantum pure-plays
  QUBT: 'quantum', ARQQ: 'quantum',

  // Crypto
  BTC: 'crypto', ETH: 'crypto', SOL: 'crypto', DOGE: 'crypto',

  // ── Healthcare rotation tier ──────────────────────────────
  // Pharma
  LLY: 'pharma', NVO: 'pharma', MRK: 'pharma', ABBV: 'pharma',
  PFE: 'pharma', AMGN: 'pharma', GILD: 'pharma', BMY: 'pharma',
  // Health insurers / providers / med-devices / tools
  UNH: 'healthcare', CVS: 'healthcare', ELV: 'healthcare', CI: 'healthcare',
  HUM: 'healthcare', HCA: 'healthcare', ISRG: 'healthcare', MDT: 'healthcare',
  ABT: 'healthcare', TMO: 'healthcare', DHR: 'healthcare',
  // Large-cap optionable biotech
  VRTX: 'biotech', REGN: 'biotech', MRNA: 'biotech',
};

export function getSector(symbol: string): Sector {
  return SECTOR_MAP[symbol.toUpperCase()] || 'other';
}

export const SECTOR_LABELS: Record<Sector, string> = {
  semi_equipment: 'Semi Equipment',
  optics: 'Optics / Photonics',
  chips: 'Memory / Chips',
  fintech: 'Fintech',
  software: 'Software / SaaS',
  cybersecurity: 'Cybersecurity',
  ai_infra: 'AI Infrastructure',
  space: 'Space / Aero',
  defense: 'Defense',
  energy: 'Energy / Nuclear',
  crypto: 'Crypto',
  index: 'Index ETFs',
  mega_tech: 'Mega-Cap Tech',
  quantum: 'Quantum Computing',
  robotics: 'Robotics / Drones',
  biotech: 'Biotech',
  pharma: 'Pharma',
  healthcare: 'Healthcare / Insurers',
  ev_mobility: 'EV / Mobility',
  other: 'Other',
};
