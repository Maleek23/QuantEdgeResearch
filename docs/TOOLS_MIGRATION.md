# Dashboard tools — framework + migration map

**Phase 2 (IA_SYSTEM_DESIGN.md §5.1), 2026-09-29, branch feat/dash.** The FLOW tab's
tool board is now the platform framework (`client/src/components/dashboard/`), and every
terminal tab except JOURNAL — plus `/today` — renders `<Dashboard page="…" />`.
`/t?tab=…` URLs are unchanged; each tab's previous board is still reachable as an
"all-in-one (classic)" tool.

## Page modes (operator decision, 2026-09-29, branch feat/modes)

Only **GEX** and **FLOW** are *workspaces*; every other dashboard page is *fixed*.
The mode is `PageSpec.mode` in `pages.ts`; `dashboard.tsx` renders by it.

| Page | Mode | What the viewer can change | Add-tool catalogue |
|---|---|---|---|
| GEX (`/t?tab=gex`) | **workspace** | Add tool, drag / resize, keyboard move, Auto-arrange, Clear, Restore default, named dashboards (switcher, rename, new, delete) — saved per user (`gex:*` rows) | Default GEX layout (2026-09-29): matrix 8×18 · key levels 4×9 · regime 4×9 — everything else via Add tool. `GEX_CATALOG` (trimmed 2026-09-29, "don't confuse people"): category **GEX** + `stock-chart`, `chart-levels` + compact flow read `flow-context` — no generic market-context tiles |
| FLOW (`/t?tab=flow`) | **workspace** | same as GEX — saved per user (`flowdash:*` rows, unchanged) | `FLOW_CATALOG` (trimmed 2026-09-29): categories **Options** + **Dark Pool** + `stock-chart` + compact GEX read (`gex-levels`, `gex-regime`). Default *Market flow*: Options Flow 8×12 top-left, Top tickers 8×6 under it, right column Market tide · GEX levels · Dark pool (4×6 each); phone order feed → tide → top tickers → rest |
| Today (`/today`) | fixed | nothing (focus ticker only, if a tool follows it) | — |
| NEXUS (`/t`) | fixed | nothing (focus ticker) | — |
| CATALYST, CRYPTO, BOT | fixed | nothing (focus ticker) | — |
| JOURNAL dashboard view | fixed | nothing (the journal's own book/filter bar still applies) | — |
| CHART, LEAPS, POSITIONS | simple | CHART's watchlist rail open/closed (per device) | — (the *Customize* switch is gone) |

A **fixed** page renders `defaults[0]` through `materialize()` in the same tiles
(same frame, provenance, lazy mount, phone stacking) with no grip, remove, resize,
bar actions or dashboard switcher; the bar says *curated layout*. It never calls
`useDashboards`, so a layout a user saved for that page before this change is
ignored — not read, not deleted (the `nexus:*`, `today:*`… rows stay in
`user_page_layouts`). Tools that used to offer "add X" (`today-week-map`'s
*Today's best idea*, NEXUS's *Add detail* hint, Options Flow's *Add Stock Chart*)
check `useDashboard().editable` and do not offer an add on a fixed page.

A workspace's saved layout keeps working even if it holds a tool that is no longer
in its catalogue (the registry, not the catalogue, decides what renders); the
catalogue only limits what *Add tool* offers.

## Framework

| File | Role |
|---|---|
| `tool-def.ts` | The tool contract: `{id, category, title, what, units, source, backing, ageInside?, staticContent?, needs?: ['symbol'], defaultSize, minSize, Component}` + `lazyTool` + `DefaultLayout` |
| `registry.ts` | ONE global registry assembled from `defs/<category>.ts`; what a page may *add* is its catalogue, not the registry |
| `pages.ts` | Page specs: `mode` (workspace / fixed / simple), workspace `catalog` (`GEX_CATALOG`, `FLOW_CATALOG`, `inCatalog()`), storage prefix (`gex:`, `nexus:`… FLOW keeps `flowdash:`), shipped default layouts, the page's own categories (listed first in Add tool) |
| `use-dashboards.ts` | Per-page named dashboards via `/api/user/:id/layouts` (ownership-checked), pageId `<page>:<dashboardId>` e.g. `gex:default`. Shipped defaults stay *pristine* (never written) until changed, so better defaults reach users who never customised; **Restore default** deletes the customised row; shipped dashboards can't be deleted |
| `dashboard.tsx` | By mode: `GridDashboard` (workspace — bar with dashboard switcher, focus-ticker picker, Add tool with search over the catalogue, Auto-arrange, Restore default, Clear, save state; 12-col drag/resize grid, keyboard move/resize), `FixedDashboard` (fixed — same tiles, no editing), `SimpleView` (simple); per-tool error boundary, phone = one column |
| `frame.tsx` | Tool chrome (title · ticker chip · source · age · what · units; `grip={false}` on fixed pages), `useToolReport`, `useFocusSymbol`, `useDashboard()` (`page`, `hasTool`, `addTool`, `editable`), `useDashState` (per-page shared state), `useToolSetting` (per-placement settings) |

**Server load.** Tool code is `React.lazy`; a tool mounts only when scrolled into view and
unmounts (its polling stops) after 20 s off-screen; tools that read the same endpoint use
the same react-query key (e.g. every GEX ticker tool shares one `/api/gex-vex/terminal/:sym`
query). The terminal route's Alpaca chain requests run in a priority lane ahead of background
hub/scan fetches (`server/alpaca-options.ts` `withAlpacaPriority`).

**Fit.** Desktop: the page is `100dvh − chrome`; only the grid and tool bodies scroll.

## Registry (93 tools)

| Category | id | Title | Defined in |
|---|---|---|---|
| Options | `options-flow` | Options Flow | `defs/flow.ts` |
| Options | `top-tickers` | Top tickers | `defs/flow.ts` |
| Options | `flow-sweeps-blocks` | Sweeps & blocks | `defs/flow.ts` |
| Options | `flow-unusual` | Unusual activity · vol/OI | `defs/flow.ts` |
| Options | `repeat-buyers` | Repeat & position builders | `defs/flow.ts` |
| Options | `flow-alerts` | Flow Alerts | `defs/flow.ts` |
| Options | `market-tide` | Market Flow Tide | `defs/flow.ts` |
| Options | `flow-setups` | Flow-driven setups | `defs/flow.ts` |
| Options | `index-pulse` | Index 0DTE Pulse | `defs/flow.ts` |
| Options | `historical-flow` | Historical Flow (classic) | `defs/flow.ts` |
| Options | `net-flow-strike` | Flow by strike · call vs put ladder | `defs/flow.ts` |
| Options | `flow-strike-expiry` | Flow by expiry · strike × expiry heatmap | `defs/flow.ts` |
| Options | `flow-timeline` | Premium timeline | `defs/flow.ts` |
| Options | `net-premium` | Net premium · provider | `defs/flow.ts` |
| Options | `flow-gex-convergence` | Flow × GEX convergence | `defs/flow.ts` |
| Options | `flow-context` | Flow context | `defs/flow.ts` |
| Dark Pool | `dark-pool-flow` | Dark pool · levels & prints | `defs/flow.ts` |
| GEX | `gex-dealer-map` | Dealer map · near-term ladder | `defs/gex.ts` |
| GEX | `gex-matrix` | Strike × expiry matrix | `defs/gex.ts` |
| GEX | `gex-profile` | Gamma profile · zero-γ | `defs/gex.ts` |
| GEX | `gex-levels` | Key levels · walls / magnet / flip | `defs/gex.ts` |
| GEX | `gex-regime` | Regime & narrative | `defs/gex.ts` |
| GEX | `gex-gravity` | Gravity & strongest nodes | `defs/gex.ts` |
| GEX | `gex-rankings` | Cross-ticker rankings | `defs/gex.ts` |
| GEX | `gex-setups` | Magnet setups · screener | `defs/gex.ts` |
| GEX | `squeeze-radar` | Squeeze radar · gamma squeeze build (also in FLOW's catalogue via `GEX_CONTEXT`; docs/GAMMA_SQUEEZE.md) | `defs/gex.ts` |
| GEX | `gex-hub` | GEX Hub (all-in-one) | `defs/gex.ts` |
| Market | `money-flow` | Money flow · sector rotation | `defs/gex.ts` |
| Ideas | `nexus-board` | Ranked setups | `defs/nexus.ts` |
| Ideas | `nexus-detail` | Setup detail | `defs/nexus.ts` |
| Ideas | `nexus-developing` | Developing candidates | `defs/nexus.ts` |
| Ideas | `nexus-positions` | Bot positions | `defs/nexus.ts` |
| Market | `nexus-context` | Market context · macro risk | `defs/nexus.ts` |
| Ideas | `nexus-trader-calls` | Trader calls · ranked traders' open calls (evidence) | `defs/nexus.ts` |
| Ideas | `nexus-horizon` | Book by horizon | `defs/nexus.ts` |
| Ideas | `nexus-0dte` | 0DTE desk (NEXUS "0DTE" view; ?nx=0dte) | `defs/nexus.ts` |
| Ideas | `nexus-classic` | NEXUS (all-in-one, classic) | `defs/nexus.ts` |
| Market | `chart-lab-chart` | Chart Lab · levels chart | `defs/chart.ts` |
| Research | `chart-levels` | QuantEdge levels | `defs/chart.ts` |
| Market | `chart-es-risk` | ES translation · futures risk | `defs/chart.ts` |
| Market | `chart-watchlists` | Watchlists · mine + traders | `defs/chart.ts` |
| Market | `chart-readouts` | Market readouts | `defs/chart.ts` |
| Research | `chart-lab` | Chart Lab (all-in-one, classic) | `defs/chart.ts` |
| Crypto | `crypto-spot` | Spot read · BTC / ETH | `defs/crypto.ts` |
| Crypto | `crypto-chart` | Structure lab · coin chart | `defs/crypto.ts` |
| Crypto | `crypto-summary` | Crypto summary · ratio & feeds | `defs/crypto.ts` |
| Crypto | `crypto-sentiment` | Fear & Greed · BTC dominance | `defs/crypto.ts` |
| Crypto | `crypto-correlation` | Proxy correlation · ~30d | `defs/crypto.ts` |
| Crypto | `crypto-proxy-gate` | Proxy promotion gate | `defs/crypto.ts` |
| Crypto | `crypto-proxy-board` | Proxy board · BTC & ETH routes | `defs/crypto.ts` |
| Crypto | `crypto-guide` | How to read crypto | `defs/crypto.ts` |
| Crypto | `crypto-board` | Crypto (all-in-one, classic) | `defs/crypto.ts` |
| Catalyst | `catalyst-impact` | Signal impact · calendar × book | `defs/catalyst.ts` |
| Catalyst | `catalyst-earnings` | Earnings calendar · 7 days | `defs/catalyst.ts` |
| Catalyst | `catalyst-econ` | Economic calendar · macro releases | `defs/catalyst.ts` |
| Catalyst | `catalyst-summary` | Catalyst summary · coverage | `defs/catalyst.ts` |
| Catalyst | `catalyst-distance` | Distance to event | `defs/catalyst.ts` |
| Catalyst | `catalyst-classic` | Catalyst (all-in-one) | `defs/catalyst.ts` |
| Ideas | `leaps-list` | LEAPS · ranked contracts | `defs/leaps.ts` |
| Ideas | `leaps-summary` | LEAPS summary | `defs/leaps.ts` |
| Ideas | `leaps-grades` | LEAPS grade distribution | `defs/leaps.ts` |
| Ideas | `leaps-classic` | LEAPS (all-in-one) | `defs/leaps.ts` |
| Bot | `bot-stats` | Automation KPIs | `defs/bot.ts` |
| Bot | `bot-jobs` | Engines & jobs | `defs/bot.ts` |
| Bot | `bot-book` | Paper book · open positions | `defs/bot.ts` |
| Bot | `bot-history` | Paper trade history | `defs/bot.ts` |
| Bot | `bot-ledger` | Blocked ledger · shadow shorts | `defs/bot.ts` |
| Bot | `bot-rules` | Gates & rules | `defs/bot.ts` |
| Bot | `bot-log` | Activity log | `defs/bot.ts` |
| Bot | `bot-queue` | Macro queue · FRED | `defs/bot.ts` |
| Bot | `bot-outcomes` | Outcome integrity · SR 11-7 | `defs/bot.ts` |
| Bot | `bot-status` | Safeguards & system status | `defs/bot.ts` |
| Bot | `bot-classic` | BOT board (all-in-one, classic) | `defs/bot.ts` |
| Book | `positions-pnl` | Net open P&L · KPIs | `defs/positions.ts` |
| Book | `positions-heat` | Position heat map | `defs/positions.ts` |
| Book | `positions-best-worst` | Best vs worst | `defs/positions.ts` |
| Book | `positions-mix` | Book mix · source / asset | `defs/positions.ts` |
| Book | `positions-table` | Positions detail table | `defs/positions.ts` |
| Book | `positions-classic` | Position heat map (all-in-one, classic) | `defs/positions.ts` |
| Market | `today-week-map` | Week Dealer Map · SPY | `defs/today.ts` |
| Ideas | `today-best-idea` | Today's Best Idea | `defs/today.ts` |
| Ideas | `today-ranked-book` | Ranked Book | `defs/today.ts` |
| Market | `today-index-desk` | Index Desk | `defs/today.ts` |
| Ideas | `today-book-stats` | Book Stats | `defs/today.ts` |
| Journal | `today-model-record` | Model Record | `defs/today.ts` |
| Market | `today-rotation` | Sector Rotation | `defs/today.ts` |
| Market | `today-tape` | Sector & Crypto Tape | `defs/today.ts` |
| Market | `today-crypto` | Crypto Pulse | `defs/today.ts` |
| Market | `stock-chart` | Stock Chart | `defs/market.ts` |
| Market | `watchlist` | Watchlist | `defs/market.ts` |
| Market | `market-pulse` | Market pulse | `defs/market.ts` |
| Market | `market-rotation` | Rotation map | `defs/market.ts` |
| Market | `market-session-brief` | Session brief | `defs/market.ts` |

## Default layouts — `tool (x,y w×h)`, 12 columns × 18 rows (rows scale to the viewport)

Every default tiles 12 × 18 exactly (DEV assertion `tilingIssues`, pages.ts). Only the GEX and FLOW layouts are starting points a viewer can edit; every other page below renders exactly this layout (fixed). CHART, LEAPS and POSITIONS are SIMPLE pages (`PageSpec.simple`: `stock-chart` + `chart-watchlists` rail, `leaps-classic`, `positions-classic`); their grid layouts below are kept only for the loading skeleton's reference and are not rendered.

- **flow:default** (Market flow) — `options-flow` (0,0 8×11), `top-tickers` (8,0 4×11), `market-tide` (0,11 4×7), `flow-sweeps-blocks` (4,11 4×7), `flow-unusual` (8,11 4×7)
- **flow:ticker** (Ticker flow) — `stock-chart` (0,0 6×11), `net-flow-strike` (6,0 3×11), `flow-gex-convergence` (9,0 3×11), `flow-strike-expiry` (0,11 6×7), `flow-timeline` (6,11 3×7), `dark-pool-flow` (9,11 3×7)
- **gex:default** (GEX) — `gex-matrix` (0,0 7×10), `stock-chart` (7,0 5×10), `gex-dealer-map` (0,10 3×8), `gex-levels` (3,10 3×8), `gex-regime` (6,10 3×8), `gex-profile` (9,10 3×8)
- **nexus:default** (NEXUS) — `nexus-board` (0,0 3×18), `nexus-detail` (3,0 6×11), `nexus-context` (9,0 3×6), `nexus-trader-calls` (9,6 3×5), `nexus-developing` (3,11 5×7), `nexus-positions` (8,11 4×7)
- **chart:default** (Chart) — `stock-chart` (0,0 8×18), `chart-watchlists` (8,0 4×11), `chart-levels` (8,11 4×7)
- **chart:lab** (Chart Lab) — `chart-lab` (0,0 12×18)
- **crypto:default** (Crypto) — `crypto-chart` (0,0 8×11), `crypto-spot` (8,0 4×11), `crypto-proxy-gate` (0,11 6×7), `crypto-sentiment` (6,11 3×7), `crypto-correlation` (9,11 3×7)
- **catalyst:default** (Catalyst) — `catalyst-impact` (0,0 8×11), `catalyst-earnings` (8,0 4×11), `catalyst-econ` (0,11 5×7), `catalyst-distance` (5,11 4×7), `catalyst-summary` (9,11 3×7)
- **leaps:default** (LEAPS) — `leaps-list` (0,0 7×18), `stock-chart` (7,0 5×11), `leaps-summary` (7,11 5×7)
- **bot:default** (BOT) — `bot-stats` (0,0 12×3), `bot-book` (0,3 5×8), `bot-ledger` (5,3 4×8), `bot-outcomes` (9,3 3×8), `bot-jobs` (0,11 6×7), `bot-history` (6,11 6×7)
- **positions:default** (POSITIONS) — `positions-pnl` (0,0 12×3), `positions-heat` (0,3 8×9), `positions-best-worst` (8,3 4×5), `positions-mix` (8,8 4×4), `positions-table` (0,12 12×6)
- **today:default** (Today) — an editorial PAGE (one band per row, `.dash-today` in today.css): `today-tape` (0,0 12×1), `today-premarket` (0,1 12×1), `today-week-map` (0,2 12×6), `today-index-desk` (0,8 12×2), `today-best-idea` (0,10 12×3), `today-ranked-book` (0,13 12×2), `today-rotation` (0,15 7×2), `today-crypto` (7,15 5×2), `today-model-record` (0,17 7×1), `today-book-stats` (7,17 5×1)

## FLOW domain — one owner for everything options-flow (feat/flowdom, 2026-09-29)

The FLOW page owns every options-flow function. Each function has exactly one
tool; only the GEX workspace may *add* a flow tool (and only `flow-context`), and
other pages' **default** layouts carry at most the compact `flow-context` tool (which links to `/t?tab=flow`). In
reverse, FLOW's default carries one GEX-reading tool — `flow-gex-convergence`,
which reads the GEX page's own query and links to `/t?tab=gex` — never the GEX
workspace.

| Function | Owning tool | Data source (real feeds only) | Limits / honesty |
|---|---|---|---|
| Market-wide tape | `options-flow` | `/api/flow/tape` = Bullflow SSE ring (no provider call) + `options_flow_history` chain scan, 15 s cache | chain scan capped at newest 1,500 rows market-wide; no aggressor side on either feed |
| Leaders | `top-tickers` | Bullflow `optionsTopTickers` (6-min cache) **or** our tape (toggle) | provider net = ask − bid (provider inference); tape = premium activity |
| Sweeps & blocks | `flow-sweeps-blocks` | tape | chain-scan patterns are inferred ("-like") |
| Unusual (vol/OI) | `flow-unusual` | tape, chain-scan rows only | Bullflow alerts carry no OI |
| Position builders | `repeat-buyers` (upgraded) | `/api/flow/repeats`, `/api/flow/exits` (OI history) + repeat prints from tape | session-level; coverage warning shown when history is thin/stale |
| Alerts | `flow-alerts` | tape, Bullflow rows | stream state in the frame |
| Market tide | `market-tide` | Bullflow `netPremiumSeries` SPY (3-min cache, 2 cold symbols/min) | SPY proxy, not the whole tape |
| Flow-driven setups | `flow-setups` | `/api/convictions` (shared NEXUS key) | flow-originated = source `flow` / "Aggressor tape:" catalyst; flow-confirmed = a positive layer whose reason cites flow |
| Flow by strike | `net-flow-strike` (upgraded) | `/api/flow/tape?symbol=` (new param; per-ticker 1,500 cap) + spot `/api/quotes/batch` | Auto source = chain scan if it has rows, else Bullflow — never summed unless "Both" is picked |
| Flow by expiry | `flow-strike-expiry` | same per-symbol tape | √-scaled tint, value printed |
| Premium timeline | `flow-timeline` | per-symbol or market tape | chain-scan rows sit at first-detection time, not trade time (stated) |
| Provider net premium (ticker) | `net-premium` | Bullflow `netPremiumSeries` | throttled state shown |
| Flow × GEX | `flow-gex-convergence` (replaces the scanner ConvergenceCard) | per-symbol tape + `useGexTerminal` (GEX page query, not recomputed) | co-location, not direction; frame age = older of the two |
| Dark pool | `dark-pool-flow` (upgraded) | `/api/chart/overlays` darkPool (28-day levels, 30-min + disk cache) or `/api/bullflow/context` (today ≥ $1M, 6-min cache) | levels, not direction; truncation disclosed |
| Flow context (other pages) | `flow-context` | per-symbol tape, today | compact; link to FLOW |
| 0DTE index context | `index-pulse` | SPX intelligence + Bullflow status | unchanged |
| Classic board | `historical-flow` | FlowBoard → `/api/options-flow` | kept as the all-in-one (still hosts the scanner convergence rail) |

Bullflow's process-wide 8 req/min budget: no new tool calls Bullflow per
render; every Bullflow read goes through the existing cached helpers above.
Colours: calls blue / puts vermilion (`tools/flow/flow-colors.ts`, the GEX
convention), never green/red. The ticker tools share one window / source / DTE
setting (`useDashState('flow:*')`) and one `/api/flow/tape?symbol=` request.

**Defaults.** FLOW ships two dashboards and they now always show (the old
`seedOnlyWhenEmpty` flag is off for FLOW; pre-framework rows stay as the
user's own): *Market flow* (market tape on top → focused-ticker ladder /
heatmap / chart → timeline / Flow × GEX / dark pool → builders / alerts) and
*Ticker flow* (one symbol; list tools start scoped to it).

**What moved out of / into other pages' defaults.** No other page's default
contained a flow view (audited: GEX, NEXUS, Today, Chart, Crypto, Catalyst,
LEAPS, BOT, Positions). GEX and NEXUS defaults each gained the single compact
`flow-context` tool (GEX: under cross-ticker rankings; NEXUS: beside the
horizon book). `stock-chart` and `watchlist` definitions moved from
`defs/flow.ts` to `defs/market.ts` (ids unchanged) — they are Market functions
(`research.chart`, `markets.watchlist`), not flow. `market-tide` moved from the
Market to the Options (flow) category.

---

# FLOW tools — original migration map (flowdash)

The FLOW tab (`/t?tab=flow`) is now a tool dashboard (`client/src/components/flowdash/`),
modelled on Bullflow's "Add tool" layout: named dashboards, a grouped catalogue,
drag / resize on a 12-column grid, Auto-arrange, Clear. Each tool wraps an existing
component or endpoint wherever one exists. This file lists what each tool replaces so
the duplicated surfaces can be retired later. **Nothing has been deleted yet.**

## Tool registry

| Group | Tool | Backing component / endpoint | Data availability |
|---|---|---|---|
| OPTIONS | Options Flow | new `OptionsFlowTool` → `GET /api/flow/tape` (new; `server/flow-tape.ts`) | Bullflow SSE alert ring (in-process, no provider call) + `options_flow_history` chain scan; 15 s server cache. No spot/OI/side on Bullflow rows; no side on either source. |
| OPTIONS | Top Tickers | `GET /api/bullflow/leaders` → `getTopTickers` (6-min cache) | Live when `BULLFLOW_API_KEY` set; provider net premium (ask − bid). |
| OPTIONS | Historical Flow | `FlowBoard` (`components/flow/flow-board.tsx`) → `/api/options-flow` | The previous FLOW tab, unchanged: 1D/1W/1M/all windows, desk score, cards, follow-through rail. |
| OPTIONS | Net Premium | `GET /api/bullflow/net-premium-series/:symbol` (new) → `getNetPremiumSeriesToday` | Shares the 3-min service cache entry with `getNetPremiumToday`; route caps dashboards at 2 cold symbols/min and says "throttled" when it does. |
| OPTIONS | Net Flow By Strike | `GET /api/flow/tape` (shared with Options Flow) | Call vs put premium per strike for the focused ticker from loaded prints only — activity, not direction. |
| OPTIONS | Flow Alerts | `GET /api/flow/tape` (Bullflow rows) | Bullflow algo + custom alerts, alert names verbatim. |
| OPTIONS | Repeat Buyers & Exits | `RepeatBuyers` → `/api/flow/repeats`, `/api/flow/exits` | As before (was the old FLOW sidebar). |
| OPTIONS | Flow × GEX Convergence | ~~`ConvergenceCard` → `/api/flow-gex-convergence/top`~~ superseded 2026-09-29 by the per-ticker tool (see FLOW domain above); ConvergenceCard remains inside Historical Flow | — |
| OPTIONS | Index 0DTE Pulse | `IndexZeroDtePulsePanel` (exported from flow-board.tsx) → `/api/spx/intelligence`, `/api/index-scalps`, `/api/bullflow/status` | As before (was the strip at the top of the old FLOW tab). |
| MARKET | Stock Chart | `FlowChartBoard` (`components/charting/flow-chart-nexus.tsx`) | Follows the shared ticker; a row click in any flow tool re-points it. GEX bubbles, dark-pool levels, flow markers per its own layers. |
| MARKET | Watchlist | `WatchlistRail` (`components/oracle/oracle-rails.tsx`) → `/api/watchlist` + `/api/extended-hours` | User's watchlist; age = extended-hours scan age. |
| MARKET | Market Flow Tide | `GET /api/bullflow/net-premium-series/SPY` | **SPY as a market proxy**, not the whole tape (Bullflow's market-wide tide endpoint is not wired). |
| GEX | GEX Chart | `GexHubNexus` (`components/gex/gex-hub-nexus.tsx`) | The full GEX hub (map / surface / ranks). |
| GEX | GEX Levels | `GET /api/gex-vex/rankings` (background job cache) | Only for tickers inside the rankings job's rows; otherwise says so. |
| GEX | GEX Setups | `GexRankingsPanel` → `/api/gex-vex/rankings` | Magnet setups (`server/gex-magnet.ts`), −VEX, lowest GEX+, pins. |
| DARK POOL | Dark Pool Flow | `GET /api/bullflow/context/:ticker` → `getDarkPoolTrades` (6-min cache) | Top 5 prints ≥ $1M notional today for the focused ticker. |

### Not offered (no data source yet)

| Bullflow tool | Why absent |
|---|---|
| Option Chart | No per-contract intraday price series endpoint. |
| Dark Pool Alerts | No dark-pool alert stream; only on-demand reads. |
| Net GEX Heatmap (standalone) | Covered inside GEX Chart (strike × expiry map); `/api/gex-heatmap/:symbol` is a separate, older Tradier GEX calculation and was not reused to avoid a second GEX math on screen. |
| Trade Terminal | No broker order ticket in this surface. |

### Options Flow filter chips

Implemented: ETFs, Stocks, Sweeps, Calls, Puts, Unusual, Urgent, Position Builders,
Sizable, Grenade, 100k+, Whales, LEAPS, 0DTE, High Sig, Repeat Flow, Large Size.
Hidden because neither feed measures them: Bid / Ask / AA / BB / Mid (aggressor
side), Rising Vol, AM Spike, Earnings Soon, Bullflow's proprietary "Bullflow" flag.

### SigScore (0–1, an ordering — not a probability, not a direction)

```
0.40 × size       clamp((log10(premium) − log10($50K)) / (log10($10M) − log10($50K)))
0.20 × aggression sweep 1 · block 0.5 · other 0
0.20 × repeat     min(1, (n − 1) / 4), n = prints of the same contract in the window
0.20 × vol/OI     min(1, volume ÷ OI ÷ 5)
```
Inputs a source does not carry score 0 (Bullflow alerts have no OI → max 0.80).
Defined in `client/src/components/flowdash/tape.ts`; the column tooltip shows the
per-row breakdown.

## Surfaces that become redundant (retire later)

| Existing surface | Now covered by | Notes before retiring |
|---|---|---|
| Old FLOW tab body (`FlowBoard`) | Options Flow + Historical Flow + Repeat Buyers + Convergence + Index 0DTE Pulse tools | Kept verbatim as the Historical Flow tool; retire once the operator confirms the 1W/1M windows and cards view aren't needed outside it. |
| `components/research/flow-table.tsx` | Options Flow | Already orphaned (no importer). Safe to delete. |
| GEX tab's rankings panel (`GexRankingsPanel` inside GexHub) | GEX Setups tool | The GEX tab itself stays until the hub is decomposed; the panel is the same component in both places. |
| CHART tab default view (`FlowChartBoard`) | Stock Chart tool | Same component; the CHART tab also hosts Chart Lab, so only the duplication — not the tab — goes. |
| Oracle watchlist rail (`WatchlistRail`) | Watchlist tool | Same component; decide which placement stays. |
| Ticker Workup flow/dark-pool blocks (`/api/options-flow?symbol=`, `/api/bullflow/context`) | Options Flow (ticker filter) + Dark Pool Flow | Workup is per-ticker deep dive; keep, but it no longer needs its own flow table. |
| NEXUS time & sales strip (`/api/options-flow?limit=12` in pages/nexus.tsx) | Flow Alerts / Options Flow | Candidate for removal from NEXUS. |
| Research shell `?tab=flow` (already redirects into the workup) | Options Flow | Remove the legacy tab id once no links use it. |

## Persistence

Dashboards persist through the existing `/api/user/:userId/layouts` API
(`user_page_layouts`): one row per dashboard, `pageId = flowdash:<id>`,
`layoutName` = dashboard name, `widgets = [{id,type,x,y,width,height,visible}]`,
`columns = 12`, `rowHeight = 40`. A device copy is kept in `localStorage`
(`qe-flowdash-v1`) for signed-out viewers or when the API is unreachable, and the
dashboard header states which of the two it is saved to.

The four layouts routes previously took `:userId` from the URL with no session
check (anyone could read or overwrite anyone's layouts). They now require the
session user to match `:userId` (401 / 403 otherwise).
