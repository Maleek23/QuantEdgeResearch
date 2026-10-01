# Theme audit — light mode everywhere · 2026-09-30

**Standard:** WCAG 2.1 AA (1.4.3 text ≥ 4.5:1, large ≥ 3:1; 1.4.11 UI/graphics ≥ 3:1) · **Modes:** light, dark (+ midnight / dim / high-contrast spot-checked)
**Operator:** "love light mode so much, but Today isn't showing light mode; landing page people should be able to pick whichever mode; make sure all colors work as needed."

Method: static production build (`npm run build`) served locally with every `/api/*` mocked (no prod, no DB), Playwright headless Chromium at **1440 and 375** (landing also 390 / 430) in light and dark, a full-page screenshot per page, and an in-page scan that walks every visible text node, composites its colour and opacity over the real painted background stack, and flags anything under 4.5:1 (3:1 for large text). Pages: landing, login, signup, Today, NEXUS, GEX, FLOW, ticker (/r/NVDA), journal, bot, catalyst, crypto, positions, settings.

## 1 · Does each page follow the mode?

| Page | Before | After |
|---|---|---|
| **Today** (`pages/today.tsx`) | **No — always dark** | Follows the mode |
| Landing (`pages/landing-nexus.tsx`) | Light palette, but dark nav bar / terminal panels / tape and white-gradient headings (invisible start) | Follows the mode + picker |
| Signup / join-beta (`.landing.lp` auth pages) | Same as landing (dark inputs, dark card shadow) | Follows the mode + picker |
| Login (Tailwind) | Followed, but the primary button was ink on gray-900 (**1.0:1**, invisible), links sky-400 (2.1:1) | Fixed + picker |
| NEXUS, GEX, FLOW, chart, ticker, journal, positions, settings | Followed (shell puts `.light` on its `.nexus-vars` root) | Unchanged, spot fixes below |
| Bot | Followed, but `--bot-bright` (#7dd3fc) values 1.6:1 | Fixed |
| Crypto | Followed, but perf cells on a near-black wash (2.9:1), coin icons white on orange (2.0:1) | Fixed |
| GEX phone summary (`gxp-levels-body`), qe-chart portal | Nested `.nexus-vars` without `.light` → dark island | Fixed by the root-cause change below |

### Root cause — why Today did not switch

Two stacked causes, both "a nested palette that never hears about the mode":

1. **A second `.nexus-vars` root.** Today renders `<div class="landing nexus-vars today-l today-page">` *inside* the NexusFrame shell. The light palette only existed as `.nexus-vars.light` (the class on the **same** element), and only the shell root got `.light`. Today's own `.nexus-vars` re-declared every variable with the **dark** values, so the whole page (and the landing graphic language it reuses) re-grounded to `#06070a` under a light shell. The same trap hit the qe-chart portal and the GEX phone summary.
2. **Today's local tokens were dark literals.** `.today-l{--text-dim:#9aa3b5;--accent:#3b8cff;--gain:#6ee7b7;--loss:#ff6b3d;--amber:#facc15}` plus `rgba(10,12,17,.9)` key cells and `rgba(14,17,23,.6)` search — even with a light palette those would paint mint/vermilion text at **1.4–2.6:1** on the light ground.
   (A third, older rule in `today.css` deliberately forced each Today band to a dark `#0e1117` panel in light mode — "the landing graphic language is dark by design".)

**Fix:** the light palette now also applies by ancestry — every `.nexus-vars.light` selector in `nexus.css` became `:is(.nexus-vars.light,[data-mode=light] .nexus-vars)` (42 rules), so *any* `.nexus-vars` under `html[data-mode=light]` is light, class or not; Today/landing/signup also carry `.light` like the shell. Today's tokens now **derive** from the palette (`--accent:var(--cyan)`, `--gain:var(--green)`, `--loss:var(--red)`; cells/fields are `--tl-*` tokens with light, midnight/dim and contrast values), the forced-dark band rule was replaced with light panels, and the bright dim/mute tuning applies to the dark ground only. Today's structure is untouched.

## 2 · Hard-coded colours fixed

| Where | What | Count |
|---|---|---|
| `styles/today.css` | `.today-l` dark literals → palette-derived tokens; key cells, search field, ladder "now" bar, path glow, spot dot, link hover | 15 |
| `styles/nexus.css` | `linear-gradient(135deg,#fff …)` title starts → `var(--nx-title-from)` (#fff dark / #121826 light) — brand, hero, section, bot, crypto, catalyst, leaps, ticker titles | 21 |
| `styles/nexus.css` landing · light block | nav bar, terminal/feature panels, panel heads, tape, spark tooltip, signal cards, flow rows, screenshot tag, url pills, stat cells, skeleton, auth card/input, CTA (white on deep accent), glows | 24 |
| `styles/nexus.css` desks | bot / BTC / ETH accents re-tuned for light (9 tokens); coin icon ink; perf / contract / proxy / correlation recessed cells; NEXUS direction chips on a selected row; plan flag ink (was #fff on #3b8cff, 3.3:1 in **dark**); rotation-label 0.7 opacity | 18 |
| `components/landing/live-widgets.tsx` | canvas sparkline + rotation quadrant read the mode's tokens (were 8 hex/rgba literals, never re-painted on a mode change); conviction band colours (#fbbf24/#facc15 → `--amber`, 1.6:1 → 5.0:1) | 13 |
| `components/landing/live-showcase.tsx` | GEX bars, spot line (#fff on a white panel) | 3 |
| `pages/today.tsx`, `dashboard/tools/today/today-tools.tsx` | SPY sparkline colour | 2 |
| `pages/login.tsx`, `components/footer.tsx` | `#fafafa` grounds, ink-on-gray-900 button, sky-400 link, purple-400 count | 6 |
| **Subtotal (direct)** | | **≈102** |
| `styles/modes.css` safety net | 128 legacy `text-<hue>-200/300/400` Tailwind literals in 28 files (admin, trade-audit, broker import, about, error boundary, footer…) step to their 700/800 shade under `html[data-mode=light]`; `dark:` variants untouched | 128 |

## 3 · Contrast check (measured, key tokens)

| Element | Foreground | Background | Ratio | Req. | Pass |
|---|---|---|---|---|---|
| Light body text | #121826 | #f2f5f9 | 16.2 | 4.5 | ✅ |
| Light dim / mute | #46536b / #5f697d | #f2f5f9 / #e7ecf3 | 7.1 / 4.65 | 4.5 | ✅ |
| Light gain / loss / caution (on the darkest light surface #e7ecf3) | #047857 / #b23c0b / #8f5706 | #e7ecf3 | 4.62 / 4.99 / 5.01 | 4.5 | ✅ |
| Light accent text | #1a63d1 | #e7ecf3 | 4.72 | 4.5 | ✅ |
| Light primary CTA | #fff | #1a63d1 → #1557c0 | 5.6 → 6.65 | 4.5 | ✅ |
| Dark gain / loss / caution | #6ee7b7 / #ff6b3d / #facc15 | #0e1117 | 12.4 / 6.7 / 12.3 | 4.5 | ✅ |
| Dark accent on the lightest dark surface | #3b8cff | #1a1f2a | 5.0 | 4.5 | ✅ |
| Dark primary CTA ink | #031917 | #3b8cff | 5.5 | 4.5 | ✅ |
| Plan flag (dark) — was #fff | #06070a | #3b8cff | 3.3 → **6.1** | 4.5 | ✅ |
| Bot accent (light) — was #7dd3fc | #0369a1 | #fff | 1.7 → **5.9** | 4.5 | ✅ |
| Coin icon — was white on #f7931a | #140c00 (dark) / #fff on #b45309 (light) | | 2.0 → **8.5 / 5.0** | 4.5 | ✅ |
| NEXUS bull chip on a selected row (light) | #065f46 | #c8dfe4 | 3.9 → **5.5** | 4.5 | ✅ |
| Login primary button (light) — was ink on gray-900 | #fff | #111827 | 1.0 → **17.7** | 4.5 | ✅ |
| Error-boundary "Technical details" (light) — was yellow-400 | #854d0e | #f4f4f4 | 1.4 → **6.2** | 4.5 | ✅ |
| Old dark gain/loss if left on light (what Today showed) | #6ee7b7 / #ff6b3d | #f2f5f9 | 1.4 / 2.6 | 4.5 | ❌ (fixed) |

Semantic gain / loss / caution clear 4.5:1 on every surface of both grounds (light worst case #e7ecf3, dark worst case #1a1f2a).

**Automated scan result:** 47 text failures across 14 pages × 2 modes × 1440 before → **0 actionable** after (1440 and 375, light and dark; Today / landing / login also clean in midnight, dim and high contrast). The 30 remaining hits are exempt and listed in §5.

## 4 · Public-page mode picker

`components/landing/theme-picker.tsx` — a **Light / Dark / System** radiogroup (roving tabindex, arrow keys, `aria-checked`, ≥ 30–32px targets, visible focus ring) in the landing header, the signup header and next to "Back to home" on login.

- **One source of truth.** It writes the app's mode store (`lib/visual-mode.ts`, `localStorage['qe-mode']`, every access in try/catch). The store gained a `'system'` preference: it resolves through `prefers-color-scheme` and repaints live when the OS flips. `client/index.html`'s pre-paint script resolves it too, so there is no flash.
- **Default = System** for a device that never chose (a first-time visitor gets their OS mode). A visitor who picks on the landing page and then signs in lands on Today in the same mode (verified headless: Dark → ArrowRight to System → OS flip followed → Light → `/today` light).
- **Settings stays the in-app home.** Settings › Display gained a "Match this device" switch (the same `'system'` preference); the five-mode picker is unchanged. Midnight / Dim / High contrast read as "Dark" in the public picker, and clicking Dark again keeps them.

Behaviour change to note: a signed-in device with **no** stored mode used to default to Dark; it now follows the OS (System). Every device that ever chose keeps its choice.

## 5 · What's left / exempt

| Item | Status |
|---|---|
| `fc-wm-sym` — the 64px ticker watermark behind charts (1.2:1) | Decorative by design, exempt. **Chart file** (`components/charting/`) — not touched. |
| `fc-chip.off` — chart overlay chips (GEX/VEX) in their *off* state, 2.1:1 in both modes | **Report to the charts agent:** if "off" is a toggle state (not `disabled`), its label must stay ≥ 4.5:1 — use `--text-dim` without the opacity. Not edited (chart file). |
| `fd-btn` "Restore default layout", Settings "Save profile" | Disabled controls (opacity .45/.5) — exempt under 1.4.3. |
| Tape `·` separators, `/100` beside a gradient score | Decorative glyph / scanner false positive (gradient-clipped parent) — checked by eye. |
| Old `.today` prototype rules (`td-top`, `td-hero h1` …) at the top of `today.css` | Dead classes (no markup uses them); left as is. |
| Canvas charts in `components/charting/` | Read tokens via `modeVersion()` already; not re-audited here (charts agent owns them). |
| `.nexus-root.light` (legacy `/nexus` page grid) | Route redirects to `/t`; not converted. |

## 6 · Landing additions (operator, same pass)

- Hero product mockup restored (desktop GEX frame + overlapping NEXUS phone frame, eager-loaded, "Sample data" tag) above the live panels.
- New "Inside the terminal" gallery: NEXUS, FLOW, GEX matrix, chart, journal, Quantinum — browser frames, `loading="lazy"`, `decoding="async"`, width/height set (no layout shift), one caption each tied to the feature blocks; a horizontal snap carousel on phones. `gex-hub.png` / `trade-desk.png` were left out (retired UI).
- Disclaimer again says screenshots show sample data.
- Phones ≤ 430px: 27px headline, 15px body, 21px section titles, 20px gutters, 72px section rhythm, 44px buttons, roomier cards; the desktop frame peeks behind the phone frame. No horizontal scroll at 375 / 390 / 430 / 1440.
