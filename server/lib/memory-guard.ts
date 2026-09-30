/**
 * MEMORY GUARD — watch RSS, report cache sizes, trim before the box swaps.
 *
 * Budget (docs/MEMORY_BUDGET.md): the web process should peak at ≤ ~800 MB RSS
 * on the 2 GB droplet it shares with Postgres. Every minute this checks RSS;
 * above MEMORY_TRIM_RSS_MB (default 900) it evicts every registered cache to
 * 50% of its entries (least-recently-used first) and logs what it freed. Every
 * 10 minutes it sweeps expired entries and logs the largest caches, so a new
 * leak shows up in the logs by name before it shows up as swap.
 *
 * pm2's max_memory_restart is the backstop behind this, not a substitute.
 */
import v8 from 'v8';
import { logger } from '../logger';
import { listCaches, type CacheStats } from './bounded-cache';
import { heavyGateStats } from './heavy-job-gate';

const mb = (n: number) => Math.round((n / 1024 / 1024) * 10) / 10;
const TRIM_RSS_MB = Math.max(200, Number(process.env.MEMORY_TRIM_RSS_MB) || 900);
const CHECK_MS = 60_000;
const REPORT_MS = 10 * 60_000;
const TRIM_COOLDOWN_MS = 2 * 60_000;

let started = false;
let lastTrimAt = 0;
let trims = 0;
let lastTrim: { at: string; rssBeforeMb: number; rssAfterMb: number; evicted: number } | null = null;
let peakRss = 0;

function cacheStats(): CacheStats[] {
  const out: CacheStats[] = [];
  for (const c of listCaches()) {
    try { out.push(c.stats()); } catch { /* a probe must never break the report */ }
  }
  return out.sort((a, b) => (b.approxBytes ?? 0) - (a.approxBytes ?? 0) || b.entries - a.entries);
}

export function memorySnapshot() {
  const m = process.memoryUsage();
  peakRss = Math.max(peakRss, m.rss);
  const h = v8.getHeapStatistics();
  const caches = cacheStats();
  let gate: ReturnType<typeof heavyGateStats> | null = null;
  try { gate = heavyGateStats(); } catch { /* */ }
  return {
    rssMb: mb(m.rss),
    peakRssMb: mb(peakRss),
    heapUsedMb: mb(m.heapUsed),
    heapTotalMb: mb(m.heapTotal),
    heapLimitMb: mb(h.heap_size_limit),
    externalMb: mb(m.external),
    arrayBuffersMb: mb(m.arrayBuffers),
    trimThresholdMb: TRIM_RSS_MB,
    trims,
    lastTrim,
    cachesApproxMb: mb(caches.reduce((s, c) => s + (c.approxBytes ?? 0), 0)),
    caches: caches.map((c) => ({ ...c, approxMb: c.approxBytes != null ? mb(c.approxBytes) : null })),
    heavyJobs: gate,
  };
}

/** Evict every registered cache to `fraction` of its entries. */
export function trimAllCaches(fraction = 0.5, reason = 'manual'): number {
  const before = process.memoryUsage().rss;
  let evicted = 0;
  const detail: string[] = [];
  for (const c of listCaches()) {
    try {
      const n = c.trimTo(fraction);
      if (n > 0) { evicted += n; detail.push(`${c.cacheName}−${n}`); }
    } catch { /* keep trimming the rest */ }
  }
  const gc = (globalThis as any).gc as (() => void) | undefined;
  if (typeof gc === 'function') { try { gc(); } catch { /* */ } }
  const after = process.memoryUsage().rss;
  trims++;
  lastTrim = { at: new Date().toISOString(), rssBeforeMb: mb(before), rssAfterMb: mb(after), evicted };
  logger.warn(`[MEMORY-GUARD] trim (${reason}): RSS ${mb(before)} MB → ${mb(after)} MB, evicted ${evicted} entr${evicted === 1 ? 'y' : 'ies'}${detail.length ? ` [${detail.slice(0, 12).join(', ')}]` : ''}`);
  return evicted;
}

function report(): void {
  let swept = 0;
  for (const c of listCaches()) { try { swept += c.sweep(); } catch { /* */ } }
  const s = memorySnapshot();
  const top = s.caches.slice(0, 8)
    .map((c) => `${c.name}=${c.entries}${c.approxMb != null ? `/${c.approxMb}MB` : ''}`)
    .join(' ');
  logger.info(`[MEMORY-GUARD] rss ${s.rssMb} MB (peak ${s.peakRssMb}) heap ${s.heapUsedMb}/${s.heapTotalMb} MB ext ${s.externalMb} MB; caches ≈${s.cachesApproxMb} MB; swept ${swept} expired; top: ${top}`);
}

function check(): void {
  const rss = process.memoryUsage().rss;
  peakRss = Math.max(peakRss, rss);
  if (mb(rss) > TRIM_RSS_MB && Date.now() - lastTrimAt > TRIM_COOLDOWN_MS) {
    lastTrimAt = Date.now();
    trimAllCaches(0.5, `RSS ${mb(rss)} MB > ${TRIM_RSS_MB} MB`);
  }
}

export function startMemoryGuard(): void {
  if (started || process.env.MEMORY_GUARD === 'false') return;
  started = true;
  setInterval(check, CHECK_MS).unref?.();
  setInterval(report, REPORT_MS).unref?.();
  setTimeout(report, 60_000).unref?.();
  logger.info(`[MEMORY-GUARD] started — trims caches to 50% above ${TRIM_RSS_MB} MB RSS; cache report every 10 min`);
}
