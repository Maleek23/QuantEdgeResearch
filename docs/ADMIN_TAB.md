# Admin tab: running the platform (2026-10-01)

`/admin` is the operator's back office. It sits behind the existing admin gate:
4-digit access code, then the admin password, then an HTTP-only `admin_token` JWT cookie.
Both secrets are compared in constant time (`safeSecretEqual`), with `adminLimiter`
and the per-IP lockout in front. Every `/api/admin/*` route, old and new, requires
`requireAdminJWT`. The hub link appears only when `isAdmin` is true (the ADMIN_EMAIL
account or the `admin` tier), in the account menu and on Settings.

Policy (2026-09-30):

- Every new account starts on Free: email sign-up, Google sign-in and invite redemption alike.
- An invite may carry an explicit `tierOverride` of free, advanced or pro. **No path grants `admin`.**
- Paid checkout is off (`CHECKOUT_LIVE=false`), so tiers are set here.

## Sections

| Page | URL | What it does | Endpoints |
|---|---|---|---|
| Overview | `/admin` | Users by tier, beta-access count, disabled count, sign-ups in the last 7 and 30 days, users seen in the last 24h and 7d, live sessions, waitlist by status, invites issued / unused / used / expired / revoked. Platform health (link to `/api/health`), web and worker memory, last run of each job (sector board, sector ignition, 0DTE sniper, wall touch, index 0DTE scan + SPX fast moves, worker heartbeat, Quantinum Bot cycle), the newest admin actions, and the raw idea record. | `GET /api/admin/ops/overview`, `/api/health`, `/api/quant-bot/status`, `/api/admin/ops/audit`, `/api/admin/stats` |
| Users | `/admin/users` | Search and filter by tier, beta access or disabled. Change tier (free, advanced, pro). Toggle beta access. Disable or enable an account; disabling signs it out everywhere. Email a password-reset link (password accounts, needs `RESEND_API_KEY`). Delete an account: you retype the email, and everything the account owns goes with it. Export CSV. **Trader accounts** panel (top): add a trader's login linked to their book as desk admin, with a one-time setup link (48 h) or a temporary password shown once; status, regenerate, revoke — docs/DESK_ADMINS.md §Trader accounts. | `GET /api/admin/ops/users`, `PATCH /api/admin/ops/users/:id`, `POST /api/admin/ops/users/:id/password-reset`, `DELETE /api/admin/ops/users/:id` |
| Invite codes | `/admin/invites` | Generate codes with: a count (1–100), an optional email lock (one code), a tier override (none, free, advanced or pro), expiry in days (1–365) and a note. The list shows each code's status (unused / used / expired / revoked) and who redeemed it, and when. Revoke a code, copy the code, copy the invite link (`/signup?code=…`), and, for locked codes when email is configured, "Email it". Export CSV. | `GET /api/admin/ops/invites`, `POST /api/admin/ops/invites/generate`, `POST /api/admin/ops/invites/:id/revoke`, `POST /api/admin/invites/:id/resend` |
| Waitlist | `/admin/waitlist` | Search and filter. Approve makes one code locked to that entry's email and marks the entry approved; if the entry already has an unused code, that code is returned instead. Bulk-approve the N oldest pending entries, or the ones you selected. Reject. Export CSV. Approving sends no email: copy the codes or links shown. | `GET /api/admin/waitlist`, `POST /api/admin/ops/waitlist/approve`, `POST /api/admin/waitlist/reject` |
| Trader books | `/admin/traders` | Each trader book, with its passcode shown as set or unset. Set, change or clear the passcode. | `GET /api/admin/ops/traders`; set/clear goes through the existing `PUT /api/journal/traders/:slug/passcode`, which needs you **signed in to the app as the admin account** as well |
| Audit log | `/admin/audit` | Every admin action, newest first, with search, filter and CSV export. | `GET /api/admin/ops/audit` |
| System health / Content | unchanged | | |

## How codes work

- Codes come from `crypto.randomBytes` with rejection sampling: `qe-xxxxx-xxxxx-xxxxx-xxxxx`, about 99 bits. They pass the sign-up normaliser unchanged.
- They are stored in `beta_invites.token` in plaintext, as the existing schema expects. Every redemption path looks a code up by equality, so a code can be copied again later from the list.
- **Email lock.** A locked code stores the address in `beta_invites.email`. An unlocked code stores `''`, because the column is NOT NULL and `''` never equals a real address.
  - `/api/auth/signup` and `/api/beta/redeem` refuse a locked code used with a different email. Signup gives the same generic error as every other bad code.
  - `/api/beta/verify-code` → `/api/beta/onboard` can attach to an existing account, so that flow accepts **locked codes only**.
  - Onboarding no longer overwrites an existing password. Before this change, anyone holding a code could take over that account; now the request gets a 409 that says "sign in, then redeem".
- Redemption is now a conditional update (`WHERE status IN ('pending','sent')`), so two concurrent uses of one code cannot both win.
- `tierOverride` passes through `safeInviteTier` everywhere it is applied: signup, redeem, onboard and Google. A legacy `admin` override grants nothing. `/api/beta/redeem` used to reset an existing Advanced member to Free when the invite had no override; it no longer does.

## Disabled accounts

A disabled account is `users.subscription_status = 'disabled'`. That column already exists, so this needs **no migration**. When an account is disabled:

- its sessions are deleted (`sessions.sess->>'userId'` and the passport user id);
- `/api/auth/login` returns 403;
- Google sign-in redirects to `/login?error=account_disabled`;
- `/api/auth/me` and `/api/auth/user` read it as signed out;
- `requireBetaAccess` and `requireTier` return 403 `ACCOUNT_DISABLED`.

Stripe webhooks still write `subscription_status`. That does not matter while checkout is off. Revisit it before turning checkout on.

## Delete user

`storage.deleteUser` now runs the full plan in `server/user-cascade-plan.ts` in one transaction:

- **Deleted:** preferences, watchlist, symbol notes, research history, layouts, daily usage, active trades, paper portfolios with their positions and equity snapshots, tracked wallets with their holdings, transactions and alerts, auto-lotto prefs, login history, page views, activity events (including privacy requests), analytics summary, AI credits and ledger, credit transactions, reset tokens, personal journal trades and notes, broker connections.
- **Sessions:** removed.
- **Detached, not deleted:** `trade_ideas.user_id` is set to NULL, because ideas are the model record (SR 11-7). `traders.linked_user_id` is also set to NULL; the trader book survives.

Each step runs in a savepoint, so a table missing on this database is skipped instead of aborting the delete. `scripts/test-admin-ops.ts` fails if a table with a `user_id`, `owner_id` or `linked_user_id` column is added to `shared/schema.ts` without being added to the plan.

The admin account (ADMIN_EMAIL or the admin tier) cannot be changed, disabled or deleted from the hub. This also applies to the legacy `PATCH` and `DELETE /api/admin/users/:userId`, which now refuse the `admin` tier and require `confirmEmail`. `GET /api/admin/users` and `GET /api/admin/users/:id` no longer return password hashes.

## Audit log

The log is append-only JSONL at `.cache/admin-audit/actions.jsonl`; set `ADMIN_AUDIT_FILE` to put it elsewhere. This follows the existing `.cache` JSONL pattern. It needs no table, and both pm2 apps share the cwd.

These actions are logged:

- invite codes: generate, create, send, revoke;
- waitlist: approve, reject;
- users: tier change, beta change, disable, enable, delete, password-reset link;
- trader books: passcode set or clear. These are written by the journal endpoint itself.
- trader accounts: create, regenerate, revoke, setup complete, temp password replaced (only the last 4 of a link token / temp password).

Secrets are scrubbed: a code is logged only as `…last4`, and passcodes and reset tokens are never logged. The in-memory request log since boot is separate and stays on System health.

## Migrations to run before deploy

**None.** Nothing in this change adds a column or table:

| Need | How it is met without a migration |
|---|---|
| Disabled flag | existing `users.subscription_status` = `'disabled'` |
| Unlocked invite codes | existing NOT NULL `beta_invites.email` = `''` |
| Who redeemed a code | existing `users.beta_invite_id` |
| Last sign-in | existing `user_login_history` (Google sign-ins now write a row too) |
| Audit log | JSONL file, not a table |

## Operator checklist after deploy

1. Make sure `.cache/` is writable by the app user. The audit log, like the shared state, lives there.
2. To email invites or reset links, set `RESEND_API_KEY`. Without it, copy codes and links from the hub; reset links are unavailable.
3. To set trader-book passcodes from the hub, sign in to the app as the ADMIN_EMAIL account in the same browser.
4. Check: `GET /api/admin/ops/overview` without the admin cookie returns 401.

Tests: `npm run test:admin-ops` (no DB). It covers code generation and validation, email lock, tiers (admin is never assignable), the Free-tier gates for every `requireTier` route, disabled accounts, sign-up / redeem / Google wiring, 401/403 on every ops route through a real Express app with real JWTs, the audit file, and delete-cascade coverage against the schema.
