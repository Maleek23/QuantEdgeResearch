/**
 * SECTOR ROTATION IDEAS — pure core (no I/O). The server half is
 * server/sector-rotation-ideas.ts.
 * =========================================================================
 * Turns the sector board's rotation read (shared/sector-board.ts) into concrete,
 * stated plans, and decides which of them may be FIRED into NEXUS as trade
 * ideas (source `sector_rotation`, measured separately).
 *
 *   candidates   top Leading/Improving sectors (long) and Weakening/Lagging
 *                sectors (short) by board rank → their top confluence leaders
 *                and best catch-up laggard (one symbol appears once)
 *   entry rule   picked from the member's chips and stated:
 *                  pullback_ema20  leader > 1× ATR past its 20 EMA — don't chase
 *                  current         breakout already printed / nothing to wait for
 *                  breakout_20d    compression or near-high, 20-session closing
 *                                  high within 1.5× ATR → trigger on a close through it
 *                  vwap_reclaim    a laggard (or leader) on the wrong side of VWAP
 *                                  must reclaim it first
 *   stop/targets formula stop = just beyond the nearest CONFLUENT level (≥ 2
 *                families) on the risk side, else 1.25× daily ATR; formula T1/T2 =
 *                2R/3R. Then the platform's own snap (shared/levels/snap.ts):
 *                ATR floor first, stop beyond structure, targets only ever CLOSER
 *                and inside the loss-rule expected-move cap (maxTarget). No new math.
 *   horizon      swing (2–5 sessions) by default; day when the sector's intraday or
 *                daily ignition read is 'igniting' on the same side
 *   vehicle      stock, or a ~0.40Δ 21–45 DTE option (picked from the live chain at
 *                fire time by the existing contract engine; never 0DTE here)
 *
 * NOTHING HERE IS VALIDATED. The score study saw rotation alignment flip sign
 * between halves, and recent semis-rotation longs lost. Every suggestion is
 * 'measuring'; firing is capped per day and every fired idea carries the
 * `sector_rotation` source so its record is measured on its own.
 */
import { BOARD_CFG, emaAt, r2, type Chip, type MemberRead, type Regime, type SectorRow, type Side } from './sector-board';
import { snapPlanToStructure, type SnapHorizon } from './levels/snap';
import type { LevelCluster } from './levels/level-math';

export const ROTATION_SOURCE = 'sector_rotation';
/** dataSourceUsed prefix — the engine's record filters on it (other code paths may also say 'sector_rotation'). */
export const ROTATION_DATA_SOURCE = 'sector_board_rotation';
export const ROTATION_VERSION = 'sector-rotation-ideas-v1';

export const ROTATION_CFG = {
  sectorsPerSide: 3,
  leadersPerSector: 2,
  laggardsPerSector: 1,
  /** Level-map reads per build are bounded (2 GB droplet). */
  maxSuggestions: 14,
  /** A leader below this confluence score is not suggested. */
  minLeaderScore: 50,
  /** Auto-mode: sectors whose side-consensus count is at least this many signals. */
  autoMinConsensus: 5,
  /** Fires per ET day across manual + auto (env SECTOR_ROTATION_MAX_PER_DAY). */
  defaultDailyCap: 4,
  extendedAtr: 1,
  breakoutWithinAtr: 1.5,
  stopFloorAtr: 1.25,
  formulaTargetsR: [2, 3] as const,
  minRR: 1,
  /** Never fire into earnings within this many calendar days. */
  earningsBlockDays: 2,
  optionMinPrice: 10,
  option: { delta: 0.4, dteMin: 21, dteMax: 45 },
  autoTimesEt: ['09:50', '13:00'] as const,
} as const;

export const ROTATION_HONESTY = 'Measuring — unvalidated. The score study saw rotation alignment flip sign between halves, and recent semis-rotation longs lost. Suggestions are stated plans built from the board\'s chips and the platform\'s level map, not a recommendation; fired ideas carry source sector_rotation so this engine\'s record is measured on its own.';

export type EntryRule = 'current' | 'breakout_20d' | 'vwap_reclaim' | 'pullback_ema20';
export const ENTRY_RULE_LABEL: Record<EntryRule, string> = {
  current: 'At the current price',
  breakout_20d: 'Breakout through the 20-session high',
  vwap_reclaim: 'Reclaim of VWAP',
  pullback_ema20: 'Pullback to the 20 EMA',
};

// ─── candidates ──────────────────────────────────────────────────────────

export interface Candidate {
  key: string;
  sectorId: string; sectorLabel: string; etf: string | null; thematic: boolean;
  regime: Regime; side: Side; rank: number;
  /** Signals agreeing with the side, of n read. */
  consensus: { with: number; against: number; n: number };
  igniting: boolean;
  kind: 'leader' | 'laggard';
  symbol: string;
  member: MemberRead;
}

const LONG_REGIMES: Regime[] = ['leading', 'improving'];
const SHORT_REGIMES: Regime[] = ['weakening', 'lagging'];

export const suggestionKey = (sectorId: string, symbol: string, side: Side) => `${sectorId}|${symbol}|${side}`;

/** The sector's intraday/daily ignition read is igniting on this side (from the consensus signal text). */
export function sectorIgniting(s: Pick<SectorRow, 'consensus'>, side: Side): boolean {
  const want = side === 'long' ? 'bull' : 'bear';
  return s.consensus.signals.some((g) => (g.key === 'ign_intraday' || g.key === 'ign_daily') && g.lean === want && /^igniting/.test(g.detail));
}

export function selectCandidates(sectors: SectorRow[], cfg = ROTATION_CFG): Candidate[] {
  const ranked = sectors.filter((s) => s.rank != null && s.regime != null && s.leaders.length > 0);
  const longs = ranked.filter((s) => LONG_REGIMES.includes(s.regime!)).sort((a, b) => a.rank! - b.rank!).slice(0, cfg.sectorsPerSide);
  const shorts = ranked.filter((s) => SHORT_REGIMES.includes(s.regime!)).sort((a, b) => b.rank! - a.rank!).slice(0, cfg.sectorsPerSide);
  const seen = new Set<string>();
  const out: Candidate[] = [];
  const push = (s: SectorRow, side: Side, kind: Candidate['kind'], m: MemberRead) => {
    if (seen.has(m.symbol) || m.last == null) return false;
    seen.add(m.symbol);
    const withN = side === 'long' ? s.consensus.bull : s.consensus.bear;
    const against = side === 'long' ? s.consensus.bear : s.consensus.bull;
    out.push({
      key: suggestionKey(s.id, m.symbol, side), sectorId: s.id, sectorLabel: s.label, etf: s.etf, thematic: s.thematic,
      regime: s.regime!, side, rank: s.rank!, consensus: { with: withN, against, n: s.consensus.n },
      igniting: sectorIgniting(s, side), kind, symbol: m.symbol, member: m,
    });
    return true;
  };
  for (const [list, side] of [[longs, 'long'], [shorts, 'short']] as const) {
    for (const s of list) {
      let n = 0;
      for (const m of s.leaders) {
        if (n >= cfg.leadersPerSector) break;
        if ((m.score ?? 0) < cfg.minLeaderScore) break; // leaders are sorted by score
        if (push(s, side, 'leader', m)) n++;
      }
      let k = 0;
      for (const l of s.laggards) {
        if (k >= cfg.laggardsPerSector) break;
        const m = s.leaders.find((x) => x.symbol === l.symbol);
        if (m && push(s, side, 'laggard', m)) k++;
      }
    }
  }
  return out.sort((a, b) => b.consensus.with - a.consensus.with || (b.member.score ?? 0) - (a.member.score ?? 0) || a.rank - b.rank)
    .slice(0, cfg.maxSuggestions);
}

// ─── entry rule ──────────────────────────────────────────────────────────

export interface EntryInput {
  side: Side;
  kind: 'leader' | 'laggard';
  /** Daily closes, oldest → newest; the last is the price the plan is read at. */
  closes: number[];
  /** Override for the last close (a live quote). */
  price?: number | null;
  atr: number | null;
  vwap: number | null;
  chips: Chip[];
}
export interface EntryPlan { rule: EntryRule; entry: number; trigger: number | null; text: string; last: number; ema20: number | null; high20: number | null; low20: number | null }

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const $ = (x: number) => `$${x.toFixed(2)}`;

export function chooseEntry(i: EntryInput, cfg = ROTATION_CFG): EntryPlan | null {
  const c = i.closes.filter(fin);
  if (c.length < BOARD_CFG.emaFast) return null;
  const last = fin(i.price) && i.price > 0 ? i.price : c[c.length - 1];
  const end = c.length - 1;
  const ema20 = emaAt(c, end, BOARD_CFG.emaFast);
  const prior = c.slice(Math.max(0, end - 20), end);
  const high20 = prior.length >= 20 ? Math.max(...prior) : null;
  const low20 = prior.length >= 20 ? Math.min(...prior) : null;
  const L = i.side === 'long';
  const s = L ? 1 : -1;
  const base = { last: r2(last), ema20: ema20 == null ? null : r2(ema20), high20: high20 == null ? null : r2(high20), low20: low20 == null ? null : r2(low20) };
  const chip = (k: string) => i.chips.find((x) => x.key === k);
  const setup = chip('setup');
  const brokeOut = setup?.state === 'pass' && /breakout/.test(setup.detail);
  const tight = setup?.state === 'pass' && /compression/.test(setup.detail);
  const nearExt = chip('high')?.state === 'pass';
  const ext = ema20 != null && i.atr && i.atr > 0 ? (s * (last - ema20)) / i.atr : null;
  const extreme = L ? high20 : low20;
  const vwapWrong = i.vwap != null && (L ? last < i.vwap : last > i.vwap);
  const vwapRule = (why: string): EntryPlan => ({ ...base, rule: 'vwap_reclaim', entry: r2(i.vwap!), trigger: r2(i.vwap!), text: `${ENTRY_RULE_LABEL.vwap_reclaim} ${$(i.vwap!)} — ${why}; enter on a 5-min close back ${L ? 'above' : 'below'} it.` });
  const current = (why: string): EntryPlan => ({ ...base, rule: 'current', entry: r2(last), trigger: null, text: `${ENTRY_RULE_LABEL.current} ${$(last)} — ${why}.` });

  if (i.kind === 'laggard') {
    if (vwapWrong) return vwapRule(`catch-up candidate trading ${L ? 'below' : 'above'} VWAP; it must turn with its sector first`);
    if (i.vwap != null) return current(`catch-up candidate already ${L ? 'above' : 'below'} VWAP ${$(i.vwap)}`);
    return current('catch-up candidate; VWAP not readable outside the session — re-checked live when fired');
  }
  if (ema20 != null && ext != null && ext > cfg.extendedAtr) {
    return { ...base, rule: 'pullback_ema20', entry: r2(ema20), trigger: r2(ema20), text: `${ENTRY_RULE_LABEL.pullback_ema20} ${$(ema20)} — the leader is ${ext.toFixed(1)}× ATR ${L ? 'above' : 'below'} it; don't chase, work the order at the average.` };
  }
  if (brokeOut) return current(`breakout already printed (close ${L ? 'above' : 'below'} the prior 20-session ${L ? 'high' : 'low'}${extreme != null ? ` ${$(extreme)}` : ''})`);
  if ((tight || nearExt) && extreme != null && s * (extreme - last) > 0) {
    const room = i.atr && i.atr > 0 ? Math.abs(extreme - last) / i.atr : Math.abs(extreme / last - 1) * 100 / 2;
    if (room <= cfg.breakoutWithinAtr) {
      return { ...base, rule: 'breakout_20d', entry: r2(extreme), trigger: r2(extreme), text: `${ENTRY_RULE_LABEL.breakout_20d}: a daily close ${L ? 'above' : 'below'} the 20-session closing ${L ? 'high' : 'low'} ${$(extreme)} (${tight ? 'compression' : 'near the extreme'} — ${room.toFixed(1)}× ATR away).` };
    }
  }
  if (vwapWrong) return vwapRule(`the leader is on the wrong side of VWAP today`);
  return current('trend and chips already aligned; no trigger to wait for');
}

// ─── stop / targets via the platform snap ────────────────────────────────

export interface LevelPlanInput {
  side: Side;
  entry: number;
  clusters: LevelCluster[];
  tolerance: number;
  atr: number | null;
  horizon: SnapHorizon;
  /** Loss-rule expected-move cap on T1 (from the server's cap read), or null. */
  maxTarget: number | null;
  levelsAsOf?: string;
}
export interface LevelPlan {
  stop: number; t1: number; t2: number | null; rr: number;
  formulaStop: number; stopBasis: string; t1Basis: string; t2Basis: string | null;
  snapNotes: string[]; snapText: string; capped: boolean;
}

/** Nearest level where ≥ 2 independent families agree, strictly on the risk side of entry. */
export function nearestConfluent(side: Side, entry: number, clusters: LevelCluster[], minFamilies = 2): LevelCluster | null {
  const L = side === 'long';
  return clusters.filter((c) => c.score >= minFamilies && (L ? c.high < entry : c.low > entry))
    .sort((a, b) => (L ? b.price - a.price : a.price - b.price))[0] ?? null;
}

export function planLevels(i: LevelPlanInput, cfg = ROTATION_CFG): LevelPlan | null {
  const L = i.side === 'long'; const s = L ? 1 : -1;
  if (!(i.entry > 0)) return null;
  const sup = nearestConfluent(i.side, i.entry, i.clusters);
  let formulaStop: number; let stopBasis: string;
  if (sup) {
    formulaStop = r2((L ? sup.low : sup.high) - s * Math.max(0.01, 0.5 * i.tolerance));
    stopBasis = `beyond ${sup.label} (${sup.score} families) at ${$(L ? sup.low : sup.high)}`;
  } else if (i.atr && i.atr > 0) {
    formulaStop = r2(i.entry - s * cfg.stopFloorAtr * i.atr);
    stopBasis = `no confluent ${L ? 'support' : 'resistance'} mapped — ${cfg.stopFloorAtr}× daily ATR`;
  } else return null;
  if (!(s * (i.entry - formulaStop) > 0) || formulaStop <= 0) return null;
  const risk = Math.abs(i.entry - formulaStop);
  const targets = cfg.formulaTargetsR.map((k) => r2(i.entry + s * k * risk));
  const snap = snapPlanToStructure({
    direction: i.side, entry: i.entry, stop: formulaStop, targets, clusters: i.clusters, horizon: i.horizon,
    tolerance: i.tolerance, dailyAtr: i.atr, stopFloorAtr: cfg.stopFloorAtr, maxTarget: i.maxTarget, levelsAsOf: i.levelsAsOf,
  });
  const t1 = snap.targets[0];
  const t2raw = snap.targets[1];
  const t2 = fin(t2raw) && s * (t2raw - t1) > 0.004 ? t2raw : null;
  const r = Math.abs(i.entry - snap.stop);
  if (!(r > 0) || !fin(t1) || !(s * (t1 - i.entry) > 0)) return null;
  const lv = (k: number) => snap.targetLevels[k];
  return {
    stop: snap.stop, t1, t2, rr: r2(Math.abs(t1 - i.entry) / r), formulaStop,
    stopBasis: snap.stopLevel ? `beyond ${snap.stopLevel.label} (${snap.stopLevel.families} families)` : stopBasis + (snap.flooredStop !== formulaStop ? `; widened to the ${cfg.stopFloorAtr}× ATR floor` : ''),
    t1Basis: lv(0) ? `${lv(0)!.label} (${lv(0)!.families} families)` : `${cfg.formulaTargetsR[0]}R formula${i.maxTarget != null && Math.abs(t1 - i.maxTarget) < 0.01 ? ', capped at the expected move' : ''} — not structure`,
    t2Basis: t2 == null ? null : lv(1) ? `${lv(1)!.label} (${lv(1)!.families} families)` : `${cfg.formulaTargetsR[1]}R formula — not structure`,
    snapNotes: snap.notes, snapText: snap.text,
    capped: i.maxTarget != null && Math.abs(i.maxTarget - targets[0]) > 0.005 && s * (targets[0] - i.maxTarget) > 0,
  };
}

// ─── horizon / vehicle ───────────────────────────────────────────────────

export function horizonFor(c: Pick<Candidate, 'igniting'>): { horizon: SnapHorizon; label: string; holdDays: [number, number] } {
  return c.igniting
    ? { horizon: 'day', label: 'Day — the sector is igniting intraday', holdDays: [0, 1] }
    : { horizon: 'swing', label: 'Swing · 2–5 sessions', holdDays: [2, 5] };
}

export function vehicleFor(price: number, horizon: SnapHorizon, cfg = ROTATION_CFG): { kind: 'stock' | 'option'; text: string } {
  if (horizon === 'day') return { kind: 'stock', text: 'Stock — a day hold; no 0DTE from this engine' };
  if (price < cfg.optionMinPrice) return { kind: 'stock', text: `Stock — under $${cfg.optionMinPrice}, options are not suggested` };
  return { kind: 'option', text: `Option ~${cfg.option.delta.toFixed(2)}Δ ${cfg.option.dteMin}–${cfg.option.dteMax} DTE (loss rule 4 may push the window to 30+ DTE) — picked from the live chain when fired; stock if none passes` };
}

/** Index of the candidate closest to the target |Δ| inside the DTE window (null when none). */
export function pickByDelta<T extends { dte: number; delta: number; grade?: string; entryPremium?: number }>(picks: T[], cfg = ROTATION_CFG): T | null {
  const ok = picks.filter((p) => p.dte >= cfg.option.dteMin && p.dte <= cfg.option.dteMax && p.grade !== 'F' && (p.entryPremium ?? 1) > 0 && fin(p.delta));
  return ok.sort((a, b) => Math.abs(Math.abs(a.delta) - cfg.option.delta) - Math.abs(Math.abs(b.delta) - cfg.option.delta))[0] ?? null;
}

// ─── suggestion (published) ──────────────────────────────────────────────

export interface ForwardStat { h: number; n: number; meanExcess: number | null; beatPct: number | null }

export interface Suggestion {
  key: string;
  sectorId: string; sectorLabel: string; etf: string | null; regime: Regime; side: Side; rank: number;
  consensus: { with: number; against: number; n: number };
  igniting: boolean;
  kind: 'leader' | 'laggard';
  symbol: string;
  score: number | null;
  price: number; priceAt: string | null;
  entry: EntryPlan;
  stop: number; t1: number; t2: number | null; rr: number;
  stopBasis: string; t1Basis: string; t2Basis: string | null; capped: boolean;
  horizon: SnapHorizon; horizonLabel: string;
  vehicle: { kind: 'stock' | 'option'; text: string };
  chips: Array<{ key: string; label: string; state: Chip['state']; detail: string }>;
  earnings: string | null;
  levelsAsOf: string | null;
  /** Forward log so far: leaders vs their sector (this sector, then all sectors). */
  forward: { sector: ForwardStat[]; all: ForwardStat[] };
  /** Why the suggestion cannot be fired as it stands (empty = fireable subject to the live gates). */
  blocks: string[];
  autoEligible: boolean;
  status: 'measuring';
}

export function staticBlocks(s: Pick<Suggestion, 'rr' | 'earnings' | 'symbol'>, nowMs: number, cfg = ROTATION_CFG): string[] {
  const out: string[] = [];
  if (s.rr < cfg.minRR) out.push(`T1 is ${s.rr.toFixed(2)}R — below ${cfg.minRR}R after the snap`);
  const e = earningsWithin(s.earnings, nowMs, cfg.earningsBlockDays);
  if (e) out.push(e);
  return out;
}

/** Refusal text when earnings fall within `days` calendar days (either side of today), else null. */
export function earningsWithin(dateIso: string | null | undefined, nowMs: number, days = ROTATION_CFG.earningsBlockDays): string | null {
  if (!dateIso) return null;
  const d = Date.parse(String(dateIso).slice(0, 10) + 'T12:00:00Z');
  if (!Number.isFinite(d)) return null;
  const today = Date.parse(new Date(nowMs).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) + 'T12:00:00Z');
  const diff = Math.round((d - today) / 86_400_000);
  return diff >= 0 && diff <= days ? `earnings ${String(dateIso).slice(0, 10)} — within ${days} days; never fired into a print` : null;
}

/** Auto-mode eligibility before the live gates: consensus ≥ min on the side, no static block. */
export function isAutoEligible(s: Pick<Suggestion, 'consensus' | 'blocks'>, cfg = ROTATION_CFG): boolean {
  return s.consensus.with >= cfg.autoMinConsensus && s.blocks.length === 0;
}

/** Highest-confluence first; the order auto-mode fires in. */
export function autoOrder<T extends Pick<Suggestion, 'consensus' | 'score' | 'rr'>>(xs: T[]): T[] {
  return [...xs].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.consensus.with - a.consensus.with || b.rr - a.rr);
}

/** The NEXUS catalyst line — names the side (so the write gate reads it right), sector, regime, consensus, chips. */
export function catalystLine(s: Pick<Suggestion, 'side' | 'sectorLabel' | 'regime' | 'consensus' | 'chips' | 'kind' | 'entry'>): string {
  const pass = s.chips.filter((c) => c.state === 'pass').map((c) => c.label);
  return `Sector rotation ${s.side.toUpperCase()} — ${s.sectorLabel} ${s.regime} (consensus ${s.consensus.with}/${s.consensus.n}); ${s.kind === 'leader' ? 'confluence leader' : 'catch-up laggard'}; chips: ${pass.join(', ') || 'none passed'}; entry rule: ${ENTRY_RULE_LABEL[s.entry.rule].toLowerCase()} (measuring)`;
}

/** Daily cap state from today's fired count. */
export function capState(firedToday: number, cap: number): { ok: boolean; left: number; reason: string | null } {
  const left = Math.max(0, cap - firedToday);
  return { ok: left > 0, left, reason: left > 0 ? null : `daily cap reached (${firedToday}/${cap} sector-rotation ideas today)` };
}

export function readRotationEnv(env: Record<string, string | undefined> = {}): { auto: boolean; cap: number } {
  const n = Number(env.SECTOR_ROTATION_MAX_PER_DAY);
  return { auto: env.SECTOR_ROTATION_IDEAS === 'true', cap: Number.isFinite(n) && n >= 0 && n <= 20 ? Math.floor(n) : ROTATION_CFG.defaultDailyCap };
}

// ─── fire log (append-only) ──────────────────────────────────────────────

export interface FireLogRow {
  at: string; dateKey: string; key: string; symbol: string; side: Side; sectorId: string; sectorLabel: string;
  mode: 'manual' | 'auto'; status: 'fired' | 'withheld';
  ideaId: string | null; reason: string | null;
  plan: { rule: EntryRule; entry: number; stop: number; t1: number; t2: number | null; rr: number; vehicle: string; horizon: SnapHorizon };
  status_tag: 'measuring';
}
