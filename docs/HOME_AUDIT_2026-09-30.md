# Home page + sign-up audit — 2026-09-30

Scope: the public landing (`client/src/pages/landing-nexus.tsx`, `components/landing/live-showcase.tsx`,
data from `server/public-showcase.ts`) and the sign-up flow (`pages/signup.tsx`, `join-beta.tsx`,
`invite-welcome.tsx`, `login.tsx`, `components/waitlist-prompt-modal.tsx`, server `/api/auth/signup`,
`/api/waitlist/join`, `server/googleAuth.ts`).

Method: built client served by `research/device-audit.ts` (`AUDIT_SERVE_ONLY=1 AUDIT_SIGNED_OUT=1`,
synthetic fixtures — the harness banner in captures is not part of the page), measured and
screenshotted with Playwright at 375×812, 768×1024 and 1440×900 (dark), plus a code read.
Guides: docs/POSITIONING.md, docs/UX_COPY_GUIDE.md, docs/DESIGN_SYSTEM.md, docs/SEO_PLAN.md;
WCAG 2.1 AA checklist (design:accessibility-review), UX copy patterns (design:ux-copy).

## Headline findings (before)

| # | Finding | Severity |
|---|---|---|
| 1 | **Dead-end sign-up loop.** Hero "Open the terminal" and nav "Get access" went to `/t`, which for a visitor is a gate modal → "Create Free Account" → `/signup`, which *requires* an invite code; its "Don't have a code? Join the waitlist" linked back to `/` — and the landing had no waitlist form. `POST /api/waitlist/join` existed but nothing on the public path called it (only a popup on /login). A visitor without a code could not get in or even ask. | Critical |
| 2 | **The hero didn't say what it is or who it's for.** H1 was the three-pillar slogan ("See the positioning. Rank the setup. Prove the record."); the category and audience were only in the grey subline. | High |
| 3 | **Phone "looks way too big".** Hero was 814px at 375: a 3-line 34px slogan, two full-width stacked 44px buttons, then a desktop GEX screenshot shrunk to ~360px wide (unreadable, "Sample data"). The real product (live panels) started ~900px down. Pricing stacked three full cards = **2,306px** of phone scroll. | High |
| 4 | The product visual above the fold was a sample-data screenshot while real, stamped live panels existed one section lower. | Medium |
| 5 | Live panels' **loading state lied**: before the first fetch returned, panels printed "SPY dealer levels are computing…" / "Crypto movers unavailable right now" / "The bot record is unavailable". | Medium |
| 6 | No "how it's different" or track-record section — the transparency story (timestamps, n-gated win rates, loss rules, MEASURING labels) was only implicit inside panel footnotes. NEXUS panel showed idea dates without time, so "exact call timestamps" wasn't visible. | Medium |
| 7 | No community / Discord entry point anywhere public. | Medium |
| 8 | Sign-up errors surfaced as a toast with the raw `apiRequest` message (`403: {"error":"Invalid or expired invite code…"}`); password rule only as a placeholder; no success state (toast "Account created!" then jump to /t); brand "Quant Edge Labs" (banned by POSITIONING) in the toast, /login footer, /join-beta and /invite headers. | High |
| 9 | Sign-up inputs 14px on ≥ 768px (fine on phone), 36–38px tall with 36px icon buttons with no accessible name (show-password, back). `/join-beta` inputs were 14px with inline styles → **iOS zoom on focus**, labels not associated with inputs (`<label>` without `htmlFor`). | Medium |
| 10 | Tap targets: live-panel tabs and the billing toggle were 40px; nav links 36px. | Low |
| 11 | FAQ answers capped at `max-height:400px` when open — long answers can clip on narrow phones. | Low |
| 12 | Waitlist gate modal copy ("Free to browse! … Apply for beta to unlock everything") contradicted the invite-only reality. | Low |

What was already right and is kept: gamma-mark logo + boot wave, dark NEXUS palette, 16px
gutters on phone, no horizontal overflow at any size, reduced-motion handling, the live
panels reading real endpoints with source/age stamps, the disclaimer, the founder line.

## What changed

**Landing** (order now matches what a first-time visitor looks for):
1. Hero: eyebrow keeps the three pillars; H1 = what it is ("The trading research terminal for
   stocks, options and crypto"); subline = who it's for; CTAs **Join the beta** (→ /signup),
   **See it live**, **Join Discord**; a one-line status (invite-only beta · free plan on delayed
   data · not investment advice). The **live panels are now the hero visual** (real data, stamped).
   Phone: H1 28px, CTAs at y≈350, live panel inside the first two screens.
2. What you get — NEXUS, FLOW, GEX, 0DTE desk, Journal, Quantinum Bot as scannable blocks.
3. How it's different — timestamps, public record/honest baseline, loss rules, MEASURING.
4. Track record — a live band read from the same `/api/public/showcase` payload (one shared poll):
   bot closed n, win rate only at n ≥ minSample (with n), delayed NEXUS ideas hit target/stop,
   each stamped with its age; buttons switch the live panel to the bot / NEXUS tab. No number is typed in.
5. Pricing — from `shared/pricing.ts` (placeholder, see below). Phone: one swipe row (was 2,306px → 1,034px); tablet: 3 columns.
6. Community — "Join Quant-Edge Traders on Discord" (hidden if no valid invite).
7. FAQ — new "How do I get into the beta?" (same text feeds the FAQPage JSON-LD); open answers no longer clip.
8. Footer — Terms, Privacy, Risk disclaimer anchor, Discord, founder line.

Live panels: skeletons while loading (no more "unavailable" before the first response); NEXUS
ideas show publish time in ET ("Sep 29 · 10:42 ET"); tabs 44px; smooth scroll respects reduced motion.

**Sign-up** (`/signup`, rebuilt in the landing's graphic style):
- One page, two paths via a segmented control: *I have an invite code* / *Join the waitlist*
  (`POST /api/waitlist/join`, source `signup`). `?code=`/`?invite=` prefill; `?waitlist=1` opens the waitlist.
- Invite code explained ("It's in your invite email. Not case-sensitive."); Google explained ("For invites sent to a Google address — no code needed").
- Password rule shown up front and checked live (the server's ≥ 6 — unchanged); match indicator.
- Errors inline with `role=alert`, in words (`reasonOf`), with the next step (e.g. email exists → sign in / reset).
- Success → "You're in" next steps: build your watchlist, open NEXUS, join the Discord; primary button returns to `returnTo` when present.
- 16px inputs, 48px fields, 44px show/hide buttons with names, every input labelled, `autocomplete` set.
- `/join-beta`: 16px inputs, labels bound, rule shown, same next-steps success (no 2-second auto-jump), QuantEdge brand. `/invite`, `/login`, gate modal: brand/copy fixes, readable errors.

**Discord**: `client/src/lib/public-config.ts` — `DISCORD_INVITE_URL` = `VITE_DISCORD_INVITE_URL`
if it is a valid `discord.gg/<code>` or `discord.com/invite/<code>`, else the operator's default
`https://discord.gg/ppjjxVfsc`. OAuth/authorize URLs are rejected.

## After (measured, harness build)

| | 375 | 768 | 1440 |
|---|---|---|---|
| H1 | 27.8px (was 33.5) | 36px | 52px |
| First CTA top | 350px | 368px | 403px |
| Pricing section height | 1,034px (was 2,306) | 1,179px (was 2,252) | 1,106px |
| Horizontal overflow | 0 | 0 | 0 |
| Controls < 44px | inline text links only | same | same |
| /signup input font | 16px | 16px (was 14) | 16px (was 14) |

The phone page is longer overall (≈8,000px vs 6,500px) because it now carries the sections a
visitor expects (features, difference, record, community); the first screen is lighter.

## Server findings — reported, NOT changed (security/auth logic)

1. `POST /api/auth/signup` has **no rate limiter** (login uses `authLimiter`; the beta endpoints use
   `adminLimiter`) — invite codes can be guessed and accounts mass-created. Add `authLimiter`.
2. No `req.session.regenerate()` on signup/login before setting `userId` — session fixation risk.
3. Password minimum is **6** on `/api/auth/signup` but **8** on the `/join-beta` form; pick one (≥ 8 recommended) server-side.
4. `ADMIN_ACCESS_CODE` is accepted as a signup invite code and compared with `===` (not constant-time).
5. `server/googleAuth.ts`: any existing beta user on the free tier is **upgraded to `pro` on every Google login** — likely unintended now that tiers are paid.
6. Google callback redirects to `/trade-desk` (legacy; resolves via the redirect table — one extra hop).
7. `/api/waitlist/join` has no rate limit and posts to a Discord webhook per new email.

## Needs the operator

- Final prices → `shared/pricing.ts` (values marked `TODO(operator)` are the previously-live 39/349 and 79/699, carried over, not decided).
- Confirm the Discord invite never expires (Server settings → Invites → "Expire after: Never").
- Review the community blurb and the "How it's different" copy for accuracy; review Terms/Privacy pages (not changed here).
