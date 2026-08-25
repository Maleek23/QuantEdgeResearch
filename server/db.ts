import { config } from "dotenv";
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

const { Pool } = pg;

// A local recovery target is deliberately separate from .env so switching away
// from an unavailable provider is reversible and never overwrites its URL.
config({ path: ".env.supabase", override: true });

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

/**
 * Use PostgreSQL's normal TCP driver instead of Neon's WebSocket protocol.
 * QuantEdge can now use Neon, Supabase, Railway, or local Postgres by replacing
 * DATABASE_URL — provider failures no longer lock the whole terminal to Neon.
 */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL)
    ? undefined
    : { rejectUnauthorized: false },
});
export const db = drizzle({ client: pool, schema });
