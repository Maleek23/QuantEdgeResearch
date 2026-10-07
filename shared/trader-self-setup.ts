/**
 * Trader self-setup (docs/DESK_ADMINS.md §Trader self-setup) — browser-safe rules
 * shared by /trader-setup, the admin hub and the server.
 *
 * A trader whose book already has a passcode (set by the operator, handed out
 * out-of-band) can create their own login from the sign-in page:
 *
 *   1. pick your name     books with a passcode and NO linked account yet
 *   2. enter the passcode the book's passcode (bcrypt, traders.passcode_hash)
 *   3. choose a password  → account (username = the book's slug), desk admin of
 *                           that book, fresh session, /desk
 *
 * One-time: once a book has a linked account, self-setup for that name is
 * closed — the trader signs in normally; a forgotten password is the
 * operator's regenerate in /admin.
 */
import { normalizeUsername } from './trader-accounts';

export const TRADER_SETUP_PATH = '/trader-setup';

/** The ONE answer for a wrong passcode, an unknown name, a closed name: nothing to learn. */
export const SELF_SETUP_ERROR = "That name and passcode don't open an account setup. Check the passcode with the operator.";
export const SELF_SETUP_LOCKED_ERROR = 'Too many attempts for this name. Try again in 15 minutes.';
export const SELF_SETUP_OFF_ERROR = 'Self-setup is turned off. Ask the operator for a setup link.';

/** Failed passcode attempts per name before a lockout, and the window both count in. */
export const SELF_SETUP_MAX_FAILS = 5;
export const SELF_SETUP_WINDOW_MS = 15 * 60_000;

/**
 * Books that are never offered: the operator's own book and system books
 * (bots, NEXUS, the desk). Matched on whole words of the slug and the name, so
 * "malik", "Leek's book", "quant-bot", "NEXUS desk" are all out.
 */
const EXCLUDED_WORDS = new Set([
  'mine', 'me', 'my', 'malik', 'leek', 'operator', 'owner', 'admin', 'root', 'system',
  'bot', 'bots', 'quantbot', 'nexus', 'desk', 'quant', 'quantinum', 'quantedge', 'platform', 'house', 'paper',
]);

function words(s: unknown): string[] {
  return typeof s === 'string' ? s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean) : [];
}

export function isExcludedSelfSetupBook(book: { slug: string; name: string }, extraSlugs: readonly string[] = []): boolean {
  const slug = book.slug.toLowerCase();
  if (extraSlugs.map((s) => s.trim().toLowerCase()).includes(slug)) return true;
  return [...words(book.slug), ...words(book.name)].some((w) => EXCLUDED_WORDS.has(w));
}

/** The username a self-set-up account gets: the book's slug, if it is a valid, unreserved username. */
export function selfSetupUsername(slug: unknown): string | null {
  return typeof slug === 'string' ? normalizeUsername(slug) : null;
}

export type SelfSetupBlock =
  | 'no_passcode'      // nothing to prove who they are
  | 'linked'           // already has an account — closed for good
  | 'excluded'         // operator / bot / NEXUS book
  | 'bad_username'     // slug can't be a username (reserved / shape)
  | 'username_taken'   // someone already holds that username
  | 'book_off';        // the operator closed self-setup for this book

export const SELF_SETUP_BLOCK_LABEL: Record<SelfSetupBlock, string> = {
  no_passcode: 'No passcode set',
  linked: 'Has an account',
  excluded: 'Operator / system book',
  bad_username: 'Slug is not a usable username',
  username_taken: 'Username already taken',
  book_off: 'Turned off',
};
