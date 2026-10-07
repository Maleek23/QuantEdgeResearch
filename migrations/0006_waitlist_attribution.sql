-- 0006 — Waitlist attribution + invite email status (fix/admin-session-waitlist, 2026-10-07).
-- Hand-written and idempotent. NOT applied anywhere by this branch. Per
-- docs/RUNBOOK.md: never `drizzle-kit push` production — back up, review, then
-- apply:
--
--   pg_dump "$DATABASE_URL" -Fc -f pre-0006.dump
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/0006_waitlist_attribution.sql
--
-- Until it is applied everything still works: server/waitlist-capture.ts
-- switches the attribution UPDATE off on the first 42703, and the admin
-- waitlist reads these columns best-effort (server/invite-mailer.ts readers).
-- Deliberately NOT in shared/schema.ts betaWaitlist/betaInvites: drizzle
-- selects every declared column, so declaring them before the ALTER would break
-- every waitlist read.

BEGIN;

-- Where a signup came from (first touch, kept by the client: client/src/lib/attribution.ts).
ALTER TABLE "beta_waitlist" ADD COLUMN IF NOT EXISTS "referrer" varchar(512);
ALTER TABLE "beta_waitlist" ADD COLUMN IF NOT EXISTS "landing_path" varchar(256);
ALTER TABLE "beta_waitlist" ADD COLUMN IF NOT EXISTS "utm" jsonb;

-- Approve → invite email (server/invite-mailer.ts). sent_at already exists.
ALTER TABLE "beta_invites" ADD COLUMN IF NOT EXISTS "email_error" text;
ALTER TABLE "beta_invites" ADD COLUMN IF NOT EXISTS "email_message_id" varchar(128);

COMMIT;
