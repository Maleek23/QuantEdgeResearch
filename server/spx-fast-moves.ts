/**
 * SPX FAST MOVES — live detector (FLAGGED OFF: SPX_FAST_MOVES=true enables it).
 * =============================================================================
 * Every minute 09:31–10:31 and 14:30–15:58 ET (server/idea-producer-schedule.ts),
 * and from the index 0DTE engine between 15:45 and 15:55 (its A/B policies close
 * at 15:45; only these causes may publish after that — server/index-scalp-engine.ts):
 *
 *   SPY 1-min bars (+ VIXY) since 04:00 ET, one incremental Alpaca request per pass
 *   + a once-a-day 20-session baseline (time-of-day volume, prior-day H/L/C, ATR20,
 *     the 08:30 pre-market volume median)
 *   + the calendar (month/quarter-end, OPEX, quad witching, rebalance, VIX expiry, FOMC)
 *   → server/spx-fast-moves-core.ts detectFastMoves (the replayed detectors, causal).
 *
 * What it publishes is decided by FAST_MOVE_POLICIES in the core, filled from
 * the 12-month replay on real SPXW bars (docs/SPX_FAST_MOVES_2026-09-30.md):
 *   • publish: true   — none. No cause cleared the pre-registered bar.
 *   • candidate: true — published ONLY with SPX_FAST_MOVES_CANDIDATES=true, labelled
 *                       "unvalidated candidate — measuring", with the replay numbers.
 *   • everything else — a watch row in the engine state/log, never an idea.
 * On close-flow days (month/quarter-end, OPEX, rebalance) a "close-flow risk"
 * context line is carried from 15:30 (state, logs, the index engine's SPY waits,
 * and any idea published).
 *
 * Contract: the SPXW 0DTE strike (5-pt grid at SPY × live ^GSPC/SPY) with its
 * last real 1-min print from Alpaca, and the SPY equivalent (live chain ask).
 * GEX (zero-γ / walls / sign) is stamped as CONTEXT only — read from the chart
 * recorder's latest sample, else the 60-s cached aggregate — it gates nothing
 * because it could not be replayed (no historical chains).
 */
import { logger } from './logger';
import {
  detectFastMoves, calendarFlags, pickFastStrike, closeFlowRiskLine, fastMovePolicy, isTradingDay, fmHhmm,
  CAUSE_LABEL, CAUSE_WINDOW, FM_EXIT_LABEL, FM_VARIANT_BAND,
  type CalendarFlags, type FmDayContext, type FmTrigger, type MinuteBar, type FastMovePolicy,
} from './spx-fast-moves-core';
import { etClock } from './zero-dte-sniper-core';

export const SPX_FAST_SOURCE = 'spx_fast_move';
export function spxFastMovesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.SPX_FAST_MOVES === 'true';
}
export function spxFastCandidatesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.SPX_FAST_MOVES_CANDIDATES === 'true';
}

/** Live windows (ET minute of the wall clock): open-drive causes and afternoon/close causes. */
export const LIVE_WINDOWS: Array<[number, number]> = [[571, 631], [870, 958]];
export const inLiveWindow = (etMin: number) => LIVE_WINDOWS.some(([a, b]) => etMin >= a && etMin <= b);
/** A trigger is "fresh" (publishable) when its bar closed within this many minutes. */
const FRESH_MIN = 3;

export type FetchJson = (url: string) => Promise<{ status: number; json: any | null }>;
const defaultFetch: FetchJson = async (url) => {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12_000);
  try {
    const r = await fetch(url, { headers: { 'APCA-API-KEY-ID': process.env.ALPACA_API_KEY ?? '', 'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY ?? '' }, signal: ctl.signal });
    if (!r.ok) return { status: r.status, json: null };
    return { status: r.status, json: await r.json() };
  } catch {
    return { status: 0, json: null };
  } finally {
    clearTimeout(timer);
  }
};

export interface FastRow {
  at: string;              // ET HH:MM the trigger became known (bar close)
  triggerAt: string;       // ISO of the bar close
  cause: string; label: string; side: 'long' | 'short';
  price: number; level: number; levelName: string; note: string; rvol1: number | null;
  status: 'published' | 'candidate (flag off)' | 'watch — not validated' | 'stale' | 'publish failed';
  ideaId?: string | null;
  contract?: { ratio: number | null; spxw: string | null; spxwStrike: number | null; spxwPremium: number | null; spxwPrintAt: string | null; spy: string | null; spyStrike: number | null; spyAsk: number | null };
}
export interface FastCycle {
  at: string; dateKey: string; etMin: number; ran: boolean; reason?: string;
  bars: number; requests: number; feed: string;
  calendar: string[]; closeFlowLine: string | null; macro0830: boolean | null;
  fresh: FastRow[]; rows: FastRow[];
}

// ─── per-day state ─────────────────────────────────────────────────────────
interface Baseline { dateKey: string; volBase: Float64Array; pdh: number; pdl: number; pdc: number; atr20: number; pre0830Median: number | null }
let base: Baseline | null = null;
let today = { dateKey: '', spy: [] as MinuteBar[], pre0830: 0, vix: [] as MinuteBar[], lastT: 0, lastVixT: 0 };
let seen = new Set<string>();
let rowsToday: FastRow[] = [];
let lastCycle: FastCycle | null = null;
let inflight: Promise<FastCycle> | null = null;
let feed: 'sip' | 'iex' = process.env.SPX_FAST_MOVES_FEED === 'iex' ? 'iex' : 'sip';

function resetDay(dateKey: string) {
  if (today.dateKey === dateKey) return;
  today = { dateKey, spy: [], pre0830: 0, vix: [], lastT: 0, lastVixT: 0 };
  seen = new Set(); rowsToday = [];
}

/** ET wall clock → epoch ms (DST-safe: try both offsets). */
export function etWallMs(dateKey: string, minOfDay: number): number {
  const hm = fmHhmm(minOfDay);
  for (const off of [4, 5]) {
    const t = Date.parse(`${dateKey}T${hm}:00Z`) + off * 3600_000;
    const c = etClock(t);
    if (c.min === minOfDay && c.dateKey === dateKey) return t;
  }
  return Date.parse(`${dateKey}T${hm}:00Z`) + 4 * 3600_000;
}

async function bars(symbols: string[], startIso: string, fetchJson: FetchJson, counter: { n: number }, endIso?: string): Promise<Map<string, any[]>> {
  const out = new Map<string, any[]>();
  let token: string | null = null;
  for (let page = 0; page < 20; page++) {
    const qs = new URLSearchParams({ symbols: symbols.join(','), timeframe: '1Min', start: startIso, limit: '10000', adjustment: 'split', feed });
    if (endIso) qs.set('end', endIso);
    if (token) qs.set('page_token', token);
    const { status, json } = await fetchJson(`https://data.alpaca.markets/v2/stocks/bars?${qs}`);
    counter.n++;
    if (status === 403 && feed === 'sip') { feed = 'iex'; page--; token = null; logger.warn('[SPX-FAST] SIP refused recent bars — IEX feed'); continue; }
    if (!json) throw new Error(`stock bars HTTP ${status}`);
    for (const [s, arr] of Object.entries(json.bars ?? {}) as Array<[string, any[]]>) { const a = out.get(s) ?? []; a.push(...arr); out.set(s, a); }
    token = json.next_page_token ?? null;
    if (!token) break;
  }
  return out;
}

/** Once a day: 20-session baseline from SPY 1-min bars (time-of-day volume, prior-day levels, ATR20, 08:30 volume median). */
async function ensureBaseline(dateKey: string, fetchJson: FetchJson, counter: { n: number }): Promise<Baseline | null> {
  if (base?.dateKey === dateKey) return base;
  const start = new Date(etWallMs(dateKey, 240) - 40 * 86400_000).toISOString();
  const end = new Date(etWallMs(dateKey, 240)).toISOString();
  const rows = (await bars(['SPY'], start, fetchJson, counter, end)).get('SPY') ?? [];
  const byDay = new Map<string, { rth: Array<{ min: number; h: number; l: number; c: number; v: number }>; v0830: number }>();
  for (const b of rows) {
    const ck = etClock(Date.parse(b.t));
    if (ck.dateKey >= dateKey) continue;
    let d = byDay.get(ck.dateKey); if (!d) { d = { rth: [], v0830: 0 }; byDay.set(ck.dateKey, d); }
    if (ck.min >= 510 && ck.min < 515) d.v0830 += b.v;
    if (ck.min >= 570 && ck.min < 960) d.rth.push({ min: ck.min, h: b.h, l: b.l, c: b.c, v: b.v });
  }
  const days = [...byDay.keys()].filter((d) => byDay.get(d)!.rth.length >= 300).sort().slice(-20);
  if (days.length < 10) return null;
  const s = new Float64Array(390), n = new Float64Array(390);
  for (const d of days) for (const b of byDay.get(d)!.rth) { s[b.min - 570] += b.v; n[b.min - 570]++; }
  const volBase = new Float64Array(390);
  for (let k = 0; k < 390; k++) volBase[k] = n[k] >= 10 ? s[k] / n[k] : NaN;
  const dl = days.map((d) => { const r = byDay.get(d)!.rth; return { h: Math.max(...r.map((b) => b.h)), l: Math.min(...r.map((b) => b.l)), c: r[r.length - 1].c }; });
  const pd = dl[dl.length - 1];
  const pre = days.map((d) => byDay.get(d)!.v0830).filter((x) => x > 0).sort((a, b) => a - b);
  base = { dateKey, volBase, pdh: pd.h, pdl: pd.l, pdc: pd.c, atr20: dl.reduce((a, x) => a + (x.h - x.l), 0) / dl.length, pre0830Median: pre.length >= 10 ? pre[Math.floor(pre.length / 2)] : null };
  return base;
}

async function refreshToday(dateKey: string, nowMs: number, fetchJson: FetchJson, counter: { n: number }): Promise<void> {
  const since = Math.max(Math.min(today.lastT || Infinity, today.lastVixT || Infinity) + 60_000, etWallMs(dateKey, 240));
  const start = Number.isFinite(since) ? since : etWallMs(dateKey, 240);
  const rows = await bars(['SPY', 'VIXY'], new Date(start).toISOString(), fetchJson, counter);
  for (const [sym, arr] of rows) {
    for (const b of arr) {
      const t = Date.parse(b.t);
      if (t + 60_000 > nowMs) continue; // closed bars only
      const ck = etClock(t);
      if (ck.dateKey !== dateKey) continue;
      if (sym === 'SPY') {
        if (t <= today.lastT) continue;
        today.lastT = t;
        if (ck.min >= 510 && ck.min < 515) today.pre0830 += b.v;
        if (ck.min >= 570 && ck.min < 960) today.spy.push({ t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, vw: b.vw, min: ck.min });
      } else {
        if (t <= today.lastVixT) continue;
        today.lastVixT = t;
        if (ck.min >= 570 && ck.min < 960) today.vix.push({ t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, min: ck.min });
      }
    }
  }
}

// ─── contract + context (only when something is about to publish) ─────────

async function spxwLastPrint(occ: string, nowMs: number, fetchJson: FetchJson): Promise<{ px: number; at: string } | null> {
  const qs = new URLSearchParams({ symbols: occ, timeframe: '1Min', start: new Date(nowMs - 10 * 60_000).toISOString(), limit: '20' });
  const { json } = await fetchJson(`https://data.alpaca.markets/v1beta1/options/bars?${qs}`);
  const arr: any[] = json?.bars?.[occ] ?? [];
  const last = arr[arr.length - 1];
  return last ? { px: Number(last.c), at: fmHhmm(etClock(Date.parse(last.t)).min) } : null;
}

async function pickContracts(t: FmTrigger, pol: FastMovePolicy, dateKey: string, nowMs: number, fetchJson: FetchJson): Promise<NonNullable<FastRow['contract']>> {
  const type = t.side === 'long' ? 'C' : 'P';
  let ratio: number | null = null;
  try {
    const { fetchYahooFinancePrice } = await import('./market-api');
    const q = await fetchYahooFinancePrice('%5EGSPC');
    if (q?.currentPrice && q.currentPrice > 1000) ratio = q.currentPrice / t.price;
  } catch { /* ratio stays null */ }
  const spxSpot = t.price * (ratio ?? 10);
  const mid = Math.round(spxSpot / 5) * 5; const grid: number[] = []; for (let k = mid - 300; k <= mid + 300; k += 5) grid.push(k);
  const spxwStrike = pickFastStrike(grid, spxSpot, t.side, pol.variant);
  const spxw = spxwStrike != null ? `SPXW${dateKey.slice(2).replace(/-/g, '')}${type}${String(spxwStrike * 1000).padStart(8, '0')}` : null;
  const print = spxw ? await spxwLastPrint(spxw, nowMs, fetchJson).catch(() => null) : null;
  let spy: string | null = null, spyStrike: number | null = null, spyAsk: number | null = null;
  try {
    const ap = await import('./alpaca-options');
    const chain = await ap.getAlpacaOptionsChain('SPY', { expiration: dateKey, band: 0.03 });
    const same = (chain?.contracts ?? []).filter((c) => c.expiration === dateKey && c.type === (t.side === 'long' ? 'call' : 'put'));
    spyStrike = pickFastStrike(same.map((c) => c.strike), t.price, t.side, pol.variant);
    const c = same.find((x) => x.strike === spyStrike);
    if (c) { spy = c.occ; spyAsk = c.ask ?? null; }
  } catch (e) { logger.warn(`[SPX-FAST] SPY chain failed: ${(e as Error).message}`); }
  return { ratio, spxw: ratio != null ? spxw : null, spxwStrike: ratio != null ? spxwStrike : null, spxwPremium: ratio != null ? print?.px ?? null : null, spxwPrintAt: print?.at ?? null, spy, spyStrike, spyAsk };
}

async function gexContext(): Promise<string> {
  try {
    const { peekLatestGexSample } = await import('./chart-overlays');
    const s = peekLatestGexSample('SPY');
    if (s && Date.now() - s.t < 15 * 60_000) {
      const netB = s.net / 1e9;
      return `GEX context (chart recorder, ${Math.round((Date.now() - s.t) / 60_000)}m old): net ${netB >= 0 ? '+' : ''}${netB.toFixed(2)}B (${netB > 0.05 ? 'dealers long gamma' : netB < -0.05 ? 'dealers short gamma' : 'neutral'}); top strikes ${s.levels.slice(0, 4).map(([k]) => k).join(', ')}. Context only — not replayable, gates nothing.`;
    }
    const { calculateAggregateGammaExposure } = await import('./gamma-exposure');
    const g = await calculateAggregateGammaExposure('SPY');
    if (g) return `GEX context (aggregate, cached ≤60 s): zero-γ ${g.flipPoint?.toFixed(2) ?? '—'} · put/call wall ${g.putWall ?? '—'}/${g.callWall ?? '—'} · net ${g.totalNetGEX.toFixed(2)}B. Context only — not replayable, gates nothing.`;
  } catch { /* no context */ }
  return 'GEX context unavailable.';
}

async function publish(t: FmTrigger, pol: FastMovePolicy, c: NonNullable<FastRow['contract']>, cal: CalendarFlags, etMin: number, nowMs: number, dateKey: string): Promise<string | null> {
  const useSpx = c.spxw != null && c.spxwPremium != null && c.spxwPremium > 0;
  if (!useSpx && !(c.spy && c.spyAsk)) return null;
  const { storage } = await import('./storage');
  const long = t.side === 'long';
  const scale = useSpx ? c.ratio ?? 10 : 1;
  const stop = long ? Math.min(t.level, t.price * 0.998) : Math.max(t.level, t.price * 1.002);
  const risk = Math.abs(t.price - stop);
  const target = long ? t.price + 2 * risk : t.price - 2 * risk;
  const knownAt = fmHhmm(t.min + 1);
  const cf = closeFlowRiskLine(cal, etMin);
  const premium = useSpx ? c.spxwPremium! : c.spyAsk!;
  const gex = await gexContext();
  const spxLine = c.spxw ? `SPXW ${c.spxwStrike}${long ? 'C' : 'P'} (${c.spxw})${c.spxwPremium != null ? ` last print $${c.spxwPremium.toFixed(2)} at ${c.spxwPrintAt} ET` : ' — no recent print'}` : 'SPXW strike unavailable (no ^GSPC quote)';
  const spyLine = c.spy ? `SPY ${c.spyStrike}${long ? 'C' : 'P'} (${c.spy}) ask $${c.spyAsk?.toFixed(2) ?? '—'}` : 'SPY 0DTE contract unavailable';
  const created = await storage.createTradeIdea({
    symbol: useSpx ? 'SPX' : 'SPY', sector: 'index', assetType: 'option', direction: t.side,
    entryPrice: +(t.price * scale).toFixed(2), targetPrice: +(target * scale).toFixed(2), stopLoss: +(stop * scale).toFixed(2), riskRewardRatio: 2,
    optionType: long ? 'call' : 'put', strikePrice: useSpx ? c.spxwStrike : c.spyStrike, expiryDate: dateKey, entryPremium: Number(premium.toFixed(2)),
    catalyst: `SPX 0DTE ${long ? 'CALLS' : 'PUTS'} — ${CAUSE_LABEL[t.cause]} @ ${knownAt} ET · ${spxLine} ≈ ${spyLine} · plan: ${FM_EXIT_LABEL[pol.exit]} · ${pol.publish ? 'MEASURING' : 'UNVALIDATED CANDIDATE — measuring'}`,
    analysis: [
      `Trigger (${knownAt} ET, bar ${fmHhmm(t.min)}–${knownAt}): ${t.note}${t.rvol1 != null ? `; trigger bar ${t.rvol1.toFixed(1)}× normal volume for the minute` : ''}.`,
      `Cause: ${CAUSE_LABEL[t.cause]} (${t.side === 'short' ? 'puts' : 'calls'}). Contract: ${FM_VARIANT_BAND[pol.variant].label} — ${spxLine}; SPY equivalent ${spyLine}.`,
      `Exit plan: ${FM_EXIT_LABEL[pol.exit]}. Underlying reference: stop ${stop.toFixed(2)} (back through ${t.levelName}), 2R ${target.toFixed(2)} on SPY.`,
      `Replay (12 months, real SPXW 1-min bars, conservative next-minute-high fills): ${pol.evidence}`,
      cf ?? '',
      gex,
      pol.publish ? 'Measuring — replay-selected, unproven live.' : 'UNVALIDATED candidate: below the 20-trades-per-half bar and contradicted by the SPY/ETF replays. Published only because SPX_FAST_MOVES_CANDIDATES=true.',
    ].filter(Boolean).join(' '),
    source: SPX_FAST_SOURCE, dataSourceUsed: `spx_fast_move_${t.cause}_${t.side}_${pol.variant}`,
    sessionContext: etMin >= 900 ? 'power_hour' : 'intraday', timestamp: new Date(nowMs).toISOString(),
    entryValidUntil: new Date(nowMs + 3 * 60_000).toISOString(),
    exitBy: new Date(etWallMs(dateKey, 959)).toISOString(),
    expiryTier: '0DTE', optionDte: 0, tradeType: 'scalp', holdingPeriod: 'day', outcomeStatus: 'open', confidenceScore: 40,
    qualitySignals: [
      `cause:${t.cause}`, `side:${t.side}`, `variant:${pol.variant}`, `exit_plan:${pol.exit}`, `trigger_at:${new Date(t.t + 60_000).toISOString()}`,
      `level:${t.levelName}@${t.level.toFixed(2)}`, c.spxw ? `spxw:${c.spxw}` : '', c.spy ? `spy_equiv:${c.spy}` : '',
      ...cal.labels.map((l) => `calendar:${l.replace(/\s+/g, '_')}`), cf ? 'close_flow_risk' : '',
      'validated:false', pol.publish ? 'measuring' : 'unvalidated_candidate', 'desk:spx_fast_moves',
    ].filter(Boolean),
  } as any, { dedupWindowHours: 1 });
  return (created as any)?.id ?? null;
}

// ─── the cycle ─────────────────────────────────────────────────────────────

/** Build the detector context from the baseline + today's bars. */
export function buildContext(dateKey: string, b: Baseline, pre0830: number, vix: MinuteBar[]): FmDayContext {
  return {
    day: dateKey, pdh: b.pdh, pdl: b.pdl, pdc: b.pdc, atr20: b.atr20, volBase: b.volBase, cal: calendarFlags(dateKey),
    macro0830: b.pre0830Median != null && b.pre0830Median > 0 && pre0830 / b.pre0830Median >= 2.5, vix,
  };
}

/**
 * One pass. `force` ignores the flag and the clock (tests / dry runs);
 * `publish: false` never writes an idea; `fetchJson` injects the data source.
 */
export async function runSpxFastMoves(nowMs = Date.now(), opts: { force?: boolean; publish?: boolean; fetchJson?: FetchJson } = {}): Promise<FastCycle> {
  if (inflight) return inflight;
  inflight = cycle(nowMs, opts).finally(() => { inflight = null; });
  return inflight;
}

async function cycle(nowMs: number, opts: { force?: boolean; publish?: boolean; fetchJson?: FetchJson }): Promise<FastCycle> {
  const { dateKey, min } = etClock(nowMs);
  const counter = { n: 0 };
  const cal = calendarFlags(dateKey);
  const out: FastCycle = { at: new Date(nowMs).toISOString(), dateKey, etMin: min, ran: false, bars: 0, requests: 0, feed, calendar: cal.labels, closeFlowLine: closeFlowRiskLine(cal, min), macro0830: null, fresh: [], rows: rowsToday };
  if (!opts.force && !spxFastMovesEnabled()) { out.reason = 'SPX_FAST_MOVES is off'; return (lastCycle = out); }
  if (!opts.force && (!isTradingDay(dateKey) || !inLiveWindow(min))) { out.reason = 'outside 09:31–10:31 / 14:30–15:58 ET'; return (lastCycle = out); }
  resetDay(dateKey);
  const fetchJson = opts.fetchJson ?? defaultFetch;
  try {
    const b = await ensureBaseline(dateKey, fetchJson, counter);
    if (!b) { out.reason = 'no 20-session baseline'; return (lastCycle = out); }
    await refreshToday(dateKey, nowMs, fetchJson, counter);
    const ctx = buildContext(dateKey, b, today.pre0830, today.vix);
    out.macro0830 = ctx.macro0830;
    const trig = detectFastMoves(today.spy, ctx);
    for (const t of trig) {
      const key = `${t.cause}:${t.side}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const pol = fastMovePolicy(t.cause, t.side);
      const knownMin = t.min + 1;
      const fresh = min - knownMin <= FRESH_MIN;
      const row: FastRow = {
        at: fmHhmm(knownMin), triggerAt: new Date(t.t + 60_000).toISOString(), cause: t.cause, label: CAUSE_LABEL[t.cause], side: t.side,
        price: t.price, level: +t.level.toFixed(2), levelName: t.levelName, note: t.note, rvol1: t.rvol1 != null ? +t.rvol1.toFixed(2) : null,
        status: !fresh ? 'stale' : pol?.publish ? 'published' : pol?.candidate ? (spxFastCandidatesEnabled() ? 'published' : 'candidate (flag off)') : 'watch — not validated',
      };
      if (row.status === 'published' && pol) {
        if (opts.publish === false) row.status = pol.publish ? 'watch — not validated' : 'candidate (flag off)';
        else {
          try {
            row.contract = await pickContracts(t, pol, dateKey, nowMs, fetchJson);
            row.ideaId = await publish(t, pol, row.contract, cal, min, nowMs, dateKey);
            if (!row.ideaId) row.status = 'publish failed';
          } catch (e) { row.status = 'publish failed'; logger.warn(`[SPX-FAST] publish failed: ${(e as Error).message}`); }
        }
      }
      rowsToday.push(row); out.fresh.push(row);
      logger.info(`[SPX-FAST] ${row.at} ET ${row.label} ${row.side} @ ${t.price.toFixed(2)} — ${row.status}${row.ideaId ? ` (idea ${row.ideaId})` : ''}`);
    }
    out.ran = true;
    out.bars = today.spy.length;
    // Everything outside a cause's window is ignored by the detector itself; the windows are logged for the desk.
    void CAUSE_WINDOW;
  } catch (e) {
    out.reason = `failed: ${(e as Error).message}`;
    logger.warn(`[SPX-FAST] cycle failed: ${(e as Error).message}`);
  }
  out.requests = counter.n; out.feed = feed; out.rows = rowsToday;
  if (out.closeFlowLine && out.ran) logger.info(`[SPX-FAST] ${out.closeFlowLine}`);
  return (lastCycle = out);
}

export function getSpxFastMovesState(): FastCycle | null { return lastCycle; }

/** Test hook: forget all per-day state. */
export function __resetSpxFastMoves(): void {
  base = null; today = { dateKey: '', spy: [], pre0830: 0, vix: [], lastT: 0, lastVixT: 0 }; seen = new Set(); rowsToday = []; lastCycle = null; inflight = null;
}
