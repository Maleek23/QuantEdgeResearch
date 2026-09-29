-- 0002 — Journals: traders, trader watchlists, journal notes, broker connections
-- (feat/journals, 2026-09-29). Hand-written and idempotent (IF NOT EXISTS / ON
-- CONFLICT) so it can be re-run safely. Per docs/RUNBOOK.md: never `drizzle-kit
-- push` production — back up, review, then apply:
--
--   pg_dump "$DATABASE_URL" -Fc -f pre-0002.dump
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/0002_journals_traders.sql
--
-- Mirrors shared/schema.ts: traders, traderWatchlistItems, journalNotes,
-- brokerConnections, and the uq_journal_trades_source_key index on journal_trades.

BEGIN;

CREATE TABLE IF NOT EXISTS "traders" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" varchar(32) NOT NULL,
  "name" text NOT NULL,
  "handle" text,
  "source" text,
  "discord_channel_id" text,
  "discord_author_id" text,
  "linked_user_id" varchar,
  "created_by" varchar,
  "created_at" timestamp DEFAULT now(),
  CONSTRAINT "traders_slug_unique" UNIQUE ("slug")
);

-- Seed the four people the operator named. Handle/source stay NULL until known
-- (set them from the journal's trader settings) — nothing is guessed here.
INSERT INTO "traders" ("slug", "name") VALUES
  ('femi', 'Femi'),
  ('malik', 'Malik'),
  ('uzo', 'Uzo'),
  ('bean', 'Bean')
ON CONFLICT ("slug") DO NOTHING;

CREATE TABLE IF NOT EXISTS "trader_watchlist_items" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "trader_id" varchar NOT NULL,
  "symbol" varchar(24) NOT NULL,
  "note" text,
  "added_by" varchar,
  "added_at" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_trader_watchlist_trader" ON "trader_watchlist_items" ("trader_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_trader_watchlist_symbol" ON "trader_watchlist_items" ("trader_id", "symbol");

CREATE TABLE IF NOT EXISTS "journal_notes" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" varchar NOT NULL,
  "symbols" text[],
  "day" text NOT NULL,
  "posted_at" text NOT NULL,
  "body" text NOT NULL,
  "attachments" jsonb,
  "source" text DEFAULT 'manual' NOT NULL,
  "source_message_id" text,
  "reason" text,
  "created_at" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_journal_notes_owner_day" ON "journal_notes" ("owner_id", "day");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_journal_notes_source_msg" ON "journal_notes" ("owner_id", "source", "source_message_id");

CREATE TABLE IF NOT EXISTS "broker_connections" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL,
  "broker" text NOT NULL,
  "paper" boolean DEFAULT true NOT NULL,
  "key_id_enc" text NOT NULL,
  "secret_enc" text NOT NULL,
  "key_hint" varchar(8),
  "last_sync_at" timestamp,
  "last_sync_result" jsonb,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_broker_connections_user_broker" ON "broker_connections" ("user_id", "broker");

-- Idempotent Alpaca / Discord re-imports: one row per (owner, source key).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_journal_trades_source_key"
  ON "journal_trades" ("user_id", "broker_order_id")
  WHERE broker IN ('alpaca', 'discord');

COMMIT;

-- ── OPERATOR STEP (manual, once) ─────────────────────────────────────────────
-- Before this branch, every /api/journal route keyed rows by req.user?.id, which
-- the session login never sets — so in production EVERY user's journal rows were
-- written under user_id = 'default' (one shared journal). The routes now key by
-- the signed-in user's id. Existing rows stay under 'default' until reassigned.
-- If the operator is the only person who has journaled, assign them:
--
--   SELECT count(*) FROM journal_trades WHERE user_id = 'default';
--   UPDATE journal_trades SET user_id = '<operator users.id>' WHERE user_id = 'default';
--
-- If others have journaled too, split by import_batch_id / created_at first.
