# Admin hub

`/admin` — the operator's back office. It sits behind its **own** access gate
(4-digit access code → admin password → an HTTP-only `admin_token` cookie,
24 h), separate from the normal sign-in. The link is in the account menu
(and at the top of Settings) **only for the operator** — `isAdmin` on
`/api/auth/me` (owner email) or the `admin` tier.

**Do you need it?** Day to day, no. The product itself (NEXUS, GEX, FLOW, the
journal) does not depend on anything here. Open it when you want to:

- let someone in or out — approve the waitlist, send / resend / revoke an invite, change a user's tier;
- see whether the platform is healthy — data providers, memory, restarts, rate limits, Discord bot;
- write or edit a blog post.

> **2026-10-01:** Users & access was rebuilt (invite codes, waitlist approval, users, trader-book passcodes) and an Audit log section was added. See [ADMIN_TAB.md](ADMIN_TAB.md); it supersedes the Users & access row below.

## Sections (2026-09-29: twelve pages → four)

| Section | URL | What it is for | Reads / writes |
|---|---|---|---|
| **Overview** | `/admin` | One screen: platform health strip, users / active 24h / waitlist / invites, the raw idea record (with n), recent activity, top pages. | `/api/health`, `/api/admin/stats`, `/api/admin/waitlist`, `/api/admin/invites`, `/api/admin/activity`, `/api/admin/analytics` |
| **Users & access** | `/admin/users` · `/admin/invites` · `/admin/waitlist` | Accounts and tiers; the beta gate (create / resend / revoke invites; approve, reject or invite waitlist entries). Three sub-tabs of one section. | `/api/admin/users[/:id]` (GET/PATCH/DELETE), `/api/admin/invites[/:id/resend\|/revoke]`, `/api/admin/waitlist[/approve\|/reject\|/send-invites\|/:id/invite]` |
| **System health** | `/admin/system` | Observed state only: release + git sha, uptime, RSS/heap, pm2 id/restarts (when pm2 exposes them), faults caught since boot, data providers (Alpaca · Schwab · CBOE · Yahoo · Bullflow), Postgres latency + size + largest tables, Discord bot token, idea producers in-process, AI keys configured, outbound API failures and rate-limit warnings, admin audit log + failed admin logins. | `/api/health`, **`/api/admin/hub/status`** (new, `server/admin-hub-routes.ts`), `/api/admin/database-health`, `/api/admin/ai-provider-status`, `/api/admin/security-stats`, `/api/admin/audit-logs` |
| **Content** | `/admin/blog` | Draft, publish, edit and delete posts on the public blog. | `/api/admin/blog`, `POST /api/blog`, `PATCH/DELETE /api/blog/:id` |

The hub is drawn in the platform's page template (LuxPage header, section tabs,
`--lx-*` tokens — it follows the five visual modes), not a separate sidebar app.
Styles: `client/src/styles/admin-hub.css`.

## Audit of the old pages

| Old page | What it did | Endpoints | Verdict |
|---|---|---|---|
| Overview | KPIs, activity, "System Status", DB/Revenue/Conversion cards, 24h analytics | stats, activity, analytics, system-health, users, waitlist, invites — all exist | **Rewritten.** "Revenue $0.00", "0 tables", "Ideas today" and the System Status list read fields no endpoint returns (always 0 / empty) — removed. |
| Users | list, tier change, delete | `/api/admin/users`, `/:id` GET/PATCH/DELETE — exist | **Kept** (Users & access). |
| Invites | create / send / resend / revoke | `POST /:id/send` and `DELETE /:id` **did not exist** | **Kept, fixed:** send → `/:id/resend` (emails a pending or sent invite), revoke → `POST /:id/revoke`. |
| Waitlist | approve / reject / bulk invite / resend | `/:id/resend-invite` **did not exist** | **Kept, fixed:** resend finds the entry's open invite and calls `/api/admin/invites/:id/resend`. |
| Beta invites | a second invites + waitlist screen | same endpoints | **Dropped** — duplicate. `/admin/beta-invites` → `/admin/invites`. |
| System | provider cards, AI status, API metrics, DB health, "Optimize database" | `system-health` hardcodes AI + services as "operational"; `/api/admin/database/optimize` **did not exist** | **Rewritten** as System health on observed data only. |
| Security | audit log, request stats, failed logins | audit-logs, security-stats — exist (in-memory since boot) | **Merged** into System health. `/admin/security` → `/admin/system`. |
| Trade ideas | idea stats + list + delete | `/api/admin/trade-ideas/stats` **did not exist** | **Dropped** — ideas are reviewed on NEXUS / Today. `/admin/trade-ideas` → `/admin`. |
| Reports | generate daily/weekly/monthly platform reports | `/api/admin/reports*` exist | **Dropped** — superseded by the SR 11-7 validation record and JOURNAL › Track record. `/admin/reports` → `/admin`. The server routes remain. |
| Win/Loss | outcome distribution, stop-loss sim, expiry analysis | `/api/admin/win-loss/*` exist | **Dropped** — the model record's home is JOURNAL › Track record. `/admin/win-loss` → `/t?tab=journal&jtab=record`. The server routes remain. |
| Credits | AI-credit balances / usage / reset | `/api/admin/credits/*` exist | **Dropped** — credit metering is not a user-facing feature now; tiers are managed on Users. `/admin/credits` → `/admin/users`. The server routes remain. |
| Blog | post editor | admin/blog, blog CRUD — exist | **Kept** (Content). |

Redirects live in `client/src/lib/legacy-redirects.ts` (one hop, checked by
`research/check-legacy-redirects.ts`).

## Settings audit (same change)

`/settings` was redesigned alongside the hub. Every control now writes a store
that something reads.

- **Removed (dead):** the whole *Bots* tab (strategy selects and thresholds were
  local state that never saved; "Clear logs" only showed a toast); the four
  notification toggles and the Discord webhook field (`enable*Alerts`,
  `discordWebhookUrl` — never read anywhere); *Default view mode*, *Default asset
  filter*, *Trading style* (`defaultViewMode`, `defaultAssetFilter`,
  `holdingHorizon` — not read by any page); per-user *Layout density* (its
  `densityClass` was never applied); the *Timezone* select (`timezone` was
  never read).
- **Kept:** name (PATCH `/api/auth/me`), email (read-only), plan / member since;
  account size, risk per trade, options budget, capital per idea
  (`/api/preferences` — read by signal sizing, `shared/sizing.ts`).
- **Added / moved in:** the display-mode gallery with a preview of each mode (the
  **only** place the mode is chosen — the account menu shows the current mode and
  links here; the Customize panel and the terminal drawer link here too); text
  size, density, calm mode (the board prefs that are actually applied); clock
  ET / this device (journal); default horizon (0DTE · Day · Weekly · Swing ·
  Monthly · Position · LEAPS, read by every horizon filter); watchlist summary →
  NEXUS; alert types, delivery, sounds, watchlist-only (the alert engine's own
  prefs); Alpaca status + disconnect, Discord bot status; default journal book +
  sizing-rule display; export my journal (CSV) and delete my journal (typed
  confirmation).

## Known gaps

- `/api/preferences` is one shared row (`storage.getUserPreferences()` reads the
  first row), not per user. The sizing numbers are therefore platform-wide.
  `/api/user/:userId/preferences` is per user but has **no ownership check**.
- No number-format setting: nothing formats numbers from a preference, so a
  control would be fake. Trading days are always New York; the clock choice
  covers the display side.
- The Users / Invites / Waitlist / Blog page bodies still use their original
  shadcn cards (some `text-white` literals), so they read best on dark grounds.
