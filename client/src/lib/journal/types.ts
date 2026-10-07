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
  /** 'quantedge_idea' = taken from a NEXUS idea ("I took this"); 'own_idea' = the trader's own (docs/DESK_ADMINS.md). */
  origin?: 'own_idea' | 'quantedge_idea';
  /** Bot book only: the run (paper portfolio) this fill belongs to — see shared/bot-runs.ts. */
  runId?: string | null;
  runLabel?: string | null;
  /** Open bot rows: last mark + its time. Absent = never marked (P&L unknown, not 0). */
  mark?: { price: number; asOf: string; unrealizedPnL: number } | null;
  importBatchId?: string | null;
  /** Desk rows: a target/stop exit whose time is the tracker cycle, not the touch — "resolved at … ET (hit time unknown)". */
  exitTimeNote?: string | null;
  /** Desk rows, closed: realized ÷ best favourable underlying move (shared/exit-policy.ts captureRatio). */
  captureRatio?: number | null;
  /** Desk rows, stopped out: "stopped · later reached T1 at 11:42" — hindsight beside the loss (shared/after-stop.ts). */
  afterStop?: string | null;
  /** Option rows: "peak $5.45 at 10:12 · exit $4.22" — the contract's best price after entry (shared/option-peak.ts). */
  peakLine?: string | null;
  /** Budget contract beside the primary (shared/budget-contract.ts). */
  primaryLine?: string | null;
  budgetLine?: string | null;
  peakPremium?: number | null;
  /** 0DTE desk rows under the runner policy: "½ at T1 $4.22 · runner $5.10 (…) · blended $4.66". */
  runner?: string | null;
  /** NEXUS ideas rows: verified (bars) / checked (integrity) / unverified, with reasons (server/journal-row-maps.ts verifyDeskRows). */
  verification?: {
    status: 'verified' | 'checked' | 'unverified';
    basis: 'bars' | 'integrity';
    reasons: { code: string; detail: string }[];
    recordedPnL: number | null;
    recomputedPnL: number | null;
  };
  /** Bot options only: outcome has or lacks reconcilable fill/settlement evidence. */
  measurementStatus?: 'pending' | 'verified' | 'unverified' | 'not_applicable';
  measurementNote?: string | null;
  /** NEXUS ideas rows: published plan levels for equal-risk sizing; replay / peak / call fields (shared/desk-view.ts). */
  riskBasis?: import('@shared/desk-view').DeskRiskBasis | null;
  managed?: import('@shared/desk-view').DeskManaged | null;
  peak?: import('@shared/desk-view').DeskPeak | null;
  call?: import('@shared/desk-view').DeskCall | null;
  /** Client-derived (shared/desk-view.ts applyDeskView): risk sizing applied to this row, and which view priced it. */
  sizedAs?: import('@shared/desk-view').DeskSizedAs | null;
  viewedAs?: import('@shared/desk-view').DeskView;
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
