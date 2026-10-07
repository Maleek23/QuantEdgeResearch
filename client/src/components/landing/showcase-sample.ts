/**
 * SAMPLE SHOWCASE — what the landing's product panels show BEFORE the live read
 * arrives (or when a live section is empty / the feed is down), so a visitor
 * never sees "—", "no data yet" or "Loading…" (docs/TERRA_TRADE_STUDY_2026-10-07.md #1).
 *
 * Rules (memory: live-not-carried, honest copy):
 *  - Every value here is invented for illustration. The panels render it with a
 *    SAMPLE badge and "Sample data" where the age stamp would be — never an age,
 *    never a source name, never a "Live" dot.
 *  - No sample win rate: winRate stays null (below the sample floor), so a sample
 *    can never read as a performance claim. Sample paper P&L is small and negative.
 *  - Dates are relative to "now" so the sample never looks stale or prophetic.
 */
import type { Showcase } from './live-showcase';

const DAY = 86_400_000;

export function sampleShowcase(now = Date.now()): Showcase {
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
  const ymd = (daysAhead: number) => new Date(now + daysAhead * DAY).toISOString().slice(0, 10);
  const spot = 571.4;
  const profile = Array.from({ length: 25 }, (_, i) => {
    const strike = 559 + i; const d = strike - 567;
    return { strike, netGex: +(d < 0 ? -0.9 * Math.exp(-((d + 3) ** 2) / 10) : 1.5 * Math.exp(-((d - 9) ** 2) / 18)).toFixed(3) };
  });
  return {
    builtAt: iso(0),
    quotes: { asOf: null, data: [
      { symbol: 'SPY', price: spot, changePct: 0.38, source: 'sample', asOf: iso(0) },
      { symbol: 'QQQ', price: 492.6, changePct: 0.55, source: 'sample', asOf: iso(0) },
      { symbol: 'BTC', price: 63850, changePct: -1.2, source: 'sample', asOf: iso(0) },
    ] },
    gex: { asOf: null, data: { symbol: 'SPY', spot, callWall: 576, putWall: 562, zeroGamma: 567.5, maxGammaStrike: 576, wallBasisLabel: '≤7d',
      regime: 'positive_gamma', netGexB: 2.1, source: null, chainAgeMs: null, delayedFeed: false, profile } },
    ideas: { asOf: null, data: [
      { symbol: 'NVDA', side: 'long', band: 'A', publishedAt: iso(2 * DAY + 3_600_000), outcome: 'hit_target', percentGain: 4.8, assetType: 'stock' },
      { symbol: 'TSLA', side: 'short', band: 'B', publishedAt: iso(3 * DAY), outcome: 'hit_stop', percentGain: -2.9, assetType: 'stock' },
      { symbol: 'AMD', side: 'long', band: 'B', publishedAt: iso(1.2 * DAY), outcome: null, percentGain: null, assetType: 'stock' },
    ] },
    crypto: { asOf: null, data: [
      { symbol: 'SOL', name: 'Solana', price: 146.9, change24h: -3.4 },
      { symbol: 'ETH', name: 'Ethereum', price: 2488, change24h: -1.9 },
      { symbol: 'BTC', name: 'Bitcoin', price: 63850, change24h: -1.2 },
    ] },
    catalysts: { asOf: null, data: [
      { symbol: 'NKE', date: ymd(2), estimate: '0.52' },
      { symbol: 'MU', date: ymd(3), estimate: '1.74' },
      { symbol: 'STZ', date: ymd(6), estimate: null },
    ] },
    bot: { asOf: null, data: { closed: 14, open: 3, wins: 6, winRate: null, minSample: 30, netRealizedPnL: -120,
      avgWinPct: null, avgLossPct: null, profitFactor: null, since: ymd(-14), runLabel: null, startingCapital: null } },
  };
}
