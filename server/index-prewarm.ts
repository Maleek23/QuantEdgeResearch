/**
 * INDEX PRE-OPEN WARM — the index 0DTE engine must be able to see at 09:30.
 * ==========================================================================
 * 2026-10-01 the engine was blind until 10:16 ET: every SPY/QQQ GEX snapshot
 * was a COLD chain fetch (the 90 s chain cache and 60 s aggregate cache expire
 * between 5-minute scans), queued FIFO behind every other job's Alpaca requests
 * on a saturated 1-vCPU droplet, and timed out at 12 s.
 *
 * Now, in the dedicated index lane of the heavy-job gate (never behind the
 * main lane) and in Alpaca's priority request lane:
 *   09:20–09:28 ET every 2 min  warm SPY → QQQ → IWM chains + GEX snapshots
 *                               (SPY first: SPX is translated from it) and the
 *                               desk's SPX chain (CBOE).
 *   09:30–10:00 ET every 2 min  refresh them (snapshots older than 100 s are
 *                               recomputed), plus the live SPX/SPY ratio.
 * Every pass reports to the watchdog (server/index-engine-health.ts).
 * INDEX_PREWARM=off disables it.
 */
import { logger } from './logger';
import { etMinuteOf } from './lib/heavy-job-gate';

export const PREWARM_SYMBOLS = ['SPY', 'QQQ', 'IWM'] as const;
export const PREWARM_START_MIN = 9 * 60 + 20;
export const PREWARM_END_MIN = 10 * 60; // last refresh at 10:00
const WARM_TIMEOUT_MS = 45_000;
const REFRESH_MAX_AGE_MS = 100_000;

/** 'warm' (09:20–09:29), 'refresh' (09:30–10:00), else null. Weekdays only. */
export function prewarmPhase(nowMs: number): 'warm' | 'refresh' | null {
  const { weekday, min } = etMinuteOf(nowMs);
  if (!weekday || min < PREWARM_START_MIN || min > PREWARM_END_MIN) return null;
  return min < 9 * 60 + 30 ? 'warm' : 'refresh';
}

export interface PrewarmResult { phase: 'warm' | 'refresh' | null; ok: string[]; failed: string[]; spx: { ok: boolean; source: string | null } | null; ratio: string | null; ms: number }

/** Test seam for the SPX desk chain + ratio steps (both hit the network). */
let extras: { spx?: () => Promise<{ ok: boolean; source: string | null }>; ratio?: (spy: { price: number; atMs: number } | null) => Promise<string | null> } = {};
export function __setPrewarmExtrasForTest(x: typeof extras): void { extras = x; }

export async function runIndexPrewarm(nowMs = Date.now()): Promise<PrewarmResult> {
  const phase = prewarmPhase(nowMs);
  const t0 = Date.now();
  if (!phase || process.env.INDEX_PREWARM === 'off') return { phase, ok: [], failed: [], spx: null, ratio: null, ms: 0 };
  const { getGexSnapshotBatch } = await import('./gex-snapshot-service');
  const { withAlpacaPriority } = await import('./alpaca-options');
  // Sequential (concurrency 1): the Alpaca queue is serial anyway, and SPY must be ready first.
  const snaps = await withAlpacaPriority(() => getGexSnapshotBatch([...PREWARM_SYMBOLS], { concurrency: 1, timeoutMs: WARM_TIMEOUT_MS, maxAgeMs: REFRESH_MAX_AGE_MS }));
  const ok = PREWARM_SYMBOLS.filter((s) => snaps.has(s));
  const failed = PREWARM_SYMBOLS.filter((s) => !snaps.has(s));

  let spx: PrewarmResult['spx'] = null;
  try {
    spx = await (extras.spx ?? (async () => (await import('./zero-dte-desk')).warmDeskChain('SPX')))();
  } catch (e) {
    spx = { ok: false, source: null };
    logger.warn(`[INDEX-PREWARM] SPX chain warm failed: ${(e as Error).message}`);
  }

  // The cash index does not trade pre-market: only measure the ratio once it does.
  let ratio: string | null = null;
  const spy = snaps.get('SPY');
  if (phase === 'refresh') {
    try {
      const spyObs = spy ? { price: spy.spot, atMs: Date.parse(spy.fetchedAt) } : null;
      ratio = await (extras.ratio ?? (async (o) => (await (await import('./spx-ratio')).getSpxPerSpy(o))?.label ?? null))(spyObs);
    } catch { /* labelled downstream */ }
  }

  const { noteIndexCycle } = await import('./index-engine-health');
  noteIndexCycle('prewarm', spy ?? null, spy ? null : 'pre-open warm: SPY GEX snapshot not ready (chain fetch failed or timed out)');
  const ms = Date.now() - t0;
  logger.info(`[INDEX-PREWARM] ${phase}: GEX ${ok.join('/') || '—'} ready${failed.length ? `, ${failed.join('/')} NOT ready` : ''} · SPX chain ${spx?.ok ? spx.source : 'not ready'}${ratio ? ` · ${ratio}` : ''} · ${(ms / 1000).toFixed(1)}s`);
  return { phase, ok: [...ok], failed: [...failed], spx, ratio, ms };
}
