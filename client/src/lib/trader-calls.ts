/**
 * Trader calls — recent open calls from ranked traders (GET /api/trader-calls),
 * shown in NEXUS as a labelled EVIDENCE source ("Trader call · Femi · 2h ago")
 * with the message link. Never a signal the bot trades: nothing on the server
 * feeds these into bot confluence (shared/loss-rules.ts).
 *
 * The stated entry is what the post said at post time. The only "now" price is
 * the live underlying quote the server fetched for this response (source
 * stamped; a bars-derived quote is marked not live).
 */
import { useQuery } from '@tanstack/react-query';

export interface TraderCall {
  id: string;
  label: 'Trader call';
  trader: { slug: string; name: string; score: number | null; rank: number | null };
  symbol: string;
  assetType: string;
  direction: string;
  view: 'long' | 'short';
  optionType: string | null;
  strike: number | null;
  expiry: string | null;
  stated: { entry: number; stop: number | null; target: number | null; units: 'premium' | 'price' };
  postedAt: string;
  age: string;
  link: string | null;
  confidence: number | null;
  underlying: { price: number; changePct: number; source: string; live: boolean; asOf: string } | null;
  sinceCallPct: number | null;
}

export interface TraderCallsResponse {
  asOf: string;
  config: { minScore: number; minSample: number; maxAgeTradingDays: number; minConfidence: number };
  traders: { slug: string; name: string; score: number | null; rank: number | null; sample: number }[];
  calls: TraderCall[];
  note: string;
}

export const TRADER_CALLS_KEY = ['/api/trader-calls'] as const;

export function useTraderCalls() {
  return useQuery<TraderCallsResponse>({
    queryKey: TRADER_CALLS_KEY,
    queryFn: async () => {
      const r = await fetch('/api/trader-calls', { credentials: 'include' });
      if (!r.ok) throw new Error(`Trader calls request failed (${r.status})`);
      return r.json();
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
  });
}

/** Age from postedAt, recomputed on render (the server's `age` is as of its response). */
export function callAge(postedAt: string, now = Date.now()): string {
  const m = Math.round((now - Date.parse(postedAt)) / 60_000);
  if (!Number.isFinite(m) || m < 0) return 'time unknown';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}

export function callContract(c: Pick<TraderCall, 'symbol' | 'assetType' | 'optionType' | 'strike' | 'expiry' | 'direction'>): string {
  if (c.assetType === 'option') {
    const exp = c.expiry ? ` ${c.expiry.slice(5).replace('-', '/')}` : ' (expiry not stated)';
    return `${c.symbol} ${c.strike ?? '?'}${c.optionType === 'put' ? 'P' : 'C'}${exp}`;
  }
  return `${c.direction === 'short' ? 'short ' : ''}${c.symbol}`;
}

export function callsForSymbol(data: TraderCallsResponse | undefined, symbol: string): TraderCall[] {
  const s = symbol.toUpperCase();
  return (data?.calls ?? []).filter((c) => c.symbol === s);
}
