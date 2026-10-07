/**
 * DEV-ONLY fixtures for the /dev/zerodte harness (never imported by a
 * production build: main.tsx loads this behind `import.meta.env.DEV`).
 *
 *   /dev/zerodte?fx=preopen   09:20 ET — pre-market, nothing actionable, engine idle
 *   /dev/zerodte?fx=live      09:40 ET — flow ignition LIVE, ideas ARMED / WATCH, a stale quote
 *   /dev/zerodte?fx=midday    13:00 ET — mixed: one LIVE SPX idea (+ SPX mirror), PASSED, DONE, EXPIRED; index engine BLIND
 *   /dev/zerodte?fx=closed    16:20 ET — after the close, everything greyed
 *   &mode=light|dark          visual mode for screenshots
 *
 * Pins the desk clock (window.__ZD_NOW__) to the fixture's ET time so ages,
 * countdowns and actionability render as they would at that minute. Replaces
 * window.fetch for the desk's /api/* reads. Synthetic data — illustration only.
 */
import type { DeskPayload } from '@/components/zerodte/zero-dte-desk';
import type { DeskIdea } from '@/components/zerodte/zero-dte-ideas';

type Fx = 'preopen' | 'live' | 'midday' | 'closed';
const DAY = '2026-10-06'; // Tuesday, EDT (ET = UTC − 4)
const ET = (hhmm: string, s = 0) => Date.parse(`${DAY}T${String(Number(hhmm.slice(0, 2)) + 4).padStart(2, '0')}:${hhmm.slice(3, 5)}:${String(s).padStart(2, '0')}Z`);
const iso = (ms: number) => new Date(ms).toISOString();
const NOW: Record<Fx, number> = { preopen: ET('09:20'), live: ET('09:40', 30), midday: ET('13:00'), closed: ET('16:20') };

const PHASE: Record<Fx, DeskPayload['phase']> = {
  preopen: { id: 'pre', label: 'Pre-market', window: 'before 09:30', etMin: 560, minutesToClose: 0, entriesOpen: false, policies: { A: false, B: false }, nextAt: '09:30', looksFor: ['Pre-market gap and the overnight range set the first levels.', 'No 0DTE ideas before 09:45 ET.'] },
  live: { id: 'open_drive', label: 'Open drive', window: '09:30–10:00', etMin: 580, minutesToClose: 380, entriesOpen: false, policies: { A: false, B: false }, nextAt: '10:00', looksFor: ['Opening-range build; flow ignition watches at-ask 0DTE flow from 09:35.', 'Policy A (negative-γ continuation) opens 09:45.'] },
  midday: { id: 'midday', label: 'Midday', window: '10:00–15:00', etMin: 780, minutesToClose: 180, entriesOpen: true, policies: { A: true, B: true }, nextAt: '15:00', looksFor: ['Wall fades in positive γ (policy B); continuation through zero-γ in negative γ (policy A).'] },
  closed: { id: 'closed', label: 'Closed', window: 'after 16:00 / weekend', etMin: 980, minutesToClose: 0, entriesOpen: false, policies: { A: false, B: false }, nextAt: null, looksFor: ['Nothing new. Open ideas were flattened by the 15:55 ET time stop.'] },
};

const contract = (root: string, type: 'call' | 'put', strike: number, o: Partial<NonNullable<DeskIdea['contract']>> = {}): NonNullable<DeskIdea['contract']> => ({
  occ: `${root}261006${type === 'call' ? 'C' : 'P'}${String(strike * 1000).padStart(8, '0')}`, root, optionType: type, strike, expiry: DAY, dte: 0,
  delta: type === 'call' ? 0.42 : -0.41, openInterest: 18_400, spreadPct: 0.04, qty: 2, riskDollars: 150, debitDollars: 320,
  premiumStop: 0.95, premiumT1: 2.4, premiumT2: 3.3, basis: '$150 risk / $400 debit per trade', ...o,
});

function idea(now: number, o: Partial<DeskIdea> & Pick<DeskIdea, 'key' | 'symbol' | 'stage'>): DeskIdea {
  const long = (o.direction ?? 'long') === 'long';
  return {
    doneReason: null, direction: 'long', side: long ? 'CALLS' : 'PUTS', kind: 'wall_break', kindLabel: 'Policy A · zero-γ break', policy: 'A',
    trigger: { name: 'zero-γ', price: 671.2 }, triggerText: 'a 5-min close above zero-γ', entry: 671.2, stop: 669.6, target: { name: 'call wall', price: 674 }, target2: { name: '1σ', price: 675.5 }, rr: 1.8,
    price: 671.6, priceAt: iso(now - 20_000), distPct: null, expiryLabel: '0DTE · today',
    contract: null, quote: null, loggedPremium: null, contractNote: null, vehicle: o.symbol,
    entryBy: '15:45', exitBy: '15:30', why: 'Negative-γ regime below the call wall: dealers chase a break of zero-γ; flow tide on today\'s expiry leans calls.', grade: 'B', gradeWhy: ['zero-γ + OR30 high confluence', 'flow tide agrees'],
    at: iso(now - 25 * 60_000), ideaId: null, logged: false, loggedNote: null, spxMirror: null,
    ...o,
  };
}

function ideasFor(fx: Fx, now: number): DeskIdea[] {
  const q = (mid: number, ageSec: number) => ({ bid: +(mid - 0.05).toFixed(2), ask: +(mid + 0.05).toFixed(2), mid, at: iso(now - ageSec * 1000), source: 'Alpaca' });
  if (fx === 'preopen') return [];
  if (fx === 'live') return [
    idea(now, { key: 'spy-a-long', symbol: 'SPY', stage: 'watch', distPct: 0.12, at: iso(now - 6 * 60_000), contract: contract('SPY', 'call', 672), quote: q(1.18, 25), entryBy: '15:45' }),
    idea(now, { key: 'tsla-b-short', symbol: 'TSLA', stage: 'watch', direction: 'short', side: 'PUTS', kind: 'wall_fade', kindLabel: 'Policy B · call-wall fade', policy: 'B', trigger: { name: 'call wall', price: 445 }, triggerText: 'a rejection wick at the call wall', entry: 445, stop: 447.6, target: { name: 'VWAP', price: 439.8 }, target2: null, rr: 2.0, price: 440.1, distPct: 1.12, contract: contract('TSLA', 'put', 440), quote: q(2.35, 40), at: iso(now - 9 * 60_000), entryBy: '15:45' }),
    idea(now, { key: 'xle-ign', symbol: 'XLE', stage: 'watch', kind: 'sector_ignition', kindLabel: 'Sector ignition · energy', policy: null, trigger: { name: 'OR high', price: 91.4 }, triggerText: 'a 5-min close above the opening-range high', entry: 91.4, stop: 90.7, target: { name: 'PDH', price: 92.6 }, target2: null, rr: 1.7, price: 91.2, distPct: 0.22, contract: contract('XLE', 'call', 91), quote: q(0.62, 300), at: iso(now - 4 * 60_000), grade: 'C' }),
  ];
  if (fx === 'midday') return [
    idea(now, {
      key: 'spx-a-live', symbol: 'SPX', stage: 'triggered', at: iso(now - 4 * 60_000), entryBy: '13:20', logged: true, ideaId: 'fx-1', vehicle: 'SPY', loggedPremium: 1.42,
      trigger: { name: 'zero-γ', price: 6742 }, entry: 6742, stop: 6727, target: { name: 'call wall', price: 6770 }, target2: { name: '1σ', price: 6784 }, rr: 1.9, price: 6744.8,
      contract: contract('SPY', 'call', 671), quote: q(1.48, 22),
      spxMirror: {
        status: 'ok', reason: null, contract: { root: 'SPXW', occ: 'SPXW261006C06745000', strike: 6745, expiry: DAY, optionType: 'call', dte: 0 },
        premium: { mid: 14.6, bid: 14.2, ask: 15.0, asOf: iso(now - 70_000), delayedSec: 900, source: 'CBOE delayed' },
        levels: { entry: 6742.1, stop: 6726.0, targets: [6770.2, 6784.3] },
        ratio: { value: 10.0476, spx: 6744.8, spy: 671.3, asOf: iso(now - 40_000), source: 'Yahoo ^GSPC / Alpaca SPY' },
        note: 'tracked as the SPY idea; SPX is a mirror',
      },
    }),
    idea(now, { key: 'meta-inplay', symbol: 'META', stage: 'in_play', at: iso(now - 70 * 60_000), entryBy: '12:05', logged: true, ideaId: 'fx-2', loggedPremium: 3.1, trigger: { name: 'VWAP', price: 742 }, entry: 742, stop: 737.5, target: { name: 'call wall', price: 750 }, target2: null, price: 745.3, contract: contract('META', 'call', 745), quote: q(3.85, 30) }),
    idea(now, { key: 'qqq-done-t', symbol: 'QQQ', stage: 'done', doneReason: 'target hit — tracker 11:42 ET', at: iso(now - 150 * 60_000), logged: true, ideaId: 'fx-3', loggedPremium: 0.88, contract: contract('QQQ', 'call', 603), quote: q(1.61, 30), trigger: { name: 'OR30 high', price: 602.4 }, entry: 602.4, stop: 600.9, target: { name: 'call wall', price: 605 } }),
    idea(now, { key: 'tsla-done-s', symbol: 'TSLA', stage: 'done', direction: 'short', side: 'PUTS', doneReason: 'stop hit — tracker 10:58 ET', at: iso(now - 170 * 60_000), logged: true, ideaId: 'fx-4', loggedPremium: 2.2, contract: contract('TSLA', 'put', 435), quote: q(0.4, 30), trigger: { name: 'put wall', price: 436 }, entry: 436, stop: 439.2, target: { name: 'put wall −1σ', price: 430 } }),
    idea(now, { key: 'iwm-watch-exp', symbol: 'IWM', stage: 'watch', entryBy: '11:30', distPct: 0.4, at: iso(now - 180 * 60_000), contract: contract('IWM', 'call', 247), quote: q(0.55, 45), trigger: { name: 'OR high', price: 246.9 }, entry: 246.9, stop: 245.8, target: { name: 'PDH', price: 248.6 } }),
    idea(now, { key: 'mstr-watch-far', symbol: 'MSTR', stage: 'watch', direction: 'short', side: 'PUTS', distPct: 1.6, at: iso(now - 30 * 60_000), contract: contract('MSTR', 'put', 380), quote: q(4.1, 50), trigger: { name: 'put wall', price: 382 }, entry: 382, stop: 388, target: { name: 'zero-γ', price: 371 } }),
  ];
  // closed
  return [
    idea(now, { key: 'spx-closed-t', symbol: 'SPX', stage: 'done', doneReason: 'target hit — tracker 13:31 ET', at: iso(ET('12:56')), logged: true, ideaId: 'fx-1', vehicle: 'SPY', loggedPremium: 1.42, contract: contract('SPY', 'call', 671), quote: null, trigger: { name: 'zero-γ', price: 6742 }, entry: 6742, stop: 6727, target: { name: 'call wall', price: 6770 } }),
    idea(now, { key: 'meta-closed-ts', symbol: 'META', stage: 'done', doneReason: 'time stop / expired — 15:30 ET', at: iso(ET('11:50')), logged: true, ideaId: 'fx-2', loggedPremium: 3.1, contract: contract('META', 'call', 745), quote: null, trigger: { name: 'VWAP', price: 742 }, entry: 742, stop: 737.5, target: { name: 'call wall', price: 750 } }),
    idea(now, { key: 'tsla-closed-s', symbol: 'TSLA', stage: 'done', direction: 'short', side: 'PUTS', doneReason: 'stop hit — tracker 10:58 ET', at: iso(ET('10:20')), logged: true, ideaId: 'fx-4', loggedPremium: 2.2, contract: contract('TSLA', 'put', 435), quote: null, trigger: { name: 'put wall', price: 436 }, entry: 436, stop: 439.2, target: { name: 'put wall −1σ', price: 430 } }),
    idea(now, { key: 'mstr-closed-w', symbol: 'MSTR', stage: 'watch', direction: 'short', side: 'PUTS', distPct: 1.9, at: iso(ET('12:30')), contract: contract('MSTR', 'put', 380), quote: null, trigger: { name: 'put wall', price: 382 }, entry: 382, stop: 388, target: { name: 'zero-γ', price: 371 } }),
  ];
}

function row(sym: string, spot: number, now: number, fx: Fx, o: { regime?: 'positive' | 'negative'; state?: string; headline?: string } = {}) {
  const k = spot / 100;
  const open = fx === 'live' || fx === 'midday';
  return {
    symbol: sym, optionRoot: sym === 'SPX' ? 'SPXW' : sym, owner: sym === 'SPX' ? 'index engine (SPY GEX → SPX; SPY is the account-fit fallback)' : 'desk engine (policies A/B on this name\'s own levels)',
    spot, chainSource: sym === 'SPX' ? 'CBOE delayed' : 'Alpaca', chainAgeSec: 75,
    expiry: { expiry: DAY, sameDay: true, label: '0DTE · today', calendarDays: 0, sessionsAfterToday: 0, upcoming: [DAY, '2026-10-07', '2026-10-08'] },
    expectedMove: { source: 'atm_straddle' as const, expiry: DAY, strike: Math.round(spot), straddle: +(k * 0.9).toFixed(2), iv: 0.18, toExpiry: +(k * 0.9).toFixed(2), toExpiryPct: 0.9, today: +(k * 0.9).toFixed(2), todayPct: 0.9, basis: 'ATM straddle × 0.85' },
    levels: { expiry: DAY, contracts: 412, callWall: +(spot * 1.004).toFixed(2), putWall: +(spot * 0.993).toFixed(2), zeroGamma: +(spot * 0.999).toFixed(2), maxGamma: +(spot * 1.002).toFixed(2), regime: o.regime ?? 'negative', regimeTitle: (o.regime ?? 'negative') === 'negative' ? 'Negative γ' : 'Positive γ', nearFlip: true, netGex: -1.2e9, basis: 'same-day expiry only', modelledGrossShare: 0.62 },
    levelsNote: null,
    intraday: open ? { vwap: +(spot * 0.9993).toFixed(2), vwapSide: 'above' as const, vwapDistPct: 0.07, or30High: +(spot * 1.001).toFixed(2), or30Low: +(spot * 0.996).toFixed(2), orbState: fx === 'live' ? 'building' : 'above OR30', lastClose: spot } : { vwap: null, vwapSide: null, vwapDistPct: null, or30High: null, or30Low: null, orbState: 'n/a', lastClose: spot },
    intradayNote: null, barsAgeSec: open ? 140 : null,
    flow: { expiry: DAY, prints: open ? 38 : 0, callPremium: 2.4e6, putPremium: 1.1e6, lean: open ? 'long' as const : null, dayLean: open ? 'long' as const : null, dayCallsNet: 3.1e6, dayPutsNet: 1.4e6, asOf: iso(now - 90_000), basis: 'Bullflow prints on today\'s expiry' },
    engine: { state: o.state ?? (open ? 'armed' : fx === 'closed' ? 'closed' : 'no_setup'), headline: o.headline ?? (open ? 'Price 0.1% under zero-γ in negative γ — a 5-min close above arms policy A.' : fx === 'closed' ? 'Session closed.' : 'Pre-market — levels only.'), why: open ? ['negative γ: dealers chase moves', 'flow tide leans calls'] : [], evaluatedAgeSec: open ? 95 : null },
    todaysIdeas: [], errors: [],
    swing: { symbol: sym, verdict: sym === 'TSLA' ? 'plan' as const : 'no_plan' as const, direction: sym === 'TSLA' ? 'short' as const : null, entry: spot, stop: sym === 'TSLA' ? +(spot * 1.03).toFixed(2) : null, target: sym === 'TSLA' ? +(spot * 0.95).toFixed(2) : null, structuralTarget: null, capped: false, rr: sym === 'TSLA' ? 1.7 : null, holdDays: 3, maxHoldDays: 4, sigmaH: +(spot * 0.04).toFixed(2), timeStopIso: sym === 'TSLA' ? iso(ET('15:30') + 86_400_000) : null, exitByIso: null, dteWindow: { min: 30, max: 60, label: '30–60 DTE' }, basis: ['plan', 'weekly-path drift down', 'call wall overhead'], wait: ['drift inside ±0.3σ', 'regime neutral'] },
    swingLevels: { regime: 'negative', zeroGamma: +(spot * 0.998).toFixed(2), callWall: +(spot * 1.02).toFixed(2), putWall: +(spot * 0.97).toFixed(2), maxGamma: +(spot * 1.01).toFixed(2), basis: 'all-book' },
  };
}

function desk(fx: Fx): DeskPayload {
  const now = NOW[fx];
  const ideas = ideasFor(fx, now);
  const indexEngine = fx === 'preopen' ? { scanAt: null, gexAt: iso(ET('15:58') - 86_400_000), wait: null }
    : fx === 'live' ? { scanAt: iso(now - 50_000), gexAt: iso(now - 95_000), wait: 'outside 09:45–15:45 ET entry window' }
    : fx === 'midday' ? { scanAt: iso(now - 70_000), gexAt: iso(now - 14 * 60_000), wait: 'no GEX snapshot (chain fetch failed or timed out)' }
    : { scanAt: iso(ET('15:55')), gexAt: iso(ET('15:54')), wait: null };
  return {
    asOf: iso(now - 20_000), watch: ['SPX', 'META', 'TSLA', 'MSTR'], phase: PHASE[fx],
    rows: [row('SPX', 6744.8, now, fx) as never, row('META', 745.3, now, fx, { regime: 'positive', state: fx === 'midday' ? 'in_trade' : undefined }) as never, row('TSLA', 440.1, now, fx) as never],
    ideas, ideasInfo: { evaluated: {}, noZeroDte: [{ symbol: 'BE', label: 'next expiry Fri — 1DTE+ only' }], cadence: 'every 5 min (2 min in power hour)', caps: { SPX: '$150 risk', default: '$150 risk / $400 debit' }, honesty: 'Model ideas from an unvalidated policy family — measuring.' },
    record: { since: '2026-08-26', n: 14, total: 31, open: 2, unresolvedClosed: 6, wins: 6, losses: 8, winRate: 0.43, avgR: 0.12, rCount: 14, firstAt: '2026-08-27T14:05:00Z', lastAt: iso(now), lowN: true, byKind: { '0dte': { n: 12, wins: 5, losses: 7, total: 26 }, swing: { n: 2, wins: 1, losses: 1, total: 5 } }, perName: { SPX: { n: 7, wins: 3, losses: 4, total: 15 }, TSLA: { n: 4, wins: 2, losses: 2, total: 9 } } },
    provenance: 'Fixture data — /dev/zerodte harness (DEV only).', notes: ['Every 0DTE idea has a hard time stop at 15:30 ET.'],
    indexEngine,
  };
}

function flow(fx: Fx) {
  const now = NOW[fx];
  const lastCycle = fx === 'preopen' ? null : { at: iso(fx === 'closed' ? ET('11:30') : now - 45_000), skipped: fx === 'closed' || fx === 'midday' ? 'outside 09:35–11:30 ET' : null, inWindow: fx === 'live', symbols: 42, chains: { read: 6, dropped: [], failed: [] }, cycleMs: 1840, errors: [] };
  const base = (o: Record<string, unknown>) => ({
    kind: 'ignition', spot: null, score: 7, structure: { ok: true, reason: null, vwap: null, orHigh: null, orLow: null, heldBars: 2 }, wall: null, unwind: null,
    published: false, ideaId: null, reason: null, stateWhy: null, lastMid: null, lastMarkAt: null, text: 'at-ask opening 0DTE flow + structure', ...o,
  });
  const ct = (sym: string, type: 'call' | 'put', strike: number, mid: number, q: number) => ({ occ: `${sym}261006${type === 'call' ? 'C' : 'P'}${strike}`, strike, type, dte: 0, bid: +(mid - 0.04).toFixed(2), ask: +(mid + 0.04).toFixed(2), mid, quoteAgeS: q, spreadPct: 0.05, source: 'Alpaca' });
  const fl = (strike: number, type: 'call' | 'put', agg: number) => ({ occ: '', strike, type, dte: 0, aggressive: agg, relSize: 2.4, dayVolume: 8200, openInterest: 3100, sweeps: 3 });
  const plan = (e: number) => ({ entryPremium: e, t1Premium: +(e * 1.5).toFixed(2), t2Premium: +(e * 2).toFixed(2), stopPremium: +(e * 0.6).toFixed(2), t1Underlying: null, t2Underlying: null, stopUnderlying: 0, stopBasis: 'OR low' });
  if (fx === 'preopen') return { enabled: true, lastCycle, rows: [], rules: {}, honesty: 'No edge claimed; forward-logged.' };
  const firedAt = fx === 'live' ? now - 3 * 60_000 : ET('09:44');
  const rows = [
    base({ id: 'f-nvda', symbol: 'NVDA', side: 'long', state: fx === 'live' ? 'fired' : 'reached', at: iso(firedAt), atEt: fx === 'live' ? '09:37' : '09:44', flow: fl(187.5, 'call', 410_000), contract: ct('NVDA', 'call', 187.5, 0.94, 20), plan: { ...plan(0.94), stopUnderlying: 185.9 }, stateWhy: fx === 'live' ? null : 'mid 1.52 ≥ +50% of 0.94', lastMid: fx === 'live' ? 0.97 : 1.52, lastMarkAt: iso(now - 50_000), published: true, ideaId: 'fx-f1' }),
    base({ id: 'f-amzn', symbol: 'AMZN', side: 'long', state: fx === 'live' ? 'fired' : 'faded', at: iso(fx === 'live' ? now - 2 * 60_000 : ET('09:51')), atEt: fx === 'live' ? '09:38' : '09:51', flow: fl(250, 'call', 160_000), contract: ct('AMZN', 'call', 250, 0.71, fx === 'live' ? 210 : 30), plan: { ...plan(0.71), stopUnderlying: 248.4 }, stateWhy: fx === 'live' ? null : 'premium −40% (0.42)', lastMid: 0.7, lastMarkAt: iso(now - 50_000) }),
    base({ id: 'f-spy-unwind', kind: 'unwind', symbol: 'SPY', side: 'short', state: fx === 'live' ? 'fired' : 'faded', at: iso(fx === 'live' ? now - 60_000 : ET('10:12')), atEt: fx === 'live' ? '09:39' : '10:12', flow: null, unwind: 'dominant 670C OI −18% in 10 min', contract: ct('SPY', 'put', 670, 1.12, 15), plan: { ...plan(1.12), stopUnderlying: 671.9 }, stateWhy: fx === 'live' ? null : 'time stop 15:30 ET', lastMid: 1.1, lastMarkAt: iso(now - 50_000) }),
    base({ id: 'f-amd-w', symbol: 'AMD', side: 'long', state: 'watch', at: iso(fx === 'live' ? now - 60_000 : ET('10:40')), atEt: fx === 'live' ? '09:39' : '10:40', flow: fl(165, 'call', 120_000), contract: null, plan: null, reason: 'price below VWAP (needs 2 bars through)' }),
  ];
  return { enabled: true, lastCycle, rows, rules: {}, honesty: 'No edge claimed; every trigger is forward-logged with its outcome.' };
}

function sniper(fx: Fx) {
  const now = NOW[fx];
  if (fx === 'preopen' || fx === 'live') return { enabled: true, lastCycle: fx === 'live' ? null : null, today: [], publishable: [{ key: 'orb_break|long', exit: 'T1' }] };
  const r = (o: Record<string, unknown>) => ({ setup: 'orb_break', setupLabel: 'ORB break & hold', side: 'long', triggerPrice: 0, level: 0, levelName: 'OR high', note: '', touch: null, zoneKind: null, volume: { triggerRvol: 2.1, label: '2.1×', source: 'Alpaca 1-min', asOf: iso(now - 60_000) }, status: 'published', reason: null, contracts: [], chainSource: 'Alpaca', ideaId: null, ...o });
  const pick = (strike: number, type: 'call' | 'put', ask: number) => [{ variant: 'otm1', occ: '', strike, type, expiry: DAY, bid: +(ask - 0.05).toFixed(2), ask, volume: 2100 }];
  return {
    enabled: true,
    lastCycle: { at: iso(now - 70_000), skipped: fx === 'closed' ? 'session closed' : null, universeSize: 64, universeCut: [], feed: 'sip', triggersFresh: 2, triggersStale: 0, chainFetches: { used: 2, cap: 4, deferred: [] }, cycleMs: 2210, memory: { rssBeforeMb: 410, rssAfterMb: 418 }, published: [], errors: [] },
    today: [
      r({ symbol: 'AAPL', triggerAt: iso(fx === 'midday' ? now - 4 * 60_000 : ET('12:56')), triggerEt: fx === 'midday' ? '12:56' : '12:56', triggerPrice: 256.4, level: 256.1, contracts: pick(257.5, 'call', 0.82), ideaId: 'fx-s1' }),
      r({ symbol: 'GOOGL', setup: 'vwap_loss', setupLabel: 'VWAP loss', side: 'short', triggerAt: iso(ET('11:14')), triggerEt: '11:14', triggerPrice: 241.2, level: 241.5, levelName: 'VWAP', contracts: pick(240, 'put', 0.66), ideaId: 'fx-s2' }),
      r({ symbol: 'NFLX', setup: 'failed_breakout', setupLabel: 'Failed breakout', side: 'short', status: 'watch', triggerAt: iso(ET('12:40')), triggerEt: '12:40', triggerPrice: 1190, level: 1195, levelName: 'PDH', reason: 'setup not proven in replay', contracts: [] }),
    ],
    publishable: [{ key: 'orb_break|long', exit: 'T1' }],
  };
}

const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });

export function installZeroDteMocks(): Fx {
  const sp = new URLSearchParams(window.location.search);
  const fxRaw = sp.get('fx');
  const fx: Fx = fxRaw === 'preopen' || fxRaw === 'midday' || fxRaw === 'closed' ? fxRaw : 'live';
  (window as unknown as { __ZD_NOW__?: number }).__ZD_NOW__ = NOW[fx];
  try { localStorage.setItem('qe-onboarded-v1', new Date().toISOString()); localStorage.removeItem('qe-zd-filter-v1'); } catch { /* storage blocked */ }
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const u = new URL(url, window.location.origin);
    if (u.origin !== window.location.origin || !u.pathname.startsWith('/api/')) return real(input, init);
    const p = u.pathname;
    if (p === '/api/zero-dte/desk') return json(desk(fx));
    if (p === '/api/zero-dte/flow') return json(flow(fx));
    if (p === '/api/zero-dte/sniper') return json(sniper(fx));
    if (p === '/api/wall-touch') return json({ enabled: true, lastCycle: null, rows: [], alerts: [], map: null, honesty: '' });
    if (p === '/api/wall-touch/report') return json({ sessions: 12, all: { n: 0, rejectionRate: null, avgMfePct: null, avgOptMaxMult: null, options: 0 }, awaitingOutcome: 0, byWall: {} });
    if (p === '/api/sector-ignition') return json({ horizon: 'intraday', asOf: iso(NOW[fx] - 60_000), ageSec: 60, phase: null, groups: [], dataAsOf: {}, notes: [], cadence: 'every 2 min', honesty: 'measuring', watchlist: [], emitted: [] });
    if (p === '/api/watchlist') return json([]);
    if (p === '/api/auth/user' || p === '/api/user') return json(null);
    return new Response(JSON.stringify({ error: 'not mocked in /dev/zerodte' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  };
  (window as unknown as { WebSocket: unknown }).WebSocket = class { readyState = 3; close() {} send() {} addEventListener() {} removeEventListener() {} } as unknown;
  return fx;
}
