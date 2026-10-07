/**
 * Trader self-setup — server-side pure helpers (no DB imports) so
 * scripts/test-trader-self-setup.ts can exercise them directly.
 * Rules: shared/trader-self-setup.ts. Routes: server/trader-self-setup-routes.ts.
 *
 * No migration. State that is not in the database:
 *   on/off           env TRADER_SELF_SETUP (default on; 'off' is a hard off the
 *                    hub cannot override) AND the hub switch, kept with the
 *                    per-book switches in the shared-state file
 *                    'trader-self-setup' (server/lib/shared-state.ts).
 *   failed attempts  in memory, per name: 5 per 15 min, then that name is
 *                    locked for the rest of the window (correct passcode too).
 */
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { isExcludedSelfSetupBook, selfSetupUsername, SELF_SETUP_MAX_FAILS, SELF_SETUP_WINDOW_MS, type SelfSetupBlock } from '@shared/trader-self-setup';

// ---------------------------------------------------------------------------
// On / off
// ---------------------------------------------------------------------------

export interface SelfSetupConfig {
  /** Hub switch: false = closed for everyone (the env can only close, never open past it). */
  enabled: boolean;
  /** Slugs the operator closed one by one. */
  closedBooks: string[];
}

export const DEFAULT_SELF_SETUP_CONFIG: SelfSetupConfig = { enabled: true, closedBooks: [] };

/** env TRADER_SELF_SETUP: anything but off/0/false/no/disabled is on (default on). */
export function selfSetupEnvOn(raw: string | undefined = process.env.TRADER_SELF_SETUP): boolean {
  if (raw === undefined || raw.trim() === '') return true;
  return !/^(off|0|false|no|disabled)$/i.test(raw.trim());
}

/** Extra slugs never offered (env TRADER_SELF_SETUP_EXCLUDE, comma-separated). */
export function selfSetupExtraExcluded(raw: string | undefined = process.env.TRADER_SELF_SETUP_EXCLUDE): string[] {
  return (raw ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function normalizeSelfSetupConfig(raw: unknown): SelfSetupConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const closed = Array.isArray(r.closedBooks) ? r.closedBooks.filter((x): x is string => typeof x === 'string').map((s) => s.toLowerCase()) : [];
  return { enabled: r.enabled !== false, closedBooks: Array.from(new Set(closed)).sort() };
}

export function selfSetupOpen(cfg: SelfSetupConfig, envOn: boolean = selfSetupEnvOn()): boolean {
  return envOn && cfg.enabled;
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

export interface SelfSetupBook { slug: string; name: string; linkedUserId: string | null; passcodeHash?: string | null }

/** Why a book is not offered, or null when it is. `usernameTaken` = a user already holds the slug's username. */
export function selfSetupBlock(
  book: SelfSetupBook,
  ctx: { cfg: SelfSetupConfig; extraExcluded?: readonly string[]; usernameTaken?: boolean },
): SelfSetupBlock | null {
  if (isExcludedSelfSetupBook(book, ctx.extraExcluded ?? [])) return 'excluded';
  if (book.linkedUserId) return 'linked';
  if (!book.passcodeHash || !book.passcodeHash.startsWith('$2')) return 'no_passcode';
  if (!selfSetupUsername(book.slug)) return 'bad_username';
  if (ctx.cfg.closedBooks.includes(book.slug.toLowerCase())) return 'book_off';
  if (ctx.usernameTaken) return 'username_taken';
  return null;
}

// ---------------------------------------------------------------------------
// Failed attempts per name
// ---------------------------------------------------------------------------

/**
 * Failures per name in a sliding window. Every name a request names is
 * counted — real or not — so a lockout says nothing about whether it exists.
 * The map is bounded: stale names are pruned, and past MAX_NAMES the oldest go.
 */
export class NameAttemptTracker {
  private fails = new Map<string, number[]>();
  constructor(private readonly max = SELF_SETUP_MAX_FAILS, private readonly windowMs = SELF_SETUP_WINDOW_MS, private readonly maxNames = 5000) {}

  private live(name: string, now: number): number[] {
    const arr = (this.fails.get(name) ?? []).filter((t) => now - t < this.windowMs);
    if (arr.length) this.fails.set(name, arr); else this.fails.delete(name);
    return arr;
  }

  isLocked(name: string, now: number = Date.now()): boolean {
    return this.live(name, now).length >= this.max;
  }

  /** Records a failure; true when this one reached the limit (the moment of lockout). */
  fail(name: string, now: number = Date.now()): boolean {
    const arr = [...this.live(name, now), now];
    this.fails.delete(name); // re-insert = most recent last (oldest-first eviction)
    this.fails.set(name, arr);
    if (this.fails.size > this.maxNames) {
      for (const k of Array.from(this.fails.keys())) {
        if (this.fails.size <= this.maxNames) break;
        this.fails.delete(k);
      }
    }
    return arr.length === this.max;
  }

  clear(name: string): void { this.fails.delete(name); }
  size(): number { return this.fails.size; }
}

// ---------------------------------------------------------------------------
// CSRF
// ---------------------------------------------------------------------------

/**
 * Double-submit check for the public self-setup writes. The global
 * validateCSRF exempts /api/auth/*, so these routes check it themselves: the
 * csrf_token cookie (set by server/csrf.ts on every response) must equal the
 * x-csrf-token header, compared in constant time. A cross-site form or fetch
 * can neither read the cookie nor set the header.
 */
export function csrfOk(req: Pick<Request, 'headers'> & { cookies?: Record<string, string> }): boolean {
  const cookie = req.cookies?.csrf_token;
  const header = req.headers['x-csrf-token'];
  if (typeof cookie !== 'string' || typeof header !== 'string' || cookie.length < 16 || cookie.length > 256) return false;
  const a = Buffer.from(cookie, 'utf8');
  const b = Buffer.from(header, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
