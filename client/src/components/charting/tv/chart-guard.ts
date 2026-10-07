/**
 * Safe teardown for a lightweight-charts instance.
 *
 * Why: `chart.remove()` destroys the chart's canvases but does NOT call
 * `detached()` on series primitives. A primitive that keeps a timer (the bar
 * countdown ticks every second) or that is handed new state later keeps
 * calling `requestUpdate()`; that schedules a redraw on the destroyed widget
 * and the next animation frame throws "Object is disposed" from
 * fancy-canvas `resizeCanvasElement` — an uncaught global error on every
 * page that ever showed the chart. The same happens when a series cleanup
 * detaches a primitive (or calls any chart/series method) after remove().
 *
 * The guard owns the order: detach every primitive while the chart is still
 * alive, run caller teardown (unsubscribe), then remove the chart — once.
 * Every later call is a no-op, so React StrictMode's double-mount and effect
 * cleanups that run after the chart's own cleanup are safe.
 */
import type { IChartApi, ISeriesApi, ISeriesPrimitive, SeriesType, Time } from 'lightweight-charts';

type AnySeries = ISeriesApi<SeriesType>;
type AnyPrimitive = ISeriesPrimitive<Time>;

export interface ChartGuard {
  readonly chart: IChartApi;
  readonly disposed: boolean;
  /** attachPrimitive, remembered so dispose() can detach it first. */
  attach(series: AnySeries, primitive: AnyPrimitive): void;
  /** detachPrimitive; no-op once disposed (dispose already detached it). */
  detach(series: AnySeries, primitive: AnyPrimitive): void;
  /** removeSeries (detaching its primitives first); no-op once disposed. */
  removeSeries(series: AnySeries): void;
  /** Run `fn` only while the chart is alive. */
  run<T>(fn: (chart: IChartApi) => T): T | undefined;
  /** Register teardown to run before remove() (unsubscribe, observers, timers). */
  onDispose(fn: () => void): void;
  /** Idempotent: detach primitives → teardown → chart.remove(). */
  dispose(): void;
}

const warn = (what: string, err: unknown) => {
  if (typeof console !== 'undefined') console.warn(`[chart] ${what}`, err);
};

export function guardChart(chart: IChartApi): ChartGuard {
  let disposed = false;
  const attached = new Map<AnySeries, Set<AnyPrimitive>>();
  const teardown: (() => void)[] = [];

  const detachAll = (series: AnySeries) => {
    const set = attached.get(series);
    if (!set) return;
    attached.delete(series);
    for (const p of set) {
      try { series.detachPrimitive(p); } catch (e) { warn('detachPrimitive', e); }
    }
  };

  return {
    chart,
    get disposed() { return disposed; },
    attach(series, primitive) {
      if (disposed) return;
      series.attachPrimitive(primitive);
      let set = attached.get(series);
      if (!set) attached.set(series, (set = new Set()));
      set.add(primitive);
    },
    detach(series, primitive) {
      if (disposed) return;
      const set = attached.get(series);
      if (!set?.delete(primitive)) return;
      if (!set.size) attached.delete(series);
      try { series.detachPrimitive(primitive); } catch (e) { warn('detachPrimitive', e); }
    },
    removeSeries(series) {
      if (disposed) return;
      detachAll(series);
      try { chart.removeSeries(series); } catch (e) { warn('removeSeries', e); }
    },
    run(fn) {
      return disposed ? undefined : fn(chart);
    },
    onDispose(fn) {
      if (disposed) { fn(); return; }
      teardown.push(fn);
    },
    dispose() {
      if (disposed) return;
      // Primitives first, while the model can still take the lightUpdate that
      // detachPrimitive triggers (remove() then cancels the pending frame).
      for (const series of [...attached.keys()]) detachAll(series);
      for (const fn of teardown.splice(0)) {
        try { fn(); } catch (e) { warn('teardown', e); }
      }
      disposed = true;
      try { chart.remove(); } catch (e) { warn('remove', e); }
    },
  };
}

/**
 * True for the error a disposed lightweight-charts canvas throws. The exact
 * message comes from fancy-canvas (lightweight-charts' only canvas layer);
 * production bundles minify the stack, so the message is the signal.
 */
export function isDisposedChartError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  return /\bObject is disposed\b/.test(msg);
}
