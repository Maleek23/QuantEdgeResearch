/**
 * MONTHLY SWINGS & LEAPS — loaders, nightly run, cache and routes.
 * Research screen — not financial advice. Scoring and contract picks are pure
 * (shared/swings-screener.ts); this file only gathers inputs.
 *
 * UNIVERSE  scanner universe (watchlists + approved tickers + NEXUS tracked,
 *           server/scanner-universe.ts) ∪ the curated sector universe
 *           (server/ticker-universe.ts getFullUniverse), deduped; ETFs, indices
 *           and crypto dropped (Yahoo instrumentType must be EQUITY).
 * PASS 1    monthly chart (one Yahoo call per name) → ATH + last close → keep
 *           drawdown 35–90% (cushion; the exact 40–85% band is applied on daily).
 * PASS 2    daily 3y bars, fundamentals (Yahoo fundamentalsTimeSeries, then
 *           quoteSummary financialData), earnings date, sector rotation
 *           (sector-ignition weekly), flow (options_flow_history 10d), GEX
 *           (gex_snapshots ≤ 5d), news (Yahoo search), option chains (Alpaca
 *           indicative; the budget-contract-attach loader pattern) → screen.
 * CACHE     .cache/shared/swings-screener.json (server/lib/shared-state.ts) —
 *           the worker writes it nightly, the web reads it; an admin refresh
 *           recomputes in the requesting process.
 * FLAG      SWINGS_SCREENER (default on; off|0|false disables the nightly job).
 */
import type { Express, NextFunction, Request, Response } from 'express';
import { logger } from './logger';
import { readShared, writeShared } from './lib/shared-state';
import {
  DRAWDOWN_MAX, DRAWDOWN_MIN, LEAPS_DTE, SWINGS_CAVEAT, SWINGS_DISCLAIMER, SWINGS_SHARED, SWINGS_VERSION, SWING_DTE,
  filterRows, pickLeapsContract, pickSwingContract, rankRows, screenSymbol, swingsScreenerEnabled,
  type Bar, type ContractSlot, type FlowInput, type FundamentalsInput, type GexInput, type RotationInput, type ScreenInput, type ScreenRow,
} from '@shared/swings-screener';
import type { BudgetChainRow } from '@shared/budget-contract';

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;

export interface SwingsSnapshot {
  v: typeof SWINGS_VERSION;
  asOf: string;
  disclaimer: string;
  caveat: string;
  universe: { total: number; equities: number; pass1: number; screened: number; sources: string[] };
  rows: ScreenRow[];
  notes: string[];
  ms: number;
  trigger: string;
}

// ─── loaders (injectable for tests / offline samples) ──────────────────────

export interface MonthlyRead { athHigh: number; athAtMs: number; lastClose: number; instrumentType: string | null; name: string | null }
export interface SwingsDeps {
  universe: () => Promise<{ symbols: string[]; sources: string[] }>;
  monthly: (sym: string) => Promise<MonthlyRead | null>;
  daily: (sym: string, days: number) => Promise<Bar[]>;
  fundamentals: (sym: string) => Promise<(FundamentalsInput & { sector?: string | null; name?: string | null }) | null>;
  earnings: (sym: string) => Promise<{ date: string; source: string } | null>;
  rotation: (sym: string) => Promise<RotationInput | null>;
  flow: (sym: string) => Promise<FlowInput | null>;
  gex: (sym: string) => Promise<GexInput | null>;
  news: (sym: string) => Promise<{ items: ScreenRow['news']; asOf: string | null }>;
  chain: (sym: string, minDays: number, maxDays: number, band: number, nowMs: number) => Promise<{ rows: BudgetChainRow[]; source: string; asOf: string } | null>;
  nowMs: () => number;
}

const NON_EQUITY = new Set(['SPY', 'QQQ', 'IWM', 'DIA', 'XSP', 'SPX', 'VIX', 'BTC', 'ETH', 'SOL', 'DOGE']);
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : x != null && x !== '' && Number.isFinite(Number(x)) ? Number(x) : null);

async function yf(): Promise<any> { return (await import('./yahoo-finance-service')).getYahooFinance(); }

export const liveDeps: SwingsDeps = {
  async universe() {
    const sources: string[] = [];
    const set = new Set<string>();
    try {
      const { getScannerUniverse } = await import('./scanner-universe');
      const u = await getScannerUniverse();
      u.symbols.forEach((s) => set.add(s.toUpperCase()));
      sources.push(`scanner-universe ${u.symbols.length}`);
    } catch (e: any) { logger.debug(`[SWINGS] scanner universe failed: ${e?.message}`); }
    try {
      const { getFullUniverse, MAJOR_ETFS, LEVERAGED_ETFS } = await import('./ticker-universe');
      const full = getFullUniverse();
      full.forEach((s) => set.add(s.toUpperCase()));
      sources.push(`ticker-universe ${full.length}`);
      [...MAJOR_ETFS, ...LEVERAGED_ETFS].forEach((s) => set.delete(s));
    } catch (e: any) { logger.debug(`[SWINGS] ticker universe failed: ${e?.message}`); }
    try {
      const { PEER_GROUPS } = await import('@shared/sector-peers');
      PEER_GROUPS.forEach((g) => { if (g.etf) set.delete(g.etf); });
    } catch { /* optional */ }
    const symbols = [...set].filter((s) => /^[A-Z][A-Z.]{0,5}$/.test(s) && !NON_EQUITY.has(s) && !s.includes('-'));
    return { symbols, sources };
  },
  async monthly(sym) {
    const y = await yf();
    const r = await y.chart(sym, { period1: '1980-01-01', interval: '1mo' }, { validateResult: false });
    const qs = (r?.quotes ?? []).filter((q: any) => num(q?.high) != null && num(q?.close) != null);
    if (!qs.length) return null;
    let best = qs[0];
    for (const q of qs) if (q.high > best.high) best = q;
    return {
      athHigh: best.high, athAtMs: new Date(best.date).getTime(), lastClose: qs[qs.length - 1].close,
      instrumentType: r?.meta?.instrumentType ?? null, name: r?.meta?.longName ?? r?.meta?.shortName ?? null,
    };
  },
  async daily(sym, days) {
    const y = await yf();
    const r = await y.chart(sym, { period1: new Date(Date.now() - days * 86_400_000), interval: '1d' }, { validateResult: false });
    return (r?.quotes ?? [])
      .filter((q: any) => num(q?.close) != null && num(q?.high) != null && num(q?.low) != null)
      .map((q: any) => ({ t: new Date(q.date).getTime(), o: q.open ?? q.close, h: q.high, l: q.low, c: q.close, v: q.volume ?? 0 }));
  },
  async fundamentals(sym) {
    const y = await yf();
    let quarters: FundamentalsInput['quarters'] = [];
    let cash: number | null = null; let debt: number | null = null; let asOf: string | null = null;
    const sources: string[] = [];
    try {
      const ts: any[] = await y.fundamentalsTimeSeries(sym, { period1: new Date(Date.now() - 3 * 365 * 86_400_000), type: 'quarterly', module: 'all' }, { validateResult: false });
      const rows = (ts ?? []).filter((x) => x?.date).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      quarters = rows.map((x) => ({
        date: new Date(x.date).toISOString().slice(0, 10),
        revenue: num(x.totalRevenue) ?? num(x.operatingRevenue),
        grossProfit: num(x.grossProfit),
        dilutedEps: num(x.dilutedEPS),
        dilutedShares: num(x.dilutedAverageShares) ?? num(x.ordinarySharesNumber),
      })).filter((q) => q.revenue != null || q.dilutedEps != null || q.dilutedShares != null);
      const lastBs = [...rows].reverse().find((x) => num(x.cashAndCashEquivalents) != null || num(x.totalDebt) != null);
      if (lastBs) {
        cash = (num(lastBs.cashCashEquivalentsAndShortTermInvestments) ?? num(lastBs.cashAndCashEquivalents));
        debt = num(lastBs.totalDebt);
      }
      if (quarters.length) { asOf = quarters[quarters.length - 1].date; sources.push('yahoo fundamentalsTimeSeries'); }
    } catch (e: any) { logger.debug(`[SWINGS] ${sym} fundamentalsTimeSeries failed: ${e?.message}`); }
    let revenueGrowthFallback: number | null = null; let sector: string | null = null; let name: string | null = null; let sharesOutstanding: number | null = null;
    try {
      const { safeQuoteSummary } = await import('./yahoo-finance-service');
      const qs = await safeQuoteSummary(sym, ['financialData', 'summaryProfile', 'defaultKeyStatistics', 'price']);
      const fd = qs?.financialData ?? {};
      const raw = (x: any) => num(x?.raw ?? x);
      revenueGrowthFallback = raw(fd.revenueGrowth);
      if (cash == null) cash = raw(fd.totalCash);
      if (debt == null) debt = raw(fd.totalDebt);
      sector = qs?.summaryProfile?.sector ?? null;
      name = qs?.price?.longName ?? qs?.price?.shortName ?? null;
      sharesOutstanding = raw(qs?.defaultKeyStatistics?.sharesOutstanding);
      if (qs) sources.push('yahoo quoteSummary');
    } catch (e: any) { logger.debug(`[SWINGS] ${sym} quoteSummary failed: ${e?.message}`); }
    if (!sources.length) return null;
    return { quarters, cash, totalDebt: debt, revenueGrowthFallback, sharesOutstanding, asOf, source: sources.join(' + '), sector, name };
  },
  async earnings(sym) {
    const { getEarningsDate } = await import('./earnings-service');
    const d = await getEarningsDate(sym);
    return d ? { date: d.toISOString(), source: 'yahoo calendarEvents' } : null;
  },
  async rotation(sym) {
    const { getPeerSet } = await import('@shared/sector-peers');
    const ps = getPeerSet(sym);
    if (!ps || !ps.group.etf) return null;
    const { peekSectorIgnition } = await import('./sector-ignition');
    const st = peekSectorIgnition('weekly');
    const g = st?.groups.find((x) => x.groupId === ps.group.id);
    return { groupId: ps.group.id, label: ps.group.label, etf: ps.group.etf, quadrant: g ? String(g.metrics?.quadrant ?? '') || null : null, stage: g?.stage ?? null, side: g?.side ?? null, asOf: st?.asOf ?? null };
  },
  async flow(sym) {
    const { db } = await import('./db');
    const { sql } = await import('drizzle-orm');
    const days = 10;
    const r: any = await db.execute(sql`
      select option_type, count(*)::int as n, coalesce(sum(coalesce(total_premium, premium * volume * 100)), 0)::float as prem, max(detected_at) as last
      from options_flow_history where symbol = ${sym} and detected_at > now() - (${days} || ' days')::interval group by option_type`);
    const rows: any[] = r?.rows ?? r ?? [];
    if (!rows.length) return null;
    const by = (t: string) => rows.find((x) => x.option_type === t);
    const last = rows.map((x) => (x.last ? new Date(x.last).getTime() : 0)).reduce((a, b) => Math.max(a, b), 0);
    return { callPremium: Number(by('call')?.prem ?? 0), putPremium: Number(by('put')?.prem ?? 0), prints: rows.reduce((s, x) => s + Number(x.n), 0), days, asOf: last ? new Date(last).toISOString() : null, source: 'options_flow_history' };
  },
  async gex(sym) {
    const { db } = await import('./db');
    const { sql } = await import('drizzle-orm');
    const r: any = await db.execute(sql`
      select regime, spot_price, flip_point, call_wall, put_wall, snapshot_at from gex_snapshots
      where symbol = ${sym} and snapshot_at > now() - interval '5 days' order by snapshot_at desc limit 1`);
    const row = (r?.rows ?? r ?? [])[0];
    if (!row) return null;
    return { regime: row.regime ?? null, spot: num(row.spot_price), flip: num(row.flip_point), callWall: num(row.call_wall), putWall: num(row.put_wall), asOf: new Date(row.snapshot_at).toISOString(), source: 'gex_snapshots' };
  },
  async news(sym) {
    const y = await yf();
    const s = await y.search(sym, { newsCount: 6, quotesCount: 0 }, { validateResult: false });
    const items = (s?.news ?? [])
      .filter((n: any) => Array.isArray(n?.relatedTickers) && n.relatedTickers.includes(sym))
      .slice(0, 5)
      .map((n: any) => ({ title: String(n.title ?? ''), publisher: n.publisher ?? null, at: n.providerPublishTime ? new Date(n.providerPublishTime).toISOString() : null, link: n.link ?? null }));
    return { items, asOf: new Date().toISOString() };
  },
  async chain(sym, minDays, maxDays, band, nowMs) {
    const { getAlpacaOptionsChain, isAlpacaOptionsConfigured } = await import('./alpaca-options');
    if (!isAlpacaOptionsConfigured()) return null;
    const { calendarDte } = await import('./lib/publish-gates');
    const ch = await getAlpacaOptionsChain(sym, { maxDays, band });
    if (!ch || !ch.contracts.length) return null;
    const rows = ch.contracts.map((c) => ({
      type: c.type, strike: c.strike, expiry: c.expiration, bid: c.bid, ask: c.ask, delta: c.delta, gamma: c.gamma, iv: c.iv,
      openInterest: c.openInterest, volume: c.volume, prevVolume: c.prevVolume ?? null, dte: calendarDte(c.expiration, nowMs) ?? 0, occ: c.occ,
    } as BudgetChainRow)).filter((r) => r.dte >= minDays);
    return { rows, source: 'alpaca_indicative', asOf: new Date(ch.fetchedAt).toISOString() };
  },
  nowMs: () => Date.now(),
};

// ─── run ───────────────────────────────────────────────────────────────────

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.max(1, n) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}
const safe = async <T>(p: () => Promise<T>, fallback: T): Promise<T> => { try { return await p(); } catch { return fallback; } };

/** Screen one symbol end-to-end (no band check when `force`). */
export async function screenOne(sym: string, deps: SwingsDeps, ctx: { spy: Bar[]; etfBars: Map<string, Bar[]>; monthly?: MonthlyRead | null; force?: boolean }): Promise<ScreenRow | null> {
  const nowMs = deps.nowMs();
  const daily = await safe(() => deps.daily(sym, 3 * 366), [] as Bar[]);
  if (daily.length < 30) return null;
  const monthly = ctx.monthly !== undefined ? ctx.monthly : await safe(() => deps.monthly(sym), null);
  const [fund, earn, rot, flow, gex] = await Promise.all([
    safe(() => deps.fundamentals(sym), null), safe(() => deps.earnings(sym), null), safe(() => deps.rotation(sym), null),
    safe(() => deps.flow(sym), null), safe(() => deps.gex(sym), null),
  ]);
  let sectorDaily: Bar[] | null = null;
  if (rot?.etf) {
    if (!ctx.etfBars.has(rot.etf)) ctx.etfBars.set(rot.etf, await safe(() => deps.daily(rot.etf, 200), [] as Bar[]));
    sectorDaily = ctx.etfBars.get(rot.etf) ?? null;
  }
  const input: ScreenInput = {
    symbol: sym, name: fund?.name ?? monthly?.name ?? null, sector: fund?.sector ?? rot?.label ?? null,
    daily, athMonthly: monthly ? { high: monthly.athHigh, atMs: monthly.athAtMs } : null,
    spyDaily: ctx.spy, sectorDaily, sectorEtf: rot?.etf ?? null,
    fundamentals: fund, nextEarnings: earn, rotation: rot, flow, gex, nowMs, barsSource: 'yahoo chart 1d',
  };
  const base = screenSymbol(input, ctx.force ? { band: [0, 100] } : {});
  if (!base) return null;
  const chainSlot = async (kind: 'swing' | 'leaps'): Promise<ContractSlot> => {
    const [lo, hi] = kind === 'swing' ? SWING_DTE : LEAPS_DTE;
    const ch = await safe(() => deps.chain(sym, lo, hi + 5, kind === 'swing' ? 0.3 : 0.5, nowMs), null);
    if (!ch) return { pick: null, status: 'no_chain', reason: 'no option chain answered (Alpaca)', chainSource: null, chainAsOf: null };
    const ci = { symbol: sym, spot: base.price, ath: base.ath, rows: ch.rows, nowMs, source: ch.source, asOf: ch.asOf };
    return kind === 'swing' ? pickSwingContract(ci) : pickLeapsContract(ci);
  };
  const [swing, leaps, news] = await Promise.all([chainSlot('swing'), chainSlot('leaps'), safe(() => deps.news(sym), { items: [], asOf: null })]);
  return { ...base, swing, leaps, news: news.items, newsAsOf: news.asOf };
}

let running: Promise<SwingsSnapshot> | null = null;

export async function runSwingsScreener(trigger = 'manual', deps: SwingsDeps = liveDeps, opts: { limit?: number; concurrency?: number } = {}): Promise<SwingsSnapshot> {
  if (running) return running;
  running = (async () => {
    const t0 = Date.now();
    const notes: string[] = [];
    const u = await deps.universe();
    const symbols = opts.limit ? u.symbols.slice(0, opts.limit) : u.symbols;
    const conc = opts.concurrency ?? 4;
    let equities = 0;
    const monthly = await pool(symbols, conc, async (s) => {
      const m = await safe(() => deps.monthly(s), null);
      if (!m) return null;
      if (m.instrumentType && m.instrumentType !== 'EQUITY') return null;
      equities++;
      const dd = (1 - m.lastClose / m.athHigh) * 100;
      return dd >= DRAWDOWN_MIN - 5 && dd <= DRAWDOWN_MAX + 5 ? { s, m } : null;
    });
    const pass1 = monthly.filter((x): x is { s: string; m: MonthlyRead } => !!x);
    const spy = await safe(() => deps.daily('SPY', 200), [] as Bar[]);
    if (!spy.length) notes.push('SPY bars unavailable — RS vs SPY is n/a');
    const etfBars = new Map<string, Bar[]>();
    const rows = (await pool(pass1, Math.max(1, Math.floor(conc / 2)), ({ s, m }) => safe(() => screenOne(s, deps, { spy, etfBars, monthly: m }), null)))
      .filter((r): r is ScreenRow => !!r);
    const snap: SwingsSnapshot = {
      v: SWINGS_VERSION, asOf: new Date(deps.nowMs()).toISOString(), disclaimer: SWINGS_DISCLAIMER, caveat: SWINGS_CAVEAT,
      universe: { total: symbols.length, equities, pass1: pass1.length, screened: rows.length, sources: u.sources },
      rows: rankRows(rows), notes, ms: Date.now() - t0, trigger,
    };
    if (deps === liveDeps) await writeShared(SWINGS_SHARED, snap);
    logger.info(`[SWINGS] ${trigger}: ${symbols.length} names → ${pass1.length} pass-1 → ${rows.length} screened in ${Math.round(snap.ms / 1000)}s`);
    return snap;
  })();
  try { return await running; } finally { running = null; }
}

export function readSwingsSnapshot(): { snap: SwingsSnapshot; ageMs: number; stale: boolean } | null {
  const r = readShared<SwingsSnapshot>(SWINGS_SHARED, 36 * 3_600_000);
  return r ? { snap: r.data, ageMs: r.ageMs, stale: r.stale } : null;
}

/** Nightly 18:40 ET weekdays (after the close + earnings dates settle). */
export async function scheduleSwingsScreener(log: (m: string) => void): Promise<void> {
  if (!swingsScreenerEnabled()) { log('⏸️  [SWINGS] SWINGS_SCREENER off'); return; }
  const cron = (await import('./guarded-cron')).default;
  const { runHeavy } = await import('./lib/heavy-job-gate');
  cron.schedule('40 18 * * 1-5', () => {
    void runHeavy('swings-screener', () => runSwingsScreener('nightly'), { priority: 'low', maxWaitMs: 60 * 60_000 })
      .catch((e) => logger.error('[SWINGS] nightly run failed', e));
  }, { timezone: 'America/New_York' });
  // Cold cache at boot → one run so the page is not empty until tonight.
  if (!readSwingsSnapshot()) setTimeout(() => { void runHeavy('swings-screener', () => runSwingsScreener('boot'), { priority: 'low', maxWaitMs: 60 * 60_000 }).catch(() => {}); }, 10 * 60_000).unref?.();
  log('📉 [SWINGS] monthly swings & LEAPS screener scheduled (18:40 ET weekdays)');
}

// ─── routes ────────────────────────────────────────────────────────────────

export function registerSwingsRoutes(app: Express, requireBetaAccess: Mw, requireAdmin: Mw): void {
  app.get('/api/swings', requireBetaAccess, (req, res) => {
    const r = readSwingsSnapshot();
    const q = req.query as Record<string, string | undefined>;
    const n = (k: string) => (q[k] != null && q[k] !== '' && Number.isFinite(Number(q[k])) ? Number(q[k]) : undefined);
    if (!r) return res.json({ v: SWINGS_VERSION, disclaimer: SWINGS_DISCLAIMER, caveat: SWINGS_CAVEAT, asOf: null, ageSec: null, stale: true, running: !!running, rows: [], sectors: [], universe: null, notes: ['no screen yet — the nightly job (18:40 ET) or an admin refresh fills this'] });
    const rows = filterRows(r.snap.rows, { ddMin: n('ddMin'), ddMax: n('ddMax'), sector: q.sector || null, minScore: n('minScore'), earningsWithin: n('earningsWithin') ?? null });
    const sectors = [...new Set(r.snap.rows.map((x) => x.sector).filter(Boolean))].sort();
    res.json({ ...r.snap, rows, total: r.snap.rows.length, sectors, ageSec: Math.round(r.ageMs / 1000), stale: r.stale, running: !!running });
  });
  app.get('/api/swings/:symbol', requireBetaAccess, async (req, res) => {
    const sym = String(req.params.symbol ?? '').toUpperCase().replace(/[^A-Z.]/g, '');
    const r = readSwingsSnapshot();
    const row = r?.snap.rows.find((x) => x.symbol === sym);
    if (row) return res.json({ row, asOf: r!.snap.asOf, ageSec: Math.round(r!.ageMs / 1000), cached: true, disclaimer: SWINGS_DISCLAIMER });
    if (req.query.live !== '1') return res.status(404).json({ error: `${sym} is not in the cached screen (outside the 40–85% drawdown band or not in the universe)` });
    try {
      const spy = await liveDeps.daily('SPY', 200).catch(() => []);
      const live = await screenOne(sym, liveDeps, { spy, etfBars: new Map(), force: true });
      if (!live) return res.status(404).json({ error: `${sym}: no bars` });
      res.json({ row: live, asOf: live.computedAt, ageSec: 0, cached: false, disclaimer: SWINGS_DISCLAIMER });
    } catch (e: any) { res.status(500).json({ error: e?.message ?? 'failed' }); }
  });
  app.post('/api/admin/swings/refresh', requireAdmin, (_req, res) => {
    if (running) return res.status(202).json({ ok: true, running: true, note: 'a run is already in progress' });
    void import('./lib/heavy-job-gate').then(({ runHeavy }) => runHeavy('swings-screener', () => runSwingsScreener('admin'), { priority: 'low' }))
      .catch((e) => logger.error('[SWINGS] admin refresh failed', e));
    res.status(202).json({ ok: true, running: true, note: 'refresh started — the full universe takes several minutes' });
  });
}
