# Data latency: every quote path, its source and its real delay

Measured 2026-10-01, 07:00–07:15 ET, a Thursday in the pre-market, from a dev machine against live providers.

**Rule** (memory: *Live, Not Carried*): a price is never presented as current unless it is. Every quote from `/api/quotes/batch` carries five fields:

- `session`: one of pre, regular, post, overnight, closed.
- `asOf`: when the price **printed**, not when we fetched it.
- `source`: where the price came from.
- `delayedSec`: how far the feed is known to lag.
- `proxy`: whether the price is estimated from something else.

The UI's `<QuoteFreshChip>` derives its label from those five fields and nothing else. The label rule lives in `shared/quote-freshness.ts` (`freshnessChip`).

## Sessions (ET)

| Session | Window |
|---|---|
| overnight | 20:00–04:00 (Sun 20:00 → Fri 04:00) |
| pre | 04:00–09:30 |
| regular | 09:30–16:00 |
| post | 16:00–20:00 |
| closed | Fri 20:00 → Sun 20:00 |

Exchange holidays are not modelled. On a holiday the age stamp still shows the truth.

## Inventory

| Path (file) | Asset | Upstream source | Real-time? | Pre 04–09:30 | Regular | Post 16–20 | Overnight 20–04 |
|---|---|---|---|---|---|---|---|
| `getRealtimeQuote` stock → `yahooQuote` (`server/realtime-pricing-service.ts`, `server/yahoo-client.ts`) | Stocks, ETFs | Yahoo v8 chart, 1m bars, includePrePost, 8 s cache | **Real-time.** Measured: SPY's last bar was 5 s old in the pre-market. The bar timestamp is the minute start. | yes | yes | yes | **no prints** |
| same → Tradier (`TRADIER_API_KEY`) | Stocks | Tradier `/markets/quotes` | Real-time when funded | yes | yes | yes | no |
| `overlayExtendedHours` (`server/extended-quote.ts`) | Stocks, ETFs | Alpaca `/v2/stocks/trades/latest`, `feed=overnight\|boats` (overnight) or `sip\|iex\|delayed_sip` (pre/post) | overnight/boats/sip: real-time, **but our key gets 403**. iex: real-time but IEX-only volume. delayed_sip: 15 min. | sip/iex/delayed_sip | Yahoo only (no overlay) | sip/iex/delayed_sip | overnight/boats (403 today, so falls back to the last post print, which is stamped) |
| `fetchIndexQuote` (`realtime-pricing-service.ts` → `server/lib/cboe-loader.ts loadCboeQuote`) | SPX, NDX, RUT, VIX, DJX, XSP | CBOE `cdn.cboe.com/api/global/delayed_quotes/quotes/_SPX.json` | **15 min delayed.** `asOf` is now CBOE's `last_trade_time`; before this change it was the fetch time. | close only | delayed | close only | close only |
| Yahoo `^GSPC`, `^NDX`, `^RUT` (same Yahoo path) | Index levels | Yahoo chart | Index calc during RTH only. The 07:00 print was yesterday's close; `asOf` is now `regularMarketTime`, where before it was "now". | close only | yes; age decides "Live" | close only | close only |
| Yahoo `^VIX` family | VIX, VIX9D, VIX3M, VVIX | Yahoo chart | **15 min delayed.** Measured: last print 900 s old. Now tagged `delayedSec: 900`. | delayed (GTH) | delayed | delayed | delayed (GTH) |
| `overlayIndexProxies` (`server/extended-quote.ts`) | SPX, NDX, RUT | RTH: SPY/QQQ/IWM real-time × live ratio (index ÷ ETF at the index print time, from 1m bars; prior-close ratio as fallback). Outside RTH: the fresher of ETF extended print × close ratio, or future (ES=F/NQ=F/RTY=F) × index close ÷ settle. | **Proxy**, always `proxy: true`. Real level is in `underlyingPrice`/`underlyingAsOf`. | ETF proxy (real-time) | used only when the index print is ≥ 60 s old | ETF proxy (futures never used 16–18 ET because the settle has not rolled) | ES=F proxy (Yahoo ES=F ≈ 10 min behind; the age stamp shows it) |
| `getFuturesPrice(s)` (`server/futures-data-service.ts`, `market-api.ts fetchYahooFinancePrice`) | ES, NQ, RTY, CL, GC… | Yahoo `=F`, 30 s cache | **~10 min delayed** (measured: ES=F `regularMarketTime` 600 s old) | yes | yes | yes | yes (Globex 18:00–17:00) |
| `getOptionMark` (`server/tradier-api.ts`) | Single option | Tradier, then Alpaca `indicative`, then CBOE chain, then Yahoo chain | Tradier real-time (dead, 401). Alpaca indicative is ~15 min delayed / indicative, as are CBOE and Yahoo. All but Tradier return `delayed: true`. | — | delayed | — | — |
| Option chains (`contract-engine.ts`, `alpaca-options.ts`, `lib/cboe-loader.ts loadCboeChain`, `cboe-options-fallback.ts`, `yahoo-options-fallback.ts`) | Chains, GEX | Alpaca indicative (90 s cache), CBOE delayed chain (60 s cache), Yahoo v7 options | **Delayed ~15 min** (CBOE, Alpaca indicative). CBOE stays the chain source. | — | delayed | — | — |
| `pre-market-service.ts` | Gappers | Yahoo chart (direct), 60 s cache | Real-time pre/post bars | yes (`__pmLast`) | regular | yes (`__postLast`, wired in this change) | no |
| `extended-hours.ts` `/api/extended-hours` | Single-name extended | Yahoo chart 5m, uncached | ≤ 5 min (bar size) | yes | yes | yes | no |
| `live-equity-stream.ts` → `/api/last-price`, `/ws/prices` | ≤ 30 stocks | Alpaca WebSocket `v2/{ALPACA_DATA_FEED}` (iex default) | Real-time; IEX-only volume on free | IEX hours 08:00– | yes | until 17:00 (IEX) | no |
| `market-pulse.ts` `/api/market-pulse` | SPY/QQQ/DIA/IWM, ^VIX | Yahoo chart, 30 s route cache | Real-time for ETFs, VIX 15 min | yes | yes | yes | no |
| Crypto `fetchCryptoPrice` (`market-api.ts`) | BTC, ETH… | Coinbase WebSocket cache, then CoinGecko (5 min cache), then Yahoo | Coinbase real-time; CoinGecko up to 5 min | 24/7 | 24/7 | 24/7 | 24/7 |
| Legacy `fetchStockPrice` (`market-api.ts`) | Last resort | Alpha Vantage, Finnhub, TwelveData, Yahoo | Mixed. `asOf` is still the fetch time; known gap. | ? | ? | ? | ? |

Feed entitlements were checked with the local Alpaca key on 2026-10-01:

| Feed | Result |
|---|---|
| `iex` | 200 |
| `delayed_sip` | 200 |
| `sip` | 403 "subscription does not permit querying recent SIP data" |
| `overnight` | 403 |
| `boats` | 403 |

The production key may differ. `server/extended-quote.ts` detects 401/403/422 and stops asking that feed for 6 h, so a plan upgrade is picked up automatically within 6 h.

## Bugs fixed with this change

1. **Pre-market % was measured against the D-2 close.** Before the open, Yahoo's `meta.previousClose` is the close before `regularMarketPrice`'s session. Measured: SPY prev 764.20 = the Sep 29 close, while the Sep 30 close was 762.63. Every pre-market change and pre-market gap double-counted yesterday's move. The new `priorRegularCloseFromMeta` (`shared/price-change.ts`) is now used by `dayChangeFromIntradayChart` and `pre-market-service.ts`.
2. **Yesterday's index close was stamped "now".** If `yahooQuote` had no bar, it used `Date.now()`. It now uses `regularMarketTime`.
3. **CBOE levels were stamped with the fetch time.** They now use `last_trade_time`, plus `delayedSec: 900`.
4. **The pre-market service's post-market price never used the post bar.** `meta.postMarketPrice` is null, so it now falls back to `__postLast`.
5. **NEXUS printed the word "Live"** above board or extended prices, and the price flash tracked the board price. Both now follow the shown quote.

## UI

`client/src/components/ui/qe-phone.tsx` `QuoteFreshChip` (same dot + age anatomy as `FreshStamp`) is used by:

- the ticker header (`ticker-page.tsx`)
- the NEXUS selected-idea price (`nexus-parts.tsx`)
- the Today market-pulse SPY panel and tape, which now leads with SPX/SPY/QQQ, each with its own chip (`pages/today.tsx`)

| Label | Meaning |
|---|---|
| Live | regular session, real-time, print ≤ 120 s old |
| Delayed 15m | known feed lag ≥ 60 s |
| Pre-mkt 07:42 / After-hrs 17:10 / Overnight 22:05 | extended-session print time (ET) |
| Live (proxy), Pre-mkt (proxy), Overnight (proxy) | estimated from ETF or future |
| Last 10:14 | regular session but no print for > 120 s |
| Stale | the last refresh failed and the price is carried |
| Close 16:00 | market closed, last print |

## Paid options that remove the delay

Prices were checked on the vendor sites on 2026-10-01. Anything not confirmed there is marked **verify**.

| Option | Monthly | What it fixes |
|---|---|---|
| **Renew the Tradier token** (brokerage account; API included, $0 min) | $0 (Lite) / $10 Pro / $35 Pro Plus. Whether real-time data is free with a funded account is not stated on the pricing page: **verify** | Real-time stock and options quotes and chains (Tradier is first in the stock and option fallback chains), plus index quotes. Removes the dependence on Yahoo throttling. |
| **Alpaca Algo Trader Plus** | **$99** (alpaca.markets/data) | Real-time SIP (all exchanges, unlimited WS symbols) and real-time OPRA options, replacing `indicative`. The `overnight`/`boats` entitlement is not stated: **verify** with Alpaca. If included, real overnight 20:00–04:00 stock prints switch on automatically. |
| **Massive (formerly Polygon.io)** | Stocks Advanced **$199** real-time (Starter $29 / Developer $79 are 15-min delayed). Options and Indices plans are separate: **verify** prices. | Real-time stocks; with the Options and Indices plans, real-time OPRA and real-time SPX/NDX/VIX values (`I:SPX`). This replaces the CBOE 15-min level and the proxy during RTH. |
| **Databento** | Standard **$199** (live, OPRA + US equities + CME). Plus $1,750 and Unlimited $4,500 on annual contracts. | Real-time OPRA and CME futures (ES/NQ, so a real-time overnight SPX proxy). Not listed: CBOE index values (SPX), **verify**. |
| **CBOE real-time index feed (CGI / LiveVol)** | **verify** (exchange fees plus distributor) | Real-time SPX/VIX index values themselves, rather than a proxy. |

## Tests

- `npm run test:quote-freshness` (`scripts/test-quote-freshness.ts`) covers:
  - session clock, DST and the CBOE time parse
  - every chip label
  - the pre-market prior-close fix, and the pre-market service fix
  - RTH and overnight proxy selection, and the post-window futures guard
  - Alpaca entitlement memo
  - `applyFresher`
