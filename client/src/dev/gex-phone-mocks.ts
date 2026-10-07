/**
 * DEV-ONLY fixtures for the /dev/gex-phone harness (never imported by a
 * production build: main.tsx loads this behind `import.meta.env.DEV`).
 *
 * Replaces window.fetch for /api/* with deterministic, realistic GEX payloads
 * (SPY / SPX / QQQ chains, ~61 strikes × 0–14 DTE plus longer expiries,
 * walls, gamma profile, hub plays, rankings + magnet setups, quotes) so the
 * real GEX workspace renders with no server and no database.
 */
import type { StrikeExpiryCell, GEXSnapshot } from '@shared/gex-types';
import { classifyGammaRegime } from '@shared/gex-regime';
import { getMostRecentId } from '@shared/changelog';

/* deterministic PRNG so every screenshot run draws the same book */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const NOW = Date.now();
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const labelFor = (dte: number) => { const d = new Date(NOW + dte * 86_400_000); return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}`; };
/** listed expiries: dailies for two weeks (no weekends), then monthlies/quarterlies */
const DTES = [0, 1, 2, 3, 4, 7, 8, 9, 10, 11, 14, 21, 28, 45, 77, 105, 168];

const BOOKS: Record<string, { spot: number; step: number; half: number; scale: number; seed: number; chg: number }> = {
  SPY: { spot: 668.42, step: 1, half: 30, scale: 1, seed: 7, chg: 0.62 },
  SPX: { spot: 6697.8, step: 5, half: 30, scale: 9, seed: 11, chg: 0.58 },
  QQQ: { spot: 601.15, step: 1, half: 30, scale: 0.7, seed: 23, chg: -0.41 },
  NVDA: { spot: 186.3, step: 2.5, half: 24, scale: 0.35, seed: 31, chg: 1.9 },
  TSLA: { spot: 438.9, step: 5, half: 24, scale: 0.3, seed: 41, chg: -2.3 },
};
const bookOf = (sym: string) => BOOKS[sym] ?? { spot: 100, step: 1, half: 20, scale: 0.05, seed: sym.length * 13, chg: 0.1 };

function matrixFor(sym: string): StrikeExpiryCell[] {
  const b = bookOf(sym);
  const r = rng(b.seed);
  const atm = Math.round(b.spot / b.step) * b.step;
  const out: StrikeExpiryCell[] = [];
  for (const dte of DTES) {
    const half = dte > 30 ? Math.round(b.half * 0.6) : b.half;
    const decay = 1 / Math.sqrt(1 + dte / 3);
    for (let i = -half; i <= half; i++) {
      const strike = +(atm + i * b.step).toFixed(2);
      const m = (strike - b.spot) / b.spot;
      // calls above spot (+), puts below (−); a big round-number node each side
      const bell = Math.exp(-((m * 100) ** 2) / (2 * (1.6 + dte * 0.25) ** 2));
      const round = strike % (b.step * 10) === 0 ? 2.4 : strike % (b.step * 5) === 0 ? 1.5 : 1;
      const sign = m > 0.002 ? 1 : m < -0.002 ? -1 : (r() > 0.5 ? 1 : -1);
      const noise = 0.55 + r() * 0.9;
      const g = sign * bell * round * noise * decay * 0.42 * b.scale * (sign < 0 ? 1.15 : 1);
      if (Math.abs(g) < 1e-5 && r() > 0.3) continue; // sparse far wings
      const v = (sign > 0 ? -1 : 1) * Math.abs(g) * (120 + r() * 80) * (dte > 7 ? 1.4 : 1);
      out.push({ strike, expiryLabel: labelFor(dte), dte, netGEX: +g.toFixed(5), netVEX: +v.toFixed(3), netGEXAdj: +(g * (0.7 + r() * 0.5)).toFixed(5) });
    }
  }
  return out;
}

function snapshotFor(sym: string, cells: StrikeExpiryCell[]): GEXSnapshot {
  const b = bookOf(sym);
  const byStrike = new Map<number, { net: number; call: number; put: number }>();
  for (const c of cells) {
    const e = byStrike.get(c.strike) ?? { net: 0, call: 0, put: 0 };
    e.net += c.netGEX; if (c.netGEX > 0) e.call += c.netGEX; else e.put += c.netGEX;
    byStrike.set(c.strike, e);
  }
  const strikes = [...byStrike.keys()].sort((a, z) => a - z);
  const above = strikes.filter((k) => k > b.spot); const below = strikes.filter((k) => k < b.spot);
  const callWall = above.reduce((m, k) => (byStrike.get(k)!.call > byStrike.get(m)!.call ? k : m), above[0]);
  const putWall = below.reduce((m, k) => (byStrike.get(k)!.put < byStrike.get(m)!.put ? k : m), below[0]);
  const maxG = strikes.reduce((m, k) => (Math.abs(byStrike.get(k)!.net) > Math.abs(byStrike.get(m)!.net) ? k : m), strikes[0]);
  const totalGEX = cells.reduce((s, c) => s + c.netGEX, 0);
  const totalVEX = cells.reduce((s, c) => s + c.netVEX, 0);
  const gross = cells.reduce((s, c) => s + Math.abs(c.netGEX), 0);
  const callGEX = cells.filter((c) => c.netGEX > 0).reduce((s, c) => s + c.netGEX, 0);
  const putGEX = cells.filter((c) => c.netGEX < 0).reduce((s, c) => s + c.netGEX, 0);
  const zeroGamma = +(b.spot * 0.9935).toFixed(2);
  const gammaProfile = Array.from({ length: 41 }, (_, i) => {
    const s = b.spot * (0.8 + i * 0.01);
    return { spot: +s.toFixed(2), netGEX: +(Math.tanh((s - zeroGamma) / (b.spot * 0.02)) * Math.abs(totalGEX) * 1.4).toFixed(4) };
  });
  const le7 = cells.filter((c) => c.dte <= 7).reduce((s, c) => s + c.netGEX, 0);
  const front = cells.filter((c) => c.dte === 0).reduce((s, c) => s + c.netGEX, 0);
  return {
    symbol: sym, spotPrice: b.spot, calculatedAt: NOW - 95_000,
    totalGEX, totalNetGEX: totalGEX, totalVEX, callGEX, putGEX, putCallRatio: Math.abs(putGEX) / (callGEX || 1),
    gammaFlipPrice: zeroGamma, zeroGammaLevel: zeroGamma, maxGammaStrike: maxG, callWall, putWall, zeroGammaProjection: maxG,
    unitsVersion: 2, grossGEX: gross, gexByScope: { all: totalGEX, frontExpiry: front, frontExpiryDays: 0, le7d: le7 },
    gammaProfile, callWallOI: callWall, putWallOI: putWall,
    regimeRead: classifyGammaRegime({ netGEX: totalGEX, grossGEX: gross, spot: b.spot, zeroGamma }),
    levels: [], regime: totalGEX >= 0 ? 'positive_gamma' : 'negative_gamma',
    source: 'tradier', expirationsUsed: DTES.map(labelFor),
  } as GEXSnapshot;
}

function candlesFor(sym: string) {
  const b = bookOf(sym); const r = rng(b.seed + 1);
  let p = b.spot * 0.99;
  return Array.from({ length: 130 }, (_, i) => {
    const o = p; p = p * (1 + (r() - 0.48) * 0.003);
    return { time: Math.floor((NOW - (130 - i) * 900_000) / 1000), open: o, high: Math.max(o, p) * 1.0008, low: Math.min(o, p) * 0.9992, close: p, volume: Math.round(1e5 + r() * 9e5) };
  });
}

const terminal = (sym: string) => {
  const cells = matrixFor(sym);
  return { symbol: sym, snapshot: snapshotFor(sym, cells), strikeExpiryMatrix: cells, candles: candlesFor(sym), generatedAt: new Date(NOW - 95_000).toISOString(), optionsSource: 'tradier_chain', cached: false, orbs: [], heatmap: [], projection: null, peers: [] };
};

const hub = () => ({
  generatedAt: new Date(NOW - 120_000).toISOString(),
  hub: {
    totalTickers: 42, attempted: 44, failedSymbols: ['BRK.B', 'XYZ'],
    topPlays: ['SPY', 'QQQ', 'NVDA', 'TSLA', 'SPX', 'AMD', 'META', 'AAPL', 'IWM', 'COIN'].map((s, i) => ({
      symbol: s, playScore: 92 - i * 6, regime: i % 3 === 1 ? 'negative_gamma' : 'positive_gamma', totalVEX: (i % 2 ? -1 : 1) * (420 - i * 31), spotPrice: bookOf(s).spot,
    })),
  },
});

const rankings = () => {
  const syms = ['SPY', 'QQQ', 'NVDA', 'TSLA', 'AMD', 'META', 'AAPL', 'IWM', 'COIN', 'PLTR'];
  const rows = syms.map((s, i) => {
    const b = bookOf(s);
    return {
      symbol: s, spot: b.spot, changePct: b.chg, iv30: 0.18 + i * 0.03, netGEX: (i % 3 === 1 ? -1 : 1) * (2.4 - i * 0.2), netVEX: (i % 2 ? -1 : 1) * (380 - i * 25), gexPlus: (i % 2 ? -1 : 1) * 1.1,
      grossGEX: 6 - i * 0.4, regime: i % 3 === 1 ? 'negative' : 'positive', nearFlip: i === 4, zeroGamma: b.spot * 0.99, zeroGammaDistPct: 1.0, nearExpiries: [labelFor(0), labelFor(1)],
      topStrike: Math.round(b.spot * 1.01), topStrikeGEX: 0.42, topStrikeShare: 0.18, topStrikeDistPct: 1.0, topStrikeVolume: 18000, topStrikeOI: 9000, topStrikeVolOI: 2.0,
      callWall: Math.round(b.spot * 1.02), putWall: Math.round(b.spot * 0.98), pinScore: 60 - i * 3, dataSource: 'tradier', openInterestDate: null,
      quoteTime: new Date(NOW - 200_000).toISOString(), fetchedAt: new Date(NOW - 200_000).toISOString(), ageSec: 200 + i * 30, stale: false,
    };
  });
  const setups = [
    { symbol: 'NVDA', side: 'call', strike: 190, dte: 1.2 },
    { symbol: 'TSLA', side: 'put', strike: 425, dte: 2.2 },
    { symbol: 'SPY', side: 'call', strike: 672, dte: 0.3 },
  ].map((s, i) => {
    const b = bookOf(s.symbol);
    return {
      ...s, expiry: new Date(NOW + s.dte * 86_400_000).toISOString().slice(0, 10), distPct: ((s.strike - b.spot) / b.spot) * 100, share: 0.22 - i * 0.04, sideRank: 1,
      volume: 42000 - i * 9000, openInterest: 15000, volOI: 2.8 - i * 0.5, changePct: b.chg, atmIvNear: 0.42, atmIv30: 0.38, ivTerm: 1.1,
      premium: { bid: 1.12, ask: 1.18, last: 1.15, mid: 1.15 }, score: 81 - i * 9,
      why: ['near-expiry γ concentrated just beyond spot', `opened today · ${(2.8 - i * 0.5).toFixed(1)}× vol/OI`, 'price moving toward the strike'],
      ageSec: 240, stale: false, dataSource: 'tradier', spot: b.spot,
    };
  });
  return {
    generatedAt: new Date(NOW - 240_000).toISOString(), rows,
    views: { negVex: syms.filter((_, i) => i % 2), lowGexPlus: syms.slice(0, 5), pins: syms.slice(2, 7) },
    setups, units: { gex: '$ per 1% move', vex: '$ per IV point', gexPlus: 'GEX + VEX' }, signConvention: 'naive-oi', signConventionNote: 'dealers long calls / short puts',
    dataSource: 'tradier', cycle: { inProgress: false, startedAt: null, finishedAt: null, attempted: 44, succeeded: 42, failed: 2, rateLimited: 0, aborted: null, nextRunAt: null },
    universe: { total: 44, sources: { watchlist: 10, liquid: 34 } }, persisted: { loadedFromDisk: false, savedAt: null },
  };
};

const quotes = (list: string) => ({
  quotes: Object.fromEntries(list.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).map((s) => {
    const b = bookOf(s); const price = +(b.spot * (1 + 0.0007)).toFixed(2);
    return [s, { price, change: +(price * b.chg / 100).toFixed(2), changePercent: b.chg, asOf: new Date(NOW - 4_000).toISOString() }];
  })),
});

const sectors = () => ({
  asOf: new Date(NOW - 300_000).toISOString(), sessionLabel: 'regular session',
  leaders: [{ etf: 'XLK', name: 'Tech', change: 1.4 }, { etf: 'XLY', name: 'Discretionary', change: 0.9 }, { etf: 'XLC', name: 'Comms', change: 0.6 }],
  laggards: [{ etf: 'XLU', name: 'Utilities', change: -1.1 }, { etf: 'XLE', name: 'Energy', change: -0.8 }, { etf: 'XLP', name: 'Staples', change: -0.4 }],
});

function route(path: string): unknown | undefined {
  const [p] = path.split('?');
  let m: RegExpMatchArray | null;
  if ((m = p.match(/^\/api\/gex-vex\/terminal\/([^/]+)$/))) return terminal(decodeURIComponent(m[1]).toUpperCase());
  if (p === '/api/gex-vex/hub') return hub();
  if (p === '/api/gex-vex/rankings') return rankings();
  if ((m = p.match(/^\/api\/quotes\/batch\/(.+)$/))) return quotes(decodeURIComponent(m[1]));
  if (p === '/api/watchlist') return ['SPY', 'SPX', 'QQQ', 'NVDA', 'TSLA'].map((symbol) => ({ symbol }));
  if (p === '/api/sector-rotation') return sectors();
  if (p === '/api/health') return { status: 'ok', timestamp: new Date().toISOString() };
  return undefined;
}

export function installGexPhoneMocks() {
  try {
    localStorage.setItem('qe-onboarded-v1', new Date().toISOString());
    const latest = getMostRecentId(); if (latest) localStorage.setItem('qe_changelog_seen', latest);
  } catch { /* storage blocked */ }
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const u = new URL(url, window.location.origin);
    if (u.origin !== window.location.origin || !u.pathname.startsWith('/api/')) return real(input, init);
    await new Promise((r) => setTimeout(r, 60));
    const body = route(u.pathname + u.search);
    if (body === undefined) return new Response(JSON.stringify({ error: 'not mocked in /dev/gex-phone' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  // no live sockets in the harness
  (window as unknown as { WebSocket: unknown }).WebSocket = class { readyState = 3; close() {} send() {} addEventListener() {} removeEventListener() {} } as unknown;
}
