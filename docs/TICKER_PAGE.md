# The ticker page

"Is Research redundant? I don't know what we should get when we search a ticker."
This is the answer: **search a ticker → one page**, `/r/:symbol`. It replaces the
Research shell (Dossier / GEX surface / Contract lab tabs) and the Dossier's inner
Overview / Chart / Options / Events / Bot tabs.

Code: `client/src/pages/shells/research-shell.tsx` (route + URL grammar),
`client/src/components/ticker/ticker-page.tsx` (page), `ticker-data.ts` (queries),
`ticker-page.css`.

## What a trader needs, in the order they need it

A trader opening a name asks, in order: *where is it and is that live?* → *which way
is the machine leaning and why?* → *where are the levels that matter this week?* →
*is there a trade, and has this name paid before?* → *what are options, the sector
and the calendar saying?* The page is laid out in that order.

### Above the fold

| Block | Content | Source |
|---|---|---|
| Header | Symbol · **one** live price · day change $ and % · quote provider and age (`yahoo · 12s ago`, `delayed` when CBOE) | `/api/quotes/batch` → `getRealtimeBatchQuotes` (the platform's one quote function) |
| Actions | Watch · Alert (level, fires once) · **Run engine** (single header button) · ticker switcher · "Back to <tab>" when the terminal sent you | `/api/watchlist`, `/api/alerts/level`, `/api/engine/analyze/:s` |
| Verdict | One line: Quantinum lean (▲ Bullish / ▼ Bearish / ◆ Mixed / Quiet) · +bull/−bear evidence · the two heaviest layers and the first one's reason | `/api/quantinum/:s` |
| Key stats | Volume vs 20-day avg · ATR 14 (and % of price) · RSI 14 · position in 52-week range · short % float · 30-day return | daily series (indicators only), `/api/short-interest/:s` |
| Dealer map | Call wall · put wall · zero-γ · regime · **week 1σ expected move** (± $, ± %, range) · **next earnings** | `/api/gex-vex/terminal/:s` (on demand for ANY listed name), `/api/weekly-path/:s`, `/api/ticker/:s/read-throughs` |
| Chart | Candles with call/put wall and zero-γ drawn, the week's 1σ band shaded, and a live idea's entry/stop/target when one exists | `NexusPriceChart` |

### Below the fold (sticky section nav)

`Overview · Options · Setups · Evidence · Peers · News | GEX surface · Contract lab`

- **Options** — today's flow for this name (call/put premium, C/P, sweeps; tiles hidden
  when there are no prints), aggressor lean and largest dark-pool level as tags, top
  contracts by premium, ATM IV vs 20-day realized. The contract engine is behind a
  disclosure and only mounts when opened.
- **Setups** — the live idea from the book (side, grade, entry/stop/target, R:R, thesis)
  or one line; this name's **record** over the last 20 sessions from the ledger
  (target / stopped / open / other — win rate withheld under 30 decided); the rules that
  bind the name (short discipline, event risk, BTC proxy, sample floor).
- **Evidence** — Quantinum layers with points, reason and source, the "not measured"
  list, and the published idea's scored layers. **Collapsed by default** — the verdict
  line already carries the headline.
- **Peers & sector** — the group's proxy ETF (e.g. cybersecurity → CIBR, chip equipment →
  SMH) and closest peers from `shared/sector-peers.ts`, all priced by one quote call;
  a one-line read: relative to the ETF, and "moving with / diverging from its group"
  against the peer median. Unmapped names fall back to the scan-universe bucket.
- **News & events** — next earnings (same calendar as Quantinum), bellwether and peer
  earnings read-throughs, macro releases for index ETFs, catalyst headlines.

### Deep views (same URL, same header)

- `?tab=gex` — **GEX surface** (walls, flip, expiry matrix, dealer flow).
- `?tab=analyze` — **Contract lab** (paste any contract).

## Rules the page keeps

1. **One price.** Only the realtime quote prints a price. Daily bars feed indicators and
   never print "last close vs prior close". (The old dossier printed $78.18 +6.12% from
   daily bars under a $79.18 +7.48% header.)
2. **One earnings source.** The date on the dealer map, the News section and Quantinum's
   earnings layer all come from `server/earnings-calendar.ts` (Nasdaq). The old
   "Forward earnings dates are not yet fed" string is gone.
3. **Levels for every name.** Walls/zero-γ are computed on demand from the chain; they
   never depend on a published idea. "No structured levels" is gone.
4. **Empty is one line.** No "No signal" cards; a section with nothing says so in one
   sentence, naming why (feed, coverage, threshold).
5. **No stamped guesses.** When the weekly-path model falls back to its fixed
   `regime-estimate` vol, the page does not print it as this name's move; it applies the
   same formula to the 20-day realized vol of the daily series it holds and says so.
6. **Phone:** one column, body text ≥ 14px, numbers ≥ 16px, no page-level horizontal
   scroll (tables and the section nav scroll inside themselves).

## Retired / merged

| Was | Now |
|---|---|
| Research tab row: Dossier / GEX surface / Contract lab | One page; GEX surface and Contract lab are deep views in the section nav |
| Dossier inner tabs: Overview / Chart / Options / Events / Bot | Overview → above the fold; Chart → above the fold; Options → §Options; Events → §News; Bot ("gates binding") → §Setups "Rules that bind" |
| Header price + second "vs prior daily close" price | One quote with source + age |
| "— no signal" grade chip, Oracle signal card, "Evidence breakdown: No signal … Nothing is scored here without one" | Verdict line + §Setups one-liner + §Evidence (collapsed) |
| "Oracle signal: RUN ENGINE" inside a card | Run engine button in the header |
| "Key levels: No structured levels" | Dealer map (always computed) + idea levels on the chart when present |
| Computed 1y block + chart stats strip + 30-day mini chart | Key stats row |
| Correlation block, keyboard ↑↓ peer hopping | Dropped (low use; peers are one tap) |
| `client/src/components/workup/ticker-workup.tsx` | Deleted (only /r used it) |

## URLs

| URL | Lands on |
|---|---|
| `/r/:symbol` | the page |
| `/r/:symbol#options` (setups, evidence, peers, news, chart) | that section |
| `/r/:symbol?tab=chart|options|flow|events|bot|workup` (legacy) | the page, scrolled to the section; the `tab` is replaced by a `#hash` |
| `/r/:symbol?tab=gex`, `/gex/:symbol`, `/terminal/heatmap` | GEX surface |
| `/r/:symbol?tab=analyze`, `/analyze` | Contract lab |
| ⌘K ticker search, any `openWorkup(sym)` | `/r/:symbol` — the bus now navigates itself on pages with no listener (Today, NEXUS, Slate); the terminal still claims it to add `?from=` |

`client/src/lib/legacy-redirects.ts` is unchanged; `research/check-legacy-redirects.ts`
stays green.

## Data

No calculation is forked on the client except (a) RSI/ATR/52-week/volume ratio over the
daily series and (b) the realized-vol fallback in rule 5. Server changes are additive:

- `/api/quotes/batch` now returns `source` and `delayed` per quote (and
  `realtime-pricing-service` stamps `tradier` / `yahoo` / `cboe` / `legacy multi-source`).
- `/api/ideas/ledger?symbol=` filters one name before the row cap.
- `getUpcomingEarnings(days)` honours `days`: the cache previously kept whichever horizon
  was requested first for six hours, so surfaces could disagree about the same name.
