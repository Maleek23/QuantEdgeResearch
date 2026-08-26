/**
 * NexusPriceChart — the CHART tab's engine as a drop-in component.
 *
 * One chart everywhere: the cockpit, ticker views and any panel that needs
 * price now render the SAME interactive canvas the CHART tab uses — real
 * OHLCV, timeframe bar, candles/line toggle, MA20/50, volume, crosshair with
 * OHLCV tooltip, published levels, gap zones, outlier-wick clamping with the
 * on-chart disclosure. Prop-compatible with the EpochChart callsites it
 * replaces (symbol / initialTf / height / levels / zones).
 */
import { useEffect, useRef, useState } from 'react';
import {
  drawChart, useCandles, TF_CONFIG,
  type Candle, type Level, type Zone,
} from '@/components/charting/chart-lab-nexus';
import '@/styles/nexus.css';

export function NexusPriceChart({
  symbol,
  initialTf = '1D',
  height = 340,
  levels = [],
  zones = [],
}: {
  symbol: string;
  initialTf?: keyof typeof TF_CONFIG;
  height?: number;
  levels?: (Level & { dashed?: boolean })[];
  zones?: Zone[];
}) {
  const [tf, setTf] = useState<keyof typeof TF_CONFIG>(
    TF_CONFIG[initialTf] ? initialTf : '1D',
  );
  const [type, setType] = useState<'candles' | 'line'>('candles');
  const { data: series, isLoading, isError } = useCandles(symbol, tf);
  const candles = series?.bars;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const mouse = useRef({ x: -1, y: -1 });

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas || !candles || candles.length < 2) return;
    drawChart(canvas, candles, {
      type, tf, showCrosshair: true, showLevels: true,
      levels: levels.filter((l) => Number.isFinite(l.price)),
      zones,
      mouseX: mouse.current.x,
      mouseY: mouse.current.y,
      onHover: (c: Candle | null, x: number, y: number) => {
        const tip = tipRef.current; const wrap = wrapRef.current;
        if (!tip || !wrap) return;
        if (!c) { tip.classList.remove('show'); return; }
        const d = new Date(c.time);
        tip.querySelector('[data-tip=time]')!.textContent = d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
        tip.querySelector('[data-tip=o]')!.textContent = c.open.toFixed(2);
        tip.querySelector('[data-tip=h]')!.textContent = c.high.toFixed(2);
        tip.querySelector('[data-tip=l]')!.textContent = c.low.toFixed(2);
        const tc = tip.querySelector('[data-tip=c]') as HTMLElement;
        tc.textContent = c.close.toFixed(2);
        tc.className = 'v ' + (c.close >= c.open ? 'up' : 'down');
        tip.querySelector('[data-tip=v]')!.textContent = c.volume > 0 ? (c.volume / 1e6).toFixed(2) + 'M' : '—';
        const rect = wrap.getBoundingClientRect();
        let tx = x + 16; let ty = y - 60;
        if (tx + 180 > rect.width) tx = x - 180;
        if (ty < 10) ty = y + 16;
        tip.style.left = tx + 'px';
        tip.style.top = ty + 'px';
        tip.classList.add('show');
      },
    });
  };

  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, type, tf, levels, zones]);
  useEffect(() => {
    const onResize = () => redraw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, type, tf, levels, zones]);

  return (
    <div ref={wrapRef} className="chart-canvas-wrap" style={{ height, flex: 'none', borderRadius: 6, border: '1px solid var(--nx-border, rgba(79,209,197,0.08))' }}>
      {isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', height: '100%', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
          loading {symbol} · {TF_CONFIG[tf].label}…
        </div>
      ) : isError || !candles?.length ? (
        <div style={{ display: 'grid', placeItems: 'center', height: '100%', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
          no price history for {symbol} at {TF_CONFIG[tf].label}
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            mouse.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            redraw();
          }}
          onMouseLeave={() => { mouse.current = { x: -1, y: -1 }; redraw(); }}
        />
      )}

      {/* compact TF bar + type toggle, same controls as the CHART tab */}
      <div className="timeframe-bar" style={{ top: 8, left: 8 }}>
        {(Object.keys(TF_CONFIG) as (keyof typeof TF_CONFIG)[]).map((k) => (
          <button key={k} className={`tf-btn${tf === k ? ' active' : ''}`} style={{ padding: '3px 8px' }} onClick={() => setTf(k)}>{k}</button>
        ))}
      </div>
      <div className="chart-type-toggle" style={{ position: 'absolute', top: 8, right: 8, zIndex: 3 }}>
        {(['candles', 'line'] as const).map((t) => (
          <button key={t} className={`chart-type-btn${type === t ? ' active' : ''}`} onClick={() => setType(t)}>{t}</button>
        ))}
      </div>

      <div className="chart-info-overlay" style={{ bottom: 8, left: 8, padding: '4px 8px' }}>
        <span>TF <b>{TF_CONFIG[tf].label}</b></span>
        <span>BARS <b>{candles?.length ?? 0}</b></span>
        {(series?.clampedWicks ?? 0) > 0 && (
          <span style={{ color: 'var(--amber)' }}>{series!.clampedWicks} OUTLIER WICK{series!.clampedWicks === 1 ? '' : 'S'} CLAMPED</span>
        )}
      </div>

      <div className="crosshair-tip" ref={tipRef}>
        <div className="row"><span className="k">Time</span><span className="v" data-tip="time">—</span></div>
        <div className="row"><span className="k">Open</span><span className="v" data-tip="o">—</span></div>
        <div className="row"><span className="k">High</span><span className="v" data-tip="h">—</span></div>
        <div className="row"><span className="k">Low</span><span className="v" data-tip="l">—</span></div>
        <div className="row"><span className="k">Close</span><span className="v" data-tip="c">—</span></div>
        <div className="row"><span className="k">Volume</span><span className="v" data-tip="v">—</span></div>
      </div>
    </div>
  );
}
