/**
 * HTTP status for an options-flow read (audit 2026-10-01 P0 #27): a failed
 * read of the flow store is 503, so FLOW and /r/:symbol render an error
 * instead of "0 prints · today" — an outage is not a quiet tape.
 */
export function flowResponseStatus(r: { unavailable?: boolean }): 200 | 503 {
  return r.unavailable ? 503 : 200;
}
