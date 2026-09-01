import { fetchHistoricalPrices } from './server/market-api';
import { calculateSMA, calculateRSI, calculateADX, analyzeRSI2MeanReversion, calculateVWAP } from './server/technical-indicators';

// Replicates server/quant-ideas-generator.ts analyzeMarketData() exactly.
function sim(sym: string, hist: number[], currentPrice: number, changePercent: number, volumeRatio: number) {
  const out: string[] = [];
  if (hist.length < 30) return `${sym}: BLOCKED insufficient history (${hist.length}<30)`;
  const sma200 = calculateSMA(hist, 200);
  const sma50 = calculateSMA(hist, 50);
  const rsi2 = calculateRSI(hist, 2);
  const adx = calculateADX(hist.map(p=>p*1.01), hist.map(p=>p*0.99), hist, 14);
  const r = analyzeRSI2MeanReversion(rsi2, currentPrice, sma200);
  const rec = hist.slice(-20);
  const vwap = calculateVWAP(rec, rec, rec, new Array(rec.length).fill(1));
  const det: string[] = [];
  if (r.signal !== 'none') {
    if (currentPrice < sma50) out.push('RSI2_LONG ignored: below SMA50');
    else if (adx > 25) out.push('RSI2_LONG ignored: ADX');
    else det.push('RSI2_MEAN_REVERSION');
  } else out.push(`RSI2_LONG not triggered: rsi2=${rsi2} aboveTrend=${currentPrice>sma200}`);
  if (rsi2 > 90 && currentPrice < sma200) {
    if (currentPrice > sma50) out.push('RSI2_SHORT ignored: above SMA50');
    else if (adx > 25) out.push('RSI2_SHORT ignored: ADX');
    else det.push('RSI2_SHORT_REVERSION');
  } else out.push(`RSI2_SHORT not triggered (rsi2=${rsi2}, belowSMA200=${currentPrice<sma200})`);
  if (currentPrice > vwap && currentPrice < vwap*1.02 && volumeRatio >= 1.5) det.push('VWAP_CROSS');
  else out.push(`VWAP_CROSS no (px/vwap=${(currentPrice/vwap).toFixed(4)}, volRatio=${volumeRatio})`);
  if (currentPrice < vwap && currentPrice > vwap*0.98 && volumeRatio >= 1.5 && currentPrice < sma200) det.push('VWAP_REJECTION');
  else out.push(`VWAP_REJECTION no (volRatio=${volumeRatio})`);
  if (volumeRatio >= 3 && changePercent >= 0 && changePercent < 1.5 && currentPrice > sma200) det.push('VOLUME_SPIKE');
  else out.push(`VOLUME_SPIKE no (volRatio=${volumeRatio}, chg=${changePercent})`);
  if (volumeRatio >= 3 && changePercent <= 0 && changePercent > -1.5 && currentPrice < sma200) det.push('DISTRIBUTION_SPIKE');
  else out.push(`DISTRIBUTION_SPIKE no (volRatio=${volumeRatio})`);
  return `${sym} px=${currentPrice} chg=${changePercent}% sma50=${sma50} sma200=${sma200} rsi2=${rsi2} adx=${adx.toFixed(1)} vwap=${vwap.toFixed(2)}\n   signals=[${det.join(',')}] ${det.length===0?'>>> analyzeMarketData() returns null -> dataQuality.noSignal++':''}\n   ${out.join('\n   ')}`;
}

(async () => {
  const full = await fetchHistoricalPrices('LEU','stock',60, process.env.ALPHA_VANTAGE_API_KEY);
  const thruAug24 = full.slice(0, -1); // series as it stood entering the 8/25 session
  console.log('history len full/thruAug24:', full.length, thruAug24.length, 'last thruAug24:', thruAug24[thruAug24.length-1]);
  console.log('\n### Curated-core path (avgVolume null => volumeRatio forced to 1.0)');
  for (const [label, px, chg] of [['open',174.07,-1.73],['midday',181.44,2.43],['3pm',190.0,7.26],['close',193.39,9.17]] as [string,number,number][]) {
    console.log('--', label, '\n', sim('LEU', thruAug24, px, chg, 1.0));
  }
  console.log('\n### Hypothetical: if a real avgVolume had been supplied (volRatio 2.5)');
  for (const [label, px, chg] of [['midday',181.44,2.43],['3pm',190.0,7.26]] as [string,number,number][]) {
    console.log('--', label, '\n', sim('LEU', thruAug24, px, chg, 2.5));
  }
  process.exit(0);
})();
