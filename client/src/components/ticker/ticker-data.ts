/**
 * TICKER PAGE DATA — every query the ticker page reads, each pointed at an
 * EXISTING endpoint (no calculation is forked here; docs/TICKER_PAGE.md §Data).
 *
 * One rule matters more than the rest: the page has exactly ONE price, the
 * canonical realtime quote (/api/quotes/batch → getRealtimeBatchQuotes, the
 * same function the convictions board, watchlist and breadth use). Daily bars
 * feed indicators only and never print a "price" of their own — that second
 * price ($78.18 "vs prior daily close" under a $79.18 header) was the bug.
 */
import { useQuery } from '@tanstack/react-query';
import { useChartLabDealer } from '@/components/charting/chart-lab-nexus';

export interface Bar { time: number; open: number; high: number; low: number; close: number; volume?: number }
export interface Quote { price: number; change: number; changePercent: number; volume: number; asOf: string | null; source: string | null; delayed: boolean }
export interface QuantinumLayer { kind: string; label: string; points: number; why: string; source: string }
export interface QuantinumDossier {
  symbol: string; asOf: string;
  layers: QuantinumLayer[]; unavailable: string[];
  bullPoints: number; bearPoints: number;
  lean: 'bullish' | 'bearish' | 'mixed' | 'quiet';
  confidence: number;
  shortGate: { open: boolean; why: string };
}
export interface Pick {
  symbol: string; direction?: string | null; tradeType?: string | null; holdingPeriod?: string | null;
  entryPrice?: number | null; stopLoss?: number | null; targetPrice?: number | null; riskRewardRatio?: number | null;
  publishedConvictionScore?: number | null; convictionScore?: number | null;
  publishedConvictionBand?: string | null; convictionBand?: string | null; thesis?: string | null;
  levelBasis?: string | null;
  layers?: { kind?: string; label?: string; points?: number; why?: string }[];
}
export interface LedgerRow {
  id: string; symbol: string; direction: string; signal: string; outcome: string; at: string;
  optionType?: string | null; strikePrice?: number | null; expiryDate?: string | null;
  optionPercentGain?: number | null; riskRewardRatio?: number | null; holdingPeriod?: string | null;
}
export interface EarningsEvent { date: string; session: 'pre' | 'post' | null; daysAway: number; epsForecast: number | null; companyName?: string }
export interface ReadThrough { sourceSymbol: string; linkType: 'peer' | 'bellwether'; theme: string | null; date: string; daysAway: number; session: 'pre' | 'post' | null; why: string }
export interface CatalystRow { id?: string; title?: string; description?: string; source?: string; sourceUrl?: string; timestamp?: string; eventType?: string; impact?: string }
export interface FlowTrade {
  id?: string; symbol: string; optionType?: string; strikePrice?: number | string; expirationDate?: string;
  volume?: number; openInterest?: number; volumeOIRatio?: number | string; premium?: number | string; totalPremium?: number | string;
  flowType?: string; detectedAt?: string;
}
export interface WeeklyPath { spotPrice: number; weekStart: string; weekEnd: string; expectedMove?: number; annualVol?: number; volSource?: string; cached?: boolean; cachedAt?: string }
export interface VolRead { currentIV: number; realizedVol20: number; ivVsRv: 'expensive' | 'cheap' | 'fair'; ivRvRatio: number; timestamp?: string }
export interface EconEvent { name: string; date: string; time?: string; importance?: string; description?: string }

export const INDEX_ETFS = new Set(['SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'IVV', 'TQQQ', 'SQQQ', 'SPX', 'NDX']);

export const getJson = <T,>(url: string) => async (): Promise<T> => {
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
};

/** The ONE quote. Same key as every other /r consumer so header + peers share cache. */
export function useQuotes(symbols: string[]) {
  const list = Array.from(new Set(symbols.map((s) => s.toUpperCase()))).filter(Boolean);
  return useQuery<Record<string, Quote>>({
    queryKey: ['/api/quotes/batch', list.join(',')],
    queryFn: async () => {
      const r = await fetch(`/api/quotes/batch/${list.join(',')}`, { credentials: 'include' });
      if (!r.ok) throw new Error('quote failed');
      const body = await r.json();
      const out: Record<string, Quote> = {};
      for (const [k, q] of Object.entries<any>(body?.quotes ?? {})) {
        out[k] = { price: q.price, change: q.change, changePercent: q.changePercent, volume: q.volume, asOf: q.asOf ?? null, source: q.source ?? null, delayed: q.delayed === true };
      }
      return out;
    },
    enabled: list.length > 0,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 1,
  });
}

export function useTickerData(symbol: string) {
  const sym = symbol.toUpperCase();
  const quote = useQuotes([sym]);
  const bars = useQuery<{ data?: Bar[] }>({ queryKey: ['/api/historical-prices', sym, '1y', 'ticker'], queryFn: getJson(`/api/historical-prices/${sym}?range=1y&interval=1d`), staleTime: 300_000, retry: 1 });
  const qtm = useQuery<QuantinumDossier>({ queryKey: ['/api/quantinum', sym], queryFn: getJson(`/api/quantinum/${sym}`), staleTime: 120_000, retry: 1 });
  const dealer = useChartLabDealer(sym);
  const week = useQuery<WeeklyPath>({ queryKey: ['/api/weekly-path', sym], queryFn: getJson(`/api/weekly-path/${sym}`), staleTime: 300_000, retry: 1 });
  // Same calendar Quantinum's earnings layer reads (server/earnings-calendar.ts,
  // Nasdaq) — one source for the date everywhere on the page.
  const earnings = useQuery<{ ownEarnings: EarningsEvent | null; readThroughs: ReadThrough[] }>({ queryKey: ['/api/ticker/read-throughs', sym], queryFn: getJson(`/api/ticker/${sym}/read-throughs`), staleTime: 1_800_000, retry: 1 });
  const conv = useQuery<{ picks?: Pick[]; generatedAt?: string }>({ queryKey: ['/api/convictions', 'symbol', sym], queryFn: getJson(`/api/convictions?symbol=${sym}`), staleTime: 120_000, retry: 1 });
  return { sym, quote, bars, qtm, dealer, week, earnings, conv };
}

/* ── pure math over the daily series (indicators only — never a price) ── */
export function rsi14(closes: number[]): number | null {
  if (closes.length < 15) return null;
  let gain = 0; let loss = 0;
  for (let i = closes.length - 14; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  if (gain + loss === 0) return 50;
  return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
}
export function atr14(bars: Bar[]): number | null {
  if (bars.length < 15) return null;
  let sum = 0;
  for (let i = bars.length - 14; i < bars.length; i++) {
    const prev = bars[i - 1].close;
    sum += Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - prev), Math.abs(bars[i].low - prev));
  }
  return sum / 14;
}

/* ── formatting ── */
export const num = (v: unknown): number | null => { const n = Number(v); return v != null && Number.isFinite(n) ? n : null; };
export function fmtPx(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v >= 1000 ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `$${v.toFixed(2)}`;
}
export function fmtPct(v: number | null | undefined, d = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}%`;
}
export function fmtBig(v: number | null | undefined, prefix = ''): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const s = a >= 1e9 ? `${(a / 1e9).toFixed(1)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(0)}K` : `${Math.round(a)}`;
  return `${v < 0 ? '−' : ''}${prefix}${s}`;
}
export function age(iso?: string | null): string {
  if (!iso) return 'age unknown';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (!Number.isFinite(s)) return 'age unknown';
  if (s < 60) return `${Math.max(0, Math.round(s))}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400 * 1.5) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
export function shortDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString([], { month: 'short', day: 'numeric' }) : iso;
}
