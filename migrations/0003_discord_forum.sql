-- 0003 — Discord forum import (feat/forum, 2026-09-29).
-- Hand-written and idempotent. NOT applied anywhere by this branch. Per
-- docs/RUNBOOK.md: never `drizzle-kit push` production — back up, review, then
-- apply BEFORE deploying the code that reads journal_notes.meta (Drizzle selects
-- every column by name, so the Notebook would error until the column exists):
--
--   pg_dump "$DATABASE_URL" -Fc -f pre-0003.dump
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/0003_discord_forum.sql
--
-- Mirrors shared/schema.ts journalNotes.meta. Imported forum posts are
-- journal_notes rows with source = 'discord', reason = 'discord_post', keyed by
-- the Discord message id (the existing uq_journal_notes_source_msg index makes
-- re-imports update instead of duplicate). Parsed trades are journal_trades
-- rows with broker = 'discord', broker_order_id = 'discord:<entry message id>'
-- (existing uq_journal_trades_source_key). New traders (leek, kasyah, ayo…)
-- are created only when the operator confirms them in the import preview.

BEGIN;

ALTER TABLE "journal_notes" ADD COLUMN IF NOT EXISTS "meta" jsonb;

-- The review list and the Notebook's Discord filter read by (owner, reason).
CREATE INDEX IF NOT EXISTS "idx_journal_notes_owner_reason" ON "journal_notes" ("owner_id", "reason");

COMMIT;
