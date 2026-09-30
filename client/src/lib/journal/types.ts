/**
 * Journal wire types — the shapes /api/journal/* returns.
 * (Moved out of pages/trade-journal.tsx so every journal surface shares them.)
 */

export interface JournalTradeRow {
  id: string;
  symbol: string;
  assetType: string;
  direction: string;
  optionType?: string | null;
  strikePrice?: number | null;
  expiryDate?: string | null;
  quantity: number;
  entryPrice: number;
  exitPrice?: number | null;
  fees?: number | null;
  entryTime: string;
  exitTime?: string | null;
  holdingMinutes?: number | null;
  realizedPnL?: number | null;
  realizedPnLPercent?: number | null;
  grossPnL?: number | null;
  status: string;
  outcome?: string | null;
  notes?: string | null;
  emotion?: string | null;
  setupType?: string | null;
  mistakeTag?: string | null;
  rating?: number | null;
  screenshot?: string | null;
  broker: string;
  /** Bot book only: the run (paper portfolio) this fill belongs to — see shared/bot-runs.ts. */
  runId?: string | null;
  runLabel?: string | null;
  /** Open bot rows: last mark + its time. Absent = never marked (P&L unknown, not 0). */
  mark?: { price: number; asOf: string; unrealizedPnL: number } | null;
  importBatchId?: string | null;
  /** Client-derived: an option with no closing fill, settled by the expiry rule — at intrinsic by the server, or $0 unverified (shared/journal-expiry.ts). */
  expiredAssumed?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface TimingInsight {
  label: string;
  trades: number;
  winRate: number;
  avgPnL: number;
  grade: 'hot' | 'warm' | 'neutral' | 'cold';
}

export interface BehaviorInsight {
  id: string;
  category: string;
  severity: 'positive' | 'neutral' | 'warning' | 'critical';
  title: string;
  description: string;
  metric?: string;
  suggestion?: string;
  icon: string;
}

export interface DTEBreakdown {
  label: string;
  trades: number;
  wins: number;
  winRate: number;
  totalPnL: number;
  avgPnL: number;
}

export interface TradeCountBucket {
  label: string;
  days: number;
  avgPnL: number;
  totalPnL: number;
  winRate: number;
}

export interface EmotionAnalysis {
  emotion: string;
  trades: number;
  winRate: number;
  avgPnL: number;
  totalPnL: number;
}

/** The subset of /api/journal/analytics the journal renders (KPIs are computed client-side from rows). */
export interface JournalAnalytics {
  timingByHour: TimingInsight[];
  timingByDay: TimingInsight[];
  timingBySession: TimingInsight[];
  insights: BehaviorInsight[];
  dteBreakdown: DTEBreakdown[];
  tradeCountOptimum: TradeCountBucket[];
  emotionAnalysis: EmotionAnalysis[];
}

export const EMOTIONS = [
  { value: 'confident', label: 'Confident' },
  { value: 'disciplined', label: 'Disciplined' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'fearful', label: 'Fearful' },
  { value: 'fomo', label: 'FOMO' },
  { value: 'greedy', label: 'Greedy' },
  { value: 'revenge', label: 'Revenge' },
] as const;

export const BROKERS = [
  { value: '', label: 'Auto-detect' },
  { value: 'webull', label: 'Webull' },
  { value: 'robinhood', label: 'Robinhood' },
  { value: 'schwab', label: 'Schwab' },
  { value: 'ibkr', label: 'Interactive Brokers' },
  { value: 'tastytrade', label: 'tastytrade' },
  { value: 'tda', label: 'TD Ameritrade' },
  { value: 'fidelity', label: 'Fidelity' },
  { value: 'etrade', label: 'E*TRADE' },
] as const;

/** A journal note (GET /api/journal/notes) — analysis or commentary that isn't a trade leg. */
export interface JournalNoteRow {
  id: string;
  ownerId: string;
  symbols: string[] | null;
  /** New York trading day, YYYY-MM-DD. */
  day: string;
  postedAt: string;
  body: string;
  attachments: { url: string; name: string; isImage: boolean }[] | null;
  source: string;
  sourceMessageId: string | null;
  /** analysis | unmatched_exit | unpriced_exit | entry_without_price | discord_post | manual kinds */
  reason: string | null;
  /** Import metadata — Discord forum posts: shared/discord-forum.ts DiscordPostMeta. */
  meta?: import('@shared/discord-forum').DiscordPostMeta | Record<string, unknown> | null;
}
