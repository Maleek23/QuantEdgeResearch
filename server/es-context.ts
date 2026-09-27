/**
 * ES / SPX / SPY translation and prop-risk arithmetic.
 *
 * This module never substitutes a static price. If one leg is unavailable the
 * corresponding conversion is null and the UI says so. Futures basis moves,
 * especially around dividends, rates and contract roll; `ES / 10` is therefore
 * not treated as an executable SPY quote.
 */
import { fetchFuturesQuote } from './market-api';
import { getRealtimeBatchQuotes } from './realtime-pricing-service';
import { fetchCandles } from './historical-candles';

export type EsRiskInput = {
  accountSize: number;
  riskPct: number;
  stopPoints: number;
};

export async function getEsContext(input: EsRiskInput) {
  const [es, cash, spxBars, spyBars] = await Promise.all([
    fetchFuturesQuote('ES'),
    getRealtimeBatchQuotes([
      { symbol: 'SPX', assetType: 'stock' },
      { symbol: 'SPY', assetType: 'stock' },
    ]).catch(() => new Map()),
    fetchCandles('SPX', '5d', '1d').catch(() => []),
    fetchCandles('SPY', '5d', '1d').catch(() => []),
  ]);

  const spx = cash.get('SPX')?.price ?? spxBars.at(-1)?.close ?? null;
  const spy = cash.get('SPY')?.price ?? spyBars.at(-1)?.close ?? null;
  const basis = es && spx ? es.price - spx : null;
  const spyRatio = spx && spy ? spy / spx : null;
  const riskBudget = Math.max(0, input.accountSize) * Math.max(0, input.riskPct) / 100;

  const instrument = (symbol: 'ES' | 'MES', pointValue: number) => {
    const riskPerContract = Math.max(0, input.stopPoints) * pointValue;
    return {
      symbol,
      pointValue,
      tickSize: 0.25,
      tickValue: pointValue * 0.25,
      riskPerContract,
      maxContracts: riskPerContract > 0 ? Math.floor(riskBudget / riskPerContract) : 0,
    };
  };

  return {
    asOf: es?.lastUpdate ?? new Date().toISOString(),
    session: es?.session ?? 'unavailable',
    source: es ? 'Yahoo ES front-month + live quote service (latest verified close fallback for cash legs)' : 'unavailable',
    prices: { es: es?.price ?? null, spx, spy },
    translation: {
      basis,
      spyPerSpx: spyRatio,
      note: basis == null
        ? 'A live ES and SPX observation is required before conversion.'
        : 'Implied SPX = ES − observed basis. Implied SPY uses the observed SPY/SPX ratio; it is context, not an execution quote.',
    },
    risk: {
      accountSize: input.accountSize,
      riskPct: input.riskPct,
      riskBudget,
      stopPoints: input.stopPoints,
      contracts: [instrument('ES', 50), instrument('MES', 5)],
      note: 'Sizing covers stop distance only. Slippage, fees, trailing drawdown and each prop firm’s daily-loss rules remain separate gates.',
    },
  };
}
