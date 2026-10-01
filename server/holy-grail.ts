/**
 * HOLY GRAIL ENGINE — Raschke's ADX/EMA20 pullback, board-wide, OFF by default.
 * =============================================================================
 * Operator, 2026-09-30: "holy grail indicator cooked so much today, you missed it".
 * Detector + exits: shared/holy-grail.ts (the SAME code research/holy-grail-replay.ts
 * measured). Indicators: shared/trend-indicators.ts (Wilder ADX, EMA).
 *
 * DATA — no new intraday fetch path:
 *   today's 1-min bars come from the 0DTE sniper's stage-1 store
 *   (server/zero-dte-sniper.ts refreshStage1Bars / peekStage1Bars: one batched,
 *   incremental Alpaca request for the whole board, shared by both engines);
 *   5-min / 15-min bars are built from them (closed bars only). Warm-up (the
 *   prior ~8 sessions of 5-min bars, ~200 daily bars) is read ONCE per day per
 *   symbol with the same batched request (fetchStockBarsBatched).
 *
 * ROWS — every cycle (every 5 min 09:41–15:56 ET) lists, per symbol × timeframe
 *   (5m, 15m, daily) × side:
 *     armed      the trend rule holds at an EMA20 touch; the entry stop is live
 *     triggered  the entry stop filled (exact fill bar, ADX, EMA, entry/stop/targets)
 *     published  triggered AND its timeframe × side cell survived the replay
 *                (HG_POLICIES, publish: true) AND HOLY_GRAIL=true
 *   Everything else is a WATCH row. Status label: measuring.
 *
 * PUBLISHING — storage.createTradeIdea, source 'holy_grail', stock idea with the
 *   exact trigger time, ADX value, EMA level, entry/stop/target and the replay
 *   stats that justify the cell. HOLY_GRAIL=true is required for the schedule to
 *   run at all (server/idea-producer-schedule.ts).
 *
 * GET /api/holy-grail — last cycle + today's rows; GET /api/holy-grail/:symbol —
 * the symbol's active setups (NEXUS "ADX / Holy Grail" badge). ROLE=web reads
 * the worker's shared file .cache/shared/holy-grail.json.
 */
import type { Express, NextFunction, Request, Response } from 'express';
import { logger } from './logger';
import { BoundedCache } from './lib/bounded-cache';
import { readShared, sharedStamp, writeSharedSync } from './lib/shared-state';
import { readsSharedState, writesSharedState } from './lib/process-role';
import { etDateKey, etMinutes, parseWatch } from './zero-dte-desk-core';
import { etClock, hhmm } from './zero-dte-sniper-core';
import { aggregateBars, detectHolyGrail, hgTarget, HG_EXIT_LABEL, type HgBar, type HgExitRule, type HgSide, type HgSignal } from '@shared/holy-grail';

export const HG_SOURCE = 'holy_grail';
export const HG_SHARED = 'holy-grail';
export type HgTf = '5m' | '15m' | '1d';
export const HG_TFS: readonly HgTf[] = ['5m', '15m', '1d'];

export interface HgPolicy {
  publish: boolean;
  /** Entry-stop validity in bars (Raschke: 1). */
  entryBars: 1 | 3;
  exit: HgExitRule;
  /** Replay stats that justify (or reject) the cell — quoted in every published idea. */
  evidence: string;
}

/**
 * Timeframe × side → policy. ONLY cells that satisfied the walk-forward law in
 * research/holy-grail-replay.ts (docs/HOLY_GRAIL_REPLAY_2026-09-30.md §2) may
 * carry publish: true. Everything else is watch-only.
 */
export const HG_POLICIES: Record<`${HgTf}|${HgSide}`, HgPolicy> = {
  // Replay 2025-10-01 → 2026-09-30 (H1 Oct–Mar / H2 Apr–Sep), N = 1, 2R exit, conservative fills.
  // NO cell passed the law on 5m / 15m / daily, either side, any N, any exit — every one is
  // negative in both halves (≈ −0.10R to −0.40R per trade). Watch rows only.
  '5m|long': { publish: false, entryBars: 1, exit: 'r2', evidence: '5m long, 150 names: n 12,618, E[R] −0.122 (H1 −0.139 / H2 −0.107) — failed both halves' },
  '5m|short': { publish: false, entryBars: 1, exit: 'r2', evidence: '5m short, 150 names: n 13,984, E[R] −0.103 (H1 −0.104 / H2 −0.102) — failed both halves' },
  '15m|long': { publish: false, entryBars: 1, exit: 'r2', evidence: '15m long, 150 names: n 4,306, E[R] −0.106 (H1 −0.143 / H2 −0.075) — failed both halves' },
  '15m|short': { publish: false, entryBars: 1, exit: 'r2', evidence: '15m short, 150 names: n 4,789, E[R] −0.115 (H1 −0.121 / H2 −0.108) — failed both halves' },
  '1d|long': { publish: false, entryBars: 1, exit: 'r2', evidence: 'daily long, 300 names: n 371, E[R] −0.195 (H1 −0.159 / H2 −0.253) — failed both halves' },
  '1d|short': { publish: false, entryBars: 1, exit: 'r2', evidence: 'daily short, 300 names: n 233, E[R] −0.396 (H1 −0.100 / H2 −0.710) — failed both halves' },
};
// Not wired: SPY 1-min short (2R) is the only stock cell of 269 that passed (n 182, H1 +0.027 / H2 +0.141,
// −best +0.008 / +0.117) — a multiple-comparisons-sized result whose SPXW/SPY 0DTE expression failed
// (SPXW −0.009 / −0.054 per $1). Re-test it on the forward log before it is ever considered.

export const HG_LIVE_CFG = {
  START_MIN: 9 * 60 + 40,
  END_MIN: 16 * 60,
  UNIVERSE_CAP: Math.max(10, Number(process.env.HOLY_GRAIL_UNIVERSE_CAP) || 150),
  MAX_PUBLISH_PER_DAY: Math.max(0, Number(process.env.HOLY_GRAIL_MAX_PER_DAY ?? 6)),
  /** A fill counts as fresh (publishable) while its bar closed within this many minutes beyond the bar length. */
  FRESH_EXTRA_MIN: 6,
  WARM_5M_BARS: 400,
  WARM_DAILY_BARS: 200,
  SYMBOLS_PER_REQUEST: 100,
} as const;

const TF_MIN: Record<Exclude<HgTf, '1d'>, number> = { '5m': 5, '15m': 15 };

export function holyGrailEnabled(): boolean {
  return process.env.HOLY_GRAIL === 'true';
}

export interface HgRow {
  symbol: string; tf: HgTf; side: HgSide;
  status: 'armed' | 'triggered' | 'published';
  /** Signal bar (the EMA touch that set the live entry stop): start ISO + ET clock / session date. */
  signalAt: string; signalEt: string;
  /** Exact trigger: the fill bar (start) — ISO + ET clock. Null while armed. */
  triggerAt: string | null; triggerEt: string | null;
  adx: number; plusDI: number; minusDI: number; ema: number;
  entryStop: number; fill: number | null; stop: number;
  swingTarget: number; target2R: number | null; planTarget: number | null; planExit: HgExitRule;
  entryBars: number;
  reason: string | null;
  ideaId: string | null;
  replay: { publish: boolean; exit: HgExitRule; evidence: string };
  measuring: true;
}
export interface HgCycle {
  at: string; dateKey: string; enabled: boolean; skipped: string | null;
  universeSize: number; requests: number; feed: string | null;
  rows: HgRow[]; published: Array<{ ideaId: string | null; symbol: string; tf: HgTf; side: HgSide }>;
  cycleMs: number; errors: string[]; label: 'measuring';
}

// ─── warm-up state (once per day per symbol) ─────────────────────────────

interface Warm { dateKey: string; m5: HgBar[]; d1: HgBar[] }
const warmStore = new BoundedCache<string, Warm>({
  name: 'holyGrail.warm', maxEntries: 260, ttlMs: 20 * 3600_000, maxBytes: 30 * 1024 * 1024,
  sizeOf: (v) => 256 + (v.m5.length + v.d1.length) * 96,
});
let day = { dateKey: '', seen: new Set<string>(), published: 0, rows: [] as HgRow[] };
let lastCycle: HgCycle | null = null;
let inflight: Promise<HgCycle> | null = null;

function resetDay(dateKey: string) {
  if (day.dateKey !== dateKey) day = { dateKey, seen: new Set(), published: 0, rows: [] };
}

type FetchJson = import('./zero-dte-sniper').FetchJson;

function toBar(b: any, session: string): HgBar { return { t: Date.parse(b.t), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, session }; }

async function ensureWarm(symbols: string[], dateKey: string, nowMs: number, fetchJson?: FetchJson): Promise<void> {
  const need = symbols.filter((s) => warmStore.get(s)?.dateKey !== dateKey);
  if (!need.length) return;
  const { fetchStockBarsBatched } = await import('./zero-dte-sniper');
  for (let i = 0; i < need.length; i += HG_LIVE_CFG.SYMBOLS_PER_REQUEST) {
    const chunk = need.slice(i, i + HG_LIVE_CFG.SYMBOLS_PER_REQUEST);
    const m5 = await fetchStockBarsBatched(chunk, '5Min', new Date(nowMs - 12 * 86400_000).toISOString(), fetchJson);
    const d1 = await fetchStockBarsBatched(chunk, '1Day', new Date(nowMs - 300 * 86400_000).toISOString(), fetchJson);
    for (const s of chunk) {
      const a5: HgBar[] = [];
      for (const b of m5.get(s) ?? []) {
        const ck = etClock(Date.parse(b.t));
        if (ck.dateKey >= dateKey || ck.min < 9 * 60 + 30 || ck.min >= 16 * 60) continue;
        a5.push(toBar(b, ck.dateKey));
      }
      const a1 = (d1.get(s) ?? []).map((b) => toBar(b, etClock(Date.parse(b.t) + 12 * 3600_000).dateKey)).filter((b) => b.session < dateKey);
      warmStore.set(s, { dateKey, m5: a5.slice(-HG_LIVE_CFG.WARM_5M_BARS), d1: a1.slice(-HG_LIVE_CFG.WARM_DAILY_BARS) });
    }
  }
}

/** Closed bars of `tfMin` built from today's closed 1-min bars, appended to the warm-up. */
export function buildIntraday(warm5: readonly HgBar[], today1: readonly HgBar[], tfMin: 5 | 15, nowMs: number): HgBar[] {
  const t5 = aggregateBars(today1, 5).filter((b) => b.t + 5 * 60_000 <= nowMs);
  const base = [...warm5, ...t5];
  if (tfMin === 5) return base;
  return aggregateBars(base, 15, 5).filter((b) => b.t + 15 * 60_000 <= nowMs);
}

/** The daily series with today's running bar appended (from 1-min bars), so a daily entry stop can fill intraday. */
export function buildDaily(warmD: readonly HgBar[], today1: readonly HgBar[], dateKey: string): HgBar[] {
  if (!today1.length) return [...warmD];
  const run: HgBar = { t: today1[0].t, o: today1[0].o, h: Math.max(...today1.map((b) => b.h)), l: Math.min(...today1.map((b) => b.l)), c: today1[today1.length - 1].c, v: today1.reduce((a, b) => a + b.v, 0), session: dateKey };
  return [...warmD, run];
}

function etHm(ms: number): string { return hhmm(etClock(ms).min); }

/** ET wall-clock minute on `dateKey` → epoch ms (ET is UTC−4 or UTC−5). */
function etWallMs(dateKey: string, minOfDay: number): number {
  const guess = Date.parse(`${dateKey}T${hhmm(minOfDay)}:00Z`);
  for (const off of [4, 5]) { const t = guess + off * 3600_000; if (etMinutes(t) === minOfDay && etDateKey(t) === dateKey) return t; }
  return guess + 4 * 3600_000;
}

/** Rows for one symbol × timeframe from the shared detector (pure apart from the clock). */
export function rowsFor(symbol: string, tf: HgTf, bars: HgBar[], dateKey: string): HgRow[] {
  if (bars.length < 40) return [];
  const intraday = tf !== '1d';
  const out: HgRow[] = [];
  for (const side of ['long', 'short'] as const) {
    const pol = HG_POLICIES[`${tf}|${side}`];
    const params = { entryBars: pol.entryBars, intraday, maxHoldBars: 10 };
    if (intraday) {
      // today's session: fills, and the setup whose entry stop is still live at the last closed bar
      for (const s of detectHolyGrail(bars, params, { includePending: true })) {
        if (s.side !== side) continue;
        const idx = s.fillIdx ?? s.signalIdx;
        if (bars[idx].session === dateKey) out.push(toRow(symbol, tf, bars, s, pol));
      }
      continue;
    }
    // daily: fills on today's running bar …
    const hasRunning = bars[bars.length - 1].session === dateKey;
    if (hasRunning) {
      for (const s of detectHolyGrail(bars, params)) if (s.side === side && s.fillIdx === bars.length - 1) out.push(toRow(symbol, tf, bars, s, pol));
    }
    // … and setups armed by the last COMPLETED bar (entry stop valid today)
    const done = hasRunning ? bars.slice(0, -1) : bars;
    const filledToday = new Set(out.filter((r) => r.side === side).map((r) => r.signalAt));
    for (const s of detectHolyGrail(done, params, { includePending: true })) {
      if (s.side !== side || s.fillIdx != null) continue;
      const row = toRow(symbol, tf, done, s, pol);
      if (!filledToday.has(row.signalAt)) out.push(row);
    }
  }
  return out;
}

function toRow(symbol: string, tf: HgTf, bars: HgBar[], s: HgSignal, pol: HgPolicy): HgRow {
  const intraday = tf !== '1d';
  const sig = bars[s.signalIdx];
  const filled = s.fillIdx != null ? bars[s.fillIdx] : null;
  const r2 = s.fill != null ? (hgTarget(s, 'r2') as number) : null;
  const plan = s.fill != null ? hgTarget(s, pol.exit) : null;
  return {
    symbol, tf, side: s.side, status: filled ? 'triggered' : 'armed',
    signalAt: new Date(sig.t).toISOString(), signalEt: intraday ? etHm(sig.t) : sig.session,
    triggerAt: filled ? new Date(filled.t).toISOString() : null, triggerEt: filled ? (intraday ? etHm(filled.t) : `${filled.session} (daily bar)`) : null,
    adx: +s.adx.toFixed(1), plusDI: +s.plusDI.toFixed(1), minusDI: +s.minusDI.toFixed(1), ema: +s.ema.toFixed(2),
    entryStop: s.entryStop, fill: s.fill, stop: s.stop, swingTarget: s.swingTarget,
    target2R: r2 != null ? +r2.toFixed(2) : null, planTarget: plan != null ? +plan.toFixed(2) : null, planExit: pol.exit,
    entryBars: pol.entryBars, reason: null, ideaId: null,
    replay: { publish: pol.publish, exit: pol.exit, evidence: pol.evidence }, measuring: true,
  };
}

async function publishIdea(row: HgRow, nowMs: number): Promise<string | null> {
  const { storage } = await import('./storage');
  const long = row.side === 'long';
  const entry = row.fill as number; const stop = row.stop; const target = row.planTarget as number;
  const rr = Math.abs(target - entry) / Math.abs(entry - stop);
  const intraday = row.tf !== '1d';
  const created = await storage.createTradeIdea({
    symbol: row.symbol, assetType: 'stock', direction: row.side,
    entryPrice: +entry.toFixed(2), targetPrice: +target.toFixed(2), stopLoss: +stop.toFixed(2), riskRewardRatio: +rr.toFixed(2),
    catalyst: `${row.symbol} Holy Grail ${row.tf} ${long ? 'LONG' : 'SHORT'} — ADX ${row.adx} pullback to EMA20 ${row.ema.toFixed(2)}, triggered ${row.triggerEt} ET (measuring)`,
    analysis: [
      `Raschke Holy Grail: ADX(14) ${row.adx} > 30 and rising with ${long ? '+DI' : '−DI'} on top (+DI ${row.plusDI} / −DI ${row.minusDI}); price pulled back to the 20-EMA (${row.ema.toFixed(2)}) on the ${row.signalEt}${intraday ? ' ET' : ''} bar.`,
      `Entry: ${long ? 'buy' : 'sell'} stop ${row.entryStop.toFixed(2)} (1 tick beyond the signal bar), filled ${entry.toFixed(2)} on the ${row.triggerEt} bar.`,
      `Stop ${stop.toFixed(2)} (pullback extreme). Target ${target.toFixed(2)} — ${HG_EXIT_LABEL[row.planExit]}; swing extreme ${row.swingTarget.toFixed(2)}.`,
      `Replay: ${row.replay.evidence}.`,
      'Measuring — replay-selected (both walk-forward halves) but unproven live.',
    ].join(' '),
    source: HG_SOURCE, dataSourceUsed: `holy_grail_${row.tf}_${row.side}`,
    sessionContext: intraday ? 'intraday' : 'regular', timestamp: new Date(nowMs).toISOString(),
    ...(intraday ? { exitBy: new Date(etWallMs(etDateKey(nowMs), 15 * 60 + 55)).toISOString() } : {}),
    tradeType: intraday ? 'day' : 'swing', holdingPeriod: intraday ? 'day' : 'swing', outcomeStatus: 'open', confidenceScore: 50,
    qualitySignals: [
      `setup:holy_grail`, `tf:${row.tf}`, `side:${row.side}`, `trigger_at:${row.triggerAt}`, `adx:${row.adx}`, `ema20:${row.ema.toFixed(2)}`,
      `exit_plan:${row.planExit}`, `entry_bars:${row.entryBars}`, 'validated:false', 'measuring',
    ],
    convergenceSignalsJson: { holyGrail: row },
  } as any, { dedupWindowHours: intraday ? 2 : 24 });
  return (created as any)?.id ?? null;
}

// ─── the cycle ────────────────────────────────────────────────────────────

async function boardUniverse(): Promise<string[]> {
  let conv: string[] = [];
  try {
    const { peekConvictions } = await import('./convictions-engine');
    const hit = peekConvictions();
    if (hit) conv = hit.data.picks.map((p) => p.symbol);
  } catch { /* convictions optional */ }
  const { buildUniverse } = await import('./zero-dte-sniper');
  return buildUniverse({ convictions: conv, watch: parseWatch(process.env.HOLY_GRAIL_WATCH ?? process.env.ZERO_DTE_WATCH), cap: HG_LIVE_CFG.UNIVERSE_CAP }).symbols;
}

/**
 * One cycle. `force` ignores the clock, `universe` replaces the board,
 * `publish:false` never writes an idea (dry runs, tests).
 */
export async function runHolyGrail(nowMs = Date.now(), opts: { force?: boolean; fetchJson?: FetchJson; publish?: boolean; universe?: string[] } = {}): Promise<HgCycle> {
  if (inflight) return inflight;
  inflight = cycle(nowMs, opts).finally(() => { inflight = null; });
  return inflight;
}

async function cycle(nowMs: number, opts: Parameters<typeof runHolyGrail>[1] = {}): Promise<HgCycle> {
  const t0 = Date.now();
  const dateKey = etDateKey(nowMs);
  resetDay(dateKey);
  const base: HgCycle = { at: new Date(nowMs).toISOString(), dateKey, enabled: holyGrailEnabled(), skipped: null, universeSize: 0, requests: 0, feed: null, rows: [], published: [], cycleMs: 0, errors: [], label: 'measuring' };
  const finish = (c: HgCycle): HgCycle => {
    c.cycleMs = Date.now() - t0;
    lastCycle = c;
    if (writesSharedState()) writeSharedSync(HG_SHARED, { cycle: c, dayRows: day.rows });
    return c;
  };
  const wd = new Date(nowMs).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' });
  const min = etMinutes(nowMs);
  if (!opts.force && (wd === 'Sat' || wd === 'Sun' || min < HG_LIVE_CFG.START_MIN || min > HG_LIVE_CFG.END_MIN)) return finish({ ...base, skipped: `outside 09:40–16:00 ET weekdays (${wd} ${hhmm(min)})` });
  if (!opts.fetchJson && (!process.env.ALPACA_API_KEY || !process.env.ALPACA_SECRET_KEY)) return finish({ ...base, skipped: 'Alpaca keys not configured' });

  const symbols = opts.universe ?? await boardUniverse();
  base.universeSize = symbols.length;
  try {
    await ensureWarm(symbols, dateKey, nowMs, opts.fetchJson);
    const { refreshStage1Bars } = await import('./zero-dte-sniper');
    const s1 = await refreshStage1Bars(symbols, nowMs, opts.fetchJson);
    base.requests = s1.requests; base.feed = s1.feed;
  } catch (e) {
    base.errors.push(`bars: ${(e as Error).message}`);
    return finish(base);
  }
  const { peekStage1Bars } = await import('./zero-dte-sniper');
  const allowPublish = opts.publish ?? holyGrailEnabled();
  for (const sym of symbols) {
    const warm = warmStore.get(sym);
    const held = peekStage1Bars(sym);
    if (!warm) continue;
    const today1: HgBar[] = held && held.dateKey === dateKey
      ? held.bars.filter((b) => b.t + 60_000 <= nowMs).map((b) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, session: dateKey }))
      : [];
    const series: Array<[HgTf, HgBar[]]> = [
      ['5m', buildIntraday(warm.m5, today1, 5, nowMs)],
      ['15m', buildIntraday(warm.m5, today1, 15, nowMs)],
      ['1d', buildDaily(warm.d1, today1, dateKey)],
    ];
    for (const [tf, bars] of series) {
      for (const row of rowsFor(sym, tf, bars, dateKey)) {
        const key = `${sym}|${tf}|${row.side}|${row.signalAt}|${row.status}`;
        if (row.status === 'triggered') {
          const tfMin = tf === '1d' ? null : TF_MIN[tf];
          const fresh = tfMin == null || nowMs - Date.parse(row.triggerAt as string) <= (tfMin + HG_LIVE_CFG.FRESH_EXTRA_MIN) * 60_000;
          if (!row.replay.publish) row.reason = `${tf} ${row.side} did not survive the walk-forward replay — watch only`;
          else if (!allowPublish) row.reason = 'publishable, but HOLY_GRAIL is off';
          else if (!fresh) row.reason = 'trigger older than this cycle — not chased';
          else if (day.seen.has(key)) row.reason = 'already handled this trigger';
          else if (day.published >= HG_LIVE_CFG.MAX_PUBLISH_PER_DAY) row.reason = `daily cap ${HG_LIVE_CFG.MAX_PUBLISH_PER_DAY} reached`;
          else {
            try {
              row.ideaId = await publishIdea(row, nowMs);
              row.status = 'published'; day.published++;
              base.published.push({ ideaId: row.ideaId, symbol: sym, tf, side: row.side });
              logger.info(`[HOLY-GRAIL] ✅ ${sym} ${tf} ${row.side} @ ${row.fill} (ADX ${row.adx}, measuring)`);
            } catch (e) {
              row.reason = `write gate: ${(e as Error).message}`;
            }
          }
        } else {
          row.reason = `armed — ${row.side === 'long' ? 'buy' : 'sell'} stop ${row.entryStop.toFixed(2)} valid ${row.entryBars} bar${row.entryBars > 1 ? 's' : ''}`;
        }
        base.rows.push(row);
        if (!day.seen.has(key)) { day.seen.add(key); day.rows.push(row); }
      }
    }
  }
  if (day.rows.length > 400) day.rows = day.rows.slice(-400);
  logger.info(`[HOLY-GRAIL] ${hhmm(min)} ET: universe ${base.universeSize}, ${base.rows.filter((r) => r.status === 'armed').length} armed / ${base.rows.filter((r) => r.status !== 'armed').length} triggered, ${base.published.length} published, ${base.requests} bar requests`);
  return finish(base);
}

// ─── read side + routes ───────────────────────────────────────────────────

function readState(): { cycle: HgCycle | null; dayRows: HgRow[]; stamp: ReturnType<typeof sharedStamp> | null } {
  let cycle = lastCycle; let dayRows = day.rows; let stamp: ReturnType<typeof sharedStamp> | null = null;
  if (readsSharedState()) {
    const r = readShared<{ cycle: HgCycle; dayRows: HgRow[] }>(HG_SHARED, 30 * 60_000);
    stamp = sharedStamp(r);
    if (r) { cycle = r.data.cycle; dayRows = r.data.dayRows ?? []; }
  }
  return { cycle, dayRows, stamp };
}

export function getHolyGrailState() {
  const { cycle, dayRows, stamp } = readState();
  const today = etDateKey(Date.now());
  return {
    enabled: holyGrailEnabled(), label: 'measuring' as const,
    lastCycle: cycle,
    today: dayRows.filter((r) => etDateKey(Date.parse(r.triggerAt ?? r.signalAt)) === today || r.tf === '1d').slice(-200),
    policies: HG_POLICIES,
    engineState: stamp,
    cfg: { cadence: 'every 5 min 09:41–15:56 ET', universeCap: HG_LIVE_CFG.UNIVERSE_CAP, maxPublishPerDay: HG_LIVE_CFG.MAX_PUBLISH_PER_DAY },
  };
}

/** Active Holy Grail setups for one symbol from the LAST cycle (armed or triggered within the last hour; daily rows of today). */
export function getHolyGrailForSymbol(symbol: string, nowMs = Date.now()) {
  const { cycle } = readState();
  const sym = symbol.toUpperCase();
  const fresh = !!cycle && nowMs - Date.parse(cycle.at) <= 15 * 60_000;
  const active = (fresh ? cycle!.rows : []).filter((r) => r.symbol === sym && (r.status === 'armed' || r.tf === '1d' || nowMs - Date.parse(r.triggerAt as string) <= 60 * 60_000));
  return { symbol: sym, enabled: holyGrailEnabled(), asOf: cycle?.at ?? null, active, label: 'measuring' as const };
}

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;
export function registerHolyGrailRoutes(app: Express, requireBetaAccess: Mw) {
  app.get('/api/holy-grail', requireBetaAccess, (_req, res) => {
    try { res.json(getHolyGrailState()); } catch (err) {
      logger.error('[HOLY-GRAIL] state failed', { error: (err as Error)?.message });
      res.status(500).json({ error: 'holy grail state failed' });
    }
  });
  app.get('/api/holy-grail/:symbol', requireBetaAccess, (req, res) => {
    try {
      const sym = String(req.params.symbol ?? '').toUpperCase();
      if (!/^[A-Z.]{1,6}$/.test(sym)) return res.status(400).json({ error: 'bad symbol' });
      res.json(getHolyGrailForSymbol(sym));
    } catch (err) {
      logger.error('[HOLY-GRAIL] symbol read failed', { error: (err as Error)?.message });
      res.status(500).json({ error: 'holy grail read failed' });
    }
  });
}
