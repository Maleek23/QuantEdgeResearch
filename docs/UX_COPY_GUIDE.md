# QuantEdge — UX copy guide (signed-in app)

Status: v1, 2026-09-30 (branch `feat/uxcopy`). Scope: every word inside the signed-in app —
rail, dock, ⌘K, top bars, tool and section titles, buttons, empty / loading / stale / error
states, toasts, tooltips, numbers. Marketing, landing, pricing, About, FAQ, disclaimers and
idea trigger/stage *instructions* are out of scope here (owned by `docs/POSITIONING.md` and
the compliance pass). Product names are fixed by `docs/POSITIONING.md` — this guide never
overrides it.

## 1. Voice

Plain, precise, trader-native, no hype.

| Do | Don't |
|---|---|
| Say what the thing is, with the noun a trader uses: *call wall*, *zero-γ*, *sweep*, *R*. | "AI-powered", "institutional-grade", "smart", "magic", "unlock". |
| Say what happened, then what to do next. | Blame the user; "Oops!"; exclamation marks. |
| Give a number its unit, its age and (for rates) its *n*. | A win rate without *n*; a price without an age; "live" on delayed data. |
| Measured, not promised: "model projection", "the record says". | "Will", "guaranteed", "predicts". |
| Short: a label is 1–3 words, a tooltip ≤ 8 words, a state ≤ 2 sentences. | Paragraphs in chips; repeating the title in the body. |
| Name the failing thing: "The flow tape didn't load". | "Error", "Something went wrong" alone, raw codes, "undefined", "NaN". |

## 2. Capitalisation

| Element | Case | Examples |
|---|---|---|
| Product names | Fixed (POSITIONING.md) | QuantEdge · NEXUS · Quantinum · Quantinum Bot |
| Page / top-bar titles | Title Case; qualifier after " · " is sentence case | "NEXUS · Trading desk", "Settings", "GEX" |
| Tool, panel and section titles | Title Case for the name; anything after " · " is a sentence-case qualifier; a parenthetical stays lower case | "Key Levels · walls / king node / zero-γ", "Earnings Calendar · 7 days", "Position Heat Map (all-in-one, classic)" |
| Rail / dock / ⌘K labels | Short nav labels, as in `nav-groups.ts` | Today · NEXUS · Flow · GEX · Chart · LEAPS · Crypto · Catalysts · Quantinum Bot · Positions · Journal · Alerts · Guide · Settings |
| Buttons, links, menu items, form labels, tabs inside a tool | Sentence case | "Add to watchlist", "Run Quantinum", "Clear filters", "Display and layout" |
| Toasts, empty/error states, tooltips | Sentence case, full stop only when there are two sentences | "Journal exported" · "No trades in view. Clear a filter or widen the dates." |
| Status chips / tags | UPPER CASE, 1–2 words | DELAYED · CONNECTED · LOW N · WATCH · TRIGGERED |
| Segmented toggles in mono terminal chrome | UPPER CASE, 1–2 words (the terminal's segmented style) | DAILY / CUMULATIVE · BOARD / 0DTE · GEX / VEX |
| Acronyms | Always upper | GEX, VEX, OI, IV, DTE, 0DTE, ET, R:R, P&L, SPX |

Title Case rule: capitalise every word except *a, an, and, or, the, of, by, to, in, on, at,
for, vs, per, with, from* (unless first). Capitalise both parts of a hyphenated word
("Flow-Driven Setups"); "zero-γ" keeps its lower-case γ. Use "&" in titles, "and" in
sentences and buttons.

## 3. Numbers, units and time

One helper module: `client/src/lib/format.ts` (tested by `scripts/test-format.ts`). New code
imports from there; the older per-file helpers (`ticker-data.ts` `fmtPx/fmtPct`,
`gex-colors.ts` `fmtSignedUsd/fmtAge`, `qe-phone.tsx` `compactAge`) print the same shapes.

| What | Format | Helper |
|---|---|---|
| Missing / NaN / Infinity | `—` (em dash). Never "NaN", "undefined", "$0.00" or "0%" for unknown. | `MISSING` |
| Minus sign | `−` (U+2212); `+` only on signed values (P&L, change, R, GEX). | all |
| Price | `$512.34` (2 dp); ≥ $1,000 may drop decimals in dense tables; crypto dust keeps significant digits (`$0.000123`). | `fmtUsd` |
| Money, compact | `$812K`, `$4.2M`, `$2.35B` (K 0 dp, M 1 dp, B 2 dp). | `fmtUsd(v, { compact: true })` |
| Percent | 1 dp by default (`4.2%`); change / P&L signed (`+4.20%` on a quote line). Ratios 0–1 become `42%`. | `fmtPct`, `fmtRatioPct` |
| R multiple | Always signed, 1 dp, capital R, no space: `+1.3R`, `−1.0R`. R:R is `2.5:1`. | `fmtR` |
| Win rate | Never without *n*: `42% · n=88`; *n* = 0 → `— · n=0`; *n* < 20 adds the LOW N chip. | `fmtWinRate` |
| GEX | Dollars per 1% move of the underlying: `+$1.20B per 1% move` (tables: `+$1.20B/1%`). | `fmtGex` |
| VEX | Dollars per 1 vol point: `−$640.0M per vol pt` (tables: `/vol pt`). | `fmtVex` |
| Age (stamp) | `45s`, `2m`, `3.4h`, `2d` — no "ago" inside a stamp or chip. | `fmtDuration`, `FreshStamp` |
| Age (sentence) | `just now`, `45s ago`, `2m ago`, `3h ago`, `2d ago`; unknown → `age unknown`. | `fmtAgo` |
| Clock | 24-hour New York time, always labelled: `09:45 ET`. Never local time without a zone. | `fmtTimeET` |
| Dates | `Sep 30` in tables, `Tue · Sep 30` in headers, ISO only in exports. | — |
| Delayed data | Say `delayed` (lower case inline, `DELAYED` as a chip) next to the source: `CBOE · delayed · 2m`. Never "live" on delayed data. | — |
| Freshness colour | grey ≤ 5 min, amber ≤ 30 min, red beyond (`qe-phone.tsx` thresholds). | `ageTone` |

## 4. States — one pattern: what happened + what to do next

| State | Component | Pattern | Example |
|---|---|---|---|
| Loading | `QELoading` (skeleton) | Optional caption, lower case, ends in "…" | "loading your trades…" |
| Empty (request worked, 0 rows) | `QEEmpty` | What's empty + why / when it fills + the next step. Dashed, no icon. | "No open positions. Track an idea from NEXUS to open one." |
| Error (no data at all) | `QEError` | Title: "<Thing> didn't load". Message: the server's reason (`reasonOf`) or the default, then what still works / what to do. Button: **Retry**. | "The idea book didn't load" · "The server had a problem. Try again in a minute." |
| Stale (refetch failed, old data on screen) | `QEStale` | "Couldn't <verb phrase> · showing data from <age>" + **Retry**. `what` is a verb phrase. | "Couldn't refresh the flow tape · showing data from 2m ago" |

Defaults (`components/ui/qe-states.tsx`):
- `QEError` message: "The request failed — this isn't an empty result, so something may be missing. Retry, or check back in a minute." Retry button: "Retry" / "Retrying…".
- `QEStale`: "Couldn't refresh · showing data from 45s ago · Retry".

Errors never show a status code, an API path, an HTML error page or a stack. `reasonOf()`
(`lib/optimistic.ts`) turns any thrown error into a sentence: the server's own `error`
field if it wrote one, otherwise "Sign in first." (401), "Not allowed for this account."
(403), "Not found — it may have been removed." (404), "Too many requests — wait a moment
and try again." (429), "The server had a problem. Try again in a minute." (5xx / HTML),
"Couldn't reach QuantEdge — check your connection and try again." (network).

Error ≠ empty: check `isError` before the empty branch; an error never says "no data".

## 5. Buttons and actions

- Verb first, sentence case, name the object when it isn't obvious: **Add to watchlist**,
  **Copy link**, **Run Quantinum**, **Arm alert**, **Log trade**, **Import trades**,
  **Clear filters**, **Save changes**, **Download CSV**.
- Never "Click here", "Submit", "OK", "Yes", a bare "Delete" or a bare "Go".
- Toggles name the state they are in and read as an action on hover/aria:
  "On watchlist" (aria: "Remove NVDA from watchlist") / "Add to watchlist".
- In progress: the same verb + "…" — "Saving…", "Deleting…", "Running…".
- Destructive actions say exactly what they delete and offer a way back:
  - With Undo (preferred): act immediately, then an Undo toast — "Deleted NVDA long · Undo".
  - Irreversible: two steps, the confirm button names the loss ("Delete all my trades"), the
    cancel button names what is kept ("Keep my journal"), and the help text says "can't be
    undone".
- Navigation commands in ⌘K start with "Go to" ("Go to NEXUS", "Go to Settings").

## 6. Toasts and confirmations

Helpers: `lib/undo-toast.tsx` — `undoToast`, `failToast`, `doneToast`.

| Kind | Title | Description | Example |
|---|---|---|---|
| Success | Past tense, object named, ≤ 6 words | Optional count or consequence | "Journal exported" · "12 trades saved as CSV." |
| Undoable | Past tense of what just happened | — (button: **Undo**, 6 s, pauses on hover) | "Removed NVDA from watchlist" |
| Failure | "Couldn't <verb> <object>" | `reasonOf(err)`; **Retry** action when retrying makes sense | "Couldn't add NVDA to your watchlist" · "Sign in first." |
| Blocked | What the user must do | — | "Sign in to add NVDA to your watchlist" |

No exclamation marks, no "Success!", no "Error" as a title, no raw error text.
Pluralise counts ("1 trade", "12 trades").

## 7. Tooltips

≤ 8 words; say what the thing *is or does*, not its name again. Longer explanations belong
in the tool's ⓘ info sheet (`what`, `units`, `source`), not in the hover.

| Nav item | Tooltip |
|---|---|
| Today | Morning brief — dealer map and best ideas |
| NEXUS | Trading desk — ranked setups and the 0DTE desk |
| Flow | Options flow — prints, sweeps and blocks |
| GEX | Dealer positioning — GEX, VEX, walls, zero-γ |
| Chart | Charts with walls, zero-γ and idea levels |
| LEAPS | Long-dated calls, graded |
| Crypto | BTC/ETH and the equity proxies |
| Catalysts | Earnings, macro and news calendar |
| Quantinum Bot | Paper-trading bot — rules, fills, public record |
| Positions | Your open positions, stops and alerts |
| Journal | Your trades, insights and track record |
| Alerts | Price and idea alerts |
| Guide | How to use QuantEdge |

## 8. Glossary — one canonical spelling each

| Term | Canonical | In a chart label | Meaning (≤ 1 line) | Don't write |
|---|---|---|---|---|
| Gamma exposure | **GEX** | GEX | Net dealer gamma in $ per 1% move of the underlying. | "Gex", "gamma exp." |
| Vanna exposure | **VEX** | VEX | Dealer delta change in $ per 1 vol point. | "Vex", "vanna exp." |
| Zero gamma | **zero-γ** ("Zero-γ" to start a label) | ZERO-γ | Spot where net dealer gamma crosses zero; the regime boundary, not a target. | "flip", "gamma flip", "zero gamma", "Zero γ", "ZERO Γ" |
| Call wall | **call wall** | CALL WALL | Strike with the largest call gamma above spot. | "Call Wall" mid-sentence, "resistance wall" |
| Put wall | **put wall** | PUT WALL | Strike with the largest put gamma below spot. | "support wall" |
| King node | **king node** ("King node" to start a label; "max γ" as its qualifier) | KING NODE | The strike with the largest absolute net gamma — where price tends to pin. Plain-English cards may say "Magnet" with "king node" beneath it. | "gamma magnet", "Max-γ", "MAX γ", "max gamma" as a label |
| Regime | **long gamma / short gamma** | — | Sign of net GEX: dealers damp (long) or amplify (short) moves. | "positive/negative GEX regime" in UI text |
| Conviction band | **band S / A / B / C** | — | The evidence band of a setup from its conviction points; always with its layer evidence. | "grade" for bands (letter grades A+–F are the contract/LEAPS grader), "tier" |
| Evidence score | **evidence 0–100** | — | The ranked-setup score on NEXUS. | "AI score", "confidence %" |
| Freshness | **age** (stamp `2m`, sentence `2m ago`) | ● 2m | How old the number on screen is. | "last updated" without a time, "live" on delayed data |
| Idea stages | **WATCH → TRIGGERED → IN PLAY → DONE** | chips | 0DTE idea lifecycle. Stage wording and trigger instructions are owned by the compliance pass — change them there. | "Armed", "Active", "Stalking" |
| Setup / idea | **setup** (on NEXUS), **idea** (published, tracked) | — | A ranked trade plan with entry, stop, target. | "signal" as a product name, "pick", "call" (except trader calls) |
| R multiple | **R** (`+1.3R`) | — | Result in units of initial risk. | "1.3 R", "1.3r", "R-multiple" in labels |
| Win rate | **win rate** + *n* | — | Share of decided ideas that won. | a rate without *n* |
| Paper | **paper** | PAPER | Simulated fills (Quantinum Bot). Always say it when money is implied. | "live trades" for the bot |
| Your journal | **My journal** (switcher), "your journal" (prose) | — | The signed-in user's own book (key `mine`). | "Mine", "the Mine book" |
| NEXUS ideas | **NEXUS ideas** | — | Journal book of every published NEXUS idea. | "Trade desk", "Desk book" |
| Ticker page | **ticker page** (`/r/:symbol`) | — | One page per symbol. | "Research page", "dossier" in UI labels |
| Retired names | — | — | Never in UI copy: Oracle, PRISM, Thesis Radar, Trade Desk, Mine, "Markets" (for NEXUS), "BTC Radar". Code ids (`oracle`, `trade-desk/`) and URLs stay. | — |

## 9. Checklist for a new string

1. Is the product/feature name the canonical one above?
2. Right case for its element (§2)?
3. Every number through a `lib/format.ts` helper, with unit, sign and — for rates — *n*?
4. Loading, empty, stale and error states all written, and error ≠ empty?
5. Buttons start with a verb; destructive ones name what they delete?
6. Tooltip ≤ 8 words?
