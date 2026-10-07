/**
 * /r/:symbol for a symbol no provider knows (audit 2026-10-01 P0 #19).
 *
 * /api/quotes/batch answers 200 {quotes:{}} for an unknown symbol, so the page
 * sat on "Loading quote…" forever beside a "Quiet" Quantinum read — a dead end
 * that looked real. A symbol is unknown when the quote request SUCCEEDED
 * without it and the daily-bars request finished with no bars. A provider
 * outage (request failed) is a different state and keeps its own message.
 */
export function isUnknownSymbol(s: {
  quoteSuccess: boolean;
  hasQuote: boolean;
  /** The bars request finished: success with N bars, or an HTTP status (e.g. 404). */
  barsCount: number | null;
  barsErrorStatus?: string | null;
}): boolean {
  const noHistory = s.barsCount === 0 || s.barsErrorStatus === '404';
  return s.quoteSuccess && !s.hasQuote && noHistory;
}
