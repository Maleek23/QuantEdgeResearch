# QUANTEDGE TERMINAL — Design System Brief

The mock author's design language, codified. This is the source of truth for
every new surface. The reference mocks (NEXUS, CHART, FLOW, GEX, LEAPS,
CRYPTO, BOT, WORKUP) were wired verbatim; screens composed without a mock
must be built from this brief.

Two standing platform rules override the brief where they conflict:
1. The operator explicitly requested a light theme toggle — it stays,
   implemented as re-grounds over the same tokens (§13's "never light mode"
   yields to the operator's own instruction).
2. §09's "price jitter" is fabrication. Motion only ever rides real data:
   a cell flashes when a real quote changed, never on a timer with noise.

---

## 01 · PHILOSOPHY

- **Terminal first, website never.** This is a cockpit, not a marketing page. Respect the operator's attention.
- **Density without clutter.** Every pixel earns its place. Whitespace is structural, not decorative.
- **Cinematic darkness.** Deep near-black backgrounds (#06070a → #0a0c11) with luminous accents. Light is earned, not given.
- **Data is the hero.** Typography, color, and motion exist to make numbers and relationships legible at a glance.
- **Silent motion.** Animations are ambient (particles, scanlines, subtle pulses) — never distracting.
- **Module identity.** Each module has its own accent color, but the skeleton is shared.

## 02 · COLOR SYSTEM

### Base
```
--bg:          #06070a
--bg-2:        #0a0c11
--panel:       rgba(14,17,23,0.72)
--panel-solid: #0e1117
--panel-2:     #131720
--panel-hi:    #1a1f2a
--nx-border:      rgba(59,140,255,0.08)   (renamed from --border: shadcn holds
--nx-border-hi:   rgba(59,140,255,0.18)    an HSL triplet under that name)
```

### Text
```
--text:       #e8ecf3   17.0:1 on --bg
--text-dim:   #8b93a3    6.5:1
--text-mute:  #7f889a    5.7:1 on --bg, 4.6:1 on --panel-hi (was #525a6b, 2.4–2.9:1)
```

### Semantic — the colour-psychology law (CVD-safe: blue ↔ vermilion, never red ↔ green alone)
```
--cyan:       #3b8cff   accent / info / +GEX (dealers provide liquidity) · --cyan-bright #7fb2ff for text
--green:      #6ee7b7   GAIN only — up candles, positive P&L, +VEX
--red:        #ff6b3d   LOSS only — down candles, negative P&L, −GEX/−VEX (vermilion, not pink-red)
--amber:      #facc15   CAUTION — partial data, near the flip, zero-γ, alerts that need attention
--purple:     #a78bfa   structural marker (max-γ / magnet), secondary
--blue:       #60a5fa   neutral information (bot activity, system events)
```
Usage rules (enforced in the 2026-09-29 colour pass):
- Green and vermilion mean gain and loss. Nothing else wears them: an alert is
  caution (amber), a bot acting is information (blue), "Sign out" is neutral
  text — none of them is a loss.
- Colour is never the only carrier: every signed value prints its sign, levels
  carry text chips (CALL WALL / PUT WALL / MAX γ / ZERO-γ / SPOT).
- Body text ≥ 4.5:1 on every panel in every visual mode (see "Visual modes" below).

### Light theme (nexus-light) — AA fixes 2026-09-29
```
--cyan   #1a63d1  (was #1d6ce0: 4.49:1 on --bg, 4.14:1 on --bg-2 → 5.1 / 4.7)
--red    #b23c0b  (was #c2410c: 4.36:1 on --bg-2 → 5.4 / 5.0)
--amber  #8f5706  (was #a16207: 4.50 / 4.15:1 → 5.4 / 5.0)
--nx-border family → accent blue rgba(29,99,209,…) (was an off-palette teal)
```

### Shadcn bridge (.dark.terminal-nexus in index.css) — 2026-09-29
```
--accent / --ring   215 100% 62%  (#3b8cff) — was 174 59% 56%, a teal (#4fd1c1) under a "#3b8cff" comment
--destructive       15 100% 62%   (#ff6b3d) — was 350°, a pink-red (#ff5270) that matched no token
--chart-4           15 100% 62%   loss vermilion
```

### Visual modes — five grounds, one attribute (2026-09-29, feat/modes)
The mode is `html[data-mode="dark|midnight|dim|light|contrast"]`
(`client/src/lib/visual-mode.ts`), chosen from the account menu (terminal and
framed pages), Settings › Display, the Customize panel and the terminal settings
drawer; the rail's ☀/☾ is a quick light ↔ last-dark-ground toggle. Saved **per
device** (`localStorage['qe-mode']`, every access in try/catch; the old
`quantedge-theme` value migrates once: nexus/dark → Dark, night → Midnight,
*light → Light, system → the OS preference). `client/index.html` applies it
**before first paint** (inline script: attribute + legacy `.dark.terminal-nexus` /
`.light.terminal-nexus-light` classes + `color-scheme` + `<meta theme-color>`), and
the boot screen's colours are per-mode variables keyed on the attribute, so
neither boot nor the loader fade flashes the wrong ground (`lib/boot.ts`
re-asserts it if the script did not run).

Token overrides live in `client/src/styles/modes.css` for all three families
(`--lx-*` on `<html>`; the NEXUS palette + `--gx-*` ramp on
`html[data-mode] .nexus-vars`; the shadcn HSL bridge on `html.dark[data-mode]`).
Dark and Light are the existing palettes (lux.css, nexus.css, index.css). The
canvas chart engine resolves the active mode's `--lx-*` tokens once per mode
change (`chartPalette` in `charting/chart-engine.ts`); the GEX surfaces are pure
CSS variables (`gex/gex-colors.ts`), so they re-ground with no JS.

| Mode | For | What changes |
|---|---|---|
| **Dark** (default) | the terminal as designed | nothing — the NEXUS palette |
| **Midnight** | OLED, dark rooms | `#000` grounds, text one step dimmer (`#d6dbe4`), same accents, vignette off |
| **Dim** | long daylight sessions, glare | grey grounds (`#1a1e26`…), accents re-tuned lighter for grey, near-black chrome bands re-grounded |
| **Light** | bright rooms | the day-shift palette (unchanged) |
| **High contrast** | low vision, sunlight, projectors | AAA text everywhere, solid `#7d8698` hairlines, no translucency / blur / glow / CRT overlay, 3px white focus ring (+2px offset, black halo), alpha-suffixed muted text drawn at full token strength, gradient titles as plain text |

**Measured contrast** (WCAG 2.x relative luminance; each cell = ratio on
ground · surface · surface-hi, the three text grounds of every mode):

| Mode | Ground / surface / surface-hi | text | dim | mute | accent-as-text | accent | gain | loss | caution | ink on accent |
|---|---|---|---|---|---|---|---|---|---|---|
| **Dark** | `#06070a` / `#0e1117` / `#1a1f2a` | `#e8ecf3` 17.0 · 15.9 · 13.9 | `#8b93a3` 6.5 · 6.1 · 5.3 | `#7f889a` 5.7 · 5.3 · 4.6 | `#7fb2ff` 9.3 · 8.7 · 7.6 | `#3b8cff` 6.1 · 5.7 · 5.0 | `#6ee7b7` 13.2 · 12.4 · 10.8 | `#ff6b3d` 7.1 · 6.7 · 5.8 | `#facc15` 13.2 · 12.3 · 10.8 | 6.1 |
| **Midnight** | `#000000` / `#07080b` / `#12151c` | `#d6dbe4` 15.1 · 14.4 · 13.1 | `#868e9d` 6.4 · 6.1 · 5.5 | `#7a8394` 5.5 · 5.2 · 4.8 | `#7fb2ff` 9.7 · 9.3 · 8.4 | `#3b8cff` 6.4 · 6.1 · 5.6 | `#6ee7b7` 13.8 · 13.1 · 12.0 | `#ff6b3d` 7.4 · 7.1 · 6.5 | `#facc15` 13.7 · 13.1 · 11.9 | 6.4 |
| **Dim** | `#1a1e26` / `#232933` / `#303744` | `#e6e9ef` 13.7 · 12.0 · 9.8 | `#b0b8c6` 8.4 · 7.3 · 6.0 | `#a2abba` 7.2 · 6.3 · 5.2 | `#93c1ff` 9.0 · 7.9 · 6.4 | `#66a4ff` 6.6 · 5.8 · 4.7 | `#78ebbf` 11.5 · 10.0 · 8.2 | `#ff8f66` 7.5 · 6.5 · 5.3 | `#fad33d` 11.5 · 10.1 · 8.2 | 7.4 |
| **Light** | `#f2f5f9` / `#ffffff` / `#e7ecf3` | `#121826` 16.2 · 17.7 · 14.9 | `#46536b` 7.1 · 7.7 · 6.5 | `#5f697d` 5.0 · 5.5 · 4.7 | `#1557c0` 6.1 · 6.7 · 5.6 | `#1a63d1` 5.1 · 5.6 · 4.7 | `#047857` 5.0 · 5.5 · 4.6 | `#b23c0b` 5.4 · 5.9 · 5.0 | `#8f5706` 5.4 · 5.9 · 5.0 | 5.6 |
| **High contrast** | `#000000` / `#0a0a0c` / `#17191f` | `#ffffff` 21.0 · 19.8 · 17.6 | `#e2e6ed` 16.8 · 15.8 · 14.0 | `#cdd3dd` 14.0 · 13.1 · 11.7 | `#a9cbff` 12.7 · 11.9 · 10.6 | `#7ab2ff` 9.6 · 9.1 · 8.1 | `#86f2c8` 15.5 · 14.6 · 13.0 | `#ff9a73` 10.1 · 9.5 · 8.5 | `#ffdc55` 15.6 · 14.7 · 13.1 | 9.6 |

- Every mode clears AA (≥ 4.5:1) for every text tier on every ground; High
  contrast clears **AAA (≥ 7:1)** for every tier on every ground (lowest: accent
  fill used as text, 8.1:1). Its hairlines are 5.7:1 (`--lx-line`) and 9.9:1
  (`--lx-line-hi`) against `#000` (non-text ≥ 3:1); the focus ring is white, 21:1.
- **CVD-safe semantics are the same in every mode** — accent blue (`#3b8cff`
  family), gain mint (`#6ee7b7` family), loss vermilion (`#ff6b3d` family),
  caution yellow (`#facc15` family) — only their lightness moves with the ground
  (Light darkens them, Dim and High contrast lighten them).
- The GEX diverging ramp is re-valued per mode (`--gx-*`), its zero stop = the
  mode's panel: Midnight `#15294a…#a4d8fe` / `#3f1d11…#ffc898` on `#000`;
  Dim `#2a4466…#a9dafe` / `#5a3324…#ffcba0` on `#232933`; High contrast
  `#1e3c6e…#c4e6ff` / `#6a2f18…#ffd6b3` on `#000` with white/black ink.
- Known limit: component-local literal colours (inline `style={{ color: '#…' }}`,
  Tailwind palette classes such as `text-emerald-400`) do not follow the modes;
  they read on every dark ground but are not re-tuned for High contrast.
- Calm mode (Customize › Look) is independent of the visual mode: it only
  removes motion, glow and the ambient canvas.

### GEX levels (client/src/components/gex/gex-colors.ts → LEVEL_COLORS)
```
call wall  --cyan-bright   put wall  --red   max γ / magnet  --purple
zero-γ     --amber (dashed line)             spot            --text (solid line)
cell tint  diverging OKLab ramp on √(|v|/max) (rampColor / exposureCellBg) — see below
```

### GEX strike grids — diverging ramp + per-expiry scale (2026-09-29)
One ramp for the strike × expiry matrix and the ladder (GEX and VEX): lightness
rises monotonically with |value|, hue is fixed per side, so magnitude reads the
same on both sides and the sign never depends on lightness. Tokens live on
`.nexus-vars` (`--gx-pos-0/1/2`, `--gx-neg-0/1/2`, `--gx-ink-lo/hi`, `--gx-zero`)
and are re-grounded for `.light` (the ramp runs light → dark there).
```
            t=0 (≈0)   t=½ (¼ of max)  t=1 (max)
+ blue      #1d3559    #3680dd         #a4d8fe    dealers long γ — provides liquidity
− orange    #532718    #de6129         #ffc898    dealers short γ — takes liquidity
light theme +  #deedfe #6aa9ed #2256bb   −  #fee6d4 #f08e54 #b83b07
```
- Blue ↔ orange is the CVD-safe diverging pair (cividis / vik / berlin family):
  OKLab ΔE×100 between sides at mid ramp — normal 32, protan 26, deutan 30,
  tritan 32 (Machado 2009 simulation). Never red ↔ green.
- **Scale**: the matrix normalises each expiry column to its own max by default
  ("Per expiry"); "Absolute" uses one max for every cell. The active scale is
  printed in the matrix toolbar and in the tool's control row; the legend shows
  the value → colour mapping for the active scale (−max · −¼ · 0 · +¼ · +max).
- The top-2 |cells| of every expiry carry ①② and are never hidden as dust; each
  column header prints the expiry's net (Σ). The value is always printed — colour
  is never the only carrier.

### Module accents
```
ORACLE   → cyan      GEX      → amber/orange
CHART    → cyan      LEAPS    → gold (#fbbf24)
FLOW     → green     CRYPTO   → btc-orange (#f7931a) + eth-purple (#8b7ee0)
CATALYST → event-orange (#fb923c)
BOT      → bot-blue  (#38bdf8)
```

### Rules
- Every accent gets a `*-bright` (glow) and `*-dim` (pressed) variant.
- Glow via `text-shadow` / `box-shadow` at 0.3 opacity — never full saturation.
- Red/green are **semantic only** — never use them decoratively.

## 03 · TYPOGRAPHY

Three fonts, strict roles:

| Font | Role | Use |
|---|---|---|
| **Space Grotesk** | Display | Module titles, ticker symbols, big numbers |
| **Inter** | UI | Body, labels, descriptions |
| **JetBrains Mono** | Data | Prices, stats, timestamps, codes, badges |

### Scale
```
Display:   22–28px, weight 700, letter-spacing -0.02em
Title:     14–16px, weight 700
Body:      12.5px (root), weight 400–500
Caption:   10–11px, weight 600, uppercase, letter-spacing 0.8–1.2px
Data:      10–13px, JetBrains Mono, weight 600–700
```

### Gradient text — module titles only
```css
background: linear-gradient(135deg, #fff, var(--module-accent-bright));
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
```

## 04 · LAYOUT PRIMITIVES

- Global grid: `44px topbar · 28px ticker-tape · 1fr main · 26px bottombar` (the shell owns all chrome).
- Two-column default: `minmax(0,1fr) var(--nx-side,320px)`; three-column for dense modules.
- Columns separated by `1px solid var(--nx-border)`; rails drag-resizable via useColResize.
- Every column's first section: `position: sticky; top: 0` with backdrop blur.
- Section anatomy: `.sec-num` (mono 10px accent uppercase) → `.sec-title` (Grotesk gradient) → `.sec-sub` (Inter 11px dim) → `.sec-meta` (tag pills).

## 05 · COMPONENT LIBRARY

- **Tag/pill**: 2px 7px, 10px/600, radius 3px. Variants `.live .mute .cyan .amber .event .bot .btc .eth`.
- **Status chip** (topbar): pulsing dot, `.ok`/`.warn`, uppercase.
- **Card**: `linear-gradient(135deg, var(--panel-solid), var(--panel-2))`, 1px `--nx-border`, radius 6–8px, hover = border-hi + translateY(-1px).
- **Accent-bar card**: `::before` 2px left edge in module color with glow.
- **Stat card**: 9px uppercase label → 14–16px mono value → 9.5px sub; top hairline gradient in module color.
- **Data table**: sticky `--bg-2` header, hover `rgba(accent,0.04)`, mono numbers, hairline borders, never zebra.
- **Grades**: S → gold, A → cyan, B → blue, C → muted.
- **Buttons**: primary = accent gradient + dark text + glow; ghost = transparent + border-hi.

## 06 · INTERACTIVE CARDS

1. Hover = commitment: lift 1–2px, border brightens.
2. Click = focus: 1px accent border + soft outer glow at 0.15.
3. State always visible — never hidden behind hover.
4. A card must read at 240px wide AND full-width.

Symbol clicks anywhere open the universal Ticker Workup (workup-bus).

## 07 · 3D & IMMERSIVE

- No 3D data surfaces. The GEX 3D gamma surface (Three.js) was removed 2026-09-29 — the 2D strike × expiry matrix is the one exposure view; nothing imports three / @react-three any more.
- Ambient canvas per mock page at 0.5 opacity; scanlines at 0.012 overlay; vignette radial.

## 08 · MOTION

| Element | Duration | Easing |
|---|---|---|
| Hover lift | 200ms | ease |
| Card reveal | 300ms | cubic-bezier(.2,.8,.2,1) |
| Modal open | 250ms | fade + slight scale |
| Pulse dot | 1.8s | infinite |
| Brand spin | 8s | linear infinite |
| Ticker tape | 90–100s | linear infinite |
| Progress fill | 800ms | cubic-bezier(.2,.8,.2,1) |

Never animate on scroll except first viewport entry.

### Loading — one boot → page → tool system (2026-09-29)
Three states, one look (`client/src/components/ui/qe-loading.tsx`,
`client/src/styles/qe-loading.css`, `client/src/lib/boot.ts`). Nothing else spins
for a page or a tool; an inline spinner is allowed only inside a button that is
doing the action the user just clicked.

| State | Where | What it looks like | Leaves |
|---|---|---|---|
| **Boot** | `#app-loader` in `client/index.html` | mark + QUANTEDGE // TERMINAL + 2px track, theme-matched ground | once, when no `<BootHold/>` is mounted (after React's first commit; 15 s hard cap) — 150 ms fade |
| **Page** | `<PageSkeleton/>` via `<RouteFallback/>` | the shell stays mounted; the content area shows skeleton tiles on the page's own 12 × 18 default grid (`skeletonTiles(page)`), plus a bar row | when the page's code + layout are ready — content fades in |
| **Tool** | `<ToolSkeleton/>` (= `QELoading`) | block + lines inside the tool frame | when the tool's code/first data land — 150 ms fade |

Rules:
- Every Suspense / auth / route fallback is `<RouteFallback/>`: during boot it
  renders `<BootHold/>` (keeps the boot screen, so no second screen can flash);
  after boot it is the page skeleton. Tool-level fallbacks are `<ToolSkeleton/>`.
- Motion is opacity only, ≤150 ms (tab switch 120 ms, page reveal 120 ms), and
  none under `prefers-reduced-motion`. Skeletons occupy the exact box the content
  will fill, so nothing shifts when it lands.
- The stale-bundle banner (`lib/stale-bundle.ts`) is not a loader: it is plain
  DOM on purpose (it must work when React has crashed) and only appears after a
  deploy.

### Dashboard layout law (2026-09-29)
- The desktop grid is 12 columns × **18 visible rows**; row height scales with
  the measured main area (`fitRowHeight`), so a default authored at exactly
  12 × 18 fills the viewport with no scroll at 1440×900, 1920×1080 and 2513×1260.
- Every shipped default: the page's primary tool top-left and largest, related
  tools adjacent, rows aligned, no holes, 3–6 tools; everything else is in Add
  tool. A DEV assertion (`tilingIssues`, pages.ts) warns if a default stops tiling.
- Auto-arrange = the same packing: reading order, rows filled left → right,
  widths stretched to span 12, equal height per row, row heights scaled to fill
  18 rows when the tools' minimum heights allow.
- **Page modes** (`PageSpec.mode`, docs/TOOLS_MIGRATION.md "Page modes"): only
  **GEX** and **FLOW** are *workspaces* (Add tool from a curated catalogue, drag,
  resize, Auto-arrange, Clear, Restore default, named dashboards). Every other
  dashboard page is *fixed* — the same tiles in the curated default, nothing
  editable, bar says "curated layout".
- **Normal pages** (`mode: 'page'`, 2026-09-29): Today, NEXUS, CATALYST, CRYPTO
  and BOT are not tile boards. Each tool is a section at its natural height
  (title · source · age header, no grip/close/tool bar), laid out from the
  default's columns (≥1200px; 2 columns 768–1199px; 1 column on phones) and the
  PAGE scrolls. Never a scroll area inside a section — a long section clips
  behind "Show all"; chart tools get a viewport-scaled box (`PageSpec.fill`).
- **Phones**: one column ordered by `PageSpec.phone` (GEX: levels + regime strip,
  then the matrix at exactly the main-area height, then the rest). Touch targets
  ≥ 40px; captions never below 10.5px. GEX matrix: 5 expiry columns per view
  (4 when a column would be < 58px), horizontal snap by expiry, strikes scroll.
- **Simple pages** (`mode: 'simple'`): CHART (full-bleed price chart + collapsible
  watchlist rail), LEAPS and POSITIONS render one primary tool with no grid and
  no tool chrome (its source · age moves to the page bar). No Customize switch.

## 09 · LIVE DATA PATTERNS (integrity-gated)

- Ticker tape: infinite scroll, duplicated content, fade edges — PAUSES and labels itself when quotes go stale.
- Cell flash on change: only when a REAL value changed. No synthetic jitter, ever.
- Log streams: new entries slide in 0.4s; entries are real events.
- Pulsing dots mean a live feed is actually connected.
- Unmeasured values render `NOT MEASURED` / `—`, never a placeholder number.

## 10 · ACCESSIBILITY

- Contrast ≥ 4.5:1 body, 3:1 display in every visual mode; ≥ 7:1 for every text
  tier in High contrast (measured table in §02 "Visual modes"). Never color
  alone — pair icon/label/position.
- Monospace for anything compared numerically. Touch targets ≥ 44px on touch sizes (≤ 767px: index.css touch floor), ≥ 32px on desktop. One focus ring everywhere: `:focus-visible` → 2px `--qe-focus` outline, offset 2px (index.css) — never a tint alone. Phones: no text under 12px (size tokens remap), inputs 16px (no iOS focus zoom). `research/device-audit.ts` checks all of it at 375/393/360/768/1024/1440 in Dark, Light and High contrast.
- `prefers-reduced-motion`: disable particles, tape scroll, pulses.

## 11 · BEFORE BUILDING A NEW SCREEN

Ask (or resolve from context): module? primary operator action? density?
live or snapshot? 3D justified? right-sidebar context?

## 12 · IMPLEMENTATION NOTES (this codebase)

- All module CSS lives in `client/src/styles/nexus.css`, one scoped block per
  page (`.nexus-embed .chartlab .flowlab .gexlab .leapslab .cryptolab .botlab
  .workuplab .catalystlab`), tokens on `.nexus-vars`.
- The shell (`terminal-shell.tsx`) owns topbar/tape/bottombar; pages are
  embedded boards.
- Charts: `NexusPriceChart` (pan/zoom/expand, wick-clamp disclosure) — never
  hand-rolled candles.
- Rails: `useColResize`. Workup: `openWorkup()` from `lib/workup-bus`.
- Primitives (sidebar, top bar, tabs, segmented, menus, tooltips, sheets,
  cards/KPIs, tables, filter chips, empty states, chart frame): import from
  `@/components/lux`; tokens `--lx-*` in `components/lux/lux.css`. Map of
  old → new and the licence note: `docs/LUX_PORT.md`.

## 13 · ANTI-PATTERNS

- ❌ Rounded corners > 12px · drop shadows (use border glow) · >3 fonts
- ❌ Color without semantic meaning · marketing copy · generic dashboards
- ❌ Icons without labels in dense contexts · animations >1s unless ambient
- ❌ Fabricated data of any kind — jitter, random walks, placeholder stats

## 14 · SCREEN MAPPING

| Screen | Accent | Primary component | 3D? |
|---|---|---|---|
| Oracle | cyan | Signal cards + ranked book | no |
| Chart | cyan | Candle chart + OHLC | optional |
| Flow | green | Options flow table | no |
| GEX | amber | Strike×expiry matrix | yes (Prism) |
| Leaps | gold | LEAPS card grid | no |
| Crypto | orange/purple | Spot cards + proxy board | no |
| Catalyst | event-orange | Calendar + impact table | no |
| Bot | bot-blue | Bot cards + rules table + log | no |
| Ticker Workup | contextual | Modal with 5 tabs | optional |

When in doubt, default to **density, darkness, and data**.
