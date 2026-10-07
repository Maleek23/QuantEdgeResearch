/**
 * The Quant Bot's feeds — ONE query each, shared by every surface.
 *
 * WHY (2026-09-29): /api/quant-bot/status was read under two different query
 * keys (the BOT board and the cockpit signal grid), each polling on its own
 * clock, against an endpoint that re-priced the whole book on every read
 * (2–33 s on prod). Overlapping slow reads stacked up and the operator's IP hit
 * the API rate limiter (429s on /quant-bot/status). Now:
 *   • one key, one request, however many components read it;
 *   • 60 s interval — the server re-prices at most once a minute anyway;
 *   • paused while the tab is hidden, no refetch-on-focus stampede;
 *   • a 429 is never retried (retrying a rate limit makes it worse).
 *
 * The bot's RECORD comes from the journal's own query (journalTradesQuery('bot'))
 * — the same rows and the same metrics.ts the journal's Bot book uses.
 */
import { useQuery } from '@tanstack/react-query';
import { journalTradesQuery } from '@/lib/journal/use-journal';

export const QUANT_BOT_STATUS_KEY = ['/api/quant-bot/status'] as const;

export interface BotPositionView {
  id: string; symbol: string; assetType?: string; optionType?: string | null; direction?: string;
  strikePrice?: number | null; expiryDate?: string | null;
  entryPrice: number; currentPrice?: number | null; quantity?: number;
  targetPrice?: number | null; stopLoss?: number | null;
  useTrailingStop?: boolean; trailingStopPercent?: number | null;
  /** null = never marked (unknown), not zero. */
  unrealizedPnL?: number | null; unrealizedPnLPercent?: number | null;
  entryTime?: string; lastPriceUpdate?: string | null;
  exitPrice?: number | null; exitTime?: string | null; exitReason?: string | null;
  realizedPnL?: number | null;
  runId?: string; runLabel?: string;
  markAgeMin?: number | null; unmarked?: boolean;
}

export interface BotRunStatusView {
  id: string; name: string; displayName: string; runNo: number; label: string; short: string;
  start: string | null; end: string | null; active: boolean; startingCapital: number;
  cashBalance: number; positionsValue: number; totalValue: number; storedTotalValue: number;
  realizedPnL: number; unrealizedPnL: number | null; closed: number; open: number; unmarked: number; oldestMarkAt: string | null;
}

export interface QuantBotStatus {
  portfolioId?: string; name?: string; label?: string;
  startingCapital?: number; cashBalance?: number; totalValue?: number;
  totalPnL?: number; totalPnLPercent?: number; closedCount?: number;
  openPositions?: BotPositionView[];
  closedPositions?: BotPositionView[];
  runs?: BotRunStatusView[];
  config?: { minConviction?: number; maxOpen?: number; riskPerTradePct?: number; maxProgressPct?: number };
  repricedAt?: string | null;
  lastCycle?: {
    at: string; origin: string; opened: number; closed: number; skipped: number; openCount: number; error?: string;
    pid?: number; role?: string;
    /** Why candidates were refused that cycle (server/quant-bot.ts SkipTally). */
    skipSummary?: {
      total: number;
      byReason: Record<string, number>;
      bySleeve: Record<string, Record<string, number>>;
      top: Array<{ symbol: string; sleeve: string; code: string; reason: string }>;
      capacity?: Record<string, { held: number; max: number }>;
    };
    openedList?: Array<{ symbol: string; reason: string }>;
  } | null;
  /** Two sleeves, separate capacity (shared/bot-sleeves.ts). */
  sleeves?: Record<'0dte' | 'swing', { held: number; max: number; [k: string]: unknown }>;
}

class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

export function useQuantBotStatus(enabled = true) {
  return useQuery<QuantBotStatus>({
    queryKey: QUANT_BOT_STATUS_KEY,
    queryFn: async () => {
      const r = await fetch('/api/quant-bot/status', { credentials: 'include' });
      if (!r.ok) throw new HttpError(r.status, `The bot status request failed (HTTP ${r.status}).`);
      return r.json();
    },
    enabled,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    staleTime: 55_000,
    retry: (n, err) => n < 1 && !(err instanceof HttpError && err.status === 429),
  });
}

/** The bot's record: the journal's Bot-book rows (every run), same key as the journal. */
export function useBotLedger(enabled = true) {
  return useQuery({
    ...journalTradesQuery('bot'),
    enabled,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
    staleTime: 60_000,
  });
}
