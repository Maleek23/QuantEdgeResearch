-- 0007 — Intake profile + onboarding progress (feat/intake-onboarding, 2026-10-07).
-- Hand-written and idempotent. NOT applied anywhere by this branch. Per
-- docs/RUNBOOK.md: never `drizzle-kit push` production — back up, review, then
-- apply:
--
--   pg_dump "$DATABASE_URL" -Fc -f pre-0007.dump
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/0007_intake_onboarding.sql
--
-- Until it is applied everything still works: server/intake-store.ts switches
-- the DB path off on the first 42703 and keeps the data in
-- .cache/shared/intake-profiles.json and .cache/shared/onboarding-progress.json.
-- After applying, reads merge both (DB wins for profiles, newest wins for
-- progress), so nothing captured before the migration is lost.
-- Deliberately NOT in shared/schema.ts (drizzle selects every declared column).
--
-- The roadmap (/admin/roadmap, /updates) needs no migration: .cache/shared/roadmap.json.

BEGIN;

-- Multi-step waitlist / "Complete your profile" answers (shape: shared/intake.ts IntakeProfile).
ALTER TABLE "beta_waitlist" ADD COLUMN IF NOT EXISTS "profile" jsonb;

-- Tours finished, Start-here checklist, Show tips (shape: shared/onboarding.ts OnboardingProgress).
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "onboarding" jsonb;

COMMIT;
