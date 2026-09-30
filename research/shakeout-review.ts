/**
 * SHAKEOUT REVIEW — read-only. For every CLOSED LOSS in the NEXUS ideas book
 * (desk, since 2026-08-26) and the Quantinum Bot book: after the exit, would
 * holding have turned green, and did the original target print?
 *
 * Also runs stop-rule what-ifs on every closed desk idea that hit its stop:
 *   A  current rule, re-priced from bars (option value at the first bar that
 *      crossed the underlying stop) — the recorded P&L is shown beside it
 *   B  stop only when the underlying stop is through AND the contract is down ≥25%
 *   C  same with ≥35%
 *   D  stop no tighter than 1.25 × ATR(14) (swing/position only; the floor
 *      server/trade-idea-ingestion.ts applies since 2026-09-24)
 * Trades that did not hit their stop are identical under every rule (a wider or
 * conditional stop cannot change a target-first or held-to-deadline outcome), so
 * they are carried at their recorded P&L.
 *
 * Data (all read-only):
 *   underlying  Yahoo chart API, 5-minute bars (regular session; crypto 24/7)
 *               since 2026-08-19, daily bars for ATR(14)
 *   options     Alpaca v1beta1/options/bars, 1-hour bars (trade prints only —
 *               an illiquid contract can have none; then the underlying decides
 *               and the row is flagged)
 * Bars are time-stamped at their START; a stop "hit" is the first 5-minute bar
 * whose range crossed the level. Hourly option prices are that hour's close —
 * coarse, stated as such. Bounded concurrency (4).
 *
 * Horizon (the original plan): exit_by when set, else publish + 7 days (the
 * validator's backstop), never past the contract's expiry close, never past now.
 *
 * Run (server): npx tsx research/shakeout-review.ts
 * The JSON after "@@JSON@@" is saved as research/shakeout-review-results.json.
 */
import { inArray } from 'drizzle-orm';
import { db } from '../server/db';
import { tradeIdeas, paperPositions } from '@shared/schema';
import { loadJournal, resolveJournal } from '../server/journal-sources';

const TZ = 'America/New_York';
const NOW = Date.now();
const H = 3_600_000, DAY = 86_400_000;
const MID = Date.parse('2026-09-13T00:00:00-04:00');
const r2 = (v: number) => Math.round(v * 100) / 100;
const etDay = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ms));
const etStamp = (ms: number | null) => (ms == null ? null : new Date(ms).toLocaleString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }));
function parseExit(s: string | null | undefined): number | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Date.parse(`${s}T16:00:00-04:00`);
  const t = Date.parse(s); return Number.isFinite(t) ? t : null;
}
/** Expiry close in ms (16:00 ET on the expiry date). */
const expiryClose = (e: string | null) => (e ? Date.parse(`${e.slice(0, 10)}T16:00:00-04:00`) : null);

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

// ─── Bars ────────────────────────────────────────────────────
type Bar = { t: number; o: number; h: number; l: number; c: number }; // t = start, ms
const YAHOO: Record<string, string> = { SPX: '^GSPC', SPXW: '^GSPC', NDX: '^NDX', RUT: '^RUT', VIX: '^VIX', XSP: '^XSP', DJX: '^DJI' };
function yahooSym(sym: string, asset: string) {
  const s = sym.toUpperCase();
  if (asset === 'crypto') return `${s.replace(/[-/]?USDT?$/, '')}-USD`;
  return YAHOO[s] ?? s;
}
async function yahoo(sym: string, interval: '5m' | '1d', fromMs: number): Promise<Bar[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=${Math.floor(fromMs / 1000)}&period2=${Math.floor(NOW / 1000)}&interval=${interval}&includePrePost=false`;
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (r.status === 429) { await new Promise((s) => setTimeout(s, 1500 * (a + 1))); continue; }
      const j: any = await r.json();
      const res = j?.chart?.result?.[0]; if (!res?.timestamp) return [];
      const q = res.indicators.quote[0];
      return res.timestamp.map((t: number, i: number) => ({ t: t * 1000, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i] }))
        .filter((b: Bar) => [b.o, b.h, b.l, b.c].every((x) => typeof x === 'number' && Number.isFinite(x) && x > 0));
    } catch { await new Promise((s) => setTimeout(s, 800)); }
  }
  return [];
}
const etMin = (ms: number) => { const [h, m] = new Date(ms).toLocaleTimeString('en-US', { timeZone: TZ, hour12: false, hour: '2-digit', minute: '2-digit' }).split(':').map(Number); return (h % 24) * 60 + m; };
const barCache = new Map<string, Promise<{ m5: Bar[]; d1: Bar[] }>>();
function underlyingBars(sym: string, asset: string) {
  const ys = yahooSym(sym, asset);
  if (!barCache.has(ys)) barCache.set(ys, (async () => {
    const m5raw = await yahoo(ys, '5m', Date.parse('2026-08-19T00:00:00Z'));
    const m5 = asset === 'crypto' ? m5raw : m5raw.filter((b) => { const m = etMin(b.t); return m >= 570 && m < 960; });
    const d1 = await yahoo(ys, '1d', Date.parse('2026-06-01T00:00:00Z'));
    return { m5, d1 };
  })());
  return barCache.get(ys)!;
}
function atrAt(d1: Bar[], entryMs: number): number | null {
  const day = etDay(entryMs);
  const prior = d1.filter((b) => etDay(b.t) < day).slice(-16);
  if (prior.length < 15) return null;
  const tr = prior.slice(1).map((b, i) => Math.max(b.h - b.l, Math.abs(b.h - prior[i].c), Math.abs(b.l - prior[i].c)));
  return tr.reduce((a, b) => a + b, 0) / tr.length;
}

const ALPACA_KEY = process.env.ALPACA_API_KEY, ALPACA_SECRET = process.env.ALPACA_SECRET_KEY;
function occ(root: string, expiry: string, type: string, strike: number) {
  const [y, m, d] = expiry.slice(0, 10).split('-');
  return `${root}${y.slice(2)}${m}${d}${type.toLowerCase().startsWith('p') ? 'P' : 'C'}${String(Math.round(strike * 1000)).padStart(8, '0')}`;
}
/** Alpaca allows ~200 data requests/min on this plan: space calls ≥400 ms apart, retry 429s with backoff. */
let lastAlpaca = 0; const alpacaStats = { calls: 0, rateLimited: 0, failed: 0, samples: [] as string[] };
async function alpacaGate() { const wait = lastAlpaca + 400 - Date.now(); lastAlpaca = Math.max(Date.now(), lastAlpaca + 400); if (wait > 0) await new Promise((s) => setTimeout(s, wait)); }
async function alpacaOptionBars(symbol: string, fromMs: number, toMs: number): Promise<Bar[]> {
  if (!ALPACA_KEY || !ALPACA_SECRET) return [];
  const out: Bar[] = []; let token: string | null = null;
  for (let page = 0, tries = 0; page < 5 && tries < 8; tries++) {
    const qs = new URLSearchParams({ symbols: symbol, timeframe: '1Hour', start: new Date(fromMs).toISOString(), end: new Date(Math.min(toMs, NOW - 20 * 60_000)).toISOString() /* the data plan rejects the most recent 15 min */, limit: '10000' });
    if (token) qs.set('page_token', token);
    try {
      await alpacaGate(); alpacaStats.calls++;
      const r = await fetch(`https://data.alpaca.markets/v1beta1/options/bars?${qs}`, { headers: { 'APCA-API-KEY-ID': ALPACA_KEY, 'APCA-API-SECRET-KEY': ALPACA_SECRET } });
      if (r.status === 429) { alpacaStats.rateLimited++; await new Promise((s) => setTimeout(s, 3000 * (tries + 1))); continue; }
      if (!r.ok) { alpacaStats.failed++; if (alpacaStats.samples.length < 5) alpacaStats.samples.push(`${r.status} ${symbol} ${qs.get('start')}→${qs.get('end')} ${(await r.text()).slice(0, 120)}`); return out; }
      const j: any = await r.json();
      for (const b of j?.bars?.[symbol] ?? []) out.push({ t: Date.parse(b.t), o: b.o, h: b.h, l: b.l, c: b.c });
      token = j?.next_page_token ?? null; page++; if (!token) break;
    } catch { alpacaStats.failed++; await new Promise((s) => setTimeout(s, 1000)); }
  }
  return out.sort((a, b) => a.t - b.t);
}
async function optionBars(sym: string, expiry: string, type: string, strike: number, fromMs: number, toMs: number) {
  const roots = sym.toUpperCase() === 'SPX' ? ['SPXW', 'SPX'] : sym.toUpperCase() === 'NDX' ? ['NDXP', 'NDX'] : [sym.toUpperCase()];
  for (const root of roots) {
    const s = occ(root, expiry, type, strike);
    const b = await alpacaOptionBars(s, fromMs - DAY, toMs + 2 * H);
    if (b.length) return { occ: s, bars: b };
  }
  return { occ: occ(roots[0], expiry, type, strike), bars: [] as Bar[] };
}

// ─── Path helpers ────────────────────────────────────────────
type Dir = 'long' | 'short';
const through = (d: Dir, b: Bar, level: number, kind: 'stop' | 'target') =>
  kind === 'stop' ? (d === 'long' ? b.l <= level : b.h >= level) : (d === 'long' ? b.h >= level : b.l <= level);
function firstTouch(bars: Bar[], fromMs: number, toMs: number, d: Dir, level: number, kind: 'stop' | 'target'): Bar | null {
  // bars are stamped at start; a bar that started before fromMs can still contain it — include the bar containing fromMs
  for (const b of bars) { if (b.t + 5 * 60_000 <= fromMs) continue; if (b.t > toMs) break; if (through(d, b, level, kind)) return b; }
  return null;
}
/** Contract value at time t: close of the last option bar starting at/before t (within 2 trading days). */
function optAt(bars: Bar[], t: number): number | null {
  let v: Bar | null = null;
  for (const b of bars) { if (b.t <= t) v = b; else break; }
  return v && t - v.t < 3 * DAY ? v.c : null;
}
function intrinsic(type: string, strike: number, u: number) { return type.startsWith('p') ? Math.max(0, strike - u) : Math.max(0, u - strike); }
function lastClose(bars: Bar[], t: number): number | null { let v: number | null = null; for (const b of bars) { if (b.t <= t) v = b.c; else break; } return v; }

function stopBucket(p: number | null) {
  if (p == null || !Number.isFinite(p)) return 'n/a';
  if (p < 0.5) return '<0.5%'; if (p < 1) return '0.5-1%'; if (p < 2) return '1-2%'; if (p < 4) return '2-4%'; return '4%+';
}
function atrBucket(x: number | null) {
  if (x == null || !Number.isFinite(x)) return 'n/a';
  if (x < 0.5) return '<0.5 ATR'; if (x < 1) return '0.5-1 ATR'; if (x < 1.25) return '1-1.25 ATR'; if (x < 2) return '1.25-2 ATR'; return '2+ ATR';
}
function optStopBucket(p: number | null) {
  if (p == null || !Number.isFinite(p)) return 'n/a';
  if (p > -10) return '>-10%'; if (p > -25) return '-10…-25%'; if (p > -35) return '-25…-35%'; if (p > -50) return '-35…-50%'; return '≤-50%';
}

/**
 * The desk book, loaded the way server/journal-sources.ts loadDesk does (same
 * filters, same pure mapper) but without the notes-regex column: the prod build
 * of 2026-09-30 17:10 CT (c1980ccb) ships `'\[exit-time…'` inside a `sql` template,
 * whose cooked string drops the backslashes, so Postgres rejects the regex and
 * loadDesk throws. Reading the rows directly keeps this review independent of that.
 */
async function loadDeskRows(): Promise<{ rows: any[]; excluded: { reason: string; count: number }[] }> {
  const { and, gte, ne, or, eq, isNull } = await import('drizzle-orm');
  const { OUTCOME_BASELINE_DATE } = await import('@shared/constants');
  const { mapDeskIdea } = await import('../server/journal-row-maps');
  const ideas = await db.select({
    id: tradeIdeas.id, symbol: tradeIdeas.symbol, assetType: tradeIdeas.assetType, direction: tradeIdeas.direction,
    entryPrice: tradeIdeas.entryPrice, targetPrice: tradeIdeas.targetPrice, stopLoss: tradeIdeas.stopLoss,
    riskRewardRatio: tradeIdeas.riskRewardRatio, optionType: tradeIdeas.optionType, strikePrice: tradeIdeas.strikePrice,
    expiryDate: tradeIdeas.expiryDate, entryPremium: tradeIdeas.entryPremium, exitPremium: tradeIdeas.exitPremium,
    optionPercentGain: tradeIdeas.optionPercentGain, exitPrice: tradeIdeas.exitPrice, percentGain: tradeIdeas.percentGain,
    outcomeStatus: tradeIdeas.outcomeStatus, resolutionReason: tradeIdeas.resolutionReason, exitDate: tradeIdeas.exitDate,
    timestamp: tradeIdeas.timestamp, source: tradeIdeas.source, catalyst: tradeIdeas.catalyst, genConvictionBand: tradeIdeas.genConvictionBand,
  }).from(tradeIdeas).where(and(
    gte(tradeIdeas.timestamp, OUTCOME_BASELINE_DATE), ne(tradeIdeas.status, 'draft'),
    or(eq(tradeIdeas.excludeFromTraining, false), isNull(tradeIdeas.excludeFromTraining)),
  ));
  const rows: any[] = []; const ex = new Map<string, number>();
  for (const i of ideas) { const r = mapDeskIdea(i as any); if ('row' in r) rows.push(r.row); else ex.set(r.excluded, (ex.get(r.excluded) ?? 0) + 1); }
  return { rows, excluded: [...ex].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count) };
}

async function main() {
  // ─── DESK rows (same loader as the journal) + plan fields ─
  const desk = await loadDeskRows();
  const closed = desk.rows.filter((r) => r.status === 'closed' && r.realizedPnL != null);
  const ids = closed.map((r) => r.id.replace(/^desk:/, ''));
  const plan = new Map<string, any>();
  for (let i = 0; i < ids.length; i += 300) {
    for (const p of await db.select({
      id: tradeIdeas.id, direction: tradeIdeas.direction, holdingPeriod: tradeIdeas.holdingPeriod, entryPrice: tradeIdeas.entryPrice,
      stopLoss: tradeIdeas.stopLoss, targetPrice: tradeIdeas.targetPrice, exitBy: tradeIdeas.exitBy, exitDate: tradeIdeas.exitDate,
      outcomeStatus: tradeIdeas.outcomeStatus, outcomeNotes: tradeIdeas.outcomeNotes, exitPremium: tradeIdeas.exitPremium, entryPremium: tradeIdeas.entryPremium,
    }).from(tradeIdeas).where(inArray(tradeIdeas.id, ids.slice(i, i + 300)))) plan.set(p.id, p);
  }

  const evalDesk = async (r: any) => {
    const p = plan.get(r.id.replace(/^desk:/, ''));
    const option = r.assetType === 'option';
    const d: Dir = p.direction === 'short' ? 'short' : 'long';
    const entryMs = Date.parse(r.entryTime);
    const exitMs = parseExit(p.exitDate) ?? entryMs;
    const expClose = option ? expiryClose(r.expiryDate) : null;
    const exitBy = p.exitBy ? Date.parse(p.exitBy) : NaN;
    let horizon = Number.isFinite(exitBy) ? exitBy : entryMs + 7 * DAY;
    if (expClose != null) horizon = Math.min(horizon, expClose);
    horizon = Math.min(horizon, NOW);
    const out: any = {
      id: r.id, symbol: r.symbol, asset: r.assetType, engine: r.setupType ?? 'unknown', thesis: d, holding: p.holdingPeriod,
      k: option ? `${r.strikePrice}${String(r.optionType ?? '').charAt(0).toUpperCase()} ${String(r.expiryDate).slice(0, 10)}` : '',
      half: entryMs < MID ? 'H1' : 'H2', outcome: p.outcomeStatus, entry: new Date(entryMs).toISOString(), entryET: etStamp(entryMs),
      recordedExitET: etStamp(exitMs), exitTag: String(p.outcomeNotes ?? '').match(/\[exit-time:(bar_hit|deadline|live)\]/)?.[1] ?? 'untagged',
      horizonET: etStamp(horizon), entryU: p.entryPrice, stop: p.stopLoss, target: p.targetPrice,
      stopPct: p.entryPrice > 0 ? r2((Math.abs(p.entryPrice - p.stopLoss) / p.entryPrice) * 100) : null,
      entryPremium: option ? r.entryPrice : null, recordedExitPremium: option ? r.exitPrice : null,
      pnl: r.realizedPnL, pct: r.realizedPnLPercent,
    };
    const { m5, d1 } = await underlyingBars(r.symbol, r.assetType);
    const atr = atrAt(d1, entryMs);
    out.atr = atr == null ? null : r2(atr);
    out.stopATR = atr ? r2(Math.abs(p.entryPrice - p.stopLoss) / atr) : null;
    out.bars5m = m5.length;
    const optType = String(r.optionType ?? '').toLowerCase();
    const ob = option && r.expiryDate && r.strikePrice ? await optionBars(r.symbol, String(r.expiryDate), optType, Number(r.strikePrice), entryMs, Math.max(horizon, expClose ?? 0)) : null;
    out.optBars = ob?.bars.length ?? null; out.occ = ob?.occ ?? null;
    const oBars = ob?.bars ?? [];
    const unitPnl = (exitPx: number) => option ? r2((exitPx - r.entryPrice) * 100) : r2(((d === 'long' ? exitPx - p.entryPrice : p.entryPrice - exitPx) / p.entryPrice) * 1000);
    /** Contract (or stock) exit value at time t, with the underlying at uPx. */
    const valueAt = (t: number, uPx: number): { px: number; basis: string } | null => {
      if (!option) return { px: uPx, basis: 'underlying' };
      if (expClose != null && t >= expClose - 30 * 60_000) return { px: intrinsic(optType, Number(r.strikePrice), uPx), basis: 'intrinsic at expiry' };
      const v = optAt(oBars, t); return v == null ? null : { px: v, basis: 'option 1h close' };
    };

    // Where did the underlying first cross the stop / target after entry (bars)?
    const covered = m5.length > 0 && m5[0].t <= entryMs + 10 * 60_000;
    const stopBar = covered ? firstTouch(m5, entryMs, horizon, d, p.stopLoss, 'stop') : null;
    const tgtBar = covered ? firstTouch(m5, entryMs, horizon, d, p.targetPrice, 'target') : null;
    out.barsCoverEntry = covered;
    out.stopHitET = stopBar ? etStamp(stopBar.t) : null;
    out.stopHitMs = stopBar?.t ?? null;
    out.targetBeforeStop = !!(tgtBar && stopBar && tgtBar.t < stopBar.t);
    out.stopDelayMin = stopBar && p.outcomeStatus === 'hit_stop' ? Math.round((exitMs - stopBar.t) / 60_000) : null;

    const isLoss = Number(r.realizedPnL) < 0;
    // ── SHAKEOUT (losses) ──
    if (isLoss) {
      const from = p.outcomeStatus === 'hit_stop' ? (stopBar?.t ?? exitMs) : exitMs;
      const after = m5.filter((b) => b.t > from && b.t <= horizon);
      const tgtAfter = after.find((b) => through(d, b, p.targetPrice, 'target')) ?? null;
      const mfe = after.length ? (d === 'long' ? Math.max(...after.map((b) => b.h)) : Math.min(...after.map((b) => b.l))) : null;
      const uGreen = after.some((b) => (d === 'long' ? b.c > p.entryPrice : b.c < p.entryPrice));
      const uHorizon = lastClose(m5, horizon);
      out.post = {
        fromET: etStamp(from), bars: after.length,
        mfeU: mfe, mfeUPct: mfe != null ? r2(((d === 'long' ? mfe - p.entryPrice : p.entryPrice - mfe) / p.entryPrice) * 100) : null,
        targetAfterET: tgtAfter ? etStamp(tgtAfter.t) : null, underlyingGreen: uGreen, horizonU: uHorizon,
      };
      let optGreen: boolean | null = null, optMax: number | null = null, optHorizon: number | null = null, optAtStop: number | null = null;
      if (option) {
        const oAfter = oBars.filter((b) => b.t >= from - H && b.t <= horizon);
        if (oAfter.length) { optMax = Math.max(...oAfter.map((b) => b.c)); optGreen = optMax > r.entryPrice; }
        const hv = uHorizon != null ? valueAt(horizon, uHorizon) : null; optHorizon = hv?.px ?? null;
        if (optHorizon != null && optHorizon > r.entryPrice) optGreen = true;
        optAtStop = stopBar ? valueAt(stopBar.t + 5 * 60_000, stopBar.c)?.px ?? null : null;
        out.post.optMaxClose = optMax; out.post.optHorizon = optHorizon; out.post.optAtStop = optAtStop;
        out.post.optPctAtStop = optAtStop != null ? r2(((optAtStop - r.entryPrice) / r.entryPrice) * 100) : null;
        // Beyond the plan: would the contract have been green before its own expiry?
        const toExp = oBars.filter((b) => b.t > from && b.t <= Math.min(NOW, expClose ?? NOW));
        out.post.greenByContractExpiry = toExp.length ? Math.max(...toExp.map((b) => b.c)) > r.entryPrice : null;
      }
      const green = option ? (optGreen ?? uGreen) : uGreen;
      out.shakeout = tgtAfter ? 'shakeout → target' : green ? 'shakeout → green' : 'real loss';
      out.shakeoutBasis = option ? (optGreen == null ? 'underlying only (no option prints)' : 'option prints') : 'underlying';
      out.holdToHorizonPnl = option ? (optHorizon != null ? unitPnl(optHorizon) : null) : (uHorizon != null ? unitPnl(uHorizon) : null);
    }

    // ── STOP-RULE WHAT-IFS (hit_stop rows) ──
    if (p.outcomeStatus === 'hit_stop') {
      const w: any = { recorded: Number(r.realizedPnL) };
      const stopT = stopBar?.t ?? null;
      // A: current rule, priced at the stop bar
      if (stopT != null) {
        const v = valueAt(stopT + 5 * 60_000, option ? stopBar!.c : p.stopLoss);
        w.A = v ? unitPnl(v.px) : null; w.A_basis = v?.basis ?? 'no price';
      } else { w.A = null; w.A_basis = 'stop not found in bars'; }
      // B / C: conditional option stop
      for (const [key, th] of [['B', 0.25], ['C', 0.35]] as const) {
        if (!option) { w[key] = w.A; continue; }
        if (stopT == null || !oBars.length) { w[key] = null; continue; }
        const floor = r.entryPrice * (1 - th);
        let res: number | null = null;
        for (let t = Math.floor(stopT / H) * H; t <= horizon; t += H) {
          const ob1 = oBars.find((b) => b.t === t);
          const uIn = m5.filter((b) => b.t >= t && b.t < t + H);
          const uThrough = uIn.some((b) => through(d, b, p.stopLoss, 'stop'));
          const uTarget = uIn.find((b) => through(d, b, p.targetPrice, 'target'));
          if (uThrough && ob1 && ob1.l <= floor) { res = unitPnl(Math.min(floor, ob1.c)); break; } // conservative: the worse of the floor and that hour's close
          if (uTarget) { const v = valueAt(t + H, uTarget.c); if (v) { res = unitPnl(v.px); break; } }
        }
        if (res == null) { const u = lastClose(m5, horizon); const v = u != null ? valueAt(horizon, u) : null; res = v ? unitPnl(v.px) : null; }
        w[key] = res;
      }
      // D: 1.25×ATR floor (swing/position only)
      if (p.holdingPeriod === 'day' || r.assetType === 'crypto' || !atr) { w.D = w.A; w.D_changed = false; }
      else {
        const floorDist = 1.25 * atr, dist = Math.abs(p.entryPrice - p.stopLoss);
        if (dist >= floorDist) { w.D = w.A; w.D_changed = false; }
        else {
          const ns = d === 'long' ? p.entryPrice - floorDist : p.entryPrice + floorDist;
          const sb = covered ? firstTouch(m5, entryMs, horizon, d, ns, 'stop') : null;
          const tb = covered ? firstTouch(m5, entryMs, horizon, d, p.targetPrice, 'target') : null;
          let v: { px: number } | null = null;
          if (tb && (!sb || tb.t < sb.t)) v = valueAt(tb.t + 5 * 60_000, option ? tb.c : p.targetPrice);
          else if (sb) v = valueAt(sb.t + 5 * 60_000, option ? sb.c : ns);
          else { const u = lastClose(m5, horizon); v = u != null ? valueAt(horizon, u) : null; }
          w.D = v ? unitPnl(v.px) : null; w.D_changed = true; w.D_newStop = r2(ns);
          w.D_exit = tb && (!sb || tb.t < sb.t) ? 'target' : sb ? 'wider stop' : 'horizon';
        }
      }
      out.whatIf = w;
    }
    return out;
  };

  const results = await pool(closed, 4, async (r) => { try { return await evalDesk(r); } catch (e: any) { return { id: r.id, symbol: r.symbol, error: String(e?.message ?? e) }; } });

  // ─── Aggregates ───────────────────────────────────────────
  const losses = results.filter((x: any) => x.shakeout);
  const tally = (rows: any[], key: (x: any) => string) => {
    const m = new Map<string, any>();
    for (const x of rows) {
      const k = key(x); const a = m.get(k) ?? { key: k, n: 0, real: 0, toTarget: 0, toGreen: 0, lost: 0, holdPnl: 0, holdN: 0 };
      a.n++; a.lost += x.pnl;
      if (x.shakeout === 'real loss') a.real++; else if (x.shakeout === 'shakeout → target') a.toTarget++; else a.toGreen++;
      if (x.holdToHorizonPnl != null) { a.holdPnl += x.holdToHorizonPnl; a.holdN++; }
      m.set(k, a);
    }
    return [...m.values()].map((a) => ({ ...a, lost: r2(a.lost), holdPnl: r2(a.holdPnl), shakeoutRate: r2(((a.toTarget + a.toGreen) / a.n) * 100) })).sort((a, b) => a.lost - b.lost);
  };
  const stopLosses = losses.filter((x: any) => x.outcome === 'hit_stop');
  const whatIfRows = results.filter((x: any) => x.whatIf);
  const recordedAll = results.reduce((s: number, x: any) => s + (Number(x.pnl) || 0), 0);
  const rule = (k: string, rows: any[]) => {
    let net = 0, wins = 0, n = 0, fallback = 0;
    const byId = new Set(rows.map((x) => x.id));
    for (const x of results as any[]) {
      if (!byId.has(x.id)) continue;
      let v = x.pnl;
      if (x.whatIf) { const w = x.whatIf[k]; if (w == null) fallback++; else v = w; }
      n++; net += v; if (v > 0) wins++;
    }
    return { n, net: r2(net), perTrade: n ? r2(net / n) : null, winRate: n ? r2((wins / n) * 100) : null, fellBackToRecorded: fallback };
  };
  const scopes: Record<string, any[]> = {
    all: results as any[], H1: (results as any[]).filter((x) => x.half === 'H1'), H2: (results as any[]).filter((x) => x.half === 'H2'),
    options: (results as any[]).filter((x) => x.asset === 'option'),
  };
  const whatIfs: any = {};
  for (const [s, rows] of Object.entries(scopes)) {
    whatIfs[s] = { recorded: rule('recorded', rows), A_current_bars: rule('A', rows), B_opt25: rule('B', rows), C_opt35: rule('C', rows), D_atr125: rule('D', rows) };
  }
  // Same-basis comparison: only hit_stop rows where A, B, C, D are all priced from bars
  const priced = whatIfRows.filter((x: any) => ['A', 'B', 'C', 'D'].every((k) => x.whatIf[k] != null));
  const sameBasis: any = {};
  for (const [s, f] of Object.entries({ all: () => true, H1: (x: any) => x.half === 'H1', H2: (x: any) => x.half === 'H2' })) {
    const rows = priced.filter(f as any);
    sameBasis[s] = { n: rows.length };
    for (const k of ['recorded', 'A', 'B', 'C', 'D']) {
      const vals = rows.map((x: any) => x.whatIf[k]);
      sameBasis[s][k] = { net: r2(vals.reduce((a: number, b: number) => a + b, 0)), wins: vals.filter((v: number) => v > 0).length };
    }
  }

  // ─── ATR floor coverage on every swing/position idea published since 2026-09-24 ─
  const recent = desk.rows.filter((r) => Date.parse(r.entryTime as any) >= Date.parse('2026-09-24T05:00:00Z') && r.assetType !== 'crypto');
  const rIds = recent.map((r) => r.id.replace(/^desk:/, ''));
  const rPlan = rIds.length ? await db.select({ id: tradeIdeas.id, holdingPeriod: tradeIdeas.holdingPeriod, entryPrice: tradeIdeas.entryPrice, stopLoss: tradeIdeas.stopLoss, source: tradeIdeas.source, timestamp: tradeIdeas.timestamp }).from(tradeIdeas).where(inArray(tradeIdeas.id, rIds)) : [];
  const swingRecent = rPlan.filter((p) => p.holdingPeriod !== 'day');
  const atrCov = await pool(swingRecent, 4, async (p) => {
    const { d1 } = await underlyingBars((recent.find((r) => r.id === `desk:${p.id}`) as any).symbol, 'stock');
    const atr = atrAt(d1, Date.parse(p.timestamp));
    return { source: p.source, mult: atr ? Math.abs(p.entryPrice - p.stopLoss) / atr : null };
  });
  const atrFloor: any = {};
  for (const x of atrCov) {
    const a = atrFloor[x.source] ?? (atrFloor[x.source] = { n: 0, below125: 0, unknown: 0 });
    a.n++; if (x.mult == null) a.unknown++; else if (x.mult < 1.2) a.below125++;
  }

  // ─── BOT losses: after the bot's exit, would the contract have gone green? ─
  const bot = await loadJournal(await resolveJournal({ userId: null, isAdmin: true }, 'bot' as any));
  const bl = bot.rows.filter((r) => r.status === 'closed' && Number(r.realizedPnL) < 0 && r.assetType === 'option');
  const pos = bl.length ? await db.select().from(paperPositions).where(inArray(paperPositions.id, bl.map((r) => r.id.replace(/^bot:/, '')))) : [];
  const posOf = new Map(pos.map((p) => [p.id, p]));
  const botRes = await pool(bl, 4, async (r) => {
    const p: any = posOf.get(r.id.replace(/^bot:/, ''));
    const exitMs = Date.parse(String(r.exitTime)); const entryMs = Date.parse(String(r.entryTime));
    const expClose = expiryClose(r.expiryDate as any);
    const horizon = Math.min(NOW, expClose ?? NOW, entryMs + 7 * DAY);
    const optType = String(r.optionType ?? '').toLowerCase();
    const ob = await optionBars(r.symbol, String(r.expiryDate), optType, Number(r.strikePrice), entryMs, Math.max(horizon, expClose ?? 0));
    const after = ob.bars.filter((b) => b.t > exitMs && b.t <= horizon);
    const afterToExpiry = ob.bars.filter((b) => b.t > exitMs && b.t <= Math.min(NOW, expClose ?? NOW));
    const maxC = after.length ? Math.max(...after.map((b) => b.c)) : null;
    const maxToExp = afterToExpiry.length ? Math.max(...afterToExpiry.map((b) => b.c)) : null;
    const { m5 } = await underlyingBars(r.symbol, 'stock');
    const uH = lastClose(m5, horizon);
    const hv = horizon >= (expClose ?? Infinity) - 30 * 60_000 && uH != null ? intrinsic(optType, Number(r.strikePrice), uH) : optAt(ob.bars, horizon);
    const qty = Number(r.quantity);
    return {
      symbol: r.symbol, k: `${r.strikePrice}${optType.charAt(0).toUpperCase()} ${String(r.expiryDate).slice(0, 10)}`, engine: r.setupType ?? 'unlinked',
      entryET: etStamp(entryMs), exitET: etStamp(exitMs), exitReason: p?.exitReason ?? null, entry: r.entryPrice, exit: r.exitPrice, qty,
      pnl: r.realizedPnL, pct: r.realizedPnLPercent, optBars: ob.bars.length, maxCloseAfter7d: maxC, maxCloseToExpiry: maxToExp,
      class: maxC == null ? 'no prints' : maxC > r.entryPrice ? 'shakeout → green' : 'real loss',
      greenByExpiry: maxToExp != null ? maxToExp > r.entryPrice : null,
      holdToHorizonPnl: hv != null ? r2((hv - r.entryPrice) * 100 * qty) : null,
    };
  });

  const out = {
    generatedAt: new Date().toISOString(),
    alpacaStats,
    method: 'see header of research/shakeout-review.ts',
    desk: {
      closed: results.length, losses: losses.length, stopLosses: stopLosses.length, errors: results.filter((x: any) => x.error).length,
      recordedNet: r2(recordedAll),
      shakeout: {
        allLosses: tally(losses, () => 'all'),
        stopLossesOnly: tally(stopLosses, () => 'hit_stop'),
        expiredLossesOnly: tally(losses.filter((x: any) => x.outcome !== 'hit_stop'), () => 'expired/other'),
        byEngine: tally(stopLosses, (x) => x.engine),
        byAsset: tally(stopLosses, (x) => x.asset),
        byStopPct: tally(stopLosses, (x) => stopBucket(x.stopPct)),
        byStopATR: tally(stopLosses, (x) => atrBucket(x.stopATR)),
        byOptionPctAtStop: tally(stopLosses.filter((x: any) => x.asset === 'option'), (x) => optStopBucket(x.post?.optPctAtStop ?? null)),
        byHalf: tally(stopLosses, (x) => x.half),
        byHolding: tally(stopLosses, (x) => x.holding),
      },
      stopTiming: {
        hitStopRows: whatIfRows.length,
        stopFoundInBars: whatIfRows.filter((x: any) => x.stopHitMs != null).length,
        targetTouchedBeforeStop: whatIfRows.filter((x: any) => x.targetBeforeStop).length,
        recordedExitLagMinutesMedian: (() => { const v = whatIfRows.map((x: any) => x.stopDelayMin).filter((x: any) => x != null).sort((a: number, b: number) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; })(),
        recordedExitOver1DayLate: whatIfRows.filter((x: any) => (x.stopDelayMin ?? 0) > 1440).length,
      },
      whatIfs, whatIfsSameBasis: sameBasis,
      atrFloorSince0924: atrFloor,
      trades: results,
    },
    bot: {
      optionLosses: botRes.length,
      shakeoutGreenWithin7d: botRes.filter((x) => x.class === 'shakeout → green').length,
      realLoss: botRes.filter((x) => x.class === 'real loss').length,
      noPrints: botRes.filter((x) => x.class === 'no prints').length,
      greenByExpiry: botRes.filter((x) => x.greenByExpiry).length,
      lost: r2(botRes.reduce((s, x) => s + Number(x.pnl), 0)),
      holdToHorizon: r2(botRes.reduce((s, x) => s + (x.holdToHorizonPnl ?? Number(x.pnl)), 0)),
      trades: botRes,
    },
  };
  process.stdout.write('@@JSON@@\n' + JSON.stringify(out) + '\n', () => process.exit(0));
}
main().catch((e) => { console.error(e); process.exit(1); });
