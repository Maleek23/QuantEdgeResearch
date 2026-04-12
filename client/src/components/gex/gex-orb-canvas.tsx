/**
 * GEXOrbCanvas — glowing orb / wall / arc overlay painted on a Canvas 2D
 * element absolute-positioned inside the SkylitChart container.
 *
 * This is what gives the Command workspace its Skylit-reference "OLED trading
 * terminal" aesthetic. Every luminous element (orbs, wall bands, trinity line,
 * projection arc) is drawn with shadowBlur halos and layered gradient fills
 * in a single canvas that sits on top of the lightweight-charts canvas.
 *
 * ──── coordinate coupling ────────────────────────────────────────
 * The overlay reads the underlying IChartApi + CandlestickSeries on every
 * paint to derive pixel positions:
 *   x = chart.timeScale().timeToCoordinate(unixSeconds)
 *   y = series.priceToCoordinate(price)
 * This keeps orbs pixel-perfect on pan/zoom. Repaint is triggered by:
 *   • visible time / logical range change  (pan + zoom)
 *   • container resize                       (layout change)
 *   • data prop change                       (new terminal payload)
 * and coalesced into a single requestAnimationFrame so we never paint twice
 * per frame under rapid events.
 *
 * ──── perf budget ────────────────────────────────────────────────
 * ~200 candles × 8 orbs = 1600 dots per paint. Canvas 2D with shadowBlur
 * holds 60fps comfortably on this volume. If we ever push >5k dots we'll
 * move this to a WebGL path (pixi).
 */

import { useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import type { GEXCandle, GEXOrb, ProjectionArc, GEXSnapshot } from '../../../../shared/gex-types';

interface GEXOrbCanvasProps {
  chart: IChartApi;
  series: ISeriesApi<'Candlestick'>;
  containerEl: HTMLElement;
  candles: GEXCandle[];
  orbs: GEXOrb[];
  projection: ProjectionArc | null;
  snapshot: GEXSnapshot;
  /** When false, canvas stays mounted but paints nothing (toggle layer off). */
  enabled?: boolean;
}

// ══════════════════════════════════════════════════════════════════
// VISUAL TUNING — all the magic numbers live here, labeled
//
// Skylit paints walls as horizontal LUMINOUS ROWS — not as per-bar blooms.
// Our orbs arrive as symbol-level (strike + gammaPct) so they have no
// per-bar variation; repeating the same bloom N times just saturates.
// Instead, each orb becomes a single horizontal band with three layers:
//
//   1) a wide soft halo      — the "glow atmosphere" around the row
//   2) a thin bright core    — the 1-2px line that locates the strike
//   3) a peak marker dot     — anchored at the newest bar, "hot now"
//
// A left→right alpha ramp gives the "river flowing forward in time" feel
// without ever touching per-bar data.
// ══════════════════════════════════════════════════════════════════

/**
 * Row halo vertical radius (CSS px). Controls how tall the soft glow
 * around each strike row is. Bigger = more plasma atmosphere.
 * Skylit uses ~14-22px depending on chart density.
 */
const HALO_BASE_RADIUS = 10;
const HALO_RADIUS_SCALE = 14;

/**
 * Peak halo alpha at the centerline of the row. Small — we WANT the
 * candles to remain the hero. 0.10-0.18 is the right range; higher
 * values drown the chart.
 */
const HALO_BASE_ALPHA = 0.08;
const HALO_ALPHA_SCALE = 0.14;

/**
 * Thin bright core line alpha (the 1.5px line that precisely locates
 * the strike inside the soft halo).
 */
const CORE_BASE_ALPHA = 0.35;
const CORE_ALPHA_SCALE = 0.40;

/**
 * Horizontal recency ramp: left edge starts at RAMP_LEFT, right edge
 * (newest bar) hits 1.0. Gives the "flowing forward" feel.
 */
const RAMP_LEFT = 0.30;

/** Peak marker dot radius at the latest bar, per-orb. */
const PEAK_DOT_BASE = 2.0;
const PEAK_DOT_SCALE = 3.5;

/** Trinity / spot line dash pattern. */
const TRINITY_LINE_DASH = [4, 6] as const;

// ──────────────────────────────────────────────────────────────────

function orbColor(kind: GEXOrb['kind']): string {
  if (kind === 'max') return '#facc15'; // gold
  if (kind === 'flip') return '#fb923c'; // orange
  if (kind === 'call') return '#eab308'; // yellow
  return '#a855f7'; // purple put
}

/**
 * Compose a hex color + alpha byte into an 8-digit hex string.
 * e.g. hexAlpha('#facc15', 0.4) → '#facc1566'
 */
function hexAlpha(hex: string, alpha: number): string {
  const a = Math.max(0, Math.min(255, Math.round(alpha * 255)))
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

// ══════════════════════════════════════════════════════════════════

export function GEXOrbCanvas({
  chart,
  series,
  containerEl,
  candles,
  orbs,
  projection,
  snapshot,
  enabled = true,
}: GEXOrbCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const dimsRef = useRef({ w: 0, h: 0, dpr: 1 });
  const enabledRef = useRef(enabled);

  // Bundle the mutable inputs into a ref so the paint loop can see fresh
  // values without re-running the canvas lifecycle effect on every data
  // tick (which would thrash the DOM).
  const dataRef = useRef({ candles, orbs, projection, snapshot });
  useEffect(() => {
    dataRef.current = { candles, orbs, projection, snapshot };
    enabledRef.current = enabled;
    schedulePaint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, orbs, projection, snapshot, enabled]);

  // ──── lifecycle: create canvas, wire resize + chart subscriptions ────
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.right = '0';
    canvas.style.bottom = '0';
    canvas.style.pointerEvents = 'none';
    // IMPORTANT: overlay sits BEHIND the candles via DOM order + z-index.
    // The lightweight-charts internal divs paint on top, so our plasma glow
    // shows THROUGH the (transparent) chart background wherever candles
    // aren't. No mix-blend-mode needed — candles render normally on top.
    canvas.style.zIndex = '0';
    canvasRef.current = canvas;
    // Insert BEFORE the existing chart DOM so we're first in paint order.
    if (containerEl.firstChild) {
      containerEl.insertBefore(canvas, containerEl.firstChild);
    } else {
      containerEl.appendChild(canvas);
    }
    // Bump the chart's own child to a higher stacking layer so it always
    // wins against our canvas regardless of DOM order reshuffles.
    const chartDiv = containerEl.querySelector('.tv-lightweight-charts') as HTMLElement | null;
    if (chartDiv) {
      chartDiv.style.position = chartDiv.style.position || 'relative';
      chartDiv.style.zIndex = '1';
    }

    const resize = () => {
      const rect = containerEl.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      dimsRef.current = { w: rect.width, h: rect.height, dpr };
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      schedulePaint();
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(containerEl);

    // Repaint on any pan / zoom event from the chart. We use BOTH range
    // subscriptions because lightweight-charts fires different events for
    // drag-pan vs wheel-zoom depending on version.
    const ts = chart.timeScale();
    const onRangeChange = () => schedulePaint();
    try {
      ts.subscribeVisibleTimeRangeChange(onRangeChange);
    } catch {
      /* chart may already be disposed */
    }
    try {
      ts.subscribeVisibleLogicalRangeChange(onRangeChange);
    } catch {
      /* noop */
    }

    schedulePaint();

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      try {
        ts.unsubscribeVisibleTimeRangeChange(onRangeChange);
      } catch {
        /* noop */
      }
      try {
        ts.unsubscribeVisibleLogicalRangeChange(onRangeChange);
      } catch {
        /* noop */
      }
      ro.disconnect();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      canvasRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, series, containerEl]);

  // ──── paint scheduler ─────────────────────────────────────────────
  function schedulePaint() {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      try {
        paint();
      } catch {
        // Chart may have been disposed between the RAF schedule and the
        // execution. Silently drop the paint — the next data tick will
        // re-schedule when refs are valid again.
      }
    });
  }

  function paint() {
    const canvas = canvasRef.current;
    if (!canvas || !enabledRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h, dpr } = dimsRef.current;
    if (w === 0 || h === 0) return;

    // Reset transform + clear. setTransform(dpr,...) lets us draw in CSS
    // pixel coords while the backing store is at device pixel density.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const { candles, orbs, projection, snapshot } = dataRef.current;
    if (orbs.length === 0 || candles.length === 0) return;

    const ts = chart.timeScale();

    // Safe coordinate converters — the chart returns null for out-of-view
    // values, and can throw "Object is disposed" during StrictMode teardown.
    const priceY = (p: number): number | null => {
      try {
        const y = series.priceToCoordinate(p);
        return typeof y === 'number' ? y : null;
      } catch {
        return null;
      }
    };
    const timeX = (t: number): number | null => {
      try {
        // lightweight-charts uses a branded Time type; unix seconds is the
        // underlying value and accepted by timeToCoordinate at runtime.
        const x = ts.timeToCoordinate(t as unknown as Parameters<typeof ts.timeToCoordinate>[0]);
        return typeof x === 'number' ? x : null;
      } catch {
        return null;
      }
    };

    // Find newest/oldest in-view bar X. Used as ramp anchors and as the
    // peak-dot X (so the "hot now" marker sticks to the latest candle).
    let newestX: number | null = null;
    for (let i = candles.length - 1; i >= 0; i--) {
      const x = timeX(candles[i].time);
      if (x != null) { newestX = x; break; }
    }
    let oldestX: number | null = null;
    for (let i = 0; i < candles.length; i++) {
      const x = timeX(candles[i].time);
      if (x != null) { oldestX = x; break; }
    }
    if (newestX == null) newestX = w;
    if (oldestX == null) oldestX = 0;

    // Additive blending so CALL + MAX at the same strike combine brightness
    // without compounding opacity into saturated stripes.
    ctx.globalCompositeOperation = 'lighter';

    // ══════════════════════════════════════════════════════════════
    // LAYER 1 — WIDE SOFT HALO (one pass per orb, NOT per candle)
    //
    // The key insight vs the previous version: we paint each orb EXACTLY
    // ONCE as a full-width horizontal band. A vertical linear gradient
    // makes intensity peak at the strike line and fall to zero above/
    // below — that's what reads as a "soft luminous row" instead of a
    // hard stripe. Because we paint once per orb instead of once per bar,
    // there's no additive stacking blowout.
    // ══════════════════════════════════════════════════════════════
    for (const orb of orbs) {
      const y = priceY(orb.strike);
      if (y == null) continue;
      const color = orbColor(orb.kind);
      const radius = HALO_BASE_RADIUS + orb.size * HALO_RADIUS_SCALE;
      const peakA = HALO_BASE_ALPHA + orb.size * HALO_ALPHA_SCALE;

      const vGrad = ctx.createLinearGradient(0, y - radius, 0, y + radius);
      vGrad.addColorStop(0.0, hexAlpha(color, 0));
      vGrad.addColorStop(0.35, hexAlpha(color, peakA * 0.35));
      vGrad.addColorStop(0.5, hexAlpha(color, peakA));
      vGrad.addColorStop(0.65, hexAlpha(color, peakA * 0.35));
      vGrad.addColorStop(1.0, hexAlpha(color, 0));
      ctx.fillStyle = vGrad;
      ctx.fillRect(0, y - radius, w, radius * 2);
    }

    // Knock down the left portion of the halos with a destination-out
    // horizontal gradient. This gives the "river flowing forward in time"
    // feel — older bars dim toward RAMP_LEFT, newest bars stay at 1.0.
    ctx.globalCompositeOperation = 'destination-out';
    const ramp = ctx.createLinearGradient(oldestX, 0, newestX, 0);
    ramp.addColorStop(0.0, `rgba(0,0,0,${1 - RAMP_LEFT})`);
    ramp.addColorStop(1.0, 'rgba(0,0,0,0)');
    ctx.fillStyle = ramp;
    ctx.fillRect(0, 0, w, h);

    // Back to additive for the bright cores.
    ctx.globalCompositeOperation = 'lighter';

    // ══════════════════════════════════════════════════════════════
    // LAYER 2 — THIN BRIGHT CORE LINE
    //
    // A 1.25px horizontal stroke at each strike. The halo is atmosphere;
    // this is the actual wall. Recency is baked into the stroke color
    // via a horizontal gradient so older edges fade with the halo.
    // ══════════════════════════════════════════════════════════════
    for (const orb of orbs) {
      const y = priceY(orb.strike);
      if (y == null) continue;
      const color = orbColor(orb.kind);
      const alpha = CORE_BASE_ALPHA + orb.size * CORE_ALPHA_SCALE;

      const coreGrad = ctx.createLinearGradient(oldestX, 0, newestX, 0);
      coreGrad.addColorStop(0, hexAlpha(color, alpha * RAMP_LEFT));
      coreGrad.addColorStop(1, hexAlpha(color, alpha));
      ctx.strokeStyle = coreGrad;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
      ctx.stroke();
    }

    // ══════════════════════════════════════════════════════════════
    // LAYER 3 — PEAK MARKER DOTS (at newest bar)
    //
    // A small radial-gradient bloom at the latest candle for every orb.
    // This is the "hot now" anchor the eye reads as "wall right here,
    // right now". Radius scales with gamma share.
    // ══════════════════════════════════════════════════════════════
    for (const orb of orbs) {
      const y = priceY(orb.strike);
      if (y == null) continue;
      const color = orbColor(orb.kind);
      const r = PEAK_DOT_BASE + orb.size * PEAK_DOT_SCALE;
      const a = Math.min(1, 0.55 + orb.size * 0.45);

      const dot = ctx.createRadialGradient(newestX, y, 0, newestX, y, r * 2.2);
      dot.addColorStop(0, hexAlpha(color, a));
      dot.addColorStop(0.4, hexAlpha(color, a * 0.5));
      dot.addColorStop(1, hexAlpha(color, 0));
      ctx.fillStyle = dot;
      ctx.fillRect(newestX - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
    }

    // Back to normal compositing for crisp UI (labels, trinity, arc).
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // ══════════════════════════════════════════════════════════════
    // LAYER 2.5 — ROW LABELS
    // Small strike · % tag floating inside the chart, anchored to the
    // right edge BUT offset inward so the price axis pill has room.
    // ══════════════════════════════════════════════════════════════
    for (const orb of orbs) {
      const y = priceY(orb.strike);
      if (y == null) continue;
      const color = orbColor(orb.kind);
      ctx.save();
      ctx.font = "10px 'JetBrains Mono', 'Space Mono', monospace";
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = color;
      ctx.shadowBlur = 4;
      ctx.fillStyle = hexAlpha(color, 0.9);
      const pctTxt = orb.gammaPct > 0 ? `${(orb.gammaPct * 100).toFixed(0)}%` : '';
      const label = pctTxt ? `${Math.round(orb.strike)} · ${pctTxt}` : `${Math.round(orb.strike)}`;
      // 64px inward from the right edge — leaves room for the native
      // lightweight-charts price axis (~56px wide) without collision.
      ctx.fillText(label, w - 68, y);
      ctx.restore();
    }

    // ══════════════════════════════════════════════════════════════
    // LAYER 3 — TRINITY LINE
    // Always-on dashed cyan horizontal at spot.
    // ══════════════════════════════════════════════════════════════
    const spotY = priceY(snapshot.spotPrice);
    if (spotY != null) {
      ctx.save();
      ctx.strokeStyle = '#67e8f9';
      ctx.lineWidth = 1;
      ctx.setLineDash(TRINITY_LINE_DASH as unknown as number[]);
      ctx.shadowColor = '#67e8f9';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(0, spotY);
      ctx.lineTo(w, spotY);
      ctx.stroke();
      ctx.restore();
    }

    // ══════════════════════════════════════════════════════════════
    // LAYER 4 — PROJECTION ARC
    // Glowing cyan curve from SPOT to zero-gamma target with a ghost
    // envelope fill underneath. Shown whenever projection data exists,
    // regardless of view mode.
    // ══════════════════════════════════════════════════════════════
    if (projection && projection.points.length >= 2) {
      const pts = projection.points
        .map((p) => {
          const px = timeX(p.time);
          const py = priceY(p.price);
          return px != null && py != null ? { x: px, y: py } : null;
        })
        .filter((p): p is { x: number; y: number } => p !== null);

      if (pts.length >= 2) {
        const first = pts[0];
        const last = pts[pts.length - 1];

        // Ghost envelope — faint cyan rect from arc-start to arc-end across
        // the vertical range, so the forecast zone reads as a soft cone.
        ctx.save();
        const envGrad = ctx.createLinearGradient(first.x, 0, last.x, 0);
        envGrad.addColorStop(0, 'rgba(103, 232, 249, 0.10)');
        envGrad.addColorStop(1, 'rgba(103, 232, 249, 0.02)');
        ctx.fillStyle = envGrad;
        ctx.fillRect(first.x, 0, last.x - first.x, h);
        ctx.restore();

        // Glowing stroke
        ctx.save();
        ctx.strokeStyle = '#67e8f9';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#67e8f9';
        ctx.shadowBlur = 14;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();

        // Target pill at the end of the arc
        ctx.fillStyle = '#67e8f9';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  return null;
}
