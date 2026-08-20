/**
 * SIGNAL GEOMETRY — the engineering layer behind the Oracle page.
 *
 * Every number the signal view shows is derived here, once, from the pick the engine
 * already produces. Pure functions: same input → same output, no fetching, no display.
 *
 * What it computes (each maps to something the desk actually reads):
 *   • R-multiples — risk = |entry − stop|; every level expressed as R away from live.
 *   • T2 — a second target at 2× the T1 R-multiple. We never had one; the desk always
 *     shows T1 AND T2, and a scale-out plan needs two rungs.
 *   • Progress — how far live has travelled entry → T1 (direction-aware).
 *   • Pace / horizon — how much of the holding window is spent vs progress made. A trade
 *     that's 20% to target with 80% of its time gone is failing even while "green".
 *   • Status — PENDING TRIGGER before entry fills, IN PLAY, AT TARGET, NEAR STOP.
 *   • Profit-taking plan — scale 40% at T1 + trail stop to entry, close the rest at T2.
 *   • Components — VALIDITY / PROGRESS / PACE / OVERLAY, the four sub-scores.
 */

export interface GeomInput {
  direction: 'long' | 'short';
  entryPrice: number;
  targetPrice: number;      // T1
  stopLoss: number;
  live: number;
  riskRewardRatio?: number | null;
  holdingPeriod?: string | null;
  generatedAt?: string | null;
  convictionScore?: number | null;
  /** Peak favourable price seen since entry, when the backend has tracked it. */
  extremePrice?: number | null;
}

export type SignalStatus = 'pending_trigger' | 'in_play' | 'at_target' | 'near_stop' | 'invalidated';

export interface Level {
  key: 'stop' | 'entry' | 'live' | 't1' | 't2';
  label: string;
  price: number;
  /** signed % from live (+ = above live) */
  pctFromLive: number;
  /** distance from live in R (always >= 0) */
  rAway: number;
  /** the level's own R-multiple measured from entry (stop = -1R, T1 = +xR) */
  rFromEntry: number;
}

export interface Component { key: 'validity' | 'progress' | 'pace' | 'overlay'; label: string; value: number; why: string }

export interface SignalGeometry {
  risk: number;                 // $ per share to the stop
  reward: number;               // $ per share to T1
  rr: number;                   // reward : risk at entry
  t2: number;
  levels: Level[];
  progressPct: number;          // 0–100 entry → T1
  pnlPct: number;               // direction-aware, from entry
  daysHeld: number;
  horizonDays: number;
  horizonUsedPct: number;
  drawdownPct: number;          // adverse excursion from entry (0 if none)
  status: SignalStatus;
  statusLabel: string;
  components: Component[];
  plan: { rung: 'T1' | 'T2'; price: number; action: string; active: boolean }[];
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/** Max days the thesis is given, by holding period. */
export function horizonDaysFor(holdingPeriod?: string | null): number {
  switch ((holdingPeriod || '').toLowerCase()) {
    case 'day': return 1;
    case 'swing': return 5;
    case 'week-ending': return 5;
    case 'position': return 30;
    default: return 10;
  }
}

export function computeGeometry(i: GeomInput): SignalGeometry {
  const long = i.direction !== 'short';
  const entry = i.entryPrice;
  const live = i.live > 0 ? i.live : entry;

  // risk / reward per share, direction-aware
  const risk = Math.max(Math.abs(entry - i.stopLoss), 1e-6);
  const reward = Math.abs(i.targetPrice - entry);
  const rr = i.riskRewardRatio && i.riskRewardRatio > 0 ? i.riskRewardRatio : reward / risk;

  // T2 sits at twice T1's R-multiple — the second scale-out rung.
  const t1R = reward / risk;
  const t2 = long ? entry + risk * t1R * 2 : entry - risk * t1R * 2;

  const mk = (key: Level['key'], label: string, price: number): Level => ({
    key, label, price,
    pctFromLive: live > 0 ? ((price - live) / live) * 100 : 0,
    rAway: Math.abs(price - live) / risk,
    rFromEntry: (long ? price - entry : entry - price) / risk,
  });

  const levels: Level[] = [
    mk('t2', 'T2', t2),
    mk('t1', 'T1', i.targetPrice),
    mk('live', 'LIVE', live),
    mk('entry', 'ENTRY', entry),
    mk('stop', 'STOP', i.stopLoss),
  ].sort((a, b) => b.price - a.price);

  // travelled entry → T1
  const span = long ? i.targetPrice - entry : entry - i.targetPrice;
  const done = long ? live - entry : entry - live;
  const progressPct = span > 0 ? clamp((done / span) * 100) : 0;

  const pnlPct = entry > 0 ? ((long ? live - entry : entry - live) / entry) * 100 : 0;

  // time
  const started = i.generatedAt ? Date.parse(i.generatedAt) : NaN;
  const daysHeld = Number.isNaN(started) ? 0 : Math.max(0, (Date.now() - started) / 86_400_000);
  const horizonDays = horizonDaysFor(i.holdingPeriod);
  const horizonUsedPct = clamp((daysHeld / horizonDays) * 100);

  // adverse excursion: how far it went against us from entry
  const adverse = i.extremePrice != null
    ? (long ? entry - Math.min(i.extremePrice, live) : Math.max(i.extremePrice, live) - entry)
    : (long ? entry - live : live - entry);
  const drawdownPct = entry > 0 ? Math.max(0, (adverse / entry) * 100) : 0;

  // status
  const triggered = long ? live >= entry : live <= entry;
  const hitStop = long ? live <= i.stopLoss : live >= i.stopLoss;
  const nearStop = Math.abs(live - i.stopLoss) / risk <= 0.25;
  let status: SignalStatus = 'in_play';
  if (hitStop) status = 'invalidated';
  else if (!triggered) status = 'pending_trigger';
  else if (progressPct >= 95) status = 'at_target';
  else if (nearStop) status = 'near_stop';

  const statusLabel = {
    pending_trigger: 'PENDING TRIGGER',
    in_play: 'IN PLAY',
    at_target: 'AT TARGET',
    near_stop: 'NEAR STOP',
    invalidated: 'INVALIDATED',
  }[status];

  // ── the four sub-scores ──────────────────────────────────────────────
  // VALIDITY — is the setup still structurally intact? Conviction, decayed by how much
  // of the risk budget has been spent moving against us.
  const riskSpent = clamp((Math.max(0, long ? entry - live : live - entry) / risk) * 100);
  const validity = clamp(Math.round((i.convictionScore != null ? clamp(i.convictionScore * 1.8) : 60) * (1 - riskSpent / 200)));

  // PACE — progress made vs time spent. 100 = on or ahead of schedule.
  const pace = horizonUsedPct <= 0 ? 100 : clamp(Math.round((progressPct / Math.max(horizonUsedPct, 1)) * 100));

  // OVERLAY — how much of the R:R is still ahead of us (unrealised opportunity).
  const overlay = clamp(Math.round(100 - progressPct * 0.6 - riskSpent * 0.4));

  const components: Component[] = [
    { key: 'validity', label: 'VALIDITY', value: validity, why: `${riskSpent.toFixed(0)}% of risk budget used` },
    { key: 'progress', label: 'PROGRESS', value: Math.round(progressPct), why: 'entry → T1' },
    { key: 'pace',     label: 'PACE',     value: pace,     why: `${horizonUsedPct.toFixed(0)}% of horizon spent` },
    { key: 'overlay',  label: 'OVERLAY',  value: overlay,  why: 'opportunity still ahead' },
  ];

  // scale-out plan
  const plan: SignalGeometry['plan'] = [
    { rung: 'T1', price: i.targetPrice, action: 'Scale out 40%, trail stop to entry', active: status === 'in_play' || status === 'pending_trigger' },
    { rung: 'T2', price: t2, action: 'Close remaining 60%', active: status === 'at_target' },
  ];

  return {
    risk, reward, rr, t2, levels, progressPct, pnlPct,
    daysHeld, horizonDays, horizonUsedPct, drawdownPct,
    status, statusLabel, components, plan,
  };
}
