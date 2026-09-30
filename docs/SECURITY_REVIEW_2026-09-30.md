# Security review — 2026-09-30

Scope: Express + Postgres + React. Production runs `dist/web.js` (from `server/web.ts` and `server/routes.ts`) behind Caddy at quantedgelabs.net.
Branch `feat/security`. Prod checks were unauthenticated GETs that read only the status code and size. Nothing was written, and no auth bypass was attempted.

## Headline

On production, a visitor with no session could read or change the operator's trading system:

- Start or stop the Alpaca trade executor, rewrite its rules, and send a signal as an order. These routes were also CSRF-exempt.
- Read the Alpaca account and positions, and the operator's personal portfolio.
- Point the operator's SMS alerts at another phone number.
- Delete any trade idea, rewrite its recorded outcome, or add ideas to the official book.
- Post to Discord.
- Dump every trade idea, including live ones that only members should see: `/api/trade-ideas/debug/raw` and `/api/audit/trade-ideas` (about 850 KB).
- Read and overwrite a member's preferences row, which has a `discordWebhookUrl` column.

Before the fix, all of these returned 200 on prod without a session. They are now gated by one table in `server/route-guards.ts`, which runs before every route.

## Findings

| # | Sev | Area | Finding | Location | Status |
|---|-----|------|---------|----------|--------|
| 1 | **Critical** | S1 | Alpaca trade executor had no auth and was CSRF-exempt: `POST /api/executor/{start,stop,rules,execute/:signalId}`. Real orders are placed if `ALPACA_PAPER=false`. `GET /api/alpaca/{account,positions}`, `/api/executor/{status,trades}` and `/api/portfolio/*` exposed the operator's broker and portfolio data. | routes.ts `/api/executor/*`, `/api/alpaca/*`, `/api/portfolio/*`; csrf.ts | **Fixed**: operator-only (admin JWT or admin user); CSRF exemption removed |
| 2 | **High** | S1 | Official idea book could be changed with no auth: `DELETE /api/trade-ideas/:id`, `PATCH /:id/performance` (falsifies the model record), `PATCH /:id/promote`, `POST /api/trade-ideas`, `/add`, `/from-chart`, `/api/trade-desk/ideas/from-{earnings,gex}`, `/api/*/generate-ideas`, `/api/market-data`, `/api/catalysts`, `/api/ml/retraining/*`, `/api/learning/analyze`, plus scanner/ingest triggers | routes.ts (see `ROUTE_GUARDS`) | **Fixed**: operator-only |
| 3 | **High** | S1 | Anyone could post to Discord and change shared lists: `/api/annual-watchlist/*` writes, `/api/chart-analysis/{send-to-discord,discord,send-to-trade-desk}`, `/api/btc/push-all`, `/api/alerts/relay` | routes.ts | **Fixed**: operator-only; relay requires sign-in |
| 4 | **High** | S1 | `POST /api/notifications/sms/phone` had no auth, so anyone could send the operator's SMS alerts to their own number. `GET .../sms/{config,stats}` was also public. | routes.ts ~22900 | **Fixed**: operator-only |
| 5 | **High** | S1/S6 | `GET/PATCH/PUT /api/preferences` read and wrote the **first row** of `user_preferences` with no session. Anyone could read another member's sizing and `discordWebhookUrl`, overwrite them, or move the row to a different `userId`. | routes.ts `/api/preferences` | **Fixed**: scoped to the session user; signed-out GET returns defaults; `userId` removed from the body (also on `/api/user/:userId/preferences`). Admin user detail now reads that user's row. |
| 6 | **High** | S6 | Live member-only ideas were public: `GET /api/trade-ideas/debug/raw` (last 24h with entry/target/stop) and `GET /api/audit/trade-ideas` (all ideas). `GET /api/trade-ideas/:id` and `/:id/audit` were public, although the list endpoint needs beta access. | routes.ts ~8569, ~14354, ~8640 | **Fixed**: dumps are operator-only; by-id reads are member-only |
| 7 | **High** | S2 | A real Gemini API key was committed in `FREE_LLM_SETUP.md` and is in git history since 12d6427b | FREE_LLM_SETUP.md:67 | **Redacted in file. Operator: rotate the key** (history still has it) |
| 8 | Medium | S1/S6 | `GET /api/performance/export` needed no auth (known open) | routes.ts ~11322 | **Fixed**: member-only (the Performance page's Export link still works for members) |
| 9 | Medium | S1 | Global in-memory AI chat `/api/ai/chat{,/history}`: every caller shared one history, anyone could clear it, and each call cost LLM money | routes.ts ~21131 | **Fixed**: operator-only (not used by the client) |
| 10 | Medium | S4 | `POST /api/auth/dev-login` gives an admin session for `ADMIN_ACCESS_CODE` with no rate limit and no CSRF check | routes.ts ~1465 | **Fixed**: `authLimiter` (5 failures / 15 min) |
| 11 | Medium | S3 | Discord import preview: a linked trader who is not an admin could point the bot token at **any** channel the bot can read, and the preview returned its content | journals-routes.ts ~400 | **Fixed**: only admins may pass a channel other than the trader's configured one |
| 12 | Medium | S4 | Admin-login lockout was keyed on the **leftmost** `X-Forwarded-For` value, which the client controls, so rotating it bypassed the lockout | routes.ts `/api/admin/login` | **Fixed**: uses `req.ip` (trust proxy = 1 hop) |
| 13 | Medium | S1 | `/api/alerts/level` is one global store: any signed-in user can list or delete everyone's level alerts. `GET` is public. | routes.ts ~5341, price-alerts.ts | **Partly fixed** (writes need sign-in). Recommend a per-user store. |
| 14 | Medium | S1 | Compute/LLM endpoints with no auth, a DoS and cost risk: `/api/ai/research-assistant` (LLM, 20 per 15 min per IP), `/api/engine/analyze/:sym`, `/api/contract/analyze`, `/api/options/analyze`, `/api/options-analyzer/deep-analysis`, `/api/gamma-exposure/batch`, `/api/convergence/*`, `/api/search/ai`, `/api/research/analyze`, `/api/analyze/batch`, `/api/smart-advisor/analyze`, `/api/watchlist/scan-flows`, `/api/volatility-analysis/batch`, `/api/realtime-quotes/batch` | routes.ts | Recommend: add them to `ROUTE_GUARDS` as `signed-in`, or as `operator` for those the client does not use |
| 15 | Medium | S5 | CSP `script-src 'unsafe-inline' 'unsafe-eval'` removes most of CSP's XSS protection | security.ts | Recommend: build without eval, use nonces or hashes for inline scripts |
| 16 | Medium | S7 | `npm audit --omit=dev`: 2 critical (jspdf ≤4.2.0 and jspdf-autotable, client-side PDF), 19 high (express/body-parser/path-to-regexp, axios SSRF, ws, multer DoS, jws HMAC, express-rate-limit IPv6 bypass, drizzle-orm identifier escaping, lodash, ...), 11 moderate, 3 low | package-lock | Recommend: `npm audit fix` (non-breaking), then the major bumps `jspdf@4.2.1` and `drizzle-orm@0.45.3`. Not run here: node_modules is a shared symlink. |
| 17 | Low | S5 | Framing: `frame-ancestors` allowed replit.com in prod, there was no `X-Frame-Options`, and the response advertised `X-Powered-By: Express` | security.ts | **Fixed**: `'self'` only unless `REPL_ID` is set; `X-Frame-Options: SAMEORIGIN`; X-Powered-By removed |
| 18 | Low | S2 | The startup check logged the first 4 and last 4 characters of every secret. A pasted copy (SESSION_SECRET prefix and suffix) is committed in `attached_assets/Pasted--DATABASE-…txt` | startup-check.ts | **Fixed**: logs the length only. Recommend deleting the pasted log and rotating `SESSION_SECRET` when convenient. |
| 19 | Low | S6 | `GET /api/public/watchlist` merged every member's watchlist and published their `notes` and `addedReason` as "thesis" | routes.ts ~17313 | **Fixed**: notes and addedReason dropped. The aggregate symbol list is still public. |
| 20 | Low | S4 | Google OAuth has no `state` parameter (login CSRF). Email login does not regenerate the session (fixation; limited by `saveUninitialized:false`). | googleAuth.ts, routes.ts `/api/auth/login` | Recommend `state: true` and `req.session.regenerate` |
| 21 | Low | S4 | `requireAdmin` (legacy) still accepts `x-admin-password` / `body.password` with a comparison that is not constant-time. `JWT_SECRET` falls back to `SESSION_SECRET`. | auth.ts | Recommend dropping the legacy path (it is only used by `/api/admin/hub/status`) and setting a separate `JWT_SECRET` |
| 22 | Low | S4 | These CSRF exemptions remain: `/api/auth/*`, `/api/backtest*`, `/api/breakout*`, `/api/gex-scanner/*`, `/api/gex-history/*`. SameSite=Lax cookies make them low risk. | csrf.ts | Recommend sending the token from the client and removing the exemptions |

### Checked and found sound

- **SQL**: Drizzle, parameterised; no `sql.raw`; `pool.query` only runs constant queries.
- **Command execution**: no `child_process` in the server.
- **Path traversal**: cache file names are sanitised (`safeSym`, the last-good regex); dates are internal.
- **SSRF**: server-side fetches go to fixed provider hosts. Discord channel ids must be numeric. `discordWebhookUrl` is stored but never fetched.
- **Broker keys**: `server/secret-box.ts` uses AES-256-GCM with a random IV and a dedicated `BROKER_CREDENTIALS_KEY`, and keys are never returned.
- **Client bundle**: no `import.meta.env` secrets; `.env*` is gitignored.
- **Discord bot token**: server-side only and never logged.
- **XSS**: the only `dangerouslySetInnerHTML` is shadcn's chart `<style>`, built from static config. Journal notes use a renderer that builds React elements. The chatbot uses react-markdown without raw HTML. Server SEO injection is escaped. `PhoneAutoClamp` uses `textContent`.
- **returnTo**: `client/src/lib/return-to.ts` rejects scheme-relative, backslash, encoded-slash, control-character and auth-loop targets, and is covered by tests.
- **Session cookie**: `httpOnly`, `secure` in prod, `SameSite=Lax`, Postgres store, trust proxy set to 1 by `setupAuth`.
- **Admin JWT**: httpOnly cookie, `jwt.verify` with a secret.

## What changed

- `server/route-guards.ts` (new): the `ROUTE_GUARDS` table and `guardFor(method, path)`. Matching is case-insensitive and ignores a trailing slash, like Express routing.
- `server/routes.ts`:
  - applies the guard right after `generalApiLimiter`, before any route is registered;
  - scopes `/api/preferences` to the session user;
  - strips `userId` from preference bodies;
  - admin user detail reads that user's preferences;
  - adds `authLimiter` on `dev-login`;
  - keys the admin-login lockout on `req.ip`;
  - public watchlist no longer includes notes.
- `server/csrf.ts`: removed the `/api/executor/`, `/api/alpaca/` and `/api/portfolio/` exemptions.
- `server/security.ts`: frame-ancestors, `X-Frame-Options`, removes `X-Powered-By`.
- `server/journals-routes.ts`: non-admins can only read their configured Discord channel.
- `server/startup-check.ts`: no secret characters in logs.
- `FREE_LLM_SETUP.md`: key redacted.
- `scripts/test-route-guards.ts` (new, 63 checks).

Operator notes:

- The old global preferences row (`userId = default_user`) is no longer read by `/api/preferences`. Re-enter your sizing on Settings once after deploy.
- In local dev (`NODE_ENV !== production` and no `REPL_ID`), the guard follows the same bypass as `requireBetaAccess`.

## Verification

- `npx tsc --noEmit -p .`: 451 errors (unchanged baseline, none in changed code)
- `npm run build`: ok
- `npx tsx scripts/test-journal.ts`: pass
- `npx tsx scripts/test-return-to.ts`: pass
- `npx tsx scripts/test-route-guards.ts`: 63 checks pass
- After deploy, re-check that these return 401 without a session: `/api/executor/status`, `/api/alpaca/account`, `/api/portfolio/positions`, `/api/trade-ideas/debug/raw`, `/api/audit/trade-ideas`, `/api/performance/export`, `/api/notifications/sms/config`, `/api/picks/config`. Also check that `/api/preferences` returns defaults with `userId: null`.
