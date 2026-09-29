# Dashboard tools — framework + migration map

**Phase 2 (IA_SYSTEM_DESIGN.md §5.1), 2026-09-29, branch feat/dash.** The FLOW tab's
tool board is now the platform framework (`client/src/components/dashboard/`), and every
terminal tab except JOURNAL — plus `/today` — renders `<Dashboard page="…" />`.
`/t?tab=…` URLs are unchanged; each tab's previous board is still reachable as an
"all-in-one (classic)" tool.

## Framework

| File | Role |
|---|---|
| `tool-def.ts` | The tool contract: `{id, category, title, what, units, source, backing, ageInside?, staticContent?, needs?: ['symbol'], defaultSize, minSize, Component}` + `lazyTool` + `DefaultLayout` |
| `registry.ts` | ONE global registry assembled from `defs/<category>.ts`; any tool can be added to any page |
| `pages.ts` | Page specs: storage prefix (`gex:`, `nexus:`… FLOW keeps `flowdash:`), shipped default layouts, the page's own categories (listed first in Add tool) |
| `use-dashboards.ts` | Per-page named dashboards via `/api/user/:id/layouts` (ownership-checked), pageId `<page>:<dashboardId>` e.g. `gex:default`. Shipped defaults stay *pristine* (never written) until changed, so better defaults reach users who never customised; **Restore default** deletes the customised row; shipped dashboards can't be deleted |
| `dashboard.tsx` | Bar (dashboard switcher, focus-ticker picker, Add tool with search, Auto-arrange, Restore default, Clear, save state), 12-col drag/resize grid, keyboard move/resize, per-tool error boundary, phone = one column |
| `frame.tsx` | Tool chrome (title · ticker chip · source · age · what · units), `useToolReport`, `useFocusSymbol`, `useDashState` (per-page shared state), `useToolSetting` (per-placement settings) |

**Server load.** Tool code is `React.lazy`; a tool mounts only when scrolled into view and
unmounts (its polling stops) after 20 s off-screen; tools that read the same endpoint use
the same react-query key (e.g. every GEX ticker tool shares one `/api/gex-vex/terminal/:sym`
query). The terminal route's Alpaca chain requests run in a priority lane ahead of background
hub/scan fetches (`server/alpaca-options.ts` `withAlpacaPriority`).

**Fit.** Desktop: the page is `100dvh − chrome`; only the grid and tool bodies scroll.

## Registry (83 tools)

| Category | id | Title | Defined in |
|---|---|---|---|
{table}

## Default layouts — `tool (x,y w×h)`, 12 columns, 40 px rows

{layouts}

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
| OPTIONS | Flow × GEX Convergence | `ConvergenceCard` → `/api/flow-gex-convergence/top` | As before (was the old FLOW sidebar). |
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
