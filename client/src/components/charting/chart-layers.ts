/**
 * CHART LAYERS — the data side shared by QEChart's compact embed and the
 * full TradingView-style chart (tv/tv-chart.tsx): the /api/chart/overlays
 * payload (GEX timeline, dark pool, flow), the dealer map (walls + zero-γ),
 * the live header tick and small formatters. Identical React Query keys in
 * both, so a page with a compact chart and the expanded modal still makes one
 * request per endpoint.
 */
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { subscribeLivePrice, type LiveTick } from '@/lib/live-price-bus';
import { fmtAge } from '@/components/gex/gex-colors';
import type { TerminalData } from '@/components/gex/gex-model';

export interface FlowPrint {
  time: number; optionType: 'call' | 'put'; strike: number; expiry: string;
  contract: string; premium: number; fillPrice: number; contracts: number | null;
  alertNames: string[]; side: null;
}
export interface DpLevel { price: number; notional: number; prints: number; date: string | null; firstDate: string | null }
export interface OverlayPayload {
  symbol: string; range: string; dates: string[]; generatedAt: string;
  gexNow: null | { net: number; spot: number | null; topStrikes: { strike: number; gex: number }[]; asOf: string; ageSec: number | null; source: string };
  gexTimeline: {
    sampleEveryMin: number; recordingSince: string | null; asOf: string | null; ageSec: number | null;
    sources: string[]; note: string; watched: boolean;
    samples: { t: number; spot: number | null; net: number; source: string }[];
    series: { strike: number; points: [number, number][] }[];
  };
  darkPool: {
    source: string; asOf: string | null; ageSec: number | null; stale: boolean;
    windowFrom: string | null; windowTo: string | null; printsScanned: number; truncated?: boolean;
    levels: DpLevel[]; note: string;
  };
  flow: { source: string; streamState: string; asOf: string | null; ageSec: number | null; prints: FlowPrint[]; note: string };
}

/** /api/chart/overlays accepts equity/index tickers only (no BTC-USD). */
export const overlaysSupported = (sym: string) => /^[A-Z.^]{1,10}$/.test(sym);

/** Pause work while the chart is scrolled off-screen. */
export function useInView<T extends Element>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: '200px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, inView];
}

/** The newest bus tick for the header price, at most once a second. Shares the
 *  bus's single per-symbol subscription with the chart's forming bar. */
export function useLiveLast(symbol: string, enabled: boolean): LiveTick | null {
  const [tick, setTick] = useState<LiveTick | null>(null);
  useEffect(() => {
    setTick(null);
    if (!enabled || !symbol) return;
    let pending: LiveTick | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribeLivePrice(symbol, (t) => {
      pending = t;
      if (timer) return;
      timer = setTimeout(() => { timer = null; setTick(pending); }, 1000);
    });
    return () => { unsub(); if (timer) clearTimeout(timer); };
  }, [symbol, enabled]);
  return tick;
}

/** Dealer walls + zero-γ: the GEX page's query (same key → one request per symbol). */
export function useDealerMap(symbol: string, enabled: boolean, inView: boolean) {
  return useQuery<TerminalData>({
    queryKey: ['/api/gex-vex/terminal', symbol, 'nexus'],
    queryFn: async ({ signal }) => {
      // Same 45 s ceiling as gex-model's useGexTerminal: a busy options queue
      // gets an honest error, not an endless "reading".
      const ctl = new AbortController();
      const onAbort = () => ctl.abort();
      signal?.addEventListener('abort', onAbort);
      const timer = setTimeout(() => ctl.abort(), 45_000);
      try {
        const r = await fetch(`/api/gex-vex/terminal/${encodeURIComponent(symbol)}?interval=15m&lookback=5`, { credentials: 'include', signal: ctl.signal });
        if (!r.ok) throw new Error(`${symbol} dealer map: HTTP ${r.status}`);
        return await r.json();
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      }
    },
    enabled: enabled && inView && overlaysSupported(symbol),
    staleTime: 60_000, refetchInterval: inView ? 120_000 : false, retry: 1, retryDelay: 3_000,
  });
}

/** GEX timeline, dark pool and flow prints for the symbol + session range. */
export function useChartOverlays(symbol: string, ovRange: '1D' | '5D', enabled: boolean, inView: boolean, spotRef: MutableRefObject<number | null>) {
  return useQuery<OverlayPayload>({
    queryKey: ['/api/chart/overlays', symbol, ovRange],
    queryFn: async () => {
      const spot = spotRef.current;
      const r = await fetch(`/api/chart/overlays/${encodeURIComponent(symbol)}?range=${ovRange}${spot ? `&spot=${spot}` : ''}`, { credentials: 'include' });
      if (!r.ok) throw new Error('overlays failed');
      return r.json();
    },
    staleTime: 45_000, refetchInterval: inView ? 60_000 : false, retry: 1,
    enabled: enabled && inView && overlaysSupported(symbol),
  });
}

/* ── formatting ── */

const ET_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
export function etInfo(ms: number): { date: string; mins: number } {
  const p: Record<string, string> = {};
  for (const part of ET_FMT.formatToParts(ms)) p[part.type] = part.value;
  return { date: `${p.year}-${p.month}-${p.day}`, mins: Number(p.hour) * 60 + Number(p.minute) };
}
export const etClock = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
export const shortDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', year: '2-digit' });
};
export function fmtUsd(v: number, signed = false): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const s = signed ? (v > 0 ? '+' : v < 0 ? '−' : '') : '';
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(0)}K`;
  return `${s}$${a.toFixed(0)}`;
}
export const ageOf = (iso: string | null, now: number) => (iso ? fmtAge((now - Date.parse(iso)) / 1000) : '—');
export const fmtVol = (v: number) => (v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(2)}K` : `${Math.round(v)}`);
