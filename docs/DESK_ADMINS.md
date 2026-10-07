# Desk admins: one portal per trader (2026-10-07)

Each trader (Femi, Uzo, Yeab, Tommi, Ayo, Bean) gets a **desk**: their own copy of Malik's
workspace that they run themselves. A desk is one trader book (`traders` row) plus its own
paper bot, watchlist, passcode and privacy setting. The person who runs it is the **desk
admin**. Desk admins are **not** platform admins.

Flag: `DESK_ADMINS=true`. With it off, nothing changes: `/api/desk/:slug*` answers 404, no
desk bot runs, trader books stay visible as before, and `/api/desk/me` still reports the
super-admin (so the nav can show "Admin").

## Roles

| Role | Who | How it is decided |
|---|---|---|
| Super-admin | Malik | `ADMIN_EMAIL` or the `admin` tier (the same rule as everywhere else). For `/api/admin/*` he also needs the admin hub cookie (access code → password → `admin_token`), unchanged. |
| Desk admin | A normal member linked to **one** trader book | `traders.linked_user_id = users.id`. Malik sets it from `/admin/users` → **Desk admins** → "Make desk admin". They sign in with their own email/password or Google. There is no shared code and no admin JWT. |
| Member | Everyone else | — |

A disabled account is never a desk admin. One person runs one desk (assign refuses a second).
If a stray second link exists, the oldest book wins.

### What a desk admin can do (their own desk only)

- **Bot** (`/desk` → Bot): turn their bot on/off; change sleeve capacity (0DTE max open, swing
  max open), dollars (0DTE risk per trade, swing risk per trade, swing max debit), the swing
  sleeve's minimum NEXUS grade, the chase guard, min underlying R:R, min contract return at T1,
  **min stop width**, the entry window (ET), longs/shorts, universe (every published idea or only
  their watchlist) and a block list (≤ 50 tickers). Every value has a platform cap
  (`shared/desk-admin.ts` `DESK_BOT_CAPS`), and `deskSleeveConfig` / `deskEngineConfig` also clamp to
  the platform bot's **current** env config, so a desk bot can be stricter than the Quantinum Bot
  but never looser.
- **Journal book**: set / change / clear its passcode; import trades (the journal's existing
  import, which already lets the linked trader write their book); open the journal.
- **Privacy**: share the book with the group, or keep it private (the default).
- **Watchlist**: add / remove tickers (existing `/api/traders/:slug/watchlist`).
- **Account**: their own profile, Settings and NEXUS display preferences, and Alerts — the same
  pages every member has.
- **"I took this"** on any NEXUS idea → their desk book.

### What a desk admin cannot do

- Anything under `/api/admin/*`: users, tiers, beta access, invite codes, waitlist, trader-book
  admin, system health, audit log, desks assignment. They have no admin cookie → 401; a forged
  token → 403.
- Operator routes in `server/route-guards.ts` (executor, Alpaca, portfolio, SMS, idea-book
  writes, Discord posts): a desk admin is not an admin user → 403.
- Malik's bot: `/api/quant-bot/run` and `/api/automations/quant-bot/*` writes are admin-JWT only.
  A desk bot runs on its own book and cannot touch the platform bot's book (`runDeskBotCycle`
  throws for the platform owner).
- Another trader's desk, book, watchlist or bot: `/api/desk/<other>` → 403 before any data is
  read; journal writes to another book → 403 (`writableOwner`).
- Force a bot cycle (`POST /api/desk/:slug/bot/run` is super-admin only — CPU).
- Platform env / flags, spread / quote / loss rules, the 0DTE premium stop and targets.

Malik keeps everything, opens any desk at `/desk/:slug`, and manages every desk from
`/admin/users` → Desk admins (assign, remove, bot on/off, bot-slot count).

## Desk bots

- **Same engine.** A desk bot runs `runBotCycleInner` — the two-sleeve engine
  (`shared/bot-sleeves.ts`: 0DTE/1DTE sleeve + swing sleeve by NEXUS grade) with every gate: tape
  sit-out / selective, loss rules 1 and 2 (confluence, entry window), BTC-proxy shorts, one side
  per symbol, no same-day re-entry after a stop, executable live quote, contract selection, the
  0DTE premium management and flatten, expiry settlement, the swing time stop. The desk's own
  rules (`deskEntryCheck`) run **in addition**, in both sleeves, before the loss-rule gates.
- **Own book.** "Replica but fresh": a new $100K paper portfolio owned by `desk-bot:<slug>`
  (never a users.id), named `Desk Bot · <Name> · 100K`, created on its first cycle. Default config =
  the platform bot's current sleeves and filters, clamped into the caps.
- **No side effects.** No Discord, no bot notifier, no new-signal announcements, no
  blocked-trade-ledger rows, no gap watch, no system pulse, no retired-run handling — those
  belong to the Quantinum Bot.
- **Where it runs.** After the platform bot in the same schedule (`server/quant-bot-schedule.ts`),
  as one heavy-gate job (`desk-bots:<origin>`, low priority; high for the 15:5x flatten and
  post-close settle). Worker only (`botCycleAllowedHere`), each desk under its own Postgres
  advisory lock. The last cycle is stamped to shared state so the web process can show it.
- **CPU cap.** At most `DESK_BOTS_MAX` (default **3**, max 6) desk bots are enabled at once;
  enabling a fourth is refused with 409. If more rows are enabled (cap lowered), the
  oldest-enabled run and the rest are logged as skipped. The droplet has one vCPU; each desk cycle
  re-prices its own book and may read option quotes for candidates, so raise this only after
  watching the worker's cycle time.

## Privacy: private by default

With `DESK_ADMINS=true`, a trader book — its journal, watchlist, analysis, leaderboard row,
calls feed and every "I took this" attribution in it — is visible only to Malik and that book's
desk admin, unless the desk admin turns on **Share my book with the group** (`desk_bots.share_book`).
A hidden book reads as missing (404), and a passcode still locks a shared book. If the
`desk_bots` table is missing or unreadable, every book is treated as private (fails closed).

Known limit: leaderboard rank numbers are computed over every trader, so a gap in the ranks can
show that a hidden trader exists (not who, nor their stats).

## "I took this"

Every NEXUS idea (detail head, next to the watch star) has **I took this** for signed-in members.
It writes one journal row into the member's book — their desk book when they run a desk,
otherwise their own journal; the super-admin may name any book:

- `broker = 'quantedge'` → origin **quantedge_idea** on the wire (`origin` field), shown as
  "QuantEdge idea" in the journal. Everything else is **own_idea**. No migration: `broker` is
  free text.
- `broker_order_id = idea:<ideaId>` — one take per idea per book (409 on a second).
- `raw_csv_row` holds the attribution: `{ origin, ideaId, takenBy (user id), deskSlug, journal,
  entryBasis, takenAt }`.
- The entry is the fill the trader types; otherwise the **published** premium / entry, stamped in
  the notes as "the PUBLISHED premium, not your fill — edit it to your fill".
- Taken ideas never count as the trader's own calls (`server/trader-analysis.ts` skips
  `broker='quantedge'`), so the trader leaderboard measures only their own ideas.

## API

| Route | Who | |
|---|---|---|
| `GET /api/desk/me` | anyone | `{ enabled, role, isSuperAdmin, deskSlug, deskName?, desks? }` — the client's `useDeskRole()` (`client/src/lib/desk-role.ts`) |
| `GET /api/desk/:slug` | super / that desk | overview: trader, privacy, desk admin, bot status, book stats |
| `GET` / `PATCH /api/desk/:slug/bot` | super / that desk | config + caps / change config |
| `POST /api/desk/:slug/bot/enabled` | super / that desk | `{ enabled }` |
| `POST /api/desk/:slug/bot/run` | super | one cycle now |
| `PUT /api/desk/:slug/passcode` | super / that desk | `{ passcode }`, `''` clears |
| `PUT /api/desk/:slug/privacy` | super / that desk | `{ shareWithGroup }` |
| `POST /api/journal/took-idea` | member | `{ ideaId, journal?, entryPrice?, quantity?, note? }` |
| `GET /api/journal/took-ideas` | member | `{ journal, ideaIds }` |
| `GET /api/admin/ops/desks` | admin JWT | every book, its desk admin, its bot |
| `POST` / `DELETE /api/admin/ops/desks/:slug/assign` | admin JWT | `{ userId, replace? }` |
| `POST /api/admin/ops/desks/:slug/bot` | admin JWT | `{ enabled }` |

Every write is appended to the admin audit log (`server/admin-audit.ts`) with the actor
(`user:<id>` or `admin-hub`) and `detail.role` (`desk` / `super`): `desk.assign`, `desk.unassign`,
`desk.bot_config` (with the changed values), `desk.bot_enable`, `desk.bot_disable`,
`desk.bot_run`, `desk.passcode_set`, `desk.passcode_clear`, `desk.privacy`. Passcodes are never
logged.

UI: `/desk` (and `/desk/:slug` for Malik) — Overview, Bot, Journal book (passcode, import,
privacy), Watchlist & alerts, Account. `/admin/users` → Desk admins. Command palette: "Admin"
(super-admin) and "My desk" (desk admin). The side nav / phone sheet links are owned by the nav
redesign and read `useDeskRole()`.

## Trader accounts: Malik creates the logins (2026-10-07)

Instead of invite codes, Malik can create each trader's account himself from
`/admin/users` → **Trader accounts** → **Add trader account** (admin hub cookie required;
every action audited). Code: `server/trader-accounts.ts` (secrets, pure),
`server/trader-accounts-routes.ts` (routes), `shared/trader-accounts.ts` (username rules),
`client/src/components/admin/trader-accounts-panel.tsx`, `client/src/pages/setup-account.tsx`.

**Form:** trader book (select; prefills the display name), display name, email (optional),
username (only when there is no email; prefilled from the name, e.g. `femi`), tier (default
**Free + beta access** = everything open during the beta), credentials (setup link / temporary
password), **desk admin of this book** (ticked; disabled when the book already has one).

**On submit** the server creates the user (`has_beta_access = true`, the chosen tier), links it to
the book as desk admin (`traders.linked_user_id`, also audited as `desk.assign`) and issues ONE
credential, shown **once** in the panel with a Copy button:

- **Setup link (default)** `https://…/setup#token=…` — 32 random bytes (base64url), stored only
  as `setup:` + sha256 in `password_reset_tokens.token`; expires in **48 h**; **single use** (atomic
  `UPDATE … WHERE used = false AND expires_at > now() RETURNING`); per-IP limited (10 / 15 min,
  30 / day). The token sits in the URL **fragment**, so it never reaches server logs or a Referer;
  `/setup` strips it from the address bar on load. The trader sees their name and sign-in name,
  chooses a password (the normal policy, ≥ 8), is signed in on a fresh session (older sessions
  ended) and lands on `/desk`.
- **Temporary password** — ~115 random bits (`xxxxx-xxxxx-xxxxx-xxxxx`), stored only as
  `mustchange$` + bcrypt in `users.password_hash`. Signing in with it returns
  `403 { mustChangePassword: true }` and **no session**; the login page then asks for a new
  password (`POST /api/auth/first-login`), and only after that is a session created.

**No email → username login.** `users.email` is NOT NULL, so a username account is stored as
`<username>@login.quantedge.invalid` (the reserved `.invalid` TLD: undeliverable, unregistrable).
The login form takes "Email or username"; a username is mapped to that address and checked by
the same limiter, bcrypt and generic error. Public sign-up refuses the domain (no squatting);
forgot-password never emails it.

**Status column:** Setup pending (with link expiry) · Link expired · Temp password — change
pending · Revoked — no way in · Active · Disabled. **Regenerate link** / **Temp password** issue a
new credential and kill every earlier link (a temp password also replaces an existing password
and signs the account out; a new link kills an outstanding temp password). **Revoke** kills the
outstanding link / temp password. To cut an active trader off, use Users → **Disable**.

**Never stored or logged in plaintext:** link tokens, temp passwords, chosen passwords. The audit
log (`trader_account.create`, `.regenerate`, `.revoke`, `.setup_complete`, `.password_changed`) keeps
only `codeTail` (last 4). `/api/auth/reset-password` refuses `setup:` values, so a stored hash can
never be replayed as a reset token. An account awaiting setup holds `pending$<random>` (not a bcrypt
hash: nothing verifies, and the beta-onboarding "add a password to a password-less account" path
does not apply).

**How Malik uses it (per trader):** `/admin` → Users → Trader accounts → pick the book (e.g. Femi)
→ leave email blank (username `femi`) or type theirs → **Add trader account** → **Copy link** → DM
it to them. Watch the row turn **Active**. Lost or expired → **Regenerate link**. They then follow
step 6 of the onboarding list below (passcode, privacy, watchlist, bot).

Tests: `npm run test:trader-accounts` (no DB, 180 checks) — token randomness/hashing/shape, 48 h
expiry, single use (incl. a concurrent race), regenerate/revoke kill old credentials, admin-only
(no token 401, member/desk-admin session 401, forged 403, no writes), password policy on both
paths, forced change (no session before it, temp can't be kept or replayed), username login,
disabled accounts, real per-IP limiter trips, and every issued secret is absent from the fake DB,
the audit file and everything the process printed.

## Trader self-setup: from the sign-in page (2026-10-07)

For a trader whose book already has a **passcode** (the one Malik set and gave them out-of-band).
Sign-in page → **Trader? Set up your account** → `/trader-setup`:

1. **Pick your name** — only books with a passcode, **no linked account**, a slug that is a valid
   unreserved username nobody holds, not closed per book. Never offered: Malik's / operator books
   and system books (`mine`, `malik`, `leek`, `operator`, `bot`, `nexus`, `desk`, `quant…` as a
   word of the slug or name — `shared/trader-self-setup.ts`), plus env `TRADER_SELF_SETUP_EXCLUDE`.
2. **Enter the book passcode** — bcrypt-compared with `traders.passcode_hash`.
3. **Choose a password** (password policy) → `provisionTraderAccount` (the same path as the hub's
   "Add trader account"): username = the book's slug (`<slug>@login.quantedge.invalid`), the
   default trader tier + beta access, **desk admin of that book**; a fresh session; `/desk`.

One-time: once the book has a linked account it is closed for good — the trader signs in with their
name/username; a forgotten password is a **Regenerate** in Trader accounts.

Security: every refusal (wrong passcode, unknown name, set-up name, operator/bot book, closed book)
is the same 403 and costs one bcrypt; **5 failed attempts per name per 15 min** lock that name (even
the right passcode gets 429; non-existent names lock the same way); per-IP limits 10 / 15 min and
30 / day (`traderSelfSetupLimiters`); the POSTs check the CSRF double-submit themselves (`/api/auth/*`
is exempt from the global check); audit `trader_self_setup.fail|lockout|complete|config` +
`desk.assign` (`via: trader_self_setup`) — never the passcode or password.

Switches (no migration): env `TRADER_SELF_SETUP` (default on; `off` is a hard off), and in the hub
(Trader accounts → Self-setup) a global switch and a per-book switch, kept in the shared-state file
`trader-self-setup`. Routes: `server/trader-self-setup-routes.ts`. Tests: `npm run test:trader-self-setup`.

## Migrations to run before deploy

Trader accounts need **no migration** (they reuse `users.email`, `users.password_hash` and
`password_reset_tokens`). Desk bots need one table. The desk-admin **role** needs no migration (`traders.linked_user_id` exists), nor does
"I took this" (`journal_trades.broker` is text). Do not `drizzle-kit push` production.

```sh
pg_dump "$DATABASE_URL" -Fc -f pre-0005.dump
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/0005_desk_admins.sql
```

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS "desk_bots" (
  "trader_slug" varchar(32) PRIMARY KEY,
  "enabled" boolean NOT NULL DEFAULT false,
  "enabled_at" timestamp,
  "config" jsonb NOT NULL,
  "share_book" boolean NOT NULL DEFAULT false,
  "updated_by" varchar,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
ALTER TABLE "desk_bots" ADD COLUMN IF NOT EXISTS "share_book" boolean NOT NULL DEFAULT false;

COMMIT;
```

Without it, desk portals, assignment, passcodes and watchlists work; the portal and hub say "desk
bots are not set up", no desk bot runs, and **every trader book is private** (share_book cannot be
read) — so apply it before turning `DESK_ADMINS` on.

## Flags

| Env | Default | |
|---|---|---|
| `DESK_ADMINS` | off | `true` turns on desk portals, desk bots and book privacy |
| `DESK_BOTS_MAX` | `3` | desk bots enabled at once (0–6) |
| `TRADER_SELF_SETUP` | on | `off` closes trader self-setup from the sign-in page (the hub switch can't reopen it) |
| `TRADER_SELF_SETUP_EXCLUDE` | — | comma-separated book slugs never offered for self-setup |

The platform bot's own env (`BOT_0DTE_*`, `BOT_SWING_*`, `QUANT_BOT_DISCORD`, `ROLE`) also bounds
every desk bot.

## Onboarding a trader (what Malik does, per friend)

1. **Make sure the trader book exists.** `/admin/users` → Desk admins lists every book. If the
   friend has none, add it (journal → Traders, or `POST /api/traders` while signed in as the admin).
2. **Create the account** (simplest): `/admin/users` → **Trader accounts** → Add trader account
   (see §Trader accounts) — this does steps 2–5 in one go; skip to 6. Or, the invite route:
   **Generate an invite code.** `/admin/invites` → count 1, **email-lock it to the friend's
   address**, tier as you like, expiry e.g. 14 days → copy the invite link (`/signup?code=…`) and
   send it to them yourself (or "Email it" if `RESEND_API_KEY` is set).
3. **The friend signs up** at that link with their own email + password (or Google with the same
   email). New accounts start on Free.
4. **Give them beta access.** `/admin/users` → find them → tick **Beta**. The desk portal, journal
   and watchlist are member pages and need it.
5. **Link them to their book.** `/admin/users` → **Desk admins** → on their book's row choose their
   email → **Make desk admin**. (Replacing an existing desk admin asks to confirm.) This is logged
   as `desk.assign`.
6. **The friend opens `/desk`** (⌘K → "My desk") and:
   - sets their book **passcode** (Journal book → Passcode, 6+ characters);
   - decides **privacy** (private by default; tick "Share my book with the group" to show it);
   - adds their **watchlist**;
   - reviews **Bot** settings (defaults = Malik's current rules) and presses **Turn bot on**
     (refused if `DESK_BOTS_MAX` desks are already on — turn one off in Desk admins, or raise the cap).
7. **Check** in `/admin/audit`: `desk.assign`, then the friend's `desk.passcode_set`,
   `desk.bot_config`, `desk.bot_enable`.

To remove someone: Desk admins → **Remove** (their book, bot and history stay; only the link goes).
To stop a bot: Desk admins → bot **ON — turn off**.

## Tests

`npm run test:desk-admins` (no DB, 278 checks): access resolution; caps (every bound refused just
outside it; no cap looser than the platform; platform-set fields refused); desk entry rules;
sleeve/engine clamping; engine wiring (side effects platform-only, desk rules in both sleeves before
the loss-rule gates, owner-scoped books and settlement, worker-only); **role isolation through the
real routes and the real `requireAdminJWT`** — a desk admin is refused on all 15 `/api/admin/ops/*`
routes (no token 401, forged 403) with no write, every `/api/admin` route in `routes.ts` needs the
JWT, Malik's bot routes are JWT-only, operator guards apply; every desk route × {signed out → 401,
other trader / Malik's book / unknown / unlinked / disabled → 403, own desk → 200, super-admin →
200 everywhere}; bot run is super-only; flag off → 404; assign/unassign/replace rules; audit
entries; privacy (visibility rule, every read path filtered, fails closed); "I took this" (row shape,
attribution, published-entry stamp, one per idea, no write into another trader's or Malik's book).
