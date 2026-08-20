/**
 * CHART LAB — proof-of-concept for the QuantEdge charting system.
 *
 * Proves the core spec: a trendline anchored to absolute epoch time + price stays
 * pinned to the SAME point when you switch timeframes (1m ↔ 1h), pan, or zoom —
 * because the overlay re-projects from real-world coordinates, not bar indices.
 *
 * Dev/POC route (public so it's easy to demo). Gate behind auth before prod.
 */
import { useMemo } from 'react';
import { EpochChart, type Candle, type Trendline } from '@/components/charting/epoch-chart';

// deterministic PRNG so the series + trendlines are reproducible
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function genBase(): Candle[] {
  const rnd = mulberry32(20260817);
  const start = Math.floor(Date.UTC(2026, 7, 17, 13, 30, 0) / 1000);
  let p = 182;
  const out: Candle[] = [];
  for (let i = 0; i < 1200; i++) {
    const drift = (rnd() - 0.5) * 0.7 + Math.sin(i / 90) * 0.06;
    const o = p;
    const c = +(p + drift).toFixed(2);
    const h = +(Math.max(o, c) + rnd() * 0.35).toFixed(2);
    const l = +(Math.min(o, c) - rnd() * 0.35).toFixed(2);
    out.push({ time: start + i * 60, open: o, high: h, low: l, close: c });
    p = c;
  }
  return out;
}

const CHIPS = ['EPOCH-ANCHORED', 'SURVIVES TF SWITCH', 'lightweight-charts v5', 'KEYBOARD 1–5'];

export default function ChartLab() {
  const base = useMemo(genBase, []);
  const trendlines: Trendline[] = useMemo(() => {
    const A = base[180], B = base[1000], C = base[120], D = base[900];
    return [
      { id: 'support', a: { time: A.time, price: A.low }, b: { time: B.time, price: B.low }, color: '#22d3ee', label: 'SUPPORT' },
      { id: 'resist', a: { time: C.time, price: C.high + 1 }, b: { time: D.time, price: D.high + 1 }, color: '#e0a458', label: 'RESIST' },
    ];
  }, [base]);

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <header className="space-y-2">
          <h1 className="text-xl font-mono font-bold tracking-widest uppercase">
            Chart Lab <span className="text-[var(--brand-cyan,#22d3ee)]">·</span>{' '}
            <span className="text-sm normal-case tracking-normal font-normal text-muted-foreground/70">
              epoch-anchored charting — proof of concept
            </span>
          </h1>
          <div className="flex flex-wrap gap-1.5">
            {CHIPS.map((c) => (
              <span key={c} className="text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border border-border/50 text-muted-foreground/70">
                {c}
              </span>
            ))}
          </div>
        </header>

        <EpochChart symbol="DEMO" base={base} trendlines={trendlines} height={440} />

        <div className="rounded-xl border border-card-border bg-card px-4 py-3">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--brand-cyan,#22d3ee)] mb-1">The proof</div>
          <p className="text-[12px] leading-relaxed text-muted-foreground/80">
            The two trendlines are stored as absolute <b className="text-foreground/80">{'{ time (unix epoch), price }'}</b> anchors —
            not bar indices. Switch the timeframe (click 1m/5m/15m/30m/1h, or press <b className="text-foreground/80">1–5</b>):
            the candles rebuild at the new resolution, but each line stays pinned to the exact same real-world
            time &amp; price. That's what off-the-shelf index-anchored drawings can't do — and it's the foundation
            for the institution-grade suite (indicators, anchored-VWAP, session levels) on top.
          </p>
        </div>
      </div>
    </div>
  );
}
