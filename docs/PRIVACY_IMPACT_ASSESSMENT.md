# Privacy Impact Assessment — QuantEdge platform (whole product)

> **DRAFT — engineering privacy review, not legal advice.** Prepared from a code
> reading of branch `feat/privacy` on 2026-09-30. The author is not a lawyer.
> Every item tagged **[counsel]** needs review by a qualified privacy lawyer in the
> jurisdictions where QuantEdge has users before anyone relies on it. Legal
> citations below are tagged `[model knowledge — verify]`: they were recalled, not
> retrieved from a legal research tool, and must be checked against primary
> sources before use.

| | |
|---|---|
| **Prepared** | 2026-09-30, engineering (Claude, for the operator) |
| **Status** | DRAFT — awaiting counsel review and operator sign-off |
| **Product owner / operator** | Malik (operator, sole admin) |
| **Privacy reviewer** | _unassigned — [counsel]_ |
| **Prior work** | No prior PIA or triage exists; this is a cold start. Related: `docs/SECURITY_REVIEW_2026-09-30.md` (route guards), `docs/COMPLIANCE_REVIEW_2026-09-30.md`, `docs/DISCORD_IMPORT.md`. |
| **Code shipped with this PIA** | privacy policy rewrite, waitlist→Discord redaction, account-deletion request path, log-retention runbook (§10) |

---

## Executive summary

QuantEdge is a small, US-hosted trading-research and journal platform in closed
beta. It collects ordinary account data plus some **financially sensitive** user
data (trade journals, P&L, account size, risk tolerance, encrypted broker API
keys), first-party usage analytics, and — the unusual part — **personal data of
people who are not users**: Discord trading-journal posts of named traders (and of
anyone who replied in their threads), imported by the operator and shown to every
signed-in member with a ranked leaderboard.

The biggest gaps before this change were: a privacy policy that described a
different product (Tradier/Neon, "Discord OAuth future feature", no journals, no
broker keys, no Discord import); signup emails posted to a general-purpose Discord
webhook; no way for a user to ask for account deletion, and an admin delete that
leaves ~20 tables of the user's data behind; unbounded log/analytics retention.
Four low-risk fixes are in this commit (§10). The Discord-import consent question
and the delete cascade are the two items that need an operator decision and
counsel.

**Overall risk (reviewer to set):** proposed 🟠 **High** before this change → 🟡 **Medium**
after it, conditional on C1–C4 in §9.

---

## 0. Is a PIA needed?

No house trigger is configured (no privacy-legal practice profile exists), so this
uses the default indicators. **Yes, worth doing**, because at least three strong
indicators apply:

- **Data not obtained from the data subject** — Discord posts of traders and
  thread commenters, copied in bulk. GDPR Art. 14 notice duty applies if GDPR
  applies `[model knowledge — verify]`.
- **Evaluation / ranking of individuals** — `/api/traders/leaderboard` scores and
  ranks named traders on measured performance. Could be "profiling" (GDPR Art. 4(4))
  and, combined with the above, a DPIA-list criterion under EDPB WP248 rev.01
  ("evaluation or scoring" + "data processed on a large scale"/"not expected")
  `[model knowledge — verify]`. Scale is small; **[counsel]** whether Art. 35 is
  actually triggered.
- **New technology** — AI vision models reading screenshots of third parties' posts.
- **Financial data** — journals, P&L, broker credentials.

Applicability of each regime is itself an open question **[counsel]**:

| Regime | Likely applies? | Why / what to check |
|---|---|---|
| GDPR / UK GDPR | Unknown | Art. 3(2) — only if QuantEdge offers services to, or monitors, people in the EU/UK `[model knowledge — verify]`. The site is English, USD-priced, no geo-block. |
| Nigeria Data Protection Act 2023 | **Check** | Several imported traders appear to be in Nigeria (names in the Discord forum). NDPA applies to processing of data subjects in Nigeria `[model knowledge — verify]`. **[counsel]** |
| CCPA/CPRA | Probably not yet | Business thresholds (Cal. Civ. Code §1798.140(d): >$25M revenue, 100k+ consumers, or ≥50% revenue from selling/sharing) `[model knowledge — verify]`; a beta at ~$5/mo hosting is far below. Written as if it will apply later. |
| Other US state laws (VA, CO, CT, TX…) | Probably not yet | Volume thresholds similar `[model knowledge — verify]`. |
| COPPA | Only if under-13 users | Not directed to children; policy now says 18+. No age gate exists — see R7. |
| GLBA | Unlikely | QuantEdge does not provide financial products or hold funds; **[counsel]** confirm, given broker-key storage. |
| Securities rules (investment-adviser status of "ideas") | Out of scope | Not a privacy question; see `COMPLIANCE_REVIEW_2026-09-30.md`. |

---

## 1. Data inventory (V1)

Source of truth: `shared/schema.ts` + route handlers. "Sensitive" = financially
sensitive or credential, not a GDPR Art. 9 special category (none found).

### 1a. Users (account holders)

| Data | Where stored | Fields | Notes |
|---|---|---|---|
| Account | `users` | email (unique), password_hash (bcrypt), first/last name, profile_image_url, discord_user_id/username, tier, Stripe customer/subscription/price ids + period end, beta flags, credits, login_streak, last_login_date, referral_code / referred_by | Google OAuth scopes `profile email` (`server/googleAuth.ts`) → name, email, avatar URL. |
| Onboarding | `users` | occupation, trading_experience_level, knowledge_focus[], investment_goals, **risk_tolerance**, referral_source | Suitability-style profile. |
| Sessions | `sessions` (connect-pg-simple) | sid, sess JSON (userId), expire | TTL 7 days; httpOnly, secure in prod, SameSite=lax (`server/replitAuth.ts`). |
| Password reset | `password_reset_tokens` | user_id, email, token, expires | Rows are not purged after expiry. |
| Preferences | `user_preferences` | **account_size**, max_risk_per_trade, budgets, preferred assets, timezone, UI prefs, **discord_webhook_url** (user-supplied secret URL), alert toggles | Webhook URL is a bearer secret for the user's Discord channel. |
| Watchlist | `watchlist`, `symbol_notes` | symbols, notes | |
| Journal — trades | `journal_trades` | symbol, side, size, prices, times, P&L, **notes, emotion, mistake_tag, rating**, screenshot URL, broker, broker_order_id, **raw_csv_row (jsonb)** | Raw broker CSV rows may carry account numbers or other broker columns → stored verbatim. |
| Journal — notes | `journal_notes` | body (≤60k chars), symbols, **attachments (inline base64 images/PDFs up to ~1.8 MB each)** | User uploads live in the DB. |
| Broker keys | `broker_connections` | key_id_enc, secret_enc (AES-256-GCM, key `BROKER_CREDENTIALS_KEY`, `server/secret-box.ts`), key_hint (last 4), last_sync_result | Never returned by any API. Deleted on disconnect. |
| Paper trading / bot | `paper_portfolios`, `active_trades`, `auto_lotto_preferences` | positions, P&L | |
| Crypto wallets | `tracked_wallets`, `wallet_*` | address, label ("Vitalik", "personal"), holdings | A "personal" wallet address is pseudonymous personal data. |
| AI usage | `ai_usage_ledger`, `ai_credit_balances`, `credit_transactions`, `daily_usage` | provider, model, tokens, **question_preview (first 100 chars)** | |
| Layouts | `user_page_layouts`, `user_navigation_layouts` | UI state | |
| Research history | `research_history` | queries, results | |
| Waitlist / invites | `beta_waitlist`, `beta_invites` | email, source, referral code, status, admin notes | Non-users until converted. |
| Testimonials | `testimonials` | name, title, company, avatar, quote | Consent/provenance unknown **[operator]**. |

### 1b. Analytics and logs

| Data | Where | Notes |
|---|---|---|
| Page views | `page_views` | user_id or per-tab random id (sessionStorage `qel_session_id`), path, referrer, UTM, user agent, device, browser, time on page. **No IP stored here.** Anonymous visitors tracked too. First-party only — no GA/Plausible/third-party scripts in `client/index.html`. |
| Activity events | `user_activity_events` | typed events + free metadata. Now also holds privacy requests (§10). |
| Daily summary | `user_analytics_summary` | per-user counters. |
| Login history | `user_login_history` | schema has ip, user_agent, country, city — **no writer found in code** (read by admin routes only). Dead table or removed writer; confirm on prod DB. |
| Rate limiting | `express-rate-limit`, in memory | IPs held transiently; not persisted. |
| App logs | winston → console (→ PM2 `~/.pm2/logs`, ~370 MB, unrotated) + prod files `logs/*.log` (5×5 MB cap) | **Emails logged in ~25 places** (login, signup, invites, reset, OAuth), IPs on admin actions. |
| Reverse proxy | Caddy on droplet | Access-log config not in repo — check **[operator]**. |
| Backups | `/root/db-backups` on droplet; historical copies in paused **Supabase** org and **Neon** | No documented rotation. |

### 1c. Non-users (third parties) — the Discord import

`server/discord-journal-import.ts`, `server/discord-forum-import.ts`, `docs/DISCORD_IMPORT.md`.

| Data | Where | Notes |
|---|---|---|
| Traders | `traders` | name, slug, **handle (Discord username)**, discord_channel_id, **discord_author_id**, linked_user_id |
| Their posts | `journal_notes` (`source='discord'`) | **every message in the thread — including replies by other people** — text, author, time, message link, attachment links; `meta.vision` = AI-extracted fields |
| Their trades | `journal_trades` (`broker='discord'`) | parsed calls/fills + parse confidence |
| Their watchlist | `trader_watchlist_items` | tickers called |
| Ranking | computed (`server/trader-analysis.ts`) | leaderboard, stats, "calls" feed on NEXUS |

**Access:** every beta/pro member can read every trader's notebook, trades and
rank (`resolveJournal` returns trader books read-only to any actor;
`/api/traders/leaderboard` is `requireBetaAccess`). Channel/author ids are admin-only.

### 1d. Operator-only data
SMS alerts (`server/sms-notification-service.ts`) go to the operator's own number
from env (`USER_PHONE_NUMBER`) — no user phone numbers are collected. The
operator's Alpaca account is server-env credentials.

---

## 2. Data flows and processors (V2)

| Recipient | What they receive | Trigger | Role / contract |
|---|---|---|---|
| **DigitalOcean** (NYC1) | everything (app + Postgres) | hosting | processor; DPA via DO ToS **[operator: accept DO DPA]** |
| **Render** (free tier) | full DB access (points at droplet DB) + app | standby copy | processor; region per Render service settings **[operator: confirm]** |
| **Supabase / Neon** (paused/over quota) | historical DB copies (Sep 17 backup etc.) | legacy | still hold personal data — **delete** (C4) |
| **Stripe** | email, customer, subscription; card data entered on Stripe Checkout | billing | processor (for payments) / independent controller for some purposes **[counsel]** |
| **Resend** | recipient email, invite/reset/welcome content; now privacy-request notices (ids only) | email | processor |
| **Google** | OAuth sign-in | user choice | independent controller for the Google account |
| **Discord — waitlist webhook** | **before:** full signup email + source + referral code posted to `DISCORD_WEBHOOK_URL`, the *general fallback* webhook shared with scanners and the weekly report → could land in a community channel. **now:** only to `DISCORD_WAITLIST_WEBHOOK_URL` (no fallback), domain-only by default (§10). | signup | Discord = independent controller of what lands in a server |
| **Discord — user alert webhook** | trade alerts to the URL the user saved | user choice | user-directed |
| **Discord — import bot** | reads channel/forum history (View Channels + Read Message History; Message Content intent) | admin action | inbound; see §3 lawful-basis gap |
| **Alpaca** | user's own API keys → read fills/balance | user connects | user-directed |
| **Anthropic / Google Gemini** | **Discord forum screenshots** (base64, fetched from Discord CDN at import time) — images of third parties' posts/charts; not stored after extraction | admin import | processor; check API data-retention/training terms **[counsel]** |
| **Google Gemini** | brokerage screenshots the user uploads (`/api/broker/import-screenshot`, portfolio import) — memory only | user upload | processor |
| **Anthropic, Gemini, OpenAI, xAI (Grok), Groq, Together, Mistral** (whichever keys are set; `server/multi-llm-service.ts`, `server/ai-service.ts`) | user-typed research/chat questions, market context, portfolio facts for AI insights | user action / crons | processors. **Journal notes and trader posts' *text* are not sent to LLMs** (grep: no LLM call in journals/trader-analysis/discord-import except the vision runner). |
| **Market-data vendors** (Tradier, Yahoo, Alpha Vantage, CoinGecko, Bullflow, …) | ticker symbols only | scanners | not personal data |

**Access controls.** Session auth for users; admin via JWT cookie or admin-email
session; route-guard table (`server/route-guards.ts`) closed the previously public
operator routes. The global `/api/ai/chat` history (one shared in-memory history
across callers) is operator-only since the security review — noted because it
would otherwise mix users' questions. No audit log of admin reads of user data.

---

## 3. Lawful basis (only if GDPR/UK GDPR/NDPA apply — [counsel])

| Purpose | Proposed basis | Notes |
|---|---|---|
| Account, journal, broker sync, billing | Contract (Art. 6(1)(b)) | |
| Security logs, rate limiting, fraud | Legitimate interests (6(1)(f)) | Needs a documented balancing test and a retention limit. |
| First-party analytics | Legitimate interests | ePrivacy Art. 5(3): sessionStorage id for analytics is arguably not "strictly necessary" → may need consent for EU/UK visitors `[model knowledge — verify]` **[counsel]**. No banner exists. |
| Waitlist email → operator notification | Legitimate interests | Now minimised to domain. |
| **Discord import of traders' posts** | Legitimate interests *or* consent | **Gap.** Named traders (Femi, Uzo, Ayo, Tommi…) may know and agree — no record of that consent exists in the system. **Thread commenters** have not agreed to anything and their posts are imported too. Art. 14 notice not given. Republishing to all members + ranking goes beyond the Discord server's own audience. |
| AI vision on third-party screenshots | same as above | Transfers to AI vendors add a processor step the subjects wouldn't expect. |

---

## 4. Privacy policy consistency (V3)

Before (Oct 21 2025 page) vs reality:

| Old policy said | Reality | Status |
|---|---|---|
| Discord OAuth is a "future feature" | Discord bot import of *third parties'* posts is live; Google OAuth is live and unmentioned | 🔴 fixed |
| Processors: CoinGecko, Yahoo, Alpha Vantage, **Tradier**, OpenAI/Anthropic/Gemini, **Neon** | Neon is dead (prod = own Postgres on DigitalOcean); DigitalOcean, Render, Stripe, Resend, Google, Discord, Alpaca, xAI, Groq, Together, Mistral missing; market-data vendors aren't processors of personal data | 🔴 fixed |
| "Encrypted database connections (PostgreSQL with SSL)" | DB is local to the droplet; SSL not verified | 🟡 removed claim |
| "Regular security audits" | one review on 2026-09-30 | 🟡 removed claim |
| "Export your research briefs and watchlist" | only journal CSV export exists | 🟡 corrected |
| "Request deletion of your account" — no route | no user path; admin delete is incomplete | 🔴 request path added; cascade still open (R6) |
| Nothing on journals, broker keys, retention, cookies, children, transfers, non-users | — | 🔴 added |

New page: `client/src/pages/privacy-policy.tsx`, "Last updated: September 30, 2026".
Items in the new text that depend on operator actions (must be true before relying on it):
- `privacy@quantedgelabs.net` must exist and be monitored (C1).
- "Usage analytics: currently kept without a fixed limit; we are introducing a maximum" (C3).
- "Server logs: rotated automatically" — true for winston; PM2 needs §10 step (C2).
- "Database backups … until they are replaced" — needs the backup rotation (C2).
- "Delete within 30 days" — operator must actually run the manual delete (C5).

---

## 5. Risks and mitigations

| # | Risk (specific) | L | I | Mitigation | Status | Owner |
|---|---|---|---|---|---|---|
| R1 | **Third-party Discord posts republished and ranked without notice or consent.** Commenters in a trader's thread are imported as notebook posts visible to every member; traders are ranked on a leaderboard; their screenshots are sent to Anthropic/Gemini. A trader who left the server, or a commenter, has no way to know or object. | M | H | Policy now discloses the import and gives an objection route. **Needed:** written opt-in from each named trader (store date + scope on `traders`); stop importing non-author replies (or strip author to "member"); a per-trader "hide/remove" admin action; confirm vendor no-training terms for vision. | Partial | Operator + [counsel] |
| R2 | **Signup emails in a community Discord channel.** `/api/waitlist/join` posted the full email to `DISCORD_WEBHOOK_URL`, the fallback several scanners and the weekly report also use. | H | M | Dedicated `DISCORD_WAITLIST_WEBHOOK_URL`, no fallback; domain-only by default; log line no longer carries the email. | **Done** (this commit) | Eng |
| R3 | **Users can't ask for deletion; policy promised it.** | H | M | Settings › Data & privacy › *Request account deletion* → queued request + operator email; admin list/resolve endpoints. | **Done** | Eng |
| R4 | **Emails and IPs in unrotated PM2 logs (≈370 MB) and unrotated backups; stale DB copies at Supabase/Neon.** A leaked log or old vendor project exposes every user's email. | M | M | Runbook §"Log & backup retention" (pm2-logrotate 14 files/20 MB, 30-day backup prune, delete Supabase/Neon projects). Longer term: log `userId`/email domain instead of email in the ~25 auth log lines. | Documented; operator to apply | Operator |
| R5 | **Analytics kept forever, anonymous visitors tracked without a notice or opt-out.** | M | L | Policy discloses it. Add a retention job (e.g. delete `page_views`/`user_activity_events` > 13 months) and, if EU/UK users, a consent choice. | Gap | Eng + [counsel] |
| R6 | **Admin `deleteUser` leaves data behind.** `storage.deleteUser` removes users, user_preferences, watchlist, trade_ideas only — `journal_trades`, `journal_notes` (incl. inline attachments), **`broker_connections` (encrypted keys)**, page_views, activity events, AI ledger/credits, paper portfolios, wallets, layouts, research history, reset tokens and `traders.linked_user_id` survive as orphans, yet the API answers "User and associated data deleted". | H | H | Until fixed, the operator must follow the manual runbook (§8). Fix: one transactional cascade over every `user_id`/`owner_id` table (list in §8), with a test. | Gap — **blocks honouring deletion requests at scale** | Eng |
| R7 | **No age gate.** Trading content + Stripe billing; policy says 18+, signup doesn't ask. | L | M | Add an "I am 18 or older" checkbox to signup and waitlist; ToS age clause. | Gap | Eng + [counsel] |
| R8 | **Raw broker CSV rows stored verbatim** (`raw_csv_row`) — may include account numbers or other broker columns the user didn't mean to share. | M | M | Whitelist columns before storing, or drop account-number-like columns; purge `raw_csv_row` after 90 days. | Gap | Eng |

**Residual risk after this commit:** Medium — dominated by R1 and R6.

---

## 6. Data subject rights

| Right | Can be exercised? | How |
|---|---|---|
| Access / copy | Partly | Journal CSV export in Settings; everything else by email (manual SQL). No full-account export. |
| Deletion | Request only | Settings › *Request account deletion* (new); operator deletes by hand (§8). Journal self-delete exists. |
| Correction | Partly | Name in Settings; journal rows editable; email not changeable in UI. |
| Portability | Partly | Journal CSV. |
| Objection / opt-out | By email | Analytics and Discord import — no self-serve toggle. |
| Non-users (imported traders/commenters) | By email | New policy section gives the route; no admin "remove this person" tool yet. |

---

## 7. Cross-border, children, security notes

- **Cross-border:** all hosting in the US (DigitalOcean NYC1; Render — confirm
  region). Non-US users and imported non-US traders → transfer. If GDPR/UK GDPR/NDPA
  apply, a transfer mechanism is required **[counsel]**.
- **Children:** see R7.
- **Security:** bcrypt passwords, AES-256-GCM broker keys (`secret-box.ts`),
  httpOnly session cookies, CSRF, rate limits, route guards. User-saved Discord
  webhook URLs are stored in plaintext (bearer secrets) — consider sealing them
  with `secret-box` too.

---

## 8. Runbook — handling an account-deletion request

Requests: `GET /api/admin/privacy-requests` (admin JWT). Email notice goes to
`PRIVACY_CONTACT_EMAIL` (else `ADMIN_EMAIL`) with request + user id only.

1. Verify the request came from the account holder (it was made from a signed-in
   session; for emailed requests, reply from the account's address).
2. Offer the journal CSV export if they haven't taken it.
3. Cancel any Stripe subscription (Stripe dashboard). Stripe keeps its own records.
4. Delete, in one transaction, every row for the user id `U` (until R6 is fixed in code):
   `journal_trades`, `journal_notes` (`owner_id = U`), `broker_connections`,
   `user_preferences`, `watchlist`, `symbol_notes`, `trade_ideas` (user-owned),
   `active_trades`, `paper_portfolios` (+ their positions/snapshots),
   `auto_lotto_preferences`, `tracked_wallets` (+ `wallet_holdings`,
   `wallet_transactions`, `wallet_alerts`), `research_history`, `daily_usage`,
   `ai_credit_balances`, `ai_usage_ledger`, `credit_transactions`, `page_views`,
   `user_activity_events` (**except** the `privacy_request` rows),
   `user_analytics_summary`, `user_login_history`, `user_page_layouts`,
   `user_navigation_layouts`, `password_reset_tokens`, `sessions` whose `sess`
   has `userId = U`; set `traders.linked_user_id = NULL`; delete `beta_waitlist`
   and `beta_invites` rows with their email; finally `users`.
5. `POST /api/admin/privacy-requests/:id {"status":"completed"}`; tell the user.
6. Backups roll off within 30 days (once C2 is in place).
Deadline: 30 days from the request (GDPR Art. 12(3) one month; CCPA §1798.130
45 days) `[model knowledge — verify]`.

---

## 9. Recommendation

**APPROVED WITH CONDITIONS** (proposed — a human signs this).

Conditions (operator unless noted):

- [ ] **C1** Create and monitor `privacy@quantedgelabs.net` (or change `PRIVACY_CONTACT` in `privacy-policy.tsx`); set `PRIVACY_CONTACT_EMAIL` on the droplet. _Before deploying the new policy._
- [ ] **C2** Apply the runbook log/backup retention steps on the droplet (pm2-logrotate, backup prune cron, Caddy log roll). _This week._
- [ ] **C3** Analytics retention job + decide on a consent choice for EU/UK visitors. _Eng, [counsel]._
- [ ] **C4** Delete the Supabase and Neon projects holding old DB copies once the droplet DB is confirmed complete.
- [ ] **C5** Fix R6 (delete cascade) before the first real deletion request is completed; until then use §8 by hand.
- [ ] **C6** Discord import: record each named trader's written OK (date, scope incl. AI screenshot reading and leaderboard); stop importing non-author comments or anonymise them; add a remove-trader-data admin action. _[counsel] on basis + Art. 14 notice._
- [ ] **C7** Set `DISCORD_WAITLIST_WEBHOOK_URL` to an operator-only channel if waitlist pings are still wanted (otherwise none are sent now).
- [ ] **C8** [counsel] Confirm which regimes apply (GDPR/UK GDPR, NDPA, US state laws), controller identity to name on the policy, and review the policy text.
- [ ] **C9** Accept DPAs with DigitalOcean, Render, Resend, Stripe and the AI vendors in use; confirm AI vendors' API no-training/retention terms.

**Sign-off:** _________________ (operator) · _________________ (counsel) · date ______

---

## 10. What changed in code with this PIA (2026-09-30)

| Change | Files |
|---|---|
| Privacy policy rewritten to match the code (collection, non-users/Discord import, processors, retention, security, cookies, rights, transfers, 18+, contact). "Last updated: September 30, 2026". Header comment flags counsel review. | `client/src/pages/privacy-policy.tsx` |
| Waitlist → Discord: dedicated `DISCORD_WAITLIST_WEBHOOK_URL` (no fallback to the general `DISCORD_WEBHOOK_URL`), `WAITLIST_DISCORD_DETAIL=domain` (default) \| `full` \| `off`; signup log carries email domain + waitlist id, not the address. | `server/privacy-redact.ts`, `server/routes.ts`, `scripts/test-privacy-redact.ts` |
| Account-deletion request: Settings › Data & privacy › *Request account deletion* (confirm step, shows pending/completed state) + privacy-policy link; `GET/POST /api/account/deletion-request`; admin `GET /api/admin/privacy-requests`, `POST /api/admin/privacy-requests/:id`. Stored as `user_activity_events` rows (`activity_type='privacy_request'`, no migration); operator emailed ids only via Resend. **Never deletes anything.** `/api/tracking/activity` now rejects client-sent `privacy_request` events. | `server/privacy-routes.ts`, `server/emailService.ts`, `server/routes.ts`, `shared/schema.ts`, `client/src/pages/settings.tsx` |
| Log/backup retention recommendation (pm2-logrotate, Caddy roll, backup prune, stale vendor copies). | `docs/RUNBOOK.md` |

New env vars: `DISCORD_WAITLIST_WEBHOOK_URL`, `WAITLIST_DISCORD_DETAIL`, `PRIVACY_CONTACT_EMAIL`.

---

## Next steps (operator picks)

1. **Draft the trader consent note** (C6) — a short message to Femi/Uzo/Ayo/Tommi etc. describing exactly what's imported and shown, to get a recorded yes.
2. **Implement the delete cascade** (R6/C5) — one function + test, replacing `storage.deleteUser`.
3. **Retention jobs** (R5/C3) — analytics 13-month prune, `raw_csv_row` 90-day purge, expired reset tokens.
4. **Take this to counsel** — the §0 applicability table, §3, and the policy text are the three things to ask about.
5. Something else.
