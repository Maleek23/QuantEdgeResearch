# Chart audit — 2026-09-30

Scope: the full TradingView-style chart on lightweight-charts v5.1
(`client/src/components/charting/tv/*`): the CHART tab (`/t?tab=chart`), and the
expanded chart opened with ⤢ from every compact embed (NEXUS setup detail, ticker
workup, bot, crypto). Operator report: "modifications and tools don't work, tons
of missing gaps", worst on phones and tablets.

## Method

- `npm run build`, then the built client served by the device-audit harness with
  synthetic fixtures (`AUDIT_SERVE_ONLY=1 AUDIT_PORT=5399 npx tsx research/device-audit.ts`).
- `npx tsx research/chart-audit.ts` (new, re-runnable) drives the chart in headless
  Chromium at **375×812 touch**, **768×1024 touch** and **1440×900 mouse**: every
  drawing tool placed with taps / clicks (brush by drag), select, recolour, resize,
  drag a handle, delete, undo / redo, interval change, reload, menus, replay,
  snapshot, fullscreen, magnet / lock / hide, pinch / pan / wheel, Alt+H / Del,
  light mode. Touch is real touch input (CDP `Input.dispatchTouchEvent`), not
  mouse events at a small size. Results: stdout table + `research/chart-audit.json`.
- Root causes were confirmed in the browser (render-loop frame counts, an
  instrumented build reading the drawing primitive's projected pixels) and in the
  lightweight-charts source.

Before the fixes the audit stopped at 375 px: every tap in a phone menu closed the
menu (row 2 below), so the run could not continue. After: **136 / 136 checks work**
across the three sizes.

Not covered: real iOS Safari / Android Chrome hardware (Chromium with emulated
touch only), native element fullscreen on iPadOS, the compact canvas embed's own
interactions (it has no drawing tools by design; ⤢ opens this chart).

## Broken → fixed

Line numbers are the pre-fix files (`integrate/pdf-fixes` @ 6a46fa54).

| # | What the trader saw | Root cause | Fix |
|---|---|---|---|
| 1 | Chart sluggish everywhere; drags and taps lag; battery drain | `tv/tv-pane.tsx:189` `const mode = useVisualMode()` took the hook's **array** (`[mode, setMode]`, new every render) and used it as an effect dependency (`:333`, `:425`, `:428`, `:444`). The colour effect calls `setDataTick` → re-render → new array → effect again: an endless render loop (≈60 frames/s while idle), rebuilding price lines, layers and drawings every frame | `const [mode] = useVisualMode()`. Idle: 121 → 4 animation frames per 2 s |
| 2 | **Phone: the timeframe, chart-type and Indicators menus do nothing** — any tap on an option closes the menu | `tv/tv-chart.tsx:759` `.tv-top{position:relative;z-index:21}` makes a stacking context, so the bottom-sheet menus inside it (z 1001) sit **under** the scrim (`:891`, z 1000, a sibling) and under the app dock | While a menu is open the bar is lifted (`.tv-menu-open .tv-top{z-index:1001}`) |
| 3 | Drawings "disappear" or pile up on the left edge after changing interval or reloading (the "missing" lines) | `tv/drawings-primitive.ts:85` mapped time → x with `timeScale().logicalToCoordinate(l)`; lightweight-charts 5.1 `indexToCoordinate` returns **0 for a non-integer index**. Any anchor between bars — a 5m line viewed on 15m / 1h / 1D, a brush stroke, bars whose times moved — painted at x = 0 | `logicalToX()` (drawing-geometry.ts) interpolates between the two whole neighbours; unit-tested against a fake that mimics the library |
| 4 | Phone: the drawing-tools button is off-screen | `tv-chart.tsx:510–568` seven 44 px buttons + the symbol field in a 343 px bar | Phone bar = symbol · interval · indicators · undo · draw · **More (⋯)**; chart type, redo, replay, snapshot, full screen, scale, session, layouts move into the More sheet |
| 5 | Touch: a drawing's end handle can't be grabbed; lines hard to select | `tv/drawing-geometry.ts:220–229` mouse-sized targets (6 px line, 8 px handle) for a fingertip; the topmost drawing beat the selected one's handle | Pointer-aware tolerances (`TOUCH_TOL` 14 / 20 px), nearest handle wins, the selected drawing's handles are tested first, bigger handles drawn after a touch |
| 6 | Touch: tapping an orb / dark-pool line / flow print shows nothing | `tv/tv-pane.tsx:661` `onPointerLeave` hides the tooltip — and a lifting finger fires pointerleave right after pointerup | Only a mouse leaving hides it; touch layer hits get a 12 px tolerance (`layers-primitive.ts` `hit(x, y, tol)`) |
| 7 | Clicks / taps in the top-left of the chart don't draw (text, fib, measure failed at 768 and 1440) | `tv-chart.tsx:835` `.tv-leg-ind{pointer-events:auto}` — the legend's Walls / GEX / EM rows swallow pointer events over a large part of the pane | Legend rows never take the pane's input; only their small × / "Show" buttons do (and not while a tool is armed) |
| 8 | Phone: no way to reach log / % scale, magnet, stay-drawing, reset view | settings pop is `tv-desk-flex` (`tv-chart.tsx:563`) | The ⋯ More sheet on phones |
| 9 | Phone: no fullscreen; iPhone Safari has no element fullscreen at all | button `tv-desk-flex` (`:568`); `toggleFull` only tried `requestFullscreen` | Webkit-prefixed API, and when unavailable or refused a CSS full-viewport mode (safe-area aware, Esc / ✕ to leave). Reachable from More on phones |
| 10 | Snapshot "does nothing" in the iOS home-screen app and in-app browsers; no feedback anywhere | `tv-chart.tsx:338–345` a data-URL `<a download>` | Touch devices: share sheet with the PNG (Save Image / Files). Elsewhere: blob download + a notice with an "open image" link as the fallback |
| 11 | Legend reads "Volume NaN"; empty volume bars | `chart-layers.ts:141` `fmtVol` and `tv-pane.tsx:351` assumed a number | "—" and whitespace bars when a feed has no volume |
| 12 | After switching light ↔ dark, legend values keep the old colours for up to 15 s | `tv-chart.tsx:245–249` colour memo keyed on `[prefs, now]` | keyed on the visual mode too |
| 13 | Phone: the selected drawing's width / lock / delete are scrolled out of reach | one non-wrapping scrolling row | two rows: colours, then width · text · lock · delete |
| 14 | Tablet: a tapped tool button stays highlighted as if active | `:hover` styles stick on touch | hover styles only under `@media (hover:hover)` |
| 15 | iPhone zooms the page when editing a text drawing | 12 px inputs | 16 px inputs on phones |
| 16 | Hard-coded `#fff` on the orb chip's "Show" | `tv-chart.tsx:824` | `var(--lx-accent-ink)` |

## Missing → added

| Added | Where |
|---|---|
| 1-tap interval chips (1m · 5m · 15m · 1h · D), keys **1–5** | top bar ≥ 1180 px, status bar below that (phones / tablets) |
| **VWAP** (session-anchored, resets each ET date; no volume → no value, never invented) and **EMA 9 / 21** | Indicators menu; legend rows with remove × |
| **Compare** a second symbol as a % line (scale switches to percent while it shows; compare bars are kept to the main series' bar times so drawings / layers stay aligned) | Indicators → Compare |
| **Save / load layouts** — named snapshots of interval, chart type, scale, session, range, layers, indicators (device store, 12 max) | Settings / More → Layouts |
| Phone **More** sheet (see #4) | ⋯ in the phone top bar |
| Touch-sized hit targets and handles, selected-handle priority (see #5) | drawing-geometry.ts |
| CSS fullscreen fallback (see #9) | tv-chart.tsx |

Already present and confirmed working (now also on touch): 12 drawing tools (trend,
ray, horizontal line / ray, vertical, parallel channel, fib, rectangle, brush, text,
arrow, measure), magnet, lock all, hide all, remove all, per-drawing lock, delete
selected, colour / width edit, undo / redo, zoom ± buttons, replay, indicators
menu, RTH / ETH, log / % / auto scale, volume toggle, MA 20 / 50, per-user
per-symbol drawing persistence, desktop shortcuts (Alt+H/T/V/F/J/R, Esc, Del,
Ctrl/⌘+Z/Y, ← →, + −), pinch zoom and one-finger pan, GEX orbs / walls / dark
pool / flow / expected-move band, the gamma-mark watermark.

## Light and dark

Every chart colour comes from the `--lx-*` tokens through `chartPalette()` /
`readColors()` or `--tv-*` variables scoped to `.tv-root`; the new series (EMA,
VWAP, compare) use the same palette roles and re-colour on a mode switch. No
global stylesheet was touched. Checked in both modes at all three sizes.

## Still not done / known limits

- Drawings and layouts live on the device (localStorage); nothing syncs across
  devices yet (`drawing-store.ts` is ready for a server store).
- Compare shows only bars that share a timestamp with the main series (an
  equity vs a 24 h crypto, or mismatched sessions, shows the overlap only). One
  comparison at a time.
- Snapshot captures the canvas (candles, layers, drawings, axes), not the DOM
  legend or the watermark.
- No per-drawing hide, drawing templates, fib-level editor, or long-press context
  menu (touch selection is a tap).
- At 375 px the eighth colour swatch sits behind a sideways scroll (the app's
  phone rule makes every button ≥ 44 px).
- Verified in emulated touch only; native iPadOS fullscreen and real-device
  gestures still want a hands-on check.

## Tests

- `npm run test:chart` → `scripts/test-chart-drawings.ts` (existing: geometry,
  hit-testing, fib, measure, magnet, undo / redo, drawing store) +
  `scripts/test-chart-tools.ts` (new: fractional index → x, touch tolerances and
  selected-handle priority, EMA, session VWAP, compare alignment and symbol
  cleaning, layouts upsert / cap / sanitise).
- `npx tsx research/chart-audit.ts` (end-to-end, needs the harness; see Method).
