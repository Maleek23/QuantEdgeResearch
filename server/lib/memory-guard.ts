/**
 * MEMORY GUARD — watch RSS, report cache sizes, trim before the box swaps.
 *
 * Budget (docs/MEMORY_BUDGET.md): the web process should peak at ≤ ~800 MB RSS
 * on the 2 GB droplet it shares with Postgres. Every minute this checks RSS;
 * above MEMORY_TRIM_RSS_MB (default 900) it evicts every registered cache to
 * 50% of its entries (least-recently-used first) and logs what it freed. Every
 * 5 s it samples RSS (peak + forced collect, see SAMPLE_MS). Every
 * 5 minutes it sweeps expired entries and logs the largest caches, so a new
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
/**
 * Fast RSS sample (2026-10-30). The worker is not leaking — after hours it idles
 * at ~230 MB RSS / ~125 MB heap for 9 h — but in session V8 lets dead chain
 * parses and board copies pile up: RSS went 351→1067→429 MB inside 40 s and one
 * collect took 944 → 396 MB, while pm2 polls every 30 s and kills at 900 MB.
 * A 60 s check could not get there first. Every 5 s: read RSS (cheap), keep the
 * window peak and which heavy jobs were running at it, and collect when RSS
 * passes MEMORY_GC_RSS_MB (default 85% of the trim line), at most every 15 s.
 */
const SAMPLE_MS = 5_000;
const GC_RSS_MB = Math.max(150, Number(process.env.MEMORY_GC_RSS_MB) || Math.round(TRIM_RSS_MB * 0.85));
const GC_COOLDOWN_MS = 15_000;
const REPORT_MS = 5 * 60_000;
const TRIM_COOLDOWN_MS = 2 * 60_000;

let started = false;
let lastTrimAt = 0;
let trims = 0;
let lastTrim: { at: string; rssBeforeMb: number; rssAfterMb: number; evicted: number } | null = null;
let peakRss = 0;
/** Peak inside the current report window, with what was running at that moment. */
let windowPeak: { rss: number; heapUsed: number; at: number; jobs: string[] } = { rss: 0, heapUsed: 0, at: 0, jobs: [] };
const gcStats = { forced: 0, freedMb: 0, lastAt: null as string | null };
let lastFastGcAt = 0;

function runningJobNames(): string[] {
  try { return heavyGateStats().running.map((r) => r.name); } catch { return []; }
}

/**
 * One fast sample: track the window peak; collect above `gcLineMb` (cooldown).
 * Exported for the bounded-memory test (scripts/test-memory-bounds.ts).
 */
export function sampleMemory(opts: { nowMs?: number; gcLineMb?: number; gc?: (() => void) | null } = {}): { rssMb: number; collected: boolean; freedMb: number } {
  const now = opts.nowMs ?? Date.now();
  const m = process.memoryUsage();
  peakRss = Math.max(peakRss, m.rss);
  if (m.rss > windowPeak.rss) windowPeak = { rss: m.rss, heapUsed: m.heapUsed, at: now, jobs: runningJobNames() };
  const gc = opts.gc !== undefined ? opts.gc : ((globalThis as any).gc as (() => void) | undefined) ?? null;
  const line = opts.gcLineMb ?? GC_RSS_MB;
  if (typeof gc === 'function' && mb(m.rss) > line && now - lastFastGcAt > GC_COOLDOWN_MS) {
    lastFastGcAt = now;
    try { gc(); } catch { /* ignore */ }
    const after = process.memoryUsage().rss;
    const freed = Math.max(0, mb(m.rss - after));
    gcStats.forced++; gcStats.freedMb = Math.round((gcStats.freedMb + freed) * 10) / 10; gcStats.lastAt = new Date(now).toISOString();
    return { rssMb: mb(after), collected: true, freedMb: freed };
  }
  return { rssMb: mb(m.rss), collected: false, freedMb: 0 };
}

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
    gcThresholdMb: GC_RSS_MB,
    windowPeak: { rssMb: mb(windowPeak.rss), heapUsedMb: mb(windowPeak.heapUsed), at: windowPeak.at ? new Date(windowPeak.at).toISOString() : null, jobs: windowPeak.jobs },
    forcedGc: { ...gcStats },
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
  const w = s.windowPeak;
  const at = w.at ? new Date(w.at).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false }) : '—';
  logger.info(`[MEMORY-GUARD] rss ${s.rssMb} MB (peak ${s.peakRssMb}; 5m peak ${w.rssMb} MB heap ${w.heapUsedMb} at ${at} ET running [${w.jobs.join(', ') || 'no heavy job'}]) heap ${s.heapUsedMb}/${s.heapTotalMb} MB ext ${s.externalMb} MB ab ${s.arrayBuffersMb} MB; gc ${gcStats.forced}× freed ${gcStats.freedMb} MB; caches ≈${s.cachesApproxMb} MB; swept ${swept} expired; top: ${top}`);
  windowPeak = { rss: 0, heapUsed: 0, at: 0, jobs: [] };
}

function check(): void {
  const rss = process.memoryUsage().rss;
  peakRss = Math.max(peakRss, rss);
  if (mb(rss) > TRIM_RSS_MB && Date.now() - lastTrimAt > TRIM_COOLDOWN_MS) {
    lastTrimAt = Date.now();
    trimAllCaches(0.5, `RSS ${mb(rss)} MB > ${TRIM_RSS_MB} MB`);
  }
  // With --expose-gc: collect when RSS passes 60% of the trim line (at most every
  // 20 s). Dead request garbage (chain parses, board copies) otherwise sits until
  // pm2's cap restarts the process — 9 web restarts on 2026-09-30 evening.
  const gc = (globalThis as any).gc as (() => void) | undefined;
  if (typeof gc === 'function' && mb(rss) > TRIM_RSS_MB * 0.6 && Date.now() - lastGcAt > 20_000) {
    lastGcAt = Date.now();
    try { gc(); } catch { /* ignore */ }
  }
}
let lastGcAt = 0;

export function startMemoryGuard(): void {
  if (started || process.env.MEMORY_GUARD === 'false') return;
  started = true;
  setInterval(check, CHECK_MS).unref?.();
  setInterval(() => { sampleMemory(); }, SAMPLE_MS).unref?.();
  setInterval(report, REPORT_MS).unref?.();
  setTimeout(report, 60_000).unref?.();
  logger.info(`[MEMORY-GUARD] started — RSS sampled every 5 s (collect above ${GC_RSS_MB} MB), caches trimmed to 50% above ${TRIM_RSS_MB} MB; memory report every 5 min`);
}

let healthStarted = false;
/**
 * Worker only (ROLE=worker): publish this process's memorySnapshot (caches, trims,
 * heavy-job gate queue) to .cache/shared/worker-health.json every 60s so the web
 * admin System-health panel can show the worker it no longer shares a heap with.
 */
export function startHealthPublisher(): void {
  if (healthStarted) return;
  healthStarted = true;
  const publish = () => {
    void import('./shared-state').then(({ writeSharedSync }) => {
      writeSharedSync('worker-health', { pid: process.pid, uptimeSec: Math.round(process.uptime()), ...memorySnapshot() });
    }).catch(() => {});
  };
  setTimeout(publish, 5_000).unref?.();
  setInterval(publish, CHECK_MS).unref?.();
}
