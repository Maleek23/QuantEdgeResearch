/**
 * SECTOR PEERS — the names a trader checks before believing a single ticker.
 *
 * Operator, 2026-09-29: "When you suggest a stock you need to look at the other
 * stocks in the sector as a proxy." A long in MU means little if STX, WDC and
 * SNDK are all red; it means a lot more if the whole storage complex is bid.
 *
 * Each group lists its members in rough order of closeness (business mix,
 * customers, how they trade together), plus the ETF that best represents the
 * group's tape. A symbol's peers are the other members of its PRIMARY group —
 * the first group that lists it, unless PRIMARY_GROUP overrides that (MU sits
 * in both memory/storage and compute semis; memory is the tighter read).
 *
 * This is a closeness map for confirmation, not a sector taxonomy — it may
 * disagree with SECTOR_MAP in shared/approved-tickers.ts, and that is fine.
 * Unknown symbols return null and the caller falls back to the sector-ETF read.
 */

export interface PeerGroup {
  id: string;
  /** Plain-English group name used in the why-line ("storage peers"). */
  label: string;
  /** ETF whose tape represents the group; null when the group IS the benchmark set. */
  etf: string | null;
  /** Members in order of closeness. */
  members: readonly string[];
}

export const PEER_GROUPS: readonly PeerGroup[] = [
  // ── Semiconductors ──
  { id: 'memory_storage', label: 'memory/storage', etf: 'SMH', members: ['MU', 'SNDK', 'WDC', 'STX', 'NTAP', 'PSTG'] },
  { id: 'compute_semis', label: 'compute-semis', etf: 'SMH', members: ['NVDA', 'AMD', 'AVGO', 'MRVL', 'ARM', 'TSM', 'QCOM', 'INTC', 'MU'] },
  { id: 'semi_equipment', label: 'chip-equipment', etf: 'SMH', members: ['AMAT', 'LRCX', 'KLAC', 'ASML', 'TER', 'ONTO', 'MKSI', 'ENTG', 'ACLS', 'AEHR', 'COHU', 'AXTI'] },
  { id: 'analog_rf', label: 'analog/RF chip', etf: 'SMH', members: ['TXN', 'ADI', 'MCHP', 'NXPI', 'ON', 'MPWR', 'ALGM', 'SWKS', 'QRVO', 'SMTC', 'RMBS', 'TSEM', 'AMBA'] },
  { id: 'optical_networking', label: 'optical/networking', etf: 'SMH', members: ['COHR', 'LITE', 'AAOI', 'FN', 'CIEN', 'CRDO', 'ANET', 'ALAB', 'GLW', 'OLED'] },

  // ── Compute / data-centre build-out ──
  { id: 'ai_servers_cloud', label: 'AI server/cloud', etf: 'SMH', members: ['SMCI', 'DELL', 'HPE', 'CRWV', 'NBIS', 'APLD', 'IREN'] },
  { id: 'datacenter_power', label: 'data-centre power', etf: 'XLI', members: ['VRT', 'ETN', 'PWR', 'GEV', 'APH', 'CEG', 'VST'] },

  // ── Mega-cap / software ──
  { id: 'mega_tech', label: 'mega-cap tech', etf: 'XLK', members: ['AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN', 'NFLX', 'ORCL', 'TSLA'] },
  { id: 'enterprise_software', label: 'software', etf: 'IGV', members: ['CRM', 'NOW', 'ADBE', 'WDAY', 'ORCL', 'SAP', 'HUBS', 'IBM', 'INTA'] },
  { id: 'data_cloud_software', label: 'cloud-software', etf: 'IGV', members: ['SNOW', 'DDOG', 'MDB', 'NET', 'ESTC', 'PATH', 'FSLY', 'GTLB'] },
  { id: 'ai_software', label: 'AI-software', etf: 'IGV', members: ['PLTR', 'APP', 'SOUN', 'BBAI', 'PATH'] },
  { id: 'cybersecurity', label: 'cybersecurity', etf: 'IGV', members: ['CRWD', 'PANW', 'ZS', 'FTNT', 'NET', 'S', 'OKTA'] },
  { id: 'consumer_internet', label: 'consumer-internet', etf: 'XLY', members: ['SHOP', 'UBER', 'ABNB', 'DKNG', 'DUOL', 'RBLX', 'CHWY'] },

  // ── Financials ──
  { id: 'banks', label: 'bank', etf: 'XLF', members: ['JPM', 'BAC', 'WFC', 'C', 'GS', 'MS', 'SCHW'] },
  { id: 'payments_exchanges', label: 'payments/exchange', etf: 'XLF', members: ['V', 'MA', 'AXP', 'PYPL', 'CPAY', 'CME', 'ICE'] },
  { id: 'fintech', label: 'fintech', etf: 'XLF', members: ['SOFI', 'AFRM', 'UPST', 'HOOD', 'BILL', 'COIN', 'CRCL', 'OPEN'] },

  // ── Crypto complex (the benchmark is bitcoin itself) ──
  { id: 'btc_proxies', label: 'bitcoin-proxy', etf: 'IBIT', members: ['MARA', 'RIOT', 'CLSK', 'MSTR', 'COIN', 'IREN', 'WULF', 'CIFR', 'HUT', 'BTBT', 'BMNR', 'ASST'] },

  // ── Energy ──
  { id: 'nuclear_uranium', label: 'nuclear/uranium', etf: 'URA', members: ['OKLO', 'SMR', 'NNE', 'LEU', 'CCJ', 'UEC', 'BWXT', 'CEG'] },
  { id: 'fuel_cells_clean', label: 'fuel-cell/clean-energy', etf: 'ICLN', members: ['BE', 'PLUG', 'FCEL', 'BLDP', 'ENPH', 'FSLR'] },
  { id: 'oil_producers', label: 'oil-producer', etf: 'XLE', members: ['XOM', 'CVX', 'COP', 'OXY', 'EOG', 'FANG', 'DVN', 'SLB', 'HAL'] },
  { id: 'refiners', label: 'refiner', etf: 'XLE', members: ['VLO', 'MPC', 'PSX'] },

  // ── Materials / metals ──
  { id: 'gold_silver', label: 'gold/silver-miner', etf: 'GDX', members: ['NEM', 'AEM', 'GOLD', 'AG', 'CDE', 'HL', 'GDXJ', 'SLV', 'GLD'] },
  { id: 'copper_rare_earths', label: 'copper/rare-earth', etf: 'XME', members: ['FCX', 'SCCO', 'COPX', 'MP', 'ALB', 'LAC', 'REMX'] },

  // ── Space / defense / quantum ──
  { id: 'space', label: 'space', etf: 'ARKX', members: ['RKLB', 'ASTS', 'LUNR', 'SATL', 'GSAT', 'RDW'] },
  { id: 'defense', label: 'defense', etf: 'ITA', members: ['LMT', 'NOC', 'GD', 'RTX', 'KTOS', 'LHX'] },
  { id: 'quantum', label: 'quantum', etf: 'QTUM', members: ['IONQ', 'RGTI', 'QBTS', 'QUBT', 'ARQQ'] },
  { id: 'drones_evtol', label: 'drone/eVTOL', etf: 'ARKX', members: ['JOBY', 'ACHR', 'RCAT', 'KTOS', 'SERV'] },
  { id: 'ev', label: 'EV', etf: 'XLY', members: ['TSLA', 'RIVN', 'LCID', 'NIO'] },

  // ── Health ──
  { id: 'pharma', label: 'pharma', etf: 'XLV', members: ['LLY', 'NVO', 'MRK', 'ABBV', 'PFE', 'BMY', 'AMGN', 'GILD', 'JNJ', 'NVS'] },
  { id: 'managed_care', label: 'managed-care', etf: 'XLV', members: ['UNH', 'CVS', 'ELV', 'CI', 'HUM', 'HCA'] },
  { id: 'medtech_tools', label: 'medtech/tools', etf: 'XLV', members: ['ISRG', 'MDT', 'ABT', 'TMO', 'DHR'] },
  { id: 'biotech', label: 'biotech', etf: 'XBI', members: ['VRTX', 'REGN', 'MRNA', 'RXRX', 'HIMS'] },

  // ── Consumer ──
  { id: 'big_box', label: 'big-box retail', etf: 'XLP', members: ['WMT', 'COST', 'TGT', 'BBY'] },
  { id: 'home_improvement', label: 'home-improvement', etf: 'XLY', members: ['HD', 'LOW'] },
  { id: 'consumer_brands', label: 'consumer-brand', etf: 'XLY', members: ['NKE', 'SBUX', 'DIS', 'BROS'] },

  // ── Index complex (each index's peers are the other indices) ──
  { id: 'us_indices', label: 'index', etf: null, members: ['SPY', 'QQQ', 'IWM', 'DIA'] },
];

/** Where the first-listed group is not the tightest read. */
export const PRIMARY_GROUP: Readonly<Record<string, string>> = {
  MU: 'memory_storage',
  TSLA: 'mega_tech',
  ORCL: 'mega_tech',
  CEG: 'datacenter_power',
  IREN: 'btc_proxies',
  COIN: 'btc_proxies',
  KTOS: 'defense',
  NET: 'data_cloud_software',
  PATH: 'data_cloud_software',
};

const GROUP_BY_ID = new Map(PEER_GROUPS.map((g) => [g.id, g]));

export interface PeerSet {
  group: PeerGroup;
  /** Closest peers, the symbol itself excluded. */
  peers: string[];
}

/** The symbol's closest peers (default up to 5) and its group ETF, or null if unmapped. */
export function getPeerSet(symbol: string, maxPeers = 5): PeerSet | null {
  const s = String(symbol ?? '').toUpperCase();
  if (!s) return null;
  const override = PRIMARY_GROUP[s];
  const group = (override ? GROUP_BY_ID.get(override) : undefined)
    ?? PEER_GROUPS.find((g) => g.members.includes(s));
  if (!group) return null;
  const peers = group.members.filter((m) => m !== s && m !== group.etf).slice(0, Math.max(0, maxPeers));
  if (peers.length === 0) return null;
  return { group, peers };
}
