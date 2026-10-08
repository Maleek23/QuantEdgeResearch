/**
 * 0DTE ACTIONABILITY — one state for every row on the 0DTE desk.
 *
 * Operator (2026-10-06): "we need a way to grey out". Every row the desk shows
 * (0DTE ideas, flow ignition, sniper triggers) is classified into ONE of:
 *
 *   LIVE          trigger fired, inside its entry window, contract quote fresh → tradeable now
 *   ARMED         forming, trigger within ARMED_DIST_PCT of price, entries open
 *   WATCH         forming, trigger still far away (or entries not open yet)
 *   PASSED        fired, but the entry window is gone — running to its exit, manage only
 *   DONE·REACHED  target reached
 *   DONE·FADED    stopped / faded
 *   EXPIRED       time stop, entry window closed without a trigger, or session closed
 *   STALE QUOTE   would be LIVE, but the contract quote is missing or too old to act on
 *
 * Only LIVE and ARMED are `actionable`; everything else renders greyed but
 * stays on screen with its reason (stack, never hide).
 *
 * Pure: no I/O, no Date.now() — the caller passes `nowMs`. Shared by the
 * client (zero-dte-desk.tsx / zero-dte-ideas.tsx) and scripts/test-zero-dte-actionability.ts.
 */

export type Act = 'live' | 'armed' | 'watch' | 'passed' | 'done_reached' | 'done_faded' | 'expired' | 'stale';

export interface ActState {
  state: Act;
  /** Short badge text — the state is carried by the word, never colour alone. */
  label: string;
  /** Why, in a few words ("trigger 0.12% away", "quote 4m old"). */
  reason: string;
  /** LIVE / ARMED only. */
  actionable: boolean;
  /** Sort key: lower = more actionable. */
  rank: number;
}

export const ACT_LABEL: Record<Act, string> = {
  live: 'LIVE', armed: 'ARMED', watch: 'WATCH', passed: 'PASSED',
  done_reached: 'DONE · REACHED', done_faded: 'DONE · FADED', expired: 'EXPIRED', stale: 'STALE QUOTE',
};
const RANK: Record<Act, number> = { live: 0, armed: 1, stale: 2, watch: 3, passed: 4, done_reached: 5, done_faded: 6, expired: 7 };

export const ACT_CFG = {
  /** A contract quote older than this is not something to enter on (flow engine refuses > 2 min too). */
  QUOTE_STALE_SEC: 120,
  /** WATCH → ARMED when the trigger is this close to price (percent of price). */
  ARMED_DIST_PCT: 0.25,
  /** Flow ignition: a fired row is enterable for this long; after that the premium has moved. */
  FLOW_FRESH_MIN: 15,
  /** Flow ignition entry window ends 11:30 ET (server/zero-dte-flow-core.ts). */
  FLOW_ENTRY_END_MIN: 11 * 60 + 30,
  /** Sniper: a published trigger is enterable for this long after it printed. */
  SNIPER_FRESH_MIN: 10,
  /** Regular session, ET minutes. */
  OPEN_MIN: 9 * 60 + 30,
  CLOSE_MIN: 16 * 60,
  ENTRIES_OPEN_MIN: 9 * 60 + 45,
  ENTRIES_CLOSE_MIN: 15 * 60 + 45,
  POWER_HOUR_MIN: 15 * 60,
} as const;

export type PhaseId = 'pre' | 'open_drive' | 'midday' | 'power_hour' | 'closed' | string;

export interface ActCtx {
  nowMs: number;
  /** server/zero-dte-desk-core.ts sessionPhase().id — 'closed' covers weekends. */
  phaseId: PhaseId;
  entriesOpen: boolean;
}

const mk = (state: Act, reason: string): ActState => ({ state, label: ACT_LABEL[state], reason, actionable: state === 'live' || state === 'armed', rank: RANK[state] });

/** Minutes since ET midnight. */
export function etMinutesOf(nowMs: number): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(nowMs));
  return (Number(p.find((x) => x.type === 'hour')?.value ?? 0) % 24) * 60 + Number(p.find((x) => x.type === 'minute')?.value ?? 0);
}
/** Seconds since ET midnight (for countdowns). */
export function etSecondsOf(nowMs: number): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(new Date(nowMs));
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return (g('hour') % 24) * 3600 + g('minute') * 60 + g('second');
}
/** "HH:MM" → minutes, or null. */
export function hhmmToMin(s: string | null | undefined): number | null {
  const m = s ? /^(\d{1,2}):(\d{2})/.exec(s) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
const secAge = (iso: string | null | undefined, nowMs: number) => (iso ? Math.max(0, Math.round((nowMs - Date.parse(iso)) / 1000)) : null);
export const fmtAge = (sec: number | null) => (sec == null ? 'age —' : sec < 90 ? `${sec}s` : sec < 5400 ? `${Math.round(sec / 60)}m` : `${(sec / 3600).toFixed(1)}h`);

/** Classify a done reason string from the desk / tracker. Time stop is checked before "stop". */
export function doneKind(reason: string | null | undefined): 'done_reached' | 'done_faded' | 'expired' {
  const r = String(reason ?? '').toLowerCase();
  if (/time stop|expired|time_stop|session closed/.test(r)) return 'expired';
  if (/target|reached|hit_target/.test(r)) return 'done_reached';
  if (/stop|faded|invalidat/.test(r)) return 'done_faded';
  return 'expired';
}

/* ── 0DTE ideas (server/zero-dte-ideas-core.ts stages) ── */
export interface IdeaActInput {
  stage: 'watch' | 'triggered' | 'in_play' | 'done';
  doneReason: string | null;
  distPct: number | null;
  hasContract: boolean;
  quote: { mid: number | null; at: string | null } | null;
  /** HH:MM ET — last minute the policy can still fire / enter. */
  entryBy: string | null;
  /** HH:MM ET — hard time stop. */
  exitBy: string | null;
}

export function ideaActionability(x: IdeaActInput, ctx: ActCtx): ActState {
  const m = etMinutesOf(ctx.nowMs);
  if (x.stage === 'done') {
    const k = doneKind(x.doneReason);
    return mk(k, x.doneReason ?? (k === 'expired' ? 'time stop' : k === 'done_reached' ? 'target reached' : 'stopped'));
  }
  if (ctx.phaseId === 'closed') return mk('expired', 'session closed');
  const exitMin = hhmmToMin(x.exitBy);
  if (exitMin != null && m >= exitMin && ctx.phaseId !== 'pre') return mk('expired', `past exit-by ${x.exitBy} ET`);
  const entryMin = hhmmToMin(x.entryBy);
  if (x.stage === 'in_play') return mk('passed', `entry window passed${x.entryBy ? ` (${x.entryBy})` : ''} — running to exit ${x.exitBy ?? '—'} ET`);
  if (x.stage === 'triggered') {
    if (entryMin != null && m > entryMin) return mk('passed', `entry window closed ${x.entryBy} ET`);
    if (!x.hasContract) return mk('stale', 'no contract inside the caps');
    const age = secAge(x.quote?.at, ctx.nowMs);
    if (x.quote?.mid == null || age == null) return mk('stale', 'no live quote on the contract');
    if (age > ACT_CFG.QUOTE_STALE_SEC) return mk('stale', `quote ${fmtAge(age)} old — re-check before entry`);
    return mk('live', `triggered${x.entryBy ? ` · enter by ${x.entryBy} ET` : ''}`);
  }
  // watch
  if (ctx.phaseId === 'pre' || m < ACT_CFG.ENTRIES_OPEN_MIN) return mk('watch', `entries open ${hhmm(ACT_CFG.ENTRIES_OPEN_MIN)} ET`);
  if (!ctx.entriesOpen) return mk('expired', `entry window closed ${hhmm(ACT_CFG.ENTRIES_CLOSE_MIN)} ET — never triggered`);
  if (entryMin != null && m > entryMin) return mk('expired', `entry window closed ${x.entryBy} ET — never triggered`);
  const d = x.distPct == null ? null : Math.abs(x.distPct);
  if (d != null && d <= ACT_CFG.ARMED_DIST_PCT) return mk('armed', `trigger ${d.toFixed(2)}% away`);
  return mk('watch', d != null ? `trigger ${d.toFixed(2)}% away` : 'trigger distance unknown');
}

/* ── flow ignition (server/zero-dte-flow-core.ts states) ── */
export interface FlowActInput {
  state: 'watch' | 'fired' | 'reached' | 'faded';
  /** ISO — when the row entered its state (fire time for fired rows). */
  at: string;
  /** Contract quote age in seconds as of NOW (cycle age + quote age), null when no quote. */
  quoteAgeSec: number | null;
  hasPlan: boolean;
  stateWhy: string | null;
  reason: string | null;
}

export function flowActionability(r: FlowActInput, ctx: ActCtx): ActState {
  const m = etMinutesOf(ctx.nowMs);
  if (r.state === 'reached') return mk('done_reached', r.stateWhy ?? 'reached +50%');
  if (r.state === 'faded') return mk(/time stop/i.test(r.stateWhy ?? '') ? 'expired' : 'done_faded', r.stateWhy ?? 'faded');
  if (ctx.phaseId === 'closed') return mk('expired', 'session closed');
  if (r.state === 'watch') {
    if (m > ACT_CFG.FLOW_ENTRY_END_MIN) return mk('expired', `flow window closed ${hhmm(ACT_CFG.FLOW_ENTRY_END_MIN)} ET — never confirmed`);
    return mk('watch', r.reason ? `waiting: ${r.reason}` : 'waiting for structure');
  }
  // fired
  const sinceMin = Math.max(0, Math.round((ctx.nowMs - Date.parse(r.at)) / 60_000));
  if (m > ACT_CFG.FLOW_ENTRY_END_MIN) return mk('passed', `entry window closed ${hhmm(ACT_CFG.FLOW_ENTRY_END_MIN)} ET — manage only`);
  if (sinceMin > ACT_CFG.FLOW_FRESH_MIN) return mk('passed', `fired ${sinceMin}m ago — premium has moved, manage only`);
  if (!r.hasPlan || r.quoteAgeSec == null) return mk('stale', 'no live quote on the contract');
  if (r.quoteAgeSec > ACT_CFG.QUOTE_STALE_SEC) return mk('stale', `quote ${fmtAge(r.quoteAgeSec)} old — re-check before entry`);
  return mk('live', `fired ${sinceMin}m ago`);
}

/* ── sniper (server/zero-dte-sniper.ts rows) ── */
export interface SniperActInput { status: 'published' | 'watch'; triggerAt: string; contracts: number }

export function sniperActionability(r: SniperActInput, ctx: ActCtx): ActState {
  if (ctx.phaseId === 'closed') return mk('expired', 'session closed');
  const sinceMin = Math.max(0, Math.round((ctx.nowMs - Date.parse(r.triggerAt)) / 60_000));
  if (r.status !== 'published') return mk('watch', sinceMin > ACT_CFG.SNIPER_FRESH_MIN ? `watch row · ${sinceMin}m ago (setup not proven)` : 'watch row (setup not proven in replay)');
  if (sinceMin > ACT_CFG.SNIPER_FRESH_MIN) return mk('passed', `triggered ${sinceMin}m ago — manage only`);
  if (r.contracts === 0) return mk('stale', 'no contract read');
  return mk('live', `triggered ${sinceMin}m ago`);
}

/* ── session banner ── */
export interface SessionBanner {
  id: 'pre' | 'open' | 'power_hour' | 'closed';
  label: string;
  /** What the countdown runs to ("opens", "entries open", "power hour", "entries close", "close"). */
  next: string | null;
  /** Seconds to `next`, null when closed. */
  secondsLeft: number | null;
  /** Seconds to the 16:00 close, null outside the session. */
  toCloseSec: number | null;
}
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** `phaseId` from the server wins for 'closed' (weekends; holidays are not modelled). */
export function sessionBanner(nowMs: number, phaseId: PhaseId): SessionBanner {
  const s = etSecondsOf(nowMs);
  const at = (min: number) => min * 60 - s;
  const C = ACT_CFG;
  if (phaseId === 'closed' || s >= C.CLOSE_MIN * 60) return { id: 'closed', label: 'Closed', next: null, secondsLeft: null, toCloseSec: null };
  if (s < C.OPEN_MIN * 60) return { id: 'pre', label: 'Pre-market', next: 'opens 09:30', secondsLeft: at(C.OPEN_MIN), toCloseSec: null };
  const toClose = at(C.CLOSE_MIN);
  if (s < C.ENTRIES_OPEN_MIN * 60) return { id: 'open', label: 'Open · first 15 min', next: 'entries open 09:45', secondsLeft: at(C.ENTRIES_OPEN_MIN), toCloseSec: toClose };
  if (s < C.POWER_HOUR_MIN * 60) return { id: 'open', label: 'Open', next: 'power hour 15:00', secondsLeft: at(C.POWER_HOUR_MIN), toCloseSec: toClose };
  if (s < C.ENTRIES_CLOSE_MIN * 60) return { id: 'power_hour', label: 'Power hour', next: 'entries close 15:45', secondsLeft: at(C.ENTRIES_CLOSE_MIN), toCloseSec: toClose };
  return { id: 'power_hour', label: 'Power hour · no new entries', next: 'close 16:00', secondsLeft: toClose, toCloseSec: toClose };
}
export const fmtCountdown = (sec: number | null) => {
  if (sec == null) return '—';
  const v = Math.max(0, Math.round(sec));
  const h = Math.floor(v / 3600); const mm = Math.floor((v % 3600) / 60); const ss = v % 60;
  return h > 0 ? `${h}h ${String(mm).padStart(2, '0')}m` : `${mm}:${String(ss).padStart(2, '0')}`;
};

/* ── index engine health ── */
export interface IndexHealthInput {
  /** ISO — last index-engine pass, null when it has never run in this process. */
  scanAt: string | null;
  /** ISO — SPY GEX snapshot the last pass used, null when it had none. */
  gexAt: string | null;
  /** First wait reason for SPY, if any. */
  wait: string | null;
}
export interface IndexHealth { tone: 'ok' | 'warn' | 'blind' | 'idle'; text: string; scanAgeSec: number | null; gexAgeSec: number | null }
export const INDEX_HEALTH_CFG = { GEX_OK_SEC: 180, GEX_WARN_SEC: 600, SCAN_WARN_SEC: 420 } as const;

/** Phases in which the index engine is expected to run. Anything else — 'closed',
 *  'pre', 'after_hours', 'post', an unknown id — is outside the session, and the
 *  ET clock must also sit inside 09:30–16:00 (audit 2026-10-07 #4: after-hours
 *  read as in-session and painted "BLIND" in the loss colour). */
export const IN_SESSION_PHASES: ReadonlySet<string> = new Set(['open_drive', 'midday', 'power_hour', 'open', 'regular']);
export function isRegularSessionPhase(phaseId: PhaseId, nowMs: number): boolean {
  if (!IN_SESSION_PHASES.has(String(phaseId))) return false;
  const m = etMinutesOf(nowMs);
  return m >= ACT_CFG.OPEN_MIN && m < ACT_CFG.CLOSE_MIN;
}

export function indexHealth(h: IndexHealthInput | null | undefined, nowMs: number, phaseId: PhaseId): IndexHealth {
  const scanAge = secAge(h?.scanAt, nowMs); const gexAge = secAge(h?.gexAt, nowMs);
  const inSession = isRegularSessionPhase(phaseId, nowMs);
  if (!inSession) return { tone: 'idle', text: `idle outside the session${gexAge != null ? ` · last SPY GEX snapshot ${fmtAge(gexAge)} old` : ''}`, scanAgeSec: scanAge, gexAgeSec: gexAge };
  if (!h || scanAge == null) return { tone: 'blind', text: 'BLIND — the index engine has not run this session', scanAgeSec: null, gexAgeSec: null };
  if (gexAge == null) return { tone: 'blind', text: `BLIND — no SPY GEX snapshot${h.wait ? ` (${h.wait})` : ''} · last pass ${fmtAge(scanAge)} ago`, scanAgeSec: scanAge, gexAgeSec: null };
  const C = INDEX_HEALTH_CFG;
  if (gexAge > C.GEX_WARN_SEC) return { tone: 'blind', text: `BLIND — SPY GEX snapshot ${fmtAge(gexAge)} old · last pass ${fmtAge(scanAge)} ago`, scanAgeSec: scanAge, gexAgeSec: gexAge };
  if (gexAge > C.GEX_OK_SEC || scanAge > C.SCAN_WARN_SEC) return { tone: 'warn', text: `lagging — SPY GEX ${fmtAge(gexAge)} old · last pass ${fmtAge(scanAge)} ago`, scanAgeSec: scanAge, gexAgeSec: gexAge };
  return { tone: 'ok', text: `SPY GEX ${fmtAge(gexAge)} old · last pass ${fmtAge(scanAge)} ago`, scanAgeSec: scanAge, gexAgeSec: gexAge };
}

/* ── filters ── */
export type DeskFilter = 'all' | 'index' | 'mega' | 'flow';
/** Index lane = the cash indices and their ETFs (the index engine + SPX mirror). */
export const INDEX_SYMBOLS = new Set(['SPX', 'SPXW', 'SPY', 'QQQ', 'IWM', 'NDX', 'XSP', 'DIA', 'RUT']);
export const isIndexSymbol = (s: string) => INDEX_SYMBOLS.has(s.toUpperCase());
export const isDoneLike = (a: Act) => a === 'done_reached' || a === 'done_faded' || a === 'expired';
