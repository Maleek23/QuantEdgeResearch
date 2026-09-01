import { fetchHistoricalPrices } from './server/market-api';
import { calculateSMA, calculateRSI, calculateADX, analyzeRSI2MeanReversion, calculateVWAP } from './server/technical-indicators';
(async () => {
  const p = await fetchHistoricalPrices('LEU', 'stock', 60, process.env.ALPHA_VANTAGE_API_KEY);
  console.log('history days:', p.length, 'last 6:', p.slice(-6));
  if (!p.length) { process.exit(0); }
  const current = p[p.length-1];
  const sma200 = calculateSMA(p, 200);
  const sma50 = calculateSMA(p, 50);
  const rsi2 = calculateRSI(p, 2);
  const rsi14 = calculateRSI(p, 14);
  const adx = calculateADX(p.map(x=>x*1.01), p.map(x=>x*0.99), p, 14);
  const rec = p.slice(-20);
  const vwap = calculateVWAP(rec, rec, rec, new Array(rec.length).fill(1));
  console.log({current, sma50, sma200, rsi2, rsi14, adx, vwap});
  console.log('MIN_HISTORY_DAYS(30) ok?', p.length >= 30);
  console.log('rsi2 signal:', analyzeRSI2MeanReversion(rsi2, current, sma200));
  console.log('currentPrice < sma50 ?', current < sma50);
  console.log('currentPrice < sma200 ?', current < sma200);
  console.log('adx > 25 ?', adx > 25);
  console.log('vwap band long (px>vwap && px<vwap*1.02):', current > vwap && current < vwap*1.02);
  console.log('vwap band short (px<vwap && px>vwap*0.98 && px<sma200):', current < vwap && current > vwap*0.98 && current < sma200);
  process.exit(0);
})();
