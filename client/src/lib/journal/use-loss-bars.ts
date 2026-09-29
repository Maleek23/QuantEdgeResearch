/**
 * Bars for the loss analysis: per symbol, hourly bars (≤6 months, extended
 * hours — the resolution MFE/MAE and time-to-MAE are measured at) when a
 * trade is inside their reach, and daily bars (2 years — ATR, older trades).
 *
 * Batched: GET /api/journal/bars takes up to 25 symbols per call (same
 * provider path + server cache as /api/historical-prices, trimmed to the
 * trades' window), at most CONCURRENCY calls in flight, each cached 30 min
 * in react-query — so a ~80-symbol desk book costs ~8 requests, and revisiting
 * the page or switching back costs none. A symbol the feed has no bars for
 * resolves to null (→ 'unknown'), never to made-up prices.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Bar, SymbolBars } from './loss-analysis';

const CONCURRENCY = 2;
const BATCH = 25;
const H1_REACH_MS = 175 * 86_400_000;
/** Day-rounded so the query key (and the server cache) is stable within a day. */
const VALID = /^[A-Z0-9^][A-Z0-9.\-=/^]{0,14}$/;
const dayFloor = (ms: number) => Math.floor(ms / 86_400_000) * 86_400_000;

type Wire = Record<string, [number, number, number, number, number][] | null>;

async function fetchBatch(symbols: string[], interval: '1h' | '1d', from: number): Promise<Wire> {
  const qs = new URLSearchParams({ symbols: symbols.map((s) => s.toUpperCase()).join(','), interval, from: String(from) });
  const r = await fetch(`/api/journal/bars?${qs}`, { credentials: 'include' });
  if (!r.ok) throw new Error(`bars ${interval} (${symbols.length} symbols): ${r.status}`);
  return (await r.json()).bars as Wire;
}

const toBars = (rows: [number, number, number, number, number][] | null | undefined): Bar[] | null =>
  rows && rows.length > 1 ? rows.map(([time, open, high, low, close]) => ({ time, open, high, low, close })).sort((a, b) => a.time - b.time) : null;

export interface LossBarsState {
  bars: Map<string, SymbolBars>;
  /** Symbols resolved (bars, or a definite "none"). */
  done: number;
  total: number;
  /** Symbols whose request failed (shown; their trades stay 'unknown'). */
  failed: string[];
}

/** needs: symbol → earliest entry time (ms) among the trades analysed. */
export function useLossBars(needs: Map<string, number>, nowMs: number): LossBarsState {
  const qc = useQueryClient();
  const key = useMemo(() => [...needs.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([s, t]) => `${s}:${dayFloor(t)}`).join('|'), [needs]);
  const [state, setState] = useState<LossBarsState>({ bars: new Map(), done: 0, total: needs.size, failed: [] });

  useEffect(() => {
    let alive = true;
    const all = [...needs.keys()].sort();
    // Symbols the bars endpoint would reject resolve at once to "no bars".
    const syms = all.filter((s) => VALID.test(s.toUpperCase()));
    const bars = new Map<string, SymbolBars>(all.filter((s) => !syms.includes(s)).map((s) => [s, {}]));
    const batches: string[][] = [];
    for (let i = 0; i < syms.length; i += BATCH) batches.push(syms.slice(i, i + BATCH));
    const failed: string[] = [];
    let done = bars.size;
    setState({ bars: new Map(bars), done, total: all.length, failed: [] });

    const get = (batch: string[], interval: '1h' | '1d', from: number) => qc.fetchQuery({
      queryKey: ['journal-bars', interval, from, batch.join(',')],
      queryFn: () => fetchBatch(batch, interval, from),
      staleTime: 30 * 60_000,
      gcTime: 60 * 60_000,
      retry: 1,
    });

    let next = 0;
    const worker = async () => {
      while (alive && next < batches.length) {
        const batch = batches[next++];
        const from = dayFloor(Math.min(...batch.map((s) => needs.get(s)!)));
        const needH1 = batch.filter((s) => nowMs - needs.get(s)! < H1_REACH_MS);
        try {
          const [d1, h1] = await Promise.all([
            get(batch, '1d', from),
            needH1.length ? get(needH1, '1h', dayFloor(Math.min(...needH1.map((s) => needs.get(s)!)))) : Promise.resolve({} as Wire),
          ]);
          for (const s of batch) bars.set(s, { d1: toBars(d1[s.toUpperCase()]), h1: toBars(h1[s.toUpperCase()]) });
        } catch {
          failed.push(...batch);
          for (const s of batch) bars.set(s, {});
        }
        if (!alive) return;
        done += batch.length;
        setState({ bars: new Map(bars), done, total: all.length, failed: [...failed] });
      }
    };
    void Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, qc]);

  return state;
}
