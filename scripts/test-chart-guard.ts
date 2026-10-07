/**
 * chart-guard.ts: lightweight-charts teardown order (2026-10-07 prod
 * "Object is disposed" global error). chart.remove() does not detach series
 * primitives, so the bar-countdown timer kept redrawing a destroyed chart.
 *   npx tsx scripts/test-chart-guard.ts      (npm run test:chart runs it)
 */
import assert from 'node:assert/strict';
import { guardChart, isDisposedChartError } from '../client/src/components/charting/tv/chart-guard';
import { CountdownPrimitive } from '../client/src/components/charting/tv/layers-primitive';

/** A fake chart that throws like LWC's disposed canvas when touched after remove(). */
function fakeChart() {
  const log: string[] = [];
  let removed = false;
  let pendingDraw = false;
  const touch = (what: string) => { if (removed) throw new Error(`Object is disposed (${what})`); log.push(what); };
  const series = {
    prims: new Set<{ attached?: (p: unknown) => void; detached?: () => void }>(),
    attachPrimitive(p: any) { touch('attach'); this.prims.add(p); p.attached?.({ series: this, chart, requestUpdate: () => { if (removed) { pendingDraw = true; } } }); },
    detachPrimitive(p: any) { touch('detach'); this.prims.delete(p); p.detached?.(); },
  };
  const chart = {
    removeSeries() { touch('removeSeries'); },
    applyOptions() { touch('applyOptions'); },
    remove() { touch('remove'); removed = true; },
  };
  return { chart: chart as any, series: series as any, log, get removed() { return removed; }, get drewAfterRemove() { return pendingDraw; } };
}

/* ── dispose detaches primitives BEFORE remove(), exactly once ── */
{
  const f = fakeChart();
  const g = guardChart(f.chart);
  const prim = { detached() { f.log.push('prim.detached'); } } as any;
  g.attach(f.series, prim);
  let unsub = 0;
  g.onDispose(() => { unsub++; });
  g.dispose();
  assert.deepEqual(f.log, ['attach', 'detach', 'prim.detached', 'remove'], 'detach → remove order');
  assert.equal(unsub, 1, 'teardown ran');
  assert.equal(g.disposed, true);
  // everything after dispose is a no-op (no throw)
  g.dispose();
  g.detach(f.series, prim);
  g.removeSeries(f.series);
  assert.equal(g.run(() => 1), undefined, 'run is skipped once disposed');
  assert.equal(unsub, 1, 'teardown not re-run');
  let late = 0; g.onDispose(() => { late++; });
  assert.equal(late, 1, 'teardown registered after dispose runs immediately');
}

/* ── React order: chart cleanup first, then the series effect's cleanup ── */
{
  const f = fakeChart();
  const g = guardChart(f.chart);
  const prim = {} as any;
  g.attach(f.series, prim);
  g.dispose();                  // chart lifecycle effect cleanup (declared first)
  assert.doesNotThrow(() => g.removeSeries(f.series), 'series cleanup after dispose is safe');
  assert.doesNotThrow(() => g.detach(f.series, prim));
}

/* ── chartType switch: series removed while the chart lives ── */
{
  const f = fakeChart();
  const g = guardChart(f.chart);
  const prim = { detached() { f.log.push('prim.detached'); } } as any;
  g.attach(f.series, prim);
  g.removeSeries(f.series);
  assert.deepEqual(f.log, ['attach', 'detach', 'prim.detached', 'removeSeries']);
  g.dispose();
  assert.equal(f.log.filter((x) => x === 'detach').length, 1, 'not detached twice');
}

/* ── the actual prod bug: countdown timer stops at dispose ── */
await (async () => {
  const f = fakeChart();
  const g = guardChart(f.chart);
  const cd = new CountdownPrimitive(() => ({ up: '#0f0', down: '#f00', ink: '#000' }));
  g.attach(f.series, cd as any);
  cd.set({ time: Date.now(), close: 1, up: true }, '5m', 300_000, true);
  g.dispose();
  await new Promise((r) => setTimeout(r, 1200));
  assert.equal(f.drewAfterRemove, false, 'countdown must not request a redraw after dispose');
})();

/* ── unguarded remove() reproduces the bug (documents why the guard exists) ── */
await (async () => {
  const f = fakeChart();
  const cd = new CountdownPrimitive(() => ({ up: '#0f0', down: '#f00', ink: '#000' }));
  f.series.attachPrimitive(cd);
  cd.set({ time: Date.now(), close: 1, up: true }, '5m', 300_000, true);
  f.chart.remove();
  await new Promise((r) => setTimeout(r, 1200));
  assert.equal(f.drewAfterRemove, true, 'bare remove() leaves the timer redrawing a dead chart');
  cd.detached(); // stop the timer so the process exits
})();

/* ── re-attach without detach does not stack timers ── */
{
  const cd = new CountdownPrimitive(() => ({ up: '', down: '', ink: '' }));
  const p = { series: {}, chart: {}, requestUpdate() {} } as any;
  cd.attached(p); cd.attached(p);
  cd.detached();
  assert.equal((cd as any).timer, null);
}

/* ── global-handler classifier ── */
assert.equal(isDisposedChartError(new Error('Object is disposed')), true);
assert.equal(isDisposedChartError('Uncaught Error: Object is disposed'), true);
assert.equal(isDisposedChartError(new Error('useRef is not defined')), false);
assert.equal(isDisposedChartError(undefined), false);

console.log('chart-guard: all checks passed');
