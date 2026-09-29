/**
 * Trade chart — the trade drawn on OUR chart engine (NexusPriceChart /
 * chart-engine.ts): real OHLCV around the holding period, entry and exit
 * markers, stop / target lines, and the trader's annotations.
 *
 * Idea from LuxAlgo Trade Journal (apps/web/src/components/trade-chart.tsx),
 * https://github.com/LuxAlgo/trade-journal — MIT License, Copyright (c) 2026
 * LuxAlgo Global, LLC (notice: client/src/lib/journal/LICENSE-luxalgo.txt).
 * Rewritten on NexusPriceChart; nothing from their chart library is used.
 *
 * Options: the chart is the UNDERLYING, and a contract's premium is not a price
 * on it, so option entries/exits are time markers only (no price dot) — the
 * card says so. Stop/target are underlying levels in every case.
 */
import { useCallback, useMemo } from 'react';
import { NexusPriceChart } from '@/components/charting/nexus-price-chart';
import type { Candle, ChartGeometry, Level } from '@/components/charting/chart-engine';
import type { TradeAnnotation } from '@/lib/journal/metrics-extra';

export function TradeChart({ symbol, tf, entryMs, exitMs, entryPrice, exitPrice, priceMarkers, direction, stop, target, annotations, height = 380 }: {
  symbol: string;
  tf: string;
  entryMs: number;
  exitMs: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  /** Draw entry/exit at their price (stocks/crypto). Options: time only. */
  priceMarkers: boolean;
  direction: 'long' | 'short';
  stop: number | null;
  target: number | null;
  annotations: TradeAnnotation[];
  height?: number;
}) {
  // Show the trade with context: as many bars before entry (≥ 30) as it lasted, and after exit.
  const transformBars = useCallback((bars: Candle[]) => {
    if (!bars.length) return bars;
    const barMs = bars.length > 1 ? (bars[bars.length - 1].time - bars[0].time) / (bars.length - 1) : 60_000;
    const end = exitMs ?? bars[bars.length - 1].time;
    const pad = Math.max(30 * barMs, (end - entryMs) * 0.6);
    const cut = bars.filter((b) => b.time >= entryMs - pad && b.time <= end + pad);
    return cut.length >= 2 ? cut : bars;
  }, [entryMs, exitMs]);

  const levels = useMemo(() => {
    const ls: (Level & { dashed?: boolean })[] = [];
    if (stop != null) ls.push({ price: stop, color: '#ff6b3d', label: `STOP ${stop}`, kind: 'execution', dashed: true });
    if (target != null) ls.push({ price: target, color: '#6ee7b7', label: `TARGET ${target}`, kind: 'execution', dashed: true });
    return ls;
  }, [stop, target]);

  const overlay = useCallback((ctx: CanvasRenderingContext2D, geo: ChartGeometry) => {
    const mark = (t: number, price: number | null, label: string, color: string, up: boolean) => {
      const x = geo.timeToX(t);
      if (x == null) return;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.55;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(x, geo.top); ctx.lineTo(x, geo.top + geo.priceH); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      const y = price != null && price >= geo.min && price <= geo.max ? geo.priceToY(price) : null;
      if (y != null) {
        ctx.beginPath();
        if (up) { ctx.moveTo(x, y - 7); ctx.lineTo(x - 6, y + 4); ctx.lineTo(x + 6, y + 4); } else { ctx.moveTo(x, y + 7); ctx.lineTo(x - 6, y - 4); ctx.lineTo(x + 6, y - 4); }
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.font = '600 10px JetBrains Mono, monospace';
      const w = ctx.measureText(label).width + 8;
      const ly = geo.top + 4;
      ctx.fillStyle = color;
      ctx.fillRect(Math.min(x + 3, geo.right - w), ly, w, 15);
      ctx.fillStyle = '#05070b';
      ctx.fillText(label, Math.min(x + 3, geo.right - w) + 4, ly + 11);
      ctx.restore();
    };
    const long = direction === 'long';
    mark(entryMs, priceMarkers ? entryPrice : null, long ? 'BUY' : 'SELL SHORT', '#7fb2ff', long);
    if (exitMs != null) mark(exitMs, priceMarkers ? exitPrice : null, long ? 'SELL' : 'COVER', '#f5c451', !long);
    annotations.forEach((a, i) => {
      const t = a.at ? Date.parse(a.at) : NaN;
      const x = Number.isFinite(t) ? geo.timeToX(t) : null;
      if (x == null) return;
      const y = a.price != null && a.price >= geo.min && a.price <= geo.max ? geo.priceToY(a.price) : geo.top + geo.priceH - 14;
      ctx.save();
      ctx.fillStyle = '#c4b5fd';
      ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#05070b';
      ctx.font = '700 10px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), x, y + 3.5);
      ctx.restore();
    });
  }, [annotations, direction, entryMs, entryPrice, exitMs, exitPrice, priceMarkers]);

  return (
    <NexusPriceChart
      symbol={symbol}
      initialTf={tf as never}
      tf={tf as never}
      height={height}
      levels={levels}
      overlay={overlay}
      transformBars={transformBars}
      resetKey={`${entryMs}|${exitMs ?? ''}`}
      defaultVisibleBars={100_000}
      live={false}
      hideControls
      expandable
    />
  );
}
