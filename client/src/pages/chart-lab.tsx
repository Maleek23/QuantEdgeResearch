/**
 * CHART LAB — proof-of-concept for the QuantEdge universal charting system.
 *
 * Proves the two things that make it "part of the platform":
 *   1. ANY TICKER — feeds real OHLC from /api/historical-prices for whatever symbol
 *      you type; the same EpochChart drops in anywhere (Terminal tabs, research, ideas).
 *   2. EPOCH-ANCHORED DRAWINGS — trendlines seeded from real swing points stay pinned
 *      to the same time+price when you switch 5m ↔ 1D (see epoch-chart.tsx).
 *
 * Dev/POC route (public so it's easy to demo). Gate behind auth before prod.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EpochChart, type Candle, type Trendline } from '@/components/charting/epoch-chart';

/** Support + resistance from swing lows/highs in each half of a real series. */
function deriveTrends(bars: Candle[]): Trendline[] {
  if (bars.length < 12) return [];
  const n = bars.length, mid = Math.floor(n / 2);
  const argMinLow = (a: number, b: number) => { let k = a; for (let i = a; i < b; i++) if (bars[i].low < bars[k].low) k = i; return k; };
  const argMaxHigh = (a: number, b: number) => { let k = a; for (let i = a; i < b; i++) if (bars[i].high > bars[k].high) k = i; return k; };
  const s1 = argMinLow(0, mid), s2 = argMinLow(mid, n);
  const r1 = argMaxHigh(0, mid), r2 = argMaxHigh(mid, n);
  return [
    { id: 'support', a: { time: bars[s1].time, price: bars[s1].low }, b: { time: bars[s2].time, price: bars[s2].low }, color: '#22d3ee', label: 'SUPPORT' },
    { id: 'resist', a: { time: bars[r1].time, price: bars[r1].high }, b: { time: bars[r2].time, price: bars[r2].high }, color: '#e0a458', label: 'RESIST' },
  ];
}

const CHIPS = ['ANY TICKER', 'EPOCH-ANCHORED', 'SURVIVES TF SWITCH', 'lightweight-charts v5'];

export default function ChartLab() {
  const [symbol, setSymbol] = useState('NVDA');
  const [draft, setDraft] = useState('NVDA');

  // seed trendlines from a real 5-day / 15m window (overlaps every timeframe)
  const { data: anchorBars } = useQuery<Candle[]>({
    queryKey: ['/api/historical-prices', symbol, 'anchor-15m-5d'],
    queryFn: async () => {
      const r = await fetch(`/api/historical-prices/${symbol}?range=5d&interval=15m`, { credentials: 'include' });
      if (!r.ok) throw new Error('history failed');
      return (await r.json())?.data ?? [];
    },
    staleTime: 60_000,
    retry: 1,
  });
  const trendlines = useMemo(() => deriveTrends(anchorBars ?? []), [anchorBars]);

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <header className="space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h1 className="text-xl font-mono font-bold tracking-widest uppercase">
              Chart Lab <span className="text-[var(--brand-cyan,#22d3ee)]">·</span>{' '}
              <span className="text-sm normal-case tracking-normal font-normal text-muted-foreground/70">
                universal epoch-anchored charting
              </span>
            </h1>
            <form
              onSubmit={(e) => { e.preventDefault(); if (draft.trim()) setSymbol(draft.trim().toUpperCase()); }}
              className="flex items-center gap-1.5"
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="ticker"
                className="w-24 bg-card border border-card-border rounded px-2 py-1 text-[12px] font-mono uppercase tracking-wider text-foreground outline-none focus:border-[var(--brand-cyan,#22d3ee)]"
              />
              <button type="submit" className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider rounded bg-foreground/10 hover:bg-foreground/15 text-foreground">
                Load
              </button>
            </form>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CHIPS.map((c) => (
              <span key={c} className="text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border border-border/50 text-muted-foreground/70">
                {c}
              </span>
            ))}
          </div>
        </header>

        <EpochChart symbol={symbol} trendlines={trendlines} initialTf="15m" height={440} />

        <div className="rounded-xl border border-card-border bg-card px-4 py-3">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--brand-cyan,#22d3ee)] mb-1">The proof</div>
          <p className="text-[12px] leading-relaxed text-muted-foreground/80">
            Real candles for <b className="text-foreground/80">{symbol}</b> stream from <b className="text-foreground/80">/api/historical-prices</b>
            {' '}— type any ticker and hit Load. The two trendlines are stored as absolute{' '}
            <b className="text-foreground/80">{'{ time (unix epoch), price }'}</b> anchors from real swing points, not bar indices.
            Switch timeframe (5m/15m/1h/1D, or keys 1–4): the candles re-resolve, but each line stays pinned to the exact same
            real-world time &amp; price. This same component drops into any Terminal tab, research view, or trade-idea card.
          </p>
        </div>
      </div>
    </div>
  );
}
