# Data consistency — one implementation per number

Rule: a number that appears on more than one surface is computed once, carries its
source and as-of, and every surface reads that computation. If two places disagree,
one of them is wrong.

| Metric | Canonical function | Served by |
|---|---|---|
| Last price, % change today, session | `shared/price-change.ts` via `server/yahoo-client.ts yahooQuote` → `server/realtime-pricing-service.ts` | `/api/quotes/batch` (source, session, previousClose, delayed, stale), `/api/market-pulse`, `/api/quantinum/:symbol`, `/api/market-context` |
| Prior close from daily bars | `priorRegularCloseFromDailyChart` / `priorCloseFromDaily` | movers, bullish-trends, market-pulse breadth |
| GEX headline (walls, zero-gamma, max gamma, net GEX, regime) | `server/options-exposures.ts computeExposures` + `shared/gex-math.ts` + `shared/gex-regime.ts` | GEX terminal/hub, `/api/gex/buckets`, `/api/gex-heatmap`, dossier, convictions GEX layer |
| GEX by horizon | `shared/gex-buckets.ts` | `/api/gex/buckets` `byDte` (main engine and CBOE fallback) |
| VIX | `server/market-pulse.ts getVixLevel` (Yahoo ^VIX), null when missing | market-pulse, market-context, weekly path |
| Conviction band + letter | `shared/conviction-bands.ts` (`convictionBandForScore`, `convictionLetterGrade`) | web badges, Discord alerts, Quantinum dossier |
| Model record | `shared/model-record.ts computeModelRecord` (outcome v2, since `OUTCOME_BASELINE_DATE`, no synthetic/excluded rows, null under the sample floor) | `/api/performance/model-record`, `/api/dashboard/stats`, `/api/performance/stats` `.modelRecord`, `/api/performance/outcome-model`, Today record tile, Track record hero |
| Live book membership | `client/src/lib/convictions.ts isLiveBookPick` + shared query key | Today book, NEXUS list |
| Provider agreement | `shared/price-crosscheck.ts` + `server/price-crosscheck.ts` | `/api/data-quality/price-crosscheck/:symbol` |

## Checks

- `npm run test:consistency` — unit tests for the canonical functions.
- `npm run check:consistency -- https://quantedgelabs.net SPY,QQQ,NVDA,TSLA,AMD,BE` —
  live regression across the public endpoints (paced, ~40 requests). Exit 1 on FAIL.

## Price cross-check attribution

The provider cross-check ports the idea and the checks of
[vivek-v-rao/price-check](https://github.com/vivek-v-rao/price-check) (`xprice_check.py`,
MIT License): tolerance of 1¢ AND 0.01% relative, duplicate dates, non-positive prices,
impossible OHLC ordering, >25% one-day returns, dates missing in one provider, pairwise
diagnostics and a median consensus. It reports and never repairs; the report names the
provider the platform itself served.
