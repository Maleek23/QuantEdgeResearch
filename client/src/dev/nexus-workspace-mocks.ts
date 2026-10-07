/**
 * DEV-ONLY fixtures for the /dev/nexus-workspace harness (never imported by a
 * production build: main.tsx loads this behind `import.meta.env.DEV`).
 *
 * Replaces window.fetch for /api/* with a deterministic NEXUS book — ranked
 * setups, a bot-held position, developing structures, market pulse, sector
 * ignition, tracked names, trader calls, candles and quotes — so the real
 * NEXUS workspace renders with no server and no database (screenshots).
 * Anything not mocked answers 404 and the tool shows its own error state.
 */
import { getMostRecentId } from '@shared/changelog';
import { setModePref } from '@/lib/visual-mode';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const NOW = Date.now();
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

const SPOTS: Record<string, { spot: number; chg: number; sector: string }> = {
  NVDA: { spot: 186.3, chg: 1.9, sector: 'Semiconductors' },
  AMD: { spot: 164.2, chg: 2.4, sector: 'Semiconductors' },
  MRVL: { spot: 84.6, chg: 3.1, sector: 'Semiconductors' },
  MSFT: { spot: 512.4, chg: 0.7, sector: 'Software' },
  CRWD: { spot: 488.1, chg: 1.2, sector: 'Cybersecurity' },
  TSLA: { spot: 438.9, chg: -2.3, sector: 'Autos' },
  META: { spot: 742.5, chg: 0.4, sector: 'Communication' },
  JPM: { spot: 301.8, chg: -0.6, sector: 'Financials' },
  XOM: { spot: 112.3, chg: -1.4, sector: 'Energy' },
  SPY: { spot: 668.42, chg: 0.62, sector: 'Index' },
  QQQ: { spot: 601.15, chg: 0.81, sector: 'Index' },
  PLTR: { spot: 178.9, chg: 4.2, sector: 'Software' },
  COIN: { spot: 342.6, chg: -3.1, sector: 'Financials' },
  TLT: { spot: 89.4, chg: -0.3, sector: 'Bonds' },
};
const spotOf = (s: string) => SPOTS[s] ?? { spot: 100, chg: 0.2, sector: 'Other' };

type Dir = 'long' | 'short';
const SETUPS: Array<[string, Dir, number, 'S' | 'A' | 'B' | 'C', string, string, number]> = [
  // symbol, side, score, band, source, state, minutes ago published
  ['NVDA', 'long', 88, 'S', 'breakout', 'triggered', 38],
  ['MRVL', 'long', 84, 'A', 'sector-rotation', 'pending_trigger', 55],
  ['AMD', 'long', 81, 'A', 'momentum', 'pending_trigger', 92],
  ['TSLA', 'short', 79, 'A', 'gex-magnet', 'triggered', 120],
  ['CRWD', 'long', 74, 'B', 'pattern', 'pending_trigger', 180],
  ['MSFT', 'long', 72, 'B', 'swing', 'pending_trigger', 240],
  ['XOM', 'short', 68, 'B', 'sector-rotation', 'pending_trigger', 300],
  ['JPM', 'short', 64, 'C', 'swing', 'pending_trigger', 26 * 60],
  ['PLTR', 'long', 77, 'A', 'flow', 'triggered', 70],
  ['META', 'long', 70, 'B', 'weekly', 'pending_trigger', 27 * 60],
];

function pick(n: number, [symbol, direction, score, band, source, state, ago]: (typeof SETUPS)[number]) {
  const { spot, sector } = spotOf(symbol);
  const long = direction === 'long';
  const entry = +(spot * (long ? 1.004 : 0.996)).toFixed(2);
  const stop = +(entry * (long ? 0.975 : 1.025)).toFixed(2);
  const target = +(entry * (long ? 1.06 : 0.94)).toFixed(2);
  const dte = [2, 5, 9, 14, 21][n % 5];
  const strike = Math.round(entry / 5) * 5;
  return {
    ideaId: `fx-${symbol.toLowerCase()}-${n}`, symbol, sector, direction, assetType: 'option', holdingPeriod: `${dte}d`, tradeType: 'swing',
    entryPrice: entry, targetPrice: target, stopLoss: stop, riskRewardRatio: +((target - entry) / (entry - stop)).toFixed(2),
    optionType: long ? 'call' : 'put', strikePrice: strike, entryPremium: +(spot * 0.021).toFixed(2), optionDte: dte,
    expiryDate: new Date(NOW + dte * 86_400_000).toISOString().slice(0, 10),
    convictionScore: score, convictionBand: band, layerCount: 6, publishedConvictionScore: score, publishedConvictionBand: band,
    layers: [
      { kind: 'technical', label: 'Trend + structure', points: 18, why: `${symbol} holds above the 20/50 EMA stack with a tight base.` },
      { kind: 'sector', label: 'Sector rotation', points: 12, why: `${sector} is ${long ? 'leading' : 'lagging'} SPY on the day.` },
      { kind: 'gex', label: 'Dealer gamma', points: 9, why: 'Nearest call wall sits above target; positive gamma under spot.' },
      { kind: 'regime', label: 'Regime', points: 8, why: 'Risk-on tape, VIX below 17.' },
      { kind: 'catalyst', label: 'Catalyst', points: 6, why: 'Analyst day next week.' },
      { kind: 'freshness', label: 'Freshness', points: 4, why: 'Published this session.' },
    ],
    thesis: `${symbol} ${long ? 'reclaims' : 'loses'} its range ${long ? 'high' : 'low'} with ${long ? 'call' : 'put'} flow building; trigger on a 5-min close through ${entry}.`,
    catalyst: 'Sector flow + structure', catalystSourceUrl: null,
    generatedAt: iso(ago * MIN), calledAt: iso(ago * MIN), triggeredAt: state === 'triggered' ? iso((ago - 10) * MIN) : null,
    source, currentPrice: +(spot * (1 + (n % 3 - 1) * 0.002)).toFixed(2), lifecycleState: state,
    exitBy: new Date(NOW + dte * 86_400_000).toISOString(), entryValidUntil: new Date(NOW + 6 * HOUR).toISOString(),
  };
}

const convictions = () => ({
  generatedAt: iso(40_000),
  marketContext: { regime: 'risk-on', riskSentiment: 'constructive', preferredDirection: 'long', score: 64, vixLevel: 16.4, reasons: ['Breadth improving: 62% above 50-day', 'Semis leading, energy lagging', '10Y easing from 4.21%'] },
  breadth: { regime: 'expanding', bias: 0.3, advanceDeclineRatio: 1.8, percentAbove200MA: 58, percentAbove50MA: 62, newHighsLows: 84, sampleSize: 500, interpretation: 'Participation broadening.' },
  geopolitical: { risk: 'low', activeScenarios: [] },
  totalCandidatesScanned: 812,
  picks: [
    ...SETUPS.map((s, n) => pick(n, s)),
    { ...pick(20, ['QQQ', 'long', 0, 'B', 'bot', 'executed', 6 * 60]), ideaId: 'fx-bot-qqq', isBotHeld: true, botOwner: 'Quantinum Bot', quantity: 4, unrealizedPnl: 312, unrealizedPnlPercent: 18.4, heldSince: iso(26 * HOUR), currentPremium: 7.1, premiumTarget: 9.4, premiumStop: 4.2, premiumMarkedAt: iso(2 * MIN) },
  ],
});

const pulse = () => ({ asOf: iso(50_000), macro: { yield10Y: 4.14, yieldDirection: 'FALLING', vix: 16.4, dxy: 98.2 } });

const extended = () => ({
  asOf: iso(60_000), session: 'regular', isStale: false,
  assetClasses: [
    { key: 'es', label: 'S&P futures', symbol: 'ES', changePct: 0.58, stance: 'risk-on' },
    { key: 'nq', label: 'Nasdaq futures', symbol: 'NQ', changePct: 0.84, stance: 'risk-on' },
    { key: 'tlt', label: 'Long bonds', symbol: 'TLT', changePct: -0.3, stance: 'neutral' },
    { key: 'vix', label: 'VIX', symbol: 'VIX', changePct: -4.1, stance: 'calm' },
    { key: 'btc', label: 'Bitcoin', symbol: 'BTC', changePct: 1.2, stance: 'risk-on' },
  ],
});

const extendedSymbol = (s: string) => {
  const b = spotOf(s);
  return { symbol: s, lastPrice: b.spot, previousClose: +(b.spot / (1 + b.chg / 100)).toFixed(2), changePct: b.chg, session: 'regular', asOf: iso(20_000), isCurrent: true, volume: 18_400_000, isExtended: false };
};

const patterns = () => ({
  asOf: iso(3 * MIN), scanned: 140, failed: 0, scanning: false,
  hits: [
    { symbol: 'AVGO', core: true, pattern: 'inside-day', bias: 'long', note: 'Inside day at the 20 EMA after a 3-day pullback.', detectedAt: iso(30 * MIN), levels: { motherHigh: 352.4, motherLow: 341.1, invalidation: 338.9 }, context: { last: 349.2, above200d: true, ema20AboveEma50: true } },
    { symbol: 'SHOP', pattern: 'bull-flag', bias: 'long', note: 'Flag under 158 after a 9% pole.', detectedAt: iso(70 * MIN), levels: { flagHigh: 158.2, flagLow: 151.6, poleLow: 143.5 }, context: { last: 155.9, above200d: true, ema20AboveEma50: true } },
    { symbol: 'NKE', pattern: 'range', bias: 'short', note: 'Failing at range top; lower highs.', detectedAt: iso(2 * HOUR), levels: { rangeHigh: 74.8, rangeLow: 69.2, invalidation: 75.6 }, context: { last: 72.1, above200d: false, ema20AboveEma50: false } },
    { symbol: 'UBER', pattern: 'inside-day', bias: 'long', note: 'Tight inside day above rising 50-day.', detectedAt: iso(3 * HOUR), levels: { motherHigh: 96.4, motherLow: 92.8, invalidation: 92.1 }, context: { last: 95.1, above200d: true, ema20AboveEma50: true } },
  ],
});

const g = (groupId: string, label: string, etf: string, stage: string, side: 'long' | 'short' | null, mv: number, laggards: string[]) => ({
  groupId, label, etf, horizon: 'daily', phase: 'regular', stage, side, points: Math.round(Math.abs(mv) * 30),
  etfMovePct: mv, relPct: mv - 0.6, breadthPct: 70, flowCount: 6, membersRead: 12, metrics: {},
  leaders: [{ symbol: 'NVDA', movePct: 1.9, note: 'leader' }], laggards: laggards.map((symbol, i) => ({ symbol, movePct: 0.2 + i * 0.1, note: 'catch-up candidate' })),
  ranked: [{ symbol: 'MRVL', movePct: 3.1, note: '' }, { symbol: 'AMD', movePct: 2.4, note: '' }, { symbol: 'NVDA', movePct: 1.9, note: '' }],
  levels: [], why: ['ETF above VWAP, breadth 70%'],
});
const ignition = (h: string) => ({
  horizon: h, asOf: iso(4 * MIN), ageSec: 240, phase: 'regular',
  groups: [
    g('semis', 'Semis', 'SMH', 'igniting', 'long', 2.1, ['INTC', 'QCOM']),
    g('software', 'Software', 'IGV', 'stirring', 'long', 1.1, ['ADBE']),
    g('cyber', 'Cybersecurity', 'CIBR', 'stirring', 'long', 0.9, []),
    g('energy', 'Energy', 'XLE', 'igniting', 'short', -1.4, ['OXY']),
    g('banks', 'Banks', 'XLF', 'quiet', null, -0.2, []),
  ],
  dataAsOf: {}, notes: [], cadence: '5 min', honesty: 'Measuring — unvalidated thresholds.', watchlist: [], emitted: [],
});

const tracked = () => ({
  tracked: [
    { symbol: 'MRVL', until: new Date(NOW + 2 * 86_400_000).toISOString(), note: '', addedAt: iso(26 * HOUR), origin: 'operator' },
    { symbol: 'MSFT', until: new Date(NOW + 2 * 86_400_000).toISOString(), note: '', addedAt: iso(26 * HOUR), origin: 'operator' },
    { symbol: 'PLTR', until: new Date(NOW + 2 * 86_400_000).toISOString(), note: '', addedAt: iso(3 * HOUR), origin: 'operator' },
  ],
});

const levels = (s: string) => { const b = spotOf(s); return { last: b.spot, clusters: [{ price: +(b.spot * 0.97).toFixed(2) }, { price: +(b.spot * 1.03).toFixed(2) }] }; };

const flowBatch = (list: string) => ({ enabled: true, reads: Object.fromEntries(list.split(',').filter(Boolean).map((s, i) => [s, { lean: i % 2 ? 'bearish' : 'bullish', net: (i % 2 ? -1 : 1) * (1_800_000 + i * 640_000) }])) });

const quotes = (list: string) => ({
  quotes: Object.fromEntries(list.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).map((s) => {
    const b = spotOf(s);
    return [s, { price: b.spot, change: +(b.spot * b.chg / 100).toFixed(2), changePercent: b.chg, asOf: iso(4_000) }];
  })),
});

const traderCalls = () => ({
  asOf: iso(2 * MIN),
  config: { minScore: 60, minSample: 10, maxAgeTradingDays: 5, minConfidence: 0.5 },
  traders: [{ slug: 'femi', name: 'Femi', score: 74, rank: 1, sample: 41 }, { slug: 'uzo', name: 'Uzo', score: 66, rank: 2, sample: 28 }],
  calls: [
    { id: 'tc1', label: 'Trader call', trader: { slug: 'femi', name: 'Femi', score: 74, rank: 1 }, symbol: 'AMD', assetType: 'option', direction: 'long', view: 'long', optionType: 'call', strike: 170, expiry: new Date(NOW + 9 * 86_400_000).toISOString().slice(0, 10), stated: { entry: 3.4, stop: 2.1, target: 6.0, units: 'premium' }, postedAt: iso(5 * HOUR), age: '5h', link: null, confidence: 0.8, underlying: { price: 164.2, changePct: 2.4, source: 'quote', live: true, asOf: iso(10_000) }, sinceCallPct: 1.6 },
    { id: 'tc2', label: 'Trader call', trader: { slug: 'uzo', name: 'Uzo', score: 66, rank: 2 }, symbol: 'TSLA', assetType: 'option', direction: 'short', view: 'short', optionType: 'put', strike: 430, expiry: new Date(NOW + 4 * 86_400_000).toISOString().slice(0, 10), stated: { entry: 8.2, stop: 5.0, target: 14, units: 'premium' }, postedAt: iso(26 * HOUR), age: '1d', link: null, confidence: 0.7, underlying: { price: 438.9, changePct: -2.3, source: 'quote', live: true, asOf: iso(10_000) }, sinceCallPct: -1.1 },
  ],
  note: 'Evidence only — not scored into conviction.',
});

/** Daily / intraday candles: a deterministic walk ending at the symbol's spot. */
function history(sym: string, interval: string) {
  const { spot } = spotOf(sym);
  const r = rng(sym.split('').reduce((a, c) => a + c.charCodeAt(0), 0));
  const daily = /d|wk|mo/.test(interval);
  const step = daily ? 86_400 : interval.endsWith('m') ? Number(interval.replace('m', '')) * 60 || 300 : 3600;
  const n = 160;
  const rows: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }> = [];
  let p = spot * 0.86;
  const end = Math.floor(NOW / 1000);
  for (let i = 0; i < n; i++) {
    const drift = (spot - p) / (n - i) ;
    const o = p;
    const c = Math.max(1, o + drift + (r() - 0.5) * spot * (daily ? 0.022 : 0.004));
    const h = Math.max(o, c) * (1 + r() * (daily ? 0.01 : 0.002));
    const l = Math.min(o, c) * (1 - r() * (daily ? 0.01 : 0.002));
    rows.push({ time: end - (n - i) * step, open: +o.toFixed(2), high: +h.toFixed(2), low: +l.toFixed(2), close: +c.toFixed(2), volume: Math.round(2e6 + r() * 4e6) });
    p = c;
  }
  return { symbol: sym, range: '6mo', data: rows };
}

function route(path: string): unknown | undefined {
  const [p, q = ''] = path.split('?');
  const qs = new URLSearchParams(q);
  let m: RegExpMatchArray | null;
  if (p === '/api/convictions') return convictions();
  if (p === '/api/market-pulse') return pulse();
  if (p === '/api/extended-hours') return extended();
  if ((m = p.match(/^\/api\/extended-hours\/([^/]+)$/))) return extendedSymbol(decodeURIComponent(m[1]).toUpperCase());
  if (p === '/api/patterns/scan') return patterns();
  if (p === '/api/sector-ignition') return ignition(qs.get('horizon') ?? 'daily');
  if (p === '/api/nexus/tracked') return tracked();
  if ((m = p.match(/^\/api\/levels\/([^/]+)$/))) return levels(decodeURIComponent(m[1]).toUpperCase());
  if (p === '/api/bullflow/net-premium-batch') return flowBatch(qs.get('symbols') ?? '');
  if ((m = p.match(/^\/api\/quotes\/batch\/(.+)$/))) return quotes(decodeURIComponent(m[1]));
  if (p === '/api/quotes/batch') return quotes(qs.get('symbols') ?? '');
  if (p === '/api/trader-calls') return traderCalls();
  if ((m = p.match(/^\/api\/historical-prices\/([^/]+)$/))) return history(decodeURIComponent(m[1]).toUpperCase(), qs.get('interval') ?? '1d');
  if (p === '/api/watchlist') return Object.keys(SPOTS).map((symbol) => ({ symbol }));
  if (p === '/api/health') return { status: 'ok', timestamp: new Date().toISOString() };
  return undefined;
}

export function installNexusWorkspaceMocks() {
  try {
    localStorage.setItem('qe-onboarded-v1', new Date().toISOString());
    // ?theme=light|dark for screenshot runs (the app's own visual-mode pref)
    const theme = new URLSearchParams(window.location.search).get('theme');
    if (theme === 'light' || theme === 'dark') setModePref(theme);
    const latest = getMostRecentId(); if (latest) localStorage.setItem('qe_changelog_seen', latest);
  } catch { /* storage blocked */ }
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const u = new URL(url, window.location.origin);
    if (u.origin !== window.location.origin || !u.pathname.startsWith('/api/')) return real(input, init);
    await new Promise((r) => setTimeout(r, 60));
    const body = route(u.pathname + u.search);
    if (body === undefined) return new Response(JSON.stringify({ error: 'not mocked in /dev/nexus-workspace' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  (window as unknown as { WebSocket: unknown }).WebSocket = class { readyState = 3; close() {} send() {} addEventListener() {} removeEventListener() {} } as unknown;
}
