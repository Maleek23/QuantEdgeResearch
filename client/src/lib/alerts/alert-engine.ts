/**
 * ALERT ENGINE — fires on what CHANGED, not on what is.
 *
 * "You go to settings and you just want to get alerts for stuff… it will alert you when
 * you're actively in the platform." So these are in-app alerts on the events a trader
 * actually needs interrupting for, and the platform already computes every one of them:
 * the signal geometry produces PENDING TRIGGER / IN PLAY / AT TARGET / NEAR STOP /
 * INVALIDATED, and the score tracker produces rating moves. An alert is simply a
 * TRANSITION between two observations — which is why this is a diff, not a threshold check.
 *
 * State lives in localStorage so an alert fires once, not on every poll, and survives a
 * reload. Quiet hours and per-type toggles are respected before anything is emitted.
 */
import type { ConvictionPick } from '@/lib/convictions';
import { computeGeometry, type SignalStatus } from '@/lib/oracle/signal-geometry';
import { liveMark } from '@shared/live-mark';
import { convictionDisplayPercent } from '@shared/conviction-display';

/**
 * The one scale alerts read and print: the 0–100 display index every board shows
 * (shared/conviction-display.ts) — never the raw ~0–35 confluence points. Audit
 * 2026-10-01 P0 #8: "High conviction (90+)" compared the raw score to 90 and so
 * could never fire.
 */
export const HIGH_CONVICTION_DISPLAY = 90;
export const RATING_JUMP_DISPLAY = 5;
export function alertScore(p: Pick<ConvictionPick, 'convictionScore'>): number {
  return convictionDisplayPercent(p.convictionScore);
}

export type AlertType =
  | 'new_signal'
  | 'trigger_confirmed'
  | 'target_hit'
  | 'danger_zone'
  | 'invalidated'
  | 'rating_jump'
  | 'high_conviction';

export interface AlertEvent {
  id: string;
  type: AlertType;
  symbol: string;
  ideaId: string;
  title: string;
  detail: string;
  /** 'good' | 'bad' | 'info' — drives colour and which sound plays */
  tone: 'good' | 'bad' | 'info';
  at: number;
}

export interface AlertPrefs {
  enabled: Record<AlertType, boolean>;
  sound: boolean;
  /** also post fired alerts to the configured Discord webhook */
  discord: boolean;
  quietHours: { on: boolean; start: number; end: number }; // local hours, 0–23
  /** only alert on tickers in the watchlist */
  watchlistOnly: boolean;
  minConviction: number;
}

export const ALERT_LABELS: Record<AlertType, string> = {
  new_signal:        'New signal',
  trigger_confirmed: 'Trigger confirmed',
  target_hit:        'Target hit',
  danger_zone:       'Danger zone',
  invalidated:       'Invalidation',
  rating_jump:       'Rating moved',
  high_conviction:   'High conviction (90+)',
};

export const DEFAULT_ALERT_PREFS: AlertPrefs = {
  enabled: {
    new_signal: true, trigger_confirmed: true, target_hit: true,
    danger_zone: true, invalidated: true, rating_jump: false, high_conviction: true,
  },
  sound: true,
  discord: false,
  quietHours: { on: false, start: 22, end: 7 },
  watchlistOnly: false,
  minConviction: 0,
};

const PREFS_KEY = 'qe-alert-prefs-v1';
// v2: scores are stored on the display scale (v1 held raw points — a v1 read would fire false rating moves).
const STATE_KEY = 'qe-alert-state-v2';
const FEED_KEY  = 'qe-alert-feed-v1';
const MAX_FEED  = 60;

/** status is null when the idea has never been seen with a live quote. score is on the display scale. */
interface Seen { status: SignalStatus | null; score: number; at: number }

function read<T>(key: string, fallback: T): T {
  try { const r = localStorage.getItem(key); return r ? { ...fallback, ...JSON.parse(r) } : fallback; }
  catch { return fallback; }
}
function write(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* quota */ }
}

export function loadAlertPrefs(): AlertPrefs { return read(PREFS_KEY, DEFAULT_ALERT_PREFS); }
export function saveAlertPrefs(p: AlertPrefs) { write(PREFS_KEY, p); }

export function loadFeed(): AlertEvent[] {
  try { return JSON.parse(localStorage.getItem(FEED_KEY) || '[]'); } catch { return []; }
}

function inQuietHours(p: AlertPrefs, now = new Date()): boolean {
  if (!p.quietHours.on) return false;
  const h = now.getHours();
  const { start, end } = p.quietHours;
  return start <= end ? h >= start && h < end : h >= start || h < end;
}

/**
 * Diff the current picks against what we last saw and return the alerts to fire.
 * Pure apart from the localStorage read/write of the seen-state — call it once per poll.
 */
export function detectAlerts(picks: ConvictionPick[], prefs: AlertPrefs): AlertEvent[] {
  if (!picks?.length) return [];
  const seen: Record<string, Seen> = (() => {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}'); } catch { return {}; }
  })();

  const now = Date.now();
  const out: AlertEvent[] = [];
  const quiet = inQuietHours(prefs);

  const push = (type: AlertType, p: ConvictionPick, title: string, detail: string, tone: AlertEvent['tone']) => {
    if (!prefs.enabled[type]) return;
    if (alertScore(p) < prefs.minConviction) return;
    out.push({ id: `${p.ideaId}:${type}:${now}`, type, symbol: p.symbol, ideaId: p.ideaId, title, detail, tone, at: now });
  };

  for (const p of picks) {
    // Live, not carried (audit 2026-10-01 P0 #7): trigger/target/stop geometry runs
    // only on a live quote. With none, status checks are skipped and the last
    // live-observed status is kept, so the transition still fires once a quote returns.
    const live = liveMark(p);
    const g = live == null ? null : computeGeometry({
      direction: p.direction, entryPrice: p.entryPrice, targetPrice: p.targetPrice,
      stopLoss: p.stopLoss, live, riskRewardRatio: p.riskRewardRatio,
      holdingPeriod: p.holdingPeriod, optionDte: p.optionDte, expiryDate: p.expiryDate,
      generatedAt: p.generatedAt, convictionScore: p.convictionScore,
      // Without the lifecycle, geometry reads every idea as pending_trigger and the
      // trigger/target/danger alerts could never fire.
      lifecycleState: p.lifecycleState,
    });
    const score = alertScore(p);
    const prev = seen[p.ideaId];

    if (!prev) {
      // First sighting. Only announce it as NEW if the engine just generated it —
      // otherwise a first page load would alert on the entire existing board.
      const ageMs = p.generatedAt ? now - Date.parse(p.generatedAt) : Infinity;
      if (ageMs < 2 * 3600_000) {
        const rr = p.riskRewardRatio ?? g?.rr;
        push('new_signal', p, `${p.symbol} — new ${p.direction === 'long' ? 'long' : 'short'}`,
          `${p.convictionBand}-band${rr != null ? ` · R:R 1:${rr.toFixed(1)}` : ''}`, 'info');
      }
      if (score >= HIGH_CONVICTION_DISPLAY) {
        push('high_conviction', p, `${p.symbol} — high conviction`, `Score ${score}/100`, 'good');
      }
    } else {
      // status transitions — the events worth interrupting for (live quote only)
      if (g && prev.status !== null && prev.status !== g.status) {
        if (g.status === 'in_play' && prev.status === 'pending_trigger') {
          push('trigger_confirmed', p, `${p.symbol} — trigger confirmed`,
            `Entry ${p.entryPrice} taken · T1 ${p.targetPrice}`, 'good');
        }
        if (g.status === 'at_target') {
          push('target_hit', p, `${p.symbol} — T1 hit`, `Scale out 40%, trail stop to entry`, 'good');
        }
        if (g.status === 'near_stop') {
          push('danger_zone', p, `${p.symbol} — danger zone`,
            `${g.levels.find((l) => l.key === 'stop')?.rAway.toFixed(1)}R from the stop`, 'bad');
        }
        if (g.status === 'invalidated') {
          push('invalidated', p, `${p.symbol} — invalidated`, `Stop ${p.stopLoss} taken out`, 'bad');
        }
      }
      // rating moves — only when the change is material (display points)
      const delta = score - prev.score;
      if (Math.abs(delta) >= RATING_JUMP_DISPLAY) {
        push('rating_jump', p, `${p.symbol} — rating ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)}`,
          `Now ${score}/100 (${p.convictionBand}-band)`, delta > 0 ? 'good' : 'bad');
      }
      if (prev.score < HIGH_CONVICTION_DISPLAY && score >= HIGH_CONVICTION_DISPLAY) {
        push('high_conviction', p, `${p.symbol} — high conviction`, `Score ${score}/100`, 'good');
      }
    }

    seen[p.ideaId] = { status: g ? g.status : (prev?.status ?? null), score, at: now };
  }

  // prune ideas we no longer track
  const liveIds = new Set(picks.map((p) => p.ideaId));
  for (const k of Object.keys(seen)) if (!liveIds.has(k)) delete seen[k];
  write(STATE_KEY, seen);

  if (quiet || out.length === 0) return [];

  // persist to the feed so alerts survive a reload
  const feed = [...out, ...loadFeed()].slice(0, MAX_FEED);
  write(FEED_KEY, feed);
  return out;
}

export function clearFeed() { write(FEED_KEY, []); }
/** Put a cleared feed back (Undo), merged with anything that fired since, newest first. */
export function restoreFeed(events: AlertEvent[]): AlertEvent[] {
  const now = loadFeed();
  const have = new Set(now.map((e) => e.id));
  const feed = [...now, ...events.filter((e) => !have.has(e.id))].sort((a, b) => b.at - a.at).slice(0, MAX_FEED);
  write(FEED_KEY, feed);
  return feed;
}
