-- 0004 — Squeeze radar forward log (feat/squeeze, 2026-09-29).
-- Hand-written and idempotent. NOT applied anywhere by this branch. Per
-- docs/RUNBOOK.md: never `drizzle-kit push` production — back up, review, then
-- apply. The code works without it (it logs to .cache/squeeze-radar/log.jsonl
-- and warns once that the table is missing), so apply order does not matter.
--
--   pg_dump "$DATABASE_URL" -Fc -f pre-0004.dump
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/0004_squeeze_radar_log.sql
--
-- Mirrors shared/schema.ts squeezeRadarLog. Append-only by convention:
-- server/squeeze-radar.ts inserts ON CONFLICT DO NOTHING and never updates, so
-- each session's radar read is preserved for forward scoring
-- (docs/GAMMA_SQUEEZE.md §Validation).

BEGIN;

CREATE TABLE IF NOT EXISTS "squeeze_radar_log" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "session_date" varchar(10) NOT NULL,
  "slot" varchar(8) NOT NULL,
  "symbol" varchar(20) NOT NULL,
  "score" integer NOT NULL,
  "coverage" integer NOT NULL,
  "stage" varchar(12) NOT NULL,
  "spot" double precision,
  "components" jsonb,
  "inputs" jsonb,
  "logged_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_squeeze_radar_log_day_slot_symbol" ON "squeeze_radar_log" ("session_date", "slot", "symbol");
CREATE INDEX IF NOT EXISTS "idx_squeeze_radar_log_symbol_date" ON "squeeze_radar_log" ("symbol", "session_date");

COMMIT;
