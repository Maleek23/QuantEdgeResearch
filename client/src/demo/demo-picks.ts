/**
 * DEMO PICKS — the NEXUS board the landing frames show (demo/demo-embed.ts).
 * A believable strong session: setups published earlier today, still live, with
 * the evidence layers the real engine writes — so the real grade code
 * (shared/nexus-grade.ts) scores them A/B/C on its own, nothing hard-coded.
 * Invented numbers; every landing frame is badged "Sample data".
 */
type Layer = { kind: string; label: string; points: number; why: string };

type Spec = {
  symbol: string; sector: string; dir: 'long' | 'short'; px: number; score: number; minsAgo: number;
  asset: 'option' | 'stock'; thesis: string; catalyst: string; layers: Layer[];
};

const L = (kind: string, label: string, points: number, why: string): Layer => ({ kind, label, points, why });

const SPECS: Spec[] = [
  { symbol: 'NVDA', sector: 'Semiconductors', dir: 'long', px: 128.4, score: 92, minsAgo: 34, asset: 'option',
    thesis: 'Reclaimed the prior-day high on 1.8× time-matched volume with semis leading; dealers long gamma above 126 keep dips shallow into the 132 call wall.',
    catalyst: 'Semis rotation leader · call wall 132',
    layers: [L('technical', 'Technical', 6, 'Above VWAP and the 20-EMA; RSI 61 rising'), L('structure', 'Structure', 4, 'Higher low at 126.10 printed at 10:05 ET — the invalidation'),
      L('gex', 'Gamma', 3, 'Spot above zero-γ 125.8; call wall 132'), L('sector', 'Sector', 3, 'SMH +1.4% vs SPY, breadth 78%'), L('convergence', 'Convergence', 3, 'Flow and structure agree')] },
  { symbol: 'MSFT', sector: 'Software', dir: 'long', px: 428.9, score: 74, minsAgo: 150, asset: 'option',
    thesis: 'Tight 3-day range broke higher at the open; buyers held the breakout retest at 426 with call sweeps at the 430 strike.',
    catalyst: 'Range breakout · 430C sweeps',
    layers: [L('technical', 'Technical', 4, 'Breakout from a 3-day range on rising volume'), L('compression', 'Compression', 2, 'TTM squeeze fired on the 30m'),
      L('ta', 'Signals', 3, 'Breakout-retest held'), L('regime', 'Regime', 2, 'Index regime favours longs today')] },
  { symbol: 'TSLA', sector: 'Autos', dir: 'short', px: 241.7, score: 74, minsAgo: 1440, asset: 'option',
    thesis: 'Rejected the 248 put-wall retest and lost VWAP; put flow building at the 240 strike while autos lag the tape.',
    catalyst: 'Failed retest · put flow 240P',
    layers: [L('technical', 'Technical', 6, 'Below VWAP; lower high at 246.9'), L('structure', 'Structure', 4, 'Lower high 246.90 printed at 10:40 ET — the invalidation'), L('gex', 'Gamma', 3, 'Short gamma below 244 extends moves'),
      L('sector', 'Sector', 2, 'Autos −0.9% vs SPY')] },
  { symbol: 'AMD', sector: 'Semiconductors', dir: 'long', px: 163.2, score: 77, minsAgo: 1500, asset: 'stock',
    thesis: 'Holding the gap and pressing the opening-range high; semis breadth behind it.',
    catalyst: 'Opening-range hold',
    layers: [L('technical', 'Technical', 4, 'Gap held above the prior close'), L('sector', 'Sector', 3, 'Semis leading')] },
  { symbol: 'META', sector: 'Communication', dir: 'long', px: 588.3, score: 72, minsAgo: 2950, asset: 'option',
    thesis: 'Pullback to the rising 20-EMA found buyers; communication services second-strongest group today.',
    catalyst: 'Trend pullback',
    layers: [L('technical', 'Technical', 4, 'Pullback to the 20-EMA held'), L('regime', 'Regime', 2, 'Trend regime')] },
  { symbol: 'COIN', sector: 'Financials', dir: 'short', px: 212.6, score: 66, minsAgo: 4400, asset: 'stock',
    thesis: 'Lagging BTC on the bounce; lost the morning low with no follow-through from crypto proxies.',
    catalyst: 'Relative weakness vs BTC',
    layers: [L('technical', 'Technical', 3, 'Lost the morning low'), L('ta', 'Signals', 1, 'Bear flag on the 15m')] },
];

export function demoConvictions(now = Date.now()) {
  const iso = (ms: number) => new Date(now - ms).toISOString();
  return {
    generatedAt: iso(60_000),
    marketContext: { regime: 'risk-on', riskSentiment: 'constructive', preferredDirection: 'long', score: 64, vixLevel: 15.8,
      reasons: ['SPY above VWAP with breadth 68%', 'Semis and software leading', 'VIX 15.8, falling'] },
    breadth: null, geopolitical: { risk: 'low', activeScenarios: [] }, totalCandidatesScanned: 412,
    picks: SPECS.map((s) => {
      const long = s.dir === 'long';
      const entry = s.px;
      const risk = +(entry * 0.018).toFixed(2);
      const stop = +(long ? entry - risk : entry + risk).toFixed(2);
      const target = +(long ? entry + risk * 2.2 : entry - risk * 2.2).toFixed(2);
      const band = s.score >= 85 ? 'S' : s.score >= 75 ? 'A' : s.score >= 62 ? 'B' : 'C';
      const strike = s.px >= 100 ? Math.round(s.px / 5) * 5 : Math.round(s.px);
      const published = iso(s.minsAgo * 60_000);
      return {
        ideaId: `demo-${s.symbol}`, symbol: s.symbol, sector: s.sector, direction: s.dir, assetType: s.asset,
        holdingPeriod: 'swing', tradeType: 'swing', entryPrice: entry, targetPrice: target, stopLoss: stop, riskRewardRatio: 2.2,
        optionType: s.asset === 'option' ? (long ? 'call' : 'put') : null, strikePrice: s.asset === 'option' ? strike : null,
        entryPremium: s.asset === 'option' ? +(entry * 0.024).toFixed(2) : null, optionDte: s.asset === 'option' ? 9 : null,
        expiryDate: s.asset === 'option' ? new Date(now + 9 * 864e5).toISOString().slice(0, 10) : null,
        convictionScore: s.score, convictionBand: band, layerCount: s.layers.length, layers: s.layers,
        publishedConvictionScore: s.score, publishedConvictionBand: band, thesis: s.thesis, catalyst: s.catalyst, catalystSourceUrl: null,
        generatedAt: published, timestamp: published, calledAt: published, source: 'convictions',
        currentPrice: +(long ? entry * 1.004 : entry * 0.996).toFixed(2), lifecycleState: 'thesis',
      };
    }),
  };
}
