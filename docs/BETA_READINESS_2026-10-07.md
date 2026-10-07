# QuantEdge beta readiness — 2026-10-07

Branch `feat/beta-ready` (from `integrate/pdf-fixes`, merged again at `be7322d7`). Invite-only beta, Free tier on, checkout off.
Checked under client-only `vite` with the dev harness fixtures (no server, no database, no `.env`).
Gates: `test:tsc-gate` 445 errors (cap 503, ≤ 446 required) · client build passes · all 50 `test:*` scripts pass.

✅ done and verified · ⚠️ works, with a caveat or an operator step · ❌ not done / blocker

## 1. Landing (signed-out `/`)

| Item | State | Notes |
|---|---|---|
| Rebuilt to a TerraTrade-grade structure in our own brand | ✅ | `pages/landing-v2.tsx`: announcement bar, slim nav (Product ▾, Track record, Pricing, FAQ, ⌘K "Tour the terminal", theme, Sign in, Join beta), hero with the operator's tagline "QuantEdge — More edge to the traders.", stat strip, "Market data from" row, desk tour, 4 alternating feature sections, "A record you can check", pricing, FAQ, closing CTA, footer. Old `landing-nexus.tsx` removed. Screens: `docs/screens/landing-v2/`. |
| Product visuals are the REAL app, never a recreation | ✅ | `components/landing/real-frame.tsx`. Prefers a capture at `client/public/videos/<desk>.mp4` (+ `.webm`, poster `posters/<desk>.jpg`), probed by content-type; otherwise the real terminal route in a same-origin iframe (`?qe-demo=1`, `demo/demo-embed.ts`: scoped fetch → sample fixtures, in-memory storage, no sockets), scaled into the frame, inert, lazy (mounted ~600px before view). Hero: NEXUS desk. Tour: NEXUS · 0DTE · Flow · GEX · Sectors · Quantinum Bot · Journal. Features: the real phone UI. |
| Demo looks like a strong live session | ✅ | Frames pinned to 09:40 ET of the 0DTE fixture day and running forward. NEXUS: six setups with real-engine evidence layers, graded by the real grade code (NVDA A100, MSFT A95, TSLA B86, others C). 0DTE: index engine OK, LIVE flow-ignition rows. Journal: balanced book (18W/20L, net ≈ +$400). No visible "fixture"/"harness" wording (sanitiser in demo-embed). |
| Never shows "—/no data/Loading" to a visitor | ✅ | Stat strip falls back to four standing facts (true by construction) until the verified record loads; ledgers say "Reading…" / why it didn't load. |
| Stat strip = verified, sourced, age-stamped counts only | ⚠️ | Needs the server change in this branch (`/api/public/showcase` → `record`, bar-verified NEXUS book only, `shared/landing-record.ts`). Operator: deploy the server, and keep the verify-nexus-book ledger fresh on the droplet — the "Checked against bars" cell is as old as the ledger. |
| Desk video slot | ⚠️ | Wired and tested with no files present (falls back to the live app). Operator/capture agent: drop `client/public/videos/{nexus,0dte,flow,gex,sectors,bot,journal}.mp4` (+ `.webm`) and `client/public/posters/<desk>.jpg`. ≤ 3 MB each recommended. |
| Motion, reduced motion | ✅ | Scroll-in reveals from a visible resting state, ~250 ms tab crossfade, ≤12 px frame parallax, hover micro-interactions; all off under `prefers-reduced-motion` (videos never autoplay there). |
| Light and dark | ✅ | Own token set (`styles/landing-v2.css`), light tuned separately; frames follow the page mode. |
| No boot splash on `/` for visitors | ✅ | `index.html` removes the loader on `/` unless the browser was signed in last time (`qe-auth-hint`, set/cleared by `useAuth`); `SmartLanding` renders the landing while auth loads. |
| `/?preview=landing` for signed-in users + Settings link for admins | ✅ | "View landing" chip in Settings › jump row (admins only). |
| Honest copy | ✅ | No profit claims; win rates only with n and ≥ 30; findings show our losses with n and dates; founder/lock-in pricing promise removed; "Most popular" → "Recommended"; paid plans say "proposed price · not on sale yet". |
| Same-origin framing | ⚠️ | Relies on `X-Frame-Options: SAMEORIGIN` / `frame-ancestors 'self'` (current `server/security.ts`). Do not tighten to `DENY`. |
| Landing weight | ⚠️ | Landing chunk 50 KB, demo chunk 46 KB, but each live frame loads the full app inside its iframe. The captures (when they land) are the light path; consider limiting live frames to the hero + active tab only (already lazy). |

## 2. Beta flow

| Item | State | Notes |
|---|---|---|
| Invite email → `/invite?code=` → `/signup?code=` | ✅ | `invite-welcome.tsx` now routes to the one sign-up form (code prefilled; screens `docs/screens/beta/390-light-0{1,2}-*.jpg`). Email link itself still points at `/invite?code=` (fine). |
| Sign-up gives Free unless the invite carries a tier | ✅ | `server/routes.ts` signup: `tierOverride || 'free'` (read, unchanged). |
| Waitlist path, Discord link | ✅ | `/signup?waitlist=1`; Discord `https://discord.gg/ppjjxVfsc` in the announcement bar, hero, closing CTA, FAQ, footer, and the "you're in" next steps. |
| Pricing honest with checkout off | ✅ | "Free while it's in beta"; Free → "Join the beta"; paid → "Join the waitlist"; whisper line under the CTA. Screen `390-light-03-pricing-free-beta.jpg`. |
| Free-tier gates show an upgrade/beta message, never blank/raw error | ⚠️ | `reasonOf()` turns any tier 403 into "This is part of the Advanced plan. Your beta account is on Free, and paid plans aren't on sale yet — see Pricing to join the waitlist." Ticker news (gated catalysts) now shows it (was "no headlines on file"). Harness: `?harness-tier=free` mirrors the server's 403s. **Gap:** the Free plan card says FLOW, options ideas and the 0DTE desk are not in Free, but neither server nor client gates them — a Free beta user sees everything. Operator decision: gate them, or change the Free card copy. |
| Signed-out gate copy | ✅ | `protected-route.tsx`: "Sign in to continue — invite-only beta…" (was "Create a free account / Sign Up Free"). |
| First-run on Free | ⚠️ | NextSteps (watchlist → NEXUS → Discord) + the in-app guide exist. The NEXUS first-run guide text predates the new default layout (audit #144); not rewritten here. |

## 3. Sweep (dev harness, 1366×768 and 390×844, dark + light spot checks)

Pages: `/`, `/signup`, `/signup?code=`, `/login`, `/invite`, signed-out `/t`, `/today`, `/t`, `/t?nx=0dte`, `/t?tab=flow|gex|sectors|crypto|journal|bot`, `/r/NVDA`, `/settings`, `/admin`, `/how-to`, `/performance`, `/t?tab=catalyst`.

| Check | State | Notes |
|---|---|---|
| Horizontal overflow | ✅ | None at 1366 or 390. |
| Console / render errors | ✅ | No error boundaries hit. (Harness 404s for unfixtured endpoints are fixture gaps, not app errors.) |
| "undefined"/"NaN" in UI | ✅ fixed | NEXUS Market Context "Bonds · TLT +0.22% · undefined" (`nexus-parts.tsx`) and Admin "skipped undefined" (`admin/overview.tsx`). |
| Unnamed buttons/links, images without alt | ✅ | 0 on every page swept. |
| Touch targets < 32px on phone | ⚠️ | Only inline text links in prose (allowed by WCAG 2.5.8) on landing/auth; footer links padded. `/today` reports 26 small controls at 390 (dense chips) — left for the Today pass. |
| Empty/loading states | ⚠️ | Ticker page at 390 shows "Loading quote…" and "—" tiles under the harness (no quote fixture for that path) — verify against prod data. |
| Bundles (top, raw/gzip KB) | ⚠️ | `index` 465/151 (app shell, every route) · `analytics-chart` 380/105 · `lightweight-charts` 168/54 · `index` 156/47 · `nexus-tools` 147/46 · `use-reduced-motion` (framer-motion) 112/37 · `tv-chart` 109/35 · `gex-tools` 93/29 · `terminal-shell` 91/31 · `performance` 89/24. Landing route is lazy (50 KB). Not cheap to cut further here: the 465 KB shell is eager imports in `main.tsx`/`App.tsx`; framer-motion is pulled in by the shell. |

## Operator to-do
1. Deploy the server (`server/public-showcase.ts` record section, `server/journal-sources.ts` export) with the client; keep the bar-verification ledger fresh.
2. Drop the capture videos + posters (paths above).
3. Decide Free gating for FLOW / options ideas / 0DTE (or edit the Free plan card).
4. Keep `frame-ancestors 'self'`.
5. Approve paid prices before turning `CHECKOUT_LIVE` on (copy flips automatically).
