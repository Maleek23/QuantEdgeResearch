# UI redundancy & over-information audit — 2026-10-01

Operator: *"use skills to find redundancy across UI and over-information, especially on phone devices."*

## Method

- **Critique framework:** `design:design-critique` (first impression → usability → hierarchy → consistency → accessibility), applied page by page and focused on four questions: what is said twice, what is explained by default, which paths are redundant, and what a phone loses above the fold.
- **Harness:** the built client was served by the test harness (`research/device-audit.ts`). It uses synthetic fixtures, not market data. This pass added about 30 fixture endpoints, so Catalysts, Crypto, LEAPS, Positions, the Bot page and the market strips render populated layouts instead of error states.
- **Screenshots:** every main page at **375×812, 430×932, 768×1024 and 1440×900**, in light and dark, before and after (240 shots). Pages: Today, NEXUS (board and setup detail), FLOW, Chart, LEAPS, Crypto, Catalysts, Quantinum Bot, Positions, Journal, the ticker page `/r/SPY`, Settings, the landing page and GEX (findings only).
- **Measurement:** the first viewport's visible text is walked node by node. Lines clipped by an overflow ancestor and the harness banner are excluded. Two numbers come out: **visible text lines** (distinct line boxes) and **visible characters**.

**Rules respected:**
- One side nav.
- GEX and FLOW stay tile workspaces; every other page stays a plain scrolling page.
- Today keeps its hand-composed landing layout. Only its density changed, not its structure.
- Honest data: every number keeps its source and age, at most one tap away.
- Brand names: QuantEdge, NEXUS, Quantinum, Quantinum Bot.

**Off limits:** the GEX files (`components/dashboard/tools/gex/*`, `components/gex/*`) are being reworked by another agent and were not edited. GEX findings are listed for that agent.

## Findings, ranked by impact

Labels used below:
- **D**: the same value shown twice or more.
- **O**: explanation, units or plumbing shown by default.
- **N**: redundant navigation or chrome.
- **P**: phone-specific.

| # | Where | Kind | Finding | Status |
|---|---|---|---|---|
| 1 | Every dashboard section, all pages | O, D | Each tool header printed title, then a line of "source · `/api/…` endpoint · age · note", then a line of "what it shows · Units: …". That is 2–4 lines per section, repeated across about 40 sections. Endpoint paths showed in user-facing headers, e.g. `convictions engine · /api/convictions`, `/api/crypto/ideas`, `/api/sector-ignition`. | **Fixed** |
| 2 | Desktop chrome, every page | D | Two disclaimers per screen: the rail note "Decision support only. Not investment advice." and the bottom bar "Educational only · not investment advice". Page rails added a third (Crypto, LEAPS, Catalysts, Bot, FLOW board, Chart lab) and Settings a fourth. | **Fixed** |
| 3 | NEXUS · Market Context | D | Regime, preferred side, 10Y, TLT and the risk level each showed twice: a summary strip, then the body. The regime label appeared three times. Macro freshness appeared twice: as a row and in the footer. | **Fixed** |
| 4 | Today | D | The book count and long/short split appeared in the hero ("The book · 12 live", "Long / Short 8/4") and again in the stats band. The top idea's score appeared in the hero book, the stats band ("Top evidence score NVDA"), the TOP RANKED SETUP card and its SigCard. The best idea's entry, stop and target appeared in the ladder and again in the SigCard beside it. The win rate appeared in the stats band and again in the Model record paragraph. | **Fixed** (phone dedupe; Model record now explains how the record is kept rather than repeating it) |
| 5 | Today | D | The sector-ignition feed was drawn twice: once as a one-line RotationStrip and once as the Sector ignition band, plus the sector tape and the Rotation section. The band's head re-listed the horizon tabs ("0DTE, daily, swing, weeks"). Its meta row stacked "read 3m · data 4m · measuring". A cadence/notes/honesty paragraph followed every list. | **Fixed** (strip removed from Today; band meta shortened to one age; method paragraph moved into a "How it's read" disclosure) |
| 6 | Today | O | The dealer map's 3-line method caption ("Shaded band: SPY's 1σ…") sat under the hero at every size. | **Fixed** (moved into an ⓘ in the map head) |
| 7 | LEAPS | D | The right rail opened with a second header ("Long-horizon · LEAPS Lab.") that repeated the main header's eyebrow, title and description word for word, plus a "LEAPS" tag. On phones the description showed twice in one screen. | **Fixed** (rail header removed; phone description sits behind the section ⓘ) |
| 8 | NEXUS board (phone) | D, P | The rotation strip took about 140 px (5 lines) above the board. It repeats what the per-row "with/against rotation" tags and the Sector Ignition section show. When the feed is down it printed "Sector rotation unavailable right now" in a box. | **Fixed** (phone: one summary line, full read on tap; unavailable = no row, because the Sector Ignition section reports the failure with a retry) |
| 9 | Settings | D, P | "YOUR ACCOUNT" / "THIS DEVICE" printed under every field, even though section subtitles already say "saved on this device". Eight jump chips wrapped onto three rows on phones. | **Fixed** (scope shown once per section; a row prints its scope only when it differs; chips are one sideways row) |
| 10 | Quantinum Bot | D, O | Paper Book: the title "Quantinum Bot Paper Book" was repeated as the label "Paper book · what Quantinum Bot holds · trading Run 3". The run label was repeated again in the run sub-header, and value and cash were repeated in "value … = cash … + 5 open". Blocked Ledger and Outcome Integrity sections each repeated their title as an inner eyebrow. Six job cards each carried a 2–3 line description. A legend line ("running · stale · idle") repeated the status every card shows. Error states printed endpoint paths ("/api/quant-bot/status failed (404)"). | **Fixed** |
| 11 | Crypto | D | Crypto Ideas repeated its title ("Crypto ideas · 24/7") and its age ("last scan 25m ago") next to the section stamp. Structure Lab repeated its title ("Structure lab") and the pair ("BTC/USD · interactive tape") above a chart that names the pair. A method paragraph showed by default. | **Fixed** |
| 12 | Catalysts (phone) | P | The six-column Signal Impact table clipped the one column that matters, Verified event. Filter chips wrapped onto two rows. A long method note showed by default. | **Fixed** (phone shows ticker with side arrow, impact and event with distance; Response rule moved into the note; chips one row; note behind a tap) |
| 13 | FLOW · Options Flow | D | The premium tide's "C $32.85M / P $19.24M" repeated the Calls/Puts premium printed beside it. | **Fixed** (printed only when it differs, i.e. on a multi-day window) |
| 14 | Journal | D | "24 trades" appeared in the page header and again in the filter bar ("24 of 24 trades"). On phones the h1 "Dashboard" repeated the active sub-tab directly above it. | **Fixed** (filter count is announced, not drawn; phone h1 is screen-reader only) |
| 15 | Page bars (NEXUS, Catalysts, Crypto, Bot) and simple pages (Chart, LEAPS, Positions) | N | An eyebrow bar ("NEXUS", "CATALYST" …) repeated the top-bar title. The simple-page bar printed "{title} · {source} · {age}", e.g. "Position Heat Map (all-in-one, classic) · open positions (live repriced) · age shown per row", and the tool itself then printed "Position Heat Map" again. | **Fixed** (bar shown only when it carries the focus ticker; simple bar = stamp + ⓘ; Positions h1 one line on phones) |
| 16 | Ticker page | bug | The change read "▼ −$NaN · −0.49%" when the quote has no `change` field. | **Fixed** (dollar change omitted when not finite) |
| 17 | Desktop bottom bar | regression guard | With live market data the footer market line pushed the (now only) disclaimer off the right edge. | **Fixed** (market line shrinks; disclaimer never clips) |
| 18 | FLOW (desktop) | O | Three rows of filter chips. A focus hint ("row clicks re-point the terminal's ticker"). The toolbar hint "default layout · your changes save automatically". | **Fixed** (leftovers pass: one control row, Filters sheet, hints in ⓘ) |
| 19 | FLOW feed (phone) | P | Contract column truncates ("479C 10-…"). | **Fixed** (leftovers pass: two-line row card) |
| 20 | NEXUS · Setup detail | D | Trigger, stop and T1 show in the trade vector and again as chart price-line labels. Live price shows in the structure header and in the vector. | **Fixed** (leftovers pass: levels in the card, lines-only chart) |
| 21 | Crypto · Spot Read vs Structure Lab | D | BTC spot, 7D and 30D show in both the level strip and the Spot Read card. | **Fixed** (leftovers pass: Spot Read keeps them) |
| 22 | Ticker page | D, N | A "TICKER" eyebrow, the breadcrumb "Research / SPY", the h1 "SPY" and a "SPY ⌘K" switcher sit in one header. The chart legend repeats call wall, put wall and zero-γ from the dealer-map cards above. | **Header fixed** (leftovers pass). Chart legend left. |
| 23 | Quantinum Bot · Automation KPIs (phone) | P | Five KPI cards fill the first screen. | Left (numbers, not prose) |
| 24 | Phone dock | N | The operator brief for this task says Today → NEXUS → FLOW → GEX → **More**. The code and the `nav-architecture.py` N14 HARD check say TODAY · NEXUS · FLOW · GEX · **CHART**, with "More" in the top-bar menu (operator order 2026-09-29). | Not changed. Needs an operator decision; changing it fails N14. |

### GEX — notes for the agent reworking it (nothing edited in the first pass; items 2–3 and the spot-tag overlap fixed in the leftovers pass)

1. **Matrix header: 4 lines of hints before the first strike.**
   - "12/12 expiries · max NOV 28 (60d) · colour: per expiry · click a cell to drill"
   - the legend row
   - "91 strikes · 5 of 12 exp in view · ↔ swipe · ↕ scroll · S = spot"
   - the SCALE row

   Candidate: one line plus an ⓘ.
2. **Spot printed 3–4 times on one screen.** Key Levels shows "$575.40". The matrix has a "SPOT $575.40" marker and a bottom "SPOT 575.40" chip. Regime shows "LAST CLOSE $575.40". The phone header shows the live 576.12 next to the 575.40 snapshot marker without saying which is which.
3. **Walls and net GEX repeated.**
   - Call wall, put wall and zero-γ appear on the Key Levels slider, the Key Levels cards and Regime's "IF PRICE HOLDS INSIDE $565–$585".
   - Net GEX +$4.21B/1% appears twice in Regime: "net GEX +$4.21B/1%" in the posture card and "NET GEX · ALL" in the cells.
4. **Plumbing and hint text.**
   - "change: quote feed unavailable · spot from GEX chain" is a 2-line status inside Key Levels.
   - The toolbar shows "default layout · your changes save automatically".
5. **Shared frame change affects GEX tiles.** `ToolFrame` (shared, `components/dashboard/frame.tsx`) changed in this pass, so GEX tiles also lose their second and third header lines. Description, units, source and feed are now behind the ⓘ popover, and the stamp shows age. Nothing inside `components/gex/*` or `tools/gex/*` was touched.

## Leftovers pass (same day)

This pass covers the rows left open above (#18–#22) and GEX notes 2–3. It used the same harness and fixtures, at 375×812 and 1440×900, in light and dark.

**FLOW (#18).**
- The controls are now one row: window, source, ticker, four primary chips (Calls, Puts, Sweeps, Whales), a **Filters** button and an ⓘ.
- The other 13 chips are in the Filters sheet: a popover on desktop, a bottom sheet on phones. The button shows a count of the active filters that are hidden there. Each chip keeps its tooltip, and the sheet has "Clear all".
- The ⓘ holds what the hint lines used to say:
  - row clicks re-point the ticker (with the focus symbol)
  - "Add stock chart"
  - how the filters combine
  - which filters the feeds can't support
  - Bullflow and chain-scan status and age
- The toolbar save badge reads "default layout". "Your changes save automatically" moved into its tooltip.

**FLOW phone (#19).** Each row is now a two-line card. Line 1 has the ticker chip and the print type. Line 2 has the contract (`479C 10/17`), coloured by side, in full. The full contract with its expiry year is in the row's title and the row sheet.

**NEXUS setup detail (#20).**
- The levels now print in one place: the card under the chart.
  - Each level shows its price, its context, R and progress, and a colour swatch.
  - The Live cell now carries the quote's session, source and age.
- The chart still draws the entry, stop and T1 lines, keyed by colour, but no longer prints text labels for them (`Level.hideLabel`). Their names stay in the chart's accessible description.
- Expanding the chart restores the labels, since the card isn't visible there.
- The structure header no longer prints the live price a second time.

**Crypto (#21).** When the Spot Read tile is on the page and the chart coin is BTC or ETH, the Structure Lab strip stops repeating spot, 7d, 30d, RSI and vol. It points to Spot Read instead. SOL, XRP and QNT keep the strip, since nothing else on the page shows them.

**Ticker header (#22).**
- The header is one line: symbol, price, change, then session · source · delayed · age.
- The "TICKER" eyebrow is removed; the breadcrumb already says it.
- Actions sit on one row that wraps.
- On phones:
  - Watch and alert become 44px icon buttons, each with an accessible name and a title.
  - The switcher drops its ⌘K hint.
- Header height: 223 → 134px at 375 and 148 → 126px at 1440.

**GEX (notes 2–3).**
- **Spot.**
  - Key Levels is the one prominent spot. It shows the live quote, tagged LIVE, with its age, and the chain-snapshot spot labelled "chain snapshot $575.40 @ time".
  - The matrix's jump button reads "◎ Spot" when Key Levels is on the page; its price moved into the tooltip.
  - The matrix spot line's tag reads "SPOT" and sits in the strike column, so it no longer covers the first expiry's cells.
  - Regime no longer prints "LAST CLOSE $575.40".
- **Phone.**
  - The header labels both prices in one place: `LIVE 576.12` and `chain snapshot 575.40 @ 6:24 AM ET`.
  - The spot row in the grid shows `◎ 575`, not a third unlabelled price.
  - The Levels sheet labels its spot "chain snapshot".
- **Walls and net GEX.**
  - Net GEX and net VEX print once, in Regime. When Regime is on the page, Key Levels shows "Net GEX and net VEX → Regime & Narrative" in their place.
  - The posture card no longer repeats net GEX.
  - The rail in Key Levels labels its ticks by name, since the cards below give the prices.
  - When Key Levels is on the page, Regime's playbook names the 0–7 DTE nodes instead of reprinting their strikes.
  - Without the other tile, every number comes back.
- **Fit.** The matrix fills 803/809px (99.3%) at 1440, 696/702px at 1280 and 525/531px at 1024, with no horizontal scroll. This is the same as before the pass.

**Harness.**
- The crypto-ideas fixture's `winRate` is now a fraction (0.45), as the server sends it. It was 45, which rendered as "4500%".
- Device audit for NEXUS, FLOW, GEX and Ticker at 375 and 1440, in dark and light: 9/16 pass both before and after this pass. The failure lists match item for item, so there are no new failures.

### Leftovers pass — before → after (first viewport, harness fixtures)

Lines are distinct text line boxes per block, as counted in this pass. On workspaces, the freed chrome fills with more data rows, so the targeted counts are the better measure.

| Page | 375 lines | 375 chars | 1440 lines | 1440 chars |
|---|---|---|---|---|
| FLOW | 63 → 65 | 358 → 374 | 229 → 258 | 2065 → 2102 |
| NEXUS setup detail | 45 → 45 | 271 → 283 | 188 → 187 | 1844 → 1871 |
| Crypto (top) | 57 → 57 | 705 → 705 | 165 → 165 | 2044 → 2042 |
| Crypto (Structure Lab) | 56 → 48 | 291 → 329 | 139 → 130 | 1324 → 1362 |
| Ticker | 51 → 53 | 386 → 421 | 105 → 104 | 848 → 854 |
| GEX | 95 → 95 | 439 → 446 | 414 → 411 | 2717 → 2658 |

| Targeted measure | 375 before → after | 1440 before → after |
|---|---|---|
| FLOW control block height | 59 → 59px (it already scrolled sideways) | 160 → 47px |
| FLOW phone cells with a cut-off contract | 40 → 0 | — |
| Ticker header height | 223 → 134px | 148 → 126px |
| GEX: visible "575.40" | 1 → 1 (now labelled) | 2 → 1 (labelled; live 576.12 shown once) |
| GEX: "+$4.21B" net GEX prints | 3 → 1 | 3 → 1 |
| Crypto: BTC spot "64,210" prints | 2 → 1 | 3 → 2 (the remaining extra is the BTC idea's entry, a different fact) |

Screenshots are in `docs/ui-redundancy-2026-10-01/leftovers/<page>_<375|1440>_<dark|light>_<before|after>.jpg`. Pages: flow, flowfilters (sheet open), nexusdetail, crypto, cryptolab, ticker and gex. "Before" is dark mode only.

## What changed (mechanics)

- **`components/ui/qe-phone.tsx`**
  - `InfoSheet` is a bottom sheet on phones and a **popover** on desktop, so it is one tap at every size.
  - New `splitSource()` removes `/api/…` and `GET …` segments from the visible source. They show in the ⓘ as **Feed**, together with the tool's `backing`.
- **`components/dashboard/frame.tsx` and `dashboard.tsx`**
  - Every tool and page section header is now one row: title, optional ticker chip, short status note (desktop), `● age`, ⓘ.
  - The provenance line (`.fd-age`, `.pg-prov`, `.fd-prov`) and the blurb (`.fd-tool-blurb`) are no longer rendered. Their content is in the ⓘ.
  - The page eyebrow bar renders only when it carries the focus ticker.
- **Disclaimers**
  - Desktop and tablet carry **one** disclaimer: the bottom bar.
  - The rail note is removed.
  - Page-rail disclaimers are phone-only.
  - The Settings footer is hidden at ≥1024px.
- **Pages**
  - **Today:** map ⓘ, phone dedupe of the book stats and the best idea's card, RotationStrip removed, hero sub clamps to 2 lines on phones.
  - **NEXUS:** Market Context dedupe and a "Feed ages" disclosure.
  - **Sector ignition:** shorter meta line, method behind "How it's read", phone strip collapsed to one line.
  - **LEAPS:** rail header removed.
  - **Crypto:** inner headers removed.
  - **Catalysts:** phone columns.
  - **Bot:** book head dedupe, inner eyebrows hidden in tool mode, job descriptions on one line on desktop and behind a tap on phones, friendly errors.
  - **FLOW:** tide dedupe.
  - **Journal:** count and h1.
  - **Settings:** scope per section, chip row.
  - **Positions:** h1.
  - **Ticker:** NaN fix.
- **`research/device-audit.ts`:** about 30 new synthetic fixtures so the audit sees populated pages. All are labelled `test_harness_fixture` / `fixture`.

## Before → after: first viewport (dark mode)

Lines are distinct visible text line boxes in the first viewport. Chars are the visible characters in that viewport. "Whole page" is the page's full text length.

| Page | 375 lines | 375 chars | 430 chars | 768 chars | 1440 lines | 1440 chars | whole page 375 | whole page 1440 |
|---|---|---|---|---|---|---|---|---|
| today | 25 → 26 | 479 → 456 | 561 → 506 | 685 → 685 | 62 → 58 | 1409 → 1095 | 5263 → 4112 | 5325 → 4382 |
| nexus | 40 → 42 | 654 → 755* | 712 → 805* | 826 → 755 | 90 → 92 | 2789 → 2564 | 3821 → 3528 | 3889 → 3526 |
| flow | 22 → 21 | 374 → 357 | 420 → 403 | 2193 → 1555 | 63 → 60 | 2976 → 2120 | 1704 → 1682 | 5816 → 4821 |
| chart | 12 → 12 | 144 → 144 | 147 → 147 | 438 → 386 | 31 → 29 | 766 → 664 | 148 → 148 | 473 → 417 |
| leaps | 27 → 24 | 481 → 296 | 485 → 305 | 889 → 738 | 66 → 61 | 1671 → 1415 | 2407 → 2181 | 2481 → 2265 |
| crypto | 33 → 34 | 731 → 705 | 888 → 895 | 1903 → 1851 | 56 → 57 | 2276 → 2059 | 2763 → 2515 | 3395 → 3039 |
| catalyst | 41 → 29 | 620 → 520 | 678 → 607 | 1278 → 1214 | 67 → 66 | 1884 → 1728 | 1860 → 1637 | 2683 → 2521 |
| bot | 32 → 35 | 567 → 535 | 657 → 613 | 1429 → 1295 | 79 → 77 | 2222 → 1881 | 2137 → 1953 | 5671 → 5223 |
| positions | 23 → 24 | 304 → 336* | 357 → 357 | 706 → 625 | 46 → 43 | 1076 → 945 | 721 → 721 | 806 → 721 |
| journal | 23 → 22 | 422 → 415 | 470 → 453 | 917 → 896 | 56 → 52 | 1414 → 1352 | 2111 → 2111† | 2416 → 2416† |
| ticker | 27 → 27 | 392 → 386 | 478 → 472 | 1208 → 1202 | 56 → 56 | 1467 → 1417 | 3196 → 3188 | 3449 → 3441 |
| settings | 18 → 16 | 272 → 232 | 311 → 281 | 738 → 817* | 46 → 46 | 1002 → 990 | 3467 → 3268 | 4261 → 4039 |
| gex (not edited) | 26 → 26 | 465 → 465 | 555 → 555 | 2012 → 1500 | 74 → 67 | 3671 → 3048 | 4093 → 4093 | 8792 → 8081 |
| landing (public) | 15 → 15 | 388 → 388 | 445 → 445 | 435 → 435 | 10 → 10 | 453 → 453 | 10156 → 10156 | 9412 → 9412 |

**Reading the table:**
- **Above-the-fold line counts barely move on phones.** A phone viewport holds about 25–40 line boxes whatever fills it. When repeated prose leaves, the next rows of data scroll up into its place.
- **\* rows where characters went *up*.** This is that effect:
  - NEXUS shows two more setup rows where the rotation strip was.
  - Positions shows its stats where the two-line title was.
  - Settings at 768 shows the next fields.
- **Characters are the better density measure.** The whole-page text fell 5–22% on the edited pages: Today −22% on phones, FLOW −17% on desktop, Bot −8%, Settings −6%.
- **GEX moved without being edited.** Its numbers changed only through the shared `ToolFrame` header.
- **† Journal whole-page text is unchanged by design.** The filter count is still in the DOM for screen readers.

The device-audit phone text budget (550 chars; `research/device-audit.ts`) is unchanged for pass/fail:
- **Pass/fail:** 7 of 14 checks pass before and after; no new failures.
- **NEXUS** goes from 654 to 625 under the harness's own counter.
- **Bot** goes from 567 to 553.
- **Today** goes from 479 to 456.
- **Settings** goes from 271 to 231.

## Screenshots

`docs/ui-redundancy-2026-10-01/<page>_<375|1440>_<before|after>.jpg` covers Today, NEXUS, FLOW, Chart, LEAPS, Crypto, Catalysts, Bot, Positions, Journal, Ticker and Settings, in dark mode.

The full set (all four sizes, light and dark, 240 PNGs) is regenerated with `npm run build`, then `AUDIT_SERVE_ONLY=1 npx tsx research/device-audit.ts`, then the screenshot loop described in Method.
