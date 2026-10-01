-- 0005 — Desk admins: per-trader paper bot config (feat/desk-admins, 2026-10-01).
-- Hand-written and idempotent. NOT applied anywhere by this branch. Per
-- docs/RUNBOOK.md: never `drizzle-kit push` production — back up, review, then
-- apply. Mirrors shared/schema.ts deskBots. Until it is applied, the desk
-- portal shows "desk bots are not set up" and no desk bot runs; everything
-- else (portal, passcode, watchlist, assignment) works without it.
--
--   pg_dump "$DATABASE_URL" -Fc -f pre-0005.dump
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/0005_desk_admins.sql
--
-- The desk-admin ROLE needs no migration: it is the existing
-- traders.linked_user_id (one user ↔ one trader book). The desk bot's ledger
-- needs none either: ordinary paper_portfolios / paper_positions rows owned by
-- 'desk-bot:<slug>'.

BEGIN;

CREATE TABLE IF NOT EXISTS "desk_bots" (
  "trader_slug" varchar(32) PRIMARY KEY,
  "enabled" boolean NOT NULL DEFAULT false,
  "enabled_at" timestamp,
  "config" jsonb NOT NULL,
  "updated_by" varchar,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

COMMIT;
