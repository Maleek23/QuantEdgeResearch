# LUX PORT — one primitive layer, adapted from the open-source Trade Journal UI

Status: 2026-09-29, branch `feat/luxui`. Code: `client/src/components/lux/`.
Import path for everything below: `@/components/lux`.

## 0 · Licence and naming (read first)

The reference is the open-source Trade Journal web app
(`github.com/LuxAlgo/trade-journal`, `apps/web`), **MIT License,
Copyright (c) 2026 LuxAlgo Global, LLC**. Its `TRADEMARKS.md` allows the code to
be reused and the project to be named *factually*, and forbids using the
LuxAlgo name or logo in our own product branding.

What we do:

- Every file that contains adapted code carries a header naming the source file
  and the licence, and pointing to `client/src/components/lux/LICENSE-luxalgo.txt`
  (full MIT text + a non-affiliation note). The journal's earlier port keeps its
  own copy at `client/src/lib/journal/LICENSE-luxalgo.txt`.
- **No user-visible string, class shown in the UI, icon, logo or colour is theirs.**
  Their brand blue (`#0b7cbd` / `#1197e2`), the `LuxAlgoMark` SVG, the
  "Trade Journal" title and the GitHub footer are not ported. Colours are ours
  (`docs/DESIGN_SYSTEM.md`). The folder and the internal `lx-` class prefix are
  code names only.

## 1 · Survey of the reference UI layer (apps/web)

| Primitive | Where (apps/web/src) | What it is |
|---|---|---|
| **Sidebar** | `components/shell.tsx`, `globals.css` `.journal-desktop-sidebar…` | 208px ↔ 64px collapsible rail. Brand row with a **round trigger on the rail's edge**; labels fade/slide out (`max-width`/`opacity`/`translateX`, 240ms `cubic-bezier(.22,1,.36,1)`); collapsed items get a right-side tooltip; ⌘B shortcut; state in localStorage with a `data-ready` guard so the first paint doesn't animate. Two groups split by a rule (main · setup). Short labels ("Dashboard", "Calendar", "Trades"). Below `lg`: a hamburger opening the same list in a left drawer. |
| **Top bar** | `components/filter-bar.tsx` | Sticky 56px row: page title `h1` left, then account picker, a **range segmented control** (7D/30D/90D/YTD/All), an outline **"Filters · n"** button and page actions that wrap on phones. `bg-background/95 backdrop-blur`, one hairline. |
| **Tabs** | `components/ui/tabs.tsx` | Radix Tabs. Recessed muted track (`rounded-lg bg-muted p-1`), active tab raised (`bg-background shadow`), scrolls horizontally instead of wrapping. |
| **Segmented control** | `filter-bar.tsx` range strip | Bordered strip of small buttons; active = secondary fill. |
| **Card / KPI** | `components/ui/card.tsx`, `.card-sheen` | `rounded-xl`, border at 70%, **inset 1px top sheen** + tiny drop. `CardTitle` = 11px uppercase `tracking-[0.08em]` muted caption. KPI value = big tabular number, help "?" beside the caption. |
| **Tooltip / hover card** | `components/ui/tooltip.tsx` | `HoverHint` (hover **and** focus, optional heading) and `HelpHint` ("?" button). 12px radius card, soft shadow, 160ms rise-in. Icon buttons get their `aria-label` as the tip automatically. |
| **Dropdown menu** | `components/ui/dropdown-menu.tsx`, `.journal-menu-surface` | Radix menu, 12px radius surface, layered shadow, 32px items, highlighted row fill. |
| **Dialog** | `components/ui/dialog.tsx` | Radix dialog, `w-[calc(100%-24px)]`, `max-h-[calc(100dvh-24px)]` with internal scroll (phone-safe), 32px close target top-right, `.journal-popup` fade. Filter dialog = header / scroll body / footer bands. |
| **Drawer** | `shell.tsx` nav drawer, `.journal-nav-drawer` | Radix Dialog as a left sheet, 300ms slide in / 190ms out, overlay fade, safe-area padding. |
| **Table** | `components/ui/table.tsx`, `trade-explorer.tsx` | 36px header `text-xs` muted, 8px cells, `whitespace-nowrap`, row hover, overflow wrapper; tabular numbers. |
| **Filter chips / fields** | `filter-fields.tsx`, `.journal-filter-*` | 38px inputs, 7px radius, focus = ring border + 3px halo; choice rows tint when checked; `<details>` "advanced" disclosure with rotating chevron. |
| **Empty state** | `.dashboard-customize-empty` | Centered muted column, action as a brand-coloured text button. |
| **Charts** | `components/charts/tokens.ts`, `chart-frame.tsx` | Tokens resolved from CSS at runtime (canvas can't read `var()`), one shared MutationObserver; bounded frame; plotted data reveals left→right once (850ms), axes/grids never animate. |
| **Motion** | `page-transition.tsx`, keyframes in `globals.css` | Route change = 0.65→1 opacity in 160ms without blocking navigation. Everything honours `prefers-reduced-motion`. |
| **Typography** | `globals.css` | System sans, `.tnum` for aligned figures, 11px caps captions, 13–14px body, semibold titles with slight negative tracking. |
| **Colour** | `globals.css` | Dark-first near-black, one brand blue, P&L green/red *never load-bearing* (signed text, zero baselines, WIN/LOSS chips). |
| **Spacing** | — | 4px grid; cards p-4; sidebar p-2; 8/10/12px radii. |

## 2 · Ported as code vs re-implemented

| Primitive | Treatment | Our file |
|---|---|---|
| Sidebar collapse mechanics, edge trigger, collapsed tooltips, first-paint guard | **Ported** (adapted) | `lux/lux-sidebar.tsx`, `lux/lux.css` §sidebar |
| Grouping, badges, active **bar** (position, not just colour), ↑/↓/Home/End movement, `inline` (journal, phone strip) and `sheet` (phone More) placements | Ours | same |
| HoverHint / HelpHint | **Ported** | `lux/lux-tooltip.tsx` |
| Dropdown menu + surface | **Ported** | `lux/lux-menu.tsx` |
| Range strip → segmented control | **Ported** idea, re-implemented as an accessible radiogroup | `lux/lux-segmented.tsx` |
| Filter bar, "Filters · n", chips | Layout **ported**; chips ours | `lux/lux-filter.tsx` |
| Top bar | Re-implemented (our shells carry search, status and account) | `lux/lux-topbar.tsx` |
| Viz tokens hook + tooltip style | **Ported** | `lux/lux-viz.ts` |
| Chart frame, page reveal | **Ported** | `lux/lux-motion.tsx` |
| Table sticky header + sort | Re-implemented (DESIGN_SYSTEM §05 data table) | `lux/lux-table.tsx` |
| Keyframes (hover-in, pop, fade, sheet in/out, data reveal) | **Ported** | `lux/lux.css` §motion |
| Their dashboard drag-and-drop, calendar, notebook, filter-field grid | Not ported here (journal-specific; the journal port already took metrics + calendar) | — |

## 3 · ONE design system — the primitive map (old → new)

Rule: **where a qe-\* primitive already did the job it was upgraded in place**
(same API, lux look) and re-exported from `@/components/lux`; new files exist
only where nothing did the job.

| Job | Before | Now |
|---|---|---|
| App navigation | `shell/desktop-rail.tsx` (own `.qe-rail-*` CSS in nexus.css) | `LuxSidebar placement="rail"` via `DesktopRail` — `.qe-rail-*` CSS deleted |
| Journal page list | `journal/journal-sidebar.tsx` + `.jr-side*` in journal.css | `LuxSidebar placement="inline"` — `.jr-side*` CSS deleted |
| Phone "More" | hand-built grids in `mobile-dock.tsx` | `LuxSidebar placement="sheet"` |
| Names / icons / groups of destinations | duplicated in rail, dock, nav-model | `shell/nav-groups.ts` (ids/hrefs still from `nav-model.tsx`) |
| Top bars | `.topbar` markup ×2 (frame, terminal) | `LuxTopBar` (+ `.topbar` kept for the nexus base styles) |
| Account menus | two hand-rolled `motion.div` menus + `useDismissable` | `LuxMenu` (Radix) |
| Tabs | `QETabs` (mono uppercase pills, wrapping) | **QETabs upgraded** → `.lx-tabs` track, raised active tab, horizontal scroll, `wrap` opt-in. shadcn `ui/tabs` untouched (Radix, rarely used) |
| Segmented / density | `QEDensityToggle` hand-rolled | **upgraded** → `LuxSegmented` |
| Card | `QECard` | **upgraded**: `.lx-card` sheen on every surface variant + `QECardHeader / QECardTitle / QECardContent`. shadcn `ui/card` untouched (legacy pages) |
| KPI | `QEStat` (9px label) | **upgraded**: 10.5px caps caption, `help` → HelpHint, `tile` chrome |
| Section | `QESection` (clickable div) | **upgraded**: `<button aria-expanded>` header |
| Drawer | `QEDrawer` (div + ESC, no focus trap) | **upgraded**: Radix Dialog sheet, focus trap/return, `side="left|bottom"` |
| Empty | `QEEmpty` | **upgraded**: `.lx-empty`, optional `title` + `icon` (still distinct from `QEError`) |
| Tooltip | shadcn `ui/tooltip` | **restyled** to `.lx-hint`; new code uses `HoverHint` |
| Dialog | shadcn `ui/dialog` | **restyled**: card surface, 12px radius, phone-safe width/height, 32px close |
| Table | shadcn `ui/table` | **restyled**: 36px head, 8px cells, hairline rows; `LuxTableWrap` / `LuxSortHead` add sticky head + `aria-sort` |
| Journal `jr-*` styles | `styles/journal.css` | unchanged except the sidebar; `jr-*` reads the same palette. Future: fold `.jr-btn/.jr-card` into `lx-btn/QECard` |
| Tokens | `.nexus-vars` (nexus.css) · shadcn HSL bridge (index.css) · `--brand-*/--trade-*` · journal `--jr-*` | `--lx-*` (lux.css) mirrors `.nexus-vars` values in both themes and is defined on `:root` so portaled menus/tooltips and non-terminal pages match. The shadcn bridge was corrected to the same palette (below). |

### Token fixes made on the way (global — every page picks them up)

- `.dark.terminal-nexus --border / --card-border` were hue **187° (teal)**, a colour no token names → accent-blue hairlines.
- `.light.terminal-nexus-light` used **teal `#0d9488` as accent** and **rose `#e11d48` as loss** — rose-vs-green is exactly the red–green CVD trap the colour law exists to prevent. Now accent `#1a63d1`, loss vermilion `#b23c0b`, gain `#047857`, caution `#8f5706` (the AA values already in `.nexus-vars.light`).
- Top-bar status chips: system health ("Data ready", "Engaged") is **information → blue**, not gain-green (DESIGN_SYSTEM §02 usage rules).

## 4 · Tokens (`client/src/components/lux/lux.css`)

```
surfaces  --lx-bg #06070a · --lx-bg-2 #0a0c11 · --lx-surface #0e1117 · --lx-surface-2 #131720 · --lx-surface-hi #1a1f2a
lines     --lx-line rgba(59,140,255,.10) · --lx-line-hi rgba(59,140,255,.22)
text      --lx-text #e8ecf3 · --lx-dim #8b93a3 · --lx-mute #7f889a
semantic  --lx-accent #3b8cff (text: #7fb2ff) · --lx-gain #6ee7b7 · --lx-loss #ff6b3d · --lx-caution #facc15 · --lx-info #60a5fa
radius    6 / 8 / 10 / 12 (ceiling)      ease  cubic-bezier(.22,1,.36,1)
type      Inter UI · JetBrains Mono data · Space Grotesk display (unchanged three-font rule)
light     html.light | .nexus-vars.light → #f2f5f9 ground, #1a63d1 accent, #047857 gain, #b23c0b loss, #8f5706 caution
```

## 5 · Using it (for the Flow-dashboard conversion)

```tsx
import { LuxTopBar, LuxSegmented, LuxFilterButton, LuxChip, QETabs, QECard, QECardHeader,
         QECardTitle, QECardContent, QEStat, HelpHint, LuxTableWrap, LuxSortHead, nextSort,
         QEDrawer, QEEmpty, LuxMenu, LuxMenuTrigger, LuxMenuContent, LuxMenuItem } from '@/components/lux';

<LuxSegmented label="Range" value={range} onChange={setRange}
  options={[{ value: '1d', label: '1D' }, { value: '5d', label: '5D' }]} />
<QEStat tile label="Net premium" value="+$4.2M" help="Calls minus puts, dollar-weighted" />
<LuxTableWrap maxHeight={480} density="compact" label="Flow prints"> <table>…</table> </LuxTableWrap>
```

Rules: short sentence-case labels; captions are 11px caps; every signed number
prints its sign; tooltips via `HoverHint` (never `title=` for anything that
matters); a phone drill-in is `QEDrawer side="bottom"`.

## 6 · Applied where (this branch)

- Desktop rail (`/t` and every NexusFrame page) — LuxSidebar rail: grouped
  (Start · Trade · Research · Manage · Daily), short labels, edge collapse
  trigger + ⌘/Ctrl+\\ (kept), persistence (kept, `rail-state.ts`), tooltips on
  hover/focus, active bar, theme toggle and utility pages pinned at the foot.
- Phone dock — same names/icons as the rail; More sheet = LuxSidebar sheet.
- Journal — its page list is the same LuxSidebar (inline; phone strip kept).
- Top bars — NexusFrame and the terminal header use LuxTopBar: page title (or
  `Terminal / Flow`, `Research / META`), calm search trigger, info-blue status
  pills, LuxMenu account menu.
- Global — lux.css tokens/typography/scrollbars/selection, corrected shadcn
  bridge, restyled shadcn tooltip/dialog/table, upgraded qe-* primitives.
- Fixed on the way: `.nexus-vars .brand / .status-chip` beat Tailwind's
  `hidden/lg:hidden` (phone brand and status chips showed on the wrong
  breakpoint); the bottom bar's first item sat under the rail.

Not touched (owned by the Flow-dashboard agent): `components/flowdash/*`,
`components/dashboard/*`, `gex-hub-nexus.tsx`, `nexus-prototype.tsx`, chart
engine, server.

## 7 · Open items

- `ui/tabs` (shadcn) and `ui/card` still carry the old look for legacy pages;
  migrate callers to `QETabs` / `QECard` rather than restyling (their callers
  pass layout classes that a restyle would fight).
- Journal `jr-btn / jr-card / jr-table` → `lx-btn / QECard / LuxTableWrap`.
- `lux-viz` tokens are not yet consumed by `NexusPriceChart` (chart engine is
  out of scope here).
- The un-authed gate page on framed routes paints its own dark ground in light
  mode (pre-existing).

## 8 · Journal page inventory vs LuxAlgo Trade Journal (feat/jnav, 2026-09-29)

Source: `git clone --depth 1 https://github.com/LuxAlgo/trade-journal` —
`apps/web/src/app/**/page.tsx` (16 page routes) and the nav in
`apps/web/src/components/shell.tsx`. Ours: `client/src/lib/journal/legacy-jtab.ts`
(`JOURNAL_PAGES`), served inside `/t?tab=journal&jtab=<id>`.

| LuxAlgo route | LuxAlgo nav label | Ours (`?jtab=`) | Status |
|---|---|---|---|
| `/` | Dashboard | `dashboard` | Ported; since feat/jnav a normal page (KPI strip, cumulative P&L + relative DD, edge score, stop-doing teaser, calendar, activity, weekday×hour) — no tile grid |
| `/calendar` | Calendar | `calendar` | Ported |
| `/journal` | Daily journal | `daily` | Ported |
| `/journal/[date]` | (day page) | `daily` + `focusDay` (calendar/day click) | Ported (same page, day focused) |
| `/trades` | Trades | `trades` | Ported (+ options P&L simulator) |
| `/trades/[key]` | (trade page) | `?jtrade=<id>` full page + drawer | Ported |
| `/reports` | Reports | `reports` | Ported (breakdowns, cross, comparison, explorer, trends, export) |
| `/notebook` | Notebook | `notebook` | Ported |
| `/playbooks` | Playbooks | `playbooks` | Ported |
| `/progress` | Progress | `progress` | Ported |
| `/missed` | Missed trades | `missed` | Ported |
| `/import` | Import | `import` | Ported (broker CSV, Discord, flow alerts, reconciliation) |
| `/accounts` | Accounts | `accounts` | Ported (Alpaca, balances) |
| `/settings` | Settings | `settings` | Ported |
| `/prop-firms` | Prop firms | — | **Not built** — prop-challenge rule tracking; no user has a prop account on the platform. Revisit if asked. |
| `/login` | — | platform auth | N/A (platform login) |
| API only: `/api/ai/{ask,critique,recap}` | — | — | Not ported (LLM features; no page in LuxAlgo either) |
| — | — | `insights` | **Added (ours)** — first-class Insights: what to stop doing ($, n, win %, PF, both-halves check, book-without), behaviour, weekday×hour, time of day, tilt & streaks, trade # of day, trades per day, DTE, position cost, holding time, contract side, ticker concentration; links to Loss analysis |
| — | — | `loss` | Ours — Loss analysis (MFE/MAE from bars, loss classes, drivers, counterfactuals) |
| — | — | `record` | Ours — platform Track record + backtester |

Navigation: LuxAlgo uses its own left sidebar. We do NOT: the app rail is the
only side nav; the journal's pages are a grouped tab row in its top bar
(`components/journal/journal-nav.tsx`: Overview · Trades · Insights · Improve ·
Setup · Platform, overflow → More ▾; phones: book select + scrollable strip).
