/**
 * DEVICE AUDIT — readability, touch, overflow, focus, labels and contrast on
 * every primary page, at phone / tablet / desktop sizes, in Dark, Light and
 * High-contrast modes. Re-runnable; no database, no network.
 *
 *   npm run build                       # the audit serves dist/public
 *   npx tsx research/device-audit.ts    # → research/device-audit.json + a table on stdout
 *
 * Options (env):
 *   PLAYWRIGHT_CORE   path to a playwright-core package (default: resolve
 *                     'playwright-core', then the newest one in ~/.npm/_npx)
 *   AUDIT_PAGES       comma list of paths to limit the run (e.g. "/t?tab=gex,/today")
 *   AUDIT_SIZES       comma list of WxH (e.g. "393x852,1440x900")
 *   AUDIT_MODES       comma list of dark,light,contrast
 *   AUDIT_PORT        port for the built-in static server (default 5392)
 *   AUDIT_OUT         JSON output path (default research/device-audit.json)
 *   AUDIT_SERVE_ONLY  1 = only run the harness server (browse it by hand)
 *   AUDIT_SIGNED_OUT  1 = /api/auth/me answers 401 (check the sign-in gate / return-to)
 *   AUDIT_DIST        serve another built client (e.g. a before/after comparison copy)
 *
 * The built-in server serves the BUILT client (with a TEST HARNESS banner) and answers /api with
 * synthetic FIXTURES (a GEX book, a conviction list, pre-market gaps, an
 * options-flow tape and a journal trade list) or 404, so
 * tools render real layouts, loading and error states. Nothing here is
 * market data and nothing is presented as such.
 *
 * Checks per page × size × mode (what "pass" means):
 *   overflow  no horizontal page overflow (document and <main>)
 *   targets   phones (≤ 767px): every visible control ≥ 44×44 CSS px; tablets
 *             (768/1024, touch): ≥ 32×32 (the desktop floor)
 *             (inline links inside prose and the GEX matrix's data cells exempt)
 *   bodyText  phones (< 600px): prose (non-mono text runs ≥ 40 chars) ≥ 14px
 *   focus     the first 15 Tab stops each show a focus ring (outline or box-shadow)
 *   icons     icon-only controls have an accessible name (aria-label/labelledby)
 *             AND a tooltip (title / aria-describedby)
 *   contrast  text vs its composited background ≥ 4.5:1 (3:1 for large text);
 *             disabled controls exempt; text over images/gradients skipped
 *   readability phones: GEX cells ≥ 13px, strikes ≥ 14px, headers ≥ 12px, rows ≥ 36px,
 *             section/card titles ≥ 16px, no visible text < 12px
 *   scrollCue desktop workspaces: every overflowing scroller inside a tile is the
 *             tile's marked scroller (visible scrollbar, fade + "more" cue)
 *   noDesc    phones: no tool/section description, method note or long provenance
 *             line is visible by default — they live behind the ⓘ (qe-phone.tsx):
 *             .fd-tool-blurb, .pg-prov, .fd-prov, .fd-age, .lx-page-purpose,
 *             .lx-panel-sub and a collapsed PhoneNote's body must not render
 *   textBudget (WARN, not a failure) phones: visible text characters in the FIRST
 *             viewport ≤ PHONE_TEXT_BUDGET (550). Why 550: at 393×852 the content
 *             area between the top bar and the dock is ~700px; at the phone prose
 *             floor (14px, ~20px lines, ~42 chars per 361px line) a screen of
 *             paragraphs is ~35 × 42 ≈ 1,450 chars, while a screen that is mostly
 *             numbers, tickers and headings measures 300–500 (NEXUS board, FLOW
 *             feed, GEX matrix after the 2026-09-30 declutter). 550 ≈ 40% of a
 *             prose screen: above it the first screen is reading, not scanning.
 *             Counted like the eye sees it: clipped (clamped, scrolled-away,
 *             overflow-hidden) lines are not counted; the harness banner is not.
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { GAMMA_METRIC_DEFS, levelsFor, diffLevels, overlapCount } from '../shared/gex-adjusted';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = process.env.AUDIT_DIST ? path.resolve(process.env.AUDIT_DIST) : path.join(ROOT, 'dist', 'public');
const PORT = Number(process.env.AUDIT_PORT || 5392);
const BASE = `http://127.0.0.1:${PORT}`;

const PAGES: Array<{ path: string; name: string; readOnly?: boolean }> = [
  { path: '/today', name: 'Today' },
  { path: '/t', name: 'NEXUS' },
  { path: '/t?tab=flow', name: 'FLOW' },
  { path: '/t?tab=gex', name: 'GEX' },
  { path: '/t?tab=bot', name: 'Bot' },
  { path: '/t?tab=journal', name: 'Journal', readOnly: true },
  { path: '/r/SPY', name: 'Research' },
  { path: '/settings', name: 'Settings' },
];
const SIZES = [
  { w: 375, h: 812, label: 'iPhone 375', touch: true },
  { w: 393, h: 852, label: 'iPhone 393', touch: true },
  { w: 360, h: 800, label: 'Android 360', touch: true },
  { w: 768, h: 1024, label: 'Tablet 768', touch: true },
  { w: 1024, h: 768, label: 'Tablet 1024', touch: true },
  { w: 1440, h: 900, label: 'Desktop 1440', touch: false },
];
const MODES = ['dark', 'light', 'contrast'] as const;
/** phone first-viewport text budget (chars) — see "textBudget" above */
const PHONE_TEXT_BUDGET = 550;

const pick = <T,>(env: string | undefined, all: T[], key: (t: T) => string) =>
  env ? all.filter((t) => env.split(',').map((s) => s.trim()).includes(key(t))) : all;
const pages = pick(process.env.AUDIT_PAGES, PAGES, (p) => p.path);
const sizes = pick(process.env.AUDIT_SIZES, SIZES, (s) => `${s.w}x${s.h}`);
const modes = pick(process.env.AUDIT_MODES, [...MODES], (m) => m);

/* ── playwright-core, from the machine (never installed into this repo) ── */
function loadPlaywright(): any {
  const req = createRequire(import.meta.url);
  const tries: string[] = [];
  if (process.env.PLAYWRIGHT_CORE) tries.push(process.env.PLAYWRIGHT_CORE);
  tries.push('playwright-core');
  const npx = path.join(os.homedir(), '.npm', '_npx');
  if (fs.existsSync(npx)) {
    for (const d of fs.readdirSync(npx)) {
      const p = path.join(npx, d, 'node_modules', 'playwright-core');
      if (fs.existsSync(path.join(p, 'package.json'))) tries.push(p);
    }
  }
  const found = tries
    .map((t) => { try { const pkg = req(path.join(t, 'package.json')); return { t, v: pkg.version as string }; } catch { try { req.resolve(t); return { t, v: '0' }; } catch { return null; } } })
    .filter(Boolean) as Array<{ t: string; v: string }>;
  found.sort((a, b) => b.v.localeCompare(a.v, undefined, { numeric: true }));
  for (const f of found) { try { return req(f.t); } catch { /* next */ } }
  throw new Error('playwright-core not found — set PLAYWRIGHT_CORE to a playwright-core package directory');
}

/* ── static server + test-harness fixtures ── */
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
function mockTerminal(symbol: string) {
  const spot = 575.4; const r = rng(symbol.length * 7919);
  const dtes = [0, 1, 2, 3, 4, 7, 8, 14, 21, 30, 45, 60];
  const label = (d: number) => new Date(Date.UTC(2026, 8, 29) + d * 864e5).toLocaleString('en-US', { month: 'short', day: '2-digit', timeZone: 'UTC' }).toUpperCase();
  const cells: any[] = [];
  for (let k = 530; k <= 620; k += 1) {
    for (const d of dtes) {
      if (r() < 0.12) continue;
      const dist = (k - spot) / spot; const shape = Math.exp(-(dist * dist) / 0.0012);
      const v = (k >= spot - 3 ? 1 : -1) * shape * (1 / (1 + d / 4)) * (k === 585 || k === 565 ? 3 : 1) * (0.4 + r()) * 1.2;
      // Δ-adjusted (fixture shape, docs/GAMMA_RAW_VS_ADJUSTED.md): ≈ raw beyond 1 d;
      // front expiries shrink at the money and grow just beside it.
      const ad = Math.abs(dist);
      const fAdj = d > 1 ? 0.99 : ad < 0.002 ? 0.45 : ad < 0.012 ? 1.35 : 1;
      cells.push({ strike: k, expiryLabel: label(d), dte: d, netGEX: +v.toFixed(4), netVEX: +((r() - 0.45) * shape * 80).toFixed(3), netGEXAdj: +(v * fAdj).toFixed(4), netGEXFlow: +(k > spot * 1.02 && d > 0 && d <= 21 ? -v * 0.4 : v).toFixed(4) });
    }
  }
  const book = (key: 'netGEX' | 'netGEXAdj' | 'netGEXFlow', zeroGamma: number) => {
    const byK = new Map<number, { strike: number; call: number; put: number; net: number }>();
    for (const c of cells) {
      const v = c[key] as number; const row = byK.get(c.strike) ?? { strike: c.strike, call: 0, put: 0, net: 0 };
      if (v >= 0) row.call += v; else row.put += v; row.net += v; byK.set(c.strike, row);
    }
    const net = cells.reduce((a, c) => a + (c[key] as number), 0); const gross = cells.reduce((a, c) => a + Math.abs(c[key] as number), 0);
    return { net, gross, balance: gross ? net / gross : null, levels: levelsFor([...byK.values()], cells.map((c) => ({ strike: c.strike, dte: c.dte, value: c[key] as number })), spot, zeroGamma) };
  };
  const raw = book('netGEX', 570.8); const adj = book('netGEXAdj', 571.6); const flow = book('netGEXFlow', 572.9);
  const gammaMetrics = {
    version: 1, unit: '$B per 1% move', defs: GAMMA_METRIC_DEFS,
    raw, deltaAdjusted: { ...adj, moveUp: adj.net * 0.8, moveDown: adj.net * 1.2 },
    flowSigned: { ...flow, resignedGross: 0.6, resignedShare: raw.gross ? 0.6 / raw.gross : null },
    differs: { deltaAdjusted: diffLevels(raw.levels, adj.levels, spot), flowSigned: diffLevels(raw.levels, flow.levels, spot) },
    keyStrikeOverlap: overlapCount(raw.levels.keyStrikes, adj.levels.keyStrikes),
    notes: ['test harness fixture'],
  };
  const profile = Array.from({ length: 41 }, (_, i) => { const p = spot * (0.8 + i * 0.01); return { spot: +p.toFixed(2), netGEX: +(((p - spot * 0.99) / spot) * 40).toFixed(3) }; });
  return {
    symbol, generatedAt: new Date(Date.now() - 95_000).toISOString(), cached: false, optionsSource: 'test_harness_fixture',
    snapshot: { symbol, spotPrice: spot, calculatedAt: Date.now() - 95_000, totalGEX: 4.21, totalNetGEX: 4.21, totalVEX: -182.4, callGEX: 7.1, putGEX: -2.9, putCallRatio: 0.41, gammaFlipPrice: 570.8, zeroGammaLevel: 570.8, maxGammaStrike: 580, callWall: 585, putWall: 565, zeroGammaProjection: 580, unitsVersion: 2, gexByScope: { all: 4.21, frontExpiry: 1.3, frontExpiryDays: 0, le7d: 2.8 }, gammaProfile: profile, levels: [], regime: 'positive_gamma', gammaMetrics },
    strikeExpiryMatrix: cells, candles: [], orbs: [], heatmap: [], projection: null, peers: [],
  };
}
function mockConvictions() {
  const syms = ['NVDA', 'AAPL', 'MSFT', 'AMD', 'TSLA', 'META', 'AMZN', 'GOOGL', 'PLTR', 'COIN', 'SMCI', 'AVGO'];
  const r = rng(42);
  return {
    generatedAt: new Date(Date.now() - 60e3).toISOString(), marketContext: { regime: 'fixture', riskSentiment: 'neutral', preferredDirection: 'long', score: 55, vixLevel: 16.2, reasons: ['test-harness fixture'] },
    breadth: null, geopolitical: { risk: 'low', activeScenarios: [] }, totalCandidatesScanned: 400,
    picks: syms.map((symbol, i) => {
      const px = +(50 + r() * 400).toFixed(2); const dir = r() < 0.7 ? 'long' : 'short'; const score = Math.round(92 - i * 2.4);
      const band = score >= 85 ? 'S' : score >= 75 ? 'A' : score >= 62 ? 'B' : 'C';
      return { ideaId: `fixture-${symbol}`, symbol, sector: 'tech', direction: dir, assetType: 'option', holdingPeriod: 'swing', tradeType: 'swing', entryPrice: px, targetPrice: +(px * (dir === 'long' ? 1.06 : 0.94)).toFixed(2), stopLoss: +(px * (dir === 'long' ? 0.97 : 1.03)).toFixed(2), riskRewardRatio: 2, optionType: dir === 'long' ? 'call' : 'put', strikePrice: Math.round(px), entryPremium: 3.1, optionDte: 14, expiryDate: '2026-10-16', convictionScore: score, convictionBand: band, layerCount: 6, layers: [], publishedConvictionScore: score, publishedConvictionBand: band, thesis: 'Test-harness fixture — not a real idea.', catalyst: 'fixture', catalystSourceUrl: null, generatedAt: new Date(Date.now() - i * 3600e3).toISOString(), source: 'fixture', currentPrice: px, lifecycleState: 'thesis' };
    }),
  };
}
/** Synthetic pre-market gaps (TEST HARNESS — not market data). */
function mockGappers() {
  const at = new Date(Date.now() - 40_000).toISOString();
  const rows: Array<[string, number, boolean]> = [['NVDA', 2.4, true], ['TSLA', -3.1, true], ['AAPL', 0.2, false], ['AMD', -1.4, false], ['META', 1.1, false], ['PLTR', 4.8, false], ['COIN', -0.6, true]];
  return {
    phase: 'pre_market', scanned: rows.length, generatedAt: at, oldestFetchedAt: at, source: 'TEST HARNESS fixture',
    gappers: rows.map(([symbol, gapPct, isWeekly]) => ({ symbol, price: +(100 * (1 + gapPct / 100)).toFixed(2), previousClose: 100, gapPct, preMarketGapPct: gapPct, direction: gapPct > 0.5 ? 'up' : gapPct < -0.5 ? 'down' : 'flat', phase: 'pre_market', isWeekly, fetchedAt: at })),
  };
}
/** Synthetic Today context — weekly path, sectors, crypto, record, index desk, quotes, SPY bars (TEST HARNESS — not market data). */
function mockWeeklyPath() {
  const spot = 575.4, sig = 9.2; const at = new Date(Date.now() - 12 * 60e3).toISOString();
  const path = [0, 1, 2, 3, 4, 5].map((d) => { const p = spot + d * 0.9; const w = sig * Math.sqrt(d / 5); return { dayOffset: d, price: +p.toFixed(2), lo: +(p - w).toFixed(2), hi: +(p + w).toFixed(2), confidence: 0.6 }; });
  return { cached: true, cachedAt: at, symbol: 'SPY', spotPrice: spot, weekStart: '2026-09-28', weekEnd: '2026-10-02', levels: [], path, phases: [], regime: 'positive_gamma', confidence: 0.6, expectedMove: sig, annualVol: 0.128, volSource: 'realized-20d', impliedVol: 0.152 };
}
function mockRotation() {
  const r = rng(7); const at = new Date(Date.now() - 4 * 60e3).toISOString();
  const s: Array<[string, string]> = [['XLK', 'Technology'], ['XLF', 'Financials'], ['XLE', 'Energy'], ['XLV', 'Health Care'], ['XLY', 'Discretionary'], ['XLP', 'Staples'], ['XLI', 'Industrials'], ['XLU', 'Utilities'], ['XLB', 'Materials'], ['XLRE', 'Real Estate'], ['XLC', 'Communication']];
  return { asOf: at, isStale: false, sessionLabel: 'fixture session', spyChange: 0.42, sectors: s.map(([etf, name], i) => { const c = +((r() - 0.45) * 2.4).toFixed(2); return { etf, name, change: c, relChange: +(c - 0.42).toFixed(2), rsRatio: +((r() - 0.5) * 4).toFixed(2), rsMomentum: +((r() - 0.5) * 4).toFixed(2), rank: i + 1 }; }) };
}
function mockPulse() {
  return { asOf: new Date(Date.now() - 90e3).toISOString(), assets: [{ symbol: 'BTC', name: 'Bitcoin', price: 64210, change24h: 1.8, change7d: 4.2, high24h: 64900, low24h: 62800 }, { symbol: 'ETH', name: 'Ethereum', price: 2480, change24h: -0.7, change7d: 1.1, high24h: 2530, low24h: 2440 }, { symbol: 'SOL', name: 'Solana', price: 148, change24h: 3.2, change7d: -2.4, high24h: 151, low24h: 142 }] };
}
function mockRecord() {
  return { since: '2026-08-26', asOf: new Date(Date.now() - 5 * 60e3).toISOString(), winRate: 42, wins: 37, losses: 51, decided: 88, unresolved: 32, total: 120, expectancyR: 0.137, rSampleSize: 88, coveragePct: 73, sampleFloor: 30 };
}
function mockIndexDesk() {
  return { session: { name: 'fixture session', isOpen: true }, scalps: [{ id: 'fx-spy', symbol: 'SPY', direction: 'long', bias: 'bullish', setup: 'vwap_reclaim', confidence: 71, riskRewardRatio: 2.1, timestamp: new Date(Date.now() - 8 * 60e3).toISOString() }, { id: 'fx-iwm', symbol: 'IWM', direction: 'short', bias: 'bearish', setup: 'failed_breakout', confidence: 63, riskRewardRatio: 1.7, timestamp: new Date(Date.now() - 20 * 60e3).toISOString() }] };
}
function mockQuotes(syms: string[]) {
  const at = new Date(Date.now() - 30e3).toISOString(); const r = rng(syms.length);
  return { quotes: Object.fromEntries(syms.map((s) => [s, { price: s === 'SPY' ? 576.12 : +(50 + r() * 400).toFixed(2), changePercent: +((r() - 0.4) * 3).toFixed(2), asOf: at, session: 'regular', source: 'fixture' }])) };
}
function mockBars() {
  const r = rng(11); let p = 572; const t0 = Math.floor(Date.now() / 1000) - 78 * 300;
  return { data: Array.from({ length: 78 }, (_, i) => { const o = p; p = +(p + (r() - 0.46) * 0.8).toFixed(2); return { time: t0 + i * 300, open: o, high: Math.max(o, p) + 0.2, low: Math.min(o, p) - 0.2, close: p }; }) };
}
/** Synthetic OHLCV (TEST HARNESS — not market data): a seeded random walk on
 *  weekday sessions, 04:00–20:00 ET intraday (fixed UTC−4), epoch seconds. */
function mockHistory(symbol: string, range: string, interval: string) {
  const r = rng(symbol.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const stepMin: Record<string, number> = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '1d': 1440, '1wk': 10080 };
  const step = stepMin[interval] ?? 5;
  const days: Record<string, number> = { '5d': 5, '1mo': 22, '6mo': 126, '2y': 504, '10y': 2520 };
  const nDays = Math.min(days[range] ?? 22, step >= 1440 ? 2520 : 60);
  const now = Date.now();
  const sessions: number[] = [];
  for (let d = 0; sessions.length < nDays && d < nDays * 2 + 10; d++) {
    const day = new Date(now - d * 864e5); const wd = day.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    sessions.unshift(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  }
  const times: number[] = [];
  if (step === 10080) { for (let i = sessions.length - 1; i >= 0; i -= 5) times.unshift(sessions[i] + 13.5 * 36e5); }
  else if (step === 1440) sessions.forEach((s) => times.push(s + 13.5 * 36e5));
  else sessions.forEach((s) => { for (let m = 8 * 60; m < 24 * 60; m += step) { const t = s + m * 6e4; if (t <= now) times.push(t); } });
  let px = 540 + (r() - 0.5) * 60;
  const data = times.map((t) => {
    const vol = step >= 1440 ? 0.014 : 0.0012 * Math.sqrt(step);
    const open = px; const close = open * (1 + (r() - 0.49) * vol * 2);
    const high = Math.max(open, close) * (1 + r() * vol * 0.8); const low = Math.min(open, close) * (1 - r() * vol * 0.8);
    px = close;
    return { time: Math.floor(t / 1000), open: +open.toFixed(2), high: +high.toFixed(2), low: +low.toFixed(2), close: +close.toFixed(2), volume: Math.round((0.4 + r()) * (step >= 1440 ? 8e7 : 2e5 * step)) };
  });
  return { symbol, range, data };
}
/** Synthetic /api/chart/overlays (TEST HARNESS): GEX timeline, dark pool, flow. */
function mockOverlays(symbol: string, spot: number) {
  const r = rng(symbol.length * 131);
  // Anchor to the fixture's last intraday bar (sessions end 20:00 ET = 00:00 UTC).
  const wall = Date.now(); const d0 = new Date(wall); const h = d0.getUTCHours();
  const now = h < 8 ? Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate()) - 5 * 6e4 : wall;
  const start = now - 6.5 * 36e5;
  const strikes = [-10, -5, 0, 5, 10].map((d) => Math.round(spot + d));
  const samples: { t: number; spot: number; net: number; source: string }[] = [];
  for (let t = start; t <= now; t += 5 * 6e4) samples.push({ t, spot, net: (r() - 0.4) * 3e9, source: 'test_harness_fixture' });
  const series = strikes.map((k, i) => ({ strike: k, points: samples.map((s) => [s.t, ((i - 2) >= 0 ? 1 : -1) * (0.3 + r()) * 8e8] as [number, number]) }));
  const iso = new Date(now - 60e3).toISOString();
  return {
    symbol, range: '1D', dates: [], generatedAt: iso,
    gexNow: { net: 2.1e9, spot, topStrikes: strikes.map((k, i) => ({ strike: k, gex: (i - 2 || 1) * 4e8 })), asOf: iso, ageSec: 60, source: 'test_harness_fixture' },
    gexTimeline: { sampleEveryMin: 5, recordingSince: new Date(start).toISOString(), asOf: iso, ageSec: 60, sources: ['test_harness_fixture'], note: 'fixture', watched: true, samples, series },
    darkPool: { source: 'test_harness_fixture', asOf: iso, ageSec: 60, stale: false, windowFrom: null, windowTo: null, printsScanned: 40, levels: [{ price: +(spot * 0.992).toFixed(2), notional: 4.2e8, prints: 12, date: iso, firstDate: iso }, { price: +(spot * 1.006).toFixed(2), notional: 1.9e8, prints: 5, date: iso, firstDate: iso }], note: 'fixture' },
    flow: { source: 'test_harness_fixture', streamState: 'fixture', asOf: iso, ageSec: 60, prints: Array.from({ length: 8 }, (_, i) => ({ time: start + (i + 1) * 40 * 6e4, optionType: i % 3 ? 'call' : 'put', strike: Math.round(spot), expiry: '2026-10-02', contract: `${symbol} fixture ${i % 3 ? 'C' : 'P'}`, premium: (0.2 + r()) * 2e6, fillPrice: 3.2, contracts: 500, alertNames: ['fixture'], side: null })), note: 'fixture' },
  };
}
/** Synthetic options-flow tape (TEST HARNESS — not market data): FLOW's feed, ladder and alerts. */
function mockFlowTape(symbol: string | null) {
  const r = rng(7 + (symbol?.length ?? 0));
  const syms = symbol ? [symbol] : ['SPY', 'NVDA', 'TSLA', 'QQQ', 'AAPL', 'AMD', 'META', 'PLTR'];
  const kinds = ['sweep', 'block', 'unusual', 'repeater', 'other'] as const;
  const rows = Array.from({ length: 40 }, (_, i) => {
    const sym = syms[i % syms.length]; const call = r() < 0.6; const spot = 100 + r() * 400;
    const at = new Date(Date.now() - (i * 47 + 30) * 1000).toISOString();
    return { id: `fx-${i}`, source: i % 3 ? 'bullflow' : 'chain-scan', at, symbol: sym, optionType: call ? 'call' : 'put', strike: Math.round(spot * (call ? 1.03 : 0.97)), expiry: '2026-10-17', premium: Math.round(60_000 + r() * 2_400_000), price: +(1 + r() * 9).toFixed(2), size: Math.round(50 + r() * 900), spot: +spot.toFixed(2), openInterest: Math.round(200 + r() * 5000), volOI: +(r() * 4).toFixed(2), label: 'fixture', kind: kinds[i % kinds.length], alertType: 'algo' };
  });
  const newest = rows[0].at;
  return { generatedAt: new Date().toISOString(), windowDays: 1, symbol, rows, truncated: false, sources: { bullflow: { enabled: true, streamState: 'fixture', rows: rows.length, newestAt: newest }, chainScan: { ok: true, rows: 0, newestAt: newest } } };
}
/** Synthetic journal trades (TEST HARNESS — not anyone's record). */
function mockJournalTrades() {
  const r = rng(99);
  const syms = ['NVDA', 'SPY', 'TSLA', 'AAPL', 'AMD', 'QQQ', 'META', 'MSFT', 'PLTR', 'COIN', 'AMZN', 'GOOGL'];
  const trades = Array.from({ length: 24 }, (_, i) => {
    const entry = +(1 + r() * 6).toFixed(2); const exit = +(entry * (0.5 + r() * 1.2)).toFixed(2); const qty = 1 + Math.floor(r() * 5);
    const t0 = Date.UTC(2026, 8, 29 - Math.floor(i / 2), 14, 30 + i) ; const pnl = +((exit - entry) * qty * 100).toFixed(2);
    return { id: `fx-t${i}`, symbol: syms[i % syms.length], assetType: 'option', direction: 'long', optionType: i % 3 ? 'call' : 'put', strikePrice: 100 + i * 5, expiryDate: '2026-10-17', quantity: qty, entryPrice: entry, exitPrice: exit, fees: 1.3, entryTime: new Date(t0).toISOString(), exitTime: new Date(t0 + 3_600_000).toISOString(), holdingMinutes: 60, realizedPnL: pnl, realizedPnLPercent: +(((exit - entry) / entry) * 100).toFixed(1), grossPnL: pnl, status: 'closed', outcome: pnl >= 0 ? 'win' : 'loss', notes: null, emotion: null, setupType: i % 2 ? 'breakout' : 'pullback', mistakeTag: null, rating: null, screenshot: null, broker: 'fixture' };
  });
  return { trades, count: trades.length };
}
/** Every harness page says so, big: a watermark and a red strip (aria-hidden, pointer-events none). */
/** GET /api/public/showcase — the landing's live panels (server/public-showcase.ts shape). */
function mockShowcase() {
  const now = Date.now(); const iso = (ms: number) => new Date(now - ms).toISOString();
  const spot = 575.4;
  const profile = Array.from({ length: 25 }, (_, i) => {
    const strike = 563 + i; const d = strike - 571;
    return { strike, netGex: +(d < 0 ? -0.9 * Math.exp(-((d + 3) ** 2) / 10) : 1.6 * Math.exp(-((d - 9) ** 2) / 18)).toFixed(3) };
  });
  return {
    builtAt: iso(0),
    quotes: { asOf: iso(0), data: [
      { symbol: 'SPY', price: spot, changePct: 0.42, source: 'alpaca-iex', asOf: iso(2_000) },
      { symbol: 'QQQ', price: 498.12, changePct: 0.61, source: 'alpaca-iex', asOf: iso(3_000) },
      { symbol: 'BTC', price: 64210, changePct: -1.18, source: 'coinbase', asOf: iso(1_000) },
    ] },
    gex: { asOf: iso(70_000), data: { symbol: 'SPY', spot, callWall: 580, putWall: 565, zeroGamma: 571.2, maxGammaStrike: 580, regime: 'positive_gamma', netGexB: 2.41, source: 'tradier', chainAgeMs: 70_000, delayedFeed: false, profile } },
    ideas: { asOf: iso(0), data: [
      { symbol: 'NVDA', side: 'long', band: 'A', publishedAt: iso(2 * 86_400_000), outcome: 'hit_target', percentGain: 6.2, assetType: 'stock' },
      { symbol: 'TSLA', side: 'short', band: 'B', publishedAt: iso(3 * 86_400_000), outcome: 'hit_stop', percentGain: -3.1, assetType: 'stock' },
      { symbol: 'AMD', side: 'long', band: 'B', publishedAt: iso(1.2 * 86_400_000), outcome: null, percentGain: null, assetType: 'stock' },
    ] },
    crypto: { asOf: iso(20_000), data: [
      { symbol: 'SOL', name: 'Solana', price: 148.2, change24h: -3.9 },
      { symbol: 'ETH', name: 'Ethereum', price: 2510, change24h: -2.1 },
      { symbol: 'BTC', name: 'Bitcoin', price: 64210, change24h: -1.2 },
    ] },
    catalysts: { asOf: iso(0), data: [
      { symbol: 'NKE', date: '2026-10-01', estimate: '0.52' },
      { symbol: 'MU', date: '2026-10-02', estimate: '1.74' },
      { symbol: 'STZ', date: '2026-10-06', estimate: null },
    ] },
    bot: { asOf: iso(0), data: { closed: 18, open: 4, wins: 9, winRate: null, minSample: 30, netRealizedPnL: 412, avgWinPct: null, avgLossPct: null, profitFactor: null, since: '2026-09-24', runLabel: 'Run 3 · 100K · Sep 24–', startingCapital: 100000 } },
  };
}

/* ── more synthetic fixtures (TEST HARNESS — shapes from the client types, values invented) ── */
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const dayIso = (d: number) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
/** GET /api/sector-ignition?horizon= (components/sector-ignition IgnitionPayload). */
function mockSectorIgnition(horizon: string) {
  const r = rng(horizon.length * 97);
  const g: Array<[string, string, string, string[], 'quiet' | 'stirring' | 'igniting' | 'extended', 'long' | 'short' | null]> = [
    ['compute_semis', 'compute-semis', 'SMH', ['NVDA', 'AMD', 'AVGO', 'MRVL', 'ARM'], 'igniting', 'long'],
    ['memory_storage', 'memory/storage', 'SMH', ['MU', 'WDC', 'STX', 'SNDK'], 'stirring', 'long'],
    ['optical_networking', 'optical/networking', 'SMH', ['COHR', 'LITE', 'CIEN', 'ANET'], 'extended', 'long'],
    ['cybersecurity', 'cybersecurity', 'CIBR', ['CRWD', 'PANW', 'ZS', 'FTNT'], 'stirring', 'short'],
    ['banks', 'bank', 'XLF', ['JPM', 'BAC', 'WFC', 'GS'], 'quiet', null],
    ['datacenter_power', 'data-centre power', 'XLI', ['VRT', 'ETN', 'PWR', 'GEV'], 'igniting', 'long'],
    ['enterprise_software', 'software', 'IGV', ['CRM', 'NOW', 'ADBE', 'WDAY'], 'stirring', 'short'],
    ['mega_tech', 'mega-cap tech', 'XLK', ['AAPL', 'MSFT', 'GOOGL', 'META'], 'quiet', null],
  ];
  const chip = (s: string, sign: number) => ({ symbol: s, movePct: +(sign * (0.4 + r() * 4)).toFixed(2), note: 'fixture' });
  const groups = g.map(([groupId, label, etf, mem, stage, side], i) => {
    const sign = side === 'short' ? -1 : 1;
    return {
      groupId, label, etf, horizon, phase: 'regular', stage, side, points: Math.round(88 - i * 9 + r() * 5),
      etfMovePct: +(sign * (0.2 + r() * 2)).toFixed(2), relPct: +(sign * (0.1 + r() * 1.5)).toFixed(2), breadthPct: Math.round(40 + r() * 55), flowCount: Math.round(r() * 14), membersRead: mem.length,
      metrics: { rvol: +(1 + r() * 2).toFixed(2) }, leaders: mem.slice(0, 3).map((s) => chip(s, sign)), laggards: mem.slice(3).map((s) => chip(s, -sign)),
      levels: [{ name: 'ETF VWAP', price: +(100 + r() * 200).toFixed(2) }], why: [`${label} breadth expanding (fixture)`, 'relative strength vs SPY (fixture)'],
    };
  });
  return {
    horizon, asOf: ago(90_000), ageSec: 90, phase: 'regular', groups, dataAsOf: { quotes: ago(90_000), flow: ago(120_000) },
    notes: ['test_harness_fixture'], cadence: 'fixture · every 5 min', honesty: 'Synthetic test-harness fixture — not market data.',
    watchlist: groups.filter((x) => x.side).slice(0, 4).map((x) => ({ groupId: x.groupId, label: x.label, etf: x.etf, side: x.side as 'long' | 'short', symbols: x.leaders.map((c) => c.symbol), why: 'fixture' })),
    emitted: [{ symbol: 'NVDA', groupId: 'compute_semis', side: 'long', ideaId: 'fixture-NVDA', at: ago(30 * 60e3) }],
  };
}
/** GET /api/catalysts/board (catalyst-nexus BoardPayload). */
function mockCatalystBoard() {
  const sig = (symbol: string, direction: string, type: string, title: string, d: number, polarity: string, importance: number, score: number) =>
    ({ symbol, direction, convictionScore: score, holdingPeriod: 'swing', horizonDays: 5, event: { type, title, date: dayIso(d), daysAway: d, polarity, importance, isBinary: type === 'earnings' }, note: 'fixture' });
  return {
    generatedAt: ago(4 * 60e3), signalsScanned: 64, symbolsWithCatalysts: 18,
    confluence: [sig('NVDA', 'long', 'product', 'GTC keynote', 3, 'bullish', 4, 82), sig('AVGO', 'long', 'analyst', 'Price target raised', 0, 'bullish', 3, 74), sig('PLTR', 'long', 'contract', 'DoD award', 1, 'bullish', 3, 69)],
    conflict: [sig('TSLA', 'long', 'delivery', 'Q3 deliveries miss whisper', 1, 'bearish', 4, 66), sig('AAPL', 'short', 'product', 'Launch event', 4, 'bullish', 3, 61)],
    eventRisk: [sig('MU', 'long', 'earnings', 'Q4 earnings', 1, 'binary', 5, 77), sig('NKE', 'short', 'earnings', 'Q1 earnings', 0, 'binary', 5, 63), sig('STZ', 'long', 'earnings', 'Q2 earnings', 5, 'binary', 4, 58)],
    unclaimed: [sig('LEVI', 'neutral', 'earnings', 'Q3 earnings', 6, 'binary', 3, 0), sig('PEP', 'neutral', 'earnings', 'Q3 earnings', 8, 'binary', 4, 0)],
    _meta: { note: 'test_harness_fixture' },
  };
}
function mockEarnings() {
  const rows: Array<[string, string, number, 'pre' | 'post', number | null]> = [['NKE', 'Nike Inc', 0, 'post', 0.52], ['MU', 'Micron Technology', 1, 'post', 1.74], ['STZ', 'Constellation Brands', 5, 'pre', 4.31], ['LEVI', 'Levi Strauss', 6, 'post', 0.31], ['PEP', 'PepsiCo', 7, 'pre', 2.29], ['DAL', 'Delta Air Lines', 7, 'pre', 1.52], ['CAG', 'Conagra Brands', 1, 'pre', 0.6], ['RIVN', 'Rivian', 2, 'post', -0.71], ['AYI', 'Acuity', 3, 'pre', 4.6]];
  return { asOf: ago(10 * 60e3), days: 7, count: rows.length, source: 'test_harness_fixture', events: rows.map(([symbol, companyName, d, session, epsForecast]) => ({ symbol, companyName, date: dayIso(d), session, epsForecast, daysAway: d })) };
}
function mockEcon() {
  const ev: Array<[string, number, string, string]> = [['ISM Manufacturing PMI', 0, '10:00', 'high'], ['JOLTS Job Openings', 0, '10:00', 'medium'], ['ADP Employment', 1, '08:15', 'medium'], ['Initial Jobless Claims', 2, '08:30', 'medium'], ['Nonfarm Payrolls', 3, '08:30', 'high'], ['Unemployment Rate', 3, '08:30', 'high'], ['FOMC Minutes', 7, '14:00', 'high'], ['CPI (MoM)', 9, '08:30', 'high']];
  return { upcoming: ev.map(([name, d, time, importance]) => ({ name, date: dayIso(d), time, importance, description: `${name} (fixture)`, tradingImpact: importance === 'high' ? 'Index vol expansion likely (fixture)' : 'Modest (fixture)' })), coverage: { source: 'test_harness_fixture', current: true } };
}
function mockCatalystsRecent(symbol?: string) {
  const syms = symbol ? [symbol, symbol, symbol] : ['NVDA', 'TSLA', 'MU', 'AAPL', 'PLTR', 'AMD', 'META'];
  const kinds = ['analyst_upgrade', 'earnings', 'product', 'guidance', 'contract', 'sec_filing', 'insider'];
  const catalysts = syms.map((s, i) => ({ id: `fx-cat-${i}`, symbol: s, timestamp: ago((i + 1) * 47 * 60e3), eventType: kinds[i % kinds.length], impact: i % 3 === 0 ? 'high' : i % 3 === 1 ? 'medium' : 'low', title: `${s} ${kinds[i % kinds.length].replace('_', ' ')} (fixture)`, description: `Synthetic ${kinds[i % kinds.length].replace('_', ' ')} headline for ${s} (fixture)`, source: 'test_harness_fixture', sentiment: i % 2 ? 'bearish' : 'bullish' }));
  return { asOf: ago(60e3), count: catalysts.length, catalysts, upcoming: [], recent: catalysts, symbol: symbol ?? null };
}
/** GET /api/crypto/ideas (crypto-ideas CryptoIdeasPayload). */
function mockCryptoIdeas() {
  const coins: Array<[string, number]> = [['BTC', 64210], ['ETH', 2480], ['SOL', 148], ['XRP', 0.58], ['DOGE', 0.12], ['AVAX', 27.4]];
  const ideas = coins.slice(0, 6).map(([symbol, px], i) => {
    const long = i % 3 !== 1; const s = long ? 1 : -1; const st = i < 3 ? 'open' : i === 3 ? 'hit_target' : i === 4 ? 'hit_stop' : 'open';
    return { id: `fx-cr-${i}`, symbol, direction: long ? 'long' : 'short', timestamp: ago((i + 1) * 3.3 * 36e5), setup: ['trend_pullback', 'range_fade', 'breakout'][i % 3], horizon: 'swing', grade: ['A', 'B', 'A', 'C', 'B', 'B'][i], points: 78 - i * 5,
      entry: px, entryZone: [+(px * 0.995).toPrecision(6), +(px * 1.005).toPrecision(6)] as [number, number], stop: +(px * (1 - s * 0.03)).toPrecision(6), t1: +(px * (1 + s * 0.04)).toPrecision(6), t2: +(px * (1 + s * 0.08)).toPrecision(6), rr: 1.8,
      timeStopAt: ago(-3 * 864e5), exitBy: ago(-5 * 864e5), why: `${symbol} ${long ? 'reclaimed' : 'lost'} the 4h mid-range (fixture)`, evidence: ['funding neutral (fixture)', 'OI rising (fixture)'], proxies: symbol === 'BTC' ? ['IBIT', 'MSTR', 'COIN'] : [],
      outcomeStatus: st, exitPrice: st === 'open' ? null : +(px * (st === 'hit_target' ? 1.04 : 0.97)).toPrecision(6), percentGain: st === 'open' ? null : st === 'hit_target' ? 4 : -3, resolutionReason: st === 'open' ? null : st };
  });
  return {
    asOf: ago(3 * 60e3), universe: coins.map((c) => c[0]), schedule: 'every 4h (fixture)', maxPerDay: 4, maxPerRun: 2,
    lastScan: { at: ago(25 * 60e3), coins: coins.map(([symbol, price], i) => ({ symbol, price, daily: i % 2 ? 'downtrend' : 'uptrend', h4: i % 3 ? 'range' : 'trend', fundingAprPct: +(4 + i * 1.7).toFixed(1), oiChangePct: +((i - 2) * 1.3).toFixed(1), plans: i < 3 ? [{ direction: i % 2 ? 'short' : 'long', setup: 'trend_pullback', grade: 'B' }] : [], notes: ['fixture'], sources: { spot: 'test_harness_fixture', spotAsOf: ago(25 * 60e3), perp: 'test_harness_fixture', perpAsOf: ago(25 * 60e3) } })), published: ['BTC', 'SOL'], skipped: ['DOGE'] },
    ideas,
    record: { n: 22, total: 26, open: 4, unresolvedClosed: 0, wins: 10, losses: 12, winRate: 45, avgR: 0.12, rCount: 22, firstAt: ago(30 * 864e5), lastAt: ago(36e5), lowN: true },
    gradeScale: 'A ≥ 75 · B ≥ 60 · C ≥ 45 (fixture)', provenance: 'test_harness_fixture',
  };
}
function mockCryptoSentiment() { return { asOf: ago(10 * 60e3), fearGreed: { value: 58, label: 'Greed', asOf: ago(10 * 60e3) }, btcDominance: 56.4, source: 'test_harness_fixture' }; }
function mockProxyCandidates() {
  const rows = [['BTC', 'IBIT', true, true], ['BTC', 'MSTR', true, false], ['BTC', 'COIN', true, true], ['BTC', 'MARA', true, false], ['ETH', 'ETHA', false, true]] as Array<[string, string, boolean, boolean]>;
  return { asOf: ago(4 * 60e3), eligible: rows.filter((x) => x[2] && x[3]).length, methodology: 'fixture: underlying 7d gate + proxy tape gate', rows: rows.map(([underlying, symbol, ug, tg], i) => ({ underlying, underlying7d: underlying === 'BTC' ? 4.2 : -1.1, underlyingGatePassed: ug, symbol, route: 'equity', proxyNet: +(1.2 - i * 0.6).toFixed(2), tapeGatePassed: tg, entry: 40 + i * 30, invalidation: 37 + i * 28, invalidationBasis: 'prior day low (fixture)', eligible: ug && tg, reason: ug && tg ? 'both gates pass (fixture)' : 'gate failed (fixture)' })) };
}
/** GET /api/leap-tracker (leaps-nexus LeapPayload). */
function mockLeaps() {
  const r = rng(321);
  const syms: Array<[string, string, string]> = [['NVDA', 'NVIDIA', 'semis'], ['MSFT', 'Microsoft', 'software'], ['AMZN', 'Amazon', 'internet'], ['GOOGL', 'Alphabet', 'internet'], ['AVGO', 'Broadcom', 'semis'], ['META', 'Meta Platforms', 'internet'], ['JPM', 'JPMorgan', 'banks'], ['LLY', 'Eli Lilly', 'pharma'], ['PLTR', 'Palantir', 'software'], ['COST', 'Costco', 'retail']];
  const picks = syms.map(([symbol, name, sectorLabel], i) => {
    const spot = +(80 + r() * 600).toFixed(2); const score = Math.round(92 - i * 4.5); const grade = (score >= 85 ? 'S' : score >= 75 ? 'A' : score >= 65 ? 'B' : 'C') as 'S' | 'A' | 'B' | 'C';
    return { symbol, name, grade, score, sectorLabel, sectorScore: Math.round(60 + r() * 35), trendScore: Math.round(55 + r() * 40), contractScore: Math.round(50 + r() * 45), strike: Math.round(spot * 1.1), expiry: '2028-01-21', entryPremium: +(spot * 0.12).toFixed(2), dte: 477, roiAtT1Pct: Math.round(40 + r() * 60), roiAtT2Pct: Math.round(110 + r() * 120), spot, ivLabel: r() < 0.5 ? 'low' : 'normal', openInterest: Math.round(500 + r() * 9000), spreadPct: +(1 + r() * 4).toFixed(1), contractGrade: ['A', 'B', 'B', 'C'][i % 4], contractGradeScore: Math.round(60 + r() * 35), contractGradePartial: false, fundamentals: { profitable: i !== 8 } };
  });
  return { asOf: ago(8 * 60e3), sessionLabel: 'fixture session', isStale: false, spyChange: 0.42, scanned: 180, qualified: picks.length, picks, source: 'test_harness_fixture' };
}
/** GET /api/positions/live (positions-heatmap PositionsResponse). */
function mockPositionsLive() {
  const r = rng(555);
  const syms = ['NVDA', 'TSLA', 'AAPL', 'AMD', 'META', 'PLTR', 'COIN', 'MSFT', 'AMZN', 'SMCI', 'AVGO', 'SPY'];
  const rank = (p: number) => (p >= 15 ? 'fire' : p >= 6 ? 'hot' : p >= 1 ? 'warm' : p >= -2 ? 'cool' : p >= -8 ? 'frozen' : 'red') as 'fire' | 'hot' | 'warm' | 'cool' | 'frozen' | 'red';
  const positions = syms.map((symbol, i) => {
    const isOption = i % 3 !== 2; const dir = i % 4 === 1 ? 'short' : 'long'; const entry = +(isOption ? 1 + r() * 8 : 50 + r() * 400).toFixed(2);
    const pnlPct = +((r() - 0.42) * 40).toFixed(1); const spot = +(entry * (1 + (dir === 'long' ? 1 : -1) * pnlPct / 100)).toFixed(2);
    return { id: `fx-pos-${i}`, symbol, direction: dir as 'long' | 'short', assetType: isOption ? 'option' : 'stock', entry, spot, target: +(entry * 1.3).toFixed(2), stop: +(entry * 0.8).toFixed(2), pnlPct, pnlAbs: +(pnlPct * (isOption ? 3 : 12)).toFixed(2), daysActive: 1 + Math.floor(r() * 12), source: ['convictions', 'bot', 'flow', 'manual'][i % 4], status: 'open', daysToExpiry: isOption ? 3 + Math.floor(r() * 30) : null, isOption, strikePrice: isOption ? Math.round(100 + r() * 300) : null, optionType: isOption ? (dir === 'long' ? 'call' : 'put') : null, heatScore: Math.round(50 + pnlPct * 2), heatRank: rank(pnlPct) };
  });
  const sorted = [...positions].sort((a, b) => b.pnlPct - a.pnlPct);
  const count = (k: 'source' | 'assetType') => positions.reduce((m: Record<string, number>, p) => { m[p[k]] = (m[p[k]] ?? 0) + 1; return m; }, {});
  return { asOf: ago(45_000), summary: { total: positions.length, winners: positions.filter((p) => p.pnlPct > 0).length, losers: positions.filter((p) => p.pnlPct < 0).length, totalPnLPct: +(positions.reduce((a, p) => a + p.pnlPct, 0) / positions.length).toFixed(2), totalPnLAbs: +positions.reduce((a, p) => a + p.pnlAbs, 0).toFixed(2), hotCount: positions.filter((p) => p.heatRank === 'fire' || p.heatRank === 'hot').length, coldCount: positions.filter((p) => p.heatRank === 'frozen' || p.heatRank === 'red').length, bestPosition: sorted[0], worstPosition: sorted[sorted.length - 1], bySource: count('source'), byAssetType: count('assetType') }, positions };
}
/** GET /api/quant-bot/status (lib/bot/use-bot-status QuantBotStatus). */
function mockBotStatus() {
  const r = rng(808);
  const open = ['NVDA', 'AMD', 'META', 'TSLA', 'PLTR'].map((symbol, i) => {
    const entry = +(1.5 + r() * 5).toFixed(2); const cur = +(entry * (0.7 + r() * 0.7)).toFixed(2); const qty = 2 + i;
    return { id: `fx-bot-o${i}`, symbol, assetType: 'option', optionType: i === 3 ? 'put' : 'call', direction: 'long', strikePrice: 100 + i * 40, expiryDate: dayIso(9 + i), entryPrice: entry, currentPrice: cur, quantity: qty, targetPrice: +(entry * 1.6).toFixed(2), stopLoss: +(entry * 0.6).toFixed(2), useTrailingStop: i % 2 === 0, trailingStopPercent: i % 2 === 0 ? 20 : null, unrealizedPnL: +((cur - entry) * qty * 100).toFixed(2), unrealizedPnLPercent: +(((cur - entry) / entry) * 100).toFixed(1), entryTime: ago((i + 1) * 5 * 36e5), lastPriceUpdate: ago(2 * 60e3), runId: 'run-3', runLabel: 'Run 3', markAgeMin: 2, unmarked: false };
  });
  const closed = ['AAPL', 'MSFT', 'COIN', 'AVGO', 'SMCI', 'AMZN', 'GOOGL'].map((symbol, i) => {
    const entry = +(1.5 + r() * 5).toFixed(2); const exit = +(entry * (0.6 + r() * 0.9)).toFixed(2);
    return { id: `fx-bot-c${i}`, symbol, assetType: 'option', optionType: 'call', direction: 'long', strikePrice: 150 + i * 20, expiryDate: dayIso(-2 - i), entryPrice: entry, currentPrice: exit, quantity: 3, targetPrice: +(entry * 1.6).toFixed(2), stopLoss: +(entry * 0.6).toFixed(2), entryTime: ago((i + 2) * 864e5), exitPrice: exit, exitTime: ago((i + 1) * 864e5), exitReason: exit >= entry ? 'target' : 'stop', realizedPnL: +((exit - entry) * 300).toFixed(2), runId: 'run-3', runLabel: 'Run 3' };
  });
  const realized = closed.reduce((a, p) => a + (p.realizedPnL ?? 0), 0); const unreal = open.reduce((a, p) => a + (p.unrealizedPnL ?? 0), 0);
  const posVal = open.reduce((a, p) => a + p.currentPrice * p.quantity * 100, 0); const cash = 100000 + realized - open.reduce((a, p) => a + p.entryPrice * p.quantity * 100, 0);
  const total = +(cash + posVal).toFixed(2);
  return {
    portfolioId: 'fixture-bot', name: 'Quant Bot', label: 'Run 3 · 100K · Sep 24– (fixture)', startingCapital: 100000, cashBalance: +cash.toFixed(2), totalValue: total, totalPnL: +(total - 100000).toFixed(2), totalPnLPercent: +(((total - 100000) / 100000) * 100).toFixed(2), closedCount: closed.length,
    openPositions: open, closedPositions: closed,
    runs: [{ id: 'run-3', name: 'run-3', displayName: 'Run 3', runNo: 3, label: 'Run 3 · 100K · Sep 24–', short: 'R3', start: '2026-09-24', end: null, active: true, startingCapital: 100000, cashBalance: +cash.toFixed(2), positionsValue: +posVal.toFixed(2), totalValue: total, storedTotalValue: total, realizedPnL: +realized.toFixed(2), unrealizedPnL: +unreal.toFixed(2), closed: closed.length, open: open.length, unmarked: 0, oldestMarkAt: ago(3 * 60e3) }],
    config: { minConviction: 70, maxOpen: 6, riskPerTradePct: 1, maxProgressPct: 80 }, repricedAt: ago(2 * 60e3),
    lastCycle: { at: ago(4 * 60e3), origin: 'fixture', opened: 1, closed: 0, openCount: open.length },
  };
}
function mockDisciplineLedger() {
  const rows: Array<[string, string, string, number | null]> = [['TSLA', 'BTC-proxy mirror rule', 'would_win', 4.1], ['SMCI', 'stop too wide', 'would_lose', -3.2], ['COIN', 'BTC-proxy mirror rule', 'would_lose', -2.4], ['RIVN', 'low liquidity', 'would_win', 2.8], ['MARA', 'stale quote', 'pending', null], ['SOFI', 'max open reached', 'would_win', 1.6]];
  const entries = rows.map(([symbol, reason, outcome, w], i) => ({ symbol, blockedAt: ago((i + 1) * 9 * 36e5), entryPrice: 20 + i * 15, stopLoss: 19 + i * 14, targetPrice: 23 + i * 17, reason, outcome, wouldBePercent: w, lastPrice: 21 + i * 15 }));
  return { totalBlocked: entries.length, decided: 5, blockedWinners: 3, blockedLosers: 2, netWouldBePercent: 2.9, entries, source: 'test_harness_fixture' };
}
function mockOutcomeModel() {
  const slice = (name: string, d: number, w: number) => ({ name, decided: d, win: w, loss: d - w, unresolved: Math.round(d * 0.3), coverage: 0.73, winRate: +((w / d) * 100).toFixed(1), averageR: +(((w / d) - 0.4) * 1.2).toFixed(3), sampleSize: d });
  return {
    model: 'outcome-model v2 (fixture)', totalPublished: 120, outcomes: { win: 37, loss: 51, unresolved: 32, decided: 88, winRate: 42 }, coverage: { measured: 88, unresolved: 32, pctMeasured: 73 },
    expectancy: { averageR: 0.137, sampleSize: 88, definition: 'mean realised R per decided idea (fixture)' }, dataQuality: { excludedFromTraining: 6, measuredTimeouts: 9, unmeasuredTimeouts: 3 },
    diagnostics: { byDirection: [slice('long', 61, 27), slice('short', 27, 10)], byHorizon: [slice('day', 30, 12), slice('swing', 58, 25)], bySource: [slice('convictions', 50, 22), slice('flow', 22, 8), slice('lotto', 16, 7)], warning: 'n < 100 — fixture' },
    asOf: ago(6 * 60e3),
  };
}
function mockOptionsFlow(symbol: string | null) {
  const t = mockFlowTape(symbol).rows;
  return { trades: t.slice(0, 30).map((x) => ({ ...x, detectedAt: x.at, timestamp: x.at, contractType: x.optionType, expirationDate: x.expiry, totalPremium: x.premium, volume: x.size, flowType: x.kind, sentiment: x.optionType === 'call' ? 'bullish' : 'bearish' })), stats: { total: 30, callPremium: 1.2e7, putPremium: 0.7e7 }, source: 'test_harness_fixture' };
}
function mockMarketPulse() { return { asOf: ago(60e3), macro: { yield10Y: 4.12, yieldDirection: 'FALLING', vix: 16.2, vixState: 'low vol', dxy: 101.4 }, regime: { label: 'risk-on (fixture)' }, source: 'test_harness_fixture' }; }
function mockMarketRegime() { return { current: 'risk-on (fixture)', indicators: { vix: 16.2 }, asOf: ago(60e3), source: 'test_harness_fixture' }; }
function mockExtendedHours() {
  const q = (symbol: string, changePct: number, lastPrice: number) => ({ symbol, name: symbol, lastPrice, price: lastPrice, changePct, volume: 1_200_000, asOf: ago(60e3), isCurrent: true });
  return {
    asOf: ago(60e3), session: 'regular', isStale: false, interpretation: 'Regular session — fixture tape.', source: 'test_harness_fixture',
    assetClasses: [{ key: 'spx', label: 'S&P 500', symbol: 'SPY', changePct: 0.42, stance: 'risk-on' }, { key: 'ndx', label: 'Nasdaq 100', symbol: 'QQQ', changePct: 0.61, stance: 'risk-on' }, { key: 'rut', label: 'Russell 2000', symbol: 'IWM', changePct: -0.18, stance: null }, { key: 'bonds', label: '20Y Treasuries', symbol: 'TLT', changePct: 0.22, stance: null }, { key: 'gold', label: 'Gold', symbol: 'GLD', changePct: -0.35, stance: null }, { key: 'btc', label: 'Bitcoin', symbol: 'IBIT', changePct: 1.8, stance: 'risk-on' }].map((a) => ({ ...a, lastPrice: 100, isCurrent: true })),
    gainers: [q('PLTR', 4.8, 31.2), q('NVDA', 2.4, 128.4), q('SMCI', 3.6, 44.1), q('META', 1.1, 590.2), q('AVGO', 1.9, 171.3)],
    losers: [q('TSLA', -3.1, 241.7), q('AMD', -1.4, 154.2), q('COIN', -0.6, 210.8), q('NKE', -2.2, 81.4), q('INTC', -1.7, 22.3)],
    mostActive: [q('NVDA', 2.4, 128.4), q('TSLA', -3.1, 241.7), q('AAPL', 0.2, 227.5), q('AMD', -1.4, 154.2), q('PLTR', 4.8, 31.2)],
  };
}
function mockExtendedSymbol(symbol: string) { return { symbol, lastPrice: 128.4, previousClose: 125.4, changePct: 2.39, session: 'regular', asOf: ago(60e3), isCurrent: true, volume: 31_400_000, isExtended: false }; }
function mockLastPrice(symbol: string) {
  const base: Record<string, number> = { SPY: 576.12, QQQ: 498.12, BTC: 64210, ETH: 2480, NVDA: 128.4 };
  return { symbol, price: base[symbol] ?? +(50 + (symbol.charCodeAt(0) % 20) * 17.3).toFixed(2), asOf: ago(5_000), source: 'test_harness_fixture', live: false };
}
function mockWatchlist() { return ['NVDA', 'SPY', 'TSLA', 'AAPL', 'AMD', 'META', 'PLTR', 'QQQ'].map((symbol, i) => ({ id: `fx-wl-${i}`, symbol, assetType: 'stock', addedAt: ago((i + 1) * 864e5), userId: 'audit-user' })); }

const HARNESS_BANNER ='<div aria-hidden="true" data-harness style="position:fixed;inset:0;z-index:2147483646;pointer-events:none;display:grid;place-items:center;overflow:hidden"><div style="transform:rotate(-24deg);font:800 64px/1.1 system-ui,sans-serif;letter-spacing:.08em;color:rgba(255,64,64,.14);text-align:center;white-space:nowrap">TEST HARNESS<br><span style="font-size:22px;letter-spacing:.04em">synthetic fixtures · not market data</span></div></div><div aria-hidden="true" data-harness style="position:fixed;left:50%;top:0;transform:translateX(-50%);z-index:2147483647;pointer-events:none;padding:2px 12px;border-radius:0 0 8px 8px;background:#b91c1c;color:#fff;font:700 11px/1.6 system-ui,sans-serif;letter-spacing:.06em">TEST HARNESS · SYNTHETIC FIXTURES · NOT MARKET DATA</div>';

const TYPES: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
function serve(): Promise<http.Server> {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error(`no build at ${DIST} — run npm run build first`);
  const user = { id: 'audit-user', email: 'audit@example.test', firstName: 'Audit', hasBetaAccess: true, isAdmin: false, subscriptionTier: 'pro' };
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x'); const p = url.pathname;
    const json = (code: number, body: unknown) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (p.startsWith('/api/')) {
      if (p === '/api/auth/me' || p === '/api/auth/user') return process.env.AUDIT_SIGNED_OUT ? json(401, { error: 'test harness: signed out' }) : json(200, user);
      if (p === '/api/premarket/gappers') return json(200, mockGappers());
      const m = p.match(/^\/api\/gex-vex\/terminal\/([^/]+)/);
      if (m) return json(200, mockTerminal(decodeURIComponent(m[1]).toUpperCase()));
      if (p === '/api/convictions') return json(200, mockConvictions());
      if (p === '/api/weekly-path/SPY') return json(200, mockWeeklyPath());
      if (p === '/api/sector-rotation') return json(200, mockRotation());
      if (p === '/api/crypto/pulse') return json(200, mockPulse());
      if (p === '/api/public/showcase') return json(200, mockShowcase());
      if (p === '/api/performance/model-record') return json(200, mockRecord());
      if (p === '/api/index-scalps') return json(200, mockIndexDesk());
      if (p.startsWith('/api/quotes/batch/')) return json(200, mockQuotes(decodeURIComponent(p.slice('/api/quotes/batch/'.length)).split(',').filter(Boolean)));
      if (p === '/api/historical-prices/SPY') return json(200, mockBars());
      const hp = p.match(/^\/api\/historical-prices\/([^/]+)/);
      if (hp) return json(200, mockHistory(decodeURIComponent(hp[1]).toUpperCase(), url.searchParams.get('range') ?? '1mo', url.searchParams.get('interval') ?? '5m'));
      const co = p.match(/^\/api\/chart\/overlays\/([^/]+)/);
      if (co) { const sym = decodeURIComponent(co[1]).toUpperCase(); const h = sym === 'SPY' ? mockBars().data : mockHistory(sym, '1mo', '5m').data; return json(200, mockOverlays(sym, Number(url.searchParams.get('spot')) || h[h.length - 1]?.close || 575)); }
      if (p === '/api/flow/tape') return json(200, mockFlowTape(url.searchParams.get('symbol')));
      if (p === '/api/journal/trades') return json(200, mockJournalTrades());
      if (p === '/api/journal/analytics') return json(200, { timingByHour: [], timingByDay: [], timingBySession: [], insights: [], dteBreakdown: [], tradeCountOptimum: [], emotionAnalysis: [] });
      if (p === '/api/journal/notes') return json(200, { notes: [], count: 0 });
      if (p === '/api/sector-ignition') return json(200, mockSectorIgnition(url.searchParams.get('horizon') ?? 'daily'));
      if (p === '/api/catalysts/board') return json(200, mockCatalystBoard());
      if (p === '/api/earnings/calendar') return json(200, mockEarnings());
      if (p === '/api/economic-calendar') return json(200, mockEcon());
      if (p === '/api/catalysts/recent') return json(200, mockCatalystsRecent());
      const cs = p.match(/^\/api\/catalysts\/symbol\/([^/]+)/);
      if (cs) return json(200, mockCatalystsRecent(decodeURIComponent(cs[1]).toUpperCase()));
      if (p === '/api/crypto/ideas') return json(200, mockCryptoIdeas());
      if (p === '/api/crypto/sentiment') return json(200, mockCryptoSentiment());
      if (p === '/api/crypto/proxy-candidates') return json(200, mockProxyCandidates());
      if (p === '/api/leap-tracker') return json(200, mockLeaps());
      if (p === '/api/positions/live') return json(200, mockPositionsLive());
      if (p === '/api/quant-bot/status') return json(200, mockBotStatus());
      if (p === '/api/discipline/ledger') return json(200, mockDisciplineLedger());
      if (p === '/api/performance/outcome-model') return json(200, mockOutcomeModel());
      if (p === '/api/options-flow') return json(200, mockOptionsFlow(url.searchParams.get('symbol')));
      if (p === '/api/market-pulse') return json(200, mockMarketPulse());
      if (p === '/api/market-regime') return json(200, mockMarketRegime());
      if (p === '/api/extended-hours') return json(200, mockExtendedHours());
      const eh = p.match(/^\/api\/extended-hours\/([^/]+)/);
      if (eh) return json(200, mockExtendedSymbol(decodeURIComponent(eh[1]).toUpperCase()));
      const lp = p.match(/^\/api\/last-price\/([^/]+)/);
      if (lp) return json(200, mockLastPrice(decodeURIComponent(lp[1]).toUpperCase()));
      if (p === '/api/watchlist') return json(200, mockWatchlist());
      if (p === '/api/realtime-status') return json(200, { coinbase: { connected: true, symbols: 6, lastUpdate: ago(2_000) }, futures: { connected: true, symbols: 4, lastUpdate: ago(3_000) }, prices: { crypto: {}, futures: {} } });
      if (p === '/api/automations/status') return json(200, { bots: [{ name: 'quant-bot (fixture)', status: 'active' }, { name: 'crypto-scan (fixture)', status: 'active' }, { name: 'leap-scan (fixture)', status: 'idle' }] });
      if (p === '/api/pulse') return json(200, { events: [{ id: 3, at: ago(60e3), kind: 'scan', msg: 'fixture: convictions rescanned' }, { id: 2, at: ago(6 * 60e3), kind: 'bot', msg: 'fixture: bot marked 5 positions' }, { id: 1, at: ago(15 * 60e3), kind: 'flow', msg: 'fixture: flow tape synced' }] });
      if (p === '/api/health') return json(200, { status: 'ok', source: 'test_harness_fixture', timestamp: new Date().toISOString(), uptime: 3600 });
      if (p === '/api/csrf-token') return json(200, { csrfToken: 'test-harness-fixture' });
      if (p === '/api/tracking/pageview') return json(200, { ok: true });
      if (p === '/api/preferences' || /^\/api\/user\/[^/]+\/preferences$/.test(p)) return json(200, { layoutDensity: 'comfortable', sidebarCollapsed: false, dashboardPreset: 'default', favoritePages: [], theme: 'dark', compactMode: false });
      if (/^\/api\/user\/[^/]+\/layouts$/.test(p)) return json(200, []);
      return json(404, { error: `test harness: no fixture for ${p}` });
    }
    let f = path.join(DIST, p);
    if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, 'index.html');
    if (f.endsWith('index.html')) { res.writeHead(200, { 'content-type': 'text/html' }); res.end(fs.readFileSync(f, 'utf8').replace('<body>', '<body>' + HARNESS_BANNER)); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((ok) => srv.listen(PORT, '127.0.0.1', () => ok(srv)));
}

/* ── the in-page audit (runs in the browser) ── */
function pageAudit(opts: { touch: boolean; phone: boolean }) {
  const W = innerWidth;
  const main = (document.getElementById('main-content') || document.body) as HTMLElement;
  const isVis = (el: Element) => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.05;
  };
  const name = (el: Element) => ((el.getAttribute('aria-label') || (el as HTMLElement).innerText || (el as HTMLElement).className?.toString?.() || el.tagName) + '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const where = (el: Element) => { const s = el.closest('[data-tool],.pg-sec,nav,header,aside,footer,[role=dialog]'); return s ? ((s as HTMLElement).dataset?.tool || s.tagName.toLowerCase() + (s.getAttribute('aria-label') ? `[${s.getAttribute('aria-label')}]` : '')) : 'page'; };

  // overflow
  const overflowX = Math.max(document.documentElement.scrollWidth - W, main.scrollWidth - main.clientWidth);

  // controls
  const ctrlSel = 'button, a[href], [role=button], [role=tab], [role=menuitem], [role=switch], input:not([type=hidden]), select, textarea, summary';
  const ctrls = Array.from(document.querySelectorAll(ctrlSel)).filter(isVis);
  const smallTargets: string[] = [];
  if (opts.touch) {
    for (const el of ctrls) {
      if (el.closest('.gx-table, .gxp-table') && el.classList.contains('gx-cell')) continue; // matrix data cells: tap-to-drill data, not controls
      if (el.tagName === 'A' && el.closest('p')) continue; // inline links in prose (WCAG 2.5.8 exception)
      if (el.closest('.sr-only') || el.getBoundingClientRect().width <= 2) continue; // visually hidden until focused (skip link)
      const box = (el.matches('input[type=checkbox],input[type=radio]') ? el.closest('label') || el : el).getBoundingClientRect();
      // phones (≤ 767px): 44×44 (Apple HIG / WCAG 2.5.5); tablets: the 32px desktop floor
      const min = innerWidth <= 767 ? 44 : 32;
      if (box.width < min || box.height < min) smallTargets.push(`${name(el)} ${Math.round(box.width)}×${Math.round(box.height)} @${where(el)}`);
    }
  }

  // text runs
  const runs: HTMLElement[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set<Element>();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent?.trim(); const p = n.parentElement;
    if (!t || !p || seen.has(p)) continue;
    if (p.closest('script,style,noscript,svg,[aria-hidden=true],.sr-only')) continue;
    if (!isVis(p)) continue;
    seen.add(p); runs.push(p);
  }

  // body text (phones)
  const smallBody: string[] = [];
  if (opts.phone) {
    for (const el of runs) {
      const own = Array.from(el.childNodes).filter((c) => c.nodeType === 3).map((c) => c.textContent).join('').trim();
      if (own.length < 40) continue;
      const cs = getComputedStyle(el);
      if (/mono/i.test(cs.fontFamily)) continue;
      const f = parseFloat(cs.fontSize);
      if (f < 14) smallBody.push(`${f}px "${own.slice(0, 34)}…" <${el.tagName.toLowerCase()}.${(el.className?.toString?.() ?? '').trim().split(/\s+/).slice(0, 2).join('.')}> @${where(el)}`);
    }
  }

  // icon-only controls
  const unlabeled: string[] = []; const noTooltip: string[] = [];
  for (const el of ctrls) {
    if (el.matches('input,select,textarea')) continue;
    const txt = ((el as HTMLElement).innerText || '').trim();
    if (txt.length > 0) continue;
    const labelled = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
    // title, a described-by tooltip, or a Radix tooltip trigger (HoverHint: data-state on the trigger)
    const tip = el.getAttribute('title') || el.getAttribute('aria-describedby') || el.getAttribute('data-tooltip') || el.hasAttribute('data-state');
    const id = `${(el.outerHTML.match(/class="([^"]*)"/)?.[1] ?? el.tagName).slice(0, 40)} @${where(el)}`;
    if (!labelled && !el.getAttribute('title')) unlabeled.push(id);
    else if (!tip) noTooltip.push(`${labelled ?? ''} ${id}`.trim());
  }

  // contrast
  const parse = (c: string) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (m) { const [r, g, b, a = '1'] = m[1].split(/[ ,/]+/).filter(Boolean); return [+r, +g, +b, +a] as [number, number, number, number]; }
    const k = c.match(/color\(srgb ([^)]+)\)/); // color-mix() results serialise as color(srgb r g b / a), 0–1
    if (k) { const [r, g, b, a = '1'] = k[1].split(/[ /]+/).filter(Boolean); return [+r * 255, +g * 255, +b * 255, +a] as [number, number, number, number]; }
    return null;
  };
  const lum = ([r, g, b]: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const over = (top: number[], bot: number[]) => { const a = top[3]; return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1]; };
  const bgOf = (el: Element): number[] | null => {
    const layers: number[][] = [];
    for (let e: Element | null = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && !/^linear-gradient\(\s*(rgba?\([^)]*\))\s*,\s*\1\s*\)$/.test(cs.backgroundImage)) return null;
      const c = parse(cs.backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 0.999) break; }
    }
    let base = [255, 255, 255, 1];
    const rootBg = parse(getComputedStyle(document.documentElement).backgroundColor);
    if (rootBg && rootBg[3] > 0) base = rootBg;
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  };
  const lowContrast: string[] = []; let checked = 0;
  for (const el of runs) {
    if (el.closest('[disabled],[aria-disabled=true],.gx-cell')) continue; // matrix cells: fill colour IS the datum, ink chosen per fill (gex-colors rampInk)
    const r = el.getBoundingClientRect(); if (r.bottom < -2000 || r.top > innerHeight + 4000) continue;
    const cs = getComputedStyle(el); const fg = parse(cs.color); if (!fg) continue;
    const bg = bgOf(el); if (!bg) continue;
    const fgc = fg[3] < 1 ? over(fg, bg) : fg;
    const L1 = lum(fgc), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize); const bold = parseInt(cs.fontWeight) >= 700;
    const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    checked++;
    if (ratio < need - 0.005) lowContrast.push(`${ratio.toFixed(2)} "${(el.innerText || '').trim().slice(0, 24)}" ${cs.color}→${`rgb(${bg.slice(0, 3).map(Math.round).join(',')})`} @${where(el)}`);
  }
  // readability on phones (operator 2026-09-29): matrix cells ≥ 13px, strikes ≥ 14px,
  // headers ≥ 12px, rows ≥ 36px, section titles ≥ 16px, no visible text under 12px
  const readability: string[] = [];
  if (opts.phone) {
    const px = (el: Element) => parseFloat(getComputedStyle(el).fontSize);
    const need = (sel: string, min: number, what: string, measure: (e: Element) => number = px) => {
      const bad = Array.from(document.querySelectorAll(sel)).filter(isVis).filter((e) => measure(e) < min - 0.01);
      if (bad.length) readability.push(`${bad.length}× ${what} < ${min}px (e.g. ${measure(bad[0]).toFixed(1)}px @${where(bad[0])})`);
    };
    need('.gx-cell', 13, 'GEX matrix cell text');
    need('.gx-strike b', 14, 'GEX strike label');
    need('.gx-table thead th', 12, 'GEX expiry header');
    need('.gx-row', 36, 'GEX matrix row height', (e) => e.getBoundingClientRect().height);
    need('.gxp-table tbody tr', 36, 'GEX phone matrix row height', (e) => e.getBoundingClientRect().height);
    need('.pg-sec-head h2, .fd-tool-title > span:first-child', 16, 'section/card title');
    const tiny = runs.filter((el) => !el.closest('[data-harness],svg') && parseFloat(getComputedStyle(el).fontSize) < 12 - 0.01);
    if (tiny.length) readability.push(`${tiny.length}× text < 12px (e.g. ${parseFloat(getComputedStyle(tiny[0]).fontSize)}px "${(tiny[0].innerText || '').trim().slice(0, 20)}" <${tiny[0].tagName.toLowerCase()}.${(tiny[0].className?.toString?.() ?? '').split(' ')[0]}> @${where(tiny[0])})`);
  }

  // scroll affordance (desktop workspaces): every tile whose content overflows has its
  // ONE scroller marked (focusable, always-visible scrollbar, fade + "more" cue)
  const hiddenScroll: string[] = [];
  if (!opts.phone) {
    document.querySelectorAll('.fd-tile').forEach((tile) => {
      Array.from(tile.querySelectorAll<HTMLElement>('*')).forEach((e) => {
        if (e.scrollHeight <= e.clientHeight + 4 || e.clientHeight < 60) return;
        const cs = getComputedStyle(e);
        if (cs.overflowY !== 'auto' && cs.overflowY !== 'scroll') return;
        const marked = e.classList.contains('fd-tile-scroller') || e.classList.contains('gx-scroll');
        if (!marked || cs.scrollbarWidth === 'none') hiddenScroll.push(`${(e.className?.toString?.() ?? e.tagName).slice(0, 40)} @${where(e)}`);
      });
    });
  }
  // phones: descriptions / method notes / long provenance lines are behind the ⓘ
  const descVisible: string[] = [];
  let firstViewChars = 0;
  if (opts.phone) {
    const DESC = '.fd-tool-blurb, .pg-prov, .fd-prov, .fd-age, .lx-page-purpose, .lx-panel-sub, [data-phone-note]:not(.open) > .qp-note-body';
    for (const el of Array.from(document.querySelectorAll(DESC))) {
      if (!isVis(el) || el.closest('[role=dialog]')) continue;
      descVisible.push(`"${((el as HTMLElement).innerText || '').trim().slice(0, 40)}" <${el.className.toString().split(' ')[0]}> @${where(el)}`);
    }
    // first-viewport text, counted as the eye sees it (clip-aware, per rendered line)
    const H = innerHeight;
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const t = (n.textContent || '').replace(/\s+/g, ' ').trim(); const p = n.parentElement;
      if (!t || !p || p.closest('script,style,noscript,[aria-hidden=true],.sr-only,[data-harness]')) continue;
      const cs = getComputedStyle(p); if (cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) continue;
      const range = document.createRange(); range.selectNodeContents(n);
      const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
      if (!rects.length) continue;
      const clips: DOMRect[] = [];
      for (let a: Element | null = p; a && a !== document.body; a = a.parentElement) {
        const acs = getComputedStyle(a);
        if (acs.overflowX !== 'visible' || acs.overflowY !== 'visible') clips.push(a.getBoundingClientRect());
      }
      const seen = rects.filter((r) => r.bottom > 0 && r.top < H && r.right > 0 && r.left < W && clips.every((c) => r.bottom > c.top + 1 && r.top < c.bottom - 1 && r.right > c.left + 1 && r.left < c.right - 1));
      firstViewChars += Math.round(t.length * seen.length / rects.length);
    }
  }
  return { overflowX, controls: ctrls.length, smallTargets, smallBody, unlabeled, noTooltip, lowContrast, textRuns: checked, readability, hiddenScroll, descVisible, firstViewChars };
}

async function focusAudit(page: any) {
  const missing: string[] = [];
  await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur?.(); window.scrollTo(0, 0); });
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab');
    const r = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      // a ring is visible when at least one of its colours is not fully transparent
      const visible = (c: string) => (c.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}/gi) ?? []).some((x) => !/rgba\([^)]*,\s*0\)$/.test(x));
      const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 && visible(cs.outlineColor)) || (cs.boxShadow && cs.boxShadow !== 'none' && visible(cs.boxShadow));
      return { ring, id: `${(el.getAttribute('aria-label') || el.innerText || el.className?.toString?.() || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 30)}` };
    });
    if (r && !r.ring) missing.push(r.id);
  }
  return missing;
}

async function run() {
  const pw = loadPlaywright();
  const srv = await serve();
  const browser = await pw.chromium.launch({ headless: true });
  const results: any[] = [];
  const t0 = Date.now();
  try {
    for (const size of sizes) {
      for (const mode of modes) {
        const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, hasTouch: size.touch, isMobile: size.w < 768, deviceScaleFactor: 1 });
        // tsx/esbuild keepNames wraps functions in __name(); give the page a no-op one
        await ctx.addInitScript({ content: 'window.__name = window.__name || ((f) => f);' });
        await ctx.addInitScript((m: string) => {
          try { localStorage.setItem('qe-mode', m); localStorage.setItem('qe-onboarded-v1', '2026-09-29'); } catch { /* ignore */ }
        }, mode);
        const page = await ctx.newPage();
        for (const pg of pages) {
          const row: any = { page: pg.name, path: pg.path, size: `${size.w}x${size.h}`, sizeLabel: size.label, mode, readOnly: !!pg.readOnly };
          try {
            await page.goto(BASE + pg.path, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(2500);
            // scroll the page (the shell's <main>) so lazy sections mount, then back to top
            await page.evaluate(async () => {
              const m = document.getElementById('main-content') || document.scrollingElement!;
              for (let y = 0; y < m.scrollHeight; y += 500) { m.scrollTop = y; await new Promise((r) => setTimeout(r, 120)); }
              m.scrollTop = 0;
            });
            await page.waitForTimeout(1200);
            Object.assign(row, await page.evaluate(pageAudit, { touch: size.touch, phone: size.w < 600 }));
            row.focusMissing = await focusAudit(page);
          } catch (e) {
            row.error = e instanceof Error ? e.message : String(e);
          }
          row.pass = {
            overflow: !row.error && row.overflowX <= 1,
            targets: !row.error && (row.smallTargets?.length ?? 0) === 0,
            bodyText: !row.error && (row.smallBody?.length ?? 0) === 0,
            focus: !row.error && (row.focusMissing?.length ?? 0) === 0,
            icons: !row.error && (row.unlabeled?.length ?? 0) === 0 && (row.noTooltip?.length ?? 0) === 0,
            contrast: !row.error && (row.lowContrast?.length ?? 0) === 0,
            readability: !row.error && (row.readability?.length ?? 0) === 0,
            scrollCue: !row.error && (row.hiddenScroll?.length ?? 0) === 0,
            noDesc: !row.error && (row.descVisible?.length ?? 0) === 0,
          };
          // WARN only (not a pass/fail check): phone first-viewport text over budget
          row.textBudgetWarn = size.w < 600 && !row.error && (row.firstViewChars ?? 0) > PHONE_TEXT_BUDGET;
          results.push(row);
          process.stderr.write(`${pg.name.padEnd(9)} ${row.size.padEnd(9)} ${mode.padEnd(8)} ${Object.entries(row.pass).map(([k, v]) => `${k}:${v ? 'ok' : 'FAIL'}`).join(' ')}${size.w < 600 ? ` text:${row.firstViewChars ?? '?'}${row.textBudgetWarn ? ' WARN>' + PHONE_TEXT_BUDGET : ''}` : ''}${row.error ? ' ERR ' + row.error : ''}\n`);
        }
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    srv.close();
  }
  const out = process.env.AUDIT_OUT ? path.resolve(process.env.AUDIT_OUT) : path.join(ROOT, 'research', 'device-audit.json');
  fs.writeFileSync(out, JSON.stringify({ ranAt: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), data: 'TEST HARNESS fixtures (research/device-audit.ts built-in server) — not market data', results }, null, 2));

  // table: page × size, one cell per mode = failing checks (counts)
  const checks = ['overflow', 'targets', 'bodyText', 'focus', 'icons', 'contrast', 'readability', 'scrollCue', 'noDesc'] as const;
  const count = (r: any, c: string) => ({ overflow: r.overflowX, targets: r.smallTargets?.length, bodyText: r.smallBody?.length, focus: r.focusMissing?.length, icons: (r.unlabeled?.length ?? 0) + (r.noTooltip?.length ?? 0), contrast: r.lowContrast?.length, readability: r.readability?.length, scrollCue: r.hiddenScroll?.length, noDesc: r.descVisible?.length } as any)[c];
  console.log(`\n| Page | Size | ${modes.join(' | ')} |\n|---|---|${modes.map(() => '---').join('|')}|`);
  for (const pg of pages) for (const s of sizes) {
    const cells = modes.map((m) => {
      const r = results.find((x) => x.path === pg.path && x.size === `${s.w}x${s.h}` && x.mode === m);
      if (!r) return '—'; if (r.error) return 'ERR';
      const fails = checks.filter((c) => !r.pass[c]);
      return fails.length ? 'FAIL ' + fails.map((c) => `${c}(${count(r, c)})`).join(' ') : 'PASS';
    });
    console.log(`| ${pg.name}${pg.readOnly ? ' (read-only)' : ''} | ${s.label} | ${cells.join(' | ')} |`);
  }
  const passed = results.filter((r) => !r.readOnly && Object.values(r.pass).every(Boolean)).length;
  const total = results.filter((r) => !r.readOnly).length;
  console.log(`\n${passed}/${total} page×size×mode combinations pass every check (Journal reported, not counted). Details: research/device-audit.json`);
  // phone first-viewport text budget — a WARNING list, per page × phone size (dark mode = the reference read)
  const phoneRows = results.filter((r) => r.mode === (modes.includes('dark') ? 'dark' : modes[0]) && Number(r.size.split('x')[0]) < 600 && !r.error);
  if (phoneRows.length) {
    console.log(`\nPhone first-viewport text (chars; budget ${PHONE_TEXT_BUDGET}, warn above):`);
    for (const r of phoneRows) console.log(`  ${r.page.padEnd(9)} ${r.size.padEnd(8)} ${String(r.firstViewChars).padStart(5)}${r.textBudgetWarn ? '  WARN over budget' : ''}`);
  }
}

if (process.env.AUDIT_SERVE_ONLY) {
  // Just the harness server (for looking at pages by hand): AUDIT_SERVE_ONLY=1 npx tsx research/device-audit.ts
  serve().then(() => console.log(`test harness on ${BASE} — synthetic fixtures, not market data`));
} else {
  run().catch((e) => { console.error(e); process.exit(1); });
}
