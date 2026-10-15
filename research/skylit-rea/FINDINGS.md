# Skylit public site — design-system reverse engineering (2026-10-15)

Scope: public pages only (www.skylit.ai home, /docs, phone menu). No login, no app
subdomain. Nothing of theirs (code, copy, images) is committed; below are paraphrased
observations and measured values only. Raw captures stayed in the session scratchpad.

## Method (what failed, what worked)

| Attempt | Result | Cause |
|---|---|---|
| `capture_browser_scenario` launch mode (Chrome for Testing) | `cleanup_incomplete / unreadable_output` | REA scenario provider broken in this install — also fails in connect mode, so not a launch problem |
| `analyze_web_bundle` / `inspect_web_page` on a target opened at `https://skylit.ai/` | `target_not_allowed` / 0 scripts | apex 301-redirects to `www.skylit.ai`; target registered under the apex origin, REA's origin policy dropped everything from `www` |
| Own headless Chrome (`--remote-debugging-port=9333`, wrapper script) → `PUT /json/new?https://www.skylit.ai/` → `inspect_web_page(include_script_sources)` → `export_web_scripts` | **Worked**: 3 scripts (591 KB Vite main bundle + 2 inline), 18 resources, digest-verified manifest | open target on the final origin, let it load, then attach — Debugger replays already-parsed scripts |
| Stylesheet (`/assets/index-*.css`, 211 KB) fetched to scratchpad; tokens mined with grep | worked | tokens are CSS custom properties |
| Live measurement in the Browser pane (`getComputedStyle` at 2595 px and 375 px) | worked | layout / type / menu behaviour |

Lesson: resolve redirects first (`curl -sIL`), open the CDP target on the final origin;
skip `capture_browser_scenario` until REA is updated.

## Stack
Vite + React SPA, Tailwind utilities plus a hand-written component layer with short
prefixes (`hx-` hero, `hs-` section, `ax-` app/chart mockups, `cs-` per-module case
studies, `docs-` docs shell). Self-hosted woff2: DM Sans Variable (UI + display) and
Roboto Mono 400/500 (eyebrows, numerals). Dark is `:root`; light is
`html[data-theme=light]`, toggled from the nav.

## Colour tokens (dark / light)
- surface-page `#0A0A0A` / `#F6F6F3` (warm off-white, not pure white)
- surface-card `#0C0D10` / `#FFF`; band `#0C0D10` / `#EFEFEA`; raised white 3.5% / white 70%
- text primary white 94% / `#0E0F12`; secondary 72% / 76%; muted 62% / 70%; faint 50% / 60%
  → text tiers are alpha steps of ONE ink, not separate greys
- text-accent `#90BFF9` dark / `#1D4ED8`–`#2563EB` light — a single cool-blue accent
- hairline border white 8% / ink 9%; emphasis 16% / 18%
- buttons are inverted ink (white on dark, near-black on light), hover one step
- mockup palette: bull = blue, bear = neutral ink alpha (not red); gold/teal/purple only as
  tertiary markers → colour-blind safe by construction
- hero accent gradient (pale blue → periwinkle → peach) on one hero word only
- per-module accent pair (`--cs-a` rgb triplet + `--cs-ink`) — each product gets one hue

## Type scale (measured at 2595 px; values are clamp maxima)
- Hero h1 ≈ 86 px, lh 1.0, 600, tracking −0.045em; ≈ 31 px on a 375 px phone
- Section h2 56 / 48 px, lh 1.04, 600, tracking −0.035em
- Lead 19.2 px, lh 1.6, muted ink, max-w 42rem
- Eyebrow: mono 11.5 px uppercase, tracking 0.16em, muted
- Body/UI 14 px, small 12–13 px, mockup chrome 9–11 px mono
- Docs h1 40/44.8, h2 24.8/31, sidebar links 14 px
- Global body tracking +0.015em

## Layout / spacing
- Container max-width 1280 (dominant); reading widths 1152/1024/896/768/576
- Breakpoints: Tailwind defaults (640/768/1024/1280/1536) + 480 and 900 edge cases
- Fixed transparent nav 64 px; hero top padding 132 px; sections carry only 24 px own
  padding — rhythm comes from the inner blocks
- Radius ladder: 999 px pills (most used) · 4/6/8/10/12/14 · 22 px for big product frames

## Navigation
- Desktop: grouped top level (Products ▾, Features ▾, Learn ▾, Build, Pricing, FAQ, Company ▾),
  text Login + small pill Sign Up (32 px tall, 14/600, 6×20 padding). Product mega menu
  lists each module with a 22 px brand mark.
- Phone: hamburger → full-screen fixed sheet; the button relabels to a "close" aria-label
  with `aria-expanded=true`; body scroll locked (`overflow:hidden`); groups become
  accordions; full-width primary CTA at the bottom then 3 trust lines. No horizontal
  overflow at 375 px.

## Docs shell
Inside the 1280 container: sticky left sidebar 276 px (top offset 116 = nav + product
strip), article 760 px, sticky right "on this page" rail 224 px; product switcher strip
above; ⌘K search button with `<kbd>`; prev/next pager under the article.

## Motion
- Dominant easing `cubic-bezier(.2,0,0,1)` (28 uses); secondary `(.4,0,.2,1)`
- Durations: 200 ms most common, 250, 300–350 ms for panels; 450–700 ms only hero rises
- Hero entrance: staggered rise (delays .15/.35/.55 s). 53 keyframes, mostly mockup loops;
  10 `prefers-reduced-motion: reduce` blocks switch them off
- Glass is rare: backdrop blur 4–10 px on floating chrome only

## Product-mockup framing
Real UI screenshots (webp) with separate dark/ and light/ sets (theme swaps the image,
no filters). Frame: `--frame-bg`, 1 px hairline ring, very large soft shadow
(`0 40px 120px -40px` black on dark; layered 1/30/70 px on light), radius 14–22 px.

## Component inventory (public)
Fixed nav + mega menu · phone sheet · theme toggle · hero (eyebrow, h1 with one gradient
word, lead, pill CTA pair, trust row) · stat strip · module cards with marks · case-study
sections with per-module accent · framed screenshots · FAQ accordion · pricing cards ·
footer veil · docs (product strip, sidebar, article, TOC rail, pager, ⌘K) · floating chat bubble.

## Implications for QuantEdge
1. Text tiers as alpha of one ink → fewer greys, coherent contrast.
2. One accent per module; neutral everything else; loss ≠ red in mockups (we already use vermilion — fine).
3. 64 px nav, 1280 container, 200 ms + `(.2,0,0,1)` as the default transition.
4. Phone nav must lock body scroll and expose `aria-expanded` + an accessible close label.
5. Docs: sticky sidebar + TOC rail, ~760 px measure.
