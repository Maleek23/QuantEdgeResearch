/**
 * INDEX ENGINE WATCHDOG — "is the index 0DTE engine able to see?"
 * ================================================================
 * 2026-10-01: from the open until 10:16 ET every index cycle logged "SPY: no GEX
 * snapshot" and nobody knew — the operator missed the SPX put move and the
 * engine's first call came ~50 minutes late. The engine is BLIND when it has no
 * usable SPY GEX snapshot (missing, or older than the policies' 10-minute limit):
 *
 *   • at the 09:33 ET open check, or
 *   • for 3 consecutive in-session cycles (pre-open warm passes and index scans).
 *
 * Going blind → one ERROR log line + one ops Discord alert (OPS_ALERT_WEBHOOK_URL,
 * else ERROR_WEBHOOK_URL — the ops/admin channel; NEVER a trader-facing webhook:
 * a URL equal to any DISCORD_WEBHOOK_* is refused). Recovery → info log + one
 * ops "recovered" note. The status is written to shared state so the web
 * process can serve it: GET /api/zero-dte/desk → `indexEngineHealth`, which the
 * 0DTE page renders as a red "index engine blind since HH:MM" banner.
 */
import { logger } from './logger';
import { readShared, writeSharedSync } from './lib/shared-state';
import { readsSharedState, writesSharedState } from './lib/process-role';
import { etMinuteOf } from './lib/heavy-job-gate';

export const SPY_SNAPSHOT_MAX_AGE_MS = 10 * 60_000; // = zero-dte-policies GEX_MAX_AGE_MS
export const MISSES_TO_BLIND = 3;
export const OPEN_CHECK_MIN = 9 * 60 + 33;
const SESSION_START_MIN = 9 * 60 + 30;
const SESSION_END_MIN = 16 * 60;
const SHARED_NAME = 'index-engine-health';

export interface IndexHealthState {
  day: string | null;
  consecutiveMisses: number;
  streakStartAt: number | null;
  blindSince: number | null;
  lastSpyOkAt: number | null;
  lastCycleAt: number | null;
  lastReason: string | null;
  openCheckDone: boolean;
}

export type HealthEvent =
  | { kind: 'cycle'; at: number; spyOk: boolean; reason?: string | null; source: 'prewarm' | 'scan' }
  | { kind: 'open-check'; at: number; spyOk: boolean; reason?: string | null };

export interface IndexEngineHealth {
  status: 'ok' | 'blind' | 'unknown';
  blindSince: string | null;
  /** "HH:MM" ET — for the banner. */
  blindSinceEt: string | null;
  consecutiveMisses: number;
  lastSpySnapshotAt: string | null;
  lastCycleAt: string | null;
  reason: string | null;
  /** Ready-made banner text when blind, else null. */
  banner: string | null;
  asOf: string;
}

export const emptyHealthState = (): IndexHealthState => ({ day: null, consecutiveMisses: 0, streakStartAt: null, blindSince: null, lastSpyOkAt: null, lastCycleAt: null, lastReason: null, openCheckDone: false });

const etDay = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
export const etHm = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
function inSession(ms: number): boolean {
  const { weekday, min } = etMinuteOf(ms);
  return weekday && min >= SESSION_START_MIN && min < SESSION_END_MIN;
}
/** 09:30 ET of the session containing `ms`. */
function openOf(ms: number): number {
  const { min, secOfMin } = etMinuteOf(ms);
  return ms - ((min - SESSION_START_MIN) * 60_000 + secOfMin * 1000 + (ms % 1000));
}

/** True when `snap` is a usable SPY snapshot at `nowMs` (present and ≤ 10 min old). */
export function spySnapshotUsable(snap: { fetchedAt: string } | null | undefined, nowMs: number): boolean {
  if (!snap) return false;
  const t = Date.parse(snap.fetchedAt);
  return Number.isFinite(t) && nowMs - t <= SPY_SNAPSHOT_MAX_AGE_MS;
}

/** Pure state step. `transition` is set on the edge only (one alert per episode). */
export function stepIndexHealth(prev: IndexHealthState, ev: HealthEvent): { state: IndexHealthState; transition: 'blind' | 'recovered' | null } {
  const day = etDay(ev.at);
  const s: IndexHealthState = prev.day === day ? { ...prev } : { ...emptyHealthState(), day };
  let transition: 'blind' | 'recovered' | null = null;
  const counts = inSession(ev.at);

  if (ev.kind === 'cycle') s.lastCycleAt = ev.at;
  if (ev.kind === 'open-check') s.openCheckDone = true;

  if (ev.spyOk) {
    s.lastSpyOkAt = ev.at;
    s.consecutiveMisses = 0;
    s.streakStartAt = null;
    s.lastReason = null;
    if (s.blindSince != null) { s.blindSince = null; transition = 'recovered'; }
    return { state: s, transition };
  }

  s.lastReason = ev.reason ?? 'no SPY GEX snapshot';
  if (!counts) return { state: s, transition }; // pre-open misses do not count
  if (ev.kind === 'cycle') {
    if (s.consecutiveMisses === 0) s.streakStartAt = ev.at;
    s.consecutiveMisses++;
    if (s.blindSince == null && s.consecutiveMisses >= MISSES_TO_BLIND) {
      s.blindSince = Math.min(s.streakStartAt ?? ev.at, ...(s.lastSpyOkAt == null ? [openOf(ev.at)] : []));
      transition = 'blind';
    }
  } else if (s.blindSince == null) {
    // 09:33 and still nothing usable: blind since the open (or since the last good read, if later).
    s.blindSince = Math.max(openOf(ev.at), s.lastSpyOkAt != null ? s.lastSpyOkAt + SPY_SNAPSHOT_MAX_AGE_MS : 0);
    if (s.blindSince > ev.at) s.blindSince = ev.at;
    transition = 'blind';
  }
  return { state: s, transition };
}

export function healthView(s: IndexHealthState, nowMs: number): IndexEngineHealth {
  const iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());
  const today = s.day === etDay(nowMs);
  const status: IndexEngineHealth['status'] = !today || (s.lastCycleAt == null && !s.openCheckDone) ? 'unknown' : s.blindSince != null ? 'blind' : 'ok';
  const blindSinceEt = status === 'blind' && s.blindSince != null ? etHm(s.blindSince) : null;
  return {
    status,
    blindSince: status === 'blind' ? iso(s.blindSince) : null,
    blindSinceEt,
    consecutiveMisses: today ? s.consecutiveMisses : 0,
    lastSpySnapshotAt: iso(s.lastSpyOkAt),
    lastCycleAt: iso(s.lastCycleAt),
    reason: today ? s.lastReason : null,
    banner: blindSinceEt ? `Index engine blind since ${blindSinceEt} ET — ${s.lastReason ?? 'no SPY GEX snapshot'}. No SPX/SPY/QQQ/IWM 0DTE calls until it recovers.` : null,
    asOf: new Date(nowMs).toISOString(),
  };
}

// ─── IO ──────────────────────────────────────────────────────────────────

let state: IndexHealthState = emptyHealthState();

type AlertFn = (text: string, level: 'error' | 'info') => Promise<void>;

/** The ops/admin webhook, or null. Refuses any URL that is also a trader-facing DISCORD_WEBHOOK_*. */
export function opsWebhookUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const url = (env.OPS_ALERT_WEBHOOK_URL || env.ERROR_WEBHOOK_URL || '').trim();
  if (!url) return null;
  const traderFacing = Object.entries(env).filter(([k, v]) => k.startsWith('DISCORD_WEBHOOK') && v).map(([, v]) => String(v).trim());
  if (traderFacing.includes(url)) {
    logger.warn('[INDEX-HEALTH] ops webhook equals a trader-facing DISCORD_WEBHOOK_* — refusing to post there');
    return null;
  }
  return url;
}

const defaultAlert: AlertFn = async (text, level) => {
  const url = opsWebhookUrl();
  if (!url) return;
  const body = url.includes('discord')
    ? { embeds: [{ title: level === 'error' ? '🚨 INDEX ENGINE BLIND — QuantEdge ops' : '✅ Index engine recovered — QuantEdge ops', description: text, color: level === 'error' ? 0xe11d48 : 0x16a34a, timestamp: new Date().toISOString() }] }
    : { text };
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(4000) });
  } catch { /* observability must never throw */ }
};
let alertFn: AlertFn = defaultAlert;
let clock: () => number = () => Date.now();

/** Test seams. */
export function __setIndexHealthForTest(opts: { alert?: AlertFn | null; clock?: (() => number) | null; reset?: boolean }): void {
  if (opts.alert !== undefined) alertFn = opts.alert ?? defaultAlert;
  if (opts.clock !== undefined) clock = opts.clock ?? (() => Date.now());
  if (opts.reset) state = emptyHealthState();
}

function apply(ev: HealthEvent): IndexEngineHealth {
  const { state: next, transition } = stepIndexHealth(state, ev);
  state = next;
  const view = healthView(state, ev.at);
  if (transition === 'blind') {
    const text = `Index 0DTE engine BLIND since ${view.blindSinceEt} ET — ${view.reason}. ${ev.kind === 'open-check' ? 'No usable SPY GEX snapshot at the 09:33 ET open check.' : `${state.consecutiveMisses} consecutive in-session cycles without a usable SPY GEX snapshot.`} Last good SPY snapshot: ${state.lastSpyOkAt ? etHm(state.lastSpyOkAt) + ' ET' : 'none today'}.`;
    logger.error(`[INDEX-HEALTH] ${text}`);
    void alertFn(text, 'error').catch(() => undefined);
  } else if (transition === 'recovered') {
    const text = `Index 0DTE engine recovered at ${etHm(ev.at)} ET — SPY GEX snapshot usable again.`;
    logger.info(`[INDEX-HEALTH] ${text}`);
    void alertFn(text, 'info').catch(() => undefined);
  }
  if (writesSharedState()) writeSharedSync(SHARED_NAME, view);
  return view;
}

/** One index cycle (pre-open warm pass or index scan) finished. */
export function noteIndexCycle(source: 'prewarm' | 'scan', spySnap: { fetchedAt: string } | null | undefined, reason?: string | null): IndexEngineHealth {
  const at = clock();
  const ok = spySnapshotUsable(spySnap, at);
  return apply({ kind: 'cycle', at, spyOk: ok, source, reason: ok ? null : reason ?? (spySnap ? 'SPY GEX snapshot older than 10 min' : 'no SPY GEX snapshot (chain fetch failed or timed out)') });
}

/** The 09:33 ET check. */
export function runOpenCheck(spySnap: { fetchedAt: string } | null | undefined): IndexEngineHealth {
  const at = clock();
  const ok = spySnapshotUsable(spySnap, at);
  return apply({ kind: 'open-check', at, spyOk: ok, reason: ok ? null : spySnap ? 'SPY GEX snapshot older than 10 min at 09:33 ET' : 'no SPY GEX snapshot at 09:33 ET' });
}

/** Status for the 0DTE desk payload. ROLE=web reads the worker's file. */
export function getIndexEngineHealth(): IndexEngineHealth & { source?: string; ageSec?: number | null } {
  const now = clock();
  if (readsSharedState()) {
    const r = readShared<IndexEngineHealth>(SHARED_NAME);
    if (!r) return { ...healthView(emptyHealthState(), now), source: 'worker', ageSec: null };
    // A file from an earlier day says nothing about today.
    if (etDay(Date.parse(r.data.asOf)) !== etDay(now)) return { ...healthView(emptyHealthState(), now), source: 'worker', ageSec: Math.round(r.ageMs / 1000) };
    return { ...r.data, source: 'worker', ageSec: Math.round(r.ageMs / 1000) };
  }
  return healthView(state, now);
}
