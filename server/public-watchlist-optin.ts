/**
 * Public watchlist (/w, GET /api/public/watchlist) — audit 2026-10-01 P0 #3.
 *
 * The endpoint used to merge EVERY member's watchlist into one public page,
 * with no opt-in and no disclosure. It is now opt-in only and private by
 * default: only watchlist rows owned by a user listed in
 * PUBLIC_WATCHLIST_USER_IDS (comma-separated user ids — the operator's own
 * list, or members who asked to be listed) are published. Unset/empty → the
 * public page shows nothing. Rows with no owner (legacy, userId null) are
 * never published: whose they are cannot be established.
 */

export function publicWatchlistOwners(raw: string | undefined = process.env.PUBLIC_WATCHLIST_USER_IDS): Set<string> {
  return new Set(
    String(raw ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function filterOptedInWatchlist<T extends { userId?: string | null }>(rows: T[], owners: Set<string>): T[] {
  if (owners.size === 0) return [];
  return rows.filter((r) => !!r.userId && owners.has(r.userId));
}
