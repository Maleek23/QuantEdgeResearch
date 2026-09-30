/**
 * A user's watchlist order. Stored as one row in user_page_layouts
 * (pageId WATCHLIST_ORDER_PAGE, widgets = [{ id: <watchlist row id>, … }]) so
 * reordering needs no schema change. Rows not in the saved order (added
 * since) keep the server's newest-first order after the ordered ones.
 */
export const WATCHLIST_ORDER_PAGE = '__watchlist:order';
export const MAX_WATCHLIST_ORDER = 500;

export function applyWatchlistOrder<T extends { id: string }>(items: readonly T[], ids: readonly string[]): T[] {
  if (!ids.length) return [...items];
  const rank = new Map(ids.map((id, i) => [id, i]));
  return items
    .map((x, n) => [x, n] as const)
    .sort((a, b) => (rank.get(a[0].id) ?? ids.length + a[1]) - (rank.get(b[0].id) ?? ids.length + b[1]))
    .map(([x]) => x);
}

/** Clean a client-sent order: strings only, deduped, capped, and only ids the user owns. */
export function sanitizeWatchlistOrder(raw: unknown, owned: ReadonlySet<string>): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (typeof v !== 'string' || seen.has(v) || !owned.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= MAX_WATCHLIST_ORDER) break;
  }
  return out;
}
