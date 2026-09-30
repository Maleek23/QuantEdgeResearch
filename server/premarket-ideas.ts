/**
 * PRE-MARKET IDEAS — "use pre-market strength to generate trade ideas" (operator, 2026-09-30).
 *
 * The pre-market gap is a LEADING direction signal (operator rule). This turns
 * it into a small, capped set of intraday ideas in two phases:
 *
 *   PLAN   08:30–09:25 ET, every 10 min. Rank pre-market movers from the book +
 *          approved universe: |gap| ≥ 2% (stocks) / ≥ 1% (index ETFs), vs the
 *          prior close from the last pre-market 1m bar (pre-market-service.ts);
 *          participation = PM volume vs its own 20-session average PM volume, or
 *          at least a PM dollar-volume floor; catalyst from the catalysts table
 *          when one exists (never invented). The top names become a WATCH list
 *          with planned setups for the open:
 *            • gap_and_go     continuation beyond the PM extreme after the
 *                             09:30–09:45 opening range holds (gap not filled)
 *            • gap_fill_fade  gap into resistance (GEX call wall / prior-day high)
 *                             or against the daily trend; fade back toward the
 *                             prior close once the opening range breaks against it
 *            • pm_break       opening drive through the PM high/low (09:30–09:45),
 *                             or a gap failure through the opposite PM extreme
 *   TRIGGER 09:30–10:30 ET, every 2 min. Evaluate the plans on live 1m bars. A
 *          fresh trigger publishes through storage.createTradeIdea (source
 *          'premarket_gap') — at most 5 a day, one per symbol, never on top of
 *          another engine's open idea on the same symbol + side. Stop / T1 / T2
 *          come from session structure (opening range, PM range, prior-day
 *          levels, GEX walls). The single write point then applies loss rules
 *          v1 (T1 ≤ the 1-day expected move, T2 keeps the stretch, half-horizon
 *          time stop). Options: a 0–7 DTE contract via the selection engine
 *          (intraday hold — loss rule 4's 30–60 DTE window is for multi-day holds).
 *
 * WALK-FORWARD LAW: the gap / breakout scores were demoted after a 753-session
 * null. These setups are unproven — every idea says so ("measuring") and the
 * record is shown with its n and a LOW N flag under 20 resolved.
 *
 * Pure core (ranking, planning, triggers, caps) is exported for
 * scripts/test-premarket-ideas.ts; I/O is imported lazily.
 */
import { logger } from './logger';
import { etParts, etWallToMs } from '@shared/loss-rules';

// ─── Config ────────────────────────────────────────────────────────────────

export const PM_SOURCE = 'premarket_gap';
export const INDEX_ETFS = new Set(['SPY', 'QQQ', 'IWM', 'DIA']);
export const PM_CFG = {
  minGapStockPct: 2,
  minGapIndexPct: 1,
  /** PM volume ≥ 1.5× its own 20-session PM average counts as participation… */
  minPmVolRatio: 1.5,
  /** …or at least this much PM dollar volume when no average can be read. */
  minPmDollarVolStock: 2_000_000,
  minPmDollarVolIndex: 25_000_000,
  watchMax: 8,
  maxPerDay: 5,
  /** A trigger older than this is not published (a restart must not chase). */
  maxTriggerAgeMin: 6,
  /** Minimum reward:risk for T1. */
  minRR: 1,
  planStartEt: 8 * 60 + 30,
  planEndEt: 9 * 60 + 25,
  evalStartEt: 9 * 60 + 30,
  evalEndEt: 10 * 60 + 30,
  orEndEt: 9 * 60 + 45,
  intradayMaxDte: 7,
};
const PM_START_ET = 4 * 60;
const RTH_OPEN = 9 * 60 + 30;

export interface Bar { time: number; open: number; high: number; low: number; close: number; volume: number }

// ─── Pre-market statistics from extended-hours bars ───────────────────────

export interface PmStats { high: number; low: number; volume: number; dollarVolume: number; last: number; bars: number }

/** PM (04:00–09:30 ET) stats for one ET date from 1m/5m extended-hours bars (time in epoch seconds). */
export function pmSessionStats(bars: Bar[], dateKey: string): PmStats | null {
  let high = -Infinity; let low = Infinity; let volume = 0; let dollar = 0; let last = NaN; let n = 0;
  for (const b of bars) {
    const p = etParts(b.time * 1000);
    if (p.dateKey !== dateKey || p.minutes < PM_START_ET || p.minutes >= RTH_OPEN) continue;
    if (!(b.high > 0 && b.low > 0 && b.close > 0)) continue;
    high = Math.max(high, b.high); low = Math.min(low, b.low);
    volume += b.volume || 0; dollar += (b.volume || 0) * b.close; last = b.close; n++;
  }
  return n ? { high, low, volume, dollarVolume: dollar, last, bars: n } : null;
}

/** Average PM volume over up to `n` prior sessions (sessions with no PM prints are skipped). */
export function avgPriorPmVolume(bars: Bar[], todayKey: string, n = 20): { avg: number | null; sessions: number } {
  const byDay = new Map<string, number>();
  for (const b of bars) {
    const p = etParts(b.time * 1000);
    if (p.dateKey >= todayKey || p.minutes < PM_START_ET || p.minutes >= RTH_OPEN) continue;
    byDay.set(p.dateKey, (byDay.get(p.dateKey) ?? 0) + (b.volume || 0));
  }
  const days = Array.from(byDay.entries()).filter(([, v]) => v > 0).sort((a, b) => a[0].localeCompare(b[0])).slice(-n);
  if (days.length < 5) return { avg: null, sessions: days.length };
  return { avg: days.reduce((s, [, v]) => s + v, 0) / days.length, sessions: days.length };
}

// ─── Ranking ───────────────────────────────────────────────────────────────

export interface MoverInput {
  symbol: string;
  gapPct: number;
  pmPrice: number;
  prevClose: number;
  pmVolume: number | null;
  pmAvgVolume20: number | null;
  pmDollarVolume: number | null;
  catalyst: string | null;
}
export interface RankedMover extends MoverInput {
  isIndex: boolean;
  pmVolRatio: number | null;
  score: number;
  why: string[];
}
export interface RankReject { symbol: string; reason: string }

export function rankPreMarketMovers(inputs: MoverInput[], cfg = PM_CFG): { ranked: RankedMover[]; rejected: RankReject[] } {
  const ranked: RankedMover[] = []; const rejected: RankReject[] = [];
  for (const m of inputs) {
    const isIndex = INDEX_ETFS.has(m.symbol);
    const minGap = isIndex ? cfg.minGapIndexPct : cfg.minGapStockPct;
    if (!Number.isFinite(m.gapPct) || Math.abs(m.gapPct) < minGap) { rejected.push({ symbol: m.symbol, reason: `gap ${m.gapPct?.toFixed?.(2)}% < ${minGap}%` }); continue; }
    const ratio = m.pmVolume != null && m.pmAvgVolume20 && m.pmAvgVolume20 > 0 ? m.pmVolume / m.pmAvgVolume20 : null;
    const floor = isIndex ? cfg.minPmDollarVolIndex : cfg.minPmDollarVolStock;
    const volOk = (ratio != null && ratio >= cfg.minPmVolRatio) || (m.pmDollarVolume != null && m.pmDollarVolume >= floor);
    if (!volOk) {
      rejected.push({ symbol: m.symbol, reason: `thin pre-market: ${ratio != null ? `${ratio.toFixed(2)}× avg PM volume` : 'no PM average'}, $${((m.pmDollarVolume ?? 0) / 1e6).toFixed(2)}M < $${(floor / 1e6).toFixed(0)}M floor` });
      continue;
    }
    const why = [`gap ${m.gapPct >= 0 ? '+' : ''}${m.gapPct.toFixed(2)}% vs prior close`];
    if (ratio != null) why.push(`PM volume ${ratio.toFixed(1)}× its 20-session PM average`);
    if (m.pmDollarVolume != null) why.push(`$${(m.pmDollarVolume / 1e6).toFixed(1)}M traded pre-market`);
    if (m.catalyst) why.push(`catalyst: ${m.catalyst}`);
    const score = Math.abs(m.gapPct) / minGap + (ratio != null ? Math.log2(Math.max(ratio, 1)) : 0) + (m.catalyst ? 1 : 0);
    ranked.push({ ...m, isIndex, pmVolRatio: ratio, score: Math.round(score * 100) / 100, why });
  }
  ranked.sort((a, b) => b.score - a.score || Math.abs(b.gapPct) - Math.abs(a.gapPct));
  return { ranked, rejected };
}

// ─── Planning ──────────────────────────────────────────────────────────────

export type SetupKind = 'gap_and_go' | 'gap_fill_fade' | 'pm_break';
export const SETUP_LABEL: Record<SetupKind, string> = { gap_and_go: 'Gap-and-go', gap_fill_fade: 'Gap-fill fade', pm_break: 'PM-range break' };

export interface GexContext { callWall: number | null; putWall: number | null; flip: number | null; regime: string | null }
export interface PlanContext {
  pmHigh: number; pmLow: number;
  prevClose: number; prevHigh: number | null; prevLow: number | null;
  /** 20-day SMA of completed daily closes (trend read). */
  sma20: number | null;
  gex: GexContext | null;
}
export interface PlannedSetup {
  kind: SetupKind;
  direction: 'long' | 'short';
  /** 'drive' = with-gap PM break 09:30–09:45; 'failure' = through the opposite PM extreme. */
  variant?: 'drive' | 'failure';
  trigger: string;
  context: string;
}

export function planSetups(m: Pick<RankedMover, 'gapPct' | 'pmPrice'>, c: PlanContext): PlannedSetup[] {
  const up = m.gapPct > 0;
  const dir: 'long' | 'short' = up ? 'long' : 'short';
  const opp: 'long' | 'short' = up ? 'short' : 'long';
  const out: PlannedSetup[] = [];
  const extreme = up ? c.pmHigh : c.pmLow;
  out.push({
    kind: 'gap_and_go', direction: dir,
    trigger: `after 09:45 ET, if the 09:30–09:45 range holds ${up ? 'above' : 'below'} the prior close $${c.prevClose.toFixed(2)}: a 1m close ${up ? 'above' : 'below'} max(PM ${up ? 'high' : 'low'} $${extreme.toFixed(2)}, opening-range ${up ? 'high' : 'low'})`,
    context: `gap ${up ? 'up' : 'down'} ${Math.abs(m.gapPct).toFixed(2)}% — continuation if the open accepts it`,
  });
  // Fade context: gap into resistance/support or against the daily trend.
  const reasons: string[] = [];
  const near = (a: number, b: number, pct: number) => Math.abs(a / b - 1) * 100 <= pct;
  if (up) {
    if (c.gex?.callWall && (m.pmPrice >= c.gex.callWall || near(c.pmHigh, c.gex.callWall, 0.5))) reasons.push(`into the GEX call wall $${c.gex.callWall.toFixed(2)}`);
    if (c.prevHigh && c.pmHigh <= c.prevHigh * 1.002 && near(c.pmHigh, c.prevHigh, 0.75)) reasons.push(`into the prior-day high $${c.prevHigh.toFixed(2)}`);
    if (c.sma20 && c.prevClose < c.sma20) reasons.push(`against the daily trend (prior close under the 20-day SMA $${c.sma20.toFixed(2)})`);
  } else {
    if (c.gex?.putWall && (m.pmPrice <= c.gex.putWall || near(c.pmLow, c.gex.putWall, 0.5))) reasons.push(`into the GEX put wall $${c.gex.putWall.toFixed(2)}`);
    if (c.prevLow && c.pmLow >= c.prevLow * 0.998 && near(c.pmLow, c.prevLow, 0.75)) reasons.push(`into the prior-day low $${c.prevLow.toFixed(2)}`);
    if (c.sma20 && c.prevClose > c.sma20) reasons.push(`against the daily trend (prior close over the 20-day SMA $${c.sma20.toFixed(2)})`);
  }
  if (reasons.length) {
    out.push({
      kind: 'gap_fill_fade', direction: opp,
      trigger: `after 09:45 ET: a 1m close ${up ? 'below' : 'above'} the opening-range ${up ? 'low' : 'high'} while price is still ${up ? 'above' : 'below'} the prior close — fade toward $${c.prevClose.toFixed(2)}`,
      context: `gap ${reasons.join('; ')}`,
    });
  }
  out.push({
    kind: 'pm_break', direction: dir, variant: 'drive',
    trigger: `09:30–09:45 ET opening drive: a 1m close ${up ? 'above the PM high' : 'below the PM low'} $${extreme.toFixed(2)}`,
    context: 'the pre-market extreme gives way on the open',
  });
  const other = up ? c.pmLow : c.pmHigh;
  out.push({
    kind: 'pm_break', direction: opp, variant: 'failure',
    trigger: `09:30–10:30 ET gap failure: a 1m close ${up ? 'below the PM low' : 'above the PM high'} $${other.toFixed(2)}`,
    context: 'the gap fails through the opposite pre-market extreme',
  });
  return out;
}

// ─── Triggers ──────────────────────────────────────────────────────────────

export interface TriggerResult {
  kind: SetupKind;
  variant?: 'drive' | 'failure';
  direction: 'long' | 'short';
  entry: number;
  stop: number;
  t1: number;
  t2: number | null;
  rr: number;
  triggerAtMs: number;
  triggerText: string;
  levels: Record<string, number | null>;
  t1Basis: string;
}
export interface TriggerMiss { kind: SetupKind; variant?: string; reason: string }

const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Pick T1/T2 from structural candidates beyond the entry: the first candidate
 * at ≥ minRR becomes T1, the next beyond it T2. No candidate at ≥ minRR → null
 * (no idea; a fixed-percentage target is never invented).
 */
export function pickTargets(direction: 'long' | 'short', entry: number, stop: number,
  candidates: Array<{ price: number | null | undefined; label: string }>, minRR = PM_CFG.minRR,
): { t1: number; t2: number | null; t1Basis: string; rr: number } | null {
  const risk = Math.abs(entry - stop);
  if (!(risk > 0)) return null;
  const beyond = candidates
    .filter((c): c is { price: number; label: string } => c.price != null && Number.isFinite(c.price) && c.price > 0 && (direction === 'long' ? c.price > entry : c.price < entry))
    .sort((a, b) => (direction === 'long' ? a.price - b.price : b.price - a.price));
  const idx = beyond.findIndex((c) => Math.abs(c.price - entry) / risk >= minRR);
  if (idx < 0) return null;
  const t1 = beyond[idx];
  const next = beyond.slice(idx + 1).find((c) => Math.abs(c.price - t1.price) / risk >= 0.25) ?? null;
  return { t1: r2(t1.price), t2: next ? r2(next.price) : null, t1Basis: t1.label, rr: r2(Math.abs(t1.price - entry) / risk) };
}

/**
 * Evaluate one symbol's planned setups on today's 1m bars (epoch-second times,
 * extended hours allowed — only 09:30+ bars are read). Returns the EARLIEST
 * trigger that is still fresh and still valid at `nowMs`, plus why the others
 * did not fire.
 */
export function evaluateSetups(
  mover: Pick<RankedMover, 'symbol' | 'gapPct'>,
  plan: PlanContext,
  setups: PlannedSetup[],
  bars1m: Bar[],
  nowMs: number,
  cfg = PM_CFG,
): { trigger: TriggerResult | null; misses: TriggerMiss[] } {
  const now = etParts(nowMs);
  const session = bars1m
    .filter((b) => { const p = etParts(b.time * 1000); return p.dateKey === now.dateKey && p.minutes >= RTH_OPEN && b.time * 1000 + 60_000 <= nowMs + 1000; })
    .sort((a, b) => a.time - b.time);
  const misses: TriggerMiss[] = [];
  if (!session.length) return { trigger: null, misses: setups.map((s) => ({ kind: s.kind, variant: s.variant, reason: 'no completed session bars yet' })) };
  const mins = (b: Bar) => etParts(b.time * 1000).minutes;
  const orBars = session.filter((b) => mins(b) < cfg.orEndEt);
  const orComplete = session.some((b) => mins(b) >= cfg.orEndEt - 1) && orBars.length > 0;
  const orHigh = orBars.length ? Math.max(...orBars.map((b) => b.high)) : NaN;
  const orLow = orBars.length ? Math.min(...orBars.map((b) => b.low)) : NaN;
  const orHeight = orHigh - orLow;
  const pmRange = plan.pmHigh - plan.pmLow;
  const last = session[session.length - 1];
  const g = plan.gex;
  const found: TriggerResult[] = [];

  const structure = (direction: 'long' | 'short', level: number, height: number) => (direction === 'long'
    ? [
        { price: g?.callWall, label: 'GEX call wall' },
        { price: plan.prevHigh, label: 'prior-day high' },
        { price: plan.pmHigh, label: 'PM high' },
        { price: level + height, label: '1× range projection' },
        { price: level + 2 * height, label: '2× range projection' },
      ]
    : [
        { price: g?.putWall, label: 'GEX put wall' },
        { price: plan.prevLow, label: 'prior-day low' },
        { price: plan.pmLow, label: 'PM low' },
        { price: level - height, label: '1× range projection' },
        { price: level - 2 * height, label: '2× range projection' },
      ]);

  for (const s of setups) {
    const long = s.direction === 'long';
    const beyond = (px: number, lvl: number) => (long ? px > lvl : px < lvl);
    let trig: Bar | null = null; let stop = NaN; let level = NaN; let cands: Array<{ price: number | null | undefined; label: string }> = [];
    let text = '';
    if (s.kind === 'gap_and_go') {
      if (!orComplete) { misses.push({ kind: s.kind, reason: 'opening range 09:30–09:45 not complete' }); continue; }
      const held = long ? orLow > plan.prevClose : orHigh < plan.prevClose;
      if (!held) { misses.push({ kind: s.kind, reason: `opening range filled the gap (prior close $${plan.prevClose.toFixed(2)})` }); continue; }
      level = long ? Math.max(plan.pmHigh, orHigh) : Math.min(plan.pmLow, orLow);
      const after = session.filter((b) => mins(b) >= cfg.orEndEt);
      // The range must HOLD until the break: a close through the other side first voids it.
      for (const b of after) {
        if (long ? b.close < orLow : b.close > orHigh) break;
        if (beyond(b.close, level)) { trig = b; break; }
      }
      stop = long ? orLow : orHigh;
      cands = structure(s.direction, level, Math.max(orHeight, 0));
      text = `1m close $${trig?.close.toFixed(2) ?? '—'} ${long ? 'above' : 'below'} $${level.toFixed(2)} (max of PM/opening-range ${long ? 'high' : 'low'}) after the opening range held`;
    } else if (s.kind === 'gap_fill_fade') {
      if (!orComplete) { misses.push({ kind: s.kind, reason: 'opening range 09:30–09:45 not complete' }); continue; }
      level = long ? orHigh : orLow; // fade short breaks the OR low; fade long breaks the OR high
      const after = session.filter((b) => mins(b) >= cfg.orEndEt);
      for (const b of after) {
        const stillGapped = long ? b.close < plan.prevClose : b.close > plan.prevClose;
        if (!stillGapped) break; // gap already filled — nothing left to fade
        if (beyond(b.close, level)) { trig = b; break; }
      }
      if (trig) {
        const upto = session.filter((b) => b.time <= trig!.time);
        stop = long ? Math.min(...upto.map((b) => b.low)) : Math.max(...upto.map((b) => b.high));
      }
      cands = long
        ? [{ price: plan.prevClose, label: 'prior close (gap fill)' }, { price: plan.prevHigh, label: 'prior-day high' }, { price: g?.callWall, label: 'GEX call wall' }]
        : [{ price: plan.prevClose, label: 'prior close (gap fill)' }, { price: plan.prevLow, label: 'prior-day low' }, { price: g?.putWall, label: 'GEX put wall' }];
      text = `1m close $${trig?.close.toFixed(2) ?? '—'} ${long ? 'above the opening-range high' : 'below the opening-range low'} $${level.toFixed(2)} with the gap still open`;
    } else {
      const drive = s.variant === 'drive';
      level = long ? plan.pmHigh : plan.pmLow;
      const window = session.filter((b) => (drive ? mins(b) < cfg.orEndEt : mins(b) < cfg.evalEndEt));
      for (const b of window) { if (beyond(b.close, level)) { trig = b; break; } }
      if (trig) {
        const upto = session.filter((b) => b.time <= trig!.time);
        const pmMid = (plan.pmHigh + plan.pmLow) / 2;
        // drive: the session's extreme on the other side is the invalidation; failure: back inside the PM range midpoint.
        stop = drive
          ? (long ? Math.min(...upto.map((b) => b.low)) : Math.max(...upto.map((b) => b.high)))
          : (long ? Math.min(pmMid, Math.min(...upto.slice(-5).map((b) => b.low))) : Math.max(pmMid, Math.max(...upto.slice(-5).map((b) => b.high))));
      }
      cands = [
        ...(s.variant === 'failure' ? [{ price: plan.prevClose, label: 'prior close (gap fill)' }] : []),
        ...structure(s.direction, level, Math.max(pmRange, 0)),
      ];
      text = `1m close $${trig?.close.toFixed(2) ?? '—'} ${long ? 'above the PM high' : 'below the PM low'} $${level.toFixed(2)}${drive ? ' in the opening drive' : ' (gap failure)'}`;
    }
    if (!trig) { misses.push({ kind: s.kind, variant: s.variant, reason: 'trigger level not crossed' }); continue; }
    const entry = trig.close;
    if (!(Number.isFinite(stop) && (long ? stop < entry : stop > entry))) { misses.push({ kind: s.kind, variant: s.variant, reason: 'no valid stop below/above the trigger' }); continue; }
    const tg = pickTargets(s.direction, entry, stop, cands, cfg.minRR);
    if (!tg) { misses.push({ kind: s.kind, variant: s.variant, reason: `no structural target ≥ ${cfg.minRR}R` }); continue; }
    found.push({
      kind: s.kind, variant: s.variant, direction: s.direction, entry: r2(entry), stop: r2(stop), t1: tg.t1, t2: tg.t2, rr: tg.rr,
      triggerAtMs: trig.time * 1000, triggerText: text, t1Basis: tg.t1Basis,
      levels: { pmHigh: plan.pmHigh, pmLow: plan.pmLow, prevClose: plan.prevClose, prevHigh: plan.prevHigh, prevLow: plan.prevLow, orHigh: Number.isFinite(orHigh) ? orHigh : null, orLow: Number.isFinite(orLow) ? orLow : null, callWall: g?.callWall ?? null, putWall: g?.putWall ?? null, flip: g?.flip ?? null },
    });
  }
  found.sort((a, b) => a.triggerAtMs - b.triggerAtMs);
  for (const f of found) {
    const ageMin = (nowMs - f.triggerAtMs) / 60_000;
    if (ageMin > cfg.maxTriggerAgeMin + 1) { misses.push({ kind: f.kind, variant: f.variant, reason: `triggered ${Math.round(ageMin)} min ago — too old to publish` }); continue; }
    const px = last.close;
    const long = f.direction === 'long';
    if (long ? px <= f.stop : px >= f.stop) { misses.push({ kind: f.kind, variant: f.variant, reason: 'already through the stop' }); continue; }
    if (long ? px >= f.t1 : px <= f.t1) { misses.push({ kind: f.kind, variant: f.variant, reason: 'already at T1' }); continue; }
    return { trigger: f, misses };
  }
  return { trigger: null, misses };
}

// ─── Caps ──────────────────────────────────────────────────────────────────

export interface CapState { publishedToday: number; publishedSymbols: Set<string>; openIdeas: Array<{ symbol: string; direction: string; source?: string | null }> }

export function capCheck(symbol: string, direction: 'long' | 'short', st: CapState, cfg = PM_CFG): { ok: boolean; reason: string } {
  if (st.publishedToday >= cfg.maxPerDay) return { ok: false, reason: `daily cap ${cfg.maxPerDay} reached` };
  if (st.publishedSymbols.has(symbol)) return { ok: false, reason: 'one pre-market idea per symbol per day' };
  const clash = st.openIdeas.find((i) => i.symbol?.toUpperCase() === symbol && String(i.direction).toLowerCase() === direction);
  if (clash) return { ok: false, reason: `${clash.source ?? 'another engine'} already has an open ${direction} on ${symbol}` };
  return { ok: true, reason: 'ok' };
}

// ─── Record ────────────────────────────────────────────────────────────────

export interface PmRecord { n: number; wins: number; losses: number; other: number; open: number; winRate: number | null; lowN: boolean; label: 'measuring' }
export function summarizeRecord(rows: Array<{ outcomeStatus?: string | null; percentGain?: number | null }>): PmRecord {
  let wins = 0; let losses = 0; let other = 0; let open = 0;
  for (const r of rows) {
    const s = String(r.outcomeStatus ?? 'open');
    if (s === 'open') open++;
    else if (s === 'hit_target') wins++;
    else if (s === 'hit_stop') losses++;
    else {
      const pg = Number(r.percentGain);
      if (Number.isFinite(pg) && pg > 0) wins++; else if (Number.isFinite(pg) && pg < 0) losses++; else other++;
    }
  }
  const n = wins + losses + other;
  return { n, wins, losses, other, open, winRate: wins + losses > 0 ? Math.round((wins / (wins + losses)) * 1000) / 10 : null, lowN: n < 20, label: 'measuring' };
}

// ─── Runtime state (web process) ───────────────────────────────────────────

export interface WatchPlan {
  symbol: string;
  rank: number;
  mover: RankedMover;
  ctx: PlanContext;
  setups: PlannedSetup[];
  plannedAt: string;
  status: 'watch' | 'triggered';
  published?: { ideaId: string | null; kind: SetupKind; direction: 'long' | 'short'; at: string } | null;
  lastEval?: { at: string; misses: TriggerMiss[]; blocked?: string } | null;
}
interface DayState { dateKey: string; plans: Map<string, WatchPlan>; plannedAt: string | null; lastEvalAt: string | null; scanned: number; rejected: RankReject[]; published: number }

let day: DayState = { dateKey: '', plans: new Map(), plannedAt: null, lastEvalAt: null, scanned: 0, rejected: [], published: 0 };
function today(nowMs = Date.now()): DayState {
  const k = etParts(nowMs).dateKey;
  if (day.dateKey !== k) day = { dateKey: k, plans: new Map(), plannedAt: null, lastEvalAt: null, scanned: 0, rejected: [], published: 0 };
  return day;
}

/** Marker data for the Today pre-market strip: symbol → setup summary. */
export function getPremarketSetupMap(nowMs = Date.now()): Map<string, { kinds: SetupKind[]; status: 'watch' | 'triggered'; ideaId: string | null; summary: string }> {
  const st = today(nowMs);
  const out = new Map<string, { kinds: SetupKind[]; status: 'watch' | 'triggered'; ideaId: string | null; summary: string }>();
  for (const p of st.plans.values()) {
    out.set(p.symbol, {
      kinds: Array.from(new Set(p.setups.map((s) => s.kind))),
      status: p.status,
      ideaId: p.published?.ideaId ?? null,
      summary: p.published
        ? `${SETUP_LABEL[p.published.kind]} ${p.published.direction} triggered — published`
        : p.setups.map((s) => `${SETUP_LABEL[s.kind]}${s.variant ? ` (${s.variant})` : ''} ${s.direction}`).join(' · '),
    });
  }
  return out;
}

export function getPremarketIdeasState(nowMs = Date.now()) {
  const st = today(nowMs);
  return {
    dateKey: st.dateKey,
    plannedAt: st.plannedAt,
    lastEvalAt: st.lastEvalAt,
    scanned: st.scanned,
    published: st.published,
    caps: { maxPerDay: PM_CFG.maxPerDay, perSymbol: 1 },
    windows: { plan: '08:30–09:25 ET every 10 min', trigger: '09:30–10:30 ET every 2 min' },
    watch: Array.from(st.plans.values()).sort((a, b) => a.rank - b.rank).map((p) => ({
      symbol: p.symbol, rank: p.rank, status: p.status, plannedAt: p.plannedAt,
      gapPct: r2(p.mover.gapPct), pmPrice: p.mover.pmPrice, prevClose: p.mover.prevClose,
      pmVolRatio: p.mover.pmVolRatio != null ? r2(p.mover.pmVolRatio) : null, pmDollarVolume: p.mover.pmDollarVolume,
      catalyst: p.mover.catalyst, why: p.mover.why, levels: p.ctx, setups: p.setups, published: p.published ?? null, lastEval: p.lastEval ?? null,
    })),
  };
}

// ─── I/O: plan pass ────────────────────────────────────────────────────────

async function universe(): Promise<string[]> {
  const syms = new Set<string>(Array.from(INDEX_ETFS));
  try {
    const { storage } = await import('./storage');
    for (const i of await storage.getOpenTradeIdeas()) if (i.symbol && (i as any).assetType !== 'crypto') syms.add(String(i.symbol).toUpperCase());
  } catch { /* book optional */ }
  try {
    const { APPROVED_TICKERS } = await import('@shared/approved-tickers');
    APPROVED_TICKERS.forEach((s) => syms.add(s.toUpperCase()));
  } catch { /* */ }
  return Array.from(syms).filter((s) => /^[A-Z.]{1,6}$/.test(s)).slice(0, 160);
}

function sma(xs: number[], n: number): number | null {
  if (xs.length < n) return null;
  const t = xs.slice(-n);
  return t.reduce((a, b) => a + b, 0) / n;
}

async function catalystMap(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const { storage } = await import('./storage');
    const cats = await storage.getActiveCatalysts(36, 1);
    for (const c of cats) {
      const s = String(c.symbol ?? '').toUpperCase();
      if (!s || out.has(s)) continue;
      out.set(s, `${c.eventType}: ${String(c.title).slice(0, 90)}`);
    }
  } catch { /* no catalyst read → none claimed */ }
  return out;
}

async function buildPlanContext(symbol: string, todayKey: string, prevCloseFromSnap: number): Promise<{ ctx: PlanContext; pm: PmStats; avg: number | null } | null> {
  const { fetchCandles } = await import('./historical-candles');
  const [bars5, daily] = await Promise.all([fetchCandles(symbol, '1mo', '5m'), fetchCandles(symbol, '3mo', '1d')]);
  const pm = pmSessionStats(bars5 as Bar[], todayKey);
  if (!pm) return null;
  const { avg } = avgPriorPmVolume(bars5 as Bar[], todayKey, 20);
  const done = (daily as Bar[]).filter((b) => etParts(b.time * 1000).dateKey < todayKey);
  const prev = done[done.length - 1];
  let gex: GexContext | null = null;
  try {
    const { getGexSnapshot } = await import('./gex-snapshot-service');
    const g = await getGexSnapshot(symbol);
    if (g) gex = { callWall: g.callWall, putWall: g.putWall, flip: g.flipPoint, regime: g.regime };
  } catch { /* GEX optional */ }
  return {
    pm, avg,
    ctx: {
      pmHigh: pm.high, pmLow: pm.low,
      prevClose: prevCloseFromSnap > 0 ? prevCloseFromSnap : prev?.close ?? pm.last,
      prevHigh: prev?.high ?? null, prevLow: prev?.low ?? null,
      sma20: sma(done.map((b) => b.close), 20),
      gex,
    },
  };
}

export async function runPremarketPlan(nowMs = Date.now()): Promise<number> {
  const et = etParts(nowMs);
  if (et.weekday < 1 || et.weekday > 5) return 0;
  if (et.minutes < PM_CFG.planStartEt - 5 || et.minutes >= RTH_OPEN) return 0;
  const st = today(nowMs);
  const { getPreMarketBatch } = await import('./pre-market-service');
  const syms = await universe();
  const snaps = await getPreMarketBatch(syms);
  st.scanned = snaps.size;
  // Cheap first cut on the gap alone; volume/catalyst reads only for survivors.
  const gapped = Array.from(snaps.values()).filter((s) => s.phase === 'pre_market' && s.preMarketGapPct != null
    && Math.abs(s.preMarketGapPct) >= (INDEX_ETFS.has(s.symbol) ? PM_CFG.minGapIndexPct : PM_CFG.minGapStockPct))
    .sort((a, b) => Math.abs(b.preMarketGapPct!) - Math.abs(a.preMarketGapPct!))
    .slice(0, 20);
  const cats = await catalystMap();
  const inputs: MoverInput[] = []; const ctxs = new Map<string, PlanContext>();
  for (const s of gapped) {
    try {
      const b = await buildPlanContext(s.symbol, et.dateKey, s.previousClose);
      if (!b) continue;
      ctxs.set(s.symbol, b.ctx);
      inputs.push({ symbol: s.symbol, gapPct: s.preMarketGapPct!, pmPrice: s.price, prevClose: s.previousClose, pmVolume: b.pm.volume, pmAvgVolume20: b.avg, pmDollarVolume: b.pm.dollarVolume, catalyst: cats.get(s.symbol) ?? null });
    } catch (err) {
      logger.debug(`[PM-IDEAS] ${s.symbol}: context read failed — ${(err as Error).message}`);
    }
  }
  const { ranked, rejected } = rankPreMarketMovers(inputs);
  st.rejected = rejected;
  const keep = ranked.slice(0, PM_CFG.watchMax);
  const plannedAt = new Date(nowMs).toISOString();
  const next = new Map<string, WatchPlan>();
  keep.forEach((m, i) => {
    const ctx = ctxs.get(m.symbol)!;
    const prior = st.plans.get(m.symbol);
    next.set(m.symbol, { symbol: m.symbol, rank: i + 1, mover: m, ctx, setups: planSetups(m, ctx), plannedAt, status: prior?.status ?? 'watch', published: prior?.published ?? null, lastEval: null });
  });
  // A name that already published keeps its row even if it fell off the list.
  for (const p of st.plans.values()) if (p.published && !next.has(p.symbol)) next.set(p.symbol, p);
  st.plans = next; st.plannedAt = plannedAt;
  logger.info(`[PM-IDEAS] plan: ${snaps.size} quotes, ${gapped.length} gapped, ${ranked.length} qualified → WATCH ${keep.map((m) => `${m.symbol} ${m.gapPct >= 0 ? '+' : ''}${m.gapPct.toFixed(1)}%`).join(', ') || 'none'}`);
  return 0;
}

// ─── I/O: trigger pass ─────────────────────────────────────────────────────

async function capState(dateKey: string): Promise<CapState> {
  const { storage } = await import('./storage');
  const open = await storage.getOpenTradeIdeas();
  const mine = open.filter((i: any) => i.source === PM_SOURCE && etParts(Date.parse(String(i.timestamp))).dateKey === dateKey);
  let publishedToday = mine.length; const syms = new Set(mine.map((i: any) => String(i.symbol).toUpperCase()));
  try {
    const { db } = await import('./db');
    const { tradeIdeas } = await import('@shared/schema');
    const { and, eq, gte } = await import('drizzle-orm');
    const since = new Date(etWallToMs(Number(dateKey.slice(0, 4)), Number(dateKey.slice(5, 7)), Number(dateKey.slice(8, 10)), 0)).toISOString();
    const rows = await db.select({ symbol: tradeIdeas.symbol }).from(tradeIdeas).where(and(eq(tradeIdeas.source, PM_SOURCE as any), gte(tradeIdeas.timestamp, since)));
    publishedToday = Math.max(publishedToday, rows.length);
    rows.forEach((r: any) => syms.add(String(r.symbol).toUpperCase()));
  } catch { /* DB read optional — in-memory + open ideas still cap */ }
  return {
    publishedToday: Math.max(publishedToday, day.published),
    publishedSymbols: new Set([...syms, ...Array.from(day.plans.values()).filter((p) => p.published).map((p) => p.symbol)]),
    openIdeas: open.filter((i: any) => i.source !== PM_SOURCE).map((i: any) => ({ symbol: String(i.symbol).toUpperCase(), direction: String(i.direction), source: i.source })),
  };
}

async function attachContract(symbol: string, t: TriggerResult, conviction: number) {
  try {
    const { selectContracts } = await import('./option-selection-engine');
    const sel = await selectContracts({
      symbol, direction: t.direction === 'long' ? 'bullish' : 'bearish', setup: 'scalp', expiryTier: 'DAILY',
      allowZeroDte: true, intradayMaxDte: PM_CFG.intradayMaxDte, holdingDays: 0,
      entry: t.entry, stop: t.stop, t1: t.t1, ...(t.t2 ? { t2: t.t2 } : {}), conviction, asOfSpot: t.entry,
    });
    const picks = sel.picks.filter((p) => p.dte >= 0 && p.dte <= PM_CFG.intradayMaxDte && p.grade !== 'F' && p.entryPremium > 0);
    const pick = picks.find((p) => p.tier === sel.recommendedTier) ?? picks[0] ?? null;
    return { pick, note: pick ? null : (sel.note ?? `no 0–${PM_CFG.intradayMaxDte} DTE contract passed the gates`) };
  } catch (err) {
    return { pick: null, note: `contract selection failed: ${(err as Error).message}` };
  }
}

async function publish(p: WatchPlan, t: TriggerResult, nowMs: number): Promise<string | null> {
  const { storage } = await import('./storage');
  const m = p.mover;
  const conviction = 60;
  const { pick, note } = await attachContract(p.symbol, t, conviction);
  const label = `${SETUP_LABEL[t.kind]}${t.variant ? ` (${t.variant === 'drive' ? 'opening drive' : 'gap failure'})` : ''}`;
  const g = p.ctx.gex;
  const gexLine = g ? `GEX: call wall ${g.callWall ?? '—'}, put wall ${g.putWall ?? '—'}, zero-γ ${g.flip ?? '—'}, regime ${g.regime ?? '—'}.` : 'GEX: no snapshot at plan time.';
  const evidence = {
    setup: t.kind, variant: t.variant ?? null, gapPct: r2(m.gapPct), pmPrice: m.pmPrice, prevClose: m.prevClose,
    pmVolume: m.pmVolume, pmAvgVolume20: m.pmAvgVolume20, pmVolRatio: m.pmVolRatio != null ? r2(m.pmVolRatio) : null,
    pmDollarVolume: m.pmDollarVolume != null ? Math.round(m.pmDollarVolume) : null, catalyst: m.catalyst,
    gex: g, levels: t.levels, trigger: t.triggerText, triggerAt: new Date(t.triggerAtMs).toISOString(), t1Basis: t.t1Basis, t2: t.t2,
    plannedAt: p.plannedAt, rank: p.rank, validated: false, status: 'measuring',
  };
  const endOfDay = new Date(etWallToMs(...(dateParts(nowMs)), 15 * 60 + 55)).toISOString();
  const base: Record<string, any> = {
    symbol: p.symbol, direction: t.direction,
    entryPrice: t.entry, targetPrice: t.t1, stopLoss: t.stop, riskRewardRatio: t.rr,
    catalyst: `Pre-market ${m.gapPct >= 0 ? 'gap up' : 'gap down'} ${Math.abs(m.gapPct).toFixed(1)}% — ${label} ${t.direction}${m.catalyst ? ` · ${m.catalyst}` : ''}`,
    analysis: [
      `${label} triggered: ${t.triggerText}.`,
      `Pre-market: ${m.why.join('; ')}.`,
      `Stop $${t.stop.toFixed(2)}, T1 $${t.t1.toFixed(2)} (${t.t1Basis}, ${t.rr.toFixed(2)}R)${t.t2 ? `, T2 $${t.t2.toFixed(2)}` : ''}.`,
      gexLine,
      pick ? `Contract: ${pick.optionType.toUpperCase()} ${pick.strike} ${pick.expiry} (${pick.dte} DTE, intraday hold) @ $${pick.entryPremium.toFixed(2)} mid.` : `No contract attached — ${note}.`,
      'Measuring: pre-market setups are unproven (gap/breakout scores were demoted after a 753-session walk-forward null); intraday only.',
    ].join(' '),
    source: PM_SOURCE, dataSourceUsed: `premarket_${t.kind}${t.variant ? `_${t.variant}` : ''}`,
    sessionContext: 'regular', timestamp: new Date(nowMs).toISOString(),
    entryValidUntil: new Date(Math.min(nowMs + 20 * 60_000, etWallToMs(...dateParts(nowMs), 11 * 60 + 30))).toISOString(),
    exitBy: endOfDay,
    outcomeStatus: 'open', confidenceScore: conviction, holdingPeriod: 'day', tradeType: 'scalp',
    qualitySignals: [
      `setup:${t.kind}${t.variant ? `:${t.variant}` : ''}`, `gap_pct:${r2(m.gapPct)}`,
      m.pmVolRatio != null ? `pm_vol_ratio:${r2(m.pmVolRatio)}` : 'pm_vol_ratio:n/a',
      m.catalyst ? 'catalyst:yes' : 'catalyst:none_found', `t1_basis:${t.t1Basis}`, t.t2 ? `t2:${t.t2}` : '',
      g?.callWall ? `call_wall:${g.callWall}` : '', g?.putWall ? `put_wall:${g.putWall}` : '', g?.flip ? `zero_gamma:${g.flip}` : '',
      'validated:false', 'measuring',
    ].filter(Boolean),
    convergenceSignalsJson: { premarket: evidence },
  };
  const idea = pick
    ? { ...base, assetType: 'option', optionType: pick.optionType, strikePrice: pick.strike, expiryDate: pick.expiry, entryPremium: Number(pick.entryPremium.toFixed(2)), optionDte: pick.dte, expiryTier: pick.dte <= 0 ? '0DTE' : 'DAILY' }
    : { ...base, assetType: 'stock' };
  const created = await storage.createTradeIdea(idea as any, { dedupWindowHours: 6 });
  return (created as any)?.id ?? null;
}
function dateParts(ms: number): [number, number, number] { const p = etParts(ms); return [p.y, p.m, p.d]; }

export async function runPremarketTriggers(nowMs = Date.now()): Promise<number> {
  const et = etParts(nowMs);
  if (et.weekday < 1 || et.weekday > 5 || et.minutes < PM_CFG.evalStartEt || et.minutes > PM_CFG.evalEndEt) return 0;
  const st = today(nowMs);
  // Restarted after the plan window: rebuild the plan from today's PM bars (they are history now).
  if (!st.plannedAt) {
    await rebuildPlanAfterOpen(nowMs);
  }
  st.lastEvalAt = new Date(nowMs).toISOString();
  const pending = Array.from(st.plans.values()).filter((p) => !p.published).sort((a, b) => a.rank - b.rank);
  if (!pending.length) return 0;
  const { fetchCandles } = await import('./historical-candles');
  let caps = await capState(st.dateKey);
  let published = 0;
  for (const p of pending) {
    if (caps.publishedToday >= PM_CFG.maxPerDay) break;
    const bars = (await fetchCandles(p.symbol, '1d', '1m')) as Bar[];
    const { trigger, misses } = evaluateSetups(p.mover, p.ctx, p.setups, bars, nowMs);
    p.lastEval = { at: st.lastEvalAt, misses };
    if (!trigger) continue;
    const cap = capCheck(p.symbol, trigger.direction, caps);
    if (!cap.ok) { p.lastEval.blocked = cap.reason; logger.info(`[PM-IDEAS] ${p.symbol} ${trigger.kind} ${trigger.direction} triggered but withheld — ${cap.reason}`); continue; }
    try {
      const id = await publish(p, trigger, nowMs);
      p.status = 'triggered';
      p.published = { ideaId: id, kind: trigger.kind, direction: trigger.direction, at: new Date(nowMs).toISOString() };
      st.published++; published++;
      caps = { ...caps, publishedToday: caps.publishedToday + 1, publishedSymbols: new Set([...caps.publishedSymbols, p.symbol]) };
      logger.info(`[PM-IDEAS] ✅ ${p.symbol} ${trigger.kind} ${trigger.direction} @ ${trigger.entry} stop ${trigger.stop} T1 ${trigger.t1} (${trigger.rr}R) → ${id}`);
    } catch (err) {
      p.lastEval.blocked = `write gate: ${(err as Error).message}`;
      logger.warn(`[PM-IDEAS] ${p.symbol} publish failed: ${(err as Error).message}`);
    }
  }
  return published;
}

/** After a restart past 09:25: plan from the day's PM bars + the prior close (no live PM quote needed). */
async function rebuildPlanAfterOpen(nowMs: number): Promise<void> {
  const st = today(nowMs);
  const et = etParts(nowMs);
  const syms = await universe();
  const { fetchCandles } = await import('./historical-candles');
  const cats = await catalystMap();
  const inputs: MoverInput[] = []; const ctxs = new Map<string, PlanContext>();
  // Gap from the pre-market snapshot (last 1m bar inside today's PM window vs
  // the prior close) — works after the open too. The daily-bar route missed
  // everything on 2026-09-30: the 10-min daily cache was filled pre-open and
  // had no bar for today, so every name was skipped.
  const firstCut: Array<{ sym: string; prevClose: number }> = [];
  const { getPreMarketBatch } = await import('./pre-market-service');
  const snaps = await getPreMarketBatch(syms);
  for (const snap of Array.from(snaps.values())) {
    const gap = snap.preMarketGapPct;
    if (gap == null || !(snap.previousClose > 0)) continue;
    if (Math.abs(gap) >= (INDEX_ETFS.has(snap.symbol) ? PM_CFG.minGapIndexPct : PM_CFG.minGapStockPct)) firstCut.push({ sym: snap.symbol, prevClose: snap.previousClose });
  }
  firstCut.sort((a, b) => Math.abs((snaps.get(b.sym)?.preMarketGapPct ?? 0)) - Math.abs((snaps.get(a.sym)?.preMarketGapPct ?? 0)));
  for (const { sym, prevClose } of firstCut.slice(0, 20)) {
    const b = await buildPlanContext(sym, et.dateKey, prevClose);
    if (!b) continue;
    ctxs.set(sym, b.ctx);
    inputs.push({ symbol: sym, gapPct: (b.pm.last / prevClose - 1) * 100, pmPrice: b.pm.last, prevClose, pmVolume: b.pm.volume, pmAvgVolume20: b.avg, pmDollarVolume: b.pm.dollarVolume, catalyst: cats.get(sym) ?? null });
  }
  const { ranked, rejected } = rankPreMarketMovers(inputs);
  st.rejected = rejected;
  const plannedAt = new Date(nowMs).toISOString();
  ranked.slice(0, PM_CFG.watchMax).forEach((m, i) => {
    const ctx = ctxs.get(m.symbol)!;
    st.plans.set(m.symbol, { symbol: m.symbol, rank: i + 1, mover: m, ctx, setups: planSetups(m, ctx), plannedAt, status: 'watch', published: null, lastEval: null });
  });
  st.plannedAt = plannedAt;
  logger.info(`[PM-IDEAS] plan rebuilt after the open from PM bars: WATCH ${Array.from(st.plans.keys()).join(', ') || 'none'}`);
}

/** Record for the source (resolved ideas only count toward n). */
export async function getPremarketRecord(): Promise<PmRecord> {
  try {
    const { db } = await import('./db');
    const { tradeIdeas } = await import('@shared/schema');
    const { eq } = await import('drizzle-orm');
    const rows = await db.select({ outcomeStatus: tradeIdeas.outcomeStatus, percentGain: tradeIdeas.percentGain }).from(tradeIdeas).where(eq(tradeIdeas.source, PM_SOURCE as any));
    return summarizeRecord(rows as any);
  } catch {
    return summarizeRecord([]);
  }
}
